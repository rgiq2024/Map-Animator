// "Briefing" layout: a geospatial-intelligence style frame around the map.
// The map shows through a window; around it sit a globe, the title, info rows, a locator map,
// before / after satellite thumbnails and a field strip (date, event, location, assessment).
// Layouts: 'A' (globe + title on the left, before / after under the map), 'B' (header, locator and
// before / after on the right, field strip at the bottom), 'end' (closing card, no window).
// applyBriefing() turns any built story (Auto video, News desk) into this look.
import { placeAt, CUSTOM_POS } from './place.js';
import { H, allCountries, countriesByName, countryAt } from './cartofx.js';
import { imageFor } from './geoimage.js';
import { newScene } from './scene.js';
import { brandSafeArea } from './branding.js';

const { clamp, easeOut, D2R, rr, merc, drawTiles, bboxOf, labelPoint } = H;
let DISP = '"Archivo", Inter, system-ui, sans-serif';
let SANS = 'Inter, system-ui, sans-serif';
let MONO = '"JetBrains Mono", ui-monospace, monospace';
let GLOBE_LOOK = 'land';
/** looks: fonts, background and globe style */
export const BR_THEMES = {
  navy: { name: 'Navy — GEO·BRIEF (Rajdhani type)', disp: '"Rajdhani", "Archivo", sans-serif', sans: '"Rajdhani", Inter, sans-serif', mono: '"Rajdhani", "JetBrains Mono", monospace', bg: '#050b14', bg2: '#0a1626', stars: false, grid: true, globe: 'land', glow: 1.2, font: 'Rajdhani' },
  navyArchivo: { name: 'Navy — Archivo type (earlier look)', disp: '"Archivo", Inter, system-ui, sans-serif', sans: 'Inter, system-ui, sans-serif', mono: '"JetBrains Mono", ui-monospace, monospace', bg: '#050b14', bg2: '#0a1626', stars: false, grid: true, globe: 'land', glow: 1 },
  space: { name: 'Deep space — stars, grid globe, tech type', disp: '"Rajdhani", "Archivo", sans-serif', sans: '"Rajdhani", Inter, sans-serif', mono: '"Rajdhani", "JetBrains Mono", monospace', bg: '#010409', bg2: '#030b16', stars: true, grid: false, globe: 'grid', glow: 1.6, font: 'Rajdhani' },
};
const r6 = (v) => Math.round(v * 1e6) / 1e6;
/** adds a rounded rectangle to the current path (no beginPath — for cut-outs) */
const rrAdd = (ctx, x, y, w, h, r) => { if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };

export const BR_KINDS = {
  briefmark: { name: 'Briefing marker', icon: '◉', geom: 'point', desc: 'A glowing ring on the map with a label box, e.g. “18:11Z — IMPACT”' },
  briefing: { name: 'Briefing frame', icon: '▣', geom: null, desc: 'Intelligence-briefing layout: the map in a window with a globe, title, info rows, locator, before / after images and a field strip' },
};
export const BR_ANIMS = { briefing: { build: 'Build in — corner marks, then a scan line reveals each panel', fade: 'Fade in', none: 'Shown' }, briefmark: { pop: 'Pop in', fade: 'Fade in', none: 'Shown' } };
export const BR_DEFAULTS = {
  briefmark: { anim: 'pop', duration: 0.8, style: { text: '18:11Z — IMPACT', sub: '', dx: -130, dy: -70, accent: '#35c8ff', ring: true, size: 1 } },
  briefing: { anim: 'build', duration: 1.2, style: {
    layout: 'A', title: 'Urda train collision', sub: 'Geospatial analysis', kicker: 'Geospatial intelligence briefing', tag: 'Train collision',
    date: '', place: '', country: '', event: '', eventIcon: 'alert', assessment: '', coords: '', sources: '',
    accent: '#35c8ff', bg: '#050b14', globe: true, before: null, after: null, photos: [], thumbZoom: 15, windowTag: true, scale: true,
    beforeMedia: '', afterMedia: '', beforeLabel: 'Before', afterLabel: 'After', beforeDate: '', afterDate: '', beforeZoom: 1, afterZoom: 1, beforeX: 0, beforeY: 0, afterX: 0, afterY: 0,
    theme: 'navy', logo: '', logo2: '', logoSize: 1, logo2Size: 1, logoPlace: 'top', slides: [], slideSec: 3, slideTitle: 'Photos from the site', slideFx: 'scan',
    header: false, headerText: true, headerOrg: true, headerBrand: true, headerRight: true, org: 'Your organization', unit: 'Geospatial unit', brand: 'GEO·BRIEF', tickerOn: false, ticker: '', tickerLabel: 'Breaking', north: true, sync: true,
    dateLabel: 'Incident date', placeLabel: 'Location', eventLabel: 'Event', assessLabel: 'Assessment', locatorTitle: 'Location', sideTitle: 'Site analysis (before / after)',
  } },
};
const LAYOUTS = { intro: 'Intro — title over a globe', zoom: 'Zoom to location — from space down to the place', A: 'Analysis — globe + title left, before / after under the map', B: 'Dashboard — title, map, regional context, before / after, field strip', full: 'Full view — map full frame, title block, mini globe', photos: 'Photos — photo slideshow with captions and a map inset', end: 'Closing card' };
const ICONS = { alert: 'Alert', train: 'Train', flood: 'Flood', fire: 'Fire', quake: 'Earthquake', storm: 'Storm', plane: 'Plane', ship: 'Ship', car: 'Car', pin: 'Place', migration: 'People / migration', forest: 'Forest' };
export const BR_FORMS = {
  briefmark: [['style.text', 'Label', 'text'], ['style.sub', 'Second line', 'text'], ['style.dx', 'Label offset ←→', 'range', [-500, 500, 1]], ['style.dy', 'Label offset ↑↓', 'range', [-400, 400, 1]], ['style.accent', 'Colour', 'color'], ['style.ring', 'Pulsing ring', 'switch'], ['style.size', 'Size', 'range', [0.5, 2.5, 0.05]]],
  briefing: [
    ['style.layout', 'Layout', 'select', LAYOUTS],
    ['style.theme', 'Theme', 'select', Object.fromEntries(Object.entries(BR_THEMES).map(([k, t]) => [k, t.name]))],
    ['style._parts', 'Parts — untick to remove one', 'brparts', null, (L) => !L.style.only],
    ['style._split', 'Make every part its own layer', 'brsplit', null, (L) => !L.style.only],
    ['style._zoom', 'Zoom to location — where and how the camera flies', 'brzoom', null, (L) => L.style.layout === 'zoom'],
    ['style._here', 'Incident location (globe, locator, place tag)', 'brhere'],
    ['style.sync', 'Same text on every scene', 'switch'],
    ['style.slides', 'Photos (slideshow)', 'slides', null, (L) => L.style.layout === 'photos'],
    ['style.slideSec', 'Seconds per photo', 'range', [1, 10, 0.5], (L) => L.style.layout === 'photos'],
    ['style.slideFx', 'Photo motion', 'select', { scan: 'Scan wipe + slow zoom (briefing)', kenburns: 'Slow zoom with cross-fade', fade: 'Cross-fade only', slide: 'Slide across' }, (L) => L.style.layout === 'photos'],
    ['style.slideTitle', 'Photos — panel title', 'text', null, (L) => L.style.layout === 'photos'],
    ['style.header', 'Header bar (organisation · brand · briefing)', 'switch'],
    ['style.logo', 'Logo (left)', 'image'], ['style.logoSize', 'Logo — size', 'range', [0.3, 4, 0.05], (L) => !!L.style.logo],
    ['style.logo2', 'Second logo (right)', 'image'],
    ['style.logoPlace', 'Logos — place', 'select', { top: 'Top (header row)', bottom: 'Bottom (above the ticker)' }, (L) => L.style.logo || L.style.logo2], ['style.logo2Size', 'Second logo — size', 'range', [0.3, 4, 0.05], (L) => !!L.style.logo2],
    ['style.headerText', 'Header — show text (off = background only)', 'switch', null, (L) => L.style.header],
    ['style.headerOrg', 'Header — show organisation text', 'switch', null, (L) => L.style.header && L.style.headerText !== false], ['style.headerBrand', 'Header — show centre title', 'switch', null, (L) => L.style.header && L.style.headerText !== false], ['style.headerRight', 'Header — show briefing line (right)', 'switch', null, (L) => L.style.header && L.style.headerText !== false],
    ['style.org', 'Header — organisation', 'text', null, (L) => L.style.header && L.style.headerOrg !== false], ['style.unit', 'Header — unit', 'text', null, (L) => L.style.header], ['style.brand', 'Header — centre title', 'text', null, (L) => L.style.header],
    ['style.tickerOn', 'Breaking ticker at the bottom', 'switch'],
    ['style.tickerLabel', 'Ticker — label', 'text', null, (L) => L.style.tickerOn], ['style.ticker', 'Ticker — items (one per line)', 'textarea', null, (L) => L.style.tickerOn],
    ['style.north', 'North arrow', 'switch', null, (L) => L.style.layout === 'B' || L.style.layout === 'full'],
    ['style._pos', 'Panels — drag to move, drag the white corner to resize', 'resetpos'],
    ['style.title', 'Title', 'text'], ['style.sub', 'Subtitle', 'text'], ['style.kicker', 'Header line', 'text', null, (L) => L.style.layout !== 'A'],
    ['style.tag', 'Label on the map', 'text', null, (L) => L.style.layout !== 'end'],
    ['style.date', 'Date', 'text'], ['style.place', 'Place', 'text'], ['style.country', 'Country (globe / locator)', 'text'],
    ['style.event', 'Event', 'text'], ['style.eventIcon', 'Event icon', 'select', ICONS], ['style.assessment', 'Assessment', 'text'],
    ['style.coords', 'Coordinates text', 'text'], ['style.sources', 'Sources (closing card)', 'text', null, (L) => L.style.layout === 'end'],
    ['style.accent', 'Accent colour', 'color'], ['style.bg', 'Background', 'color'],
    ['style.globe', 'Globe', 'switch', null, (L) => L.style.layout === 'A'], ['style.windowTag', 'Place tag in the map window', 'switch'], ['style.scale', 'Scale bar', 'switch', null, (L) => L.style.layout === 'B'],
    ['style.beforeMedia', 'Before image (your picture)', 'image', null, (L) => L.style.layout !== 'end'],
    ['style.beforeLabel', 'Before — label', 'text', null, (L) => L.style.layout !== 'end'], ['style.beforeDate', 'Before — date', 'text', null, (L) => L.style.layout !== 'end'],
    ['style.beforeZoom', 'Before — zoom', 'range', [1, 6, 0.05], (L) => L.style.layout !== 'end'], ['style.beforeX', 'Before — move ←→', 'range', [-1, 1, 0.01], (L) => L.style.layout !== 'end'], ['style.beforeY', 'Before — move ↑↓', 'range', [-1, 1, 0.01], (L) => L.style.layout !== 'end'],
    ['style.afterMedia', 'After image (your picture)', 'image', null, (L) => L.style.layout !== 'end'],
    ['style.afterLabel', 'After — label', 'text', null, (L) => L.style.layout !== 'end'], ['style.afterDate', 'After — date', 'text', null, (L) => L.style.layout !== 'end'],
    ['style.afterZoom', 'After — zoom', 'range', [1, 6, 0.05], (L) => L.style.layout !== 'end'], ['style.afterX', 'After — move ←→', 'range', [-1, 1, 0.01], (L) => L.style.layout !== 'end'], ['style.afterY', 'After — move ↑↓', 'range', [-1, 1, 0.01], (L) => L.style.layout !== 'end'],
    ['style.thumbZoom', 'Satellite before / after — map zoom', 'range', [3, 18, 0.1], (L) => !!(L.style.before || L.style.after)],
    ['style.dateLabel', 'Label — date', 'text'], ['style.placeLabel', 'Label — location', 'text'], ['style.eventLabel', 'Label — event', 'text'], ['style.assessLabel', 'Label — assessment', 'text'],
    ['style.locatorTitle', 'Locator panel title', 'text', null, (L) => L.style.layout === 'B'], ['style.sideTitle', 'Before / after panel title', 'text', null, (L) => L.style.layout === 'B'],
  ],
};
export const BR_SET = new Set(Object.keys(BR_KINDS));
export const brPhases = (kind) => (kind === 'briefmark' ? ['captions'] : ['below']);
/** text shared by every briefing frame of a project when “Same text on every scene” is on */
/** the separate parts of each layout (each can be removed) */
export const BR_PARTS = {
  common: [['background', 'Background'], ['frame', 'Map window frame'], ['logos', 'Logos'], ['header', 'Header bar'], ['ticker', 'Breaking ticker']],
  intro: [['introGlobe', 'Globe'], ['introTitle', 'Title block']],
  A: [['globe', 'Globe'], ['title', 'Title'], ['info', 'Info rows'], ['before', 'Before picture'], ['after', 'After picture'], ['tag', 'Place label on the map']],
  B: [['heading', 'Title'], ['locator', 'Locator map'], ['side', 'Before / after panel'], ['strip', 'Field strip'], ['tag', 'Place label'], ['scale', 'Scale bar'], ['north', 'North arrow']],
  zoom: [['tag', 'Place label']],
  full: [['titleBlock', 'Title block'], ['globe', 'Mini globe'], ['side', 'Before / after'], ['tag', 'Place label']],
  photos: [['slide', 'Photo'], ['strip', 'Thumbnails'], ['caption', 'Caption panel'], ['tag', 'Place label']],
  end: [['endTitle', 'Title'], ['endFields', 'Fields'], ['endSources', 'Sources']],
};
export const BR_SHARED = ['headerText', 'headerOrg', 'headerBrand', 'headerRight', 'theme', 'logoPlace', 'logo', 'logo2', 'logoSize', 'logo2Size', 'title', 'sub', 'kicker', 'tag', 'date', 'place', 'country', 'event', 'eventIcon', 'assessment', 'coords', 'sources', 'accent', 'bg', 'header', 'org', 'unit', 'brand', 'tickerOn', 'ticker', 'tickerLabel', 'beforeMedia', 'afterMedia', 'beforeLabel', 'afterLabel', 'beforeDate', 'afterDate', 'dateLabel', 'placeLabel', 'eventLabel', 'assessLabel', 'locatorTitle', 'sideTitle'];

