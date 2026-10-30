// Network analysis layers: service areas (drive / cycle / walk time zones), origin–destination flows,
// routes from A to B by car, bicycle, walking, train or plane (with a race between them) and geofences
// with a tracked vehicle that raises alerts on enter / exit.
// Routing: FOSSGIS OSRM (routing.openstreetmap.de) and FOSSGIS Valhalla (valhalla1.openstreetmap.de), both free
// and keyless. Results are saved in the layer (style.result) so the video always looks the same.
import { haversine, greatCircle, curvedLine, unwrap, simplify } from './geo.js';
import { placeAt, CUSTOM_POS } from './place.js';

const UI = '"Inter","Segoe UI",system-ui,sans-serif';
const MONO = '"JetBrains Mono",ui-monospace,Menlo,monospace';
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
function hexA(hex, a) {
  const h = String(hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ---------------------------------------------------------------- catalogue
export const NET_MODES = {
  car: { name: 'Car', icon: '🚗', color: '#ff5252', route: 'car' },
  bike: { name: 'Bicycle', icon: '🚲', color: '#00c853', route: 'bike' },
  foot: { name: 'Walk', icon: '🚶', color: '#ffab00', route: 'foot' },
  train: { name: 'Train', icon: '🚆', color: '#2979ff' },
  plane: { name: 'Plane', icon: '✈️', color: '#d500f9' },
};
const SA_MODES = { car: 'Car (drive time)', bike: 'Bicycle', foot: 'Walking', buffer: 'Straight-line distance (buffer)' };
const RAMPS = {
  heat: ['#1a9850', '#91cf60', '#fee08b', '#fc8d59', '#d73027'],
  ocean: ['#08306b', '#2171b5', '#4292c6', '#9ecae1', '#deebf7'],
  purple: ['#3f007d', '#6a51a3', '#9e9ac8', '#cbc9e2', '#efedf5'],
  neon: ['#00e5ff', '#2979ff', '#7c4dff', '#d500f9', '#ff4081'],
  mono: ['#ffffff', '#d9d9d9', '#a6a6a6', '#737373', '#404040'],
};
const RAMP_NAMES = { heat: 'Green → red', ocean: 'Blues', purple: 'Purples', neon: 'Neon', mono: 'Greys' };
const POS = { 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right', 'top-left': 'Top left', 'top-right': 'Top right', ...CUSTOM_POS };

export const NET_KINDS = {
  servicearea: { name: 'Service area', icon: '◎', geom: 'point', desc: 'Areas you can reach in 5, 10, 15… minutes by car, bike or on foot (isochrones)' },
  odflow: { name: 'Origin–destination flows', icon: '⇶', geom: 'line', desc: 'Flows from one origin to many destinations — click the origin first' },
  netroute: { name: 'Route A → B', icon: '⤳', geom: 'line', desc: 'Route between places by car, bicycle, walking, train or plane, and compare times' },
  geofence: { name: 'Geofence', icon: '⬡', geom: 'polygon', desc: 'A zone that raises an alert when a tracked vehicle enters or leaves' },
};
export const NET_ANIMS = {
  servicearea: { grow: 'Zones spread out', fade: 'Fade in', none: 'Already there' },
  odflow: { flow: 'Draw out, then flow', draw: 'Draw out', none: 'Already there' },
  netroute: { race: 'Race (real travel times)', together: 'All arrive together', one: 'One after another' },
  geofence: { track: 'Vehicle moves, alerts on enter / exit' },
};
export const NET_DEFAULTS = {
  servicearea: { anim: 'grow', duration: 4, style: { mode: 'car', metric: 'time', breaks: '5, 10, 15', ramp: 'heat', opacity: 0.42, outline: true, labels: true, legend: true, title: '', icon: '🏥', name: '', pulse: true, position: 'bottom-left', smooth: true } },
  odflow: { anim: 'flow', duration: 4, style: { path: 'arc', direction: 'out', color: '#00e5ff', colorTo: '#ff3d7f', width: 1, curve: 0.22, values: '', particles: true, speed: 1, labels: 'name', units: 'km', table: true, title: 'Origin – destination', position: 'bottom-right', originName: '' } },
  netroute: { anim: 'race', duration: 8, style: { car: true, bike: true, foot: true, train: false, plane: false, fromName: '', toName: '', panel: true, title: 'How long does it take?', clock: true, units: 'km', width: 1, position: 'bottom-left', trainKmh: 110, planeKmh: 780 } },
  geofence: { anim: 'track', duration: 7, style: { name: 'Restricted zone', rule: 'restricted', fenceColor: '#00e676', alertColor: '#ff1744', asset: 'Vehicle 07', icon: '🚚', trail: true, banner: true, log: true, clock: '14:30:00', minutes: 30, fill: 0.16, pulse: true, position: 'bottom-right', path: null } },
};
const modeSwitch = (k) => [`style.${k}`, `${NET_MODES[k].icon} ${NET_MODES[k].name}`, 'switch'];
export const NET_FORMS = {
  servicearea: [['style.mode', 'Travel by', 'select', SA_MODES], ['style.metric', 'Zones by', 'select', { time: 'Travel time (minutes)', distance: 'Distance (km)' }, (L) => L.style.mode !== 'buffer'], ['style.breaks', 'Zone limits (comma separated, up to 4)', 'text'], ['style.ramp', 'Colours', 'select', RAMP_NAMES], ['style.opacity', 'Opacity', 'range', [0.05, 0.9, 0.01]], ['style.outline', 'Outlines', 'switch'], ['style.labels', 'Labels on the zones', 'switch'], ['style.icon', 'Place icon (emoji)', 'text'], ['style.name', 'Place name', 'text'], ['style.pulse', 'Pulse at the place', 'switch'], ['style.legend', 'Legend', 'switch'], ['style.title', 'Legend title (empty = automatic)', 'text', null, (L) => L.style.legend !== false], ['style.position', 'Legend position', 'select', POS, (L) => L.style.legend !== false]],
  odflow: [['style.path', 'Lines', 'select', { arc: 'Curved arcs (flows)', road: 'Real roads (driving routes)', straight: 'Straight lines' }], ['style.direction', 'Direction', 'select', { out: 'Origin → destinations', in: 'Destinations → origin' }], ['style.values', 'Names and values, one per destination (e.g. “Dubai: 1200”)', 'textarea'], ['style.originName', 'Origin name', 'text'], ['style.color', 'Colour at the start', 'color'], ['style.colorTo', 'Colour at the end', 'color'], ['style.width', 'Line width', 'range', [0.3, 4, 0.05]], ['style.curve', 'Arc bend', 'range', [0, 0.6, 0.01], (L) => L.style.path === 'arc'], ['style.particles', 'Moving particles', 'switch'], ['style.speed', 'Particle speed', 'range', [0.1, 4, 0.05], (L) => L.style.particles !== false], ['style.labels', 'Labels', 'select', { name: 'Name', value: 'Name and value', dist: 'Name and distance', time: 'Name and drive time', none: 'None' }], ['style.units', 'Units', 'select', { km: 'Kilometres', mi: 'Miles' }], ['style.table', 'OD table on screen', 'switch'], ['style.title', 'Table title', 'text', null, (L) => L.style.table !== false], ['style.position', 'Table position', 'select', POS, (L) => L.style.table !== false]],
  netroute: [modeSwitch('car'), modeSwitch('bike'), modeSwitch('foot'), modeSwitch('train'), modeSwitch('plane'), ['style.fromName', 'Start name (A)', 'text'], ['style.toName', 'End name (B)', 'text'], ['style.width', 'Line width', 'range', [0.3, 3, 0.05]], ['style.panel', 'Comparison panel', 'switch'], ['style.title', 'Panel title', 'text', null, (L) => L.style.panel !== false], ['style.clock', 'Travel clock in the panel', 'switch', null, (L) => L.style.panel !== false], ['style.position', 'Panel position', 'select', POS, (L) => L.style.panel !== false], ['style.units', 'Units', 'select', { km: 'Kilometres', mi: 'Miles' }], ['style.trainKmh', 'Train average speed (km/h)', 'range', [30, 320, 5], (L) => L.style.train], ['style.planeKmh', 'Plane cruise speed (km/h)', 'range', [200, 950, 10], (L) => L.style.plane]],
  geofence: [['style.name', 'Zone name', 'text'], ['style.rule', 'Alert when the vehicle', 'select', { restricted: 'Enters (restricted zone)', allowed: 'Leaves (allowed zone)', both: 'Enters or leaves' }], ['style.asset', 'Vehicle name', 'text'], ['style.icon', 'Vehicle icon (emoji)', 'text'], ['style.fenceColor', 'Zone colour', 'color'], ['style.alertColor', 'Alert colour', 'color'], ['style.fill', 'Zone fill', 'range', [0, 0.6, 0.01]], ['style.pulse', 'Glowing border', 'switch'], ['style.trail', 'Trail behind the vehicle', 'switch'], ['style.banner', 'Alert banner', 'switch'], ['style.log', 'Event log on screen', 'switch'], ['style.position', 'Log position', 'select', POS, (L) => L.style.log !== false], ['style.clock', 'Clock at the start (hh:mm:ss)', 'text'], ['style.minutes', 'Real minutes the trip takes', 'number', 1]],
};
export const NET_SET = new Set(Object.keys(NET_KINDS));
export function netPhases(kind) {
  if (kind === 'servicearea') return ['below', 'above', 'captions'];
  if (kind === 'odflow') return ['above', 'captions'];
  if (kind === 'netroute') return ['below', 'above', 'captions'];
  if (kind === 'geofence') return ['below', 'above', 'captions'];
  return [];
}

// ---------------------------------------------------------------- formatting
export function fmtDur(sec) {
  if (!Number.isFinite(sec)) return '—';
  const m = Math.round(sec / 60);
  if (m < 60) return `${Math.max(1, m)} min`;
  const h = Math.floor(m / 60), mm = m % 60;
  if (h >= 48) return `${Math.floor(h / 24)} d ${h % 24} h`;
  return `${h} h ${String(mm).padStart(2, '0')}`;
}
export function fmtLen(m, units = 'km') {
  if (!Number.isFinite(m)) return '—';
  if (units === 'mi') { const mi = m / 1609.344; return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi).toLocaleString()} mi`; }
  if (m < 1000) return `${Math.round(m)} m`;
  return m < 10000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000).toLocaleString()} km`;
}
const pathLen = (c) => { let d = 0; for (let i = 1; i < c.length; i++) d += haversine(c[i - 1], c[i]); return d; };
export function parseBreaks(s) {
  return String(s || '').split(/[,;\s]+/).map(Number).filter((v) => v > 0).sort((a, b) => a - b).slice(0, 4);
}
function parseValues(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(.*?)[:|=]\s*(-?[\d.,]+)\s*$/);
    if (m) return { name: m[1].trim(), value: +m[2].replace(/,/g, '') };
    const n = +l.replace(/,/g, '');
    return Number.isFinite(n) ? { name: '', value: n } : { name: l, value: null };
  });
}

