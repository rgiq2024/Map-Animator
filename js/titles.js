// Film-style text: opening titles, cinematic titles, chapter cards, location stamps, rolling credits,
// quotes and end titles. Plus letterbox bars (black strips top and bottom) for the cinema look.
import { drawTagTitle, TAG_STYLES } from './vizfx.js';
import { drawHudTitle } from './hudpack.js';
import { placeAt } from './place.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const fam = (f, fb) => (f ? `"${f}", ${fb}` : fb);
const SERIF = '"Cinzel","Playfair Display",Georgia,serif';
const SANS = '"Inter","Segoe UI",system-ui,sans-serif';
const MONO = '"JetBrains Mono",ui-monospace,monospace';
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
export const TITLE_LOOKS = {
  opener: 'Opening title (letters close in)', cinematic: 'Cinematic (blur-in with light sweep)', glitch: 'Glitch title', chapter: 'Chapter card',
  explainer: 'News explainer (side panel)', tag: 'Tag label (coloured boxes)', hudring: 'HUD ring title (red & cyan)', namecard: 'HUD name card (presents…)', location: 'Location stamp (typed)', credits: 'Rolling credits', quote: 'Quote', ending: 'End title',
};

/** Draw text with extra letter spacing; returns width. */
function spaced(ctx, text, x, y, sp, align = 'center', draw = true) {
  const chars = [...text];
  const ws = chars.map((c) => ctx.measureText(c).width);
  const W = ws.reduce((a, b) => a + b, 0) + sp * Math.max(0, chars.length - 1);
  if (!draw) return W;
  let cx = align === 'center' ? x - W / 2 : align === 'right' ? x - W : x;
  const prev = ctx.textAlign; ctx.textAlign = 'left';
  chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += ws[i] + sp; });
  ctx.textAlign = prev;
  return W;
}

