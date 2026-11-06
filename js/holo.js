// Holographic overlays: floating glass panels in real perspective (turn / lean), with glow, scan lines and
// flicker — a globe on a projector, a hologram of the map, charts, ring gauges, a 3D network, an info card and
// a full dashboard. Made to sit over the map or over your own video.
import { placeAt, CUSTOM_POS } from './place.js';
import { drawMapCrop } from './vizfx.js';
import { LAND_MASK } from './landmask.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const D2R = Math.PI / 180;
const UI = '"Inter","Segoe UI",system-ui,sans-serif';
const MONO = '"JetBrains Mono",ui-monospace,Menlo,monospace';
function hexA(hex, a) {
  const h = String(hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function hashStr(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const nums = (s, d) => { const a = String(s ?? '').split(/[\s,;|]+/).map(Number).filter((v) => isFinite(v)); return a.length ? a : d; };

// ---------------------------------------------------------------- land mask
let LAND = null;
function land() {
  if (LAND) return LAND;
  const bin = atob(LAND_MASK);
  LAND = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) LAND[i] = bin.charCodeAt(i);
  return LAND;
}
export function isLand(lon, lat) {
  const r = clamp(Math.floor(89.999 - lat), 0, 179), q = ((Math.floor(lon + 180) % 360) + 360) % 360;
  const k = r * 360 + q;
  return (land()[k >> 3] >> (k & 7)) & 1;
}
let DOTS = null;
function landDots() {
  if (DOTS) return DOTS;
  DOTS = [];
  for (let lat = -84; lat <= 84; lat += 2.2) {
    const step = 2.2 / Math.max(0.18, Math.cos(lat * D2R));
    for (let lon = -180; lon < 180; lon += step) if (isLand(lon, lat)) DOTS.push([lon * D2R, lat * D2R]);
  }
  return DOTS;
}

// ---------------------------------------------------------------- registry
const POS = { center: 'Centre', left: 'Left', right: 'Right', 'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right', ...CUSTOM_POS };
export const HOLO_VARIANTS = {
  globe: 'Holo globe (with projector)', map: 'Holo map of this place', chart: 'Holo chart panel', gauge: 'Holo ring gauges',
  network: 'Holo 3D network', card: 'Holo info card', dashboard: 'Holo dashboard (several panels)', terrain: 'Holo 3D terrain',
};
export const HO_KINDS = { holo: { name: 'Hologram', icon: '◈', geom: null, desc: 'A floating holographic panel in perspective: globe, map, charts, gauges, network, info card or a whole dashboard' } };
export const HO_ANIMS = { holo: { materialize: 'Materialise (scan + flicker)', unfold: 'Unfold', glitch: 'Glitch in', none: 'Already there' } };
export const HO_DEFAULTS = {
  holo: { anim: 'materialize', duration: 1.6, hold: 6, style: {
    variant: 'dashboard', color: '#45e6ff', accent: '#ff9d3c', title: 'GLOBAL OPERATIONS', text: 'Region | Middle East\nAssets online | 1,284\nAlert level | ELEVATED\nUpdated | {time}',
    values: '42, 68, 55, 81, 63, 92, 74, 88', labels: 'Jan, Feb, Mar, Apr, May, Jun, Jul, Aug', gauges: '78, 54, 91', gaugeLabels: 'COVERAGE, LOAD, UPTIME',
    position: 'center', size: 1, turn: -18, lean: 0, depth: 1, float: true, glow: 1, flicker: 0.5, scan: true, blend: 'glow', glass: 0.35,
    spin: 1, rings: true, pedestal: true, marker: true, markerText: '', beam: false,
  } },
};
const isV = (...v) => (L) => v.includes(L.style.variant);
export const HO_FORMS = {
  holo: [
    ['style.variant', 'Hologram', 'select', HOLO_VARIANTS],
    ['style.title', 'Title', 'text'],
    ['style.text', 'Lines (Label | value, one per line — {time} {date} {lat} {lon} work)', 'textarea', null, isV('card', 'dashboard', 'map')],
    ['style.values', 'Chart values (comma separated)', 'text', null, isV('chart', 'dashboard')],
    ['style.labels', 'Chart labels', 'text', null, isV('chart', 'dashboard')],
    ['style.gauges', 'Gauge values in % (comma separated)', 'text', null, isV('gauge', 'dashboard')],
    ['style.gaugeLabels', 'Gauge labels', 'text', null, isV('gauge', 'dashboard')],
    ['style.color', 'Hologram colour', 'color'], ['style.accent', 'Accent colour', 'color'],
    ['style.size', 'Size', 'range', [0.3, 3, 0.05]],
    ['style.position', 'Position', 'select', POS],
    ['style.turn', 'Turn (perspective, degrees)', 'range', [-60, 60, 1]],
    ['style.lean', 'Lean back (degrees — like a table top)', 'range', [-20, 75, 1]],
    ['style.depth', 'Perspective strength', 'range', [0.2, 3, 0.05]],
    ['style.float', 'Floats gently', 'switch'],
    ['style.glow', 'Glow', 'range', [0, 2.5, 0.05]],
    ['style.flicker', 'Flicker', 'range', [0, 1.5, 0.05]],
    ['style.scan', 'Scan lines', 'switch'],
    ['style.glass', 'Glass darkness (readability over bright video)', 'range', [0, 1, 0.05]],
    ['style.blend', 'Blend', 'select', { glow: 'Light (adds light — best over video)', normal: 'Normal' }],
    ['style.spin', 'Rotation speed', 'range', [0, 4, 0.05], isV('globe', 'network', 'terrain')],
    ['style.rings', 'Orbit rings', 'switch', null, isV('globe')],
    ['style.pedestal', 'Projector base + light cone', 'switch', null, isV('globe', 'terrain', 'network')],
    ['style.marker', 'Marker at the map centre', 'switch', null, isV('globe', 'map')],
    ['style.markerText', 'Marker text (empty = coordinates)', 'text', null, (L) => isV('globe', 'map')(L) && L.style.marker !== false],
    ['style.beam', 'Light beam up from the bottom of the video', 'switch', null, (L) => !isV('globe', 'terrain', 'network')(L)],
  ],
};
export const HO_SET = new Set(Object.keys(HO_KINDS));
export const hoPhases = () => ['captions'];

// ---------------------------------------------------------------- offscreen canvases
const offs = new Map();
function off(key, w, h) {
  w = Math.max(2, Math.ceil(w)); h = Math.max(2, Math.ceil(h));
  let c = offs.get(key);
  if (!c) { c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); offs.set(key, c); }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
  g.clearRect(0, 0, w, h);
  return [c, g];
}

/**
 * Draws src (sw × sh device px) into dst with a perspective turn (around the vertical axis) then a lean
 * (around the horizontal axis), centred in dst. Strip rendering — close to a real 3D plane.
 */
function perspective(src, sw, sh, turn, lean, depth, key) {
  const a = turn * D2R, p = lean * D2R;
  const d = (2.4 * Math.max(sw, sh)) / Math.max(0.2, depth);
  let A = src, aw = sw, ah = sh;
  if (Math.abs(a) > 0.002) {
    const kmax = d / (d - (sw / 2) * Math.abs(Math.sin(a)));
    aw = Math.ceil(sw * Math.max(Math.abs(Math.cos(a)), 0.05) * kmax + 4); ah = Math.ceil(sh * kmax + 4);
    const [c, g] = off(`${key}:t`, aw, ah);
    const N = clamp(Math.round(sw / 3), 24, 220);
    for (let i = 0; i < N; i++) {
      const x0 = (i / N) * sw, x1 = ((i + 1) / N) * sw;
      const X = (x) => { const xc = x - sw / 2, z = xc * Math.sin(a); return (xc * Math.cos(a) * d) / (d + z); };
      const xc = (x0 + x1) / 2 - sw / 2, k = d / (d + xc * Math.sin(a));
      const dx0 = X(x0), dx1 = X(x1);
      const hh = sh * k;
      g.drawImage(src, x0, 0, x1 - x0, sh, aw / 2 + Math.min(dx0, dx1) - 0.35, ah / 2 - hh / 2, Math.abs(dx1 - dx0) + 0.7, hh);
    }
    A = c;
  }
  if (Math.abs(p) > 0.002) {
    const kmax = d / (d - (ah / 2) * Math.abs(Math.sin(p)));
    const bw = Math.ceil(aw * kmax + 4), bh = Math.ceil(ah * Math.max(Math.abs(Math.cos(p)), 0.05) * kmax + 4);
    const [c, g] = off(`${key}:l`, bw, bh);
    const N = clamp(Math.round(ah / 3), 24, 220);
    for (let i = 0; i < N; i++) {
      const y0 = (i / N) * ah, y1 = ((i + 1) / N) * ah;
      // top edge leans away from the viewer
      const Y = (y) => { const yc = y - ah / 2, z = -yc * Math.sin(p); return (yc * Math.cos(p) * d) / (d + z); };
      const yc = (y0 + y1) / 2 - ah / 2, k = d / (d - yc * Math.sin(p));
      const dy0 = Y(y0), dy1 = Y(y1), ww = aw * k;
      g.drawImage(A, 0, y0, aw, y1 - y0, bw / 2 - ww / 2, bh / 2 + Math.min(dy0, dy1) - 0.35, ww, Math.abs(dy1 - dy0) + 0.7);
    }
    A = c; aw = bw; ah = bh;
  }
  return [A, aw, ah];
}

// ---------------------------------------------------------------- glass panel chrome
function glassPanel(g, x, y, w, h, col, s, title, unit, t, opt = {}) {
  const glass = clamp(+s.glass || 0, 0, 1);
  rr(g, x, y, w, h, 6 * unit);
  const bg = g.createLinearGradient(x, y, x + w, y + h);
  bg.addColorStop(0, `rgba(4,18,30,${0.25 + glass * 0.6})`); bg.addColorStop(1, `rgba(2,10,20,${0.12 + glass * 0.6})`);
  g.fillStyle = bg; g.fill();
  const tint = g.createLinearGradient(x, y, x, y + h);
  tint.addColorStop(0, hexA(col, 0.16)); tint.addColorStop(0.5, hexA(col, 0.05)); tint.addColorStop(1, hexA(col, 0.14));
  g.fillStyle = tint; g.fill();
  g.lineWidth = 1.4 * unit; g.strokeStyle = hexA(col, 0.85); g.stroke();
  // inner rim + corner brackets
  g.lineWidth = 0.7 * unit; g.strokeStyle = hexA(col, 0.3); rr(g, x + 4 * unit, y + 4 * unit, w - 8 * unit, h - 8 * unit, 4 * unit); g.stroke();
  const c = 12 * unit;
  g.lineWidth = 2.4 * unit; g.strokeStyle = hexA(col, 1);
  g.beginPath();
  g.moveTo(x, y + c); g.lineTo(x, y); g.lineTo(x + c, y);
  g.moveTo(x + w - c, y); g.lineTo(x + w, y); g.lineTo(x + w, y + c);
  g.moveTo(x + w, y + h - c); g.lineTo(x + w, y + h); g.lineTo(x + w - c, y + h);
  g.moveTo(x + c, y + h); g.lineTo(x, y + h); g.lineTo(x, y + h - c);
  g.stroke();
  if (title) {
    g.fillStyle = hexA(col, 1); g.font = `700 ${(opt.titleSize || 11) * unit}px ${UI}`; g.textBaseline = 'top'; g.textAlign = 'left';
    g.fillText(String(title).toUpperCase(), x + 12 * unit, y + 10 * unit);
    g.fillStyle = hexA(col, 0.5);
    g.fillRect(x + 12 * unit, y + 26 * unit, Math.min(w * 0.35, 90 * unit), 1.2 * unit);
    // blinking status dot
    g.fillStyle = hexA(s.accent || '#ff9d3c', Math.sin(t * 5) > 0 ? 1 : 0.35);
    g.beginPath(); g.arc(x + w - 14 * unit, y + 15 * unit, 3 * unit, 0, 7); g.fill();
  }
}
function scanLines(g, w, h, col, unit, t) {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = 'rgba(0,0,0,0.22)';
  const st = Math.max(2, 3 * unit);
  for (let y = 0; y < h; y += st) g.fillRect(0, y, w, st * 0.45);
  g.restore();
  // a bright band sweeping down
  g.save();
  g.globalCompositeOperation = 'source-atop';
  const by = ((t * 0.35) % 1.3 - 0.15) * h;
  const band = g.createLinearGradient(0, by - 30 * unit, 0, by + 30 * unit);
  band.addColorStop(0, hexA(col, 0)); band.addColorStop(0.5, hexA(col, 0.22)); band.addColorStop(1, hexA(col, 0));
  g.fillStyle = band; g.fillRect(0, by - 30 * unit, w, 60 * unit);
  g.restore();
}
const tokens = (txt, o) => {
  const now = new Date();
  const c = o.map?.getCenter?.();
  const tt = Math.floor(o.time || 0);
  const hh = String(14 + Math.floor(tt / 3600)).padStart(2, '0'), mm = String(Math.floor(tt / 60) % 60).padStart(2, '0'), ss = String(tt % 60).padStart(2, '0');
  return String(txt || '')
    .replace(/\{time\}/g, `${hh}:${mm}:${ss}Z`)
    .replace(/\{date\}/g, now.toISOString().slice(0, 10))
    .replace(/\{lat\}/g, c ? `${Math.abs(c.lat).toFixed(4)}°${c.lat >= 0 ? 'N' : 'S'}` : '—')
    .replace(/\{lon\}/g, c ? `${Math.abs(c.lng).toFixed(4)}°${c.lng >= 0 ? 'E' : 'W'}` : '—');
};

// ---------------------------------------------------------------- content drawers (into a panel-sized canvas, in drawing units)
function chartBody(g, x, y, w, h, s, col, unit, t, u) {
  const v = nums(s.values, [42, 68, 55, 81, 63, 92, 74, 88]);
  const labs = String(s.labels || '').split(/\s*,\s*/);
  const max = Math.max(...v) * 1.15 || 1;
  const n = v.length, bw = w / n;
  // grid
  g.strokeStyle = hexA(col, 0.16); g.lineWidth = 0.7 * unit;
  for (let i = 0; i <= 4; i++) { const yy = y + (h * i) / 4; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); }
  g.font = `500 ${7 * unit}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'top';
  const pts = [];
  v.forEach((val, i) => {
    const k = easeOut(clamp(u * 1.6 - i * 0.07, 0, 1));
    const wob = 1 + 0.03 * Math.sin(t * 2.2 + i * 1.3);
    const bh = (val / max) * h * k * wob;
    const bx = x + i * bw + bw * 0.18, ww = bw * 0.64;
    const gr = g.createLinearGradient(0, y + h - bh, 0, y + h);
    gr.addColorStop(0, hexA(col, 0.95)); gr.addColorStop(1, hexA(col, 0.18));
    g.fillStyle = gr; g.fillRect(bx, y + h - bh, ww, bh);
    g.fillStyle = hexA('#ffffff', 0.85); g.fillRect(bx, y + h - bh, ww, 1.5 * unit);
    g.fillStyle = hexA(col, 0.8);
    if (labs[i]) g.fillText(labs[i].slice(0, 4), bx + ww / 2, y + h + 4 * unit);
    pts.push([bx + ww / 2, y + h - bh - 8 * unit]);
  });
  // line through the bar tops with travelling dot
  g.strokeStyle = hexA(s.accent || '#ff9d3c', 0.95); g.lineWidth = 1.6 * unit; g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
  const f = (t * 0.4) % 1, i0 = Math.floor(f * (pts.length - 1)), fr = f * (pts.length - 1) - i0;
  if (pts[i0 + 1]) {
    const px = pts[i0][0] + (pts[i0 + 1][0] - pts[i0][0]) * fr, py = pts[i0][1] + (pts[i0 + 1][1] - pts[i0][1]) * fr;
    g.fillStyle = '#fff'; g.beginPath(); g.arc(px, py, 2.6 * unit, 0, 7); g.fill();
  }
}
function gaugeBody(g, cx, cy, r, val, label, col, acc, unit, t, u) {
  const k = easeOut(u) * clamp(val / 100, 0, 1);
  g.lineCap = 'butt';
  g.strokeStyle = hexA(col, 0.14); g.lineWidth = r * 0.16; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
  g.strokeStyle = hexA(col, 0.95); g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); g.stroke();
  // ticks + spinning outer ring
  g.strokeStyle = hexA(col, 0.5); g.lineWidth = 0.8 * unit;
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; const r0 = r * 1.18, r1 = r * (i % 4 ? 1.24 : 1.3); g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke(); }
  g.strokeStyle = hexA(acc, 0.85); g.lineWidth = 1.6 * unit;
  g.beginPath(); g.arc(cx, cy, r * 1.4, t * 0.8, t * 0.8 + 1.1); g.stroke();
  g.beginPath(); g.arc(cx, cy, r * 1.4, t * 0.8 + Math.PI, t * 0.8 + Math.PI + 0.5); g.stroke();
  g.fillStyle = '#eaffff'; g.font = `300 ${r * 0.5}px ${UI}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(`${Math.round(k * 100)}%`, cx, cy - r * 0.04);
  if (label) { g.fillStyle = hexA(col, 0.9); g.font = `700 ${Math.max(6 * unit, r * 0.17)}px ${UI}`; g.fillText(String(label).toUpperCase(), cx, cy + r * 1.62); }
}
function networkBody(g, cx, cy, R, col, acc, unit, t, s, seed, u) {
  const r = rng(seed);
  const P = [];
  const N = 46;
  for (let i = 0; i < N; i++) { // points on a sphere (fibonacci) with a little jitter
    const yv = 1 - (2 * (i + 0.5)) / N, rad = Math.sqrt(1 - yv * yv), th = i * 2.39996;
    const j = 0.85 + r() * 0.3;
    P.push([Math.cos(th) * rad * j, yv * j, Math.sin(th) * rad * j]);
  }
  const rot = t * 0.5 * (+s.spin || 1), ca = Math.cos(rot), sa = Math.sin(rot), tilt = 0.35;
  const Q = P.map(([x, y, z]) => { const X = x * ca + z * sa, Z = -x * sa + z * ca; const Y = y * Math.cos(tilt) - Z * Math.sin(tilt), Z2 = y * Math.sin(tilt) + Z * Math.cos(tilt); const k = 2.6 / (2.6 + Z2); return [cx + X * R * k, cy + Y * R * k, Z2]; });
  g.lineWidth = 0.7 * unit;
  const lim = 0.62;
  let e = 0;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const d = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1], P[i][2] - P[j][2]);
    if (d > lim) continue;
    if (++e / 140 > u) continue;
    const z = (Q[i][2] + Q[j][2]) / 2;
    g.strokeStyle = hexA(col, 0.18 + 0.5 * (1 - (z + 1) / 2));
    g.beginPath(); g.moveTo(Q[i][0], Q[i][1]); g.lineTo(Q[j][0], Q[j][1]); g.stroke();
  }
  Q.forEach((q, i) => {
    const near = 1 - (q[2] + 1) / 2;
    const hot = i % 9 === 0;
    g.fillStyle = hot ? hexA(acc, 0.95) : hexA(col, 0.4 + 0.6 * near);
    g.beginPath(); g.arc(q[0], q[1], (hot ? 2.6 : 1.6) * unit * (0.7 + near * 0.6), 0, 7); g.fill();
  });
  // inner crystal core
  g.strokeStyle = hexA('#ffffff', 0.5); g.lineWidth = 1 * unit;
  g.beginPath();
  for (let i = 0; i <= 6; i++) { const a = rot * 1.5 + (i / 6) * Math.PI * 2; const x = cx + Math.cos(a) * R * 0.28, y = cy + Math.sin(a) * R * 0.28 * 0.6; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
}
function cardLines(g, x, y, w, s, col, unit, t, u, o, size = 10) {
  const lines = tokens(s.text, o).split('\n').filter((l) => l.trim());
  let yy = y;
  lines.forEach((ln, i) => {
    const k = clamp(u * 1.8 - i * 0.12, 0, 1);
    if (k <= 0) return;
    const [a, b] = ln.includes('|') ? ln.split('|').map((v) => v.trim()) : [ln.trim(), ''];
    const full = b ? `${a}` : a;
    g.globalAlpha = 1;
    g.font = `500 ${size * 0.82 * unit}px ${UI}`; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = hexA(col, 0.75);
    g.fillText(full.slice(0, Math.ceil(full.length * k)).toUpperCase(), x, yy);
    if (b) {
      g.font = `600 ${size * unit}px ${MONO}`; g.textAlign = 'right'; g.fillStyle = /alert|elevated|high|critical|warning/i.test(b) ? (s.accent || '#ff9d3c') : '#eaffff';
      g.fillText(b.slice(0, Math.ceil(b.length * k)), x + w, yy - 1 * unit);
    }
    g.fillStyle = hexA(col, 0.18); g.fillRect(x, yy + size * 1.45 * unit, w, 0.7 * unit);
    yy += size * 2.05 * unit;
  });
  return yy;
}
function terrainBody(g, x, y, w, h, col, acc, unit, t, s, seed, u) {
  const nx = 26, ny = 16;
  const r = rng(seed);
  const ph = [r() * 6, r() * 6, r() * 6];
  const H = (i, j) => { const a = i / nx, b = j / ny; return 0.5 * Math.sin(a * 6 + ph[0]) * Math.cos(b * 5 + ph[1]) + 0.35 * Math.sin(a * 13 + b * 7 + ph[2]) + 0.6 * Math.exp(-((a - 0.55) ** 2 + (b - 0.45) ** 2) * 14); };
  const rot = t * 0.18 * (+s.spin || 1);
  const pt = (i, j) => {
    const X = i / nx - 0.5, Z = j / ny - 0.5;
    const xr = X * Math.cos(rot) - Z * Math.sin(rot), zr = X * Math.sin(rot) + Z * Math.cos(rot);
    const k = 2.2 / (2.2 + zr);
    const hh = H(i, j) * easeOut(u);
    return [x + w / 2 + xr * w * 0.95 * k, y + h * 0.6 + zr * h * 0.55 * k - hh * h * 0.32 * k, hh];
  };
  g.lineWidth = 0.7 * unit;
  for (let j = 0; j <= ny; j++) {
    g.beginPath();
    for (let i = 0; i <= nx; i++) { const p = pt(i, j); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }
    g.strokeStyle = hexA(col, 0.25 + 0.45 * (j / ny)); g.stroke();
  }
  for (let i = 0; i <= nx; i += 2) {
    g.beginPath();
    for (let j = 0; j <= ny; j++) { const p = pt(i, j); j ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }
    g.strokeStyle = hexA(col, 0.22); g.stroke();
  }
  // peak marker
  const pk = pt(Math.round(nx * 0.55), Math.round(ny * 0.45));
  g.strokeStyle = hexA(acc, 0.95); g.lineWidth = 1.2 * unit;
  g.beginPath(); g.moveTo(pk[0], pk[1]); g.lineTo(pk[0], pk[1] - 26 * unit); g.stroke();
  g.fillStyle = hexA(acc, 1); g.beginPath(); g.arc(pk[0], pk[1], 2.6 * unit, 0, 7); g.fill();
  g.font = `600 ${7.5 * unit}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(`${Math.round(1200 + pk[2] * 900)} m`, pk[0], pk[1] - 28 * unit);
}

// ---------------------------------------------------------------- globe (drawn straight on the frame)
function drawGlobe(ctx, cx, cy, R, s, col, acc, unit, t, u, o, seed) {
  const k = easeOut(u);
  const c = o.map?.getCenter?.();
  const lon0 = (c ? c.lng : 30) * D2R, lat0 = (c ? c.lat : 20) * D2R;
  // rotate from 90° away towards the place
  const spin = (+s.spin || 1);
  const lonC = lon0 - (1 - k) * 2.2 + Math.sin(t * 0.12 * spin) * 0.25 * spin;
  const latC = clamp(lat0 * 0.6, -0.6, 0.6);
  const proj = (lon, lat) => {
    const x = Math.cos(lat) * Math.sin(lon - lonC);
    const y0 = Math.sin(lat), z0 = Math.cos(lat) * Math.cos(lon - lonC);
    const y = y0 * Math.cos(latC) - z0 * Math.sin(latC), z = y0 * Math.sin(latC) + z0 * Math.cos(latC);
    return [cx + x * R, cy - y * R, z];
  };
  // atmosphere
  const at = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.35);
  at.addColorStop(0, hexA(col, 0.35)); at.addColorStop(1, hexA(col, 0));
  ctx.fillStyle = at; ctx.beginPath(); ctx.arc(cx, cy, R * 1.35, 0, 7); ctx.fill();
  const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
  body.addColorStop(0, `rgba(10,60,90,${0.35 + 0.35 * (+s.glass || 0)})`); body.addColorStop(1, `rgba(0,20,40,${0.3 + 0.4 * (+s.glass || 0)})`);
  ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
  // graticule
  ctx.lineWidth = 0.7 * unit;
  for (let la = -60; la <= 60; la += 30) {
    ctx.beginPath(); let pen = false;
    for (let lo = -180; lo <= 180; lo += 4) { const p = proj(lo * D2R, la * D2R); if (p[2] < 0) { pen = false; continue; } pen ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); pen = true; }
    ctx.strokeStyle = hexA(col, la === 0 ? 0.5 : 0.22); ctx.stroke();
  }
  for (let lo = -180; lo < 180; lo += 30) {
    ctx.beginPath(); let pen = false;
    for (let la = -88; la <= 88; la += 4) { const p = proj(lo * D2R, la * D2R); if (p[2] < 0) { pen = false; continue; } pen ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); pen = true; }
    ctx.strokeStyle = hexA(col, 0.22); ctx.stroke();
  }
  // land dots (back side faint)
  const dots = landDots();
  const rd = Math.max(0.6, R / 170) * unit;
  ctx.fillStyle = hexA(col, 0.12);
  for (const [lo, la] of dots) { const p = proj(lo, la); if (p[2] < -0.05) { ctx.fillRect(cx - (p[0] - cx) * 1 - rd * 0.5, p[1] - rd * 0.5, rd, rd); } }
  for (const [lo, la] of dots) {
    const p = proj(lo, la);
    if (p[2] < 0) continue;
    ctx.fillStyle = hexA(col, 0.35 + 0.65 * p[2]);
    ctx.fillRect(p[0] - rd, p[1] - rd, rd * 2, rd * 2);
  }
  // rim
  ctx.strokeStyle = hexA(col, 0.9); ctx.lineWidth = 1.4 * unit; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
  // orbit rings with satellites
  if (s.rings !== false) {
    [[1.32, 0.28, -0.35, 0.5], [1.55, 0.18, 0.25, -0.32], [1.18, 0.42, 0.9, 0.8]].forEach(([rx, ry, rot, sp], i) => {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
      ctx.strokeStyle = hexA(i === 1 ? acc : col, 0.55); ctx.lineWidth = (i === 1 ? 1.2 : 0.9) * unit;
      ctx.setLineDash(i === 2 ? [4 * unit, 5 * unit] : []);
      ctx.beginPath(); ctx.ellipse(0, 0, R * rx, R * ry * rx, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      const a = t * sp * spin + i * 2;
      const sx = Math.cos(a) * R * rx, sy = Math.sin(a) * R * ry * rx;
      const front = Math.sin(a) > 0 || Math.hypot(sx, sy) > R;
      if (front) {
        ctx.fillStyle = i === 1 ? acc : '#eaffff';
        ctx.beginPath(); ctx.arc(sx, sy, 2.8 * unit, 0, 7); ctx.fill();
        ctx.strokeStyle = hexA(i === 1 ? acc : col, 0.4); ctx.lineWidth = 1 * unit; ctx.beginPath(); ctx.arc(sx, sy, 6 * unit, 0, 7); ctx.stroke();
      }
      ctx.restore();
    });
  }
  // marker at the place
  if (s.marker !== false && c && k > 0.6) {
    const p = proj(lon0, lat0);
    if (p[2] > 0) {
      const pu = clamp((k - 0.6) / 0.4, 0, 1);
      const pulse = (t * 0.9) % 1;
      ctx.strokeStyle = hexA(acc, 1 - pulse); ctx.lineWidth = 1.6 * unit;
      ctx.beginPath(); ctx.arc(p[0], p[1], (4 + pulse * 18) * unit, 0, 7); ctx.stroke();
      ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(p[0], p[1], 3.4 * unit, 0, 7); ctx.fill();
      // callout
      const lx = p[0] + R * 0.55, ly = p[1] - R * 0.42;
      ctx.strokeStyle = hexA(acc, 0.9); ctx.lineWidth = 1 * unit;
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + (lx - p[0]) * 0.7 * pu, p[1] + (ly - p[1]) * pu); ctx.lineTo(p[0] + (lx - p[0]) * pu + 70 * unit * pu, p[1] + (ly - p[1]) * pu); ctx.stroke();
      if (pu > 0.9) {
        const txt = s.markerText || `${Math.abs(c.lat).toFixed(3)}°${c.lat >= 0 ? 'N' : 'S'}  ${Math.abs(c.lng).toFixed(3)}°${c.lng >= 0 ? 'E' : 'W'}`;
        ctx.fillStyle = '#eaffff'; ctx.font = `600 ${9 * unit}px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(txt, lx + 2 * unit, ly - 3 * unit);
      }
    }
  }
}
function pedestal(ctx, cx, top, bottom, R, col, unit, t) {
  // projector disc + light cone
  const cone = ctx.createLinearGradient(0, bottom, 0, top);
  cone.addColorStop(0, hexA(col, 0.38)); cone.addColorStop(1, hexA(col, 0));
  ctx.fillStyle = cone;
  ctx.beginPath(); ctx.moveTo(cx - R * 0.42, bottom); ctx.lineTo(cx - R * 1.1, top); ctx.lineTo(cx + R * 1.1, top); ctx.lineTo(cx + R * 0.42, bottom); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 3; i++) {
    const rx = R * (0.55 + i * 0.22), ry = rx * 0.2;
    ctx.strokeStyle = hexA(col, 0.85 - i * 0.22); ctx.lineWidth = (2.2 - i * 0.5) * unit;
    ctx.beginPath(); ctx.ellipse(cx, bottom, rx, ry, 0, 0, 7); ctx.stroke();
  }
  ctx.strokeStyle = hexA('#ffffff', 0.75); ctx.lineWidth = 1.2 * unit;
  ctx.beginPath(); ctx.ellipse(cx, bottom, R * 0.55, R * 0.11, 0, t * 2, t * 2 + 1.4); ctx.stroke();
  // rising particles
  const r = rng(77);
  for (let i = 0; i < 26; i++) {
    const ph = (t * (0.18 + r() * 0.2) + r()) % 1;
    const x = cx + (r() - 0.5) * R * (0.8 + ph * 1.2), y = bottom - ph * (bottom - top);
    ctx.fillStyle = hexA(col, 0.8 * (1 - ph)); ctx.fillRect(x, y, 1.6 * unit, 1.6 * unit);
  }
}

