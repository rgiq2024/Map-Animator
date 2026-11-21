// Military explainer graphics — the crimson-on-dark documentary look: weapon reveal cards with callouts and a
// magnifier, production grids, missile streams with rolling counters, versus comparisons, glitch titles, typed
// quotes, newspaper article highlights, threat-trend charts, and map pieces (neon zones, strike corridors,
// satellite inset boxes, growing place tags). Every element has its own sound.
import { H } from './cartofx.js';
import { placeAt } from './place.js';

const { clamp, easeOut, ease, UI, rr, rng, drawTiles, polysOf, pathPolys, labelPoint } = H;
const D2R = Math.PI / 180;
const seg = (t, a, b) => clamp((t - a) / Math.max(1e-6, b - a), 0, 1);
const rgbOf = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return [255, 77, 109]; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => { const [r, g, b] = rgbOf(c); return `rgba(${r},${g},${b},${a})`; };
const ACC = '#ff4d6d';
const lines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
const cells = (t) => lines(t).map((l) => l.split('|').map((x) => x.trim()));

// ---------------------------------------------------------------- shared look
const LOOK = [
  ['style.accent', 'Accent colour', 'color'],
  ['style.bg', 'Background', 'color'], ['style.bgAlpha', 'Background opacity (0 = map / video shows)', 'range', [0, 1, 0.01]],
  ['style.grain', 'Film grain', 'range', [0, 1, 0.01]], ['style.vignette', 'Vignette', 'range', [0, 1, 0.01]],
  ['style.corners', 'Corner marks', 'switch'],
  ['style.textSize', 'Text size', 'range', [0.5, 2.5, 0.05]],
  ['style.sound', 'Sound effects', 'switch'], ['style.soundVol', 'Sound volume', 'range', [0, 2, 0.05], (L) => L.style.sound !== false],
];
const LOOKD = { accent: ACC, bg: '#17141a', bgAlpha: 1, grain: 0.35, vignette: 0.55, corners: true, textSize: 1, sound: true, soundVol: 1 };
const SHAPES = { shahed: 'Delta-wing drone (Shahed type) — top view', jetdrone: 'Jet delta drone (Geran-3 type) — top view', cruise: 'Cruise missile — top view', ballistic: 'Ballistic missile (Iskander type) — side view', sam: 'Air-defence missile (Patriot type) — side view', twinboom: 'Twin-boom attack drone — top view', fighter: 'Fighter jet — top view', tank: 'Tank — side view', ship: 'Warship — side view' };

export const MG_KINDS = {
  mgweapon: { name: 'Weapon reveal', icon: '✈', geom: null, desc: 'A drone, missile, jet, tank or ship drawn as a crimson blueprint: wireframe, fill, a letter-spaced name that decodes (and can be renamed, e.g. SHAHED → GERAN), callouts with leader lines, a magnifier circle on a part and a spec table' },
  mgcount: { name: 'Production grid', icon: '▦', geom: null, desc: 'Icons of a weapon multiply into a grid with a big label — “500 PER MONTH”' },
  mgstream: { name: 'Missile stream counter', icon: '⇉', geom: null, desc: 'Rows of missiles stream across behind a label bar whose number rolls up — “35 → 100 PER MONTH”' },
  mgversus: { name: 'Versus comparison', icon: '⚖', geom: null, desc: 'Two or more weapons stacked with counts in label bars — “24 PATRIOT” vs “>240 ISKANDER-M”' },
  mgtitle: { name: 'Glitch documentary title', icon: '▚', geom: null, desc: 'A big letter-spaced title that glitches in from noise, outline then fill, over darkened footage — “BATTLEGROUNDS”' },
  mgquote: { name: 'Typed quote', icon: '❝', geom: null, desc: 'A centred, letter-spaced quote typed on over drifting smoke, with the speaker underneath' },
  mgarticle: { name: 'Article highlight', icon: '📰', geom: null, desc: 'A newspaper article — headline, standfirst, byline and text — scrolls, then a sentence is highlighted' },
  mgchart: { name: 'Threat trend chart', icon: '📈', geom: null, desc: 'A line drawing year by year with year chips, notes on the line and a highlighted year' },
  mgzones: { name: 'Neon zones', icon: '⬡', geom: 'polygon', desc: 'An area outlined in a glowing neon line that draws itself, with its name — training areas, districts, sectors' },
  mgcorridor: { name: 'Strike corridor', icon: '💥', geom: 'line', desc: 'A dashed route draws on, strikes burst one after another along it, and a label bar names it' },
  mginset: { name: 'Satellite inset box', icon: '⧉', geom: 'point', desc: 'A bracket box on a place with a leader line to a satellite close-up panel and its name' },
  mgtag: { name: 'Place tag', icon: '🏷', geom: 'point', desc: 'A label box that grows out of a dot on the map — the name types in' },
};
const A = (o) => o;
export const MG_ANIMS = {
  mgweapon: A({ reveal: 'Blueprint → fill → name → callouts', fade: 'Fade in', none: 'Shown' }),
  mgcount: A({ grow: 'Icons appear, then fill the grid', fade: 'Fade in', none: 'Shown' }),
  mgstream: A({ stream: 'Missiles stream, number rolls up', none: 'Shown' }),
  mgversus: A({ stack: 'Rows slide in one by one', fade: 'Fade in', none: 'Shown' }),
  mgtitle: A({ glitch: 'Glitch in from noise', fade: 'Fade in', none: 'Shown' }),
  mgquote: A({ type: 'Typed on', fade: 'Fade in', none: 'Shown' }),
  mgarticle: A({ scroll: 'Scroll down, then highlight', none: 'Shown' }),
  mgchart: A({ draw: 'Draw year by year', none: 'Shown' }),
  mgzones: A({ draw: 'Lines draw on, then names', fade: 'Fade in', none: 'Shown' }),
  mgcorridor: A({ draw: 'Route draws, strikes burst along it', none: 'Shown' }),
  mginset: A({ open: 'Box, line, then the panel opens', fade: 'Fade in', none: 'Shown' }),
  mgtag: A({ grow: 'Dot, then the tag grows and types', fade: 'Fade in', none: 'Shown' }),
};
export const MG_DEFAULTS = {
  mgweapon: { ...LOOKD, shape: 'shahed', name: 'SHAHED DRONE', rename: 'GERAN', kicker: 'IRAN', callouts: '115lb high-explosive warhead | 0 | -0.75\n50hp propeller engine | 0 | 0.8', lens: false, lensX: 0, lensY: 0.75, lensLabel: 'PROPELLER ENGINE', specs: '', size: 1, nameY: 0.5, push: 0.08, wire: true },
  mgcount: { ...LOOKD, shape: 'shahed', label: '500 PER MONTH', cols: 12, rows: 4, first: 5, unitText: 'x 100', hollow: true },
  mgstream: { ...LOOKD, shape: 'ballistic', kicker: 'ISKANDER-M', from: 35, to: 100, suffix: 'PER MONTH', rows: 9, speed: 1 },
  mgversus: { ...LOOKD, rows: '24 | PATRIOT | sam\n>240 | ISKANDER-M | ballistic' },
  mgtitle: { ...LOOKD, text: 'BATTLEGROUNDS', sub: '', bgAlpha: 0.55, outline: true, glitch: 1, spacing: 0.08 },
  mgquote: { ...LOOKD, text: '“Moscow is massively overstretched by the conflict in Ukraine, and the Kremlin knows that Nato would respond forcefully to an attack on any member state.”\n“Russia is deterred because of the actions that we are taking.”', who: 'SENIOR NATO OFFICIAL, ANKARA', smoke: true, cps: 32 },
  mgarticle: { ...LOOKD, bg: '#1a1a1f', headline: 'How Nato is preparing for European conflict with Russia in 2030', standfirst: 'Military officers believe the most dangerous moment for the continent will come in the years after a peace deal in Ukraine.', byline: 'Defence Editor', body: 'Military officers believe the most dangerous moment for Europe will come in the years after a peace deal in Ukraine. The increase in defence spending turns on the notion that Russia could attack the alliance’s eastern flank by 2030.\nThe director of military sciences at a London think-tank said: “There is no consensus on how long Russia will take to reconstitute its forces after Ukraine. In large part, that is because it depends on what kind of threat it is posing and to achieve what.”\n“But, there is generally a view that it could rebuild land forces to be fairly threatening in only a few years. Therefore, Nato seniors and others have tried to pick a realistic target that says we need to be able to improve our conventional deterrence within this time.”\nHe added that five years — running from last year — is both reasonable and also halfway to the 2035 spending targets.', highlight: 'Therefore, Nato seniors and others have tried to pick a realistic target that says we need to be able to improve our conventional deterrence within this time.', serif: true },
  mgchart: { ...LOOKD, title: 'Russian Threat to NATO, 2020–2040', sub: 'Indicative threat assessment, 2027–2040 projections', data: '2020: 2\n2021: 3\n2022: 9\n2023: 13\n2024: 15\n2025: 16\n2026: 16.5\n2027: 17\n2028: 17\n2029: 17\n2030: 16.8\n2032: 16.2\n2034: 15.5\n2036: 15\n2038: 14.6\n2040: 14.2', notes: '2022 | Ukraine invasion\n2025 | NATO rearmament accelerates\n2034 | Russia rebuilds forces', highlight: '2030', yLabel: '' },
  mgzones: { ...LOOKD, accent: '#6dffb0', name: 'TRAINING AREA', glow: 1, width: 2.4, fill: 0.06, labelSize: 1 },
  mgcorridor: { ...LOOKD, label: 'BLACK SEA TRANSIT CORRIDOR', strikes: 6, dash: true, burst: 1, labelAt: 0.5 },
  mginset: { ...LOOKD, label: 'Tartus', sub: 'Naval base', zoom: 15, box: 34, panel: 0.3, side: 'auto', src: 'satellite' },
  mgtag: { ...LOOKD, label: 'SENNELAGER', sub: '', tagStyle: 'light' },
};
// map pieces: no background by default
for (const k of ['mgzones', 'mgcorridor', 'mginset', 'mgtag']) Object.assign(MG_DEFAULTS[k], { bgAlpha: 0, grain: 0, vignette: 0, corners: false });
const DUR = { mgweapon: 9, mgcount: 6, mgstream: 7, mgversus: 6, mgtitle: 4, mgquote: 10, mgarticle: 12, mgchart: 9, mgzones: 4, mgcorridor: 6, mginset: 4, mgtag: 2.5 };
export const MG_LAYER_DEFAULTS = Object.fromEntries(Object.keys(MG_KINDS).map((k) => [k, { anim: Object.keys(MG_ANIMS[k])[0], duration: DUR[k], style: MG_DEFAULTS[k] }]));
const vis = (k, ...v) => (L) => v.includes(L.style[k]);
const MAPLOOK = [['style.accent', 'Colour', 'color'], ['style.textSize', 'Text size', 'range', [0.5, 2.5, 0.05]], ['style.sound', 'Sound effects', 'switch'], ['style.soundVol', 'Sound volume', 'range', [0, 2, 0.05], (L) => L.style.sound !== false]];
export const MG_FORMS = {
  mgweapon: [
    ['style.shape', 'Weapon', 'select', SHAPES], ['style.name', 'Name (letter-spaced)', 'text'],
    ['style.rename', 'Rename the first word to (optional — e.g. GERAN)', 'text'], ['style.kicker', 'Small tag above (country, maker)', 'text'],
    ['style.callouts', 'Callouts — one per line: text | x | y (−1…1 across the weapon)', 'textarea'],
    ['style.lens', 'Magnifier circle on a part', 'switch'], ['style.lensX', 'Magnifier x (−1…1)', 'range', [-1, 1, 0.01], vis('lens', true)], ['style.lensY', 'Magnifier y (−1…1)', 'range', [-1, 1, 0.01], vis('lens', true)], ['style.lensLabel', 'Magnifier label', 'text', null, vis('lens', true)],
    ['style.specs', 'Spec table — one per line: label | value', 'textarea'],
    ['style.size', 'Weapon size', 'range', [0.4, 2, 0.01]], ['style.nameY', 'Name height (0 top … 1 bottom)', 'range', [0.1, 0.9, 0.01]], ['style.push', 'Slow push-in', 'range', [0, 0.4, 0.01]], ['style.wire', 'Start as a wireframe blueprint', 'switch'],
    ...LOOK,
  ],
  mgcount: [['style.shape', 'Icon', 'select', SHAPES], ['style.label', 'Label', 'text'], ['style.cols', 'Columns', 'range', [2, 24, 1]], ['style.rows', 'Rows', 'range', [1, 10, 1]], ['style.first', 'Icons shown first (in a row)', 'range', [0, 20, 1]], ['style.unitText', 'Small text by each first icon (e.g. x 100)', 'text'], ['style.hollow', 'Last row as outlines', 'switch'], ...LOOK],
  mgstream: [['style.shape', 'Missile', 'select', SHAPES], ['style.kicker', 'Small label', 'text'], ['style.from', 'Number from', 'number'], ['style.to', 'Number to', 'number'], ['style.suffix', 'After the number', 'text'], ['style.rows', 'Rows of missiles', 'range', [2, 16, 1]], ['style.speed', 'Speed', 'range', [0.2, 3, 0.05]], ...LOOK],
  mgversus: [['style.rows', 'Rows — one per line: count | name | weapon (shahed, jetdrone, cruise, ballistic, sam, twinboom, fighter, tank, ship)', 'textarea'], ...LOOK],
  mgtitle: [['style.text', 'Title', 'text'], ['style.sub', 'Subtitle (optional)', 'text'], ['style.outline', 'Outline first, then fill', 'switch'], ['style.glitch', 'Glitch strength', 'range', [0, 2, 0.05]], ['style.spacing', 'Letter spacing', 'range', [0, 0.5, 0.01]], ...LOOK],
  mgquote: [['style.text', 'Quote (new line = new paragraph)', 'textarea'], ['style.who', 'Who said it', 'text'], ['style.cps', 'Typing speed (letters per second)', 'range', [5, 120, 1]], ['style.smoke', 'Drifting smoke', 'switch'], ...LOOK],
  mgarticle: [['style.headline', 'Headline', 'text'], ['style.standfirst', 'Standfirst', 'textarea'], ['style.byline', 'Byline', 'text'], ['style.body', 'Article text (new line = new paragraph)', 'textarea'], ['style.highlight', 'Sentence to highlight (copy it from the text)', 'textarea'], ['style.serif', 'Newspaper serif font', 'switch'], ...LOOK],
  mgchart: [['style.title', 'Title', 'text'], ['style.sub', 'Subtitle', 'text'], ['style.data', 'Values — one per line: year: value', 'textarea'], ['style.notes', 'Notes on the line — one per line: year | text', 'textarea'], ['style.highlight', 'Highlighted year (optional)', 'text'], ...LOOK],
  mgzones: [['style.name', 'Name', 'text'], ['style.width', 'Line width', 'range', [0.5, 8, 0.1]], ['style.glow', 'Glow', 'range', [0, 3, 0.05]], ['style.fill', 'Fill', 'range', [0, 0.6, 0.01]], ...MAPLOOK],
  mgcorridor: [['style.label', 'Label', 'text'], ['style.strikes', 'Strikes along the route', 'range', [0, 30, 1]], ['style.burst', 'Strike size', 'range', [0.3, 3, 0.05]], ['style.dash', 'Dashed route', 'switch'], ['style.labelAt', 'Label position along the route', 'range', [0, 1, 0.01]], ...MAPLOOK],
  mginset: [['style.label', 'Name', 'text'], ['style.sub', 'Second line', 'text'], ['style.zoom', 'Close-up zoom', 'range', [8, 19, 0.25]], ['style.src', 'Imagery', 'select', { satellite: 'Satellite', topo: 'Topographic', streets: 'Streets', dark: 'Dark grey' }], ['style.box', 'Box size on the map (px)', 'range', [10, 120, 1]], ['style.panel', 'Panel size', 'range', [0.12, 0.6, 0.01]], ['style.side', 'Panel side', 'select', { auto: 'Automatic', left: 'Left', right: 'Right', top: 'Above', bottom: 'Below' }], ...MAPLOOK],
  mgtag: [['style.label', 'Name', 'text'], ['style.sub', 'Second line (optional)', 'text'], ['style.tagStyle', 'Look', 'select', { light: 'Light box, dark text', accent: 'Coloured box', outline: 'Outline' }], ...MAPLOOK],
};
export const MG_SET = new Set(Object.keys(MG_KINDS));
export const mgPhases = (k) => (['mgzones', 'mgcorridor'].includes(k) ? ['below', 'captions'] : ['captions']);

