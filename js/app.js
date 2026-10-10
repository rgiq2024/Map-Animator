// Map Animator — main UI controller.
import {
  MODES, STYLES, ASPECTS, RESOLUTIONS, videoSize, uid, demoProject, emptyProject, syncLegs,
  fetchRoute, geocode, reverseGeocode, parseGPX, serialize, deserialize, toShareHash, fromShareHash,
} from './model.js';
import { buildTimeline } from './timeline.js';
import { drawOverlay, drawAttribution } from './render.js';
import { exportVideo } from './export.js';
import { haversine, simplify, formatDistance } from './geo.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const SHORT_SIDE = 720; // virtual stage size (CSS px) of the video's short side
const STORE_KEY = 'map-animator:project:v1';

// ---------- state ----------
let project;
let tl;
let time = 0;
let playing = false;
let playStartNow = 0, playStartTime = 0;
let viewMode = 'edit'; // 'edit' (free map, editable) | 'play' (camera driven by timeline)
let exporting = false;
let cssW = 1280, cssH = 720;
let markers = [];

// ---------- elements ----------
const stage = $('#stage');
const wrap = $('#stage-wrap');
const overlay = $('#overlay');
const octx = overlay.getContext('2d');
const scrub = $('#scrub');

// ---------- utils ----------
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
let toastTimer;
function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const legKey = (i) => {
  const a = project.stops[i], b = project.stops[i + 1];
  return `${project.legs[i].mode}|${a.lng.toFixed(5)},${a.lat.toFixed(5)}|${b.lng.toFixed(5)},${b.lat.toFixed(5)}`;
};

// ---------- load project ----------
async function loadInitial() {
  if (location.hash.length > 3) {
    try {
      const p = await fromShareHash(location.hash);
      if (p) return p;
    } catch (e) { console.warn(e); toast('Could not read the shared link'); }
  }
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return deserialize(JSON.parse(raw));
  } catch { /* ignore */ }
  return demoProject();
}

function adoptKeys() {
  syncLegs(project);
  project.legs.forEach((leg, i) => { if (leg.coords) leg.key = legKey(i); });
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(serialize(project))); } catch { /* storage unavailable */ }
  }, 400);
}

// ---------- map ----------
const styleDef = (k) => STYLES[k] || STYLES.liberty;
const styleSpec = (k) => styleDef(k).url || styleDef(k).style;

const map = new maplibregl.Map({
  container: 'map',
  style: styleSpec('liberty'),
  center: [55, 24],
  zoom: 4,
  attributionControl: false,
  canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
  fadeDuration: 0,
  maxPitch: 70,
});
map.on('error', (e) => console.warn('map error', e?.error?.message || e));
map.on('render', drawPreviewOverlay);

function setStyle(key) {
  map.setStyle(styleSpec(key));
}

function applyCamera(t) {
  const c = tl.cameraAt(t);
  map.jumpTo({ center: c.center, zoom: c.zoom, pitch: c.pitch || 0, bearing: c.bearing || 0 });
}

// User grabs the map while in preview → back to editing.
for (const ev of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart']) {
  map.on(ev, (e) => { if (e.originalEvent && viewMode === 'play' && !exporting) setViewMode('edit'); });
}

map.on('click', async (e) => {
  if (viewMode !== 'edit' || exporting) return;
  if (e.originalEvent?.target?.closest?.('.pin, .maplibregl-marker')) return;
  const stop = { id: uid(), name: `Stop ${project.stops.length + 1}`, lng: +e.lngLat.lng.toFixed(6), lat: +e.lngLat.lat.toFixed(6), auto: true };
  addStop(stop);
  const name = await reverseGeocode(stop.lng, stop.lat, Math.max(3, Math.min(14, map.getZoom() + 2)));
  if (name && stop.auto) { stop.name = name; renderList(); rebuild(); }
});

