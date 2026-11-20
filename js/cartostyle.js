// Cartography styles: tile surface maps (hexagons, dots, squares, LEGO bricks, cross-stitch in a hoop), a US hex tile
// cartogram with 3D cubes / spheres, glowing points, neon networks, photo viewpoint cones, area emphasis (cut-out,
// inner shadow, raised drop-shadow, frosted circle), a rounded map-tile gallery and small multiples with hatching.
import { H, countryAt, allCountries, countriesByName } from './cartofx.js';
import { placeAt, CUSTOM_POS } from './place.js';
import { parseTable, num, guessField, breaksOf, classOf, rampN, rampAt, fmtNum, CLASSIFY, SCHEME_NAMES, QUAL, QUAL_NAMES, SAMPLE_NAMES, dataOf } from './geodata.js';

const { clamp, easeOut, UI, rr, prog, polysOf, pathPolys, labelPoint, inPolys, drawTiles, haversine, hashStr, rng } = H;
const D2R = Math.PI / 180;
const rgbOf = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; } const r = String(c).match(/[\d.]+/g); return r && r.length >= 3 ? r.slice(0, 3).map(Number) : [200, 200, 200]; };
const rgba = (c, a) => { const [r, g, b] = rgbOf(c); return `rgba(${r},${g},${b},${a})`; };
const shadeC = (c, k) => { const [r, g, b] = rgbOf(c); const f = (v) => Math.round(clamp(k >= 0 ? v + (255 - v) * k : v * (1 + k), 0, 255)); return `rgb(${f(r)},${f(g)},${f(b)})`; };
const ANIM = { grow: 'Grow in', sweep: 'Sweep in from the west', fade: 'Fade in', none: 'Shown' };
const DATA = (samples) => [
  ['style.data', 'Your data — CSV with lat / lon (or country names), GeoJSON, KML or shapefile — empty = the sample', 'datafile'],
  ['style.sample', 'Sample data', 'select', Object.fromEntries(samples.map((k) => [k, SAMPLE_NAMES[k] || k])), (L) => !String(L.style.data || '').trim()],
];
const LEG = [
  ['style.legend', 'Legend', 'switch'],
  ['style.legendTitle', 'Legend title', 'text', null, (L) => L.style.legend !== false],
  ['style.legendPos', 'Legend position', 'select', { 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right', 'top-left': 'Top left', 'top-right': 'Top right', ...CUSTOM_POS }, (L) => L.style.legend !== false],
  ['style.legendTheme', 'Legend look', 'select', { light: 'White card', dark: 'Dark glass', clear: 'No box' }, (L) => L.style.legend !== false],
];
const TITLE = [['style.title', 'Title', 'text'], ['style.subtitle', 'Subtitle / source', 'text'], ['style.titleColor', 'Title colour', 'color', null, (L) => !!(L.style.title || L.style.subtitle)]];

export const CS_KINDS = {
  tilemap: { name: 'Tile surface map', icon: '⬢', geom: null, desc: 'The map as a grid of hexagons, dots, squares, LEGO bricks or cross-stitches — coloured by country values, categories or a surface from your points; numbers in the tiles, an embroidery hoop frame' },
  hexcartogram: { name: 'Hex tile cartogram (US states)', icon: '⬡', geom: null, desc: 'Every US state as an equal hexagon with a 3D cube, glass sphere, circle or bar sized by its value — like the AAA gasoline-price map' },
  glowpoints: { name: 'Glow points', icon: '✺', geom: null, desc: 'Points of light, glass spheres, neon rings or pulsing beacons from your CSV — sized and coloured by value' },
  neonnet: { name: 'Neon network', icon: '🕸', geom: null, desc: 'Glowing routes between places (flights, shipping, links) with neon coastlines, graticule, city rings and a vignette' },
  viewcones: { name: 'Viewpoint cones', icon: '◭', geom: null, desc: 'Photo or camera viewpoints: a dot with a glowing cone pointing the way the photo looks (angle field, 0° = north)' },
  highlight: { name: 'Highlight a country or place', icon: '◎', geom: null, desc: 'A country, or a circle / square around a place, made to stand out: frosted or lighter inside, dimmed outside, raised shadow, inner shadow and a letter-spaced name' },
  cutout: { name: 'Area emphasis', icon: '◰', geom: 'polygon', desc: 'Make an area stand out: dim everything outside, inner shadow, a raised drop-shadow edge, a frosted circle or square, and a letter-spaced name' },
  mapgallery: { name: 'Map tile gallery', icon: '▦', geom: null, desc: 'Two to six rounded map tiles of different places (satellite, terrain, streets) with titles, text and scale — a poster-style comparison' },
  smallmult: { name: 'Small multiples', icon: '▤', geom: null, desc: 'The same countries as several small maps side by side — one per field or per category — with solid or hatched fills and counts' },
};
export const CS_ANIMS = {
  tilemap: { grow: 'Tiles pop in low → high', sweep: 'Sweep in from the west', fade: 'Fade in', none: 'Shown' },
  hexcartogram: { grow: 'Tiles then symbols grow in', sweep: 'Sweep in from the west', fade: 'Fade in', none: 'Shown' },
  glowpoints: { grow: 'Light up one by one', pulse: 'Light up and keep pulsing', fade: 'Fade in', none: 'Shown' },
  neonnet: { draw: 'Routes draw out from the hubs', fade: 'Fade in', none: 'Shown' },
  viewcones: { grow: 'Cones open one by one', fade: 'Fade in', none: 'Shown' },
  cutout: { reveal: 'Outside dims, then the edge and name appear', fade: 'Fade in', none: 'Shown' },
  highlight: { reveal: 'Outside dims, then the edge and name appear', fade: 'Fade in', none: 'Shown' },
  mapgallery: { cascade: 'Tiles rise in one by one', fade: 'Fade in', none: 'Shown' },
  smallmult: { cascade: 'Panels appear one by one', fade: 'Fade in', none: 'Shown' },
};
export const CS_DEFAULTS = {
  tilemap: { data: '', sample: 'world', source: 'countries', field: '', catField: '', colorBy: 'value', shape: 'hex', cellKm: 0, density: 70, gap: 0.08,
    method: 'quantile', classes: 6, scheme: 'YlOrRd', reverse: false, qual: 'Tableau', single: '#3b8f5a', noData: '', ocean: false, oceanColor: '#41618a',
    stroke: '#5b4636', strokeWidth: 0.5, opacity: 1, values: false, valueColor: 'auto', reach: 600, bevel: true, frame: 'none', frameBg: '#c8a27a',
    legend: true, legendTitle: '', legendPos: 'bottom-left', legendTheme: 'light', title: '', subtitle: '', titleColor: '#ffffff' },
  hexcartogram: { data: '', sample: 'usgas', stateField: '', field: '', symbol: 'cube', symColor: '#ffb400', tileStyle: 'glass', tileColor: '#eef0f3', scheme: 'YlOrRd',
    scaleMode: 'range', minSym: 0.12, maxSym: 0.62, labels: 'both', prefix: '$', suffix: '', decimals: 2, tileSize: 1, gap: 0.06, labelColor: '#d99a00', abbrColor: '#b9bec6',
    cx: 0.5, cy: 0.54, shadow: true, title: 'AVERAGE GASOLINE PRICE PER STATE', subtitle: 'per gallon of regular, March 11, 2024  |  Source: AAA', titleColor: '#f2b400', bg: '#ffffff', bgAlpha: 0 },
  glowpoints: { data: '', sample: 'cities', field: '', style: 'glow', color: '#d4ff6a', color2: '#2fd1ff', sizeMode: 'value', size: 8, maxSize: 26, glow: 2.2, additive: true, labels: 'none', labelField: '', labelColor: '#ffffff', textSize: 1, pulseSpeed: 1 },
  neonnet: { data: '', sample: 'cities', routes: 'hubs', hubs: 4, links: 3, color: '#3d7bff', core: '#bfe0ff', width: 1.1, alpha: 0.35, arc: 0.18, glow: 1.6,
    coast: true, coastColor: '#7dff3a', graticule: true, gratColor: '#4fd7ff', gratStep: 20, rings: true, ringColor: '#7fe6ff', bigCities: true, vignette: 0.55, darken: 0.55 },
  viewcones: { data: '', sample: 'views', angleField: '', field: '', color: '#ffffff', dotColor: '#bdf3ff', length: 46, spread: 50, glow: true, labels: 'none', labelField: '', labelColor: '#ffffff', textSize: 1 },
  cutout: { mode: 'polygon', country: '', center: '', radiusKm: 25, outside: 0.55, outsideColor: '#000000', desat: 0.6, inner: 0.65, innerSize: 22, raise: 0, raiseSize: 26,
    edge: '#f3e2b6', edgeWidth: 1.2, frost: 0, frostColor: '#ffffff', name: '', nameSpacing: 1.1, nameSize: 1, nameColor: '#ffffff', namePos: 'center' },
  highlight: { mode: 'circle', country: 'Iceland', center: '', radiusKm: 25, outside: 0, outsideColor: '#000000', desat: 0, inner: 0, innerSize: 22, raise: 0.6, raiseSize: 22,
    edge: '#ffffff', edgeWidth: 0, frost: 0.28, frostColor: '#fff4e0', name: '', nameSpacing: 1.1, nameSize: 1, nameColor: '#ffffff', namePos: 'center' },
  mapgallery: { cols: 2, panels: [], src: 'satellite', corner: 0.12, shadow: true, tilt: 0, text: true, scale: true, bg: '#d9e3ee', bgAlpha: 1, paper: true,
    title: 'Rugged Coastal Frontiers', subtitle: 'Fjords, Islands, and Mountain Shores', titleColor: '#1f3b63', inkColor: '#2c3e57', tileSize: 1 },
  smallmult: { data: '', sample: 'world', fields: '', mode: 'fields', catField: '', field: '', threshold: '', cols: 3, fill: 'solid', color: '#e0262f', color2: '#1f5fbf', base: '#e4e6ea', scheme: 'YlOrRd',
    bbox: '', bg: '#ffffff', bgAlpha: 1, ink: '#2b2f36', title: '', subtitle: '', count: true },
};
export const CS_LAYER_DEFAULTS = Object.fromEntries(Object.keys(CS_KINDS).map((k) => [k, { anim: Object.keys(CS_ANIMS[k])[0], duration: k === 'neonnet' ? 5 : k === 'mapgallery' || k === 'smallmult' ? 3 : 2.5, style: CS_DEFAULTS[k] }]));
const T = (L, k) => L.style[k];
const sh = (k, ...v) => (L) => v.includes(L.style[k]);
export const CS_FORMS = {
  tilemap: [
    ['style.shape', 'Tile shape', 'select', { hex: 'Hexagons', dot: 'Dots (circles)', square: 'Squares', brick: 'LEGO bricks', stitch: 'Cross-stitch', diamond: 'Diamonds' }],
    ['style.source', 'Colour the tiles from', 'select', { countries: 'Country values / categories (your CSV with country names, or the sample)', points: 'A surface from your points (lat / lon + value)', land: 'Just the land (one colour)' }],
    ...DATA(['world', 'temps', 'cities']),
    ['style.colorBy', 'Colour by', 'select', { value: 'A value (classes)', category: 'A category (e.g. continent)', single: 'One colour' }, (L) => L.style.source === 'countries'],
    ['style.field', 'Value field', 'field', 'num', (L) => L.style.source === 'points' || (L.style.source === 'countries' && L.style.colorBy !== 'category' && L.style.colorBy !== 'single')],
    ['style.catField', 'Category field', 'field', 'any', (L) => L.style.source === 'countries' && L.style.colorBy === 'category'],
    ['style.density', 'Tiles across the view (size)', 'range', [12, 220, 1], (L) => !(+L.style.cellKm > 0)],
    ['style.cellKm', 'Fixed tile size in km (0 = from “tiles across”)', 'number'],
    ['style.gap', 'Gap between tiles', 'range', [0, 0.5, 0.01]],
    ['style.method', 'Classification', 'select', CLASSIFY, (L) => L.style.colorBy === 'value' || L.style.source === 'points'],
    ['style.classes', 'Number of classes', 'range', [2, 9, 1], (L) => L.style.colorBy === 'value' || L.style.source === 'points'],
    ['style.scheme', 'Colour scheme', 'select', SCHEME_NAMES, (L) => L.style.colorBy === 'value' || L.style.source === 'points'],
    ['style.reverse', 'Reverse colours', 'switch', null, (L) => L.style.colorBy === 'value' || L.style.source === 'points'],
    ['style.qual', 'Category colours', 'select', QUAL_NAMES, (L) => L.style.colorBy === 'category'],
    ['style.single', 'Tile colour', 'color', null, (L) => L.style.colorBy === 'single' || L.style.source === 'land'],
    ['style.noData', 'Countries without data (empty = leave out)', 'color', null, (L) => L.style.source === 'countries'],
    ['style.reach', 'Points: how far the surface reaches (km)', 'range', [50, 3000, 10], sh('source', 'points')],
    ['style.ocean', 'Also tile the sea', 'switch'],
    ['style.oceanColor', 'Sea tile colour', 'color', null, (L) => !!L.style.ocean],
    ['style.stroke', 'Tile outline colour', 'color'], ['style.strokeWidth', 'Tile outline width', 'range', [0, 3, 0.05]],
    ['style.bevel', '3D bevel / studs (bricks, squares)', 'switch', null, sh('shape', 'brick', 'square', 'hex')],
    ['style.values', 'Numbers in the tiles', 'switch', null, (L) => L.style.colorBy !== 'single' && L.style.source !== 'land'],
    ['style.valueColor', 'Number colour', 'select', { auto: 'Automatic (light / dark)', '#ffffff': 'White', '#000000': 'Black' }, (L) => !!L.style.values],
    ['style.opacity', 'Opacity', 'range', [0.1, 1, 0.02]],
    ['style.frame', 'Frame', 'select', { none: 'None (over the map)', hoop: 'Embroidery hoop on wood', paper: 'Paper card' }],
    ['style.frameBg', 'Wood / paper colour', 'color', null, (L) => L.style.frame !== 'none'],
    ...TITLE, ...LEG,
  ],
  hexcartogram: [
    ...DATA(['usgas']),
    ['', 'Your CSV needs a column with the state code (CA, TX, NY …) or the state name, and a value column.', 'note'],
    ['style.stateField', 'State field', 'field', 'any?'],
    ['style.field', 'Value field', 'field', 'num'],
    ['style.symbol', 'Symbol', 'select', { cube: '3D cube', sphere: 'Glass sphere', circle: 'Circle', bar: 'Bar', hexfill: 'Colour the whole tile', none: 'None (labels only)' }],
    ['style.symColor', 'Symbol colour', 'color', null, (L) => L.style.symbol !== 'hexfill' && L.style.symbol !== 'none'],
    ['style.scheme', 'Tile colours', 'select', SCHEME_NAMES, sh('symbol', 'hexfill')],
    ['style.scaleMode', 'Symbol size', 'select', { range: 'Smallest → biggest value', zero: 'From zero (true proportion)' }],
    ['style.minSym', 'Smallest symbol (of the tile)', 'range', [0.02, 0.6, 0.01]], ['style.maxSym', 'Biggest symbol', 'range', [0.2, 0.95, 0.01]],
    ['style.tileStyle', 'Tile look', 'select', { glass: 'Frosted glass (soft gradient)', flat: 'Flat', outline: 'Outline only' }],
    ['style.tileColor', 'Tile colour', 'color'],
    ['style.labels', 'Labels', 'select', { both: 'State + value', abbr: 'State', value: 'Value', none: 'None' }],
    ['style.prefix', 'Before the value (e.g. $)', 'text'], ['style.suffix', 'After the value (e.g. %)', 'text'], ['style.decimals', 'Decimals', 'range', [0, 3, 1]],
    ['style.labelColor', 'Value colour', 'color'], ['style.abbrColor', 'State code colour', 'color'],
    ['style.tileSize', 'Size', 'range', [0.4, 2, 0.01]], ['style.gap', 'Gap between tiles', 'range', [0, 0.3, 0.01]],
    ['style.cx', 'Position ←→ (or drag it)', 'range', [0, 1, 0.005]], ['style.cy', 'Position ↑↓', 'range', [0, 1, 0.005]],
    ['style.shadow', 'Soft shadows', 'switch'],
    ['style.bg', 'Background', 'color'], ['style.bgAlpha', 'Background opacity (0 = map shows)', 'range', [0, 1, 0.01]],
    ...TITLE,
  ],
  glowpoints: [
    ...DATA(['cities', 'temps']),
    ['style.field', 'Value field (size)', 'field', 'num?'],
    ['style.style', 'Look', 'select', { glow: 'Points of light (soft glow)', sphere: 'Glass spheres', ring: 'Neon rings', beacon: 'Pulsing beacons', star: 'Sparkles' }],
    ['style.color', 'Colour', 'color'], ['style.color2', 'Second colour (sphere / ring)', 'color', null, sh('style', 'sphere', 'ring', 'beacon')],
    ['style.sizeMode', 'Size', 'select', { value: 'By the value field', same: 'All the same' }],
    ['style.size', 'Size (px)', 'range', [2, 40, 0.5]], ['style.maxSize', 'Biggest (px)', 'range', [4, 80, 1], sh('sizeMode', 'value')],
    ['style.glow', 'Glow', 'range', [0, 6, 0.1]], ['style.additive', 'Light adds up where points overlap', 'switch'],
    ['style.pulseSpeed', 'Pulse speed', 'range', [0.2, 4, 0.1], (L) => L.anim === 'pulse' || L.style.style === 'beacon'],
    ['style.labels', 'Labels', 'select', { none: 'None', name: 'Names', value: 'Values', both: 'Name + value' }],
    ['style.labelField', 'Name field', 'field', 'any?', (L) => L.style.labels !== 'none'],
    ['style.labelColor', 'Label colour', 'color', null, (L) => L.style.labels !== 'none'], ['style.textSize', 'Text size', 'range', [0.5, 2.5, 0.05]],
  ],
  neonnet: [
    ...DATA(['cities']),
    ['', 'Routes: a CSV with from_lat, from_lon, to_lat, to_lon (one route per row) — or points, joined automatically.', 'note'],
    ['style.routes', 'Routes', 'select', { hubs: 'Points joined to the biggest hubs', near: 'Each point to its nearest points', file: 'From my CSV (from_lat, from_lon, to_lat, to_lon)' }],
    ['style.hubs', 'Number of hubs', 'range', [1, 20, 1], sh('routes', 'hubs')], ['style.links', 'Links per point', 'range', [1, 12, 1], sh('routes', 'near', 'hubs')],
    ['style.color', 'Route colour', 'color'], ['style.core', 'Bright core colour', 'color'],
    ['style.width', 'Route width', 'range', [0.2, 6, 0.1]], ['style.alpha', 'Route strength', 'range', [0.03, 1, 0.01]],
    ['style.arc', 'Curve', 'range', [0, 0.6, 0.01]], ['style.glow', 'Glow', 'range', [0, 5, 0.1]],
    ['style.coast', 'Neon coastlines and borders', 'switch'], ['style.coastColor', 'Coast colour', 'color', null, (L) => L.style.coast !== false],
    ['style.graticule', 'Graticule', 'switch'], ['style.gratColor', 'Graticule colour', 'color', null, (L) => L.style.graticule !== false], ['style.gratStep', 'Graticule every (°)', 'range', [5, 45, 5], (L) => L.style.graticule !== false],
    ['style.rings', 'City rings', 'switch'], ['style.ringColor', 'Ring colour', 'color', null, (L) => L.style.rings !== false], ['style.bigCities', 'Big hubs as bright discs', 'switch'],
    ['style.darken', 'Darken the map underneath', 'range', [0, 1, 0.01]], ['style.vignette', 'Vignette', 'range', [0, 1, 0.01]],
  ],
  viewcones: [
    ...DATA(['views']),
    ['style.angleField', 'Direction field (degrees, 0 = north)', 'field', 'num?'],
    ['style.field', 'Cone length from a field (optional)', 'field', 'num?'],
    ['style.length', 'Cone length (px)', 'range', [8, 200, 1]], ['style.spread', 'Cone width (°)', 'range', [10, 140, 1]],
    ['style.color', 'Cone colour', 'color'], ['style.dotColor', 'Dot colour', 'color'], ['style.glow', 'Glow', 'switch'],
    ['style.labels', 'Labels', 'select', { none: 'None', name: 'Names' }], ['style.labelField', 'Name field', 'field', 'any?', (L) => L.style.labels !== 'none'],
    ['style.labelColor', 'Label colour', 'color', null, (L) => L.style.labels !== 'none'], ['style.textSize', 'Text size', 'range', [0.5, 2.5, 0.05]],
  ],
  cutout: [
    ['style.mode', 'Area', 'select', { polygon: 'The shape I drew', country: 'A country (by name)', circle: 'A circle around a place', square: 'A square around a place' }],
    ['style.country', 'Country', 'text', null, sh('mode', 'country')],
    ['style.center', 'Place (lat, lon) — empty = the middle of the shape / view', 'text', null, sh('mode', 'circle', 'square')],
    ['style.radiusKm', 'Radius (km)', 'range', [0.2, 1500, 0.1], sh('mode', 'circle', 'square')],
    ['style.outside', 'Dim outside', 'range', [0, 1, 0.01]], ['style.outsideColor', 'Outside colour', 'color'], ['style.desat', 'Outside: wash out the colours', 'range', [0, 1, 0.01]],
    ['style.inner', 'Inner shadow', 'range', [0, 1, 0.01]], ['style.innerSize', 'Inner shadow size (px)', 'range', [2, 80, 1]],
    ['style.raise', 'Raised: drop shadow outside the edge', 'range', [0, 1, 0.01]], ['style.raiseSize', 'Drop shadow size (px)', 'range', [2, 80, 1]],
    ['style.frost', 'Frosted / lighter inside', 'range', [0, 0.8, 0.01]], ['style.frostColor', 'Frost colour', 'color', null, (L) => +L.style.frost > 0],
    ['style.edge', 'Edge colour', 'color'], ['style.edgeWidth', 'Edge width', 'range', [0, 6, 0.1]],
    ['style.name', 'Name (e.g. YELLOWSTONE)', 'text'], ['style.nameSpacing', 'Letter spacing', 'range', [0, 3, 0.05], (L) => !!L.style.name],
    ['style.nameSize', 'Name size', 'range', [0.4, 4, 0.05], (L) => !!L.style.name], ['style.nameColor', 'Name colour', 'color', null, (L) => !!L.style.name],
    ['style.namePos', 'Name position', 'select', { center: 'In the middle', top: 'Near the top', ...CUSTOM_POS }, (L) => !!L.style.name],
  ],
  mapgallery: [
    ['style.panels', 'Map tiles', 'textarea'],
    ['', 'One tile per line: Title | Subtitle | lat, lon | zoom | text. Example: Norwegian Fjords | Ice-sculpted valleys | 61.1, 6.6 | 7 | Western Norway is famous for its deep fjords…', 'note'],
    ['style.cols', 'Columns', 'range', [1, 3, 1]], ['style.src', 'Imagery', 'select', { satellite: 'Satellite', topo: 'Topographic', streets: 'Streets', light: 'Light grey', dark: 'Dark grey' }],
    ['style.tileSize', 'Tile size', 'range', [0.5, 1.5, 0.01]], ['style.corner', 'Rounded corners', 'range', [0, 0.5, 0.01]], ['style.tilt', 'Tilt the tiles (°)', 'range', [0, 40, 1]],
    ['style.shadow', 'Soft shadow', 'switch'], ['style.text', 'Text beside the tiles', 'switch'], ['style.scale', 'Scale under each tile', 'switch'],
    ['style.bg', 'Background', 'color'], ['style.bgAlpha', 'Background opacity', 'range', [0, 1, 0.01]], ['style.paper', 'Paper texture', 'switch'],
    ['style.inkColor', 'Text colour', 'color'], ...TITLE,
  ],
  smallmult: [
    ...DATA(['world']),
    ['style.mode', 'Panels', 'select', { fields: 'One panel per field', category: 'One panel per category', threshold: 'One panel per field — highlight above a value' }],
    ['style.fields', 'Fields (comma-separated, e.g. gdp_per_capita, life_expectancy)', 'fields', 'num', sh('mode', 'fields', 'threshold')],
    ['style.catField', 'Category field', 'field', 'any', sh('mode', 'category')],
    ['style.threshold', 'Highlight countries above (empty = top third)', 'text', null, sh('mode', 'threshold')],
    ['style.cols', 'Columns', 'range', [1, 6, 1]], ['style.fill', 'Fill', 'select', { solid: 'Solid', hatch: 'Hatched lines', dots: 'Dots', mixed: 'Alternate solid / hatched' }],
    ['style.scheme', 'Colour scheme (fields)', 'select', SCHEME_NAMES, sh('mode', 'fields')],
    ['style.color', 'Highlight colour', 'color', null, sh('mode', 'threshold', 'category')], ['style.color2', 'Second colour', 'color', null, sh('mode', 'category')],
    ['style.base', 'Other countries', 'color'], ['style.bbox', 'Area shown (west, south, east, north) — empty = all the data', 'text'], ['style.count', 'Count in each panel', 'switch'],
    ['style.bg', 'Background', 'color'], ['style.bgAlpha', 'Background opacity', 'range', [0, 1, 0.01]], ['style.ink', 'Text colour', 'color'], ...TITLE.slice(0, 2),
  ],
};
CS_FORMS.highlight = CS_FORMS.cutout.map((r) => (r[0] === 'style.mode' ? ['style.mode', 'Area', 'select', { country: 'A country (by name)', circle: 'A circle around a place', square: 'A square around a place' }] : r));
export const CS_SET = new Set(Object.keys(CS_KINDS));
export const csPhases = (k) => (k === 'cutout' || k === 'highlight' || k === 'tilemap' || k === 'neonnet' || k === 'glowpoints' || k === 'viewcones' ? ['below', 'captions'] : ['captions']);

// ================================================================= shared bits
const tables = new Map();
function table(s) {
  const txt = dataOf(s); const k = `${txt.length}|${hashStr(txt.slice(0, 3000))}|${hashStr(txt.slice(-1500))}`;
  let t = tables.get(k); if (!t) { t = parseTable(txt); tables.set(k, t); if (tables.size > 20) tables.delete(tables.keys().next().value); }
  return t;
}
const ptOf = (r) => (r.g?.type === 'Point' ? r.g.coordinates : r.g?.type === 'MultiPoint' ? r.g.coordinates[0] : null);
const normN = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const u01 = (L, tm) => (tm.edit || L.anim === 'none' ? 1 : easeOut(prog(L, tm)));
function legendBox(ctx, L, o, title, rows, grad) {
  const s = L.style; if (s.legend === false || !o.frame) return;
  const fr = o.frame, unit = o.unit, th = s.legendTheme || 'light';
  const pad = 12 * unit, rowH = 19 * unit, fs = 11.5 * unit;
  ctx.save(); ctx.font = `700 ${12.5 * unit}px ${UI}`;
  let w = ctx.measureText(title || '').width; ctx.font = `500 ${fs}px ${UI}`;
  for (const r of rows) w = Math.max(w, 26 * unit + ctx.measureText(r.text).width);
  if (grad) w = Math.max(w, 170 * unit);
  w += pad * 2; const h = pad * 2 + (title ? 20 * unit : 0) + (grad ? 34 * unit : rows.length * rowH);
  const pos = s.legendPos || 'bottom-left', m = 28 * unit;
  const x = /right/.test(pos) ? fr.x + fr.w - m - w : fr.x + m, y = /bottom/.test(pos) ? fr.y + fr.h - m - h : fr.y + m;
  const [dx, dy] = placeAt(ctx, L, fr, x, y, w, h, { key: 'legend' }); void dx; void dy;
  if (th !== 'clear') { ctx.fillStyle = th === 'dark' ? 'rgba(14,18,26,0.85)' : 'rgba(255,255,255,0.95)'; ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 12 * unit; rr(ctx, x, y, w, h, 8 * unit); ctx.fill(); ctx.shadowBlur = 0; }
  const ink = th === 'light' ? '#1b1f27' : '#fff';
  let yy = y + pad;
  if (title) { ctx.font = `700 ${12.5 * unit}px ${UI}`; ctx.fillStyle = ink; ctx.textBaseline = 'top'; ctx.fillText(title, x + pad, yy); yy += 20 * unit; }
  ctx.font = `500 ${fs}px ${UI}`; ctx.textBaseline = 'middle';
  if (grad) {
    const gw = w - pad * 2, g = ctx.createLinearGradient(x + pad, 0, x + pad + gw, 0);
    for (let i = 0; i <= 10; i++) { const c = rampAt(grad.scheme, grad.reverse ? 1 - i / 10 : i / 10); g.addColorStop(i / 10, `rgb(${c[0]},${c[1]},${c[2]})`); }
    ctx.fillStyle = g; ctx.fillRect(x + pad, yy, gw, 10 * unit); ctx.fillStyle = ink; ctx.textBaseline = 'top';
    ctx.textAlign = 'left'; ctx.fillText(grad.lo, x + pad, yy + 14 * unit); ctx.textAlign = 'right'; ctx.fillText(grad.hi, x + pad + gw, yy + 14 * unit); ctx.textAlign = 'left';
  } else for (const r of rows) {
    ctx.fillStyle = r.color; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; rr(ctx, x + pad, yy + 3 * unit, 16 * unit, rowH - 6 * unit, 2 * unit); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ink; ctx.fillText(r.text, x + pad + 24 * unit, yy + rowH / 2); yy += rowH;
  }
  ctx.restore();
}
function titleBlock(ctx, L, o, align = 'left') {
  const s = L.style, fr = o.frame; if (!fr || !(s.title || s.subtitle)) return;
  const u = o.unit; ctx.save();
  const x = align === 'center' ? fr.x + fr.w / 2 : fr.x + 40 * u, y = fr.y + 34 * u;
  const [dx, dy] = placeAt(ctx, L, fr, align === 'center' ? x - 300 * u : x, y, 600 * u, 64 * u, { key: 'title' }); void dx; void dy;
  ctx.textAlign = align; ctx.textBaseline = 'top'; ctx.fillStyle = s.titleColor || '#fff';
  if (s.title) { ctx.font = `600 ${26 * u}px ${UI}`; ctx.fillText(s.title, x, y); }
  if (s.subtitle) { ctx.font = `500 ${13 * u}px ${UI}`; ctx.globalAlpha *= 0.85; ctx.fillText(s.subtitle, x, y + (s.title ? 34 * u : 0)); }
  ctx.restore();
}

// ================================================================= 1 · tile surface map
const cellCache = new Map();
function tileModel(L) {
  const s = L.style, Tb = table(s), src = s.source || 'countries';
  const key = `${dataOf(s).length}|${s.sample}|${src}|${s.field}|${s.catField}|${s.colorBy}|${s.method}|${s.classes}|${s.scheme}|${s.reverse}|${s.qual}`;
  const c = cellCache.get(L.id);
  if (c && c.key === key) return c.M;
  const M = { src, byCountry: new Map(), pts: [], cells: new Map() };
  if (src === 'countries') {
    const nf = guessField(Tb, 'name') || Tb.fields[0];
    const field = s.field || guessField(Tb, 'num'); const cat = s.catField || guessField(Tb, 'cat');
    const vals = [];
    for (const r of Tb.rows) { const n = normN(r.p[nf]); if (!n) continue; const v = num(r.p[field]); M.byCountry.set(n, { v, cat: String(r.p[cat] ?? '') }); if (isFinite(v)) vals.push(v); }
    M.field = field; M.cat = cat; M.vals = vals;
  } else if (src === 'points') {
    const field = s.field || guessField(Tb, 'num');
    for (const r of Tb.rows) { const p = ptOf(r); const v = num(r.p[field]); if (p && isFinite(v)) M.pts.push([p[0], p[1], v]); }
    M.field = field; M.vals = M.pts.map((p) => p[2]);
  }
  if (M.vals?.length) { M.br = breaksOf(M.vals, s.method || 'quantile', +s.classes || 6); M.nc = Math.max(1, M.br.length - 1); M.colors = rampN(s.scheme || 'YlOrRd', M.nc, !!s.reverse); }
  if (src === 'countries' && s.colorBy === 'category') { const pal = QUAL[s.qual] || QUAL.Tableau; M.cats = [...new Set([...M.byCountry.values()].map((x) => x.cat).filter(Boolean))]; M.catColor = new Map(M.cats.map((k, i) => [k, pal[i % pal.length]])); }
  cellCache.set(L.id, { key, M });
  return M;
}
const CNAME = new Map();
function countryName(ll) { const c = countryAt(ll); return c ? c.name : null; }
function idwAt(M, ll, reachKm) {
  let n0 = 0, d0 = 0, near = Infinity;
  for (const p of M.pts) { const d = haversine(ll, p) / 1000; if (d < 0.5) return p[2]; const w = 1 / (d * d); n0 += w * p[2]; d0 += w; if (d < near) near = d; }
  return near > reachKm ? NaN : n0 / d0;
}
function cellInfo(L, M, ll, key) {
  let c = M.cells.get(key);
  if (c) return c;
  const s = L.style;
  c = { land: false, v: NaN, color: null };
  const nm = countryName(ll);
  c.land = !!nm;
  if (M.src === 'points') { c.v = idwAt(M, ll, +s.reach || 600); if (isFinite(c.v)) { const k = classOf(c.v, M.br); c.color = M.colors[Math.max(0, Math.min(M.nc - 1, k))]; } }
  else if (M.src === 'countries' && nm) {
    const d = M.byCountry.get(normN(nm)) || M.byCountry.get(normN(CNAME.get(nm) || ''));
    if (s.colorBy === 'single') c.color = s.single;
    else if (s.colorBy === 'category') c.color = d?.cat ? M.catColor.get(d.cat) : s.noData || null;
    else if (d && isFinite(d.v)) { c.v = d.v; const k = classOf(d.v, M.br); c.color = M.colors[Math.max(0, Math.min(M.nc - 1, k))]; }
    else c.color = s.noData || null;
  } else if (M.src === 'land' && nm) c.color = s.single;
  if (!c.color && s.ocean && !c.land) c.color = s.oceanColor;
  M.cells.set(key, c);
  if (M.cells.size > 120000) M.cells.clear();
  return c;
}
function tileShape(ctx, shape, x, y, r, gap, bevel, color, s, unit) {
  const R = r * (1 - gap);
  ctx.fillStyle = color;
  if (shape === 'dot') { ctx.beginPath(); ctx.arc(x, y, R * 0.92, 0, 7); ctx.fill(); if (bevel) { const g = ctx.createRadialGradient(x - R * 0.35, y - R * 0.35, 0, x, y, R); g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fill(); } }
  else if (shape === 'square' || shape === 'brick') {
    const a = R * 0.95; ctx.beginPath(); rr(ctx, x - a, y - a, a * 2, a * 2, shape === 'brick' ? a * 0.18 : 0); ctx.fillStyle = color; ctx.fill();
    if (bevel) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - a, y - a, a * 2, a * 0.18); ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x - a, y + a * 0.82, a * 2, a * 0.18);
      if (shape === 'brick') { ctx.beginPath(); ctx.arc(x, y, a * 0.52, 0, 7); ctx.fillStyle = shadeC(color, -0.18); ctx.fill(); ctx.beginPath(); ctx.arc(x - a * 0.06, y - a * 0.06, a * 0.46, 0, 7); ctx.fillStyle = shadeC(color, 0.12); ctx.fill(); ctx.beginPath(); ctx.arc(x - a * 0.18, y - a * 0.2, a * 0.14, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill(); }
    }
  } else if (shape === 'stitch') {
    const a = R * 0.78; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, R * 0.42);
    ctx.beginPath(); ctx.moveTo(x - a, y - a); ctx.lineTo(x + a, y + a); ctx.moveTo(x + a, y - a); ctx.lineTo(x - a, y + a); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = Math.max(0.5, R * 0.12); ctx.beginPath(); ctx.moveTo(x - a, y - a); ctx.lineTo(x + a, y + a); ctx.stroke();
  } else if (shape === 'diamond') { ctx.beginPath(); ctx.moveTo(x, y - R); ctx.lineTo(x + R, y); ctx.lineTo(x, y + R); ctx.lineTo(x - R, y); ctx.closePath(); ctx.fill(); }
  else { ctx.beginPath(); for (let k = 0; k < 6; k++) { const an = (60 * k - 30) * D2R; const px = x + R * Math.cos(an), py = y + R * Math.sin(an); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.fill(); if (bevel) { const g = ctx.createLinearGradient(x, y - R, x, y + R); g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0.14)'); ctx.fillStyle = g; ctx.fill(); } }
  if (+s.strokeWidth > 0 && shape !== 'stitch') { ctx.strokeStyle = s.stroke || '#000'; ctx.lineWidth = +s.strokeWidth * unit; ctx.stroke(); }
}
function wood(ctx, x, y, w, h, base, unit) {
  ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
  const R = rng(7);
  for (let i = 0; i < 70; i++) { const yy = y + R() * h; ctx.strokeStyle = `rgba(90,55,25,${0.05 + R() * 0.1})`; ctx.lineWidth = (0.6 + R() * 2.4) * unit; ctx.beginPath(); ctx.moveTo(x, yy); for (let k = 1; k <= 8; k++) ctx.lineTo(x + (w * k) / 8, yy + Math.sin(k + i) * 3 * unit + (R() - 0.5) * 4 * unit); ctx.stroke(); }
}
function drawTileMap(ctx, L, tm, o, phase) {
  const s = L.style, fr = o.frame; if (!fr) return;
  const unit = o.unit, M = tileModel(L), u = u01(L, tm);
  if (!allCountries()) return; // country shapes still loading
  if (phase === 'captions') {
    titleBlock(ctx, L, o);
    if (M.colors && (s.colorBy !== 'category' || s.source === 'points') && s.colorBy !== 'single' && s.source !== 'land') legendBox(ctx, L, o, s.legendTitle || String(M.field || '').replace(/_/g, ' '), M.colors.map((c, i) => ({ color: c, text: `${fmtNum(M.br[i])} – ${fmtNum(M.br[i + 1])}` })));
    else if (s.colorBy === 'category' && M.cats) legendBox(ctx, L, o, s.legendTitle || String(M.cat || '').replace(/_/g, ' '), M.cats.slice(0, 10).map((k) => ({ color: M.catColor.get(k), text: k })));
    return;
  }
  // grid in Web-Mercator, fixed to the ground: cell size from km or "tiles across the view"
  const a = o.proj([0, 0]), b = o.proj([1, 0]); const pxPerDeg = Math.abs(b[0] - a[0]) || 1; // px per degree of longitude
  let cellDeg = +s.cellKm > 0 ? +s.cellKm / 111.32 : null;
  if (!cellDeg) { const want = fr.w / (+s.density || 70) / pxPerDeg; const z = Math.round(Math.log2(want) * 2) / 2; cellDeg = 2 ** z; }
  const rPx = (cellDeg * pxPerDeg) / Math.sqrt(3); // hex circumradius in px
  const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + clamp(lat, -85, 85) * D2R / 2)) / D2R; // in "degrees"
  const imerc = (y) => (2 * Math.atan(Math.exp(y * D2R)) - Math.PI / 2) / D2R;
  // visible bounds: invert proj for the frame corners using two points
  const c = o.proj([0, 0]), dlat = o.proj([0, 10]); const pxPerMerc = (c[1] - dlat[1]) / merc(10) || pxPerDeg;
  const lonAt = (x) => (x - c[0]) / pxPerDeg, myAt = (y) => (c[1] - y) / pxPerMerc;
  const lon0 = lonAt(fr.x) - cellDeg, lon1 = lonAt(fr.x + fr.w) + cellDeg, my0 = myAt(fr.y + fr.h) - cellDeg, my1 = myAt(fr.y) + cellDeg;
  const hex = (s.shape || 'hex') === 'hex';
  const dx = cellDeg, dy = hex ? cellDeg * Math.sqrt(3) / 2 : cellDeg;
  const shape = s.shape || 'hex', gap = clamp(+s.gap || 0, 0, 0.6), bevel = s.bevel !== false;
  const cells = [];
  const j0 = Math.floor(my0 / dy), j1 = Math.ceil(my1 / dy);
  if ((j1 - j0) * ((lon1 - lon0) / dx) > 60000) return; // too many tiles at this zoom
  for (let j = j0; j <= j1; j++) {
    const off = hex && (j & 1) ? dx / 2 : 0, my = j * dy, lat = imerc(my);
    const i0 = Math.floor((lon0 - off) / dx), i1 = Math.ceil((lon1 - off) / dx);
    for (let i = i0; i <= i1; i++) {
      let lon = i * dx + off; const lonN = ((lon + 540) % 360) - 180;
      const info = cellInfo(L, M, [lonN, lat], `${shape === 'hex' ? 'h' : 'g'}${cellDeg}|${i}|${j}`);
      if (!info.color) continue;
      const p = [c[0] + lon * pxPerDeg, c[1] - my * pxPerMerc];
      cells.push({ x: p[0], y: p[1], info });
    }
  }
  const base = tm.alpha * (+s.opacity || 1);
  ctx.save();
  let clipR = 0, cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2;
  if (s.frame === 'hoop' || s.frame === 'paper') {
    // background outside the hoop / card
    ctx.globalAlpha = tm.alpha; wood(ctx, fr.x, fr.y, fr.w, fr.h, s.frame === 'hoop' ? s.frameBg || '#c8a27a' : '#efe9dc', unit);
    clipR = Math.min(fr.w, fr.h) * 0.43;
    if (s.frame === 'hoop') {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 30 * unit; ctx.shadowOffsetY = 12 * unit; ctx.beginPath(); ctx.arc(cx, cy, clipR + 12 * unit, 0, 7); ctx.fillStyle = '#d99a83'; ctx.fill(); ctx.restore();
      ctx.beginPath(); ctx.arc(cx, cy, clipR, 0, 7); ctx.fillStyle = '#ecebe6'; ctx.fill();
      ctx.save(); ctx.clip(); ctx.globalAlpha = tm.alpha * 0.12; ctx.strokeStyle = '#7a7466'; ctx.lineWidth = 0.6 * unit; for (let k = -clipR; k < clipR; k += 4 * unit) { ctx.beginPath(); ctx.moveTo(cx - clipR, cy + k); ctx.lineTo(cx + clipR, cy + k); ctx.moveTo(cx + k, cy - clipR); ctx.lineTo(cx + k, cy + clipR); ctx.stroke(); } ctx.restore();
    } else { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 24 * unit; rr(ctx, fr.x + fr.w * 0.08, fr.y + fr.h * 0.08, fr.w * 0.84, fr.h * 0.84, 10 * unit); ctx.fillStyle = '#fbf8f1'; ctx.fill(); ctx.restore(); }
    ctx.beginPath(); if (s.frame === 'hoop') ctx.arc(cx, cy, clipR, 0, 7); else rr(ctx, fr.x + fr.w * 0.08, fr.y + fr.h * 0.08, fr.w * 0.84, fr.h * 0.84, 10 * unit); ctx.clip();
  }
  const order = cells.map((_, k) => k);
  if (L.anim === 'grow' && u < 1) order.sort((p, q) => (cells[p].info.v || 0) - (cells[q].info.v || 0));
  order.forEach((k, n) => {
    const cl = cells[k];
    let a = 1;
    if (u < 1) { if (L.anim === 'grow') a = clamp((u - (n / order.length) * 0.7) / 0.3, 0, 1); else if (L.anim === 'sweep') a = clamp((u * 1.35 - (cl.x - fr.x) / fr.w) / 0.35, 0, 1); else a = u; }
    if (a <= 0) return;
    ctx.globalAlpha = base * a;
    tileShape(ctx, shape, cl.x, cl.y, rPx * (L.anim === 'grow' ? easeOut(a) : 1), gap, bevel, cl.info.color, s, unit);
    if (s.values && isFinite(cl.info.v) && rPx > 9 * unit) {
      const t = fmtNum(cl.info.v); ctx.font = `700 ${rPx * 0.62}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const [r0, g0, b0] = rgbOf(cl.info.color); const dark = r0 * 0.3 + g0 * 0.59 + b0 * 0.11 < 140;
      ctx.fillStyle = s.valueColor && s.valueColor !== 'auto' ? s.valueColor : dark ? '#ffffff' : '#2a2a2a'; ctx.fillText(t, cl.x, cl.y + 0.5);
    }
  });
  if (s.frame === 'hoop') { ctx.restore(); ctx.save(); ctx.globalAlpha = tm.alpha; ctx.lineWidth = 14 * unit; ctx.strokeStyle = '#e3a48c'; ctx.beginPath(); ctx.arc(cx, cy, clipR + 6 * unit, 0, 7); ctx.stroke(); ctx.lineWidth = 2 * unit; ctx.strokeStyle = 'rgba(120,60,40,0.6)'; ctx.stroke(); ctx.fillStyle = '#b5764f'; rr(ctx, cx - 16 * unit, cy - clipR - 30 * unit, 32 * unit, 22 * unit, 4 * unit); ctx.fill(); }
  ctx.restore();
}

// ================================================================= 2 · hex tile cartogram (US states)
const US = { AK: [130, 100], ME: [1126, 100], VT: [1002, 130], NH: [1085, 130], WA: [298, 245], MT: [380, 245], ND: [463, 245], MN: [546, 245], WI: [629, 245], MI: [795, 245], NY: [960, 245], MA: [1043, 245], RI: [1126, 245],
  ID: [339, 315], WY: [422, 315], SD: [505, 315], IA: [588, 315], IL: [670, 315], IN: [753, 315], OH: [836, 315], PA: [919, 315], NJ: [1002, 315], CT: [1085, 315],
  OR: [298, 388], NV: [380, 388], CO: [463, 388], NE: [546, 388], MO: [629, 388], KY: [712, 388], WV: [795, 388], DC: [878, 388], MD: [960, 388], DE: [1043, 388],
  CA: [339, 460], UT: [422, 460], NM: [505, 460], KS: [588, 460], AR: [670, 460], TN: [753, 460], SC: [836, 460], NC: [919, 460], VA: [1002, 460],
  AZ: [463, 530], OK: [546, 530], LA: [629, 530], MS: [712, 530], AL: [795, 530], GA: [878, 530], TX: [588, 600], FL: [836, 600], HI: [172, 600] };
const USN = { alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY' };
function drawHexCarto(ctx, L, tm, o) {
  const s = L.style, fr = o.frame; if (!fr) return;
  const unit = o.unit, u = u01(L, tm), Tb = table(s);
  const sf = s.stateField || Tb.fields.find((f) => /state|abbr|code/i.test(f)) || Tb.fields[0], vf = s.field || guessField(Tb, 'num');
  const vals = new Map();
  for (const r of Tb.rows) { const raw = String(r.p[sf] ?? '').trim(); const code = US[raw.toUpperCase()] ? raw.toUpperCase() : USN[normN(raw)]; const v = num(r.p[vf]); if (code && isFinite(v)) vals.set(code, v); }
  const vs = [...vals.values()]; const mn = Math.min(...vs), mx = Math.max(...vs);
  ctx.save(); ctx.globalAlpha = tm.alpha;
  if (+s.bgAlpha > 0) { ctx.save(); ctx.globalAlpha *= +s.bgAlpha; ctx.fillStyle = s.bg || '#fff'; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); ctx.restore(); }
  titleBlock(ctx, L, o, 'center');
  const k = (fr.w / 1250) * (+s.tileSize || 1), R = 47 * k, Rt = R * (1 - (+s.gap || 0));
  let cx = fr.x + fr.w * clamp(+s.cx, 0, 1), cy = fr.y + fr.h * clamp(+s.cy, 0, 1);
  const [dx, dy] = placeAt(ctx, L, fr, cx - 560 * k, cy - 290 * k, 1120 * k, 580 * k, { key: 'grid' }); void dx; void dy;
  const ox = cx - 628 * k, oy = cy - 350 * k;
  const codes = Object.keys(US);
  codes.forEach((code, n) => {
    const [px, py] = US[code]; const x = ox + px * k, y = oy + py * k;
    const a = u >= 1 ? 1 : L.anim === 'sweep' ? clamp((u * 1.35 - (x - fr.x) / fr.w) / 0.35, 0, 1) : L.anim === 'grow' ? clamp((u - (n / codes.length) * 0.5) / 0.5, 0, 1) : u;
    if (a <= 0) return;
    const v = vals.get(code); const t = isFinite(v) && mx > mn ? (v - mn) / (mx - mn) : 0.5;
    ctx.save(); ctx.globalAlpha *= a;
    const hexPath = (r) => { ctx.beginPath(); for (let q = 0; q < 6; q++) { const an = (60 * q - 30) * D2R; q ? ctx.lineTo(x + r * Math.cos(an), y + r * Math.sin(an)) : ctx.moveTo(x + r * Math.cos(an), y + r * Math.sin(an)); } ctx.closePath(); };
    hexPath(Rt);
    if (s.symbol === 'hexfill' && isFinite(v)) { const c = rampAt(s.scheme || 'YlOrRd', 0.1 + 0.9 * t); ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.fill(); }
    else if (s.tileStyle !== 'outline') {
      if (s.shadow !== false) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 10 * k; ctx.shadowOffsetY = 3 * k; ctx.fillStyle = s.tileColor; ctx.fill(); ctx.restore(); }
      if (s.tileStyle === 'glass') { const g = ctx.createLinearGradient(x, y - Rt, x, y + Rt); g.addColorStop(0, shadeC(s.tileColor, 0.6)); g.addColorStop(1, shadeC(s.tileColor, -0.08)); ctx.fillStyle = g; } else ctx.fillStyle = s.tileColor;
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(120,125,135,0.55)'; ctx.lineWidth = 1 * k; ctx.stroke();
    // symbol
    if (isFinite(v) && s.symbol !== 'none' && s.symbol !== 'hexfill') {
      const lo = +s.minSym || 0.12, hi = +s.maxSym || 0.62;
      const f = s.scaleMode === 'zero' ? Math.sqrt(v / (mx || 1)) * hi : lo + (hi - lo) * t;
      const S = Rt * f * (L.anim === 'grow' ? easeOut(clamp(a * 1.4 - 0.3, 0, 1)) : 1), col = s.symColor || '#ffb400';
      if (S > 0.5) {
        if (s.shadow !== false && s.symbol !== 'bar') { ctx.save(); ctx.globalAlpha *= 0.25; const g = ctx.createRadialGradient(x, y + S * 0.9, 0, x, y + S * 0.9, S * 1.2); g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - S * 1.3, y, S * 2.6, S * 2.2); ctx.restore(); }
        if (s.symbol === 'cube') {
          const h = S * 0.5, w = S * 0.866, top = [[x, y - S], [x + w, y - h], [x, y], [x - w, y - h]];
          const poly = (P, c) => { ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); };
          poly([[x - w, y - h], [x, y], [x, y + S], [x - w, y + h]], shadeC(col, -0.12));
          poly([[x + w, y - h], [x, y], [x, y + S], [x + w, y + h]], shadeC(col, -0.28));
          poly(top, shadeC(col, 0.35));
        } else if (s.symbol === 'sphere') {
          const g = ctx.createRadialGradient(x - S * 0.35, y - S * 0.4, S * 0.05, x, y, S); g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, shadeC(col, 0.45)); g.addColorStop(0.85, col); g.addColorStop(1, shadeC(col, -0.35));
          ctx.beginPath(); ctx.arc(x, y, S, 0, 7); ctx.fillStyle = g; ctx.fill();
        } else if (s.symbol === 'bar') { const bw = Rt * 0.28, bh = S * 1.4; ctx.fillStyle = col; ctx.fillRect(x - bw / 2, y + Rt * 0.45 - bh, bw, bh); }
        else { ctx.beginPath(); ctx.arc(x, y, S, 0, 7); ctx.fillStyle = col; ctx.fill(); }
      }
    }
    if (s.labels !== 'none') {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (s.labels === 'both' || s.labels === 'abbr') { ctx.font = `600 ${10.5 * k * 1.25}px ${UI}`; ctx.fillStyle = s.abbrColor; ctx.fillText(code, x, y - Rt * 0.66); }
      if ((s.labels === 'both' || s.labels === 'value') && isFinite(v)) { ctx.font = `700 ${11 * k * 1.25}px ${UI}`; ctx.fillStyle = s.labelColor; ctx.fillText(`${s.prefix || ''}${(+v).toFixed(+s.decimals || 0)}${s.suffix || ''}`, x, y + Rt * 0.66); }
    }
    ctx.restore();
  });
  ctx.restore();
}

// ================================================================= 3 · glow points
function pointsOf(L) {
  const s = L.style, Tb = table(s), vf = s.field || '', nf = s.labelField || guessField(Tb, 'name') || Tb.fields[0];
  return Tb.rows.map((r) => ({ p: ptOf(r), v: vf ? num(r.p[vf]) : NaN, name: String(r.p[nf] ?? ''), row: r })).filter((x) => x.p);
}
function drawGlow(ctx, L, tm, o, phase) {
  const s = L.style, unit = o.unit, P = pointsOf(L), u = u01(L, tm);
  const vs = P.map((x) => x.v).filter(isFinite), mx = Math.max(...vs, 1e-9);
  if (phase === 'below') {
    ctx.save(); ctx.globalAlpha = tm.alpha; if (s.additive !== false) ctx.globalCompositeOperation = 'lighter';
    P.forEach((pt, i) => {
      const q = o.proj(pt.p); if (!isFinite(q[0])) return;
      let a = L.anim === 'grow' || L.anim === 'pulse' ? clamp((u - (i / Math.max(1, P.length)) * 0.7) / 0.3, 0, 1) : u; if (a <= 0) return;
      const r = (s.sizeMode === 'same' || !isFinite(pt.v) ? +s.size || 8 : (+s.size || 8) + ((+s.maxSize || 26) - (+s.size || 8)) * Math.sqrt(pt.v / mx)) * unit;
      const pulse = L.anim === 'pulse' || s.style === 'beacon' ? 0.75 + 0.25 * Math.sin((tm.tau || 0) * 3 * (+s.pulseSpeed || 1) + i) : 1;
      const G = r * (1 + (+s.glow || 2.2)) * pulse;
      ctx.globalAlpha = tm.alpha * a;
      if (s.style !== 'sphere') { const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], G); g.addColorStop(0, rgba(s.color, 0.55)); g.addColorStop(0.35, rgba(s.color, 0.18)); g.addColorStop(1, rgba(s.color, 0)); ctx.fillStyle = g; ctx.fillRect(q[0] - G, q[1] - G, G * 2, G * 2); }
    });
    ctx.restore(); return;
  }
  if (phase !== 'captions') return;
  ctx.save();
  P.forEach((pt, i) => {
    const q = o.proj(pt.p); if (!isFinite(q[0])) return;
    const a = (L.anim === 'grow' || L.anim === 'pulse' ? clamp((u - (i / Math.max(1, P.length)) * 0.7) / 0.3, 0, 1) : u) * tm.alpha; if (a <= 0) return;
    const r = (s.sizeMode === 'same' || !isFinite(pt.v) ? +s.size || 8 : (+s.size || 8) + ((+s.maxSize || 26) - (+s.size || 8)) * Math.sqrt(pt.v / mx)) * unit;
    ctx.globalAlpha = a;
    if (s.style === 'sphere') {
      ctx.save(); ctx.globalAlpha = a * 0.35; const sg = ctx.createRadialGradient(q[0] + r * 0.4, q[1] + r * 0.6, 0, q[0] + r * 0.4, q[1] + r * 0.6, r * 1.4); sg.addColorStop(0, rgba(s.color2, 0.8)); sg.addColorStop(1, rgba(s.color2, 0)); ctx.fillStyle = sg; ctx.fillRect(q[0] - r, q[1] - r, r * 3, r * 3); ctx.restore();
      const g = ctx.createRadialGradient(q[0] - r * 0.35, q[1] - r * 0.4, r * 0.05, q[0], q[1], r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, shadeC(s.color2, 0.5)); g.addColorStop(0.85, s.color2); g.addColorStop(1, shadeC(s.color2, -0.4));
      ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.8 * unit; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(q[0] - r * 0.3, q[1] - r * 0.45, r * 0.35, r * 0.18, -0.5, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
    } else if (s.style === 'ring' || s.style === 'beacon') {
      const pulse = s.style === 'beacon' ? ((tm.tau || 0) * (+s.pulseSpeed || 1) + i * 0.37) % 1 : 0;
      ctx.strokeStyle = s.color2; ctx.lineWidth = 2 * unit; ctx.shadowColor = s.color2; ctx.shadowBlur = 10 * unit;
      ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.stroke();
      if (s.style === 'beacon') { ctx.globalAlpha = a * (1 - pulse); ctx.beginPath(); ctx.arc(q[0], q[1], r * (1 + pulse * 2.2), 0, 7); ctx.stroke(); }
      ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(q[0], q[1], r * 0.28, 0, 7); ctx.fillStyle = s.color; ctx.fill();
    } else if (s.style === 'star') {
      ctx.fillStyle = '#fff'; ctx.shadowColor = s.color; ctx.shadowBlur = 12 * unit; const k = r * 0.9;
      ctx.beginPath(); ctx.moveTo(q[0], q[1] - k); ctx.quadraticCurveTo(q[0], q[1], q[0] + k, q[1]); ctx.quadraticCurveTo(q[0], q[1], q[0], q[1] + k); ctx.quadraticCurveTo(q[0], q[1], q[0] - k, q[1]); ctx.quadraticCurveTo(q[0], q[1], q[0], q[1] - k); ctx.fill();
    } else { ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(1.5 * unit, r * 0.32), 0, 7); ctx.fillStyle = '#ffffff'; ctx.shadowColor = s.color; ctx.shadowBlur = 8 * unit; ctx.fill(); }
    ctx.shadowBlur = 0;
    if (s.labels && s.labels !== 'none') {
      const t = s.labels === 'name' ? pt.name : s.labels === 'value' ? fmtNum(pt.v) : `${pt.name} ${fmtNum(pt.v)}`;
      const fs = 11 * unit * (+s.textSize || 1); ctx.font = `600 ${fs}px ${UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3 * unit; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(t, q[0] + r + 4 * unit, q[1]); ctx.fillStyle = s.labelColor; ctx.fillText(t, q[0] + r + 4 * unit, q[1]);
    }
  });
  ctx.restore();
}

