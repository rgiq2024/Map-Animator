// Map camera effects: depth of field (tilt-shift focus band that can rack, blurring the map and optionally the
// labels), a one-click continuous drift pan, an ink-spread area reveal, flickering districts and soft labels.
// Sounds come from the reference recordings in sfx/clips.
import { H, countriesByName } from './cartofx.js';
import { placeAt } from './place.js';
import { parseTable, dataOf, SAMPLE_NAMES } from './geodata.js';
import { zoomRefFor } from './scene.js';
import { THEMES } from './themes.js';
import { imageFor as msgImage } from './geoimage.js';


const { clamp, ease, UI, polysOf, pathPolys, labelPoint, hashStr, off } = H;
const D2R = Math.PI / 180;
const hexA = (h, a) => { const m = String(h || '#ffffff').replace('#', ''); const v = m.length === 3 ? m.split('').map((x) => x + x).join('') : m.slice(0, 6); return `rgba(${parseInt(v.slice(0, 2), 16) || 0},${parseInt(v.slice(2, 4), 16) || 0},${parseInt(v.slice(4, 6), 16) || 0},${a})`; };
const seg = (t, a, b) => clamp((t - a) / Math.max(1e-6, b - a), 0, 1);
const rgbOf = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return [200, 20, 30]; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const SND = [['style.sound', 'Sound', 'switch'], ['style.soundVol', 'Sound volume', 'range', [0, 2, 0.05], (L) => L.style.sound !== false]];

