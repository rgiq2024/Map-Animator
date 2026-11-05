// AI object detection on the imagery under the video frame (Esri / Wayback / Sentinel / Planetary Computer basemaps):
// a YOLO11 oriented-box model trained on DOTA (ships, planes, helicopters, vehicles, storage tanks, harbours…)
// runs in the browser with ONNX Runtime Web. Each find is stored as four map corners, so its length and width are
// measured on the ground and the boxes stay on the objects when the camera moves.
// The layer then draws the boxes with a flicker-in, scan line, measurement lines and labels.
import { placeAt, CUSTOM_POS } from './place.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const D2R = Math.PI / 180;
const UI = '"Inter","Segoe UI",system-ui,sans-serif';
const MONO = '"JetBrains Mono",ui-monospace,Menlo,monospace';
function hexA(hex, a) {
  const h = String(hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };

// ---------------------------------------------------------------- model classes (DOTA v1)
export const DOTA = ['plane', 'ship', 'storage tank', 'baseball diamond', 'tennis court', 'basketball court', 'ground track field', 'harbor', 'bridge', 'large vehicle', 'small vehicle', 'helicopter', 'roundabout', 'soccer ball field', 'swimming pool'];
export const CLASS_INFO = {
  ship: { name: 'Ship', color: '#3fd4ff', icon: '🚢' },
  plane: { name: 'Aircraft', color: '#ffd23f', icon: '✈' },
  helicopter: { name: 'Helicopter', color: '#ff9f43', icon: '🚁' },
  'large vehicle': { name: 'Truck / bus', color: '#ff5d73', icon: '🚛' },
  'small vehicle': { name: 'Car', color: '#7cff6b', icon: '🚗' },
  'storage tank': { name: 'Storage tank', color: '#c08bff', icon: '🛢' },
  harbor: { name: 'Harbour / pier', color: '#4dd0e1', icon: '⚓' },
  bridge: { name: 'Bridge', color: '#ffb86b', icon: '🌉' },
  'swimming pool': { name: 'Swimming pool', color: '#5ab0ff', icon: '🏊' },
  'tennis court': { name: 'Tennis court', color: '#a3e635', icon: '🎾' },
  'basketball court': { name: 'Basketball court', color: '#fb923c', icon: '🏀' },
  'baseball diamond': { name: 'Baseball field', color: '#facc15', icon: '⚾' },
  'ground track field': { name: 'Running track', color: '#f472b6', icon: '🏟' },
  'soccer ball field': { name: 'Football pitch', color: '#4ade80', icon: '⚽' },
  roundabout: { name: 'Roundabout', color: '#e879f9', icon: '⭕' },
  custom: { name: 'Object', color: '#ffffff', icon: '⬚' },
};
export const DEFAULT_CLASSES = ['ship', 'plane', 'helicopter', 'large vehicle', 'small vehicle'];
export const MODEL_URL = 'assets/models/yolo11n-obb.onnx';
const ORT_VER = '1.20.1';

// ---------------------------------------------------------------- layer catalogue
const POS = { 'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right', ...CUSTOM_POS };
export const OD_KINDS = { objdetect: { name: 'AI object detection', icon: '🎯', geom: null, desc: 'Finds ships, aircraft and vehicles on the satellite image and boxes them with their length and width' } };
export const OD_ANIMS = { objdetect: { flicker: 'Flicker in, one by one', scan: 'Scan line reveals them', together: 'All flicker in together', none: 'Already there' } };
export const OD_LOOKS = { bracket: 'Corner brackets (targeting)', box: 'Thin box', fill: 'Filled box (like an analysis tool)', hud: 'Box + crosshair + data tag' };
export const OD_DEFAULTS = {
  objdetect: { anim: 'flicker', duration: 6, style: { objects: [], classes: DEFAULT_CLASSES.join(','), minConf: 0.3, small: false, look: 'fill', color: '#3fd4ff', byClass: true, flicker: true, flickerAlways: false, measure: true, labels: true, labelText: '{class} · {len} × {wid}', conf: false, units: 'm', summary: true, position: 'top-left', size: 1, thick: 1 } },
};
export const OD_FORMS = {
  objdetect: [
    ['style.look', 'Box style', 'select', OD_LOOKS],
    ['style.byClass', 'Colour by type (ship, aircraft, vehicle…)', 'switch'], ['style.color', 'Box colour', 'color', null, (L) => !L.style.byClass],
    ['style.flicker', 'Flicker when each box appears', 'switch'], ['style.flickerAlways', 'Keep flickering softly', 'switch'],
    ['style.measure', 'Length and width lines', 'switch'], ['style.labels', 'Labels', 'switch'],
    ['style.labelText', 'Label — {class} {len} {wid} {conf} {n}', 'text', null, (L) => L.style.labels !== false],
    ['style.units', 'Units', 'select', { m: 'metres', ft: 'feet' }],
    ['style.summary', 'Count card (e.g. 4 ships · 2 aircraft)', 'switch'], ['style.position', 'Card position', 'select', POS, (L) => L.style.summary],
    ['style.size', 'Text size', 'range', [0.5, 2.5, 0.05]], ['style.thick', 'Line thickness', 'range', [0.5, 3, 0.1]],
  ],
};
export const OD_SET = new Set(Object.keys(OD_KINDS));
export const odPhases = () => ['above', 'captions'];

// ---------------------------------------------------------------- geometry helpers
const M_PER_DEG = 111320;
export function distM(a, b) { const k = Math.cos(((a[1] + b[1]) / 2) * D2R); return Math.hypot((b[0] - a[0]) * k * M_PER_DEG, (b[1] - a[1]) * M_PER_DEG); }
/** Length (long side) and width (short side) in metres of a quad of [lng,lat] corners. */
export function quadSize(q) {
  const a = (distM(q[0], q[1]) + distM(q[2], q[3])) / 2, b = (distM(q[1], q[2]) + distM(q[3], q[0])) / 2;
  return a >= b ? { len: a, wid: b, longFirst: true } : { len: b, wid: a, longFirst: false };
}
const fmtLen = (m, units) => (units === 'ft' ? `${(m * 3.281).toFixed(m * 3.281 < 100 ? 1 : 0)} ft` : `${m.toFixed(m < 100 ? 1 : 0)} m`);

// ---------------------------------------------------------------- ONNX runtime + model
let ortP = null, sessP = null;
function loadOrt() {
  if (ortP) return ortP;
  ortP = new Promise((res, rej) => {
    if (window.ort) { res(window.ort); return; }
    const s = document.createElement('script');
    s.src = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/ort.min.js`;
    s.onload = () => { if (!window.ort) { rej(new Error('ONNX Runtime did not load')); return; } window.ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/`; res(window.ort); };
    s.onerror = () => { ortP = null; rej(new Error('Could not load ONNX Runtime (check your connection)')); };
    document.head.appendChild(s);
  });
  return ortP;
}
export function loadModel(url = MODEL_URL) {
  if (!sessP) {
    sessP = loadOrt().then((ort) => ort.InferenceSession.create(url, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }));
    sessP.catch(() => { sessP = null; });
  }
  return sessP;
}

