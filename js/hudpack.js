// HUD pack: satellite launch countdown, biometric identification, monochrome sci-fi data console,
// live-feed scanner, holo table grid, scope — plus two HUD title looks (ring title and name card).
import { placeAt } from './place.js';
import { imageFor } from './geoimage.js';

const MONO = '"JetBrains Mono",ui-monospace,Menlo,monospace';
const UI = '"Inter","Segoe UI",system-ui,sans-serif';
const TECH = '"Orbitron","Rajdhani","Inter",sans-serif';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
function hexA(hex, a) {
  const h = (hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
const tc = (t, frames = true) => `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(Math.floor(t) % 60).padStart(2, '0')}${frames ? `.${String(Math.floor((t % 1) * 1000)).padStart(3, '0')}` : ''}`;
function bracketBox(ctx, x, y, w, h, b) {
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) { ctx.beginPath(); ctx.moveTo(cx, cy + sy * b); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * b, cy); ctx.stroke(); }
}
/** A panel with cut corners (sci-fi frame). */
function cutPath(ctx, x, y, w, h, c) {
  ctx.beginPath(); ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c); ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c); ctx.closePath();
}
const stagger = (u, i, n, span = 0.7) => clamp((u - (i / Math.max(1, n)) * span) / (1 - span * 0.9), 0, 1);

export const HUDPACK = {
  countdown: 'Satellite launch countdown', biometric: 'Biometric identification (fingerprint, hand, waveforms)', scifi: 'Sci-fi data console (monochrome)',
  livefeed: 'Live-feed scanner (cyan)', holotable: 'Holo table grid (cyan & orange)', scope: 'Scope view (thermal blue)',
};
export const HUDPACK_TITLES = { hudring: 'HUD ring title (red & cyan)', namecard: 'HUD name card (presents…)' };
const FILTERS = {
  scope: 'grayscale(1) sepia(0.6) hue-rotate(170deg) saturate(1.4) contrast(1.35) brightness(0.8)',
  holotable: 'grayscale(1) sepia(1) hue-rotate(140deg) saturate(2.6) contrast(1.35) brightness(0.85)',
  scifi: 'grayscale(1) contrast(1.2) brightness(0.85)',
};
export const hudpackFilter = (L) => FILTERS[L.style?.variant] || '';

export function drawHudPack(ctx, L, tm, o) {
  const v = L.style.variant;
  ctx.save();
  ctx.beginPath(); ctx.rect(o.frame.x, o.frame.y, o.frame.w, o.frame.h); ctx.clip();
  try {
    if (v === 'countdown') countdown(ctx, L, tm, o);
    else if (v === 'biometric') biometric(ctx, L, tm, o);
    else if (v === 'scifi') scifi(ctx, L, tm, o);
    else if (v === 'livefeed') livefeed(ctx, L, tm, o);
    else if (v === 'holotable') holotable(ctx, L, tm, o);
    else if (v === 'scope') scope(ctx, L, tm, o);
  } finally { ctx.restore(); }
}
const bootU = (L, tm) => (tm.edit || L.anim === 'none' ? 1 : clamp(tm.tau / Math.max(0.2, +L.duration || 1.5), 0, 1));

