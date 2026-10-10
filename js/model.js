// Project model: stops, legs, settings, travel modes, map styles, routing, GPX parsing, serialisation.
import { greatCircle, curvedLine, unwrap, simplify, encodePolyline, decodePolyline } from './geo.js';

export const MODES = {
  car:       { label: 'Car',        icon: '🚗', routing: 'car',  geometry: 'road' },
  bus:       { label: 'Bus',        icon: '🚌', routing: 'car',  geometry: 'road' },
  motorbike: { label: 'Motorbike',  icon: '🏍️', routing: 'car',  geometry: 'road' },
  bike:      { label: 'Bicycle',    icon: '🚲', routing: 'bike', geometry: 'road' },
  walk:      { label: 'Walk / hike', icon: '🚶', routing: 'foot', geometry: 'road' },
  train:     { label: 'Train',      icon: '🚆', routing: null,   geometry: 'curve', bend: 0.06 },
  plane:     { label: 'Plane',      icon: '✈️', routing: null,   geometry: 'arc' },
  boat:      { label: 'Boat / ferry', icon: '⛴️', routing: null, geometry: 'curve', bend: 0.14 },
  jump:      { label: 'No line (jump)', icon: '📍', routing: null, geometry: 'straight', hidden: true },
};

export const STYLES = {
  liberty:   { label: 'Streets',   url: 'https://tiles.openfreemap.org/styles/liberty',  attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors' },
  bright:    { label: 'Bright',    url: 'https://tiles.openfreemap.org/styles/bright',   attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors' },
  positron:  { label: 'Light',     url: 'https://tiles.openfreemap.org/styles/positron', attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors' },
  voyager:   { label: 'Voyager',   url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json', attribution: '© CARTO © OpenStreetMap contributors' },
  dark:      { label: 'Dark',      url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json', attribution: '© CARTO © OpenStreetMap contributors' },
  satellite: {
    label: 'Satellite',
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    style: {
      version: 8,
      sources: {
        sat: {
          type: 'raster', tileSize: 256, maxzoom: 19,
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
        },
      },
      layers: [{ id: 'sat', type: 'raster', source: 'sat' }],
    },
  },
};

export const ASPECTS = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5, '4:3': 4 / 3 };
export const RESOLUTIONS = { 720: '720p', 1080: '1080p', 1440: '1440p', 2160: '4K' };

export function videoSize(aspect, res) {
  const r = ASPECTS[aspect] || 16 / 9;
  // `res` is the length of the short side.
  let w, h;
  if (r >= 1) { h = res; w = Math.round(res * r); } else { w = res; h = Math.round(res / r); }
  return { width: w & ~1, height: h & ~1 };
}

let idCounter = 0;
export const uid = () => `s${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export function defaultSettings() {
  return {
    style: 'liberty',
    aspect: '16:9',
    resolution: 1080,
    fps: 30,
    speed: 1,
    stopSeconds: 1.6,
    introSeconds: 2,
    outroSeconds: 2.5,
    lineColor: '#e8553f',
    lineWidth: 5,
    showUpcoming: true,
    showTitle: true,
    signs: 'current', // 'current' | 'all' | 'none'
    signStyle: 'light', // 'light' | 'dark' | 'color'
    camera: 'follow', // 'follow' | 'fit' | 'close'
    zoomOffset: 0,
    pitch: 0,
    showIcon: true,
  };
}

export function demoProject() {
  const stops = [
    { id: uid(), name: 'Dubai', lng: 55.2708, lat: 25.2048 },
    { id: uid(), name: 'Abu Dhabi', lng: 54.3773, lat: 24.4539 },
    { id: uid(), name: 'Muscat', lng: 58.4059, lat: 23.588 },
    { id: uid(), name: 'Nizwa', lng: 57.5301, lat: 22.9333 },
  ];
  return {
    version: 1,
    title: 'Gulf road trip',
    subtitle: 'UAE & Oman',
    settings: defaultSettings(),
    stops,
    legs: [
      { mode: 'car', coords: null },
      { mode: 'plane', coords: null },
      { mode: 'car', coords: null },
    ],
  };
}

export function emptyProject() {
  return { version: 1, title: 'My trip', subtitle: '', settings: defaultSettings(), stops: [], legs: [] };
}

/** Keep legs array in sync with stops (legs.length === stops.length - 1). */
export function syncLegs(p) {
  const need = Math.max(0, p.stops.length - 1);
  while (p.legs.length < need) p.legs.push({ mode: p.legs.at(-1)?.mode || 'car', coords: null });
  p.legs.length = need;
}

/** Geometry for leg i (unwrapped lng). */
export function legCoords(p, i) {
  const leg = p.legs[i];
  const a = [p.stops[i].lng, p.stops[i].lat];
  const b = [p.stops[i + 1].lng, p.stops[i + 1].lat];
  if (leg.coords && leg.coords.length > 1) return unwrap(leg.coords);
  const mode = MODES[leg.mode] || MODES.car;
  if (mode.geometry === 'arc') return greatCircle(a, b);
  if (mode.geometry === 'curve') return curvedLine(a, b, mode.bend ?? 0.1);
  return unwrap([a, b]);
}

/** Make all legs continuous with each other in longitude (for trips crossing the antimeridian). */
export function allLegCoords(p) {
  const out = [];
  let shift = 0;
  for (let i = 0; i < p.legs.length; i++) {
    let c = legCoords(p, i);
    if (out.length) {
      const prevEnd = out.at(-1).at(-1)[0];
      shift = Math.round((prevEnd - c[0][0]) / 360) * 360;
    } else shift = 0;
    if (shift) c = c.map(([x, y]) => [x + shift, y]);
    out.push(c);
  }
  return out;
}

// ---------- Routing (public OSRM instances run by FOSSGIS on routing.openstreetmap.de) ----------
const ROUTERS = {
  car: 'https://routing.openstreetmap.de/routed-car/route/v1/driving/',
  bike: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving/',
  foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/',
};
const routeCache = new Map();

export async function fetchRoute(profile, a, b) {
  const key = `${profile}|${a.join(',')}|${b.join(',')}`;
  if (routeCache.has(key)) return routeCache.get(key);
  const url = `${ROUTERS[profile]}${a[0]},${a[1]};${b[0]},${b[1]}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  const json = await res.json();
  if (json.code !== 'Ok' || !json.routes?.length) throw new Error('No route found');
  const coords = simplify(json.routes[0].geometry.coordinates, 0.00005);
  routeCache.set(key, coords);
  return coords;
}

// ---------- Geocoding (Nominatim) ----------
export async function geocode(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'Accept-Language': navigator.language || 'en' } });
  if (!res.ok) throw new Error('Search failed');
  return (await res.json()).map((r) => ({
    name: r.name || r.display_name.split(',')[0],
    detail: r.display_name,
    lng: +r.lon,
    lat: +r.lat,
  }));
}

