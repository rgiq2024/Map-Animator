// Typography: callouts with leader lines pinned to map places (clean, boxed, pill, numbered badge, speed card,
// label with ring, tagged, neon, counter, percent ring, photo, bracket, paragraph, modern frame, HUD),
// kinetic titles and text blocks on screen, dimension lines with a measured distance,
// biometric / ID scan windows, and an airborne camera (FLIR) data overlay.
import { placeAt, CUSTOM_POS } from './place.js';
import { H } from './cartofx.js';
import { imageFor } from './geoimage.js';
import { VIDEO_RECTS } from './screenfx.js';

const { clamp, easeOut, UI, hexA, rr, prog, haversine } = H;
const FONTS = {
  sans: UI,
  display: '"Montserrat","Archivo","Segoe UI",system-ui,sans-serif',
  cond: '"Oswald","Bebas Neue","Arial Narrow","Archivo",system-ui,sans-serif',
  serif: '"Playfair Display",Georgia,"Times New Roman",serif',
  mono: '"JetBrains Mono","IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace',
};
const FONT_NAMES = { sans: 'Sans (clean)', display: 'Geometric (Montserrat style)', cond: 'Condensed (Oswald style)', serif: 'Serif (editorial)', mono: 'Monospace (technical)' };
const POS9 = { 'top-left': 'Top left', 'top-center': 'Top centre', 'top-right': 'Top right', 'middle-left': 'Middle left', center: 'Centre', 'middle-right': 'Middle right', 'bottom-left': 'Bottom left', 'bottom-center': 'Bottom centre', 'bottom-right': 'Bottom right', ...CUSTOM_POS };
const ease3 = (t) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const seg = (u, a, b) => clamp((u - a) / (b - a), 0, 1);

// ================================================================= kinds
export const TY_CALLOUT_LOOKS = {
  clean: 'Clean — text over a line', box: 'Outlined box', solid: 'Solid white box', pill: 'Rounded pill + subtitle', badge: 'Numbered badge',
  speed: 'Value card (e.g. 110 km/h)', label: 'Big label + ring point', tagged: 'Tagged (yellow tag + white box)', neon: 'Neon cyan',
  counter: 'Counting number', ring: 'Percentage ring', photo: 'Photo + title', bracket: 'Corner bracket', paragraph: 'Title + paragraph',
  modern: 'Modern frame (hatched)', hud: 'HUD corners',
};
export const TY_TITLE_LOOKS = {
  kinetic: 'Kinetic — words rise in', stacked: 'Stacked with colour bar', outline: 'Outline that fills', boxreveal: 'Box wipe reveal',
  underline: 'Underlined', split: 'Kicker + big word', typewriter: 'Typewriter', cinematic: 'Cinematic (wide spacing)',
  lowerthird: 'Lower third (name + role)', quote: 'Quote', counter: 'Big counting number', paragraph: 'Heading + paragraph',
  number: 'Big number + title (chapter)', marker: 'Highlighter marker', frame: 'Framed with corner ticks',
};
export const TY_KINDS = {
  tcallout: { name: 'Callout', icon: '⌐', geom: 'point', desc: 'A label pinned to a place with a leader line — 16 styles: clean, boxed, pill, badge, value card, ring, photo, neon, HUD…' },
  ttitle: { name: 'Typographic title', icon: 'Aa', geom: null, desc: 'Titles and text on screen — kinetic, stacked, outline, box reveal, lower third, quote, counter, paragraph…' },
  vtrack: { name: 'Tracked callout (video)', icon: '🎯', geom: null, desc: 'A callout that follows a moving person or object in your video clip — pick the subject once, it is tracked through the clip' },
  measure: { name: 'Dimension line', icon: '↔', geom: 'line', desc: 'A measuring line between two points with the distance (m, km, ft, mi) or your own text' },
  scanui: { name: 'Scan window', icon: '◎', geom: null, desc: 'Sci-fi windows: retinal scan, fingerprint, ID card or profile, with scanning animation' },
  flirhud: { name: 'Airborne camera overlay', icon: '⌖', geom: null, desc: 'Police / military helicopter camera text: live coordinates, heading, altitude, target, crosshair, thermal look' },
};
export const TY_ANIMS = {
  tcallout: { draw: 'Point → line → box → text', pop: 'Pop in', fade: 'Fade in', none: 'Shown' },
  vtrack: { draw: 'Point → line → box → text', pop: 'Pop in', fade: 'Fade in', none: 'Shown' },
  ttitle: { in: 'Animate in', fade: 'Fade in', none: 'Shown' },
  measure: { grow: 'Grows from the middle', draw: 'Draws left to right', fade: 'Fade in', none: 'Shown' },
  scanui: { open: 'Window opens + scans', fade: 'Fade in', none: 'Shown' },
  flirhud: { boot: 'Boots up', fade: 'Fade in', none: 'Shown' },
};
export const TY_DEFAULTS = {
  tcallout: { anim: 'draw', duration: 1.4, style: {
    look: 'clean', title: 'Clean callout', sub: 'Modern clean design', text: 'Short paragraph of text that explains what is at this place.', tag: 'Premiere', value: '110', unit: 'km/h', decimals: 0, prefix: '', suffix: '',
    media: '', accent: '#ffd23f', ink: '#ffffff', box: '#ffffff', leader: 'straight', end: 'square', dx: 170, dy: -110, size: 1, font: 'display', upper: true, shadow: true,
  } },
  vtrack: { anim: 'draw', duration: 1.2, style: {
    look: 'bracket', title: 'Change the world', sub: 'By being yourself', text: '', tag: 'Speed', value: '24', unit: 'km/h', decimals: 0, prefix: '', suffix: '',
    media: '', accent: '#ffd23f', ink: '#ffffff', box: '#ffffff', leader: 'straight', end: 'dot', dx: 140, dy: -120, size: 1, font: 'cond', upper: true, shadow: true,
    video: '', track: [], trackInfo: '', smooth: 3, hideLost: true,
  } },
  ttitle: { anim: 'in', duration: 1.2, style: {
    look: 'kinetic', text: 'Your title here', sub: 'A short line under the title', kicker: 'Chapter one', body: 'Write a paragraph here. Keep it short — two or three lines read best on video.',
    value: '594132', prefix: '+', suffix: '', decimals: 0, font: 'display', align: 'left', position: 'bottom-left', color: '#ffffff', accent: '#ffd23f', bg: '#0e121a', size: 1, upper: false, shadow: true, tracking: 0,
  } },
  measure: { anim: 'grow', duration: 1, style: { look: 'ticks', text: '', units: 'auto', color: '#ffffff', label: 'pill', offset: 0, size: 1 } },
  scanui: { anim: 'open', duration: 1.6, style: {
    look: 'retina', title: 'Retinal scan', name: 'Agent name', media: '', rows: 'USER ID | 142,474FD\nDATE OF BIRTH | May 19, 1988\nHEIGHT | 6′0″\nSTATUS | Active', status: 'Active', process: 'Biometric reading',
    letter: 'B', frame: '#8fd3e0', accent: '#ff7a1a', bg: '#1d2a33', width: 420, position: 'top-right', size: 1,
  } },
  flirhud: { anim: 'boot', duration: 1.2, style: {
    unit: 'SAN DIEGO POLICE TFU #2', speed: 51, date: '', time: '', thermal: true, polarity: 'white', color: '#ffffff', alert: '#ff2a2a', armed: true, crosshair: true, dials: true, size: 1,
  } },
};
const lk = (...a) => (L) => a.includes(L.style.look);
const nlk = (...a) => (L) => !a.includes(L.style.look);
export const TY_FORMS = {
  tcallout: [
    ['style.look', 'Style', 'select', TY_CALLOUT_LOOKS],
    ['style.title', 'Title', 'text', null, nlk('counter', 'ring')], ['style.sub', 'Second line', 'text', null, nlk('paragraph', 'label')],
    ['style.text', 'Paragraph', 'textarea', null, lk('paragraph')], ['style.tag', 'Tag', 'text', null, lk('tagged', 'speed', 'counter')],
    ['style.value', 'Number / value', 'text', null, lk('speed', 'counter', 'ring', 'badge')], ['style.unit', 'Unit', 'text', null, lk('speed')],
    ['style.prefix', 'Before the number', 'text', null, lk('counter')], ['style.suffix', 'After the number', 'text', null, lk('counter')], ['style.decimals', 'Decimals', 'number', null, lk('counter')],
    ['style.media', 'Photo', 'image', null, lk('photo')],
    ['style.font', 'Font', 'select', FONT_NAMES], ['style.upper', 'CAPITALS', 'switch'],
    ['style.ink', 'Text colour', 'color'], ['style.box', 'Box / line colour', 'color'], ['style.accent', 'Accent', 'color'],
    ['style.leader', 'Leader line', 'select', { straight: 'Straight', elbow: 'Elbow (horizontal then angled)', none: 'None' }],
    ['style.end', 'Point marker', 'select', { square: 'Small square', ring: 'Ring with dot', dot: 'Dot', diamond: 'Diamond', none: 'None' }],
    ['style.dx', 'Box offset → (px)', 'range', [-600, 600, 2]], ['style.dy', 'Box offset ↓ (px)', 'range', [-400, 400, 2]],
    ['style.shadow', 'Soft shadow', 'switch'], ['style.size', 'Size', 'range', [0.4, 3, 0.05]],
  ],
  ttitle: [
    ['style.look', 'Style', 'select', TY_TITLE_LOOKS],
    ['style.kicker', 'Small line above', 'text', null, lk('split', 'number', 'stacked', 'paragraph', 'frame')],
    ['style.text', 'Title (Enter = new line)', 'textarea', null, nlk('counter')],
    ['style.sub', 'Subtitle', 'text', null, nlk('paragraph')],
    ['style.body', 'Paragraph', 'textarea', null, lk('paragraph')],
    ['style.value', 'Number', 'text', null, lk('counter', 'number')], ['style.prefix', 'Before the number', 'text', null, lk('counter')], ['style.suffix', 'After the number', 'text', null, lk('counter')], ['style.decimals', 'Decimals', 'number', null, lk('counter')],
    ['style.font', 'Font', 'select', FONT_NAMES], ['style.upper', 'CAPITALS', 'switch'], ['style.tracking', 'Letter spacing', 'range', [-0.05, 0.6, 0.01]],
    ['style.align', 'Alignment', 'select', { left: 'Left', center: 'Centre', right: 'Right' }],
    ['style.color', 'Text colour', 'color'], ['style.accent', 'Accent', 'color'], ['style.bg', 'Box colour', 'color', null, lk('boxreveal', 'lowerthird', 'stacked', 'counter', 'paragraph', 'marker')],
    ['style.shadow', 'Soft shadow', 'switch'],
    ['style.position', 'Position', 'select', POS9], ['style.size', 'Size', 'range', [0.3, 4, 0.05]],
  ],
  measure: [
    ['style.look', 'Style', 'select', { ticks: 'End ticks + label (15.5 FT)', arrows: 'Arrows both ends', dashed: 'Dashed with dots', bracket: 'Bracket' }],
    ['style.units', 'Units', 'select', { auto: 'Metres / kilometres', ft: 'Feet', mi: 'Miles / feet', nmi: 'Nautical miles' }],
    ['style.text', 'Your own text (empty = measured distance)', 'text'],
    ['style.label', 'Label', 'select', { pill: 'Pill', plain: 'Plain text', box: 'Box' }],
    ['style.offset', 'Shift the line sideways (px)', 'range', [-200, 200, 1]],
    ['style.color', 'Colour', 'color'], ['style.size', 'Size', 'range', [0.4, 3, 0.05]],
  ],
  scanui: [
    ['style.look', 'Window', 'select', { retina: 'Retinal scan', fingerprint: 'Fingerprint', idcard: 'ID card', profile: 'Profile + data' }],
    ['style.title', 'Window title', 'text'], ['style.name', 'Name', 'text', null, lk('idcard', 'profile')],
    ['style.media', 'Photo (eye or portrait)', 'image', null, lk('retina', 'idcard', 'profile')],
    ['style.rows', 'Data rows — “Label | value”, one per line', 'textarea', null, lk('idcard', 'profile')],
    ['style.process', 'Process text', 'text', null, lk('retina', 'fingerprint')], ['style.status', 'Status', 'text'],
    ['style.letter', 'Class letter', 'text', null, lk('idcard')],
    ['style.frame', 'Frame colour', 'color'], ['style.accent', 'Accent', 'color'], ['style.bg', 'Background', 'color'],
    ['style.width', 'Width (px)', 'range', [240, 900, 5]], ['style.position', 'Position', 'select', POS9], ['style.size', 'Size', 'range', [0.4, 2.5, 0.05]],
  ],
  flirhud: [
    ['style.unit', 'Aircraft / unit name', 'text'], ['style.speed', 'Speed (kts)', 'number'],
    ['style.date', 'Date (empty = today)', 'text'], ['style.time', 'Start time hh:mm:ss (empty = now)', 'text'],
    ['style.thermal', 'Thermal camera look on the map', 'switch'], ['style.polarity', 'Polarity', 'select', { white: 'White hot', black: 'Black hot' }, (L) => L.style.thermal !== false],
    ['style.crosshair', 'Crosshair', 'switch'], ['style.dials', 'Bearing / tilt dials', 'switch'], ['style.armed', 'Red “ARMED” lines', 'switch'],
    ['style.color', 'Text colour', 'color'], ['style.alert', 'Alert colour', 'color'], ['style.size', 'Text size', 'range', [0.5, 2, 0.05]],
  ],
};
TY_FORMS.vtrack = [
  ['style.video', 'Video layer', 'layerref', 'kind:video'],
  ['style.track', 'Subject', 'vtrack'],
  ['style.smooth', 'Smoothing', 'range', [0, 8, 1]],
  ['style.hideLost', 'Hide where the subject was lost', 'switch'],
  ...TY_FORMS.tcallout.filter((f) => !['style.media'].includes(f[0]) || true),
];
export const TY_SET = new Set(Object.keys(TY_KINDS));
export const tyPhases = (k) => (k === 'measure' ? ['above'] : ['captions']);

