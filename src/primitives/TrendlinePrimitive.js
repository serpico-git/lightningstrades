import { distPointToSegment } from '../utils/geometry.js';

// ─── IDs ──────────────────────────────────────────────────────────
let _uid = 0;

// ─── Colors ───────────────────────────────────────────────────────
const C = {
  normal:   '#4FC3F7',
  hovered:  '#7DD8FF',
  selected: '#F5C518',
  preview:  '#6EE7F5',
  bg:       '#07090F',
};

// ══════════════════════════════════════════════════════════════════
//  ISeriesPrimitivePaneRenderer
// ══════════════════════════════════════════════════════════════════
class TrendlineRenderer {
  constructor(prim) { this._p = prim; }

  draw(target) {
    const p = this._p;
    if (!p._chart || !p._series) return;

    const ts = p._chart.timeScale();
    const sc = p._series;
    const x1 = ts.timeToCoordinate(p._p1.time);
    const y1 = sc.priceToCoordinate(p._p1.price);
    const x2 = ts.timeToCoordinate(p._p2.time);
    const y2 = sc.priceToCoordinate(p._p2.price);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return;

    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr }) => {
      const dpr = Math.min(hpr, vpr);
      const bx1 = x1 * hpr, by1 = y1 * vpr;
      const bx2 = x2 * hpr, by2 = y2 * vpr;

      const col = p._preview ? C.preview : p._selected ? C.selected : p._hovered ? C.hovered : C.normal;

      ctx.save();

      // ── Line ──
      ctx.beginPath();
      ctx.moveTo(bx1, by1);
      ctx.lineTo(bx2, by2);
      ctx.strokeStyle = col;
      ctx.lineWidth   = (p._selected ? 2.5 : 2) * dpr;
      ctx.shadowColor = col;
      ctx.shadowBlur  = (p._selected ? 14 : p._hovered ? 8 : 5) * dpr;
      if (p._selected) ctx.setLineDash([7 * dpr, 3.5 * dpr]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // ── Endpoint handles ──
      const drawHandle = (ex, ey, part) => {
        const isHot = p._hoverPart === part;
        const r     = (isHot ? 7 : p._selected ? 5.5 : 4) * dpr;

        if (isHot) {
          ctx.beginPath();
          ctx.arc(ex, ey, r + 5 * dpr, 0, Math.PI * 2);
          ctx.strokeStyle = col + '44';
          ctx.lineWidth   = 2 * dpr;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(ex, ey, r, 0, Math.PI * 2);
        ctx.fillStyle   = isHot ? '#FFFFFF' : col;
        ctx.strokeStyle = C.bg;
        ctx.lineWidth   = 1.5 * dpr;
        ctx.shadowColor = col;
        ctx.shadowBlur  = isHot ? 12 * dpr : 4 * dpr;
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
      };

      drawHandle(bx1, by1, 'p1');
      drawHandle(bx2, by2, 'p2');

      ctx.restore();
    });
  }
}

// ══════════════════════════════════════════════════════════════════
//  ISeriesPrimitivePaneView
// ══════════════════════════════════════════════════════════════════
class TrendlinePaneView {
  constructor(prim) { this._r = new TrendlineRenderer(prim); }
  renderer() { return this._r; }
}

// ══════════════════════════════════════════════════════════════════
//  ISeriesPrimitive  — public API
// ══════════════════════════════════════════════════════════════════
export class TrendlinePrimitive {
  constructor(p1) {
    this.id          = ++_uid;
    this.type        = 'trendline';
    this._p1         = { ...p1 };
    this._p2         = { ...p1 };
    this._selected   = false;
    this._hovered    = false;
    this._hoverPart  = null;   // 'p1' | 'p2' | 'body' | null
    this._preview    = false;
    this._chart      = null;
    this._series     = null;
    this._requestUpdate = null;
    this._paneViews  = [new TrendlinePaneView(this)];
  }

  // ── Required ISeriesPrimitive interface ──────────────────────
  attached({ chart, series, requestUpdate }) {
    this._chart  = chart;
    this._series = series;
    this._requestUpdate = requestUpdate;
  }
  detached() { this._chart = this._series = null; }
  paneViews() { return this._paneViews; }

  // ── Point mutations (each triggers a redraw) ─────────────────
  liveUpdate(p2)     { this._p2 = p2;                            this._requestUpdate?.(); }
  finalize(p2)       { this._p2 = p2; this._preview = false;     this._requestUpdate?.(); }
  updateP1(p1)       { this._p1 = p1;                            this._requestUpdate?.(); }
  updateP2(p2)       { this._p2 = p2;                            this._requestUpdate?.(); }
  updateBoth(p1, p2) { this._p1 = p1; this._p2 = p2;            this._requestUpdate?.(); }

  // ── Visual state ──────────────────────────────────────────────
  setSelected(v) {
    this._selected = v;
    this._requestUpdate?.();
  }
  setHoverPart(part) {
    if (this._hoverPart === part) return;
    this._hoverPart = part;
    this._hovered   = part !== null;
    this._requestUpdate?.();
  }

  // ── Snapshot of both endpoint pixels (used by DrawingEngine) ─
  endpointPixels() {
    if (!this._chart || !this._series) return null;
    const ts = this._chart.timeScale(), sc = this._series;
    return {
      p1: { x: ts.timeToCoordinate(this._p1.time), y: sc.priceToCoordinate(this._p1.price) },
      p2: { x: ts.timeToCoordinate(this._p2.time), y: sc.priceToCoordinate(this._p2.price) },
    };
  }

  // ── Hit test ─────────────────────────────────────────────────
  // Returns: 'p1' | 'p2' | 'body' | null
  hitTest(x, y) {
    if (!this._chart || !this._series) return null;
    const ts = this._chart.timeScale(), sc = this._series;
    const x1 = ts.timeToCoordinate(this._p1.time), y1 = sc.priceToCoordinate(this._p1.price);
    const x2 = ts.timeToCoordinate(this._p2.time), y2 = sc.priceToCoordinate(this._p2.price);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return null;

    // Endpoints get a larger grab radius than the line body
    if (Math.hypot(x - x1, y - y1) < 12) return 'p1';
    if (Math.hypot(x - x2, y - y2) < 12) return 'p2';
    if (distPointToSegment(x, y, x1, y1, x2, y2) < 8) return 'body';
    return null;
  }
}