// ---------------------------------------------------------------- silhouettes (unit box, centre 0,0, nose up for top views, right for side views)
function shapePath(c, shape) {
  const P = (pts) => { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); };
  switch (shape) {
    case 'jetdrone': P([[0, -0.95], [0.07, -0.7], [0.9, 0.45], [0.92, 0.6], [0.1, 0.52], [0.08, 0.85], [-0.08, 0.85], [-0.1, 0.52], [-0.92, 0.6], [-0.9, 0.45], [-0.07, -0.7]]); c.moveTo(0.11, -0.05); c.lineTo(0.11, 0.5); c.lineTo(-0.11, 0.5); c.lineTo(-0.11, -0.05); c.closePath(); return 'top';
    case 'cruise': P([[0.97, 0], [0.88, -0.05], [-0.85, -0.05], [-0.95, 0]]); P([[0.97, 0], [0.88, 0.05], [-0.85, 0.05], [-0.95, 0]]); P([[0.12, -0.04], [0.08, -0.75], [0.0, -0.75], [-0.02, -0.04]]); P([[0.12, 0.04], [0.08, 0.75], [0.0, 0.75], [-0.02, 0.04]]); P([[-0.72, -0.04], [-0.82, -0.25], [-0.88, -0.25], [-0.85, -0.04]]); P([[-0.72, 0.04], [-0.82, 0.25], [-0.88, 0.25], [-0.85, 0.04]]); return 'side';
    case 'ballistic': P([[0.98, 0], [0.8, -0.07], [0.62, -0.1], [-0.88, -0.1], [-0.95, -0.08], [-0.95, 0.08], [-0.88, 0.1], [0.62, 0.1], [0.8, 0.07]]); P([[-0.7, -0.1], [-0.86, -0.22], [-0.93, -0.22], [-0.88, -0.1]]); P([[-0.7, 0.1], [-0.86, 0.22], [-0.93, 0.22], [-0.88, 0.1]]); return 'side';
    case 'sam': P([[0.98, 0], [0.75, -0.05], [-0.9, -0.05], [-0.95, 0], [-0.9, 0.05], [0.75, 0.05]]); P([[0.45, -0.05], [0.4, -0.13], [0.33, -0.13], [0.32, -0.05]]); P([[0.45, 0.05], [0.4, 0.13], [0.33, 0.13], [0.32, 0.05]]); P([[-0.75, -0.05], [-0.88, -0.2], [-0.94, -0.2], [-0.9, -0.05]]); P([[-0.75, 0.05], [-0.88, 0.2], [-0.94, 0.2], [-0.9, 0.05]]); return 'side';
    case 'twinboom': P([[0, -0.75], [0.07, -0.6], [0.07, -0.18], [0.95, -0.12], [0.95, 0.02], [0.22, 0.04], [0.22, 0.72], [0.4, 0.82], [0.4, 0.88], [-0.4, 0.88], [-0.4, 0.82], [-0.22, 0.72], [-0.22, 0.04], [-0.95, 0.02], [-0.95, -0.12], [-0.07, -0.18], [-0.07, -0.6]]); return 'top';
    case 'fighter': P([[0, -0.98], [0.07, -0.6], [0.1, -0.15], [0.85, 0.3], [0.85, 0.42], [0.12, 0.38], [0.1, 0.62], [0.38, 0.85], [0.38, 0.93], [-0.38, 0.93], [-0.38, 0.85], [-0.1, 0.62], [-0.12, 0.38], [-0.85, 0.42], [-0.85, 0.3], [-0.1, -0.15], [-0.07, -0.6]]); return 'top';
    case 'tank': P([[-0.9, 0.1], [0.9, 0.1], [0.98, 0.25], [0.85, 0.42], [-0.85, 0.42], [-0.98, 0.25]]); P([[-0.75, 0.1], [-0.65, -0.12], [0.35, -0.12], [0.45, 0.1]]); P([[0.3, -0.06], [0.98, -0.06], [0.98, -0.01], [0.3, -0.01]]); return 'side';
    case 'ship': P([[-0.95, 0], [0.98, 0], [0.85, 0.18], [-0.88, 0.18]]); P([[-0.5, 0], [-0.45, -0.18], [0.1, -0.18], [0.15, 0]]); P([[-0.25, -0.18], [-0.2, -0.36], [-0.05, -0.36], [0, -0.18]]); P([[0.35, 0], [0.4, -0.08], [0.6, -0.08], [0.62, 0]]); return 'side';
    default: P([[0, -0.95], [0.08, -0.78], [0.1, -0.2], [0.93, 0.45], [0.95, 0.6], [0.86, 0.62], [0.12, 0.46], [0.1, 0.68], [0.06, 0.78], [-0.06, 0.78], [-0.1, 0.68], [-0.12, 0.46], [-0.86, 0.62], [-0.95, 0.6], [-0.93, 0.45], [-0.1, -0.2], [-0.08, -0.78]]); c.moveTo(0.95, 0.42); c.lineTo(0.95, 0.68); c.lineTo(0.9, 0.68); c.lineTo(0.9, 0.42); c.closePath(); c.moveTo(-0.95, 0.42); c.lineTo(-0.95, 0.68); c.lineTo(-0.9, 0.68); c.lineTo(-0.9, 0.42); c.closePath(); return 'top';
  }
}
const pathCache = new Map();
function shapeP(shape) {
  let p = pathCache.get(shape);
  if (!p) {
    p = new Path2D(); const parts = []; let cur = null;
    const rec = { moveTo(x, y) { cur = new Path2D(); parts.push(cur); cur.moveTo(x, y); p.moveTo(x, y); }, lineTo(x, y) { cur.lineTo(x, y); p.lineTo(x, y); }, closePath() { cur.closePath(); p.closePath(); }, arc(...a) { cur.arc(...a); p.arc(...a); } };
    p.view = shapePath(rec, shape); p.parts = parts; pathCache.set(shape, p);
  }
  return p;
}
const viewOf = (shape) => { shapeP(shape); return pathCache.get(shape).view; };
/** draw a weapon: wire 0…1 = how much of the blueprint is drawn, fill 0…1 */
function drawShape(ctx, shape, x, y, S, col, { wire = 1, fill = 1, panel = true, glow = true, alpha = 1, hollow = false } = {}) {
  const p = shapeP(shape);
  ctx.save(); ctx.translate(x, y); ctx.scale(S, S); ctx.globalAlpha *= alpha;
  if (fill > 0 && !hollow) {
    ctx.save(); ctx.globalAlpha *= fill;
    const g = ctx.createLinearGradient(-1, -1, 1, 1); g.addColorStop(0, rgba(col, 1)); g.addColorStop(1, rgba(col, 0.78));
    if (glow) { ctx.shadowColor = rgba(col, 0.6); ctx.shadowBlur = 30; }
    ctx.fillStyle = g; for (const q of p.parts) ctx.fill(q); ctx.restore();
    if (panel) { // panel lines
      ctx.save(); ctx.clip(p, 'nonzero'); ctx.globalAlpha *= 0.28 * fill; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2 / S;
      const R = rng(shape.length * 7);
      for (let i = 0; i < 26; i++) { const a = R() * 2 - 1, b = R() * 2 - 1, w = 0.05 + R() * 0.18, h = 0.03 + R() * 0.12; ctx.strokeRect(a, b, w, h); }
      ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(0, 1); ctx.moveTo(-1, 0); ctx.lineTo(1, 0); ctx.stroke();
      ctx.restore();
    }
  }
  if (wire > 0 && (fill < 1 || hollow)) {
    ctx.save(); ctx.globalAlpha *= hollow ? 0.6 : (1 - fill * 0.85);
    ctx.strokeStyle = hollow ? rgba(col, 0.9) : 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.4 / S;
    ctx.setLineDash([2.2 * wire, 2.2 * (1 - wire) + 0.0001]); ctx.stroke(p); ctx.restore();
  }
  ctx.restore();
}
// ---------------------------------------------------------------- backdrop and text helpers
function backdrop(ctx, L, o, a) {
  const s = L.style, fr = o.frame;
  if (+s.bgAlpha > 0) { ctx.save(); ctx.globalAlpha = a * +s.bgAlpha; ctx.fillStyle = s.bg || '#17141a'; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); ctx.restore(); }
}
function finish(ctx, L, o, a, tau) {
  const s = L.style, fr = o.frame, u = o.unit;
  if (+s.vignette > 0) { ctx.save(); const g = ctx.createRadialGradient(fr.x + fr.w / 2, fr.y + fr.h / 2, Math.min(fr.w, fr.h) * 0.3, fr.x + fr.w / 2, fr.y + fr.h / 2, Math.max(fr.w, fr.h) * 0.72); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${+s.vignette})`); ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); ctx.restore(); }
  if (+s.grain > 0) {
    ctx.save(); const R = rng(Math.floor((tau || 0) * 24) + 1); ctx.globalAlpha = a * +s.grain * 0.18;
    for (let i = 0; i < 700; i++) { ctx.fillStyle = R() > 0.5 ? '#fff' : '#000'; ctx.fillRect(fr.x + R() * fr.w, fr.y + R() * fr.h, 1.6 * u, 1.6 * u); }
    ctx.restore();
  }
  if (s.corners) { ctx.save(); ctx.globalAlpha = a * 0.5; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1 * u; const m = 22 * u, l = 12 * u; for (const [x, y, dx, dy] of [[fr.x + m, fr.y + m, 1, 1], [fr.x + fr.w - m, fr.y + m, -1, 1], [fr.x + m, fr.y + fr.h - m, 1, -1], [fr.x + fr.w - m, fr.y + fr.h - m, -1, -1]]) { ctx.beginPath(); ctx.moveTo(x, y + dy * l); ctx.lineTo(x, y); ctx.lineTo(x + dx * l, y); ctx.stroke(); } ctx.restore(); }
}
/** letter-spaced text; returns its width. align: left | center | right */
function spaced(ctx, txt, x, y, sp, align = 'left', draw = true) {
  const ch = [...String(txt)], ws = ch.map((c) => ctx.measureText(c).width), w = ws.reduce((a, b) => a + b, 0) + sp * Math.max(0, ch.length - 1);
  if (!draw) return w;
  let xx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const al = ctx.textAlign; ctx.textAlign = 'left';
  ch.forEach((c, i) => { ctx.fillText(c, xx, y); xx += ws[i] + sp; });
  ctx.textAlign = al; return w;
}
const GL = '!<>-_\\/[]{}—=+*^?#01';
const decode = (txt, k, seed) => { const ch = [...String(txt)], n = ch.length, R = rng(seed); return ch.map((c, i) => { const t = k * (n + 4) - i; return c === ' ' ? ' ' : t >= 4 ? c : t > 0 ? GL[Math.floor(R() * GL.length)] : ''; }).join(''); };
function labelBar(ctx, txt, x, y, fs, sp, col, txtCol, a = 1, align = 'left', pad = 0.35) {
  ctx.save(); ctx.font = `500 ${fs}px ${UI}`; const w = spaced(ctx, txt, 0, 0, sp, 'left', false), ph = fs * pad, h = fs * 1.35;
  const bx = align === 'center' ? x - w / 2 - ph : x - ph;
  ctx.globalAlpha *= a; ctx.fillStyle = col; ctx.fillRect(bx, y - h / 2, w + ph * 2, h);
  ctx.fillStyle = txtCol; ctx.textBaseline = 'middle'; spaced(ctx, txt, bx + ph, y + fs * 0.04, sp, 'left');
  ctx.restore(); return w + ph * 2;
}
const T = (L, tm) => (tm.edit || L.anim === 'none' ? 1e9 : tm.tau || 0);
const fadeA = (L, tm) => (L.anim === 'fade' && !tm.edit ? clamp((tm.tau || 0) / 0.6, 0, 1) : 1);

// ---------------------------------------------------------------- 1 · weapon reveal
function drawWeapon(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, u = o.unit * (+s.textSize || 1), D = Math.max(2, +L.duration || 9), t = T(L, tm), a = tm.alpha * fadeA(L, tm);
  const k = (x) => (L.anim === 'reveal' ? seg(t, x[0] * D, x[1] * D) : 1);
  backdrop(ctx, L, o, a);
  ctx.save(); ctx.globalAlpha = a;
  const push = 1 + (+s.push || 0) * (tm.edit ? 0 : clamp(t / D, 0, 1));
  const cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2, view = viewOf(s.shape || 'shahed');
  const S = Math.min(fr.w, fr.h) * (view === 'top' ? 0.42 : 0.4) * (+s.size || 1) * push * (['ballistic', 'sam', 'tank', 'ship'].includes(s.shape) ? 1.55 : 1);
  ctx.save(); const [dx, dy] = placeAt(ctx, L, fr, cx - S, cy - S, 2 * S, 2 * S, { key: 'weapon' }); void dx; void dy;
  const kw = s.wire === false ? 1 : k([0, 0.16]), kf = s.wire === false ? k([0, 0.1]) : k([0.12, 0.28]);
  drawShape(ctx, s.shape || 'shahed', cx, cy, S, s.accent, { wire: kw, fill: ease(kf) });
  // callouts
  const cs = cells(s.callouts);
  cs.forEach((c, i) => {
    const kk = k([0.5 + i * 0.08, 0.6 + i * 0.08]); if (kk <= 0) return;
    const px = cx + (+c[1] || 0) * S, py = cy + (+c[2] || 0) * S;
    ctx.font = `500 ${10 * u}px ${UI}`; const tw0 = spaced(ctx, String(c[0] || '').toUpperCase(), 0, 0, 1.2 * u, 'left', false) + 24 * u;
    let side = (+c[1] || 0) >= 0 ? 1 : -1; if (side > 0 && px + 60 * u + tw0 > fr.x + fr.w - 20 * u) side = -1; if (side < 0 && px - 60 * u - tw0 < fr.x + 20 * u) side = 1;
    const ex = px + side * 60 * u, ey = py - 30 * u * Math.sign((+c[2] || 0) || -1) * -1;
    ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1 * u; ctx.globalAlpha *= 0.9;
    ctx.beginPath(); ctx.arc(px, py, 2.5 * u, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
    const e1 = Math.min(1, kk * 2); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + (ex - px) * e1, py + (ey - py) * e1); ctx.stroke();
    if (kk > 0.5) { ctx.font = `500 ${10 * u}px ${UI}`; const txt = String(c[0] || '').toUpperCase(); const w = spaced(ctx, txt, 0, 0, 1.2 * u, 'left', false); const full = w + 10 * u, bw = full * ease((kk - 0.5) * 2); const bx0 = side > 0 ? ex + 14 * u : ex - 14 * u - full; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + side * 14 * u, ey); ctx.stroke(); const rx = side > 0 ? bx0 : bx0 + full - bw; ctx.strokeRect(rx, ey - 9 * u, bw, 18 * u); ctx.save(); ctx.beginPath(); ctx.rect(rx, ey - 9 * u, bw, 18 * u); ctx.clip(); ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; spaced(ctx, txt, bx0 + 5 * u, ey + 0.5 * u, 1.2 * u); ctx.restore(); }
    ctx.restore();
  });
  // magnifier
  if (s.lens) {
    const kk = k([0.6, 0.72]);
    if (kk > 0) {
      const lx = cx + (+s.lensX || 0) * S, ly = cy + (+s.lensY || 0) * S, R = S * 0.42 * ease(kk), Z = 2.4;
      ctx.save(); ctx.beginPath(); ctx.arc(lx, ly, R, 0, 7); ctx.fillStyle = rgba(s.bg || '#17141a', 0.92); ctx.fill(); ctx.clip();
      ctx.translate(lx, ly); ctx.scale(Z, Z); ctx.translate(-lx, -ly); drawShape(ctx, s.shape || 'shahed', cx, cy, S, s.accent, { fill: 1, glow: false });
      ctx.restore();
      ctx.save(); ctx.strokeStyle = s.accent; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.arc(lx, ly, R, 0, 7); ctx.stroke(); ctx.globalAlpha *= 0.4; ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.arc(lx, ly, R * 1.15, 0, 7); ctx.stroke(); ctx.restore();
      if (s.lensLabel && kk > 0.7) { ctx.save(); ctx.font = `500 ${9.5 * u}px ${UI}`; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1 * u; const w = spaced(ctx, s.lensLabel.toUpperCase(), 0, 0, 1.2 * u, 'left', false); ctx.strokeRect(lx + R * 0.55, ly + R * 0.8, w + 10 * u, 16 * u); spaced(ctx, s.lensLabel.toUpperCase(), lx + R * 0.55 + 5 * u, ly + R * 0.8 + 8.5 * u, 1.2 * u); ctx.restore(); }
    }
  }
  ctx.restore();
  // name
  const kn = k([0.1, 0.3]);
  if (s.name && kn > 0) {
    ctx.save(); const fs = 40 * u, sp = fs * 0.28, ny = fr.y + fr.h * clamp(+s.nameY || 0.5, 0.05, 0.95);
    ctx.font = `500 ${fs}px ${UI}`; ctx.textBaseline = 'middle';
    const words = String(s.name).toUpperCase().split(' '), kr = s.rename ? k([0.38, 0.46]) : 0;
    if (kr > 0) words[0] = decode(String(s.rename).toUpperCase(), kr, 7) || words[0];
    const full = words.join(' '), shown = kn < 1 ? decode(full, kn, 3) : full;
    const [ddx, ddy] = placeAt(ctx, L, fr, cx - 300 * u, ny - fs, 600 * u, fs * 2, { key: 'name' }); void ddx; void ddy;
    const w = spaced(ctx, full, cx, ny, sp, 'center', false), x0 = cx - w / 2;
    if (kr > 0) { const w0 = spaced(ctx, words[0], 0, 0, sp, 'left', false); ctx.fillStyle = 'rgba(240,240,245,0.92)'; ctx.fillRect(x0 - sp * 0.5, ny - fs * 0.62, (w0 + sp) * ease(Math.min(1, kr * 1.6)), fs * 1.24); }
    ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8 * u;
    if (kr > 0) { ctx.fillStyle = '#26222a'; spaced(ctx, words[0], x0, ny, sp); ctx.fillStyle = '#fff'; const w0 = spaced(ctx, `${words[0]} `, 0, 0, sp, 'left', false) + sp; spaced(ctx, words.slice(1).join(' '), x0 + w0, ny, sp); }
    else spaced(ctx, shown, x0, ny, sp);
    if (s.kicker) { ctx.font = `600 ${9 * u}px ${UI}`; ctx.shadowBlur = 0; ctx.fillStyle = s.accent; ctx.fillRect(x0, ny - fs * 0.95, 10 * u, 6 * u); ctx.fillStyle = 'rgba(255,255,255,0.8)'; spaced(ctx, s.kicker.toUpperCase(), x0 + 14 * u, ny - fs * 0.95 + 3 * u, 1.5 * u); }
    ctx.restore();
  }
  // spec table
  const sp = cells(s.specs);
  if (sp.length) {
    const kk = k([0.66, 0.8]);
    if (kk > 0) {
      ctx.save(); ctx.font = `600 ${9 * u}px ${UI}`; const x0 = fr.x + fr.w * 0.06, y0 = fr.y + fr.h * 0.66;
      ctx.translate(...placeAt(ctx, L, fr, x0, y0 - 20 * u, 300 * u, sp.length * 18 * u + 24 * u, { key: 'specs' }).map(() => 0));
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.textBaseline = 'middle'; spaced(ctx, 'PERFORMANCE', x0, y0 - 10 * u, 1.2 * u); spaced(ctx, 'REPORTED FIGURE', x0 + 150 * u, y0 - 10 * u, 1.2 * u);
      sp.forEach((r, i) => { const kr = clamp(kk * sp.length - i, 0, 1); if (kr <= 0) return; ctx.globalAlpha = a * kr; ctx.font = `500 ${9 * u}px ${UI}`; ctx.fillStyle = 'rgba(255,255,255,0.6)'; spaced(ctx, String(r[0] || '').toUpperCase(), x0, y0 + 12 * u + i * 17 * u, 1 * u); ctx.fillStyle = '#fff'; spaced(ctx, String(r[1] || '').toUpperCase(), x0 + 150 * u, y0 + 12 * u + i * 17 * u, 1 * u); ctx.globalAlpha = a * kr * 0.25; ctx.fillRect(x0, y0 + 21 * u + i * 17 * u, 280 * u, 1); });
      ctx.restore();
    }
  }
  ctx.restore();
  finish(ctx, L, o, a, t);
}

// ---------------------------------------------------------------- 2 · production grid
function drawCount(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, u = o.unit * (+s.textSize || 1), D = Math.max(1, +L.duration || 6), t = T(L, tm), a = tm.alpha * fadeA(L, tm);
  backdrop(ctx, L, o, a); ctx.save(); ctx.globalAlpha = a;
  const cols = clamp(Math.round(+s.cols || 12), 1, 40), rows = clamp(Math.round(+s.rows || 4), 1, 20), first = clamp(Math.round(+s.first || 0), 0, cols);
  const cell = Math.min(fr.w * 0.86 / cols, fr.h * 0.62 / rows), S = cell * 0.42;
  const gx = fr.x + fr.w / 2 - (cols * cell) / 2 + cell / 2, gy = fr.y + fr.h * 0.42 - (rows * cell) / 2 + cell / 2;
  const total = cols * rows, phase1 = 0.35 * D, phase2 = 0.75 * D;
  const isGrid = L.anim !== 'grow' || t > phase1;
  for (let i = 0; i < total; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    let kk;
    if (!isGrid) { if (r > 0 || c >= first) continue; const fcx = fr.x + fr.w / 2 - (first * cell) / 2 + cell / 2; kk = seg(t, 0.2 + c * 0.18, 0.45 + c * 0.18); if (kk <= 0) continue; drawShape(ctx, s.shape, fcx + c * cell, gy + (rows - 1) * cell / 2, S * 1.3, s.accent, { fill: ease(kk), panel: false }); if (s.unitText && kk > 0.6) { ctx.font = `500 ${8 * u}px ${UI}`; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillText(s.unitText, fcx + c * cell + S * 0.9, gy + (rows - 1) * cell / 2 - S * 1.1); } continue; }
    kk = L.anim === 'grow' ? seg(t, phase1 + (i / total) * (phase2 - phase1) * 0.85, phase1 + (i / total) * (phase2 - phase1) * 0.85 + 0.25) : 1;
    if (kk <= 0) continue;
    drawShape(ctx, s.shape, gx + c * cell, gy + r * cell, S * (0.6 + 0.4 * ease(kk)), s.accent, { fill: ease(kk), panel: false, glow: false, hollow: s.hollow !== false && r === rows - 1 && rows > 1 });
  }
  if (s.label) {
    const kk = L.anim === 'grow' ? seg(t, 0.15 * D, 0.45 * D) : 1;
    if (kk > 0) { ctx.save(); const fs = 26 * u, y = isGrid ? fr.y + fr.h * 0.86 : gy + (rows - 1) * cell / 2 + S * 2.2; ctx.font = `500 ${fs}px ${UI}`; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; const txt = String(s.label).toUpperCase(); const n = Math.round(txt.length * ease(kk)); ctx.translate(...placeAt(ctx, L, fr, fr.x + fr.w / 2 - 250 * u, y - fs, 500 * u, fs * 2, { key: 'label' }).map(() => 0)); spaced(ctx, txt.slice(0, n), fr.x + fr.w / 2 - spaced(ctx, txt, 0, 0, fs * 0.3, 'left', false) / 2, y, fs * 0.3); ctx.restore(); }
  }
  ctx.restore(); finish(ctx, L, o, a, t);
}

// ---------------------------------------------------------------- 3 · missile stream counter
function drawStream(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, u = o.unit * (+s.textSize || 1), D = Math.max(1, +L.duration || 7), t = T(L, tm), a = tm.alpha;
  backdrop(ctx, L, o, a); ctx.save(); ctx.globalAlpha = a;
  const rows = clamp(Math.round(+s.rows || 9), 1, 30), rh = fr.h * 0.8 / rows, S = rh * 0.9, tt = tm.edit ? 2 : t;
  ctx.save(); ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); ctx.clip();
  for (let r = 0; r < rows; r++) {
    const y = fr.y + fr.h * 0.1 + (r + 0.5) * rh, R = rng(r * 31 + 5), sp = (0.12 + R() * 0.08) * fr.w * (+s.speed || 1), gap = S * 2.6 + R() * S, off = R() * gap;
    const n = Math.ceil(fr.w / gap) + 2;
    for (let i = -1; i < n; i++) {
      const x = fr.x + ((i * gap + off + tt * sp) % (n * gap)) - gap;
      ctx.globalAlpha = a * (0.55 + 0.45 * R());
      drawShape(ctx, s.shape || 'ballistic', x, y, S, s.accent, { fill: 1, panel: false, glow: false });
    }
  }
  ctx.restore();
  const k = L.anim === 'none' || tm.edit ? 1 : ease(seg(t, 0.15 * D, 0.75 * D));
  const val = Math.round((+s.from || 0) + ((+s.to || 0) - (+s.from || 0)) * k);
  const fs = 34 * u, cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2;
  ctx.save(); ctx.translate(...placeAt(ctx, L, fr, cx - 300 * u, cy - fs * 1.6, 600 * u, fs * 2.6, { key: 'bar' }).map(() => 0));
  const txt = `${val} ${String(s.suffix || '').toUpperCase()}`.trim(), kb = L.anim === 'none' || tm.edit ? 1 : ease(seg(t, 0, 0.12 * D));
  ctx.font = `500 ${fs}px ${UI}`; const w = spaced(ctx, txt, 0, 0, fs * 0.25, 'left', false);
  ctx.globalAlpha = a; ctx.fillStyle = 'rgba(232,226,240,0.94)'; ctx.fillRect(cx - w / 2 - fs * 0.4, cy - fs * 0.68, (w + fs * 0.8) * kb, fs * 1.36);
  if (kb > 0.6) { ctx.fillStyle = '#231f29'; ctx.textBaseline = 'middle'; spaced(ctx, txt, cx - w / 2, cy + fs * 0.04, fs * 0.25); }
  if (s.kicker) { ctx.font = `600 ${12 * u}px ${UI}`; ctx.fillStyle = '#fff'; ctx.fillRect(cx - w / 2 - fs * 0.4, cy - fs * 0.68 - 20 * u, spaced(ctx, s.kicker.toUpperCase(), 0, 0, 2 * u, 'left', false) + 14 * u, 18 * u); ctx.fillStyle = '#231f29'; ctx.textBaseline = 'middle'; spaced(ctx, s.kicker.toUpperCase(), cx - w / 2 - fs * 0.4 + 7 * u, cy - fs * 0.68 - 11 * u, 2 * u); }
  ctx.restore(); ctx.restore(); finish(ctx, L, o, a, t);
}

// ---------------------------------------------------------------- 4 · versus
function drawVersus(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, u = o.unit * (+s.textSize || 1), D = Math.max(1, +L.duration || 6), t = T(L, tm), a = tm.alpha * fadeA(L, tm);
  backdrop(ctx, L, o, a); ctx.save(); ctx.globalAlpha = a;
  const R = cells(s.rows), n = Math.max(1, R.length), rh = Math.min(fr.h * 0.7 / n, fr.h * 0.3), y0 = fr.y + fr.h / 2 - (n * rh) / 2;
  R.forEach((r, i) => {
    const kk = L.anim === 'stack' ? seg(t, (i / n) * 0.6 * D, (i / n) * 0.6 * D + 0.6) : 1; if (kk <= 0) return;
    const y = y0 + (i + 0.5) * rh, S = rh * 0.9, x = fr.x + fr.w * 0.42 + (1 - ease(kk)) * fr.w * 0.25;
    ctx.save(); ctx.globalAlpha = a * kk;
    if (i > 0) { ctx.globalAlpha = a * kk * 0.3; ctx.fillStyle = '#fff'; ctx.fillRect(fr.x + fr.w * 0.05, y - rh / 2, fr.w * 0.9, 1); ctx.globalAlpha = a * kk; }
    drawShape(ctx, r[2] || 'ballistic', x, y + S * 0.1, S, s.accent, { fill: 1, wire: 1 });
    const fs = 24 * u, txt = `${r[0] || ''} ${String(r[1] || '').toUpperCase()}`.trim();
    labelBar(ctx, txt, fr.x + fr.w * 0.2, y - S * 0.18, fs, fs * 0.22, 'rgba(232,226,240,0.94)', '#231f29', 1);
    ctx.restore();
  });
  ctx.restore(); finish(ctx, L, o, a, t);
}

// ---------------------------------------------------------------- 5 · glitch title
function drawTitle(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, u = o.unit * (+s.textSize || 1), D = Math.max(0.5, +L.duration || 4), t = T(L, tm), a = tm.alpha * fadeA(L, tm);
  backdrop(ctx, L, o, a);
  const txt = String(s.text || '').toUpperCase(), fs = Math.min(64 * u, fr.w * 0.8 / Math.max(4, txt.length) / (0.75 + (+s.spacing || 0))), sp = fs * (+s.spacing || 0.08);
  const cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2, k = L.anim === 'glitch' ? seg(t, 0, 0.55 * Math.min(D, 4)) : 1;
  const ko = s.outline !== false && L.anim === 'glitch' ? seg(t, 0.25 * Math.min(D, 4), 0.75 * Math.min(D, 4)) : 1;
  ctx.save(); ctx.globalAlpha = a; ctx.font = `800 ${fs}px ${UI}`; ctx.textBaseline = 'middle';
  ctx.translate(...placeAt(ctx, L, fr, cx - 360 * u, cy - fs, 720 * u, fs * 2, { key: 'title' }).map(() => 0));
  const G = (+s.glitch ?? 1) * (1 - k) * (tm.edit ? 0 : 1), R = rng(Math.floor((t || 0) * 30) + 3);
  const w = spaced(ctx, txt, 0, 0, sp, 'left', false), x0 = cx - w / 2;
  // noise slices
  for (const i of G > 0.05 ? [0, 1, 2] : [2]) {
    const off = (R() - 0.5) * 40 * u * G, col = ['rgba(255,60,80,0.7)', 'rgba(60,200,255,0.6)', 'rgba(255,255,255,0.9)'][i];
    ctx.save(); ctx.globalAlpha = a * (i < 2 ? 0.6 * Math.min(1, G + 0.15) : 1) * (0.3 + 0.7 * k);
    ctx.fillStyle = ko >= 1 ? (i === 2 ? '#d8d6dc' : col) : 'rgba(0,0,0,0)'; ctx.strokeStyle = i === 2 ? 'rgba(220,220,228,0.9)' : col; ctx.lineWidth = 1.4 * u;
    let x = x0 + (i < 2 ? off : 0); const ch = [...txt];
    for (const c of ch) { const cw = ctx.measureText(c).width; const sh = G > 0.05 && R() < 0.3 * G ? (R() - 0.5) * 30 * u * G : 0; if (ko < 1) ctx.strokeText(c, x + sh, cy); if (ko > 0) { ctx.save(); ctx.globalAlpha *= ko; ctx.fillStyle = i === 2 ? '#d8d6dc' : col; ctx.fillText(c, x + sh, cy); ctx.restore(); } x += cw + sp; }
    ctx.restore();
  }
  if (G > 0.05) for (let i = 0; i < 18 * G; i++) { ctx.fillStyle = R() > 0.5 ? 'rgba(255,255,255,0.25)' : rgba(s.accent, 0.4); ctx.fillRect(x0 + R() * w, cy - fs * 0.6 + R() * fs * 1.2, R() * 60 * u, 2 + R() * 6 * u); }
  if (s.sub) { ctx.font = `500 ${14 * u}px ${UI}`; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.globalAlpha = a * ko; spaced(ctx, s.sub.toUpperCase(), cx, cy + fs * 0.95, 4 * u, 'center'); }
  ctx.restore(); finish(ctx, L, o, a, t);
}

// ---------------------------------------------------------------- 6 · typed quote
function smokeLayer(ctx, fr, t, u, a) {
  const R = rng(11); ctx.save();
  for (let i = 0; i < 18; i++) {
    const x = fr.x + R() * fr.w, y = fr.y + fr.h * (0.4 + R() * 0.7), r = fr.h * (0.18 + R() * 0.3), dx = Math.sin(t * 0.2 + i) * 30 * u + t * 6 * u * (R() - 0.3);
    const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, r); g.addColorStop(0, `rgba(190,185,200,${0.16 * a})`); g.addColorStop(1, 'rgba(190,185,200,0)'); ctx.fillStyle = g; ctx.fillRect(x + dx - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}
function wrapLines(ctx, txt, maxW, sp) {
  const out = []; for (const para of String(txt).split('\n')) { let line = ''; for (const w of para.split(/\s+/)) { const tt = line ? `${line} ${w}` : w; if (spaced(ctx, tt, 0, 0, sp, 'left', false) > maxW && line) { out.push(line); line = w; } else line = tt; } out.push(line); out.push(''); }
  out.pop(); return out;
}
function drawQuote(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, u = o.unit * (+s.textSize || 1), t = T(L, tm), a = tm.alpha * fadeA(L, tm);
  backdrop(ctx, L, o, a);
  if (s.smoke !== false) smokeLayer(ctx, fr, tm.edit ? 1 : t, u, a);
  ctx.save(); ctx.globalAlpha = a; const fs = 13 * u, sp = fs * 0.22;
  ctx.font = `500 ${fs}px ${UI}`; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
  const L0 = wrapLines(ctx, s.text, fr.w * 0.55, sp), lh = fs * 1.9, cx = fr.x + fr.w / 2, y0 = fr.y + fr.h * 0.34;
  ctx.translate(...placeAt(ctx, L, fr, cx - fr.w * 0.3, y0 - lh, fr.w * 0.6, L0.length * lh + 40 * u, { key: 'quote' }).map(() => 0));
  let left = L.anim === 'type' && !tm.edit ? Math.floor(t * (+s.cps || 32)) : 1e9;
  L0.forEach((ln, i) => { if (left <= 0) return; const sh = ln.slice(0, left); left -= ln.length + 1; const w = spaced(ctx, ln, 0, 0, sp, 'left', false); spaced(ctx, sh, cx - w / 2, y0 + i * lh, sp); });
  if (s.who) { ctx.font = `600 ${9 * u}px ${UI}`; ctx.fillStyle = 'rgba(255,255,255,0.7)'; spaced(ctx, s.who.toUpperCase(), cx, fr.y + fr.h * 0.86, 3 * u, 'center'); }
  ctx.restore(); finish(ctx, L, o, a, t);
}

// ---------------------------------------------------------------- 7 · article highlight
function drawArticle(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, u = o.unit * (+s.textSize || 1), D = Math.max(2, +L.duration || 12), t = T(L, tm), a = tm.alpha;
  backdrop(ctx, L, o, a);
  const F = s.serif !== false ? 'Georgia,"Times New Roman",serif' : UI, colW = Math.min(fr.w * 0.46, 520 * u), cx = fr.x + fr.w / 2, x0 = cx - colW / 2;
  ctx.save(); ctx.globalAlpha = a; ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); ctx.clip();
  // layout pass
  const items = []; let y = 0;
  ctx.font = `600 ${22 * u}px ${F}`; for (const l of wrapLines(ctx, s.headline, colW, 0)) { items.push({ t: l, f: `600 ${22 * u}px ${F}`, y, c: '#fff', al: 'center' }); y += 27 * u; }
  y += 10 * u; ctx.font = `600 ${10.5 * u}px ${F}`; for (const l of wrapLines(ctx, s.standfirst, colW * 0.92, 0)) { items.push({ t: l, f: `600 ${10.5 * u}px ${F}`, y, c: 'rgba(255,255,255,0.85)', al: 'center' }); y += 15 * u; }
  y += 18 * u; if (s.byline) { items.push({ t: s.byline, f: `500 ${8.5 * u}px ${UI}`, y, c: 'rgba(255,255,255,0.65)', al: 'center', dot: true }); y += 30 * u; }
  const bodyY = y; ctx.font = `400 ${10 * u}px ${F}`;
  const hl = String(s.highlight || '').trim(); const lines0 = [];
  for (const para of String(s.body || '').split('\n')) { for (const l of wrapLines(ctx, para, colW, 0)) { lines0.push({ t: l, y }); y += 15.5 * u; } y += 9 * u; }
  // where the highlight is
  const full = lines0.map((l) => l.t).join(' '); const hi = hl ? full.indexOf(hl) : -1;
  // scroll: start with headline centred, end with the highlight centred
  let targetY = hi >= 0 ? (() => { let n = 0; for (const l of lines0) { if (n + l.t.length >= hi) return l.y; n += l.t.length + 1; } return bodyY; })() : bodyY;
  const kS = L.anim === 'scroll' && !tm.edit ? ease(seg(t, 0.15 * D, 0.6 * D)) : 1;
  const top0 = fr.y + fr.h * 0.3, top1 = fr.y + fr.h * 0.45 - targetY;
  const off = top0 + (top1 - top0) * kS;
  for (const it of items) { ctx.font = it.f; ctx.fillStyle = it.c; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; if (it.dot) { ctx.beginPath(); ctx.arc(cx, off + it.y - 12 * u, 7 * u, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill(); ctx.fillStyle = it.c; } ctx.fillText(it.t, cx, off + it.y); }
  ctx.textAlign = 'left'; ctx.font = `400 ${10 * u}px ${F}`;
  const kH = L.anim === 'scroll' && !tm.edit ? seg(t, 0.62 * D, 0.85 * D) : 1;
  let n = 0, hlLeft = hi >= 0 ? Math.round(hl.length * kH) : 0;
  for (const l of lines0) {
    const yy = off + l.y; const a0 = n, a1 = n + l.t.length;
    if (hi >= 0 && hlLeft > 0 && a1 >= hi && a0 <= hi + hl.length) {
      const st = Math.max(0, hi - a0), en = Math.min(l.t.length, st + Math.min(hlLeft, hi + hl.length - Math.max(a0, hi)));
      const xs = x0 + ctx.measureText(l.t.slice(0, st)).width, xe = x0 + ctx.measureText(l.t.slice(0, en)).width;
      ctx.fillStyle = rgba(s.accent, 0.85); ctx.fillRect(xs - 1, yy - 1 * u, xe - xs + 2, 14 * u); hlLeft -= en - st;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.textBaseline = 'top'; ctx.fillText(l.t, x0, yy); n += l.t.length + 1;
  }
  ctx.restore();
  // top / bottom fade
  ctx.save(); const g = ctx.createLinearGradient(0, fr.y, 0, fr.y + fr.h); g.addColorStop(0, rgba(s.bg, a)); g.addColorStop(0.12, rgba(s.bg, 0)); g.addColorStop(0.88, rgba(s.bg, 0)); g.addColorStop(1, rgba(s.bg, a)); ctx.fillStyle = g; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); ctx.restore();
  finish(ctx, L, o, a, t);
}

// ---------------------------------------------------------------- 8 · threat trend chart
function drawChart(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, u = o.unit * (+s.textSize || 1), D = Math.max(1, +L.duration || 9), t = T(L, tm), a = tm.alpha;
  backdrop(ctx, L, o, a);
  const pts = lines(s.data).map((l) => l.split(/[:|,]/).map((x) => x.trim())).map(([x, y]) => [+x, +y]).filter((p) => isFinite(p[0]) && isFinite(p[1]));
  if (pts.length < 2) return;
  const x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0])), y1 = Math.max(...pts.map((p) => p[1])) * 1.15;
  const L0 = fr.x + fr.w * 0.12, R0 = fr.x + fr.w * 0.9, T0 = fr.y + fr.h * 0.32, B0 = fr.y + fr.h * 0.78;
  const X = (v) => L0 + (v - x0) / (x1 - x0 || 1) * (R0 - L0), Y = (v) => B0 - (v / (y1 || 1)) * (B0 - T0);
  const k = L.anim === 'draw' && !tm.edit ? seg(t, 0.4, 0.85 * D) : 1, xNow = x0 + (x1 - x0) * k;
  ctx.save(); ctx.globalAlpha = a;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#fff'; ctx.font = `600 ${18 * u}px ${UI}`; ctx.fillText(s.title || '', fr.x + fr.w / 2, fr.y + fr.h * 0.1);
  ctx.font = `400 ${9.5 * u}px ${UI}`; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText(s.sub || '', fr.x + fr.w / 2, fr.y + fr.h * 0.1 + 26 * u);
  // axis ticks
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = `500 ${8 * u}px ${UI}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) { const v = (y1 / 4) * i; ctx.fillText(Math.round(v), L0 - 12 * u, Y(v)); }
  // year chips
  const years = pts.map((p) => p[0]).filter((v, i, A0) => A0.length < 14 || i % 2 === 0 || v === +s.highlight);
  for (const yv of years) {
    if (yv > xNow + 0.01) continue; const x = X(yv), hl = String(yv) === String(s.highlight).trim();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - 0.5, Y(pts.find((p) => p[0] === yv)?.[1] ?? 0), 1, B0 - Y(pts.find((p) => p[0] === yv)?.[1] ?? 0));
    ctx.font = `700 ${8.5 * u}px ${UI}`; const w = ctx.measureText(String(yv)).width + 10 * u;
    ctx.fillStyle = hl ? s.accent : 'rgba(235,235,240,0.92)'; ctx.fillRect(x - w / 2, B0 + 10 * u, w, 14 * u);
    ctx.fillStyle = hl ? '#fff' : '#1d1b22'; ctx.textAlign = 'center'; ctx.fillText(String(yv), x, B0 + 17.5 * u);
  }
  // line (smooth)
  const vis0 = []; for (let i = 0; i < pts.length; i++) { if (pts[i][0] <= xNow) vis0.push(pts[i]); else { const p0 = pts[i - 1], p1 = pts[i], f = (xNow - p0[0]) / (p1[0] - p0[0]); vis0.push([xNow, p0[1] + (p1[1] - p0[1]) * f]); break; } }
  ctx.strokeStyle = s.accent; ctx.lineWidth = 2.2 * u; ctx.shadowColor = rgba(s.accent, 0.7); ctx.shadowBlur = 8 * u; ctx.beginPath();
  vis0.forEach((p, i) => { const x = X(p[0]), y = Y(p[1]); if (!i) ctx.moveTo(x, y); else { const q = vis0[i - 1]; const mx = (X(q[0]) + x) / 2; ctx.bezierCurveTo(mx, Y(q[1]), mx, y, x, y); } }); ctx.stroke(); ctx.shadowBlur = 0;
  const last = vis0[vis0.length - 1]; if (last) { ctx.beginPath(); ctx.arc(X(last[0]), Y(last[1]), 3.5 * u, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); }
  // notes
  for (const [yr, txt] of cells(s.notes)) {
    const yv = +yr; if (!isFinite(yv) || yv > xNow) continue; const p = pts.reduce((b, q) => (Math.abs(q[0] - yv) < Math.abs(b[0] - yv) ? q : b)); const x = X(yv), y = Y(p[1]);
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = `500 ${8.5 * u}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const ws = wrapLines(ctx, txt, 110 * u, 0); ws.forEach((w, i) => ctx.fillText(w, x, y - 14 * u - (ws.length - 1 - i) * 11 * u));
    ctx.fillRect(x - 0.5, y - 12 * u, 1, 8 * u);
  }
  ctx.restore(); finish(ctx, L, o, a, t);
}

// ---------------------------------------------------------------- 9 · neon zones (polygon)
function drawZones(ctx, L, tm, o, phase) {
  const s = L.style, u = o.unit * (+s.textSize || 1), P = polysOf(L.geom); if (!P.length) return;
  const t = T(L, tm), D = Math.max(0.5, +L.duration || 4), a = tm.alpha * fadeA(L, tm);
  const k = L.anim === 'draw' && !tm.edit ? seg(t, 0, 0.7 * D) : 1;
  if (phase === 'below') {
    ctx.save(); ctx.globalAlpha = a;
    ctx.beginPath(); pathPolys(ctx, P, o.proj);
    if (+s.fill > 0) { ctx.save(); ctx.globalAlpha = a * +s.fill * k; ctx.fillStyle = s.accent; ctx.fill('evenodd'); ctx.restore(); }
    // length-based draw-on
    let len = 0; for (const p of P) for (const r of p) for (let i = 1; i < r.length; i++) { const A0 = o.proj(r[i - 1]), B = o.proj(r[i]); len += Math.hypot(B[0] - A0[0], B[1] - A0[1]); }
    ctx.setLineDash(k < 1 ? [len * k, len] : []);
    for (const [w, al] of [[(+s.width || 2.4) * 4 * (+s.glow || 1), 0.18], [(+s.width || 2.4) * 2, 0.35], [+s.width || 2.4, 1]]) { ctx.strokeStyle = al === 1 ? '#eafff3' : s.accent; ctx.globalAlpha = a * al; ctx.lineWidth = w * u; ctx.lineJoin = 'round'; ctx.stroke(); }
    ctx.restore(); return;
  }
  if (phase !== 'captions' || !s.name) return;
  const kl = L.anim === 'draw' && !tm.edit ? seg(t, 0.6 * D, 0.85 * D) : 1; if (kl <= 0) return;
  const c = labelPoint(P); if (!c) return; const [x, y] = o.proj(c);
  ctx.save(); ctx.globalAlpha = a * kl; ctx.font = `700 ${11 * u * (+s.labelSize || 1)}px ${UI}`; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4 * u;
  ctx.translate(...placeAt(ctx, L, o.frame, x - 60 * u, y - 10 * u, 120 * u, 20 * u, { key: 'name' }).map(() => 0));
  spaced(ctx, String(s.name).toUpperCase(), x, y, 1.2 * u, 'center'); ctx.restore();
}

// ---------------------------------------------------------------- 10 · strike corridor (line)
function linePts(L, o) { const g = L.geom; const LL = g?.type === 'LineString' ? g.coordinates : g?.type === 'MultiLineString' ? g.coordinates.flat() : []; return LL.map((p) => o.proj(p)); }
function along(P, f) { let tot = 0; const d = [0]; for (let i = 1; i < P.length; i++) { tot += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); d.push(tot); } const want = tot * f; for (let i = 1; i < P.length; i++) if (d[i] >= want) { const q = (want - d[i - 1]) / (d[i] - d[i - 1] || 1); return { x: P[i - 1][0] + (P[i][0] - P[i - 1][0]) * q, y: P[i - 1][1] + (P[i][1] - P[i - 1][1]) * q, tot }; } return { x: P[P.length - 1][0], y: P[P.length - 1][1], tot }; }
function drawCorridor(ctx, L, tm, o, phase) {
  const s = L.style, u = o.unit * (+s.textSize || 1), P = linePts(L, o); if (P.length < 2) return;
  const t = T(L, tm), D = Math.max(1, +L.duration || 6), a = tm.alpha, k = L.anim === 'draw' && !tm.edit ? ease(seg(t, 0, 0.45 * D)) : 1;
  if (phase === 'below') {
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6 * u; ctx.lineCap = 'round';
    const end = along(P, k);
    ctx.setLineDash(s.dash !== false ? [3 * u, 5 * u] : []); ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
    let acc = 0; for (let i = 1; i < P.length; i++) { const sl = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (acc + sl >= end.tot * k) { ctx.lineTo(end.x, end.y); break; } ctx.lineTo(P[i][0], P[i][1]); acc += sl; }
    ctx.stroke(); ctx.restore(); return;
  }
  if (phase !== 'captions') return;
  const n = clamp(Math.round(+s.strikes || 0), 0, 60);
  ctx.save(); ctx.globalAlpha = a;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n, ts = L.anim === 'draw' && !tm.edit ? 0.3 * D + f * 0.6 * D : -1; const kk = tm.edit || L.anim === 'none' ? 1 : seg(t, ts, ts + 0.5); if (kk <= 0) continue;
    const p = along(P, f), r = 9 * u * (+s.burst || 1);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * (1 + (1 - kk) * 1.6)); g.addColorStop(0, `rgba(255,240,180,${0.95})`); g.addColorStop(0.45, `rgba(255,150,40,${0.8})`); g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * (1 + (1 - kk) * 1.6), 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,120,0.9)'; ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.75, 0, 7); ctx.stroke();
  }
  if (s.label) {
    const kl = L.anim === 'draw' && !tm.edit ? seg(t, 0.35 * D, 0.55 * D) : 1;
    if (kl > 0) { const p = along(P, clamp(+s.labelAt ?? 0.5, 0, 1)); ctx.translate(...placeAt(ctx, L, o.frame, p.x + 14 * u, p.y - 10 * u, 300 * u, 20 * u, { key: 'label' }).map(() => 0)); ctx.font = `600 ${9.5 * u}px ${UI}`; const txt = String(s.label).toUpperCase(); const w = spaced(ctx, txt, 0, 0, 1.6 * u, 'left', false) + 14 * u; ctx.fillStyle = rgba('#1a1a1e', 0.9); ctx.fillRect(p.x + 14 * u, p.y - 9 * u, w * ease(kl), 18 * u); ctx.fillStyle = s.accent; ctx.fillRect(p.x + 14 * u, p.y - 9 * u, 3 * u, 18 * u); if (kl > 0.6) { ctx.fillStyle = s.accent; ctx.textBaseline = 'middle'; spaced(ctx, txt, p.x + 21 * u, p.y + 0.5 * u, 1.6 * u); } }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- 11 · satellite inset box (point)
function drawInset(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, u = o.unit * (+s.textSize || 1), g = L.geom; if (!g || g.type !== 'Point') return;
  const t = T(L, tm), D = Math.max(0.5, +L.duration || 4), a = tm.alpha * fadeA(L, tm), ll = g.coordinates, [x, y] = o.proj(ll);
  const kb = L.anim === 'open' && !tm.edit ? ease(seg(t, 0, 0.25 * D)) : 1, kl = L.anim === 'open' && !tm.edit ? ease(seg(t, 0.2 * D, 0.45 * D)) : 1, kp = L.anim === 'open' && !tm.edit ? ease(seg(t, 0.4 * D, 0.75 * D)) : 1;
  const b = (+s.box || 34) * u, P = Math.min(fr.w, fr.h) * (+s.panel || 0.3);
  let side = s.side || 'auto'; if (side === 'auto') side = x > fr.x + fr.w / 2 ? 'left' : 'right';
  let px = side === 'right' ? x + b + 60 * u : side === 'left' ? x - b - 60 * u - P : x - P / 2, py = side === 'top' ? y - b - 50 * u - P : side === 'bottom' ? y + b + 50 * u : y - P / 2;
  px = clamp(px, fr.x + 16 * u, fr.x + fr.w - P - 16 * u); py = clamp(py, fr.y + 16 * u, fr.y + fr.h - P - 40 * u);
  ctx.save(); ctx.globalAlpha = a;
  // box with corner brackets
  const bracket = (bx, by, w, h, l) => { ctx.beginPath(); for (const [cx0, cy0, dx, dy] of [[bx, by, 1, 1], [bx + w, by, -1, 1], [bx, by + h, 1, -1], [bx + w, by + h, -1, -1]]) { ctx.moveTo(cx0, cy0 + dy * l); ctx.lineTo(cx0, cy0); ctx.lineTo(cx0 + dx * l, cy0); } ctx.stroke(); };
  ctx.strokeStyle = s.accent; ctx.lineWidth = 1.6 * u; const bb = b * (0.6 + 0.4 * kb); ctx.globalAlpha = a * kb; ctx.strokeRect(x - bb / 2, y - bb / 2, bb, bb);
  // leader
  if (kl > 0) { const ax = side === 'right' ? x + bb / 2 : side === 'left' ? x - bb / 2 : x, ay = side === 'top' ? y - bb / 2 : side === 'bottom' ? y + bb / 2 : y; const tx = side === 'right' ? px : side === 'left' ? px + P : px + P / 2, ty = side === 'top' ? py + P : side === 'bottom' ? py : py + P / 2; ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(ax, ay); const mx = side === 'left' || side === 'right' ? (ax + tx) / 2 : ax; ctx.lineTo(ax + (mx - ax) * Math.min(1, kl * 2), ay); if (kl > 0.5) { const f = (kl - 0.5) * 2; ctx.lineTo(mx, ay + (ty - ay) * f); ctx.lineTo(mx + (tx - mx) * f, ay + (ty - ay) * f); } ctx.stroke(); }
  if (kp > 0) {
    ctx.save(); ctx.translate(...placeAt(ctx, L, fr, px, py, P, P, { key: 'panel' }).map(() => 0));
    const ph = P * kp; ctx.globalAlpha = a; ctx.beginPath(); ctx.rect(px, py + (P - ph) / 2, P, ph); ctx.save(); ctx.clip();
    drawTiles(ctx, s.src || 'satellite', ll, +s.zoom || 15, px, py, P, P); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(px, py, P, P); ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2 * u; bracket(px - 6 * u, py - 6 * u, P + 12 * u, P + 12 * u, 14 * u);
    ctx.strokeStyle = s.accent; ctx.strokeRect(px, py, P, P);
    if (s.label) { ctx.font = `700 ${11 * u}px ${UI}`; ctx.fillStyle = '#fff'; ctx.textBaseline = 'top'; ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 5 * u; spaced(ctx, String(s.label).toUpperCase(), px + 8 * u, py + 8 * u, 1.4 * u); if (s.sub) { ctx.font = `500 ${8.5 * u}px ${UI}`; ctx.fillStyle = 'rgba(255,255,255,0.8)'; spaced(ctx, String(s.sub).toUpperCase(), px + 8 * u, py + 24 * u, 1.2 * u); } }
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- 12 · place tag (point)
function drawTag(ctx, L, tm, o) {
  const s = L.style, u = o.unit * (+s.textSize || 1), g = L.geom; if (!g || g.type !== 'Point') return;
  const t = T(L, tm), D = Math.max(0.5, +L.duration || 2.5), a = tm.alpha * fadeA(L, tm), [x, y] = o.proj(g.coordinates);
  const kd = L.anim === 'grow' && !tm.edit ? ease(seg(t, 0, 0.2 * D)) : 1, kb = L.anim === 'grow' && !tm.edit ? ease(seg(t, 0.15 * D, 0.55 * D)) : 1, kt = L.anim === 'grow' && !tm.edit ? seg(t, 0.35 * D, 0.85 * D) : 1;
  ctx.save(); ctx.globalAlpha = a;
  ctx.translate(...placeAt(ctx, L, o.frame, x - 100 * u, y - 12 * u, 200 * u, 24 * u, { key: 'tag' }).map(() => 0));
  const txt = String(s.label || '').toUpperCase(), fs = 11 * u; ctx.font = `700 ${fs}px ${UI}`; const w = spaced(ctx, txt, 0, 0, 1.4 * u, 'left', false) + 16 * u, h = 20 * u;
  ctx.beginPath(); ctx.arc(x, y, 4 * u * kd, 0, 7); ctx.fillStyle = s.tagStyle === 'accent' ? s.accent : '#eafff3'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1 * u; ctx.stroke();
  const bx = x - 8 * u - w * kb, by = y - h / 2;
  if (kb > 0) {
    if (s.tagStyle === 'outline') { ctx.strokeStyle = s.accent; ctx.lineWidth = 1.4 * u; ctx.strokeRect(bx, by, w * kb, h); }
    else { ctx.fillStyle = s.tagStyle === 'accent' ? s.accent : 'rgba(236,255,244,0.95)'; ctx.shadowColor = rgba(s.accent, 0.6); ctx.shadowBlur = 10 * u; ctx.fillRect(bx, by, w * kb, h); ctx.shadowBlur = 0; }
    ctx.save(); ctx.beginPath(); ctx.rect(bx, by, w * kb, h); ctx.clip();
    ctx.fillStyle = s.tagStyle === 'light' ? '#122019' : '#fff'; ctx.textBaseline = 'middle'; spaced(ctx, txt.slice(0, Math.round(txt.length * kt)), bx + 8 * u, y + 0.5 * u, 1.4 * u); ctx.restore();
    if (s.sub && kt >= 1) { ctx.font = `500 ${8.5 * u}px ${UI}`; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.textBaseline = 'top'; spaced(ctx, String(s.sub).toUpperCase(), bx, by + h + 4 * u, 1.2 * u); }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- entry + sound
export function drawMilGfx(ctx, L, tm, o, phase) {
  if (!o.frame) return;
  switch (L.kind) {
    case 'mgzones': return drawZones(ctx, L, tm, o, phase);
    case 'mgcorridor': return drawCorridor(ctx, L, tm, o, phase);
  }
  if (phase !== 'captions') return;
  ({ mgweapon: drawWeapon, mgcount: drawCount, mgstream: drawStream, mgversus: drawVersus, mgtitle: drawTitle, mgquote: drawQuote, mgarticle: drawArticle, mgchart: drawChart, mginset: drawInset, mgtag: drawTag })[L.kind]?.(ctx, L, tm, o);
}
/** sound events (project time) for one layer */
export function mgSoundEvents(L) {
  const s = L.style || {}; if (s.sound === false) return [];
  const t0 = +L.start || 0, D = Math.max(0.5, +L.duration || 3), v = s.soundVol ?? 1, ev = [], P = (t, type, p = {}) => ev.push({ t: t0 + t, type, p: { vol: v, ...p } });
  switch (L.kind) {
    case 'mgweapon': P(0, 'whoosh', { vol: v * 0.7 }); P(0.05, 'datalink', { vol: v * 0.5 }); P(0.1 * D, 'decode', { dur: 0.2 * D, vol: v * 0.6 }); P(0.12 * D, 'sub', { vol: v * 0.6 }); if (s.rename) { P(0.38 * D, 'glitch', { vol: v * 0.8 }); P(0.4 * D, 'hit', { vol: v * 0.7 }); } cells(s.callouts).forEach((_, i) => P((0.5 + i * 0.08) * D, 'click', { vol: v * 0.7 })); if (s.lens) P(0.6 * D, 'servo', { dur: 0.6, vol: v * 0.6 }); if (cells(s.specs).length) P(0.66 * D, 'ticks', { n: 20, dur: 0.14 * D, vol: v * 0.5 }); break;
    case 'mgcount': for (let i = 0; i < Math.min(8, +s.first || 0); i++) P(0.2 + i * 0.18, 'click', { vol: v * 0.7 }); P(0.15 * D, 'ticks', { n: 14, dur: 0.3 * D, vol: v * 0.5 }); P(0.35 * D, 'riser', { dur: 0.4 * D, vol: v * 0.5 }); P(0.75 * D, 'hit', { vol: v * 0.7 }); break;
    case 'mgstream': P(0, 'whoosh', { vol: v * 0.8 }); P(0.15 * D, 'ticks', { n: 30, dur: 0.6 * D, vol: v * 0.45 }); P(0.15 * D, 'riser', { dur: 0.6 * D, vol: v * 0.45 }); P(0.75 * D, 'hit', { vol: v * 0.8 }); break;
    case 'mgversus': cells(s.rows).forEach((_, i, A0) => { P((i / A0.length) * 0.6 * D, 'swoosh', { vol: v * 0.8 }); P((i / A0.length) * 0.6 * D + 0.4, 'click', { vol: v * 0.6 }); }); P(0.7 * D, 'sub', { vol: v * 0.6 }); break;
    case 'mgtitle': P(0, 'static', { dur: Math.min(1.8, D * 0.5), vol: v * 0.5 }); P(0.05, 'glitch', { vol: v }); P(0.5 * Math.min(D, 4), 'boom', { vol: v }); break;
    case 'mgquote': { const n = String(s.text || '').length, dur = n / Math.max(5, +s.cps || 32); P(0.05, 'ticks', { n, dur: Math.min(D, dur), vol: v * 0.55 }); P(0, 'wind', { dur: D, vol: v * 0.2 }); break; }
    case 'mgarticle': P(0.15 * D, 'swoosh', { vol: v * 0.6 }); P(0.62 * D, 'swoosh', { vol: v * 0.5 }); P(0.64 * D, 'click', { vol: v * 0.5 }); break;
    case 'mgchart': P(0.3, 'datalink', { vol: v * 0.5 }); P(0.4, 'ticks', { n: 24, dur: 0.8 * D, vol: v * 0.4 }); P(0.4, 'riser', { dur: 0.45 * D, vol: v * 0.4 }); break;
    case 'mgzones': P(0, 'datalink', { vol: v * 0.6 }); P(0.6 * D, 'click', { vol: v * 0.6 }); break;
    case 'mgcorridor': { P(0, 'swoosh', { vol: v * 0.6 }); const n = clamp(Math.round(+s.strikes || 0), 0, 12); for (let i = 0; i < n; i++) P(0.3 * D + ((i + 0.5) / n) * 0.6 * D, 'explosion', { size: 0.5 * (+s.burst || 1), vol: v * 0.5, pan: (i / Math.max(1, n - 1)) - 0.5 }); break; }
    case 'mginset': P(0, 'click', { vol: v * 0.7 }); P(0.2 * D, 'servo', { dur: 0.5, vol: v * 0.5 }); P(0.4 * D, 'shutter', { vol: v * 0.6 }); break;
    case 'mgtag': P(0.05, 'ping', { vol: v * 0.5 }); P(0.35 * D, 'ticks', { n: String(s.label || '').length, dur: 0.5 * D, vol: v * 0.5 }); break;
    default: break;
  }
  return ev;
}
void rr;
