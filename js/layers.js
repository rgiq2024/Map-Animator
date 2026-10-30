// Map layers that animate: boundaries, areas, floods, lines, points / animated symbols, text labels and
// on-screen captions. Everything is drawn on the 2D overlay from GeoJSON-style geometry in lng/lat.
// (Terrain-based rising floods are rendered by flood.js inside the map itself.)
import { simplify, toMerc } from './geo.js';
import { signImage } from './signs.js';
import { placeAt, setBoxSink } from './place.js';
import { FX_KINDS, FX_ANIMS, FX_DEFAULTS, drawFX, fxPhases, issTrack } from './fx.js';
import { drawSprite } from './sprites.js';

const UI = '"Inter","Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif';
const DISPLAY = '"Archivo","Inter",system-ui,sans-serif';
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const easeOutBack = (u) => { u = clamp(u, 0, 1); const c = 1.7; return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; };
const bounceOut = (u) => {
  u = clamp(u, 0, 1);
  const n = 7.5625, d = 2.75;
  if (u < 1 / d) return n * u * u;
  if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75;
  if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375;
  return n * (u -= 2.625 / d) * u + 0.984375;
};

// ------------------------------------------------------------------ fonts
export const FONTS = {
  '': 'Default',
  Archivo: 'Archivo', Inter: 'Inter', Montserrat: 'Montserrat', Poppins: 'Poppins', Raleway: 'Raleway', 'Space Grotesk': 'Space Grotesk',
  Oswald: 'Oswald (condensed)', 'Bebas Neue': 'Bebas Neue (tall caps)', Anton: 'Anton (heavy)',
  'Playfair Display': 'Playfair Display (serif)', Merriweather: 'Merriweather (serif)', Lora: 'Lora (serif)', 'Roboto Slab': 'Roboto Slab', Cinzel: 'Cinzel (classic)',
  Lobster: 'Lobster (script)', Pacifico: 'Pacifico (script)', 'Dancing Script': 'Dancing Script', Caveat: 'Caveat (handwritten)', 'Permanent Marker': 'Permanent Marker', 'Special Elite': 'Special Elite (typewriter)',
  Cairo: 'Cairo (العربية)', Tajawal: 'Tajawal (العربية)', 'Noto Sans Devanagari': 'Noto Sans Devanagari (हिन्दी / मराठी)', 'Noto Sans': 'Noto Sans (many scripts)',
};
/** CSS font-family for a chosen font, with a sensible fallback. */
export const fam = (font, fallback) => (font ? `"${font}", ${fallback}` : fallback);
/** Make sure every font used in a scene is downloaded before drawing it on canvas. */
export async function loadFonts(scene) {
  if (!document.fonts?.load) return;
  const want = new Set(['Archivo', 'Inter', 'Caveat']);
  for (const L of scene.layers || []) if (L.style?.font) want.add(L.style.font);
  for (const sg of scene.signs || []) if (sg.font) want.add(sg.font);
  await Promise.all([...want].flatMap((f) => [`400 24px "${f}"`, `700 24px "${f}"`, `900 24px "${f}"`].map((spec) => document.fonts.load(spec).catch(() => {}))));
}

// ------------------------------------------------------------------ catalogue
export const LAYER_KINDS = {
  boundary: { name: 'Boundary', icon: '⬡', geom: 'polygon', desc: 'Outline of a country, city or any region' },
  area:     { name: 'Area', icon: '▰', geom: 'polygon', desc: 'Filled shape' },
  flood:    { name: 'Flood', icon: '🌊', geom: 'polygon', desc: 'Water spreading or rising over an area' },
  line:     { name: 'Line', icon: '╱', geom: 'line', desc: 'A path, river, border or arrow' },
  point:    { name: 'Point', icon: '◉', geom: 'point', desc: 'Marker with an animated effect' },
  label:    { name: 'Text on map', icon: 'T', geom: 'point', desc: 'A label that stays on its map spot' },
  caption:  { name: 'Caption', icon: '▭', geom: null, desc: 'Title or text on screen' },
  ...FX_KINDS,
};

export const ANIMS = {
  boundary: { draw: 'Trace the outline', fade: 'Fade in', grow: 'Grow from the centre', wipe: 'Wipe across', flash: 'Flash, then stay', pulse: 'Glowing pulse', none: 'No animation' },
  area: { fade: 'Fade in', draw: 'Trace, then fill', grow: 'Grow from the centre', wipe: 'Wipe across', flash: 'Flash, then stay', pulse: 'Glowing pulse', none: 'No animation' },
  flood: { spread: 'Spread from a point', rise: 'Rise and fill', wipe: 'Flow in from a side', terrain: 'Rising water on real terrain', none: 'Already flooded' },
  line: { draw: 'Draw along', fade: 'Fade in', flow: 'Flowing dashes', none: 'No animation' },
  point: { pop: 'Pop in', drop: 'Drop in', fade: 'Fade in', none: 'No animation' },
  label: { fade: 'Fade in', typewriter: 'Typewriter', slideUp: 'Slide up', pop: 'Pop in', none: 'No animation' },
  caption: { slide: 'Slide in', fade: 'Fade in', typewriter: 'Typewriter', pop: 'Pop in', wipe: 'Wipe', none: 'No animation' },
  ...FX_ANIMS,
};

export const EFFECTS = { none: 'None', pulse: 'Pulse rings', ripple: 'Water ripple', radar: 'Radar sweep', bounce: 'Bounce', float: 'Float', spin: 'Spin', shake: 'Shake', blink: 'Blink', heartbeat: 'Heartbeat', flicker: 'Flicker' };
export const MARKERS = { dot: 'Dot', pin: 'Pin', emoji: 'Emoji', sprite: '3D vehicle', image: 'Your image / icon', target: 'Target', ring: 'Ring' };
export const CAPTION_LAYOUTS = { lowerThird: 'Lower third', title: 'Big title', card: 'Card', band: 'Band', plain: 'Plain text' };
export const POSITIONS = { 'top-left': 'Top left', top: 'Top', 'top-right': 'Top right', center: 'Centre', 'bottom-left': 'Bottom left', bottom: 'Bottom', 'bottom-right': 'Bottom right', custom: 'Anywhere (drag it on the video)' };