export const MX_KINDS = {
  dofblur: { name: 'Depth of field', icon: '◎', geom: null, desc: 'A camera focus band across the map — everything above and below goes soft, like a tilted lens; the focus can rack from near to far, labels can blur with it. Pair it with “Make the camera drift” for a continuous pan' },
  inkreveal: { name: 'Ink-spread reveal', icon: '🩸', geom: 'polygon', desc: 'An area fills like ink spreading on paper from a starting point, with smoky edges that settle into a clean shape' },
  flickerzones: { name: 'Flickering districts', icon: '▦', geom: null, desc: 'Districts, regions or countries flash bright and dark like a failing light, then settle into an outlined map' },
  msgchat: { name: 'Messages (chat bubbles)', icon: '💬', geom: null, desc: 'Text messages popping up on screen — glassy, iMessage, WhatsApp, pill, thread, holographic or notification look — with names, times, profile pictures, typing dots and sounds' },
  mapposter: { name: 'Map poster', icon: '🖼', geom: 'point', desc: 'Map-art print: find your place, name it, pick a colour — full, circle or circle-focus poster with spaced-out title, country and coordinates; it builds, prints and frames itself' },
  shipsink: { name: 'Ship sinking', icon: '🚢', geom: 'point', desc: 'A ship seen from above in rough sea: distress flare and MAYDAY rings, it lists over and goes down, leaving foam, bubbles, debris and life rafts — with storm and horn sounds' },
  layerswipe: { name: 'Layer swipe (compare two layers)', icon: '◧', geom: null, desc: 'Compare any two layers you added — two road networks (GeoJSON, shapefile, KML), two GeoTIFF / raster images, or any elements — with a divider that slides across the map: one dataset on each side, labelled' },
  softlabel: { name: 'Soft map label', icon: 'Aa', geom: 'point', desc: 'A soft white label on the map — “Track Point 1” — that fades and drifts in, and blurs with the depth of field' },
};
export const MX_ANIMS = {
  dofblur: { rack: 'Focus racks from one place to another', breathe: 'Focus drifts back and forth', fade: 'Blur fades in', none: 'Fixed focus' },
  inkreveal: { spread: 'Ink spreads from the start point', fade: 'Fade in', none: 'Shown' },
  flickerzones: { flicker: 'Flicker, then settle', strobe: 'Keep flickering', fade: 'Fade in', none: 'Shown' },
  msgchat: { pop: 'Pop in one by one', typing: 'Typing dots, then pop', slide: 'Slide in from the side', type: 'Text types itself', float: 'Float up', fade: 'Fade in' },
  mapposter: { build: 'Builds: map opens, title spaces in', print: 'Prints and frames: page slides in, frame closes', still: 'Still' },
  shipsink: { sink: 'Lists over, then sinks', list: 'Lists over (stays afloat)', afloat: 'Afloat in rough sea', gone: 'After the sinking (foam, debris, rafts)' },
  layerswipe: { sweep: 'Swipe across and back', once: 'Swipe once (A → B)', hold: 'Fixed divider (no movement)', blink: 'Cross-fade A ↔ B (no divider)' },
  softlabel: { rise: 'Fade in and drift up', fade: 'Fade in', type: 'Type on', none: 'Shown' },
};
export const MX_DEFAULTS = {
  dofblur: { focusFrom: 0.62, focusTo: 0.42, band: 0.18, feather: 0.32, blur: 9, angle: 0, labels: true, vignette: 0.25, driftKm: 6, driftDir: 90, driftPitch: 55, driftTurn: 6, sound: true, soundVol: 0.8, clip: 'dof-ambient-2' },
  inkreveal: { snd: 'inkbleed', sndDur: 2, color: '#b3121e', opacity: 0.85, seedX: 0.12, seedY: 0.55, rough: 0.35, smoke: 0.7, texture: 0.35, edge: false, edgeColor: '#ff2a3a', sound: true, soundVol: 1 },
  flickerzones: { from: 'countries', layerId: '', countries: 'France, Germany, Italy, Spain, Poland, Belgium, Netherlands, Switzerland, Austria, Czechia', data: '', sample: '', color: '#ffffff', fill: 0.18, stroke: '#ffffff', strokeWidth: 1.2, rate: 12, flickerFor: 2.2, maxA: 0.9, sound: true, soundVol: 1 },
  msgchat: { look: 'glass', thread: 'Jane | 1:50 AM | How are you?\nMe | 1:52 AM | I am fine!\nJane | 1:53 AM | That’s good. See you tomorrow?\nMe | 1:53 AM | Yes 👍', me: 'Me', avatarMe: '', avatarThem: '', avatars: true, names: true, times: true, interval: 1.6, typing: true, typingSec: 0.9, cps: 28, keep: 6, fadeOld: true, size: 1, width: 0.36, gap: 0.5, anchor: 'right', bottom: 0.82, font: 'Inter', bold: false, tail: true, shadow: true, blur: 14, tint: '', colorMe: '', colorThem: '', textMe: '', textThem: '', headColor: '', sound: true, soundVol: 0.7 },
  mapposter: { query: '', title: 'YOUR CITY', sub: 'COUNTRY', coords: '', color: '#5f8a48', paper: '#ffffff', titleColor: '', subColor: '', coordsColor: '', showTitle: true, showSub: true, showCoords: true, dashes: true, titleWeight: 600, subSize: 1, coordsSize: 1, textPos: 'bottom', textY: 0, textBand: false, mapColor: '', waterColor: '', parkColor: '', buildingColor: '', roadColor: '', showBuildings: true, showMinor: true, showWater: true, showParks: true, roadWidth: 1, shape: 'full', circle: 0.86, veil: 0.75, fade: 0.38, page: 'portrait', ratio: '4:5', wall: '#e9e5df', frame: 'none', font: 'Jost', titleSize: 1, spacing: 0.28, grain: true, syncMap: true, autoTheme: true },
  shipsink: { type: 'tanker', name: 'MED EMRE', size: 1, heading: 35, listSide: 1, maxList: 90, storm: 1, flare: true, mayday: true, maydayText: 'MAYDAY', rafts: 3, sheen: false, nameTag: true, sound: true, soundVol: 0.7 },
  layerswipe: { layerA: '', layerB: '', dir: 'lr', split: 0.5, cycles: 1, hold: 0.12, labels: true, labelA: 'Dataset A', labelB: 'Dataset B', labelPos: 'top', textSize: 1, lineColor: '#ffffff', lineWidth: 3, knob: true, chips: true },
  softlabel: { text: 'Track Point 1', size: 1, color: '#ffffff', shadow: 0.6, weight: 500, dot: false, sound: false, soundVol: 0.6 },
};
const DUR = { msgchat: 8, mapposter: 4, shipsink: 12, layerswipe: 8, dofblur: 10, inkreveal: 5, flickerzones: 4, softlabel: 1.6 };
export const MX_LAYER_DEFAULTS = Object.fromEntries(Object.keys(MX_KINDS).map((k) => [k, { anim: Object.keys(MX_ANIMS[k])[0], duration: DUR[k], style: MX_DEFAULTS[k] }]));
export const MX_FORMS = {
  dofblur: [
    ['', '🎥 Make the camera drift (continuous pan) from the current view', 'gvaction', 'dofDrift'],
    ['style.driftKm', 'Drift distance (km over the scene)', 'range', [0.2, 200, 0.1]], ['style.driftDir', 'Drift direction (° on screen: 90 = to the right, 0 = forward)', 'range', [0, 359, 1]],
    ['style.driftPitch', 'Camera tilt for the drift (°)', 'range', [0, 75, 1]], ['style.driftTurn', 'Slow turn during the drift (°)', 'range', [-60, 60, 1]],
    ['style.focusFrom', 'Focus starts at (0 top … 1 bottom)', 'range', [0, 1, 0.01]], ['style.focusTo', 'Focus ends at', 'range', [0, 1, 0.01], (L) => L.anim === 'rack' || L.anim === 'breathe'],
    ['style.band', 'Sharp band height', 'range', [0, 0.8, 0.01]], ['style.feather', 'Soft transition', 'range', [0.02, 0.8, 0.01]],
    ['style.blur', 'Blur strength (px)', 'range', [0, 40, 0.5]], ['style.angle', 'Band angle (°)', 'range', [-60, 60, 1]],
    ['style.labels', 'Blur labels and markers too (put this layer on top)', 'switch'], ['style.vignette', 'Vignette', 'range', [0, 1, 0.01]],
    ...SND,
  ],
  inkreveal: [['style.color', 'Ink colour', 'color'], ['style.opacity', 'Opacity', 'range', [0.1, 1, 0.01]], ['style.seedX', 'Starts from ←→ (0…1 across the area)', 'range', [0, 1, 0.01]], ['style.seedY', 'Starts from ↑↓', 'range', [0, 1, 0.01]], ['style.rough', 'Ragged front', 'range', [0, 1, 0.01]], ['style.smoke', 'Smoky edges while spreading', 'range', [0, 1, 0.01]], ['style.texture', 'Ink texture', 'range', [0, 1, 0.01]], ['style.edge', 'Outline at the end', 'switch'], ['style.edgeColor', 'Outline colour', 'color', null, (L) => !!L.style.edge], ...SND, ['style.snd', 'Sound', 'select', { inkbleed: 'Ink bleed (swell + crackle)', inksizzle: 'Ink sizzle (bright crackle)', inkliquid: 'Liquid spread (bubbly)', clip: 'Ink spreading (recorded, 2 s)' }, (L) => L.style.sound !== false], ['style.sndDur', 'Sound length (s)', 'range', [0.6, 6, 0.1], (L) => L.style.sound !== false && L.style.snd !== 'clip']],
  flickerzones: [
    ['style.from', 'Areas from', 'select', { countries: 'Countries (by name)', layer: 'Another layer (areas, boundaries, a thematic map)', data: 'My GeoJSON / KML / shapefile' }],
    ['style.countries', 'Countries (comma-separated)', 'textarea', null, (L) => L.style.from === 'countries'],
    ['style.layerId', 'Layer', 'layerref', 'any', (L) => L.style.from === 'layer'],
    ['style.data', 'Your file with areas', 'datafile', null, (L) => L.style.from === 'data'],
    ['style.color', 'Flash colour', 'color'], ['style.maxA', 'Brightest flash', 'range', [0.1, 1, 0.01]], ['style.rate', 'Flicker speed (flashes / s)', 'range', [1, 40, 0.5]], ['style.flickerFor', 'Flicker for (s)', 'range', [0.2, 10, 0.1]],
    ['style.fill', 'Fill after settling', 'range', [0, 1, 0.01]], ['style.stroke', 'Outline colour', 'color'], ['style.strokeWidth', 'Outline width', 'range', [0, 6, 0.1]], ...SND,
  ],
  msgchat: [
    ['style.look', 'Look', 'select', { glass: 'Glass — frosted, see-through', imessage: 'iMessage — blue and grey', whatsapp: 'WhatsApp — green and white', pill: 'Pill — round labels with “Me // time”', thread: 'Thread — boxes with name // time', dark: 'Dark mode', holo: 'Holographic — glowing cyan', notify: 'Notification cards (lock screen)' }],
    ['', 'One message per line:  Name | time | message   (time can be left out: Name | message, or Name: message). Messages from the name below go on the right.', 'note'],
    ['style.thread', 'Messages', 'textarea'], ['style.me', 'Your name (right side)', 'text'],
    ['style.avatars', 'Profile pictures', 'switch'], ['style.avatarMe', 'Your profile picture', 'image', null, (L) => L.style.avatars !== false], ['style.avatarThem', 'Their profile picture', 'image', null, (L) => L.style.avatars !== false],
    ['style.names', 'Show names', 'switch'], ['style.times', 'Show times', 'switch'],
    ['style.interval', 'Seconds between messages', 'range', [0.3, 6, 0.1]], ['style.typing', 'Typing dots before their messages', 'switch'], ['style.typingSec', 'Typing dots last (s)', 'range', [0.3, 3, 0.1], (L) => L.style.typing !== false],
    ['style.cps', 'Typing speed (letters / s)', 'range', [5, 80, 1], (L) => L.anim === 'type'],
    ['style.keep', 'Messages on screen at once', 'range', [1, 12, 1]], ['style.fadeOld', 'Older messages fade', 'switch'],
    ['style.anchor', 'Sits at', 'select', { right: 'Right', left: 'Left', center: 'Centre' }], ['style.bottom', 'Bottom edge (up ↔ down)', 'range', [0.2, 0.98, 0.01]],
    ['style.width', 'Width', 'range', [0.15, 0.95, 0.01]], ['style.size', 'Text size', 'range', [0.4, 3, 0.05]], ['style.gap', 'Space between messages', 'range', [0, 3, 0.05]],
    ['style.font', 'Font', 'select', { Inter: 'Inter (like iOS)', Montserrat: 'Montserrat', Jost: 'Jost', Raleway: 'Raleway', Oswald: 'Oswald', 'IBM Plex Mono': 'Mono' }], ['style.bold', 'Bold text', 'switch'],
    ['style.colorMe', 'Your bubble colour (empty = from the look)', 'color'], ['style.textMe', 'Your text colour', 'color'], ['style.colorThem', 'Their bubble colour', 'color'], ['style.textThem', 'Their text colour', 'color'], ['style.headColor', 'Name / time colour', 'color'],
    ['style.blur', 'Glass blur', 'range', [0, 40, 1], (L) => L.style.look === 'glass' || L.style.look === 'notify'], ['style.tint', 'Glass tint', 'color', null, (L) => L.style.look === 'glass' || L.style.look === 'notify'],
    ['style.tail', 'Bubble tail', 'switch'], ['style.shadow', 'Shadow', 'switch'],
    ['style.sound', 'Send / receive sounds', 'switch'], ['style.soundVol', 'Sound volume', 'range', [0, 2, 0.05], (L) => L.style.sound !== false],
  ],
  mapposter: [
    ['', 'Find your special place, name it, pick a colour — then print it, frame it, gift it.', 'note'],
    ['style.query', 'Find a place (city, town, address)', 'text'], ['', '🔍 Find it — sets the map, title, country and coordinates', 'gvaction', 'posterFind'],
    ['style.title', 'Name (big title)', 'text'], ['style.sub', 'Second line (country / state)', 'text'], ['style.coords', 'Coordinates (empty = from the place)', 'text'],
    ['style.color', 'Main colour (map and text)', 'color'], ['style.syncMap', 'Map uses these settings', 'switch'], ['style.paper', 'Paper colour (also the map background)', 'color'],
    ['', 'TEXT', 'note'],
    ['style.font', 'Font', 'select', { Jost: 'Jost (geometric, like Futura)', Montserrat: 'Montserrat', Raleway: 'Raleway', 'Playfair Display': 'Playfair Display', Cinzel: 'Cinzel', Oswald: 'Oswald', Lora: 'Lora', 'Bebas Neue': 'Bebas Neue' }],
    ['style.showTitle', 'Show the title', 'switch'], ['style.titleColor', 'Title colour (empty = main colour)', 'color', null, (L) => L.style.showTitle !== false],
    ['style.titleSize', 'Title size', 'range', [0.4, 2.5, 0.05], (L) => L.style.showTitle !== false], ['style.titleWeight', 'Title weight', 'select', { 400: 'Regular', 500: 'Medium', 600: 'Semi-bold', 700: 'Bold', 800: 'Extra bold' }, (L) => L.style.showTitle !== false],
    ['style.spacing', 'Title letter spacing', 'range', [0, 0.8, 0.01], (L) => L.style.showTitle !== false],
    ['style.showSub', 'Show the second line', 'switch'], ['style.subColor', 'Second line colour', 'color', null, (L) => L.style.showSub !== false], ['style.subSize', 'Second line size', 'range', [0.4, 2.5, 0.05], (L) => L.style.showSub !== false], ['style.dashes', 'Dashes around the second line', 'switch', null, (L) => L.style.showSub !== false],
    ['style.showCoords', 'Show the coordinates', 'switch'], ['style.coordsColor', 'Coordinates colour', 'color', null, (L) => L.style.showCoords !== false], ['style.coordsSize', 'Coordinates size', 'range', [0.4, 2.5, 0.05], (L) => L.style.showCoords !== false],
    ['style.textPos', 'Text position', 'select', { bottom: 'Bottom', middle: 'Middle', top: 'Top' }], ['style.textY', 'Nudge text up / down', 'range', [-0.3, 0.3, 0.005]], ['style.textBand', 'Paper band behind the text', 'switch'],
    ['', 'MAP', 'note'],
    ['style.mapColor', 'Streets colour (empty = main colour)', 'color', null, (L) => L.style.syncMap !== false], ['style.roadColor', 'Main roads colour', 'color', null, (L) => L.style.syncMap !== false],
    ['style.roadWidth', 'Road thickness', 'range', [0.3, 4, 0.05], (L) => L.style.syncMap !== false], ['style.showMinor', 'Small streets', 'switch', null, (L) => L.style.syncMap !== false],
    ['style.showWater', 'Water', 'switch', null, (L) => L.style.syncMap !== false], ['style.waterColor', 'Water colour', 'color', null, (L) => L.style.syncMap !== false && L.style.showWater !== false],
    ['style.showParks', 'Parks and woods', 'switch', null, (L) => L.style.syncMap !== false], ['style.parkColor', 'Parks colour', 'color', null, (L) => L.style.syncMap !== false && L.style.showParks !== false],
    ['style.showBuildings', 'Buildings', 'switch', null, (L) => L.style.syncMap !== false], ['style.buildingColor', 'Buildings colour', 'color', null, (L) => L.style.syncMap !== false && L.style.showBuildings !== false],
    ['', 'SHAPE AND PAGE', 'note'],
    ['style.shape', 'Shape', 'select', { full: 'Full page (like Boston)', circle: 'Circle only (like Leeds)', circlefade: 'Circle focus, faded map around (like Rome, Tokyo)', rounded: 'Rounded square', heart: 'Heart' }],
    ['style.circle', 'Circle size', 'range', [0.4, 1.2, 0.01], (L) => L.style.shape !== 'full'], ['style.veil', 'Fade around the circle', 'range', [0, 1, 0.01], (L) => L.style.shape === 'circlefade'],
    ['style.fade', 'White fade at the bottom', 'range', [0, 0.7, 0.01]],
    ['style.page', 'Page', 'select', { portrait: 'Poster page on a wall', fill: 'Whole video frame' }], ['style.ratio', 'Poster size', 'select', { '4:5': '4 : 5 (8×10, 16×20)', '3:4': '3 : 4 (18×24)', '2:3': '2 : 3 (24×36)', A: 'A-series (A4, A3, A2)', '1:1': 'Square' }, (L) => L.style.page !== 'fill'],
    ['style.wall', 'Wall colour', 'color', null, (L) => L.style.page !== 'fill'], ['style.frame', 'Frame', 'select', { none: 'No frame', black: 'Black', white: 'White', oak: 'Oak', walnut: 'Walnut', gold: 'Gold' }, (L) => L.style.page !== 'fill'],
    ['style.grain', 'Paper grain', 'switch'],
  ],
  shipsink: [
    ['style.type', 'Ship', 'select', { tanker: 'Tanker (red deck, pipes)', cargo: 'Cargo ship (containers)', ferry: 'Ferry / passenger', fishing: 'Fishing boat', boat: 'Small boat' }],
    ['style.hull', 'Draw the ship (turn off when a 3D ship model sits here)', 'switch'],
    ['style.name', 'Ship name', 'text'], ['style.nameTag', 'Name tag', 'switch'],
    ['style.size', 'Size', 'range', [0.3, 5, 0.05]], ['style.heading', 'Heading (°)', 'range', [0, 359, 1]],
    ['style.listSide', 'Lists to', 'select', { 1: 'Starboard (right)', '-1': 'Port (left)' }], ['style.maxList', 'Largest list (°)', 'range', [10, 90, 1]],
    ['style.storm', 'Rough sea (whitecaps)', 'range', [0, 3, 0.05]],
    ['style.flare', 'Red distress flare', 'switch'], ['style.mayday', 'MAYDAY pulse rings', 'switch'], ['style.maydayText', 'MAYDAY text', 'text', null, (L) => L.style.mayday !== false],
    ['style.rafts', 'Life rafts after sinking', 'range', [0, 8, 1]], ['style.sheen', 'Fuel sheen on the water', 'switch'],
    ['style.sound', 'Storm + ship horn sound', 'switch'], ['style.soundVol', 'Sound volume', 'range', [0, 2, 0.05], (L) => L.style.sound !== false],
  ],
  layerswipe: [
    ['', 'Import each road file with the buttons below (GeoJSON, shapefile .zip, KML, GPX — UTM / Web Mercator files are converted automatically), or pick layers you already added. A GeoTIFF: add it with Imagery → Georeferenced image, then pick it. Your imagery underneath stays visible on both sides.', 'note'],
    ['', '🛰 Add imagery under both sides (GeoTIFF / image)', 'gvaction', 'swipeImagery'],
    ['', '📂 Import file for side A', 'gvaction', 'swipeImportA'],
    ['', '📂 Import file for side B', 'gvaction', 'swipeImportB'],
    ['', '🖼 Use a GeoTIFF / image as side A', 'gvaction', 'swipeTifA'], ['', '🖼 Use a GeoTIFF / image as side B', 'gvaction', 'swipeTifB'],
    ['style.layerA', 'Left / first side (A)', 'layerref', 'any'], ['style.labelA', 'Name of A', 'text', null, (L) => L.style.labels !== false],
    ['style.layerB', 'Right / second side (B)', 'layerref', 'any'], ['style.labelB', 'Name of B', 'text', null, (L) => L.style.labels !== false],
    ['style.dir', 'Divider', 'select', { lr: 'Vertical — swipes left ↔ right', tb: 'Horizontal — swipes top ↕ bottom', diag: 'Diagonal' }, (L) => L.anim !== 'blink'],
    ['style.split', 'Divider position (fixed, and while editing)', 'range', [0, 1, 0.01]],
    ['style.cycles', 'Swipes back and forth (times)', 'range', [0.5, 6, 0.5], (L) => L.anim === 'sweep' || L.anim === 'blink'],
    ['style.hold', 'Pause at each end', 'range', [0, 0.4, 0.01], (L) => L.anim !== 'hold'],
    ['style.lineColor', 'Divider colour', 'color', null, (L) => L.anim !== 'blink'], ['style.lineWidth', 'Divider width', 'range', [0, 10, 0.5], (L) => L.anim !== 'blink'], ['style.knob', 'Handle on the divider', 'switch', null, (L) => L.anim !== 'blink'],
    ['style.labels', 'Name labels', 'switch'], ['style.labelPos', 'Labels at', 'select', { top: 'Top', bottom: 'Bottom', middle: 'Middle' }, (L) => L.style.labels !== false], ['style.textSize', 'Label size', 'range', [0.5, 2.5, 0.05], (L) => L.style.labels !== false],
    ['style.chips', 'Colour swatch of each layer in its label', 'switch', null, (L) => L.style.labels !== false],
  ],
  softlabel: [['style.text', 'Text', 'text'], ['style.size', 'Size', 'range', [0.4, 4, 0.05]], ['style.color', 'Colour', 'color'], ['style.weight', 'Weight', 'select', { 300: 'Light', 500: 'Medium', 700: 'Bold' }], ['style.shadow', 'Soft shadow', 'range', [0, 1, 0.01]], ['style.dot', 'Dot at the place', 'switch'], ...SND],
};
export const MX_SET = new Set(Object.keys(MX_KINDS));
export const mxPhases = (k) => (k === 'inkreveal' || k === 'flickerzones' ? ['below'] : ['captions']);