// ================================================================= shared helpers
const font = (s, w, px) => `${w} ${px}px ${FONTS[s.font] || FONTS.display}`;
const up = (s, t) => (s.upper ? String(t ?? '').toUpperCase() : String(t ?? ''));
function spaced(ctx, text, x, y, track, align = 'left') {
  if (!track) { ctx.textAlign = align; ctx.fillText(text, x, y); return ctx.measureText(text).width; }
  const em = parseFloat(ctx.font.match(/(\d+(\.\d+)?)px/)?.[1] || 16) * track;
  const chars = [...text];
  const w = chars.reduce((a, c) => a + ctx.measureText(c).width + em, -em);
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.textAlign = 'left';
  for (const c of chars) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + em; }
  return w;
}
const measureSpaced = (ctx, text, track) => { if (!track) return ctx.measureText(text).width; const em = parseFloat(ctx.font.match(/(\d+(\.\d+)?)px/)?.[1] || 16) * track; return [...text].reduce((a, c) => a + ctx.measureText(c).width + em, -em); };
function numFmt(v, dec) { const n = Number(String(v).replace(/[^\d.-]/g, '')); if (!isFinite(n)) return String(v); return n.toLocaleString('en-US', { minimumFractionDigits: +dec || 0, maximumFractionDigits: +dec || 0 }); }
function counting(v, k, dec) { const n = Number(String(v).replace(/[^\d.-]/g, '')); if (!isFinite(n)) return String(v); return numFmt(n * ease3(k), dec); }
function endMark(ctx, kind, x, y, r, col, fill) {
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1, r * 0.32);
  if (kind === 'square') { ctx.strokeRect(x - r, y - r, r * 2, r * 2); ctx.fillRect(x - r * 0.45, y - r * 0.45, r * 0.9, r * 0.9); }
  else if (kind === 'ring') { ctx.beginPath(); ctx.arc(x, y, r * 1.5, 0, Math.PI * 2); ctx.fillStyle = hexA('#000000', 0.15); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, r * 0.75, 0, Math.PI * 2); ctx.fillStyle = fill || col; ctx.fill(); }
  else if (kind === 'dot') { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  else if (kind === 'diamond') { ctx.beginPath(); ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x + r * 1.3, y); ctx.lineTo(x, y + r * 1.3); ctx.lineTo(x - r * 1.3, y); ctx.closePath(); ctx.stroke(); }
}
const corners = (ctx, x, y, w, h, l, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) { ctx.moveTo(cx + sx * l, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * l); } ctx.stroke(); };

export function drawTypography(ctx, L, tm, o) {
  if (L.kind === 'tcallout') return drawCallout(ctx, L, tm, o);
  if (L.kind === 'vtrack') return drawTracked(ctx, L, tm, o);
  if (L.kind === 'ttitle') return drawTitle(ctx, L, tm, o);
  if (L.kind === 'measure') return drawMeasure(ctx, L, tm, o);
  if (L.kind === 'scanui') return drawScan(ctx, L, tm, o);
  if (L.kind === 'flirhud') return drawFlir(ctx, L, tm, o);
}

