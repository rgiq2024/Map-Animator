// The editor: scenes, the five steps, map interaction, timeline and export.
import { MODE_GROUPS, MODES, LINE_STYLES, modeOf } from './modes.js';
import { THEMES, MAIN_THEMES, MORE_THEMES, IMAGERY_THEMES, BASE_THEMES, buildStyle, themeAttribution, themeSwatchSVG } from './themes.js';
import { SIGN_TYPES, drawSignPreview, preloadSignImages } from './signs.js';
import { buildScene, newScene, legId, zoomFor, zoomRefFor, fitCamera, routeStats, pointsKey } from './scene.js';
import { renderScene, renderCaptions, projector } from './renderer.js';
import { LAYER_KINDS, ANIMS, EFFECTS, MARKERS, CAPTION_LAYOUTS, POSITIONS, SYMBOL_PRESETS, newLayer, layersFromGeoJSON, layerBounds, layerTiming, hitLayer, drawLayers, centroid } from './layers.js';
import { TerrainFloods } from './flood.js';
import { createTimeline } from './timeline-ui.js';
import { gradeFilter, drawGradeWash, GRADE_PRESETS, presetGrade, defaultGrade } from './effects.js';
import { NORTH_STYLES, NORTH_MODES, CORNERS, defaultNorth, defaultScaleBar } from './hud.js';
import { EASE_NAMES } from './scene.js';
import { parseCSVPoints, FONTS, loadFonts } from './layers.js';
import { addAudioFile, mixProject, playFrom, stopPlayback, startRecording, stopRecording, isRecording } from './audio.js';
import { projectFileJSON, deleteMedia } from './store.js';
import { drawDepthOfField, drawVignette, starfield } from './effects.js';
import { FX_FORMS } from './fx.js';
import { ModelLayer, BUILTIN_MODELS, inspectModelFile } from './models3d.js';
import { seekScene, videoFor } from './videofx.js';
import { buildEvents, defaultSound, MUSIC, SFX_KINDS, hasSound } from './sfx.js';
import { hitGizmo, gizmoDrag } from './gizmo.js';
import { zoomSpeedAt } from './renderer.js';
import { drawZoomBlur } from './effects.js';
import { putMedia } from './store.js';
import { TEMPLATES as QS_TEMPLATES, openQuickStart } from './quickstart.js';
import { IMG_KINDS, readGeoImages, storeImage, imageFor, preloadImages, mediaOf, quadOf, quadGeom, quadFromBounds, quadBounds, rotateQuad, scaleQuad, moveQuad, fixAspect, labelFromName } from './geoimage.js';
import { WaybackLayers, waybackReleases, yearlyReleases } from './wayback.js';
import { SAT_PRODUCTS, SAT_CREDITS, satFrames, satForLongitude, visibleCities, liveWeather } from './livesat.js';
import { thermalFilter } from './hudplus.js';
import { morseTimeline, MORSE_DELAY, SIGINT_DEFAULT } from './milhud.js';
import { drawLetterbox, TITLE_LOOKS } from './titles.js';
import { NEWS_LOOKS } from './news.js';
import { drawScreenEffects, effectFilter, shakeAt, EFFECT_LOOKS } from './screenfx.js';
import { SOUND_LIBRARY, SOUND_NAMES } from './sfx.js';
import { previewLibSound } from './audio.js';
import { getMedia } from './store.js';
import { SPRITES } from './sprites.js';
import { exportVideo, renderStill, TRANSITIONS } from './export.js';
import { readRouteFile, readLayerFile } from './importers.js';
import { geocode, snapRoute, searchBoundaries } from './services.js';
import { saveProject } from './store.js';
import { initModernUI, sectionizeEditor } from './ui.js';
import { AffectedBuildings } from './hazards.js';
import { TwinCity } from './twin.js';
import { sampleData } from './smartmap.js';
import { NET_SET, NET_MODES, netNeedsCompute, netSig, computeNet, defaultFencePath, fenceEvents, fmtDur, fmtLen } from './network.js';
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
  let floods = null, bldFactor = null, models = null, wayback = null, affected = null, twin = null;

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
    models = new ModelLayer(map);
    wayback = new WaybackLayers(map);
    affected = new AffectedBuildings(map);
    affected.onCount = () => repaint();
    twin = new TwinCity(map);
    twin.onChange = () => repaint();
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
    const { theme, placeNames, lang, states, terrain, terrainExaggeration, buildings3d, rasterLabels, rasterRoads, globe, atmosphere } = look;
    return JSON.stringify({ theme, placeNames, lang, states, terrain, globe: !!globe, atmosphere: !!atmosphere, buildings3d: !!buildings3d, rasterLabels: rasterLabels !== false, rasterRoads: !!rasterRoads, terrainExaggeration: terrain ? terrainExaggeration : 0 });
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
      models?.attach();
      wayback?.attach();
      affected?.attach();
      twin?.attach();
      $('#map').style.filter = gradeFilter(scene().look.grade);
      setSpaceBackground(scene().look.globe);
      applyTimeEffects(viewMode === 'play' ? time : null);
    })();
    return stylePromise;
  }

  const joinFilters = (...f) => f.filter((x) => x && x !== 'none').join(' ') || 'none';
  const mapFilterAt = (sc, t) => joinFilters(gradeFilter(sc.look.grade), thermalFilter(sc, t, layerTiming), effectFilter(sc, t, layerTiming));
  /** Put the camera at c, plus any camera-shake effect. */
  function jumpCam(c, sc, t) {
    map.jumpTo({ center: c.center, zoom: c.zoom, bearing: c.bearing || 0, pitch: c.pitch || 0 });
    const [dx, dy] = shakeAt(sc, t, layerTiming);
    if (dx || dy) { const p = map.project(c.center); const q = map.unproject([p.x + dx, p.y + dy]); map.jumpTo({ center: [q.lng, q.lat] }); }
  }
  let starURL = null;
  function setSpaceBackground(on) {
    const el = $('#map');
    el.classList.toggle('space', !!on);
    if (on) { starURL ||= starfield(1600, 1000).toDataURL('image/jpeg', 0.85); el.style.backgroundImage = `url(${starURL})`; }
    else el.style.backgroundImage = '';
  }
  const spaceBg = (sc) => (sc.look.globe ? starfield(1600, 1000) : null);
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
    models?.setUnit(Math.min(w, h) / 720);
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
    const gf = gradeFilter(scene().look.grade);
    if (lens?.dof) {
      const mc = map.getCanvas();
      const k = mc.width / stage.clientWidth;
      drawDepthOfField(octx, mc, frame.x * k, frame.y * k, frame.w * k, frame.h * k, fr, { ...lens, filter: gf }, unit);
    }
    if (t != null && scene().look.zoomBlur) {
      const mc = map.getCanvas();
      const k = mc.width / stage.clientWidth;
      drawZoomBlur(octx, mc, frame.x * k, frame.y * k, frame.w * k, frame.h * k, fr, zoomSpeedAt(model, t), +scene().look.zoomBlurAmount || 1);
    }
    drawGradeWash(octx, { x: 0, y: 0, w: W, h: H }, scene().look.grade);
    hits = renderScene(octx, {
      map, model, scene: scene(), time: t, px, unit, frame: fr,
      edit: viewMode === 'edit' ? { step, activeLeg, selPoint, hoverPoint, selSign, selLayer, drawing, dpr: px } : null,
    });
    drawVignette(octx, fr, +scene().camera.lens?.vignette || 0);
    drawLetterbox(octx, fr, scene().look, t, unit);
    hits.boxes = [];
    renderCaptions(octx, { map, model, scene: scene(), time: t, px, unit, frame: fr, boxes: hits.boxes });
    {
      const mc = map.getCanvas();
      const k = mc.width / stage.clientWidth;
      drawScreenEffects(octx, scene(), { frame: fr, unit, time: t, src: { canvas: mc, sx: frame.x * k, sy: frame.y * k, sw: frame.w * k, sh: frame.h * k } }, layerTiming);
    }
    if (viewMode === 'edit' && step === 'layers' && selLayer) {
      const b = hits.boxes.findLast?.((q) => q.id === selLayer);
      if (b) { octx.save(); octx.setLineDash([6 * px, 4 * px]); octx.strokeStyle = '#2d7ff9'; octx.lineWidth = 1.5 * px; octx.strokeRect(b.x - 4 * px, b.y - 4 * px, b.w + 8 * px, b.h + 8 * px); octx.restore(); }
    }
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
    undoStack.push(JSON.stringify({ scene: sc, audio: project.audio || [] }));
    if (undoStack.length > 80) undoStack.shift();
    updateUndo();
  }
  function undo() {
    const snap = undoStack.pop();
    if (!snap) { toast('Nothing to undo'); return; }
    const snapObj = JSON.parse(snap);
    project.scenes[sceneIdx] = snapObj.scene;
    project.audio = snapObj.audio || [];
    const sc = scene();
    if (!(sc.layers || []).some((l) => l.id === selLayer)) selLayer = null;
    selPoint = null; selSign = null;
    activeLeg = Math.min(activeLeg, sc.legs.length - 1);
    closePops();
    applyLook(sc);
    floods?.sync(sc);
    commitAll();
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
    if (step === 'layers' && drawing?.freehand) { e.preventDefault(); startFreehand(e); return; }
    if (step === 'layers' && !drawing && !pickOrigin) {
      const r = 9 * (overlay.width / stage.clientWidth);
      const h = hits.layerHandles.find((q) => (q.x - p[0]) ** 2 + (q.y - p[1]) ** 2 <= r * r);
      const gz = hits.gizmo && hitGizmo(hits.gizmo, p, overlay.width / stage.clientWidth);
      if (gz) { e.preventDefault(); startGizmo(gz, p, e); return; }
      const box = hitBox(p);
      if (box) { e.preventDefault(); startBoxDrag(box, p, e); return; }
      if (h) { e.preventDefault(); startDrag({ kind: 'vertex', id: h.id, ring: h.ring, i: h.i }, e); return; }
      const id = hitLayer(octx, scene().layers || [], hits.proj, p, unitNow());
      const L = id && layerById(id);
      if (L && L.geom?.type === 'Point') { e.preventDefault(); startDrag({ kind: 'lpoint', id }, e); return; }
      if (L && IMG_KINDS.has(L.kind) && L.geom && L.id === selLayer && !L.locked) { e.preventDefault(); startDrag({ kind: 'lmove', id, last: [e.lngLat.lng, e.lngLat.lat] }, e); return; }
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

  /** On-screen element (caption, chart, text…) under canvas point p. */
  function hitBox(p) {
    const bs = hits.boxes || [];
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      if (p[0] >= b.x - 4 && p[0] <= b.x + b.w + 4 && p[1] >= b.y - 4 && p[1] <= b.y + b.h + 4) return b;
    }
    return null;
  }
  /** Drag an on-screen element anywhere in the video frame. */
  function startBoxDrag(box, p0, e) {
    const L = layerById(box.id);
    if (!L) return;
    map.dragPan.disable();
    const snapshot = JSON.stringify({ scene: scene(), audio: project.audio || [] });
    const rect = stage.getBoundingClientRect();
    const k = overlay.width / stage.clientWidth;
    const fr = { x: frame.x * k, y: frame.y * k, w: frame.w * k, h: frame.h * k };
    const c0 = [box.x + box.w / 2, box.y + box.h / 2];
    let moved = false;
    stage.classList.add('dragging');
    if (selLayer !== L.id) selectLayer(L.id);
    const move = (ev) => {
      const p = [(ev.clientX - rect.left) * k, (ev.clientY - rect.top) * k];
      if (!moved && Math.hypot(p[0] - p0[0], p[1] - p0[1]) < 3) return;
      moved = true;
      const cx = box.lockX ? c0[0] : c0[0] + p[0] - p0[0], cy = box.lockY ? c0[1] : c0[1] + p[1] - p0[1];
      L.style.position = 'custom';
      L.style.pos = { x: +clamp((cx - fr.x) / fr.w, 0, 1).toFixed(4), y: +clamp((cy - fr.y) / fr.h, 0, 1).toFixed(4) };
      repaint();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      map.dragPan.enable();
      stage.classList.remove('dragging');
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      if (moved) { undoStack.push(snapshot); updateUndo(); renderLayerEditor(); save(); }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  /** Resize / rotate the selected layer with its on-map handles. */
  function startGizmo(which, p0, e) {
    const g = hits.gizmo;
    const L = layerById(g.id);
    if (!L) return;
    map.dragPan.disable();
    const snapshot = JSON.stringify({ scene: scene(), audio: project.audio || [] });
    const start = { ...L.style };
    const startQuad = g.quad ? quadOf(L) : null;
    const rect = stage.getBoundingClientRect();
    const k = overlay.width / stage.clientWidth;
    let moved = false;
    stage.classList.add('dragging');
    const move = (ev) => {
      moved = true;
      const p = [(ev.clientX - rect.left) * k, (ev.clientY - rect.top) * k];
      if (startQuad) {
        if (which === 'scale') {
          const d0 = Math.max(4, Math.hypot(p0[0] - g.cx, p0[1] - g.cy)), d1 = Math.max(2, Math.hypot(p[0] - g.cx, p[1] - g.cy));
          L.geom = quadGeom(scaleQuad(startQuad, d1 / d0));
        } else {
          const a0 = Math.atan2(p0[1] - g.cy, p0[0] - g.cx), a1 = Math.atan2(p[1] - g.cy, p[0] - g.cx);
          let deg = ((a1 - a0) * 180) / Math.PI;
          if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
          L.geom = quadGeom(rotateQuad(startQuad, deg));
        }
        repaint();
        return;
      }
      Object.assign(L.style, gizmoDrag(g, which, start, p0, p));
      if (L.kind === 'model3d') models?.update(scene(), viewMode === 'play' ? time : null, layerTiming);
      repaint();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      map.dragPan.enable();
      stage.classList.remove('dragging');
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      if (moved) { undoStack.push(snapshot); updateUndo(); renderLayerEditor(); save(); }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  function startDrag(target, e) {
    map.dragPan.disable();
    const rect = stage.getBoundingClientRect();
    const snapshot = JSON.stringify({ scene: scene(), audio: project.audio || [] });
    dragging = { ...target, moved: false, x0: e.originalEvent.clientX, y0: e.originalEvent.clientY };
    stage.classList.add('dragging');
    const move = (ev) => {
      if (!dragging.moved && Math.hypot(ev.clientX - dragging.x0, ev.clientY - dragging.y0) < 3) return;
      dragging.moved = true;
      const ll = map.unproject([ev.clientX - rect.left, ev.clientY - rect.top]);
      if (dragging.kind === 'lmove') {
        const Lm = layerById(dragging.id);
        const q = Lm && quadOf(Lm);
        if (q) { Lm.geom = quadGeom(moveQuad(q, ll.lng - dragging.last[0], ll.lat - dragging.last[1])); dragging.last = [ll.lng, ll.lat]; }
      } else if (dragging.kind === 'vertex' || dragging.kind === 'lpoint') {
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
      if (dragging.kind === 'vertex' || dragging.kind === 'lpoint') models?.update(scene(), null, layerTiming);
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
      if ((d.kind === 'vertex' || d.kind === 'lpoint' || d.kind === 'lmove')) {
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
      const gz = hits.gizmo && hitGizmo(hits.gizmo, p, overlay.width / stage.clientWidth);
      stage.classList.toggle('on-rotate', gz === 'rotate');
      stage.classList.toggle('on-scale', gz === 'scale');
      const onH = !!gz || !!hitBox(p) || hits.layerHandles.some((q) => (q.x - p[0]) ** 2 + (q.y - p[1]) ** 2 <= r * r);
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
        <label class="row"><span>Speed <small class="muted" data-speed-out>${(+leg.speed || 1).toFixed(2)}×</small></span><input type="range" min="0.2" max="4" step="0.05" data-speed value="${+leg.speed || 1}"/></label>
        <p class="note small">Slower or faster than the other legs — the line takes longer or shorter on this part.</p>
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
    if (e.target.matches('[data-speed]')) leg.speed = +e.target.value;
    commit();
  });
  $('#leg-pop').addEventListener('input', (e) => {
    if (!e.target.matches('[data-speed]')) return;
    const o = $('#leg-pop [data-speed-out]');
    if (o) o.textContent = `${(+e.target.value).toFixed(2)}×`;
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
    if (!model.fit) { toast('Nothing on the map yet — draw a route or add a layer'); return; }
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
  /** "25.2, 55.27", "25.2 N 55.27 E", "25°12'N 55°16'E" → [lat, lng] */
  function parseCoords(q) {
    const dms = /(-?\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*['′]\s*)?(?:(\d+(?:\.\d+)?)\s*["″]\s*)?([NSEW])?/gi;
    const parts = [...q.matchAll(dms)];
    if (parts.length === 2) {
      const v = parts.map((m) => { let d = +m[1] + (+m[2] || 0) / 60 + (+m[3] || 0) / 3600; if (/[SW]/i.test(m[4] || '')) d = -d; return { d, h: (m[4] || '').toUpperCase() }; });
      let [a, b] = v;
      if (a.h === 'E' || a.h === 'W') [a, b] = [b, a];
      return [a.d, b.d];
    }
    const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*([NS])?[\s,;]+(-?\d+(?:\.\d+)?)\s*([EW])?$/i);
    if (!m) return null;
    let lat = +m[1], lng = +m[3];
    if (/S/i.test(m[2] || '')) lat = -lat;
    if (/W/i.test(m[4] || '')) lng = -lng;
    if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) [lat, lng] = [lng, lat];
    return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
  }
  async function runSearch(q) {
    if (!q) return;
    const seq = ++searchSeq;
    const ul = $('#search-results');
    const c = parseCoords(q);
    if (c) {
      results = [{ name: `${c[0].toFixed(5)}, ${c[1].toFixed(5)}`, detail: 'Latitude, longitude — fly there', lat: c[0], lng: c[1], coord: true }];
      ul.innerHTML = `<li data-i="0"><b>📍 ${esc(results[0].name)}</b><small>${results[0].detail}</small></li>`;
      return;
    }
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
    // Earth-style flight: zoom out, travel, zoom in
    userIntent = true;
    if (r.bbox && !r.coord) {
      const c = fitCamera(r.bbox, frame.w, frame.h, 0.2);
      map.flyTo({ center: c.center, zoom: c.zoom, bearing: 0, pitch: +scene().camera.tilt || 0, duration: 2600, curve: 1.6, essential: true });
    } else map.flyTo({ center: [r.lng, r.lat], zoom: 13, duration: 2600, curve: 1.6, essential: true });
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
  function showHint(text) {
    const h = $('#stage-hint');
    h.innerHTML = `<span class="sh-dot"></span><span class="sh-t">${esc(text)}</span><span class="sh-n"></span><span class="sh-btns"><button type="button" class="sh-b" data-sh="undo">↶ Undo point</button><button type="button" class="sh-b primary" data-sh="finish">✓ Finish</button><button type="button" class="sh-b" data-sh="cancel">Cancel</button></span>`;
    h.hidden = false;
    updateDrawBar();
  }
  function updateDrawBar() {
    const h = $('#stage-hint');
    if (h.hidden || !h.querySelector('.sh-btns')) return;
    const multi = !!drawing && !drawing.single && !drawing.freehand;
    const n = drawing?.coords?.length || 0;
    const min = drawing?.polygon ? 3 : 2;
    h.querySelector('[data-sh="undo"]').hidden = !multi || !n;
    const fin = h.querySelector('[data-sh="finish"]');
    fin.hidden = !multi; fin.disabled = n < min;
    h.querySelector('.sh-n').textContent = multi ? `${n} point${n === 1 ? '' : 's'}${n < min ? ` · ${min - n} more needed` : ' · ready'}` : '';
    h.querySelector('[data-sh="cancel"]').hidden = !(drawing || placing);
  }
  $('#stage-hint').addEventListener('mousedown', (e) => e.stopPropagation());
  $('#stage-hint').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sh]');
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.sh === 'finish') finishDrawing();
    else if (b.dataset.sh === 'undo') { drawing?.coords.pop(); repaint(); updateDrawBar(); }
    else { stopPlacing(); cancelDrawing(); }
  });

  function startAdd(kind, preset = null) {
    cancelDrawing();
    if (kind === 'symbol') { openSymbols(); return; }
    if (kind === 'caption') { addLayer(newLayer('caption', null, { start: newStart() })); return; }
    if (kind === 'freehand' || kind === 'freearea') {
      setViewMode('edit');
      drawing = { kind: kind === 'freearea' ? 'area' : 'line', coords: [], polygon: kind === 'freearea', freehand: true };
      stage.classList.add('placing');
      showHint('Hold the mouse button and draw on the map · Esc to cancel');
      $$('#add-layer [data-add]').forEach((b) => b.classList.toggle('active', b.dataset.add === kind));
      return;
    }
    if (kind === 'image' || kind === 'compare' || kind === 'timeseries') { cancelDrawing(); geoPick = { mode: 'new', kind }; $('#file-geoimg').click(); return; }
    if (kind === 'wayback') { cancelDrawing(); addWayback(); return; }
    let pathModel = false;
    if (kind === 'model3dpath') { kind = 'model3d'; pathModel = true; }
    if (kind === 'treerow') { kind = 'trees'; pathModel = true; }
    let geomOverride = null;
    if (kind === 'crowdline') { kind = 'crowd'; geomOverride = 'line'; }
    if (kind === 'crowdarea') { kind = 'crowd'; geomOverride = 'polygon'; }
    if (kind === 'affectedarea') { kind = 'affected'; geomOverride = 'polygon'; }
    if (!pathModel && !LAYER_KINDS[kind].geom) { addLayer(newLayer(kind, null, { start: newStart() })); return; }
    setViewMode('edit');
    const g = geomOverride || (pathModel ? 'line' : LAYER_KINDS[kind].geom);
    drawing = { kind, coords: [], polygon: g === 'polygon', single: g === 'point', preset, pathModel };
    stage.classList.add('placing');
    showHint(HINTS[g]);
    $$('#add-layer [data-add]').forEach((b) => b.classList.toggle('active', b.dataset.add === (preset ? 'symbol' : kind)));
  }
  function startFreehand(e) {
    map.dragPan.disable();
    const rect = stage.getBoundingClientRect();
    const pts = [];
    const add = (cx, cy) => { const ll = map.unproject([cx - rect.left, cy - rect.top]); pts.push([+ll.lng.toFixed(6), +ll.lat.toFixed(6)]); drawing.coords = pts; repaint(); };
    add(e.originalEvent.clientX, e.originalEvent.clientY);
    const move = (ev) => add(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      map.dragPan.enable();
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      const tol = (2.5 * 360) / (512 * 2 ** map.getZoom());
      let c = simplify(pts, tol);
      if (c.length < (drawing.polygon ? 3 : 2)) { toast('Draw a longer stroke'); drawing.coords = []; repaint(); return; }
      drawing.coords = c;
      finishDrawing();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
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
    if (d.kind === '_fencepath') {
      const T = layerById(d.target);
      if (d.coords.length < 2) { toast('Add at least 2 points'); return; }
      cancelDrawing();
      if (T) { pushUndo(); T.style.path = d.coords.slice(); selLayer = T.id; commitLayers(); renderLayerEditor(); }
      return;
    }
    let geom;
    if (d.polygon) {
      if (d.coords.length < 3) { toast('Add at least 3 points'); return; }
      geom = { type: 'Polygon', coordinates: [[...d.coords, d.coords[0]]] };
    } else if (!d.single) {
      if (d.coords.length < 2) { toast('Add at least 2 points'); return; }
      geom = { type: 'LineString', coordinates: d.coords };
    } else geom = { type: 'Point', coordinates: d.coords[0] };
    const L = newLayer(d.kind, geom, { start: newStart(), preset: d.preset });
    if (pendingStyle) { Object.assign(L.style, pendingStyle); pendingStyle = null; }
    if (L.style.anim) { L.anim = L.style.anim; delete L.style.anim; }
    if (L.kind === 'smartmap' && !(L.style.data || []).length) {
      const n = { rings: 40, reach: 24, halo: 24, circles: 60 }[L.style.mode] || 180;
      L.style.data = sampleData(L.geom.coordinates[0], n, Math.floor(Math.random() * 1000));
      L.style.dataName = 'sample data';
      L.name = { cells: 'Population (mosaic)', glow: 'Income (hot spots)', rings: 'Potential sites', reach: 'Drive times', halo: 'Projected revenue', heat: 'Heat map', circles: 'Sized circles' }[L.style.mode] || 'Smart map';
      toast('Filled with sample data — load your own CSV / GeoJSON in the layer settings', 4200);
    }
    if (L.kind === 'pressure') { L.name = L.style.type === 'H' ? 'High pressure' : 'Low pressure'; if (L.style.type === 'H') L.style.hpa = 1032; }
    if (L.kind === 'front') L.name = FRONT_TYPES_NAMES[L.style.type] || 'Front';
    if (d.pathModel && L.kind === 'model3d') { if (!['takeoff', 'landing'].includes(L.style.motion)) L.style.motion = 'move'; L.name = L.style.motion === 'takeoff' ? 'Plane taking off' : L.style.motion === 'landing' ? 'Plane landing' : '3D model on a path'; L.duration = L.style.motion === 'takeoff' || L.style.motion === 'landing' ? 9 : 6; }
    if (d.pathModel && L.kind === 'trees') L.name = 'Tree row';
    if (L.kind === 'geofence') { L.style.path = defaultFencePath(geom); toast('A sample vehicle path crosses the zone — use “Draw the vehicle’s path” to draw your own', 4600); }
    if (L.kind === 'netroute') { const on = ['car', 'bike', 'foot', 'train', 'plane'].filter((k) => L.style[k]).map((k) => NET_MODES[k].name.toLowerCase()); L.name = `Route by ${on.join(', ')}`; }
    if (L.kind === 'servicearea') L.name = `Service area · ${{ car: 'drive', bike: 'cycle', foot: 'walk', buffer: 'buffer' }[L.style.mode] || ''}`;
    if (L.kind === 'odflow') L.name = `OD flows (${geom.coordinates.length - 1} destinations)`;
    if (L.kind === 'trees' && !d.pathModel && map.getPitch() < 20) toast('Tilt the map (Camera step) to see the trees standing up in 3D', 3600);
    cancelDrawing();
    addLayer(L);
    if (L.kind === 'videofx' && !L.style.media) $('#file-video').click();
  }
  function addLayer(L) {
    pushUndo();
    layersOf().push(L);
    selLayer = L.id;
    showLayerPane('list');
    commitLayers();
    renderLayerEditor();
    if (L.kind === 'label' || L.kind === 'caption') setTimeout(() => { const i = $('#layer-editor [data-b="style.text"]'); i?.focus(); i?.select(); }, 30);
  }
  function commitLayers() {
    rebuild();
    renderLayerList();
    renderCamSelects();
    floods?.sync(scene()).then(() => { applyTimeEffects(viewMode === 'play' ? time : null); repaint(); renderFloodInfo(); });
    models?.sync(scene()).then(() => { applyTimeEffects(viewMode === 'play' ? time : null); repaint(); });
    wayback?.sync(scene()); affected?.sync(scene()); twin?.sync(scene()); applyTimeEffects(viewMode === 'play' ? time : null);
    preloadImages(scene()).then(repaint);
    eventsCache = null;
    if (layersOf().some((L) => NET_SET.has(L.kind))) scheduleNet();
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
      if (drawing.kind === 'netroute' && drawing.coords.length >= 2) { finishDrawing(); return; }
      repaint();
      updateDrawBar();
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
    if (selLayer) showLayerPane('list');
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
  function showLayerPane(p) {
    $$('#lp-tabs [data-pane]').forEach((b) => b.classList.toggle('active', b.dataset.pane === p));
    $$('.step-page[data-page="layers"] .lp-pane').forEach((el) => el.classList.toggle('active', el.dataset.pane === p));
  }
  $('#layer-list').addEventListener('click', (e) => { if (e.target.closest('[data-go-add]')) showLayerPane('add'); });
  $('#lp-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-pane]'); if (b) showLayerPane(b.dataset.pane); });
  initModernUI({ goLayers: () => { if (step !== 'layers') setStep('layers'); showLayerPane('add'); } });
  function renderLayerList() {
    const ls = layersOf();
    $('#layer-count').textContent = ls.length;
    $('#layer-count-tab').textContent = ls.length;
    $('#layer-list').innerHTML = ls.length ? ls.map((L) => `
      <li data-id="${L.id}" class="${L.id === selLayer ? 'active' : ''} ${L.hidden ? 'off' : ''}">
        <span class="ki">${L.kind === 'point' && L.style.marker === 'emoji' ? L.style.emoji : LAYER_KINDS[L.kind].icon}</span>
        <span class="nm">${esc(L.kind === 'caption' || L.kind === 'label' ? (L.style.text || L.name) : L.name)}</span>
        <small>${(+L.start).toFixed(1)}s</small>
        <button class="mini" data-eye title="${L.hidden ? 'Show' : 'Hide'}">${L.hidden ? '◌' : '◉'}</button>
      </li>`).join('') : '<li class="empty"><div class="empty-card"><span class="ec-ico">🗺️</span><b>No layers yet</b><span>Add points, areas, routes, drive-time zones, titles, weather and more.</span><button type="button" class="btn primary sm" data-go-add>＋ Add a layer</button></div></li>';
  }
  $('#layer-list').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const L = layerById(li.dataset.id);
    if (e.target.closest('[data-eye]')) { pushUndo(); L.hidden = !L.hidden; commitLayers(); return; }
    selectLayer(L.id);
  });
  $('#add-layer').addEventListener('click', (e) => { const b = e.target.closest('[data-add]'); if (b) startAdd(b.dataset.add); });
  $('#add-fx').addEventListener('click', (e) => { const b = e.target.closest('[data-add]'); if (b) startAdd(b.dataset.add); });
  $('#upload-model-btn').onclick = () => $('#file-model').click();
  $('#add-img').addEventListener('click', (e) => { const b = e.target.closest('[data-add]'); if (b) startAdd(b.dataset.add); });
  $('#add-nature').addEventListener('click', (e) => { const b = e.target.closest('[data-add]'); if (b) startAdd(b.dataset.add); });
  $('#add-3d').addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    const st = {};
    if (b.dataset.a) { st.modelA = b.dataset.a; st.modelB = b.dataset.b; }
    if (b.dataset.source) st.source = b.dataset.source;
    if (b.dataset.scenario) st.scenario = b.dataset.scenario;
    if (b.dataset.source === 'builtin:hst') { st.livery = 'ave'; st.cars = 6; st.sizeMode = 'real'; st.size = 1; }
    if (/train|ship|tanker|truck|car/.test(b.dataset.source || '') && b.dataset.source !== 'builtin:hst') st.size = 1.6;
    if (/hst/.test(`${st.modelA}${st.source}`) && map.getZoom() < 14.5) toast('Real-size trains: zoom in close (street level) and tilt the camera to see them', 4600);
    if (b.dataset.source === 'builtin:bomber' || b.dataset.source === 'builtin:nasa_globalhawk') st.altitude = 60;
    pendingStyle = Object.keys(st).length ? st : null;
    startAdd(b.dataset.add);
    if (map.getPitch() < 25) toast('Tip: tilt the camera (Camera step) to see the 3D models from the side', 3600);
  });
  // network analysis
  $('#add-net').addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    let st = null;
    try { st = b.dataset.preset ? JSON.parse(b.dataset.preset) : null; } catch { st = null; }
    pendingStyle = st;
    startAdd(b.dataset.add);
    const tip = { servicearea: 'Click the map where the zones start (e.g. a hospital or shop)', odflow: 'Click the origin first, then each destination — then press Finish', netroute: 'Click the start (A), then the end (B)', geofence: 'Click around the zone — then press Finish' }[b.dataset.add];
    if (tip) showHint(tip);
  });
  // smart maps: data layers over a region, legends, info cards
  const SM_NAMES = { cells: 'Population (mosaic)', glow: 'Income (hot spots)', rings: 'Potential sites', reach: 'Drive times', halo: 'Projected revenue', heat: 'Heat map', circles: 'Sized circles' };
  function sitesFrom(data, n) {
    const sorted = [...data].sort((a, b) => (+b[2] || 0) - (+a[2] || 0));
    const out = [];
    for (const d of sorted) { if (out.length >= n) break; if (out.every((o) => Math.hypot(o[0] - d[0], o[1] - d[1]) > 0.02)) out.push(d); }
    return out;
  }
  $('#add-smart').addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    let st = null;
    try { st = b.dataset.preset ? JSON.parse(b.dataset.preset) : null; } catch { st = null; }
    const k = b.dataset.add;
    if (k === 'nightroads') {
      pushUndo();
      const sc = scene();
      Object.assign(sc.look, { theme: 'nightroads', placeNames: false, buildings3d: false, terrain: false, shading: true });
      sc.camera.tilt = Math.max(+sc.camera.tilt || 0, 45);
      applyLook(sc); renderLookControls(); save();
      toast('Night roads map with a 45° tilt — glowing roads on dark relief', 3600);
      return;
    }
    if (k === 'smartmap') {
      const prev = [...layersOf()].reverse().find((x) => x.kind === 'smartmap' && x.geom);
      if (prev) {
        // reuse the region and data of the last smart map
        cancelDrawing();
        const L = newLayer('smartmap', JSON.parse(JSON.stringify(prev.geom)), { start: newStart() });
        if (st?.anim) { L.anim = st.anim; delete st.anim; }
        Object.assign(L.style, st || {});
        const sitesLayer = [...layersOf()].reverse().find((x) => x.kind === 'smartmap' && x.style.mode === 'rings');
        const base = prev.style.mode === 'rings' || prev.style.mode === 'reach' || prev.style.mode === 'halo' ? (layersOf().find((x) => x.kind === 'smartmap' && !['rings', 'reach', 'halo'].includes(x.style.mode))?.style.data || prev.style.data) : prev.style.data;
        L.style.data = ['rings', 'reach', 'halo'].includes(L.style.mode) ? (sitesLayer && sitesLayer !== L ? sitesLayer.style.data.slice() : sitesFrom(base || [], L.style.mode === 'rings' ? 40 : 24)) : (base || []).slice();
        L.style.dataName = prev.style.dataName || '';
        L.name = SM_NAMES[L.style.mode] || 'Smart map';
        addLayer(L);
        toast(`${L.name} added over the same region and data`, 3000);
        return;
      }
      pendingStyle = st;
      startAdd('smartmap');
      showHint('Click around the region (a state, a city…) — then press Finish');
      return;
    }
    pendingStyle = st;
    startAdd(k);
    if (k === 'infocard') showHint('Click the place the card stands on');
  });
  // people, crowds, hazard zones and digital twins
  for (const sel of ['#add-people', '#add-hazard', '#add-twin']) $(sel).addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    let st = null;
    try { st = b.dataset.preset ? JSON.parse(b.dataset.preset) : null; } catch { st = null; }
    pendingStyle = st;
    const k = b.dataset.add;
    if (b.dataset.source) { pendingStyle = { ...(pendingStyle || {}), source: b.dataset.source }; }
    if (k === 'twin') {
      const sc = scene();
      if (!['dark', 'fiord', 'neon', 'synthwave', 'deepocean', 'blueprint'].includes(sc.look.theme)) {
        pushUndo();
        Object.assign(sc.look, { theme: 'dark', placeNames: false, buildings3d: false });
        applyLook(sc);
        toast('Map switched to Dark for the digital-twin look — change it in Look. Click the centre of the city.', 5200);
      }
    }
    startAdd(k);
    const tip = { crowdline: 'Click the route of the march — then press Finish', crowdarea: 'Click around the area — then press Finish', wildfire: 'Click around the area that burns — then press Finish', deforest: 'Click around the forest — then press Finish', affectedarea: 'Click around the affected area — then press Finish', blastzone: 'Click ground zero', affected: 'Click the centre of the affected area', crowd: 'Click where the people are', twin: 'Click the centre of the city — the model rises from there', sensor: 'Click where the sensor is', model3dpath: 'Click the path (e.g. along the runway, then into the sky) — then press Finish', odflow: 'Click the origin first, then each destination — then press Finish' }[k];
    if (tip) showHint(tip);
    if (/affected|blastzone|twin/.test(k) && map.getZoom() < 13.5) toast('Buildings show from street level — zoom in to a city (zoom 14+) and tilt the camera', 4600);
    if (/crowd/.test(k) && map.getPitch() < 20) toast('Tilt the camera to see the people standing up', 3600);
  });
  // computing network analysis results (service areas, routes) in the background
  let netTimer = null, netBusy = false;
  function scheduleNet(delay = 700) { clearTimeout(netTimer); netTimer = setTimeout(runNet, delay); }
  async function runNet() {
    if (netBusy) { scheduleNet(500); return; }
    const todo = project.scenes.flatMap((sc) => sc.layers || []).filter((L) => netNeedsCompute(L) && L.style.resultTry !== netSig(L));
    if (!todo.length) return;
    netBusy = true;
    for (const L of todo) {
      const sig = netSig(L);
      L.style.resultTry = sig;
      L.style.resultBusy = true; if (selLayer === L.id) renderNetStatus(L);
      try {
        const r = await computeNet(L);
        if (netSig(L) === sig) { L.style.result = r; L.style.resultSig = sig; L.style.resultErr = ''; }
        if (r?.approx || r?.errors?.length || r?.routes?.some((x) => x?.est)) toast('Routing service not reachable — showing estimates. Open the layer and press “Compute again” to retry.', 5200);
      } catch (err) {
        console.warn('network analysis failed', err);
        if (netSig(L) === sig) L.style.resultErr = 'Could not reach the routing service — check your connection and press Try again.';
      }
      L.style.resultBusy = false;
      if (selLayer === L.id) renderNetStatus(L);
      eventsCache = null;
      repaint(); save();
    }
    netBusy = false;
    if (project.scenes.some((sc) => (sc.layers || []).some((L) => netNeedsCompute(L) && L.style.resultTry !== netSig(L)))) scheduleNet(100);
  }
  function netStatusHTML(L) {
    const s = L.style;
    if (L.kind === 'geofence') {
      const ev = fenceEvents({ ...L, style: { ...s, path: s.path || defaultFencePath(L.geom) } }).events;
      return `${ev.length ? `The vehicle crosses the zone border ${ev.length} time${ev.length === 1 ? '' : 's'} (${ev.map((e) => (e.enter ? 'enter' : 'exit')).join(', ')}).` : 'The vehicle path does not cross the zone yet — draw a new path.'}`;
    }
    if (s.resultBusy) return '<span class="spin"></span> Computing…';
    if (s.resultErr && s.resultSig !== netSig(L)) return `<span class="warn">${esc(s.resultErr)}</span>`;
    const r = s.result;
    if (!r) return L.kind === 'odflow' && s.path !== 'road' && s.labels !== 'time' ? 'Arcs need no routing. Pick “Real roads” to follow the roads.' : 'Waiting…';
    if (L.kind === 'servicearea') return r.approx ? '<span class="warn">The routing service could not be reached, so these zones are an estimate from typical speeds.</span> Press “Compute again” to retry.' : `✓ ${r.zones.length} zone${r.zones.length === 1 ? '' : 's'}${r.source ? ` · real road network (${esc(r.source)})` : ' · straight-line rings'}. Saved in the project.`;
    if (L.kind === 'netroute') return Object.entries(r.modes).map(([k, m]) => `${NET_MODES[k].icon} ${fmtLen(m.dist, s.units)} · ${fmtDur(m.dur)}${m.est ? ' <span class="warn">(estimate)</span>' : ' ✓'}`).join('<br>') + (r.errors?.length ? `<br><span class="warn">Routing service not reachable for ${esc(r.errors.join(', '))} — estimates shown. Press “Compute again” to retry.</span>` : '');
    if (L.kind === 'odflow') { const ok = r.routes.filter((x) => x?.coords).length; return ok === r.routes.length ? `✓ ${ok} road routes found.` : `<span class="warn">${ok} of ${r.routes.length} road routes found — the rest are shown as arcs with estimated times.</span>`; }
    return '';
  }
  function renderNetStatus(L) { const el = $('#net-status'); if (el) el.innerHTML = netStatusHTML(L); }
  function renderNetTools(L) {
    const s = L.style;
    let h = '<h5>Analysis</h5><div class="net-status" id="net-status">' + netStatusHTML(L) + '</div>';
    const find = (which, ph, label) => `<div class="net-find"><span>${label}</span><input type="search" id="net-q-${which}" placeholder="${ph}" /><button class="btn sm" data-act="netFind" data-which="${which}">Find</button></div>`;
    if (L.kind === 'servicearea') h += find('place', 'Search a place…', 'Move to');
    if (L.kind === 'netroute') h += find('from', 'Start — e.g. Dubai Mall', 'A') + find('to', 'End — e.g. Abu Dhabi', 'B');
    if (L.kind === 'odflow') h += find('origin', 'Origin…', 'Origin') + find('dest', 'Add a destination…', '+ Dest.');
    if (L.kind === 'geofence') h += `<div class="btn-row"><button class="btn sm" data-act="fencePath">Draw the vehicle’s path</button><button class="btn sm" data-act="fenceReset">Reset path</button></div>` + fRow('Preview position while editing', fRange('style.editAt', s.editAt ?? 0.5, 0, 1, 0.01));
    if (L.kind !== 'geofence') h += `<div class="btn-row"><button class="btn sm" data-act="netRun">${s.result ? 'Compute again' : 'Try again'}</button></div>`;
    h += '<p class="hint-line">' + ({ servicearea: 'Drag the place on the map to move it — the zones are computed again. Routing: FOSSGIS Valhalla / OSRM (OpenStreetMap).', odflow: 'The first point is the origin; every other point is a destination. Drag points to move them.', netroute: 'Car, bicycle and walking follow real roads and paths (OpenStreetMap). Train and plane times are estimates from average speeds.', geofence: 'Drag the zone corners to reshape it. Alerts fire when the vehicle crosses the border.' }[L.kind] || '') + '</p>';
    return h;
  }
  // weather
  const mapPx = () => 1;
  $('#add-weather').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    const kind = b.dataset.add;
    if (kind === 'forecast') {
      cancelDrawing();
      const L = newLayer('forecast', null, { start: newStart() });
      L.style.look = b.dataset.look;
      const T = {
        days: ['Weather forecast', L.style.data],
        cities: ['Today', 'Dubai | sunny | 38\nAbu Dhabi | hot | 41\nSharjah | partly | 36\nAl Ain | dust | 39\nFujairah | showers | 31'],
        now: ['Now', 'Dubai | partly | 34 | Feels like 39° · Humid\nWind: 22 km/h NW\nHumidity: 64 %\nUV index: 9 (very high)'],
        warning: ['', 'Heavy rain and thunderstorms · Winds up to 70 km/h · Stay indoors'],
      }[b.dataset.look];
      if (T) [L.style.title, L.style.data] = T;
      if (b.dataset.look === 'warning') { L.style.position = 'top'; L.hold = 5; }
      L.name = { days: 'Forecast (days)', cities: 'Cities forecast', now: 'Current weather', warning: 'Weather warning' }[b.dataset.look];
      addLayer(L);
      return;
    }
    if (kind === 'wxfield') {
      cancelDrawing();
      const q = fitQuad(frame.h / frame.w, 1.1, 1.1);
      const ring = [q[0], q[1], q[2], q[3], q[0]].map((c) => [+c[0].toFixed(5), +c[1].toFixed(5)]);
      const L = newLayer('wxfield', { type: 'Polygon', coordinates: [ring] }, { start: newStart() });
      L.style.field = b.dataset.field;
      L.name = { temp: 'Temperature', rain: 'Rainfall radar', wind: 'Wind', humidity: 'Humidity' }[b.dataset.field];
      if (b.dataset.field === 'rain') { L.style.opacity = 0.85; L.style.labels = false; }
      if (b.dataset.field === 'wind') { L.style.max = 60; L.style.opacity = 0.55; }
      addLayer(L);
      toast('Covers the view — drag its corners to change the area, or set Data to “Live now”', 4200);
      return;
    }
    if (kind === 'livesat' || kind === 'radar') {
      cancelDrawing();
      const L = newLayer('timeseries', null, { start: newStart() });
      const c = map.getCenter();
      Object.assign(L.style, { source: 'livesat', sat: kind === 'radar' ? 'radar' : satForLongitude(c.lng), satMode: 'loop', hours: 3, step: kind === 'radar' ? 10 : 30, frames: [], opacity: kind === 'radar' ? 0.8 : 0.85, position: 'top-right', labelSize: 0.55, bar: true });
      L.name = kind === 'radar' ? 'Weather radar (live)' : 'Live satellite';
      addLayer(L);
      try {
        const fr = await satFrames(L.style.sat, { mode: 'loop', hours: 3, step: L.style.step });
        L.style.frames = fr; L.style.credit = SAT_CREDITS[SAT_PRODUCTS[L.style.sat].src];
        L.style.per = fr.length > 1 ? +(Math.min(0.6, 8 / fr.length)).toFixed(2) : 4; L.style.fade = +(L.style.per * 0.6).toFixed(2);
        setSeriesDuration(L);
        if (selLayer === L.id) renderLayerEditor();
        commitLayers();
        if (map.getZoom() > 7) toast('Zoom out to see the clouds — satellites show about 2–4 km detail', 4200);
      } catch { toast('Could not load the satellite list', 4200); }
      return;
    }
    if (kind === 'liveweather') {
      cancelDrawing();
      const k = mapPx();
      const cities = visibleCities(map, { x: frame.x, y: frame.y, w: frame.w, h: frame.h }, 8);
      if (!cities.length) { toast('No city names visible — turn on Place names (Look) or zoom in a little', 4200); return; }
      toast(`Getting live weather for ${cities.length} cities…`);
      try {
        const wx = await liveWeather(cities);
        pushUndo();
        const start = newStart();
        cities.forEach((c, i) => {
          const L = newLayer('wxpoint', { type: 'Point', coordinates: [+c.ll[0].toFixed(5), +c.ll[1].toFixed(5)] }, { start: +(start + i * 0.15).toFixed(2) });
          Object.assign(L.style, { icon: wx[i].icon, temp: String(wx[i].temp), name: c.name, size: 0.8 });
          L.name = `${c.name} ${wx[i].temp}°`;
          layersOf().push(L);
        });
        const P = newLayer('forecast', null, { start });
        P.style.look = 'cities'; P.style.title = `Now · ${new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}`;
        P.style.data = cities.map((c, i) => `${c.name} | ${wx[i].icon} | ${wx[i].temp}`).join('\n');
        P.name = 'Live weather (cities)';
        layersOf().push(P);
        const D = newLayer('forecast', null, { start });
        D.style.look = 'days'; D.style.title = `${cities[0].name} · next days`; D.hidden = true;
        D.style.data = wx[0].days.map((d) => `${d.day} | ${d.icon} | ${d.hi} | ${d.lo}`).join('\n');
        D.name = `${cities[0].name} forecast (hidden)`;
        layersOf().push(D);
        selLayer = P.id;
        commitLayers(); renderLayerEditor();
        toast('Live weather added from Open-Meteo — a 5-day forecast for the first city is in the list (hidden)', 4800);
      } catch { toast('Could not load live weather — check your connection', 4200); }
      return;
    }
    pendingStyle = b.dataset.type ? { type: b.dataset.type } : null;
    startAdd(kind);
  });
  // titles, TV news, effects and videos (screen layers)
  for (const sel of ['#add-titles', '#add-effects']) $(sel).addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    cancelDrawing();
    const kind = b.dataset.add;
    const L = newLayer(kind, null, { start: newStart() });
    const lk = b.dataset.look;
    if (lk) L.style.look = lk;
    if (kind === 'title') {
      L.name = TITLE_LOOKS[lk] || 'Title';
      const T = {
        opener: ['YOUR STORY', 'A FILM BY YOUR NAME', 'Cinzel'], cinematic: ['THE JOURNEY', 'BASED ON A TRUE ROUTE', 'Archivo'], glitch: ['SIGNAL LOST', 'TRANSMISSION 07', 'Archivo'],
        chapter: ['The Desert Crossing', 'CHAPTER ONE', 'Playfair Display'], location: ['DUBAI, UAE', `${fmtLatLon(map.getCenter())} · ${new Date().getFullYear()}`, ''],
        credits: ['', '', 'Inter'], quote: ['The journey is the destination', 'Ancient proverb', 'Playfair Display'], ending: ['THE END', 'Thanks for watching', 'Cinzel'],
      }[lk];
      if (T) [L.style.text, L.style.sub, L.style.font] = T;
      if (lk === 'credits') { L.duration = 10; L.hold = 0.5; }
      if (lk === 'explainer') { Object.assign(L.style, { text: 'URDA', sub: 'The collision on the Madrid–Seville line', date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), lines: 'Toledo\nCastilla-La Mancha', font: 'Inter', color: '#ffffff', accent: '#e53935', bg: '#0a0f15', side: 'left' }); L.duration = 1.2; L.hold = 0; }
      if (lk === 'location') { L.duration = 2; L.hold = 2.5; }
      if (lk === 'ending') { L.duration = 3; L.hold = 0; L.style.dim = 0.5; }
      if (lk === 'opener' || lk === 'cinematic') L.style.dim = 0.25;
    }
    if (kind === 'news') { L.name = NEWS_LOOKS[lk] || 'News'; if (lk === 'breaking' || lk === 'headline') { L.duration = 1; L.hold = 5; } }
    if (kind === 'hudtext') {
      const ts = b.dataset.ts || 'classic';
      L.name = { classic: 'News ticker', red: 'News ticker (red)', navy: 'News ticker (navy)', white: 'News ticker (white)', twoline: 'Headline + ticker', flip: 'Rolling headlines', finance: 'Stock ticker', sports: 'Sports scores', flash: 'Breaking crawl' }[ts] || 'News ticker';
      Object.assign(L.style, { look: 'ticker', tickerStyle: ts, text: 'Satellite imagery confirms new construction\nRescue teams reach the flooded district\nMarkets close higher\nMore updates to follow', position: 'bottom', color: '#d71920', label: 'BREAKING', clock: '20:45', upper: true, bold: true });
      if (ts === 'classic') Object.assign(L.style, { bg: '#0b0d12', tagBg: '#d71920', textColor: '#ffffff' });
      if (ts === 'twoline') Object.assign(L.style, { headline: 'Heavy rain causes flooding across the region', label: 'LIVE', upper: false });
      if (ts === 'flip') Object.assign(L.style, { label: 'LATEST', clock: '', text: 'Rescue teams reach the flooded district\nRoads closed in the city centre\nSchools to stay shut tomorrow\nMore rain expected tonight', upper: false });
      if (ts === 'finance') Object.assign(L.style, { label: 'MARKETS', upper: true, sep: '|', text: 'AAPL 189.40 +1.2%\nMSFT 412.10 -0.4%\nTSLA 251.30 +3.1%\nBRENT 84.20 +0.8%\nGOLD 2345.10 -0.2%\nEUR/USD 1.0842 +0.1%' });
      if (ts === 'sports') Object.assign(L.style, { label: 'SCORES', upper: true, sep: '|', text: 'MAD 2 - 1 BAR\nLIV 0 - 0 ARS\nPSG 3 - 2 BAY\nJUV 1 - 1 INT' });
      if (ts === 'flash') Object.assign(L.style, { position: 'top', label: 'BREAKING' });
    }
    if (kind === 'video' && b.dataset.key) Object.assign(L.style, { key: b.dataset.key, fit: 'pip', width: 0.42, position: 'bottom-right', border: 0, radius: 0, shadow: false });
    if (kind === 'effect') { L.name = EFFECT_LOOKS[lk] || 'Effect'; if (lk === 'flash') { L.duration = 0.8; L.hold = 0.01; } if (lk === 'shake') { L.duration = 1.5; L.hold = 0.01; } if (lk === 'focus') { L.duration = 2; L.hold = 0.01; } if (lk === 'glitch') { L.duration = 1; L.hold = 0.5; } if (lk === 'hologram') { L.duration = 1; L.hold = 5; } }
    if (kind === 'video') L.name = 'Video';
    addLayer(L);
    if (L.style.font) loadFonts(scene()).then(repaint);
    if (kind === 'video') $('#file-video').click();
  });
  const addInfo = (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    if (b.dataset.add === 'target') { startAdd('target'); return; }
    cancelDrawing();
    const L = newLayer(b.dataset.add, null, { start: newStart() });
    if (b.dataset.type) {
      L.style.type = b.dataset.type;
      const T = { bar: ['Population (millions)', 'Dubai: 3.6\nAbu Dhabi: 1.5\nSharjah: 1.8\nAjman: 0.5', '', ' M'], line: ['Visitors per year', '2019: 16.7\n2020: 5.5\n2021: 7.3\n2022: 14.4\n2023: 17.2', '', ' M'], donut: ['Land use', 'Urban: 35\nDesert: 45\nFarmland: 12\nWater: 8', '', '%'], counter: ['Distance flown', 'Kilometres flown: 5432', '', ' km'], progress: ['Mission progress', 'Survey: 80\nImagery: 55\nAnalysis: 30', '', '%'] }[b.dataset.type];
      if (T) { [L.style.title, L.style.data, L.style.prefix, L.style.suffix] = T; L.name = T[0]; }
      if (b.dataset.type === 'counter') L.duration = 2.5;
    }
    if (b.dataset.anim) {
      L.anim = b.dataset.anim;
      const T = { glitch: ['Glitch text', 'SIGNAL INTERCEPTED', '#ff4d4d'], slice: ['Slice glitch', 'SYSTEM BREACH', '#ff3bd4'], scan: ['Scan reveal', 'AREA SCANNED', '#36d1ff'], redact: ['Redacted text', 'OPERATION NIGHTFALL', '#ffffff'], neon: ['Neon text', 'OPEN 24/7', '#ff4fd8'] }[b.dataset.anim];
      if (T) [L.name, L.style.text, L.style.color] = T;
      if (b.dataset.anim === 'redact') { L.style.sub = 'FILE 07 · EYES ONLY'; L.duration = 2.2; }
      if (b.dataset.anim === 'neon') { L.style.box = false; L.style.sub = ''; L.style.cursor = false; }
    }
    if (b.dataset.look) {
      L.style.look = b.dataset.look;
      const T = {
        telemetry: ['Telemetry', 'SPD: 420 KTS\nALT: 12500 FT\nHDG: 274\nFUEL: 64 %\nLINK: STRONG', 'top-left'],
        alert: ['Alert banner', 'INCOMING THREAT DETECTED', 'top'],
        terminal: ['Terminal', 'connect sat-link --secure\nhandshake ........ OK\ndownloading imagery 100%\naccess granted', 'bottom-left'],
        coords: ['Live coordinates', '', 'bottom-right'],
        stamp: ['Stamp', 'CLASSIFIED', 'top-right'],
        ticker: ['News ticker', 'Satellite imagery confirms new construction\nRescue teams reach the flooded district\nMore updates to follow', 'bottom'],
        morse: ['Morse code', 'SOS DE ALPHA ONE', 'bottom-left'],
        code: ['Code screen', '', 'full'],
      }[b.dataset.look];
      if (T) { [L.name, L.style.text, L.style.position] = T; }
      if (b.dataset.look === 'code') { Object.assign(L.style, { color: '#a46bff', speed: 1, bg: 0.88, size: 1 }); L.anim = 'fade'; L.duration = 0.6; L.hold = 5; }
      if (b.dataset.look === 'morse') { Object.assign(L.style, { color: '#ffb020', wpm: 15, label: 'MORSE · CW', wave: true }); L.anim = 'none'; L.duration = +(morseTimeline(L.style.text, 15).total + MORSE_DELAY + 0.3).toFixed(2); L.hold = 3; }
      if (b.dataset.look === 'stamp') L.anim = 'fade';
    }
    if (b.dataset.variant) {
      L.style.variant = b.dataset.variant;
      L.name = { drone: 'Drone HUD', satellite: 'Satellite HUD', target: 'Target lock', tactical: 'Tactical HUD', radar: 'Radar scope', thermal: 'Thermal camera', scanner: 'Terrain scanner', mission: 'Mission briefing', geoint: 'GEOINT drone feed', analytics: 'Real-time analytics', satscan: 'Satellite scan HUD', c2: 'Command & control wall', ops: 'Operations dashboard', sigint: 'Signals intercept' }[b.dataset.variant];
      if (b.dataset.variant === 'geoint') { Object.assign(L.style, { color: '#ffffff', label: 'GEOINT · EO/IR', tint: b.dataset.tint || 'blue', scan: true }); L.duration = 1.5; }
      if (b.dataset.variant === 'analytics') { Object.assign(L.style, { color: '#38e1ff', label: 'REAL-TIME ANALYTICS', sub: 'NEW YORK CITY BUSES', filter: 'ALL LINES', callout: true, heat: true, scroll: true }); L.anim = 'fade'; L.duration = 2.5; }
      if (b.dataset.variant === 'satscan') { Object.assign(L.style, { color: '#ffffff', label: 'NAC / WOEID', sub: 'NAVSTAR', right: 'SPREAD SPECTRUM', text: 'INTERVAL IDENTIFIER\nCALIBRATION\nCCT SOURCE\nGAIN CHANGE' }); L.duration = 2; }
      if (b.dataset.variant === 'c2') { Object.assign(L.style, { color: '#38d0ff', label: 'COMMAND & CONTROL · OPS CENTER', panels: true, lights: true, clock: '20:45' }); L.anim = 'boot'; L.duration = 3; }
      if (b.dataset.variant === 'ops') { Object.assign(L.style, { color: '#38d0ff', label: 'OPERATIONS DASHBOARD', status: 'THREAT LEVEL: ELEVATED', clock: '20:45' }); L.duration = 2; }
      if (b.dataset.variant === 'sigint') { Object.assign(L.style, { color: '#7CFF7C', label: 'SIGINT · INTERCEPT', text: SIGINT_DEFAULT, freq: '7.0235', wpm: 15, position: 'bottom' }); L.anim = 'fade'; L.duration = 0.6; L.hold = +(morseTimeline(SIGINT_DEFAULT, 15).total + 2.5).toFixed(1); }
      if (b.dataset.variant === 'thermal') { L.style.color = '#ffffff'; L.style.label = 'FLIR-1'; }
      if (b.dataset.variant === 'mission') { L.style.position = 'top-left'; L.style.label = 'MISSION BRIEFING'; L.duration = 4; }
      if (b.dataset.variant === 'radar') L.style.label = 'AIR SEARCH';
      if (b.dataset.variant === 'scanner') { L.style.label = 'ANALYZING TERRAIN'; L.duration = 6; }
      if (b.dataset.variant === 'tactical') L.style.label = 'TACTICAL';
      if (b.dataset.variant === 'satellite') { L.style.color = '#36d1ff'; L.style.label = 'SAT-01 LIVE'; }
      if (b.dataset.variant === 'target') { L.style.color = '#ff5a52'; L.style.label = 'TGT-07'; L.duration = 2; }
    }
    addLayer(L);
  };
  $('#add-info').addEventListener('click', addInfo);
  $('#add-mil')?.addEventListener('click', addInfo);
  // showcase elements (spectral, diorama, beams, viewshed, drone video…)
  $('#add-viz')?.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const k = b.dataset.add;
    if (k === 'hud' || k === 'hudtext') { addInfo(e); return; }
    if (b.dataset.ref) { $(b.dataset.ref)?.click(); return; }
    let st = null;
    try { st = b.dataset.preset ? JSON.parse(b.dataset.preset) : null; } catch { st = null; }
    cancelDrawing();
    if (!LAYER_KINDS[k]?.geom) {
      const L = newLayer(k, null, { start: newStart() });
      if (st) Object.assign(L.style, st);
      if (L.style.anim) { L.anim = L.style.anim; delete L.style.anim; }
      if (b.dataset.name) L.name = b.dataset.name;
      if (b.dataset.dur) L.duration = +b.dataset.dur;
      if (b.dataset.hold) L.hold = +b.dataset.hold;
      if (L.kind === 'title' && L.style.font) loadFonts(scene()).then(repaint);
      addLayer(L);
      return;
    }
    pendingStyle = st;
    startAdd(k);
    const tip = { tiles: 'Click around the area — then press Finish', vortex: 'Click the eye of the storm', vessel: 'Click the ship’s route — then press Finish', photocard: 'Click the place the picture belongs to', linecallout: 'Click the point the callout lines come from', detect: 'Click along the road — then press Finish', block: 'Click the corners of the area for the block — then press Finish (tilt the camera to see its sides)', mesh: 'Click around the area for the network — then press Finish', flowlines: 'Click along the valley or river — then press Finish', fmv: 'Click the drone’s flight path — then press Finish', beams: 'Click the hub the beams shoot out from', viewshed: 'Click the observer point (zoom in on a city with buildings)', datapin: 'Click where the marker goes', smartmap: 'Click around the region — then press Finish' }[k];
    if (tip) showHint(tip);
  });

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
    h += `<div class="btn-row speed-row"><span class="muted small">Speed</span><button class="btn sm" data-act="speed" data-k="2">½× slower</button><button class="btn sm" data-act="speed" data-k="1.25">Slower</button><button class="btn sm" data-act="speed" data-k="0.8">Faster</button><button class="btn sm" data-act="speed" data-k="0.5">2× faster</button></div>`;
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
      if (s.marker === 'sprite') h += fRow('Vehicle', fSel('style.sprite', s.sprite || 'jet', SPRITES)) + fRow('Heading (°)', fRange('style.heading', s.heading || 0, -180, 180, 1));
      if (s.marker === 'image') h += `<div class="btn-row"><button class="btn sm" data-act="markerImg">${s.image ? 'Change image…' : 'Choose image…'}</button><span class="muted small">PNG with see-through background works best</span></div>`;
      h += fRow('Colour', fColor('style.color', s.color)) + fRow('Size', fRange('style.size', s.size, 0.4, 3, 0.05)) + fRow('Effect', fSel('style.effect', s.effect, EFFECTS));
      h += `<label class="field"><span>Label</span>${fText('style.label', s.label, 'Optional text next to it')}</label>`;
      h += fRow('Label font', fSel('style.font', s.font || '', FONTS));
    } else if (L.kind === 'label') {
      h += `<label class="field"><span>Text</span>${fText('style.text', s.text)}</label>`;
      h += fRow('Font', fSel('style.font', s.font || '', FONTS));
      h += fRow('Size', fRange('style.size', s.size, 10, 90, 1)) + fRow('Colour', fColor('style.color', s.color)) + fRow('Outline', fColor('style.halo', s.halo || '#000000'));
      h += fRow('Weight', fSel('style.weight', s.weight, { 500: 'Regular', 700: 'Bold', 900: 'Black' })) + fRow('CAPITALS', fSw('style.upper', s.upper)) + fRow('Italic', fSw('style.italic', s.italic));
    } else if (L.kind === 'caption') {
      h += `<label class="field"><span>Text</span>${fText('style.text', s.text)}</label><label class="field"><span>Second line</span>${fText('style.sub', s.sub, 'Optional')}</label>`;
      h += fRow('Font', fSel('style.font', s.font || '', FONTS));
      h += fRow('Layout', fSel('style.layout', s.layout, CAPTION_LAYOUTS));
      h += fRow('Position', fSel('style.position', ['lowerThird', 'band'].includes(s.layout) && s.position !== 'custom' ? '' : s.position, ['lowerThird', 'band'].includes(s.layout) ? { '': 'Default', custom: POSITIONS.custom } : POSITIONS));
      h += fRow('Accent', fColor('style.accent', s.accent)) + fRow('Size', fRange('style.size', s.size || 1, 0.6, 1.8, 0.05));
      h += '<p class="hint-line">Use {km} or {mi} to show the distance travelled so far.</p>';
    }
    if (FX_FORMS[L.kind]) {
      h += '<h5>Settings</h5>';
      for (const [path, label, type, o, when] of FX_FORMS[L.kind]) {
        if (when && !when(L)) continue;
        const v = path.split('.').reduce((a, k) => a?.[k], L);
        if (type === 'select') h += fRow(label, fSel(path, v, o));
        else if (type === 'font') h += fRow(label, fSel(path, v || '', FONTS));
        else if (type === 'color') h += fRow(label, fColor(path, v));
        else if (type === 'range') h += fRow(label, fRange(path, v, o[0], o[1], o[2]));
        else if (type === 'switch') h += fRow(label, fSw(path, v));
        else if (type === 'number') h += fRow(label, fNum(path, v, o || 1));
        else if (type === 'textarea') h += `<label class="field"><span>${label}</span><textarea data-b="${path}" rows="5">${esc(v || '')}</textarea></label>`;
        else if (type === 'image') {
          const im = v && imageFor(v);
          h += `<div class="row img-pick"><span>${label}</span><span class="img-pick-r">${im?.ready ? `<i class="muted small">${im.w}×${im.h}</i>` : ''}<button class="btn sm" data-act="pickImg" data-field="${path}">${v ? 'Replace…' : 'Choose…'}</button></span></div>`;
        } else if (type === 'frames') {
          h += renderFrames(L);
        } else if (type === 'model') {
          const opts = {};
          for (const [k, n] of Object.entries(BUILTIN_MODELS)) opts[`builtin:${k}`] = `${n} (built-in)`;
          for (const m of project.models || []) opts[`media:${m.id}`] = `${m.name} (yours)`;
          h += fRow(label, fSel(path, v, opts));
          h += `<div class="btn-row"><button class="btn sm" data-act="uploadModel">Upload your own GLB / glTF…</button></div><p class="hint-line">Use a single .glb file (or .gltf with embedded textures). Free models: Sketchfab, Poly Pizza, NASA 3D Resources. Drag the square handle on the map to resize, the round one to rotate.</p>`;
        } else if (type === 'video') {
          h += `<div class="btn-row"><button class="btn sm" data-act="uploadVideo">${v ? 'Change clip…' : 'Choose a video clip…'}</button><span class="muted small">${esc(L.style.name || (v ? 'Clip loaded' : 'MP4 / WebM / MOV'))}</span></div>`;
          if (L.kind === 'video') h += `${v ? '<div class="btn-row"><button class="btn sm" data-act="videoSound">♪ Use the clip’s sound</button></div>' : ''}<p class="hint-line">Drag the video on the frame to place it anywhere.</p>`;
          else h += '<p class="hint-line">Stock explosion, fire or smoke clips on a black background blend in automatically. Drag the square handle on the map to resize, the round one to rotate.</p>';
        }
        else h += `<label class="field"><span>${label}</span>${fText(path, v)}</label>`;
      }
      if (SFX_KINDS.has(L.kind)) {
        h += '<h5>Sound</h5>' + fRow('Sound effects', fSw('style.sound', L.style.sound !== false));
        if (L.style.sound !== false) h += fRow('Volume', fRange('style.soundVol', L.style.soundVol ?? 1, 0, 2, 0.05));
      }
      if (IMG_KINDS.has(L.kind) && L.geom) h += renderGeoref(L);
      if (L.kind === 'wxfield') h += `<div class="btn-row"><button class="btn sm" data-act="wxLive">${L.style.grid ? 'Refresh live data' : 'Load live data for this area'}</button></div><p class="hint-line">${L.style.grid ? `Live data from Open-Meteo${L.style.grid.time ? ` · ${esc(L.style.grid.time.replace('T', ' '))} UTC` : ''}. Saved in the project, so the video stays the same.` : 'Real temperature, rain, wind, humidity and pressure right now (Open-Meteo, free). Drag the corners to change the area first.'}</p>`;
      if (NET_SET.has(L.kind)) h += renderNetTools(L);
      if (L.kind === 'smartmap') {
        const polys = layersOf().filter((x) => x !== L && x.geom && /Polygon/.test(x.geom.type));
        h += `<h5>Data</h5><div class="net-status">${(L.style.data || []).length} points · ${esc(L.style.dataName || 'no data')}</div>`;
        h += '<div class="btn-row"><button class="btn sm" data-act="smLoad">Load CSV / GeoJSON…</button><button class="btn sm" data-act="smSample">New sample data</button></div>';
        if (polys.length) h += `<div class="btn-row"><select id="sm-region">${polys.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select><button class="btn sm" data-act="smRegion">Use this region</button></div>`;
        h += '<p class="hint-line">CSV with latitude / longitude columns and a number column (population, sales…). The first number column is used. Drag the region corners to reshape it.</p>';
      }
      if (L.kind === 'cyclone') h += '<p class="hint-line">Draw the track point by point; give each point a category (TD, TS, 1–5). The storm spins anticlockwise in the north and clockwise in the south.</p>';
      if (L.kind === 'iss') h += '<p class="hint-line">Tip: turn on the globe (Look step) and zoom out to see the whole orbit.</p>';
      if (L.kind === 'trajectory') h += '<p class="hint-line">Drag the end points on the map to move the launch site and the target.</p>';
    }
    h += `<div class="btn-row">${L.geom ? '<button class="btn sm" data-act="zoom">Zoom to</button>' : ''}<button class="btn sm" data-act="up">Up</button><button class="btn sm" data-act="down">Down</button><button class="btn sm" data-act="dup">Duplicate</button><button class="btn sm danger" data-act="del">Delete</button></div>`;
    box.innerHTML = h;
    sectionizeEditor(box, L.kind);
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
    if (key === 'style.count') v = Math.max(1, Math.min(40, Math.round(+v || 1)));
    if (key === 'style.weight') v = +v;
    if (key.startsWith('geo:')) return;
    if (final) pushUndo();
    if (key.startsWith('frame:')) { const [, i, f] = key.split(':'); const fr = L.style.frames?.[+i]; if (fr) fr[f] = v; repaint(); save(); return; }
    setPath(L, key, v);
    eventsCache = null;
    if (['style.per', 'style.fade'].includes(key) && L.kind === 'timeseries') { L.duration = +(Math.max(1, (L.style.frames || []).length) * (+L.style.per || 2)).toFixed(2); eventsCache = null; }
    if (key === 'anim' || key === 'style.marker' || key === 'style.tickerStyle' || key === 'style.key' || key === 'style.layout' || key === 'style.sound' || key === 'style.variant' || key === 'style.look' || key === 'style.mode' || (key === 'style.label' && L.kind === 'timeseries') || key === 'style.labels' || key === 'style.border' || key === 'style.position') { renderLayerEditor(); commitLayers(); return; }
    if ((L.kind === 'model3d' && ['style.livery', 'style.cars'].includes(key)) || (L.kind === 'collision' && ['style.modelA', 'style.modelB', 'style.liveryA', 'style.liveryB'].includes(key))) { if (final) renderLayerEditor(); commitLayers(); return; }
    if (key === 'style.source' || (key === 'style.color' && L.kind === 'model3d') || ['style.model3d', 'style.modelA', 'style.modelB', 'style.colorA', 'style.colorB', 'style.scenario', 'style.cars', 'style.liveryA', 'style.liveryB', 'style.livery', 'style.poles', 'style.doubleTrack', 'style.track', 'style.size', 'style.look', 'style.minH', 'style.maxH', 'style.block', 'style.seed', 'style.groundBlocks'].includes(key) && ['collision', 'city3d', 'bombing', 'trajectory', 'vehicle'].includes(L.kind)) { if (key === 'style.model3d' || (final && key === 'style.scenario')) renderLayerEditor(); commitLayers(); return; }
    if (['start', 'duration', 'hold', 'style.levelFrom', 'style.levelTo'].includes(key) || key === 'name') {
      clearTimeout(layerEditTimer);
      layerEditTimer = setTimeout(() => { L.duration = Math.max(0.05, +L.duration || 0.05); L.start = Math.max(0, +L.start || 0); L.hold = Math.max(0, +L.hold || 0); commitLayers(); }, 250);
      return;
    }
    if (NET_SET.has(L.kind)) {
      scheduleNet(final ? 200 : 900);
      if (final && (el.type === 'checkbox' || el.tagName === 'SELECT')) { renderLayerEditor(); }
      eventsCache = null;
    }
    if (key === 'style.font') loadFonts(scene()).then(repaint);
    floods?.update(scene(), viewMode === 'play' ? time : null);
    if (L.kind === 'model3d') models?.update(scene(), viewMode === 'play' ? time : null, layerTiming);
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
    if (a === 'markerImg') $('#file-marker').click();
    if (a === 'uploadModel') $('#file-model').click();
    if (a === 'uploadVideo') $('#file-video').click();
    if (a === 'videoSound') {
      (async () => {
        try {
          const blob = await getMedia(L.style.media);
          if (!blob) return;
          const tr = await addAudioFile(project, new File([blob], L.style.name || 'Video sound', { type: blob.type }), 'music', +projTime(L.start).toFixed(2));
          tr.fadeIn = 0.2; tr.fadeOut = 0.5; tr.volume = 1;
          tr.name = `${L.name} (sound)`;
          renderAudioList(); renderTimeline(); save();
          toast('The clip’s sound was added to the soundtrack');
        } catch { toast('This clip has no sound this browser can read'); }
      })();
    }
    if (a === 'zoom') zoomToLayer(L);
    if (a === 'del') deleteLayer(L.id);
    if (a === 'dup') { const c = JSON.parse(JSON.stringify(L)); c.id = `ly_${Math.random().toString(36).slice(2, 9)}`; c.name = `${L.name} copy`; addLayer(c); }
    if (a === 'up' && i < ls.length - 1) { pushUndo(); [ls[i], ls[i + 1]] = [ls[i + 1], ls[i]]; commitLayers(); }
    if (a === 'down' && i > 0) { pushUndo(); [ls[i], ls[i - 1]] = [ls[i - 1], ls[i]]; commitLayers(); }
    if (a === 'atPlayhead') { pushUndo(); L.start = +time.toFixed(2); renderLayerEditor(); commitLayers(); }
    if (a === 'speed') {
      pushUndo();
      const k = +e.target.closest('[data-k]').dataset.k;
      L.duration = +Math.max(0.1, (+L.duration || 1) * k).toFixed(2);
      if (L.kind === 'timeseries') L.style.per = +Math.max(0.2, (+L.style.per || 2) * k).toFixed(2);
      if (L.kind === 'videofx' || L.kind === 'video') L.style.speed = +Math.min(4, Math.max(0.25, (+L.style.speed || 1) / k)).toFixed(2);
      renderLayerEditor(); commitLayers();
    }
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

  $('#file-marker').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    const L = selLayer && layerById(selLayer);
    if (!f || !L) return;
    try {
      pushUndo();
      L.style.image = await imageToDataURL(f, 256, false);
      await preloadSignImages([{ image: L.style.image }]);
      renderLayerEditor(); repaint(); save();
    } catch { toast('Could not read that image'); }
  });

  $('#file-model').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      toast('Reading the 3D model…');
      await inspectModelFile(f);
      const id = `md_${Math.random().toString(36).slice(2, 10)}`;
      await putMedia(id, f);
      (project.models ||= []).push({ id, name: f.name.replace(/\.(glb|gltf)$/i, '') });
      let L = selLayer && layerById(selLayer);
      pushUndo();
      if (!L || L.kind !== 'model3d') {
        const c = map.getCenter();
        L = newLayer('model3d', { type: 'Point', coordinates: [+c.lng.toFixed(6), +c.lat.toFixed(6)] }, { start: newStart() });
        layersOf().push(L);
        selLayer = L.id;
      }
      L.style.source = `media:${id}`;
      L.name = f.name.replace(/\.(glb|gltf)$/i, '');
      renderLayerEditor();
      commitLayers();
      toast('3D model added — drag it on the map, resize with the square handle');
    } catch (err) { toast(err.message || 'Could not read that model'); }
  });
  function fmtLatLon(c) { return `${Math.abs(c.lat).toFixed(2)}°${c.lat >= 0 ? 'N' : 'S'} ${Math.abs(c.lng).toFixed(2)}°${c.lng >= 0 ? 'E' : 'W'}`; }
  // ---------------------------------------------------------------- georeferenced images, before/after, time series
  let geoPick = null;
  let pendingStyle = null;
  const FRONT_TYPES_NAMES = { cold: 'Cold front', warm: 'Warm front', occluded: 'Occluded front', stationary: 'Stationary front', trough: 'Trough' };
  /** A quad filling part of the current video frame, with the picture's proportions (h / w). */
  function fitQuad(aspectHW = 0.66, frac = 0.6, cap = 0.8) {
    let w = frame.w * frac, h = w * aspectHW;
    if (h > frame.h * cap) { h = frame.h * cap; w = h / aspectHW; }
    const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
    const ll = (x, y) => { const p = map.unproject([x, y]); return [p.lng, p.lat]; };
    return [ll(cx - w / 2, cy - h / 2), ll(cx + w / 2, cy - h / 2), ll(cx + w / 2, cy + h / 2), ll(cx - w / 2, cy + h / 2)];
  }
  const fmtDeg = (v) => (+v).toFixed(6);
  function renderGeoref(L) {
    const q = quadOf(L);
    const b = quadBounds(q);
    let h = '<h5>Place it on the map (georeference)</h5>';
    h += '<p class="hint-line">Drag the image to move it, the white corner squares to stretch each corner onto matching features, the round handle to rotate (Shift = 15° steps) and the blue square to resize. Lower the opacity to line it up with the map.</p>';
    h += `<div class="btn-row wrap"><button class="btn sm" data-act="geoFit">Fit to the view</button><button class="btn sm" data-act="geoAspect">Fix proportions</button><button class="btn sm" data-act="geoRot" data-v="-1">⟲ 1°</button><button class="btn sm" data-act="geoRot" data-v="1">⟳ 1°</button><button class="btn sm" data-act="geoScale" data-v="0.97">Smaller</button><button class="btn sm" data-act="geoScale" data-v="1.03">Bigger</button></div>`;
    h += `<div class="geo-bounds"><label>North<input data-b="geo:n" value="${fmtDeg(b.n)}"></label><label>South<input data-b="geo:s" value="${fmtDeg(b.s)}"></label><label>West<input data-b="geo:w" value="${fmtDeg(b.w)}"></label><label>East<input data-b="geo:e" value="${fmtDeg(b.e)}"></label></div>`;
    h += '<div class="btn-row"><button class="btn sm" data-act="geoApply">Set to these bounds</button><button class="btn sm" data-act="zoom">Zoom to the image</button></div>';
    h += fRow('Image projection', fSel('style.crs', L.style.crs || '3857', { 3857: 'Web Mercator (screenshots, tiles)', 4326: 'Latitude / longitude grid (WGS84)' }));
    h += fRow('Lock position', fSw('locked', !!L.locked));
    return h;
  }
  function renderFrames(L) {
    const s = L.style, fr = s.frames || [];
    let h = '';
    if (s.source === 'livesat') {
      h += '<h5>Live satellite / radar</h5>';
      h += fRow('Imagery', `<select id="ls-prod">${Object.entries(SAT_PRODUCTS).map(([k, p]) => `<option value="${k}" ${s.sat === k ? 'selected' : ''}>${p.name}</option>`).join('')}</select>`);
      if (s.sat === 'custom') h += `<label class="field"><span>WMS address</span><input id="ls-wms" value="${esc(s.wmsUrl || '')}" placeholder="https://…/wms"></label><label class="field"><span>Layer name</span><input id="ls-layer" value="${esc(s.wmsLayer || '')}"></label>`;
      h += fRow('Show', `<select id="ls-mode"><option value="loop" ${s.satMode !== 'latest' ? 'selected' : ''}>Animated loop</option><option value="latest" ${s.satMode === 'latest' ? 'selected' : ''}>Latest image only</option></select>`);
      if (s.satMode !== 'latest' && s.sat !== 'radar') h += fRow('Hours back', `<select id="ls-hours">${[1, 2, 3, 6, 12, 24, 48, 72].map((x) => `<option ${+s.hours === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`) + fRow('Every', `<select id="ls-step">${[10, 15, 30, 60, 120].map((x) => `<option value="${x}" ${+s.step === x ? 'selected' : ''}>${x} min</option>`).join('')}</select>`);
      h += fRow('Ending at (UTC, empty = now)', `<input type="datetime-local" id="ls-end" value="${esc(s.satEnd || '')}">`);
      h += '<div class="btn-row"><button class="btn sm primary" data-act="lsLoad">Load imagery</button></div>';
      h += `<p class="hint-line">${fr.length ? `${fr.length} image${fr.length === 1 ? '' : 's'} · ${esc(fr[0].label)}${fr.length > 1 ? ` → ${esc(fr.at(-1).label)}` : ''}. ` : ''}Geostationary satellites refresh every 10–15 minutes and appear about half an hour late. Zoom out to see a whole cyclone; lower the opacity to see the map under the clouds. Imagery: NASA GIBS / NOAA, © EUMETSAT, RainViewer.</p>`;
      return h;
    }
    if (s.source === 'wayback') {
      h += '<h5>Satellite dates (Esri World Imagery Wayback)</h5>';
      if (!wbList) {
        h += '<div class="btn-row"><button class="btn sm" data-act="wbList">Show all available dates…</button></div>';
      } else {
        const f = wbFilter;
        h += `<div class="wb-pick"><div class="wb-range"><label>From<input type="date" id="wb-from" value="${f.from}"></label><label>To<input type="date" id="wb-to" value="${f.to}"></label></div>`;
        h += fRow('Show', `<select id="wb-gran"><option value="all" ${f.gran === 'all' ? 'selected' : ''}>Every release (${wbList.length})</option><option value="month" ${f.gran === 'month' ? 'selected' : ''}>One per month</option><option value="year" ${f.gran === 'year' ? 'selected' : ''}>One per year</option></select>`);
        h += fRow('Label as', `<select id="wb-fmt"><option value="year" ${f.fmt === 'year' ? 'selected' : ''}>2021</option><option value="month" ${f.fmt === 'month' ? 'selected' : ''}>Mar 2021</option><option value="date" ${f.fmt === 'date' ? 'selected' : ''}>14 Mar 2021</option></select>`);
        const have = new Set(fr.map((x) => x.release));
        const list = wbFiltered();
        h += `<div class="wb-list">${list.map((r) => `<label class="wb-item"><input type="checkbox" data-wb="${r.num}" ${have.has(r.num) ? 'checked' : ''}><span>${r.date}</span></label>`).join('') || '<p class="muted small">No releases in that range.</p>'}</div>`;
        h += `<div class="btn-row wrap"><button class="btn sm" data-act="wbAll">Tick all ${list.length}</button><button class="btn sm" data-act="wbNone">Untick all</button><button class="btn sm primary" data-act="wbUse">Use ticked dates</button></div></div>`;
      }
      h += '<p class="hint-line">Archived Esri World Imagery releases (roughly monthly since 2014). Imagery only changes where Esri updated it, so pick a well-covered place — cities usually change most. Imagery © Esri and its partners.</p>';
    } else {
      h += '<h5>Images (in order)</h5>';
    }
    h += `<ol class="frame-list">${fr.map((f, i) => `<li><span class="fr-n">${i + 1}</span><input data-b="frame:${i}:label" value="${esc(f.label || '')}" title="Label shown in the video"><small class="muted">${esc(f.date || f.name || '')}</small><span><button class="mini" data-act="frUp" data-i="${i}" title="Earlier">↑</button><button class="mini" data-act="frDown" data-i="${i}" title="Later">↓</button><button class="mini" data-act="frDel" data-i="${i}" title="Remove">✕</button></span></li>`).join('') || '<li class="empty">No dates yet.</li>'}</ol>`;
    if (s.source !== 'wayback') h += '<div class="btn-row"><button class="btn sm" data-act="addFrames">Add images…</button><button class="btn sm" data-act="frSort">Sort by label</button></div><p class="hint-line">All images share the same place on the map. Labels are taken from years in the file names (e.g. dubai_2019.jpg).</p>';
    return h;
  }
  let wbList = null;
  const wbFilter = { from: '2014-01-01', to: new Date().toISOString().slice(0, 10), gran: 'year', fmt: 'year' };
  function wbFiltered() {
    const f = wbFilter;
    const inRange = (wbList || []).filter((r) => r.date >= f.from && r.date <= f.to);
    if (f.gran === 'all') return inRange;
    const by = new Map();
    for (const r of inRange) by.set(f.gran === 'year' ? r.date.slice(0, 4) : r.date.slice(0, 7), r);
    return [...by.values()];
  }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const wbLabel = (r, fmt) => (fmt === 'year' ? r.date.slice(0, 4) : fmt === 'month' ? `${MONTHS[+r.date.slice(5, 7) - 1]} ${r.date.slice(0, 4)}` : `${+r.date.slice(8, 10)} ${MONTHS[+r.date.slice(5, 7) - 1]} ${r.date.slice(0, 4)}`);
  function setSeriesDuration(L) { L.duration = +(Math.max(1, (L.style.frames || []).length) * (+L.style.per || 2)).toFixed(2); }
  async function addWayback() {
    const L = newLayer('timeseries', null, { start: newStart() });
    L.style.source = 'wayback';
    L.style.frames = [];
    L.name = 'Satellite through time';
    addLayer(L);
    try {
      toast('Loading Esri Wayback dates…');
      const list = await waybackReleases();
      const now = new Date().getFullYear();
      L.style.frames = yearlyReleases(list, now - 6, now).map((r) => ({ release: r.num, url: r.url, date: r.date, year: r.year, label: String(r.year) }));
      setSeriesDuration(L);
      if (selLayer === L.id) renderLayerEditor();
      commitLayers();
      if (map.getZoom() < 12) toast('Zoom in to a city to see the imagery change through the years', 4200);
    } catch { toast('Could not load the Wayback imagery list — check your connection', 4200); }
  }
  $('#layer-editor').addEventListener('change', (e) => {
    if (e.target.id === 'ls-prod' || e.target.id === 'ls-mode') { const L = selLayer && layerById(selLayer); if (L) { L.style[e.target.id === 'ls-prod' ? 'sat' : 'satMode'] = e.target.value; renderLayerEditor(); } return; }
    const id = e.target.id;
    if (!['wb-from', 'wb-to', 'wb-gran', 'wb-fmt'].includes(id)) return;
    wbFilter[{ 'wb-from': 'from', 'wb-to': 'to', 'wb-gran': 'gran', 'wb-fmt': 'fmt' }[id]] = e.target.value;
    if (id === 'wb-fmt') { const L = selLayer && layerById(selLayer); if (L?.style.source === 'wayback' && wbList) { pushUndo(); for (const f of L.style.frames || []) { const r = wbList.find((x) => x.num === f.release); if (r) f.label = wbLabel(r, wbFilter.fmt); } save(); repaint(); } }
    renderLayerEditor();
  });
  $('#file-geoimg').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    const pick = geoPick;
    geoPick = null;
    if (!files.length || !pick) return;
    let res;
    try { toast('Reading images…'); res = await readGeoImages(files); } catch (err) { console.warn(err); toast(err.message || 'Could not read those files', 5200); return; }
    const items = [];
    for (const r of res) items.push({ ...r, id: await storeImage(r.blob) });
    items.forEach((r) => { const im = imageFor(r.id); im.p.then(repaint); });
    pushUndo();
    const geoOf = (r) => (r.quad ? { q: r.quad, crs: r.crs } : { q: fitQuad(r.h / r.w), crs: '3857' });
    let zoomTo = null;
    if (pick.mode === 'new') {
      const start = newStart();
      const added = [];
      if (pick.kind === 'image') {
        for (const r of items) {
          const g = geoOf(r);
          const L = newLayer('image', quadGeom(g.q), { start, name: r.name });
          Object.assign(L.style, { media: r.id, name: r.name, crs: g.crs });
          added.push(L);
          if (r.quad) zoomTo = L;
        }
      } else if (pick.kind === 'compare') {
        const sorted = items.slice().sort((a, b) => labelFromName(a.name).localeCompare(labelFromName(b.name)));
        const g = geoOf(sorted.find((r) => r.quad) || sorted[0]);
        const L = newLayer('compare', quadGeom(g.q), { start, name: 'Before / after' });
        Object.assign(L.style, { media: sorted[0].id, media2: sorted[1]?.id || '', crs: g.crs });
        if (sorted.length >= 2) { L.style.labelA = labelFromName(sorted[0].name).match(/^\d{4}/) ? labelFromName(sorted[0].name) : 'BEFORE'; L.style.labelB = labelFromName(sorted[1].name).match(/^\d{4}/) ? labelFromName(sorted[1].name) : 'AFTER'; }
        added.push(L);
        if (sorted.some((r) => r.quad)) zoomTo = L;
        if (sorted.length < 2) toast('Now choose the AFTER image in the layer settings', 4200);
      } else {
        const sorted = items.slice().sort((a, b) => labelFromName(a.name).localeCompare(labelFromName(b.name), undefined, { numeric: true }));
        const g = geoOf(sorted.find((r) => r.quad) || sorted[0]);
        const L = newLayer('timeseries', quadGeom(g.q), { start, name: 'Images through time' });
        Object.assign(L.style, { source: 'files', crs: g.crs, frames: sorted.map((r) => ({ media: r.id, name: r.name, label: labelFromName(r.name) })) });
        setSeriesDuration(L);
        added.push(L);
        if (sorted.some((r) => r.quad)) zoomTo = L;
      }
      layersOf().push(...added);
      selLayer = added.at(-1).id;
      setViewMode('edit');
    } else {
      const L = layerById(pick.id);
      if (!L) return;
      if (pick.mode === 'field') {
        setPath(L, pick.field, items[0].id);
        if (items[0].quad && (L.kind === 'image' || !quadOf(L))) { L.geom = quadGeom(items[0].quad); L.style.crs = items[0].crs; zoomTo = L; }
        if (L.kind === 'compare' && pick.field === 'style.media2' && items[0].name.match(/(19|20)\d\d/)) L.style.labelB = labelFromName(items[0].name);
      } else if (pick.mode === 'frames') {
        (L.style.frames ||= []).push(...items.map((r) => ({ media: r.id, name: r.name, label: labelFromName(r.name) })));
        if (!L.geom) L.geom = quadGeom(geoOf(items[0]).q);
        setSeriesDuration(L);
      }
    }
    renderLayerEditor();
    commitLayers();
    if (zoomTo) zoomToLayer(zoomTo);
    toast(items.some((r) => r.quad) ? 'Image placed from its georeference' : 'Image placed in the view — drag its corners to line it up with the map', 4200);
  });
  $('#layer-editor').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    const a = btn?.dataset.act;
    const L = selLayer && layerById(selLayer);
    if (!a || !L) return;
    const q = quadOf(L);
    const img = imageFor(L.style.media || L.style.frames?.[0]?.media);
    const geo = (nq) => { pushUndo(); L.geom = quadGeom(nq); renderLayerEditor(); repaint(); save(); };
    if (a === 'pickImg') { geoPick = { mode: 'field', id: L.id, field: btn.dataset.field }; $('#file-geoimg').click(); }
    if (a === 'addFrames') { geoPick = { mode: 'frames', id: L.id }; $('#file-geoimg').click(); }
    if (a === 'geoFit') geo(fitQuad(img?.ready ? img.h / img.w : 0.66));
    if (a === 'geoAspect' && q && img?.ready) geo(fixAspect(q, img.h / img.w));
    if (a === 'geoRot' && q) geo(rotateQuad(q, +btn.dataset.v));
    if (a === 'geoScale' && q) geo(scaleQuad(q, +btn.dataset.v));
    if (a === 'geoApply') {
      const v = (k) => +$(`#layer-editor [data-b="geo:${k}"]`).value;
      const n = v('n'), so = v('s'), w = v('w'), ea = v('e');
      if (![n, so, w, ea].every(isFinite) || n <= so || ea <= w || Math.abs(n) > 85 || Math.abs(so) > 85) { toast('Check the bounds: north must be above south, east right of west'); return; }
      geo(quadFromBounds(w, so, ea, n));
      zoomToLayer(L);
    }
    const fr = L.style.frames || [];
    const i = +btn.dataset.i;
    if (a === 'frUp' && i > 0) { pushUndo(); [fr[i - 1], fr[i]] = [fr[i], fr[i - 1]]; renderLayerEditor(); commitLayers(); }
    if (a === 'frDown' && i < fr.length - 1) { pushUndo(); [fr[i + 1], fr[i]] = [fr[i], fr[i + 1]]; renderLayerEditor(); commitLayers(); }
    if (a === 'frDel') { pushUndo(); fr.splice(i, 1); setSeriesDuration(L); renderLayerEditor(); commitLayers(); }
    if (a === 'frSort') { pushUndo(); fr.sort((x, y) => String(x.label).localeCompare(String(y.label), undefined, { numeric: true })); renderLayerEditor(); commitLayers(); }
    if (a === 'lsLoad') {
      const st = L.style;
      st.sat = $('#ls-prod').value; st.satMode = $('#ls-mode').value;
      if ($('#ls-hours')) st.hours = +$('#ls-hours').value;
      if ($('#ls-step')) st.step = +$('#ls-step').value;
      st.satEnd = $('#ls-end').value || '';
      if ($('#ls-wms')) { st.wmsUrl = $('#ls-wms').value; st.wmsLayer = $('#ls-layer').value; }
      try {
        const frames = await satFrames(st.sat, { mode: st.satMode, hours: st.hours, step: st.step, end: st.satEnd ? new Date(`${st.satEnd}:00Z`) : null, wmsUrl: st.wmsUrl, wmsLayer: st.wmsLayer });
        pushUndo();
        st.frames = frames;
        st.credit = SAT_CREDITS[SAT_PRODUCTS[st.sat]?.src] || '';
        st.per = frames.length > 1 ? Math.max(0.15, +(Math.min(0.6, 8 / frames.length)).toFixed(2)) : 4;
        st.fade = frames.length > 1 ? +(st.per * 0.6).toFixed(2) : 0;
        setSeriesDuration(L);
        renderLayerEditor(); commitLayers();
        toast(`${frames.length} satellite image${frames.length === 1 ? '' : 's'} loaded`);
      } catch (err) { toast(err.message || 'Could not load the imagery list', 4200); }
    }
    if (a === 'smLoad') $('#file-sm').click();
    if (a === 'smSample') { pushUndo(); L.style.data = sampleData(L.geom.coordinates[0], { rings: 40, reach: 24, halo: 24, circles: 60 }[L.style.mode] || 180, Math.floor(Math.random() * 1000)); L.style.dataName = 'sample data'; commitLayers(); renderLayerEditor(); }
    if (a === 'smRegion') { const src = layerById($('#sm-region').value); if (src?.geom) { pushUndo(); const g = src.geom.type === 'MultiPolygon' ? { type: 'Polygon', coordinates: src.geom.coordinates.reduce((m, p) => (p[0].length > m[0].length ? p : m)) } : JSON.parse(JSON.stringify(src.geom)); L.geom = g; commitLayers(); renderLayerEditor(); toast('Region copied — press “New sample data” or load your data for it'); } }
    if (a === 'netRun') { L.style.resultTry = ''; L.style.resultSig = ''; L.style.resultErr = ''; scheduleNet(0); }
    if (a === 'fenceReset') { pushUndo(); L.style.path = defaultFencePath(L.geom); commitLayers(); renderLayerEditor(); }
    if (a === 'fencePath') {
      cancelDrawing();
      setViewMode('edit');
      drawing = { kind: '_fencepath', target: L.id, coords: [], polygon: false, single: false };
      stage.classList.add('placing');
      showHint('Click the vehicle’s path across the zone · double-click or Enter to finish · Esc to cancel');
    }
    if (a === 'netFind') {
      const which = btn.dataset.which;
      const q = $(`#net-q-${which}`)?.value.trim();
      if (!q) { toast('Type a place name first'); return; }
      try {
        const r = (await geocode(q))[0];
        if (!r) { toast('Place not found'); return; }
        const ll = [+r.lng.toFixed(6), +r.lat.toFixed(6)];
        pushUndo();
        const c = L.geom.coordinates;
        const short = r.name.split(',')[0];
        if (which === 'place') { L.geom.coordinates = ll; if (!L.style.name) L.style.name = short; }
        if (which === 'from') { c[0] = ll; L.style.fromName = short; }
        if (which === 'to') { c[c.length - 1] = ll; L.style.toName = short; }
        if (which === 'origin') { c[0] = ll; L.style.originName = short; }
        if (which === 'dest') {
          c.push(ll);
          const lines = String(L.style.values || '').split('\n').filter((x) => x.trim());
          while (lines.length < c.length - 2) lines.push(`Destination ${lines.length + 1}`);
          lines.push(short);
          L.style.values = lines.join('\n');
        }
        commitLayers(); renderLayerEditor(); zoomToLayer(L);
      } catch { toast('Search failed — check your connection', 4200); }
    }
    if (a === 'wxLive') {
      try {
        toast('Loading live weather…');
        const { loadLiveGrid } = await import('./weather.js');
        const grid = await loadLiveGrid(L);
        pushUndo();
        L.style.grid = grid; L.style.source = 'live';
        if (L.style.field === 'temp') { const v = grid.temp; L.style.min = Math.floor(Math.min(...v) - 1); L.style.max = Math.ceil(Math.max(...v) + 1); }
        renderLayerEditor(); commitLayers();
        toast('Live weather loaded');
      } catch { toast('Could not load live weather — check your connection', 4200); }
    }
    if (a === 'wbList') {
      try { toast('Loading Wayback dates…'); wbList = await waybackReleases(); renderLayerEditor(); }
      catch { toast('Could not load the Wayback imagery list — check your connection', 4200); }
    }
    if (a === 'wbAll' || a === 'wbNone') $$('#layer-editor [data-wb]').forEach((c) => { c.checked = a === 'wbAll'; });
    if (a === 'wbUse') {
      const ids = new Set($$('#layer-editor [data-wb]').filter((c) => c.checked).map((c) => +c.dataset.wb));
      const keep = (L.style.frames || []).filter((f) => ids.has(f.release) && !wbFiltered().some((r) => r.num === f.release));
      const pick = wbFiltered().filter((r) => ids.has(r.num));
      const all = [...keep.map((f) => wbList.find((r) => r.num === f.release)).filter(Boolean), ...pick].sort((x, y) => x.date.localeCompare(y.date));
      if (!all.length) { toast('Tick at least one date'); return; }
      if (all.length > 60) { toast('Up to 60 dates at a time — narrow the range'); return; }
      pushUndo();
      L.style.frames = all.map((r) => ({ release: r.num, url: r.url, date: r.date, year: r.year, label: wbLabel(r, wbFilter.fmt) }));
      setSeriesDuration(L);
      renderLayerEditor();
      commitLayers();
    }
    if (a === 'wbLoad') {
      const from = +$('#wb-from').value, to = +$('#wb-to').value, step = +$('#wb-step').value;
      try {
        const list = await waybackReleases();
        const yearly = yearlyReleases(list, Math.min(from, to), Math.max(from, to)).filter((r, k, arr) => (r.year - arr[0].year) % step === 0 || k === arr.length - 1);
        if (!yearly.length) { toast('No imagery dates in those years'); return; }
        pushUndo();
        L.style.frames = yearly.map((r) => ({ release: r.num, url: r.url, date: r.date, year: r.year, label: String(r.year) }));
        setSeriesDuration(L);
        renderLayerEditor();
        commitLayers();
      } catch { toast('Could not load the Wayback imagery list — check your connection', 4200); }
    }
  });

  $('#file-video').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    const L = selLayer && layerById(selLayer);
    if (!f || !L || (L.kind !== 'videofx' && L.kind !== 'video')) return;
    if (f.size > 200e6) { toast('That clip is very large — use one under 200 MB'); return; }
    const id = `vd_${Math.random().toString(36).slice(2, 10)}`;
    await putMedia(id, f);
    pushUndo();
    L.style.media = id;
    L.style.name = f.name;
    L.name = f.name.replace(/\.[^.]+$/, '');
    const v = videoFor(id);
    v.el.addEventListener('loadeddata', () => {
      if (v.el.duration && isFinite(v.el.duration)) { L.duration = +Math.min(30, v.el.duration).toFixed(2); renderLayerEditor(); commitLayers(); }
      repaint();
    }, { once: true });
    renderLayerEditor();
    commitLayers();
  });

  // CSV points
  let csvData = null;
  $('#import-csv').onclick = () => $('#file-csv').click();
  $('#file-csv').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { csvData = parseCSVPoints(await f.text()); } catch (err) { toast(err.message); return; }
    csvData.file = f.name;
    $('#csv-info').textContent = `${csvData.rows.length} rows with coordinates in ${f.name}${csvData.rows.length > 300 ? ' — the first 300 will be used' : ''}.`;
    $('#csv-name').innerHTML = '<option value="-1">No labels</option>' + csvData.header.map((h, i) => `<option value="${i}" ${i === csvData.name ? 'selected' : ''}>${esc(h)}</option>`).join('');
    $('#csv-preset').innerHTML = Object.entries(SYMBOL_PRESETS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('');
    $('#csv-modal').showModal();
  });
  $('#csv-go').onclick = () => {
    if (!csvData) return;
    $('#csv-modal').close();
    const nameCol = +$('#csv-name').value, preset = $('#csv-preset').value, stagger = +$('#csv-stagger').value;
    const start = newStart();
    const rows = csvData.rows.slice(0, 300);
    const ls = rows.map((r, i) => {
      const L = newLayer('point', { type: 'Point', coordinates: [+r[csvData.lon], +r[csvData.lat]] }, { start: +(start + i * stagger).toFixed(2), preset });
      if (nameCol >= 0) { L.style.label = r[nameCol] || ''; L.name = r[nameCol] || L.name; }
      return L;
    });
    if ($('#csv-line').checked && rows.length > 1) {
      const line = newLayer('line', { type: 'LineString', coordinates: rows.map((r) => [+r[csvData.lon], +r[csvData.lat]]) }, { start, name: csvData.file.replace(/\.[^.]+$/, '') });
      line.duration = Math.max(1, rows.length * Math.max(stagger, 0.2));
      ls.unshift(line);
    }
    pushUndo();
    layersOf().push(...ls);
    selLayer = null;
    commitLayers();
    const b = bounds(rows.map((r) => [+r[csvData.lon], +r[csvData.lat]]));
    if (rows.length > 1) flyToBounds(b); else zoomToLayer(ls[0]);
    toast(`Added ${rows.length} point${rows.length === 1 ? '' : 's'} from ${csvData.file}`);
  };

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
    $('#cam-intro').innerHTML = opt([['none', 'No zoom'], ['space', 'Earth zoom from space (globe)'], ['world', 'The whole world'], ['wide', 'A wide view'], ['routeStart', 'Close to the route start'], ...feats], cam.intro || 'none');
    $('#cam-outro').innerHTML = opt([['none', 'No zoom'], ['overview', 'Everything (route and layers)'], ['space', 'Out to space (globe)'], ['wide', 'A wide view'], ['world', 'The whole world'], ['routeEnd', 'Close to the route end'], ...feats], cam.outro || 'none');
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
  const ensureGlobe = (v) => {
    if (v !== 'space' || scene().look.globe) return;
    scene().look.globe = true;
    if (!scene().look.clouds) { scene().look.clouds = true; scene().look.cloudMode = 'zoom'; }
    applyLook(scene());
    toast('Turned on the globe and clouds for the Earth zoom');
  };
  $('#cam-intro').addEventListener('change', (e) => { ensureGlobe(e.target.value); scene().camera.intro = e.target.value; if (e.target.value === 'space' && (+scene().camera.introSeconds || 0) < 4) scene().camera.introSeconds = 5; camChanged('start'); });
  $('#cam-outro').addEventListener('change', (e) => { ensureGlobe(e.target.value); scene().camera.outro = e.target.value; if (e.target.value === 'space' && (+scene().camera.outroSeconds || 0) < 4) scene().camera.outroSeconds = 5; camChanged('end'); });
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
    const isMore = MORE_THEMES.includes(look.theme) || IMAGERY_THEMES.includes(look.theme) || BASE_THEMES.includes(look.theme);
    $('#themes').innerHTML = MAIN_THEMES.map((k) => `<button class="theme-btn ${look.theme === k ? 'active' : ''}" data-theme="${k}">${themeSwatchSVG(k)}${THEMES[k].name}</button>`).join('') +
      `<button class="theme-btn ${isMore ? 'active' : ''}" data-more>${isMore ? themeSwatchSVG(look.theme) : '<span class="more-ico">▦</span>'}${isMore ? THEMES[look.theme].name : 'More'}</button>`;
    $('#theme-desc').textContent = THEMES[look.theme]?.desc || '';
    const card = (k) => `<button class="theme-card ${look.theme === k ? 'active' : ''}" data-theme="${k}">${themeSwatchSVG(k)}<b>${THEMES[k].name}</b><small>${THEMES[k].desc}</small></button>`;
    $('#more-themes').innerHTML = MORE_THEMES.map(card).join('');
    $('#imagery-themes').innerHTML = IMAGERY_THEMES.map(card).join('');
    $('#base-themes').innerHTML = BASE_THEMES.map(card).join('');
    const th = THEMES[look.theme] || {};
    $('#rlabels-row').hidden = !(th.tiles && !th.labels);
    $('#rroads-row').hidden = !(th.tiles && th.satellite);
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
  $('#themes-modal').addEventListener('click', (e) => {
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
    $('#cloud-opts').hidden = !look.clouds;
    $('#bld-row').hidden = !look.buildings3d;
    const opt = (o, v) => Object.entries(o).map(([k, t]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${t}</option>`).join('');
    const n = look.north;
    $('#north-style').innerHTML = opt(NORTH_STYLES, n.style);
    $('#north-mode').innerHTML = opt(NORTH_MODES, n.mode);
    $('#north-pos').innerHTML = opt(CORNERS, n.position);
    $('#north-size').value = n.size;
    $('#north-spin').checked = !!n.spinIn;
    $('#north-smooth').checked = n.smooth !== false;
    $('#north-opts').hidden = n.style === 'none';
    const sb = look.scaleBar;
    $('#scale-on').checked = !!sb.on;
    $('#scale-units').value = sb.units;
    $('#scale-pos').innerHTML = opt(CORNERS, sb.position);
    $('#scale-opts').hidden = !sb.on;
    const g = look.grade;
    $('#grade-preset').innerHTML = opt({ ...Object.fromEntries(Object.entries(GRADE_PRESETS).map(([k, v]) => [k, v.name])), custom: 'Custom' }, g.preset || 'none');
    $$('[data-grade]').forEach((el) => { const v = g[el.dataset.grade]; if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? (el.dataset.grade === 'warmth' || el.dataset.grade === 'fade' ? 0 : 1); });
    renderTemplates();
    const cur = look.lineColor;
    $('#swatches').innerHTML = COLORS.map((c) => `<button class="swatch ${c === cur ? 'active' : ''}" data-color="${c}" style="background:${c}"></button>`).join('') +
      `<label class="swatch-custom" title="Custom colour"><input type="color" value="${cur}"/></label>`;
  }
  // north arrow / scale bar / grade
  const lookChanged = () => { repaint(); save(); };
  $('#north-style').addEventListener('change', (e) => { scene().look.north.style = e.target.value; $('#north-opts').hidden = e.target.value === 'none'; lookChanged(); });
  $('#north-mode').addEventListener('change', (e) => { scene().look.north.mode = e.target.value; lookChanged(); });
  $('#north-pos').addEventListener('change', (e) => { scene().look.north.position = e.target.value; lookChanged(); });
  $('#north-size').addEventListener('input', (e) => { scene().look.north.size = +e.target.value; lookChanged(); });
  $('#north-spin').addEventListener('change', (e) => { scene().look.north.spinIn = e.target.checked; lookChanged(); });
  $('#north-smooth').addEventListener('change', (e) => { scene().look.north.smooth = e.target.checked; lookChanged(); });
  $('#scale-on').addEventListener('change', (e) => { scene().look.scaleBar.on = e.target.checked; $('#scale-opts').hidden = !e.target.checked; lookChanged(); });
  $('#scale-units').addEventListener('change', (e) => { scene().look.scaleBar.units = e.target.value; lookChanged(); });
  $('#scale-pos').addEventListener('change', (e) => { scene().look.scaleBar.position = e.target.value; lookChanged(); });
  const applyGrade = () => { $('#map').style.filter = gradeFilter(scene().look.grade); repaint(); save(); };
  $('#grade-preset').addEventListener('change', (e) => {
    if (e.target.value === 'custom') return;
    scene().look.grade = presetGrade(e.target.value);
    renderLookControls();
    applyGrade();
  });
  $$('[data-grade]').forEach((el) => el.addEventListener('input', () => {
    const g = scene().look.grade;
    g[el.dataset.grade] = el.type === 'checkbox' ? el.checked : +el.value;
    g.preset = 'custom';
    $('#grade-preset').value = 'custom';
    applyGrade();
  }));
  // look templates (saved in this browser)
  const TPL_KEY = 'map-animator:templates';
  const loadTpls = () => { try { return JSON.parse(localStorage.getItem(TPL_KEY) || '[]'); } catch { return []; } };
  const saveTpls = (t) => { try { localStorage.setItem(TPL_KEY, JSON.stringify(t)); } catch { /* storage full */ } };
  function renderTemplates() {
    const t = loadTpls();
    $('#tpl-apply').innerHTML = `<option value="">${t.length ? 'Choose a template…' : 'No templates yet'}</option>` + t.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join('');
    $('#tpl-del').hidden = true;
  }
  $('#tpl-save').onclick = () => {
    const name = prompt('Template name', `${THEMES[scene().look.theme]?.name || 'My'} look`);
    if (!name) return;
    const t = loadTpls();
    t.push({ name: name.slice(0, 40), look: JSON.parse(JSON.stringify(scene().look)), lens: JSON.parse(JSON.stringify(scene().camera.lens)) });
    saveTpls(t);
    renderTemplates();
    toast('Template saved — use it in any project from this browser');
  };
  $('#tpl-apply').addEventListener('change', (e) => {
    const t = loadTpls()[+e.target.value];
    $('#tpl-del').hidden = e.target.value === '';
    if (!t) return;
    pushUndo();
    scene().look = { ...scene().look, ...JSON.parse(JSON.stringify(t.look)) };
    if (t.lens) scene().camera.lens = { ...scene().camera.lens, ...t.lens };
    migrateScene(scene());
    applyLook(scene());
    renderThemes(); renderLookControls(); renderLegs(); rebuild(); applyGrade();
    $('#tpl-apply').value = e.target.value;
    $('#tpl-del').hidden = false;
    toast(`Applied “${t.name}”`);
  });
  $('#tpl-del').onclick = () => {
    const i = +$('#tpl-apply').value;
    const t = loadTpls();
    if (!t[i] || !confirm(`Delete the template “${t[i].name}”?`)) return;
    t.splice(i, 1);
    saveTpls(t);
    renderTemplates();
  };

  $('#side').addEventListener('input', (e) => {
    const el = e.target.closest('[data-look]');
    if (!el) return;
    const key = el.dataset.look;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'range') v = +v;
    scene().look[key] = v;
    if (key === 'clouds') $('#cloud-opts').hidden = !v;
    if (key === 'globe' && v && map.getZoom() > 6) toast('Zoom out to see the globe — use “Earth zoom from space” in the Camera step for a fly-in', 4200);
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
    if (['placeNames', 'lang', 'states', 'terrain', 'terrainExaggeration', 'buildings3d', 'rasterLabels', 'rasterRoads', 'globe', 'atmosphere'].includes(key)) applyLook(scene());
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
    showHint(`Click the map where the ${SIGN_TYPES[type].name.toLowerCase()} goes`);
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
      $('#se-at-row').hidden = sg.appear !== 'time';
      $('#se-at').value = (+sg.at || model.signTimes[i] || 0).toFixed(2);
      $('#se-type').value = sg.type;
      $('#se-font').value = sg.font || '';
    }
    renderSignList();
    repaint();
  }
  $('#se-font').innerHTML = Object.entries(FONTS).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('');
  $('#se-font').addEventListener('change', (e) => { editSign((sg) => { if (e.target.value) sg.font = e.target.value; else delete sg.font; }, true); loadFonts(scene()).then(repaint); });
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
  $('#se-appear').addEventListener('change', (e) => { editSign((sg) => { if (e.target.value === 'time' && sg.at == null) sg.at = +(model.signTimes[selSign] || time).toFixed(2); sg.appear = e.target.value; }, true); selectSign(selSign); });
  $('#se-at').addEventListener('input', (e) => editSign((sg) => { sg.at = Math.max(0, +e.target.value || 0); }));
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
    keyframes: 'Set the view at moments in time; the camera moves smoothly between them.',
    orbit: 'The camera circles around the view, like a drone shot.',
    fixed: "The camera doesn't move: the video shows exactly what's in the frame.",
    startEnd: 'The camera glides from a start view to an end view while the line draws.',
    follow: 'The camera travels with the arrow along the route.',
  };
  function renderCamera() {
    renderCamSelects();
    const cam = scene().camera;
    $('#globe-zoom').value = +cam.globeZoom || 0;
    $('#globe-out').textContent = (+cam.globeZoom || 0).toFixed(1);
    $('#globe-rotate').checked = !!cam.followRotate;
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
    $('#orbit-speed').value = cam.orbitSpeed ?? 12;
    $('#orbit-out').textContent = `${cam.orbitSpeed ?? 12}°/s`;
    renderKeyframes();
  }
  function renderKeyframes() {
    const cam = scene().camera;
    const ks = cam.keys || [];
    $('#kf-list').innerHTML = ks.length ? ks.map((k, i) => `
      <li data-i="${i}" class="${selKey === i ? 'sel' : ''}">
        <div class="kh"><i></i><b>${k.t.toFixed(2)} s</b><span class="muted small">zoom ${k.view.zoomRef.toFixed(1)} · ${Math.round(k.view.bearing || 0)}° · tilt ${Math.round(k.view.pitch || 0)}°</span></div>
        <label class="row"><span>Then</span><select data-k="ease">${Object.entries(EASE_NAMES).map(([v, t]) => `<option value="${v}" ${(k.ease || 'ease') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <div class="btn-row"><button class="btn sm" data-k="go">Go to</button><button class="btn sm" data-k="update">Use current view</button><button class="btn sm danger" data-k="del">Delete</button></div>
      </li>`).join('') : '<li class="muted small">No keyframes yet.</li>';
  }
  $('#kf-add').onclick = () => {
    const cam = scene().camera;
    pushUndo();
    cam.keys ||= [];
    const t = +time.toFixed(3);
    const v = currentView();
    const ex = cam.keys.find((k) => Math.abs(k.t - t) < 0.05);
    if (ex) ex.view = v; else cam.keys.push({ t, view: v, ease: 'ease' });
    cam.keys.sort((a, b) => a.t - b.t);
    selKey = cam.keys.findIndex((k) => Math.abs(k.t - t) < 0.05);
    commitAll();
    toast(ex ? 'Keyframe updated' : `Keyframe added at ${t.toFixed(2)} s — move the playhead and frame the next view`, 3200);
  };
  $('#kf-list').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    const a = e.target.closest('button')?.dataset.k;
    if (!li || !a) return;
    const i = +li.dataset.i, cam = scene().camera, k = cam.keys[i];
    selKey = i;
    if (a === 'go') { time = k.t; setViewMode('edit'); map.easeTo({ center: k.view.center, zoom: zoomFor(k.view.zoomRef, frame.w), bearing: k.view.bearing || 0, pitch: k.view.pitch || 0, duration: 500 }); updatePlayhead(); }
    if (a === 'update') { pushUndo(); k.view = currentView(); commitAll(); toast('Keyframe updated'); }
    if (a === 'del') { pushUndo(); cam.keys.splice(i, 1); selKey = null; commitAll(); }
    renderKeyframes();
  });
  $('#kf-list').addEventListener('change', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li || e.target.dataset.k !== 'ease') return;
    pushUndo();
    scene().camera.keys[+li.dataset.i].ease = e.target.value;
    rebuild(); save();
  });
  $('#globe-zoom').addEventListener('input', (e) => { scene().camera.globeZoom = +e.target.value; $('#globe-out').textContent = (+e.target.value).toFixed(1); rebuild(); previewCamera(); save(); });
  $('#globe-rotate').addEventListener('change', (e) => { scene().camera.followRotate = e.target.checked; rebuild(); previewCamera(); save(); });
  $('#orbit-set').onclick = () => { const cam = scene().camera; pushUndo(); cam.orbitView = currentView(); if (!(+cam.tilt)) cam.tilt = 55; commitAll(); previewCamera(); toast('The camera will orbit around this view'); };
  $('#orbit-speed').addEventListener('input', (e) => { scene().camera.orbitSpeed = +e.target.value; $('#orbit-out').textContent = `${e.target.value}°/s`; rebuild(); previewCamera(); save(); });
  $('#cam-cards').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cam]');
    if (!b) return;
    const cam = scene().camera;
    cam.mode = b.dataset.cam;
    if (cam.mode === 'fixed' && !cam.fixed) cam.fixed = currentView();
    if (cam.mode === 'follow' && cam.followZoomRef == null && model.fit) cam.followZoomRef = model.fit.zoomRef + 2;
    if (cam.mode === 'keyframes' && !(cam.keys || []).length) { cam.keys = [{ t: 0, view: currentView(), ease: 'ease' }]; toast('First keyframe set from the current view. Move the playhead, frame a new view and add another.', 4200); }
    if (cam.mode === 'orbit' && !cam.orbitView) { cam.orbitView = currentView(); if (!(+cam.tilt)) cam.tilt = 55; }
    if (cam.mode === 'globe' && !scene().look.globe) { scene().look.globe = true; applyLook(scene()); }
    rebuild();
    renderCamera();
    if (cam.mode === 'fixed' || cam.mode === 'keyframes') { setViewMode('edit'); showEditView(); }
    else previewCamera();
    save();
  });
  function previewCamera() {
    if (!hasContent(scene(), model) && scene().camera.mode !== 'orbit') return;
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
    $('#scene-len').value = [15, 30, 60, 120, 180, 300, 600].includes(+sc.sceneLength) ? String(sc.sceneLength) : '';
    $('#show-credits').checked = !!project.credits;
    $('#resolution').value = String(project.resolution);
    $('#fps').value = String(project.fps);
    $('#join').innerHTML = Object.entries(TRANSITIONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    $('#join').value = sc.transition || 'cut';
    $('#join-secs').value = String(sc.transitionSeconds || 0.8);
    const last = sceneIdx === project.scenes.length - 1;
    $('#join-row').hidden = last;
    $('#join-secs-row').hidden = last || (sc.transition || 'cut') === 'cut';
    $('#stinger-row').hidden = last || sc.transition !== 'stinger';
    $('#stinger-blend').value = sc.transitionBlend || 'screen';
    $('#stinger-name').textContent = sc.transitionMedia ? `Clip: ${sc.transitionMediaName || 'loaded'} · the cut happens halfway` : 'An ink splash, light sweep or logo sting that plays over the cut. The cut happens halfway.';
    $('#render-preset').value = '';
    renderAudioList();
    renderSoundSettings();
    renderLibrary();
  }
  const PRESETS = {
    yt1080: ['16:9', 1080, 30], yt4k: ['16:9', 2160, 30], reel: ['9:16', 1080, 30], igpost: ['4:5', 1080, 30],
    square: ['1:1', 1080, 30], cinema: ['21:9', 2160, 24], draft: ['16:9', 720, 24],
  };
  $('#render-preset').addEventListener('change', (e) => {
    const p = PRESETS[e.target.value];
    if (!p) return;
    [project.aspect, project.resolution, project.fps] = p;
    $('#aspect').value = project.aspect;
    $('#resolution').value = $('#resolution-top').value = String(project.resolution);
    $('#fps').value = String(project.fps);
    layout(true);
    updateEstimate();
    save();
    toast(`Set to ${e.target.selectedOptions[0].textContent}`);
  });
  $('#join-secs').addEventListener('change', (e) => { scene().transitionSeconds = +e.target.value; save(); });
  $('#stinger-btn').addEventListener('click', () => $('#file-stinger').click());
  $('#stinger-blend').addEventListener('change', (e) => { scene().transitionBlend = e.target.value; save(); });
  $('#file-sm').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    const L = selLayer && layerById(selLayer);
    if (!f || !L || L.kind !== 'smartmap') return;
    try {
      const text = await f.text();
      let data = [];
      if (/\.(geo)?json$/i.test(f.name) || text.trim().startsWith('{')) {
        const gj = JSON.parse(text);
        const feats = gj.type === 'FeatureCollection' ? gj.features : gj.type === 'Feature' ? [gj] : [];
        const numKey = (() => { for (const ft of feats) for (const [k, v] of Object.entries(ft.properties || {})) if (Number.isFinite(+v) && v !== '' && v !== null && typeof v !== 'boolean') return k; return null; })();
        for (const ft of feats) {
          const g = ft.geometry; if (!g) continue;
          let c = null;
          if (g.type === 'Point') c = g.coordinates;
          else { const ring = g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0][0] : g.type === 'LineString' ? g.coordinates : null; if (ring) { let x = 0, y = 0; for (const p of ring) { x += p[0]; y += p[1]; } c = [x / ring.length, y / ring.length]; } }
          if (c) data.push([+c[0].toFixed(5), +c[1].toFixed(5), numKey ? +ft.properties[numKey] || 0 : 1]);
        }
        L.style.dataName = `${f.name}${numKey ? ` · ${numKey}` : ''}`;
      } else {
        const r = parseCSVPoints(text);
        const vi = r.header.findIndex((h, i) => i !== r.lat && i !== r.lon && r.rows.filter((row) => Number.isFinite(+row[i]) && row[i] !== '').length > r.rows.length * 0.8);
        data = r.rows.map((row) => [+(+row[r.lon]).toFixed(5), +(+row[r.lat]).toFixed(5), vi >= 0 ? +row[vi] || 0 : 1]);
        L.style.dataName = `${f.name}${vi >= 0 ? ` · ${r.header[vi]}` : ''}`;
      }
      if (!data.length) throw new Error('No points with coordinates were found');
      pushUndo();
      L.style.data = data.slice(0, 20000);
      commitLayers(); renderLayerEditor();
      toast(`${data.length.toLocaleString()} points loaded`);
    } catch (err) { toast(err.message || 'Could not read that file', 4200); }
  });
  $('#file-stinger').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 120e6) { toast('Use a transition clip under 120 MB'); return; }
    const id = `vd_${Math.random().toString(36).slice(2, 10)}`;
    await putMedia(id, f);
    const sc = scene();
    sc.transitionMedia = id; sc.transitionMediaName = f.name;
    const v = videoFor(id);
    v?.el.addEventListener('loadedmetadata', () => { if (v.el.duration) { sc.transitionSeconds = Math.min(4, Math.max(0.4, +v.el.duration.toFixed(2))); renderExportSettings(); save(); } }, { once: true });
    renderExportSettings(); save();
    toast('Transition clip added — it plays over the cut to the next scene', 3600);
  });

  // ---- sound
  function renderSoundSettings() {
    const snd = project.sound ||= defaultSound();
    $('#snd-music').innerHTML = Object.entries(MUSIC).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    $('#snd-auto').checked = !!snd.auto;
    $('#snd-sfxvol').value = snd.sfxVolume;
    $('#snd-music').value = snd.music || 'none';
    $('#snd-musvol').value = snd.musicVolume;
    $('#snd-wind').checked = snd.zoomWind !== false;
    $('#snd-opts').hidden = !snd.auto;
  }
  $('#snd-box').addEventListener('input', (e) => {
    const el = e.target;
    const snd = project.sound ||= defaultSound();
    const k = { 'snd-auto': 'auto', 'snd-sfxvol': 'sfxVolume', 'snd-music': 'music', 'snd-musvol': 'musicVolume', 'snd-wind': 'zoomWind' }[el.id];
    if (!k) return;
    snd[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
    $('#snd-opts').hidden = !snd.auto;
    eventsCache = null;
    save();
    if (playing) setPlaying(true);
  });
  $('#snd-test').onclick = async () => {
    const { playFrom: pf } = await import('./audio.js');
    const demo = [{ t: 0, type: 'hudboot', p: {} }, { t: 0.5, type: 'whistle', p: { dur: 0.8 } }, { t: 1.3, type: 'explosion', p: { size: 1.2 } }, { t: 2.6, type: 'jet', p: { dur: 3 } }];
    pf({ ...project, audio: [], sound: { ...project.sound, auto: true, music: 'none' } }, 0, 1, demo, 6).catch(() => {});
  };
  // sound library
  let libCat = Object.keys(SOUND_LIBRARY)[0];
  function renderLibrary() {
    $('#lib-cats').innerHTML = Object.keys(SOUND_LIBRARY).map((c) => `<button type="button" data-cat="${esc(c)}" class="${c === libCat ? 'active' : ''}">${esc(c)}</button>`).join('');
    $('#lib-list').innerHTML = Object.entries(SOUND_LIBRARY[libCat]).map(([k, n]) => `<div class="lib-item"><span>${esc(n)}</span><button class="mini" data-play="${k}" title="Listen">▶</button><button class="mini" data-place="${k}" title="Place at the playhead">+</button></div>`).join('');
    const list = project.sfx || [];
    $('#lib-placed').innerHTML = list.map((c, i) => `<li data-i="${i}"><span>${esc(SOUND_NAMES[c.type] || c.type)}</span><input type="number" step="0.1" min="0" data-f="t" value="${(+c.t).toFixed(2)}" title="Starts at (s, whole video)"><input type="range" min="0" max="2" step="0.05" data-f="vol" value="${c.vol ?? 1}" title="Volume"><button class="mini" data-del="${i}" title="Remove">✕</button></li>`).join('');
  }
  $('#lib-cats').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) { libCat = b.dataset.cat; renderLibrary(); } });
  $('#lib-list').addEventListener('click', (e) => {
    const pl = e.target.closest('[data-play]'), pc = e.target.closest('[data-place]');
    if (pl) previewLibSound(pl.dataset.play).catch(() => {});
    if (pc) {
      pushUndo();
      (project.sfx ||= []).push({ type: pc.dataset.place, t: +projTime(viewMode === 'play' ? time : model.trimIn).toFixed(2), vol: 1, dur: 2.5 });
      eventsCache = null; renderLibrary(); renderTimeline(); save();
      toast(`${SOUND_NAMES[pc.dataset.place]} placed at the playhead`);
    }
  });
  $('#lib-placed').addEventListener('change', (e) => {
    const li = e.target.closest('li[data-i]'); if (!li) return;
    const c = project.sfx[+li.dataset.i]; if (!c) return;
    pushUndo();
    c[e.target.dataset.f] = Math.max(0, +e.target.value || 0);
    eventsCache = null; renderTimeline(); save();
  });
  $('#lib-placed').addEventListener('click', (e) => {
    const d = e.target.closest('[data-del]'); if (!d) return;
    pushUndo(); project.sfx.splice(+d.dataset.del, 1); eventsCache = null; renderLibrary(); renderTimeline(); save();
  });

  function renderAudioList() {
    const ul = $('#audio-list');
    const tracks = project.audio || [];
    ul.innerHTML = tracks.map((tr) => `
      <li data-id="${tr.id}">
        <div class="ah"><b>${tr.kind === 'voice' ? '🎙' : '♪'}</b><span title="${esc(tr.name)}">${esc(tr.name)}</span><small class="muted">${(tr.duration || 0).toFixed(1)} s</small></div>
        <label class="row"><span>Volume</span><input type="range" min="0" max="1.5" step="0.01" data-a="volume" value="${tr.volume}"></label>
        <div class="grid3"><label>Starts at (s)<input type="number" step="0.1" min="0" data-a="start" value="${(+tr.start).toFixed(2)}"></label><label>Fade in (s)<input type="number" step="0.1" min="0" data-a="fadeIn" value="${tr.fadeIn}"></label><label>Fade out (s)<input type="number" step="0.1" min="0" data-a="fadeOut" value="${tr.fadeOut}"></label></div>
        <div class="btn-row"><button class="btn sm" data-a="mute">${tr.muted ? 'Unmute' : 'Mute'}</button><button class="btn sm danger" data-a="del">Remove</button></div>
      </li>`).join('');
  }
  $('#audio-list').addEventListener('input', (e) => {
    const li = e.target.closest('li[data-id]');
    const tr = li && (project.audio || []).find((x) => x.id === li.dataset.id);
    const k = e.target.dataset.a;
    if (!tr || !k || e.target.tagName !== 'INPUT') return;
    tr[k] = Math.max(0, +e.target.value || 0);
    renderTimeline(); save();
  });
  $('#audio-list').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    const tr = li && (project.audio || []).find((x) => x.id === li.dataset.id);
    const k = e.target.closest('button')?.dataset.a;
    if (!tr || !k) return;
    if (k === 'mute') { tr.muted = !tr.muted; renderAudioList(); save(); }
    if (k === 'del') { pushUndo(); project.audio = project.audio.filter((x) => x !== tr); deleteMedia(tr.id).catch(() => {}); renderAudioList(); renderTimeline(); save(); }
  });
  $('#audio-add').onclick = () => $('#file-audio').click();
  $('#file-audio').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      pushUndo();
      await addAudioFile(project, f, 'music', 0);
      renderAudioList(); renderTimeline(); save();
      toast('Music added — it plays with the preview and is mixed into the video');
    } catch (err) { toast(err.message || 'Could not read that audio file'); }
  });
  $('#audio-rec').onclick = async () => {
    const btn = $('#audio-rec');
    if (isRecording()) {
      const blob = await stopRecording();
      setPlaying(false);
      btn.classList.remove('rec');
      btn.textContent = '🎙 Record voiceover';
      if (!blob || !blob.size) return;
      try {
        pushUndo();
        const f = new File([blob], `Voiceover ${(project.audio || []).filter((t) => t.kind === 'voice').length + 1}`, { type: blob.type });
        await addAudioFile(project, f, 'voice', recStart);
        renderAudioList(); renderTimeline(); save();
        toast('Voiceover added');
      } catch (err) { toast(err.message || 'Could not use the recording'); }
      return;
    }
    try {
      await startRecording();
    } catch { toast('Microphone not available — allow microphone access to record'); return; }
    recStart = projTime(time);
    btn.classList.add('rec');
    btn.textContent = '■ Stop recording';
    setViewMode('play');
    if (!playing) setPlaying(true);
  };
  let recStart = 0;
  $('#save-png').onclick = () => saveStill();
  $('#still-start').addEventListener('change', (e) => { scene().stillStart = +e.target.value; rebuild(); save(); });
  $('#still-end').addEventListener('change', (e) => { scene().stillEnd = +e.target.value; rebuild(); save(); });
  /** Make the scene a set length: slower route or a longer hold at the end. */
  function setSceneLength(target) {
    const sc = scene();
    if (!(target > 0)) return;
    pushUndo();
    sc.trimOut = null;
    const fill = $('#scene-len-fill').value;
    if (fill === 'route' && model.drawable.length) {
      const pauses = model.runs.reduce((a, r, i) => a + (i < model.runs.length - 1 ? r.pauseAfter : 0), 0);
      const other = model.total - (model.drawEnd - model.drawStart) + pauses;
      sc.lineSeconds = +Math.max(0.5, target - other).toFixed(2);
      rebuild();
    }
    const extra = target - buildScene(sc, frame.w, frame.h).total;
    sc.stillEnd = +Math.max(0, (+sc.stillEnd || 0) + extra).toFixed(2);
    sc.sceneLength = target;
    rebuild(); renderExportSettings(); save();
    toast(`Scene set to ${target >= 60 ? `${(target / 60).toFixed(target % 60 ? 1 : 0)} min` : `${target} s`}`);
  }
  $('#scene-len').addEventListener('change', (e) => {
    let v = e.target.value;
    if (!v) { scene().sceneLength = null; save(); return; }
    if (v === 'custom') { const r = prompt('Scene length in seconds (up to 3600)', String(Math.round(model.total))); if (!r) { e.target.value = ''; return; } v = clamp(+r || 0, 1, 3600); }
    setSceneLength(+v);
  });
  $('#show-credits').addEventListener('change', (e) => { project.credits = e.target.checked; save(); });
  const setResolution = (v) => { project.resolution = +v; $('#resolution').value = String(v); $('#resolution-top').value = String(v); layout(true); updateEstimate(); save(); };
  $('#resolution').addEventListener('change', (e) => setResolution(e.target.value));
  $('#resolution-top').addEventListener('change', (e) => setResolution(e.target.value));
  $('#fps').addEventListener('change', (e) => { project.fps = +e.target.value; updateEstimate(); save(); });
  $('#join').addEventListener('change', (e) => { scene().transition = e.target.value; renderExportSettings(); save(); });
  $('#play-preview').onclick = () => { time = 0; setViewMode('play'); setPlaying(true); };

  function projectDuration() {
    return project.scenes.reduce((s, sc, i) => s + (i === sceneIdx ? model.duration : buildScene(sc, frame.w, frame.h).duration), 0);
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
  /** A scene can be played/exported with a route, signs or just layers (points, symbols, 3D models…). */
  const hasContent = (sc, m) => !!(m?.drawable.length || sc.signs?.length || (sc.layers || []).some((L) => !L.hidden) || (sc.camera?.mode === 'keyframes' && (sc.camera.keys || []).length > 1) || sc.camera?.mode === 'orbit');
  function setStep(s) {
    step = s;
    visited.add(s);
    $$('#stepper [data-step]').forEach((b) => {
      const k = b.dataset.step;
      b.classList.toggle('active', k === s);
      const done = k !== s && visited.has(k) && (k !== 'route' || model?.drawable.length || (scene().layers || []).length);
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
  $('#skip-route').onclick = () => setStep('layers');
  $('#next-step').onclick = () => {
    if (step === 'export') { startExport(); return; }
    setStep(STEPS[STEPS.indexOf(step) + 1]);
  };

  // ---------------------------------------------------------------- playback & timeline
  function applyCamera(t) {
    const c = model.cameraAt(t);
    jumpCam(c, scene(), t);
    applyTimeEffects(t);
  }
  /** Things inside the map that change with time: terrain floods and growing 3D buildings. */
  function applyTimeEffects(t, sc = scene(), m = model) {
    if (!map || !sc) return;
    floods?.update(sc, t);
    models?.update(sc, t, layerTiming);
    wayback?.update(sc, t, layerTiming);
    affected?.update(sc, t, layerTiming);
    twin?.update(sc, t, layerTiming);
    if (!exporting) { const f = mapFilterAt(sc, t); const el = $('#map'); if (el.style.filter !== f) el.style.filter = f === 'none' ? '' : f; }
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
    if (m === 'play') {
      closePops(); stopPlacing(); cancelDrawing();
      const cam = scene().camera;
      if (cam.mode === 'fixed' && !cam.fixed && !model?.fit) { cam.fixed = currentView(); rebuild(); }
    }
    repaint();
  }
  function setPlaying(p) {
    const was = playing;
    playing = p;
    document.body.classList.toggle('is-playing', p);
    if (p) { playStartNow = performance.now(); playStartTime = time; playStartOut = outOf(time); playFrom(project, sceneOffset() + playStartOut, tl?.state.rate || 1, soundEvents(), sceneOffset() + model.duration).catch(() => {}); }
    else if (was) stopPlayback();
  }
  /** Automatic sound effects for the whole project (cached until something changes). */
  let eventsCache = null;
  function soundEvents() {
    const key = JSON.stringify([project.scenes.map((s) => [s.layers, s.camera, s.legs.length, s.trimIn, s.trimOut, s.transition, s.edits]), project.sound, project.sfx, frame.w, frame.h]);
    if (eventsCache?.key === key) return eventsCache.ev;
    let ev = [];
    try { ev = buildEvents(project, project.scenes.map((sc) => buildScene(sc, frame.w, frame.h))); } catch (err) { console.warn('sound events', err); }
    eventsCache = { key, ev };
    return ev;
  }
  /** Seconds from the start of the whole video for scene time t. */
  let offsetCache = null;
  function sceneOffset() {
    if (offsetCache && offsetCache.key === sceneIdx && offsetCache.n === project.scenes.length) return offsetCache.v;
    let v = 0;
    for (let i = 0; i < sceneIdx; i++) v += buildScene(project.scenes[i], frame.w, frame.h).duration;
    offsetCache = { key: sceneIdx, n: project.scenes.length, v };
    return v;
  }
  /** Output time (seconds into this scene's part of the video) for scene time t; skips deleted sections. */
  let playStartOut = 0;
  function outOf(t) {
    if (!model?.outTime) return t - (model?.trimIn || 0);
    const o = model.outTime(t);
    if (o != null) return o;
    const next = model.pieces.find((p) => p.type === 'play' && p.a >= t - 1e-6);
    return next ? next.o0 : model.duration;
  }
  const projTime = (t) => sceneOffset() + outOf(t);
  function togglePlay() {
    if (!hasContent(scene(), model)) { toast('Add a route or a layer first'); return; }
    if (viewMode !== 'play') setViewMode('play');
    if (!playing && (time < model.trimIn || time >= model.trimOut - 0.02)) time = model.trimIn;
    setPlaying(!playing);
  }
  $('#tl-play').onclick = togglePlay;

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    if (!project || exporting) return;
    if (playing) {
      let o = playStartOut + ((now - playStartNow) / 1000) * (tl.state.rate || 1);
      if (o >= model.duration) {
        if (tl.state.loop) { o = 0; playStartOut = 0; playStartTime = model.trimIn; playStartNow = now; playFrom(project, sceneOffset(), tl.state.rate, soundEvents(), sceneOffset() + model.duration).catch(() => {}); }
        else { o = model.duration; setPlaying(false); }
      }
      time = model.srcTime ? model.srcTime(o) : model.trimIn + o;
      applyCamera(time);
      updatePlayhead();
      repaint();
    }
  }

  // ---------------------------------------------------------------- timeline (module)
  let selKey = null;
  const tl = createTimeline({
    scene, model: () => (project ? model : null), project: () => project, fps: () => project?.fps || 30,
    toast,
    soundName: (k) => SOUND_NAMES[k],
    sceneTimeOf: (pt) => { const o = pt - sceneOffset(); if (o < -1e-6 || o > model.duration + 1e-6) return null; return model.srcTime ? model.srcTime(o) : model.trimIn + o; },
    sfxChanged: () => { eventsCache = null; if (step === 'export') renderLibrary(); },
    getTime: () => time,
    seek(t) { time = clamp(t, 0, model.total); setViewMode('play'); setPlaying(false); applyCamera(time); tl.playhead(); repaint(); },
    isPlaying: () => playing,
    busy: () => exporting || !project,
    selLayer: () => selLayer,
    selectLayer(id) { if (step !== 'layers') setStep('layers'); selectLayer(id); },
    selKey: () => selKey,
    selectKey(i) { selKey = i; if (step !== 'camera') setStep('camera'); renderKeyframes(); },
    pushUndo,
    commit(o = {}) { if (o.light) { offsetCache = null; rebuild(); repaint(); save(); } else commitAll(); },
    sceneOffset,
    splitAt: (t) => splitScene(t),
    pause: () => setPlaying(false),
    play: () => { if (!playing) togglePlay(); },
    rateChanged: () => { if (playing) setPlaying(true); },
  });
  function renderTimeline() { tl.render(); updateSpeed(); }
  function updatePlayhead() { tl.playhead(); }
  /** Re-render everything after a change that may touch any part of the scene. */
  function commitAll() {
    offsetCache = null;
    fixLegs();
    rebuild();
    renderLegs(); renderSignList(); renderLayerList();
    if (step === 'layers') renderLayerEditor();
    if (step === 'camera') renderCamera();
    if (step === 'export') renderExportSettings();
    renderScenes();
    save();
  }
  function splitScene(t) {
    const m = model;
    if (t <= m.trimIn + 0.1 || t >= m.trimOut - 0.1) { toast('Move the playhead inside the scene to split it'); return; }
    const A = scene();
    const B = JSON.parse(JSON.stringify(A));
    B.id = `sc_${Math.random().toString(36).slice(2, 10)}`;
    B.name = `${A.name} · 2`;
    A.trimOut = +t.toFixed(3);
    B.trimIn = +t.toFixed(3);
    B.transition = A.transition;
    A.transition = 'cut';
    project.scenes.splice(sceneIdx + 1, 0, B);
    offsetCache = null;
    renderScenes();
    rebuild();
    save();
    toast(`Split at ${t.toFixed(2)} s — the second part is now “${B.name}”`, 3200);
  }

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
      <div class="scene-tab ${i === sceneIdx ? 'active' : ''}" data-i="${i}" draggable="true" title="Drag to change the order">
        <span class="n">${i + 1}</span>${miniSVG(sc)}<b>${esc(sc.name)}</b><small data-dur="${i}"></small>
        <button class="menu-btn" data-menu="${i}" title="Scene options">⋯</button>${project.scenes.length > 1 ? `<button class="del-scene" data-delscene="${i}" title="Delete scene">✕</button>` : ''}
      </div>`).join('');
    updateSceneDurations();
  }
  function updateSceneDurations() {
    if (!project) return;
    $$('#scene-tabs [data-dur]').forEach((el) => {
      const i = +el.dataset.dur;
      const t = i === sceneIdx ? model.duration : buildScene(project.scenes[i], frame.w, frame.h).duration;
      el.textContent = `${t.toFixed(1)} s`;
    });
    const tab = $(`#scene-tabs [data-i="${sceneIdx}"] svg.mini`);
    if (tab) tab.outerHTML = miniSVG(scene());
  }
  // drag scene tabs to reorder
  let dragScene = null;
  $('#scene-tabs').addEventListener('dragstart', (e) => { const tab = e.target.closest('.scene-tab'); if (!tab) return; dragScene = +tab.dataset.i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragScene)); });
  $('#scene-tabs').addEventListener('dragover', (e) => { const tab = e.target.closest('.scene-tab'); if (dragScene == null || !tab) return; e.preventDefault(); $$('#scene-tabs .scene-tab').forEach((t) => t.classList.toggle('drag-over', t === tab)); });
  $('#scene-tabs').addEventListener('dragleave', (e) => { if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) $$('#scene-tabs .scene-tab').forEach((t) => t.classList.remove('drag-over')); });
  $('#scene-tabs').addEventListener('drop', (e) => {
    const tab = e.target.closest('.scene-tab');
    $$('#scene-tabs .scene-tab').forEach((t) => t.classList.remove('drag-over'));
    if (dragScene == null || !tab) return;
    e.preventDefault();
    const from = dragScene, to = +tab.dataset.i;
    dragScene = null;
    if (from === to) return;
    moveScene(from, to);
  });
  $('#scene-tabs').addEventListener('dragend', () => { dragScene = null; $$('#scene-tabs .scene-tab').forEach((t) => t.classList.remove('drag-over')); });
  function moveScene(from, to) {
    const scs = project.scenes;
    const cur = scs[sceneIdx];
    const [sc] = scs.splice(from, 1);
    scs.splice(to, 0, sc);
    sceneIdx = scs.indexOf(cur);
    offsetCache = null; eventsCache = null;
    renderScenes(); renderTimeline(); save();
    toast(`Moved “${sc.name}” to position ${to + 1}`);
  }
  $('#scene-tabs').addEventListener('click', (e) => {
    const ds = e.target.closest('[data-delscene]');
    if (ds) {
      e.stopPropagation();
      const i = +ds.dataset.delscene, scs = project.scenes;
      if (scs.length > 1 && confirm(`Delete “${scs[i].name}”?`)) { scs.splice(i, 1); offsetCache = null; eventsCache = null; selectScene(Math.min(i <= sceneIdx ? Math.max(0, sceneIdx - (i < sceneIdx ? 1 : 0)) : sceneIdx, scs.length - 1), true); save(); }
      return;
    }
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
      if (a === 'left' || a === 'right') { const j = a === 'left' ? i - 1 : i + 1; [scs[i], scs[j]] = [scs[j], scs[i]]; offsetCache = null; eventsCache = null; selectScene(j, true); }
      if (a === 'del' && confirm(`Delete “${scs[i].name}”?`)) { scs.splice(i, 1); selectScene(Math.min(sceneIdx, scs.length - 1), true); }
      save();
    });
    document.body.append(m);
  }
  // quick camera moves (Zoom-To, Orbit, Point-to-Point, Spiral, Fly-To and Orbit) for the current scene
  $('#qs-chips').innerHTML = Object.entries(QS_TEMPLATES).map(([k, t]) => `<button class="chip" data-tpl="${k}">${t.name}</button>`).join('');
  $('#qs-chips').onclick = (e) => {
    const b = e.target.closest('[data-tpl]');
    if (!b) return;
    openQuickStart({
      kind: b.dataset.tpl,
      actionLabel: 'Apply to this scene',
      onCreate: ({ scenes }) => {
        pushUndo();
        const cur = scene();
        const [first, ...rest] = scenes;
        cur.camera = { ...cur.camera, mode: 'keyframes', keys: first.camera.keys, tilt: first.camera.tilt, intro: 'none', outro: 'none' };
        Object.assign(cur.look, { theme: first.look.theme, globe: first.look.globe, atmosphere: first.look.atmosphere, clouds: first.look.clouds, cloudMode: first.look.cloudMode, cloudAmount: first.look.cloudAmount, buildings3d: first.look.buildings3d, terrain: first.look.terrain, placeNames: first.look.placeNames, rasterLabels: first.look.rasterLabels });
        cur.layers = [...(cur.layers || []), ...first.layers];
        if (!model.drawable.length) { cur.stillStart = 0; cur.stillEnd = 0.4; }
        rest.forEach((sc, i) => { sc.name = sc.name || `Scene ${project.scenes.length + 1}`; project.scenes.splice(sceneIdx + 1 + i, 0, sc); });
        if (rest.length) cur.transition = 'dissolve';
        offsetCache = null; eventsCache = null;
        styleKey = null;
        applyLook(cur);
        renderScenes();
        commitLayers();
        renderCamera();
        setViewMode('play');
        time = model.trimIn;
        applyCamera(time);
        updatePlayhead();
        toast(rest.length ? `Applied — ${rest.length} more scene${rest.length === 1 ? '' : 's'} added for the other places` : 'Camera move applied — press play', 3600);
      },
    });
  };

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
    models?.clear();
    models?.sync(scene()).then(() => applyTimeEffects(null));
    wayback?.sync(scene());
    preloadImages(scene()).then(repaint);
    rebuild();
    showEditView();
    renderScenes();
    renderLegs();
    setStep(step);
  }

  // ---------------------------------------------------------------- project-level controls
  $('#project-name').addEventListener('input', (e) => { project.name = e.target.value || 'Untitled trip'; save(); });
  $('#aspect').addEventListener('change', (e) => { project.aspect = e.target.value; layout(true); save(); });
  $('#save-file').onclick = async () => {
    const blob = new Blob([await projectFileJSON(project)], { type: 'application/json' });
    downloadBlob(blob, `${slug(project.name)}.mapanim.json`);
  };

  // keyboard
  document.addEventListener('keydown', (e) => {
    if ($('#editor').hidden || exporting) return;
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName) && document.activeElement.type !== 'range' && document.activeElement.type !== 'checkbox';
    if (e.key === 'Escape') { stopPlacing(); cancelDrawing(); closePops(); selPoint = null; selectSign(null); repaint(); return; }
    if (e.key === 'Enter' && drawing && !typing) { e.preventDefault(); finishDrawing(); return; }
    if (typing) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); return; }
    if (!(step === 'route' && selPoint && e.key.startsWith('Arrow')) && tl.handleKey(e)) { e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (step === 'route' && selPoint) { e.preventDefault(); deletePoint(selPoint.li, selPoint.i); }
      else if (step === 'layers' && selLayer) { e.preventDefault(); deleteLayer(selLayer); }
      else if (step === 'signs' && selSign != null) { e.preventDefault(); deleteSign(selSign); }
    }
  });

  // ---------------------------------------------------------------- export
  let exportAbort = null, exportUrl = null, expScene = null;
  /** Render the frame at the playhead at full resolution and download it as PNG. */
  async function saveStill() {
    if (exporting) return;
    const { width, height } = videoSize(project.aspect, project.resolution);
    setPlaying(false);
    closePops();
    exporting = true;
    toast('Rendering the frame…', 10000);
    const mapEl = $('#map');
    stage.classList.add('exporting');
    Object.assign(mapEl.style, { left: `${frame.x}px`, top: `${frame.y}px`, width: `${frame.w}px`, height: `${frame.h}px`, filter: 'none' });
    map.resize();
    const px = width / frame.w;
    map.setPixelRatio(px);
    const unit = (Math.min(frame.w, frame.h) / 720) * px;
    const sc = scene();
    const t = viewMode === 'play' ? time : Math.max(model.trimIn, Math.min(model.trimOut, time));
    try {
      const blob = await renderStill({
        map, width, height,
        beforeFrame: (s2, m, tt) => seekScene(s2, tt, layerTiming),
        prepareScene: async (s2) => { await applyLook(s2); await floods.sync(s2); models.clear(); await models.sync(s2); wayback.sync(s2); affected.sync(s2); twin.sync(s2); await preloadImages(s2); await preloadSignImages(s2.signs); await loadFonts(s2); bldFactor = null; return buildScene(s2, frame.w, frame.h); },
        applyCamera: (m, tt) => { const c = m.cameraAt(tt); jumpCam(c, sc, tt); applyTimeEffects(tt, sc, m); },
        mapFilter: (s2, tt) => mapFilterAt(s2, tt),
        background: spaceBg,
        drawFrame: (ctx, s2, m, tt) => {
          const full = { x: 0, y: 0, w: width, h: height };
          const mc = map.getCanvas();
          const lens = lensFor(s2, m, tt, (ll) => map.project(ll).y / frame.h);
          if (lens?.dof) drawDepthOfField(ctx, mc, 0, 0, mc.width, mc.height, full, { ...lens, filter: gradeFilter(s2.look.grade) }, unit);
          drawGradeWash(ctx, full, s2.look.grade);
          renderScene(ctx, { map, model: m, scene: s2, time: tt, px, unit, frame: full, exact: true });
          drawVignette(ctx, full, +s2.camera.lens?.vignette || 0);
          drawLetterbox(ctx, full, s2.look, tt, unit);
          renderCaptions(ctx, { map, model: m, scene: s2, time: tt, px, unit, frame: full, exact: true });
          drawScreenEffects(ctx, s2, { frame: full, unit, time: tt, src: { canvas: mc, sx: 0, sy: 0, sw: mc.width, sh: mc.height } }, layerTiming);
          if (project.credits) drawAttribution(ctx, themeAttribution(s2.look), unit, width, height);
        },
      }, sc, t);
      downloadBlob(blob, `${slug(project.name)}-${t.toFixed(2)}s-${width}x${height}.png`);
      toast('Frame saved as PNG');
    } catch (err) {
      console.error(err);
      toast(`Could not render the frame: ${err.message || err}`);
    } finally {
      exporting = false;
      stage.classList.remove('exporting');
      Object.assign(mapEl.style, { left: '', top: '', width: '', height: '' });
      mapEl.style.filter = gradeFilter(scene().look.grade);
      map.setPixelRatio(window.devicePixelRatio || 1);
      layout();
      if (viewMode === 'play') applyCamera(time); else showEditView();
    }
  }

  async function startExport() {
    if (exporting) return;
    if (!project.scenes.some((sc) => hasContent(sc, buildScene(sc, frame.w, frame.h)))) { toast('Add a route or a layer first'); return; }
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
      const result = await exportVideo({
        scenes: project.scenes, map, width, height, fps, join: project.join === 'fade' ? 'fadeBlack' : project.join,
        signal: exportAbort.signal,
        durationOf: (sc) => buildScene(sc, frame.w, frame.h).duration,
        mapFilter: (sc, tt) => mapFilterAt(sc, tt),
        background: spaceBg,
        mixAudio: (project.audio || []).some((t) => !t.muted) || hasSound(project) ? (d) => mixProject(project, d, soundEvents()) : null,
        beforeFrame: (sc, m, t) => seekScene(sc, t, layerTiming),
        prepareScene: async (sc) => {
          await applyLook(sc);
          floods.clear();
          await floods.sync(sc);
          models.clear();
          await models.sync(sc);
          wayback.sync(sc);
          await preloadImages(sc);
          await preloadSignImages(sc.signs);
          await loadFonts(sc);
          bldFactor = null;
          expScene = sc;
          return buildScene(sc, frame.w, frame.h);
        },
        applyCamera: (m, t) => {
          const c = m.cameraAt(t);
          jumpCam(c, expScene, t);
          applyTimeEffects(t, expScene, m);
        },
        drawFrame: (ctx, sc, m, t) => {
          const full = { x: 0, y: 0, w: width, h: height };
          const mc = map.getCanvas();
          const lens = lensFor(sc, m, t, (ll) => map.project(ll).y / frame.h);
          if (lens?.dof) drawDepthOfField(ctx, mc, 0, 0, mc.width, mc.height, full, { ...lens, filter: gradeFilter(sc.look.grade) }, unit);
          if (sc.look.zoomBlur) drawZoomBlur(ctx, mc, 0, 0, mc.width, mc.height, full, zoomSpeedAt(m, t), +sc.look.zoomBlurAmount || 1);
          drawGradeWash(ctx, full, sc.look.grade);
          renderScene(ctx, { map, model: m, scene: sc, time: t, px, unit, frame: full, exact: true });
          drawVignette(ctx, full, +sc.camera.lens?.vignette || 0);
          drawLetterbox(ctx, full, sc.look, t, unit);
          renderCaptions(ctx, { map, model: m, scene: sc, time: t, px, unit, frame: full, exact: true });
          drawScreenEffects(ctx, sc, { frame: full, unit, time: t, src: { canvas: mc, sx: 0, sy: 0, sw: mc.width, sh: mc.height } }, layerTiming);
          if (project.credits) drawAttribution(ctx, themeAttribution(sc.look), unit, width, height);
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
      const { blob, ext, codec } = result;
      exportUrl = URL.createObjectURL(blob);
      const name = `${slug(project.name)}-${width}x${height}.${ext}`;
      const a = $('#render-download');
      a.href = exportUrl;
      a.download = name;
      a.hidden = false;
      a.textContent = `Download ${ext.toUpperCase()} · ${(blob.size / 1e6).toFixed(1)} MB`;
      if (((project.audio || []).some((t) => !t.muted) || hasSound(project)) && !result.audio) toast('This browser could not encode the soundtrack, so the video is silent', 4200);
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
      project.audio ||= [];
      project.models ||= [];
      project.sound = { ...defaultSound(), ...(project.sound || {}) };
      offsetCache = null; eventsCache = null;
      models?.clear();
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
      models.sync(scene()).then(() => applyTimeEffects(null));
      stylePromise.then(() => { wayback.sync(scene()); applyTimeEffects(null); });
      preloadImages(scene()).then(repaint);
      loadFonts(scene()).then(repaint);
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
  sc.look.rasterLabels ??= true;
  sc.look.rasterRoads ??= false;
  sc.look.north ||= { ...defaultNorth(), style: sc.look.compass ? 'compass' : 'none' };
  sc.look.scaleBar ||= defaultScaleBar();
  sc.look.grade ||= defaultGrade();
  c.keys ||= [];
  c.orbitSpeed ??= 12;
  sc.markers ||= [];
  sc.edits ||= { cuts: [], holds: [] };
  sc.look.letterbox ??= 'none';
  sc.trimIn ??= 0;
  if (sc.trimOut === undefined) sc.trimOut = null;
  sc.transition ||= 'cut';
  sc.transitionSeconds ??= 0.8;
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
  if (!text) return;
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
