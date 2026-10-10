// Network services: place search (Nominatim) and road snapping (FOSSGIS OSRM).
import { simplify } from './geo.js';

export async function geocode(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=7&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'Accept-Language': navigator.language || 'en' } });
  if (!res.ok) throw new Error('Search failed');
  return (await res.json()).map((r) => ({
    name: r.name || r.display_name.split(',')[0],
    detail: r.display_name,
    lng: +r.lon,
    lat: +r.lat,
    bbox: r.boundingbox ? [[+r.boundingbox[2], +r.boundingbox[0]], [+r.boundingbox[3], +r.boundingbox[1]]] : null,
  }));
}

const ROUTERS = {
  car: 'https://routing.openstreetmap.de/routed-car/route/v1/driving/',
  bike: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving/',
  foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/',
};
const cache = new Map();

/** Route along roads/paths through all points (max 25 waypoints are sent). */
export async function snapRoute(profile, points) {
  let pts = points.map((p) => [p.lng, p.lat]);
  if (pts.length > 25) {
    const step = (pts.length - 1) / 24;
    pts = Array.from({ length: 25 }, (_, i) => pts[Math.round(i * step)]);
  }
  const key = `${profile}|${pts.map((p) => p.map((v) => v.toFixed(5)).join(',')).join(';')}`;
  if (cache.has(key)) return cache.get(key);
  const url = `${ROUTERS[profile]}${pts.map((p) => `${p[0]},${p[1]}`).join(';')}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  const json = await res.json();
  if (json.code !== 'Ok' || !json.routes?.length) throw new Error('No route found along roads');
  const coords = simplify(json.routes[0].geometry.coordinates, 0.00004);
  cache.set(key, coords);
  return coords;
}
