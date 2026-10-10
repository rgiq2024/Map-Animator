// Geometry helpers: distances, great-circle arcs, mercator math, polyline encoding.

const R = 6371008.8; // mean Earth radius (m)
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

export function haversine(a, b) {
  const [lng1, lat1] = a, [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Make a list of [lng,lat] continuous across the antimeridian (no jumps > 180°). */
export function unwrap(coords) {
  if (!coords.length) return coords;
  const out = [[coords[0][0], coords[0][1]]];
  for (let i = 1; i < coords.length; i++) {
    let lng = coords[i][0];
    const prev = out[i - 1][0];
    while (lng - prev > 180) lng -= 360;
    while (lng - prev < -180) lng += 360;
    out.push([lng, coords[i][1]]);
  }
  return out;
}

/** Great-circle arc between two points, n samples. */
export function greatCircle(a, b, n = 96) {
  const [lng1, lat1] = a.map(toRad), [lng2, lat2] = b.map(toRad);
  const d = haversine(a, b) / R;
  if (d < 1e-9) return [a, b];
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    pts.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  return unwrap(pts);
}

/** A gently curved arc (used for boat / "curve" style) via a quadratic bezier in mercator space. */
export function curvedLine(a, b, bend = 0.18, n = 64) {
  const p0 = toMerc(a), p2 = toMerc(unwrap([a, b])[1]);
  const mx = (p0[0] + p2[0]) / 2, my = (p0[1] + p2[1]) / 2;
  const dx = p2[0] - p0[0], dy = p2[1] - p0[1];
  const p1 = [mx - dy * bend, my + dx * bend];
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push(fromMerc([
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ]));
  }
  return unwrap(pts);
}

/** Web-mercator normalised coordinates (0..1 per world, x may exceed for unwrapped lng). */
export function toMerc([lng, lat]) {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const x = (lng + 180) / 360;
  const y = (180 - toDeg(Math.log(Math.tan(Math.PI / 4 + toRad(clamped) / 2)))) / 360;
  return [x, y];
}
export function fromMerc([x, y]) {
  const lng = x * 360 - 180;
  const y2 = 180 - y * 360;
  const lat = toDeg(2 * Math.atan(Math.exp(toRad(y2))) - Math.PI / 2);
  return [lng, lat];
}

/** Precompute cumulative lengths for a path so we can sample it by fraction. */
export function measure(coords) {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  return { coords, cum, length: cum[cum.length - 1] || 0 };
}

/** Point + index at fraction f (0..1) along a measured path. */
export function sampleAt(m, f) {
  const { coords, cum, length } = m;
  if (coords.length === 1 || length === 0) return { point: coords[0], index: 0 };
  const target = Math.max(0, Math.min(1, f)) * length;
  let lo = 0, hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= target) lo = mid; else hi = mid;
  }
  const seg = cum[hi] - cum[lo];
  const t = seg > 0 ? (target - cum[lo]) / seg : 0;
  const a = coords[lo], b = coords[hi];
  return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], index: lo };
}

export function bounds(coords) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of coords) {
    if (x < w) w = x; if (x > e) e = x;
    if (y < s) s = y; if (y > n) n = y;
  }
  return [[w, s], [e, n]];
}

/** Douglas–Peucker simplification (tolerance in degrees). */
export function simplify(coords, tol = 0.0002) {
  if (coords.length <= 2) return coords;
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack = [[0, coords.length - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0, idx = -1;
    const [x1, y1] = coords[s], [x2, y2] = coords[e];
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = coords[i];
      let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = x1 + t * dx - px, ey = y1 + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol2 && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}

/** Google polyline encoding (precision 5) for compact share links. */
export function encodePolyline(coords) {
  let out = '', pLat = 0, pLng = 0;
  const enc = (v) => {
    v = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
    return s + String.fromCharCode(v + 63);
  };
  for (const [lng, lat] of coords) {
    const la = Math.round(lat * 1e5), ln = Math.round(lng * 1e5);
    out += enc(la - pLat) + enc(ln - pLng);
    pLat = la; pLng = ln;
  }
  return out;
}
export function decodePolyline(str) {
  const coords = [];
  let i = 0, lat = 0, lng = 0;
  const dec = () => {
    let r = 0, s = 0, b;
    do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20);
    return r & 1 ? ~(r >> 1) : r >> 1;
  };
  while (i < str.length) { lat += dec(); lng += dec(); coords.push([lng / 1e5, lat / 1e5]); }
  return coords;
}

export function formatDistance(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  if (m < 100000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000).toLocaleString()} km`;
}

/**
 * Smooth path through control points [{lng,lat,sharp}] (Catmull-Rom in mercator space).
 * Sharp points get straight lines on both sides. Air legs use great-circle arcs.
 * Returns { coords, seg } where seg[i] is the control-segment index of coords[i].
 */
export function smoothPath(points, { air = false, smooth = true } = {}) {
  if (!points.length) return { coords: [], seg: [] };
  const ll = unwrap(points.map((p) => [p.lng, p.lat]));
  if (points.length === 1) return { coords: [ll[0]], seg: [0] };
  const coords = [ll[0]];
  const seg = [0];
  if (air) {
    for (let i = 0; i < ll.length - 1; i++) {
      const gc = greatCircle(ll[i], ll[i + 1], 64);
      // keep continuity with already-unwrapped coordinates
      const shift = Math.round((ll[i][0] - gc[0][0]) / 360) * 360;
      for (let k = 1; k < gc.length; k++) { coords.push([gc[k][0] + shift, gc[k][1]]); seg.push(i); }
    }
    return { coords, seg };
  }
  const m = ll.map(toMerc);
  const n = m.length;
  for (let i = 0; i < n - 1; i++) {
    const p1 = m[i], p2 = m[i + 1];
    const straight = !smooth || (points[i].sharp && points[i + 1].sharp);
    if (straight) { coords.push(ll[i + 1]); seg.push(i); continue; }
    const p0 = i > 0 && !points[i].sharp ? m[i - 1] : [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]];
    const p3 = i < n - 2 && !points[i + 1].sharp ? m[i + 2] : [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]];
    const steps = 24;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      coords.push(s === steps ? ll[i + 1] : fromMerc([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]));
      seg.push(i);
    }
  }
  return { coords, seg };
}

/** Length of a path in web-mercator units (for screen-proportional timing). */
export function mercLength(coords) {
  let s = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = toMerc(coords[i - 1]), b = toMerc(coords[i]);
    s += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return s;
}

/** Heading in degrees (screen, 0 = east, clockwise) between two lng/lat points. */
export function screenHeading(a, b) {
  const ma = toMerc(a), mb = toMerc(b);
  return (Math.atan2(mb[1] - ma[1], mb[0] - ma[0]) * 180) / Math.PI;
}
