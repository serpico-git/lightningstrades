import { TrendlinePrimitive } from '../primitives/TrendlinePrimitive.js';
import { RectanglePrimitive } from '../primitives/RectanglePrimitive.js';

const MSG = {
  idle: 'Click a shape to select · Drag handle to resize · Drag body to move',
  drawFirst: 'Press and drag to draw',
  drawSecond: 'Release to place · Esc to cancel',
  placed: 'Shape placed · Draw another or Esc for select mode',
  deleted: 'Shape deleted',
  cleared: 'All shapes cleared',
  selected: (type, id) => `${type === 'trendline' ? 'Trendline' : 'Rectangle'} #${id} selected`,
  updated: (id) => `Shape #${id} updated`,
  dragging: (part) => part === 'body' ? 'Moving — release to place' : `Resizing [${part}]`,
};

function cursorForPart(type, part) {
  if (type === 'trendline') return (part === 'p1' || part === 'p2') ? 'crosshair' : 'grab';
  if (part === 'tl' || part === 'br') return 'nwse-resize';
  if (part === 'tr' || part === 'bl') return 'nesw-resize';
  if (part === 'top' || part === 'bottom') return 'ns-resize';
  if (part === 'left' || part === 'right') return 'ew-resize';
  return 'grab';
}

export class DrawingEngine {
  constructor() {
    this.chart = null;
    this.series = null;
    this.onUpdate = null;
    this.mode = 'select';
    this.cursor = 'default';
    this.status = MSG.idle;
    this.tools = new Map();   // id → { id, type, prim, origP1, origP2 }
    this.activePrim = null;
    this.selectedId = null;
    this.drag = null;

    // In constructor, add:
    this.onDrawingPlaced = null;   // fired when drawing finalizes → Page1 resets both engines

  }

  init(chart, series) {
    this.chart = chart;
    this.series = series;
    console.log('[Engine] init — chart and series set');
  }

  setMode(mode) {
    if (this.activePrim) {
      this.series?.detachPrimitive(this.activePrim);
      this._forceRedraw();
      this.activePrim = null;
    }
    this.mode = mode;
    this.cursor = mode === 'select' ? 'default' : 'crosshair';
    this.status = mode === 'select' ? MSG.idle : MSG.drawFirst;
    mode === 'select' ? this._unlockChart() : this._lockChart();
    this._emit();
  }

  // Drag-to-draw model:
  // mouseDown = anchor 1
  // mouseMove = live preview
  // mouseUp   = anchor 2 (finalize at preview position)
  handleMouseDown(x, y) {
    if (!this.chart || !this.series) return;

    /* ── DRAW MODE ── */
    if (this.mode === 'draw-trendline' || this.mode === 'draw-rect') {
      if (!this.activePrim) {
        const tp = this._toTP(x, y);
        if (tp.time == null || tp.price == null) return;
        const prim = this.mode === 'draw-trendline'
          ? new TrendlinePrimitive(tp)
          : new RectanglePrimitive(tp);
        prim._preview = true;
        this.series.attachPrimitive(prim);
        this.activePrim = prim;
        this.status = MSG.drawSecond;
        this._emit();
      }
      return;
    }

    /* ── SELECT MODE ── */
    const hit = this._hitTestAll(x, y);
    if (hit) {
      const { toolEntry, part } = hit;
      if (toolEntry.id !== this.selectedId) {
        this._deselectAll();
        toolEntry.prim.setSelected(true);
        this.selectedId = toolEntry.id;
      }
      this._startDrag(toolEntry, part, x, y);
      this.cursor = part === 'body' ? 'grabbing' : cursorForPart(toolEntry.type, part);
      this.status = MSG.dragging(part);
    } else {
      this._deselectAll();
      this.cursor = 'default';
      this.status = MSG.idle;
    }
    this._emit();
  }

  handleMouseMove(x, y) {
    if (!this.chart || !this.series) return;
    if (this.activePrim) {
      const tp = this._toTP(x, y);
      if (tp.time != null && tp.price != null) this.activePrim.liveUpdate(tp);
      return;
    }
    if (this.drag) { this._applyDrag(x, y); return; }
    if (this.mode !== 'select') return;
    this._updateHover(x, y);
  }

