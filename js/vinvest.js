// Satellite imagery · Visual investigations — investigation frame (intro / before / after / side by side / photo cards / swipe),
// image tiles placed on the map with "Area" markers, box callouts, site outlines with boxed labels, black place labels.
import { placeAt } from './place.js';
import { imageFor } from './geoimage.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const seg = (u, a, b) => clamp((u - a) / Math.max(1e-6, b - a), 0, 1);
const D2R = Math.PI / 180;

export const VI_KINDS = {
  viframe: { name: 'Investigation frame', icon: '🛰', geom: null, desc: 'Visual-investigation layouts: intro title, BEFORE image, AFTER image, side by side, photo cards that slide in, or a swipe — with dates, labels and image credit' },
  vitile: { name: 'Image tile on the map', icon: '🖼', geom: 'point', desc: 'A satellite image laid on the map at its real size, with an “Area 1” marker and leader line — for showing where each image was taken' },
  vibox: { name: 'Box callout', icon: '⬜', geom: 'point', desc: 'A square drawn around a feature with a label above it (“Bridge”)' },
  vioutline: { name: 'Site outline', icon: '⬡', geom: 'polygon', desc: 'An outline that draws itself around a site, with a boxed label in the corner (“Imam Khomeini Space Centre”)' },
  vijourney: { name: 'Fly-over: city → pan → reveal the site', icon: '🛩', geom: 'point', desc: 'Starts on a city with its black label, pans across the land to the site, then zooms in while an outline draws around it with a boxed label — click the site on the map' },
  vilabel: { name: 'Black place label', icon: '🏷', geom: 'point', desc: 'A bold white-on-black place label (“TEHRAN”) with a small pointer' },
};
export const VI_ANIMS = {
  viframe: { fade: 'Fade in', slide: 'AFTER slides in (side by side)', cards: 'Photo cards slide in, then line up', wipe: 'Swipe from BEFORE to AFTER', push: 'Slow push-in (Ken Burns)', none: 'No animation' },
  vitile: { pop: 'Drops onto the map', fade: 'Fade in', none: 'No animation' },
  vibox: { draw: 'Draws itself', pop: 'Pops in', fade: 'Fade in' },
  vioutline: { draw: 'Draws itself', fade: 'Fade in' },
  vijourney: { journey: 'City → pan → zoom and reveal' },
  vilabel: { pop: 'Pops in', fade: 'Fade in', type: 'Types in' },
};
export const VI_DUR = { vijourney: 19, viframe: 6, vitile: 1, vibox: 1.2, vioutline: 2.2, vilabel: 0.8 };
export const VI_DEFAULTS = {
  viframe: { layout: 'side', kicker: 'VISUAL INVESTIGATION', title: 'What satellite images show', sub: '', date: '', credit: 'Satellite images: Maxar Technologies', beforeMedia: '', afterMedia: '', beforeLabel: 'Before', afterLabel: 'After', beforeDate: '', afterDate: '', labelStyle: 'box', gap: 6, bg: '#e8e8e6', titleFont: 'Georgia', titleColor: '#ffffff', shade: 0.55, push: 0.06, focusX: 0, focusY: 0, split: 0.5, cardsBg: true, accent: '#f05a28' },
  vitile: { media: '', label: 'Area 1', widthKm: 1.2, rotate: 0, border: '#ffffff', borderW: 2, shadow: true, marker: true, markerColor: '#f05a28', leader: 34, labelSide: 'below', date: '', opacity: 1 },
  vibox: { label: 'Bridge', sizeM: 120, color: '#ffffff', width: 2.5, labelPos: 'above', fontSize: 1 },
  vioutline: { label: 'Site name', color: '#111111', width: 2.5, dash: false, fill: '', labelPos: 'corner', mono: true },
  vijourney: { fromPlace: 'Tehran', fromLL: null, fromLabel: 'TEHRAN', siteQuery: '', siteLabel: 'Site name', cityZoom: 10.5, panZoom: 10.5, endZoom: 14.6, holdCity: 2, panSec: 12, zoomSec: 3, holdEnd: 2, bearing: 0, shape: 'octagon', sizeM: 900, lineColor: '#111111', lineWidth: 2.5, labelSize: 1, mono: true },
  vilabel: { text: 'TEHRAN', size: 1, bg: '#111111', color: '#ffffff', pointer: true },
};
const LBL = { box: 'White box, dark text', plain: 'White text (no box)', dark: 'Dark box, white text' };
const FONTS = { Georgia: 'Georgia (serif, newspaper)', Inter: 'Inter', 'Playfair Display': 'Playfair Display', Jost: 'Jost', Oswald: 'Oswald', 'IBM Plex Mono': 'Mono' };
const isLay = (...k) => (L) => k.includes(L.style.layout);
export const VI_FORMS = {
  viframe: [
    ['style.layout', 'Layout', 'select', { intro: 'Intro — title over the map', before: 'BEFORE — one image, full frame', after: 'AFTER — one image, full frame', side: 'Side by side — before | after', swipe: 'Swipe — divider over before / after' }],
    ['', '🎬 Make the full set: Intro → Before → After → Side by side (adds 3 scenes after this one)', 'gvaction', 'viMakeSet'],
    ['style.kicker', 'Kicker (small line above the title)', 'text', null, isLay('intro')], ['style.title', 'Title', 'textarea', null, isLay('intro')], ['style.sub', 'Subtitle', 'text', null, isLay('intro')], ['style.date', 'Date / byline', 'text', null, isLay('intro')],
    ['style.titleFont', 'Title font', 'select', FONTS, isLay('intro')], ['style.titleColor', 'Title colour', 'color', null, isLay('intro')], ['style.shade', 'Dark shade behind the title', 'range', [0, 1, 0.01], isLay('intro')],
    ['style.beforeMedia', 'BEFORE image', 'image', null, isLay('before', 'side', 'swipe')], ['style.beforeLabel', 'BEFORE label', 'text', null, isLay('before', 'side', 'swipe')], ['style.beforeDate', 'BEFORE date (e.g. Aug. 19)', 'text', null, isLay('before', 'side', 'swipe')],
    ['style.afterMedia', 'AFTER image', 'image', null, isLay('after', 'side', 'swipe')], ['style.afterLabel', 'AFTER label', 'text', null, isLay('after', 'side', 'swipe')], ['style.afterDate', 'AFTER date', 'text', null, isLay('after', 'side', 'swipe')],
    ['', 'No image? The live map shows instead — set the map’s place and zoom in this scene.', 'note', null, isLay('before', 'after', 'side', 'swipe')],
    ['style.labelStyle', 'Label look', 'select', LBL, isLay('before', 'after', 'side', 'swipe')],
    ['style.gap', 'Gap between the images', 'range', [0, 40, 1], isLay('side')], ['style.bg', 'Background (cards, gap)', 'color', null, isLay('side')],
    ['style.split', 'Divider position (fixed)', 'range', [0, 1, 0.01], isLay('swipe')],
    ['style.push', 'Push-in amount', 'range', [0, 0.3, 0.01], isLay('before', 'after', 'side', 'swipe')], ['style.focusX', 'Image focus ← →', 'range', [-1, 1, 0.01], isLay('before', 'after', 'side', 'swipe')], ['style.focusY', 'Image focus ↑ ↓', 'range', [-1, 1, 0.01], isLay('before', 'after', 'side', 'swipe')],
    ['style.credit', 'Image credit (bottom right)', 'text'], ['style.accent', 'Accent colour', 'color'],
  ],
  vitile: [
    ['style.media', 'Satellite image', 'image'], ['style.widthKm', 'Width on the ground (km)', 'range', [0.05, 50, 0.05]], ['style.rotate', 'Rotate (°)', 'range', [-180, 180, 1]],
    ['style.opacity', 'Opacity', 'range', [0.1, 1, 0.01]], ['style.border', 'Border colour', 'color'], ['style.borderW', 'Border width', 'range', [0, 8, 0.5]], ['style.shadow', 'Shadow', 'switch'],
    ['style.date', 'Date on the image (e.g. Aug. 19)', 'text'],
    ['style.marker', 'Marker', 'switch'], ['style.label', 'Marker label', 'text', null, (L) => L.style.marker !== false], ['style.markerColor', 'Marker colour', 'color', null, (L) => L.style.marker !== false],
    ['style.labelSide', 'Label', 'select', { below: 'Below (leader line down)', above: 'Above', right: 'Right' }, (L) => L.style.marker !== false], ['style.leader', 'Leader line length', 'range', [0, 120, 1], (L) => L.style.marker !== false],
  ],
  vibox: [['style.label', 'Label', 'text'], ['style.sizeM', 'Box size on the ground (m)', 'range', [5, 3000, 5]], ['style.color', 'Colour', 'color'], ['style.width', 'Line width', 'range', [0.5, 8, 0.5]], ['style.labelPos', 'Label', 'select', { above: 'Above', below: 'Below', inside: 'Inside, top' }], ['style.fontSize', 'Label size', 'range', [0.5, 2.5, 0.05]]],
  vioutline: [['style.label', 'Label', 'text'], ['style.color', 'Line colour', 'color'], ['style.width', 'Line width', 'range', [0.5, 8, 0.5]], ['style.dash', 'Dashed', 'switch'], ['style.fill', 'Fill (empty = none)', 'color'], ['style.labelPos', 'Label at', 'select', { corner: 'Top-left of the frame', site: 'Top-left of the outline', none: 'No label' }], ['style.mono', 'Typewriter (mono) label', 'switch']],
  vijourney: [
    ['', 'Choose where it starts and the site — type them, or press 📍 and click on the map — then press 🎬.', 'note'],
    ['style.fromPlace', 'Start from (city)', 'llpick'], ['style.fromLabel', 'City label', 'text'],
    ['geom', 'Site to reveal', 'llpick'], ['style.siteLabel', 'Site label (boxed, top-left)', 'text'],
    ['', '🎬 Set up the camera (city → pan → zoom)', 'gvaction', 'viJourney'],
    ['style.holdCity', 'Stay on the city (s)', 'range', [0, 6, 0.1]], ['style.panSec', 'Pan takes (s) — more = slower', 'range', [1, 60, 0.5]], ['style.zoomSec', 'Zoom in takes (s)', 'range', [0.5, 10, 0.1]], ['style.holdEnd', 'Stay on the site (s)', 'range', [0, 8, 0.1]],
    ['style.cityZoom', 'City zoom', 'range', [5, 16, 0.1]], ['style.panZoom', 'Pan height (zoom) — lower number = higher up, pan looks slower', 'range', [6, 16, 0.1]], ['style.endZoom', 'Final zoom on the site', 'range', [10, 19, 0.1]], ['style.bearing', 'Map rotation (°)', 'range', [-180, 180, 1]],
    ['', 'After changing these, press the button again.', 'note'],
    ['style.shape', 'Reveal outline', 'select', { octagon: 'Octagon', square: 'Square', circle: 'Circle', none: 'No outline' }], ['style.sizeM', 'Outline size (m)', 'range', [50, 10000, 10], (L) => L.style.shape !== 'none'],
    ['style.lineColor', 'Outline colour', 'color', null, (L) => L.style.shape !== 'none'], ['style.lineWidth', 'Outline width', 'range', [0.5, 8, 0.5], (L) => L.style.shape !== 'none'],
    ['style.labelSize', 'Label size', 'range', [0.5, 2.5, 0.05]], ['style.mono', 'Typewriter (mono) site label', 'switch'],
  ],
  vilabel: [['style.text', 'Text', 'text'], ['style.size', 'Size', 'range', [0.5, 3, 0.05]], ['style.bg', 'Box colour', 'color'], ['style.color', 'Text colour', 'color'], ['style.pointer', 'Pointer under the box', 'switch']],
};
export const VI_SET = new Set(Object.keys(VI_KINDS));