// ================================================================= geometry of the layouts (fractions of the frame)
/** { win:[x,y,w,h], ... } in frame fractions for a layout and frame aspect (w / h). */
export function layoutBoxes(layout, aspect, hasThumbs = true, opt = {}) {
  // content area between the header (or logo band) and the ticker (or bottom margin)
  // …and clear of the project's logo strip (opt.safe = { top, bottom } fractions taken by the logos)
  const top = Math.max(opt.header ? 0.1 : 0.15, opt.safe?.top || 0), bot = Math.max(opt.ticker ? 0.078 : 0.035, opt.safe?.bottom || 0), H = 1 - top - bot;
  const R = (x, y, w, h) => [x, top + y * H, w, h * H];
  if (layout === 'end') return { end: true, top, bot };
  if (layout === 'intro') return { intro: true, top, bot };
  if (aspect < 1.2) {
    return { portrait: true, top, bot, title: R(0.05, 0, 0.9, 0.1), win: R(0.04, 0.11, 0.92, hasThumbs ? 0.5 : 0.7), thumbs: hasThumbs ? [R(0.04, 0.63, 0.445, 0.17), R(0.515, 0.63, 0.445, 0.17)] : null, strip: R(0.04, 0.82, 0.92, 0.18), globe: null };
  }
  if (layout === 'B') return { top, bot, header: R(0.03, 0, 0.64, 0.12), win: R(0.03, 0.15, 0.64, 0.68), locator: R(0.69, 0, 0.28, 0.4), side: R(0.69, 0.43, 0.28, 0.4), strip: R(0.03, 0.865, 0.94, 0.135) };
  if (layout === 'photos') return { photos: true, top, bot, slide: R(0.03, 0, 0.64, 0.82), strip: R(0.03, 0.85, 0.64, 0.15), win: R(0.69, 0, 0.28, 0.42), cap: R(0.69, 0.45, 0.28, 0.55) };
  if (layout === 'zoom') return { full: true, zoom: true, top, bot, win: R(0.02, 0, 0.96, 1), mini: [0.895, top + 0.17 * H, 0.062], titleBlock: R(0.05, 0.62, 0.55, 0.34), thumbs: null };
  if (layout === 'full') return { full: true, top, bot, win: R(0.02, 0, 0.96, 1), mini: [0.895, top + 0.17 * H, 0.062], titleBlock: R(0.05, 0.62, 0.55, 0.34), thumbs: hasThumbs ? [R(0.66, 0.66, 0.15, 0.28), R(0.82, 0.66, 0.15, 0.28)] : null };
  return { top, bot, left: R(0.03, 0, 0.265, 1), globe: [0.1625, top + 0.24 * H, 0.095], title: R(0.03, 0.5, 0.265, 0.2), info: R(0.03, 0.73, 0.265, 0.27), win: R(0.315, 0, 0.66, hasThumbs ? 0.6 : 1), thumbs: hasThumbs ? [R(0.315, 0.64, 0.31, 0.36), R(0.665, 0.64, 0.31, 0.36)] : null };
}

// ================================================================= drawing helpers
const hexA = (hex, a) => { const h = String(hex || '#35c8ff').replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
function fitFont(ctx, text, maxW, size, weight, fam, min = 0.55) {
  let s = size;
  ctx.font = `${weight} ${s}px ${fam}`;
  while (ctx.measureText(text).width > maxW && s > size * min) { s *= 0.94; ctx.font = `${weight} ${s}px ${fam}`; }
  if (ctx.measureText(text).width > maxW) { let t = text; while (t.length > 3 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1); return [`${t}…`, s]; }
  return [text, s];
}
function wrap(ctx, text, maxW, maxLines = 2) {
  const words = String(text || '').split(/\s+/).filter(Boolean), lines = [];
  let cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, '')}…`; }
  return lines;
}
function panel(ctx, x, y, w, h, u, acc, fill = 'rgba(8,17,30,0.9)') {
  rr(ctx, x, y, w, h, 6 * u); ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = hexA(acc, 0.32); ctx.lineWidth = 1 * u; ctx.stroke();
}
function brackets(ctx, x, y, w, h, u, acc, len = 14) {
  const l = len * u;
  ctx.strokeStyle = acc; ctx.lineWidth = 2 * u; ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(x, y + l); ctx.lineTo(x, y); ctx.lineTo(x + l, y);
  ctx.moveTo(x + w - l, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + l);
  ctx.moveTo(x + w, y + h - l); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - l, y + h);
  ctx.moveTo(x + l, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - l);
  ctx.stroke();
}
function caps(ctx, text, x, y, size, color, weight = 700, spacing = 0.12, align = 'left') {
  ctx.font = `${weight} ${size}px ${SANS}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  try { ctx.letterSpacing = `${size * spacing}px`; } catch { /* old browsers */ }
  ctx.fillText(String(text || '').toUpperCase(), x, y);
  try { ctx.letterSpacing = '0px'; } catch { /* */ }
}
/** simple line icons, centred on (x, y), size s */
function icon(ctx, name, x, y, s, col) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1, s * 0.09); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const h = s / 2;
  ctx.beginPath();
  switch (name) {
    case 'calendar': rr(ctx, -h, -h * 0.8, s, s * 0.9, s * 0.12); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-h, -h * 0.35); ctx.lineTo(h, -h * 0.35); ctx.moveTo(-h * 0.45, -h); ctx.lineTo(-h * 0.45, -h * 0.6); ctx.moveTo(h * 0.45, -h); ctx.lineTo(h * 0.45, -h * 0.6); ctx.stroke(); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) ctx.fillRect(-h * 0.55 + i * h * 0.45, -h * 0.05 + j * h * 0.4, s * 0.1, s * 0.1); break;
    case 'pin': ctx.arc(0, -h * 0.25, h * 0.55, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(0, h); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -h * 0.25, h * 0.2, 0, Math.PI * 2); ctx.fill(); break;
    case 'train': rr(ctx, -h * 0.6, -h, s * 0.6, s * 0.8, s * 0.15); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-h * 0.6, -h * 0.2); ctx.lineTo(h * 0.6, -h * 0.2); ctx.moveTo(-h * 0.35, h * 0.55); ctx.lineTo(-h * 0.7, h); ctx.moveTo(h * 0.35, h * 0.55); ctx.lineTo(h * 0.7, h); ctx.stroke(); ctx.beginPath(); ctx.arc(-h * 0.3, h * 0.15, s * 0.06, 0, 7); ctx.arc(h * 0.3, h * 0.15, s * 0.06, 0, 7); ctx.fill(); break;
    case 'flood': for (let k = 0; k < 3; k++) { const yy = -h * 0.5 + k * h * 0.5; ctx.moveTo(-h, yy); for (let i = 0; i <= 8; i++) ctx.lineTo(-h + (i * s) / 8, yy + Math.sin(i * Math.PI / 2) * s * 0.08); } ctx.stroke(); break;
    case 'fire': ctx.moveTo(0, h); ctx.bezierCurveTo(-h * 0.9, h, -h * 0.9, 0, -h * 0.2, -h); ctx.bezierCurveTo(-h * 0.1, -h * 0.3, h * 0.3, -h * 0.4, h * 0.35, -h * 0.75); ctx.bezierCurveTo(h, -h * 0.1, h, h, 0, h); ctx.stroke(); break;
    case 'quake': ctx.moveTo(-h, 0); ctx.lineTo(-h * 0.55, 0); ctx.lineTo(-h * 0.3, -h * 0.8); ctx.lineTo(0, h * 0.8); ctx.lineTo(h * 0.3, -h * 0.5); ctx.lineTo(h * 0.5, 0); ctx.lineTo(h, 0); ctx.stroke(); break;
    case 'storm': for (let a = 0; a < 3 * Math.PI; a += 0.2) { const r = (a / (3 * Math.PI)) * h; a ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(0, 0); } ctx.stroke(); break;
    case 'plane': ctx.moveTo(0, -h); ctx.lineTo(0, h); ctx.moveTo(-h, h * 0.1); ctx.lineTo(0, -h * 0.25); ctx.lineTo(h, h * 0.1); ctx.moveTo(-h * 0.4, h * 0.85); ctx.lineTo(0, h * 0.6); ctx.lineTo(h * 0.4, h * 0.85); ctx.stroke(); break;
    case 'ship': ctx.moveTo(-h, h * 0.1); ctx.lineTo(h, h * 0.1); ctx.lineTo(h * 0.6, h * 0.7); ctx.lineTo(-h * 0.6, h * 0.7); ctx.closePath(); ctx.moveTo(-h * 0.3, h * 0.1); ctx.lineTo(-h * 0.3, -h * 0.5); ctx.lineTo(h * 0.3, -h * 0.5); ctx.lineTo(h * 0.3, h * 0.1); ctx.stroke(); break;
    case 'car': rr(ctx, -h, -h * 0.1, s, s * 0.45, s * 0.1); ctx.moveTo(-h * 0.6, -h * 0.1); ctx.lineTo(-h * 0.35, -h * 0.65); ctx.lineTo(h * 0.35, -h * 0.65); ctx.lineTo(h * 0.6, -h * 0.1); ctx.stroke(); break;
    case 'migration': ctx.arc(-h * 0.4, -h * 0.5, h * 0.25, 0, 7); ctx.moveTo(h * 0.65, -h * 0.5); ctx.arc(h * 0.4, -h * 0.5, h * 0.25, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-h * 0.9, h * 0.6); ctx.quadraticCurveTo(-h * 0.4, -h * 0.25, h * 0.1, h * 0.6); ctx.moveTo(-h * 0.1, h * 0.6); ctx.quadraticCurveTo(h * 0.4, -h * 0.25, h * 0.9, h * 0.6); ctx.stroke(); break;
    case 'forest': ctx.moveTo(0, -h); ctx.lineTo(h * 0.7, h * 0.4); ctx.lineTo(-h * 0.7, h * 0.4); ctx.closePath(); ctx.moveTo(0, h * 0.4); ctx.lineTo(0, h); ctx.stroke(); break;
    case 'shield': ctx.moveTo(0, -h); ctx.lineTo(h * 0.8, -h * 0.6); ctx.lineTo(h * 0.7, h * 0.2); ctx.quadraticCurveTo(h * 0.4, h * 0.8, 0, h); ctx.quadraticCurveTo(-h * 0.4, h * 0.8, -h * 0.7, h * 0.2); ctx.lineTo(-h * 0.8, -h * 0.6); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-h * 0.3, 0); ctx.lineTo(-h * 0.05, h * 0.25); ctx.lineTo(h * 0.35, -h * 0.25); ctx.stroke(); break;
    default: ctx.moveTo(0, -h); ctx.lineTo(h, h * 0.8); ctx.lineTo(-h, h * 0.8); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -h * 0.3); ctx.lineTo(0, h * 0.25); ctx.stroke(); ctx.beginPath(); ctx.arc(0, h * 0.5, s * 0.05, 0, 7); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- globe (orthographic, cached)
const globes = new Map();
function globeImage(lon0, lat0, R, hiName, acc) {
  const key = `${lon0.toFixed(0)}|${lat0.toFixed(0)}|${Math.round(R)}|${hiName}|${acc}|${GLOBE_LOOK}`;
  if (globes.has(key)) return globes.get(key);
  const C = GLOBE_LOOK === 'grid' ? [] : allCountries();
  if (!C) return null;
  const S = Math.ceil(R * 2 + 4);
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = cv.getContext('2d');
  const cx = S / 2, cy = S / 2;
  const l0 = lon0 * D2R, p0 = lat0 * D2R, sp0 = Math.sin(p0), cp0 = Math.cos(p0);
  const proj = ([lon, lat]) => {
    const l = lon * D2R - l0, p = lat * D2R, cp = Math.cos(p), sp = Math.sin(p);
    const x = cp * Math.sin(l), y = cp0 * sp - sp0 * cp * Math.cos(l), c = sp0 * sp + cp0 * cp * Math.cos(l);
    if (c >= 0) return [cx + x * R, cy - y * R, true];
    const n = Math.hypot(x, y) || 1;
    return [cx + (x / n) * R, cy - (y / n) * R, false];
  };
  const oc = g.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
  if (GLOBE_LOOK === 'grid') { oc.addColorStop(0, '#0b2a4d'); oc.addColorStop(0.7, '#061529'); oc.addColorStop(1, '#030a16'); }
  else { oc.addColorStop(0, '#12335a'); oc.addColorStop(1, '#040d1b'); }
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fillStyle = oc; g.fill();
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  // graticule
  const gstep = GLOBE_LOOK === 'grid' ? 15 : 30;
  g.strokeStyle = hexA(acc, GLOBE_LOOK === 'grid' ? 0.16 : 0.09); g.lineWidth = GLOBE_LOOK === 'grid' ? 0.8 : 0.6;
  for (let lo = -180; lo < 180; lo += gstep) { g.beginPath(); let on = false; for (let la = -90; la <= 90; la += 5) { const q = proj([lo, la]); if (q[2]) { on ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); on = true; } else on = false; } g.stroke(); }
  for (let la = -90 + gstep; la < 90; la += gstep) { g.beginPath(); let on = false; for (let lo = -180; lo <= 180; lo += 5) { const q = proj([lo, la]); if (q[2]) { on ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); on = true; } else on = false; } g.stroke(); }
  const draw = (c, fill, stroke, lw) => {
    g.beginPath();
    let any = false;
    for (const p of c.polys) {
      const ring = p[0], step = ring.length > 400 ? 4 : ring.length > 120 ? 2 : 1;
      const pts = [];
      let front = false;
      for (let i = 0; i < ring.length; i += step) { const q = proj(ring[i]); front ||= q[2]; pts.push(q); }
      if (!front || pts.length < 3) continue;
      any = true;
      pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
      g.closePath();
    }
    if (!any) return;
    g.fillStyle = fill; g.fill('evenodd');
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
  };
  let hi = null;
  for (const c of C) { if (hiName && c.name === hiName) { hi = c; continue; } draw(c, '#1b3550', 'rgba(140,200,255,0.22)', 0.5); }
  if (hi) draw(hi, hexA(acc, 0.55), acc, 1.2);
  // shading for depth
  const sh = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.2, cx, cy, R * 1.05);
  sh.addColorStop(0, 'rgba(255,255,255,0.06)'); sh.addColorStop(0.7, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = sh; g.fillRect(0, 0, S, S);
  g.restore();
  const out = { cv, proj: (ll) => proj(ll), S };
  globes.set(key, out);
  if (globes.size > 60) globes.delete(globes.keys().next().value);
  return out;
}