// ---------- layout ----------
function layout() {
  if (!project) return;
  const r = ASPECTS[project.settings.aspect] || 16 / 9;
  if (r >= 1) { cssH = SHORT_SIDE; cssW = Math.round(SHORT_SIDE * r); } else { cssW = SHORT_SIDE; cssH = Math.round(SHORT_SIDE / r); }
  const box = wrap.getBoundingClientRect();
  const pad = box.width < 600 ? 10 : 28;
  const scale = Math.max(0.05, Math.min((box.width - pad * 2) / cssW, (box.height - pad * 2) / cssH));
  stage.style.width = `${cssW}px`;
  stage.style.height = `${cssH}px`;
  stage.style.transform = `translate(${(box.width - cssW * scale) / 2}px, ${(box.height - cssH * scale) / 2}px) scale(${scale})`;
  if (!exporting) {
    const pr = Math.min(3, Math.max(0.5, (window.devicePixelRatio || 1) * scale));
    map.resize();
    map.setPixelRatio(pr);
    overlay.width = Math.round(cssW * pr);
    overlay.height = Math.round(cssH * pr);
  }
  rebuild(false);
}
new ResizeObserver(() => layout()).observe(wrap);

// ---------- timeline ----------
function rebuild(doSave = true) {
  syncLegs(project);
  tl = buildTimeline(project, cssW, cssH);
  time = Math.min(time, tl.total);
  scrub.max = tl.total.toFixed(2);
  scrub.value = time;
  $('#scrub-markers').innerHTML = tl.stopTimes
    .map((t) => `<i style="left:${(t / tl.total) * 100}%"></i>`).join('');
  updateTime();
  updateSummary();
  updateLegMeta();
  syncMarkers();
  if (viewMode === 'play') applyCamera(time);
  map.triggerRepaint();
  if (doSave) save();
}

function ensureRoutes() {
  project.legs.forEach((leg, i) => {
    const key = legKey(i);
    if (leg.key !== key) {
      if (leg.key !== undefined || !leg.coords) { leg.coords = null; leg.gpx = false; }
      leg.key = key;
      leg.error = null;
    }
    const profile = MODES[leg.mode]?.routing;
    if (!profile || leg.coords || leg.pending || leg.error) return;
    const a = project.stops[i], b = project.stops[i + 1];
    if (haversine([a.lng, a.lat], [b.lng, b.lat]) < 30) return;
    leg.pending = true;
    fetchRoute(profile, [a.lng, a.lat], [b.lng, b.lat])
      .then((coords) => { if (leg.key === key) leg.coords = coords; })
      .catch((e) => { if (leg.key === key) leg.error = e.message || 'Routing failed'; })
      .finally(() => { leg.pending = false; rebuild(); });
  });
}

function changed({ list = true } = {}) {
  syncLegs(project);
  ensureRoutes();
  if (list) renderList();
  rebuild();
}

// ---------- overlay drawing (preview) ----------
function drawPreviewOverlay() {
  if (exporting || !tl) return;
  const scale = overlay.width / cssW;
  octx.clearRect(0, 0, overlay.width, overlay.height);
  drawOverlay(octx, map, project, tl, viewMode === 'play' ? time : null, scale);
  drawAttribution(octx, styleDef(project.settings.style).attribution, scale, overlay.width, overlay.height);
}

// ---------- playback ----------
function setViewMode(m) {
  viewMode = m;
  stage.classList.toggle('playing', m === 'play');
  $('#mode-pill').hidden = m !== 'play' || exporting;
  if (m === 'edit') setPlaying(false);
  syncMarkers();
  if (m === 'play') applyCamera(time);
  map.triggerRepaint();
}

function setPlaying(p) {
  playing = p;
  document.body.classList.toggle('is-playing', p);
  if (p) { playStartNow = performance.now(); playStartTime = time; }
}

function updateTime() {
  $('#time').textContent = `${fmtTime(time)} / ${fmtTime(tl.total)}`;
}

function tick(now) {
  if (playing && !exporting) {
    time = playStartTime + (now - playStartNow) / 1000;
    if (time >= tl.total) { time = tl.total; setPlaying(false); }
    scrub.value = time;
    updateTime();
    applyCamera(time);
    map.triggerRepaint();
  }
  requestAnimationFrame(tick);
}