// rotated-box helpers in pixel space
function corners(cx, cy, w, h, a) {
  const c = Math.cos(a), s = Math.sin(a), dx = w / 2, dy = h / 2;
  return [[-dx, -dy], [dx, -dy], [dx, dy], [-dx, dy]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}
function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; }
function clipPoly(subject, clip) { // Sutherland–Hodgman (both convex)
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const A = clip[i], B = clip[(i + 1) % clip.length];
    const inside = (p) => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]) >= 0;
    const inter = (p, q) => { const a1 = B[1] - A[1], b1 = A[0] - B[0], c1 = a1 * A[0] + b1 * A[1], a2 = q[1] - p[1], b2 = p[0] - q[0], c2 = a2 * p[0] + b2 * p[1], d = a1 * b2 - a2 * b1; return d ? [(b2 * c1 - b1 * c2) / d, (a1 * c2 - a2 * c1) / d] : p; };
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const P = inp[j], Q = inp[(j + 1) % inp.length];
      if (inside(Q)) { if (!inside(P)) out.push(inter(P, Q)); out.push(Q); } else if (inside(P)) out.push(inter(P, Q));
    }
  }
  return out;
}
const orient = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return a < 0 ? [...p].reverse() : p; };
function iou(a, b) {
  const pa = orient(a.pts), pb = orient(b.pts);
  const inter = polyArea(clipPoly(pa, pb));
  return inter / Math.max(1e-6, polyArea(pa) + polyArea(pb) - inter);
}

/**
 * Detect objects in an image (canvas). Returns boxes in that canvas's pixels:
 * [{ cls, conf, pts: [[x,y]×4] }]. classes = Set of DOTA class names to keep.
 */
