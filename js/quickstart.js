// Quick Start project templates (Google-Earth-Studio-style camera moves):
// Zoom-To · Orbit · Point-to-Point · Spiral · Fly-To and Orbit.
// Locations come from typed coordinates, a place search, clicks on a map, or an imported point file.
import { newScene } from './scene.js';
import { newLayer, parseCSVPoints, centroid } from './layers.js';
import { geocode } from './services.js';
import { readLayerFile } from './importers.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const D2R = Math.PI / 180;

// ---------------------------------------------------------------- templates
export const TEMPLATES = {
  zoomto: { name: 'Zoom-To', desc: 'Dive from space down to a place, like Google Earth.', multi: 'scenes' },
  orbit: { name: 'Orbit', desc: 'Circle around a landmark at a steady height and tilt.', multi: 'scenes' },
  p2p: { name: 'Point-to-Point', desc: 'Fly from one place to the next, pausing at each stop.', multi: 'one', min: 2 },
  spiral: { name: 'Spiral', desc: 'Circle down from high above while closing in on the place.', multi: 'scenes' },
  flyorbit: { name: 'Fly-To and Orbit', desc: 'Fly to each place, then orbit it before moving on.', multi: 'one' },
};
export const DISTANCES = { 17: 'Very close (landmark)', 15.5: 'Close (street)', 14: 'Neighbourhood', 12.5: 'City', 10: 'Region', 7: 'Country' };
const BASEMAPS = { satellite: 'Satellite (Esri)', sentinel: 'Sentinel-2 cloudless', classic: 'Classic map', dark: 'Dark map', esritopo: 'Topographic', natgeo: 'National Geographic style' };

const DEFAULTS = {
  zoomto: { duration: 10, zoom: 14, tilt: 50, from: 'space' },
  orbit: { duration: 12, zoom: 15.5, tilt: 60, turns: 1, dir: 1 },
  p2p: { stop: 3, flight: 4, zoom: 14, tilt: 50 },
  spiral: { duration: 14, zoom: 15.5, tilt: 62, turns: 1.5, height: 5, dir: 1 },
  flyorbit: { flight: 5, orbit: 8, zoom: 15.5, tilt: 60, turns: 0.75, dir: 1, from: 'space' },
};
const COMMON = { basemap: 'satellite', buildings: true, terrain: false, pins: true, titles: true, names: true };

const V = (ll, zoom, bearing = 0, pitch = 0) => ({ center: [r6(ll[0]), r6(ll[1])], zoomRef: +zoom.toFixed(4), bearing: +(((bearing % 360) + 540) % 360 - 180).toFixed(2), pitch: +clamp(pitch, 0, 70).toFixed(1) });
const K = (t, view, ease = 'linear') => ({ t: +t.toFixed(3), view, ease });
const spaceView = (ll) => V([ll[0] + 28, clamp(ll[1] * 0.55, -40, 45)], 0.55, 0, 0);
function headingTo(a, b) {
  const k = Math.cos(((a[1] + b[1]) / 2) * D2R);
  return (Math.atan2((b[0] - a[0]) * k, b[1] - a[1]) / D2R + 360) % 360;
}
/** Orbit keys around ll from time t0 for dur seconds. */
function orbitKeys(ll, t0, dur, o, b0 = 0, skipFirst = false) {
  const deg = 360 * (+o.turns || 1);
  const n = Math.max(2, Math.ceil(deg / 30));
  const out = [];
  for (let i = skipFirst ? 1 : 0; i <= n; i++) out.push(K(t0 + (i / n) * dur, V(ll, o.zoom, b0 + o.dir * (i / n) * deg, o.tilt)));
  return out;
}

