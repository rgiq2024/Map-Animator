// Story graphics: text callouts on the map (six looks), animated photo formations (carousel, fan, helix,
// orbit, shatter, polaroid stack) and match-cut article pages where a highlighted phrase stays put while
// the page around it changes.
import { placeAt } from './place.js';
import { imageFor } from './geoimage.js';

const UI = '"Inter","Segoe UI",system-ui,sans-serif';
const SERIF = '"Playfair Display","Merriweather",Georgia,serif';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const easeIO = (u) => { u = clamp(u, 0, 1); return u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2; };
const backOut = (u) => { const c = 1.7, x = clamp(u, 0, 1) - 1; return 1 + (c + 1) * x ** 3 + c * x ** 2; };
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
const prog = (L, tm) => (tm.edit || L.anim === 'none' ? 1 : clamp(tm.tau / Math.max(0.1, +L.duration || 1), 0, 1));

export const SF_KINDS = {
  textcallout: { name: 'Text callout', icon: '💬', geom: 'point', desc: 'A label tied to a place: leader line, box, speech bubble, numbered marker, bracket or pill' },
  photofx: { name: 'Photo animation', icon: '🎴', geom: null, desc: 'Your photos in a spinning carousel, fan, helix, orbit, shatter or polaroid stack' },
  matchcut: { name: 'Match cut (article highlights)', icon: '📰', geom: null, desc: 'Newspaper / magazine / web pages cut together while one highlighted phrase stays in place' },
};
export const SF_ANIMS = {
  textcallout: { draw: 'Line draws, text types', pop: 'Pop in', fade: 'Fade in', none: 'Already there' },
  photofx: { play: 'Play' },
  matchcut: { play: 'Play' },
};
export const CALLOUT_LOOKS = { leader: 'Leader line with underline', box: 'Box with accent bar', bubble: 'Speech bubble', number: 'Numbered marker', bracket: 'Bracket title', pill: 'Pill with icon' };
export const PHOTO_LOOKS = { carousel: 'Carousel ring (3D spin)', fan: 'Fan of cards', helix: 'Helix twist', orbit: 'Orbit round a centre', shatter: 'Shatter → assemble', stack: 'Polaroid stack' };
export const MATCH_PAGES = { news: 'Newspaper', magazine: 'Magazine', web: 'Web article', tags: 'Tag strip' };
export const SF_DEFAULTS = {
  textcallout: { anim: 'draw', duration: 1.2, style: { look: 'leader', title: 'Accident site', text: 'Two trains collided at 18:42', color: '#ffffff', accent: '#ff3b30', number: '1', icon: '📍', dx: 140, dy: -90, size: 1, bg: '#0d1117' } },
  photofx: { anim: 'play', duration: 6, style: { look: 'carousel', media: '', media2: '', media3: '', count: 8, speed: 1, size: 1, title: '', bg: 0, colorful: true } },
  matchcut: { anim: 'play', duration: 8, style: { phrase: 'match cut', pages: 'news\nmagazine\nweb\ntags', hold: 1.6, highlight: '#ffe14d', text: '', zoom: 1.6, paper: true } },
};
export const SF_FORMS = {
  textcallout: [['style.look', 'Look', 'select', CALLOUT_LOOKS], ['style.title', 'Title', 'text'], ['style.text', 'Text (“ / ” makes a new line)', 'text'], ['style.number', 'Number', 'text', null, (L) => L.style.look === 'number'], ['style.icon', 'Icon (emoji)', 'text', null, (L) => L.style.look === 'pill'], ['style.color', 'Text colour', 'color'], ['style.accent', 'Accent colour', 'color'], ['style.bg', 'Box colour', 'color', null, (L) => ['box', 'bubble', 'pill'].includes(L.style.look)], ['style.dx', 'Box offset ←→', 'range', [-500, 500, 1]], ['style.dy', 'Box offset ↑↓', 'range', [-400, 400, 1]], ['style.size', 'Size', 'range', [0.5, 2.5, 0.05]]],
  photofx: [['style.look', 'Animation', 'select', PHOTO_LOOKS], ['style.media', 'Photo A', 'image'], ['style.media2', 'Photo B', 'image'], ['style.media3', 'Photo C', 'image'], ['style.count', 'Cards', 'range', [3, 16, 1]], ['style.colorful', 'Colour cards when there is no photo', 'switch'], ['style.speed', 'Speed', 'range', [0.2, 3, 0.05]], ['style.size', 'Size', 'range', [0.3, 3, 0.05]], ['style.bg', 'Background (0 = see the map, 1 = white)', 'range', [0, 1, 0.01]], ['style.title', 'Title over the photos', 'text']],
  matchcut: [['style.phrase', 'Highlighted phrase (stays in place)', 'text'], ['style.pages', 'Pages in order — news, magazine, web, tags (one per line)', 'textarea'], ['style.text', 'Your own body text (optional — the phrase is placed in it)', 'textarea'], ['style.hold', 'Seconds per page', 'range', [0.4, 4, 0.05]], ['style.zoom', 'Zoom on the phrase', 'range', [1, 3, 0.05]], ['style.highlight', 'Highlighter colour', 'color']],
};
export const SF_SET = new Set(Object.keys(SF_KINDS));
export const SF_SCREEN = new Set(['photofx', 'matchcut']);
export const sfPhases = (k) => (k === 'textcallout' ? ['above'] : ['captions']);
export function drawStoryFx(ctx, L, tm, o, phase) {
  ctx.save();
  try {
    if (L.kind === 'textcallout') textCallout(ctx, L, tm, o);
    else if (L.kind === 'photofx' && o.frame) photoFx(ctx, L, tm, o);
    else if (L.kind === 'matchcut' && o.frame) matchCut(ctx, L, tm, o);
  } finally { ctx.restore(); }
}

