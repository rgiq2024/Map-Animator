// Model builder: a GIS workflow diagram (inputs → tools → outputs) like ArcGIS ModelBuilder / Velocity — white
// node cards with icons, ports and animated dashed connectors, live event rates — that builds up, runs step by
// step or just flows on the video. Edited in a full-screen drag-and-drop editor (palette, drag, connect ports).
import { placeAt, CUSTOM_POS } from './place.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const UI = '"Avenir Next","Inter","Segoe UI",system-ui,sans-serif';
function hexA(hex, a) {
  const h = String(hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- node types
// role: in (source, no inputs) · tool · out (sink). ins = number of input ports.
export const NODE_TYPES = {
  // inputs
  feed: { role: 'in', name: 'Stream feed', icon: 'feed', group: 'Inputs', rate: '29.8 e/s' },
  layer: { role: 'in', name: 'Feature layer', icon: 'layer', group: 'Inputs' },
  table: { role: 'in', name: 'Table', icon: 'table', group: 'Inputs' },
  raster: { role: 'in', name: 'Raster / imagery', icon: 'raster', group: 'Inputs' },
  sensor: { role: 'in', name: 'IoT sensor', icon: 'sensor', group: 'Inputs', rate: '2.33 e/s' },
  satellite: { role: 'in', name: 'Satellite scene', icon: 'satellite', group: 'Inputs' },
  // tools — analysis
  join: { role: 'tool', ins: 2, name: 'Join Features', icon: 'join', group: 'Analysis' },
  mapfields: { role: 'tool', ins: 1, name: 'Map Fields', icon: 'mapfields', group: 'Analysis' },
  calc: { role: 'tool', ins: 1, name: 'Calculate Field', icon: 'calc', group: 'Analysis' },
  filter: { role: 'tool', ins: 1, name: 'Filter by Expression', icon: 'filter', group: 'Analysis' },
  buffer: { role: 'tool', ins: 1, name: 'Buffer', icon: 'buffer', group: 'Analysis' },
  clip: { role: 'tool', ins: 2, name: 'Clip', icon: 'clip', group: 'Analysis' },
  intersect: { role: 'tool', ins: 2, name: 'Intersect', icon: 'intersect', group: 'Analysis' },
  dissolve: { role: 'tool', ins: 1, name: 'Dissolve', icon: 'dissolve', group: 'Analysis' },
  merge: { role: 'tool', ins: 2, name: 'Merge', icon: 'merge', group: 'Analysis' },
  selectloc: { role: 'tool', ins: 2, name: 'Select by Location', icon: 'select', group: 'Analysis' },
  aggregate: { role: 'tool', ins: 1, name: 'Aggregate Points', icon: 'aggregate', group: 'Analysis' },
  hotspot: { role: 'tool', ins: 1, name: 'Hot Spot Analysis', icon: 'hotspot', group: 'Analysis' },
  density: { role: 'tool', ins: 1, name: 'Kernel Density', icon: 'density', group: 'Analysis' },
  summarize: { role: 'tool', ins: 2, name: 'Summarize Within', icon: 'stats', group: 'Analysis' },
  geocode: { role: 'tool', ins: 1, name: 'Geocode Addresses', icon: 'geocode', group: 'Analysis' },
  project: { role: 'tool', ins: 1, name: 'Project', icon: 'project', group: 'Analysis' },
  // raster
  slope: { role: 'tool', ins: 1, name: 'Slope', icon: 'slope', group: 'Raster' },
  reclass: { role: 'tool', ins: 1, name: 'Reclassify', icon: 'reclass', group: 'Raster' },
  rastercalc: { role: 'tool', ins: 2, name: 'Raster Calculator', icon: 'rastercalc', group: 'Raster' },
  weighted: { role: 'tool', ins: 3, name: 'Weighted Overlay', icon: 'weighted', group: 'Raster' },
  zonal: { role: 'tool', ins: 2, name: 'Zonal Statistics', icon: 'stats', group: 'Raster' },
  ndvi: { role: 'tool', ins: 1, name: 'NDVI', icon: 'ndvi', group: 'Raster' },
  // real-time / AI
  incidents: { role: 'tool', ins: 1, name: 'Detect Incidents', icon: 'incident', group: 'Real-time & AI' },
  proximity: { role: 'tool', ins: 2, name: 'Track Proximity', icon: 'proximity', group: 'Real-time & AI' },
  geofence: { role: 'tool', ins: 2, name: 'Geofence', icon: 'geofence', group: 'Real-time & AI' },
  detect: { role: 'tool', ins: 1, name: 'Detect Objects (AI)', icon: 'ai', group: 'Real-time & AI' },
  classify: { role: 'tool', ins: 1, name: 'Classify Pixels (AI)', icon: 'ai', group: 'Real-time & AI' },
  // outputs
  outlayer: { role: 'out', name: 'Output feature layer', icon: 'outlayer', group: 'Outputs' },
  stream: { role: 'out', name: 'Stream layer', icon: 'feed', group: 'Outputs' },
  alert: { role: 'out', name: 'Alert / notification', icon: 'alert', group: 'Outputs' },
  email: { role: 'out', name: 'Send email', icon: 'email', group: 'Outputs' },
  dashboard: { role: 'out', name: 'Dashboard', icon: 'dashboard', group: 'Outputs' },
  webmap: { role: 'out', name: 'Web map', icon: 'webmap', group: 'Outputs' },
  outraster: { role: 'out', name: 'Output raster', icon: 'raster', group: 'Outputs' },
};
const insOf = (t) => (NODE_TYPES[t]?.role === 'in' ? 0 : NODE_TYPES[t]?.role === 'out' ? 1 : NODE_TYPES[t]?.ins || 1);
const hasOut = (t) => NODE_TYPES[t]?.role !== 'out';
export const NW = 270, NH = 78; // node size in diagram units

// ---------------------------------------------------------------- presets
const N = (id, t, label, x, y, extra = {}) => ({ id, t, label, x, y, ...extra });
const E = (a, b, p = 0) => ({ a, b, p });
export const MF_PRESETS = {
  nycbus: { name: 'NYC bus alerts (real-time)', graph: {
    nodes: [
      N('n1', 'feed', 'NYC Buses', 0, 110, { rate: '29.8 e/s', status: true }), N('n2', 'layer', 'Manhattan_Bus_Pts', 0, 248),
      N('n3', 'layer', 'Manhattan Bus Pts', 0, 386, { rate: '2.33K e/s', status: true }), N('n4', 'feed', 'NYC Traffic', 0, 524, { rate: '2.33 e/s', status: true }),
      N('n5', 'join', 'Join Features', 330, 164), N('n6', 'mapfields', 'Map Fields', 660, 164),
      N('n7', 'join', 'Join Features-1', 330, 442), N('n8', 'mapfields', 'Map Fields-1', 660, 442),
      N('n9', 'join', 'Join Features-2', 990, 358), N('n10', 'calc', 'Calculate Field', 1320, 358), N('n11', 'outlayer', 'Manhattan Bus Alerts', 1650, 358),
    ],
    edges: [E('n1', 'n5', 0), E('n2', 'n5', 1), E('n5', 'n6'), E('n3', 'n7', 0), E('n4', 'n7', 1), E('n7', 'n8'), E('n6', 'n9', 0), E('n8', 'n9', 1), E('n9', 'n10'), E('n10', 'n11')],
  } },
  flood: { name: 'Flood risk model', graph: {
    nodes: [
      N('a', 'raster', 'Elevation (DEM)', 0, 0), N('b', 'raster', 'Rainfall 24 h', 0, 160), N('c', 'layer', 'Land use', 0, 320), N('d', 'layer', 'Rivers', 0, 480),
      N('e', 'slope', 'Slope', 330, 0), N('f', 'reclass', 'Reclassify land use', 330, 320), N('g', 'buffer', 'Buffer 500 m', 330, 480),
      N('h', 'weighted', 'Weighted Overlay', 700, 160), N('i', 'clip', 'Clip to districts', 1030, 240), N('j', 'outraster', 'Flood risk map', 1360, 160), N('k', 'dashboard', 'Risk dashboard', 1360, 320),
    ],
    edges: [E('a', 'e'), E('e', 'h', 0), E('b', 'h', 1), E('c', 'f'), E('f', 'h', 2), E('d', 'g'), E('h', 'i', 0), E('g', 'i', 1), E('i', 'j'), E('i', 'k')],
  } },
  wildfire: { name: 'Wildfire hotspot alerts', graph: {
    nodes: [
      N('a', 'satellite', 'VIIRS / MODIS hotspots', 0, 60, { rate: '412 e/s', status: true }), N('b', 'layer', 'Towns & villages', 0, 260),
      N('c', 'filter', 'Confidence ≥ 80 %', 330, 60), N('d', 'buffer', 'Buffer 5 km', 660, 60), N('e', 'proximity', 'Track Proximity', 990, 160),
      N('f', 'incidents', 'Detect Incidents', 1320, 160), N('g', 'alert', 'Alert fire service', 1650, 60), N('h', 'dashboard', 'Fire dashboard', 1650, 260),
    ],
    edges: [E('a', 'c'), E('c', 'd'), E('d', 'e', 0), E('b', 'e', 1), E('e', 'f'), E('f', 'g'), E('f', 'h')],
  } },
  ships: { name: 'Ship detection from imagery (AI)', graph: {
    nodes: [
      N('a', 'satellite', 'Sentinel-2 scene', 0, 60), N('b', 'layer', 'Port areas', 0, 240),
      N('c', 'detect', 'Detect Objects (AI)', 330, 60), N('d', 'calc', 'Length × width (m)', 660, 60), N('e', 'selectloc', 'Select by Location', 990, 150),
      N('f', 'aggregate', 'Count per port', 1320, 150), N('g', 'webmap', 'Vessel map', 1650, 60), N('h', 'email', 'Daily report', 1650, 240),
    ],
    edges: [E('a', 'c'), E('c', 'd'), E('d', 'e', 0), E('b', 'e', 1), E('e', 'f'), E('f', 'g'), E('f', 'h')],
  } },
  suitability: { name: 'Site suitability', graph: {
    nodes: [
      N('a', 'layer', 'Roads', 0, 0), N('b', 'layer', 'Parcels', 0, 170), N('c', 'raster', 'Elevation', 0, 340), N('d', 'table', 'Zoning table', 0, 510),
      N('e', 'buffer', 'Buffer roads 1 km', 330, 0), N('f', 'slope', 'Slope', 330, 340), N('g', 'reclass', 'Slope < 8°', 660, 340), N('h', 'join', 'Join zoning', 330, 510),
      N('i', 'selectloc', 'Near roads', 660, 85), N('j', 'intersect', 'Intersect', 990, 250), N('k', 'outlayer', 'Suitable sites', 1320, 250),
    ],
    edges: [E('a', 'e'), E('e', 'i', 1), E('b', 'i', 0), E('c', 'f'), E('f', 'g'), E('i', 'j', 0), E('g', 'j', 1), E('d', 'h', 1), E('b', 'h', 0), E('j', 'k')],
  } },
};
export const clone = (g) => JSON.parse(JSON.stringify(g));

// ---------------------------------------------------------------- registry
const POS = { center: 'Centre', top: 'Top', bottom: 'Bottom', ...CUSTOM_POS };
export const MF_KINDS = { modelflow: { name: 'Model builder diagram', icon: '⧉', geom: null, desc: 'A GIS workflow (inputs → tools → outputs) with animated connectors — build it by drag & drop' } };
export const MF_ANIMS = { modelflow: { build: 'Builds up step by step, then flows', run: 'Runs tool by tool (highlight + ✓)', flow: 'All shown, data flowing', none: 'Still' } };
export const MF_DEFAULTS = {
  modelflow: { anim: 'build', duration: 8, hold: 4, style: {
    graph: clone(MF_PRESETS.nycbus.graph), theme: 'velocity', bg: 'dots', bgOpacity: 0.92, size: 1, position: 'center',
    link: '#22d3d6', rates: true, flowSpeed: 1, title: '', shadow: true,
  } },
};
export const MF_FORMS = {
  modelflow: [
    ['style.title', 'Title above the diagram (optional)', 'text'],
    ['style.theme', 'Look', 'select', { velocity: 'Light cards (like ArcGIS Velocity)', dark: 'Dark cards', classic: 'Classic ModelBuilder (ovals & boxes)', holo: 'Holographic (glowing outlines)' }],
    ['style.bg', 'Background', 'select', { dots: 'Dotted canvas', grid: 'Grid canvas', panel: 'Plain panel', none: 'None — straight over the map / video' }],
    ['style.bgOpacity', 'Background opacity', 'range', [0, 1, 0.02], (L) => L.style.bg !== 'none'],
    ['style.link', 'Connector colour', 'color'],
    ['style.flowSpeed', 'Flow speed', 'range', [0, 4, 0.05]],
    ['style.rates', 'Live event rates under the feeds', 'switch'],
    ['style.size', 'Size', 'range', [0.3, 2, 0.02]],
    ['style.position', 'Position', 'select', POS],
  ],
};
export const MF_SET = new Set(Object.keys(MF_KINDS));
export const mfPhases = () => ['captions'];

// ---------------------------------------------------------------- geometry
function bounds(G) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of G.nodes || []) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + NW); y1 = Math.max(y1, n.y + NH + (n.rate ? 20 : 0)); }
  if (!isFinite(x0)) return [0, 0, NW, NH];
  return [x0, y0, x1, y1];
}
export function inPort(n, p) { const k = insOf(n.t); return [n.x, n.y + (NH * (p + 1)) / (k + 1)]; }
export function outPort(n) { return [n.x + NW, n.y + NH / 2]; }
/** Orthogonal route between an output port and an input port. */
export function route(a, b) {
  const [x1, y1] = a, [x2, y2] = b;
  if (x2 - x1 >= 40) {
    const mx = x1 + Math.max(20, Math.min(36, (x2 - x1) / 2));
    return Math.abs(y2 - y1) < 1 ? [a, b] : [a, [mx, y1], [mx, y2], b];
  }
  const my = (y1 + y2) / 2 + (Math.abs(y2 - y1) < NH ? NH : 0);
  return [a, [x1 + 24, y1], [x1 + 24, my], [x2 - 24, my], [x2 - 24, y2], b];
}
const polyLen = (P) => { let s = 0; for (let i = 1; i < P.length; i++) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return s; };
function along(P, d) {
  for (let i = 1; i < P.length; i++) { const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (d <= l) { const u = l ? d / l : 0; return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * u, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * u]; } d -= l; }
  return P.at(-1);
}
function partial(P, d) {
  const out = [P[0]];
  for (let i = 1; i < P.length; i++) { const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (d >= l) { out.push(P[i]); d -= l; } else { const u = l ? d / l : 0; out.push([P[i - 1][0] + (P[i][0] - P[i - 1][0]) * u, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * u]); break; } }
  return out;
}
/** Depth of every node from the sources (for the build-up order). */
export function depths(G) {
  const d = new Map((G.nodes || []).map((n) => [n.id, 0]));
  for (let k = 0; k < (G.nodes || []).length; k++) for (const e of G.edges || []) if (d.has(e.a) && d.has(e.b)) d.set(e.b, Math.max(d.get(e.b), d.get(e.a) + 1));
  return d;
}

