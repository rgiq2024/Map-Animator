// Site watch — a port, naval base or air base "from orbit": the clearest satellite pass of every month (or every
// new high-resolution image), ships / aircraft found on each, and the result as a video:
//   zoom to the site → a grid of dated passes with counts → a flip-through → a count dashboard.
// Imagery: Esri Sentinel-2 (no account), Microsoft Planetary Computer Sentinel-2 / Sentinel-1 radar, and
// Esri World Imagery Wayback (sub-metre; each distinct image of the site, with its capture date).
// Detection: Sentinel images — bright objects on water, with anything that never moves (piers, jetties) removed;
// Wayback images — the on-device AI detector (ships, aircraft, helicopters). Every count can be corrected by hand.
import { putMedia } from './store.js';
import { imageFor } from './geoimage.js';
import { waybackReleases } from './wayback.js';
import { pcScenes, pcDayTiles, pcRenders } from './pcsat.js';
import { brandSafeArea } from './branding.js';

const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayText = (day) => { if (!day) return ''; const d = new Date(`${day}T12:00:00Z`); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const monthText = (day) => { const d = new Date(`${day}T12:00:00Z`); return `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MONO = '"IBM Plex Mono","JetBrains Mono",ui-monospace,monospace';
const SANS = '"IBM Plex Sans","Inter","Segoe UI",system-ui,sans-serif';

export const SITE_TYPES = { port: { name: 'Ports', one: 'Port', icon: '⚓', km: 3, target: 'ships' }, naval: { name: 'Naval bases', one: 'Naval base', icon: '🛳', km: 3, target: 'ships' }, airbase: { name: 'Military air bases', one: 'Air base', icon: '✈', km: 4, target: 'aircraft' }, airport: { name: 'Airports', one: 'Airport', icon: '🛫', km: 4, target: 'aircraft' } };
export const SW_SOURCES = {
  esri_s2: { name: 'Sentinel-2 · Esri (no account) — clearest pass each month, 10 m', short: 'Sentinel-2', credit: 'Contains modified Copernicus Sentinel data · Esri', res: 10 },
  pc_s2: { name: 'Sentinel-2 · Planetary Computer — full archive, 10 m', short: 'Sentinel-2', credit: 'Contains modified Copernicus Sentinel data · Microsoft Planetary Computer', res: 10 },
  pc_s1: { name: 'Sentinel-1 radar · Planetary Computer — sees through cloud, at night, 10 m', short: 'Sentinel-1 radar', credit: 'Contains modified Copernicus Sentinel data · Microsoft Planetary Computer', res: 10, radar: true },
  wayback: { name: 'Esri World Imagery Wayback — sub-metre, every new image of the site', short: 'Esri World Imagery', credit: 'Esri World Imagery Wayback (Maxar, Airbus and others via Esri)', res: 0.6 },
};

// ---------------------------------------------------------------- the site list
// A few key sites (checked positions) used if the OpenStreetMap list cannot be loaded.
const FALLBACK = [
  { id: 'k-rajaee', type: 'port', name: 'Shahid Rajaee Port (Bandar Abbas)', ll: [56.072, 27.106] },
  { id: 'k-amirabad', type: 'port', name: 'Amirabad port', ll: [53.36537, 36.85496] },
  { id: 'k-anzali', type: 'port', name: 'Bandar-e Anzali', ll: [49.47101, 37.48225] },
  { id: 'k-bushehr-ap', type: 'airbase', name: 'Bushehr Airport (6th Tactical Air Base)', icao: 'OIBB', ll: [50.82294, 28.9573] },
];
let sitesP = null;
export function loadSites() {
  sitesP ||= fetch(`sites/iran.json?v=${Math.floor(Date.now() / 36e5)}`).then((r) => (r.ok ? r.json() : null)).then((j) => (j?.sites?.length ? j : { sites: FALLBACK, source: '' })).catch(() => ({ sites: FALLBACK, source: '' }));
  return sitesP;
}
export function siteBBox(ll, km) {
  const h = km / 2, dLat = h / 110.574, dLng = h / (111.32 * Math.cos(ll[1] * D2R));
  return [ll[0] - dLng, ll[1] - dLat, ll[0] + dLng, ll[1] + dLat];
}

// ---------------------------------------------------------------- web-mercator helpers + tile stitching
const mx = (lng) => (lng + 180) / 360;
const my = (lat) => { const s = Math.sin(clamp(lat, -85, 85) * D2R); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
const metresAcross = (bb) => (bb[2] - bb[0]) * 111320 * Math.cos(((bb[1] + bb[3]) / 2) * D2R);
const aspectOf = (bb) => (mx(bb[2]) - mx(bb[0])) / (my(bb[1]) - my(bb[3]));
async function bitmapOf(url, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) { const b = await r.blob(); if (b.size > 0) return await createImageBitmap(b); } else if (r.status === 404) return null; } catch { /* retry */ }
    await sleep(400 * (i + 1));
  }
  return null;
}
async function pool(list, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; await fn(list[k], k); } })); }
/** A canvas of the bbox cut from an XYZ tile template at zoom z ({z}/{x}/{y}). */
async function stitch(tpl, bb, z, maxPx = 1600) {
  const n = 2 ** z, X0 = mx(bb[0]) * n, X1 = mx(bb[2]) * n, Y0 = my(bb[3]) * n, Y1 = my(bb[1]) * n;
  const tx0 = Math.floor(X0), tx1 = Math.floor(X1 - 1e-9), ty0 = Math.floor(Y0), ty1 = Math.floor(Y1 - 1e-9);
  const W = Math.round((X1 - X0) * 256), H = Math.round((Y1 - Y0) * 256);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const jobs = [];
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) jobs.push([x, y]);
  let got = 0;
  await pool(jobs, 6, async ([x, y]) => {
    const bm = await bitmapOf(tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y));
    if (bm) { g.drawImage(bm, Math.round((x - X0) * 256), Math.round((y - Y0) * 256), 256, 256); got++; }
  });
  if (!got) return null;
  if (Math.max(W, H) <= maxPx) return cv;
  const k = maxPx / Math.max(W, H), o = document.createElement('canvas');
  o.width = Math.round(W * k); o.height = Math.round(H * k);
  const og = o.getContext('2d'); og.imageSmoothingQuality = 'high'; og.drawImage(cv, 0, 0, o.width, o.height);
  return o;
}
const zoomFor = (bb, px) => clamp(Math.round(Math.log2(px / 256 / (mx(bb[2]) - mx(bb[0])))), 3, 19);

/** Share of the image that is missing (transparent / black) or white cloud. */
function quality(cv, radar = false) {
  const s = 96, t = document.createElement('canvas'); t.width = s; t.height = s;
  const g = t.getContext('2d', { willReadFrequently: true }); g.drawImage(cv, 0, 0, s, s);
  const d = g.getImageData(0, 0, s, s).data;
  let empty = 0, cloud = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a < 20 || r + gg + b < 12) { empty++; continue; }
    const mn = Math.min(r, gg, b), mxv = Math.max(r, gg, b);
    if (!radar && mn > 185 && mxv - mn < 30) cloud++;
  }
  const n = s * s;
  return { empty: empty / n, cloud: cloud / n };
}

// ---------------------------------------------------------------- imagery sources → passes
const ESRI_S2 = 'https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer';
async function getJSON(url, init) { const r = await fetch(url, init); if (!r.ok) throw new Error(`${r.status} ${r.statusText || ''}`.trim()); const j = await r.json(); if (j?.error) throw new Error(j.error.message || 'Service error'); return j; }

/** Candidate acquisition days, grouped by month: Map month → [{ day, cloud, ids? }] (best first). */
async function candidates(src, bb, from, to, maxCloud) {
  const byMonth = new Map();
  const put = (c) => { const m = c.day.slice(0, 7); if (!byMonth.has(m)) byMonth.set(m, []); byMonth.get(m).push(c); };
  if (src === 'esri_s2') {
    const t0 = Date.parse(`${from}T00:00:00Z`), t1 = Date.parse(`${to}T23:59:59Z`);
    const q = new URLSearchParams({ f: 'json', where: `category = 1 AND cloudcover <= ${(maxCloud / 100).toFixed(2)}`, geometry: JSON.stringify({ xmin: bb[0], ymin: bb[1], xmax: bb[2], ymax: bb[3], spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'objectid,acquisitiondate,cloudcover', returnGeometry: 'false', time: `${t0},${t1}`, orderByFields: 'acquisitiondate ASC', resultRecordCount: '2000' });
    const j = await getJSON(`${ESRI_S2}/query?${q}`);
    const byDay = new Map();
    for (const f of j.features || []) {
      const a = f.attributes || {}; const day = new Date(a.acquisitiondate).toISOString().slice(0, 10);
      let g = byDay.get(day); if (!g) { g = { day, cloud: 0, ids: [] }; byDay.set(day, g); }
      g.ids.push(a.objectid); g.cloud = Math.max(g.cloud, (+a.cloudcover || 0) * 100);
    }
    for (const g of byDay.values()) put(g);
  } else {
    const collection = src === 'pc_s1' ? 'sentinel-1-rtc' : 'sentinel-2-l2a';
    const days = await pcScenes({ collection, bbox: bb, from, to, maxCloud: src === 'pc_s1' ? 100 : maxCloud });
    for (const d of days) put({ day: d.day, cloud: d.cloud ?? 0, orbit: d.orbit || '' });
  }
  for (const [m, list] of byMonth) {
    if (src === 'pc_s1') { const mid = Date.parse(`${m}-15T12:00:00Z`); list.sort((a, b) => Math.abs(Date.parse(a.day) - mid) - Math.abs(Date.parse(b.day) - mid)); } else list.sort((a, b) => a.cloud - b.cloud || b.day.localeCompare(a.day));
  }
  return new Map([...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}
async function renderPass(src, bb, c) {
  const across = metresAcross(bb);
  if (src === 'esri_s2') {
    const W = clamp(Math.round(across / 4), 300, 1400), H = Math.round(W / aspectOf(bb));
    const q = new URLSearchParams({ f: 'image', format: 'jpgpng', bbox: bb.join(','), bboxSR: '4326', imageSR: '3857', size: `${W},${H}`, mosaicRule: JSON.stringify({ mosaicMethod: 'esriMosaicLockRaster', lockRasterIds: c.ids, ascending: true, mosaicOperation: 'MT_FIRST' }), renderingRule: JSON.stringify({ rasterFunction: 'Natural Color with DRA' }) });
    const bm = await bitmapOf(`${ESRI_S2}/exportImage?${q}`);
    if (!bm) return null;
    const cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height; cv.getContext('2d').drawImage(bm, 0, 0); return cv;
  }
  const collection = src === 'pc_s1' ? 'sentinel-1-rtc' : 'sentinel-2-l2a';
  const renders = await pcRenders(collection).catch(() => []);
  const opt = (src === 'pc_s1' ? renders.find((r) => /^vv/i.test(r.name) && !/vh/i.test(r.name)) || renders.find((r) => /vv/i.test(r.name)) : renders.find((r) => /natural/i.test(r.name))) || renders[0];
  const t = await pcDayTiles({ collection, bbox: bb, day: c.day, options: opt?.options || '' });
  return stitch(t.url, bb, Math.min(t.maxzoom || 16, zoomFor(bb, clamp(across / 4, 400, 1400))), 1400);
}

// Wayback: every distinct image of the site (the tile map says which release a tile really comes from)
const WB_TILEMAP = 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tilemap';
const metaLayerCache = new Map();
async function captureInfo(rel, ll, z) {
  if (!rel.meta) return null;
  try {
    let layers = metaLayerCache.get(rel.meta);
    if (!layers) { layers = (await getJSON(`${rel.meta}?f=json`)).layers || []; metaLayerCache.set(rel.meta, layers); }
    const scale = 591657527.591555 / 2 ** z;
    const ly = layers.find((l) => (!l.minScale || scale <= l.minScale) && (!l.maxScale || scale >= l.maxScale)) || layers[0];
    if (!ly) return null;
    const q = new URLSearchParams({ f: 'json', geometry: `${ll[0]},${ll[1]}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: '*', returnGeometry: 'false' });
    const a = (await getJSON(`${rel.meta}/${ly.id}/query?${q}`)).features?.[0]?.attributes;
    if (!a) return null;
    const v = a.SRC_DATE2 ?? a.SRC_DATE ?? a.src_date2 ?? a.src_date;
    let day = '';
    if (typeof v === 'number' && v > 1e11) day = new Date(v).toISOString().slice(0, 10);
    else if (v != null && /^\d{8}$/.test(String(v))) day = `${String(v).slice(0, 4)}-${String(v).slice(4, 6)}-${String(v).slice(6, 8)}`;
    return { day, sensor: a.NICE_DESC || a.SRC_DESC || '', res: +a.SRC_RES || +a.SAMP_RES || 0 };
  } catch { return null; }
}
async function waybackPasses(ll, from, to, z, onStatus) {
  const rel = await waybackReleases();
  const n = 2 ** z, tx = Math.floor(mx(ll[0]) * n), ty = Math.floor(my(ll[1]) * n);
  const out = [];
  let i = rel.length - 1;
  while (i >= 0 && out.length < 30) {
    const r = rel[i];
    if (r.date < from) break;
    onStatus?.(`Checking Wayback release ${r.date}…`);
    let actual = r;
    try { const tm = await getJSON(`${WB_TILEMAP}/${r.num}/${z}/${ty}/${tx}`); if (tm?.data?.[0] === 0) { i--; continue; } const s = tm?.select?.[0]; if (s) actual = rel.find((x) => x.num === s) || r; } catch { /* use the release itself */ }
    if (!out.some((o) => o.num === actual.num)) out.push(actual);
    const k = rel.indexOf(actual); i = (k >= 0 ? Math.min(k, i) : i) - 1;
  }
  for (const r of out) { const info = await captureInfo(r, ll, z); r.capture = info?.day || ''; r.sensor = info?.sensor || ''; }
  return out.filter((r) => (r.capture || r.date) <= to && (r.capture || r.date) >= from).sort((a, b) => (a.capture || a.date).localeCompare(b.capture || b.date));
}

