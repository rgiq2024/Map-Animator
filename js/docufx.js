// Geopolitics documentary map looks: magnifier lenses and zoom insets with real imagery (round, rectangle,
// card with a title / flag, glass bubble), gold and red radius zones, dashed territory corridors, red hand-drawn
// circles, measure lines with a big “3 km”, thin stem labels and animated dashed routes with a legend.
import { placeAt } from './place.js';
import { imageFor } from './geoimage.js';
import { H } from './cartofx.js';

const { clamp, easeOut, D2R, haversine, off, drawTiles, linesOf, track } = H;
const FONT = '"Montserrat","Inter","Segoe UI",system-ui,sans-serif';
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const hexA = (hex, a) => { const h = String(hex || '#ffffff').replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const prog = (L, tm) => (tm.edit || L.anim === 'none' ? 1 : clamp(tm.tau / Math.max(0.1, +L.duration || 1), 0, 1));
const seg = (u, a, b) => clamp((u - a) / Math.max(1e-6, b - a), 0, 1);
function dest(ll, brg, dist) {
  const R = 6371008.8, d = dist / R, b = brg * D2R, la = ll[1] * D2R, lo = ll[0] * D2R;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return [lo2 / D2R, la2 / D2R];
}
const fmtKm = (m) => (m >= 10000 ? `${Math.round(m / 1000).toLocaleString('en-US')} km` : m >= 1000 ? `${(m / 1000).toFixed(1).replace(/\.0$/, '')} km` : `${Math.round(m)} m`);

// ---------------------------------------------------------------- flags (flagcdn, by ISO-2 code)
const flags = new Map();
function flagImg(code) {
  const c = String(code || '').trim().toLowerCase();
  if (!/^[a-z]{2}(-[a-z]{2,3})?$/.test(c)) return null;
  let f = flags.get(c);
  if (!f) {
    const img = new Image(); img.crossOrigin = 'anonymous';
    f = { img, ready: false };
    flags.set(c, f);
    track(new Promise((res) => { img.onload = () => { f.ready = true; res(); }; img.onerror = () => res(); img.src = `https://flagcdn.com/w160/${c}.png`; }));
  }
  return f.ready ? f.img : null;
}

// ---------------------------------------------------------------- registry
export const DF_KINDS = {
  docinset: { name: 'Lens / zoom inset', icon: '◎', geom: 'point', desc: 'A round magnifier lens, rectangle or titled card showing the place close up in real satellite imagery (or your photo), joined to it by a thin line' },
  zonering: { name: 'Radius zone', icon: '◯', geom: 'point', desc: 'A circle of a real radius around a place — gold zone (EEZ / range) or glowing red danger circle — with an optional label' },
  corridor: { name: 'Dashed corridor', icon: '⬚', geom: 'line', desc: 'A dashed band between two places with text along it, e.g. “Sovereign Territory”' },
  redmark: { name: 'Hand-drawn circle', icon: '⭕', geom: 'point', desc: 'A red marker circle drawn around a spot, like a pen on a photo' },
  measureline: { name: 'Measure line + big label', icon: '⟷', geom: 'line', desc: 'A red line along a runway, road or coast with a big distance label such as “3 km”' },
  stemlabel: { name: 'Stem label', icon: '⊸', geom: 'point', desc: 'A small ring on the place with a thin line to its name — the clean documentary label' },
  dashroute: { name: 'Dashed route + legend', icon: '┄', geom: 'line', desc: 'A dashed line that draws along a route with marching dashes and an entry in the legend (e.g. String of Pearls, shipping lanes)' },
};
export const DF_ANIMS = {
  docinset: { open: 'Line draws, then the lens opens', zoom: 'Zooms out of the place', fade: 'Fade in', none: 'Shown' },
  zonering: { grow: 'Grows from the place', pulse: 'Grows, then pulses', fade: 'Fade in', none: 'Shown' },
  corridor: { draw: 'Dashes draw in', fade: 'Fade in', none: 'Shown' },
  redmark: { draw: 'Drawn by hand', fade: 'Fade in', none: 'Shown' },
  measureline: { draw: 'Line draws, label counts up', fade: 'Fade in', none: 'Shown' },
  stemlabel: { grow: 'Ring, line, then the name', fade: 'Fade in', none: 'Shown' },
  dashroute: { draw: 'Draws along the route', march: 'Draws, then the dashes march', none: 'Shown' },
};
export const DF_DEFAULTS = {
  docinset: { anim: 'open', duration: 1.6, style: { shape: 'circle', src: 'satellite', media: '', zoom: 13, size: 1, dx: -170, dy: -150, title: '', titlePos: 'below', flag: '', frame: '#ffffff', anchor: 'screen', ring: true, leader: 'straight', glow: true, dim: 0 } },
  zonering: { anim: 'grow', duration: 1.6, style: { radiusKm: 370, look: 'gold', color: '#e9c46a', label: '', labelSide: 'right', labelLen: 90, dot: true, fill: true, width: 1 } },
  corridor: { anim: 'draw', duration: 1.4, style: { widthKm: 120, color: '#ffffff', text: 'Sovereign Territory', textSize: 1, opacity: 0.85 } },
  redmark: { anim: 'draw', duration: 0.9, style: { rx: 70, ry: 34, rot: -12, color: '#e01e2b', width: 1 } },
  measureline: { anim: 'draw', duration: 1.6, style: { color: '#e01e2b', width: 1, text: '', textColor: '#ffffff', textSize: 1, side: 'above', ends: true } },
  stemlabel: { anim: 'grow', duration: 1.1, style: { text: 'Place name', dir: 'right', len: 70, color: '#ffffff', size: 1, ring: true } },
  dashroute: { anim: 'draw', duration: 3, style: { color: '#ffffff', width: 1, dash: 1, smooth: true, legend: '', glow: false } },
};
const SIDES = { right: 'Right', left: 'Left', up: 'Up', down: 'Down' };
export const DF_FORMS = {
  docinset: [
    ['style.shape', 'Shape', 'select', { circle: 'Round lens (magnifier)', rect: 'Rectangle with rounded corners', card: 'Card with title / flag', bubble: 'Glass bubble on the place' }],
    ['style.media', 'Your picture instead of satellite imagery (optional)', 'image'],
    ['style.zoom', 'Imagery zoom', 'range', [3, 19, 0.25]],
    ['style.src', 'Imagery', 'select', { satellite: 'Satellite (Esri World Imagery)', topo: 'Topographic', streets: 'Streets', dark: 'Dark grey' }],
    ['style.size', 'Size', 'range', [0.4, 3, 0.05]],
    ['style.title', 'Title', 'text'],
    ['style.titlePos', 'Title', 'select', { below: 'Below', above: 'Above', tag: 'White tag under the card', none: 'Hidden' }],
    ['style.flag', 'Flag (2-letter country code, e.g. us, fr, in)', 'text', null, (L) => L.style.shape === 'card' || L.style.shape === 'rect'],
    ['style.leader', 'Line to the place', 'select', { straight: 'Straight', elbow: 'Elbow (across, then up / down)', none: 'None' }],
    ['style.ring', 'Small ring on the place', 'switch'],
    ['style.frame', 'Frame colour', 'color'],
    ['style.glow', 'Soft glow', 'switch'],
    ['style.dim', 'Darken the imagery', 'range', [0, 0.8, 0.05]],
    ['style.anchor', 'Lens / card', 'select', { screen: 'Stays put on the screen — line and ring follow the place', map: 'Moves with the map' }],
    ['style.bx', 'Position ←→ (or drag it)', 'range', [0, 1, 0.005], (L) => L.style.anchor !== 'map'],
    ['style.by', 'Position ↑↓ (or drag it)', 'range', [0, 1, 0.005], (L) => L.style.anchor !== 'map'],
    ['style.dx', 'Offset from the place ←→', 'range', [-800, 800, 1], (L) => L.style.anchor === 'map'],
    ['style.dy', 'Offset from the place ↑↓', 'range', [-500, 500, 1], (L) => L.style.anchor === 'map'],
  ],
  zonering: [
    ['style.radiusKm', 'Radius (km) — 370 km = 200 nautical miles (EEZ)', 'number', 1],
    ['style.look', 'Look', 'select', { gold: 'Gold zone (thin line, soft glow)', danger: 'Red danger circle (glowing)', white: 'White line', blue: 'Blue zone' }],
    ['style.color', 'Colour', 'color'],
    ['style.label', 'Label (empty = none)', 'text'],
    ['style.labelSide', 'Label side', 'select', SIDES],
    ['style.labelLen', 'Label line length', 'range', [20, 300, 1]],
    ['style.dot', 'Ring at the centre', 'switch'],
    ['style.fill', 'Soft fill', 'switch'],
    ['style.width', 'Line width', 'range', [0.3, 4, 0.1]],
  ],
  corridor: [['style.text', 'Text along the band', 'text'], ['style.widthKm', 'Band width (km)', 'number', 1], ['style.color', 'Colour', 'color'], ['style.textSize', 'Text size', 'range', [0.4, 3, 0.05]], ['style.opacity', 'Opacity', 'range', [0.1, 1, 0.05]]],
  redmark: [['style.rx', 'Width', 'range', [10, 400, 1]], ['style.ry', 'Height', 'range', [10, 300, 1]], ['style.rot', 'Tilt (°)', 'range', [-90, 90, 1]], ['style.color', 'Colour', 'color'], ['style.width', 'Pen width', 'range', [0.3, 4, 0.1]]],
  measureline: [['style.text', 'Label (empty = measured length)', 'text'], ['style.color', 'Line colour', 'color'], ['style.width', 'Line width', 'range', [0.3, 5, 0.1]], ['style.textColor', 'Label colour', 'color'], ['style.textSize', 'Label size', 'range', [0.4, 4, 0.05]], ['style.side', 'Label', 'select', { above: 'Above the line', below: 'Below the line', on: 'On the line' }], ['style.ends', 'End ticks', 'switch']],
  stemlabel: [['style.text', 'Name', 'text'], ['style.dir', 'Line goes', 'select', SIDES], ['style.len', 'Line length', 'range', [10, 300, 1]], ['style.color', 'Colour', 'color'], ['style.size', 'Size', 'range', [0.4, 3, 0.05]], ['style.ring', 'Ring on the place', 'switch']],
  dashroute: [['style.color', 'Colour', 'color'], ['style.width', 'Width', 'range', [0.3, 4, 0.1]], ['style.dash', 'Dash length', 'range', [0.3, 4, 0.1]], ['style.smooth', 'Smooth curve', 'switch'], ['style.glow', 'Glow', 'switch'], ['style.legend', 'Legend entry (empty = none)', 'text']],
};
export const DF_SET = new Set(Object.keys(DF_KINDS));
export const dfPhases = (k) => ({ docinset: ['captions'], dashroute: ['above', 'captions'], stemlabel: ['captions'] }[k] || ['above']);

// ---------------------------------------------------------------- helpers
function smoothPts(pts, n = 12) {
  if (pts.length < 3) return pts;
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t; out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3))); }
  }
  out.push(pts.at(-1));
  return out;
}
/** polyline cut to a fraction of its length */
function partial(P, f) {
  if (f >= 1) return P;
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const end = cum.at(-1) * f, out = [P[0]];
  for (let i = 1; i < P.length; i++) {
    if (cum[i] <= end) { out.push(P[i]); continue; }
    const k = (end - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
    out.push([P[i - 1][0] + (P[i][0] - P[i - 1][0]) * k, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * k]);
    break;
  }
  return out;
}
const path = (ctx, P) => { ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); };
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function smallRing(ctx, x, y, r, col, unit) {
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.6 * unit; ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
}

