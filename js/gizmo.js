// On-map transform handles for the selected point layer: drag the square to resize, the round knob to rotate.
// Works in overlay canvas pixels.
const D2R = Math.PI / 180;
const SPECS = {
  point:   { r: (s, u) => 18 * u * (+s.size || 1), size: [0.2, 8], rot: 'heading', when: (s) => s.marker === 'sprite' },
  label:   { r: (s, u) => (+s.size || 26) * u * 1.3, size: [6, 220] },
  strike:  { r: (s, u) => 60 * u * (+s.size || 1), size: [0.1, 8] },
  launch:  { r: (s, u) => 40 * u * (+s.size || 1), size: [0.1, 8] },
  model3d: { r: (s, u) => 38 * u * (+s.size || 1), size: [0.1, 8], rot: 'heading' },
  videofx: { r: (s, u) => 80 * u * (+s.size || 1), size: [0.1, 8], rot: 'rotation' },
};

/** Gizmo geometry for a layer, or null. */
export function gizmoFor(L, proj, unit) {
  const sp = L && L.geom?.type === 'Point' && SPECS[L.kind];
  if (!sp) return null;
  const s = L.style || {};
  const [cx, cy] = proj(L.geom.coordinates);
  const R = Math.max(14, sp.r(s, unit));
  const g = { id: L.id, cx, cy, R, spec: sp, scale: { x: cx + R * Math.SQRT1_2, y: cy + R * Math.SQRT1_2 } };
  if (sp.rot && (!sp.when || sp.when(s))) {
    const a = (+s[sp.rot] || 0) * D2R;
    const k = R + 22 * Math.max(1, unit * 0.8);
    g.rotate = { x: cx + Math.sin(a) * k, y: cy - Math.cos(a) * k, key: sp.rot };
  }
  return g;
}

export function drawGizmo(ctx, g, dpr) {
  ctx.save();
  ctx.lineWidth = 1.5 * dpr;
  ctx.strokeStyle = 'rgba(45,127,249,.9)';
  ctx.setLineDash([5 * dpr, 4 * dpr]);
  ctx.beginPath(); ctx.arc(g.cx, g.cy, g.R, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  if (g.rotate) {
    ctx.beginPath(); ctx.moveTo(g.cx, g.cy); ctx.lineTo(g.rotate.x, g.rotate.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(g.rotate.x, g.rotate.y, 6.5 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = '#2d7ff9'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `${9 * dpr}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⟳', g.rotate.x, g.rotate.y + 0.5 * dpr);
  }
  const { x, y } = g.scale;
  ctx.beginPath(); ctx.rect(x - 6 * dpr, y - 6 * dpr, 12 * dpr, 12 * dpr);
  ctx.fillStyle = '#2d7ff9'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 3 * dpr, y - 3 * dpr); ctx.lineTo(x + 3 * dpr, y + 3 * dpr); ctx.stroke();
  ctx.restore();
}

/** Which gizmo handle is under p? → 'scale' | 'rotate' | null */
export function hitGizmo(g, p, dpr) {
  if (!g) return null;
  const r = 10 * dpr;
  if (g.rotate && Math.hypot(p[0] - g.rotate.x, p[1] - g.rotate.y) <= r) return 'rotate';
  if (Math.hypot(p[0] - g.scale.x, p[1] - g.scale.y) <= r) return 'scale';
  return null;
}

/** Apply a drag: returns the style changes. */
export function gizmoDrag(g, which, startStyle, p0, p) {
  if (which === 'scale') {
    const d0 = Math.max(4, Math.hypot(p0[0] - g.cx, p0[1] - g.cy));
    const d = Math.max(2, Math.hypot(p[0] - g.cx, p[1] - g.cy));
    const key = 'size';
    const base = +startStyle[key] || (g.spec.size[1] > 20 ? 26 : 1);
    const [lo, hi] = g.spec.size;
    const v = Math.min(hi, Math.max(lo, base * (d / d0)));
    return { [key]: hi > 20 ? Math.round(v) : +v.toFixed(2) };
  }
  if (which === 'rotate') {
    let a = Math.atan2(p[0] - g.cx, -(p[1] - g.cy)) / D2R;
    a = ((a + 540) % 360) - 180;
    return { [g.rotate.key]: Math.round(a) };
  }
  return {};
}
