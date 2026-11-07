// Map layout elements (cartographic "map furniture"): map title, legend (built from your thematic maps and map layers),
// north arrow, scale bar, coordinate grid / graticule, map frame and neatline, data source and credits,
// projection / coordinate reference system note, author and date, and an overview map with the current extent.
import { placeAt, CUSTOM_POS } from './place.js';
import { H } from './cartofx.js';
import { legendSpec, measureLegend, TH_SET } from './thematic.js';

const { clamp, easeOut, UI, hexA, rr, prog, off, merc } = H;
const SERIF = 'Georgia,"Times New Roman",serif';
const COND = '"Archivo","Arial Narrow","Segoe UI",system-ui,sans-serif';
const POSN = { 'top-left': 'Top left', 'top-center': 'Top centre', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-center': 'Bottom centre', 'bottom-right': 'Bottom right', ...CUSTOM_POS };
const D2R = Math.PI / 180;

export const ML_KINDS = {
  maptitle: { name: 'Map title', icon: '🅃', geom: null, desc: 'The map title and subtitle — classic, banner, boxed, ribbon or minimal' },
  maplegend: { name: 'Legend', icon: '☰', geom: null, desc: 'A legend built automatically from your thematic maps and map layers, plus your own entries' },
  northarrow: { name: 'North arrow', icon: '🧭', geom: null, desc: 'A north arrow or compass rose that turns with the map' },
  scalebar: { name: 'Scale bar', icon: '📏', geom: null, desc: 'A scale bar (alternating, line, double km / miles…) that updates with the zoom, with an optional 1 : N ratio' },
  graticule: { name: 'Coordinate grid / graticule', icon: '#', geom: null, desc: 'Latitude / longitude lines with degree labels on the frame' },
  neatline: { name: 'Map frame & neatline', icon: '▢', geom: null, desc: 'A border around the map — single, double, classic black-and-white band — with an optional paper margin' },
  mapcredits: { name: 'Data source & credits', icon: '©', geom: null, desc: 'Small text: data sources, basemap credits, notes' },
  crsinfo: { name: 'Projection & CRS', icon: '🌐', geom: null, desc: 'The projection and coordinate reference system (Web Mercator EPSG:3857, WGS 84…), centre and scale' },
  authordate: { name: 'Author & date', icon: '✍', geom: null, desc: 'Who made the map and when' },
  overview: { name: 'Overview map', icon: '🔲', geom: null, desc: 'A small zoomed-out map with a box showing what the main map shows' },
};
export const ML_ANIMS = {
  maptitle: { slide: 'Slide in', type: 'Types in', fade: 'Fade in', none: 'Shown' },
  maplegend: { slide: 'Slide in', fade: 'Fade in', none: 'Shown' },
  northarrow: { spin: 'Spins to north', fade: 'Fade in', none: 'Shown' },
  scalebar: { grow: 'Draws in', fade: 'Fade in', none: 'Shown' },
  graticule: { draw: 'Lines draw in', fade: 'Fade in', none: 'Shown' },
  neatline: { draw: 'Frame draws around', fade: 'Fade in', none: 'Shown' },
  mapcredits: { fade: 'Fade in', type: 'Types in', none: 'Shown' },
  crsinfo: { fade: 'Fade in', type: 'Types in', none: 'Shown' },
  authordate: { fade: 'Fade in', type: 'Types in', none: 'Shown' },
  overview: { slide: 'Slide in', fade: 'Fade in', none: 'Shown' },
};
const today = () => new Date().toISOString().slice(0, 10);
export const ML_DEFAULTS = {
  maptitle: { anim: 'slide', duration: 0.9, style: { text: 'Map title', sub: 'Subtitle — what, where and when', look: 'classic', align: 'center', position: 'top-center', font: 'sans', color: '#1b1f27', bg: '#ffffff', accent: '#e8553b', size: 1, upper: false } },
  maplegend: { anim: 'slide', duration: 0.8, style: { heading: 'Legend', auto: true, layers: true, items: '', theme: 'light', position: 'bottom-left', size: 1 } },
  northarrow: { anim: 'spin', duration: 1.2, style: { look: 'classic', color: '#1b1f27', color2: '#ffffff', halo: true, size: 1, position: 'top-right', follow: true } },
  scalebar: { anim: 'grow', duration: 0.8, style: { look: 'alternating', units: 'metric', segments: 4, length: 220, ratio: false, box: 'white', color: '#1b1f27', size: 1, position: 'bottom-center' } },
  graticule: { anim: 'fade', duration: 1, style: { interval: 0, color: '#ffffff', width: 0.8, opacity: 0.55, dashed: true, labels: true, labelColor: '#ffffff', labelSize: 1, decimal: false } },
  neatline: { anim: 'draw', duration: 1, style: { look: 'double', color: '#1b1f27', width: 2, inset: 14, paper: false, paperColor: '#f5f1e8', margin: 34, segments: 24 } },
  mapcredits: { anim: 'fade', duration: 0.6, style: { text: 'Data: Natural Earth, OpenStreetMap contributors · Basemap: © the map provider', look: 'plain', position: 'bottom-right', color: '#ffffff', size: 1, stack: 0 } },
  crsinfo: { anim: 'fade', duration: 0.6, style: { text: '', center: true, scale: false, look: 'plain', position: 'bottom-right', color: '#ffffff', size: 1, stack: 1 } },
  authordate: { anim: 'fade', duration: 0.6, style: { author: 'Your name', org: '', date: 'today', custom: today(), format: 'long', prefix: 'Map by', look: 'plain', position: 'bottom-right', color: '#ffffff', size: 1, stack: 2 } },
  overview: { anim: 'slide', duration: 0.8, style: { basemap: 'light', zoomOut: 5, size: 1, shape: 'square', box: '#e8553b', fillBox: true, cross: false, border: '#ffffff', title: '', position: 'top-left' } },
};
const TEXTLOOK = { plain: 'Text with shadow', box: 'White box', dark: 'Dark box', bar: 'Strip across the bottom' };
export const ML_FORMS = {
  maptitle: [
    ['style.text', 'Title', 'text'], ['style.sub', 'Subtitle', 'text'],
    ['style.look', 'Look', 'select', { classic: 'Classic (centred, thin rule)', banner: 'Banner across the top', boxed: 'Boxed card', ribbon: 'Coloured ribbon', minimal: 'Minimal (text only)' }],
    ['style.font', 'Font', 'select', { sans: 'Sans serif', serif: 'Serif (atlas)', cond: 'Condensed bold' }],
    ['style.align', 'Text alignment', 'select', { left: 'Left', center: 'Centre', right: 'Right' }],
    ['style.upper', 'CAPITALS', 'switch'],
    ['style.color', 'Text colour', 'color'], ['style.bg', 'Background', 'color', null, (L) => ['banner', 'boxed', 'classic'].includes(L.style.look)], ['style.accent', 'Accent', 'color'],
    ['style.position', 'Position', 'select', POSN, (L) => L.style.look !== 'banner'], ['style.size', 'Size', 'range', [0.5, 2.5, 0.05]],
  ],
  maplegend: [
    ['style.heading', 'Heading', 'text'],
    ['style.auto', 'Include the thematic maps (their own legends are then hidden)', 'switch'],
    ['style.layers', 'Include map layers (boundaries, areas, lines, points)', 'switch'],
    ['style.items', 'Your own entries — “Label | colour | fill / line / dash / point”, one per line', 'textarea'],
    ['style.theme', 'Look', 'select', { light: 'White card', dark: 'Dark glass', clear: 'No box (text with shadow)' }],
    ['style.position', 'Position', 'select', POSN], ['style.size', 'Size', 'range', [0.5, 2, 0.05]],
  ],
  northarrow: [
    ['style.look', 'Style', 'select', { classic: 'Classic split arrow', rose: 'Compass rose (8 points)', simple: 'Simple triangle + N', circle: 'Arrow in a circle', star: 'Four-point star', fancy: 'Ornate (ring + degrees)' }],
    ['style.follow', 'Turn with the map', 'switch'],
    ['style.color', 'Colour', 'color'], ['style.color2', 'Second colour', 'color'], ['style.halo', 'White halo', 'switch'],
    ['style.position', 'Position', 'select', POSN], ['style.size', 'Size', 'range', [0.4, 3, 0.05]],
  ],
  scalebar: [
    ['style.look', 'Style', 'select', { alternating: 'Alternating black / white', line: 'Line with ticks', bar: 'Single bar', double: 'Double (km and miles)', stepped: 'Stepped line' }],
    ['style.units', 'Units', 'select', { metric: 'Kilometres / metres', imperial: 'Miles / feet', nautical: 'Nautical miles' }, (L) => L.style.look !== 'double'],
    ['style.segments', 'Divisions', 'range', [1, 6, 1]], ['style.length', 'Longest length (px)', 'range', [80, 500, 5]],
    ['style.ratio', 'Show the ratio (1 : 250 000 on screen)', 'switch'],
    ['style.box', 'Background', 'select', { white: 'White box', dark: 'Dark box', none: 'None' }], ['style.color', 'Colour', 'color'],
    ['style.position', 'Position', 'select', POSN], ['style.size', 'Size', 'range', [0.5, 2.5, 0.05]],
  ],
  graticule: [
    ['style.interval', 'Every (degrees, 0 = automatic)', 'select', { 0: 'Automatic', 0.1: '0.1°', 0.25: '0.25°', 0.5: '0.5°', 1: '1°', 2: '2°', 5: '5°', 10: '10°', 15: '15°', 20: '20°', 30: '30°' }],
    ['style.color', 'Line colour', 'color'], ['style.width', 'Line width', 'range', [0.2, 4, 0.1]], ['style.opacity', 'Opacity', 'range', [0.05, 1, 0.01]], ['style.dashed', 'Dashed', 'switch'],
    ['style.labels', 'Degree labels on the edges', 'switch'], ['style.decimal', 'Decimal degrees (instead of 30°N)', 'switch', null, (L) => L.style.labels !== false],
    ['style.labelColor', 'Label colour', 'color', null, (L) => L.style.labels !== false], ['style.labelSize', 'Label size', 'range', [0.5, 2, 0.05], (L) => L.style.labels !== false],
  ],
  neatline: [
    ['style.look', 'Style', 'select', { single: 'Single line', double: 'Double line', thinthick: 'Thin + thick', classic: 'Classic black-and-white band', shadow: 'Line with drop shadow' }],
    ['style.color', 'Colour', 'color'], ['style.width', 'Line width', 'range', [0.5, 10, 0.1]], ['style.inset', 'Distance from the edge (px)', 'range', [0, 120, 1]],
    ['style.segments', 'Band segments', 'range', [6, 60, 1], (L) => L.style.look === 'classic'],
    ['style.paper', 'Paper margin outside the frame', 'switch'], ['style.paperColor', 'Paper colour', 'color', null, (L) => !!L.style.paper], ['style.margin', 'Margin width (px)', 'range', [4, 200, 1], (L) => !!L.style.paper],
  ],
  mapcredits: [['style.text', 'Text (use | for a new line)', 'textarea'], ['style.look', 'Look', 'select', TEXTLOOK], ['style.color', 'Text colour', 'color'], ['style.position', 'Position', 'select', POSN], ['style.size', 'Size', 'range', [0.5, 2, 0.05]]],
  crsinfo: [
    ['style.text', 'Text (empty = automatic: Web Mercator · WGS 84)', 'text'], ['style.center', 'Show the centre coordinates', 'switch'], ['style.scale', 'Show the scale', 'switch'],
    ['style.look', 'Look', 'select', TEXTLOOK], ['style.color', 'Text colour', 'color'], ['style.position', 'Position', 'select', POSN], ['style.size', 'Size', 'range', [0.5, 2, 0.05]],
  ],
  authordate: [
    ['style.prefix', 'Before the name', 'text'], ['style.author', 'Author', 'text'], ['style.org', 'Organisation (optional)', 'text'],
    ['style.date', 'Date', 'select', { today: 'Today', custom: 'Pick a date', none: 'No date' }], ['style.custom', 'Date', 'text', null, (L) => L.style.date === 'custom'],
    ['style.format', 'Date format', 'select', { long: '7 November 2026', short: '07/11/2026', iso: '2026-11-07', month: 'November 2026' }, (L) => L.style.date !== 'none'],
    ['style.look', 'Look', 'select', TEXTLOOK], ['style.color', 'Text colour', 'color'], ['style.position', 'Position', 'select', POSN], ['style.size', 'Size', 'range', [0.5, 2, 0.05]],
  ],
  overview: [
    ['style.basemap', 'Map', 'select', { light: 'Light grey', dark: 'Dark grey', streets: 'Streets', topo: 'Topographic', satellite: 'Satellite' }],
    ['style.zoomOut', 'Zoomed out by', 'range', [1, 12, 0.5]], ['style.shape', 'Shape', 'select', { square: 'Square', wide: 'Wide', circle: 'Circle' }],
    ['style.box', 'Extent box colour', 'color'], ['style.fillBox', 'Tint inside the box', 'switch'], ['style.cross', 'Cross-hair on the centre', 'switch'],
    ['style.border', 'Border colour', 'color'], ['style.title', 'Caption (optional)', 'text'],
    ['style.position', 'Position', 'select', POSN], ['style.size', 'Size', 'range', [0.5, 2.5, 0.05]],
  ],
};
export const ML_SET = new Set(Object.keys(ML_KINDS));
export const mlPhases = (k) => (k === 'graticule' ? ['above', 'captions'] : k === 'neatline' ? ['captions'] : ['captions']);

// ================================================================= helpers
function corner(fr, pos, w, h, m, stackY = 0) {
  pos = pos || 'bottom-right';
  const x = /left/.test(pos) ? fr.x + m : /center/.test(pos) ? fr.x + (fr.w - w) / 2 : fr.x + fr.w - m - w;
  const y = /top/.test(pos) ? fr.y + m + stackY : fr.y + fr.h - m - h - stackY;
  return [x, y];
}
/** metres per frame pixel and screen angle of north, at the frame centre */
function mapMetrics(o) {
  const fr = o.frame, map = o.map;
  let c = null;
  try { const cc = map?.getCenter?.(); if (cc) c = [cc.lng, cc.lat]; } catch { /* no map */ }
  if (!c) return { mpp: NaN, north: 0, c: null };
  const p0 = o.proj(c), dLon = 0.01, p1 = o.proj([c[0] + dLon, c[1]]), p2 = o.proj([c[0], c[1] + 0.01]);
  const px = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const m = dLon * 111320 * Math.cos(c[1] * D2R);
  const north = Math.atan2(p2[0] - p0[0], -(p2[1] - p0[1]));
  void fr;
  return { mpp: px > 0 ? m / px : NaN, north, c };
}
const appear = (L, tm) => (tm.edit || L.anim === 'none' ? 1 : easeOut(prog(L, tm)));
function typed(L, tm, text) {
  if (L.anim !== 'type' || tm.edit) return text;
  const k = prog(L, tm);
  return text.slice(0, Math.ceil(text.length * k));
}
function fmtDeg(v, axis, decimal) {
  const r = Math.round(v * 1000) / 1000;
  if (decimal) return `${r}°`;
  const a = Math.abs(r), h = axis === 'lat' ? (r > 0 ? 'N' : r < 0 ? 'S' : '') : (r > 0 ? 'E' : r < 0 ? 'W' : '');
  const d = Math.floor(a + 1e-9), mm = Math.round((a - d) * 60);
  return mm ? `${d}°${String(mm).padStart(2, '0')}′${h}` : `${d}°${h}`;
}

// ================================================================= dispatcher
export function drawLayout(ctx, L, tm, o, phase) {
  if (!o.frame) return;
  switch (L.kind) {
    case 'maptitle': return drawTitle(ctx, L, tm, o);
    case 'maplegend': return drawLegendEl(ctx, L, tm, o);
    case 'northarrow': return drawNorth(ctx, L, tm, o);
    case 'scalebar': return drawScale(ctx, L, tm, o);
    case 'graticule': return drawGraticule(ctx, L, tm, o, phase);
    case 'neatline': return drawNeatline(ctx, L, tm, o);
    case 'mapcredits': return drawTextEl(ctx, L, tm, o, String(L.style.text || '').split('|').map((x) => x.trim()));
    case 'crsinfo': return drawTextEl(ctx, L, tm, o, crsLines(L, o));
    case 'authordate': return drawTextEl(ctx, L, tm, o, authorLines(L));
    case 'overview': return drawOverview(ctx, L, tm, o);
    default:
  }
}

// ---------------------------------------------------------------- title
function drawTitle(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, unit = o.unit * (+s.size || 1), k = appear(L, tm);
  const fam = s.font === 'serif' ? SERIF : s.font === 'cond' ? COND : UI;
  const up = (t) => (s.upper ? String(t).toUpperCase() : String(t));
  const title = up(typed(L, tm, s.text || '')), sub = up(s.sub || '');
  const tf = `${s.font === 'cond' ? 900 : s.font === 'serif' ? 700 : 800} ${34 * unit}px ${fam}`, sf = `${s.font === 'serif' ? 'italic ' : ''}500 ${16 * unit}px ${s.font === 'cond' ? UI : fam}`;
  ctx.save();
  ctx.font = tf; const tw = ctx.measureText(up(s.text || '')).width; ctx.font = sf; const sw = sub ? ctx.measureText(sub).width : 0;
  const padX = 22 * unit, padY = 14 * unit, th = 40 * unit, sh = sub ? 24 * unit : 0;
  const look = s.look || 'classic';
  let W = Math.max(tw, sw) + padX * 2, Hh = th + sh + padY * 2 + (look === 'classic' ? 8 * unit : 0);
  let x, y;
  if (look === 'banner') { W = fr.w; x = fr.x; y = fr.y; }
  else [x, y] = corner(fr, s.position || 'top-center', W, Hh, 24 * o.unit);
  placeAt(ctx, L, fr, x, y, W, Hh);
  const dy = L.anim === 'slide' && !tm.edit ? -(1 - k) * (Hh + 30 * unit) * (/bottom/.test(s.position) && look !== 'banner' ? -1 : 1) : 0;
  ctx.translate(0, dy);
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !tm.edit ? k : 1);
  if (look === 'banner') { ctx.fillStyle = hexA(s.bg || '#ffffff', 0.93); ctx.fillRect(x, y, W, Hh); ctx.fillStyle = s.accent || '#e8553b'; ctx.fillRect(x, y + Hh - 4 * unit, W, 4 * unit); }
  else if (look === 'boxed') { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 16 * unit; ctx.shadowOffsetY = 4 * unit; rr(ctx, x, y, W, Hh, 8 * unit); ctx.fillStyle = hexA(s.bg || '#ffffff', 0.95); ctx.fill(); ctx.restore(); ctx.fillStyle = s.accent || '#e8553b'; ctx.fillRect(x, y + 10 * unit, 5 * unit, Hh - 20 * unit); }
  else if (look === 'ribbon') { ctx.fillStyle = s.accent || '#e8553b'; ctx.beginPath(); ctx.moveTo(x - 10 * unit, y); ctx.lineTo(x + W + 10 * unit, y); ctx.lineTo(x + W, y + Hh / 2); ctx.lineTo(x + W + 10 * unit, y + Hh); ctx.lineTo(x - 10 * unit, y + Hh); ctx.lineTo(x, y + Hh / 2); ctx.closePath(); ctx.fill(); }
  else if (look === 'classic') { ctx.fillStyle = hexA(s.bg || '#ffffff', 0.9); ctx.fillRect(x, y, W, Hh); ctx.strokeStyle = s.color || '#1b1f27'; ctx.lineWidth = 1 * unit; ctx.strokeRect(x + 4 * unit, y + 4 * unit, W - 8 * unit, Hh - 8 * unit); }
  const al = s.align || 'center';
  const ax = al === 'left' ? x + padX : al === 'right' ? x + W - padX : x + W / 2;
  ctx.textAlign = al; ctx.textBaseline = 'middle';
  const ink = look === 'ribbon' ? '#ffffff' : s.color || '#1b1f27';
  if (look === 'minimal') { ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 8 * unit; }
  ctx.fillStyle = ink; ctx.font = tf; ctx.fillText(title, ax, y + padY + th / 2);
  if (look === 'classic' && sub) { ctx.fillStyle = s.accent || '#e8553b'; ctx.fillRect(x + W / 2 - 40 * unit, y + padY + th + 2 * unit, 80 * unit, 2 * unit); }
  if (sub) { ctx.font = sf; ctx.fillStyle = look === 'ribbon' ? 'rgba(255,255,255,0.9)' : hexA(ink.startsWith('#') ? ink : '#1b1f27', 0.78); ctx.globalAlpha *= tm.edit ? 1 : clamp(k * 1.5 - 0.3, 0, 1); ctx.fillText(sub, ax, y + padY + th + (look === 'classic' ? 8 * unit : 0) + sh / 2 + 2 * unit); }
  ctx.restore();
}

