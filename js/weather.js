// Weather: cyclone tracks with a spinning satellite-style storm and forecast cone, high / low pressure centres
// with isobars, weather fronts, city weather markers, temperature / rainfall / wind fields (made-up patterns
// or live data from Open-Meteo) with legends, and TV-style forecast panels.
import { placeAt } from './place.js';
import { drawQuad, quadFromBounds } from './geoimage.js';

const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const UI = '"Inter","Segoe UI",system-ui,sans-serif';
const DISPLAY = '"Archivo","Inter",system-ui,sans-serif';
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
function hexA(hex, a) {
  const h = String(hex || '#fff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
// value noise
function hash2(x, y, s) { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, oct = 4) { let v = 0, amp = 0.5, f = 1; for (let i = 0; i < oct; i++) { v += amp * vnoise(x * f, y * f, s + i * 17); f *= 2; amp *= 0.5; } return v / (1 - 0.5 ** oct); }
/** pixels per km at a lng/lat for this projection. */
function pxPerKm(proj, ll) {
  const a = proj(ll), b = proj([ll[0] + 0.05, ll[1]]);
  return Math.hypot(b[0] - a[0], b[1] - a[1]) / (111.32 * Math.cos(ll[1] * D2R) * 0.05);
}

// ================================================================= weather icons
export const WX_ICONS = { sunny: 'Sunny', partly: 'Partly cloudy', cloudy: 'Cloudy', rain: 'Rain', showers: 'Showers', storm: 'Thunderstorm', snow: 'Snow', fog: 'Fog / haze', wind: 'Windy', dust: 'Dust / sandstorm', hot: 'Very hot', night: 'Clear night', cyclone: 'Cyclone' };
function cloudShape(ctx, x, y, s, fill, shade) {
  const g = ctx.createLinearGradient(0, y - s * 0.5, 0, y + s * 0.4);
  g.addColorStop(0, fill); g.addColorStop(1, shade);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x - s * 0.32, y + s * 0.05, s * 0.28, 0, Math.PI * 2);
  ctx.arc(x - s * 0.02, y - s * 0.14, s * 0.36, 0, Math.PI * 2);
  ctx.arc(x + s * 0.32, y + s * 0.02, s * 0.3, 0, Math.PI * 2);
  ctx.rect(x - s * 0.6, y + s * 0.02, s * 1.2, s * 0.31);
  ctx.fill();
}
function sun(ctx, x, y, s, t) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.4);
  ctx.strokeStyle = '#ffb703'; ctx.lineWidth = s * 0.07; ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.42); ctx.lineTo(Math.cos(a) * s * 0.58, Math.sin(a) * s * 0.58); ctx.stroke(); }
  ctx.restore();
  const g = ctx.createRadialGradient(x - s * 0.1, y - s * 0.1, s * 0.05, x, y, s * 0.33);
  g.addColorStop(0, '#fff3a0'); g.addColorStop(1, '#ffb703');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s * 0.32, 0, Math.PI * 2); ctx.fill();
}
/** Draw a weather icon centred at x, y with size s (px). t animates it. */
export function drawWxIcon(ctx, type, x, y, s, t = 0) {
  ctx.save();
  ctx.lineCap = 'round';
  const drops = (col, n, snow) => {
    for (let i = 0; i < n; i++) {
      const px = x - s * 0.3 + (i / (n - 1 || 1)) * s * 0.6;
      const ph = ((t * 1.4 + i * 0.37) % 1);
      const py = y + s * 0.38 + ph * s * 0.32;
      ctx.globalAlpha = 1 - ph;
      if (snow) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, s * 0.05, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.strokeStyle = col; ctx.lineWidth = s * 0.05; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - s * 0.04, py + s * 0.11); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  };
  switch (type) {
    case 'sunny': case 'hot': sun(ctx, x, y, s, t); if (type === 'hot') { ctx.fillStyle = '#e63946'; ctx.font = `900 ${s * 0.3}px ${UI}`; ctx.textAlign = 'center'; ctx.fillText('!', x + s * 0.42, y - s * 0.3); } break;
    case 'night': { ctx.fillStyle = '#f1f5ff'; ctx.beginPath(); ctx.arc(x, y, s * 0.32, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(x + s * 0.16, y - s * 0.1, s * 0.28, 0, Math.PI * 2); ctx.fill(); break; }
    case 'partly': sun(ctx, x - s * 0.18, y - s * 0.14, s * 0.8, t); cloudShape(ctx, x + s * 0.08, y + s * 0.1, s * 0.8, '#ffffff', '#c9d3df'); break;
    case 'cloudy': cloudShape(ctx, x + s * 0.12, y - s * 0.1, s * 0.7, '#b8c2cf', '#8d99a8'); cloudShape(ctx, x - s * 0.05, y + s * 0.06, s * 0.9, '#ffffff', '#c3ccd8'); break;
    case 'rain': cloudShape(ctx, x, y - s * 0.08, s * 0.95, '#d5dde8', '#8f9db0'); drops('#4cc9f0', 4); break;
    case 'showers': sun(ctx, x - s * 0.2, y - s * 0.2, s * 0.7, t); cloudShape(ctx, x + s * 0.05, y - s * 0.02, s * 0.85, '#ffffff', '#b8c4d2'); drops('#4cc9f0', 3); break;
    case 'storm': {
      cloudShape(ctx, x, y - s * 0.1, s * 0.95, '#9aa6b6', '#596474');
      const on = Math.sin(t * 9) > 0.4 || t === 0;
      if (on) { ctx.fillStyle = '#ffd60a'; ctx.beginPath(); ctx.moveTo(x + s * 0.02, y + s * 0.18); ctx.lineTo(x - s * 0.12, y + s * 0.46); ctx.lineTo(x, y + s * 0.44); ctx.lineTo(x - s * 0.06, y + s * 0.68); ctx.lineTo(x + s * 0.16, y + s * 0.36); ctx.lineTo(x + s * 0.04, y + s * 0.38); ctx.closePath(); ctx.fill(); }
      drops('#4cc9f0', 2);
      break;
    }
    case 'snow': cloudShape(ctx, x, y - s * 0.08, s * 0.95, '#ffffff', '#c8d2de'); drops('#fff', 4, true); break;
    case 'fog': cloudShape(ctx, x, y - s * 0.16, s * 0.85, '#e3e8ef', '#b9c3cf'); ctx.strokeStyle = '#cfd6df'; ctx.lineWidth = s * 0.07; for (let i = 0; i < 3; i++) { const o = Math.sin(t * 1.5 + i) * s * 0.05; ctx.beginPath(); ctx.moveTo(x - s * 0.42 + o, y + s * 0.25 + i * s * 0.13); ctx.lineTo(x + s * 0.42 + o, y + s * 0.25 + i * s * 0.13); ctx.stroke(); } break;
    case 'wind': case 'dust': {
      ctx.strokeStyle = type === 'dust' ? '#d4a373' : '#cfe8ff'; ctx.lineWidth = s * 0.07;
      for (let i = 0; i < 3; i++) {
        const yy = y - s * 0.22 + i * s * 0.22, o = ((t * 0.8 + i * 0.3) % 1) * s * 0.1;
        ctx.beginPath(); ctx.moveTo(x - s * 0.45 + o, yy); ctx.lineTo(x + s * 0.2 + o, yy); ctx.arc(x + s * 0.2 + o, yy - s * 0.1, s * 0.1, Math.PI / 2, -Math.PI * 0.6, true); ctx.stroke();
      }
      break;
    }
    case 'cyclone': {
      ctx.translate(x, y); ctx.rotate(-t * 3);
      ctx.fillStyle = '#e63946';
      for (const sg of [1, -1]) { ctx.save(); ctx.scale(sg, sg); ctx.beginPath(); ctx.moveTo(s * 0.12, -s * 0.1); ctx.quadraticCurveTo(s * 0.2, -s * 0.5, -s * 0.28, -s * 0.48); ctx.quadraticCurveTo(s * 0.05, -s * 0.36, -s * 0.05, -s * 0.12); ctx.closePath(); ctx.fill(); ctx.restore(); }
      ctx.beginPath(); ctx.arc(0, 0, s * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, s * 0.07, 0, Math.PI * 2); ctx.fill();
      break;
    }
    default: sun(ctx, x, y, s, t);
  }
  ctx.restore();
}

// ================================================================= cyclone
export const SSHS = [
  { k: 'TD', name: 'Tropical depression', col: '#5ebaff', kmh: '< 63 km/h' },
  { k: 'TS', name: 'Tropical storm', col: '#00faf4', kmh: '63–118 km/h' },
  { k: '1', name: 'Category 1', col: '#ffffcc', kmh: '119–153 km/h' },
  { k: '2', name: 'Category 2', col: '#ffe775', kmh: '154–177 km/h' },
  { k: '3', name: 'Category 3', col: '#ffc140', kmh: '178–208 km/h' },
  { k: '4', name: 'Category 4', col: '#ff8f20', kmh: '209–251 km/h' },
  { k: '5', name: 'Category 5', col: '#ff6060', kmh: '≥ 252 km/h' },
];
const catIndex = (c) => { const s = String(c ?? '').trim().toUpperCase(); const i = SSHS.findIndex((x) => x.k === s); return i >= 0 ? i : clamp(+s + 1 || 0, 0, 6); };
const cloudCache = new Map();
/** Satellite-style spiral cloud texture with an eye (cached). */
function stormTexture(seed, arms = 3) {
  const key = `${seed}|${arms}`;
  if (cloudCache.has(key)) return cloudCache.get(key);
  const S = 320;
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const c = cv.getContext('2d');
  const img = c.createImageData(S, S);
  const d = img.data;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const dx = (i - S / 2) / (S / 2), dy = (j - S / 2) / (S / 2);
    const r = Math.hypot(dx, dy);
    if (r > 1) continue;
    const th = Math.atan2(dy, dx);
    const phi = th + 2.6 * Math.log(r + 0.03);
    const band = 0.5 + 0.5 * Math.sin(arms * phi);
    const n = fbm(Math.cos(phi) * (1.5 + r * 3) + 10, Math.sin(phi) * (1.5 + r * 3) + 10, seed, 4);
    const n2 = fbm(dx * 6 + 3, dy * 6 + 7, seed + 5, 3);
    let dens = smooth(0.35, 0.85, band * 0.55 + n * 0.55 + (1 - r) * 0.35) * (0.7 + 0.3 * n2);
    dens *= smooth(1, 0.55, r); // fade out
    dens = Math.max(dens, Math.exp(-(((r - 0.13) / 0.06) ** 2)) * 0.95); // eyewall
    dens *= smooth(0.04, 0.1, r); // clear eye
    const shade = 200 + 55 * n2;
    const p = (j * S + i) * 4;
    d[p] = shade; d[p + 1] = shade; d[p + 2] = Math.min(255, shade + 8); d[p + 3] = clamp(dens, 0, 1) * 245;
  }
  c.putImageData(img, 0, 0);
  cloudCache.set(key, cv);
  return cv;
}
function trackAt(coords, u) {
  if (coords.length < 2) return { ll: coords[0], i: 0, f: 0 };
  const seg = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) { const k = Math.cos(((coords[i][1] + coords[i - 1][1]) / 2) * D2R); const d = Math.hypot((coords[i][0] - coords[i - 1][0]) * k, coords[i][1] - coords[i - 1][1]); seg.push(d); total += d; }
  let tg = clamp(u, 0, 1) * total, i = 0;
  while (i < seg.length - 1 && tg > seg[i]) { tg -= seg[i]; i++; }
  const f = seg[i] ? tg / seg[i] : 0;
  const a = coords[i], b = coords[i + 1];
  return { ll: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], i, f };
}
export function drawCyclone(ctx, L, tm, o) {
  if (L.geom?.type !== 'LineString') return;
  const { proj, unit } = o;
  const s = L.style;
  const cs = L.geom.coordinates;
  const D = Math.max(0.1, +L.duration || 6);
  const u = tm.edit ? clamp(+s.editAt ?? 0.6, 0, 1) : clamp(tm.tau / D, 0, 1);
  const cats = String(s.cats || '').split(/[,;\s]+/).filter(Boolean);
  const catAt = (i) => catIndex(cats.length ? cats[Math.min(i, cats.length - 1)] : s.category);
  const pos = trackAt(cs, u);
  const fcFrom = s.forecast ? clamp(+s.forecastFrom || 0.6, 0, 1) : 2;
  const P = cs.map(proj);
  const t = o.time ?? 0;
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const w = 3.2 * unit * (+s.width || 1);
  // forecast cone (from the forecast start to the end)
  if (s.forecast && fcFrom < 1) {
    const start = trackAt(cs, fcFrom);
    const pts = [];
    const n = 24;
    const kmPx = pxPerKm(proj, start.ll);
    for (let k = 0; k <= n; k++) {
      const uu = fcFrom + (1 - fcFrom) * (k / n);
      const p = trackAt(cs, uu), q = trackAt(cs, Math.min(1, uu + 0.01));
      const a = proj(p.ll), b = proj(q.ll);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) || 0;
      const r = (40 + (k / n) * (+s.coneKm || 350)) * kmPx;
      pts.push([a, ang, r]);
    }
    ctx.beginPath();
    pts.forEach(([a, ang, r], k) => { const x = a[0] + Math.cos(ang - Math.PI / 2) * r, y = a[1] + Math.sin(ang - Math.PI / 2) * r; if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    const [ea, eang, er] = pts.at(-1);
    ctx.arc(ea[0], ea[1], er, eang - Math.PI / 2, eang + Math.PI / 2);
    for (let k = pts.length - 1; k >= 0; k--) { const [a, ang, r] = pts[k]; ctx.lineTo(a[0] + Math.cos(ang + Math.PI / 2) * r, a[1] + Math.sin(ang + Math.PI / 2) * r); }
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
    ctx.setLineDash([6 * unit, 5 * unit]); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.5 * unit; ctx.stroke(); ctx.setLineDash([]);
  }
  // track, coloured by category; past = solid, future = dashed
  const drawUpTo = s.reveal === false ? 1 : Math.max(u, tm.edit ? 1 : 0);
  for (let i = 1; i < cs.length; i++) {
    const segU0 = (i - 1) / (cs.length - 1);
    if (segU0 > drawUpTo && s.reveal !== false) break;
    const a = P[i - 1];
    let b = P[i];
    if (s.reveal !== false && i - 1 === pos.i && !tm.edit) b = proj(pos.ll);
    const fut = segU0 >= fcFrom;
    ctx.setLineDash(fut ? [8 * unit, 6 * unit] : []);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = w + 2.5 * unit;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.strokeStyle = SSHS[catAt(i - 1)].col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    if (s.reveal !== false && i - 1 === pos.i && !tm.edit) break;
  }
  ctx.setLineDash([]);
  // dots with category numbers and labels
  const labels = String(s.labels || '').split('\n');
  cs.forEach((c, i) => {
    if (s.reveal !== false && !tm.edit && i / (cs.length - 1 || 1) > u + 1e-6) return;
    const [x, y] = P[i];
    const ci = catAt(i);
    const r = 7 * unit * (+s.dotSize || 1);
    ctx.fillStyle = SSHS[ci].col; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.2 * unit;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.font = `800 ${r * 1.15}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(SSHS[ci].k, x, y + 0.5);
    if (labels[i]) { ctx.font = `700 ${11 * unit}px ${UI}`; ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 4 * unit; ctx.textAlign = 'left'; ctx.fillText(labels[i], x + r + 5 * unit, y - r); ctx.shadowBlur = 0; }
  });
  // the storm itself
  const [sx, sy] = proj(pos.ll);
  const kmPx = pxPerKm(proj, pos.ll);
  const ci = catAt(pos.i + (pos.f > 0.5 ? 1 : 0));
  const Rkm = (+s.radiusKm || 380) * (0.55 + 0.1 * ci);
  const R = clamp(Rkm * kmPx, 18 * unit, 900 * unit);
  const south = pos.ll[1] < 0;
  const spin = (south ? 1 : -1) * t * (+s.spin || 1) * 0.6;
  if (s.clouds !== false) {
    const tex = stormTexture(hashStr(L.id) % 997, 3);
    ctx.save();
    ctx.translate(sx, sy); ctx.rotate(spin); if (south) ctx.scale(1, -1);
    ctx.globalAlpha *= 0.92 * (tm.edit ? 1 : clamp(tm.tau / 0.6, 0, 1));
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 20 * unit; ctx.shadowOffsetX = 10 * unit; ctx.shadowOffsetY = 14 * unit;
    ctx.drawImage(tex, -R, -R, R * 2, R * 2);
    ctx.restore();
  }
  if (s.windRings) {
    ctx.setLineDash([5 * unit, 5 * unit]); ctx.lineWidth = 1.4 * unit;
    [[0.55, '#ffd23f'], [0.35, '#ff8f20'], [0.2, '#ff3b30']].forEach(([k, col]) => { ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(sx, sy, R * k, 0, Math.PI * 2); ctx.stroke(); });
    ctx.setLineDash([]);
  }
  if (s.symbol !== false) drawWxIcon(ctx, 'cyclone', sx, sy, (26 + 3 * ci) * unit * (+s.symbolSize || 1), south ? -t : t);
  if (s.name) {
    const lines = [s.name.toUpperCase(), `${SSHS[ci].name.toUpperCase()} · ${SSHS[ci].kmh}`];
    ctx.font = `800 ${14 * unit}px ${DISPLAY}`;
    const tw = Math.max(...lines.map((l, i) => { ctx.font = i ? `600 ${11 * unit}px ${UI}` : `800 ${14 * unit}px ${DISPLAY}`; return ctx.measureText(l).width; }));
    const bx = sx + Math.min(R * 0.55, 140 * unit), by = sy - Math.min(R * 0.55, 140 * unit) - 40 * unit;
    ctx.fillStyle = 'rgba(10,12,16,0.82)'; ctx.fillRect(bx, by, tw + 22 * unit, 42 * unit);
    ctx.fillStyle = SSHS[ci].col; ctx.fillRect(bx, by, 4 * unit, 42 * unit);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.font = `800 ${14 * unit}px ${DISPLAY}`; ctx.fillText(lines[0], bx + 12 * unit, by + 14 * unit);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = `600 ${11 * unit}px ${UI}`; ctx.fillText(lines[1], bx + 12 * unit, by + 30 * unit);
  }
  ctx.restore();
}
/** Category legend for cyclone layers (screen). */
export function drawCycloneLegend(ctx, L, tm, o) {
  const { frame, unit } = o;
  const s = L.style;
  if (!s.legend) return;
  const rows = SSHS.slice().reverse();
  const W = 200 * unit, H = (rows.length * 20 + 30) * unit;
  const m = 26 * unit;
  const x = frame.x + frame.w - m - W, y = frame.y + frame.h - m - H;
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  ctx.fillStyle = 'rgba(10,12,16,0.8)'; ctx.fillRect(x, y, W, H);
  ctx.fillStyle = '#fff'; ctx.font = `800 ${12 * unit}px ${UI}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText('SAFFIR–SIMPSON SCALE', x + 12 * unit, y + 15 * unit);
  rows.forEach((r, i) => {
    const yy = y + 34 * unit + i * 20 * unit;
    ctx.fillStyle = r.col; ctx.beginPath(); ctx.arc(x + 20 * unit, yy, 7 * unit, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.font = `800 ${8 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.fillText(r.k, x + 20 * unit, yy + 0.5);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = `600 ${11 * unit}px ${UI}`; ctx.fillText(r.name, x + 34 * unit, yy);
  });
  ctx.restore();
}

// ================================================================= pressure centres
export function drawPressure(ctx, L, tm, o) {
  if (L.geom?.type !== 'Point') return;
  const { proj, unit } = o;
  const s = L.style;
  const high = (s.type || 'L') === 'H';
  const col = s.color || (high ? '#2f6fe0' : '#e0322f');
  const [x, y] = proj(L.geom.coordinates);
  const t = o.time ?? 0;
  const D = Math.max(0.1, +L.duration || 2);
  const u = tm.edit ? 1 : clamp(tm.tau / D, 0, 1);
  const kmPx = pxPerKm(proj, L.geom.coordinates);
  const n = clamp(Math.round(+s.rings || 5), 1, 12);
  const spacing = Math.max(12 * unit, (+s.spacingKm || 120) * kmPx);
  const r0 = rng(hashStr(L.id));
  const ph = [r0() * 6, r0() * 6, r0() * 6];
  const drift = s.animate !== false && !tm.edit ? t * 0.15 : 0;
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  ctx.lineJoin = 'round';
  // isobars
  if (s.isobars !== false) {
    for (let i = 1; i <= n; i++) {
      const k = easeOut((u - (i - 1) / n * 0.6) / 0.4);
      if (k <= 0) continue;
      const R = spacing * i * (0.85 + 0.15 * k);
      ctx.beginPath();
      for (let a = 0; a <= 64; a++) {
        const th = (a / 64) * Math.PI * 2;
        const wob = 1 + 0.09 * Math.sin(2 * th + ph[0] + drift) + 0.06 * Math.sin(3 * th + ph[1] - drift * 0.7) * (i / n) + 0.04 * Math.sin(5 * th + ph[2]);
        const xx = x + Math.cos(th) * R * wob * 1.15, yy = y + Math.sin(th) * R * wob * 0.92;
        if (a) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
      }
      ctx.closePath();
      ctx.globalAlpha = tm.alpha * k;
      ctx.strokeStyle = hexA(s.isobarColor || '#ffffff', 0.85); ctx.lineWidth = 1.6 * unit;
      ctx.stroke();
      // pressure label on the ring
      if (s.values !== false) {
        const v = Math.round((+s.hpa || (high ? 1032 : 984)) + (high ? -1 : 1) * i * (+s.step || 4));
        const lx = x + R * 1.0, ly = y - R * 0.45;
        ctx.font = `700 ${10.5 * unit}px ${UI}`;
        const tw = ctx.measureText(String(v)).width + 6 * unit;
        ctx.fillStyle = hexA(s.labelBg || '#1b2330', 0.85); ctx.fillRect(lx - tw / 2, ly - 7 * unit, tw, 14 * unit);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(v), lx, ly + 0.5);
      }
    }
    ctx.globalAlpha = tm.alpha;
  }
  // circulation arrows (anticlockwise into a low in the north)
  if (s.arrows) {
    const north = L.geom.coordinates[1] >= 0;
    const dir = (high ? -1 : 1) * (north ? -1 : 1);
    const R = spacing * Math.max(1.5, n * 0.6);
    ctx.strokeStyle = hexA(col, 0.9); ctx.fillStyle = hexA(col, 0.9); ctx.lineWidth = 2.4 * unit;
    for (let k = 0; k < 4; k++) {
      const a0 = (k / 4) * Math.PI * 2 + t * 0.5 * dir;
      const a1 = a0 + 0.9 * dir;
      ctx.beginPath(); ctx.arc(x, y, R, a0, a1, dir < 0); ctx.stroke();
      const ex = x + Math.cos(a1) * R, ey = y + Math.sin(a1) * R;
      const tang = a1 + (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(tang);
      ctx.beginPath(); ctx.moveTo(8 * unit, 0); ctx.lineTo(-4 * unit, -6 * unit); ctx.lineTo(-4 * unit, 6 * unit); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  // big letter
  const k = tm.edit ? 1 : easeOut(u * 2.2);
  const big = 46 * unit * (+s.size || 1) * (0.5 + 0.5 * k);
  ctx.globalAlpha = tm.alpha * clamp(u * 3, 0, 1);
  ctx.font = `900 ${big}px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = big * 0.12; ctx.strokeStyle = '#ffffff'; ctx.strokeText(high ? 'H' : 'L', x, y);
  ctx.fillStyle = col; ctx.fillText(high ? 'H' : 'L', x, y);
  if (s.showValue !== false) {
    ctx.font = `800 ${big * 0.3}px ${UI}`;
    ctx.lineWidth = 3 * unit; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    const txt = `${Math.round(+s.hpa || (high ? 1032 : 984))}`;
    ctx.strokeText(txt, x, y + big * 0.62); ctx.fillStyle = '#fff'; ctx.fillText(txt, x, y + big * 0.62);
  }
  ctx.restore();
}

// ================================================================= fronts
export const FRONT_TYPES = { cold: 'Cold front', warm: 'Warm front', occluded: 'Occluded front', stationary: 'Stationary front', trough: 'Trough' };
export function drawFront(ctx, L, tm, o) {
  if (L.geom?.type !== 'LineString') return;
  const { proj, unit } = o;
  const s = L.style;
  const type = s.type || 'cold';
  const P = L.geom.coordinates.map(proj);
  const D = Math.max(0.1, +L.duration || 2);
  const u = tm.edit ? 1 : easeOut(tm.tau / D);
  const lens = [0];
  for (let i = 1; i < P.length; i++) lens.push(lens[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const total = lens.at(-1) || 1;
  const upto = total * u;
  const at = (d) => { let i = 1; while (i < P.length - 1 && lens[i] < d) i++; const f = (d - lens[i - 1]) / (lens[i] - lens[i - 1] || 1); const a = P[i - 1], b = P[i]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(b[1] - a[1], b[0] - a[0])]; };
  const cols = { cold: '#2f6fe0', warm: '#e0322f', occluded: '#8e44ad', stationary: '#e0322f', trough: '#d4a017' };
  const w = 3 * unit * (+s.size || 1);
  const side = s.flip ? -1 : 1;
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // line (stationary alternates colour)
  const step = 34 * unit * (+s.size || 1);
  if (type === 'stationary') {
    for (let d = 0; d < upto; d += step) {
      const a = at(d), b = at(Math.min(upto, d + step));
      ctx.strokeStyle = Math.floor(d / step) % 2 ? '#2f6fe0' : '#e0322f'; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
  } else {
    ctx.strokeStyle = s.color || cols[type]; ctx.lineWidth = w;
    if (type === 'trough') ctx.setLineDash([10 * unit, 7 * unit]);
    ctx.beginPath();
    let first = true;
    for (let d = 0; d <= upto; d += 4 * unit) { const p = at(d); if (first) { ctx.moveTo(p[0], p[1]); first = false; } else ctx.lineTo(p[0], p[1]); }
    ctx.stroke(); ctx.setLineDash([]);
  }
  if (type !== 'trough') {
    const sz = 9 * unit * (+s.size || 1);
    let k = 0;
    for (let d = step * 0.5; d < upto - sz; d += step, k++) {
      const [x, y, ang] = at(d);
      let kind = type === 'cold' ? 'tri' : type === 'warm' ? 'semi' : k % 2 ? 'semi' : 'tri';
      let sd = side;
      let col = s.color || cols[type];
      if (type === 'stationary') { kind = k % 2 ? 'semi' : 'tri'; sd = kind === 'semi' ? side : -side; col = kind === 'semi' ? '#e0322f' : '#2f6fe0'; }
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(1, sd);
      ctx.fillStyle = col;
      ctx.beginPath();
      if (kind === 'tri') { ctx.moveTo(-sz, 0); ctx.lineTo(sz, 0); ctx.lineTo(0, -sz * 1.3); }
      else ctx.arc(0, 0, sz, Math.PI, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

// ================================================================= city weather marker
export function drawWxPoint(ctx, L, tm, o) {
  if (L.geom?.type !== 'Point') return;
  const { proj, unit } = o;
  const s = L.style;
  const [x, y] = proj(L.geom.coordinates);
  const k = (+s.size || 1);
  const u = tm.edit ? 1 : clamp(tm.tau / Math.max(0.1, +L.duration || 0.6), 0, 1);
  const pop = tm.edit ? 1 : u >= 1 ? 1 : 1 + 2.7 * (u - 1) ** 3 + 1.7 * (u - 1) ** 2;
  const t = tm.edit ? 0 : (o.time ?? 0);
  ctx.save();
  ctx.globalAlpha *= tm.alpha * clamp(u * 3, 0, 1);
  ctx.translate(x, y); ctx.scale(pop, pop); ctx.translate(-x, -y);
  const S = 46 * unit * k;
  const box = s.box !== false;
  const temp = s.temp !== '' && s.temp != null ? `${s.temp}°` : '';
  ctx.font = `800 ${S * 0.5}px ${DISPLAY}`;
  const tw = temp ? ctx.measureText(temp).width : 0;
  ctx.font = `700 ${S * 0.26}px ${UI}`;
  const nw = s.name ? ctx.measureText(s.name).width : 0;
  const W = S * 1.05 + Math.max(tw, nw) + 14 * unit, H = S * 1.05;
  const bx = x - W / 2, by = y - H - 10 * unit;
  if (box) {
    ctx.fillStyle = s.bg || 'rgba(12,22,40,0.82)';
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, W, H, 10 * unit); else ctx.rect(bx, by, W, H); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 7 * unit, by + H); ctx.lineTo(x, y - 2 * unit); ctx.lineTo(x + 7 * unit, by + H); ctx.closePath(); ctx.fill();
  }
  drawWxIcon(ctx, s.icon || 'sunny', bx + S * 0.55, by + H / 2, S * 0.9, t);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  if (temp) { ctx.font = `800 ${S * 0.5}px ${DISPLAY}`; ctx.fillStyle = tempColor(+s.temp); ctx.fillText(temp, bx + S * 1.05, by + H * (s.name ? 0.4 : 0.52)); }
  if (s.name) { ctx.font = `700 ${S * 0.24}px ${UI}`; ctx.fillStyle = '#fff'; ctx.fillText(s.name, bx + S * 1.05, by + H * 0.78); }
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 3 * unit, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
const tempColor = (v) => (v >= 40 ? '#ff6b6b' : v >= 30 ? '#ffb347' : v >= 20 ? '#ffe066' : v >= 10 ? '#b5f2a0' : v >= 0 ? '#9ad8ff' : '#c7b8ff');

// ================================================================= fields: temperature, rainfall, wind
export const FIELD_TYPES = { temp: 'Temperature', rain: 'Rainfall (radar)', wind: 'Wind (moving streaks)', pressure: 'Pressure (shaded)', humidity: 'Humidity' };
const PAL = {
  temp: [[0, '#3a0ca3'], [0.15, '#4361ee'], [0.3, '#4cc9f0'], [0.45, '#80ed99'], [0.6, '#f9e45b'], [0.75, '#f9a03f'], [0.88, '#f3722c'], [1, '#c1121f']],
  rain: [[0, 'rgba(0,0,0,0)'], [0.18, 'rgba(0,0,0,0)'], [0.25, '#7cf2a4'], [0.42, '#20b34a'], [0.58, '#f9e45b'], [0.72, '#f9a03f'], [0.86, '#e03131'], [1, '#c22bd6']],
  pressure: [[0, '#7b2cbf'], [0.35, '#4cc9f0'], [0.5, '#e9f5db'], [0.65, '#f9e45b'], [1, '#e85d04']],
  humidity: [[0, '#f4d58d'], [0.5, '#8ecae6'], [1, '#023e8a']],
  wind: [[0, '#2b2d42'], [0.4, '#4895ef'], [0.7, '#80ffdb'], [1, '#f9e45b']],
};
function parseCol(c) {
  if (c.startsWith('rgba')) { const m = c.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2], m[3] * 255]; }
  const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}
const PALC = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, v.map(([p, c]) => [p, parseCol(c)])]));
function palette(type, v) {
  const p = PALC[type] || PALC.temp;
  v = clamp(v, 0, 1);
  let i = 1; while (i < p.length - 1 && p[i][0] < v) i++;
  const [a, ca] = p[i - 1], [b, cb] = p[i];
  const f = (v - a) / (b - a || 1);
  return [0, 1, 2, 3].map((k) => ca[k] + (cb[k] - ca[k]) * f);
}
const UNITS = { temp: '°C', rain: 'mm/h', wind: 'km/h', pressure: 'hPa', humidity: '%' };
const num = (v, d) => (v === '' || v == null || !isFinite(+v) ? d : +v);
const ranges = (s) => ({ temp: [num(s.min, 18), num(s.max, 46)], rain: [0, num(s.max, 30)], wind: [0, num(s.max, 80)], pressure: [num(s.min, 990), num(s.max, 1030)], humidity: [0, 100] })[s.field || 'temp'];
function boundsOf(L) {
  const ring = L.geom.coordinates[0];
  const xs = ring.map((c) => c[0]), ys = ring.map((c) => c[1]);
  return { w: Math.min(...xs), e: Math.max(...xs), s: Math.min(...ys), n: Math.max(...ys) };
}
/** 0…1 value of the field at normalised (x east, y south), time t. */
function fieldValue(L, x, y, t) {
  const s = L.style;
  const seed = hashStr(L.id) % 9973 + (+s.seed || 0);
  const g = s.source === 'live' && s.grid;
  const type = s.field || 'temp';
  if (g && g[type === 'humidity' ? 'hum' : type]) {
    const arr = g[type === 'humidity' ? 'hum' : type];
    const fx = clamp(x, 0, 1) * (g.nx - 1), fy = clamp(y, 0, 1) * (g.ny - 1);
    const i = Math.min(g.nx - 2, Math.floor(fx)), j = Math.min(g.ny - 2, Math.floor(fy)), dx = fx - i, dy = fy - j;
    const v = (a, b) => arr[b * g.nx + a];
    const raw = (v(i, j) * (1 - dx) + v(i + 1, j) * dx) * (1 - dy) + (v(i, j + 1) * (1 - dx) + v(i + 1, j + 1) * dx) * dy;
    const [lo, hi] = ranges(s);
    let n = (raw - lo) / (hi - lo || 1);
    if (type === 'rain' && s.animate !== false) n *= 0.85 + 0.3 * fbm(x * 5 - t * 0.2, y * 5, seed, 3);
    return n;
  }
  const sc = +s.scale || 2.5;
  const ang = (+s.windDir || 270) * D2R;
  const sp = (s.animate !== false ? t : 0) * 0.05 * (+s.speed || 1);
  const ox = -Math.sin(ang) * sp, oy = Math.cos(ang) * sp;
  if (type === 'temp') return clamp(0.15 + 0.65 * fbm(x * sc + 3, y * sc + 7, seed) + (s.gradient !== false ? (0.5 - y) * 0.35 : 0), 0, 1);
  if (type === 'rain') { const n = fbm(x * sc * 1.6 + ox * 6 + 11, y * sc * 1.6 + oy * 6 + 3, seed, 5); return clamp((n - 0.42) * 2.4 * (+s.amount || 1), 0, 1); }
  if (type === 'pressure') return clamp(fbm(x * sc * 0.6 + 2, y * sc * 0.6 + 9, seed, 3), 0, 1);
  if (type === 'humidity') return clamp(fbm(x * sc + 5, y * sc + 1, seed, 4), 0, 1);
  return clamp(0.3 + 0.7 * fbm(x * sc + 1, y * sc + 4, seed, 3), 0, 1); // wind speed
}
/** Wind direction (radians, map-screen: 0 = east) at a normalised point. */
function windVec(L, x, y) {
  const s = L.style;
  const g = s.source === 'live' && s.grid;
  if (g && g.wdir) {
    const i = clamp(Math.round(x * (g.nx - 1)), 0, g.nx - 1), j = clamp(Math.round(y * (g.ny - 1)), 0, g.ny - 1);
    const from = g.wdir[j * g.nx + i];
    return Math.PI / 2 - (from + 180) * D2R; // blowing toward
  }
  const seed = hashStr(L.id) % 9973;
  const base = ((+s.windDir || 270) + 180) * D2R; // direction it blows toward (meteorological "from")
  const curl = (fbm(x * 2 + 9, y * 2 + 2, seed + 3, 3) - 0.5) * 1.6;
  return Math.PI / 2 - base + curl;
}
const fieldCache = new Map();
function fieldCanvas(L, t, animated) {
  const s = L.style;
  const b = boundsOf(L);
  const asp = clamp((b.n - b.s) / ((b.e - b.w) * Math.cos(((b.n + b.s) / 2) * D2R) || 1), 0.2, 5);
  const W = 160, H = Math.round(clamp(160 * asp, 40, 400));
  const key = JSON.stringify([s, L.geom]) + (animated ? Math.round(t * 12) : '');
  const c0 = fieldCache.get(L.id);
  if (c0 && c0.key === key) return c0.entry;
  const cv = c0?.entry.bmp || document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const img = c.createImageData(W, H);
  const type = s.field || 'temp';
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const v = fieldValue(L, i / (W - 1), j / (H - 1), t);
    const [r, g, bb, a] = palette(type, s.steps ? Math.round(v * (+s.steps)) / (+s.steps) : v);
    const p = (j * W + i) * 4;
    img.data[p] = r; img.data[p + 1] = g; img.data[p + 2] = bb; img.data[p + 3] = a;
  }
  c.putImageData(img, 0, 0);
  const entry = { bmp: cv, w: W, h: H, ready: true };
  fieldCache.set(L.id, { key, entry });
  return entry;
}
export function drawField(ctx, L, tm, o) {
  if (L.geom?.type !== 'Polygon') return;
  const { proj, unit } = o;
  const s = L.style;
  const type = s.field || 'temp';
  const t = o.time ?? 0;
  const D = Math.max(0.1, +L.duration || 1.5);
  const u = tm.edit ? 1 : clamp(tm.tau / D, 0, 1);
  const alpha = tm.alpha * (+s.opacity || 0.7) * (L.anim === 'none' ? 1 : ease(u));
  const ring = L.geom.coordinates[0];
  const b = boundsOf(L);
  const clipPath = (c) => { ring.forEach((pt, i) => { const [x, y] = proj(pt); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath(); };
  if (type !== 'wind' || s.shade !== false) {
    const entry = fieldCanvas(L, t, type === 'rain' && s.animate !== false && !tm.edit);
    drawQuad(ctx, entry, quadFromBounds(b.w, b.s, b.e, b.n), proj, { crs: '4326', alpha: type === 'wind' ? alpha * 0.5 : alpha, clip: clipPath, blend: s.blend === 'multiply' ? 'multiply' : null });
  }
  ctx.save();
  ctx.beginPath(); clipPath(ctx); ctx.clip();
  // wind streaks
  if (type === 'wind' || s.windOverlay) {
    const n = clamp(Math.round(+s.particles || 500), 50, 2000);
    const r = rng(hashStr(L.id) + 7);
    const life = 2.2;
    const spd = (+s.speed || 1) * 0.06;
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const off = r() * life;
      const cyc = Math.floor((t + off) / life);
      const age = (t + off) - cyc * life;
      const rr = rng(hashStr(L.id) + i * 131 + cyc * 7919);
      let x = rr(), y = rr();
      const a = windVec(L, x, y);
      const v = fieldValue({ ...L, style: { ...s, field: 'wind' } }, x, y, 0);
      const len = spd * (0.4 + v) ;
      const x1 = x + Math.cos(a) * len * age, y1 = y - Math.sin(a) * len * age;
      const x0 = x + Math.cos(a) * len * Math.max(0, age - 0.5), y0 = y - Math.sin(a) * len * Math.max(0, age - 0.5);
      const p1 = proj([b.w + (b.e - b.w) * x1, b.n - (b.n - b.s) * y1]), p0 = proj([b.w + (b.e - b.w) * x0, b.n - (b.n - b.s) * y0]);
      const fade = Math.sin(Math.PI * age / life);
      ctx.strokeStyle = `rgba(255,255,255,${(0.75 * fade * tm.alpha * (tm.edit ? 1 : ease(u))).toFixed(3)})`;
      ctx.lineWidth = (1 + v * 1.4) * unit;
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    }
  }
  ctx.restore();
  // value labels
  if (s.labels && type !== 'rain') {
    const [lo, hi] = ranges(s);
    const nx = 5, ny = 4;
    ctx.save(); ctx.globalAlpha *= tm.alpha * (tm.edit ? 1 : ease(u));
    ctx.font = `800 ${13 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = (i + 0.5) / nx, y = (j + 0.5) / ny;
      const ll = [b.w + (b.e - b.w) * x, b.n - (b.n - b.s) * y];
      if (!inside(ll, ring)) continue;
      const v = lo + fieldValue(L, x, y, t) * (hi - lo);
      const [px, py] = proj(ll);
      const txt = type === 'temp' ? `${Math.round(v)}°` : `${Math.round(v)}`;
      ctx.lineWidth = 3 * unit; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.strokeText(txt, px, py);
      ctx.fillStyle = '#fff'; ctx.fillText(txt, px, py);
    }
    ctx.restore();
  }
}
function inside(pt, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** Colour legend for a field (screen, placeable). */
export function drawFieldLegend(ctx, L, tm, o) {
  const s = L.style;
  if (s.legend === false || !o.frame) return;
  const { frame, unit } = o;
  const type = s.field || 'temp';
  const [lo, hi] = ranges(s);
  const W = 230 * unit, H = 54 * unit;
  const m = 26 * unit;
  let x = frame.x + m, y = frame.y + frame.h - m - H;
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  placeAt(ctx, L, frame, x, y, W, H);
  ctx.fillStyle = 'rgba(10,14,22,0.8)'; ctx.fillRect(x, y, W, H);
  ctx.fillStyle = '#fff'; ctx.font = `800 ${12 * unit}px ${UI}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(`${(s.title || FIELD_TYPES[type]).toUpperCase()} (${UNITS[type]})`, x + 10 * unit, y + 13 * unit);
  const bx = x + 10 * unit, by = y + 24 * unit, bw = W - 20 * unit, bh = 10 * unit;
  for (let i = 0; i < bw; i++) { const [r, g, b, a] = palette(type, i / bw); ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${Math.max(a, 60) / 255})`; ctx.fillRect(bx + i, by, 1.2, bh); }
  ctx.font = `600 ${10 * unit}px ${UI}`; ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let k = 0; k <= 4; k++) { ctx.textAlign = k === 0 ? 'left' : k === 4 ? 'right' : 'center'; ctx.fillText(String(Math.round(lo + (hi - lo) * (k / 4))), bx + bw * (k / 4), by + bh + 9 * unit); }
  ctx.restore();
}
/** Fetch a grid of current values for the area from Open-Meteo (free, no key). */
export async function loadLiveGrid(L) {
  const b = boundsOf(L);
  const nx = 7, ny = 5;
  const lats = [], lons = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { lats.push((b.n - (b.n - b.s) * (j / (ny - 1))).toFixed(3)); lons.push((b.w + (b.e - b.w) * (i / (nx - 1))).toFixed(3)); }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(',')}&longitude=${lons.join(',')}&current=temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,relative_humidity_2m,pressure_msl`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather data unavailable');
  let data = await res.json();
  if (!Array.isArray(data)) data = [data];
  const pick = (k) => data.map((d) => +d.current?.[k] || 0);
  return { nx, ny, temp: pick('temperature_2m'), rain: pick('precipitation'), wind: pick('wind_speed_10m'), wdir: pick('wind_direction_10m'), hum: pick('relative_humidity_2m'), pressure: pick('pressure_msl'), time: data[0]?.current?.time || '' };
}

// ================================================================= forecast panels (TV weather)
export const FORECAST_LOOKS = { days: 'Days ahead (cards)', cities: 'Cities list', now: 'Current conditions', warning: 'Weather warning banner' };
export function drawForecast(ctx, L, tm, o) {
  const { frame, unit } = o;
  const s = L.style;
  const look = s.look || 'days';
  const k = +s.size || 1;
  const t = o.time ?? 0;
  const D = Math.max(0.1, +L.duration || 1);
  const u = tm.edit ? 1 : clamp(tm.tau / D, 0, 1);
  const acc = s.color || '#1e88e5';
  const rows = String(s.data || '').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((r) => r[0]);
  const unitT = s.fahrenheit ? '°F' : '°';
  const m = 30 * unit;
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  ctx.textBaseline = 'middle';
  if (look === 'days') {
    const n = Math.max(1, rows.length);
    const cw = 120 * unit * k, ch = 170 * unit * k, gap = 10 * unit;
    const W = n * cw + (n - 1) * gap, H = ch + 40 * unit * k;
    let x = frame.x + (frame.w - W) / 2, y = frame.y + frame.h - m - H;
    if ((s.position || '').includes('top')) y = frame.y + m;
    placeAt(ctx, L, frame, x, y, W, H);
    ctx.fillStyle = acc; ctx.fillRect(x, y, W * easeOut(u * 1.5), 34 * unit * k);
    ctx.fillStyle = '#fff'; ctx.font = `800 ${16 * unit * k}px ${DISPLAY}`; ctx.textAlign = 'left';
    ctx.fillText((s.title || 'WEATHER FORECAST').toUpperCase(), x + 12 * unit, y + 17 * unit * k);
    rows.forEach((r, i) => {
      const e = easeOut((u - i / n * 0.5) / 0.5);
      if (e <= 0) return;
      const cx = x + i * (cw + gap), cy = y + 40 * unit * k + (1 - e) * 30 * unit;
      ctx.globalAlpha = tm.alpha * e;
      const g = ctx.createLinearGradient(0, cy, 0, cy + ch);
      g.addColorStop(0, 'rgba(18,40,74,0.92)'); g.addColorStop(1, 'rgba(10,22,44,0.92)');
      ctx.fillStyle = g; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(cx, cy, cw, ch, 10 * unit); else ctx.rect(cx, cy, cw, ch); ctx.fill();
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = `800 ${15 * unit * k}px ${UI}`;
      ctx.fillText((r[0] || '').toUpperCase(), cx + cw / 2, cy + 20 * unit * k);
      drawWxIcon(ctx, r[1] || 'sunny', cx + cw / 2, cy + 72 * unit * k, 62 * unit * k, tm.edit ? 0 : t + i);
      ctx.font = `800 ${24 * unit * k}px ${DISPLAY}`; ctx.fillStyle = tempColor(+r[2]); ctx.fillText(`${r[2] ?? ''}${unitT}`, cx + cw / 2 - (r[3] ? 22 * unit * k : 0), cy + 132 * unit * k);
      if (r[3]) { ctx.font = `600 ${16 * unit * k}px ${UI}`; ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fillText(`${r[3]}${unitT}`, cx + cw / 2 + 28 * unit * k, cy + 134 * unit * k); }
      if (r[4]) { ctx.font = `600 ${11 * unit * k}px ${UI}`; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillText(r[4], cx + cw / 2, cy + 156 * unit * k); }
    });
  } else if (look === 'cities') {
    const lh = 40 * unit * k, W = 300 * unit * k, H = 44 * unit * k + rows.length * lh;
    let x = frame.x + frame.w - m - W, y = frame.y + m;
    if ((s.position || '').includes('left')) x = frame.x + m;
    if ((s.position || '').includes('bottom')) y = frame.y + frame.h - m - H;
    placeAt(ctx, L, frame, x, y, W, H);
    ctx.fillStyle = acc; ctx.fillRect(x, y, W, 40 * unit * k);
    ctx.fillStyle = '#fff'; ctx.font = `800 ${16 * unit * k}px ${DISPLAY}`; ctx.textAlign = 'left';
    ctx.fillText((s.title || 'TODAY').toUpperCase(), x + 14 * unit, y + 20 * unit * k);
    rows.forEach((r, i) => {
      const e = easeOut((u - i / rows.length * 0.6) / 0.4);
      if (e <= 0) return;
      const yy = y + 44 * unit * k + i * lh;
      ctx.globalAlpha = tm.alpha * e;
      ctx.save(); ctx.translate((1 - e) * 40 * unit, 0);
      ctx.fillStyle = i % 2 ? 'rgba(12,26,50,0.88)' : 'rgba(18,36,66,0.88)'; ctx.fillRect(x, yy, W, lh - 2 * unit);
      ctx.fillStyle = '#fff'; ctx.font = `700 ${15 * unit * k}px ${UI}`; ctx.textAlign = 'left'; ctx.fillText(r[0], x + 14 * unit, yy + lh / 2);
      drawWxIcon(ctx, r[1] || 'sunny', x + W - 92 * unit * k, yy + lh / 2, 32 * unit * k, tm.edit ? 0 : t + i);
      ctx.font = `800 ${18 * unit * k}px ${DISPLAY}`; ctx.fillStyle = tempColor(+r[2]); ctx.textAlign = 'right'; ctx.fillText(`${r[2] ?? ''}${unitT}`, x + W - 14 * unit, yy + lh / 2);
      ctx.restore();
    });
  } else if (look === 'now') {
    const r = rows[0] || ['Dubai', 'sunny', '38'];
    const extras = rows.slice(1).map((x) => x.join(' '));
    const W = 330 * unit * k, H = (150 + extras.length * 20) * unit * k;
    let x = frame.x + m, y = frame.y + m;
    if ((s.position || '').includes('right')) x = frame.x + frame.w - m - W;
    if ((s.position || '').includes('bottom')) y = frame.y + frame.h - m - H;
    placeAt(ctx, L, frame, x, y, W, H);
    const g = ctx.createLinearGradient(x, y, x + W, y + H);
    g.addColorStop(0, hexA(acc, 0.92)); g.addColorStop(1, 'rgba(10,22,44,0.92)');
    ctx.globalAlpha = tm.alpha * clamp(u * 2, 0, 1);
    ctx.fillStyle = g; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, W, H, 14 * unit); else ctx.rect(x, y, W, H); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = `800 ${18 * unit * k}px ${DISPLAY}`; ctx.fillText((r[0] || '').toUpperCase(), x + 18 * unit, y + 26 * unit * k);
    drawWxIcon(ctx, r[1] || 'sunny', x + 64 * unit * k, y + 88 * unit * k, 86 * unit * k, tm.edit ? 0 : t);
    const shown = tm.edit ? +r[2] : Math.round((+r[2] || 0) * easeOut(u));
    ctx.font = `900 ${60 * unit * k}px ${DISPLAY}`; ctx.fillText(`${isFinite(shown) ? shown : ''}${unitT}`, x + 128 * unit * k, y + 92 * unit * k);
    if (r[3]) { ctx.font = `600 ${14 * unit * k}px ${UI}`; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(r[3], x + 132 * unit * k, y + 130 * unit * k); }
    extras.forEach((l, i) => { ctx.font = `600 ${13 * unit * k}px ${UI}`; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(l, x + 18 * unit, y + (150 + i * 20) * unit * k); });
  } else if (look === 'warning') {
    const lvl = (s.level || 'orange');
    const col = { yellow: '#f9d71c', orange: '#ff8c00', red: '#e10600' }[lvl] || acc;
    const H = 64 * unit * k, W = frame.w - m * 2;
    const x = frame.x + m;
    let y = frame.y + m;
    if ((s.position || '').includes('bottom')) y = frame.y + frame.h - m - H;
    placeAt(ctx, L, frame, x, y, W, H, { lockX: true });
    const ww = W * easeOut(u * 1.4);
    ctx.fillStyle = 'rgba(15,10,10,0.88)'; ctx.fillRect(x, y, ww, H);
    ctx.fillStyle = col; ctx.fillRect(x, y, Math.min(ww, 90 * unit * k), H);
    const on = tm.edit || Math.sin(t * 6) > -0.3;
    if (on) {
      ctx.fillStyle = '#111'; ctx.beginPath(); const ix = x + 45 * unit * k, iy = y + H / 2; ctx.moveTo(ix, iy - 20 * unit * k); ctx.lineTo(ix + 22 * unit * k, iy + 17 * unit * k); ctx.lineTo(ix - 22 * unit * k, iy + 17 * unit * k); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col; ctx.font = `900 ${20 * unit * k}px ${UI}`; ctx.textAlign = 'center'; ctx.fillText('!', ix, iy + 5 * unit * k);
    }
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, ww, H); ctx.clip();
    ctx.textAlign = 'left'; ctx.fillStyle = col; ctx.font = `900 ${20 * unit * k}px ${DISPLAY}`;
    ctx.fillText((s.title || `${lvl.toUpperCase()} WARNING`).toUpperCase(), x + 106 * unit * k, y + H * 0.36);
    ctx.fillStyle = '#fff'; ctx.font = `600 ${14 * unit * k}px ${UI}`;
    ctx.fillText(rows.map((r) => r.join(' ')).join('  ·  ') || 'Heavy rain and strong winds expected', x + 106 * unit * k, y + H * 0.7);
    ctx.restore();
  }
  ctx.restore();
}
