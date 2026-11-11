// "Briefing" layout: a geospatial-intelligence style frame around the map.
// The map shows through a window; around it sit a globe, the title, info rows, a locator map,
// before / after satellite thumbnails and a field strip (date, event, location, assessment).
// Layouts: 'A' (globe + title on the left, before / after under the map), 'B' (header, locator and
// before / after on the right, field strip at the bottom), 'end' (closing card, no window).
// applyBriefing() turns any built story (Auto video, News desk) into this look.
import { placeAt, CUSTOM_POS } from './place.js';
import { H, allCountries, countriesByName, countryAt } from './cartofx.js';
import { imageFor } from './geoimage.js';

const { clamp, easeOut, D2R, rr, merc, drawTiles, bboxOf, labelPoint } = H;
const DISP = '"Archivo", Inter, system-ui, sans-serif';
const SANS = 'Inter, system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const r6 = (v) => Math.round(v * 1e6) / 1e6;
/** adds a rounded rectangle to the current path (no beginPath — for cut-outs) */
const rrAdd = (ctx, x, y, w, h, r) => { if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };

export const BR_KINDS = {
  briefing: { name: 'Briefing frame', icon: '▣', geom: 'point', desc: 'Intelligence-briefing layout: the map in a window with a globe, title, info rows, locator, before / after images and a field strip' },
};
export const BR_ANIMS = { briefing: { fade: 'Fade in', build: 'Panels build in', none: 'Shown' } };
export const BR_DEFAULTS = {
  briefing: { anim: 'build', duration: 1.2, style: {
    layout: 'A', title: 'Urda train collision', sub: 'Geospatial analysis', kicker: 'Geospatial intelligence briefing', tag: 'Train collision',
    date: '', place: '', country: '', event: '', eventIcon: 'alert', assessment: '', coords: '', sources: '',
    accent: '#35c8ff', bg: '#050b14', globe: true, before: null, after: null, photos: [], thumbZoom: 15, windowTag: true, scale: true,
  } },
};
const LAYOUTS = { A: 'Globe + title left, before / after below the map', B: 'Header, locator and before / after on the right, field strip', end: 'Closing card' };
const ICONS = { alert: 'Alert', train: 'Train', flood: 'Flood', fire: 'Fire', quake: 'Earthquake', storm: 'Storm', plane: 'Plane', ship: 'Ship', car: 'Car', pin: 'Place', migration: 'People / migration', forest: 'Forest' };
export const BR_FORMS = {
  briefing: [
    ['style.layout', 'Layout', 'select', LAYOUTS],
    ['style.title', 'Title', 'text'], ['style.sub', 'Subtitle', 'text'], ['style.kicker', 'Header line', 'text', null, (L) => L.style.layout !== 'A'],
    ['style.tag', 'Label on the map', 'text', null, (L) => L.style.layout !== 'end'],
    ['style.date', 'Date', 'text'], ['style.place', 'Place', 'text'], ['style.country', 'Country (globe / locator)', 'text'],
    ['style.event', 'Event', 'text'], ['style.eventIcon', 'Event icon', 'select', ICONS], ['style.assessment', 'Assessment', 'text'],
    ['style.coords', 'Coordinates text', 'text'], ['style.sources', 'Sources (closing card)', 'text', null, (L) => L.style.layout === 'end'],
    ['style.accent', 'Accent colour', 'color'], ['style.bg', 'Background', 'color'],
    ['style.globe', 'Globe', 'switch', null, (L) => L.style.layout === 'A'], ['style.windowTag', 'Place tag in the map window', 'switch'], ['style.scale', 'Scale bar', 'switch', null, (L) => L.style.layout === 'B'],
    ['style.thumbZoom', 'Before / after zoom', 'range', [3, 18, 0.1]],
  ],
};
export const BR_SET = new Set(Object.keys(BR_KINDS));
export const brPhases = () => ['captions'];

// ================================================================= geometry of the layouts (fractions of the frame)
/** { win:[x,y,w,h], ... } in frame fractions for a layout and frame aspect (w / h). */
export function layoutBoxes(layout, aspect, hasThumbs = true) {
  const portrait = aspect < 1.2;
  if (layout === 'end') return { end: true };
  if (portrait) {
    return { portrait: true, title: [0.05, 0.1, 0.9, 0.08], win: [0.04, 0.19, 0.92, hasThumbs ? 0.395 : 0.565], thumbs: hasThumbs ? [[0.04, 0.6, 0.445, 0.17], [0.515, 0.6, 0.445, 0.17]] : null, strip: [0.04, 0.785, 0.92, 0.165], globe: null };
  }
  if (layout === 'B') {
    return { header: [0.03, 0.165, 0.945, 0.09], win: [0.03, 0.27, 0.675, 0.54], locator: [0.725, 0.27, 0.25, 0.22], side: [0.725, 0.51, 0.25, 0.3], strip: [0.03, 0.835, 0.945, 0.125] };
  }
  return { left: [0.03, 0.17, 0.265, 0.79], globe: [0.1625, 0.355, 0.095], title: [0.03, 0.545], info: [0.03, 0.72, 0.265, 0.24], win: [0.315, 0.17, 0.66, hasThumbs ? 0.49 : 0.79], thumbs: hasThumbs ? [[0.315, 0.695, 0.31, 0.265], [0.665, 0.695, 0.31, 0.265]] : null };
}