// ---------------------------------------------------------------- detection
/**
 * Ships on a Sentinel image: bright objects on (or right next to) water. Returns boxes as image fractions
 * [{ cls, x0, y0, x1, y1, cx, cy }]. radar = Sentinel-1 (water is dark, hulls bright).
 */
export function brightOnWater(cv, { radar = false, metresPerPx = 5 } = {}) {
  const W = cv.width, H = cv.height, N = W * H;
  const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const Y = new Float32Array(N), water = new Uint8Array(N), valid = new Uint8Array(N);
  const hist = new Float64Array(256);
  for (let i = 0; i < N; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], a = d[i * 4 + 3];
    Y[i] = 0.3 * r + 0.59 * g + 0.11 * b;
    valid[i] = a > 20 && r + g + b > 6 ? 1 : 0;
    if (valid[i]) hist[Math.min(255, Y[i] | 0)]++;
  }
  // radar: Otsu split between dark water and the rest; optical: water is greener / bluer than it is red, and not bright
  let otsu = 60;
  if (radar) {
    let tot = 0, sum = 0; for (let k = 0; k < 256; k++) { tot += hist[k]; sum += k * hist[k]; }
    let wB = 0, sB = 0, best = -1;
    for (let k = 0; k < 256; k++) { wB += hist[k]; if (!wB) continue; const wF = tot - wB; if (!wF) break; sB += k * hist[k]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; otsu = k; } }
  }
  for (let i = 0; i < N; i++) {
    if (!valid[i]) continue;
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    water[i] = radar ? (Y[i] < otsu ? 1 : 0) : ((g + b) / 2 > r * 1.04 && Y[i] < 150 && Math.max(r, g, b) - Math.min(r, g, b) > 6 ? 1 : 0);
  }
  // integral image of water → share of water around each pixel (≈ 70 m radius)
  const R = Math.max(3, Math.round(70 / metresPerPx));
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += water[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
  const share = (x, y, r) => { const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(W, x + r + 1), y1 = Math.min(H, y + r + 1); return (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / Math.max(1, (x1 - x0) * (y1 - y0)); };
  let m = 0, m2 = 0, n = 0;
  for (let i = 0; i < N; i++) if (water[i]) { m += Y[i]; m2 += Y[i] * Y[i]; n++; }
  if (n < N * 0.03) return [];
  m /= n; const sd = Math.sqrt(Math.max(1, m2 / n - m * m));
  const thr = radar ? m + Math.max(5 * sd, 60) : m + Math.max(2.6 * sd, 28);
  const cand = new Uint8Array(N);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (valid[i] && !water[i] && Y[i] > thr && share(x, y, R) > 0.33) cand[i] = 1; }
  // connected components
  const lab = new Int32Array(N); const out = []; let id = 0; const st = [];
  const a1 = 120 / metresPerPx ** 2, a2 = 30000 / metresPerPx ** 2, maxLen = 420 / metresPerPx;
  for (let i = 0; i < N; i++) {
    if (!cand[i] || lab[i]) continue;
    id++; st.push(i); lab[i] = id;
    let cnt = 0, x0 = W, y0 = H, x1 = 0, y1 = 0, sx = 0, sy = 0;
    while (st.length) {
      const j = st.pop(), x = j % W, y = (j / W) | 0; cnt++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const k of [j - 1, j + 1, j - W, j + W]) if (k >= 0 && k < N && cand[k] && !lab[k]) { lab[k] = id; st.push(k); }
    }
    const len = Math.hypot(x1 - x0 + 1, y1 - y0 + 1);
    if (cnt < a1 || cnt > a2 || len > maxLen) continue;
    // the ring just outside the object must be mostly water (a hull in the water or alongside a quay)
    let wr = 0, tr = 0;
    for (let y = Math.max(0, y0 - 2); y <= Math.min(H - 1, y1 + 2); y++) for (let x = Math.max(0, x0 - 2); x <= Math.min(W - 1, x1 + 2); x++) { if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue; tr++; wr += water[y * W + x]; }
    if (!tr || wr / tr < 0.3) continue;
    const p = 1.5;
    out.push({ cls: 'ship', x0: Math.max(0, x0 - p) / W, y0: Math.max(0, y0 - p) / H, x1: Math.min(W, x1 + 1 + p) / W, y1: Math.min(H, y1 + 1 + p) / H, cx: sx / cnt / W, cy: sy / cnt / H });
  }
  return out;
}
/** Remove objects that are in the same place on (almost) every pass: piers, jetties, buoys, fixed platforms. */
function dropStatic(frames, tol = 0.012) {
  const n = frames.length;
  if (n < 5) return;
  const need = Math.max(4, Math.ceil(n * 0.75));
  for (const f of frames) {
    f.boxes = f.boxes.filter((b) => {
      if (b.manual || b.ai) return true;
      let seen = 0;
      for (const g of frames) if (g.boxes.some((c) => Math.abs(c.cx - b.cx) < tol && Math.abs(c.cy - b.cy) < tol)) seen++;
      return seen < need;
    });
    f.count = f.boxes.length;
  }
}
async function detectAI(cv, target) {
  const { detectCanvas } = await import('./objdetect.js');
  const classes = new Set(target === 'aircraft' ? ['plane', 'helicopter'] : target === 'both' ? ['ship', 'plane', 'helicopter'] : ['ship']);
  const res = await detectCanvas(cv, { classes, minConf: 0.35 });
  return res.map((r) => {
    const xs = r.pts.map((p) => p[0]), ys = r.pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { cls: r.cls === 'plane' ? 'aircraft' : r.cls, ai: true, conf: +r.conf.toFixed(2), x0: x0 / cv.width, x1: x1 / cv.width, y0: y0 / cv.height, y1: y1 / cv.height, cx: (x0 + x1) / 2 / cv.width, cy: (y0 + y1) / 2 / cv.height, pts: r.pts.map(([x, y]) => [+(x / cv.width).toFixed(4), +(y / cv.height).toFixed(4)]) };
  });
}

