// Builds a deterministic timeline from a project: segment timing, camera keyframes and traveller state.
import { toMerc, fromMerc, measure, sampleAt, bounds, haversine } from './geo.js';
import { MODES, allLegCoords } from './model.js';

const TILE = 512;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const easeInOut = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;

/** Camera that fits [[w,s],[e,n]] into a w×h viewport (CSS px). */
export function fitCamera(b, vw, vh, padFrac = 0.16) {
  const [x0, y1] = toMerc(b[0]);
  const [x1, y0] = toMerc(b[1]);
  const pad = Math.min(vw, vh) * padFrac + 24;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const zx = dx > 1e-12 ? Math.log2((vw - 2 * pad) / (dx * TILE)) : 22;
  const zy = dy > 1e-12 ? Math.log2((vh - 2 * pad) / (dy * TILE)) : 22;
  const zoom = clamp(Math.min(zx, zy), 0.5, 15.5);
  return { center: fromMerc([(x0 + x1) / 2, (y0 + y1) / 2]), zoom };
}

function lerpMerc(a, b, k) {
  const ma = toMerc(a), mb = toMerc(b);
  return fromMerc([ma[0] + (mb[0] - ma[0]) * k, ma[1] + (mb[1] - ma[1]) * k]);
}

/** Smooth zoom-aware interpolation between two camera poses (keeps the target steady while zooming). */
function interpSimple(c0, c1, u) {
  const s0 = 2 ** -c0.zoom, s1 = 2 ** -c1.zoom;
  const s = s0 ** (1 - u) * s1 ** u;
  const k = Math.abs(s0 - s1) < 1e-12 ? u : (s0 - s) / (s0 - s1);
  return {
    center: lerpMerc(c0.center, c1.center, k),
    zoom: -Math.log2(s),
    pitch: c0.pitch + (c1.pitch - c0.pitch) * u,
    bearing: c0.bearing + (c1.bearing - c0.bearing) * u,
  };
}

/** Like interpSimple, but zooms out in the middle when the two views are far apart (flyTo feel). */
function makeTransition(c0, c1, vw, vh) {
  const m0 = toMerc(c0.center), m1 = toMerc(c1.center);
  const distWorld = Math.hypot(m1[0] - m0[0], m1[1] - m0[1]);
  const zmin = Math.min(c0.zoom, c1.zoom);
  const distPx = distWorld * TILE * 2 ** zmin;
  if (distPx < Math.max(vw, vh) * 1.2) return (u) => interpSimple(c0, c1, u);
  const mid = fitCamera([[Math.min(c0.center[0], c1.center[0]), Math.min(c0.center[1], c1.center[1])],
    [Math.max(c0.center[0], c1.center[0]), Math.max(c0.center[1], c1.center[1])]], vw, vh, 0.22);
  mid.zoom = Math.min(mid.zoom, zmin);
  mid.pitch = (c0.pitch + c1.pitch) / 2;
  mid.bearing = (c0.bearing + c1.bearing) / 2;
  return (u) => (u < 0.5 ? interpSimple(c0, mid, u * 2) : interpSimple(mid, c1, (u - 0.5) * 2));
}

export function legSeconds(lengthM, mode, speed) {
  if (mode === 'jump') return 1.4 / speed;
  const km = lengthM / 1000;
  return clamp(2.2 + 2.1 * Math.log10(1 + km), 2, 14) / speed;
}

/**
 * Build the timeline for a project, for a viewport of vw×vh CSS pixels.
 * Returns { total, segments, legs, stopTimes, cameraAt(t), stateAt(t) }.
 */
