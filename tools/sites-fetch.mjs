// Builds sites/iran.json: Iran's ports, naval bases, military air bases and airports from OpenStreetMap
// and Wikidata — names and positions from Wikidata (CC0), filled in from OpenStreetMap (Overpass API, ODbL).
// Runs in GitHub Actions (.github/workflows/sites-library.yml).
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

const AIRBASE = /air ?base|airbase|tactical|\btfb\b|air force|iriaf|irgc|پایگاه هوایی|نیروی هوایی|شکاری|military/i;
const NAVAL = /naval|navy|نیروی دریایی|ندسا|دریابانی|marine base/i;
const KEY = ['rajai', 'rajaee', 'reajie', 'bandar abbas naval', 'shahid bahonar', 'havadarya', 'bandar abbas', 'bandar abbas', 'shahid rajaee', 'shahid bahonar', 'bushehr', 'chabahar', 'konarak', 'jask', 'bandar imam khomeini', 'bandar lengeh', 'kharg', 'khark', 'asaluyeh', 'pars', 'qeshm', 'kish', 'bandar anzali', 'anzali', 'amirabad', 'nowshahr', 'astara', 'khorramshahr', 'abadan', 'mahshahr', 'genaveh', 'dayyer', 'siri', 'lavan', 'abu musa', 'larak', 'hormuz', 'isfahan', 'tabriz', 'hamadan', 'shiraz', 'dezful', 'omidiyeh', 'mehrabad', 'tehran', 'mashhad', 'zahedan', 'kerman', 'birjand', 'tabas'];

function classify(t) {
  const name = `${t['name:en'] || ''} ${t.name || ''} ${t.operator || ''} ${t['operator:en'] || ''}`;
  if (t.military === 'naval_base' || (NAVAL.test(name) && !t.aeroway)) return 'naval';
  if (t.military === 'airfield' || (t.aeroway === 'aerodrome' && (t['aerodrome:type'] === 'military' || t.military || t.landuse === 'military' || /air ?base|tactical|air force|پایگاه هوایی|شکاری/i.test(name)))) return 'airbase';
  if (t.aeroway === 'aerodrome') return (t.iata || t.icao) ? 'airport' : null;
  return 'port';
}
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
  // ---- merge: Wikidata first (clean English names), then OpenStreetMap fills in what Wikidata lacks
  // joint civil-military airfields and air bases (IRIAF tactical air bases, army / navy aviation)
  const MIL_ICAO = new Set(['OIBB', 'OIAD', 'OIKB', 'OIZC', 'OITT', 'OIHS', 'OIAJ', 'OISS', 'OIMM', 'OIZH', 'OIII', 'OIID', 'OIIG', 'OIFP', 'OIIF', 'OINJ', 'OIKP', 'OIFH']);
  const WDT = { Q1248784: 'airport', Q644371: 'airport', Q695850: 'airbase', Q44782: 'port', Q1324633: 'naval', Q2215841: 'naval', Q18917976: 'naval', Q7246: 'port' };
  const sites = [];
  for (const b of wd?.results?.bindings || []) {
    const name = b.itemLabel?.value || ''; if (!name || /^Q\d+$/.test(name)) continue;
    const m = String(b.coord?.value || '').match(/Point\(([-\d.]+) ([-\d.]+)\)/); if (!m) continue;
    const icao = b.icao?.value || '';
    let type = WDT[String(b.cls?.value || '').split('/').pop()] || 'port';
    if (type === 'airport' && (MIL_ICAO.has(icao) || /air ?base|tactical|air force/i.test(name))) type = 'airbase';
    if (type === 'port' && NAVAL.test(name)) type = 'naval';
    if (/terminal|bus|train|railway/i.test(name) && !/oil|offshore|loading/i.test(name)) continue;
    sites.push({ id: String(b.item.value).split('/').pop(), type, name, local: b.fa?.value || '', icao, iata: b.iata?.value || '', ll: [+(+m[1]).toFixed(5), +(+m[2]).toFixed(5)], bbox: null, src: 'wd' });
  }
  for (const e of j?.elements || []) {
    const t = e.tags || {};
    let type = classify(t);
    if (!type && t.aeroway === 'aerodrome' && t['name:en'] && /airport|air ?base/i.test(t['name:en'])) type = 'airport';
    if (!type) continue;
    if (type === 'airport' && MIL_ICAO.has(t.icao)) type = 'airbase';
    const c = e.bounds ? { lat: (e.bounds.minlat + e.bounds.maxlat) / 2, lon: (e.bounds.minlon + e.bounds.maxlon) / 2 } : e.lat != null ? { lat: e.lat, lon: e.lon } : null;
    if (!c) continue;
    const name = (t['name:en'] || t.int_name || '').trim() || ((type === 'naval' || type === 'airbase') ? (t.name || '').trim() : '');
    if (!name && !t.icao) continue;
    const b = e.bounds ? [e.bounds.minlon, e.bounds.minlat, e.bounds.maxlon, e.bounds.maxlat].map((v) => +v.toFixed(5)) : null;
    sites.push({ id: `${e.type[0]}${e.id}`, type, name: name || t.icao, local: t['name:fa'] || (t.name !== name ? t.name || '' : ''), icao: t.icao || '', iata: t.iata || '', ll: [+c.lon.toFixed(5), +c.lat.toFixed(5)], bbox: b, src: 'osm' });
  }
  const km = (a, b) => Math.hypot((a[0] - b[0]) * 111.3 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110.6);
  const air = (t) => t === 'airport' || t === 'airbase';
  const out = [];
  for (const s of sites) {
    const d = out.find((o) => (air(o.type) && air(s.type) ? km(o.ll, s.ll) < 3 || (o.icao && o.icao === s.icao) : o.type === s.type && km(o.ll, s.ll) < 2));
    const coarse = (ll) => ll.every((v) => Math.abs(v * 60 - Math.round(v * 60)) < 0.02);
    if (d && coarse(d.ll) && !coarse(s.ll) && !air(s.type)) { d.ll = s.ll; d.name = s.name; }
    if (d) { if (s.type === 'airbase') d.type = 'airbase'; d.icao ||= s.icao; d.iata ||= s.iata; d.local ||= s.local; d.bbox ||= s.bbox; continue; }
    out.push(s);
  }
  for (const s of out) delete s.src;
  const RANK = { naval: 0, port: 1, airbase: 2, airport: 3 };
  const key = (s) => { const n = s.name.toLowerCase(); const i = KEY.findIndex((k) => n.includes(k)); return i < 0 || (i < 3 && air(s.type)) ? 999 : i; };
  out.sort((a, b) => (key(a) < 999 ? 0 : 1) - (key(b) < 999 ? 0 : 1) || (key(a) < 999 && key(b) < 999 ? key(a) - key(b) : 0) || RANK[a.type] - RANK[b.type] || a.name.localeCompare(b.name));
  for (const s of out) s.name = s.name.replace(/\binternaton?al\b/i, 'International').replace(/^shahid /, 'Shahid ').replace(/^malek /, 'Malek ').replace(/\bbehadhti\b/i, 'Beheshti');
  log('sites', out.length, Object.entries(out.reduce((m, s) => ((m[s.type] = (m[s.type] || 0) + 1), m), {})));
  if (out.length > 20) await writeFile(new URL('iran.json', OUT), JSON.stringify({ updated: new Date().toISOString().slice(0, 10), source: 'Wikidata (CC0) and OpenStreetMap contributors (ODbL)', sites: out }));

})();
