// Special layers: satellites & ISS, launch sites, missile/drone trajectories, strikes and bombing runs,
// captured areas, infographic charts/counters and HUD overlays. Pure canvas drawing; deterministic in time.
import { drawSprite, drawRocketSide, SPRITES } from './sprites.js';
import { drawExplosion, drawPuff } from './explosion.js';
import { drawVideoFx } from './videofx.js';
import { placeAt, CUSTOM_POS } from './place.js';
import { HUD_PLUS, drawHUDPlus, HUDTEXT_STYLES, drawHudText, TARGET_STYLES, drawTarget, FLICKER_PLUS } from './hudplus.js';
import { drawTrees, TREE_TYPES } from './trees.js';
import { MODEL_CHOICES } from './modelnames.js';
import { drawCyclone, drawCycloneLegend, drawPressure, drawFront, FRONT_TYPES, drawWxPoint, WX_ICONS, drawField, drawFieldLegend, FIELD_TYPES, drawForecast, FORECAST_LOOKS } from './weather.js';
import { drawTitle, TITLE_LOOKS } from './titles.js';
import { drawNews, NEWS_LOOKS } from './news.js';
import { EFFECT_LOOKS, drawVideoLayer } from './screenfx.js';
import { drawImageLayer, drawCompareLayer, drawSeriesLayer, drawSeriesLabel } from './geoimage.js';