/** Animated symbol presets (all are point layers). */
export const SYMBOL_PRESETS = {
  pulse:    { name: 'Pulse', marker: 'dot', color: '#ff4a2b', effect: 'pulse' },
  ripple:   { name: 'Ripple', marker: 'ring', color: '#2f8fe0', effect: 'ripple' },
  radar:    { name: 'Radar', marker: 'dot', color: '#2fbf71', effect: 'radar' },
  target:   { name: 'Target', marker: 'target', color: '#ff3b30', effect: 'spin' },
  pin:      { name: 'Bouncing pin', marker: 'pin', color: '#ff4a2b', effect: 'bounce' },
  fire:     { name: 'Fire', marker: 'emoji', emoji: '🔥', color: '#ff7a1a', effect: 'flicker' },
  warning:  { name: 'Warning', marker: 'emoji', emoji: '⚠️', color: '#ffd21f', effect: 'blink' },
  storm:    { name: 'Storm', marker: 'emoji', emoji: '⛈️', color: '#5b6b8a', effect: 'shake' },
  flood:    { name: 'Flood', marker: 'emoji', emoji: '🌊', color: '#2f8fe0', effect: 'float' },
  quake:    { name: 'Earthquake', marker: 'emoji', emoji: '💥', color: '#ff3b30', effect: 'pulse' },
  star:     { name: 'Star', marker: 'emoji', emoji: '⭐', color: '#ffd21f', effect: 'spin' },
  heart:    { name: 'Heart', marker: 'emoji', emoji: '❤️', color: '#ff3b6b', effect: 'heartbeat' },
  hospital: { name: 'Hospital', marker: 'emoji', emoji: '🏥', color: '#ff3b30', effect: 'pulse' },
  airport:  { name: 'Airport', marker: 'emoji', emoji: '✈️', color: '#2d7ff9', effect: 'float' },
  camera:   { name: 'Photo spot', marker: 'emoji', emoji: '📸', color: '#8b5cf6', effect: 'bounce' },
  flag:     { name: 'Flag', marker: 'emoji', emoji: '🚩', color: '#ff3b30', effect: 'float' },
  jet3d:    { name: 'Fighter jet', marker: 'sprite', sprite: 'jet', color: '#ff3b30', effect: 'float' },
  ship3d:   { name: 'Warship', marker: 'sprite', sprite: 'warship', color: '#ffd23f', effect: 'ripple' },
  drone3d:  { name: 'Drone', marker: 'sprite', sprite: 'drone', color: '#2fbf71', effect: 'radar' },
  heli3d:   { name: 'Helicopter', marker: 'sprite', sprite: 'helicopter', color: '#ffd23f', effect: 'float' },
  tank3d:   { name: 'Tank', marker: 'sprite', sprite: 'tank', color: '#ff3b30', effect: 'pulse' },
  sat3d:    { name: 'Satellite', marker: 'sprite', sprite: 'satellite', color: '#36d1ff', effect: 'float' },
  iss3d:    { name: 'Space station', marker: 'sprite', sprite: 'iss', color: '#ffd23f', effect: 'spin' },
  sub3d:    { name: 'Submarine', marker: 'sprite', sprite: 'submarine', color: '#2d7ff9', effect: 'ripple' },
};

const uid = () => `ly_${Math.random().toString(36).slice(2, 9)}`;

export function newLayer(kind, geom, opts = {}) {
  const base = { id: uid(), kind, name: opts.name || LAYER_KINDS[kind].name, geom: geom || null, start: opts.start ?? 0.5, duration: 2, hold: 0 };
  const S = {
    boundary: { anim: 'draw', style: { stroke: '#ffd23f', width: 3, dash: 'solid', fill: '#ffd23f', fillOpacity: 0, glow: true, maskOutside: 0 } },
    area: { anim: 'fade', style: { stroke: '#ff4a2b', width: 2, dash: 'solid', fill: '#ff4a2b', fillOpacity: 0.35, glow: false, maskOutside: 0 } },
    flood: { anim: 'spread', duration: 4, style: { color: '#2f8fe0', opacity: 0.62, waves: true, outline: true, dir: 'W', levelFrom: null, levelTo: null } },
    line: { anim: 'draw', style: { color: '#2d7ff9', width: 4, dash: 'solid', arrow: true, glow: false } },
    point: { anim: 'pop', duration: 0.8, style: { marker: 'dot', emoji: '📍', color: '#ff4a2b', size: 1, effect: 'pulse', label: '' } },
    label: { anim: 'fade', duration: 1, style: { text: 'Label', size: 26, color: '#ffffff', halo: '#16181d', weight: 800, upper: false, italic: false } },
    caption: { anim: 'slide', duration: 0.8, style: { text: 'Your title', sub: '', layout: 'lowerThird', position: 'bottom-left', accent: '#ff6b35', size: 1 } },
    ...FX_DEFAULTS,
  }[kind];
  const L = { ...base, anim: S.anim, style: { ...S.style } };
  if (S.duration) L.duration = S.duration;
  if (S.hold) L.hold = S.hold;
  if (opts.preset && SYMBOL_PRESETS[opts.preset]) {
    const p = SYMBOL_PRESETS[opts.preset];
    Object.assign(L.style, { marker: p.marker, color: p.color, effect: p.effect, emoji: p.emoji || L.style.emoji, sprite: p.sprite || L.style.sprite, heading: 0 });
    L.name = p.name;
  }
  return L;
}

