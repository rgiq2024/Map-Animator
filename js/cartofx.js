// Documentary map looks: category markers + legend, zoom insets with real imagery, country spotlight (vivid /
// grey inside / flag fill), locator mini-map, elevation profile + trail stats, range rings with aircraft,
// front line / territory control, top-down units, blast decals, incident dots and portrait badges.
import { placeAt, CUSTOM_POS } from './place.js';
import { drawMapCrop } from './vizfx.js';
import { imageFor } from './geoimage.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const D2R = Math.PI / 180;
const UI = '"Montserrat","Inter","Segoe UI",system-ui,sans-serif';
function hexA(hex, a) {
  const h = String(hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function hashStr(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
const haversine = (a, b) => { const dLat = (b[1] - a[1]) * D2R, dLng = (b[0] - a[0]) * D2R; const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.sin(dLng / 2) ** 2; return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(s))); };
const prog = (L, tm) => (tm.edit || L.anim === 'none' ? 1 : clamp(tm.tau / Math.max(0.1, +L.duration || 1), 0, 1));
const parseLL = (s) => { const m = String(s || '').match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/); return m ? [+m[1], +m[2]] : null; };
const polysOf = (g) => (g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []);
const linesOf = (g) => (g?.type === 'LineString' ? [g.coordinates] : g?.type === 'MultiLineString' ? g.coordinates : []);
function inRing(x, y, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) c = !c; } return c; }
function inPolys(ll, polys) { for (const p of polys) { if (!inRing(ll[0], ll[1], p[0])) continue; let hole = false; for (let k = 1; k < p.length; k++) if (inRing(ll[0], ll[1], p[k])) { hole = true; break; } if (!hole) return true; } return false; }
function bboxOf(polys) { let w = 180, s = 90, e = -180, n = -90; for (const p of polys) for (const [x, y] of p[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); } return [w, s, e, n]; }
/** Area-weighted centroid of the biggest polygon (label spot). */
function labelPoint(polys) {
  let best = null, ba = 0;
  for (const p of polys) {
    const r = p[0]; let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f; }
    if (Math.abs(a) > ba) { ba = Math.abs(a); best = [cx / (3 * a), cy / (3 * a)]; }
  }
  return best;
}
const pathPolys = (ctx, polys, proj) => {
  for (const p of polys) for (const ring of p) { ring.forEach((ll, i) => { const q = proj(ll); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); }
};
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

// ---------------------------------------------------------------- async loads (tiles, countries, elevation)
let lastMap = null;
const pending = new Set();
const track = (p) => { pending.add(p); p.finally(() => { pending.delete(p); lastMap?.triggerRepaint?.(); }); return p; };
/** Resolves when every tile / elevation / country load started so far has finished (used before export frames). */
export async function cartoReady(maxMs = 8000) {
  const t0 = performance.now();
  while (pending.size && performance.now() - t0 < maxMs) await Promise.race([...pending, new Promise((r) => setTimeout(r, 200))]);
}
// countries (Natural Earth 1:50m via world-atlas, public domain), decoded from TopoJSON on first use
let COUNTRIES = null, countriesP = null;
function loadCountries() {
  if (COUNTRIES || countriesP) return COUNTRIES;
  countriesP = track(fetch(new URL('../assets/geo/countries-50m.json', import.meta.url)).then((r) => r.json()).then((topo) => {
    const { scale, translate } = topo.transform;
    const arcs = topo.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; }); });
    const arc = (i) => (i >= 0 ? arcs[i] : arcs[~i].slice().reverse());
    const ring = (ids) => { const out = []; ids.forEach((i, k) => { const a = arc(i); out.push(...(k ? a.slice(1) : a)); }); return out; };
    COUNTRIES = topo.objects.countries.geometries.map((g) => {
      const polys = g.type === 'Polygon' ? [g.arcs.map(ring)] : g.type === 'MultiPolygon' ? g.arcs.map((p) => p.map(ring)) : [];
      return { name: g.properties?.name || '', polys, bbox: bboxOf(polys) };
    }).filter((c) => c.polys.length);
  }).catch(() => { COUNTRIES = []; }));
  return null;
}
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const ALIASES = { usa: 'united states of america', 'united states': 'united states of america', us: 'united states of america', uk: 'united kingdom', britain: 'united kingdom', uae: 'united arab emirates', 'czech republic': 'czechia', 'south korea': 'south korea', 'north korea': 'north korea', drc: 'dem rep congo', 'ivory coast': 'cote d ivoire', burma: 'myanmar', holland: 'netherlands', 'bosnia': 'bosnia and herz' };
export const GROUPS = {
  ussr: 'Russia, Ukraine, Belarus, Moldova, Lithuania, Latvia, Estonia, Georgia, Armenia, Azerbaijan, Kazakhstan, Uzbekistan, Turkmenistan, Kyrgyzstan, Tajikistan',
  eu: 'Austria, Belgium, Bulgaria, Croatia, Cyprus, Czechia, Denmark, Estonia, Finland, France, Germany, Greece, Hungary, Ireland, Italy, Latvia, Lithuania, Luxembourg, Malta, Netherlands, Poland, Portugal, Romania, Slovakia, Slovenia, Spain, Sweden',
  gcc: 'Saudi Arabia, United Arab Emirates, Qatar, Kuwait, Bahrain, Oman',
  nato: 'Albania, Belgium, Bulgaria, Canada, Croatia, Czechia, Denmark, Estonia, Finland, France, Germany, Greece, Hungary, Iceland, Italy, Latvia, Lithuania, Luxembourg, Montenegro, Netherlands, North Macedonia, Norway, Poland, Portugal, Romania, Slovakia, Slovenia, Spain, Sweden, Turkey, United Kingdom, United States of America',
};
/** Country polygons by name (comma-separated; a group name like "USSR" works). null while loading. */
export function countriesByName(names) {
  const C = loadCountries();
  if (!C) return null;
  let list = String(names || '').split(/\s*[,;\n]\s*/).filter(Boolean);
  list = list.flatMap((n) => (GROUPS[norm(n)] ? GROUPS[norm(n)].split(/\s*,\s*/) : [n]));
  const out = [];
  for (const n of list) {
    const k = ALIASES[norm(n)] || norm(n);
    const c = C.find((x) => norm(x.name) === k) || C.find((x) => norm(x.name).startsWith(k)) || C.find((x) => k.length > 3 && norm(x.name).includes(k));
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}
export function countryAt(ll) {
  const C = loadCountries();
  if (!C || !ll) return null;
  return C.find((c) => ll[0] >= c.bbox[0] && ll[0] <= c.bbox[2] && ll[1] >= c.bbox[1] && ll[1] <= c.bbox[3] && inPolys(ll, c.polys)) || null;
}
export function countryNames() { const C = loadCountries(); return C ? C.map((c) => c.name).sort() : []; }

// raster tiles for insets
const TILE_SRC = {
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  streets: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
  topo: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
  dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  light: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
};
const tiles = new Map();
function tile(src, z, x, y) {
  const n = 2 ** z; x = ((x % n) + n) % n;
  if (y < 0 || y >= n) return null;
  const url = (TILE_SRC[src] || TILE_SRC.satellite).replace('{z}', z).replace('{x}', x).replace('{y}', y);
  let t = tiles.get(url);
  if (!t) {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
    t = { img, ready: false };
    tiles.set(url, t);
    track(new Promise((res) => { img.onload = () => { t.ready = true; res(); }; img.onerror = () => res(); img.src = url; }));
    if (tiles.size > 900) tiles.delete(tiles.keys().next().value);
  }
  return t.ready ? t.img : null;
}
const merc = ([lng, lat]) => { const s = Math.sin(clamp(lat, -85.05, 85.05) * D2R); return [(lng + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)]; };
/** Draws web-map tiles of a place at zoom z into a box. Returns a function lng/lat → box pixel. */
function drawTiles(g, src, center, z, x, y, w, h) {
  const zi = clamp(Math.floor(z), 1, 19), k = 2 ** (z - zi), ts = 256 * k;
  const [mx, my] = merc(center);
  const n = 2 ** zi;
  const cx = mx * n * 256 * k, cy = my * n * 256 * k; // centre in px at z
  const x0 = cx - w / 2, y0 = cy - h / 2;
  const tx0 = Math.floor(x0 / ts), tx1 = Math.floor((x0 + w) / ts), ty0 = Math.floor(y0 / ts), ty1 = Math.floor((y0 + h) / ts);
  for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
    const im = tile(src, zi, tx, ty);
    if (im) g.drawImage(im, x + tx * ts - x0, y + ty * ts - y0, ts + 0.5, ts + 0.5);
    else { g.fillStyle = '#1c2026'; g.fillRect(x + tx * ts - x0, y + ty * ts - y0, ts, ts); }
  }
  return (ll) => { const [ax, ay] = merc(ll); return [x + ax * n * 256 * k - x0, y + ay * n * 256 * k - y0]; };
}

