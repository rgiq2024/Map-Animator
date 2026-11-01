// Showcase GIS elements: spectral split / false-colour imagery, split-screen grid, map diorama block with
// floating glass layer plates, wildlife & weather data pins, hexagon icon badges, flow lines, light beams,
// network mesh, viewshed (line of sight blocked by buildings), drone video footprint (FMV) with a player
// window, a hologram projection effect and scrolling code text.
import { placeAt } from './place.js';
import { imageFor } from './geoimage.js';

const MONO = '"JetBrains Mono",ui-monospace,Menlo,monospace';
const UI = '"Inter","Segoe UI",system-ui,sans-serif';
const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const backOut = (u) => { const c = 1.7, x = clamp(u, 0, 1) - 1; return 1 + (c + 1) * x ** 3 + c * x ** 2; };
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
function rgbOf(hex) {
  const h = (hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const hexA = (hex, a) => { const [r, g, b] = rgbOf(hex); return `rgba(${r},${g},${b},${a})`; };
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
const prog = (L, tm) => (tm.edit || L.anim === 'none' ? 1 : clamp(tm.tau / Math.max(0.1, +L.duration || 1), 0, 1));
const kxOf = (lat) => 111320 * Math.cos(lat * D2R);
const KY = 110540;
const POS = { 'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right' };
const ring0 = (g) => (g?.type === 'Polygon' ? g.coordinates[0] : g?.type === 'LineString' ? g.coordinates : []);
function inPoly(x, y, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** Seeded points inside a geographic ring. */
function samplePoly(ring, n, seed) {
  const r = rng(seed);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const out = [];
  for (let k = 0; out.length < n && k < n * 60; k++) { const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0); if (inPoly(x, y, ring)) out.push([x, y]); }
  return out;
}
/** Converts a rectangle in drawing units to the matching rectangle of the map's WebGL canvas. */
function mapSrc(o, x, y, w, h) {
  const m = o.map;
  if (!m) return null;
  const el = m.getContainer(), cw = el.clientWidth, ch = el.clientHeight;
  const a = m.unproject([cw / 2, ch / 2]), b = m.unproject([cw / 2 + 50, ch / 2 + 50]);
  const pa = o.proj([a.lng, a.lat]), pb = o.proj([b.lng, b.lat]);
  const sx = (pb[0] - pa[0]) / 50 || 1, sy = (pb[1] - pa[1]) / 50 || 1;
  const ox = pa[0] - (cw / 2) * sx, oy = pa[1] - (ch / 2) * sy;
  const mc = m.getCanvas(), r = mc.width / cw;
  return { canvas: mc, sx: ((x - ox) / sx) * r, sy: ((y - oy) / sy) * r, sw: (w / sx) * r, sh: (h / sy) * r };
}
function drawMapCrop(ctx, o, x, y, w, h, dx, dy, dw, dh) {
  const s = mapSrc(o, x, y, w, h);
  if (!s) return false;
  try { ctx.drawImage(s.canvas, s.sx, s.sy, s.sw, s.sh, dx, dy, dw, dh); return true; } catch { return false; }
}
const offs = new Map();
function off(key, w, h) {
  let c = offs.get(key);
  if (!c) { c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); offs.set(key, c); }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

// ================================================================= registry
export const VZ_KINDS = {
  spectral: { name: 'Spectral imagery', icon: '◧', geom: null, desc: 'Split screen of the map in sepia and false colour (spectral / thermal / vegetation) with analysis frames and labels' },
  splitgrid: { name: 'Split screen', icon: '⊞', geom: null, desc: 'Two, three or four panels: the map in one, your pictures in the others' },
  block: { name: 'Map diorama', icon: '▱', geom: 'polygon', desc: 'The area as a 3D block on a table, with glass layer plates floating above it' },
  datapin: { name: 'Data pin', icon: '🐾', geom: 'point', desc: 'Wildlife marker with value and bars, or a weather & crop badge (sun, temperature, wheat %)' },
  hexbadges: { name: 'Icon badges', icon: '⬡', geom: null, desc: 'A row or column of hexagon badges with icons (°C, plants, water, NPK, sun…)' },
  flowlines: { name: 'Flow lines', icon: '≋', geom: 'line', desc: 'Parallel stream lines with moving arrows along a valley, river or route' },
  beams: { name: 'Light beams', icon: '✺', geom: 'point', desc: 'Colourful arcs of light shooting out from a hub with travelling particles' },
  mesh: { name: 'Network mesh', icon: '⋰', geom: 'polygon', desc: 'Glowing nodes connected by lines with pulses (smart city / 5G network)' },
  viewshed: { name: 'Viewshed', icon: '👁', geom: 'point', desc: 'What can be seen from a point: rays blocked by the buildings around it' },
  kgraph: { name: 'Knowledge graph', icon: '🕸', geom: null, desc: 'Linked entities (people, vehicles, repairs, incidents…) that grow out from a centre node, with a details panel' },
  tiles: { name: 'Highlight tiles', icon: '▣', geom: 'polygon', desc: 'Glowing squares that pop over the map, or a two-colour mosaic tint over the area' },
  vortex: { name: 'Storm vortex', icon: '🌀', geom: 'point', desc: 'Spinning light streaks round an eye with wind-speed labels' },
  vessel: { name: 'Ship track (AIS)', icon: '🚢', geom: 'line', desc: 'A ship sails a dashed track with a live LAT / LON / COG / SOG callout and a buoy at the end' },
  photocard: { name: 'Photo card', icon: '🖼', geom: 'point', desc: 'A picture card with a bracketed title, linked to a place' },
  arpanel: { name: 'AR floating panel', icon: '◇', geom: null, desc: 'A tilted holographic panel with a wireframe terrain and floating numbers' },
  linecallout: { name: 'Line callouts', icon: '⌐', geom: 'point', desc: 'A target circle with lines to text boxes (issue, big number that counts up, label)' },
  detect: { name: 'Object detection', icon: '⬚', geom: 'line', desc: 'Vehicles moving along a road with tracking boxes or rings and labels' },
  fmv: { name: 'Drone video footprint', icon: '🎥', geom: 'line', desc: 'A drone flies the path: camera footprint and track on the map, and a video player window' },
};
export const VZ_ANIMS = {
  spectral: { wipe: 'Slide in from the side', fade: 'Fade in', none: 'Already there' },
  splitgrid: { slide: 'Panels slide in', fade: 'Fade in', none: 'Already there' },
  block: { rise: 'Block appears, plates rise', none: 'Already there' },
  datapin: { pop: 'Pop in', none: 'Already there' },
  hexbadges: { pop: 'Pop in one by one', none: 'Already there' },
  flowlines: { draw: 'Draw along the line', fade: 'Fade in', none: 'Already there' },
  beams: { shoot: 'Shoot out', none: 'Already there' },
  mesh: { grow: 'Grow the network', none: 'Already there' },
  viewshed: { sweep: 'Sweep round', none: 'Already there' },
  fmv: { fly: 'Fly the path' },
  tiles: { pop: 'Pop in', fade: 'Fade in', none: 'Already there' },
  vortex: { spin: 'Spin up', none: 'Already there' },
  vessel: { sail: 'Sail the track' },
  photocard: { pop: 'Pop out', none: 'Already there' },
  arpanel: { unfold: 'Unfold', none: 'Already there' },
  linecallout: { draw: 'Draw out', none: 'Already there' },
  detect: { track: 'Track', none: 'Already there' },
  kgraph: { build: 'Grow the graph', fade: 'Fade in', none: 'Already there' },
};
export const VZ_DEFAULTS = {
  spectral: { anim: 'wipe', duration: 1.6, style: { mode: 'split', palette: 'spectral', left: 'duo', split: 0.5, boxes: true, titleL: 'RAMP / DTW18', subL: 'SSR PN', titleR: 'RAMP / DTW18', subR: 'm/Gup', tagL: 'VCID* 1, 6', tagR: 'VCID* 2', noteL: 'True Scale Latitude', noteR: 'Cloud Cover Truncated', bands: 'Geometric RMSE Verify | #3ddc84\nGain Band (1-5, 6 VCID* 1) | #4d7cff\nTIRS Blackbody Stability | #3ddc84\nGain Band (1-5 VCID* 2) | #4d7cff', stretch: true } },
  splitgrid: { anim: 'slide', duration: 1.2, style: { layout: '2x2', mapPanel: 0, media: '', media2: '', media3: '', cap1: '', cap2: '', cap3: '', cap4: '', gutter: 6, kenburns: true } },
  block: { anim: 'rise', duration: 3, style: { thickness: 70, bg: '#e8e5e0', wall: '#3b352f', plates: '', plateGap: 70, labels: '#1d1d1f', shadow: true, edge: true } },
  datapin: { anim: 'pop', duration: 0.8, style: { look: 'wildlife', icon: '🐻', color: '#a03bb5', value: '5.5', unit: 'km', label: '', temp: 25, moisture: 25, rows: '100\n61\n30', size: 1 } },
  hexbadges: { anim: 'pop', duration: 1.5, style: { items: '°C\n🌱\n💧\nNPK\n☀', color: '#2f9e44', bg: '#ffffff', layout: 'column', position: 'top-right', size: 1 } },
  flowlines: { anim: 'draw', duration: 2.5, style: { color: '#dff4ff', count: 9, spacing: 5, speed: 1, arrows: true, width: 1.2 } },
  beams: { anim: 'shoot', duration: 2.5, style: { count: 36, radiusKm: 4, arc: 0.6, palette: 'rainbow', color: '#4fc3ff', particles: true, useLayers: false, seed: 1 } },
  mesh: { anim: 'grow', duration: 3, style: { count: 40, links: 3, color: '#cfe9ff', pulses: true, seed: 1 } },
  viewshed: { anim: 'sweep', duration: 2, style: { radiusM: 250, rays: 360, color: '#39d353', buildings: true, bldColor: '#29a8ff', circle: true, label: true } },
  tiles: { anim: 'pop', duration: 1.5, style: { mode: 'pop', color: '#ff3df2', color2: '#3d6bff', count: 14, size: 1, cellM: 180, angle: 0, opacity: 0.6, seed: 1 } },
  vortex: { anim: 'spin', duration: 2, style: { radiusKm: 300, streaks: 90, speed: 1, labels: 9, title: 'WIND SPEED', unit: 'MPH', value: 105, spread: 6, glow: true } },
  vessel: { anim: 'sail', duration: 10, style: { name: 'Spirit of Enderby', color: '#e8323c', sog: 9.6, callout: true, buoy: true, ship: true } },
  photocard: { anim: 'pop', duration: 0.8, style: { title: 'Snares Island', media: '', dx: -220, dy: 60, width: 260 } },
  arpanel: { anim: 'unfold', duration: 1.2, style: { color: '#ffc46b', numbers: '-31546.037\n-21254.351\n31643.034\n-25941.208', title: '16709.490', position: 'center', size: 1 } },
  linecallout: { anim: 'draw', duration: 1.5, style: { items: 'ISSUE: Water loss in county / AVERAGE LEAK: 89.36 GPM\n$32,498,193\nPROJECTED SAVINGS', color: '#ffffff', size: 1 } },
  detect: { anim: 'track', duration: 1, style: { look: 'boxes', count: 10, speed: 1, labels: true, cars: true, size: 1.6, lanes: 2 } },
  kgraph: { anim: 'build', duration: 3, style: { layout: 'panel', data: 'BUS: 5836 | bus\nKimbell Todor | person\nRaphael Gilardengo | person\nEngracia Tonna | person\nCarol-Jean Yakunikov | person\nBecca Turri | person\nRepair ID: 527 | repair\nRepair ID: 525 | repair\nElnora Lewis | person\nNelson Lambshine | person\nRozele Todaro | person\nCollision: pedestrian | alert | Rozele Todaro\nBUS: 9490 | bus | Rozele Todaro', cloud: 120, panel: true, props: 'NUM: 5836\nBUS ID: MTA NYCT_5836', search: '', color: '#29c6e0', size: 1 } },
  fmv: { anim: 'fly', duration: 10, style: { color: '#ffe11a', aheadM: 350, footM: 220, window: true, title: 'FMV · Exercise 3', position: 'top-left', winSize: 0.42, frustum: true } },
};
const PALETTES = { spectral: 'Spectral (false colour)', thermal: 'Thermal (heat)', ndvi: 'Vegetation (NDVI)', ice: 'Ice blue', violet: 'Violet city (purple / blue)', night: 'Night blue' };
export const VZ_FORMS = {
  spectral: [['style.mode', 'Show', 'select', { split: 'Split screen (sepia | false colour)', full: 'Whole picture in false colour', duo: 'Whole picture in sepia' }], ['style.palette', 'False colours', 'select', PALETTES], ['style.split', 'Split position', 'range', [0.2, 0.8, 0.01], (L) => L.style.mode === 'split'], ['style.boxes', 'Analysis frames and labels', 'switch'], ['style.titleL', 'Left title', 'text', null, (L) => L.style.boxes !== false], ['style.subL', 'Left subtitle', 'text', null, (L) => L.style.boxes !== false], ['style.tagL', 'Left corner tag', 'text', null, (L) => L.style.boxes !== false], ['style.noteL', 'Left note', 'text', null, (L) => L.style.boxes !== false], ['style.titleR', 'Right title', 'text', null, (L) => L.style.boxes !== false && L.style.mode === 'split'], ['style.subR', 'Right subtitle', 'text', null, (L) => L.style.boxes !== false && L.style.mode === 'split'], ['style.tagR', 'Right corner tag', 'text', null, (L) => L.style.boxes !== false && L.style.mode === 'split'], ['style.noteR', 'Right note', 'text', null, (L) => L.style.boxes !== false && L.style.mode === 'split'], ['style.bands', 'Bottom bar — “Label | colour” per line (empty = none)', 'textarea', null, (L) => L.style.boxes !== false], ['style.stretch', 'Auto contrast', 'switch']],
  splitgrid: [['style.layout', 'Layout', 'select', { '2x2': 'Four panels (2 × 2)', '2h': 'Two side by side', '2v': 'Two above each other', '3': 'One big + two small' }], ['style.mapPanel', 'Map shows in panel', 'select', { 0: '1', 1: '2', 2: '3', 3: '4', '-1': 'None (pictures only)' }], ['style.media', 'Picture A', 'image'], ['style.media2', 'Picture B', 'image'], ['style.media3', 'Picture C', 'image'], ['style.cap1', 'Caption panel 1', 'text'], ['style.cap2', 'Caption panel 2', 'text'], ['style.cap3', 'Caption panel 3', 'text'], ['style.cap4', 'Caption panel 4', 'text'], ['style.gutter', 'Gap (px)', 'range', [0, 30, 1]], ['style.kenburns', 'Slow zoom on pictures', 'switch']],
  block: [['style.thickness', 'Block thickness', 'range', [0, 300, 1]], ['style.bg', 'Table colour', 'color'], ['style.wall', 'Side colour', 'color'], ['style.shadow', 'Shadow', 'switch'], ['style.edge', 'Bright top edge', 'switch'], ['style.plates', 'Glass plates above (one label per line)', 'textarea'], ['style.plateGap', 'Plate spacing', 'range', [20, 200, 1], (L) => !!L.style.plates], ['style.labels', 'Label colour', 'color', null, (L) => !!L.style.plates]],
  datapin: [['style.look', 'Look', 'select', { wildlife: 'Wildlife / icon marker with value and bars', weather: 'Weather & crop badge (sun, °, wheat %)', pin: 'Simple value pin' }], ['style.icon', 'Icon (emoji or short text)', 'text', null, (L) => L.style.look !== 'weather'], ['style.color', 'Colour', 'color'], ['style.value', 'Value', 'text', null, (L) => L.style.look !== 'weather'], ['style.unit', 'Unit', 'text', null, (L) => L.style.look !== 'weather'], ['style.label', 'Label', 'text'], ['style.temp', 'Temperature (°)', 'number', 1, (L) => L.style.look === 'weather'], ['style.moisture', 'Moisture (%)', 'number', 1, (L) => L.style.look === 'weather'], ['style.rows', 'Crop rows — one percent per line', 'textarea', null, (L) => L.style.look === 'weather'], ['style.size', 'Size', 'range', [0.4, 3, 0.05]]],
  hexbadges: [['style.items', 'Badges — one icon or short text per line', 'textarea'], ['style.layout', 'Layout', 'select', { column: 'Column', row: 'Row', honeycomb: 'Honeycomb (staggered)' }], ['style.color', 'Icon colour', 'color'], ['style.bg', 'Badge colour', 'color'], ['style.size', 'Size', 'range', [0.4, 3, 0.05]], ['style.position', 'Position', 'select', POS]],
  flowlines: [['style.color', 'Colour', 'color'], ['style.count', 'Lines', 'range', [1, 30, 1]], ['style.spacing', 'Spacing', 'range', [1, 30, 0.5]], ['style.width', 'Line width', 'range', [0.3, 5, 0.1]], ['style.arrows', 'Moving arrows', 'switch'], ['style.speed', 'Speed', 'range', [0.1, 5, 0.05]]],
  beams: [['style.count', 'Beams', 'range', [3, 200, 1]], ['style.radiusKm', 'Reach (km)', 'range', [0.2, 2000, 0.1]], ['style.arc', 'Arc height', 'range', [0, 2, 0.05]], ['style.palette', 'Colours', 'select', { rainbow: 'Blue, green, orange, pink', blue: 'Blue', single: 'One colour' }], ['style.color', 'Colour', 'color', null, (L) => L.style.palette === 'single'], ['style.particles', 'Particles', 'switch'], ['style.useLayers', 'Shoot to the other points in this scene', 'switch'], ['style.seed', 'Shuffle', 'number', 1]],
  mesh: [['style.count', 'Nodes', 'range', [5, 200, 1]], ['style.links', 'Links per node', 'range', [1, 6, 1]], ['style.color', 'Colour', 'color'], ['style.pulses', 'Pulses along the lines', 'switch'], ['style.seed', 'Shuffle', 'number', 1]],
  viewshed: [['style.radiusM', 'Radius (m)', 'range', [30, 3000, 5]], ['style.color', 'Visible area colour', 'color'], ['style.buildings', 'Colour the buildings', 'switch'], ['style.bldColor', 'Building colour', 'color', null, (L) => L.style.buildings !== false], ['style.circle', 'Range circle', 'switch'], ['style.label', '% visible label', 'switch'], ['style.rays', 'Rays (detail)', 'range', [36, 720, 1]]],
  tiles: [['style.mode', 'Show', 'select', { pop: 'Glowing squares popping in and out', mosaic: 'Two-colour mosaic tint' }], ['style.color', 'Colour', 'color'], ['style.color2', 'Second colour', 'color', null, (L) => L.style.mode === 'mosaic'], ['style.count', 'Squares', 'range', [1, 80, 1], (L) => L.style.mode !== 'mosaic'], ['style.size', 'Square size', 'range', [0.3, 4, 0.05], (L) => L.style.mode !== 'mosaic'], ['style.angle', 'Rotation (°)', 'range', [-45, 45, 1], (L) => L.style.mode !== 'mosaic'], ['style.cellM', 'Cell size (m)', 'range', [20, 5000, 10], (L) => L.style.mode === 'mosaic'], ['style.opacity', 'Strength', 'range', [0.1, 1, 0.01]], ['style.seed', 'Shuffle', 'number', 1]],
  vortex: [['style.radiusKm', 'Radius (km)', 'range', [1, 2000, 1]], ['style.streaks', 'Streaks', 'range', [10, 300, 1]], ['style.speed', 'Spin speed', 'range', [0.1, 4, 0.05]], ['style.labels', 'Labels', 'range', [0, 20, 1]], ['style.title', 'Label title', 'text'], ['style.value', 'Value', 'number', 1], ['style.spread', 'Value spread ±', 'number', 1], ['style.unit', 'Unit', 'text'], ['style.glow', 'Bright glow', 'switch']],
  vessel: [['style.name', 'Ship name', 'text'], ['style.color', 'Track colour', 'color'], ['style.sog', 'Speed (knots)', 'number', 0.1], ['style.callout', 'Position callout', 'switch'], ['style.ship', 'Ship icon', 'switch'], ['style.buoy', 'Buoy at the end', 'switch']],
  photocard: [['style.title', 'Title', 'text'], ['style.media', 'Picture', 'image'], ['style.width', 'Width (px)', 'range', [120, 600, 1]], ['style.dx', 'Card offset ←→', 'range', [-600, 600, 1]], ['style.dy', 'Card offset ↑↓', 'range', [-400, 400, 1]]],
  arpanel: [['style.title', 'Number on the panel', 'text'], ['style.numbers', 'Floating numbers (one per line)', 'textarea'], ['style.color', 'Colour', 'color'], ['style.size', 'Size', 'range', [0.4, 2.5, 0.05]], ['style.position', 'Position', 'select', { center: 'Centre', ...POS }]],
  linecallout: [['style.items', 'Boxes — one per line (“ / ” makes a new line inside a box; numbers count up)', 'textarea'], ['style.color', 'Colour', 'color'], ['style.size', 'Size', 'range', [0.4, 2.5, 0.05]]],
  detect: [['style.look', 'Look', 'select', { boxes: 'Detection boxes (green)', rings: 'Tracking rings (cyan)' }], ['style.count', 'Vehicles', 'range', [1, 60, 1]], ['style.lanes', 'Lanes each way', 'range', [1, 5, 1]], ['style.speed', 'Speed', 'range', [0, 4, 0.05]], ['style.cars', 'Draw the cars', 'switch'], ['style.labels', 'Labels', 'switch'], ['style.size', 'Size', 'range', [0.3, 4, 0.05]]],
  kgraph: [['style.data', 'Nodes — “Name | type | linked to” per line (types: person, bus, car, repair, alert, building, doc, phone, place; the first line is the centre)', 'textarea'], ['style.layout', 'Layout', 'select', { panel: 'Lower panel (map above)', full: 'Whole screen', overlay: 'Over the map (no background)' }], ['style.cloud', 'Background network (nodes, 0 = none)', 'range', [0, 400, 1]], ['style.panel', 'Details panel', 'switch'], ['style.props', 'Details — “Label: value” per line', 'textarea', null, (L) => L.style.panel !== false], ['style.search', 'Search box text', 'text'], ['style.color', 'Accent colour', 'color'], ['style.size', 'Size', 'range', [0.4, 2.5, 0.05]]],
  fmv: [['style.color', 'Colour', 'color'], ['style.aheadM', 'Camera looks ahead (m)', 'range', [0, 3000, 10]], ['style.footM', 'Footprint size (m)', 'range', [20, 3000, 10]], ['style.frustum', 'Camera lines', 'switch'], ['style.window', 'Video player window', 'switch'], ['style.title', 'Window title', 'text', null, (L) => L.style.window !== false], ['style.position', 'Window position', 'select', POS, (L) => L.style.window !== false], ['style.winSize', 'Window size', 'range', [0.2, 0.7, 0.01], (L) => L.style.window !== false]],
};
export const VZ_SET = new Set(Object.keys(VZ_KINDS));
export const VZ_SCREEN = new Set(['spectral', 'splitgrid', 'hexbadges', 'kgraph', 'arpanel']);
export function vzPhases(k) {
  return { spectral: ['below', 'captions'], splitgrid: ['captions'], block: ['below', 'above'], datapin: ['above'], hexbadges: ['captions'], kgraph: ['captions'], tiles: ['below'], vortex: ['above'], vessel: ['above'], photocard: ['above'], arpanel: ['captions'], linecallout: ['above'], detect: ['above'], flowlines: ['below'], beams: ['above'], mesh: ['above'], viewshed: ['below', 'above'], fmv: ['above', 'captions'] }[k] || ['above'];
}
export function drawViz(ctx, L, tm, o, phase) {
  ctx.save();
  try {
    switch (L.kind) {
      case 'spectral': phase === 'below' ? spectralPixels(ctx, L, tm, o) : spectralHud(ctx, L, tm, o); break;
      case 'splitgrid': splitGrid(ctx, L, tm, o); break;
      case 'block': phase === 'below' ? blockBase(ctx, L, tm, o) : blockPlates(ctx, L, tm, o); break;
      case 'datapin': dataPin(ctx, L, tm, o); break;
      case 'hexbadges': hexBadges(ctx, L, tm, o); break;
      case 'kgraph': kGraph(ctx, L, tm, o); break;
      case 'tiles': tiles(ctx, L, tm, o); break;
      case 'vortex': vortex(ctx, L, tm, o); break;
      case 'vessel': vessel(ctx, L, tm, o); break;
      case 'photocard': photoCard(ctx, L, tm, o); break;
      case 'arpanel': arPanel(ctx, L, tm, o); break;
      case 'linecallout': lineCallout(ctx, L, tm, o); break;
      case 'detect': detect(ctx, L, tm, o); break;
      case 'flowlines': flowLines(ctx, L, tm, o); break;
      case 'beams': beams(ctx, L, tm, o); break;
      case 'mesh': mesh(ctx, L, tm, o); break;
      case 'viewshed': viewshed(ctx, L, tm, o, phase); break;
      case 'fmv': phase === 'above' ? fmvMap(ctx, L, tm, o) : fmvWindow(ctx, L, tm, o); break;
      default: break;
    }
  } finally { ctx.restore(); }
}

// ================================================================= spectral imagery
const LUTS = {
  spectral: [[0, '#1b0a6b'], [0.16, '#3048ff'], [0.3, '#18d4e6'], [0.44, '#34f06a'], [0.58, '#d4f52a'], [0.7, '#ffb21e'], [0.82, '#ff3fbf'], [1, '#7a2bff']],
  thermal: [[0, '#05030f'], [0.2, '#3a0b6e'], [0.4, '#b3125a'], [0.6, '#f0541a'], [0.8, '#ffc21a'], [1, '#fffbe0']],
  ndvi: [[0, '#6b3a1a'], [0.25, '#c88a3a'], [0.45, '#f2e35a'], [0.65, '#8bd34a'], [0.85, '#2e9e3a'], [1, '#0c5a24']],
  violet: [[0, '#0a0620'], [0.3, '#3a1258'], [0.5, '#7a2a7a'], [0.68, '#5a63c8'], [0.85, '#9cb6ff'], [1, '#e6eeff']],
  night: [[0, '#02040c'], [0.4, '#0b1e4a'], [0.7, '#2f5fd0'], [0.9, '#9cc8ff'], [1, '#ffffff']],
  ice: [[0, '#030b24'], [0.35, '#0f4fa8'], [0.65, '#4fc3ff'], [0.85, '#bff0ff'], [1, '#ffffff']],
};
const lutCache = new Map();
function lutOf(name) {
  if (lutCache.has(name)) return lutCache.get(name);
  const st = LUTS[name] || LUTS.spectral;
  const out = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let k = 0; while (k < st.length - 2 && v > st[k + 1][0]) k++;
    const [a0, c0] = st[k], [a1, c1] = st[k + 1];
    const f = clamp((v - a0) / (a1 - a0 || 1), 0, 1);
    const p = rgbOf(c0), q = rgbOf(c1);
    for (let j = 0; j < 3; j++) out[i * 3 + j] = p[j] + (q[j] - p[j]) * f;
  }
  lutCache.set(name, out);
  return out;
}
function spectralSplit(L, tm, frame) {
  const s = L.style, u = prog(L, tm);
  const e = L.anim === 'wipe' ? easeOut(u) : 1;
  if (s.mode === 'split') return frame.x + frame.w * (1 - (1 - (+s.split || 0.5)) * e);
  if (s.mode === 'full') return frame.x + frame.w * (1 - e);
  return frame.x + frame.w;
}
function spectralPixels(ctx, L, tm, o) {
  const fr = o.frame;
  if (!fr || !o.map) return;
  const s = L.style;
  const sx = spectralSplit(L, tm, fr);
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' ? ease(prog(L, tm)) : 1);
  // left: sepia duotone
  if (s.mode !== 'full' && s.left !== 'none') {
    const w = s.mode === 'duo' ? fr.w * (L.anim === 'wipe' ? easeOut(prog(L, tm)) : 1) : sx - fr.x;
    if (w > 1) {
      ctx.save(); ctx.filter = 'grayscale(1) sepia(0.85) hue-rotate(-18deg) saturate(0.55) contrast(1.3) brightness(0.92)';
      drawMapCrop(ctx, o, fr.x, fr.y, w, fr.h, fr.x, fr.y, w, fr.h);
      ctx.restore();
    }
  }
  if (s.mode === 'duo') return;
  // right: false colour through a lookup table, processed at reduced size
  const w = fr.x + fr.w - sx;
  if (w < 2) return;
  const scale = Math.min(1, 900 / fr.w);
  const ow = Math.max(2, Math.round(w * scale)), oh = Math.max(2, Math.round(fr.h * scale));
  const [c, g] = off('spectral', ow, oh);
  g.clearRect(0, 0, ow, oh);
  if (!drawMapCrop(g, o, sx, fr.y, w, fr.h, 0, 0, ow, oh)) return;
  let img;
  try { img = g.getImageData(0, 0, ow, oh); } catch { return; }
  const d = img.data, lut = lutOf(s.palette || 'spectral');
  let lo = 0, hi = 255;
  if (s.stretch !== false) {
    const hist = new Uint32Array(256); let n = 0;
    for (let i = 0; i < d.length; i += 4 * 7) { hist[(d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) | 0]++; n++; }
    let acc = 0; for (lo = 0; lo < 255 && acc < n * 0.02; lo++) acc += hist[lo];
    acc = 0; for (hi = 255; hi > 0 && acc < n * 0.02; hi--) acc += hist[hi];
    if (hi - lo < 20) { lo = 0; hi = 255; }
  }
  const span = Math.max(1, hi - lo);
  const veg = s.palette === 'ndvi';
  for (let i = 0; i < d.length; i += 4) {
    let v = veg ? 128 + (d[i + 1] - d[i]) * 1.6 - (d[i + 2] - d[i + 1]) * 0.4 : d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    if (!veg) v = ((v - lo) / span) * 255;
    const k = clamp(v | 0, 0, 255) * 3;
    d[i] = lut[k]; d[i + 1] = lut[k + 1]; d[i + 2] = lut[k + 2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, 0, 0, ow, oh, sx, fr.y, w, fr.h);
  if (s.mode === 'split') { ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(255,255,255,0.8)'; ctx.shadowBlur = 8 * o.unit; ctx.fillRect(sx - 1.5 * o.unit, fr.y, 3 * o.unit, fr.h); }
}
function spectralHud(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, unit = o.unit, t = o.time || 0;
  if (!fr || s.boxes === false) return;
  const u = prog(L, tm);
  ctx.globalAlpha *= tm.alpha * clamp((u - 0.3) / 0.5, 0, 1);
  const sx = spectralSplit(L, tm, fr);
  const bandsH = String(s.bands || '').trim() ? 34 * unit : 0;
  const panels = s.mode === 'split' ? [[fr.x, sx - fr.x, 'L'], [sx, fr.x + fr.w - sx, 'R']] : [[fr.x, fr.w, s.mode === 'full' ? 'R' : 'L']];
  const seed = hashStr(L.id);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 4 * unit;
  ctx.textBaseline = 'alphabetic';
  panels.forEach(([px, pw, side], pi) => {
    if (pw < 80 * unit) return;
    const ph = fr.h - bandsH;
    const title = side === 'L' ? s.titleL : s.titleR, sub = side === 'L' ? s.subL : s.subR;
    const tag = side === 'L' ? s.tagL : s.tagR, note = side === 'L' ? s.noteL : s.noteR;
    const m = 34 * unit;
    ctx.textAlign = 'left';
    ctx.font = `800 ${26 * unit}px ${UI}`; ctx.fillText(title || '', px + m, fr.y + m + 22 * unit, pw - m * 2);
    ctx.font = `800 ${17 * unit}px ${UI}`; ctx.fillText(sub || '', px + m, fr.y + m + 46 * unit, pw - m * 2);
    ctx.font = `800 ${24 * unit}px ${UI}`; ctx.fillText(tag || '', px + m, fr.y + ph - m, pw * 0.5);
    ctx.textAlign = 'right'; ctx.font = `700 ${14 * unit}px ${UI}`; ctx.fillText(note || '', px + pw - m, fr.y + ph - m, pw * 0.5);
    // centre analysis box
    const bs = Math.min(pw * 0.5, ph * 0.66), bx = px + pw / 2 - bs / 2, by = fr.y + ph * 0.47 - bs / 2;
    const bu = easeOut((u - 0.4) / 0.5);
    ctx.lineWidth = 2 * unit;
    ctx.strokeRect(bx + (bs * (1 - bu)) / 2, by + (bs * (1 - bu)) / 2, bs * bu, bs * bu);
    if (bu > 0.9) {
      const tick = 22 * unit;
      ctx.beginPath();
      ctx.moveTo(bx + bs / 2, by - tick); ctx.lineTo(bx + bs / 2, by); ctx.moveTo(bx + bs / 2, by + bs); ctx.lineTo(bx + bs / 2, by + bs + tick);
      ctx.moveTo(bx - tick, by + bs / 2); ctx.lineTo(bx, by + bs / 2); ctx.moveTo(bx + bs, by + bs / 2); ctx.lineTo(bx + bs + tick, by + bs / 2);
      ctx.stroke();
      // checker scale bar
      const cw = bs * 0.92, chh = 13 * unit, cx = bx + (bs - cw) / 2, cy = by + bs - chh - 10 * unit, n = 12;
      ctx.save(); ctx.shadowBlur = 0;
      ctx.strokeRect(cx, cy, cw, chh);
      for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#ffffff' : '#111111'; ctx.fillRect(cx + (i * cw) / n, cy + (j * chh) / 2, cw / n, chh / 2); }
      ctx.restore();
      ctx.font = `600 ${13 * unit}px ${MONO}`;
      const r = rng(seed + pi * 13 + Math.floor(t * 8));
      const code = side === 'L' ? `0x${Math.floor(r() * 0xffffffff).toString(16).toUpperCase().padStart(8, '0')}` : (1 + r()).toFixed(8);
      ctx.textAlign = 'left'; ctx.fillText(code, bx + bs * 0.02, by - 10 * unit);
      ctx.fillText(side === 'L' ? 'RLUT' : 'WRS', bx + 2 * unit, by + bs + 20 * unit);
      ctx.textAlign = 'right'; ctx.fillText(side === 'L' ? `00${(259 + r()).toFixed(7)}` : (0.3 + r() * 0.05).toFixed(8), bx + bs - 2 * unit, by + bs + 20 * unit);
    }
  });
  // bottom band legend
  if (bandsH) {
    ctx.save(); ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(fr.x, fr.y + fr.h - bandsH, fr.w, bandsH);
    const items = String(s.bands).split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p[0]);
    ctx.font = `600 ${13 * unit}px ${UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let x = fr.x + 30 * unit;
    items.forEach(([lab, col]) => {
      ctx.fillStyle = col || '#3ddc84'; ctx.fillRect(x, fr.y + fr.h - bandsH / 2 - 4 * unit, 8 * unit, 8 * unit);
      ctx.fillStyle = '#ffffff'; ctx.fillText(lab, x + 15 * unit, fr.y + fr.h - bandsH / 2);
      x += ctx.measureText(lab).width + 50 * unit;
    });
    ctx.restore();
  }
}

// ================================================================= split screen grid
function gridRects(layout, fr, g) {
  const { x, y, w, h } = fr;
  if (layout === '2h') return [{ x, y, w: (w - g) / 2, h }, { x: x + (w + g) / 2, y, w: (w - g) / 2, h }];
  if (layout === '2v') return [{ x, y, w, h: (h - g) / 2 }, { x, y: y + (h + g) / 2, w, h: (h - g) / 2 }];
  if (layout === '3') return [{ x, y, w: (w - g) * 0.62, h }, { x: x + (w - g) * 0.62 + g, y, w: (w - g) * 0.38, h: (h - g) / 2 }, { x: x + (w - g) * 0.62 + g, y: y + (h + g) / 2, w: (w - g) * 0.38, h: (h - g) / 2 }];
  return [{ x, y, w: (w - g) / 2, h: (h - g) / 2 }, { x: x + (w + g) / 2, y, w: (w - g) / 2, h: (h - g) / 2 }, { x, y: y + (h + g) / 2, w: (w - g) / 2, h: (h - g) / 2 }, { x: x + (w + g) / 2, y: y + (h + g) / 2, w: (w - g) / 2, h: (h - g) / 2 }];
}
function coverImage(ctx, bmp, R, zoom = 1) {
  const s = Math.max(R.w / bmp.width, R.h / bmp.height) * zoom;
  const w = bmp.width * s, h = bmp.height * s;
  ctx.drawImage(bmp, R.x + (R.w - w) / 2, R.y + (R.h - h) / 2, w, h);
}
function splitGrid(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, unit = o.unit, t = o.time || 0;
  if (!fr) return;
  const g = (+s.gutter || 0) * unit;
  const rects = gridRects(s.layout || '2x2', fr, g);
  const mp = +(s.mapPanel ?? 0);
  const media = [s.media, s.media2, s.media3];
  const u = prog(L, tm);
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' ? ease(u) : 1);
  // gutters (and the outside of the map panel stay black)
  ctx.save();
  ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h);
  const mr = rects[mp];
  if (mr) ctx.rect(mr.x + mr.w, mr.y, -mr.w, mr.h);
  ctx.fillStyle = '#000'; ctx.fill('evenodd');
  ctx.restore();
  let mi = 0;
  rects.forEach((R, i) => {
    const k = L.anim === 'slide' && !tm.edit ? easeOut(u * 1.6 - i * 0.18) : 1;
    ctx.save();
    ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
    if (i !== mp) {
      const fromLeft = R.x + R.w / 2 < fr.x + fr.w / 2;
      ctx.translate((1 - k) * (fromLeft ? -R.w : R.w), 0);
      const id = media[mi++];
      const im = id ? imageFor(id) : null;
      if (im?.bmp) coverImage(ctx, im.bmp, R, s.kenburns !== false ? 1.02 + 0.06 * ((t * 0.04) % 1) : 1);
      else {
        const gr = ctx.createLinearGradient(R.x, R.y, R.x + R.w, R.y + R.h);
        gr.addColorStop(0, '#0d1424'); gr.addColorStop(1, '#1b1033'); ctx.fillStyle = gr; ctx.fillRect(R.x, R.y, R.w, R.h);
        ctx.fillStyle = 'rgba(160,190,255,0.35)'; ctx.font = `600 ${14 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (tm.edit) ctx.fillText(`Add picture ${'ABC'[mi - 1] || ''} in the layer settings`, R.x + R.w / 2, R.y + R.h / 2);
      }
    } else if (k < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - k})`; ctx.fillRect(R.x, R.y, R.w, R.h); }
    const cap = s[`cap${i + 1}`];
    if (cap) {
      ctx.font = `700 ${15 * unit}px ${UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const cw = ctx.measureText(cap).width + 24 * unit;
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(R.x + 16 * unit, R.y + R.h - 46 * unit, cw, 30 * unit);
      ctx.fillStyle = '#fff'; ctx.fillText(cap, R.x + 28 * unit, R.y + R.h - 31 * unit);
    }
    ctx.restore();
  });
}