// ================================================================= 4 · neon network
function gcPath(a, b, n = 48) {
  const [l1, p1] = a.map((v) => v * D2R), [l2, p2] = b.map((v) => v * D2R);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2)) || 1e-9;
  const out = [];
  for (let i = 0; i <= n; i++) { const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d); const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2), y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2), z = A * Math.sin(p1) + B * Math.sin(p2); out.push([Math.atan2(y, x) / D2R, Math.atan2(z, Math.hypot(x, y)) / D2R]); }
  return out;
}
const netCache = new Map();
function routesOf(L) {
  const s = L.style, Tb = table(s);
  const key = `${dataOf(s).length}|${s.sample}|${s.routes}|${s.hubs}|${s.links}`;
  const c = netCache.get(L.id); if (c && c.key === key) return c.R;
  const R = { lines: [], pts: [], hubs: [] };
  const f = (re) => Tb.fields.find((x) => re.test(x));
  const fl = [f(/^(from|o|orig|src|start)[_ ]?lat/i), f(/^(from|o|orig|src|start)[_ ]?(lon|lng)/i), f(/^(to|d|dest|dst|end)[_ ]?lat/i), f(/^(to|d|dest|dst|end)[_ ]?(lon|lng)/i)];
  if (s.routes === 'file' && fl.every(Boolean)) {
    for (const r of Tb.rows) { const a = [num(r.p[fl[1]]), num(r.p[fl[0]])], b = [num(r.p[fl[3]]), num(r.p[fl[2]])]; if ([...a, ...b].every(isFinite)) { R.lines.push({ a, b, hub: 0 }); R.pts.push(a, b); } }
  } else {
    const vf = guessField(Tb, 'num');
    const P = Tb.rows.map((r) => ({ p: ptOf(r), v: num(r.p[vf]) })).filter((x) => x.p);
    P.sort((a, b) => (b.v || 0) - (a.v || 0));
    R.pts = P.map((x) => x.p); R.hubs = P.slice(0, +s.hubs || 4).map((x) => x.p);
    P.forEach((x, i) => {
      if (s.routes === 'near') { const near = P.map((y, j) => [j, haversine(x.p, y.p)]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, +s.links || 3); for (const [j] of near) if (j > i || !near.some(() => false)) R.lines.push({ a: x.p, b: P[j].p, hub: Math.min(i, j) }); }
      else { const hubs = R.hubs.map((h, j) => [j, haversine(x.p, h)]).filter(([, d]) => d > 1000).sort((a, b) => a[1] - b[1]).slice(0, +s.links || 3); for (const [j] of hubs) R.lines.push({ a: R.hubs[j], b: x.p, hub: j }); }
    });
    // hub-to-hub
    for (let i = 0; i < R.hubs.length; i++) for (let j = i + 1; j < R.hubs.length; j++) R.lines.push({ a: R.hubs[i], b: R.hubs[j], hub: i });
  }
  R.lines.forEach((l) => { l.path = gcPath(l.a, l.b); });
  netCache.set(L.id, { key, R });
  return R;
}
function drawNeon(ctx, L, tm, o, phase) {
  const s = L.style, fr = o.frame, unit = o.unit, u = u01(L, tm);
  if (!fr) return;
  if (phase === 'below') {
    ctx.save();
    if (+s.darken > 0) { ctx.globalAlpha = tm.alpha * +s.darken; ctx.fillStyle = '#000'; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); }
    ctx.globalAlpha = tm.alpha;
    if (s.graticule !== false) {
      ctx.strokeStyle = s.gratColor; ctx.lineWidth = 1.2 * unit; ctx.shadowColor = s.gratColor; ctx.shadowBlur = 6 * unit; ctx.globalAlpha = tm.alpha * 0.7;
      const st = +s.gratStep || 20; ctx.beginPath();
      for (let lon = -180; lon <= 180; lon += st) { const L0 = []; for (let lat = -80; lat <= 80; lat += 2) L0.push([lon, lat]); H.pathLine(ctx, L0, o.proj); }
      for (let lat = -80; lat <= 80; lat += st) { const L0 = []; for (let lon = -180; lon <= 180; lon += 2) L0.push([lon, lat]); H.pathLine(ctx, L0, o.proj); }
      ctx.stroke(); ctx.shadowBlur = 0;
    }
    const C = allCountries();
    if (s.coast !== false && C) { ctx.globalAlpha = tm.alpha * 0.95; ctx.strokeStyle = s.coastColor; ctx.lineWidth = 1.3 * unit; ctx.shadowColor = s.coastColor; ctx.shadowBlur = 5 * unit; ctx.beginPath(); for (const c of C) pathPolys(ctx, c.polys, o.proj); ctx.stroke(); ctx.shadowBlur = 0; }
    // routes (additive)
    const R = routesOf(L); ctx.globalCompositeOperation = 'lighter';
    const n = R.lines.length, wd = (+s.width || 1.1) * unit;
    R.lines.forEach((l, i) => {
      const k = L.anim === 'draw' && u < 1 ? clamp((u - (i / Math.max(1, n)) * 0.5) / 0.5, 0, 1) : u; if (k <= 0) return;
      const pts = l.path.slice(0, Math.max(2, Math.round(l.path.length * k)));
      const lift = +s.arc || 0;
      const P = pts.map((p, j) => { const q = o.proj(p); if (!lift) return q; const f = j / (l.path.length - 1); const a0 = o.proj(l.a), b0 = o.proj(l.b); const d = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]); return [q[0], q[1] - Math.sin(Math.PI * f) * d * lift]; });
      if (P.some((q, j) => j && Math.abs(q[0] - P[j - 1][0]) > fr.w * 0.5)) return;
      ctx.beginPath(); P.forEach((q, j) => (j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      if (+s.glow > 0) { ctx.globalAlpha = tm.alpha * (+s.alpha || 0.35) * 0.35; ctx.strokeStyle = s.color; ctx.lineWidth = wd * (2 + +s.glow * 2); ctx.stroke(); }
      ctx.globalAlpha = tm.alpha * (+s.alpha || 0.35); ctx.strokeStyle = s.color; ctx.lineWidth = wd; ctx.stroke();
      ctx.globalAlpha = tm.alpha * (+s.alpha || 0.35) * 0.6; ctx.strokeStyle = s.core; ctx.lineWidth = wd * 0.4; ctx.stroke();
    });
    ctx.restore(); return;
  }
  if (phase !== 'captions') return;
  const R = routesOf(L);
  ctx.save(); ctx.globalAlpha = tm.alpha * u;
  if (s.rings !== false) { ctx.strokeStyle = s.ringColor; ctx.lineWidth = 1.6 * unit; ctx.shadowColor = s.ringColor; ctx.shadowBlur = 8 * unit; R.pts.forEach((p, i) => { const q = o.proj(p); if (!isFinite(q[0])) return; const r = (i % 3 === 0 ? 14 : 8) * unit; ctx.beginPath(); if (i % 3 === 2) { ctx.moveTo(q[0], q[1] - r * 0.8); ctx.lineTo(q[0] + r * 0.7, q[1] + r * 0.5); ctx.lineTo(q[0] - r * 0.7, q[1] + r * 0.5); ctx.closePath(); } else ctx.arc(q[0], q[1], r, 0, 7); ctx.stroke(); }); }
  if (s.bigCities !== false) R.hubs.forEach((p) => { const q = o.proj(p); if (!isFinite(q[0])) return; const r = 18 * unit; const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], r * 2.2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.95)'); g.addColorStop(0.5, 'rgba(200,230,255,0.5)'); g.addColorStop(1, 'rgba(120,180,255,0)'); ctx.shadowBlur = 0; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], r * 2.2, 0, 7); ctx.fill(); });
  ctx.shadowBlur = 0;
  if (+s.vignette > 0) { const g = ctx.createRadialGradient(fr.x + fr.w / 2, fr.y + fr.h / 2, Math.min(fr.w, fr.h) * 0.35, fr.x + fr.w / 2, fr.y + fr.h / 2, Math.max(fr.w, fr.h) * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${+s.vignette})`); ctx.globalAlpha = tm.alpha; ctx.fillStyle = g; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); }
  ctx.restore();
}

// ================================================================= 5 · viewpoint cones
function drawCones(ctx, L, tm, o, phase) {
  const s = L.style, unit = o.unit, u = u01(L, tm), Tb = table(s);
  const af = s.angleField || Tb.fields.find((f) => /angle|bearing|dir|heading|azimuth/i.test(f)), lf = s.field || '', nf = s.labelField || guessField(Tb, 'name') || Tb.fields[0];
  const rows = Tb.rows.map((r) => ({ p: ptOf(r), ang: num(r.p[af]), len: lf ? num(r.p[lf]) : NaN, name: String(r.p[nf] ?? '') })).filter((x) => x.p);
  const lmax = Math.max(...rows.map((r) => r.len).filter(isFinite), 1);
  ctx.save();
  rows.forEach((r, i) => {
    const q = o.proj(r.p); if (!isFinite(q[0])) return;
    const a = (L.anim === 'grow' ? clamp((u - (i / Math.max(1, rows.length)) * 0.6) / 0.4, 0, 1) : u) * tm.alpha; if (a <= 0) return;
    const len = (+s.length || 46) * unit * (isFinite(r.len) ? 0.4 + 0.6 * r.len / lmax : 1) * (L.anim === 'grow' ? easeOut(a) : 1);
    const ang = ((isFinite(r.ang) ? r.ang : 0) - 90) * D2R, sp = (+s.spread || 50) * D2R / 2;
    if (phase === 'below') {
      const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], len); g.addColorStop(0, rgba(s.color, 0.9)); g.addColorStop(0.6, rgba(s.color, 0.35)); g.addColorStop(1, rgba(s.color, 0));
      ctx.globalAlpha = a; ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.arc(q[0], q[1], len, ang - sp, ang + sp); ctx.closePath(); ctx.fill();
    } else if (phase === 'captions') {
      ctx.globalAlpha = a; const R = 5.5 * unit;
      if (s.glow !== false) { ctx.shadowColor = s.dotColor; ctx.shadowBlur = 10 * unit; }
      const g = ctx.createRadialGradient(q[0] - R * 0.3, q[1] - R * 0.3, 0, q[0], q[1], R); g.addColorStop(0, '#ffffff'); g.addColorStop(1, s.dotColor);
      ctx.beginPath(); ctx.arc(q[0], q[1], R, 0, 7); ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
      if (s.labels === 'name') { ctx.font = `600 ${11 * unit * (+s.textSize || 1)}px ${UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3 * unit; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(r.name, q[0] + R + 4 * unit, q[1]); ctx.fillStyle = s.labelColor; ctx.fillText(r.name, q[0] + R + 4 * unit, q[1]); }
    }
  });
  ctx.restore();
}