$('#btn-play').onclick = togglePlay;
function togglePlay() {
  if (!project.stops.length) { toast('Add a few stops first'); return; }
  if (viewMode !== 'play') setViewMode('play');
  if (!playing && time >= tl.total - 0.01) time = 0;
  setPlaying(!playing);
}
$('#btn-restart').onclick = () => {
  setViewMode('play');
  time = 0;
  scrub.value = 0;
  updateTime();
  setPlaying(playing);
  applyCamera(0);
};
$('#btn-edit').onclick = () => {
  setViewMode('edit');
  const c = tl.overview;
  map.easeTo({ center: c.center, zoom: c.zoom, pitch: 0, bearing: 0, duration: 600 });
};
scrub.addEventListener('input', () => {
  if (viewMode !== 'play') setViewMode('play');
  setPlaying(false);
  time = +scrub.value;
  updateTime();
  applyCamera(time);
});
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName) && !exporting) {
    e.preventDefault();
    togglePlay();
  }
});

// ---------- markers (edit mode) ----------
function syncMarkers() {
  const show = viewMode === 'edit' && !exporting;
  if (!show) { markers.forEach((m) => m.remove()); markers = []; return; }
  // Rebuild only if count changed; otherwise just move.
  if (markers.length !== project.stops.length) {
    markers.forEach((m) => m.remove());
    markers = project.stops.map((s, i) => {
      const el = document.createElement('div');
      el.className = 'pin';
      el.title = 'Drag to move';
      const m = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([s.lng, s.lat]).addTo(map);
      m.on('dragend', () => {
        const st = project.stops[i];
        if (!st) return;
        const ll = m.getLngLat().wrap();
        st.lng = +ll.lng.toFixed(6);
        st.lat = +ll.lat.toFixed(6);
        changed({ list: false });
      });
      m.on('drag', () => {
        const st = project.stops[i];
        if (!st) return;
        const ll = m.getLngLat();
        st.lng = ll.lng; st.lat = ll.lat;
        project.legs.forEach((leg, k) => { if (k === i || k === i - 1) leg.coords = leg.gpx ? leg.coords : null; });
        tl = buildTimeline(project, cssW, cssH);
        map.triggerRepaint();
      });
      return m;
    });
  } else {
    markers.forEach((m, i) => m.setLngLat([project.stops[i].lng, project.stops[i].lat]));
  }
}

// ---------- stop list ----------
const GRIP = '<svg viewBox="0 0 10 16"><circle cx="2.5" cy="3" r="1.5"/><circle cx="7.5" cy="3" r="1.5"/><circle cx="2.5" cy="8" r="1.5"/><circle cx="7.5" cy="8" r="1.5"/><circle cx="2.5" cy="13" r="1.5"/><circle cx="7.5" cy="13" r="1.5"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const ICON_TAG = '<svg viewBox="0 0 24 24"><path d="M4 5h16v10H9l-5 4z"/></svg>';
const ICON_FOCUS = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>';

function renderList() {
  const ol = $('#stops');
  $('#empty').hidden = project.stops.length > 0;
  const html = [];
  project.stops.forEach((s, i) => {
    html.push(`
      <li class="stop" data-i="${i}">
        <span class="handle" title="Drag to reorder">${GRIP}</span>
        <span class="num">${i + 1}</span>
        <input type="text" class="name" value="${esc(s.name)}" aria-label="Stop name" />
        <span class="acts">
          <button class="mini" data-act="focus" title="Show on map">${ICON_FOCUS}</button>
          <button class="mini ${s.hideSign ? 'off' : ''}" data-act="sign" title="${s.hideSign ? 'Sign hidden — click to show' : 'Sign text'}">${ICON_TAG}</button>
          <button class="mini" data-act="del" title="Remove stop">${ICON_X}</button>
        </span>
        <div class="label-row"><input type="text" class="label" placeholder="Sign text (defaults to the name)" value="${esc(s.label || '')}" /></div>
      </li>`);
    if (i < project.stops.length - 1) {
      const leg = project.legs[i];
      html.push(`
        <li class="leg" data-leg="${i}">
          <select class="mode" aria-label="Travel mode">
            ${Object.entries(MODES).map(([k, m]) => `<option value="${k}" ${k === leg.mode ? 'selected' : ''}>${m.icon} ${m.label}</option>`).join('')}
            ${leg.gpx ? '<option value="__gpx" disabled>— GPX track —</option>' : ''}
          </select>
          <select class="cam" aria-label="Camera for this leg" title="Camera for this leg">
            <option value="auto" ${!leg.camera || leg.camera === 'auto' ? 'selected' : ''}>🎥 Default</option>
            <option value="follow" ${leg.camera === 'follow' ? 'selected' : ''}>🎥 Follow</option>
            <option value="close" ${leg.camera === 'close' ? 'selected' : ''}>🎥 Close-up</option>
            <option value="fit" ${leg.camera === 'fit' ? 'selected' : ''}>🎥 Whole leg</option>
          </select>
          <span class="meta"></span>
        </li>`);
    }
  });
  ol.innerHTML = html.join('');
  updateLegMeta();
}