// ================================================================= map diorama block
function blockPts(L, o) { return ring0(L.geom).slice(0, -1).map((c) => o.proj(c)); }
function blockThick(L, o) {
  const pitch = o.pitch ?? o.map?.getPitch?.() ?? 0;
  return (+L.style.thickness || 0) * o.unit * Math.max(0.15, Math.sin(pitch * D2R) * 1.2);
}
function blockBase(ctx, L, tm, o) {
  const s = L.style, unit = o.unit;
  const P = blockPts(L, o);
  if (P.length < 3) return;
  const u = prog(L, tm);
  const a = tm.alpha * (L.anim === 'rise' && !tm.edit ? easeOut(u * 3) : 1);
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.globalAlpha *= a;
  const T = blockThick(L, o) * (L.anim === 'rise' && !tm.edit ? easeOut(u * 2) : 1);
  const path = (dy = 0) => { ctx.moveTo(P[0][0], P[0][1] + dy); for (const p of P.slice(1)) ctx.lineTo(p[0], p[1] + dy); ctx.closePath(); };
  // table
  ctx.save();
  ctx.beginPath(); ctx.rect(-W, -H, W * 3, H * 3); path();
  const [r0, g0, b0] = rgbOf(s.bg || '#e8e5e0');
  const tg = ctx.createLinearGradient(0, 0, 0, H);
  tg.addColorStop(0, `rgb(${r0 * 0.86 | 0},${g0 * 0.86 | 0},${b0 * 0.86 | 0})`); tg.addColorStop(1, `rgb(${r0},${g0},${b0})`);
  ctx.fillStyle = tg; ctx.fill('evenodd');
  ctx.restore();
  // shadow on the table
  if (s.shadow !== false) {
    ctx.save();
    ctx.beginPath(); ctx.rect(-W, -H, W * 3, H * 3); path(); ctx.clip('evenodd');
    ctx.filter = `blur(${(16 * unit).toFixed(1)}px)`;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); path(T + 14 * unit); ctx.fill();
    ctx.restore();
  }
  // side walls facing the viewer
  if (T > 0.5) {
    let cx = 0, cy = 0; P.forEach((p) => { cx += p[0]; cy += p[1]; }); cx /= P.length; cy /= P.length;
    const [wr, wg, wb] = rgbOf(s.wall || '#3b352f');
    const walls = [];
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length];
      let nx = q[1] - p[1], ny = -(q[0] - p[0]);
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
      if (ny > 0.02) walls.push({ p, q, shade: 0.55 + 0.45 * Math.abs(nx) * (nx > 0 ? 0.6 : 1), y: Math.max(p[1], q[1]) });
    }
    walls.sort((a2, b2) => a2.y - b2.y);
    for (const w of walls) {
      const gr = ctx.createLinearGradient(0, Math.min(w.p[1], w.q[1]), 0, Math.max(w.p[1], w.q[1]) + T);
      const k = w.shade;
      gr.addColorStop(0, `rgb(${wr * k * 1.25 | 0},${wg * k * 1.25 | 0},${wb * k * 1.25 | 0})`); gr.addColorStop(1, `rgb(${wr * k * 0.7 | 0},${wg * k * 0.7 | 0},${wb * k * 0.7 | 0})`);
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(w.p[0], w.p[1]); ctx.lineTo(w.q[0], w.q[1]); ctx.lineTo(w.q[0], w.q[1] + T); ctx.lineTo(w.p[0], w.p[1] + T); ctx.closePath(); ctx.fill();
      // strata lines on the cut face
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1 * unit;
      for (let f = 0.25; f < 1; f += 0.25) { ctx.beginPath(); ctx.moveTo(w.p[0], w.p[1] + T * f); ctx.lineTo(w.q[0], w.q[1] + T * f); ctx.stroke(); }
    }
  }
  if (s.edge !== false) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.2 * unit; ctx.beginPath(); path(); ctx.stroke(); }
}
function blockPlates(ctx, L, tm, o) {
  const s = L.style, unit = o.unit, t = o.time || 0;
  const names = String(s.plates || '').split('\n').map((x) => x.trim()).filter(Boolean);
  if (!names.length) return;
  const P = blockPts(L, o);
  if (P.length < 3) return;
  const ring = ring0(L.geom);
  const u = prog(L, tm);
  const gap = (+s.plateGap || 70) * unit;
  const seed = hashStr(L.id);
  ctx.globalAlpha *= tm.alpha;
  let minX = Infinity, minI = 0; P.forEach((p, i) => { if (p[0] < minX) { minX = p[0]; minI = i; } });
  names.forEach((name, i) => {
    const k = tm.edit || L.anim === 'none' ? 1 : easeOut((u - 0.25 - i * 0.18) / 0.4);
    if (k <= 0) return;
    const lift = (i + 1) * gap * k + 10 * unit;
    const path = (dy) => { ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1] - dy); for (const p of P.slice(1)) ctx.lineTo(p[0], p[1] - dy); ctx.closePath(); };
    ctx.save();
    ctx.globalAlpha *= Math.min(1, k * 1.5);
    // glass thickness
    path(lift - 6 * unit); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
    path(lift);
    const ys = P.map((p) => p[1] - lift);
    const gr = ctx.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
    gr.addColorStop(0, 'rgba(255,255,255,0.32)'); gr.addColorStop(1, 'rgba(225,235,255,0.16)');
    ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.6 * unit; ctx.stroke();
    // content: dots on even plates, warm haze on odd ones
    path(lift); ctx.clip();
    const pts = samplePoly(ring, i % 2 === 0 ? 46 : 14, seed + i * 101);
    pts.forEach((g, j) => {
      const p = o.proj(g);
      const y = p[1] - lift;
      if (i % 2 === 0) {
        ctx.fillStyle = '#ff9a1a'; ctx.shadowColor = '#ff9a1a'; ctx.shadowBlur = 6 * unit;
        ctx.beginPath(); ctx.arc(p[0], y, 2.8 * unit * (0.8 + 0.2 * Math.sin(t * 3 + j)), 0, Math.PI * 2); ctx.fill();
      } else {
        const R = (30 + (j % 4) * 14) * unit;
        const hg = ctx.createRadialGradient(p[0], y, 0, p[0], y, R);
        hg.addColorStop(0, 'rgba(255,90,40,0.45)'); hg.addColorStop(0.5, 'rgba(255,190,60,0.25)'); hg.addColorStop(1, 'rgba(255,220,120,0)');
        ctx.fillStyle = hg; ctx.fillRect(p[0] - R, y - R, R * 2, R * 2);
      }
    });
    ctx.restore();
    // label to the left
    ctx.save();
    ctx.globalAlpha *= Math.min(1, k * 1.5);
    const lp = [P[minI][0], P[minI][1] - lift];
    ctx.font = `${i === names.length - 1 ? 800 : 600} ${13 * unit}px ${UI}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = s.labels || '#1d1d1f';
    ctx.fillText(name.toUpperCase(), lp[0] - 26 * unit, lp[1]);
    ctx.strokeStyle = hexA(s.labels || '#1d1d1f', 0.4); ctx.lineWidth = 1 * unit;
    ctx.beginPath(); ctx.moveTo(lp[0] - 20 * unit, lp[1]); ctx.lineTo(lp[0] - 4 * unit, lp[1]); ctx.stroke();
    ctx.restore();
  });
}

// ================================================================= data pins & badges
function wheat(ctx, x, y, s, on) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.35);
  ctx.fillStyle = on ? '#ffffff' : 'rgba(255,255,255,0.3)';
  ctx.fillRect(-0.6 * s, 0, 1.2 * s, 7 * s);
  for (let i = 0; i < 4; i++) for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(d * 2 * s, -i * 3.2 * s, 1.6 * s, 2.6 * s, d * 0.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.beginPath(); ctx.ellipse(0, -13 * s, 1.4 * s, 2.4 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function sunIcon(ctx, x, y, r, col) {
  ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = r * 0.22;
  ctx.beginPath(); ctx.arc(x, y + r * 0.2, r * 0.55, Math.PI, 0); ctx.stroke();
  for (let i = 0; i <= 4; i++) { const a = Math.PI + (i / 4) * Math.PI; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.85, y + r * 0.2 + Math.sin(a) * r * 0.85); ctx.lineTo(x + Math.cos(a) * r * 1.2, y + r * 0.2 + Math.sin(a) * r * 1.2); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(x - r * 1.3, y + r * 0.2); ctx.lineTo(x + r * 1.3, y + r * 0.2); ctx.stroke();
  ctx.restore();
}
function dataPin(ctx, L, tm, o) {
  if (L.geom?.type !== 'Point') return;
  const s = L.style, unit = o.unit * (+s.size || 1), t = o.time || 0;
  const [x, y] = o.proj(L.geom.coordinates);
  const u = prog(L, tm);
  const k = L.anim === 'pop' && !tm.edit ? backOut(u) : 1;
  if (k <= 0) return;
  ctx.globalAlpha *= tm.alpha * clamp(u * 3, 0, 1);
  ctx.translate(x, y); ctx.scale(k, k);
  ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 6 * unit;
  const col = s.color || '#a03bb5';
  if (s.look === 'weather') {
    sunIcon(ctx, -40 * unit, -50 * unit, 11 * unit, '#ff8a1e');
    ctx.save(); ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.6 * unit; ctx.setLineDash([5 * unit, 5 * unit]); ctx.lineDashOffset = -t * 10 * unit;
    ctx.beginPath(); ctx.moveTo(-90 * unit, -30 * unit); ctx.quadraticCurveTo(-40 * unit, -62 * unit, 60 * unit, -34 * unit); ctx.stroke(); ctx.restore();
    // heat ticks
    ctx.save(); ctx.shadowBlur = 0;
    for (let i = 0; i < 9; i++) { ctx.fillStyle = `hsl(${30 - i * 3},95%,${55 + i * 2}%)`; ctx.fillRect(-92 * unit + i * 4.5 * unit, -8 * unit - i * 1.2 * unit, 2.2 * unit, 10 * unit + i * 1.2 * unit); }
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = `300 ${34 * unit}px ${UI}`; ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(+s.temp || 0)}°`, -44 * unit, -6 * unit);
    ctx.font = `600 ${10 * unit}px ${UI}`;
    ctx.fillText(`${Math.round(+s.moisture || 0)}%`, 22 * unit, -14 * unit); ctx.fillText('moisture', 22 * unit, -2 * unit);
    const rows = String(s.rows || '100\n61').split('\n').map((v) => parseFloat(v)).filter((v) => isFinite(v)).slice(0, 4);
    rows.forEach((pct, ri) => {
      const ry = 26 * unit + ri * 30 * unit;
      const n = 5, on = Math.round((pct / 100) * n);
      for (let i = 0; i < n; i++) wheat(ctx, -30 * unit + i * 9 * unit, ry, 1 * unit, i < on);
      ctx.font = `600 ${10 * unit}px ${UI}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
      ctx.fillText(`${Math.round(pct)}%`, 22 * unit, ry - 2 * unit);
    });
    if (s.label) { ctx.font = `700 ${11 * unit}px ${UI}`; ctx.fillText(s.label, -44 * unit, -78 * unit); }
    return;
  }
  // wildlife / pin
  const R = 15 * unit;
  ctx.fillStyle = hexA(col, 0.3); ctx.beginPath(); ctx.arc(0, 0, R * (1.35 + 0.12 * Math.sin(t * 3)), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * unit; ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  const ic = s.icon || '●';
  ctx.font = `${/\p{Extended_Pictographic}/u.test(ic) ? 400 : 800} ${(ic.length > 2 ? 9 : 15) * unit}px ${UI}`;
  ctx.fillText(ic, 0, 1 * unit);
  ctx.shadowBlur = 6 * unit;
  if (s.look === 'wildlife') {
    ctx.font = `600 ${15 * unit}px ${UI}`; ctx.textAlign = 'center';
    ctx.fillText(`${s.value || ''}`, -4 * unit, R + 18 * unit);
    ctx.font = `500 ${8 * unit}px ${UI}`; ctx.fillText(s.unit || '', 16 * unit, R + 14 * unit);
    ctx.save(); ctx.shadowBlur = 0;
    const r = rng(hashStr(L.id));
    for (let i = 0; i < 6; i++) { const bh = (4 + r() * 10) * unit * (0.7 + 0.3 * Math.sin(t * 2 + i)); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(R + 8 * unit, R + 28 * unit - i * 4 * unit, bh, 2 * unit); }
    ctx.restore();
    if (s.label) { ctx.font = `700 ${10 * unit}px ${UI}`; ctx.fillText(s.label, 0, -R - 12 * unit); }
  } else {
    const txt = `${s.label ? `${s.label}  ` : ''}${s.value || ''}${s.unit ? ` ${s.unit}` : ''}`;
    ctx.font = `700 ${13 * unit}px ${UI}`; ctx.textAlign = 'left';
    const tw = ctx.measureText(txt).width;
    ctx.fillStyle = 'rgba(10,12,16,0.75)'; rr(ctx, R + 6 * unit, -12 * unit, tw + 18 * unit, 24 * unit, 12 * unit); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(txt, R + 15 * unit, 0);
  }
}
function hexPath(ctx, x, y, r) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); }
function hexBadges(ctx, L, tm, o) {
  const s = L.style, fr = o.frame;
  if (!fr) return;
  const unit = o.unit * (+s.size || 1);
  const items = String(s.items || '').split('\n').map((x) => x.trim()).filter(Boolean);
  if (!items.length) return;
  const R = 30 * unit, step = R * 1.85;
  const lay = s.layout || 'column';
  const cols = lay === 'row' ? items.length : lay === 'honeycomb' ? 2 : 1;
  const rows = Math.ceil(items.length / cols);
  const W = cols * step + R * 0.4, H = rows * step * (lay === 'honeycomb' ? 0.75 : 1) + R;
  const m = 40 * o.unit;
  const pos = s.position || 'top-right';
  let x0 = pos.includes('right') ? fr.x + fr.w - m - W : fr.x + m, y0 = pos.includes('bottom') ? fr.y + fr.h - m - H : fr.y + m;
  placeAt(ctx, L, fr, x0, y0, W, H);
  const u = prog(L, tm);
  ctx.globalAlpha *= tm.alpha;
  items.forEach((it, i) => {
    const c = lay === 'honeycomb' ? i % 2 : i % cols, r = lay === 'honeycomb' ? i : Math.floor(i / cols);
    const cx = x0 + R + c * step, cy = y0 + R + r * step * (lay === 'honeycomb' ? 0.55 : 1);
    const k = L.anim === 'pop' && !tm.edit ? backOut((u - i * 0.12) / 0.4) : 1;
    if (k <= 0) return;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k);
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 10 * unit; ctx.shadowOffsetY = 3 * unit;
    hexPath(ctx, 0, 0, R); ctx.fillStyle = hexA(s.bg || '#ffffff', 0.9); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = hexA(s.color || '#2f9e44', 0.35); ctx.lineWidth = 1.5 * unit; hexPath(ctx, 0, 0, R * 0.86); ctx.stroke();
    ctx.fillStyle = s.color || '#2f9e44'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${/\p{Extended_Pictographic}/u.test(it) ? 400 : 800} ${(it.length > 2 ? 14 : 20) * unit}px ${UI}`;
    ctx.fillText(it, 0, 1 * unit);
    ctx.restore();
  });
}

