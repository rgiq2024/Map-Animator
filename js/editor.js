// The editor: scenes, the five steps, map interaction, timeline and export.
import { MODE_GROUPS, MODES, LINE_STYLES, modeOf } from './modes.js';
import { THEMES, MAIN_THEMES, MORE_THEMES, buildStyle, themeAttribution, themeSwatchSVG } from './themes.js';
import { SIGN_TYPES, drawSignPreview, preloadSignImages } from './signs.js';
import { buildScene, newScene, legId, zoomFor, zoomRefFor, fitCamera, routeStats, pointsKey } from './scene.js';
import { renderScene, renderCaptions, projector } from './renderer.js';
import { LAYER_KINDS, ANIMS, EFFECTS, MARKERS, CAPTION_LAYOUTS, POSITIONS, SYMBOL_PRESETS, newLayer, layersFromGeoJSON, layerBounds, layerTiming, hitLayer, drawLayers, centroid } from './layers.js';
import { TerrainFloods } from './flood.js';
import { drawDepthOfField, drawVignette } from './effects.js';
import { exportVideo } from './export.js';
import { readRouteFile, readLayerFile } from './importers.js';
import { geocode, snapRoute, searchBoundaries } from './services.js';
import { saveProject } from './store.js';
import { simplify, formatDistance, bounds } from './geo.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ASPECTS = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5, '4:3': 4 / 3, '21:9': 21 / 9 };
const STEPS = ['route', 'layers', 'look', 'signs', 'camera', 'export'];
const NEXT_LABEL = { route: 'Next: add map layers →', layers: 'Next: choose the look →', look: 'Next: add signs →', signs: 'Next: set up the camera →', camera: 'Next: preview & export →', export: 'Render video' };
const COLORS = ['#ff4a2b', '#ff9f1c', '#ffd23f', '#2fbf71', '#2d7ff9', '#8b5cf6', '#ec4899', '#111827', '#ffffff'];

