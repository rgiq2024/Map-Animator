// A proper typewriter: human key rhythm (pauses after spaces, punctuation and line ends), every letter struck
// with a small ink press (uneven ink, a hair of jitter and tilt, faint double strike), a carriage return with
// a bell at the end of each line, an optional carriage that slides as you type, paper or none, and one
// mechanical sound per keystroke at exactly the moment the letter lands.
import { placeAt } from './place.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const seg = (u, a, b) => clamp((u - a) / Math.max(1e-6, b - a), 0, 1);
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rnd = (seed) => { let x = seed || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000; }; };
export const TW_FONTS = {
  elite: '"Special Elite","Courier Prime","Courier New",monospace',
  courier: '"Courier Prime","Courier New",monospace',
  mono: '"JetBrains Mono","IBM Plex Mono",Consolas,monospace',
};

/**
 * When each character lands: [{ ch, line, col, t, kind }] with kind k (key), s (space), r (carriage return).
 * cps = letters per second, human 0..1 = how uneven the rhythm is. total = time when the last letter lands.
 */
export function typeSchedule(text, cps = 12, human = 0.6) {
  const R = rnd(hashStr(String(text)) || 7);
  const base = 1 / Math.max(1, cps);
  const out = [];
  let t = 0, line = 0, col = 0, prev = '';
  for (const ch of String(text)) {
    if (ch === '\n') {
      out.push({ ch, line, col, t: t + base * 0.6, kind: 'r' });
      t += base * 0.6 + 0.55;  // bell, lever, carriage back
      line++; col = 0; prev = ch; continue;
    }
    let d = base * (1 + (R() - 0.5) * 1.3 * human);
    if (prev === ' ') d += base * 0.35 * human;
    if (/[.,;:!?]/.test(prev)) d += base * (1.6 + R()) * human;
    if (R() < 0.04 * human) d += base * 3 * R();    // a little hesitation now and then
    t += Math.max(base * 0.35, d);
    out.push({ ch, line, col, t, kind: ch === ' ' ? 's' : 'k' });
    col++; prev = ch;
  }
  return { list: out, total: t };
}
/** fit the schedule into a time budget (faster when the text is long) */
export function fitSchedule(text, cps, human, budget) {
  let sc = typeSchedule(text, cps, human);
  if (budget > 0 && sc.total > budget) sc = typeSchedule(text, cps * (sc.total / budget) * 1.02, human);
  return sc;
}

// ---------------------------------------------------------------- registry
export const TW_KIND = { typewriter: { name: 'Typewriter text', icon: '⌨', geom: null, desc: 'Real typewriter typing: uneven human rhythm, ink-pressed letters, carriage return with a bell, paper or none — one mechanical sound per key' } };
export const TW_ANIM = { typewriter: { type: 'Typed', none: 'Shown' } };
export const TW_DEFAULT = { typewriter: { anim: 'type', duration: 8, style: {
  text: 'TOP SECRET\nOperation Nightfall begins at 0400.\nAll units hold position until further notice.', font: 'elite', size: 1, speed: 12, human: 0.6,
  color: '', paper: 'paper', ink: true, caret: 'bar', carriage: false, bell: true, align: 'left', position: 'center', width: 0, keyVol: 1, stay: true, sound: true,
} } };
export const TW_FORM = { typewriter: [
  ['style.text', 'Text (new line = carriage return)', 'textarea'],
  ['style.speed', 'Typing speed (letters / s)', 'range', [3, 40, 0.5]], ['style.human', 'Human rhythm (uneven, pauses)', 'range', [0, 1, 0.05]],
  ['style.font', 'Typeface', 'select', { elite: 'Old typewriter (Special Elite)', courier: 'Courier Prime', mono: 'Modern mono' }],
  ['style.paper', 'Background', 'select', { paper: 'Paper sheet', note: 'Index card', dark: 'Dark card', none: 'None — over the map' }],
  ['style.color', 'Ink colour (empty = auto)', 'color'], ['style.ink', 'Uneven ink + double strike', 'switch'],
  ['style.caret', 'Cursor', 'select', { bar: 'Thin bar', block: 'Block', under: 'Underscore', none: 'None' }],
  ['style.carriage', 'Carriage slides as it types', 'switch'], ['style.bell', 'Bell at each line end', 'switch'],
  ['style.align', 'Text', 'select', { left: 'Left', center: 'Centred' }],
  ['style.position', 'Position (or drag it)', 'select', { center: 'Centre', 'top-left': 'Top left', 'bottom-left': 'Bottom left', 'top-right': 'Top right', 'bottom-right': 'Bottom right' }],
  ['style.size', 'Size', 'range', [0.4, 3, 0.05]], ['style.stay', 'Stay until the scene ends', 'switch'], ['style.sound', 'Key sounds', 'switch'], ['style.keyVol', 'Key volume', 'range', [0.1, 2, 0.05], (L) => L.style.sound !== false],
] };