// ================================================================= flow lines
function offsetLine(P, d) {
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1;
    out.push([P[i][0] + (nx / l) * d, P[i][1] + (ny / l) * d]);
  }
  return out;
}
function resample(P, step) {
  const out = [P[0]];
  let carry = 0;
  for (let i = 1; i < P.length; i++) {
    const [x0, y0] = P[i - 1], [x1, y1] = P[i];
    const l = Math.hypot(x1 - x0, y1 - y0);
    let d = step - carry;
    while (d <= l) { out.push([x0 + ((x1 - x0) * d) / l, y0 + ((y1 - y0) * d) / l]); d += step; }
    carry = l - (d - step);
  }
  out.push(P.at(-1));
  return out;
}
function flowLines(ctx, L, tm, o) {
  const s = L.style, unit = o.unit, t = o.time || 0;
  const coords = L.geom?.type === 'LineString' ? L.geom.coordinates : [];
  if (coords.length < 2) return;
  const base = resample(coords.map((c) => o.proj(c)), 6 * unit);
  // smooth a little
  for (let it = 0; it < 2; it++) for (let i = 1; i < base.length - 1; i++) base[i] = [(base[i - 1][0] + base[i][0] * 2 + base[i + 1][0]) / 4, (base[i - 1][1] + base[i][1] * 2 + base[i + 1][1]) / 4];
  const u = prog(L, tm);
  const n = clamp(Math.round(+s.count || 9), 1, 30), sp = (+s.spacing || 5) * unit;
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' ? ease(u) : 1);
  const col = s.color || '#dff4ff';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    const off2 = (i - (n - 1) / 2) * sp;
    const wob = Math.sin(i * 1.7) * sp * 0.3;
    let P = offsetLine(base, off2 + wob);
    const lag = (Math.abs(i - (n - 1) / 2) / n) * 0.25;
    const cut = L.anim === 'draw' && !tm.edit ? clamp((u - lag) / (1 - 0.25), 0, 1) : 1;
    if (cut <= 0) continue;
    P = P.slice(0, Math.max(2, Math.round(P.length * cut)));
    ctx.strokeStyle = hexA(col, 0.25 + 0.45 * (1 - Math.abs(i - (n - 1) / 2) / n));
    ctx.lineWidth = (+s.width || 1.2) * unit;
    ctx.beginPath(); P.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
    if (s.arrows !== false) {
      const every = 14, ph = Math.floor(t * 12 * (+s.speed || 1) + i * 3);
      ctx.fillStyle = hexA(col, 0.9);
      for (let j = ((ph % every) + every) % every; j < P.length - 1; j += every) {
        const a = P[j], b = P[j + 1];
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        ctx.save(); ctx.translate(a[0], a[1]); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(4 * unit, 0); ctx.lineTo(-2 * unit, -2.4 * unit); ctx.lineTo(-2 * unit, 2.4 * unit); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
  }
}

// ================================================================= light beams
const BEAM_COLS = { rainbow: ['#38a8ff', '#42f5a4', '#ff9a2e', '#ff3fa4', '#5f7bff'], blue: ['#38a8ff', '#7fd4ff', '#2f6bff', '#a8e6ff'] };
function beamTargets(L, o) {
  const s = L.style, c = L.geom.coordinates;
  if (s.useLayers) {
    const pts = (o.scene?.layers || []).filter((q) => q !== L && !q.hidden && q.geom?.type === 'Point').map((q) => q.geom.coordinates);
    if (pts.length) return pts;
  }
  const r = rng(hashStr(L.id) + (+s.seed || 0) * 977);
  const n = clamp(Math.round(+s.count || 36), 1, 300), R = (+s.radiusKm || 4) * 1000;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = R * (0.25 + 0.75 * Math.sqrt(r()));
    out.push([c[0] + (Math.cos(a) * d) / kxOf(c[1]), c[1] + (Math.sin(a) * d) / KY]);
  }
  return out;
}
const bez = (a, c, b, t) => [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
function beams(ctx, L, tm, o) {
  if (L.geom?.type !== 'Point') return;
  const s = L.style, unit = o.unit, t = o.time || 0;
  const S = o.proj(L.geom.coordinates);
  const T = beamTargets(L, o);
  const u = prog(L, tm);
  const cols = s.palette === 'single' ? [s.color || '#4fc3ff'] : BEAM_COLS[s.palette] || BEAM_COLS.rainbow;
  ctx.globalAlpha *= tm.alpha;
  ctx.globalCompositeOperation = 'lighter';
  const r = rng(hashStr(L.id) + 7);
  T.forEach((g, i) => {
    const E = o.proj(g);
    const d = Math.hypot(E[0] - S[0], E[1] - S[1]);
    const C = [(S[0] + E[0]) / 2, (S[1] + E[1]) / 2 - d * (+s.arc ?? 0.6) * (0.6 + r() * 0.6)];
    const col = cols[i % cols.length];
    const st = (i / T.length) * 0.5;
    const k = L.anim === 'shoot' && !tm.edit ? easeOut((u - st) / 0.5) : 1;
    if (k <= 0) return;
    const N = 28;
    ctx.lineWidth = 1.3 * unit;
    for (let j = 0; j < N * k; j++) {
      const a = bez(S, C, E, j / N), b = bez(S, C, E, Math.min(k, (j + 1) / N));
      ctx.strokeStyle = hexA(col, 0.65 * (1 - (j / N) * 0.7));
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    if (s.particles !== false) {
      for (let p = 0; p < 5; p++) {
        const f = ((t * (0.25 + r() * 0.2) + p / 5 + i * 0.13) % 1) * k;
        const q = bez(S, C, E, f);
        ctx.fillStyle = hexA(col, 0.9); ctx.beginPath(); ctx.arc(q[0], q[1], (1.2 + r() * 1.4) * unit, 0, Math.PI * 2); ctx.fill();
      }
      for (let p = 0; p < 6; p++) { const q = bez(S, C, E, r() * k); ctx.fillStyle = hexA(col, 0.35); ctx.fillRect(q[0], q[1], 1.6 * unit, 1.6 * unit); }
    }
    if (k >= 1) { ctx.fillStyle = hexA(col, 0.8); ctx.beginPath(); ctx.arc(E[0], E[1], 2 * unit, 0, Math.PI * 2); ctx.fill(); }
  });
  const hg = ctx.createRadialGradient(S[0], S[1], 0, S[0], S[1], 26 * unit);
  hg.addColorStop(0, 'rgba(255,255,255,0.95)'); hg.addColorStop(0.25, 'rgba(160,220,255,0.6)'); hg.addColorStop(1, 'rgba(80,160,255,0)');
  ctx.fillStyle = hg; ctx.fillRect(S[0] - 26 * unit, S[1] - 26 * unit, 52 * unit, 52 * unit);
}

// ================================================================= network mesh
const meshCache = new Map();
function meshOf(L) {
  const s = L.style;
  const key = `${JSON.stringify(L.geom.coordinates)}|${s.count}|${s.links}|${s.seed}`;
  let m = meshCache.get(L.id);
  if (m?.key === key) return m;
  const ring = ring0(L.geom);
  const nodes = samplePoly(ring, clamp(Math.round(+s.count || 40), 3, 300), hashStr(L.id) + (+s.seed || 0) * 131);
  const lat = ring[0]?.[1] || 0, kx = kxOf(lat);
  const edges = new Set();
  nodes.forEach((a, i) => {
    const ds = nodes.map((b, j) => [Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * KY), j]).filter(([, j]) => j !== i).sort((p, q) => p[0] - q[0]);
    ds.slice(0, clamp(Math.round(+s.links || 3), 1, 8)).forEach(([, j]) => edges.add(i < j ? `${i}-${j}` : `${j}-${i}`));
  });
  let cx = 0, cy = 0; nodes.forEach((p) => { cx += p[0]; cy += p[1]; }); cx /= nodes.length || 1; cy /= nodes.length || 1;
  const order = nodes.map((p) => Math.hypot((p[0] - cx) * kx, (p[1] - cy) * KY));
  const mx = Math.max(...order, 1);
  m = { key, nodes, edges: [...edges].map((e) => e.split('-').map(Number)), order: order.map((d) => d / mx) };
  meshCache.set(L.id, m);
  return m;
}
function mesh(ctx, L, tm, o) {
  if (L.geom?.type !== 'Polygon') return;
  const s = L.style, unit = o.unit, t = o.time || 0;
  const m = meshOf(L);
  const P = m.nodes.map((g) => o.proj(g));
  const u = prog(L, tm);
  const col = s.color || '#cfe9ff';
  ctx.globalAlpha *= tm.alpha;
  ctx.globalCompositeOperation = 'lighter';
  const reveal = (i) => (L.anim === 'grow' && !tm.edit ? clamp((u * 1.3 - m.order[i]) / 0.3, 0, 1) : 1);
  ctx.lineWidth = 1.2 * unit; ctx.shadowColor = col; ctx.shadowBlur = 6 * unit;
  m.edges.forEach(([a, b], ei) => {
    const ka = reveal(a);
    if (ka <= 0) return;
    const kb = Math.min(1, ka * 1.2);
    const A = P[a], B = P[b];
    const E = [A[0] + (B[0] - A[0]) * kb, A[1] + (B[1] - A[1]) * kb];
    ctx.strokeStyle = hexA(col, 0.55);
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(E[0], E[1]); ctx.stroke();
    if (s.pulses !== false && kb >= 1) {
      const f = (t * 0.5 + ei * 0.37) % 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, 1.8 * unit, 0, Math.PI * 2); ctx.fill();
    }
  });
  P.forEach((p, i) => {
    const k = reveal(i);
    if (k <= 0) return;
    const R = (3 + 1.5 * Math.sin(t * 3 + i)) * unit * backOut(k);
    const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], R * 4);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, hexA(col, 0.7)); g.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = g; ctx.fillRect(p[0] - R * 4, p[1] - R * 4, R * 8, R * 8);
    if (k < 1) { ctx.strokeStyle = hexA(col, 1 - k); ctx.beginPath(); ctx.arc(p[0], p[1], R * 6 * k, 0, Math.PI * 2); ctx.stroke(); }
  });
}