// ---------------------------------------------------------------- icons (drawn in a 40 × 40 box)
function icon(g, kind, x, y, s, theme) {
  g.save(); g.translate(x, y); g.scale(s / 40, s / 40);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const blue = '#2c86d1', lblue = '#9fd0f5', yel = '#f2c230', red = '#e8453c', teal = '#17a2b8', gray = '#5f6b78', grn = '#36a852';
  const dark = theme === 'dark' || theme === 'holo';
  const ink = dark ? '#cfe3f3' : gray;
  const tbl = (tx, ty, w, h, c = blue) => { g.fillStyle = '#fff'; g.fillRect(tx, ty, w, h); g.strokeStyle = c; g.lineWidth = 1.6; g.strokeRect(tx, ty, w, h); g.fillStyle = hexA(c, 0.85); g.fillRect(tx, ty, w, h * 0.22); g.lineWidth = 1; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(tx, ty + (h * i) / 4); g.lineTo(tx + w, ty + (h * i) / 4); g.stroke(); } g.beginPath(); g.moveTo(tx + w / 2, ty); g.lineTo(tx + w / 2, ty + h); g.stroke(); };
  const mapSheet = (mx, my, w, h) => { g.fillStyle = '#cfe9d9'; g.strokeStyle = teal; g.lineWidth = 1.4; g.beginPath(); g.moveTo(mx, my + 3); g.lineTo(mx + w / 3, my); g.lineTo(mx + (2 * w) / 3, my + 3); g.lineTo(mx + w, my); g.lineTo(mx + w, my + h - 3); g.lineTo(mx + (2 * w) / 3, my + h); g.lineTo(mx + w / 3, my + h - 3); g.lineTo(mx, my + h); g.closePath(); g.fill(); g.stroke(); };
  const pin = (px, py, k = 1, c = red) => { g.fillStyle = c; g.beginPath(); g.arc(px, py, 6 * k, Math.PI, 0); g.lineTo(px, py + 10 * k); g.closePath(); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(px, py, 2.4 * k, 0, 7); g.fill(); };
  switch (NODE_TYPES[kind]?.icon || kind) {
    case 'feed': g.fillStyle = lblue; g.fillRect(4, 6, 32, 26); g.strokeStyle = blue; g.lineWidth = 2; g.strokeRect(4, 6, 32, 26); g.fillStyle = blue; g.fillRect(4, 6, 32, 6); g.strokeStyle = '#1b6fb3'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(17, 18); g.lineTo(31, 32); g.moveTo(31, 24); g.lineTo(31, 32); g.lineTo(23, 32); g.stroke(); break;
    case 'layer': g.fillStyle = yel; g.beginPath(); g.moveTo(4, 30); g.lineTo(14, 20); g.lineTo(26, 24); g.lineTo(36, 18); g.lineTo(36, 34); g.lineTo(26, 38); g.lineTo(14, 34); g.lineTo(4, 38); g.closePath(); g.fill(); pin(20, 12, 1.5); break;
    case 'outlayer': g.fillStyle = yel; g.beginPath(); g.moveTo(4, 30); g.lineTo(14, 20); g.lineTo(26, 24); g.lineTo(36, 18); g.lineTo(36, 34); g.lineTo(26, 38); g.lineTo(14, 34); g.lineTo(4, 38); g.closePath(); g.fill(); pin(18, 12, 1.4); g.strokeStyle = blue; g.lineWidth = 2.2; g.beginPath(); g.moveTo(10, 36); g.lineTo(34, 36); g.moveTo(29, 31); g.lineTo(34, 36); g.lineTo(29, 41); g.stroke(); break;
    case 'table': tbl(6, 8, 28, 24); break;
    case 'raster': for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = ['#2e7d32', '#7cb342', '#c0ca33', '#8d6e63', '#4fc3f7'][(i * 3 + j * 2) % 5]; g.fillRect(6 + i * 7, 6 + j * 7, 7, 7); } g.strokeStyle = ink; g.lineWidth = 1.2; g.strokeRect(6, 6, 28, 28); break;
    case 'sensor': g.strokeStyle = teal; g.lineWidth = 2.2; [6, 11, 16].forEach((r) => { g.beginPath(); g.arc(20, 22, r, -2.4, -0.74); g.stroke(); }); g.fillStyle = teal; g.beginPath(); g.arc(20, 22, 3, 0, 7); g.fill(); g.fillRect(19, 22, 2, 14); break;
    case 'satellite': g.fillStyle = blue; g.fillRect(4, 16, 11, 8); g.fillRect(25, 16, 11, 8); g.fillStyle = ink; g.fillRect(16, 14, 8, 12); g.strokeStyle = yel; g.lineWidth = 1.8; g.beginPath(); g.moveTo(20, 26); g.lineTo(14, 36); g.moveTo(20, 26); g.lineTo(26, 36); g.stroke(); break;
    case 'join': mapSheet(4, 4, 24, 18); tbl(14, 18, 22, 18); g.strokeStyle = blue; g.lineWidth = 1.4; g.setLineDash([2, 2]); g.strokeRect(2, 2, 36, 36); g.setLineDash([]); break;
    case 'mapfields': tbl(4, 4, 20, 16); tbl(16, 20, 20, 16); g.strokeStyle = blue; g.lineWidth = 1.8; g.beginPath(); g.moveTo(8, 24); g.lineTo(8, 32); g.lineTo(14, 32); g.moveTo(11, 29); g.lineTo(14, 32); g.lineTo(11, 35); g.stroke(); break;
    case 'calc': tbl(4, 8, 24, 24); g.fillStyle = blue; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) g.fillRect(26 + i * 4, 4 + j * 4, 3, 3); break;
    case 'filter': g.fillStyle = blue; g.beginPath(); g.moveTo(5, 6); g.lineTo(35, 6); g.lineTo(23, 20); g.lineTo(23, 34); g.lineTo(17, 30); g.lineTo(17, 20); g.closePath(); g.fill(); break;
    case 'buffer': [15, 10, 5].forEach((r, i) => { g.fillStyle = hexA(blue, 0.2 + i * 0.25); g.beginPath(); g.arc(20, 20, r, 0, 7); g.fill(); }); g.strokeStyle = blue; g.lineWidth = 1.4; g.beginPath(); g.arc(20, 20, 15, 0, 7); g.stroke(); break;
    case 'clip': g.fillStyle = hexA(blue, 0.25); g.fillRect(4, 4, 24, 24); g.strokeStyle = blue; g.lineWidth = 1.6; g.strokeRect(4, 4, 24, 24); g.fillStyle = hexA(yel, 0.85); g.fillRect(14, 14, 22, 22); g.strokeStyle = gray; g.strokeRect(14, 14, 22, 22); g.fillStyle = blue; g.fillRect(14, 14, 14, 14); break;
    case 'intersect': g.fillStyle = hexA(blue, 0.35); g.beginPath(); g.arc(15, 20, 11, 0, 7); g.fill(); g.fillStyle = hexA(yel, 0.6); g.beginPath(); g.arc(25, 20, 11, 0, 7); g.fill(); g.strokeStyle = blue; g.lineWidth = 1.4; g.beginPath(); g.arc(15, 20, 11, 0, 7); g.stroke(); g.beginPath(); g.arc(25, 20, 11, 0, 7); g.stroke(); break;
    case 'dissolve': g.fillStyle = hexA(grn, 0.6); g.beginPath(); g.moveTo(4, 10); g.lineTo(20, 4); g.lineTo(36, 12); g.lineTo(32, 34); g.lineTo(8, 34); g.closePath(); g.fill(); g.strokeStyle = '#fff'; g.setLineDash([2, 3]); g.lineWidth = 1.4; g.beginPath(); g.moveTo(20, 4); g.lineTo(18, 34); g.stroke(); g.setLineDash([]); break;
    case 'merge': g.strokeStyle = blue; g.lineWidth = 2.6; g.beginPath(); g.moveTo(6, 8); g.quadraticCurveTo(20, 8, 22, 20); g.moveTo(6, 32); g.quadraticCurveTo(20, 32, 22, 20); g.lineTo(36, 20); g.stroke(); break;
    case 'select': mapSheet(4, 6, 32, 26); g.strokeStyle = red; g.lineWidth = 2; g.setLineDash([3, 2]); g.strokeRect(12, 12, 16, 14); g.setLineDash([]); break;
    case 'aggregate': [[10, 12], [16, 8], [12, 18], [28, 26], [30, 20], [24, 30]].forEach(([px, py]) => { g.fillStyle = blue; g.beginPath(); g.arc(px, py, 2.4, 0, 7); g.fill(); }); g.strokeStyle = gray; g.lineWidth = 1.2; g.strokeRect(4, 4, 16, 18); g.strokeRect(20, 18, 16, 18); break;
    case 'hotspot': [16, 11, 6].forEach((r, i) => { g.fillStyle = ['#fdd835', '#fb8c00', '#e53935'][i]; g.beginPath(); g.arc(20, 20, r, 0, 7); g.fill(); }); break;
    case 'density': { const gr = g.createRadialGradient(20, 20, 2, 20, 20, 17); gr.addColorStop(0, '#e53935'); gr.addColorStop(0.5, '#fdd835'); gr.addColorStop(1, 'rgba(76,175,80,0.2)'); g.fillStyle = gr; g.fillRect(3, 3, 34, 34); break; }
    case 'stats': g.fillStyle = blue; [[6, 22, 6, 14], [15, 12, 6, 24], [24, 18, 6, 18]].forEach((r) => g.fillRect(...r)); g.fillStyle = yel; g.fillRect(33, 6, 4, 30); break;
    case 'geocode': mapSheet(4, 10, 30, 24); pin(22, 10, 1.3); g.fillStyle = ink; g.fillRect(6, 4, 12, 2); g.fillRect(6, 8, 8, 2); break;
    case 'project': g.strokeStyle = blue; g.lineWidth = 1.6; g.beginPath(); g.arc(20, 20, 15, 0, 7); g.stroke(); g.beginPath(); g.ellipse(20, 20, 7, 15, 0, 0, 7); g.stroke(); g.beginPath(); g.moveTo(5, 20); g.lineTo(35, 20); g.stroke(); break;
    case 'slope': g.fillStyle = '#8d6e63'; g.beginPath(); g.moveTo(4, 36); g.lineTo(36, 36); g.lineTo(36, 8); g.closePath(); g.fill(); g.strokeStyle = yel; g.lineWidth = 1.6; g.beginPath(); g.arc(30, 36, 9, Math.PI, Math.PI + 0.75); g.stroke(); break;
    case 'reclass': for (let i = 0; i < 3; i++) { g.fillStyle = ['#c62828', '#fbc02d', '#2e7d32'][i]; g.fillRect(6, 6 + i * 10, 10, 9); g.fillRect(24, 6 + i * 10, 10, 9); } g.strokeStyle = ink; g.lineWidth = 1.6; g.beginPath(); g.moveTo(17, 20); g.lineTo(23, 20); g.stroke(); break;
    case 'rastercalc': g.fillStyle = hexA(grn, 0.7); g.fillRect(4, 4, 18, 18); g.fillStyle = hexA(blue, 0.7); g.fillRect(18, 18, 18, 18); g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('+', 20, 20); break;
    case 'weighted': ['#2e7d32', '#fbc02d', '#c62828'].forEach((c, i) => { g.fillStyle = hexA(c, 0.8); g.beginPath(); g.moveTo(6, 14 + i * 7); g.lineTo(20, 8 + i * 7); g.lineTo(34, 14 + i * 7); g.lineTo(20, 20 + i * 7); g.closePath(); g.fill(); }); break;
    case 'ndvi': g.fillStyle = '#2e7d32'; g.beginPath(); g.ellipse(20, 20, 9, 15, 0.7, 0, 7); g.fill(); g.strokeStyle = '#c5e1a5'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(10, 30); g.lineTo(29, 11); g.stroke(); break;
    case 'incident': g.fillStyle = '#fb8c00'; g.beginPath(); g.moveTo(20, 4); g.lineTo(37, 34); g.lineTo(3, 34); g.closePath(); g.fill(); g.fillStyle = '#fff'; g.fillRect(18.5, 13, 3, 11); g.fillRect(18.5, 27, 3, 3); break;
    case 'proximity': g.fillStyle = blue; g.beginPath(); g.arc(11, 20, 5, 0, 7); g.fill(); g.fillStyle = red; g.beginPath(); g.arc(30, 20, 5, 0, 7); g.fill(); g.strokeStyle = ink; g.setLineDash([2, 2]); g.lineWidth = 1.4; g.beginPath(); g.moveTo(16, 20); g.lineTo(25, 20); g.stroke(); g.setLineDash([]); g.beginPath(); g.arc(11, 20, 11, 0, 7); g.stroke(); break;
    case 'geofence': g.strokeStyle = red; g.lineWidth = 2; g.setLineDash([3, 2]); g.beginPath(); g.moveTo(6, 10); g.lineTo(30, 5); g.lineTo(36, 28); g.lineTo(12, 35); g.closePath(); g.stroke(); g.setLineDash([]); pin(20, 16, 1.1, blue); break;
    case 'ai': g.strokeStyle = '#7e57c2'; g.lineWidth = 1.6; g.strokeRect(10, 10, 20, 20); g.fillStyle = hexA('#7e57c2', 0.25); g.fillRect(10, 10, 20, 20); for (let i = 0; i < 4; i++) { const p = 13 + i * 5; g.beginPath(); g.moveTo(p, 4); g.lineTo(p, 10); g.moveTo(p, 30); g.lineTo(p, 36); g.moveTo(4, p); g.lineTo(10, p); g.moveTo(30, p); g.lineTo(36, p); g.stroke(); } g.fillStyle = '#7e57c2'; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('AI', 20, 20.5); break;
    case 'alert': g.fillStyle = '#fb8c00'; g.beginPath(); g.moveTo(10, 28); g.quadraticCurveTo(10, 8, 20, 8); g.quadraticCurveTo(30, 8, 30, 28); g.lineTo(34, 31); g.lineTo(6, 31); g.closePath(); g.fill(); g.beginPath(); g.arc(20, 34, 3.5, 0, 7); g.fill(); break;
    case 'email': g.fillStyle = '#fff'; g.strokeStyle = blue; g.lineWidth = 1.8; g.fillRect(4, 9, 32, 22); g.strokeRect(4, 9, 32, 22); g.beginPath(); g.moveTo(4, 9); g.lineTo(20, 22); g.lineTo(36, 9); g.stroke(); break;
    case 'dashboard': g.fillStyle = '#263238'; g.fillRect(3, 6, 34, 26); g.fillStyle = '#4fc3f7'; g.fillRect(6, 9, 13, 9); g.fillStyle = '#ffb74d'; g.fillRect(21, 9, 13, 9); g.fillStyle = '#81c784'; g.fillRect(6, 20, 28, 9); g.fillStyle = ink; g.fillRect(16, 32, 8, 5); break;
    case 'webmap': mapSheet(3, 6, 34, 28); pin(14, 14, 1); pin(27, 20, 1, blue); break;
    default: g.fillStyle = blue; g.fillRect(8, 8, 24, 24);
  }
  g.restore();
}

