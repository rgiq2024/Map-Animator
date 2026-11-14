// Builds sites/iran.json: Iran's ports, naval bases, military air bases and airports from OpenStreetMap
// (Overpass API, © OpenStreetMap contributors, ODbL), with each site's centre and bounding box.
// Runs in GitHub Actions (.github/workflows/sites-library.yml). Also writes sites/probe.json — a check of the
// imagery services the Site watch tool uses (Esri Sentinel-1 / Sentinel-2 image services, Esri Wayback).
import { writeFile, mkdir } from 'node:fs/promises';

const OUT = new URL('../sites/', import.meta.url);
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'User-Agent': 'GIS-One-Map-Animator/1.0 (https://github.com/rgiq2024/Map-Animator)' };
async function getJSON(u, init = {}, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(u, { ...init, headers: { ...UA, ...(init.headers || {}) } }); if (r.ok) return await r.json(); log('HTTP', r.status, u.slice(0, 120)); } catch (e) { log('ERR', e.message); }
    await sleep(4000 * (i + 1));
  }
  return null;
}
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const Q = `[out:json][timeout:240];
area["ISO3166-1"="IR"][admin_level=2]->.ir;
(
  nwr["aeroway"="aerodrome"](area.ir);
  nwr["military"~"^(airfield|naval_base)$"](area.ir);
  nwr["landuse"="port"](area.ir);
  nwr["industrial"="port"](area.ir);
  nwr["harbour"="yes"]["name"](area.ir);
  nwr["seamark:type"="harbour"]["name"](area.ir);
);
out tags bb;`;

const AIRBASE = /air ?base|airbase|tactical|\btfb\b|air force|iriaf|irgc|پایگاه|نیروی هوایی|شکاری|military/i;
const NAVAL = /naval|navy|نیروی دریایی|ندسا|دریابانی|marine base/i;
const KEY = ['bandar abbas', 'shahid rajaee', 'shahid bahonar', 'bushehr', 'chabahar', 'konarak', 'jask', 'bandar imam khomeini', 'bandar lengeh', 'kharg', 'khark', 'asaluyeh', 'pars', 'qeshm', 'kish', 'bandar anzali', 'anzali', 'amirabad', 'nowshahr', 'astara', 'khorramshahr', 'abadan', 'mahshahr', 'genaveh', 'dayyer', 'siri', 'lavan', 'abu musa', 'larak', 'hormuz', 'isfahan', 'tabriz', 'hamadan', 'shiraz', 'dezful', 'omidiyeh', 'mehrabad', 'tehran', 'mashhad', 'zahedan', 'kerman', 'birjand', 'tabas'];

