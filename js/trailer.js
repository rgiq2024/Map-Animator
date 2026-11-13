// Trailer typography with its own sound effects:
//   slate       — location slate typed letter by letter (yellow kicker + white title, place on the left), digital ticks
//   trailercard — wide metallic title card on black (“A MAJOR / MOVIE EVENT”), trailer boom
//   movietitle  — big condensed metal title + spaced coloured subtitle over embers and fire glow, braam + hit
//   billing     — credits block (SCREENPLAY BY / names …), soft whoosh
//   hacktext    — glowing boxed text that decodes, a password field, or dossier fields, keyboard + beeps
// No imports from sfx.js (sfx.js imports the sound timelines from here).
import { placeAt } from './place.js';
import { H } from './cartofx.js';
import { brandLowerSafe } from './branding.js';
import { TW_KIND, TW_ANIM, TW_DEFAULT, TW_FORM, typewriterSounds, drawTypewriter } from './typewriter.js';
import { DOSSIER_KIND, DOSSIER_ANIM, DOSSIER_DEFAULT, DOSSIER_FORM, dossierSounds, drawDossier } from './dossier.js';

const { clamp, easeOut } = H;
const COND = '"Barlow Condensed","Oswald","Arial Narrow",sans-serif';
const WIDE = '"Syncopate","Michroma","Orbitron","Eurostile","Arial Black",sans-serif';
const WIDE2 = '"Michroma","Syncopate","Orbitron",sans-serif';
const TALL = '"Anton","Oswald","Bebas Neue","Impact",sans-serif';
const seg = (u, a, b) => clamp((u - a) / Math.max(1e-6, b - a), 0, 1);
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const hexA = (hex, a) => { const h = String(hex || '#ffffff').replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export const TRAILER_FONTS = ['Barlow Condensed', 'Syncopate', 'Michroma', 'Anton'];

// ---------------------------------------------------------------- registry
export const TR_KINDS = {
  slate: { name: 'Location slate (typed)', icon: '⌨', geom: null, desc: 'Thriller-style slate typed letter by letter — yellow kicker over a white spaced title, optional place on the left, with digital typing ticks' },
  trailercard: { name: 'Trailer title card', icon: '🎬', geom: null, desc: 'Wide metallic words on black with a slow push and a light sweep — “A MAJOR / MOVIE EVENT” — with a trailer boom' },
  movietitle: { name: 'Movie title + embers', icon: '🔥', geom: null, desc: 'Big condensed metal title with a spaced coloured subtitle over drifting embers and fire glow, with a braam and hit' },
  billing: { name: 'Credits block', icon: '≡', geom: null, desc: 'Billing block — small “SCREENPLAY BY” labels over wide bold names, grouped' },
  hacktext: { name: 'Hacker text', icon: '⌁', geom: null, desc: 'Glowing boxed text that decodes letter by letter, a password field typing stars, or dossier fields — keyboard, glitch and beeps' },
};
Object.assign(TR_KINDS, DOSSIER_KIND, TW_KIND);
export const TEXT_SFX = new Set(Object.keys(TR_KINDS));
export const TR_ANIMS = {
  ...DOSSIER_ANIM,
  ...TW_ANIM,
  slate: { type: 'Typed letter by letter', fade: 'Fade in', none: 'Shown' },
  trailercard: { push: 'Fade up + slow push', tracking: 'Letters close in', flash: 'Flash then settle', none: 'Shown' },
  movietitle: { reveal: 'Rises out of the blur', fade: 'Fade in', none: 'Shown' },
  billing: { fade: 'Fade in', rise: 'Rise in', none: 'Shown' },
  hacktext: { decode: 'Decodes / types', fade: 'Fade in', none: 'Shown' },
};
export const TR_DEFAULTS = {
  ...DOSSIER_DEFAULT,
  ...TW_DEFAULT,
  slate: { anim: 'type', duration: 5, style: { kicker: 'CLOSED SESSION', title: 'SENATE INTELLIGENCE COMMITTEE', place: '', align: 'right', kickerColor: '#dfe34a', color: '#ffffff', size: 1, speed: 24, spacing: 0.14, typeOut: true, shade: true, sound: true } },
  trailercard: { anim: 'push', duration: 3.6, style: { top: 'A MAJOR', main: 'MOVIE EVENT', sub: '', bg: 'black', metal: true, color: '#e9ebef', size: 1, sweep: true, sound: true, boom: true } },
  movietitle: { anim: 'reveal', duration: 5.5, style: { pre: "TOM CLANCY'S", title: 'JACK RYAN', sub: 'GHOST WAR', subColor: '#e2601b', glow: '#ff5a14', bg: 'fire', embers: true, size: 1, sound: true } },
  billing: { anim: 'fade', duration: 4, style: { text: 'SCREENPLAY BY\nAARON RABIN\nand\nJOHN KRASINSKI\n\nSTORY BY\nNOAH OPPENHEIM\nand\nJOHN KRASINSKI\n\nDIRECTED BY\nANDREW BERNSTEIN', bg: 'black', color: '#f2f3f5', size: 1, sound: true } },
  hacktext: { anim: 'decode', duration: 3.4, style: { variant: 'box', line1: 'SEASON 3 TRAILER', line2: 'COMING THURSDAY', color: '#3fb6ff', fields: 'NAME|Jack Ryan\nLAST KNOWN LOCATION|Santorini, Greece\nWANTED FOR|Murder', badge: 'RED NOTICE', passLen: 12, result: 'ACCESS GRANTED', size: 1, bg: 'none', sound: true } },
};
const BGS = { black: 'Black card', dim: 'Darken the map', none: 'Over the map' };
export const TR_FORMS = {
  ...DOSSIER_FORM,
  ...TW_FORM,
  slate: [
    ['style.kicker', 'Kicker (yellow line)', 'text'], ['style.title', 'Title', 'text'], ['style.place', 'Place on the other side (optional)', 'text'],
    ['style.align', 'Side', 'select', { right: 'Bottom right', left: 'Bottom left', center: 'Bottom centre' }],
    ['style.kickerColor', 'Kicker colour', 'color'], ['style.color', 'Title colour', 'color'], ['style.size', 'Size', 'range', [0.4, 3, 0.05]],
    ['style.speed', 'Typing speed (letters / s)', 'range', [6, 60, 1]], ['style.spacing', 'Letter spacing', 'range', [0, 0.5, 0.01]],
    ['style.typeOut', 'Delete the letters at the end', 'switch'], ['style.shade', 'Soft shadow', 'switch'], ['style.sound', 'Typing sound', 'switch'],
  ],
  trailercard: [
    ['style.top', 'Small top line', 'text'], ['style.main', 'Big line (new line = second row)', 'textarea'], ['style.sub', 'Small line underneath', 'text'],
    ['style.bg', 'Background', 'select', BGS], ['style.metal', 'Metal finish', 'switch'], ['style.color', 'Colour', 'color'], ['style.sweep', 'Light sweep', 'switch'],
    ['style.size', 'Size', 'range', [0.4, 3, 0.05]], ['style.sound', 'Sound', 'switch'], ['style.boom', 'Trailer boom (off = whoosh only)', 'switch', null, (L) => L.style.sound !== false],
  ],
  movietitle: [
    ['style.pre', 'Line above', 'text'], ['style.title', 'Title', 'text'], ['style.sub', 'Subtitle (spaced)', 'text'], ['style.subColor', 'Subtitle colour', 'color'],
    ['style.bg', 'Background', 'select', { fire: 'Fire glow', black: 'Black', none: 'Over the map' }], ['style.glow', 'Glow colour', 'color'], ['style.embers', 'Embers', 'switch'],
    ['style.size', 'Size', 'range', [0.4, 3, 0.05]], ['style.sound', 'Sound', 'switch'],
  ],
  billing: [
    ['style.text', 'Credits — one line each; small lines: “… BY” and “and”; empty line = new group', 'textarea'],
    ['style.bg', 'Background', 'select', BGS], ['style.color', 'Colour', 'color'], ['style.size', 'Size', 'range', [0.4, 3, 0.05]], ['style.sound', 'Sound', 'switch'],
  ],
  hacktext: [
    ['style.variant', 'Look', 'select', { box: 'Glowing box — text decodes', password: 'Password field (stars + lock)', fields: 'Dossier fields + red badge' }],
    ['style.line1', 'Small line', 'text', null, (L) => L.style.variant === 'box'], ['style.line2', 'Big line', 'text', null, (L) => L.style.variant === 'box'],
    ['style.passLen', 'Password length', 'range', [3, 24, 1], (L) => L.style.variant === 'password'], ['style.result', 'Then show', 'text', null, (L) => L.style.variant === 'password'],
    ['style.fields', 'Fields — LABEL|value, one per line', 'textarea', null, (L) => L.style.variant === 'fields'], ['style.badge', 'Badge text', 'text', null, (L) => L.style.variant === 'fields'],
    ['style.color', 'Colour', 'color'], ['style.bg', 'Background', 'select', BGS], ['style.size', 'Size', 'range', [0.4, 3, 0.05]], ['style.sound', 'Sound', 'switch'],
  ],
};
export const TR_SET = TEXT_SFX;
export const trPhases = () => ['captions'];

// ---------------------------------------------------------------- timelines (shared by drawing and sound)
function slateTL(L) {
  const s = L.style, D = Math.max(0.5, +L.duration || 5);
  const k = String(s.kicker || ''), t = String(s.title || ''), pl = String(s.place || '');
  let cps = +s.speed || 24;
  const typed = Math.max(k.length, pl.length) + t.length;
  if (typed / cps > D * 0.6) cps = typed / (D * 0.6);
  const out = s.typeOut !== false ? Math.min(0.9, Math.max(0.35, (k.length + t.length) / 70)) : 0;
  return { D, cps, k0: 0.05, kDur: k.length / cps, p0: 0.05, pDur: pl.length / cps, t0: 0.05 + k.length / cps * 0.6, tDur: t.length / cps, out, outAt: D - out, n: { k: k.length, t: t.length, p: pl.length } };
}
function hackTL(L) {
  const s = L.style, D = Math.max(0.5, +L.duration || 3.4);
  if (s.variant === 'password') { const n = Math.max(1, Math.round(+s.passLen || 12)); return { D, a: 0.35, dur: Math.min(D * 0.5, n * 0.11), n, ok: Math.min(D - 0.4, 0.35 + Math.min(D * 0.5, n * 0.11) + 0.35) }; }
  if (s.variant === 'fields') {
    const rows = String(s.fields || '').split('\n').filter((x) => x.trim()).map((r) => r.split('|'));
    let t = 0.5; const per = rows.map((r) => { const v = String(r[1] || ''), d = Math.max(0.25, v.length / 16); const o = { t, d, n: v.length }; t += d + 0.15; return o; });
    return { D, rows, per };
  }
  const n = String(s.line1 || '').length + String(s.line2 || '').length;
  return { D, box: 0.3, t0: 0.3, dur: Math.min(D * 0.55, Math.max(0.4, n / 22)), n };
}
/** sound events (layer time) for a text layer */
export function trailerSoundEvents(L) {
  const s = L.style || {}, t0 = +L.start || 0, vol = s.soundVol ?? 1, ev = [];
  if (s.sound === false || L.anim === 'none') return ev;
  const P = (t, type, p = {}) => ev.push({ t: t0 + t, type, p: { vol, ...p, vol: (p.vol ?? 1) * vol } });
  if (L.kind === 'slate') {
    const T = slateTL(L);
    if (T.n.p) P(T.p0, 'ticks', { n: T.n.p, dur: T.pDur, vol: 0.7 });
    if (T.n.k) P(T.k0, 'ticks', { n: T.n.k, dur: T.kDur, vol: 0.8 });
    if (T.n.t) P(T.t0, 'ticks', { n: T.n.t, dur: T.tDur });
    if (T.out) P(T.outAt, 'ticks', { n: Math.min(40, T.n.k + T.n.t), dur: T.out, vol: 0.45 });
  } else if (L.kind === 'trailercard') {
    if (s.boom !== false) P(0.02, 'boom', { vol: 0.9 });
    P(0, 'whoosh', { dur: 0.9, dir: 'down', vol: 0.35 });
  } else if (L.kind === 'movietitle') {
    P(0, 'braam', { dur: 4, vol: 0.7 }); P(0.05, 'hit', { vol: 0.8 }); P(0.05, 'boom', { vol: 0.5 });
    if (s.sub) P(1.3, 'swoosh', { vol: 0.5 });
  } else if (L.kind === 'billing') {
    P(0, 'whoosh', { dur: 1.2, dir: 'down', vol: 0.4 });
  } else if (L.kind === 'dossierhud') {
    dossierSounds(L, P);
  } else if (L.kind === 'typewriter') {
    typewriterSounds(L, P);
  } else if (L.kind === 'hacktext') {
    const T = hackTL(L);
    if (s.variant === 'password') { P(0.05, 'click', { vol: 0.8 }); P(T.a, 'keys', { n: T.n, dur: T.dur, enter: true }); P(T.ok, 'granted', {}); }
    else if (s.variant === 'fields') { P(0.1, 'glitch', { dur: 0.3, vol: 0.5 }); P(0.2, 'beep', { freq: 880, vol: 0.5 }); T.per.forEach((r) => r.n && P(r.t, 'keys', { n: r.n, dur: r.d, vol: 0.8 })); }
    else { P(0, 'glitch', { dur: 0.35, vol: 0.7 }); P(T.t0, 'decode', { dur: T.dur, vol: 0.8 }); }
  }
  return ev;
}

// ---------------------------------------------------------------- helpers
function spacedWidth(ctx, txt, sp) { let w = 0; for (const ch of txt) w += ctx.measureText(ch).width + sp; return Math.max(0, w - sp); }
function spacedText(ctx, txt, x, y, sp, align = 'left', n = Infinity) {
  const W = spacedWidth(ctx, txt, sp);
  let cx = align === 'right' ? x - W : align === 'center' ? x - W / 2 : x;
  const sa = ctx.textAlign; ctx.textAlign = 'left';
  let i = 0;
  for (const ch of txt) { if (i++ >= n) break; ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + sp; }
  ctx.textAlign = sa;
  return W;
}
function cardBg(ctx, fr, bg, a) {
  if (bg === 'black') { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); }
  else if (bg === 'dim') {
    const g = ctx.createRadialGradient(fr.x + fr.w / 2, fr.y + fr.h / 2, fr.h * 0.1, fr.x + fr.w / 2, fr.y + fr.h / 2, fr.w * 0.7);
    g.addColorStop(0, `rgba(0,0,0,${0.55 * a})`); g.addColorStop(1, `rgba(0,0,0,${0.9 * a})`);
    ctx.fillStyle = g; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
  }
}
const offs = new Map();
function off(key, w, h) {
  let c = offs.get(key);
  if (!c) { c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); offs.set(key, c); }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
  return [c, g];
}
/** metal fill for a text block between y0 and y1 */
function metal(ctx, y0, y1, base = '#e9ebef') {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.42, base); g.addColorStop(0.5, '#8f959e'); g.addColorStop(0.58, '#d8dce2'); g.addColorStop(1, '#7c828b');
  return g;
}