// ---------------------------------------------------------------- drawing
const THEMES = {
  velocity: { card: '#ffffff', text: '#4a4f55', stroke: 'rgba(0,0,0,0.06)', shadow: 'rgba(30,40,60,0.22)', bg: '#e8e8e8', dot: 'rgba(0,0,0,0.22)', port: '#ffffff', badge: '#ffffff', badgeText: '#0aa3a8' },
  dark: { card: '#162133', text: '#e3edf7', stroke: 'rgba(120,180,255,0.18)', shadow: 'rgba(0,0,0,0.5)', bg: '#0b1320', dot: 'rgba(140,180,255,0.2)', port: '#0b1320', badge: '#0f1a2a', badgeText: '#5ce0e3' },
  classic: { card: '#ffffff', text: '#1d2733', stroke: '#333', shadow: 'rgba(0,0,0,0.25)', bg: '#ffffff', dot: 'rgba(0,0,0,0.12)', port: '#ffffff', badge: '#ffffff', badgeText: '#1565c0' },
  holo: { card: 'rgba(6,30,48,0.55)', text: '#c9fbff', stroke: '#45e6ff', shadow: 'rgba(69,230,255,0.6)', bg: 'rgba(2,12,22,0.75)', dot: 'rgba(69,230,255,0.25)', port: '#021018', badge: 'rgba(2,20,30,0.8)', badgeText: '#45e6ff' },
};
/**
 * Draws a graph. opts: { theme, link, time, rates, flow, nodeK(n) → 0..1 appear, edgeK(e) → 0..1 drawn,
 * active (node id highlighted), done (Set of finished node ids), sel, selEdge, edit, ghost }.
 */