export function drawTitle(ctx, L, tm, o) {
  const { frame, unit } = o;
  const s = L.style;
  const look = s.look || 'opener';
  const k = +s.size || 1;
  const col = s.color || '#ffffff';
  const acc = s.accent || '#e8c27a';
  const D = Math.max(0.2, +L.duration || 2);
  const tau = tm.edit ? D * 0.999 : tm.tau;
  const u = clamp(tau / D, 0, 1);
  const t = o.time ?? 0;
  const FT = fam(s.font, look === 'location' ? MONO : look === 'opener' || look === 'ending' || look === 'quote' ? SERIF : SANS);
  const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
  const title = s.text || '', sub = s.sub || '';
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  if (look === 'explainer') { drawExplainer(ctx, s, frame, unit, tm, k); ctx.restore(); return; }
  if (look === 'tag') { drawTagTitle(ctx, L, tm, o); ctx.restore(); return; }
  if (look === 'hudring' || look === 'namecard') { drawHudTitle(ctx, L, tm, o); ctx.restore(); return; }
  // optional dim behind the text
  if (+s.dim > 0) { ctx.fillStyle = `rgba(0,0,0,${clamp(+s.dim, 0, 1) * (tm.edit ? 1 : ease(u * 2))})`; ctx.fillRect(frame.x, frame.y, frame.w, frame.h); }
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = col;
  if (look === 'credits') {
    const lines = String(s.lines || '').split('\n');
    const lh = 34 * unit * k;
    const totalH = lines.length * lh + frame.h;
    const scroll = tm.edit ? frame.h * 0.5 : easeLin(u) * totalH;
    let y = frame.y + frame.h - scroll + lh;
    ctx.save(); ctx.beginPath(); ctx.rect(frame.x, frame.y, frame.w, frame.h); ctx.clip();
    for (const line of lines) {
      if (y > frame.y - lh && y < frame.y + frame.h + lh) {
        const fade = clamp(Math.min(y - frame.y, frame.y + frame.h - y) / (frame.h * 0.12), 0, 1);
        ctx.globalAlpha = tm.alpha * fade;
        const i = line.indexOf(':');
        if (i > 0) {
          ctx.font = `400 ${15 * unit * k}px ${fam(s.font, SANS)}`; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.textAlign = 'right';
          spaced(ctx, line.slice(0, i).trim().toUpperCase(), cx - 16 * unit, y, 2 * unit, 'right');
          ctx.font = `600 ${19 * unit * k}px ${fam(s.font, SANS)}`; ctx.fillStyle = col; ctx.textAlign = 'left';
          ctx.fillText(line.slice(i + 1).trim(), cx + 16 * unit, y);
        } else if (line.trim()) {
          ctx.font = `700 ${22 * unit * k}px ${fam(s.font, SERIF)}`; ctx.fillStyle = acc; ctx.textAlign = 'center';
          spaced(ctx, line.trim().toUpperCase(), cx, y, 4 * unit);
        }
      }
      y += lh;
    }
    ctx.restore();
    ctx.restore();
    return;
  }
  // block size for placement
  const big = (look === 'opener' || look === 'ending' ? 66 : look === 'cinematic' || look === 'glitch' ? 58 : look === 'chapter' ? 48 : look === 'quote' ? 30 : 26) * unit * k;
  ctx.font = `${look === 'location' ? 600 : 700} ${big}px ${FT}`;
  const sp0 = look === 'opener' ? big * 0.35 : look === 'ending' ? big * 0.25 : look === 'cinematic' ? big * 0.12 : 0;
  const tw = spaced(ctx, title, 0, 0, sp0, 'center', false);
  const W = Math.min(frame.w * 0.92, tw + 40 * unit), H = big * (sub ? 2.1 : 1.4);
  let bx = cx - W / 2, by = cy - H / 2;
  if (look === 'location') { bx = frame.x + 50 * unit; by = frame.y + frame.h - 90 * unit - H; }
  ctx.save();
  placeAt(ctx, L, frame, bx, by, W, H);
  const mx = look === 'location' ? bx : bx + W / 2, my = by + big * 1.0;
  if (look === 'opener') {
    const sp = sp0 * (1 + 1.6 * (1 - easeOut(u)));
    ctx.globalAlpha *= clamp(u * 1.6, 0, 1);
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 18 * unit;
    ctx.font = `600 ${big}px ${FT}`; ctx.fillStyle = col;
    spaced(ctx, title.toUpperCase(), mx, my, sp);
    // thin lines that grow out from the centre
    const lw = Math.min(W, tw) * 0.5 * easeOut((u - 0.3) / 0.7);
    ctx.shadowBlur = 0; ctx.fillStyle = acc;
    ctx.fillRect(mx - lw, my + big * 0.28, lw * 2, Math.max(1, 1.5 * unit));
    if (sub) { ctx.globalAlpha *= clamp((u - 0.45) / 0.4, 0, 1); ctx.font = `400 ${big * 0.3}px ${fam(s.font, SANS)}`; ctx.fillStyle = 'rgba(255,255,255,0.85)'; spaced(ctx, sub.toUpperCase(), mx, my + big * 0.8, big * 0.12); }
  } else if (look === 'cinematic') {
    const blur = (1 - easeOut(u)) * 18 * unit;
    ctx.globalAlpha *= clamp(u * 2, 0, 1);
    ctx.font = `800 ${big}px ${FT}`;
    if (blur > 0.3) ctx.filter = `blur(${blur}px)`;
    ctx.fillStyle = col; ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 20 * unit;
    const sc = 1.08 - 0.08 * easeOut(u);
    ctx.save(); ctx.translate(mx, my); ctx.scale(sc, sc); spaced(ctx, title.toUpperCase(), 0, 0, sp0); ctx.restore();
    ctx.filter = 'none'; ctx.shadowBlur = 0;
    // light sweep across the letters
    if (s.flare !== false && !tm.edit && u > 0.3) {
      const sw = (u - 0.3) / 0.7;
      const sx = mx - tw * 0.7 + tw * 1.4 * sw;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(sx - 80 * unit, 0, sx + 80 * unit, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,240,210,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(sx - 80 * unit, my - big, 160 * unit, big * 1.3);
      // anamorphic streak
      const g2 = ctx.createLinearGradient(frame.x, 0, frame.x + frame.w, 0);
      g2.addColorStop(0, 'rgba(120,170,255,0)'); g2.addColorStop(clamp((sx - frame.x) / frame.w, 0.01, 0.99), 'rgba(140,190,255,0.35)'); g2.addColorStop(1, 'rgba(120,170,255,0)');
      ctx.fillStyle = g2; ctx.fillRect(frame.x, my - big * 0.36 - 1.5 * unit, frame.w, 3 * unit);
      ctx.restore();
    }
    if (sub) { ctx.globalAlpha *= clamp((u - 0.5) / 0.4, 0, 1); ctx.font = `500 ${big * 0.32}px ${fam(s.font, SANS)}`; ctx.fillStyle = 'rgba(255,255,255,0.88)'; spaced(ctx, sub.toUpperCase(), mx, my + big * 0.85, big * 0.08); }
  } else if (look === 'glitch') {
    const r = rng(hashStr(L.id) + Math.floor(t * 24));
    const g = tm.edit ? 0 : Math.max(1 - u, r() < 0.06 ? 0.4 : 0);
    ctx.font = `900 ${big}px ${FT}`;
    const T = title.toUpperCase();
    if (g > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,0,60,0.8)'; spaced(ctx, T, mx - 8 * unit * g, my, 0);
      ctx.fillStyle = 'rgba(0,220,255,0.8)'; spaced(ctx, T, mx + 8 * unit * g, my, 0);
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 6; i++) {
        const sy = my - big + r() * big * 1.2, sh = (3 + r() * 10) * unit;
        ctx.save(); ctx.beginPath(); ctx.rect(bx, sy, W, sh); ctx.clip(); ctx.translate((r() - 0.5) * 50 * unit * g, 0); ctx.fillStyle = col; spaced(ctx, T, mx, my, 0); ctx.restore();
      }
    }
    ctx.globalAlpha *= r() < g * 0.4 ? 0.3 : 1;
    ctx.fillStyle = col; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 12 * unit;
    spaced(ctx, T, mx, my, 0);
    if (sub) { ctx.shadowBlur = 0; ctx.font = `600 ${big * 0.3}px ${MONO}`; ctx.fillStyle = acc; spaced(ctx, sub.toUpperCase(), mx, my + big * 0.75, big * 0.06); }
  } else if (look === 'chapter') {
    ctx.globalAlpha *= clamp(u * 2, 0, 1);
    ctx.font = `600 ${big * 0.32}px ${fam(s.font, SANS)}`; ctx.fillStyle = acc;
    spaced(ctx, (sub || 'CHAPTER ONE').toUpperCase(), mx, my - big * 0.95, big * 0.12);
    const lw = 60 * unit * easeOut(u);
    ctx.fillRect(mx - lw, my - big * 0.78, lw * 2, Math.max(1, 2 * unit));
    ctx.font = `800 ${big}px ${FT}`; ctx.fillStyle = col; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 16 * unit;
    ctx.save(); ctx.translate(0, (1 - easeOut(u)) * 20 * unit); spaced(ctx, title, mx, my + big * 0.15, 0); ctx.restore();
  } else if (look === 'location') {
    const lines = [title, sub].filter(Boolean);
    const total = lines.reduce((a, l) => a + l.length, 0);
    let n = Math.floor(total * (tm.edit ? 1 : clamp(u * 1.05, 0, 1)));
    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 8 * unit;
    lines.forEach((l, i) => {
      const part = l.slice(0, Math.max(0, n)); n -= l.length;
      ctx.font = `${i ? 400 : 700} ${i ? big * 0.75 : big}px ${FT}`;
      ctx.fillStyle = i ? 'rgba(255,255,255,0.85)' : col;
      ctx.textAlign = 'left';
      ctx.fillText(part, mx, my + i * big * 1.15);
      if ((n <= 0 && n > -l.length - 1) && Math.sin(t * 8) > 0) { const cw = ctx.measureText(part).width; ctx.fillRect(mx + cw + 3 * unit, my + i * big * 1.15 - big * 0.8, big * 0.5, big * 0.9); }
    });
  } else if (look === 'quote') {
    ctx.globalAlpha *= clamp(u * 1.5, 0, 1);
    ctx.font = `italic 400 ${big}px ${FT}`; ctx.fillStyle = col; ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 12 * unit;
    ctx.fillText(`“${title}”`, mx, my);
    if (sub) { ctx.globalAlpha *= clamp((u - 0.4) / 0.5, 0, 1); ctx.font = `500 ${big * 0.55}px ${fam(s.font, SANS)}`; ctx.fillStyle = acc; ctx.fillText(`— ${sub}`, mx, my + big * 1.3); }
  } else if (look === 'ending') {
    const sc = 1 + 0.06 * (tm.edit ? 1 : u);
    ctx.globalAlpha *= tm.edit ? 1 : ease(u * 1.4);
    ctx.font = `500 ${big}px ${FT}`; ctx.fillStyle = col;
    ctx.save(); ctx.translate(mx, my); ctx.scale(sc, sc); spaced(ctx, (title || 'THE END').toUpperCase(), 0, 0, sp0); ctx.restore();
    if (sub) { ctx.globalAlpha *= clamp((u - 0.4) / 0.5, 0, 1); ctx.font = `400 ${big * 0.3}px ${fam(s.font, SANS)}`; ctx.fillStyle = 'rgba(255,255,255,0.8)'; spaced(ctx, sub, mx, my + big * 0.9, big * 0.06); }
  }
  ctx.restore();
  ctx.restore();
}
const easeLin = (u) => clamp(u, 0, 1);

