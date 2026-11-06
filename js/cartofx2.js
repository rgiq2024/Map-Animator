// More documentary looks: photo pins, leader-line callouts, distance spokes, runway lights, fire plumes,
// missile trails, coloured regions / choropleths (OSM admin areas or countries), earthquake / event timelines,
// ripple rings and big curved arrows.
import { placeAt } from './place.js';
import { imageFor } from './geoimage.js';
import { H, countriesByName } from './cartofx.js';

const { clamp, easeOut, ease, D2R, UI, hexA, hashStr, rng, rr, haversine, prog, parseLL, polysOf, linesOf, bboxOf, labelPoint, pathPolys, off, track, shade, drawSymbol, silhouette } = H;
const SERIF = '"Cinzel","Times New Roman",Georgia,serif';
const COND = '"Oswald","Bebas Neue","Arial Narrow",sans-serif';
const lines = (txt) => String(txt || '').split('\n').map((l) => l.split('|').map((v) => v.trim())).filter((r) => r[0]);
const tok = (s, ll) => String(s || '').replace(/\{lat\}/g, ll ? `${ll[1].toFixed(5)}` : '').replace(/\{lon\}/g, ll ? `${ll[0].toFixed(5)}` : '');

// ---------------------------------------------------------------- little vector icons (24 × 24)
function glyph(ctx, kind, x, y, s, col) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 24, s / 24); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const P = (pts) => { ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.fill(); };
  switch (kind) {
    case 'home': P([[12, 3], [22, 12], [19, 12], [19, 21], [14, 21], [14, 15], [10, 15], [10, 21], [5, 21], [5, 12], [2, 12]]); break;
    case 'beach': ctx.beginPath(); ctx.arc(12, 11, 9, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(12, 11); ctx.lineTo(16, 22); ctx.stroke(); ctx.fillRect(3, 21, 18, 2); break;
    case 'school': P([[12, 2], [22, 8], [2, 8]]); ctx.fillRect(4, 9, 3, 10); ctx.fillRect(10.5, 9, 3, 10); ctx.fillRect(17, 9, 3, 10); ctx.fillRect(2, 19, 20, 3); break;
    case 'hospital': ctx.fillRect(4, 3, 16, 19); ctx.fillStyle = '#fff'; ctx.fillRect(10.5, 6, 3, 9); ctx.fillRect(7.5, 9, 9, 3); ctx.fillRect(10, 17, 4, 5); break;
    case 'police': ctx.fillRect(3, 6, 18, 16); ctx.fillStyle = '#fff'; ctx.font = 'bold 5px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('POLICE', 12, 11); ctx.fillRect(6, 13, 3, 3); ctx.fillRect(10.5, 13, 3, 3); ctx.fillRect(15, 13, 3, 3); ctx.fillStyle = col; P([[3, 6], [12, 1], [21, 6]]); break;
    case 'shop': ctx.fillRect(4, 9, 16, 12); P([[3, 9], [5, 3], [19, 3], [21, 9]]); break;
    case 'airport': P([[12, 2], [14, 9], [22, 13], [22, 15], [14, 13], [14, 19], [17, 21], [17, 22], [12, 21], [7, 22], [7, 21], [10, 19], [10, 13], [2, 15], [2, 13], [10, 9]]); break;
    case 'factory': P([[2, 22], [2, 10], [8, 14], [8, 10], [14, 14], [14, 4], [18, 4], [18, 14], [22, 14], [22, 22]]); break;
    case 'nuclear': drawSymbol(ctx, 'nuclear', 12, 12, 9, '#f5c518', false, 0.4); break;
    case 'star': ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 4.5 : 10; ctx.lineTo(12 + Math.cos(a) * r, 12 + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); break;
    default: ctx.beginPath(); ctx.arc(12, 9, 6, 0, 7); ctx.fill(); P([[6, 11], [18, 11], [12, 22]]);
  }
  ctx.restore();
}
export const GLYPHS = { home: 'Home', beach: 'Beach', school: 'School', hospital: 'Hospital', police: 'Police', shop: 'Shop', airport: 'Airport', factory: 'Factory', nuclear: 'Nuclear site', star: 'Star', pin: 'Pin' };