// ================================================================= viewshed
const vsCache = new Map();
function buildingRings(map) {
  let fs = [];
  try { fs = map.querySourceFeatures('openmaptiles', { sourceLayer: 'building' }); } catch { fs = []; }
  const out = [];
  for (const f of fs) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') out.push(g.coordinates[0]);
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) out.push(p[0]);
  }
  return out;
}
function viewshedOf(L, o) {
  const s = L.style, c = L.geom.coordinates;
  const R = clamp(+s.radiusM || 250, 10, 5000), rays = clamp(Math.round(+s.rays || 360), 12, 1440);
  const key = `${c}|${R}|${rays}`;
  let v = vsCache.get(L.id);
  const now = performance.now();
  if (v && v.key === key && (v.stable || now - v.at < 1200)) return v;
  const kx = kxOf(c[1]);
  const toXY = (p) => [(p[0] - c[0]) * kx, (p[1] - c[1]) * KY];
  const rings = o.map ? buildingRings(o.map) : [];
  const near = [];
  const segs = [];
  const seen = new Set();
  for (const ring of rings) {
    const xy = ring.map(toXY);
    if (!xy.some(([x, y]) => x * x + y * y < (R * 1.6) ** 2)) continue;
    const sig = `${xy[0][0].toFixed(1)},${xy[0][1].toFixed(1)},${xy.length}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    near.push(ring);
    if (inPoly(0, 0, xy)) continue;
    for (let i = 0; i < xy.length - 1; i++) segs.push([xy[i][0], xy[i][1], xy[i + 1][0], xy[i + 1][1]]);
  }
  const pts = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2, dx = Math.sin(a), dy = Math.cos(a);
    let best = R;
    for (const [x1, y1, x2, y2] of segs) {
      const ex = x2 - x1, ey = y2 - y1;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const tt = (x1 * ey - y1 * ex) / den, ss = (x1 * dy - y1 * dx) / den;
      if (tt > 0 && tt < best && ss >= 0 && ss <= 1) best = tt;
    }
    pts.push([c[0] + (dx * best) / kx, c[1] + (dy * best) / KY, best / R]);
  }
  const frac = pts.reduce((a, p) => a + p[2] * p[2], 0) / pts.length;
  const stable = v && v.key === key && v.n === near.length && near.length > 0;
  v = { key, pts, near, frac, at: now, n: near.length, stable };
  vsCache.set(L.id, v);
  return v;
}
function viewshed(ctx, L, tm, o, phase) {
  if (L.geom?.type !== 'Point') return;
  const s = L.style, unit = o.unit, c = L.geom.coordinates;
  const v = viewshedOf(L, o);
  const u = prog(L, tm);
  const sweep = L.anim === 'sweep' && !tm.edit ? ease(u) : 1;
  const O = o.proj(c);
  ctx.globalAlpha *= tm.alpha;
  if (phase === 'below') {
    if (s.buildings !== false) {
      ctx.fillStyle = hexA(s.bldColor || '#29a8ff', 0.85 * clamp(u * 3, 0, 1));
      ctx.strokeStyle = 'rgba(0,30,60,0.8)'; ctx.lineWidth = 1 * unit;
      for (const ring of v.near) { ctx.beginPath(); ring.forEach((p, i) => { const q = o.proj(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    }
    const n = Math.max(2, Math.round(v.pts.length * sweep));
    const col = s.color || '#39d353';
    ctx.beginPath(); ctx.moveTo(O[0], O[1]);
    for (let i = 0; i < n; i++) { const q = o.proj(v.pts[i]); ctx.lineTo(q[0], q[1]); }
    ctx.closePath();
    ctx.fillStyle = hexA(col, 0.42); ctx.fill();
    ctx.strokeStyle = hexA(col, 0.95); ctx.lineWidth = 2 * unit; ctx.stroke();
    if (sweep < 1) {
      const q = o.proj(v.pts[n - 1]);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2 * unit; ctx.beginPath(); ctx.moveTo(O[0], O[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }
    return;
  }
  // above: range circle, observer, label
  const R = clamp(+s.radiusM || 250, 10, 5000);
  if (s.circle !== false) {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.5 * unit; ctx.setLineDash([7 * unit, 6 * unit]);
    ctx.beginPath();
    for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2; const q = o.proj([c[0] + (Math.sin(a) * R) / kxOf(c[1]), c[1] + (Math.cos(a) * R) / KY]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
    ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3 * unit; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(O[0] - 9 * unit, O[1]); ctx.lineTo(O[0] + 9 * unit, O[1]); ctx.moveTo(O[0], O[1] - 9 * unit); ctx.lineTo(O[0], O[1] + 9 * unit); ctx.stroke();
  if (s.label !== false && sweep >= 1) {
    const txt = `VISIBLE ${Math.round(v.frac * 100)}%`;
    ctx.font = `800 ${12 * unit}px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(txt).width;
    ctx.fillStyle = 'rgba(8,12,10,0.8)'; rr(ctx, O[0] + 14 * unit, O[1] - 30 * unit, tw + 16 * unit, 22 * unit, 4 * unit); ctx.fill();
    ctx.fillStyle = s.color || '#39d353'; ctx.fillText(txt, O[0] + 22 * unit, O[1] - 19 * unit);
  }
}

