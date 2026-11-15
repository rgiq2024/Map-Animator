// Geo visualisations:
//   detonation — a large detonation for documentaries: flash, fireball, shock dome, base surge, condensation
//                ring and a rising mushroom cloud in true 3D over the map, then the damage rings (illustration)
//   flowfield  — wind or ocean currents as glowing streamlines and / or arrows (pattern, or live Open-Meteo data)
//   rivernet   — a glowing river network that grows across the view (OpenStreetMap / Natural Earth)
//   stackmap   — GIS overlay analysis: factor layers float in as an exploded 3D stack, pins pass through them,
//                and they combine into a suitability map (site selection — wind farms, solar, housing…)
import { makeProjAlt } from './recon.js';
import { drawPuffSet } from './explosion.js';
import { blastZones } from './hazards.js';
import { imageFor } from './geoimage.js';
import { drawMapCrop } from './vizfx.js';
import { brandSafeArea, brandLowerSafe } from './branding.js';

const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const SANS = '"Inter","Segoe UI",system-ui,sans-serif';
function rng(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (a, b) => { let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
const offset = (ll, ex, ny) => [ll[0] + ex / (111320 * Math.cos(ll[1] * D2R)), ll[1] + ny / 110574]; // metres east / north
function hexRGB(h) { const n = parseInt(String(h || '#fff').replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const rgba = (h, a) => { const [r, g, b] = hexRGB(h); return `rgba(${r},${g},${b},${a})`; };

// colour ramps (0..1 → [r,g,b])
const RAMPS = {
  magma: [[0, 0, 4], [80, 18, 123], [182, 54, 121], [251, 136, 97], [252, 253, 191]],
  turbo: [[48, 18, 59], [40, 152, 230], [65, 230, 120], [240, 215, 40], [235, 90, 20], [122, 4, 3]],
  blue: [[10, 30, 90], [30, 110, 220], [90, 190, 255], [220, 245, 255]],
  white: [[160, 180, 200], [255, 255, 255]],
  suit: [[40, 60, 200], [40, 170, 230], [60, 200, 80], [250, 230, 40], [250, 120, 20], [220, 20, 20]],
  slope: [[30, 120, 40], [140, 200, 60], [250, 230, 60], [240, 120, 30], [190, 30, 30]],
};
function ramp(name, t) {
  const R = RAMPS[name] || RAMPS.turbo, x = clamp(t, 0, 1) * (R.length - 1), i = Math.min(R.length - 2, Math.floor(x)), f = x - i;
  return [R[i][0] + (R[i + 1][0] - R[i][0]) * f, R[i][1] + (R[i + 1][1] - R[i][1]) * f, R[i][2] + (R[i + 1][2] - R[i][2]) * f];
}

// =================================================================== registry
export const GV_KINDS = {
  detonation: { name: 'Detonation (3D mushroom cloud)', icon: '☢', geom: 'point', desc: 'Flash, fireball, expanding shock dome, ground surge and a rising mushroom cloud in 3D, then the damage rings — sized by yield (illustration)' },
  flowfield: { name: 'Wind / current flow', icon: '🌬', geom: null, desc: 'Glowing streamlines and / or arrows for wind or ocean currents — a pattern you set, or live data from Open-Meteo' },
  rivernet: { name: 'River network glow', icon: '〰', geom: null, desc: 'Rivers and streams of the view as a glowing network that grows from the sources (OpenStreetMap or Natural Earth)' },
  windfarm: { name: 'Wind farm (3D turbines)', icon: '🌀', geom: 'polygon', desc: 'Draw an area: real-size 3D wind turbines fill it on a staggered grid, face the wind, rise one by one and spin' },
  stackmap: { name: 'Overlay analysis stack', icon: '🗂', geom: null, desc: 'GIS site selection: factor maps float in as an exploded 3D stack, pins go through them, and they combine into a suitability map with wind turbines' },
};
export const GV_ANIMS = {
  detonation: { play: 'Detonate', none: 'Show the end state' },
  flowfield: { fade: 'Fade in', none: 'Already there' },
  rivernet: { grow: 'Grow from the sources', fade: 'Fade in', none: 'Already there' },
  windfarm: { grow: 'Turbines rise one by one', none: 'Already there' },
  stackmap: { build: 'Build the stack, then combine', fade: 'Fade in', none: 'Already there' },
};
const YIELDS = { '0.5': '0.5 kt — small tactical', '15': '15 kt — Hiroshima', '21': '21 kt — Nagasaki', '100': '100 kt', '300': '300 kt', '1000': '1 Mt', '5000': '5 Mt', '50000': '50 Mt — Tsar Bomba' };
export const GV_DEFAULTS = {
  detonation: { yieldKt: '15', burst: 'air', flash: true, dome: true, surge: true, mushroom: true, embers: true, rings: true, ringsAt: 10, ringLabels: true, cloudScale: 1.1, timeScale: 1, tint: true, seed: 1 },
  flowfield: { field: 'wind', source: 'pattern', dir: 225, speed: 1, eddies: 3, seed: 3, mode: 'particles', palette: 'magma', count: 1600, trail: 1, width: 1, glow: true, arrowSpacing: 46, arrowColor: '#4da3ff', dim: 0.25, legend: true, grid: null },
  rivernet: { color: '#2f8bff', glow: 1, width: 1, dim: 0.85, minor: true, lines: [], source: '', title: 'River networks', place: '' },
  windfarm: { spacing: 450, hub: 95, rotor: 120, rpm: 14, windFrom: 225, max: 60, seed: 1 },
  stackmap: { layout: 'stack', title: 'Fuzzy logic approach to wind farm prospecting', sub: 'Maps combined using weighted overlay', resultTitle: 'Model of wind farm & turbine placement targets',
    l1: 'Ridgeline modelling', l1Look: 'ridges', l1Img: '', w1: 20,
    l2: 'Surrounding terrain', l2Look: 'terrain', l2Img: '', w2: 15,
    l3: 'Slope analysis', l3Look: 'slope', l3Img: '', w3: 20,
    l4: 'Wind speed', l4Look: 'heat', l4Img: '', w4: 35,
    l5: 'Study area', l5Look: 'gray', l5Img: '', w5: 10,
    l6: '', l6Look: 'landuse', l6Img: '', w6: 0,
    resultLook: 'suit', resultImg: '', turbines: 4, pins: 9, accent: '#e8412c', bg: '#f4f5f2', bgAlpha: 0.0, dark: true, textSize: 1 },
};
const LOOKS = { satellite: 'The map as it is', ridges: 'Ridges (blue relief)', terrain: 'Terrain (sand)', slope: 'Slope (green → red)', heat: 'Heat ramp (wind speed)', gray: 'Grey hillshade', landuse: 'Land use (posterised)', lines: 'Edges / lines (roads, power lines)', suit: 'Suitability (blue → red)' };
const layerRows = [1, 2, 3, 4, 5, 6].flatMap((i) => [[`style.l${i}`, `Layer ${i} name${i === 6 ? ' (empty = not used)' : ''}`, 'text'], [`style.l${i}Look`, `Layer ${i} look`, 'select', LOOKS, (L) => !!L.style[`l${i}`]], [`style.l${i}Img`, `Layer ${i} — your own map image (optional)`, 'image', null, (L) => !!L.style[`l${i}`]], [`style.w${i}`, `Layer ${i} weight %`, 'range', [0, 100, 1], (L) => !!L.style[`l${i}`] && L.style.layout === 'flow']]);
export const GV_FORMS = {
  detonation: [
    ['style.yieldKt', 'Yield', 'select', YIELDS],
    ['style.burst', 'Burst', 'select', { air: 'Air burst', surface: 'Surface burst' }],
    ['style.timeScale', 'Speed (1 = about 14 s)', 'range', [0.25, 3, 0.05]],
    ['style.cloudScale', 'Mushroom cloud size', 'range', [0.3, 3, 0.05]],
    ['style.flash', 'White flash', 'switch'], ['style.tint', 'Warm light over the city', 'switch'],
    ['style.dome', 'Shock dome', 'switch'], ['style.surge', 'Ground dust surge', 'switch'], ['style.mushroom', 'Mushroom cloud', 'switch'], ['style.embers', 'Fires across the burn area', 'switch'],
    ['style.rings', 'Damage rings at the end', 'switch'], ['style.ringLabels', 'Ring labels', 'switch', null, (L) => L.style.rings !== false],
    ['style.ringsAt', 'Rings appear at (s)', 'range', [0, 30, 0.5], (L) => L.style.rings !== false],
    ['style.seed', 'Variation', 'range', [1, 50, 1]],
    ['', 'Radii are approximate, scaled from published reference values (like NUKEMAP) — for illustration only.', 'note'],
  ],
  flowfield: [
    ['style.field', 'What flows', 'select', { wind: 'Wind (10 m)', current: 'Ocean currents' }],
    ['style.source', 'Data', 'select', { pattern: 'A pattern I set', live: 'Live data for this view (fetch below)' }],
    ['', '🌐 Fetch live data for the map view (Open-Meteo)', 'gvaction', 'flowFetch', (L) => L.style.source === 'live'],
    ['style.dir', 'Flows towards (°)', 'range', [0, 359, 1], (L) => L.style.source !== 'live'],
    ['style.eddies', 'Eddies', 'range', [0, 8, 1], (L) => L.style.source !== 'live'],
    ['style.seed', 'Variation', 'range', [1, 50, 1], (L) => L.style.source !== 'live'],
    ['style.mode', 'Show as', 'select', { particles: 'Glowing streamlines', arrows: 'Arrows', both: 'Streamlines and arrows' }],
    ['style.palette', 'Colours', 'select', { magma: 'Magma (pink → yellow)', turbo: 'Rainbow', blue: 'Blue', white: 'White' }, (L) => L.style.mode !== 'arrows'],
    ['style.count', 'Streamlines', 'range', [200, 5000, 100], (L) => L.style.mode !== 'arrows'],
    ['style.trail', 'Trail length', 'range', [0.2, 3, 0.05], (L) => L.style.mode !== 'arrows'],
    ['style.speed', 'Speed', 'range', [0.1, 4, 0.05]],
    ['style.width', 'Line width', 'range', [0.3, 4, 0.1]],
    ['style.glow', 'Glow', 'switch'],
    ['style.arrowSpacing', 'Arrow spacing (px)', 'range', [16, 140, 2], (L) => L.style.mode !== 'particles'],
    ['style.arrowColor', 'Arrow colour', 'color', null, (L) => L.style.mode !== 'particles'],
    ['style.dim', 'Darken the map', 'range', [0, 1, 0.02]],
    ['style.legend', 'Speed legend', 'switch'],
  ],
  rivernet: [
    ['', '🌊 Fetch the rivers of the map view', 'gvaction', 'riversFetch'],
    ['style.color', 'Colour', 'color'], ['style.glow', 'Glow', 'range', [0, 3, 0.05]], ['style.width', 'Width', 'range', [0.2, 4, 0.05]],
    ['style.minor', 'Include small streams', 'switch'], ['style.dim', 'Darken the map', 'range', [0, 1, 0.02]],
    ['style.title', 'Title', 'text'], ['style.place', 'Place (big text)', 'text'],
  ],
  windfarm: [
    ['style.spacing', 'Spacing between turbines (m)', 'range', [150, 1500, 10]],
    ['style.hub', 'Hub height (m)', 'range', [40, 180, 1]], ['style.rotor', 'Rotor diameter (m)', 'range', [30, 240, 1]],
    ['style.rpm', 'Rotor speed (rpm)', 'range', [0, 30, 0.5]], ['style.windFrom', 'Wind from (°)', 'range', [0, 359, 1]],
    ['style.max', 'At most this many turbines', 'range', [1, 200, 1]], ['style.seed', 'Variation', 'range', [1, 50, 1]],
  ],
  stackmap: [
    ['style.layout', 'Layout', 'select', { stack: '3D exploded stack → result (like a textbook figure)', flow: 'Factor maps → weighted overlay → result (flow chart)' }],
    ['style.title', 'Title', 'text'], ['style.sub', 'Caption under the stack', 'text'], ['style.resultTitle', 'Caption under the result', 'text'],
    ...layerRows,
    ['style.resultLook', 'Result look', 'select', LOOKS], ['style.resultImg', 'Result — your own map image (optional)', 'image'],
    ['style.turbines', 'Wind turbines on the result', 'range', [0, 12, 1]], ['style.pins', 'Pins through the stack', 'range', [0, 24, 1], (L) => L.style.layout !== 'flow'],
    ['style.dark', 'Dark background', 'switch'], ['style.bgAlpha', 'Background opacity (0 = the map shows)', 'range', [0, 1, 0.02]],
    ['style.accent', 'Arrow colour', 'color'], ['style.textSize', 'Text size', 'range', [0.6, 1.6, 0.05]],
  ],
};
/** as the layer registry wants them: { anim, duration, style } */
export const GV_LAYER_DEFAULTS = Object.fromEntries(Object.entries(GV_DEFAULTS).map(([k, st]) => [k, { anim: Object.keys(GV_ANIMS[k] || { fade: 1 })[0], duration: { detonation: 16, flowfield: 1.2, rivernet: 8, windfarm: 6, stackmap: 8 }[k] || 2, style: st }]));
export const GV_SET = new Set(Object.keys(GV_KINDS));
export const gvPhases = (kind) => (kind === 'windfarm' ? ['below'] : kind === 'stackmap' ? ['captions'] : kind === 'rivernet' || kind === 'flowfield' ? ['below'] : ['above']);

// =================================================================== detonation
const yieldOf = (s) => Math.max(0.01, +s.yieldKt || 15);
/** sizes (metres) used by the animation */
function blastSizes(s) {
  const Z = blastZones({ mode: 'nuclear', yieldKt: yieldOf(s) });
  const km = (n) => (Z.find((z) => z.name.startsWith(n)) || Z[0]).km * 1000;
  const Rf = km('Fireball'), R20 = km('Heavy'), R5 = km('Moderate'), Rth = km('Thermal'), R1 = km('Light');
  const k = clamp(+s.cloudScale || 1, 0.2, 4);
  return { Z, Rf, R20, R5, Rth, R1, Hcap: R5 * 2.4 * k, Rcap: R5 * 0.95 * k, burstH: s.burst === 'surface' ? 0 : Rf * 1.4 };
}
export function drawDetonation(ctx, L, tm, o) {
  const s = { ...GV_DEFAULTS.detonation, ...L.style }, ll = L.geom?.coordinates;
  if (!ll) return;
  const fr = o.frame, u = o.unit;
  const T = tm.edit || L.anim === 'none' ? 30 : tm.tau * clamp(+s.timeScale || 1, 0.05, 10);
  if (T < 0) return;
  const P = makeProjAlt(o);
  const B = blastSizes(s);
  const R = rng((+s.seed || 1) * 977);
  const g = ctx;
  const p0 = P(ll, 0);
  if (!Number.isFinite(p0[0])) return;
  // pixels per metre near ground zero (for sizing sprites)
  const ppm = (ll2, alt) => { const a = P(ll2, alt), b = P(offset(ll2, 100, 0), alt); return Math.hypot(b[0] - a[0], b[1] - a[1]) / 100 || 0.001; };
  g.save();
  g.globalAlpha = tm.alpha ?? 1;
  // ---- warm light over the city
  if (s.tint !== false) {
    const k = T < 0.4 ? T / 0.4 : Math.max(0, 1 - (T - 0.4) / 9);
    if (k > 0) { g.save(); g.globalCompositeOperation = 'soft-light'; g.fillStyle = `rgba(255,140,40,${0.55 * k})`; g.fillRect(fr.x, fr.y, fr.w, fr.h); g.restore(); }
    const R0 = ppm(ll, 0) * B.R5 * 2.2;
    const gl = g.createRadialGradient(p0[0], p0[1], 0, p0[0], p0[1], R0);
    gl.addColorStop(0, `rgba(255,190,90,${0.5 * k})`); gl.addColorStop(1, 'rgba(255,120,40,0)');
    g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = gl; g.fillRect(fr.x, fr.y, fr.w, fr.h); g.restore();
  }
  // ---- ground circle helper (projected polygon at an altitude)
  const ringPath = (rad, alt = 0, n = 72) => { g.beginPath(); let ok = false; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, q = P(offset(ll, Math.cos(a) * rad, Math.sin(a) * rad), alt); if (!Number.isFinite(q[0])) continue; if (!ok) { g.moveTo(q[0], q[1]); ok = true; } else g.lineTo(q[0], q[1]); } g.closePath(); return ok; };
  // ---- fires and embers inside the burn radius, lit as the shock passes
  const shockR = (t) => B.Rf + (B.R1 - B.Rf) * easeOut((t - 0.25) / 4.2);
  if (s.embers !== false && T > 0.5) {
    const R2 = rng((+s.seed || 1) * 31);
    const n = 520, rs = shockR(T);
    for (let i = 0; i < n; i++) {
      const a = R2() * Math.PI * 2, r = Math.sqrt(R2()) * B.Rth, tw = R2();
      if (r > rs) continue;
      const q = P(offset(ll, Math.cos(a) * r, Math.sin(a) * r), 0);
      if (!Number.isFinite(q[0])) continue;
      const fl = 0.55 + 0.45 * Math.sin(T * (6 + tw * 9) + i);
      const sz = (0.8 + tw * 1.8) * u * (r < B.R5 ? 1.4 : 1);
      g.fillStyle = `rgba(255,${Math.round(110 + 90 * tw)},40,${0.85 * fl})`;
      g.beginPath(); g.arc(q[0], q[1], sz, 0, Math.PI * 2); g.fill();
    }
  }
  // ---- shock dome: a translucent hemisphere racing outwards
  if (s.dome !== false && T > 0.2 && T < 6) {
    const r = shockR(T), fade = T < 4.4 ? 1 : 1 - (T - 4.4) / 1.6;
    const pts = [];
    for (let i = 0; i <= 36; i++) for (let j = 0; j <= 9; j++) { const a = (i / 36) * Math.PI * 2, e = (j / 9) * Math.PI / 2; const q = P(offset(ll, Math.cos(a) * Math.cos(e) * r, Math.sin(a) * Math.cos(e) * r), Math.sin(e) * r * 0.85); if (Number.isFinite(q[0])) pts.push(q); }
    const H = hull(pts);
    if (H.length > 2) {
      g.save();
      g.beginPath(); H.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath();
      const cx = H.reduce((t, q) => t + q[0], 0) / H.length, cy = H.reduce((t, q) => t + q[1], 0) / H.length, rr = Math.max(...H.map((q) => Math.hypot(q[0] - cx, q[1] - cy)));
      const gd = g.createRadialGradient(cx, cy, rr * 0.2, cx, cy, rr);
      gd.addColorStop(0, `rgba(255,200,140,${0.06 * fade})`); gd.addColorStop(0.75, `rgba(255,150,70,${0.16 * fade})`); gd.addColorStop(1, `rgba(255,120,40,${0.42 * fade})`);
      g.fillStyle = gd; g.fill();
      g.strokeStyle = `rgba(255,170,90,${0.65 * fade})`; g.lineWidth = 2 * u; g.stroke();
      g.restore();
      if (ringPath(r, 0)) { g.strokeStyle = `rgba(255,120,30,${0.9 * fade})`; g.lineWidth = 3 * u; g.stroke(); }
    }
  }
  // ---- base surge: a ring of dust rolling outwards along the ground
  if (s.surge !== false && T > 0.8) {
    const k = easeOut((T - 0.8) / 7), r = B.Rf * 1.2 + (B.R5 * 1.15 - B.Rf * 1.2) * k, a0 = T < 7 ? 1 : Math.max(0, 1 - (T - 7) / 6);
    if (a0 > 0) {
      const n = 46, sc = ppm(ll, 0);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + hash(i, 7) * 0.12, rr = r * (0.94 + 0.12 * hash(i, 3));
        const q = P(offset(ll, Math.cos(a) * rr, Math.sin(a) * rr), B.R5 * 0.05);
        if (!Number.isFinite(q[0])) continue;
        drawPuffSet(g, q[0], q[1], sc * B.R5 * (0.16 + 0.08 * hash(i, 9)) * (0.6 + 0.4 * k), a + T * 0.2, 0.75 * a0, 'dust');
      }
    }
  }
  // ---- mushroom cloud: the fireball rises and rolls into a cap on a column of smoke
  const rise = ease((T - 1.2) / 10), Hc = B.burstH + (B.Hcap - B.burstH) * rise;
  if (s.mushroom !== false && T > 1.0) {
    const capR = B.Rf * 1.3 + (B.Rcap - B.Rf * 1.3) * easeOut((T - 1.2) / 9);
    const tube = capR * 0.42, heat = clamp(1 - (T - 1.5) / 8, 0, 1);
    const items = [];
    // stem: a narrowing column from the ground up into the cap
    const stemTop = Hc - tube * 0.6;
    if (stemTop > 0) {
      const ns = 26;
      for (let i = 0; i < ns; i++) {
        const v = i / (ns - 1), h = stemTop * v * clamp((T - 1.6) / 4, 0, 1) ** 0.6;
        const w = capR * (0.24 - 0.08 * v) * (1 + 0.6 * (1 - v) ** 4);
        const a = hash(i, 11) * Math.PI * 2, rr = w * 0.35 * hash(i, 12);
        items.push({ ll: offset(ll, Math.cos(a + T * 0.3) * rr, Math.sin(a + T * 0.3) * rr), alt: h, r: w * (0.9 + 0.3 * hash(i, 13)), set: v > 0.75 && heat > 0.3 ? 'cool' : 'smoke', a: 0.9, rot: i + T * 0.15 });
      }
      // skirt of dust where the column meets the ground
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; items.push({ ll: offset(ll, Math.cos(a) * capR * 0.35, Math.sin(a) * capR * 0.35), alt: capR * 0.05, r: capR * 0.28, set: 'dust', a: 0.75 * clamp((T - 1.5) / 2, 0, 1), rot: a }); }
    }
    // cap: a rolling torus plus a domed top
    const nc = 64;
    for (let i = 0; i < nc; i++) {
      const th = (i / nc) * Math.PI * 2 + hash(i, 1) * 0.2, ph = hash(i, 2) * Math.PI * 2 + T * 0.55; // the tube rolls outwards / downwards
      const ring = capR - tube * 0.3 + tube * Math.cos(ph);
      items.push({ ll: offset(ll, Math.cos(th) * ring, Math.sin(th) * ring), alt: Hc + tube * 0.75 * Math.sin(ph), r: tube * (0.8 + 0.4 * hash(i, 4)), set: heat > 0.65 ? 'hot' : heat > 0.3 ? 'mid' : Math.sin(ph) < -0.2 && heat > 0.1 ? 'cool' : 'smoke', a: 0.95, rot: th + T * 0.2 });
    }
    for (let i = 0; i < 26; i++) {
      const th = hash(i, 5) * Math.PI * 2, rr = capR * 0.7 * Math.sqrt(hash(i, 6));
      items.push({ ll: offset(ll, Math.cos(th) * rr, Math.sin(th) * rr), alt: Hc + tube * (0.7 + 0.5 * hash(i, 8)), r: tube * (0.9 + 0.5 * hash(i, 9)), set: heat > 0.55 ? 'hot' : heat > 0.25 ? 'mid' : 'smoke', a: 0.95, rot: th });
    }
    // draw far → near (lower on the screen is nearer under a tilted camera)
    for (const it of items) { const q = P(it.ll, it.alt); it.x = q[0]; it.y = q[1]; it.px = ppm(it.ll, it.alt) * it.r; }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) if (Number.isFinite(it.x)) drawPuffSet(g, it.x, it.y, it.px, it.rot, it.a, it.set);
    // the glowing underside of the young cap
    if (heat > 0) {
      const q = P(ll, Hc), rp = ppm(ll, Hc) * capR * 1.2;
      if (Number.isFinite(q[0])) { const gg = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], rp); gg.addColorStop(0, `rgba(255,220,150,${0.7 * heat})`); gg.addColorStop(1, 'rgba(255,120,40,0)'); g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gg; g.beginPath(); g.arc(q[0], q[1], rp, 0, Math.PI * 2); g.fill(); g.restore(); }
    }
  }
  // ---- condensation (Wilson) rings around the column
  if (s.mushroom !== false && T > 1.6 && T < 6.5) {
    const k = clamp((T - 1.6) / 1.2, 0, 1) * clamp((6.5 - T) / 1.5, 0, 1);
    for (const [hh, rr] of [[0.45, 1.5], [0.8, 1.05]]) {
      const alt = Hc * hh, rad = B.Rcap * rr * easeOut((T - 1.6) / 3);
      if (ringPath(rad, alt, 60)) { g.save(); g.lineWidth = Math.max(2, ppm(ll, alt) * rad * 0.07); g.strokeStyle = `rgba(245,240,235,${0.5 * k})`; g.filter = 'blur(2px)'; g.stroke(); g.restore(); }
    }
  }
  // ---- fireball
  const fbOn = T < 7.5;
  if (fbOn) {
    const grow = easeOut(T / 0.6), heat = clamp(1 - (T - 0.8) / 5.5, 0, 1);
    const alt = s.mushroom !== false ? Math.max(B.burstH, Hc) : B.burstH;
    const q = P(ll, Math.max(alt, B.Rf * 0.4));
    if (Number.isFinite(q[0]) && heat > 0) {
      const rp = ppm(ll, alt) * B.Rf * (0.3 + 0.7 * grow) * (1 + 0.04 * Math.sin(T * 40));
      g.save(); g.globalCompositeOperation = 'lighter';
      const gg = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], rp * 2.6);
      gg.addColorStop(0, `rgba(255,255,250,${heat})`); gg.addColorStop(0.3, `rgba(255,240,190,${heat})`); gg.addColorStop(0.42, `rgba(255,190,90,${0.85 * heat})`); gg.addColorStop(0.7, `rgba(255,120,40,${0.35 * heat})`); gg.addColorStop(1, 'rgba(255,90,20,0)');
      g.fillStyle = gg; g.beginPath(); g.arc(q[0], q[1], rp * 2.6, 0, Math.PI * 2); g.fill();
      g.restore();
      // boiling surface
      for (let i = 0; i < 14; i++) { const a = hash(i, 21) * Math.PI * 2, d = rp * 0.55 * hash(i, 22); drawPuffSet(g, q[0] + Math.cos(a) * d, q[1] + Math.sin(a) * d, rp * (0.45 + 0.3 * hash(i, 23)), a + T, 0.8 * heat, heat > 0.6 ? 'hot' : 'mid'); }
    }
  }
  // ---- flash
  if (s.flash !== false && T < 0.9) {
    const k = T < 0.06 ? T / 0.06 : 1 - easeOut((T - 0.06) / 0.84);
    g.fillStyle = `rgba(255,255,250,${0.95 * k})`; g.fillRect(fr.x, fr.y, fr.w, fr.h);
  }
  // ---- damage rings
  if (s.rings !== false && T >= (+s.ringsAt || 9)) {
    const t0 = +s.ringsAt || 9;
    B.Z.forEach((z, i) => {
      const k = easeOut((T - t0 - i * 0.35) / 0.9); if (k <= 0) return;
      if (!ringPath(z.km * 1000 * k, 0, 96)) return;
      g.save(); g.fillStyle = rgba(z.color, 0.08); g.fill(); g.setLineDash([8 * u, 5 * u]); g.lineWidth = 2 * u; g.strokeStyle = z.color; g.stroke(); g.restore();
      if (s.ringLabels !== false && k > 0.9) {
        const an = (12 + i * 16) * D2R, q = P(offset(ll, Math.cos(an) * z.km * 1000, Math.sin(an) * z.km * 1000), 0);
        if (!Number.isFinite(q[0])) return;
        const txt = `${z.name} · ${z.km < 1 ? `${Math.round(z.km * 1000)} m` : `${z.km.toFixed(z.km < 10 ? 1 : 0)} km`}`;
        g.font = `600 ${11 * u}px ${SANS}`; const tw = g.measureText(txt).width + 12 * u;
        const y = q[1] - (B.Z.length - i) * 0 - 9 * u;
        g.fillStyle = 'rgba(8,10,14,0.78)'; g.fillRect(q[0] + 4 * u, y - 9 * u, tw, 18 * u);
        g.fillStyle = z.color; g.fillRect(q[0] + 4 * u, y - 9 * u, 3 * u, 18 * u);
        g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(txt, q[0] + 11 * u, y);
      }
    });
  }
  g.restore();
}
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// =================================================================== flow field
/** css px → [lng, lat] for the frame */
function unprojector(o) {
  const m = o.map; if (!m) return null;
  const ctr = m.getCenter(), a = m.project(ctr), pa = o.proj([ctr.lng, ctr.lat]), k = o.px || 1;
  const ox = pa[0] - a.x * k, oy = pa[1] - a.y * k;
  return (x, y) => { const l = m.unproject([(x - ox) / k, (y - oy) / k]); return [l.lng, l.lat]; };
}
function gridSample(G, lng, lat) {
  const [w, s0, e, n] = G.bbox, fx = (lng - w) / (e - w) * (G.nx - 1), fy = (lat - s0) / (n - s0) * (G.ny - 1);
  if (fx < 0 || fy < 0 || fx > G.nx - 1 || fy > G.ny - 1) return null;
  const i = Math.min(G.nx - 2, Math.floor(fx)), j = Math.min(G.ny - 2, Math.floor(fy)), tx = fx - i, ty = fy - j;
  const at = (ii, jj) => jj * G.nx + ii;
  const c = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)];
  if (c.some((k) => G.u[k] == null)) { const k = c.find((q) => G.u[q] != null); return k == null ? null : [G.u[k], G.v[k]]; }
  const lerp = (A) => (A[c[0]] * (1 - tx) + A[c[1]] * tx) * (1 - ty) + (A[c[2]] * (1 - tx) + A[c[3]] * tx) * ty;
  return [lerp(G.u), lerp(G.v)];
}
/** The vector field over the frame, on a coarse screen grid (px/s and speed 0..1) — rebuilt each frame. */
function screenField(s, o, fr) {
  const NX = 40, NY = Math.max(12, Math.round(40 * fr.h / fr.w));
  const VX = new Float32Array(NX * NY), VY = new Float32Array(NX * NY), SP = new Float32Array(NX * NY);
  const live = s.source === 'live' && s.grid?.u?.length;
  const un = live ? unprojector(o) : null;
  const bear = (o.map?.getBearing?.() || 0) * D2R;
  let vmax = 0;
  const R = rng((+s.seed || 1) * 131);
  const ed = Array.from({ length: Math.round(+s.eddies || 0) }, () => ({ x: 0.1 + 0.8 * R(), y: 0.1 + 0.8 * R(), r: 0.08 + 0.14 * R(), w: (R() < 0.5 ? -1 : 1) * (1.4 + R() * 1.6) }));
  const dir = (+s.dir || 0) * D2R;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const x = i / (NX - 1), y = j / (NY - 1), k = j * NX + i;
    let vx = 0, vy = 0;
    if (live && un) {
      const ll = un(fr.x + x * fr.w, fr.y + y * fr.h), q = gridSample(s.grid, ll[0], ll[1]);
      if (q) { const e = q[0], n = q[1]; vx = e * Math.cos(bear) - n * Math.sin(bear); vy = -(e * Math.sin(bear) + n * Math.cos(bear)); } else { vx = NaN; vy = NaN; }
    } else {
      vx = Math.sin(dir); vy = -Math.cos(dir);
      // gentle meander + eddies
      vx += 0.35 * Math.sin(y * 7.1 + (+s.seed || 1)) ; vy += 0.35 * Math.cos(x * 6.3 + (+s.seed || 1) * 0.7);
      for (const e of ed) { const dx = (x - e.x) * fr.w / fr.h, dy = y - e.y, d2 = dx * dx + dy * dy, f = Math.exp(-d2 / (e.r * e.r)) * e.w; vx += -dy * f / e.r; vy += dx * f / e.r; }
    }
    VX[k] = vx; VY[k] = vy; const sp = Math.hypot(vx, vy); SP[k] = sp; if (sp > vmax) vmax = sp;
  }
  return { NX, NY, VX, VY, SP, vmax: vmax || 1 };
}
function fieldAt(F, x, y) {
  if (x < 0 || y < 0 || x > 1 || y > 1) return null;
  const fx = x * (F.NX - 1), fy = y * (F.NY - 1), i = Math.min(F.NX - 2, Math.floor(fx)), j = Math.min(F.NY - 2, Math.floor(fy)), tx = fx - i, ty = fy - j;
  const k = j * F.NX + i;
  const L = (A) => (A[k] * (1 - tx) + A[k + 1] * tx) * (1 - ty) + (A[k + F.NX] * (1 - tx) + A[k + F.NX + 1] * tx) * ty;
  const vx = L(F.VX), vy = L(F.VY);
  if (!Number.isFinite(vx)) return null;
  return [vx / F.vmax, vy / F.vmax];
}
export function drawFlowField(ctx, L, tm, o) {
  const s = { ...GV_DEFAULTS.flowfield, ...L.style }, fr = o.frame, u = o.unit, g = ctx;
  const A = (tm.alpha ?? 1) * (L.anim === 'fade' && !tm.edit ? clamp(tm.tau / 1.2, 0, 1) : 1);
  if (A <= 0) return;
  const T = tm.edit ? 3 : tm.tau;
  g.save(); g.globalAlpha = A;
  if (+s.dim > 0) { g.fillStyle = `rgba(4,6,14,${clamp(+s.dim, 0, 1)})`; g.fillRect(fr.x, fr.y, fr.w, fr.h); }
  g.beginPath(); g.rect(fr.x, fr.y, fr.w, fr.h); g.clip();
  const F = screenField(s, o, fr);
  const asp = fr.w / fr.h;
  if (s.mode !== 'arrows') {
    const N = Math.round(clamp(+s.count || 1600, 50, 8000)), life = 2.6, dt = 0.04, spd = 0.09 * (+s.speed || 1);
    const steps = Math.round(clamp(+s.trail || 1, 0.1, 4) * 14);
    g.lineCap = 'round';
    g.globalCompositeOperation = s.glow !== false ? 'lighter' : 'source-over';
    const lw = Math.max(0.6, 1.2 * u * (+s.width || 1));
    for (let p = 0; p < N; p++) {
      const ph = hash(p, 1) * life, tt = T + ph, cyc = Math.floor(tt / life), age = tt - cyc * life;
      let x = hash(p, cyc * 7 + 3), y = hash(p, cyc * 13 + 5);
      const n = Math.max(2, Math.round(age / dt));
      const tr = [];
      let sp = 0;
      for (let k = 0; k < n; k++) {
        const v = fieldAt(F, x, y); if (!v) break;
        x += v[0] * spd * dt / asp; y += v[1] * spd * dt; sp = Math.hypot(v[0], v[1]);
        if (k >= n - steps) tr.push([fr.x + x * fr.w, fr.y + y * fr.h, sp]);
      }
      if (tr.length < 2) continue;
      const fade = Math.min(1, age / 0.4, (life - age) / 0.5);
      const c = ramp(s.palette, sp * 0.95 + 0.05);
      for (let k = 1; k < tr.length; k++) {
        const a = (k / tr.length) * fade;
        g.strokeStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${0.75 * a})`; g.lineWidth = lw * (0.6 + sp);
        g.beginPath(); g.moveTo(tr[k - 1][0], tr[k - 1][1]); g.lineTo(tr[k][0], tr[k][1]); g.stroke();
      }
    }
    g.globalCompositeOperation = 'source-over';
  }
  if (s.mode !== 'particles') {
    const sp = Math.max(10, (+s.arrowSpacing || 46) * u);
    g.strokeStyle = s.arrowColor; g.fillStyle = s.arrowColor; g.lineWidth = Math.max(1, 1.4 * u * (+s.width || 1));
    for (let y = fr.y + sp / 2; y < fr.y + fr.h; y += sp) for (let x = fr.x + sp / 2; x < fr.x + fr.w; x += sp) {
      const v = fieldAt(F, (x - fr.x) / fr.w, (y - fr.y) / fr.h); if (!v) continue;
      const m = Math.hypot(v[0], v[1]); if (m < 0.02) continue;
      const len = sp * 0.42 * (0.35 + 0.65 * m), a = Math.atan2(v[1], v[0]);
      const wob = Math.sin(T * 2 + x * 0.05) * 0.04;
      const ex = x + Math.cos(a + wob) * len / 2, ey = y + Math.sin(a + wob) * len / 2, sx = x - Math.cos(a + wob) * len / 2, sy = y - Math.sin(a + wob) * len / 2;
      g.globalAlpha = A * (0.55 + 0.45 * m);
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
      const h = 4 * u; g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - Math.cos(a - 0.5) * h, ey - Math.sin(a - 0.5) * h); g.lineTo(ex - Math.cos(a + 0.5) * h, ey - Math.sin(a + 0.5) * h); g.closePath(); g.fill();
    }
    g.globalAlpha = A;
  }
  if (s.legend !== false) {
    const live = s.source === 'live' && s.grid?.u?.length;
    const max = live ? s.grid.max : null, unitTxt = s.field === 'current' ? 'km/h' : 'm/s';
    const x = fr.x + 18 * u, y = fr.y + fr.h - 46 * u, w = 170 * u, h = 8 * u;
    g.fillStyle = 'rgba(6,8,14,0.7)'; g.fillRect(x - 10 * u, y - 24 * u, w + 20 * u, 50 * u);
    for (let i = 0; i < 40; i++) { const c = ramp(s.mode === 'arrows' ? 'blue' : s.palette, i / 39); g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; g.fillRect(x + (i / 40) * w, y, w / 40 + 1, h); }
    g.font = `600 ${10.5 * u}px ${SANS}`; g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText(`${s.field === 'current' ? 'Ocean current' : 'Wind'} speed${live ? ` · ${s.grid.when || ''}` : ''}`, x, y - 8 * u);
    g.font = `500 ${9.5 * u}px ${SANS}`; g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillText(live ? '0' : 'calm', x, y + h + 12 * u); g.textAlign = 'right'; g.fillText(live ? `${max?.toFixed?.(1) ?? ''} ${unitTxt}` : 'strong', x + w, y + h + 12 * u);
  }
  g.restore();
}
/** Live wind (Open-Meteo forecast) or ocean currents (Open-Meteo marine) on a grid over the map view. */
async function flowFetch(L, { map }) {
  const b = map.getBounds(); const w = b.getWest(), e = b.getEast(), s0 = b.getSouth(), n = b.getNorth();
  const nx = 12, ny = 8, lats = [], lons = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { lats.push((s0 + (n - s0) * j / (ny - 1)).toFixed(3)); lons.push((w + (e - w) * i / (nx - 1)).toFixed(3)); }
  const cur = L.style.field === 'current';
  const url = cur ? `https://marine-api.open-meteo.com/v1/marine?latitude=${lats.join(',')}&longitude=${lons.join(',')}&current=ocean_current_velocity,ocean_current_direction`
    : `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(',')}&longitude=${lons.join(',')}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms`;
  const r = await fetch(url); if (!r.ok) throw new Error(`Open-Meteo: ${r.status}`);
  let j = await r.json(); if (!Array.isArray(j)) j = [j];
  const U = [], V = []; let max = 0, when = '';
  for (const p of j) {
    const c = p.current || {};
    const sp = cur ? c.ocean_current_velocity : c.wind_speed_10m, d = cur ? c.ocean_current_direction : c.wind_direction_10m;
    when ||= c.time ? `${c.time.replace('T', ' ')} UTC` : '';
    if (sp == null || d == null) { U.push(null); V.push(null); continue; }
    const to = (cur ? d : d + 180) * D2R; // wind direction is where it comes FROM; currents where they go TO
    U.push(+(sp * Math.sin(to)).toFixed(3)); V.push(+(sp * Math.cos(to)).toFixed(3)); max = Math.max(max, sp);
  }
  if (!U.some((v) => v != null)) throw new Error(cur ? 'No ocean data in this view — move the map over the sea' : 'No wind data returned');
  L.style.grid = { bbox: [w, s0, e, n], nx, ny, u: U, v: V, max, when, kind: L.style.field };
  L.style.source = 'live';
  return `${cur ? 'Ocean currents' : 'Wind'} for ${U.filter((v) => v != null).length} points saved in the layer (${when})`;
}

// =================================================================== river network
const NE = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/';
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
    for (let i = a + 1; i < b; i++) { const t = clamp(((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / L2, 0, 1); const d = Math.hypot(pts[i][0] - ax - t * dx, pts[i][1] - ay - t * dy); if (d > md) { md = d; mi = i; } }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
async function riversFetch(L, { map, toast }) {
  const b = map.getBounds(); const w = b.getWest(), e = b.getEast(), s0 = b.getSouth(), n = b.getNorth();
  const span = Math.max(e - w, n - s0), tol = span / 1800;
  const q = (x) => +x.toFixed(4);
  const out = [];
  const inView = (c) => c.some(([x, y]) => x >= w && x <= e && y >= s0 && y <= n);
  if (span > 3) {
    toast?.('Loading Natural Earth rivers…');
    for (const f of ['ne_10m_rivers_lake_centerlines.geojson', 'ne_10m_rivers_europe.geojson', 'ne_10m_rivers_north_america.geojson', 'ne_10m_rivers_australia.geojson']) {
      try {
        const j = await (await fetch(NE + f)).json();
        for (const ft of j.features || []) {
          const gm = ft.geometry; if (!gm) continue;
          const lines = gm.type === 'LineString' ? [gm.coordinates] : gm.type === 'MultiLineString' ? gm.coordinates : [];
          const sr = +ft.properties?.scalerank || 6;
          for (const c of lines) if (inView(c)) out.push({ c: sr <= 4 ? 0 : sr <= 7 ? 1 : 2, p: simplify(c, tol).map(([x, y]) => [q(x), q(y)]) });
        }
      } catch { /* one file missing is fine */ }
    }
  } else {
    toast?.('Asking OpenStreetMap for rivers…');
    const types = L.style.minor !== false && span < 1.2 ? 'river|stream|canal' : 'river|canal';
    const Q = `[out:json][timeout:90];way["waterway"~"^(${types})$"](${s0},${w},${n},${e});out geom;`;
    let j = null;
    for (const ep of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) { try { const r = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(Q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }); if (r.ok) { j = await r.json(); break; } } catch { /* next */ } }
    if (!j) throw new Error('OpenStreetMap did not answer — try again, or zoom out to use Natural Earth');
    for (const el of j.elements || []) {
      if (!el.geometry) continue;
      const c = el.geometry.map((p) => [p.lon, p.lat]);
      const t = el.tags?.waterway;
      out.push({ c: t === 'river' ? (el.tags?.name ? 0 : 1) : t === 'canal' ? 1 : 2, p: simplify(c, tol).map(([x, y]) => [q(x), q(y)]) });
      if (out.length > 30000) break;
    }
  }
  if (!out.length) throw new Error('No rivers found in this view');
  L.style.lines = out; L.style.source = span > 3 ? 'Natural Earth' : 'OpenStreetMap contributors';
  return `${out.length} river lines saved in the layer (${L.style.source})`;
}
export function drawRiverNet(ctx, L, tm, o) {
  const s = { ...GV_DEFAULTS.rivernet, ...L.style }, fr = o.frame, u = o.unit, g = ctx;
  const A = (tm.alpha ?? 1) * (L.anim === 'fade' && !tm.edit ? clamp(tm.tau / 1.2, 0, 1) : 1);
  if (A <= 0) return;
  const D = Math.max(0.5, +L.duration || 6), grow = tm.edit || L.anim !== 'grow' ? 1 : easeOut(tm.tau / D);
  g.save(); g.globalAlpha = A;
  if (+s.dim > 0) { g.fillStyle = `rgba(0,0,0,${clamp(+s.dim, 0, 1)})`; g.fillRect(fr.x, fr.y, fr.w, fr.h); }
  const lines = (s.lines || []).filter((l) => s.minor !== false || l.c < 2);
  const W = [2.6, 1.4, 0.7].map((v) => v * u * (+s.width || 1));
  g.lineCap = 'round'; g.lineJoin = 'round';
  const [r0, g0, b0] = hexRGB(s.color);
  // big rivers first so the small ones glow on top; each line is revealed from its start (OSM: the source)
  for (const pass of [0, 1]) {
    g.globalCompositeOperation = 'lighter';
    for (let c = 2; c >= 0; c--) {
      const lw = W[c] * (pass === 0 ? 4 * (+s.glow || 0) + 1 : 1);
      if (pass === 0 && !(+s.glow > 0)) continue;
      g.lineWidth = lw;
      g.strokeStyle = pass === 0 ? `rgba(${r0},${g0},${b0},${0.08 + 0.04 * (2 - c)})` : `rgba(${Math.min(255, r0 + 60)},${Math.min(255, g0 + 60)},${Math.min(255, b0 + 40)},${0.55 + 0.2 * (2 - c)})`;
      g.beginPath();
      for (const l of lines) {
        if (l.c !== c) continue;
        const pts = l.p, n = pts.length; if (n < 2) continue;
        const m = Math.max(2, Math.ceil(n * clamp(grow * 1.15 - hash(n, pts[0][0] * 1000) * 0.15, 0, 1)));
        let first = true;
        for (let i = 0; i < m; i++) { const q = o.proj(pts[i]); if (!Number.isFinite(q[0])) { first = true; continue; } if (first) { g.moveTo(q[0], q[1]); first = false; } else g.lineTo(q[0], q[1]); }
      }
      g.stroke();
    }
  }
  g.globalCompositeOperation = 'source-over';
  if (s.place || s.title) {
    const x = fr.x + fr.w * 0.06, y = fr.y + fr.h * 0.62;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = s.color;
    if (s.title) { g.font = `400 ${16 * u}px ${SANS}`; g.fillText(s.title, x, y); }
    if (s.place) { g.font = `400 ${46 * u}px ${SANS}`; g.fillText(s.place, x, y + 50 * u); }
  }
  if (!lines.length) { g.font = `500 ${15 * u}px ${SANS}`; g.fillStyle = '#9fb6d6'; g.textAlign = 'center'; g.fillText('Press “Fetch the rivers of the map view” in the layer settings', fr.x + fr.w / 2, fr.y + fr.h / 2); }
  if (s.source) { g.font = `400 ${9 * u}px ${SANS}`; g.fillStyle = 'rgba(255,255,255,0.5)'; g.textAlign = 'right'; g.fillText(`Rivers: ${s.source}`, fr.x + fr.w - 10 * u, fr.y + fr.h - 8 * u); }
  g.restore();
}

// =================================================================== overlay analysis stack
const TEXW = 360, TEXH = 240;
const texCanvas = new Map();
function texOf(key) { let c = texCanvas.get(key); if (!c) { c = document.createElement('canvas'); c.width = TEXW; c.height = TEXH; texCanvas.set(key, c); } return c; }
/** A factor map texture: your image, or the map view in a chosen analytic look. */
function factorTexture(key, look, media, o, fr) {
  const c = texOf(key), g = c.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, TEXW, TEXH);
  const im = media ? imageFor(media) : null;
  if (im?.ready) { const k = Math.max(TEXW / im.w, TEXH / im.h); g.drawImage(im.bmp, (TEXW - im.w * k) / 2, (TEXH - im.h * k) / 2, im.w * k, im.h * k); return c; }
  const ok = drawMapCrop(g, o, fr.x + fr.w * 0.15, fr.y + fr.h * 0.15, fr.w * 0.7, fr.h * 0.7, 0, 0, TEXW, TEXH);
  if (!ok) { const gr = g.createLinearGradient(0, 0, TEXW, TEXH); gr.addColorStop(0, '#7f8c6a'); gr.addColorStop(1, '#4b5a44'); g.fillStyle = gr; g.fillRect(0, 0, TEXW, TEXH); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.05 + 0.1 * hash(i, 1)})`; g.beginPath(); g.arc(hash(i, 2) * TEXW, hash(i, 3) * TEXH, 10 + 40 * hash(i, 4), 0, 7); g.fill(); } }
  if (look === 'satellite') return c;
  const d = g.getImageData(0, 0, TEXW, TEXH), p = d.data, N = TEXW * TEXH, Y = new Float32Array(N);
  for (let i = 0; i < N; i++) Y[i] = (0.3 * p[i * 4] + 0.59 * p[i * 4 + 1] + 0.11 * p[i * 4 + 2]) / 255;
  // smoothed luminance and its gradient: a stand-in "surface" when no data image is given
  const S = new Float32Array(N), r = look === 'heat' || look === 'suit' ? 14 : 2;
  { const tmp = new Float32Array(N); for (let y = 0; y < TEXH; y++) { let acc = 0; for (let x = -r; x < TEXW + r; x++) { const xa = clamp(x + r, 0, TEXW - 1), xr = clamp(x - r - 1, 0, TEXW - 1); acc += Y[y * TEXW + xa] - (x - r - 1 >= -r ? Y[y * TEXW + xr] : 0); if (x >= 0 && x < TEXW) tmp[y * TEXW + x] = acc / (2 * r + 1); } }
    for (let x = 0; x < TEXW; x++) { let acc = 0; for (let y = -r; y < TEXH + r; y++) { const ya = clamp(y + r, 0, TEXH - 1), yr = clamp(y - r - 1, 0, TEXH - 1); acc += tmp[ya * TEXW + x] - (y - r - 1 >= -r ? tmp[yr * TEXW + x] : 0); if (y >= 0 && y < TEXH) S[y * TEXW + x] = acc / (2 * r + 1); } } }
  let mn = 1, mx = 0; for (let i = 0; i < N; i++) { if (S[i] < mn) mn = S[i]; if (S[i] > mx) mx = S[i]; }
  const nrm = (v) => (v - mn) / Math.max(1e-3, mx - mn);
  for (let y = 0; y < TEXH; y++) for (let x = 0; x < TEXW; x++) {
    const i = y * TEXW + x, gx = S[i + (x < TEXW - 1 ? 1 : 0)] - S[i - (x > 0 ? 1 : 0)], gy = S[i + (y < TEXH - 1 ? TEXW : 0)] - S[i - (y > 0 ? TEXW : 0)];
    const grad = clamp(Math.hypot(gx, gy) * 9, 0, 1), shade = clamp(0.62 + (gx - gy) * 6, 0, 1), v = nrm(S[i]);
    let col;
    if (look === 'ridges') col = [70 + 160 * shade, 130 + 110 * shade, 190 + 60 * shade];
    else if (look === 'terrain') col = [205 * (0.55 + 0.5 * shade), 170 * (0.55 + 0.5 * shade), 110 * (0.55 + 0.5 * shade)];
    else if (look === 'slope') col = ramp('slope', grad).map((c) => c * (0.7 + 0.35 * shade));
    else if (look === 'heat') col = ramp('turbo', v);
    else if (look === 'gray') col = [255 * shade * 0.9, 255 * shade * 0.9, 255 * shade * 0.9];
    else if (look === 'landuse') { const k = Math.floor(v * 5); col = [[46, 125, 50], [139, 195, 74], [255, 235, 59], [255, 152, 0], [158, 158, 158]][Math.min(4, k)]; }
    else if (look === 'lines') { const e = grad > 0.25 ? 1 : 0; col = e ? [255, 210, 60] : [40, 46, 54]; }
    else col = ramp('suit', clamp(v * 0.6 + grad * 0.7, 0, 1)).map((c2) => c2 * (0.75 + 0.3 * shade));
    p[i * 4] = col[0]; p[i * 4 + 1] = col[1]; p[i * 4 + 2] = col[2]; p[i * 4 + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return c;
}
function turbineIcon(g, x, y, h, t, col = '#ffffff') {
  g.save(); g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round';
  g.lineWidth = Math.max(1, h * 0.05); g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
  const hx = x, hy = y - h;
  for (let k = 0; k < 3; k++) { const a = t * 3 + (k * Math.PI * 2) / 3; g.lineWidth = Math.max(1, h * 0.045); g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + Math.cos(a) * h * 0.55, hy + Math.sin(a) * h * 0.55); g.stroke(); }
  g.beginPath(); g.arc(hx, hy, h * 0.05, 0, 7); g.fill(); g.restore();
}
/** draw a texture onto a parallelogram (affine) */
function plane(g, tex, x, y, w, d, skew, alpha = 1, edge = 'rgba(0,0,0,0.35)') {
  g.save(); g.globalAlpha *= alpha;
  g.transform(w / TEXW, -d * 0.35 / TEXW * 1.2, skew * w / TEXH, d / TEXH, x, y);
  g.drawImage(tex, 0, 0);
  g.lineWidth = 1.5 * TEXW / w; g.strokeStyle = edge; g.strokeRect(0, 0, TEXW, TEXH);
  g.restore();
}
const planeAt = (x, y, w, d, skew, U, V) => [x + U * w + V * skew * w, y - U * d * 0.35 * 1.2 + V * d];
export function drawStackMap(ctx, L, tm, o) {
  const s = { ...GV_DEFAULTS.stackmap, ...L.style }, fr0 = o.frame, u = o.unit * (+s.textSize || 1), g = ctx;
  const top = (brandSafeArea(fr0.w, fr0.h).top || 0) * fr0.h * 0.9, bot = (brandLowerSafe() || 0) * fr0.h, fr = { x: fr0.x, y: fr0.y + top, w: fr0.w, h: fr0.h - top - bot };
  const A = (tm.alpha ?? 1) * (L.anim === 'fade' && !tm.edit ? clamp(tm.tau / 0.8, 0, 1) : 1);
  if (A <= 0) return;
  const T = tm.edit || L.anim === 'none' ? 99 : tm.tau;
  const layers = [1, 2, 3, 4, 5, 6].map((i) => ({ i, name: s[`l${i}`], look: s[`l${i}Look`] || 'satellite', img: s[`l${i}Img`], w: +s[`w${i}`] || 0 })).filter((l) => l.name);
  const n = layers.length;
  g.save(); g.globalAlpha = A;
  const ink = s.dark ? '#ffffff' : '#1d232b', sub = s.dark ? 'rgba(255,255,255,0.75)' : 'rgba(20,24,30,0.75)';
  if (+s.bgAlpha > 0) { g.globalAlpha = A * clamp(+s.bgAlpha, 0, 1); g.fillStyle = s.dark ? '#0b0f16' : s.bg; g.fillRect(fr0.x, fr0.y, fr0.w, fr0.h); g.globalAlpha = A; }
  else if (s.dark) { g.fillStyle = 'rgba(5,8,14,0.45)'; g.fillRect(fr0.x, fr0.y, fr0.w, fr0.h); }
  // title bar
  if (s.title) { g.fillStyle = '#16325c'; g.fillRect(fr.x, fr.y + fr.h * 0.035, fr.w * 0.62, 38 * u); g.fillStyle = s.accent; g.fillRect(fr.x, fr.y + fr.h * 0.035 + 38 * u, fr.w * 0.62, 3 * u); g.font = `500 ${21 * u}px ${SANS}`; g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(s.title, fr.x + 20 * u, fr.y + fr.h * 0.035 + 19 * u); }
  const texs = layers.map((l) => factorTexture(`${L.id}:${l.i}`, l.look, l.img, o, fr));
  const result = factorTexture(`${L.id}:r`, s.resultLook || 'suit', s.resultImg, o, fr);
  const tIn = (i) => 0.4 + i * 0.55, tPins = tIn(n) + 0.2, tRes = tPins + 1.2;
  if (s.layout === 'flow') {
    // factor thumbnails → bracket → weighted overlay → result
    const x0 = fr.x + fr.w * 0.13, th = Math.min(fr.h * 0.7 / n - 8 * u, 120 * u), tw = th * 1.5, y0 = fr.y + fr.h * 0.16;
    const bx = x0 + tw + 70 * u, bw = fr.w * 0.2, by = fr.y + fr.h * 0.3, bh = fr.h * 0.42;
    layers.forEach((l, i) => {
      const k = easeOut((T - tIn(i)) / 0.5); if (k <= 0) return;
      const y = y0 + i * (th + 8 * u);
      g.save(); g.globalAlpha *= k; g.translate((1 - k) * -30 * u, 0);
      g.drawImage(texs[i], x0, y, tw, th); g.strokeStyle = 'rgba(0,0,0,0.4)'; g.strokeRect(x0, y, tw, th);
      g.font = `600 ${13 * u}px ${SANS}`; g.fillStyle = ink; g.textAlign = 'right'; g.textBaseline = 'middle';
      wrapText(g, l.name, x0 - 10 * u, y + th / 2, fr.w * 0.1, 15 * u);
      // connector to the bracket
      const lk = clamp((T - tPins) / 0.6, 0, 1);
      g.strokeStyle = s.accent; g.lineWidth = 3 * u; g.beginPath(); g.moveTo(x0 + tw + 6 * u, y + th / 2); g.lineTo(x0 + tw + 6 * u + 30 * u * lk, y + th / 2); g.stroke();
      g.restore();
    });
    const lk = clamp((T - tPins) / 0.6, 0, 1);
    if (lk > 0) {
      const xb = x0 + tw + 36 * u, ya = y0 + th / 2, yb = y0 + (n - 1) * (th + 8 * u) + th / 2;
      g.strokeStyle = s.accent; g.lineWidth = 3 * u; g.beginPath(); g.moveTo(xb, ya); g.lineTo(xb, ya + (yb - ya) * lk); g.stroke();
      arrow(g, xb, (ya + yb) / 2, bx - 6 * u, (ya + yb) / 2, s.accent, 3 * u, lk);
    }
    // weighted overlay table
    const tk = easeOut((T - tPins - 0.4) / 0.6);
    if (tk > 0) {
      g.save(); g.globalAlpha *= tk;
      g.font = `600 ${15 * u}px ${SANS}`; g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText('Weighted overlay of each factor', bx + bw / 2, by - 12 * u);
      g.fillStyle = s.dark ? 'rgba(20,26,36,0.92)' : '#ffffff'; g.fillRect(bx, by, bw, bh); g.strokeStyle = 'rgba(120,130,140,0.6)'; g.strokeRect(bx, by, bw, bh);
      const tot = layers.reduce((t, l) => t + l.w, 0) || 1, rh = Math.min(30 * u, (bh - 20 * u) / n);
      layers.forEach((l, i) => {
        const y = by + 12 * u + i * rh, bk = easeOut((T - tPins - 0.6 - i * 0.15) / 0.6);
        g.font = `500 ${11 * u}px ${SANS}`; g.fillStyle = ink; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(l.name, bx + 10 * u, y + rh / 2);
        const bw2 = bw * 0.32, bx2 = bx + bw - bw2 - 40 * u;
        g.fillStyle = 'rgba(128,128,128,0.25)'; g.fillRect(bx2, y + rh * 0.3, bw2, rh * 0.4);
        g.fillStyle = s.accent; g.fillRect(bx2, y + rh * 0.3, bw2 * (l.w / tot) * bk * (tot / Math.max(...layers.map((q) => q.w), 1)), rh * 0.4);
        g.fillStyle = ink; g.textAlign = 'right'; g.fillText(`${Math.round((l.w / tot) * 100)}%`, bx + bw - 8 * u, y + rh / 2);
      });
      g.restore();
    }
    const rk = easeOut((T - tRes) / 0.9);
    if (rk > 0) {
      const rx = bx + bw + 80 * u, rw = fr.x + fr.w * 0.97 - rx, rh2 = rw / 1.5, ry = fr.y + fr.h * 0.5 - rh2 / 2;
      arrow(g, bx + bw + 8 * u, fr.y + fr.h * 0.5, rx - 10 * u, fr.y + fr.h * 0.5, s.accent, 4 * u, clamp(rk * 1.5, 0, 1));
      g.save(); g.beginPath(); g.rect(rx, ry, rw * rk, rh2); g.clip(); g.drawImage(result, rx, ry, rw, rh2); g.restore();
      g.strokeStyle = 'rgba(0,0,0,0.4)'; g.strokeRect(rx, ry, rw, rh2);
      g.font = `600 ${16 * u}px ${SANS}`; g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(s.resultTitle || '', rx + rw / 2, ry - 12 * u);
      for (let k = 0; k < (+s.turbines || 0); k++) { const tk2 = easeOut((T - tRes - 0.8 - k * 0.2) / 0.4); if (tk2 > 0) turbineIcon(g, rx + rw * (0.2 + 0.6 * hash(k, 31)), ry + rh2 * (0.3 + 0.5 * hash(k, 32)), 26 * u * tk2, T + k); }
    }
  } else {
    // exploded 3D stack on the left, result plane on the right
    const w = fr.w * 0.34, d = w * 0.34, skew = 0.42, gap = Math.min(fr.h * 0.58 / Math.max(1, n), d * 0.9);
    const x0 = fr.x + fr.w * 0.05, yTop = fr.y + fr.h * 0.27;
    const pins = Array.from({ length: +s.pins || 0 }, (_, k) => [0.1 + 0.8 * hash(k, 41), 0.1 + 0.8 * hash(k, 42)]);
    const pk = clamp((T - tPins) / 0.9, 0, 1);
    // bottom → top so upper planes cover lower ones
    for (let i = n - 1; i >= 0; i--) {
      const k = easeOut((T - tIn(n - 1 - i)) / 0.6); if (k <= 0) continue;
      const y = yTop + i * gap - (1 - k) * fr.h * 0.25;
      plane(g, texs[i], x0, y, w, d, skew, k);
      // pins pass down through the planes
      if (pk > 0) for (const [U, V] of pins) { const a = planeAt(x0, y, w, d, skew, U, V); g.strokeStyle = '#7a1b1b'; g.lineWidth = 1.6 * u; g.beginPath(); g.moveTo(a[0], a[1] - gap * pk); g.lineTo(a[0], a[1]); g.stroke(); }
      g.save(); g.globalAlpha *= k; g.font = `italic 700 ${14 * u}px ${SANS}`; g.fillStyle = s.dark ? '#ffffff' : '#20262e'; g.textAlign = 'left'; g.textBaseline = 'middle';
      const lp = planeAt(x0, y, w, d, skew, 0.62, 0.62); g.translate(lp[0], lp[1]); g.rotate(-0.22); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 4 * u; g.fillText(layers[i].name, 0, 0); g.restore();
    }
    if (pk > 0) for (const [U, V] of pins) { const a = planeAt(x0, yTop, w, d, skew, U, V); const ay = a[1] - gap * 0.9; g.strokeStyle = '#1b2a5a'; g.lineWidth = 2 * u; g.beginPath(); g.moveTo(a[0], ay - 18 * u * pk); g.lineTo(a[0], a[1]); g.stroke(); g.fillStyle = '#1b2a5a'; g.beginPath(); g.moveTo(a[0], a[1] - 2 * u); g.lineTo(a[0] - 5 * u, a[1] - 12 * u); g.lineTo(a[0] + 5 * u, a[1] - 12 * u); g.closePath(); g.fill(); }
    if (s.sub && T > tPins) { g.save(); g.globalAlpha *= easeOut((T - tPins) / 0.6); g.font = `700 ${16 * u}px ${SANS}`; g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; wrapText(g, s.sub, x0 + w * 0.75, yTop + (n - 1) * gap + d * 1.15, w, 20 * u); g.restore(); }
    const rk = easeOut((T - tRes) / 0.9);
    if (rk > 0) {
      const ax = x0 + w * 1.36, ay = yTop + (n - 1) * gap * 0.45 + d * 0.3;
      arrow(g, ax, ay, ax + fr.w * 0.07, ay, s.accent, 10 * u, clamp(rk * 1.6, 0, 1));
      const rx = ax + fr.w * 0.1, rw = fr.x + fr.w * 0.96 - rx, rd = rw * 0.55, ry = ay - rd * 0.2 + (1 - rk) * 30 * u;
      plane(g, result, rx, ry, rw, rd, 0.3, rk, 'rgba(0,0,0,0.5)');
      for (let k = 0; k < (+s.turbines || 0); k++) { const tk2 = easeOut((T - tRes - 0.7 - k * 0.18) / 0.4); if (tk2 <= 0) continue; const a = planeAt(rx, ry, rw, rd, 0.3, 0.2 + 0.6 * hash(k, 51), 0.15 + 0.5 * hash(k, 52)); turbineIcon(g, a[0], a[1], 34 * u * tk2, T + k * 0.7, s.dark ? '#ffffff' : '#f4f4f4'); }
      if (s.resultTitle) { g.save(); g.globalAlpha *= rk; g.font = `700 ${16 * u}px ${SANS}`; g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; wrapText(g, s.resultTitle, rx + rw * 0.6, ry + rd * 1.25, rw * 0.8, 20 * u); g.restore(); }
    }
  }
  g.restore();
}
function wrapText(g, text, x, y, maxW, lh) {
  const words = String(text || '').split(/\s+/); const lines = []; let line = '';
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  const y0 = g.textBaseline === 'middle' ? y - ((lines.length - 1) * lh) / 2 : y;
  lines.forEach((l, i) => g.fillText(l, x, y0 + i * lh));
}
function arrow(g, x1, y1, x2, y2, col, w, k = 1) {
  const x = x1 + (x2 - x1) * k, y = y1 + (y2 - y1) * k, a = Math.atan2(y2 - y1, x2 - x1), h = Math.max(8, w * 2.6);
  g.save(); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = w; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x - Math.cos(a) * h * 0.8, y - Math.sin(a) * h * 0.8); g.stroke();
  g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(a - 0.45) * h, y - Math.sin(a - 0.45) * h); g.lineTo(x - Math.cos(a + 0.45) * h, y - Math.sin(a + 0.45) * h); g.closePath(); g.fill();
  g.restore();
}

// =================================================================== dispatch + layer actions
export function drawGeoViz(ctx, L, tm, o) {
  if (L.kind === 'detonation') drawDetonation(ctx, L, tm, o);
  else if (L.kind === 'flowfield') drawFlowField(ctx, L, tm, o);
  else if (L.kind === 'rivernet') drawRiverNet(ctx, L, tm, o);
  else if (L.kind === 'stackmap') drawStackMap(ctx, L, tm, o);
}
export const GV_ACTIONS = { flowFetch, riversFetch };
/** media a layer needs preloaded */
export const gvMedia = (L) => (L.kind === 'stackmap' ? [1, 2, 3, 4, 5, 6].map((i) => L.style?.[`l${i}Img`]).concat(L.style?.resultImg).filter(Boolean) : []);