// ================================================================= satellite launch countdown
export const countFrom = (L) => Math.max(1, Math.round(+L.style.from || 10));
function countdown(ctx, L, tm, o) {
  const { frame, unit } = o;
  const { x, y, w, h } = frame;
  const s = L.style, t = o.time || 0;
  const col = s.color || '#38e1ff', acc = '#ff8a2a', ok = '#3ddc84';
  const u = bootU(L, tm);
  const from = countFrom(L);
  const el = tm.edit ? from * 0.4 : Math.max(0, tm.tau - (+s.delay || 0.5));
  const rem = Math.max(0, from - el);
  const launched = !tm.edit && rem <= 0;
  const after = launched ? el - from : 0;
  ctx.globalAlpha *= tm.alpha;
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5 * unit;
  ctx.shadowColor = hexA(col, 0.7); ctx.shadowBlur = 6 * unit;
  const cx = x + w / 2, cy = y + h * 0.48, R = Math.min(w, h) * 0.27 * easeOut(u * 1.4);
  // ring of second ticks
  const N = 60;
  for (let i = 0; i < N; i++) {
    const a = -Math.PI / 2 + (i / N) * Math.PI * 2;
    const lit = i / N < rem / from;
    ctx.globalAlpha = tm.alpha * (lit ? 1 : 0.2);
    ctx.lineWidth = (i % 5 ? 1.5 : 3) * unit;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 1.08, cy + Math.sin(a) * R * 1.08); ctx.lineTo(cx + Math.cos(a) * R * (i % 5 ? 1.14 : 1.2), cy + Math.sin(a) * R * (i % 5 ? 1.14 : 1.2)); ctx.stroke();
  }
  ctx.globalAlpha = tm.alpha;
  ctx.lineWidth = 6 * unit; ctx.strokeStyle = launched ? acc : col;
  ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (launched ? 1 : rem / from)); ctx.stroke();
  ctx.lineWidth = 1 * unit; ctx.strokeStyle = hexA(col, 0.5); ctx.beginPath(); ctx.arc(cx, cy, R * 0.88, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 3 * unit; ctx.strokeStyle = acc;
  for (let k = 0; k < 3; k++) { const a = t * (0.8 + k * 0.3) * (k % 2 ? -1 : 1) + k * 2; ctx.beginPath(); ctx.arc(cx, cy, R * (0.8 - k * 0.05), a, a + 0.5); ctx.stroke(); }
  // centre read-out
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff'; ctx.font = `600 ${13 * unit}px ${MONO}`;
  ctx.fillText(launched ? (s.done || 'LIFTOFF') : 'T-MINUS', cx, cy - R * 0.38);
  ctx.font = `700 ${Math.max(20 * unit, R * 0.42)}px ${TECH}`;
  ctx.fillStyle = launched ? (Math.sin(t * 10) > 0 ? acc : '#fff') : col;
  const secs = launched ? after : rem;
  ctx.fillText(`${launched ? '+' : ''}${String(Math.floor(secs / 60)).padStart(2, '0')}:${(secs % 60).toFixed(launched ? 1 : 2).padStart(launched ? 4 : 5, '0')}`, cx, cy + R * 0.05);
  ctx.font = `600 ${11 * unit}px ${MONO}`; ctx.fillStyle = hexA(col, 0.85);
  ctx.fillText(s.label || 'SATELLITE LAUNCH · SAT-07', cx, cy + R * 0.42);
  // earth limb and orbit at the bottom
  const ey = y + h * 1.25, er = h * 0.55;
  ctx.save(); ctx.globalAlpha *= 0.85 * u;
  const eg = ctx.createRadialGradient(cx, ey, er * 0.9, cx, ey, er * 1.08);
  eg.addColorStop(0, hexA(col, 0.0)); eg.addColorStop(0.9, hexA(col, 0.35)); eg.addColorStop(1, hexA(col, 0));
  ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(cx, ey, er * 1.08, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = hexA(col, 0.6); ctx.setLineDash([4 * unit, 6 * unit]); ctx.lineWidth = 1.2 * unit;
  ctx.beginPath(); ctx.ellipse(cx, ey, er * 1.35, er * 1.12, 0, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke(); ctx.setLineDash([]);
  const sa = Math.PI * 1.25 + (launched ? Math.min(0.5, after * 0.05) : 0) + Math.sin(t * 0.2) * 0.02;
  const sx = cx + Math.cos(sa) * er * 1.35, sy = ey + Math.sin(sa) * er * 1.12;
  ctx.fillStyle = '#fff'; ctx.fillRect(sx - 4 * unit, sy - 3 * unit, 8 * unit, 6 * unit); ctx.fillStyle = col; ctx.fillRect(sx - 14 * unit, sy - 2 * unit, 9 * unit, 4 * unit); ctx.fillRect(sx + 5 * unit, sy - 2 * unit, 9 * unit, 4 * unit);
  ctx.restore();
  // checklist (left)
  const items = String(s.text && !/MISSION/.test(s.text) ? s.text : 'PROPELLANT LOAD\nGUIDANCE\nRANGE SAFETY\nWEATHER\nGROUND STATION\nPAYLOAD').split('\n').filter(Boolean).slice(0, 8);
  const lx = x + w * 0.06, ly = y + h * 0.28;
  ctx.textAlign = 'left'; ctx.font = `700 ${11 * unit}px ${MONO}`;
  ctx.fillStyle = col; ctx.fillText('GO / NO-GO POLL', lx, ly - 24 * unit);
  ctx.fillRect(lx, ly - 14 * unit, 180 * unit * u, 1.5 * unit);
  items.forEach((it, i) => {
    const go = tm.edit || el > (i + 1) * (from * 0.6) / items.length;
    const yy = ly + i * 22 * unit;
    ctx.globalAlpha = tm.alpha * stagger(u, i, items.length);
    ctx.fillStyle = '#dfe9ee'; ctx.fillText(it.toUpperCase(), lx, yy);
    ctx.fillStyle = go ? ok : Math.sin(t * 8 + i) > 0 ? acc : hexA(acc, 0.3);
    ctx.fillText(go ? 'GO' : '···', lx + 190 * unit, yy);
  });
  ctx.globalAlpha = tm.alpha;
  // telemetry (right)
  const rx = x + w * 0.94, ry = y + h * 0.28;
  const alt = launched ? 0.5 * 30 * after * after : 0, vel = launched ? 30 * after : 0;
  const tele = [['ALT', `${alt.toFixed(0)} M`], ['VEL', `${vel.toFixed(1)} M/S`], ['TARGET', s.orbit || 'LEO 550 KM'], ['INCL', '53.0°'], ['SIGNAL', `${(92 + Math.sin(t * 2) * 3).toFixed(1)} %`], ['MET', launched ? tc(after, false) : '00:00:00']];
  ctx.textAlign = 'right'; ctx.fillStyle = col; ctx.fillText('TELEMETRY', rx, ry - 24 * unit); ctx.fillRect(rx - 180 * unit * u, ry - 14 * unit, 180 * unit * u, 1.5 * unit);
  tele.forEach(([k, v], i) => {
    ctx.globalAlpha = tm.alpha * stagger(u, i, tele.length);
    ctx.fillStyle = hexA(col, 0.7); ctx.fillText(k, rx - 120 * unit, ry + i * 22 * unit);
    ctx.fillStyle = '#ffffff'; ctx.fillText(v, rx, ry + i * 22 * unit);
  });
  ctx.globalAlpha = tm.alpha;
  // corners
  ctx.strokeStyle = hexA(col, 0.8); ctx.lineWidth = 2 * unit;
  bracketBox(ctx, x + 20 * unit, y + 20 * unit, w - 40 * unit, h - 40 * unit, 30 * unit);
  ctx.textAlign = 'left'; ctx.font = `600 ${10 * unit}px ${MONO}`; ctx.fillStyle = hexA(col, 0.8);
  ctx.fillText(`LAUNCH CONTROL  ·  UTC ${tc(t + 70000, false)}`, x + 40 * unit, y + 42 * unit);
  if (launched && after < 0.6) { ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - after / 0.6)})`; ctx.fillRect(x, y, w, h); }
}

// ================================================================= biometric identification
function fingerprint(ctx, cx, cy, rw, rh, seed, scan, col) {
  ctx.save();
  ctx.beginPath(); ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2); ctx.clip();
  const r = rng(seed);
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, rw * 0.045);
  for (let k = 1; k < 16; k++) {
    const rx = (k / 15) * rw * 1.15, ry = (k / 15) * rh * 1.05;
    const a0 = r() * 0.8, gap = 0.2 + r() * 0.5;
    ctx.beginPath();
    for (let a = a0; a < a0 + Math.PI * 2 - gap; a += 0.08) {
      const wob = 1 + Math.sin(a * 3 + k) * 0.04;
      const px = cx + Math.cos(a) * rx * wob, py = cy + rh * 0.12 + Math.sin(a) * ry * wob * (a > Math.PI ? 1 : 0.9);
      a === a0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  if (scan != null) {
    const sy = cy - rh + scan * rh * 2;
    const g = ctx.createLinearGradient(0, sy - rh * 0.3, 0, sy);
    g.addColorStop(0, hexA(col, 0)); g.addColorStop(1, hexA(col, 0.5));
    ctx.fillStyle = g; ctx.fillRect(cx - rw, sy - rh * 0.3, rw * 2, rh * 0.3);
    ctx.fillStyle = col; ctx.fillRect(cx - rw, sy - 1, rw * 2, 2);
  }
  ctx.restore();
}
function hand(ctx, cx, cy, s, col) {
  ctx.save(); ctx.fillStyle = col;
  rr(ctx, cx - s * 0.55, cy - s * 0.15, s * 1.1, s * 1.05, s * 0.3); ctx.fill();
  const fingers = [[-0.42, 0.7, -0.12], [-0.15, 0.95, -0.03], [0.13, 0.9, 0.03], [0.38, 0.72, 0.12]];
  for (const [fx, len, rot] of fingers) { ctx.save(); ctx.translate(cx + fx * s, cy - s * 0.1); ctx.rotate(rot); rr(ctx, -s * 0.12, -len * s, s * 0.24, len * s, s * 0.12); ctx.fill(); ctx.restore(); }
  ctx.save(); ctx.translate(cx - s * 0.55, cy + s * 0.35); ctx.rotate(-0.9); rr(ctx, -s * 0.13, -s * 0.6, s * 0.26, s * 0.6, s * 0.13); ctx.fill(); ctx.restore();
  ctx.globalCompositeOperation = 'destination-out';
  const r = rng(7);
  for (let i = 0; i < 160; i++) { ctx.globalAlpha = 0.6; ctx.fillRect(cx + (r() - 0.5) * s * 1.3, cy + (r() - 0.6) * s * 2, s * 0.03, s * 0.03); }
  ctx.restore();
}
function scopeWave(ctx, cx, cy, R, t, seed, col, unit, label) {
  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 2 * unit;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 4 * unit;
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + t * 0.4; ctx.beginPath(); ctx.arc(cx, cy, R * 1.1, a, a + 0.35); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.94, 0, Math.PI * 2); ctx.clip();
  ctx.lineWidth = 1.2 * unit;
  const r = rng(seed);
  const n = 60;
  for (let i = 0; i < n; i++) {
    const xx = cx - R * 0.8 + (i / n) * R * 1.6;
    const env = Math.sin((i / n) * Math.PI);
    const a = (Math.abs(Math.sin(i * 0.7 + t * 6 + r() * 6)) * 0.7 + r() * 0.3) * R * 0.55 * env;
    ctx.beginPath(); ctx.moveTo(xx, cy - a); ctx.lineTo(xx, cy + a); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = col; ctx.font = `500 ${8 * unit}px ${MONO}`; ctx.textAlign = 'center';
  ctx.fillText(label, cx, cy + R * 0.62);
}
function biometric(ctx, L, tm, o) {
  const { frame, unit } = o;
  const { x, y, w, h } = frame;
  const s = L.style, t = o.time || 0;
  const col = s.color || '#ffffff';
  const u = bootU(L, tm);
  const seed = hashStr(L.id);
  ctx.globalAlpha *= tm.alpha;
  const bw = w * 0.9, bh = h * 0.46, bx = x + (w - bw) / 2, by = y + h * (+s.top || 0.27);
  placeAt(ctx, L, frame, bx, by, bw, bh);
  ctx.fillStyle = `rgba(0,0,0,${s.dim ?? 0.72})`; ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5 * unit;
  // rails
  const rail = (yy, k) => { ctx.save(); ctx.globalAlpha *= k; ctx.beginPath(); ctx.moveTo(bx, yy); ctx.lineTo(bx + bw * k, yy); ctx.stroke(); ctx.setLineDash([3 * unit, 3 * unit]); ctx.beginPath(); ctx.moveTo(bx, yy + 5 * unit); ctx.lineTo(bx + bw * 0.42 * k, yy + 5 * unit); ctx.stroke(); ctx.setLineDash([]); for (let i = 0; i < 8; i++) ctx.fillRect(bx + bw * 0.1 + i * 8 * unit, yy - 7 * unit, 5 * unit, 3 * unit); ctx.restore(); };
  rail(by + 10 * unit, easeOut(u * 2)); rail(by + bh - 12 * unit, easeOut(u * 2 - 0.2));
  ctx.font = `500 ${9 * unit}px ${MONO}`; ctx.textAlign = 'right';
  ctx.fillText(tc(t + 35640, true).slice(0, 11), bx + bw - 10 * unit, by + 4 * unit);
  // modules
  const mw = bw / 4;
  const k1 = stagger(u, 0, 4), k2 = stagger(u, 1, 4), k3 = stagger(u, 2, 4), k4 = stagger(u, 3, 4);
  const scan = tm.edit ? 0.5 : (t * 0.5) % 1;
  // 1 fingerprint
  ctx.save(); ctx.globalAlpha *= k1;
  const fx = bx + mw * 0.5, fy = by + bh / 2;
  fingerprint(ctx, fx, fy, mw * 0.24, bh * 0.32, seed, scan, col);
  ctx.lineWidth = 2 * unit; ctx.beginPath(); ctx.arc(fx, fy + bh * 0.04, mw * 0.11, 0, Math.PI * 2); ctx.stroke();
  ctx.font = `500 ${9 * unit}px ${MONO}`; ctx.textAlign = 'left';
  for (let i = 1; i <= 9; i++) ctx.fillText(String(i).padStart(2, '0'), bx + 10 * unit, by + bh * 0.16 + i * bh * 0.075);
  ctx.fillText('FP₀₃₄', fx + mw * 0.26, fy);
  ctx.lineWidth = 1.5 * unit; bracketBox(ctx, bx + mw * 0.12, by + bh * 0.15, mw * 0.76, bh * 0.7, 10 * unit);
  ctx.restore();
  // 2 hand on a grid
  ctx.save(); ctx.globalAlpha *= k2;
  const hx = bx + mw * 1.5, hy = by + bh * 0.58;
  ctx.strokeStyle = hexA(col, 0.25); ctx.lineWidth = 0.6 * unit;
  for (let i = 0; i <= 14; i++) { const gx = bx + mw * 1.08 + (i / 14) * mw * 0.84; ctx.beginPath(); ctx.moveTo(gx, by + bh * 0.2); ctx.lineTo(gx, by + bh * 0.8); ctx.stroke(); }
  for (let i = 0; i <= 10; i++) { const gy = by + bh * 0.2 + (i / 10) * bh * 0.6; ctx.beginPath(); ctx.moveTo(bx + mw * 1.08, gy); ctx.lineTo(bx + mw * 1.92, gy); ctx.stroke(); }
  hand(ctx, hx, hy, Math.min(mw, bh) * 0.24, col);
  ctx.fillStyle = col; ctx.font = `500 ${9 * unit}px ${MONO}`; ctx.textAlign = 'center';
  ctx.fillText('A1  F7  E5  W2  L4  Z8  Y6  Q4  X1', hx, by + bh * 0.16);
  ctx.font = `800 ${11 * unit}px ${UI}`; ctx.fillText(s.label || 'IDENTIFICATION', hx, by + bh * 0.9);
  ctx.strokeStyle = col; ctx.lineWidth = 1.5 * unit; ctx.beginPath(); ctx.arc(hx - mw * 0.25, hy + bh * 0.02, mw * 0.08, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeRect(hx + mw * 0.2, hy + bh * 0.02, mw * 0.08, bh * 0.14);
  ctx.restore();
  // 3, 4 waveform scopes
  ctx.save(); ctx.globalAlpha *= k3;
  scopeWave(ctx, bx + mw * 2.5, by + bh / 2, Math.min(mw, bh) * 0.33, t, seed + 1, col, unit, tc(t + 42787, true).slice(0, 11));
  ctx.restore();
  ctx.save(); ctx.globalAlpha *= k4;
  scopeWave(ctx, bx + mw * 3.5, by + bh / 2, Math.min(mw, bh) * 0.33, t * 1.3, seed + 2, col, unit, tc(t + 35656, true).slice(0, 11));
  ctx.restore();
  // result
  const res = tm.edit || tm.tau > (+L.duration || 1.5) + 2;
  if (res) {
    ctx.save(); ctx.font = `800 ${12 * unit}px ${MONO}`; ctx.textAlign = 'right'; ctx.fillStyle = s.matchColor || '#3dff8a';
    ctx.globalAlpha *= Math.sin(t * 6) > -0.5 ? 1 : 0.3;
    ctx.fillText(s.result || 'MATCH FOUND · 98.7%', bx + bw - 10 * unit, by + bh - 24 * unit);
    ctx.restore();
  }
}

// ================================================================= monochrome sci-fi console
const WORLD = [
  [[-168, 66], [-140, 70], [-95, 72], [-80, 63], [-60, 55], [-55, 48], [-70, 43], [-76, 35], [-81, 25], [-90, 29], [-97, 26], [-105, 20], [-95, 16], [-87, 13], [-80, 8], [-85, 15], [-105, 23], [-112, 31], [-118, 34], [-124, 40], [-124, 48], [-135, 58], [-150, 60], [-165, 62]],
  [[-50, 60], [-42, 60], [-20, 70], [-20, 80], [-60, 82], [-70, 76], [-55, 68]],
  [[-80, 8], [-60, 10], [-50, 0], [-35, -6], [-40, -22], [-48, -28], [-58, -38], [-65, -55], [-72, -50], [-72, -30], [-71, -18], [-81, -5]],
  [[-10, 36], [-9, 43], [-2, 44], [-5, 48], [2, 51], [8, 54], [10, 58], [5, 62], [15, 69], [28, 71], [40, 67], [45, 60], [40, 48], [30, 45], [28, 41], [22, 37], [15, 38], [12, 44], [8, 44], [3, 42]],
  [[-5, 50], [1, 51], [-2, 56], [-6, 58], [-5, 54]],
  [[-17, 15], [-17, 21], [-10, 30], [-5, 36], [10, 37], [20, 32], [32, 31], [34, 28], [43, 12], [51, 12], [41, -2], [40, -15], [35, -25], [20, -35], [17, -29], [12, -17], [13, -5], [9, 4], [-5, 5], [-13, 8]],
  [[28, 41], [36, 36], [35, 30], [43, 13], [56, 22], [60, 25], [67, 24], [73, 20], [78, 8], [81, 16], [88, 22], [92, 22], [98, 16], [104, 10], [107, 16], [109, 22], [122, 30], [122, 40], [130, 43], [142, 47], [142, 60], [160, 62], [180, 67], [180, 72], [140, 73], [110, 77], [80, 73], [68, 70], [55, 68], [45, 60], [40, 48], [30, 45]],
  [[114, -22], [122, -18], [131, -12], [137, -12], [142, -11], [146, -19], [153, -26], [150, -37], [140, -38], [132, -32], [115, -34]],
  [[130, 31], [136, 34], [141, 38], [142, 44], [140, 41], [135, 35]],
  [[95, 5], [105, -6], [115, -8], [120, -2], [110, 2], [100, 6]],
];
function inPoly(px, py, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c; } return c; }
let worldDots = null;
function worldMap(ctx, x, y, w, h, col, unit, t, pulses = [[-74, 40], [116, 39], [-47, -15]]) {
  if (!worldDots) { worldDots = []; for (let la = 80; la > -56; la -= 2.5) for (let lo = -170; lo < 180; lo += 2.5) if (WORLD.some((p) => inPoly(lo, la, p))) worldDots.push([lo, la]); }
  const px = (lo) => x + ((lo + 180) / 360) * w, py = (la) => y + ((84 - la) / 144) * h;
  const d = Math.max(1, (w / 144) * 0.85);
  ctx.fillStyle = col;
  for (const [lo, la] of worldDots) ctx.fillRect(px(lo) - d / 2, py(la) - d / 2, d, d);
  ctx.strokeStyle = col; ctx.lineWidth = 1 * unit;
  pulses.forEach(([lo, la], i) => { for (let k = 0; k < 3; k++) { const f = ((t * 0.5 + k / 3 + i * 0.3) % 1); ctx.globalAlpha *= 1; ctx.save(); ctx.globalAlpha *= 1 - f; ctx.beginPath(); ctx.arc(px(lo), py(la), (4 + f * 30) * unit, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); } });
}
function rectBar(ctx, x, y, w, h, t, seed, col) {
  const r = rng(seed);
  let xx = x;
  for (let row = 0; row < 3; row++) {
    xx = x;
    while (xx < x + w) {
      const bw = (6 + r() * 30) * (h / 30);
      const on = Math.sin(t * (1 + r() * 3) + r() * 9) > -0.6;
      ctx.fillStyle = hexA(col, on ? 0.35 + r() * 0.5 : 0.1);
      ctx.fillRect(xx, y + row * (h / 3) + 1, Math.min(bw, x + w - xx), h / 3 - 2);
      xx += bw + 2;
    }
  }
}
function tile(ctx, x, y, w, h, txt, col, unit, big = true) {
  ctx.strokeStyle = col; ctx.lineWidth = 2 * unit; cutPath(ctx, x, y, w, h, 7 * unit); ctx.stroke();
  ctx.fillStyle = col; ctx.font = `800 ${(big ? h * 0.55 : h * 0.4)}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, x + w / 2, y + h / 2 + 1);
}
function codeLines(ctx, x, y, w, h, t, seed, col, unit) {
  const r = rng(seed);
  ctx.fillStyle = hexA(col, 0.65); ctx.font = `500 ${6.5 * unit}px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const n = Math.floor(h / (9 * unit));
  for (let i = 0; i < n; i++) { const len = 6 + Math.floor(r() * 30); let s = ''; for (let k = 0; k < len; k++) s += '<>/=."abcdefghij0123456789 '[Math.floor(r() * 27)]; if (Math.sin(t * 2 + i) > -0.9) ctx.fillText(s, x, y + i * 9 * unit, w); }
}
function scifi(ctx, L, tm, o) {
  const { frame, unit } = o;
  const { x, y, w, h } = frame;
  const s = L.style, t = o.time || 0;
  const col = s.color || '#d9d9d9';
  const u = bootU(L, tm);
  const seed = hashStr(L.id);
  ctx.globalAlpha *= tm.alpha;
  const m = 12 * unit, g = 10 * unit;
  const topH = 48 * unit;
  // the map window
  const mx = x + w * 0.2, my = y + m + topH + g, mw = w * 0.36, mh = h - (topH + g) * 2 - m * 2;
  // dark everywhere except the map window
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.rect(mx + mw, my, -mw, mh);
  ctx.fillStyle = `rgba(6,6,6,${s.dim ?? 0.9})`; ctx.fill('evenodd');
  ctx.restore();
  const k = (i) => stagger(u, i, 10);
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.6 * unit;
  // top & bottom data bars
  for (const [yy, lab, i] of [[y + m, 'DATA', 0], [y + h - m - topH, 'DATA', 9]]) {
    ctx.save(); ctx.globalAlpha *= k(i);
    ctx.fillStyle = hexA(col, 0.5); cutPath(ctx, x + m, yy, 84 * unit, topH, 8 * unit); ctx.fill();
    ctx.fillStyle = '#111'; ctx.font = `900 ${18 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lab, x + m + 42 * unit, yy + topH / 2);
    ctx.strokeStyle = col; tile(ctx, x + m + 92 * unit, yy, 38 * unit, topH, i ? '07' : '06', col, unit, false);
    cutPath(ctx, x + m + 138 * unit, yy, w * 0.62 - 150 * unit, topH, 6 * unit); ctx.stroke();
    rectBar(ctx, x + m + 146 * unit, yy + 6 * unit, w * 0.62 - 166 * unit, topH - 12 * unit, t, seed + i, col);
    ctx.restore();
  }
  // left column: code boxes
  ctx.save(); ctx.globalAlpha *= k(1);
  const lx = x + m, lw = w * 0.2 - m - g;
  for (const [j, tag] of [[0, 'GG-002'], [1, 'FG-037']]) {
    const yy = my + j * (mh / 2);
    ctx.strokeStyle = col; cutPath(ctx, lx, yy, lw * 0.62, mh / 2 - g, 8 * unit); ctx.stroke();
    ctx.fillStyle = hexA(col, 0.4); rr(ctx, lx + 6 * unit, yy + 6 * unit, 34 * unit, 18 * unit, 4 * unit); ctx.fill();
    ctx.fillStyle = col; ctx.font = `700 ${9 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('S-09', lx + 23 * unit, yy + 15 * unit);
    ctx.font = `800 ${14 * unit}px ${UI}`; ctx.textAlign = 'left'; ctx.fillText(tag, lx + 46 * unit, yy + 15 * unit);
    codeLines(ctx, lx + 8 * unit, yy + 32 * unit, lw * 0.5, mh / 2 - g - 44 * unit, t, seed + 10 + j, col, unit);
  }
  // DNA-like helix column
  const hx = lx + lw * 0.68, hw = lw * 0.3;
  ctx.strokeStyle = col; ctx.strokeRect(hx, my, hw, mh - g);
  ctx.strokeStyle = hexA(col, 0.2); for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(hx, my + (i / 8) * (mh - g)); ctx.lineTo(hx + hw, my + (i / 8) * (mh - g)); ctx.stroke(); }
  ctx.fillStyle = col;
  for (let i = 0; i < 40; i++) { const f = i / 40; const yy = my + 10 * unit + f * (mh - g - 20 * unit); const a = f * Math.PI * 2 + t; ctx.beginPath(); ctx.arc(hx + hw / 2 + Math.sin(a) * hw * 0.32, yy, 1.6 * unit, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(hx + hw / 2 - Math.sin(a) * hw * 0.32, yy, 1.6 * unit, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  // map window frame
  ctx.save(); ctx.globalAlpha *= k(2);
  ctx.strokeStyle = col; ctx.lineWidth = 2 * unit; cutPath(ctx, mx - 6 * unit, my - 6 * unit, mw + 12 * unit, mh + 12 * unit, 12 * unit); ctx.stroke();
  ctx.restore();
  // middle column: code + letter tiles
  const cx0 = mx + mw + g * 1.5, cw = w * 0.14;
  ctx.save(); ctx.globalAlpha *= k(3);
  codeLines(ctx, cx0, my, cw * 0.55, mh * 0.18, t, seed + 20, col, unit);
  tile(ctx, cx0 + cw * 0.6, my, cw * 0.4, cw * 0.4, 'E', col, unit);
  codeLines(ctx, cx0, my + mh * 0.3, cw * 0.55, mh * 0.18, t, seed + 21, col, unit);
  tile(ctx, cx0 + cw * 0.6, my + mh * 0.3, cw * 0.4, cw * 0.4, 'K', col, unit);
  ctx.strokeStyle = col; cutPath(ctx, cx0, my + mh * 0.6, cw, 22 * unit, 6 * unit); ctx.stroke();
  ctx.font = `600 ${7 * unit}px ${MONO}`; ctx.textAlign = 'left'; ctx.fillText('IU - J5 - NMV - 000154DF - 1254-526', cx0 + 8 * unit, my + mh * 0.6 + 11 * unit, cw - 14 * unit);
  tile(ctx, cx0, my + mh * 0.72, cw * 0.45, cw * 0.4, 'A-07', col, unit, false);
  ctx.strokeRect(cx0 + cw * 0.5, my + mh * 0.72, cw * 0.5, cw * 0.4);
  ctx.restore();
  // right panel: world map + chips
  const rx = cx0 + cw + g * 1.5, rw = x + w - m - rx, ry = y + m;
  ctx.save(); ctx.globalAlpha *= k(5);
  ctx.strokeStyle = col; cutPath(ctx, rx, ry, rw, h - m * 2, 14 * unit); ctx.stroke();
  tile(ctx, rx + rw * 0.55, ry + 20 * unit, rw * 0.22, 48 * unit, 'A-07', col, unit, false);
  ctx.fillStyle = hexA(col, 0.4); rr(ctx, rx + rw * 0.36, ry + 100 * unit, rw * 0.22, 26 * unit, 4 * unit); ctx.fill();
  ctx.fillStyle = '#111'; ctx.font = `900 ${13 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('WS-07', rx + rw * 0.47, ry + 113 * unit);
  codeLines(ctx, rx + 14 * unit, ry + 24 * unit, rw * 0.36, 70 * unit, t, seed + 30, col, unit);
  for (let i = 0; i < 3; i++) { ctx.strokeStyle = col; cutPath(ctx, rx + 14 * unit, ry + 140 * unit + i * 18 * unit, rw * 0.3, 13 * unit, 4 * unit); ctx.stroke(); }
  ctx.fillStyle = hexA(col, 0.5); cutPath(ctx, rx + 14 * unit, ry + h * 0.36, rw - 28 * unit, 30 * unit, 8 * unit); ctx.fill();
  ['◎', '⚙', '🗑'].forEach((ic, i) => { ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(rx + 34 * unit + i * 34 * unit, ry + h * 0.36 + 15 * unit, 11 * unit, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = col; ctx.font = `${12 * unit}px ${UI}`; ctx.fillText(ic, rx + 34 * unit + i * 34 * unit, ry + h * 0.36 + 16 * unit); });
  worldMap(ctx, rx + 14 * unit, ry + h * 0.45, rw - 28 * unit, (rw - 28 * unit) * 0.45, col, unit, t);
  ctx.restore();
}

// ================================================================= live-feed scanner (cyan)
function equalizer(ctx, x, y, w, h, n, t, seed, unit) {
  const r = rng(seed);
  const bw = w / n;
  for (let i = 0; i < n; i++) {
    const segs = 14, lvl = Math.floor(segs * (0.35 + 0.6 * Math.abs(Math.sin(t * (1 + r() * 2) + i))));
    for (let s = 0; s < segs; s++) { ctx.fillStyle = s < lvl ? (s > segs * 0.7 ? '#ff5a2a' : s % 3 ? '#4a5560' : '#3ff2d0') : 'rgba(255,255,255,0.06)'; ctx.fillRect(x + i * bw + 2 * unit, y + h - (s + 1) * (h / segs) + 1, bw - 4 * unit, h / segs - 2); }
  }
}
function lineGraph(ctx, x, y, w, h, t, seed, col, unit) {
  const r = rng(seed); const n = 10; const pts = Array.from({ length: n }, (_, i) => [x + (i / (n - 1)) * w, y + h * (0.2 + 0.6 * r()) + Math.sin(t + i) * h * 0.05]);
  ctx.strokeStyle = col; ctx.lineWidth = 1.5 * unit; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
  ctx.fillStyle = col; pts.forEach((p) => { ctx.beginPath(); ctx.arc(p[0], p[1], 2.5 * unit, 0, Math.PI * 2); ctx.fill(); });
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 0.6 * unit; for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(x, y + (i / 4) * h); ctx.lineTo(x + w, y + (i / 4) * h); ctx.stroke(); }
}
function radarDial(ctx, cx, cy, R, t, col, unit) {
  ctx.strokeStyle = col; ctx.lineWidth = 1.4 * unit;
  for (const k of [1, 0.78, 0.55]) { ctx.beginPath(); ctx.arc(cx, cy, R * k, 0, Math.PI * 2); ctx.stroke(); }
  ctx.lineWidth = 4 * unit;
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - t * 0.6; ctx.beginPath(); ctx.arc(cx, cy, R * 0.9, a, a + 0.4); ctx.stroke(); }
  ctx.lineWidth = 1 * unit;
  for (let i = 0; i < 48; i++) { const a = i * Math.PI / 24; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 1.05, cy + Math.sin(a) * R * 1.05); ctx.lineTo(cx + Math.cos(a) * R * (i % 4 ? 1.1 : 1.16), cy + Math.sin(a) * R * (i % 4 ? 1.1 : 1.16)); ctx.stroke(); }
  ctx.fillStyle = col; ctx.font = `600 ${7 * unit}px ${MONO}`; ctx.textAlign = 'center'; ctx.fillText('SCANNING', cx, cy);
}
function livefeed(ctx, L, tm, o) {
  const { frame, unit } = o;
  const { x, y, w, h } = frame;
  const s = L.style, t = o.time || 0;
  const col = s.color || '#3ff2d0', acc = '#ff5a2a';
  const u = bootU(L, tm);
  const seed = hashStr(L.id);
  ctx.globalAlpha *= tm.alpha;
  const k = (i) => stagger(u, i, 8);
  // feed window in the middle
  const fx = x + w * 0.33, fy = y + h * 0.13, fw = w * 0.57, fh = h * 0.47;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.rect(fx + fw, fy, -fw, fh);
  ctx.fillStyle = `rgba(3,10,12,${s.dim ?? 0.88})`; ctx.fill('evenodd');
  // faint grid
  ctx.strokeStyle = 'rgba(80,255,220,0.05)'; ctx.lineWidth = 1;
  for (let gx = x; gx < x + w; gx += 26 * unit) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke(); }
  for (let gy = y; gy < y + h; gy += 26 * unit) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5 * unit;
  ctx.shadowColor = hexA(col, 0.6); ctx.shadowBlur = 5 * unit;
  // title
  ctx.save(); ctx.globalAlpha *= k(0);
  ctx.font = `900 ${30 * unit}px ${TECH}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText((s.label || 'LIVE FEED').toUpperCase(), x + 22 * unit, y + 40 * unit);
  const tw = ctx.measureText((s.label || 'LIVE FEED').toUpperCase()).width;
  ctx.strokeStyle = acc; ctx.lineWidth = 2 * unit; ctx.beginPath(); ctx.arc(x + 46 * unit + tw, y + 40 * unit, 16 * unit, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = acc; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + t; ctx.beginPath(); ctx.arc(x + 46 * unit + tw + Math.cos(a) * 9 * unit, y + 40 * unit + Math.sin(a) * 9 * unit, 3 * unit, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  // feed frame
  ctx.save(); ctx.globalAlpha *= k(1);
  ctx.strokeRect(fx, fy, fw, fh);
  ctx.lineWidth = 3 * unit; bracketBox(ctx, fx - 8 * unit, fy - 8 * unit, fw + 16 * unit, fh + 16 * unit, 28 * unit);
  const fcx = fx + fw / 2, fcy = fy + fh / 2;
  ctx.lineWidth = 1.5 * unit; ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(fcx, fcy, fh * 0.32, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke();
  ctx.beginPath(); ctx.arc(fcx, fcy, fh * 0.32, -Math.PI * 0.38, Math.PI * 0.38); ctx.stroke();
  for (let i = 0; i < 20; i++) { const a = -Math.PI * 0.75 + (i / 19) * Math.PI * 0.5; ctx.beginPath(); ctx.moveTo(fcx + Math.cos(a) * fh * 0.4, fcy + Math.sin(a) * fh * 0.4); ctx.lineTo(fcx + Math.cos(a) * fh * 0.43, fcy + Math.sin(a) * fh * 0.43); ctx.stroke(); }
  ctx.fillStyle = '#fff'; ctx.font = `500 ${9 * unit}px ${UI}`; ctx.textAlign = 'right';
  const info = String(s.text && !/MISSION/.test(s.text) ? s.text : 'NAME: TARGET-07\nSTATUS: TRACKED\nSPEED: 42 KM/H\nID: 0025-DTU09').split('\n');
  info.forEach((l, i) => ctx.fillText(l, fx + fw - 18 * unit, fy + fh * 0.55 + i * 13 * unit));
  ctx.textAlign = 'center'; ctx.fillText(Math.sin(t * 5) > 0 ? 'OBJECT IDENTIFIED' : '', fcx, fy + fh - 16 * unit);
  ctx.textAlign = 'right'; ctx.fillStyle = col; ctx.font = `600 ${12 * unit}px ${UI}`; ctx.fillText(`PERCENTAGE BAR ${Math.round(70 + 20 * Math.sin(t * 0.3))}%`, fx + fw, fy - 16 * unit);
  ctx.restore();
  // left stack: codes, graph, information
  ctx.save(); ctx.globalAlpha *= k(2);
  ctx.textAlign = 'left'; ctx.font = `700 ${15 * unit}px ${TECH}`;
  ['0516-JSH', 'ZJU-025', 'DJW-015'].forEach((c, i) => { ctx.strokeRect(x + w * 0.2, y + h * 0.12 + i * 34 * unit, w * 0.11, 26 * unit); ctx.fillText(c, x + w * 0.21, y + h * 0.12 + i * 34 * unit + 14 * unit); });
  ctx.font = `700 ${13 * unit}px ${TECH}`; ctx.fillText(`MISSION: ${s.mission || 'ZXJ-012566'}//`, x + 22 * unit, y + h * 0.33);
  lineGraph(ctx, x + 26 * unit, y + h * 0.36, w * 0.16, h * 0.14, t, seed, col, unit);
  radarDial(ctx, x + w * 0.255, y + h * 0.43, Math.min(w, h) * 0.06, t, acc, unit);
  ctx.font = `700 ${12 * unit}px ${TECH}`; ctx.fillStyle = col; ctx.fillText('INFORMATION-DATA 02', x + 22 * unit, y + h * 0.56);
  const c = o.view?.center || [0, 0];
  ctx.font = `500 ${10 * unit}px ${UI}`; ctx.fillStyle = '#e8fffb';
  ctx.fillText('LONGITUDE POSITION', x + 26 * unit, y + h * 0.6); ctx.font = `600 ${13 * unit}px ${UI}`; ctx.fillText(c[0].toFixed(6), x + 26 * unit, y + h * 0.63);
  ctx.font = `500 ${10 * unit}px ${UI}`; ctx.fillText('LATITUDE POSITION', x + 26 * unit, y + h * 0.67); ctx.font = `600 ${13 * unit}px ${UI}`; ctx.fillText(c[1].toFixed(6), x + 26 * unit, y + h * 0.7);
  ctx.restore();
  // bottom: timecode, transport, waveform, keyboard
  ctx.save(); ctx.globalAlpha *= k(4);
  const by = y + h * 0.66;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); for (let i = 0; i < 160; i++) { const xx = fx + (i / 160) * fw, a = Math.abs(Math.sin(i * 0.9 + t * 8) * Math.sin(i * 0.13)) * 10 * unit; ctx.moveTo(xx, by - a); ctx.lineTo(xx, by + a); } ctx.stroke();
  ctx.strokeStyle = col; ctx.strokeRect(fx, by + 26 * unit, fw * 0.4, 44 * unit);
  ctx.fillStyle = '#e8fffb'; ctx.font = `400 ${24 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tc(t), fx + fw * 0.2, by + 48 * unit);
  ctx.fillStyle = col; ctx.fillRect(fx + fw * 0.42, by + 26 * unit, fw * 0.08, 44 * unit); ctx.fillStyle = '#022'; ctx.font = `700 ${16 * unit}px ${TECH}`; ctx.fillText('ZX1', fx + fw * 0.46, by + 48 * unit);
  for (let i = 0; i < 4; i++) { ctx.fillStyle = hexA(col, 0.9 - i * 0.2); ctx.fillRect(fx + fw * 0.52 + i * fw * 0.07, by + 26 * unit, fw * 0.065, 44 * unit); }
  ctx.fillStyle = col; ctx.font = `600 ${20 * unit}px ${UI}`; ctx.fillText('◂◂  ◁  ▶  ▸▸', fx + fw * 0.87, by + 48 * unit);
  ctx.font = `500 ${12 * unit}px ${UI}`; ctx.fillStyle = '#e8fffb'; ctx.fillText('EQUALIZER-ZXJ / AUDIO INFO 056-L', fx + fw * 0.6, by + 92 * unit);
  ctx.strokeStyle = col; ctx.strokeRect(x + 22 * unit, by + 26 * unit, w * 0.29, 44 * unit);
  ctx.font = `500 ${8 * unit}px ${MONO}`;
  ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL'].forEach((row, ri) => [...row].forEach((ch, ci) => { const kx = x + 30 * unit + ci * (w * 0.027), ky = by + 34 * unit + ri * 12 * unit; ctx.strokeStyle = hexA(col, 0.6); ctx.strokeRect(kx, ky, w * 0.022, 10 * unit); ctx.fillStyle = hexA(col, 0.9); ctx.fillText(ch, kx + w * 0.011, ky + 5 * unit); }));
  ctx.restore();
  // right: equalizer + dial
  ctx.save(); ctx.globalAlpha *= k(5);
  equalizer(ctx, x + w * 0.915, y + h * 0.08, w * 0.07, h * 0.18, 5, t, seed, unit);
  ctx.save(); ctx.translate(x + w * 0.905, y + h * 0.17); ctx.rotate(-Math.PI / 2); ctx.fillStyle = col; ctx.font = `700 ${12 * unit}px ${TECH}`; ctx.textAlign = 'center'; ctx.fillText('EQUALIZER', 0, 0); ctx.restore();
  ctx.strokeStyle = col; ctx.lineWidth = 2 * unit; ctx.strokeRect(x + w * 0.925, y + h * 0.31, w * 0.05, w * 0.05); ctx.strokeRect(x + w * 0.935, y + h * 0.31 + w * 0.01, w * 0.03, w * 0.03);
  for (let i = 0; i < 3; i++) { const lvl = 0.3 + 0.6 * Math.abs(Math.sin(t + i)); ctx.strokeRect(x + w * 0.918 + i * w * 0.023, y + h * 0.42, w * 0.018, h * 0.12); ctx.fillStyle = col; ctx.fillRect(x + w * 0.918 + i * w * 0.023, y + h * 0.42 + h * 0.12 * (1 - lvl), w * 0.018, h * 0.12 * lvl); }
  ctx.restore();
  ctx.save(); ctx.globalAlpha *= k(6);
  radarDial(ctx, x + w * 0.95, y + h * 0.75, Math.min(w, h) * 0.06, -t, col, unit);
  ctx.restore();
}

// ================================================================= holo table overlay
function holotable(ctx, L, tm, o) {
  const { frame, unit } = o;
  const { x, y, w, h } = frame;
  const s = L.style, t = o.time || 0;
  const col = s.color || '#38e8e0', acc = '#ff6a2a';
  const u = bootU(L, tm);
  const r0 = hashStr(L.id);
  ctx.globalAlpha *= tm.alpha;
  const vg = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.3, x + w / 2, y + h / 2, Math.hypot(w, h) * 0.6);
  vg.addColorStop(0, 'rgba(0,10,12,0)'); vg.addColorStop(1, 'rgba(0,8,10,0.75)'); ctx.fillStyle = vg; ctx.fillRect(x, y, w, h);
  // plus grid
  ctx.strokeStyle = hexA(col, 0.45); ctx.lineWidth = 1 * unit;
  const gs = 70 * unit;
  for (let gx = x + gs / 2; gx < x + w; gx += gs) for (let gy = y + gs / 2; gy < y + h; gy += gs) {
    const r = rng(Math.floor(gx) * 31 + Math.floor(gy));
    if (r() < 0.4 || r() > u * 1.2) continue;
    const d = 5 * unit; ctx.beginPath(); ctx.moveTo(gx - d, gy); ctx.lineTo(gx + d, gy); ctx.moveTo(gx, gy - d); ctx.lineTo(gx, gy + d); ctx.stroke();
  }
  // long dashed guide lines
  ctx.setLineDash([2 * unit, 6 * unit]); ctx.strokeStyle = hexA(col, 0.3);
  for (const f of [0.18, 0.82]) { ctx.beginPath(); ctx.moveTo(x, y + h * f); ctx.lineTo(x + w * easeOut(u * 1.5), y + h * f); ctx.stroke(); }
  ctx.setLineDash([]);
  // orange tag boxes along the top
  const tags = String(s.tags || 'TTP-7741|NUMBER|SECTOR A|GRID 04').split('|');
  ctx.font = `700 ${10 * unit}px ${MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  tags.forEach((tg, i) => {
    const k = stagger(u, i, tags.length + 2);
    ctx.globalAlpha = tm.alpha * k;
    const tx = x + w * 0.2 + i * w * 0.14, ty = y + h * 0.13;
    ctx.fillStyle = i === 0 ? acc : hexA(col, 0.25); ctx.fillRect(tx, ty, w * 0.11, 18 * unit);
    ctx.fillStyle = i === 0 ? '#111' : '#dffcff'; ctx.fillText(tg, tx + 8 * unit, ty + 9 * unit);
  });
  ctx.globalAlpha = tm.alpha;
  ctx.fillStyle = acc; ctx.fillRect(x + w * 0.12, y + h * 0.3, w * 0.05, h * 0.05 * u); ctx.fillRect(x + w * 0.85, y + h * 0.08, w * 0.03, h * 0.12 * u);
  // data table bottom right
  const cols = 4, rows = 5;
  const tx0 = x + w * 0.52, ty0 = y + h * 0.66, cw = w * 0.1, chh = 18 * unit;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const k = stagger(u, i * cols + j, rows * cols);
    if (k <= 0) continue;
    const r = rng(r0 + i * 9 + j + Math.floor(t * 2) * (i === 2 ? 1 : 0));
    ctx.globalAlpha = tm.alpha * k;
    ctx.fillStyle = hexA(col, i === 0 && j === 1 ? 0 : 0.45); ctx.fillRect(tx0 + j * (cw + 4 * unit), ty0 + i * (chh + 4 * unit), cw, chh);
    if (i === 0 && j === 1) { ctx.fillStyle = acc; ctx.fillRect(tx0 + j * (cw + 4 * unit), ty0, cw, chh); }
    ctx.fillStyle = '#031416'; ctx.font = `700 ${7.5 * unit}px ${MONO}`;
    ctx.fillText(`${['SEC', 'GRID', 'NODE', 'UNIT'][j]}-${Math.floor(r() * 900 + 100)}`, tx0 + j * (cw + 4 * unit) + 6 * unit, ty0 + i * (chh + 4 * unit) + chh / 2);
  }
  ctx.globalAlpha = tm.alpha;
  // yellow sparks
  const r = rng(r0 + 3);
  for (let i = 0; i < 40; i++) { const px = x + r() * w, py = y + r() * h; ctx.fillStyle = r() < 0.5 ? '#ffd23a' : acc; ctx.globalAlpha = tm.alpha * (0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i))); ctx.fillRect(px, py, 2.5 * unit, 2.5 * unit); }
  ctx.globalAlpha = tm.alpha;
  ctx.fillStyle = '#ffd23a'; ctx.font = `700 ${10 * unit}px ${MONO}`; ctx.fillText(s.label || 'ENTER COORDINATES A, B AND C', x + w * 0.27, y + h * 0.92);
}