// ================================================================= callouts
/** measures the callout box for a look; returns { w, h, paint(x, y, k) } where k = 0…1 text reveal */
function calloutBox(ctx, L, o, kText) {
  const s = L.style, u = o.unit * (+s.size || 1), look = s.look || 'clean';
  const ink = s.ink || '#ffffff', box = s.box || '#ffffff', acc = s.accent || '#ffd23f';
  const T = up(s, s.title), S = up(s, s.sub);
  const tf = font(s, 800, 17 * u), sf = font(s, 600, 10.5 * u);
  ctx.font = tf; const tw = ctx.measureText(T).width; ctx.font = sf; const sw = S ? ctx.measureText(S).width : 0;
  const pad = 12 * u;
  const tx = (t, f, x, y, col, al = 'left', a = 1) => { ctx.font = f; ctx.fillStyle = col; ctx.textAlign = al; ctx.textBaseline = 'middle'; ctx.globalAlpha *= a; ctx.fillText(t, x, y); ctx.globalAlpha /= a || 1; };
  const reveal = (fn) => { ctx.save(); fn(); ctx.restore(); };
  switch (look) {
    case 'box': case 'solid': case 'neon': case 'modern': case 'hud': {
      const w = Math.max(tw, sw) + pad * 2.4, h = (S ? 50 : 36) * u;
      return { w, h, paint(x, y) {
        const solid = look === 'solid';
        if (look === 'neon') { rr(ctx, x, y, w, h, 3 * u); ctx.fillStyle = 'rgba(8,24,30,0.72)'; ctx.fill(); ctx.strokeStyle = hexA(acc === '#ffd23f' ? '#2ee6e6' : acc, 0.9); ctx.lineWidth = 1.2 * u; ctx.stroke(); }
        else if (solid) { ctx.fillStyle = box; ctx.fillRect(x, y, w, h); }
        else if (look === 'hud') { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y, w, h); corners(ctx, x, y, w, h, 9 * u, box, 1.6 * u); }
        else { ctx.strokeStyle = box; ctx.lineWidth = 1.4 * u; ctx.strokeRect(x, y, w, h); }
        if (look === 'modern') {
          ctx.save(); ctx.beginPath(); ctx.rect(x + 8 * u, y + h + 3 * u, w * 0.62, 6 * u); ctx.clip(); ctx.strokeStyle = hexA(acc, 0.8); ctx.lineWidth = 1 * u; for (let i = -10; i < w; i += 4 * u) { ctx.beginPath(); ctx.moveTo(x + i, y + h + 10 * u); ctx.lineTo(x + i + 8 * u, y + h); ctx.stroke(); } ctx.restore();
          ctx.fillStyle = box; ctx.fillRect(x + w - 4 * u, y - 4 * u, 8 * u, 8 * u);
        }
        const col = solid ? '#111418' : look === 'neon' ? (acc === '#ffd23f' ? '#5ff4f4' : acc) : ink;
        const cx = x + w / 2;
        reveal(() => { ctx.beginPath(); ctx.rect(x, y, w * kText, h); ctx.clip(); tx(T, tf, cx, y + (S ? 19 : h / 2) * (S ? u : 1), col, 'center'); if (S) tx(S, sf, cx, y + 37 * u, solid ? '#41464f' : hexA(col.startsWith('#') ? col : '#ffffff', 0.8), 'center'); });
      } };
    }
    case 'pill': {
      const w = Math.max(tw + pad * 2.6, sw + pad), h = 30 * u;
      return { w, h: h + (S ? 18 * u : 0), paint(x, y) {
        rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = box; ctx.fill();
        reveal(() => { ctx.beginPath(); ctx.rect(x, y, w * kText, h + 30 * u); ctx.clip(); tx(T, tf, x + w / 2, y + h / 2, '#111418', 'center'); if (S) tx(S, sf, x + 10 * u, y + h + 10 * u, ink, 'left'); });
      } };
    }
    case 'badge': {
      const R = 16 * u, w = R * 2 + 10 * u + Math.max(tw, sw), h = Math.max(R * 2, S ? 40 * u : 24 * u);
      return { w, h, paint(x, y) {
        ctx.beginPath(); ctx.arc(x + R, y + h / 2, R, 0, Math.PI * 2); ctx.fillStyle = box; ctx.fill();
        tx(String(s.value || '1'), font(s, 800, 15 * u), x + R, y + h / 2 + 1 * u, '#111418', 'center');
        reveal(() => { ctx.beginPath(); ctx.rect(x + R * 2, y - 5, (w - R * 2) * kText + 2, h + 10); ctx.clip(); tx(T, tf, x + R * 2 + 10 * u, y + h / 2 - (S ? 8 * u : 0), ink); if (S) tx(S, sf, x + R * 2 + 10 * u, y + h / 2 + 11 * u, hexA(ink, 0.8)); });
      } };
    }
    case 'speed': {
      const vf = font(s, 800, 44 * u), uf = font(s, 700, 18 * u);
      ctx.font = vf; const vw = ctx.measureText(String(s.value)).width; ctx.font = uf; const uw = ctx.measureText(s.unit || '').width;
      const tagT = up(s, s.tag || s.title), tgf = font(s, 700, 12 * u); ctx.font = tgf; const tgw = ctx.measureText(tagT).width;
      const w = Math.max(vw + uw + 12 * u, tgw + 20 * u, sw) + pad * 2.4, h = 112 * u;
      return { w, h, paint(x, y) {
        const cut = 12 * u;
        ctx.beginPath(); ctx.moveTo(x + cut, y); ctx.lineTo(x + w - cut, y); ctx.lineTo(x + w, y + cut); ctx.lineTo(x + w, y + h - cut); ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x + cut, y + h); ctx.lineTo(x, y + h - cut); ctx.lineTo(x, y + cut); ctx.closePath();
        ctx.fillStyle = 'rgba(20,22,26,0.42)'; ctx.fill(); ctx.strokeStyle = hexA(box, 0.85); ctx.lineWidth = 1.4 * u; ctx.stroke();
        const n = counting(s.value, kText, 0);
        ctx.font = vf; const nw = ctx.measureText(n).width;
        const total = nw + 10 * u + uw, sx = x + (w - total) / 2;
        tx(n, vf, sx, y + 34 * u, ink); tx(s.unit || '', uf, sx + nw + 10 * u, y + 40 * u, ink);
        const gy = y + 62 * u; const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, hexA(acc === '#ffd23f' ? '#c9a24a' : acc, 0.2)); g.addColorStop(0.5, hexA(acc === '#ffd23f' ? '#c9a24a' : acc, 0.95)); g.addColorStop(1, hexA(acc === '#ffd23f' ? '#c9a24a' : acc, 0.2));
        ctx.fillStyle = g; ctx.fillRect(x + 10 * u, gy, (w - 20 * u) * kText, 24 * u);
        tx(tagT, tgf, x + w / 2, gy + 12 * u, '#ffffff', 'center', kText);
        ctx.fillStyle = hexA(box, 0.7); ctx.fillRect(x + 10 * u, gy + 30 * u, w - 20 * u, 1 * u);
        if (S) tx(S, font(s, 600, 9.5 * u), x + w / 2, gy + 41 * u, hexA(ink, 0.85), 'center', kText);
      } };
    }
    case 'label': {
      const lf = font(s, 500, 30 * u); ctx.font = lf; const lw = ctx.measureText(T).width;
      return { w: lw + 4 * u, h: 44 * u, anchorBottom: true, paint(x, y) {
        reveal(() => { ctx.beginPath(); ctx.rect(x - 2, y - 4, (lw + 8 * u) * kText, 60 * u); ctx.clip(); tx(T, lf, x, y + 18 * u, ink); });
        ctx.fillStyle = box; ctx.fillRect(x, y + 40 * u, (lw + 4 * u), 1.4 * u);
      } };
    }
    case 'tagged': {
      const tagT = up(s, s.tag), tgf = font(s, 800, 11 * u); ctx.font = tgf; const tgw = ctx.measureText(tagT).width;
      const bf = font(s, 800, 24 * u); ctx.font = bf; const bw = ctx.measureText(T).width;
      const w = Math.max(bw + pad * 2, sw + pad * 2, tgw + pad * 2), h = 26 * u + 54 * u;
      return { w, h, paint(x, y) {
        ctx.fillStyle = s.accent || '#ffd23f'; ctx.fillRect(x, y, (tgw + pad * 2) * Math.max(0.05, kText), 22 * u);
        tx(tagT, tgf, x + pad, y + 11 * u, '#111418', 'left', kText);
        ctx.fillStyle = hexA(box, 0.95); ctx.fillRect(x, y + 26 * u, w * kText, 54 * u);
        reveal(() => { ctx.beginPath(); ctx.rect(x, y + 26 * u, w * kText, 54 * u); ctx.clip(); tx(T, bf, x + pad, y + 44 * u, '#2a2d33'); if (S) tx(S, font(s, 500, 12 * u), x + pad, y + 67 * u, '#3d424a'); });
        ctx.strokeStyle = hexA(box, 0.85); ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.moveTo(x - 8 * u, y + 30 * u); ctx.lineTo(x - 8 * u, y + 86 * u); ctx.lineTo(x + 30 * u, y + 86 * u); ctx.stroke();
      } };
    }
    case 'counter': {
      const nf = font(s, 800, 30 * u), full = `${s.prefix || ''}${numFmt(s.value, s.decimals)}${s.suffix || ''}`;
      ctx.font = nf; const nw = ctx.measureText(full).width;
      const tagT = up(s, s.tag || s.sub), tgf = font(s, 700, 10 * u); ctx.font = tgf; const tgw = ctx.measureText(tagT).width;
      const w = Math.max(nw + pad * 2 + 6 * u, tgw + pad), h = 66 * u;
      return { w, h, paint(x, y) {
        ctx.fillStyle = hexA(acc === '#ffd23f' ? '#2ee6e6' : acc, 0.22); ctx.fillRect(x, y, w, 42 * u);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 6 * u, 42 * u);
        tx(`${s.prefix || ''}${counting(s.value, kText, s.decimals)}${s.suffix || ''}`, nf, x + 14 * u, y + 22 * u, acc === '#ffd23f' ? '#5ff4f4' : acc);
        ctx.fillStyle = hexA('#0b1418', 0.6); ctx.fillRect(x + w - tgw - pad, y + 48 * u, tgw + pad, 16 * u);
        tx(tagT, tgf, x + w - tgw / 2 - pad / 2, y + 56 * u, ink, 'center');
      } };
    }
    case 'ring': {
      const R = 40 * u;
      return { w: R * 2, h: R * 2, center: true, paint(x, y) {
        const cx = x + R, cy = y + R, c = acc === '#ffd23f' ? '#2ee6e6' : acc;
        const pct = clamp(Number(String(s.value).replace(/[^\d.]/g, '')) / 100 || 0, 0, 1);
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = 'rgba(8,24,30,0.55)'; ctx.fill(); ctx.strokeStyle = hexA(c, 0.35); ctx.lineWidth = 3 * u; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct * kText); ctx.strokeStyle = c; ctx.lineWidth = 3.5 * u; ctx.stroke();
        tx(`${Math.round(pct * 100 * ease3(kText))}%`, font(s, 800, 22 * u), cx, cy, ink, 'center');
        if (S) tx(S, font(s, 600, 7.5 * u), cx, cy + 18 * u, hexA(ink, 0.85), 'center');
        if (T) tx(T, font(s, 600, 7.5 * u), cx, cy - 18 * u, hexA(ink, 0.85), 'center');
      } };
    }
    case 'photo': {
      const iw = 150 * u, ih = 84 * u, w = Math.max(iw, tw + pad * 2), h = ih + 34 * u;
      return { w, h, paint(x, y) {
        const im = s.media && imageFor(s.media);
        ctx.fillStyle = 'rgba(60,70,82,0.85)'; ctx.fillRect(x, y, w, h);
        if (im?.ready) { const sc = Math.max(w / im.w, ih / im.h); ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, ih); ctx.clip(); ctx.drawImage(im.bmp, x + (w - im.w * sc) / 2, y + (ih - im.h * sc) / 2, im.w * sc, im.h * sc); ctx.restore(); }
        else { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, y, w, ih); tx('Add a photo', font(s, 600, 11 * u), x + w / 2, y + ih / 2, hexA(ink, 0.6), 'center'); }
        reveal(() => { ctx.beginPath(); ctx.rect(x, y + ih, w * kText, 34 * u); ctx.clip(); tx(T, font(s, 800, 14 * u), x + pad, y + ih + 13 * u, ink); if (S) tx(S, font(s, 500, 8.5 * u), x + pad, y + ih + 27 * u, hexA(ink, 0.75)); });
      } };
    }
    case 'bracket': {
      const w = Math.max(tw, sw) + pad * 2, h = (S ? 48 : 34) * u;
      return { w, h, paint(x, y) {
        ctx.strokeStyle = box; ctx.lineWidth = 1.4 * u;
        ctx.beginPath(); ctx.moveTo(x + 18 * u, y); ctx.lineTo(x, y); ctx.lineTo(x, y + h); ctx.moveTo(x + w, y + h * 0.3); ctx.lineTo(x + w + 8 * u, y + h * 0.3); ctx.lineTo(x + w + 8 * u, y + h + 6 * u); ctx.stroke();
        reveal(() => { ctx.beginPath(); ctx.rect(x, y, w * kText + 4, h); ctx.clip(); tx(T, tf, x + pad, y + 17 * u, ink); if (S) tx(S, sf, x + pad, y + 36 * u, hexA(ink, 0.75)); });
      } };
    }
    case 'paragraph': {
      const pf = font(s, 500, 10.5 * u), maxW = 230 * u;
      ctx.font = pf;
      const words = String(s.text || '').split(/\s+/), lines = []; let cur = '';
      for (const wd of words) { const t = cur ? `${cur} ${wd}` : wd; if (ctx.measureText(up(s, t)).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = t; }
      if (cur) lines.push(cur);
      const w = Math.max(tw + pad * 2, maxW + pad * 2), h = 40 * u + lines.length * 15 * u + pad;
      return { w, h, paint(x, y) {
        ctx.fillStyle = 'rgba(10,12,16,0.35)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = hexA(box, 0.9); ctx.lineWidth = 1.2 * u; ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = box; ctx.fillRect(x + pad, y - 12 * u, tw + pad * 1.4, 24 * u);
        tx(T, font(s, 800, 13 * u), x + pad * 1.7, y, '#111418');
        lines.forEach((ln, i) => tx(up(s, ln), pf, x + pad, y + 28 * u + i * 15 * u, ink, 'left', seg(kText, i / lines.length * 0.7, i / lines.length * 0.7 + 0.3)));
      } };
    }
    default: { // clean
      const w = Math.max(tw, sw) + 6 * u, h = (S ? 40 : 26) * u;
      return { w, h, anchorBottom: true, paint(x, y) {
        reveal(() => { ctx.beginPath(); ctx.rect(x - 2, y - 6, w * kText + 4, h + 12); ctx.clip(); tx(T, tf, x, y + 10 * u, ink); if (S) tx(S, sf, x, y + 29 * u, hexA(ink, 0.85)); });
        ctx.fillStyle = box; ctx.fillRect(x, y + h, w, 1.4 * u);
      } };
    }
  }
}
/** Where the tracked subject is at video time t: [x, y, confidence] in 0…1 video coordinates. */
export function trackAt(track, t, smooth = 0) {
  if (!Array.isArray(track) || !track.length) return null;
  let lo = 0, hi = track.length - 1;
  if (t <= track[0][0]) return track[0].slice(1);
  if (t >= track[hi][0]) return track[hi].slice(1);
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (track[m][0] <= t) lo = m; else hi = m; }
  const A = track[lo], B = track[hi], f = (t - A[0]) / (B[0] - A[0] || 1);
  let x = A[1] + (B[1] - A[1]) * f, y = A[2] + (B[2] - A[2]) * f;
  if (smooth > 0) {
    let sx = 0, sy = 0, sw = 0;
    for (let k = Math.max(0, lo - smooth); k <= Math.min(track.length - 1, hi + smooth); k++) { const w = 1 / (1 + Math.abs(track[k][0] - t) * 8); sx += track[k][1] * w; sy += track[k][2] * w; sw += w; }
    x = x * 0.4 + (sx / sw) * 0.6; y = y * 0.4 + (sy / sw) * 0.6;
  }
  return [x, y, Math.min(A[3] ?? 1, B[3] ?? 1)];
}
function drawTracked(ctx, L, tm, o) {
  const s = L.style;
  const R = s.video && VIDEO_RECTS.get(s.video);
  const Lv = (o.scene?.layers || []).find((x) => x.id === s.video);
  if (!R || !Lv || Lv.hidden || !R.ready || performance.now() - R.at > 1500) {
    if (tm.edit && o.frame) { ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.font = `600 ${13 * o.unit}px ${UI}`; const t = !Lv ? 'Tracked callout: choose a video layer in its settings' : 'Tracked callout: the video is not on screen yet'; const w = ctx.measureText(t).width + 20 * o.unit; ctx.fillRect(o.frame.x + 20 * o.unit, o.frame.y + o.frame.h - 50 * o.unit, w, 28 * o.unit); ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(t, o.frame.x + 30 * o.unit, o.frame.y + o.frame.h - 36 * o.unit); ctx.restore(); }
    return;
  }
  const pt = trackAt(s.track, R.vt, +s.smooth || 0);
  if (!pt) {
    if (tm.edit) { ctx.save(); ctx.fillStyle = '#ffd23f'; ctx.font = `600 ${13 * o.unit}px ${UI}`; ctx.fillText('Open “Pick the subject & track” in the callout settings', R.x + 12 * o.unit, R.y + 24 * o.unit); ctx.restore(); }
    return;
  }
  if (s.hideLost !== false && pt[2] < 0.3) return;
  const cx = R.x + R.W / 2, cy = R.y + R.H / 2;
  let px = R.x + (R.W - R.dw) / 2 + pt[0] * R.dw, py = R.y + (R.H - R.dh) / 2 + pt[1] * R.dh;
  px = cx + (px - cx) * R.sc; py = cy + (py - cy) * R.sc;
  if (px < R.x - 2 || px > R.x + R.W + 2 || py < R.y - 2 || py > R.y + R.H + 2) return;
  drawCallout(ctx, L, { ...tm, alpha: tm.alpha * Math.min(1, R.alpha ?? 1) }, o, [px, py]);
}
function drawCallout(ctx, L, tm, o, at = null) {
  if (!at && L.geom?.type !== 'Point') return;
  const s = L.style, u = o.unit * (+s.size || 1), fr = o.frame;
  const p = at || o.proj(L.geom.coordinates);
  if (!isFinite(p[0])) return;
  const raw = tm.edit || L.anim === 'none' ? 1 : prog(L, tm);
  const anim = L.anim || 'draw';
  const kDot = anim === 'draw' ? seg(raw, 0, 0.15) : 1, kLine = anim === 'draw' ? ease3(seg(raw, 0.1, 0.45)) : 1, kBox = anim === 'draw' ? ease3(seg(raw, 0.4, 0.7)) : anim === 'pop' ? ease3(raw) : 1;
  const kText = anim === 'draw' ? ease3(seg(raw, 0.55, 1)) : anim === 'pop' ? 1 : 1;
  ctx.save();
  ctx.globalAlpha *= tm.alpha * (anim === 'fade' && !tm.edit ? easeOut(raw) : 1);
  if (s.shadow !== false) { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 8 * u; ctx.shadowOffsetY = 1 * u; }
  const B = calloutBox(ctx, L, o, kText);
  let bx = p[0] + (+s.dx || 0) * o.unit, by = p[1] + (+s.dy || 0) * o.unit;
  if ((+s.dx || 0) < 0) bx -= B.w;
  if (B.center) { bx -= B.w / 2; by -= B.h / 2; } else if ((+s.dy || 0) < 0) by -= B.h; else by -= 0;
  // keep the box on screen: flip it to the other side of the point when it would leave the frame
  if (fr && !B.center && !s.pos_box) {
    const ddx = (+s.dx || 0) * o.unit, ddy = (+s.dy || 0) * o.unit;
    if (bx + B.w > fr.x + fr.w - 8 && ddx > 0) bx = p[0] - ddx - B.w;
    else if (bx < fr.x + 8 && ddx < 0) bx = p[0] - ddx;
    if (by < fr.y + 8 && ddy < 0) by = p[1] - ddy;
    else if (by + B.h > fr.y + fr.h - 8 && ddy > 0) by = p[1] - ddy - B.h;
  }
  ctx.save(); const [ddx, ddy] = placeAt(ctx, L, fr, bx, by, B.w, B.h, { key: 'box' }); ctx.restore();
  bx += ddx; by += ddy;
  // where the leader meets the box
  const left = p[0] < bx + B.w / 2;
  const attachY = B.anchorBottom ? by + B.h : by + B.h / 2;
  let ax = left ? bx : bx + B.w, ay = B.center ? by + B.h / 2 : attachY;
  if (B.center) { const ang = Math.atan2(p[1] - (by + B.h / 2), p[0] - (bx + B.w / 2)); ax = bx + B.w / 2 + Math.cos(ang) * B.w / 2; ay = by + B.h / 2 + Math.sin(ang) * B.h / 2; }
  else if (!B.anchorBottom && (p[1] > by + B.h || p[1] < by) && Math.abs(p[0] - (bx + B.w / 2)) < B.w / 2) { ax = bx + B.w / 2; ay = p[1] > by ? by + B.h : by; }
  const col = s.look === 'neon' || s.look === 'counter' || s.look === 'ring' ? (s.accent === '#ffd23f' ? '#5ff4f4' : s.accent) : s.box || '#ffffff';
  if (s.leader !== 'none') {
    ctx.strokeStyle = col; ctx.lineWidth = 1.4 * u; ctx.lineCap = 'round';
    const pts = s.leader === 'elbow' && !B.center ? [[p[0], p[1]], [ax + (left ? -1 : 1) * Math.min(40 * u, Math.abs(p[0] - ax) * 0.5) * 0, ay], [ax, ay]] : [[p[0], p[1]], [ax, ay]];
    if (s.leader === 'elbow' && !B.center) { const mx = ax + (left ? -1 : 1) * 30 * u; pts.splice(1, 1, [mx, ay]); pts[0] = [p[0], p[1]]; }
    // draw partial polyline
    let total = 0; for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let left2 = total * kLine;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length && left2 > 0; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); const f = Math.min(1, left2 / (l || 1)); ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f); left2 -= l; }
    ctx.stroke();
  }
  if (s.end !== 'none' && kDot > 0) endMark(ctx, s.end || 'square', p[0], p[1], 4 * u * ease3(kDot), col, '#ffffff');
  if (kBox > 0.01) {
    ctx.save();
    if (anim === 'pop') { ctx.translate(bx + B.w / 2, by + B.h / 2); ctx.scale(kBox, kBox); ctx.translate(-(bx + B.w / 2), -(by + B.h / 2)); }
    else if (anim === 'draw') { ctx.globalAlpha *= kBox; ctx.translate((left ? -1 : 1) * (1 - kBox) * 14 * u, 0); }
    B.paint(bx, by);
    ctx.restore();
  }
  ctx.restore();
}

