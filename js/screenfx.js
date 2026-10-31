// Whole-picture effects (film grain, old film, VHS, glitch, colour split, light leaks, flash, rain, snow,
// camera shake, focus pull) and your own videos placed on screen (full frame or picture-in-picture).
import { placeAt } from './place.js';
import { videoFor } from './videofx.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
export const EFFECT_LOOKS = {
  grain: 'Film grain', oldfilm: 'Old film (sepia, scratches)', vhs: 'VHS tape', glitch: 'Glitch distortion', chroma: 'Colour split (chromatic)',
  lightleak: 'Light leak', flash: 'Flash', rain: 'Rain', snow: 'Snow', shake: 'Camera shake', focus: 'Focus pull (blur → sharp)', fog: 'Fog / haze',
  storm: 'Thunderstorm (heavy rain + lightning)', hail: 'Hail', blizzard: 'Blizzard (heavy snow, wind)', leaves: 'Falling leaves', petals: 'Blossom petals',
  embers: 'Rising embers (fire)', ash: 'Falling ash', sandstorm: 'Sandstorm / dust', lightning: 'Lightning strikes', sunrays: 'Sun rays', mist: 'Drifting mist',
};
export const PARTICLE_LOOKS = new Set(['rain', 'snow', 'storm', 'hail', 'blizzard', 'leaves', 'petals', 'embers', 'ash', 'sandstorm', 'mist']);
const LEAF_COLS = { autumn: ['#c4621c', '#e0a030', '#a23a12', '#d88a2a', '#8a5a14'], green: ['#4c8f3a', '#6aa84f', '#3a7a2e', '#8fc04a'], mixed: ['#c4621c', '#e0a030', '#6aa84f', '#a23a12', '#d8b04a'] };
function leafShape(ctx, x, y, size, rot, col, flip) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, flip);
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(-size, 0); ctx.quadraticCurveTo(-size * 0.2, -size * 0.75, size, 0); ctx.quadraticCurveTo(-size * 0.2, size * 0.75, -size, 0); ctx.fill();
  ctx.strokeStyle = 'rgba(60,30,10,0.45)'; ctx.lineWidth = Math.max(0.6, size * 0.08);
  ctx.beginPath(); ctx.moveTo(-size * 1.25, 0); ctx.lineTo(size * 0.9, 0); ctx.stroke();
  ctx.restore();
}
function bolt(ctx, r, x0, y0, len, w, depth = 0) {
  let x = x0, y = y0;
  ctx.beginPath(); ctx.moveTo(x, y);
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    x += (r() - 0.5) * len * 0.12; y += len / steps;
    ctx.lineTo(x, y);
    if (depth < 2 && r() < 0.18) { ctx.stroke(); bolt(ctx, r, x, y, len * 0.45, w * 0.6, depth + 1); ctx.beginPath(); ctx.moveTo(x, y); }
  }
  ctx.lineWidth = w; ctx.stroke();
}

/** 0…1 strength of an effect layer at its timing (fades in and out). */
function strength(L, tm) {
  if (!tm.visible) return 0;
  const a = +L.style.amount || 1;
  if (tm.edit) return a;
  const D = Math.max(0.1, +L.duration || 1);
  if (L.style.look === 'flash') return a * Math.exp(-tm.tau * (6 / D)) * clamp(tm.tau / 0.03, 0, 1);
  if (L.style.look === 'focus') return a * (1 - ease(tm.tau / D));
  return a * clamp(tm.tau / 0.3, 0, 1) * tm.alpha;
}
const effects = (sc) => (sc.layers || []).filter((L) => L.kind === 'effect' && !L.hidden);