// ---------------------------------------------------------------- registry
export const CF2_KINDS = {
  photopin: { name: 'Photo pin', icon: '📍', geom: 'point', desc: 'A round photo in a coloured map pin with a distance chip (e.g. “3.5 km”)' },
  leader: { name: 'Leader-line label', icon: '⌐', geom: 'point', desc: 'A label on a leader line: white box, sci-fi underline with coordinates, big serif title with an elbow line, black tag or pill' },
  spokes: { name: 'Distance spokes', icon: '✳', geom: 'point', desc: 'Coloured lines from a home / base to nearby places, each with an icon card and the distance' },
  lights: { name: 'Runway lights', icon: '∴', geom: 'line', desc: 'Twinkling or chasing lights along a runway, road or border' },
  fireplume: { name: 'Fire plume', icon: '🔥', geom: 'point', desc: 'Animated flames and smoke rising from a site, on a ringed marker' },
  missiles: { name: 'Missile trails', icon: '☄', geom: 'line', desc: 'Glowing missiles with wavy smoke trails from the launch site to the target, with an explosion on impact' },
  regions: { name: 'Coloured regions / choropleth', icon: '▤', geom: null, desc: 'States, districts or countries each in its own colour with names — or coloured by your values with a legend' },
  quakes: { name: 'Event timeline (earthquakes)', icon: '◉', geom: null, desc: 'Dots sized by magnitude appearing day by day with a timeline — your list or live USGS earthquakes' },
  ripples: { name: 'Ripple rings', icon: '◎', geom: null, desc: 'Sonar-like rings pulsing at places (ports, sites, alerts)' },
  bigarrow: { name: 'Big curved arrow', icon: '➶', geom: 'line', desc: 'A thick smooth arrow with a shadow that grows along the path — attacks, migrations, shipping' },
};
export const CF2_ANIMS = {
  photopin: { pop: 'Pop up', none: 'Shown' },
  leader: { draw: 'Line draws, then the text', fade: 'Fade in', none: 'Shown' },
  spokes: { grow: 'Lines grow one by one', fade: 'Fade in', none: 'Shown' },
  lights: { chase: 'Chasing (runway approach)', twinkle: 'Twinkle', on: 'Switch on one by one', none: 'Steady' },
  fireplume: { burn: 'Burning', none: 'Marker only' },
  missiles: { fly: 'Fly and explode', none: 'Trails only' },
  regions: { cascade: 'Regions colour in one by one', fade: 'Fade in', none: 'Shown' },
  quakes: { timeline: 'Day by day', none: 'All shown' },
  ripples: { pulse: 'Pulse', none: 'Still' },
  bigarrow: { grow: 'Grows along the path', none: 'Shown' },
};
export const CF2_DEFAULTS = {
  photopin: { anim: 'pop', duration: 0.7, style: { media: '', color: '#22c493', label: '3.5 Km', size: 1, dot: false } },
  leader: { anim: 'draw', duration: 1.2, style: { look: 'box', text: 'Natanz', sub: '', dx: 120, dy: -90, color: '#ffffff', size: 1 } },
  spokes: { anim: 'grow', duration: 4, style: {
    home: 'Your Future Home', homeColor: '#1e6b4a', units: 'mi', size: 1,
    pois: 'Punalau Beach | -156.65, 21.02 | beach | #a8862a\nKasiiso Secondary School | -156.70, 20.98 | school | #1d6fa5\nMaui Urgent Care Center | -156.66, 20.93 | hospital | #3f9b3a\nMaui Police Department | -156.68, 20.89 | police | #c8501e',
  } },
  lights: { anim: 'chase', duration: 3, style: { color: '#fff7d6', spacing: 1, size: 1, rows: 'pairs', width: 22, speed: 1, glow: true } },
  fireplume: { anim: 'burn', duration: 6, style: { size: 1, ring: true, icon: 'nuclear', ringColor: '#f5a623', smoke: true } },
  missiles: { anim: 'fly', duration: 4, style: { count: 3, color: '#ffd23c', spread: 1, wiggle: 1, size: 1, explode: true, head: '#ffffff' } },
  regions: { anim: 'cascade', duration: 3, style: {
    source: 'osm', area: 'Manipur', level: 5, countries: 'Germany, France, Poland, Italy, Spain', mode: 'categorical', palette: 'vivid',
    values: '', classes: '0 | #a59b4a | 0 - <35\n35 | #ff8c2a | ≥35 - <50\n50 | #e0154b | ≥50 - 300', legendTitle: 'COVID-19', legendSub: 'cases7 per 100k', legendDate: '27.10.2020',
    labels: true, labelSize: 1, outline: '#ffffff', outlineWidth: 1, opacity: 0.85, blend: 'normal', relief: 0.35, legend: true,
  } },
  quakes: { anim: 'timeline', duration: 10, style: {
    source: 'list', events: '2023-03-30 | 142.2, 37.9 | 5.1\n2023-03-31 | 141.6, 36.4 | 4.6\n2023-04-01 | 128.1, 39.2 | 4.8\n2023-04-02 | 147.1, 41.8 | 5.4\n2023-04-03 | 112.3, 26.1 | 5.8\n2023-04-04 | 135.6, 33.6 | 4.9\n2023-04-05 | 160.2, 38.7 | 5.0\n2023-04-06 | 140.2, 36.0 | 6.1 | Ibaraki',
    color: 'ramp', size: 1, timeline: true, labelNewest: true, keep: true,
  } },
  ripples: { anim: 'pulse', duration: 4, style: { places: '10.2, 54.4\n12.6, 55.6\n11.0, 53.8', color: '#ffe34d', rings: 3, size: 1, speed: 1, dot: true } },
  bigarrow: { anim: 'grow', duration: 2.4, style: { color: '#ffffff', width: 1, shadow: true, outline: false, head: 1, taper: true } },
};
const PALETTES = {
  vivid: ['#2e8b3a', '#7ab648', '#3a7bd5', '#9fc4e8', '#b57edc', '#e07a3f', '#c2185b', '#2a9d8f', '#e9c46a', '#5c6bc0', '#8d6e63', '#26a69a'],
  pastel: ['#a8d5ba', '#f6c6a8', '#b5c7ed', '#f3e9a6', '#d7b9e5', '#f4a7b9', '#a9e0e3', '#cfd8a0'],
  earth: ['#8a9a5b', '#c2a878', '#6b8e7f', '#b07d62', '#9c8f5b', '#7a6f4f', '#a3b18a', '#d4a373'],
  reds: ['#7f0000', '#b30000', '#d7301f', '#ef6548', '#fc8d59', '#fdbb84'],
};
export const CF2_FORMS = {
  photopin: [['style.media', 'Photo', 'image'], ['style.label', 'Chip text (e.g. 3.5 Km — empty = none)', 'text'], ['style.color', 'Ring colour', 'color'], ['style.size', 'Size', 'range', [0.4, 3, 0.05]], ['style.dot', 'Glowing dot at the place', 'switch']],
  leader: [
    ['style.look', 'Look', 'select', { box: 'White box (Fordo / Natanz)', hud: 'Sci-fi underline + coordinates (Bolivia)', elbow: 'Big serif title on an elbow line (Japan)', tag: 'Black tag (Venezuela)', pill: 'Rounded pill (Kalamunda)', slant: 'Tilted white board (Afghanistan)' }],
    ['style.text', 'Text', 'text'], ['style.sub', 'Second line ({lat} {lon} = coordinates)', 'text'],
    ['style.dx', 'Label offset right', 'range', [-600, 600, 1]], ['style.dy', 'Label offset down', 'range', [-500, 500, 1]],
    ['style.color', 'Line / accent colour', 'color'], ['style.size', 'Size', 'range', [0.4, 3, 0.05]],
  ],
  spokes: [
    ['style.home', 'Home label', 'text'], ['style.homeColor', 'Home card colour', 'color'],
    ['style.pois', 'Places — “Name | longitude, latitude | icon | colour” (icons: home beach school hospital police shop airport factory nuclear star pin)', 'cities', 'pois'],
    ['style.units', 'Distance in', 'select', { mi: 'miles', km: 'km' }], ['style.size', 'Card size', 'range', [0.5, 2.5, 0.05]],
  ],
  lights: [
    ['style.rows', 'Lights', 'select', { single: 'One row', pairs: 'Two rows (runway edges)', center: 'Two rows + centre line' }], ['style.width', 'Runway width (px)', 'range', [4, 80, 1], (L) => L.style.rows !== 'single'],
    ['style.spacing', 'Spacing', 'range', [0.3, 4, 0.05]], ['style.size', 'Light size', 'range', [0.3, 3, 0.05]], ['style.color', 'Colour', 'color'], ['style.speed', 'Speed', 'range', [0.1, 4, 0.05]], ['style.glow', 'Glow', 'switch'],
  ],
  fireplume: [['style.size', 'Size', 'range', [0.3, 4, 0.05]], ['style.ring', 'Ringed marker', 'switch'], ['style.icon', 'Marker icon', 'select', { nuclear: 'Nuclear', factory: 'Factory', none: 'None' }, (L) => L.style.ring !== false], ['style.ringColor', 'Ring colour', 'color', null, (L) => L.style.ring !== false], ['style.smoke', 'Smoke', 'switch']],
  missiles: [['style.count', 'Missiles', 'range', [1, 12, 1]], ['style.spread', 'Spread', 'range', [0, 4, 0.05]], ['style.wiggle', 'Wavy trail', 'range', [0, 3, 0.05]], ['style.color', 'Trail colour', 'color'], ['style.size', 'Size', 'range', [0.3, 3, 0.05]], ['style.explode', 'Explosion on impact', 'switch']],
  regions: [
    ['style.source', 'Regions', 'select', { osm: 'States / districts of a place (OpenStreetMap)', countries: 'Countries' }],
    ['style.area', 'Place (e.g. Manipur, Germany, Texas)', 'text', null, (L) => L.style.source !== 'countries'],
    ['style.level', 'Level', 'select', { 4: 'States / provinces (4)', 5: 'Districts / regions (5)', 6: 'Counties / districts (6)', 7: 'Municipalities (7)', 8: 'Towns (8)' }, (L) => L.style.source !== 'countries'],
    ['style.countries', 'Countries', 'countries', null, (L) => L.style.source === 'countries'],
    ['style.mode', 'Colours', 'select', { categorical: 'Each region its own colour (Manipur)', classes: 'By your values, with a legend (COVID map)' }],
    ['style.palette', 'Palette', 'select', { vivid: 'Vivid', pastel: 'Pastel', earth: 'Earth', reds: 'Reds' }, (L) => L.style.mode !== 'classes'],
    ['style.values', 'Values — “Region name | number”, one per line', 'textarea', null, (L) => L.style.mode === 'classes'],
    ['style.classes', 'Classes — “from | colour | legend text”', 'textarea', null, (L) => L.style.mode === 'classes'],
    ['style.legend', 'Legend', 'switch', null, (L) => L.style.mode === 'classes'], ['style.legendTitle', 'Legend title', 'text', null, (L) => L.style.mode === 'classes' && L.style.legend !== false],
    ['style.legendSub', 'Legend subtitle', 'text', null, (L) => L.style.mode === 'classes' && L.style.legend !== false], ['style.legendDate', 'Legend date', 'text', null, (L) => L.style.mode === 'classes' && L.style.legend !== false],
    ['style.opacity', 'Fill strength', 'range', [0.1, 1, 0.02]], ['style.blend', 'Blend', 'select', { normal: 'Normal', multiply: 'Multiply (relief shows)' }],
    ['style.labels', 'Names', 'switch'], ['style.labelSize', 'Name size', 'range', [0.4, 2.5, 0.05], (L) => L.style.labels !== false],
    ['style.outline', 'Border colour', 'color'], ['style.outlineWidth', 'Border width', 'range', [0, 4, 0.1]],
  ],
  quakes: [
    ['style.source', 'Events', 'select', { list: 'My list', usgs: 'Live: USGS earthquakes, past 30 days (M4.5+)', usgsweek: 'Live: USGS earthquakes, past 7 days (M2.5+)' }],
    ['style.events', 'Events — “date | longitude, latitude | magnitude | name (optional)”', 'textarea', null, (L) => L.style.source === 'list'],
    ['style.color', 'Colours', 'select', { ramp: 'By magnitude (green → yellow → red)', green: 'Green', blue: 'Blue', red: 'Red' }], ['style.size', 'Dot size', 'range', [0.3, 3, 0.05]],
    ['style.timeline', 'Timeline bar with dates', 'switch'], ['style.labelNewest', 'Highlight the newest event', 'switch'], ['style.keep', 'Keep earlier events', 'switch'],
  ],
  ripples: [['style.places', 'Places — “longitude, latitude”, one per line', 'cities', 'coords'], ['style.color', 'Colour', 'color'], ['style.rings', 'Rings', 'range', [1, 6, 1]], ['style.size', 'Size', 'range', [0.3, 4, 0.05]], ['style.speed', 'Speed', 'range', [0.2, 4, 0.05]], ['style.dot', 'Centre dot', 'switch']],
  bigarrow: [['style.color', 'Colour', 'color'], ['style.width', 'Width', 'range', [0.3, 4, 0.05]], ['style.head', 'Head size', 'range', [0.4, 3, 0.05]], ['style.taper', 'Thin at the start', 'switch'], ['style.shadow', 'Shadow', 'switch'], ['style.outline', 'Dark outline', 'switch']],
};
export const CF2_SET = new Set(Object.keys(CF2_KINDS));
export function cf2Phases(k) { return { regions: ['below', 'above', 'captions'], quakes: ['above', 'captions'], leader: ['above'], spokes: ['above'] }[k] || ['above']; }

