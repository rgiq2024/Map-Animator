// Builds the ready-made Site watch library: for key Iranian ports and naval bases, the clearest Sentinel-2 pass
// of every month (last 15 months) with ships counted, saved as sites/watch/<id>/<day>.jpg + sites/watch/index.json.
// It runs the app's own Site watch code in a headless browser. Runs in GitHub Actions
// (.github/workflows/sitewatch-library.yml); the app then offers these sites instantly, with no waiting.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';

export const WATCH = [
  { id: 'rajaee', type: 'port', name: 'Shahid Rajaee Port', place: 'Bandar Abbas', ll: [56.065, 27.098], km: 4 },
  { id: 'bandarabbas-naval', type: 'naval', name: 'Bandar Abbas Naval Base & Shahid Bahonar Port', place: 'Bandar Abbas', ll: [56.209, 27.143], km: 3 },
  { id: 'jask', type: 'naval', name: 'Jask port & naval base', place: 'Jask', ll: [57.768, 25.646], km: 3 },
  { id: 'chabahar', type: 'port', name: 'Shahid Beheshti Port', place: 'Chabahar', ll: [60.609, 25.303], km: 4 },
  { id: 'konarak-naval', type: 'naval', name: 'Konarak Naval Base', place: 'Konarak', ll: [60.432, 25.301], km: 3 },
  { id: 'bushehr', type: 'port', name: 'Bushehr Port', place: 'Bushehr', ll: [50.845, 28.982], km: 3 },
  { id: 'kharg', type: 'port', name: 'Kharg Island oil terminal', place: 'Kharg Island', ll: [50.33, 29.235], km: 5 },
  { id: 'imam-khomeini', type: 'port', name: 'Bandar Imam Khomeini Port', place: 'Bandar Imam Khomeini', ll: [49.09, 30.423], km: 5 },
  { id: 'asaluyeh', type: 'port', name: 'Pars Petrochemical Port', place: 'Asaluyeh', ll: [52.5417, 27.5425], km: 4 },
  { id: 'amirabad', type: 'port', name: 'Amirabad Port', place: 'Behshahr', ll: [53.365, 36.85], km: 3 },
  { id: 'anzali', type: 'port', name: 'Anzali Port & naval base', place: 'Bandar-e Anzali', ll: [49.465, 37.471], km: 3 },
  { id: 'nowshahr', type: 'port', name: 'Nowshahr Port', place: 'Nowshahr', ll: [51.507, 36.6575], km: 3 },
];

const OUT = 'sites/watch';
const only = (process.env.WATCH_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const months = +(process.env.WATCH_MONTHS || 15);
const to = new Date().toISOString().slice(0, 10);
const f0 = new Date(); f0.setUTCMonth(f0.getUTCMonth() - (months - 1)); f0.setUTCDate(1);
const from = f0.toISOString().slice(0, 10);
mkdirSync(OUT, { recursive: true });
const idxPath = `${OUT}/index.json`;
const index = existsSync(idxPath) ? JSON.parse(readFileSync(idxPath, 'utf8')) : { sites: [] };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
await ctx.route('**/js/auth.js*', (r) => r.fulfill({ body: "document.documentElement.classList.remove('auth-locked');export const currentUser=()=>null;", contentType: 'application/javascript' }));
const list = WATCH.filter((s) => !only.length || only.includes(s.id));
let k = 0;
async function worker() {
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => console.log('pageerror', e.message));
  await pg.goto('http://localhost:8811/index.html'); await pg.waitForTimeout(2000);
  while (k < list.length) {
    const s = list[k++];
    const t0 = Date.now();
    const r = await pg.evaluate(async ({ s, from, to }) => {
      const SW = await import('./js/sitewatch.js');
      try {
        const res = await SW.fetchSitePasses({ site: { id: s.id, type: s.type, name: s.name, ll: s.ll }, source: 'esri_s2', from, to, maxCloud: 30, target: 'ships', km: s.km });
        const frames = [];
        for (const f of res.frames) {
          const blob = await (await fetch(f.url)).blob();
          const b64 = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
          frames.push({ day: f.day, count: f.count, boxes: f.boxes.map((b) => ({ cls: b.cls, cx: +b.cx.toFixed(4), cy: +b.cy.toFixed(4), x0: +b.x0.toFixed(4), y0: +b.y0.toFixed(4), x1: +b.x1.toFixed(4), y1: +b.y1.toFixed(4) })), w: f.w, h: f.h, include: f.include !== false, hazy: !!f.hazy, odd: !!f.odd, b64 });
        }
        return { ok: true, frames, bbox: res.bbox };
      } catch (e) { return { ok: false, error: String(e?.message || e) }; }
    }, { s, from, to });
    if (!r.ok || !r.frames.length) { console.log(s.id, 'FAILED', r.error); continue; }
    const dir = `${OUT}/${s.id}`;
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
    const frames = r.frames.map(({ b64, ...f }) => { writeFileSync(`${dir}/${f.day}.jpg`, Buffer.from(b64, 'base64')); return { ...f, file: `${s.id}/${f.day}.jpg` }; });
    index.sites = index.sites.filter((x) => x.id !== s.id);
    index.sites.push({ ...s, source: 'esri_s2', from, to, bbox: r.bbox.map((v) => +v.toFixed(5)), updated: to, frames });
    console.log(s.id, frames.length, 'passes', frames.map((f) => f.count).join(','), `${Math.round((Date.now() - t0) / 1000)} s`);
  }
  await pg.close();
}
await Promise.all([worker(), worker(), worker()]);
index.sites.sort((a, c) => WATCH.findIndex((w) => w.id === a.id) - WATCH.findIndex((w) => w.id === c.id));
index.updated = to;
index.credit = 'Contains modified Copernicus Sentinel data · Esri. Ships marked automatically.';
writeFileSync(idxPath, JSON.stringify(index));
await b.close();
