// Builds the SAR open-data library: small preview images only (never the full SAR products), plus
// sar/index.json with footprints, dates and credits. Runs in GitHub Actions (.github/workflows/sar-library.yml).
//   Capella Space Open Data — the _thumb.png of each GEO product          (CC BY 4.0)
//   ICEYE SAR Open Data     — the smallest overview of the QLK quicklook   (CC BY 4.0)
//   Umbra Open Data         — the smallest overview inside the GEC COG      (CC BY 4.0) — read with HTTP ranges,
//                             so only a few hundred kB of each file is downloaded
// The S3 buckets send no CORS headers, so the previews are copied into this repo (sar/thumbs/*.webp).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { fromUrl } from 'geotiff';

const OUT = new URL('../sar/', import.meta.url);
const PER = +(process.env.SAR_PER_PROVIDER || 70);
const MAXPX = 760;
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = async (u, tries = 3) => {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(u); if (r.ok) return await r.json(); if (r.status === 404) return null; } catch { /* retry */ }
    await sleep(600 * (i + 1));
  }
  return null;
};
async function pool(list, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); } }));
  return out;
}
/** every item URL below a STAC catalog / collection */
async function crawl(root, max = 4000) {
  const items = [], seen = new Set();
  let q = [root];
  while (q.length && items.length < max) {
    const next = [];
    await pool(q, 12, async (u) => {
      if (seen.has(u)) return; seen.add(u);
      const j = await getJSON(u);
      if (!j) return;
      if (j.type === 'Feature') { items.push({ url: u, item: j }); return; }
      for (const l of j.links || []) {
        const h = new URL(l.href, u).href;
        if (l.rel === 'item') items.push({ url: h });
        else if (l.rel === 'child') next.push(h);
      }
    });
    q = next;
  }
  return items.slice(0, max);
}
const lonlatOf = (it) => { const b = it.bbox; return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
/** spread the picks over the world: at most one per 1° cell, spotlight first, newest first */
function spread(list, n) {
  const score = (x) => (/spot/i.test(x.mode) ? 2 : 0) + (Date.parse(x.date) || 0) / 1e13;
  const cells = new Set(), out = [];
  for (const x of list.slice().sort((a, b) => score(b) - score(a))) {
    const c = `${Math.floor(x.center[0])}:${Math.floor(x.center[1])}`;
    if (cells.has(c)) continue;
    cells.add(c); out.push(x);
    if (out.length >= n) break;
  }
  return out;
}

// ---------------------------------------------------------------- the three catalogues
async function capella() {
  const refs = await crawl('https://capella-open-data.s3.us-west-2.amazonaws.com/stac/capella-open-data-by-datetime/catalog.json');
  log(`Capella: ${refs.length} items`);
  const full = await pool(refs, 16, async (r) => r.item || await getJSON(r.url));
  const byCollect = new Map();
  for (const it of full) {
    if (!it?.bbox || !it.assets?.thumbnail) continue;
    const key = it.id.replace(/_(GEC|GEO|SLC|SICD|SIDD|CPHD)_/, '_');
    if (byCollect.has(key)) continue;
    byCollect.set(key, {
      id: `capella-${it.id}`, provider: 'Capella', date: it.properties.datetime, mode: it.properties['sar:instrument_mode'] || '', pol: (it.properties['sar:polarizations'] || []).join('/'),
      bbox: it.bbox, footprint: it.geometry?.coordinates?.[0], center: lonlatOf(it), src: { kind: 'png', url: it.assets.thumbnail.href }, credit: '© Capella Space, CC BY 4.0',
      item: it.links?.find((l) => l.rel === 'self')?.href || '',
    });
  }
  return [...byCollect.values()];
}
async function iceye() {
  const col = await getJSON('https://iceye-open-data-catalog.s3.amazonaws.com/collections/iceye-sar.json');
  const refs = (col?.links || []).filter((l) => l.rel === 'item').map((l) => new URL(l.href, 'https://iceye-open-data-catalog.s3.amazonaws.com/collections/').href);
  log(`ICEYE: ${refs.length} items`);
  const full = await pool(refs, 16, (u) => getJSON(u));
  return full.filter((it) => it?.bbox && it.assets?.['qlk-cog']).map((it) => ({
    id: `iceye-${it.id}`, provider: 'ICEYE', date: it.properties.datetime, mode: it.properties['sar:instrument_mode'] || '', pol: (it.properties['sar:polarizations'] || []).join('/'),
    bbox: it.bbox, footprint: it.geometry?.coordinates?.[0], center: lonlatOf(it), src: { kind: 'tif', url: it.assets['qlk-cog'].href }, credit: '© ICEYE, CC BY 4.0', item: it.id,
  }));
}
const UMBRA = 'https://umbra-open-data-catalog.s3.us-west-2.amazonaws.com/';
async function umbraKeys(taskId) {
  const t = await (await fetch(`${UMBRA}?list-type=2&prefix=${encodeURIComponent(`sar-data/task-data/${taskId}/`)}`)).text();
  return [...t.matchAll(/<Key>(.*?)<\/Key>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
}
async function umbra() {
  const refs = [...await crawl(`${UMBRA}stac/2025/catalog.json`), ...await crawl(`${UMBRA}stac/2024/catalog.json`)];
  log(`Umbra: ${refs.length} items`);
  const full = await pool(refs, 16, async (r) => r.item || await getJSON(r.url));
  return full.filter((it) => it?.bbox && it.properties?.['umbra:task_id']).map((it) => {
    const names = Object.keys(it.assets || {});
    const tif = names.find((k) => /_(MM|GEC)\.tif$/i.test(k) && !/CSI/i.test(k)) || names.find((k) => /\.tif$/i.test(k));
    return tif && {
      id: `umbra-${it.id}`, provider: 'Umbra', date: it.properties.datetime, mode: String(it.properties['sar:instrument_mode'] || '').toLowerCase(), pol: (it.properties['sar:polarizations'] || []).join('/'),
      bbox: it.bbox, footprint: it.geometry?.coordinates?.[0], center: lonlatOf(it), src: { kind: 'umbra', task: it.properties['umbra:task_id'], name: tif }, credit: '© Umbra Lab, CC BY 4.0', item: it.id,
    };
  }).filter(Boolean);
}

// ---------------------------------------------------------------- preview → small grey WebP with transparent no-data
function stretch(data, n, nodata) {
  // values → 0..255 with a 2–99.5 % stretch (log for wide-range data), 0 / nodata → transparent
  const vals = [];
  let wide = false, max = 0;
  for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 20000))) { const v = data[i]; if (v && v !== nodata && Number.isFinite(v)) { vals.push(v); max = Math.max(max, v); } }
  if (!vals.length) return null;
  wide = max > 255;
  const f = wide ? (v) => Math.log1p(Math.max(0, v)) : (v) => v;
  const s = vals.map(f).sort((a, b) => a - b);
  const lo = s[Math.floor(s.length * 0.02)], hi = s[Math.floor(s.length * 0.995)] || lo + 1;
  const out = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const v = data[i];
    if (!v || v === nodata || !Number.isFinite(v)) { out[i * 2] = 0; out[i * 2 + 1] = 0; continue; }
    out[i * 2] = Math.max(0, Math.min(255, Math.round(((f(v) - lo) / Math.max(1e-9, hi - lo)) * 255)));
    out[i * 2 + 1] = 255;
  }
  return out;
}
async function fromTiffUrl(url) {
  const tiff = await fromUrl(url, { allowFullFile: false });
  const count = await tiff.getImageCount();
  const imgs = [];
  for (let i = 0; i < count; i++) { const im = await tiff.getImage(i); imgs.push(im); }
  // the smallest overview that is still wide enough
  const pick = imgs.slice().sort((a, b) => a.getWidth() - b.getWidth()).find((im) => im.getWidth() >= MAXPX * 0.8) || imgs.reduce((a, b) => (a.getWidth() > b.getWidth() ? a : b));
  if (pick.getWidth() * pick.getHeight() > 4e6) throw new Error(`no small overview (${pick.getWidth()}×${pick.getHeight()})`);
  const w = pick.getWidth(), h = pick.getHeight();
  const r = await pick.readRasters({ samples: [0] });
  const nodata = pick.getGDALNoData?.() ?? null;
  const ga = stretch(r[0], w * h, nodata);
  if (!ga) throw new Error('empty image');
  return sharp(ga, { raw: { width: w, height: h, channels: 2 } });
}
async function fromPngUrl(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`thumb ${r.status}`);
  const { data, info } = await sharp(Buffer.from(await r.arrayBuffer())).greyscale().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height, c = info.channels;
  const ga = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) { const v = data[i * c]; ga[i * 2] = v; ga[i * 2 + 1] = v ? 255 : 0; }
  return sharp(ga, { raw: { width: info.width, height: info.height, channels: 2 } });
}
async function preview(x) {
  let img;
  if (x.src.kind === 'png') img = await fromPngUrl(x.src.url);
  else if (x.src.kind === 'tif') img = await fromTiffUrl(x.src.url);
  else {
    const key = (await umbraKeys(x.src.task)).find((k) => k.endsWith(x.src.name));
    if (!key) throw new Error('file not found in the bucket');
    img = await fromTiffUrl(UMBRA + key.split('/').map(encodeURIComponent).join('/'));
  }
  const buf = await img.resize({ width: MAXPX, height: MAXPX, fit: 'inside', withoutEnlargement: true }).webp({ quality: 74, alphaQuality: 60 }).toBuffer({ resolveWithObject: true });
  return buf;
}
async function placeName(ll) {
  await sleep(1100);
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${ll[1]}&lon=${ll[0]}&accept-language=en`, { headers: { 'User-Agent': 'GIS-One-Map-Animator SAR library (github.com/rgiq2024/Map-Animator)' } });
    const a = (r.ok ? await r.json() : null)?.address || {};
    return { place: a.city || a.town || a.village || a.municipality || a.county || a.state_district || a.state || a.region || '', country: a.country || '' };
  } catch { return { place: '', country: '' }; }
}

// ---------------------------------------------------------------- main
await mkdir(new URL('thumbs/', OUT), { recursive: true });
const old = existsSync(new URL('index.json', OUT)) ? JSON.parse(await readFile(new URL('index.json', OUT), 'utf8')) : { items: [] };
const have = new Map(old.items.map((x) => [x.id, x]));
const result = [];
const errors = {};
for (const [name, fn] of [['Capella', capella], ['ICEYE', iceye], ['Umbra', umbra]]) {
  let list = [];
  try { list = await fn(); } catch (e) { errors[name] = e.message; log(`${name} catalogue failed: ${e.message}`); }
  const kept = old.items.filter((x) => x.provider === name);
  const picks = spread(list.filter((x) => !have.has(x.id)), Math.max(0, PER - kept.length));
  log(`${name}: ${list.length} usable, keeping ${kept.length}, adding up to ${picks.length}`);
  result.push(...kept);
  let ok = 0;
  for (const x of picks) {
    try {
      const { data, info } = await preview(x);
      const file = `thumbs/${x.id.replace(/[^\w-]+/g, '_').slice(0, 90)}.webp`;
      await writeFile(new URL(file, OUT), data);
      const nm = await placeName(x.center);
      result.push({ id: x.id, provider: x.provider, date: x.date, mode: x.mode, pol: x.pol, place: nm.place, country: nm.country, bbox: x.bbox.map((v) => +(+v).toFixed(5)), footprint: (x.footprint || []).map((p) => [+(+p[0]).toFixed(5), +(+p[1]).toFixed(5)]), thumb: `sar/${file}`, w: info.width, h: info.height, kb: Math.round(data.length / 1024), credit: x.credit, item: x.item });
      ok++;
      if (ok % 10 === 0) log(`  ${name}: ${ok} previews`);
    } catch (e) { log(`  skip ${x.id}: ${e.message}`); }
  }
  log(`${name}: ${ok} new previews`);
}
result.sort((a, b) => String(b.date).localeCompare(String(a.date)));
await writeFile(new URL('index.json', OUT), JSON.stringify({ at: new Date().toISOString(), licence: 'CC BY 4.0 — credit the provider', errors, items: result }));
log(`SAR library: ${result.length} previews, ${Math.round(result.reduce((a, x) => a + (x.kb || 0), 0) / 1024)} MB`);
