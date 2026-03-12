import { distPointToSegment } from '../utils/geometry.js';

// ─── IDs ──────────────────────────────────────────────────────────
// Start at 10000 so rect IDs never collide with trendline IDs
let _rid = 10000;

// ─── Colors ───────────────────────────────────────────────────────
const C = {
    normal: '#A78BFA',
    hovered: '#BDA8FF',
    selected: '#F5C518',
    preview: '#C4B5FD',
    bg: '#07090F',
};

// ══════════════════════════════════════════════════════════════════
//  ISeriesPrimitivePaneRenderer
// ══════════════════════════════════════════════════════════════════
class RectangleRenderer {
    constructor(prim) { this._p = prim; }

    draw(target) {
        const p = this._p;
        if (!p._chart || !p._series) return;

        const n = p.normPixels();
        if (!n) return;

        target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr }) => {
            const dpr = Math.min(hpr, vpr);
            const bL = n.left * hpr;
            const bR = n.right * hpr;
            const bT = n.top * vpr;
            const bB = n.bottom * vpr;
            const bW = bR - bL;
            const bH = bB - bT;

            const col = p._preview ? C.preview : p._selected ? C.selected : p._hovered ? C.hovered : C.normal;

            ctx.save();

            // ── Fill ──
            ctx.fillStyle = col + (p._selected ? '1E' : '12');
            ctx.fillRect(bL, bT, bW, bH);

            // ── Border ──
            ctx.strokeStyle = col;
            ctx.lineWidth = (p._selected ? 2 : 1.5) * dpr;
            ctx.shadowColor = col;
            ctx.shadowBlur = (p._selected ? 12 : p._hovered ? 7 : 4) * dpr;
            if (p._selected) ctx.setLineDash([6 * dpr, 3 * dpr]);
            ctx.strokeRect(bL, bT, bW, bH);
            ctx.setLineDash([]);
            ctx.shadowBlur = 0;

            // ── Handles (corners always visible when selected; edge mids only when selected) ──
            if (p._selected || p._hovered) {
                const corners = [
                    { x: bL, y: bT, part: 'tl' },
                    { x: bR, y: bT, part: 'tr' },
                    { x: bL, y: bB, part: 'bl' },
                    { x: bR, y: bB, part: 'br' },
                ];

                const edgeMids = p._selected ? [
                    { x: (bL + bR) / 2, y: bT, part: 'top' },
                    { x: (bL + bR) / 2, y: bB, part: 'bottom' },
                    { x: bL, y: (bT + bB) / 2, part: 'left' },
                    { x: bR, y: (bT + bB) / 2, part: 'right' },
                ] : [];

                const drawHandle = (hx, hy, part, isCorner) => {
                    const isHot = p._hoverPart === part;
                    const r = (isHot ? 6.5 : isCorner ? 5 : 3.5) * dpr;

                    // Outer glow ring on hover
                    if (isHot) {
                        ctx.beginPath();
                        ctx.arc(hx, hy, r + 5 * dpr, 0, Math.PI * 2);
                        ctx.strokeStyle = col + '44';
                        ctx.lineWidth = 2 * dpr;
                        ctx.stroke();
                    }

                    ctx.beginPath();
                    ctx.arc(hx, hy, r, 0, Math.PI * 2);
                    ctx.fillStyle = isHot ? '#FFFFFF' : col;
                    ctx.strokeStyle = C.bg;
                    ctx.lineWidth = 1.5 * dpr;
                    ctx.shadowColor = col;
                    ctx.shadowBlur = isHot ? 12 * dpr : 3 * dpr;
                    ctx.fill();
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                };

                corners.forEach(h => drawHandle(h.x, h.y, h.part, true));
                edgeMids.forEach(h => drawHandle(h.x, h.y, h.part, false));
            }

            ctx.restore();
        });
    }
}

// ══════════════════════════════════════════════════════════════════
//  ISeriesPrimitivePaneView
// ══════════════════════════════════════════════════════════════════
class RectanglePaneView {
    constructor(prim) { this._r = new RectangleRenderer(prim); }
    renderer() { return this._r; }
}