// ================================================================= screen titles
function anchor(fr, pos, w, h, m) {
  pos = pos || 'bottom-left';
  const x = /left/.test(pos) ? fr.x + m : /right/.test(pos) ? fr.x + fr.w - m - w : fr.x + (fr.w - w) / 2;
  const y = /top/.test(pos) ? fr.y + m : /bottom/.test(pos) ? fr.y + fr.h - m - h : fr.y + (fr.h - h) / 2;
  return [x, y];
}
function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    let cur = '';
    for (const w of para.split(/\s+/)) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; }
    out.push(cur);
  }
  return out;
}
function drawTitle(ctx, L, tm, o) {
  const s = L.style, fr = o.frame; if (!fr) return;
  const u = o.unit * (+s.size || 1), look = s.look || 'kinetic';
  const raw = tm.edit || L.anim === 'none' ? 1 : prog(L, tm);
  const k = L.anim === 'fade' ? 1 : raw;
  const col = s.color || '#ffffff', acc = s.accent || '#ffd23f', bg = s.bg || '#0e121a';
  const tr = +s.tracking || 0, al = s.align || 'left';
  const lines = String(up(s, s.text || '')).split('\n');
  const big = look === 'number' || look === 'counter' ? 0 : look === 'cinematic' ? 46 : look === 'stacked' || look === 'split' ? 64 : look === 'lowerthird' ? 30 : look === 'paragraph' ? 30 : look === 'quote' ? 34 : 54;
  const tf = font(s, look === 'cinematic' ? 300 : look === 'quote' ? 500 : 800, big * u);
  ctx.save();
  ctx.font = tf;
  const lh = big * 1.08 * u;
  const trk = look === 'cinematic' ? Math.max(tr, 0.35) : tr;
  let tw = Math.max(...lines.map((t) => measureSpaced(ctx, t, trk)));
  const subF = font(s, 500, 18 * u), kickF = font(s, 700, 13 * u);
  ctx.font = subF; const sw = s.sub ? ctx.measureText(up(s, s.sub)).width : 0;
  let W = Math.max(tw, sw), Hh = lines.length * lh + (s.sub ? 32 * u : 0);
  if (look === 'split' || look === 'number' || look === 'stacked' || look === 'frame') Hh += 26 * u;
  let body = [];
  if (look === 'paragraph') { ctx.font = font(s, 400, 17 * u); body = wrap(ctx, s.body, Math.max(360 * u, tw)); Hh = lh + 18 * u + body.length * 25 * u + (s.kicker ? 26 * u : 0); W = Math.max(tw, 360 * u); }
  if (look === 'counter') { ctx.font = font(s, 800, 96 * u); W = Math.max(ctx.measureText(`${s.prefix || ''}${numFmt(s.value, s.decimals)}${s.suffix || ''}`).width, sw); Hh = 104 * u + (s.sub ? 30 * u : 0); }
  if (look === 'number') { ctx.font = font(s, 800, 120 * u); const nw = ctx.measureText(String(s.value || '01')).width; ctx.font = tf; W = nw + 24 * u + Math.max(tw, sw); Hh = 130 * u; }
  if (look === 'lowerthird') { W = Math.max(tw, sw) + 60 * u; Hh = 92 * u; }
  if (look === 'quote') { ctx.font = tf; const qs = wrap(ctx, `${s.text || ''}`, 760 * u); lines.splice(0, lines.length, ...qs); tw = Math.max(...qs.map((t) => ctx.measureText(t).width)); W = Math.max(tw, sw) + 40 * u; Hh = qs.length * lh + 50 * u; }
  const padB = ['boxreveal', 'stacked', 'paragraph', 'marker', 'frame', 'counter'].includes(look) ? 22 * u : 0;
  W += padB * 2; Hh += padB * 2;
  const m = 60 * o.unit;
  let [x, y] = anchor(fr, s.position, W, Hh, m);
  placeAt(ctx, L, fr, x, y, W, Hh);
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !tm.edit ? easeOut(raw) : 1);
  if (s.shadow !== false) { ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 12 * u; ctx.shadowOffsetY = 2 * u; }
  const ax = al === 'center' ? x + W / 2 : al === 'right' ? x + W - padB : x + padB;
  ctx.textBaseline = 'top';
  const drawLines = (fx, f, yy, colr, each) => { ctx.font = f; ctx.fillStyle = colr; lines.forEach((t, i) => { ctx.save(); each?.(i, t); spaced(ctx, t, fx, yy + i * lh, trk, al); ctx.restore(); }); };
  switch (look) {
    case 'kinetic': {
      ctx.font = tf; ctx.fillStyle = col;
      let wi = 0; const allWords = lines.reduce((a, t) => a + t.split(' ').length, 0);
      lines.forEach((t, i) => {
        const words = t.split(' '); const lw = ctx.measureText(t).width; let cx = al === 'center' ? x + (W - lw) / 2 : al === 'right' ? x + W - lw : x;
        for (const w of words) {
          const kw = ease3(seg(k, (wi / allWords) * 0.6, (wi / allWords) * 0.6 + 0.4)); wi++;
          ctx.save(); ctx.beginPath(); ctx.rect(x - 10 * u, y + i * lh - 4 * u, W + 20 * u, lh + 6 * u); ctx.clip();
          ctx.globalAlpha *= kw; ctx.textAlign = 'left'; ctx.fillText(w, cx, y + i * lh + (1 - kw) * lh); ctx.restore();
          cx += ctx.measureText(`${w} `).width;
        }
      });
      if (s.sub) { ctx.font = subF; ctx.fillStyle = hexA(col, 0.85); ctx.globalAlpha *= seg(k, 0.6, 1); ctx.textAlign = al; ctx.fillText(up(s, s.sub), ax, y + lines.length * lh + 10 * u); }
      break;
    }
    case 'stacked': {
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = acc; ctx.fillRect(x, y, 8 * u, Hh * ease3(seg(k, 0, 0.4)));
      if (s.kicker) { ctx.font = kickF; ctx.fillStyle = acc; ctx.textAlign = 'left'; ctx.globalAlpha *= seg(k, 0.2, 0.5); spaced(ctx, up(s, s.kicker).toUpperCase(), x + 24 * u, y + padB, 0.18); ctx.globalAlpha /= seg(k, 0.2, 0.5) || 1; }
      const y0 = y + padB + (s.kicker ? 26 * u : 0);
      lines.forEach((t, i) => { const kk = ease3(seg(k, 0.15 + i * 0.12, 0.55 + i * 0.12)); ctx.save(); ctx.beginPath(); ctx.rect(x + 20 * u, y0 + i * lh, W, lh); ctx.clip(); ctx.font = tf; ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.fillText(t, x + 24 * u - (1 - kk) * 60 * u, y0 + i * lh); ctx.restore(); });
      if (s.sub) { ctx.font = subF; ctx.fillStyle = hexA(col, 0.85); ctx.textAlign = 'left'; ctx.globalAlpha *= seg(k, 0.6, 1); ctx.fillText(up(s, s.sub), x + 24 * u, y0 + lines.length * lh + 8 * u); }
      break;
    }
    case 'outline': {
      ctx.font = tf; ctx.lineWidth = 1.6 * u; ctx.strokeStyle = col; ctx.textAlign = al;
      lines.forEach((t, i) => ctx.strokeText(t, ax, y + i * lh));
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, W * ease3(seg(k, 0.3, 1)), Hh); ctx.clip(); ctx.shadowColor = 'transparent'; drawLines(ax, tf, y, col); ctx.restore();
      if (s.sub) { ctx.font = subF; ctx.fillStyle = acc; ctx.globalAlpha *= seg(k, 0.6, 1); ctx.fillText(up(s, s.sub), ax, y + lines.length * lh + 10 * u); }
      break;
    }
    case 'boxreveal': {
      const kb = seg(k, 0, 0.5), kr = seg(k, 0.5, 1);
      ctx.shadowColor = 'transparent';
      const bxw = W * ease3(kb) * (1 - ease3(kr) * 0) ;
      ctx.fillStyle = bg; ctx.globalAlpha *= 0.92; ctx.fillRect(x, y, W, Hh); ctx.globalAlpha /= 0.92;
      ctx.fillStyle = acc; const rx = kr > 0 ? x + W * ease3(kr) : x; ctx.fillRect(rx, y, kr > 0 ? W * (1 - ease3(kr)) : bxw, Hh);
      if (kr > 0) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, W * ease3(kr), Hh); ctx.clip(); drawLines(ax, tf, y + padB, col); if (s.sub) { ctx.font = subF; ctx.fillStyle = hexA(col, 0.85); ctx.textAlign = al; ctx.fillText(up(s, s.sub), ax, y + padB + lines.length * lh + 8 * u); } ctx.restore(); }
      break;
    }
    case 'underline': {
      drawLines(ax, tf, y, col, () => { ctx.globalAlpha *= seg(k, 0, 0.5); });
      const uy = y + lines.length * lh + 4 * u; const uw = tw * ease3(seg(k, 0.2, 0.8));
      ctx.fillStyle = acc; ctx.fillRect(al === 'center' ? x + (W - uw) / 2 : al === 'right' ? x + W - uw : x, uy, uw, 5 * u);
      if (s.sub) { ctx.font = subF; ctx.fillStyle = hexA(col, 0.85); ctx.textAlign = al; ctx.globalAlpha *= seg(k, 0.6, 1); ctx.fillText(up(s, s.sub), ax, uy + 14 * u); }
      break;
    }
    case 'split': {
      ctx.font = kickF; ctx.fillStyle = acc; ctx.globalAlpha *= seg(k, 0, 0.4); spaced(ctx, String(s.kicker || '').toUpperCase(), ax, y, 0.3, al); ctx.globalAlpha /= seg(k, 0, 0.4) || 1;
      drawLines(ax, tf, y + 26 * u, col, (i) => { const kk = ease3(seg(k, 0.15 + i * 0.1, 0.65 + i * 0.1)); ctx.globalAlpha *= kk; ctx.translate(0, (1 - kk) * 24 * u); });
      if (s.sub) { ctx.font = subF; ctx.fillStyle = hexA(col, 0.85); ctx.textAlign = al; ctx.globalAlpha *= seg(k, 0.6, 1); ctx.fillText(up(s, s.sub), ax, y + 26 * u + lines.length * lh + 10 * u); }
      break;
    }
    case 'typewriter': {
      const all = lines.join('\n'), n = Math.round(all.length * seg(k, 0, 0.85));
      const shown = all.slice(0, n).split('\n');
      ctx.font = font({ font: 'mono' }, 600, big * 0.7 * u); ctx.fillStyle = col; ctx.textAlign = 'left';
      shown.forEach((t, i) => ctx.fillText(t, x, y + i * lh * 0.8));
      const last = shown[shown.length - 1] || '';
      if (Math.floor((o.time ?? raw * 10) * 2) % 2 === 0 || k < 1) { ctx.fillStyle = acc; ctx.fillRect(x + ctx.measureText(last).width + 4 * u, y + (shown.length - 1) * lh * 0.8, 0.5 * big * 0.7 * u, big * 0.72 * u); }
      if (s.sub) { ctx.font = subF; ctx.fillStyle = hexA(col, 0.85); ctx.globalAlpha *= seg(k, 0.85, 1); ctx.fillText(up(s, s.sub), x, y + lines.length * lh * 0.8 + 12 * u); }
      break;
    }
    case 'cinematic': {
      const kk = ease3(k);
      ctx.font = tf; ctx.fillStyle = col; ctx.globalAlpha *= kk;
      lines.forEach((t, i) => spaced(ctx, t, ax, y + i * lh, trk + (1 - kk) * 0.25, al));
      if (s.sub) { ctx.font = font(s, 400, 15 * u); ctx.fillStyle = hexA(col, 0.8); spaced(ctx, up(s, s.sub).toUpperCase(), ax, y + lines.length * lh + 14 * u, 0.4, al); }
      break;
    }
    case 'lowerthird': {
      ctx.shadowColor = 'transparent';
      const k1 = ease3(seg(k, 0, 0.45)), k2 = ease3(seg(k, 0.25, 0.75));
      ctx.fillStyle = acc; ctx.fillRect(x, y, 10 * u, 92 * u * k1);
      ctx.fillStyle = hexA(bg, 0.9); ctx.fillRect(x + 10 * u, y, (W - 10 * u) * k1, 56 * u);
      ctx.fillStyle = hexA('#ffffff', 0.95); ctx.fillRect(x + 10 * u, y + 56 * u, (Math.max(sw, 80 * u) + 40 * u) * k2, 36 * u);
      ctx.save(); ctx.beginPath(); ctx.rect(x + 10 * u, y, W, 92 * u); ctx.clip();
      ctx.font = tf; ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.fillText(lines[0] || '', x + 30 * u - (1 - k1) * 40 * u, y + 11 * u);
      ctx.font = font(s, 600, 16 * u); ctx.fillStyle = '#1b1f27'; ctx.fillText(up(s, s.sub || ''), x + 30 * u - (1 - k2) * 40 * u, y + 64 * u);
      ctx.restore();
      break;
    }
    case 'quote': {
      ctx.font = font({ font: 'serif' }, 700, 110 * u); ctx.fillStyle = acc; ctx.textAlign = 'left'; ctx.globalAlpha *= seg(k, 0, 0.3); ctx.fillText('“', x - 4 * u, y - 30 * u); ctx.globalAlpha /= seg(k, 0, 0.3) || 1;
      ctx.font = font({ ...s, font: s.font === 'display' ? 'serif' : s.font }, 500, big * u); ctx.fillStyle = col;
      lines.forEach((t, i) => { ctx.save(); ctx.globalAlpha *= ease3(seg(k, 0.1 + i * 0.1, 0.5 + i * 0.1)); ctx.fillText(t, x + 40 * u, y + 20 * u + i * lh); ctx.restore(); });
      if (s.sub) { ctx.font = font(s, 600, 15 * u); ctx.fillStyle = acc; ctx.globalAlpha *= seg(k, 0.6, 1); ctx.fillText(`— ${s.sub}`, x + 40 * u, y + 26 * u + lines.length * lh); }
      break;
    }
    case 'counter': {
      ctx.font = font(s, 800, 96 * u); ctx.fillStyle = col; ctx.textAlign = al;
      ctx.fillText(`${s.prefix || ''}${counting(s.value, seg(k, 0, 0.9), s.decimals)}${s.suffix || ''}`, ax, y + padB);
      if (s.sub) { ctx.shadowColor = 'transparent'; ctx.font = font(s, 700, 15 * u); const t = up(s, s.sub).toUpperCase(); const w2 = measureSpaced(ctx, t, 0.15) + 20 * u; const sx = al === 'center' ? ax - w2 / 2 : al === 'right' ? ax - w2 : ax; ctx.fillStyle = acc; ctx.fillRect(sx, y + padB + 104 * u, w2 * ease3(seg(k, 0.3, 0.7)), 26 * u); ctx.fillStyle = '#111418'; ctx.globalAlpha *= seg(k, 0.5, 0.8); spaced(ctx, t, sx + 10 * u, y + padB + 109 * u, 0.15); }
      break;
    }
    case 'paragraph': {
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = hexA(bg, 0.82); ctx.fillRect(x, y, W * ease3(seg(k, 0, 0.3)), Hh);
      ctx.fillStyle = acc; ctx.fillRect(x, y, 4 * u, Hh * ease3(seg(k, 0, 0.3)));
      let yy = y + padB;
      if (s.kicker) { ctx.font = kickF; ctx.fillStyle = acc; ctx.globalAlpha *= seg(k, 0.2, 0.4); spaced(ctx, String(s.kicker).toUpperCase(), x + padB, yy, 0.2); ctx.globalAlpha /= seg(k, 0.2, 0.4) || 1; yy += 26 * u; }
      ctx.font = tf; ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.globalAlpha *= seg(k, 0.25, 0.5); ctx.fillText(lines[0] || '', x + padB, yy); ctx.globalAlpha /= seg(k, 0.25, 0.5) || 1; yy += lh + 14 * u;
      ctx.font = font(s, 400, 17 * u); ctx.fillStyle = hexA(col, 0.88);
      body.forEach((t, i) => { ctx.save(); ctx.globalAlpha *= seg(k, 0.4 + i * 0.06, 0.6 + i * 0.06); ctx.fillText(t, x + padB, yy + i * 25 * u); ctx.restore(); });
      break;
    }
    case 'number': {
      ctx.font = font(s, 800, 120 * u); const n = String(s.value || '01'); const nw = ctx.measureText(n).width;
      ctx.fillStyle = 'transparent'; ctx.lineWidth = 2 * u; ctx.strokeStyle = acc; ctx.textAlign = 'left'; ctx.globalAlpha *= seg(k, 0, 0.4); ctx.strokeText(n, x, y); ctx.globalAlpha /= seg(k, 0, 0.4) || 1;
      const tx0 = x + nw + 24 * u;
      ctx.fillStyle = acc; ctx.fillRect(tx0 - 12 * u, y + 20 * u, 3 * u, 90 * u * ease3(seg(k, 0.1, 0.5)));
      ctx.font = kickF; ctx.fillStyle = acc; ctx.globalAlpha *= seg(k, 0.2, 0.5); spaced(ctx, String(s.kicker || '').toUpperCase(), tx0, y + 22 * u, 0.25); ctx.globalAlpha /= seg(k, 0.2, 0.5) || 1;
      ctx.font = tf; ctx.fillStyle = col; lines.forEach((t, i) => { ctx.save(); const kk = ease3(seg(k, 0.3 + i * 0.1, 0.7 + i * 0.1)); ctx.globalAlpha *= kk; ctx.fillText(t, tx0 + (1 - kk) * 30 * u, y + 46 * u + i * lh); ctx.restore(); });
      if (s.sub) { ctx.font = subF; ctx.fillStyle = hexA(col, 0.8); ctx.globalAlpha *= seg(k, 0.6, 1); ctx.fillText(up(s, s.sub), tx0, y + 52 * u + lines.length * lh); }
      break;
    }
    case 'marker': {
      ctx.font = tf; ctx.shadowColor = 'transparent';
      lines.forEach((t, i) => {
        const lw = ctx.measureText(t).width; const lx = al === 'center' ? x + (W - lw) / 2 : al === 'right' ? x + W - padB - lw : x + padB;
        const km = ease3(seg(k, i * 0.15, 0.5 + i * 0.15));
        ctx.fillStyle = acc; ctx.fillRect(lx - 8 * u, y + padB + i * lh + lh * 0.12, (lw + 16 * u) * km, lh * 0.82);
        ctx.fillStyle = s.color === '#ffffff' ? '#111418' : col; ctx.textAlign = 'left'; ctx.fillText(t, lx, y + padB + i * lh + lh * 0.1);
      });
      if (s.sub) { ctx.font = subF; ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 6 * u; ctx.textAlign = al; ctx.globalAlpha *= seg(k, 0.6, 1); ctx.fillText(up(s, s.sub), ax, y + padB + lines.length * lh + 10 * u); }
      break;
    }
    case 'frame': {
      const kf = ease3(seg(k, 0, 0.5));
      corners(ctx, x, y, W, Hh, 18 * u * kf + 1, acc, 2.4 * u);
      ctx.font = kickF; ctx.fillStyle = acc; ctx.globalAlpha *= seg(k, 0.2, 0.5); spaced(ctx, String(s.kicker || '').toUpperCase(), ax, y + padB, 0.25, al); ctx.globalAlpha /= seg(k, 0.2, 0.5) || 1;
      drawLines(ax, tf, y + padB + 26 * u, col, () => { ctx.globalAlpha *= seg(k, 0.3, 0.7); });
      if (s.sub) { ctx.font = subF; ctx.fillStyle = hexA(col, 0.85); ctx.textAlign = al; ctx.globalAlpha *= seg(k, 0.6, 1); ctx.fillText(up(s, s.sub), ax, y + padB + 26 * u + lines.length * lh + 8 * u); }
      break;
    }
    default: drawLines(ax, tf, y, col);
  }
  ctx.restore();
}

