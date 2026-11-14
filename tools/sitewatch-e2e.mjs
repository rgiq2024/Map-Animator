// End-to-end check of Site watch against the live imagery services (run by .github/workflows/sitewatch-e2e.yml).
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('e2e', { recursive: true });
const b = await chromium.launch();
const pg = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const logs = []; pg.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`)); pg.on('pageerror', (e) => logs.push(`ERR ${e.message}`));
await pg.route('**/js/auth.js*', (r) => r.fulfill({ body: "document.documentElement.classList.remove('auth-locked');export const currentUser=()=>null;", contentType: 'application/javascript' }));
await pg.goto('http://localhost:8811/index.html'); await pg.waitForTimeout(2500);
const cases = JSON.parse(process.env.CASES || '[]');
const out = [];
for (const c of cases) {
  const r = await pg.evaluate(async (c) => {
    const SW = await import('./js/sitewatch.js'); const PC = await import('./js/pcsat.js'); window.__renders = await PC.pcRenders('sentinel-1-rtc').catch((e) => String(e));
    const t0 = Date.now(); const st = [];
    try {
      const res = await SW.fetchSitePasses({ ...c, onStatus: (s) => st.push(s) });
      const thumbs = res.frames.map((f) => f.url);
      // contact sheet
      const n = res.frames.length, cols = Math.min(6, n || 1), W = 220;
      const cv = document.createElement('canvas'); cv.width = cols * W; cv.height = Math.ceil(n / cols) * W || W; const g = cv.getContext('2d');
      for (const [i, f] of res.frames.entries()) { const im = new Image(); im.src = f.url; await im.decode(); const x = (i % cols) * W, y = Math.floor(i / cols) * W; const k = Math.max(W / im.width, W / im.height); g.drawImage(im, x, y, im.width * k, im.height * k); g.strokeStyle = 'red'; g.lineWidth = 1.5; for (const bx of f.boxes) g.strokeRect(x + bx.x0 * im.width * k, y + bx.y0 * im.height * k, Math.max(4, (bx.x1 - bx.x0) * im.width * k), Math.max(4, (bx.y1 - bx.y0) * im.height * k)); g.fillStyle = '#000'; g.fillRect(x, y + W - 18, W, 18); g.fillStyle = '#fff'; g.font = '12px sans-serif'; g.fillText(`${f.day} · ${f.count} · cl ${f.cloud ?? ''} ${f.sensor || ''}`, x + 4, y + W - 5); }
      let project = null;
      if (c.export) {
        const S = await import('./js/store.js'); const helpers = { briefing: await import('./js/briefing.js'), autostory: await import('./js/autostory.js'), scene: await import('./js/scene.js') };
        const story = SW.buildSiteStory({ site: c.site, frames: res.frames.map(({ url, ...f }) => f), source: c.source, target: c.target, detector: res.detector, km: res.km, checked: false, eventDay: c.eventDay || '', eventLabel: c.eventLabel || '' }, helpers);
        const p = S.newProject(story.name); p.scenes = story.scenes; p.brand = story.brand; p.sound = { ...p.sound, ...story.sound };
        await S.saveProject(p); project = await S.projectFileJSON(p);
      }
      return { project, renders: (window.__renders || []).map?.((r) => r.name), ok: true, ms: Date.now() - t0, frames: res.frames.map((f) => ({ day: f.day, count: f.count, cloud: f.cloud, w: f.w, h: f.h, sensor: f.sensor, release: f.release })), detector: res.detector, sheet: cv.toDataURL('image/jpeg', 0.85), status: st.slice(-6) };
    } catch (e) { return { ok: false, error: String(e && e.stack || e), status: st.slice(-8) }; }
  }, c);
  if (r.project) { writeFileSync(`e2e/${c.name}.mapanim.json`, r.project); delete r.project; }
  if (r.sheet) { writeFileSync(`e2e/${c.name}.jpg`, Buffer.from(r.sheet.split(',')[1], 'base64')); delete r.sheet; }
  out.push({ case: c.name, ...r });
  console.log(c.name, JSON.stringify(r).slice(0, 1500));
}
writeFileSync('e2e/result.json', JSON.stringify({ out, logs: logs.slice(-80) }, null, 1));
await b.close();
