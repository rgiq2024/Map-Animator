// Real satellite scenes, picked by acquisition date:
//  • Microsoft Planetary Computer — STAC search (no account) for Sentinel-2 L2A, Sentinel-1 RTC / GRD and Landsat
//    over the current view; each chosen day becomes a mosaic of that day's scenes served by the PC Data API tiler,
//    with the collection's own render presets (natural colour, colour infrared, NDVI, VV / VH radar…).
//  • Copernicus Data Space — the public catalogue lists the real Sentinel-1 / Sentinel-2 acquisitions; the images
//    come from your (free) Sentinel Hub instance with TIME set to that day.
const PC = 'https://planetarycomputer.microsoft.com/api';
export const PC_COLLECTIONS = {
  'sentinel-2-l2a': { name: 'Sentinel-2 L2A · optical, 10 m', cloud: true, sat: 2 },
  'sentinel-1-rtc': { name: 'Sentinel-1 RTC · radar, terrain-corrected, 10 m', cloud: false, sat: 1 },
  'sentinel-1-grd': { name: 'Sentinel-1 GRD · radar, 10 m', cloud: false, sat: 1 },
  'landsat-c2-l2': { name: 'Landsat 8 / 9 · optical, 30 m', cloud: true, sat: 0 },
  'hls2-s30': { name: 'Harmonized Landsat-Sentinel (HLS S30) · 30 m', cloud: true, sat: 2 },
};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayLabel = (day) => { const d = new Date(`${day}T12:00:00Z`); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

async function json(url, init) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText || ''}`.trim());
  return r.json();
}

const renderCache = new Map();
/** The collection's ready-made looks from Planetary Computer: [{ name, options, minZoom }]. */
export async function pcRenders(collection) {
  if (!renderCache.has(collection)) {
    const p = json(`${PC}/data/v1/mosaic/info?collection=${encodeURIComponent(collection)}`).then((j) => (j.renderOptions || []).filter((o) => o.options && o.type !== 'vt-polygon' && !/legend only/i.test(o.name)).map((o) => ({ name: o.name, options: o.options, minZoom: o.minZoom || 0 })));
    renderCache.set(collection, p);
    p.catch(() => renderCache.delete(collection));
  }
  return renderCache.get(collection);
}

/**
 * Scenes over bbox [w, s, e, n] between from and to (YYYY-MM-DD), grouped by day (newest first):
 * [{ day, label, cloud (min %), n, platform, thumb, ids }]
 */
export async function pcScenes({ collection, bbox, from, to, maxCloud = 100 }) {
  const body = { collections: [collection], bbox, datetime: `${from}T00:00:00Z/${to}T23:59:59Z`, limit: 200, sortby: [{ field: 'datetime', direction: 'desc' }] };
  if (PC_COLLECTIONS[collection]?.cloud && maxCloud < 100) body.query = { 'eo:cloud_cover': { lt: maxCloud } };
  const j = await json(`${PC}/stac/v1/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const byDay = new Map();
  for (const f of j.features || []) {
    const p = f.properties || {};
    const day = String(p.datetime || p.start_datetime || '').slice(0, 10);
    if (!day) continue;
    let g = byDay.get(day);
    if (!g) { g = { day, label: dayLabel(day), cloud: null, n: 0, platform: '', thumb: '', ids: [], orbit: p['sat:orbit_state'] || '' }; byDay.set(day, g); }
    g.n++; g.ids.push(f.id);
    if (p['eo:cloud_cover'] != null) g.cloud = g.cloud == null ? +p['eo:cloud_cover'] : Math.min(g.cloud, +p['eo:cloud_cover']);
    g.platform ||= String(p.platform || p.constellation || '').replace('sentinel-', 'S').replace('landsat-', 'L').toUpperCase();
    g.thumb ||= f.assets?.rendered_preview?.href || f.assets?.thumbnail?.href || '';
  }
  return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
}

/** Map tile URL for one day: a mosaic of that day's scenes over the area, drawn with the chosen render options. */
export async function pcDayTiles({ collection, bbox, day, options, maxCloud = 100 }) {
  const body = { collections: [collection], bbox, datetime: `${day}T00:00:00Z/${day}T23:59:59Z` };
  if (PC_COLLECTIONS[collection]?.cloud && maxCloud < 100) body.query = { 'eo:cloud_cover': { lt: maxCloud } };
  const reg = await json(`${PC}/data/v1/mosaic/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const q = new URLSearchParams(options || '');
  q.set('collection', collection);
  let tj = (reg.links || []).find((l) => /tilejson/i.test(l.rel || '') || /tilejson/.test(l.href || ''))?.href;
  if (!tj && reg.searchid) tj = `${PC}/data/v1/mosaic/${reg.searchid}/tilejson.json`;
  if (!tj) throw new Error('Planetary Computer did not return a mosaic');
  const sep = tj.includes('?') ? '&' : '?';
  const t = await json(`${tj}${sep}${q.toString()}`);
  const url = t.tiles?.[0];
  if (!url) throw new Error('No tiles for that day');
  return { url, minzoom: t.minzoom ?? 0, maxzoom: Math.min(18, t.maxzoom ?? 18) };
}

// ---------------------------------------------------------------- Copernicus Data Space catalogue (public)
/**
 * Real Sentinel acquisitions over bbox from the Copernicus catalogue (OData, no account), grouped by day.
 * sat: 1 (Sentinel-1 GRD) or 2 (Sentinel-2 L2A).
 */
export async function cdseScenes({ sat, bbox, from, to, maxCloud = 100 }) {
  const [w, s, e, n] = bbox.map((v) => +v.toFixed(5));
  const poly = `POLYGON((${w} ${s},${e} ${s},${e} ${n},${w} ${n},${w} ${s}))`;
  let f = `Collection/Name eq 'SENTINEL-${sat}' and OData.CSC.Intersects(area=geography'SRID=4326;${poly}') and ContentDate/Start gt ${from}T00:00:00.000Z and ContentDate/Start lt ${to}T23:59:59.000Z`;
  f += sat === 2 ? " and contains(Name,'MSIL2A')" : " and contains(Name,'_GRD')";
  if (sat === 2 && maxCloud < 100) f += ` and Attributes/OData.CSC.DoubleAttribute/any(att:att/Name eq 'cloudCover' and att/OData.CSC.DoubleAttribute/Value lt ${maxCloud})`;
  const url = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=${encodeURIComponent(f)}&$orderby=${encodeURIComponent('ContentDate/Start desc')}&$top=100&$expand=Attributes`;
  const j = await json(url);
  const byDay = new Map();
  for (const p of j.value || []) {
    const day = String(p.ContentDate?.Start || '').slice(0, 10);
    if (!day) continue;
    let g = byDay.get(day);
    if (!g) { g = { day, label: dayLabel(day), cloud: null, n: 0, platform: String(p.Name || '').slice(0, 3), thumb: '', ids: [] }; byDay.set(day, g); }
    g.n++; g.ids.push(p.Name);
    const cc = (p.Attributes || []).find((a) => a.Name === 'cloudCover')?.Value;
    if (cc != null) g.cloud = g.cloud == null ? +cc : Math.min(g.cloud, +cc);
  }
  return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
}