// ---------------------------------------------------------------- slate
function drawSlate(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, unit = o.unit, sz = +s.size || 1;
  const T = slateTL(L), tau = tm.edit || L.anim === 'none' ? T.D * 0.6 : tm.tau;
  if (s.typeOut !== false && tau > T.D && !tm.edit) return;
  const sp = (+s.spacing || 0) * 22 * unit * sz;
  const fK = 16 * unit * sz, fT = 23 * unit * sz;
  const typing = L.anim === 'type' && !tm.edit;
  const shown = (len, start, dur) => (typing ? Math.floor(clamp((tau - start) / Math.max(1e-3, dur), 0, 1) * len + 1e-6) : len);
  const k = String(s.kicker || ''), t = String(s.title || ''), pl = String(s.place || '');
  let nk = shown(k.length, T.k0, T.kDur), nt = shown(t.length, T.t0, T.tDur), np = shown(pl.length, T.p0, T.pDur);
  if (s.typeOut !== false && typing && tau > T.outAt) {
    // delete from the end: title first, then the kicker
    const left = 1 - clamp((tau - T.outAt) / T.out, 0, 1), tot = k.length + t.length;
    const keep = Math.floor(left * tot);
    nt = Math.max(0, Math.min(nt, keep - k.length)); nk = Math.min(nk, keep); np = Math.min(np, Math.floor(left * pl.length));
  }
  const a = (L.anim === 'fade' && !tm.edit ? clamp(tau / 0.6, 0, 1) : 1) * tm.alpha;
  const W = fr.w * 0.9, Hh = fT * 2.6;
  const x0 = fr.x + fr.w * 0.05, y0 = fr.y + fr.h - Hh - fr.h * Math.max(0.07, brandLowerSafe());
  ctx.save();
  placeAt(ctx, L, fr, x0, y0, W, Hh, { key: 'slate' });
  ctx.globalAlpha *= a;
  ctx.textBaseline = 'alphabetic';
  if (s.shade !== false) { ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 8 * unit; ctx.shadowOffsetY = 1 * unit; }
  const al = s.align || 'right';
  const ax = al === 'right' ? x0 + W : al === 'center' ? x0 + W / 2 : x0;
  const yK = y0 + fK + 2 * unit, yT = yK + fT * 1.18;
  ctx.font = `600 ${fK}px ${COND}`; ctx.fillStyle = s.kickerColor || '#dfe34a';
  if (k) spacedText(ctx, k, ax, yK, sp * 0.85, al, nk);
  ctx.font = `600 ${fT}px ${COND}`; ctx.fillStyle = s.color || '#ffffff';
  if (t) {
    // keep the full width when right-aligned, so letters appear left → right in place
    if (al === 'right') { const Wf = spacedWidth(ctx, t, sp); spacedText(ctx, t, ax - Wf, yT, sp, 'left', nt); }
    else if (al === 'center') { const Wf = spacedWidth(ctx, t, sp); spacedText(ctx, t, ax - Wf / 2, yT, sp, 'left', nt); }
    else spacedText(ctx, t, ax, yT, sp, 'left', nt);
  }
  if (pl) {
    ctx.font = `600 ${fT}px ${COND}`; ctx.fillStyle = s.color || '#ffffff';
    const px = al === 'left' ? x0 + W : x0, pa = al === 'left' ? 'right' : 'left';
    if (pa === 'right') { const Wf = spacedWidth(ctx, pl, sp); spacedText(ctx, pl, px - Wf, yT, sp, 'left', np); } else spacedText(ctx, pl, px, yT, sp, 'left', np);
  }
  // right-aligned kicker: also type left → right in place
  ctx.restore();
}

