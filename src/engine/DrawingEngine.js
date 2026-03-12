import { TrendlinePrimitive } from '../primitives/TrendlinePrimitive.js';
import { RectanglePrimitive } from '../primitives/RectanglePrimitive.js';

const MSG = {
  idle: 'Click a shape to select · Drag handle to resize · Drag body to move',
  drawFirst: 'Click to place first anchor point',
  drawSecond: 'Click to place second point · Esc to cancel',
  placed: 'Shape placed · Click to draw another · Esc for select mode',
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

    this.tools = new Map();   // id → { id, type, prim }
    this.activePrim = null;
    this.selectedId = null;
    this.drag = null;
  }

  // chart and series are a single { chart, series } pair
  init(chart, series) {
    this.chart = chart;
    this.series = series;
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

  handleMouseDown(x, y) {
    if (!this.chart || !this.series) return;

    /* ── DRAW MODE ── */
    if (this.mode === 'draw-trendline' || this.mode === 'draw-rect') {
      const tp = this._toTP(x, y);
      if (tp.time == null || tp.price == null) return;

      if (!this.activePrim) {
        const prim = this.mode === 'draw-trendline'
          ? new TrendlinePrimitive(tp)
          : new RectanglePrimitive(tp);
        prim._preview = true;
        this.series.attachPrimitive(prim);
        this.activePrim = prim;
        this.status = MSG.drawSecond;
      } else {
        this.activePrim.finalize(tp);
        const { id, type } = this.activePrim;
        this.tools.set(id, {
          id, type, prim: this.activePrim,
          // Store unsnapped originals so remapTimes always snaps from source of truth
          origP1: { ...this.activePrim._p1 },
          origP2: { ...this.activePrim._p2 },
        });
        this.activePrim = null;
        this.status = MSG.placed;
        this._forceRedraw();
      }
      this._emit();
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

    if (this.drag) {
      this._applyDrag(x, y);
      return;
    }

    if (this.mode !== 'select') return;
    this._updateHover(x, y);
  }

  handleMouseUp() {
    if (!this.drag) return;
    const id = this.drag.toolId;
    const tool = this.tools.get(id);
    // Persist final edited position as new originals so next remapTimes
    // snaps from where the user intentionally placed the drawing
    if (tool) {
      tool.origP1 = { ...tool.prim._p1 };
      tool.origP2 = { ...tool.prim._p2 };
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
    this._emit();
  }

  deleteAll() {
    for (const [, tool] of this.tools) this.series?.detachPrimitive(tool.prim);
    this._forceRedraw();
    this.tools.clear();
    this.selectedId = null;
    this.drag = null;
    this.status = MSG.cleared;
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

  // ── Private ───────────────────────────────────────────────────

  _toTP(x, y) {
    return {
      time: this.chart?.timeScale().coordinateToTime(x) ?? null,
      price: this.series?.coordinateToPrice(y) ?? null,
    };
  }

  _lockChart() { this.chart?.applyOptions({ handleScroll: false, handleScale: false }); }
  _unlockChart() {
    if (this.mode === 'select')
      this.chart?.applyOptions({ handleScroll: true, handleScale: true });
  }

  _forceRedraw() { this.series?.applyOptions({}); }

  _deselectAll() {
    for (const [, tool] of this.tools) {
      tool.prim.setSelected(false);
      tool.prim.setHoverPart(null);
    }
    this.selectedId = null;
  }

  _hitTestAll(x, y) {
    // Selected shape always gets priority
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
        case 'body':
          left += dx; right += dx; top += dy; bottom += dy; break;
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

  // Call this after every setData() with the new aggregated dataset.
  // Snaps each drawing's time coords to the nearest bar in the new scale.
  // Always reads from origP1/origP2 (not current prim values) so repeated
  // timeframe switches never drift from the user's intended position.
  remapTimes(aggregatedData) {
    if (!aggregatedData?.length) return;
    const times = aggregatedData.map(b => b.time);

    const snap = (t) => {
      let best = times[0];
      let bestDist = Math.abs(t - times[0]);
      for (let i = 1; i < times.length; i++) {
        const d = Math.abs(t - times[i]);
        if (d < bestDist) { bestDist = d; best = times[i]; }
        // Early exit: times are sorted ascending, so once dist grows we're past the closest
        if (times[i] > t && d > bestDist) break;
      }
      return best;
    };

    for (const [, tool] of this.tools) {
      const snappedP1 = { price: tool.origP1.price, time: snap(tool.origP1.time) };
      const snappedP2 = { price: tool.origP2.price, time: snap(tool.origP2.time) };
      tool.prim.updateBoth(snappedP1, snappedP2);
    }
    this._forceRedraw();
  }

}