// elevation along a line (Terrarium DEM tiles, AWS open data)
const demTiles = new Map();
let DEMC = null;
function demTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  let t = demTiles.get(key);
  if (!t) {
    t = { data: null, done: false };
    demTiles.set(key, t);
    track(fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${key}.png`).then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? createImageBitmap(b) : null)).then((bmp) => {
      if (!bmp) return;
      DEMC ||= typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
      const g = DEMC.getContext('2d', { willReadFrequently: true });
      g.clearRect(0, 0, 256, 256); g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, 256, 256).data;
      const e = new Float32Array(65536);
      for (let i = 0; i < 65536; i++) e[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
      t.data = e;
    }).catch(() => {}).finally(() => { t.done = true; }));
  }
  return t;
}
const profiles = new Map();
/** { d: [m], e: [m], total, gain, loss, ready } for a line, sampled at n points. */
function profileOf(cs, n = 160) {
  const key = `${cs.length}|${cs[0]}|${cs.at(-1)}|${cs[cs.length >> 1]}`;
  let P = profiles.get(key);
  if (P?.ready) return P;
  const cum = [0];
  for (let i = 1; i < cs.length; i++) cum.push(cum[i - 1] + haversine(cs[i - 1], cs[i]));
  const total = cum.at(-1) || 1;
  const z = total > 300000 ? 8 : total > 80000 ? 10 : total > 15000 ? 11 : 12;
  const pts = [];
  for (let k = 0; k < n; k++) {
    const d = (k / (n - 1)) * total;
    let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
    const u = (d - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    pts.push([cs[i - 1][0] + (cs[i][0] - cs[i - 1][0]) * u, cs[i - 1][1] + (cs[i][1] - cs[i - 1][1]) * u, d]);
  }
  const e = []; let ok = true;
  for (const [lng, lat] of pts) {
    const [mx, my] = merc([lng, lat]); const N = 2 ** z;
    const tx = Math.floor(mx * N), ty = Math.floor(my * N);
    const t = demTile(z, tx, ty);
    if (!t.done) { ok = false; e.push(0); continue; }
    if (!t.data) { e.push(0); continue; }
    const px = clamp(Math.floor((mx * N - tx) * 256), 0, 255), py = clamp(Math.floor((my * N - ty) * 256), 0, 255);
    e.push(Math.max(-50, t.data[py * 256 + px]));
  }
  // light smoothing then gain / loss
  const sm = e.map((v, i) => (e[Math.max(0, i - 1)] + v * 2 + e[Math.min(e.length - 1, i + 1)]) / 4);
  let gain = 0, loss = 0;
  for (let i = 1; i < sm.length; i++) { const dv = sm[i] - sm[i - 1]; if (dv > 0) gain += dv; else loss -= dv; }
  P = { d: pts.map((p) => p[2]), e: sm, total, gain, loss, ready: ok, min: Math.min(...sm), max: Math.max(...sm) };
  profiles.set(key, P);
  return P;
}

// ---------------------------------------------------------------- target geometry helpers
/** Line coordinates + progress (0..1) of a target: 'route', or a line layer id. */
function lineTarget(ref, o, t) {
  if (!ref || ref === 'route') {
    const legs = o.model?.drawable || [];
    const cs = legs.flatMap((l, i) => (i ? l.m.coords.slice(1) : l.m.coords));
    if (cs.length < 2) return null;
    let u = 1;
    if (t != null && o.model?.stateAt) { const st = o.model.stateAt(t); u = o.model.routeLen ? clamp(st.drawn / o.model.routeLen, 0, 1) : 1; }
    return { cs, u };
  }
  const L = (o.scene?.layers || []).find((x) => x.id === ref);
  const cs = linesOf(L?.geom)[0];
  if (!cs || cs.length < 2) return null;
  let u = 1;
  if (t != null && L.anim !== 'none') { const D = Math.max(0.1, +L.duration || 1); u = clamp((t - (+L.start || 0)) / D, 0, 1); }
  return { cs, u };
}
function polyTarget(L, o) {
  const s = L.style;
  if (s.source === 'countries') { const c = countriesByName(s.countries); return c ? c.map((x) => x.polys) : null; }
  if (s.source === 'layer' && s.ref) { const T = (o.scene?.layers || []).find((x) => x.id === s.ref); const p = polysOf(T?.geom); return p.length ? p.map((q) => [q]) : []; }
  const p = polysOf(L.geom);
  return p.length ? [p] : [];
}
/** Point along a line (fraction u) with heading in degrees (screen-ish, north = 0). */
function alongLine(cs, u) {
  const cum = [0];
  for (let i = 1; i < cs.length; i++) cum.push(cum[i - 1] + haversine(cs[i - 1], cs[i]));
  const d = clamp(u, 0, 1) * (cum.at(-1) || 0);
  let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
  const f = (d - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
  const a = cs[i - 1], b = cs[i];
  return { ll: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], i, cum };
}

// ---------------------------------------------------------------- registry
const POS = { 'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right', ...CUSTOM_POS };
export const CF_KINDS = {
  catmarkers: { name: 'Category markers + legend', icon: '▲', geom: null, desc: 'Places as circles, triangles, squares or diamonds by category, with a legend (e.g. 12-inch fab, 8-inch fab, backend)' },
  inset: { name: 'Zoom inset (real imagery)', icon: '⧉', geom: 'point', desc: 'A box showing a close-up of a place in real satellite imagery, with a leader line to a small square on the map' },
  spotlight: { name: 'Country spotlight', icon: '◍', geom: null, desc: 'A country or region in full colour with the rest of the world grey and dark, a white outline, big name and city tags — or grey inside, or a colour / flag fill' },
  locator: { name: 'Locator mini-map', icon: '🗺', geom: null, desc: 'A small silhouette of the country with a box showing where the main map is' },
  elevprofile: { name: 'Elevation profile + trail stats', icon: '⛰', geom: null, desc: 'The real elevation along the route, growing as it is travelled, with a distance counter, total climb / descent and a glowing trail' },
  rangerings: { name: 'Range rings', icon: '◎', geom: 'point', desc: 'Dotted rings at real distances from a base, with aircraft (or any) silhouettes and range labels' },
  territory: { name: 'Front line / territory', icon: '▧', geom: 'polygon', desc: 'An area under control with a ragged, patchy frontier that advances across the map' },
  units: { name: 'Top-down units', icon: '⛟', geom: 'line', desc: 'Tanks, trucks, artillery, jets or ships seen from above, driving in a column along a path' },
  blast: { name: 'Blast decal', icon: '✸', geom: 'point', desc: 'A top-down explosion: flash, black burst, smoke and a scorch mark that stays' },
  eventdots: { name: 'Incident dots / heat', icon: '⁘', geom: null, desc: 'Clusters of red incident dots with a heat glow appearing over an area' },
  portrait: { name: 'Portrait badge', icon: '⯃', geom: 'point', desc: 'A framed photo (octagon, circle, shield) with a name plate pinned to a place' },
};
export const CF_ANIMS = {
  catmarkers: { pop: 'Pop in one by one', fade: 'Fade in', none: 'Shown' },
  inset: { open: 'Line draws, box opens', fade: 'Fade in', none: 'Shown' },
  spotlight: { fade: 'Fade in', draw: 'Trace the outline, then colour', none: 'Shown' },
  locator: { slide: 'Slide in', fade: 'Fade in', none: 'Shown' },
  elevprofile: { follow: 'Grows with the route', draw: 'Draws over its own time', none: 'Whole profile' },
  rangerings: { expand: 'Rings expand one by one', fade: 'Fade in', none: 'Shown' },
  territory: { advance: 'Front advances', grow: 'Grows from the centre', fade: 'Fade in', none: 'Shown' },
  units: { drive: 'Drive along the path', none: 'Parked at the start' },
  blast: { explode: 'Explode', none: 'Scorch mark only' },
  eventdots: { appear: 'Dots appear over time', sweep: 'Sweep across', none: 'All shown' },
  portrait: { pop: 'Pop in', fade: 'Fade in', none: 'Shown' },
};
export const CF_DEFAULTS = {
  catmarkers: { anim: 'pop', duration: 2.5, style: {
    cats: '12-inch Fab | circle | #f07a22\n8-inch Fab | circle | #18a6b8\n6-inch Fab | circle | #dce7f2\nAdvanced Backend | triangle | #ffffff',
    places: '12-inch Fab | 120.99, 24.78 | Hsinchu\n12-inch Fab | 120.62, 24.21 | Taichung\nAdvanced Backend | 120.64, 24.215\n12-inch Fab | 120.28, 23.11 | Tainan\nAdvanced Backend | 121.0, 24.88\nAdvanced Backend | 120.95, 24.68',
    size: 1, legend: true, legendPos: 'top-left', labels: false, outline: true, legendSize: 1,
  } },
  inset: { anim: 'open', duration: 1.4, style: { src: 'satellite', zoom: 14.5, gray: true, boxSize: 1, side: 'left', aspect: 1.15, frame: '#ffffff', square: true, markers: true, title: '', dim: 0.15 } },
  spotlight: { anim: 'fade', duration: 1.6, style: {
    source: 'countries', countries: 'Austria', ref: '', mode: 'vivid', gray: 0.85, dark: 0.55, glow: true, outline: '#ffffff', width: 1.4,
    fill: '#c8102e', fill2: '#2140ff', split: 0.45, splitDir: 'we', relief: 0.45, cityStyle: 'tag', fillOpacity: 0.85, media: '', emblemSize: 0.45, inner: true, label: 'AUSTRIA', labelSize: 1, cities: 'Vienna | 16.37, 48.21', labelPos: 'center',
  } },
  locator: { anim: 'slide', duration: 0.8, style: { country: '', fill: '#ff8a3d', box: '#ffffff', route: true, size: 1, position: 'top-right', shadow: true } },
  elevprofile: { anim: 'follow', duration: 10, style: {
    target: 'route', look: 'bottom', color: '#ff8a3d', trail: true, trailColor: '#ff4d3d', icon: 'hiker', title: '', units: 'both', stats: true, counter: true, height: 1, ghost: true,
  } },
  rangerings: { anim: 'expand', duration: 4, style: {
    rings: 'Spitfire | 175 | mi | fighter\nThunderbolt | 230 | mi | fighter\nThunderbolt (with belly tank) | 375 | mi | fighter\nP-38 Lightning | 520 | mi | twinboom\nP-51 Mustang | 600 | mi | fighter',
    color: '#111111', dash: true, width: 1.4, iconSize: 1, labelSize: 1, base: true, angle: 40, spread: 38, iconColor: '#000000', labelColor: '#1a1a1a',
  } },
  territory: { anim: 'advance', duration: 5, style: { color: '#c8202a', opacity: 0.8, rough: 1, fringe: true, patches: true, dir: 'E', blend: 'multiply', outline: false } },
  units: { anim: 'drive', duration: 8, style: { type: 'tank', count: 4, spacing: 1, size: 1.6, color: '#4c5a2b', formation: 'column', dust: true, shadow: true } },
  blast: { anim: 'explode', duration: 2.4, style: { size: 1, color: '#101010', smoke: true, scorch: true, flash: true } },
  eventdots: { anim: 'appear', duration: 6, style: { source: 'layer', ref: '', countries: '', count: 260, clusters: 9, color: '#e0141e', heat: true, heatOpacity: 0.45, dotSize: 1, seed: 1, dir: 'E' } },
  portrait: { anim: 'pop', duration: 0.8, style: { media: '', shape: 'octagon', name: 'NAME', ring: '#2a0d0d', plate: '#0e0e0e', size: 1, dx: 60, dy: -70, leader: false, tint: 0.35, tintColor: '#c8202a' } },
};
const isMode = (...m) => (L) => m.includes(L.style.mode);
export const CF_FORMS = {
  catmarkers: [
    ['style.cats', 'Categories — “Label | circle / triangle / square / diamond / star / nuclear | colour”', 'textarea'],
    ['style.places', 'Places — “Category | longitude, latitude | name (optional)”, one per line', 'cities', 'places'],
    ['style.size', 'Marker size', 'range', [0.4, 3, 0.05]], ['style.outline', 'White outline', 'switch'], ['style.labels', 'Show names', 'switch'],
    ['style.legend', 'Legend', 'switch'], ['style.legendPos', 'Legend position', 'select', POS, (L) => L.style.legend !== false], ['style.legendSize', 'Legend size', 'range', [0.5, 2.5, 0.05], (L) => L.style.legend !== false],
  ],
  inset: [
    ['style.src', 'Imagery', 'select', { satellite: 'Satellite (Esri World Imagery)', streets: 'Streets', topo: 'Topographic', dark: 'Dark grey canvas', light: 'Light grey canvas' }],
    ['style.zoom', 'Inset zoom', 'range', [3, 19, 0.1]], ['style.gray', 'Black & white', 'switch'], ['style.dim', 'Darken', 'range', [0, 0.8, 0.02]],
    ['style.boxSize', 'Box size', 'range', [0.4, 2.5, 0.02]], ['style.aspect', 'Box shape (width ÷ height)', 'range', [0.5, 2.5, 0.05]],
    ['style.side', 'Box goes', 'select', { left: 'Left of the place', right: 'Right', below: 'Below', above: 'Above' }],
    ['style.frame', 'Frame colour', 'color'], ['style.square', 'Small square on the map', 'switch'], ['style.markers', 'Show category markers inside', 'switch'], ['style.title', 'Caption under the box', 'text'],
  ],
  spotlight: [
    ['style.source', 'Area', 'select', { countries: 'Countries by name', layer: 'A boundary / area layer' }],
    ['style.countries', 'Countries (pick, or type several: Russia, Belarus — groups: USSR, EU, GCC, NATO)', 'countries', null, (L) => L.style.source === 'countries'],
    ['style.ref', 'Layer', 'layerref', 'polygon', (L) => L.style.source === 'layer'],
    ['style.mode', 'Look', 'select', { vivid: 'Country in colour, rest grey & dark (Austria)', grayin: 'Grey & bright inside, colour outside (Paris)', fill: 'Colour fill (USSR)', image: 'Picture / flag fills the country', twotone: 'Two colours across it (Iran red / blue)', neon: 'Neon glow outline, world darker', tint: 'Colour tint inside', outline: 'Outline only' }],
    ['style.gray', 'Grey outside / inside', 'range', [0, 1, 0.02], isMode('vivid', 'grayin')], ['style.dark', 'Darken', 'range', [0, 0.9, 0.02], isMode('vivid', 'grayin')],
    ['style.fill', 'Colour', 'color', null, isMode('fill', 'tint', 'twotone', 'neon')], ['style.fill2', 'Second colour', 'color', null, isMode('twotone')],
    ['style.split', 'Where the colours meet', 'range', [0.1, 0.9, 0.01], isMode('twotone')], ['style.splitDir', 'Split direction', 'select', { we: 'West | East', ns: 'North | South', diag: 'Diagonal' }, isMode('twotone')],
    ['style.fillOpacity', 'Fill strength', 'range', [0.1, 1, 0.02], isMode('fill', 'tint', 'image', 'twotone')],
    ['style.media', 'Picture (flag, photo, texture)', 'image', null, isMode('fill', 'tint', 'image')], ['style.emblemSize', 'Emblem size', 'range', [0.1, 1.2, 0.02], (L) => isMode('fill', 'tint')(L) && L.style.media],
    ['style.relief', 'Map relief shows through', 'range', [0, 1, 0.02], isMode('image', 'twotone', 'fill')],
    ['style.dark', 'Darken the world outside', 'range', [0, 0.9, 0.02], isMode('neon', 'image', 'fill', 'twotone')],
    ['style.outline', 'Outline colour', 'color'], ['style.width', 'Outline width', 'range', [0, 6, 0.1]], ['style.glow', 'Outline glow', 'switch'], ['style.inner', 'Inner borders (between countries / parts)', 'switch'],
    ['style.label', 'Big name', 'text'], ['style.labelSize', 'Name size', 'range', [0.3, 3, 0.05]], ['style.labelBox', 'Name in a box (Switzerland)', 'switch'], ['style.labelPos', 'Name position', 'select', { center: 'Middle of the area', ...CUSTOM_POS }],
    ['style.cities', 'City tags — “Name | longitude, latitude” (start with * for a capital)', 'cities'],
    ['style.cityStyle', 'City look', 'select', { tag: 'Black tag (Austria)', dots: 'Dot + bold name (Switzerland)', plain: 'White name' }],
  ],
  locator: [
    ['style.country', 'Country (empty = the one under the map centre)', 'countries', 'one'], ['style.fill', 'Silhouette colour', 'color'], ['style.box', 'View box colour', 'color'],
    ['style.route', 'Draw the route on it', 'switch'], ['style.size', 'Size', 'range', [0.4, 2.5, 0.05]], ['style.position', 'Position', 'select', POS], ['style.shadow', 'Shadow', 'switch'],
  ],
  elevprofile: [
    ['style.target', 'Line', 'layerref', 'line'],
    ['style.look', 'Look', 'select', { bottom: 'Wide profile along the bottom (Alpes)', corner: 'Corner: icon, mini profile, distance (Kosovo)', both: 'Both' }],
    ['style.title', 'Title (e.g. La route des Grandes Alpes — {km})', 'text'],
    ['style.color', 'Profile colour', 'color'], ['style.ghost', 'Rest of the profile faint', 'switch'], ['style.height', 'Profile height', 'range', [0.4, 2.5, 0.05]],
    ['style.icon', 'Icon', 'select', { hiker: 'Hiker', runner: 'Runner', cyclist: 'Cyclist', car: 'Car', none: 'None' }, (L) => L.style.look !== 'bottom'],
    ['style.counter', 'Distance counter', 'switch'], ['style.units', 'Units', 'select', { both: 'km and mi', km: 'km', mi: 'mi' }],
    ['style.stats', 'Totals (distance, climb, descent)', 'switch'],
    ['style.trail', 'Glowing trail on the map', 'switch'], ['style.trailColor', 'Trail colour', 'color', null, (L) => L.style.trail !== false],
  ],
  rangerings: [
    ['style.rings', 'Rings — “Name | range | mi / km / nm | fighter / twinboom / bomber / stealth / jet / heli / missile / none”', 'textarea'],
    ['style.color', 'Ring colour', 'color'], ['style.dash', 'Dotted', 'switch'], ['style.width', 'Ring width', 'range', [0.5, 5, 0.1]],
    ['style.iconColor', 'Silhouette colour', 'color'], ['style.iconSize', 'Silhouette size', 'range', [0.3, 3, 0.05]], ['style.labelColor', 'Label colour', 'color'], ['style.labelSize', 'Label size', 'range', [0.5, 2.5, 0.05]],
    ['style.angle', 'Where the first silhouette sits (degrees)', 'range', [0, 360, 1]], ['style.spread', 'Spacing between silhouettes (degrees)', 'range', [0, 90, 1]], ['style.base', 'Base marker', 'switch'],
  ],
  territory: [
    ['style.color', 'Colour', 'color'], ['style.opacity', 'Strength', 'range', [0.1, 1, 0.02]], ['style.blend', 'Blend', 'select', { multiply: 'Multiply (map shows through)', normal: 'Normal' }],
    ['style.rough', 'Ragged edge', 'range', [0, 3, 0.05]], ['style.fringe', 'Lighter frontier band', 'switch'], ['style.patches', 'Patches ahead of the front', 'switch'],
    ['style.dir', 'Advances towards', 'select', { E: 'East', W: 'West', N: 'North', S: 'South', NE: 'North-east', NW: 'North-west', SE: 'South-east', SW: 'South-west' }, (L) => L.anim === 'advance'],
    ['style.outline', 'Outline', 'switch'],
  ],
  units: [
    ['style.type', 'Unit', 'select', { tank: 'Tank', apc: 'Armoured carrier', truck: 'Truck', artillery: 'Artillery', jeep: 'Jeep', jet: 'Fighter jet', bomber: 'Bomber', stealth: 'Stealth bomber (flying wing)', heli: 'Helicopter', ship: 'Warship' }],
    ['style.count', 'How many', 'range', [1, 16, 1]], ['style.formation', 'Formation', 'select', { column: 'Column (one behind another)', pairs: 'Pairs', wedge: 'Wedge' }],
    ['style.spacing', 'Spacing', 'range', [0.4, 3, 0.05]], ['style.size', 'Size', 'range', [0.3, 3, 0.05]], ['style.color', 'Colour', 'color'],
    ['style.dust', 'Dust / exhaust', 'switch'], ['style.shadow', 'Shadow', 'switch'],
  ],
  blast: [['style.size', 'Size', 'range', [0.3, 4, 0.05]], ['style.color', 'Burst colour', 'color'], ['style.flash', 'Flash', 'switch'], ['style.smoke', 'Smoke', 'switch'], ['style.scorch', 'Scorch mark stays', 'switch']],
  eventdots: [
    ['style.source', 'Area', 'select', { layer: 'A boundary / area layer', countries: 'Countries by name' }],
    ['style.ref', 'Layer', 'layerref', 'polygon', (L) => L.style.source !== 'countries'], ['style.countries', 'Countries', 'countries', null, (L) => L.style.source === 'countries'],
    ['style.count', 'Dots', 'range', [20, 1500, 10]], ['style.clusters', 'Clusters', 'range', [1, 40, 1]], ['style.seed', 'Pattern', 'range', [1, 50, 1]],
    ['style.color', 'Colour', 'color'], ['style.dotSize', 'Dot size', 'range', [0.3, 3, 0.05]], ['style.heat', 'Heat glow', 'switch'], ['style.heatOpacity', 'Heat strength', 'range', [0.05, 1, 0.02], (L) => L.style.heat !== false],
    ['style.dir', 'Sweeps towards', 'select', { E: 'East', W: 'West', N: 'North', S: 'South' }, (L) => L.anim === 'sweep'],
  ],
  portrait: [
    ['style.media', 'Photo', 'image'], ['style.name', 'Name plate', 'text'], ['style.shape', 'Frame', 'select', { octagon: 'Octagon', circle: 'Circle', bubble: 'Glass bubble (Venezuela)', square: 'Square', shield: 'Shield' }],
    ['style.ring', 'Frame colour', 'color'], ['style.plate', 'Plate colour', 'color'], ['style.tint', 'Colour tint on the photo', 'range', [0, 1, 0.02]], ['style.tintColor', 'Tint colour', 'color', null, (L) => +L.style.tint > 0],
    ['style.size', 'Size', 'range', [0.3, 3, 0.05]], ['style.leader', 'Line to the place', 'switch'], ['style.dx', 'Offset right (px)', 'range', [-400, 400, 1], (L) => L.style.leader], ['style.dy', 'Offset down (px)', 'range', [-400, 400, 1], (L) => L.style.leader],
  ],
};
export const CF_SET = new Set(Object.keys(CF_KINDS));
export function cfPhases(k) {
  return { catmarkers: ['above', 'captions'], inset: ['captions'], spotlight: ['below', 'above'], locator: ['captions'], elevprofile: ['above', 'captions'], rangerings: ['above'], territory: ['below'], units: ['above'], blast: ['above'], eventdots: ['below', 'above'], portrait: ['above'] }[k] || ['above'];
}

// ================================================================= shared symbols
function symbolPath(ctx, shape, x, y, r) {
  ctx.beginPath();
  if (shape === 'triangle') { ctx.moveTo(x, y - r * 1.15); ctx.lineTo(x + r * 1.05, y + r * 0.72); ctx.lineTo(x - r * 1.05, y + r * 0.72); ctx.closePath(); }
  else if (shape === 'square') ctx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
  else if (shape === 'diamond') { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 1.2, y); ctx.lineTo(x, y + r * 1.2); ctx.lineTo(x - r * 1.2, y); ctx.closePath(); }
  else if (shape === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr0 = i % 2 ? r * 0.5 : r * 1.25; const px = x + Math.cos(a) * rr0, py = y + Math.sin(a) * rr0; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); }
  else ctx.arc(x, y, r, 0, Math.PI * 2);
}
function drawSymbol(ctx, shape, x, y, r, color, outline, unit) {
  ctx.save();
  if (shape === 'nuclear') {
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 5 * unit;
    ctx.fillStyle = color || '#f5c518'; ctx.beginPath(); ctx.arc(x, y, r * 1.25, 0, 7); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#7a5a00'; ctx.lineWidth = r * 0.12; ctx.stroke();
    ctx.fillStyle = '#111';
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r * 1.0, a - 0.52, a + 0.52); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = color || '#f5c518'; ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, 7); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x, y, r * 0.18, 0, 7); ctx.fill();
    ctx.restore(); return;
  }
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 4 * unit; ctx.shadowOffsetY = 1 * unit;
  symbolPath(ctx, shape, x, y, r);
  ctx.fillStyle = color; ctx.fill();
  ctx.shadowColor = 'transparent';
  if (outline) { ctx.lineWidth = Math.max(1, r * 0.28); ctx.strokeStyle = '#ffffff'; ctx.stroke(); }
  ctx.restore();
}
function parseCats(s) {
  const cats = new Map();
  String(s.cats || '').split('\n').forEach((ln) => { const [label, shape, color] = ln.split('|').map((v) => v.trim()); if (label) cats.set(label.toLowerCase(), { label, shape: (shape || 'circle').toLowerCase(), color: color || '#f07a22' }); });
  const places = [];
  String(s.places || '').split('\n').forEach((ln) => { const p = ln.split('|').map((v) => v.trim()); const ll = parseLL(p[1]); if (p[0] && ll) places.push({ cat: cats.get(p[0].toLowerCase()) || { label: p[0], shape: 'circle', color: '#f07a22' }, ll, name: p[2] || '' }); });
  return { cats: [...cats.values()], places };
}

// ================================================================= category markers + legend
function drawCatMarkers(ctx, L, tm, o, phase) {
  const s = L.style, unit = o.unit, fr = o.frame;
  const { cats, places } = parseCats(s);
  const u = prog(L, tm);
  if (phase === 'above') {
    const r = 6.5 * unit * (+s.size || 1);
    places.forEach((p, i) => {
      let k = 1;
      if (!tm.edit && L.anim === 'pop') { const a = clamp((u * (places.length + 2) - i) / 2, 0, 1); k = a < 1 ? easeOut(a) * (1 + 0.25 * Math.sin(a * Math.PI)) : 1; }
      else if (!tm.edit && L.anim === 'fade') k = u;
      if (k <= 0) return;
      const q = o.proj(p.ll);
      if (!isFinite(q[0])) return;
      ctx.save(); ctx.globalAlpha *= tm.alpha * clamp(k * 2, 0, 1);
      drawSymbol(ctx, p.cat.shape, q[0], q[1], r * Math.max(0.05, k), p.cat.color, s.outline !== false, unit);
      if (s.labels && p.name) { ctx.font = `600 ${11 * unit}px ${UI}`; ctx.textBaseline = 'middle'; ctx.lineWidth = 3 * unit; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(p.name, q[0] + r + 5 * unit, q[1]); ctx.fillStyle = '#fff'; ctx.fillText(p.name, q[0] + r + 5 * unit, q[1]); }
      ctx.restore();
    });
  } else if (phase === 'captions' && fr && s.legend !== false && cats.length) {
    const ls = +s.legendSize || 1, lu = unit * ls;
    const rowH = 27 * lu, fs = 16 * lu;
    ctx.font = `500 ${fs}px ${UI}`;
    const W = 34 * lu + Math.max(...cats.map((c) => ctx.measureText(c.label).width)), H = cats.length * rowH;
    const pos = s.legendPos || 'top-left', m = 40 * unit;
    const x = /right/.test(pos) ? fr.x + fr.w - m - W : fr.x + m, y = /bottom/.test(pos) ? fr.y + fr.h - m - H - 40 * unit : fr.y + m + 30 * unit;
    ctx.save();
    placeAt(ctx, L, fr, x, y, W, H, { key: 'legend' });
    ctx.globalAlpha *= tm.alpha * (tm.edit || L.anim === 'none' ? 1 : clamp(u * 3, 0, 1));
    cats.forEach((c, i) => {
      const cy = y + i * rowH + rowH / 2;
      drawSymbol(ctx, c.shape, x + 9 * lu, cy, 7 * lu, c.color, s.outline !== false && c.shape !== 'triangle', lu);
      ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4 * lu;
      ctx.fillText(c.label, x + 28 * lu, cy + 1 * lu);
      ctx.shadowColor = 'transparent';
    });
    ctx.restore();
  }
}

// ================================================================= zoom inset
function drawInset(ctx, L, tm, o) {
  const s = L.style, unit = o.unit, fr = o.frame;
  if (!fr || L.geom?.type !== 'Point') return;
  const ll = L.geom.coordinates;
  const p = o.proj(ll);
  const u = prog(L, tm);
  const kLine = tm.edit || L.anim === 'none' ? 1 : L.anim === 'fade' ? 1 : clamp(u / 0.4, 0, 1);
  const kBox = tm.edit || L.anim === 'none' ? 1 : L.anim === 'fade' ? u : easeOut(clamp((u - 0.35) / 0.65, 0, 1));
  const W = 300 * unit * (+s.boxSize || 1), H = W / (+s.aspect || 1.15);
  const gap = 110 * unit;
  let bx = p[0] - gap - W, by = p[1] - H / 2;
  if (s.side === 'right') bx = p[0] + gap;
  if (s.side === 'below') { bx = p[0] - W / 2; by = p[1] + gap; }
  if (s.side === 'above') { bx = p[0] - W / 2; by = p[1] - gap - H; }
  bx = clamp(bx, fr.x + 20 * unit, fr.x + fr.w - W - 20 * unit); by = clamp(by, fr.y + 20 * unit, fr.y + fr.h - H - 20 * unit);
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  const frame = s.frame || '#ffffff';
  // the little square on the map
  const sq = 7 * unit;
  if (s.square !== false) { ctx.fillStyle = frame; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1 * unit; ctx.fillRect(p[0] - sq, p[1] - sq, sq * 2, sq * 2); ctx.strokeRect(p[0] - sq, p[1] - sq, sq * 2, sq * 2); }
  // where the box really is (it can be dragged)
  const [dx, dy] = placeAt(ctx, L, fr, bx, by, W, H, { key: 'box' });
  ctx.translate(-dx, -dy);
  const X = bx + dx, Y = by + dy;
  // leader from the square to the nearest corner of the box
  const corners = [[X, Y], [X + W, Y], [X, Y + H], [X + W, Y + H]];
  const c = corners.reduce((a, b) => (Math.hypot(b[0] - p[0], b[1] - p[1]) < Math.hypot(a[0] - p[0], a[1] - p[1]) ? b : a));
  ctx.strokeStyle = frame; ctx.lineWidth = 1.8 * unit;
  ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + (c[0] - p[0]) * kLine, p[1] + (c[1] - p[1]) * kLine); ctx.stroke();
  if (kBox > 0.01) {
    const cx = X + W / 2, cy = Y + H / 2, bw = W * kBox, bh = H * kBox;
    const ox = c[0] + (X - c[0]) * kBox, oy = c[1] + (Y - c[1]) * kBox; // opens out of the corner
    const S = Math.max(1, Math.abs(ctx.getTransform().a) || 1);
    const [C, g] = off(`${L.id}:inset`, W * S, H * S);
    lastMap = o.map || lastMap;
    if (s.gray !== false) g.filter = 'grayscale(1) contrast(1.12)';
    const z = (+s.zoom || 14.5) + Math.log2((fr.w * S) / 1000);
    const to = drawTiles(g, s.src || 'satellite', ll, z, 0, 0, C.width, C.height);
    g.filter = 'none';
    if (+s.dim > 0) { g.fillStyle = `rgba(0,0,0,${+s.dim})`; g.fillRect(0, 0, C.width, C.height); }
    if (s.markers !== false) {
      for (const M of o.scene?.layers || []) {
        if (M.kind !== 'catmarkers' || M.hidden) continue;
        for (const pl of parseCats(M.style).places) {
          const q = to(pl.ll);
          if (q[0] < -20 || q[1] < -20 || q[0] > C.width + 20 || q[1] > C.height + 20) continue;
          drawSymbol(g, pl.cat.shape, q[0], q[1], 7.5 * unit * S * (+M.style.size || 1), pl.cat.color, M.style.outline !== false, unit * S);
        }
      }
    }
    void cx; void cy;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 18 * unit;
    ctx.fillStyle = '#000'; ctx.fillRect(ox, oy, bw, bh);
    ctx.shadowColor = 'transparent';
    ctx.drawImage(C, 0, 0, C.width, C.height, ox, oy, bw, bh);
    ctx.lineWidth = 2.6 * unit; ctx.strokeStyle = frame; ctx.strokeRect(ox, oy, bw, bh);
    ctx.restore();
    if (s.title && kBox > 0.95) {
      ctx.font = `600 ${13 * unit}px ${UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 4 * unit;
      ctx.fillText(s.title, X, Y + H + 8 * unit);
    }
  }
  ctx.restore();
}

