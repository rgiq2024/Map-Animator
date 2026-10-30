// Georeferenced images on the map: plain images placed by hand, images with a world file, KML/KMZ ground
// overlays and GeoTIFFs. Drawn by warping the picture onto its four corners (works with tilt, rotation and
// the globe), plus before/after comparisons (swipe / fade) and image sequences through time.
import { getMedia, putMedia } from './store.js';
import { unzipEntries } from './importers.js';
import { placeAt } from './place.js';

const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
export const IMG_KINDS = new Set(['image', 'compare', 'timeseries']);
const MAX_PX = 4096;

// ---------------------------------------------------------------- image cache
const cache = new Map(); // media id → { bmp, w, h, ready, p }
export function imageFor(id) {
  if (!id) return null;
  let e = cache.get(id);
  if (!e) {
    e = { bmp: null, w: 0, h: 0, ready: false };
    e.p = getMedia(id).then(async (blob) => {
      if (!blob) return e;
      e.bmp = await createImageBitmap(blob);
      e.w = e.bmp.width; e.h = e.bmp.height; e.ready = true;
      return e;
    }).catch(() => e);
    cache.set(id, e);
  }
  return e;
}
/** Media ids used by a layer. */
export function mediaOf(L) {
  const s = L.style || {};
  if (L.kind === 'image') return [s.media].filter(Boolean);
  if (L.kind === 'compare') return [s.media, s.media2].filter(Boolean);
  if (L.kind === 'timeseries' && s.source !== 'wayback') return (s.frames || []).map((f) => f.media).filter(Boolean);
  return [];
}
/** Wait until every image of a scene is decoded (before rendering exact frames). */
export async function preloadImages(scene) {
  const ids = (scene.layers || []).filter((L) => IMG_KINDS.has(L.kind) && !L.hidden).flatMap(mediaOf);
  await Promise.all(ids.map((id) => imageFor(id)?.p));
}

// ---------------------------------------------------------------- quad geometry (corners: TL, TR, BR, BL)
const toM = ([lng, lat]) => [lng / 360 + 0.5, 0.5 - Math.log(Math.tan(Math.PI / 4 + (clamp(lat, -85.05, 85.05) * D2R) / 2)) / (2 * Math.PI)];
const fromM = ([x, y]) => [(x - 0.5) * 360, (2 * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - Math.PI / 2) / D2R];
export const quadOf = (L) => (L.geom?.type === 'Polygon' ? L.geom.coordinates[0].slice(0, 4) : null);
export const quadGeom = (q) => ({ type: 'Polygon', coordinates: [[...q.map((c) => [+c[0].toFixed(7), +c[1].toFixed(7)]), [+q[0][0].toFixed(7), +q[0][1].toFixed(7)]]] });
export const quadFromBounds = (w, s, e, n) => [[w, n], [e, n], [e, s], [w, s]];
export function quadBounds(q) {
  const xs = q.map((c) => c[0]), ys = q.map((c) => c[1]);
  return { w: Math.min(...xs), s: Math.min(...ys), e: Math.max(...xs), n: Math.max(...ys) };
}
function interp(q, u, v, crs) {
  if (crs === '4326') {
    const tx = q[0][0] + (q[1][0] - q[0][0]) * u, ty = q[0][1] + (q[1][1] - q[0][1]) * u;
    const bx = q[3][0] + (q[2][0] - q[3][0]) * u, by = q[3][1] + (q[2][1] - q[3][1]) * u;
    return [tx + (bx - tx) * v, ty + (by - ty) * v];
  }
  const m = q.map(toM);
  const tx = m[0][0] + (m[1][0] - m[0][0]) * u, ty = m[0][1] + (m[1][1] - m[0][1]) * u;
  const bx = m[3][0] + (m[2][0] - m[3][0]) * u, by = m[3][1] + (m[2][1] - m[3][1]) * u;
  return fromM([tx + (bx - tx) * v, ty + (by - ty) * v]);
}
const centreM = (q) => { const m = q.map(toM); return [(m[0][0] + m[1][0] + m[2][0] + m[3][0]) / 4, (m[0][1] + m[1][1] + m[2][1] + m[3][1]) / 4]; };
/** Rotate a quad clockwise (as seen on a north-up map) by deg around its centre. */
export function rotateQuad(q, deg) {
  const c = centreM(q), a = deg * D2R, cs = Math.cos(a), sn = Math.sin(a);
  return q.map((p) => { const [x, y] = toM(p); const dx = x - c[0], dy = y - c[1]; return fromM([c[0] + dx * cs - dy * sn, c[1] + dx * sn + dy * cs]); });
}
export function scaleQuad(q, k) {
  const c = centreM(q);
  return q.map((p) => { const [x, y] = toM(p); return fromM([c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k]); });
}
export function moveQuad(q, dlng, dlat) { return q.map(([x, y]) => [x + dlng, clamp(y + dlat, -85, 85)]); }
/** Make the quad match the picture's proportions (keeps centre, width and rotation). */
export function fixAspect(q, aspectHW) {
  const m = q.map(toM), c = centreM(q);
  const ux = [(m[1][0] - m[0][0] + m[2][0] - m[3][0]) / 2, (m[1][1] - m[0][1] + m[2][1] - m[3][1]) / 2];
  const len = Math.hypot(ux[0], ux[1]) || 1e-9;
  const n = [-ux[1] / len, ux[0] / len];
  const hh = (len * aspectHW) / 2;
  const hw = [ux[0] / 2, ux[1] / 2];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => fromM([c[0] + sx * hw[0] + sy * n[0] * hh, c[1] + sx * hw[1] + sy * n[1] * hh]));
}

