// Scene model → geometry, timeline, camera and per-frame state. Pure functions, no DOM.
import { smoothPath, unwrap, measure, sampleAt, bounds, toMerc, fromMerc, mercLength, screenHeading, haversine } from './geo.js';
import { modeOf, lineStyleOf } from './modes.js';

const TILE = 512;
export const REF_W = 1000; // camera zooms are stored for a 1000-px-wide frame
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const easeInOut = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const softEase = (u) => 0.45 * clamp(u, 0, 1) + 0.55 * easeInOut(u);

export const zoomFor = (zoomRef, frameW) => zoomRef + Math.log2(frameW / REF_W);
export const zoomRefFor = (zoom, frameW) => zoom - Math.log2(frameW / REF_W);

/** Camera {center, zoom} fitting bounds into a w×h frame. */
export function fitCamera(b, vw, vh, padFrac = 0.14) {
  const [x0, y1] = toMerc(b[0]);
  const [x1, y0] = toMerc(b[1]);
  const pad = Math.min(vw, vh) * padFrac + 16;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const zx = dx > 1e-12 ? Math.log2((vw - 2 * pad) / (dx * TILE)) : 22;
  const zy = dy > 1e-12 ? Math.log2((vh - 2 * pad) / (dy * TILE)) : 22;
  const zoom = clamp(Math.min(zx, zy), 0.3, 15);
  return { center: fromMerc([(x0 + x1) / 2, (y0 + y1) / 2]), zoom };
}

function lerpMerc(a, b, k) {
  const ma = toMerc(a), mb = toMerc(b);
  return fromMerc([ma[0] + (mb[0] - ma[0]) * k, ma[1] + (mb[1] - ma[1]) * k]);
}
const lerpAngle = (a, b, k) => {
  let d = ((b - a + 540) % 360) - 180;
  return a + d * k;
};

/** Zoom-aware interpolation between two camera poses (keeps targets steady while zooming). */
export function interpView(c0, c1, u) {
  const s0 = 2 ** -c0.zoom, s1 = 2 ** -c1.zoom;
  const s = s0 ** (1 - u) * s1 ** u;
  const k = Math.abs(s0 - s1) < 1e-12 ? u : (s0 - s) / (s0 - s1);
  return {
    center: lerpMerc(c0.center, c1.center, k),
    zoom: -Math.log2(s),
    bearing: lerpAngle(c0.bearing || 0, c1.bearing || 0, u),
    pitch: (c0.pitch || 0) + ((c1.pitch || 0) - (c0.pitch || 0)) * u,
  };
}

export const pointsKey = (leg) => `${leg.mode}|${leg.points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';')}`;

/** Dense geometry for one leg. */
export function legGeometry(leg) {
  const mode = modeOf(leg);
  if (leg.track && leg.track.length > 1) {
    const coords = unwrap(leg.track);
    return { coords, seg: coords.map(() => 0), ctrl: [0, coords.length - 1] };
  }
  if (leg.snap && leg.snapped && leg.snapKey === pointsKey(leg) && !mode.air) {
    const coords = unwrap(leg.snapped);
    // control points map to the closest dense points
    const ctrl = leg.points.map((p, i) => (i === 0 ? 0 : i === leg.points.length - 1 ? coords.length - 1 : nearestIndex(coords, [p.lng, p.lat])));
    const seg = coords.map((_, k) => { let s = 0; while (s < ctrl.length - 2 && k > ctrl[s + 1]) s++; return s; });
    return { coords, seg, ctrl };
  }
  const { coords, seg } = smoothPath(leg.points, { air: !!mode.air, smooth: leg.smooth !== false });
  // control point i+1 is the last dense point of segment i
  const ctrl = [0];
  for (let q = 1; q < seg.length; q++) ctrl[seg[q] + 1] = q;
  return { coords, seg, ctrl };
}