// ---------------------------------------------------------------- trailer card
function drawCard(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, unit = o.unit, sz = +s.size || 1;
  const D = Math.max(0.5, +L.duration || 3.6), tau = tm.edit || L.anim === 'none' ? D * 0.5 : tm.tau;
  if (tau > D && !tm.edit) return;
  const fin = L.anim === 'none' || tm.edit ? 1 : smooth(seg(tau, 0, 0.55)), fout = tm.edit ? 1 : 1 - smooth(seg(tau, D - 0.5, D));
  const a = Math.min(fin, fout) * tm.alpha;
  ctx.save();
  cardBg(ctx, fr, s.bg || 'black', (s.bg === 'black' ? Math.min(1, fin * 1.4) * fout : a) * tm.alpha);
  const lines = String(s.main || '').split('\n').filter(Boolean);
  const fMain = 56 * unit * sz, fTop = 26 * unit * sz, fSub = 12 * unit * sz;
  const u = clamp(tau / D, 0, 1);
  const k = L.anim === 'push' ? 1 + 0.06 * u : 1;
  const track = L.anim === 'tracking' ? (1 - smooth(seg(tau, 0, 1.6))) * 18 * unit * sz : 0;
  const flash = L.anim === 'flash' && !tm.edit ? Math.max(0, 1 - tau / 0.35) : 0;
  const cx = fr.x + fr.w / 2;
  const blockH = (s.top ? fTop * 1.25 : 0) + lines.length * fMain * 1.02 + (s.sub ? fSub * 3 : 0);
  let y = fr.y + fr.h / 2 - blockH / 2;
  // draw text into an offscreen so the light sweep only touches the letters
  const S = Math.max(1, Math.abs(ctx.getTransform().a) || 1);
  const bw = Math.ceil(fr.w * S), bh = Math.ceil((blockH + fMain) * S);
  const [C, g] = off(`${L.id}:card`, bw, bh);
  g.scale(S, S); g.translate(-fr.x, -(y - fMain * 0.5));
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  const line = (txt, f, font, fill, sp) => { g.font = `700 ${f}px ${font}`; g.fillStyle = fill; spacedText(g, txt, cx, y + f, sp, 'center'); y += f * 1.02; };
  const fillOf = (y0, h) => (s.metal !== false ? metal(g, y0, y0 + h, s.color) : s.color || '#ffffff');
  const yTop = y;
  if (s.top) { line(String(s.top), fTop, WIDE, fillOf(y, fTop), 2 * unit + track * 0.6); y += fTop * 0.23; }
  for (const ln of lines) line(ln, fMain, WIDE, fillOf(y, fMain), 1.5 * unit + track);
  if (s.sub) { y += fSub * 1.6; g.font = `400 ${fSub}px "Inter",sans-serif`; g.fillStyle = 'rgba(255,255,255,0.85)'; spacedText(g, String(s.sub), cx, y, 1.2 * unit, 'center'); }
  if (s.sweep !== false && !tm.edit) {
    const p = seg(tau, 0.5, Math.min(D - 0.3, 2.6));
    if (p > 0 && p < 1) {
      g.globalCompositeOperation = 'source-atop';
      const sx = fr.x + fr.w * (0.15 + 0.7 * p);
      const gr = g.createLinearGradient(sx - 80 * unit, yTop, sx + 80 * unit, yTop + blockH);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(fr.x, yTop - fMain, fr.w, blockH + fMain * 2);
      g.globalCompositeOperation = 'source-over';
    }
  }
  ctx.globalAlpha *= a;
  ctx.translate(cx, fr.y + fr.h / 2); ctx.scale(k, k); ctx.translate(-cx, -(fr.y + fr.h / 2));
  ctx.shadowColor = 'rgba(255,255,255,0.18)'; ctx.shadowBlur = 14 * unit;
  ctx.drawImage(C, fr.x, yTop - fMain * 0.5, fr.w, bh / S);
  ctx.restore();
  if (flash > 0) { ctx.save(); ctx.fillStyle = `rgba(255,255,255,${flash * 0.85 * tm.alpha})`; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); ctx.restore(); }
}