export function videoSize(aspect, res) {
  const r = ASPECTS[aspect] || 16 / 9;
  let w, h;
  if (r >= 1) { h = res; w = Math.round(res * r); } else { w = res; h = Math.round(res / r); }
  return { width: w & ~1, height: h & ~1 };
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const fmtShort = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const slug = (s) => (s || 'trip').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trip';
export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// ======================================================================================
export function createEditor() {
  const stage = $('#stage');
  const overlay = $('#overlay');
  const octx = overlay.getContext('2d');

  let project = null;
  let sceneIdx = 0;
  let step = 'route';
  const visited = new Set();
  let model = null;
  let time = 0, playing = false, playStartNow = 0, playStartTime = 0;
  let viewMode = 'edit';
  let tool = 'draw';
  let activeLeg = 0, selPoint = null, hoverPoint = null, selSign = null;
  let placing = null;
  let exporting = false;
  let frame = { x: 0, y: 0, w: 800, h: 450 };
  let hits = { signBoxes: [], legBadges: [], handles: [] };
  let undoStack = [];
  let map = null;
  let styleKey = null, stylePromise = Promise.resolve();
  let userIntent = false;
  let suppressClick = false;
  let dragging = null;
  let saveTimer = null;
  let rafId = 0;
  let dpr = window.devicePixelRatio || 1;
  let selLayer = null, drawing = null, pickOrigin = null;
  let floods = null, bldFactor = null;

  const scene = () => project.scenes[sceneIdx];

  // ---------------------------------------------------------------- map
  function initMap() {
    map = new maplibregl.Map({
      container: 'map',
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#d9dde2' } }] },
      center: [20, 30], zoom: 1.6,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      fadeDuration: 0, maxPitch: 70, doubleClickZoom: false,
    });
    map.on('render', drawOverlay);
    floods = new TerrainFloods(map, (L) => { if (selLayer === L.id) renderLayerEditor(); rebuild(); save(); });
    map.on('error', (e) => console.warn('map:', e?.error?.message || e));
    map.on('movestart', (e) => {
      if (e.originalEvent && viewMode === 'play' && !exporting) setViewMode('edit');
    });
    map.on('moveend', (e) => {
      if (exporting) return;
      if (e.originalEvent || userIntent) { userIntent = false; onUserView(); }
    });
    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('click', onClick);
    map.on('dblclick', onDblClick);
    map.on('contextmenu', (e) => e.preventDefault?.());
    new ResizeObserver(() => { if (project && !exporting) layout(true); }).observe(stage);
  }

  function lookKey(look) {
    const { theme, placeNames, lang, states, terrain, terrainExaggeration, buildings3d } = look;
    return JSON.stringify({ theme, placeNames, lang, states, terrain, buildings3d: !!buildings3d, terrainExaggeration: terrain ? terrainExaggeration : 0 });
  }
  function applyLook(sc) {
    const key = lookKey(sc.look);
    $('#attribution').textContent = themeAttribution(sc.look);
    if (key === styleKey) return stylePromise;
    styleKey = key;
    stylePromise = (async () => {
      let st;
      try { st = await buildStyle(sc.look); } catch (e) { toast('Could not load the map style — check your connection'); return; }
      if (styleKey !== key) return;
      await new Promise((resolve) => {
        const done = () => { clearTimeout(to); resolve(); };
        const to = setTimeout(done, 15000);
        map.once('style.load', done);
        map.setStyle(st, { diff: false });
      });
      bldFactor = null;
      floods?.attach();
      applyTimeEffects(viewMode === 'play' ? time : null);
    })();
    return stylePromise;
  }

  const currentView = () => ({
    center: [+map.getCenter().lng.toFixed(6), +map.getCenter().lat.toFixed(6)],
    zoomRef: +zoomRefFor(map.getZoom(), frame.w).toFixed(4),
    bearing: +map.getBearing().toFixed(2),
    pitch: +map.getPitch().toFixed(1),
  });
  const camOf = (v) => ({ center: v.center, zoom: zoomFor(v.zoomRef, frame.w), bearing: v.bearing || 0, pitch: +scene().camera.tilt || 0 });

  function onUserView() {
    if (!project || viewMode !== 'edit') return;
    const cam = scene().camera;
    if (cam.mode === 'fixed') {
      cam.fixed = currentView();
      rebuild();
      save();
    }
  }

  /** Put the map where the scene's edit view should be. */
  function showEditView() {
    const sc = scene();
    const cam = sc.camera;
    let v = null;
    if (cam.mode === 'fixed') v = cam.fixed;
    else if (cam.mode === 'startEnd') v = cam.start || cam.fixed;
    else v = cam.fixed;
    v = v || model?.fit;
    if (v) map.jumpTo(camOf(v));
    else map.jumpTo({ pitch: +cam.tilt || 0 });
  }

  // ---------------------------------------------------------------- layout
  function layout(keepView) {
    const r = stage.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    const A = ASPECTS[project.aspect] || 16 / 9;
    const mx = r.width < 700 ? 12 : 30, my = r.width < 700 ? 52 : 58;
    let w = Math.max(80, r.width - 2 * mx), h = Math.max(60, r.height - 2 * my);
    if (w / h > A) w = h * A; else h = w / A;
    frame = { x: (r.width - w) / 2, y: (r.height - h) / 2, w, h };
    overlay.width = Math.round(r.width * dpr);
    overlay.height = Math.round(r.height * dpr);
    map.resize();
    const { width, height } = videoSize(project.aspect, project.resolution);
    const lab = $('#frame-label');
    lab.textContent = `${project.aspect} · ${width}×${height}`;
    lab.style.left = `${frame.x}px`;
    lab.style.top = `${frame.y - 16}px`;
    rebuild();
    if (keepView && viewMode === 'edit') showEditView();
    else if (viewMode === 'play') applyCamera(time);
  }

  // ---------------------------------------------------------------- model & redraw
  function rebuild() {
    if (!project) return;
    model = buildScene(scene(), frame.w, frame.h);
    time = Math.min(time, model.total);
    renderTimeline();
    updateStats();
    updateEstimate();
    updateSceneDurations();
    map?.triggerRepaint();
  }

  function drawOverlay() {
    if (exporting || !model || !project) return;
    const W = overlay.width, H = overlay.height;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, W, H);
    const px = W / stage.clientWidth;
    const unit = (Math.min(frame.w, frame.h) / 720) * px;
    const fr = { x: frame.x * px, y: frame.y * px, w: frame.w * px, h: frame.h * px };
    const t = viewMode === 'play' ? time : null;
    const lens = lensFor(scene(), model, t, (ll) => { const q = map.project(ll); return (q.y - frame.y) / frame.h; });
    if (lens?.dof) {
      const mc = map.getCanvas();
      const k = mc.width / stage.clientWidth;
      drawDepthOfField(octx, mc, frame.x * k, frame.y * k, frame.w * k, frame.h * k, fr, lens, unit);
    }
    hits = renderScene(octx, {
      map, model, scene: scene(), time: t, px, unit, frame: fr,
      edit: viewMode === 'edit' ? { step, activeLeg, selPoint, hoverPoint, selSign, selLayer, drawing, dpr: px } : null,
    });
    drawVignette(octx, fr, +scene().camera.lens?.vignette || 0);
    renderCaptions(octx, { map, model, scene: scene(), time: t, px, unit, frame: fr });
    // dim everything outside the video frame
    octx.save();
    octx.fillStyle = 'rgba(30,32,38,0.58)';
    octx.beginPath();
    octx.rect(0, 0, W, H);
    octx.rect(fr.x, fr.y, fr.w, fr.h);
    octx.fill('evenodd');
    octx.strokeStyle = 'rgba(255,255,255,0.55)';
    octx.lineWidth = 1 * px;
    octx.strokeRect(fr.x + 0.5, fr.y + 0.5, fr.w - 1, fr.h - 1);
    octx.restore();
  }
  const repaint = () => map?.triggerRepaint();

  // ---------------------------------------------------------------- saving & undo
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveProject(project).catch((e) => console.warn(e)), 500);
  }
  function pushUndo() {
    const sc = scene();
    undoStack.push(JSON.stringify({ legs: sc.legs, signs: sc.signs, layers: sc.layers || [] }));
    if (undoStack.length > 80) undoStack.shift();
    updateUndo();
  }
  function undo() {
    const snap = undoStack.pop();
    if (!snap) { toast('Nothing to undo'); return; }
    const { legs, signs, layers } = JSON.parse(snap);
    scene().legs = legs;
    scene().signs = signs;
    if (layers) { scene().layers = layers; if (!layers.some((l) => l.id === selLayer)) selLayer = null; renderLayerList(); renderLayerEditor(); floods?.sync(scene()); }
    selPoint = null; selSign = null;
    activeLeg = Math.min(activeLeg, legs.length - 1);
    closePops();
    commit();
    updateUndo();
  }
  function updateUndo() {
    $('#tb-undo').disabled = !undoStack.length;
    $('#undo-btn').disabled = !undoStack.length;
  }

  /** Keep legs connected and tidy after any edit. */
  function fixLegs() {
    const legs = scene().legs;
    for (let k = legs.length - 1; k >= 1; k--) {
      const leg = legs[k];
      if (!leg.track && leg.points.length <= 1 && k !== legs.length - 1) legs.splice(k, 1);
    }
    for (let k = 1; k < legs.length; k++) {
      const prev = legs[k - 1], leg = legs[k];
      if (!prev.points.length) continue;
      const end = prev.track ? { lng: prev.track.at(-1)[0], lat: prev.track.at(-1)[1] } : prev.points.at(-1);
      if (!leg.track) {
        if (!leg.points.length) leg.points.push({ lng: end.lng, lat: end.lat });
        else { leg.points[0].lng = end.lng; leg.points[0].lat = end.lat; }
      }
    }
    if (!legs.length) legs.push({ id: legId(), mode: 'line', points: [] });
    activeLeg = clamp(activeLeg, 0, legs.length - 1);
  }

  function commit({ list = true } = {}) {
    fixLegs();
    scheduleSnaps();
    rebuild();
    if (list) { renderLegs(); renderSignList(); }
    if (!$('#leg-pop').hidden) renderLegPop();
    save();
  }

  // ---------------------------------------------------------------- road snapping
  let snapTimer = null;
  function scheduleSnaps() {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      const sc = scene();
      sc.legs.forEach((leg) => {
        const profile = modeOf(leg).route;
        if (!leg.snap || !profile || leg.track || leg.points.length < 2) return;
        const key = pointsKey(leg);
        if (leg.snapKey === key || leg._pending === key) return;
        leg._pending = key;
        leg._error = null;
        renderLegPopIfOpen();
        snapRoute(profile, leg.points)
          .then((coords) => { leg.snapped = coords; leg.snapKey = key; })
          .catch((e) => { leg._error = e.message; toast(e.message); })
          .finally(() => { if (leg._pending === key) leg._pending = null; rebuild(); renderLegPopIfOpen(); save(); });
      });
    }, 450);
  }

  // ---------------------------------------------------------------- hit testing
  const toCanvas = (pt) => [pt.x * (overlay.width / stage.clientWidth), pt.y * (overlay.width / stage.clientWidth)];
  function hitHandle(p) {
    const r = 11 * (overlay.width / stage.clientWidth);
    let best = null, bd = r * r;
    for (const h of hits.handles) {
      const d = (h.x - p[0]) ** 2 + (h.y - p[1]) ** 2;
      if (d <= bd) { bd = d; best = h; }
    }
    return best;
  }
  function hitBadge(p) {
    return hits.legBadges.find((b) => (b.x - p[0]) ** 2 + (b.y - p[1]) ** 2 <= (b.r + 3) ** 2) || null;
  }
  function hitSign(p) {
    for (let k = hits.signBoxes.length - 1; k >= 0; k--) {
      const { i, bbox } = hits.signBoxes[k];
      if (p[0] >= bbox[0] && p[0] <= bbox[2] && p[1] >= bbox[1] && p[1] <= bbox[3]) return i;
    }
    return null;
  }
  function hitLine(p) {
    const px = overlay.width / stage.clientWidth;
    const tol = 7 * px;
    let best = null, bd = tol * tol;
    for (const L of model.drawable) {
      if (L.leg.track) continue;
      let prev = null;
      for (let k = 0; k < L.coords.length; k++) {
        const q = map.project(L.coords[k]);
        const c = [q.x * px, q.y * px];
        if (prev) {
          const dx = c[0] - prev[0], dy = c[1] - prev[1];
          const len2 = dx * dx + dy * dy || 1;
          const t = clamp(((p[0] - prev[0]) * dx + (p[1] - prev[1]) * dy) / len2, 0, 1);
          const ex = prev[0] + t * dx - p[0], ey = prev[1] + t * dy - p[1];
          const d = ex * ex + ey * ey;
          if (d < bd) { bd = d; best = { li: L.li, seg: L.seg[k] }; }
        }
        prev = c;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- mouse
  function onMouseDown(e) {
    if (exporting || e.originalEvent.button !== 0) return;
    if (viewMode === 'play') { setViewMode('edit'); showEditView(); return; }
    const p = toCanvas(e.point);
    if (step === 'layers' && !drawing && !pickOrigin) {
      const r = 9 * (overlay.width / stage.clientWidth);
      const h = hits.layerHandles.find((q) => (q.x - p[0]) ** 2 + (q.y - p[1]) ** 2 <= r * r);
      if (h) { e.preventDefault(); startDrag({ kind: 'vertex', id: h.id, ring: h.ring, i: h.i }, e); return; }
      const id = hitLayer(octx, scene().layers || [], hits.proj, p, unitNow());
      const L = id && layerById(id);
      if (L && L.geom?.type === 'Point') { e.preventDefault(); startDrag({ kind: 'lpoint', id }, e); return; }
    }
    if (step === 'route') {
      const h = hitHandle(p);
      if (h) { e.preventDefault(); startDrag({ kind: 'point', li: h.li, i: h.i }, e); return; }
      if (tool === 'area') { e.preventDefault(); startArea(e); return; }
    }
    if (step === 'signs' && !placing) {
      const s = hitSign(p);
      if (s != null) { e.preventDefault(); startDrag({ kind: 'sign', i: s }, e); }
    }
  }

  function startDrag(target, e) {
    map.dragPan.disable();
    const rect = stage.getBoundingClientRect();
    const snapshot = JSON.stringify({ legs: scene().legs, signs: scene().signs, layers: scene().layers || [] });
    dragging = { ...target, moved: false, x0: e.originalEvent.clientX, y0: e.originalEvent.clientY };
    stage.classList.add('dragging');
    const move = (ev) => {
      if (!dragging.moved && Math.hypot(ev.clientX - dragging.x0, ev.clientY - dragging.y0) < 3) return;
      dragging.moved = true;
      const ll = map.unproject([ev.clientX - rect.left, ev.clientY - rect.top]);
      if (dragging.kind === 'vertex' || dragging.kind === 'lpoint') {
        moveLayerVertex(dragging, [+ll.lng.toFixed(6), +ll.lat.toFixed(6)]);
      } else if (dragging.kind === 'point') {
        const leg = scene().legs[dragging.li];
        const pt = leg.points[dragging.i];
        pt.lng = ll.lng; pt.lat = ll.lat;
        const next = scene().legs[dragging.li + 1];
        if (next && dragging.i === leg.points.length - 1 && next.points[0]) { next.points[0].lng = ll.lng; next.points[0].lat = ll.lat; }
        if (leg.track) { leg.track = null; }
      } else {
        const sg = scene().signs[dragging.i];
        sg.lng = ll.lng; sg.lat = ll.lat;
      }
      model = buildScene(scene(), frame.w, frame.h);
      closePointPop();
      repaint();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      map.dragPan.enable();
      stage.classList.remove('dragging');
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      const d = dragging;
      dragging = null;
      if ((d.kind === 'vertex' || d.kind === 'lpoint')) {
        if (d.moved) { undoStack.push(snapshot); updateUndo(); commitLayers(); } else selectLayer(d.id);
        return;
      }
      if (d.moved) {
        undoStack.push(snapshot);
        updateUndo();
        if (d.kind === 'point') {
          const pt = scene().legs[d.li].points[d.i];
          pt.lng = +pt.lng.toFixed(6); pt.lat = +pt.lat.toFixed(6);
        }
        commit();
      } else if (d.kind === 'point') {
        selPoint = { li: d.li, i: d.i };
        activeLeg = d.li;
        openPointPop();
        renderLegs();
        repaint();
      } else {
        selectSign(d.i);
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  function startArea(e) {
    map.dragPan.disable();
    const rect = stage.getBoundingClientRect();
    const box = $('#area-box');
    const x0 = e.originalEvent.clientX - rect.left, y0 = e.originalEvent.clientY - rect.top;
    let x1 = x0, y1 = y0;
    box.hidden = false;
    const draw = () => Object.assign(box.style, { left: `${Math.min(x0, x1)}px`, top: `${Math.min(y0, y1)}px`, width: `${Math.abs(x1 - x0)}px`, height: `${Math.abs(y1 - y0)}px` });
    draw();
    const move = (ev) => { x1 = ev.clientX - rect.left; y1 = ev.clientY - rect.top; draw(); };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      map.dragPan.enable();
      box.hidden = true;
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      if (Math.abs(x1 - x0) < 8 || Math.abs(y1 - y0) < 8) return;
      const a = map.unproject([Math.min(x0, x1), Math.max(y0, y1)]);
      const b = map.unproject([Math.max(x0, x1), Math.min(y0, y1)]);
      flyToBounds([[a.lng, a.lat], [b.lng, b.lat]], 0.02);
      setTool('draw');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  function flyToBounds(b, pad = 0.14) {
    const c = fitCamera(b, frame.w, frame.h, pad);
    userIntent = true;
    map.easeTo({ center: c.center, zoom: c.zoom, bearing: 0, pitch: +scene().camera.tilt || 0, duration: 700 });
  }

  function onMouseMove(e) {
    if (dragging || viewMode !== 'edit' || exporting) return;
    if (drawing) { drawing.hover = [e.lngLat.lng, e.lngLat.lat]; repaint(); return; }
    const p = toCanvas(e.point);
    if (step === 'layers') {
      const r = 9 * (overlay.width / stage.clientWidth);
      const onH = hits.layerHandles.some((q) => (q.x - p[0]) ** 2 + (q.y - p[1]) ** 2 <= r * r);
      stage.classList.toggle('on-handle', onH || !!hitLayer(octx, scene().layers || [], hits.proj, p, unitNow()));
      return;
    }
    let onHandle = false, onLine = false;
    if (step === 'route') {
      const h = hitHandle(p) || null;
      onHandle = !!h || !!hitBadge(p);
      const changed = (h?.li !== hoverPoint?.li) || (h?.i !== hoverPoint?.i);
      hoverPoint = h ? { li: h.li, i: h.i } : null;
      if (changed) repaint();
      if (!onHandle && tool === 'draw' && model.drawable.length) onLine = !!hitLine(p);
    } else if (step === 'signs' && !placing) {
      onHandle = hitSign(p) != null;
    }
    stage.classList.toggle('on-handle', onHandle);
    stage.classList.toggle('on-line', onLine);
  }

  function onClick(e) {
    if (suppressClick || exporting || viewMode !== 'edit') return;
    const p = toCanvas(e.point);
    if (placing) { addSign(e.lngLat); return; }
    if (step === 'layers') { onLayerClick(e, p); return; }
    if (step === 'route') {
      const b = hitBadge(p);
      if (b) { activeLeg = b.li; openLegPop(); renderLegs(); repaint(); return; }
      if (tool !== 'draw') { closePops(); return; }
      if (!$('#point-pop').hidden || !$('#leg-pop').hidden) { closePops(); return; }
      const ins = hitLine(p);
      if (ins) { insertPoint(ins, e.lngLat); return; }
      addPoint(e.lngLat);
    } else if (step === 'signs') {
      selectSign(null);
    }
  }

  function onDblClick(e) {
    e.preventDefault();
    if (step === 'layers' && drawing && !drawing.single) {
      const c = drawing.coords;
      if (c.length > 1 && Math.abs(c.at(-1)[0] - c.at(-2)[0]) < 1e-5 && Math.abs(c.at(-1)[1] - c.at(-2)[1]) < 1e-5) c.pop();
      finishDrawing();
      return;
    }
    if (step !== 'route' || viewMode !== 'edit') return;
    const h = hitHandle(toCanvas(e.point));
    if (!h) return;
    pushUndo();
    const pt = scene().legs[h.li].points[h.i];
    pt.sharp = !pt.sharp;
    selPoint = { li: h.li, i: h.i };
    commit();
    openPointPop();
  }

  // ---------------------------------------------------------------- route editing
  function addPoint(ll) {
    pushUndo();
    const sc = scene();
    let leg = sc.legs.at(-1);
    if (leg.track) {
      const end = leg.track.at(-1);
      leg = { id: legId(), mode: 'line', points: [{ lng: end[0], lat: end[1] }] };
      sc.legs.push(leg);
    }
    leg.points.push({ lng: +ll.lng.toFixed(6), lat: +ll.lat.toFixed(6) });
    activeLeg = sc.legs.length - 1;
    selPoint = null;
    if (sc.camera.mode === 'fixed' && !sc.camera.fixed) sc.camera.fixed = currentView();
    closePops();
    commit();
  }
  function insertPoint(ins, ll) {
    pushUndo();
    const leg = scene().legs[ins.li];
    leg.points.splice(ins.seg + 1, 0, { lng: +ll.lng.toFixed(6), lat: +ll.lat.toFixed(6) });
    selPoint = { li: ins.li, i: ins.seg + 1 };
    activeLeg = ins.li;
    commit();
  }
  function deletePoint(li, i) {
    pushUndo();
    const legs = scene().legs;
    const leg = legs[li];
    leg.points.splice(i, 1);
    if (leg.points.length <= 1 && legs.length > 1) {
      if (li === legs.length - 1 && leg.points.length === 1) { /* keep the start of a fresh last leg */ }
      else legs.splice(li, 1);
    }
    selPoint = null;
    closePointPop();
    commit();
  }
  function splitLeg(li, i) {
    pushUndo();
    const legs = scene().legs;
    const leg = legs[li];
    const tail = leg.points.slice(i).map((p) => ({ ...p }));
    leg.points = leg.points.slice(0, i + 1);
    legs.splice(li + 1, 0, { id: legId(), mode: leg.mode, points: tail, color: leg.color, lineStyle: leg.lineStyle });
    activeLeg = li + 1;
    selPoint = null;
    closePointPop();
    commit();
    openLegPop();
  }
  function newLeg() {
    const legs = scene().legs;
    const last = legs.at(-1);
    const n = last.track ? last.track.length : last.points.length;
    if (n < 2) { toast('Draw this leg first — click the map to add points'); return; }
    pushUndo();
    const end = last.track ? { lng: last.track.at(-1)[0], lat: last.track.at(-1)[1] } : last.points.at(-1);
    legs.push({ id: legId(), mode: 'line', points: [{ lng: end.lng, lat: end.lat }] });
    activeLeg = legs.length - 1;
    commit();
    openLegPop();
    toast('New leg: pick how you travel, then click the map to draw it');
  }

  // ---------------------------------------------------------------- popovers
  function closePointPop() { $('#point-pop').hidden = true; }
  function closeLegPop() { $('#leg-pop').hidden = true; }
  function closePops() { closePointPop(); closeLegPop(); $('#search-pop').hidden = true; $('#speed-pop').hidden = true; }

  function openPointPop() {
    if (!selPoint) return;
    const legs = scene().legs;
    const leg = legs[selPoint.li];
    const pt = leg?.points[selPoint.i];
    if (!pt) return;
    const pop = $('#point-pop');
    const pos = map.project([pt.lng, pt.lat]);
    const isEnd = selPoint.i === leg.points.length - 1;
    const interior = selPoint.i > 0 && !isEnd;
    let num = 0;
    for (let k = 0; k < selPoint.li; k++) num += legs[k].points.length - (k > 0 ? 1 : 0);
    num += selPoint.i + (selPoint.li > 0 ? 0 : 1);
    pop.innerHTML = `
      <div class="pph"><span>Point ${num}</span><button class="icon-x" data-x>✕</button></div>
      <label class="row"><span>Pause here</span>
        <select data-pause>${[0, 0.5, 1, 1.5, 2, 3, 5].map((v) => `<option value="${v}" ${(+pt.pause || 0) === v ? 'selected' : ''}>${v ? `${v} s` : 'No'}</option>`).join('')}</select></label>
      <label class="row"><span>Sharp corner</span><input type="checkbox" class="switch" data-sharp ${pt.sharp ? 'checked' : ''}/></label>
      ${interior ? '<button class="btn sm" data-split>Start a new leg here</button>' : ''}
      <button class="btn sm danger" data-del>Delete point</button>`;
    const sr = stage.getBoundingClientRect();
    let x = pos.x + 16, y = pos.y - 20;
    if (x + 230 > sr.width) x = pos.x - 236;
    y = clamp(y, 60, sr.height - 200);
    Object.assign(pop.style, { left: `${x}px`, top: `${y}px` });
    pop.hidden = false;
    closeLegPop();
  }
  $('#point-pop').addEventListener('click', (e) => {
    if (!selPoint) return;
    if (e.target.closest('[data-x]')) { selPoint = null; closePointPop(); repaint(); }
    if (e.target.closest('[data-del]')) deletePoint(selPoint.li, selPoint.i);
    if (e.target.closest('[data-split]')) splitLeg(selPoint.li, selPoint.i);
  });
  $('#point-pop').addEventListener('change', (e) => {
    if (!selPoint) return;
    const pt = scene().legs[selPoint.li].points[selPoint.i];
    pushUndo();
    if (e.target.matches('[data-pause]')) { const v = +e.target.value; if (v) pt.pause = v; else delete pt.pause; }
    if (e.target.matches('[data-sharp]')) { if (e.target.checked) pt.sharp = true; else delete pt.sharp; }
    commit();
  });

  function renderLegPopIfOpen() { if (!$('#leg-pop').hidden) renderLegPop(); }
  function openLegPop() { closePointPop(); $('#leg-pop').hidden = false; renderLegPop(); }
  function renderLegPop() {
    const leg = scene().legs[activeLeg];
    if (!leg) { closeLegPop(); return; }
    const mode = modeOf(leg);
    const pop = $('#leg-pop');
    const groups = MODE_GROUPS.map((g) => `<h5>${g.name}</h5><div class="mode-grid">${g.modes.map((k) => {
      const m = MODES[k];
      return `<button data-mode="${k}" class="${leg.mode === k ? 'active' : ''}"><span class="e ${m.icon ? '' : 'arrow'}">${m.icon || '➤'}</span>${m.label}</button>`;
    }).join('')}</div>`).join('');
    const canSnap = !!mode.route && !leg.track;
    const snapStatus = leg._pending ? 'Finding roads…' : leg._error ? leg._error : leg.snap && leg.snapKey ? 'On roads ✓' : '';
    pop.innerHTML = `
      <div class="lph"><b>Leg ${activeLeg + 1}</b><button class="icon-x" data-x>✕</button></div>
      ${groups}
      <div class="opts">
        <h5>Line</h5>
        <div class="swatches">
          <button class="swatch ${!leg.color ? 'active' : ''}" data-color="" title="Scene line colour" style="background:${scene().look.lineColor};outline:2px dashed rgba(255,255,255,.35);outline-offset:1px"></button>
          ${COLORS.map((c) => `<button class="swatch ${leg.color === c ? 'active' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
          <label class="swatch-custom" title="Custom colour"><input type="color" data-custom value="${leg.color || scene().look.lineColor}"/></label>
        </div>
        <label class="row"><span>Line style</span><select data-style>
          <option value="">Auto (${LINE_STYLES[mode.style || 'solid']})</option>
          ${Object.entries(LINE_STYLES).map(([k, v]) => `<option value="${k}" ${leg.lineStyle === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select></label>
        ${leg.track ? '<p class="note small">This leg follows an imported track.</p>' : ''}
        ${!leg.track && !mode.air ? `<label class="row"><span>Smooth curves</span><input type="checkbox" class="switch" data-smooth ${leg.smooth !== false ? 'checked' : ''}/></label>` : ''}
        ${canSnap ? `<label class="row"><span>Follow roads <small class="muted">${esc(snapStatus)}</small></span><input type="checkbox" class="switch" data-snap ${leg.snap ? 'checked' : ''}/></label>` : ''}
        ${scene().legs.length > 1 ? '<button class="btn sm danger" data-del-leg>Delete this leg</button>' : ''}
      </div>`;
    pop.hidden = false;
  }
  $('#leg-pop').addEventListener('click', (e) => {
    const leg = scene().legs[activeLeg];
    if (!leg) return;
    if (e.target.closest('[data-x]')) { closeLegPop(); return; }
    const mb = e.target.closest('[data-mode]');
    if (mb) { pushUndo(); leg.mode = mb.dataset.mode; commit(); return; }
    const cb = e.target.closest('[data-color]');
    if (cb) { pushUndo(); leg.color = cb.dataset.color || null; commit(); return; }
    if (e.target.closest('[data-del-leg]')) {
      pushUndo();
      scene().legs.splice(activeLeg, 1);
      activeLeg = Math.max(0, activeLeg - 1);
      closeLegPop();
      commit();
    }
  });
  $('#leg-pop').addEventListener('change', (e) => {
    const leg = scene().legs[activeLeg];
    if (!leg) return;
    pushUndo();
    if (e.target.matches('[data-style]')) leg.lineStyle = e.target.value || null;
    if (e.target.matches('[data-smooth]')) leg.smooth = e.target.checked;
    if (e.target.matches('[data-snap]')) leg.snap = e.target.checked;
    if (e.target.matches('[data-custom]')) leg.color = e.target.value;
    commit();
  });

  // ---------------------------------------------------------------- legs panel
  function renderLegs() {
    const legs = scene().legs;
    $('#legs-list').innerHTML = legs.map((leg, i) => {
      const m = modeOf(leg);
      return `<li data-li="${i}" class="${i === activeLeg ? 'active' : ''}" title="Change how this leg travels">
        <span class="n">${i + 1}</span><span class="ico ${m.icon ? '' : 'arrow'}">${m.icon || '➤'}</span><span>${esc(leg.track ? `${m.label} · track` : m.label)}</span>
        <i class="sw" style="background:${leg.color || scene().look.lineColor}"></i></li>`;
    }).join('');
  }
  $('#legs-list').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-li]');
    if (!li) return;
    activeLeg = +li.dataset.li;
    renderLegs();
    openLegPop();
    repaint();
  });
  $('#new-leg').onclick = newLeg;
  $('#lp-toggle').onclick = () => $('#legs-panel').classList.toggle('collapsed');

  // ---------------------------------------------------------------- route panel
  function updateStats() {
    const { points, distance } = routeStats(scene());
    $('#stat-points').textContent = points;
    $('#stat-dist').textContent = formatDistance(distance).replace(' ', ' ');
  }
  $('#route-draw').onclick = () => { setTool('draw'); $('#route-draw').classList.add('active'); $('#route-file').classList.remove('active'); };
  $('#route-file').onclick = () => $('#file-route').click();
  $('#file-route').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) await importRoute(f);
  });
  async function importRoute(file) {
    let res;
    try { res = await readRouteFile(file); } catch (err) { toast(err.message); return; }
    const sc = scene();
    const hasRoute = sc.legs.some((l) => l.points.length > 1 || l.track);
    if (hasRoute && !confirm('Replace the current route with this file?')) return;
    pushUndo();
    const legs = [];
    res.tracks.forEach((trk) => {
      const coords = trk.length > 1500 ? simplify(trk, 0.00008) : simplify(trk, 0.00002);
      legs.push({ id: legId(), mode: 'line', track: coords, points: [{ lng: coords[0][0], lat: coords[0][1] }, { lng: coords.at(-1)[0], lat: coords.at(-1)[1] }] });
    });
    if (!legs.length && res.waypoints.length > 1) {
      legs.push({ id: legId(), mode: 'line', points: res.waypoints.map((w) => ({ lng: w.lng, lat: w.lat })) });
    } else if (res.waypoints.length) {
      res.waypoints.slice(0, 30).forEach((w) => sc.signs.push({ id: `sg_${Math.random().toString(36).slice(2, 8)}`, type: 'pill', text: w.name || 'Waypoint', lng: w.lng, lat: w.lat, appear: 'auto' }));
    }
    // connect consecutive tracks with "jump"-like plain legs
    const out = [];
    legs.forEach((l, k) => {
      if (k > 0) {
        const prevEnd = out.at(-1).track ? out.at(-1).track.at(-1) : [out.at(-1).points.at(-1).lng, out.at(-1).points.at(-1).lat];
        const start = l.track ? l.track[0] : [l.points[0].lng, l.points[0].lat];
        if (Math.abs(prevEnd[0] - start[0]) + Math.abs(prevEnd[1] - start[1]) > 1e-4) {
          out.push({ id: legId(), mode: 'line', lineStyle: 'dotted', points: [{ lng: prevEnd[0], lat: prevEnd[1] }, { lng: start[0], lat: start[1] }] });
        }
      }
      out.push(l);
    });
    sc.legs = out;
    activeLeg = out.length - 1;
    if (project.name === 'Untitled trip' && res.name) { project.name = res.name; $('#project-name').value = res.name; }
    commit();
    const b = bounds(out.flatMap((l) => (l.track ? l.track : l.points.map((p) => [p.lng, p.lat]))));
    flyToBounds(b);
    toast(`Loaded ${res.tracks.length || 1} track${res.tracks.length === 1 ? '' : 's'} — click a leg to choose how you travelled`, 3800);
  }
  $('#make-smooth').onclick = () => {
    pushUndo();
    scene().legs.forEach((l) => { l.smooth = true; l.points.forEach((p) => delete p.sharp); if (l.track) l.track = simplify(l.track, 0.0003); });
    commit();
  };
  $('#reverse-route').onclick = () => {
    const sc = scene();
    pushUndo();
    sc.legs.reverse();
    sc.legs.forEach((l) => { l.points.reverse(); if (l.track) l.track = [...l.track].reverse(); l.snapKey = null; l.snapped = null; });
    commit();
  };
  $('#undo-btn').onclick = undo;
  $('#tb-undo').onclick = undo;
  $('#clear-route').onclick = () => {
    if (!confirm('Clear the whole route of this scene?')) return;
    pushUndo();
    scene().legs = [{ id: legId(), mode: 'line', points: [] }];
    activeLeg = 0; selPoint = null;
    closePops();
    commit();
  };

  // ---------------------------------------------------------------- toolbar & stage buttons
  function setTool(t) {
    tool = t;
    $$('#toolbar [data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    stage.classList.toggle('tool-draw', t === 'draw' && step === 'route');
    stage.classList.toggle('tool-area', t === 'area');
  }
  $$('#toolbar [data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('#tb-fit').onclick = () => fitRoute();
  function fitRoute() {
    if (!model.fit) { toast('Draw a route first'); return; }
    setViewMode('edit');
    userIntent = true;
    map.easeTo({ ...camOf(model.fit), duration: 700 });
  }
  $('#zoom-in').onclick = () => { userIntent = true; map.zoomIn(); };
  $('#zoom-out').onclick = () => { userIntent = true; map.zoomOut(); };
  $('#north').onclick = () => { userIntent = true; map.easeTo({ bearing: 0 }); };

  // search
  let searchTimer, searchSeq = 0;
  $('#search-btn').onclick = () => {
    const pop = $('#search-pop');
    pop.hidden = !pop.hidden;
    if (!pop.hidden) $('#search-input').focus();
  };
  $('#search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    if (q.length < 3) { $('#search-results').innerHTML = ''; return; }
    searchTimer = setTimeout(() => runSearch(q), 550);
  });
  $('#search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(e.target.value.trim()); }
    if (e.key === 'Escape') $('#search-pop').hidden = true;
  });
  let results = [];
  async function runSearch(q) {
    if (!q) return;
    const seq = ++searchSeq;
    const ul = $('#search-results');
    ul.innerHTML = '<li class="msg">Searching…</li>';
    try {
      results = await geocode(q);
      if (seq !== searchSeq) return;
      ul.innerHTML = results.length ? results.map((r, i) => `<li data-i="${i}"><b>${esc(r.name)}</b><small>${esc(r.detail)}</small></li>`).join('') : '<li class="msg">No places found</li>';
    } catch { ul.innerHTML = '<li class="msg">Search is unavailable right now</li>'; }
  }
  $('#search-results').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    const r = results[+li.dataset.i];
    $('#search-pop').hidden = true;
    setViewMode('edit');
    if (r.bbox) flyToBounds(r.bbox, 0.2);
    else { userIntent = true; map.easeTo({ center: [r.lng, r.lat], zoom: 11, duration: 700 }); }
  });

  // ---------------------------------------------------------------- layers
  const layersOf = () => scene().layers || (scene().layers = []);
  const layerById = (id) => layersOf().find((l) => l.id === id);
  const unitNow = () => (Math.min(frame.w, frame.h) / 720) * (overlay.width / stage.clientWidth);
  const newStart = () => +((viewMode === 'play' && time > 0.05 ? time : model.drawStart) || 0).toFixed(2);
  const HINTS = {
    polygon: 'Click to outline the area · click the first point or double-click to finish · Enter to finish · Esc to cancel',
    line: 'Click to draw the line · double-click or Enter to finish · Esc to cancel',
    point: 'Click the map where it goes · Esc to cancel',
  };
  function showHint(text) { const h = $('#stage-hint'); h.textContent = text; h.hidden = false; }

  function startAdd(kind, preset = null) {
    cancelDrawing();
    if (kind === 'symbol') { openSymbols(); return; }
    if (kind === 'caption') { addLayer(newLayer('caption', null, { start: newStart() })); return; }
    setViewMode('edit');
    const g = LAYER_KINDS[kind].geom;
    drawing = { kind, coords: [], polygon: g === 'polygon', single: g === 'point', preset };
    stage.classList.add('placing');
    showHint(HINTS[g]);
    $$('#add-layer [data-add]').forEach((b) => b.classList.toggle('active', b.dataset.add === (preset ? 'symbol' : kind)));
  }
  function cancelDrawing() {
    if (!drawing && !pickOrigin) return;
    drawing = null; pickOrigin = null;
    stage.classList.remove('placing');
    $('#stage-hint').hidden = true;
    $$('#add-layer [data-add]').forEach((b) => b.classList.remove('active'));
    repaint();
  }
  function finishDrawing() {
    const d = drawing;
    if (!d) return;
    let geom;
    if (d.polygon) {
      if (d.coords.length < 3) { toast('Add at least 3 points'); return; }
      geom = { type: 'Polygon', coordinates: [[...d.coords, d.coords[0]]] };
    } else if (!d.single) {
      if (d.coords.length < 2) { toast('Add at least 2 points'); return; }
      geom = { type: 'LineString', coordinates: d.coords };
    } else geom = { type: 'Point', coordinates: d.coords[0] };
    const L = newLayer(d.kind, geom, { start: newStart(), preset: d.preset });
    cancelDrawing();
    addLayer(L);
  }
  function addLayer(L) {
    pushUndo();
    layersOf().push(L);
    selLayer = L.id;
    commitLayers();
    renderLayerEditor();
    if (L.kind === 'label' || L.kind === 'caption') setTimeout(() => { const i = $('#layer-editor [data-b="style.text"]'); i?.focus(); i?.select(); }, 30);
  }
  function commitLayers() {
    rebuild();
    renderLayerList();
    renderCamSelects();
    floods?.sync(scene()).then(() => { applyTimeEffects(viewMode === 'play' ? time : null); repaint(); renderFloodInfo(); });
    save();
  }
  function onLayerClick(e, p) {
    const ll = [+e.lngLat.lng.toFixed(6), +e.lngLat.lat.toFixed(6)];
    if (pickOrigin) {
      const L = layerById(pickOrigin);
      if (L) { pushUndo(); L.origin = ll; }
      cancelDrawing();
      commitLayers();
      toast('The water will start there');
      return;
    }
    if (drawing) {
      if (drawing.single) { drawing.coords = [ll]; finishDrawing(); return; }
      if (drawing.polygon && drawing.coords.length >= 3) {
        const f = map.project(drawing.coords[0]);
        if (Math.hypot(f.x - e.point.x, f.y - e.point.y) < 11) { finishDrawing(); return; }
      }
      drawing.coords.push(ll);
      repaint();
      return;
    }
    selectLayer(hitLayer(octx, layersOf(), hits.proj, p, unitNow()));
  }
  function moveLayerVertex(d, ll) {
    const L = layerById(d.id);
    if (!L?.geom) return;
    const g = L.geom;
    if (g.type === 'Point') { g.coordinates = ll; return; }
    const rings = g.type === 'Polygon' ? g.coordinates : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : g.coordinates.flat();
    const ring = rings[d.ring];
    if (!ring) return;
    ring[d.i] = ll;
    if ((g.type === 'Polygon' || g.type === 'MultiPolygon') && d.i === 0) ring[ring.length - 1] = ll;
  }
  function selectLayer(id) {
    selLayer = id || null;
    renderLayerEditor();
    renderLayerList();
    renderTimeline();
    repaint();
  }
  function deleteLayer(id) {
    pushUndo();
    scene().layers = layersOf().filter((l) => l.id !== id);
    if (selLayer === id) selLayer = null;
    for (const k of ['intro', 'outro']) if (scene().camera[k] === `feature:${id}`) scene().camera[k] = 'none';
    renderLayerEditor();
    commitLayers();
  }
  function zoomToLayer(L) {
    const b = layerBounds(L);
    if (!b) return;
    setViewMode('edit');
    if (L.geom.type === 'Point') { userIntent = true; map.easeTo({ center: L.geom.coordinates, zoom: Math.max(map.getZoom(), 12), duration: 700 }); }
    else flyToBounds(b, 0.16);
  }

  // list
  function renderLayerList() {
    const ls = layersOf();
    $('#layer-count').textContent = ls.length;
    $('#layer-list').innerHTML = ls.length ? ls.map((L) => `
      <li data-id="${L.id}" class="${L.id === selLayer ? 'active' : ''} ${L.hidden ? 'off' : ''}">
        <span class="ki">${L.kind === 'point' && L.style.marker === 'emoji' ? L.style.emoji : LAYER_KINDS[L.kind].icon}</span>
        <span class="nm">${esc(L.kind === 'caption' || L.kind === 'label' ? (L.style.text || L.name) : L.name)}</span>
        <small>${(+L.start).toFixed(1)}s</small>
        <button class="mini" data-eye title="${L.hidden ? 'Show' : 'Hide'}">${L.hidden ? '◌' : '◉'}</button>
      </li>`).join('') : '<li class="empty">No layers yet. Draw one, find a boundary, or import a file.</li>';
  }
  $('#layer-list').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const L = layerById(li.dataset.id);
    if (e.target.closest('[data-eye]')) { pushUndo(); L.hidden = !L.hidden; commitLayers(); return; }
    selectLayer(L.id);
  });
  $('#add-layer').addEventListener('click', (e) => { const b = e.target.closest('[data-add]'); if (b) startAdd(b.dataset.add); });

  // editor form
  const fRow = (label, inner, cls = '') => `<label class="row ${cls}"><span>${label}</span>${inner}</label>`;
  const fColor = (b, v) => `<input type="color" data-b="${b}" value="${esc(v || '#ffffff')}">`;
  const fRange = (b, v, min, max, step) => `<input type="range" data-b="${b}" min="${min}" max="${max}" step="${step}" value="${v}">`;
  const fSel = (b, v, opts) => `<select data-b="${b}">${Object.entries(opts).map(([k, t]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const fSw = (b, v) => `<input type="checkbox" class="switch" data-b="${b}" ${v ? 'checked' : ''}>`;
  const fText = (b, v, ph = '') => `<input type="text" data-b="${b}" value="${esc(v || '')}" placeholder="${esc(ph)}">`;
  const fNum = (b, v, step = 0.1) => `<input type="number" data-b="${b}" step="${step}" value="${v ?? ''}">`;
  const DASH = { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted' };

  function renderLayerEditor() {
    const box = $('#layer-editor');
    const L = selLayer && layerById(selLayer);
    if (!L) { box.hidden = true; box.innerHTML = ''; return; }
    const s = L.style;
    let h = `<div class="le-head">${fText('name', L.name)}<button class="icon-x" data-act="close" title="Done">✕</button></div>`;
    h += fRow('Animation', fSel('anim', L.anim, ANIMS[L.kind]));
    h += `<div class="time3"><label>Starts at (s)${fNum('start', L.start)}</label><label>Animates for (s)${fNum('duration', L.duration)}</label><label>Then stays (s)${fNum('hold', L.hold || 0)}</label></div>`;
    h += `<p class="hint-line">“Then stays” 0 = until the end of the scene. <button class="link strong" data-act="atPlayhead">Start at the playhead</button></p>`;
    if (L.kind === 'boundary' || L.kind === 'area') {
      h += '<h5>Outline</h5>' + fRow('Colour', fColor('style.stroke', s.stroke)) + fRow('Width', fRange('style.width', s.width, 0, 14, 0.5)) + fRow('Style', fSel('style.dash', s.dash, DASH)) + fRow('Glow', fSw('style.glow', s.glow));
      h += '<h5>Fill</h5>' + fRow('Colour', fColor('style.fill', s.fill)) + fRow('Opacity', fRange('style.fillOpacity', s.fillOpacity, 0, 1, 0.05));
      h += fRow('Darken outside', fRange('style.maskOutside', s.maskOutside || 0, 0, 0.85, 0.05));
    } else if (L.kind === 'flood') {
      h += '<h5>Water</h5>' + fRow('Colour', fColor('style.color', s.color)) + fRow('Opacity', fRange('style.opacity', s.opacity, 0.1, 1, 0.05));
      if (L.anim !== 'terrain') h += fRow('Waves', fSw('style.waves', s.waves !== false)) + fRow('Edge line', fSw('style.outline', s.outline !== false));
      if (L.anim === 'spread') h += `<p class="hint-line">The water spreads from ${L.origin ? 'the point you chose' : 'the middle of the area'}.</p><button class="btn sm" data-act="origin">Choose where the water starts</button>`;
      if (L.anim === 'wipe') h += fRow('Comes from', fSel('style.dir', s.dir || 'W', { W: 'The west', E: 'The east', N: 'The north', S: 'The south' }));
      if (L.anim === 'terrain') {
        h += '<h5>Water level (metres above sea level)</h5>' + fRow('Starts at', fNum('style.levelFrom', s.levelFrom, 0.5)) + fRow('Rises to', fNum('style.levelTo', s.levelTo, 0.5));
        h += '<p class="hint-line" id="flood-info">Loading elevation for this area…</p><button class="btn sm" data-act="autoLevel">Pick levels automatically</button>';
        h += '<p class="hint-line">Low ground floods first, using real elevation data. Turn on 3D mountains and tilt the camera for a 3D look.</p>';
      }
    } else if (L.kind === 'line') {
      h += '<h5>Line</h5>' + fRow('Colour', fColor('style.color', s.color)) + fRow('Width', fRange('style.width', s.width, 1, 16, 0.5)) + fRow('Style', fSel('style.dash', s.dash, DASH)) + fRow('Arrow at the end', fSw('style.arrow', s.arrow)) + fRow('Glow', fSw('style.glow', s.glow));
    } else if (L.kind === 'point') {
      h += '<h5>Symbol</h5>' + fRow('Marker', fSel('style.marker', s.marker, MARKERS));
      if (s.marker === 'emoji') h += fRow('Emoji', fText('style.emoji', s.emoji, '📍'));
      h += fRow('Colour', fColor('style.color', s.color)) + fRow('Size', fRange('style.size', s.size, 0.4, 3, 0.05)) + fRow('Effect', fSel('style.effect', s.effect, EFFECTS));
      h += `<label class="field"><span>Label</span>${fText('style.label', s.label, 'Optional text next to it')}</label>`;
    } else if (L.kind === 'label') {
      h += `<label class="field"><span>Text</span>${fText('style.text', s.text)}</label>`;
      h += fRow('Size', fRange('style.size', s.size, 10, 90, 1)) + fRow('Colour', fColor('style.color', s.color)) + fRow('Outline', fColor('style.halo', s.halo || '#000000'));
      h += fRow('Weight', fSel('style.weight', s.weight, { 500: 'Regular', 700: 'Bold', 900: 'Black' })) + fRow('CAPITALS', fSw('style.upper', s.upper)) + fRow('Italic', fSw('style.italic', s.italic));
    } else if (L.kind === 'caption') {
      h += `<label class="field"><span>Text</span>${fText('style.text', s.text)}</label><label class="field"><span>Second line</span>${fText('style.sub', s.sub, 'Optional')}</label>`;
      h += fRow('Layout', fSel('style.layout', s.layout, CAPTION_LAYOUTS));
      if (!['lowerThird', 'band'].includes(s.layout)) h += fRow('Position', fSel('style.position', s.position, POSITIONS));
      h += fRow('Accent', fColor('style.accent', s.accent)) + fRow('Size', fRange('style.size', s.size || 1, 0.6, 1.8, 0.05));
      h += '<p class="hint-line">Use {km} or {mi} to show the distance travelled so far.</p>';
    }
    h += `<div class="btn-row">${L.geom ? '<button class="btn sm" data-act="zoom">Zoom to</button>' : ''}<button class="btn sm" data-act="up">Up</button><button class="btn sm" data-act="down">Down</button><button class="btn sm" data-act="dup">Duplicate</button><button class="btn sm danger" data-act="del">Delete</button></div>`;
    box.innerHTML = h;
    box.hidden = false;
    renderFloodInfo();
  }
  function renderFloodInfo() {
    const el = $('#flood-info');
    if (!el || !selLayer) return;
    const it = floods?.items.get(selLayer);
    if (it?.grid) {
      const st = it.grid.stats;
      el.textContent = `Ground in this area: lowest ${st.min.toFixed(1)} m · typical ${st.p40.toFixed(0)}–${st.p60.toFixed(0)} m · highest ${st.max.toFixed(0)} m.`;
    } else if (it?.loading) el.textContent = 'Loading elevation for this area…';
    else el.textContent = 'Elevation could not be loaded for this area.';
  }
  function setPath(obj, path, v) {
    const ks = path.split('.');
    let o = obj;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks.at(-1)] = v;
  }
  let layerEditTimer = null;
  function onLayerField(e, final) {
    const el = e.target.closest('[data-b]');
    const L = selLayer && layerById(selLayer);
    if (!el || !L) return;
    const key = el.dataset.b;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'range' || el.type === 'number') v = v === '' ? null : +v;
    if (key === 'style.weight') v = +v;
    if (final) pushUndo();
    setPath(L, key, v);
    if (key === 'anim' || key === 'style.marker' || key === 'style.layout') { renderLayerEditor(); commitLayers(); return; }
    if (['start', 'duration', 'hold', 'style.levelFrom', 'style.levelTo'].includes(key) || key === 'name') {
      clearTimeout(layerEditTimer);
      layerEditTimer = setTimeout(() => { L.duration = Math.max(0.05, +L.duration || 0.05); L.start = Math.max(0, +L.start || 0); L.hold = Math.max(0, +L.hold || 0); commitLayers(); }, 250);
      return;
    }
    floods?.update(scene(), viewMode === 'play' ? time : null);
    renderLayerList();
    repaint();
    save();
  }
  $('#layer-editor').addEventListener('input', (e) => onLayerField(e, false));
  $('#layer-editor').addEventListener('change', (e) => { if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') onLayerField(e, true); });
  $('#layer-editor').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    const L = selLayer && layerById(selLayer);
    if (!a || !L) return;
    const ls = layersOf();
    const i = ls.indexOf(L);
    if (a === 'close') selectLayer(null);
    if (a === 'zoom') zoomToLayer(L);
    if (a === 'del') deleteLayer(L.id);
    if (a === 'dup') { const c = JSON.parse(JSON.stringify(L)); c.id = `ly_${Math.random().toString(36).slice(2, 9)}`; c.name = `${L.name} copy`; addLayer(c); }
    if (a === 'up' && i < ls.length - 1) { pushUndo(); [ls[i], ls[i + 1]] = [ls[i + 1], ls[i]]; commitLayers(); }
    if (a === 'down' && i > 0) { pushUndo(); [ls[i], ls[i - 1]] = [ls[i - 1], ls[i]]; commitLayers(); }
    if (a === 'atPlayhead') { pushUndo(); L.start = +time.toFixed(2); renderLayerEditor(); commitLayers(); }
    if (a === 'origin') { cancelDrawing(); pickOrigin = L.id; setViewMode('edit'); stage.classList.add('placing'); showHint('Click where the water starts · Esc to cancel'); }
    if (a === 'autoLevel') {
      const st = floods?.items.get(L.id)?.grid?.stats;
      if (!st) { toast('Elevation is not loaded yet'); return; }
      pushUndo();
      L.style.levelFrom = Math.round(st.min * 10) / 10;
      L.style.levelTo = Math.round(Math.max(st.p40, st.min + 2) * 10) / 10;
      renderLayerEditor(); commitLayers();
    }
  });

  // animated symbol gallery (live previews)
  let symRaf = 0;
  function openSymbols() {
    const grid = $('#symbol-grid');
    if (!grid.childElementCount) {
      grid.innerHTML = Object.entries(SYMBOL_PRESETS).map(([k, p]) => `<button class="sign-card" data-preset="${k}"><canvas width="300" height="192"></canvas><b>${p.name}</b><small>${EFFECTS[p.effect]}</small></button>`).join('');
    }
    $('#symbols-modal').showModal();
    const cards = $$('#symbol-grid [data-preset]');
    const t0 = performance.now();
    const loop = () => {
      if (!$('#symbols-modal').open) return;
      symRaf = requestAnimationFrame(loop);
      const t = (performance.now() - t0) / 1000;
      for (const c of cards) {
        const cv = $('canvas', c);
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#ece8df';
        ctx.fillRect(0, 0, cv.width, cv.height);
        const L = newLayer('point', { type: 'Point', coordinates: [0, 0] }, { preset: c.dataset.preset, start: 0 });
        L.anim = 'none';
        drawLayers(ctx, { scene: { layers: [L] }, proj: () => [cv.width / 2, cv.height * 0.56], unit: 1.6, time: 1 + t, frame: null }, 'above');
      }
    };
    cancelAnimationFrame(symRaf);
    loop();
  }
  $('#symbol-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    $('#symbols-modal').close();
    startAdd('point', b.dataset.preset);
  });

  // boundary search
  let bTimer = null, bSeq = 0, bResults = [];
  $('#find-boundary').onclick = () => { $('#boundary-modal').showModal(); $('#boundary-q').focus(); };
  $('#boundary-q').addEventListener('input', (e) => {
    clearTimeout(bTimer);
    const q = e.target.value.trim();
    if (q.length < 3) return;
    bTimer = setTimeout(() => runBoundarySearch(q), 600);
  });
  $('#boundary-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(bTimer); runBoundarySearch(e.target.value.trim()); } });
  async function runBoundarySearch(q) {
    if (!q) return;
    const seq = ++bSeq;
    const ul = $('#boundary-results');
    ul.innerHTML = '<li class="small muted">Searching…</li>';
    try {
      bResults = await searchBoundaries(q);
      if (seq !== bSeq) return;
      ul.innerHTML = bResults.length ? bResults.map((r, i) => `<li data-i="${i}"><b>${esc(r.name)}</b><small>${esc(r.detail)}</small></li>`).join('') : '<li class="small muted">No boundaries found. Try a broader name.</li>';
    } catch { ul.innerHTML = '<li class="small muted">Search is unavailable right now.</li>'; }
  }
  $('#boundary-results').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    const r = bResults[+li.dataset.i];
    $('#boundary-modal').close();
    const [L] = layersFromGeoJSON(r.geometry, 'boundary', newStart());
    if (!L) return;
    L.name = r.name;
    addLayer(L);
    zoomToLayer(L);
  });

  // import
  let pendingImport = null;
  $('#import-layers').onclick = () => $('#file-layers').click();
  $('#file-layers').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    let obj;
    try { obj = await readLayerFile(f); } catch (err) { toast(err.message || 'Could not read that file'); return; }
    const probe = layersFromGeoJSON(obj, 'area', 0);
    if (!probe.length) { toast('No shapes found in that file'); return; }
    const polys = probe.filter((l) => l.kind === 'area').length;
    pendingImport = { obj, name: f.name };
    if (polys) {
      $('#import-title').textContent = `Import ${f.name}`;
      $('#import-info').textContent = `${probe.length} shape${probe.length === 1 ? '' : 's'} found, ${polys} of them area${polys === 1 ? '' : 's'}.`;
      $('#import-modal').showModal();
    } else finishImport('boundary');
  });
  $('#import-modal').addEventListener('click', (e) => {
    const b = e.target.closest('[data-as]');
    if (!b) return;
    $('#import-modal').close();
    finishImport(b.dataset.as);
  });
  function finishImport(as) {
    if (!pendingImport) return;
    let ls = layersFromGeoJSON(pendingImport.obj, as, newStart());
    // many shapes → merge into one layer per kind to stay fast and tidy
    const merge = (kind, type, multi) => {
      const group = ls.filter((l) => l.kind === kind);
      if (group.length <= 30) return;
      const coords = group.flatMap((l) => (l.geom.type === type ? [l.geom.coordinates] : l.geom.coordinates));
      const one = group[0];
      one.geom = { type: multi, coordinates: coords };
      one.name = pendingImport.name.replace(/\.[^.]+$/, '');
      ls = ls.filter((l) => l.kind !== kind || l === one);
    };
    merge(as, 'Polygon', 'MultiPolygon');
    merge('line', 'LineString', 'MultiLineString');
    const pts = ls.filter((l) => l.kind === 'point');
    if (pts.length > 80) ls = ls.filter((l) => l.kind !== 'point' || pts.indexOf(l) < 80);
    pushUndo();
    layersOf().push(...ls);
    selLayer = ls[0]?.id || null;
    commitLayers();
    renderLayerEditor();
    const all = ls.map(layerBounds).filter(Boolean);
    if (all.length) flyToBounds([[Math.min(...all.map((b) => b[0][0])), Math.min(...all.map((b) => b[0][1]))], [Math.max(...all.map((b) => b[1][0])), Math.max(...all.map((b) => b[1][1]))]]);
    toast(`Imported ${ls.length} layer${ls.length === 1 ? '' : 's'}`);
    pendingImport = null;
  }

  // ---------------------------------------------------------------- camera: start & end moves, lens
  const SECS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
  function renderCamSelects() {
    const cam = scene().camera;
    const feats = layersOf().filter((l) => l.geom && !l.hidden).map((l) => [`feature:${l.id}`, `Layer: ${l.kind === 'label' ? l.style.text : l.name}`]);
    const opt = (pairs, v) => pairs.map(([k, t]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(t)}</option>`).join('');
    $('#cam-intro').innerHTML = opt([['none', 'No zoom'], ['world', 'The whole world'], ['wide', 'A wide view'], ['routeStart', 'Close to the route start'], ...feats], cam.intro || 'none');
    $('#cam-outro').innerHTML = opt([['none', 'No zoom'], ['overview', 'Everything (route and layers)'], ['wide', 'A wide view'], ['world', 'The whole world'], ['routeEnd', 'Close to the route end'], ...feats], cam.outro || 'none');
    $('#cam-intro-secs').innerHTML = SECS.map((v) => `<option value="${v}" ${v === +cam.introSeconds ? 'selected' : ''}>${v} s</option>`).join('');
    $('#cam-outro-secs').innerHTML = SECS.map((v) => `<option value="${v}" ${v === +cam.outroSeconds ? 'selected' : ''}>${v} s</option>`).join('');
    $('#intro-secs-row').hidden = !cam.intro || cam.intro === 'none';
    $('#outro-secs-row').hidden = !cam.outro || cam.outro === 'none';
    const lens = cam.lens;
    $('#dof').checked = !!lens.dof;
    $('#dof-opts').hidden = !lens.dof;
    $('#dof-blur').value = lens.blur;
    $('#dof-focus').value = lens.focus;
    $('#dof-band').value = lens.band;
    $('#dof-follow').checked = !!lens.followArrow;
    $('#vignette').value = lens.vignette || 0;
  }
  const camChanged = (preview) => {
    rebuild();
    renderCamSelects();
    save();
    if (preview === 'start') { setViewMode('play'); setPlaying(false); time = 0; applyCamera(0); updatePlayhead(); }
    if (preview === 'end') { setViewMode('play'); setPlaying(false); time = model.total; applyCamera(time); updatePlayhead(); }
    repaint();
  };
  $('#cam-intro').addEventListener('change', (e) => { scene().camera.intro = e.target.value; camChanged('start'); });
  $('#cam-outro').addEventListener('change', (e) => { scene().camera.outro = e.target.value; camChanged('end'); });
  $('#cam-intro-secs').addEventListener('change', (e) => { scene().camera.introSeconds = +e.target.value; camChanged(); });
  $('#cam-outro-secs').addEventListener('change', (e) => { scene().camera.outroSeconds = +e.target.value; camChanged(); });
  const lensField = (id, key, num = true) => $(id).addEventListener('input', (e) => {
    scene().camera.lens[key] = e.target.type === 'checkbox' ? e.target.checked : num ? +e.target.value : e.target.value;
    if (key === 'dof') $('#dof-opts').hidden = !e.target.checked;
    save();
    repaint();
  });
  lensField('#dof', 'dof'); lensField('#dof-blur', 'blur'); lensField('#dof-focus', 'focus'); lensField('#dof-band', 'band'); lensField('#dof-follow', 'followArrow'); lensField('#vignette', 'vignette');

  // ---------------------------------------------------------------- look
  function renderThemes() {
    const look = scene().look;
    const isMore = MORE_THEMES.includes(look.theme);
    $('#themes').innerHTML = MAIN_THEMES.map((k) => `<button class="theme-btn ${look.theme === k ? 'active' : ''}" data-theme="${k}">${themeSwatchSVG(k)}${THEMES[k].name}</button>`).join('') +
      `<button class="theme-btn ${isMore ? 'active' : ''}" data-more>${isMore ? themeSwatchSVG(look.theme) : '<span class="more-ico">▦</span>'}${isMore ? THEMES[look.theme].name : 'More'}</button>`;
    $('#theme-desc').textContent = THEMES[look.theme]?.desc || '';
    $('#more-themes').innerHTML = MORE_THEMES.map((k) => `<button class="theme-card ${look.theme === k ? 'active' : ''}" data-theme="${k}">${themeSwatchSVG(k)}<b>${THEMES[k].name}</b><small>${THEMES[k].desc}</small></button>`).join('');
  }
  function setTheme(k) {
    const look = scene().look;
    const prevDefault = THEMES[look.theme]?.line;
    look.theme = k;
    if (!look.lineColor || look.lineColor === prevDefault) look.lineColor = THEMES[k].line || look.lineColor;
    renderThemes();
    renderLookControls();
    applyLook(scene());
    rebuild();
    renderLegs();
    save();
  }
  $('#themes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme]');
    if (b) setTheme(b.dataset.theme);
    if (e.target.closest('[data-more]')) $('#themes-modal').showModal();
  });
  $('#more-themes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme]');
    if (b) { setTheme(b.dataset.theme); $('#themes-modal').close(); }
  });
  function renderLookControls() {
    const look = scene().look;
    $$('[data-look]').forEach((el) => {
      const v = look[el.dataset.look];
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    });
    $('#terrain-row').hidden = !look.terrain;
    $('#bld-row').hidden = !look.buildings3d;
    const cur = look.lineColor;
    $('#swatches').innerHTML = COLORS.map((c) => `<button class="swatch ${c === cur ? 'active' : ''}" data-color="${c}" style="background:${c}"></button>`).join('') +
      `<label class="swatch-custom" title="Custom colour"><input type="color" value="${cur}"/></label>`;
  }
  $('#side').addEventListener('input', (e) => {
    const el = e.target.closest('[data-look]');
    if (!el) return;
    const key = el.dataset.look;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'range') v = +v;
    scene().look[key] = v;
    if (key === 'terrain') {
      $('#terrain-row').hidden = !v;
      if (v && !(+scene().camera.tilt)) { scene().camera.tilt = 45; renderCamera(); if (viewMode === 'edit') map.easeTo({ pitch: 45 }); toast('Tilted the camera so the mountains show'); }
    }
    if (key === 'buildings3d') {
      $('#bld-row').hidden = !v;
      if (v) {
        if (!(+scene().camera.tilt)) { scene().camera.tilt = 50; renderCamera(); if (viewMode === 'edit') map.easeTo({ pitch: 50 }); }
        if (map.getZoom() < 13.5) toast('3D buildings show when you zoom in to street level (zoom 14+)', 3600);
      }
    }
    if (['placeNames', 'lang', 'states', 'terrain', 'terrainExaggeration', 'buildings3d'].includes(key)) applyLook(scene());
    rebuild();
    renderLegs();
    save();
  });
  $('#swatches').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    scene().look.lineColor = b.dataset.color;
    renderLookControls(); rebuild(); renderLegs(); save();
  });
  $('#swatches').addEventListener('input', (e) => {
    if (e.target.type !== 'color') return;
    e.stopPropagation();
    scene().look.lineColor = e.target.value;
    rebuild(); renderLegs(); save();
  });

  // ---------------------------------------------------------------- signs
  function renderSignGrid() {
    const grid = $('#sign-grid');
    if (grid.childElementCount) return;
    grid.innerHTML = Object.entries(SIGN_TYPES).map(([k, t]) => `<button class="sign-card" data-type="${k}"><canvas width="360" height="152"></canvas><b>${t.name}</b><small>${t.desc}</small></button>`).join('');
    requestAnimationFrame(() => $$('.sign-card', grid).forEach((b) => drawSignPreview($('canvas', b), b.dataset.type)));
  }
  $('#add-sign').onclick = () => { renderSignGrid(); $('#signs-modal').showModal(); requestAnimationFrame(() => $$('#sign-grid .sign-card').forEach((b) => drawSignPreview($('canvas', b), b.dataset.type))); };
  $('#sign-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]');
    if (!b) return;
    $('#signs-modal').close();
    startPlacing(b.dataset.type);
  });
  function startPlacing(type) {
    placing = type;
    setViewMode('edit');
    stage.classList.add('placing');
    const hint = $('#stage-hint');
    hint.textContent = `Click the map where the ${SIGN_TYPES[type].name.toLowerCase()} goes · Esc to cancel`;
    hint.hidden = false;
  }
  function stopPlacing() { placing = null; stage.classList.remove('placing'); $('#stage-hint').hidden = true; }
  function addSign(ll) {
    const type = placing;
    stopPlacing();
    pushUndo();
    const t = SIGN_TYPES[type];
    const sg = { id: `sg_${Math.random().toString(36).slice(2, 8)}`, type, text: t.text, lng: +ll.lng.toFixed(6), lat: +ll.lat.toFixed(6), appear: 'auto' };
    if (t.detail) sg.detail = t.detail;
    scene().signs.push(sg);
    commit();
    selectSign(scene().signs.length - 1);
    if (t.image) $('#file-image').click();
    else setTimeout(() => { $('#se-text').focus(); $('#se-text').select(); }, 30);
  }
  function selectSign(i) {
    selSign = i;
    const ed = $('#sign-editor');
    const sg = i != null ? scene().signs[i] : null;
    ed.hidden = !sg;
    if (sg) {
      const t = SIGN_TYPES[sg.type] || SIGN_TYPES.board;
      $('#se-title').textContent = t.name;
      $('#se-text').value = sg.text || '';
      $('#se-detail').value = sg.detail || '';
      $('#se-detail-row').hidden = !('detail' in t);
      $('#se-image-row').hidden = !t.image;
      $('#se-image-name').textContent = sg.image ? 'Image added' : 'No image yet';
      $('#se-flip-row').hidden = !t.flip;
      $('#se-flip').checked = !!sg.flip;
      $('#se-appear').value = sg.appear || 'auto';
      $('#se-type').value = sg.type;
    }
    renderSignList();
    repaint();
  }
  $('#se-type').innerHTML = Object.entries(SIGN_TYPES).map(([k, t]) => `<option value="${k}">${t.name}</option>`).join('');
  const editSign = (fn, undoable = false) => {
    const sg = scene().signs[selSign];
    if (!sg) return;
    if (undoable) pushUndo();
    fn(sg);
    rebuild();
    renderSignList();
    save();
  };
  $('#se-text').addEventListener('input', (e) => editSign((sg) => { sg.text = e.target.value; }));
  $('#se-detail').addEventListener('input', (e) => editSign((sg) => { sg.detail = e.target.value; }));
  $('#se-flip').addEventListener('change', (e) => editSign((sg) => { sg.flip = e.target.checked; }, true));
  $('#se-appear').addEventListener('change', (e) => editSign((sg) => { sg.appear = e.target.value; }, true));
  $('#se-type').addEventListener('change', (e) => { editSign((sg) => { sg.type = e.target.value; }, true); selectSign(selSign); });
  $('#se-delete').onclick = () => deleteSign(selSign);
  $('#se-close').onclick = () => selectSign(null);
  $('#se-image-btn').onclick = () => $('#file-image').click();
  $('#file-image').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f || selSign == null) return;
    const sg = scene().signs[selSign];
    try {
      sg.image = await imageToDataURL(f, sg.type === 'photo' ? 900 : 700, sg.type === 'photo' && !/png|svg/.test(f.type));
      await preloadSignImages([sg]);
      $('#se-image-name').textContent = f.name;
      rebuild(); save();
    } catch { toast('Could not read that image'); }
  });
  function deleteSign(i) {
    if (i == null) return;
    pushUndo();
    scene().signs.splice(i, 1);
    selSign = null;
    $('#sign-editor').hidden = true;
    commit();
  }
  function renderSignList() {
    const signs = scene().signs;
    $('#sign-count').textContent = signs.length;
    $('#sign-list').innerHTML = signs.length ? signs.map((sg, i) => `<li data-i="${i}" class="${i === selSign ? 'active' : ''}"><span>${esc(sg.text || SIGN_TYPES[sg.type]?.name || 'Sign')}</span><small>${esc(SIGN_TYPES[sg.type]?.name || '')}</small></li>`).join('') : '<li class="empty">No signs yet.</li>';
  }
  $('#sign-list').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    selectSign(+li.dataset.i);
    const sg = scene().signs[+li.dataset.i];
    const p = map.project([sg.lng, sg.lat]);
    if (p.x < frame.x || p.x > frame.x + frame.w || p.y < frame.y || p.y > frame.y + frame.h) { setViewMode('edit'); userIntent = true; map.easeTo({ center: [sg.lng, sg.lat], duration: 600 }); }
  });
  $('#sign-size').addEventListener('input', (e) => {
    scene().signSize = +e.target.value;
    $('#sign-size-out').textContent = `${Math.round(scene().signSize * 100)}%`;
    rebuild(); save();
  });

  // ---------------------------------------------------------------- camera
  const CAM_SUB = {
    fixed: "The camera doesn't move: the video shows exactly what's in the frame.",
    startEnd: 'The camera glides from a start view to an end view while the line draws.',
    follow: 'The camera travels with the arrow along the route.',
  };
  function renderCamera() {
    renderCamSelects();
    const cam = scene().camera;
    $$('#cam-cards [data-cam]').forEach((b) => b.classList.toggle('active', b.dataset.cam === cam.mode));
    $$('.cam-opts').forEach((d) => d.classList.toggle('active', d.dataset.camOpts === cam.mode));
    $('#cam-sub').textContent = CAM_SUB[cam.mode] || '';
    $('#start-state').textContent = cam.start ? 'Set ✓' : 'Not set';
    $('#start-state').className = cam.start ? 'set' : '';
    $('#end-state').textContent = cam.end ? 'Set ✓' : 'Not set';
    $('#end-state').className = cam.end ? 'set' : '';
    const fitRef = model?.fit?.zoomRef ?? 3;
    const rel = cam.followZoomRef != null ? cam.followZoomRef - fitRef : 2;
    $('#follow-zoom').value = clamp(rel, 0, 7);
    $('#follow-out').textContent = `${clamp(rel, 0, 7).toFixed(1)}`;
    $('#follow-rotate').checked = !!cam.followRotate;
    $('#tilt').value = +cam.tilt || 0;
    $('#tilt-out').textContent = `${+cam.tilt || 0}°`;
  }
  $('#cam-cards').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cam]');
    if (!b) return;
    const cam = scene().camera;
    cam.mode = b.dataset.cam;
    if (cam.mode === 'fixed' && !cam.fixed) cam.fixed = currentView();
    if (cam.mode === 'follow' && cam.followZoomRef == null && model.fit) cam.followZoomRef = model.fit.zoomRef + 2;
    rebuild();
    renderCamera();
    if (cam.mode === 'fixed') { setViewMode('edit'); showEditView(); }
    else previewCamera();
    save();
  });
  function previewCamera() {
    if (!model.drawable.length) return;
    setViewMode('play');
    if (time <= model.drawStart + 0.01 || time >= model.total - 0.01) time = model.drawStart + (model.drawEnd - model.drawStart) * 0.35;
    applyCamera(time);
    updatePlayhead();
  }
  $('#cam-fit').onclick = () => { fitRoute(); };
  $('#set-start').onclick = () => { setViewMode('edit'); scene().camera.start = currentView(); renderCamera(); rebuild(); save(); toast('Start view set'); };
  $('#set-end').onclick = () => { setViewMode('edit'); scene().camera.end = currentView(); renderCamera(); rebuild(); save(); toast('End view set'); };
  $('#go-start').onclick = () => { const v = scene().camera.start || model.fit; if (v) { setViewMode('edit'); map.easeTo({ ...camOf(v), duration: 600 }); } };
  $('#go-end').onclick = () => { const v = scene().camera.end || model.fit; if (v) { setViewMode('edit'); map.easeTo({ ...camOf(v), duration: 600 }); } };
  $('#follow-zoom').addEventListener('input', (e) => {
    const cam = scene().camera;
    cam.followZoomRef = (model.fit?.zoomRef ?? 3) + +e.target.value;
    $('#follow-out').textContent = (+e.target.value).toFixed(1);
    rebuild(); previewCamera(); save();
  });
  $('#follow-current').onclick = () => {
    const cam = scene().camera;
    cam.followZoomRef = zoomRefFor(map.getZoom(), frame.w);
    renderCamera(); rebuild(); previewCamera(); save();
  };
  $('#follow-rotate').addEventListener('change', (e) => { scene().camera.followRotate = e.target.checked; rebuild(); previewCamera(); save(); });
  $('#tilt').addEventListener('input', (e) => {
    const cam = scene().camera;
    cam.tilt = +e.target.value;
    $('#tilt-out').textContent = `${cam.tilt}°`;
    if (cam.fixed) cam.fixed.pitch = cam.tilt;
    rebuild();
    if (viewMode === 'edit') map.jumpTo({ pitch: cam.tilt });
    else applyCamera(time);
    save();
  });

  // ---------------------------------------------------------------- export settings
  function renderExportSettings() {
    const sc = scene();
    $('#still-start').value = String(+sc.stillStart || 0);
    $('#still-end').value = String(+sc.stillEnd || 0);
    $('#resolution').value = String(project.resolution);
    $('#fps').value = String(project.fps);
    $('#join').value = project.join || 'cut';
    $('#join-row').hidden = project.scenes.length < 2;
  }
  $('#still-start').addEventListener('change', (e) => { scene().stillStart = +e.target.value; rebuild(); save(); });
  $('#still-end').addEventListener('change', (e) => { scene().stillEnd = +e.target.value; rebuild(); save(); });
  const setResolution = (v) => { project.resolution = +v; $('#resolution').value = String(v); $('#resolution-top').value = String(v); layout(true); updateEstimate(); save(); };
  $('#resolution').addEventListener('change', (e) => setResolution(e.target.value));
  $('#resolution-top').addEventListener('change', (e) => setResolution(e.target.value));
  $('#fps').addEventListener('change', (e) => { project.fps = +e.target.value; updateEstimate(); save(); });
  $('#join').addEventListener('change', (e) => { project.join = e.target.value; save(); });
  $('#play-preview').onclick = () => { time = 0; setViewMode('play'); setPlaying(true); };

  function projectDuration() {
    return project.scenes.reduce((s, sc, i) => s + (i === sceneIdx ? model.total : buildScene(sc, frame.w, frame.h).total), 0);
  }
  function updateEstimate() {
    const el = $('#estimate');
    if (step !== 'export') { el.textContent = ''; return; }
    const dur = projectDuration();
    const frames = Math.ceil(dur * project.fps);
    const { width } = videoSize(project.aspect, project.resolution);
    const perFrame = width >= 3800 ? 0.16 : width >= 2500 ? 0.1 : 0.06;
    el.innerHTML = `Rendering takes about ${fmtShort(Math.max(5, frames * perFrame + 4)).replace(/^0:/, '')} ${frames * perFrame + 4 >= 60 ? 'min' : 'seconds'}<br>${dur.toFixed(1)} s video · ${frames} frames`;
  }

  // ---------------------------------------------------------------- steps
  function setStep(s) {
    step = s;
    visited.add(s);
    $$('#stepper [data-step]').forEach((b) => {
      const k = b.dataset.step;
      b.classList.toggle('active', k === s);
      const done = k !== s && visited.has(k) && (k !== 'route' || model?.drawable.length);
      b.classList.toggle('done', !!done);
    });
    $$('.step-page').forEach((p) => p.classList.toggle('active', p.dataset.page === s));
    $('#toolbar').hidden = s !== 'route';
    $('#legs-panel').hidden = s !== 'route';
    if (s !== 'route') closePops();
    if (s !== 'layers') cancelDrawing();
    if (s === 'layers') { renderLayerList(); renderLayerEditor(); }
    if (s !== 'signs') { stopPlacing(); selSign = null; $('#sign-editor').hidden = true; }
    stage.classList.toggle('tool-draw', tool === 'draw' && s === 'route');
    const next = $('#next-step');
    next.textContent = NEXT_LABEL[s];
    next.classList.toggle('render', s === 'export');
    if (s === 'look') { renderThemes(); renderLookControls(); }
    if (s === 'signs') { renderSignList(); $('#sign-size').value = scene().signSize || 1; $('#sign-size-out').textContent = `${Math.round((scene().signSize || 1) * 100)}%`; }
    if (s === 'camera') renderCamera();
    if (s === 'export') renderExportSettings();
    updateEstimate();
    if (s !== 'export' && s !== 'camera' && viewMode === 'play' && !playing) { setViewMode('edit'); showEditView(); }
    repaint();
  }
  $('#stepper').addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (b) setStep(b.dataset.step);
  });
  $('#next-step').onclick = () => {
    if (step === 'export') { startExport(); return; }
    setStep(STEPS[STEPS.indexOf(step) + 1]);
  };

  // ---------------------------------------------------------------- playback & timeline
  function applyCamera(t) {
    const c = model.cameraAt(t);
    map.jumpTo({ center: c.center, zoom: c.zoom, bearing: c.bearing || 0, pitch: c.pitch || 0 });
    applyTimeEffects(t);
  }
  /** Things inside the map that change with time: terrain floods and growing 3D buildings. */
  function applyTimeEffects(t, sc = scene(), m = model) {
    if (!map || !sc) return;
    floods?.update(sc, t);
    const f = t == null || !m ? 1 : m.buildingsAt(t);
    const q = Math.round(f * 200) / 200;
    if (q !== bldFactor && map.getLayer && map.getLayer('ma-buildings')) {
      bldFactor = q;
      map.setPaintProperty('ma-buildings', 'fill-extrusion-height', ['*', ['coalesce', ['get', 'render_height'], 8], Math.max(0.001, q)]);
    }
  }
  function setViewMode(m) {
    if (m === viewMode) return;
    viewMode = m;
    if (m === 'edit') { setPlaying(false); applyTimeEffects(null); }
    if (m === 'play') { closePops(); stopPlacing(); cancelDrawing(); }
    repaint();
  }
  function setPlaying(p) {
    playing = p;
    document.body.classList.toggle('is-playing', p);
    if (p) { playStartNow = performance.now(); playStartTime = time; }
  }
  function togglePlay() {
    if (!model.drawable.length && !scene().signs.length) { toast('Draw a route first'); return; }
    if (viewMode !== 'play') setViewMode('play');
    if (!playing && time >= model.total - 0.02) time = 0;
    setPlaying(!playing);
  }
  $('#tl-play').onclick = togglePlay;

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    if (!project || exporting) return;
    if (playing) {
      time = playStartTime + (now - playStartNow) / 1000;
      if (time >= model.total) { time = model.total; setPlaying(false); }
      applyCamera(time);
      updatePlayhead();
      repaint();
    }
  }

  function renderTimeline() {
    const total = model.total;
    const pct = (t) => `${(t / total) * 100}%`;
    const step = total > 40 ? 10 : total > 16 ? 2 : 1;
    let ruler = '';
    for (let s = 0; s <= total + 1e-6; s += step) ruler += `<span style="left:${pct(s)}">${s}s</span>`;
    $('#tl-ruler').innerHTML = ruler;
    const cam = scene().camera.mode;
    const camLabel = { fixed: ['Fixed view', 'The view in the frame'], startEnd: ['Start to end', 'Glides between two views'], follow: ['Follow the line', 'Stays with the arrow'] }[cam] || ['Camera', ''];
    const a = model.drawStart, b = Math.max(model.drawEnd, a + 0.05);
    $('#tl-cam').innerHTML = `<div class="bar" style="left:${pct(a)};width:${pct(b - a)}"><span>${camLabel[0]}</span><span>${camLabel[1]}</span></div>`;
    const pauses = model.runs.filter((r) => r.pauseAfter > 0 && r !== model.runs.at(-1)).map((r) => `<div class="pause" style="left:${pct(r.end)};width:${pct(r.pauseAfter)}"></div>`).join('');
    $('#tl-line').innerHTML = model.drawable.length ? `<div class="bar" style="left:${pct(a)};width:${pct(b - a)}"><span>Line draws</span></div>${pauses}` : '';
    $('#tl-layers').innerHTML = layersOf().filter((L) => !L.hidden).map((L, i) => {
      const d = Math.max(0.05, +L.duration || 0.05);
      const tail = L.hold > 0 ? L.hold : Math.max(0, total - L.start - d);
      return `<div class="lb ${i % 2 ? 'a' : 'b'} ${L.id === selLayer ? 'sel' : ''}" data-id="${L.id}" title="${esc(L.name)}" style="left:${pct(L.start)};width:${pct(d)};--tail:${((tail / d) * 100).toFixed(1)}%"></div>`;
    }).join('');
    $('#tl-signs').innerHTML = model.signTimes.map((t, i) => `<div class="sig" style="left:${pct(t)}" title="${esc(scene().signs[i]?.text || '')}">${i + 1}</div>`).join('');
    updatePlayhead();
    updateSpeed();
  }
  function updatePlayhead() {
    $('#tl-head').style.left = `${(time / model.total) * 100}%`;
    $('#tl-time').textContent = `${fmt(time)} / ${fmtShort(model.total)}`;
  }
  const tracks = $('#tl-tracks');
  tracks.addEventListener('pointerdown', (e) => {
    if (exporting) return;
    const lb = e.target.closest('.lb');
    if (lb) { if (step !== 'layers') setStep('layers'); selectLayer(lb.dataset.id); return; }
    tracks.setPointerCapture(e.pointerId);
    const seek = (ev) => {
      const r = tracks.getBoundingClientRect();
      time = clamp((ev.clientX - r.left) / r.width, 0, 1) * model.total;
      setViewMode('play');
      setPlaying(false);
      applyCamera(time);
      updatePlayhead();
      repaint();
    };
    seek(e);
    const move = (ev) => seek(ev);
    const up = () => { tracks.removeEventListener('pointermove', move); tracks.removeEventListener('pointerup', up); };
    tracks.addEventListener('pointermove', move);
    tracks.addEventListener('pointerup', up);
  });

  // speed
  const speedName = (s) => (s <= 3.5 ? 'Fast' : s <= 6 ? 'Normal' : s <= 10 ? 'Slow' : 'Very slow');
  function updateSpeed() {
    const s = +scene().lineSeconds || 5;
    $('#speed-label').textContent = speedName(s);
    $('#speed-secs').textContent = `${s.toFixed(1)} s`;
    const ang = (-150 + clamp((14 - s) / 13, 0, 1) * 120) * Math.PI / 180;
    $('#speed-needle').setAttribute('d', `M20 20L${(20 + 11 * Math.cos(ang)).toFixed(1)} ${(20 + 11 * Math.sin(ang)).toFixed(1)}`);
    $('#speed-range').value = s;
    $('#speed-range-out').textContent = `${s.toFixed(1)} s`;
    $$('#speed-pop [data-secs]').forEach((b) => b.classList.toggle('active', +b.dataset.secs === s));
  }
  $('#speed-btn').onclick = (e) => { e.stopPropagation(); $('#speed-pop').hidden = !$('#speed-pop').hidden; };
  $('#speed-pop').addEventListener('click', (e) => {
    e.stopPropagation();
    const b = e.target.closest('[data-secs]');
    if (b) { scene().lineSeconds = +b.dataset.secs; rebuild(); save(); }
  });
  $('#speed-range').addEventListener('input', (e) => { scene().lineSeconds = +e.target.value; rebuild(); save(); });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#speed-pop') && !e.target.closest('#speed-btn')) $('#speed-pop').hidden = true;
    if (!e.target.closest('.menu') && !e.target.closest('.menu-btn')) $$('.menu').forEach((m) => m.remove());
  });

  // ---------------------------------------------------------------- scenes
  function miniSVG(sc) {
    const pts = sc.legs.flatMap((l) => (l.track ? l.track : l.points.map((p) => [p.lng, p.lat])));
    if (pts.length < 2) return '<svg class="mini" viewBox="0 0 34 16"><path d="M3 12C10 4 22 14 31 4" fill="none" stroke="#555a63" stroke-width="2" stroke-dasharray="2 3" stroke-linecap="round"/></svg>';
    const b = bounds(pts);
    const w = b[1][0] - b[0][0] || 1e-6, h = b[1][1] - b[0][1] || 1e-6;
    const s = Math.min(28 / w, 10 / h);
    const step = Math.max(1, Math.floor(pts.length / 60));
    const d = pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p, i) => `${i ? 'L' : 'M'}${(3 + (p[0] - b[0][0]) * s + (28 - w * s) / 2).toFixed(1)} ${(13 - (p[1] - b[0][1]) * s - (10 - h * s) / 2).toFixed(1)}`).join('');
    return `<svg class="mini" viewBox="0 0 34 16"><path d="${d}" fill="none" stroke="${sc.look.lineColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function renderScenes() {
    $('#scene-tabs').innerHTML = project.scenes.map((sc, i) => `
      <div class="scene-tab ${i === sceneIdx ? 'active' : ''}" data-i="${i}">
        <span class="n">${i + 1}</span>${miniSVG(sc)}<b>${esc(sc.name)}</b><small data-dur="${i}"></small>
        <button class="menu-btn" data-menu="${i}" title="Scene options">⋯</button>
      </div>`).join('');
    updateSceneDurations();
  }
  function updateSceneDurations() {
    if (!project) return;
    $$('#scene-tabs [data-dur]').forEach((el) => {
      const i = +el.dataset.dur;
      const t = i === sceneIdx ? model.total : buildScene(project.scenes[i], frame.w, frame.h).total;
      el.textContent = `${t.toFixed(1)} s`;
    });
    const tab = $(`#scene-tabs [data-i="${sceneIdx}"] svg.mini`);
    if (tab) tab.outerHTML = miniSVG(scene());
  }
  $('#scene-tabs').addEventListener('click', (e) => {
    const mb = e.target.closest('[data-menu]');
    if (mb) { e.stopPropagation(); openSceneMenu(+mb.dataset.menu, mb); return; }
    const tab = e.target.closest('.scene-tab');
    if (tab && +tab.dataset.i !== sceneIdx) selectScene(+tab.dataset.i);
  });
  function openSceneMenu(i, anchor) {
    $$('.menu').forEach((m) => m.remove());
    const r = anchor.getBoundingClientRect();
    const m = document.createElement('div');
    m.className = 'menu';
    m.style.left = `${r.left}px`;
    m.style.top = `${r.bottom + 6}px`;
    m.innerHTML = `<button data-a="rename">Rename</button><button data-a="dup">Duplicate</button>${i > 0 ? '<button data-a="left">Move left</button>' : ''}${i < project.scenes.length - 1 ? '<button data-a="right">Move right</button>' : ''}${project.scenes.length > 1 ? '<button data-a="del" class="danger">Delete scene</button>' : ''}`;
    m.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      m.remove();
      if (!a) return;
      const scs = project.scenes;
      if (a === 'rename') { const n = prompt('Scene name', scs[i].name); if (n) { scs[i].name = n.slice(0, 40); renderScenes(); save(); } }
      if (a === 'dup') { const c = JSON.parse(JSON.stringify(scs[i])); c.id = `sc_${Math.random().toString(36).slice(2, 10)}`; c.name = `${scs[i].name} copy`; scs.splice(i + 1, 0, c); selectScene(i + 1); }
      if (a === 'left' || a === 'right') { const j = a === 'left' ? i - 1 : i + 1; [scs[i], scs[j]] = [scs[j], scs[i]]; selectScene(j); }
      if (a === 'del' && confirm(`Delete “${scs[i].name}”?`)) { scs.splice(i, 1); selectScene(Math.min(sceneIdx, scs.length - 1), true); }
      save();
    });
    document.body.append(m);
  }
  $('#new-scene').onclick = () => {
    const last = project.scenes.at(-1);
    const sc = newScene(`Scene ${project.scenes.length + 1}`, last.look);
    // start where the previous scene ended, if it had a route
    const lastLeg = last.legs.at(-1);
    const end = lastLeg?.track ? { lng: lastLeg.track.at(-1)[0], lat: lastLeg.track.at(-1)[1] } : lastLeg?.points.at(-1);
    if (end) sc.legs[0].points.push({ lng: end.lng, lat: end.lat });
    sc.camera.fixed = currentView();
    sc.camera.tilt = last.camera.tilt || 0;
    project.scenes.push(sc);
    selectScene(project.scenes.length - 1);
    setStep('route');
    save();
    toast('New scene — it copies the look of the last scene');
  };
  function selectScene(i, force) {
    if (i === sceneIdx && !force) return;
    setPlaying(false);
    sceneIdx = clamp(i, 0, project.scenes.length - 1);
    activeLeg = scene().legs.length - 1;
    selPoint = selSign = null;
    undoStack = [];
    updateUndo();
    closePops();
    time = 0;
    viewMode = 'edit';
    selLayer = null; cancelDrawing();
    floods.clear();
    applyLook(scene());
    floods.sync(scene()).then(() => applyTimeEffects(null));
    rebuild();
    showEditView();
    renderScenes();
    renderLegs();
    setStep(step);
  }

  // ---------------------------------------------------------------- project-level controls
  $('#project-name').addEventListener('input', (e) => { project.name = e.target.value || 'Untitled trip'; save(); });
  $('#aspect').addEventListener('change', (e) => { project.aspect = e.target.value; layout(true); save(); });
  $('#save-file').onclick = () => {
    const blob = new Blob([JSON.stringify({ ...project, format: 'map-animator', version: 2 })], { type: 'application/json' });
    downloadBlob(blob, `${slug(project.name)}.mapanim.json`);
  };

  // keyboard
  document.addEventListener('keydown', (e) => {
    if ($('#editor').hidden || exporting) return;
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName) && document.activeElement.type !== 'range' && document.activeElement.type !== 'checkbox';
    if (e.key === 'Escape') { stopPlacing(); cancelDrawing(); closePops(); selPoint = null; selectSign(null); repaint(); return; }
    if (e.key === 'Enter' && drawing && !typing) { e.preventDefault(); finishDrawing(); return; }
    if (typing) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (step === 'route' && selPoint) { e.preventDefault(); deletePoint(selPoint.li, selPoint.i); }
      else if (step === 'layers' && selLayer) { e.preventDefault(); deleteLayer(selLayer); }
      else if (step === 'signs' && selSign != null) { e.preventDefault(); deleteSign(selSign); }
    }
  });

  // ---------------------------------------------------------------- export
  let exportAbort = null, exportUrl = null, expScene = null;
  async function startExport() {
    if (exporting) return;
    if (!project.scenes.some((sc) => buildScene(sc, frame.w, frame.h).drawable.length || sc.signs.length)) { toast('Draw a route first'); return; }
    if (project.scenes.some((sc) => sc.legs.some((l) => l._pending))) { toast('Still finding roads — try again in a moment'); return; }
    const { width, height } = videoSize(project.aspect, project.resolution);
    const fps = project.fps;
    setPlaying(false);
    closePops();
    viewMode = 'play';
    exporting = true;
    const dlg = $('#render-modal');
    if (exportUrl) { URL.revokeObjectURL(exportUrl); exportUrl = null; }
    const prev = $('#render-preview');
    prev.width = 640;
    prev.height = Math.round(640 * height / width);
    const pctx = prev.getContext('2d');
    $('#render-title').textContent = 'Rendering video…';
    $('#render-bar').style.width = '0%';
    $('#render-status').textContent = 'Loading map tiles…';
    $('#render-download').hidden = true;
    $('#render-cancel').textContent = 'Cancel';
    dlg.showModal();
    exportAbort = new AbortController();

    const mapEl = $('#map');
    stage.classList.add('exporting');
    Object.assign(mapEl.style, { left: `${frame.x}px`, top: `${frame.y}px`, width: `${frame.w}px`, height: `${frame.h}px` });
    map.resize();
    const px = width / frame.w;
    map.setPixelRatio(px);
    const unit = (Math.min(frame.w, frame.h) / 720) * px;
    const t0 = performance.now();
    let lastPrev = 0;
    const origIdx = sceneIdx;
    try {
      const { blob, ext, codec } = await exportVideo({
        scenes: project.scenes, map, width, height, fps, join: project.join,
        signal: exportAbort.signal,
        durationOf: (sc) => buildScene(sc, frame.w, frame.h).total,
        prepareScene: async (sc) => {
          await applyLook(sc);
          floods.clear();
          await floods.sync(sc);
          await preloadSignImages(sc.signs);
          bldFactor = null;
          expScene = sc;
          return buildScene(sc, frame.w, frame.h);
        },
        applyCamera: (m, t) => {
          const c = m.cameraAt(t);
          map.jumpTo({ center: c.center, zoom: c.zoom, bearing: c.bearing || 0, pitch: c.pitch || 0 });
          applyTimeEffects(t, expScene, m);
        },
        drawFrame: (ctx, sc, m, t) => {
          const full = { x: 0, y: 0, w: width, h: height };
          const mc = map.getCanvas();
          const lens = lensFor(sc, m, t, (ll) => map.project(ll).y / frame.h);
          if (lens?.dof) drawDepthOfField(ctx, mc, 0, 0, mc.width, mc.height, full, lens, unit);
          renderScene(ctx, { map, model: m, scene: sc, time: t, px, unit, frame: full });
          drawVignette(ctx, full, +sc.camera.lens?.vignette || 0);
          renderCaptions(ctx, { map, model: m, scene: sc, time: t, px, unit, frame: full });
          drawAttribution(ctx, themeAttribution(sc.look), unit, width, height);
        },
        onStatus: (s) => { $('#render-status').textContent = s; },
        onProgress: (f, canvas, info) => {
          const el = (performance.now() - t0) / 1000;
          const eta = f > 0.03 ? el / f - el : null;
          $('#render-bar').style.width = `${(f * 100).toFixed(1)}%`;
          $('#render-status').textContent = `${info.scenes > 1 ? `Scene ${info.scene} of ${info.scenes} · ` : ''}Frame ${info.frame} of ${info.frames}${eta != null ? ` · about ${fmtShort(eta)} left` : ''}`;
          if (performance.now() - lastPrev > 200) { lastPrev = performance.now(); pctx.drawImage(canvas, 0, 0, prev.width, prev.height); }
        },
      });
      exportUrl = URL.createObjectURL(blob);
      const name = `${slug(project.name)}-${width}x${height}.${ext}`;
      const a = $('#render-download');
      a.href = exportUrl;
      a.download = name;
      a.hidden = false;
      a.textContent = `Download ${ext.toUpperCase()} · ${(blob.size / 1e6).toFixed(1)} MB`;
      $('#render-title').textContent = 'Your video is ready';
      $('#render-status').textContent = `${name} · ${codec === 'avc' ? 'H.264' : codec.toUpperCase()} · made in ${fmtShort((performance.now() - t0) / 1000)}`;
      $('#render-bar').style.width = '100%';
      $('#render-cancel').textContent = 'Close';
    } catch (err) {
      if (err.name === 'AbortError') dlg.close();
      else {
        console.error(err);
        $('#render-title').textContent = 'Rendering failed';
        $('#render-status').textContent = err.message || String(err);
        $('#render-cancel').textContent = 'Close';
      }
    } finally {
      exporting = false;
      exportAbort = null;
      stage.classList.remove('exporting');
      Object.assign(mapEl.style, { left: '', top: '', width: '', height: '' });
      map.setPixelRatio(window.devicePixelRatio || 1);
      sceneIdx = origIdx;
      applyLook(scene());
      floods.clear();
      floods.sync(scene()).then(() => applyTimeEffects(null));
      layout();
      viewMode = 'edit';
      showEditView();
    }
  }
  $('#render-cancel').onclick = () => { if (exportAbort) exportAbort.abort(); else $('#render-modal').close(); };
  $('#render-modal').addEventListener('cancel', (e) => { if (exporting) e.preventDefault(); });

  // ---------------------------------------------------------------- public API
  return {
    async open(p, opts = {}) {
      if (!map) initMap();
      project = p;
      project.scenes.forEach(migrateScene);
      selLayer = null; drawing = null; pickOrigin = null;
      floods.clear();
      $('#resolution-top').value = String(project.resolution);
      sceneIdx = 0;
      activeLeg = scene().legs.length - 1;
      selPoint = selSign = null;
      undoStack = [];
      visited.clear();
      visited.add('camera');
      time = 0;
      viewMode = 'edit';
      $('#project-name').value = project.name;
      $('#aspect').value = project.aspect;
      styleKey = null;
      applyLook(scene());
      layout();
      renderScenes();
      renderLegs();
      setStep(opts.step || 'route');
      updateUndo();
      setTool('draw');
      if (opts.fit && model.fit) map.jumpTo(camOf(model.fit));
      else showEditView();
      if (!scene().camera.fixed && model.fit && scene().camera.mode === 'fixed') scene().camera.fixed = { ...model.fit };
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(tick);
      floods.sync(scene()).then(() => applyTimeEffects(null));
      renderCamSelects();
      if (opts.importFile) await importRoute(opts.importFile);
      return this;
    },
    close() {
      setPlaying(false);
      cancelAnimationFrame(rafId);
      if (project) saveProject(project).catch(() => {});
      project = null;
    },
    get project() { return project; },
    get map() { return map; },
    startExport,
    importRoute,
  };
}