/** Build the scenes for a template. points = [{name, ll:[lng,lat]}]. */
export function buildTemplate(kind, points, opts) {
  const o = { ...COMMON, ...DEFAULTS[kind], ...opts };
  o.zoom = +o.zoom; o.tilt = +o.tilt; o.dir = +o.dir || 1;
  const look = () => {
    const sc = newScene();
    Object.assign(sc.look, {
      theme: o.basemap, placeNames: !!o.names, rasterLabels: !!o.names, buildings3d: !!o.buildings, terrain: !!o.terrain,
      globe: true, atmosphere: true, clouds: kind === 'zoomto' || o.from === 'space', cloudMode: 'zoom', cloudAmount: 0.8,
    });
    sc.stillStart = 0; sc.stillEnd = 0.4;
    sc.camera.mode = 'keyframes';
    sc.camera.tilt = o.tilt;
    return sc;
  };
  const decorate = (sc, p, t) => {
    if (o.pins) {
      const L = newLayer('point', { type: 'Point', coordinates: p.ll }, { start: Math.max(0, t - 0.4), preset: 'pin' });
      L.anim = 'drop'; L.style.label = o.titles ? '' : p.name; L.name = p.name || 'Location';
      sc.layers.push(L);
    }
    if (o.titles && p.name) {
      const C = newLayer('caption', null, { start: Math.max(0, t - 0.2) });
      C.style.text = p.name; C.style.sub = `${Math.abs(p.ll[1]).toFixed(4)}° ${p.ll[1] >= 0 ? 'N' : 'S'}, ${Math.abs(p.ll[0]).toFixed(4)}° ${p.ll[0] >= 0 ? 'E' : 'W'}`;
      C.style.layout = 'lowerThird'; C.name = p.name; C.hold = 3.5;
      sc.layers.push(C);
    }
  };
  const scenes = [];
  if (kind === 'zoomto' || kind === 'orbit' || kind === 'spiral') {
    for (const p of points) {
      const sc = look();
      sc.name = p.name || TEMPLATES[kind].name;
      const keys = sc.camera.keys = [];
      const D = Math.max(3, +o.duration || 10);
      if (kind === 'zoomto') {
        const start = o.from === 'space' ? spaceView(p.ll) : V(p.ll, o.from === 'country' ? 4.5 : 8, 0, 0);
        const arrive = D * 0.8;
        keys.push(K(0, start, 'ease'), K(arrive, V(p.ll, o.zoom, 0, o.tilt), 'linear'), K(D, V(p.ll, o.zoom + 0.25, 14, o.tilt), 'linear'));
        decorate(sc, p, arrive * 0.85);
        if (o.from !== 'space') sc.look.clouds = false;
      } else if (kind === 'orbit') {
        keys.push(...orbitKeys(p.ll, 0, D, o));
        decorate(sc, p, 0.6);
      } else {
        const deg = 360 * (+o.turns || 1.5);
        const n = Math.max(4, Math.ceil(deg / 30));
        const zTop = o.zoom - Math.max(1, +o.height || 5);
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          const zu = 1 - (1 - u) ** 2;
          keys.push(K(u * D, V(p.ll, zTop + (o.zoom - zTop) * zu, o.dir * deg * u, 25 + (o.tilt - 25) * u)));
        }
        decorate(sc, p, D * 0.55);
      }
      if (points.length > 1) sc.transition = 'dissolve', sc.transitionSeconds = 0.8;
      scenes.push(sc);
    }
    return scenes;
  }
  // one scene through all points
  const sc = look();
  sc.name = TEMPLATES[kind].name;
  const keys = sc.camera.keys = [];
  let t = 0;
  if (kind === 'p2p') {
    const stop = Math.max(0.5, +o.stop || 3), flight = Math.max(1, +o.flight || 4);
    points.forEach((p, i) => {
      const nb = points[i + 1] ? headingTo(p.ll, points[i + 1].ll) : (i ? headingTo(points[i - 1].ll, p.ll) : 0);
      const b = i ? headingTo(points[i - 1].ll, p.ll) : nb;
      if (i) t += flight;
      keys.push(K(t, V(p.ll, o.zoom, b, o.tilt), 'linear'));
      decorate(sc, p, t);
      t += stop;
      keys.push(K(t, V(p.ll, o.zoom + 0.2, b + 12, o.tilt), i < points.length - 1 ? 'fly' : 'linear'));
    });
  } else {
    // fly-to and orbit
    const flight = Math.max(1, +o.flight || 5), orbit = Math.max(1, +o.orbit || 8);
    let prevEnd = null;
    points.forEach((p, i) => {
      if (i === 0) {
        if (o.from === 'space') keys.push(K(0, spaceView(p.ll), 'ease'));
        else keys.push(K(0, V(p.ll, o.zoom - 6, 0, 0), 'ease'));
      } else keys.at(-1).ease = 'fly';
      t = (i === 0 ? 0 : prevEnd) + flight;
      const b0 = i ? headingTo(points[i - 1].ll, p.ll) : 0;
      keys.push(...orbitKeys(p.ll, t, orbit, o, b0));
      decorate(sc, p, t - 0.2);
      prevEnd = t + orbit;
    });
    if (o.from !== 'space') sc.look.clouds = false;
  }
  return [sc];
}

