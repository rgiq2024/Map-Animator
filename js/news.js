// TV-news graphics: channel logo bug, LIVE badge, BREAKING NEWS banner and news lower third — all placeable,
// with your own logo image. (The scrolling ticker lives in hudplus.js as a HUD-text style.)
import { placeAt } from './place.js';
import { imageFor } from './geoimage.js';

const UI = '"Inter","Segoe UI",system-ui,sans-serif';
const DISPLAY = '"Archivo","Inter",system-ui,sans-serif';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const fam = (f, fb) => (f ? `"${f}", ${fb}` : fb);
export const NEWS_LOOKS = { bug: 'Channel logo (corner bug)', live: 'LIVE badge', breaking: 'BREAKING NEWS banner', headline: 'News lower third' };
const rr = (c, x, y, w, h, r) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
/** "20:45" + video time → "20:45:07". */
function clock(s, t) {
  const m = String(s.clock || '20:45').match(/(\d{1,2}):(\d{2})/);
  let sec = (m ? +m[1] * 3600 + +m[2] * 60 : 0) + Math.floor(t);
  sec %= 86400;
  return `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}`;
}
function logo(ctx, s, x, y, size, col) {
  const im = s.media && imageFor(s.media);
  if (im?.ready) {
    const k = Math.min(size / im.h, (size * 2.4) / im.w);
    const w = im.w * k, h = im.h * k;
    ctx.drawImage(im.bmp, x, y + (size - h) / 2, w, h);
    return w;
  }
  // text logo in a square
  ctx.fillStyle = col; rr(ctx, x, y, size, size, size * 0.12); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const t = (s.channel || 'NEWS').slice(0, 4).toUpperCase();
  ctx.font = `900 ${size * (t.length > 3 ? 0.3 : 0.38)}px ${DISPLAY}`;
  ctx.fillText(t, x + size / 2, y + size / 2 + 1);
  ctx.textAlign = 'left';
  return size;
}
export function drawNews(ctx, L, tm, o) {
  const { frame, unit } = o;
  const s = L.style;
  const look = s.look || 'bug';
  const k = +s.size || 1;
  const col = s.color || '#d71920';
  const t = o.time ?? 0;
  const u = tm.edit ? 1 : clamp(tm.tau / Math.max(0.1, +L.duration || 0.8), 0, 1);
  const e = easeOut(u);
  const F = fam(s.font, UI), FD = fam(s.font, DISPLAY);
  const m = 28 * unit;
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  ctx.textBaseline = 'middle';
  if (look === 'bug') {
    const size = 58 * unit * k;
    ctx.font = `800 ${16 * unit * k}px ${F}`;
    const nameW = s.showName !== false && !s.media ? 0 : 0;
    const W = size * (s.media ? 2.4 : 1) + nameW, H = size + (s.live ? 22 * unit * k : 0);
    let x = frame.x + frame.w - m - W, y = frame.y + m;
    const pos = s.position || 'top-right';
    if (pos.includes('left')) x = frame.x + m;
    if (pos.includes('bottom')) y = frame.y + frame.h - m - H;
    placeAt(ctx, L, frame, x, y, W, H);
    ctx.globalAlpha *= (+s.opacity || 0.92) * clamp(u * 2, 0, 1);
    const w = logo(ctx, s, x, y, size, col);
    if (s.live) {
      const on = tm.edit || Math.sin(t * 4) > -0.6;
      ctx.fillStyle = col; rr(ctx, x, y + size + 4 * unit, w, 18 * unit * k, 3 * unit); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `800 ${11 * unit * k}px ${F}`; ctx.textAlign = 'center';
      ctx.fillText(on ? '● LIVE' : '  LIVE', x + w / 2, y + size + 4 * unit + 9 * unit * k + 1);
      ctx.textAlign = 'left';
    }
  } else if (look === 'live') {
    ctx.font = `900 ${17 * unit * k}px ${F}`;
    const lw = ctx.measureText('LIVE').width + 34 * unit * k;
    ctx.font = `700 ${15 * unit * k}px ${F}`;
    const loc = (s.location || 'DUBAI').toUpperCase();
    const tw = ctx.measureText(loc).width + 24 * unit * k;
    const cw = s.showClock !== false ? ctx.measureText('00:00').width + 22 * unit * k : 0;
    const H = 32 * unit * k, W = lw + tw + cw;
    let x = frame.x + m, y = frame.y + m;
    const pos = s.position || 'top-left';
    if (pos.includes('right')) x = frame.x + frame.w - m - W;
    if (pos.includes('bottom')) y = frame.y + frame.h - m - H;
    placeAt(ctx, L, frame, x, y, W, H);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, W * e, H); ctx.clip();
    ctx.fillStyle = col; ctx.fillRect(x, y, lw, H);
    ctx.fillStyle = s.bg || 'rgba(10,12,16,0.85)'; ctx.fillRect(x + lw, y, tw + cw, H);
    const on = tm.edit || Math.sin(t * 5) > -0.5;
    if (on) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + 13 * unit * k, y + H / 2, 4.5 * unit * k, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.font = `900 ${17 * unit * k}px ${F}`; ctx.fillText('LIVE', x + 22 * unit * k, y + H / 2 + 1);
    ctx.fillStyle = s.textColor || '#fff'; ctx.font = `700 ${15 * unit * k}px ${F}`; ctx.fillText(loc, x + lw + 12 * unit * k, y + H / 2 + 1);
    if (cw) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText(clock(s, t), x + lw + tw, y + H / 2 + 1); }
    ctx.restore();
  } else if (look === 'breaking' || look === 'headline') {
    const brk = look === 'breaking';
    const W = frame.w - m * 2;
    const tagH = 34 * unit * k, headH = 56 * unit * k, subH = s.sub ? 30 * unit * k : 0;
    const H = (brk ? tagH : 0) + headH + subH;
    const x = frame.x + m;
    let y = frame.y + frame.h - m * 1.6 - H;
    if ((s.position || '').includes('top')) y = frame.y + m;
    placeAt(ctx, L, frame, x, y, W, H, { lockX: true });
    const size = headH + subH;
    const logoW = s.media || s.channel ? (s.media ? size * 1.6 : size) : 0;
    // banner tag
    let yy = y;
    if (brk) {
      const tagW = Math.max(240 * unit * k, W * 0.34) * e;
      ctx.fillStyle = col; ctx.fillRect(x + logoW, yy, tagW, tagH);
      // sliding shine
      const sx = x + logoW + ((t * 260 * unit) % Math.max(1, tagW + 200 * unit)) - 100 * unit;
      const g = ctx.createLinearGradient(sx - 60 * unit, 0, sx + 60 * unit, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save(); ctx.beginPath(); ctx.rect(x + logoW, yy, tagW, tagH); ctx.clip(); ctx.fillStyle = g; ctx.fillRect(x + logoW, yy, tagW, tagH); ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = `900 italic ${19 * unit * k}px ${FD}`;
      ctx.save(); ctx.beginPath(); ctx.rect(x + logoW, yy, tagW, tagH); ctx.clip();
      ctx.fillText((s.tag || 'BREAKING NEWS').toUpperCase(), x + logoW + 16 * unit * k, yy + tagH / 2 + 1);
      ctx.restore();
      yy += tagH;
    }
    // headline bar wipes in
    const hw = (W - logoW) * easeOut(clamp((u - (brk ? 0.25 : 0)) / 0.75, 0, 1));
    ctx.fillStyle = s.bg || '#ffffff'; ctx.fillRect(x + logoW, yy, hw, headH);
    if (!brk) { ctx.fillStyle = col; ctx.fillRect(x + logoW, yy, 6 * unit, headH); }
    ctx.save(); ctx.beginPath(); ctx.rect(x + logoW, yy, hw, headH + subH); ctx.clip();
    ctx.fillStyle = s.textColor || '#111318'; ctx.font = `800 ${26 * unit * k}px ${FD}`;
    ctx.fillText(s.text || 'Headline goes here', x + logoW + 20 * unit * k, yy + headH / 2 + 1);
    if (subH) {
      ctx.fillStyle = s.subBg || 'rgba(14,16,22,0.92)'; ctx.fillRect(x + logoW, yy + headH, hw, subH);
      ctx.fillStyle = '#fff'; ctx.font = `600 ${15 * unit * k}px ${F}`;
      ctx.fillText(s.sub, x + logoW + 20 * unit * k, yy + headH + subH / 2 + 1);
    }
    ctx.restore();
    if (logoW) {
      ctx.fillStyle = s.media ? (s.logoBg || '#ffffff') : col;
      ctx.fillRect(x, brk ? y : yy, logoW, brk ? H : size);
      logo(ctx, s, x + (s.media ? size * 0.12 : 0), (brk ? y + tagH : yy) + (s.media ? size * 0.1 : 0), s.media ? size * 0.8 : size, col);
    }
    if (s.showClock) {
      ctx.font = `700 ${14 * unit * k}px ${F}`;
      const cw = ctx.measureText('00:00').width + 18 * unit;
      ctx.fillStyle = col; ctx.fillRect(x + W - cw, yy - 24 * unit * k, cw, 24 * unit * k);
      ctx.fillStyle = '#fff'; ctx.fillText(clock(s, t), x + W - cw + 9 * unit, yy - 12 * unit * k + 1);
    }
  }
  ctx.restore();
}