// ---------------------------------------------------------------- lens / zoom inset
function insetImage(L, o, ll, w, h, S, unit) {
  const s = L.style;
  const [C, g] = off(`${L.id}:docinset`, w * S, h * S);
  const pic = s.media ? imageFor(s.media) : null;
  if (pic?.ready) {
    const k = Math.max(C.width / pic.w, C.height / pic.h);
    g.drawImage(pic.bmp, (C.width - pic.w * k) / 2, (C.height - pic.h * k) / 2, pic.w * k, pic.h * k);
  } else {
    H.setMap(o.map);
    const z = (+s.zoom || 13) + Math.log2((o.frame.w * S) / 1000);
    drawTiles(g, s.src || 'satellite', ll, z, 0, 0, C.width, C.height);
  }
  if (+s.dim > 0) { g.fillStyle = `rgba(0,0,0,${+s.dim})`; g.fillRect(0, 0, C.width, C.height); }
  void unit;
  return C;
}
function drawDocInset(ctx, L, tm, o) {
  const s = L.style, unit = o.unit, fr = o.frame;
  if (!fr || L.geom?.type !== 'Point') return;
  const ll = L.geom.coordinates, p = o.proj(ll);
  const u = prog(L, tm), still = tm.edit || L.anim === 'none';
  const shape = s.shape || 'circle', col = s.frame || '#ffffff';
  const sz = +s.size || 1;
  const W = (shape === 'circle' || shape === 'bubble' ? 260 : shape === 'card' ? 280 : 300) * unit * sz;
  const Hh = shape === 'circle' || shape === 'bubble' ? W : W * (shape === 'card' ? 0.72 : 0.62);
  const S = Math.max(1, Math.abs(ctx.getTransform().a) || 1);
  ctx.save(); ctx.globalAlpha *= tm.alpha;
  // box centre: fixed on the screen (the line and the small ring follow the place) or pinned to the map
  let bx, by;
  if (s.anchor === 'map') { bx = p[0] + (+s.dx || 0) * unit - W / 2; by = p[1] + (+s.dy || 0) * unit - Hh / 2; }
  else {
    if (s.bx == null || s.by == null) {
      // first time: start where the offset puts it, then stay there on the screen
      s.bx = +clamp((p[0] + (+s.dx || 0) * unit - fr.x) / fr.w, 0.05, 0.95).toFixed(4);
      s.by = +clamp((p[1] + (+s.dy || 0) * unit - fr.y) / fr.h, 0.08, 0.92).toFixed(4);
    }
    bx = fr.x + fr.w * +s.bx - W / 2; by = fr.y + fr.h * +s.by - Hh / 2;
  }
  const round = shape === 'circle' || shape === 'bubble';
  const [dx, dy] = placeAt(ctx, L, fr, bx, by, W, Hh, { key: 'box', resize: true, uniform: true });
  ctx.translate(-dx, -dy); // placeAt moved the canvas; the box moves, the place and its ring stay
  bx += dx; by += dy;
  const cx = bx + W / 2, cy = by + Hh / 2;
  const kLine = still || L.anim === 'fade' || L.anim === 'zoom' ? 1 : easeOut(seg(u, 0, 0.4));
  let kBox = still ? 1 : L.anim === 'fade' ? 1 : easeOut(seg(u, L.anim === 'zoom' ? 0 : 0.3, 1));
  const fade = L.anim === 'fade' && !still ? u : 1;
  ctx.globalAlpha *= fade;
  // attach point on the box edge
  let ax, ay;
  if (round) { const ang = Math.atan2(p[1] - cy, p[0] - cx); ax = cx + Math.cos(ang) * W / 2; ay = cy + Math.sin(ang) * W / 2; }
  else if (s.leader === 'elbow') { ax = cx; ay = p[1] > cy ? by + Hh : by; }
  else { ax = clamp(p[0], bx, bx + W); ay = clamp(p[1], by, by + Hh); if (ax > bx && ax < bx + W && ay > by && ay < by + Hh) { ax = cx; ay = by + Hh; } }
  if (s.ring !== false && L.anim !== 'zoom') smallRing(ctx, p[0], p[1], 6.5 * unit, col, unit);
  if (s.leader !== 'none') {
    ctx.save(); ctx.strokeStyle = hexA(col, 0.9); ctx.lineWidth = 1.4 * unit;
    const pts = s.leader === 'elbow' && !round ? [[p[0], p[1]], [ax, p[1]], [ax, ay]] : [[p[0], p[1]], [ax, ay]];
    path(ctx, partial(pts, kLine)); ctx.stroke(); ctx.restore();
  }
  if (kBox <= 0.01) { ctx.restore(); return; }
  // the box opens out of the place (zoom) or grows from its middle
  let ox, oy, w, h;
  if (L.anim === 'zoom' && !still) { const k = kBox; w = W * (0.08 + 0.92 * k); h = Hh * (0.08 + 0.92 * k); ox = p[0] + (cx - p[0]) * k - w / 2; oy = p[1] + (cy - p[1]) * k - h / 2; }
  else { w = W * (0.4 + 0.6 * kBox); h = Hh * (0.4 + 0.6 * kBox); ox = cx - w / 2; oy = cy - h / 2; ctx.globalAlpha *= clamp(kBox * 1.6, 0, 1); }
  const C = insetImage(L, o, ll, W, Hh, S, unit);
  const rad = round ? w / 2 : 8 * unit * sz;
  const clipShape = () => { if (round) { ctx.beginPath(); ctx.arc(ox + w / 2, oy + h / 2, w / 2, 0, 7); } else rr(ctx, ox, oy, w, h, rad); };
  ctx.save();
  if (s.glow !== false) { ctx.shadowColor = round ? hexA(col, shape === 'bubble' ? 0.75 : 0.55) : 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 26 * unit; }
  clipShape(); ctx.fillStyle = '#05080d'; ctx.fill();
  ctx.restore();
  ctx.save(); clipShape(); ctx.clip();
  ctx.drawImage(C, 0, 0, C.width, C.height, ox, oy, w, h);
  if (shape === 'circle') { const v = ctx.createRadialGradient(ox + w / 2, oy + h / 2, w * 0.3, ox + w / 2, oy + h / 2, w / 2); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)'); ctx.fillStyle = v; ctx.fillRect(ox, oy, w, h); }
  if (shape === 'bubble') {
    // glass sphere: dark rim, light from the top
    const R = w / 2, X = ox + R, Y = oy + R;
    const v = ctx.createRadialGradient(X, Y, R * 0.45, X, Y, R); v.addColorStop(0, 'rgba(6,14,26,0)'); v.addColorStop(1, 'rgba(6,14,26,0.75)');
    ctx.fillStyle = v; ctx.fillRect(ox, oy, w, h);
    const hl = ctx.createLinearGradient(X, oy, X, Y); hl.addColorStop(0, 'rgba(255,255,255,0.16)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl; ctx.fillRect(ox, oy, w, R);
  }
  ctx.restore();
  ctx.save(); ctx.strokeStyle = shape === 'bubble' ? hexA(col, 0.75) : col; ctx.lineWidth = (shape === 'circle' ? 3 : shape === 'bubble' ? 2.2 : 2) * unit;
  if (shape === 'bubble' && s.glow !== false) { ctx.shadowColor = hexA(col, 0.7); ctx.shadowBlur = 22 * unit; }
  clipShape(); ctx.stroke(); ctx.restore();
  // flag and title
  const done = still ? 1 : seg(kBox, 0.85, 1);
  if (done > 0) {
    ctx.save(); ctx.globalAlpha *= done;
    const fl = s.flag && flagImg(s.flag);
    if (fl) { const fw = 58 * unit * sz, fh = fw * (fl.naturalHeight / fl.naturalWidth || 0.66); ctx.drawImage(fl, ox + 12 * unit, oy + 12 * unit, fw, fh); }
    const t = s.title, pos = s.titlePos || 'below';
    if (t && pos !== 'none' && shape === 'bubble') {
      const fs = 30 * unit * sz * (w / W);
      ctx.font = `400 ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      const g = ctx.createLinearGradient(ox, 0, ox + w, 0); g.addColorStop(0, '#c9d3e0'); g.addColorStop(1, '#8fe3ff');
      ctx.fillStyle = g; ctx.fillText(t, ox + w / 2, oy + h * 0.91);
    } else if (t && pos !== 'none') {
      const fs = 15 * unit * sz;
      ctx.font = `${pos === 'tag' ? 600 : 500} ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (pos === 'tag') {
        const tw = Math.max(ctx.measureText(t).width + 40 * unit, w * 0.62), th = fs * 1.9;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(ox + w / 2 - tw / 2, oy + h - th - 6 * unit, tw, th);
        ctx.fillStyle = '#111418'; ctx.fillText(t, ox + w / 2, oy + h - th / 2 - 6 * unit);
      } else {
        ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 5 * unit;
        ctx.fillText(t, ox + w / 2, pos === 'above' ? oy - fs * 0.95 : oy + h + fs * 1.05);
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- radius zone
function drawZoneRing(ctx, L, tm, o) {
  const s = L.style, unit = o.unit;
  if (L.geom?.type !== 'Point') return;
  const ll = L.geom.coordinates, p = o.proj(ll);
  const u = prog(L, tm), still = tm.edit || L.anim === 'none';
  const kR = still || L.anim === 'fade' ? 1 : easeOut(seg(u, 0, 0.75));
  const a = L.anim === 'fade' && !still ? u : 1;
  const look = s.look || 'gold';
  const lookCol = { danger: '#ff2a3d', white: '#ffffff', blue: '#3fa9ff', gold: '#e9c46a' }[look] || '#e9c46a';
  const col = s.color && !(look !== 'gold' && s.color === '#e9c46a') ? s.color : lookCol;
  const R = Math.max(1, (+s.radiusKm || 100) * 1000);
  const ring = [];
  for (let i = 0; i <= 120; i++) ring.push(o.proj(dest(ll, i * 3, R * kR)));
  const rPx = ring.reduce((m, q) => m + Math.hypot(q[0] - p[0], q[1] - p[1]), 0) / ring.length;
  ctx.save(); ctx.globalAlpha *= tm.alpha * a;
  if (kR > 0.002) {
    if (s.fill !== false) {
      const g = ctx.createRadialGradient(p[0], p[1], rPx * (look === 'danger' ? 0.2 : 0.55), p[0], p[1], rPx);
      g.addColorStop(0, hexA(col, look === 'danger' ? 0.1 : 0)); g.addColorStop(1, hexA(col, look === 'danger' ? 0.32 : 0.16));
      path(ctx, ring); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    }
    const lw = (look === 'danger' ? 5 : 2.2) * unit * (+s.width || 1);
    ctx.save();
    ctx.shadowColor = hexA(col, 0.9); ctx.shadowBlur = (look === 'danger' ? 28 : 10) * unit;
    if (L.anim === 'pulse' && !still && u >= 0.75) ctx.shadowBlur *= 1 + 0.6 * Math.sin((o.time || 0) * 4);
    path(ctx, ring); ctx.closePath(); ctx.strokeStyle = hexA(col, look === 'danger' ? 0.95 : 0.9); ctx.lineWidth = lw; ctx.stroke();
    if (look === 'danger') { ctx.shadowBlur = 0; ctx.lineWidth = lw * 0.35; ctx.strokeStyle = 'rgba(255,220,225,0.8)'; ctx.stroke(); }
    ctx.restore();
  }
  if (s.dot !== false) smallRing(ctx, p[0], p[1], 5 * unit, '#ffffff', unit);
  if (s.label) {
    const k = still ? 1 : seg(u, 0.55, 1);
    const dir = s.labelSide || 'right', len = (+s.labelLen || 90) * unit;
    const v = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] }[dir] || [1, 0];
    const e = [p[0] + v[0] * len * k, p[1] + v[1] * len * k];
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.3 * unit;
    ctx.beginPath(); ctx.moveTo(p[0] + v[0] * 5 * unit, p[1] + v[1] * 5 * unit); ctx.lineTo(e[0], e[1]); ctx.stroke();
    if (k > 0.6) {
      ctx.globalAlpha *= seg(k, 0.6, 1);
      ctx.font = `400 ${17 * unit}px ${FONT}`; ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4 * unit;
      ctx.textAlign = dir === 'left' ? 'right' : dir === 'right' ? 'left' : 'center';
      ctx.fillText(s.label, e[0] + v[0] * 7 * unit, e[1] + v[1] * 14 * unit);
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- dashed corridor
function drawCorridor(ctx, L, tm, o) {
  const s = L.style, unit = o.unit;
  const cs = linesOf(L.geom)[0];
  if (!cs || cs.length < 2) return;
  const A = cs[0], B = cs.at(-1);
  const pa = o.proj(A), pb = o.proj(B);
  const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1;
  // band width in pixels from km (measured across the middle)
  const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  const brg = Math.atan2(B[0] - A[0], B[1] - A[1]) / D2R;
  const side = o.proj(dest(mid, brg + 90, ((+s.widthKm || 100) * 1000) / 2)), pm = o.proj(mid);
  const hw = Math.max(6 * unit, Math.hypot(side[0] - pm[0], side[1] - pm[1]));
  const ang = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
  const u = prog(L, tm), still = tm.edit || L.anim === 'none';
  const k = still || L.anim === 'fade' ? 1 : easeOut(seg(u, 0, 0.8));
  ctx.save(); ctx.globalAlpha *= tm.alpha * (+s.opacity || 0.85) * (L.anim === 'fade' && !still ? u : 1);
  ctx.translate(pa[0], pa[1]); ctx.rotate(ang);
  const P = [[0, -hw], [len, -hw], [len, hw], [0, hw], [0, -hw]];
  ctx.strokeStyle = s.color || '#ffffff'; ctx.lineWidth = 1.5 * unit; ctx.setLineDash([7 * unit, 5 * unit]);
  path(ctx, partial(P, k)); ctx.stroke(); ctx.setLineDash([]);
  if (s.text && k > 0.5) {
    ctx.globalAlpha *= seg(k, 0.5, 1);
    let fs = 22 * unit * (+s.textSize || 1);
    ctx.font = `300 ${fs}px ${FONT}`;
    while (ctx.measureText(s.text).width > len * 0.9 && fs > 8) { fs *= 0.92; ctx.font = `300 ${fs}px ${FONT}`; }
    ctx.fillStyle = hexA(s.color || '#ffffff', 0.85); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const flip = Math.abs(ang) > Math.PI / 2;
    ctx.translate(len / 2, 0); if (flip) ctx.rotate(Math.PI);
    ctx.fillText(s.text, 0, 0);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- hand-drawn red circle
function drawRedMark(ctx, L, tm, o) {
  const s = L.style, unit = o.unit;
  if (L.geom?.type !== 'Point') return;
  const p = o.proj(L.geom.coordinates);
  const u = prog(L, tm), still = tm.edit || L.anim === 'none';
  const k = still || L.anim === 'fade' ? 1 : ease(u);
  const rx = (+s.rx || 70) * unit, ry = (+s.ry || 34) * unit, rot = (+s.rot || 0) * D2R;
  const pts = [];
  const turns = 1.12, n = 90;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * turns, a = -Math.PI * 0.75 + t * Math.PI * 2;
    const wob = 1 + 0.035 * Math.sin(t * 9 + 1.3) + (t > 1 ? 0.06 * (t - 1) / 0.12 : 0);
    const x = Math.cos(a) * rx * wob, y = Math.sin(a) * ry * wob;
    pts.push([p[0] + x * Math.cos(rot) - y * Math.sin(rot), p[1] + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  ctx.save(); ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !still ? u : 1);
  ctx.strokeStyle = s.color || '#e01e2b'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 3 * unit;
  ctx.lineWidth = 3.2 * unit * (+s.width || 1);
  path(ctx, partial(pts, k)); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- measure line
function drawMeasureLine(ctx, L, tm, o) {
  const s = L.style, unit = o.unit;
  const cs = linesOf(L.geom)[0];
  if (!cs || cs.length < 2) return;
  const P = cs.map(o.proj);
  let m = 0;
  for (let i = 1; i < cs.length; i++) m += haversine(cs[i - 1], cs[i]);
  const u = prog(L, tm), still = tm.edit || L.anim === 'none';
  const k = still || L.anim === 'fade' ? 1 : ease(seg(u, 0, 0.75));
  ctx.save(); ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !still ? u : 1);
  const col = s.color || '#e01e2b', lw = 4 * unit * (+s.width || 1);
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'butt';
  ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 4 * unit;
  path(ctx, partial(P, k)); ctx.stroke();
  if (s.ends !== false) {
    for (const [i, j] of [[0, 1], [P.length - 1, P.length - 2]]) {
      if (i && k < 1) continue;
      const a = Math.atan2(P[j][1] - P[i][1], P[j][0] - P[i][0]) + Math.PI / 2, t = 9 * unit;
      ctx.lineWidth = lw * 0.6; ctx.beginPath(); ctx.moveTo(P[i][0] + Math.cos(a) * t, P[i][1] + Math.sin(a) * t); ctx.lineTo(P[i][0] - Math.cos(a) * t, P[i][1] - Math.sin(a) * t); ctx.stroke();
    }
  }
  ctx.shadowBlur = 0;
  const kt = still ? 1 : seg(u, 0.25, 0.9);
  if (kt > 0) {
    const txt = s.text || fmtKm(m * (L.anim === 'draw' && !still ? ease(kt) : 1));
    const fs = 54 * unit * (+s.textSize || 1);
    // middle of the line and its normal
    const mi = Math.floor((P.length - 1) / 2), a0 = P[mi], a1 = P[Math.min(P.length - 1, mi + 1)];
    const mx = (P[0][0] + P.at(-1)[0]) / 2, my = (P[0][1] + P.at(-1)[1]) / 2;
    let ang = Math.atan2(a1[1] - a0[1], a1[0] - a0[0]); if (Math.abs(ang) > Math.PI / 2) ang += Math.PI;
    ctx.translate(mx, my); ctx.rotate(ang);
    ctx.globalAlpha *= clamp(kt * 1.5, 0, 1);
    ctx.font = `300 ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = s.textColor || '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 8 * unit;
    const off2 = s.side === 'on' ? 0 : (s.side === 'below' ? 1 : -1) * (fs * 0.75 + lw);
    ctx.fillText(txt, 0, off2);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- stem label
function drawStemLabel(ctx, L, tm, o) {
  const s = L.style, unit = o.unit, fr = o.frame;
  if (L.geom?.type !== 'Point') return;
  const p = o.proj(L.geom.coordinates);
  const u = prog(L, tm), still = tm.edit || L.anim === 'none';
  const sz = +s.size || 1, col = s.color || '#ffffff';
  const dir = s.dir || 'right', len = (+s.len || 70) * unit * sz;
  const v = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] }[dir] || [1, 0];
  const r = 6 * unit * sz;
  const kRing = still ? 1 : easeOut(seg(u, 0, 0.3)), kLine = still ? 1 : easeOut(seg(u, 0.2, 0.65)), kTxt = still ? 1 : seg(u, 0.55, 1);
  ctx.save(); ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !still ? u : 1);
  if (fr) placeAt(ctx, L, fr, p[0] - r, p[1] - r, r * 2, r * 2, { key: 'pin' });
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4 * unit;
  if (s.ring !== false && kRing > 0) { ctx.strokeStyle = col; ctx.lineWidth = 1.6 * unit * sz; ctx.beginPath(); ctx.arc(p[0], p[1], r * kRing, 0, 7); ctx.stroke(); }
  const x0 = p[0] + v[0] * r, y0 = p[1] + v[1] * r, x1 = x0 + v[0] * len * kLine, y1 = y0 + v[1] * len * kLine;
  if (kLine > 0) { ctx.strokeStyle = col; ctx.lineWidth = 1.4 * unit * sz; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
  if (kTxt > 0 && s.text) {
    ctx.globalAlpha *= kTxt;
    const fs = 20 * unit * sz;
    ctx.font = `400 ${fs}px ${FONT}`; ctx.fillStyle = col; ctx.textBaseline = 'middle';
    ctx.textAlign = dir === 'left' ? 'right' : dir === 'right' ? 'left' : 'center';
    const tx = x1 + v[0] * 8 * unit + (1 - kTxt) * v[0] * 10 * unit, ty = y1 + v[1] * (fs * 0.8);
    ctx.fillText(s.text, tx, ty);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- dashed routes + legend
function drawDashRoute(ctx, L, tm, o, phase) {
  const s = L.style, unit = o.unit;
  const u = prog(L, tm), still = tm.edit || L.anim === 'none';
  const col = s.color || '#ffffff';
  if (phase === 'above') {
    const cs = linesOf(L.geom)[0];
    if (!cs || cs.length < 2) return;
    let P = cs.map(o.proj);
    if (s.smooth !== false) P = smoothPts(P);
    const k = still ? 1 : ease(seg(u, 0, 1));
    const d = 9 * unit * (+s.dash || 1);
    ctx.save(); ctx.globalAlpha *= tm.alpha;
    ctx.strokeStyle = col; ctx.lineWidth = 2.2 * unit * (+s.width || 1); ctx.lineCap = 'round';
    if (s.glow) { ctx.shadowColor = hexA(col, 0.8); ctx.shadowBlur = 8 * unit; }
    ctx.setLineDash([d, d * 0.8]);
    ctx.lineDashOffset = L.anim === 'march' || (L.anim === 'draw' && k >= 1) ? -((o.time || 0) * 20 * unit) % (d * 1.8) : 0;
    path(ctx, partial(P, k)); ctx.stroke();
    ctx.restore();
  } else if (phase === 'captions' && o.frame && s.legend) {
    // one legend box for every dashed route of the scene, bottom right
    const all = (o.scene?.layers || []).filter((l) => l.kind === 'dashroute' && l.style?.legend && l.visible !== false && !l.hidden);
    const idx = all.findIndex((l) => l.id === L.id);
    if (idx < 0) return;
    const fr = o.frame, rowH = 22 * unit, W = 230 * unit;
    const x = fr.x + fr.w - W - 26 * unit, y = fr.y + fr.h - 24 * unit - (all.length - idx) * rowH;
    ctx.save(); ctx.globalAlpha *= tm.alpha * (still ? 1 : seg(u, 0.1, 0.4));
    placeAt(ctx, L, fr, x, y, W, rowH, { key: 'legend' });
    ctx.strokeStyle = col; ctx.lineWidth = 2 * unit; ctx.setLineDash([6 * unit, 4 * unit]);
    ctx.beginPath(); ctx.moveTo(x, y + rowH / 2); ctx.lineTo(x + 46 * unit, y + rowH / 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = `400 ${12.5 * unit}px ${FONT}`; ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 4 * unit;
    ctx.fillText(s.legend, x + 56 * unit, y + rowH / 2);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- dispatcher
export function drawDocu(ctx, L, tm, o, phase) {
  H.setMap(o.map);
  switch (L.kind) {
    case 'docinset': if (phase === 'captions') drawDocInset(ctx, L, tm, o); break;
    case 'zonering': if (phase === 'above') drawZoneRing(ctx, L, tm, o); break;
    case 'corridor': if (phase === 'above') drawCorridor(ctx, L, tm, o); break;
    case 'redmark': if (phase === 'above') drawRedMark(ctx, L, tm, o); break;
    case 'measureline': if (phase === 'above') drawMeasureLine(ctx, L, tm, o); break;
    case 'stemlabel': if (phase === 'captions') drawStemLabel(ctx, L, tm, o); break;
    case 'dashroute': drawDashRoute(ctx, L, tm, o, phase); break;
    default: break;
  }
}