// ================================================================= scope
function scope(ctx, L, tm, o) {
  const { frame, unit } = o;
  const { x, y, w, h } = frame;
  const s = L.style, t = o.time || 0;
  const col = s.color || '#dff2ff';
  const u = bootU(L, tm);
  ctx.globalAlpha *= tm.alpha;
  const cx = x + w / 2, cy = y + h * 0.5, R = h * 0.44 * (0.85 + 0.15 * easeOut(u));
  // tinted outside the scope
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.arc(cx, cy, R * 1.12, 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(10,30,50,0.55)'; ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(0,10,20,0.15)';
  for (let yy = y; yy < y + h; yy += 3 * unit) ctx.fillRect(x, yy, w, 1 * unit);
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.shadowColor = hexA('#7fc8ff', 0.8); ctx.shadowBlur = 10 * unit;
  // bright arcs left/right
  ctx.lineWidth = 3 * unit;
  ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI * 0.72, Math.PI * 1.28); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI * 0.28, Math.PI * 0.28); ctx.stroke();
  // tick rings
  ctx.lineWidth = 1.2 * unit; ctx.strokeStyle = hexA('#7fc8ff', 0.7);
  for (let i = 0; i < 90; i++) {
    const a = i * Math.PI / 45;
    const side = Math.abs(Math.cos(a)) > 0.45;
    if (!side) continue;
    const len = (i % 5 ? 10 : 22) * unit;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 1.03, cy + Math.sin(a) * R * 1.03); ctx.lineTo(cx + Math.cos(a) * (R * 1.03 + len), cy + Math.sin(a) * (R * 1.03 + len)); ctx.stroke();
  }
  // triangles
  ctx.fillStyle = hexA('#7fc8ff', 0.5);
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + sx * R * 1.32, cy - R * 0.32); ctx.lineTo(cx + sx * R * 1.24, cy - R * 0.22); ctx.lineTo(cx + sx * R * 1.32, cy - R * 0.12); ctx.closePath(); ctx.fill(); }
  // crosshair
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * unit;
  const g = R * 0.18, L1 = R * 0.52;
  ctx.beginPath(); ctx.moveTo(cx - L1, cy); ctx.lineTo(cx - g, cy); ctx.moveTo(cx + g, cy); ctx.lineTo(cx + L1, cy); ctx.moveTo(cx, cy - R * 0.5); ctx.lineTo(cx, cy - g * 0.4); ctx.moveTo(cx, cy + g * 0.4); ctx.lineTo(cx, cy + R * 0.5); ctx.stroke();
  ctx.lineWidth = 2.5 * unit; ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.moveTo(cx + dx * g * 0.45, cy + dy * g * 0.45); ctx.lineTo(cx + dx * g * 1.05, cy + dy * g * 1.05); ctx.stroke(); }
  ctx.shadowColor = '#ff3a6a'; ctx.fillStyle = '#ff3a6a'; ctx.beginPath(); ctx.arc(cx, cy, 3 * unit, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = hexA('#7fc8ff', 0.8);
  // left status panel
  const pw = 100 * unit, px = x + 16 * unit, py = y + 40 * unit;
  ctx.fillStyle = 'rgba(30,70,110,0.45)'; ctx.fillRect(px, py, pw, h - 80 * unit);
  ctx.fillStyle = '#e6f4ff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.shadowBlur = 4 * unit;
  const lines = [['STATUS', 8, 600], [s.status || 'READY', 15, 800], ['', 8, 400], ['THERMAL', 8, 600], [s.thermal || 'ON', 15, 800], ['', 30, 400], ['GPS:', 13, 800], [s.gps || 'OFFLINE', 8, 600]];
  let yy = py + 18 * unit;
  lines.forEach(([tx, fs, wt], i) => { ctx.globalAlpha = tm.alpha * stagger(u, i, lines.length); ctx.font = `${wt} ${fs * unit}px ${UI}`; ctx.fillText(tx, px + 8 * unit, yy); yy += (fs + 6) * unit; });
  ctx.globalAlpha = tm.alpha;
  ctx.strokeStyle = '#e6f4ff'; ctx.lineWidth = 1.2 * unit; ctx.strokeRect(px + 8 * unit, yy, pw - 16 * unit, 34 * unit);
  ctx.fillStyle = 'rgba(160,210,255,0.25)'; ctx.fillRect(px + 9 * unit, yy + 1, (pw - 18 * unit) * (0.5 + 0.5 * Math.sin(t)), 32 * unit);
  yy += 56 * unit;
  ctx.fillStyle = '#e6f4ff';
  for (const [tx, fs, wt] of [[s.weapon || 'THERMAL', 14, 800], ['OPTIC 12×', 13, 800], ['RANGE 420 M', 9, 600]]) { ctx.font = `${wt} ${fs * unit}px ${UI}`; ctx.fillText(tx, px + 8 * unit, yy); yy += (fs + 6) * unit; }
  ctx.font = `700 ${9 * unit}px ${UI}`; ctx.fillText('MAGS', px + 8 * unit, py + h - 96 * unit);
  for (let i = 0; i < 3; i++) ctx.fillRect(px + 48 * unit + i * 8 * unit, py + h - 112 * unit, 4 * unit, 18 * unit);
  // right ruler
  const rx = x + w - 34 * unit;
  ctx.fillStyle = 'rgba(160,210,255,0.6)';
  for (let i = 0; i < 40; i++) ctx.fillRect(rx, y + 80 * unit + i * ((h - 160 * unit) / 40), 8 * unit, 3 * unit);
  const my = y + 80 * unit + (0.5 + 0.4 * Math.sin(t * 0.7)) * (h - 160 * unit);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(rx - 4 * unit, my); ctx.lineTo(rx - 12 * unit, my - 5 * unit); ctx.lineTo(rx - 12 * unit, my + 5 * unit); ctx.closePath(); ctx.fill();
}