let SAMPLE = null;
// ---------------------------------------------------------------- main
const BASE = { globe: [380, 380], map: [420, 280], chart: [360, 230], gauge: [400, 190], network: [300, 300], card: [300, 230], dashboard: [760, 430], terrain: [420, 260] };

export function drawHolo(ctx, L, tm, o, phase) {
  if (phase !== 'captions' || !o.frame) return;
  const s = L.style, fr = o.frame, t = o.time || 0;
  const v = BASE[s.variant] ? s.variant : 'dashboard';
  const unit = o.unit * (+s.size || 1);
  const col = s.color || '#45e6ff', acc = s.accent || '#ff9d3c';
  const inDur = Math.min(1.4, Math.max(0.3, +L.duration || 1.6));
  const u = tm.edit || L.anim === 'none' ? 1 : clamp(tm.tau / inDur, 0, 1);
  const [bw, bh] = BASE[v];
  const W = bw * unit, H = bh * unit;
  // position
  const m = 40 * o.unit;
  const pos = s.position || 'center';
  let cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2;
  if (/left/.test(pos)) cx = fr.x + m + W / 2;
  if (/right/.test(pos)) cx = fr.x + fr.w - m - W / 2;
  if (/top/.test(pos)) cy = fr.y + m + H / 2;
  if (/bottom/.test(pos)) cy = fr.y + fr.h - m - H / 2;
  ctx.save();
  placeAt(ctx, L, fr, cx - W / 2, cy - H / 2, W, H);
  if (s.float !== false && !tm.edit) cy += Math.sin(t * 1.3 + (hashStr(L.id) % 7)) * 4 * unit;
  // flicker + appearance
  const fl = +s.flicker || 0;
  const nz = rng(Math.floor(t * 24) + hashStr(L.id))();
  let a = tm.alpha * (1 - fl * 0.06 * (0.5 + 0.5 * Math.sin(t * 37)) - (nz > 0.965 ? fl * 0.45 : 0));
  let reveal = 1, sy = 1, gx = 0;
  if (!tm.edit) {
    if (L.anim === 'materialize') { reveal = easeOut(u); a *= u < 1 ? (0.55 + 0.45 * (rng(Math.floor(t * 30))() > 0.3)) : 1; }
    else if (L.anim === 'unfold') { sy = Math.max(0.02, easeOut(u)); }
    else if (L.anim === 'glitch') { a *= u < 1 ? (rng(Math.floor(t * 40))() > 0.25 ? 1 : 0.2) : 1; gx = (1 - u) * 26 * unit; }
  }
  ctx.globalAlpha *= clamp(a, 0, 1);
  if (s.blend !== 'normal') ctx.globalCompositeOperation = 'lighter';
  const S = Math.max(1, Math.abs(ctx.getTransform().a) || 1);
  const seed = hashStr(L.id);

  // ---- globe / free-standing objects draw straight onto the frame
  if (v === 'globe') {
    const R = Math.min(W, H) * 0.36;
    const gcy = cy - (s.pedestal !== false ? H * 0.06 : 0);
    if (s.pedestal !== false) pedestal(ctx, cx, gcy + R * 0.6, gcy + R * 1.55, R, col, unit, t);
    ctx.save();
    if (reveal < 1) { ctx.beginPath(); ctx.rect(cx - W, gcy + R * 1.4 - reveal * R * 2.9, W * 2, H * 2); ctx.clip(); }
    ctx.translate(cx, gcy); ctx.scale(1, sy); ctx.translate(-cx, -gcy);
    drawGlobe(ctx, cx + gx, gcy, R, s, col, acc, unit, t, u, o, seed);
    ctx.restore();
    if (s.title) {
      ctx.fillStyle = hexA(col, 1); ctx.font = `700 ${12 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(String(s.title).toUpperCase(), cx, gcy + R * (s.pedestal !== false ? 1.75 : 1.45));
    }
    ctx.restore();
    return;
  }

  // ---- panels: draw flat into an offscreen canvas, then warp into perspective
  const pad = 18 * unit;
  const PW = W + pad * 2, PH = H + pad * 2;
  const [C, g] = off(`${L.id}:c`, PW * S, PH * S);
  g.scale(S, S);
  g.translate(pad, pad);
  const box = (x, y, w, h, title) => glassPanel(g, x, y, w, h, col, s, title, unit, t);
  if (v === 'chart') {
    box(0, 0, W, H, s.title || 'Analytics');
    chartBody(g, 18 * unit, 40 * unit, W - 36 * unit, H - 70 * unit, s, col, unit, t, u);
  } else if (v === 'gauge') {
    box(0, 0, W, H, s.title || 'System status');
    const vals = nums(s.gauges, [78, 54, 91]).slice(0, 4), labs = String(s.gaugeLabels || '').split(/\s*,\s*/);
    const n = vals.length, rr0 = Math.min((W / n) * 0.26, H * 0.24);
    vals.forEach((val, i) => gaugeBody(g, (W * (i + 0.5)) / n, H * 0.5, rr0, val, labs[i], i === 1 ? acc : col, i === 1 ? col : acc, unit, t + i, clamp(u * 1.4 - i * 0.15, 0, 1)));
  } else if (v === 'network') {
    if (s.pedestal === false) box(0, 0, W, H, s.title || '');
    networkBody(g, W / 2, H * 0.47, Math.min(W, H) * 0.36, col, acc, unit, t, s, seed, u);
    if (s.pedestal !== false && s.title) { g.fillStyle = hexA(col, 1); g.font = `700 ${11 * unit}px ${UI}`; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(String(s.title).toUpperCase(), W / 2, H * 0.9); }
  } else if (v === 'terrain') {
    if (s.pedestal === false) box(0, 0, W, H, s.title || 'Terrain model');
    terrainBody(g, 10 * unit, 30 * unit, W - 20 * unit, H - 40 * unit, col, acc, unit, t, s, seed, u);
    if (s.pedestal !== false && s.title) { g.fillStyle = hexA(col, 1); g.font = `700 ${11 * unit}px ${UI}`; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(String(s.title).toUpperCase(), 10 * unit, 6 * unit); }
  } else if (v === 'card') {
    box(0, 0, W, H, s.title || 'Info');
    // emblem
    const ex = 34 * unit, ey = 62 * unit;
    g.strokeStyle = hexA(col, 0.9); g.lineWidth = 1.4 * unit; g.beginPath(); g.arc(ex, ey, 18 * unit, 0, 7); g.stroke();
    g.strokeStyle = hexA(acc, 0.9); g.beginPath(); g.arc(ex, ey, 23 * unit, t, t + 2); g.stroke();
    g.beginPath(); for (let i = 0; i <= 6; i++) { const aa = (i / 6) * Math.PI * 2 + Math.PI / 6; const x = ex + Math.cos(aa) * 10 * unit, y = ey + Math.sin(aa) * 10 * unit; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.strokeStyle = hexA(col, 0.8); g.stroke();
    g.fillStyle = '#eaffff'; g.font = `600 ${9 * unit}px ${MONO}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(`ID ${(seed % 90000) + 10000}-${String.fromCharCode(65 + (seed % 26))}`, 64 * unit, 54 * unit);
    g.fillStyle = hexA(col, 0.7); g.font = `500 ${7.5 * unit}px ${MONO}`; g.fillText(tokens('{lat} {lon}', o), 64 * unit, 68 * unit);
    cardLines(g, 16 * unit, 96 * unit, W - 32 * unit, s, col, unit, t, u, o, 9.5);
  } else if (v === 'map') {
    box(0, 0, W, H, s.title || 'Area of interest');
    const mx = 12 * unit, my = 34 * unit, mw = W - 24 * unit, mh = H - 46 * unit;
    g.save();
    rr(g, mx, my, mw, mh, 4 * unit); g.clip();
    // the map under the middle of the frame, recoloured as a hologram
    const ar = mw / mh;
    let sw = fr.w * 0.62, sh = sw / ar; if (sh > fr.h * 0.8) { sh = fr.h * 0.8; sw = sh * ar; }
    const [MC, mg] = off(`${L.id}:m`, mw * S, mh * S);
    let ok = false;
    try { ok = drawMapCrop(mg, o, fr.x + fr.w / 2 - sw / 2, fr.y + fr.h / 2 - sh / 2, sw, sh, 0, 0, mw * S, mh * S); } catch { ok = false; }
    if (ok) {
      // grey, then light maps are inverted (roads / coasts become the bright lines), then tinted
      mg.globalCompositeOperation = 'saturation'; mg.fillStyle = '#000'; mg.fillRect(0, 0, MC.width, MC.height);
      SAMPLE ||= typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : Object.assign(document.createElement('canvas'), { width: 8, height: 8 });
      const sg = SAMPLE.getContext('2d', { willReadFrequently: true });
      sg.clearRect(0, 0, 8, 8); sg.drawImage(MC, 0, 0, 8, 8);
      let lum = 0.5;
      try { const d = sg.getImageData(0, 0, 8, 8).data; let a = 0; for (let i = 0; i < d.length; i += 4) a += d[i]; lum = a / (64 * 255); } catch { lum = 0.5; }
      if (lum > 0.45) { mg.globalCompositeOperation = 'difference'; mg.fillStyle = '#fff'; mg.fillRect(0, 0, MC.width, MC.height); }
      mg.globalCompositeOperation = 'multiply'; mg.fillStyle = col; mg.fillRect(0, 0, MC.width, MC.height);
      mg.globalCompositeOperation = 'source-over';
      g.globalAlpha = 0.85; g.drawImage(MC, 0, 0, MC.width, MC.height, mx, my, mw, mh); g.globalAlpha = 1;
    }
    // grid, sweep and centre target
    g.strokeStyle = hexA(col, 0.25); g.lineWidth = 0.6 * unit;
    for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(mx + (mw * i) / 8, my); g.lineTo(mx + (mw * i) / 8, my + mh); g.stroke(); }
    for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(mx, my + (mh * i) / 5); g.lineTo(mx + mw, my + (mh * i) / 5); g.stroke(); }
    const sx = mx + ((t * 0.25) % 1) * mw;
    const sg = g.createLinearGradient(sx - 40 * unit, 0, sx, 0); sg.addColorStop(0, hexA(col, 0)); sg.addColorStop(1, hexA(col, 0.4));
    g.fillStyle = sg; g.fillRect(sx - 40 * unit, my, 40 * unit, mh);
    g.restore();
    if (s.marker !== false) {
      const tx = mx + mw / 2, ty = my + mh / 2, pulse = (t * 0.9) % 1;
      g.strokeStyle = hexA(acc, 1 - pulse); g.lineWidth = 1.6 * unit; g.beginPath(); g.arc(tx, ty, (5 + pulse * 22) * unit, 0, 7); g.stroke();
      g.strokeStyle = hexA(acc, 0.95); g.lineWidth = 1.2 * unit;
      g.beginPath(); g.moveTo(tx - 14 * unit, ty); g.lineTo(tx - 5 * unit, ty); g.moveTo(tx + 5 * unit, ty); g.lineTo(tx + 14 * unit, ty); g.moveTo(tx, ty - 14 * unit); g.lineTo(tx, ty - 5 * unit); g.moveTo(tx, ty + 5 * unit); g.lineTo(tx, ty + 14 * unit); g.stroke();
      g.fillStyle = '#fff'; g.font = `600 ${8 * unit}px ${MONO}`; g.textAlign = 'left'; g.textBaseline = 'bottom';
      g.fillText(s.markerText || tokens('{lat}  {lon}', o), tx + 10 * unit, ty - 9 * unit);
    }
    if (!ok) { g.fillStyle = hexA(col, 0.6); g.font = `500 ${9 * unit}px ${UI}`; g.textAlign = 'center'; g.fillText('MAP', W / 2, H / 2); }
  } else { // dashboard — like a wall of floating panels
    const gap = 12 * unit;
    const c1 = W * 0.38, c2 = W * 0.3, c3 = W - c1 - c2 - gap * 2;
    const h1 = H * 0.56, h2 = H - h1 - gap;
    box(0, 0, c1, h1, s.title || 'Overview');
    chartBody(g, 14 * unit, 38 * unit, c1 - 28 * unit, h1 - 64 * unit, s, col, unit, t, u);
    box(0, h1 + gap, c1, h2, 'Status');
    const vals = nums(s.gauges, [78, 54, 91]).slice(0, 3), labs = String(s.gaugeLabels || '').split(/\s*,\s*/);
    vals.forEach((val, i) => gaugeBody(g, (c1 * (i + 0.5)) / vals.length, h1 + gap + h2 * 0.52, Math.min(c1 / vals.length * 0.24, h2 * 0.22), val, labs[i], i === 1 ? acc : col, i === 1 ? col : acc, unit * 0.8, t + i, clamp(u * 1.4 - i * 0.15, 0, 1)));
    box(c1 + gap, 0, c2, H, 'Network');
    networkBody(g, c1 + gap + c2 / 2, H * 0.45, Math.min(c2, H) * 0.36, col, acc, unit, t, s, seed, u);
    // hex readout under the network
    g.font = `500 ${7 * unit}px ${MONO}`; g.textAlign = 'center'; g.fillStyle = hexA(col, 0.75);
    const rnd = rng(Math.floor(t * 4) + seed);
    for (let i = 0; i < 3; i++) g.fillText(Array.from({ length: 4 }, () => Math.floor(rnd() * 65535).toString(16).toUpperCase().padStart(4, '0')).join(' '), c1 + gap + c2 / 2, H * 0.84 + i * 10 * unit);
    const x3 = c1 + c2 + gap * 2;
    box(x3, 0, c3, H * 0.62, 'Data');
    cardLines(g, x3 + 12 * unit, 40 * unit, c3 - 24 * unit, s, col, unit, t, u, o, 8.5);
    box(x3, H * 0.62 + gap, c3, H * 0.38 - gap, 'Signal');
    // live waveform
    const wy = H * 0.62 + gap + (H * 0.38 - gap) * 0.6, wx = x3 + 12 * unit, ww = c3 - 24 * unit;
    g.strokeStyle = hexA(acc, 0.95); g.lineWidth = 1.3 * unit; g.beginPath();
    for (let i = 0; i <= 80; i++) { const xx = wx + (ww * i) / 80; const yy = wy + Math.sin(i * 0.45 + t * 6) * 8 * unit * Math.sin(i * 0.07 + t) + Math.sin(i * 1.7 + t * 11) * 2 * unit; i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }
    g.stroke();
  }
  if (s.scan !== false) { g.setTransform(1, 0, 0, 1, 0, 0); scanLines(g, C.width, C.height, col, unit * S, t); }
  // materialise: reveal from the bottom up with a bright edge
  if (reveal < 1) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    const ry = C.height * (1 - reveal);
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.fillRect(0, 0, C.width, ry);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = hexA('#ffffff', 0.9); g.fillRect(0, ry, C.width, 2 * S * unit);
    const eg = g.createLinearGradient(0, ry, 0, ry + 30 * S * unit); eg.addColorStop(0, hexA(col, 0.6)); eg.addColorStop(1, hexA(col, 0));
    g.fillStyle = eg; g.fillRect(0, ry, C.width, 30 * S * unit);
  }
  // perspective warp
  const [P, pw, ph] = perspective(C, C.width, C.height, +s.turn || 0, +s.lean || 0, +s.depth || 1, L.id);
  const dw = pw / S, dh = (ph / S) * sy;
  const dx = cx - dw / 2 + gx, dy = cy - dh / 2;
  // projector / beam
  const free = (v === 'network' || v === 'terrain') && s.pedestal !== false;
  if (free) pedestal(ctx, cx, cy - H * 0.1, cy + H * 0.55, Math.min(W, H) * 0.42, col, unit, t);
  if (s.beam) {
    const bg = ctx.createLinearGradient(0, fr.y + fr.h, 0, dy + dh);
    bg.addColorStop(0, hexA(col, 0.35)); bg.addColorStop(1, hexA(col, 0.02));
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(cx - 30 * unit, fr.y + fr.h); ctx.lineTo(dx, dy + dh); ctx.lineTo(dx + dw, dy + dh); ctx.lineTo(cx + 30 * unit, fr.y + fr.h); ctx.closePath(); ctx.fill();
  }
  const glow = +s.glow;
  if ((isFinite(glow) ? glow : 1) > 0.02) {
    ctx.save();
    ctx.filter = `blur(${(6 + 6 * (isFinite(glow) ? glow : 1)) * unit}px)`;
    ctx.globalAlpha *= clamp(0.55 * (isFinite(glow) ? glow : 1), 0, 1);
    ctx.drawImage(P, 0, 0, pw, ph, dx, dy, dw, dh);
    ctx.restore();
  }
  ctx.drawImage(P, 0, 0, pw, ph, dx, dy, dw, dh);
  ctx.restore();
}
