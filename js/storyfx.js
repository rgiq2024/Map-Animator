// Story graphics: text callouts on the map (six looks), animated photo formations (carousel, fan, helix,
// orbit, shatter, polaroid stack) and match-cut article pages where a highlighted phrase stays put while
// the page around it changes.
import { placeAt } from './place.js';
import { imageFor } from './geoimage.js';
import { drawMapCrop } from './vizfx.js';
import { videoFor } from './videofx.js';
import { videoTime } from './screenfx.js';

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
  newsbox: { name: 'News text box', icon: '▭', geom: null, desc: 'Year tab + banner, card with globe header, digital date or source credit' },
  zoomframe: { name: 'Zoom frame (photo / video)', icon: '⧉', geom: 'point', desc: 'A dashed ring on a place with a line to a framed photo, video or close-up of the map, and a caption' },
  matchcut: { name: 'Match cut (article highlights)', icon: '📰', geom: null, desc: 'Newspaper / magazine / web pages cut together while one highlighted phrase stays in place' },
};
export const SF_ANIMS = {
  textcallout: { draw: 'Line draws, text types', pop: 'Pop in', fade: 'Fade in', none: 'Already there' },
  photofx: { play: 'Play' },
  matchcut: { play: 'Play' },
  newsbox: { wipe: 'Wipe in' },
  zoomframe: { open: 'Ring, line, frame opens' },
};
export const CALLOUT_LOOKS = { leader: 'Leader line with underline', box: 'Box with accent bar', bubble: 'Speech bubble', number: 'Numbered marker', bracket: 'Bracket title', pill: 'Pill with icon' };
export const PHOTO_LOOKS = { carousel: 'Carousel ring (3D spin)', fan: 'Fan of cards', helix: 'Helix twist', orbit: 'Orbit round a centre', shatter: 'Shatter → assemble', stack: 'Polaroid stack' };
export const NEWSBOX_LOOKS = { banner: 'Year tab + banner (title & subtitle)', card: 'Card with globe header', date: 'Digital date stamp', source: 'Source credit' };
export const MATCH_PAGES = { news: 'Newspaper', magazine: 'Magazine', web: 'Web article', tags: 'Tag strip', image: 'Your picture 1', image2: 'Your picture 2', image3: 'Your picture 3' };
export const SF_DEFAULTS = {
  textcallout: { anim: 'draw', duration: 1.2, style: { look: 'leader', title: 'Accident site', text: 'Two trains collided at 18:42', color: '#ffffff', accent: '#ff3b30', number: '1', icon: '📍', dx: 140, dy: -90, size: 1, bg: '#0d1117' } },
  photofx: { anim: 'play', duration: 6, style: { look: 'carousel', media: '', media2: '', media3: '', count: 8, speed: 1, size: 1, title: '', bg: 0, colorful: true } },
  newsbox: { anim: 'wipe', duration: 1.2, hold: 4, style: { look: 'banner', tab: '2026', title: 'Satellite imagery shows', sub: 'Conditions before the flash flood', text: '', color: '#14108a', color2: '#1d1aa6', textColor: '#ffffff', width: 560, size: 1, position: '' } },
  zoomframe: { anim: 'open', duration: 1.6, style: { caption: 'Security forces deployment', media: '', clip: '', dx: 260, dy: -150, width: 300, aspect: 0.82, size: 1, zoom: 3, color: '#ffffff', loop: true } },
  matchcut: { anim: 'play', duration: 8, style: { phrase: 'match cut', pages: 'news\nmagazine\nweb\ntags', hold: 1.6, highlight: '#ffe14d', text: '', zoom: 1.6, paper: true, masthead: 'The Daily Edit', headline: '', byline: 'Editorial desk · 4 min read', tags: 'RHYTHM | FRAGMENT | CHANNEL', media: '', media2: '', media3: '', hlX: 0.3, hlY: 0.45, hlW: 0.25, hlH: 0.06, hl2X: 0.3, hl2Y: 0.45, hl2W: 0.25, hl2H: 0.06, hl3X: 0.3, hl3Y: 0.45, hl3W: 0.25, hl3H: 0.06 } },
};
export const SF_FORMS = {
  textcallout: [['style.look', 'Look', 'select', CALLOUT_LOOKS], ['style.title', 'Title', 'text'], ['style.text', 'Text (“ / ” makes a new line)', 'text'], ['style.number', 'Number', 'text', null, (L) => L.style.look === 'number'], ['style.icon', 'Icon (emoji)', 'text', null, (L) => L.style.look === 'pill'], ['style.color', 'Text colour', 'color'], ['style.accent', 'Accent colour', 'color'], ['style.bg', 'Box colour', 'color', null, (L) => ['box', 'bubble', 'pill'].includes(L.style.look)], ['style.dx', 'Box offset ←→', 'range', [-500, 500, 1]], ['style.dy', 'Box offset ↑↓', 'range', [-400, 400, 1]], ['style.size', 'Size', 'range', [0.5, 2.5, 0.05]]],
  photofx: [['style.look', 'Animation', 'select', PHOTO_LOOKS], ['style.media', 'Photo A', 'image'], ['style.media2', 'Photo B', 'image'], ['style.media3', 'Photo C', 'image'], ['style.count', 'Cards', 'range', [3, 16, 1]], ['style.colorful', 'Colour cards when there is no photo', 'switch'], ['style.speed', 'Speed', 'range', [0.2, 3, 0.05]], ['style.size', 'Size', 'range', [0.3, 3, 0.05]], ['style.bg', 'Background (0 = see the map, 1 = white)', 'range', [0, 1, 0.01]], ['style.title', 'Title over the photos', 'text']],
  newsbox: [['style.look', 'Look', 'select', NEWSBOX_LOOKS], ['style.tab', 'Tab text (year)', 'text', null, (L) => L.style.look === 'banner'], ['style.title', 'Title / text', 'text'], ['style.sub', 'Subtitle', 'text', null, (L) => L.style.look === 'banner'], ['style.text', 'Body text (“ / ” starts a new line)', 'textarea', null, (L) => L.style.look === 'card'], ['style.width', 'Card width', 'range', [300, 1000, 5], (L) => L.style.look === 'card'], ['style.color', 'Colour', 'color', null, (L) => ['banner', 'card'].includes(L.style.look)], ['style.color2', 'Gradient to', 'color', null, (L) => L.style.look === 'banner'], ['style.textColor', 'Text colour', 'color', null, (L) => ['date', 'source'].includes(L.style.look)], ['style.size', 'Size', 'range', [0.4, 2.5, 0.05]], ['style.position', 'Position (or drag it)', 'select', { '': 'Default', 'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right', center: 'Centre' }]],
  zoomframe: [['style.caption', 'Caption', 'text'], ['style.media', 'Photo in the frame', 'image'], ['style.clip', 'Video in the frame', 'video'], ['style.zoom', 'Zoom on the map (when there is no photo / video)', 'range', [1.2, 8, 0.1]], ['style.width', 'Frame width', 'range', [120, 700, 1]], ['style.aspect', 'Frame height ÷ width', 'range', [0.4, 1.5, 0.01]], ['style.dx', 'Frame offset ←→ (or drag it)', 'range', [-700, 700, 1]], ['style.dy', 'Frame offset ↑↓', 'range', [-500, 500, 1]], ['style.color', 'Colour', 'color'], ['style.loop', 'Loop the video', 'switch']],
  matchcut: [['style.phrase', 'Highlighted phrase (stays in place)', 'text'], ['style.pages', 'Pages in order — news, magazine, web, tags, image, image2, image3 (one per line)', 'textarea'], ['style.text', 'Your own text (paste the article — if it contains the phrase, that part is highlighted)', 'textarea'], ['style.headline', 'Headline over the text', 'text'], ['style.masthead', 'Newspaper name', 'text'], ['style.byline', 'Web byline', 'text'], ['style.tags', 'Magazine / tag-strip words (separate with |)', 'text'], ['style.media', 'Picture 1 (newspaper cutting, screenshot…)', 'image'], ['style.hlX', 'Picture 1: highlight from left', 'range', [0, 1, 0.005], (L) => /\bimage\b/.test(L.style.pages || '')], ['style.hlY', 'Picture 1: highlight from top', 'range', [0, 1, 0.005], (L) => /\bimage\b/.test(L.style.pages || '')], ['style.hlW', 'Picture 1: highlight width', 'range', [0.02, 1, 0.005], (L) => /\bimage\b/.test(L.style.pages || '')], ['style.hlH', 'Picture 1: highlight height', 'range', [0.01, 0.5, 0.005], (L) => /\bimage\b/.test(L.style.pages || '')], ['style.media2', 'Picture 2', 'image'], ['style.hl2X', 'Picture 2: highlight from left', 'range', [0, 1, 0.005], (L) => /image2/.test(L.style.pages || '')], ['style.hl2Y', 'Picture 2: highlight from top', 'range', [0, 1, 0.005], (L) => /image2/.test(L.style.pages || '')], ['style.hl2W', 'Picture 2: highlight width', 'range', [0.02, 1, 0.005], (L) => /image2/.test(L.style.pages || '')], ['style.hl2H', 'Picture 2: highlight height', 'range', [0.01, 0.5, 0.005], (L) => /image2/.test(L.style.pages || '')], ['style.media3', 'Picture 3', 'image'], ['style.hl3X', 'Picture 3: highlight from left', 'range', [0, 1, 0.005], (L) => /image3/.test(L.style.pages || '')], ['style.hl3Y', 'Picture 3: highlight from top', 'range', [0, 1, 0.005], (L) => /image3/.test(L.style.pages || '')], ['style.hl3W', 'Picture 3: highlight width', 'range', [0.02, 1, 0.005], (L) => /image3/.test(L.style.pages || '')], ['style.hl3H', 'Picture 3: highlight height', 'range', [0.01, 0.5, 0.005], (L) => /image3/.test(L.style.pages || '')], ['style.hold', 'Seconds per page', 'range', [0.4, 4, 0.05]], ['style.zoom', 'Zoom on the phrase', 'range', [1, 3, 0.05]], ['style.highlight', 'Highlighter colour', 'color']],
};
export const SF_SET = new Set(Object.keys(SF_KINDS));
export const SF_SCREEN = new Set(['photofx', 'matchcut', 'newsbox']);
export const sfPhases = (k) => (k === 'textcallout' ? ['above'] : k === 'zoomframe' ? ['captions'] : ['captions']);
export function drawStoryFx(ctx, L, tm, o, phase) {
  ctx.save();
  try {
    if (L.kind === 'textcallout') textCallout(ctx, L, tm, o);
    else if (L.kind === 'photofx' && o.frame) photoFx(ctx, L, tm, o);
    else if (L.kind === 'matchcut' && o.frame) matchCut(ctx, L, tm, o);
    else if (L.kind === 'newsbox' && o.frame) newsBox(ctx, L, tm, o);
    else if (L.kind === 'zoomframe') zoomFrame(ctx, L, tm, o, drawMapCrop, videoFor, videoTime);
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
  if (kind.startsWith('image')) { imagePage(ctx, L, tm, o, kind, lu, idx, pages.length, per, tau); return; }
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
  const pw = phrase.split(/\s+/).filter(Boolean);
  const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  let at = -1;
  if (own) for (let i = 0; i + pw.length <= words.length && at < 0; i++) if (pw.every((p2, j) => norm(words[i + j]) === norm(p2) || (j === pw.length - 1 && norm(words[i + j]).startsWith(norm(p2))))) at = i;
  let all;
  if (at >= 0) all = words.map((w, i) => (i === at ? `\u0001${w}` : i > at && i < at + pw.length ? `\u0002${w}` : w));
  else { const insertAt = Math.min(words.length, 18 + idx * 7); all = [...words.slice(0, insertAt), ...pw.map((w, i) => (i === 0 ? `\u0001${w}` : `\u0002${w}`)), ...words.slice(insertAt)]; }
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
    ctx.fillStyle = '#1a1a1a'; ctx.font = `900 ${46 * unit}px ${SERIF}`; ctx.fillText(s.masthead ?? 'The Daily Edit', 0, top - 60 * unit - (s.headline ? 60 * unit : 0));
    if (s.headline) { ctx.font = `800 ${30 * unit}px ${SERIF}`; ctx.fillText(s.headline, 0, top - 52 * unit, colW); }
    ctx.fillRect(0, top - 30 * unit, colW, 2 * unit); ctx.fillRect(0, top - 24 * unit, colW, 1 * unit);
  } else if (kind === 'magazine') {
    ctx.fillStyle = '#d6336c'; ctx.fillRect(-20 * unit, top - 74 * unit, colW + 40 * unit, 34 * unit);
    ctx.fillStyle = '#fff'; ctx.font = `800 ${18 * unit}px ${UI}`; ctx.fillText(String(s.tags || 'RHYTHM | FRAGMENT | CHANNEL').split('|').map((x) => x.trim().toUpperCase()).join('   ·   '), 0, top - 57 * unit, colW + 20 * unit);
    if (s.headline) { ctx.fillStyle = '#111'; ctx.font = `900 ${34 * unit}px ${UI}`; ctx.fillText(s.headline, 0, top - 4 * unit, colW); }
  } else if (kind === 'web') {
    ctx.fillStyle = '#e8ebef'; rr(ctx, -30 * unit, top - 110 * unit, colW + 60 * unit, 60 * unit, 10 * unit); ctx.fill();
    ctx.fillStyle = '#9aa3ad'; ctx.beginPath(); ctx.arc(-6 * unit, top - 80 * unit, 14 * unit, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a5260'; ctx.font = `600 ${13 * unit}px ${UI}`; ctx.fillText(s.byline ?? 'Editorial desk · 4 min read', 18 * unit, top - 86 * unit);
    if (s.headline) { ctx.fillStyle = '#111'; ctx.font = `800 ${28 * unit}px ${UI}`; ctx.fillText(s.headline, -30 * unit, top - 20 * unit, colW + 60 * unit); }
    ctx.fillStyle = '#2d7ff9'; rr(ctx, colW - 110 * unit, top - 96 * unit, 120 * unit, 30 * unit, 15 * unit); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText('Add topic +', colW - 92 * unit, top - 81 * unit);
  } else {
    String(s.tags || 'RHYTHM | FRAGMENT | CHANNEL').split('|').map((x) => x.trim().toUpperCase()).filter(Boolean).slice(0, 4).forEach((tg, i) => { ctx.fillStyle = ['#2b2b2b', '#6b4bb3', '#c23b7a'][i]; ctx.save(); ctx.translate(i * 210 * unit, top - 70 * unit); ctx.transform(1, 0, -0.25, 1, 0, 0); ctx.fillRect(0, 0, 200 * unit, 40 * unit); ctx.restore(); ctx.fillStyle = '#fff'; ctx.font = `800 ${16 * unit}px ${UI}`; ctx.fillText(tg, i * 210 * unit + 18 * unit, top - 50 * unit); });
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

function imagePage(ctx, L, tm, o, kind, lu, idx, n, per, tau) {
  const s = L.style, fr = o.frame, unit = o.unit;
  const key = kind === 'image' ? '' : kind.slice(5);
  const im = imageFor(s[`media${key}`]);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
  if (!im?.bmp) {
    ctx.fillStyle = '#6b7280'; ctx.font = `600 ${18 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`Add picture ${key || '1'} in the layer settings`, fr.x + fr.w / 2, fr.y + fr.h / 2);
    return;
  }
  const iw = im.bmp.width, ih = im.bmp.height;
  const num = (v, d) => (v === '' || v == null || !isFinite(+v) ? d : +v);
  const hx = clamp(num(s[`hl${key}X`], 0.3), 0, 1), hy = clamp(num(s[`hl${key}Y`], 0.45), 0, 1), hw = clamp(num(s[`hl${key}W`], 0.25), 0.01, 1), hh = clamp(num(s[`hl${key}H`], 0.06), 0.005, 1);
  // the picture is scaled so the highlight fills about 40 % of the frame width (× zoom), centred
  const base = Math.max(fr.w / iw, fr.h / ih) * 0.95;
  const want = (fr.w * 0.42) / (hw * iw);
  const zEnd = Math.max(base, Math.min(want, base * 6)) * (0.85 + 0.15 * ((+s.zoom || 1.6) / 1.6));
  const scale = zEnd * (tm.edit ? 1 : 0.86 + 0.14 * ease(lu));
  const cxImg = (hx + hw / 2) * iw, cyImg = (hy + hh / 2) * ih;
  const ox = fr.x + fr.w / 2 - cxImg * scale, oy = fr.y + fr.h / 2 - cyImg * scale;
  ctx.save();
  ctx.translate(ox, oy); ctx.scale(scale, scale);
  ctx.drawImage(im.bmp, 0, 0);
  // highlighter marker sweeping across the region (multiply keeps the print readable)
  const sweep = tm.edit ? 1 : easeOut(clamp((lu - 0.15) / 0.45, 0, 1));
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = hexA(s.highlight || '#ffe14d', 0.85);
  const pad = hh * ih * 0.12;
  ctx.fillRect(hx * iw - pad, hy * ih - pad, (hw * iw + pad * 2) * sweep, hh * ih + pad * 2);
  ctx.restore();
  // soft vignette for focus
  const vg = ctx.createRadialGradient(fr.x + fr.w / 2, fr.y + fr.h / 2, fr.h * 0.25, fr.x + fr.w / 2, fr.y + fr.h / 2, fr.w * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vg; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
  const toCut = idx < n - 1 ? per - (tau - idx * per) : 99;
  if (!tm.edit && (lu < 0.06 || toCut < 0.05)) { ctx.fillStyle = `rgba(255,255,255,${lu < 0.06 ? 0.35 * (1 - lu / 0.06) : 0.2})`; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); }
}

// ================================================================= news text boxes
const BRANDF = '"Antarctica Expanded","Lexend","Montserrat","Inter",sans-serif';
let globeDots = null;
function dottedGlobe(ctx, cx, cy, R, col) {
  if (!globeDots) {
    globeDots = [];
    const land = (lo, la) => { // very rough land test: Americas and Europe/Africa blobs
      const blobs = [[-100, 48, 34, 20], [-85, 25, 12, 10], [-60, -15, 16, 28], [-42, 72, 14, 9], [12, 50, 20, 13], [20, 5, 20, 28], [75, 45, 45, 22], [110, 20, 20, 14], [135, -25, 18, 10]];
      return blobs.some(([x, y, rx, ry]) => ((lo - x) / rx) ** 2 + ((la - y) / ry) ** 2 < 1);
    };
    for (let la = -80; la <= 80; la += 4.5) for (let lo = -180; lo < 180; lo += 4.5) if (land(lo, la)) globeDots.push([lo, la]);
  }
  ctx.fillStyle = col;
  const lon0 = -30;
  for (const [lo, la] of globeDots) {
    const l = (lo - lon0) * Math.PI / 180, p = la * Math.PI / 180;
    const z = Math.cos(p) * Math.cos(l);
    if (z < 0) continue;
    const x = cx + R * Math.cos(p) * Math.sin(l), y = cy - R * Math.sin(p);
    ctx.globalAlpha = 0.25 + 0.6 * z;
    ctx.beginPath(); ctx.arc(x, y, R * 0.022, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function newsBox(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, t = o.time || 0;
  const unit = o.unit * (+s.size || 1);
  const D = Math.max(0.2, +L.duration || 1);
  const u = tm.edit ? 1 : clamp(tm.tau / D, 0, 1);
  const navy = s.color || '#14108a', navy2 = s.color2 || '#1d1aa6';
  const look = s.look || 'banner';
  ctx.globalAlpha *= tm.alpha;
  const m = 34 * o.unit;
  const pos = s.position || (look === 'source' ? 'bottom-right' : look === 'date' ? 'bottom-left' : 'top-left');
  const place = (W, H) => {
    let x = pos.includes('right') ? fr.x + fr.w - m - W : pos === 'center' ? fr.x + (fr.w - W) / 2 : fr.x + m;
    let y = pos.includes('bottom') ? fr.y + fr.h * 0.74 - H : pos === 'center' ? fr.y + (fr.h - H) / 2 : fr.y + fr.h * 0.2;
    placeAt(ctx, L, fr, x, y, W, H);
    return [x, y];
  };
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  if (look === 'banner') {
    const title = String(s.title || '').toUpperCase(), sub = String(s.sub || '').toUpperCase(), tab = String(s.tab || '');
    ctx.font = `700 ${26 * unit}px ${BRANDF}`; const tw = ctx.measureText(title).width;
    ctx.font = `700 ${13 * unit}px ${BRANDF}`; const sw = ctx.measureText(sub).width;
    const W = Math.max(tw, sw) + 64 * unit, H = (sub ? 68 : 50) * unit, tabH = 34 * unit;
    const [x, y] = place(W, H + tabH);
    const by = y + tabH;
    if (tab) {
      const k = easeOut(u * 2.2);
      ctx.font = `700 ${19 * unit}px ${BRANDF}`; const tabW = Math.max(150 * unit, ctx.measureText(tab).width + 60 * unit);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, by - tabH * k, tabW, tabH * k);
      ctx.save(); ctx.beginPath(); ctx.rect(x, by - tabH * k, tabW, tabH * k); ctx.clip();
      ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.fillText(tab, x + tabW / 2, by - tabH / 2 + 1); ctx.restore();
      ctx.textAlign = 'left';
    }
    const kw = easeOut((u - 0.15) / 0.5);
    if (kw > 0) {
      const g = ctx.createLinearGradient(x, 0, x + W, 0); g.addColorStop(0, navy); g.addColorStop(1, navy2);
      ctx.fillStyle = g; ctx.fillRect(x, by, W * kw, H);
      ctx.save(); ctx.beginPath(); ctx.rect(x, by, W * kw, H); ctx.clip();
      const kt = clamp((u - 0.45) / 0.45, 0, 1);
      ctx.globalAlpha *= kt; ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${26 * unit}px ${BRANDF}`; ctx.fillText(title, x + 32 * unit - (1 - kt) * 20 * unit, by + (sub ? 25 : 25) * unit);
      if (sub) { ctx.font = `700 ${13 * unit}px ${BRANDF}`; ctx.fillText(sub, x + 32 * unit - (1 - kt) * 30 * unit, by + 50 * unit); }
      ctx.restore();
    }
  } else if (look === 'card') {
    const title = String(s.title || '').toUpperCase();
    const body = String(s.text || '').split(' / ');
    const W = (+s.width || 560) * unit, hh = 74 * unit;
    ctx.font = `500 ${24 * unit}px ${BRANDF}`;
    const lines = [];
    for (const para of body) { let cur = ''; for (const w of para.split(/\s+/)) { const tst = cur ? `${cur} ${w}` : w; if (ctx.measureText(tst).width > W - 50 * unit && cur) { lines.push(cur); cur = w; } else cur = tst; } if (cur) lines.push(cur); }
    const bh = lines.length * 32 * unit + 34 * unit;
    const [x, y] = place(W, hh + bh);
    const kh = easeOut(u * 2);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, W * kh, hh); ctx.clip();
    ctx.fillStyle = navy; ctx.fillRect(x, y, W, hh);
    ctx.save(); ctx.beginPath(); ctx.rect(x + W * 0.55, y, W * 0.45, hh); ctx.clip(); dottedGlobe(ctx, x + W * 0.8, y + hh * 1.05, hh * 1.5, 'rgba(255,255,255,0.85)'); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = `800 ${34 * unit}px ${BRANDF}`; ctx.fillText(title, x + 24 * unit, y + hh / 2 + 2 * unit);
    ctx.restore();
    const kb = easeOut((u - 0.3) / 0.4);
    if (kb > 0) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y + hh, W, bh * kb);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y + hh, W, bh * kb); ctx.clip();
      ctx.fillStyle = '#0b0b10'; ctx.font = `500 ${24 * unit}px ${BRANDF}`;
      const total = lines.join(' ').length, shown = Math.ceil(total * clamp((u - 0.45) / 0.55, 0, 1));
      let left = tm.edit ? 1e9 : shown;
      lines.forEach((l, i) => { if (left <= 0) return; ctx.fillText(l.slice(0, left), x + 24 * unit, y + hh + 30 * unit + i * 32 * unit); left -= l.length + 1; });
      ctx.restore();
    }
  } else if (look === 'date') {
    const txt = String(s.title || '2026 - 07 - 30');
    ctx.font = `400 ${30 * unit}px "VT323","JetBrains Mono",monospace`;
    const W = ctx.measureText(txt).width + 10 * unit, H = 36 * unit;
    const [x, y] = place(W, H);
    const shown = tm.edit ? txt.length : Math.ceil(txt.length * clamp(u * 1.2, 0, 1));
    ctx.fillStyle = s.textColor || '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 6 * unit;
    ctx.globalAlpha *= Math.sin(t * 12) > -0.95 ? 1 : 0.7;
    ctx.fillText(txt.slice(0, shown), x, y + H / 2);
  } else {
    const txt = String(s.title || 'Source: —');
    ctx.font = `500 ${17 * unit}px ${BRANDF}`;
    const W = ctx.measureText(txt).width + 8 * unit, H = 26 * unit;
    const [x, y] = place(W, H);
    ctx.globalAlpha *= ease(u);
    ctx.fillStyle = s.textColor || '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 5 * unit;
    ctx.fillText(txt, x, y + H / 2);
  }
}