// ══════════════════════════════════════════════════════════════════
//  ISeriesPrimitive  — public API
// ══════════════════════════════════════════════════════════════════
export class RectanglePrimitive {
    constructor(p1) {
        this.id = ++_rid;
        this.type = 'rectangle';
        // p1 = first-click corner, p2 = opposite corner (any order — normalized on read)
        this._p1 = { ...p1 };
        this._p2 = { ...p1 };
        this._selected = false;
        this._hovered = false;
        // hoverPart: 'tl'|'tr'|'bl'|'br'|'top'|'bottom'|'left'|'right'|'body'|null
        this._hoverPart = null;
        this._preview = false;
        this._chart = null;
        this._series = null;
        this._requestUpdate = null;
        this._paneViews = [new RectanglePaneView(this)];
    }

    // ── Required ISeriesPrimitive interface ──────────────────────
    attached({ chart, series, requestUpdate }) {
        this._chart = chart;
        this._series = series;
        this._requestUpdate = requestUpdate;
    }
    detached() { this._chart = this._series = null; }
    paneViews() { return this._paneViews; }

    // ── Mutations ────────────────────────────────────────────────
    // During live draw: second corner follows mouse
    liveUpdate(p2) { this._p2 = p2; this._requestUpdate?.(); }
    finalize(p2) { this._p2 = p2; this._preview = false; this._requestUpdate?.(); }
    // During edit: engine passes normalized TL + BR corners
    updateBounds(p1, p2) { this._p1 = p1; this._p2 = p2; this._requestUpdate?.(); }
    // After the existing updateBounds() method, add:
    updateBoth(p1, p2) { return this.updateBounds(p1, p2); }
    // ── Visual state ──────────────────────────────────────────────
    setSelected(v) {
        this._selected = v;
        this._requestUpdate?.();
    }
    setHoverPart(part) {
        if (this._hoverPart === part) return;
        this._hoverPart = part;
        this._hovered = part !== null;
        this._requestUpdate?.();
    }

    // ── Normalized pixel bounds (used by engine + renderer) ──────
    // Always returns { left, right, top, bottom } regardless of draw direction.
    // "top" = smaller y = higher price in LWC coordinate space.
    normPixels() {
        if (!this._chart || !this._series) return null;
        const ts = this._chart.timeScale(), sc = this._series;
        const x1 = ts.timeToCoordinate(this._p1.time);
        const y1 = sc.priceToCoordinate(this._p1.price);
        const x2 = ts.timeToCoordinate(this._p2.time);
        const y2 = sc.priceToCoordinate(this._p2.price);
        if (x1 == null || y1 == null || x2 == null || y2 == null) return null;
        return {
            left: Math.min(x1, x2),
            right: Math.max(x1, x2),
            top: Math.min(y1, y2),
            bottom: Math.max(y1, y2),
        };
    }

    // ── Hit test ─────────────────────────────────────────────────
    // Priority: corners > edge-midpoint handles (selected only) > edges > body
    // Returns one of the 9 zone names, or null.
    hitTest(x, y) {
        const n = this.normPixels();
        if (!n) return null;
        const { left, right, top, bottom } = n;

        const CR = 10; // corner grab radius (px)
        const ER = 7;  // edge grab radius (px)

        // ── Corners (always hittable) ──
        if (Math.hypot(x - left, y - top) < CR) return 'tl';
        if (Math.hypot(x - right, y - top) < CR) return 'tr';
        if (Math.hypot(x - left, y - bottom) < CR) return 'bl';
        if (Math.hypot(x - right, y - bottom) < CR) return 'br';

        // ── Edge midpoint handles (only visible + hittable when selected) ──
        if (this._selected) {
            const mx = (left + right) / 2, my = (top + bottom) / 2;
            if (Math.hypot(x - mx, y - top) < CR) return 'top';
            if (Math.hypot(x - mx, y - bottom) < CR) return 'bottom';
            if (Math.hypot(x - left, y - my) < CR) return 'left';
            if (Math.hypot(x - right, y - my) < CR) return 'right';
        }

        // ── Edge lines (always hittable so user can select by clicking border) ──
        if (distPointToSegment(x, y, left, top, right, top) < ER) return 'top';
        if (distPointToSegment(x, y, left, bottom, right, bottom) < ER) return 'bottom';
        if (distPointToSegment(x, y, left, top, left, bottom) < ER) return 'left';
        if (distPointToSegment(x, y, right, top, right, bottom) < ER) return 'right';

        // ── Interior body ──
        if (x > left && x < right && y > top && y < bottom) return 'body';

        return null;
    }
}