// ================================================================= 6 · area emphasis
function cutoutPolys(L, o) {
  const s = L.style, mode = s.mode || 'polygon';
  if (mode === 'country') { const c = countriesByName(s.country || ''); return c && c[0] ? c[0].polys : null; }
  if (mode === 'circle' || mode === 'square') {
    let c = null; const m = String(s.center || '').match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    if (m) c = [+m[2], +m[1]]; else if (L.geom) { const P = polysOf(L.geom); c = P.length ? labelPoint(P) : L.geom.type === 'Point' ? L.geom.coordinates : null; }
    if (!c && o.map) { const z = o.map.getCenter(); c = [+z.lng.toFixed(5), +z.lat.toFixed(5)]; L.style.center = `${c[1]}, ${c[0]}`; } // pinned where the map was when it was added
    if (!c) return null;
    const R = +s.radiusKm || 25, ring = [];
    if (mode === 'circle') for (let i = 0; i <= 96; i++) ring.push(H.dest(c, (i / 96) * 360, R * 1000));
    else { const dy = R / 111.32, dx = R / (111.32 * Math.cos(c[1] * D2R)); ring.push([c[0] - dx, c[1] - dy], [c[0] + dx, c[1] - dy], [c[0] + dx, c[1] + dy], [c[0] - dx, c[1] + dy], [c[0] - dx, c[1] - dy]); }
    return [[ring]];
  }
  return L.geom ? polysOf(L.geom) : null;
}
function drawCutout(ctx, L, tm, o, phase) {
  const s = L.style, fr = o.frame; if (!fr) return;
  const P = cutoutPolys(L, o); if (!P || !P.length) return;
  const unit = o.unit, u = u01(L, tm), A = tm.alpha;
  const kOut = L.anim === 'reveal' ? clamp(u / 0.6, 0, 1) : u, kEdge = L.anim === 'reveal' ? clamp((u - 0.4) / 0.6, 0, 1) : u;
  const path = () => { ctx.beginPath(); pathPolys(ctx, P, o.proj); };
  if (phase === 'below') {
    ctx.save();
    // outside: dim + wash out
    if (+s.outside > 0 || +s.desat > 0) {
      ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); pathPolys(ctx, P, o.proj);
      ctx.save(); ctx.clip('evenodd');
      if (+s.desat > 0) { ctx.globalAlpha = A * kOut * +s.desat * 0.6; ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); ctx.globalCompositeOperation = 'source-over'; }
      ctx.globalAlpha = A * kOut * +s.outside; ctx.fillStyle = s.outsideColor || '#000'; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
      ctx.restore();
    }
    // raised: soft dark shadow just outside the edge
    if (+s.raise > 0) {
      ctx.save(); ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); pathPolys(ctx, P, o.proj); ctx.clip('evenodd');
      ctx.shadowColor = `rgba(0,0,0,${0.9 * +s.raise})`; ctx.shadowBlur = (+s.raiseSize || 26) * unit; ctx.shadowOffsetY = (+s.raiseSize || 26) * 0.35 * unit;
      ctx.globalAlpha = A * kEdge; path(); ctx.fillStyle = '#000'; ctx.fill('evenodd'); ctx.restore();
    }
    // frost inside
    if (+s.frost > 0) { ctx.save(); path(); ctx.globalAlpha = A * kEdge * +s.frost; ctx.fillStyle = s.frostColor || '#fff'; ctx.fill('evenodd'); ctx.restore(); }
    // inner shadow: stroke a wide dark line clipped inside
    if (+s.inner > 0) {
      ctx.save(); path(); ctx.clip('evenodd');
      ctx.shadowColor = `rgba(0,0,0,${+s.inner})`; ctx.shadowBlur = (+s.innerSize || 22) * unit;
      ctx.beginPath(); ctx.rect(fr.x - 400, fr.y - 400, fr.w + 800, fr.h + 800); pathPolys(ctx, P, o.proj);
      ctx.globalAlpha = A * kEdge; ctx.fillStyle = '#000'; ctx.fill('evenodd'); ctx.restore();
    }
    if (+s.edgeWidth > 0) { ctx.save(); path(); ctx.globalAlpha = A * kEdge; ctx.strokeStyle = s.edge; ctx.lineWidth = +s.edgeWidth * unit; ctx.lineJoin = 'round'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4 * unit; ctx.stroke(); ctx.restore(); }
    ctx.restore(); return;
  }
  if (phase !== 'captions' || !s.name) return;
  const c = labelPoint(P); if (!c) return;
  let [x, y] = o.proj(c);
  if (s.namePos === 'top') { let mn = Infinity; for (const p of P) for (const q of p[0]) mn = Math.min(mn, o.proj(q)[1]); y = mn + 50 * unit; }
  const fs = 18 * unit * (+s.nameSize || 1), sp = fs * (+s.nameSpacing || 1.1);
  ctx.save(); ctx.font = `500 ${fs}px ${UI}`;
  const chars = [...String(s.name)], w = chars.reduce((t, ch) => t + ctx.measureText(ch).width, 0) + sp * (chars.length - 1);
  const [dx, dy] = placeAt(ctx, L, fr, x - w / 2, y - fs, w, fs * 2, { key: 'name' }); void dx; void dy;
  ctx.globalAlpha = A * kEdge; ctx.fillStyle = s.nameColor; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 6 * unit;
  let xx = x - w / 2; for (const ch of chars) { ctx.fillText(ch, xx, y); xx += ctx.measureText(ch).width + sp; }
  ctx.restore();
}

