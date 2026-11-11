// Runs every 24 hours in GitHub Actions (.github/workflows/daily-news.yml):
// fetches today's disasters and incidents and writes news/latest.json (+ a dated copy in news/archive/)
// which the app's News desk and the "Today's top story" card on the home page read.
import { writeFile, mkdir } from 'node:fs/promises';
import { fetchIncidents } from '../js/newsfeeds.js';

const hours = +(process.env.NEWS_HOURS || 24);
const r = await fetchIncidents({ hours, onStatus: (t) => console.log(t) });
const items = r.items.slice(0, 150);
const out = { at: r.at, hours, errors: r.errors, top: items[0]?.id || null, items };
await mkdir(new URL('../news/archive/', import.meta.url), { recursive: true });
const json = JSON.stringify(out);
await writeFile(new URL('../news/latest.json', import.meta.url), json);
await writeFile(new URL(`../news/archive/${r.at.slice(0, 10)}.json`, import.meta.url), json);
console.log(`${items.length} stories; top: ${items[0]?.title || '—'}`);
for (const [k, v] of Object.entries(r.errors)) console.warn(`not reachable: ${k} — ${v}`);
if (!items.length && Object.keys(r.errors).length) process.exit(1);