export async function reverseGeocode(lng, lat, zoom = 10) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=${Math.round(zoom)}&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { 'Accept-Language': navigator.language || 'en' } });
    if (!res.ok) return null;
    const j = await res.json();
    const a = j.address || {};
    return j.name || a.city || a.town || a.village || a.hamlet || a.suburb || a.county || a.state || a.country || null;
  } catch { return null; }
}

// ---------- GPX ----------
export function parseGPX(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Not a valid GPX file');
  const tracks = [];
  for (const seg of doc.getElementsByTagName('trkseg')) {
    const pts = [...seg.getElementsByTagName('trkpt')].map((n) => [+n.getAttribute('lon'), +n.getAttribute('lat')]);
    if (pts.length > 1) tracks.push(pts);
  }
  if (!tracks.length) {
    for (const rte of doc.getElementsByTagName('rte')) {
      const pts = [...rte.getElementsByTagName('rtept')].map((n) => [+n.getAttribute('lon'), +n.getAttribute('lat')]);
      if (pts.length > 1) tracks.push(pts);
    }
  }
  const wpts = [...doc.getElementsByTagName('wpt')].map((n) => ({
    lng: +n.getAttribute('lon'), lat: +n.getAttribute('lat'),
    name: n.getElementsByTagName('name')[0]?.textContent?.trim() || '',
  }));
  if (!tracks.length && wpts.length < 2) throw new Error('No track found in GPX file');
  const name = doc.querySelector('metadata > name, trk > name')?.textContent?.trim();
  return { tracks, wpts, name };
}

// ---------- Serialisation / share links ----------
export function serialize(p, { compact = false } = {}) {
  return {
    v: 1,
    title: p.title,
    subtitle: p.subtitle,
    settings: p.settings,
    stops: p.stops.map((s) => ({ n: s.name, x: +s.lng.toFixed(5), y: +s.lat.toFixed(5), l: s.label || undefined, h: s.hideSign || undefined })),
    legs: p.legs.map((l) => ({
      m: l.mode,
      c: l.coords ? encodePolyline(compact ? simplify(l.coords, 0.0001) : l.coords) : undefined,
      g: l.gpx || undefined,
      s: l.seconds || undefined,
    })),
  };
}

export function deserialize(o) {
  const p = {
    version: 1,
    title: o.title ?? 'My trip',
    subtitle: o.subtitle ?? '',
    settings: { ...defaultSettings(), ...(o.settings || {}) },
    stops: (o.stops || []).map((s) => ({ id: uid(), name: s.n ?? '', lng: +s.x, lat: +s.y, label: s.l || '', hideSign: !!s.h })),
    legs: (o.legs || []).map((l) => ({ mode: MODES[l.m] ? l.m : 'car', coords: l.c ? decodePolyline(l.c) : null, gpx: !!l.g, seconds: l.s || null })),
  };
  syncLegs(p);
  return p;
}

const b64url = {
  enc: (bytes) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
};

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function toShareHash(p) {
  const json = new TextEncoder().encode(JSON.stringify(serialize(p, { compact: true })));
  if ('CompressionStream' in window) {
    const z = await pipe(json, new CompressionStream('deflate-raw'));
    let s = '';
    for (let i = 0; i < z.length; i += 0x8000) s += String.fromCharCode(...z.subarray(i, i + 0x8000));
    return 'z=' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  return 'j=' + b64url.enc(json);
}

export async function fromShareHash(hash) {
  const h = hash.replace(/^#/, '');
  const params = new URLSearchParams(h);
  let bytes;
  if (params.get('z')) bytes = await pipe(b64url.dec(params.get('z')), new DecompressionStream('deflate-raw'));
  else if (params.get('j')) bytes = b64url.dec(params.get('j'));
  else return null;
  return deserialize(JSON.parse(new TextDecoder().decode(bytes)));
}
