// Map camera effects: depth of field (tilt-shift focus band that can rack, blurring the map and optionally the
// labels), a one-click continuous drift pan, an ink-spread area reveal, flickering districts and soft labels.
// Sounds come from the reference recordings in sfx/clips.
import { H, countriesByName } from './cartofx.js';
import { placeAt } from './place.js';
import { parseTable, dataOf, SAMPLE_NAMES } from './geodata.js';
import { zoomRefFor } from './scene.js';

const { clamp, ease, UI, polysOf, pathPolys, labelPoint, hashStr, off } = H;
const D2R = Math.PI / 180;
const seg = (t, a, b) => clamp((t - a) / Math.max(1e-6, b - a), 0, 1);
const rgbOf = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return [200, 20, 30]; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const SND = [['style.sound', 'Sound', 'switch'], ['style.soundVol', 'Sound volume', 'range', [0, 2, 0.05], (L) => L.style.sound !== false]];

export const MX_KINDS = {
  dofblur: { name: 'Depth of field', icon: '◎', geom: null, desc: 'A camera focus band across the map — everything above and below goes soft, like a tilted lens; the focus can rack from near to far, labels can blur with it. Pair it with “Make the camera drift” for a continuous pan' },
  inkreveal: { name: 'Ink-spread reveal', icon: '🩸', geom: 'polygon', desc: 'An area fills like ink spreading on paper from a starting point, with smoky edges that settle into a clean shape' },
  flickerzones: { name: 'Flickering districts', icon: '▦', geom: null, desc: 'Districts, regions or countries flash bright and dark like a failing light, then settle into an outlined map' },
  softlabel: { name: 'Soft map label', icon: 'Aa', geom: 'point', desc: 'A soft white label on the map — “Track Point 1” — that fades and drifts in, and blurs with the depth of field' },
};
export const MX_ANIMS = {
  dofblur: { rack: 'Focus racks from one place to another', breathe: 'Focus drifts back and forth', fade: 'Blur fades in', none: 'Fixed focus' },
  inkreveal: { spread: 'Ink spreads from the start point', fade: 'Fade in', none: 'Shown' },
  flickerzones: { flicker: 'Flicker, then settle', strobe: 'Keep flickering', fade: 'Fade in', none: 'Shown' },
  softlabel: { rise: 'Fade in and drift up', fade: 'Fade in', type: 'Type on', none: 'Shown' },
};
export const MX_DEFAULTS = {
  dofblur: { focusFrom: 0.62, focusTo: 0.42, band: 0.18, feather: 0.32, blur: 9, angle: 0, labels: true, vignette: 0.25, driftKm: 6, driftDir: 90, driftPitch: 55, driftTurn: 6, sound: true, soundVol: 0.8, clip: 'dof-ambient-2' },
  inkreveal: { color: '#b3121e', opacity: 0.85, seedX: 0.12, seedY: 0.55, rough: 0.35, smoke: 0.7, texture: 0.35, edge: false, edgeColor: '#ff2a3a', sound: true, soundVol: 1 },
  flickerzones: { from: 'countries', layerId: '', countries: 'France, Germany, Italy, Spain, Poland, Belgium, Netherlands, Switzerland, Austria, Czechia', data: '', sample: '', color: '#ffffff', fill: 0.18, stroke: '#ffffff', strokeWidth: 1.2, rate: 12, flickerFor: 2.2, maxA: 0.9, sound: true, soundVol: 1 },
  softlabel: { text: 'Track Point 1', size: 1, color: '#ffffff', shadow: 0.6, weight: 500, dot: false, sound: false, soundVol: 0.6 },
};
const DUR = { dofblur: 10, inkreveal: 5, flickerzones: 4, softlabel: 1.6 };
export const MX_LAYER_DEFAULTS = Object.fromEntries(Object.keys(MX_KINDS).map((k) => [k, { anim: Object.keys(MX_ANIMS[k])[0], duration: DUR[k], style: MX_DEFAULTS[k] }]));
export const MX_FORMS = {
  dofblur: [
    ['', '🎥 Make the camera drift (continuous pan) from the current view', 'gvaction', 'dofDrift'],
    ['style.driftKm', 'Drift distance (km over the scene)', 'range', [0.2, 200, 0.1]], ['style.driftDir', 'Drift direction (° on screen: 90 = to the right, 0 = forward)', 'range', [0, 359, 1]],
    ['style.driftPitch', 'Camera tilt for the drift (°)', 'range', [0, 75, 1]], ['style.driftTurn', 'Slow turn during the drift (°)', 'range', [-60, 60, 1]],
    ['style.focusFrom', 'Focus starts at (0 top … 1 bottom)', 'range', [0, 1, 0.01]], ['style.focusTo', 'Focus ends at', 'range', [0, 1, 0.01], (L) => L.anim === 'rack' || L.anim === 'breathe'],
    ['style.band', 'Sharp band height', 'range', [0, 0.8, 0.01]], ['style.feather', 'Soft transition', 'range', [0.02, 0.8, 0.01]],
    ['style.blur', 'Blur strength (px)', 'range', [0, 40, 0.5]], ['style.angle', 'Band angle (°)', 'range', [-60, 60, 1]],
    ['style.labels', 'Blur labels and markers too (put this layer on top)', 'switch'], ['style.vignette', 'Vignette', 'range', [0, 1, 0.01]],
    ...SND,
  ],
  inkreveal: [['style.color', 'Ink colour', 'color'], ['style.opacity', 'Opacity', 'range', [0.1, 1, 0.01]], ['style.seedX', 'Starts from ←→ (0…1 across the area)', 'range', [0, 1, 0.01]], ['style.seedY', 'Starts from ↑↓', 'range', [0, 1, 0.01]], ['style.rough', 'Ragged front', 'range', [0, 1, 0.01]], ['style.smoke', 'Smoky edges while spreading', 'range', [0, 1, 0.01]], ['style.texture', 'Ink texture', 'range', [0, 1, 0.01]], ['style.edge', 'Outline at the end', 'switch'], ['style.edgeColor', 'Outline colour', 'color', null, (L) => !!L.style.edge], ...SND],
  flickerzones: [
    ['style.from', 'Areas from', 'select', { countries: 'Countries (by name)', layer: 'Another layer (areas, boundaries, a thematic map)', data: 'My GeoJSON / KML / shapefile' }],
    ['style.countries', 'Countries (comma-separated)', 'textarea', null, (L) => L.style.from === 'countries'],
    ['style.layerId', 'Layer', 'layerref', 'any', (L) => L.style.from === 'layer'],
    ['style.data', 'Your file with areas', 'datafile', null, (L) => L.style.from === 'data'],
    ['style.color', 'Flash colour', 'color'], ['style.maxA', 'Brightest flash', 'range', [0.1, 1, 0.01]], ['style.rate', 'Flicker speed (flashes / s)', 'range', [1, 40, 0.5]], ['style.flickerFor', 'Flicker for (s)', 'range', [0.2, 10, 0.1]],
    ['style.fill', 'Fill after settling', 'range', [0, 1, 0.01]], ['style.stroke', 'Outline colour', 'color'], ['style.strokeWidth', 'Outline width', 'range', [0, 6, 0.1]], ...SND,
  ],
  softlabel: [['style.text', 'Text', 'text'], ['style.size', 'Size', 'range', [0.4, 4, 0.05]], ['style.color', 'Colour', 'color'], ['style.weight', 'Weight', 'select', { 300: 'Light', 500: 'Medium', 700: 'Bold' }], ['style.shadow', 'Soft shadow', 'range', [0, 1, 0.01]], ['style.dot', 'Dot at the place', 'switch'], ...SND],
};
export const MX_SET = new Set(Object.keys(MX_KINDS));
export const mxPhases = (k) => (k === 'inkreveal' || k === 'flickerzones' ? ['below'] : ['captions']);

