// Home page: create/open projects, the list of saved projects, and the live demo.
import { listProjects, saveProject, deleteProject, newProject, normalizeProject, demoProject, projectFileJSON, importProjectMedia } from './store.js';
import { buildStyle } from './themes.js';
import { buildScene } from './scene.js';
import { renderScene } from './renderer.js';
import { bounds } from './geo.js';
import { toast, downloadBlob } from './editor.js';

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

export function createHome({ open }) {
  // ---------------- projects
  async function renderProjects() {
    const list = await listProjects();
    $('#projects-count').textContent = list.length ? `${list.length} project${list.length === 1 ? '' : 's'}, saved in this browser` : '';
    const grid = $('#project-grid');
    if (!list.length) {
      grid.innerHTML = '<div class="empty-projects">Your projects will appear here. They are saved in this browser only — use “Save file” in the editor to keep a copy.</div>';
      return;
    }
    grid.innerHTML = list.map((p) => `
      <div class="project-card" data-id="${p.id}">
        <canvas></canvas>
        <div><h3>${esc(p.name)}</h3><p>${p.scenes.length} scene${p.scenes.length === 1 ? '' : 's'} · ${esc(p.aspect)}</p><p>Edited ${ago(p.updatedAt)}</p></div>
        <div class="acts">
          <button class="square-btn" data-dl title="Download project file"><svg viewBox="0 0 24 24"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/></svg></button>
          <button class="square-btn" data-del title="Delete project"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg></button>
        </div>
      </div>`).join('');
    list.forEach((p) => drawThumb($(`[data-id="${p.id}"] canvas`, grid), p));
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

  $('#create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = newProject($('#create-name').value.trim() || 'Untitled trip');
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
    show() { $('#home').hidden = false; renderProjects(); startDemo(); document.title = 'Map Animator — animated map videos of your trips'; },
    hide() { $('#home').hidden = true; stopDemo(); },
  };
}