// ---------------------------------------------------------------- routing services
const OSRM = { car: 'https://routing.openstreetmap.de/routed-car', bike: 'https://routing.openstreetmap.de/routed-bike', foot: 'https://routing.openstreetmap.de/routed-foot' };
const VALHALLA = 'https://valhalla1.openstreetmap.de';
const COSTING = { car: 'auto', bike: 'bicycle', foot: 'pedestrian' };
function decode6(str) {
  const out = [];
  let i = 0, lat = 0, lng = 0;
  const dec = () => { let r = 0, s = 0, b; do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20); return r & 1 ? ~(r >> 1) : r >> 1; };
  while (i < str.length) { lat += dec(); lng += dec(); out.push([lng / 1e6, lat / 1e6]); }
  return out;
}
async function getJSON(url, ms = 25000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
/** Route through points for car / bike / foot. Returns { coords, dist (m), dur (s) }. */
export async function routeVia(profile, pts) {
  const c = pts.slice(0, 25);
  try {
    const j = await getJSON(`${OSRM[profile]}/route/v1/driving/${c.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join(';')}?overview=full&geometries=geojson`);
    if (j.code !== 'Ok' || !j.routes?.length) throw new Error('no route');
    const r = j.routes[0];
    let dur = r.duration;
    // OSRM bike / foot profiles on the FOSSGIS server report realistic times; keep a sanity floor.
    if (profile === 'foot') dur = Math.max(dur, r.distance / 1.45);
    if (profile === 'bike') dur = Math.max(dur, r.distance / 5.5);
    return { coords: simplify(r.geometry.coordinates, 0.00002), dist: r.distance, dur };
  } catch (e) {
    const body = { locations: c.map((p) => ({ lon: p[0], lat: p[1] })), costing: COSTING[profile], directions_options: { units: 'kilometers' }, directions_type: 'none' };
    const j = await getJSON(`${VALHALLA}/route?json=${encodeURIComponent(JSON.stringify(body))}`);
    const legs = j.trip?.legs || [];
    if (!legs.length) throw new Error('No route found');
    const coords = legs.flatMap((l, i) => decode6(l.shape).slice(i ? 1 : 0));
    return { coords: simplify(coords, 0.00002), dist: (j.trip.summary.length || 0) * 1000, dur: j.trip.summary.time || 0 };
  }
}
/** Destination point from a start, bearing (deg) and distance (m). */
function dest([lng, lat], brg, d) {
  const R = 6371008.8, r = Math.PI / 180;
  const φ1 = lat * r, λ1 = lng * r, θ = brg * r, δ = d / R;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [λ2 / r, φ2 / r];
}
const circle = (c, m, n = 96) => { const ring = Array.from({ length: n }, (_, i) => dest(c, (i / n) * 360, m)); ring.push(ring[0]); return ring; };
const SPEED = { car: 50 / 3.6, bike: 16 / 3.6, foot: 5 / 3.6 }; // m/s, for the search radius of the fallback

async function isoValhalla(c, mode, metric, breaks) {
  const body = { locations: [{ lat: c[1], lon: c[0] }], costing: COSTING[mode], contours: breaks.map((b) => (metric === 'distance' ? { distance: b } : { time: b })), polygons: true, denoise: 0.4, generalize: 40 };
  const j = await getJSON(`${VALHALLA}/isochrone?json=${encodeURIComponent(JSON.stringify(body))}`, 40000);
  const zones = (j.features || []).filter((f) => /Polygon/.test(f.geometry?.type)).map((f) => ({ value: +f.properties.contour, polys: f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates }));
  if (!zones.length) throw new Error('empty');
  return zones.sort((a, b) => a.value - b.value);
}
async function isoOSRM(c, mode, metric, breaks) {
  // Fallback: sample travel times along rays with the OSRM table service and find where each limit is reached.
  const maxB = breaks[breaks.length - 1];
  const R = metric === 'distance' ? maxB * 1000 * 1.05 : maxB * 60 * SPEED[mode] * 1.35;
  const NB = 32, radii = [0.1, 0.22, 0.36, 0.5, 0.64, 0.78, 0.9, 1];
  const pts = [];
  for (let b = 0; b < NB; b++) for (const f of radii) pts.push(dest(c, (b / NB) * 360, R * f));
  const vals = new Array(pts.length).fill(Infinity);
  const chunk = 80;
  for (let k = 0; k < pts.length; k += chunk) {
    const part = pts.slice(k, k + chunk);
    const all = [c, ...part];
    const ann = metric === 'distance' ? '&annotations=distance' : '';
    const j = await getJSON(`${OSRM[mode]}/table/v1/driving/${all.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(';')}?sources=0${ann}`);
    const row = (metric === 'distance' ? j.distances : j.durations)?.[0];
    if (!row) throw new Error('table failed');
    part.forEach((_, i) => { const v = row[i + 1]; vals[k + i] = v == null ? Infinity : metric === 'distance' ? v / 1000 : v / 60; });
  }
  return breaks.map((B) => {
    const ring = [];
    for (let b = 0; b < NB; b++) {
      let reach = 0;
      let prevV = 0, prevF = 0;
      for (let i = 0; i < radii.length; i++) {
        const v = vals[b * radii.length + i];
        if (v <= B) { reach = radii[i]; prevV = v; prevF = radii[i]; continue; }
        if (Number.isFinite(v) && v > prevV) reach = prevF + (radii[i] - prevF) * ((B - prevV) / (v - prevV));
        break;
      }
      ring.push(dest(c, (b / NB) * 360, Math.max(R * 0.03, reach * R)));
    }
    ring.push(ring[0]);
    return { value: B, polys: [[ring]] };
  });
}
/** Chaikin smoothing of a closed ring. */
function smoothRing(ring, it = 2) {
  let r = ring.slice(0, -1);
  if (r.length < 5 || r.length > 1500) return ring;
  for (let k = 0; k < it; k++) {
    const o = [];
    for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
    r = o;
  }
  return [...r, r[0]];
}

/** Inputs that decide the result — when they change the result must be computed again. */
export function netSig(L) {
  const s = L.style || {};
  const g = JSON.stringify(L.geom?.coordinates || null);
  if (L.kind === 'servicearea') return `${g}|${s.mode}|${s.metric}|${parseBreaks(s.breaks).join(',')}`;
  if (L.kind === 'netroute') return `${g}|${['car', 'bike', 'foot', 'train', 'plane'].filter((k) => s[k]).join(',')}|${s.trainKmh}|${s.planeKmh}`;
  if (L.kind === 'odflow') return s.path === 'road' || s.labels === 'time' ? `${g}|road` : '';
  return '';
}
export const netNeedsCompute = (L) => NET_SET.has(L.kind) && L.kind !== 'geofence' && !!netSig(L) && L.style?.resultSig !== netSig(L);

/** Compute the analysis for a layer. Returns the result object (stored as style.result). */
export async function computeNet(L) {
  const s = L.style;
  if (L.kind === 'servicearea') {
    const c = L.geom.coordinates;
    let breaks = parseBreaks(s.breaks);
    if (!breaks.length) breaks = [5, 10, 15];
    if (s.mode === 'buffer') return { zones: breaks.map((b) => ({ value: b, polys: [[circle(c, b * 1000)]] })), metric: 'distance', mode: 'buffer' };
    let zones, source = 'Valhalla (FOSSGIS)';
    try { zones = await isoValhalla(c, s.mode, s.metric, breaks); } catch { zones = await isoOSRM(c, s.mode, s.metric, breaks); source = 'OSRM (FOSSGIS)'; }
    if (s.smooth !== false) zones.forEach((z) => { z.polys = z.polys.map((p) => p.map((r) => smoothRing(r, 1))); });
    return { zones, metric: s.metric, mode: s.mode, source };
  }
  if (L.kind === 'netroute') {
    const pts = L.geom.coordinates;
    const out = {};
    const errors = [];
    for (const k of ['car', 'bike', 'foot']) {
      if (!s[k]) continue;
      try { out[k] = await routeVia(k, pts); } catch (e) { errors.push(NET_MODES[k].name); out[k] = { error: true }; }
    }
    if (s.train) {
      // No public rail router: follow the stops with gentle curves; time from the average speed + 4 min per stop.
      const c = [];
      for (let i = 1; i < pts.length; i++) c.push(...curvedLine(pts[i - 1], pts[i], 0.06, 48).slice(i > 1 ? 1 : 0));
      const dist = pathLen(c) * 1.08;
      out.train = { coords: c, dist, dur: (dist / ((+s.trainKmh || 110) / 3.6)) + (pts.length - 1) * 240 + 600, est: true };
    }
    if (s.plane) {
      const a = pts[0], b = pts[pts.length - 1];
      const c = greatCircle(a, b, 128);
      const dist = haversine(a, b);
      out.plane = { coords: c, dist, dur: dist / ((+s.planeKmh || 780) / 3.6) + 1800, est: true };
    }
    return { modes: out, errors };
  }
  if (L.kind === 'odflow') {
    const c = L.geom.coordinates;
    const routes = [];
    for (let i = 1; i < c.length && i <= 30; i++) {
      try { routes.push(await routeVia('car', [c[0], c[i]])); } catch { routes.push(null); }
    }
    return { routes };
  }
  return null;
}

// ---------------------------------------------------------------- geofence logic
function inRing(p, ring) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-12) + xi) ins = !ins;
  }
  return ins;
}
const inPoly = (p, rings) => rings.length && inRing(p, rings[0]) && !rings.slice(1).some((h) => inRing(p, h));
function segX(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-15) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}
/** Default path for the tracked vehicle: crosses the zone from west to east, through its middle. */
export function defaultFencePath(geom) {
  const ring = geom.coordinates[0];
  let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
  for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  const cy = (s + n) / 2, dx = (e - w) * 0.45, dy = (n - s) * 0.18;
  return [[w - dx, cy - dy], [w + (e - w) * 0.3, cy + dy * 0.6], [w + (e - w) * 0.7, cy - dy * 0.4], [e + dx, cy + dy]].map((p) => [+p[0].toFixed(6), +p[1].toFixed(6)]);
}
const fenceCache = new Map();
/** Enter / exit events along the path: [{ f (0..1 of path length), enter, p }]. */
export function fenceEvents(L) {
  const path = L.style?.path;
  const rings = L.geom?.coordinates;
  if (!path || path.length < 2 || !rings) return { events: [], cum: [0], total: 0 };
  const key = JSON.stringify([path, rings]);
  const hit = fenceCache.get(L.id);
  if (hit && hit.key === key) return hit.val;
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversine(path[i - 1], path[i]));
  const total = cum[cum.length - 1] || 1;
  const xs = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    for (const ring of rings) for (let k = 1; k < ring.length; k++) {
      const t = segX(a, b, ring[k - 1], ring[k]);
      if (t != null) xs.push({ f: (cum[i - 1] + t * (cum[i] - cum[i - 1])) / total, p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] });
    }
  }
  xs.sort((a, b) => a.f - b.f);
  let inside = inPoly(path[0], rings);
  const events = [];
  for (const x of xs) {
    if (events.length && Math.abs(x.f - events[events.length - 1].f) < 1e-6) continue;
    inside = !inside;
    events.push({ ...x, enter: inside });
  }
  const val = { events, cum, total, startInside: inPoly(path[0], rings) };
  fenceCache.set(L.id, { key, val });
  return val;
}
const isAlert = (rule, enter) => rule === 'both' || (rule === 'allowed' ? !enter : enter);
/** Times (seconds after the layer start) of alert events, for sound effects. */
export function fenceAlertTimes(L) {
  const D = Math.max(0.1, +L.duration || 1);
  return fenceEvents(L).events.map((e) => ({ t: e.f * D, alert: isAlert(L.style.rule || 'restricted', e.enter), enter: e.enter }));
}