// ================================================================= country spotlight
function spotPolys(L, o) {
  const groups = polyTarget(L, o);
  if (!groups) return null;
  return { groups, all: groups.flat() };
}
function drawSpotlight(ctx, L, tm, o, phase) {
  const s = L.style, unit = o.unit, fr = o.frame;
  const P = spotPolys(L, o);
  if (!P || !P.all.length || !fr) return;
  const u = prog(L, tm);
  const draw = L.anim === 'draw' && !tm.edit;
  const kFill = tm.edit || L.anim === 'none' ? 1 : draw ? clamp((u - 0.55) / 0.45, 0, 1) : ease(u);
  const kLine = tm.edit || L.anim === 'none' ? 1 : draw ? clamp(u / 0.6, 0, 1) : ease(u);
  const mode = s.mode || 'vivid';
  const proj = o.proj;
  if (phase === 'below') {
    if (kFill <= 0) return;
    ctx.save();
    ctx.globalAlpha *= tm.alpha * kFill;
    if (mode === 'vivid' || mode === 'grayin') {
      const S = Math.max(1, Math.abs(ctx.getTransform().a) || 1);
      const [C, g] = off(`${L.id}:spot`, fr.w * S, fr.h * S);
      if (drawMapCrop(g, o, fr.x, fr.y, fr.w, fr.h, 0, 0, C.width, C.height)) {
        g.globalCompositeOperation = 'saturation'; g.fillStyle = `rgba(128,128,128,${clamp(+s.gray, 0, 1)})`; g.fillRect(0, 0, C.width, C.height);
        g.globalCompositeOperation = 'source-over';
        if (mode === 'grayin') { g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(0, 0, C.width, C.height); }
        if (+s.dark > 0 && mode === 'vivid') { g.fillStyle = `rgba(4,6,10,${+s.dark})`; g.fillRect(0, 0, C.width, C.height); }
        // keep only outside (vivid) or inside (grayin)
        g.setTransform(S, 0, 0, S, -fr.x * S, -fr.y * S);
        g.beginPath(); pathPolys(g, P.all, proj);
        g.globalCompositeOperation = mode === 'vivid' ? 'destination-out' : 'destination-in';
        g.fillStyle = '#000'; g.fill('evenodd');
        g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over';
        if (mode === 'vivid') { // a little extra colour inside
          ctx.save(); ctx.beginPath(); pathPolys(ctx, P.all, proj); ctx.clip('evenodd');
          ctx.filter = 'saturate(1.35) contrast(1.06) brightness(1.04)';
          drawMapCrop(ctx, o, fr.x, fr.y, fr.w, fr.h, fr.x, fr.y, fr.w, fr.h);
          ctx.restore();
        }
        ctx.drawImage(C, 0, 0, C.width, C.height, fr.x, fr.y, fr.w, fr.h);
      }
    } else if (mode === 'image' || mode === 'twotone' || mode === 'neon') {
      if (+s.dark > 0) { ctx.save(); ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); pathPolys(ctx, P.all, proj); ctx.fillStyle = `rgba(0,0,0,${+s.dark})`; ctx.fill('evenodd'); ctx.restore(); }
      if (mode !== 'neon') {
        const [w0, s0, e0, n0] = bboxOf(P.all);
        const a = proj([w0, n0]), b = proj([e0, s0]);
        const bx = Math.min(a[0], b[0]), by = Math.min(a[1], b[1]), bw = Math.abs(b[0] - a[0]), bh = Math.abs(b[1] - a[1]);
        ctx.save(); ctx.beginPath(); pathPolys(ctx, P.all, proj); ctx.clip('evenodd');
        ctx.globalAlpha *= +s.fillOpacity || 0.9;
        if (mode === 'image') {
          const im = s.media && imageFor(s.media);
          if (im?.ready) { const k = Math.max(bw / im.w, bh / im.h); ctx.drawImage(im.bmp, bx + bw / 2 - (im.w * k) / 2, by + bh / 2 - (im.h * k) / 2, im.w * k, im.h * k); }
          else { ctx.fillStyle = hexA(s.fill || '#c8102e', 0.8); ctx.fillRect(bx, by, bw, bh); }
        } else {
          const sp = clamp(+s.split || 0.45, 0.05, 0.95);
          const gr = s.splitDir === 'ns' ? ctx.createLinearGradient(0, by, 0, by + bh) : s.splitDir === 'diag' ? ctx.createLinearGradient(bx, by, bx + bw, by + bh) : ctx.createLinearGradient(bx, 0, bx + bw, 0);
          gr.addColorStop(0, s.fill || '#e01818'); gr.addColorStop(Math.max(0, sp - 0.08), s.fill || '#e01818'); gr.addColorStop(Math.min(1, sp + 0.08), s.fill2 || '#2140ff'); gr.addColorStop(1, s.fill2 || '#2140ff');
          ctx.fillStyle = gr; ctx.globalCompositeOperation = 'color'; ctx.fillRect(bx, by, bw, bh);
          ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha *= 0.55; ctx.fillRect(bx, by, bw, bh);
          ctx.globalCompositeOperation = 'source-over';
        }
        if (+s.relief > 0 && mode === 'image') { ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = tm.alpha * kFill * clamp(+s.relief, 0, 1); drawMapCrop(ctx, o, fr.x, fr.y, fr.w, fr.h, fr.x, fr.y, fr.w, fr.h); ctx.globalCompositeOperation = 'source-over'; }
        // inner shadow along the border
        ctx.globalAlpha = tm.alpha * kFill * 0.55; ctx.filter = `blur(${8 * unit}px)`; ctx.strokeStyle = '#000'; ctx.lineWidth = 16 * unit;
        ctx.beginPath(); pathPolys(ctx, P.all, proj); ctx.stroke(); ctx.filter = 'none';
        ctx.restore();
      }
    } else if (mode === 'fill' || mode === 'tint') {
      const col = s.fill || '#c8102e';
      ctx.beginPath(); pathPolys(ctx, P.all, proj);
      if (mode === 'tint') { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha *= +s.fillOpacity || 0.6; ctx.fillStyle = col; ctx.fill('evenodd'); }
      else {
        const [w0, s0, e0, n0] = bboxOf(P.all);
        const a = proj([w0, n0]), b = proj([e0, s0]);
        const gr = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
        gr.addColorStop(0, hexA(col, 1)); gr.addColorStop(1, shade(col, -0.25));
        ctx.globalAlpha *= +s.fillOpacity || 0.85; ctx.fillStyle = gr; ctx.fill('evenodd');
        // relief shows through faintly
        ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = tm.alpha * kFill * 0.35;
        ctx.save(); ctx.clip('evenodd'); drawMapCrop(ctx, o, fr.x, fr.y, fr.w, fr.h, fr.x, fr.y, fr.w, fr.h); ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      const im = s.media && imageFor(s.media);
      if (im?.ready) {
        const [w0, s0, e0, n0] = bboxOf(P.all);
        const a = proj([w0, n0]), b = proj([e0, s0]);
        const sz = Math.min(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * (+s.emblemSize || 0.45);
        const c = proj(labelPoint(P.all) || [(w0 + e0) / 2, (s0 + n0) / 2]);
        const k = sz / Math.max(im.w, im.h);
        ctx.globalAlpha = tm.alpha * kFill;
        const [ex, ey] = placeAt(ctx, L, fr, c[0] - (im.w * k) / 2, c[1] - (im.h * k) / 2, im.w * k, im.h * k, { key: 'emblem' });
        ctx.drawImage(im.bmp, c[0] - (im.w * k) / 2, c[1] - (im.h * k) / 2, im.w * k, im.h * k);
        ctx.translate(-ex, -ey);
      }
    }
    ctx.restore();
    return;
  }
  // ---- above: outline, inner borders, big name, city tags
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  const w = (+s.width || 1.4) * unit;
  if (w > 0 && kLine > 0) {
    ctx.lineJoin = 'round';
    const col = mode === 'fill' ? shade(s.fill || '#c8102e', -0.35) : mode === 'neon' ? s.fill || '#39ff6a' : s.outline || '#ffffff';
    if (draw && kLine < 1) { ctx.setLineDash([4000 * unit * kLine, 1e6]); }
    if (mode === 'neon') { ctx.save(); ctx.filter = `blur(${5 * unit}px)`; ctx.strokeStyle = col; ctx.lineWidth = w * 4; for (const g of P.groups) { ctx.beginPath(); pathPolys(ctx, g, proj); ctx.stroke(); } ctx.restore(); }
    if (s.glow !== false) { ctx.shadowColor = hexA(mode === 'fill' ? s.fill : s.outline || '#fff', 0.85); ctx.shadowBlur = 8 * unit; }
    ctx.strokeStyle = col; ctx.lineWidth = w;
    for (const g of P.groups) { ctx.beginPath(); pathPolys(ctx, g, proj); ctx.stroke(); }
    ctx.shadowColor = 'transparent'; ctx.setLineDash([]);
    if (s.inner !== false && P.groups.length > 1 && kFill > 0) {
      ctx.globalAlpha = tm.alpha * kFill;
      ctx.strokeStyle = mode === 'fill' ? 'rgba(40,0,0,0.45)' : hexA(s.outline || '#fff', 0.85); ctx.lineWidth = Math.max(0.6, w * 0.55);
      for (const g of P.groups) { ctx.beginPath(); pathPolys(ctx, g, proj); ctx.stroke(); }
    }
    if (s.inner !== false && P.groups.length === 1 && P.all.length > 1 && mode === 'grayin') {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(0.8, w * 0.8);
      for (const poly of P.all) { ctx.beginPath(); pathPolys(ctx, [poly], proj); ctx.stroke(); }
    }
  }
  if (s.label && kFill > 0) {
    const lp = labelPoint(P.all);
    if (lp) {
      const q = proj(lp);
      const fs = 44 * unit * (+s.labelSize || 1);
      ctx.font = `800 ${fs}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (ctx.letterSpacing !== undefined) ctx.letterSpacing = `${fs * 0.04}px`;
      const tw = ctx.measureText(s.label).width;
      ctx.save();
      if (s.labelPos === 'custom') placeAt(ctx, L, fr, q[0] - tw / 2, q[1] - fs / 2, tw, fs, { key: 'label' });
      ctx.globalAlpha = tm.alpha * kFill;
      if (s.labelBox) { ctx.fillStyle = hexA(s.fill || '#d9d900', 0.95); ctx.fillRect(q[0] - tw / 2 - 10 * unit, q[1] - fs * 0.62, tw + 20 * unit, fs * 1.24); ctx.strokeStyle = '#222'; ctx.lineWidth = 1 * unit; ctx.strokeRect(q[0] - tw / 2 - 10 * unit, q[1] - fs * 0.62, tw + 20 * unit, fs * 1.24); ctx.fillStyle = '#1a1a1a'; ctx.fillText(s.label, q[0], q[1]); }
      else { ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 10 * unit; ctx.shadowOffsetY = 2 * unit; ctx.fillStyle = '#ffffff'; ctx.fillText(s.label, q[0], q[1]); }
      ctx.restore();
      if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
    }
  }
  String(s.cities || '').split('\n').forEach((ln, i) => {
    const [name, c] = ln.split('|').map((v) => v.trim()); const ll = parseLL(c);
    if (!name || !ll) return;
    const k = tm.edit || L.anim === 'none' ? 1 : clamp((kFill - 0.3 - i * 0.08) / 0.3, 0, 1);
    if (k <= 0) return;
    const q = proj(ll);
    ctx.save(); ctx.globalAlpha = tm.alpha * k;
    const capital = name.startsWith('*'), nm = capital ? name.slice(1).trim() : name;
    if (s.cityStyle === 'dots' || s.cityStyle === 'plain') {
      if (s.cityStyle === 'dots') {
        if (capital) { ctx.fillStyle = '#111'; symbolPath(ctx, 'star', q[0], q[1], 5.5 * unit); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4 * unit; ctx.stroke(); }
        else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(q[0], q[1], 4 * unit, 0, 7); ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.8 * unit; ctx.stroke(); }
      }
      ctx.font = `800 ${14 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineJoin = 'round'; ctx.lineWidth = 4 * unit; ctx.strokeStyle = s.cityStyle === 'dots' ? '#fff' : 'rgba(0,0,0,0.75)'; ctx.strokeText(nm, q[0], q[1] - 6 * unit);
      ctx.fillStyle = s.cityStyle === 'dots' ? '#111' : '#fff'; ctx.fillText(nm, q[0], q[1] - 6 * unit);
      ctx.restore(); return;
    }
    ctx.font = `500 ${13 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(nm).width + 16 * unit, th = 22 * unit, ty = q[1] - 9 * unit - th;
    ctx.fillStyle = 'rgba(8,8,10,0.92)'; rr(ctx, q[0] - tw / 2, ty, tw, th, 2 * unit); ctx.fill();
    ctx.beginPath(); ctx.moveTo(q[0] - 5 * unit, ty + th); ctx.lineTo(q[0], ty + th + 6 * unit); ctx.lineTo(q[0] + 5 * unit, ty + th); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(nm, q[0], ty + th / 2 + 0.5 * unit);
    ctx.restore();
  });
  ctx.restore();
}
function shade(hex, f) {
  const h = String(hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16) || 0;
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(clamp(f < 0 ? v * (1 + f) : v + (255 - v) * f, 0, 255)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ================================================================= locator mini-map
function mainland(c) {
  // the biggest polygon plus islands near it (drops far-away territories)
  const area = (p) => { const [w, s, e, n] = bboxOf([p]); return (e - w) * (n - s); };
  const ps = [...c.polys].sort((a, b) => area(b) - area(a));
  const [w, s, e, n] = bboxOf([ps[0]]);
  const mx = (e - w) * 0.35, my = (n - s) * 0.35;
  return ps.filter((p) => { const [a, b, cc, d] = bboxOf([p]); return a >= w - mx && cc <= e + mx && b >= s - my && d <= n + my; });
}
function drawLocator(ctx, L, tm, o) {
  const s = L.style, unit = o.unit, fr = o.frame;
  if (!fr) return;
  const center = o.map?.getCenter?.();
  const c = s.country ? (countriesByName(s.country) || [])[0] : center ? countryAt([center.lng, center.lat]) : null;
  if (!c) return;
  const polys = mainland(c);
  const [w0, s0, e0, n0] = bboxOf(polys);
  const [ax, ay] = merc([w0, n0]), [bx, by] = merc([e0, s0]);
  const Wb = 210 * unit * (+s.size || 1), Hb = Wb;
  const k = Math.min(Wb / (bx - ax), Hb / (by - ay));
  const W = (bx - ax) * k, H = (by - ay) * k;
  const m = 34 * unit, pos = s.position || 'top-right';
  let x = /left/.test(pos) ? fr.x + m : fr.x + fr.w - m - W, y = /bottom/.test(pos) ? fr.y + fr.h - m - H - 40 * unit : fr.y + m;
  const u = prog(L, tm);
  const kk = tm.edit || L.anim === 'none' ? 1 : easeOut(u);
  ctx.save();
  placeAt(ctx, L, fr, x, y, W, H);
  if (L.anim === 'slide' && !tm.edit) x += (1 - kk) * (/left/.test(pos) ? -1 : 1) * (W + m);
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !tm.edit ? kk : 1);
  const to = (ll) => { const [mx, my] = merc(ll); return [x + (mx - ax) * k, y + (my - ay) * k]; };
  ctx.beginPath(); pathPolys(ctx, polys, to);
  if (s.shadow !== false) { ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 14 * unit; ctx.shadowOffsetY = 3 * unit; }
  ctx.fillStyle = s.fill || '#ff8a3d'; ctx.fill('evenodd');
  ctx.shadowColor = 'transparent';
  if (s.route !== false) {
    const T = lineTarget('route', o, null);
    if (T) { ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.6 * unit; ctx.beginPath(); T.cs.forEach((ll, i) => { const q = to(ll); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke(); }
  }
  // the view box
  try {
    const b = o.map.getBounds();
    const p1 = to([b.getWest(), b.getNorth()]), p2 = to([b.getEast(), b.getSouth()]);
    ctx.strokeStyle = s.box || '#ffffff'; ctx.lineWidth = 1.4 * unit;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.rect(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1]); ctx.fill(); ctx.stroke();
  } catch { /* map not ready */ }
  ctx.restore();
}

// ================================================================= elevation profile + trail stats
const KM = (m) => `${m >= 100000 ? Math.round(m / 1000) : (m / 1000).toFixed(m >= 10000 ? 0 : 1)}km`;
const MI = (m) => `${(m / 1609.344).toFixed(m >= 16093 ? 0 : 1)}mi`;
const distTxt = (m, units) => (units === 'km' ? KM(m) : units === 'mi' ? MI(m) : `${KM(m)} / ${MI(m)}`);
function progressOf(L, tm, o, T) {
  if (tm.edit || L.anim === 'none') return 1;
  if (L.anim === 'draw') return prog(L, tm);
  return T.u;
}
function drawProfile(ctx, P, x, y, w, h, u, col, ghost, unit, axes) {
  const n = P.e.length;
  const lo = Math.min(P.min, 0), hi = Math.max(P.max, lo + 50) * 1.08;
  const X = (i) => x + (i / (n - 1)) * w, Y = (e) => y + h - ((e - lo) / (hi - lo)) * h;
  const area = (k) => { ctx.beginPath(); ctx.moveTo(X(0), y + h); for (let i = 0; i <= k; i++) ctx.lineTo(X(i), Y(P.e[i])); ctx.lineTo(X(k), y + h); ctx.closePath(); };
  if (ghost) { area(n - 1); ctx.fillStyle = hexA(col, 0.18); ctx.fill(); }
  const k = Math.max(1, Math.round(u * (n - 1)));
  area(k); ctx.fillStyle = col; ctx.fill();
  if (axes) {
    ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 2 * unit;
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y - 14 * unit); ctx.moveTo(x, y + h); ctx.lineTo(x + w + 12 * unit, y + h); ctx.stroke();
    const tri = (ax, ay, dx, dy) => { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - dy * 5 * unit - dx * 9 * unit, ay + dx * 5 * unit - dy * 9 * unit); ctx.lineTo(ax + dy * 5 * unit - dx * 9 * unit, ay - dx * 5 * unit - dy * 9 * unit); ctx.closePath(); ctx.fill(); };
    tri(x, y - 18 * unit, 0, -1); tri(x + w + 16 * unit, y + h, 1, 0);
  }
  return [X(k), Y(P.e[k])];
}
function figure(ctx, kind, x, y, s, col, t) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 40, s / 40);
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const sw = Math.sin(t * 9) * 0.6;
  if (kind === 'car') { rr(ctx, 4, 18, 32, 11, 4); ctx.fill(); rr(ctx, 10, 11, 18, 10, 4); ctx.fill(); ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(11, 30, 4, 0, 7); ctx.arc(29, 30, 4, 0, 7); ctx.fill(); }
  else if (kind === 'cyclist') { ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(10, 30, 7, 0, 7); ctx.moveTo(37, 30); ctx.arc(30, 30, 7, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(10, 30); ctx.lineTo(18, 18); ctx.lineTo(28, 18); ctx.lineTo(30, 30); ctx.moveTo(18, 18); ctx.lineTo(21, 30); ctx.stroke(); ctx.beginPath(); ctx.arc(24, 6, 3.6, 0, 7); ctx.fill(); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(23, 10); ctx.lineTo(19, 18); ctx.stroke(); }
  else { // runner / hiker
    ctx.beginPath(); ctx.arc(22, 5, 4.6, 0, 7); ctx.fill();
    ctx.lineWidth = 5.4; ctx.beginPath(); ctx.moveTo(21, 11); ctx.lineTo(18, 24); ctx.stroke();
    ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(20, 13); ctx.lineTo(20 + 8 * sw, 20); ctx.moveTo(20, 13); ctx.lineTo(20 - 8 * sw, 21); ctx.stroke();
    ctx.lineWidth = 4.2; ctx.beginPath(); ctx.moveTo(18, 24); ctx.lineTo(18 + 10 * sw, 32); ctx.lineTo(16 + 12 * sw, 39); ctx.moveTo(18, 24); ctx.lineTo(18 - 9 * sw, 31); ctx.lineTo(18 - 13 * sw, 37); ctx.stroke();
    if (kind === 'hiker') { ctx.fillStyle = shade(col, -0.35); rr(ctx, 23, 10, 7, 11, 2); ctx.fill(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(28 + 4 * sw, 15); ctx.lineTo(33 + 4 * sw, 39); ctx.stroke(); }
  }
  ctx.restore();
}
function drawElevProfile(ctx, L, tm, o, phase) {
  const s = L.style, unit = o.unit, fr = o.frame;
  const T = lineTarget(s.target || 'route', o, o.time);
  if (!T) return;
  const u = progressOf(L, tm, o, T);
  lastMap = o.map || lastMap;
  if (phase === 'above') {
    if (s.trail === false) return;
    const pts = T.cs.map(o.proj);
    const a = alongLine(T.cs, u);
    const head = o.proj(a.ll);
    const path = () => { ctx.beginPath(); for (let i = 0; i < a.i; i++) { const q = pts[i]; i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } ctx.lineTo(head[0], head[1]); };
    ctx.save(); ctx.globalAlpha *= tm.alpha; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const col = s.trailColor || '#ff4d3d';
    ctx.shadowColor = col; ctx.shadowBlur = 14 * unit;
    path(); ctx.strokeStyle = hexA(col, 0.9); ctx.lineWidth = 5 * unit; ctx.stroke();
    ctx.shadowBlur = 0; path(); ctx.strokeStyle = shade(col, 0.55); ctx.lineWidth = 1.6 * unit; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(head[0], head[1], 4.5 * unit, 0, 7); ctx.fill();
    ctx.restore();
    return;
  }
  if (!fr) return;
  const P = profileOf(T.cs);
  const col = s.color || '#ff8a3d';
  const done = P.total * u;
  const look = s.look || 'bottom';
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  const hk = +s.height || 1;
  if (look === 'bottom' || look === 'both') {
    const x = fr.x + 34 * unit, w = fr.w - 68 * unit, h = 95 * unit * hk, y = fr.y + fr.h - 26 * unit - h;
    ctx.save(); placeAt(ctx, L, fr, x, y, w, h, { key: 'profile' });
    drawProfile(ctx, P, x, y, w, h, u, col, s.ghost !== false, unit, true);
    ctx.restore();
    const title = String(s.title || '').replace('{km}', KM(P.total));
    if (title) {
      ctx.save(); placeAt(ctx, L, fr, fr.x + 34 * unit, fr.y + 30 * unit, 400 * unit, 64 * unit, { key: 'title' });
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 6 * unit;
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.font = `600 ${27 * unit}px ${UI}`; ctx.fillText(title, fr.x + 34 * unit, fr.y + 30 * unit);
      if (!String(s.title).includes('{km}')) { ctx.font = `italic 400 ${19 * unit}px ${UI}`; ctx.fillText(KM(P.total), fr.x + 34 * unit, fr.y + 64 * unit); }
      ctx.restore();
    }
  }
  if (look === 'corner' || look === 'both') {
    const x0 = fr.x + 36 * unit, y0 = fr.y + 30 * unit + (look === 'both' && s.title ? 70 * unit : 0);
    ctx.save(); placeAt(ctx, L, fr, x0, y0, 220 * unit, 130 * unit, { key: 'corner' });
    if (s.icon !== 'none') figure(ctx, s.icon || 'hiker', x0, y0 + 10 * unit, 56 * unit, col, o.time || 0);
    const px = x0 + 70 * unit, pw = 120 * unit, ph = 52 * unit;
    drawProfile(ctx, P, px, y0 + 6 * unit, pw, ph, u, col, s.ghost !== false, unit * 0.6, false);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6 * unit;
    ctx.beginPath(); ctx.moveTo(px, y0 - 6 * unit); ctx.lineTo(px, y0 + 6 * unit + ph); ctx.lineTo(px + pw + 10 * unit, y0 + 6 * unit + ph); ctx.stroke();
    if (s.counter !== false) {
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = `400 ${25 * unit}px ${UI}`;
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 5 * unit;
      const units = s.units || 'both';
      if (units !== 'mi') ctx.fillText(`${Math.round(done / 1000)}km`, px, y0 + 14 * unit + ph);
      if (units !== 'km') ctx.fillText(`${Math.round(done / 1609.344)}mi`, px, y0 + 14 * unit + ph + (units === 'both' ? 27 * unit : 0));
    }
    ctx.restore();
  }
  if (s.stats !== false) {
    const rows = [['Total distance', distTxt(P.total, s.units || 'both')], ['Total elevation gain', `${Math.round(P.gain / 10) * 10}m${s.units === 'km' ? '' : ` / ${Math.round((P.gain * 3.28084) / 5) * 5}ft`}`], ['Total elevation loss', `${Math.round(P.loss / 10) * 10}m`]];
    ctx.font = `400 ${13 * unit}px ${UI}`;
    const lw = Math.max(...rows.map((r) => ctx.measureText(r[0]).width)), vw = Math.max(...rows.map((r) => ctx.measureText(r[1]).width));
    const W = lw + vw + 14 * unit, H = rows.length * 19 * unit;
    const x = fr.x + fr.w - 34 * unit - W, y = fr.y + fr.h - 30 * unit - H - (look !== 'corner' ? 120 * unit * hk : 0);
    ctx.save(); placeAt(ctx, L, fr, x, y, W, H, { key: 'stats' });
    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 4 * unit; ctx.fillStyle = '#fff'; ctx.textBaseline = 'top';
    rows.forEach((r, i) => { ctx.textAlign = 'right'; ctx.fillText(r[0], x + lw, y + i * 19 * unit); ctx.textAlign = 'left'; ctx.font = `600 ${13 * unit}px ${UI}`; ctx.fillText(r[1], x + lw + 14 * unit, y + i * 19 * unit); ctx.font = `400 ${13 * unit}px ${UI}`; });
    ctx.restore();
  }
  if (!P.ready) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `500 ${11 * unit}px ${UI}`; ctx.textAlign = 'left'; ctx.fillText('Measuring elevation…', fr.x + 36 * unit, fr.y + fr.h - 12 * unit); }
  ctx.restore();
}

// ================================================================= range rings
function dest(ll, brg, dist) {
  const R = 6371008.8, d = dist / R, b = brg * D2R, la = ll[1] * D2R, lo = ll[0] * D2R;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return [lo2 / D2R, la2 / D2R];
}
function silhouette(ctx, kind, x, y, s, rot, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s / 40, s / 40); ctx.fillStyle = col;
  const P = (pts) => { ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.fill(); };
  // drawn pointing up (−y), 40 units long
  if (kind === 'stealth') { // flying wing (B-2 style)
    P([[0, -14], [26, 6], [20, 9], [15, 6], [10, 10], [5, 7], [0, 10], [-5, 7], [-10, 10], [-15, 6], [-20, 9], [-26, 6]]);
    if (!String(col).startsWith('rgba')) { ctx.globalAlpha *= 0.3; ctx.fillStyle = '#fff'; P([[0, -12], [5, -2], [-5, -2]]); ctx.globalAlpha /= 0.3; }
  } else if (kind === 'twinboom') {
    P([[-1.5, -12], [1.5, -12], [2.5, 4], [-2.5, 4]]); // pod
    P([[-22, -4], [22, -4], [22, 2], [-22, 2]]); // wing
    for (const sx of [-8, 8]) { P([[sx - 2, -16], [sx + 2, -16], [sx + 1.6, 18], [sx - 1.6, 18]]); }
    P([[-10, 15], [10, 15], [10, 19], [-10, 19]]);
  } else if (kind === 'bomber') {
    P([[-2.5, -19], [2.5, -19], [3, 15], [-3, 15]]);
    P([[-24, -3], [24, -3], [20, 3], [-20, 3]]);
    for (const sx of [-15, -8, 8, 15]) P([[sx - 1.6, -8], [sx + 1.6, -8], [sx + 1.6, 1], [sx - 1.6, 1]]);
    P([[-9, 12], [9, 12], [8, 16], [-8, 16]]);
  } else if (kind === 'jet') {
    P([[0, -20], [3, -6], [16, 8], [16, 11], [3, 8], [5, 17], [-5, 17], [-3, 8], [-16, 11], [-16, 8], [-3, -6]]);
  } else if (kind === 'heli') {
    ctx.beginPath(); ctx.ellipse(0, -2, 5, 8, 0, 0, 7); ctx.fill(); P([[-1.2, 4], [1.2, 4], [1, 19], [-1, 19]]); P([[-5, 17], [5, 17], [5, 19], [-5, 19]]);
    ctx.globalAlpha *= 0.55; P([[-19, -3], [19, -1], [19, 1], [-19, -1]]); P([[-1, -20], [1, -20], [1, 16], [-1, 16]]);
  } else if (kind === 'missile') {
    P([[0, -20], [2, -15], [2, 14], [6, 19], [-6, 19], [-2, 14], [-2, -15]]);
  } else { // single-engine fighter
    ctx.beginPath(); ctx.ellipse(0, -1, 2.6, 18, 0, 0, 7); ctx.fill();
    P([[-2, -6], [2, -6], [20, -1], [20, 3], [2, 3], [-2, 3], [-20, 3], [-20, -1]]);
    P([[-1.5, 12], [1.5, 12], [8, 15], [8, 17.5], [-8, 17.5], [-8, 15]]);
    ctx.beginPath(); ctx.ellipse(0, -19, 3.5, 1.2, 0, 0, 7); ctx.fill();
  }
  ctx.restore();
}
function drawRangeRings(ctx, L, tm, o) {
  const s = L.style, unit = o.unit;
  if (L.geom?.type !== 'Point') return;
  const ll = L.geom.coordinates, c = o.proj(ll);
  const rings = String(s.rings || '').split('\n').map((ln) => ln.split('|').map((v) => v.trim())).filter((r) => r[0] && isFinite(+r[1]))
    .map(([name, r, un, icon]) => { const k = /km/i.test(un) ? 1000 : /nm|naut/i.test(un) ? 1852 : 1609.344; return { name, r: +r * k, val: r, un: /km/i.test(un) ? 'km' : /nm/i.test(un) ? 'nm' : 'Miles', icon: (icon || 'fighter').toLowerCase() }; })
    .sort((a, b) => a.r - b.r);
  const u = prog(L, tm), n = rings.length;
  ctx.save(); ctx.globalAlpha *= tm.alpha;
  rings.forEach((R, i) => {
    let k = 1;
    if (!tm.edit && L.anim === 'expand') k = easeOut(clamp((u * (n + 1) - i) / 1.4, 0, 1));
    else if (!tm.edit && L.anim === 'fade') k = u;
    if (k <= 0) return;
    const rad = R.r * (L.anim === 'expand' && !tm.edit ? k : 1);
    ctx.beginPath();
    for (let a = 0; a <= 360; a += 3) { const q = o.proj(dest(ll, a, rad)); a ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
    ctx.strokeStyle = s.color || '#111'; ctx.lineWidth = (+s.width || 1.4) * unit; ctx.setLineDash(s.dash !== false ? [1.4 * unit, 3.2 * unit] : []); ctx.lineCap = 'round';
    ctx.globalAlpha = tm.alpha * (L.anim === 'fade' && !tm.edit ? k : 1); ctx.stroke(); ctx.setLineDash([]);
    if (k > 0.85) {
      const brg = (+s.angle || 40) + i * (+s.spread || 38);
      const q = o.proj(dest(ll, brg, rad)), q2 = o.proj(dest(ll, brg, rad * 1.02 + 1000));
      const rot = Math.atan2(q2[0] - q[0], -(q2[1] - q[1])) + (i % 2 ? 0.35 : -0.25);
      const ka = clamp((k - 0.85) / 0.15, 0, 1);
      ctx.globalAlpha = tm.alpha * ka;
      if (R.icon !== 'none') silhouette(ctx, R.icon, q[0], q[1], 40 * unit * (+s.iconSize || 1), rot, s.iconColor || '#000');
      ctx.fillStyle = s.labelColor || '#1a1a1a'; ctx.font = `400 ${11 * unit * (+s.labelSize || 1)}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const ly = q[1] + 26 * unit * (+s.iconSize || 1);
      ctx.fillText(R.name, q[0] - 18 * unit, ly); ctx.fillText(`Range ${R.val} ${R.un}`, q[0] - 18 * unit, ly + 13 * unit * (+s.labelSize || 1));
    }
  });
  if (s.base !== false) {
    ctx.globalAlpha = tm.alpha;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(c[0], c[1], 11 * unit, 0, 7); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 2 * unit; ctx.stroke();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(c[0], c[1], 5.5 * unit, 0, 7); ctx.fill();
  }
  ctx.restore();
}