// ------------------------------------------------------------------ geometry helpers
export function layerCoords(L) {
  const g = L.geom;
  if (!g) return [];
  switch (g.type) {
    case 'Point': return [g.coordinates];
    case 'LineString': return g.coordinates;
    case 'MultiLineString': return g.coordinates.flat();
    case 'Polygon': return g.coordinates.flat();
    case 'MultiPolygon': return g.coordinates.flat(2);
    default: return [];
  }
}
export function polygonsOf(g) {
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}
export function linesOf(g) {
  if (!g) return [];
  if (g.type === 'LineString') return [g.coordinates];
  if (g.type === 'MultiLineString') return g.coordinates;
  return [];
}
export function layerBounds(L) {
  const c = layerCoords(L);
  if (!c.length) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of c) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [[w, s], [e, n]];
}
export function layerEnd(L) {
  return L.hold > 0 ? L.start + Math.max(0.05, L.duration) + L.hold : L.start + Math.max(0.05, L.duration);
}

/** Simplify a geometry so big imported boundaries stay fast. */
export function simplifyGeom(g, budget = 6000) {
  const coords = (() => { const L = { geom: g }; return layerCoords(L); })();
  if (coords.length <= budget) return g;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of coords) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  const diag = Math.hypot(e - w, n - s);
  let tol = diag * 0.0004;
  let out = g;
  for (let k = 0; k < 8; k++) {
    const ring = (r) => { const q = simplify(r, tol); return q.length >= 4 ? q : r.length > 4 ? [r[0], r[Math.floor(r.length / 3)], r[Math.floor(2 * r.length / 3)], r[0]] : r; };
    if (g.type === 'Polygon') out = { type: 'Polygon', coordinates: g.coordinates.map(ring) };
    else if (g.type === 'MultiPolygon') out = { type: 'MultiPolygon', coordinates: g.coordinates.map((p) => p.map(ring)) };
    else if (g.type === 'LineString') out = { type: 'LineString', coordinates: simplify(g.coordinates, tol) };
    else if (g.type === 'MultiLineString') out = { type: 'MultiLineString', coordinates: g.coordinates.map((l) => simplify(l, tol)) };
    if (layerCoords({ geom: out }).length <= budget) break;
    tol *= 2;
  }
  return out;
}

/** Turn GeoJSON (Feature/FeatureCollection/geometry) into layers. `as` picks the polygon kind. */
export function layersFromGeoJSON(obj, as = 'boundary', start = 0.5) {
  const out = [];
  const nameOf = (p = {}) => p.name || p.NAME || p.Name || p.title || p.label || p.ADMIN || p.NAME_1 || p.NAME_2 || '';
  const add = (geom, props) => {
    if (!geom) return;
    const t = geom.type;
    if (t === 'GeometryCollection') { geom.geometries.forEach((g) => add(g, props)); return; }
    if (t === 'Polygon' || t === 'MultiPolygon') {
      out.push(Object.assign(newLayer(as, simplifyGeom(geom), { start, name: nameOf(props) || LAYER_KINDS[as].name })));
    } else if (t === 'LineString' || t === 'MultiLineString') {
      out.push(newLayer('line', simplifyGeom(geom), { start, name: nameOf(props) || 'Line' }));
    } else if (t === 'Point') {
      const L = newLayer('point', geom, { start, name: nameOf(props) || 'Point' });
      L.style.label = nameOf(props);
      out.push(L);
    } else if (t === 'MultiPoint') {
      geom.coordinates.forEach((c) => add({ type: 'Point', coordinates: c }, props));
    }
  };
  const visit = (o) => {
    if (!o) return;
    if (o.type === 'FeatureCollection') o.features.forEach(visit);
    else if (o.type === 'Feature') add(o.geometry, o.properties);
    else add(o, {});
  };
  visit(obj);
  return out;
}

// ------------------------------------------------------------------ timing
/** Entry progress, alpha and local time of a layer at time t (t = null → editing, fully shown). */
export function layerTiming(L, t) {
  if (t == null) return { visible: true, u: 1, alpha: 1, tau: 0, edit: true };
  const d = Math.max(0.05, L.duration);
  if (t < L.start) return { visible: false, u: 0, alpha: 0, tau: 0 };
  const u = clamp((t - L.start) / d, 0, 1);
  let alpha = 1;
  if (L.hold > 0) {
    const end = L.start + d + L.hold;
    if (t > end) return { visible: false, u: 1, alpha: 0, tau: t - L.start };
    alpha = clamp((end - t) / 0.4, 0, 1);
  }
  return { visible: true, u, alpha, tau: t - L.start };
}