// ---------------------------------------------------------------- before / after thumbnails
const unMerc01 = ([x, y]) => [x * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * y)))];
function thumb(ctx, spec, ll, x, y, w, h, u, acc, label, o, defZoom) {
  ctx.save();
  rr(ctx, x, y, w, h, 5 * u); ctx.fillStyle = '#0b1522'; ctx.fill();
  ctx.save(); rr(ctx, x, y, w, h, 5 * u); ctx.clip();
  let drawn = false;
  if (spec?.media) {
    const e = imageFor(spec.media);
    if (e?.ready) {
      const k = Math.max(w / e.w, h / e.h) * Math.max(1, +spec.zoom || 1), dw = e.w * k, dh = e.h * k;
      const ox = (w - dw) / 2 - (+spec.px || 0) * (dw - w) / 2, oy = (h - dh) / 2 - (+spec.py || 0) * (dh - h) / 2;
      ctx.drawImage(e.bmp, x + ox, y + oy, dw, dh); drawn = true;
    } else e?.p?.then(() => o.map?.triggerRepaint?.());
  } else if (spec?.url && ll) {
    H.setMap(o.map);
    const z = clamp((+defZoom || 15) + Math.log2(Math.max(1, +spec.zoom || 1)), +spec.minzoom || 0, +spec.maxzoom || 18);
    // move: shift the centre by up to half the box
    const n = 256 * 2 ** z, [mx, my] = merc(ll);
    const sx = (+spec.px || 0) * w / 2, sy = (+spec.py || 0) * h / 2;
    const c2 = unMerc01([mx + sx / n, my + sy / n]);
    drawTiles(ctx, spec.url, c2, z, x, y, w, h); drawn = true;
    // the spot
    ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 1.6 * u;
    ctx.beginPath(); ctx.arc(x + w / 2 - sx, y + h / 2 - sy + (h < 110 * u ? 8 * u : 0), Math.min(9 * u, h * 0.12), 0, Math.PI * 2); ctx.stroke();
  }
  if (!drawn) { caps(ctx, spec ? 'Loading…' : 'No image', x + w / 2, y + h / 2 + 4 * u, 10 * u, 'rgba(255,255,255,0.4)', 600, 0.15, 'center'); }
  // subtle vignette
  const vg = ctx.createLinearGradient(0, y, 0, y + h); vg.addColorStop(0, 'rgba(0,0,0,0.35)'); vg.addColorStop(0.3, 'rgba(0,0,0,0)'); ctx.fillStyle = vg; ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.strokeStyle = hexA(acc, 0.45); ctx.lineWidth = 1 * u; rr(ctx, x, y, w, h, 5 * u); ctx.stroke();
  brackets(ctx, x - 1 * u, y - 1 * u, w + 2 * u, h + 2 * u, u, acc, 10);
  // label chip
  const lab = String(label || '').toUpperCase(), sub = spec?.date || '';
  ctx.font = `800 ${11 * u}px ${SANS}`;
  const labW = ctx.measureText(lab).width + lab.length * 11 * u * 0.1;
  ctx.font = `600 ${9.5 * u}px ${MONO}`;
  const subW = sub ? ctx.measureText(sub).width + 8 * u : 0;
  ctx.fillStyle = 'rgba(4,10,18,0.85)'; rr(ctx, x + 8 * u, y + 8 * u, labW + subW + 18 * u, 20 * u, 3 * u); ctx.fill();
  ctx.strokeStyle = hexA(acc, 0.6); ctx.lineWidth = 0.8 * u; ctx.stroke();
  caps(ctx, lab, x + 17 * u, y + 22 * u, 11 * u, '#ffffff', 800, 0.1);
  if (sub) { ctx.font = `600 ${9.5 * u}px ${MONO}`; ctx.fillStyle = acc; ctx.textAlign = 'left'; ctx.fillText(sub, x + 17 * u + labW + 8 * u, y + 21.5 * u); }
  ctx.restore();
}