// ================================================================= drone video footprint
function pathAt(coords, f) {
  const kx = kxOf(coords[0][1]);
  const seg = []; let tot = 0;
  for (let i = 1; i < coords.length; i++) { const d = Math.hypot((coords[i][0] - coords[i - 1][0]) * kx, (coords[i][1] - coords[i - 1][1]) * KY); seg.push(d); tot += d; }
  let want = clamp(f, 0, 1) * tot;
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? clamp(want / seg[i], 0, 1) : 0;
      const a = coords[i], b = coords[i + 1];
      return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], hd: Math.atan2((b[0] - a[0]) * kx, (b[1] - a[1]) * KY), idx: i, tot };
    }
    want -= seg[i];
  }
  return { p: coords.at(-1), hd: 0, idx: coords.length - 2, tot };
}
function fmvState(L, tm) {
  const c = L.geom.coordinates, s = L.style;
  const f = tm.edit ? 0.55 : clamp(tm.tau / Math.max(0.5, +L.duration || 10), 0, 1);
  const st = pathAt(c, f);
  const kx = kxOf(st.p[1]);
  const off = (fw, rt) => [st.p[0] + (Math.sin(st.hd) * fw + Math.cos(st.hd) * rt) / kx, st.p[1] + (Math.cos(st.hd) * fw - Math.sin(st.hd) * rt) / KY];
  const A = +s.aheadM || 350, F = +s.footM || 220;
  const quad = [off(A - F * 0.45, -F * 0.35), off(A - F * 0.45, F * 0.35), off(A + F * 0.55, F * 0.6), off(A + F * 0.55, -F * 0.6)];
  return { ...st, f, quad, centre: off(A, 0) };
}
function fmvMap(ctx, L, tm, o) {
  const c = L.geom?.coordinates;
  if (L.geom?.type !== 'LineString' || c.length < 2) return;
  const s = L.style, unit = o.unit, t = o.time || 0;
  const st = fmvState(L, tm);
  const col = s.color || '#ffe11a';
  ctx.globalAlpha *= tm.alpha;
  // dashed track flown so far
  const done = [...c.slice(0, st.idx + 1), st.p].map((p) => o.proj(p));
  ctx.strokeStyle = col; ctx.lineWidth = 4 * unit; ctx.setLineDash([22 * unit, 26 * unit]); ctx.lineCap = 'butt';
  ctx.beginPath(); done.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
  ctx.setLineDash([]);
  // footprint
  const Q = st.quad.map((p) => o.proj(p));
  ctx.fillStyle = hexA(col, 0.1); ctx.strokeStyle = col; ctx.lineWidth = 3 * unit; ctx.lineJoin = 'round';
  ctx.beginPath(); Q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); ctx.stroke();
  // centre-line points inside the footprint
  const D = o.proj(st.p), C = o.proj(st.centre);
  ctx.fillStyle = col;
  for (const f of [0.55, 0.75, 0.95]) { const x = D[0] + (C[0] - D[0]) * (f + 0.15), y = D[1] + (C[1] - D[1]) * (f + 0.15); ctx.beginPath(); ctx.arc(x, y, 5 * unit, 0, Math.PI * 2); ctx.fill(); }
  // the drone, raised above the ground
  const pitch = o.map?.getPitch?.() ?? 0;
  const lift = 90 * unit * Math.sin(pitch * D2R) + 6 * unit;
  const U = [D[0], D[1] - lift];
  if (s.frustum !== false) {
    ctx.strokeStyle = hexA(col, 0.55); ctx.lineWidth = 1.2 * unit;
    for (const q of Q) { ctx.beginPath(); ctx.moveTo(U[0], U[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
    if (lift > 8 * unit) { ctx.setLineDash([3 * unit, 4 * unit]); ctx.beginPath(); ctx.moveTo(U[0], U[1]); ctx.lineTo(D[0], D[1]); ctx.stroke(); ctx.setLineDash([]); }
  }
  ctx.save(); ctx.translate(U[0], U[1]);
  ctx.fillStyle = '#1a1d22'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4 * unit;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(dx * 9 * unit, dy * 6 * unit); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(dx * 9 * unit, dy * 6 * unit, 6 * unit, 2 * unit, (t * 40) % Math.PI, 0, Math.PI * 2); ctx.globalAlpha *= 0.6; ctx.stroke(); ctx.globalAlpha /= 0.6;
  }
  rr(ctx, -5 * unit, -3.5 * unit, 10 * unit, 7 * unit, 2 * unit); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function fmvWindow(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, unit = o.unit, t = o.time || 0;
  if (!fr || s.window === false || L.geom?.type !== 'LineString' || L.geom.coordinates.length < 2) return;
  const st = fmvState(L, tm);
  const W = fr.w * clamp(+s.winSize || 0.42, 0.15, 0.8), H = W * 0.95;
  const m = 30 * unit;
  const pos = s.position || 'top-left';
  let x = pos.includes('right') ? fr.x + fr.w - m - W : fr.x + m, y = pos.includes('bottom') ? fr.y + fr.h - m - H : fr.y + m;
  placeAt(ctx, L, fr, x, y, W, H);
  const k = tm.edit ? 1 : easeOut(tm.tau / 0.5);
  ctx.globalAlpha *= tm.alpha * k;
  ctx.translate(x + W / 2, y + H / 2); ctx.scale(0.9 + 0.1 * k, 0.9 + 0.1 * k); ctx.translate(-(x + W / 2), -(y + H / 2));
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 24 * unit;
  ctx.fillStyle = '#1f2329'; ctx.fillRect(x, y, W, H);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#2b88d8'; ctx.lineWidth = 1.5 * unit; ctx.strokeRect(x, y, W, H);
  const th = 30 * unit;
  ctx.fillStyle = '#e9edf2'; ctx.font = `500 ${13 * unit}px ${UI}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(s.title || 'FMV', x + 14 * unit, y + th / 2);
  ctx.textAlign = 'right'; ctx.fillText('▢    ✕', x + W - 14 * unit, y + th / 2);
  // tab + toolbar
  ctx.fillStyle = '#2b88d8'; ctx.fillRect(x + 8 * unit, y + th, 110 * unit, 22 * unit);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = `500 ${11 * unit}px ${UI}`; ctx.fillText('Exercise', x + 16 * unit, y + th + 11 * unit);
  const tb = y + th + 26 * unit;
  ctx.fillStyle = '#ffd400'; ctx.fillRect(x + 12 * unit, tb + 5 * unit, 16 * unit, 16 * unit);
  for (let i = 0; i < 14; i++) { ctx.fillStyle = i % 3 ? '#4a5563' : '#5b88b8'; rr(ctx, x + 50 * unit + i * 24 * unit, tb + 6 * unit, 15 * unit, 15 * unit, 2 * unit); ctx.fill(); }
  // video area: a magnified, desaturated view of the footprint
  const vx = x + 10 * unit, vy = tb + 30 * unit, vw = W - 20 * unit, vh = H - (vy - y) - 74 * unit;
  ctx.fillStyle = '#000'; ctx.fillRect(vx, vy, vw, vh);
  const Q = st.quad.map((p) => o.proj(p));
  const C = o.proj(st.centre);
  const span = Math.max(40 * unit, Math.max(...Q.map((q) => Math.abs(q[0] - C[0]))) * 1.3, (Math.max(...Q.map((q) => Math.abs(q[1] - C[1]))) * 1.3 * vw) / vh);
  const cw = span * 2, ch = (cw * vh) / vw;
  ctx.save(); ctx.beginPath(); ctx.rect(vx, vy, vw, vh); ctx.clip();
  ctx.filter = 'saturate(0.75) contrast(1.15) brightness(0.95)';
  drawMapCrop(ctx, o, C[0] - cw / 2, C[1] - ch / 2, cw, ch, vx, vy, vw, vh);
  ctx.filter = 'none';
  // KLV-style telemetry burned into the picture
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = `600 ${10 * unit}px ${MONO}`; ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 3 * unit;
  const d = new Date(Date.UTC(2012, 8, 19, 20, 48, 40) + t * 1000);
  const lat = st.p[1], lon = st.p[0];
  ctx.textAlign = 'left';
  ctx.fillText(`${d.toISOString().slice(0, 10)}  AUTO`, vx + 8 * unit, vy + 14 * unit);
  ctx.fillText(`UTC ${d.toISOString().slice(11, 19)}`, vx + 8 * unit, vy + 28 * unit);
  ctx.fillText(`${Math.abs(lat).toFixed(5)}${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(5)}${lon >= 0 ? 'E' : 'W'}`, vx + 8 * unit, vy + vh - 12 * unit);
  ctx.textAlign = 'right';
  ctx.fillText(`HDG ${String(Math.round(((st.hd / D2R) + 360) % 360)).padStart(3, '0')}  ALT 6124FT`, vx + vw - 8 * unit, vy + 14 * unit);
  ctx.fillText(`SLR ${(1.2 + Math.sin(t * 0.4) * 0.05).toFixed(2)}NM`, vx + vw - 8 * unit, vy + vh - 12 * unit);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2 * unit;
  const mx = vx + vw / 2, my = vy + vh / 2;
  ctx.beginPath(); ctx.moveTo(mx - 14 * unit, my); ctx.lineTo(mx - 5 * unit, my); ctx.moveTo(mx + 5 * unit, my); ctx.lineTo(mx + 14 * unit, my); ctx.moveTo(mx, my - 14 * unit); ctx.lineTo(mx, my - 5 * unit); ctx.moveTo(mx, my + 5 * unit); ctx.lineTo(mx, my + 14 * unit); ctx.stroke();
  ctx.restore();
  // player controls
  const py = vy + vh + 12 * unit;
  ctx.fillStyle = '#4a5563'; ctx.fillRect(vx + 12 * unit, py + 6 * unit, vw - 24 * unit, 3 * unit);
  ctx.fillStyle = '#ffffff'; rr(ctx, vx + 12 * unit + (vw - 40 * unit) * st.f, py, 16 * unit, 15 * unit, 2 * unit); ctx.fill();
  ctx.font = `600 ${15 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.fillStyle = '#4fa3ff';
  ctx.fillText('⏮  ⏪  ◀  ❚❚  ▶  ⏩  ⏭', vx + vw / 2, py + 34 * unit);
  ctx.font = `500 ${11 * unit}px ${UI}`; ctx.fillStyle = '#d6dbe2'; ctx.textAlign = 'right';
  const total = Math.max(1, +L.duration || 10), now = st.f * total;
  const mm = (v) => `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
  ctx.fillText(`${mm(now)}/${mm(total)}`, vx + vw - 6 * unit, py + 34 * unit);
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.abs(lon).toFixed(7)}°${lon >= 0 ? 'E' : 'W'} ${Math.abs(lat).toFixed(7)}°${lat >= 0 ? 'N' : 'S'}`, vx + 6 * unit, py + 52 * unit);
}

// ================================================================= hologram projection (screen effect)
export function drawHologram(ctx, fr, unit, t, k, src, seed) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgba(70,110,255,${0.55 * k})`; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = `rgba(30,60,200,${0.18 * k})`; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
  // light columns
  const r = rng(seed);
  for (let i = 0; i < 6; i++) {
    const x = fr.x + (0.04 + r() * 0.92) * fr.w, w = (18 + r() * 50) * unit;
    const fl = 0.6 + 0.4 * Math.sin(t * (1.5 + r() * 3) + i);
    const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
    g.addColorStop(0, 'rgba(120,170,255,0)'); g.addColorStop(0.5, `rgba(170,210,255,${0.32 * k * fl})`); g.addColorStop(1, 'rgba(120,170,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x - w, fr.y, w * 2, fr.h);
  }
  ctx.globalCompositeOperation = 'source-over';
  // scan lines
  ctx.fillStyle = `rgba(0,0,20,${0.22 * k})`;
  for (let y = fr.y; y < fr.y + fr.h; y += 3 * unit) ctx.fillRect(fr.x, y, fr.w, 1 * unit);
  // pixel-block dissolve
  const rr2 = rng(seed + Math.floor(t * 12));
  const bs = 14 * unit;
  for (let i = 0; i < 34 * k; i++) {
    const bx = fr.x + Math.floor((rr2() * fr.w) / bs) * bs, by = fr.y + Math.floor((rr2() * fr.h) / bs) * bs;
    const sz = bs * (1 + Math.floor(rr2() * 3));
    if (src && rr2() < 0.6) {
      const sxk = src.sw / fr.w, syk = src.sh / fr.h;
      try { ctx.globalAlpha = 0.55; ctx.drawImage(src.canvas, src.sx + (bx - fr.x) * sxk, src.sy + (by - fr.y) * syk, sz * sxk, sz * syk, bx + (rr2() - 0.5) * 3 * bs, by, sz, sz); } catch { /* ignore */ }
    } else { ctx.globalAlpha = 0.25 * k; ctx.fillStyle = rr2() < 0.5 ? '#9fc3ff' : '#2a3cff'; ctx.fillRect(bx, by, sz, sz); }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ================================================================= scrolling code (HUD text look)
const CODE = `static int scan_tiles(struct tile_set *set, const struct bbox *box)
{
\tint i, n = 0;
\tfor (i = 0; i < set->count; i++) {
\t\tstruct tile *t = &set->tiles[i];
\t\tif (!bbox_intersects(&t->bounds, box))
\t\t\tcontinue;
\t\tt->state = TILE_QUEUED;
\t\tn += queue_push(&set->queue, t);
\t}
\treturn n;
}
/* resample the raster into the target grid */
void resample_band(const float *src, float *dst, int w, int h)
{
\tfor (int y = 0; y < h; y++)
\t\tfor (int x = 0; x < w; x++)
\t\t\tdst[y * w + x] = bilinear(src, x * 0.5f, y * 0.5f);
}
if (ndvi > threshold) mark_vegetation(cell);
geo = project(lon, lat, EPSG_3857);`;
export function drawCodeText(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, unit = o.unit * (+s.size || 1), t = o.time || 0;
  if (!fr) return;
  const lines = String(s.text && s.text.length > 20 ? s.text : CODE).split('\n');
  const pos = s.position || 'full';
  let R = { ...fr };
  if (pos.includes('left') || pos.includes('right')) R = { x: pos.includes('right') ? fr.x + fr.w / 2 : fr.x, y: fr.y, w: fr.w / 2, h: fr.h };
  ctx.save();
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !tm.edit ? ease(tm.tau / 0.6) : 1);
  ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
  ctx.fillStyle = `rgba(4,3,14,${clamp(s.bg ?? 0.88, 0, 1)})`; ctx.fillRect(R.x, R.y, R.w, R.h);
  const col = s.color || '#a46bff';
  const lh = 26 * unit;
  const scroll = (t * 22 * unit * (+s.speed || 1)) % (lines.length * lh);
  const reveal = tm.edit ? 2 : tm.tau / 1.2;
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  for (let pass = 0; pass < 2; pass++) {
    const far = pass === 0;
    ctx.save();
    if (far) { ctx.filter = `blur(${(2.5 * unit).toFixed(1)}px)`; ctx.globalAlpha *= 0.45; }
    ctx.font = `${far ? 500 : 600} ${(far ? 22 : 17) * unit}px ${MONO}`;
    const r = rng(hashStr(L.id) + pass * 99);
    const rows = Math.ceil(R.h / lh) + lines.length;
    for (let i = 0; i < rows; i++) {
      const ln = lines[i % lines.length].replace(/\t/g, '    ');
      const y = R.y + i * lh * (far ? 1.4 : 1) - scroll * (far ? 0.6 : 1) + 20 * unit;
      if (y < R.y - lh || y > R.y + R.h + lh) continue;
      const x = R.x + (far ? R.w * 0.35 : 40 * unit) + (far ? r() * 80 * unit : 0);
      let txt = ln;
      if (!far) {
        const f = (y - R.y) / R.h;
        if (f > reveal) continue;
        if (f > reveal - 0.08) txt = ln.slice(0, Math.ceil(ln.length * clamp((reveal - f) / 0.08, 0, 1)));
      }
      const kw = /\b(static|int|struct|for|if|return|void|float|continue|const)\b/.test(txt);
      ctx.fillStyle = kw ? '#ff4fd8' : /\/\*/.test(txt) ? '#7f8cff' : col;
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10 * unit;
      ctx.fillText(txt, x, y);
      if (!far && r() < 0.25) { ctx.globalAlpha *= 0.35; ctx.fillRect(x + ctx.measureText(txt).width + 20 * unit, y - 3 * unit, (60 + r() * 220) * unit, 6 * unit); ctx.globalAlpha /= 0.35; }
    }
    ctx.restore();
  }
  ctx.restore();
}

// ================================================================= knowledge graph
const KG_COL = { person: '#29a8e0', bus: '#22c3d6', car: '#22c3d6', repair: '#ff7a1a', alert: '#e8202a', building: '#8a7bff', doc: '#7b8794', phone: '#3ddc84', place: '#ffb020' };
const KG_TYPES = Object.keys(KG_COL);
function kgIcon(ctx, type, x, y, r) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = r * 0.14; ctx.lineCap = 'round';
  const s = r * 0.5;
  if (type === 'person') { ctx.beginPath(); ctx.arc(0, -s * 0.45, s * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(0, s * 0.62, s * 0.78, s * 0.52, 0, Math.PI, 0); ctx.fill(); }
  else if (type === 'bus' || type === 'car') {
    rr(ctx, -s * 0.8, -s * 0.85, s * 1.6, s * 1.45, s * 0.3); ctx.fill();
    ctx.fillStyle = KG_COL[type]; ctx.fillRect(-s * 0.55, -s * 0.6, s * 1.1, s * 0.5);
    ctx.beginPath(); ctx.arc(-s * 0.42, s * 0.3, s * 0.14, 0, Math.PI * 2); ctx.arc(s * 0.42, s * 0.3, s * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(-s * 0.6, s * 0.6, s * 0.25, s * 0.25); ctx.fillRect(s * 0.35, s * 0.6, s * 0.25, s * 0.25);
  } else if (type === 'repair') {
    for (const a of [Math.PI / 4, -Math.PI / 4]) { ctx.save(); ctx.rotate(a); ctx.lineWidth = s * 0.3; ctx.beginPath(); ctx.moveTo(0, -s * 0.75); ctx.lineTo(0, s * 0.75); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -s * 0.75, s * 0.28, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  } else if (type === 'alert') {
    ctx.beginPath(); ctx.moveTo(0, -s * 0.85); ctx.lineTo(s * 0.9, s * 0.7); ctx.lineTo(-s * 0.9, s * 0.7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = KG_COL.alert; ctx.fillRect(-s * 0.08, -s * 0.35, s * 0.16, s * 0.6); ctx.fillRect(-s * 0.08, s * 0.38, s * 0.16, s * 0.16);
  } else if (type === 'building') { ctx.fillRect(-s * 0.6, -s * 0.8, s * 1.2, s * 1.6); ctx.fillStyle = KG_COL.building; for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) ctx.fillRect(-s * 0.4 + j * s * 0.5, -s * 0.6 + i * s * 0.45, s * 0.3, s * 0.25); }
  else if (type === 'doc') { ctx.fillRect(-s * 0.55, -s * 0.8, s * 1.1, s * 1.6); ctx.fillStyle = KG_COL.doc; for (let i = 0; i < 3; i++) ctx.fillRect(-s * 0.35, -s * 0.45 + i * s * 0.38, s * 0.7, s * 0.12); }
  else if (type === 'phone') { rr(ctx, -s * 0.42, -s * 0.85, s * 0.84, s * 1.7, s * 0.18); ctx.fill(); ctx.fillStyle = KG_COL.phone; ctx.fillRect(-s * 0.3, -s * 0.6, s * 0.6, s * 1.05); }
  else if (type === 'place') { ctx.beginPath(); ctx.arc(0, -s * 0.25, s * 0.55, Math.PI, 0); ctx.lineTo(0, s * 0.9); ctx.closePath(); ctx.fill(); ctx.fillStyle = KG_COL.place; ctx.beginPath(); ctx.arc(0, -s * 0.25, s * 0.22, 0, Math.PI * 2); ctx.fill(); }
  else { ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
function kgParse(txt) {
  const nodes = [], by = new Map();
  for (const line of String(txt || '').split('\n')) {
    const [name, type, link] = line.split('|').map((x) => x.trim());
    if (!name) continue;
    const n = { name, type: KG_TYPES.includes((type || '').toLowerCase()) ? type.toLowerCase() : (type || 'generic').toLowerCase(), link: link || '', kids: [] };
    nodes.push(n); by.set(name.toLowerCase(), n);
  }
  nodes.forEach((n, i) => { if (!i) return; n.parent = by.get(n.link.toLowerCase()) || nodes[0]; if (n.parent === n) n.parent = nodes[0]; n.parent.kids.push(n); });
  return nodes;
}
function kgLayout(nodes, cx, cy, R) {
  if (!nodes.length) return;
  const root = nodes[0];
  root.x = cx; root.y = cy; root.depth = 0;
  const place = (n, a0, a1, depth) => {
    const k = n.kids.length;
    n.kids.forEach((c, i) => {
      const a = k === 1 && depth > 0 ? (a0 + a1) / 2 : a0 + ((i + 0.5) / k) * (a1 - a0);
      const rad = R * (depth === 0 ? 1 : 0.55) * (depth === 0 && k > 9 ? (i % 2 ? 1.18 : 0.82) : 1);
      c.x = n.x + Math.cos(a) * rad; c.y = n.y + Math.sin(a) * rad * 0.82; c.depth = depth + 1;
      const span = depth === 0 ? Math.min(Math.PI * 0.9, (Math.PI * 2) / Math.max(1, k) * 1.4) : (a1 - a0) / Math.max(1, k);
      place(c, a - span / 2, a + span / 2, depth + 1);
    });
  };
  place(root, -Math.PI / 2, Math.PI * 1.5, 0);
}
function kGraph(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, t = o.time || 0;
  if (!fr) return;
  const unit = o.unit * (+s.size || 1);
  const col = s.color || '#29c6e0';
  const u = prog(L, tm);
  const lay = s.layout || 'panel';
  const R0 = lay === 'panel' ? { x: fr.x, y: fr.y + fr.h * 0.44, w: fr.w, h: fr.h * 0.56 } : { ...fr };
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' ? ease(u) : 1);
  // panel background + search bar
  if (lay !== 'overlay') {
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(R0.x, R0.y, R0.w, 44 * o.unit);
    ctx.fillStyle = 'rgba(0,14,18,0.78)'; ctx.fillRect(R0.x, R0.y + 44 * o.unit, R0.w, R0.h - 44 * o.unit);
    ctx.fillStyle = '#5b5f63'; ctx.fillRect(R0.x + 10 * o.unit, R0.y + 10 * o.unit, 190 * o.unit, 25 * o.unit);
    const q = String(s.search || '');
    ctx.fillStyle = '#fff'; ctx.font = `500 ${13 * o.unit}px ${UI}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(q.slice(0, Math.ceil(q.length * clamp(u * 3, 0, 1))), R0.x + 16 * o.unit, R0.y + 23 * o.unit);
    ctx.strokeStyle = '#b8bec4'; ctx.lineWidth = 1.6 * o.unit; const tx = R0.x + 220 * o.unit, ty = R0.y + 15 * o.unit;
    ctx.strokeRect(tx, ty + 3 * o.unit, 11 * o.unit, 13 * o.unit); ctx.beginPath(); ctx.moveTo(tx - 2 * o.unit, ty + 2 * o.unit); ctx.lineTo(tx + 13 * o.unit, ty + 2 * o.unit); ctx.stroke();
    ctx.restore();
  }
  const R = lay === 'overlay' ? R0 : { x: R0.x, y: R0.y + 44 * o.unit, w: R0.w, h: R0.h - 44 * o.unit };
  const panelW = s.panel !== false ? Math.min(220 * o.unit, R.w * 0.22) : 0;
  ctx.save(); ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
  // background network cloud
  const nCloud = clamp(Math.round(+s.cloud || 0), 0, 400);
  const seed = hashStr(L.id);
  if (nCloud) {
    const r = rng(seed);
    const cloudK = tm.edit ? 0.25 : clamp(u * 3, 0, 1) * (1 - 0.75 * clamp((u - 0.3) / 0.25, 0, 1));
    const pts = [];
    const hubs = Array.from({ length: 9 }, () => [R.x + (0.05 + r() * 0.75) * (R.w - panelW), R.y + (0.1 + r() * 0.8) * R.h]);
    for (let i = 0; i < nCloud; i++) { const hb = hubs[i % hubs.length]; pts.push([hb[0] + (r() - 0.5) * 140 * unit * (0.3 + r()), hb[1] + (r() - 0.5) * 110 * unit * (0.3 + r()), KG_TYPES[Math.floor(r() * 5)], r()]); }
    ctx.save(); ctx.globalAlpha *= cloudK;
    ctx.strokeStyle = 'rgba(200,210,220,0.35)'; ctx.lineWidth = 0.8 * unit;
    pts.forEach((p, i) => { if (i % 2) return; const q = pts[(i * 7 + 3) % pts.length]; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); });
    pts.forEach((p, i) => {
      const k = tm.edit ? 1 : backOut(clamp((u * 4 - p[3]) / 0.5, 0, 1));
      if (k <= 0) return;
      const rr2 = 11 * unit * k;
      ctx.fillStyle = '#4b5258'; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1 * unit;
      ctx.beginPath(); ctx.arc(p[0], p[1], rr2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      kgIcon(ctx, p[2], p[0], p[1], rr2 * 0.95);
    });
    ctx.restore();
  }
  // focus graph
  const nodes = kgParse(s.data);
  if (nodes.length) {
    const gu = nCloud && !tm.edit ? clamp((u - 0.35) / 0.65, 0, 1) : u;
    const cx = R.x + (R.w - panelW) / 2, cy = R.y + R.h / 2;
    kgLayout(nodes, cx, cy, Math.min((R.w - panelW) * 0.3, R.h * (nodes.some((n) => n.depth > 1 || (n.parent && n.parent !== nodes[0])) ? 0.27 : 0.36)));
    const appear = (n, i) => (tm.edit || L.anim === 'none' ? 1 : clamp((gu * 1.4 - (n.depth ? 0.12 + (i / nodes.length) * 0.75 : 0)) / 0.25, 0, 1));
    const ks = nodes.map(appear);
    const fl = (n, i) => [n.x + Math.sin(t * 0.8 + i) * 2.5 * unit, n.y + Math.cos(t * 0.7 + i * 1.3) * 2.5 * unit];
    ctx.strokeStyle = 'rgba(230,240,245,0.75)'; ctx.lineWidth = 1 * unit;
    nodes.forEach((n, i) => {
      if (!n.parent || ks[i] <= 0) return;
      const a = fl(n.parent, nodes.indexOf(n.parent)), b = fl(n, i), k = Math.min(1, ks[i] * 1.5);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k); ctx.stroke();
    });
    nodes.forEach((n, i) => {
      const k = ks[i];
      if (k <= 0) return;
      const [x, y] = fl(n, i);
      const rr2 = (i ? 15 : 17) * unit * backOut(k);
      const c = KG_COL[n.type] || '#7b8794';
      ctx.save();
      ctx.shadowColor = hexA(c, 0.8); ctx.shadowBlur = (i ? 6 : 16) * unit;
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, rr2, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      if (!i) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * unit; ctx.stroke(); ctx.strokeStyle = hexA(c, 0.5 * (1 - ((t * 0.8) % 1))); ctx.beginPath(); ctx.arc(x, y, rr2 * (1.2 + ((t * 0.8) % 1) * 0.8), 0, Math.PI * 2); ctx.stroke(); }
      kgIcon(ctx, n.type, x, y, rr2);
      ctx.fillStyle = '#ffffff'; ctx.font = `500 ${9.5 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 3 * unit; ctx.globalAlpha *= clamp(k * 2 - 1, 0, 1);
      ctx.fillText(n.name.toUpperCase(), x, y + rr2 + 4 * unit);
      ctx.restore();
    });
    // details panel
    if (panelW) {
      const pk = tm.edit ? 1 : easeOut((gu - 0.15) / 0.4);
      const px = R.x + R.w - panelW * pk;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.92)'; ctx.fillRect(px, R.y, panelW, R.h);
      const root = nodes[0], c = KG_COL[root.type] || col;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
      ctx.font = `800 ${14 * o.unit}px ${UI}`; ctx.fillText(root.name.toUpperCase(), px + panelW / 2, R.y + 22 * o.unit, panelW - 16 * o.unit);
      ctx.font = `500 ${10 * o.unit}px ${UI}`; ctx.fillText(root.type.replace(/^./, (m) => m.toUpperCase()), px + panelW / 2, R.y + 38 * o.unit);
      const ir = 20 * o.unit;
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px + panelW / 2, R.y + 72 * o.unit, ir, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * o.unit; ctx.stroke();
      kgIcon(ctx, root.type, px + panelW / 2, R.y + 72 * o.unit, ir);
      ctx.font = `500 ${10 * o.unit}px ${UI}`; ctx.textAlign = 'left';
      ctx.fillStyle = col; ctx.fillText('Properties', px + 12 * o.unit, R.y + 110 * o.unit);
      ctx.fillStyle = '#fff'; ctx.fillText('Relationships', px + 80 * o.unit, R.y + 110 * o.unit);
      ctx.fillText('Docs', px + 160 * o.unit, R.y + 110 * o.unit, panelW - 165 * o.unit);
      String(s.props || '').split('\n').filter(Boolean).slice(0, 5).forEach((line, i) => {
        const [k2, ...v] = line.split(':');
        const yy = R.y + 124 * o.unit + i * 46 * o.unit;
        if (yy + 40 * o.unit > R.y + R.h) return;
        ctx.fillStyle = '#2a2d31'; ctx.fillRect(px + 8 * o.unit, yy, panelW - 16 * o.unit, 40 * o.unit);
        ctx.fillStyle = '#fff'; ctx.font = `800 ${9.5 * o.unit}px ${UI}`; ctx.fillText(k2.trim().toUpperCase(), px + 14 * o.unit, yy + 12 * o.unit);
        ctx.font = `500 ${10 * o.unit}px ${UI}`; ctx.fillText(v.join(':').trim(), px + 14 * o.unit, yy + 28 * o.unit, panelW - 28 * o.unit);
      });
      ctx.restore();
    }
  }
  ctx.restore();
}

// ================================================================= highlight tiles / mosaic
function tiles(ctx, L, tm, o) {
  if (L.geom?.type !== 'Polygon') return;
  const s = L.style, unit = o.unit, t = o.time || 0;
  const ring = ring0(L.geom);
  const u = prog(L, tm);
  const op = clamp(+s.opacity || 0.6, 0, 1);
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' ? ease(u) : 1);
  if (s.mode === 'mosaic') {
    const lat = ring[0][1], kx = kxOf(lat), cm = Math.max(10, +s.cellM || 180);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const dx = cm / kx, dy = cm / KY;
    const nx = Math.ceil((x1 - x0) / dx), ny = Math.ceil((y1 - y0) / dy);
    const step = Math.max(1, Math.ceil(Math.sqrt((nx * ny) / 5000)));
    const seed = hashStr(L.id) + (+s.seed || 0) * 17;
    ctx.save();
    ctx.beginPath(); ring.forEach((p, i) => { const q = o.proj(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.clip();
    ctx.globalCompositeOperation = 'color';
    for (let i = 0; i < nx; i += step) for (let j = 0; j < ny; j += step) {
      const coarse = rng(seed + Math.floor(i / 3) * 104729 + Math.floor(j / 3) * 7);
      const r = rng(seed + i * 7919 + j);
      const h = (coarse() - 0.5) * 1.6 + (r() - 0.5) * 0.8;
      const k = L.anim === 'pop' && !tm.edit ? clamp(u * 1.5 - r() * 0.5, 0, 1) : 1;
      if (k <= 0) continue;
      const a = o.proj([x0 + i * dx, y0 + (j + step) * dy]), b = o.proj([x0 + (i + step) * dx, y0 + j * dy]);
      ctx.fillStyle = hexA(h > 0 ? s.color || '#ff3df2' : s.color2 || '#3d6bff', op * k * (0.55 + 0.45 * Math.abs(h)));
      ctx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]) + 0.6, Math.abs(b[1] - a[1]) + 0.6);
    }
    ctx.restore();
    return;
  }
  const pts = samplePoly(ring, clamp(Math.round(+s.count || 14), 1, 120), hashStr(L.id) + (+s.seed || 0) * 31);
  const r = rng(hashStr(L.id) + 5);
  ctx.globalCompositeOperation = 'screen';
  pts.forEach((g, i) => {
    const p = o.proj(g);
    const sz = (40 + r() * 140) * unit * (+s.size || 1);
    const per = 3 + r() * 3, ph = r() * per;
    const life = tm.edit ? 1 : Math.sin(Math.PI * clamp(((t + ph) % per) / per, 0, 1)) ** 0.6;
    const k = L.anim === 'pop' && !tm.edit ? clamp(u * 2 - (i / pts.length), 0, 1) : 1;
    const a = op * life * k;
    if (a <= 0.01) return;
    ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate((+s.angle || 0) * D2R);
    const g2 = ctx.createLinearGradient(-sz / 2, -sz / 2, sz / 2, sz / 2);
    g2.addColorStop(0, hexA(s.color || '#ff3df2', a)); g2.addColorStop(1, hexA(s.color || '#ff3df2', a * 0.45));
    ctx.fillStyle = g2; ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,255,255,${0.08 * a})`; ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
    ctx.restore();
  });
}

