// Runs every 24 hours in GitHub Actions (.github/workflows/daily-news.yml):
// fetches today's disasters and incidents and writes news/latest.json (+ a dated copy in news/archive/)
// which the app's News desk and the "Today's top story" card on the home page read.
import { writeFile, mkdir } from 'node:fs/promises';
import { fetchIncidents, addFireHotspots, rankIncidents } from '../js/newsfeeds.js';
import { fetchFirmsWorld } from '../js/firms.js';

const hours = +(process.env.NEWS_HOURS || 24);
const r = await fetchIncidents({ hours, onStatus: (t) => console.log(t) });
// NASA FIRMS: hotspots for every fire story + new fire stories from the biggest clusters
// (FIRMS_MAP_KEY repository secret if set, else NASA's public 24 h VIIRS file)
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
async function reverse(ll) {
  await sleep(1100); // Nominatim: one request per second
  const q = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=8&lat=${ll[1]}&lon=${ll[0]}&accept-language=en`, { headers: { 'User-Agent': 'GIS-One-Map-Animator daily news (github.com/rgiq2024/Map-Animator)' } });
  const j = q.ok ? await q.json() : null;
  const a = j?.address || {};
  return { place: a.county || a.state_district || a.state || a.region || a.city || a.town || '', country: a.country || '' };
}
try {
  console.log('Fetching NASA FIRMS active fires…');
  const world = await fetchFirmsWorld({ key: process.env.FIRMS_MAP_KEY || '' });
  console.log(`${world.length} hotspots worldwide`);
  await addFireHotspots(r.items, world, { reverse });
  r.items = rankIncidents(r.items);
} catch (e) { r.errors['NASA FIRMS'] = e.message || 'failed'; }
const items = r.items.slice(0, 150);
const out = { at: r.at, hours, errors: r.errors, top: items[0]?.id || null, items };
await mkdir(new URL('../news/archive/', import.meta.url), { recursive: true });
const json = JSON.stringify(out);
await writeFile(new URL('../news/latest.json', import.meta.url), json);
await writeFile(new URL(`../news/archive/${r.at.slice(0, 10)}.json`, import.meta.url), json);
console.log(`${items.length} stories; top: ${items[0]?.title || '—'}`);
for (const [k, v] of Object.entries(r.errors)) console.warn(`not reachable: ${k} — ${v}`);
if (!items.length && Object.keys(r.errors).length) process.exit(1);