// ================================================================= HUD titles
export function drawHudTitle(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, t = o.time || 0;
  const unit = o.unit * (+s.size || 1);
  const D = Math.max(0.3, +L.duration || 2);
  const u = tm.edit ? 1 : clamp(tm.tau / D, 0, 1);
  const red = s.accent && s.accent !== '#e8c27a' ? s.accent : '#ff5a4a', cyan = s.color && s.color !== '#ffffff' ? s.color : '#49e6ff';
  const cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2;
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  ctx.shadowColor = hexA(red, 0.6); ctx.shadowBlur = 10 * unit;
  if ((s.look || 'hudring') === 'hudring') {
    const R = Math.min(fr.w, fr.h) * 0.42;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(-0.06); ctx.scale(1, 0.62);
    // dotted outer ring and solid inner
    const k1 = easeOut(u * 2);
    ctx.fillStyle = cyan;
    for (let i = 0; i < 90 * k1; i++) { const a = (i / 90) * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86, 2.4 * unit, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = hexA(cyan, 0.6); ctx.lineWidth = 2 * unit;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.02, 0, Math.PI * 2 * k1); ctx.stroke();
    ctx.strokeStyle = red; ctx.lineWidth = 2.5 * unit;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k1); ctx.stroke();
    // red frame with notches
    const k2 = easeOut(u * 1.6 - 0.2);
    ctx.globalAlpha *= k2;
    ctx.beginPath();
    const fw = R * 1.02, fh = R * 0.8;
    ctx.moveTo(-fw * 0.6, -fh); ctx.lineTo(fw * 0.25, -fh); ctx.lineTo(fw * 0.4, -fh * 0.75); ctx.lineTo(fw, -fh * 0.7); ctx.lineTo(fw * 0.85, fh * 0.2); ctx.lineTo(fw, fh * 0.9);
    ctx.lineTo(fw * 0.1, fh); ctx.lineTo(-fw * 0.05, fh * 0.75); ctx.lineTo(-fw * 0.95, fh * 0.6); ctx.lineTo(-fw, -fh * 0.1); ctx.lineTo(-fw * 0.75, -fh * 0.55); ctx.closePath();
    ctx.strokeStyle = red; ctx.lineWidth = 1.6 * unit; ctx.stroke();
    // red arc segments rotating
    ctx.fillStyle = red;
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + t * 0.3; ctx.save(); ctx.rotate(a); ctx.fillRect(R * 0.62, -10 * unit, 14 * unit, 20 * unit); ctx.restore(); }
    // cyan corner squares with lines
    ctx.fillStyle = cyan; ctx.strokeStyle = hexA(cyan, 0.7); ctx.lineWidth = 1.2 * unit;
    for (const [a, b] of [[-1.15, -0.95], [1.12, 0.7], [-0.95, 1.05], [1.2, -0.6]]) { ctx.fillRect(a * R - 8 * unit, b * R * 0.8 - 6 * unit, 16 * unit, 12 * unit); }
    // central red rectangle with cyan core
    ctx.fillStyle = hexA(red, 0.75); ctx.fillRect(-R * 0.28, -R * 0.32, R * 0.56, R * 0.64);
    ctx.fillStyle = hexA(cyan, 0.85); ctx.fillRect(-R * 0.1, -R * 0.12, R * 0.2, R * 0.16);
    ctx.restore();
    // diagonal bar with the title
    const k3 = easeOut((u - 0.3) / 0.5);
    if (k3 > 0) {
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(0.24);
      const bw = Math.min(fr.w * 0.78, R * 2.4) * k3, bh = 34 * unit;
      ctx.fillStyle = hexA(red, 0.8); ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
      ctx.fillStyle = cyan; ctx.shadowColor = cyan; ctx.shadowBlur = 14 * unit;
      ctx.font = `700 ${26 * unit}px ${TECH}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const txt = (s.text || 'HUD CINEMATIC TITLES').toUpperCase();
      const tt = clamp((u - 0.5) / 0.4, 0, 1);
      const rr3 = rng(Math.floor(t * 20) + 1);
      const shown = txt.split('').map((c, i) => (i / txt.length < tt ? c : (rr3() < 0.3 && tt > 0 ? '▮' : ' '))).join('');
      ctx.fillText(tm.edit ? txt : shown, 0, 1 * unit);
      if (s.sub) { ctx.font = `500 ${12 * unit}px ${UI}`; ctx.fillStyle = '#ffffff'; ctx.fillText(s.sub, 0, bh); }
      ctx.restore();
    }
  } else {
    // name card
    const W = 420 * unit, H = 150 * unit;
    const x = cx - W * 0.6, y = cy - H / 2;
    ctx.save();
    ctx.translate(cx, cy); ctx.transform(1, 0.1, -0.25, 1, 0, 0); ctx.translate(-cx, -cy);
    const k1 = easeOut(u * 1.8);
    ctx.strokeStyle = red; ctx.lineWidth = 1.5 * unit; ctx.strokeRect(x, y, W * k1, H * 0.62);
    // hatched name box
    ctx.save(); ctx.beginPath(); ctx.rect(x + 8 * unit, y + 8 * unit, (W - 16 * unit) * k1, H * 0.62 - 16 * unit); ctx.clip();
    ctx.strokeStyle = hexA(cyan, 0.35); ctx.lineWidth = 9 * unit;
    for (let i = -10; i < 30; i++) { const xx = x + i * 26 * unit; ctx.beginPath(); ctx.moveTo(xx, y + H * 0.62); ctx.lineTo(xx + 40 * unit, y); ctx.stroke(); }
    ctx.restore();
    const tt = clamp((u - 0.35) / 0.45, 0, 1);
    ctx.fillStyle = cyan; ctx.shadowColor = cyan; ctx.shadowBlur = 10 * unit;
    ctx.font = `500 ${30 * unit}px ${TECH}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const name = s.text || 'Your Name';
    ctx.fillText(name.slice(0, Math.ceil(name.length * tt)), x + W / 2, y + H * 0.31);
    ctx.shadowBlur = 0;
    ctx.fillStyle = red; ctx.fillRect(x + W * 0.28, y + H * 0.72, W * 0.85 * easeOut((u - 0.3) / 0.5), 8 * unit);
    ctx.fillStyle = cyan; ctx.font = `500 ${18 * unit}px ${TECH}`; ctx.textAlign = 'left';
    ctx.fillText((s.sub || 'Presents').slice(0, Math.ceil((s.sub || 'Presents').length * tt)), x + 6 * unit, y + H * 0.82);
    for (let i = 0; i < 4; i++) { ctx.fillRect(x + 8 * unit + i * 16 * unit, y + H * 0.66, 11 * unit, 6 * unit); ctx.fillRect(x + W * 0.75 + i * 40 * unit, y + H * 1.02, 26 * unit, 7 * unit); }
    ctx.fillRect(x + 8 * unit, y + H * 0.96, 30 * unit, 5 * unit); ctx.fillRect(x + 46 * unit, y + H * 0.96, 12 * unit, 5 * unit);
    // avatar
    const k4 = easeOut((u - 0.15) / 0.4);
    const ax = x + W + 16 * unit, ay = y - 6 * unit, as = H * 0.82;
    ctx.strokeStyle = red; ctx.lineWidth = 1.5 * unit; ctx.strokeRect(ax - 6 * unit, ay - 6 * unit, as + 12 * unit, as + 12 * unit);
    ctx.globalAlpha *= k4;
    const im = s.media ? imageFor(s.media) : null;
    if (im?.bmp) { ctx.save(); ctx.beginPath(); ctx.rect(ax, ay, as, as); ctx.clip(); const sc = Math.max(as / im.bmp.width, as / im.bmp.height); ctx.drawImage(im.bmp, ax + (as - im.bmp.width * sc) / 2, ay + (as - im.bmp.height * sc) / 2, im.bmp.width * sc, im.bmp.height * sc); ctx.restore(); }
    else {
      ctx.fillStyle = cyan; ctx.fillRect(ax, ay, as, as);
      ctx.fillStyle = '#071318'; ctx.beginPath(); ctx.ellipse(ax + as / 2, ay + as * 0.38, as * 0.18, as * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(ax + as / 2, ay + as * 0.98, as * 0.38, as * 0.3, 0, Math.PI, 0); ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}