// ================================================================= front line / territory
const roughCache = new Map();
function roughRings(L) {
  const polys = polysOf(L.geom);
  const key = `${L.id}|${+L.style.rough}|${JSON.stringify(L.geom.coordinates).length}|${polys[0]?.[0]?.[0]}`;
  if (roughCache.has(key)) return roughCache.get(key);
  const [w, s, e, n] = bboxOf(polys);
  const diag = Math.hypot(e - w, n - s), seg = diag / 260, amp = diag * 0.0075 * (+L.style.rough || 0);
  const r = rng(hashStr(L.id));
  const ph = [r() * 9, r() * 9, r() * 9, r() * 9];
  const out = polys.map((p) => p.map((ring) => {
    const pts = [];
    let acc = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i], b = ring[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nseg = Math.max(1, Math.ceil(len / seg));
      const nx = -(b[1] - a[1]) / (len || 1), ny = (b[0] - a[0]) / (len || 1);
      for (let k = 0; k < nseg; k++) {
        const f = k / nseg, x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
        acc += len / nseg;
        const t = acc / diag;
        const d = amp * (0.55 * Math.sin(t * 61 + ph[0]) + 0.3 * Math.sin(t * 173 + ph[1]) + 0.25 * Math.sin(t * 431 + ph[2]) + 0.35 * (r() - 0.5));
        pts.push([x + nx * d, y + ny * d]);
      }
    }
    pts.push(pts[0]);
    return pts;
  }));
  // patches: blobs just outside / inside the edge
  const patches = [];
  const outer = out[0]?.[0] || [];
  for (let i = 0; i < 46 && outer.length; i++) {
    const p = outer[Math.floor(r() * outer.length)];
    patches.push({ ll: [p[0] + (r() - 0.5) * amp * 5, p[1] + (r() - 0.5) * amp * 5], r: diag * (0.004 + r() * 0.012), k: r() });
  }
  const v = { polys: out, patches, bbox: [w, s, e, n] };
  roughCache.set(key, v);
  return v;
}
function drawFront(ctx, L, tm, o) {
  const s = L.style, unit = o.unit, fr = o.frame;
  if (!polysOf(L.geom).length) return;
  const R = roughRings(L);
  const u = tm.edit || L.anim === 'none' ? 1 : prog(L, tm);
  const col = s.color || '#c8202a';
  ctx.save();
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !tm.edit ? u : 1);
  // advancing clip
  if (!tm.edit && u < 1 && (L.anim === 'advance' || L.anim === 'grow')) {
    const [w, sb, e, n] = R.bbox;
    const corners = [[w, sb], [e, sb], [e, n], [w, n]].map(o.proj);
    ctx.beginPath();
    if (L.anim === 'grow') {
      const c = o.proj([(w + e) / 2, (sb + n) / 2]);
      const rad = Math.max(...corners.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1]))) * ease(u) * 1.05;
      for (let a = 0; a <= 64; a++) { const t = (a / 64) * Math.PI * 2, j = 1 + 0.08 * Math.sin(t * 7 + 1.3) + 0.05 * Math.sin(t * 17); const x = c[0] + Math.cos(t) * rad * j, y = c[1] + Math.sin(t) * rad * j; a ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    } else {
      const dir = { E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1], NE: [0.71, -0.71], NW: [-0.71, -0.71], SE: [0.71, 0.71], SW: [-0.71, 0.71] }[s.dir || 'E'] || [1, 0];
      const proj = corners.map((q) => q[0] * dir[0] + q[1] * dir[1]), perp = corners.map((q) => -q[0] * dir[1] + q[1] * dir[0]);
      const a0 = Math.min(...proj), a1 = Math.max(...proj), p0 = Math.min(...perp) - 50, p1 = Math.max(...perp) + 50;
      const front = a0 + (a1 - a0) * 1.08 * ease(u);
      const pt = (a, p) => [a * dir[0] - p * dir[1], a * dir[1] + p * dir[0]];
      const back = pt(a0 - 200, p0), back2 = pt(a0 - 200, p1);
      ctx.moveTo(back[0], back[1]);
      for (let i = 0; i <= 80; i++) { const p = p0 + ((p1 - p0) * i) / 80; const j = (Math.sin(i * 0.9 + 2) * 0.5 + Math.sin(i * 2.3) * 0.3 + Math.sin(i * 5.1 + 1) * 0.2) * (a1 - a0) * 0.04; const q = pt(front + j, p); ctx.lineTo(q[0], q[1]); }
      ctx.lineTo(back2[0], back2[1]); ctx.closePath();
    }
    ctx.clip();
  }
  const fill = () => { ctx.beginPath(); pathPolys(ctx, R.polys, o.proj); };
  if (s.fringe !== false) {
    ctx.save();
    ctx.filter = `blur(${6 * unit}px)`;
    fill(); ctx.strokeStyle = shade(col, 0.5); ctx.globalAlpha *= 0.55; ctx.lineWidth = 34 * unit; ctx.stroke();
    ctx.restore();
  }
  ctx.globalCompositeOperation = s.blend === 'normal' ? 'source-over' : 'multiply';
  fill(); ctx.fillStyle = hexA(col, +s.opacity || 0.8); ctx.fill('evenodd');
  if (s.patches !== false) {
    for (const pz of R.patches) {
      const q = o.proj(pz.ll), q2 = o.proj([pz.ll[0] + pz.r, pz.ll[1]]);
      const rad = Math.abs(q2[0] - q[0]);
      ctx.fillStyle = hexA(col, (+s.opacity || 0.8) * (0.35 + pz.k * 0.4));
      ctx.beginPath(); ctx.ellipse(q[0], q[1], rad, rad * (0.6 + pz.k * 0.5), pz.k * 3, 0, 7); ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  if (s.outline) { fill(); ctx.strokeStyle = shade(col, -0.3); ctx.lineWidth = 1.5 * unit; ctx.stroke(); }
  void fr;
  ctx.restore();
}

// ================================================================= top-down units
function unitSprite(ctx, kind, x, y, s, rot, col, t, moving, shadow) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  const k = s / 40; ctx.scale(k, k);
  const dark = shade(col, -0.45), light = shade(col, 0.28), mid = shade(col, -0.15);
  if (shadow) { ctx.save(); ctx.translate(3.5, 4); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.filter = 'blur(2px)'; rr(ctx, -12, -20, 24, 40, 4); ctx.fill(); ctx.restore(); }
  const body = (w, h, r, c) => { const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0); g.addColorStop(0, shade(c, -0.2)); g.addColorStop(0.45, shade(c, 0.18)); g.addColorStop(1, shade(c, -0.25)); ctx.fillStyle = g; rr(ctx, -w / 2, -h / 2, w, h, r); ctx.fill(); };
  if (kind === 'tank' || kind === 'artillery') {
    // tracks with moving treads
    for (const sx of [-12.5, 7.5]) {
      ctx.fillStyle = '#23241f'; rr(ctx, sx, -19, 5, 38, 1.5); ctx.fill();
      ctx.strokeStyle = 'rgba(120,120,110,0.55)'; ctx.lineWidth = 0.7;
      const off2 = moving ? (t * 30) % 3 : 0;
      for (let yy = -19 + off2; yy < 19; yy += 3) { ctx.beginPath(); ctx.moveTo(sx, yy); ctx.lineTo(sx + 5, yy); ctx.stroke(); }
    }
    body(17, 34, 3, col);
    ctx.fillStyle = mid; ctx.fillRect(-6, 9, 12, 7); // engine deck
    ctx.strokeStyle = dark; ctx.lineWidth = 0.6; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-5, 10 + i * 1.7); ctx.lineTo(5, 10 + i * 1.7); ctx.stroke(); }
    if (kind === 'tank') {
      ctx.fillStyle = dark; rr(ctx, -1.3, -31, 2.6, 26, 1); ctx.fill(); // gun
      ctx.fillStyle = shade(col, -0.3); rr(ctx, -2, -32, 4, 3, 1); ctx.fill();
      const g = ctx.createRadialGradient(-2, -4, 1, 0, -1, 10); g.addColorStop(0, light); g.addColorStop(1, mid); ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, -1, 7.5, 9, 0, 0, 7); ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(2.6, 1, 2.1, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = dark; rr(ctx, -1.6, -40, 3.2, 40, 1); ctx.fill();
      ctx.fillStyle = mid; rr(ctx, -6, -8, 12, 12, 2); ctx.fill();
    }
  } else if (kind === 'apc' || kind === 'jeep' || kind === 'truck') {
    const L2 = kind === 'jeep' ? 26 : kind === 'truck' ? 40 : 34, W2 = kind === 'jeep' ? 14 : 16;
    ctx.fillStyle = '#1d1d1b';
    const wy = kind === 'truck' ? [-14, 4, 12] : kind === 'jeep' ? [-8, 8] : [-12, -4, 4, 12];
    for (const yy of wy) { rr(ctx, -W2 / 2 - 1.6, yy - 3, 3.2, 6, 1); ctx.fill(); rr(ctx, W2 / 2 - 1.6, yy - 3, 3.2, 6, 1); ctx.fill(); }
    if (kind === 'truck') { body(W2, 11, 2, col); ctx.translate(0, -14); body(W2, 10, 2, col); ctx.fillStyle = 'rgba(160,200,220,0.6)'; ctx.fillRect(-W2 / 2 + 2, -5, W2 - 4, 2.5); ctx.translate(0, 14); ctx.fillStyle = shade(col, -0.1); rr(ctx, -W2 / 2, -7, W2, 27, 1.5); ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = 0.7; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-W2 / 2, -4 + i * 5); ctx.lineTo(W2 / 2, -4 + i * 5); ctx.stroke(); } }
    else {
      ctx.beginPath(); ctx.moveTo(-W2 / 2, L2 / 2); ctx.lineTo(-W2 / 2, -L2 / 2 + 6); ctx.lineTo(-W2 / 2 + 4, -L2 / 2); ctx.lineTo(W2 / 2 - 4, -L2 / 2); ctx.lineTo(W2 / 2, -L2 / 2 + 6); ctx.lineTo(W2 / 2, L2 / 2); ctx.closePath();
      const g = ctx.createLinearGradient(-W2 / 2, 0, W2 / 2, 0); g.addColorStop(0, shade(col, -0.2)); g.addColorStop(0.5, light); g.addColorStop(1, shade(col, -0.25)); ctx.fillStyle = g; ctx.fill();
      if (kind === 'apc') { ctx.fillStyle = mid; ctx.beginPath(); ctx.arc(0, -3, 4.5, 0, 7); ctx.fill(); ctx.fillStyle = dark; rr(ctx, -0.8, -15, 1.6, 12, 0.5); ctx.fill(); }
      else { ctx.fillStyle = 'rgba(150,190,210,0.55)'; ctx.fillRect(-W2 / 2 + 2, -L2 / 2 + 5, W2 - 4, 3); }
    }
  } else if (kind === 'jet' || kind === 'bomber' || kind === 'heli' || kind === 'stealth') {
    ctx.restore(); ctx.save();
    if (shadow) silhouette(ctx, kind === 'jet' ? 'jet' : kind, x + s * 0.6, y + s * 0.8, s, rot, 'rgba(0,0,0,0.28)');
    silhouette(ctx, kind, x, y, s, rot, col);
    if (kind === 'heli') { ctx.translate(x, y); ctx.strokeStyle = 'rgba(30,30,30,0.35)'; ctx.lineWidth = s * 0.06; ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.48, 0, 7); ctx.stroke(); }
  } else if (kind === 'ship') {
    if (moving) { ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-5, 20); ctx.lineTo(-14, 44); ctx.moveTo(5, 20); ctx.lineTo(14, 44); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.quadraticCurveTo(8, -10, 7, 20); ctx.lineTo(-7, 20); ctx.quadraticCurveTo(-8, -10, 0, -24); ctx.closePath();
    ctx.fillStyle = '#6d7378'; ctx.fill(); ctx.fillStyle = '#4a5055'; rr(ctx, -4, -6, 8, 14, 1.5); ctx.fill(); ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(0, -14, 2.4, 0, 7); ctx.fill(); ctx.fillRect(-0.6, -21, 1.2, 7);
  }
  ctx.restore();
}
function drawUnits(ctx, L, tm, o) {
  const s = L.style, unit = o.unit;
  const cs = linesOf(L.geom)[0];
  if (!cs || cs.length < 2) return;
  const pts = cs.map(o.proj);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum.at(-1) || 1;
  const sz = 30 * unit * (+s.size || 1), gap = sz * 1.45 * (+s.spacing || 1);
  const n = clamp(Math.round(+s.count || 4), 1, 16);
  const u = tm.edit ? 0.6 : L.anim === 'none' ? 0 : ease(prog(L, tm));
  const moving = !tm.edit && L.anim !== 'none' && u > 0 && u < 1;
  const head = (n - 1) * gap * (s.formation === 'column' || !s.formation ? 1 : 0.5) + u * Math.max(0, total - (n - 1) * gap);
  const at = (d) => { d = clamp(d, 0, total); let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const f = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]); const a = pts[i - 1], b = pts[i]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(b[0] - a[0], -(b[1] - a[1]))]; };
  const t = o.time || 0;
  ctx.save(); ctx.globalAlpha *= tm.alpha;
  const air = ['jet', 'bomber', 'heli', 'stealth'].includes(s.type);
  for (let i = n - 1; i >= 0; i--) {
    let d = head, side = 0;
    if (s.formation === 'pairs') { d -= Math.floor(i / 2) * gap; side = i % 2 ? 1 : -1; }
    else if (s.formation === 'wedge') { const row = Math.ceil(i / 2); d -= row * gap * 0.8; side = i === 0 ? 0 : (i % 2 ? 1 : -1) * row; }
    else d -= i * gap;
    const [x, y, rot] = at(d);
    const ox = Math.cos(rot) * side * sz * 0.6, oy = Math.sin(rot) * side * sz * 0.6;
    if (s.dust !== false && moving && !air && s.type !== 'ship') {
      for (let k = 0; k < 5; k++) {
        const ph = ((t * 1.6 + k / 5 + i * 0.13) % 1);
        const [bx, by] = at(d - sz * 0.6 - ph * sz * 1.4);
        ctx.fillStyle = `rgba(185,170,140,${0.28 * (1 - ph)})`;
        ctx.beginPath(); ctx.arc(bx + ox + Math.sin(k * 7 + i) * sz * 0.15, by + oy, sz * (0.18 + ph * 0.35), 0, 7); ctx.fill();
      }
    }
    unitSprite(ctx, s.type || 'tank', x + ox, y + oy, sz, rot, s.color || '#4c5a2b', t, moving, s.shadow !== false);
  }
  ctx.restore();
}

