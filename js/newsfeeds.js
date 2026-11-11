// News feeds for the news desk: disasters and incidents from the last day(s), from open sources that need no account.
//  • USGS — earthquakes (magnitude, depth, PAGER alert, tsunami flag)
//  • NASA EONET — wildfires, floods, landslides, volcanoes, severe storms, drought, man-made events
//  • GDACS — UN / EU global disaster alerts (floods, cyclones, earthquakes, volcanoes, drought, wildfires) with alert level
//  • GDELT — worldwide news articles by keyword (flash flood, deforestation, illegal migration, explosions…)
// No DOM here: the same code runs in the browser and in the daily GitHub Action (tools/news-fetch.mjs).

export const NEWS_CATS = {
  flood: { name: 'Flood', icon: '🌊', event: 'flood', q: '(flood OR flooding OR inundation)' },
  flashflood: { name: 'Flash flood', icon: '⛈', event: 'flood', q: '("flash flood" OR "flash floods" OR cloudburst)' },
  wildfire: { name: 'Wildfire', icon: '🔥', event: 'fire', q: '(wildfire OR "forest fire" OR bushfire OR "wild fire")' },
  deforestation: { name: 'Deforestation', icon: '🌳', event: 'place', q: '(deforestation OR "illegal logging" OR "forest loss" OR "forest clearing")' },
  earthquake: { name: 'Earthquake', icon: '📳', event: 'quake', q: '(earthquake OR quake OR tremor)' },
  landslide: { name: 'Landslide', icon: '⛰', event: 'place', q: '(landslide OR mudslide OR "land slide" OR rockfall)' },
  volcano: { name: 'Volcano', icon: '🌋', event: 'place', q: '(volcano eruption OR "volcanic eruption" OR lava)' },
  storm: { name: 'Cyclone / storm', icon: '🌀', event: 'cyclone', q: '(cyclone OR hurricane OR typhoon OR "tropical storm" OR tornado)' },
  drought: { name: 'Drought / heat', icon: '☀', event: 'place', q: '(drought OR heatwave OR "heat wave")' },
  manmade: { name: 'Man-made disaster', icon: '🏭', event: 'place', q: '(explosion OR "chemical spill" OR "oil spill" OR "building collapse" OR "dam collapse" OR "bridge collapse" OR "train derailment" OR "industrial fire" OR "gas leak")' },
  migration: { name: 'Illegal migration', icon: '🚤', event: 'place', q: '("illegal migration" OR "migrant boat" OR "migrants drowned" OR "migrant smuggling" OR "irregular migrants" OR "border crossing" migrants)' },
};
const EONET_CAT = { wildfires: 'wildfire', floods: 'flood', landslides: 'landslide', volcanoes: 'volcano', severeStorms: 'storm', drought: 'drought', tempExtremes: 'drought', earthquakes: 'earthquake', manmade: 'manmade' };
const GDACS_CAT = { EQ: 'earthquake', FL: 'flood', TC: 'storm', VO: 'volcano', DR: 'drought', WF: 'wildfire' };

const UA = { Accept: 'application/json' };
async function getJSON(url, { timeout = 20000, headers = {} } = {}) {
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ac ? setTimeout(() => ac.abort(), timeout) : 0;
  try {
    const r = await fetch(url, { headers: { ...UA, ...headers }, signal: ac?.signal });
    if (!r.ok) throw new Error(`${r.status}`);
    const txt = await r.text();
    try { return JSON.parse(txt); } catch { throw new Error('not JSON'); }
  } finally { if (t) clearTimeout(t); }
}
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const r5 = (v) => Math.round(v * 1e5) / 1e5;

