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
};

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
  if (!full && s.shadow !== false) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 24 * unit; ctx.shadowOffsetY = 8 * unit; ctx.fillStyle = '#000'; rr(ctx, x, y, W, H, rad); ctx.fill(); ctx.restore(); }
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
    try { ctx.drawImage(v.el, x + (W - dw) / 2, y + (H - dh) / 2, dw, dh); } catch { /* frame not ready */ }
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