// ---------------------------------------------------------------- thumbnails (original line art)
const THUMBS = {
  zoomto: `<circle cx="80" cy="128" r="70" class="q-earth"/><path d="M28 118c30-14 70-12 104 6M40 156c26-8 56-6 84 4" class="q-lat"/><path d="M160 14 C140 34 112 62 100 94" class="q-path"/><path d="M92 84l8 12 9-11" class="q-arrow"/><circle cx="96" cy="108" r="5" class="q-pin"/>`,
  orbit: `<rect x="66" y="58" width="16" height="44" class="q-bld"/><rect x="86" y="44" width="18" height="58" class="q-bld hi"/><rect x="108" y="64" width="14" height="38" class="q-bld"/><ellipse cx="94" cy="96" rx="64" ry="20" class="q-path"/><circle cx="158" cy="96" r="5" class="q-cam"/><path d="M152 84l6 12 8-10" class="q-arrow"/>`,
  p2p: `<path d="M30 112 C60 40 104 40 118 84 S160 120 168 52" class="q-path"/><circle cx="30" cy="112" r="6" class="q-pin"/><circle cx="118" cy="84" r="6" class="q-pin"/><circle cx="168" cy="52" r="6" class="q-pin"/><text x="26" y="134" class="q-num">1</text><text x="114" y="106" class="q-num">2</text><text x="164" y="74" class="q-num">3</text>`,
  spiral: `<path d="M96 80 m0 0 a8 6 0 1 1 10 4 a18 12 0 1 1 -24 -14 a30 20 0 1 1 40 26 a44 30 0 1 1 -64 -34 a58 38 0 1 1 84 44" class="q-path"/><rect x="88" y="66" width="14" height="22" class="q-bld hi"/><circle cx="96" cy="80" r="3" class="q-pin"/>`,
  flyorbit: `<path d="M18 30 C50 34 76 52 84 82" class="q-path"/><ellipse cx="100" cy="96" rx="50" ry="16" class="q-path dash"/><rect x="90" y="64" width="14" height="34" class="q-bld hi"/><rect x="108" y="74" width="12" height="24" class="q-bld"/><circle cx="18" cy="30" r="4" class="q-cam"/><circle cx="150" cy="96" r="4" class="q-cam"/>`,
};
export const thumbSVG = (k) => `<svg viewBox="0 0 200 150" class="q-thumb" aria-hidden="true"><defs><radialGradient id="qg-${k}" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#1f3550"/><stop offset="1" stop-color="#0a0d14"/></radialGradient></defs><rect width="200" height="150" fill="url(#qg-${k})"/><g class="q-stars"><circle cx="20" cy="18" r=".9"/><circle cx="62" cy="12" r=".7"/><circle cx="182" cy="30" r="1"/><circle cx="170" cy="130" r=".8"/><circle cx="12" cy="88" r=".7"/><circle cx="130" cy="20" r=".6"/></g>${THUMBS[k]}</svg>`;

// ---------------------------------------------------------------- the dialog
function parseCoords(q) {
  const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?[\s,;]+(-?\d+(?:\.\d+)?)\s*°?\s*([EW])?$/i);
  if (!m) return null;
  let lat = +m[1], lng = +m[3];
  if (/S/i.test(m[2] || '')) lat = -lat;
  if (/W/i.test(m[4] || '')) lng = -lng;
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) [lat, lng] = [lng, lat];
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lng, lat] : null;
}
const nameOf = (props = {}, i) => props.name || props.Name || props.NAME || props.title || props.label || props.id || `Location ${i + 1}`;