export async function detectCanvas(src, { classes, minConf = 0.3, scale = 1, onProgress } = {}) {
  const ort = await loadOrt();
  const sess = await loadModel();
  const S = 1024;
  const W = Math.round(src.width * scale), H = Math.round(src.height * scale);
  const step = S - 192;
  const xs = [], ys = [];
  for (let x = 0; ; x += step) { xs.push(Math.min(x, Math.max(0, W - S))); if (x + S >= W) break; }
  for (let y = 0; ; y += step) { ys.push(Math.min(y, Math.max(0, H - S))); if (y + S >= H) break; }
  const tiles = [];
  for (const y of [...new Set(ys)]) for (const x of [...new Set(xs)]) tiles.push([x, y]);
  const tile = document.createElement('canvas');
  tile.width = S; tile.height = S;
  const g = tile.getContext('2d', { willReadFrequently: true });
  const input = new Float32Array(3 * S * S);
  const found = [];
  const keep = classes ? new Set([...classes].map((c) => DOTA.indexOf(c)).filter((i) => i >= 0)) : null;
  let k = 0;
  for (const [tx, ty] of tiles) {
    g.fillStyle = 'rgb(114,114,114)'; g.fillRect(0, 0, S, S);
    g.drawImage(src, tx / scale, ty / scale, S / scale, S / scale, 0, 0, S, S);
    const px = g.getImageData(0, 0, S, S).data;
    for (let i = 0, n = S * S; i < n; i++) { input[i] = px[i * 4] / 255; input[n + i] = px[i * 4 + 1] / 255; input[2 * n + i] = px[i * 4 + 2] / 255; }
    const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, S, S]) });
    const t = out[sess.outputNames[0]];
    const [, C, N] = t.dims; // [1, 4 + nc + 1, N]
    const d = t.data, nc = C - 5;
    for (let j = 0; j < N; j++) {
      let best = -1, bc = 0;
      for (let c = 0; c < nc; c++) { const v = d[(4 + c) * N + j]; if (v > bc) { bc = v; best = c; } }
      if (bc < minConf || (keep && !keep.has(best))) continue;
      const cx = d[j], cy = d[N + j], w = d[2 * N + j], h = d[3 * N + j], a = d[(C - 1) * N + j];
      if (w < 3 || h < 3) continue;
      const pts = corners(cx + tx, cy + ty, w, h, a).map(([x, y]) => [x / scale, y / scale]);
      found.push({ cls: DOTA[best] || 'custom', conf: bc, pts });
    }
    k++;
    onProgress?.(k / tiles.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  // rotated non-maximum suppression (per class)
  found.sort((a, b) => b.conf - a.conf);
  const res = [];
  for (const f of found) if (!res.some((r) => r.cls === f.cls && iou(r, f) > 0.3)) res.push(f);
  return res;
}