const UI = '"Inter","Segoe UI",system-ui,sans-serif';
const MONO = '"JetBrains Mono",ui-monospace,Menlo,monospace';
const DISPLAY = '"Archivo","Inter",system-ui,sans-serif';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const easeIn = (u) => clamp(u, 0, 1) ** 2.2;
const fam = (f, fb) => (f ? `"${f}", ${fb}` : fb);
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
function hexA(hex, a) {
  const h = (hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------------------------------------------------------------- catalogue (merged into LAYER_KINDS)
export const FX_KINDS = {
  satellite: { name: 'Satellite pass', icon: '🛰️', geom: 'line', desc: 'A satellite flies over and images the ground' },
  iss:       { name: 'ISS orbit', icon: '🛰', geom: 'point', desc: 'The space station on its orbit through a point' },
  launch:    { name: 'Launch site', icon: '🚀', geom: 'point', desc: 'A rocket lifts off from a launch pad' },
  trajectory:{ name: 'Missile / drone path', icon: '➶', geom: 'line', desc: 'A missile arc, drone or jet flight with impact' },
  strike:    { name: 'Blast', icon: '💥', geom: 'point', desc: 'Explosion with fireball, shockwave and smoke' },
  bombing:   { name: 'Bombing run', icon: '✈', geom: 'line', desc: 'An aircraft drops a series of strikes along a line' },
  capture:   { name: 'Capture area', icon: '⚑', geom: 'polygon', desc: 'An area being taken, with an advancing front and flag' },
  vehicle:   { name: '3D vehicle', icon: '⛴', geom: 'line', desc: 'A ship, jet, tank or drone moving along a path' },
  model3d:   { name: '3D model', icon: '🧊', geom: 'point', desc: 'A real 3D model (built-in or your own GLB/glTF)' },
  videofx:   { name: 'Effect clip', icon: '🎞', geom: 'point', desc: 'Your own explosion, fire or smoke video clip' },
  flicker:   { name: 'Flicker text', icon: '▌', geom: null, desc: 'Glitchy, decoding, flickering text with sound' },
  chart:     { name: 'Chart', icon: '📊', geom: null, desc: 'Animated bar, line or donut chart, counter or progress bar' },
  hud:       { name: 'HUD', icon: '⌖', geom: null, desc: 'Drone, satellite or targeting head-up display' },
  hudtext:   { name: 'HUD text', icon: '▤', geom: null, desc: 'Telemetry, alert, terminal, coordinates, stamp or ticker text — place it anywhere' },
  target:    { name: 'Target marker', icon: '◎', geom: 'point', desc: 'Lock-on brackets, crosshair, reticle or radar ping on a spot' },
  image:     { name: 'Georeferenced image', icon: '🖼', geom: 'image', desc: 'An image, scan, drone photo or GeoTIFF fitted onto the map' },
  compare:   { name: 'Before / after', icon: '◐', geom: 'image', desc: 'Swipe or fade between a pre and a post image' },
  timeseries:{ name: 'Images through time', icon: '🗓', geom: 'image', desc: 'A sequence of images or satellite dates with a year label' },
  trees:     { name: 'Trees', icon: '🌳', geom: 'polygon', desc: 'A forest filling an area, or a row of trees along a line' },
  title:     { name: 'Film title', icon: '🎬', geom: null, desc: 'Opening, cinematic, chapter, location, credits, quote or end titles' },
  news:      { name: 'TV news graphic', icon: '📺', geom: null, desc: 'Channel logo, LIVE badge, BREAKING NEWS banner or news lower third' },
  effect:    { name: 'Effect', icon: '✨', geom: null, desc: 'Film grain, old film, VHS, glitch, light leak, flash, rain, snow, shake…' },
  video:     { name: 'Video', icon: '▶', geom: null, desc: 'Your own video, full screen or picture-in-picture' },
  collision: { name: 'Collision', icon: '💥', geom: 'line', desc: 'Two 3D trains (or any vehicles) drive at each other along a line and crash' },
  city3d:    { name: '3D city', icon: '🏙', geom: 'polygon', desc: 'A procedural 3D city with lit windows that grows up' },
  cyclone:   { name: 'Cyclone track', icon: '🌀', geom: 'line', desc: 'Storm track by category, spinning cloud with an eye, forecast cone' },
  pressure:  { name: 'Pressure centre', icon: 'L', geom: 'point', desc: 'High or low pressure with isobars and circulation' },
  front:     { name: 'Weather front', icon: '▲', geom: 'line', desc: 'Cold, warm, occluded or stationary front' },
  wxpoint:   { name: 'City weather', icon: '☀', geom: 'point', desc: 'Weather icon and temperature on the map' },
  wxfield:   { name: 'Weather field', icon: '🌡', geom: 'polygon', desc: 'Temperature, rainfall, wind, pressure or humidity over an area' },
  forecast:  { name: 'Weather forecast', icon: '📅', geom: null, desc: 'TV weather panels: days ahead, cities, current conditions, warnings' },
};
export const FX_ANIMS = {
  satellite: { pass: 'Fly over' }, iss: { pass: 'Orbit' }, launch: { launch: 'Lift off' },
  trajectory: { fly: 'Fly to the target' }, strike: { blast: 'Explode' }, bombing: { run: 'Bombing run' },
  capture: { advance: 'Advancing front', fade: 'Fade in', none: 'Already captured' },
  vehicle: { move: 'Move along the path' },
  model3d: { pop: 'Pop in', fade: 'Fade in', none: 'No animation' },
  videofx: { play: 'Play the clip' },
  flicker: { decode: 'Decode (scrambled letters)', flicker: 'Flicker on', glitch: 'Glitch (RGB split)', type: 'Typewriter', ...FLICKER_PLUS },
  chart: { grow: 'Grow', fade: 'Fade in', none: 'No animation' },
  hud: { boot: 'Boot up', fade: 'Fade in', none: 'No animation' },
  hudtext: { flicker: 'Flicker on', fade: 'Fade in', none: 'No animation' },
  target: { lock: 'Acquire and lock' },
  image: { fade: 'Fade in', wipe: 'Wipe in', none: 'No animation' },
  compare: { reveal: 'Reveal' },
  timeseries: { play: 'Play through the dates', fade: 'Fade in, then play' },
  trees: { grow: 'Grow one by one', fade: 'Fade in', none: 'Already there' },
  title: { in: 'Animate in' },
  news: { in: 'Animate in' },
  effect: { on: 'On' },
  video: { fade: 'Fade in', pop: 'Pop in', none: 'Cut in' },
  collision: { crash: 'Drive and crash' },
  city3d: { grow: 'Grow up', none: 'Already built' },
  cyclone: { move: 'Storm moves along the track' },
  pressure: { grow: 'Isobars grow out' },
  front: { draw: 'Draw along' },
  wxpoint: { pop: 'Pop in' },
  wxfield: { fade: 'Fade in', none: 'Already there' },
  forecast: { in: 'Animate in' },
};
export const FX_DEFAULTS = {
  satellite: { anim: 'pass', duration: 6, style: { sprite: 'satellite', color: '#36d1ff', size: 1, alt: 80, imaging: true, swathKm: 60, beam: true, track: true, label: 'IMAGING SAT' } },
  iss: { anim: 'pass', duration: 10, style: { sprite: 'iss', color: '#ffd23f', size: 1.3, alt: 110, imaging: false, swathKm: 40, beam: false, track: true, label: 'ISS', inclination: 51.6 } },
  launch: { anim: 'launch', duration: 6, style: { color: '#ff7a1a', size: 1, label: 'LAUNCH SITE', smoke: true, tilt: 1 } },
  trajectory: { anim: 'fly', duration: 3, style: { vehicle: 'missile', color: '#ff3b30', size: 1, arc: 0.5, trail: true, path: true, impact: true, loiter: false } },
  strike: { anim: 'blast', duration: 3, style: { size: 1, incoming: false, scorch: true, flash: true } },
  bombing: { anim: 'run', duration: 4, style: { sprite: 'jet', color: '#ff3b30', size: 1, count: 6, blast: 0.8, scorch: true } },
  capture: { anim: 'advance', duration: 3, style: { color: '#e53935', dir: 'W', opacity: 0.32, hatch: true, arrows: true, flag: true, label: 'CAPTURED', font: '' } },
  vehicle: { anim: 'move', duration: 5, style: { sprite: 'warship', color: '#ffd23f', size: 1, wake: true, path: false, label: '' } },
  model3d: { anim: 'pop', duration: 4, style: { source: 'builtin:jet', color: '#ff3b30', size: 1, sizeMode: 'screen', altitude: 0, heading: 0, pitch: 0, roll: 0, motion: 'none', followPath: true, spinSpeed: 30, yawOffset: 0, playAnim: true } },
  videofx: { anim: 'play', duration: 3, style: { media: '', name: '', size: 1, rotation: 0, blend: 'screen', opacity: 1, loop: false, speed: 1, anchor: 'ground', flip: false, boom: true } },
  flicker: { anim: 'decode', duration: 1.6, style: { text: 'TARGET ACQUIRED', sub: 'GRID 25.20N 55.27E', position: 'center', color: '#7CFF7C', size: 1, box: true, cursor: true, font: '', keepFlicker: true } },
  chart: { anim: 'grow', duration: 1.6, style: { type: 'bar', title: 'Chart title', data: 'Dubai: 3.6\nAbu Dhabi: 1.5\nSharjah: 1.8\nAjman: 0.5', position: 'bottom-right', size: 1, accent: '#ff6b35', prefix: '', suffix: ' M', font: '' } },
  hud: { anim: 'boot', duration: 1.2, style: { variant: 'drone', color: '#7CFF7C', label: 'UAV-01', coords: true, rec: true, scan: true, polarity: 'white', text: 'MISSION: RECON ALPHA\nOBJECTIVE: SURVEY THE AREA\nASSETS: UAV-01, SAT-07\nSTATUS: IN PROGRESS', range: '50 KM', speed: 1, size: 1, position: 'bottom-right', classified: true } },
  hudtext: { anim: 'flicker', duration: 1, style: { look: 'telemetry', text: 'SPD: 420 KTS\nALT: 12500 FT\nFUEL: 64 %\nSIGNAL: STRONG', color: '', size: 1, font: '', position: 'top-left', label: 'BREAKING', speed: 1, angle: -8, live: true } },
  target: { anim: 'lock', duration: 2, style: { look: 'lock', color: '#ffd23f', lockColor: '#ff3b30', size: 1, label: 'TGT-01', lockText: 'LOCKED', sub: '', showCoords: true } },
  image: { anim: 'fade', duration: 1.5, style: { media: '', name: '', opacity: 1, crs: '3857', blend: 'normal', border: false, borderColor: '#ffffff', dir: 'lr' } },
  compare: { anim: 'reveal', duration: 4, style: { media: '', media2: '', mode: 'swipe', dir: 'lr', cycles: 2, labels: true, labelA: 'BEFORE', labelB: 'AFTER', lineColor: '#ffffff', editSplit: 0.5, opacity: 1, crs: '3857' } },
  title: { anim: 'in', duration: 2.5, hold: 2.5, style: { look: 'opener', text: 'Your title', sub: 'A film by …', lines: 'Directed by: Your Name\nMap animation: GIS One Map Animator\n\nMusic\nScore: Original soundtrack\n\nThanks for watching', font: 'Cinzel', color: '#ffffff', accent: '#e8c27a', size: 1, dim: 0, flare: true, position: 'center' } },
  news: { anim: 'in', duration: 0.8, style: { look: 'bug', channel: 'NEWS', media: '', text: 'Major flooding hits the coastal district', sub: 'Rescue teams on the ground · more updates soon', tag: 'BREAKING NEWS', location: 'DUBAI', clock: '20:45', showClock: true, live: true, color: '#d71920', bg: '', textColor: '', size: 1, font: '', position: '', opacity: 0.92 } },
  effect: { anim: 'on', duration: 4, hold: 0, style: { look: 'grain', amount: 1, color: '#ff8a3d', speed: 1, label: 'PLAY ▶', stamp: 'AUG 14 1996' } },
  video: { anim: 'fade', duration: 6, style: { media: '', name: '', fit: 'pip', width: 0.36, position: 'top-right', radius: 10, border: 3, borderColor: '#ffffff', shadow: true, caption: '', opacity: 1, speed: 1, trim: 0, loop: false } },
  collision: { anim: 'crash', duration: 5, style: { modelA: 'builtin:train', modelB: 'builtin:train', colorA: '#d71920', colorB: '#2471a3', meetAt: 0.5, size: 1.6, sizeMode: 'screen', blast: 1.4, track: true, smoke: true, label: '' } },
  city3d: { anim: 'grow', duration: 4, style: { block: 70, minH: 12, maxH: 200, look: 'day', groundBlocks: true, seed: 0 } },
  cyclone: { anim: 'move', duration: 8, style: { name: 'Cyclone Mocha', category: '4', cats: 'TD, TS, 1, 2, 3, 4, 4, 3', labels: '', forecast: true, forecastFrom: 0.65, coneKm: 350, radiusKm: 380, clouds: true, symbol: true, windRings: false, legend: true, reveal: true, editAt: 0.6, spin: 1, width: 1, dotSize: 1, symbolSize: 1 } },
  pressure: { anim: 'grow', duration: 1.5, style: { type: 'L', hpa: 984, step: 4, rings: 5, spacingKm: 120, isobars: true, values: true, arrows: true, showValue: true, size: 1, color: '', isobarColor: '#ffffff', animate: true } },
  front: { anim: 'draw', duration: 2, style: { type: 'cold', size: 1, flip: false, color: '' } },
  wxpoint: { anim: 'pop', duration: 0.6, style: { icon: 'sunny', temp: '38', name: 'Dubai', size: 1, box: true, bg: '' } },
  wxfield: { anim: 'fade', duration: 1.5, style: { field: 'temp', source: 'pattern', opacity: 0.7, scale: 2.5, min: '', max: '', windDir: 270, speed: 1, amount: 1, particles: 500, labels: true, legend: true, title: '', animate: true, steps: 0, shade: true, windOverlay: false, seed: 0, gradient: true, blend: 'normal' } },
  forecast: { anim: 'in', duration: 1.2, style: { look: 'days', title: 'Weather forecast', data: 'Mon | sunny | 38 | 29\nTue | partly | 36 | 28\nWed | showers | 31 | 26\nThu | storm | 29 | 25\nFri | sunny | 35 | 28', color: '#1e88e5', size: 1, position: '', fahrenheit: false, level: 'orange' } },
  trees: { anim: 'grow', duration: 2.5, style: { type: 'mixed', density: 40, height: 14, size: 1, exaggerate: 3, spacing: 12, bothSides: true, view: 'auto', seed: 0 } },
  timeseries: { anim: 'play', duration: 8, style: { source: 'files', frames: [], per: 2, fade: 0.8, label: 'show', labelSize: 1, labelColor: '#ffffff', accent: '#ffb020', bar: true, labelBox: true, position: 'bottom-left', editFrame: 0, opacity: 1, crs: '3857' } },
};
const VEHICLES = { missile: 'Missile (arc)', rocket: 'Rocket (high arc)', drone: 'Drone', quad: 'Quadcopter', jet: 'Fighter jet', helicopter: 'Helicopter', airliner: 'Airliner' };
const POS = { 'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right', center: 'Centre', ...CUSTOM_POS };
/** Form fields for the layer editor: [path, label, type, options]. */
export const FX_FORMS = {
  satellite: [['style.sprite', 'Satellite', 'select', { satellite: 'Imaging satellite', iss: 'Space station' }], ['style.label', 'Label', 'text'], ['style.color', 'Colour', 'color'], ['style.size', 'Size', 'range', [0.4, 3, 0.05]], ['style.alt', 'Height above map', 'range', [0, 220, 2]], ['style.imaging', 'Images the ground', 'switch'], ['style.swathKm', 'Swath width (km)', 'number', 1], ['style.beam', 'Show sensor beam', 'switch'], ['style.track', 'Show ground track', 'switch']],
  iss: [['style.label', 'Label', 'text'], ['style.color', 'Colour', 'color'], ['style.size', 'Size', 'range', [0.4, 3, 0.05]], ['style.alt', 'Height above map', 'range', [0, 220, 2]], ['style.inclination', 'Orbit inclination (°)', 'number', 0.1], ['style.imaging', 'Images the ground', 'switch'], ['style.track', 'Show orbit track', 'switch']],
  launch: [['style.label', 'Label', 'text'], ['style.size', 'Size', 'range', [0.4, 3, 0.05]], ['style.tilt', 'Turn east after lift-off', 'range', [-1, 1, 0.05]], ['style.smoke', 'Smoke clouds', 'switch']],
  trajectory: [['style.model3d', '3D model (instead of the flat symbol)', 'select', { '': 'None — flat symbol', ...MODEL_CHOICES }], ['style.alt3d', 'Flying height (3D)', 'range', [0, 300, 1], (L) => !!L.style.model3d && L.kind === 'bombing'], ['style.sizeMode', 'Size is', 'select', { screen: 'The same on screen', real: 'Real size (metres)' }, (L) => !!L.style.model3d], ['style.shadow', 'Shadow on the ground', 'switch', null, (L) => !!L.style.model3d], ['style.vehicle', 'Vehicle', 'select', VEHICLES], ['style.color', 'Colour', 'color'], ['style.size', 'Size', 'range', [0.4, 3, 0.05]], ['style.arc', 'Arc height', 'range', [0, 1.2, 0.02]], ['style.trail', 'Smoke / trail', 'switch'], ['style.path', 'Show planned path', 'switch'], ['style.impact', 'Explode at the target', 'switch'], ['style.loiter', 'Circle over the target', 'switch']],
  strike: [['style.size', 'Size', 'range', [0.3, 4, 0.05]], ['style.incoming', 'Incoming streak first', 'switch'], ['style.flash', 'Bright flash', 'switch'], ['style.scorch', 'Leave a scorch mark', 'switch']],
  bombing: [['style.model3d', '3D model (instead of the flat symbol)', 'select', { '': 'None — flat symbol', ...MODEL_CHOICES }], ['style.alt3d', 'Flying height (3D)', 'range', [0, 300, 1], (L) => !!L.style.model3d && L.kind === 'bombing'], ['style.sizeMode', 'Size is', 'select', { screen: 'The same on screen', real: 'Real size (metres)' }, (L) => !!L.style.model3d], ['style.shadow', 'Shadow on the ground', 'switch', null, (L) => !!L.style.model3d], ['style.sprite', 'Aircraft', 'select', { jet: 'Fighter jet', airliner: 'Bomber', drone: 'Drone', helicopter: 'Helicopter', none: 'None' }], ['style.count', 'Number of strikes', 'number', 1], ['style.blast', 'Blast size', 'range', [0.3, 3, 0.05]], ['style.size', 'Aircraft size', 'range', [0.4, 3, 0.05]], ['style.scorch', 'Leave scorch marks', 'switch']],
  capture: [['style.color', 'Colour', 'color'], ['style.opacity', 'Opacity', 'range', [0.05, 0.9, 0.01]], ['style.dir', 'Advances from', 'select', { W: 'The west', E: 'The east', N: 'The north', S: 'The south', C: 'The middle' }], ['style.hatch', 'Hatching', 'switch'], ['style.arrows', 'Arrows on the front', 'switch'], ['style.flag', 'Flag when captured', 'switch'], ['style.label', 'Flag text', 'text'], ['style.font', 'Font', 'font']],
  vehicle: [['style.model3d', '3D model (instead of the flat symbol)', 'select', { '': 'None — flat symbol', ...MODEL_CHOICES }], ['style.alt3d', 'Flying height (3D)', 'range', [0, 300, 1], (L) => !!L.style.model3d && L.kind === 'bombing'], ['style.sizeMode', 'Size is', 'select', { screen: 'The same on screen', real: 'Real size (metres)' }, (L) => !!L.style.model3d], ['style.shadow', 'Shadow on the ground', 'switch', null, (L) => !!L.style.model3d], ['style.sprite', 'Vehicle', 'select', SPRITES], ['style.color', 'Accent colour', 'color'], ['style.size', 'Size', 'range', [0.4, 4, 0.05]], ['style.wake', 'Wake / trail', 'switch'], ['style.path', 'Show the path', 'switch'], ['style.label', 'Label', 'text']],
  chart: [['style.type', 'Type', 'select', { bar: 'Bar chart', hbar: 'Horizontal bars', line: 'Line chart', donut: 'Donut chart', counter: 'Counter', progress: 'Progress bars' }], ['style.title', 'Title', 'text'], ['style.data', 'Data (one “Label: value” per line)', 'textarea'], ['style.prefix', 'Before numbers', 'text'], ['style.suffix', 'After numbers', 'text'], ['style.position', 'Position', 'select', POS], ['style.size', 'Size', 'range', [0.5, 2, 0.05]], ['style.accent', 'Colour', 'color'], ['style.font', 'Font', 'font']],
  model3d: [['style.source', 'Model', 'model'], ['style.color', 'Accent colour (built-in models)', 'color'], ['style.size', 'Size', 'range', [0.1, 6, 0.05]], ['style.sizeMode', 'Size is', 'select', { screen: 'The same on screen at any zoom', real: 'Real-world metres (× size)' }], ['style.altitude', 'Height above ground', 'range', [0, 400, 1]], ['style.heading', 'Heading (°)', 'range', [-180, 180, 1]], ['style.pitch', 'Pitch (°)', 'range', [-90, 90, 1]], ['style.roll', 'Roll (°)', 'range', [-180, 180, 1]], ['style.motion', 'Motion', 'select', { none: 'None', move: 'Move along the path', spin: 'Spin', float: 'Float up and down' }], ['style.spinSpeed', 'Spin speed (°/s)', 'number', 1], ['style.yawOffset', 'Model faces (° offset)', 'number', 1], ['style.playAnim', 'Play the model’s own animation', 'switch']],
  videofx: [['style.media', 'Clip', 'video'], ['style.size', 'Size', 'range', [0.1, 6, 0.05]], ['style.rotation', 'Rotation (°)', 'range', [-180, 180, 1]], ['style.blend', 'Background', 'select', { screen: 'Black background (screen blend)', lighter: 'Black background (add light)', normal: 'Transparent / normal' }], ['style.opacity', 'Opacity', 'range', [0.05, 1, 0.01]], ['style.anchor', 'Anchor', 'select', { ground: 'Bottom on the point (explosions)', center: 'Centred on the point' }], ['style.speed', 'Playback speed', 'range', [0.25, 3, 0.05]], ['style.loop', 'Loop', 'switch'], ['style.flip', 'Mirror', 'switch'], ['style.boom', 'Add explosion sound', 'switch']],
  flicker: [['style.text', 'Text', 'text'], ['style.sub', 'Second line', 'text'], ['style.position', 'Position', 'select', { ...POS, top: 'Top', bottom: 'Bottom' }], ['style.color', 'Colour', 'color'], ['style.size', 'Size', 'range', [0.4, 3, 0.05]], ['style.font', 'Font', 'font'], ['style.box', 'Dark box behind', 'switch'], ['style.cursor', 'Blinking cursor', 'switch'], ['style.keepFlicker', 'Keep flickering a little', 'switch']],
  hud: [['style.variant', 'Style', 'select', { drone: 'Drone camera', satellite: 'Satellite feed', target: 'Target lock', minimal: 'Minimal frame', ...HUD_PLUS }], ['style.color', 'Colour', 'color'], ['style.label', 'Label', 'text'],
    ['style.text', 'Briefing lines', 'textarea', null, (L) => L.style.variant === 'mission'],
    ['style.polarity', 'Polarity', 'select', { white: 'White hot', black: 'Black hot' }, (L) => L.style.variant === 'thermal'],
    ['style.range', 'Range label', 'text', null, (L) => L.style.variant === 'radar'],
    ['style.speed', 'Sweep speed', 'range', [0.2, 3, 0.05], (L) => L.style.variant === 'radar'],
    ['style.size', 'Size', 'range', [0.5, 2.5, 0.05], (L) => ['radar', 'mission'].includes(L.style.variant)],
    ['style.position', 'Position', 'select', POS, (L) => ['radar', 'mission'].includes(L.style.variant)],
    ['style.classified', '“Classified” tag', 'switch', null, (L) => L.style.variant === 'tactical'],
    ['style.coords', 'Show coordinates', 'switch', null, (L) => !['radar', 'mission', 'scanner'].includes(L.style.variant)],
    ['style.rec', 'REC and timecode', 'switch', null, (L) => !HUD_PLUS[L.style.variant]],
    ['style.scan', 'Scan lines', 'switch', null, (L) => !HUD_PLUS[L.style.variant]]],
  hudtext: [['style.look', 'Style', 'select', HUDTEXT_STYLES], ['style.text', 'Text (one line each; “Label: value” for telemetry)', 'textarea', null, (L) => L.style.look !== 'coords'], ['style.label', 'Tag (empty = none)', 'text', null, (L) => L.style.look === 'ticker'], ['style.speed', 'Scroll speed', 'range', [0.1, 4, 0.05], (L) => L.style.look === 'ticker'], ['style.dir', 'Scrolls', 'select', { left: 'Right to left', right: 'Left to right' }, (L) => L.style.look === 'ticker'], ['style.sep', 'Separator', 'select', { '•': '•', '|': '|', '◆': '◆', '■': '■', '—': '—', '★': '★' }, (L) => L.style.look === 'ticker'], ['style.bg', 'Bar colour', 'color', null, (L) => L.style.look === 'ticker'], ['style.tagBg', 'Tag colour', 'color', null, (L) => L.style.look === 'ticker'], ['style.textColor', 'Text colour', 'color', null, (L) => L.style.look === 'ticker'], ['style.upper', 'CAPITALS', 'switch', null, (L) => L.style.look === 'ticker'], ['style.bold', 'Bold', 'switch', null, (L) => L.style.look === 'ticker'], ['style.clock', 'Clock (e.g. 20:45, empty = none)', 'text', null, (L) => L.style.look === 'ticker'], ['style.angle', 'Angle (°)', 'range', [-30, 30, 1], (L) => L.style.look === 'stamp'], ['style.live', 'Numbers tick live', 'switch', null, (L) => L.style.look === 'telemetry'], ['style.position', 'Position', 'select', { ...POS, top: 'Top', bottom: 'Bottom' }], ['style.color', 'Colour (empty = automatic)', 'color'], ['style.size', 'Size', 'range', [0.5, 3, 0.05]], ['style.font', 'Font', 'font']],
  target: [['style.look', 'Marker', 'select', TARGET_STYLES], ['style.color', 'Colour while acquiring', 'color'], ['style.lockColor', 'Colour when locked', 'color'], ['style.size', 'Size', 'range', [0.3, 4, 0.05]], ['style.label', 'Label', 'text'], ['style.lockText', 'Text when locked', 'text'], ['style.sub', 'Extra line', 'text'], ['style.showCoords', 'Show coordinates', 'switch']],
  image: [['style.media', 'Image', 'image'], ['style.opacity', 'Opacity', 'range', [0.05, 1, 0.01]], ['style.blend', 'Blend', 'select', { normal: 'Normal', multiply: 'Multiply (scans, old maps)', screen: 'Screen (dark backgrounds)' }], ['style.dir', 'Wipe from', 'select', { lr: 'Left', rl: 'Right', tb: 'Top', bt: 'Bottom' }, (L) => L.anim === 'wipe'], ['style.border', 'Border', 'switch'], ['style.borderColor', 'Border colour', 'color', null, (L) => L.style.border]],
  compare: [['style.media', 'Before image', 'image'], ['style.media2', 'After image', 'image'], ['style.mode', 'Effect', 'select', { swipe: 'Swipe across', pingpong: 'Swipe back and forth', split: 'Slide to split screen', fade: 'Cross-fade' }], ['style.dir', 'Swipe from', 'select', { lr: 'Left', rl: 'Right', tb: 'Top', bt: 'Bottom' }, (L) => L.style.mode !== 'fade'], ['style.cycles', 'Times back and forth', 'number', 1, (L) => L.style.mode === 'pingpong'], ['style.labels', 'BEFORE / AFTER tags', 'switch'], ['style.labelA', 'Before tag', 'text', null, (L) => L.style.labels !== false], ['style.labelB', 'After tag', 'text', null, (L) => L.style.labels !== false], ['style.lineColor', 'Line colour', 'color'], ['style.editSplit', 'Preview split while editing', 'range', [0, 1, 0.01]], ['style.opacity', 'Opacity', 'range', [0.05, 1, 0.01]]],
  title: [['style.look', 'Style', 'select', TITLE_LOOKS], ['style.text', 'Title', 'text', null, (L) => L.style.look !== 'credits'], ['style.sub', 'Second line', 'text', null, (L) => L.style.look !== 'credits'], ['style.lines', 'Credits (“Role: Name” per line, plain lines are headings)', 'textarea', null, (L) => L.style.look === 'credits'], ['style.font', 'Font', 'font'], ['style.color', 'Colour', 'color'], ['style.accent', 'Accent colour', 'color'], ['style.size', 'Size', 'range', [0.4, 2.5, 0.05]], ['style.dim', 'Darken the picture', 'range', [0, 1, 0.05]], ['style.flare', 'Light sweep', 'switch', null, (L) => L.style.look === 'cinematic'], ['style.position', 'Position', 'select', { center: 'Default', ...CUSTOM_POS }, (L) => L.style.look !== 'credits']],
  news: [['style.look', 'Style', 'select', NEWS_LOOKS], ['style.channel', 'Channel name', 'text'], ['style.media', 'Logo image (optional)', 'image'], ['style.text', 'Headline', 'text', null, (L) => ['breaking', 'headline'].includes(L.style.look)], ['style.sub', 'Second line', 'text', null, (L) => ['breaking', 'headline'].includes(L.style.look)], ['style.tag', 'Banner text', 'text', null, (L) => L.style.look === 'breaking'], ['style.location', 'Location', 'text', null, (L) => L.style.look === 'live'], ['style.live', 'LIVE under the logo', 'switch', null, (L) => L.style.look === 'bug'], ['style.showClock', 'Clock', 'switch', null, (L) => L.style.look !== 'bug'], ['style.clock', 'Clock starts at', 'text', null, (L) => L.style.look !== 'bug' && L.style.showClock], ['style.color', 'Channel colour', 'color'], ['style.bg', 'Bar colour', 'color', null, (L) => L.style.look !== 'bug'], ['style.textColor', 'Text colour', 'color', null, (L) => L.style.look !== 'bug'], ['style.size', 'Size', 'range', [0.5, 2.5, 0.05]], ['style.opacity', 'Opacity', 'range', [0.2, 1, 0.01], (L) => L.style.look === 'bug'], ['style.font', 'Font', 'font'], ['style.position', 'Position', 'select', { '': 'Default', 'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right', ...CUSTOM_POS }]],
  effect: [['style.look', 'Effect', 'select', EFFECT_LOOKS], ['style.amount', 'Strength', 'range', [0.05, 2, 0.05]], ['style.color', 'Colour', 'color', null, (L) => ['flash', 'lightleak'].includes(L.style.look)], ['style.speed', 'Speed', 'range', [0.2, 3, 0.05], (L) => ['rain', 'snow', 'shake'].includes(L.style.look)], ['style.label', 'Corner text', 'text', null, (L) => L.style.look === 'vhs'], ['style.stamp', 'Date stamp', 'text', null, (L) => L.style.look === 'vhs']],
  video: [['style.media', 'Video', 'video'], ['style.fit', 'Show as', 'select', { pip: 'Picture in picture', full: 'Full screen' }], ['style.width', 'Width', 'range', [0.1, 1, 0.01], (L) => L.style.fit !== 'full'], ['style.position', 'Position', 'select', { ...POS }, (L) => L.style.fit !== 'full'], ['style.radius', 'Rounded corners', 'range', [0, 40, 1], (L) => L.style.fit !== 'full'], ['style.border', 'Border', 'range', [0, 12, 0.5], (L) => L.style.fit !== 'full'], ['style.borderColor', 'Border colour', 'color', null, (L) => L.style.fit !== 'full'], ['style.caption', 'Caption tag', 'text', null, (L) => L.style.fit !== 'full'], ['style.shadow', 'Shadow', 'switch', null, (L) => L.style.fit !== 'full'], ['style.opacity', 'Opacity', 'range', [0.05, 1, 0.01]], ['style.speed', 'Playback speed', 'range', [0.25, 3, 0.05]], ['style.trim', 'Start the clip at (s)', 'number', 0.1], ['style.loop', 'Loop', 'switch']],
  collision: [['style.modelA', 'Vehicle 1 (from the start)', 'select', MODEL_CHOICES], ['style.colorA', 'Colour 1', 'color'], ['style.modelB', 'Vehicle 2 (from the end)', 'select', MODEL_CHOICES], ['style.colorB', 'Colour 2', 'color'], ['style.meetAt', 'Crash point along the line', 'range', [0.05, 0.95, 0.01]], ['style.size', 'Size', 'range', [0.3, 6, 0.05]], ['style.sizeMode', 'Size is', 'select', { screen: 'The same on screen at any zoom', real: 'Real size (metres)' }], ['style.blast', 'Explosion size', 'range', [0, 4, 0.05]], ['style.track', 'Show the railway track', 'switch'], ['style.label', 'Label at the crash', 'text']],
  city3d: [['style.look', 'Time of day', 'select', { day: 'Day', night: 'Night (lit windows)' }], ['style.minH', 'Lowest building (m)', 'range', [3, 100, 1]], ['style.maxH', 'Tallest building (m)', 'range', [20, 600, 5]], ['style.block', 'Block size (m)', 'range', [25, 200, 1]], ['style.groundBlocks', 'Paved blocks', 'switch'], ['style.seed', 'Shuffle', 'number', 1]],
  cyclone: [['style.name', 'Storm name (empty = no label)', 'text'], ['style.cats', 'Category at each point (TD, TS, 1–5)', 'text'], ['style.labels', 'Label at each point (one per line, e.g. dates)', 'textarea'], ['style.forecast', 'Forecast part (dashed) with cone', 'switch'], ['style.forecastFrom', 'Forecast starts at', 'range', [0, 1, 0.01], (L) => L.style.forecast], ['style.coneKm', 'Cone width at the end (km)', 'range', [50, 1000, 10], (L) => L.style.forecast], ['style.clouds', 'Satellite-style storm cloud', 'switch'], ['style.radiusKm', 'Storm size (km)', 'range', [50, 1200, 10], (L) => L.style.clouds !== false], ['style.spin', 'Spin speed', 'range', [0, 4, 0.05]], ['style.symbol', 'Cyclone symbol', 'switch'], ['style.windRings', 'Wind radii rings', 'switch'], ['style.reveal', 'Draw the track as it moves', 'switch'], ['style.legend', 'Category legend', 'switch'], ['style.editAt', 'Preview position while editing', 'range', [0, 1, 0.01]], ['style.width', 'Track width', 'range', [0.4, 3, 0.05]]],
  pressure: [['style.type', 'Type', 'select', { L: 'Low pressure (L)', H: 'High pressure (H)' }], ['style.hpa', 'Centre pressure (hPa)', 'number', 1], ['style.step', 'Isobar step (hPa)', 'number', 1], ['style.rings', 'Isobars', 'range', [0, 12, 1]], ['style.spacingKm', 'Spacing (km)', 'range', [20, 600, 5]], ['style.values', 'Values on isobars', 'switch'], ['style.arrows', 'Wind circulation arrows', 'switch'], ['style.showValue', 'Value under the letter', 'switch'], ['style.size', 'Letter size', 'range', [0.4, 3, 0.05]], ['style.color', 'Letter colour (empty = red L / blue H)', 'color'], ['style.isobarColor', 'Isobar colour', 'color'], ['style.animate', 'Isobars drift slowly', 'switch']],
  front: [['style.type', 'Front', 'select', FRONT_TYPES], ['style.size', 'Size', 'range', [0.4, 3, 0.05]], ['style.flip', 'Symbols on the other side', 'switch'], ['style.color', 'Colour (empty = standard)', 'color']],
  wxpoint: [['style.icon', 'Weather', 'select', WX_ICONS], ['style.temp', 'Temperature', 'text'], ['style.name', 'Place name', 'text'], ['style.size', 'Size', 'range', [0.4, 3, 0.05]], ['style.box', 'Box behind', 'switch'], ['style.bg', 'Box colour', 'color', null, (L) => L.style.box !== false]],
  wxfield: [['style.field', 'Show', 'select', FIELD_TYPES], ['style.source', 'Data', 'select', { pattern: 'Realistic pattern (made up)', live: 'Live now (Open-Meteo)' }], ['style.opacity', 'Opacity', 'range', [0.1, 1, 0.01]], ['style.min', 'Lowest value on the scale', 'number', 1, (L) => ['temp', 'pressure'].includes(L.style.field)], ['style.max', 'Highest value on the scale', 'number', 1], ['style.scale', 'Pattern detail', 'range', [0.5, 8, 0.1], (L) => L.style.source !== 'live'], ['style.amount', 'Rain amount', 'range', [0.3, 2, 0.05], (L) => L.style.field === 'rain' && L.style.source !== 'live'], ['style.windDir', 'Wind from (° — 0 = north)', 'range', [0, 359, 1], (L) => L.style.source !== 'live'], ['style.speed', 'Motion speed', 'range', [0, 4, 0.05]], ['style.animate', 'Rain moves', 'switch', null, (L) => L.style.field === 'rain'], ['style.particles', 'Wind streaks', 'range', [50, 2000, 10], (L) => L.style.field === 'wind' || L.style.windOverlay], ['style.windOverlay', 'Add wind streaks on top', 'switch', null, (L) => L.style.field !== 'wind'], ['style.shade', 'Colour shading', 'switch', null, (L) => L.style.field === 'wind'], ['style.steps', 'Colour bands (0 = smooth)', 'range', [0, 16, 1]], ['style.labels', 'Values on the map', 'switch', null, (L) => L.style.field !== 'rain'], ['style.legend', 'Legend', 'switch'], ['style.title', 'Legend title', 'text', null, (L) => L.style.legend !== false], ['style.blend', 'Blend', 'select', { normal: 'Normal', multiply: 'Multiply (keeps map detail)' }], ['style.seed', 'Shuffle pattern', 'number', 1, (L) => L.style.source !== 'live']],
  forecast: [['style.look', 'Style', 'select', FORECAST_LOOKS], ['style.title', 'Title', 'text'], ['style.data', 'Data — one per line: Name | icon | temp | low | note', 'textarea'], ['style.level', 'Warning level', 'select', { yellow: 'Yellow', orange: 'Orange', red: 'Red' }, (L) => L.style.look === 'warning'], ['style.color', 'Colour', 'color'], ['style.size', 'Size', 'range', [0.5, 2, 0.05]], ['style.fahrenheit', 'Show °F', 'switch', null, (L) => L.style.look !== 'warning'], ['style.position', 'Position', 'select', { '': 'Default', 'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right', ...CUSTOM_POS }]],
  trees: [['style.type', 'Trees', 'select', TREE_TYPES], ['style.density', 'Trees per hectare', 'range', [2, 200, 1], (L) => L.geom?.type === 'Polygon'], ['style.spacing', 'Spacing (m)', 'range', [4, 60, 1], (L) => L.geom?.type === 'LineString'], ['style.bothSides', 'Both sides of the line', 'switch', null, (L) => L.geom?.type === 'LineString'], ['style.height', 'Tree height (m)', 'range', [3, 40, 1]], ['style.exaggerate', 'Exaggerate size', 'range', [1, 8, 0.1]], ['style.view', 'Look', 'select', { auto: 'Side view when tilted, from above when flat', side: 'Always side view' }], ['style.seed', 'Shuffle', 'number', 1]],
  timeseries: [['style.frames', 'Dates', 'frames'], ['style.per', 'Seconds per date', 'number', 0.1], ['style.fade', 'Cross-fade (s)', 'number', 0.1], ['style.editFrame', 'Preview date while editing', 'range', [0, 30, 1]], ['style.label', 'Year label', 'select', { show: 'Show', none: 'Hide' }], ['style.position', 'Label position', 'select', POS, (L) => L.style.label !== 'none'], ['style.labelSize', 'Label size', 'range', [0.4, 2.5, 0.05], (L) => L.style.label !== 'none'], ['style.labelColor', 'Label colour', 'color', null, (L) => L.style.label !== 'none'], ['style.accent', 'Accent colour', 'color', null, (L) => L.style.label !== 'none'], ['style.bar', 'Timeline bar under the year', 'switch', null, (L) => L.style.label !== 'none'], ['style.labelBox', 'Dark box behind', 'switch', null, (L) => L.style.label !== 'none'], ['style.opacity', 'Opacity', 'range', [0.05, 1, 0.01]]],
};
export const FX_SCREEN = new Set(['chart', 'hud', 'flicker', 'hudtext', 'title', 'news', 'effect', 'video']);
export const FX_BELOW = new Set(['capture']);

// ---------------------------------------------------------------- geometry helpers
function screenPath(coords, proj) {
  const pts = coords.map(proj);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum.at(-1) || 0, coords };
}
function at(P, u) {
  const { pts, cum, len, coords } = P;
  if (pts.length < 2 || len === 0) return { p: pts[0], ll: coords[0], ang: 0 };
  const target = clamp(u, 0, 1) * len;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < target) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const f = (target - cum[i - 1]) / seg;
  const a = pts[i - 1], b = pts[i];
  const la = coords[i - 1], lb = coords[i];
  return {
    p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f],
    ll: [la[0] + (lb[0] - la[0]) * f, la[1] + (lb[1] - la[1]) * f],
    ang: Math.atan2(b[1] - a[1], b[0] - a[0]),
  };
}
/** Stroke a polyline, skipping segments far outside the canvas (keeps huge orbit tracks cheap). */
function strokeVisible(ctx, pts) {
  const W = ctx.canvas.width, H = ctx.canvas.height, m = Math.max(W, H);
  ctx.beginPath();
  let pen = false;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const out = (Math.max(a[0], b[0]) < -m) || (Math.min(a[0], b[0]) > W + m) || (Math.max(a[1], b[1]) < -m) || (Math.min(a[1], b[1]) > H + m) || Math.hypot(b[0] - a[0], b[1] - a[1]) > 8 * m;
    if (out) { pen = false; continue; }
    if (!pen) { ctx.moveTo(a[0], a[1]); pen = true; }
    ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
}
const onScreen = (ctx, p, pad = 0) => p[0] > -pad && p[1] > -pad && p[0] < ctx.canvas.width + pad && p[1] < ctx.canvas.height + pad;
const kmToPx = (ll, km, proj) => {
  const a = proj(ll), b = proj([ll[0], ll[1] + km / 111.32]);
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
};
function ringPath(ctx, proj, geom) {
  ctx.beginPath();
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  for (const poly of polys) for (const ring of poly) {
    ring.forEach((c, i) => { const p = proj(c); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.closePath();
  }
}
const linesOf = (g) => (g.type === 'LineString' ? g.coordinates : g.type === 'MultiLineString' ? g.coordinates.flat() : []);

/** Ground track of an orbit through a point (simple circular orbit, Earth rotation included). */
export function orbitTrack(lng0, lat0, inclination = 51.6, revs = 1) {
  const i = (Math.min(89.9, Math.max(Math.abs(lat0) + 0.01, inclination)) * Math.PI) / 180;
  const th0 = Math.asin(clamp(Math.sin((lat0 * Math.PI) / 180) / Math.sin(i), -1, 1));
  const lonAt = (th) => Math.atan2(Math.cos(i) * Math.sin(th), Math.cos(th)) * 180 / Math.PI;
  const out = [];
  const n = 360 * revs;
  const earth = 360 / 15.5; // ° of Earth rotation per orbit (~92 min)
  let prev = null, off = 0;
  for (let k = 0; k <= n; k++) {
    const th = th0 - Math.PI + (k / n) * 2 * Math.PI * revs;
    let lon = lonAt(th) - lonAt(th0) + lng0 - earth * ((th - th0) / (2 * Math.PI));
    const lat = (Math.asin(Math.sin(i) * Math.sin(th)) * 180) / Math.PI;
    if (prev != null) { while (lon + off - prev > 180) off -= 360; while (lon + off - prev < -180) off += 360; }
    prev = lon + off;
    out.push([+(lon + off).toFixed(4), +lat.toFixed(4)]);
  }
  return out;
}

// ---------------------------------------------------------------- blasts
function cloudPuff(ctx, x, y, r, col, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hexA(col, a));
  g.addColorStop(0.6, hexA(col, a * 0.6));
  g.addColorStop(1, hexA(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
/** Explosion at (x,y). tau = seconds since detonation. R = base radius px. */
export function drawBlast(ctx, x, y, R, tau, seed = 1, o = {}) {
  drawExplosion(ctx, x, y, R * 1.15, tau, seed, o);
}

// ---------------------------------------------------------------- satellites
function drawSatellite(ctx, L, tm, proj, unit, phase, coords) {
  const s = L.style;
  if (coords.length < 2) return;
  const P = screenPath(coords, proj);
  const u = tm.edit ? 0.5 : clamp(tm.tau / Math.max(0.1, L.duration), 0, 1);
  const g = at(P, u);
  const hw = s.imaging ? kmToPx(g.ll, (+s.swathKm || 40) / 2, proj) : 0;
  const col = s.color || '#36d1ff';
  if (phase === 'below') {
    if (s.track) {
      ctx.save();
      ctx.setLineDash([6 * unit, 6 * unit]);
      ctx.strokeStyle = hexA(col, 0.55);
      ctx.lineWidth = 1.5 * unit;
      strokeVisible(ctx, P.pts);
      ctx.restore();
    }
    if (s.imaging && hw > 0.5 && u > 0 && hw < ctx.canvas.width) {
      const left = [], right = [];
      const N = 80;
      for (let k = 0; k <= N; k++) {
        const q = at(P, (k / N) * u);
        const nx = -Math.sin(q.ang), ny = Math.cos(q.ang);
        left.push([q.p[0] + nx * hw, q.p[1] + ny * hw]);
        right.push([q.p[0] - nx * hw, q.p[1] - ny * hw]);
      }
      ctx.save();
      ctx.beginPath();
      left.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      for (let k = right.length - 1; k >= 0; k--) ctx.lineTo(right[k][0], right[k][1]);
      ctx.closePath();
      ctx.fillStyle = hexA(col, 0.16 * tm.alpha);
      ctx.fill();
      ctx.clip();
      // imaging scan lines across the strip
      ctx.strokeStyle = hexA(col, 0.22 * tm.alpha);
      ctx.lineWidth = 1 * unit;
      const total = P.len * u;
      const step = Math.max(3 * unit, 2, total / 1500);
      for (let d = 0; d < total; d += step) {
        const q = at(P, d / P.len);
        if (!onScreen(ctx, q.p, hw)) continue;
        const nx = -Math.sin(q.ang), ny = Math.cos(q.ang);
        ctx.beginPath(); ctx.moveTo(q.p[0] + nx * hw, q.p[1] + ny * hw); ctx.lineTo(q.p[0] - nx * hw, q.p[1] - ny * hw); ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = hexA(col, 0.8 * tm.alpha);
      ctx.lineWidth = 1.2 * unit;
      ctx.setLineDash([4 * unit, 3 * unit]);
      for (const side of [left, right]) strokeVisible(ctx, side);
      ctx.restore();
    }
    return;
  }
  // above: beam + spacecraft
  if (!onScreen(ctx, g.p, ctx.canvas.width)) return;
  const alt = (+s.alt || 0) * unit;
  const sx = g.p[0], sy = g.p[1] - alt;
  const nx = -Math.sin(g.ang), ny = Math.cos(g.ang);
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  if (s.imaging && s.beam !== false && hw > 0.5) {
    const a = [g.p[0] + nx * hw, g.p[1] + ny * hw], b = [g.p[0] - nx * hw, g.p[1] - ny * hw];
    const gr = ctx.createLinearGradient(sx, sy, g.p[0], g.p[1]);
    gr.addColorStop(0, hexA(col, 0.55));
    gr.addColorStop(1, hexA(col, 0.12));
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.closePath(); ctx.fill();
    const fl = 0.6 + 0.4 * Math.sin(tm.tau * 30);
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * fl})`;
    ctx.lineWidth = 2.2 * unit;
    ctx.shadowColor = col; ctx.shadowBlur = 10 * unit;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.shadowBlur = 0;
  }
  if (alt > 2) {
    ctx.setLineDash([2 * unit, 4 * unit]);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1 * unit;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(g.p[0], g.p[1]); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(g.p[0], g.p[1], 2.5 * unit, 0, Math.PI * 2); ctx.fill();
  }
  const size = (s.sprite === 'iss' ? 30 : 22) * unit * (+s.size || 1);
  drawSprite(ctx, s.sprite || 'satellite', sx, sy, g.ang, size, { color: col, t: tm.tau, shadow: 0 });
  if (s.label) {
    ctx.font = `700 ${11 * unit}px ${MONO}`;
    ctx.textBaseline = 'middle';
    const tx = sx + size * 0.9 + 6 * unit, ty = sy - size * 0.6;
    ctx.fillStyle = 'rgba(8,12,18,0.65)';
    const tw = ctx.measureText(s.label).width;
    ctx.fillRect(tx - 4 * unit, ty - 8 * unit, tw + 8 * unit, 16 * unit);
    ctx.fillStyle = col;
    ctx.fillText(s.label, tx, ty);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- launch site
function drawLaunch(ctx, L, tm, proj, unit, frame) {
  const s = L.style;
  const [x, y] = proj(L.geom.coordinates);
  const k = +s.size || 1;
  const h = 64 * unit * k;
  const tau = tm.edit ? 0 : tm.tau;
  const D = Math.max(2, L.duration);
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  // pad & tower
  ctx.fillStyle = 'rgba(40,44,50,0.55)';
  ctx.beginPath(); ctx.ellipse(x, y, h * 0.55, h * 0.18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6d747b';
  ctx.fillRect(x - h * 0.42, y - h * 0.04, h * 0.84, h * 0.08);
  ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2 * unit * k;
  const tx = x + h * 0.24;
  ctx.strokeRect(tx - h * 0.04, y - h * 1.05, h * 0.08, h * 1.05);
  for (let i = 0; i < 8; i++) { const yy = y - (i * h * 1.05) / 8; ctx.beginPath(); ctx.moveTo(tx - h * 0.04, yy); ctx.lineTo(tx + h * 0.04, yy - h * 0.13); ctx.stroke(); }
  // rocket
  const lift = 1.2;
  let rise = 0, ang = 0, flame = 0;
  if (tau > 0.2) flame = Math.min(1, (tau - 0.2) * 2);
  if (tau > lift) {
    const tt = tau - lift;
    const acc = (2 * (frame ? frame.h : 600) * 1.2) / Math.max(0.5, (D - lift) ** 2);
    rise = 0.5 * acc * tt * tt;
    ang = clamp(tt * 0.14, 0, 0.5) * (+s.tilt || 0);
  }
  // billowing steam/smoke at the pad
  if (s.smoke !== false && tau > 0.2) {
    const rnd = rng(hashStr(L.id));
    for (let i = 0; i < 16; i++) {
      const dir = rnd() > 0.5 ? 1 : -1, sp = h * (0.5 + rnd() * 1.1), st = 0.2 + rnd() * 1.4, rot = rnd() * 6;
      const tt = tau - st;
      if (tt < 0) continue;
      const q = Math.min(1, tt / 7);
      drawPuff(ctx, x + dir * sp * easeOut(tt / 2.5), y - h * 0.08 - h * 0.25 * q, h * (0.22 + 0.6 * q), rot + tt * 0.1, 0.9 * (1 - q * 0.85), 'dust');
    }
  }
  // short exhaust plume behind the climbing rocket: puffs that expand and fade (no long line)
  if (tau > lift) {
    const acc = (2 * (frame ? frame.h : 600) * 1.2) / Math.max(0.5, (D - lift) ** 2);
    const posAt = (tt) => { const r2 = 0.5 * acc * tt * tt, a2 = clamp(tt * 0.14, 0, 0.5) * (+s.tilt || 0); return [x + Math.sin(a2) * r2 * 0.5, y - r2]; };
    const now = tau - lift;
    for (let k = 0; k < 22; k++) {
      const age = k * 0.09;
      const tt = now - age;
      if (tt < 0) break;
      const [px, py] = posAt(tt);
      const q = age / 2;
      drawPuff(ctx, px + Math.sin(k * 1.7) * h * 0.04 * k * 0.3, py + h * 0.05, h * (0.08 + q * 0.45), k * 0.9, 0.7 * (1 - q) * (1 - q), 'smoke');
    }
  }
  ctx.save();
  const rx = x + Math.sin(ang) * rise * 0.5, ry = y - rise;
  ctx.translate(rx, ry); ctx.rotate(ang); ctx.translate(-rx, -ry);
  drawRocketSide(ctx, rx, ry, h, tau, flame);
  ctx.restore();
  if (s.label) {
    ctx.font = `800 ${12 * unit * Math.min(1.4, k)}px ${UI}`;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(10,12,16,0.85)'; ctx.lineWidth = 4 * unit;
    ctx.strokeText(s.label, x, y + h * 0.42);
    ctx.fillStyle = '#ffffff'; ctx.fillText(s.label, x, y + h * 0.42);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- trajectories & vehicles
function drawTrajectory(ctx, L, tm, proj, unit) {
  const s = L.style;
  const coords = linesOf(L.geom);
  if (coords.length < 2) return;
  const P = screenPath(coords, proj);
  const D = Math.max(0.2, L.duration);
  const tau = tm.edit ? D * 0.6 : tm.tau;
  const veh = s.vehicle || 'missile';
  const ballistic = veh === 'missile' || veh === 'rocket';
  const u0 = clamp(tau / D, 0, 1);
  const u = ballistic ? (0.35 * u0 + 0.65 * easeIn(u0)) : veh === 'drone' || veh === 'quad' ? u0 : ease(u0);
  const H = (+s.arc || 0) * P.len * (veh === 'rocket' ? 0.55 : 0.35) * (ballistic ? 1 : 0.15);
  const pos = (v) => { const q = at(P, v); return { g: q.p, a: [q.p[0], q.p[1] - H * 4 * v * (1 - v)], ang: q.ang }; };
  const col = s.color || '#ff3b30';
  const size = (ballistic ? 16 : 20) * unit * (+s.size || 1);
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  // planned path
  if (s.path) {
    ctx.setLineDash([5 * unit, 5 * unit]);
    ctx.strokeStyle = hexA(col, 0.45);
    ctx.lineWidth = 1.5 * unit;
    ctx.beginPath();
    for (let k = 0; k <= 60; k++) { const q = pos(k / 60).a; if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
    ctx.stroke();
    ctx.setLineDash([]);
    const e = P.pts.at(-1);
    ctx.strokeStyle = hexA(col, 0.8); ctx.lineWidth = 2 * unit;
    for (const r of [8, 14]) { ctx.beginPath(); ctx.arc(e[0], e[1], r * unit, 0, Math.PI * 2); ctx.stroke(); }
  }
  // launch puff
  const s0 = P.pts[0];
  if (tau < 3) for (let k = 0; k < 4; k++) cloudPuff(ctx, s0[0] + (k - 1.5) * 5 * unit, s0[1] - k * 3 * unit, (8 + tau * 10) * unit, '#cfcac2', 0.5 * (1 - tau / 3));
  // trail
  if (s.trail !== false && u > 0) {
    const N = 50;
    ctx.lineCap = 'round';
    let prev = pos(0).a;
    for (let k = 1; k <= N; k++) {
      const v = (k / N) * u;
      const q = pos(v).a;
      const age = 1 - k / N;
      if (ballistic) {
        ctx.strokeStyle = `rgba(235,232,226,${0.75 * (1 - age * 0.85)})`;
        ctx.lineWidth = (2 + age * 6) * unit;
      } else {
        ctx.strokeStyle = hexA(col, 0.6 * (1 - age * 0.7));
        ctx.lineWidth = 2 * unit;
        ctx.setLineDash(k % 2 ? [] : [3 * unit, 3 * unit]);
      }
      ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      prev = q;
    }
    ctx.setLineDash([]);
    if (H > 2) {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 2 * unit;
      ctx.beginPath(); P.pts.forEach((p, i) => { if (i / (P.pts.length - 1) <= u + 1e-6) (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); }); ctx.stroke();
    }
  }
  const arrived = tau >= D;
  // vehicle
  if (!arrived || (!ballistic && !s.impact)) {
    let q = pos(u), a2 = pos(Math.min(1, u + 0.01)).a, a1 = pos(Math.max(0, u - 0.01)).a;
    let ang = Math.atan2(a2[1] - a1[1], a2[0] - a1[0]);
    let [x, y] = q.a;
    let altPx = q.g[1] - q.a[1];
    if (arrived && s.loiter && !ballistic) {
      const e = P.pts.at(-1), r = 34 * unit, w = (tau - D) * 1.4;
      x = e[0] + Math.cos(w) * r; y = e[1] + Math.sin(w) * r * 0.75; ang = w + Math.PI / 2; altPx = 10 * unit;
    }
    if (!s.model3d) drawSprite(ctx, veh, x, y, ang, size, { color: col, t: tau, alt: Math.max(4 * unit, altPx * 0.6 + 6 * unit) });
  } else if (arrived && s.loiter && !ballistic) {
    // handled above
  }
  if (s.impact && arrived) {
    const e = P.pts.at(-1);
    drawBlast(ctx, e[0], e[1], 22 * unit * (+s.size || 1), tau - D, hashStr(L.id), { scorch: true });
  }
  ctx.restore();
}

function drawVehicle(ctx, L, tm, proj, unit) {
  const s = L.style;
  const coords = linesOf(L.geom);
  if (coords.length < 2) return;
  const P = screenPath(coords, proj);
  const u = tm.edit ? 0.5 : ease(tm.tau / Math.max(0.1, L.duration));
  const q = at(P, u);
  const a2 = at(P, Math.min(1, u + 0.005)).p, a1 = at(P, Math.max(0, u - 0.005)).p;
  const ang = Math.atan2(a2[1] - a1[1], a2[0] - a1[0]);
  const size = 22 * unit * (+s.size || 1);
  const sea = ['warship', 'cargo', 'submarine'].includes(s.sprite);
  const air = ['jet', 'airliner', 'drone', 'quad', 'helicopter', 'missile', 'rocket', 'satellite', 'iss'].includes(s.sprite);
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  if (s.path) {
    ctx.setLineDash([4 * unit, 5 * unit]);
    ctx.strokeStyle = hexA(s.color || '#ffd23f', 0.6);
    ctx.lineWidth = 1.5 * unit;
    ctx.beginPath(); P.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (s.wake !== false && u > 0) {
    const N = 30, back = Math.min(u, (size * 6) / Math.max(1, P.len));
    for (let k = N; k >= 1; k--) {
      const v = u - (k / N) * back;
      if (v < 0) continue;
      const w = at(P, v);
      const age = k / N;
      if (sea) {
        const nx = -Math.sin(w.ang), ny = Math.cos(w.ang), spread = size * 0.25 * (0.4 + age * 1.6);
        ctx.fillStyle = `rgba(255,255,255,${0.45 * (1 - age)})`;
        for (const sd of [1, -1]) { ctx.beginPath(); ctx.arc(w.p[0] + nx * spread * sd, w.p[1] + ny * spread * sd, size * 0.06 * (1 + age), 0, Math.PI * 2); ctx.fill(); }
      } else {
        ctx.fillStyle = air ? `rgba(240,240,240,${0.5 * (1 - age)})` : `rgba(60,50,40,${0.3 * (1 - age)})`;
        ctx.beginPath(); ctx.arc(w.p[0], w.p[1], size * 0.07 * (1 + age * 1.5), 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  if (!s.model3d) drawSprite(ctx, s.sprite || 'warship', q.p[0], q.p[1], ang, size, { color: s.color, t: tm.tau, alt: air ? size * 0.7 : size * 0.12 });
  if (s.label) {
    ctx.font = `700 ${12 * unit}px ${UI}`;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(10,12,16,0.85)'; ctx.lineWidth = 4 * unit;
    ctx.strokeText(s.label, q.p[0] + size * 1.1, q.p[1] - size * 0.6);
    ctx.fillStyle = '#fff'; ctx.fillText(s.label, q.p[0] + size * 1.1, q.p[1] - size * 0.6);
  }
  ctx.restore();
}

function drawStrike(ctx, L, tm, proj, unit) {
  const s = L.style;
  const [x, y] = proj(L.geom.coordinates);
  const R = 24 * unit * (+s.size || 1);
  const det = s.incoming ? 0.7 : 0;
  const tau = tm.edit ? 0.45 + det : tm.tau;
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  if (s.incoming && tau < det) {
    const q = tau / det;
    const sx = x - R * 6, sy = y - R * 9;
    const px = sx + (x - sx) * easeIn(q), py = sy + (y - sy) * easeIn(q);
    const g = ctx.createLinearGradient(sx, sy, px, py);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,230,180,0.95)');
    ctx.strokeStyle = g; ctx.lineWidth = 3 * unit; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px - (x - sx) * 0.25, py - (y - sy) * 0.25); ctx.lineTo(px, py); ctx.stroke();
    ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(px, py, 3 * unit, 0, Math.PI * 2); ctx.fill();
  }
  drawBlast(ctx, x, y, R, tau - det, hashStr(L.id), { scorch: s.scorch, flash: s.flash });
  ctx.restore();
}

function drawBombing(ctx, L, tm, proj, unit, phase) {
  const s = L.style;
  const coords = linesOf(L.geom);
  if (coords.length < 2) return;
  const P = screenPath(coords, proj);
  const D = Math.max(0.3, L.duration);
  const tau = tm.edit ? D * 0.7 : tm.tau;
  const n = clamp(Math.round(+s.count || 6), 1, 40);
  const R = 18 * unit * (+s.blast || 1);
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const tDet = f * D + 0.35;
    if (tau < tDet) continue;
    const q = at(P, f);
    const jit = rng(hashStr(L.id) + i)();
    drawBlast(ctx, q.p[0] + (jit - 0.5) * R * 0.6, q.p[1] + (jit - 0.5) * R * 0.4, R * (0.8 + jit * 0.4), tau - tDet, hashStr(L.id) + i * 97, { scorch: s.scorch });
  }
  if (s.sprite !== 'none' && !s.model3d && tau <= D + 0.5) {
    const u = tau / D;
    const q = at(P, clamp(u, 0, 1));
    const ext = u > 1 ? (u - 1) * P.len : 0;
    const x = q.p[0] + Math.cos(q.ang) * ext, y = q.p[1] + Math.sin(q.ang) * ext;
    const size = 24 * unit * (+s.size || 1);
    ctx.globalAlpha *= u > 1 ? Math.max(0, 1 - (u - 1) * 4) : 1;
    drawSprite(ctx, s.sprite || 'jet', x, y - size * 0.8, q.ang, size, { color: s.color, t: tau, alt: size * 0.8 });
  }
  ctx.restore();
}

// ---------------------------------------------------------------- capture area
function centroidOf(geom) {
  const ring = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
  let x = 0, y = 0;
  ring.forEach((c) => { x += c[0]; y += c[1]; });
  return [x / ring.length, y / ring.length];
}
function drawCapture(ctx, L, tm, proj, unit) {
  const s = L.style;
  const col = s.color || '#e53935';
  const u = L.anim === 'none' || tm.edit ? 1 : L.anim === 'fade' ? 1 : ease(tm.tau / Math.max(0.1, L.duration));
  let alpha = tm.alpha * (L.anim === 'fade' && !tm.edit ? ease(tm.tau / Math.max(0.1, L.duration)) : 1);
  const coords = (L.geom.type === 'Polygon' ? L.geom.coordinates.flat() : L.geom.coordinates.flat(2)).map(proj);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of coords) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const w = x1 - x0, h = y1 - y0;
  const dir = s.dir || 'W';
  const c = proj(centroidOf(L.geom));
  ctx.save();
  ctx.globalAlpha *= alpha;
  ringPath(ctx, proj, L.geom);
  ctx.save();
  ctx.clip('evenodd');
  ctx.beginPath();
  let front = null;
  if (dir === 'C') {
    const R = Math.hypot(w, h) * 0.75 * u;
    ctx.arc(c[0], c[1], R, 0, Math.PI * 2);
    front = { type: 'circle', R };
  } else {
    const k = u;
    if (dir === 'W') { ctx.rect(x0 - 2, y0 - 2, w * k + 2, h + 4); front = { x: x0 + w * k, vertical: true, sgn: 1 }; }
    if (dir === 'E') { ctx.rect(x1 - w * k, y0 - 2, w * k + 2, h + 4); front = { x: x1 - w * k, vertical: true, sgn: -1 }; }
    if (dir === 'N') { ctx.rect(x0 - 2, y0 - 2, w + 4, h * k + 2); front = { y: y0 + h * k, vertical: false, sgn: 1 }; }
    if (dir === 'S') { ctx.rect(x0 - 2, y1 - h * k, w + 4, h * k + 2); front = { y: y1 - h * k, vertical: false, sgn: -1 }; }
  }
  ctx.fillStyle = hexA(col, +s.opacity || 0.3);
  ctx.fill();
  if (s.hatch !== false) {
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = hexA(col, 0.55);
    ctx.lineWidth = 1.5 * unit;
    const gap = 9 * unit;
    ctx.beginPath();
    for (let d = -h; d < w + h; d += gap) { ctx.moveTo(x0 + d, y0); ctx.lineTo(x0 + d - h, y1); }
    ctx.stroke();
    ctx.restore();
  }
  // front line with chevrons
  if (u < 1 && front) {
    ctx.strokeStyle = col;
    ctx.lineWidth = 3.5 * unit;
    ctx.shadowColor = col; ctx.shadowBlur = 8 * unit;
    ctx.beginPath();
    if (front.type === 'circle') ctx.arc(c[0], c[1], front.R, 0, Math.PI * 2);
    else if (front.vertical) { ctx.moveTo(front.x, y0); ctx.lineTo(front.x, y1); }
    else { ctx.moveTo(x0, front.y); ctx.lineTo(x1, front.y); }
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (s.arrows !== false && front.type !== 'circle') {
      ctx.fillStyle = col;
      const n = Math.max(2, Math.round((front.vertical ? h : w) / (36 * unit)));
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        const ax = front.vertical ? front.x : x0 + w * f, ay = front.vertical ? y0 + h * f : front.y;
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(front.vertical ? (front.sgn > 0 ? 0 : Math.PI) : (front.sgn > 0 ? Math.PI / 2 : -Math.PI / 2));
        ctx.beginPath(); ctx.moveTo(10 * unit, 0); ctx.lineTo(-2 * unit, -7 * unit); ctx.lineTo(1 * unit, 0); ctx.lineTo(-2 * unit, 7 * unit); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
  }
  ctx.restore();
  // border
  ringPath(ctx, proj, L.geom);
  const pulse = u >= 1 && !tm.edit ? 0.5 + 0.5 * Math.sin(tm.tau * 4) : 0;
  ctx.strokeStyle = col;
  ctx.lineWidth = (2 + pulse * 1.5) * unit;
  ctx.setLineDash(u >= 1 ? [] : [6 * unit, 4 * unit]);
  ctx.stroke();
  ctx.setLineDash([]);
  // flag
  if (s.flag !== false && u >= 1) {
    const appear = tm.edit ? 1 : clamp((tm.tau - L.duration) / 0.5, 0, 1);
    if (appear > 0) {
      const ph = 46 * unit, fw = 30 * unit, fh = 19 * unit;
      const [fx, fy] = c;
      ctx.globalAlpha *= appear;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(fx, fy, 6 * unit, 2.5 * unit, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a3d42'; ctx.fillRect(fx - 1.5 * unit, fy - ph * appear, 3 * unit, ph * appear);
      const top = fy - ph * appear;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(fx + 1.5 * unit, top);
      for (let i = 0; i <= 10; i++) { const xx = fx + 1.5 * unit + (fw * i) / 10; ctx.lineTo(xx, top + Math.sin(i / 2 + (tm.tau || 0) * 6) * 2 * unit); }
      for (let i = 10; i >= 0; i--) { const xx = fx + 1.5 * unit + (fw * i) / 10; ctx.lineTo(xx, top + fh + Math.sin(i / 2 + (tm.tau || 0) * 6) * 2 * unit); }
      ctx.closePath(); ctx.fill();
      if (s.label) {
        ctx.font = `800 ${13 * unit}px ${fam(s.font, UI)}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(10,12,16,0.85)'; ctx.lineWidth = 4 * unit;
        ctx.strokeText(s.label, fx, fy + 6 * unit);
        ctx.fillStyle = '#fff'; ctx.fillText(s.label, fx, fy + 6 * unit);
      }
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- infographic charts
export function parseData(text) {
  return String(text || '').split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(.*?)[\s]*[:,=\t][\s]*(-?[\d.,]+)\s*%?$/) || l.match(/^(.*?)\s+(-?[\d.,]+)\s*%?$/);
    if (m) return { label: m[1].trim(), value: parseFloat(m[2].replace(/,/g, '')) || 0 };
    const n = parseFloat(l.replace(/,/g, ''));
    return Number.isFinite(n) ? { label: '', value: n } : { label: l, value: 0 };
  });
}
const PALETTE = ['#ff6b35', '#2d7ff9', '#2fbf71', '#ffd23f', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
function fmtNum(v, s) {
  const abs = Math.abs(v);
  const d = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 1 : 2;
  return `${s.prefix || ''}${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: d })}${s.suffix || ''}`;
}
function panelRect(frame, pos, W, H, unit) {
  const m = 26 * unit;
  let x = frame.x + m, y = frame.y + m;
  if (pos.includes('right')) x = frame.x + frame.w - m - W;
  if (pos.includes('bottom')) y = frame.y + frame.h - m - H;
  if (pos === 'center') { x = frame.x + (frame.w - W) / 2; y = frame.y + (frame.h - H) / 2; }
  return [x, y];
}
function drawChart(ctx, L, tm, frame, unit) {
  const s = L.style;
  const k = +s.size || 1;
  const data = parseData(s.data);
  const type = s.type || 'bar';
  const u = L.anim === 'none' || tm.edit ? 1 : clamp(tm.tau / Math.max(0.1, L.duration), 0, 1);
  const alpha = tm.alpha * (L.anim === 'fade' && !tm.edit ? ease(u * 2) : clamp(u * 4, 0, 1));
  const UIF = fam(s.font, UI), DF = fam(s.font, DISPLAY);
  const W = (type === 'counter' ? 260 : 360) * unit * k;
  const H = (type === 'counter' ? 120 : type === 'donut' ? 210 : type === 'progress' ? 40 + data.length * 34 : type === 'hbar' ? 52 + data.length * 30 : 230) * unit * k;
  const [x, y] = panelRect(frame, s.position || 'top-right', W, H, unit);
  const accent = s.accent || '#ff6b35';
  const colors = [accent, ...PALETTE.filter((c) => c !== accent)];
  ctx.save();
  placeAt(ctx, L, frame, x, y, W, H);
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = 'rgba(12,14,18,0.78)';
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, W, H, 12 * unit); else ctx.rect(x, y, W, H); ctx.fill();
  ctx.fillStyle = accent; ctx.fillRect(x, y + 12 * unit, 4 * unit, 22 * unit * k);
  const pad = 16 * unit * k;
  ctx.textBaseline = 'alphabetic';
  if (s.title && type !== 'counter') {
    ctx.fillStyle = '#fff'; ctx.font = `800 ${16 * unit * k}px ${DF}`;
    ctx.fillText(s.title, x + pad, y + pad + 12 * unit * k);
  }
  const max = Math.max(1e-9, ...data.map((d) => Math.abs(d.value)));
  const top = y + pad + (s.title ? 30 : 6) * unit * k;
  const n = Math.max(1, data.length);
  const stag = (i) => ease((u - (i / n) * 0.45) / 0.55);
  if (type === 'counter') {
    const d = data[0] || { label: '', value: 0 };
    const v = d.value * easeOut(u);
    ctx.fillStyle = '#fff'; ctx.font = `900 ${44 * unit * k}px ${DF}`;
    ctx.fillText(fmtNum(v, s), x + pad, y + 62 * unit * k);
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = `600 ${14 * unit * k}px ${UIF}`;
    ctx.fillText(d.label || s.title || '', x + pad, y + 92 * unit * k);
  } else if (type === 'bar') {
    const bh = H - (top - y) - 38 * unit * k;
    const gap = 10 * unit * k;
    const bw = (W - pad * 2 - gap * (n - 1)) / n;
    data.forEach((d, i) => {
      const e = stag(i);
      const hh = (Math.abs(d.value) / max) * bh * e;
      const bx = x + pad + i * (bw + gap), by = top + bh - hh;
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(bx, by, bw, hh);
      ctx.fillStyle = '#fff'; ctx.font = `700 ${11 * unit * k}px ${UIF}`; ctx.textAlign = 'center';
      if (e > 0.05) ctx.fillText(fmtNum(d.value * e, s), bx + bw / 2, by - 5 * unit);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `500 ${10.5 * unit * k}px ${UIF}`;
      ctx.fillText(d.label.slice(0, 14), bx + bw / 2, top + bh + 16 * unit * k);
      ctx.textAlign = 'left';
    });
  } else if (type === 'hbar') {
    const lw = 90 * unit * k;
    const bwMax = W - pad * 2 - lw - 50 * unit * k;
    data.forEach((d, i) => {
      const e = stag(i);
      const yy = top + i * 30 * unit * k;
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = `600 ${11.5 * unit * k}px ${UIF}`;
      ctx.fillText(d.label.slice(0, 14), x + pad, yy + 14 * unit * k);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + pad + lw, yy + 3 * unit * k, bwMax, 16 * unit * k);
      ctx.fillStyle = colors[i % colors.length]; ctx.fillRect(x + pad + lw, yy + 3 * unit * k, (Math.abs(d.value) / max) * bwMax * e, 16 * unit * k);
      ctx.fillStyle = '#fff'; ctx.font = `700 ${11 * unit * k}px ${UIF}`;
      ctx.fillText(fmtNum(d.value * e, s), x + pad + lw + (Math.abs(d.value) / max) * bwMax * e + 6 * unit, yy + 15 * unit * k);
    });
  } else if (type === 'line') {
    const bh = H - (top - y) - 34 * unit * k;
    const bw = W - pad * 2;
    const min = Math.min(0, ...data.map((d) => d.value));
    const span = Math.max(1e-9, Math.max(...data.map((d) => d.value)) - min);
    const P = data.map((d, i) => [x + pad + (n === 1 ? bw / 2 : (i / (n - 1)) * bw), top + bh - ((d.value - min) / span) * bh]);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    for (let g = 0; g <= 3; g++) { const yy = top + (bh * g) / 3; ctx.beginPath(); ctx.moveTo(x + pad, yy); ctx.lineTo(x + pad + bw, yy); ctx.stroke(); }
    const e = ease(u);
    const upto = e * (n - 1);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, pad + bw * e + 2, H); ctx.clip();
    const grd = ctx.createLinearGradient(0, top, 0, top + bh);
    grd.addColorStop(0, hexA(accent, 0.45)); grd.addColorStop(1, hexA(accent, 0));
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.moveTo(P[0][0], top + bh); P.forEach((p) => ctx.lineTo(p[0], p[1])); ctx.lineTo(P.at(-1)[0], top + bh); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 3 * unit * k; ctx.lineJoin = 'round';
    ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
    ctx.restore();
    data.forEach((d, i) => {
      if (i > upto + 0.01) return;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(P[i][0], P[i][1], 3.5 * unit * k, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `500 ${10 * unit * k}px ${UIF}`; ctx.textAlign = 'center';
      ctx.fillText(d.label.slice(0, 10), P[i][0], top + bh + 16 * unit * k);
      ctx.textAlign = 'left';
    });
    if (n) { const i = Math.min(n - 1, Math.floor(upto)); ctx.fillStyle = '#fff'; ctx.font = `800 ${12 * unit * k}px ${UIF}`; ctx.fillText(fmtNum(data[i].value, s), P[i][0] + 6 * unit, P[i][1] - 6 * unit); }
  } else if (type === 'donut') {
    const total = data.reduce((a, d) => a + Math.abs(d.value), 0) || 1;
    const cx = x + pad + 70 * unit * k, cy = top + 78 * unit * k, R = 62 * unit * k;
    let a0 = -Math.PI / 2;
    const e = ease(u);
    data.forEach((d, i) => {
      const a1 = a0 + (Math.abs(d.value) / total) * Math.PI * 2 * e;
      ctx.strokeStyle = colors[i % colors.length]; ctx.lineWidth = 22 * unit * k;
      ctx.beginPath(); ctx.arc(cx, cy, R - 11 * unit * k, a0, a1); ctx.stroke();
      a0 = a1;
      ctx.fillStyle = colors[i % colors.length]; ctx.fillRect(cx + R + 18 * unit * k, top + 10 * unit * k + i * 22 * unit * k, 10 * unit * k, 10 * unit * k);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `600 ${11 * unit * k}px ${UIF}`;
      ctx.fillText(`${d.label.slice(0, 12)} ${Math.round((Math.abs(d.value) / total) * 100 * e)}%`, cx + R + 34 * unit * k, top + 19 * unit * k + i * 22 * unit * k);
    });
    ctx.fillStyle = '#fff'; ctx.font = `900 ${18 * unit * k}px ${DF}`; ctx.textAlign = 'center';
    ctx.fillText(fmtNum(total * e, s), cx, cy + 6 * unit * k); ctx.textAlign = 'left';
  } else if (type === 'progress') {
    const bwMax = W - pad * 2;
    data.forEach((d, i) => {
      const e = stag(i);
      const yy = top + i * 34 * unit * k;
      const pct = clamp(d.value, 0, 100);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = `600 ${11.5 * unit * k}px ${UIF}`;
      ctx.fillText(d.label, x + pad, yy + 10 * unit * k);
      ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.fillText(`${Math.round(pct * e)}%`, x + pad + bwMax, yy + 10 * unit * k); ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x + pad, yy + 16 * unit * k, bwMax, 8 * unit * k);
      ctx.fillStyle = colors[i % colors.length]; ctx.fillRect(x + pad, yy + 16 * unit * k, (bwMax * pct * e) / 100, 8 * unit * k);
    });
  }
  ctx.restore();
}