function updateLegMeta() {
  if (!tl) return;
  $$('#stops .leg').forEach((li) => {
    const i = +li.dataset.leg;
    const leg = project.legs[i];
    const L = tl.legs[i];
    const meta = $('.meta', li);
    if (!leg || !L || !meta) return;
    meta.classList.toggle('err', !!leg.error);
    if (leg.pending) meta.innerHTML = '<span class="spin"></span> routing…';
    else if (leg.error) meta.textContent = `${leg.error} · straight line`;
    else meta.textContent = `${formatDistance(L.m.length)}${leg.gpx ? ' · GPX' : ''} · ${L.seconds.toFixed(1)} s`;
  });
}

const stopsEl = $('#stops');
stopsEl.addEventListener('input', (e) => {
  const li = e.target.closest('.stop');
  if (!li) return;
  const s = project.stops[+li.dataset.i];
  if (e.target.classList.contains('name')) { s.name = e.target.value; s.auto = false; }
  if (e.target.classList.contains('label')) s.label = e.target.value;
  rebuild();
});
stopsEl.addEventListener('change', (e) => {
  const li = e.target.closest('.leg');
  if (!li) return;
  const leg = project.legs[+li.dataset.leg];
  if (e.target.classList.contains('mode')) {
    leg.mode = e.target.value;
    if (leg.gpx) { leg.gpx = false; leg.coords = null; }
    changed();
  }
  if (e.target.classList.contains('cam')) { leg.camera = e.target.value; rebuild(); }
});
stopsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const i = +btn.closest('.stop').dataset.i;
  const s = project.stops[i];
  if (btn.dataset.act === 'del') {
    project.stops.splice(i, 1);
    project.legs.splice(Math.min(i, project.legs.length - 1), 1);
    changed();
  } else if (btn.dataset.act === 'sign') {
    const li = btn.closest('.stop');
    if (!li.classList.contains('open')) { li.classList.add('open'); s.hideSign = false; $('.label', li).focus(); }
    else { s.hideSign = !s.hideSign; if (s.hideSign) li.classList.remove('open'); }
    btn.classList.toggle('off', !!s.hideSign);
    rebuild();
  } else if (btn.dataset.act === 'focus') {
    setViewMode('edit');
    map.easeTo({ center: [s.lng, s.lat], zoom: Math.max(map.getZoom(), 9), duration: 700 });
  }
});

// drag to reorder
let dragFrom = null;
stopsEl.addEventListener('pointerdown', (e) => {
  const h = e.target.closest('.handle');
  if (h) h.closest('.stop').draggable = true;
});
stopsEl.addEventListener('dragstart', (e) => {
  const li = e.target.closest('.stop');
  if (!li) return;
  dragFrom = +li.dataset.i;
  li.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(dragFrom));
});
stopsEl.addEventListener('dragover', (e) => {
  if (dragFrom == null) return;
  e.preventDefault();
  $$('.stop', stopsEl).forEach((x) => x.classList.remove('drop-before'));
  const li = e.target.closest('.stop');
  if (li) li.classList.add('drop-before');
});
stopsEl.addEventListener('drop', (e) => {
  e.preventDefault();
  const li = e.target.closest('.stop') || e.target.closest('.leg')?.nextElementSibling;
  let to = li ? +li.dataset.i : project.stops.length;
  if (dragFrom != null && to !== dragFrom) {
    const [s] = project.stops.splice(dragFrom, 1);
    if (to > dragFrom) to -= 1;
    project.stops.splice(to, 0, s);
    changed();
  }
});
stopsEl.addEventListener('dragend', () => {
  dragFrom = null;
  $$('.stop', stopsEl).forEach((x) => { x.classList.remove('dragging', 'drop-before'); x.draggable = false; });
});