const PICK_STYLE = {
  version: 8,
  sources: {
    img: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, attribution: 'Imagery © Esri' },
    ref: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 },
  },
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b1220' } }, { id: 'img', type: 'raster', source: 'img' }, { id: 'ref', type: 'raster', source: 'ref' }],
};

function dialogHTML() {
  return `
  <dialog class="modal qs-modal" id="qs-modal">
    <div class="modal-head"><div><h3>Quick start project</h3><p class="muted small qs-sub">Pick a camera move, add your places, and we build the animation for you.</p></div><button class="icon-x" data-close>✕</button></div>
    <div class="qs-tabs" role="tablist">${Object.entries(TEMPLATES).map(([k, t]) => `<button role="tab" data-tpl="${k}">${thumbSVG(k)}<b>${t.name}</b></button>`).join('')}</div>
    <div class="qs-body">
      <div class="qs-left">
        <p class="qs-desc" id="qs-desc"></p>
        <span class="label-caps">Locations</span>
        <div class="qs-add">
          <input id="qs-q" type="text" placeholder="Search a place, or type lat, lon (e.g. 25.1972, 55.2744)" autocomplete="off" />
          <button class="btn sm" id="qs-go" type="button">Add</button>
        </div>
        <ul class="qs-results" id="qs-results" hidden></ul>
        <div class="btn-row qs-more">
          <button class="btn sm" id="qs-pick" type="button">📍 Click on the map</button>
          <button class="btn sm" id="qs-import" type="button">⇪ Import points…</button>
          <button class="btn sm" id="qs-clear" type="button">Clear</button>
        </div>
        <p class="muted small">Import GeoJSON, KML/KMZ, GPX waypoints or CSV with latitude/longitude columns.</p>
        <ol class="qs-list" id="qs-list"></ol>
        <div class="qs-opts" id="qs-opts"></div>
      </div>
      <div class="qs-right">
        <div class="qs-map" id="qs-map"></div>
        <p class="muted small" id="qs-map-hint">Turn on “Click on the map”, then click to add places. Drag the map to move around.</p>
      </div>
    </div>
    <div class="modal-actions qs-actions">
      <span class="muted small" id="qs-summary"></span>
      <button class="btn" data-close type="button">Cancel</button>
      <button class="btn primary" id="qs-create" type="button">Create project</button>
    </div>
    <input type="file" id="qs-file" accept=".geojson,.json,.kml,.kmz,.gpx,.csv,.tsv,.txt" hidden />
  </dialog>`;
}