// ---------------------------------------------------------------- warped drawing
let scratch = null;
function scratchFor(ctx) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== W || scratch.height !== H) { scratch.width = W; scratch.height = H; }
  return scratch;
}
function gridOf(q, proj, crs, n) {
  const pts = [];
  for (let j = 0; j <= n; j++) {
    const row = [];
    for (let i = 0; i <= n; i++) row.push(proj(interp(q, i / n, j / n, crs)));
    pts.push(row);
  }
  return pts;
}
function tri(sctx, img, S, D) {
  const [s0, s1, s2] = S, [d0, d1, d2] = D;
  const S1x = s1[0] - s0[0], S1y = s1[1] - s0[1], S2x = s2[0] - s0[0], S2y = s2[1] - s0[1];
  const det = S1x * S2y - S2x * S1y;
  if (Math.abs(det) < 1e-9) return;
  const D1x = d1[0] - d0[0], D1y = d1[1] - d0[1], D2x = d2[0] - d0[0], D2y = d2[1] - d0[1];
  const a = (D1x * S2y - D2x * S1y) / det, c = (D2x * S1x - D1x * S2x) / det;
  const b = (D1y * S2y - D2y * S1y) / det, d = (D2y * S1x - D1y * S2x) / det;
  const e = d0[0] - a * s0[0] - c * s0[1], f = d0[1] - b * s0[0] - d * s0[1];
  // clip to the triangle, grown by ~0.7 px to hide seams
  const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3;
  const grow = (p) => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + (dx / l) * 0.7, p[1] + (dy / l) * 0.7]; };
  const g0 = grow(d0), g1 = grow(d1), g2 = grow(d2);
  sctx.save();
  sctx.beginPath(); sctx.moveTo(g0[0], g0[1]); sctx.lineTo(g1[0], g1[1]); sctx.lineTo(g2[0], g2[1]); sctx.closePath(); sctx.clip();
  sctx.transform(a, b, c, d, e, f);
  const x0 = Math.max(0, Math.floor(Math.min(s0[0], s1[0], s2[0]) - 1)), y0 = Math.max(0, Math.floor(Math.min(s0[1], s1[1], s2[1]) - 1));
  const x1 = Math.min(img.w, Math.ceil(Math.max(s0[0], s1[0], s2[0]) + 1)), y1 = Math.min(img.h, Math.ceil(Math.max(s0[1], s1[1], s2[1]) + 1));
  if (x1 > x0 && y1 > y0) sctx.drawImage(img.bmp, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  sctx.restore();
}
/**
 * Draw image entry `img` warped onto quad q. opts: { crs, alpha, clip(ctx) → adds a path to clip to, smooth }.
 * Returns the projected grid (for outlines / swipe lines) or null when off screen.
 */
