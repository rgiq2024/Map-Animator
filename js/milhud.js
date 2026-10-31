// Military & intelligence HUDs: a GEOINT drone feed (tinted map, scan lines, gauge, ruler),
// a command-and-control video wall (screens that power on, KPIs, gauges, event log, stack lights),
// an operations dashboard, a SIGINT intercept panel (waterfall + Morse) and Morse-code text.
import { placeAt } from './place.js';

const MONO = '"JetBrains Mono",ui-monospace,Menlo,monospace';
const UI = '"Inter","Segoe UI",system-ui,sans-serif';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const h2 = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function hexA(hex, a) {
  const h = (hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const fmtLat = (v) => `${Math.abs(v).toFixed(4)}°${v >= 0 ? 'N' : 'S'}`;
const fmtLon = (v) => `${Math.abs(v).toFixed(4)}°${v >= 0 ? 'E' : 'W'}`;
const tcode = (t) => `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const clock = (start, t) => {
  const m = String(start || '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  let s = (m ? +m[1] * 3600 + +m[2] * 60 + +(m[3] || 0) : 20 * 3600 + 45 * 60) + Math.floor(t);
  s %= 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const pairs = (txt) => String(txt || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  const i = l.lastIndexOf(':');
  if (i < 0) return { label: l, value: NaN, raw: '' };
  const raw = l.slice(i + 1).trim();
  return { label: l.slice(0, i).trim(), value: parseFloat(raw.replace(/,/g, '')), raw, suffix: raw.replace(/^[-\d.,\s]+/, '') };
});
const fmtNum = (v, raw) => {
  const dp = ((raw || '').split('.')[1] || '').replace(/\D.*/, '').length;
  return v.toLocaleString('en', { minimumFractionDigits: dp, maximumFractionDigits: dp });
};
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
const brackets = (ctx, x, y, w, h, b) => {
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(cx, cy + sy * b); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * b, cy); ctx.stroke();
  }
};

// ================================================================= Morse code
const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--',
  N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.', '-': '-....-', '=': '-...-', '+': '.-.-.', '@': '.--.-.', '!': '-.-.--', ':': '---...',
};
export const toMorse = (text) => String(text || '').toUpperCase().split(/\s+/).filter(Boolean).map((w) => [...w].map((c) => MORSE[c] || '').filter(Boolean).join(' ')).join(' / ');
/** Timing of a Morse message: key-down elements and per-character windows (seconds). */
export function morseTimeline(text, wpm = 15) {
  const dot = 1.2 / clamp(+wpm || 15, 4, 40);
  const els = [], chars = [];
  let t = 0;
  const words = String(text || 'SOS').toUpperCase().split(/\s+/).filter(Boolean);
  words.forEach((wd, wi) => {
    for (const ch of wd) {
      const code = MORSE[ch];
      if (!code) continue;
      const start = t;
      [...code].forEach((sym, k) => {
        const d = (sym === '.' ? 1 : 3) * dot;
        els.push({ t, d, sym, ci: chars.length });
        t += d + (k < code.length - 1 ? dot : 0);
      });
      chars.push({ ch, code, start, end: t, word: wi });
      t += 3 * dot;
    }
    t += 4 * dot;
  });
  return { dot, els, chars, total: Math.max(dot, t - 7 * dot), words: words.length };
}
const keyOn = (tl, e) => tl.els.some((x) => e >= x.t && e < x.t + x.d);
export const MORSE_DELAY = 0.4;
const tlCache = new Map();
const timeline = (text, wpm) => { const k = `${wpm}|${text}`; if (!tlCache.has(k)) { if (tlCache.size > 50) tlCache.clear(); tlCache.set(k, morseTimeline(text, wpm)); } return tlCache.get(k); };

/** Morse-code HUD text: dots and dashes keyed out with a signal lamp, letters decoded underneath. */
export function drawMorseText(ctx, L, tm, o) {
  const { frame, unit } = o;
  const s = L.style;
  const k = +s.size || 1;
  const col = s.color || '#ffb020';
  const text = String(s.text || 'SOS').replace(/\n+/g, ' ').trim() || 'SOS';
  const tl = timeline(text, s.wpm || 15);
  const el = tm.edit ? tl.total + 1 : (tm.tau - MORSE_DELAY);
  const on = !tm.edit && keyOn(tl, el);
  const alpha = tm.alpha * (L.anim === 'fade' && !tm.edit ? ease(tm.tau / 0.4) : 1);
  if (alpha <= 0.01) return;
  const dotR = 4 * unit * k, dashW = 18 * unit * k, gapE = 6 * unit * k, gapC = 16 * unit * k, gapW = 30 * unit * k;
  const groupW = (code) => [...code].reduce((a, c) => a + (c === '.' ? dotR * 2 : dashW), 0) + gapE * (code.length - 1);
  // lay out characters into rows that fit
  const maxW = Math.min(frame.w * 0.62, 1000 * unit);
  const rows = [[]];
  let rowW = 0, lastWord = 0;
  tl.chars.forEach((c, i) => {
    const gw = Math.max(groupW(c.code), 14 * unit * k);
    const gap = i === 0 ? 0 : c.word !== lastWord ? gapW : gapC;
    if (rowW + gap + gw > maxW && rows.at(-1).length) { rows.push([]); rowW = 0; }
    const g2 = rows.at(-1).length ? gap : 0;
    rows.at(-1).push({ c, i, x: rowW + g2, gw });
    rowW += g2 + gw; lastWord = c.word;
  });
  const contentW = Math.max(...rows.map((r) => (r.length ? r.at(-1).x + r.at(-1).gw : 0)), 160 * unit);
  const pad = 18 * unit * k, rowH = 50 * unit * k, headH = 30 * unit * k, waveH = s.wave !== false ? 34 * unit * k : 0;
  const W = contentW + pad * 2, H = headH + rows.length * rowH + waveH + pad * 1.4;
  const m = 30 * unit;
  const pos = s.position || 'bottom-left';
  let x = frame.x + m, y = frame.y + m;
  if (pos.includes('right')) x = frame.x + frame.w - m - W;
  if (pos === 'top' || pos === 'bottom' || pos === 'center') x = frame.x + (frame.w - W) / 2;
  if (pos.includes('bottom')) y = frame.y + frame.h - m - H;
  if (pos === 'center') y = frame.y + (frame.h - H) / 2;
  ctx.save();
  ctx.globalAlpha *= alpha;
  placeAt(ctx, L, frame, x, y, W, H);
  ctx.fillStyle = 'rgba(6,7,6,0.82)'; rr(ctx, x, y, W, H, 6 * unit); ctx.fill();
  ctx.strokeStyle = hexA(col, 0.55); ctx.lineWidth = 1.2 * unit; ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = 2 * unit; brackets(ctx, x - 3 * unit, y - 3 * unit, W + 6 * unit, H + 6 * unit, 12 * unit);
  // header: lamp, label, WPM
  const lx = x + pad + 7 * unit * k, ly = y + headH * 0.6;
  ctx.save();
  ctx.fillStyle = on ? col : hexA(col, 0.18); ctx.shadowColor = col; ctx.shadowBlur = on ? 22 * unit : 0;
  ctx.beginPath(); ctx.arc(lx, ly, 7 * unit * k, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.font = `800 ${12 * unit * k}px ${MONO}`; ctx.textAlign = 'left';
  ctx.fillText(s.label || 'MORSE · CW', lx + 16 * unit * k, ly);
  ctx.textAlign = 'right'; ctx.globalAlpha *= 0.75;
  const done = el >= tl.total;
  ctx.fillText(done ? 'RX COMPLETE' : `${Math.round(+s.wpm || 15)} WPM  ${on ? 'TX ▮' : 'TX ▯'}`, x + W - pad, ly);
  ctx.globalAlpha /= 0.75;
  // the code groups and decoded letters
  rows.forEach((row, ri) => {
    const by = y + headH + ri * rowH + 14 * unit * k;
    for (const g of row) {
      const c = g.c;
      if (el < c.start) continue;
      let ex = x + pad + g.x + (g.gw - groupW(c.code)) / 2;
      const ces = tl.els.filter((z) => z.ci === g.i);
      [...c.code].forEach((sym, kk) => {
        const e = ces[kk];
        const vis = e && el >= e.t;
        const live = e && el >= e.t && el < e.t + e.d;
        if (vis) {
          ctx.save();
          ctx.fillStyle = live ? '#ffffff' : col; ctx.shadowColor = col; ctx.shadowBlur = live ? 16 * unit : 4 * unit;
          if (sym === '.') { ctx.beginPath(); ctx.arc(ex + dotR, by, dotR, 0, Math.PI * 2); ctx.fill(); }
          else { const grow = live ? clamp((el - e.t) / e.d, 0.15, 1) : 1; rr(ctx, ex, by - dotR, dashW * grow, dotR * 2, dotR); ctx.fill(); }
          ctx.restore();
        }
        ex += (sym === '.' ? dotR * 2 : dashW) + gapE;
      });
      if (el >= c.end) {
        const u = clamp((el - c.end) / 0.15, 0, 1);
        ctx.save(); ctx.globalAlpha *= u; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
        ctx.font = `800 ${17 * unit * k}px ${MONO}`; ctx.shadowColor = col; ctx.shadowBlur = 8 * unit;
        ctx.fillText(c.ch, x + pad + g.x + g.gw / 2, by + 22 * unit * k - (1 - u) * 6 * unit);
        ctx.restore();
      }
    }
  });
  // scrolling key waveform
  if (waveH) {
    const wy = y + H - pad * 0.7 - waveH * 0.5, ww = W - pad * 2, span = 2.4;
    ctx.save();
    ctx.strokeStyle = hexA(col, 0.2); ctx.lineWidth = 1 * unit;
    ctx.beginPath(); ctx.moveTo(x + pad, wy + waveH * 0.3); ctx.lineTo(x + pad + ww, wy + waveH * 0.3); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 1.8 * unit; ctx.shadowColor = col; ctx.shadowBlur = 6 * unit;
    ctx.beginPath();
    const N = 220;
    for (let i = 0; i <= N; i++) {
      const tt = el - span + (i / N) * span;
      const hi = tt >= 0 && keyOn(tl, tt);
      const px = x + pad + (i / N) * ww, py = wy + (hi ? -waveH * 0.3 : waveH * 0.3);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// ================================================================= variants
export const MIL_HUD = {
  geoint: 'GEOINT drone feed (blue)', c2: 'Command & control video wall', ops: 'Operations dashboard', sigint: 'Signals intercept (SIGINT)',
};
const TINTS = {
  blue: 'grayscale(1) sepia(1) hue-rotate(170deg) saturate(1.9) contrast(1.35) brightness(0.92)',
  green: 'grayscale(1) sepia(1) hue-rotate(60deg) saturate(2.2) contrast(1.4) brightness(0.9)',
  amber: 'grayscale(1) sepia(1) hue-rotate(-12deg) saturate(2.4) contrast(1.35) brightness(0.92)',
  grey: 'grayscale(1) contrast(1.45) brightness(0.95)',
  none: '',
};
export const GEOINT_TINTS = { blue: 'Blue', green: 'Night-vision green', amber: 'Amber', grey: 'Black & white', none: 'Natural colours' };
/** CSS filter the map gets while a GEOINT HUD is on. */
export const milFilter = (L) => (L.style?.variant === 'geoint' ? TINTS[L.style.tint || 'blue'] ?? TINTS.blue : '');

export function drawMilHUD(ctx, L, tm, o) {
  const v = L.style.variant;
  ctx.save();
  if (v !== 'sigint') { ctx.beginPath(); ctx.rect(o.frame.x, o.frame.y, o.frame.w, o.frame.h); ctx.clip(); }
  if (v === 'geoint') geoint(ctx, L, tm, o);
  else if (v === 'c2') c2wall(ctx, L, tm, o);
  else if (v === 'ops') opsBoard(ctx, L, tm, o);
  else if (v === 'sigint') sigint(ctx, L, tm, o);
  ctx.restore();
}

function bootAlpha(L, tm) {
  if (tm.edit || L.anim === 'none') return tm.alpha;
  const u = clamp(tm.tau / Math.max(0.1, +L.duration || 1), 0, 1);
  return tm.alpha * (L.anim === 'fade' ? ease(u) : clamp(u * 3, 0, 1));
}

// ---------------------------------------------------------------- GEOINT drone feed
function geoint(ctx, L, tm, o) {
  const { frame, unit } = o;
  const { x, y, w, h } = frame;
  const s = L.style, t = o.time ?? 0, view = o.view || {};
  const col = s.color || '#ffffff';
  ctx.globalAlpha *= bootAlpha(L, tm);
  // scan lines + rolling band + grain
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const step = 4.2 * unit * (+s.lines || 1);
  ctx.fillStyle = `rgba(0,0,0,${0.42 * (s.scan === false ? 0 : 1)})`;
  for (let yy = y + ((t * 6 * unit) % step); yy < y + h; yy += step) ctx.fillRect(x, yy, w, step * 0.42);
  const band = y + ((t * 0.18) % 1.2) * h * 1.2 - h * 0.1;
  const g = ctx.createLinearGradient(0, band - 70 * unit, 0, band + 70 * unit);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(210,235,255,0.07)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(x, band - 70 * unit, w, 140 * unit);
  const r = rng(hashStr(L.id) + Math.floor(t * 24));
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 220; i++) ctx.fillRect(x + r() * w, y + r() * h, 1.6 * unit, 1.2 * unit);
  // a bright interference line now and then
  if (r() < 0.08 && !tm.edit) { ctx.fillStyle = 'rgba(220,240,255,0.18)'; ctx.fillRect(x, y + r() * h, w, 3 * unit); }
  const vg = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.35, x + w / 2, y + h / 2, Math.hypot(w, h) * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,8,20,0.5)');
  ctx.fillStyle = vg; ctx.fillRect(x, y, w, h);
  ctx.restore();

  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 3 * unit;
  const fx = x + w * 0.145, fy = y + h * 0.09, fw = w * 0.705, fh = h * 0.8;
  const u = tm.edit ? 1 : easeOut(tm.tau / Math.max(0.3, +L.duration || 1));
  // main frame draws itself in
  ctx.lineWidth = 3 * unit;
  ctx.save(); ctx.globalAlpha *= 0.92;
  const per = 2 * (fw + fh), len = per * u;
  ctx.setLineDash([len, per]); ctx.strokeRect(fx, fy, fw, fh); ctx.setLineDash([]);
  ctx.restore();
  // zoom gauge on the left
  const gx = x + w * 0.072, gy = y + h * 0.095, gw = w * 0.058, gh = h * 0.5;
  ctx.lineWidth = 2.6 * unit;
  ctx.strokeRect(gx, gy, gw, gh);
  for (const f of [0.15, 0.33, 0.66, 0.84]) { ctx.beginPath(); ctx.moveTo(gx, gy + gh * f); ctx.lineTo(gx + gw, gy + gh * f); ctx.stroke(); }
  const zf = clamp(((view.zoom ?? 12) - 3) / 16, 0, 1);
  const segH = gh * 0.17, by = gy + (1 - zf) * (gh - segH);
  ctx.save(); ctx.globalAlpha *= 0.55; ctx.fillRect(gx + 2 * unit, by, gw - 4 * unit, segH); ctx.restore();
  const chx = fx + 22 * unit, chy = by + segH / 2;
  ctx.beginPath(); ctx.moveTo(chx + 22 * unit, chy - 18 * unit); ctx.lineTo(chx, chy); ctx.lineTo(chx + 22 * unit, chy + 18 * unit); ctx.lineWidth = 2 * unit; ctx.stroke();
  // centre cross
  const cx = fx + fw / 2, cy = fy + fh / 2;
  ctx.lineWidth = 2.4 * unit;
  const ch = 48 * unit * u;
  ctx.beginPath(); ctx.moveTo(cx - ch * 1.8, cy); ctx.lineTo(cx + ch * 1.8, cy); ctx.moveTo(cx, cy - ch * 1.3); ctx.lineTo(cx, cy + ch * 1.3); ctx.stroke();
  // lower brackets
  ctx.lineWidth = 2.6 * unit;
  for (const bx0 of [fx + fw * 0.065, fx + fw * 0.785]) {
    const bw = fw * 0.15, bh = fh * 0.05, by0 = fy + fh * 0.79;
    ctx.beginPath(); ctx.moveTo(bx0, by0); ctx.lineTo(bx0, by0 + bh); ctx.lineTo(bx0 + bw, by0 + bh); ctx.lineTo(bx0 + bw, by0); ctx.stroke();
  }
  // heading ruler under the frame
  const rx0 = fx + fw * 0.16, rx1 = fx + fw * 0.83, ry = fy + fh + h * 0.045, sp = 37 * unit;
  const off = (((view.bearing || 0) * 4 * unit) % sp + sp) % sp;
  ctx.save(); ctx.beginPath(); ctx.rect(rx0 - 4 * unit, ry - 40 * unit, rx1 - rx0 + 8 * unit, 80 * unit); ctx.clip();
  ctx.lineWidth = 4 * unit;
  for (let xx = rx0 - sp + off; xx <= rx1; xx += sp) { ctx.beginPath(); ctx.moveTo(xx, ry); ctx.lineTo(xx, ry + 30 * unit); ctx.stroke(); }
  ctx.restore();
  ctx.lineWidth = 2 * unit;
  ctx.beginPath(); ctx.moveTo(cx, ry - 12 * unit); ctx.lineTo(cx - 7 * unit, ry - 22 * unit); ctx.lineTo(cx + 7 * unit, ry - 22 * unit); ctx.closePath(); ctx.fill();
  // read-outs
  ctx.font = `700 ${12 * unit}px ${MONO}`; ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(`${s.label || 'GEOINT · EO/IR'}`, fx + 12 * unit, fy - 16 * unit);
  ctx.fillText(`ZOOM ${(view.zoom ?? 0).toFixed(1)}  ALT ${Math.round(view.altM || 0).toLocaleString('en')} M`, fx + 12 * unit, fy + fh + 18 * unit);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.sin(t * 5) > 0 ? '●' : '○'} REC  ${tcode(t)}`, fx + fw - 12 * unit, fy - 16 * unit);
  if (s.coords !== false && view.center) ctx.fillText(`${fmtLat(view.center[1])}  ${fmtLon(view.center[0])}`, fx + fw - 12 * unit, fy + fh + 18 * unit);
  ctx.textAlign = 'center';
  ctx.fillText(`HDG ${String(Math.round((((view.bearing || 0) % 360) + 360) % 360)).padStart(3, '0')}°`, cx, ry + 46 * unit);
  // detections on the other point layers
  ctx.lineWidth = 1.6 * unit;
  for (const q of scenePts(o, L)) {
    const [qx, qy] = o.proj(q.ll);
    if (qx < fx || qx > fx + fw || qy < fy || qy > fy + fh) continue;
    const b = 26 * unit;
    brackets(ctx, qx - b, qy - b, b * 2, b * 2, 9 * unit);
    ctx.font = `700 ${10 * unit}px ${MONO}`; ctx.textAlign = 'left';
    ctx.fillText(`${(q.name || 'OBJ').toUpperCase().slice(0, 16)}  ${(0.81 + h2(q.id.length, 3) * 0.18).toFixed(2)}`, qx + b + 6 * unit, qy - b + 6 * unit);
  }
}
function scenePts(o, self) {
  const out = [];
  for (const L of o.scene?.layers || []) {
    if (L === self || L.hidden || !L.geom || L.geom.type !== 'Point') continue;
    out.push({ id: String(L.id), ll: L.geom.coordinates, name: L.style?.label || L.name || '' });
  }
  return out;
}