function addStop(stop) {
  project.stops.push(stop);
  syncLegs(project);
  if (project.legs.length) {
    // Pick a sensible default mode by distance.
    const a = project.stops.at(-2);
    const d = haversine([a.lng, a.lat], [stop.lng, stop.lat]);
    const leg = project.legs.at(-1);
    if (!leg.key) leg.mode = d > 900e3 ? 'plane' : (project.legs.at(-2)?.mode === 'plane' ? 'car' : (project.legs.at(-2)?.mode || 'car'));
  }
  changed();
}

// ---------- search ----------
const searchEl = $('#search');
const resultsEl = $('#results');
let searchTimer, searchSeq = 0, results = [];
searchEl.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = searchEl.value.trim();
  if (q.length < 3) { resultsEl.hidden = true; return; }
  searchTimer = setTimeout(() => runSearch(q), 550);
});
searchEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { clearTimeout(searchTimer); if (results.length && !resultsEl.hidden) pickResult(0); else runSearch(searchEl.value.trim()); }
  if (e.key === 'Escape') resultsEl.hidden = true;
});
document.addEventListener('click', (e) => { if (!e.target.closest('.search')) resultsEl.hidden = true; });
async function runSearch(q) {
  if (!q) return;
  const seq = ++searchSeq;
  resultsEl.hidden = false;
  resultsEl.innerHTML = '<li class="msg"><span class="spin"></span> Searching…</li>';
  try {
    results = await geocode(q);
    if (seq !== searchSeq) return;
    resultsEl.innerHTML = results.length
      ? results.map((r, i) => `<li data-i="${i}"><b>${esc(r.name)}</b><small>${esc(r.detail)}</small></li>`).join('')
      : '<li class="msg">No places found</li>';
  } catch {
    resultsEl.innerHTML = '<li class="msg">Search is unavailable right now</li>';
  }
}
resultsEl.addEventListener('click', (e) => {
  const li = e.target.closest('li[data-i]');
  if (li) pickResult(+li.dataset.i);
});
function pickResult(i) {
  const r = results[i];
  if (!r) return;
  resultsEl.hidden = true;
  searchEl.value = '';
  setViewMode('edit');
  addStop({ id: uid(), name: r.name, lng: r.lng, lat: r.lat });
  fitAll();
}
function fitAll() {
  const c = tl.overview;
  map.easeTo({ center: c.center, zoom: c.zoom, pitch: 0, bearing: 0, duration: 700 });
}

// ---------- route actions ----------
$('#btn-reverse').onclick = () => {
  project.stops.reverse();
  project.legs.reverse();
  project.legs.forEach((l) => { if (l.gpx && l.coords) l.coords = [...l.coords].reverse(); });
  adoptKeys();
  changed();
};
$('#btn-clear').onclick = () => {
  if (project.stops.length && !confirm('Remove all stops?')) return;
  project.stops = [];
  project.legs = [];
  time = 0;
  setViewMode('edit');
  changed();
};
$('#btn-gpx').onclick = () => { fileInput.accept = '.gpx,application/gpx+xml'; fileInput.click(); };
$('#btn-open').onclick = () => { fileInput.accept = '.gpx,.json,application/json,application/gpx+xml'; fileInput.click(); };

const fileInput = $('#file');
fileInput.addEventListener('change', async () => {
  const f = fileInput.files[0];
  fileInput.value = '';
  if (!f) return;
  const text = await f.text();
  try {
    if (/\.json$/i.test(f.name) || text.trim().startsWith('{')) {
      project = deserialize(JSON.parse(text));
      adoptKeys();
      afterProjectLoad();
      toast('Project opened');
    } else {
      importGPX(text, f.name);
    }
  } catch (e) {
    toast(e.message || 'Could not open that file');
  }
});