// ================================================================= dimension line
function drawMeasure(ctx, L, tm, o) {
  const cs = L.geom?.type === 'LineString' ? L.geom.coordinates : null;
  if (!cs || cs.length < 2) return;
  const s = L.style, u = o.unit * (+s.size || 1);
  const a0 = cs[0], b0 = cs[cs.length - 1];
  let a = o.proj(a0), b = o.proj(b0);
  const nx = -(b[1] - a[1]), ny = b[0] - a[0], nl = Math.hypot(nx, ny) || 1, off = (+s.offset || 0) * o.unit;
  a = [a[0] + (nx / nl) * off, a[1] + (ny / nl) * off]; b = [b[0] + (nx / nl) * off, b[1] + (ny / nl) * off];
  let m = 0; for (let i = 1; i < cs.length; i++) m += haversine(cs[i - 1], cs[i]);
  const unit = s.units || 'auto';
  const txt = s.text || (unit === 'ft' ? `${(m * 3.28084).toLocaleString('en-US', { maximumFractionDigits: m * 3.28 < 100 ? 1 : 0 })} FT` : unit === 'mi' ? (m >= 1609 ? `${(m / 1609.344).toFixed(m > 16093 ? 0 : 1)} MI` : `${Math.round(m * 3.28084)} FT`) : unit === 'nmi' ? `${(m / 1852).toFixed(1)} NM` : m >= 1000 ? `${(m / 1000).toFixed(m > 10000 ? 0 : 1)} KM` : `${m.toFixed(m < 10 ? 1 : 0)} M`);
  const raw = tm.edit || L.anim === 'none' ? 1 : prog(L, tm), k = L.anim === 'fade' ? 1 : ease3(raw);
  const col = s.color || '#ffffff';
  ctx.save();
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !tm.edit ? easeOut(raw) : 1);
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4 * u;
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  let p, q;
  if (L.anim === 'draw') { p = a; q = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; }
  else { p = [mx + (a[0] - mx) * k, my + (a[1] - my) * k]; q = [mx + (b[0] - mx) * k, my + (b[1] - my) * k]; }
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.6 * u;
  if (s.look === 'dashed') ctx.setLineDash([6 * u, 5 * u]);
  ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); ctx.setLineDash([]);
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const tick = (pt, dir) => {
    ctx.save(); ctx.translate(pt[0], pt[1]); ctx.rotate(ang);
    const look = s.look || 'ticks';
    ctx.beginPath();
    if (look === 'arrows') { ctx.moveTo(0, 0); ctx.lineTo(-dir * 10 * u, -5 * u); ctx.lineTo(-dir * 10 * u, 5 * u); ctx.closePath(); ctx.fill(); }
    else if (look === 'dashed') { ctx.arc(0, 0, 3.5 * u, 0, Math.PI * 2); ctx.fill(); }
    else if (look === 'bracket') { ctx.moveTo(-dir * 8 * u, -12 * u); ctx.lineTo(0, -12 * u); ctx.lineTo(0, 12 * u); ctx.lineTo(-dir * 8 * u, 12 * u); ctx.stroke(); }
    else { ctx.moveTo(0, -9 * u); ctx.lineTo(0, 9 * u); ctx.stroke(); for (let i = 1; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(-dir * i * 6 * u, -2.5 * u); ctx.lineTo(-dir * i * 6 * u, 2.5 * u); ctx.lineWidth = 0.9 * u; ctx.stroke(); } }
    ctx.restore();
  };
  if (k > 0.98 || L.anim !== 'draw') { tick(p, -1); tick(q, 1); }
  if (k > 0.6) {
    ctx.globalAlpha *= seg(k, 0.6, 1);
    ctx.font = `700 ${12 * u}px ${FONTS.display}`; const tw = ctx.measureText(txt).width;
    let ra = ang; if (ra > Math.PI / 2) ra -= Math.PI; if (ra < -Math.PI / 2) ra += Math.PI;
    ctx.save(); ctx.translate(mx, my); ctx.rotate(ra);
    const lab = s.label || 'pill';
    const by = lab === 'plain' ? -12 * u : -22 * u;
    if (lab === 'pill') { ctx.shadowColor = 'transparent'; rr(ctx, -tw / 2 - 9 * u, by - 9 * u, tw + 18 * u, 18 * u, 9 * u); ctx.fillStyle = 'rgba(30,36,44,0.85)'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1 * u; ctx.stroke(); }
    else if (lab === 'box') { ctx.shadowColor = 'transparent'; ctx.fillStyle = col; ctx.fillRect(-tw / 2 - 8 * u, by - 9 * u, tw + 16 * u, 18 * u); }
    ctx.fillStyle = lab === 'box' ? '#111418' : '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 0, by);
    ctx.restore();
  }
  ctx.restore();
}