// ---------------------------------------------------------------- dashboard widgets
function panel(ctx, x, y, w, h, title, col, unit, right = '') {
  ctx.save();
  ctx.fillStyle = 'rgba(7,11,17,0.93)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = hexA(col, 0.28); ctx.lineWidth = 1 * unit; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = hexA(col, 0.12); ctx.fillRect(x, y, w, 22 * unit);
  ctx.fillStyle = col; ctx.fillRect(x, y, 3 * unit, 22 * unit);
  ctx.font = `800 ${10.5 * unit}px ${MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(title.toUpperCase(), x + 10 * unit, y + 11 * unit, w - 20 * unit);
  if (right) { ctx.textAlign = 'right'; ctx.fillStyle = '#9fb3c8'; ctx.fillText(right, x + w - 8 * unit, y + 11 * unit); }
  ctx.restore();
  return { x: x + 10 * unit, y: y + 30 * unit, w: w - 20 * unit, h: h - 38 * unit };
}
function kpis(ctx, R, items, u, t, seed, col, unit) {
  const n = Math.max(1, items.length);
  const rowH = R.h / n;
  items.forEach((it, i) => {
    const yy = R.y + i * rowH;
    const grow = easeOut(u * 1.3 - i * 0.12);
    let v = isFinite(it.value) ? it.value * grow : NaN;
    if (u >= 1 && isFinite(v)) v += Math.floor(t * (0.3 + h2(seed, i) * 0.8)) * (it.raw.includes('.') ? 0.1 : 1);
    const big = Math.min(rowH * 0.5, 34 * unit);
    ctx.font = `800 ${big}px ${UI}`; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(isFinite(v) ? `${fmtNum(v, it.raw)}${it.suffix ? ` ${it.suffix}` : ''}` : it.raw || it.label, R.x, yy + rowH * 0.58, R.w);
    ctx.font = `600 ${Math.min(rowH * 0.2, 11 * unit)}px ${MONO}`; ctx.fillStyle = hexA(col, 0.85);
    ctx.fillText(it.label.toUpperCase(), R.x, yy + rowH * 0.86, R.w);
    if (i < n - 1) { ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(R.x, yy + rowH - 1, R.w, 1); }
  });
}
function gauge(ctx, cx, cy, r, val, label, col, u, unit, t) {
  const v = clamp(val, 0, 100) * easeOut(u) + (u >= 1 ? Math.sin(t * 1.3) * 1.5 : 0);
  const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.16;
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
  const gr = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
  gr.addColorStop(0, '#ff5a52'); gr.addColorStop(0.55, '#ffb020'); gr.addColorStop(1, '#3ddc84');
  ctx.strokeStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + (a1 - a0) * (v / 100)); ctx.stroke();
  const na = a0 + (a1 - a0) * (v / 100);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * unit; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(na) * r * 0.72, cy + Math.sin(na) * r * 0.72); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 3.5 * unit, 0, Math.PI * 2); ctx.fill();
  ctx.font = `800 ${r * 0.42}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(Math.round(v)), cx, cy + r * 0.5);
  ctx.font = `600 ${Math.max(8 * unit, r * 0.16)}px ${MONO}`; ctx.fillStyle = hexA(col, 0.85);
  ctx.fillText(label.toUpperCase(), cx, cy + r * 0.92);
  ctx.restore();
}
const DONUT = ['#ffd43b', '#ff922b', '#ff5a52', '#4dabf7', '#3ddc84', '#b197fc'];
function donut(ctx, cx, cy, r, items, u, unit) {
  const tot = items.reduce((a, b) => a + (isFinite(b.value) ? b.value : 0), 0) || 1;
  let a = -Math.PI / 2;
  const sweep = Math.PI * 2 * easeOut(u);
  ctx.save();
  items.forEach((it, i) => {
    const da = (Math.max(0, it.value) / tot) * Math.PI * 2;
    const end = Math.min(a + da, -Math.PI / 2 + sweep);
    if (end > a) { ctx.fillStyle = DONUT[i % DONUT.length]; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a, end); ctx.closePath(); ctx.fill(); }
    a += da;
  });
  ctx.fillStyle = 'rgba(7,11,17,1)'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function legendList(ctx, x, y, w, items, unit) {
  ctx.save(); ctx.font = `600 ${10 * unit}px ${MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  items.slice(0, 6).forEach((it, i) => {
    const yy = y + i * 16 * unit;
    ctx.fillStyle = DONUT[i % DONUT.length]; ctx.fillRect(x, yy - 4 * unit, 8 * unit, 8 * unit);
    ctx.fillStyle = '#cfd8e3'; ctx.fillText(`${it.label.toUpperCase()}`, x + 14 * unit, yy, w - 50 * unit);
    ctx.textAlign = 'right'; ctx.fillText(it.raw, x + w, yy); ctx.textAlign = 'left';
  });
  ctx.restore();
}
function bars(ctx, R, n, t, seed, col, u) {
  const bw = R.w / n;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const v = 0.25 + 0.7 * (0.5 + 0.5 * Math.sin(t * (0.6 + h2(seed, i)) + i * 1.7)) * h2(seed + 9, i) + 0.05;
    const bh = R.h * v * easeOut(u * 1.4 - i * 0.02);
    ctx.fillStyle = hexA(col, 0.35 + 0.5 * v); ctx.fillRect(R.x + i * bw + 1, R.y + R.h - bh, bw - 2, bh);
  }
  ctx.restore();
}
function eventLog(ctx, R, lines, t, u, col, unit, start) {
  if (!lines.length) return;
  const lh = 15 * unit, rows = Math.max(1, Math.floor(R.h / lh));
  const every = 1.8;
  const n = Math.floor(Math.max(0, t) / every) + rows;
  ctx.save(); ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
  ctx.font = `600 ${10 * unit}px ${MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const frac = (Math.max(0, t) % every) / every;
  for (let r = 0; r < rows; r++) {
    const idx = n - rows + r;
    const yy = R.y + r * lh + lh / 2;
    const newest = r === rows - 1;
    let txt = `${clock(start, idx * every - rows * every).slice(0, 8)}  ${lines[idx % lines.length]}`;
    if (newest && u >= 1) txt = txt.slice(0, Math.ceil(txt.length * clamp(frac * 3, 0, 1)));
    const warn = /alert|warn|threat|breach|fail|fire|critical/i.test(lines[idx % lines.length]);
    ctx.fillStyle = warn ? '#ff6b61' : newest ? '#ffffff' : '#9fb3c8';
    ctx.globalAlpha = (0.45 + 0.55 * (r / rows)) * clamp(u * 2 - r * 0.05, 0, 1);
    ctx.fillText(txt, R.x, yy, R.w);
  }
  ctx.restore();
}
function miniRadar(ctx, cx, cy, r, t, seed, col, unit) {
  ctx.save();
  ctx.strokeStyle = hexA(col, 0.45); ctx.lineWidth = 1 * unit;
  for (const k of [0.33, 0.66, 1]) { ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, Math.PI * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
  const a = (t * 1.8) % (Math.PI * 2);
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a - 0.8, a); ctx.closePath(); ctx.fillStyle = hexA(col, 0.25); ctx.fill();
  const rr2 = rng(seed);
  for (let i = 0; i < 6; i++) {
    const ba = rr2() * Math.PI * 2, bd = 0.2 + rr2() * 0.75;
    let since = (a - ba) % (Math.PI * 2); if (since < 0) since += Math.PI * 2;
    const glow = Math.max(0, 1 - since / 4.5);
    ctx.fillStyle = hexA(i === 0 ? '#ff5a52' : col, 0.2 + 0.8 * glow);
    ctx.beginPath(); ctx.arc(cx + Math.cos(ba) * bd * r, cy + Math.sin(ba) * bd * r, 2.6 * unit, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function stackLight(ctx, x, yBase, hPole, unit, t, seed) {
  const sw = 9 * unit, sh = 11 * unit;
  ctx.save();
  ctx.fillStyle = '#2a2f36'; ctx.fillRect(x - 1.5 * unit, yBase - hPole, 3 * unit, hPole);
  ctx.fillStyle = '#1b1f24'; ctx.fillRect(x - 7 * unit, yBase - 4 * unit, 14 * unit, 4 * unit);
  const top = yBase - hPole - sh * 3;
  const lit = Math.floor(h2(seed, Math.floor(t / 3)) * 3);
  const blink = Math.sin(t * 6 + seed) > -0.2;
  ['#ff3b30', '#ffb020', '#2ee66b'].forEach((c, i) => {
    const on = i === lit && (i !== 0 || blink);
    ctx.fillStyle = on ? c : hexA(c, 0.25);
    ctx.shadowColor = c; ctx.shadowBlur = on ? 16 * unit : 0;
    ctx.fillRect(x - sw / 2, top + i * sh, sw, sh - 1.5 * unit);
  });
  ctx.shadowBlur = 0; ctx.fillStyle = '#d7dde4'; ctx.fillRect(x - sw / 2, top - 4 * unit, sw, 4 * unit);
  ctx.restore();
}

// ---------------------------------------------------------------- command & control video wall
function c2wall(ctx, L, tm, o) {
  const { frame, unit } = o;
  const { x, y, w, h } = frame;
  const s = L.style, t = o.time ?? 0;
  const col = s.color || '#38d0ff';
  const seed = hashStr(L.id);
  const D = Math.max(0.5, +L.duration || 2.5);
  const tau = tm.edit ? 99 : tm.tau;
  ctx.globalAlpha *= tm.alpha;
  const cols = 4, rowsN = 2, bz = 7 * unit, m = 6 * unit;
  const cw = (w - m * 2 - bz * (cols - 1)) / cols, chh = (h - m * 2 - bz * (rowsN - 1)) / rowsN;
  const cell = (i, j) => ({ x: x + m + i * (cw + bz), y: y + m + j * (chh + bz), w: cw, h: chh });
  // bezels
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rowsN; j++) { const c = cell(i, j); ctx.rect(c.x + c.w, c.y, -c.w, c.h); }
  ctx.fillStyle = '#07090c'; ctx.fill('evenodd');
  ctx.restore();
  const panels = s.panels !== false;
  const dash = panels ? { '0,0': 'kpi', '3,0': 'donut', '3,1': 'log', '0,1': 'radar' } : {};
  const order = [[1, 0], [2, 0], [1, 1], [2, 1], [0, 0], [3, 0], [0, 1], [3, 1]];
  const pts = scenePts(o, L).map((q) => ({ ...q, p: o.proj(q.ll) }));
  const feeds = String(s.feeds || 'CAM 01 · NORTH GATE\nSAT-07 · SECTOR B\nUAV-02 · LIVE\nCCTV 14 · PORT').split('\n');
  order.forEach(([i, j], k) => {
    const c = cell(i, j);
    const cu = clamp((tau - k * (D * 0.7 / order.length)) / 0.45, 0, 1);
    const kind = dash[`${i},${j}`];
    ctx.save();
    ctx.beginPath(); ctx.rect(c.x, c.y, c.w, c.h); ctx.clip();
    if (cu <= 0) { ctx.fillStyle = '#020304'; ctx.fillRect(c.x, c.y, c.w, c.h); ctx.restore(); return; }
    const u = clamp((tau - k * (D * 0.7 / order.length) - 0.25) / Math.max(0.5, D * 0.6), 0, 1);
    if (kind) {
      const R = panel(ctx, c.x, c.y, c.w, c.h, { kpi: s.kpiTitle || 'Situation', donut: s.donutTitle || 'Resources', log: 'Event log', radar: 'Air picture' }[kind], col, unit, kind === 'kpi' ? clock(s.clock, t) : kind === 'radar' ? 'LIVE' : '');
      if (kind === 'kpi') {
        const items = pairs(s.kpis || 'Incidents: 291\nUnits deployed: 486\nCalls today: 1,320');
        const kw = R.w * 0.55;
        kpis(ctx, { ...R, w: kw }, items, u, t, seed, col, unit);
        const gp = pairs(s.gauge || 'Readiness: 58')[0] || { value: 58, label: 'Readiness' };
        const gr = Math.min(R.w * 0.2, R.h * 0.32);
        gauge(ctx, R.x + kw + (R.w - kw) / 2, R.y + R.h * 0.45, gr, gp.value, gp.label, col, u, unit, t);
      } else if (kind === 'donut') {
        const items = pairs(s.donut || 'Ground: 45\nAir: 25\nNaval: 18\nCyber: 12');
        const r = Math.min(R.h * 0.42, R.w * 0.22);
        donut(ctx, R.x + r + 4 * unit, R.y + R.h * 0.45, r, items, u, unit);
        legendList(ctx, R.x + r * 2 + 18 * unit, R.y + R.h * 0.45 - (Math.min(items.length, 6) - 1) * 8 * unit, R.w - r * 2 - 18 * unit, items, unit);
      } else if (kind === 'log') {
        eventLog(ctx, R, String(s.log || 'UAV-02 on station\nConvoy at checkpoint 3\nALERT: perimeter breach sector B\nSAT-07 imagery received\nQRF dispatched\nComms check OK\nWarning: weather cell approaching').split('\n').filter(Boolean), Math.max(0, tau - k * 0.1), u, col, unit, s.clock);
      } else if (kind === 'radar') {
        const r = Math.min(R.w * 0.3, R.h * 0.44);
        miniRadar(ctx, R.x + r + 6 * unit, R.y + R.h / 2, r, t, seed, col, unit);
        bars(ctx, { x: R.x + r * 2 + 22 * unit, y: R.y + R.h * 0.2, w: R.w - r * 2 - 26 * unit, h: R.h * 0.6 }, 14, t, seed, col, u);
      }
    } else {
      // a live map feed: tint, scan lines, tag
      const fi = order.slice(0, 4).findIndex(([a, b]) => a === i && b === j);
      if (fi % 2 === 1) { ctx.fillStyle = 'rgba(0,30,60,0.22)'; ctx.fillRect(c.x, c.y, c.w, c.h); }
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      for (let yy = c.y; yy < c.y + c.h; yy += 3 * unit) ctx.fillRect(c.x, yy, c.w, 1 * unit);
      ctx.fillStyle = 'rgba(5,8,12,0.75)'; ctx.fillRect(c.x + 8 * unit, c.y + 8 * unit, 190 * unit, 20 * unit);
      ctx.font = `700 ${10 * unit}px ${MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillStyle = Math.sin(t * 4 + fi) > 0 ? '#ff3b30' : '#661510'; ctx.beginPath(); ctx.arc(c.x + 17 * unit, c.y + 18 * unit, 3.5 * unit, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e6edf5'; ctx.fillText((feeds[fi] || `FEED ${fi + 1}`).toUpperCase(), c.x + 26 * unit, c.y + 18 * unit, 168 * unit);
      ctx.strokeStyle = hexA(col, 0.6); ctx.lineWidth = 1.4 * unit; brackets(ctx, c.x + 6 * unit, c.y + 6 * unit, c.w - 12 * unit, c.h - 12 * unit, 14 * unit);
      // alert on any point layer inside this screen
      const hit = pts.find((q) => q.p[0] > c.x && q.p[0] < c.x + c.w && q.p[1] > c.y && q.p[1] < c.y + c.h);
      if (hit && u > 0.3) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 7);
        ctx.strokeStyle = `rgba(255,59,48,${0.5 + 0.5 * pulse})`; ctx.lineWidth = 4 * unit; ctx.strokeRect(c.x + 2 * unit, c.y + 2 * unit, c.w - 4 * unit, c.h - 4 * unit);
        ctx.fillStyle = '#ff3b30'; ctx.fillRect(c.x + c.w - 98 * unit, c.y + 8 * unit, 90 * unit, 20 * unit);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `900 ${10.5 * unit}px ${MONO}`; ctx.fillText('⚠ ALERT', c.x + c.w - 53 * unit, c.y + 18 * unit);
        const b = 20 * unit + pulse * 6 * unit;
        ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 2 * unit; brackets(ctx, hit.p[0] - b, hit.p[1] - b, b * 2, b * 2, 8 * unit);
        ctx.font = `700 ${10 * unit}px ${MONO}`; ctx.textAlign = 'left'; ctx.fillStyle = '#ff6b61';
        ctx.fillText((hit.name || 'CONTACT').toUpperCase().slice(0, 18), hit.p[0] + b + 5 * unit, hit.p[1] - b + 6 * unit);
      }
    }
    // power-on: a bright line that opens up into the picture
    if (cu < 1) {
      const open = easeOut(cu);
      const hh = Math.max(2 * unit, c.h * open);
      ctx.fillStyle = '#020304';
      ctx.fillRect(c.x, c.y, c.w, (c.h - hh) / 2); ctx.fillRect(c.x, c.y + (c.h + hh) / 2, c.w, (c.h - hh) / 2);
      ctx.fillStyle = `rgba(220,240,255,${0.85 * (1 - open)})`; ctx.fillRect(c.x, c.y + (c.h - hh) / 2, c.w, hh);
    }
    ctx.restore();
  });
  // header strip across the top bezel
  ctx.save();
  ctx.font = `800 ${9 * unit}px ${MONO}`; ctx.textBaseline = 'middle'; ctx.fillStyle = hexA(col, 0.9); ctx.textAlign = 'center';
  ctx.globalAlpha *= clamp(tau / 0.4, 0, 1);
  ctx.fillText(`${(s.label || 'COMMAND & CONTROL · OPS CENTER').toUpperCase()}   ·   UTC ${clock(s.clock, t)}`, x + w / 2, y + m + chh + bz / 2);
  ctx.restore();
  if (s.lights !== false) {
    const hp = h * 0.11;
    [0.31, 0.49, 0.69].forEach((fx2, i) => stackLight(ctx, x + w * fx2, y + h, hp, unit, t, seed + i * 7));
  }
}

// ---------------------------------------------------------------- operations dashboard (one monitor)
function opsBoard(ctx, L, tm, o) {
  const { frame, unit } = o;
  const { x, y, w, h } = frame;
  const s = L.style, t = o.time ?? 0;
  const col = s.color || '#38d0ff';
  const seed = hashStr(L.id);
  const D = Math.max(0.5, +L.duration || 2);
  const tau = tm.edit ? 99 : tm.tau;
  const u = clamp(tau / D, 0, 1);
  ctx.globalAlpha *= tm.alpha;
  const top = 38 * unit, bot = 30 * unit, lw = Math.min(w * 0.2, 300 * unit), rw = Math.min(w * 0.22, 320 * unit), g = 8 * unit;
  const slide = (k, dir) => (tm.edit ? 0 : (1 - easeOut(u * 1.6 - k * 0.12)) * dir * (dir < 0 ? lw : rw) * 1.2);
  // top bar
  ctx.save();
  ctx.globalAlpha *= clamp(tau / 0.3, 0, 1);
  ctx.fillStyle = 'rgba(7,11,17,0.94)'; ctx.fillRect(x, y, w, top);
  ctx.fillStyle = col; ctx.fillRect(x, y + top - 2 * unit, w * easeOut(u * 2), 2 * unit);
  ctx.font = `800 ${13 * unit}px ${MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
  ctx.fillText((s.label || 'OPERATIONS DASHBOARD').toUpperCase(), x + 16 * unit, y + top / 2);
  ctx.textAlign = 'right'; ctx.fillStyle = '#cfd8e3';
  ctx.fillText(`UTC ${clock(s.clock, t)}`, x + w - 16 * unit, y + top / 2);
  const st = (s.status || 'THREAT LEVEL: ELEVATED').toUpperCase();
  ctx.font = `900 ${11 * unit}px ${MONO}`;
  const sw = ctx.measureText(st).width + 22 * unit;
  ctx.fillStyle = Math.sin(t * 4) > -0.3 ? '#ff9f1a' : '#7a4a0c'; rr(ctx, x + w - 16 * unit - 150 * unit - sw, y + 8 * unit, sw, top - 16 * unit, 4 * unit); ctx.fill();
  ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.fillText(st, x + w - 16 * unit - 150 * unit - sw / 2, y + top / 2 + 1);
  ctx.restore();
  // left: KPI cards
  const items = pairs(s.kpis || 'Incidents: 291\nUnits deployed: 486\nCalls today: 1,320');
  const lh = (h - top - bot - g * (items.length + 1)) / Math.max(1, items.length);
  items.forEach((it, i) => {
    ctx.save(); ctx.translate(slide(i, -1), 0);
    const R = panel(ctx, x + g, y + top + g + i * (lh + g), lw, lh, it.label, col, unit);
    kpis(ctx, { x: R.x, y: R.y - 8 * unit, w: R.w, h: R.h + 8 * unit }, [{ ...it, label: s.kpiSub || 'last 24 h' }], u, t, seed + i, col, unit);
    bars(ctx, { x: R.x + R.w * 0.55, y: R.y + R.h * 0.15, w: R.w * 0.45, h: R.h * 0.45 }, 10, t, seed + i * 3, col, u);
    ctx.restore();
  });
  // right: donut, gauge, bars
  const rx = x + w - g - rw, rh = (h - top - bot - g * 4) / 3;
  ctx.save(); ctx.translate(slide(0, 1), 0);
  let R = panel(ctx, rx, y + top + g, rw, rh, s.donutTitle || 'Resources', col, unit);
  const dn = pairs(s.donut || 'Ground: 45\nAir: 25\nNaval: 18\nCyber: 12');
  const r = Math.min(R.h * 0.45, R.w * 0.22);
  donut(ctx, R.x + r, R.y + R.h / 2, r, dn, u, unit);
  legendList(ctx, R.x + r * 2 + 14 * unit, R.y + R.h / 2 - (Math.min(dn.length, 6) - 1) * 8 * unit, R.w - r * 2 - 14 * unit, dn, unit);
  ctx.restore();
  ctx.save(); ctx.translate(slide(1, 1), 0);
  R = panel(ctx, rx, y + top + g * 2 + rh, rw, rh, 'Readiness', col, unit);
  const gp = pairs(s.gauge || 'Readiness: 58')[0] || { value: 58, label: '' };
  gauge(ctx, R.x + R.w / 2, R.y + R.h * 0.5, Math.min(R.h * 0.42, R.w * 0.3), gp.value, gp.label, col, u, unit, t);
  ctx.restore();
  ctx.save(); ctx.translate(slide(2, 1), 0);
  R = panel(ctx, rx, y + top + g * 3 + rh * 2, rw, rh, 'Air picture', col, unit, 'LIVE');
  const rr3 = Math.min(R.h * 0.45, R.w * 0.25);
  miniRadar(ctx, R.x + rr3, R.y + R.h / 2, rr3, t, seed, col, unit);
  bars(ctx, { x: R.x + rr3 * 2 + 14 * unit, y: R.y + R.h * 0.15, w: R.w - rr3 * 2 - 14 * unit, h: R.h * 0.7 }, 12, t, seed + 5, col, u);
  ctx.restore();
  // centre map frame
  const mx = x + g * 2 + lw, my = y + top + g, mw = w - lw - rw - g * 4, mh = h - top - bot - g * 2;
  ctx.save(); ctx.globalAlpha *= clamp(u * 3, 0, 1);
  ctx.strokeStyle = hexA(col, 0.5); ctx.lineWidth = 1.2 * unit; ctx.strokeRect(mx, my, mw, mh);
  ctx.strokeStyle = col; ctx.lineWidth = 2 * unit; brackets(ctx, mx - 3 * unit, my - 3 * unit, mw + 6 * unit, mh + 6 * unit, 16 * unit);
  ctx.fillStyle = 'rgba(5,8,12,0.75)'; ctx.fillRect(mx + 8 * unit, my + 8 * unit, 150 * unit, 20 * unit);
  ctx.font = `700 ${10 * unit}px ${MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillStyle = Math.sin(t * 4) > 0 ? '#ff3b30' : '#661510'; ctx.beginPath(); ctx.arc(mx + 17 * unit, my + 18 * unit, 3.5 * unit, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e6edf5'; ctx.fillText((s.feeds || 'COMMON OPERATING PICTURE').split('\n')[0].toUpperCase(), mx + 26 * unit, my + 18 * unit, 128 * unit);
  if (o.view?.center) { ctx.textAlign = 'right'; ctx.fillText(`${fmtLat(o.view.center[1])}  ${fmtLon(o.view.center[0])}`, mx + mw - 10 * unit, my + mh - 14 * unit); }
  ctx.restore();
  // bottom event line
  ctx.save();
  ctx.globalAlpha *= clamp(tau / 0.3, 0, 1);
  ctx.fillStyle = 'rgba(7,11,17,0.94)'; ctx.fillRect(x, y + h - bot, w, bot);
  eventLog(ctx, { x: x + 16 * unit, y: y + h - bot + 2 * unit, w: w - 32 * unit, h: bot - 4 * unit }, String(s.log || 'UAV-02 on station\nConvoy at checkpoint 3\nALERT: perimeter breach sector B\nSAT-07 imagery received\nQRF dispatched').split('\n').filter(Boolean), tau, 1, col, unit, s.clock);
  ctx.restore();
}

// ---------------------------------------------------------------- SIGINT intercept
export const SIGINT_DEFAULT = 'ALPHA ONE MOVING NORTH';
function sigint(ctx, L, tm, o) {
  const { frame, unit } = o;
  const s = L.style, t = o.time ?? 0;
  const col = s.color || '#7CFF7C';
  const k = +s.size || 1;
  const text = String(s.text || SIGINT_DEFAULT).replace(/\n+/g, ' ');
  const tl = timeline(text, s.wpm || 15);
  const el = tm.edit ? tl.total * 0.6 : tm.tau - MORSE_DELAY;
  const W = Math.min(frame.w * 0.72, 980 * unit * k), H = 190 * unit * k;
  const m = 30 * unit;
  const pos = s.position || 'bottom';
  let x = frame.x + (frame.w - W) / 2, y = frame.y + frame.h - m - H;
  if (pos.includes('left')) x = frame.x + m;
  if (pos.includes('right')) x = frame.x + frame.w - m - W;
  if (pos.includes('top')) y = frame.y + m;
  if (pos === 'center') y = frame.y + (frame.h - H) / 2;
  ctx.globalAlpha *= bootAlpha(L, tm);
  placeAt(ctx, L, frame, x, y, W, H);
  const R = panel(ctx, x, y, W, H, s.label || 'SIGINT · INTERCEPT', col, unit, `${Math.sin(t * 5) > 0 ? '●' : '○'} REC  ${tcode(t)}`);
  // waterfall
  const ww = R.w * 0.58, wh = R.h;
  const C = 72, Rn = 34, cwid = ww / C, rh = wh / Rn, dt = 0.06;
  const carrier = Math.floor(C * 0.42);
  for (let r = 0; r < Rn; r++) {
    const tt = el - r * dt, slot = Math.floor((t - r * dt) / dt);
    const on = tt >= 0 && keyOn(tl, tt);
    for (let c = 0; c < C; c++) {
      let v = h2(c, slot) * 0.32 + (h2(c >> 3, slot >> 4) * 0.18);
      if (Math.abs(c - carrier) <= 1) v = on ? 1 - Math.abs(c - carrier) * 0.25 : v + 0.08;
      if (Math.abs(c - Math.floor(C * 0.8)) < 1) v += 0.25; // a second, steady station
      v = clamp(v, 0, 1);
      ctx.fillStyle = `hsl(${220 - v * 170},${70 + v * 30}%,${8 + v * 52}%)`;
      ctx.fillRect(R.x + c * cwid, R.y + r * rh, cwid + 0.5, rh + 0.5);
    }
  }
  ctx.strokeStyle = hexA(col, 0.6); ctx.lineWidth = 1 * unit; ctx.strokeRect(R.x, R.y, ww, wh);
  ctx.fillStyle = col; ctx.beginPath(); const mxp = R.x + (carrier + 0.5) * cwid; ctx.moveTo(mxp, R.y - 1); ctx.lineTo(mxp - 5 * unit, R.y - 8 * unit); ctx.lineTo(mxp + 5 * unit, R.y - 8 * unit); ctx.closePath(); ctx.fill();
  // read-outs
  const ix = R.x + ww + 16 * unit, iw = R.w - ww - 16 * unit;
  const on = !tm.edit && keyOn(tl, el);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = `800 ${20 * unit * k}px ${MONO}`; ctx.fillStyle = '#fff';
  ctx.fillText(`${s.freq || '7.0235'} MHz`, ix, R.y + 12 * unit * k, iw);
  ctx.font = `600 ${10 * unit}px ${MONO}`; ctx.fillStyle = hexA(col, 0.85);
  ctx.fillText(`MODE CW · ${Math.round(+s.wpm || 15)} WPM · BRG ${String(Math.round(h2(hashStr(L.id), 1) * 360)).padStart(3, '0')}°`, ix, R.y + 32 * unit * k, iw);
  // signal strength
  for (let i = 0; i < 10; i++) {
    const lvl = on ? 9 : 2 + Math.floor(h2(i, Math.floor(t * 8)) * 2);
    ctx.fillStyle = i < lvl ? (i > 7 ? '#ff5a52' : col) : 'rgba(255,255,255,0.1)';
    ctx.fillRect(ix + i * 13 * unit, R.y + 56 * unit * k - i * 1.6 * unit, 9 * unit, 8 * unit + i * 1.6 * unit);
  }
  // decoded text
  const doneChars = tl.chars.filter((c) => el >= c.end);
  let dec = '';
  let lastW = 0;
  doneChars.forEach((c, i) => { if (i && c.word !== lastW) dec += ' '; dec += c.ch; lastW = c.word; });
  const cur = tl.chars.find((c) => el >= c.start && el < c.end);
  const curCode = cur ? tl.els.filter((e) => e.ci === tl.chars.indexOf(cur) && el >= e.t).map((e) => e.sym).join('') : '';
  ctx.font = `600 ${10 * unit}px ${MONO}`; ctx.fillStyle = hexA(col, 0.7);
  ctx.fillText('DECODED', ix, R.y + R.h - 44 * unit * k);
  ctx.font = `800 ${15 * unit * k}px ${MONO}`; ctx.fillStyle = '#fff';
  const show = (dec + (Math.sin(t * 9) > 0 ? '▌' : ' ')).slice(-Math.floor(iw / (9.5 * unit * k)));
  ctx.fillText(show, ix, R.y + R.h - 24 * unit * k, iw);
  ctx.font = `800 ${13 * unit * k}px ${MONO}`; ctx.fillStyle = col;
  ctx.fillText(curCode.replace(/\./g, '•').replace(/-/g, '—'), ix, R.y + R.h - 4 * unit * k, iw);
}