/** Bring scenes saved by older versions up to date. */
function migrateScene(sc) {
  sc.layers ||= [];
  const c = sc.camera || (sc.camera = {});
  c.intro ||= 'none';
  c.introSeconds ??= 2.5;
  c.outro ||= 'none';
  c.outroSeconds ??= 2.5;
  c.lens = { dof: false, blur: 6, focus: 0.55, band: 0.35, followArrow: false, vignette: 0, ...(c.lens || {}) };
  sc.look.buildings3d ??= false;
  sc.look.buildingsRise ??= false;
}

/** Lens settings for a frame; with "keep the arrow sharp" the focus band follows the traveller. */
export function lensFor(sc, model, t, toFrameY) {
  const lens = sc.camera?.lens;
  if (!lens?.dof) return lens;
  if (lens.followArrow && t != null && model.drawable.length) {
    const st = model.stateAt(t);
    if (st.point) return { ...lens, focusY: Math.max(0.05, Math.min(0.95, toFrameY(st.point))) };
  }
  return lens;
}

export function drawAttribution(ctx, text, unit, W, H) {
  ctx.save();
  ctx.font = `500 ${10 * unit}px Inter, system-ui, sans-serif`;
  const tw = ctx.measureText(text).width;
  const pad = 6 * unit, h = 18 * unit;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  const x = W - tw - pad * 2 - 6 * unit, y = H - h - 6 * unit;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, tw + pad * 2, h, h / 2); else ctx.rect(x, y, tw + pad * 2, h);
  ctx.fill();
  ctx.fillStyle = '#333';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + pad, y + h / 2 + 0.5 * unit);
  ctx.restore();
}

async function imageToDataURL(file, max, jpeg) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, max / Math.max(img.naturalWidth || max, img.naturalHeight || max));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round((img.naturalWidth || max) * s));
    c.height = Math.max(1, Math.round((img.naturalHeight || max) * s));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.86);
  } finally { URL.revokeObjectURL(url); }
}