// ================================================================= photo pin
function drawPhotoPin(ctx, L, tm, o) {
  const s = L.style, unit = o.unit;
  if (L.geom?.type !== 'Point') return;
  const [x, y] = o.proj(L.geom.coordinates);
  const u = prog(L, tm), k = tm.edit || L.anim === 'none' ? 1 : (() => { const a = clamp(u, 0, 1); return easeOut(a) * (1 + 0.2 * Math.sin(a * Math.PI)); })();
  const R = 34 * unit * (+s.size || 1);
  const col = s.color || '#22c493';
  ctx.save(); ctx.globalAlpha *= tm.alpha;
  if (s.dot) { const g = ctx.createRadialGradient(x, y, 0, x, y, 22 * unit); g.addColorStop(0, hexA(col, 0.55)); g.addColorStop(1, hexA(col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 22 * unit, 0, 7); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 9 * unit, 0, 7); ctx.fill(); }
  ctx.translate(x, y); ctx.scale(k, k);
  const cy = -R * 1.45;
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10 * unit; ctx.shadowOffsetY = 3 * unit;
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(0, cy, R * 1.12, Math.PI * 0.62, Math.PI * 2.38); ctx.lineTo(0, -3 * unit); ctx.closePath(); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.save(); ctx.beginPath(); ctx.arc(0, cy, R * 0.9, 0, 7); ctx.clip();
  const im = s.media && imageFor(s.media);
  if (im?.ready) { const sc = Math.max((R * 1.8) / im.w, (R * 1.8) / im.h); ctx.drawImage(im.bmp, -(im.w * sc) / 2, cy - (im.h * sc) / 2, im.w * sc, im.h * sc); }
  else { const g = ctx.createLinearGradient(0, cy - R, 0, cy + R); g.addColorStop(0, '#7fb6d9'); g.addColorStop(0.55, '#a7c98d'); g.addColorStop(1, '#4d7a3a'); ctx.fillStyle = g; ctx.fillRect(-R, cy - R, R * 2, R * 2); }
  ctx.restore();
  if (s.label) {
    ctx.font = `600 ${10 * unit * (+s.size || 1)}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(s.label).width + 12 * unit, th = 16 * unit;
    const lx = R * 0.25, ly = cy + R * 0.55;
    ctx.fillStyle = '#fff'; rr(ctx, lx - tw / 2, ly - th / 2, tw, th, th / 2); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.8 * unit; ctx.stroke();
    ctx.fillStyle = '#222'; ctx.fillText(s.label, lx, ly + 0.5 * unit);
  }
  ctx.restore();
}

// ================================================================= leader-line label
function drawLeader(ctx, L, tm, o) {
  const s = L.style, unit = o.unit;
  if (L.geom?.type !== 'Point') return;
  const ll = L.geom.coordinates, [x, y] = o.proj(ll);
  const u = prog(L, tm);
  const kl = tm.edit || L.anim === 'none' ? 1 : L.anim === 'fade' ? 1 : clamp(u / 0.5, 0, 1);
  const kt = tm.edit || L.anim === 'none' ? 1 : L.anim === 'fade' ? u : clamp((u - 0.45) / 0.55, 0, 1);
  const sz = +s.size || 1, col = s.color || '#ffffff';
  const tx = x + (+s.dx || 0) * unit, ty = y + (+s.dy || 0) * unit;
  const text = s.text || '', sub = tok(s.sub, ll);
  ctx.save(); ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !tm.edit ? u : 1);
  ctx.strokeStyle = col; ctx.lineWidth = 1.4 * unit; ctx.lineCap = 'round';
  const look = s.look || 'box';
  const line = (pts) => { // draws a polyline partially
    let total = 0; for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let left = total * kl;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length && left > 0; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); const f = Math.min(1, left / (d || 1)); ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f); left -= d; }
    ctx.stroke();
  };
  if (look === 'hud') {
    const fs = 20 * unit * sz;
    ctx.font = `400 ${fs}px ${UI}`;
    const tw = ctx.measureText(text).width;
    const right = tx >= x;
    const ex = right ? tx + tw + 6 * unit : tx - tw - 6 * unit;
    ctx.shadowColor = hexA(col, 0.8); ctx.shadowBlur = 6 * unit;
    line([[x, y], [tx, ty], [ex, ty]]);
    ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.strokeStyle = col; ctx.lineWidth = 1.2 * unit; ctx.beginPath(); ctx.arc(x, y, 3.5 * unit, 0, 7); ctx.stroke();
    if (kt > 0) {
      ctx.globalAlpha *= kt; ctx.fillStyle = col; ctx.textBaseline = 'bottom'; ctx.textAlign = right ? 'left' : 'right';
      ctx.fillText(text.slice(0, Math.ceil(text.length * kt)), right ? tx + 3 * unit : tx - 3 * unit, ty - 3 * unit);
      if (sub) { ctx.font = `400 ${7 * unit * sz}px ${UI}`; ctx.textBaseline = 'top'; ctx.fillText(sub, right ? tx + 3 * unit : tx - 3 * unit, ty + 4 * unit); }
    }
  } else if (look === 'elbow') {
    const fs = 44 * unit * sz;
    ctx.font = `500 ${fs}px ${SERIF}`;
    const tw = ctx.measureText(text).width;
    ctx.shadowColor = 'rgba(255,255,255,0.7)'; ctx.shadowBlur = 8 * unit;
    ctx.lineWidth = 2.2 * unit;
    ctx.fillStyle = '#ffeb3b'; ctx.beginPath(); ctx.arc(x, y, 7 * unit, 0, 7); ctx.fill();
    line([[x, y], [x, ty], [tx - tw / 2 - 6 * unit, ty]]);
    if (kt > 0) { ctx.globalAlpha *= kt; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(text, tx, ty - 6 * unit); }
  } else {
    // box / tag / pill / slant: a straight leader then a card
    if (look !== 'pill') { line([[x, y], [tx, ty]]); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 2.6 * unit, 0, 7); ctx.fill(); }
    if (kt > 0) {
      ctx.globalAlpha *= kt;
      const fs = (look === 'pill' ? 16 : look === 'tag' ? 15 : 18) * unit * sz;
      ctx.font = `${look === 'tag' || look === 'slant' ? 800 : 600} ${fs}px ${UI}`;
      const tw = ctx.measureText(text).width;
      ctx.font = `500 ${fs * 0.55}px ${UI}`;
      const sw = sub ? ctx.measureText(sub).width : 0;
      const W = Math.max(tw, sw) + (look === 'pill' ? 34 : 24) * unit, Hh = fs * (sub ? 2.1 : 1.6);
      const bx = tx - (tx < x ? W : 0), by = ty - Hh / 2;
      ctx.save();
      if (look === 'slant') { ctx.translate(tx, ty); ctx.rotate(-0.18); ctx.translate(-tx, -ty); }
      ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 8 * unit; ctx.shadowOffsetY = 2 * unit;
      const bg = look === 'tag' ? '#121212' : look === 'pill' ? 'rgba(42,52,72,0.92)' : '#ffffff';
      ctx.fillStyle = bg;
      rr(ctx, bx, by, W, Hh, look === 'pill' ? Hh / 2 : look === 'tag' ? 4 * unit : 1.5 * unit); ctx.fill();
      ctx.shadowColor = 'transparent';
      if (look === 'slant') { ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5 * unit; ctx.strokeRect(bx + 3 * unit, by + 3 * unit, W - 6 * unit, Hh - 6 * unit); }
      if (look === 'tag') { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.moveTo(bx + 6 * unit, by + Hh); ctx.lineTo(bx + W + 10 * unit, by + Hh + 8 * unit); ctx.lineTo(bx + W, by + Hh); ctx.fill(); }
      const fg = look === 'tag' || look === 'pill' ? '#ffffff' : '#111111';
      ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${look === 'tag' || look === 'slant' ? 800 : 600} ${fs}px ${UI}`;
      ctx.fillText(text, bx + W / 2, by + (sub ? Hh * 0.38 : Hh / 2) + 0.5 * unit);
      if (sub) { ctx.font = `500 ${fs * 0.55}px ${UI}`; ctx.fillStyle = look === 'tag' ? 'rgba(255,255,255,0.8)' : '#444'; ctx.fillText(sub, bx + W / 2, by + Hh * 0.74); }
      ctx.restore();
    }
  }
  ctx.restore();
}