function hexA(hex, a) {
  const h = (hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const dashOf = (d, w) => (d === 'dashed' ? [w * 3, w * 2] : d === 'dotted' ? [0.01, w * 2.2] : []);

function ringPath(ctx, proj, rings) {
  for (const ring of rings) {
    ring.forEach((c, i) => { const p = proj(c); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.closePath();
  }
}
function polyPath(ctx, proj, geom) {
  ctx.beginPath();
  for (const poly of polygonsOf(geom)) ringPath(ctx, proj, poly);
}
function screenBox(proj, coords) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of coords) { const [x, y] = proj(c); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}
function screenLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }

// ------------------------------------------------------------------ polygons (boundary / area)
function drawPolygonLayer(ctx, L, tm, proj, unit, frame) {
  const s = L.style;
  const w = (+s.width || 2) * unit;
  let alpha = tm.alpha;
  let fillA = +s.fillOpacity || 0;
  let traceU = 1;
  ctx.save();
  if (L.anim === 'fade') alpha *= ease(tm.u);
  if (L.anim === 'draw') { traceU = clamp(tm.u / 0.7, 0, 1); fillA *= clamp((tm.u - 0.55) / 0.45, 0, 1); }
  if (L.anim === 'pulse') alpha *= ease(clamp(tm.u * 2, 0, 1));
  if (L.anim === 'flash' && !tm.edit) { const f = tm.u >= 1 ? 1 : 0.5 - 0.5 * Math.cos(tm.u * Math.PI * 7); alpha *= f; fillA = Math.min(1, fillA + (tm.u < 1 ? 0.25 * f : 0)); }
  if (L.anim === 'grow' || L.anim === 'wipe') {
    const box = screenBox(proj, layerCoords(L));
    if (L.anim === 'grow') {
      const k = Math.max(0.001, easeOutBack(tm.u));
      ctx.translate(box.cx, box.cy); ctx.scale(k, k); ctx.translate(-box.cx, -box.cy);
      alpha *= clamp(tm.u * 3, 0, 1);
    } else {
      ctx.beginPath();
      ctx.rect(box.x0 - w * 2, box.y0 - w * 2, (box.w + w * 4) * ease(tm.u), box.h + w * 4);
      ctx.clip();
    }
  }
  if (alpha <= 0) { ctx.restore(); return; }
  // dim everything outside the shape
  if (s.maskOutside > 0 && frame) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(frame.x - 4000, frame.y - 4000, frame.w + 8000, frame.h + 8000);
    for (const poly of polygonsOf(L.geom)) ringPath(ctx, proj, poly);
    ctx.fillStyle = `rgba(8,10,14,${s.maskOutside * alpha * (L.anim === 'draw' ? clamp(tm.u / 0.6, 0, 1) : 1)})`;
    ctx.fill('evenodd');
    ctx.restore();
  }
  ctx.globalAlpha = alpha;
  if (fillA > 0) {
    polyPath(ctx, proj, L.geom);
    ctx.fillStyle = hexA(s.fill, fillA);
    ctx.fill('evenodd');
  }
  if (w > 0) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    let glow = s.glow ? 1 : 0;
    let lw = w;
    if (L.anim === 'pulse' && !tm.edit) { const p = 0.5 + 0.5 * Math.sin(tm.tau * Math.PI * 1.6); glow = 0.6 + p; lw = w * (1 + 0.35 * p); }
    if (glow) { ctx.shadowColor = s.stroke; ctx.shadowBlur = 12 * unit * glow; }
    ctx.strokeStyle = s.stroke;
    ctx.lineWidth = lw;
    for (const poly of polygonsOf(L.geom)) {
      for (const ring of poly) {
        const pts = ring.map(proj);
        if (traceU < 1) {
          const len = screenLen(pts);
          ctx.setLineDash([len * traceU, len + 10]);
        } else ctx.setLineDash(dashOf(s.dash, lw));
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        if (traceU >= 1) ctx.closePath();
        ctx.stroke();
      }
    }
    // tracing head glow
    if (traceU > 0 && traceU < 1) ctx.shadowBlur = 0;
  }
  ctx.restore();
}