// ---------------------------------------------------------------- USGS
export async function fetchUSGS(hours = 24, minMag = 4.5) {
  const feed = hours <= 24 ? 'day' : 'week';
  const j = await getJSON(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${minMag >= 4.5 ? '4.5' : '2.5'}_${feed}.geojson`);
  const since = Date.now() - hours * 3600e3;
  return (j.features || []).filter((f) => f.properties?.time >= since && f.properties?.type !== 'quarry blast').map((f) => {
    const p = f.properties, [lon, lat, depth] = f.geometry.coordinates;
    const m = +p.mag || 0;
    const sev = p.alert === 'red' ? 3 : p.alert === 'orange' ? 2.5 : m >= 7 ? 3 : m >= 6 ? 2 : m >= 5.5 ? 1.4 : 1;
    const place = String(p.place || '').replace(/^\d+\s*km\s+[NSEW]{1,3}\s+of\s+/i, '');
    return {
      id: `usgs:${f.id}`, cat: 'earthquake', source: 'USGS', title: `M${m.toFixed(1)} earthquake — ${p.place || 'unknown place'}`,
      place, country: place.split(',').pop().trim(), ll: [r5(lon), r5(lat)], time: p.time, severity: sev,
      sevText: `M${m.toFixed(1)}${p.alert ? ` · PAGER ${p.alert}` : ''}`, url: p.url,
      facts: { Magnitude: `M${m.toFixed(1)} (${p.magType || 'mag'})`, Depth: `${Math.round(depth)} km`, Time: `${new Date(p.time).toUTCString().replace(' GMT', ' UTC')}`, ...(p.felt ? { 'Felt reports': String(p.felt) } : {}), ...(p.tsunami ? { Tsunami: 'Tsunami bulletin issued' } : {}), ...(p.alert ? { 'PAGER alert': p.alert } : {}) },
      mag: m, depth,
    };
  });
}

// ---------------------------------------------------------------- NASA EONET
export async function fetchEONET(hours = 24) {
  const days = Math.max(1, Math.ceil(hours / 24));
  const j = await getJSON(`https://eonet.gsfc.nasa.gov/api/v3/events?status=all&days=${days + 1}&limit=300`);
  const since = Date.now() - hours * 3600e3;
  const out = [];
  for (const e of j.events || []) {
    const cat = EONET_CAT[e.categories?.[0]?.id];
    if (!cat) continue;
    const geoms = (e.geometry || []).filter((g) => g.coordinates);
    const last = geoms.at(-1);
    if (!last) continue;
    const t = Date.parse(last.date);
    if (!(t >= since)) continue;
    let ll = null;
    if (last.type === 'Point') ll = last.coordinates;
    else if (last.type === 'Polygon') { const r = last.coordinates[0]; ll = [r.reduce((a, c) => a + c[0], 0) / r.length, r.reduce((a, c) => a + c[1], 0) / r.length]; }
    if (!ll) continue;
    const mag = last.magnitudeValue != null ? `${last.magnitudeValue} ${last.magnitudeUnit || ''}`.trim() : '';
    const acres = /acre/i.test(last.magnitudeUnit || '') ? +last.magnitudeValue : 0;
    out.push({
      id: `eonet:${e.id}`, cat, source: 'NASA EONET', title: e.title, place: e.title.replace(/^(wildfire|flood|landslide)s?\s*[-–:]?\s*/i, ''), country: '',
      ll: [r5(ll[0]), r5(ll[1])], time: t, severity: acres > 50000 ? 2.5 : acres > 10000 ? 2 : 1, sevText: mag, url: e.sources?.[0]?.url || e.link,
      facts: { Event: e.categories?.[0]?.title || '', 'First reported': iso(geoms[0].date), ...(mag ? { Size: mag } : {}) },
      track: geoms.filter((g) => g.type === 'Point').map((g) => [r5(g.coordinates[0]), r5(g.coordinates[1])]).slice(-40),
    });
  }
  return out;
}

// ---------------------------------------------------------------- GDACS
export async function fetchGDACS(hours = 24) {
  const from = iso(Date.now() - Math.max(hours, 48) * 3600e3), to = iso(Date.now() + 86400e3);
  const j = await getJSON(`https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ;TC;FL;VO;DR;WF&fromdate=${from}&todate=${to}&alertlevel=Green;Orange;Red&pagesize=100`);
  const since = Date.now() - hours * 3600e3;
  const out = [];
  for (const f of j.features || []) {
    const p = f.properties || {}, cat = GDACS_CAT[p.eventtype];
    if (!cat || !f.geometry?.coordinates) continue;
    const t = Date.parse(p.todate || p.fromdate);
    const start = Date.parse(p.fromdate);
    if (!(t >= since || start >= since)) continue;
    const al = String(p.alertlevel || '').toLowerCase();
    const c = f.geometry.type === 'Point' ? f.geometry.coordinates : null;
    if (!c) continue;
    const sev = p.severitydata || {};
    out.push({
      id: `gdacs:${p.eventtype}${p.eventid}`, cat, source: 'GDACS', title: p.htmldescription || p.description || p.name || `${p.eventtype} event`,
      place: p.country || p.name || '', country: p.country || '', ll: [r5(c[0]), r5(c[1])], time: start || t,
      severity: al === 'red' ? 3 : al === 'orange' ? 2 : 1, sevText: `${al ? `${al[0].toUpperCase()}${al.slice(1)} alert` : ''}${sev.severitytext ? ` · ${sev.severitytext}` : ''}`,
      url: p.url?.report || p.url?.details || `https://www.gdacs.org/report.aspx?eventtype=${p.eventtype}&eventid=${p.eventid}`,
      facts: { 'GDACS alert': al || '—', ...(sev.severitytext ? { Severity: sev.severitytext } : {}), Started: iso(start || t), ...(p.affectedcountries?.length ? { Countries: p.affectedcountries.map((a) => a.countryname).filter(Boolean).join(', ') } : {}) },
    });
  }
  return out;
}

// ---------------------------------------------------------------- GDELT news articles
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function fetchGDELT(cats, hours = 24, perCat = 40) {
  const out = [];
  const span = hours <= 24 ? '1d' : `${Math.ceil(hours / 24)}d`;
  let first = true, ok = 0, lastErr = null;
  for (const cat of cats) {
    const C = NEWS_CATS[cat];
    if (!C) continue;
    if (!first) await sleep(5500); // GDELT asks for one request every 5 seconds
    first = false;
    const q = encodeURIComponent(`${C.q} sourcelang:english`);
    let j;
    try { j = await getJSON(`https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=${perCat}&timespan=${span}&sort=hybridrel&format=json`); ok++; } catch (e) { lastErr = e; continue; }
    const kw = keywordsOf(C.q);
    for (const a of j.articles || []) {
      if (!kw.some((k) => String(a.title || '').toLowerCase().includes(k))) continue; // off-topic hits (sports “Heat”, etc.)
      const t = parseSeen(a.seendate);
      out.push({ id: `gdelt:${a.url}`, cat, source: a.domain || 'news', title: String(a.title || '').trim(), place: '', country: a.sourcecountry || '', ll: null, time: t, severity: 0.6, sevText: 'News report', url: a.url, image: a.socialimage || '', facts: {} });
    }
  }
  if (!ok && lastErr) throw lastErr;
  return clusterArticles(out);
}
/** the query's words and phrases, for checking that a headline is really about the category */
function keywordsOf(q) {
  const out = [];
  String(q).replace(/"([^"]+)"|([\p{L}-]+)/gu, (_, ph, w) => { const k = (ph || w || '').toLowerCase(); if (k && !['or', 'and', 'not'].includes(k)) out.push(k); return ''; });
  return out;
}
function parseSeen(s) { const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : Date.now(); }
const STOPW = new Set('the a an of in on at to for and or with by from as is are was were be after over amid into near says say said new news live update updates video photos more than its it their his her this that has have least'.split(' '));
const words = (t) => String(t).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOPW.has(w));
/** groups articles about the same story (shared words) — the more outlets, the bigger the story */
export function clusterArticles(list) {
  const groups = [];
  for (const a of list) {
    if (!a.title) continue;
    const w = new Set(words(a.title));
    let g = groups.find((x) => x.cat === a.cat && [...w].filter((y) => x.w.has(y)).length >= Math.max(3, Math.min(w.size, x.w.size) * 0.5));
    if (!g) { g = { ...a, w, links: [], outlets: new Set() }; groups.push(g); }
    g.links.push({ title: a.title, url: a.url, source: a.source, image: a.image });
    g.outlets.add(a.source);
    g.time = Math.max(g.time, a.time);
  }
  return groups.map(({ w, outlets, ...g }) => ({ ...g, coverage: outlets.size, severity: 0.4 + Math.min(1.1, outlets.size * 0.12), sevText: `${outlets.size} outlet${outlets.size === 1 ? '' : 's'}` }));
}