  handleMouseUp() {
    /* ── Finalize drawing ── */
    if (this.activePrim) {
      const p1 = this.activePrim._p1;
      const p2 = { ...this.activePrim._p2 };

      // Reject trivial tap-without-drag
      if (p1.time === p2.time && p1.price === p2.price) {
        // REPLACE WITH (clean version):
        this.series?.detachPrimitive(this.activePrim);
        this._forceRedraw();
        this.activePrim = null;
        this.status = MSG.drawFirst;     // stay in draw mode, user just tapped without dragging
        this._emit();
        return;
      }

      this.activePrim.finalize(p2);
      const { id, type } = this.activePrim;
      this.tools.set(id, {
        id, type,
        prim: this.activePrim,
        // origP1/origP2 are ABSOLUTE timestamps — never remapped after this
        origP1: { ...this.activePrim._p1 },
        origP2: { ...this.activePrim._p2 },
      });
      console.log(
        `[Engine] #${id} finalized | p1: ${new Date(this.activePrim._p1.time * 1000).toISOString()}` +
        ` | p2: ${new Date(p2.time * 1000).toISOString()}`
      );

      this.activePrim = null;
      this.mode = 'select';
      this.cursor = 'default';
      this.status = MSG.placed;
      this._unlockChart();
      this._forceRedraw();
      this._emit();

      this.onDrawingPlaced?.();   // ← ADD THIS

      return;
    }

    /* ── Finalize select-mode drag ── */
    if (!this.drag) return;
    const id = this.drag.toolId;
    const tool = this.tools.get(id);
    if (tool) {
      // Save the user's new intended position as the new originals
      tool.origP1 = { ...tool.prim._p1 };
      tool.origP2 = { ...tool.prim._p2 };
      console.log(`[Engine] #${id} moved | p1: ${new Date(tool.origP1.time * 1000).toISOString()} | p2: ${new Date(tool.origP2.time * 1000).toISOString()}`);
    }
    this.drag = null;
    this._unlockChart();
    this.cursor = 'default';
    this.status = MSG.updated(id);
    this._emit();
  }

  deleteSelected() {
    if (this.selectedId == null) return;
    const tool = this.tools.get(this.selectedId);
    if (!tool) return;
    this.series?.detachPrimitive(tool.prim);
    this._forceRedraw();
    this.tools.delete(this.selectedId);
    this.selectedId = null;
    this.drag = null;
    this.status = MSG.deleted;
    console.log(`[Engine] deleted #${this.selectedId}`);
    this._emit();
  }

  deleteAll() {
    for (const [, tool] of this.tools) this.series?.detachPrimitive(tool.prim);
    this._forceRedraw();
    this.tools.clear();
    this.selectedId = null;
    this.drag = null;
    this.status = MSG.cleared;
    console.log('[Engine] all drawings cleared');
    this._emit();
  }

  destroy() {
    this.chart = null;
    this.series = null;
    this.tools.clear();
    this.activePrim = null;
    this.selectedId = null;
    this.drag = null;
  }

  // ── Session cache persistence ────────────────────────────────

  // Returns plain JSON-safe array. Call after remapTimes to keep cache current.
  exportState() {
    const result = [];
    for (const [, tool] of this.tools) {
      result.push({
        type: tool.type,
        origP1: { ...tool.origP1 },
        origP2: { ...tool.origP2 },
      });
    }
    return result;
  }

  // Restores drawings from a previously exported state.
  // Must be called AFTER init() and AFTER setData() so the time scale is ready.
  importState(drawings) {
    if (!drawings?.length || !this.series) return;
    console.log(`[Engine] importing ${drawings.length} drawing(s) from session cache`);
    for (const d of drawings) {
      try {
        const prim = d.type === 'trendline'
          ? new TrendlinePrimitive(d.origP1)
          : new RectanglePrimitive(d.origP1);
        this.series.attachPrimitive(prim);
        prim.finalize(d.origP2);
        this.tools.set(prim.id, {
          id: prim.id,
          type: d.type,
          prim,
          origP1: { ...d.origP1 },
          origP2: { ...d.origP2 },
        });
      } catch (err) {
        console.error('[Engine] importState failed for drawing:', d, err);
      }
    }
    this._forceRedraw();
    this._emit();
  }