// ================================================================= storm vortex
function vortex(ctx, L, tm, o) {
  if (L.geom?.type !== 'Point') return;
  const s = L.style, unit = o.unit, t = o.time || 0;
  const c = L.geom.coordinates;
  const P = o.proj(c);
  const E = o.proj([c[0] + ((+s.radiusKm || 300) * 1000) / kxOf(c[1]), c[1]]);
  const u = prog(L, tm);
  const grow = L.anim === 'spin' && !tm.edit ? easeOut(u) : 1;
  const R = clamp(Math.hypot(E[0] - P[0], E[1] - P[1]), 30 * unit, Math.min(ctx.canvas.width, ctx.canvas.height) * 0.48) * grow;
  const sp = (+s.speed || 1) * (L.anim === 'spin' && !tm.edit ? 0.4 + 0.6 * u : 1);
  ctx.globalAlpha *= tm.alpha;
  if (s.glow !== false) {
    const g = ctx.createRadialGradient(P[0], P[1] - R * 0.15, R * 0.05, P[0], P[1] - R * 0.15, R * 0.75);
    g.addColorStop(0, 'rgba(255,240,255,0.0)'); g.addColorStop(0.2, 'rgba(255,235,255,0.55)'); g.addColorStop(1, 'rgba(255,200,255,0)');
    ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = g; ctx.fillRect(P[0] - R, P[1] - R * 1.2, R * 2, R * 2);
  }
  ctx.globalCompositeOperation = 'lighter';
  const r = rng(hashStr(L.id));
  const cols = ['#ffffff', '#ffffff', '#8affdc', '#ffbf7a', '#ff7a9a'];
  const n = clamp(Math.round(+s.streaks || 90), 5, 400);
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const rr2 = R * (0.12 + 0.88 * Math.sqrt(r()));
    const len = 0.25 + r() * 1.2;
    const a0 = r() * Math.PI * 2 + t * sp * (0.6 + 1.8 * (R / rr2) * 0.12) * 1.4;
    const col = rr2 < R * 0.45 ? (r() < 0.8 ? '#ffffff' : cols[2]) : cols[Math.floor(r() * cols.length)];
    const w = (1 + r() * 2) * unit;
    const seg = 10;
    for (let j = 0; j < seg; j++) {
      const f0 = j / seg, f1 = (j + 1) / seg;
      ctx.strokeStyle = hexA(col, 0.85 * f1);
      ctx.lineWidth = w * (0.4 + 0.6 * f1);
      ctx.beginPath(); ctx.arc(P[0], P[1], rr2, a0 - len * (1 - f0), a0 - len * (1 - f1)); ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  const eye = ctx.createRadialGradient(P[0], P[1], 0, P[0], P[1], R * 0.13);
  eye.addColorStop(0, 'rgba(10,10,14,0.85)'); eye.addColorStop(1, 'rgba(10,10,14,0)');
  ctx.fillStyle = eye; ctx.beginPath(); ctx.arc(P[0], P[1], R * 0.13, 0, Math.PI * 2); ctx.fill();
  // wind labels
  const nl = clamp(Math.round(+s.labels ?? 9), 0, 30);
  const rl = rng(hashStr(L.id) + 3);
  for (let i = 0; i < nl; i++) {
    const k = tm.edit ? 1 : clamp((u - 0.3 - i * 0.05) / 0.25, 0, 1);
    if (k <= 0) continue;
    const a = (i / nl) * Math.PI * 2 + rl() * 0.4, d = R * (0.55 + rl() * 0.45);
    const x = P[0] + Math.cos(a) * d, y = P[1] + Math.sin(a) * d;
    const val = Math.round((+s.value || 105) + (rl() - 0.5) * 2 * (+s.spread || 6) + Math.sin(t * 0.7 + i) * 1.5);
    ctx.save(); ctx.globalAlpha *= k;
    ctx.fillStyle = '#f2d67a'; ctx.fillRect(x - 3 * unit, y - 3 * unit, 6 * unit, 6 * unit);
    const bx = x + 20 * unit, by = y - 46 * unit;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1 * unit;
    ctx.beginPath(); ctx.moveTo(x + 3 * unit, y - 3 * unit); ctx.lineTo(bx, by + 34 * unit); ctx.stroke();
    ctx.fillStyle = 'rgba(30,30,36,0.35)'; ctx.fillRect(bx, by, 76 * unit, 34 * unit); ctx.strokeRect(bx, by, 76 * unit, 34 * unit);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${6 * unit}px ${UI}`; ctx.fillText(s.title || 'WIND SPEED', bx + 4 * unit, by + 8 * unit);
    ctx.font = `600 ${20 * unit}px ${UI}`; ctx.fillText(String(val), bx + 4 * unit, by + 29 * unit);
    ctx.font = `700 ${9 * unit}px ${UI}`; ctx.fillText(s.unit || 'MPH', bx + 46 * unit, by + 20 * unit);
    ctx.fillStyle = '#ff8fb0'; ctx.fillRect(bx + 50 * unit, by + 24 * unit, 6 * unit, 5 * unit);
    ctx.restore();
  }
}

// ================================================================= ship track (AIS)
const dm = (v, pos, neg) => `${Math.floor(Math.abs(v))} ${((Math.abs(v) % 1) * 60).toFixed(1)} ${v >= 0 ? pos : neg}`;
function vessel(ctx, L, tm, o) {
  const c = L.geom?.coordinates;
  if (L.geom?.type !== 'LineString' || c.length < 2) return;
  const s = L.style, unit = o.unit, t = o.time || 0;
  const f = tm.edit ? 0.55 : clamp(tm.tau / Math.max(0.5, +L.duration || 10), 0, 1);
  const st = pathAt(c, f);
  const col = s.color || '#e8323c';
  ctx.globalAlpha *= tm.alpha;
  const P = c.map((p) => o.proj(p));
  ctx.strokeStyle = col; ctx.lineWidth = 4 * unit; ctx.setLineDash([14 * unit, 10 * unit]); ctx.lineDashOffset = -t * 20 * unit;
  ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); ctx.setLineDash([]);
  // buoy at the end
  if (s.buoy !== false) {
    const B = P.at(-1), h = 46 * unit;
    ctx.save();
    ctx.strokeStyle = '#f59a1a'; ctx.lineWidth = 4 * unit; ctx.beginPath(); ctx.moveTo(B[0], B[1]); ctx.lineTo(B[0], B[1] - h * 0.6); ctx.stroke();
    const bw = 22 * unit, bh = 30 * unit, by = B[1] - h * 0.6 - bh;
    ctx.fillStyle = '#f08a10'; ctx.beginPath(); ctx.moveTo(B[0] - bw, by); ctx.lineTo(B[0] - bw * 0.85, by + bh); ctx.quadraticCurveTo(B[0], by + bh + 8 * unit, B[0] + bw * 0.85, by + bh); ctx.lineTo(B[0] + bw, by); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffb03a'; ctx.beginPath(); ctx.ellipse(B[0], by, bw, 8 * unit, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  const S = o.proj(st.p);
  const bearing = o.map?.getBearing?.() || 0;
  if (s.ship !== false) {
    ctx.save(); ctx.translate(S[0], S[1]); ctx.rotate(st.hd - bearing * D2R);
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 8 * unit;
    ctx.fillStyle = '#f4f6f8'; ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = 1 * unit;
    ctx.beginPath(); ctx.moveTo(0, -30 * unit); ctx.lineTo(11 * unit, -12 * unit); ctx.lineTo(11 * unit, 26 * unit); ctx.lineTo(-11 * unit, 26 * unit); ctx.lineTo(-11 * unit, -12 * unit); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = '#c9cfd6'; ctx.fillRect(-6 * unit, 0, 12 * unit, 16 * unit);
    ctx.restore();
  }
  if (s.callout !== false) {
    const cx = S[0] - 10 * unit, cy = S[1] - 70 * unit;
    const lat = st.p[1], lon = st.p[0];
    const cog = String(Math.round(((st.hd / D2R) + 360) % 360)).padStart(3, '0');
    ctx.save();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4 * unit;
    ctx.font = `italic 700 ${16 * unit}px ${UI}`; ctx.fillText(s.name || 'Vessel', cx, cy - 40 * unit);
    ctx.font = `500 ${13 * unit}px ${UI}`;
    ctx.fillText(`LAT: ${dm(lat, 'N', 'S')}, LON: ${dm(lon, 'E', 'W')}`, cx, cy - 20 * unit);
    ctx.fillText(`COG: ${cog} SOG: ${(+s.sog || 9.6).toFixed(1)}KT`, cx, cy);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * unit;
    ctx.beginPath(); ctx.moveTo(cx - 6 * unit, cy - 62 * unit); ctx.lineTo(cx + 10 * unit, cy - 62 * unit); ctx.lineTo(cx + 10 * unit, cy + 8 * unit); ctx.stroke();
    ctx.restore();
  }
}

// ================================================================= photo card
function photoCard(ctx, L, tm, o) {
  if (L.geom?.type !== 'Point') return;
  const s = L.style, unit = o.unit;
  const P = o.proj(L.geom.coordinates);
  const u = prog(L, tm);
  const k = L.anim === 'pop' && !tm.edit ? backOut(u) : 1;
  if (k <= 0) return;
  const W = (+s.width || 260) * unit, H = W * 0.62;
  const x = P[0] + (+s.dx || -220) * unit - W / 2, y = P[1] + (+s.dy || 60) * unit;
  ctx.globalAlpha *= tm.alpha * clamp(u * 3, 0, 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2 * unit;
  ctx.beginPath(); ctx.moveTo(P[0], P[1]); ctx.lineTo(x + W / 2, y); ctx.stroke();
  ctx.translate(x + W / 2, y + H / 2); ctx.scale(k, k); ctx.translate(-(x + W / 2), -(y + H / 2));
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 22 * unit; ctx.shadowOffsetY = 8 * unit;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 3 * unit, y - 3 * unit, W + 6 * unit, H + 6 * unit);
  ctx.shadowColor = 'transparent';
  const im = s.media ? imageFor(s.media) : null;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, W, H); ctx.clip();
  if (im?.bmp) coverImage(ctx, im.bmp, { x, y, w: W, h: H });
  else {
    const g = ctx.createLinearGradient(0, y, 0, y + H);
    g.addColorStop(0, '#9cc7ea'); g.addColorStop(0.45, '#cfe4f2'); g.addColorStop(0.46, '#3f6b3a'); g.addColorStop(0.7, '#2b4a33'); g.addColorStop(0.71, '#2a4652'); g.addColorStop(1, '#1b2e38');
    ctx.fillStyle = g; ctx.fillRect(x, y, W, H);
    ctx.fillStyle = '#4c7a43'; ctx.beginPath(); ctx.moveTo(x, y + H * 0.5); ctx.quadraticCurveTo(x + W * 0.3, y + H * 0.2, x + W * 0.6, y + H * 0.42); ctx.quadraticCurveTo(x + W * 0.8, y + H * 0.3, x + W, y + H * 0.46); ctx.lineTo(x + W, y + H * 0.6); ctx.lineTo(x, y + H * 0.6); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = '#fff'; ctx.font = `500 ${18 * unit}px ${UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4 * unit;
  ctx.fillText(s.title || '', x + 8 * unit, y - 12 * unit);
  const tw = ctx.measureText(s.title || '').width;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6 * unit; ctx.beginPath(); ctx.moveTo(x, y - 30 * unit); ctx.lineTo(x, y - 6 * unit); ctx.lineTo(x + tw + 16 * unit, y - 6 * unit); ctx.stroke();
}

// ================================================================= AR floating panel
function arPanel(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, t = o.time || 0;
  if (!fr) return;
  const unit = o.unit * (+s.size || 1);
  const col = s.color || '#ffc46b';
  const u = prog(L, tm);
  const k = L.anim === 'unfold' && !tm.edit ? easeOut(u) : 1;
  const W = 300 * unit, H = 230 * unit;
  const pos = s.position || 'center';
  const m = 60 * o.unit;
  let cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2;
  if (pos.includes('left')) cx = fr.x + m + W / 2; if (pos.includes('right')) cx = fr.x + fr.w - m - W / 2 - 120 * unit;
  if (pos.includes('top')) cy = fr.y + m + H / 2; if (pos.includes('bottom')) cy = fr.y + fr.h - m - H / 2;
  placeAt(ctx, L, fr, cx - W / 2, cy - H / 2, W + 140 * unit, H);
  ctx.globalAlpha *= tm.alpha;
  const panel = (px, py, pw, ph, main) => {
    ctx.save();
    ctx.translate(px, py);
    ctx.transform(1, -0.2, 0.32, 1, 0, 0);
    ctx.scale(1, k);
    ctx.shadowColor = hexA(col, 0.8); ctx.shadowBlur = 18 * unit;
    const g = ctx.createLinearGradient(-pw / 2, -ph / 2, pw / 2, ph / 2);
    g.addColorStop(0, hexA(col, 0.08)); g.addColorStop(1, hexA(col, 0.32));
    ctx.fillStyle = g; ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
    ctx.strokeStyle = hexA(col, 0.95); ctx.lineWidth = 1.6 * unit; ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
    ctx.shadowBlur = 0;
    if (main) {
      // wireframe terrain
      const nx = 9, ny = 6, r = rng(hashStr(L.id));
      const hgt = Array.from({ length: (nx + 1) * (ny + 1) }, () => r());
      const pt = (i, j) => [-pw / 2 + (i / nx) * pw, ph * 0.05 + (j / ny) * ph * 0.42 - hgt[j * (nx + 1) + i] * 14 * unit * (1 + 0.15 * Math.sin(t + i))];
      ctx.strokeStyle = hexA(col, 0.55); ctx.lineWidth = 0.8 * unit;
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const a = pt(i, j);
        if (i < nx) { const b = pt(i + 1, j); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
        if (j < ny) { const b = pt(i, j + 1); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); if (i < nx && (i + j) % 2) { const d = pt(i + 1, j + 1); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(d[0], d[1]); ctx.stroke(); } }
        ctx.fillStyle = hexA(col, 0.9); ctx.fillRect(a[0] - 1.2 * unit, a[1] - 1.2 * unit, 2.4 * unit, 2.4 * unit);
      }
      ctx.fillStyle = '#fff4dc'; ctx.font = `300 ${15 * unit}px ${UI}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(s.title || '', pw / 2 - 10 * unit, -ph / 2 + 10 * unit);
      ctx.font = `400 ${6 * unit}px ${UI}`; ctx.fillStyle = hexA(col, 0.8); ctx.textAlign = 'left';
      for (let i = 0; i < 4; i++) ctx.fillText('— survey line · depth · offset —'.slice(0, 18 + i * 3), pw * 0.05, ph * 0.3 + i * 8 * unit);
    }
    ctx.restore();
  };
  panel(cx - W * 0.62, cy - H * 0.12, W * 0.32, H * 0.5, false);
  panel(cx, cy, W, H * 0.8, true);
  // floating numbers
  const nums = String(s.numbers || '').split('\n').filter(Boolean);
  ctx.fillStyle = '#fff1d6'; ctx.font = `300 ${19 * unit}px ${UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.shadowColor = hexA(col, 0.9); ctx.shadowBlur = 8 * unit;
  nums.forEach((n, i) => {
    const kk = tm.edit ? 1 : clamp(u * 2 - i * 0.2, 0, 1);
    const r2 = rng(hashStr(L.id) + i + Math.floor(t * 4));
    const txt = kk < 1 ? n.replace(/\d/g, () => String(Math.floor(r2() * 10))) : n;
    ctx.globalAlpha = tm.alpha * kk;
    ctx.fillText(txt, cx + W * 0.62 + i * 6 * unit, cy - H * 0.3 + i * 30 * unit);
  });
}

// ================================================================= line callouts
function lineCallout(ctx, L, tm, o) {
  if (L.geom?.type !== 'Point') return;
  const s = L.style, unit = o.unit * (+s.size || 1);
  const P = o.proj(L.geom.coordinates);
  const col = s.color || '#ffffff';
  const items = String(s.items || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 6);
  const u = prog(L, tm);
  const slots = [[-250, -150, 'L'], [110, -95, 'R'], [-260, 30, 'L'], [110, 50, 'R'], [-240, -260, 'L'], [110, -220, 'R']];
  ctx.globalAlpha *= tm.alpha;
  const cr = 24 * unit * (tm.edit ? 1 : easeOut(u * 3));
  ctx.strokeStyle = col; ctx.lineWidth = 2 * unit;
  ctx.beginPath(); ctx.arc(P[0], P[1], cr, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(P[0], P[1], 4 * unit, 0, Math.PI * 2); ctx.fill();
  items.forEach((it, i) => {
    const [dx, dy, side] = slots[i];
    const k = tm.edit || L.anim === 'none' ? 1 : clamp((u - 0.15 - i * 0.15) / 0.35, 0, 1);
    if (k <= 0) return;
    const lines = it.split(' / ');
    const big = lines.length === 1 && /^[^\w]?[\d,.]+$/.test(it.replace(/[$€£\s]/g, '')) ;
    const fs = (big ? 30 : 14) * unit;
    ctx.font = `${big ? 300 : 500} ${fs}px ${UI}`;
    const shown = lines.map((l) => (big ? countUpTxt(l, k) : l));
    const bw = Math.max(...shown.map((l) => ctx.measureText(l).width)) + 30 * unit, bh = lines.length * fs * 1.45 + 16 * unit;
    const bx = side === 'L' ? P[0] + dx * unit - bw + 140 * unit : P[0] + dx * unit, by = P[1] + dy * unit;
    // elbow line: from the circle edge, vertical, then horizontal into the box
    const ex = side === 'L' ? bx + bw : bx, ey = by + bh / 2;
    const sx = P[0], sy = P[1] + (ey < P[1] ? -cr : cr);
    const len1 = Math.abs(ey - sy), len2 = Math.abs(ex - sx);
    const d = (len1 + len2) * clamp(k * 1.6, 0, 1);
    ctx.strokeStyle = col; ctx.lineWidth = 1.5 * unit;
    ctx.beginPath(); ctx.moveTo(sx, sy);
    if (d <= len1) ctx.lineTo(sx, sy + Math.sign(ey - sy) * d);
    else { ctx.lineTo(sx, ey); ctx.lineTo(sx + Math.sign(ex - sx) * (d - len1), ey); }
    ctx.stroke();
    const kb = clamp(k * 1.6 - 0.6, 0, 1);
    if (kb <= 0) return;
    ctx.save(); ctx.globalAlpha *= kb;
    ctx.fillStyle = 'rgba(20,24,28,0.55)'; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    shown.forEach((l, j) => ctx.fillText(l, bx + 15 * unit, by + 8 * unit + fs * 1.45 * (j + 0.5)));
    ctx.restore();
  });
}
function countUpTxt(raw, k) {
  const m = String(raw).match(/^([^\d]*)([\d,]*\.?\d+)(.*)$/);
  if (!m || k >= 1) return raw;
  const v = parseFloat(m[2].replace(/,/g, '')), dp = (m[2].split('.')[1] || '').length;
  return `${m[1]}${(v * easeOut(k)).toLocaleString('en', { minimumFractionDigits: dp, maximumFractionDigits: dp })}${m[3]}`;
}

// ================================================================= object detection
function detect(ctx, L, tm, o) {
  const c = L.geom?.coordinates;
  if (L.geom?.type !== 'LineString' || c.length < 2) return;
  const s = L.style, unit = o.unit * (+s.size || 1), t = o.time || 0;
  const P = resample(c.map((p) => o.proj(p)), 4 * o.unit);
  const n = clamp(Math.round(+s.count || 10), 1, 80), lanes = clamp(Math.round(+s.lanes || 2), 1, 6);
  const r = rng(hashStr(L.id));
  const u = prog(L, tm);
  ctx.globalAlpha *= tm.alpha;
  const lw = 14 * unit;
  const CAR = ['#d8dde3', '#2b2f36', '#8c939c', '#b3282d', '#2f5fa8', '#f2f2f2'];
  for (let i = 0; i < n; i++) {
    const dir = r() < 0.5 ? 1 : -1;
    const lane = (1 + Math.floor(r() * lanes)) * dir;
    const v = (0.03 + r() * 0.04) * (+s.speed ?? 1);
    let f = (r() + t * v * dir) % 1; if (f < 0) f += 1;
    const idx = Math.min(P.length - 2, Math.floor(f * (P.length - 1)));
    const a = P[idx], b = P[idx + 1];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const x = a[0] + nx * (lane - Math.sign(lane) * 0.5) * lw, y = a[1] + ny * (lane - Math.sign(lane) * 0.5) * lw;
    const carCol = CAR[Math.floor(r() * CAR.length)];
    const conf = (0.82 + r() * 0.17).toFixed(2);
    const k = tm.edit ? 1 : clamp(u * 2 - i / n, 0, 1);
    if (s.cars !== false) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang + (dir < 0 ? Math.PI : 0));
      ctx.fillStyle = carCol; rr(ctx, -9 * unit, -4.5 * unit, 18 * unit, 9 * unit, 2.5 * unit); ctx.fill();
      ctx.fillStyle = 'rgba(20,30,40,0.7)'; ctx.fillRect(2 * unit, -3.5 * unit, 3.5 * unit, 7 * unit); ctx.fillRect(-6 * unit, -3.5 * unit, 2.5 * unit, 7 * unit);
      ctx.restore();
    }
    if (k <= 0) continue;
    ctx.save(); ctx.globalAlpha *= k;
    if (s.look === 'rings') {
      const R = 16 * unit;
      ctx.strokeStyle = '#3fe0d0'; ctx.shadowColor = '#3fe0d0'; ctx.shadowBlur = 6 * unit;
      ctx.lineWidth = 2.5 * unit; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1.2 * unit;
      for (let q = 0; q < 4; q++) { const a0 = q * Math.PI / 2 + t * 1.5; ctx.beginPath(); ctx.arc(x, y, R * 1.35, a0, a0 + 1.1); ctx.stroke(); }
      for (let q = 0; q < 12; q++) { const a0 = q * Math.PI / 6; ctx.beginPath(); ctx.moveTo(x + Math.cos(a0) * R * 1.05, y + Math.sin(a0) * R * 1.05); ctx.lineTo(x + Math.cos(a0) * R * 1.18, y + Math.sin(a0) * R * 1.18); ctx.stroke(); }
    } else {
      const w = 26 * unit, h = 20 * unit;
      ctx.strokeStyle = 'rgba(80,255,150,0.55)'; ctx.lineWidth = 1 * unit; ctx.strokeRect(x - w / 2, y - h / 2, w, h);
      ctx.strokeStyle = '#4dff8a'; ctx.lineWidth = 2 * unit;
      const bb = 6 * unit;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const px = x + sx * w / 2, py = y + sy * h / 2; ctx.beginPath(); ctx.moveTo(px, py - sy * bb); ctx.lineTo(px, py); ctx.lineTo(px - sx * bb, py); ctx.stroke(); }
      if (i % 3 === 0) { ctx.strokeStyle = 'rgba(255,60,80,0.8)'; ctx.lineWidth = 1 * unit; ctx.strokeRect(x - w * 0.32, y - h * 0.32, w * 0.64, h * 0.64); }
    }
    if (s.labels !== false) {
      ctx.fillStyle = s.look === 'rings' ? '#3fe0d0' : '#4dff8a'; ctx.font = `700 ${8 * unit}px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.shadowBlur = 0;
      ctx.fillText(`CAR ${conf}`, x - 13 * unit, y - (s.look === 'rings' ? 24 : 12) * unit);
    }
    ctx.restore();
  }
}

// ================================================================= tag title (pink label boxes)
export const TAG_STYLES = { spaced: 'Letter-spaced in a box', bold: 'Bold capitals in boxes' };
export function drawTagTitle(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, t = o.time || 0;
  const unit = o.unit * (+s.size || 1);
  const D = Math.max(0.2, +L.duration || 1);
  const u = tm.edit ? 1 : clamp(tm.tau / D, 0, 1);
  const box = s.accent && s.accent !== '#e8c27a' ? s.accent : '#ff2d55';
  const main = String(s.text || '').split('|').map((x) => x.trim()).filter(Boolean);
  const sub = String(s.sub || '').split('|').map((x) => x.trim()).filter(Boolean);
  const spacedLook = (s.tagStyle || (main.length === 1 && !sub.length ? 'spaced' : 'bold')) === 'spaced';
  const rows = [
    ...main.map((txt) => ({ txt: txt.toUpperCase(), bg: box, fg: spacedLook ? (s.color && s.color !== '#ffffff' ? s.color : '#ffffff') : '#14122a', fs: (spacedLook ? 22 : 38) * unit, sp: spacedLook ? 9 * unit : 1 * unit, w: spacedLook ? 400 : 800 })),
    ...sub.map((txt) => ({ txt: txt.toUpperCase(), bg: '#ffffff', fg: '#14122a', fs: 17 * unit, sp: 7 * unit, w: 700 })),
  ];
  if (!rows.length) return;
  const meas = (r) => { ctx.font = `${r.w} ${r.fs}px ${fam2(s.font)}`; const ws = [...r.txt].map((c) => ctx.measureText(c).width); return ws.reduce((a, b) => a + b, 0) + r.sp * (r.txt.length - 1); };
  rows.forEach((r) => { r.tw = meas(r); r.bw = r.tw + r.fs * 0.9; r.bh = r.fs * 1.5; });
  const gap = 8 * unit;
  const totalH = rows.reduce((a, r) => a + r.bh + gap, -gap);
  const maxW = Math.max(...rows.map((r) => r.bw));
  const al = s.tagAlign || 'left';
  const ax = fr.x + fr.w * (al === 'right' ? 0.94 : al === 'center' ? 0.5 : 0.15), ay = fr.y + fr.h * (+s.tagY || 0.5) - totalH / 2;
  const right = al === 'right';
  placeAt(ctx, L, fr, right ? ax - maxW : ax, ay, maxW, totalH);
  ctx.globalAlpha *= tm.alpha;
  let y = ay;
  rows.forEach((r, i) => {
    const k = clamp((u - i * 0.12) / 0.45, 0, 1);
    const kw = easeOut(k);
    const x0 = right ? ax - r.bw : (al === 'center' ? ax - r.bw / 2 : ax);
    if (kw > 0) {
      const bwNow = r.bw * kw;
      const bx = right ? x0 + r.bw - bwNow : x0;
      ctx.fillStyle = r.bg; ctx.fillRect(bx, y, bwNow, r.bh);
      ctx.save(); ctx.beginPath(); ctx.rect(bx, y, bwNow, r.bh); ctx.clip();
      ctx.fillStyle = r.fg; ctx.font = `${r.w} ${r.fs}px ${fam2(s.font)}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const ta = clamp((k - 0.4) / 0.6, 0, 1);
      ctx.globalAlpha *= ta;
      let cx = x0 + r.fs * 0.45 + (1 - ta) * 14 * unit;
      for (const ch of r.txt) { ctx.fillText(ch, cx, y + r.bh / 2 + r.fs * 0.04); cx += ctx.measureText(ch).width + r.sp; }
      ctx.restore();
    }
    y += r.bh + gap;
  });
}
const fam2 = (f) => (f ? `"${f}", "Montserrat", ${UI}` : `"Montserrat","Gotham",${UI}`);

// ================================================================= plus-mark grid & lens flare (screen effects)
export function drawCrosses(ctx, fr, unit, t, k, col) {
  ctx.save();
  ctx.strokeStyle = hexA(col || '#ffffff', 0.85 * k); ctx.lineWidth = 1.2 * unit;
  const nx = 9, ny = 5;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const r = rng(i * 131 + j * 7 + 3);
    if (r() < 0.25) continue;
    const blink = 0.5 + 0.5 * Math.sin(t * (0.8 + r() * 2) + r() * 6);
    ctx.globalAlpha = 0.4 + 0.6 * blink;
    const x = fr.x + ((i + 0.5) / nx) * fr.w, y = fr.y + ((j + 0.5) / ny) * fr.h, d = 4 * unit;
    ctx.beginPath(); ctx.moveTo(x - d, y); ctx.lineTo(x + d, y); ctx.moveTo(x, y - d); ctx.lineTo(x, y + d); ctx.stroke();
  }
  ctx.restore();
}
export function drawLensFlare(ctx, fr, unit, t, k, s) {
  const x = fr.x + fr.w * (s.sunX ?? 0.5), y = fr.y + fr.h * (s.sunY ?? 0.32);
  const R = Math.min(fr.w, fr.h) * 0.55;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  let g = ctx.createRadialGradient(x, y, 0, x, y, R);
  g.addColorStop(0, `rgba(255,255,240,${k})`); g.addColorStop(0.06, `rgba(255,236,190,${0.95 * k})`); g.addColorStop(0.2, `rgba(255,170,80,${0.45 * k})`); g.addColorStop(0.55, `rgba(255,120,40,${0.12 * k})`); g.addColorStop(1, 'rgba(255,100,30,0)');
  ctx.fillStyle = g; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
  // horizontal streak
  g = ctx.createLinearGradient(fr.x, 0, fr.x + fr.w, 0);
  g.addColorStop(0, 'rgba(255,200,140,0)'); g.addColorStop((x - fr.x) / fr.w, `rgba(255,230,190,${0.35 * k})`); g.addColorStop(1, 'rgba(255,200,140,0)');
  ctx.fillStyle = g; ctx.fillRect(fr.x, y - 2 * unit, fr.w, 4 * unit);
  // ghosts along the line through the centre
  const cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2;
  [[0.5, 22, '255,180,90'], [1.3, 40, '120,200,255'], [1.7, 14, '255,140,200'], [2.2, 60, '180,255,200']].forEach(([f, r, c]) => {
    const gx = x + (cx - x) * f, gy = y + (cy - y) * f;
    const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * unit);
    gg.addColorStop(0, `rgba(${c},${0.18 * k})`); gg.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(gx, gy, r * unit, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}