export function buildTimeline(p, vw, vh) {
  const s = p.settings;
  const speed = clamp(+s.speed || 1, 0.1, 10);
  const pitch = clamp(+s.pitch || 0, 0, 70);
  const zoomOffset = +s.zoomOffset || 0;
  const coordsList = allLegCoords(p);
  const legs = coordsList.map((coords, i) => {
    const m = measure(coords);
    const mode = p.legs[i].mode;
    const b = bounds(coords);
    const fit = fitCamera(b, vw, vh);
    return {
      i, mode, coords, m, fit,
      icon: (MODES[mode] || MODES.car).icon,
      hidden: !!(MODES[mode] || {}).hidden,
      seconds: p.legs[i].seconds ? +p.legs[i].seconds / speed : legSeconds(m.length || haversine(coords[0], coords.at(-1)), mode, speed),
    };
  });

  const stopsLL = p.stops.map((st, j) => {
    // Use the unwrapped leg endpoints so stops line up with the drawn route.
    if (j === 0) return legs[0] ? legs[0].coords[0] : [st.lng, st.lat];
    return legs[j - 1].coords.at(-1);
  });

  // Overview of everything.
  const all = legs.flatMap((l) => l.coords);
  if (!all.length) stopsLL.forEach((c) => all.push(c));
  const overview = all.length
    ? { ...fitCamera(bounds(all), vw, vh, 0.12), pitch: 0, bearing: 0 }
    : { center: [0, 20], zoom: 1.5, pitch: 0, bearing: 0 };
  if (all.length === 1) overview.zoom = 10;

  const camMode = s.camera || 'follow';
  const legCam = (L, f) => {
    const { point } = sampleAt(L.m, f);
    const mode = p.legs[L.i].camera && p.legs[L.i].camera !== 'auto' ? p.legs[L.i].camera : camMode;
    if (mode === 'fit') return { center: L.fit.center, zoom: L.fit.zoom + zoomOffset, pitch, bearing: 0 };
    if (mode === 'close') return { center: point, zoom: clamp(L.fit.zoom + 1.8 + zoomOffset, 1, 16.5), pitch, bearing: 0 };
    // follow: blend between fitting the whole leg and centring on the traveller
    return { center: lerpMerc(L.fit.center, point, 0.6), zoom: clamp(L.fit.zoom - 0.25 + zoomOffset, 0.5, 16.5), pitch, bearing: 0 };
  };

  // ---- segments ----
  const segments = [];
  let t = 0;
  const push = (seg) => { seg.start = t; seg.end = t + seg.dur; segments.push(seg); t = seg.end; };
  const intro = Math.max(0, +s.introSeconds || 0);
  const outro = Math.max(0, +s.outroSeconds || 0);
  const stopDur = Math.max(0, +s.stopSeconds || 0);

  const stopTimes = [0];
  if (!legs.length) {
    push({ type: 'hold', dur: Math.max(intro + outro, 2), cam: overview });
  } else {
    const firstCam = legCam(legs[0], 0);
    if (intro > 0) push({ type: 'intro', dur: intro, from: overview, to: firstCam, tr: makeTransition(overview, firstCam, vw, vh) });
    legs.forEach((L, i) => {
      push({ type: 'leg', dur: L.seconds, leg: i });
      stopTimes[i + 1] = t;
      const endCam = legCam(L, 1);
      if (i < legs.length - 1) {
        const nextCam = legCam(legs[i + 1], 0);
        push({ type: 'stop', dur: Math.max(stopDur, 0.6), leg: i, from: endCam, to: nextCam, tr: makeTransition(endCam, nextCam, vw, vh) });
      } else {
        if (stopDur > 0) push({ type: 'stop', dur: stopDur, leg: i, from: endCam, to: endCam, tr: () => endCam });
        if (outro > 0) push({ type: 'outro', dur: outro, leg: i, from: endCam, to: overview, tr: makeTransition(endCam, overview, vw, vh) });
      }
    });
  }
  const total = Math.max(t, 0.1);

  const segAt = (time) => {
    for (const seg of segments) if (time < seg.end) return seg;
    return segments.at(-1);
  };

  function cameraAt(time) {
    const seg = segAt(clamp(time, 0, total));
    const u = seg.dur > 0 ? clamp((time - seg.start) / seg.dur, 0, 1) : 1;
    switch (seg.type) {
      case 'hold': return seg.cam;
      case 'intro': return seg.tr(easeInOut((u - 0.35) / 0.65));
      case 'leg': return legCam(legs[seg.leg], easeInOut(u));
      case 'stop': return seg.tr(easeInOut((u - 0.35) / 0.65));
      case 'outro': return seg.tr(easeInOut(u / 0.7));
      default: return overview;
    }
  }

  function stateAt(time) {
    time = clamp(time, 0, total);
    const seg = segAt(time);
    const u = seg.dur > 0 ? clamp((time - seg.start) / seg.dur, 0, 1) : 1;
    let legIndex = 0, f = 0, reached = 0;
    if (seg.type === 'leg') { legIndex = seg.leg; f = easeInOut(u); reached = seg.leg; }
    else if (seg.type === 'stop' || seg.type === 'outro') { legIndex = seg.leg; f = 1; reached = seg.leg + 1; }
    const L = legs[legIndex];
    const point = L ? sampleAt(L.m, f) : { point: stopsLL[0] || [0, 0], index: 0 };
    // Title: visible during intro, fades during the first second of travel, returns in the outro.
    let titleAlpha = 0;
    const firstLegStart = segments.find((x) => x.type === 'leg')?.start ?? 0;
    if (time < firstLegStart) titleAlpha = 1;
    else titleAlpha = 1 - clamp((time - firstLegStart) / 1.0, 0, 1);
    if (seg.type === 'outro') titleAlpha = Math.max(titleAlpha, easeOut((u - 0.5) / 0.4));
    if (seg.type === 'hold') titleAlpha = 1;
    return { seg, legIndex, f, reached, point: point.point, index: point.index, titleAlpha, legs, stopsLL, stopTimes };
  }

  return { total, segments, legs, stopsLL, stopTimes, overview, cameraAt, stateAt };
}