// ---------------------------------------------------------------- everything together
/** Joins incidents about the same event (same category, < 60 km apart), scores and sorts them. */
export function rankIncidents(list) {
  const kept = [];
  const km = (a, b) => { const R = 6371, d = Math.PI / 180; const x = (b[0] - a[0]) * d * Math.cos(((a[1] + b[1]) / 2) * d), y = (b[1] - a[1]) * d; return R * Math.hypot(x, y); };
  for (const it of list.sort((a, b) => (b.ll ? 1 : 0) - (a.ll ? 1 : 0) || (b.severity || 0) - (a.severity || 0))) {
    // news reports without coordinates join a located event of the same kind when they name its place or country
    if (!it.ll) {
      const t = ` ${String(it.title).toLowerCase()} `;
      const names = (k) => [k.place?.split(',')[0], k.country].map((x) => String(x || '').toLowerCase().trim()).filter((x) => x.length > 3);
      const host = kept.find((k) => k.ll && k.cat === it.cat && names(k).some((n) => t.includes(n)));
      if (host) { host.links = [...(host.links || []), ...(it.links || [{ title: it.title, url: it.url, source: it.source }])]; host.coverage = (host.coverage || 0) + (it.coverage || 1); host.alsoIn = [...new Set([...(host.alsoIn || []), 'news'])]; continue; }
    }
    const twin = it.ll && kept.find((k) => k.ll && (k.cat === it.cat || (k.cat === 'flood' && it.cat === 'flashflood')) && km(k.ll, it.ll) < 60);
    if (twin) { twin.alsoIn = [...(twin.alsoIn || []), it.source]; twin.facts = { ...it.facts, ...twin.facts }; twin.links = [...(twin.links || []), { title: it.title, url: it.url, source: it.source }]; continue; }
    kept.push({ ...it, links: it.links || (it.url ? [{ title: it.title, url: it.url, source: it.source }] : []) });
  }
  const now = Date.now();
  for (const k of kept) {
    const ageH = Math.max(0, (now - (k.time || now)) / 3600e3);
    k.score = +((k.severity || 0) * 2 + (k.alsoIn?.length || 0) * 0.6 + (k.coverage || 0) * 0.15 + Math.max(0, 1.5 - ageH / 24) + (k.ll ? 0.4 : 0)).toFixed(2);
  }
  return kept.sort((a, b) => b.score - a.score);
}
/**
 * Fetches everything. opts: { cats: [...], hours, sources: { usgs, eonet, gdacs, gdelt }, onStatus(text) }.
 * Returns { items, errors: { source: message }, at }.
 */
export async function fetchIncidents({ cats = Object.keys(NEWS_CATS), hours = 24, sources = { usgs: true, eonet: true, gdacs: true, gdelt: true }, onStatus = () => {} } = {}) {
  const want = new Set(cats);
  const errors = {};
  const jobs = [];
  const run = (name, p) => jobs.push(p.then((r) => r, (e) => { errors[name] = e.message || 'failed'; return []; }));
  if (sources.usgs && want.has('earthquake')) run('USGS', fetchUSGS(hours));
  if (sources.eonet) run('NASA EONET', fetchEONET(hours));
  if (sources.gdacs) run('GDACS', fetchGDACS(hours));
  onStatus('Looking for disasters and incidents…');
  const base = (await Promise.all(jobs)).flat().filter((x) => want.has(x.cat));
  let news = [];
  if (sources.gdelt) {
    onStatus('Searching the news…');
    try { news = await fetchGDELT([...want], hours); } catch (e) { errors.GDELT = e.message || 'failed'; }
  }
  return { items: rankIncidents([...base, ...news]), errors, at: new Date().toISOString() };
}