const sched = new Map();
export function scheduleOf(L) {
  const s = L.style, D = Math.max(0.5, +L.duration || 8);
  const key = `${s.text}|${s.speed}|${s.human}|${D}`;
  let c = sched.get(L.id);
  if (!c || c.key !== key) { c = { key, sc: fitSchedule(String(s.text || ''), +s.speed || 12, s.human ?? 0.6, D * 0.92) }; sched.set(L.id, c); }
  return c.sc;
}
/** sound events (layer time) */
export function typewriterSounds(L, P) {
  const s = L.style, sc = scheduleOf(L);
  const hits = sc.list.map((e) => [+e.t.toFixed(3), e.kind]);
  if (hits.length) P(0, 'typewriter', { hits, bell: s.bell !== false, vol: +s.keyVol || 1 });
}

// ---------------------------------------------------------------- drawing
let paperTex = null;
function paperNoise() {
  if (paperTex) return paperTex;
  paperTex = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  const g = paperTex.getContext('2d'), d = g.createImageData(256, 256), R = rnd(99);
  for (let i = 0; i < d.data.length; i += 4) { const v = 120 + R() * 135; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 22; }
  g.putImageData(d, 0, 0);
  return paperTex;
}
export function drawTypewriter(ctx, L, tm, o) {
  const s = L.style, fr = o.frame;
  if (!fr) return;
  const sc = scheduleOf(L), D = Math.max(0.5, +L.duration || 8);
  const tau = tm.edit || L.anim === 'none' ? 1e9 : tm.tau;
  if (s.stay === false && !tm.edit && tau > D + 0.3) return;
  const unit = o.unit, sz = +s.size || 1;
  const fs = 26 * unit * sz;
  const fam = TW_FONTS[s.font] || TW_FONTS.elite;
  const lines = String(s.text || '').split('\n');
  ctx.save();
  ctx.font = `400 ${fs}px ${fam}`;
  const adv = ctx.measureText('M').width;
  const lh = fs * 1.45;
  const maxCols = Math.max(1, ...lines.map((l) => [...l].length));
  const paper = s.paper || 'paper';
  const pad = paper === 'none' ? 0 : fs * 1.2;
  const W = maxCols * adv + pad * 2, Hh = lines.length * lh + pad * 2 - (lh - fs) * 0.5;
  const pos = s.position || 'center', m = 40 * unit;
  let x0 = fr.x + (fr.w - W) / 2, y0 = fr.y + (fr.h - Hh) / 2;
  if (/left/.test(pos)) x0 = fr.x + m; if (/right/.test(pos)) x0 = fr.x + fr.w - W - m;
  if (/top/.test(pos)) y0 = fr.y + m + fr.h * 0.08; if (/bottom/.test(pos)) y0 = fr.y + fr.h - Hh - m - fr.h * 0.12;
  placeAt(ctx, L, fr, x0, y0, W, Hh, { key: 'tw' });
  const fadeOut = s.stay === false && !tm.edit ? 1 - seg(tau, D, D + 0.3) : 1;
  ctx.globalAlpha *= tm.alpha * fadeOut;
  const ink = s.color || (paper === 'none' || paper === 'dark' ? '#f2f2ee' : '#1c1b1a');
  // carriage: slide the text so the typing point stays put
  const typed = sc.list.filter((e) => e.t <= tau);
  const last = typed[typed.length - 1];
  let curLine = last ? (last.kind === 'r' ? last.line + 1 : last.line) : 0, curCol = last ? (last.kind === 'r' ? 0 : last.col + 1) : 0;
  // a carriage return glides back during its pause
  let glide = 1;
  if (last?.kind === 'r') glide = seg(tau, last.t + 0.15, last.t + 0.5);
  const lineOff = (i) => (s.align === 'center' ? ((maxCols - [...lines[i] || ''].length) * adv) / 2 : 0);
  let shiftX = 0;
  if (s.carriage && !tm.edit) {
    const prevCol = last?.kind === 'r' ? last.col : curCol;
    const colNow = last?.kind === 'r' ? prevCol * (1 - glide) : curCol;
    shiftX = -(colNow - maxCols / 2) * adv;
  }
  ctx.translate(shiftX, 0); // the sheet rides on the carriage
  // the sheet
  if (paper !== 'none') {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 18 * unit; ctx.shadowOffsetY = 6 * unit;
    ctx.fillStyle = paper === 'dark' ? '#16191d' : paper === 'note' ? '#fbf7ec' : '#efe6d2';
    ctx.fillRect(x0, y0, W, Hh);
    ctx.shadowColor = 'transparent';
    if (paper !== 'dark') {
      ctx.globalAlpha *= 0.9; const pat = ctx.createPattern(paperNoise(), 'repeat'); if (pat) { ctx.fillStyle = pat; ctx.fillRect(x0, y0, W, Hh); }
      const v = ctx.createRadialGradient(x0 + W / 2, y0 + Hh / 2, Math.min(W, Hh) * 0.3, x0 + W / 2, y0 + Hh / 2, Math.max(W, Hh) * 0.75);
      v.addColorStop(0, 'rgba(120,90,40,0)'); v.addColorStop(1, 'rgba(120,90,40,0.18)'); ctx.fillStyle = v; ctx.fillRect(x0, y0, W, Hh);
      if (paper === 'note') { ctx.strokeStyle = 'rgba(80,140,210,0.35)'; ctx.lineWidth = 1 * unit; for (let i = 0; i < lines.length; i++) { const yy = y0 + pad + i * lh + fs * 0.22; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + W, yy); ctx.stroke(); } ctx.strokeStyle = 'rgba(220,70,70,0.45)'; ctx.beginPath(); ctx.moveTo(x0 + pad * 0.6, y0); ctx.lineTo(x0 + pad * 0.6, y0 + Hh); ctx.stroke(); }
    }
    ctx.restore();
  }
  ctx.save();
  if (paper !== 'none') { ctx.beginPath(); ctx.rect(x0, y0 - fs, W, Hh + fs * 2); ctx.clip(); }
  if (paper === 'none') { ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 6 * unit; ctx.shadowOffsetY = 1 * unit; }
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  for (const e of typed) {
    if (e.kind === 'r' || e.kind === 's') continue;
    const age = tau - e.t;
    const h = hashStr(`${L.id}:${e.line}:${e.col}`);
    const r1 = (h % 1000) / 1000, r2 = ((h >>> 10) % 1000) / 1000, r3 = ((h >>> 20) % 1000) / 1000;
    const x = x0 + pad + lineOff(e.line) + e.col * adv, y = y0 + pad + e.line * lh + fs * 0.8;
    // strike: the slug hits hard, the letter settles in a few frames
    const press = tm.edit ? 1 : seg(age, 0, 0.06);
    const sc2 = 1 + (1 - press) * 0.18;
    const inkA = s.ink !== false ? 0.72 + r1 * 0.28 : 1;
    ctx.save();
    ctx.translate(x + adv / 2, y - fs * 0.3);
    ctx.rotate(s.ink !== false ? (r2 - 0.5) * 0.035 : 0);
    ctx.scale(sc2, sc2);
    ctx.translate(-adv / 2, fs * 0.3 + (s.ink !== false ? (r3 - 0.5) * fs * 0.05 : 0));
    ctx.fillStyle = ink;
    ctx.globalAlpha *= inkA * (0.55 + 0.45 * press);
    ctx.fillText(e.ch, 0, 0);
    if (s.ink !== false && r2 > 0.55) { ctx.globalAlpha *= 0.28; ctx.fillText(e.ch, 0.6 * unit * sz, 0.3 * unit * sz); }
    ctx.restore();
  }
  // cursor
  if ((s.caret || 'bar') !== 'none' && !tm.edit) {
    const idle = last ? tau - last.t : tau;
    const done = !sc.list.length || tau >= sc.total;
    const on = idle < 0.35 || Math.floor(tau * 2.2) % 2 === 0;
    if (on && !(done && tau > sc.total + 2.5)) {
      const line = Math.min(lines.length - 1, curLine);
      const colX = last?.kind === 'r' ? last.col * (1 - glide) : curCol;
      const x = x0 + pad + lineOff(line) + colX * adv, y = y0 + pad + line * lh;
      ctx.fillStyle = s.caret === 'block' ? ink : (paper === 'none' || paper === 'dark' ? '#ffd23f' : '#b22222');
      ctx.globalAlpha *= s.caret === 'block' ? 0.55 : 0.9;
      if (s.caret === 'block') ctx.fillRect(x, y - fs * 0.02, adv, fs * 1.0);
      else if (s.caret === 'under') ctx.fillRect(x, y + fs * 0.92, adv, fs * 0.08);
      else ctx.fillRect(x, y, Math.max(1.5, fs * 0.07), fs * 1.0);
    }
  }
  ctx.restore();
  ctx.restore();
}