// ---------------------------------------------------------------- legend
function layerEntries(o) {
  const out = [];
  for (const x of o.scene?.layers || []) {
    if (x.hidden) continue;
    const st = x.style || {}, nm = x.name || '';
    if (x.kind === 'boundary') out.push({ sw: 'line', color: st.stroke || '#ffd23f', dash: st.dash && st.dash !== 'solid', text: nm });
    else if (x.kind === 'area') out.push({ sw: 'fill', color: st.fill || '#ff4a2b', text: nm });
    else if (x.kind === 'line') out.push({ sw: 'line', color: st.color || '#2d7ff9', dash: st.dash && st.dash !== 'solid', text: nm });
    else if (x.kind === 'point' && x.geom) out.push({ sw: 'circle', color: st.color || '#ff4a2b', text: st.label || nm });
    else if (x.kind === 'flood') out.push({ sw: 'fill', color: st.color || '#2f8fe0', text: nm });
  }
  const seen = new Set();
  return out.filter((e) => { const k = `${e.sw}|${e.color}|${e.text}`; if (seen.has(k) || !e.text) return false; seen.add(k); return true; });
}
function drawLegendEl(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, unit = o.unit * (+s.size || 1), k = appear(L, tm);
  const specs = s.auto !== false ? (o.scene?.layers || []).filter((x) => TH_SET.has(x.kind) && !x.hidden).map(legendSpec).filter(Boolean) : [];
  const extra = [];
  if (s.layers !== false) extra.push(...layerEntries(o));
  for (const line of String(s.items || '').split('\n')) {
    const [t, c, ty] = line.split('|').map((v) => v.trim()); if (!t) continue;
    const kind = (ty || 'fill').toLowerCase();
    extra.push({ sw: kind.startsWith('l') ? 'line' : kind.startsWith('d') ? 'line' : kind.startsWith('p') || kind.startsWith('c') ? 'circle' : 'fill', dash: kind.startsWith('d'), color: c || '#888888', text: t });
  }
  if (!specs.length && !extra.length) extra.push({ sw: 'none', text: 'Add a thematic map or entries' });
  const lay = measureLegend(ctx, specs, unit, { theme: s.theme, heading: s.heading, extra });
  const [x, y] = corner(fr, s.position || 'bottom-left', lay.w, lay.h, 28 * o.unit);
  ctx.save(); placeAt(ctx, L, fr, x, y, lay.w, lay.h);
  if (L.anim === 'slide' && !tm.edit) ctx.translate((/right/.test(s.position) ? 1 : -1) * (1 - k) * (lay.w + 40 * unit), 0);
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !tm.edit ? k : 1);
  lay.paint(x, y);
  ctx.restore();
}