export function drawQuad(ctx, img, q, proj, opts = {}) {
  if (!img?.ready || !q) return null;
  const crs = opts.crs || '3857';
  const b = quadBounds(q);
  const span = Math.max(b.e - b.w, b.n - b.s);
  const n = span > 20 ? 24 : span > 4 ? 16 : 10;
  const pts = gridOf(q, proj, crs, n);
  const W = ctx.canvas.width, H = ctx.canvas.height;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const row of pts) for (const [x, y] of row) {
    if (!isFinite(x) || !isFinite(y)) return null;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (maxX < 0 || maxY < 0 || minX > W || minY > H) return pts;
  const rx = Math.max(0, Math.floor(minX) - 2), ry = Math.max(0, Math.floor(minY) - 2);
  const rw = Math.min(W, Math.ceil(maxX) + 2) - rx, rh = Math.min(H, Math.ceil(maxY) + 2) - ry;
  if (rw <= 0 || rh <= 0) return pts;
  const sc = scratchFor(ctx);
  const sctx = sc.getContext('2d');
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(rx, ry, rw, rh);
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  const sw = img.w / n, sh = img.h / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const p00 = pts[j][i], p10 = pts[j][i + 1], p01 = pts[j + 1][i], p11 = pts[j + 1][i + 1];
      const cx0 = Math.min(p00[0], p10[0], p01[0], p11[0]), cx1 = Math.max(p00[0], p10[0], p01[0], p11[0]);
      const cy0 = Math.min(p00[1], p10[1], p01[1], p11[1]), cy1 = Math.max(p00[1], p10[1], p01[1], p11[1]);
      if (cx1 < 0 || cy1 < 0 || cx0 > W || cy0 > H) continue;
      const s00 = [i * sw, j * sh], s10 = [(i + 1) * sw, j * sh], s01 = [i * sw, (j + 1) * sh], s11 = [(i + 1) * sw, (j + 1) * sh];
      tri(sctx, img, [s00, s10, s11], [p00, p10, p11]);
      tri(sctx, img, [s00, s11, s01], [p00, p11, p01]);
    }
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha *= clamp(opts.alpha ?? 1, 0, 1);
  if (opts.blend) ctx.globalCompositeOperation = opts.blend;
  if (opts.clip) { ctx.beginPath(); opts.clip(ctx); ctx.clip(); }
  ctx.drawImage(sc, rx, ry, rw, rh, rx, ry, rw, rh);
  ctx.restore();
  return pts;
}