/** Black bars top and bottom for a cinema aspect ratio. */
export function drawLetterbox(ctx, frame, look, t, unit) {
  const lb = look?.letterbox;
  if (!lb || lb === 'none') return;
  const ratio = +lb || 2.39;
  const target = frame.w / ratio;
  if (target >= frame.h) return;
  let bar = (frame.h - target) / 2;
  if (look.letterboxAnim && t != null) bar *= easeOut(t / 1.2);
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(frame.x, frame.y, frame.w, bar);
  ctx.fillRect(frame.x, frame.y + frame.h - bar, frame.w, bar);
  ctx.restore();
}

/** News explainer: a dark side panel with date, big title, subtitle, a red rule and location lines. */
function wrapLines(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const out = [];
  let cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur);
  return out;
}
function drawExplainer(ctx, s, frame, unit, tm, k) {
  const right = s.side === 'right';
  const pw = frame.w * clamp(+s.panelW || 0.3, 0.18, 0.6);
  const tau = tm.edit ? 99 : tm.tau;
  const inK = easeOut(tau / 0.7);
  const x0 = right ? frame.x + frame.w - pw * inK : frame.x - pw * (1 - inK);
  const F = fam(s.font, SANS);
  ctx.fillStyle = s.bg || '#0a0f15';
  ctx.globalAlpha *= 0.97;
  ctx.fillRect(x0, frame.y, pw, frame.h);
  ctx.globalAlpha /= 0.97;
  // soft edge into the map
  const ex = right ? x0 : x0 + pw;
  const g = ctx.createLinearGradient(ex, 0, ex + (right ? -1 : 1) * frame.w * 0.06, 0);
  g.addColorStop(0, 'rgba(10,15,21,0.55)'); g.addColorStop(1, 'rgba(10,15,21,0)');
  ctx.fillStyle = g; ctx.fillRect(right ? ex - frame.w * 0.06 : ex, frame.y, frame.w * 0.06, frame.h);
  const pad = pw * 0.13;
  const tx = x0 + pad, maxW = pw - pad * 1.6;
  const H = frame.h;
  const el = (i) => { const a = clamp((tau - 0.35 - i * 0.18) / 0.45, 0, 1); return { a: easeOut(a), dy: (1 - easeOut(a)) * 14 * unit }; };
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  let y = frame.y + H * 0.115;
  // date
  if (s.date) {
    const e = el(0);
    ctx.save(); ctx.globalAlpha *= e.a;
    ctx.font = `600 ${H * 0.026 * k}px ${F}`; ctx.fillStyle = s.dateColor || '#4fc3f7';
    spaced(ctx, String(s.date).toUpperCase(), tx, y + e.dy, H * 0.0028, 'left');
    ctx.restore();
    y += H * 0.05 * k;
  }
  // big title, shrunk to fit
  const e1 = el(1);
  let fs = H * 0.15 * k;
  ctx.font = `700 ${fs}px ${F}`;
  const title = String(s.text || '').toUpperCase();
  while (fs > H * 0.05 && ctx.measureText(title).width > maxW) { fs *= 0.92; ctx.font = `700 ${fs}px ${F}`; }
  y += fs * 0.95;
  ctx.save(); ctx.globalAlpha *= e1.a; ctx.fillStyle = s.color || '#ffffff'; ctx.fillText(title, tx, y + e1.dy); ctx.restore();
  // subtitle
  if (s.sub) {
    const e = el(2);
    const sfs = H * 0.044 * k;
    ctx.font = `600 ${sfs}px ${F}`;
    y += H * 0.1;
    ctx.save(); ctx.globalAlpha *= e.a; ctx.fillStyle = s.color || '#ffffff';
    for (const line of wrapLines(ctx, s.sub, maxW)) { ctx.fillText(line, tx, y + e.dy); y += sfs * 1.25; }
    ctx.restore();
  }
  // red rule
  const e3 = el(3);
  y += H * 0.06;
  ctx.fillStyle = s.accent || '#e53935';
  ctx.fillRect(tx, y, pw * 0.42 * e3.a, Math.max(2, H * 0.005));
  // location lines
  const lines = String(s.lines || '').split('\n').map((t) => t.trim()).filter(Boolean);
  if (lines.length) {
    const e = el(4);
    const lfs = H * 0.027 * k;
    y += H * 0.1;
    ctx.save(); ctx.globalAlpha *= e.a; ctx.font = `500 ${lfs}px ${F}`; ctx.fillStyle = s.lineColor || '#b8c4cc';
    for (const line of lines) { spaced(ctx, line.toUpperCase(), tx, y + e.dy, lfs * 0.06, 'left'); y += lfs * 1.45; }
    ctx.restore();
  }
}