// ---------------------------------------------------------------- north arrow
function drawNorth(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, unit = o.unit * (+s.size || 1), k = appear(L, tm);
  const R = 34 * unit, W = R * 2 + 16 * unit, Hh = R * 2 + 30 * unit;
  const [x, y] = corner(fr, s.position || 'top-right', W, Hh, 26 * o.unit);
  const { north } = mapMetrics(o);
  let rot = s.follow === false ? 0 : north;
  if (L.anim === 'spin' && !tm.edit) rot += (1 - k) * Math.PI * 2.5;
  ctx.save(); placeAt(ctx, L, fr, x, y, W, Hh);
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !tm.edit ? k : clamp(k * 3, 0, 1));
  const cx = x + W / 2, cy = y + 18 * unit + R;
  const c1 = s.color || '#1b1f27', c2 = s.color2 || '#ffffff';
  if (s.halo !== false) { ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 6 * unit; }
  ctx.translate(cx, cy); ctx.rotate(rot);
  ctx.lineJoin = 'round'; ctx.lineWidth = 1.2 * unit; ctx.strokeStyle = c1;
  const N = (yy, f = 16) => { ctx.save(); ctx.rotate(0); ctx.fillStyle = c1; ctx.font = `800 ${f * unit}px ${s.look === 'fancy' ? SERIF : UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', 0, yy); ctx.restore(); };
  const look = s.look || 'classic';
  if (look === 'classic') {
    ctx.beginPath(); ctx.moveTo(0, -R); ctx.lineTo(R * 0.42, R * 0.75); ctx.lineTo(0, R * 0.45); ctx.closePath(); ctx.fillStyle = c2; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -R); ctx.lineTo(-R * 0.42, R * 0.75); ctx.lineTo(0, R * 0.45); ctx.closePath(); ctx.fillStyle = c1; ctx.fill(); ctx.stroke();
    N(-R - 12 * unit);
  } else if (look === 'simple') {
    ctx.beginPath(); ctx.moveTo(0, -R); ctx.lineTo(R * 0.5, R * 0.5); ctx.lineTo(-R * 0.5, R * 0.5); ctx.closePath(); ctx.fillStyle = c1; ctx.fill();
    ctx.fillStyle = c2; ctx.font = `800 ${16 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', 0, R * 0.18);
  } else if (look === 'circle') {
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fillStyle = hexA(c2.startsWith('#') ? c2 : '#ffffff', 0.9); ctx.fill(); ctx.lineWidth = 2 * unit; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -R * 0.82); ctx.lineTo(R * 0.3, R * 0.1); ctx.lineTo(0, -R * 0.05); ctx.lineTo(-R * 0.3, R * 0.1); ctx.closePath(); ctx.fillStyle = c1; ctx.fill();
    N(R * 0.45, 15);
  } else if (look === 'star' || look === 'rose' || look === 'fancy') {
    const pt = (a, r1, r2, fillL, fillR) => {
      ctx.save(); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(0, -r1); ctx.lineTo(r2, -r2); ctx.lineTo(0, 0); ctx.closePath(); ctx.fillStyle = fillR; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -r1); ctx.lineTo(-r2, -r2); ctx.lineTo(0, 0); ctx.closePath(); ctx.fillStyle = fillL; ctx.fill(); ctx.stroke();
      ctx.restore();
    };
    if (look === 'fancy') {
      ctx.beginPath(); ctx.arc(0, 0, R * 0.92, 0, Math.PI * 2); ctx.lineWidth = 1.2 * unit; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, R * 0.8, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2, r1 = R * 0.8, r2 = R * (i % 9 === 0 ? 0.92 : 0.86); ctx.beginPath(); ctx.moveTo(Math.sin(a) * r1, -Math.cos(a) * r1); ctx.lineTo(Math.sin(a) * r2, -Math.cos(a) * r2); ctx.lineWidth = 0.8 * unit; ctx.stroke(); }
    }
    if (look !== 'star') for (let i = 0; i < 4; i++) pt(Math.PI / 4 + (i * Math.PI) / 2, R * 0.62, R * 0.13, c2, c1);
    for (let i = 0; i < 4; i++) pt((i * Math.PI) / 2, R, R * 0.2, c1, c2);
    N(-R - 12 * unit);
    if (look !== 'star') { ctx.fillStyle = c1; ctx.font = `700 ${10 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; [['E', 1, 0], ['S', 0, 1], ['W', -1, 0]].forEach(([t, a, b]) => ctx.fillText(t, a * (R + 9 * unit), b * (R + 9 * unit))); }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- scale bar
const niceLen = (v) => { const p = 10 ** Math.floor(Math.log10(v)); const f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };
function scaleUnit(mpp, maxPx, units) {
  const U = units === 'imperial' ? [['mi', 1609.344], ['ft', 0.3048]] : units === 'nautical' ? [['nmi', 1852], ['m', 1]] : [['km', 1000], ['m', 1]];
  const maxM = maxPx * mpp;
  const [big, small] = U;
  const useBig = maxM >= big[1];
  const [lab, f] = useBig ? big : small;
  const v = niceLen(maxM / f);
  return { v, lab, px: (v * f) / mpp };
}
function drawScale(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, unit = o.unit * (+s.size || 1), k = appear(L, tm);
  const { mpp } = mapMetrics(o);
  if (!(mpp > 0) || !isFinite(mpp)) return;
  const maxPx = (+s.length || 220) * unit;
  const look = s.look || 'alternating';
  const A = scaleUnit(mpp, maxPx, look === 'double' ? 'metric' : s.units);
  const B = look === 'double' ? scaleUnit(mpp, maxPx, 'imperial') : null;
  const seg = clamp(+s.segments || 4, 1, 8);
  const pad = 12 * unit, barH = 7 * unit;
  const ratioTxt = s.ratio ? `1 : ${Math.round(mpp / 0.0002645833).toLocaleString('en-US').replace(/,/g, ' ')}` : '';
  ctx.save();
  ctx.font = `600 ${11 * unit}px ${UI}`;
  const lastW = ctx.measureText(`${A.v} ${A.lab}`).width;
  const W = Math.max(A.px, B ? B.px : 0) + pad * 2 + lastW / 2 + 6 * unit, Hh = (B ? 52 : 38) * unit + (ratioTxt ? 16 * unit : 0);
  const [x, y] = corner(fr, s.position || 'bottom-center', W, Hh, 26 * o.unit);
  placeAt(ctx, L, fr, x, y, W, Hh);
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !tm.edit ? k : 1);
  const col = s.color || '#1b1f27', bgc = s.box === 'dark' ? 'rgba(14,18,26,0.82)' : s.box === 'none' ? null : 'rgba(255,255,255,0.88)';
  const ink = s.box === 'dark' ? '#ffffff' : col;
  if (bgc) { rr(ctx, x, y, W, Hh, 6 * unit); ctx.fillStyle = bgc; ctx.fill(); }
  else { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4 * unit; }
  const gk = L.anim === 'grow' && !tm.edit ? k : 1;
  const bx = x + pad, by = y + 22 * unit;
  const lbl = (t, xx, yy, al = 'center') => { ctx.fillStyle = ink; ctx.textAlign = al; ctx.textBaseline = 'bottom'; ctx.fillText(t, xx, yy); };
  const fmt = (v) => `${+v.toPrecision(6)}`;
  ctx.strokeStyle = ink; ctx.lineWidth = 1.2 * unit;
  const len = A.px * gk;
  if (look === 'alternating' || look === 'double') {
    for (let i = 0; i < seg; i++) { const sx = bx + (len * i) / seg; ctx.fillStyle = i % 2 ? (s.box === 'dark' ? '#0e121a' : '#ffffff') : ink; ctx.fillRect(sx, by, len / seg, barH); }
    ctx.strokeRect(bx, by, len, barH);
    for (let i = 0; i <= seg; i++) if (gk >= i / seg) lbl(i === seg ? `${fmt(A.v)} ${A.lab}` : fmt((A.v * i) / seg), bx + (A.px * i) / seg, by - 3 * unit);
    if (B) {
      const lb = B.px * gk;
      ctx.beginPath(); ctx.moveTo(bx, by + barH); ctx.lineTo(bx, by + barH + 8 * unit); ctx.moveTo(bx, by + barH + 4 * unit); ctx.lineTo(bx + lb, by + barH + 4 * unit); ctx.moveTo(bx + lb, by + barH); ctx.lineTo(bx + lb, by + barH + 8 * unit); ctx.stroke();
      ctx.textBaseline = 'top'; ctx.fillStyle = ink; ctx.textAlign = 'center'; if (gk > 0.95) ctx.fillText(`${fmt(B.v)} ${B.lab}`, bx + lb, by + barH + 10 * unit); ctx.textAlign = 'left'; ctx.fillText('0', bx - 3 * unit, by + barH + 10 * unit);
    }
  } else if (look === 'bar') {
    ctx.fillStyle = ink; ctx.fillRect(bx, by, len, barH);
    lbl('0', bx, by - 3 * unit); if (gk > 0.95) lbl(`${fmt(A.v)} ${A.lab}`, bx + A.px, by - 3 * unit);
  } else if (look === 'line' || look === 'stepped') {
    ctx.lineWidth = 2 * unit;
    ctx.beginPath(); ctx.moveTo(bx, by + barH); ctx.lineTo(bx + len, by + barH); ctx.stroke();
    for (let i = 0; i <= seg; i++) {
      const sx = bx + (A.px * i) / seg; if (sx > bx + len + 0.5) break;
      const hh = look === 'stepped' ? (i % 2 ? barH * 0.5 : barH) : i === 0 || i === seg ? barH : barH * 0.55;
      ctx.beginPath(); ctx.moveTo(sx, by + barH); ctx.lineTo(sx, by + barH - hh); ctx.stroke();
      lbl(i === seg ? `${fmt(A.v)} ${A.lab}` : fmt((A.v * i) / seg), sx, by - 3 * unit);
    }
  }
  if (ratioTxt) { ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.font = `500 ${10.5 * unit}px ${UI}`; ctx.fillText(ratioTxt, x + W / 2, y + Hh - 5 * unit); }
  ctx.restore();
}

// ---------------------------------------------------------------- graticule
function drawGraticule(ctx, L, tm, o, phase) {
  const s = L.style, fr = o.frame, unit = o.unit, k = appear(L, tm);
  let b;
  try { const bb = o.map.getBounds(); b = [bb.getWest(), bb.getSouth(), bb.getEast(), bb.getNorth()]; } catch { return; }
  b[1] = Math.max(-85, b[1]); b[3] = Math.min(85, b[3]);
  const span = Math.max(b[2] - b[0], (b[3] - b[1]) * 1.5);
  let step = +s.interval;
  if (!(step > 0)) { const cands = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 20, 30]; step = cands.find((c) => span / c <= 8) || 30; }
  const lon0 = Math.floor(b[0] / step) * step, lat0 = Math.floor(b[1] / step) * step;
  const lons = [], lats = [];
  for (let v = lon0; v <= b[2] + 1e-9 && lons.length < 80; v += step) lons.push(+v.toFixed(6));
  for (let v = lat0; v <= b[3] + 1e-9 && lats.length < 80; v += step) if (v >= -85 && v <= 85) lats.push(+v.toFixed(6));
  if (phase === 'above') {
    ctx.save();
    ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); ctx.clip();
    ctx.globalAlpha *= tm.alpha * (+s.opacity || 0.55) * (L.anim === 'fade' && !tm.edit ? k : 1);
    ctx.strokeStyle = s.color || '#fff'; ctx.lineWidth = (+s.width || 0.8) * unit;
    if (s.dashed !== false) ctx.setLineDash([5 * unit, 4 * unit]);
    const dk = L.anim === 'draw' && !tm.edit ? k : 1;
    const n = 60;
    for (const lon of lons) { ctx.beginPath(); for (let i = 0; i <= n * dk; i++) { const la = b[1] + ((b[3] - b[1]) * i) / n; const q = o.proj([lon, la]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } ctx.stroke(); }
    for (const lat of lats) { ctx.beginPath(); for (let i = 0; i <= n * dk; i++) { const lo = b[0] + ((b[2] - b[0]) * i) / n; const q = o.proj([lo, lat]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } ctx.stroke(); }
    ctx.restore();
    return;
  }
  if (s.labels === false) return;
  ctx.save();
  ctx.globalAlpha *= tm.alpha * (L.anim !== 'none' && !tm.edit ? k : 1);
  const lu = unit * (+s.labelSize || 1);
  ctx.font = `600 ${10.5 * lu}px ${UI}`; ctx.fillStyle = s.labelColor || '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 3 * lu;
  const c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const m = 4 * lu;
  for (const lon of lons) {
    const q = o.proj([lon, c[1]]); if (q[0] < fr.x + 14 * lu || q[0] > fr.x + fr.w - 14 * lu) continue;
    const t = fmtDeg(lon, 'lon', s.decimal);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(t, q[0], fr.y + m);
    ctx.textBaseline = 'bottom'; ctx.fillText(t, q[0], fr.y + fr.h - m);
  }
  for (const lat of lats) {
    const q = o.proj([c[0], lat]); if (q[1] < fr.y + 14 * lu || q[1] > fr.y + fr.h - 14 * lu) continue;
    const t = fmtDeg(lat, 'lat', s.decimal);
    ctx.save(); ctx.translate(fr.x + m, q[1]); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(t, 0, 0); ctx.restore();
    ctx.save(); ctx.translate(fr.x + fr.w - m, q[1]); ctx.rotate(Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(t, 0, 0); ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- neatline
function drawNeatline(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, unit = o.unit, k = appear(L, tm);
  const ins = (+s.inset || 0) * unit, lw = (+s.width || 2) * unit, col = s.color || '#1b1f27';
  ctx.save();
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !tm.edit ? k : 1);
  if (s.paper) {
    const mg = (+s.margin || 34) * unit;
    ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); ctx.rect(fr.x + mg, fr.y + mg, fr.w - mg * 2, fr.h - mg * 2);
    ctx.fillStyle = s.paperColor || '#f5f1e8'; ctx.fill('evenodd');
  }
  const pm = s.paper ? (+s.margin || 34) * unit : 0;
  const x = fr.x + ins + pm, y = fr.y + ins + pm, w = fr.w - (ins + pm) * 2, h = fr.h - (ins + pm) * 2;
  const dk = L.anim === 'draw' && !tm.edit ? k : 1;
  const rectPath = (xx, yy, ww, hh) => {
    const per = 2 * (ww + hh), d = per * dk;
    ctx.beginPath(); ctx.moveTo(xx, yy);
    const segs = [[xx + ww, yy, ww], [xx + ww, yy + hh, hh], [xx, yy + hh, ww], [xx, yy, hh]];
    let left = d, px = xx, py = yy;
    for (const [tx, ty, l] of segs) { if (left <= 0) break; const f = Math.min(1, left / l); ctx.lineTo(px + (tx - px) * f, py + (ty - py) * f); left -= l; px = tx; py = ty; }
  };
  ctx.strokeStyle = col; ctx.lineJoin = 'miter';
  const look = s.look || 'double';
  if (look === 'shadow') { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 10 * unit; ctx.shadowOffsetX = 3 * unit; ctx.shadowOffsetY = 3 * unit; }
  if (look === 'single' || look === 'shadow') { ctx.lineWidth = lw; rectPath(x, y, w, h); ctx.stroke(); }
  else if (look === 'double') { ctx.lineWidth = lw; rectPath(x, y, w, h); ctx.stroke(); ctx.lineWidth = Math.max(1, lw * 0.5); rectPath(x + lw * 2.5, y + lw * 2.5, w - lw * 5, h - lw * 5); ctx.stroke(); }
  else if (look === 'thinthick') { ctx.lineWidth = lw * 2; rectPath(x, y, w, h); ctx.stroke(); ctx.lineWidth = Math.max(1, lw * 0.5); rectPath(x + lw * 3, y + lw * 3, w - lw * 6, h - lw * 6); ctx.stroke(); }
  else if (look === 'classic') {
    const bw = Math.max(5 * unit, lw * 3), n = clamp(+s.segments || 24, 4, 80);
    const segW = w / n, segH = h / Math.max(2, Math.round((n * h) / w));
    const nh = Math.round(h / segH);
    if (dk >= 1) {
      for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : col; ctx.fillRect(x + i * segW, y, segW, bw); ctx.fillRect(x + i * segW, y + h - bw, segW, bw); }
      for (let i = 0; i < nh; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : col; ctx.fillRect(x, y + i * segH, bw, segH); ctx.fillRect(x + w - bw, y + i * segH, bw, segH); }
    }
    ctx.lineWidth = Math.max(1, lw * 0.5); rectPath(x, y, w, h); ctx.stroke(); rectPath(x + bw, y + bw, w - bw * 2, h - bw * 2); ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- small text elements
function crsLines(L, o) {
  const s = L.style;
  const lines = [];
  let projName = 'Web Mercator (EPSG:3857)';
  try { const p = o.map?.getProjection?.(); if (p && /globe/i.test(p.type || p.name || '')) projName = 'Vertical perspective (globe)'; } catch { /* old map */ }
  lines.push(s.text || `Projection: ${projName} · Datum: WGS 84 (EPSG:4326)`);
  const { c, mpp } = mapMetrics(o);
  const extra = [];
  if (s.center !== false && c) extra.push(`Centre: ${fmtDeg(c[1], 'lat')} ${fmtDeg(c[0], 'lon')}`);
  if (s.scale && mpp > 0) extra.push(`Scale ≈ 1 : ${Math.round(mpp / 0.0002645833).toLocaleString('en-US')}`);
  if (extra.length) lines.push(extra.join(' · '));
  return lines;
}
function authorLines(L) {
  const s = L.style;
  let d = '';
  if (s.date !== 'none') {
    const dt = s.date === 'custom' ? new Date(Date.parse(s.custom) || Date.now()) : new Date();
    d = s.format === 'short' ? dt.toLocaleDateString('en-GB') : s.format === 'iso' ? dt.toISOString().slice(0, 10) : s.format === 'month' ? dt.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  const who = [s.prefix, s.author].filter(Boolean).join(' ');
  return [[who, s.org].filter(Boolean).join(', '), d].filter(Boolean);
}
function drawTextEl(ctx, L, tm, o, lines) {
  const s = L.style, fr = o.frame, unit = o.unit * (+s.size || 1), k = appear(L, tm);
  lines = lines.filter(Boolean);
  if (!lines.length) return;
  ctx.save();
  ctx.font = `500 ${11.5 * unit}px ${UI}`;
  const lh = 15 * unit, pad = s.look === 'plain' ? 0 : 8 * unit;
  const W = Math.max(...lines.map((t) => ctx.measureText(t).width)) + pad * 2, Hh = lines.length * lh + pad * 2;
  const bar = s.look === 'bar';
  const stack = (+s.stack || 0) * 0;
  let [x, y] = corner(fr, s.position || 'bottom-right', W, Hh, (bar ? 0 : 14) * o.unit, stack);
  if (bar) { x = fr.x; y = fr.y + fr.h - Hh; }
  // keep several bottom-right texts from sitting on each other
  if (!bar && s.position !== 'custom') {
    const mine = (o.scene?.layers || []).filter((x2) => ['mapcredits', 'crsinfo', 'authordate'].includes(x2.kind) && !x2.hidden && (x2.style?.position || 'bottom-right') === (s.position || 'bottom-right') && x2.style?.look !== 'bar');
    const idx = mine.findIndex((x2) => x2.id === L.id);
    if (idx > 0) {
      let off = 0;
      for (let i = 0; i < idx; i++) { const n = (mine[i].kind === 'mapcredits' ? String(mine[i].style.text || '').split('|').length : 2); off += n * 15 * o.unit * (+mine[i].style.size || 1) + (mine[i].style.look === 'plain' ? 4 : 20) * o.unit; }
      y += /top/.test(s.position || '') ? off : -off;
    }
  }
  placeAt(ctx, L, fr, x, y, bar ? fr.w : W, Hh);
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !tm.edit ? k : 1);
  let ink = s.color || '#ffffff';
  if (s.look === 'box') { rr(ctx, x, y, W, Hh, 5 * unit); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill(); if (/^#f/i.test(ink)) ink = '#1b1f27'; }
  else if (s.look === 'dark') { rr(ctx, x, y, W, Hh, 5 * unit); ctx.fillStyle = 'rgba(14,18,26,0.8)'; ctx.fill(); }
  else if (bar) { ctx.fillStyle = 'rgba(14,18,26,0.72)'; ctx.fillRect(x, y, fr.w, Hh); }
  else { ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 4 * unit; }
  ctx.fillStyle = ink; ctx.textBaseline = 'middle';
  const al = bar ? 'center' : /left/.test(s.position || '') ? 'left' : /center/.test(s.position || '') ? 'center' : 'right';
  ctx.textAlign = al;
  const tx = bar ? fr.x + fr.w / 2 : al === 'left' ? x + pad : al === 'center' ? x + W / 2 : x + W - pad;
  lines.forEach((t, i) => ctx.fillText(typed(L, tm, t), tx, y + pad + lh * (i + 0.5)));
  ctx.restore();
}

// ---------------------------------------------------------------- overview map
function drawOverview(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, unit = o.unit * (+s.size || 1), k = appear(L, tm);
  const map = o.map; if (!map) return;
  let c, z, b;
  try { const cc = map.getCenter(); c = [cc.lng, cc.lat]; z = map.getZoom(); const bb = map.getBounds(); b = [bb.getWest(), bb.getSouth(), bb.getEast(), bb.getNorth()]; } catch { return; }
  const W = (s.shape === 'wide' ? 260 : 190) * unit, Hh = 190 * unit * (s.shape === 'wide' ? 0.72 : 1);
  const cap = s.title ? 20 * unit : 0;
  const [x0, y0] = corner(fr, s.position || 'top-left', W, Hh + cap, 26 * o.unit);
  const tz = clamp(z + 1 - (+s.zoomOut || 5), 0.5, 18);
  ctx.save(); placeAt(ctx, L, fr, x0, y0, W, Hh + cap);
  let x = x0;
  if (L.anim === 'slide' && !tm.edit) x += (/right/.test(s.position || '') ? 1 : -1) * (1 - k) * (W + 40 * unit);
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !tm.edit ? k : 1);
  const y = y0 + cap;
  const [cv, g] = off(`ov:${L.id}`, W, Hh);
  g.fillStyle = '#1c2026'; g.fillRect(0, 0, W, Hh);
  const to = H.drawTiles(g, s.basemap || 'light', c, tz, 0, 0, W, Hh);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 14 * unit; ctx.shadowOffsetY = 3 * unit;
  ctx.beginPath();
  if (s.shape === 'circle') ctx.arc(x + W / 2, y + Hh / 2, Math.min(W, Hh) / 2, 0, Math.PI * 2); else ctx.rect(x, y, W, Hh);
  ctx.fillStyle = '#1c2026'; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.clip();
  ctx.drawImage(cv, x, y);
  // the extent of the main map
  const p1 = to([b[0], b[3]]), p2 = to([b[2], b[1]]);
  const bx = x + Math.min(p1[0], p2[0]), by = y + Math.min(p1[1], p2[1]), bw = Math.max(3 * unit, Math.abs(p2[0] - p1[0])), bh = Math.max(3 * unit, Math.abs(p2[1] - p1[1]));
  if (s.fillBox !== false) { ctx.fillStyle = hexA(s.box || '#e8553b', 0.22); ctx.fillRect(bx, by, bw, bh); }
  ctx.strokeStyle = s.box || '#e8553b'; ctx.lineWidth = 2 * unit; ctx.strokeRect(bx, by, bw, bh);
  if (bw < 10 * unit) { ctx.beginPath(); ctx.arc(bx + bw / 2, by + bh / 2, 9 * unit, 0, Math.PI * 2); ctx.stroke(); }
  if (s.cross) { const cp = to(c); ctx.strokeStyle = s.box || '#e8553b'; ctx.lineWidth = 1 * unit; ctx.setLineDash([3 * unit, 3 * unit]); ctx.beginPath(); ctx.moveTo(x, y + cp[1]); ctx.lineTo(x + W, y + cp[1]); ctx.moveTo(x + cp[0], y); ctx.lineTo(x + cp[0], y + Hh); ctx.stroke(); ctx.setLineDash([]); }
  ctx.restore();
  ctx.beginPath();
  if (s.shape === 'circle') ctx.arc(x + W / 2, y + Hh / 2, Math.min(W, Hh) / 2, 0, Math.PI * 2); else ctx.rect(x, y, W, Hh);
  ctx.strokeStyle = s.border || '#ffffff'; ctx.lineWidth = 2.5 * unit; ctx.stroke();
  if (s.title) { ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4 * unit; ctx.font = `700 ${12 * unit}px ${UI}`; ctx.textAlign = s.shape === 'circle' ? 'center' : 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(s.title, s.shape === 'circle' ? x + W / 2 : x, y - 4 * unit); }
  ctx.restore();
  void merc;
}
