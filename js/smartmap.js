// Smart maps: data-driven layers for location-analysis stories — a cell mosaic coloured by value (population),
// glowing hot spots (income), candidate-site rings, drive-time areas growing around sites, glowing revenue halos
// with a hatch pattern, a heat map and sized circles — each revealed with a soft blurred wipe, a fade, a grow or a
// pop. Plus an animated legend whose entries type themselves in, and a tilted 3D info card above a place.
import { placeAt, CUSTOM_POS } from './place.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const D2R = Math.PI / 180;
const UI = '"Inter","Segoe UI",system-ui,sans-serif';
const MONO = '"JetBrains Mono",ui-monospace,monospace';
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
function rgb(hex) { const h = String(hex || '#fff').replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const hexA = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
function mix(a, b, t) { const A = rgb(a), B = rgb(b); return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`; }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
const POS = { 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right', 'top-left': 'Top left', 'top-right': 'Top right', ...CUSTOM_POS };

export const SM_MODES = {
  cells: 'Cell mosaic coloured by value (e.g. population)',
  glow: 'Glowing hot spots (e.g. income)',
  rings: 'Site rings (e.g. potential stores)',
  reach: 'Drive-time areas around the sites',
  halo: 'Glowing halos with hatching (e.g. projected revenue)',
  heat: 'Heat map',
  circles: 'Circles sized by value',
};
const RAMPS = {
  blue: ['#0d1f3d', '#1d4a8f', '#3a7be0', '#7fb6ff', '#dcecff'],
  orange: ['#3d1a05', '#8a3f0f', '#e0782e', '#ffb072', '#ffe6cc'],
  green: ['#0b2a14', '#1f6b35', '#43b062', '#8fe39d', '#e2ffe6'],
  yellow: ['#2b2a08', '#6f6a14', '#c8d43a', '#eef27a', '#fbffd8'],
  white: ['#2a2e33', '#5d646d', '#9aa3ad', '#d4d9de', '#ffffff'],
  purple: ['#1e0d3d', '#4a1f8f', '#7c4dff', '#b9a1ff', '#efe8ff'],
};
const RAMP_NAMES = { blue: 'Blue', orange: 'Orange', green: 'Green', yellow: 'Yellow-green', white: 'White', purple: 'Purple' };
const rampAt = (ramp, t) => { const r = RAMPS[ramp] || RAMPS.blue; const x = clamp(t, 0, 1) * (r.length - 1); const i = Math.min(r.length - 2, Math.floor(x)); return mix(r[i], r[i + 1], x - i); };

export const SM_KINDS = {
  smartmap: { name: 'Smart map (data)', icon: '📊', geom: 'polygon', desc: 'Data layer over a region: value mosaic, glowing hot spots, site rings, drive-time areas, revenue halos, heat map or circles' },
  legend: { name: 'Map legend', icon: '◎', geom: null, desc: 'A legend whose entries type themselves in one by one' },
  infocard: { name: '3D info card', icon: '🪧', geom: 'point', desc: 'A tilted card floating above a place: title, address, picture, badge, progress bars and a chart' },
};
export const SM_ANIMS = {
  smartmap: { wipe: 'Soft wipe across (blurred)', grow: 'Grow from the data points', fade: 'Fade in', pop: 'Pop in one by one', none: 'Already there' },
  legend: { type: 'Entries type in' },
  infocard: { rise: 'Rise up and fill', none: 'Already there' },
};
export const SM_DEFAULTS = {
  smartmap: { anim: 'wipe', duration: 2.5, style: { mode: 'cells', ramp: 'blue', opacity: 0.8, cellKm: 12, spreadKm: 40, reachKm: 25, size: 1, wipeDir: 160, glow: true, sparkle: true, clip: true, data: [], dataName: '', seed: 0 } },
  legend: { anim: 'type', duration: 1, style: { items: 'Population | #4f8cff | 0\nIncome | #ff8a3d | 3\nPotential stores | #ffffff | 6', position: 'bottom-left', size: 1, icon: 'ring' } },
  infocard: { anim: 'rise', duration: 2.5, style: { title: 'New store location', line1: '12 Market Street', line2: 'Your City', badge: 'NOW OPEN', bars: 'Foot traffic: 71 | #4f8cff\nIncome match: 60 | #ff8a3d\nDrive access: 76 | #43b062', chart: true, media: '', tilt: 0.35, width: 300, height: 120, accent: '#43b062' } },
};
export const SM_FORMS = {
  smartmap: [['style.mode', 'Show', 'select', SM_MODES], ['style.ramp', 'Colours', 'select', RAMP_NAMES], ['style.opacity', 'Opacity', 'range', [0.1, 1, 0.01]], ['style.cellKm', 'Cell size (km)', 'range', [0.3, 60, 0.1], (L) => L.style.mode === 'cells'], ['style.spreadKm', 'How far each value spreads (km)', 'range', [0.5, 200, 0.5], (L) => ['cells', 'glow', 'heat'].includes(L.style.mode)], ['style.reachKm', 'Drive-time reach (km)', 'range', [0.5, 120, 0.5], (L) => ['reach', 'halo'].includes(L.style.mode)], ['style.size', 'Symbol size', 'range', [0.3, 4, 0.05], (L) => ['rings', 'circles', 'halo', 'glow'].includes(L.style.mode)], ['style.wipeDir', 'Wipe from (°)', 'range', [0, 359, 1], (L) => L.anim === 'wipe'], ['style.glow', 'Glow', 'switch'], ['style.sparkle', 'Fine detail sparkle', 'switch', null, (L) => L.style.mode === 'cells'], ['style.clip', 'Only inside the region', 'switch'], ['style.seed', 'Shuffle', 'number', 1]],
  legend: [['style.items', 'Entries — “Label | colour | appears at (s)”, one per line', 'textarea'], ['style.icon', 'Symbol', 'select', { ring: 'Ring', dot: 'Dot', square: 'Square' }], ['style.size', 'Size', 'range', [0.5, 2.5, 0.05]], ['style.position', 'Position', 'select', POS]],
  infocard: [['style.title', 'Title', 'text'], ['style.line1', 'Line 1 (address)', 'text'], ['style.line2', 'Line 2', 'text'], ['style.badge', 'Badge (empty = none)', 'text'], ['style.bars', 'Bars — “Label: percent | colour”, one per line', 'textarea'], ['style.chart', 'Rising chart', 'switch'], ['style.media', 'Picture (optional — a building sketch is drawn otherwise)', 'image'], ['style.accent', 'Accent colour', 'color'], ['style.tilt', 'Tilt (3D)', 'range', [0, 0.7, 0.01]], ['style.width', 'Width (px)', 'range', [180, 520, 1]], ['style.height', 'Height above the place (px)', 'range', [20, 300, 1]]],
};
export const SM_SET = new Set(Object.keys(SM_KINDS));
export const smPhases = (k) => (k === 'smartmap' ? ['below', 'above'] : k === 'legend' ? ['captions'] : ['above']);

// ---------------------------------------------------------------- data
/** Sample data: clustered points with values inside the region (clearly sample — load your CSV to replace). */
export function sampleData(ring, n = 160, seed = 1) {
  const r = rng(seed * 7919 + 13);
  let w = Infinity, so = Infinity, e = -Infinity, no = -Infinity;
  for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); so = Math.min(so, y); no = Math.max(no, y); }
  const inside = (p) => inRing(p, ring);
  const centres = [];
  for (let k = 0; k < 60 && centres.length < 6; k++) { const p = [w + r() * (e - w), so + r() * (no - so)]; if (inside(p)) centres.push({ p, w: 0.4 + r() }); }
  const out = [];
  for (let i = 0; i < n * 4 && out.length < n; i++) {
    const c = centres[Math.floor(r() * centres.length)] || { p: [(w + e) / 2, (so + no) / 2], w: 1 };
    const a = r() * Math.PI * 2, d = Math.abs((r() + r() + r() - 1.5) / 1.5) * (e - w) * 0.09 * (0.6 + c.w);
    const p = [c.p[0] + Math.cos(a) * d, c.p[1] + Math.sin(a) * d * 0.85];
    if (!inside(p)) continue;
    out.push([+p[0].toFixed(5), +p[1].toFixed(5), Math.round((0.15 + r() ** 2) * 1000 * c.w)]);
  }
  return out;
}
function inRing(p, ring) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-12) + xi) ins = !ins;
  }
  return ins;
}
const ringsOf = (g) => (g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []);
const outer = (g) => { const ps = ringsOf(g); let best = null, bl = -1; for (const p of ps) if (p[0].length > bl) { bl = p[0].length; best = p[0]; } return best; };

const cellCache = new Map();
function cellsOf(L) {
  const s = L.style;
  const key = JSON.stringify([L.geom?.coordinates?.length, outer(L.geom)?.length, outer(L.geom)?.[0], s.cellKm, s.spreadKm, (s.data || []).length, s.data?.[0], s.seed]);
  const hit = cellCache.get(L.id);
  if (hit && hit.key === key) return hit.val;
  const ring = outer(L.geom);
  if (!ring) return null;
  let w = Infinity, so = Infinity, e = -Infinity, no = -Infinity;
  for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); so = Math.min(so, y); no = Math.max(no, y); }
  const lat0 = (so + no) / 2, kx = 111320 * Math.cos(lat0 * D2R), ky = 110540;
  const span = Math.max((e - w) * kx, (no - so) * ky);
  let R = Math.max(150, (+s.cellKm || 12) * 1000 / 2);
  while (((span / (R * 1.73)) ** 2) > 5000) R *= 1.2; // keep it under ~5000 cells
  const dx = R * Math.sqrt(3), dy = R * 1.5;
  const data = s.data || [];
  const sig = Math.max(200, (+s.spreadKm || 40) * 1000);
  const r = rng(hashStr(L.id) + (+s.seed || 0));
  const cells = [];
  let vmax = 1e-9;
  for (let row = 0, y = so * ky; y <= no * ky + dy; row++, y += dy) {
    for (let x = w * kx + (row % 2 ? dx / 2 : 0); x <= e * kx + dx; x += dx) {
      const c = [x / kx, y / ky];
      if (!inRing(c, ring)) continue;
      let v = 0;
      for (const d of data) { const ex = (d[0] * kx - x), ey = (d[1] * ky - y); const q = (ex * ex + ey * ey) / (2 * sig * sig); if (q < 9) v += (+d[2] || 1) * Math.exp(-q); }
      v *= 0.75 + r() * 0.5;
      vmax = Math.max(vmax, v);
      const verts = [];
      for (let k = 0; k < 6; k++) { const a = (Math.PI / 3) * k + Math.PI / 6; verts.push([(x + Math.cos(a) * R * 0.98) / kx, (y + Math.sin(a) * R * 0.98) / ky]); }
      cells.push({ c, v, verts, sp: r() });
    }
  }
  for (const c of cells) c.n = Math.sqrt(c.v / vmax);
  const val = { cells, ring, kx, ky, R };
  cellCache.set(L.id, { key, val });
  return val;
}
function noisyBlob(ctx, proj, ll, rM, seed, kx, ky, k = 1) {
  const r = rng(seed);
  const n = 28;
  const ph = [r() * 6, r() * 6, r() * 6];
  ctx.moveTo(...proj([ll[0] + (rM * k) / kx, ll[1]]));
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const f = 1 + 0.28 * Math.sin(a * 3 + ph[0]) + 0.16 * Math.sin(a * 5 + ph[1]) + 0.1 * Math.sin(a * 9 + ph[2]);
    const p = proj([ll[0] + (Math.cos(a) * rM * f * k) / kx, ll[1] + (Math.sin(a) * rM * f * k) / ky]);
    ctx.lineTo(p[0], p[1]);
  }
  ctx.closePath();
}

// ---------------------------------------------------------------- drawing
let off = null, off2 = null;
function offCanvas(w, h, which = 1) {
  let c = which === 1 ? off : off2;
  if (!c) { c = document.createElement('canvas'); if (which === 1) off = c; else off2 = c; }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
  return [c, g];
}
function revealOf(L, tm) {
  if (tm.edit || L.anim === 'none') return 1;
  return clamp(tm.tau / Math.max(0.2, +L.duration || 2), 0, 1);
}
function regionPath(ctx, proj, g) {
  ctx.beginPath();
  for (const poly of ringsOf(g)) for (const ring of poly) { ring.forEach((q, i) => { const p = proj(q); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); }
}

function paint(g, L, tm, o, u) {
  const s = L.style;
  const { proj, unit } = o;
  const data = s.data || [];
  const mode = s.mode || 'cells';
  const ramp = s.ramp || 'blue';
  const t = tm.edit ? 1.2 : tm.tau;
  const grow = L.anim === 'grow' ? easeOut(u) : 1;
  const ring = outer(L.geom);
  const lat0 = ring ? ring[0][1] : data[0]?.[1] || 0;
  const kx = 111320 * Math.cos(lat0 * D2R), ky = 110540;
  const vmax = Math.max(1e-9, ...data.map((d) => +d[2] || 1));
  const order = (i) => (L.anim === 'pop' ? clamp((u * 1.4 - (((i * 0.61803) % 1) * 0.9)) / 0.5, 0, 1) : 1);
  if (mode === 'cells') {
    const C = cellsOf(L);
    if (!C) return;
    for (const c of C.cells) {
      const k = order(c.sp * 1000) * (L.anim === 'grow' ? clamp((u * 1.3 - (1 - c.n)) / 0.3, 0, 1) : 1);
      if (k <= 0 || c.n < 0.02) continue;
      g.beginPath(); c.verts.forEach((q, i) => { const p = proj(q); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.closePath();
      g.fillStyle = hexA(rampAt(ramp, 0.15 + c.n * 0.85).replace(/rgb\((\d+),(\d+),(\d+)\)/, (m, r, gg, b) => `#${[r, gg, b].map((x) => (+x).toString(16).padStart(2, '0')).join('')}`), (0.25 + 0.75 * c.n) * k);
      g.fill();
      g.strokeStyle = hexA(RAMPS[ramp]?.[3] || '#7fb6ff', 0.12 * k); g.lineWidth = 0.6 * unit; g.stroke();
      if (s.sparkle !== false && c.n > 0.45) {
        const p = proj(c.c);
        const nd = Math.round(c.n * 4);
        for (let j = 0; j < nd; j++) { const a = c.sp * 40 + j * 2.4, d = (j + 1) * 1.6 * unit; g.fillStyle = hexA(RAMPS[ramp]?.[4] || '#fff', (0.35 + 0.4 * c.n) * k); g.fillRect(p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d * 0.6, 1.4 * unit, 1.4 * unit); }
      }
    }
    return;
  }
  if (mode === 'heat' || mode === 'glow') {
    const sig = Math.max(200, (+s.spreadKm || 40) * 1000);
    g.globalCompositeOperation = 'lighter';
    data.forEach((d, i) => {
      const k = order(i) * grow;
      if (k <= 0) return;
      const p = proj([d[0], d[1]]);
      const q = proj([d[0] + sig / kx, d[1]]);
      const R = Math.max(3 * unit, Math.hypot(q[0] - p[0], q[1] - p[1])) * (mode === 'glow' ? 0.55 * (+s.size || 1) : 1) * (0.5 + 0.5 * k);
      const vv = (+d[2] || 1) / vmax;
      const col = rampAt(ramp, mode === 'glow' ? 0.55 + vv * 0.45 : 0.3 + vv * 0.7);
      const gr = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], R);
      gr.addColorStop(0, col.replace('rgb', 'rgba').replace(')', `,${(mode === 'glow' ? 0.55 : 0.35) * (0.4 + vv * 0.6) * k})`));
      gr.addColorStop(1, col.replace('rgb', 'rgba').replace(')', ',0)'));
      g.fillStyle = gr; g.fillRect(p[0] - R, p[1] - R, R * 2, R * 2);
      if (mode === 'glow' && vv > 0.55) {
        // hexagon highlight on the strongest spots
        const hr = R * 0.35;
        g.beginPath(); for (let j = 0; j < 6; j++) { const a = (Math.PI / 3) * j + Math.PI / 6; g.lineTo(p[0] + Math.cos(a) * hr, p[1] + Math.sin(a) * hr * 0.75); } g.closePath();
        g.fillStyle = hexA(RAMPS[ramp]?.[3] || '#ffb072', 0.35 * k); g.fill();
      }
    });
    g.globalCompositeOperation = 'source-over';
    return;
  }
  if (mode === 'reach' || mode === 'halo') {
    const rM = Math.max(100, (+s.reachKm || 25) * 1000);
    const [W, H] = [g.canvas.width, g.canvas.height];
    // union of blobs: paint solid into a second canvas, then tint it
    const [c2, g2] = offCanvas(W, H, 2);
    g2.fillStyle = '#fff';
    data.forEach((d, i) => {
      const k = order(i) * (L.anim === 'grow' || L.anim === 'wipe' ? easeOut(u * 1.15 - ((i * 0.37) % 1) * 0.15) : 1);
      if (k <= 0) return;
      const vv = mode === 'halo' ? 0.45 + 0.55 * ((+d[2] || 1) / vmax) : 1;
      g2.beginPath(); noisyBlob(g2, proj, d, rM * vv * (mode === 'halo' ? 0.5 * (+s.size || 1) : 1), hashStr(L.id) + i * 31, kx, ky, k); g2.fill();
    });
    const base = mode === 'reach' ? RAMPS[ramp]?.[2] || '#43b062' : RAMPS[ramp]?.[3] || '#eef27a';
    g2.globalCompositeOperation = 'source-in';
    if (mode === 'halo') {
      // diagonal hatch inside the halos
      g2.fillStyle = hexA(base, 0.35); g2.fillRect(0, 0, W, H);
      g2.strokeStyle = hexA(RAMPS[ramp]?.[4] || '#fbffd8', 0.55); g2.lineWidth = 1.1 * unit;
      g2.beginPath(); for (let x = -H; x < W; x += 5 * unit) { g2.moveTo(x, H); g2.lineTo(x + H, 0); } g2.stroke();
    } else { g2.fillStyle = hexA(base, 0.55); g2.fillRect(0, 0, W, H); }
    g2.globalCompositeOperation = 'source-over';
    if (s.glow !== false) { g.save(); g.shadowColor = base; g.shadowBlur = (mode === 'halo' ? 26 : 14) * unit; g.drawImage(c2, 0, 0); g.restore(); }
    g.drawImage(c2, 0, 0);
    if (mode === 'halo') {
      g.globalCompositeOperation = 'lighter';
      data.forEach((d, i) => {
        const k = order(i) * easeOut(u * 1.2);
        if (k <= 0) return;
        const p = proj([d[0], d[1]]);
        const q = proj([d[0] + (rM * 0.25 * (+s.size || 1)) / kx, d[1]]);
        const R = Math.max(4 * unit, Math.hypot(q[0] - p[0], q[1] - p[1])) * (1 + 0.06 * Math.sin(t * 2 + i));
        const gr = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], R);
        gr.addColorStop(0, hexA(RAMPS[ramp]?.[4] || '#fbffd8', 0.75 * k)); gr.addColorStop(0.4, hexA(base, 0.35 * k)); gr.addColorStop(1, hexA(base, 0));
        g.fillStyle = gr; g.fillRect(p[0] - R, p[1] - R, R * 2, R * 2);
      });
      g.globalCompositeOperation = 'source-over';
    }
    return;
  }
  if (mode === 'circles') {
    data.forEach((d, i) => {
      const k = order(i) * grow;
      if (k <= 0) return;
      const p = proj([d[0], d[1]]);
      const vv = (+d[2] || 1) / vmax;
      const R = (3 + 22 * Math.sqrt(vv)) * unit * (+s.size || 1) * (L.anim === 'pop' ? 1 + 0.25 * Math.sin(Math.PI * k) : 1) * Math.min(1, k * 1.2);
      g.fillStyle = hexA(rampAt(ramp, 0.4 + vv * 0.6).replace(/rgb\((\d+),(\d+),(\d+)\)/, (m, r, gg, b) => `#${[r, gg, b].map((x) => (+x).toString(16).padStart(2, '0')).join('')}`), 0.7);
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1 * unit;
      g.beginPath(); g.arc(p[0], p[1], R, 0, Math.PI * 2); g.fill(); g.stroke();
    });
  }
}
function drawRings(ctx, L, tm, o, u) {
  const s = L.style;
  const { proj, unit } = o;
  const data = s.data || [];
  const col = RAMPS[s.ramp]?.[4] || '#ffffff';
  data.forEach((d, i) => {
    const st = ((i * 0.61803) % 1) * 0.75;
    const k = tm.edit || L.anim === 'none' ? 1 : clamp((u - st) / 0.25, 0, 1);
    if (k <= 0) return;
    const p = proj([d[0], d[1]]);
    const pop = k < 1 ? 1 + 0.6 * Math.sin(Math.PI * k) : 1;
    const R = 4.2 * unit * (+s.size || 1) * pop;
    ctx.save();
    ctx.globalAlpha *= tm.alpha * Math.min(1, k * 2);
    if (s.glow !== false) { ctx.shadowColor = col; ctx.shadowBlur = 8 * unit; }
    ctx.strokeStyle = col; ctx.lineWidth = 1.6 * unit * (+s.size || 1);
    ctx.beginPath(); ctx.arc(p[0], p[1], R, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  });
}

export function drawSmartMap(ctx, L, tm, o, phase) {
  const s = L.style;
  if (!L.geom) return;
  const u = revealOf(L, tm);
  if (s.mode === 'rings') { if (phase === 'above') drawRings(ctx, L, tm, o, u); return; }
  if (phase !== 'below') return;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const [c, g] = offCanvas(W, H, 1);
  paint(g, L, tm, o, u);
  // keep it inside the region
  if (s.clip !== false && s.mode !== 'reach' && s.mode !== 'halo') { g.globalCompositeOperation = 'destination-in'; regionPath(g, o.proj, L.geom); g.fillStyle = '#000'; g.fill('evenodd'); g.globalCompositeOperation = 'source-over'; }
  ctx.save();
  ctx.globalAlpha *= tm.alpha * clamp(+s.opacity || 0.8, 0, 1) * (L.anim === 'fade' ? ease(u) : 1);
  if (L.anim === 'wipe' && u < 1) {
    // soft blurred wipe: the layer slides in behind a feathered edge, sharpening as it lands
    const dir = (+s.wipeDir || 160) * D2R;
    const dx = Math.sin(dir), dy = -Math.cos(dir);
    const span = Math.abs(dx) * W + Math.abs(dy) * H;
    const cx = W / 2, cy = H / 2;
    const pos = -span / 2 + ease(u) * span * 1.35;
    const feather = span * 0.28;
    const x0 = cx - dx * (span / 2), y0 = cy - dy * (span / 2);
    const gr = ctx.createLinearGradient(x0, y0, x0 + dx * span, y0 + dy * span);
    const a = clamp((pos + span / 2 - feather) / span, 0, 1), b = clamp((pos + span / 2) / span, 0, 1);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(Math.min(a, 0.999), 'rgba(0,0,0,1)'); gr.addColorStop(Math.max(b, Math.min(a, 0.999) + 0.0005), 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = gr; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
    ctx.filter = `blur(${((1 - u) * 10 * o.unit).toFixed(1)}px)`;
  }
  ctx.drawImage(c, 0, 0);
  ctx.filter = 'none';
  ctx.restore();
}

// ---------------------------------------------------------------- legend
export function drawLegend(ctx, L, tm, o) {
  const s = L.style;
  const { frame, unit } = o;
  if (!frame) return;
  const k = +s.size || 1;
  const items = String(s.items || '').split('\n').map((ln) => ln.split('|').map((x) => x.trim())).filter((a) => a[0]);
  const fs = 14 * unit * k, lh = 22 * unit * k;
  const W = 260 * unit * k, H = items.length * lh + 10 * unit;
  const m = 34 * unit, pos = s.position || 'bottom-left';
  const x = pos.includes('right') ? frame.x + frame.w - m - W : frame.x + m, y = pos.includes('top') ? frame.y + m : frame.y + frame.h - m - H;
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  placeAt(ctx, L, frame, x, y, W, H);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  items.forEach(([label, col = '#ffffff', at = '0'], i) => {
    const t0 = +at || 0;
    const tt = tm.edit ? 99 : tm.tau - t0;
    if (tt < 0) return;
    const yy = y + 5 * unit + lh * (i + 0.5);
    const pop = clamp(tt / 0.3, 0, 1);
    const R = 5.5 * unit * k * (1 + 0.5 * Math.sin(Math.PI * pop) * (pop < 1 ? 1 : 0));
    ctx.globalAlpha = tm.alpha * pop;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2 * unit * k;
    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 6 * unit;
    if (s.icon === 'dot') { ctx.beginPath(); ctx.arc(x + R, yy, R, 0, Math.PI * 2); ctx.fill(); }
    else if (s.icon === 'square') ctx.fillRect(x, yy - R, R * 2, R * 2);
    else { ctx.beginPath(); ctx.arc(x + 6 * unit * k, yy, R, 0, Math.PI * 2); ctx.stroke(); }
    // typed label
    const n = Math.floor(clamp((tt - 0.15) / 0.9, 0, 1) * label.length);
    ctx.globalAlpha = tm.alpha;
    ctx.fillStyle = '#ffffff'; ctx.font = `500 ${fs}px ${UI}`;
    ctx.fillText(label.slice(0, n), x + 22 * unit * k, yy + 1);
    ctx.shadowBlur = 0;
  });
  ctx.restore();
}

// ---------------------------------------------------------------- 3D info card
function buildingSketch(g, x, y, w, h, accent, u) {
  // simple isometric line drawing of a street with a highlighted store (original artwork)
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = '#16191d'; g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(200,210,220,0.35)'; g.lineWidth = 1;
  const box = (bx, by, bw, bh, d, fill, a) => {
    g.globalAlpha = a;
    g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + bw, by); g.lineTo(bx + bw, by - bh); g.lineTo(bx, by - bh); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    g.stroke();
    g.beginPath(); g.moveTo(bx, by - bh); g.lineTo(bx + d, by - bh - d * 0.5); g.lineTo(bx + bw + d, by - bh - d * 0.5); g.lineTo(bx + bw, by - bh); g.stroke();
    g.beginPath(); g.moveTo(bx + bw, by); g.lineTo(bx + bw + d, by - d * 0.5); g.lineTo(bx + bw + d, by - bh - d * 0.5); g.stroke();
    for (let wy = by - bh + 6; wy < by - 6; wy += 9) for (let wx = bx + 5; wx < bx + bw - 6; wx += 9) g.strokeRect(wx, wy, 4, 5);
    g.globalAlpha = 1;
  };
  const base = y + h - 6;
  box(x + 6, base, w * 0.22, h * 0.62, 10, null, 1);
  box(x + w * 0.3, base, w * 0.24, h * 0.5 * Math.max(0.05, easeOut(u * 1.4)), 10, hexA(accent, 0.85), 1);
  box(x + w * 0.62, base, w * 0.3, h * 0.72, 10, null, 1);
  g.strokeStyle = 'rgba(200,210,220,0.25)'; g.beginPath(); g.moveTo(x, base + 2); g.lineTo(x + w, base + 2); g.stroke();
  g.restore();
}
const imgCache = new Map();
export function drawInfoCard(ctx, L, tm, o, imageFor) {
  const s = L.style;
  const { proj, unit } = o;
  const p = proj(L.geom.coordinates);
  const u = tm.edit || L.anim === 'none' ? 1 : clamp(tm.tau / Math.max(0.3, +L.duration || 2.5), 0, 1);
  const t = tm.edit ? 3 : tm.tau;
  const accent = s.accent || '#43b062';
  // marker on the ground
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  for (let i = 0; i < 2; i++) { const ph = (t * 0.7 + i * 0.5) % 1; ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - ph)})`; ctx.lineWidth = 2 * unit; ctx.beginPath(); ctx.ellipse(p[0], p[1], (6 + ph * 22) * unit, (3 + ph * 10) * unit, 0, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 12 * unit; ctx.beginPath(); ctx.ellipse(p[0], p[1], 6 * unit, 3.5 * unit, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  const rise = easeOut(u / 0.35);
  if (rise <= 0.01) { ctx.restore(); return; }
  // card drawn flat on its own canvas, then tilted back with a perspective-like taper
  const CW = Math.round((+s.width || 300) * unit), CH = Math.round(CW * 0.66);
  const [c, g] = offCanvas(CW + 4, CH + 4, 2);
  g.translate(2, 2);
  g.fillStyle = 'rgba(30,33,38,0.94)'; rr(g, 0, 0, CW, CH, 8 * unit); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1; rr(g, 0.5, 0.5, CW - 1, CH - 1, 8 * unit); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 0, CW, 26 * unit);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(14 * unit, 13 * unit, 5 * unit, 0, Math.PI * 2); g.fill();
  g.textBaseline = 'middle'; g.textAlign = 'left';
  g.font = `700 ${12 * unit}px ${UI}`; g.fillText(s.title || 'Location', 28 * unit, 13.5 * unit, CW - 40 * unit);
  g.font = `700 ${9.5 * unit}px ${UI}`; g.fillStyle = '#e8ecf1'; g.fillText(s.line1 || '', 12 * unit, 38 * unit, CW * 0.45);
  g.font = `500 ${8.5 * unit}px ${UI}`; g.fillStyle = 'rgba(232,236,241,0.7)'; g.fillText(s.line2 || '', 12 * unit, 50 * unit, CW * 0.45);
  // picture or sketch
  const px = CW * 0.5, py = 32 * unit, pw = CW * 0.47, ph = CH * 0.36;
  const im = s.media && imageFor ? imageFor(s.media) : null;
  if (im?.ready && im.bmp) { g.save(); rr(g, px, py, pw, ph, 4 * unit); g.clip(); const ir = im.w / im.h, br = pw / ph; let dw = pw, dh = ph; if (ir > br) dw = ph * ir; else dh = pw / ir; g.drawImage(im.bmp, px + (pw - dw) / 2, py + (ph - dh) / 2, dw, dh); g.restore(); }
  else buildingSketch(g, px, py, pw, ph, accent, u);
  if (s.badge) {
    const bk = clamp((u - 0.45) / 0.15, 0, 1);
    g.globalAlpha = bk * (0.75 + 0.25 * Math.sin(t * 6));
    g.font = `900 ${8 * unit}px ${UI}`;
    const bw = g.measureText(s.badge).width + 12 * unit;
    g.fillStyle = hexA(accent, 0.25); rr(g, px + pw - bw - 4 * unit, py + 4 * unit, bw, 14 * unit, 3 * unit); g.fill();
    g.fillStyle = accent; g.shadowColor = accent; g.shadowBlur = 8 * unit; g.fillText(s.badge, px + pw - bw + 2 * unit, py + 11.5 * unit); g.shadowBlur = 0;
    g.globalAlpha = 1;
  }
  // bars
  const bars = String(s.bars || '').split('\n').map((ln) => ln.split('|').map((x) => x.trim())).filter((a) => a[0]);
  const by0 = CH * 0.66, bh = 6 * unit, bwMax = CW * 0.52;
  bars.slice(0, 4).forEach(([lab, col = '#4f8cff'], i) => {
    const m = lab.match(/^(.*?):\s*(\d+(?:\.\d+)?)/);
    const pct = m ? +m[2] : 50, name = m ? m[1] : lab;
    const fill = easeOut(clamp((u - 0.35 - i * 0.08) / 0.4, 0, 1));
    const yy = by0 + i * 15 * unit;
    g.fillStyle = 'rgba(255,255,255,0.08)'; rr(g, 12 * unit, yy, bwMax, bh, bh / 2); g.fill();
    g.fillStyle = col; rr(g, 12 * unit, yy, Math.max(bh, bwMax * (pct / 100) * fill), bh, bh / 2); g.fill();
    g.font = `700 ${7.5 * unit}px ${MONO}`; g.fillStyle = '#e8ecf1'; g.fillText(`${Math.round(pct * fill)}%`, 18 * unit + bwMax, yy + bh / 2);
    g.font = `500 ${6.5 * unit}px ${UI}`; g.fillStyle = 'rgba(232,236,241,0.6)'; g.fillText(name, 12 * unit, yy - 4 * unit, bwMax);
  });
  if (s.chart !== false) {
    const cx = CW * 0.72, cy = CH * 0.62, cw = CW * 0.24, ch = CH * 0.3;
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1; rr(g, cx, cy, cw, ch, 4 * unit); g.stroke();
    g.fillStyle = '#fff'; g.font = `800 ${13 * unit}px ${UI}`; g.fillText('$', cx + 6 * unit, cy + ch * 0.35);
    const pts = [0.15, 0.3, 0.25, 0.5, 0.45, 0.7, 0.9];
    const n = Math.max(2, Math.ceil(pts.length * easeOut(clamp((u - 0.5) / 0.4, 0, 1))));
    g.strokeStyle = accent; g.lineWidth = 2 * unit; g.shadowColor = accent; g.shadowBlur = 6 * unit;
    g.beginPath(); for (let i = 0; i < n; i++) { const xx = cx + cw * 0.3 + (i / (pts.length - 1)) * cw * 0.62, yy = cy + ch * 0.85 - pts[i] * ch * 0.7; if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy); } g.stroke(); g.shadowBlur = 0;
  }
  // place it: rising stem, then the tilted card
  const stemH = (+s.height || 120) * unit * rise;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.4 * unit;
  ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] - stemH); ctx.stroke();
  const tilt = clamp(+s.tilt || 0, 0, 0.7);
  const cardH = CH * (1 - tilt * 0.35) * rise;
  const bottom = p[1] - stemH, top = bottom - cardH;
  const strips = 48;
  ctx.globalAlpha *= clamp(rise * 1.3, 0, 1);
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 24 * unit;
  for (let i = 0; i < strips; i++) {
    const v0 = i / strips, v1 = (i + 1) / strips;
    const sc = 1 - tilt * 0.28 * (1 - v0); // narrower at the top (further away)
    const w = CW * sc;
    const y0 = top + cardH * v0, hh = cardH / strips + 0.6;
    ctx.drawImage(c, 0, v0 * (CH + 4), CW + 4, (v1 - v0) * (CH + 4), p[0] - w / 2, y0, w, hh);
    if (i === 0) ctx.shadowBlur = 0;
  }
  ctx.restore();
}