// ================================================================= 7 · map tile gallery
const GALLERY = `Pacific Northwest Coast | Granite peaks and glacial fjords | 50.6, -126.4 | 6.6 | Part of the Coast Mountains: granite intrusions, fjords carved by Pleistocene glaciers, steep-sided valleys and island-studded waterways shaped by heavy rain and active tectonics.
Norwegian Fjords | Ancient shield, ice-sculpted valleys | 61.15, 6.4 | 6.9 | Deep fjords such as Sognefjord and Hardangerfjord cut through Precambrian rocks of the Scandinavian Shield, carved by glaciers in the last Ice Age.
Patagonian Fjords | Where the Andes meet the sea | -49.2, -74.6 | 6.6 | Drowned glacial valleys carved into granite and metamorphic rock, uplifted by the subduction of the Nazca Plate — one of the most intricate coasts on Earth.
New Zealand Fiordland | Southern Alps and ocean depths | -45.3, 167.4 | 7.4 | A rugged region of fjords such as Milford Sound, where the Pacific and Australian plates collide; Pleistocene glaciers carved its steep valleys.`;
function wrapText(ctx, t, x, y, maxW, lh, maxLines = 12) { const words = String(t).split(/\s+/); let line = '', n = 0; for (const w of words) { const tt = line ? `${line} ${w}` : w; if (ctx.measureText(tt).width > maxW && line) { ctx.fillText(line, x, y + n * lh); line = w; if (++n >= maxLines) return; } else line = tt; } if (line) ctx.fillText(line, x, y + n * lh); }
function drawGallery(ctx, L, tm, o) {
  const s = L.style, fr = o.frame; if (!fr) return;
  const unit = o.unit, u = u01(L, tm);
  const lines = String(s.panels && String(s.panels).trim() ? s.panels : GALLERY).split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((x) => x.length >= 3);
  const P = lines.map(([title, sub, ll, z, text]) => { const m = String(ll || '').match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/); return { title, sub, ll: m ? [+m[2], +m[1]] : null, z: +z || 7, text: text || '' }; }).filter((p) => p.ll).slice(0, 6);
  ctx.save(); ctx.globalAlpha = tm.alpha;
  if (+s.bgAlpha > 0) {
    ctx.save(); ctx.globalAlpha *= +s.bgAlpha; ctx.fillStyle = s.bg; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
    if (s.paper !== false) { const R = rng(3); ctx.globalAlpha = tm.alpha * +s.bgAlpha * 0.06; for (let i = 0; i < 900; i++) { ctx.fillStyle = R() > 0.5 ? '#fff' : '#000'; ctx.fillRect(fr.x + R() * fr.w, fr.y + R() * fr.h, 2 * unit, 2 * unit); } }
    ctx.restore();
  }
  // title
  if (s.title || s.subtitle) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = s.titleColor; if (s.title) { ctx.font = `700 ${22 * unit}px ${UI}`; ctx.fillText(s.title, fr.x + fr.w / 2, fr.y + 20 * unit); } if (s.subtitle) { ctx.font = `500 ${12.5 * unit}px ${UI}`; ctx.fillText(s.subtitle, fr.x + fr.w / 2, fr.y + 48 * unit); } }
  const cols = clamp(Math.round(+s.cols || 2), 1, 3), rows = Math.ceil(P.length / cols);
  const top = fr.y + 78 * unit, bot = fr.y + fr.h - 30 * unit, rowH = (bot - top) / Math.max(1, rows);
  const T0 = Math.min(rowH * 0.86, (fr.w * (s.text !== false ? 0.42 : 0.8)) / cols) * (+s.tileSize || 1);
  const blockW = cols * T0 + (cols - 1) * 22 * unit, bx = fr.x + fr.w / 2 - blockW / 2;
  P.forEach((p, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const a = L.anim === 'cascade' && u < 1 ? clamp((u - (i / P.length) * 0.6) / 0.4, 0, 1) : u; if (a <= 0) return;
    const x = bx + c * (T0 + 22 * unit), y = top + r * rowH + (rowH - T0) / 2 + (1 - easeOut(a)) * 30 * unit, rad = T0 * (+s.corner || 0.12);
    ctx.save(); ctx.globalAlpha = tm.alpha * a;
    if (s.shadow !== false) { ctx.save(); ctx.shadowColor = 'rgba(30,45,70,0.35)'; ctx.shadowBlur = 26 * unit; ctx.shadowOffsetY = 12 * unit; rr(ctx, x, y, T0, T0, rad); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore(); }
    ctx.save(); rr(ctx, x, y, T0, T0, rad); ctx.clip();
    drawTiles(ctx, s.src || 'satellite', p.ll, p.z, x, y, T0, T0);
    const g = ctx.createLinearGradient(x, y, x + T0, y + T0); g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(0.4, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.12)'); ctx.fillStyle = g; ctx.fillRect(x, y, T0, T0);
    ctx.restore();
    rr(ctx, x, y, T0, T0, rad); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.5 * unit; ctx.stroke();
    if (s.scale !== false) { const mpp = (156543.03 * Math.cos(p.ll[1] * D2R)) / 2 ** p.z; const ratio = Math.round(mpp / 0.00028 / (T0 / 256 / 2.2)); ctx.font = `600 ${9.5 * unit}px ${UI}`; ctx.fillStyle = s.inkColor; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(`⊕  1 : ${ratio.toLocaleString('en-US')}`, x + 6 * unit, y + T0 + 8 * unit); }
    if (s.text !== false) {
      const left = c === 0 && cols > 1, tx = left ? fr.x + 40 * unit : x + T0 + 30 * unit, tw = left ? x - tx - 30 * unit : Math.min(fr.x + fr.w - 40 * unit - tx, 300 * unit);
      if (tw > 80 * unit) {
        ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = s.titleColor;
        ctx.font = `700 ${15 * unit}px ${UI}`; ctx.fillText(p.title || '', tx, y + 6 * unit);
        ctx.font = `600 ${10.5 * unit}px ${UI}`; ctx.fillStyle = s.inkColor; ctx.fillText(p.sub || '', tx, y + 26 * unit);
        ctx.font = `400 ${10 * unit}px ${UI}`; wrapText(ctx, p.text, tx, y + 48 * unit, tw, 14.5 * unit, Math.floor((T0 - 50 * unit) / (14.5 * unit)));
      }
    }
    ctx.restore();
  });
  ctx.restore();
}