  // ── Key design: remapTimes does NOT move drawings ────────────
  remapTimes(aggregatedData) {
    if (!aggregatedData?.length || !this.tools.size) return;

    const realTimes = aggregatedData.map(b => b.time);
    const lastRealTime = realTimes[realTimes.length - 1];

    // Reconstruct whitespace timestamps using same formula as buildWithWhitespace.
    // Future drawing coordinates must snap to these — they are the ONLY future
    // timestamps registered in LWC's time index after each setData call.
    // Formula: wsCount = max(30, ceil(54000 / spacingSeconds))
    // matches buildWithWhitespace's: max(30, ceil(900 / multiplier))
    let allTimes = realTimes;
    if (realTimes.length >= 2) {
      const spacing = lastRealTime - realTimes[realTimes.length - 2];
      const wsCount = Math.max(30, Math.ceil(54000 / spacing));
      const wsTimes = Array.from(
        { length: wsCount },
        (_, i) => lastRealTime + (i + 1) * spacing
      );
      allTimes = [...realTimes, ...wsTimes];
    }

    // Binary search snap — reads from origP1/origP2 always, never from prim state.
    // No drift possible across repeated timeframe switches.
    const snapToNearest = (t, times) => {
      let lo = 0, hi = times.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] < t) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0 && Math.abs(times[lo - 1] - t) <= Math.abs(times[lo] - t)) {
        return times[lo - 1];
      }
      return times[lo];
    };

    for (const [, tool] of this.tools) {
      // Past/present timestamps → snap to nearest real bar boundary
      // Future timestamps → snap to nearest whitespace bar boundary
      // Both cases guaranteed to be registered in LWC's time index
      const p1Times = tool.origP1.time > lastRealTime ? allTimes : realTimes;
      const p2Times = tool.origP2.time > lastRealTime ? allTimes : realTimes;

      tool.prim.updateBoth(
        { time: snapToNearest(tool.origP1.time, p1Times), price: tool.origP1.price },
        { time: snapToNearest(tool.origP2.time, p2Times), price: tool.origP2.price },
      );
    }

    requestAnimationFrame(() => this._forceRedraw());
  }


  // ── Private ──────────────────────────────────────────────────

  _toTP(x, y) {
    const ts = this.chart?.timeScale();
    const sc = this.series;
    if (!ts || !sc) return { time: null, price: null };
    const time = ts.coordinateToTime(x) ?? null;
    const price = sc.coordinateToPrice(y) ?? null;
    // Uncomment to debug future zone:
    // console.log('[Engine] _toTP x:', x.toFixed(0), '→ time:', time, 'price:', price?.toFixed(2));
    return { time, price };
  }

  _lockChart() { this.chart?.applyOptions({ handleScroll: false, handleScale: false }); }
  _unlockChart() {
    if (this.mode === 'select')
      this.chart?.applyOptions({ handleScroll: true, handleScale: true });
  }
  // _forceRedraw() { this.series?.applyOptions({}); }
  // chart.applyOptions({}) triggers a full repaint including all primitives.
  // series.applyOptions({}) is unreliable for this in LWC v5.
  _forceRedraw() { this.chart?.applyOptions({}); }

  _deselectAll() {
    for (const [, tool] of this.tools) {
      tool.prim.setSelected(false);
      tool.prim.setHoverPart(null);
    }
    this.selectedId = null;
  }

  _hitTestAll(x, y) {
    if (this.selectedId) {
      const sel = this.tools.get(this.selectedId);
      if (sel) {
        const part = sel.prim.hitTest(x, y);
        if (part) return { toolEntry: sel, part };
      }
    }
    for (const [, tool] of this.tools) {
      if (tool.id === this.selectedId) continue;
      const part = tool.prim.hitTest(x, y);
      if (part) return { toolEntry: tool, part };
    }
    return null;
  }

  _updateHover(x, y) {
    const hit = this._hitTestAll(x, y);
    for (const [, tool] of this.tools) tool.prim.setHoverPart(null);
    if (hit) hit.toolEntry.prim.setHoverPart(hit.part);
    const newCursor = hit ? cursorForPart(hit.toolEntry.type, hit.part) : 'default';
    if (newCursor !== this.cursor) { this.cursor = newCursor; this._emit(); }
  }

  _startDrag(toolEntry, part, x, y) {
    this._lockChart();
    const { prim } = toolEntry;
    if (toolEntry.type === 'trendline') {
      const px = prim.endpointPixels();
      this.drag = {
        toolId: toolEntry.id, primType: 'trendline', part,
        startX: x, startY: y,
        orig: px ? { p1x: px.p1.x, p1y: px.p1.y, p2x: px.p2.x, p2y: px.p2.y } : null,
        otherP1: { ...prim._p1 },
        otherP2: { ...prim._p2 },
      };
    } else {
      const nb = prim.normPixels();
      this.drag = {
        toolId: toolEntry.id, primType: 'rectangle', part,
        startX: x, startY: y,
        orig: nb ? { ...nb } : null,
      };
    }
  }

  _applyDrag(x, y) {
    const d = this.drag;
    if (!d) return;
    const tool = this.tools.get(d.toolId);
    if (!tool) return;
    const ts = this.chart?.timeScale();
    const sc = this.series;
    if (!ts || !sc) return;

    let newP1 = null, newP2 = null;

    if (d.primType === 'trendline') {
      if (d.part === 'p1' || d.part === 'p2') {
        const tp = this._toTP(x, y);
        if (tp.time == null || tp.price == null) return;
        newP1 = d.part === 'p1' ? tp : { ...d.otherP1 };
        newP2 = d.part === 'p2' ? tp : { ...d.otherP2 };
      } else if (d.part === 'body' && d.orig) {
        const dx = x - d.startX, dy = y - d.startY;
        const t1 = ts.coordinateToTime(d.orig.p1x + dx);
        const p1 = sc.coordinateToPrice(d.orig.p1y + dy);
        const t2 = ts.coordinateToTime(d.orig.p2x + dx);
        const p2 = sc.coordinateToPrice(d.orig.p2y + dy);
        if (t1 == null || p1 == null || t2 == null || p2 == null) return;
        newP1 = { time: t1, price: p1 };
        newP2 = { time: t2, price: p2 };
      }
    } else if (d.primType === 'rectangle' && d.orig) {
      let { left, right, top, bottom } = d.orig;
      const dx = x - d.startX, dy = y - d.startY;
      switch (d.part) {
        case 'tl': left = x; top = y; break;
        case 'tr': right = x; top = y; break;
        case 'bl': left = x; bottom = y; break;
        case 'br': right = x; bottom = y; break;
        case 'top': top = y; break;
        case 'bottom': bottom = y; break;
        case 'left': left = x; break;
        case 'right': right = x; break;
        case 'body': left += dx; right += dx; top += dy; bottom += dy; break;
        default: return;
      }
      const t1 = ts.coordinateToTime(left);
      const t2 = ts.coordinateToTime(right);
      const pTop = sc.coordinateToPrice(top);
      const pBot = sc.coordinateToPrice(bottom);
      if (t1 == null || t2 == null || pTop == null || pBot == null) return;
      newP1 = { time: Math.min(t1, t2), price: Math.max(pTop, pBot) };
      newP2 = { time: Math.max(t1, t2), price: Math.min(pTop, pBot) };
    }

    if (newP1 && newP2) tool.prim.updateBoth(newP1, newP2);
  }

  _emit() {
    this.onUpdate?.({
      mode: this.mode,
      cursor: this.cursor,
      status: this.status,
      count: this.tools.size,
      selectedId: this.selectedId,
    });
  }
}