// ---------------------------------------------------------------- messages (chat bubbles / notifications)
const MSG_LOOKS = {
  glass: { me: 'rgba(255,255,255,0.16)', them: 'rgba(255,255,255,0.10)', txMe: '#ffffff', txThem: '#ffffff', glass: true },
  imessage: { me: '#1f8bff', them: '#e9e9eb', txMe: '#ffffff', txThem: '#111111' },
  whatsapp: { me: '#2fdc4c', them: '#ffffff', txMe: '#ffffff', txThem: '#111111' },
  pill: { me: '#1f6f63', them: '#9d8cf0', txMe: '#ffffff', txThem: '#ffffff', pill: true },
  thread: { me: '#3d8bd4', them: '#c9c9c9', txMe: '#ffffff', txThem: '#333333', square: true },
  dark: { me: '#2c2c2e', them: '#1c1c1e', txMe: '#ffffff', txThem: '#ffffff' },
  holo: { me: 'rgba(80,220,255,0.12)', them: 'rgba(80,220,255,0.12)', txMe: '#c8f6ff', txThem: '#c8f6ff', holo: true },
  notify: { me: 'rgba(245,245,247,0.78)', them: 'rgba(245,245,247,0.78)', txMe: '#111111', txThem: '#111111', notify: true, glass: true },
};
function parseMsgs(s) {
  const me = String(s.me || 'Me').trim().toLowerCase();
  return String(s.thread || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    let p = l.split('|').map((x) => x.trim());
    if (p.length === 1) { const m = l.match(/^([^:]{1,30}):\s*(.+)$/); p = m ? [m[1], '', m[2]] : [s.them || 'Them', '', l]; }
    else if (p.length === 2) p = [p[0], '', p[1]];
    const [name, time, ...rest] = p;
    return { name, time, text: rest.join(' | '), mine: name.toLowerCase() === me };
  });
}
function wrapText(ctx, text, maxW) {
  const out = []; for (const para of String(text).split('\n')) { let line = ''; for (const w of para.split(/\s+/)) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } out.push(line); }
  return out;
}
/** blurred copy of what is behind a rectangle (map + overlay so far), for frosted glass */
function backdrop(ctx, o, x, y, w, h, blur) {
  const T = ctx.getTransform(), S = Math.abs(T.a) || 1, k = 0.35;
  const cw = Math.max(2, Math.round(w * S * k)), ch = Math.max(2, Math.round(h * S * k)), pad = Math.ceil(blur * S * k * 2);
  const key = 'msgbd'; let C = backdrop[key]; if (!C || C.width < cw + 2 * pad || C.height < ch + 2 * pad) { C = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(cw + 2 * pad, ch + 2 * pad) : Object.assign(document.createElement('canvas'), { width: cw + 2 * pad, height: ch + 2 * pad }); backdrop[key] = C; }
  const g = C.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, C.width, C.height);
  const W2 = cw + 2 * pad, H2 = ch + 2 * pad, ox = x - pad / (S * k), oy = y - pad / (S * k), ow = W2 / (S * k), oh = H2 / (S * k);
  const m = o.map, mc = m?.getCanvas?.();
  if (mc && mc.width && mc !== ctx.canvas) {
    try {
      const c = m.getCenter(), a = m.project(c), pa = o.proj([c.lng, c.lat]), q = m.unproject([a.x + 100, a.y]), pq = o.proj([q.lng, q.lat]);
      const kk = Math.hypot(pq[0] - pa[0], pq[1] - pa[1]) / 100 || 1, pr = mc.width / (mc.clientWidth || mc.width);
      g.drawImage(mc, (a.x + (ox - pa[0]) / kk) * pr, (a.y + (oy - pa[1]) / kk) * pr, (ow / kk) * pr, (oh / kk) * pr, 0, 0, W2, H2);
    } catch { /* */ }
  }
  try { g.drawImage(ctx.canvas, T.a * ox + T.e, T.d * oy + T.f, ow * T.a, oh * T.d, 0, 0, W2, H2); } catch { /* */ }
  const B = backdrop.b2 && backdrop.b2.width >= W2 && backdrop.b2.height >= H2 ? backdrop.b2 : (backdrop.b2 = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W2, H2) : Object.assign(document.createElement('canvas'), { width: W2, height: H2 }));
  const b = B.getContext('2d'); b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, B.width, B.height); try { b.filter = `blur(${Math.max(1, blur * S * k)}px) saturate(1.4)`; } catch { /* */ }
  b.drawImage(C, 0, 0, W2, H2, 0, 0, W2, H2); b.filter = 'none';
  return { cv: B, sx: pad, sy: pad, sw: cw, sh: ch };
}
function avatar(ctx, id, name, x, y, r, col) {
  const im = id ? msgImage(id) : null;
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
  if (im?.ready) { ctx.clip(); const k = Math.max(2 * r / im.w, 2 * r / im.h); ctx.drawImage(im.bmp, x - im.w * k / 2, y - im.h * k / 2, im.w * k, im.h * k); }
  else { ctx.fillStyle = col; ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `700 ${r}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(name || '?').trim().slice(0, 1).toUpperCase(), x, y + r * 0.05); }
  ctx.restore();
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1, r * 0.1); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}
function msgTimes(L) {
  const s = L.style, list = parseMsgs(s), iv = Math.max(0.3, +s.interval || 1.6), ty = s.typing !== false && L.anim !== 'type' ? Math.max(0.3, +s.typingSec || 0.9) : 0;
  let t = +L.start || 0; return list.map((m, i) => { const typeAt = t + (i ? 0 : 0.2); const at = typeAt + (!m.mine && ty ? ty : 0); t = at + iv; return { ...m, typeAt, at }; });
}
function drawMessages(ctx, L, tm, o) {
  const s = L.style, fr = o.frame; if (!fr) return;
  const A = tm.alpha ?? 1; if (A <= 0) return;
  const lk = { ...(MSG_LOOKS[s.look] || MSG_LOOKS.glass) };
  if (s.colorMe) lk.me = s.colorMe; if (s.colorThem) lk.them = s.colorThem; if (s.textMe) lk.txMe = s.textMe; if (s.textThem) lk.txThem = s.textThem;
  const u = fr.w / 1920, sz = clamp(+s.size || 1, 0.4, 3), fs = 32 * u * sz, font = s.font || 'Inter';
  const W = fr.w * clamp(+s.width || 0.36, 0.15, 0.95), maxB = W * (lk.notify ? 1 : 0.78), padX = fs * 0.85, padY = fs * 0.55, lh = fs * 1.28, gap = fs * clamp(+(s.gap ?? 0.5), 0, 3);
  const av = s.avatars !== false && !lk.pill && !lk.thread, ar = fs * 1.05, showName = s.names !== false, showTime = s.times !== false;
  const now = o.time == null || tm.edit ? Infinity : o.time;
  const list = msgTimes(L), keep = Math.max(1, Math.round(+s.keep || 6));
  const an = L.anim || 'pop';
  // which messages are on screen (in the editor: all)
  const vis = list.filter((m) => now >= m.typeAt);
  // layout every visible message (bottom-up)
  ctx.save(); ctx.font = `${s.bold ? 700 : 500} ${fs}px "${font}", Inter, system-ui, sans-serif`;
  const items = vis.map((m) => {
    const shown = now >= m.at; const typing = !shown;
    const txt = an === 'type' && shown ? m.text.slice(0, Math.max(0, Math.floor((now - m.at) * (+s.cps || 28)))) : m.text;
    const lines = typing ? [] : wrapText(ctx, m.text, maxB - padX * 2 - (lk.notify ? ar * 2.4 : 0));
    const tw = typing ? fs * 3 : Math.max(...lines.map((l) => ctx.measureText(l).width));
    const head = (lk.pill || lk.thread || lk.notify || (showName && !m.mine && s.look === 'glass')) && (showName || showTime) ? fs * (lk.notify ? 1.25 : 1.1) : 0;
    const bw = lk.notify ? maxB : Math.min(maxB, tw + padX * 2), bh = (typing ? fs * 1.4 : lines.length * lh) + padY * 2 + (lk.notify ? head : 0);
    const k = an === 'fade' ? 1 : ease(clamp((now - (typing ? m.typeAt : m.at)) / 0.35, 0, 1));
    return { m, typing, txt, lines, bw, bh, head: lk.notify ? 0 : head, k, pr: clamp((now - m.typeAt) / 0.4, 0, 1) };
  });
  const shownItems = items.slice(-keep);
  const totalH = shownItems.reduce((a, it) => a + (it.bh + it.head + gap) * (an === 'fade' ? 1 : Math.min(1, it.pr * 1.3)), 0);
  // anchor box (draggable)
  const anchor = s.anchor || 'right';
  const bx = anchor === 'left' ? fr.x + fr.w * 0.05 : anchor === 'center' ? fr.x + (fr.w - W) / 2 : fr.x + fr.w * 0.95 - W;
  const by = fr.y + fr.h * clamp(+(s.bottom ?? 0.82), 0.2, 0.98);
  const boxH = Math.max(totalH, fs * 4);
  placeAt(ctx, L, fr, bx, by - boxH, W, boxH, { key: 'chat' });
  let y = by; const bob = lk.holo ? Math.sin((o.time || 0) * 1.6) * 4 * u : 0;
  for (let i = shownItems.length - 1; i >= 0; i--) {
    const it = shownItems[i], m = it.m, grow = an === 'fade' ? 1 : Math.min(1, it.pr * 1.3);
    const hgt = (it.bh + it.head + gap) * grow; y -= hgt;
    const old = shownItems.length - 1 - i; const fadeOld = s.fadeOld === false ? 1 : clamp(1 - (old - (keep - 2)) * 0.5, 0.25, 1);
    const right = m.mine && !lk.notify;
    const xL = right ? bx + W - it.bw - (av ? ar * 2.6 : 0) : bx + (av && !lk.notify ? ar * 2.6 : 0);
    const yT = y + it.head + bob;
    let a = A * fadeOld * (an === 'fade' ? ease(clamp(it.pr * 1.5, 0, 1)) : clamp(it.k * 1.4, 0, 1));
    if (lk.holo && it.k < 1) a *= 0.5 + 0.5 * Math.round(Math.random() * 0.6 + it.k);
    if (a <= 0.005) continue;
    ctx.save(); ctx.globalAlpha *= a;
    // entrance
    const cx = right ? xL + it.bw : xL, cy = yT + it.bh;
    if (an === 'pop' || an === 'type') { const sc = 0.4 + 0.6 * it.k + Math.sin(it.k * Math.PI) * 0.08; ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy); }
    else if (an === 'slide') ctx.translate((right ? 1 : -1) * (1 - it.k) * fs * 6, 0);
    else if (an === 'float') ctx.translate(0, (1 - it.k) * fs * 2.5);
    // header (name // time)
    if (it.head && (showName || showTime)) {
      const ht = [showName ? (m.mine && lk.pill ? (s.me || 'Me') : m.name) : '', showTime ? m.time : ''].filter(Boolean).join(lk.pill ? '// ' : '  //  ');
      ctx.font = `${lk.pill ? 800 : 600} ${fs * (lk.pill ? 0.72 : 0.62)}px "${font}", Inter, sans-serif`; ctx.textBaseline = 'alphabetic'; ctx.textAlign = right ? 'right' : 'left';
      ctx.fillStyle = s.headColor || (lk.thread ? '#ffffff' : 'rgba(255,255,255,0.92)'); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4 * u;
      ctx.fillText(ht, right ? xL + it.bw - fs * 0.2 : xL + fs * 0.2, yT - fs * 0.32); ctx.shadowBlur = 0;
    }
    // bubble
    const r = lk.square ? fs * 0.25 : lk.pill ? it.bh / 2 : lk.notify ? fs * 0.9 : fs * 0.95;
    const shape = () => { ctx.beginPath(); ctx.roundRect(xL, yT, it.bw, it.bh, Math.min(r, it.bh / 2));
      if (s.tail !== false && !lk.pill && !lk.notify && !lk.square && !lk.holo) { const tx = right ? xL + it.bw : xL, d = right ? 1 : -1, ty = yT + it.bh; const P1 = [tx - d * fs * 0.6, ty - fs * 0.9], C1 = [tx + d * fs * 0.05, ty - fs * 0.1], P2 = [tx + d * fs * 0.45, ty + fs * 0.02], C2 = [tx - d * fs * 0.2, ty], P3 = [tx - d * fs * 0.9, ty - fs * 0.3];
        if (d > 0) { ctx.moveTo(...P1); ctx.quadraticCurveTo(...C1, ...P2); ctx.quadraticCurveTo(...C2, ...P3); } else { ctx.moveTo(...P3); ctx.quadraticCurveTo(...C2, ...P2); ctx.quadraticCurveTo(...C1, ...P1); } ctx.closePath(); } };
    const fill = right ? lk.me : lk.them;
    if (s.shadow !== false && !lk.holo) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 18 * u; ctx.shadowOffsetY = 5 * u; shape(); ctx.fillStyle = lk.glass ? 'rgba(0,0,0,0.001)' : fill; ctx.fill(); ctx.restore(); }
    if (lk.glass) {
      const bd = backdrop(ctx, o, xL, yT, it.bw, it.bh, clamp(+(s.blur ?? 14), 0, 40) * u);
      ctx.save(); shape(); ctx.clip(); ctx.drawImage(bd.cv, bd.sx, bd.sy, bd.sw, bd.sh, xL, yT, it.bw, it.bh);
      ctx.fillStyle = fill; ctx.fillRect(xL, yT, it.bw, it.bh);
      if (s.tint) { ctx.globalAlpha *= 0.35; ctx.fillStyle = s.tint; ctx.fillRect(xL, yT, it.bw, it.bh); ctx.globalAlpha /= 0.35; }
      const hl = ctx.createLinearGradient(0, yT, 0, yT + it.bh); hl.addColorStop(0, 'rgba(255,255,255,0.28)'); hl.addColorStop(0.45, 'rgba(255,255,255,0.04)'); hl.addColorStop(1, 'rgba(255,255,255,0.08)'); ctx.fillStyle = hl; ctx.fillRect(xL, yT, it.bw, it.bh);
      ctx.restore();
      ctx.save(); shape(); const st = ctx.createLinearGradient(xL, yT, xL + it.bw, yT + it.bh); st.addColorStop(0, 'rgba(255,255,255,0.7)'); st.addColorStop(0.5, 'rgba(255,255,255,0.15)'); st.addColorStop(1, 'rgba(255,255,255,0.45)'); ctx.strokeStyle = st; ctx.lineWidth = 1.3 * u; ctx.stroke(); ctx.restore();
    } else if (lk.holo) {
      ctx.save(); shape(); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = 'rgba(80,220,255,0.9)'; ctx.shadowBlur = 16 * u; ctx.strokeStyle = 'rgba(120,235,255,0.85)'; ctx.lineWidth = 1.4 * u; ctx.stroke(); ctx.shadowBlur = 0; ctx.clip();
      ctx.fillStyle = 'rgba(120,235,255,0.07)'; for (let sy = yT; sy < yT + it.bh; sy += 3 * u) ctx.fillRect(xL, sy, it.bw, 1 * u); ctx.restore();
    } else { shape(); ctx.fillStyle = fill; ctx.fill(); }
    // avatar
    if (av && !lk.notify) avatar(ctx, right ? s.avatarMe : s.avatarThem, m.name, right ? bx + W - ar * 1.1 : bx + ar * 1.1, yT + it.bh - ar, ar, right ? '#5b6cff' : '#ff7a59');
    // text / typing dots
    const tx0 = lk.notify ? xL + padX + ar * 2.4 : xL + padX;
    ctx.fillStyle = right ? lk.txMe : lk.txThem; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    if (lk.holo) { ctx.shadowColor = 'rgba(80,220,255,0.9)'; ctx.shadowBlur = 8 * u; }
    if (it.typing) { for (let d = 0; d < 3; d++) { const ph = ((o.time || 0) * 3 - d * 0.35) % 1.2; const up = ph > 0 && ph < 0.6 ? Math.sin(ph / 0.6 * Math.PI) : 0; ctx.globalAlpha *= 1; ctx.beginPath(); ctx.arc(xL + padX + fs * 0.4 + d * fs * 0.85, yT + it.bh / 2 - up * fs * 0.25, fs * 0.22, 0, Math.PI * 2); ctx.fill(); } }
    else {
      if (lk.notify) {
        avatar(ctx, right ? s.avatarMe : s.avatarThem, m.name, xL + padX + ar, yT + padY + ar * 1.05, ar, right ? '#5b6cff' : '#34c759');
        ctx.font = `700 ${fs * 0.82}px "${font}", Inter, sans-serif`; ctx.fillText(m.name, tx0, yT + padY + fs * 0.5);
        ctx.font = `500 ${fs * 0.62}px "${font}", Inter, sans-serif`; ctx.textAlign = 'right'; ctx.globalAlpha *= 0.6; ctx.fillText(m.time || s.app || 'now', xL + it.bw - padX, yT + padY + fs * 0.5); ctx.globalAlpha /= 0.6; ctx.textAlign = 'left';
      }
      ctx.font = `${s.bold || lk.pill ? 700 : 500} ${fs}px "${font}", Inter, system-ui, sans-serif`;
      let left = it.txt.length; const y0 = yT + padY + lh / 2 + (lk.notify ? fs * 1.25 : 0);
      it.lines.forEach((ln, li) => { if (left <= 0) return; const part = ln.slice(0, left); left -= ln.length + 1; ctx.fillText(part, tx0, y0 + li * lh); });
    }
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- map poster
const dms = (v, pos, neg) => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), sec = Math.round(((a - d) * 60 - m) * 60); return `${d}°${m}'${sec}"${v >= 0 ? pos : neg}`; };
const FRAMES = { black: ['#1b1b1b', '#3a3a3a'], white: ['#f4f2ee', '#d9d5cf'], oak: ['#b98a55', '#8a6136'], walnut: ['#5a3a24', '#3b2516'], gold: ['#d4af5a', '#9b7a2c'] };
let GRAIN = null;
function grainPattern(ctx) {
  if (!GRAIN) { const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(128, 128) : Object.assign(document.createElement('canvas'), { width: 128, height: 128 }); const g = c.getContext('2d'); const d = g.createImageData(128, 128); for (let i = 0; i < d.data.length; i += 4) { const v = 120 + Math.random() * 135; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 14; } g.putImageData(d, 0, 0); GRAIN = c; }
  return ctx.createPattern(GRAIN, 'repeat');
}
function heartPath(ctx, cx, cy, r) { ctx.moveTo(cx, cy + r * 0.85); ctx.bezierCurveTo(cx - r * 1.35, cy + r * 0.05, cx - r * 0.95, cy - r * 1.05, cx, cy - r * 0.45); ctx.bezierCurveTo(cx + r * 0.95, cy - r * 1.05, cx + r * 1.35, cy + r * 0.05, cx, cy + r * 0.85); ctx.closePath(); }
const posterLook = (s) => ({ posterColor: s.mapColor || s.color || '', posterPaper: s.paper && s.paper.toLowerCase() !== '#ffffff' ? s.paper : '', posterWater: s.waterColor || '', posterPark: s.parkColor || '', posterBuilding: s.buildingColor || '', posterRoads: s.roadColor || '',
  posterNoBuildings: s.showBuildings === false, posterNoMinor: s.showMinor === false, posterNoWater: s.showWater === false, posterNoParks: s.showParks === false, posterRoadWidth: +s.roadWidth && +s.roadWidth !== 1 ? +s.roadWidth : '' });
function drawPoster(ctx, L, tm, o) {
  const s = L.style, fr = o.frame; if (!fr) return;
  const A = tm.alpha ?? 1; if (A <= 0) return;
  // keep the map in the poster's colour (editing only, not while exporting)
  const sc = o.scene;
  if (sc && globalThis.__lookChanged && !globalThis.__exportingNow) {
    if (s.autoTheme !== false && !THEMES[sc.look.theme]?.poster) { s.autoTheme = false; sc.look.theme = 'postersage'; Object.assign(sc.look, posterLook(s)); queueMicrotask(() => globalThis.__lookChanged?.()); }
    else if (s.syncMap !== false && THEMES[sc.look.theme]?.poster) {
      const want = posterLook(s); let ch = false;
      for (const [k2, v] of Object.entries(want)) if ((sc.look[k2] ?? '') !== (v ?? '')) { sc.look[k2] = v; ch = true; }
      if (ch) queueMicrotask(() => globalThis.__lookChanged?.());
    }
  }
  const D = Math.max(0.5, +L.duration || 4), tau = o.time == null || tm.edit ? 99 : o.time - (+L.start || 0), k = clamp(tau / D, 0, 1);
  const an = L.anim || 'build', u = fr.w / 1920;
  const paper = s.paper || '#ffffff', col = s.color || '#5f8a48';
  // the page
  let pg;
  if (s.page === 'fill') pg = { x: fr.x, y: fr.y, w: fr.w, h: fr.h };
  else {
    const R = { '4:5': 0.8, '3:4': 0.75, '2:3': 2 / 3, A: 1 / 1.4142, '1:1': 1 }[s.ratio] || 0.8;
    const h = fr.h * (s.frame && s.frame !== 'none' ? 0.8 : 0.88), w = h * R;
    pg = { x: fr.x + (fr.w - w) / 2, y: fr.y + (fr.h - h) / 2, w, h };
  }
  const slide = an === 'print' ? 1 - ease(seg(k, 0, 0.45)) : 0;
  const pgY = pg.y + slide * fr.h * 0.9;
  ctx.save(); ctx.globalAlpha *= A;
  const cx = pg.x + pg.w / 2;
  if (s.page !== 'fill') {
    // wall around the page (hides the map outside it) and the page's shadow
    ctx.save(); ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); ctx.rect(pg.x, pgY, pg.w, pg.h); ctx.fillStyle = s.wall || '#e9e5df'; ctx.fill('evenodd'); ctx.restore();
    if (slide > 0) { ctx.save(); ctx.beginPath(); ctx.rect(pg.x, pg.y, pg.w, pgY - pg.y); ctx.fillStyle = s.wall || '#e9e5df'; ctx.fill(); ctx.restore(); }
  }
  // the map shows through the page, cut to the chosen shape
  ctx.save(); ctx.beginPath(); ctx.rect(pg.x, pgY, pg.w, pg.h); ctx.clip();
  ctx.translate(0, pgY - pg.y);
  const shape = s.shape || 'full';
  const grow = an === 'still' ? 1 : ease(seg(k, an === 'print' ? 0.35 : 0.02, an === 'print' ? 0.75 : 0.55));
  const ccy = pg.y + pg.h * (shape === 'circle' ? 0.4 : 0.43), cr = pg.w / 2 * clamp(+s.circle || 0.86, 0.3, 1.3);
  const cut = (r) => { if (shape === 'rounded') { ctx.roundRect(cx - r, ccy - r, 2 * r, 2 * r, r * 0.18); } else if (shape === 'heart') heartPath(ctx, cx, ccy, r * 0.95); else { ctx.moveTo(cx + r, ccy); ctx.arc(cx, ccy, r, 0, Math.PI * 2); } };
  if (shape === 'full') {
    if (grow < 1) { const R = Math.hypot(pg.w, pg.h) * grow; ctx.beginPath(); ctx.rect(pg.x, pg.y, pg.w, pg.h); ctx.arc(cx, ccy, Math.max(0.1, R), 0, Math.PI * 2); ctx.fillStyle = paper; ctx.fill('evenodd'); }
  } else {
    ctx.save(); ctx.beginPath(); ctx.rect(pg.x, pg.y, pg.w, pg.h); cut(Math.max(0.1, cr * grow)); ctx.clip('evenodd');
    ctx.fillStyle = paper; ctx.globalAlpha *= shape === 'circlefade' ? clamp(+(s.veil ?? 0.75), 0, 1) * (0.4 + 0.6 * grow) + (1 - grow) * 0.6 : 1; ctx.fillRect(pg.x, pg.y, pg.w, pg.h); ctx.restore();
  }
  // white fade at the bottom, under the title
  const fd = clamp(+(s.fade ?? 0.38), 0, 0.8);
  if (fd > 0) { const y0 = pg.y + pg.h * (1 - fd - 0.12), y1 = pg.y + pg.h * 0.9; const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, hexA(paper, 0)); g.addColorStop(1, hexA(paper, 1)); ctx.fillStyle = g; ctx.fillRect(pg.x, y0, pg.w, pg.y + pg.h - y0); }
  if (s.grain !== false) { ctx.fillStyle = grainPattern(ctx); ctx.fillRect(pg.x, pg.y, pg.w, pg.h); }
  // title, second line, coordinates
  const ta = an === 'still' ? 1 : ease(seg(k, an === 'print' ? 0.55 : 0.35, an === 'print' ? 0.9 : 0.8));
  const ts = pg.w * 0.085 * clamp(+s.titleSize || 1, 0.3, 3), font = s.font || 'Jost', sp = clamp(+(s.spacing ?? 0.28), 0, 1);
  const tpos = s.textPos || 'bottom';
  const ty = pg.y + pg.h * ((tpos === 'top' ? 0.14 : tpos === 'middle' ? 0.52 : shape === 'circle' ? 0.87 : 0.83) + (+s.textY || 0));
  if (s.textBand) { ctx.save(); ctx.globalAlpha *= 0.88 * ta; ctx.fillStyle = paper; ctx.fillRect(pg.x, ty - ts * 1.15, pg.w, ts * 2.25); ctx.restore(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const spaced = (txt, size, weight, y, spacing, a, color) => {
    if (!txt || a <= 0) return; ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = color || col; ctx.font = `${weight} ${size}px "${font}", Jost, Montserrat, sans-serif`;
    try { ctx.letterSpacing = `${size * spacing}px`; } catch { /* */ }
    ctx.fillText(txt, cx + size * spacing / 2, y); ctx.restore();
  };
  if (s.showTitle !== false) spaced(String(s.title || ''), ts, +s.titleWeight || 600, ty, sp + (1 - ta) * 0.5, ta, s.titleColor);
  const ta2 = an === 'still' ? 1 : ease(seg(k, an === 'print' ? 0.7 : 0.55, 1));
  const sub = String(s.sub || '');
  const y0 = s.showTitle === false ? ty - ts * 0.6 : ty;
  const showSub = sub && s.showSub !== false, ss = ts * 0.3 * clamp(+s.subSize || 1, 0.3, 3);
  if (showSub) spaced(s.dashes === false ? sub : `—  ${sub}  —`, ss, 500, y0 + ts * 0.3 + ss * 1.1, 0.3, ta2, s.subColor);
  const c0 = L.geom?.coordinates;
  const coords = s.coords || (c0 ? `${dms(c0[0], 'E', 'W')}  ${dms(c0[1], 'N', 'S')}` : '');
  const cs = ts * 0.28 * clamp(+s.coordsSize || 1, 0.3, 3);
  if (s.showCoords !== false) spaced(coords, cs, 500, y0 + ts * 0.3 + (showSub ? ss * 1.65 : 0) + cs * 1.2, 0.36, ta2, s.coordsColor);
  ctx.restore();
  // the frame (and how it closes in when printing)
  if (s.page !== 'fill' && s.frame && s.frame !== 'none') {
    const fa = an === 'print' ? ease(seg(k, 0.4, 0.75)) : an === 'still' ? 1 : ease(seg(k, 0, 0.3));
    const [c1, c2] = FRAMES[s.frame] || FRAMES.black, fw = pg.w * 0.055, gap = (1 - fa) * fr.h * 0.08;
    const x = pg.x - fw - gap, y = pgY - fw - gap, w = pg.w + 2 * (fw + gap), h = pg.h + 2 * (fw + gap);
    ctx.save(); ctx.globalAlpha *= fa;
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 30 * u; ctx.shadowOffsetY = 12 * u;
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.rect(x + fw, y + fw, w - 2 * fw, h - 2 * fw);
    const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g; ctx.fill('evenodd');
    ctx.shadowColor = 'transparent'; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5 * u; ctx.strokeRect(x + fw, y + fw, w - 2 * fw, h - 2 * fw);
    ctx.restore();
  } else if (s.page !== 'fill') {
    ctx.save(); ctx.globalAlpha *= 0.35; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 24 * u; ctx.shadowOffsetY = 10 * u; ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.strokeRect(pg.x, pgY, pg.w, pg.h); ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- ship sinking
function drawShipSink(ctx, L, tm, o) {
  if (L.geom?.type !== 'Point') return;
  const s = L.style, u0 = o.unit, A = tm.alpha ?? 1; if (A <= 0) return;
  const [x, y] = o.proj(L.geom.coordinates);
  const D = Math.max(1, +L.duration || 12), tau = o.time == null ? D * 0.42 : o.time - (+L.start || 0);
  const k = clamp(tau / D, 0, 1), t = o.time ?? 0;
  const an = L.anim || 'sink';
  const listU = an === 'afloat' ? 0 : an === 'gone' ? 1 : ease(seg(k, 0.18, an === 'list' ? 0.7 : 0.52));
  const sinkU = an === 'sink' ? ease(seg(k, 0.52, 0.82)) : an === 'gone' ? 1 : 0;
  const afterU = an === 'sink' ? seg(k, 0.6, 1) : an === 'gone' ? 1 : 0;
  const S = u0 * clamp(+s.size || 1, 0.3, 5), Lp = 120 * S, Wp = Lp * (s.type === 'boat' || s.type === 'fishing' ? 0.3 : 0.15);
  // heading is a compass bearing on the map: find its direction on screen (follows map rotation and tilt)
  const hd = (+s.heading || 0) * D2R, c0 = L.geom.coordinates, e = 2e-4;
  const q1 = o.proj([c0[0] + (Math.sin(hd) * e) / Math.max(0.2, Math.cos(c0[1] * D2R)), c0[1] + Math.cos(hd) * e]);
  const ang = q1 && Number.isFinite(q1[0]) ? Math.atan2(q1[1] - y, q1[0] - x) : hd - Math.PI / 2, side = +s.listSide < 0 ? -1 : 1;
  const lst = listU * clamp(+s.maxList || 90, 10, 90) * D2R;
  const r = (i) => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  ctx.save(); ctx.globalAlpha *= A;
  // rough sea: whitecaps drifting around the ship
  const storm = clamp(+(s.storm ?? 1), 0, 3);
  if (storm > 0) {
    const R = Lp * 4.5, n = Math.round(70 * storm);
    ctx.strokeStyle = 'rgba(235,245,255,0.55)'; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const ph = (t * 0.25 + r(i)) % 1, a = r(i + 50) * 6.283, d = Math.sqrt(r(i + 90)) * R;
      const px = x + Math.cos(a) * d + ph * 30 * S, py = y + Math.sin(a) * d * 0.8 + ph * 12 * S;
      const al = Math.sin(ph * Math.PI) * 0.6 * Math.min(1, storm);
      ctx.globalAlpha = A * al; ctx.lineWidth = (1 + r(i + 7) * 1.5) * S; const w = (6 + r(i + 3) * 12) * S;
      ctx.beginPath(); ctx.moveTo(px - w / 2, py); ctx.quadraticCurveTo(px, py - 2 * S, px + w / 2, py); ctx.stroke();
    }
    ctx.globalAlpha = A;
  }
  // fuel sheen after the sinking
  if (s.sheen && afterU > 0) {
    ctx.save(); ctx.translate(x + 30 * S * afterU, y + 10 * S * afterU); ctx.rotate(0.4); ctx.scale(1, 0.55);
    const R = Lp * (0.6 + afterU * 1.6); const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, `rgba(40,30,60,${0.35 * afterU})`); g.addColorStop(0.5, `rgba(120,60,140,${0.18 * afterU})`); g.addColorStop(0.75, `rgba(60,140,120,${0.12 * afterU})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill(); ctx.restore();
  }
  // MAYDAY pulse rings
  if (s.mayday !== false && an !== 'afloat' && an !== 'gone' && k < 0.58) {
    for (let i = 0; i < 3; i++) { const ph = ((tau * 0.6 + i / 3) % 1); const R = Lp * (0.6 + ph * 2.6); ctx.strokeStyle = `rgba(255,60,60,${0.7 * (1 - ph)})`; ctx.lineWidth = 2.5 * S; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.stroke(); }
  }
  // foam ring + wake around the hull
  const foamA = 0.35 + 0.4 * listU + 0.3 * sinkU - 0.6 * afterU;
  if (foamA > 0.02) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    for (let i = 0; i < 40; i++) { const a = r(i + 200) * 6.283, ph = (t * 0.7 + r(i + 300)) % 1; const ex = Math.cos(a) * (Lp * 0.55 + ph * 14 * S), ey = Math.sin(a) * (Wp * 0.9 + 6 * S + ph * 10 * S + Wp * listU * 0.8);
      ctx.fillStyle = `rgba(245,250,255,${clamp(foamA * (1 - ph), 0, 1) * 0.8})`; ctx.beginPath(); ctx.ellipse(ex, ey, (4 + r(i) * 6) * S, (2 + r(i + 1) * 3) * S, 0, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  // the ship (hidden progressively as it goes under, stern last)
  if (sinkU < 1 && s.hull !== false) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const bob = Math.sin(t * 1.7) * 1.5 * S * (1 - listU);
    ctx.translate(0, bob);
    const vis = 1 - sinkU; // fraction of length still above water (bow goes first)
    ctx.beginPath(); ctx.rect(-Lp, -Lp, Lp * 2, Lp * 2); ctx.clip();
    ctx.save(); ctx.beginPath(); ctx.rect(-Lp / 2 - 2, -Lp, Lp * vis + 4, Lp * 2); ctx.clip();
    ctx.globalAlpha *= 1 - sinkU * 0.5;
    const cw = Wp * Math.cos(lst), sh = Wp * 0.9 * Math.sin(lst); // deck width seen from above, hull side seen
    const hull = (w) => { ctx.beginPath(); ctx.moveTo(-Lp / 2, -w / 2); ctx.lineTo(Lp * 0.36, -w / 2); ctx.quadraticCurveTo(Lp / 2, -w * 0.2, Lp / 2 + 2 * S, 0); ctx.quadraticCurveTo(Lp / 2, w * 0.2, Lp * 0.36, w / 2); ctx.lineTo(-Lp / 2, w / 2); ctx.closePath(); };
    // shadow / underwater dark hull
    ctx.save(); ctx.translate(0, side * (cw / 2 + sh / 2)); ctx.fillStyle = 'rgba(0,10,20,0.35)'; hull(Math.max(cw, 2) + sh + 6 * S); ctx.fill(); ctx.restore();
    // hull side (black topsides, red bottom) as the ship rolls
    if (sh > 0.5) { ctx.save(); ctx.translate(0, side * (cw / 2 + sh / 2)); hull(sh);
      const g = ctx.createLinearGradient(0, -side * sh / 2, 0, side * sh / 2); g.addColorStop(0, '#1c1f24'); g.addColorStop(0.55, '#24272c'); g.addColorStop(0.56, '#8f2a20'); g.addColorStop(1, '#6e1d16'); ctx.fillStyle = g; ctx.fill(); ctx.restore(); }
    // deck
    if (cw > 0.6) {
      ctx.save(); hull(cw);
      const deck = s.type === 'tanker' ? '#9b3a2c' : s.type === 'cargo' ? '#3b4148' : s.type === 'ferry' ? '#e9ecef' : s.type === 'fishing' ? '#2f6f9a' : '#e6e6e6';
      ctx.fillStyle = deck; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.8 * S; ctx.stroke(); ctx.clip();
      ctx.scale(1, Math.max(0.05, cw / Wp));
      if (s.type === 'tanker') { ctx.strokeStyle = '#d9d3c4'; ctx.lineWidth = 1.2 * S; ctx.beginPath(); ctx.moveTo(-Lp * 0.28, 0); ctx.lineTo(Lp * 0.42, 0); ctx.stroke(); for (let i = 0; i < 6; i++) { const px = -Lp * 0.2 + i * Lp * 0.1; ctx.beginPath(); ctx.moveTo(px, -Wp * 0.3); ctx.lineTo(px, Wp * 0.3); ctx.stroke(); } }
      if (s.type === 'cargo') { const cols = ['#c0392b', '#2471a3', '#d4ac0d', '#7d3c98', '#1e8449']; for (let i = 0; i < 12; i++) for (let j = 0; j < 3; j++) { ctx.fillStyle = cols[(i * 3 + j) % 5]; ctx.fillRect(-Lp * 0.25 + i * Lp * 0.055, -Wp * 0.4 + j * Wp * 0.27, Lp * 0.05, Wp * 0.24); } }
      // superstructure at the stern
      ctx.fillStyle = s.type === 'ferry' ? '#ffffff' : '#f1f1ec'; const bw = s.type === 'ferry' ? Lp * 0.7 : Lp * 0.12;
      ctx.fillRect(-Lp * 0.47, -Wp * 0.4, bw, Wp * 0.8);
      ctx.fillStyle = '#2b2f36'; ctx.fillRect(-Lp * 0.43, -Wp * 0.08, Lp * 0.04, Wp * 0.16);
      ctx.restore();
    }
    ctx.restore();
    // water washing over the sinking part
    if (sinkU > 0 && sinkU < 1) { const wx = -Lp / 2 + Lp * vis, R = Wp * 1.6 + 8 * S; for (let i = 0; i < 12; i++) { const a = r(i + 700) * 6.283, d = r(i + 710) * R, ph = (t * 1.3 + r(i + 720)) % 1; ctx.fillStyle = `rgba(240,248,255,${0.55 * (1 - ph)})`; ctx.beginPath(); ctx.ellipse(wx + Math.cos(a) * d * 0.5, Math.sin(a) * d, (4 + ph * 7) * S, (2.5 + ph * 4) * S, 0, 0, 7); ctx.fill(); } }
    ctx.restore();
  }
  // bubbles, debris and life rafts after it goes down
  if (afterU > 0 || sinkU > 0.6) {
    const ba = Math.max(sinkU > 0.6 ? (sinkU - 0.6) / 0.4 : 0, 1 - afterU * 0.8);
    for (let i = 0; i < 26; i++) { const ph = (t * 0.9 + r(i + 400)) % 1, a = r(i + 410) * 6.283, d = r(i + 420) * Lp * 0.5;
      ctx.strokeStyle = `rgba(240,250,255,${0.7 * ba * (1 - ph)})`; ctx.lineWidth = 1 * S; ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, (1 + ph * 5) * S, 0, 7); ctx.stroke(); }
    const R = Lp * (0.4 + afterU * 0.9);
    for (let i = 0; i < 14; i++) { const a = r(i + 500) * 6.283, d = Math.sqrt(r(i + 510)) * R; ctx.fillStyle = `rgba(${i % 3 ? '90,70,50' : '200,200,190'},${0.8 * afterU})`; ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, (2 + r(i) * 4) * S, (1.5 + r(i + 1) * 2) * S); }
    const nr = Math.round(clamp(+(s.rafts ?? 3), 0, 8));
    for (let i = 0; i < nr; i++) { const a = r(i + 600) * 6.283, d = Lp * (0.5 + r(i + 610) * 0.5) * (0.6 + afterU * 0.6), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.7, rr = 5 * S;
      ctx.globalAlpha = A * clamp(afterU * 3, 0, 1); ctx.fillStyle = '#ff7a00'; ctx.beginPath(); ctx.arc(px, py, rr, 0, 7); ctx.fill(); ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(px - rr * 0.25, py - rr * 0.25, rr * 0.55, 0, 7); ctx.fill(); }
    ctx.globalAlpha = A;
  }
  // red distress flare: rises, hangs and drifts down glowing
  if (s.flare !== false && an !== 'afloat' && an !== 'gone') {
    const ft = tau - D * 0.05, FL = D * 0.45;
    if (ft > 0 && ft < FL) {
      const f = ft / FL, up = ft < 0.8 ? ease(ft / 0.8) : 1 - (f - 0.8 / FL) * 0.5;
      const fx = x + Lp * 0.2 + f * 30 * S, fy = y - up * 150 * S;
      ctx.strokeStyle = 'rgba(220,220,220,0.35)'; ctx.lineWidth = 2 * S; ctx.beginPath(); ctx.moveTo(x + Lp * 0.2, y); ctx.quadraticCurveTo(fx - 8 * S, (y + fy) / 2, fx, fy); ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const fl = 0.85 + 0.15 * Math.sin(t * 31);
      const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 70 * S); g.addColorStop(0, `rgba(255,220,210,${fl})`); g.addColorStop(0.12, `rgba(255,60,40,${0.8 * fl})`); g.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fx, fy, 70 * S, 0, 7); ctx.fill();
      const gg = ctx.createRadialGradient(x, y, 0, x, y, Lp * 1.6); gg.addColorStop(0, `rgba(255,40,30,${0.18 * fl})`); gg.addColorStop(1, 'rgba(255,0,0,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, Lp * 1.6, 0, 7); ctx.fill();
      ctx.restore();
    }
  }
  // labels
  const fs = 12 * u0;
  ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`; ctx.textBaseline = 'middle';
  if (s.mayday !== false && an !== 'afloat' && an !== 'gone' && k < 0.6 && s.maydayText) {
    const on = Math.floor(tau * 2.4) % 2 === 0; if (on) { const tw = ctx.measureText(s.maydayText).width + fs; ctx.fillStyle = 'rgba(200,20,20,0.9)'; ctx.beginPath(); ctx.roundRect(x - tw / 2, y - Lp * 0.75 - fs, tw, fs * 1.8, 3 * u0); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(s.maydayText, x, y - Lp * 0.75 - fs * 0.1); }
  }
  if (s.nameTag !== false && s.name) {
    const tx = x + Lp * 0.75, ty = y + Lp * 0.35, tw = ctx.measureText(s.name).width + fs;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1 * u0; ctx.beginPath(); ctx.moveTo(x + Lp * 0.25, y + Wp * 0.4); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.fillStyle = 'rgba(8,14,22,0.85)'; ctx.beginPath(); ctx.roundRect(tx, ty - fs * 0.9, tw, fs * 1.8, 3 * u0); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(s.name, tx + fs / 2, ty);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- layer swipe
/** divider position 0..1 (fraction of the frame showing A) for a swipe layer at time t (null = editing) */
function swipePos(S, t) {
  const s = S.style, sp = clamp(+(s.split ?? 0.5), 0, 1);
  if (t == null || S.anim === 'hold') return sp;
  const D = Math.max(0.3, +S.duration || 8), u = clamp((t - (+S.start || 0)) / D, 0, 1), h = clamp(+(s.hold ?? 0.12), 0, 0.45);
  if (S.anim === 'once') return 1 - ease(seg(u, h, 1 - h));
  const c = Math.max(0.5, +s.cycles || 1);
  // sweep / blink: A → B → A …, with a pause at each end
  const k = u * c, f = k - Math.floor(k);
  const g = (x) => ease(seg(x, h / 2, 0.5 - h / 2)) - ease(seg(x, 0.5 + h / 2, 1 - h / 2));
  return 1 - g(f);
}
function swipeGeo(S, p, fr) {
  const d = S.style.dir || 'lr';
  let n = d === 'tb' ? [0, 1] : d === 'diag' ? [0.857, 0.514] : [1, 0];
  const ext = Math.abs(n[0]) * fr.w + Math.abs(n[1]) * fr.h; // frame length along the normal
  const cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2, o = (p - 0.5) * ext;
  return { n, P: [cx + n[0] * o, cy + n[1] * o], ext };
}
function halfPlane(ctx, P, n, side) {
  const B = 1e5, tx = -n[1], ty = n[0], sx = n[0] * side * B, sy = n[1] * side * B;
  ctx.beginPath(); ctx.moveTo(P[0] + tx * B, P[1] + ty * B); ctx.lineTo(P[0] - tx * B, P[1] - ty * B);
  ctx.lineTo(P[0] - tx * B + sx, P[1] - ty * B + sy); ctx.lineTo(P[0] + tx * B + sx, P[1] + ty * B + sy); ctx.closePath(); ctx.clip();
}
/** If layer L is one side of a layer swipe in this scene, return a function that clips ctx to its side (call between save/restore). */
export function swipeClipFor(o, L) {
  const layers = o.scene?.layers; if (!layers || L.kind === 'layerswipe') return null;
  for (const S of layers) {
    if (S.kind !== 'layerswipe' || S.hidden) continue;
    const a = S.style.layerA, b = S.style.layerB; if (!a && !b) continue;
    const grp = (id) => { const R = id && layers.find((x) => x.id === id); return R ? (x) => x.id === R.id || (R.group && x.group === R.group) : () => false; };
    const side = grp(a)(L) ? -1 : grp(b)(L) ? 1 : 0; if (!side) continue;
    const fr = o.frame || { x: 0, y: 0, w: 1e4, h: 1e4 };
    const p = swipePos(S, o.time);
    if (S.anim === 'blink') { const w = side < 0 ? p : 1 - p; return (ctx) => { ctx.globalAlpha *= w; }; }
    const { n, P } = swipeGeo(S, p, fr);
    return (ctx) => halfPlane(ctx, P, n, side);
  }
  return null;
}
function layerColor(R) { const st = R?.style || {}; return st.color || st.stroke || st.lineColor || st.fill || st.accent || '#888'; }
function drawSwipe(ctx, L, tm, o) {
  const s = L.style, fr = o.frame; if (!fr) return;
  const u = o.unit, p = swipePos(L, o.time), A = tm.alpha ?? 1; if (A <= 0) return;
  const lay = o.scene?.layers || [], RA = lay.find((x) => x.id === s.layerA), RB = lay.find((x) => x.id === s.layerB);
  ctx.save(); ctx.globalAlpha *= A;
  ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); ctx.clip();
  const blink = L.anim === 'blink';
  const { n, P } = swipeGeo(L, p, fr), tx = -n[1], ty = n[0];
  if (!blink && +s.lineWidth > 0) {
    const B = Math.hypot(fr.w, fr.h);
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 6 * u;
    ctx.strokeStyle = s.lineColor || '#fff'; ctx.lineWidth = (+s.lineWidth || 3) * u;
    ctx.beginPath(); ctx.moveTo(P[0] - tx * B, P[1] - ty * B); ctx.lineTo(P[0] + tx * B, P[1] + ty * B); ctx.stroke();
    if (s.knob !== false) {
      // handle in the middle of the divider (inside the frame)
      const t0 = ((fr.x + fr.w / 2 - P[0]) * tx + (fr.y + fr.h / 2 - P[1]) * ty);
      const kx = P[0] + tx * t0, ky = P[1] + ty * t0, R = 17 * u;
      ctx.fillStyle = s.lineColor || '#fff'; ctx.beginPath(); ctx.arc(kx, ky, R, 0, 7); ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#1b2430'; const an = Math.atan2(n[1], n[0]);
      for (const sg of [-1, 1]) { ctx.save(); ctx.translate(kx, ky); ctx.rotate(an + (sg < 0 ? Math.PI : 0)); ctx.beginPath(); ctx.moveTo(R * 0.72, 0); ctx.lineTo(R * 0.22, -R * 0.38); ctx.lineTo(R * 0.22, R * 0.38); ctx.closePath(); ctx.fill(); ctx.restore(); }
    }
    ctx.shadowColor = 'transparent';
  }
  if (s.labels !== false) {
    const fs = 15 * u * clamp(+s.textSize || 1, 0.5, 2.5), pad = fs * 0.7, bh = fs * 2;
    const pos = s.labelPos || 'top';
    const yOf = () => (pos === 'bottom' ? fr.y + fr.h - bh - 18 * u : pos === 'middle' ? fr.y + fr.h / 2 - bh / 2 + (s.knob !== false ? 34 * u : 0) : fr.y + 18 * u);
    const pill = (text, col, x, y, align, a) => {
      if (!text || a <= 0.01) return;
      ctx.save(); ctx.globalAlpha *= a;
      ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`; const sw = s.chips !== false ? fs * 1.1 : 0;
      const w = ctx.measureText(text).width + pad * 2 + sw;
      const lx = clamp(align === 'right' ? x - w : x, fr.x + 8 * u, fr.x + fr.w - w - 8 * u), ly = clamp(y, fr.y + 8 * u, fr.y + fr.h - bh - 8 * u);
      ctx.fillStyle = 'rgba(10,14,20,0.82)'; ctx.beginPath(); ctx.roundRect(lx, ly, w, bh, bh / 2); ctx.fill();
      if (sw) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(lx + pad + fs * 0.35, ly + bh / 2, fs * 0.36, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(text, lx + pad + sw, ly + bh / 2 + fs * 0.04);
      ctx.restore();
    };
    const ca = layerColor(RA), cb = layerColor(RB);
    if (blink) {
      pill(s.labelA, ca, fr.x + 18 * u, yOf(), 'left', p); pill(s.labelB, cb, fr.x + 18 * u, yOf(), 'left', 1 - p);
    } else if ((s.dir || 'lr') === 'tb') {
      pill(s.labelA, ca, fr.x + 18 * u, P[1] - bh - 14 * u, 'left', clamp(p * 8, 0, 1)); pill(s.labelB, cb, fr.x + 18 * u, P[1] + 14 * u, 'left', clamp((1 - p) * 8, 0, 1));
    } else {
      const y = yOf(), along = (yy) => P[0] - (n[1] / n[0]) * (yy + bh / 2 - P[1]); const xl = along(y);
      pill(s.labelA, ca, xl - 14 * u, y, 'right', clamp(p * 8, 0, 1)); pill(s.labelB, cb, xl + 14 * u, y, 'left', clamp((1 - p) * 8, 0, 1));
    }
  }
  ctx.restore();
}

const T = (L, tm) => (tm.edit || L.anim === 'none' ? 1e9 : tm.tau || 0);

// ---------------------------------------------------------------- depth of field
function focusAt(L, tm) {
  const s = L.style, D = Math.max(0.5, +L.duration || 10), t = tm.edit ? 0 : tm.tau || 0, a = +s.focusFrom, b = s.focusTo ?? a;
  if (L.anim === 'rack') return a + (b - a) * ease(seg(t, 0.1 * D, 0.9 * D));
  if (L.anim === 'breathe') return a + (b - a) * (0.5 - 0.5 * Math.cos((t / D) * Math.PI * 2));
  return a;
}
function bandGrad(g, fr, f, s, inner) {
  // linear gradient across the band (perpendicular to its angle); alpha 1 = blurred
  const an = (+s.angle || 0) * D2R, nx = -Math.sin(an), ny = Math.cos(an), cx = fr.x + fr.w / 2, cy = fr.y + fr.h * f, Lh = Math.hypot(fr.w, fr.h) / 2 + 2;
  const G = g.createLinearGradient(cx - nx * Lh, cy - ny * Lh, cx + nx * Lh, cy + ny * Lh);
  const half = ((+s.band || 0) * fr.h) / 2 / (2 * Lh), fe = Math.max(0.01, ((+s.feather || 0.3) * fr.h) / (2 * Lh) * inner);
  const c = 0.5, st = [[0, 1], [c - half - fe, 1], [c - half, 0], [c + half, 0], [c + half + fe, 1], [1, 1]];
  for (const [p, a] of st) G.addColorStop(clamp(p, 0, 1), `rgba(0,0,0,${a})`);
  return G;
}
function drawDof(ctx, L, tm, o) {
  const s = L.style, fr = o.frame; if (!fr || !(+s.blur > 0)) return;
  const A = tm.alpha * (L.anim === 'fade' && !tm.edit ? clamp((tm.tau || 0) / 1, 0, 1) : 1); if (A <= 0) return;
  const Tm = ctx.getTransform(), S = Math.abs(Tm.a) || 1, W = Math.max(2, Math.round(fr.w * S)), Hh = Math.max(2, Math.round(fr.h * S));
  const [C, g] = off(`${L.id}:dofc`, W, Hh); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, Hh);
  // 1 · what is on screen: the map (its own canvas in the preview) + what is already drawn on the overlay
  const m = o.map, mc = m?.getCanvas?.();
  if (mc && mc.width && mc !== ctx.canvas) {
    try {
      const ll = m.getCenter(), a0 = m.project(ll), p0 = o.proj([ll.lng, ll.lat]), q = m.unproject([a0.x + 100, a0.y]), pq = o.proj([q.lng, q.lat]);
      const k = Math.hypot(pq[0] - p0[0], pq[1] - p0[1]) / 100 || 1, pr = mc.width / (mc.clientWidth || m.transform?.width || mc.width);
      const sx = pr * (a0.x + (fr.x - p0[0]) / k), sy = pr * (a0.y + (fr.y - p0[1]) / k);
      g.drawImage(mc, sx, sy, (pr * fr.w) / k, (pr * fr.h) / k, 0, 0, W, Hh);
    } catch { /* not ready */ }
  }
  try { g.drawImage(ctx.canvas, Tm.a * fr.x + Tm.e, Tm.d * fr.y + Tm.f, W, Hh, 0, 0, W, Hh); } catch { /* ignore */ }
  const f = focusAt(L, tm);
  const frD = { x: 0, y: 0, w: W, h: Hh };
  // 2 · two blur levels: a mild one close to the band, a strong one further away
  const [B, b] = off(`${L.id}:dofb`, W, Hh);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const ox = Tm.a * fr.x + Tm.e, oy = Tm.d * fr.y + Tm.f;
  if (s.labels !== false) { ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = A; ctx.translate(ox, oy); ctx.fillStyle = bandGrad(ctx, frD, f, s, 0.55); ctx.fillRect(0, 0, W, Hh); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; }
  for (const [lv, inner] of [[0.4, 0.55], [1, 1]]) {
    b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'source-over'; b.clearRect(0, 0, W, Hh);
    const r = (+s.blur || 9) * lv * S; b.filter = `blur(${r.toFixed(1)}px)`;
    const pad = r * 2; b.drawImage(C, -pad, -pad, W + pad * 2, Hh + pad * 2); b.filter = 'none';
    b.globalCompositeOperation = 'destination-in'; b.fillStyle = bandGrad(b, frD, f, s, inner); b.fillRect(0, 0, W, Hh);
    ctx.globalAlpha = A; ctx.drawImage(B, ox, oy);
  }
  if (+s.vignette > 0) { const v = ctx.createRadialGradient(ox + W / 2, oy + Hh / 2, Math.min(W, Hh) * 0.35, ox + W / 2, oy + Hh / 2, Math.max(W, Hh) * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${+s.vignette})`); ctx.globalAlpha = A; ctx.fillStyle = v; ctx.fillRect(ox, oy, W, Hh); }
  ctx.restore();
}

// ---------------------------------------------------------------- noise
function vnoise(x, y, seed) {
  const h = (i, j) => { let n = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, seed) => 0.5 * vnoise(x, y, seed) + 0.27 * vnoise(x * 2.1, y * 2.1, seed + 1) + 0.15 * vnoise(x * 4.3, y * 4.3, seed + 2) + 0.08 * vnoise(x * 8.7, y * 8.7, seed + 3);

// ---------------------------------------------------------------- ink-spread reveal
function drawInk(ctx, L, tm, o) {
  const s = L.style, P = polysOf(L.geom); if (!P.length) return;
  const D = Math.max(0.5, +L.duration || 5), t = T(L, tm), A = tm.alpha * (L.anim === 'fade' && !tm.edit ? clamp((tm.tau || 0) / 0.8, 0, 1) : 1);
  const k = L.anim === 'spread' && !tm.edit ? seg(t, 0, 0.85 * D) : 1;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of P) for (const r of p) for (const ll of r) { const q = o.proj(ll); x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
  if (!isFinite(x0)) return;
  const padX = (x1 - x0) * 0.08, padY = (y1 - y0) * 0.08; x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
  const w = x1 - x0, h = y1 - y0, N = 150, gw = N, gh = Math.max(8, Math.round((N * h) / Math.max(1, w)));
  const [C, g] = off(`${L.id}:ink`, gw, gh); const im = g.createImageData(gw, gh), d = im.data;
  const [cr, cg, cb] = rgbOf(s.color), sx = clamp(+s.seedX, 0, 1), sy = clamp(+s.seedY, 0, 1), seed = hashStr(L.id) % 997;
  const maxd = Math.max(Math.hypot(sx, sy * h / w), Math.hypot(1 - sx, sy * h / w), Math.hypot(sx, (1 - sy) * h / w), Math.hypot(1 - sx, (1 - sy) * h / w));
  const rough = clamp(+s.rough, 0, 1), front = k * (1 + rough * 0.6) + 0.02, tex = clamp(+s.texture, 0, 1);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const u = i / (gw - 1), v = j / (gh - 1), dd = Math.hypot(u - sx, (v - sy) * h / w) / maxd + (fbm(u * 6, v * 6 * h / w, seed) - 0.5) * rough * 1.1;
    let al = clamp((front - dd) / 0.12, 0, 1); if (k >= 1) al = 1;
    const n = fbm(u * 14, v * 14 * h / w, seed + 9), dark = 1 - tex * 0.55 * n;
    const q = (j * gw + i) * 4; d[q] = cr * dark; d[q + 1] = cg * dark; d[q + 2] = cb * dark; d[q + 3] = 255 * al;
  }
  g.putImageData(im, 0, 0);
  ctx.save(); ctx.imageSmoothingEnabled = true;
  // smoky spill outside the shape while spreading
  if (+s.smoke > 0 && k < 1) { ctx.save(); ctx.globalAlpha = A * +s.smoke * 0.55 * (1 - k * k); ctx.filter = `blur(${Math.max(2, Math.round(w / 60))}px)`; ctx.drawImage(C, x0 - w * 0.02, y0 - h * 0.03, w * 1.04, h * 1.06); ctx.restore(); }
  ctx.beginPath(); pathPolys(ctx, P, o.proj); ctx.clip('evenodd');
  ctx.globalAlpha = A * clamp(+s.opacity || 0.85, 0, 1); ctx.drawImage(C, x0, y0, w, h);
  ctx.restore();
  if (s.edge && k >= 1) { ctx.save(); ctx.globalAlpha = A; ctx.beginPath(); pathPolys(ctx, P, o.proj); ctx.strokeStyle = s.edgeColor; ctx.lineWidth = 1.5 * o.unit; ctx.stroke(); ctx.restore(); }
}

// ---------------------------------------------------------------- flickering districts
const fzCache = new Map();
function zonesOf(L, o) {
  const s = L.style;
  if (s.from === 'layer') {
    const X = (o.scene?.layers || []).find((x) => x.id === s.layerId); if (!X) return [];
    const out = polysOf(X.geom).map((p) => [p]);
    if (X.style && ('data' in X.style || 'sample' in X.style)) {
      const Tb = parseTable(dataOf(X.style));
      for (const r of Tb.rows) { const P = polysOf(r.g); if (P.length) out.push(P); else { const nm = Object.values(r.p)[0]; const c = countriesByName(String(nm || '').replace(/[,;]/g, ' ')); if (c && c[0]) out.push(c[0].polys); } }
    }
    return out;
  }
  if (s.from === 'data') { const Tb = parseTable(String(s.data || '')); return Tb.rows.map((r) => polysOf(r.g)).filter((p) => p.length); }
  const key = String(s.countries || ''); const c0 = fzCache.get(L.id); if (c0 && c0.key === key) return c0.z;
  const z = []; let loading = false;
  for (const nm of key.split(',').map((x) => x.trim()).filter(Boolean)) { const c = countriesByName(nm); if (c === null) loading = true; else if (c[0]) z.push(c[0].polys); }
  if (!loading) fzCache.set(L.id, { key, z });
  return z;
}
function drawFlicker(ctx, L, tm, o) {
  const s = L.style, Z = zonesOf(L, o); if (!Z.length) return;
  const t = T(L, tm), A = tm.alpha * (L.anim === 'fade' && !tm.edit ? clamp((tm.tau || 0) / 0.8, 0, 1) : 1), seed = hashStr(L.id) % 1000;
  const F = +s.flickerFor || 2.2, flick = L.anim === 'strobe' ? true : L.anim === 'flicker' && !tm.edit && t < F;
  const rate = +s.rate || 12, frame = Math.floor(t * rate);
  ctx.save();
  Z.forEach((P, i) => {
    let a;
    if (flick) {
      let n = ((frame + 7) * 2654435761 + (i + 3) * 40503 + seed * 97) >>> 0; n = (n ^ (n >>> 15)) * 2246822519 >>> 0; const r = (n % 1000) / 1000;
      const settle = L.anim === 'strobe' ? 0 : seg(t, F * 0.55, F);
      a = (r < 0.35 ? 0.04 : r * +s.maxA) * (1 - settle) + (+s.fill || 0) * settle;
    } else a = +s.fill || 0;
    ctx.beginPath(); pathPolys(ctx, P, o.proj);
    if (a > 0) { ctx.globalAlpha = A * clamp(a, 0, 1); ctx.fillStyle = s.color; ctx.fill('evenodd'); }
    if (+s.strokeWidth > 0) { ctx.globalAlpha = A * (flick ? 0.5 + 0.5 * Math.min(1, a * 2) : 0.9); ctx.strokeStyle = s.stroke; ctx.lineWidth = +s.strokeWidth * o.unit; ctx.lineJoin = 'round'; ctx.stroke(); }
  });
  ctx.restore();
}

// ---------------------------------------------------------------- soft label
function drawSoft(ctx, L, tm, o) {
  const s = L.style, g = L.geom; if (!g || g.type !== 'Point') return;
  const D = Math.max(0.3, +L.duration || 1.6), t = T(L, tm), u = o.unit * (+s.size || 1);
  const k = L.anim === 'none' || tm.edit ? 1 : seg(t, 0, D * 0.8), a = tm.alpha * (L.anim === 'type' ? 1 : ease(k));
  const [x, y] = o.proj(g.coordinates); const txt = String(s.text || '');
  const shown = L.anim === 'type' ? txt.slice(0, Math.round(txt.length * k)) : txt, dy = L.anim === 'rise' ? (1 - ease(k)) * 12 * u : 0;
  ctx.save(); ctx.globalAlpha = a; ctx.font = `${s.weight || 500} ${16 * u}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  placeAt(ctx, L, o.frame, x - 90 * u, y - 14 * u + dy, 180 * u, 28 * u, { key: 'label' });
  if (s.dot) { ctx.beginPath(); ctx.arc(x, y + 14 * u, 3 * u, 0, 7); ctx.fillStyle = s.color; ctx.fill(); }
  ctx.shadowColor = `rgba(0,0,0,${+s.shadow || 0})`; ctx.shadowBlur = 8 * u; ctx.shadowOffsetY = 1.5 * u;
  ctx.fillStyle = s.color; ctx.fillText(shown, x, y + dy);
  ctx.restore();
}

export function drawMapFx(ctx, L, tm, o, phase) {
  if (!o.frame) return;
  if (L.kind === 'dofblur' && phase === 'captions') return drawDof(ctx, L, tm, o);
  if (L.kind === 'inkreveal' && phase === 'below') return drawInk(ctx, L, tm, o);
  if (L.kind === 'flickerzones' && phase === 'below') return drawFlicker(ctx, L, tm, o);
  if (L.kind === 'softlabel' && phase === 'captions') return drawSoft(ctx, L, tm, o);
  if (L.kind === 'layerswipe' && phase === 'captions') return drawSwipe(ctx, L, tm, o);
  if (L.kind === 'shipsink' && phase === 'captions') return drawShipSink(ctx, L, tm, o);
  if (L.kind === 'mapposter' && phase === 'captions') return drawPoster(ctx, L, tm, o);
  if (L.kind === 'msgchat' && phase === 'captions') return drawMessages(ctx, L, tm, o);
  return undefined;
}
export function mxSoundEvents(L) {
  if (L.kind === 'msgchat') { const st = L.style || {}; if (st.sound === false) return []; const v = st.soundVol ?? 0.7; return msgTimes(L).map((m) => ({ t: m.at, type: m.mine ? 'msgsend' : 'msgrecv', p: { vol: v } })); }
  if (L.kind === 'shipsink') { const st = L.style || {}; if (st.sound === false) return []; const t0 = +L.start || 0, D = Math.max(1, +L.duration || 12), v = st.soundVol ?? 0.7; return [{ t: t0, type: 'storm', p: { dur: D + (+L.hold || 0), vol: v * 0.7 } }, { t: t0 + D * 0.05, type: 'horn', p: { vol: v } }, { t: t0 + D * 0.15, type: 'horn', p: { vol: v * 0.8 } }]; }
  const s = L.style || {}; if (s.sound === false) return [];
  const t0 = +L.start || 0, D = Math.max(0.3, +L.duration || 2), v = s.soundVol ?? 1;
  if (L.kind === 'dofblur') return [{ t: t0, type: 'clip', p: { clip: 'dof-ambient-2', dur: D, vol: v, fadeIn: 0.8, fadeOut: 1.2 } }];
  if (L.kind === 'inkreveal') return s.snd === 'clip' ? [{ t: t0, type: 'clip', p: { clip: 'ink-spread', dur: 2, vol: v, fadeIn: 0.02, fadeOut: 0.4 } }] : [{ t: t0, type: s.snd || 'inkbleed', p: { dur: +s.sndDur || 2, vol: v } }];
  if (L.kind === 'flickerzones') return [{ t: t0, type: 'clipflicker', p: { dur: L.anim === 'strobe' ? D : Math.max(0.6, +s.flickerFor + 0.3), rate: +s.rate || 12, vol: v } }];
  if (L.kind === 'softlabel') return [{ t: t0, type: 'swoosh', p: { vol: v * 0.5 } }];
  return [];
}
/** settings buttons */
export const MX_ACTIONS = {
  async dofDrift(L, { map, scene }) {
    const s = L.style, sc = scene; if (!sc) return '';
    const c = map.getCenter(), z = map.getZoom(), fw = map.getContainer().clientWidth || 1280;
    const brg = map.getBearing(), dir = ((+s.driftDir || 0) + brg) * D2R, km = +s.driftKm || 6;
    const dLat = (km / 111.32) * Math.cos(dir), dLon = (km / (111.32 * Math.cos(c.lat * D2R))) * Math.sin(dir);
    const len = Math.max(2, +sc.sceneLength || +sc.duration || 10), zr = +zoomRefFor(z, fw).toFixed(3), pitch = +s.driftPitch || 0;
    const v = (lon, lat, b) => ({ center: [+lon.toFixed(6), +lat.toFixed(6)], zoomRef: zr, bearing: +b.toFixed(1), pitch });
    sc.camera = sc.camera || {}; sc.camera.mode = 'keyframes';
    sc.camera.keys = [{ t: 0, ease: 'linear', view: v(c.lng - dLon / 2, c.lat - dLat / 2, brg - (+s.driftTurn || 0) / 2) }, { t: +len.toFixed(2), ease: 'linear', view: v(c.lng + dLon / 2, c.lat + dLat / 2, brg + (+s.driftTurn || 0) / 2) }];
    L.start = 0; L.duration = len;
    return `Camera drifts ${km} km over ${len.toFixed(1)} s, tilted ${pitch}° — play to see it; change distance, direction or tilt and press the button again`;
  },
  /** hold the map still for the whole scene (no zoom / pan / shake); the old moves are kept so they can be put back */
  async mapStill(L, { scene }) {
    const sc = scene; if (!sc?.camera) return '';
    const keys = sc.camera.keys || [];
    if (sc.camera.mode !== 'keyframes' || keys.length < 2) return 'The map is already still in this scene';
    const moving = keys.some((k) => JSON.stringify(k.view) !== JSON.stringify(keys[0].view));
    if (!moving) return 'The map is already still in this scene';
    sc.camera.movingKeys = JSON.parse(JSON.stringify(keys));
    const pick = L.style?.stillAt === 'start' ? keys[0] : L.style?.stillAt === 'middle' ? keys[Math.floor(keys.length / 2)] : keys.at(-1);
    const view = JSON.parse(JSON.stringify(pick.view));
    sc.camera.keys = [{ t: 0, ease: 'linear', view }, { t: keys.at(-1).t || 5, ease: 'linear', view: JSON.parse(JSON.stringify(view)) }];
    return 'Map is now still for this scene — press “Bring back the map movement” to undo';
  },
  async posterFind(L, { scene }) {
    const q = String(L.style.query || L.style.title || '').trim(); if (!q) return 'Type a place first';
    let r;
    try { r = (await (await fetch('https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&accept-language=en&q=' + encodeURIComponent(q))).json())[0]; } catch { return 'Could not reach the place search — check your connection'; }
    if (!r) return `“${q}” was not found — try adding the country`;
    const lon = +r.lon, lat = +r.lat, a = r.address || {};
    L.geom = { type: 'Point', coordinates: [lon, lat] };
    const city = a.city || a.town || a.village || a.municipality || a.county || r.name || q.split(',')[0];
    L.style.title = String(city).toUpperCase();
    L.style.sub = String((a.country_code === 'us' && a.state) ? a.state : (a.country || '')).toUpperCase();
    L.style.coords = '';
    if (scene) { // camera on the place, slowly drifting in
      const len = Math.max(4, +scene.sceneLength || +scene.lineSeconds || 8), bb = (r.boundingbox || []).map(Number);
      const span = bb.length === 4 ? Math.max(bb[1] - bb[0], (bb[3] - bb[2]) * Math.cos(lat * D2R)) : 0.2;
      const z = clamp(Math.log2(360 / Math.max(0.02, span * 1.25)) - 0.4, 9.5, 14.5);
      scene.camera.mode = 'keyframes';
      scene.camera.keys = [{ t: 0, ease: 'linear', view: { center: [lon, lat], zoomRef: +(z - 0.25).toFixed(2), bearing: 0, pitch: 0 } }, { t: len, ease: 'linear', view: { center: [lon, lat], zoomRef: +z.toFixed(2), bearing: 0, pitch: 0 } }];
      if (!THEMES[scene.look.theme]?.poster) scene.look.theme = 'postersage';
      scene.look.posterColor = L.style.color;
      globalThis.__lookChanged?.();
    }
    return `${city} found — the map, title and coordinates are set`;
  },
  swipeImagery(L) { globalThis.__swipeGeoImage?.(L.id, 'under'); return ''; },
  swipeTifA(L) { globalThis.__swipeGeoImage?.(L.id, 'A'); return ''; },
  swipeTifB(L) { globalThis.__swipeGeoImage?.(L.id, 'B'); return ''; },
  swipeImportA(L) { globalThis.__swipeImportFor = { id: L.id, side: 'A' }; document.getElementById('file-layers')?.click(); return ''; },
  swipeImportB(L) { globalThis.__swipeImportFor = { id: L.id, side: 'B' }; document.getElementById('file-layers')?.click(); return ''; },
  async mapMove(L, { scene }) {
    const sc = scene; if (!sc?.camera?.movingKeys) return 'No earlier map movement saved for this scene';
    sc.camera.keys = sc.camera.movingKeys; delete sc.camera.movingKeys; sc.camera.mode = 'keyframes';
    return 'Map movement is back';
  },
};
void SAMPLE_NAMES;