// ================================================================= text callouts
function textCallout(ctx, L, tm, o) {
  if (L.geom?.type !== 'Point') return;
  const s = L.style, unit = o.unit * (+s.size || 1), t = o.time || 0;
  const [px, py] = o.proj(L.geom.coordinates);
  const u = prog(L, tm);
  const col = s.color || '#ffffff', acc = s.accent || '#ff3b30';
  const lines = String(s.text || '').split(' / ').filter(Boolean);
  const title = s.title || '';
  const look = s.look || 'leader';
  const bx = px + (+s.dx || 0) * o.unit, by = py + (+s.dy || 0) * o.unit;
  const kLine = L.anim === 'draw' && !tm.edit ? easeOut(u / 0.4) : 1;
  const kText = L.anim === 'draw' && !tm.edit ? clamp((u - 0.35) / 0.65, 0, 1) : 1;
  let alpha = tm.alpha;
  if (L.anim === 'fade' && !tm.edit) alpha *= ease(u);
  ctx.globalAlpha *= alpha;
  if (L.anim === 'pop' && !tm.edit) { const k = backOut(u); ctx.translate(px, py); ctx.scale(k, k); ctx.translate(-px, -py); }
  const typed = (str, k) => str.slice(0, Math.ceil(str.length * k));
  const TF = `800 ${16 * unit}px ${UI}`, BF = `500 ${12.5 * unit}px ${UI}`;
  ctx.textBaseline = 'middle';
  // anchor dot
  if (look !== 'bubble') {
    ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(px, py, 5 * unit, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hexA(acc, 0.5 * (1 - ((t * 0.8) % 1))); ctx.lineWidth = 2 * unit; ctx.beginPath(); ctx.arc(px, py, 6 * unit + ((t * 0.8) % 1) * 16 * unit, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.font = TF; const tw = ctx.measureText(title).width;
  ctx.font = BF; const lw = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
  const W = Math.max(tw, lw) + 28 * unit, H = (title ? 26 : 8) * unit + lines.length * 18 * unit + 12 * unit;
  const right = bx >= px;
  const x0 = right ? bx : bx - W;
  const y0 = by - H / 2;
  const leader = () => {
    ctx.strokeStyle = acc; ctx.lineWidth = 1.8 * unit;
    const ex = right ? x0 : x0 + W, ey = by;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + (ex - px) * kLine, py + (ey - py) * kLine); ctx.stroke();
  };
  const textBlock = (x, y, align = 'left', c = col) => {
    ctx.textAlign = align;
    if (title) { ctx.font = TF; ctx.fillStyle = c; ctx.fillText(typed(title, kText), x, y + 13 * unit); }
    ctx.font = BF; ctx.fillStyle = hexA(c === col ? col : c, 0.85);
    lines.forEach((l, i) => ctx.fillText(typed(l, clamp(kText * 1.3 - i * 0.15, 0, 1)), x, y + (title ? 34 : 14) * unit + i * 18 * unit));
  };
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 6 * unit;
  if (look === 'leader') {
    leader();
    if (kLine >= 1) { ctx.strokeStyle = acc; ctx.lineWidth = 2 * unit; ctx.beginPath(); ctx.moveTo(x0, by + H / 2 - 2 * unit); ctx.lineTo(x0 + W * kText, by + H / 2 - 2 * unit); ctx.stroke(); }
    textBlock(right ? x0 + 6 * unit : x0 + W - 6 * unit, y0 + 2 * unit, right ? 'left' : 'right');
  } else if (look === 'box') {
    leader();
    if (kLine >= 1) {
      ctx.save(); ctx.globalAlpha *= kText > 0 ? 1 : 0; ctx.shadowBlur = 14 * unit;
      ctx.fillStyle = hexA(s.bg || '#0d1117', 0.88); ctx.fillRect(x0, y0, W * easeOut(kText * 2), H);
      ctx.fillStyle = acc; ctx.fillRect(x0, y0, 4 * unit, H); ctx.restore();
      textBlock(x0 + 14 * unit, y0 + 4 * unit);
    }
  } else if (look === 'bubble') {
    const k = L.anim === 'draw' && !tm.edit ? backOut(u / 0.45) : 1;
    ctx.save(); ctx.translate(px, py); ctx.scale(k, k); ctx.translate(-px, -py);
    const bx2 = px - W / 2 + (+s.dx || 0) * o.unit * 0.3, by2 = py - H - 22 * unit + Math.min(0, (+s.dy || 0) * o.unit * 0.3);
    ctx.fillStyle = s.bg || '#ffffff'; ctx.shadowBlur = 16 * unit;
    rr(ctx, bx2, by2, W, H, 12 * unit); ctx.fill();
    ctx.beginPath(); ctx.moveTo(px - 9 * unit, by2 + H - 1); ctx.lineTo(px, py - 4 * unit); ctx.lineTo(px + 9 * unit, by2 + H - 1); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    const dark = (s.bg || '#ffffff').toLowerCase() === '#ffffff' || (s.bg || '').startsWith('#f');
    textBlock(bx2 + 14 * unit, by2 + 4 * unit, 'left', dark ? '#111418' : col);
    ctx.restore();
  } else if (look === 'number') {
    leader();
    const R = 15 * unit;
    const cx = right ? x0 + R : x0 + W - R, cy = by;
    if (kLine >= 1) {
      ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(cx, cy, R * backOut(kText * 3), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `900 ${15 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.fillText(String(s.number || '1'), cx, cy + 1);
      textBlock(right ? cx + R + 10 * unit : cx - R - 10 * unit, y0 + 2 * unit, right ? 'left' : 'right');
    }
  } else if (look === 'bracket') {
    leader();
    if (kLine >= 1) {
      ctx.strokeStyle = col; ctx.lineWidth = 1.8 * unit;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + H); ctx.lineTo(x0 + (W + 10 * unit) * kText, y0 + H); ctx.stroke();
      textBlock(x0 + 10 * unit, y0);
    }
  } else if (look === 'pill') {
    leader();
    if (kLine >= 1) {
      const ph = 34 * unit;
      ctx.font = `700 ${14 * unit}px ${UI}`;
      const label = `${title}${lines.length ? ` · ${lines.join(' ')}` : ''}`;
      const pw = ctx.measureText(label).width + 52 * unit;
      const xx = right ? x0 : x0 + W - pw;
      ctx.fillStyle = hexA(s.bg || '#0d1117', 0.9); rr(ctx, xx, by - ph / 2, pw * easeOut(kText * 1.6), ph, ph / 2); ctx.fill();
      ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(xx + ph / 2, by, ph / 2 - 3 * unit, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = 'center'; ctx.font = `${15 * unit}px ${UI}`; ctx.fillText(s.icon || '📍', xx + ph / 2, by + 1);
      ctx.textAlign = 'left'; ctx.fillStyle = col; ctx.font = `700 ${14 * unit}px ${UI}`; ctx.fillText(typed(label, kText), xx + ph + 6 * unit, by + 1);
    }
  }
}

// ================================================================= photo animations
const CARD_GRADS = [['#ff6ad5', '#8a5cff'], ['#3ef2c8', '#2f7bff'], ['#ffd25e', '#ff5c8a'], ['#7cf8ff', '#c56bff'], ['#ff9a3d', '#ff3d6e'], ['#59ffa0', '#2fb8ff'], ['#c6ff4d', '#00d1b2'], ['#ffb3ec', '#6c7bff']];
function card(ctx, im, i, w, h, unit, colorful, light) {
  ctx.save();
  ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.clip();
  if (im?.bmp) {
    const sc = Math.max(w / im.bmp.width, h / im.bmp.height);
    ctx.drawImage(im.bmp, -im.bmp.width * sc / 2, -im.bmp.height * sc / 2, im.bmp.width * sc, im.bmp.height * sc);
  } else {
    const [a, b] = colorful ? CARD_GRADS[i % CARD_GRADS.length] : ['#dfe5ec', '#9aa7b6'];
    const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2); g.addColorStop(0, a); g.addColorStop(1, b);
    ctx.fillStyle = g; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(-w * 0.15, -h * 0.25, w * 0.5, h * 0.18, -0.5, 0, Math.PI * 2); ctx.fill();
  }
  if (light != null) { ctx.fillStyle = light > 0 ? `rgba(255,255,255,${light * 0.25})` : `rgba(0,0,0,${-light * 0.45})`; ctx.fillRect(-w / 2, -h / 2, w, h); }
  ctx.restore();
}
function photoFx(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, t = o.time || 0;
  const unit = o.unit * 1.75 * (+s.size || 1);
  const D = Math.max(0.5, +L.duration || 6);
  const tau = tm.edit ? D * 0.5 : tm.tau;
  const u = clamp(tau / D, 0, 1);
  const sp = +s.speed || 1;
  const n = clamp(Math.round(+s.count || 8), 3, 24);
  const ims = [s.media, s.media2, s.media3].filter(Boolean).map((id) => imageFor(id));
  const imAt = (i) => (ims.length ? ims[i % ims.length] : null);
  const cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2;
  const intro = tm.edit ? 1 : easeOut(tau / 0.9), outro = tm.edit ? 1 : clamp((D + (+L.hold || 0) - tau) / 0.5, 0, 1);
  ctx.globalAlpha *= tm.alpha;
  if (+s.bg > 0) { ctx.fillStyle = `rgba(255,255,255,${clamp(+s.bg, 0, 1) * intro})`; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); }
  const look = s.look || 'carousel';
  const cw = 150 * unit, ch = 105 * unit;
  const items = [];
  if (look === 'carousel') {
    const R = Math.min(fr.w * 0.36, 420 * unit) * intro;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + tau * 0.6 * sp;
      const z = Math.cos(a);
      const x = Math.sin(a) * R;
      items.push({ i, z, x: cx + x, y: cy + Math.cos(a) * 30 * unit * 0, sx: Math.max(0.08, Math.abs(Math.cos(a))) * (0.75 + 0.25 * (z + 1) / 2), sy: 0.75 + 0.25 * (z + 1) / 2, rot: 0, light: z * 0.6, skew: Math.sin(a) * 0.15 });
    }
  } else if (look === 'fan') {
    const spread = Math.PI * 1.25 * easeIO(clamp(tau / (D * 0.5), 0, 1)) + Math.sin(tau * sp) * 0.1;
    for (let i = 0; i < n; i++) {
      const a = -spread / 2 + (i / (n - 1)) * spread;
      items.push({ i, z: i, x: cx, y: cy - 40 * unit, rot: a, pivot: 110 * unit, sx: 1, sy: 1.2, light: (i / n) * 0.4 - 0.2 });
    }
  } else if (look === 'helix') {
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const a = f * Math.PI * 2.2 + tau * 0.9 * sp;
      const z = Math.cos(a);
      items.push({ i, z, x: cx + Math.sin(a) * 220 * unit * intro, y: cy + (f - 0.5) * Math.min(fr.h * 0.62, 360 * unit) * intro, sx: 0.55 + 0.45 * Math.abs(Math.cos(a)), sy: 0.6, rot: a * 0.25, light: z * 0.5 });
    }
  } else if (look === 'orbit') {
    items.push({ i: 0, z: 0, x: cx, y: cy, sx: 1.25, sy: 1.25, round: true, light: 0 });
    for (let i = 1; i < n; i++) {
      const a = (i / (n - 1)) * Math.PI * 2 + tau * 0.5 * sp;
      const R = Math.min(fr.h * 0.36, 230 * unit) * intro;
      items.push({ i, z: Math.sin(a), x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R * 0.95, sx: 0.55, sy: 0.55, round: true, light: Math.sin(a) * 0.3 });
    }
  } else if (look === 'shatter') {
    const r = rng(hashStr(L.id));
    const k = easeIO(clamp((tau - 0.2) / (D * 0.6), 0, 1));
    for (let i = 0; i < n; i++) {
      const gx = (i % 4) - 1.5, gy = Math.floor(i / 4) - (Math.ceil(n / 4) - 1) / 2;
      const fx = cx + gx * cw * 0.68, fy = cy + gy * ch * 0.68;
      const ox = cx + (r() - 0.5) * fr.w * 1.1, oy = cy + (r() - 0.5) * fr.h * 1.1, orot = (r() - 0.5) * 4;
      items.push({ i, z: r(), x: ox + (fx - ox) * k, y: oy + (fy - oy) * k, rot: orot * (1 - k), sx: 0.66, sy: 0.66, light: (1 - k) * (r() - 0.5) });
    }
  } else {
    const r = rng(hashStr(L.id) + 9);
    for (let i = 0; i < n; i++) {
      const at = (i / n) * D * 0.8;
      const k = tm.edit ? 1 : backOut(clamp((tau - at) / 0.5, 0, 1));
      if (k <= 0) continue;
      items.push({ i, z: i, x: cx + (r() - 0.5) * 260 * unit, y: cy + (r() - 0.5) * 140 * unit - (1 - k) * 300 * unit, rot: (r() - 0.5) * 0.5, sx: 1, sy: 1, polaroid: true, light: 0 });
    }
  }
  items.sort((a, b) => a.z - b.z);
  for (const it of items) {
    ctx.save();
    ctx.globalAlpha *= outro;
    ctx.translate(it.x, it.y);
    if (it.pivot) { ctx.translate(0, it.pivot); ctx.rotate(it.rot); ctx.translate(0, -it.pivot); }
    else if (it.rot) ctx.rotate(it.rot);
    if (it.skew) ctx.transform(1, it.skew, 0, 1, 0, 0);
    ctx.scale(it.sx || 1, it.sy || 1);
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 18 * unit; ctx.shadowOffsetY = 8 * unit;
    if (it.round) {
      ctx.beginPath(); ctx.arc(0, 0, 60 * unit, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 60 * unit, 0, Math.PI * 2); ctx.clip(); card(ctx, imAt(it.i), it.i, 120 * unit, 120 * unit, unit, s.colorful !== false, it.light); ctx.restore();
    } else if (it.polaroid) {
      ctx.fillStyle = '#fbfbf7'; ctx.fillRect(-cw / 2 - 10 * unit, -ch / 2 - 10 * unit, cw + 20 * unit, ch + 42 * unit); ctx.shadowColor = 'transparent';
      card(ctx, imAt(it.i), it.i, cw, ch, unit, s.colorful !== false, null);
    } else {
      ctx.fillStyle = '#fff'; ctx.fillRect(-cw / 2 - 3 * unit, -ch / 2 - 3 * unit, cw + 6 * unit, ch + 6 * unit); ctx.shadowColor = 'transparent';
      card(ctx, imAt(it.i), it.i, cw, ch, unit, s.colorful !== false, it.light);
    }
    ctx.restore();
  }
  if (s.title) {
    ctx.globalAlpha = tm.alpha * clamp((tau - 0.6) / 0.6, 0, 1) * outro;
    ctx.font = `900 ${26 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 18 * unit;
    placeAt(ctx, L, fr, cx - 300 * unit, fr.y + fr.h * 0.82 - 30 * unit, 600 * unit, 60 * unit);
    ctx.fillText(s.title, cx, fr.y + fr.h * 0.82);
  }
}

// ================================================================= match cut article highlights
const FILLER = 'Every frame is a decision and every cut carries meaning across the edit. The language of editing grows from rhythm, structure and the way one image hands its energy to the next. A shot of a door becomes the face of a clock, a sweeping road becomes a river, and the viewer follows without noticing the seam. Designers borrowed the idea for motion graphics, where shapes, words and colour carry the eye from one layout to another while the story keeps moving forward.';
function wrap(ctx, words, maxW) {
  const lines = []; let cur = [];
  for (const w of words) { const test = [...cur, w].join(' '); if (cur.length && ctx.measureText(test).width > maxW) { lines.push(cur); cur = [w]; } else cur.push(w); }
  if (cur.length) lines.push(cur);
  return lines;
}
function matchCut(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, t = o.time || 0;
  const unit = o.unit;
  const pages = String(s.pages || 'news\nmagazine\nweb\ntags').split('\n').map((x) => x.trim().toLowerCase()).filter((x) => MATCH_PAGES[x]);
  if (!pages.length) return;
  const per = Math.max(0.3, +s.hold || 1.6);
  const tau = tm.edit ? per * 0.6 : tm.tau;
  const idx = Math.min(pages.length - 1, Math.floor(tau / per));
  const lu = clamp((tau - idx * per) / per, 0, 1);
  const kind = pages[idx];
  const phrase = String(s.phrase || 'match cut');
  const cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2;
  ctx.globalAlpha *= tm.alpha;
  // page background
  const bg = { news: '#ecebe6', magazine: '#f6f1e9', web: '#ffffff', tags: '#f3f3f3' }[kind];
  ctx.fillStyle = bg; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
  if (s.paper !== false && kind !== 'web') {
    const r = rng(hashStr(L.id) + idx);
    ctx.fillStyle = 'rgba(0,0,0,0.035)';
    for (let i = 0; i < 400; i++) ctx.fillRect(fr.x + r() * fr.w, fr.y + r() * fr.h, 2 * unit, 2 * unit);
    const vg = ctx.createRadialGradient(cx, cy, fr.h * 0.2, cx, cy, fr.w * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = vg; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
  }
  // layout the page in "page space", then move it so the phrase sits at the centre
  const zoom = 1 + ((+s.zoom || 1.6) - 1) * (0.55 + 0.45 * ease(lu));
  const font = { news: `500 ${22 * unit}px ${SERIF}`, magazine: `800 ${30 * unit}px ${UI}`, web: `500 ${20 * unit}px ${UI}`, tags: `700 ${26 * unit}px ${UI}` }[kind];
  ctx.font = font;
  const colW = fr.w * (kind === 'web' ? 0.5 : 0.62);
  const own = String(s.text || '').trim();
  const body = own || FILLER;
  const words = body.split(/\s+/);
  const insertAt = Math.min(words.length, 18 + idx * 7);
  const pw = phrase.split(/\s+/);
  const all = [...words.slice(0, insertAt), ...pw.map((w, i) => (i === 0 ? `\u0001${w}` : `\u0002${w}`)), ...words.slice(insertAt)];
  const lh = { news: 34, magazine: 42, web: 31, tags: 38 }[kind] * unit;
  const lines = wrap(ctx, all.map((w) => w.replace(/[\u0001\u0002]/, '')), colW);
  // find the phrase position
  let k = 0, hx = 0, hy = 0, hw = 0, found = false;
  const marks = [];
  lines.forEach((ln, li) => {
    let x = 0;
    ln.forEach((w) => {
      const raw = all[k++];
      const ww = ctx.measureText(w).width, sw = ctx.measureText(' ').width;
      if (raw.startsWith('\u0001') || raw.startsWith('\u0002')) { marks.push({ li, x, w: ww, sw }); if (!found) { hx = x; hy = li * lh; found = true; } }
      x += ww + sw;
    });
  });
  if (marks.length) { const last = marks.at(-1); hw = marks[0].li === last.li ? last.x + last.w - marks[0].x : marks[0].w; }
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(zoom, zoom); ctx.rotate({ news: -0.03, magazine: 0.025, web: 0, tags: -0.05 }[kind]);
  ctx.translate(-(hx + hw / 2), -hy);
  // furniture per page type
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const top = -lh * 2.6;
  if (kind === 'news') {
    ctx.fillStyle = '#1a1a1a'; ctx.font = `900 ${46 * unit}px ${SERIF}`; ctx.fillText('The Daily Edit', 0, top - 60 * unit);
    ctx.fillRect(0, top - 30 * unit, colW, 2 * unit); ctx.fillRect(0, top - 24 * unit, colW, 1 * unit);
  } else if (kind === 'magazine') {
    ctx.fillStyle = '#d6336c'; ctx.fillRect(-20 * unit, top - 74 * unit, colW + 40 * unit, 34 * unit);
    ctx.fillStyle = '#fff'; ctx.font = `800 ${18 * unit}px ${UI}`; ctx.fillText('RHYTHM   ·   FRAGMENT   ·   CHANNEL', 0, top - 57 * unit);
  } else if (kind === 'web') {
    ctx.fillStyle = '#e8ebef'; rr(ctx, -30 * unit, top - 110 * unit, colW + 60 * unit, 60 * unit, 10 * unit); ctx.fill();
    ctx.fillStyle = '#9aa3ad'; ctx.beginPath(); ctx.arc(-6 * unit, top - 80 * unit, 14 * unit, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a5260'; ctx.font = `600 ${13 * unit}px ${UI}`; ctx.fillText('Editorial desk · 4 min read', 18 * unit, top - 86 * unit);
    ctx.fillStyle = '#2d7ff9'; rr(ctx, colW - 110 * unit, top - 96 * unit, 120 * unit, 30 * unit, 15 * unit); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText('Add topic +', colW - 92 * unit, top - 81 * unit);
  } else {
    ['RHYTHM', 'FRAGMENT', 'CHANNEL'].forEach((tg, i) => { ctx.fillStyle = ['#2b2b2b', '#6b4bb3', '#c23b7a'][i]; ctx.save(); ctx.translate(i * 210 * unit, top - 70 * unit); ctx.transform(1, 0, -0.25, 1, 0, 0); ctx.fillRect(0, 0, 200 * unit, 40 * unit); ctx.restore(); ctx.fillStyle = '#fff'; ctx.font = `800 ${16 * unit}px ${UI}`; ctx.fillText(tg, i * 210 * unit + 18 * unit, top - 50 * unit); });
  }
  // highlight behind the phrase (sweeps across)
  const sweep = tm.edit ? 1 : easeOut(clamp((lu - 0.1) / 0.45, 0, 1));
  const hl = s.highlight || '#ffe14d';
  marks.forEach((m, i) => {
    const f = clamp(sweep * marks.length - i, 0, 1);
    if (f <= 0) return;
    ctx.fillStyle = hexA(hl, 0.85);
    ctx.fillRect(m.x - 4 * unit, m.li * lh - lh * 0.42, (m.w + 8 * unit) * f, lh * 0.84);
  });
  // body text
  ctx.font = font;
  k = 0;
  lines.forEach((ln, li) => {
    let x = 0;
    ln.forEach((w) => {
      const raw = all[k++];
      const hot = raw.startsWith('\u0001') || raw.startsWith('\u0002');
      ctx.fillStyle = hot ? '#111' : kind === 'web' ? '#3b4250' : '#2a2a2a';
      ctx.globalAlpha = tm.alpha * (hot ? 1 : 0.88);
      ctx.fillText(w, x, li * lh);
      x += ctx.measureText(`${w} `).width;
    });
  });
  ctx.restore();
  // the cut: a quick flash and a slight blur on the frame boundary
  const toCut = idx < pages.length - 1 ? per - (tau - idx * per) : 99;
  if (!tm.edit && (lu < 0.06 || toCut < 0.05)) { ctx.fillStyle = `rgba(255,255,255,${lu < 0.06 ? 0.35 * (1 - lu / 0.06) : 0.2})`; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); }
}