// ================================================================= scan windows
function fingerprint(ctx, cx, cy, w, h, k, col, seed = 7) {
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, w * 0.012); ctx.lineCap = 'round';
  const n = 22;
  for (let i = 1; i <= n; i++) {
    const rx = (w / 2) * (i / n), ry = (h / 2) * (i / n);
    const gap = 0.35 + ((i * 37 + seed) % 7) * 0.12, start = -Math.PI / 2 + ((i * 53) % 11) * 0.09;
    const end = start + (Math.PI * 2 - gap) * clamp(k * 1.4 - (i / n) * 0.4, 0, 1);
    if (end <= start) continue;
    ctx.beginPath();
    for (let a = start; a <= end; a += 0.06) { const wob = 1 + 0.05 * Math.sin(a * 3 + i * 0.7); const x = cx + Math.cos(a) * rx * wob, y = cy + Math.sin(a) * ry * wob * (a > 0 && a < Math.PI ? 1.08 : 1) + i * 0.15; a === start ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.restore();
}
function iris(ctx, cx, cy, r, k) {
  const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
  g.addColorStop(0, '#2b3a40'); g.addColorStop(0.35, '#7c8f96'); g.addColorStop(0.8, '#55666c'); g.addColorStop(1, '#1d2529');
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(220,235,240,0.35)'; ctx.lineWidth = 1;
  for (let i = 0; i < 120; i++) { const a = (i / 120) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.32, cy + Math.sin(a) * r * 0.32); ctx.lineTo(cx + Math.cos(a + 0.05) * r * (0.75 + (i % 5) * 0.05), cy + Math.sin(a + 0.05) * r * (0.75 + (i % 5) * 0.05)); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(cx, cy, r * (0.3 + 0.04 * Math.sin(k * 8)), 0, Math.PI * 2); ctx.fillStyle = '#050607'; ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.18, cy - r * 0.2, r * 0.12, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
}
function drawScan(ctx, L, tm, o) {
  const s = L.style, fr = o.frame; if (!fr) return;
  const u = o.unit * (+s.size || 1), look = s.look || 'retina';
  const W = (+s.width || 420) * u, Hh = look === 'idcard' ? W * 1.5 : look === 'profile' ? W * 0.62 : look === 'fingerprint' ? W * 1.2 : W * 0.95;
  const raw = tm.edit || L.anim === 'none' ? 1 : prog(L, tm);
  const kOpen = L.anim === 'open' ? ease3(seg(raw, 0, 0.35)) : 1, k = L.anim === 'open' ? seg(raw, 0.25, 1) : 1;
  const tsec = (o.time ?? 0) + raw * 3;
  const [x0, y0] = anchor(fr, s.position || 'top-right', W, Hh, 50 * o.unit);
  ctx.save();
  placeAt(ctx, L, fr, x0, y0, W, Hh);
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !tm.edit ? easeOut(raw) : 1);
  const fc = s.frame || '#8fd3e0', ac = s.accent || '#ff7a1a', bg = s.bg || '#1d2a33';
  const h = Hh * kOpen, x = x0, y = y0 + (Hh - h) / 2;
  ctx.fillStyle = hexA(bg, look === 'retina' || look === 'fingerprint' ? 0.55 : 0.92); ctx.fillRect(x, y, W, h);
  ctx.strokeStyle = fc; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + W, y); ctx.moveTo(x, y + h); ctx.lineTo(x + W, y + h); ctx.stroke();
  ctx.fillStyle = fc; for (const [cx, cy] of [[x - 8 * u, y - 8 * u], [x + W + 4 * u, y - 8 * u], [x - 8 * u, y + h + 4 * u], [x + W + 4 * u, y + h + 4 * u]]) ctx.fillRect(cx, cy, 4 * u, 4 * u);
  ctx.fillStyle = ac; for (let i = 0; i < 6; i++) ctx.fillRect(x + W + 12 * u, y + h * (0.3 + i * 0.1), 2 * u, (i % 2 ? 14 : 8) * u);
  if (kOpen < 0.99) { ctx.restore(); return; }
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, W, h); ctx.clip();
  const pad = 18 * u;
  // title bar
  ctx.fillStyle = fc; ctx.fillRect(x + pad, y + pad, 2 * u, 18 * u); ctx.fillRect(x + pad - 6 * u, y + pad + 8 * u, 6 * u, 2 * u);
  ctx.fillStyle = hexA(fc, 0.85); ctx.fillRect(x + pad + 10 * u, y + pad, Math.min(W * 0.5, 200 * u), 22 * u);
  ctx.font = `500 ${13 * u}px ${FONTS.display}`; ctx.fillStyle = '#16232a'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const title = String(s.title || ''); ctx.fillText(title.slice(0, Math.ceil(title.length * seg(k, 0, 0.3))), x + pad + 16 * u, y + pad + 11 * u);
  ctx.fillStyle = ac; ctx.fillRect(x + pad, y + pad + 32 * u, W * 0.18, 2 * u); ctx.fillStyle = hexA(fc, 0.6); ctx.fillRect(x + pad + W * 0.22, y + pad + 32 * u, W - pad * 2 - W * 0.22, 1 * u);
  for (let i = 0; i < 4; i++) { ctx.fillStyle = i < 2 ? ac : hexA(fc, 0.6); ctx.fillRect(x + W - pad - 60 * u + i * 9 * u, y + pad + 14 * u, 4 * u, 4 * u); }
  const top = y + pad + 44 * u, foot = 70 * u;
  const tx = (t, xx, yy, f, c) => { ctx.font = f; ctx.fillStyle = c; ctx.fillText(t, xx, yy); };
  const rowsOf = () => String(s.rows || '').split('\n').map((r) => r.split('|').map((v) => v.trim())).filter((r) => r[0]);
  if (look === 'retina' || look === 'fingerprint') {
    const bh = h - (top - y) - foot - pad * 0.5, bx = x + pad, bw = W - pad * 2;
    if (look === 'retina') {
      const im = s.media && imageFor(s.media);
      if (im?.ready) { const sc = Math.max(bw / im.w, bh / im.h); ctx.save(); ctx.beginPath(); ctx.rect(bx, top, bw, bh); ctx.clip(); ctx.drawImage(im.bmp, bx + (bw - im.w * sc) / 2, top + (bh - im.h * sc) / 2, im.w * sc, im.h * sc); ctx.restore(); }
      else { ctx.fillStyle = '#e8d6cf'; ctx.fillRect(bx, top, bw, bh); iris(ctx, bx + bw / 2, top + bh / 2, Math.min(bw, bh) * 0.42, tsec); }
      const tg = [[0.5, 0.25], [0.32, 0.55], [0.68, 0.7]];
      tg.forEach(([fx, fy], i) => { const kk = seg(k, 0.3 + i * 0.15, 0.5 + i * 0.15); if (!kk) return; const cx = bx + bw * fx, cy = top + bh * fy, r = 18 * u * (2 - kk); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5 * u; ctx.strokeRect(cx - r, cy - r, r * 2, r * 2); ctx.beginPath(); ctx.arc(cx, cy, 4 * u, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); });
    } else {
      fingerprint(ctx, bx + bw / 2, top + bh / 2, Math.min(bw * 0.7, bh * 0.62), Math.min(bh * 0.9, bw), seg(k, 0, 0.8), hexA('#e9eef0', 0.85));
      [[0.45, 0.55], [0.6, 0.38], [0.58, 0.72]].forEach(([fx, fy], i) => { if (k < 0.5 + i * 0.12) return; ctx.beginPath(); ctx.arc(bx + bw * fx, top + bh * fy, 4.5 * u, 0, Math.PI * 2); ctx.fillStyle = '#ff4a5a'; ctx.fill(); });
    }
    if (k < 1) { const sy = top + bh * ((tsec * 0.6) % 1); ctx.fillStyle = hexA(fc, 0.35); ctx.fillRect(bx, sy, bw, 3 * u); }
    const fy = y + h - foot + 14 * u;
    tx('PROCESS', x + pad, fy + 6 * u, `500 ${12 * u}px ${FONTS.display}`, hexA('#ffffff', 0.85)); tx(String(s.process || '').slice(0, Math.ceil(String(s.process || '').length * seg(k, 0.5, 0.8))), x + pad + 90 * u, fy + 6 * u, `500 ${12 * u}px ${FONTS.display}`, hexA('#ffffff', 0.9));
    tx('STATUS', x + pad, fy + 30 * u, `500 ${12 * u}px ${FONTS.display}`, hexA('#ffffff', 0.85)); tx(k >= 1 ? String(s.status || '') : 'Scanning…', x + pad + 90 * u, fy + 30 * u, `600 ${12 * u}px ${FONTS.display}`, ac);
    ctx.fillStyle = ac; ctx.fillRect(x + W - pad - 30 * u, fy - 4 * u, 30 * u, 30 * u); ctx.fillStyle = '#fff'; ctx.fillRect(x + W - pad - 22 * u, fy + 10 * u, 14 * u, 2.5 * u); ctx.fillRect(x + W - pad - 16 * u, fy + 4 * u, 2.5 * u, 14 * u);
  } else if (look === 'idcard') {
    tx(String(s.name || ''), x + pad, top + 18 * u, `400 ${26 * u}px ${FONTS.display}`, '#ffffff');
    ctx.fillStyle = ac; ctx.fillRect(x + pad, top + 36 * u, W * 0.2, 2 * u);
    const ph = W * 0.72, py = top + 48 * u;
    const im = s.media && imageFor(s.media);
    if (im?.ready) { const sc = Math.max((W - pad * 2) / im.w, ph / im.h); ctx.save(); ctx.beginPath(); ctx.rect(x + pad, py, W - pad * 2, ph); ctx.clip(); ctx.drawImage(im.bmp, x + pad + (W - pad * 2 - im.w * sc) / 2, py + (ph - im.h * sc) / 2, im.w * sc, im.h * sc); ctx.restore(); }
    else { ctx.fillStyle = '#c9d0d4'; ctx.fillRect(x + pad, py, W - pad * 2, ph); ctx.fillStyle = '#9aa4aa'; ctx.beginPath(); ctx.arc(x + W / 2, py + ph * 0.42, ph * 0.18, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(x + W / 2, py + ph, ph * 0.34, ph * 0.3, 0, Math.PI, 0); ctx.fill(); }
    ctx.fillStyle = ac; ctx.beginPath(); ctx.moveTo(x + W - pad, py + ph - 50 * u); ctx.lineTo(x + W - pad, py + ph); ctx.lineTo(x + W - pad - 50 * u, py + ph); ctx.closePath(); ctx.fill();
    let ry = py + ph + 30 * u;
    rowsOf().forEach((r, i) => { const kk = seg(k, 0.3 + i * 0.08, 0.5 + i * 0.08); ctx.globalAlpha *= kk || 0.0001; tx(r[0].toUpperCase(), x + pad, ry, `500 ${11 * u}px ${FONTS.display}`, hexA('#ffffff', 0.85)); tx(r[1] || '', x + pad + W * 0.38, ry, `500 ${11 * u}px ${FONTS.display}`, ac); ctx.globalAlpha /= kk || 0.0001; ry += 22 * u; });
    const lb = 64 * u; ctx.strokeStyle = ac; ctx.lineWidth = 3 * u; ctx.strokeRect(x + W - pad - lb, y + h - pad - lb - 14 * u, lb, lb);
    tx(String(s.letter || 'B'), x + W - pad - lb / 2 - 12 * u, y + h - pad - lb / 2 - 14 * u, `400 ${44 * u}px ${FONTS.display}`, ac);
    ctx.fillStyle = ac; ctx.fillRect(x + W - pad - lb, y + h - pad - 12 * u, lb, 12 * u);
    ctx.fillStyle = hexA('#ffffff', 0.25); for (let i = 0; i < 40; i++) ctx.fillRect(x + pad + (i % 20) * 9 * u, y + h - pad - 20 * u + Math.floor(i / 20) * 8 * u, 2.5 * u, 2.5 * u);
  } else { // profile
    const pw = W * 0.34, ph = h - (top - y) - pad;
    const im = s.media && imageFor(s.media);
    if (im?.ready) { const sc = Math.max(pw / im.w, ph / im.h); ctx.save(); ctx.beginPath(); ctx.rect(x + pad, top, pw, ph); ctx.clip(); ctx.drawImage(im.bmp, x + pad + (pw - im.w * sc) / 2, top + (ph - im.h * sc) / 2, im.w * sc, im.h * sc); ctx.restore(); }
    else { ctx.fillStyle = '#c9d0d4'; ctx.fillRect(x + pad, top, pw, ph); }
    corners(ctx, x + pad, top, pw, ph, 14 * u, fc, 2 * u);
    const cx = x + pad * 2 + pw;
    tx(String(s.name || ''), cx, top + 14 * u, `500 ${22 * u}px ${FONTS.display}`, '#ffffff');
    let ry = top + 46 * u;
    rowsOf().forEach((r, i) => { const kk = seg(k, 0.2 + i * 0.08, 0.4 + i * 0.08); ctx.globalAlpha *= kk || 0.0001; tx(r[0].toUpperCase(), cx, ry, `500 ${11 * u}px ${FONTS.display}`, hexA('#ffffff', 0.75)); tx(r[1] || '', cx + W * 0.26, ry, `600 ${11 * u}px ${FONTS.display}`, ac); ctx.globalAlpha /= kk || 0.0001; ctx.fillStyle = hexA(fc, 0.25); ctx.fillRect(cx, ry + 10 * u, x + W - pad - cx, 1); ry += 24 * u; });
    tx('STATUS', cx, y + h - pad - 6 * u, `500 ${11 * u}px ${FONTS.display}`, hexA('#ffffff', 0.75)); tx(String(s.status || ''), cx + W * 0.26, y + h - pad - 6 * u, `700 ${11 * u}px ${FONTS.display}`, ac);
  }
  ctx.restore();
  ctx.restore();
}