export function drawGraph(g, G, opts = {}) {
  const th = THEMES[opts.theme] || THEMES.velocity;
  const link = opts.link || '#22d3d6';
  const t = opts.time || 0;
  const byId = new Map((G.nodes || []).map((n) => [n.id, n]));
  const nodeK = opts.nodeK || (() => 1), edgeK = opts.edgeK || (() => 1);
  const classic = opts.theme === 'classic', holo = opts.theme === 'holo';
  // ---- connectors
  (G.edges || []).forEach((e, i) => {
    const A = byId.get(e.a), B = byId.get(e.b);
    if (!A || !B) return;
    const k = edgeK(e, i);
    if (k <= 0) return;
    const P = route(outPort(A), inPort(B, Math.min(e.p || 0, insOf(B.t) - 1)));
    const len = polyLen(P), Q = k < 1 ? partial(P, len * k) : P;
    const line = (w, c, dash, off) => { g.beginPath(); Q.forEach((p, j) => (j ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.lineWidth = w; g.strokeStyle = c; g.setLineDash(dash || []); g.lineDashOffset = off || 0; g.stroke(); g.setLineDash([]); };
    const sel = opts.selEdge === i;
    if (classic) {
      line(2.2, sel ? '#1e88e5' : '#222');
      if (k >= 1) { const [x, y] = P.at(-1), [px, py] = P.at(-2); const a = Math.atan2(y - py, x - px); g.fillStyle = '#222'; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 11 * Math.cos(a - 0.4), y - 11 * Math.sin(a - 0.4)); g.lineTo(x - 11 * Math.cos(a + 0.4), y - 11 * Math.sin(a + 0.4)); g.closePath(); g.fill(); }
    } else {
      g.lineJoin = 'miter'; g.lineCap = 'butt';
      if (holo) { g.save(); g.shadowColor = link; g.shadowBlur = 12; line(5, hexA(link, 0.8)); g.restore(); }
      line(sel ? 9 : 7, sel ? '#1e88e5' : link);
      line(2.4, '#ffffff', [7, 7], -t * 26 * (opts.flowSpeed ?? 1));
      // arrow head into the port
      if (k >= 1) { const [x, y] = P.at(-1), [px, py] = P.at(-2); const a = Math.atan2(y - py, x - px); g.fillStyle = link; g.beginPath(); g.moveTo(x - 8 * Math.cos(a), y - 8 * Math.sin(a)); g.lineTo(x - 20 * Math.cos(a - 0.5), y - 20 * Math.sin(a - 0.5)); g.lineTo(x - 20 * Math.cos(a + 0.5), y - 20 * Math.sin(a + 0.5)); g.closePath(); g.fill(); }
    }
    // data packets flowing (run anim)
    if (opts.packets && k >= 1) {
      const ph = ((t * 0.7 * (opts.flowSpeed ?? 1)) + i * 0.37) % 1;
      const p = along(P, ph * len);
      g.fillStyle = classic ? '#1e88e5' : '#ffffff'; g.beginPath(); g.arc(p[0], p[1], 5, 0, 7); g.fill();
      g.strokeStyle = link; g.lineWidth = 2; g.stroke();
    }
  });
  // ---- nodes
  for (const n of G.nodes || []) {
    const k = nodeK(n);
    if (k <= 0) continue;
    const T = NODE_TYPES[n.t] || NODE_TYPES.layer;
    g.save();
    const sc = 0.6 + 0.4 * easeOut(k);
    g.globalAlpha *= clamp(k * 1.5, 0, 1);
    g.translate(n.x + NW / 2, n.y + NH / 2); g.scale(sc, sc); g.translate(-(n.x + NW / 2), -(n.y + NH / 2));
    const isIO = T.role !== 'tool';
    if (classic) {
      const c = T.role === 'in' ? '#8ec5ff' : T.role === 'out' ? '#a5e2a0' : '#ffe27a';
      g.fillStyle = c; g.strokeStyle = '#333'; g.lineWidth = 1.6;
      if (isIO) { g.beginPath(); g.ellipse(n.x + NW / 2, n.y + NH / 2, NW / 2, NH / 2, 0, 0, 7); } else rr(g, n.x, n.y, NW, NH, 10);
      if (opts.shadow !== false) { g.shadowColor = th.shadow; g.shadowBlur = 10; g.shadowOffsetY = 3; }
      g.fill(); g.shadowColor = 'transparent'; g.stroke();
      icon(g, n.t, n.x + (isIO ? 30 : 16), n.y + NH / 2 - 17, 34, 'classic');
      g.fillStyle = th.text; g.font = `600 17px ${UI}`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(fit(g, n.label || T.name, NW - 90), n.x + (isIO ? 72 : 60), n.y + NH / 2);
    } else {
      rr(g, n.x, n.y, NW, NH, isIO ? 20 : 8);
      if (opts.shadow !== false) { g.shadowColor = th.shadow; g.shadowBlur = holo ? 16 : 14; g.shadowOffsetY = holo ? 0 : 4; }
      g.fillStyle = th.card; g.fill();
      g.shadowColor = 'transparent';
      g.lineWidth = holo ? 1.6 : 1; g.strokeStyle = th.stroke; g.stroke();
      icon(g, n.t, n.x + 22, n.y + NH / 2 - 20, 40, opts.theme);
      g.fillStyle = th.text; g.font = `500 18px ${UI}`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(fit(g, n.label || T.name, NW - 104), n.x + 78, n.y + NH / 2);
      if (n.status) { g.fillStyle = '#2ecc40'; g.fillRect(n.x + NW - 40, n.y + NH / 2 - 9, 13, 13); g.strokeStyle = '#a5eba9'; g.lineWidth = 2; g.strokeRect(n.x + NW - 41, n.y + NH / 2 - 10, 15, 15); }
    }
    // rate badge under feeds
    if (n.rate && opts.rates !== false) {
      const m = /([\d.]+)\s*([kKmM]?)/.exec(n.rate);
      let txt = n.rate;
      if (m && opts.live) { const base = +m[1]; const wob = base * (1 + 0.06 * Math.sin(t * 1.7 + n.x * 0.01) + 0.03 * Math.sin(t * 5.3 + n.y)); txt = n.rate.replace(m[1], wob.toFixed(m[1].includes('.') ? m[1].split('.')[1].length : 0)); }
      const bx = n.x + 66, by = n.y + NH - 2, bw = 132, bh = 18;
      g.fillStyle = th.badge; g.fillRect(bx, by, bw, bh); g.strokeStyle = classic ? '#999' : 'rgba(0,0,0,0.12)'; g.lineWidth = 1; g.strokeRect(bx, by, bw, bh);
      g.fillStyle = th.badgeText; g.font = `500 14px ${UI}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, bx + bw / 2, by + bh / 2 + 1);
    }
    // ports
    if (!classic) {
      const port = ([x, y]) => { g.fillStyle = th.port; g.beginPath(); g.arc(x, y, 6.5, 0, 7); g.fill(); g.strokeStyle = link; g.lineWidth = 2.4; g.stroke(); };
      for (let p = 0; p < insOf(n.t); p++) port(inPort(n, p));
      if (hasOut(n.t)) port(outPort(n));
    }
    // run highlight / done tick / editor selection
    if (opts.active === n.id || opts.sel === n.id) {
      g.strokeStyle = '#1e88e5'; g.lineWidth = 3; g.strokeRect(n.x - 2, n.y - 2, NW + 4, NH + 4);
      g.fillStyle = '#fff'; g.strokeStyle = '#1e88e5'; g.lineWidth = 1.5;
      [[0, 0], [NW, 0], [0, NH], [NW, NH]].forEach(([dx, dy]) => { g.fillRect(n.x - 2 + dx - 3, n.y - 2 + dy - 3, 6, 6); g.strokeRect(n.x - 2 + dx - 3, n.y - 2 + dy - 3, 6, 6); });
      if (opts.active === n.id && !classic) { // spinner
        g.strokeStyle = '#1e88e5'; g.lineWidth = 3; g.beginPath(); g.arc(n.x + NW - 18, n.y + 16, 8, t * 6, t * 6 + 4.2); g.stroke();
      }
    }
    if (opts.done?.has(n.id) && T.role === 'tool') {
      g.fillStyle = '#2ecc40'; g.beginPath(); g.arc(n.x + NW - 6, n.y + 6, 11, 0, 7); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(n.x + NW - 11, n.y + 6); g.lineTo(n.x + NW - 7, n.y + 10); g.lineTo(n.x + NW, n.y + 1); g.stroke();
    }
    g.restore();
  }
}
function fit(g, s, w) {
  s = String(s);
  if (g.measureText(s).width <= w) return s;
  while (s.length > 2 && g.measureText(`${s}…`).width > w) s = s.slice(0, -1);
  return `${s}…`;
}
function background(g, x, y, w, h, kind, th, op, unitPx) {
  if (kind === 'none') return;
  g.save();
  g.globalAlpha *= op;
  rr(g, x, y, w, h, 10 * unitPx); g.fillStyle = th.bg; g.fill();
  g.clip();
  g.globalAlpha = Math.min(1, g.globalAlpha * 1.2);
  if (kind === 'dots') { g.fillStyle = th.dot; const st = 13 * unitPx, r = Math.max(0.6, 1.1 * unitPx); for (let yy = y + st / 2; yy < y + h; yy += st) for (let xx = x + st / 2; xx < x + w; xx += st) g.fillRect(xx - r / 2, yy - r / 2, r, r); }
  else if (kind === 'grid') { g.strokeStyle = th.dot; g.lineWidth = Math.max(0.5, 0.7 * unitPx); const st = 26 * unitPx; for (let xx = x; xx < x + w; xx += st) { g.beginPath(); g.moveTo(xx, y); g.lineTo(xx, y + h); g.stroke(); } for (let yy = y; yy < y + h; yy += st) { g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); } }
  g.restore();
}

/** Timing for the build / run animations. */
function timing(L, G, tau) {
  const D = Math.max(1, +L.duration || 8);
  const dep = depths(G);
  const maxD = Math.max(0, ...dep.values());
  const steps = maxD + 1;
  const step = (D * 0.85) / Math.max(1, steps);
  const order = [...(G.nodes || [])].filter((n) => NODE_TYPES[n.t]?.role === 'tool').sort((a, b) => dep.get(a.id) - dep.get(b.id) || a.y - b.y);
  return { D, dep, step, order };
}

export function drawModelFlow(ctx, L, tm, o, phase) {
  if (phase !== 'captions' || !o.frame) return;
  const s = L.style, fr = o.frame, t = o.time || 0;
  const G = s.graph || { nodes: [], edges: [] };
  if (!G.nodes?.length) return;
  const [x0, y0, x1, y1] = bounds(G);
  const pad = 34;
  const gw = x1 - x0 + pad * 2, gh = y1 - y0 + pad * 2 + (s.title ? 50 : 0);
  const maxW = fr.w * 0.94 * (+s.size || 1), maxH = fr.h * 0.86 * (+s.size || 1);
  const k = Math.min(maxW / gw, maxH / gh);
  const W = gw * k, H = gh * k;
  let cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2;
  if (s.position === 'top') cy = fr.y + 30 * o.unit + H / 2;
  if (s.position === 'bottom') cy = fr.y + fr.h - 30 * o.unit - H / 2;
  ctx.save();
  placeAt(ctx, L, fr, cx - W / 2, cy - H / 2, W, H);
  ctx.globalAlpha *= tm.alpha;
  const th = THEMES[s.theme] || THEMES.velocity;
  background(ctx, cx - W / 2, cy - H / 2, W, H, s.bg || 'dots', th, +s.bgOpacity >= 0 ? +s.bgOpacity : 0.92, k);
  ctx.translate(cx - W / 2, cy - H / 2);
  ctx.scale(k, k);
  if (s.title) {
    ctx.fillStyle = s.theme === 'dark' || s.theme === 'holo' ? '#e3f6ff' : '#2b3138'; ctx.font = `700 30px ${UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(s.title, pad, pad + 6);
    ctx.translate(0, 50);
  }
  ctx.translate(pad - x0, pad - y0);
  const tau = tm.edit ? Infinity : tm.tau;
  const anim = tm.edit ? 'flow' : L.anim || 'build';
  const opts = { theme: s.theme, link: s.link, time: t, rates: s.rates !== false, live: true, flowSpeed: +s.flowSpeed >= 0 ? +s.flowSpeed : 1, shadow: s.shadow };
  if (anim === 'build' || anim === 'run') {
    const T = timing(L, G, tau);
    if (anim === 'build') {
      opts.nodeK = (n) => clamp((tau - T.dep.get(n.id) * T.step) / (T.step * 0.45), 0, 1);
      opts.edgeK = (e) => clamp((tau - T.dep.get(e.a) * T.step - T.step * 0.4) / (T.step * 0.55), 0, 1);
      opts.packets = tau > T.D * 0.85;
    } else {
      const per = (T.D * 0.9) / Math.max(1, T.order.length);
      const i = Math.floor(tau / per);
      opts.active = i < T.order.length ? T.order[i]?.id : null;
      opts.done = new Set(T.order.slice(0, Math.min(i, T.order.length)).map((n) => n.id));
      opts.packets = true;
    }
  } else if (anim === 'flow') opts.packets = !tm.edit;
  else opts.flowSpeed = 0;
  drawGraph(ctx, G, opts);
  ctx.restore();
}

// ================================================================= drag & drop editor
let ED = null;
/**
 * Opens the full-screen model builder for layer L. onChange(graph) is called after every edit.
 */
export function openModelBuilder(L, onChange, onClose) {
  if (ED) ED.close();
  const G = clone(L.style.graph || { nodes: [], edges: [] });
  const theme = L.style.theme || 'velocity';
  const root = document.createElement('div');
  root.className = 'mfb';
  const groups = {};
  for (const [k, v] of Object.entries(NODE_TYPES)) (groups[v.group] ||= []).push([k, v]);
  root.innerHTML = `
  <div class="mfb-win" role="dialog" aria-label="Model builder">
    <header class="mfb-top">
      <b>⧉ Model builder</b>
      <span class="mfb-tip">Drag tools from the left onto the canvas · drag from a node’s right ● to another node to connect · Delete removes · wheel zooms · drag empty space to pan</span>
      <select class="mfb-preset"><option value="">Load an example…</option>${Object.entries(MF_PRESETS).map(([k, p]) => `<option value="${k}">${esc(p.name)}</option>`).join('')}</select>
      <button class="btn sm" data-mf="layout" title="Arrange the nodes left to right by step">↔ Auto layout</button>
      <button class="btn sm" data-mf="fit">⤢ Fit</button>
      <button class="btn sm" data-mf="clear">🗑 Clear</button>
      <button class="btn sm primary" data-mf="done">Done</button>
    </header>
    <aside class="mfb-pal"><input class="mfb-search" type="search" placeholder="Search tools…">${Object.entries(groups).map(([gname, items]) => `<h6>${esc(gname)}</h6>${items.map(([k, v]) => `<div class="mfb-item" draggable="true" data-t="${k}" title="Drag onto the canvas (or click to add)"><canvas width="56" height="56" data-icon="${k}"></canvas><span>${esc(v.name)}</span></div>`).join('')}`).join('')}</aside>
    <div class="mfb-stage"><canvas class="mfb-cv"></canvas></div>
    <aside class="mfb-props"></aside>
  </div>`;
  document.body.appendChild(root);
  // palette icons
  root.querySelectorAll('canvas[data-icon]').forEach((c) => { const g = c.getContext('2d'); g.scale(1.4, 1.4); icon(g, c.dataset.icon, 0, 0, 40, 'velocity'); });
  const cv = root.querySelector('.mfb-cv'), stage = root.querySelector('.mfb-stage'), props = root.querySelector('.mfb-props');
  const g = cv.getContext('2d');
  let view = { x: 40, y: 40, k: 0.5 };
  let sel = null, selEdge = null, drag = null, hoverPort = null;
  const changed = () => { onChange?.(clone(G)); renderProps(); };
  const uid = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const labelFor = (t) => { const base = NODE_TYPES[t]?.name || 'Node'; const same = G.nodes.filter((n) => n.t === t).length; return same ? `${base}-${same}` : base; };
  const toW = (cx, cy) => [(cx - view.x) / view.k, (cy - view.y) / view.k];
  function fitView() {
    const r = stage.getBoundingClientRect();
    const [x0, y0, x1, y1] = bounds(G);
    const k = Math.min((r.width - 80) / Math.max(400, x1 - x0), (r.height - 80) / Math.max(300, y1 - y0), 1.1);
    view = { k, x: (r.width - (x1 - x0) * k) / 2 - x0 * k, y: (r.height - (y1 - y0) * k) / 2 - y0 * k };
  }
  function resize() {
    const r = stage.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    cv.width = Math.max(10, r.width * d); cv.height = Math.max(10, r.height * d);
    cv.style.width = `${r.width}px`; cv.style.height = `${r.height}px`;
  }
  function addNode(t, wx, wy) {
    const n = { id: uid(), t, label: labelFor(t), x: Math.round((wx - NW / 2) / 10) * 10, y: Math.round((wy - NH / 2) / 10) * 10 };
    if (NODE_TYPES[t].rate) { n.rate = NODE_TYPES[t].rate; n.status = true; }
    G.nodes.push(n); sel = n.id; selEdge = null; changed();
    return n;
  }
  function freeSpot() {
    if (!G.nodes.length) return [NW / 2, NH / 2];
    const [, , x1] = bounds(G);
    const last = G.nodes.at(-1);
    return [Math.min(x1 + 60 + NW / 2, last.x + NW + 60 + NW / 2), last.y + NH / 2];
  }
  // hit tests (world coords)
  const nodeAt = (x, y) => [...G.nodes].reverse().find((n) => x >= n.x && x <= n.x + NW && y >= n.y && y <= n.y + NH);
  const outAt = (x, y) => G.nodes.find((n) => hasOut(n.t) && Math.hypot(x - outPort(n)[0], y - outPort(n)[1]) < 14 / Math.min(1, view.k));
  const inAt = (x, y) => { for (const n of G.nodes) for (let p = 0; p < insOf(n.t); p++) { const q = inPort(n, p); if (Math.hypot(x - q[0], y - q[1]) < 16 / Math.min(1, view.k)) return [n, p]; } return null; };
  const edgeAt = (x, y) => {
    const byId = new Map(G.nodes.map((n) => [n.id, n]));
    for (let i = G.edges.length - 1; i >= 0; i--) {
      const e = G.edges[i], A = byId.get(e.a), B = byId.get(e.b);
      if (!A || !B) continue;
      const P = route(outPort(A), inPort(B, Math.min(e.p || 0, insOf(B.t) - 1)));
      for (let j = 1; j < P.length; j++) { const [ax, ay] = P[j - 1], [bx, by] = P[j]; const L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1; const u = clamp(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L2, 0, 1); if (Math.hypot(x - (ax + (bx - ax) * u), y - (ay + (by - ay) * u)) < 9 / Math.min(1, view.k)) return i; }
    }
    return -1;
  };
  function connect(a, b, p) {
    if (a.id === b.id) return;
    // one connection per input port; avoid cycles
    const reach = (from, to) => { const seen = new Set([from]); const st = [from]; while (st.length) { const c = st.pop(); if (c === to) return true; for (const e of G.edges) if (e.a === c && !seen.has(e.b)) { seen.add(e.b); st.push(e.b); } } return false; };
    if (reach(b.id, a.id)) return;
    G.edges = G.edges.filter((e) => !(e.b === b.id && (e.p || 0) === p));
    G.edges.push({ a: a.id, b: b.id, p });
    changed();
  }
  function freeIn(n, wy) {
    const k = insOf(n.t);
    if (!k) return -1;
    let best = 0, bd = Infinity;
    for (let p = 0; p < k; p++) { const used = G.edges.some((e) => e.b === n.id && (e.p || 0) === p); const d = Math.abs(inPort(n, p)[1] - wy) + (used ? 1000 : 0); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  // pointer
  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect();
    const [x, y] = toW(e.clientX - r.left, e.clientY - r.top);
    cv.setPointerCapture(e.pointerId);
    const o = outAt(x, y);
    if (o) { drag = { mode: 'wire', from: o, x, y }; return; }
    const n = nodeAt(x, y);
    if (n) { sel = n.id; selEdge = null; drag = { mode: 'node', n, dx: x - n.x, dy: y - n.y, moved: false }; G.nodes.splice(G.nodes.indexOf(n), 1); G.nodes.push(n); renderProps(); return; }
    const ei = edgeAt(x, y);
    if (ei >= 0) { selEdge = ei; sel = null; renderProps(); return; }
    sel = null; selEdge = null; renderProps();
    drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
  });
  cv.addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect();
    const [x, y] = toW(e.clientX - r.left, e.clientY - r.top);
    hoverPort = outAt(x, y) ? 'out' : null;
    cv.style.cursor = drag?.mode === 'pan' ? 'grabbing' : hoverPort ? 'crosshair' : nodeAt(x, y) ? 'move' : 'default';
    if (!drag) return;
    if (drag.mode === 'pan') { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; }
    else if (drag.mode === 'node') { drag.n.x = Math.round((x - drag.dx) / 10) * 10; drag.n.y = Math.round((y - drag.dy) / 10) * 10; drag.moved = true; }
    else if (drag.mode === 'wire') { drag.x = x; drag.y = y; }
  });
  const end = (e) => {
    if (!drag) return;
    const r = cv.getBoundingClientRect();
    const [x, y] = toW(e.clientX - r.left, e.clientY - r.top);
    if (drag.mode === 'node' && drag.moved) changed();
    if (drag.mode === 'wire') {
      const hit = inAt(x, y);
      if (hit) connect(drag.from, hit[0], hit[1]);
      else { const n = nodeAt(x, y); if (n && n !== drag.from) { const p = freeIn(n, y); if (p >= 0) connect(drag.from, n, p); } }
    }
    drag = null;
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', () => { drag = null; });
  cv.addEventListener('dblclick', () => { props.querySelector('[data-p="label"]')?.focus(); props.querySelector('[data-p="label"]')?.select(); });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const k2 = clamp(view.k * Math.exp(-e.deltaY * 0.0015), 0.12, 2.5);
    view.x = mx - ((mx - view.x) * k2) / view.k; view.y = my - ((my - view.y) * k2) / view.k; view.k = k2;
  }, { passive: false });
  // palette drag & drop
  root.querySelectorAll('.mfb-item').forEach((it) => {
    it.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-mf-node', it.dataset.t); e.dataTransfer.effectAllowed = 'copy'; });
    it.addEventListener('click', () => { const [x, y] = freeSpot(); addNode(it.dataset.t, x, y); });
  });
  stage.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('text/x-mf-node')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  stage.addEventListener('drop', (e) => {
    const t = e.dataTransfer.getData('text/x-mf-node');
    if (!t || !NODE_TYPES[t]) return;
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const [x, y] = toW(e.clientX - r.left, e.clientY - r.top);
    const n = addNode(t, x, y);
    // dropped onto a connector's end? connect from the selected node automatically
    void n;
  });
  root.querySelector('.mfb-search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    root.querySelectorAll('.mfb-item').forEach((it) => { it.hidden = q && !it.textContent.toLowerCase().includes(q); });
  });
  // keyboard
  const onKey = (e) => {
    if (e.target.closest?.('input,textarea,select')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (sel) { G.nodes = G.nodes.filter((n) => n.id !== sel); G.edges = G.edges.filter((x) => x.a !== sel && x.b !== sel); sel = null; changed(); e.preventDefault(); }
      else if (selEdge != null) { G.edges.splice(selEdge, 1); selEdge = null; changed(); e.preventDefault(); }
    }
    if (e.key === 'Escape') close();
  };
  window.addEventListener('keydown', onKey, true);
  // header buttons
  root.querySelector('.mfb-top').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mf]');
    if (!b) return;
    const a = b.dataset.mf;
    if (a === 'done') close();
    if (a === 'fit') fitView();
    if (a === 'clear') { G.nodes = []; G.edges = []; sel = null; selEdge = null; changed(); }
    if (a === 'layout') { autoLayout(G); fitView(); changed(); }
  });
  root.querySelector('.mfb-preset').addEventListener('change', (e) => {
    const p = MF_PRESETS[e.target.value];
    if (!p) return;
    const ng = clone(p.graph); G.nodes = ng.nodes; G.edges = ng.edges; sel = null; selEdge = null;
    e.target.value = ''; fitView(); changed();
  });
  root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
  function renderProps() {
    const n = G.nodes.find((x) => x.id === sel);
    if (!n) {
      props.innerHTML = selEdge != null ? '<h6>Connection</h6><p class="muted small">Press Delete to remove it.</p><button class="btn sm" data-pa="deledge">🗑 Remove connection</button>'
        : `<h6>Diagram</h6><p class="muted small">${G.nodes.length} nodes · ${G.edges.length} connections.</p><p class="muted small">Select a node to rename it, change its type or give a feed an event rate.</p>`;
      return;
    }
    const T = NODE_TYPES[n.t];
    props.innerHTML = `<h6>${esc(T.name)}</h6>
      <label>Label<input data-p="label" value="${esc(n.label)}"></label>
      <label>Type<select data-p="t">${Object.entries(groups).map(([gn, items]) => `<optgroup label="${esc(gn)}">${items.map(([k, v]) => `<option value="${k}"${k === n.t ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      ${T.role !== 'tool' ? `<label>Rate badge (e.g. 29.8 e/s — empty = none)<input data-p="rate" value="${esc(n.rate || '')}"></label><label class="mfb-chk"><input type="checkbox" data-p="status"${n.status ? ' checked' : ''}> Green “running” square</label>` : ''}
      <div class="btn-row"><button class="btn sm" data-pa="dup">⧉ Duplicate</button><button class="btn sm" data-pa="del">🗑 Delete</button></div>`;
  }
  props.addEventListener('input', (e) => {
    const n = G.nodes.find((x) => x.id === sel);
    const k = e.target.dataset.p;
    if (!n || !k) return;
    if (k === 'status') n.status = e.target.checked;
    else if (k === 'rate') { if (e.target.value.trim()) n.rate = e.target.value; else delete n.rate; }
    else if (k === 't') { n.t = e.target.value; G.edges = G.edges.filter((x) => !(x.b === n.id && (x.p || 0) >= insOf(n.t)) && !(x.a === n.id && !hasOut(n.t))); renderProps(); }
    else n[k] = e.target.value;
    onChange?.(clone(G));
  });
  props.addEventListener('click', (e) => {
    const a = e.target.closest('[data-pa]')?.dataset.pa;
    if (!a) return;
    if (a === 'del' && sel) { G.nodes = G.nodes.filter((n) => n.id !== sel); G.edges = G.edges.filter((x) => x.a !== sel && x.b !== sel); sel = null; changed(); }
    if (a === 'dup' && sel) { const n = G.nodes.find((x) => x.id === sel); const c = { ...n, id: uid(), label: `${n.label} copy`, y: n.y + NH + 40 }; G.nodes.push(c); sel = c.id; changed(); }
    if (a === 'deledge' && selEdge != null) { G.edges.splice(selEdge, 1); selEdge = null; changed(); }
  });
  // render loop
  let raf = 0;
  const t0 = performance.now();
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const d = window.devicePixelRatio || 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    const th = THEMES[theme] || THEMES.velocity;
    g.fillStyle = theme === 'dark' || theme === 'holo' ? '#0b1320' : '#e9e9e9'; g.fillRect(0, 0, cv.width, cv.height);
    // dotted canvas in world space
    g.setTransform(d * view.k, 0, 0, d * view.k, d * view.x, d * view.y);
    const [wx0, wy0] = toW(0, 0), [wx1, wy1] = toW(cv.width / d, cv.height / d);
    g.fillStyle = th.dot;
    const st = 20, rad = 1.3 / view.k;
    if (view.k > 0.2) for (let y = Math.floor(wy0 / st) * st; y < wy1; y += st) for (let x = Math.floor(wx0 / st) * st; x < wx1; x += st) g.fillRect(x - rad / 2, y - rad / 2, rad, rad);
    drawGraph(g, G, { theme, link: L.style.link, time: (performance.now() - t0) / 1000, rates: true, live: false, sel, selEdge, flowSpeed: 1 });
    if (drag?.mode === 'wire') {
      const a = outPort(drag.from);
      g.strokeStyle = L.style.link || '#22d3d6'; g.lineWidth = 4; g.setLineDash([8, 6]);
      g.beginPath(); route(a, [drag.x, drag.y]).forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); g.setLineDash([]);
    }
    if (!G.nodes.length) {
      g.setTransform(d, 0, 0, d, 0, 0);
      g.fillStyle = '#7a8591'; g.font = `500 16px ${UI}`; g.textAlign = 'center';
      g.fillText('Drag inputs, tools and outputs here from the left — or load an example above', cv.width / d / 2, cv.height / d / 2);
    }
  };
  const ro = new ResizeObserver(() => resize());
  ro.observe(stage);
  resize(); fitView(); renderProps(); frame();
  function close() {
    cancelAnimationFrame(raf); ro.disconnect();
    window.removeEventListener('keydown', onKey, true);
    root.remove(); ED = null;
    onClose?.(clone(G));
  }
  ED = { close, graph: G, root, addNode, view: () => ({ ...view }), connect: (a, b, p = 0) => connect(G.nodes.find((n) => n.id === a), G.nodes.find((n) => n.id === b), p) };
  root._mf = ED;
  return ED;
}
/** Left-to-right layering by step; nodes in a column keep their vertical order. */
export function autoLayout(G) {
  const dep = depths(G);
  const cols = new Map();
  for (const n of G.nodes) { const d = dep.get(n.id); if (!cols.has(d)) cols.set(d, []); cols.get(d).push(n); }
  for (const [d, list] of cols) {
    list.sort((a, b) => a.y - b.y);
    const h = list.length * (NH + 60) - 60;
    list.forEach((n, i) => { n.x = d * (NW + 60); n.y = Math.round((-h / 2 + i * (NH + 60)) / 10) * 10; });
  }
}