// ---------------------------------------------------------------- locator (country in Mercator)
function locator(ctx, ll, country, x, y, w, h, u, acc, place) {
  const C = allCountries();
  if (!C) return;
  const c = (ll && countryAt(ll)) || (country && (countriesByName(country) || [])[0]);
  let box;
  if (c) {
    const big = c.polys.reduce((m, p) => (p[0].length > m[0].length ? p : m), c.polys[0]);
    const [w0, s0, e0, n0] = bboxOf([big]);
    const pw = (e0 - w0) * 0.35 + 0.5, ph = (n0 - s0) * 0.35 + 0.5;
    box = [w0 - pw, s0 - ph, e0 + pw, n0 + ph];
    if (ll) box = [Math.min(box[0], ll[0] - 1), Math.min(box[1], ll[1] - 1), Math.max(box[2], ll[0] + 1), Math.max(box[3], ll[1] + 1)];
  } else if (ll) box = [ll[0] - 8, ll[1] - 6, ll[0] + 8, ll[1] + 6];
  else return;
  let [ax, ay] = merc([box[0], box[3]]), [bx, by] = merc([box[2], box[1]]);
  // keep the panel's aspect
  const k0 = Math.min(w / (bx - ax), h / (by - ay));
  const cxm = (ax + bx) / 2, cym = (ay + by) / 2;
  ax = cxm - w / k0 / 2; bx = cxm + w / k0 / 2; ay = cym - h / k0 / 2; by = cym + h / k0 / 2;
  const to = (q) => { const [mx, my] = merc(q); return [x + (mx - ax) * k0, y + (my - ay) * k0]; };
  ctx.save(); rr(ctx, x, y, w, h, 4 * u); ctx.clip();
  ctx.fillStyle = '#06101d'; ctx.fillRect(x, y, w, h);
  const vb = [box[0] - 30, box[1] - 30, box[2] + 30, box[3] + 30];
  for (const cc of C) {
    if (cc.bbox[2] < vb[0] || cc.bbox[0] > vb[2] || cc.bbox[3] < vb[1] || cc.bbox[1] > vb[3]) continue;
    ctx.beginPath(); H.pathPolys(ctx, cc.polys, to);
    ctx.fillStyle = cc === c ? hexA(acc, 0.32) : '#13253a'; ctx.fill('evenodd');
    ctx.strokeStyle = cc === c ? acc : 'rgba(140,200,255,0.25)'; ctx.lineWidth = (cc === c ? 1.3 : 0.6) * u; ctx.stroke();
  }
  if (c) { const lp = labelPoint(c.polys); if (lp) { const q = to(lp); caps(ctx, c.name, q[0], q[1] - (ll ? 0 : 0), 10 * u, 'rgba(255,255,255,0.55)', 700, 0.2, 'center'); } }
  if (ll) {
    const q = to(ll);
    ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(q[0], q[1], 4 * u, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,59,48,0.5)'; ctx.lineWidth = 1.5 * u; ctx.beginPath(); ctx.arc(q[0], q[1], 9 * u, 0, Math.PI * 2); ctx.stroke();
    if (place) {
      ctx.font = `700 ${10 * u}px ${SANS}`;
      const tw = ctx.measureText(place.toUpperCase()).width + 12 * u;
      const lx = clamp(q[0] + 12 * u, x + 4 * u, x + w - tw - 4 * u), ly = clamp(q[1] - 22 * u, y + 4 * u, y + h - 20 * u);
      ctx.fillStyle = 'rgba(4,10,18,0.85)'; rr(ctx, lx, ly, tw, 17 * u, 3 * u); ctx.fill(); ctx.strokeStyle = hexA(acc, 0.7); ctx.lineWidth = 0.8 * u; ctx.stroke();
      caps(ctx, place, lx + 6 * u, ly + 12 * u, 10 * u, '#fff', 700, 0.04);
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- tag inside the map window
function windowTag(ctx, L, o, wx, wy, ww, wh, u, acc, align = 'right') {
  const s = L.style, ll = L.geom?.coordinates;
  if (!partOn(s, 'tag')) return;
  const tag = String(s.tag || s.event || '').toUpperCase();
  const place = [s.place, s.country].filter(Boolean).join(', ').toUpperCase();
  const lines = [[tag, 800, 15], [place, 600, 11], [s.coords || '', 500, 10]].filter((l) => l[0]);
  if (!lines.length) return;
  let tw = 0;
  for (const [t, wt, sz] of lines) { ctx.font = `${wt} ${sz * u}px ${wt === 500 ? MONO : SANS}`; tw = Math.max(tw, ctx.measureText(t).width); }
  const bw = tw + 26 * u, bh = 14 * u + lines.reduce((a, l) => a + l[2] * 1.45 * u, 0);
  let bx = align === 'right' ? wx + ww - bw - 22 * u : wx + 22 * u, by = wy + 22 * u;
  const p = ll && o.proj ? o.proj(ll) : null;
  const inside = p && p[0] > wx && p[0] < wx + ww && p[1] > wy && p[1] < wy + wh;
  if (!L.style.pos_tag && inside && p[0] > bx - 20 * u && p[1] < by + bh + 30 * u) by = Math.min(wy + wh - bh - 22 * u, p[1] + 40 * u);
  ctx.save(); const [tdx, tdy] = placeAt(ctx, L, o.frame, bx, by, bw, bh, { key: 'tag' }); ctx.restore();
  bx += tdx; by += tdy;
  if (inside) {
    const ax = clamp(p[0], bx, bx + bw), ay = by + (p[1] > by ? bh : 0);
    ctx.strokeStyle = hexA(acc, 0.85); ctx.lineWidth = 1.2 * u;
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(ax, ay); ctx.stroke();
    ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(p[0], p[1], 3 * u, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(4,10,18,0.82)'; rr(ctx, bx, by, bw, bh, 3 * u); ctx.fill();
  ctx.strokeStyle = hexA(acc, 0.55); ctx.lineWidth = 1 * u; ctx.stroke();
  ctx.fillStyle = acc; ctx.fillRect(bx, by, 3 * u, bh);
  let ty = by + 7 * u;
  for (const [t, wt, sz] of lines) {
    ty += sz * 1.2 * u;
    ctx.font = `${wt} ${sz * u}px ${wt === 500 ? MONO : SANS}`; ctx.fillStyle = wt === 800 ? '#fff' : wt === 500 ? acc : 'rgba(255,255,255,0.8)'; ctx.textAlign = 'left';
    ctx.fillText(t, bx + 13 * u, ty);
    ty += sz * 0.25 * u;
  }
}
function scaleBar(ctx, o, ll, x, y, u, acc, L) {
  if (L && !partOn(L.style, 'scale')) return;
  if (!o.proj || !ll) return;
  u *= L.style.size_scale?.w || 1;
  ctx.save(); const [sdx, sdy] = placeAt(ctx, L, o.frame, x - 8 * u, y - 18 * u, 200 * u, 30 * u, { key: 'scale', resize: true, uniform: true }); ctx.restore();
  x += sdx; y += sdy;
  const a = o.proj(ll), b = o.proj([ll[0] + 0.01, ll[1]]);
  const pxPerM = Math.hypot(b[0] - a[0], b[1] - a[1]) / (0.01 * 111320 * Math.cos(ll[1] * D2R));
  if (!(pxPerM > 0)) return;
  const target = 140 * u / pxPerM;
  const pow = 10 ** Math.floor(Math.log10(target)), nice = [1, 2, 5, 10].map((k) => k * pow).filter((v) => v <= target).pop() || pow;
  const W = nice * pxPerM;
  ctx.fillStyle = 'rgba(4,10,18,0.75)'; rr(ctx, x - 8 * u, y - 18 * u, W + 52 * u, 30 * u, 3 * u); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2 * u;
  ctx.beginPath(); ctx.moveTo(x, y - 5 * u); ctx.lineTo(x, y); ctx.lineTo(x + W, y); ctx.lineTo(x + W, y - 5 * u); ctx.moveTo(x + W / 2, y); ctx.lineTo(x + W / 2, y - 3 * u); ctx.stroke();
  ctx.font = `600 ${9.5 * u}px ${MONO}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
  ctx.fillText('0', x - 3 * u, y - 8 * u);
  ctx.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, x + W + 6 * u, y + 3 * u);
}

/** is this part drawn by this layer? (split layers draw one part each; a whole frame draws every part not switched off) */
export const partOn = (s, k) => (s.only ? s.only === k : !s[`off_${k}`]);

// ---------------------------------------------------------------- star field (deep space theme)
const STARS = Array.from({ length: 260 }, (_, i) => { const r = (n) => { const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return x - Math.floor(x); }; return [r(1), r(2), r(3), r(4)]; });
function drawStars(ctx, fr, u, t) {
  ctx.save();
  for (const [x, y, m, ph] of STARS) {
    const tw = 0.55 + 0.45 * Math.sin(t * (0.6 + m) + ph * 6.28);
    ctx.fillStyle = `rgba(200,225,255,${(0.15 + m * 0.55) * tw})`;
    const r = (0.4 + m * m * 1.3) * u;
    ctx.fillRect(fr.x + x * fr.w, fr.y + y * fr.h, r, r);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- place tag (pin + place + coordinates) and north arrow
function placeTag(ctx, L, o, x, y, u, acc) {
  let s = L.style;
  if (!partOn(s, 'tag')) return;
  const g = L.geom?.coordinates;
  if (!s.coords && g) s = { ...s, coords: `${Math.abs(g[1]).toFixed(4)}° ${g[1] >= 0 ? 'N' : 'S'}, ${Math.abs(g[0]).toFixed(4)}° ${g[0] >= 0 ? 'E' : 'W'}` };
  const place = [s.place, s.country].filter(Boolean).join(', ').toUpperCase();
  if (!place && !s.coords) return;
  ctx.font = `800 ${15 * u}px ${SANS}`; const w1 = ctx.measureText(place).width;
  ctx.font = `500 ${10 * u}px ${MONO}`; const w2 = ctx.measureText(s.coords || '').width;
  const bw = Math.max(w1, w2) + 52 * u, bh = s.coords ? 46 * u : 32 * u;
  const k = s.size_tag?.w || 1;
  ctx.save(); const [dx, dy] = placeAt(ctx, L, o.frame, x, y, bw * k, bh * k, { key: 'tag', resize: true, uniform: true }); ctx.restore();
  x += dx; y += dy;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.translate(-x, -y);
  ctx.fillStyle = 'rgba(4,10,18,0.85)'; rr(ctx, x, y, bw, bh, 3 * u); ctx.fill();
  ctx.strokeStyle = hexA(acc, 0.6); ctx.lineWidth = 1 * u; ctx.stroke();
  ctx.fillStyle = acc; ctx.fillRect(x, y, 3 * u, bh);
  icon(ctx, 'pin', x + 20 * u, y + bh / 2, 16 * u, acc);
  ctx.font = `800 ${15 * u}px ${SANS}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(place, x + 38 * u, y + (s.coords ? 21 : 21) * u);
  if (s.coords) { ctx.font = `500 ${10 * u}px ${MONO}`; ctx.fillStyle = acc; ctx.fillText(s.coords, x + 38 * u, y + 37 * u); }
  ctx.restore();
}
function northArrow(ctx, o, x, y, u, acc, L) {
  if (!partOn(L.style, 'north')) return;
  u *= L.style.size_north?.w || 1;
  ctx.save(); const [dx, dy] = placeAt(ctx, L, o.frame, x - 14 * u, y - 14 * u, 28 * u, 28 * u, { key: 'north', resize: true, uniform: true }); ctx.restore();
  x += dx; y += dy;
  let b = 0; try { b = o.map?.getBearing?.() || 0; } catch { /* */ }
  ctx.save();
  ctx.fillStyle = 'rgba(4,10,18,0.8)'; ctx.beginPath(); ctx.arc(x, y, 14 * u, 0, Math.PI * 2); ctx.fill();
  ctx.translate(x, y); ctx.rotate(-b * D2R);
  ctx.fillStyle = acc; ctx.beginPath(); ctx.moveTo(0, -10 * u); ctx.lineTo(5 * u, 2 * u); ctx.lineTo(0, -1 * u); ctx.lineTo(-5 * u, 2 * u); ctx.closePath(); ctx.fill();
  ctx.font = `800 ${7 * u}px ${SANS}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('N', 0, 10 * u);
  ctx.restore();
}

// ---------------------------------------------------------------- header bar and breaking ticker
const logosShown = (L, scene) => (L.style.only ? (scene?.layers || []).some((l) => l.kind === 'briefing' && l.style.only === 'logos' && !l.hidden) : partOn(L.style, 'logos'));
/** logos: left and right, in the header row (top) or the bottom band (above the ticker) */
function drawLogos(ctx, L, fr, u) {
  const s = L.style, place = s.logoPlace || 'top';
  const bandH = fr.h * 0.085;
  const yc = place === 'bottom' ? fr.y + fr.h - (s.tickerOn ? fr.h * 0.058 : 0) - bandH / 2 - 4 * u : fr.y + bandH / 2;
  const one = (id, key, sizeKey, left) => {
    const lg = id && imageFor(id);
    if (!lg?.ready) { lg?.p?.then(() => lastMapRepaint()); return; }
    const k = (+s[sizeKey] || 1) * (s[`size_${key}`]?.w || 1);
    const lh = bandH * 0.62 * k, lw = Math.min(lh * (lg.w / lg.h), fr.w * 0.3), lhh = lw * (lg.h / lg.w);
    let x = left ? fr.x + fr.w * 0.03 : fr.x + fr.w * 0.97 - lw;
    if (!left && place === 'top' && s.header) { ctx.font = `700 ${8.5 * u}px ${SANS}`; x -= ctx.measureText(String(s.kicker || 'Geospatial intelligence briefing').toUpperCase()).width * 1.2 + 16 * u; }
    const y = yc - lhh / 2;
    ctx.save(); placeAt(ctx, L, fr, x, y, lw, lhh, { key, resize: true, uniform: true }); ctx.drawImage(lg.bmp, x, y, lw, lhh); ctx.restore();
  };
  one(s.logo, 'logo', 'logoSize', true);
  one(s.logo2, 'logo2', 'logo2Size', false);
}
function headerBar(ctx, L, fr, u, acc, k, scene) {
  // the project's logo strip at the top takes the header row, so the header keeps only its background then
  // the project's logo strip at the top replaces the header text, and the header band grows to sit behind the whole strip
  const safeTop = brandSafeArea(fr.w, fr.h).top;
  const s0 = L.style, s = s0.headerText === false || safeTop > 0 ? { ...s0, headerOrg: false, headerBrand: false, headerRight: false } : s0, y = fr.y;
  const h = Math.max(fr.h * 0.085, safeTop > 0 ? safeTop * fr.h - fr.h * 0.008 : 0);
  ctx.save(); ctx.globalAlpha *= k;
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(3,8,16,0.96)'); g.addColorStop(1, 'rgba(5,12,24,0.92)');
  ctx.fillStyle = g; ctx.fillRect(fr.x, y, fr.w, h);
  ctx.strokeStyle = hexA(acc, 0.22); ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.moveTo(fr.x + fr.w * 0.025, y + h); ctx.lineTo(fr.x + fr.w * 0.975, y + h); ctx.stroke();
  // glow arc under the centre title
  const cx = fr.x + fr.w / 2;
  ctx.save(); ctx.beginPath(); ctx.rect(fr.x, y + h * 0.6, fr.w, h * 0.9); ctx.clip();
  const ag = ctx.createLinearGradient(cx - fr.w * 0.3, 0, cx + fr.w * 0.3, 0); ag.addColorStop(0, hexA(acc, 0)); ag.addColorStop(0.5, hexA(acc, 0.85)); ag.addColorStop(1, hexA(acc, 0));
  ctx.strokeStyle = ag; ctx.lineWidth = 2 * u; ctx.shadowColor = acc; ctx.shadowBlur = 14 * u;
  ctx.beginPath(); ctx.ellipse(cx, y + h * 0.15, fr.w * 0.3, h * 0.95, 0, 0.05 * Math.PI, 0.95 * Math.PI); ctx.stroke();
  ctx.restore();
  // left: organisation (moves right of the logo when the logo sits in the header row)
  let lx = fr.x + fr.w * 0.03;
  if (s.logo && (s.logoPlace || 'top') === 'top' && logosShown(L, scene)) { const lg = imageFor(s.logo); if (lg?.ready && !s.pos_logo) { const lh = h * 0.62 * (+s.logoSize || 1) * (s.size_logo?.w || 1); lx += Math.min(lh * (lg.w / lg.h), fr.w * 0.3) + 12 * u; } }
  if (s.headerOrg !== false) {
  caps(ctx, s.org || '', lx, y + h * 0.42, 10 * u, '#fff', 800, 0.08);
  ctx.font = `500 ${9 * u}px ${SANS}`; ctx.fillStyle = 'rgba(200,215,235,0.7)'; ctx.textAlign = 'left'; ctx.fillText(s.unit || '', lx, y + h * 0.7);
  }
  if (s.headerOrg !== false) { ctx.fillStyle = acc; ctx.fillRect(lx - 4 * u, y + h - 2 * u, 110 * u, 2 * u); }
  if (s.headerOrg !== false) { ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.moveTo(lx + 128 * u, y + h * 0.25); ctx.lineTo(lx + 128 * u, y + h * 0.8); ctx.stroke(); }
  // centre: brand
  ctx.font = `800 ${19 * u}px ${DISP}`;
  try { ctx.letterSpacing = `${5 * u}px`; } catch { /* */ }
  ctx.fillStyle = '#eaf6ff'; ctx.textAlign = 'center'; ctx.shadowColor = hexA(acc, 0.6); ctx.shadowBlur = 10 * u;
  if (s.headerBrand !== false) ctx.fillText(String(s.brand || '').toUpperCase(), cx, y + h * 0.62);
  ctx.shadowBlur = 0; try { ctx.letterSpacing = '0px'; } catch { /* */ }
  // right: briefing line
  const rx = fr.x + fr.w * 0.97;
  if (s.headerRight !== false) {
  caps(ctx, s.kicker || 'Geospatial intelligence briefing', rx, y + h * 0.42, 8.5 * u, acc, 700, 0.2, 'right');
  ctx.font = `500 ${8.5 * u}px ${MONO}`; ctx.fillStyle = 'rgba(200,215,235,0.7)'; ctx.textAlign = 'right';
  ctx.fillText(`BRIEFING${s.date ? ` · ${String(s.date).toUpperCase()}` : ''}`, rx, y + h * 0.7);
  }
  if (s.headerRight !== false) { ctx.fillStyle = acc; ctx.fillRect(rx - 106 * u, y + h - 2 * u, 110 * u, 2 * u); }
  ctx.restore();
}
let repaintMap = null;
const fontsAsked = new Set();
const lastMapRepaint = () => repaintMap?.triggerRepaint?.();
function tickerBar(ctx, L, fr, u, acc, k, t) {
  const s = L.style, h = fr.h * 0.058, y = fr.y + fr.h - h;
  const items = String(s.ticker || [s.title, s.sub, s.event].filter(Boolean).join('\n')).split(/\n|\|/).map((x) => x.trim()).filter(Boolean);
  if (!items.length) return;
  ctx.save(); ctx.globalAlpha *= k;
  ctx.fillStyle = 'rgba(3,8,16,0.95)'; ctx.fillRect(fr.x, y, fr.w, h);
  ctx.strokeStyle = hexA(acc, 0.25); ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.moveTo(fr.x, y); ctx.lineTo(fr.x + fr.w, y); ctx.stroke();
  const lab = String(s.tickerLabel || 'Breaking').toUpperCase();
  ctx.font = `800 ${13 * u}px ${SANS}`;
  const lw = ctx.measureText(lab).width + lab.length * 1.6 * u + 34 * u;
  ctx.save(); ctx.beginPath(); ctx.rect(fr.x + lw, y, fr.w - lw, h); ctx.clip();
  const sep = '   ◆   ';
  ctx.font = `600 ${14 * u}px ${SANS}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const line = items.join(sep) + sep;
  const W = ctx.measureText(line).width;
  let x = fr.x + lw + 16 * u - ((t * 70 * u) % W);
  while (x < fr.x + fr.w) { ctx.fillText(line, x, y + h / 2 + 1 * u); x += W; }
  ctx.restore();
  ctx.fillStyle = acc; ctx.fillRect(fr.x, y, lw, h);
  caps(ctx, lab, fr.x + 17 * u, y + h / 2 + 4.5 * u, 13 * u, '#04121f', 800, 0.12);
  ctx.restore();
}

// ---------------------------------------------------------------- marker with a label box
function drawMark(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, ll = L.geom?.coordinates;
  if (!fr || !ll || !o.proj) return;
  const u = (fr.w / 1000) * (+s.size || 1), acc = s.accent || '#35c8ff';
  const p = o.proj(ll);
  const k = tm.edit || L.anim === 'none' ? 1 : clamp(tm.tau / Math.max(0.1, +L.duration || 0.8), 0, 1);
  const kk = easeOut(k);
  ctx.save(); ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' ? kk : 1);
  if (s.ring !== false) { for (let i = 0; i < 2; i++) { const ph = ((o.time * 0.8) + i * 0.5) % 1; ctx.strokeStyle = hexA(acc, (1 - ph) * 0.9); ctx.lineWidth = 1.4 * u; ctx.beginPath(); ctx.arc(p[0], p[1], (6 + ph * 22) * u, 0, Math.PI * 2); ctx.stroke(); } }
  ctx.fillStyle = hexA(acc, 0.35); ctx.beginPath(); ctx.arc(p[0], p[1], 9 * u * (L.anim === 'pop' ? kk : 1), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(p[0], p[1], 4 * u, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p[0], p[1], 1.6 * u, 0, Math.PI * 2); ctx.fill();
  const text = String(s.text || '').toUpperCase(), sub = s.sub || '';
  if (text) {
    ctx.font = `800 ${12 * u}px ${SANS}`; const tw = ctx.measureText(text).width + text.length * 0.8 * u;
    ctx.font = `500 ${9.5 * u}px ${MONO}`; const sw = sub ? ctx.measureText(sub).width : 0;
    const bw = Math.max(tw, sw) + 24 * u, bh = sub ? 40 * u : 27 * u;
    const bx = p[0] + (+s.dx || 0) * u - bw / 2, by = p[1] + (+s.dy || 0) * u - bh / 2;
    const ax = clamp(p[0], bx, bx + bw), ay = p[1] < by ? by : p[1] > by + bh ? by + bh : by + bh / 2;
    const ex = ay === by + bh / 2 ? (p[0] < bx ? bx : bx + bw) : ax;
    ctx.strokeStyle = hexA(acc, 0.9); ctx.lineWidth = 1.2 * u;
    const reach = L.anim === 'pop' ? kk : 1;
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + (ex - p[0]) * reach, p[1] + (ay - p[1]) * reach); ctx.stroke();
    ctx.globalAlpha *= L.anim === 'pop' ? clamp(k * 2 - 0.6, 0, 1) : 1;
    ctx.fillStyle = 'rgba(4,10,18,0.88)'; rr(ctx, bx, by, bw, bh, 3 * u); ctx.fill();
    ctx.strokeStyle = hexA(acc, 0.75); ctx.lineWidth = 1 * u; ctx.stroke();
    caps(ctx, text, bx + 12 * u, by + 18 * u, 12 * u, '#fff', 800, 0.07);
    if (sub) { ctx.font = `500 ${9.5 * u}px ${MONO}`; ctx.fillStyle = acc; ctx.textAlign = 'left'; ctx.fillText(sub, bx + 12 * u, by + 32 * u); }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- build-in effects (corner marks + scan line), drawn on top of the parts
const PART_DELAY = { background: 0, frame: 0.1, win: 0.25, header: 0, logos: 0, ticker: 0.2, introGlobe: 0, introTitle: 0.5, globe: 0.15, title: 0.35, heading: 0.15, info: 0.55, locator: 0.35, side: 0.6, before: 0.7, after: 0.95, strip: 0.85, tag: 1.05, scale: 1.1, north: 1.1, titleBlock: 0.45, slide: 0.2, caption: 0.5, endTitle: 0.1, endFields: 0.5, endSources: 0.8 };
let FX = [];
function drawFx(ctx) {
  for (const f of FX) {
    const { x, y, w, h, rv, show, u, acc } = f;
    ctx.save();
    // corner marks grow in first
    const g = clamp(rv / 0.3, 0, 1), l = Math.min(w, h) * 0.18 * g + 4 * u;
    ctx.strokeStyle = acc; ctx.lineWidth = 2 * u; ctx.globalAlpha = clamp(rv * 4, 0, 1) * (1 - clamp((rv - 0.85) / 0.15, 0, 1));
    ctx.beginPath();
    ctx.moveTo(x, y + l); ctx.lineTo(x, y); ctx.lineTo(x + l, y);
    ctx.moveTo(x + w - l, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + l);
    ctx.moveTo(x + w, y + h - l); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - l, y + h);
    ctx.moveTo(x + l, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - l);
    ctx.stroke();
    // scan line at the reveal edge
    if (show > 0 && show < 1) {
      const ly = y + h * show;
      ctx.globalAlpha = 1;
      const band = ctx.createLinearGradient(0, ly - 40 * u, 0, ly);
      band.addColorStop(0, hexA(acc, 0)); band.addColorStop(1, hexA(acc, 0.28));
      ctx.fillStyle = band; ctx.fillRect(x, ly - 40 * u, w, 40 * u);
      ctx.shadowColor = acc; ctx.shadowBlur = 12 * u; ctx.fillStyle = '#d8f4ff';
      ctx.fillRect(x - 2 * u, ly - 1 * u, w + 4 * u, 2 * u);
    }
    ctx.restore();
  }
  FX = [];
}

// ================================================================= main draw
export function drawBriefing(ctx, L, tm, o) {
  if (L.kind === 'briefmark') return drawMark(ctx, L, tm, o);
  const fr = o.frame;
  if (!fr) return;
  repaintMap = o.map || repaintMap;
  const TH = BR_THEMES[L.style.theme] || BR_THEMES.navy;
  if (TH.font && !fontsAsked.has(TH.font) && typeof document !== 'undefined' && document.fonts?.load) { fontsAsked.add(TH.font); Promise.all([500, 600, 700].map((w) => document.fonts.load(`${w} 20px "${TH.font}"`))).then(() => lastMapRepaint()).catch(() => {}); }
  const keep = [DISP, SANS, MONO, GLOBE_LOOK];
  DISP = TH.disp; SANS = TH.sans; MONO = TH.mono; GLOBE_LOOK = TH.globe;
  FX = [];
  try { drawFrameBody(ctx, L, tm, o); } finally { [DISP, SANS, MONO, GLOBE_LOOK] = keep; }
  drawFx(ctx);
  DISP = TH.disp; SANS = TH.sans; MONO = TH.mono;
  const s = L.style, u = fr.w / 1000, acc = s.accent || '#35c8ff';
  const k = tm.edit || L.anim === 'none' ? 1 : easeOut(clamp(tm.tau / 0.5, 0, 1));
  ctx.save(); ctx.globalAlpha *= tm.alpha;
  if (s.header && partOn(s, 'header')) headerBar(ctx, L, fr, u, acc, k, o.scene);
  if (s.tickerOn && partOn(s, 'ticker')) tickerBar(ctx, L, fr, u, acc, k, o.time || 0);
  if ((s.logo || s.logo2) && partOn(s, 'logos')) { ctx.save(); ctx.globalAlpha *= tm.alpha * k; drawLogos(ctx, L, fr, u); ctx.restore(); }
  ctx.restore();
  [DISP, SANS, MONO, GLOBE_LOOK] = keep;
}
function drawFrameBody(ctx, L, tm, o) {
  const fr = o.frame;
  if (!fr) return;
  const s = L.style, acc = s.accent || '#35c8ff';
  const u = fr.w / 1000;
  // the incident point, or the middle of the map when the frame has no point (added by hand)
  let ll = L.geom?.coordinates || null;
  if (!ll && s.country) { const c = (countriesByName(s.country) || [])[0]; if (c) ll = labelPoint(c.polys); }
  if (!ll) { try { const c = o.map?.getCenter?.(); if (c) ll = [c.lng, c.lat]; } catch { /* */ } }
  const aspect = fr.w / fr.h;
  const side = (k) => {
    const base = s[`${k}Media`] ? { media: s[`${k}Media`] } : s[k] ? { ...s[k] } : null;
    return base && { ...base, date: s[`${k}Date`] || base.date || '', zoom: +s[`${k}Zoom`] || 1, px: +s[`${k}X`] || 0, py: +s[`${k}Y`] || 0 };
  };
  const BA = [side('before'), side('after')], BAL = [s.beforeLabel || 'Before', s.afterLabel || 'After'];
  const hasThumbs = !!(BA[0] || BA[1] || s.photos?.length);
  const Bx = layoutBoxes(s.layout || 'A', aspect, hasThumbs, { header: s.header, ticker: s.tickerOn, safe: brandSafeArea(fr.w, fr.h) });
  const P = (b) => [fr.x + b[0] * fr.w, fr.y + b[1] * fr.h, b[2] * fr.w, b[3] * fr.h];
  const k = tm.edit || L.anim === 'none' ? 1 : clamp(tm.tau / Math.max(0.2, +L.duration || 1), 0, 1);
  const kk = easeOut(k);
  const build = L.anim === 'build' && !tm.edit;
  const stage = (i) => (build ? clamp(kk * 4 - i * 0.6, 0, 1) : 1);
  const tau = +tm.tau || 0;
  const reveal = (key) => (build ? clamp((tau - (PART_DELAY[key] ?? 0.4)) / 0.7, 0, 1) : 1);
  ctx.save();
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !tm.edit ? kk : 1);
  // every panel can be dragged on the video (positions are kept as style.pos_<key>)
  // …and resized from their bottom-right corner (style.size_<key>): boxes stretch, text panels scale evenly
  const sizeOf = (key) => ({ w: 1, h: 1, ...(s[`size_${key}`] || {}) });
  const sizeBox = (key, b) => { const S = sizeOf(key); return [b[0], b[1], b[2] * S.w, b[3] * S.h]; };
  const at = (key, b, box = false) => {
    if (!partOn(s, key)) { ctx.globalAlpha = 0; return [0, 0]; }
    const rv = reveal(key);
    if (box) {
      const r = placeAt(ctx, L, fr, b[0], b[1], b[2], b[3], { key, resize: true });
      if (rv < 1) {
        // frame first (corner marks), then the content wipes in from the top behind a scan line
        const p = 6 * u, show = clamp((rv - 0.25) / 0.75, 0, 1);
        ctx.beginPath(); ctx.rect(b[0] - p, b[1] - p, b[2] + 2 * p, (b[3] + 2 * p) * show); ctx.clip();
        FX.push({ x: b[0] + r[0], y: b[1] + r[1], w: b[2], h: b[3], rv, show, u, acc: s.accent || '#35c8ff' });
      }
      return r;
    }
    const k = sizeOf(key).w;
    const r = placeAt(ctx, L, fr, b[0], b[1], b[2] * k, b[3] * k, { key, resize: true, uniform: true });
    if (k !== 1) { ctx.translate(b[0], b[1]); ctx.scale(k, k); ctx.translate(-b[0], -b[1]); }
    if (rv < 1) { const e = easeOut(rv); ctx.globalAlpha *= e; ctx.beginPath(); ctx.rect(b[0] - 20 * u, b[1] - 40 * u, (b[2] + 40 * u) * e, b[3] + 80 * u); ctx.clip(); }
    return r;
  };
  // ---- background chrome with the window cut out
  let win = Bx.win ? sizeBox('win', P(Bx.win)) : null;
  if (win) {
    if (!s.only || s.only === 'frame' || s.only === 'background') { ctx.save(); const [wdx, wdy] = placeAt(ctx, L, fr, win[0], win[1], win[2], win[3], { key: 'win', resize: true, edge: true }); ctx.restore(); win = [win[0] + wdx, win[1] + wdy, win[2], win[3]]; }
    else if (s.pos_win) { const c = s.pos_win; win = [fr.x + c.x * fr.w - win[2] / 2, fr.y + c.y * fr.h - win[3] / 2, win[2], win[3]]; }
  }
  const TH = BR_THEMES[s.theme] || BR_THEMES.navy;
  const bgOn = partOn(s, 'background');
  if (bgOn) {
  ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h);
  if (win) rrAdd(ctx, win[0], win[1], win[2], win[3], 6 * u);
  const bgG = ctx.createLinearGradient(fr.x, fr.y, fr.x + fr.w * 0.4, fr.y + fr.h);
  bgG.addColorStop(0, s.theme && s.theme !== 'navy' ? TH.bg : s.bg || TH.bg); bgG.addColorStop(1, TH.bg2);
  ctx.fillStyle = bgG; ctx.fill('evenodd');
  }
  // faint grid
  ctx.save(); ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); if (win) rrAdd(ctx, win[0], win[1], win[2], win[3], 6 * u); ctx.clip('evenodd');
  if (!bgOn) ctx.globalAlpha = 0;
  if (TH.stars) drawStars(ctx, fr, u, o.time || 0);
  ctx.strokeStyle = hexA(acc, TH.grid ? 0.04 : 0); ctx.lineWidth = 1;
  ctx.beginPath(); for (let gx = fr.x; gx < fr.x + fr.w; gx += 40 * u) { ctx.moveTo(gx, fr.y); ctx.lineTo(gx, fr.y + fr.h); } for (let gy = fr.y; gy < fr.y + fr.h; gy += 40 * u) { ctx.moveTo(fr.x, gy); ctx.lineTo(fr.x + fr.w, gy); } ctx.stroke();
  // top hairline under the logo band
  if (!s.header) { ctx.strokeStyle = hexA(acc, 0.18); ctx.beginPath(); ctx.moveTo(fr.x + 0.03 * fr.w, fr.y + 0.15 * fr.h); ctx.lineTo(fr.x + 0.97 * fr.w, fr.y + 0.15 * fr.h); ctx.stroke(); }
  ctx.restore();
  // the map inside the window wipes in from the top
  const winR = win ? reveal('win') : 1;
  if (win && winR < 1 && bgOn) {
    const wy = win[1] + win[3] * easeOut(winR);
    ctx.save(); ctx.fillStyle = TH.bg; ctx.fillRect(win[0] - 1, wy, win[2] + 2, win[1] + win[3] - wy + 1); ctx.restore();
  }
  if (win && winR < 1 && partOn(s, 'frame')) FX.push({ x: win[0], y: win[1], w: win[2], h: win[3], rv: winR, show: easeOut(winR), u, acc: s.accent || '#35c8ff', win: true });
  if (win && partOn(s, 'frame')) {
    ctx.strokeStyle = hexA(acc, 0.5); ctx.lineWidth = 1.2 * u; rr(ctx, win[0], win[1], win[2], win[3], 6 * u); ctx.stroke();
    brackets(ctx, win[0] - 3 * u, win[1] - 3 * u, win[2] + 6 * u, win[3] + 6 * u, u, acc, 18);
    // inner vignette
    ctx.save(); rr(ctx, win[0], win[1], win[2], win[3], 6 * u); ctx.clip();
    const vg = ctx.createRadialGradient(win[0] + win[2] / 2, win[1] + win[3] / 2, Math.min(win[2], win[3]) * 0.45, win[0] + win[2] / 2, win[1] + win[3] / 2, Math.max(win[2], win[3]) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,8,20,0.35)'); ctx.fillStyle = vg; ctx.fillRect(win[0], win[1], win[2], win[3]);
    ctx.restore();
  }
  const title = String(s.title || ''), sub = String(s.sub || '');
  const evIcon = s.eventIcon || 'alert';
  const fields = [['calendar', s.dateLabel || 'Incident date', s.date, 'date'], ['pin', s.placeLabel || 'Location', [s.place, s.country].filter(Boolean).join(', '), 'place'], [evIcon, s.eventLabel || 'Event', s.event, 'event'], ['shield', s.assessLabel || 'Assessment', s.assessment, 'assess']].filter((f) => f[2]);

  if (Bx.intro) {
    // ---- intro: the title over the curve of a big globe
    const cx = fr.x + fr.w / 2;
    const R = fr.w * 0.42, gy = fr.y + fr.h * 1.02 + R * 0.35;
    ctx.save(); ctx.globalAlpha *= stage(0); if (!partOn(s, 'introGlobe')) ctx.globalAlpha = 0;
    const glow = ctx.createRadialGradient(cx, gy, R * 0.9, cx, gy, R * 1.12);
    glow.addColorStop(0, hexA(acc, 0.28)); glow.addColorStop(1, hexA(acc, 0)); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, gy, R * 1.12, 0, Math.PI * 2); ctx.fill();
    const G = ll && globeImage(ll[0], clamp(ll[1] - 28, -60, 60), Math.round(R / 8) * 8, '', acc);
    if (G) { ctx.save(); ctx.beginPath(); ctx.arc(cx, gy, R, 0, Math.PI * 2); ctx.clip(); ctx.globalAlpha *= 0.9; ctx.drawImage(G.cv, cx - G.S / 2, gy - G.S / 2); ctx.restore(); }
    else { ctx.fillStyle = '#0a1d36'; ctx.beginPath(); ctx.arc(cx, gy, R, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = hexA(acc, 0.7); ctx.lineWidth = 1.4 * u; ctx.beginPath(); ctx.arc(cx, gy, R, 0, Math.PI * 2); ctx.stroke();
    if (G && ll) { const q = G.proj(ll); if (q[2]) { const px = cx - G.S / 2 + q[0], py = gy - G.S / 2 + q[1]; const pulse = (o.time * 0.9) % 1; ctx.strokeStyle = hexA(acc, 1 - pulse); ctx.lineWidth = 1.5 * u; ctx.beginPath(); ctx.arc(px, py, (5 + pulse * 16) * u, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(px, py, 4 * u, 0, Math.PI * 2); ctx.fill(); } }
    ctx.restore();
    // title (fades in, then out near the end of the layer's hold, if any)
    ctx.save(); ctx.globalAlpha *= stage(1); at('introTitle', [fr.x + fr.w * 0.1, fr.y + fr.h * 0.18, fr.w * 0.8, fr.h * 0.24]);
    const [t1, sz] = fitFont(ctx, title.toUpperCase(), fr.w * 0.8, 46 * u, 800, DISP);
    try { ctx.letterSpacing = `${sz * 0.04}px`; } catch { /* */ }
    ctx.fillStyle = '#e8f4ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.shadowColor = hexA(acc, 0.5); ctx.shadowBlur = 18 * u * ((BR_THEMES[s.theme] || BR_THEMES.navy).glow || 1);
    ctx.fillText(t1, cx, fr.y + fr.h * 0.2 + sz);
    try { ctx.letterSpacing = '0px'; } catch { /* */ }
    ctx.shadowBlur = 0;
    if (sub) caps(ctx, sub, cx, fr.y + fr.h * 0.2 + sz + 30 * u, 12 * u, acc, 700, 0.22, 'center');
    const meta = [s.date, [s.place, s.country].filter(Boolean).join(', '), s.coords].filter(Boolean).join('   ·   ');
    if (meta) { ctx.font = `500 ${11 * u}px ${MONO}`; ctx.fillStyle = 'rgba(220,235,255,0.75)'; ctx.textAlign = 'center'; ctx.fillText(meta, cx, fr.y + fr.h * 0.2 + sz + 56 * u); }
    ctx.strokeStyle = acc; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(cx - 22 * u, fr.y + fr.h * 0.2 + sz + 70 * u); ctx.lineTo(cx + 22 * u, fr.y + fr.h * 0.2 + sz + 70 * u); ctx.stroke();
    ctx.restore();
    ctx.restore();
    return;
  }
  if (Bx.photos) {
    // ---- photo slideshow: big photo, thumbnail strip, map inset and caption panel
    const slides = (s.slides || []).filter((x) => x?.media);
    const per = Math.max(0.5, +s.slideSec || 3), T = Math.max(0, (o.time || 0) - (+L.start || 0) - 0.4);
    const n = slides.length, idx = n ? Math.min(n - 1, Math.floor(T / per)) : 0, ph = n ? clamp((T - idx * per) / per, 0, 1) : 0;
    const sb = sizeBox('slide', P(Bx.slide));
    // title over the photo
    ctx.save(); ctx.globalAlpha *= stage(0); at('slide', sb, true);
    ctx.save(); rr(ctx, sb[0], sb[1], sb[2], sb[3], 6 * u); ctx.fillStyle = '#060e1a'; ctx.fill(); ctx.clip();
    const drawSlide = (sl, a, local) => {
      const e = imageFor(sl.media);
      if (!e?.ready) { e?.p?.then(() => lastMapRepaint()); return; }
      ctx.save(); ctx.globalAlpha *= a;
      const fx = s.slideFx === 'fade' || s.slideFx === 'slide' ? s.slideFx : 'kenburns';
      const z = fx === 'kenburns' ? 1.02 + local * 0.09 : 1;
      const k0 = Math.max(sb[2] / e.w, sb[3] / e.h) * z, dw = e.w * k0, dh = e.h * k0;
      let ox = sb[0] + (sb[2] - dw) / 2, oy = sb[1] + (sb[3] - dh) / 2;
      if (fx === 'kenburns') { ox += (local - 0.5) * (dw - sb[2]) * 0.6 * (idxOf(sl) % 2 ? 1 : -1); }
      if (fx === 'slide') ox += (1 - a) * sb[2] * 0.25;
      ctx.drawImage(e.bmp, ox, oy, dw, dh);
      ctx.restore();
    };
    const idxOf = (sl) => slides.indexOf(sl);
    if (n) {
      const fade = clamp(ph * per / 0.6, 0, 1);
      if ((s.slideFx || 'scan') === 'scan' && idx > 0 && fade < 1) {
        // the next photo wipes in from the top behind a scan line
        drawSlide(slides[idx - 1], 1, 1);
        const e = easeOut(fade), ly = sb[1] + sb[3] * e;
        ctx.save(); ctx.beginPath(); ctx.rect(sb[0], sb[1], sb[2], sb[3] * e); ctx.clip(); drawSlide(slides[idx], 1, ph); ctx.restore();
        const band = ctx.createLinearGradient(0, ly - 50 * u, 0, ly); band.addColorStop(0, hexA(acc, 0)); band.addColorStop(1, hexA(acc, 0.3));
        ctx.fillStyle = band; ctx.fillRect(sb[0], ly - 50 * u, sb[2], 50 * u);
        ctx.save(); ctx.shadowColor = acc; ctx.shadowBlur = 12 * u; ctx.fillStyle = '#d8f4ff'; ctx.fillRect(sb[0], ly - 1 * u, sb[2], 2 * u); ctx.restore();
      } else {
        if (idx > 0 && fade < 1) drawSlide(slides[idx - 1], 1, 1);
        drawSlide(slides[idx], idx > 0 ? fade : 1, ph);
      }
      const g = ctx.createLinearGradient(0, sb[1] + sb[3] * 0.6, 0, sb[1] + sb[3]); g.addColorStop(0, 'rgba(3,9,18,0)'); g.addColorStop(1, 'rgba(3,9,18,0.85)');
      ctx.fillStyle = g; ctx.fillRect(sb[0], sb[1] + sb[3] * 0.6, sb[2], sb[3] * 0.4);
      const cap = slides[idx].caption || '';
      if (cap) { const [ct] = fitFont(ctx, cap, sb[2] - 40 * u, 18 * u, 700, SANS); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(ct, sb[0] + 20 * u, sb[1] + sb[3] - 22 * u); }
      if (slides[idx].credit) { ctx.font = `500 ${9.5 * u}px ${MONO}`; ctx.fillStyle = 'rgba(220,235,255,0.75)'; ctx.textAlign = 'right'; ctx.fillText(slides[idx].credit, sb[0] + sb[2] - 14 * u, sb[1] + 20 * u); }
      // progress bar
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(sb[0], sb[1] + sb[3] - 3 * u, sb[2], 3 * u);
      ctx.fillStyle = acc; ctx.fillRect(sb[0], sb[1] + sb[3] - 3 * u, sb[2] * ((idx + ph) / n), 3 * u);
    } else { caps(ctx, 'Add photos in the frame settings', sb[0] + sb[2] / 2, sb[1] + sb[3] / 2, 13 * u, 'rgba(255,255,255,0.45)', 700, 0.15, 'center'); }
    ctx.restore();
    ctx.strokeStyle = hexA(acc, 0.5); ctx.lineWidth = 1.2 * u; rr(ctx, sb[0], sb[1], sb[2], sb[3], 6 * u); ctx.stroke();
    brackets(ctx, sb[0] - 3 * u, sb[1] - 3 * u, sb[2] + 6 * u, sb[3] + 6 * u, u, acc, 18);
    // counter chip
    const cnt = `PHOTO ${String(Math.min(n, idx + 1)).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
    ctx.font = `800 ${10.5 * u}px ${SANS}`; const cw = ctx.measureText(cnt).width + cnt.length * 1.05 * u + 20 * u;
    ctx.fillStyle = 'rgba(4,10,18,0.85)'; rr(ctx, sb[0] + 14 * u, sb[1] + 14 * u, cw, 22 * u, 3 * u); ctx.fill(); ctx.strokeStyle = hexA(acc, 0.6); ctx.lineWidth = 1 * u; ctx.stroke();
    caps(ctx, cnt, sb[0] + 24 * u, sb[1] + 29 * u, 10.5 * u, '#fff', 800, 0.1);
    ctx.restore();
    // thumbnail strip
    const st = sizeBox('strip', P(Bx.strip));
    ctx.save(); ctx.globalAlpha *= stage(2); at('strip', st, true);
    const m = Math.max(1, Math.min(8, n || 1)), gap = 8 * u, tw = (st[2] - gap * (m - 1)) / m, th = st[3] - 6 * u;
    const first = n > 8 ? clamp(idx - 3, 0, n - 8) : 0;
    for (let i = 0; i < m; i++) {
      const j = first + i, x = st[0] + i * (tw + gap), y = st[1] + 6 * u;
      ctx.save(); rr(ctx, x, y, tw, th, 4 * u); ctx.fillStyle = '#0b1522'; ctx.fill(); ctx.clip();
      const e = slides[j] && imageFor(slides[j].media);
      if (e?.ready) { const k0 = Math.max(tw / e.w, th / e.h); ctx.globalAlpha *= j === idx ? 1 : 0.55; ctx.drawImage(e.bmp, x + (tw - e.w * k0) / 2, y + (th - e.h * k0) / 2, e.w * k0, e.h * k0); }
      ctx.restore();
      ctx.strokeStyle = j === idx && n ? acc : hexA(acc, 0.25); ctx.lineWidth = (j === idx ? 2 : 1) * u; rr(ctx, x, y, tw, th, 4 * u); ctx.stroke();
    }
    ctx.restore();
    // map inset
    ctx.save(); ctx.globalAlpha *= stage(1);
    if (partOn(s, 'frame')) caps(ctx, s.locatorTitle && s.locatorTitle !== 'Location' ? s.locatorTitle : 'Location', win[0] + win[2] - 10 * u, win[1] + 18 * u, 9 * u, acc, 700, 0.2, 'right');
    if (s.windowTag !== false) placeTag(ctx, L, o, win[0] + 10 * u, win[1] + win[3] - 56 * u, u, acc);
    ctx.restore();
    // caption panel
    const cb = sizeBox('caption', P(Bx.cap));
    ctx.save(); ctx.globalAlpha *= stage(3); at('caption', cb, true);
    panel(ctx, cb[0], cb[1], cb[2], cb[3], u, acc);
    caps(ctx, s.slideTitle || 'Photos from the site', cb[0] + 14 * u, cb[1] + 22 * u, 10 * u, acc, 700, 0.18);
    ctx.font = `900 ${20 * u}px ${DISP}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    const tl = wrap(ctx, title.toUpperCase(), cb[2] - 28 * u, 2); tl.forEach((l, i) => ctx.fillText(l, cb[0] + 14 * u, cb[1] + 50 * u + i * 23 * u));
    let yy = cb[1] + 50 * u + tl.length * 23 * u + 6 * u;
    if (sub) { ctx.font = `500 ${11.5 * u}px ${SANS}`; ctx.fillStyle = 'rgba(225,238,255,0.8)'; wrap(ctx, sub, cb[2] - 28 * u, 2).forEach((l) => { ctx.fillText(l, cb[0] + 14 * u, yy + 4 * u); yy += 15 * u; }); }
    yy += 10 * u;
    for (const [ic, lab, val] of fields.slice(0, 4)) {
      if (yy > cb[1] + cb[3] - 26 * u) break;
      ctx.strokeStyle = hexA(acc, 0.18); ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.moveTo(cb[0] + 12 * u, yy); ctx.lineTo(cb[0] + cb[2] - 12 * u, yy); ctx.stroke();
      icon(ctx, ic, cb[0] + 24 * u, yy + 18 * u, 15 * u, acc);
      caps(ctx, lab, cb[0] + 42 * u, yy + 14 * u, 8 * u, acc, 700, 0.15);
      const [vt] = fitFont(ctx, String(val).toUpperCase(), cb[2] - 56 * u, 11.5 * u, 700, SANS);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(vt, cb[0] + 42 * u, yy + 28 * u);
      yy += 36 * u;
    }
    ctx.restore();
    ctx.restore();
    return;
  }
  if (Bx.full) {
    // ---- full view: the map fills the frame; title block, mini globe and before / after sit over it
    const [wx, wy, ww, wh] = win;
    ctx.save(); rr(ctx, wx, wy, ww, wh, 6 * u); ctx.clip(); if (!partOn(s, 'titleBlock')) ctx.globalAlpha = 0;
    const fade = ctx.createLinearGradient(0, wy + wh * 0.45, 0, wy + wh);
    fade.addColorStop(0, 'rgba(3,9,18,0)'); fade.addColorStop(1, 'rgba(3,9,18,0.88)');
    ctx.fillStyle = fade; ctx.fillRect(wx, wy + wh * 0.45, ww, wh * 0.55);
    ctx.restore();
    // title block
    const tb = P(Bx.titleBlock);
    ctx.save(); ctx.globalAlpha *= stage(1); at('titleBlock', tb);
    ctx.fillStyle = acc; ctx.fillRect(tb[0], tb[1] + 6 * u, 3 * u, tb[3] - 14 * u);
    const tx = tb[0] + 18 * u;
    if (s.event || s.tag) caps(ctx, s.event || s.tag, tx, tb[1] + 20 * u, 11 * u, acc, 700, 0.18);
    const [t1, sz] = fitFont(ctx, title.toUpperCase(), tb[2] - 20 * u, 38 * u, 800, DISP);
    try { ctx.letterSpacing = `${sz * 0.03}px`; } catch { /* */ }
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(t1, tx, tb[1] + 22 * u + sz);
    try { ctx.letterSpacing = '0px'; } catch { /* */ }
    if (sub) { ctx.font = `500 ${14 * u}px ${SANS}`; ctx.fillStyle = 'rgba(225,238,255,0.85)'; ctx.fillText(sub, tx, tb[1] + 22 * u + sz + 26 * u); }
    let mx = tx; const my = tb[1] + 22 * u + sz + 62 * u;
    for (const [ic, , val] of fields.filter((f) => f[3] !== 'event')) {
      icon(ctx, ic, mx + 7 * u, my - 4 * u, 13 * u, acc);
      ctx.font = `700 ${11.5 * u}px ${SANS}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
      const t = String(val).toUpperCase(); ctx.fillText(t, mx + 20 * u, my);
      mx += 20 * u + ctx.measureText(t).width + 26 * u;
    }
    ctx.restore();
    // mini globe
    if (s.globe !== false && ll) {
      const gx = fr.x + Bx.mini[0] * fr.w, gy = Bx.mini[1] * fr.h + fr.y, R = Bx.mini[2] * fr.w;
      ctx.save(); ctx.globalAlpha *= stage(0); at('globe', [gx - R, gy - R, 2 * R, 2 * R + 26 * u]);
      const c = countryAt(ll) || (s.country ? (countriesByName(s.country) || [])[0] : null);
      ctx.fillStyle = 'rgba(3,9,18,0.65)'; ctx.beginPath(); ctx.arc(gx, gy, R * 1.12, 0, Math.PI * 2); ctx.fill();
      const G = globeImage(ll[0], clamp(ll[1] * 0.8, -60, 60), R, c?.name || '', acc);
      if (G) { ctx.drawImage(G.cv, gx - G.S / 2, gy - G.S / 2); const q = G.proj(ll); if (q[2]) { const px = gx - G.S / 2 + q[0], py = gy - G.S / 2 + q[1]; ctx.fillStyle = '#ffd25a'; ctx.beginPath(); ctx.arc(px, py, 3.5 * u, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(255,210,90,0.6)'; ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.arc(px, py, 8 * u, 0, Math.PI * 2); ctx.stroke(); } }
      ctx.strokeStyle = hexA(acc, 0.8); ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.arc(gx, gy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = hexA(acc, 0.35); ctx.beginPath(); ctx.arc(gx, gy, R * 1.12, 0, Math.PI * 2); ctx.stroke();
      const name = String(s.country || c?.name || '').toUpperCase();
      if (name) { ctx.font = `800 ${10.5 * u}px ${SANS}`; const tw = ctx.measureText(name).width + 18 * u; const lx = gx + R * 0.6 - tw / 2, ly = gy + R * 1.12 + 6 * u; ctx.fillStyle = 'rgba(4,10,18,0.9)'; rr(ctx, lx, ly, tw, 19 * u, 3 * u); ctx.fill(); ctx.strokeStyle = acc; ctx.lineWidth = 1 * u; ctx.stroke(); caps(ctx, name, lx + 9 * u, ly + 13.5 * u, 10.5 * u, '#fff', 800, 0.1); }
      ctx.restore();
    }
    // before / after (compact)
    if (Bx.thumbs) {
      const [b0, b1] = Bx.thumbs.map(P);
      ctx.save(); ctx.globalAlpha *= stage(3); at('side', [b0[0], b0[1] - 22 * u, b1[0] + b1[2] - b0[0], b0[3] + 22 * u]);
      caps(ctx, `▣  ${s.sideTitle || 'Site analysis (before / after)'}`, b0[0], b0[1] - 8 * u, 9.5 * u, 'rgba(225,238,255,0.9)', 700, 0.12);
      thumb(ctx, BA[0], ll, ...b0, u, acc, BAL[0], o, s.thumbZoom);
      thumb(ctx, BA[1], ll, ...b1, u, acc, BAL[1], o, s.thumbZoom);
      ctx.restore();
    }
    ctx.save(); ctx.globalAlpha *= stage(1);
    if (s.windowTag !== false) placeTag(ctx, L, o, wx + 18 * u, wy + 18 * u, u, acc);
    ctx.restore();
    ctx.restore();
    return;
  }
  if (Bx.end) {
    // ---- closing card
    ctx.globalAlpha *= stage(0);
    const cx = fr.x + fr.w / 2;
    ctx.save(); at('endTitle', [fr.x + fr.w * 0.08, fr.y + fr.h * 0.28, fr.w * 0.84, fr.h * 0.32]);
    caps(ctx, s.kicker || 'Briefing', cx, fr.y + fr.h * 0.33, 12 * u, acc, 700, 0.3, 'center');
    const [t1, sz] = fitFont(ctx, title.toUpperCase(), fr.w * 0.84, 56 * u, 900, DISP);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(t1, cx, fr.y + fr.h * 0.33 + sz * 1.2);
    if (sub) { ctx.font = `500 ${17 * u}px ${SANS}`; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillText(sub, cx, fr.y + fr.h * 0.33 + sz * 1.2 + 34 * u); }
    ctx.strokeStyle = acc; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(cx - 40 * u, fr.y + fr.h * 0.58); ctx.lineTo(cx + 40 * u, fr.y + fr.h * 0.58); ctx.stroke();
    ctx.restore();
    if (fields.length) {
      const sw = Math.min(fr.w * 0.86, fields.length * 220 * u), sx = cx - sw / 2, cw = sw / fields.length, sy = fr.y + fr.h * 0.64;
      ctx.save(); at('endFields', [sx, sy, sw, 40 * u]);
      fields.forEach(([ic, lab, val], i) => {
        const fx = sx + i * cw;
        icon(ctx, ic, fx + 16 * u, sy + 18 * u, 20 * u, acc);
        caps(ctx, lab, fx + 36 * u, sy + 12 * u, 9 * u, acc, 700, 0.15);
        const [vt] = fitFont(ctx, String(val).toUpperCase(), cw - 46 * u, 13 * u, 700, SANS);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(vt, fx + 36 * u, sy + 30 * u);
      });
      ctx.restore();
    }
    if (s.sources) { ctx.save(); at('endSources', [fr.x + fr.w * 0.1, fr.y + fr.h * 0.86 - 12 * u, fr.w * 0.8, 32 * u]); ctx.font = `500 ${10.5 * u}px ${SANS}`; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.textAlign = 'center'; wrap(ctx, s.sources, fr.w * 0.8, 2).forEach((l, i) => ctx.fillText(l, cx, fr.y + fr.h * 0.86 + i * 15 * u)); ctx.restore(); }
    ctx.restore();
    return;
  }

  if (Bx.portrait || s.layout === 'B') {
    // ---- header title
    const hb = P(Bx.header || Bx.title);
    ctx.save(); ctx.globalAlpha *= stage(0); at('heading', hb);
    const [t1, sz] = fitFont(ctx, title.toUpperCase(), hb[2] * (Bx.portrait || s.header ? 1 : 0.62), (Bx.portrait ? 30 : 34) * u, 900, DISP, 0.45);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(t1, hb[0], hb[1] + sz * 1.0);
    if (sub) { ctx.font = `500 ${14 * u}px ${SANS}`; ctx.fillStyle = hexA(acc, 0.95); ctx.fillText(sub, hb[0], hb[1] + sz * 1.0 + 22 * u); }
    if (!Bx.portrait && s.kicker && !s.header) {
      caps(ctx, s.kicker, hb[0] + hb[2], hb[1] + 22 * u, 10.5 * u, acc, 700, 0.25, 'right');
      ctx.font = `500 ${10 * u}px ${MONO}`; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.textAlign = 'right';
      ctx.fillText(s.coords || '', hb[0] + hb[2], hb[1] + 40 * u);
    }
    ctx.restore();
    // ---- locator
    if (Bx.locator) {
      const lb = sizeBox('locator', P(Bx.locator));
      ctx.save(); ctx.globalAlpha *= stage(1); at('locator', lb, true);
      panel(ctx, lb[0], lb[1], lb[2], lb[3], u, acc);
      caps(ctx, s.locatorTitle || 'Location', lb[0] + 12 * u, lb[1] + 20 * u, 10 * u, acc, 700, 0.2);
      locator(ctx, ll, s.country, lb[0] + 8 * u, lb[1] + 28 * u, lb[2] - 16 * u, lb[3] - 36 * u, u, acc, s.place);
      ctx.restore();
    }
    // ---- side: before / after (or photos)
    const thumbs = Bx.side ? (() => { const sb = sizeBox('side', P(Bx.side)); return { box: sb, items: [[sb[0] + 8 * u, sb[1] + 30 * u, sb[2] - 16 * u, (sb[3] - 46 * u) / 2], [sb[0] + 8 * u, sb[1] + 38 * u + (sb[3] - 46 * u) / 2, sb[2] - 16 * u, (sb[3] - 46 * u) / 2]] }; })() : Bx.thumbs ? { items: Bx.thumbs.map(P) } : null;
    if (thumbs) {
      ctx.save(); ctx.globalAlpha *= stage(2);
      const photos = s.photos?.length && !BA[0] && !BA[1] ? s.photos : null;
      if (thumbs.box) { at('side', thumbs.box, true); panel(ctx, ...thumbs.box, u, acc); caps(ctx, photos ? 'Site imagery' : s.sideTitle || 'Site analysis (before / after)', thumbs.box[0] + 12 * u, thumbs.box[1] + 20 * u, 10 * u, acc, 700, 0.15); }
      const specs = photos ? photos.slice(0, 2).map((m) => ({ media: m.id || m, date: '' })) : BA;
      const labs = photos ? photos.slice(0, 2).map((m) => m.name || 'Photo') : BAL;
      thumbs.items.forEach((b, i) => {
        if (!specs[i] && photos) return;
        ctx.save(); if (!thumbs.box) at(i ? 'after' : 'before', b);
        thumb(ctx, specs[i], ll, b[0], b[1], b[2], b[3], u, acc, labs[i], o, s.thumbZoom);
        ctx.restore();
      });
      ctx.restore();
    }
    // ---- field strip
    if (Bx.strip) {
      const sb = sizeBox('strip', P(Bx.strip));
      ctx.save(); ctx.globalAlpha *= stage(3); at('strip', sb, true);
      panel(ctx, sb[0], sb[1], sb[2], sb[3], u, acc);
      const n = Math.max(1, fields.length), per = Bx.portrait ? 2 : n, rows = Math.ceil(n / per);
      const cw = sb[2] / per, ch = sb[3] / rows;
      fields.forEach(([ic, lab, val], i) => {
        const fx = sb[0] + (i % per) * cw, fy = sb[1] + Math.floor(i / per) * ch;
        if (i % per) { ctx.strokeStyle = hexA(acc, 0.2); ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.moveTo(fx, fy + ch * 0.2); ctx.lineTo(fx, fy + ch * 0.8); ctx.stroke(); }
        icon(ctx, ic, fx + 26 * u, fy + ch / 2, 22 * u, acc);
        caps(ctx, lab, fx + 50 * u, fy + ch / 2 - 5 * u, 9 * u, acc, 700, 0.15);
        const [vt] = fitFont(ctx, String(val).toUpperCase(), cw - 62 * u, 14 * u, 800, SANS);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(vt, fx + 50 * u, fy + ch / 2 + 13 * u);
      });
      ctx.restore();
    }
    if (win) {
      ctx.save(); ctx.globalAlpha *= stage(1);
      ctx.save(); ctx.globalAlpha *= easeOut(reveal('tag'));
      if (s.windowTag !== false) placeTag(ctx, L, o, win[0] + 16 * u, win[1] + 16 * u, u, acc);
      ctx.globalAlpha *= easeOut(reveal('north'));
      if (s.north !== false) northArrow(ctx, o, win[0] + win[2] - 34 * u, win[1] + 34 * u, u, acc, L);
      ctx.restore();
      if (s.scale !== false && reveal('scale') > 0.6) scaleBar(ctx, o, ll, win[0] + 22 * u, win[1] + win[3] - 20 * u, u, acc, L);
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  // ---- layout A: globe, title, info rows on the left; before / after under the map
  if (s.globe !== false && Bx.globe && ll) {
    ctx.save(); ctx.globalAlpha *= stage(0);
    const gx = fr.x + Bx.globe[0] * fr.w, gy = fr.y + Bx.globe[1] * fr.h, R = Bx.globe[2] * fr.w;
    at('globe', [gx - R, gy - R, 2 * R, 2 * R]);
    const spin = build ? (1 - kk) * 50 : 0;
    const c = countryAt(ll) || (s.country ? (countriesByName(s.country) || [])[0] : null);
    const G = globeImage(ll[0] + spin, clamp(ll[1] * 0.8, -60, 60), R, c?.name || '', acc);
    // atmosphere glow
    const glow = ctx.createRadialGradient(gx, gy, R * 0.95, gx, gy, R * 1.25);
    glow.addColorStop(0, hexA(acc, 0.35)); glow.addColorStop(1, hexA(acc, 0)); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(gx, gy, R * 1.25, 0, Math.PI * 2); ctx.fill();
    if (G) {
      ctx.drawImage(G.cv, gx - G.S / 2, gy - G.S / 2);
      const q = G.proj(ll);
      if (q[2]) {
        const px = gx - G.S / 2 + q[0], py = gy - G.S / 2 + q[1];
        const pulse = (o.time * 1.2) % 1;
        ctx.strokeStyle = hexA('#ff3b30', 1 - pulse); ctx.lineWidth = 1.5 * u; ctx.beginPath(); ctx.arc(px, py, (4 + pulse * 12) * u, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(px, py, 3.5 * u, 0, Math.PI * 2); ctx.fill();
        const name = String(s.country || c?.name || '').toUpperCase();
        if (name) {
          ctx.font = `800 ${11 * u}px ${SANS}`;
          const tw = ctx.measureText(name).width + 16 * u;
          const lx = gx - R - 6 * u, ly = py - 9 * u;
          ctx.strokeStyle = acc; ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(lx + tw, ly + 9 * u); ctx.stroke();
          ctx.fillStyle = 'rgba(4,10,18,0.88)'; rr(ctx, lx, ly, tw, 18 * u, 3 * u); ctx.fill(); ctx.strokeStyle = acc; ctx.stroke();
          caps(ctx, name, lx + 8 * u, ly + 13 * u, 11 * u, '#fff', 800, 0.06);
        }
      }
    } else { ctx.fillStyle = '#0b2240'; ctx.beginPath(); ctx.arc(gx, gy, R, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = hexA(acc, 0.6); ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.arc(gx, gy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  {
    // title
    ctx.save(); ctx.globalAlpha *= stage(1);
    const tx = fr.x + Bx.title[0] * fr.w, ty = fr.y + Bx.title[1] * fr.h, tw = Bx.left[2] * fr.w;
    at('title', [tx, ty, tw, fr.h * 0.15]);
    let sz = 28 * u, lines;
    for (;;) { ctx.font = `900 ${sz}px ${DISP}`; lines = wrap(ctx, title.toUpperCase(), tw, 3); if ((lines.length <= 2 && !lines.at(-1).endsWith('…')) || sz < 19 * u) break; sz *= 0.9; }
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    lines.forEach((l, i) => ctx.fillText(l, tx, ty + sz + i * sz * 1.05));
    const by = ty + sz + (lines.length - 1) * sz * 1.05;
    if (sub) { let ss = 12 * u; ctx.font = `700 ${ss}px ${SANS}`; while (ss > 8 * u && ctx.measureText(sub.toUpperCase()).width * 1.2 > tw) { ss *= 0.93; ctx.font = `700 ${ss}px ${SANS}`; } caps(ctx, sub, tx, by + 22 * u, ss, acc, 700, 0.15); }
    ctx.restore();
    // info rows
    const ib = sizeBox('info', P(Bx.info));
    ctx.save(); ctx.globalAlpha *= stage(2);
    const rows = fields.filter((f) => f[3] !== 'assess').slice(0, 3);
    const rh = ib[3] / 3;
    at('info', [ib[0], ib[1], ib[2], rh * Math.max(1, rows.length)], true);
    if (rows.length) panel(ctx, ib[0], ib[1], ib[2], rh * rows.length, u, acc);
    rows.forEach(([ic, , val], i) => {
      const ry = ib[1] + i * rh;
      if (i) { ctx.strokeStyle = hexA(acc, 0.18); ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.moveTo(ib[0] + 12 * u, ry); ctx.lineTo(ib[0] + ib[2] - 12 * u, ry); ctx.stroke(); }
      icon(ctx, ic, ib[0] + 26 * u, ry + rh / 2, 20 * u, acc);
      const [vt] = fitFont(ctx, String(val).toUpperCase(), ib[2] - 62 * u, 13.5 * u, 700, SANS);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(vt, ib[0] + 50 * u, ry + rh / 2 + 1 * u);
      ctx.textBaseline = 'alphabetic';
    });
    ctx.restore();
  }
  if (Bx.thumbs) {
    ctx.save(); ctx.globalAlpha *= stage(3);
    const b0 = sizeBox('before', P(Bx.thumbs[0])), b1 = sizeBox('after', P(Bx.thumbs[1]));
    const photos = s.photos?.length && !BA[0] && !BA[1] ? s.photos : null;
    const specs = photos ? photos.slice(0, 2).map((m) => ({ media: m.id || m })) : BA;
    const labs = photos ? photos.slice(0, 2).map((m) => m.name || 'Photo') : BAL;
    ctx.save(); at('before', b0, true); thumb(ctx, specs[0], ll, ...b0, u, acc, labs[0], o, s.thumbZoom); ctx.restore();
    if (specs[1] || !photos) {
      ctx.save(); at('after', b1, true);
      thumb(ctx, specs[1], ll, ...b1, u, acc, labs[1], o, s.thumbZoom);
      if (!photos && !s.pos_before && !s.pos_after) {
        // arrow between
        const ax = (b0[0] + b0[2] + b1[0]) / 2, ay = b0[1] + b0[3] / 2;
        ctx.strokeStyle = acc; ctx.lineWidth = 2.2 * u; ctx.lineJoin = 'miter';
        for (const d of [-5, 3]) { ctx.beginPath(); ctx.moveTo(ax + (d - 4) * u, ay - 8 * u); ctx.lineTo(ax + (d + 4) * u, ay); ctx.lineTo(ax + (d - 4) * u, ay + 8 * u); ctx.stroke(); }
      }
      ctx.restore();
    }
    ctx.restore();
  }
  if (win && s.windowTag !== false) { ctx.save(); ctx.globalAlpha *= stage(1); windowTag(ctx, L, o, win[0], win[1], win[2], win[3], u, acc, 'right'); ctx.restore(); }
  ctx.restore();
}

// ================================================================= turning a built story into the briefing look
const REF_W = 1000;
const mercPx = ([lng, lat], z) => { const W = 512 * 2 ** z; const s = Math.sin(clamp(lat, -85.05, 85.05) * D2R); return [((lng + 180) / 360) * W, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * W]; };
const unMerc = ([x, y], z) => { const W = 512 * 2 ** z; const lng = (x / W) * 360 - 180; const n = Math.PI - (2 * Math.PI * y) / W; return [lng, (180 / Math.PI) * Math.atan(Math.sinh(n))]; };
/** Moves a camera view so what was in the frame centre sits in the centre of the window (and fits it). */
export function viewIntoWindow(view, win, aspect) {
  const vh = REF_W / aspect;
  const cx = (win[0] + win[2] / 2 - 0.5) * REF_W, cy = (win[1] + win[3] / 2 - 0.5) * vh;
  const dz = Math.log2(Math.max(0.2, Math.min(win[2], win[3])));
  const z = Math.max(0, view.zoomRef + dz);
  const b = (view.bearing || 0) * D2R, tilt = Math.cos(clamp(view.pitch || 0, 0, 70) * D2R);
  const wx = cx * Math.cos(b) - (cy / tilt) * Math.sin(b), wy = cx * Math.sin(b) + (cy / tilt) * Math.cos(b);
  const p = mercPx(view.center, z);
  const c = unMerc([p[0] - wx, p[1] - wy], z);
  return { ...view, center: [r6(c[0]), r6(c[1])], zoomRef: +z.toFixed(3) };
}

const ICON_FOR = { traincrash: 'train', carcrash: 'car', shipcrash: 'ship', planecrash: 'plane', flood: 'flood', flashflood: 'flood', cyclone: 'storm', storm: 'storm', quake: 'quake', earthquake: 'quake', fire: 'fire', wildfire: 'fire', deforestation: 'forest', migration: 'migration' };
export const iconFor = (ev) => ICON_FOR[ev] || 'alert';
const DROP = new Set(['title', 'news', 'ttitle', 'mapcredits']);

/**
 * info: { ll, title, sub, kicker, tag, date, place, country, event, eventKey, assessment, coords, sources, accent, before, after, photos, thumbZoom }
 * Scene names decide the layout: Opening / Event / Before-after / Pre & post satellite → A, Map / Damage & analysis / Photos → B, End → end.
 */
/** One whole briefing frame (not yet split) filled from the info block. */
export const briefFrame = (info, layout, extra = {}) => ({
    id: `brief_${Math.random().toString(36).slice(2, 9)}`, kind: 'briefing', name: 'Briefing frame', visible: true, start: 0, duration: 1.2, hold: 0, anim: 'build',
    geom: info.ll ? { type: 'Point', coordinates: [r6(info.ll[0]), r6(info.ll[1])] } : null,
    style: { ...JSON.parse(JSON.stringify(BR_DEFAULTS.briefing.style)), layout, title: info.title || '', sub: info.sub || 'Geospatial analysis', kicker: info.kicker || 'Geospatial intelligence briefing', tag: info.tag || info.event || '', date: info.date || '', place: info.place || '', country: info.country || '', event: info.event || '', eventIcon: iconFor(info.eventKey), assessment: info.assessment || '', coords: info.coords || '', sources: info.sources || '', accent: info.accent || '#35c8ff', before: info.before || null, after: info.after || null, photos: [], thumbZoom: info.thumbZoom || 15, ...(info.geobrief ? { header: true, tickerOn: false, ticker: info.ticker || '' } : {}), ...extra },
});
export function applyBriefing(story, info, aspect = 16 / 9) {
  const mk = (layout, extra = {}) => briefFrame(info, layout, extra);
  // before / after pictures the user gave (Auto video) show on every A-layout scene
  if (!info.before) for (const sc of story.scenes) { const c = sc.layers.find((l) => l.kind === 'compare'); if (c) { info.before = { media: c.style.media, date: c.style.labelA && c.style.labelA !== 'BEFORE' ? c.style.labelA : '' }; info.after = { media: c.style.media2, date: c.style.labelB && c.style.labelB !== 'AFTER' ? c.style.labelB : '' }; } }
  for (const sc of story.scenes) {
    const n = sc.name || '';
    let layout = /^end$/i.test(n) ? 'end' : /map|damage|analysis|photo|region|drive|selected/i.test(n) ? 'B' : 'A';
    if (info.geobrief && /^event$/i.test(n)) layout = 'full';
    const extra = {};
    if (/photo/i.test(n)) {
      const media = sc.layers.filter((l) => l.kind === 'photocard' && l.style?.media).map((l) => ({ id: l.style.media, name: l.style.title }));
      if (media.length) {
        layout = 'photos';
        extra.slides = media.map((m) => ({ media: m.id, caption: m.name || '', credit: '' }));
        sc.layers = sc.layers.filter((l) => l.kind !== 'photocard');
        sc.stillEnd = Math.max(+sc.stillEnd || 0, media.length * 3 + 1);
      }
    }
    if (/before|pre & post|satellite/i.test(n)) {
      // the map window shows the imagery itself; the panels show both dates
      for (const l of sc.layers) if (l.kind === 'timeseries') l.style.label = 'none';
    }
    sc.layers = sc.layers.filter((l) => !DROP.has(l.kind));
    for (const l of sc.layers) if (l.kind === 'compare' || l.kind === 'timeseries') l.underFrame = true; // generated imagery stays inside the map window
    if (sc.layers.some((l) => l.kind === 'tcallout' || l.kind === 'linecallout')) extra.windowTag = false;
    else for (const l of sc.layers) if (l.kind === 'point' && l.style?.label) l.style.label = ''; // the window tag names the place
    const lay = mk(layout, extra);
    const S = lay.style;
    const boxes = layoutBoxes(layout, aspect, !!(S.before || S.after || S.beforeMedia || S.afterMedia || S.photos?.length), { header: S.header, ticker: S.tickerOn });
    if (boxes.win && sc.camera?.keys?.length) sc.camera.keys = sc.camera.keys.map((key) => ({ ...key, view: viewIntoWindow(key.view, boxes.win, aspect) }));
    if (layout === 'end') { sc.look.grade = { preset: 'custom', brightness: 0.35, contrast: 1.1, saturation: 0.3, warmth: -0.3, fade: 0 }; }
    sc.layers.unshift(...splitBriefing(lay));
    sc.transition = 'scanwipe'; sc.transitionSeconds = 0.9;
  }
  story.brand = { ...(story.brand || {}), lower: false };
  if (info.geobrief) {
    // GEO·BRIEF: the header bar replaces the logo strip; an intro title card comes first
    const first = story.scenes[0];
    const sc = newScene('Intro', first?.look);
    sc.camera = JSON.parse(JSON.stringify(first?.camera || sc.camera));
    if (sc.camera.mode === 'keyframes' && sc.camera.keys?.length) sc.camera.keys = [{ ...sc.camera.keys[0], t: 0 }, { ...sc.camera.keys[0], t: 5 }];
    sc.stillStart = 0; sc.stillEnd = 0.5;
    sc.layers = splitBriefing(mk('intro'));
    sc.transition = 'scanwipe'; sc.transitionSeconds = 0.9;
    story.scenes.unshift(sc);
  }
  return story;
}

/** A briefing frame layer for a new project / scene. */
export function newBriefingLayer(layout = 'A', style = {}, ll = null) {
  return {
    id: `brief_${Math.random().toString(36).slice(2, 9)}`, kind: 'briefing', name: `Briefing frame (${layout === 'B' ? 'header + locator' : layout === 'end' ? 'end card' : 'globe + before / after'})`, visible: true, start: 0, duration: 1.2, hold: 0, anim: 'build',
    geom: ll ? { type: 'Point', coordinates: [r6(ll[0]), r6(ll[1])] } : null,
    style: { ...JSON.parse(JSON.stringify(BR_DEFAULTS.briefing.style)), layout, ...style },
  };
}
/** Splits a whole briefing frame into one layer per part, so each part can be selected, hidden or deleted on its own. */
export function splitBriefing(F) {
  const S = F.style, lay = S.layout || 'A';
  const list = [['background', 'Background']];
  if (lay !== 'intro' && lay !== 'end') list.push(['frame', lay === 'photos' ? 'Map inset frame' : 'Map window frame']);
  list.push(...(BR_PARTS[lay] || BR_PARTS.A).filter(([k]) => !S[`off_${k}`]));
  if (S.header) list.push(['header', 'Header bar']);
  list.push(['logos', 'Logos']);
  if (S.tickerOn) list.push(['ticker', 'Breaking ticker']);
  return list.map(([k, n]) => {
    const c = JSON.parse(JSON.stringify(F));
    c.id = `brief_${Math.random().toString(36).slice(2, 9)}`;
    c.name = `Briefing · ${n}`;
    c.style.only = k;
    for (const key of Object.keys(c.style)) if (key.startsWith('off_')) delete c.style[key];
    return c;
  });
}
/** A briefing layout as separate layers. */
export const briefingLayers = (layout = 'A', style = {}, ll = null) => splitBriefing(newBriefingLayer(layout, style, ll));
/**
 * Camera for a “zoom to location” scene: one smooth, eased move from the globe straight down to the place.
 * ll [lng, lat]; returns { mode: 'keyframes', keys }.
 */
export function zoomCamera(ll, seconds = 8, endZoom = 13, o = {}) {
  // one continuous flight sampled into many linear keys, so the speed never stops and restarts between keys
  const tilt = clamp(+o.tilt || 0, 0, 75), rot = clamp(+o.rotate || 0, -180, 180), spin = clamp(+o.spin || 0, 0, 3);
  const k = (t, c, z, bearing = 0, pitch = 0, ease = 'linear') => ({ t: +t.toFixed(3), view: { center: [r6(c[0]), r6(c[1])], zoomRef: +z.toFixed(3), bearing: +bearing.toFixed(2), pitch: +pitch.toFixed(2) }, ease });
  const lat0 = clamp(ll[1] * 0.5, -45, 45), z0 = clamp(+o.startZoom || 0.7, 0, 4);
  const lon0 = ll[0] - 30 - 360 * spin, z1 = endZoom + 0.25;
  const ss = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const sm = (x) => { x = clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };
  const n = Math.max(10, Math.round(seconds * 5));
  const keys = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, e = sm(u);
    const ec = ss(e / 0.5); // the globe turns to the place while still high up, then the camera dives
    const ez = e ** 2.2;
    const ea = ss((e - 0.5) / 0.5);
    keys.push(k(u * seconds, [lon0 + (ll[0] - lon0) * ec, lat0 + (ll[1] - lat0) * ec], z0 + (z1 - z0) * ez, rot * ea, tilt * ea));
  }
  return { mode: 'keyframes', keys };
}
export const ZOOM_DEFAULTS = { sec: 8, end: 13, tilt: 25, rotate: 0, spin: 0, place: '' };
/** middle of a country by name (null while the outlines load) */
export function countryPoint(name) { const c = (countriesByName(name) || [])[0]; return c ? labelPoint(c.polys) : null; }
export { CUSTOM_POS };