// ================================================================= blast decal
function splat(ctx, x, y, R, seed, col, k) {
  const r = rng(seed);
  ctx.beginPath();
  const N = 34;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2, spike = i % 2 ? 0.55 + r() * 0.35 : 0.95 + r() * 0.75;
    const rr0 = R * k * spike;
    const px = x + Math.cos(a) * rr0, py = y + Math.sin(a) * rr0;
    if (i) ctx.quadraticCurveTo(x + Math.cos(a - 0.09) * rr0 * 0.8, y + Math.sin(a - 0.09) * rr0 * 0.8, px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  for (let i = 0; i < 26; i++) { const a = r() * 7, d = R * k * (1.1 + r() * 0.9); ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, R * (0.03 + r() * 0.06), 0, 7); ctx.fill(); }
}
function drawBlast(ctx, L, tm, o) {
  const s = L.style, unit = o.unit;
  if (L.geom?.type !== 'Point') return;
  const [x, y] = o.proj(L.geom.coordinates);
  const R = 34 * unit * (+s.size || 1);
  const tau = tm.edit || L.anim === 'none' ? 99 : tm.tau;
  const seed = hashStr(L.id);
  const col = s.color || '#101010';
  ctx.save(); ctx.globalAlpha *= tm.alpha;
  // scorch / burst
  const kb = tau >= 99 ? 1 : easeOut(clamp(tau / 0.28, 0, 1));
  if (kb > 0 && (s.scorch !== false || tau < 1.6)) {
    ctx.save();
    ctx.globalAlpha *= s.scorch !== false ? 0.92 : clamp(1 - (tau - 0.8) / 0.8, 0, 1);
    ctx.filter = `blur(${0.8 * unit}px)`;
    splat(ctx, x, y, R, seed, col, kb);
    ctx.filter = 'none';
    const g = ctx.createRadialGradient(x, y, 0, x, y, R * 0.7 * kb); g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 0.8 * kb, 0, 7); ctx.fill();
    ctx.restore();
  }
  if (tau < 99) {
    if (s.flash !== false && tau < 0.35) {
      const k = 1 - tau / 0.35;
      const g = ctx.createRadialGradient(x, y, 0, x, y, R * 2.2);
      g.addColorStop(0, `rgba(255,250,220,${k})`); g.addColorStop(0.35, `rgba(255,170,60,${0.8 * k})`); g.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 2.2, 0, 7); ctx.fill();
    }
    if (s.smoke !== false) {
      const r = rng(seed + 5);
      for (let i = 0; i < 16; i++) {
        const t0 = r() * 0.3, life = 1.6 + r() * 1.2, ph = (tau - t0) / life;
        if (ph <= 0 || ph >= 1) continue;
        const a = r() * 7, d = R * (0.3 + ph * (0.9 + r()));
        const px = x + Math.cos(a) * d + ph * R * 0.6, py = y + Math.sin(a) * d - ph * R * 0.3;
        const g = ctx.createRadialGradient(px, py, 0, px, py, R * (0.4 + ph * 0.8));
        g.addColorStop(0, `rgba(60,58,55,${0.55 * (1 - ph)})`); g.addColorStop(1, 'rgba(60,58,55,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, R * (0.4 + ph * 0.8), 0, 7); ctx.fill();
      }
    }
  }
  ctx.restore();
}