// ================================================================= airborne camera overlay
const pad2 = (n) => String(n).padStart(2, '0');
function drawFlir(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, map = o.map; if (!fr || !map) return;
  const u = o.unit * (+s.size || 1);
  const raw = tm.edit || L.anim === 'none' ? 1 : prog(L, tm);
  let c, z = 12, br = 0, pitch = 0;
  try { const cc = map.getCenter(); c = [cc.lng, cc.lat]; z = map.getZoom(); br = map.getBearing(); pitch = map.getPitch(); } catch { return; }
  const mpp = (40075016.686 * Math.cos((c[1] * Math.PI) / 180)) / (512 * 2 ** z);
  const range = (mpp * 900) / (2 * Math.tan((18 * Math.PI) / 180)); // slant range to the centre (m)
  const altM = range * Math.cos((pitch * Math.PI) / 180), ground = range * Math.sin((pitch * Math.PI) / 180);
  // aircraft position: behind the camera along the bearing
  const bb = ((br + 180) * Math.PI) / 180;
  const ac = [c[0] + (Math.sin(bb) * ground) / (111320 * Math.cos((c[1] * Math.PI) / 180)), c[1] + (Math.cos(bb) * ground) / 110540];
  const t0 = s.time && /^\d{1,2}:\d{2}(:\d{2})?$/.test(s.time) ? s.time.split(':').map(Number) : null;
  const now = new Date();
  const secs = (t0 ? t0[0] * 3600 + t0[1] * 60 + (t0[2] || 0) : now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) + Math.floor(o.time ?? 0);
  const tstr = `${pad2(Math.floor(secs / 3600) % 24)}:${pad2(Math.floor(secs / 60) % 60)}:${pad2(secs % 60)}`;
  const dstr = s.date || `${pad2(now.getMonth() + 1)}/${pad2(now.getDate())}/${String(now.getFullYear()).slice(2)}`;
  const deg = (v, pos, neg) => `${Math.abs(v).toFixed(5)}° ${v >= 0 ? pos : neg}`;
  const col = s.color || '#ffffff', alert = s.alert || '#ff2a2a';
  const lines = (x, y, rows, align = 'left') => {
    rows.forEach((r, i) => {
      if (raw < 1 && L.anim === 'boot' && seg(raw, i * 0.05, i * 0.05 + 0.2) <= 0) return;
      ctx.textAlign = align; ctx.fillStyle = r.c || col; ctx.fillText(r.t, x, y + i * 26 * u);
    });
  };
  ctx.save();
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !tm.edit ? easeOut(raw) : 1);
  ctx.font = `700 ${19 * u}px ${FONTS.mono}`; ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 3 * u;
  const m = 18 * u, X0 = fr.x + m, Y0 = fr.y + m, X1 = fr.x + fr.w - m, Y1 = fr.y + fr.h - m;
  const hdg = ((Math.round(br) % 360) + 360) % 360;
  lines(X0, Y0, [
    { t: `✈ ${String(s.unit || '').toUpperCase()}` },
    { t: `${deg(ac[1], 'N', 'S')}   ${deg(ac[0], 'E', 'W')}` },
    { t: `SPD    ${String(s.speed ?? 51).padStart(3)} KTS   HDG   ${String(hdg).padStart(3, '0')} °T` },
    { t: `ALT   ${Math.round(altM * 3.28084)} FT` },
  ]);
  lines(X0, Y0 + 170 * u, [{ t: dstr }, { t: tstr }]);
  lines(X1, Y0 + 26 * u, [
    { t: `${deg(c[1], 'N', 'S')}   ${deg(c[0], 'E', 'W')}` },
    { t: `SPD    1 MPH   HDG   --- °T` },
    { t: `ELV  ${Math.max(0, Math.round((o.map.queryTerrainElevation?.(c) || 0) * 3.28084))} FT   SLT  ${Math.round(range * 3.28084)} FT` },
  ], 'right');
  lines(X1, Y0 + 170 * u, [{ t: 'LRF TARGET' }, { t: deg(c[1], 'N', 'S') }, { t: deg(c[0], 'E', 'W') }, { t: `SLT   ${Math.round(range * 0.87 * 3.28084)} FT` }], 'right');
  if (s.armed !== false) lines(X0, Y0 + fr.h * 0.6, [{ t: 'LRF   ARMED', c: alert }, { t: 'LP  P ARMED', c: alert }, { t: 'LI    ARMED', c: alert }]);
  lines(X0, Y1 - 160 * u, [{ t: 'HDIR' }, { t: 'M WH DDE' }, { t: 'FOC MAN' }, { t: 'EXP MAN' }]);
  lines(X1, Y1 - 160 * u, [{ t: 'GEOPOINT' }, { t: `INS NAV ${(0.2 + 0.05 * Math.sin((o.time ?? 0) * 0.7)).toFixed(2)}°` }, { t: '' }, { t: 'TRK SCN' }], 'right');
  // north arrow
  ctx.save(); ctx.translate(X0 + 40 * u, Y0 + 300 * u); ctx.rotate((-br * Math.PI) / 180 - Math.PI * 0.25);
  ctx.strokeStyle = col; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.moveTo(-22 * u, 0); ctx.lineTo(22 * u, 0); ctx.moveTo(14 * u, -7 * u); ctx.lineTo(22 * u, 0); ctx.lineTo(14 * u, 7 * u); ctx.stroke();
  ctx.font = `700 ${18 * u}px ${FONTS.mono}`; ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', 0, -2 * u); ctx.restore();
  // scale
  ctx.font = `700 ${19 * u}px ${FONTS.mono}`; ctx.textBaseline = 'middle';
  ctx.strokeStyle = col; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(X0 + 30 * u, Y1 - 12 * u); ctx.lineTo(X0 + 250 * u, Y1 - 12 * u); ctx.moveTo(X0 + 30 * u, Y1 - 20 * u); ctx.lineTo(X0 + 30 * u, Y1 - 4 * u); ctx.stroke();
  ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.fillText('W', X0, Y1 - 12 * u); ctx.fillText('N', X0 + 258 * u, Y1 - 12 * u);
  ctx.fillText(`${Math.max(1, Math.round(mpp * 3.28084 * 0.6))} FT`, X0 + 320 * u, Y1 - 12 * u);
  // crosshair
  if (s.crosshair !== false) {
    const cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2, g = 18 * u, l = 40 * u;
    ctx.strokeStyle = col; ctx.lineWidth = 2.4 * u; ctx.beginPath();
    ctx.moveTo(cx - g - l, cy); ctx.lineTo(cx - g, cy); ctx.moveTo(cx + g, cy); ctx.lineTo(cx + g + l, cy); ctx.moveTo(cx, cy - g - l); ctx.lineTo(cx, cy - g); ctx.moveTo(cx, cy + g); ctx.lineTo(cx, cy + g + l);
    ctx.moveTo(cx - g - l - 90 * u, cy - 6 * u); ctx.lineTo(cx - g - l - 90 * u, cy + 6 * u); ctx.moveTo(cx + g + l + 90 * u, cy - 6 * u); ctx.lineTo(cx + g + l + 90 * u, cy + 6 * u); ctx.stroke();
  }
  // dials
  if (s.dials !== false) {
    const dial = (dx, ang, label, labelLeft) => {
      const cx = fr.x + fr.w / 2 + dx, cy = Y1 - 50 * u, R = 44 * u;
      ctx.strokeStyle = col; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * R * 0.85, cy + Math.sin(ang) * R * 0.85); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - R - 6 * u); ctx.lineTo(cx, cy - R + 6 * u); ctx.moveTo(cx, cy + R - 6 * u); ctx.lineTo(cx, cy + R + 6 * u); ctx.moveTo(cx + R - 6 * u, cy); ctx.lineTo(cx + R + 6 * u, cy); ctx.stroke();
      ctx.fillStyle = col; ctx.textAlign = labelLeft ? 'right' : 'left'; ctx.fillText(label, labelLeft ? cx - R - 8 * u : cx + R + 8 * u, cy + R * 0.85);
    };
    dial(-85 * u, (pitch * Math.PI) / 180 * 0.5 + 0.5, `-${Math.round(90 - pitch)}°`, true);
    dial(85 * u, ((hdg - 90) * Math.PI) / 180, `${hdg}°`, false);
  }
  ctx.restore();
}