const sel = (id, v, opts) => `<select data-o="${id}">${Object.entries(opts).map(([k, t]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
const num = (id, v, min, max, step, unit) => `<span class="qs-num"><input type="number" data-o="${id}" value="${v}" min="${min}" max="${max}" step="${step}"><i>${unit}</i></span>`;
const rng = (id, v, min, max, step, unit) => `<span class="qs-rng"><input type="range" data-o="${id}" value="${v}" min="${min}" max="${max}" step="${step}"><output>${v}${unit}</output></span>`;
const sw = (id, v) => `<input type="checkbox" class="switch" data-o="${id}" ${v ? 'checked' : ''}>`;
const row = (label, inner) => `<label class="row"><span>${label}</span>${inner}</label>`;

/**
 * Open the Quick start dialog. onCreate({ kind, points, scenes, name }) is called on "Create".
 */
export function openQuickStart({ kind = 'zoomto', onCreate, actionLabel = 'Create project' } = {}) {
  if (!$('#qs-modal')) document.body.insertAdjacentHTML('beforeend', dialogHTML());
  const dlg = $('#qs-modal');
  const state = openQuickStart.state ||= { kind, points: [], opts: {} };
  state.kind = kind;
  for (const k of Object.keys(TEMPLATES)) state.opts[k] ||= { ...COMMON, ...DEFAULTS[k] };
  let map = null, markers = [], picking = false;

  const O = () => state.opts[state.kind];
  function renderOpts() {
    const o = O(), k = state.kind;
    let h = '<span class="label-caps">Camera</span>';
    if (k === 'zoomto' || k === 'flyorbit') h += row('Start from', sel('from', o.from, { space: 'Space (whole Earth)', country: 'Country view', region: 'Region view' }));
    if (k === 'zoomto' || k === 'orbit' || k === 'spiral') h += row('Length', num('duration', o.duration, 3, 120, 1, 's'));
    if (k === 'p2p') h += row('Time at each stop', num('stop', o.stop, 0.5, 30, 0.5, 's')) + row('Flight between stops', num('flight', o.flight, 1, 30, 0.5, 's'));
    if (k === 'flyorbit') h += row('Flight', num('flight', o.flight, 1, 30, 0.5, 's')) + row('Orbit', num('orbit', o.orbit, 1, 60, 0.5, 's'));
    h += row(k === 'spiral' ? 'End distance' : 'Distance', sel('zoom', o.zoom, DISTANCES));
    h += row('Tilt', rng('tilt', o.tilt, 0, 70, 1, '°'));
    if (k === 'orbit' || k === 'spiral' || k === 'flyorbit') {
      h += row('Turns', rng('turns', o.turns, 0.25, 3, 0.25, ''));
      h += row('Direction', sel('dir', o.dir, { 1: 'Clockwise', '-1': 'Anticlockwise' }));
    }
    if (k === 'spiral') h += row('Start height', sel('height', o.height, { 3: 'Low', 5: 'Medium', 7: 'High', 9: 'Very high' }));
    h += '<span class="label-caps">Map</span>';
    h += row('Base map', sel('basemap', o.basemap, BASEMAPS));
    h += row('3D buildings', sw('buildings', o.buildings)) + row('3D terrain', sw('terrain', o.terrain)) + row('Place names', sw('names', o.names));
    h += row('Pins on the places', sw('pins', o.pins)) + row('Title with name & coordinates', sw('titles', o.titles));
    $('#qs-opts').innerHTML = h;
  }
  function renderTabs() {
    $$('.qs-tabs [data-tpl]', dlg).forEach((b) => b.classList.toggle('active', b.dataset.tpl === state.kind));
    $('#qs-desc').textContent = TEMPLATES[state.kind].desc + (TEMPLATES[state.kind].multi === 'scenes' ? ' Several places become one scene each.' : TEMPLATES[state.kind].min ? ' Add at least two places.' : '');
    renderOpts();
    renderSummary();
  }
  function totalSeconds() {
    const o = O(), n = Math.max(1, state.points.length), k = state.kind;
    if (k === 'p2p') return n * o.stop + (n - 1) * o.flight + 0.4;
    if (k === 'flyorbit') return n * (o.flight + o.orbit) + 0.4;
    return n * (+o.duration + 0.4);
  }
  function renderSummary() {
    const n = state.points.length, t = TEMPLATES[state.kind];
    const ok = n >= (t.min || 1);
    $('#qs-summary').textContent = n ? `${n} place${n === 1 ? '' : 's'} · about ${Math.round(totalSeconds())} s${t.multi === 'scenes' && n > 1 ? ` · ${n} scenes` : ''}` : 'Add a place to begin';
    $('#qs-create').disabled = !ok;
  }
  function renderList() {
    const ul = $('#qs-list');
    ul.innerHTML = state.points.map((p, i) => `
      <li data-i="${i}">
        <b class="qs-badge">${i + 1}</b>
        <input class="qs-name" data-f="name" value="${esc(p.name)}" />
        <input class="qs-ll" data-f="lat" value="${p.ll[1].toFixed(5)}" title="Latitude" />
        <input class="qs-ll" data-f="lng" value="${p.ll[0].toFixed(5)}" title="Longitude" />
        <span class="qs-row-acts"><button class="mini" data-a="up" title="Move up">↑</button><button class="mini" data-a="down" title="Move down">↓</button><button class="mini" data-a="del" title="Remove">✕</button></span>
      </li>`).join('') || '<li class="empty">No places yet.</li>';
    syncMarkers();
    renderSummary();
  }
  function syncMarkers() {
    if (!map) return;
    markers.forEach((m) => m.remove());
    markers = state.points.map((p, i) => {
      const el = document.createElement('div');
      el.className = 'qs-marker';
      el.innerHTML = `<div class="qs-pin"><span>${i + 1}</span></div>`;
      const m = new maplibregl.Marker({ element: el, draggable: true, anchor: 'bottom' }).setLngLat(p.ll).addTo(map);
      m.on('dragend', () => { const ll = m.getLngLat(); p.ll = [r6(ll.lng), r6(ll.lat)]; renderList(); });
      return m;
    });
  }
  function addPoint(ll, name, fly = true) {
    state.points.push({ name: name || `Location ${state.points.length + 1}`, ll: [r6(ll[0]), r6(ll[1])] });
    if (state.points.length > 60) state.points.length = 60;
    renderList();
    if (fly && map) map.easeTo({ center: ll, zoom: Math.max(map.getZoom(), 10), duration: 800 });
  }
  function fitAll() {
    if (!map || !state.points.length) return;
    if (state.points.length === 1) { map.easeTo({ center: state.points[0].ll, zoom: 12, duration: 700 }); return; }
    const xs = state.points.map((p) => p.ll[0]), ys = state.points.map((p) => p.ll[1]);
    map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 50, maxZoom: 13, duration: 700 });
  }

  // search / coordinates
  async function search() {
    const q = $('#qs-q').value.trim();
    if (!q) return;
    const ll = parseCoords(q);
    if (ll) { addPoint(ll, `${ll[1].toFixed(4)}, ${ll[0].toFixed(4)}`); $('#qs-q').value = ''; return; }
    const box = $('#qs-results');
    box.hidden = false;
    box.innerHTML = '<li class="muted">Searching…</li>';
    try {
      const res = await geocode(q);
      box.innerHTML = res.length ? res.map((r, i) => `<li data-i="${i}"><b>${esc(r.name)}</b><small>${esc(r.detail)}</small></li>`).join('') : '<li class="muted">Nothing found. Try another name or type coordinates.</li>';
      box.onclick = (e) => {
        const li = e.target.closest('li[data-i]');
        if (!li) return;
        const r = res[+li.dataset.i];
        addPoint([r.lng, r.lat], r.name);
        box.hidden = true; $('#qs-q').value = '';
      };
    } catch { box.innerHTML = '<li class="muted">Search is not available right now — type coordinates instead.</li>'; }
  }

  // import
  async function importFile(f) {
    try {
      let pts = [];
      if (/\.(csv|tsv|txt)$/i.test(f.name)) {
        const d = parseCSVPoints(await f.text());
        pts = d.rows.map((r, i) => ({ name: d.name >= 0 ? r[d.name] : `Location ${i + 1}`, ll: [+r[d.lon], +r[d.lat]] }));
      } else {
        const gj = await readLayerFile(f);
        const feats = gj.type === 'FeatureCollection' ? gj.features : gj.type === 'Feature' ? [gj] : [{ type: 'Feature', properties: {}, geometry: gj }];
        feats.forEach((ft, i) => {
          const g = ft.geometry;
          if (!g) return;
          if (g.type === 'Point') pts.push({ name: nameOf(ft.properties, i), ll: g.coordinates.slice(0, 2) });
          else if (g.type === 'MultiPoint') g.coordinates.forEach((c, j) => pts.push({ name: `${nameOf(ft.properties, i)} ${j + 1}`, ll: c.slice(0, 2) }));
          else { const c = centroid({ geom: g }); if (c) pts.push({ name: nameOf(ft.properties, i), ll: c }); }
        });
      }
      pts = pts.filter((p) => isFinite(p.ll[0]) && isFinite(p.ll[1]) && Math.abs(p.ll[1]) <= 90);
      if (!pts.length) throw new Error('No points with coordinates were found in that file');
      if (pts.length > 60) pts = pts.slice(0, 60);
      pts.forEach((p) => addPoint(p.ll, String(p.name), false));
      fitAll();
    } catch (err) { alert(err.message || 'Could not read that file'); }
  }

  function setPicking(on) {
    picking = on;
    $('#qs-pick').classList.toggle('active', on);
    $('#qs-map').classList.toggle('picking', on);
    $('#qs-map-hint').textContent = on ? 'Click the map to add a place · drag numbers to move them.' : 'Turn on “Click on the map”, then click to add places. Drag the map to move around.';
  }

  // wire once
  if (!dlg.dataset.wired) {
    dlg.dataset.wired = '1';
    dlg.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) dlg.close(); });
    $('.qs-tabs', dlg).addEventListener('click', (e) => { const b = e.target.closest('[data-tpl]'); if (b) { state.kind = b.dataset.tpl; renderTabs(); } });
    $('#qs-go').onclick = search;
    $('#qs-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
    $('#qs-import').onclick = () => $('#qs-file').click();
    $('#qs-file').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); });
    $('#qs-clear').onclick = () => { state.points = []; renderList(); };
    $('#qs-pick').onclick = () => setPicking(!picking);
    $('#qs-list').addEventListener('change', (e) => {
      const li = e.target.closest('li[data-i]');
      if (!li) return;
      const p = state.points[+li.dataset.i];
      const f = e.target.dataset.f;
      if (f === 'name') p.name = e.target.value;
      if (f === 'lat' && isFinite(+e.target.value)) p.ll[1] = clamp(+e.target.value, -85, 85);
      if (f === 'lng' && isFinite(+e.target.value)) p.ll[0] = clamp(+e.target.value, -180, 180);
      renderList();
    });
    $('#qs-list').addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      const li = e.target.closest('li[data-i]');
      if (!a || !li) return;
      const i = +li.dataset.i, P = state.points;
      if (a === 'del') P.splice(i, 1);
      if (a === 'up' && i > 0) [P[i - 1], P[i]] = [P[i], P[i - 1]];
      if (a === 'down' && i < P.length - 1) [P[i + 1], P[i]] = [P[i], P[i + 1]];
      renderList();
    });
    const onOpt = (e) => {
      const el = e.target.closest('[data-o]');
      if (!el) return;
      const o = O();
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'number' || el.type === 'range' || ['zoom', 'dir', 'height'].includes(el.dataset.o)) v = +v;
      o[el.dataset.o] = v;
      const out = el.parentElement.querySelector('output');
      if (out) out.textContent = `${v}${el.dataset.o === 'tilt' ? '°' : ''}`;
      renderSummary();
    };
    $('#qs-opts').addEventListener('input', onOpt);
    $('#qs-opts').addEventListener('change', onOpt);
  }
  $('#qs-create').textContent = actionLabel;
  $('#qs-create').onclick = () => {
    const t = TEMPLATES[state.kind];
    if (state.points.length < (t.min || 1)) return;
    const pts = state.points.map((p) => ({ name: p.name, ll: p.ll.slice() }));
    const scenes = buildTemplate(state.kind, pts, O());
    const name = `${t.name} · ${pts[0].name}${pts.length > 1 ? ` +${pts.length - 1}` : ''}`;
    dlg.close();
    onCreate?.({ kind: state.kind, points: pts, scenes, name });
  };

  renderTabs();
  renderList();
  dlg.showModal();
  // the picker map (created after the dialog is visible so it has a size)
  requestAnimationFrame(() => {
    if (!window.maplibregl) return;
    const holder = $('#qs-map');
    holder.innerHTML = '';
    map = new maplibregl.Map({ container: holder, style: PICK_STYLE, center: [20, 25], zoom: 1.4, attributionControl: { compact: true }, doubleClickZoom: false });
    map.on('load', () => { syncMarkers(); fitAll(); });
    map.on('click', (e) => { if (picking) addPoint([e.lngLat.lng, e.lngLat.lat], null, false); });
    setPicking(state.points.length === 0);
    dlg.addEventListener('close', () => { try { map.remove(); } catch { /* gone */ } map = null; markers = []; }, { once: true });
  });
}