// ================================================================= drawing helpers
const hexA = (hex, a) => { const h = String(hex || '#35c8ff').replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
function fitFont(ctx, text, maxW, size, weight, fam, min = 0.55) {
  let s = size;
  ctx.font = `${weight} ${s}px ${fam}`;
  while (ctx.measureText(text).width > maxW && s > size * min) { s *= 0.94; ctx.font = `${weight} ${s}px ${fam}`; }
  if (ctx.measureText(text).width > maxW) { let t = text; while (t.length > 3 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1); return [`${t}…`, s]; }
  return [text, s];
}
function wrap(ctx, text, maxW, maxLines = 2) {
  const words = String(text || '').split(/\s+/).filter(Boolean), lines = [];
  let cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, '')}…`; }
  return lines;
}
function panel(ctx, x, y, w, h, u, acc, fill = 'rgba(8,17,30,0.9)') {
  rr(ctx, x, y, w, h, 6 * u); ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = hexA(acc, 0.32); ctx.lineWidth = 1 * u; ctx.stroke();
}
function brackets(ctx, x, y, w, h, u, acc, len = 14) {
  const l = len * u;
  ctx.strokeStyle = acc; ctx.lineWidth = 2 * u; ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(x, y + l); ctx.lineTo(x, y); ctx.lineTo(x + l, y);
  ctx.moveTo(x + w - l, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + l);
  ctx.moveTo(x + w, y + h - l); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - l, y + h);
  ctx.moveTo(x + l, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - l);
  ctx.stroke();
}
function caps(ctx, text, x, y, size, color, weight = 700, spacing = 0.12, align = 'left') {
  ctx.font = `${weight} ${size}px ${SANS}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  try { ctx.letterSpacing = `${size * spacing}px`; } catch { /* old browsers */ }
  ctx.fillText(String(text || '').toUpperCase(), x, y);
  try { ctx.letterSpacing = '0px'; } catch { /* */ }
}
/** simple line icons, centred on (x, y), size s */
function icon(ctx, name, x, y, s, col) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1, s * 0.09); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const h = s / 2;
  ctx.beginPath();
  switch (name) {
    case 'calendar': rr(ctx, -h, -h * 0.8, s, s * 0.9, s * 0.12); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-h, -h * 0.35); ctx.lineTo(h, -h * 0.35); ctx.moveTo(-h * 0.45, -h); ctx.lineTo(-h * 0.45, -h * 0.6); ctx.moveTo(h * 0.45, -h); ctx.lineTo(h * 0.45, -h * 0.6); ctx.stroke(); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) ctx.fillRect(-h * 0.55 + i * h * 0.45, -h * 0.05 + j * h * 0.4, s * 0.1, s * 0.1); break;
    case 'pin': ctx.arc(0, -h * 0.25, h * 0.55, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(0, h); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -h * 0.25, h * 0.2, 0, Math.PI * 2); ctx.fill(); break;
    case 'train': rr(ctx, -h * 0.6, -h, s * 0.6, s * 0.8, s * 0.15); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-h * 0.6, -h * 0.2); ctx.lineTo(h * 0.6, -h * 0.2); ctx.moveTo(-h * 0.35, h * 0.55); ctx.lineTo(-h * 0.7, h); ctx.moveTo(h * 0.35, h * 0.55); ctx.lineTo(h * 0.7, h); ctx.stroke(); ctx.beginPath(); ctx.arc(-h * 0.3, h * 0.15, s * 0.06, 0, 7); ctx.arc(h * 0.3, h * 0.15, s * 0.06, 0, 7); ctx.fill(); break;
    case 'flood': for (let k = 0; k < 3; k++) { const yy = -h * 0.5 + k * h * 0.5; ctx.moveTo(-h, yy); for (let i = 0; i <= 8; i++) ctx.lineTo(-h + (i * s) / 8, yy + Math.sin(i * Math.PI / 2) * s * 0.08); } ctx.stroke(); break;
    case 'fire': ctx.moveTo(0, h); ctx.bezierCurveTo(-h * 0.9, h, -h * 0.9, 0, -h * 0.2, -h); ctx.bezierCurveTo(-h * 0.1, -h * 0.3, h * 0.3, -h * 0.4, h * 0.35, -h * 0.75); ctx.bezierCurveTo(h, -h * 0.1, h, h, 0, h); ctx.stroke(); break;
    case 'quake': ctx.moveTo(-h, 0); ctx.lineTo(-h * 0.55, 0); ctx.lineTo(-h * 0.3, -h * 0.8); ctx.lineTo(0, h * 0.8); ctx.lineTo(h * 0.3, -h * 0.5); ctx.lineTo(h * 0.5, 0); ctx.lineTo(h, 0); ctx.stroke(); break;
    case 'storm': for (let a = 0; a < 3 * Math.PI; a += 0.2) { const r = (a / (3 * Math.PI)) * h; a ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(0, 0); } ctx.stroke(); break;
    case 'plane': ctx.moveTo(0, -h); ctx.lineTo(0, h); ctx.moveTo(-h, h * 0.1); ctx.lineTo(0, -h * 0.25); ctx.lineTo(h, h * 0.1); ctx.moveTo(-h * 0.4, h * 0.85); ctx.lineTo(0, h * 0.6); ctx.lineTo(h * 0.4, h * 0.85); ctx.stroke(); break;
    case 'ship': ctx.moveTo(-h, h * 0.1); ctx.lineTo(h, h * 0.1); ctx.lineTo(h * 0.6, h * 0.7); ctx.lineTo(-h * 0.6, h * 0.7); ctx.closePath(); ctx.moveTo(-h * 0.3, h * 0.1); ctx.lineTo(-h * 0.3, -h * 0.5); ctx.lineTo(h * 0.3, -h * 0.5); ctx.lineTo(h * 0.3, h * 0.1); ctx.stroke(); break;
    case 'car': rr(ctx, -h, -h * 0.1, s, s * 0.45, s * 0.1); ctx.moveTo(-h * 0.6, -h * 0.1); ctx.lineTo(-h * 0.35, -h * 0.65); ctx.lineTo(h * 0.35, -h * 0.65); ctx.lineTo(h * 0.6, -h * 0.1); ctx.stroke(); break;
    case 'migration': ctx.arc(-h * 0.4, -h * 0.5, h * 0.25, 0, 7); ctx.moveTo(h * 0.65, -h * 0.5); ctx.arc(h * 0.4, -h * 0.5, h * 0.25, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-h * 0.9, h * 0.6); ctx.quadraticCurveTo(-h * 0.4, -h * 0.25, h * 0.1, h * 0.6); ctx.moveTo(-h * 0.1, h * 0.6); ctx.quadraticCurveTo(h * 0.4, -h * 0.25, h * 0.9, h * 0.6); ctx.stroke(); break;
    case 'forest': ctx.moveTo(0, -h); ctx.lineTo(h * 0.7, h * 0.4); ctx.lineTo(-h * 0.7, h * 0.4); ctx.closePath(); ctx.moveTo(0, h * 0.4); ctx.lineTo(0, h); ctx.stroke(); break;
    case 'shield': ctx.moveTo(0, -h); ctx.lineTo(h * 0.8, -h * 0.6); ctx.lineTo(h * 0.7, h * 0.2); ctx.quadraticCurveTo(h * 0.4, h * 0.8, 0, h); ctx.quadraticCurveTo(-h * 0.4, h * 0.8, -h * 0.7, h * 0.2); ctx.lineTo(-h * 0.8, -h * 0.6); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-h * 0.3, 0); ctx.lineTo(-h * 0.05, h * 0.25); ctx.lineTo(h * 0.35, -h * 0.25); ctx.stroke(); break;
    default: ctx.moveTo(0, -h); ctx.lineTo(h, h * 0.8); ctx.lineTo(-h, h * 0.8); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -h * 0.3); ctx.lineTo(0, h * 0.25); ctx.stroke(); ctx.beginPath(); ctx.arc(0, h * 0.5, s * 0.05, 0, 7); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- globe (orthographic, cached)