// ================================================================= incident dots / heat
const dotCache = new Map();
function dotsFor(L, o) {
  const s = L.style;
  let polys = null;
  if (s.source === 'countries') { const c = countriesByName(s.countries); polys = c ? c.flatMap((x) => x.polys) : null; }
  else { const T = (o.scene?.layers || []).find((x) => x.id === s.ref); polys = polysOf(T?.geom); }
  if (!polys?.length) return null;
  const key = `${s.source}|${s.ref}|${s.countries}|${s.count}|${s.clusters}|${s.seed}|${polys.length}|${polys[0][0].length}`;
  if (dotCache.has(key)) return dotCache.get(key);
  const r = rng(+s.seed * 7919 + 3);
  const [w, sb, e, n] = bboxOf(polys);
  const diag = Math.hypot(e - w, n - sb);
  const rand = () => { for (let k = 0; k < 400; k++) { const p = [w + r() * (e - w), sb + r() * (n - sb)]; if (inPolys(p, polys)) return p; } return null; };
  const centers = [];
  for (let i = 0; i < (+s.clusters || 9); i++) { const c = rand(); if (c) centers.push({ c, spread: diag * (0.015 + r() * 0.05) }); }
  const dots = [];
  const N = +s.count || 260;
  for (let i = 0; i < N * 3 && dots.length < N && centers.length; i++) {
    const C = centers[Math.floor(r() * centers.length)];
    const g = () => (r() + r() + r() - 1.5) / 1.5;
    const p = [C.c[0] + g() * C.spread * 1.6, C.c[1] + g() * C.spread];
    if (inPolys(p, polys) || r() < 0.08) dots.push({ ll: p, k: r(), sz: 0.6 + r() * 0.9 });
  }
  const v = { dots, bbox: [w, sb, e, n] };
  dotCache.set(key, v);
  return v;
}
function drawEventDots(ctx, L, tm, o, phase) {
  const s = L.style, unit = o.unit, fr = o.frame;
  const D = dotsFor(L, o);
  if (!D) return;
  const u = prog(L, tm);
  const dir = { E: [1, 0], W: [-1, 0], N: [0, 1], S: [0, -1] }[s.dir || 'E'];
  const [w, sb, e, n] = D.bbox;
  const order = (d) => (L.anim === 'sweep' ? ((d.ll[0] - w) / (e - w || 1)) * dir[0] + ((d.ll[1] - sb) / (n - sb || 1)) * dir[1] + (dir[0] < 0 || dir[1] < 0 ? 1 : 0) : d.k);
  const vis = (d) => tm.edit || L.anim === 'none' ? 1 : clamp((u * 1.15 - order(d)) * 12, 0, 1);
  const col = s.color || '#e0141e';
  if (phase === 'below') {
    if (s.heat === false || !fr) return;
    const S = 0.25;
    const [C, g] = off(`${L.id}:heat`, fr.w * S, fr.h * S);
    g.fillStyle = hexA(col, 0.16);
    for (const d of D.dots) { const k = vis(d); if (k <= 0) continue; const q = o.proj(d.ll); g.globalAlpha = k; g.beginPath(); g.arc((q[0] - fr.x) * S, (q[1] - fr.y) * S, 22 * unit * S * d.sz, 0, 7); g.fill(); }
    ctx.save(); ctx.globalAlpha *= tm.alpha * clamp(+s.heatOpacity || 0.45, 0, 1) * 1.6;
    ctx.filter = `blur(${16 * unit}px)`; ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(C, 0, 0, C.width, C.height, fr.x, fr.y, fr.w, fr.h);
    ctx.restore();
    return;
  }
  ctx.save(); ctx.globalAlpha *= tm.alpha;
  const r0 = 2.6 * unit * (+s.dotSize || 1);
  for (const d of D.dots) {
    const k = vis(d); if (k <= 0) continue;
    const q = o.proj(d.ll);
    const rr0 = r0 * d.sz * (k < 1 ? 1 + (1 - k) * 1.5 : 1);
    ctx.globalAlpha = tm.alpha * k;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(q[0], q[1], rr0, 0, 7); ctx.fill();
    ctx.strokeStyle = shade(col, -0.4); ctx.lineWidth = 0.6 * unit; ctx.stroke();
  }
  ctx.restore();
}