// ---------------------------------------------------------------- layers
const outline = (ctx, pts, col, w) => {
  const n = pts.length - 1;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) ctx.lineTo(...pts[0][i]);
  for (let j = 0; j <= n; j++) ctx.lineTo(...pts[j][n]);
  for (let i = n; i >= 0; i--) ctx.lineTo(...pts[n][i]);
  for (let j = n; j >= 0; j--) ctx.lineTo(...pts[j][0]);
  ctx.closePath();
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
};
function placeholder(ctx, q, proj, unit, text) {
  const p = q.map(proj);
  ctx.save();
  ctx.setLineDash([6 * unit, 5 * unit]);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5 * unit;
  ctx.fillStyle = 'rgba(20,24,30,0.35)';
  ctx.beginPath(); p.forEach((c, i) => (i ? ctx.lineTo(...c) : ctx.moveTo(...c))); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = `600 ${13 * unit}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center';
  const cx = (p[0][0] + p[2][0]) / 2, cy = (p[0][1] + p[2][1]) / 2;
  ctx.fillText(text, cx, cy);
  ctx.restore();
}
/** Opacity with the layer's in-animation. */
function animAlpha(L, tm) {
  if (tm.edit) return tm.alpha;
  const u = clamp(tm.tau / Math.max(0.05, +L.duration || 1), 0, 1);
  if (L.anim === 'fade') return tm.alpha * ease(u);
  return tm.alpha;
}
/** Clip path for the part of the quad with u (or v) between a and b (screen space). */
function partClip(pts, axis, a, b) {
  const n = pts.length - 1;
  const at = (u, v) => {
    const fi = clamp(u * n, 0, n), fj = clamp(v * n, 0, n);
    const i = Math.min(n - 1, Math.floor(fi)), j = Math.min(n - 1, Math.floor(fj));
    const du = fi - i, dv = fj - j;
    const p00 = pts[j][i], p10 = pts[j][i + 1], p01 = pts[j + 1][i], p11 = pts[j + 1][i + 1];
    return [
      (p00[0] * (1 - du) + p10[0] * du) * (1 - dv) + (p01[0] * (1 - du) + p11[0] * du) * dv,
      (p00[1] * (1 - du) + p10[1] * du) * (1 - dv) + (p01[1] * (1 - du) + p11[1] * du) * dv,
    ];
  };
  const k = 16, path = [];
  if (axis === 'u') {
    for (let t = 0; t <= k; t++) path.push(at(a + (b - a) * (t / k), 0));
    for (let t = 0; t <= k; t++) path.push(at(b, t / k));
    for (let t = k; t >= 0; t--) path.push(at(a + (b - a) * (t / k), 1));
    for (let t = k; t >= 0; t--) path.push(at(a, t / k));
  } else {
    for (let t = 0; t <= k; t++) path.push(at(0, a + (b - a) * (t / k)));
    for (let t = 0; t <= k; t++) path.push(at(t / k, b));
    for (let t = k; t >= 0; t--) path.push(at(1, a + (b - a) * (t / k)));
    for (let t = k; t >= 0; t--) path.push(at(t / k, a));
  }
  return { path, line: (s) => Array.from({ length: k + 1 }, (_, t) => (axis === 'u' ? at(s, t / k) : at(t / k, s))) };
}

export function drawImageLayer(ctx, L, tm, proj, unit, edit) {
  const q = quadOf(L);
  if (!q) return;
  const s = L.style;
  const img = imageFor(s.media);
  const alpha = animAlpha(L, tm) * (+s.opacity || 1);
  if (!img?.ready) { if (tm.edit) placeholder(ctx, q, proj, unit, s.media ? 'Loading image…' : 'Choose an image'); return; }
  let clip = null;
  if (L.anim === 'wipe' && !tm.edit) {
    const u = ease(tm.tau / Math.max(0.05, +L.duration || 1));
    const g = gridOf(q, proj, s.crs, 10);
    const dir = s.dir || 'lr';
    const pc = partClip(g, dir === 'tb' || dir === 'bt' ? 'v' : 'u', dir === 'rl' || dir === 'bt' ? 1 - u : 0, dir === 'rl' || dir === 'bt' ? 1 : u);
    clip = (c) => { pc.path.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p))); c.closePath(); };
    if (u <= 0.001) return;
  }
  const pts = drawQuad(ctx, img, q, proj, { crs: s.crs, alpha, clip, blend: s.blend === 'multiply' ? 'multiply' : s.blend === 'screen' ? 'screen' : null });
  if (pts && (s.border || (edit && tm.edit))) outline(ctx, pts, s.border ? (s.borderColor || '#ffffff') : 'rgba(45,127,249,.9)', (s.border ? 2 : 1.5) * unit);
}

/** Swipe / fade between a before and an after image. */
export function compareState(L, tm) {
  if (tm.edit) return +L.style.editSplit || 0.5;
  const u = clamp(tm.tau / Math.max(0.05, +L.duration || 1), 0, 1);
  const m = L.style.mode || 'swipe';
  if (m === 'pingpong') { const c = +L.style.cycles || 2; return 0.5 - 0.5 * Math.cos(Math.PI * 2 * c * u); }
  if (m === 'split') return 0.5 * ease(u / 0.6);
  return ease(u);
}
export function drawCompareLayer(ctx, L, tm, proj, unit, frame) {
  const q = quadOf(L);
  if (!q) return;
  const s = L.style;
  const A = imageFor(s.media), B = imageFor(s.media2);
  const alpha = (tm.edit ? tm.alpha : tm.alpha * clamp(tm.tau / 0.3, 0, 1)) * (+s.opacity || 1);
  if (!A?.ready || !B?.ready) { if (tm.edit) placeholder(ctx, q, proj, unit, !s.media ? 'Choose the BEFORE image' : !s.media2 ? 'Choose the AFTER image' : 'Loading…'); if (A?.ready) drawQuad(ctx, A, q, proj, { crs: s.crs, alpha }); return; }
  const k = compareState(L, tm);
  const mode = s.mode || 'swipe';
  const pts = drawQuad(ctx, A, q, proj, { crs: s.crs, alpha });
  if (!pts) return;
  if (mode === 'fade') {
    drawQuad(ctx, B, q, proj, { crs: s.crs, alpha: alpha * k });
  } else {
    const dir = s.dir || 'lr';
    const axis = dir === 'tb' || dir === 'bt' ? 'v' : 'u';
    const rev = dir === 'rl' || dir === 'bt';
    const pos = rev ? 1 - k : k;
    const pc = partClip(pts, axis, rev ? pos : 0, rev ? 1 : pos);
    if (k > 0.001) drawQuad(ctx, B, q, proj, { crs: s.crs, alpha, clip: (c) => { pc.path.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p))); c.closePath(); } });
    // divider line with a handle
    if (k > 0.001 && k < 0.999 && s.line !== false) {
      const ln = pc.line(pos);
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.strokeStyle = s.lineColor || '#ffffff'; ctx.lineWidth = 3 * unit;
      ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 6 * unit;
      ctx.beginPath(); ln.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.stroke();
      const mid = ln[Math.floor(ln.length / 2)];
      ctx.fillStyle = s.lineColor || '#ffffff';
      ctx.beginPath(); ctx.arc(mid[0], mid[1], 13 * unit, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#16181d';
      const ar = 5 * unit;
      const ang = axis === 'u' ? Math.atan2(ln.at(-1)[1] - ln[0][1], ln.at(-1)[0] - ln[0][0]) + Math.PI / 2 : Math.atan2(ln.at(-1)[1] - ln[0][1], ln.at(-1)[0] - ln[0][0]) + Math.PI / 2;
      for (const sg of [-1, 1]) {
        ctx.save(); ctx.translate(mid[0], mid[1]); ctx.rotate(ang + (sg < 0 ? Math.PI : 0));
        ctx.beginPath(); ctx.moveTo(4 * unit, -ar); ctx.lineTo(4 * unit + ar, 0); ctx.lineTo(4 * unit, ar); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
  }
  if (s.labels !== false) {
    // BEFORE / AFTER tags on the video frame
    const tag = (text, x, y, align, a) => {
      if (a <= 0.02) return;
      ctx.save();
      ctx.globalAlpha *= a * alpha;
      ctx.font = `800 ${15 * unit}px Inter, system-ui, sans-serif`;
      const w = ctx.measureText(text).width + 22 * unit, h = 30 * unit;
      const bx = align === 'right' ? x - w : x;
      ctx.fillStyle = 'rgba(10,12,16,.78)'; ctx.fillRect(bx, y, w, h);
      ctx.fillStyle = s.lineColor || '#fff'; ctx.fillRect(bx, y, 4 * unit, h);
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, bx + 12 * unit, y + h / 2 + 1);
      ctx.restore();
    };
    if (frame) {
      const m = 24 * unit;
      const y = frame.y + frame.h - m - 30 * unit;
      if (mode === 'fade') {
        tag(s.labelA || 'BEFORE', frame.x + m, y, 'left', 1 - k);
        tag(s.labelB || 'AFTER', frame.x + m, y, 'left', k);
      } else {
        const rev = s.dir === 'rl' || s.dir === 'bt';
        tag(s.labelA || 'BEFORE', rev ? frame.x + frame.w - m : frame.x + m, y, rev ? 'right' : 'left', 1);
        tag(s.labelB || 'AFTER', rev ? frame.x + m : frame.x + frame.w - m, y, rev ? 'left' : 'right', clamp(k * 4, 0, 1));
      }
    }
  }
}

/** Which frames of a time series show at this moment: [{ i, w }] and continuous position p. */
export function seriesState(L, tm) {
  const s = L.style;
  const n = (s.frames || []).length;
  if (!n) return { list: [], p: 0, n };
  if (tm.edit) { const i = clamp(Math.round(+s.editFrame || 0), 0, n - 1); return { list: [{ i, w: 1 }], p: i, n }; }
  const per = Math.max(0.2, +s.per || 2);
  const f = Math.min(Math.max(0, +(s.fade ?? 0.8)), per * 0.95);
  const tau = Math.max(0, tm.tau);
  const i = Math.floor(tau / per);
  if (i >= n - 1) return { list: [{ i: n - 1, w: 1 }], p: n - 1, n };
  const r = tau - i * per;
  if (f > 0 && r > per - f) { const k = ease((r - (per - f)) / f); return { list: [{ i, w: 1 }, { i: i + 1, w: k }], p: i + k, n }; }
  return { list: [{ i, w: 1 }], p: i, n };
}
export function drawSeriesLayer(ctx, L, tm, proj, unit) {
  const s = L.style;
  if (s.source === 'wayback' || s.source === 'livesat') return; // drawn by the map (wayback.js)
  const q = quadOf(L);
  if (!q) return;
  const st = seriesState(L, tm);
  const alpha = animAlpha(L, tm) * (+s.opacity || 1);
  if (!st.list.length) { if (tm.edit) placeholder(ctx, q, proj, unit, 'Add images'); return; }
  let pts = null;
  for (const { i, w } of st.list) {
    const img = imageFor(s.frames[i].media);
    if (!img?.ready) continue;
    pts = drawQuad(ctx, img, q, proj, { crs: s.crs, alpha: alpha * w }) || pts;
  }
  if (pts && s.border) outline(ctx, pts, s.borderColor || '#fff', 2 * unit);
}
/** The date / year label and progress bar of a time series. */
export function drawSeriesLabel(ctx, L, tm, frame, unit) {
  const s = L.style;
  const st = seriesState(L, tm);
  if (!st.n || s.label === 'none') return;
  const frames = s.frames;
  const alpha = tm.alpha * (tm.edit ? 1 : clamp(tm.tau / 0.3, 0, 1));
  const k = +s.labelSize || 1;
  const col = s.labelColor || '#ffffff';
  const acc = s.accent || '#ffb020';
  const big = 64 * unit * k;
  const showBar = s.bar !== false && st.n > 1;
  const W = Math.max(260 * unit * k, showBar ? Math.min(frame.w * 0.6, (90 + st.n * 70) * unit * k) : 0);
  const H = big * 1.15 + (showBar ? 40 * unit * k : 0) + 20 * unit;
  const m = 30 * unit;
  const pos = s.position || 'bottom-left';
  let x = frame.x + m, y = frame.y + frame.h - m - H;
  if (pos.includes('right')) x = frame.x + frame.w - m - W;
  if (pos.includes('top')) y = frame.y + m;
  if (pos === 'center') { x = frame.x + (frame.w - W) / 2; y = frame.y + (frame.h - H) / 2; }
  ctx.save();
  ctx.globalAlpha *= alpha;
  placeAt(ctx, L, frame, x, y, W, H);
  if (s.labelBox !== false) {
    ctx.fillStyle = 'rgba(8,10,14,0.66)';
    ctx.fillRect(x, y, W, H);
    ctx.fillStyle = acc; ctx.fillRect(x, y, 5 * unit, H);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.font = `900 ${big}px "Archivo Black", Inter, system-ui, sans-serif`;
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 10 * unit;
  const tx = x + 22 * unit, ty = y + big * 1.02 + 6 * unit;
  for (const { i, w } of st.list) {
    const a = st.list.length > 1 ? (i === st.list[0].i ? 1 - w : w) : 1;
    if (a <= 0.01) continue;
    ctx.save();
    ctx.globalAlpha *= a;
    const off = st.list.length > 1 ? (i === st.list[0].i ? -w : 1 - w) * 22 * unit : 0;
    ctx.fillStyle = col;
    ctx.fillText(frames[i].label || `#${i + 1}`, tx, ty + off);
    ctx.restore();
  }
  ctx.shadowBlur = 0;
  if (showBar) {
    const by = ty + 22 * unit * k, bx0 = tx + 6 * unit, bx1 = x + W - 26 * unit;
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2 * unit;
    ctx.beginPath(); ctx.moveTo(bx0, by); ctx.lineTo(bx1, by); ctx.stroke();
    const X = (p) => bx0 + (bx1 - bx0) * (st.n > 1 ? p / (st.n - 1) : 0);
    ctx.strokeStyle = acc; ctx.lineWidth = 3 * unit;
    ctx.beginPath(); ctx.moveTo(bx0, by); ctx.lineTo(X(st.p), by); ctx.stroke();
    ctx.font = `600 ${11 * unit * k}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    frames.forEach((f, i) => {
      const xx = X(i);
      const on = i <= st.p + 0.001;
      ctx.fillStyle = on ? acc : 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.arc(xx, by, (on ? 4.5 : 3.5) * unit, 0, Math.PI * 2); ctx.fill();
      if (st.n <= 14 || i % Math.ceil(st.n / 10) === 0 || i === st.n - 1) { ctx.fillStyle = on ? '#fff' : 'rgba(255,255,255,.6)'; ctx.fillText(f.label || '', xx, by + 18 * unit * k); }
    });
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(X(st.p), by, 6.5 * unit, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- importing
const IMG_RE = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
const WORLD_RE = /\.(pgw|pngw|jgw|jpgw|jpegw|tfw|tifw|wld|j2w|gfw|bpw)$/i;
const TIF_RE = /\.(tiff?|gtiff)$/i;
const KML_RE = /\.(kml|kmz)$/i;
const base = (n) => n.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').toLowerCase();
const mercToLL = (x, y) => [(x / 20037508.342789244) * 180, (Math.atan(Math.exp((y / 20037508.342789244) * Math.PI)) * 360) / Math.PI - 90];

async function shrink(blob, type) {
  const bmp = await createImageBitmap(blob);
  const { width: w, height: h } = bmp;
  if (Math.max(w, h) <= MAX_PX) return { blob, w, h };
  const k = MAX_PX / Math.max(w, h);
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const out = await new Promise((r) => c.toBlob(r, /png|gif|webp/.test(type) ? 'image/png' : 'image/jpeg', 0.92));
  return { blob: out, w: c.width, h: c.height };
}
function quadFromWorld(text, w, h) {
  const v = text.trim().split(/\s+/).map(Number);
  if (v.length < 6 || v.some((x) => !isFinite(x))) throw new Error('That world file could not be read');
  const [A, D, B, E, C, F] = v;
  const at = (col, row) => [A * col + B * row + C, D * col + E * row + F];
  const corners = [at(-0.5, -0.5), at(w - 0.5, -0.5), at(w - 0.5, h - 0.5), at(-0.5, h - 0.5)];
  const geographic = corners.every(([x, y]) => Math.abs(x) <= 360 && Math.abs(y) <= 90);
  if (geographic) return { quad: corners, crs: '4326' };
  if (corners.every(([x, y]) => Math.abs(x) <= 2.1e7 && Math.abs(y) <= 2.1e7)) return { quad: corners.map(([x, y]) => mercToLL(x, y)), crs: '3857' };
  throw new Error('The world file is in a projection we can’t read — use WGS84 (EPSG:4326) or Web Mercator (EPSG:3857)');
}
function groundOverlays(kmlText) {
  const doc = new DOMParser().parseFromString(kmlText, 'application/xml');
  const out = [];
  for (const go of doc.getElementsByTagName('GroundOverlay')) {
    const href = go.getElementsByTagName('href')[0]?.textContent?.trim();
    const name = go.getElementsByTagName('name')[0]?.textContent?.trim() || '';
    const num = (el, t) => +(el.getElementsByTagName(t)[0]?.textContent || NaN);
    const box = go.getElementsByTagName('LatLonBox')[0];
    let quad = null;
    if (box) {
      const n = num(box, 'north'), s = num(box, 'south'), e = num(box, 'east'), w = num(box, 'west'), rot = num(box, 'rotation') || 0;
      quad = quadFromBounds(w, s, e, n);
      if (rot) {
        const cx = (w + e) / 2, cy = (n + s) / 2, k = Math.cos(cy * D2R), a = rot * D2R;
        quad = quad.map(([x, y]) => { const dx = (x - cx) * k, dy = y - cy; return [cx + (dx * Math.cos(a) - dy * Math.sin(a)) / k, cy + dx * Math.sin(a) + dy * Math.cos(a)]; });
      }
    } else {
      const lq = [...go.getElementsByTagName('*')].find((el) => el.localName === 'LatLonQuad');
      const co = lq?.getElementsByTagName('coordinates')[0]?.textContent?.trim().split(/\s+/).map((p) => p.split(',').map(Number));
      if (co?.length >= 4) quad = [co[3], co[2], co[1], co[0]].map((c) => c.slice(0, 2)); // KML order: LL, LR, UR, UL
    }
    if (href && quad) out.push({ href, name, quad });
  }
  return out;
}
let tiffLib = null;
function loadGeoTIFF() {
  if (window.GeoTIFF) return Promise.resolve(window.GeoTIFF);
  tiffLib ||= new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = new URL('./vendor/geotiff/geotiff.js', import.meta.url).href;
    sc.onload = () => res(window.GeoTIFF);
    sc.onerror = () => rej(new Error('Could not load the GeoTIFF reader'));
    document.head.appendChild(sc);
  });
  return tiffLib;
}
async function readGeoTIFF(file) {
  const GT = await loadGeoTIFF();
  const tiff = await GT.fromArrayBuffer(await file.arrayBuffer());
  const im = await tiff.getImage();
  const W0 = im.getWidth(), H0 = im.getHeight();
  const k = Math.min(1, MAX_PX / Math.max(W0, H0));
  const w = Math.max(1, Math.round(W0 * k)), h = Math.max(1, Math.round(H0 * k));
  const spp = im.getSamplesPerPixel();
  const bands = Math.min(spp, 4);
  const ras = await im.readRasters({ width: w, height: h, samples: [...Array(bands).keys()], resampleMethod: 'bilinear' });
  const nodata = im.getGDALNoData?.();
  const img = new ImageData(w, h);
  const D = img.data;
  const stretch = (arr) => {
    const sample = [];
    const step = Math.max(1, Math.floor(arr.length / 20000));
    for (let i = 0; i < arr.length; i += step) { const v = arr[i]; if (isFinite(v) && v !== nodata) sample.push(v); }
    sample.sort((a, b) => a - b);
    if (!sample.length) return [0, 1];
    const lo = sample[Math.floor(sample.length * 0.02)], hi = sample[Math.floor(sample.length * 0.98)];
    const isByte = arr instanceof Uint8Array || arr instanceof Uint8ClampedArray;
    return isByte ? [0, 255] : [lo, hi > lo ? hi : lo + 1];
  };
  const rng = [...Array(bands)].map((_, b) => stretch(ras[b]));
  for (let p = 0; p < w * h; p++) {
    const g = (b) => clamp(((ras[b][p] - rng[b][0]) / (rng[b][1] - rng[b][0])) * 255, 0, 255);
    const nd = nodata != null && ras[0][p] === nodata;
    if (bands >= 3) { D[p * 4] = g(0); D[p * 4 + 1] = g(1); D[p * 4 + 2] = g(2); D[p * 4 + 3] = bands === 4 ? ras[3][p] > 255 ? 255 : ras[3][p] : nd ? 0 : 255; }
    else { const v = g(0); D[p * 4] = D[p * 4 + 1] = D[p * 4 + 2] = v; D[p * 4 + 3] = nd || (bands === 2 && !ras[1][p]) ? 0 : 255; }
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').putImageData(img, 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const [x0, y0, x1, y1] = im.getBoundingBox();
  const gk = im.getGeoKeys?.() || {};
  const epsg = gk.ProjectedCSTypeGeoKey || gk.GeographicTypeGeoKey || (gk.GTModelTypeGeoKey === 2 ? 4326 : null);
  let quad, crs;
  const geographic = epsg === 4326 || epsg === 4269 || (gk.GTModelTypeGeoKey === 2) || (!epsg && Math.abs(x0) <= 360 && Math.abs(y1) <= 90);
  if (geographic) { quad = quadFromBounds(x0, y0, x1, y1); crs = '4326'; }
  else if ([3857, 900913, 3785, 102100, 102113].includes(epsg) || (!epsg && Math.abs(x0) <= 2.1e7)) {
    const [w0, s0] = mercToLL(x0, y0), [e0, n0] = mercToLL(x1, y1);
    quad = quadFromBounds(w0, s0, e0, n0); crs = '3857';
  } else throw new Error(`This GeoTIFF uses EPSG:${epsg}. Please re-project it to WGS84 (EPSG:4326) or Web Mercator (EPSG:3857) first.`);
  // rotated / sheared rasters
  const tr = im.fileDirectory?.ModelTransformation;
  if (tr && (tr[1] || tr[4])) throw new Error('Rotated GeoTIFFs are not supported yet');
  return { blob, w, h, quad, crs, name: file.name.replace(/\.[^.]+$/, '') };
}

/**
 * Read picked files into georeferenced pictures: [{ blob, w, h, quad|null, crs, name }].
 * Pick an image with its world file (.pgw/.jgw/.tfw/.wld), a KML/KMZ ground overlay, a GeoTIFF, or plain images.
 */
export async function readGeoImages(fileList) {
  const files = [...fileList];
  const out = [];
  const worlds = new Map(files.filter((f) => WORLD_RE.test(f.name)).map((f) => [base(f.name), f]));
  const byName = new Map(files.map((f) => [f.name.replace(/^.*[\\/]/, '').toLowerCase(), f]));
  for (const f of files) {
    if (TIF_RE.test(f.name)) { out.push(await readGeoTIFF(f)); continue; }
    if (KML_RE.test(f.name)) {
      let kml, entries = null;
      if (/\.kmz$/i.test(f.name)) {
        entries = await unzipEntries(await f.arrayBuffer());
        const k = [...entries.keys()].find((n) => /\.kml$/i.test(n));
        if (!k) throw new Error('No KML inside the KMZ file');
        kml = new TextDecoder().decode(entries.get(k));
      } else kml = await f.text();
      const gos = groundOverlays(kml);
      if (!gos.length) throw new Error('No ground overlay (image) found in that KML/KMZ');
      for (const go of gos) {
        let blob = null;
        const key = go.href.replace(/^\.\//, '');
        if (entries) {
          const hit = entries.get(key) || [...entries.entries()].find(([n]) => n.toLowerCase().endsWith(key.toLowerCase().replace(/^.*\//, '')))?.[1];
          if (hit) blob = new Blob([hit], { type: /\.png$/i.test(key) ? 'image/png' : 'image/jpeg' });
        } else {
          const local = byName.get(key.replace(/^.*[\\/]/, '').toLowerCase());
          if (local) blob = local;
        }
        if (!blob) throw new Error(`The overlay image “${go.href}” was not found — select it together with the KML, or use a KMZ`);
        const sh = await shrink(blob, blob.type);
        out.push({ ...sh, quad: go.quad, crs: '4326', name: go.name || key.replace(/\.[^.]+$/, '') });
      }
      continue;
    }
    if (IMG_RE.test(f.name) || f.type.startsWith('image/')) {
      const bmp = await createImageBitmap(f);
      const W0 = bmp.width, H0 = bmp.height;
      const sh = await shrink(f, f.type);
      let quad = null, crs = '3857';
      const wf = worlds.get(base(f.name));
      if (wf) ({ quad, crs } = quadFromWorld(await wf.text(), W0, H0));
      out.push({ ...sh, quad, crs, name: f.name.replace(/\.[^.]+$/, '') });
    }
  }
  if (!out.length) throw new Error('No image found. Choose a PNG/JPG (optionally with its world file), a GeoTIFF, or a KML/KMZ ground overlay.');
  return out;
}
/** Store a picture as media; returns its id. */
export async function storeImage(blob) {
  const id = `im_${Math.random().toString(36).slice(2, 10)}`;
  await putMedia(id, blob);
  return id;
}
/** A year in a file name ("dubai_2019.jpg" → "2019"), else the name. */
export function labelFromName(name) {
  const m = String(name).match(/(19|20)\d{2}([-_.]?(0[1-9]|1[0-2]))?/);
  return m ? m[0].replace(/[_.]/g, '-') : String(name);
}