// ---------------------------------------------------------------- screen helpers
function scr(coords, proj) {
  const pts = coords.map((c) => proj(c));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] || 0 };
}
/** Point and heading at fraction f of a geographic polyline (by real distance). */
function geoAt(coords, f) {
  if (coords.length < 2) return { c: coords[0], i: 0 };
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  const d = clamp(f, 0, 1) * cum[cum.length - 1];
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  const a = coords[i - 1], b = coords[i];
  return { c: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], i };
}
function strokePartial(ctx, P, f) {
  const d = clamp(f, 0, 1) * P.len;
  ctx.beginPath();
  ctx.moveTo(P.pts[0][0], P.pts[0][1]);
  let head = P.pts[0];
  for (let i = 1; i < P.pts.length; i++) {
    if (P.cum[i] <= d) { ctx.lineTo(P.pts[i][0], P.pts[i][1]); head = P.pts[i]; continue; }
    const t = (d - P.cum[i - 1]) / (P.cum[i] - P.cum[i - 1] || 1);
    head = [P.pts[i - 1][0] + (P.pts[i][0] - P.pts[i - 1][0]) * t, P.pts[i - 1][1] + (P.pts[i][1] - P.pts[i - 1][1]) * t];
    ctx.lineTo(head[0], head[1]);
    break;
  }
  return head;
}
function screenAt(P, f) {
  const d = clamp(f, 0, 1) * P.len;
  let i = 1;
  while (i < P.pts.length - 1 && P.cum[i] < d) i++;
  const a = P.pts[i - 1], b = P.pts[i] || a;
  const t = (d - P.cum[i - 1]) / (P.cum[i] - P.cum[i - 1] || 1);
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}
function badge(ctx, x, y, icon, color, unit, r = 13) {
  const R = r * unit;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 8 * unit; ctx.shadowOffsetY = 2 * unit;
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2.6 * unit; ctx.strokeStyle = color; ctx.stroke();
  ctx.font = `${R * 1.15}px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#111'; ctx.fillText(icon || '•', x, y + R * 0.06);
  ctx.restore();
}
function pill(ctx, x, y, text, unit, { bg = 'rgba(12,16,24,0.86)', fg = '#fff', size = 11, weight = 700, align = 'center', accent = null } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size * unit}px ${UI}`;
  const w = ctx.measureText(text).width + 14 * unit + (accent ? 8 * unit : 0), h = (size + 9) * unit;
  const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  ctx.fillStyle = bg; rr(ctx, x0, y - h / 2, w, h, h / 2); ctx.fill();
  if (accent) { ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(x0 + 9 * unit, y, 3.5 * unit, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x0 + 7 * unit + (accent ? 8 * unit : 0), y + 0.5 * unit);
  ctx.restore();
  return w;
}
function panel(ctx, L, frame, unit, W, H, pos = 'bottom-left') {
  const m = 26 * unit;
  let x = pos.includes('right') ? frame.x + frame.w - m - W : frame.x + m;
  let y = pos.includes('top') ? frame.y + m : frame.y + frame.h - m - H;
  placeAt(ctx, L, frame, x, y, W, H);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 24 * unit; ctx.shadowOffsetY = 6 * unit;
  ctx.fillStyle = 'rgba(14,18,28,0.84)'; rr(ctx, x, y, W, H, 14 * unit); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1 * unit; rr(ctx, x + 0.5, y + 0.5, W - 1, H - 1, 14 * unit); ctx.stroke();
  return [x, y];
}
const rampColors = (ramp, n) => { const r = RAMPS[ramp] || RAMPS.heat; return Array.from({ length: n }, (_, i) => r[Math.round(n === 1 ? 0 : (i * (r.length - 1)) / (n - 1))]); };
function placeholder(ctx, L, tm, o, text) {
  const { proj, unit } = o;
  const c = L.geom?.type === 'Point' ? L.geom.coordinates : L.geom?.coordinates?.[0];
  if (!c) return;
  const p = proj(c);
  pill(ctx, p[0], p[1] - 34 * unit, text, unit, { bg: 'rgba(30,34,44,0.9)', accent: '#ffb300' });
}

// ---------------------------------------------------------------- service area
function zoneProgress(L, tm, i, n) {
  if (tm.edit || L.anim === 'none') return 1;
  if (L.anim === 'fade') return clamp(tm.u * 1.2, 0, 1);
  const seg = 1 / (n * 0.7 + 0.3);
  return clamp((tm.u - i * seg * 0.7) / seg, 0, 1);
}
function drawServiceArea(ctx, L, tm, o, phase) {
  const s = L.style;
  const { proj, unit, frame } = o;
  const c = L.geom.coordinates;
  const P0 = proj(c);
  const res = s.result;
  const zones = res?.zones || [];
  const n = zones.length;
  const cols = rampColors(s.ramp, n);
  if (phase === 'below') {
    if (!n) return;
    for (let i = n - 1; i >= 0; i--) {
      const z = zones[i];
      const k = zoneProgress(L, tm, i, n);
      if (k <= 0) continue;
      ctx.save();
      ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' ? k : 1);
      const path = new Path2D();
      let maxR = 0;
      for (const poly of z.polys) for (const ring of poly) {
        ring.forEach((q, j) => { const p = proj(q); maxR = Math.max(maxR, Math.hypot(p[0] - P0[0], p[1] - P0[1])); if (j) path.lineTo(p[0], p[1]); else path.moveTo(p[0], p[1]); });
        path.closePath();
      }
      if (L.anim === 'grow' && k < 1) { ctx.beginPath(); ctx.arc(P0[0], P0[1], maxR * easeOut(k) + 1, 0, Math.PI * 2); ctx.clip(); }
      ctx.fillStyle = hexA(cols[i], clamp(+s.opacity || 0.42, 0, 1));
      ctx.fill(path, 'evenodd');
      if (s.outline !== false) {
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2.6 * unit; ctx.stroke(path);
        ctx.strokeStyle = cols[i]; ctx.lineWidth = 1.4 * unit; ctx.stroke(path);
      }
      if (L.anim === 'grow' && k < 1) {
        // bright leading edge
        ctx.strokeStyle = hexA('#ffffff', 0.55 * (1 - k)); ctx.lineWidth = 3 * unit;
        ctx.beginPath(); ctx.arc(P0[0], P0[1], maxR * easeOut(k), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
    return;
  }
  if (phase === 'above') {
    ctx.save();
    ctx.globalAlpha *= tm.alpha;
    if (!n) placeholder(ctx, L, tm, o, s.resultErr ? 'Could not compute — check your connection' : 'Computing service area…');
    // zone labels: at the northernmost point of each zone
    if (s.labels !== false) zones.forEach((z, i) => {
      if (zoneProgress(L, tm, i, n) < 0.85) return;
      let best = null;
      for (const poly of z.polys) for (const q of poly[0] || []) { const p = proj(q); if (!best || p[1] < best[1]) best = p; }
      if (best) pill(ctx, best[0], best[1] - 2 * unit, s.mode === 'buffer' || res.metric === 'distance' ? `${z.value} km` : `${z.value} min`, unit, { accent: cols[i], size: 10.5 });
    });
    if (s.pulse !== false && !tm.edit) for (let k = 0; k < 2; k++) {
      const ph = ((tm.tau * 0.8 + k * 0.5) % 1);
      ctx.strokeStyle = hexA(cols[0] || '#ffffff', 0.7 * (1 - ph)); ctx.lineWidth = 2.5 * unit;
      ctx.beginPath(); ctx.arc(P0[0], P0[1], 14 * unit + ph * 42 * unit, 0, Math.PI * 2); ctx.stroke();
    }
    badge(ctx, P0[0], P0[1], s.icon || '📍', cols[0] || '#ff5252', unit, 15);
    if (s.name) pill(ctx, P0[0], P0[1] + 30 * unit, s.name, unit, { size: 12, weight: 800 });
    ctx.restore();
    return;
  }
  if (phase === 'captions' && frame && s.legend !== false && n) {
    const rowH = 22 * unit, W = 236 * unit, H = 46 * unit + n * rowH;
    ctx.save();
    ctx.globalAlpha *= tm.alpha * (tm.edit ? 1 : clamp(tm.tau / 0.5, 0, 1));
    const [x, y] = panel(ctx, L, frame, unit, W, H, s.position || 'bottom-left');
    const how = { car: 'Drive time', bike: 'Cycling time', foot: 'Walking time', buffer: 'Distance' }[s.mode] || 'Reach';
    const title = s.title || `${res.metric === 'distance' && s.mode !== 'buffer' ? `${{ car: 'Driving', bike: 'Cycling', foot: 'Walking' }[s.mode]} distance` : how}${s.name ? ` from ${s.name}` : ''}`;
    ctx.fillStyle = '#fff'; ctx.font = `800 ${12.5 * unit}px ${UI}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(title.toUpperCase(), x + 14 * unit, y + 20 * unit, W - 28 * unit);
    zones.forEach((z, i) => {
      const k = zoneProgress(L, tm, i, n);
      const yy = y + 42 * unit + i * rowH;
      ctx.globalAlpha = tm.alpha * (0.35 + 0.65 * k);
      ctx.fillStyle = hexA(cols[i], 0.85); rr(ctx, x + 14 * unit, yy - 7 * unit, 22 * unit, 14 * unit, 4 * unit); ctx.fill();
      ctx.fillStyle = '#e8ecf4'; ctx.font = `600 ${11.5 * unit}px ${UI}`;
      const prev = i ? zones[i - 1].value : 0;
      const u = res.metric === 'distance' || s.mode === 'buffer' ? 'km' : 'min';
      ctx.fillText(`${prev ? `${prev}–` : 'Up to '}${z.value} ${u}`, x + 46 * unit, yy);
    });
    ctx.restore();
  }
}

// ---------------------------------------------------------------- OD flows
function odPaths(L, proj) {
  const s = L.style;
  const c = L.geom.coordinates;
  const o = c[0];
  const out = [];
  for (let i = 1; i < c.length; i++) {
    let geo;
    const r = s.result?.routes?.[i - 1];
    if (s.path === 'road' && r?.coords) geo = r.coords;
    else if (s.path === 'straight') geo = [o, c[i]];
    else geo = null;
    let P;
    if (geo) P = scr(s.direction === 'in' ? [...geo].reverse() : geo, proj);
    else {
      // screen-space arc, bending to the left of travel
      const a = proj(s.direction === 'in' ? c[i] : o), b = proj(s.direction === 'in' ? o : c[i]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1];
      const bend = +s.curve || 0;
      const k = [mx + dy * bend, my - dx * bend];
      const pts = [];
      for (let j = 0; j <= 40; j++) { const t = j / 40, u = 1 - t; pts.push([u * u * a[0] + 2 * u * t * k[0] + t * t * b[0], u * u * a[1] + 2 * u * t * k[1] + t * t * b[1]]); }
      const cum = [0];
      for (let j = 1; j < pts.length; j++) cum.push(cum[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
      P = { pts, cum, len: cum[cum.length - 1] };
    }
    out.push({ P, dist: r?.dist ?? haversine(o, c[i]), dur: r?.dur, i });
  }
  return out;
}
function odInfo(L) {
  const vals = parseValues(L.style.values);
  const n = Math.max(0, (L.geom?.coordinates?.length || 1) - 1);
  const rows = Array.from({ length: n }, (_, i) => ({ name: vals[i]?.name || `Destination ${i + 1}`, value: vals[i]?.value ?? null }));
  const vmax = Math.max(1e-9, ...rows.map((r) => Math.abs(r.value || 0)));
  return { rows, vmax, hasVals: rows.some((r) => r.value != null) };
}
function odLocal(L, tm, i, n) {
  if (tm.edit || L.anim === 'none') return 1;
  const st = n > 1 ? (i / (n - 1)) * 0.45 : 0;
  return clamp((tm.u - st) / 0.55, 0, 1);
}
function drawOD(ctx, L, tm, o, phase) {
  const s = L.style;
  const { proj, unit, frame } = o;
  const c = L.geom?.coordinates;
  if (!c || c.length < 2) return;
  const { rows, vmax, hasVals } = odInfo(L);
  const paths = odPaths(L, proj);
  const n = paths.length;
  const fmt = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e4 ? `${Math.round(v / 1e3)}k` : Math.round(v).toLocaleString());
  if (phase === 'above') {
    ctx.save();
    ctx.globalAlpha *= tm.alpha;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    paths.forEach(({ P, dist, dur, i }, j) => {
      if (P.len < 1) return;
      const r = rows[j];
      const w = (hasVals && r.value != null ? 1.5 + 6 * Math.sqrt(Math.abs(r.value) / vmax) : 3) * unit * (+s.width || 1);
      const k = odLocal(L, tm, j, n);
      const a = P.pts[0], b = P.pts[P.pts.length - 1];
      const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
      g.addColorStop(0, s.color || '#00e5ff'); g.addColorStop(1, s.colorTo || '#ff3d7f');
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = w + 2.5 * unit; strokePartial(ctx, P, easeOut(k)); ctx.stroke();
      ctx.shadowColor = s.color || '#00e5ff'; ctx.shadowBlur = 10 * unit;
      ctx.strokeStyle = g; ctx.lineWidth = w; const head = strokePartial(ctx, P, easeOut(k)); ctx.stroke();
      ctx.shadowBlur = 0;
      // particles flowing along once drawn
      if (s.particles !== false && (k >= 1 || tm.edit)) {
        const cnt = Math.max(2, Math.round(P.len / (46 * unit)));
        const ph = (tm.edit ? 0.3 : tm.tau) * (+s.speed || 1) * 0.35;
        for (let q = 0; q < cnt; q++) {
          const f = ((q / cnt) + ph * (60 * unit / Math.max(60 * unit, P.len)) * 3) % 1;
          const pt = screenAt(P, f).p;
          ctx.fillStyle = '#ffffff'; ctx.globalAlpha = tm.alpha * (0.4 + 0.6 * Math.sin(f * Math.PI));
          ctx.beginPath(); ctx.arc(pt[0], pt[1], Math.max(1.6 * unit, w * 0.42), 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = tm.alpha;
      } else if (k > 0 && k < 1) {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(head[0], head[1], w * 0.7 + 1.5 * unit, 0, Math.PI * 2); ctx.fill();
      }
      // destination node
      const dPt = proj(c[i]);
      if (k >= 0.9) {
        const pop = easeOut((k - 0.9) / 0.1);
        const R = (hasVals && r.value != null ? 4 + 9 * Math.sqrt(Math.abs(r.value) / vmax) : 5.5) * unit * pop;
        ctx.fillStyle = hexA(s.colorTo || '#ff3d7f', 0.3); ctx.beginPath(); ctx.arc(dPt[0], dPt[1], R * 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = s.colorTo || '#ff3d7f'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6 * unit;
        ctx.beginPath(); ctx.arc(dPt[0], dPt[1], R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const lb = s.labels || 'name';
        if (lb !== 'none') {
          let t = r.name;
          if (lb === 'value' && r.value != null) t += ` · ${fmt(r.value)}`;
          if (lb === 'dist') t += ` · ${fmtLen(dist, s.units)}`;
          if (lb === 'time') t += ` · ${dur != null ? fmtDur(dur) : '…'}`;
          pill(ctx, dPt[0], dPt[1] - R - 13 * unit, t, unit, { size: 10.5 });
        }
      }
    });
    // origin
    const p0 = proj(c[0]);
    if (!tm.edit) for (let k = 0; k < 2; k++) { const ph = (tm.tau * 0.7 + k * 0.5) % 1; ctx.strokeStyle = hexA(s.color || '#00e5ff', 0.8 * (1 - ph)); ctx.lineWidth = 2.4 * unit; ctx.beginPath(); ctx.arc(p0[0], p0[1], 9 * unit + ph * 34 * unit, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = s.color || '#00e5ff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4 * unit;
    ctx.beginPath(); ctx.arc(p0[0], p0[1], 8.5 * unit, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (s.originName) pill(ctx, p0[0], p0[1] + 24 * unit, s.originName, unit, { size: 12, weight: 800, accent: s.color });
    if (s.path === 'road' && !s.result) placeholder(ctx, L, tm, o, s.resultErr ? 'Roads unavailable — showing arcs' : 'Finding road routes…');
    ctx.restore();
    return;
  }
  if (phase === 'captions' && frame && s.table !== false) {
    const list = paths.map((p, j) => ({ ...rows[j], dist: p.dist, dur: p.dur, j })).sort((a, b) => (hasVals ? (b.value || 0) - (a.value || 0) : a.dist - b.dist)).slice(0, 8);
    const rowH = 21 * unit, W = 300 * unit, H = 48 * unit + list.length * rowH;
    ctx.save();
    ctx.globalAlpha *= tm.alpha * (tm.edit ? 1 : clamp(tm.tau / 0.6, 0, 1));
    const [x, y] = panel(ctx, L, frame, unit, W, H, s.position || 'bottom-right');
    ctx.fillStyle = '#fff'; ctx.font = `800 ${12.5 * unit}px ${UI}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText((s.title || 'Origin – destination').toUpperCase(), x + 14 * unit, y + 20 * unit, W - 28 * unit);
    const maxD = Math.max(...list.map((r) => r.dist), 1);
    list.forEach((r, q) => {
      const yy = y + 44 * unit + q * rowH;
      const k = odLocal(L, tm, r.j, n);
      const bar = hasVals ? Math.abs(r.value || 0) / vmax : r.dist / maxD;
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; rr(ctx, x + 120 * unit, yy - 5 * unit, 88 * unit, 10 * unit, 5 * unit); ctx.fill();
      const g = ctx.createLinearGradient(x + 120 * unit, 0, x + 208 * unit, 0); g.addColorStop(0, s.color || '#00e5ff'); g.addColorStop(1, s.colorTo || '#ff3d7f');
      ctx.fillStyle = g; rr(ctx, x + 120 * unit, yy - 5 * unit, Math.max(4 * unit, 88 * unit * bar * easeOut(k)), 10 * unit, 5 * unit); ctx.fill();
      ctx.fillStyle = '#e8ecf4'; ctx.font = `600 ${11 * unit}px ${UI}`; ctx.textAlign = 'left';
      ctx.fillText(r.name, x + 14 * unit, yy, 100 * unit);
      ctx.textAlign = 'right'; ctx.font = `700 ${10.5 * unit}px ${MONO}`; ctx.fillStyle = 'rgba(232,236,244,0.85)';
      ctx.fillText(hasVals && r.value != null ? fmt(r.value) : r.dur != null ? fmtDur(r.dur) : fmtLen(r.dist, s.units), x + W - 14 * unit, yy);
    });
    ctx.restore();
  }
}

// ---------------------------------------------------------------- route A → B by mode
const ORDER = ['plane', 'train', 'car', 'bike', 'foot'];
function routeProgress(L, tm, list, k) {
  if (tm.edit) return 1;
  const u = clamp(tm.u, 0, 1);
  if (L.anim === 'together') return ease(u);
  if (L.anim === 'one') { const i = list.indexOf(k); const n = list.length; return clamp(u * n - i, 0, 1); }
  const maxD = Math.max(...list.map((m) => L.style.result.modes[m].dur || 0), 1);
  const d = L.style.result.modes[k].dur || maxD;
  return clamp((u * maxD) / d, 0, 1);
}
function drawRoute(ctx, L, tm, o, phase) {
  const s = L.style;
  const { proj, unit, frame } = o;
  const c = L.geom?.coordinates;
  if (!c || c.length < 2) return;
  const res = s.result;
  const list = res ? ORDER.filter((k) => s[k] && res.modes[k]?.coords) : [];
  const W = +s.width || 1;
  if (phase === 'below') {
    ctx.save();
    ctx.globalAlpha *= tm.alpha;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const k of list) {
      const m = res.modes[k];
      const P = scr(unwrap(m.coords), proj);
      const f = routeProgress(L, tm, list, k);
      const col = NET_MODES[k].color;
      // faint full route ahead
      ctx.strokeStyle = hexA(col, 0.18); ctx.lineWidth = 4 * unit * W; strokePartial(ctx, P, 1); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 7.5 * unit * W; strokePartial(ctx, P, f); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 4.5 * unit * W;
      if (k === 'foot') ctx.setLineDash([0.1, 8 * unit * W]);
      else if (k === 'plane') ctx.setLineDash([12 * unit * W, 8 * unit * W]);
      strokePartial(ctx, P, f); ctx.stroke(); ctx.setLineDash([]);
      if (k === 'train') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6 * unit * W; ctx.setLineDash([6 * unit, 6 * unit]); strokePartial(ctx, P, f); ctx.stroke(); ctx.setLineDash([]); }
    }
    ctx.restore();
    return;
  }
  if (phase === 'above') {
    ctx.save();
    ctx.globalAlpha *= tm.alpha;
    // A, B (and stops)
    const pin = (q, t, col) => {
      const p = proj(q);
      ctx.fillStyle = col; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 * unit;
      ctx.beginPath(); ctx.arc(p[0], p[1], 11 * unit, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `900 ${11 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, p[0], p[1] + 0.5 * unit);
      return p;
    };
    c.slice(1, -1).forEach((q) => { const p = proj(q); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#333'; ctx.lineWidth = 2 * unit; ctx.beginPath(); ctx.arc(p[0], p[1], 5 * unit, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    const pa = pin(c[0], 'A', '#16a34a'), pb = pin(c[c.length - 1], 'B', '#dc2626');
    if (s.fromName) pill(ctx, pa[0], pa[1] + 26 * unit, s.fromName, unit, { size: 12, weight: 800 });
    if (s.toName) pill(ctx, pb[0], pb[1] + 26 * unit, s.toName, unit, { size: 12, weight: 800 });
    // vehicles at the heads
    for (const k of list) {
      const m = res.modes[k];
      const f = routeProgress(L, tm, list, k);
      if (tm.edit && list.length > 1) continue;
      const g = geoAt(unwrap(m.coords), f).c;
      const p = proj(g);
      badge(ctx, p[0], p[1], NET_MODES[k].icon, NET_MODES[k].color, unit, 14);
    }
    if (!res) placeholder(ctx, L, tm, o, s.resultErr ? 'Could not find the routes — check your connection' : 'Finding routes…');
    ctx.restore();
    return;
  }
  if (phase === 'captions' && frame && s.panel !== false && list.length) {
    const rowH = 34 * unit, Wd = 330 * unit, H = 52 * unit + list.length * rowH + (s.clock !== false ? 22 * unit : 0);
    const sorted = [...list].sort((a, b) => res.modes[a].dur - res.modes[b].dur);
    const maxD = Math.max(...list.map((k) => res.modes[k].dur), 1);
    ctx.save();
    ctx.globalAlpha *= tm.alpha * (tm.edit ? 1 : clamp(tm.tau / 0.5, 0, 1));
    const [x, y] = panel(ctx, L, frame, unit, Wd, H, s.position || 'bottom-left');
    ctx.fillStyle = '#fff'; ctx.font = `800 ${12.5 * unit}px ${UI}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const head = s.title || 'How long does it take?';
    ctx.fillText(head.toUpperCase(), x + 14 * unit, y + 20 * unit, Wd - 28 * unit);
    if (s.fromName || s.toName) { ctx.font = `600 ${10.5 * unit}px ${UI}`; ctx.fillStyle = 'rgba(232,236,244,0.7)'; ctx.fillText(`${s.fromName || 'A'} → ${s.toName || 'B'}`, x + 14 * unit, y + 36 * unit, Wd - 28 * unit); }
    sorted.forEach((k, i) => {
      const m = res.modes[k];
      const f = routeProgress(L, tm, list, k);
      const yy = y + 58 * unit + i * rowH;
      ctx.font = `${15 * unit}px ${EMOJI}`; ctx.textAlign = 'center'; ctx.fillText(NET_MODES[k].icon, x + 24 * unit, yy);
      ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = `700 ${11.5 * unit}px ${UI}`;
      ctx.fillText(`${NET_MODES[k].name}${m.est ? ' (est.)' : ''}`, x + 42 * unit, yy - 7 * unit);
      ctx.fillStyle = 'rgba(232,236,244,0.65)'; ctx.font = `600 ${10 * unit}px ${UI}`;
      ctx.fillText(fmtLen(m.dist, s.units), x + 42 * unit, yy + 8 * unit);
      const bx = x + 140 * unit, bw = 100 * unit;
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; rr(ctx, bx, yy - 4 * unit, bw, 8 * unit, 4 * unit); ctx.fill();
      ctx.fillStyle = NET_MODES[k].color; rr(ctx, bx, yy - 4 * unit, Math.max(5 * unit, bw * (m.dur / maxD) * f), 8 * unit, 4 * unit); ctx.fill();
      ctx.textAlign = 'right'; ctx.font = `800 ${12 * unit}px ${MONO}`; ctx.fillStyle = f >= 1 ? '#fff' : 'rgba(255,255,255,0.55)';
      ctx.fillText(fmtDur(f >= 1 ? m.dur : m.dur * f), x + Wd - 14 * unit, yy - 1 * unit);
      if (f >= 1 && i === 0 && list.length > 1) { ctx.font = `800 ${8.5 * unit}px ${UI}`; ctx.fillStyle = '#ffd54f'; ctx.fillText('FASTEST', x + Wd - 14 * unit, yy + 12 * unit); }
    });
    if (s.clock !== false) {
      const el = tm.edit ? maxD : L.anim === 'race' ? clamp(tm.u, 0, 1) * maxD : null;
      ctx.textAlign = 'left'; ctx.font = `700 ${10.5 * unit}px ${MONO}`; ctx.fillStyle = 'rgba(232,236,244,0.75)';
      if (el != null) ctx.fillText(`⏱  ${fmtDur(el)}`, x + 14 * unit, y + H - 16 * unit);
      if (res.errors?.length) { ctx.textAlign = 'right'; ctx.fillStyle = '#ffb300'; ctx.fillText(`No route: ${res.errors.join(', ')}`, x + Wd - 14 * unit, y + H - 16 * unit); }
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- geofence
function clockAt(s, f) {
  const m = String(s.clock || '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const t0 = (+m[1]) * 3600 + (+m[2]) * 60 + (+(m[3] || 0));
  const t = Math.round(t0 + f * (+s.minutes || 30) * 60) % 86400;
  return `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
function drawGeofence(ctx, L, tm, o, phase) {
  const s = L.style;
  const { proj, unit, frame } = o;
  if (!L.geom) return;
  const path = s.path || defaultFencePath(L.geom);
  const fe = fenceEvents({ ...L, style: { ...s, path } });
  const f = tm.edit ? clamp(+s.editAt || 0.5, 0, 1) : clamp(tm.u, 0, 1);
  const rule = s.rule || 'restricted';
  const past = fe.events.filter((e) => e.f <= f);
  const inside = past.length ? past[past.length - 1].enter : fe.startInside;
  const alarm = rule === 'both' ? false : rule === 'allowed' ? !inside : inside;
  const last = past[past.length - 1];
  const since = last ? (f - last.f) * Math.max(0.1, +L.duration || 1) : 99;
  const lastAlert = last && isAlert(rule, last.enter);
  const flash = (alarm || (lastAlert && since < 2.5)) && !tm.edit ? 0.5 + 0.5 * Math.sin((tm.tau || 0) * 12) : 0;
  const col = alarm || (lastAlert && since < 2.5) ? s.alertColor || '#ff1744' : s.fenceColor || '#00e676';
  if (phase === 'below') {
    ctx.save();
    ctx.globalAlpha *= tm.alpha;
    const pth = new Path2D();
    for (const ring of L.geom.coordinates) { ring.forEach((q, i) => { const p = proj(q); if (i) pth.lineTo(p[0], p[1]); else pth.moveTo(p[0], p[1]); }); pth.closePath(); }
    ctx.fillStyle = hexA(col, clamp(+(s.fill ?? 0.16) + flash * 0.18, 0, 1)); ctx.fill(pth, 'evenodd');
    // hatch for restricted zones
    if (rule !== 'allowed') {
      ctx.save(); ctx.clip(pth, 'evenodd');
      const b = frame || { x: 0, y: 0, w: ctx.canvas.width, h: ctx.canvas.height };
      ctx.strokeStyle = hexA(col, 0.16); ctx.lineWidth = 1.2 * unit;
      const step = 12 * unit;
      ctx.beginPath();
      for (let x = b.x - b.h; x < b.x + b.w; x += step) { ctx.moveTo(x, b.y + b.h); ctx.lineTo(x + b.h, b.y); }
      ctx.stroke(); ctx.restore();
    }
    if (s.pulse !== false) { ctx.shadowColor = col; ctx.shadowBlur = (10 + flash * 14) * unit; }
    ctx.strokeStyle = col; ctx.lineWidth = 3 * unit; ctx.setLineDash([12 * unit, 7 * unit]); ctx.lineDashOffset = -((tm.tau || 0) * 30 * unit);
    ctx.stroke(pth); ctx.setLineDash([]); ctx.shadowBlur = 0;
    // zone name at the top of the zone
    let top = null;
    for (const q of L.geom.coordinates[0]) { const p = proj(q); if (!top || p[1] < top[1]) top = p; }
    if (top && s.name) pill(ctx, top[0], top[1] - 14 * unit, `${rule === 'allowed' ? '✓' : '⛔'}  ${s.name.toUpperCase()}`, unit, { bg: hexA(col, 0.92), fg: '#fff', size: 10.5, weight: 800 });
    ctx.restore();
    return;
  }
  if (phase === 'above') {
    ctx.save();
    ctx.globalAlpha *= tm.alpha;
    const P = scr(path, proj);
    if (tm.edit) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.6 * unit; ctx.setLineDash([5 * unit, 5 * unit]); strokePartial(ctx, P, 1); ctx.stroke(); ctx.setLineDash([]); }
    const g = geoAt(path, f).c;
    const head = proj(g);
    if (s.trail !== false) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 5.5 * unit; strokePartial(ctx, P, f); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3 * unit; strokePartial(ctx, P, f); ctx.stroke();
    }
    // crossing markers
    for (const e of past) {
      const p = proj(e.p);
      const a = isAlert(rule, e.enter);
      const c2 = a ? s.alertColor || '#ff1744' : s.fenceColor || '#00e676';
      const age = (f - e.f) * Math.max(0.1, +L.duration || 1);
      if (!tm.edit && age < 1.6) { ctx.strokeStyle = hexA(c2, 1 - age / 1.6); ctx.lineWidth = 3 * unit; ctx.beginPath(); ctx.arc(p[0], p[1], 8 * unit + age * 50 * unit, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = c2; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * unit; ctx.beginPath(); ctx.arc(p[0], p[1], 6 * unit, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      pill(ctx, p[0], p[1] - 17 * unit, e.enter ? 'ENTER' : 'EXIT', unit, { bg: hexA(c2, 0.92), size: 9, weight: 900 });
    }
    badge(ctx, head[0], head[1], s.icon || '🚚', col, unit, 15);
    if (s.asset) pill(ctx, head[0], head[1] + 28 * unit, s.asset, unit, { size: 10.5, accent: col });
    ctx.restore();
    return;
  }
  if (phase === 'captions' && frame) {
    const D = Math.max(0.1, +L.duration || 1);
    ctx.save();
    ctx.globalAlpha *= tm.alpha;
    // banner for the latest alert
    if (s.banner !== false && last && lastAlert && since < 3 && !tm.edit) {
      const k = clamp(since / 0.25, 0, 1) * clamp((3 - since) / 0.4, 0, 1);
      const W = Math.min(frame.w * 0.62, 620 * unit), H = 56 * unit;
      const x = frame.x + (frame.w - W) / 2, y = frame.y + 30 * unit - (1 - k) * 30 * unit;
      ctx.globalAlpha = tm.alpha * k;
      ctx.fillStyle = hexA(s.alertColor || '#ff1744', 0.94); rr(ctx, x, y, W, H, 12 * unit); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.15 * Math.sin(since * 14)})`; rr(ctx, x, y, W, H, 12 * unit); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${20 * unit}px ${UI}`; ctx.fillText('⚠', x + 18 * unit, y + H / 2);
      ctx.font = `900 ${14 * unit}px ${UI}`;
      ctx.fillText(rule === 'allowed' && !last.enter ? 'GEOFENCE EXIT ALERT' : 'GEOFENCE BREACH', x + 50 * unit, y + 19 * unit);
      ctx.font = `600 ${12 * unit}px ${UI}`;
      const tt = clockAt(s, last.f);
      ctx.fillText(`${s.asset || 'Vehicle'} ${last.enter ? 'entered' : 'left'} ${s.name || 'the zone'}${tt ? ` at ${tt}` : ''}`, x + 50 * unit, y + 38 * unit, W - 64 * unit);
      ctx.globalAlpha = tm.alpha;
    }
    if (s.log !== false) {
      const evs = tm.edit ? fe.events : past;
      const rowH = 20 * unit, W = 290 * unit, H = 50 * unit + Math.max(1, evs.length) * rowH;
      const [x, y] = panel(ctx, L, frame, unit, W, H, s.position || 'bottom-right');
      ctx.fillStyle = '#fff'; ctx.font = `800 ${12 * unit}px ${UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('GEOFENCE EVENTS', x + 14 * unit, y + 18 * unit);
      ctx.font = `600 ${10 * unit}px ${UI}`; ctx.fillStyle = alarm ? s.alertColor || '#ff1744' : s.fenceColor || '#00e676';
      ctx.textAlign = 'right'; ctx.fillText(`● ${inside ? 'INSIDE' : 'OUTSIDE'}`, x + W - 14 * unit, y + 18 * unit);
      ctx.textAlign = 'left';
      if (!evs.length) { ctx.fillStyle = 'rgba(232,236,244,0.6)'; ctx.font = `600 ${10.5 * unit}px ${UI}`; ctx.fillText(fe.events.length ? 'Monitoring…' : 'The path does not cross the zone', x + 14 * unit, y + 44 * unit); }
      evs.slice(-6).forEach((e, i) => {
        const yy = y + 44 * unit + i * rowH;
        const a = isAlert(rule, e.enter);
        ctx.fillStyle = a ? s.alertColor || '#ff1744' : s.fenceColor || '#00e676';
        rr(ctx, x + 14 * unit, yy - 7 * unit, 46 * unit, 14 * unit, 7 * unit); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `900 ${8.5 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.fillText(e.enter ? 'ENTER' : 'EXIT', x + 37 * unit, yy);
        ctx.textAlign = 'left'; ctx.font = `600 ${10.5 * unit}px ${UI}`; ctx.fillStyle = '#e8ecf4';
        ctx.fillText(`${s.asset || 'Vehicle'} · ${s.name || 'Zone'}`, x + 68 * unit, yy, 140 * unit);
        ctx.textAlign = 'right'; ctx.font = `700 ${10 * unit}px ${MONO}`; ctx.fillStyle = 'rgba(232,236,244,0.75)';
        const tt = clockAt(s, e.f);
        ctx.fillText(tt || `${(e.f * D).toFixed(1)} s`, x + W - 14 * unit, yy);
      });
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- dispatcher
export function drawNet(ctx, L, tm, o, phase) {
  if (!L.geom) return;
  if (L.kind === 'servicearea') drawServiceArea(ctx, L, tm, o, phase);
  else if (L.kind === 'odflow') drawOD(ctx, L, tm, o, phase);
  else if (L.kind === 'netroute') drawRoute(ctx, L, tm, o, phase);
  else if (L.kind === 'geofence') drawGeofence(ctx, L, tm, o, phase);
}