const T = (L, tm) => (tm.edit || L.anim === 'none' ? 1e9 : tm.tau || 0);

// ---------------------------------------------------------------- depth of field
function focusAt(L, tm) {
  const s = L.style, D = Math.max(0.5, +L.duration || 10), t = tm.edit ? 0 : tm.tau || 0, a = +s.focusFrom, b = s.focusTo ?? a;
  if (L.anim === 'rack') return a + (b - a) * ease(seg(t, 0.1 * D, 0.9 * D));
  if (L.anim === 'breathe') return a + (b - a) * (0.5 - 0.5 * Math.cos((t / D) * Math.PI * 2));
  return a;
}
function bandGrad(g, fr, f, s, inner) {
  // linear gradient across the band (perpendicular to its angle); alpha 1 = blurred
  const an = (+s.angle || 0) * D2R, nx = -Math.sin(an), ny = Math.cos(an), cx = fr.x + fr.w / 2, cy = fr.y + fr.h * f, Lh = Math.hypot(fr.w, fr.h) / 2 + 2;
  const G = g.createLinearGradient(cx - nx * Lh, cy - ny * Lh, cx + nx * Lh, cy + ny * Lh);
  const half = ((+s.band || 0) * fr.h) / 2 / (2 * Lh), fe = Math.max(0.01, ((+s.feather || 0.3) * fr.h) / (2 * Lh) * inner);
  const c = 0.5, st = [[0, 1], [c - half - fe, 1], [c - half, 0], [c + half, 0], [c + half + fe, 1], [1, 1]];
  for (const [p, a] of st) G.addColorStop(clamp(p, 0, 1), `rgba(0,0,0,${a})`);
  return G;
}
function drawDof(ctx, L, tm, o) {
  const s = L.style, fr = o.frame; if (!fr || !(+s.blur > 0)) return;
  const A = tm.alpha * (L.anim === 'fade' && !tm.edit ? clamp((tm.tau || 0) / 1, 0, 1) : 1); if (A <= 0) return;
  const Tm = ctx.getTransform(), S = Math.abs(Tm.a) || 1, W = Math.max(2, Math.round(fr.w * S)), Hh = Math.max(2, Math.round(fr.h * S));
  const [C, g] = off(`${L.id}:dofc`, W, Hh); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, Hh);
  // 1 · what is on screen: the map (its own canvas in the preview) + what is already drawn on the overlay
  const m = o.map, mc = m?.getCanvas?.();
  if (mc && mc.width && mc !== ctx.canvas) {
    try {
      const ll = m.getCenter(), a0 = m.project(ll), p0 = o.proj([ll.lng, ll.lat]), q = m.unproject([a0.x + 100, a0.y]), pq = o.proj([q.lng, q.lat]);
      const k = Math.hypot(pq[0] - p0[0], pq[1] - p0[1]) / 100 || 1, pr = mc.width / (mc.clientWidth || m.transform?.width || mc.width);
      const sx = pr * (a0.x + (fr.x - p0[0]) / k), sy = pr * (a0.y + (fr.y - p0[1]) / k);
      g.drawImage(mc, sx, sy, (pr * fr.w) / k, (pr * fr.h) / k, 0, 0, W, Hh);
    } catch { /* not ready */ }
  }
  try { g.drawImage(ctx.canvas, Tm.a * fr.x + Tm.e, Tm.d * fr.y + Tm.f, W, Hh, 0, 0, W, Hh); } catch { /* ignore */ }
  const f = focusAt(L, tm);
  const frD = { x: 0, y: 0, w: W, h: Hh };
  // 2 · two blur levels: a mild one close to the band, a strong one further away
  const [B, b] = off(`${L.id}:dofb`, W, Hh);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const ox = Tm.a * fr.x + Tm.e, oy = Tm.d * fr.y + Tm.f;
  if (s.labels !== false) { ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = A; ctx.translate(ox, oy); ctx.fillStyle = bandGrad(ctx, frD, f, s, 0.55); ctx.fillRect(0, 0, W, Hh); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; }
  for (const [lv, inner] of [[0.4, 0.55], [1, 1]]) {
    b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'source-over'; b.clearRect(0, 0, W, Hh);
    const r = (+s.blur || 9) * lv * S; b.filter = `blur(${r.toFixed(1)}px)`;
    const pad = r * 2; b.drawImage(C, -pad, -pad, W + pad * 2, Hh + pad * 2); b.filter = 'none';
    b.globalCompositeOperation = 'destination-in'; b.fillStyle = bandGrad(b, frD, f, s, inner); b.fillRect(0, 0, W, Hh);
    ctx.globalAlpha = A; ctx.drawImage(B, ox, oy);
  }
  if (+s.vignette > 0) { const v = ctx.createRadialGradient(ox + W / 2, oy + Hh / 2, Math.min(W, Hh) * 0.35, ox + W / 2, oy + Hh / 2, Math.max(W, Hh) * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${+s.vignette})`); ctx.globalAlpha = A; ctx.fillStyle = v; ctx.fillRect(ox, oy, W, Hh); }
  ctx.restore();
}

// ---------------------------------------------------------------- noise
function vnoise(x, y, seed) {
  const h = (i, j) => { let n = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, seed) => 0.5 * vnoise(x, y, seed) + 0.27 * vnoise(x * 2.1, y * 2.1, seed + 1) + 0.15 * vnoise(x * 4.3, y * 4.3, seed + 2) + 0.08 * vnoise(x * 8.7, y * 8.7, seed + 3);

// ---------------------------------------------------------------- ink-spread reveal
function drawInk(ctx, L, tm, o) {
  const s = L.style, P = polysOf(L.geom); if (!P.length) return;
  const D = Math.max(0.5, +L.duration || 5), t = T(L, tm), A = tm.alpha * (L.anim === 'fade' && !tm.edit ? clamp((tm.tau || 0) / 0.8, 0, 1) : 1);
  const k = L.anim === 'spread' && !tm.edit ? seg(t, 0, 0.85 * D) : 1;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of P) for (const r of p) for (const ll of r) { const q = o.proj(ll); x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
  if (!isFinite(x0)) return;
  const padX = (x1 - x0) * 0.08, padY = (y1 - y0) * 0.08; x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
  const w = x1 - x0, h = y1 - y0, N = 150, gw = N, gh = Math.max(8, Math.round((N * h) / Math.max(1, w)));
  const [C, g] = off(`${L.id}:ink`, gw, gh); const im = g.createImageData(gw, gh), d = im.data;
  const [cr, cg, cb] = rgbOf(s.color), sx = clamp(+s.seedX, 0, 1), sy = clamp(+s.seedY, 0, 1), seed = hashStr(L.id) % 997;
  const maxd = Math.max(Math.hypot(sx, sy * h / w), Math.hypot(1 - sx, sy * h / w), Math.hypot(sx, (1 - sy) * h / w), Math.hypot(1 - sx, (1 - sy) * h / w));
  const rough = clamp(+s.rough, 0, 1), front = k * (1 + rough * 0.6) + 0.02, tex = clamp(+s.texture, 0, 1);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const u = i / (gw - 1), v = j / (gh - 1), dd = Math.hypot(u - sx, (v - sy) * h / w) / maxd + (fbm(u * 6, v * 6 * h / w, seed) - 0.5) * rough * 1.1;
    let al = clamp((front - dd) / 0.12, 0, 1); if (k >= 1) al = 1;
    const n = fbm(u * 14, v * 14 * h / w, seed + 9), dark = 1 - tex * 0.55 * n;
    const q = (j * gw + i) * 4; d[q] = cr * dark; d[q + 1] = cg * dark; d[q + 2] = cb * dark; d[q + 3] = 255 * al;
  }
  g.putImageData(im, 0, 0);
  ctx.save(); ctx.imageSmoothingEnabled = true;
  // smoky spill outside the shape while spreading
  if (+s.smoke > 0 && k < 1) { ctx.save(); ctx.globalAlpha = A * +s.smoke * 0.55 * (1 - k * k); ctx.filter = `blur(${Math.max(2, Math.round(w / 60))}px)`; ctx.drawImage(C, x0 - w * 0.02, y0 - h * 0.03, w * 1.04, h * 1.06); ctx.restore(); }
  ctx.beginPath(); pathPolys(ctx, P, o.proj); ctx.clip('evenodd');
  ctx.globalAlpha = A * clamp(+s.opacity || 0.85, 0, 1); ctx.drawImage(C, x0, y0, w, h);
  ctx.restore();
  if (s.edge && k >= 1) { ctx.save(); ctx.globalAlpha = A; ctx.beginPath(); pathPolys(ctx, P, o.proj); ctx.strokeStyle = s.edgeColor; ctx.lineWidth = 1.5 * o.unit; ctx.stroke(); ctx.restore(); }
}

// ---------------------------------------------------------------- flickering districts
const fzCache = new Map();
function zonesOf(L, o) {
  const s = L.style;
  if (s.from === 'layer') {
    const X = (o.scene?.layers || []).find((x) => x.id === s.layerId); if (!X) return [];
    const out = polysOf(X.geom).map((p) => [p]);
    if (X.style && ('data' in X.style || 'sample' in X.style)) {
      const Tb = parseTable(dataOf(X.style));
      for (const r of Tb.rows) { const P = polysOf(r.g); if (P.length) out.push(P); else { const nm = Object.values(r.p)[0]; const c = countriesByName(String(nm || '').replace(/[,;]/g, ' ')); if (c && c[0]) out.push(c[0].polys); } }
    }
    return out;
  }
  if (s.from === 'data') { const Tb = parseTable(String(s.data || '')); return Tb.rows.map((r) => polysOf(r.g)).filter((p) => p.length); }
  const key = String(s.countries || ''); const c0 = fzCache.get(L.id); if (c0 && c0.key === key) return c0.z;
  const z = []; let loading = false;
  for (const nm of key.split(',').map((x) => x.trim()).filter(Boolean)) { const c = countriesByName(nm); if (c === null) loading = true; else if (c[0]) z.push(c[0].polys); }
  if (!loading) fzCache.set(L.id, { key, z });
  return z;
}
function drawFlicker(ctx, L, tm, o) {
  const s = L.style, Z = zonesOf(L, o); if (!Z.length) return;
  const t = T(L, tm), A = tm.alpha * (L.anim === 'fade' && !tm.edit ? clamp((tm.tau || 0) / 0.8, 0, 1) : 1), seed = hashStr(L.id) % 1000;
  const F = +s.flickerFor || 2.2, flick = L.anim === 'strobe' ? true : L.anim === 'flicker' && !tm.edit && t < F;
  const rate = +s.rate || 12, frame = Math.floor(t * rate);
  ctx.save();
  Z.forEach((P, i) => {
    let a;
    if (flick) {
      let n = ((frame + 7) * 2654435761 + (i + 3) * 40503 + seed * 97) >>> 0; n = (n ^ (n >>> 15)) * 2246822519 >>> 0; const r = (n % 1000) / 1000;
      const settle = L.anim === 'strobe' ? 0 : seg(t, F * 0.55, F);
      a = (r < 0.35 ? 0.04 : r * +s.maxA) * (1 - settle) + (+s.fill || 0) * settle;
    } else a = +s.fill || 0;
    ctx.beginPath(); pathPolys(ctx, P, o.proj);
    if (a > 0) { ctx.globalAlpha = A * clamp(a, 0, 1); ctx.fillStyle = s.color; ctx.fill('evenodd'); }
    if (+s.strokeWidth > 0) { ctx.globalAlpha = A * (flick ? 0.5 + 0.5 * Math.min(1, a * 2) : 0.9); ctx.strokeStyle = s.stroke; ctx.lineWidth = +s.strokeWidth * o.unit; ctx.lineJoin = 'round'; ctx.stroke(); }
  });
  ctx.restore();
}

// ---------------------------------------------------------------- soft label
function drawSoft(ctx, L, tm, o) {
  const s = L.style, g = L.geom; if (!g || g.type !== 'Point') return;
  const D = Math.max(0.3, +L.duration || 1.6), t = T(L, tm), u = o.unit * (+s.size || 1);
  const k = L.anim === 'none' || tm.edit ? 1 : seg(t, 0, D * 0.8), a = tm.alpha * (L.anim === 'type' ? 1 : ease(k));
  const [x, y] = o.proj(g.coordinates); const txt = String(s.text || '');
  const shown = L.anim === 'type' ? txt.slice(0, Math.round(txt.length * k)) : txt, dy = L.anim === 'rise' ? (1 - ease(k)) * 12 * u : 0;
  ctx.save(); ctx.globalAlpha = a; ctx.font = `${s.weight || 500} ${16 * u}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  placeAt(ctx, L, o.frame, x - 90 * u, y - 14 * u + dy, 180 * u, 28 * u, { key: 'label' });
  if (s.dot) { ctx.beginPath(); ctx.arc(x, y + 14 * u, 3 * u, 0, 7); ctx.fillStyle = s.color; ctx.fill(); }
  ctx.shadowColor = `rgba(0,0,0,${+s.shadow || 0})`; ctx.shadowBlur = 8 * u; ctx.shadowOffsetY = 1.5 * u;
  ctx.fillStyle = s.color; ctx.fillText(shown, x, y + dy);
  ctx.restore();
}