// ------------------------------------------------------------------ flood
function waves(ctx, box, unit, tau, alpha) {
  const gap = Math.max(9 * unit, box.h / 140);
  const amp = 1.6 * unit, wl = 46 * unit;
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${0.2 * alpha})`;
  ctx.lineWidth = 1.2 * unit;
  const step = Math.max(6 * unit, box.w / 220);
  for (let y = box.y0, k = 0; y <= box.y1; y += gap, k++) {
    ctx.beginPath();
    for (let x = box.x0; x <= box.x1 + step; x += step) {
      const yy = y + Math.sin((x / wl) * Math.PI * 2 + tau * 2.2 + k * 1.3) * amp;
      if (x === box.x0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawFloodLayer(ctx, L, tm, proj, unit) {
  const s = L.style;
  const box = screenBox(proj, layerCoords(L));
  if (L.anim === 'terrain') {
    if (tm.edit) {
      ctx.save();
      polyPath(ctx, proj, L.geom);
      ctx.setLineDash([6 * unit, 5 * unit]);
      ctx.strokeStyle = hexA(s.color, 0.9);
      ctx.lineWidth = 2 * unit;
      ctx.stroke();
      ctx.restore();
    }
    return; // the water itself is drawn by the map (flood.js)
  }
  const color = s.color || '#2f8fe0';
  const op = clamp(+s.opacity || 0.6, 0, 1);
  const alpha = tm.alpha;
  ctx.save();
  polyPath(ctx, proj, L.geom);
  ctx.clip('evenodd');
  let fillAlpha = op * alpha;
  const u = L.anim === 'none' ? 1 : tm.u;
  if (L.anim === 'spread') {
    const o = proj(L.origin || centroid(L));
    let maxR = 0;
    for (const c of layerCoords(L)) { const p = proj(c); maxR = Math.max(maxR, Math.hypot(p[0] - o[0], p[1] - o[1])); }
    const r = maxR * easeOut(u) * 1.02;
    // irregular, wobbly water front
    ctx.beginPath();
    const n = 90;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wob = 1 + 0.06 * Math.sin(a * 5 + tm.tau * 1.3) + 0.04 * Math.sin(a * 11 - tm.tau * 2);
      const x = o[0] + Math.cos(a) * r * wob, y = o[1] + Math.sin(a) * r * wob;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = hexA(color, fillAlpha);
    ctx.fill();
    if (u < 1) { ctx.strokeStyle = `rgba(255,255,255,${0.55 * alpha})`; ctx.lineWidth = 3 * unit; ctx.stroke(); }
    ctx.clip();
  } else if (L.anim === 'wipe') {
    const k = easeOut(u);
    const d = s.dir || 'W';
    let rx = box.x0, ry = box.y0, rw = box.w, rh = box.h;
    if (d === 'W') rw = box.w * k;
    if (d === 'E') { rx = box.x1 - box.w * k; rw = box.w * k; }
    if (d === 'N') rh = box.h * k;
    if (d === 'S') { ry = box.y1 - box.h * k; rh = box.h * k; }
    ctx.beginPath(); ctx.rect(rx, ry, rw, rh);
    ctx.fillStyle = hexA(color, fillAlpha);
    ctx.fill();
    ctx.clip();
  } else {
    if (L.anim === 'rise') fillAlpha *= ease(u);
    ctx.fillStyle = hexA(color, fillAlpha);
    ctx.fillRect(box.x0 - 2, box.y0 - 2, box.w + 4, box.h + 4);
  }
  if (s.waves !== false) waves(ctx, box, unit, tm.tau, alpha * (L.anim === 'rise' ? ease(u) : 1));
  ctx.restore();
  if (s.outline !== false) {
    ctx.save();
    polyPath(ctx, proj, L.geom);
    ctx.strokeStyle = hexA(color, 0.85 * alpha * (L.anim === 'none' ? 1 : clamp(u * 2, 0, 1)));
    ctx.lineWidth = 1.5 * unit;
    ctx.stroke();
    ctx.restore();
  }
}

export function centroid(L) {
  const polys = polygonsOf(L.geom);
  const ring = polys[0]?.[0] || layerCoords(L);
  let x = 0, y = 0;
  ring.forEach((c) => { x += c[0]; y += c[1]; });
  return [x / ring.length, y / ring.length];
}

// ------------------------------------------------------------------ lines
function drawLineLayer(ctx, L, tm, proj, unit) {
  const s = L.style;
  const w = (+s.width || 3) * unit;
  let alpha = tm.alpha;
  if (L.anim === 'fade') alpha *= ease(tm.u);
  if (L.anim === 'flow') alpha *= ease(clamp(tm.u * 2, 0, 1));
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (s.glow) { ctx.shadowColor = s.color; ctx.shadowBlur = 10 * unit; }
  for (const line of linesOf(L.geom)) {
    const pts = line.map(proj);
    if (pts.length < 2) continue;
    let draw = pts;
    if (L.anim === 'draw' && tm.u < 1) {
      const total = screenLen(pts);
      let target = total * ease(tm.u), acc = 0;
      draw = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (acc + seg >= target) {
          const f = seg ? (target - acc) / seg : 0;
          draw.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]);
          break;
        }
        acc += seg;
        draw.push(pts[i]);
      }
    }
    if (draw.length < 2) continue;
    ctx.beginPath();
    draw.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = w + 3 * unit;
    ctx.setLineDash(L.anim === 'flow' ? [] : dashOf(s.dash, w));
    if (s.dash !== 'dotted') ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = w;
    if (L.anim === 'flow' && !tm.edit) { ctx.setLineDash([w * 3, w * 2.2]); ctx.lineDashOffset = -tm.tau * 40 * unit; }
    ctx.stroke();
    if (s.arrow) {
      const a = draw.at(-1), b = draw[Math.max(0, draw.length - 2)];
      let k = draw.length - 2;
      let pb = b;
      while (k > 0 && Math.hypot(a[0] - pb[0], a[1] - pb[1]) < w) pb = draw[--k];
      const ang = Math.atan2(a[1] - pb[1], a[0] - pb[0]);
      const size = w * 2.4 + 6 * unit;
      ctx.setLineDash([]);
      ctx.save();
      ctx.translate(a[0], a[1]);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(size * 0.6, 0);
      ctx.lineTo(-size * 0.6, -size * 0.6);
      ctx.lineTo(-size * 0.3, 0);
      ctx.lineTo(-size * 0.6, size * 0.6);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ points & animated symbols
function drawPin(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - r * 0.4, y - r * 0.9, x - r, y - r * 1.25, x - r, y - r * 1.9);
  ctx.arc(x, y - r * 1.9, r, Math.PI, 0);
  ctx.bezierCurveTo(x + r, y - r * 1.25, x + r * 0.4, y - r * 0.9, x, y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = r * 0.16;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y - r * 1.9, r * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

function drawPointLayer(ctx, L, tm, proj, unit) {
  const s = L.style;
  const [px, py] = proj(L.geom.coordinates);
  const size = (+s.size || 1) * unit;
  const tau = tm.edit ? 0.6 : tm.tau;
  let alpha = tm.alpha, scale = 1, dy = 0, dx = 0, rot = 0;
  if (L.anim === 'pop') { scale = easeOutBack(tm.u); alpha *= clamp(tm.u * 3, 0, 1); }
  if (L.anim === 'fade') alpha *= ease(tm.u);
  if (L.anim === 'drop') { dy = -(1 - bounceOut(tm.u)) * 90 * unit; alpha *= clamp(tm.u * 4, 0, 1); }
  if (alpha <= 0 || scale <= 0) return;
  const fx = s.effect || 'none';
  const after = tm.edit ? 1 : clamp((tm.tau - L.duration) / 0.3 + 1, 0, 1);
  if (fx === 'bounce') dy += -Math.abs(Math.sin(tau * Math.PI * 1.4)) * 14 * size * after;
  if (fx === 'float') dy += Math.sin(tau * 2.2) * 5 * size * after;
  if (fx === 'shake') dx += Math.sin(tau * 38) * 3 * size * after;
  if (fx === 'spin') rot = tau * Math.PI * after;
  if (fx === 'heartbeat') { const b = (tau * 1.2) % 1; scale *= 1 + (b < 0.15 ? Math.sin(b / 0.15 * Math.PI) * 0.22 : b < 0.35 ? Math.sin((b - 0.15) / 0.2 * Math.PI) * 0.12 : 0) * after; }
  if (fx === 'flicker') { scale *= 1 + (Math.sin(tau * 23) * 0.05 + Math.sin(tau * 37) * 0.04) * after; }
  if (fx === 'blink') alpha *= 1 - after * (Math.sin(tau * Math.PI * 2.4) > 0 ? 0 : 0.7);
  const color = s.color || '#ff4a2b';
  ctx.save();
  ctx.globalAlpha = alpha;
  // ground effects (not moved by bounce)
  if (fx === 'pulse' || fx === 'ripple') {
    const n = 3;
    for (let i = 0; i < n; i++) {
      const ph = ((tau * 0.8 + i / n) % 1);
      const r = (10 + ph * 46) * size;
      ctx.beginPath();
      if (fx === 'ripple') ctx.ellipse(px, py, r, r * 0.45, 0, 0, Math.PI * 2); else ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.strokeStyle = hexA(color, (1 - ph) * 0.8 * after);
      ctx.lineWidth = (fx === 'ripple' ? 2 : 3) * size;
      ctx.stroke();
    }
  }
  if (fx === 'radar') {
    const R = 52 * size;
    ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2);
    ctx.fillStyle = hexA(color, 0.08); ctx.fill();
    ctx.strokeStyle = hexA(color, 0.5); ctx.lineWidth = 1.5 * size; ctx.stroke();
    ctx.beginPath(); ctx.arc(px, py, R * 0.55, 0, Math.PI * 2); ctx.stroke();
    const a = tau * Math.PI * 1.3;
    if (ctx.createConicGradient) {
      const g = ctx.createConicGradient(a - Math.PI * 0.55, px, py);
      g.addColorStop(0, hexA(color, 0));
      g.addColorStop(0.15, hexA(color, 0.55));
      g.addColorStop(0.151, hexA(color, 0));
      g.addColorStop(1, hexA(color, 0));
      ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * R, py + Math.sin(a) * R);
    ctx.strokeStyle = hexA(color, 0.9); ctx.lineWidth = 2 * size; ctx.stroke();
  }
  ctx.translate(px + dx, py + dy);
  ctx.scale(scale, scale);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 8 * unit;
  ctx.shadowOffsetY = 2 * unit;
  const m = s.marker || 'dot';
  if (m === 'dot') {
    ctx.beginPath(); ctx.arc(0, 0, 8 * size, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 3 * size; ctx.strokeStyle = '#fff'; ctx.stroke();
  } else if (m === 'ring') {
    ctx.beginPath(); ctx.arc(0, 0, 9 * size, 0, Math.PI * 2);
    ctx.lineWidth = 4 * size; ctx.strokeStyle = color; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 3 * size, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  } else if (m === 'pin') {
    ctx.rotate(rot * 0);
    drawPin(ctx, 0, 0, 11 * size, color);
  } else if (m === 'target') {
    ctx.rotate(rot);
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = color; ctx.lineWidth = 2.5 * size;
    for (const r of [8, 18]) { ctx.beginPath(); ctx.arc(0, 0, r * size, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath();
    for (const a of [0, 1, 2, 3]) { const c = Math.cos(a * Math.PI / 2), sn = Math.sin(a * Math.PI / 2); ctx.moveTo(c * 12 * size, sn * 12 * size); ctx.lineTo(c * 26 * size, sn * 26 * size); }
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 3 * size, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  } else if (m === 'sprite') {
    ctx.shadowColor = 'transparent';
    const spin = s.effect === 'spin' ? rot : 0;
    drawSprite(ctx, s.sprite || 'jet', 0, 0, ((+s.heading || 0) * Math.PI) / 180 + spin, 26 * size, { color, t: tau, alt: 10 * size });
  } else if (m === 'image') {
    const img = signImage(s.image);
    ctx.rotate(rot);
    if (img) {
      const h = 40 * size, w = (h * img.naturalWidth) / img.naturalHeight;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    } else {
      ctx.beginPath(); ctx.arc(0, 0, 14 * size, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.fillStyle = '#888'; ctx.font = `700 ${11 * size}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('IMG', 0, 0);
    }
  } else if (m === 'emoji') {
    ctx.rotate(rot);
    ctx.font = `${30 * size}px ${EMOJI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.emoji || '📍', 0, 0);
  }
  ctx.restore();
  if (s.label) {
    ctx.save();
    ctx.globalAlpha = alpha * (L.anim === 'none' || tm.edit ? 1 : clamp((tm.u - 0.3) / 0.7, 0, 1));
    ctx.font = `700 ${15 * size}px ${fam(s.font, UI)}`;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const lx = px + (m === 'emoji' ? 20 : m === 'target' ? 30 : 16) * size, ly = py + dy + (m === 'pin' ? -20 * size : 0);
    ctx.strokeStyle = 'rgba(15,17,21,0.85)';
    ctx.lineWidth = 4 * size;
    ctx.strokeText(s.label, lx, ly);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(s.label, lx, ly);
    ctx.restore();
  }
}

// ------------------------------------------------------------------ text on the map
function animateText(text, anim, u) {
  if (anim === 'typewriter') return text.slice(0, Math.round(text.length * clamp(u, 0, 1)));
  return text;
}
function drawLabelLayer(ctx, L, tm, proj, unit, tokens) {
  const s = L.style;
  let text = fillTokens(s.text || '', tokens);
  if (s.upper) text = text.toUpperCase();
  const [x, y] = proj(L.geom.coordinates);
  let alpha = tm.alpha, dy = 0, scale = 1;
  if (L.anim === 'fade') alpha *= ease(tm.u);
  if (L.anim === 'slideUp') { dy = (1 - easeOut(tm.u)) * 24 * unit; alpha *= ease(tm.u); }
  if (L.anim === 'pop') { scale = easeOutBack(tm.u); alpha *= clamp(tm.u * 3, 0, 1); }
  if (L.anim === 'typewriter') text = animateText(text, 'typewriter', tm.u);
  if (alpha <= 0 || !text) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y + dy);
  ctx.scale(scale, scale);
  ctx.font = `${s.italic ? 'italic ' : ''}${s.weight || 800} ${(+s.size || 24) * unit}px ${fam(s.font, DISPLAY)}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (s.halo) {
    ctx.strokeStyle = s.halo;
    ctx.lineWidth = Math.max(2, (+s.size || 24) * 0.22) * unit;
    ctx.strokeText(text, 0, 0);
  }
  ctx.fillStyle = s.color || '#fff';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// ------------------------------------------------------------------ captions (screen space)
export function fillTokens(text, tokens = {}) {
  return String(text || '').replace(/\{(\w+)\}/g, (m, k) => (tokens[k] != null ? tokens[k] : m));
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

function drawCaption(ctx, L, tm, frame, unit, tokens) {
  const s = L.style;
  const k = +s.size || 1;
  let text = fillTokens(s.text, tokens), sub = fillTokens(s.sub, tokens);
  const anim = L.anim;
  const u = tm.u;
  let alpha = tm.alpha;
  if (anim === 'fade') alpha *= ease(u);
  if (anim === 'typewriter') { const total = text.length + sub.length; const n = Math.round(total * clamp(u, 0, 1)); sub = sub.slice(0, Math.max(0, n - text.length)); text = text.slice(0, n); }
  if (anim === 'pop' || anim === 'slide' || anim === 'wipe') alpha *= clamp(u * 3, 0, 1);
  if (alpha <= 0) return;
  const layout = s.layout || 'lowerThird';
  const M = 34 * unit;
  const D = fam(s.font, DISPLAY), U = fam(s.font, UI);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textBaseline = 'alphabetic';
  if (layout === 'lowerThird') {
    const f1 = `800 ${30 * k * unit}px ${D}`, f2 = `500 ${17 * k * unit}px ${U}`;
    ctx.font = f1; const w1 = ctx.measureText(text).width;
    ctx.font = f2; const w2 = sub ? ctx.measureText(sub).width : 0;
    const w = Math.max(w1, w2) + 44 * unit, h = (sub ? 82 : 58) * k * unit;
    const x = frame.x + M, y = frame.y + frame.h - M - h;
    placeAt(ctx, L, frame, x, y, w + 8 * unit, h);
    const slide = anim === 'slide' ? (1 - easeOut(u)) * (w + M) : 0;
    const wipe = anim === 'wipe' ? easeOut(u) : 1;
    ctx.beginPath(); ctx.rect(x - 2, y - 2, (w + 8 * unit + 4) * wipe, h + 4); ctx.clip();
    ctx.translate(-slide, 0);
    ctx.fillStyle = s.accent || '#ff6b35';
    ctx.fillRect(x, y, 8 * unit, h);
    ctx.fillStyle = 'rgba(14,16,20,0.86)';
    ctx.fillRect(x + 8 * unit, y, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = f1;
    ctx.fillText(text, x + 28 * unit, y + (sub ? 40 : 40) * k * unit);
    if (sub) { ctx.font = f2; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillText(sub, x + 28 * unit, y + 66 * k * unit); }
  } else if (layout === 'band') {
    const h = (sub ? 92 : 66) * k * unit;
    const y = frame.y + frame.h - h - M * 0.7;
    placeAt(ctx, L, frame, frame.x, y, frame.w, h, { lockX: true });
    const slide = anim === 'slide' ? (1 - easeOut(u)) * h * 1.5 : 0;
    ctx.translate(0, slide);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    const ww = anim === 'wipe' ? frame.w * easeOut(u) : frame.w;
    ctx.fillRect(frame.x + (frame.w - ww) / 2, y, ww, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${30 * k * unit}px ${D}`;
    ctx.fillText(text, frame.x + frame.w / 2, y + 42 * k * unit);
    if (sub) { ctx.font = `500 ${17 * k * unit}px ${U}`; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(sub, frame.x + frame.w / 2, y + 72 * k * unit); }
  } else {
    // title / card / plain at a position
    const big = layout === 'title';
    const f1 = `${big ? 900 : 800} ${(big ? 58 : 30) * k * unit}px ${D}`;
    const f2 = `500 ${(big ? 22 : 16) * k * unit}px ${U}`;
    ctx.font = f1; const w1 = ctx.measureText(text).width;
    ctx.font = f2; const w2 = sub ? ctx.measureText(sub).width : 0;
    const lh1 = (big ? 62 : 34) * k * unit, lh2 = sub ? (big ? 32 : 24) * k * unit : 0;
    const padX = layout === 'card' ? 22 * unit : 0, padY = layout === 'card' ? 18 * unit : 0;
    const bw = Math.max(w1, w2) + padX * 2, bh = lh1 + lh2 + padY * 2;
    const pos = big && s.position === 'bottom-left' ? 'center' : (s.position || 'center');
    let x = frame.x + M, y = frame.y + M;
    if (pos.includes('right')) x = frame.x + frame.w - M - bw;
    if (pos === 'top' || pos === 'bottom' || pos === 'center') x = frame.x + (frame.w - bw) / 2;
    if (pos.includes('bottom')) y = frame.y + frame.h - M - bh;
    if (pos === 'center') y = frame.y + (frame.h - bh) / 2;
    placeAt(ctx, L, frame, x, y, bw, bh);
    let sc = 1, ty = 0;
    if (anim === 'pop') sc = easeOutBack(u);
    if (anim === 'slide') ty = (1 - easeOut(u)) * 40 * unit;
    ctx.translate(x + bw / 2, y + bh / 2 + ty);
    ctx.scale(sc, sc);
    ctx.translate(-(x + bw / 2), -(y + bh / 2));
    if (anim === 'wipe') { ctx.beginPath(); ctx.rect(x - 10, y - 10, (bw + 20) * easeOut(u), bh + 20); ctx.clip(); }
    if (layout === 'card') {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 18 * unit; ctx.shadowOffsetY = 4 * unit;
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      rr(ctx, x, y, bw, bh, 12 * unit); ctx.fill();
      ctx.restore();
      ctx.fillStyle = s.accent || '#ff6b35';
      ctx.fillRect(x, y + 14 * unit, 5 * unit, bh - 28 * unit);
    }
    const dark = layout === 'card';
    ctx.textAlign = 'left';
    if (!dark) { ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 14 * unit; ctx.shadowOffsetY = 2 * unit; }
    ctx.fillStyle = dark ? '#16181d' : '#ffffff';
    ctx.font = f1;
    const tx = x + padX + (bw - padX * 2 - w1) * (pos === 'top' || pos === 'bottom' || pos === 'center' ? 0.5 : 0);
    ctx.fillText(text, tx, y + padY + lh1 * 0.8);
    if (sub) {
      ctx.font = f2;
      ctx.fillStyle = dark ? '#5b616e' : 'rgba(255,255,255,0.88)';
      const sx = x + padX + (bw - padX * 2 - w2) * (pos === 'top' || pos === 'bottom' || pos === 'center' ? 0.5 : 0);
      ctx.fillText(sub, sx, y + padY + lh1 + lh2 * 0.72);
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ public draw API
/**
 * Draw scene layers. phase: 'below' (areas, floods, lines — under the route),
 * 'above' (points, labels), 'captions' (screen text; frame required).
 */
export function drawLayers(ctx, o, phase) {
  setBoxSink(o.boxes || null);
  try { drawLayersInner(ctx, o, phase); } finally { setBoxSink(null); }
}
function drawLayersInner(ctx, o, phase) {
  const layers = o.scene.layers || [];
  const { proj, unit, time, frame } = o;
  const tokens = o.tokens || {};
  for (const L of layers) {
    if (L.hidden) continue;
    if (FX_KINDS[L.kind]) {
      if (!fxPhases(L.kind).includes(phase)) continue;
      const tm = layerTiming(L, time);
      if (!tm.visible) continue;
      try { drawFX(ctx, L, tm, o, phase); } catch (e) { console.warn('fx draw failed', L.id, e); }
      continue;
    }
    const below = L.kind === 'boundary' || L.kind === 'area' || L.kind === 'flood' || L.kind === 'line';
    const isCap = L.kind === 'caption';
    if ((phase === 'below') !== below && !isCap) continue;
    if (isCap !== (phase === 'captions')) continue;
    const tm = layerTiming(L, time);
    if (!tm.visible) continue;
    try {
      if (L.kind === 'boundary' || L.kind === 'area') drawPolygonLayer(ctx, L, tm, proj, unit, frame);
      else if (L.kind === 'flood') drawFloodLayer(ctx, L, tm, proj, unit);
      else if (L.kind === 'line') drawLineLayer(ctx, L, tm, proj, unit);
      else if (L.kind === 'point' && L.geom) drawPointLayer(ctx, L, tm, proj, unit);
      else if (L.kind === 'label' && L.geom) drawLabelLayer(ctx, L, tm, proj, unit, tokens);
      else if (isCap && frame) drawCaption(ctx, L, tm, frame, unit, tokens);
    } catch (e) { console.warn('layer draw failed', L.id, e); }
  }
}

/** Handles (vertices) of the selected layer for editing. */
export function layerHandles(L, proj) {
  if (!L || !L.geom) return [];
  const out = [];
  const g = L.geom;
  if (g.type === 'Point') return [{ ring: null, i: 0, p: proj(g.coordinates) }];
  const rings = g.type === 'Polygon' ? g.coordinates : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
  const total = rings.reduce((s, r) => s + r.length, 0);
  if (total > 400) return [];
  rings.forEach((r, ri) => r.forEach((c, i) => {
    if ((g.type === 'Polygon' || g.type === 'MultiPolygon') && i === r.length - 1) return; // closing vertex
    out.push({ ring: ri, i, p: proj(c) });
  }));
  return out;
}

/** Which layer is under the canvas point p? Returns the layer id or null. */
export function hitLayer(ctx, layers, proj, p, unit, frame) {
  for (let k = layers.length - 1; k >= 0; k--) {
    const L = layers[k];
    if (L.hidden) continue;
    if (L.kind === 'caption') continue;
    const g = L.geom;
    if (!g) continue;
    if (g.type === 'Point') {
      const q = proj(g.coordinates);
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 22 * Math.max(unit, 1)) return L.id;
      continue;
    }
    const path = new Path2D();
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      for (const poly of polygonsOf(g)) for (const ring of poly) {
        ring.forEach((c, i) => { const q = proj(c); if (i) path.lineTo(q[0], q[1]); else path.moveTo(q[0], q[1]); });
        path.closePath();
      }
      const filled = L.kind === 'flood' || L.kind === 'wxfield' || L.kind === 'city3d' || L.kind === 'image' || L.kind === 'compare' || L.kind === 'timeseries' || (L.style.fillOpacity > 0.02);
      if (filled && ctx.isPointInPath(path, p[0], p[1], 'evenodd')) return L.id;
    } else {
      for (const line of linesOf(g)) line.forEach((c, i) => { const q = proj(c); if (i) path.lineTo(q[0], q[1]); else path.moveTo(q[0], q[1]); });
    }
    ctx.save();
    ctx.lineWidth = 14 * Math.max(unit, 1);
    const hit = ctx.isPointInStroke(path, p[0], p[1]);
    ctx.restore();
    if (hit) return L.id;
  }
  return null;
}

/** Point-in-polygon in lng/lat (for flood masks etc.). */
export function mercRing(ring) { return ring.map(toMerc); }

// ------------------------------------------------------------------ CSV points (GEOlayers-style data import)
function splitCSVLine(line, sep) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}
/** Parse a CSV/TSV with latitude & longitude columns. Returns { rows, lat, lon, name, header }. */
export function parseCSVPoints(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (lines.length < 2) throw new Error('The CSV file has no rows');
  const sep = (lines[0].match(/\t/g) || []).length > (lines[0].match(/,/g) || []).length ? '\t' : (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const header = splitCSVLine(lines[0], sep);
  const low = header.map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const find = (names) => low.findIndex((h) => names.includes(h));
  const lat = find(['lat', 'latitude', 'y', 'lat_dd', 'latdd']);
  const lon = find(['lon', 'lng', 'long', 'longitude', 'x', 'londd']);
  if (lat < 0 || lon < 0) throw new Error('Could not find latitude and longitude columns (name them lat and lon)');
  const name = find(['name', 'title', 'label', 'city', 'place', 'location', 'description']);
  const rows = lines.slice(1).map((l) => splitCSVLine(l, sep)).filter((r) => Number.isFinite(+r[lat]) && Number.isFinite(+r[lon]) && r[lat] !== '' && r[lon] !== '');
  return { header, rows, lat, lon, name };
}