// ---------------------------------------------------------------- the whole run
const mediaId = () => `sw_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
async function toMedia(cv, maxPx = 1000) {
  let c = cv;
  if (Math.max(cv.width, cv.height) > maxPx) { const k = maxPx / Math.max(cv.width, cv.height); c = document.createElement('canvas'); c.width = Math.round(cv.width * k); c.height = Math.round(cv.height * k); const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cv, 0, 0, c.width, c.height); }
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
  const id = mediaId(); await putMedia(id, blob);
  return { media: id, w: c.width, h: c.height, url: URL.createObjectURL(blob) };
}
/**
 * Fetch the passes of a site and count what is on them.
 * opts: { site, km, source, from, to, maxCloud, target: 'ships' | 'aircraft' | 'both' | 'none', detector: 'auto' | 'ai' | 'water' | 'none', onStatus, onFrame }
 * → frames [{ day, label, media, w, h, url, boxes, count, cloud, sensor, source }]
 */
export async function fetchSitePasses(opts) {
  const { site, source = 'esri_s2', from, to, maxCloud = 30, target = 'ships', onStatus, onFrame } = opts;
  const km = +opts.km || SITE_TYPES[site.type]?.km || 3;
  const bb = siteBBox(site.ll, km);
  const det = opts.detector && opts.detector !== 'auto' ? opts.detector : target === 'none' ? 'none' : source === 'wayback' ? 'ai' : target === 'aircraft' ? 'none' : 'water';
  const frames = [];
  const add = async (cv, meta) => {
    let boxes = [];
    if (det === 'water' && target !== 'aircraft') { onStatus?.(`Looking for ships · ${dayText(meta.day)}`); boxes = brightOnWater(cv, { radar: source === 'pc_s1', metresPerPx: metresAcross(bb) / cv.width }); }
    else if (det === 'ai') { onStatus?.(`AI detector · ${dayText(meta.day)} (first run downloads the model)`); try { boxes = await detectAI(cv, target); } catch (e) { onStatus?.(`AI detector unavailable: ${e.message}`); } }
    const m = await toMedia(cv);
    const f = { ...meta, label: dayText(meta.day), ...m, boxes, count: boxes.length, source, include: true };
    frames.push(f); onFrame?.(f, frames);
  };
  if (source === 'wayback') {
    const z = clamp(zoomFor(bb, 2600), 15, 18);
    const rel = await waybackPasses(site.ll, from, to, Math.min(z, 17), onStatus);
    if (!rel.length) throw new Error('No Wayback images of this site in those dates');
    for (const r of rel) {
      onStatus?.(`Esri Wayback · image of ${dayText(r.capture || r.date)}…`);
      const cv = await stitch(r.url, bb, z, 2600);
      if (!cv) continue;
      await add(cv, { day: r.capture || r.date, release: r.date, sensor: r.sensor || '', cloud: 0 });
    }
  } else {
    onStatus?.('Finding satellite passes…');
    const months = await candidates(source, bb, from, to, maxCloud);
    if (!months.size) throw new Error('No passes found — widen the dates or allow more cloud');
    for (const [m, list] of months) {
      let best = null;
      for (const c of list.slice(0, source === 'pc_s1' ? 1 : 3)) {
        onStatus?.(`${monthText(`${m}-15`)} · checking ${dayText(c.day)}…`);
        const cv = await renderPass(source, bb, c).catch(() => null);
        if (!cv) continue;
        const q = quality(cv, source === 'pc_s1');
        if (q.empty > 0.2) continue;
        const score = q.cloud + q.empty;
        if (!best || score < best.score) best = { cv, c, score, q };
        if (score < 0.02) break;
      }
      if (best && best.score < 0.35) await add(best.cv, { day: best.c.day, cloud: Math.round(best.q.cloud * 100), sensor: SW_SOURCES[source].short });
    }
  }
  if (det === 'water') dropStatic(frames);
  frames.sort((a, b) => a.day.localeCompare(b.day));
  return { frames, bbox: bb, km, detector: det };
}

// ---------------------------------------------------------------- the layer
export const SW_KINDS = { sitewatch: { name: 'Site watch — satellite passes', icon: '🛰', geom: null, desc: 'Dated satellite passes of a port or air base as a grid, a flip-through or a count dashboard, with ships / aircraft marked' } };
export const SW_ANIMS = { sitewatch: { cascade: 'Passes appear one by one', fade: 'Fade in', none: 'Already there' } };
export const SW_LAYOUTS = { grid: 'Grid of passes + headline (like a newspaper graphic)', flip: 'Flip through the passes, full frame', dashboard: 'Count dashboard (bar chart + numbers)', pair: 'First vs latest, side by side' };
export const SW_DEFAULTS = {
  sitewatch: { layout: 'grid', kicker: 'FROM ORBIT', head1: 'A transponder can be switched off.', head2: 'A hull can’t hide from a satellite.', body: '', footer: '', frames: [], cols: 0, eventDay: '', eventLabel: '', countWord: 'ships', showCount: true, showBoxes: true, accent: '#ffc629', boxColor: '#ff4d3d', bg: '#0b0f16', bgAlpha: 0.94, flipSec: 1.4, site: '', textSize: 1 },
};
const LAYOUT_OPTS = Object.fromEntries(Object.entries(SW_LAYOUTS));
export const SW_FORMS = {
  sitewatch: [
    ['style.layout', 'Layout', 'select', LAYOUT_OPTS],
    ['style.kicker', 'Kicker (small caps line)', 'text'],
    ['style.head1', 'Headline', 'text'],
    ['style.head2', 'Second line (accent colour)', 'text'],
    ['style.body', 'Body text', 'textarea'],
    ['style.footer', 'Footer / credit line', 'textarea'],
    ['style.eventDay', 'Event date (YYYY-MM-DD) — a marker before the first pass after it', 'text'],
    ['style.eventLabel', 'Event label (e.g. WAR BEGINS 28 FEB)', 'text'],
    ['style.countWord', 'What is counted (ships, aircraft…)', 'text'],
    ['style.showCount', 'Show the count on each pass', 'switch'],
    ['style.showBoxes', 'Mark each ship / aircraft', 'switch'],
    ['style.cols', 'Columns (0 = automatic)', 'range', [0, 8, 1], (L) => L.style.layout === 'grid'],
    ['style.flipSec', 'Seconds per pass', 'range', [0.4, 5, 0.1], (L) => L.style.layout === 'flip'],
    ['style.textSize', 'Text size', 'range', [0.6, 1.6, 0.05]],
    ['style.accent', 'Accent colour', 'color'],
    ['style.boxColor', 'Marker colour', 'color'],
    ['style.bg', 'Background', 'color'],
    ['style.bgAlpha', 'Background opacity (0 = map shows through)', 'range', [0, 1, 0.02]],
  ],
};
export const SW_SET = new Set(Object.keys(SW_KINDS));
export const swPhases = () => ['captions'];
/** media ids a sitewatch layer needs (for preloading) */
export const swMedia = (L) => (L.style?.frames || []).filter((f) => f.include !== false).map((f) => f.media).filter(Boolean);

function wrap(g, text, maxW) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
    out.push(line);
  }
  return out;
}
/** rich body text: **bold** segments */
function richLines(g, text, maxW, font, boldFont) {
  const lines = wrap(g, String(text).replace(/\*\*/g, ''), maxW);
  const bold = []; String(text).replace(/\*\*(.+?)\*\*/g, (_, b) => bold.push(b));
  return lines.map((l) => ({ l, bold }));
}
function drawRich(g, line, x, y, font, boldFont, bold) {
  let cx = x; const parts = [];
  let rest = line;
  while (rest) {
    let hit = null; for (const b of bold) { const i = rest.indexOf(b); if (i >= 0 && (!hit || i < hit.i)) hit = { i, b }; }
    if (!hit) { parts.push([rest, false]); break; }
    if (hit.i) parts.push([rest.slice(0, hit.i), false]);
    parts.push([hit.b, true]); rest = rest.slice(hit.i + hit.b.length);
  }
  for (const [t, b] of parts) { g.font = b ? boldFont : font; g.fillText(t, cx, y); cx += g.measureText(t).width; }
}
function chip(g, text, x, y, size, bg, fg, anchor = 'bl') {
  g.font = `600 ${size}px ${MONO}`;
  const w = g.measureText(text).width + size * 0.9, h = size * 1.55;
  const X = anchor.includes('r') ? x - w : x, Y = anchor.includes('b') ? y - h : y;
  g.fillStyle = bg; g.fillRect(X, Y, w, h);
  g.fillStyle = fg; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(text, X + size * 0.45, Y + h / 2 + 0.5);
  return { w, h, x: X, y: Y };
}
function imgOf(f) { const e = f?.media ? imageFor(f.media) : null; return e?.ready ? e : null; }
/** draw one pass into a box (cover), with its markers */
function drawPass(g, f, x, y, w, h, s, unit, a = 1, mark = 1) {
  const im = imgOf(f);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = '#121820'; g.fillRect(x, y, w, h);
  let ix = x, iy = y, iw = w, ih = h;
  if (im) { const k = Math.max(w / im.w, h / im.h); iw = im.w * k; ih = im.h * k; ix = x + (w - iw) / 2; iy = y + (h - ih) / 2; g.globalAlpha = a; g.drawImage(im.bmp, ix, iy, iw, ih); g.globalAlpha = 1; }
  if (s.showBoxes !== false && mark > 0 && f.boxes?.length) {
    g.strokeStyle = s.boxColor || '#ff4d3d'; g.lineWidth = Math.max(1, 1.4 * unit); g.globalAlpha = mark;
    for (const b of f.boxes) {
      if (b.pts) { g.beginPath(); b.pts.forEach(([px, py], i) => (i ? g.lineTo(ix + px * iw, iy + py * ih) : g.moveTo(ix + px * iw, iy + py * ih))); g.closePath(); g.stroke(); }
      else { const bw = Math.max(5 * unit, (b.x1 - b.x0) * iw), bh = Math.max(5 * unit, (b.y1 - b.y0) * ih); g.strokeRect(ix + b.cx * iw - bw / 2, iy + b.cy * ih - bh / 2, bw, bh); }
    }
    g.globalAlpha = 1;
  }
  g.restore();
}
const framesOf = (s) => (s.frames || []).filter((f) => f.include !== false);
function eventIndex(s, fr) { if (!s.eventDay) return -1; return fr.findIndex((f) => f.day >= s.eventDay); }

export function drawSiteWatch(ctx, L, tm, o) {
  const s = { ...SW_DEFAULTS.sitewatch, ...L.style }, fr = o.frame, unit = o.unit * (+s.textSize || 1), g = ctx;
  const frames = framesOf(s), n = frames.length;
  const A = (tm.alpha ?? 1) * (L.anim === 'fade' && !tm.edit ? clamp(tm.tau / 0.6, 0, 1) : 1);
  if (A <= 0) return;
  const T = tm.edit ? 99 : tm.tau;
  g.save(); g.globalAlpha = A;
  if (+s.bgAlpha > 0) { g.globalAlpha = A * clamp(+s.bgAlpha, 0, 1); g.fillStyle = s.bg; g.fillRect(fr.x, fr.y, fr.w, fr.h); g.globalAlpha = A; }
  const safe = (brandSafeArea(fr.w, fr.h).top || 0) * fr.h * 0.85;
  const box = safe ? { x: fr.x, y: fr.y + safe, w: fr.w, h: fr.h - safe } : fr;
  const lay = s.layout || 'grid';
  if (lay === 'flip') drawFlip(g, s, frames, box, unit, T, L, tm);
  else if (lay === 'dashboard') drawDash(g, s, frames, box, unit, T, L);
  else if (lay === 'pair') drawPair(g, s, frames, box, unit, T, L);
  else drawGrid(g, s, frames, box, unit, T, L);
  if (!n) { g.font = `500 ${16 * unit}px ${SANS}`; g.fillStyle = '#9aa4b2'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('No passes yet — use Site watch (home page) to fetch them', fr.x + fr.w * 0.62, fr.y + fr.h / 2); }
  // footer
  if (s.footer) {
    g.font = `400 ${11.5 * unit}px ${SANS}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const lines = wrap(g, s.footer, fr.w * 0.9);
    const y0 = fr.y + fr.h - fr.h * 0.022 - (lines.length - 1) * 15 * unit;
    g.fillStyle = s.accent; g.fillRect(fr.x + fr.w * 0.03, y0 - 11 * unit, 2 * unit, (lines.length - 1) * 15 * unit + 14 * unit);
    g.fillStyle = 'rgba(225,230,238,0.82)'; g.globalAlpha = A * (tm.edit ? 1 : clamp((T - 1) / 0.8, 0, 1));
    lines.forEach((l, i) => g.fillText(l, fr.x + fr.w * 0.03 + 9 * unit, y0 + i * 15 * unit));
  }
  g.restore();
}
function textPanel(g, s, x, y, w, unit, T, n) {
  const K = s.kicker, ap = (t0) => clamp((T - t0) / 0.5, 0, 1);
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  let cy = y;
  if (K) { g.globalAlpha *= 1; g.font = `600 ${14 * unit}px ${MONO}`; g.fillStyle = s.accent; const a = ap(0.1); g.save(); g.globalAlpha *= a; g.fillText(K.toUpperCase().split('').join(String.fromCharCode(8202)), x, cy + 14 * unit); g.restore(); cy += 40 * unit; }
  const big = (txt, col, t0) => { if (!txt) return; g.font = `600 ${25 * unit}px ${SANS}`; const ls = wrap(g, txt, w); g.save(); g.globalAlpha *= ap(t0); g.fillStyle = col; ls.forEach((l, i) => g.fillText(l, x, cy + 25 * unit + i * 34 * unit)); g.restore(); cy += ls.length * 34 * unit + 18 * unit; };
  big(s.head1, '#ffffff', 0.35); big(s.head2, s.accent, 0.8);
  if (s.body) {
    const font = `400 ${18 * unit}px ${SANS}`, bold = `700 ${18 * unit}px ${SANS}`; g.font = font;
    const ls = richLines(g, s.body, w, font, bold); g.save(); g.globalAlpha *= ap(1.2); g.fillStyle = '#ffffff';
    ls.forEach((l, i) => drawRich(g, l.l, x, cy + 18 * unit + i * 25 * unit, font, bold, l.bold)); g.restore(); cy += ls.length * 25 * unit;
  }
  return cy;
}
function countTag(g, s, f, x, y, unit) {
  if (s.showCount === false || f.count == null) return;
  const t = `✓ ${f.count} ${f.count === 1 ? String(s.countWord || '').replace(/s$/, '') : s.countWord || ''}`.trim();
  chip(g, t, x, y, 10.5 * unit, 'rgba(10,14,20,0.82)', s.accent, 'tr');
}
function drawGrid(g, s, frames, fr, unit, T, L) {
  const n = frames.length;
  const px = fr.x + fr.w * 0.045, pw = fr.w * 0.255;
  textPanel(g, s, px, fr.y + fr.h * 0.085, pw, unit, T, n);
  if (!n) return;
  const gx = fr.x + fr.w * 0.31, gy = fr.y + fr.h * 0.08, gw = fr.w * 0.67, gh = fr.h * (s.footer ? 0.8 : 0.86);
  const im0 = imgOf(frames[0]); const asp = im0 ? clamp(im0.w / im0.h, 0.6, 1.8) : 1.08;
  let cols = +s.cols || 0;
  if (!cols) { let best = 0; for (let c = 1; c <= 8; c++) { const r = Math.ceil(n / c); const cw = Math.min(gw / c, (gh / r) * asp); if (cw > best) { best = cw; cols = c; } } }
  const rows = Math.ceil(n / cols), gap = 7 * unit;
  const cw = Math.min((gw - gap * (cols - 1)) / cols, ((gh - gap * (rows - 1)) / rows) * asp), ch = cw / asp;
  const ox = gx + (gw - (cw * cols + gap * (cols - 1))) / 2, oy = gy;
  const step = Math.min(0.22, 3 / Math.max(1, n)), ev = eventIndex(s, frames);
  frames.forEach((f, i) => {
    const t0 = 0.5 + i * step, u = L.anim === 'none' ? 1 : easeOut((T - t0) / 0.45);
    if (u <= 0) return;
    const c = i % cols, r = Math.floor(i / cols), x = ox + c * (cw + gap), y = oy + r * (ch + gap);
    g.save(); g.globalAlpha *= u; const sc = 0.94 + 0.06 * u; g.translate(x + cw / 2, y + ch / 2); g.scale(sc, sc); g.translate(-x - cw / 2, -y - ch / 2);
    drawPass(g, f, x, y, cw, ch, s, unit, 1, clamp((T - t0 - 0.5) / 0.4, 0, 1));
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
    chip(g, f.label.toUpperCase(), x + 6 * unit, y + ch - 6 * unit, 11 * unit, 'rgba(8,11,16,0.86)', '#ffffff', 'bl');
    countTag(g, s, f, x + cw - 6 * unit, y + 6 * unit, unit);
    g.restore();
    if (i === ev && s.eventLabel) {
      const ua = clamp((T - t0 - 0.3) / 0.4, 0, 1); if (ua <= 0) return;
      g.save(); g.globalAlpha *= ua; g.fillStyle = s.accent; g.fillRect(x - gap / 2 - 2 * unit, y - 3 * unit, 3.5 * unit, ch + 6 * unit);
      chip(g, s.eventLabel.toUpperCase(), x + 4 * unit, y + ch * 0.48, 11.5 * unit, s.accent, '#111', 'tl'); g.restore();
    }
  });
}
function drawFlip(g, s, frames, fr, unit, T, L, tm) {
  const n = frames.length; if (!n) return;
  const per = Math.max(0.3, +s.flipSec || 1.4), xf = Math.min(0.35, per * 0.3);
  const pos = tm.edit ? n - 1 : clamp((T - 0.3) / per, 0, n - 1 + 0.999);
  const k = Math.floor(pos), u = pos - k;
  const ix = fr.x + fr.w * 0.03, iy = fr.y + fr.h * 0.06, iw = fr.w * 0.94, ih = fr.h * (s.footer ? 0.73 : 0.78);
  drawPass(g, frames[k], ix, iy, iw, ih, s, unit, 1, 1);
  const fade = clamp((u * per - (per - xf)) / xf, 0, 1);
  if (fade > 0 && frames[k + 1]) drawPass(g, frames[k + 1], ix, iy, iw, ih, s, unit, fade, fade);
  const f = frames[fade > 0.5 && frames[k + 1] ? k + 1 : k];
  // date stamp + site + count
  const c1 = chip(g, f.label.toUpperCase(), ix + 14 * unit, iy + 14 * unit, 20 * unit, 'rgba(8,11,16,0.86)', '#ffffff', 'tl');
  if (s.site || s.kicker) chip(g, (s.kicker || s.site).toUpperCase(), ix + 14 * unit, iy + 18 * unit + c1.h, 12 * unit, s.accent, '#111', 'tl');
  if (s.showCount !== false && f.count != null) {
    g.save(); g.fillStyle = 'rgba(8,11,16,0.86)'; const bw = 190 * unit, bh = 74 * unit; g.fillRect(ix + iw - bw - 14 * unit, iy + 14 * unit, bw, bh);
    g.fillStyle = s.accent; g.font = `700 ${40 * unit}px ${SANS}`; g.textAlign = 'right'; g.textBaseline = 'alphabetic'; g.fillText(String(f.count), ix + iw - 28 * unit, iy + 60 * unit);
    g.fillStyle = '#ffffff'; g.font = `600 ${11 * unit}px ${MONO}`; g.textAlign = 'left'; g.fillText(String(s.countWord || '').toUpperCase(), ix + iw - bw - 2 * unit, iy + 34 * unit); g.fillText('ON THIS PASS', ix + iw - bw - 2 * unit, iy + 50 * unit); g.restore();
  }
  // timeline strip
  const ty = iy + ih + 14 * unit, th = fr.h * 0.07, tw = iw, mxc = Math.max(1, ...frames.map((q) => q.count || 0)), ev = eventIndex(s, frames);
  frames.forEach((q, i) => {
    const bx = ix + (i + 0.5) * (tw / n), bh = s.showCount !== false ? Math.max(2 * unit, (q.count || 0) / mxc * th) : 4 * unit;
    g.fillStyle = i === k ? s.accent : 'rgba(255,255,255,0.35)';
    g.fillRect(bx - Math.min(10 * unit, tw / n * 0.3), ty + th - bh, Math.min(20 * unit, tw / n * 0.6), bh);
    if (i === ev && s.eventLabel) { g.fillStyle = s.accent; g.fillRect(bx - tw / n / 2, ty - 4 * unit, 2 * unit, th + 8 * unit); g.font = `600 ${10 * unit}px ${MONO}`; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText(s.eventLabel.toUpperCase(), bx - tw / n / 2 + 5 * unit, ty - 2 * unit); }
  });
  g.font = `500 ${10 * unit}px ${MONO}`; g.fillStyle = 'rgba(255,255,255,0.7)'; g.textBaseline = 'top';
  g.textAlign = 'left'; g.fillText(frames[0].label.toUpperCase(), ix, ty + th + 4 * unit); g.textAlign = 'right'; g.fillText(frames[n - 1].label.toUpperCase(), ix + iw, ty + th + 4 * unit);
}
function drawDash(g, s, frames, fr, unit, T, L) {
  const n = frames.length;
  const x0 = fr.x + fr.w * 0.045, w = fr.w * 0.91;
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = `600 ${14 * unit}px ${MONO}`; g.fillStyle = s.accent; g.fillText((s.kicker || '').toUpperCase(), x0, fr.y + fr.h * 0.1);
  g.font = `600 ${28 * unit}px ${SANS}`; g.fillStyle = '#fff'; g.fillText(s.site || s.head1 || '', x0, fr.y + fr.h * 0.1 + 38 * unit);
  if (!n) return;
  const counts = frames.map((f) => f.count || 0), mxc = Math.max(1, ...counts), last = frames[n - 1];
  const peakI = counts.indexOf(Math.max(...counts)), avg = counts.reduce((a, b) => a + b, 0) / n;
  const ev = eventIndex(s, frames);
  const before = ev > 0 ? counts.slice(0, ev) : [], after = ev > 0 ? counts.slice(ev) : [];
  const kpis = [['PASSES', String(n), `${frames[0].label} – ${last.label}`], ['LATEST', String(last.count ?? '–'), last.label], ['PEAK', String(counts[peakI]), frames[peakI].label], ev > 0 && after.length ? ['AVERAGE BEFORE → AFTER', `${(before.reduce((a, b) => a + b, 0) / before.length).toFixed(1)} → ${(after.reduce((a, b) => a + b, 0) / after.length).toFixed(1)}`, s.eventLabel || dayText(s.eventDay)] : ['AVERAGE', avg.toFixed(1), `${s.countWord || ''} per pass`]];
  const ky = fr.y + fr.h * 0.2, kh = fr.h * 0.16, kw = (w * 0.62 - 3 * 10 * unit) / 4;
  kpis.forEach(([a, b, c], i) => {
    const u = easeOut((T - 0.3 - i * 0.15) / 0.5); if (u <= 0) return;
    const x = x0 + i * (kw + 10 * unit);
    g.save(); g.globalAlpha *= u; g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x, ky, kw, kh);
    g.fillStyle = s.accent; g.fillRect(x, ky, 3 * unit, kh);
    g.font = `600 ${10.5 * unit}px ${MONO}`; g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillText(a, x + 14 * unit, ky + 22 * unit);
    g.font = `700 ${(b.length > 7 ? 24 : 34) * unit}px ${SANS}`; g.fillStyle = '#fff'; g.fillText(b, x + 14 * unit, ky + kh * 0.66);
    g.font = `400 ${11 * unit}px ${SANS}`; g.fillStyle = 'rgba(255,255,255,0.65)'; g.fillText(c, x + 14 * unit, ky + kh - 12 * unit); g.restore();
  });
  // bar chart
  const cx = x0, cy = fr.y + fr.h * 0.43, cw = w * 0.62, ch = fr.h * (s.footer ? 0.38 : 0.44);
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
  const stepV = Math.max(1, Math.ceil(mxc / 4));
  g.font = `500 ${10 * unit}px ${MONO}`; g.fillStyle = 'rgba(255,255,255,0.55)'; g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let v = 0; v <= mxc; v += stepV) { const y = cy + ch - (v / mxc) * ch; g.beginPath(); g.moveTo(cx + 24 * unit, y); g.lineTo(cx + cw, y); g.stroke(); g.fillText(String(v), cx + 18 * unit, y); }
  const bx0 = cx + 30 * unit, bw = (cw - 30 * unit) / n;
  frames.forEach((f, i) => {
    const u = easeOut((T - 0.8 - i * Math.min(0.12, 2 / n)) / 0.6); const h = ((f.count || 0) / mxc) * ch * u;
    g.fillStyle = ev >= 0 && i >= ev ? s.accent : 'rgba(255,255,255,0.55)';
    g.fillRect(bx0 + i * bw + bw * 0.18, cy + ch - h, bw * 0.64, h);
    if (u > 0.9) { g.fillStyle = '#fff'; g.font = `600 ${10.5 * unit}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(String(f.count || 0), bx0 + (i + 0.5) * bw, cy + ch - h - 3 * unit); }
    g.save(); g.translate(bx0 + (i + 0.5) * bw, cy + ch + 8 * unit); g.rotate(n > 10 ? -0.6 : 0); g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = `500 ${9.5 * unit}px ${MONO}`; g.textAlign = n > 10 ? 'right' : 'center'; g.textBaseline = 'top';
    g.fillText(n > 10 ? f.label.replace(/^\d+ /, '') : f.label, 0, 0); g.restore();
  });
  if (ev > 0) { const x = bx0 + ev * bw; g.fillStyle = s.accent; g.fillRect(x - 1 * unit, cy - 10 * unit, 2 * unit, ch + 10 * unit); if (s.eventLabel) chip(g, s.eventLabel.toUpperCase(), x + 4 * unit, cy - 10 * unit, 10.5 * unit, s.accent, '#111', 'tl'); }
  // latest image
  const ix = x0 + w * 0.66, iy = fr.y + fr.h * 0.2, iw = w * 0.34, ih = fr.h * (s.footer ? 0.61 : 0.67);
  const u = easeOut((T - 0.6) / 0.6);
  if (u > 0) { g.save(); g.globalAlpha *= u; drawPass(g, last, ix, iy, iw, ih, s, unit, 1, 1); chip(g, `LATEST · ${last.label.toUpperCase()}`, ix + 6 * unit, iy + ih - 6 * unit, 11 * unit, 'rgba(8,11,16,0.86)', '#fff', 'bl'); countTag(g, s, last, ix + iw - 6 * unit, iy + 6 * unit, unit); g.restore(); }
}
function drawPair(g, s, frames, fr, unit, T, L) {
  const n = frames.length; if (!n) return;
  const a = frames[0], b = frames[n - 1];
  const y = fr.y + fr.h * 0.16, h = fr.h * (s.footer ? 0.68 : 0.74), gap = fr.w * 0.012, w = (fr.w * 0.94 - gap) / 2, x = fr.x + fr.w * 0.03;
  g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.font = `600 ${14 * unit}px ${MONO}`; g.fillStyle = s.accent; g.fillText((s.kicker || '').toUpperCase(), x, fr.y + fr.h * 0.075);
  g.font = `600 ${24 * unit}px ${SANS}`; g.fillStyle = '#fff'; g.fillText(s.head1 || s.site || '', x, fr.y + fr.h * 0.075 + 32 * unit);
  [[a, x, 0.3], [b, x + w + gap, 0.9]].forEach(([f, X, t0]) => {
    const u = easeOut((T - t0) / 0.5); if (u <= 0) return;
    g.save(); g.globalAlpha *= u; drawPass(g, f, X, y, w, h, s, unit, 1, clamp((T - t0 - 0.5) / 0.4, 0, 1));
    chip(g, f.label.toUpperCase(), X + 8 * unit, y + h - 8 * unit, 14 * unit, 'rgba(8,11,16,0.86)', '#fff', 'bl'); countTag(g, s, f, X + w - 8 * unit, y + 8 * unit, unit); g.restore();
  });
}

// ---------------------------------------------------------------- the story (scenes) for a site
/**
 * info: { site, frames, source, from, to, target, eventDay, eventLabel, headline...}
 * returns { name, scenes, sound } — built with the app's own helpers (passed in to avoid import cycles)
 */
export function buildSiteStory(info, H) {
  const { site, frames, source } = info;
  const B = H.briefing, A = H.autostory, Sc = H.scene;
  const inc = frames.filter((f) => f.include !== false);
  const word = info.target === 'aircraft' ? 'aircraft' : 'ships';
  const typeName = SITE_TYPES[site.type]?.one || 'Site';
  const siteName = site.name;
  const shortName = siteName.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\b(port|airport|air base|naval base)\b/ig, '').trim() || siteName;
  const srcInfo = SW_SOURCES[source];
  const span = inc.length ? `${dayText(inc[0].day)} to ${dayText(inc[inc.length - 1].day)}` : '';
  const footer = `${srcInfo.short} · ${source === 'wayback' ? 'every distinct image of the site' : 'the clearest pass of each month'}, ${span} · ${srcInfo.credit}${info.target !== 'none' ? ` · ${word} marked ${info.detector === 'ai' ? 'by an AI detector' : 'automatically'}${info.checked ? ' and checked by eye' : ' — check before publishing'}` : ''}`;
  const common = { site: siteName, kicker: `${shortName} from orbit`, frames: inc, countWord: word, showCount: info.target !== 'none', showBoxes: info.target !== 'none', eventDay: info.eventDay || '', eventLabel: info.eventLabel || '', footer, accent: info.accent || '#ffc629' };
  const head1 = info.head1 ?? (word === 'aircraft' ? 'Aircraft come and go.' : 'A transponder can be switched off.');
  const head2 = info.head2 ?? (word === 'aircraft' ? 'The apron keeps the record.' : 'A hull can’t hide from a satellite.');
  const body = info.body ?? `${source === 'wayback' ? 'Every new high-resolution image' : 'The clearest pass of every month'}, ${inc.length ? `${monthText(inc[0].day)} to ${monthText(inc[inc.length - 1].day)}` : ''}: **${inc.length} in all**`;
  const ll = site.ll, L = A.mkLayer, K = A.camKey, V = A.camView;
  const sat = { theme: 'satellite', placeNames: false, rasterLabels: false, buildings3d: false, terrain: false, clouds: false, globe: true };
  const scene = (name, keys, stillEnd = 0.5, look = sat) => { const sc = Sc.newScene(name); Object.assign(sc.look, look); sc.camera.mode = 'keyframes'; sc.camera.keys = keys; sc.stillStart = 0; sc.stillEnd = stillEnd; sc.transition = 'scanwipe'; sc.transitionSeconds = 0.8; return sc; };
  const brief = { ll, title: `${shortName} from orbit`, sub: `${typeName} · ${inc.length} satellite passes · ${word} counted`, kicker: 'Satellite watch', tag: typeName, date: span, place: siteName, country: 'Iran', event: `${typeName} · ${srcInfo.short}`, eventKey: 'military', coords: `${ll[1].toFixed(4)}° N, ${ll[0].toFixed(4)}° E`, sources: `Imagery: ${srcInfo.credit}. Site positions: OpenStreetMap contributors. Counts are automatic${info.checked ? ' and were checked by eye' : ''}.`, geobrief: true, accent: common.accent, assessment: info.target !== 'none' ? `${inc.reduce((a, f) => a + (f.count || 0), 0)} ${word} marked across ${inc.length} passes` : '' };
  const frameOf = (layout, extra = {}) => B.splitBriefing(B.briefFrame(brief, layout, { dateLabel: 'Period', eventLabel: 'Watch', assessLabel: 'Count', ...extra }));
  const zoomEnd = clamp(Math.log2(40075 * Math.cos(ll[1] * D2R) / ((info.km || 3) * 1.6)) , 12, 17);
  const scenes = [];
  { const z = { ...B.ZOOM_DEFAULTS, ll, place: siteName, sec: 8, end: zoomEnd, tilt: 0, rotate: 0, spin: 0 }; const sc = scene('Zoom to the site', [], 0.8); Object.assign(sc.camera, B.zoomCamera(ll, z.sec, z.end, z)); sc.briefZoom = z; sc.layers = frameOf('zoom'); scenes.push(sc); }
  const still = [K(0, V(ll, zoomEnd - 0.4), 'linear'), K(10, V(ll, zoomEnd - 0.2), 'linear')];
  const gridDur = 1.5 + Math.min(3.4, inc.length * 0.22) + 5;
  { const sc = scene('Pass grid', still, Math.max(0.5, gridDur - 10)); sc.layers = [L('sitewatch', null, 0, { duration: gridDur, anim: 'cascade', name: 'Site watch · grid', style: { ...SW_DEFAULTS.sitewatch, ...common, layout: 'grid', head1, head2, body } })]; scenes.push(sc); }
  const flipDur = 0.6 + inc.length * 1.3 + 1;
  { const sc = scene('Flip through', still, Math.max(0.5, flipDur - 10)); sc.layers = [L('sitewatch', null, 0, { duration: flipDur, anim: 'none', name: 'Site watch · flip-through', style: { ...SW_DEFAULTS.sitewatch, ...common, layout: 'flip', flipSec: 1.3, bgAlpha: 1 } })]; scenes.push(sc); }
  if (info.target !== 'none') { const sc = scene('Count dashboard', still, 0.5); sc.layers = [L('sitewatch', null, 0, { duration: 8, anim: 'fade', name: 'Site watch · dashboard', style: { ...SW_DEFAULTS.sitewatch, ...common, layout: 'dashboard' } })]; scenes.push(sc); }
  { const sc = scene('End', [K(0, V(ll, zoomEnd - 1.5), 'linear'), K(5, V(ll, zoomEnd - 1.8, 8), 'linear')], 0.3); sc.layers = frameOf('end', { title: `${shortName} from orbit` }); sc.transition = 'none'; scenes.push(sc); }
  return { name: `${siteName} — satellite watch`, scenes, sound: { auto: true, v2: true, music: 'track:in-the-bardo', musicVolume: 0.35 }, brand: { lower: false } };
}

// ---------------------------------------------------------------- the dialog
export function openSiteWatch({ onCreate, helpers }) {
  document.getElementById('sw-dlg')?.remove();
  const d = document.createElement('dialog');
  d.id = 'sw-dlg'; d.className = 'modal sw-dlg';
  const today = new Date().toISOString().slice(0, 10);
  const from0 = new Date(Date.now() - 400 * 864e5); from0.setUTCDate(1);
  d.innerHTML = `<form method="dialog" class="sar-head"><div><h3>🛰 Site watch — ports & air bases from orbit</h3><p class="muted small">Pick a port, naval base or air base, choose the satellite imagery, and get the clearest pass of every month with the ships or aircraft on it counted — then a video: zoom to the site, a grid of passes, a flip-through and a count dashboard.</p></div><button class="btn sm" value="x" aria-label="Close">✕</button></form>
  <div class="sw-body">
    <div class="sw-left">
      <div class="sw-types" id="sw-types"><button type="button" class="on" data-t="">All</button>${Object.entries(SITE_TYPES).map(([k, v]) => `<button type="button" data-t="${k}">${v.icon} ${esc(v.name)}</button>`).join('')}</div>
      <input type="search" id="sw-q" placeholder="Search — e.g. Bandar Abbas, Bushehr, Chabahar, OIBB…">
      <div class="sw-list" id="sw-list"><p class="muted small">Loading the site list…</p></div>
      <details class="sw-custom"><summary>A place that isn’t listed</summary><div class="sw-row"><input id="sw-cname" placeholder="Name"><input id="sw-cll" placeholder="lat, lon — e.g. 27.106, 56.072"><select id="sw-ctype">${Object.entries(SITE_TYPES).map(([k, v]) => `<option value="${k}">${esc(v.one)}</option>`).join('')}</select><button type="button" class="btn sm" id="sw-cuse">Use</button></div></details>
      <p class="muted tiny" id="sw-src"></p>
    </div>
    <div class="sw-right">
      <div class="sw-picked" id="sw-picked"><span class="muted">← pick a site</span></div>
      <label>Imagery <select id="sw-source">${Object.entries(SW_SOURCES).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('')}</select></label>
      <div class="sw-row"><label>From <input type="date" id="sw-from" value="${from0.toISOString().slice(0, 10)}"></label><label>To <input type="date" id="sw-to" value="${today}"></label><label>Area <select id="sw-km"><option value="1.5">1.5 km</option><option value="2">2 km</option><option value="3" selected>3 km</option><option value="4">4 km</option><option value="6">6 km</option><option value="8">8 km</option></select></label></div>
      <div class="sw-row"><label>Detect <select id="sw-target"><option value="ships">Ships</option><option value="aircraft">Aircraft</option><option value="both">Ships and aircraft</option><option value="none">Nothing — images only</option></select></label><label id="sw-cloudw">Max cloud <select id="sw-cloud"><option>10</option><option selected>30</option><option>60</option></select> %</label></div>
      <p class="muted tiny" id="sw-hint"></p>
      <div class="sw-row"><label>Event marker <input type="date" id="sw-evday"></label><label>Label <input id="sw-evlabel" placeholder="e.g. WAR BEGINS 28 FEB"></label></div>
      <div class="sw-actions"><button type="button" class="btn primary" id="sw-go">Fetch passes & count</button><span class="muted small" id="sw-status"></span></div>
      <div class="sw-res" id="sw-res"></div>
      <div class="sw-actions" id="sw-done" hidden><label class="small"><input type="checkbox" id="sw-checked"> I checked the counts by eye</label><button type="button" class="btn primary" id="sw-make">🎬 Create the video</button></div>
    </div>
  </div>`;
  document.body.appendChild(d); d.showModal(); d.addEventListener('close', () => d.remove());
  const $ = (s) => d.querySelector(s);
  let sites = [], type = '', site = null, run = null, busy = false;
  const list = () => {
    const q = $('#sw-q').value.trim().toLowerCase();
    const xs = sites.filter((s) => (!type || s.type === type) && (!q || `${s.name} ${s.local || ''} ${s.icao || ''} ${s.iata || ''}`.toLowerCase().includes(q)));
    $('#sw-list').innerHTML = xs.length ? xs.map((s) => `<button type="button" class="sw-site${site?.id === s.id ? ' on' : ''}" data-id="${esc(s.id)}"><i>${SITE_TYPES[s.type]?.icon || '•'}</i><span><b>${esc(s.name)}</b><small>${esc(SITE_TYPES[s.type]?.one || '')}${s.icao ? ` · ${esc(s.icao)}` : ''}${s.local && s.local !== s.name ? ` · <span dir="rtl">${esc(s.local)}</span>` : ''}</small></span></button>`).join('') : '<p class="muted small">No site matches — add it below with its coordinates.</p>';
  };
  const pick = (s) => {
    site = s; list();
    const t = SITE_TYPES[s.type];
    $('#sw-picked').innerHTML = `<b>${t?.icon || ''} ${esc(s.name)}</b><small class="muted">${esc(t?.one || '')} · ${s.ll[1].toFixed(4)}, ${s.ll[0].toFixed(4)}</small>`;
    $('#sw-target').value = t?.target || 'ships';
    $('#sw-km').value = String(t?.km || 3);
    if (t?.target === 'aircraft') $('#sw-source').value = 'wayback';
    hint();
  };
  const hint = () => {
    const src = $('#sw-source').value, tg = $('#sw-target').value;
    $('#sw-cloudw').style.display = src === 'esri_s2' || src === 'pc_s2' ? '' : 'none';
    $('#sw-hint').textContent = src === 'wayback' ? 'Sub-metre images; Esri adds a new one for a place only every few months, so expect a handful. Ships and aircraft are found by the on-device AI detector (downloads once, ~10 MB).'
      : tg === 'aircraft' ? 'At 10 m aircraft are only a few pixels — choose Esri World Imagery Wayback to detect aircraft. Sentinel passes will be shown without counts.'
      : src === 'pc_s1' ? 'Radar: ships show as bright points on dark water, through cloud and at night. Anything that never moves (piers, jetties) is removed.'
      : 'Ships are found as bright objects on or beside the water; anything that is there on almost every pass (piers, jetties) is removed. Check the counts — click a pass to correct it.';
  };
  loadSites().then((j) => { sites = j.sites; $('#sw-src').textContent = j.source ? `${sites.length} sites · ${j.source}${j.updated ? ` · ${j.updated}` : ''}` : ''; list(); });
  $('#sw-types').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; type = b.dataset.t; d.querySelectorAll('#sw-types button').forEach((x) => x.classList.toggle('on', x === b)); list(); });
  $('#sw-q').addEventListener('input', list);
  $('#sw-list').addEventListener('click', (e) => { const b = e.target.closest('.sw-site'); if (b) pick(sites.find((s) => s.id === b.dataset.id)); });
  $('#sw-cuse').onclick = () => { const m = $('#sw-cll').value.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/); if (!m) { $('#sw-cll').focus(); return; } pick({ id: `c${Date.now()}`, type: $('#sw-ctype').value, name: $('#sw-cname').value.trim() || 'Site', ll: [+m[2], +m[1]] }); };
  $('#sw-source').addEventListener('change', hint); $('#sw-target').addEventListener('change', hint); hint();
  const status = (t) => { $('#sw-status').textContent = t; };
  const renderRes = () => {
    const fs = run?.frames || [];
    $('#sw-res').innerHTML = fs.map((f, i) => `<div class="sw-pass${f.include === false ? ' off' : ''}" data-i="${i}"><canvas width="160" height="160"></canvas><b>${esc(f.label)}</b><small>${run.target !== 'none' ? `${f.count} ${esc(run.word)}` : ''}${f.cloud ? ` · cloud ${f.cloud}%` : ''}</small><label><input type="checkbox" ${f.include === false ? '' : 'checked'}> use</label></div>`).join('');
    fs.forEach((f, i) => paintThumb(d.querySelector(`.sw-pass[data-i="${i}"] canvas`), f));
    $('#sw-done').hidden = !fs.length;
  };
  $('#sw-res').addEventListener('change', (e) => { const p = e.target.closest('.sw-pass'); if (!p) return; run.frames[+p.dataset.i].include = e.target.checked; p.classList.toggle('off', !e.target.checked); });
  $('#sw-res').addEventListener('click', (e) => { const p = e.target.closest('.sw-pass'); if (!p || e.target.closest('label')) return; openEditor(run.frames[+p.dataset.i], run, renderRes); });
  $('#sw-go').onclick = async () => {
    if (busy) return;
    if (!site) { status('Pick a site first'); return; }
    busy = true; $('#sw-go').disabled = true; $('#sw-res').innerHTML = ''; $('#sw-done').hidden = true;
    const target = $('#sw-target').value;
    run = { frames: [], target, word: target === 'aircraft' ? 'aircraft' : target === 'both' ? 'objects' : 'ships' };
    try {
      const res = await fetchSitePasses({ site, km: +$('#sw-km').value, source: $('#sw-source').value, from: $('#sw-from').value, to: $('#sw-to').value, maxCloud: +$('#sw-cloud').value, target, onStatus: status, onFrame: (f, all) => { run.frames = all.slice().sort((a, b) => a.day.localeCompare(b.day)); renderRes(); } });
      Object.assign(run, res, { source: $('#sw-source').value });
      if (run.detector === 'none' && target !== 'none') run.target = 'none';
      renderRes();
      status(`${res.frames.length} passes${run.target !== 'none' ? ` · ${res.frames.reduce((a, f) => a + f.count, 0)} ${run.word} marked in all — click a pass to correct it` : ''}`);
    } catch (e) { status(`⚠ ${e.message}`); }
    busy = false; $('#sw-go').disabled = false;
  };
  $('#sw-make').onclick = () => {
    if (!run?.frames?.length) return;
    const frames = run.frames.map(({ url, ...f }) => f);
    const story = buildSiteStory({ site, frames, source: run.source, target: run.target, detector: run.detector, km: run.km, checked: $('#sw-checked').checked, eventDay: $('#sw-evday').value, eventLabel: $('#sw-evlabel').value.trim() }, helpers);
    d.close(); onCreate?.(story);
  };
}
function paintThumb(cv, f) {
  if (!cv) return;
  const g = cv.getContext('2d'), im = new Image();
  im.onload = () => { const k = Math.max(cv.width / im.width, cv.height / im.height), w = im.width * k, h = im.height * k, x = (cv.width - w) / 2, y = (cv.height - h) / 2; g.drawImage(im, x, y, w, h); g.strokeStyle = '#ff4d3d'; g.lineWidth = 1.5; for (const b of f.boxes || []) { const bw = Math.max(5, (b.x1 - b.x0) * w), bh = Math.max(5, (b.y1 - b.y0) * h); g.strokeRect(x + b.cx * w - bw / 2, y + b.cy * h - bh / 2, bw, bh); } };
  im.src = f.url;
}
/** correct one pass: click a marker to remove it, click anywhere else to add one */
function openEditor(f, run, onDone) {
  const e = document.createElement('dialog'); e.className = 'modal sw-edit';
  e.innerHTML = `<form method="dialog" class="sar-head"><div><h3>${esc(f.label)} — ${f.count} ${esc(run.word)}</h3><p class="muted small">Click a red box to remove it · click a ship / aircraft that was missed to add it.</p></div><button class="btn sm" value="x">Done</button></form><canvas></canvas>`;
  document.body.appendChild(e); e.showModal();
  const cv = e.querySelector('canvas'), g = cv.getContext('2d'), im = new Image();
  const paint = () => {
    const k = Math.min(Math.min(window.innerWidth * 0.86, 1100) / im.width, (window.innerHeight * 0.72) / im.height);
    cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
    g.drawImage(im, 0, 0, cv.width, cv.height); g.strokeStyle = '#ff4d3d'; g.lineWidth = 2;
    for (const b of f.boxes) { const bw = Math.max(10, (b.x1 - b.x0) * cv.width), bh = Math.max(10, (b.y1 - b.y0) * cv.height); g.strokeRect(b.cx * cv.width - bw / 2, b.cy * cv.height - bh / 2, bw, bh); }
    e.querySelector('h3').textContent = `${f.label} — ${f.boxes.length} ${run.word}`;
  };
  im.onload = paint; im.src = f.url;
  cv.addEventListener('click', (ev) => {
    const r = cv.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
    const hit = f.boxes.findIndex((b) => Math.abs(b.cx - x) < Math.max(0.012, (b.x1 - b.x0) / 2 + 0.004) && Math.abs(b.cy - y) < Math.max(0.012, (b.y1 - b.y0) / 2 + 0.004));
    if (hit >= 0) f.boxes.splice(hit, 1);
    else { const s = 0.012; f.boxes.push({ cls: run.target === 'aircraft' ? 'aircraft' : 'ship', manual: true, x0: x - s, x1: x + s, y0: y - s, y1: y + s, cx: x, cy: y }); }
    f.count = f.boxes.length; paint();
  });
  e.addEventListener('close', () => { e.remove(); onDone?.(); });
}