// ---------------------------------------------------------------- drawing
function objColor(s, o) { return s.byClass !== false ? (CLASS_INFO[o.cls]?.color || s.color || '#3fd4ff') : (s.color || '#3fd4ff'); }
/** Visibility 0..1 and flicker for object i of n. */
function reveal(L, tm, i, n, o, cp, fr) {
  if (tm.edit || L.anim === 'none') return 1;
  const D = Math.max(0.5, +L.duration || 6);
  const span = Math.min(D * 0.7, 0.35 * n + 0.6);
  let t0;
  if (L.anim === 'together') t0 = 0.2;
  else if (L.anim === 'scan') t0 = 0.2 + clamp((cp[1] - fr.y) / fr.h, 0, 1) * Math.min(D * 0.6, 2.4);
  else t0 = 0.2 + (n > 1 ? (i / (n - 1)) * span : 0);
  const u = tm.tau - t0;
  if (u <= 0) return 0;
  if (L.style.flicker === false) return clamp(u / 0.25, 0, 1);
  if (u > 0.5) return 1;
  // flicker: quick on/off bursts settling on
  const r = hash(`${o.id}${Math.floor(u * 22)}`);
  return r > 0.45 + u ? 1 : 0.08;
}
export function drawObjDetect(ctx, L, tm, o, phase) {
  const s = L.style, { proj, unit, frame: fr } = o;
  const objs = (s.objects || []).filter((x) => !x.hidden);
  if (!objs.length) {
    if (phase === 'captions' && tm.edit !== false && fr && o.time == null) return;
    return;
  }
  const k = clamp(+s.size || 1, 0.3, 3), th = clamp(+s.thick || 1, 0.3, 4);
  const t = o.time || 0;
  // order: left → right for the one-by-one reveal
  const items = objs.map((ob) => { const P = ob.q.map(proj); const c = P.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]); return { ob, P, c }; }).sort((a, b) => a.c[0] - b.c[0]);
  if (phase === 'above') {
    items.forEach(({ ob, P, c }, i) => {
      if (P.some((p) => !isFinite(p[0]))) return;
      let a = reveal(L, tm, i, items.length, ob, c, fr) * tm.alpha;
      if (s.flickerAlways && a > 0.5) a *= 0.82 + 0.18 * (hash(`${ob.id}${Math.floor(t * 12)}`) > 0.25 ? 1 : 0.4);
      if (a <= 0.01) return;
      const col = objColor(s, ob);
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.lineJoin = 'round';
      const path = () => { ctx.beginPath(); P.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); };
      const look = s.look || 'fill';
      if (look === 'fill') { path(); ctx.fillStyle = hexA(col, 0.32); ctx.fill(); ctx.strokeStyle = hexA(col, 0.95); ctx.lineWidth = 1.6 * unit * th; ctx.stroke(); }
      else if (look === 'box' || look === 'hud') { path(); ctx.strokeStyle = col; ctx.lineWidth = 1.6 * unit * th; ctx.shadowColor = hexA(col, 0.6); ctx.shadowBlur = 6 * unit; ctx.stroke(); }
      if (look === 'bracket') {
        ctx.strokeStyle = col; ctx.lineWidth = 2.2 * unit * th; ctx.shadowColor = hexA(col, 0.7); ctx.shadowBlur = 6 * unit;
        for (let j = 0; j < 4; j++) {
          const A = P[j], B = P[(j + 1) % 4], Z = P[(j + 3) % 4];
          const f = 0.28;
          ctx.beginPath(); ctx.moveTo(A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f); ctx.lineTo(A[0], A[1]); ctx.lineTo(A[0] + (Z[0] - A[0]) * f, A[1] + (Z[1] - A[1]) * f); ctx.stroke();
        }
      }
      if (look === 'hud') {
        const r = Math.max(6 * unit, Math.hypot(P[0][0] - P[2][0], P[0][1] - P[2][1]) * 0.12);
        ctx.lineWidth = 1 * unit * th; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.moveTo(c[0] - r, c[1]); ctx.lineTo(c[0] + r, c[1]); ctx.moveTo(c[0], c[1] - r); ctx.lineTo(c[0], c[1] + r); ctx.stroke();
      }
      ctx.restore();
    });
    return;
  }
  // captions: measurement lines, labels, count card (labels that would overlap are left out)
  const placed = [];
  const free = (x, y, w, h) => !placed.some((r) => x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1]);
  items.forEach(({ ob, P, c }, i) => {
    if (P.some((p) => !isFinite(p[0]))) return;
    const a = reveal(L, tm, i, items.length, ob, c, fr) * tm.alpha;
    if (a <= 0.01) return;
    const col = objColor(s, ob);
    const sz = quadSize(ob.q);
    // long axis through the middle of the short sides, short axis through the middle of the long sides
    const mid = (A, B) => [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    const [L1, L2] = sz.longFirst ? [mid(P[3], P[0]), mid(P[1], P[2])] : [mid(P[0], P[1]), mid(P[2], P[3])];
    const [W1, W2] = sz.longFirst ? [mid(P[0], P[1]), mid(P[2], P[3])] : [mid(P[3], P[0]), mid(P[1], P[2])];
    const late = tm.edit ? 1 : clamp(a, 0, 1);
    ctx.save();
    ctx.globalAlpha *= late;
    const fs = 10.5 * unit * k;
    const tag = (txt, x, y, bg) => {
      ctx.font = `600 ${fs}px ${MONO}`;
      const w = ctx.measureText(txt).width + fs * 0.9, h = fs * 1.55;
      if (!free(x - w / 2, y - h / 2, w, h)) return 0;
      placed.push([x - w / 2, y - h / 2, w, h]);
      ctx.fillStyle = bg || 'rgba(20,24,30,0.86)'; ctx.fillRect(x - w / 2, y - h / 2, w, h);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y + fs * 0.05);
      return h;
    };
    const pxLen = Math.hypot(L2[0] - L1[0], L2[1] - L1[1]);
    if (s.measure !== false && pxLen > 46 * unit * k) {
      ctx.strokeStyle = col; ctx.lineWidth = 1.3 * unit * th;
      const grow = tm.edit ? 1 : clamp((tm.tau - 0) * 1, 0, 1);
      ctx.beginPath(); ctx.moveTo(L1[0], L1[1]); ctx.lineTo(L1[0] + (L2[0] - L1[0]) * grow, L1[1] + (L2[1] - L1[1]) * grow); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W1[0], W1[1]); ctx.lineTo(W2[0], W2[1]); ctx.stroke();
      // end ticks
      const tick = (A, B) => { const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * 4 * unit, ny = (dx / l) * 4 * unit; for (const E of [A, B]) { ctx.beginPath(); ctx.moveTo(E[0] - nx, E[1] - ny); ctx.lineTo(E[0] + nx, E[1] + ny); ctx.stroke(); } };
      tick(L1, L2); tick(W1, W2);
      const cxm = (L1[0] + L2[0]) / 2, cym = (L1[1] + L2[1]) / 2;
      tag(fmtLen(sz.wid, s.units), cxm + fs * 1.6, cym - fs * 1.1);
      tag(fmtLen(sz.len, s.units), cxm - fs * 0.4, cym + fs * 0.55);
    }
    if (s.labels !== false) {
      const info = CLASS_INFO[ob.cls] || CLASS_INFO.custom;
      const txt = String(s.labelText || '{class}').replace(/\{(\w+)\}/g, (_, key) => ({ class: ob.name || info.name, len: fmtLen(sz.len, s.units), wid: fmtLen(sz.wid, s.units), conf: `${Math.round((ob.conf || 1) * 100)}%`, n: String(i + 1) })[key] ?? '');
      let top = Infinity, lx = 0;
      for (const p of P) if (p[1] < top) { top = p[1]; lx = p[0]; }
      ctx.font = `700 ${fs * 1.05}px ${UI}`;
      const w = ctx.measureText(txt).width + fs, h = fs * 1.7;
      const x = clamp(lx - w / 2, fr ? fr.x + 4 : -1e9, fr ? fr.x + fr.w - w - 4 : 1e9);
      let y = top - h - 6 * unit;
      if (!free(x, y, w, h)) { let bot = -Infinity; for (const p of P) bot = Math.max(bot, p[1]); y = bot + 6 * unit; }
      if (!free(x, y, w, h)) { ctx.restore(); return; }
      placed.push([x, y, w, h]);
      ctx.fillStyle = hexA(col, 0.95); ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#06121a'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, x + fs / 2, y + h / 2 + fs * 0.04);
      if (s.conf) { ctx.font = `600 ${fs * 0.85}px ${MONO}`; ctx.fillStyle = hexA(col, 0.95); ctx.fillText(`${Math.round((ob.conf || 1) * 100)}%`, x + w + 4 * unit, y + h / 2); }
    }
    ctx.restore();
  });
  if (s.summary && fr) {
    const counts = {};
    items.forEach(({ ob, c }, i) => { if (reveal(L, tm, i, items.length, ob, c, fr) > 0.5) counts[ob.cls] = (counts[ob.cls] || 0) + 1; });
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return;
    const W = 230 * unit * k, rh = 22 * unit * k, H = 38 * unit * k + rows.length * rh;
    const m = 26 * unit;
    const pos = s.position || 'top-left';
    const x = pos.includes('right') ? fr.x + fr.w - m - W : fr.x + m, y = pos.includes('bottom') ? fr.y + fr.h - m - H - 120 * unit : fr.y + m + 90 * unit;
    ctx.save();
    ctx.globalAlpha *= tm.alpha;
    placeAt(ctx, L, fr, x, y, W, H);
    ctx.fillStyle = 'rgba(6,12,20,0.84)'; ctx.fillRect(x, y, W, H);
    ctx.fillStyle = s.color || '#3fd4ff'; ctx.fillRect(x, y, 3 * unit, H);
    ctx.fillStyle = '#fff'; ctx.font = `700 ${12 * unit * k}px ${UI}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText('OBJECTS DETECTED', x + 14 * unit, y + 19 * unit * k);
    rows.forEach(([cls, n], j) => {
      const info = CLASS_INFO[cls] || CLASS_INFO.custom, yy = y + 38 * unit * k + rh * (j + 0.5);
      ctx.fillStyle = s.byClass !== false ? info.color : (s.color || '#3fd4ff'); ctx.fillRect(x + 14 * unit, yy - 5 * unit * k, 10 * unit * k, 10 * unit * k);
      ctx.fillStyle = '#e8eef5'; ctx.font = `600 ${11.5 * unit * k}px ${UI}`; ctx.textAlign = 'left'; ctx.fillText(info.name, x + 32 * unit * k, yy);
      ctx.font = `700 ${13 * unit * k}px ${MONO}`; ctx.textAlign = 'right'; ctx.fillText(String(n), x + W - 14 * unit, yy);
    });
    ctx.restore();
  }
}