function importGPX(text, filename) {
  const g = parseGPX(text);
  if (project.stops.length && !confirm('Replace the current stops with this GPX track?')) return;
  const stops = [], legs = [];
  if (g.tracks.length) {
    g.tracks.forEach((trk, k) => {
      const coords = simplify(trk, 0.00003);
      if (k === 0) stops.push({ id: uid(), name: 'Start', lng: coords[0][0], lat: coords[0][1], auto: true });
      else {
        const prev = stops.at(-1);
        if (haversine([prev.lng, prev.lat], coords[0]) > 200) {
          stops.push({ id: uid(), name: `Part ${k + 1}`, lng: coords[0][0], lat: coords[0][1], auto: true });
          legs.push({ mode: 'jump', coords: null });
        }
      }
      const end = coords.at(-1);
      stops.push({ id: uid(), name: k === g.tracks.length - 1 ? 'Finish' : `Stop ${stops.length + 1}`, lng: end[0], lat: end[1], auto: true });
      legs.push({ mode: 'walk', coords, gpx: true });
    });
  } else {
    g.wpts.forEach((w) => stops.push({ id: uid(), name: w.name || `Stop ${stops.length + 1}`, lng: w.lng, lat: w.lat }));
    for (let i = 1; i < stops.length; i++) legs.push({ mode: 'car', coords: null });
  }
  project.stops = stops;
  project.legs = legs;
  if (g.name || filename) project.title = g.name || filename.replace(/\.gpx$/i, '');
  // Guess mode from speed-less geometry: long tracks are probably rides/drives.
  project.legs.forEach((l) => {
    if (!l.gpx) return;
    let len = 0;
    for (let i = 1; i < l.coords.length; i++) len += haversine(l.coords[i - 1], l.coords[i]);
    l.mode = len > 120e3 ? 'car' : len > 30e3 ? 'bike' : 'walk';
  });
  adoptKeys();
  afterProjectLoad();
  toast(`Imported ${g.tracks.length || g.wpts.length} ${g.tracks.length ? 'track' : 'waypoint'}${(g.tracks.length || g.wpts.length) === 1 ? '' : 's'} — set the travel mode per leg on the Route tab`, 4200);
  stops.forEach(async (s) => {
    if (!s.auto) return;
    const n = await reverseGeocode(s.lng, s.lat, 14);
    if (n && s.auto) { s.name = n; renderList(); rebuild(); }
  });
}

// ---------- settings bindings ----------
function bindSettings() {
  $$('[data-setting]').forEach((el) => {
    const key = el.dataset.setting;
    const v = project.settings[key];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
    showOutput(key);
  });
  $('#title').value = project.title || '';
  $('#subtitle').value = project.subtitle || '';
  renderStylePicker();
  renderSwatches();
  renderAspects();
  renderResolutions();
  $$('#cam-mode button').forEach((b) => b.classList.toggle('active', b.dataset.cam === project.settings.camera));
}
function showOutput(key) {
  const out = $(`output[data-out="${key}"]`);
  if (!out) return;
  const v = project.settings[key];
  out.textContent = key === 'speed' ? `${v}×` : key === 'pitch' ? `${v}°` : key === 'zoomOffset' ? (v > 0 ? `+${v}` : `${v}`) : `${v}`;
}
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-setting]');
  if (!el) return;
  const key = el.dataset.setting;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.type === 'range' || el.type === 'number' || key === 'fps' || key === 'resolution') v = +v;
  project.settings[key] = v;
  showOutput(key);
  if (key === 'aspect') layout();
  rebuild();
});
$('#title').addEventListener('input', (e) => { project.title = e.target.value; rebuild(); });
$('#subtitle').addEventListener('input', (e) => { project.subtitle = e.target.value; rebuild(); });
$$('#cam-mode button').forEach((b) => b.addEventListener('click', () => {
  project.settings.camera = b.dataset.cam;
  $$('#cam-mode button').forEach((x) => x.classList.toggle('active', x === b));
  rebuild();
  if (viewMode !== 'play') setViewMode('play');
}));