// ---------------------------------------------------------------- movie title with embers
function drawMovieTitle(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, unit = o.unit, sz = +s.size || 1;
  const D = Math.max(0.5, +L.duration || 5.5), tau = tm.edit || L.anim === 'none' ? D * 0.6 : tm.tau;
  if (tau > D && !tm.edit) return;
  const fout = tm.edit ? 1 : 1 - smooth(seg(tau, D - 0.6, D));
  const fin = L.anim === 'none' || tm.edit ? 1 : smooth(seg(tau, 0, 1.2));
  const time = (o.time ?? tau);
  const cx = fr.x + fr.w / 2, cy = fr.y + fr.h * 0.48;
  ctx.save();
  ctx.globalAlpha *= tm.alpha * fout;
  if (s.bg === 'black' || s.bg === 'fire') { ctx.fillStyle = '#000'; ctx.globalAlpha *= Math.min(1, fin * 2 + 0.0001) || 1; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); ctx.globalAlpha = tm.alpha * fout; }
  if (s.bg === 'fire') {
    const glow = s.glow || '#ff5a14';
    for (const [x, y, r, a] of [[0.5, 1.15, 0.75, 0.55], [0.15, 1.05, 0.35, 0.4], [0.85, 1.1, 0.4, 0.45], [0.5, 0.55, 0.45, 0.12]]) {
      const fl = 0.85 + 0.15 * Math.sin(time * 2.3 + x * 9);
      const gr = ctx.createRadialGradient(fr.x + fr.w * x, fr.y + fr.h * y, 0, fr.x + fr.w * x, fr.y + fr.h * y, fr.w * r);
      gr.addColorStop(0, hexA(glow, a * fl * fin)); gr.addColorStop(1, hexA(glow, 0));
      ctx.fillStyle = gr; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
    }
    // smoke darkening at the top
    const sm = ctx.createLinearGradient(0, fr.y, 0, fr.y + fr.h * 0.6); sm.addColorStop(0, 'rgba(0,0,0,0.7)'); sm.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sm; ctx.fillRect(fr.x, fr.y, fr.w, fr.h * 0.6);
  }
  if (s.embers !== false) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 70; i++) {
      const life = 3 + hash(i) * 4, ph = ((time + hash(i + 9) * life) % life) / life;
      const x = fr.x + fr.w * (hash(i + 3) + Math.sin(time * 0.7 + i) * 0.02 + ph * (hash(i + 5) - 0.5) * 0.2);
      const y = fr.y + fr.h * (1.05 - ph * (0.6 + hash(i + 7) * 0.6));
      const r = (0.8 + hash(i + 11) * 2.2) * unit;
      const a = Math.sin(ph * Math.PI) * (0.5 + 0.5 * Math.sin(time * 9 + i)) * fin;
      ctx.fillStyle = `rgba(255,${140 + Math.round(hash(i + 13) * 90)},40,${a})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  // title
  const fT = 112 * unit * sz, fPre = 15 * unit * sz, fSub = 34 * unit * sz;
  const rise = L.anim === 'reveal' && !tm.edit ? (1 - smooth(seg(tau, 0, 1.6))) : 0;
  const blur = rise * 14 * unit;
  ctx.save();
  placeAt(ctx, L, fr, cx - fr.w * 0.35, cy - fT, fr.w * 0.7, fT * 1.8, { key: 'title' });
  ctx.globalAlpha *= L.anim === 'fade' && !tm.edit ? fin : 1 - rise * 0.9;
  if (blur > 0.3) ctx.filter = `blur(${blur.toFixed(1)}px)`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const ty = cy + fT * 0.35 + rise * 30 * unit;
  if (s.pre) { ctx.font = `700 ${fPre}px ${WIDE2}`; ctx.fillStyle = '#e8e9ec'; spacedText(ctx, String(s.pre), cx, ty - fT * 0.92, 3 * unit, 'center'); }
  ctx.font = `400 ${fT}px ${TALL}`;
  ctx.fillStyle = metal(ctx, ty - fT * 0.85, ty, '#dfe2e6');
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 12 * unit; ctx.shadowOffsetY = 3 * unit;
  ctx.fillText(String(s.title || ''), cx, ty);
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.lineWidth = 1 * unit; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.strokeText(String(s.title || ''), cx, ty);
  ctx.restore();
  if (s.sub) {
    const kS = tm.edit ? 1 : smooth(seg(tau, 1.1, 2.2));
    if (kS > 0) {
      ctx.save(); ctx.globalAlpha *= kS;
      ctx.font = `400 ${fSub}px ${TALL}`; ctx.textBaseline = 'alphabetic';
      const sp = (0.55 + (1 - kS) * 0.5) * fSub;
      const col = s.subColor || '#e2601b';
      const gr = ctx.createLinearGradient(0, cy + fT * 0.45, 0, cy + fT * 0.45 + fSub); gr.addColorStop(0, '#ffb070'); gr.addColorStop(0.5, col); gr.addColorStop(1, '#7a2a08');
      ctx.fillStyle = gr; ctx.shadowColor = hexA(col, 0.7); ctx.shadowBlur = 10 * unit;
      const yS = cy + fT * 0.45 + fSub * 1.05;
      const Wd = spacedWidth(ctx, String(s.sub), sp);
      spacedText(ctx, String(s.sub), cx, yS, sp, 'center');
      // thin rules either side
      ctx.shadowBlur = 0; ctx.strokeStyle = hexA(col, 0.8); ctx.lineWidth = 1.5 * unit;
      ctx.beginPath(); ctx.moveTo(cx - Wd / 2 - fSub * 1.2, yS - fSub * 0.35); ctx.lineTo(cx - Wd / 2 - fSub * 0.4, yS - fSub * 0.35); ctx.moveTo(cx + Wd / 2 + fSub * 0.4, yS - fSub * 0.35); ctx.lineTo(cx + Wd / 2 + fSub * 1.2, yS - fSub * 0.35); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- credits block
function drawBilling(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, unit = o.unit, sz = (+s.size || 1) * 1.35;
  const D = Math.max(0.5, +L.duration || 4), tau = tm.edit || L.anim === 'none' ? D * 0.5 : tm.tau;
  if (tau > D && !tm.edit) return;
  const fin = L.anim === 'none' || tm.edit ? 1 : smooth(seg(tau, 0, 0.7)), fout = tm.edit ? 1 : 1 - smooth(seg(tau, D - 0.5, D));
  ctx.save();
  cardBg(ctx, fr, s.bg || 'black', (s.bg === 'black' ? Math.min(1, fin * 1.5) : fin) * fout * tm.alpha);
  const lines = String(s.text || '').split('\n');
  const fN = 15 * unit * sz, fL = 6.5 * unit * sz;
  const small = (ln) => /\bBY$/i.test(ln.trim()) || /^(and|&)$/i.test(ln.trim());
  let h = 0; for (const ln of lines) h += !ln.trim() ? fN * 0.9 : small(ln) ? fL * 1.7 : fN * 1.3;
  let y = fr.y + fr.h / 2 - h / 2;
  const cx = fr.x + fr.w / 2;
  ctx.globalAlpha *= Math.min(fin, fout) * tm.alpha;
  if (L.anim === 'rise' && !tm.edit) ctx.translate(0, (1 - fin) * 20 * unit);
  ctx.textBaseline = 'alphabetic';
  for (const ln of lines) {
    if (!ln.trim()) { y += fN * 0.9; continue; }
    if (small(ln)) { ctx.font = `400 ${fL}px ${WIDE2}`; ctx.fillStyle = hexA(s.color || '#f2f3f5', 0.85); y += fL * 1.7; spacedText(ctx, ln.trim().toUpperCase() === ln.trim() ? ln.trim() : ln.trim().toUpperCase(), cx, y - fL * 0.5, 1.2 * unit, 'center'); }
    else { ctx.font = `700 ${fN}px ${WIDE}`; ctx.fillStyle = s.color || '#f2f3f5'; y += fN * 1.3; spacedText(ctx, ln.trim().toUpperCase(), cx, y - fN * 0.2, 1 * unit, 'center'); }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- hacker text
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@/<>*+=';
function lock(ctx, x, y, r, col) {
  ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = r * 0.28;
  ctx.beginPath(); ctx.arc(x, y - r * 0.35, r * 0.55, Math.PI, 0); ctx.stroke();
  ctx.fillRect(x - r * 0.8, y - r * 0.35, r * 1.6, r * 1.25);
  ctx.restore();
}
function globe(ctx, x, y, r, col) {
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = r * 0.08;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x, y, r * 0.45, r, 0, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x - r * 0.85, y - r * 0.5); ctx.lineTo(x + r * 0.85, y - r * 0.5); ctx.moveTo(x - r * 0.85, y + r * 0.5); ctx.lineTo(x + r * 0.85, y + r * 0.5); ctx.stroke();
  ctx.restore();
}
function drawHack(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, unit = o.unit, sz = (+s.size || 1) * (s.variant === 'box' || !s.variant ? 1.45 : 1.8);
  const T = hackTL(L), tau = tm.edit || L.anim === 'none' ? T.D : tm.tau;
  const fin = L.anim === 'fade' && !tm.edit ? smooth(seg(tau, 0, 0.5)) : 1;
  const col = s.color || '#3fb6ff';
  const frameNo = Math.floor((o.time ?? tau) * 30);
  ctx.save();
  cardBg(ctx, fr, s.bg || 'none', tm.alpha);
  ctx.globalAlpha *= fin * tm.alpha;
  const cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2;
  if ((s.variant || 'box') === 'box') {
    const l1 = String(s.line1 || ''), l2 = String(s.line2 || '');
    const f1 = 15 * unit * sz, f2 = 24 * unit * sz;
    ctx.font = `700 ${f2}px ${WIDE2}`; const w2 = spacedWidth(ctx, l2, 1.5 * unit);
    ctx.font = `700 ${f1}px ${WIDE2}`; const w1 = spacedWidth(ctx, l1, 1.5 * unit);
    const W = Math.max(w1, w2) + 40 * unit, Hh = f1 + f2 + 34 * unit;
    let bx = cx - W / 2, by = cy - Hh / 2;
    const [dx, dy] = placeAt(ctx, L, fr, bx, by, W, Hh, { key: 'box' }); void dx; void dy;
    const kb = tm.edit ? 1 : easeOut(seg(tau, 0, T.box));
    // occasional glitch slice offset
    const glitch = !tm.edit && tau < T.t0 + T.dur + 0.3 && hash(frameNo) < 0.18 ? (hash(frameNo + 1) - 0.5) * 14 * unit : 0;
    ctx.save(); ctx.translate(glitch, 0);
    ctx.strokeStyle = col; ctx.lineWidth = 2.2 * unit; ctx.shadowColor = col; ctx.shadowBlur = 16 * unit;
    ctx.fillStyle = hexA(col, 0.1);
    const w = W * kb;
    ctx.beginPath(); ctx.rect(cx - w / 2, by, w, Hh); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 8 * unit;
    const n = l1.length + l2.length, shown = tm.edit ? n : clamp((tau - T.t0) / T.dur, 0, 1) * n;
    const glyph = (txt, startIdx) => [...txt].map((ch, i) => { const k = startIdx + i; if (k < shown - 1.5 || ch === ' ') return ch; if (k < shown) return GLYPHS[Math.floor(hash(k * 7 + frameNo) * GLYPHS.length)]; return ''; }).join('');
    ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#e8f6ff';
    ctx.font = `700 ${f1}px ${WIDE2}`;
    if (kb > 0.95) {
      const g1 = glyph(l1, 0), g2 = glyph(l2, l1.length);
      ctx.fillStyle = hexA('#d8f0ff', 0.92); spacedText(ctx, g1.padEnd(l1.length, ' '), cx, by + 12 * unit + f1, 1.5 * unit, 'center');
      ctx.font = `700 ${f2}px ${WIDE2}`; ctx.fillStyle = '#ffffff';
      // keep letters in place while decoding: draw from the full width
      const wf = spacedWidth(ctx, l2, 1.5 * unit);
      spacedText(ctx, g2, cx - wf / 2, by + 16 * unit + f1 + f2, 1.5 * unit, 'left');
    }
    ctx.restore();
  } else if (s.variant === 'password') {
    const W = 300 * unit * sz, Hh = 30 * unit * sz;
    const bx = cx - W / 2, by = cy - Hh / 2;
    placeAt(ctx, L, fr, bx, by, W, Hh + 40 * unit * sz, { key: 'field' });
    ctx.fillStyle = 'rgba(120,20,34,0.45)'; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5 * unit;
    ctx.fillRect(bx, by, W, Hh); ctx.strokeRect(bx, by, W, Hh);
    lock(ctx, bx + W + 22 * unit * sz, cy + 2 * unit, 8 * unit * sz, '#e9eef5');
    const n = tm.edit ? T.n : Math.floor(clamp((tau - T.a) / T.dur, 0, 1) * T.n);
    ctx.font = `700 ${16 * unit * sz}px "JetBrains Mono",monospace`; ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const stars = '*'.repeat(n);
    ctx.fillText(stars, bx + 10 * unit, cy + 3 * unit);
    if (Math.floor((o.time ?? tau) * 2.5) % 2 === 0 || n < T.n) { const sw = ctx.measureText(stars).width; ctx.fillRect(bx + 12 * unit + sw, cy - 8 * unit * sz, 2 * unit, 16 * unit * sz); }
    // Enter button and result
    const ok = !tm.edit && tau >= T.ok;
    ctx.font = `600 ${8 * unit * sz}px "Inter",sans-serif`; ctx.textAlign = 'center';
    const ebx = cx - 22 * unit * sz, eby = by + Hh + 10 * unit * sz;
    ctx.fillStyle = ok && tau < T.ok + 0.25 ? '#ffffff' : 'rgba(255,255,255,0.18)'; ctx.fillRect(ebx, eby, 44 * unit * sz, 14 * unit * sz);
    ctx.fillStyle = ok && tau < T.ok + 0.25 ? '#000' : '#e5e9ef'; ctx.fillText('Enter', cx, eby + 7.5 * unit * sz);
    if (ok && s.result) {
      const blink = Math.floor((tau - T.ok) * 4) % 2 === 0 || tau - T.ok > 1;
      if (blink) { ctx.font = `700 ${18 * unit * sz}px ${WIDE2}`; ctx.fillStyle = '#4dff8a'; ctx.shadowColor = '#4dff8a'; ctx.shadowBlur = 14 * unit; ctx.fillText(String(s.result), cx, by - 24 * unit * sz); }
    }
  } else {
    // dossier: badge + typed fields
    const x0 = fr.x + fr.w * 0.12, y0 = fr.y + fr.h * 0.22, bw = 70 * unit * sz;
    placeAt(ctx, L, fr, x0, y0, 260 * unit * sz, 300 * unit * sz, { key: 'dossier' });
    const kb = tm.edit ? 1 : easeOut(seg(tau, 0, 0.35));
    ctx.save(); ctx.globalAlpha *= kb;
    ctx.fillStyle = '#9b1d26'; ctx.fillRect(x0, y0, bw, bw * 0.95);
    globe(ctx, x0 + bw / 2, y0 + bw * 0.4, bw * 0.24, 'rgba(255,255,255,0.85)');
    ctx.fillStyle = '#ffffff'; ctx.font = `600 ${6.5 * unit * sz}px "Inter",sans-serif`; ctx.textAlign = 'center';
    String(s.badge || '').split(' ').forEach((wd, i) => ctx.fillText(wd, x0 + bw / 2, y0 + bw * 0.74 + i * 8 * unit * sz));
    ctx.restore();
    let y = y0 + bw * 1.15;
    T.rows.forEach((r, i) => {
      const P = T.per[i];
      const lab = String(r[0] || '').toUpperCase() + ':', val = String(r[1] || '');
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = `600 ${6.5 * unit * sz}px "Inter",sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.75)';
      if (tm.edit || tau >= P.t - 0.2) ctx.fillText(lab, x0, y + 7 * unit * sz);
      const bxw = 110 * unit * sz, bxh = 18 * unit * sz, by = y + 11 * unit * sz;
      if (tm.edit || tau >= P.t - 0.2) { ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2 * unit; ctx.fillStyle = 'rgba(10,14,20,0.55)'; ctx.fillRect(x0, by, bxw, bxh); ctx.strokeRect(x0, by, bxw, bxh); }
      const n = tm.edit ? val.length : Math.floor(clamp((tau - P.t) / P.d, 0, 1) * val.length);
      ctx.font = `500 ${9 * unit * sz}px "Inter",sans-serif`; ctx.fillStyle = '#ffffff';
      const txt = val.slice(0, n);
      ctx.fillText(txt, x0 + 5 * unit, by + bxh * 0.68);
      const typingNow = !tm.edit && tau >= P.t && tau < P.t + P.d + 0.5;
      if (typingNow && Math.floor((o.time ?? tau) * 3) % 2 === 0) ctx.fillRect(x0 + 6 * unit + ctx.measureText(txt).width, by + 4 * unit, 1.2 * unit, bxh - 8 * unit);
      y += 40 * unit * sz;
    });
  }
  ctx.restore();
}

export function drawTrailer(ctx, L, tm, o, phase) {
  if (phase !== 'captions' || !o.frame) return;
  if (L.kind === 'slate') drawSlate(ctx, L, tm, o);
  else if (L.kind === 'trailercard') drawCard(ctx, L, tm, o);
  else if (L.kind === 'movietitle') drawMovieTitle(ctx, L, tm, o);
  else if (L.kind === 'billing') drawBilling(ctx, L, tm, o);
  else if (L.kind === 'hacktext') drawHack(ctx, L, tm, o);
  else if (L.kind === 'dossierhud') drawDossier(ctx, L, tm, o);
  else if (L.kind === 'typewriter') drawTypewriter(ctx, L, tm, o);
}