// ---------------------------------------------------------------- helpers
function cover(ctx, im, x, y, w, h, z = 1, fx = 0, fy = 0) {
  const k = Math.max(w / im.w, h / im.h) * z, dw = im.w * k, dh = im.h * k;
  ctx.drawImage(im.bmp, x + (w - dw) / 2 - fx * (dw - w) / 2, y + (h - dh) / 2 - fy * (dh - h) / 2, dw, dh);
}
function tag(ctx, text, x, y, u, look = 'box', fs = 15, alignR = false) {
  if (!text) return;
  ctx.save(); ctx.font = `600 ${fs * u}px Inter, Helvetica, Arial, sans-serif`; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + (look === 'plain' ? 0 : 14 * u), h = fs * u * 1.75, x0 = alignR ? x - w : x;
  if (look === 'box') { ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(x0, y, w, h); ctx.fillStyle = '#111'; }
  else if (look === 'dark') { ctx.fillStyle = 'rgba(12,12,12,0.85)'; ctx.fillRect(x0, y, w, h); ctx.fillStyle = '#fff'; }
  else { ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 5 * u; }
  ctx.fillText(text, x0 + (look === 'plain' ? 0 : 7 * u), y + h / 2 + 0.5 * u);
  ctx.restore();
}
const imgOrNull = (id, o) => { const im = id ? imageFor(id) : null; if (im && !im.ready) im.p?.then?.(() => o.map?.triggerRepaint?.()); return im?.ready ? im : null; };

