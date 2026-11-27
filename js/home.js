// Home page: create/open projects, the list of saved projects, and the live demo.
import { briefingLayers, zoomCamera } from './briefing.js';
import { defaultBrand } from './branding.js';
import { newScene } from './scene.js';
import { listProjects, saveProject, deleteProject, newProject, normalizeProject, demoProject, projectFileJSON, importProjectMedia } from './store.js';
import { buildStyle } from './themes.js';
import { buildScene } from './scene.js';
import { renderScene } from './renderer.js';
import { bounds } from './geo.js';
import { toast, downloadBlob } from './editor.js';
import { TEMPLATES, thumbSVG, openQuickStart } from './quickstart.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROUTE_EXT = /\.(gpx|kml|kmz|igc|geojson)$/i;

function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} minute${Math.round(s / 60) === 1 ? '' : 's'} ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hour${Math.round(s / 3600) === 1 ? '' : 's'} ago`;
  const d = Math.round(s / 86400);
  return d < 30 ? `${d} day${d === 1 ? '' : 's'} ago` : new Date(ts).toLocaleDateString();
}

function drawThumb(canvas, p) {
  const dpr = window.devicePixelRatio || 1;
  const W = (canvas.width = 112 * dpr), H = (canvas.height = 72 * dpr);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#16191d';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 14 * dpr) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 14 * dpr) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  const sc = p.scenes?.[0];
  const pts = (sc?.legs || []).flatMap((l) => (l.track ? l.track : l.points.map((q) => [q.lng, q.lat])));
  if (pts.length < 2) return;
  const b = bounds(pts);
  const w = b[1][0] - b[0][0] || 1e-6, h = b[1][1] - b[0][1] || 1e-6;
  const pad = 12 * dpr;
  const s = Math.min((W - pad * 2) / w, (H - pad * 2) / h);
  const ox = (W - w * s) / 2, oy = (H - h * s) / 2;
  const P = ([x, y]) => [ox + (x - b[0][0]) * s, H - (oy + (y - b[0][1]) * s)];
  ctx.strokeStyle = sc.look?.lineColor || '#ff6b35';
  ctx.lineWidth = 2.2 * dpr;
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach((q, i) => { const [x, y] = P(q); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.stroke();
  for (const q of [pts[0], pts.at(-1)]) {
    const [x, y] = P(q);
    ctx.beginPath(); ctx.arc(x, y, 3.2 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 1.6 * dpr; ctx.strokeStyle = sc.look?.lineColor || '#ff6b35'; ctx.stroke();
  }
}

// ---------------- project categories, dashboard numbers and map thumbnails
export const PROJECT_CATS = {
  news: { name: 'News & briefings', icon: '📰', color: '#ff6b35' },
  disaster: { name: 'Fires & disasters', icon: '🔥', color: '#ff4d4f' },
  investigation: { name: 'Visual investigations', icon: '🛰', color: '#7c8cff' },
  sitewatch: { name: 'Site watch', icon: '⚓', color: '#38bdf8' },
  travel: { name: 'Travel routes', icon: '🧭', color: '#2fbf71' },
  transit: { name: 'Rail & transit', icon: '🚆', color: '#f59e0b' },
  poster: { name: 'Map posters', icon: '🖼', color: '#e879f9' },
  messages: { name: 'Messages', icon: '💬', color: '#22d3ee' },
  other: { name: 'Other maps', icon: '🗺', color: '#94a3b8' },
};
export function projectCategory(p) {
  const kinds = new Set(), nm = String(p.name || '').toLowerCase();
  for (const sc of p.scenes || []) for (const L of sc?.layers || []) if (L && typeof L.kind === 'string') kinds.add(L.kind);
  const has = (...k) => k.some((x) => kinds.has(x));
  if (has('viframe', 'vitile', 'vibox', 'vioutline', 'vijourney', 'vilabel') || /investigat/.test(nm)) return 'investigation';
  if (has('sitewatch')) return 'sitewatch';
  if (has('mapposter')) return 'poster';
  if (has('msgchat')) return 'messages';
  if (has('fireplume', 'blastzone', 'firms', 'flood', 'quakes', 'shipsink') || /fire|flood|quake|explosion|blast|sinking|landslide|storm|cyclone|wildfire/.test(nm)) return 'disaster';
  if (has('briefing') || /brief|news|killed|injured/.test(nm)) return 'news';
  if (has('transit') || /rail|metro|train|transit/.test(nm)) return 'transit';
  if ((p.scenes || []).some((sc) => (sc?.legs || []).some((l) => (l?.track?.length || l?.points?.length || 0) >= 2))) return 'travel';
  return 'other';
}
function projectView(p) {
  const sc = p.scenes?.[0]; if (!sc) return null;
  const v = sc.camera?.mode === 'keyframes' ? sc.camera.keys?.[0]?.view : sc.camera?.fixed || sc.camera?.start;
  const pts = (sc.legs || []).flatMap((l) => (Array.isArray(l?.track) ? l.track : (l?.points || []).map((q) => [q.lng, q.lat]))).filter((q) => Array.isArray(q) && Number.isFinite(+q[0]) && Number.isFinite(+q[1]));
  if (Array.isArray(v?.center) && Number.isFinite(+v.center[0]) && Number.isFinite(+v.center[1])) return { center: v.center, zoom: +v.zoomRef || 4, pts, look: sc.look || {} };
  if (pts.length) { const b = bounds(pts); return { center: [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2], zoom: 6, pts, fit: b, look: sc.look || {} }; }
  for (const L of sc.layers || []) { const c = L.geom?.type === 'Point' ? L.geom.coordinates : L.geom?.coordinates?.[0]?.[0] || L.geom?.coordinates?.[0]; if (Array.isArray(c) && typeof c[0] === 'number') return { center: c, zoom: 10, pts, look: sc.look || {} }; }
  return null;
}
const tileImg = (url) => new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
/** a small real map behind each project card: satellite or a dark / light street map, with the route drawn on it */
async function drawMapThumb(canvas, p) {
  const W = (canvas.width = 480), H = (canvas.height = 270), g = canvas.getContext('2d');
  const v = projectView(p); const cat = PROJECT_CATS[projectCategory(p)];
  const grad = g.createLinearGradient(0, 0, W, H); grad.addColorStop(0, '#1b2030'); grad.addColorStop(1, '#0d1018'); g.fillStyle = grad; g.fillRect(0, 0, W, H);
  if (!v) { g.font = '64px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.globalAlpha = 0.5; g.fillText(cat.icon, W / 2, H / 2); return; }
  const th = String(v.look.theme || '');
  const src = /sat|hybrid|imagery|earth/.test(th) ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : /light|classic|paper|treasure|poster|minimal|voyager|street|outdoor|offroad/.test(th) ? 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'
    : 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
  let z = Math.round(Math.max(1, Math.min(16, v.zoom - 2.0)));
  const merc = (lon, lat, zz) => { const n = 256 * 2 ** zz, r = (lat * Math.PI) / 180; return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n]; };
  if (v.fit) { for (z = 14; z > 1; z--) { const a = merc(v.fit[0][0], v.fit[1][1], z), b = merc(v.fit[1][0], v.fit[0][1], z); if (b[0] - a[0] < W * 0.75 && b[1] - a[1] < H * 0.75) break; } }
  const [cx, cy] = merc(v.center[0], Math.max(-84, Math.min(84, v.center[1])), z), x0 = cx - W / 2, y0 = cy - H / 2, n = 2 ** z;
  const jobs = [];
  for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + W) / 256); tx++) for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + H) / 256); ty++) {
    if (ty < 0 || ty >= n) continue; const wx = ((tx % n) + n) % n;
    jobs.push(tileImg(src.replace('{z}', z).replace('{x}', wx).replace('{y}', ty)).then((im) => { if (im) g.drawImage(im, tx * 256 - x0, ty * 256 - y0); }));
  }
  await Promise.all(jobs);
  if (v.pts.length >= 2) {
    const col = v.look.lineColor || '#ff6b35';
    g.lineJoin = g.lineCap = 'round'; g.beginPath();
    v.pts.forEach((q, i) => { const [x, y] = merc(q[0], q[1], z); if (i) g.lineTo(x - x0, y - y0); else g.moveTo(x - x0, y - y0); });
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 6; g.stroke(); g.strokeStyle = col; g.lineWidth = 3.2; g.stroke();
    for (const q of [v.pts[0], v.pts.at(-1)]) { const [x, y] = merc(q[0], q[1], z); g.beginPath(); g.arc(x - x0, y - y0, 5, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = col; g.stroke(); }
  } else {
    const [x, y] = [W / 2, H / 2]; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fillStyle = cat.color; g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke();
    g.beginPath(); g.arc(x, y, 16, 0, Math.PI * 2); g.strokeStyle = cat.color + '88'; g.lineWidth = 2; g.stroke();
  }
}
function countUp(el, to, fmt = (x) => Math.round(x).toLocaleString()) {
  const t0 = performance.now(), d = 700; const step = (t) => { const k = Math.min(1, (t - t0) / d), e = 1 - (1 - k) ** 3; el.textContent = fmt(to * e); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step);
}

export function createHome({ open }) {
  // ---------------- projects
  let projFilter = 'all';
  async function renderProjects() {
    try { await renderProjectsInner(); } catch (err) {
      console.error('project list', err);
      // fall back to a plain list, so projects are never hidden
      const all = await listProjects().catch(() => []);
      $('#project-grid').innerHTML = all.map((p) => `<div class="project-card pc-v2" data-id="${p.id}" style="--c:#94a3b8"><div class="pc-thumb">${p.thumb ? `<img src="${p.thumb}" alt="">` : ''}</div><div class="pc-body"><h3>${esc(p.name)}</h3><p>${(p.scenes || []).length} scenes · edited ${ago(p.updatedAt)}</p></div></div>`).join('');
      $('#project-grid').onclick = (e) => { const c = e.target.closest('.project-card'); if (c) open(c.dataset.id); };
    }
  }
  async function renderProjectsInner() {
    const all = (await listProjects()).filter((p) => p && p.id);
    for (const p of all) { if (!Array.isArray(p.scenes)) p.scenes = []; p.updatedAt = +p.updatedAt || 0; }
    const cats = new Map(all.map((p) => { let c = 'other'; try { c = projectCategory(p); } catch { c = 'other'; } return [p.id, c]; }));
    try { renderDashboard(all, cats); } catch (err) { console.warn('dashboard', err); }
    $('#projects-count').textContent = all.length ? `${all.length} project${all.length === 1 ? '' : 's'}, saved in this browser` : '';
    const grid = $('#project-grid');
    // filter chips
    const counts = {}; for (const c of cats.values()) counts[c] = (counts[c] || 0) + 1;
    if (projFilter !== 'all' && !counts[projFilter]) projFilter = 'all';
    $('#proj-chips').innerHTML = all.length ? [`<button class="pchip${projFilter === 'all' ? ' on' : ''}" data-cat="all">All <b>${all.length}</b></button>`,
      ...Object.entries(PROJECT_CATS).filter(([k]) => counts[k]).map(([k, c]) => `<button class="pchip${projFilter === k ? ' on' : ''}" data-cat="${k}" style="--c:${c.color}"><i>${c.icon}</i>${esc(c.name)} <b>${counts[k]}</b></button>`)].join('') : '';
    if (!all.length) {
      grid.innerHTML = '<div class="empty-projects">Your projects will appear here. They are saved in this browser only — use “Save file” in the editor to keep a copy.</div>';
      return;
    }
    const q = ($('#proj-search').value || '').trim().toLowerCase(), sort = $('#proj-sort').value;
    let list = all.filter((p) => (projFilter === 'all' || cats.get(p.id) === projFilter) && (!q || String(p.name || '').toLowerCase().includes(q)));
    const vids = (p) => +p.stats?.exports || 0;
    if (sort === 'name') list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    else if (sort === 'videos') list.sort((a, b) => vids(b) - vids(a) || b.updatedAt - a.updatedAt);
    else if (sort === 'scenes') list.sort((a, b) => b.scenes.length - a.scenes.length);
    if (!list.length) { grid.innerHTML = '<div class="empty-projects">No projects match.</div>'; return; }
    grid.innerHTML = list.map((p) => { const c = PROJECT_CATS[cats.get(p.id)]; return `
      <div class="project-card pc-v2" data-id="${p.id}" style="--c:${c.color}">
        <div class="pc-thumb">${p.thumb ? `<img src="${p.thumb}" alt="" loading="lazy">` : '<canvas></canvas>'}
          <span class="pc-cat"><i>${c.icon}</i>${esc(c.name)}</span>
          ${vids(p) ? `<span class="pc-vids" title="Videos exported">▶ ${vids(p)} video${vids(p) === 1 ? '' : 's'}</span>` : ''}
          <span class="pc-open">Open →</span>
          <div class="acts">
            <button class="square-btn" data-dl title="Download project file"><svg viewBox="0 0 24 24"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/></svg></button>
            <button class="square-btn" data-del title="Delete project"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg></button>
          </div>
        </div>
        <div class="pc-body"><h3 title="${esc(p.name)}">${esc(p.name)}</h3><p>${p.scenes.length} scene${p.scenes.length === 1 ? '' : 's'} · ${esc(p.aspect)} · edited ${ago(p.updatedAt)}</p></div>
      </div>`; }).join('');
    list.forEach((p) => { const cv = $(`[data-id="${p.id}"] canvas`, grid); if (cv) Promise.resolve().then(() => drawMapThumb(cv, p)).catch(() => { try { drawThumb(cv, p); } catch { /* */ } }); });
    grid.onclick = async (e) => {
      const card = e.target.closest('.project-card');
      if (!card) return;
      const p = list.find((x) => x.id === card.dataset.id);
      if (e.target.closest('[data-del]')) {
        if (confirm(`Delete “${p.name}”? This can't be undone.`)) { await deleteProject(p.id); renderProjects(); }
        return;
      }
      if (e.target.closest('[data-dl]')) {
        downloadBlob(new Blob([await projectFileJSON(p)], { type: 'application/json' }), `${(p.name || 'trip').replace(/[^\w-]+/g, '-')}.mapanim.json`);
        return;
      }
      open(p.id);
    };
  }
  $('#proj-chips').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; projFilter = b.dataset.cat; renderProjects(); });
  $('#proj-search').addEventListener('input', () => renderProjects());
  $('#proj-sort').addEventListener('change', () => renderProjects());
  function renderDashboard(all, cats) {
    const sec = $('#dash-section'); sec.hidden = !all.length; if (!all.length) return;
    const videos = all.reduce((a, p) => a + (+p.stats?.exports || 0), 0), secs = all.reduce((a, p) => a + (+p.stats?.seconds || 0), 0);
    const scenes = all.reduce((a, p) => a + (p.scenes?.length || 0), 0), withVid = all.filter((p) => +p.stats?.exports).length;
    const last = all.reduce((a, p) => Math.max(a, +p.stats?.lastExport || 0), 0), week = all.filter((p) => Date.now() - p.updatedAt < 7 * 864e5).length;
    const tiles = [
      ['projects', '🗂', 'Projects', all.length, `${week} edited this week`],
      ['videos', '🎬', 'Videos made', videos, withVid ? `from ${withVid} project${withVid === 1 ? '' : 's'}` : 'export one from the editor'],
      ['minutes', '⏱', 'Minutes of video', secs / 60, last ? `last video ${ago(last)}` : 'counted from exports'],
      ['scenes', '🎞', 'Scenes', scenes, `${(scenes / all.length).toFixed(1)} per project`],
    ];
    $('#dash-stats').innerHTML = tiles.map(([k, ic, lab, , sub]) => `<div class="dash-tile glass-card" data-k="${k}"><i>${ic}</i><b data-v>0</b><span>${lab}</span><small>${esc(sub)}</small></div>`).join('');
    tiles.forEach(([k, , , v]) => countUp($(`.dash-tile[data-k="${k}"] [data-v]`), v, k === 'minutes' ? (x) => x.toFixed(1) : undefined));
    const counts = {}; for (const c of cats.values()) counts[c] = (counts[c] || 0) + 1;
    const vidBy = {}; for (const p of all) { const c = cats.get(p.id); vidBy[c] = (vidBy[c] || 0) + (+p.stats?.exports || 0); }
    const rows = Object.entries(PROJECT_CATS).filter(([k]) => counts[k]).sort((a, b) => counts[b[0]] - counts[a[0]]);
    const max = Math.max(1, ...rows.map(([k]) => counts[k]));
    // donut + bars
    let acc = 0; const segs = rows.map(([k, c]) => { const f = counts[k] / all.length, a0 = acc; acc += f; return `<circle r="15.9" cx="20" cy="20" fill="none" stroke="${c.color}" stroke-width="6" stroke-dasharray="${(f * 100).toFixed(2)} ${(100 - f * 100).toFixed(2)}" stroke-dashoffset="${(25 - a0 * 100).toFixed(2)}"/>`; }).join('');
    $('#dash-cats').innerHTML = `<div class="dc-head"><b>Categories</b><small>${rows.length} in use · click one to filter</small></div>
      <div class="dc-body"><svg class="dc-donut" viewBox="0 0 40 40"><circle r="15.9" cx="20" cy="20" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="6"/>${segs}<text x="20" y="21.5" text-anchor="middle">${all.length}</text></svg>
      <div class="dc-rows">${rows.map(([k, c]) => `<button class="dc-row" data-cat="${k}" style="--c:${c.color}"><span class="dc-name"><i>${c.icon}</i>${esc(c.name)}</span><span class="dc-bar"><em style="width:${(counts[k] / max * 100).toFixed(1)}%"></em></span><span class="dc-n">${counts[k]}${vidBy[k] ? ` <small>· ▶ ${vidBy[k]}</small>` : ''}</span></button>`).join('')}</div></div>`;
    $('#dash-cats').onclick = (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; projFilter = b.dataset.cat; renderProjects(); $('#projects-section').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  }

  // ---------------- quick start templates
  $('#quick-grid').innerHTML = Object.entries(TEMPLATES).map(([k, t]) => `<button class="quick-card" data-tpl="${k}">${thumbSVG(k)}<b>${t.name}</b><small>${t.desc}</small></button>`).join('');
  $('#quick-grid').onclick = (e) => {
    const b = e.target.closest('[data-tpl]');
    if (!b) return;
    openQuickStart({
      kind: b.dataset.tpl,
      onCreate: async ({ scenes, name }) => {
        const p = newProject(name);
        p.scenes = scenes;
        await saveProject(p);
        open(p.id, { step: 'camera' });
        toast('Your camera move is ready — press play to preview', 3600);
      },
    });
  };

  try { const lay = localStorage.getItem('ma.newLayout'); const r = lay && document.querySelector(`#create-layout input[value="${lay}"]`); if (r) r.checked = true; } catch { /* */ }
  $('#create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = newProject($('#create-name').value.trim() || 'Untitled trip');
    const layout = document.querySelector('#create-layout input:checked')?.value || 'standard';
    try { localStorage.setItem('ma.newLayout', layout); } catch { /* */ }
    if (layout !== 'standard') {
      p.layout = 'briefing';
      p.brand = { ...defaultBrand(), ...(p.brand || {}), lower: false };
      const common = { title: p.name, sub: 'Satellite observation & geospatial assessment', tag: '', date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) };
      if (layout === 'set') {
        // a whole briefing: intro, dashboard, analysis, full view and end card — same text on every scene
        p.brand = { ...p.brand, lower: false };
        Object.assign(common, { header: true, tickerOn: false, ticker: 'Geospatial assessment ongoing\nSatellite imagery under review', event: 'Event', assessment: 'Assessment' });
        const plan = [['Intro', 'intro', 6], ['Zoom to location', 'zoom', 8], ['Dashboard', 'B', 9], ['Analysis', 'A', 9], ['Full view', 'full', 9], ['Photos', 'photos', 10], ['End', 'end', 5]];
        p.scenes = plan.map(([name, lay, sec], i) => {
          const sc = i ? newScene(name, p.scenes[0].look) : Object.assign(p.scenes[0], { name });
          sc.lineSeconds = sec; sc.stillStart = 0; sc.stillEnd = Math.max(1, sec - 1.2);
          sc.layers = briefingLayers(lay, common);
          sc.transition = 'scanwipe'; sc.transitionSeconds = 0.9;
          if (lay === 'zoom') { Object.assign(sc.camera, zoomCamera([20, 25], sec, 13, { globe: false })); sc.briefZoom = true; sc.stillEnd = 0.5; Object.assign(sc.look, { globe: false, theme: 'satellite', placeNames: true, lang: 'en' }); }
          return sc;
        });
      } else { if (layout === 'mofa') { Object.assign(p.scenes[0].look, { theme: 'satellite', placeNames: true, lang: 'en' }); common.kicker = 'Geospatial analysis'; } p.scenes[0].layers.push(...briefingLayers(layout, common)); p.scenes[0].stillStart = 0; p.scenes[0].stillEnd = 7; }
    }
    await saveProject(p);
    $('#create-name').value = '';
    open(p.id);
  });
  $('#try-demo').onclick = async () => {
    const p = demoProject();
    p.name = 'Demo · Gulf road trip';
    await saveProject(p);
    open(p.id, { fit: true });
  };

  async function openFile(file) {
    try {
      if (ROUTE_EXT.test(file.name) || /\.gpx$/i.test(file.name)) {
        const p = newProject(file.name.replace(/\.[^.]+$/, ''));
        await saveProject(p);
        open(p.id, { importFile: file });
        return;
      }
      const text = await file.text();
      const json = JSON.parse(text);
      if (json.type && /Feature|LineString/.test(json.type)) {
        const p = newProject(file.name.replace(/\.[^.]+$/, ''));
        await saveProject(p);
        open(p.id, { importFile: file });
        return;
      }
      if (json.scenes) await importProjectMedia(json);
      const p = normalizeProject(json);
      await saveProject(p);
      toast('Project opened');
      open(p.id, { fit: true });
    } catch (err) {
      toast(err.message || 'Could not open that file');
    }
  }
  $('#home-open').onclick = () => $('#file-project').click();
  $('#file-project').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openFile(f); });
  const veil = $('#drop-veil');
  let dragDepth = 0;
  const homeEl = $('#home');
  homeEl.addEventListener('dragenter', (e) => { if ([...e.dataTransfer.types].includes('Files')) { dragDepth++; veil.classList.add('show'); } });
  homeEl.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; veil.classList.remove('show'); } });
  homeEl.addEventListener('dragover', (e) => e.preventDefault());
  homeEl.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    veil.classList.remove('show');
    const f = e.dataTransfer.files[0];
    if (f) openFile(f);
  });

  // ---------------- live demo
  let demoMap = null, demoProj = null, demoModel = null, raf = 0, t0 = 0, running = false;
  const overlay = $('#demo-overlay');
  const octx = overlay.getContext('2d');
  async function startDemo() {
    if (running) return;
    running = true;
    const el = $('#demo-map');
    if (!demoMap) {
      demoProj = demoProject();
      const sc = demoProj.scenes[0];
      demoMap = new maplibregl.Map({
        container: el, style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#d9dde2' } }] },
        interactive: false, attributionControl: false, fadeDuration: 0, center: [56, 24], zoom: 5,
      });
      buildStyle(sc.look).then((st) => demoMap.setStyle(st)).catch(() => {});
      demoMap.on('render', drawDemo);
      demoMap.on('error', () => {});
      new ResizeObserver(() => { if (!el.clientWidth || !el.clientHeight) return; demoMap.resize(); layoutDemo(); }).observe(el);
      layoutDemo();
    }
    t0 = performance.now();
    const loop = (now) => {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (!demoModel) return;
      const t = ((now - t0) / 1000) % (demoModel.total + 1.2);
      const c = demoModel.cameraAt(Math.min(t, demoModel.total));
      demoMap.jumpTo({ center: c.center, zoom: c.zoom, bearing: c.bearing, pitch: c.pitch });
      demoMap.triggerRepaint();
    };
    raf = requestAnimationFrame(loop);
  }
  function layoutDemo() {
    const el = $('#demo-map');
    if (!el.clientWidth || !el.clientHeight) return;
    const dpr = window.devicePixelRatio || 1;
    overlay.width = el.clientWidth * dpr;
    overlay.height = el.clientHeight * dpr;
    demoModel = buildScene(demoProj.scenes[0], el.clientWidth, el.clientHeight);
  }
  function drawDemo() {
    if (!demoModel) return;
    const el = $('#demo-map');
    const px = overlay.width / (el.clientWidth || 1);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    const t = ((performance.now() - t0) / 1000) % (demoModel.total + 1.2);
    renderScene(octx, {
      map: demoMap, model: demoModel, scene: demoProj.scenes[0], time: Math.min(t, demoModel.total), px,
      unit: (Math.min(el.clientWidth, el.clientHeight) / 720) * px * 1.25,
      frame: { x: 0, y: 0, w: overlay.width, h: overlay.height },
    });
  }
  function stopDemo() { running = false; cancelAnimationFrame(raf); }

  return {
    show() { $('#home').hidden = false; renderProjects(); startDemo(); document.title = 'GIS One Map Animator — animated map videos'; },
    hide() { $('#home').hidden = true; stopDemo(); },
  };
}