// ================================================================= 8 · small multiples
function hatch(ctx, color, unit, mode) {
  const c = document.createElement('canvas'); const n = Math.max(4, Math.round(7 * unit)); c.width = c.height = n; const g = c.getContext('2d');
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = Math.max(1, 1.6 * unit);
  if (mode === 'dots') { g.beginPath(); g.arc(n / 2, n / 2, n * 0.18, 0, 7); g.fill(); } else { g.beginPath(); g.moveTo(-1, n + 1); g.lineTo(n + 1, -1); g.moveTo(-1, 1); g.lineTo(1, -1); g.moveTo(n - 1, n + 1); g.lineTo(n + 1, n - 1); g.stroke(); }
  return ctx.createPattern(c, 'repeat');
}
function drawSmall(ctx, L, tm, o) {
  const s = L.style, fr = o.frame; if (!fr) return;
  const C = allCountries(); if (!C) return;
  const unit = o.unit, u = u01(L, tm), Tb = table(s);
  const nf = guessField(Tb, 'name') || Tb.fields[0];
  const rows = Tb.rows.map((r) => ({ r, c: countriesByName(String(r.p[nf] || '').replace(/[,;]/g, ' ')) })).filter((x) => x.c && x.c[0]).map((x) => ({ p: x.r.p, polys: x.c[0].polys }));
  let panels = [];
  if (s.mode === 'category') {
    const cf = s.catField || guessField(Tb, 'cat'); const cats = [...new Set(rows.map((x) => String(x.p[cf] ?? '')).filter(Boolean))].slice(0, 12);
    const pal = [s.color, s.color2, ...(QUAL.Tableau || [])];
    panels = cats.map((k, i) => ({ title: k, color: pal[i % pal.length], sel: rows.filter((x) => String(x.p[cf]) === k) }));
  } else {
    const fields = String(s.fields || '').split(',').map((x) => x.trim()).filter(Boolean); const F = fields.length ? fields : Tb.numeric.filter((f) => !/lat|lon/i.test(f)).slice(0, 6);
    panels = F.map((f, i) => {
      const vs = rows.map((x) => num(x.p[f])).filter(isFinite).sort((a, b) => a - b);
      const thr = s.threshold !== '' && isFinite(+s.threshold) ? +s.threshold : vs[Math.floor(vs.length * 0.667)];
      const br = breaksOf(vs, 'quantile', 5), cols = rampN(s.scheme || 'YlOrRd', Math.max(1, br.length - 1));
      return { title: f.replace(/_/g, ' '), field: f, sel: s.mode === 'threshold' ? rows.filter((x) => num(x.p[f]) > thr) : rows.filter((x) => isFinite(num(x.p[f]))), colorOf: s.mode === 'threshold' ? null : (x) => cols[Math.max(0, classOf(num(x.p[f]), br))], color: s.color, thr };
    });
  }
  ctx.save(); ctx.globalAlpha = tm.alpha;
  if (+s.bgAlpha > 0) { ctx.save(); ctx.globalAlpha *= +s.bgAlpha; ctx.fillStyle = s.bg; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); ctx.restore(); }
  if (s.title || s.subtitle) { ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillStyle = s.ink; if (s.title) { ctx.font = `800 ${30 * unit}px ${UI}`; ctx.fillText(s.title, fr.x + fr.w - 30 * unit, fr.y + 22 * unit); } if (s.subtitle) { ctx.font = `600 ${12 * unit}px ${UI}`; ctx.fillText(s.subtitle, fr.x + fr.w - 30 * unit, fr.y + 58 * unit); } }
  // extent
  let bb = String(s.bbox || '').split(',').map(Number);
  if (bb.length !== 4 || !bb.every(isFinite)) { bb = [180, 90, -180, -90]; for (const x of rows) for (const p of x.polys) for (const [a, b] of p[0]) { bb[0] = Math.min(bb[0], a); bb[1] = Math.min(bb[1], b); bb[2] = Math.max(bb[2], a); bb[3] = Math.max(bb[3], b); } bb[1] = Math.max(bb[1], -58); bb[3] = Math.min(bb[3], 80); }
  const my = (lat) => Math.log(Math.tan(Math.PI / 4 + clamp(lat, -85, 85) * D2R / 2));
  const cols = clamp(Math.round(+s.cols || 3), 1, 6), nr = Math.ceil(panels.length / cols);
  const top = fr.y + (s.title ? 90 : 30) * unit, gw = fr.w - 60 * unit, gh = fr.y + fr.h - 20 * unit - top;
  const pw = gw / cols, ph = gh / Math.max(1, nr);
  const sx = (pw - 20 * unit) / ((bb[2] - bb[0]) * D2R), sy = (ph - 46 * unit) / (my(bb[3]) - my(bb[1])), k = Math.min(sx, sy);
  const allPolys = C;
  panels.forEach((P, i) => {
    const a = L.anim === 'cascade' && u < 1 ? clamp((u - (i / panels.length) * 0.6) / 0.4, 0, 1) : u; if (a <= 0) return;
    const c = i % cols, r = Math.floor(i / cols), x0 = fr.x + 30 * unit + c * pw, y0 = top + r * ph;
    const w = (bb[2] - bb[0]) * D2R * k, h = (my(bb[3]) - my(bb[1])) * k, ox = x0 + (pw - w) / 2, oy = y0 + 40 * unit + (ph - 46 * unit - h) / 2;
    const proj = ([lon, lat]) => [ox + (lon - bb[0]) * D2R * k, oy + (my(bb[3]) - my(lat)) * k];
    ctx.save(); ctx.globalAlpha = tm.alpha * a;
    ctx.beginPath(); ctx.rect(x0, y0 + 36 * unit, pw, ph - 36 * unit); ctx.clip();
    ctx.beginPath(); for (const cc of allPolys) { const [w0, s0, e0, n0] = cc.bbox; if (e0 < bb[0] - 5 || w0 > bb[2] + 5 || n0 < bb[1] - 5 || s0 > bb[3] + 5) continue; pathPolys(ctx, cc.polys, proj); }
    ctx.fillStyle = s.base; ctx.fill('evenodd'); ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.5 * unit; ctx.stroke();
    const fillMode = s.fill === 'mixed' ? (i % 2 ? 'hatch' : 'solid') : s.fill;
    for (const x of P.sel) {
      ctx.beginPath(); pathPolys(ctx, x.polys, proj);
      const col = P.colorOf ? P.colorOf(x) : P.color;
      ctx.fillStyle = fillMode === 'solid' ? col : hatch(ctx, col, unit, fillMode); ctx.fill('evenodd');
    }
    ctx.restore();
    ctx.save(); ctx.globalAlpha = tm.alpha * a; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = P.colorOf ? s.ink : P.color; ctx.font = `800 ${17 * unit}px ${UI}`; ctx.fillText(P.title, x0 + 6 * unit, y0 + 4 * unit);
    if (s.count !== false) { ctx.font = `600 ${11 * unit}px ${UI}`; ctx.fillText(`${P.sel.length} ${P.sel.length === 1 ? 'country' : 'countries'}${P.thr !== undefined && s.mode === 'threshold' ? ` above ${fmtNum(P.thr)}` : ''}`, x0 + 6 * unit, y0 + 23 * unit); }
    ctx.restore();
  });
  ctx.restore();
}

// ================================================================= entry
export function drawCartoStyle(ctx, L, tm, o, phase) {
  switch (L.kind) {
    case 'tilemap': return drawTileMap(ctx, L, tm, o, phase);
    case 'hexcartogram': return phase === 'captions' ? drawHexCarto(ctx, L, tm, o) : undefined;
    case 'glowpoints': return drawGlow(ctx, L, tm, o, phase);
    case 'neonnet': return drawNeon(ctx, L, tm, o, phase);
    case 'viewcones': return drawCones(ctx, L, tm, o, phase);
    case 'cutout': case 'highlight': return drawCutout(ctx, L, tm, o, phase);
    case 'mapgallery': return phase === 'captions' ? drawGallery(ctx, L, tm, o) : undefined;
    case 'smallmult': return phase === 'captions' ? drawSmall(ctx, L, tm, o) : undefined;
    default: return undefined;
  }
}
void T; void inPolys; void CNAME;