/** CSS filter for the map picture from active effects. */
export function effectFilter(sc, t, layerTiming) {
  const out = [];
  for (const L of effects(sc)) {
    const tm = layerTiming(L, t);
    const k = strength(L, tm);
    if (k <= 0.01) continue;
    const lk = L.style.look;
    if (lk === 'oldfilm') out.push(`sepia(${(0.85 * Math.min(1, k)).toFixed(2)}) contrast(${(1 + 0.15 * k).toFixed(2)}) brightness(${(1 - 0.05 * k).toFixed(2)})`);
    if (lk === 'vhs') out.push(`saturate(${(1 + 0.4 * k).toFixed(2)}) contrast(${(1 + 0.1 * k).toFixed(2)})`);
    if (lk === 'focus') out.push(`blur(${(12 * k).toFixed(1)}px)`);
    if (lk === 'fog') out.push(`contrast(${(1 - 0.25 * Math.min(1, k)).toFixed(2)}) brightness(${(1 + 0.08 * k).toFixed(2)})`);
  }
  return out.join(' ');
}
/** Camera shake offset (CSS px) at scene time t. */
export function shakeAt(sc, t, layerTiming) {
  if (t == null) return [0, 0];
  let dx = 0, dy = 0;
  for (const L of effects(sc)) {
    if (L.style.look !== 'shake') continue;
    const tm = layerTiming(L, t);
    const k = strength(L, tm);
    if (k <= 0.01) continue;
    const f = +L.style.speed || 1;
    dx += (Math.sin(t * 37 * f) + Math.sin(t * 23.3 * f + 1.3) * 0.6) * 9 * k;
    dy += (Math.sin(t * 31 * f + 2.1) + Math.sin(t * 17.7 * f) * 0.6) * 7 * k;
  }
  return [dx, dy];
}

let tint = null;
function tinted(src, sx, sy, sw, sh, w, h, color) {
  tint ||= document.createElement('canvas');
  if (tint.width !== w || tint.height !== h) { tint.width = w; tint.height = h; }
  const c = tint.getContext('2d');
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, w, h);
  c.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = color; c.fillRect(0, 0, w, h);
  return tint;
}
/**
 * Draw all effect layers over the picture. o: { frame, unit, time, src: { canvas, sx, sy, sw, sh } } — src is the
 * map picture region matching the frame (used by glitch / colour split).
 */
