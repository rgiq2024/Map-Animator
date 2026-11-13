// Dossier HUD (thriller trailer look): optional password intro, a red-notice badge, typed fields, a photo window
// with a face-recognition reticle, a face close-up inset and a camera caption, a scrolling strip of photos,
// static-noise cuts between photos and an RGB glitch out. Every photo and text is editable; empty photo slots
// show a silhouette until a picture is chosen.
import { placeAt } from './place.js';
import { imageFor } from './geoimage.js';
import { H } from './cartofx.js';
import { brandSafeArea, brandLowerSafe } from './branding.js';

const { clamp, easeOut } = H;
const MONO = '"JetBrains Mono","IBM Plex Mono",ui-monospace,Consolas,monospace';
const SANS = '"Inter","Segoe UI",system-ui,sans-serif';
const LABEL = '"Michroma","Inter",sans-serif';
const seg = (u, a, b) => clamp((u - a) / Math.max(1e-6, b - a), 0, 1);
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const hexA = (hex, a) => { const h = String(hex || '#ffffff').replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

export const DOSSIER_PHOTOS = ['photo1', 'photo2', 'photo3', 'face', 'strip1', 'strip2', 'strip3', 'strip4'];
export const DOSSIER_KIND = { dossierhud: { name: 'Dossier HUD (photos + text)', icon: '🗂', geom: null, desc: 'Thriller dossier screen: red-notice badge, typed fields, a photo window with face reticle and close-up, a scrolling photo strip, static cuts and a glitch out — every photo and text editable' } };
export const DOSSIER_ANIM = { dossierhud: { play: 'Full sequence', fade: 'Fade in', none: 'Shown' } };
export const DOSSIER_DEFAULT = { dossierhud: { anim: 'play', duration: 10, style: {
  intro: true, passLen: 12, badge: 'RED NOTICE', badgeColor: '#9b1d26', fields: 'NAME|Jack Ryan\nLAST KNOWN LOCATION|Santorini, Greece\nWANTED FOR|Murder',
  photo1: '', photo2: '', photo3: '', face: '', strip1: '', strip2: '', strip3: '', strip4: '', per: 2.6,
  caption: 'PLATFORM 007\nCAMERA - 036\nID: 89156131', title: '', reticle: true, faceX: 0.5, faceY: 0.42, mono: true, band: true,
  frameColor: '#6f9fb4', bg: 'dark', glitchOut: true, size: 1, sound: true,
} } };
export const DOSSIER_FORM = { dossierhud: [
  ['style.photo1', 'Main photo 1', 'image'], ['style.photo2', 'Main photo 2 (optional)', 'image'], ['style.photo3', 'Main photo 3 (optional)', 'image'],
  ['style.face', 'Face close-up (top-right inset)', 'image'],
  ['style.strip1', 'Side photo 1', 'image'], ['style.strip2', 'Side photo 2', 'image'], ['style.strip3', 'Side photo 3', 'image'], ['style.strip4', 'Side photo 4', 'image'],
  ['style.fields', 'Fields — LABEL|value, one per line', 'textarea'], ['style.badge', 'Badge text', 'text'], ['style.badgeColor', 'Badge colour', 'color'],
  ['style.caption', 'Camera caption (bottom-left of the photo)', 'textarea'], ['style.title', 'Window title (optional)', 'text'],
  ['style.per', 'Seconds per main photo', 'range', [0.8, 8, 0.1]],
  ['style.faceX', 'Face position ←→ (reticle)', 'range', [0, 1, 0.01], (L) => L.style.reticle !== false], ['style.faceY', 'Face position ↑↓ (reticle)', 'range', [0, 1, 0.01], (L) => L.style.reticle !== false],
  ['style.reticle', 'Face-recognition reticle', 'switch'], ['style.mono', 'Black & white', 'switch'], ['style.band', 'Diagonal light band', 'switch'],
  ['style.intro', 'Password intro first', 'switch'], ['style.passLen', 'Password length', 'range', [3, 24, 1], (L) => L.style.intro !== false],
  ['style.glitchOut', 'RGB glitch at the end', 'switch'], ['style.frameColor', 'Frame colour', 'color'],
  ['style.bg', 'Background', 'select', { dark: 'Dark grid screen', dim: 'Darken the map', none: 'Over the map' }],
  ['style.size', 'Size', 'range', [0.4, 2, 0.05]], ['style.sound', 'Sound', 'switch'],
] };

// ---------------------------------------------------------------- timeline (drawing + sound)
export function dossierTL(L) {
  const s = L.style, D = Math.max(1, +L.duration || 10);
  const P = s.intro !== false ? 2.5 : 0;
  const n = Math.max(3, Math.round(+s.passLen || 12));
  const rows = String(s.fields || '').split('\n').filter((x) => x.trim()).map((r) => r.split('|'));
  let t = P + 0.45;
  const per = rows.map((r) => { const v = String(r[1] || ''), d = Math.max(0.25, v.length / 14); const o = { t, d, n: v.length }; t += d + 0.2; return o; });
  const mains = ['photo1', 'photo2', 'photo3'].filter((k, i) => i === 0 || s[k]);
  const cut = Math.max(0.8, +s.per || 2.6);
  const cuts = []; for (let k = 1; k < mains.length * 4; k++) { const tc = P + 0.6 + k * cut; if (tc < D - 0.7) cuts.push(tc); }
  return { D, P, n, pass: { a: 0.35, dur: Math.min(1.4, n * 0.1), open: Math.min(1.9, 0.35 + Math.min(1.4, n * 0.1) + 0.2) }, rows, per, mains, cut, cuts, out: s.glitchOut !== false ? Math.min(0.7, D * 0.12) : 0 };
}
export function dossierSounds(L, P) {
  const s = L.style, T = dossierTL(L);
  if (s.intro !== false) { P(0.05, 'click', { vol: 0.7 }); P(T.pass.a, 'keys', { n: T.n, dur: T.pass.dur, enter: true }); P(T.pass.open, 'lock', { vol: 0.6 }); P(T.P - 0.35, 'glitch', { dur: 0.35, vol: 0.6 }); }
  P(T.P, 'datalink', { vol: 0.5 }); P(T.P + 0.15, 'glitch', { dur: 0.3, vol: 0.5 });
  T.per.forEach((r) => r.n && P(r.t, 'keys', { n: r.n, dur: r.d, vol: 0.8 }));
  if (s.face) P(T.P + 1.1, 'shutter', { vol: 0.6 });
  if (s.reticle !== false) P(T.P + 0.7, 'beep', { freq: 1500, vol: 0.4 });
  T.cuts.forEach((tc) => P(tc - 0.05, 'static', { dur: 0.3, vol: 0.5 }));
  if (T.out) P(T.D - T.out, 'glitch', { dur: T.out, vol: 0.8 });
}

// ---------------------------------------------------------------- drawing helpers
const offs = new Map();
function off(key, w, h) {
  let c = offs.get(key);
  if (!c) { c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); offs.set(key, c); }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.globalAlpha = 1; g.filter = 'none';
  return [c, g];
}
let noiseC = null;
function noiseTex() {
  if (noiseC) return noiseC;
  noiseC = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(160, 120) : Object.assign(document.createElement('canvas'), { width: 160, height: 120 });
  const g = noiseC.getContext('2d'), d = g.createImageData(160, 120);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0);
  return noiseC;
}
/** a photo (cover fit) or a silhouette placeholder, b&w + light band + scanlines */
function photo(g, id, x, y, w, h, s, unit, seed = 0) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  const im = id ? imageFor(id) : null;
  if (im?.ready) {
    const k = Math.max(w / im.w, h / im.h);
    if (s.mono !== false) g.filter = 'grayscale(1) contrast(1.25) brightness(0.92)';
    g.drawImage(im.bmp, x + (w - im.w * k) / 2, y + (h - im.h * k) / 2, im.w * k, im.h * k);
    g.filter = 'none';
  } else {
    const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#3a4148'); gr.addColorStop(1, '#0f1317');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    // silhouette: head and shoulders
    const cx = x + w * (0.45 + hash(seed) * 0.15), cy = y + h * 0.42;
    g.fillStyle = '#0b0e11';
    g.beginPath(); g.ellipse(cx, cy, w * 0.13, h * 0.15, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(cx - w * 0.34, y + h); g.quadraticCurveTo(cx - w * 0.3, cy + h * 0.2, cx, cy + h * 0.17); g.quadraticCurveTo(cx + w * 0.3, cy + h * 0.2, cx + w * 0.34, y + h); g.closePath(); g.fill();
  }
  if (s.band !== false) {
    g.globalCompositeOperation = 'screen';
    const bx = x + w * 0.15, gr = g.createLinearGradient(bx, y + h, bx + w * 0.5, y);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.65, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x + w * 0.05, y + h); g.lineTo(x + w * 0.45, y); g.lineTo(x + w * 0.75, y); g.lineTo(x + w * 0.35, y + h); g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  // steel tint, scanlines, vignette
  g.fillStyle = 'rgba(60,110,140,0.12)'; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(0,0,0,0.16)';
  for (let yy = y; yy < y + h; yy += 3 * unit) g.fillRect(x, yy, w, 1 * unit);
  const v = g.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.35, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)'); g.fillStyle = v; g.fillRect(x, y, w, h);
  g.restore();
}
function staticNoise(g, x, y, w, h, a, frameNo) {
  if (a <= 0) return;
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.globalAlpha *= a;
  const N = noiseTex();
  g.imageSmoothingEnabled = false;
  g.drawImage(N, (hash(frameNo) * 80) | 0, (hash(frameNo + 3) * 60) | 0, 80, 60, x, y, w, h);
  g.restore();
}
function globe(g, x, y, r, col) {
  g.save(); g.strokeStyle = col; g.lineWidth = r * 0.07;
  g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
  g.beginPath(); g.ellipse(x, y, r * 0.45, r, 0, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.stroke();
  g.beginPath(); g.moveTo(x, y - r); g.lineTo(x, y - r * 1.55); g.stroke();
  g.beginPath(); g.moveTo(x - r * 0.12, y - r * 1.42); g.lineTo(x, y - r * 1.6); g.lineTo(x + r * 0.12, y - r * 1.42); g.stroke();
  g.restore();
}
function grid(g, fr, unit) {
  g.fillStyle = '#14181c'; g.fillRect(fr.x, fr.y, fr.w, fr.h);
  const v = g.createRadialGradient(fr.x + fr.w / 2, fr.y + fr.h / 2, fr.h * 0.2, fr.x + fr.w / 2, fr.y + fr.h / 2, fr.w * 0.7);
  v.addColorStop(0, 'rgba(60,68,76,0.35)'); v.addColorStop(1, 'rgba(0,0,0,0.6)'); g.fillStyle = v; g.fillRect(fr.x, fr.y, fr.w, fr.h);
  g.strokeStyle = 'rgba(255,255,255,0.045)'; g.lineWidth = 1 * unit;
  const st = 46 * unit;
  for (let x = fr.x + st; x < fr.x + fr.w; x += st) { g.beginPath(); g.moveTo(x, fr.y); g.lineTo(x, fr.y + fr.h); g.stroke(); }
  for (let y = fr.y + st; y < fr.y + fr.h; y += st) { g.beginPath(); g.moveTo(fr.x, y); g.lineTo(fr.x + fr.w, y); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.12)';
  for (let x = fr.x + st; x < fr.x + fr.w; x += st) for (let y = fr.y + st; y < fr.y + fr.h; y += st) g.fillRect(x - 1.5 * unit, y - 0.5 * unit, 3 * unit, 1 * unit);
}

// ---------------------------------------------------------------- the HUD
export function drawDossier(ctx, L, tm, o) {
  const s = L.style, fr = o.frame;
  if (!fr) return;
  const T = dossierTL(L);
  const play = L.anim === 'play' && !tm.edit;
  const tau = tm.edit || L.anim === 'none' ? T.P + 2.6 : tm.tau;
  if (tau > T.D && !tm.edit) return;
  // fit between the logo strip and the lower third
  const top = fr.h * (brandSafeArea(fr.w, fr.h).top || 0), bottom = fr.h * (1 - brandLowerSafe());
  const unit = o.unit, sz = (+s.size || 1) * Math.min(1, (bottom - top) / (470 * o.unit));
  const frameNo = Math.floor((o.time ?? tau) * 24);
  const S = Math.max(1, Math.abs(ctx.getTransform().a) || 1);
  const [C, g] = off(`${L.id}:dossier`, Math.ceil(fr.w * S), Math.ceil(fr.h * S));
  g.scale(S, S); g.translate(-fr.x, -fr.y);
  if (s.bg === 'dim') { g.fillStyle = 'rgba(5,8,11,0.8)'; g.fillRect(fr.x, fr.y, fr.w, fr.h); }
  else if (s.bg !== 'none') grid(g, fr, unit);
  // the group (draggable), laid out in units from its top-left
  const GW = 790 * unit * sz, GH = 450 * unit * sz;
  let gx = fr.x + (fr.w - GW) / 2, gy = fr.y + top + (bottom - top - GH) / 2;
  const [dx, dy] = placeAt(ctx, L, fr, gx, gy, GW, GH, { key: 'hud' });
  ctx.translate(-dx, -dy); // the offset is applied to the group inside the offscreen
  gx += dx; gy += dy;
  const u = unit * sz, X = (v) => gx + v * u, Y = (v) => gy + v * u;
  const col = s.frameColor || '#6f9fb4';
  const D0 = T.P;
  if (s.intro !== false && play && tau < D0) {
    // password intro: field, stars, lock opens, flash, then the window grows
    const n = Math.floor(clamp((tau - T.pass.a) / T.pass.dur, 0, 1) * T.n);
    const opened = tau >= T.pass.open;
    const fx = fr.x + fr.w / 2 - 150 * u, fy = fr.y + fr.h / 2 - 14 * u;
    g.fillStyle = opened ? 'rgba(200,30,48,0.55)' : 'rgba(120,20,34,0.4)'; g.strokeStyle = opened ? '#ff4053' : 'rgba(255,255,255,0.85)'; g.lineWidth = 1.5 * u;
    g.fillRect(fx, fy, 300 * u, 28 * u); g.strokeRect(fx, fy, 300 * u, 28 * u);
    g.font = `700 ${15 * u}px ${MONO}`; g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText('*'.repeat(n), fx + 9 * u, fy + 15 * u);
    // lock icon
    const lx = fx + 320 * u, ly = fy + 15 * u, r = 7 * u;
    g.strokeStyle = opened ? '#ff4053' : '#e9eef5'; g.fillStyle = g.strokeStyle; g.lineWidth = 2 * u;
    g.beginPath(); g.arc(lx + (opened ? 5 * u : 0), ly - 4 * u, r * 0.6, Math.PI, 0); g.stroke(); g.fillRect(lx - r * 0.8, ly - 3 * u, r * 1.6, r * 1.3);
    g.fillStyle = opened ? '#ff2a40' : 'rgba(255,255,255,0.15)'; g.fillRect(fr.x + fr.w / 2 - 20 * u, fy + 40 * u, 40 * u, 12 * u);
    if (!opened) { g.fillStyle = '#d6dbe2'; g.font = `600 ${7 * u}px ${SANS}`; g.textAlign = 'center'; g.fillText('Enter', fr.x + fr.w / 2, fy + 46.5 * u); }
    const kw = seg(tau, D0 - 0.5, D0);
    if (kw > 0) { // a small photo window grows out of the centre
      const w = 120 * u * (0.4 + kw), h = w;
      g.globalAlpha = kw; photo(g, s.photo1, fr.x + fr.w / 2 - w / 2, fr.y + fr.h / 2 - h / 2, w, h, s, unit, 1);
      g.strokeStyle = col; g.lineWidth = 1.5 * u; g.strokeRect(fr.x + fr.w / 2 - w / 2, fr.y + fr.h / 2 - h / 2, w, h); g.globalAlpha = 1;
    }
  } else {
    const tl = play ? tau - D0 : 99; // time inside the dossier
    // badge
    const kb = easeOut(seg(tl, 0, 0.35));
    if (kb > 0) {
      g.save(); g.globalAlpha = kb;
      g.fillStyle = s.badgeColor || '#9b1d26'; g.fillRect(X(0), Y(10), 108 * u, 112 * u);
      g.strokeStyle = 'rgba(255,170,170,0.45)'; g.lineWidth = 1 * u; g.strokeRect(X(3), Y(13), 102 * u, 106 * u);
      globe(g, X(54), Y(58), 22 * u, 'rgba(255,235,235,0.85)');
      g.fillStyle = 'rgba(255,235,235,0.9)'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.font = `400 ${10 * u}px "Cinzel","Playfair Display",serif`;
      String(s.badge || '').split(' ').forEach((wd, i, a) => g.fillText(wd, X(54), Y(100 + i * 11 - (a.length > 1 ? 4 : 0))));
      g.restore();
    }
    // fields
    let fy = 132;
    T.rows.forEach((r, i) => {
      const P = T.per[i], lt = play ? tau : T.D;
      if (lt < P.t - 0.15) { fy += 64; return; }
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.font = `400 ${7 * u}px ${LABEL}`; g.fillStyle = 'rgba(235,240,245,0.85)';
      g.fillText(String(r[0] || '').toUpperCase() + ':', X(6), Y(fy + 8));
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.3 * u; g.fillStyle = 'rgba(8,11,14,0.55)';
      g.fillRect(X(0), Y(fy + 13), 182 * u, 36 * u); g.strokeRect(X(0), Y(fy + 13), 182 * u, 36 * u);
      const val = String(r[1] || ''), n = play ? Math.floor(clamp((tau - P.t) / P.d, 0, 1) * val.length) : val.length;
      g.font = `500 ${14 * u}px ${SANS}`; g.fillStyle = '#ffffff';
      const txt = val.slice(0, n); g.fillText(txt, X(10), Y(fy + 37));
      const last = i === T.rows.length - 1;
      if ((play && tau >= P.t && (tau < P.t + P.d + 0.4 || last)) && Math.floor((o.time ?? tau) * 2.5) % 2 === 0) g.fillRect(X(12) + g.measureText(txt).width, Y(fy + 22), 1.3 * u, 18 * u);
      fy += 64;
    });
    // photo window
    const kw = play ? easeOut(seg(tl, 0.05, 0.45)) : 1;
    if (kw > 0) {
      const wx = 255, wy = 0, ww = 330, wh = 340;
      const sc = 0.7 + 0.3 * kw;
      g.save(); g.globalAlpha = kw;
      g.translate(X(wx + ww / 2), Y(wy + wh / 2)); g.scale(sc, sc); g.translate(-X(wx + ww / 2), -Y(wy + wh / 2));
      // title bar
      g.strokeStyle = 'rgba(220,230,238,0.8)'; g.lineWidth = 1 * u; g.fillStyle = 'rgba(12,16,20,0.85)';
      g.fillRect(X(wx), Y(wy), ww * u, wh * u); g.strokeRect(X(wx), Y(wy), ww * u, wh * u);
      g.beginPath(); g.moveTo(X(wx), Y(wy + 14)); g.lineTo(X(wx + ww), Y(wy + 14)); g.stroke();
      g.fillStyle = 'rgba(230,236,242,0.8)'; g.font = `600 ${7 * u}px ${SANS}`; g.textBaseline = 'middle'; g.textAlign = 'left';
      g.fillText('×  −  +' + (s.title ? `    ${s.title}` : ''), X(wx + 6), Y(wy + 7.5));
      // the photo (cycles with static cuts)
      const px = wx + 10, py = wy + 22, pw = ww - 20, ph = wh - 32;
      const idx = T.cuts.filter((tc) => tau >= tc).length % T.mains.length;
      photo(g, s[T.mains[idx]], X(px), Y(py), pw * u, ph * u, s, unit, idx + 1);
      const near = play ? Math.min(...T.cuts.map((tc) => Math.abs(tau - tc)), 9) : 9;
      staticNoise(g, X(px), Y(py), pw * u, ph * u, near < 0.22 ? 1 - near / 0.22 : (play && tl < 0.5 ? 1 - tl / 0.5 : 0), frameNo);
      g.strokeStyle = col; g.lineWidth = 2.5 * u; g.strokeRect(X(px), Y(py), pw * u, ph * u);
      // reticle
      if (s.reticle !== false) {
        const kr = play ? seg(tl, 0.5, 1.1) : 1;
        if (kr > 0) {
          const cx = X(px + pw * (+s.faceX || 0.5)), cy = Y(py + ph * (+s.faceY || 0.42));
          g.save(); g.globalAlpha *= kr;
          g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1 * u;
          g.beginPath(); g.arc(cx, cy, 78 * u * kr, 0, 7); g.stroke();
          g.beginPath(); g.moveTo(cx - 100 * u, cy); g.lineTo(cx - 60 * u, cy); g.moveTo(cx + 60 * u, cy); g.lineTo(cx + 100 * u, cy); g.moveTo(cx, cy - 100 * u); g.lineTo(cx, cy - 60 * u); g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.5 * u;
          const b = 62 * u, c = 10 * u;
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.beginPath(); g.moveTo(cx + sx * b, cy + sy * (b - c)); g.lineTo(cx + sx * b, cy + sy * b); g.lineTo(cx + sx * (b - c), cy + sy * b); g.stroke(); }
          g.strokeRect(cx + 70 * u, cy + 66 * u, 14 * u, 10 * u);
          g.restore();
        }
      }
      // face close-up inset
      const kf = play ? easeOut(seg(tl, 1.0, 1.35)) : 1;
      if (kf > 0) {
        const fw = 112 * u, fh = 104 * u, fx2 = X(px + pw) - fw - 6 * u, fy2 = Y(py) + 6 * u;
        g.save(); g.globalAlpha *= kf;
        g.translate(fx2 + fw, fy2); g.scale(0.6 + 0.4 * kf, 0.6 + 0.4 * kf); g.translate(-fx2 - fw, -fy2);
        photo(g, s.face || s.photo1, fx2, fy2, fw, fh, { ...s, band: false }, unit, 9);
        g.strokeStyle = '#e8eef3'; g.lineWidth = 1.5 * u; g.strokeRect(fx2, fy2, fw, fh);
        g.restore();
      }
      // caption
      g.font = `600 ${7 * u}px ${MONO}`; g.fillStyle = 'rgba(240,244,248,0.85)'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      String(s.caption || '').split('\n').forEach((ln, i, a) => g.fillText(ln, X(px + 6), Y(py + ph - 6 - (a.length - 1 - i) * 9)));
      g.restore();
    }
    // scrolling photo strip
    const ks = play ? easeOut(seg(tl, 0.25, 0.75)) : 1;
    if (ks > 0) {
      const sx = 600 + (1 - ks) * 60, sw = 165, th = 168, gap = 14;
      const strip = ['strip1', 'strip2', 'strip3', 'strip4'].map((k) => s[k]).filter(Boolean);
      const ids = strip.length ? strip : [s.photo2 || '', s.photo3 || '', s.photo1 || '', ''];
      const scroll = ((play ? tl : 0) * 18) % ((th + gap) * ids.length);
      g.save(); g.globalAlpha *= ks;
      g.beginPath(); g.rect(X(sx - 4), Y(0), (sw + 8) * u, 450 * u); g.clip();
      for (let k = -1; k < ids.length + 2; k++) {
        const j = ((k % ids.length) + ids.length) % ids.length;
        const ty = 8 + k * (th + gap) - scroll;
        if (ty > 450 || ty + th < 0) continue;
        g.fillStyle = 'rgba(12,16,20,0.85)'; g.fillRect(X(sx), Y(ty), sw * u, th * u);
        photo(g, ids[j], X(sx + 6), Y(ty + 6), (sw - 12) * u, (th - 12) * u, s, unit, j + 4);
        g.strokeStyle = hexA(col, 0.9); g.lineWidth = 2 * u; g.strokeRect(X(sx + 6), Y(ty + 6), (sw - 12) * u, (th - 12) * u);
      }
      g.restore();
      g.fillStyle = 'rgba(220,230,238,0.7)'; g.fillRect(X(sx + sw + 18), Y(10 + (scroll / ((th + gap) * ids.length)) * 380), 2 * u, 60 * u);
    }
  }
  // composite: fade, and the RGB glitch out
  const fadeA = L.anim === 'fade' && !tm.edit ? clamp(tau / 0.6, 0, 1) : 1;
  const W = fr.w, Hh = fr.h;
  ctx.save(); ctx.globalAlpha *= tm.alpha * fadeA;
  const gk = play && T.out ? seg(tau, T.D - T.out, T.D) : 0;
  if (gk <= 0) ctx.drawImage(C, fr.x, fr.y, W, Hh);
  else {
    const bands = 14;
    for (let b = 0; b < bands; b++) {
      const y0 = (b / bands) * Hh, bh = Hh / bands + 1;
      const shift = (hash(b * 13 + frameNo) - 0.5) * W * 0.25 * gk;
      const sy = (y0 / Hh) * C.height, sh = (bh / Hh) * C.height;
      ctx.globalAlpha = tm.alpha * fadeA * (1 - gk * 0.7);
      ctx.drawImage(C, 0, sy, C.width, sh, fr.x + shift, fr.y + y0, W, bh);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 * gk;
      ctx.drawImage(C, 0, sy, C.width, sh, fr.x + shift + 12 * unit * gk, fr.y + y0, W, bh);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = `rgba(80,140,255,${0.25 * gk})`; ctx.fillRect(fr.x, fr.y, W, Hh);
  }
  ctx.restore();
}