const globes = new Map();
function globeImage(lon0, lat0, R, hiName, acc) {
  const key = `${lon0.toFixed(0)}|${lat0.toFixed(0)}|${Math.round(R)}|${hiName}|${acc}`;
  if (globes.has(key)) return globes.get(key);
  const C = allCountries();
  if (!C) return null;
  const S = Math.ceil(R * 2 + 4);
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = cv.getContext('2d');
  const cx = S / 2, cy = S / 2;
  const l0 = lon0 * D2R, p0 = lat0 * D2R, sp0 = Math.sin(p0), cp0 = Math.cos(p0);
  const proj = ([lon, lat]) => {
    const l = lon * D2R - l0, p = lat * D2R, cp = Math.cos(p), sp = Math.sin(p);
    const x = cp * Math.sin(l), y = cp0 * sp - sp0 * cp * Math.cos(l), c = sp0 * sp + cp0 * cp * Math.cos(l);
    if (c >= 0) return [cx + x * R, cy - y * R, true];
    const n = Math.hypot(x, y) || 1;
    return [cx + (x / n) * R, cy - (y / n) * R, false];
  };
  const oc = g.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
  oc.addColorStop(0, '#12335a'); oc.addColorStop(1, '#040d1b');
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fillStyle = oc; g.fill();
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  // graticule
  g.strokeStyle = hexA(acc, 0.09); g.lineWidth = 0.6;
  for (let lo = -180; lo < 180; lo += 30) { g.beginPath(); let on = false; for (let la = -90; la <= 90; la += 5) { const q = proj([lo, la]); if (q[2]) { on ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); on = true; } else on = false; } g.stroke(); }
  for (let la = -60; la <= 60; la += 30) { g.beginPath(); let on = false; for (let lo = -180; lo <= 180; lo += 5) { const q = proj([lo, la]); if (q[2]) { on ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); on = true; } else on = false; } g.stroke(); }
  const draw = (c, fill, stroke, lw) => {
    g.beginPath();
    let any = false;
    for (const p of c.polys) {
      const ring = p[0], step = ring.length > 400 ? 4 : ring.length > 120 ? 2 : 1;
      const pts = [];
      let front = false;
      for (let i = 0; i < ring.length; i += step) { const q = proj(ring[i]); front ||= q[2]; pts.push(q); }
      if (!front || pts.length < 3) continue;
      any = true;
      pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
      g.closePath();
    }
    if (!any) return;
    g.fillStyle = fill; g.fill('evenodd');
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
  };
  let hi = null;
  for (const c of C) { if (hiName && c.name === hiName) { hi = c; continue; } draw(c, '#1b3550', 'rgba(140,200,255,0.22)', 0.5); }
  if (hi) draw(hi, hexA(acc, 0.55), acc, 1.2);
  // shading for depth
  const sh = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.2, cx, cy, R * 1.05);
  sh.addColorStop(0, 'rgba(255,255,255,0.06)'); sh.addColorStop(0.7, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = sh; g.fillRect(0, 0, S, S);
  g.restore();
  const out = { cv, proj: (ll) => proj(ll), S };
  globes.set(key, out);
  if (globes.size > 60) globes.delete(globes.keys().next().value);
  return out;
}

// ---------------------------------------------------------------- before / after thumbnails
function thumb(ctx, spec, ll, x, y, w, h, u, acc, label, o, defZoom) {
  ctx.save();
  rr(ctx, x, y, w, h, 5 * u); ctx.fillStyle = '#0b1522'; ctx.fill();
  ctx.save(); rr(ctx, x, y, w, h, 5 * u); ctx.clip();
  let drawn = false;
  if (spec?.media) {
    const e = imageFor(spec.media);
    if (e?.ready) {
      const k = Math.max(w / e.w, h / e.h), dw = e.w * k, dh = e.h * k;
      ctx.drawImage(e.bmp, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); drawn = true;
    } else e?.p?.then(() => o.map?.triggerRepaint?.());
  } else if (spec?.url && ll) {
    H.setMap(o.map);
    const z = clamp(+spec.zoom || defZoom || 15, +spec.minzoom || 0, +spec.maxzoom || 18);
    drawTiles(ctx, spec.url, ll, z, x, y, w, h); drawn = true;
    // the spot
    ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 1.6 * u;
    ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2 + (h < 110 * u ? 8 * u : 0), Math.min(9 * u, h * 0.12), 0, Math.PI * 2); ctx.stroke();
  }
  if (!drawn) { caps(ctx, spec ? 'Loading…' : 'No image', x + w / 2, y + h / 2 + 4 * u, 10 * u, 'rgba(255,255,255,0.4)', 600, 0.15, 'center'); }
  // subtle vignette
  const vg = ctx.createLinearGradient(0, y, 0, y + h); vg.addColorStop(0, 'rgba(0,0,0,0.35)'); vg.addColorStop(0.3, 'rgba(0,0,0,0)'); ctx.fillStyle = vg; ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.strokeStyle = hexA(acc, 0.45); ctx.lineWidth = 1 * u; rr(ctx, x, y, w, h, 5 * u); ctx.stroke();
  brackets(ctx, x - 1 * u, y - 1 * u, w + 2 * u, h + 2 * u, u, acc, 10);
  // label chip
  const lab = String(label || '').toUpperCase(), sub = spec?.date || '';
  ctx.font = `800 ${11 * u}px ${SANS}`;
  const labW = ctx.measureText(lab).width + lab.length * 11 * u * 0.1;
  ctx.font = `600 ${9.5 * u}px ${MONO}`;
  const subW = sub ? ctx.measureText(sub).width + 8 * u : 0;
  ctx.fillStyle = 'rgba(4,10,18,0.85)'; rr(ctx, x + 8 * u, y + 8 * u, labW + subW + 18 * u, 20 * u, 3 * u); ctx.fill();
  ctx.strokeStyle = hexA(acc, 0.6); ctx.lineWidth = 0.8 * u; ctx.stroke();
  caps(ctx, lab, x + 17 * u, y + 22 * u, 11 * u, '#ffffff', 800, 0.1);
  if (sub) { ctx.font = `600 ${9.5 * u}px ${MONO}`; ctx.fillStyle = acc; ctx.textAlign = 'left'; ctx.fillText(sub, x + 17 * u + labW + 8 * u, y + 21.5 * u); }
  ctx.restore();
}