export function drawScreenEffects(ctx, sc, o, layerTiming) {
  const { frame: fr, unit } = o;
  const t = o.time ?? 0;
  for (const L of effects(sc)) {
    const tm = layerTiming(L, o.time);
    const k = strength(L, tm);
    if (k <= 0.01) continue;
    const s = L.style;
    const r = rng(hashStr(L.id) + Math.floor(t * 24));
    ctx.save();
    ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); ctx.clip();
    switch (s.look) {
      case 'grain': case 'oldfilm': {
        const n = Math.round(900 * k * (s.look === 'oldfilm' ? 1.4 : 1));
        for (let i = 0; i < n; i++) { ctx.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.09 * k})` : `rgba(0,0,0,${0.12 * k})`; const z = (0.8 + r() * 1.6) * unit; ctx.fillRect(fr.x + r() * fr.w, fr.y + r() * fr.h, z, z); }
        if (s.look === 'oldfilm') {
          ctx.globalAlpha = 0.5 * k;
          ctx.strokeStyle = 'rgba(255,248,230,0.8)'; ctx.lineWidth = 1 * unit;
          for (let i = 0; i < 3; i++) if (r() < 0.7) { const x = fr.x + r() * fr.w; ctx.beginPath(); ctx.moveTo(x, fr.y); ctx.lineTo(x + (r() - 0.5) * 6 * unit, fr.y + fr.h); ctx.stroke(); }
          ctx.fillStyle = 'rgba(30,20,10,0.8)';
          for (let i = 0; i < 6; i++) if (r() < 0.6) { ctx.beginPath(); ctx.arc(fr.x + r() * fr.w, fr.y + r() * fr.h, (1 + r() * 3) * unit, 0, Math.PI * 2); ctx.fill(); }
          ctx.globalAlpha = (0.06 + 0.06 * r()) * k; ctx.fillStyle = '#fff4d8'; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
          const g = ctx.createRadialGradient(fr.x + fr.w / 2, fr.y + fr.h / 2, Math.min(fr.w, fr.h) * 0.3, fr.x + fr.w / 2, fr.y + fr.h / 2, Math.hypot(fr.w, fr.h) * 0.6);
          g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(20,10,0,${0.7 * k})`);
          ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
        }
        break;
      }
      case 'vhs': {
        ctx.fillStyle = `rgba(0,0,0,${0.18 * k})`;
        for (let y = fr.y; y < fr.y + fr.h; y += 3 * unit) ctx.fillRect(fr.x, y, fr.w, 1.2 * unit);
        // tracking noise band
        const by = fr.y + ((t * 0.18) % 1.2) * fr.h - 0.1 * fr.h;
        for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(255,255,255,${0.25 * k * r()})`; ctx.fillRect(fr.x + r() * fr.w, by + r() * 30 * unit, (20 + r() * 120) * unit, 1.5 * unit); }
        if (o.src && r() < 0.5) {
          const { canvas, sx, sy, sw, sh } = o.src;
          const yy = r() * sh, hh = (4 + r() * 18) * (sh / fr.h);
          ctx.globalAlpha = 0.85; ctx.drawImage(canvas, sx, sy + yy, sw, hh, fr.x + (r() - 0.5) * 24 * unit * k, fr.y + yy * (fr.h / sh), fr.w, hh * (fr.h / sh)); ctx.globalAlpha = 1;
        }
        ctx.font = `700 ${22 * unit}px "VT323","JetBrains Mono",monospace`; ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 4 * unit;
        ctx.fillText(s.label || 'PLAY ▶', fr.x + 40 * unit, fr.y + 54 * unit);
        const tt = Math.floor(t);
        ctx.fillText(`${s.stamp || 'AUG 14 1996'}  ${String(Math.floor(tt / 60)).padStart(2, '0')}:${String(tt % 60).padStart(2, '0')}`, fr.x + 40 * unit, fr.y + fr.h - 40 * unit);
        break;
      }
      case 'glitch': case 'chroma': {
        if (!o.src) break;
        const { canvas, sx, sy, sw, sh } = o.src;
        const w = Math.max(2, Math.round(fr.w / 2)), h = Math.max(2, Math.round(fr.h / 2));
        const split = (s.look === 'chroma' ? 6 : 10) * unit * k * (s.look === 'glitch' ? (r() < 0.4 ? 1 : 0.2) : 1);
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.55;
        ctx.drawImage(tinted(canvas, sx, sy, sw, sh, w, h, '#ff0000'), fr.x - split, fr.y, fr.w, fr.h);
        ctx.drawImage(tinted(canvas, sx, sy, sw, sh, w, h, '#00ffff'), fr.x + split, fr.y, fr.w, fr.h);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        if (s.look === 'glitch') {
          const n = Math.round(10 * k);
          for (let i = 0; i < n; i++) {
            if (r() < 0.45) continue;
            const yy = r() * sh, hh = (0.01 + r() * 0.08) * sh;
            ctx.drawImage(canvas, sx, sy + yy, sw, hh, fr.x + (r() - 0.5) * 80 * unit * k, fr.y + yy * (fr.h / sh), fr.w, hh * (fr.h / sh));
          }
          if (r() < 0.25 * k) { ctx.fillStyle = `rgba(${r() < 0.5 ? '255,0,80' : '0,255,200'},0.12)`; ctx.fillRect(fr.x, fr.y + r() * fr.h, fr.w, (10 + r() * 60) * unit); }
        }
        break;
      }
      case 'lightleak': {
        ctx.globalCompositeOperation = 'screen';
        const col = s.color || '#ff8a3d';
        for (let i = 0; i < 3; i++) {
          const ph = t * (0.15 + i * 0.07) + i * 2.1;
          const x = fr.x + fr.w * (0.5 + 0.55 * Math.sin(ph)), y = fr.y + fr.h * (0.5 + 0.45 * Math.cos(ph * 1.3));
          const R = Math.max(fr.w, fr.h) * (0.45 + 0.15 * i);
          const g = ctx.createRadialGradient(x, y, 0, x, y, R);
          g.addColorStop(0, hexA(i === 1 ? '#ff3d6e' : col, 0.55 * k)); g.addColorStop(1, hexA(col, 0));
          ctx.fillStyle = g; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
        }
        break;
      }
      case 'flash': ctx.fillStyle = hexA(s.color || '#ffffff', clamp(k, 0, 1)); ctx.fillRect(fr.x, fr.y, fr.w, fr.h); break;
      case 'fog': {
        const g = ctx.createLinearGradient(0, fr.y, 0, fr.y + fr.h);
        g.addColorStop(0, `rgba(230,236,242,${0.55 * k})`); g.addColorStop(0.6, `rgba(230,236,242,${0.25 * k})`); g.addColorStop(1, `rgba(230,236,242,${0.1 * k})`);
        ctx.fillStyle = g; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
        break;
      }
      case 'storm': case 'hail': case 'blizzard': {
        const sp = +s.speed || 1, wind = s.wind ?? (s.look === 'blizzard' ? 0.8 : 0.35), sz = +s.size || 1;
        const rr = rng(hashStr(L.id));
        if (s.look === 'blizzard') { ctx.fillStyle = `rgba(225,232,240,${0.28 * Math.min(1, k)})`; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); }
        if (s.look === 'storm') { ctx.fillStyle = `rgba(20,28,40,${0.32 * Math.min(1, k)})`; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); }
        const n = Math.round((s.look === 'storm' ? 900 : s.look === 'hail' ? 260 : 700) * k);
        for (let i = 0; i < n; i++) {
          const x0 = rr(), y0 = rr(), z = 0.45 + rr() * 0.9;
          if (s.look === 'storm') {
            const y = fr.y + (((y0 + t * 2.6 * sp * z) % 1) * fr.h), x = fr.x + ((((x0 + t * 0.6 * wind * sp * z) % 1) + 1) % 1) * fr.w;
            ctx.strokeStyle = `rgba(190,205,225,${0.38 * z})`; ctx.lineWidth = 1.1 * unit * z * sz;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 14 * unit * z * wind, y + 28 * unit * z); ctx.stroke();
          } else if (s.look === 'hail') {
            const y = fr.y + (((y0 + t * 1.9 * sp * z) % 1) * fr.h), x = fr.x + ((((x0 + t * 0.15 * wind * sp) % 1) + 1) % 1) * fr.w;
            ctx.fillStyle = `rgba(240,248,255,${0.85 * z})`; ctx.beginPath(); ctx.arc(x, y, 2.2 * unit * z * sz, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = `rgba(240,248,255,${0.25 * z})`; ctx.lineWidth = 1.5 * unit * z; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 10 * unit * z); ctx.stroke();
          } else {
            const y = fr.y + (((y0 + t * 0.35 * sp * z) % 1) * fr.h), x = fr.x + ((((x0 + t * 0.45 * wind * sp * z + Math.sin(t * 2 + i) * 0.006) % 1) + 1) % 1) * fr.w;
            ctx.fillStyle = `rgba(255,255,255,${0.8 * z})`; ctx.beginPath(); ctx.ellipse(x, y, 2.4 * unit * z * sz, 1.6 * unit * z * sz, 0.6, 0, Math.PI * 2); ctx.fill();
          }
        }
        if (s.look === 'storm') {
          const slot = Math.floor(t / 2.6), rs = rng(hashStr(L.id) + slot * 977), at = slot * 2.6 + rs() * 1.6, dt = t - at;
          if (dt >= 0 && dt < 0.45 && rs() < 0.8) {
            const fl = dt < 0.06 ? 1 : dt < 0.12 ? 0.3 : dt < 0.18 ? 0.8 : Math.max(0, 0.6 - dt);
            ctx.fillStyle = `rgba(220,230,255,${0.45 * fl * Math.min(1, k)})`; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
            ctx.strokeStyle = `rgba(235,240,255,${fl})`; ctx.shadowColor = '#9fc0ff'; ctx.shadowBlur = 18 * unit;
            bolt(ctx, rng(hashStr(L.id) + slot * 31), fr.x + fr.w * (0.2 + rs() * 0.6), fr.y, fr.h * (0.55 + rs() * 0.35), 2.4 * unit);
            ctx.shadowBlur = 0;
          }
        }
        break;
      }
      case 'leaves': case 'petals': case 'embers': case 'ash': {
        const sp = +s.speed || 1, wind = s.wind ?? 0.25, sz = +s.size || 1;
        const rr = rng(hashStr(L.id));
        const n = Math.round((s.look === 'embers' ? 160 : s.look === 'ash' ? 220 : 90) * k);
        const cols = s.look === 'petals' ? ['#ffd1e3', '#ffb3cf', '#ffe4ef', '#f7a1c4'] : LEAF_COLS[s.leafColor || 'autumn'] || LEAF_COLS.autumn;
        if (s.look === 'embers') ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < n; i++) {
          const x0 = rr(), y0 = rr(), z = 0.5 + rr(), ph = rr() * 6.28, spin = (rr() - 0.5) * 4;
          if (s.look === 'embers') {
            const y = fr.y + fr.h - ((((y0 + t * 0.16 * sp * z) % 1) + 1) % 1) * fr.h * 1.1;
            const x = fr.x + ((((x0 + Math.sin(t * 1.3 + ph) * 0.02 + t * 0.03 * wind) % 1) + 1) % 1) * fr.w;
            const fl = 0.55 + 0.45 * Math.sin(t * 9 + ph * 3);
            const R = 1.8 * unit * z * sz;
            const g = ctx.createRadialGradient(x, y, 0, x, y, R * 3.5); g.addColorStop(0, `rgba(255,220,140,${0.9 * fl})`); g.addColorStop(0.35, `rgba(255,120,30,${0.6 * fl})`); g.addColorStop(1, 'rgba(255,60,0,0)');
            ctx.fillStyle = g; ctx.fillRect(x - R * 3.5, y - R * 3.5, R * 7, R * 7);
          } else if (s.look === 'ash') {
            const y = fr.y + (((y0 + t * 0.05 * sp * z) % 1) * fr.h), x = fr.x + ((((x0 + Math.sin(t * 0.7 + ph) * 0.015 + t * 0.02 * wind) % 1) + 1) % 1) * fr.w;
            ctx.fillStyle = `rgba(${150 + Math.round(rr() * 40)},${145 + Math.round(rr() * 30)},140,${0.7 * z})`;
            ctx.save(); ctx.translate(x, y); ctx.rotate(t * spin); ctx.fillRect(-2 * unit * z * sz, -1.2 * unit * z * sz, 4 * unit * z * sz, 2.4 * unit * z * sz); ctx.restore();
          } else {
            const fall = s.look === 'petals' ? 0.06 : 0.085;
            const y = fr.y + (((y0 + t * fall * sp * z) % 1) * fr.h * 1.1) - fr.h * 0.05;
            const x = fr.x + ((((x0 + Math.sin(t * 1.4 + ph) * 0.035 + t * 0.05 * wind * sp) % 1) + 1) % 1) * fr.w;
            const size = (s.look === 'petals' ? 4.5 : 7.5) * unit * z * sz;
            leafShape(ctx, x, y, size, t * spin + ph, cols[i % cols.length], Math.cos(t * 2.2 + ph));
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'sandstorm': {
        const sp = +s.speed || 1, wind = s.wind ?? 1;
        const g = ctx.createLinearGradient(0, fr.y, 0, fr.y + fr.h);
        g.addColorStop(0, `rgba(196,150,90,${0.45 * Math.min(1, k)})`); g.addColorStop(1, `rgba(170,120,60,${0.65 * Math.min(1, k)})`);
        ctx.fillStyle = g; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
        const rr = rng(hashStr(L.id));
        for (let i = 0; i < 14; i++) {
          const y = fr.y + rr() * fr.h, x = fr.x + ((((rr() + t * 0.12 * sp * wind * (0.6 + rr())) % 1.4) + 1.4) % 1.4 - 0.2) * fr.w, R = (0.15 + rr() * 0.25) * fr.w;
          const gg = ctx.createRadialGradient(x, y, 0, x, y, R); gg.addColorStop(0, `rgba(210,165,100,${0.35 * k})`); gg.addColorStop(1, 'rgba(210,165,100,0)');
          ctx.fillStyle = gg; ctx.fillRect(x - R, y - R, R * 2, R * 2);
        }
        for (let i = 0; i < Math.round(500 * k); i++) {
          const y = fr.y + rr() * fr.h, x = fr.x + ((((rr() + t * 0.9 * sp * wind * (0.5 + rr())) % 1) + 1) % 1) * fr.w;
          ctx.strokeStyle = `rgba(235,200,150,${0.35 * rr()})`; ctx.lineWidth = 1 * unit;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 16 * unit * wind, y + 1.5 * unit); ctx.stroke();
        }
        break;
      }
      case 'lightning': {
        const every = 3 / (+s.speed || 1);
        for (let back = 0; back < 2; back++) {
          const slot = Math.floor(t / every) - back, rs = rng(hashStr(L.id) + slot * 977), at = slot * every + rs() * every * 0.6, dt = t - at;
          if (dt < 0 || dt > 0.5) continue;
          const fl = dt < 0.05 ? 1 : dt < 0.1 ? 0.25 : dt < 0.16 ? 0.9 : Math.max(0, 0.7 - dt * 1.4);
          ctx.fillStyle = hexA(s.color || '#dfe8ff', 0.5 * fl * Math.min(1, k)); ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
          ctx.strokeStyle = `rgba(245,248,255,${fl})`; ctx.shadowColor = '#a8c4ff'; ctx.shadowBlur = 22 * unit;
          bolt(ctx, rng(hashStr(L.id) + slot * 31), fr.x + fr.w * (0.15 + rs() * 0.7), fr.y, fr.h * (0.6 + rs() * 0.4), 3 * unit);
          ctx.shadowBlur = 0;
        }
        break;
      }
      case 'sunrays': {
        ctx.globalCompositeOperation = 'screen';
        const cx = fr.x + fr.w * (s.side === 'right' ? 0.92 : 0.08), cy = fr.y - fr.h * 0.08;
        const col = s.color && s.color !== '#ff8a3d' ? s.color : '#ffe6a8';
        const R = Math.hypot(fr.w, fr.h) * 1.1;
        for (let i = 0; i < 9; i++) {
          const a0 = (s.side === 'right' ? Math.PI * 0.55 : Math.PI * 0.05) + i * 0.11 + Math.sin(t * 0.25 + i) * 0.02, wd = 0.03 + (i % 3) * 0.015;
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
          g.addColorStop(0, hexA(col, 0.42 * k * (0.6 + 0.4 * Math.sin(t * 0.7 + i * 1.7)))); g.addColorStop(1, hexA(col, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a0 + wd); ctx.closePath(); ctx.fill();
        }
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, fr.h * 0.6); glow.addColorStop(0, hexA(col, 0.55 * k)); glow.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = glow; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'mist': {
        const rr = rng(hashStr(L.id));
        const sp = +s.speed || 1;
        for (let i = 0; i < 9; i++) {
          const y = fr.y + (0.25 + rr() * 0.8) * fr.h, R = (0.25 + rr() * 0.3) * fr.w;
          const x = fr.x + ((((rr() + t * 0.025 * sp * (0.5 + rr())) % 1.6) + 1.6) % 1.6 - 0.3) * fr.w;
          const g = ctx.createRadialGradient(x, y, 0, x, y, R);
          g.addColorStop(0, `rgba(235,240,245,${0.42 * k})`); g.addColorStop(1, 'rgba(235,240,245,0)');
          ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.35); ctx.translate(-x, -y); ctx.fillStyle = g; ctx.fillRect(x - R, y - R, R * 2, R * 2); ctx.restore();
        }
        break;
      }
      case 'rain': case 'snow': {
        const n = Math.round((s.look === 'rain' ? 380 : 260) * k);
        const rr = rng(hashStr(L.id));
        const sp = +s.speed || 1;
        for (let i = 0; i < n; i++) {
          const x0 = rr(), y0 = rr(), z = 0.5 + rr();
          if (s.look === 'rain') {
            const y = fr.y + (((y0 + t * 1.8 * sp * z) % 1) * fr.h);
            const x = fr.x + (((x0 + t * 0.25 * sp * z) % 1) * fr.w);
            ctx.strokeStyle = `rgba(200,215,235,${0.35 * z})`; ctx.lineWidth = 1 * unit * z;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4 * unit * z, y + 18 * unit * z); ctx.stroke();
          } else {
            const y = fr.y + (((y0 + t * 0.12 * sp * z) % 1) * fr.h);
            const x = fr.x + (((x0 + Math.sin(t * 0.8 + i) * 0.01) % 1 + 1) % 1) * fr.w;
            ctx.fillStyle = `rgba(255,255,255,${0.75 * z})`;
            ctx.beginPath(); ctx.arc(x, y, 1.6 * unit * z, 0, Math.PI * 2); ctx.fill();
          }
        }
        if (s.look === 'rain') { ctx.fillStyle = `rgba(40,55,75,${0.18 * k})`; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); }
        break;
      }
      default: break;
    }
    ctx.restore();
  }
}
function hexA(hex, a) {
  const h = String(hex || '#fff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------------------------------------------------------------- your videos on screen
export function drawVideoLayer(ctx, L, tm, o) {
  const { frame: fr, unit } = o;
  const s = L.style;
  const v = videoFor(s.media);
  const full = s.fit === 'full';
  const ar = v?.ready ? (v.el.videoWidth || 16) / (v.el.videoHeight || 9) : 16 / 9;
  const W = full ? fr.w : fr.w * clamp(+s.width || 0.36, 0.05, 1), H = full ? fr.h : W / ar;
  const m = 30 * unit;
  let x = fr.x + fr.w - m - W, y = fr.y + m;
  const pos = s.position || 'top-right';
  if (pos.includes('left')) x = fr.x + m;
  if (pos.includes('bottom')) y = fr.y + fr.h - m - H;
  if (pos === 'center') { x = fr.x + (fr.w - W) / 2; y = fr.y + (fr.h - H) / 2; }
  if (full) { x = fr.x; y = fr.y; }
  const D = Math.max(0.1, +L.duration || 1);
  let a = tm.alpha * (+s.opacity || 1);
  let sc = 1;
  if (!tm.edit) {
    const u = clamp(tm.tau / Math.min(0.6, D), 0, 1);
    if (L.anim === 'fade') a *= ease(u);
    if (L.anim === 'pop') sc = 0.6 + 0.4 * (1 + 2.7 * (u - 1) ** 3 + 1.7 * (u - 1) ** 2);
  }
  ctx.save();
  if (!full) placeAt(ctx, L, fr, x, y, W, H);
  ctx.globalAlpha *= a;
  ctx.translate(x + W / 2, y + H / 2); ctx.scale(sc, sc); ctx.translate(-(x + W / 2), -(y + H / 2));
  const rad = full ? 0 : (+s.radius ?? 10) * unit;
  const keyed = s.key && s.key !== 'none';
  if (!full && s.shadow !== false && !keyed) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 24 * unit; ctx.shadowOffsetY = 8 * unit; ctx.fillStyle = '#000'; rr(ctx, x, y, W, H, rad); ctx.fill(); ctx.restore(); }
  ctx.save();
  rr(ctx, x, y, W, H, rad); ctx.clip();
  if (v?.ready) {
    if (!o.exact) {
      const target = videoTime(L, tm, v.el.duration || 0);
      if (Math.abs(v.el.currentTime - target) > 0.08) { try { v.el.currentTime = target; } catch { /* not ready */ } }
    }
    // cover
    const vr = (v.el.videoWidth || 16) / (v.el.videoHeight || 9), br = W / H;
    let dw = W, dh = H;
    if (vr > br) dw = H * vr; else dh = W / vr;
    const src = s.key && s.key !== 'none' ? chromaKey(v.el, s, Math.round(Math.min(1280, dw))) : v.el;
    try { ctx.drawImage(src, x + (W - dw) / 2, y + (H - dh) / 2, dw, dh); } catch { /* frame not ready */ }
  } else {
    ctx.fillStyle = 'rgba(20,24,30,0.85)'; ctx.fillRect(x, y, W, H);
    ctx.fillStyle = '#fff'; ctx.font = `600 ${14 * unit}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s.media ? 'Loading video…' : 'Choose a video', x + W / 2, y + H / 2);
  }
  ctx.restore();
  if (!full && +s.border > 0) { ctx.strokeStyle = s.borderColor || '#ffffff'; ctx.lineWidth = +s.border * unit; rr(ctx, x, y, W, H, rad); ctx.stroke(); }
  if (!full && s.caption) {
    ctx.font = `700 ${13 * unit}px Inter, sans-serif`;
    const tw = ctx.measureText(s.caption).width + 18 * unit;
    ctx.fillStyle = s.borderColor || '#d71920'; ctx.fillRect(x, y + H - 26 * unit, tw, 26 * unit);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(s.caption, x + 9 * unit, y + H - 13 * unit);
  }
  ctx.restore();
}
const rr = (c, x, y, w, h, r) => { c.beginPath(); if (r > 0 && c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
export function videoTime(L, tm, dur) {
  const s = L.style;
  let t = Math.max(0, tm.edit ? 0.5 : tm.tau) * (+s.speed || 1) + (+s.trim || 0);
  if (s.loop && dur > 0) t %= dur;
  return Math.min(t, Math.max(0, dur - 0.04));
}

// ---------------------------------------------------------------- green screen (chroma key)
let keyCv = null;
/** Remove a green / blue / custom background from a video frame. Returns a canvas with transparency. */
export function chromaKey(el, s, maxW = 1280) {
  const vw = el.videoWidth || 0, vh = el.videoHeight || 0;
  if (!vw || !vh) return el;
  const w = Math.max(16, Math.min(vw, maxW)), h = Math.max(16, Math.round((vh * w) / vw));
  keyCv ||= document.createElement('canvas');
  if (keyCv.width !== w || keyCv.height !== h) { keyCv.width = w; keyCv.height = h; }
  const c = keyCv.getContext('2d', { willReadFrequently: true });
  c.clearRect(0, 0, w, h);
  c.drawImage(el, 0, 0, w, h);
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  const mode = s.key;
  let kr = 0, kg = 177, kb = 64;
  if (mode === 'blue') { kr = 0; kg = 71; kb = 187; }
  if (mode === 'custom') { const n = parseInt(String(s.keyColor || '#00b140').slice(1), 16); kr = (n >> 16) & 255; kg = (n >> 8) & 255; kb = n & 255; }
  const tol = clamp(+s.tolerance || 0.38, 0.02, 1), soft = clamp(+s.softness ?? 0.12, 0, 0.6), spill = s.spill !== false;
  // work in chroma (colour without brightness) so shadows on the screen are keyed too
  const kY = 0.299 * kr + 0.587 * kg + 0.114 * kb, kCb = kb - kY, kCr = kr - kY;
  const kLen = Math.hypot(kCb, kCr) || 1;
  const domG = mode === 'green' || (mode === 'custom' && kg >= kr && kg >= kb);
  const domB = mode === 'blue' || (mode === 'custom' && kb > kr && kb > kg);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const Y = 0.299 * r + 0.587 * g + 0.114 * b, Cb = b - Y, Cr = r - Y;
    const dist = Math.hypot(Cb - kCb, Cr - kCr) / kLen; // 0 = exactly the key colour
    let a = 1;
    if (dist < tol) a = 0; else if (dist < tol + soft) a = (dist - tol) / soft;
    if (a < 1 && spill) {
      if (domG && g > Math.max(r, b)) d[i + 1] = Math.max(r, b);
      if (domB && b > Math.max(r, g)) d[i + 2] = Math.max(r, g);
    } else if (spill) {
      if (domG && g > (r + b) / 2 + 8) d[i + 1] = Math.round((r + b) / 2 + 8);
      if (domB && b > (r + g) / 2 + 8) d[i + 2] = Math.round((r + g) / 2 + 8);
    }
    d[i + 3] = Math.round(d[i + 3] * a);
  }
  c.putImageData(img, 0, 0);
  return keyCv;
}