// ================================================================= distance spokes
function drawSpokes(ctx, L, tm, o) {
  const s = L.style, unit = o.unit;
  if (L.geom?.type !== 'Point') return;
  const home = L.geom.coordinates, h = o.proj(home);
  const pois = lines(s.pois).map(([name, c, ic, col]) => ({ name, ll: parseLL(c), ic: ic || 'pin', col: col || '#1d6fa5' })).filter((p) => p.ll);
  const u = prog(L, tm), n = pois.length;
  const sz = +s.size || 1;
  ctx.save(); ctx.globalAlpha *= tm.alpha;
  const card = (x, y, name, dist, col, ic, key) => {
    const fs = 13 * unit * sz;
    ctx.font = `800 ${fs}px ${UI}`;
    const w1 = ctx.measureText(name).width; ctx.font = `700 ${fs * 0.82}px ${UI}`; const w2 = dist ? ctx.measureText(dist).width : 0;
    const W = Math.max(w1, w2) + 22 * unit, Hh = fs * (dist ? 2.5 : 1.8), I = Hh;
    const bx = x - (W + I) / 2, by = y - Hh / 2;
    ctx.save();
    placeAt(ctx, L, o.frame, bx, by, W + I, Hh, { key });
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8 * unit; ctx.shadowOffsetY = 2 * unit;
    ctx.fillStyle = hexA(col, 0.95); rr(ctx, bx + I * 0.8, by, W + I * 0.2, Hh, 3 * unit); ctx.fill();
    ctx.fillStyle = '#fff'; rr(ctx, bx, by - 2 * unit, I, Hh + 4 * unit, 3 * unit); ctx.fill();
    ctx.shadowColor = 'transparent';
    glyph(ctx, ic, bx + I * 0.17, by + Hh / 2 - I * 0.33, I * 0.66, '#222');
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 1 * unit; rr(ctx, bx + I * 0.8, by, W + I * 0.2, Hh, 3 * unit); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${fs}px ${UI}`; ctx.fillText(name, bx + I + W / 2, by + (dist ? Hh * 0.34 : Hh / 2));
    if (dist) { ctx.font = `700 ${fs * 0.82}px ${UI}`; ctx.fillText(dist, bx + I + W / 2, by + Hh * 0.72); }
    ctx.restore();
  };
  pois.forEach((p, i) => {
    const k = tm.edit || L.anim === 'none' ? 1 : L.anim === 'fade' ? u : clamp((u * (n + 0.5) - i) / 1, 0, 1);
    if (k <= 0) return;
    const q = o.proj(p.ll);
    const ex = h[0] + (q[0] - h[0]) * easeOut(k), ey = h[1] + (q[1] - h[1]) * easeOut(k);
    ctx.strokeStyle = hexA(p.col, 0.95); ctx.lineWidth = 3.2 * unit; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(h[0], h[1]); ctx.lineTo(ex, ey); ctx.stroke();
    if (k >= 1) {
      const m = haversine(home, p.ll), dist = s.units === 'km' ? `${(m / 1000).toFixed(1)} km` : `${(m / 1609.344).toFixed(1)} miles`;
      const ang = Math.atan2(q[1] - h[1], q[0] - h[0]);
      const cx = q[0] + Math.cos(ang) * 70 * unit, cy = q[1] + Math.sin(ang) * 50 * unit - 30 * unit;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4 * unit; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(cx, cy); ctx.stroke();
      card(cx, cy, p.name, dist, p.col, p.ic, `poi${i}`);
    }
  });
  // home star + card
  ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 6 * unit;
  ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = (i % 2 ? 4 : 10) * unit; ctx.lineTo(h[0] + Math.cos(a) * r, h[1] + Math.sin(a) * r); } ctx.closePath(); ctx.fill();
  ctx.shadowColor = 'transparent';
  if (s.home) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4 * unit; ctx.beginPath(); ctx.moveTo(h[0], h[1]); ctx.lineTo(h[0], h[1] - 100 * unit); ctx.stroke(); card(h[0], h[1] - 100 * unit, s.home, '', s.homeColor || '#1e6b4a', 'home', 'home'); }
  ctx.restore();
}

// ================================================================= runway lights
function drawLights(ctx, L, tm, o) {
  const s = L.style, unit = o.unit;
  const cs = linesOf(L.geom)[0];
  if (!cs || cs.length < 2) return;
  const pts = cs.map(o.proj);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum.at(-1) || 1, step = 26 * unit * (+s.spacing || 1);
  const n = Math.max(2, Math.floor(total / step));
  const t = o.time || 0, sp = +s.speed || 1;
  const col = s.color || '#fff7d6', r = 2.8 * unit * (+s.size || 1);
  const rowsOff = s.rows === 'single' ? [0] : s.rows === 'center' ? [-1, 0, 1] : [-1, 1];
  const half = ((+s.width || 22) * unit) / 2;
  const u = prog(L, tm);
  ctx.save(); ctx.globalAlpha *= tm.alpha;
  for (let i = 0; i <= n; i++) {
    const d = (i / n) * total;
    let j = 1; while (j < cum.length - 1 && cum[j] < d) j++;
    const f = (d - cum[j - 1]) / Math.max(1e-6, cum[j] - cum[j - 1]);
    const a = pts[j - 1], b = pts[j];
    const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
    let br = 1;
    if (!tm.edit) {
      if (L.anim === 'chase') { const ph = ((i / n) - t * 0.45 * sp) % 1; const q = (ph + 1) % 1; br = 0.35 + 0.65 * Math.max(0, 1 - q * 6); }
      else if (L.anim === 'twinkle') br = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 6 * sp + i * 2.3 + (hashStr(L.id + i) % 7)));
      else if (L.anim === 'on') br = clamp(u * (n + 1) - i, 0, 1);
    }
    for (const ro of rowsOff) {
      const cx = x + nx * half * ro, cy = y + ny * half * ro;
      if (ro === 0 && s.rows === 'center' && i % 2) continue;
      if (s.glow !== false) { const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 4.5); g.addColorStop(0, hexA(col, 0.55 * br)); g.addColorStop(1, hexA(col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 4.5, 0, 7); ctx.fill(); }
      ctx.fillStyle = hexA('#ffffff', Math.min(1, 0.3 + br)); ctx.beginPath(); ctx.arc(cx, cy, r * (0.7 + 0.3 * br), 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}

// ================================================================= fire plume
function drawFirePlume(ctx, L, tm, o) {
  const s = L.style, unit = o.unit;
  if (L.geom?.type !== 'Point') return;
  const [x, y] = o.proj(L.geom.coordinates);
  const S = 1 * unit * (+s.size || 1);
  const t = o.time || 0;
  ctx.save(); ctx.globalAlpha *= tm.alpha;
  if (s.ring !== false) {
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.55);
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8 * S;
    ctx.strokeStyle = s.ringColor || '#f5a623'; ctx.lineWidth = 6 * S; ctx.beginPath(); ctx.arc(0, 0, 24 * S, 0, 7); ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(30,30,30,0.85)'; ctx.beginPath(); ctx.arc(0, 0, 21 * S, 0, 7); ctx.fill();
    if (s.icon !== 'none') { ctx.scale(1, 1 / 0.55); glyph(ctx, s.icon || 'nuclear', -14 * S, -14 * S * 0.55, 28 * S, '#f5c518'); }
    ctx.restore();
  }
  if (L.anim !== 'none' || tm.edit) {
    const r = rng(hashStr(L.id));
    const ph0 = r() * 10;
    // smoke
    if (s.smoke !== false) for (let i = 0; i < 10; i++) {
      const life = 2.6, ph = ((t + ph0 + i * (life / 10)) % life) / life;
      const px = x + Math.sin(i * 3.1 + t * 0.7) * 6 * S + ph * 18 * S, py = y - 40 * S - ph * 110 * S;
      const rad = (10 + ph * 26) * S;
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad); g.addColorStop(0, `rgba(70,64,60,${0.45 * (1 - ph)})`); g.addColorStop(1, 'rgba(70,64,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, rad, 0, 7); ctx.fill();
    }
    // flame tongues
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const life = 0.9 + (i % 5) * 0.12, ph = ((t * 1.3 + ph0 + i * 0.137) % life) / life;
      const spread = (Math.sin(i * 12.9898) * 0.5) * 22 * S * (1 - ph * 0.6);
      const px = x + spread + Math.sin(t * 9 + i) * 3 * S, py = y - 6 * S - ph * 70 * S;
      const rad = (13 - ph * 10) * S * (0.7 + ((i * 7) % 5) / 8);
      const c = ph < 0.3 ? [255, 245, 190] : ph < 0.6 ? [255, 180, 60] : [235, 80, 30];
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad); g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${0.55 * (1 - ph)})`); g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(px, py, rad * 0.7, rad * 1.3, 0, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

// ================================================================= missile trails
function fireball(ctx, x, y, R, k, seed) {
  const r = rng(seed);
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, d = R * k * (0.2 + r() * 0.6), rad = R * (0.3 + r() * 0.35) * (0.5 + k * 0.7);
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.8 - R * k * 0.3;
    const g = ctx.createRadialGradient(px - rad * 0.3, py - rad * 0.3, 0, px, py, rad);
    const hot = 1 - k;
    g.addColorStop(0, `rgba(255,${Math.round(150 + 90 * hot)},${Math.round(60 + 120 * hot)},0.95)`); g.addColorStop(0.55, `rgba(${Math.round(150 + 80 * hot)},${Math.round(60 + 40 * hot)},25,0.9)`); g.addColorStop(1, 'rgba(50,35,25,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, rad, 0, 7); ctx.fill();
  }
}
function drawMissiles(ctx, L, tm, o) {
  const s = L.style, unit = o.unit;
  const cs = linesOf(L.geom)[0];
  if (!cs || cs.length < 2) return;
  const pts = cs.map(o.proj);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum.at(-1) || 1;
  const at = (d) => { d = clamp(d, 0, total); let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const f = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]); const a = pts[i - 1], b = pts[i]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, -(b[1] - a[1]) / len, (b[0] - a[0]) / len]; };
  const n = clamp(Math.round(+s.count || 3), 1, 12), sz = +s.size || 1;
  const D = Math.max(0.5, +L.duration || 4), tau = tm.edit ? D * 0.7 : L.anim === 'none' ? D : tm.tau;
  const col = s.color || '#ffd23c';
  ctx.save(); ctx.globalAlpha *= tm.alpha; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let m = 0; m < n; m++) {
    const delay = (m / n) * D * 0.25, fly = D * 0.6;
    const k = clamp((tau - delay) / fly, 0, 1);
    if (k <= 0) continue;
    const off = (m - (n - 1) / 2) * 16 * unit * (+s.spread || 1);
    const wig = 8 * unit * (+s.wiggle || 1), ph = m * 1.7;
    const head = ease(k) * total;
    const path = [];
    for (let d = 0; d <= head; d += 6 * unit) { const [x, y, nx, ny] = at(d); const taper = Math.sin(Math.PI * (d / total)); const w = Math.sin(d / (40 * unit) + ph) * wig * (0.4 + 0.6 * taper) + Math.sin(d / (13 * unit) + ph * 2) * wig * 0.25; path.push([x + nx * (off * taper + w), y + ny * (off * taper + w)]); }
    const [hx, hy, hnx, hny] = at(head); const tp = Math.sin(Math.PI * (head / total));
    path.push([hx + hnx * off * tp, hy + hny * off * tp]);
    // smoke trail
    ctx.shadowColor = hexA(col, 0.9); ctx.shadowBlur = 8 * unit;
    ctx.strokeStyle = hexA(col, 0.85); ctx.lineWidth = 3 * unit * sz;
    ctx.beginPath(); path.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,230,0.6)'; ctx.lineWidth = 1 * unit * sz; ctx.stroke();
    const [px, py] = path.at(-1);
    if (k < 1) {
      const g = ctx.createRadialGradient(px, py, 0, px, py, 16 * unit * sz); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,250,220,0.8)'); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 16 * unit * sz, 0, 7); ctx.fill();
    } else if (s.explode !== false) {
      const ke = clamp((tau - delay - fly) / 1.4, 0, 1);
      if (ke < 1 || true) fireball(ctx, px, py, 22 * unit * sz, Math.max(0.15, easeOut(ke)), hashStr(L.id) + m);
    }
  }
  ctx.restore();
}