// ---------------------------------------------------------------- HUD
function fmtCoord(v, pos, neg) { return `${Math.abs(v).toFixed(4)}°${v >= 0 ? pos : neg}`; }
function drawHUD(ctx, L, tm, frame, unit, view, time, proj) {
  const s = L.style;
  const col = s.color || '#7CFF7C';
  const u = L.anim === 'none' || tm.edit ? 1 : clamp(tm.tau / Math.max(0.1, L.duration), 0, 1);
  const boot = L.anim === 'boot' ? u : 1;
  const alpha = tm.alpha * (L.anim === 'fade' && !tm.edit ? ease(u) : clamp(u * 3, 0, 1));
  const { x, y, w, h } = frame;
  const cx = x + w / 2, cy = y + h / 2;
  const t = time ?? 0;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = 2 * unit;
  ctx.font = `600 ${12 * unit}px ${MONO}`;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = hexA(col, 0.6); ctx.shadowBlur = 4 * unit;
  if (s.scan) {
    ctx.save(); ctx.shadowBlur = 0;
    ctx.fillStyle = hexA(col, 0.05);
    for (let yy = y; yy < y + h; yy += 4 * unit) ctx.fillRect(x, yy, w, 1.2 * unit);
    const sy = y + ((t * 0.25) % 1) * h;
    const g = ctx.createLinearGradient(0, sy - 40 * unit, 0, sy);
    g.addColorStop(0, hexA(col, 0)); g.addColorStop(1, hexA(col, 0.12));
    ctx.fillStyle = g; ctx.fillRect(x, sy - 40 * unit, w, 40 * unit);
    ctx.restore();
  }
  // corner brackets (slide in during boot)
  const m = (24 + 30 * (1 - ease(boot))) * unit, bl = 46 * unit;
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const ox = sx > 0 ? x + m : x + w - m, oy = sy > 0 ? y + m : y + h - m;
    ctx.beginPath(); ctx.moveTo(ox, oy + sy * bl); ctx.lineTo(ox, oy); ctx.lineTo(ox + sx * bl, oy); ctx.stroke();
  }
  const variant = s.variant || 'drone';
  // crosshair / reticle
  let tx = cx, ty = cy;
  if (variant === 'target' && L.geom?.type === 'Point' && proj) [tx, ty] = proj(L.geom.coordinates);
  if (variant !== 'minimal') {
    const r = 18 * unit;
    ctx.beginPath();
    ctx.moveTo(tx - r * 2.2, ty); ctx.lineTo(tx - r * 0.6, ty); ctx.moveTo(tx + r * 0.6, ty); ctx.lineTo(tx + r * 2.2, ty);
    ctx.moveTo(tx, ty - r * 2.2); ctx.lineTo(tx, ty - r * 0.6); ctx.moveTo(tx, ty + r * 0.6); ctx.lineTo(tx, ty + r * 2.2);
    ctx.stroke();
    if (variant === 'target') {
      const lock = clamp((u - 0.2) / 0.8, 0, 1);
      const bs = (90 - 60 * ease(lock)) * unit;
      ctx.save(); ctx.translate(tx, ty); ctx.rotate(t * 0.8);
      ctx.setLineDash([10 * unit, 8 * unit]); ctx.beginPath(); ctx.arc(0, 0, bs * 1.4, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      ctx.setLineDash([]);
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        ctx.beginPath(); ctx.moveTo(tx - sx * bs, ty - sy * bs + sy * 12 * unit); ctx.lineTo(tx - sx * bs, ty - sy * bs); ctx.lineTo(tx - sx * bs + sx * 12 * unit, ty - sy * bs); ctx.stroke();
      }
      if (lock >= 1 && Math.sin(t * 8) > -0.2) {
        ctx.save(); ctx.font = `800 ${13 * unit}px ${MONO}`; ctx.textAlign = 'center';
        ctx.fillStyle = '#ff3b30'; ctx.shadowColor = 'rgba(255,59,48,.7)';
        ctx.fillText('TARGET LOCKED', tx, ty + bs + 22 * unit); ctx.restore();
      }
    } else {
      ctx.beginPath(); ctx.arc(tx, ty, 3 * unit, 0, Math.PI * 2); ctx.fill();
    }
  }
  // heading tape (drone)
  const bearing = view?.bearing || 0;
  if (variant === 'drone') {
    const tw = 280 * unit, ty0 = y + 34 * unit;
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - tw / 2, ty0 - 16 * unit, tw, 34 * unit); ctx.clip();
    for (let d = -60; d <= 60; d += 5) {
      const hdg = Math.round((bearing + d) / 5) * 5;
      const xx = cx + (hdg - bearing) * (tw / 120);
      const big = ((hdg % 30) + 30) % 30 === 0;
      ctx.beginPath(); ctx.moveTo(xx, ty0); ctx.lineTo(xx, ty0 + (big ? 10 : 5) * unit); ctx.stroke();
      if (big) { ctx.textAlign = 'center'; const v = ((hdg % 360) + 360) % 360; ctx.fillText(v === 0 ? 'N' : v === 90 ? 'E' : v === 180 ? 'S' : v === 270 ? 'W' : String(v), xx, ty0 - 7 * unit); }
    }
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(cx, ty0 + 12 * unit); ctx.lineTo(cx - 5 * unit, ty0 + 20 * unit); ctx.lineTo(cx + 5 * unit, ty0 + 20 * unit); ctx.closePath(); ctx.fill();
  }
  if (variant === 'satellite') {
    ctx.save(); ctx.shadowBlur = 0; ctx.strokeStyle = hexA(col, 0.25); ctx.lineWidth = 1 * unit;
    for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(x + (w * i) / 8, y); ctx.lineTo(x + (w * i) / 8, y + h); ctx.stroke(); }
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x, y + (h * i) / 6); ctx.lineTo(x + w, y + (h * i) / 6); ctx.stroke(); }
    ctx.restore();
  }
  // text readouts
  const lines = [];
  ctx.textAlign = 'left';
  const lx = x + 34 * unit, rx = x + w - 34 * unit, by = y + h - 40 * unit;
  if (s.rec !== false && (variant !== 'minimal' || true)) {
    if (Math.sin(t * 5) > -0.3) { ctx.save(); ctx.fillStyle = '#ff3b30'; ctx.shadowColor = 'rgba(255,59,48,.7)'; ctx.beginPath(); ctx.arc(lx + 6 * unit, y + 40 * unit, 6 * unit, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    ctx.fillText('REC', lx + 18 * unit, y + 40 * unit);
    const tc = `T+${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
    ctx.textAlign = 'right'; ctx.fillText(tc, rx, y + 40 * unit); ctx.textAlign = 'left';
  }
  if (s.label) { ctx.textAlign = 'right'; ctx.fillText(s.label, rx, y + 60 * unit); ctx.textAlign = 'left'; }
  if (s.coords !== false && view) {
    const c = variant === 'target' && L.geom?.type === 'Point' ? L.geom.coordinates : view.center;
    lines.push(`${variant === 'satellite' ? 'SAT ' : ''}LAT ${fmtCoord(c[1], 'N', 'S')}`);
    lines.push(`LON ${fmtCoord(c[0], 'E', 'W')}`);
    const alt = view.altM || 0;
    lines.push(`ALT ${alt >= 10000 ? `${(alt / 1000).toFixed(alt > 1e5 ? 0 : 1)} km` : `${Math.round(alt)} m`}`);
    lines.push(`HDG ${String(Math.round(((bearing % 360) + 360) % 360)).padStart(3, '0')}°`);
    if (variant === 'satellite') lines.push(`IMAGING ${Math.sin(t * 6) > 0 ? '●' : '○'}`);
  }
  lines.forEach((l, i) => ctx.fillText(l.slice(0, Math.ceil(l.length * clamp(boot * 1.3 - i * 0.08, 0, 1))), lx, by - (lines.length - 1 - i) * 17 * unit));
  ctx.restore();
}

const trackCache = new Map();
/** Orbit ground track for an ISS layer (cached by position and inclination). */
export function issTrack(L) {
  const [lng, lat] = L.geom.coordinates;
  const key = `${lng.toFixed(4)},${lat.toFixed(4)},${L.style.inclination}`;
  const c = trackCache.get(L.id);
  if (c && c.key === key) return c.track;
  const track = orbitTrack(lng, lat, +L.style.inclination || 51.6, 1);
  trackCache.set(L.id, { key, track });
  return track;
}

// ---------------------------------------------------------------- flicker / decode / glitch text
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@*+=<>/\\|';
function scramble(text, u, seed, tau) {
  const r = rng(seed + Math.floor(tau * 24));
  return [...text].map((ch, i) => {
    if (ch === ' ') return ' ';
    const done = u * 1.25 - (i / Math.max(1, text.length)) * 0.6 > 0.35;
    return done ? ch : GLYPHS[Math.floor(r() * GLYPHS.length)];
  }).join('');
}
function drawFlicker(ctx, L, tm, frame, unit) {
  const s = L.style;
  const tau = tm.edit ? 99 : tm.tau;
  const u = tm.edit ? 1 : clamp(tau / Math.max(0.1, L.duration), 0, 1);
  const k = +s.size || 1;
  const col = s.color || '#7CFF7C';
  let t1 = s.text || '', t2 = s.sub || '';
  const seed = hashStr(L.id);
  let alpha = tm.alpha, jx = 0, split = 0;
  if (L.anim === 'decode') { t1 = scramble(t1, u, seed, tau); t2 = scramble(t2, clamp(u * 1.2 - 0.2, 0, 1), seed + 5, tau); }
  if (L.anim === 'type') { const n = Math.round((t1.length + t2.length) * u); t2 = t2.slice(0, Math.max(0, n - t1.length)); t1 = t1.slice(0, n); }
  const fl = rng(seed + Math.floor(tau * 30))();
  if (L.anim === 'flicker' && u < 1) alpha *= fl < 0.35 + u * 0.5 ? 1 : 0.08;
  if (L.anim === 'glitch' && u < 1) { split = (1 - u) * 6 * unit; jx = (fl - 0.5) * 14 * unit * (1 - u); alpha *= fl < 0.2 ? 0.3 : 1; }
  if (L.anim === 'neon' && u < 1) alpha *= rng(seed + Math.floor(tau * 14))() < 0.15 + u * 0.95 ? 1 : 0.1;
  if (s.keepFlicker && u >= 1 && !tm.edit) { const f2 = rng(seed + Math.floor(tau * 12))(); if (f2 < 0.06) { alpha *= 0.35; split = 3 * unit; } }
  if (alpha <= 0.01) return;
  const F1 = `700 ${26 * k * unit}px ${fam(s.font, MONO)}`, F2 = `500 ${14 * k * unit}px ${fam(s.font, MONO)}`;
  ctx.save();
  ctx.font = F1; const w1 = ctx.measureText(s.text || '').width;
  ctx.font = F2; const w2 = ctx.measureText(s.sub || '').width;
  const W = Math.max(w1, w2) + 36 * unit * k, H = (t2 || s.sub ? 70 : 46) * unit * k;
  const pos = s.position || 'center';
  const m = 30 * unit;
  let x = frame.x + (frame.w - W) / 2, y = frame.y + (frame.h - H) / 2;
  if (pos.includes('left')) x = frame.x + m;
  if (pos.includes('right')) x = frame.x + frame.w - m - W;
  if (pos.includes('top') || pos === 'top') y = frame.y + m;
  if (pos.includes('bottom') || pos === 'bottom') y = frame.y + frame.h - m - H;
  placeAt(ctx, L, frame, x, y, W, H);
  x += jx;
  ctx.globalAlpha *= alpha;
  if (s.box !== false) {
    ctx.fillStyle = 'rgba(4,8,6,0.72)';
    ctx.fillRect(x, y, W, H);
    ctx.strokeStyle = hexA(col, 0.7); ctx.lineWidth = 1.5 * unit;
    const b = 10 * unit;
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + W, y, -1, 1], [x, y + H, 1, -1], [x + W, y + H, -1, -1]]) { ctx.beginPath(); ctx.moveTo(cx, cy + sy * b); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * b, cy); ctx.stroke(); }
    ctx.fillStyle = hexA(col, 0.06);
    for (let yy = y; yy < y + H; yy += 3 * unit) ctx.fillRect(x, yy, W, 1 * unit);
  }
  ctx.textBaseline = 'middle';
  const tx = x + 18 * unit * k, ty1 = y + 24 * unit * k, ty2 = y + 50 * unit * k;
  const draw = (txt, yy, F) => {
    ctx.font = F;
    if (split > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,0,60,0.7)'; ctx.fillText(txt, tx - split, yy);
      ctx.fillStyle = 'rgba(0,200,255,0.7)'; ctx.fillText(txt, tx + split, yy);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.shadowColor = hexA(col, 0.8); ctx.shadowBlur = (L.anim === 'neon' ? 22 : 8) * unit;
    ctx.fillStyle = col; ctx.fillText(txt, tx, yy);
    if (L.anim === 'neon') ctx.fillText(txt, tx, yy);
    ctx.shadowBlur = 0;
  };
  const drawAll = () => {
    draw(t1, ty1, F1);
    if (t2) draw(t2, ty2, F2);
    if (s.cursor !== false && Math.sin(tau * 9) > 0) {
      ctx.font = (t2 ? F2 : F1);
      const last = t2 || t1;
      const cw = ctx.measureText(last).width;
      ctx.fillStyle = col;
      ctx.fillRect(tx + cw + 3 * unit, (t2 ? ty2 : ty1) - 9 * unit * k, 9 * unit * k, 18 * unit * k);
    }
  };
  const glitchAfter = s.keepFlicker && u >= 1 && !tm.edit && rng(seed + 3 + Math.floor(tau * 10))() < 0.05;
  if ((L.anim === 'slice' && u < 1) || glitchAfter && L.anim === 'slice') {
    const amt = glitchAfter ? 0.25 : 1 - u;
    const r = rng(seed + Math.floor(tau * 20));
    const n = 7, sh = H / n;
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x - W, y + i * sh, W * 3, sh + 0.5); ctx.clip();
      ctx.translate((r() - 0.5) * 60 * unit * amt * (r() < 0.6 ? 1 : 0), 0);
      drawAll();
      ctx.restore();
    }
  } else if (L.anim === 'scan' && u < 1) {
    const sy = y + H * easeOut(u);
    ctx.save(); ctx.beginPath(); ctx.rect(x - 4, y - 4, W + 8, sy - y + 4); ctx.clip(); drawAll(); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.shadowColor = col; ctx.shadowBlur = 14 * unit;
    ctx.fillRect(x, sy - 1.5 * unit, W, 3 * unit);
    ctx.shadowBlur = 0;
  } else {
    drawAll();
  }
  if (L.anim === 'redact') {
    const e = easeOut(clamp(u * 1.15, 0, 1));
    ctx.shadowBlur = 0;
    for (const [txt, yy, F] of [[s.text || '', ty1, F1], [s.sub || '', ty2, F2]]) {
      if (!txt) continue;
      ctx.font = F;
      const tw = ctx.measureText(txt).width;
      const bx = tx + tw * e;
      if (bx >= tx + tw) continue;
      const bh = (F === F1 ? 26 : 15) * unit * k;
      ctx.fillStyle = '#050505'; ctx.fillRect(bx - 2 * unit, yy - bh * 0.6, tx + tw - bx + 6 * unit, bh * 1.2);
      ctx.fillStyle = col; ctx.fillRect(bx - 2 * unit, yy - bh * 0.6, 2 * unit, bh * 1.2);
    }
  }
  ctx.restore();
}

/** HUD interference while the camera zooms fast (and briefly on boot). */
export function hudGlitch(ctx, frame, unit, amount, seed, col = '#7CFF7C') {
  if (amount <= 0.02) return;
  const r = rng(seed);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < Math.round(8 * amount); i++) {
    const y = frame.y + r() * frame.h, h = (2 + r() * 10) * unit;
    ctx.fillStyle = hexA(col, 0.12 * amount * r());
    ctx.fillRect(frame.x, y, frame.w, h);
  }
  ctx.globalCompositeOperation = 'source-over';
  if (r() < amount * 0.8) {
    ctx.font = `700 ${14 * unit}px ${MONO}`;
    ctx.fillStyle = hexA(col, 0.9);
    ctx.textAlign = 'center';
    ctx.fillText(r() < 0.5 ? 'ACQUIRING…' : 'SIGNAL LOCK', frame.x + frame.w / 2, frame.y + frame.h / 2 + 60 * unit);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- collision (3D vehicles drawn by models3d.js)
function drawCollision(ctx, L, tm, o, phase) {
  const s = L.style;
  const cs = linesOf(L.geom);
  if (!cs || cs.length < 2) return;
  const { proj, unit } = o;
  const P = screenPath(cs, proj);
  if (phase === 'below') {
    return; // the track is drawn by the map under the 3D models (models3d.js)
    ctx.save();
    ctx.globalAlpha *= tm.alpha;
    const path = () => { ctx.beginPath(); P.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); };
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    path(); ctx.strokeStyle = '#7d756b'; ctx.lineWidth = 9 * unit; ctx.stroke();
    ctx.setLineDash([2.5 * unit, 3 * unit]); path(); ctx.strokeStyle = '#4e3b2a'; ctx.lineWidth = 7 * unit; ctx.stroke(); ctx.setLineDash([]);
    path(); ctx.strokeStyle = '#d9dee4'; ctx.lineWidth = 1.2 * unit; ctx.stroke();
    ctx.restore();
    return;
  }
  const D = Math.max(0.1, +L.duration || 5);
  const tau = tm.edit ? -1 : tm.tau - D;
  const q = at(P, clamp(+s.meetAt || 0.5, 0.05, 0.95));
  if (tau >= 0 && +s.blast !== 0) {
    ctx.save();
    ctx.globalAlpha *= tm.alpha;
    const R = 34 * unit * (+s.blast || 1.4);
    drawBlast(ctx, q.p[0], q.p[1], R, tau, hashStr(L.id), { scorch: true, flash: true });
    if (s.smoke !== false && tau > 1.5) for (let k = 0; k < 3; k++) drawPuff(ctx, q.p[0] + (k - 1) * R * 0.3, q.p[1] - R * 0.4 - (tau - 1.5) * R * 0.25 * (1 + k * 0.3), R * (0.5 + 0.15 * k + (tau - 1.5) * 0.08), tau * 0.1 + k, Math.max(0, 0.55 - (tau - 1.5) * 0.04), 'smoke');
    ctx.restore();
  }
  if (s.label && (tm.edit || tau >= 0)) {
    ctx.save();
    ctx.font = `800 ${14 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4 * unit; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(s.label, q.p[0], q.p[1] - 60 * unit);
    ctx.fillStyle = '#fff'; ctx.fillText(s.label, q.p[0], q.p[1] - 60 * unit);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- dispatcher
/** Draw an FX layer. phase: 'below' | 'above' | 'captions'. */
export function drawFX(ctx, L, tm, o, phase) {
  const { proj, unit, frame } = o;
  switch (L.kind) {
    case 'satellite': if (phase !== 'captions') drawSatellite(ctx, L, tm, proj, unit, phase, linesOf(L.geom)); break;
    case 'iss': if (phase !== 'captions' && L.geom) drawSatellite(ctx, L, tm, proj, unit, phase, issTrack(L)); break;
    case 'launch': if (phase === 'above') drawLaunch(ctx, L, tm, proj, unit, frame); break;
    case 'trajectory': if (phase === 'above') drawTrajectory(ctx, L, tm, proj, unit); break;
    case 'vehicle': if (phase === 'above') drawVehicle(ctx, L, tm, proj, unit); break;
    case 'strike': if (phase === 'above') drawStrike(ctx, L, tm, proj, unit); break;
    case 'bombing': if (phase === 'above') drawBombing(ctx, L, tm, proj, unit, phase); break;
    case 'capture': if (phase === 'below') drawCapture(ctx, L, tm, proj, unit); break;
    case 'chart': if (phase === 'captions' && frame) drawChart(ctx, L, tm, frame, unit); break;
    case 'flicker': if (phase === 'captions' && frame) drawFlicker(ctx, L, tm, frame, unit); break;
    case 'videofx': if (phase === 'above') drawVideoFx(ctx, L, tm, proj, unit, o.exact); break;
    case 'model3d': break; // drawn in 3D by models3d.js
    case 'hudtext': if (phase === 'captions' && frame) drawHudText(ctx, L, tm, o); break;
    case 'target': if (phase === 'above') drawTarget(ctx, L, tm, proj, unit); break;
    case 'image': if (phase === 'below') drawImageLayer(ctx, L, tm, proj, unit, true); break;
    case 'compare': if (phase === 'below') drawCompareLayer(ctx, L, tm, proj, unit, frame); break;
    case 'trees': if (phase === 'above') drawTrees(ctx, L, tm, o); break;
    case 'collision': drawCollision(ctx, L, tm, o, phase); break;
    case 'city3d': break; // 3D only
    case 'cyclone': if (phase === 'above') drawCyclone(ctx, L, tm, o); else if (phase === 'captions' && frame) drawCycloneLegend(ctx, L, tm, o); break;
    case 'pressure': if (phase === 'above') drawPressure(ctx, L, tm, o); break;
    case 'front': if (phase === 'below') drawFront(ctx, L, tm, o); break;
    case 'wxpoint': if (phase === 'above') drawWxPoint(ctx, L, tm, o); break;
    case 'wxfield': if (phase === 'below') drawField(ctx, L, tm, o); else if (phase === 'captions' && frame) drawFieldLegend(ctx, L, tm, o); break;
    case 'forecast': if (phase === 'captions' && frame) drawForecast(ctx, L, tm, o); break;
    case 'title': if (phase === 'captions' && frame) drawTitle(ctx, L, tm, o); break;
    case 'news': if (phase === 'captions' && frame) drawNews(ctx, L, tm, o); break;
    case 'video': if (phase === 'captions' && frame) drawVideoLayer(ctx, L, tm, o); break;
    case 'effect': break; // drawn over the whole picture by screenfx.js
    case 'timeseries':
      if (phase === 'below') drawSeriesLayer(ctx, L, tm, proj, unit);
      else if (phase === 'captions' && frame) drawSeriesLabel(ctx, L, tm, frame, unit);
      break;
    case 'hud':
      if (phase === 'captions' && frame) {
        const zv = o.view?.zoomSpeed || 0;
        const boot = tm.edit ? 0 : Math.max(0, 1 - tm.tau / 0.5);
        const amt = Math.max(clamp(zv / 1.5, 0, 1), boot);
        ctx.save();
        if (amt > 0.05) {
          const r = rng(hashStr(L.id) + Math.floor((o.time || 0) * 30));
          ctx.globalAlpha *= r() < amt * 0.35 ? 0.25 : 1;
          ctx.translate((r() - 0.5) * 8 * unit * amt, 0);
        }
        if (HUD_PLUS[L.style.variant]) drawHUDPlus(ctx, L, tm, o);
        else drawHUD(ctx, L, tm, frame, unit, o.view, o.time, proj);
        ctx.restore();
        hudGlitch(ctx, frame, unit, amt, hashStr(L.id) + Math.floor((o.time || 0) * 30), L.style.color);
      }
      break;
    default: break;
  }
}
/** Which phases an FX kind draws in. */
export function fxPhases(kind) {
  if (kind === 'chart' || kind === 'hud' || kind === 'flicker' || kind === 'hudtext' || kind === 'title' || kind === 'news' || kind === 'video') return ['captions'];
  if (kind === 'effect') return [];
  if (kind === 'forecast') return ['captions'];
  if (kind === 'cyclone') return ['above', 'captions'];
  if (kind === 'wxfield') return ['below', 'captions'];
  if (kind === 'front') return ['below'];
  if (kind === 'collision') return ['below', 'above'];
  if (kind === 'city3d') return [];
  if (kind === 'image' || kind === 'compare') return ['below'];
  if (kind === 'timeseries') return ['below', 'captions'];
  if (kind === 'model3d') return [];
  if (kind === 'capture') return ['below'];
  if (kind === 'satellite' || kind === 'iss') return ['below', 'above'];
  return ['above'];
}