const STYLE_SWATCH = {
  liberty: 'linear-gradient(135deg,#f2efe9 0 45%,#aadaff 45% 60%,#e7f0d8 60%)',
  bright: 'linear-gradient(135deg,#f8f4f0 0 50%,#a0c8f0 50% 62%,#fcd6a4 62%)',
  positron: 'linear-gradient(135deg,#fafaf8 0 55%,#d4dadc 55% 66%,#ececec 66%)',
  voyager: 'linear-gradient(135deg,#f5f3ef 0 48%,#a8d1e7 48% 60%,#e0ebd3 60%)',
  dark: 'linear-gradient(135deg,#2b2b2b 0 55%,#191a1a 55% 66%,#3a3a3a 66%)',
  satellite: 'linear-gradient(135deg,#3f5a3a 0 35%,#7b6f52 35% 55%,#1f3b5c 55%)',
};
function renderStylePicker() {
  $('#styles').innerHTML = Object.entries(STYLES).map(([k, s]) =>
    `<button class="style-card ${k === project.settings.style ? 'active' : ''}" data-style="${k}"><i class="sw" style="background:${STYLE_SWATCH[k]}"></i><span>${s.label}</span></button>`).join('');
}
$('#styles').addEventListener('click', (e) => {
  const b = e.target.closest('[data-style]');
  if (!b) return;
  project.settings.style = b.dataset.style;
  setStyle(b.dataset.style);
  renderStylePicker();
  rebuild();
});