// ================================================================= portrait badge
function shapePath(ctx, shape, x, y, r) {
  ctx.beginPath();
  if (shape === 'circle' || shape === 'bubble') ctx.arc(x, y, r, 0, 7);
  else if (shape === 'square') ctx.rect(x - r, y - r, r * 2, r * 2);
  else if (shape === 'shield') { ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y - r); ctx.lineTo(x + r, y + r * 0.2); ctx.quadraticCurveTo(x + r, y + r * 0.8, x, y + r * 1.15); ctx.quadraticCurveTo(x - r, y + r * 0.8, x - r, y + r * 0.2); ctx.closePath(); }
  else { for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); }
}
function drawPortrait(ctx, L, tm, o) {
  const s = L.style, unit = o.unit;
  if (L.geom?.type !== 'Point') return;
  const p = o.proj(L.geom.coordinates);
  const u = prog(L, tm);
  const k = tm.edit || L.anim === 'none' ? 1 : L.anim === 'fade' ? 1 : (() => { const a = clamp(u, 0, 1); return easeOut(a) * (1 + 0.18 * Math.sin(a * Math.PI)); })();
  const R = 40 * unit * (+s.size || 1) * k;
  if (R <= 0.5) return;
  const cx = p[0] + (s.leader ? (+s.dx || 0) * unit : 0), cy = p[1] + (s.leader ? (+s.dy || 0) * unit : -R * 0.4);
  ctx.save(); ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !tm.edit ? u : 1);
  if (s.leader) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6 * unit; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(cx, cy); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p[0], p[1], 3 * unit, 0, 7); ctx.fill(); }
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 14 * unit; ctx.shadowOffsetY = 3 * unit;
  shapePath(ctx, s.shape, cx, cy, R * (s.shape === 'bubble' ? 1.0 : 1.12)); ctx.fillStyle = s.shape === 'bubble' ? 'rgba(255,255,255,0.35)' : s.ring || '#2a0d0d'; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.save(); shapePath(ctx, s.shape, cx, cy, R); ctx.clip();
  const im = s.media && imageFor(s.media);
  if (im?.ready) {
    const sc = Math.max((R * 2) / im.w, (R * 2) / im.h);
    ctx.filter = +s.tint > 0 ? 'grayscale(1) contrast(1.1)' : 'none';
    ctx.drawImage(im.bmp, cx - (im.w * sc) / 2, cy - (im.h * sc) / 2 + R * 0.1, im.w * sc, im.h * sc);
    ctx.filter = 'none';
  } else { // placeholder bust
    ctx.fillStyle = '#5a5f66'; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.fillStyle = '#9aa0a8'; ctx.beginPath(); ctx.arc(cx, cy - R * 0.2, R * 0.38, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, cy + R * 0.85, R * 0.75, R * 0.55, 0, 0, 7); ctx.fill();
  }
  if (+s.tint > 0) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = hexA(s.tintColor || '#c8202a', clamp(+s.tint, 0, 1)); ctx.fillRect(cx - R, cy - R, R * 2, R * 2); ctx.globalCompositeOperation = 'source-over'; }
  ctx.restore();
  shapePath(ctx, s.shape, cx, cy, R); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1 * unit; ctx.stroke();
  if (s.shape === 'bubble') {
    ctx.lineWidth = 5 * unit; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.arc(cx, cy, R * 1.04, 0, 7); ctx.stroke();
    const g = ctx.createLinearGradient(cx, cy - R, cx, cy); g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx - R * 0.15, cy - R * 0.55, R * 0.6, R * 0.32, -0.3, 0, 7); ctx.fill();
  }
  if (s.name) {
    const fs = 14 * unit * (+s.size || 1) * Math.min(1, k);
    ctx.font = `800 ${fs}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(s.name).width + 18 * unit, th = fs * 1.7, ty = cy + R * 0.78;
    ctx.fillStyle = s.plate || '#0e0e0e'; ctx.fillRect(cx - tw / 2, ty, tw, th);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1 * unit; ctx.strokeRect(cx - tw / 2 + 2 * unit, ty + 2 * unit, tw - 4 * unit, th - 4 * unit);
    ctx.fillStyle = '#fff'; ctx.fillText(s.name, cx, ty + th / 2 + 0.5 * unit);
  }
  ctx.restore();
}

// ================================================================= dispatcher
export function drawCarto(ctx, L, tm, o, phase) {
  lastMap = o.map || lastMap;
  switch (L.kind) {
    case 'catmarkers': drawCatMarkers(ctx, L, tm, o, phase); break;
    case 'inset': if (phase === 'captions') drawInset(ctx, L, tm, o); break;
    case 'spotlight': drawSpotlight(ctx, L, tm, o, phase); break;
    case 'locator': if (phase === 'captions') drawLocator(ctx, L, tm, o); break;
    case 'elevprofile': drawElevProfile(ctx, L, tm, o, phase); break;
    case 'rangerings': if (phase === 'above') drawRangeRings(ctx, L, tm, o); break;
    case 'territory': if (phase === 'below') drawFront(ctx, L, tm, o); break;
    case 'units': if (phase === 'above') drawUnits(ctx, L, tm, o); break;
    case 'blast': if (phase === 'above') drawBlast(ctx, L, tm, o); break;
    case 'eventdots': drawEventDots(ctx, L, tm, o, phase); break;
    case 'portrait': if (phase === 'above') drawPortrait(ctx, L, tm, o); break;
    default: break;
  }
}

// shared helpers for cartofx2.js
export const H = { clamp, easeOut, ease, D2R, UI, hexA, hashStr, rng, rr, haversine, prog, parseLL, polysOf, linesOf, inPolys, bboxOf, labelPoint, pathPolys, off, track, shade, symbolPath, drawSymbol, silhouette, merc, dest, setMap: (m) => { lastMap = m || lastMap; }, splat };