// ---------------------------------------------------------------- locator (country in Mercator)
function locator(ctx, ll, country, x, y, w, h, u, acc, place) {
  const C = allCountries();
  if (!C) return;
  const c = (country && (countriesByName(country) || [])[0]) || (ll && countryAt(ll));
  let box;
  if (c) {
    const big = c.polys.reduce((m, p) => (p[0].length > m[0].length ? p : m), c.polys[0]);
    const [w0, s0, e0, n0] = bboxOf([big]);
    const pw = (e0 - w0) * 0.35 + 0.5, ph = (n0 - s0) * 0.35 + 0.5;
    box = [w0 - pw, s0 - ph, e0 + pw, n0 + ph];
    if (ll) box = [Math.min(box[0], ll[0] - 1), Math.min(box[1], ll[1] - 1), Math.max(box[2], ll[0] + 1), Math.max(box[3], ll[1] + 1)];
  } else if (ll) box = [ll[0] - 8, ll[1] - 6, ll[0] + 8, ll[1] + 6];
  else return;
  let [ax, ay] = merc([box[0], box[3]]), [bx, by] = merc([box[2], box[1]]);
  // keep the panel's aspect
  const k0 = Math.min(w / (bx - ax), h / (by - ay));
  const cxm = (ax + bx) / 2, cym = (ay + by) / 2;
  ax = cxm - w / k0 / 2; bx = cxm + w / k0 / 2; ay = cym - h / k0 / 2; by = cym + h / k0 / 2;
  const to = (q) => { const [mx, my] = merc(q); return [x + (mx - ax) * k0, y + (my - ay) * k0]; };
  ctx.save(); rr(ctx, x, y, w, h, 4 * u); ctx.clip();
  ctx.fillStyle = '#06101d'; ctx.fillRect(x, y, w, h);
  const vb = [box[0] - 30, box[1] - 30, box[2] + 30, box[3] + 30];
  for (const cc of C) {
    if (cc.bbox[2] < vb[0] || cc.bbox[0] > vb[2] || cc.bbox[3] < vb[1] || cc.bbox[1] > vb[3]) continue;
    ctx.beginPath(); H.pathPolys(ctx, cc.polys, to);
    ctx.fillStyle = cc === c ? hexA(acc, 0.32) : '#13253a'; ctx.fill('evenodd');
    ctx.strokeStyle = cc === c ? acc : 'rgba(140,200,255,0.25)'; ctx.lineWidth = (cc === c ? 1.3 : 0.6) * u; ctx.stroke();
  }
  if (c) { const lp = labelPoint(c.polys); if (lp) { const q = to(lp); caps(ctx, c.name, q[0], q[1] - (ll ? 0 : 0), 10 * u, 'rgba(255,255,255,0.55)', 700, 0.2, 'center'); } }
  if (ll) {
    const q = to(ll);
    ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(q[0], q[1], 4 * u, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,59,48,0.5)'; ctx.lineWidth = 1.5 * u; ctx.beginPath(); ctx.arc(q[0], q[1], 9 * u, 0, Math.PI * 2); ctx.stroke();
    if (place) {
      ctx.font = `700 ${10 * u}px ${SANS}`;
      const tw = ctx.measureText(place.toUpperCase()).width + 12 * u;
      const lx = clamp(q[0] + 12 * u, x + 4 * u, x + w - tw - 4 * u), ly = clamp(q[1] - 22 * u, y + 4 * u, y + h - 20 * u);
      ctx.fillStyle = 'rgba(4,10,18,0.85)'; rr(ctx, lx, ly, tw, 17 * u, 3 * u); ctx.fill(); ctx.strokeStyle = hexA(acc, 0.7); ctx.lineWidth = 0.8 * u; ctx.stroke();
      caps(ctx, place, lx + 6 * u, ly + 12 * u, 10 * u, '#fff', 700, 0.04);
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- tag inside the map window
function windowTag(ctx, L, o, wx, wy, ww, wh, u, acc, align = 'right') {
  const s = L.style, ll = L.geom?.coordinates;
  const tag = String(s.tag || s.event || '').toUpperCase();
  const place = [s.place, s.country].filter(Boolean).join(', ').toUpperCase();
  const lines = [[tag, 800, 15], [place, 600, 11], [s.coords || '', 500, 10]].filter((l) => l[0]);
  if (!lines.length) return;
  let tw = 0;
  for (const [t, wt, sz] of lines) { ctx.font = `${wt} ${sz * u}px ${wt === 500 ? MONO : SANS}`; tw = Math.max(tw, ctx.measureText(t).width); }
  const bw = tw + 26 * u, bh = 14 * u + lines.reduce((a, l) => a + l[2] * 1.45 * u, 0);
  let bx = align === 'right' ? wx + ww - bw - 22 * u : wx + 22 * u, by = wy + 22 * u;
  const p = ll && o.proj ? o.proj(ll) : null;
  const inside = p && p[0] > wx && p[0] < wx + ww && p[1] > wy && p[1] < wy + wh;
  if (inside && p[0] > bx - 20 * u && p[1] < by + bh + 30 * u) by = Math.min(wy + wh - bh - 22 * u, p[1] + 40 * u);
  if (inside) {
    const ax = clamp(p[0], bx, bx + bw), ay = by + (p[1] > by ? bh : 0);
    ctx.strokeStyle = hexA(acc, 0.85); ctx.lineWidth = 1.2 * u;
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(ax, ay); ctx.stroke();
    ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(p[0], p[1], 3 * u, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(4,10,18,0.82)'; rr(ctx, bx, by, bw, bh, 3 * u); ctx.fill();
  ctx.strokeStyle = hexA(acc, 0.55); ctx.lineWidth = 1 * u; ctx.stroke();
  ctx.fillStyle = acc; ctx.fillRect(bx, by, 3 * u, bh);
  let ty = by + 7 * u;
  for (const [t, wt, sz] of lines) {
    ty += sz * 1.2 * u;
    ctx.font = `${wt} ${sz * u}px ${wt === 500 ? MONO : SANS}`; ctx.fillStyle = wt === 800 ? '#fff' : wt === 500 ? acc : 'rgba(255,255,255,0.8)'; ctx.textAlign = 'left';
    ctx.fillText(t, bx + 13 * u, ty);
    ty += sz * 0.25 * u;
  }
}
function scaleBar(ctx, o, ll, x, y, u, acc) {
  if (!o.proj || !ll) return;
  const a = o.proj(ll), b = o.proj([ll[0] + 0.01, ll[1]]);
  const pxPerM = Math.hypot(b[0] - a[0], b[1] - a[1]) / (0.01 * 111320 * Math.cos(ll[1] * D2R));
  if (!(pxPerM > 0)) return;
  const target = 140 * u / pxPerM;
  const pow = 10 ** Math.floor(Math.log10(target)), nice = [1, 2, 5, 10].map((k) => k * pow).filter((v) => v <= target).pop() || pow;
  const W = nice * pxPerM;
  ctx.fillStyle = 'rgba(4,10,18,0.75)'; rr(ctx, x - 8 * u, y - 18 * u, W + 52 * u, 30 * u, 3 * u); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2 * u;
  ctx.beginPath(); ctx.moveTo(x, y - 5 * u); ctx.lineTo(x, y); ctx.lineTo(x + W, y); ctx.lineTo(x + W, y - 5 * u); ctx.moveTo(x + W / 2, y); ctx.lineTo(x + W / 2, y - 3 * u); ctx.stroke();
  ctx.font = `600 ${9.5 * u}px ${MONO}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
  ctx.fillText('0', x - 3 * u, y - 8 * u);
  ctx.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, x + W + 6 * u, y + 3 * u);
}

// ================================================================= main draw
export function drawBriefing(ctx, L, tm, o) {
  const fr = o.frame;
  if (!fr) return;
  const s = L.style, acc = s.accent || '#35c8ff';
  const u = fr.w / 1000;
  const ll = L.geom?.coordinates || null;
  const aspect = fr.w / fr.h;
  const hasThumbs = !!(s.before || s.after || s.photos?.length);
  const Bx = layoutBoxes(s.layout || 'A', aspect, hasThumbs);
  const P = (b) => [fr.x + b[0] * fr.w, fr.y + b[1] * fr.h, b[2] * fr.w, b[3] * fr.h];
  const k = tm.edit || L.anim === 'none' ? 1 : clamp(tm.tau / Math.max(0.2, +L.duration || 1), 0, 1);
  const kk = easeOut(k);
  const build = L.anim === 'build' && !tm.edit;
  const stage = (i) => (build ? clamp(kk * 4 - i * 0.6, 0, 1) : 1);
  ctx.save();
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !tm.edit ? kk : 1);
  placeAt(ctx, L, fr, fr.x, fr.y, fr.w, fr.h);
  // ---- background chrome with the window cut out
  const win = Bx.win ? P(Bx.win) : null;
  ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h);
  if (win) rrAdd(ctx, win[0], win[1], win[2], win[3], 6 * u);
  const bgG = ctx.createLinearGradient(fr.x, fr.y, fr.x + fr.w * 0.4, fr.y + fr.h);
  bgG.addColorStop(0, s.bg || '#050b14'); bgG.addColorStop(1, '#0a1626');
  ctx.fillStyle = bgG; ctx.fill('evenodd');
  // faint grid
  ctx.save(); ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); if (win) rrAdd(ctx, win[0], win[1], win[2], win[3], 6 * u); ctx.clip('evenodd');
  ctx.strokeStyle = hexA(acc, 0.04); ctx.lineWidth = 1;
  ctx.beginPath(); for (let gx = fr.x; gx < fr.x + fr.w; gx += 40 * u) { ctx.moveTo(gx, fr.y); ctx.lineTo(gx, fr.y + fr.h); } for (let gy = fr.y; gy < fr.y + fr.h; gy += 40 * u) { ctx.moveTo(fr.x, gy); ctx.lineTo(fr.x + fr.w, gy); } ctx.stroke();
  // top hairline under the logo band
  ctx.strokeStyle = hexA(acc, 0.18); ctx.beginPath(); ctx.moveTo(fr.x + 0.03 * fr.w, fr.y + 0.15 * fr.h); ctx.lineTo(fr.x + 0.97 * fr.w, fr.y + 0.15 * fr.h); ctx.stroke();
  ctx.restore();
  if (win) {
    ctx.strokeStyle = hexA(acc, 0.5); ctx.lineWidth = 1.2 * u; rr(ctx, win[0], win[1], win[2], win[3], 6 * u); ctx.stroke();
    brackets(ctx, win[0] - 3 * u, win[1] - 3 * u, win[2] + 6 * u, win[3] + 6 * u, u, acc, 18);
    // inner vignette
    ctx.save(); rr(ctx, win[0], win[1], win[2], win[3], 6 * u); ctx.clip();
    const vg = ctx.createRadialGradient(win[0] + win[2] / 2, win[1] + win[3] / 2, Math.min(win[2], win[3]) * 0.45, win[0] + win[2] / 2, win[1] + win[3] / 2, Math.max(win[2], win[3]) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,8,20,0.35)'); ctx.fillStyle = vg; ctx.fillRect(win[0], win[1], win[2], win[3]);
    ctx.restore();
  }
  const title = String(s.title || ''), sub = String(s.sub || '');
  const evIcon = s.eventIcon || 'alert';
  const fields = [['calendar', 'Incident date', s.date], ['pin', 'Location', [s.place, s.country].filter(Boolean).join(', ')], [evIcon, 'Event', s.event], ['shield', 'Assessment', s.assessment]].filter((f) => f[2]);

  if (Bx.end) {
    // ---- closing card
    ctx.globalAlpha *= stage(0);
    const cx = fr.x + fr.w / 2;
    caps(ctx, s.kicker || 'Briefing', cx, fr.y + fr.h * 0.33, 12 * u, acc, 700, 0.3, 'center');
    const [t1, sz] = fitFont(ctx, title.toUpperCase(), fr.w * 0.84, 56 * u, 900, DISP);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(t1, cx, fr.y + fr.h * 0.33 + sz * 1.2);
    if (sub) { ctx.font = `500 ${17 * u}px ${SANS}`; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillText(sub, cx, fr.y + fr.h * 0.33 + sz * 1.2 + 34 * u); }
    ctx.strokeStyle = acc; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(cx - 40 * u, fr.y + fr.h * 0.58); ctx.lineTo(cx + 40 * u, fr.y + fr.h * 0.58); ctx.stroke();
    if (fields.length) {
      const sw = Math.min(fr.w * 0.86, fields.length * 220 * u), sx = cx - sw / 2, cw = sw / fields.length, sy = fr.y + fr.h * 0.64;
      fields.forEach(([ic, lab, val], i) => {
        const fx = sx + i * cw;
        icon(ctx, ic, fx + 16 * u, sy + 18 * u, 20 * u, acc);
        caps(ctx, lab, fx + 36 * u, sy + 12 * u, 9 * u, acc, 700, 0.15);
        const [vt] = fitFont(ctx, String(val).toUpperCase(), cw - 46 * u, 13 * u, 700, SANS);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(vt, fx + 36 * u, sy + 30 * u);
      });
    }
    if (s.sources) { ctx.font = `500 ${10.5 * u}px ${SANS}`; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.textAlign = 'center'; wrap(ctx, s.sources, fr.w * 0.8, 2).forEach((l, i) => ctx.fillText(l, cx, fr.y + fr.h * 0.86 + i * 15 * u)); }
    ctx.restore();
    return;
  }

  if (Bx.portrait || s.layout === 'B') {
    // ---- header title
    const hb = P(Bx.header || Bx.title);
    ctx.save(); ctx.globalAlpha *= stage(0);
    const [t1, sz] = fitFont(ctx, title.toUpperCase(), hb[2] * (Bx.portrait ? 1 : 0.62), (Bx.portrait ? 30 : 34) * u, 900, DISP);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(t1, hb[0], hb[1] + sz * 1.0);
    if (sub) { ctx.font = `500 ${14 * u}px ${SANS}`; ctx.fillStyle = hexA(acc, 0.95); ctx.fillText(sub, hb[0], hb[1] + sz * 1.0 + 22 * u); }
    if (!Bx.portrait && s.kicker) {
      caps(ctx, s.kicker, hb[0] + hb[2], hb[1] + 22 * u, 10.5 * u, acc, 700, 0.25, 'right');
      ctx.font = `500 ${10 * u}px ${MONO}`; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.textAlign = 'right';
      ctx.fillText(s.coords || '', hb[0] + hb[2], hb[1] + 40 * u);
    }
    ctx.restore();
    // ---- locator
    if (Bx.locator) {
      const lb = P(Bx.locator);
      ctx.save(); ctx.globalAlpha *= stage(1);
      panel(ctx, lb[0], lb[1], lb[2], lb[3], u, acc);
      caps(ctx, 'Location', lb[0] + 12 * u, lb[1] + 20 * u, 10 * u, acc, 700, 0.2);
      locator(ctx, ll, s.country, lb[0] + 8 * u, lb[1] + 28 * u, lb[2] - 16 * u, lb[3] - 36 * u, u, acc, s.place);
      ctx.restore();
    }
    // ---- side: before / after (or photos)
    const thumbs = Bx.side ? (() => { const sb = P(Bx.side); return { box: sb, items: [[sb[0] + 8 * u, sb[1] + 30 * u, sb[2] - 16 * u, (sb[3] - 46 * u) / 2], [sb[0] + 8 * u, sb[1] + 38 * u + (sb[3] - 46 * u) / 2, sb[2] - 16 * u, (sb[3] - 46 * u) / 2]] }; })() : Bx.thumbs ? { items: Bx.thumbs.map(P) } : null;
    if (thumbs) {
      ctx.save(); ctx.globalAlpha *= stage(2);
      const photos = s.photos?.length ? s.photos : null;
      if (thumbs.box) { panel(ctx, ...thumbs.box, u, acc); caps(ctx, photos ? 'Site imagery' : 'Site analysis (before / after)', thumbs.box[0] + 12 * u, thumbs.box[1] + 20 * u, 10 * u, acc, 700, 0.15); }
      const specs = photos ? photos.slice(0, 2).map((m) => ({ media: m.id || m, date: '' })) : [s.before, s.after];
      const labs = photos ? photos.slice(0, 2).map((m) => m.name || 'Photo') : ['Before', 'After'];
      thumbs.items.forEach((b, i) => (specs[i] || !photos) && thumb(ctx, specs[i], ll, b[0], b[1], b[2], b[3], u, acc, labs[i], o, s.thumbZoom));
      ctx.restore();
    }
    // ---- field strip
    if (Bx.strip) {
      const sb = P(Bx.strip);
      ctx.save(); ctx.globalAlpha *= stage(3);
      panel(ctx, sb[0], sb[1], sb[2], sb[3], u, acc);
      const n = Math.max(1, fields.length), per = Bx.portrait ? 2 : n, rows = Math.ceil(n / per);
      const cw = sb[2] / per, ch = sb[3] / rows;
      fields.forEach(([ic, lab, val], i) => {
        const fx = sb[0] + (i % per) * cw, fy = sb[1] + Math.floor(i / per) * ch;
        if (i % per) { ctx.strokeStyle = hexA(acc, 0.2); ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.moveTo(fx, fy + ch * 0.2); ctx.lineTo(fx, fy + ch * 0.8); ctx.stroke(); }
        icon(ctx, ic, fx + 26 * u, fy + ch / 2, 22 * u, acc);
        caps(ctx, lab, fx + 50 * u, fy + ch / 2 - 5 * u, 9 * u, acc, 700, 0.15);
        const [vt] = fitFont(ctx, String(val).toUpperCase(), cw - 62 * u, 14 * u, 800, SANS);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(vt, fx + 50 * u, fy + ch / 2 + 13 * u);
      });
      ctx.restore();
    }
    if (win) {
      ctx.save(); ctx.globalAlpha *= stage(1);
      if (s.windowTag !== false) windowTag(ctx, L, o, win[0], win[1], win[2], win[3], u, acc, 'left');
      if (s.scale !== false) scaleBar(ctx, o, ll, win[0] + 22 * u, win[1] + win[3] - 20 * u, u, acc);
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  // ---- layout A: globe, title, info rows on the left; before / after under the map
  if (s.globe !== false && Bx.globe && ll) {
    ctx.save(); ctx.globalAlpha *= stage(0);
    const gx = fr.x + Bx.globe[0] * fr.w, gy = fr.y + Bx.globe[1] * fr.h, R = Bx.globe[2] * fr.w;
    const spin = build ? (1 - kk) * 50 : 0;
    const c = countryAt(ll) || (s.country ? (countriesByName(s.country) || [])[0] : null);
    const G = globeImage(ll[0] + spin, clamp(ll[1] * 0.8, -60, 60), R, c?.name || '', acc);
    // atmosphere glow
    const at = ctx.createRadialGradient(gx, gy, R * 0.95, gx, gy, R * 1.25);
    at.addColorStop(0, hexA(acc, 0.35)); at.addColorStop(1, hexA(acc, 0)); ctx.fillStyle = at; ctx.beginPath(); ctx.arc(gx, gy, R * 1.25, 0, Math.PI * 2); ctx.fill();
    if (G) {
      ctx.drawImage(G.cv, gx - G.S / 2, gy - G.S / 2);
      const q = G.proj(ll);
      if (q[2]) {
        const px = gx - G.S / 2 + q[0], py = gy - G.S / 2 + q[1];
        const pulse = (o.time * 1.2) % 1;
        ctx.strokeStyle = hexA('#ff3b30', 1 - pulse); ctx.lineWidth = 1.5 * u; ctx.beginPath(); ctx.arc(px, py, (4 + pulse * 12) * u, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(px, py, 3.5 * u, 0, Math.PI * 2); ctx.fill();
        const name = String(s.country || c?.name || '').toUpperCase();
        if (name) {
          ctx.font = `800 ${11 * u}px ${SANS}`;
          const tw = ctx.measureText(name).width + 16 * u;
          const lx = gx - R - 6 * u, ly = py - 9 * u;
          ctx.strokeStyle = acc; ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(lx + tw, ly + 9 * u); ctx.stroke();
          ctx.fillStyle = 'rgba(4,10,18,0.88)'; rr(ctx, lx, ly, tw, 18 * u, 3 * u); ctx.fill(); ctx.strokeStyle = acc; ctx.stroke();
          caps(ctx, name, lx + 8 * u, ly + 13 * u, 11 * u, '#fff', 800, 0.06);
        }
      }
    } else { ctx.fillStyle = '#0b2240'; ctx.beginPath(); ctx.arc(gx, gy, R, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = hexA(acc, 0.6); ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.arc(gx, gy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  {
    // title
    ctx.save(); ctx.globalAlpha *= stage(1);
    const tx = fr.x + Bx.title[0] * fr.w, ty = fr.y + Bx.title[1] * fr.h, tw = Bx.left[2] * fr.w;
    let sz = 28 * u, lines;
    for (;;) { ctx.font = `900 ${sz}px ${DISP}`; lines = wrap(ctx, title.toUpperCase(), tw, 3); if ((lines.length <= 2 && !lines.at(-1).endsWith('…')) || sz < 19 * u) break; sz *= 0.9; }
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    lines.forEach((l, i) => ctx.fillText(l, tx, ty + sz + i * sz * 1.05));
    const by = ty + sz + (lines.length - 1) * sz * 1.05;
    if (sub) caps(ctx, sub, tx, by + 22 * u, 12 * u, acc, 700, 0.18);
    ctx.restore();
    // info rows
    const ib = P(Bx.info);
    ctx.save(); ctx.globalAlpha *= stage(2);
    panel(ctx, ib[0], ib[1], ib[2], ib[3], u, acc);
    const rows = fields.filter((f) => f[1] !== 'Assessment').slice(0, 3);
    const rh = ib[3] / Math.max(3, rows.length);
    rows.forEach(([ic, , val], i) => {
      const ry = ib[1] + i * rh;
      if (i) { ctx.strokeStyle = hexA(acc, 0.18); ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.moveTo(ib[0] + 12 * u, ry); ctx.lineTo(ib[0] + ib[2] - 12 * u, ry); ctx.stroke(); }
      icon(ctx, ic, ib[0] + 26 * u, ry + rh / 2, 20 * u, acc);
      const [vt] = fitFont(ctx, String(val).toUpperCase(), ib[2] - 62 * u, 13.5 * u, 700, SANS);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(vt, ib[0] + 50 * u, ry + rh / 2 + 1 * u);
      ctx.textBaseline = 'alphabetic';
    });
    ctx.restore();
  }
  if (Bx.thumbs) {
    ctx.save(); ctx.globalAlpha *= stage(3);
    const [b0, b1] = Bx.thumbs.map(P);
    const photos = s.photos?.length ? s.photos : null;
    const specs = photos ? photos.slice(0, 2).map((m) => ({ media: m.id || m })) : [s.before, s.after];
    const labs = photos ? photos.slice(0, 2).map((m) => m.name || 'Photo') : ['Before', 'After'];
    thumb(ctx, specs[0], ll, ...b0, u, acc, labs[0], o, s.thumbZoom);
    if (specs[1] || !photos) thumb(ctx, specs[1], ll, ...b1, u, acc, labs[1], o, s.thumbZoom);
    if (!photos) {
      // arrow between
      const ax = (b0[0] + b0[2] + b1[0]) / 2, ay = b0[1] + b0[3] / 2;
      ctx.strokeStyle = acc; ctx.lineWidth = 2.2 * u; ctx.lineJoin = 'miter';
      for (const d of [-5, 3]) { ctx.beginPath(); ctx.moveTo(ax + (d - 4) * u, ay - 8 * u); ctx.lineTo(ax + (d + 4) * u, ay); ctx.lineTo(ax + (d - 4) * u, ay + 8 * u); ctx.stroke(); }
    }
    ctx.restore();
  }
  if (win && s.windowTag !== false) { ctx.save(); ctx.globalAlpha *= stage(1); windowTag(ctx, L, o, win[0], win[1], win[2], win[3], u, acc, 'right'); ctx.restore(); }
  ctx.restore();
}

// ================================================================= turning a built story into the briefing look
const REF_W = 1000;
const mercPx = ([lng, lat], z) => { const W = 512 * 2 ** z; const s = Math.sin(clamp(lat, -85.05, 85.05) * D2R); return [((lng + 180) / 360) * W, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * W]; };
const unMerc = ([x, y], z) => { const W = 512 * 2 ** z; const lng = (x / W) * 360 - 180; const n = Math.PI - (2 * Math.PI * y) / W; return [lng, (180 / Math.PI) * Math.atan(Math.sinh(n))]; };
/** Moves a camera view so what was in the frame centre sits in the centre of the window (and fits it). */
export function viewIntoWindow(view, win, aspect) {
  const vh = REF_W / aspect;
  const cx = (win[0] + win[2] / 2 - 0.5) * REF_W, cy = (win[1] + win[3] / 2 - 0.5) * vh;
  const dz = Math.log2(Math.max(0.2, Math.min(win[2], win[3])));
  const z = Math.max(0, view.zoomRef + dz);
  const b = (view.bearing || 0) * D2R, tilt = Math.cos(clamp(view.pitch || 0, 0, 70) * D2R);
  const wx = cx * Math.cos(b) - (cy / tilt) * Math.sin(b), wy = cx * Math.sin(b) + (cy / tilt) * Math.cos(b);
  const p = mercPx(view.center, z);
  const c = unMerc([p[0] - wx, p[1] - wy], z);
  return { ...view, center: [r6(c[0]), r6(c[1])], zoomRef: +z.toFixed(3) };
}

const ICON_FOR = { traincrash: 'train', carcrash: 'car', shipcrash: 'ship', planecrash: 'plane', flood: 'flood', flashflood: 'flood', cyclone: 'storm', storm: 'storm', quake: 'quake', earthquake: 'quake', fire: 'fire', wildfire: 'fire', deforestation: 'forest', migration: 'migration' };
export const iconFor = (ev) => ICON_FOR[ev] || 'alert';
const DROP = new Set(['title', 'news', 'ttitle', 'mapcredits']);

/**
 * info: { ll, title, sub, kicker, tag, date, place, country, event, eventKey, assessment, coords, sources, accent, before, after, photos, thumbZoom }
 * Scene names decide the layout: Opening / Event / Before-after / Pre & post satellite → A, Map / Damage & analysis / Photos → B, End → end.
 */
export function applyBriefing(story, info, aspect = 16 / 9) {
  const mk = (layout, extra = {}) => ({
    id: `brief_${Math.random().toString(36).slice(2, 9)}`, kind: 'briefing', name: 'Briefing frame', visible: true, start: 0, duration: 1.2, hold: 0, anim: 'build',
    geom: info.ll ? { type: 'Point', coordinates: [r6(info.ll[0]), r6(info.ll[1])] } : null,
    style: { ...BR_DEFAULTS.briefing.style, layout, title: info.title || '', sub: info.sub || 'Geospatial analysis', kicker: info.kicker || 'Geospatial intelligence briefing', tag: info.tag || info.event || '', date: info.date || '', place: info.place || '', country: info.country || '', event: info.event || '', eventIcon: iconFor(info.eventKey), assessment: info.assessment || '', coords: info.coords || '', sources: info.sources || '', accent: info.accent || '#35c8ff', before: info.before || null, after: info.after || null, photos: [], thumbZoom: info.thumbZoom || 15, ...extra },
  });
  // before / after pictures the user gave (Auto video) show on every A-layout scene
  if (!info.before) for (const sc of story.scenes) { const c = sc.layers.find((l) => l.kind === 'compare'); if (c) { info.before = { media: c.style.media, date: c.style.labelA && c.style.labelA !== 'BEFORE' ? c.style.labelA : '' }; info.after = { media: c.style.media2, date: c.style.labelB && c.style.labelB !== 'AFTER' ? c.style.labelB : '' }; } }
  for (const sc of story.scenes) {
    const n = sc.name || '';
    let layout = /^end$/i.test(n) ? 'end' : /map|damage|analysis|photo|region|drive|selected/i.test(n) ? 'B' : 'A';
    const extra = {};
    if (/photo/i.test(n)) {
      const media = sc.layers.filter((l) => l.kind === 'photocard' && l.style?.media).map((l) => ({ id: l.style.media, name: l.style.title }));
      extra.photos = media;
      if (media.length) sc.layers = sc.layers.filter((l) => l.kind !== 'photocard');
    }
    if (/before|pre & post|satellite/i.test(n)) {
      // the map window shows the imagery itself; the panels show both dates
      for (const l of sc.layers) if (l.kind === 'timeseries') l.style.label = 'none';
    }
    sc.layers = sc.layers.filter((l) => !DROP.has(l.kind));
    if (sc.layers.some((l) => l.kind === 'tcallout' || l.kind === 'linecallout')) extra.windowTag = false;
    else for (const l of sc.layers) if (l.kind === 'point' && l.style?.label) l.style.label = ''; // the window tag names the place
    const lay = mk(layout, extra);
    const S = lay.style;
    const boxes = layoutBoxes(layout, aspect, !!(S.before || S.after || S.photos?.length));
    if (boxes.win && sc.camera?.keys?.length) sc.camera.keys = sc.camera.keys.map((key) => ({ ...key, view: viewIntoWindow(key.view, boxes.win, aspect) }));
    if (layout === 'end') { sc.look.grade = { preset: 'custom', brightness: 0.35, contrast: 1.1, saturation: 0.3, warmth: -0.3, fade: 0 }; }
    sc.layers.unshift(lay);
  }
  story.brand = { ...(story.brand || {}), lower: false };
  return story;
}

export { CUSTOM_POS };