const COLORS = ['#e8553f', '#2d7ff9', '#14a35b', '#8b5cf6', '#f59e0b', '#ec4899', '#111827'];
function renderSwatches() {
  const cur = project.settings.lineColor;
  $('#swatches').innerHTML = COLORS.map((c) =>
    `<button class="swatch ${c === cur ? 'active' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('') +
    `<label class="swatch-custom ${COLORS.includes(cur) ? '' : 'active'}" title="Custom colour"><input type="color" value="${cur}" /></label>`;
}
$('#swatches').addEventListener('click', (e) => {
  const b = e.target.closest('[data-color]');
  if (!b) return;
  e.preventDefault();
  project.settings.lineColor = b.dataset.color;
  renderSwatches();
  rebuild();
});
$('#swatches').addEventListener('input', (e) => {
  if (e.target.type !== 'color') return;
  e.stopPropagation();
  project.settings.lineColor = e.target.value;
  $$('#swatches .swatch').forEach((x) => x.classList.remove('active'));
  rebuild();
});

function renderAspects() {
  $('#aspects').innerHTML = Object.entries(ASPECTS).map(([k, r]) => {
    const w = r >= 1 ? 26 : Math.round(26 * r), h = r >= 1 ? Math.round(26 / r) : 26;
    return `<button class="aspect ${k === project.settings.aspect ? 'active' : ''}" data-aspect="${k}"><i style="width:${w}px;height:${h}px"></i>${k}</button>`;
  }).join('');
}
$('#aspects').addEventListener('click', (e) => {
  const b = e.target.closest('[data-aspect]');
  if (!b) return;
  project.settings.aspect = b.dataset.aspect;
  renderAspects();
  renderResolutions();
  layout();
  if (viewMode === 'edit') fitAll();
});
function renderResolutions() {
  const sel = $('#res');
  sel.innerHTML = Object.entries(RESOLUTIONS).map(([k, label]) => {
    const { width, height } = videoSize(project.settings.aspect, +k);
    return `<option value="${k}">${label} · ${width}×${height}</option>`;
  }).join('');
  sel.value = project.settings.resolution;
}
function updateSummary() {
  const s = project.settings;
  const { width, height } = videoSize(s.aspect, s.resolution);
  $('#video-summary').textContent = `${fmtTime(tl.total)} long · ${width}×${height} · ${s.fps} fps · ${Math.ceil(tl.total * s.fps)} frames`;
}

// ---------- tabs ----------
$$('.tab').forEach((t) => t.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
  $$('.tab-page').forEach((p) => p.classList.toggle('active', p.dataset.page === t.dataset.tab));
}));

// ---------- share / save ----------
$('#btn-share').onclick = async () => {
  const hash = await toShareHash(project);
  const url = `${location.origin}${location.pathname}#${hash}`;
  history.replaceState(null, '', `#${hash}`);
  try {
    await navigator.clipboard.writeText(url);
    toast(url.length > 8000 ? 'Link copied — it is long because of the detailed route' : 'Share link copied to clipboard');
  } catch {
    prompt('Copy this link:', url);
  }
};
$('#btn-save').onclick = () => {
  const blob = new Blob([JSON.stringify(serialize(project), null, 1)], { type: 'application/json' });
  downloadBlob(blob, `${slug(project.title)}.json`);
};
const slug = (s) => (s || 'trip').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trip';
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// ---------- export ----------
const dlg = $('#export-dlg');
let exportAbort = null, exportUrl = null;
$('#btn-export').onclick = startExport;
async function startExport() {
  if (project.stops.length < 1) { toast('Add some stops first'); return; }
  if (project.legs.some((l) => l.pending)) { toast('Still fetching routes — try again in a moment'); return; }
  const s = project.settings;
  const { width, height } = videoSize(s.aspect, s.resolution);
  setPlaying(false);
  setViewMode('play');
  exporting = true;
  syncMarkers();
  $('#mode-pill').hidden = true;
  exportAbort = new AbortController();
  if (exportUrl) { URL.revokeObjectURL(exportUrl); exportUrl = null; }
  const prev = $('#exp-preview');
  prev.width = 480;
  prev.height = Math.round(480 * height / width);
  const pctx = prev.getContext('2d');
  $('#exp-title').textContent = 'Rendering video…';
  $('#exp-bar').style.width = '0%';
  $('#exp-status').textContent = 'Loading map tiles…';
  $('#exp-download').hidden = true;
  $('#exp-cancel').textContent = 'Cancel';
  dlg.showModal();
  const t0 = performance.now();
  const frames = Math.ceil(tl.total * s.fps);
  let lastPreview = 0;
  try {
    const { blob, ext } = await exportVideo({
      map, project, timeline: tl, applyCamera,
      width, height, cssWidth: cssW, cssHeight: cssH, fps: s.fps,
      attribution: styleDef(s.style).attribution,
      signal: exportAbort.signal,
      onProgress: (f, canvas) => {
        const done = Math.round(f * frames);
        const el = (performance.now() - t0) / 1000;
        const eta = f > 0.02 ? el / f - el : null;
        $('#exp-bar').style.width = `${(f * 100).toFixed(1)}%`;
        $('#exp-status').textContent = `Frame ${done} of ${frames}` + (eta != null ? ` · about ${fmtTime(eta)} left` : '');
        if (performance.now() - lastPreview > 250) {
          lastPreview = performance.now();
          pctx.drawImage(canvas, 0, 0, prev.width, prev.height);
        }
      },
    });
    exportUrl = URL.createObjectURL(blob);
    const name = `${slug(project.title)}-${width}x${height}.${ext}`;
    const a = $('#exp-download');
    a.href = exportUrl;
    a.download = name;
    a.hidden = false;
    a.textContent = `Download ${ext.toUpperCase()} (${(blob.size / 1e6).toFixed(1)} MB)`;
    $('#exp-title').textContent = 'Your video is ready';
    $('#exp-status').textContent = `${name} · rendered in ${fmtTime((performance.now() - t0) / 1000)}`;
    $('#exp-bar').style.width = '100%';
    $('#exp-cancel').textContent = 'Close';
    a.click();
  } catch (e) {
    if (e.name === 'AbortError') dlg.close();
    else {
      console.error(e);
      $('#exp-title').textContent = 'Export failed';
      $('#exp-status').textContent = e.message || String(e);
      $('#exp-cancel').textContent = 'Close';
    }
  } finally {
    exporting = false;
    exportAbort = null;
    layout();
    setViewMode('play');
  }
}
$('#exp-cancel').onclick = () => {
  if (exportAbort) exportAbort.abort();
  else dlg.close();
};
dlg.addEventListener('cancel', (e) => { if (exporting) e.preventDefault(); });

// ---------- boot ----------
function afterProjectLoad() {
  time = 0;
  setPlaying(false);
  bindSettings();
  setStyle(project.settings.style);
  layout();
  ensureRoutes();
  renderList();
  rebuild();
  setViewMode('edit');
  map.jumpTo({ center: tl.overview.center, zoom: tl.overview.zoom, pitch: 0, bearing: 0 });
}

(async () => {
  project = await loadInitial();
  adoptKeys();
  afterProjectLoad();
  requestAnimationFrame(tick);
  // Expose for debugging / automation.
  window.mapAnimator = { get project() { return project; }, get timeline() { return tl; }, map, startExport };
})();