// ================================================================= zoom frame (inset photo / video linked to a place)
function zoomFrame(ctx, L, tm, o, drawMapCrop, videoFor, videoTime) {
  if (L.geom?.type !== 'Point' || !o.frame) return;
  const s = L.style, fr = o.frame, t = o.time || 0;
  const unit = o.unit;
  const [px, py] = o.proj(L.geom.coordinates);
  const D = Math.max(0.3, +L.duration || 1.5);
  const u = tm.edit ? 1 : clamp(tm.tau / D, 0, 1);
  const W = (+s.width || 300) * unit * (+s.size || 1), H = W * (+s.aspect || 0.82);
  // default frame centre from the offset; dragging moves it (style.pos_frame)
  let fx = px + (+s.dx || 0) * unit - W / 2, fy = py + (+s.dy || -180) * unit - H / 2;
  ctx.save();
  const [ddx, ddy] = placeAt(ctx, L, fr, fx, fy, W, H + 40 * unit, { key: 'frame' });
  ctx.restore();
  fx += ddx; fy += ddy;
  const col = s.color || '#ffffff';
  ctx.globalAlpha *= tm.alpha;
  // target ring
  const kr = easeOut(u / 0.25);
  const R = 14 * unit * backOut(kr);
  ctx.strokeStyle = col; ctx.lineWidth = 3 * unit;
  ctx.setLineDash([5 * unit, 4 * unit]); ctx.lineDashOffset = -t * 10 * unit;
  ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, 5 * unit * kr, 0, Math.PI * 2); ctx.fill();
  // connector to the nearest frame edge point
  const tx = clamp(px, fx, fx + W), ty = clamp(py, fy, fy + H);
  const ex = Math.abs(px - (fx + W / 2)) / W > Math.abs(py - (fy + H / 2)) / H ? (px < fx ? fx : fx + W) : tx;
  const ey = Math.abs(px - (fx + W / 2)) / W > Math.abs(py - (fy + H / 2)) / H ? ty : (py < fy ? fy : fy + H);
  const kl = easeOut((u - 0.15) / 0.3);
  const sx = px + (ex - px) * (R / (Math.hypot(ex - px, ey - py) || 1)), sy = py + (ey - py) * (R / (Math.hypot(ex - px, ey - py) || 1));
  if (kl > 0) { ctx.lineWidth = 4 * unit; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + (ex - sx) * kl, sy + (ey - sy) * kl); ctx.stroke(); }
  // frame opens from the connector end
  const kf = easeOut((u - 0.42) / 0.38);
  if (kf > 0) {
    const cxF = ex + (fx + W / 2 - ex) * kf, cyF = ey + (fy + H / 2 - ey) * kf, w2 = W * kf, h2 = H * kf;
    const x0 = cxF - w2 / 2, y0 = cyF - h2 / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 16 * unit;
    ctx.fillStyle = '#000'; ctx.fillRect(x0, y0, w2, h2); ctx.shadowColor = 'transparent';
    ctx.beginPath(); ctx.rect(x0, y0, w2, h2); ctx.clip();
    const cover = (srcW, srcH, draw) => { const sc = Math.max(w2 / srcW, h2 / srcH) * (1 + 0.05 * clamp(tm.tau / 8, 0, 1)); const dw = srcW * sc, dh = srcH * sc; draw(x0 + (w2 - dw) / 2, y0 + (h2 - dh) / 2, dw, dh); };
    const v = s.clip ? videoFor(s.clip) : null;
    const im = !v && s.media ? imageFor(s.media) : null;
    if (v?.ready) {
      if (!o.exact) { const target = videoTime({ style: { speed: 1, loop: s.loop !== false } }, tm, v.el.duration || 0); if (Math.abs(v.el.currentTime - target) > 0.08) { try { v.el.currentTime = target; } catch { /* not ready */ } } }
      cover(v.el.videoWidth || 16, v.el.videoHeight || 9, (x, y, w, h) => { try { ctx.drawImage(v.el, x, y, w, h); } catch { /* frame not ready */ } });
    } else if (im?.bmp) cover(im.bmp.width, im.bmp.height, (x, y, w, h) => ctx.drawImage(im.bmp, x, y, w, h));
    else {
      // magnified view of the map around the place
      const z = Math.max(1.2, +s.zoom || 3);
      const cw = w2 / z, ch = h2 / z;
      ctx.filter = 'contrast(1.08) saturate(1.05)';
      if (!drawMapCrop(ctx, o, px - cw / 2, py - ch / 2, cw, ch, x0, y0, w2, h2)) { ctx.fillStyle = '#333'; ctx.fillRect(x0, y0, w2, h2); }
      ctx.filter = 'none';
    }
    ctx.restore();
    ctx.strokeStyle = col; ctx.lineWidth = 5 * unit; ctx.strokeRect(x0, y0, w2, h2);
    // caption under the frame
    const kc = clamp((u - 0.8) / 0.2, 0, 1);
    if (s.caption && kc > 0) {
      ctx.save(); ctx.globalAlpha *= kc;
      ctx.font = `700 ${15 * unit * (+s.size || 1)}px ${BRANDF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = col; ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 6 * unit;
      ctx.fillText(s.caption, fx + W / 2, fy + H + 10 * unit);
      ctx.restore();
    }
  }
}