// ---------------------------------------------------------------- investigation frame
function drawFrame(ctx, L, tm, o) {
  const s = L.style, fr = o.frame; if (!fr) return;
  const A = tm.alpha ?? 1; if (A <= 0) return;
  const u = fr.w / 1920, D = Math.max(0.5, +L.duration || 6);
  const tau = o.time == null || tm.edit ? D : o.time - (+L.start || 0), k = clamp(tau / D, 0, 1);
  const an = L.anim || 'fade', lay = s.layout || 'side';
  const z = 1 + clamp(+s.push || 0, 0, 0.4) * (an === 'none' ? 0 : k), fx = +s.focusX || 0, fy = +s.focusY || 0;
  const B = imgOrNull(s.beforeMedia, o), Af = imgOrNull(s.afterMedia, o);
  const credit = () => { if (!s.credit) return; ctx.save(); ctx.font = `500 ${15 * u}px Inter, sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4 * u; ctx.fillText(s.credit, fr.x + fr.w - 16 * u, fr.y + fr.h - 12 * u); ctx.restore(); };
  ctx.save(); ctx.globalAlpha *= A;
  if (lay === 'intro') {
    const sh = clamp(+(s.shade ?? 0.55), 0, 1);
    if (sh > 0) { const g = ctx.createLinearGradient(0, fr.y + fr.h * 0.35, 0, fr.y + fr.h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${sh})`); ctx.fillStyle = g; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); }
    const st = (a, b) => (an === 'none' ? 1 : ease(seg(k, a, b)));
    const x = fr.x + 90 * u; let y = fr.y + fr.h - 110 * u;
    placeAt(ctx, L, fr, x, fr.y + fr.h * 0.5, fr.w * 0.6, fr.h * 0.42, { key: 'title' });
    const tf = s.titleFont || 'Georgia', lines = String(s.title || '').split('\n').filter(Boolean);
    const fsT = 84 * u;
    // from the bottom up: date, sub, title, kicker
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    if (s.date) { ctx.globalAlpha = A * st(0.55, 0.85); ctx.font = `500 ${19 * u}px Inter, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(s.date, x, y); y -= 34 * u; }
    if (s.sub) { ctx.globalAlpha = A * st(0.4, 0.75); ctx.font = `400 ${32 * u}px ${tf}, Georgia, serif`; ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillText(s.sub, x, y); y -= 46 * u; }
    ctx.globalAlpha = A * st(0.1, 0.5); ctx.font = `700 ${fsT}px "${tf}", Georgia, serif`; ctx.fillStyle = s.titleColor || '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 12 * u;
    for (let i = lines.length - 1; i >= 0; i--) { ctx.fillText(lines[i], x, y + (1 - st(0.1, 0.5)) * 20 * u); y -= fsT * 1.12; }
    ctx.shadowBlur = 0;
    if (s.kicker) { ctx.globalAlpha = A * st(0, 0.3); ctx.font = `700 ${18 * u}px Inter, sans-serif`; try { ctx.letterSpacing = `${3 * u}px`; } catch { /* */ } ctx.fillStyle = s.accent || '#f05a28'; ctx.fillText(s.kicker, x, y + fsT * 0.35); try { ctx.letterSpacing = '0px'; } catch { /* */ } ctx.fillRect(x, y + fsT * 0.35 + 12 * u, 46 * u * st(0, 0.4), 3 * u); }
    ctx.restore(); return;
  }
  const one = (im, label, date, x, y, w, h, a = 1) => {
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (im) cover(ctx, im, x, y, w, h, z, fx, fy);
    const look = s.labelStyle || 'box', txt = [label, date].filter(Boolean).join(look === 'plain' ? '  ' : ' · ');
    tag(ctx, txt, x + 16 * u, y + 16 * u, u, look, 21);
    ctx.restore();
  };
  if (lay === 'before' || lay === 'after') {
    const a = an === 'fade' ? ease(seg(k, 0, 0.25)) : 1;
    one(lay === 'before' ? B : Af, lay === 'before' ? s.beforeLabel : s.afterLabel, lay === 'before' ? s.beforeDate : s.afterDate, fr.x, fr.y, fr.w, fr.h, a);
    credit(); ctx.restore(); return;
  }
  if (lay === 'swipe') {
    const p = an === 'wipe' ? 1 - ease(seg(k, 0.15, 0.75)) : clamp(+(s.split ?? 0.5), 0, 1);
    one(Af, s.afterLabel, '', fr.x, fr.y, fr.w, fr.h);
    ctx.save(); ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w * p, fr.h); ctx.clip(); one(B || Af, '', '', fr.x, fr.y, fr.w, fr.h); ctx.restore();
    tag(ctx, [s.beforeLabel, s.beforeDate].filter(Boolean).join(' · '), fr.x + 16 * u, fr.y + 16 * u, u, s.labelStyle || 'box', 21);
    tag(ctx, [s.afterLabel, s.afterDate].filter(Boolean).join(' · '), fr.x + fr.w - 16 * u, fr.y + 16 * u, u, s.labelStyle || 'box', 21, true);
    ctx.fillStyle = '#fff'; ctx.fillRect(fr.x + fr.w * p - 1.5 * u, fr.y, 3 * u, fr.h);
    credit(); ctx.restore(); return;
  }
  // side by side (and the photo-card entrance)
  const g = clamp(+(s.gap ?? 6), 0, 60) * u, w2 = (fr.w - g) / 2;
  if (g > 0) { ctx.fillStyle = s.bg || '#e8e8e6'; ctx.fillRect(fr.x + w2, fr.y, g, fr.h); }
  if (an === 'cards') {
    const c1 = ease(seg(k, 0, 0.28)), c2 = ease(seg(k, 0.25, 0.5)), grow = ease(seg(k, 0.55, 0.85));
    if (s.cardsBg !== false && grow < 1) { ctx.save(); ctx.globalAlpha *= 1 - grow; ctx.fillStyle = s.bg || '#e8e8e6'; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); ctx.restore(); }
    const card = (im, i, enter) => {
      const cw0 = fr.w * 0.36, ch0 = cw0 * 0.66, tx = i ? fr.x + fr.w * 0.55 : fr.x + fr.w * 0.09, ty = fr.y + fr.h * 0.28;
      const sx = tx + (1 - enter) * fr.w * 0.8;
      const x = sx + (fr.x + i * (w2 + g) - sx) * grow, y = ty + (fr.y - ty) * grow, w = cw0 + (w2 - cw0) * grow, h = ch0 + (fr.h - ch0) * grow;
      if (enter <= 0) return;
      ctx.save(); ctx.shadowColor = `rgba(0,0,0,${0.3 * (1 - grow)})`; ctx.shadowBlur = 24 * u; ctx.shadowOffsetY = 8 * u; ctx.fillStyle = '#ddd'; ctx.fillRect(x, y, w, h); ctx.restore();
      one(im, grow > 0.95 ? (i ? s.afterLabel : s.beforeLabel) : '', grow > 0.95 ? (i ? s.afterDate : s.beforeDate) : '', x, y, w, h);
    };
    card(B, 0, c1); card(Af, 1, c2);
    if (grow >= 1) credit(); ctx.restore(); return;
  }
  const sl = an === 'slide' ? ease(seg(k, 0.15, 0.6)) : 1, fa = an === 'fade' ? ease(seg(k, 0, 0.3)) : 1;
  one(B, s.beforeLabel, s.beforeDate, fr.x, fr.y, w2, fr.h, fa);
  ctx.save(); ctx.translate((1 - sl) * (w2 + g), 0); one(Af, s.afterLabel, s.afterDate, fr.x + w2 + g, fr.y, w2, fr.h, fa); ctx.restore();
  credit(); ctx.restore();
}

// ---------------------------------------------------------------- image tile on the map
function drawTile(ctx, L, tm, o) {
  const s = L.style; if (L.geom?.type !== 'Point') return;
  const A = tm.alpha ?? 1; if (A <= 0) return;
  const u = o.unit, c = L.geom.coordinates, k = tm.edit ? 1 : ease(clamp(tm.u ?? 1, 0, 1));
  const im = imgOrNull(s.media, o);
  const wKm = clamp(+s.widthKm || 1, 0.01, 500), ar = im ? im.h / im.w : 0.7, hKm = wKm * ar, rot = (+s.rotate || 0) * D2R;
  const off = (dx, dy) => { const x = dx * Math.cos(rot) - dy * Math.sin(rot), y = dx * Math.sin(rot) + dy * Math.cos(rot); return o.proj([c[0] + x / (111.32 * Math.cos(c[1] * D2R)), c[1] + y / 110.57]); };
  const p0 = off(-wKm / 2, hKm / 2), p1 = off(wKm / 2, hKm / 2), p3 = off(-wKm / 2, -hKm / 2), p2 = off(wKm / 2, -hKm / 2);
  const ctr = o.proj(c);
  ctx.save(); ctx.globalAlpha *= A * (L.anim === 'fade' ? k : 1);
  if (L.anim === 'pop' && k < 1) { const sc = 0.7 + 0.3 * k; ctx.translate(ctr[0], ctr[1]); ctx.scale(sc, sc); ctx.translate(-ctr[0], -ctr[1]); ctx.globalAlpha *= clamp(k * 1.5, 0, 1); }
  // the image as a quad
  ctx.save();
  if (s.shadow !== false) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 10 * u; ctx.shadowOffsetY = 3 * u; }
  ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3); ctx.closePath();
  ctx.fillStyle = '#9a9187'; ctx.fill(); ctx.shadowColor = 'transparent';
  if (im) { ctx.clip(); ctx.globalAlpha *= clamp(+s.opacity || 1, 0.05, 1); ctx.transform((p1[0] - p0[0]) / im.w, (p1[1] - p0[1]) / im.w, (p3[0] - p0[0]) / im.h, (p3[1] - p0[1]) / im.h, p0[0], p0[1]); ctx.drawImage(im.bmp, 0, 0); }
  ctx.restore();
  if (+s.borderW > 0) { ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3); ctx.closePath(); ctx.strokeStyle = s.border || '#fff'; ctx.lineWidth = +s.borderW * u; ctx.stroke(); }
  if (s.date) { ctx.save(); ctx.font = `600 ${11 * u}px Inter, sans-serif`; ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4 * u; ctx.textBaseline = 'top'; ctx.fillText(s.date, Math.min(p0[0], p3[0]) + 6 * u, Math.min(p0[1], p1[1]) + 5 * u); ctx.restore(); }
  if (s.marker !== false) {
    const r = 9 * u, side = s.labelSide || 'below', len = (+s.leader || 0) * u;
    ctx.save(); ctx.translate(ctr[0], ctr[1]); ctx.rotate(Math.PI / 4); ctx.fillStyle = s.markerColor || '#f05a28'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.4 * u; ctx.fillRect(-r, -r, 2 * r, 2 * r); ctx.strokeRect(-r, -r, 2 * r, 2 * r); ctx.fillStyle = '#fff'; ctx.fillRect(-r * 0.32, -r * 0.32, r * 0.64, r * 0.64); ctx.restore();
    if (s.label) {
      const [dx, dy] = side === 'above' ? [0, -1] : side === 'right' ? [1, 0] : [0, 1];
      const ex = ctr[0] + dx * (r * 1.4 + len), ey = ctr[1] + dy * (r * 1.4 + len);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.moveTo(ctr[0] + dx * r * 1.4, ctr[1] + dy * r * 1.4); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.font = `700 ${17 * u}px Inter, Helvetica, sans-serif`; ctx.fillStyle = '#111'; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3 * u; ctx.lineJoin = 'round';
      ctx.textAlign = side === 'right' ? 'left' : 'center'; ctx.textBaseline = side === 'above' ? 'bottom' : side === 'right' ? 'middle' : 'top';
      const tx = ex + (side === 'right' ? 4 * u : 0), ty = ey + (side === 'below' ? 3 * u : side === 'above' ? -3 * u : 0);
      ctx.strokeText(s.label, tx, ty); ctx.fillText(s.label, tx, ty);
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- box callout, outline, place label
function drawBox(ctx, L, tm, o) {
  const s = L.style; if (L.geom?.type !== 'Point') return;
  const A = tm.alpha ?? 1; if (A <= 0) return;
  const u = o.unit, c = L.geom.coordinates, m = clamp(+s.sizeM || 120, 1, 1e5) / 2000;
  const a = o.proj([c[0] - m / (111.32 * Math.cos(c[1] * D2R)), c[1] + m / 110.57]), b = o.proj([c[0] + m / (111.32 * Math.cos(c[1] * D2R)), c[1] - m / 110.57]);
  const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
  const k = tm.edit ? 1 : ease(clamp(tm.u ?? 1, 0, 1));
  ctx.save(); ctx.globalAlpha *= A * (L.anim === 'fade' ? k : 1); ctx.strokeStyle = s.color || '#fff'; ctx.lineWidth = (+s.width || 2.5) * u;
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4 * u;
  if (L.anim === 'draw' && k < 1) { const per = 2 * (w + h); ctx.setLineDash([per * k, per]); }
  if (L.anim === 'pop' && k < 1) { const sc = 1.25 - 0.25 * k; ctx.translate(x + w / 2, y + h / 2); ctx.scale(sc, sc); ctx.translate(-(x + w / 2), -(y + h / 2)); ctx.globalAlpha *= k; }
  ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
  if (s.label) { const fs = 18 * u * clamp(+s.fontSize || 1, 0.4, 3), pos = s.labelPos || 'above'; ctx.globalAlpha *= L.anim === 'draw' ? clamp((k - 0.6) / 0.4, 0, 1) : 1; ctx.font = `700 ${fs}px Inter, Helvetica, sans-serif`; ctx.fillStyle = s.color || '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = pos === 'below' ? 'top' : 'bottom'; ctx.fillText(s.label, x + w / 2, pos === 'below' ? y + h + 5 * u : pos === 'inside' ? y + fs * 1.3 : y - 5 * u); }
  ctx.restore();
}
function drawOutline(ctx, L, tm, o) {
  const s = L.style; const g = L.geom; if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return;
  const A = tm.alpha ?? 1; if (A <= 0) return;
  const u = o.unit, k = tm.edit ? 1 : ease(clamp(tm.u ?? 1, 0, 1));
  const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]);
  ctx.save(); ctx.globalAlpha *= A * (L.anim === 'fade' ? k : 1);
  let bx = Infinity, by = Infinity;
  for (const r of rings) {
    const pts = r.map((p) => o.proj(p)); let per = 0; for (let i = 1; i < pts.length; i++) per += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    pts.forEach((p) => { bx = Math.min(bx, p[0]); by = Math.min(by, p[1]); });
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath();
    if (s.fill) { ctx.save(); ctx.globalAlpha *= 0.22 * k; ctx.fillStyle = s.fill; ctx.fill(); ctx.restore(); }
    ctx.strokeStyle = s.color || '#111'; ctx.lineWidth = (+s.width || 2.5) * u; ctx.lineJoin = 'round';
    ctx.setLineDash(L.anim === 'draw' && k < 1 ? [per * k, per] : s.dash ? [8 * u, 6 * u] : []); ctx.stroke();
  }
  ctx.setLineDash([]);
  if (s.label && s.labelPos !== 'none') {
    const fr = o.frame || { x: 0, y: 0 }, la = L.anim === 'draw' ? clamp((k - 0.5) / 0.4, 0, 1) : 1;
    ctx.globalAlpha *= la;
    ctx.font = `${s.mono !== false ? '500' : '700'} ${15 * u}px ${s.mono !== false ? '"IBM Plex Mono", "Courier New", monospace' : 'Inter, sans-serif'}`;
    const tw = ctx.measureText(s.label).width + 16 * u, th = 26 * u;
    const x = s.labelPos === 'site' ? bx : fr.x + 18 * u, y = s.labelPos === 'site' ? by - th - 6 * u : fr.y + 18 * u;
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(x, y, tw, th); ctx.strokeStyle = '#111'; ctx.lineWidth = 1 * u; ctx.strokeRect(x, y, tw, th);
    ctx.fillStyle = '#111'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(s.label, x + 8 * u, y + th / 2 + u);
  }
  ctx.restore();
}
function drawPlaceLabel(ctx, L, tm, o) {
  const s = L.style; if (L.geom?.type !== 'Point') return;
  const A = tm.alpha ?? 1; if (A <= 0) return;
  const u = o.unit, p = o.proj(L.geom.coordinates), k = tm.edit ? 1 : ease(clamp(tm.u ?? 1, 0, 1));
  const full = String(s.text || '').toUpperCase(), txt = L.anim === 'type' ? full.slice(0, Math.ceil(full.length * k)) : full;
  const fs = 20 * u * clamp(+s.size || 1, 0.3, 4);
  ctx.save(); ctx.globalAlpha *= A * (L.anim === 'fade' ? k : 1);
  ctx.font = `800 ${fs}px Inter, Helvetica, Arial, sans-serif`;
  const w = ctx.measureText(full).width + fs * 0.9, h = fs * 1.55, x = p[0] - w / 2, y = p[1] - h - (s.pointer !== false ? fs * 0.45 : h / 2 * 0);
  if (L.anim === 'pop' && k < 1) { const sc = 0.6 + 0.4 * k + Math.sin(k * Math.PI) * 0.08; ctx.translate(p[0], p[1]); ctx.scale(sc, sc); ctx.translate(-p[0], -p[1]); }
  ctx.fillStyle = s.bg || '#111'; ctx.fillRect(x, y, w, h);
  if (s.pointer !== false) { ctx.beginPath(); ctx.moveTo(p[0] - fs * 0.35, y + h); ctx.lineTo(p[0], y + h + fs * 0.45); ctx.lineTo(p[0] + fs * 0.35, y + h); ctx.fill(); }
  ctx.fillStyle = s.color || '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(txt, x + fs * 0.45, y + h / 2 + fs * 0.04);
  ctx.restore();
}

// ---------------------------------------------------------------- fly-over: city → pan → reveal
const jTimes = (s) => { const h = Math.max(0, +s.holdCity || 0), p = Math.max(0.5, +s.panSec || 12), z = Math.max(0.3, +s.zoomSec || 3), e = Math.max(0, +s.holdEnd || 0); return { h, p, z, e, arrive: h + p, done: h + p + z, total: h + p + z + e }; };
function drawJourney(ctx, L, tm, o) {
  const s = L.style; if (L.geom?.type !== 'Point') return;
  const A = tm.alpha ?? 1; if (A <= 0) return;
  const u = o.unit, T = jTimes(s), t = o.time == null || tm.edit ? null : o.time - (+L.start || 0);
  const fr = o.frame || { x: 0, y: 0, w: 1920, h: 1080 };
  // city label: on while the camera is on the city, fades out as the pan starts
  const ca = t == null ? 1 : clamp(t / 0.5, 0, 1) * (1 - clamp((t - T.h - 0.3) / 0.8, 0, 1));
  if (Array.isArray(s.fromLL) && s.fromLabel && ca > 0) {
    const p = o.proj(s.fromLL), fs = 22 * u * clamp(+s.labelSize || 1, 0.4, 3);
    ctx.save(); ctx.globalAlpha *= A * ca; ctx.font = `800 ${fs}px Inter, Helvetica, Arial, sans-serif`;
    const txt = String(s.fromLabel).toUpperCase(), w = ctx.measureText(txt).width + fs * 0.9, h = fs * 1.55, x = p[0] - w / 2, y = p[1] - h - fs * 0.45;
    ctx.fillStyle = '#111'; ctx.fillRect(x, y, w, h); ctx.beginPath(); ctx.moveTo(p[0] - fs * 0.35, y + h); ctx.lineTo(p[0], y + h + fs * 0.45); ctx.lineTo(p[0] + fs * 0.35, y + h); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x + fs * 0.45, y + h / 2 + fs * 0.04); ctx.restore();
  }
  // the reveal: outline draws around the site while the camera zooms in, then the boxed label
  const rk = t == null ? 1 : ease(clamp((t - T.arrive - T.z * 0.35) / Math.max(0.6, T.z * 0.8), 0, 1));
  if (rk <= 0) return;
  const c = L.geom.coordinates, r = clamp(+s.sizeM || 900, 10, 1e5) / 2000, kx = 111.32 * Math.cos(c[1] * D2R), ky = 110.57;
  ctx.save(); ctx.globalAlpha *= A;
  if (s.shape !== 'none') {
    const n = s.shape === 'circle' ? 64 : s.shape === 'square' ? 4 : 8, off = s.shape === 'square' ? Math.PI / 4 : s.shape === 'octagon' ? Math.PI / 8 : 0;
    const rr = s.shape === 'square' ? r * Math.SQRT2 : r;
    const pts = []; for (let i = 0; i <= n; i++) { const a = off + (i / n) * Math.PI * 2; pts.push(o.proj([c[0] + (Math.cos(a) * rr) / kx, c[1] + (Math.sin(a) * rr) / ky])); }
    let per = 0; for (let i = 1; i < pts.length; i++) per += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)));
    ctx.strokeStyle = s.lineColor || '#111'; ctx.lineWidth = (+s.lineWidth || 2.5) * u; ctx.lineJoin = 'round'; ctx.setLineDash(rk < 1 ? [per * rk, per] : []); ctx.stroke(); ctx.setLineDash([]);
  }
  const la = clamp((rk - 0.55) / 0.45, 0, 1);
  if (s.siteLabel && la > 0) {
    ctx.globalAlpha *= la; const fs = 16 * u * clamp(+s.labelSize || 1, 0.4, 3);
    ctx.font = `${s.mono !== false ? '500' : '700'} ${fs}px ${s.mono !== false ? '"IBM Plex Mono", "Courier New", monospace' : 'Inter, sans-serif'}`;
    const tw = ctx.measureText(s.siteLabel).width + fs, th = fs * 1.7, x = fr.x + 18 * u, y = fr.y + 18 * u;
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(x, y, tw, th); ctx.strokeStyle = '#111'; ctx.lineWidth = 1 * u; ctx.strokeRect(x, y, tw, th);
    ctx.fillStyle = '#111'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(s.siteLabel, x + fs / 2, y + th / 2 + u);
  }
  ctx.restore();
}
export function drawVI(ctx, L, tm, o, phase) {
  if (L.kind === 'vijourney' && phase === 'captions') return drawJourney(ctx, L, tm, o);
  if (phase !== 'captions') return;
  if (L.kind === 'viframe') return drawFrame(ctx, L, tm, o);
  if (L.kind === 'vitile') return drawTile(ctx, L, tm, o);
  if (L.kind === 'vibox') return drawBox(ctx, L, tm, o);
  if (L.kind === 'vioutline') return drawOutline(ctx, L, tm, o);
  if (L.kind === 'vilabel') return drawPlaceLabel(ctx, L, tm, o);
}

async function placeLL(q) {
  const m = String(q || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) return [+m[2], +m[1]];
  const r = (await (await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=en&q=' + encodeURIComponent(q))).json())[0];
  return r ? [+r.lon, +r.lat] : null;
}
export const VI_ACTIONS = {
  /** writes the scene's camera: hold on the city, pan at a steady height to the site, zoom in, hold */
  async viJourney(L, { scene }) {
    const s = L.style;
    if (s.siteQuery) { const p = await placeLL(s.siteQuery).catch(() => null); if (!p) return `“${s.siteQuery}” was not found`; L.geom = { type: 'Point', coordinates: p }; }
    if (L.geom?.type !== 'Point') return 'Click the site on the map first';
    const from = s.fromPlace ? await placeLL(s.fromPlace).catch(() => null) : null;
    if (!from) return `“${s.fromPlace || ''}” was not found — type a city or “lat, lon”`;
    s.fromLL = from;
    const to = L.geom.coordinates, T = jTimes(s), b = +s.bearing || 0;
    const V = (c, z) => ({ center: [+c[0].toFixed(6), +c[1].toFixed(6)], zoomRef: +(+z).toFixed(3), bearing: b, pitch: 0 });
    const lerp = (u) => [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u];
    const cz = +s.cityZoom || 10.5, pz = +s.panZoom || 10.5, ez = +s.endZoom || 14.6;
    const keys = [{ t: 0, ease: 'linear', view: V(from, cz) }];
    if (T.h > 0) keys.push({ t: T.h, ease: 'ease', view: V(from, cz) });
    // ease into the pan height near the city, constant speed across, then arrive
    // gentle start and stop, steady glide in the middle
    const n = 16, sm = (u) => u * u * (3 - 2 * u);
    for (let i = 1; i <= n; i++) { const u = i / n, k = 0.55 * sm(u) + 0.45 * u; keys.push({ t: +(T.h + T.p * u).toFixed(3), ease: 'linear', view: V(lerp(k), cz + (pz - cz) * Math.min(1, u * 4)) }); }
    keys.push({ t: +(T.done).toFixed(3), ease: 'linear', view: V(to, ez) });
    if (T.e > 0) keys.push({ t: +(T.total).toFixed(3), ease: 'linear', view: V(to, ez + 0.15) });
    if (scene) { scene.camera.mode = 'keyframes'; scene.camera.keys = keys; scene.sceneLength = Math.max(+scene.sceneLength || 0, T.total); }
    L.start = 0; L.duration = T.total;
    const km = Math.round(Math.hypot((to[0] - from[0]) * 111.32 * Math.cos(to[1] * D2R), (to[1] - from[1]) * 110.57));
    return `Camera set: ${s.fromLabel || s.fromPlace} → pan ${km} km → zoom in on the site (${T.total.toFixed(1)} s) — press ▶`;
  },
  /** clones this scene three times after itself with Before, After and Side-by-side layouts (this one becomes the intro) */
  viMakeSet(L) {
    if (!globalThis.__viMakeSet) return 'Open the project in the editor first';
    return globalThis.__viMakeSet(L.id);
  },
};