// ================================================================= coloured regions / choropleth (OSM admin areas or countries)
const regionCache = new Map();
function stitchRings(ways) {
  const segs = ways.map((w) => w.slice());
  const rings = [];
  const key = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  while (segs.length) {
    let ring = segs.shift();
    let guard = 0;
    while (key(ring[0]) !== key(ring.at(-1)) && guard++ < 5000) {
      const end = key(ring.at(-1));
      const i = segs.findIndex((s2) => key(s2[0]) === end || key(s2.at(-1)) === end);
      if (i < 0) break;
      const s2 = segs.splice(i, 1)[0];
      ring = ring.concat((key(s2[0]) === end ? s2 : s2.reverse()).slice(1));
    }
    if (ring.length > 3) { if (key(ring[0]) !== key(ring.at(-1))) ring.push(ring[0]); rings.push(ring); }
  }
  return rings;
}
function simplifyRing(r, tol) {
  if (r.length < 50) return r;
  const out = [r[0]];
  for (let i = 1; i < r.length - 1; i++) { const p = out.at(-1); if (Math.abs(r[i][0] - p[0]) + Math.abs(r[i][1] - p[1]) > tol) out.push(r[i]); }
  out.push(r.at(-1));
  return out;
}
function loadOsmRegions(area, level) {
  const k = `osm|${area}|${level}`;
  if (regionCache.has(k)) return regionCache.get(k);
  const v = { ready: false, regions: [], error: '' };
  regionCache.set(k, v);
  const q = `[out:json][timeout:90];area["name"="${String(area).replace(/"/g, '')}"]["boundary"="administrative"]->.a;(rel(area.a)["boundary"="administrative"]["admin_level"="${+level}"];);out geom;`;
  const hosts = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  const run = async () => {
    let j = null;
    for (const h of hosts) { try { const r = await fetch(h, { method: 'POST', body: `data=${encodeURIComponent(q)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }); if (r.ok) { j = await r.json(); break; } } catch { /* next */ } }
    if (!j) { v.error = 'OpenStreetMap did not answer'; return; }
    for (const el of j.elements || []) {
      if (el.type !== 'relation') continue;
      const outer = (el.members || []).filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => m.geometry.map((g) => [g.lon, g.lat]));
      const rings = stitchRings(outer);
      if (!rings.length) continue;
      const [w, s2, e, n] = bboxOf(rings.map((r) => [r]));
      const tol = Math.max(e - w, n - s2) / 900;
      v.regions.push({ name: el.tags?.['name:en'] || el.tags?.name || '', polys: rings.map((r) => [simplifyRing(r, tol)]) });
    }
    if (!v.regions.length) v.error = `No level-${level} areas found inside “${area}”`;
  };
  track(run().finally(() => { v.ready = true; }));
  return v;
}
function regionsOf(L) {
  const s = L.style;
  if (s.source === 'countries') {
    const c = countriesByName(s.countries);
    return c ? { ready: true, regions: c.map((x) => ({ name: x.name, polys: x.polys })) } : { ready: false, regions: [] };
  }
  return loadOsmRegions(s.area || '', s.level || 5);
}
const normName = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
function drawRegions(ctx, L, tm, o, phase) {
  const s = L.style, unit = o.unit, fr = o.frame;
  const R = regionsOf(L);
  if (!R.regions.length) {
    if (phase === 'captions' && fr && tm.edit) { ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `500 ${12 * unit}px ${UI}`; ctx.fillText(R.ready ? (R.error || 'No regions') : 'Loading regions from OpenStreetMap…', fr.x + 20 * unit, fr.y + fr.h - 20 * unit); ctx.restore(); }
    return;
  }
  const u = prog(L, tm), n = R.regions.length;
  const vals = new Map(lines(s.values).map(([nm, v]) => [normName(nm), +v]));
  const classes = lines(s.classes).map(([from, col, label]) => ({ from: +from, col: col || '#888', label: label || from })).sort((a, b) => a.from - b.from);
  const pal = PALETTES[s.palette] || PALETTES.vivid;
  const order = R.regions.map((r, i) => ({ r, i, c: labelPoint(r.polys) || [0, 0] })).sort((a, b) => a.c[0] - b.c[0]);
  const rank = new Map(order.map((x, k) => [x.i, k]));
  const colorOf = (r, i) => {
    if (s.mode === 'classes') { const v = vals.get(normName(r.name)); if (!isFinite(v)) return '#9a9a9a'; let c = classes[0]?.col || '#999'; for (const cl of classes) if (v >= cl.from) c = cl.col; return c; }
    return pal[i % pal.length];
  };
  const kOf = (i) => (tm.edit || L.anim === 'none' ? 1 : L.anim === 'fade' ? u : clamp(u * (n + 3) - rank.get(i) * 1, 0, 1));
  if (phase === 'below') {
    ctx.save(); ctx.globalAlpha *= tm.alpha;
    if (s.blend === 'multiply') ctx.globalCompositeOperation = 'multiply';
    R.regions.forEach((r, i) => { const k = kOf(i); if (k <= 0) return; ctx.globalAlpha = tm.alpha * k * clamp(+s.opacity || 0.85, 0, 1); ctx.fillStyle = colorOf(r, i); ctx.beginPath(); pathPolys(ctx, r.polys, o.proj); ctx.fill('evenodd'); });
    ctx.restore();
  } else if (phase === 'above') {
    ctx.save(); ctx.globalAlpha *= tm.alpha;
    if (+s.outlineWidth > 0) { ctx.strokeStyle = s.outline || '#fff'; ctx.lineWidth = +s.outlineWidth * unit; ctx.lineJoin = 'round'; R.regions.forEach((r, i) => { if (kOf(i) <= 0) return; ctx.beginPath(); pathPolys(ctx, r.polys, o.proj); ctx.stroke(); }); }
    if (s.labels !== false) {
      ctx.font = `800 ${11 * unit * (+s.labelSize || 1)}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      R.regions.forEach((r, i) => {
        const k = kOf(i); if (k < 0.6 || !r.name) return;
        const lp = labelPoint(r.polys); if (!lp) return;
        const q = o.proj(lp);
        ctx.globalAlpha = tm.alpha * clamp((k - 0.6) / 0.4, 0, 1);
        ctx.lineWidth = 3 * unit; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.strokeText(r.name.toUpperCase(), q[0], q[1]);
        ctx.fillStyle = '#fff'; ctx.fillText(r.name.toUpperCase(), q[0], q[1]);
      });
    }
    ctx.restore();
  } else if (phase === 'captions' && fr && s.mode === 'classes' && s.legend !== false && classes.length) {
    const x = fr.x + 40 * unit; let y = fr.y + 40 * unit;
    ctx.save(); placeAt(ctx, L, fr, x, y, 220 * unit, (80 + classes.length * 26) * unit, { key: 'legend' });
    ctx.globalAlpha *= tm.alpha;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (s.legendTitle) { ctx.font = `italic 900 ${20 * unit}px ${UI}`; ctx.fillText(s.legendTitle, x, y); y += 24 * unit; }
    if (s.legendSub) { ctx.font = `italic 400 ${14 * unit}px ${UI}`; ctx.fillText(s.legendSub, x, y); y += 26 * unit; }
    if (s.legendDate) { ctx.font = `800 ${14 * unit}px ${UI}`; ctx.fillText(s.legendDate, x, y); y += 26 * unit; }
    ctx.font = `600 ${14 * unit}px ${UI}`;
    classes.forEach((c) => { const g = ctx.createLinearGradient(x, y, x, y + 18 * unit); g.addColorStop(0, shade(c.col, 0.15)); g.addColorStop(1, shade(c.col, -0.15)); ctx.fillStyle = g; ctx.fillRect(x, y, 10 * unit, 18 * unit); ctx.fillStyle = '#fff'; ctx.fillText(c.label, x + 18 * unit, y + 1 * unit); y += 24 * unit; });
    ctx.restore();
  }
}

// ================================================================= event timeline (earthquakes)
const feeds = new Map();
function usgs(which) {
  if (feeds.has(which)) return feeds.get(which);
  const v = { ready: false, list: [] };
  feeds.set(which, v);
  const url = which === 'usgsweek' ? 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson' : 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson';
  track(fetch(url).then((r) => r.json()).then((j) => {
    v.list = (j.features || []).map((f) => ({ t: f.properties.time, ll: f.geometry.coordinates.slice(0, 2), mag: +f.properties.mag || 0, name: f.properties.place || '' })).sort((a, b) => a.t - b.t);
  }).catch(() => {}).finally(() => { v.ready = true; }));
  return v;
}
function eventsOf(L) {
  const s = L.style;
  if (s.source === 'usgs' || s.source === 'usgsweek') return usgs(s.source).list;
  return lines(s.events).map(([d, c, m, name]) => ({ t: Date.parse(d) || 0, ll: parseLL(c), mag: +m || 4, name: name || '' })).filter((e) => e.ll && e.t).sort((a, b) => a.t - b.t);
}
const magColor = (m, mode) => {
  if (mode === 'green') return '#7ed957'; if (mode === 'blue') return '#4fb3ff'; if (mode === 'red') return '#ff4040';
  const k = clamp((m - 4) / 3, 0, 1);
  const c = k < 0.5 ? [126 + (255 - 126) * k * 2, 217 + (235 - 217) * k * 2, 87 - 40 * k * 2] : [255, 235 - 175 * (k - 0.5) * 2, 47 - 20 * (k - 0.5) * 2];
  return `rgb(${c.map(Math.round).join(',')})`;
};
const fmtDate = (t) => new Date(t).toISOString().slice(0, 10);
function drawQuakes(ctx, L, tm, o, phase) {
  const s = L.style, unit = o.unit, fr = o.frame;
  const ev = eventsOf(L);
  if (!ev.length) return;
  const t0 = ev[0].t, t1 = ev.at(-1).t || t0 + 1;
  const u = tm.edit || L.anim === 'none' ? 1 : prog(L, tm);
  const now = t0 + (t1 - t0) * u;
  const day = 86400000;
  if (phase === 'above') {
    ctx.save(); ctx.globalAlpha *= tm.alpha;
    let newest = null;
    for (const e of ev) {
      if (e.t > now + 1) continue;
      const age = (now - e.t) / day;
      if (s.keep === false && age > 1.5) continue;
      newest = e;
      const q = o.proj(e.ll);
      const r = (3 + Math.max(0, e.mag - 3) * 4.2) * unit * (+s.size || 1);
      const pop = clamp(age / 0.4, 0, 1);
      const col = magColor(e.mag, s.color || 'ramp');
      ctx.globalAlpha = tm.alpha * (s.keep === false ? clamp(1.5 - age, 0, 1) : 1) * 0.92;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(q[0], q[1], r * (0.6 + 0.4 * easeOut(pop)), 0, 7); ctx.fill();
      if (age < 2) { ctx.strokeStyle = hexA('#3a7bff', 0.8 * (1 - age / 2)); ctx.lineWidth = 1.5 * unit; ctx.beginPath(); ctx.arc(q[0], q[1], r * (1.3 + age * 0.8), 0, 7); ctx.stroke(); }
    }
    if (s.labelNewest !== false && newest) {
      const q = o.proj(newest.ll);
      ctx.globalAlpha = tm.alpha;
      const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], 30 * unit); g.addColorStop(0, 'rgba(255,240,60,0.9)'); g.addColorStop(1, 'rgba(255,240,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], 30 * unit, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff53a'; ctx.beginPath(); ctx.arc(q[0], q[1], 9 * unit, 0, 7); ctx.fill();
    }
    ctx.restore();
  } else if (phase === 'captions' && fr && s.timeline !== false) {
    const cx = fr.x + fr.w / 2, y = fr.y + fr.h - 60 * unit;
    ctx.save(); placeAt(ctx, L, fr, cx - 260 * unit, y - 30 * unit, 520 * unit, 60 * unit, { key: 'timeline' });
    ctx.globalAlpha *= tm.alpha;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `400 ${15 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(fmtDate(now - 7 * day > t0 ? now - 7 * day : t0), cx - 190 * unit, y);
    ctx.fillText(fmtDate(t1), cx + 190 * unit, y);
    ctx.fillStyle = '#fff'; ctx.font = `800 ${17 * unit}px ${UI}`; ctx.fillText(fmtDate(now), cx, y);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(cx - 190 * unit, y + 26 * unit, 380 * unit, 5 * unit);
    ctx.fillStyle = '#2f9e3a'; ctx.fillRect(cx - 190 * unit, y + 26 * unit, 380 * unit * u, 5 * unit);
    ctx.restore();
  }
}

// ================================================================= ripple rings
function drawRipples(ctx, L, tm, o) {
  const s = L.style, unit = o.unit;
  const pts = String(s.places || '').split('\n').map((l) => parseLL(l.split('|').find((p) => parseLL(p)) || l)).filter(Boolean);
  const t = o.time || 0, n = clamp(Math.round(+s.rings || 3), 1, 6), R = 34 * unit * (+s.size || 1), col = s.color || '#ffe34d';
  ctx.save(); ctx.globalAlpha *= tm.alpha;
  pts.forEach((ll, i) => {
    const [x, y] = o.proj(ll);
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.62);
    for (let k = 0; k < n; k++) {
      const ph = L.anim === 'none' ? (k + 1) / (n + 0.5) : ((t * 0.45 * (+s.speed || 1) + k / n + i * 0.17) % 1);
      ctx.strokeStyle = hexA(col, (L.anim === 'none' ? 0.9 : 1 - ph) * 0.95); ctx.lineWidth = 3 * unit;
      ctx.beginPath(); ctx.arc(0, 0, R * (0.18 + ph), 0, 7); ctx.stroke();
    }
    if (s.dot !== false) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 5 * unit, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1 * unit; ctx.stroke(); }
    ctx.restore();
  });
  ctx.restore();
}

// ================================================================= big curved arrow
function smooth(pts, seg = 14) {
  if (pts.length < 3) return pts;
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < seg; k++) { const t = k / seg, t2 = t * t, t3 = t2 * t; out.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3), 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]); }
  }
  out.push(pts.at(-1));
  return out;
}
function drawBigArrow(ctx, L, tm, o) {
  const s = L.style, unit = o.unit;
  const cs = linesOf(L.geom)[0];
  if (!cs || cs.length < 2) return;
  let P = smooth(cs.map(o.proj));
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const total = cum.at(-1) || 1;
  const u = tm.edit || L.anim === 'none' ? 1 : easeOut(prog(L, tm));
  const end = total * u;
  const W = 9 * unit * (+s.width || 1), Hd = W * 2.6 * (+s.head || 1);
  // body up to end - head length
  const bodyEnd = Math.max(0, end - Hd * 1.1);
  const left = [], right = [];
  for (let i = 0; i < P.length; i++) {
    if (cum[i] > bodyEnd) break;
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
    const w = W * (s.taper !== false ? 0.25 + 0.75 * (cum[i] / Math.max(1, bodyEnd)) : 1);
    left.push([P[i][0] + nx * w, P[i][1] + ny * w]); right.push([P[i][0] - nx * w, P[i][1] - ny * w]);
  }
  if (left.length < 2) return;
  // head
  let hi = 1; while (hi < P.length - 1 && cum[hi] < end) hi++;
  const f = (end - cum[hi - 1]) / Math.max(1e-6, cum[hi] - cum[hi - 1]);
  const tip = [P[hi - 1][0] + (P[hi][0] - P[hi - 1][0]) * f, P[hi - 1][1] + (P[hi][1] - P[hi - 1][1]) * f];
  const base = P[Math.max(0, left.length - 1)];
  const dx = tip[0] - base[0], dy = tip[1] - base[1], dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl;
  const shape = () => {
    ctx.beginPath();
    left.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.lineTo(base[0] + nx * Hd * 0.75, base[1] + ny * Hd * 0.75);
    ctx.lineTo(tip[0], tip[1]);
    ctx.lineTo(base[0] - nx * Hd * 0.75, base[1] - ny * Hd * 0.75);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
  };
  ctx.save(); ctx.globalAlpha *= tm.alpha; ctx.lineJoin = 'round';
  if (s.shadow !== false) { ctx.save(); ctx.translate(8 * unit, 10 * unit); ctx.filter = `blur(${4 * unit}px)`; shape(); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill(); ctx.restore(); }
  shape(); ctx.fillStyle = s.color || '#ffffff'; ctx.fill();
  if (s.outline) { ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5 * unit; ctx.stroke(); }
  ctx.restore();
}

// ================================================================= dispatcher
export function drawCarto2(ctx, L, tm, o, phase) {
  H.setMap(o.map);
  switch (L.kind) {
    case 'photopin': if (phase === 'above') drawPhotoPin(ctx, L, tm, o); break;
    case 'leader': if (phase === 'above') drawLeader(ctx, L, tm, o); break;
    case 'spokes': if (phase === 'above') drawSpokes(ctx, L, tm, o); break;
    case 'lights': if (phase === 'above') drawLights(ctx, L, tm, o); break;
    case 'fireplume': if (phase === 'above') drawFirePlume(ctx, L, tm, o); break;
    case 'missiles': if (phase === 'above') drawMissiles(ctx, L, tm, o); break;
    case 'regions': drawRegions(ctx, L, tm, o, phase); break;
    case 'quakes': drawQuakes(ctx, L, tm, o, phase); break;
    case 'ripples': if (phase === 'above') drawRipples(ctx, L, tm, o); break;
    case 'bigarrow': if (phase === 'above') drawBigArrow(ctx, L, tm, o); break;
    default: break;
  }
}