function classify(t) {
  const name = `${t['name:en'] || ''} ${t.name || ''} ${t.operator || ''} ${t['operator:en'] || ''}`;
  if (t.military === 'naval_base' || (NAVAL.test(name) && !t.aeroway)) return 'naval';
  if (t.military === 'airfield' || (t.aeroway === 'aerodrome' && (t['aerodrome:type'] === 'military' || t.military || t.landuse === 'military' || AIRBASE.test(name)))) return 'airbase';
  if (t.aeroway === 'aerodrome') return (t.iata || t.icao) ? 'airport' : null;
  return 'port';
}
function main() {}
(async () => {
  await mkdir(OUT, { recursive: true });
  let j = null;
  for (const ep of OVERPASS) { j = await getJSON(ep, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(Q) }, 2); if (j?.elements?.length) { log('Overpass', ep, j.elements.length); break; } }
  if (process.env.SITES_RAW) await writeFile(new URL('raw-osm.json', OUT), JSON.stringify(j?.elements || []));
  const WDQ = `SELECT ?item ?itemLabel ?fa ?coord ?icao ?iata ?cls WHERE {
    VALUES ?cls { wd:Q1248784 wd:Q695850 wd:Q44782 wd:Q1324633 wd:Q2215841 wd:Q18917976 wd:Q644371 wd:Q7246 }
    ?item wdt:P31 ?cls; wdt:P17 wd:Q794; wdt:P625 ?coord.
    OPTIONAL { ?item wdt:P239 ?icao } OPTIONAL { ?item wdt:P238 ?iata }
    OPTIONAL { ?item rdfs:label ?fa FILTER(lang(?fa) = "fa") }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fa". } }`;
  const wd = await getJSON('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(WDQ), { headers: { Accept: 'application/sparql-results+json' } }, 3);
  if (process.env.SITES_RAW) await writeFile(new URL('raw-wd.json', OUT), JSON.stringify(wd?.results?.bindings || []));
  log('wikidata', wd?.results?.bindings?.length);
  const sites = [];
  for (const e of j?.elements || []) {
    const t = e.tags || {}; const type = classify(t);
    if (!type) continue;
    const c = e.bounds ? { lat: (e.bounds.minlat + e.bounds.maxlat) / 2, lon: (e.bounds.minlon + e.bounds.maxlon) / 2 } : e.lat != null ? { lat: e.lat, lon: e.lon } : null;
    if (!c) continue;
    const b = e.bounds ? [e.bounds.minlon, e.bounds.minlat, e.bounds.maxlon, e.bounds.maxlat].map((v) => +v.toFixed(5)) : null;
    const name = (t['name:en'] || t['int_name'] || t.name || '').trim();
    if (!name && !t.icao) continue;
    sites.push({ id: `${e.type[0]}${e.id}`, type, name: name || t.icao, local: t['name:fa'] || (t.name !== name ? t.name : '') || '', icao: t.icao || '', iata: t.iata || '', ll: [+c.lon.toFixed(5), +c.lat.toFixed(5)], bbox: b });
  }
  // merge duplicates: same type within 2.5 km → keep the one with the larger footprint (names joined)
  const km = (a, b) => Math.hypot((a[0] - b[0]) * 111.3 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110.6);
  const area = (s) => (s.bbox ? (s.bbox[2] - s.bbox[0]) * (s.bbox[3] - s.bbox[1]) : 0);
  sites.sort((a, b) => area(b) - area(a));
  const out = [];
  for (const s of sites) {
    const d = out.find((o) => (o.type === s.type || (o.type === 'airport' && s.type === 'airbase') || (o.type === 'airbase' && s.type === 'airport')) && km(o.ll, s.ll) < 2.5);
    if (d) { if (s.type === 'airbase') d.type = 'airbase'; d.icao ||= s.icao; d.iata ||= s.iata; continue; }
    out.push(s);
  }
  const key = (s) => { const n = s.name.toLowerCase(); const i = KEY.findIndex((k) => n.includes(k)); return i < 0 ? 999 : i; };
  out.sort((a, b) => key(a) - key(b) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  log('sites', out.length, Object.entries(out.reduce((m, s) => ((m[s.type] = (m[s.type] || 0) + 1), m), {})));
  if (out.length > 20) await writeFile(new URL('iran.json', OUT), JSON.stringify({ updated: new Date().toISOString().slice(0, 10), source: 'OpenStreetMap contributors (ODbL), via Overpass API', sites: out }));

  // ---- probe the imagery services
  const probe = {};
  const S2 = 'https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer';
  const S1 = 'https://sentinel1.imagery1.arcgis.com/arcgis/rest/services/Sentinel1RTC/ImageServer';
  const g = { xmin: 56.0, ymin: 27.05, xmax: 56.12, ymax: 27.15, spatialReference: { wkid: 4326 } };
  for (const [k, u] of [['s2', S2], ['s1', S1]]) {
    const info = await getJSON(`${u}?f=json`, {}, 2);
    probe[k] = { fields: (info?.fields || []).map((f) => `${f.name}:${f.type.replace('esriFieldType', '')}`), timeInfo: info?.timeInfo || null, maxImageWidth: info?.maxImageWidth, maxImageHeight: info?.maxImageHeight, rasterFunctions: (info?.rasterFunctionInfos || []).map((r) => r.name) };
    const q = await getJSON(`${u}/query?f=json&where=1%3D1&geometry=${encodeURIComponent(JSON.stringify(g))}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&resultRecordCount=5&orderByFields=${encodeURIComponent('acquisitiondate DESC')}`, {}, 2);
    probe[k].sample = (q?.features || []).slice(0, 5).map((f) => f.attributes);
    probe[k].error = q?.error || null;
  }
  const cfg = await getJSON('https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json', {}, 2);
  const ents = Object.entries(cfg || {}); probe.wayback = { n: ents.length, first: ents.slice(-2), last: ents.slice(0, 2) };
  const latest = ents.map(([k]) => +k).sort((a, b) => b - a)[0];
  const tm = await getJSON(`https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tilemap/${latest}/16/27900/42950`, {}, 2);
  probe.wayback.tilemap = tm;
  await writeFile(new URL('probe.json', OUT), JSON.stringify(probe, null, 1));
  log(JSON.stringify(probe).slice(0, 3000));
})();