function nearestIndex(coords, p) {
  const mp = toMerc(p);
  let best = 0, bd = Infinity;
  coords.forEach((c, i) => {
    const m = toMerc(c);
    const d = (m[0] - mp[0]) ** 2 + (m[1] - mp[1]) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

export function routeStats(scene) {
  let pts = 0, dist = 0;
  scene.legs.forEach((leg, i) => {
    pts += leg.track ? leg.track.length : leg.points.length - (i > 0 && leg.points.length ? 1 : 0);
    const g = legGeometry(leg);
    for (let k = 1; k < g.coords.length; k++) dist += haversine(g.coords[k - 1], g.coords[k]);
  });
  return { points: pts, distance: dist };
}

/**
 * Build everything needed to render a scene in a frame of fw×fh CSS px.
 */
export function buildScene(scene, fw, fh) {
  // ---- geometry ----
  const legs = [];
  let prevEnd = null;
  scene.legs.forEach((leg, li) => {
    const g = legGeometry(leg);
    if (!g.coords.length) return;
    let coords = g.coords;
    if (prevEnd) {
      const shift = Math.round((prevEnd[0] - coords[0][0]) / 360) * 360;
      if (shift) coords = coords.map(([x, y]) => [x + shift, y]);
    }
    const m = measure(coords);
    legs.push({
      li, leg, coords, seg: g.seg, ctrl: g.ctrl, m,
      mode: modeOf(leg), style: lineStyleOf(leg),
      color: leg.color || scene.look.lineColor,
      merc: mercLength(coords),
    });
    prevEnd = coords.at(-1);
  });
  const drawable = legs.filter((L) => L.coords.length > 1);
  const all = legs.flatMap((L) => L.coords);

  // ---- fit view ----
  let fit;
  if (all.length > 1) {
    const c = fitCamera(bounds(all), fw, fh);
    fit = { center: c.center, zoomRef: zoomRefFor(c.zoom, fw), bearing: 0, pitch: 0 };
  } else if (all.length === 1) fit = { center: all[0], zoomRef: zoomRefFor(10, fw), bearing: 0, pitch: 0 };
  else fit = null;

  // ---- runs (pieces of line between pauses / leg ends) ----
  const runs = [];
  for (const L of drawable) {
    const cuts = [0];
    const pauses = [0];
    L.leg.points.forEach((p, i) => {
      if (i > 0 && i < L.leg.points.length - 1 && p.pause > 0 && !L.leg.track) {
        cuts.push(L.m.cum[L.ctrl[i]] ?? 0);
        pauses.push(+p.pause);
      }
    });
    cuts.push(L.m.length);
    const lastP = L.leg.points.at(-1);
    pauses.push(lastP && lastP.pause > 0 ? +lastP.pause : 0);
    for (let k = 0; k < cuts.length - 1; k++) {
      const a = cuts[k], b = cuts[k + 1];
      const frac = L.m.length > 0 ? (b - a) / L.m.length : 1;
      runs.push({ L, from: a, to: b, weight: Math.max(1e-9, (L.merc * frac)) ** 0.75, pauseAfter: pauses[k + 1] || 0 });
    }
  }
  const firstPause = scene.legs[0]?.points[0]?.pause > 0 ? +scene.legs[0].points[0].pause : 0;
  const lineSeconds = Math.max(0.5, +scene.lineSeconds || 5);
  const wsum = runs.reduce((s, r) => s + r.weight, 0) || 1;
  const stillStart = Math.max(0, +scene.stillStart || 0);
  const stillEnd = Math.max(0, +scene.stillEnd || 0);
  let t = stillStart + firstPause;
  for (const r of runs) {
    r.dur = (lineSeconds * r.weight) / wsum;
    r.start = t;
    r.end = t + r.dur;
    t = r.end + r.pauseAfter;
  }
  const drawStart = stillStart;
  const drawEnd = runs.length ? t : stillStart;
  const total = Math.max(0.5, drawEnd + stillEnd);

  // cumulative offsets so progress is one number across legs
  let off = 0;
  for (const L of drawable) { L.offset = off; off += L.m.length; }
  const routeLen = off;

  function progressAt(time) {
    if (!runs.length) return { L: drawable[0] || legs[0] || null, dist: 0, drawn: 0, started: false, finished: !drawable.length };
    if (time <= runs[0].start) return { L: runs[0].L, dist: runs[0].from, drawn: runs[0].L.offset + runs[0].from, started: false, finished: false };
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      const nextStart = runs[i + 1] ? runs[i + 1].start : Infinity;
      if (time < r.end) {
        const u = softEase((time - r.start) / r.dur);
        const dist = r.from + (r.to - r.from) * u;
        return { L: r.L, dist, drawn: r.L.offset + dist, started: true, finished: false, moving: true };
      }
      if (time < nextStart) {
        const done = i === runs.length - 1;
        return { L: r.L, dist: r.to, drawn: r.L.offset + r.to, started: true, finished: done, paused: !done };
      }
    }
    const r = runs.at(-1);
    return { L: r.L, dist: r.to, drawn: routeLen, started: true, finished: true };
  }

  function headingAt(L, dist) {
    const span = Math.max(L.m.length * 0.004, 1);
    const a = sampleAt(L.m, (dist - span) / (L.m.length || 1)).point;
    const b = sampleAt(L.m, (dist + span) / (L.m.length || 1)).point;
    if (a[0] === b[0] && a[1] === b[1]) return 0;
    return screenHeading(a, b);
  }

  function stateAt(time) {
    const p = progressAt(time);
    if (!p.L) return { ...p, point: null, heading: 0 };
    const s = sampleAt(p.L.m, p.L.m.length ? p.dist / p.L.m.length : 0);
    return { ...p, point: s.point, index: s.index, heading: headingAt(p.L, p.dist) };
  }

  // ---- camera ----
  const cam = scene.camera || {};
  const tilt = +cam.tilt || 0;
  const toCam = (v) => v && { center: v.center, zoom: zoomFor(v.zoomRef, fw), bearing: v.bearing || 0, pitch: tilt };
  const fixedV = toCam(cam.fixed || fit) || { center: [0, 20], zoom: 1, bearing: 0, pitch: tilt };
  const startV = toCam(cam.start || cam.fixed || fit) || fixedV;
  const endV = toCam(cam.end || cam.start || cam.fixed || fit) || startV;
  const followZoom = zoomFor(cam.followZoomRef ?? ((fit?.zoomRef ?? 3) + 2), fw);
  let smoothBearing = null;

  function cameraAt(time) {
    if (cam.mode === 'startEnd') {
      const u = drawEnd > drawStart ? easeInOut((time - drawStart) / (drawEnd - drawStart)) : (time > drawStart ? 1 : 0);
      return interpView(startV, endV, u);
    }
    if (cam.mode === 'follow' && drawable.length) {
      const st = stateAt(time);
      let bearing = 0;
      if (cam.followRotate) {
        // look a little ahead and behind so the map turns gently
        const L = st.L;
        const span = Math.max(L.m.length * 0.06, 1);
        const a = sampleAt(L.m, clamp((st.dist - span) / L.m.length, 0, 1)).point;
        const b = sampleAt(L.m, clamp((st.dist + span) / L.m.length, 0, 1)).point;
        bearing = (a[0] === b[0] && a[1] === b[1]) ? (smoothBearing ?? 0) : screenHeading(a, b) + 90;
        smoothBearing = bearing;
      }
      return { center: st.point, zoom: followZoom, bearing, pitch: tilt };
    }
    return fixedV;
  }

  // ---- signs: when do they appear? ----
  const signTimes = (scene.signs || []).map((sg) => {
    if (sg.appear === 'start' || !drawable.length) return 0;
    if (sg.appear === 'end') return drawEnd;
    // nearest point on the route
    const mp = toMerc([sg.lng, sg.lat]);
    let best = null, bd = Infinity;
    for (const L of drawable) {
      for (let i = 0; i < L.coords.length; i++) {
        const m = toMerc(L.coords[i]);
        const d = (m[0] - mp[0]) ** 2 + (m[1] - mp[1]) ** 2;
        if (d < bd) { bd = d; best = L.offset + L.m.cum[i]; }
      }
    }
    // far from the route → show from the start
    const b = bounds(all);
    const [x0, y1] = toMerc(b[0]), [x1, y0] = toMerc(b[1]);
    const size = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1e-6);
    if (Math.sqrt(bd) > size * 0.25) return 0;
    // find first time progress reaches `best`
    let lo = 0, hi = drawEnd;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (progressAt(mid).drawn >= best - 1e-6) hi = mid; else lo = mid;
    }
    return Math.max(drawStart, hi - 0.15);
  });

  return { legs, drawable, runs, total, drawStart, drawEnd, stillStart, stillEnd, routeLen, fit, stateAt, cameraAt, signTimes, fw, fh };
}

/** Default scene settings. */
export function newScene(name = 'Scene 1', look) {
  return {
    id: `sc_${Math.random().toString(36).slice(2, 10)}`,
    name,
    legs: [{ id: legId(), mode: 'line', points: [] }],
    look: look ? JSON.parse(JSON.stringify(look)) : defaultLook(),
    signs: [],
    signSize: 1,
    camera: { mode: 'fixed', fixed: null, start: null, end: null, followZoomRef: null, followRotate: false, tilt: 0 },
    lineSeconds: 5,
    stillStart: 0.5,
    stillEnd: 1.5,
  };
}
export const legId = () => `lg_${Math.random().toString(36).slice(2, 9)}`;
export function defaultLook() {
  return {
    theme: 'classic', placeNames: true, lang: 'default', states: false, terrain: false, terrainExaggeration: 1.4,
    lineColor: '#ff4a2b', lineWidth: 5, outline: true, symbol: 'auto', symbolSize: 1, symbol3d: true, compass: false,
  };
}