export function drawMapFx(ctx, L, tm, o, phase) {
  if (!o.frame) return;
  if (L.kind === 'dofblur' && phase === 'captions') return drawDof(ctx, L, tm, o);
  if (L.kind === 'inkreveal' && phase === 'below') return drawInk(ctx, L, tm, o);
  if (L.kind === 'flickerzones' && phase === 'below') return drawFlicker(ctx, L, tm, o);
  if (L.kind === 'softlabel' && phase === 'captions') return drawSoft(ctx, L, tm, o);
  return undefined;
}
export function mxSoundEvents(L) {
  const s = L.style || {}; if (s.sound === false) return [];
  const t0 = +L.start || 0, D = Math.max(0.3, +L.duration || 2), v = s.soundVol ?? 1;
  if (L.kind === 'dofblur') return [{ t: t0, type: 'clip', p: { clip: 'dof-ambient-2', dur: D, vol: v, fadeIn: 0.8, fadeOut: 1.2 } }];
  if (L.kind === 'inkreveal') return [{ t: t0, type: 'clip', p: { clip: 'ink-spread', dur: 3, vol: v, fadeIn: 0.02, fadeOut: 0.5 } }]; // effect only — the first 3 s, no music
  if (L.kind === 'flickerzones') return [{ t: t0, type: 'clipflicker', p: { dur: L.anim === 'strobe' ? D : Math.max(0.6, +s.flickerFor + 0.3), rate: +s.rate || 12, vol: v } }];
  if (L.kind === 'softlabel') return [{ t: t0, type: 'swoosh', p: { vol: v * 0.5 } }];
  return [];
}
/** settings buttons */
export const MX_ACTIONS = {
  async dofDrift(L, { map, scene }) {
    const s = L.style, sc = scene; if (!sc) return '';
    const c = map.getCenter(), z = map.getZoom(), fw = map.getContainer().clientWidth || 1280;
    const brg = map.getBearing(), dir = ((+s.driftDir || 0) + brg) * D2R, km = +s.driftKm || 6;
    const dLat = (km / 111.32) * Math.cos(dir), dLon = (km / (111.32 * Math.cos(c.lat * D2R))) * Math.sin(dir);
    const len = Math.max(2, +sc.sceneLength || +sc.duration || 10), zr = +zoomRefFor(z, fw).toFixed(3), pitch = +s.driftPitch || 0;
    const v = (lon, lat, b) => ({ center: [+lon.toFixed(6), +lat.toFixed(6)], zoomRef: zr, bearing: +b.toFixed(1), pitch });
    sc.camera = sc.camera || {}; sc.camera.mode = 'keyframes';
    sc.camera.keys = [{ t: 0, ease: 'linear', view: v(c.lng - dLon / 2, c.lat - dLat / 2, brg - (+s.driftTurn || 0) / 2) }, { t: +len.toFixed(2), ease: 'linear', view: v(c.lng + dLon / 2, c.lat + dLat / 2, brg + (+s.driftTurn || 0) / 2) }];
    L.start = 0; L.duration = len;
    return `Camera drifts ${km} km over ${len.toFixed(1)} s, tilted ${pitch}° — play to see it; change distance, direction or tilt and press the button again`;
  },
};
void SAMPLE_NAMES;
