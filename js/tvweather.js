// TV weather-forecast graphics: the title bar (with colour scales), big city values, a gust / temperature heatmap
// interpolated from station values (with moving wind arrows), city forecast cards and the TV pressure disc.
import { placeAt, CUSTOM_POS } from './place.js';
import { imageFor } from './geoimage.js';
import { drawWxIcon, WX_ICONS } from './weather.js';
import { H } from './cartofx.js';

const { clamp, easeOut, UI, hexA, rr, prog, parseLL, polysOf, pathPolys, off, shade, hashStr } = H;
const BOLD = '"Montserrat","Arial Black","Segoe UI",system-ui,sans-serif';
const rows = (txt) => String(txt || '').split('\n').map((l) => l.split('|').map((v) => v.trim())).filter((r) => r[0]);

// ---------------------------------------------------------------- colour scales
export const SCALES = {
  rain: { label: ['LIGHT', 'SNOW'], stops: ['#7ef08a', '#3fcf5a', '#1fa244', '#11782f', '#0b5a22', '#ffe600', '#ff9c00', '#ff2a00', '#a8001c', '#ff3bd0', '#ff7ae6', '#f3b6ff', '#d9d0ff', '#ffffff'], ticks: [] },
  wind: { label: [], stops: ['#bdbdbd', '#3b6dff', '#27c4ff', '#34e07a', '#f2f23a', '#ff9c1a', '#ff2a2a', '#ff2ad0', '#b41cff', '#8a12ff'], ticks: ['10mph', '20mph', '30mph', '40mph', '50mph'] },
  temp: { label: [], stops: ['#3b2a8f', '#2f6bff', '#29c7e6', '#4fd16b', '#f1e63a', '#ff9d22', '#ff4a2a', '#b0122a'], ticks: ['0°', '10°', '20°', '30°', '40°'] },
  mm: { label: ['mm'], stops: ['#2bb24c', '#f5c400', '#ff9d00', '#ff6a00', '#ff4a00', '#e3271b', '#c4161c', '#a50f15'], ticks: ['1.5', '2', '3', '7', '10', '20', '30'] },
  vis: { label: [], stops: ['#5c5c5c', '#8a8a8a', '#bdbdbd', '#e6e6e6', '#ffffff'], ticks: ['0 mi', '2', '5', '10 mi'] },
};
function rampColor(stops, k) {
  k = clamp(k, 0, 1) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(k)), f = k - i;
  const p = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const a = p(stops[i]), b = p(stops[i + 1]);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

// ---------------------------------------------------------------- registry
const SD = 'Fallbrook | -117.25, 33.38 | 24\nPalomar | -116.86, 33.35 | 6\nBorrego Springs | -116.37, 33.26 | 4\nOceanside | -117.38, 33.2 | 2\nEscondido | -117.09, 33.12 | 19\nJulian | -116.6, 33.08 | 50\nRamona | -116.87, 33.04 | 39\nDel Mar | -117.27, 32.96 | 8\nEl Cajon | -116.96, 32.79 | 10\nAlpine | -116.77, 32.84 | 41\nPine Valley | -116.53, 32.82 | 38\nSan Diego | -117.16, 32.72 | 3\nChula Vista | -117.08, 32.64 | 5\nCampo | -116.47, 32.61 | 31';
export const TW_KINDS = {
  wxbar: { name: 'Weather title bar', icon: '▬', geom: null, desc: 'The TV weather bar: logo, title (CURRENT VISIBILITY, WIND GUST FORECAST…), day and time, and a colour scale' },
  wxvalues: { name: 'City values (TV)', icon: '⓾', geom: null, desc: 'Big numbers over cities — “10.0 mi”, “24”, “38°” — with the city name in a dark strip' },
  wxheat: { name: 'Gust / temperature map from values', icon: '▦', geom: null, desc: 'A smooth colour map interpolated from your station values (wind gusts, temperature, rain, visibility) with moving wind arrows' },
  wxcards: { name: 'City forecast cards', icon: '▤', geom: null, desc: 'Cards on the map: city name, low in black, high in red and a weather icon (7News style)' },
  wxsystem: { name: 'High / low (TV disc)', icon: 'Ⓗ', geom: 'point', desc: 'A big H or L disc with arrows turning around it' },
};
export const TW_ANIMS = {
  wxbar: { slide: 'Slides down', fade: 'Fade in', none: 'Shown' },
  wxvalues: { pop: 'Pop in one by one', count: 'Numbers count up', fade: 'Fade in', none: 'Shown' },
  wxheat: { fade: 'Fade in', sweep: 'Sweeps in from the west', none: 'Shown' },
  wxcards: { pop: 'Pop in one by one', fade: 'Fade in', none: 'Shown' },
  wxsystem: { spin: 'Turning', pop: 'Pop in, then turn', none: 'Still' },
};
export const TW_DEFAULTS = {
  wxbar: { anim: 'slide', duration: 0.8, style: { theme: 'white', title: 'WIND GUST FORECAST', day: 'TUE', time: '1:35 AM', logo: '', logoText: 'WEATHER|IMPACT', sub: '', scale: 'none', accent: '#0f2a5c', size: 1 } },
  wxvalues: { anim: 'pop', duration: 2.5, style: { list: SD, unit: '', size: 1, look: 'tv', valueColor: '#ffffff' } },
  wxheat: { anim: 'fade', duration: 1.5, style: { list: SD, scale: 'wind', min: 0, max: 55, opacity: 0.8, power: 2, texture: 0.6, clip: '', arrows: true, arrowDir: 225, arrowColor: '#b6ff3a', arrowDensity: 1, speed: 1, blend: 'normal' } },
  wxcards: { anim: 'pop', duration: 3, style: {
    list: 'Darwin | 130.84, -12.46 | 23 | 33 | partly\nBroome | 122.24, -17.96 | 13 | 31 | wind\nPerth | 115.86, -31.95 | 7 | 21 | sunny\nAlice Springs | 133.88, -23.7 | 1 | 17 | sunny\nCairns | 145.77, -16.92 | 21 | 26 | showers\nBrisbane | 153.03, -27.47 | 11 | 20 | showers\nSydney | 151.21, -33.87 | 10 | 15 | rain\nCanberra | 149.13, -35.28 | 0 | 13 | partly\nMelbourne | 144.96, -37.81 | 4 | 14 | partly\nAdelaide | 138.6, -34.93 | 6 | 15 | partly\nHobart | 147.33, -42.88 | 3 | 13 | partly',
    size: 1, look: 'seven', hiColor: '#c8102e', iconBg: '#2f7de1',
  } },
  wxsystem: { anim: 'spin', duration: 1.2, style: { type: 'H', color: '', size: 1, speed: 1 } },
};
export const TW_FORMS = {
  wxbar: [
    ['style.theme', 'Look', 'select', { white: 'White bar (CBS 8)', dark: 'Dark bar + scale strip (News 5)', red: 'Red tab (7 News)' }],
    ['style.title', 'Title', 'text'], ['style.day', 'Day', 'text'], ['style.time', 'Time', 'text'], ['style.sub', 'Small label under the logo (e.g. RPM Model)', 'text'],
    ['style.logo', 'Logo picture (optional)', 'image'], ['style.logoText', 'Logo text when there is no picture (two lines: A|B)', 'text', null, (L) => !L.style.logo],
    ['style.scale', 'Colour scale', 'select', { none: 'None', rain: 'Rain → snow (LIGHT … SNOW)', wind: 'Wind gust (10–50 mph)', temp: 'Temperature', mm: 'Rainfall mm', vis: 'Visibility' }],
    ['style.accent', 'Text colour', 'color'], ['style.size', 'Size', 'range', [0.5, 1.6, 0.02]],
  ],
  wxvalues: [
    ['style.list', 'Cities — “Name | longitude, latitude | value”', 'cities', 'values'], ['style.unit', 'Unit after the number (e.g. mi, °, mph)', 'text'],
    ['style.look', 'Look', 'select', { tv: 'Big number + name strip', badge: 'Number in a dark badge' }], ['style.valueColor', 'Number colour', 'color'], ['style.size', 'Size', 'range', [0.4, 3, 0.05]],
  ],
  wxheat: [
    ['style.list', 'Stations — “Name | longitude, latitude | value”', 'cities', 'values'],
    ['style.scale', 'Colours', 'select', { wind: 'Wind gusts (grey → blue → red → purple)', temp: 'Temperature', rain: 'Rain (green → red → pink)', vis: 'Visibility (grey)' }],
    ['style.min', 'Lowest value', 'number'], ['style.max', 'Highest value', 'number'], ['style.power', 'Smoothness', 'range', [1, 4, 0.1]],
    ['style.opacity', 'Strength', 'range', [0.1, 1, 0.02]], ['style.texture', 'Terrain-like texture', 'range', [0, 1, 0.02]], ['style.blend', 'Blend', 'select', { normal: 'Normal', multiply: 'Multiply (map shows through)' }],
    ['style.clip', 'Only inside this area (optional)', 'layerref', 'polygon'],
    ['style.arrows', 'Moving wind arrows', 'switch'], ['style.arrowDir', 'Wind blows towards (degrees, 0 = north)', 'range', [0, 359, 1], (L) => L.style.arrows !== false],
    ['style.arrowColor', 'Arrow colour', 'color', null, (L) => L.style.arrows !== false], ['style.arrowDensity', 'Arrows', 'range', [0.3, 3, 0.05], (L) => L.style.arrows !== false], ['style.speed', 'Arrow speed', 'range', [0.2, 4, 0.05], (L) => L.style.arrows !== false],
  ],
  wxcards: [
    ['style.list', `Cities — “Name | longitude, latitude | low | high | icon” (icons: ${Object.keys(WX_ICONS).join(', ')})`, 'cities', 'cards'],
    ['style.look', 'Look', 'select', { seven: 'Name tab + low / high + icon (7 News)', compact: 'Icon + name + temperature' }], ['style.hiColor', 'High temperature colour', 'color'], ['style.iconBg', 'Icon box colour', 'color'], ['style.size', 'Size', 'range', [0.4, 2.5, 0.05]],
  ],
  wxsystem: [['style.type', 'System', 'select', { H: 'High pressure', L: 'Low pressure' }], ['style.color', 'Colour (empty = blue for H, red for L)', 'color'], ['style.size', 'Size', 'range', [0.3, 4, 0.05]], ['style.speed', 'Turning speed', 'range', [0, 4, 0.05]]],
};
export const TW_SET = new Set(Object.keys(TW_KINDS));
export function twPhases(k) { return { wxbar: ['captions'], wxheat: ['below', 'above'], wxvalues: ['above'], wxcards: ['above'], wxsystem: ['above'] }[k] || ['above']; }

// ================================================================= title bar
function scaleStrip(ctx, x, y, w, h, key, unit, labels = true, light = false) {
  const S = SCALES[key]; if (!S) return;
  const st = S.stops;
  const lw = labels && S.label[0] ? (ctx.measureText(S.label[0]).width + 8 * unit) : 0;
  ctx.font = `600 ${h * 0.62}px ${UI}`; ctx.textBaseline = 'middle';
  let x0 = x;
  if (labels && S.label[0]) { ctx.fillStyle = light ? '#1a2a4a' : '#fff'; ctx.textAlign = 'left'; ctx.fillText(S.label[0], x, y + h / 2); x0 += ctx.measureText(S.label[0]).width + 8 * unit; }
  const rw = w - (x0 - x) - (labels && S.label[1] ? ctx.measureText(S.label[1]).width + 8 * unit : 0);
  if (key === 'rain' || key === 'mm') {
    const bw = rw / st.length;
    ctx.strokeStyle = light ? '#1a2a4a' : '#fff'; ctx.lineWidth = 1 * unit; ctx.strokeRect(x0, y + h * 0.12, rw, h * 0.76);
    st.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x0 + i * bw + 1, y + h * 0.18, bw - 2, h * 0.64); });
  } else {
    const g = ctx.createLinearGradient(x0, 0, x0 + rw, 0); st.forEach((c, i) => g.addColorStop(i / (st.length - 1), c));
    ctx.fillStyle = g; ctx.fillRect(x0, y + h * 0.12, rw, h * 0.5);
    ctx.fillStyle = '#fff'; ctx.font = `600 ${h * 0.34}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    S.ticks.forEach((tk, i) => ctx.fillText(tk, x0 + (rw * (i + 0.5)) / S.ticks.length, y + h * 0.66));
  }
  if (labels && S.label[1]) { ctx.font = `600 ${h * 0.62}px ${UI}`; ctx.fillStyle = light ? '#1a2a4a' : '#fff'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(S.label[1], x + w, y + h / 2); }
  void lw;
}
function drawBar(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, unit = o.unit * (+s.size || 1);
  if (!fr) return;
  const u = prog(L, tm), k = tm.edit || L.anim === 'none' ? 1 : easeOut(u);
  const m = 30 * o.unit, W = fr.w - m * 2, Hh = 46 * unit, x = fr.x + m;
  let y = fr.y + 12 * o.unit;
  if (L.anim === 'slide' && !tm.edit) y -= (1 - k) * (Hh + 40 * unit);
  ctx.save(); placeAt(ctx, L, fr, x, y, W, Hh);
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !tm.edit ? k : 1);
  const acc = s.accent || '#0f2a5c';
  const logo = () => {
    const im = s.logo && imageFor(s.logo);
    if (im?.ready) { const lh = Hh * 0.9, lw = (im.w / im.h) * lh; ctx.drawImage(im.bmp, x + 14 * unit, y + (Hh - lh) / 2, lw, lh); return lw + 28 * unit; }
    const [a, b] = String(s.logoText || 'WEATHER|IMPACT').split('|');
    ctx.fillStyle = acc; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = `italic 900 ${Hh * 0.34}px ${BOLD}`; ctx.fillText(a || '', x + 16 * unit, y + Hh * 0.44);
    ctx.font = `italic 900 ${Hh * 0.42}px ${BOLD}`; ctx.fillText(b || '', x + 22 * unit, y + Hh * 0.86);
    return Math.max(ctx.measureText(b || '').width + 30 * unit, 150 * unit);
  };
  if (s.theme === 'dark') {
    ctx.fillStyle = 'rgba(10,14,22,0.82)'; ctx.fillRect(x, y, W, Hh);
    ctx.fillStyle = '#fff'; ctx.fillRect(x + 8 * unit, y + 6 * unit, 200 * unit, Hh - 12 * unit);
    const [a, b] = String(s.logoText || 'NEWS|WEATHER').split('|');
    ctx.font = `900 ${Hh * 0.36}px ${BOLD}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = '#111'; ctx.fillText(a || '', x + 18 * unit, y + Hh / 2);
    ctx.fillStyle = '#e8401c'; ctx.fillText(b || '', x + 22 * unit + ctx.measureText(a || '').width, y + Hh / 2);
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Hh * 0.56}px ${BOLD}`; ctx.textAlign = 'center'; ctx.fillText(s.title || '', x + W * 0.55, y + Hh / 2 + 1);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x + W - 175 * unit, y + 6 * unit, 2 * unit, Hh - 12 * unit);
    ctx.textAlign = 'left'; ctx.fillStyle = '#ff9a1f'; ctx.font = `800 ${Hh * 0.36}px ${BOLD}`; ctx.fillText(s.day || '', x + W - 160 * unit, y + Hh * 0.3);
    ctx.fillStyle = '#fff'; ctx.fillText(s.time || '', x + W - 160 * unit, y + Hh * 0.72);
    if (s.scale && s.scale !== 'none') { ctx.fillStyle = 'rgba(10,14,22,0.7)'; ctx.fillRect(x + W * 0.22, y + Hh, W * 0.6, Hh * 0.42); scaleStrip(ctx, x + W * 0.23, y + Hh + 2 * unit, W * 0.58, Hh * 0.38, s.scale, unit, true); }
  } else if (s.theme === 'red') {
    ctx.save(); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 260 * unit, y); ctx.lineTo(x + 240 * unit, y + Hh); ctx.lineTo(x, y + Hh); ctx.closePath(); ctx.fillStyle = '#d8101f'; ctx.fill(); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.fillRect(x + 250 * unit, y, 190 * unit, Hh);
    ctx.font = `900 ${Hh * 0.62}px ${BOLD}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = '#fff'; ctx.fillText((s.title || 'WEATHER FORECAST').split(' ')[0], x + 20 * unit, y + Hh / 2 + 1);
    ctx.fillStyle = '#d8101f'; ctx.font = `900 ${Hh * 0.5}px ${BOLD}`; ctx.fillText((s.title || 'WEATHER FORECAST').split(' ').slice(1).join(' '), x + 262 * unit, y + Hh / 2 + 1);
    ctx.fillStyle = '#111'; ctx.fillRect(x + 250 * unit, y + Hh, 190 * unit, Hh * 0.46);
    ctx.fillStyle = '#fff'; ctx.font = `700 ${Hh * 0.3}px ${UI}`; ctx.fillText(`${s.day || ''} ${s.time || ''}`.trim(), x + 262 * unit, y + Hh * 1.23);
  } else {
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 8 * unit; ctx.fillStyle = '#ffffff'; rr(ctx, x, y, W, Hh, 3 * unit); ctx.fill(); ctx.shadowColor = 'transparent';
    const lw = logo();
    ctx.fillStyle = acc; ctx.textBaseline = 'middle';
    const hasScale = s.scale && s.scale !== 'none' && s.scale !== 'wind' && s.scale !== 'temp';
    ctx.font = `900 ${Hh * 0.62}px ${BOLD}`; ctx.textAlign = hasScale ? 'left' : 'center';
    ctx.fillText(s.title || '', hasScale ? x + lw + 10 * unit : x + lw + (W - lw - 260 * unit) / 2, y + Hh / 2 + 1);
    ctx.font = `500 ${Hh * 0.5}px ${UI}`;
    if (hasScale) {
      const tw = ctx.measureText(s.title || '').width; ctx.font = `900 ${Hh * 0.62}px ${BOLD}`;
      const tx = x + lw + 10 * unit + ctx.measureText(s.title || '').width + 24 * unit;
      ctx.font = `500 ${Hh * 0.5}px ${UI}`; ctx.textAlign = 'left'; ctx.fillText(`${s.day || ''}  ${s.time || ''}`, tx, y + Hh / 2 + 1);
      const dx = tx + ctx.measureText(`${s.day || ''}  ${s.time || ''}`).width + 20 * unit;
      scaleStrip(ctx, dx, y + Hh * 0.28, x + W - 14 * unit - dx, Hh * 0.44, s.scale, unit, true, true);
      void tw;
    } else { ctx.textAlign = 'right'; ctx.fillText(`${s.day || ''}   ${s.time || ''}`, x + W - 16 * unit, y + Hh / 2 + 1); }
    if (s.scale === 'wind' || s.scale === 'temp') {
      const sw = 470 * unit, sx = x + W - sw, sy = y + Hh + 6 * unit;
      ctx.fillStyle = 'rgba(12,18,30,0.85)'; ctx.fillRect(sx, sy, sw, 40 * unit);
      scaleStrip(ctx, sx + 10 * unit, sy + 6 * unit, sw - 20 * unit, 30 * unit, s.scale, unit, false);
    }
    if (s.sub) { ctx.fillStyle = '#1b5fae'; ctx.fillRect(x, y + Hh + 4 * unit, 150 * unit, 26 * unit); ctx.fillStyle = '#fff'; ctx.font = `600 ${15 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.fillText(s.sub, x + 75 * unit, y + Hh + 17 * unit); }
  }
  ctx.restore();
}

// ================================================================= city values
function drawValues(ctx, L, tm, o) {
  const s = L.style, unit = o.unit * (+s.size || 1);
  const list = rows(s.list).map(([name, c, v]) => ({ name, ll: parseLL(c), v: v ?? '' })).filter((x) => x.ll);
  const u = prog(L, tm), n = list.length;
  ctx.save(); ctx.globalAlpha *= tm.alpha;
  list.forEach((p, i) => {
    let k = 1;
    if (!tm.edit && L.anim === 'pop') k = easeOut(clamp(u * (n + 2) - i, 0, 1));
    else if (!tm.edit && L.anim === 'fade') k = u;
    if (k <= 0) return;
    const q = o.proj(p.ll);
    if (!isFinite(q[0])) return;
    let val = String(p.v);
    if (!tm.edit && L.anim === 'count') {
      const m = /^(-?\d+(?:\.(\d+))?)(.*)$/.exec(val.trim());
      if (m) val = `${(parseFloat(m[1]) * easeOut(clamp(u * 1.4, 0, 1))).toFixed(m[2] ? m[2].length : 0)}${m[3]}`;
    }
    const txt = `${val}${s.unit ? ` ${s.unit}` : ''}`;
    ctx.save(); ctx.globalAlpha *= clamp(k * 1.5, 0, 1);
    ctx.translate(q[0], q[1]); const sc = 0.6 + 0.4 * k; ctx.scale(sc, sc);
    const fs = 34 * unit;
    ctx.font = `800 ${fs}px ${BOLD}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (s.look === 'badge') {
      const tw = ctx.measureText(txt).width + 18 * unit; ctx.fillStyle = 'rgba(10,14,22,0.85)'; rr(ctx, -tw / 2, -fs * 0.95, tw, fs * 1.15, 6 * unit); ctx.fill();
      ctx.fillStyle = s.valueColor || '#fff'; ctx.fillText(txt, 0, 0);
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 6 * unit; ctx.shadowOffsetY = 2 * unit;
      ctx.lineWidth = 2 * unit; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(txt, 0, 0);
      ctx.fillStyle = s.valueColor || '#fff'; ctx.fillText(txt, 0, 0);
      ctx.shadowColor = 'transparent';
    }
    ctx.font = `800 ${14 * unit}px ${BOLD}`;
    const nw = ctx.measureText(p.name.toUpperCase()).width + 8 * unit;
    ctx.fillStyle = 'rgba(10,10,12,0.82)'; ctx.fillRect(-nw / 2, 3 * unit, nw, 19 * unit);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(p.name.toUpperCase(), 0, 13 * unit);
    ctx.restore();
  });
  ctx.restore();
}

// ================================================================= value heatmap (IDW) + wind arrows
function noise2(x, y) { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); }
function fbm(x, y) {
  let v = 0, a = 0.5;
  for (let o = 0; o < 4; o++) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    const n = noise2(xi, yi) * (1 - u) * (1 - w) + noise2(xi + 1, yi) * u * (1 - w) + noise2(xi, yi + 1) * (1 - u) * w + noise2(xi + 1, yi + 1) * u * w;
    v += n * a; x *= 2.03; y *= 2.03; a *= 0.5;
  }
  return v;
}
function drawHeat(ctx, L, tm, o, phase) {
  const s = L.style, fr = o.frame, unit = o.unit;
  if (!fr) return;
  const st = rows(s.list).map(([, c, v]) => ({ ll: parseLL(c), v: parseFloat(v) })).filter((x) => x.ll && isFinite(x.v));
  if (st.length < 2) return;
  const u = prog(L, tm), k = tm.edit || L.anim === 'none' ? 1 : L.anim === 'fade' ? u : 1;
  const sweep = !tm.edit && L.anim === 'sweep' ? easeOut(u) : 1;
  const clipL = s.clip ? (o.scene?.layers || []).find((x) => x.id === s.clip) : null;
  const clipPolys = clipL ? polysOf(clipL.geom) : null;
  if (phase === 'below') {
    const G = 4; // grid cell in px
    const gw = Math.ceil(fr.w / (G * unit)), gh = Math.ceil(fr.h / (G * unit));
    const [C, g] = off(`${L.id}:heat`, gw, gh);
    const img = g.createImageData(gw, gh);
    const P = st.map((p) => { const q = o.proj(p.ll); return [(q[0] - fr.x) / (G * unit), (q[1] - fr.y) / (G * unit), p.v]; });
    const lo = isFinite(+s.min) ? +s.min : Math.min(...st.map((x) => x.v)), hi = isFinite(+s.max) && +s.max > lo ? +s.max : Math.max(...st.map((x) => x.v));
    const stops = (SCALES[s.scale] || SCALES.wind).stops, pw = +s.power || 2, tex = clamp(+s.texture || 0, 0, 1);
    const seed = (hashStr(L.id) % 997) / 10;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      let num = 0, den = 0, exact = null;
      for (const [px, py, v] of P) { const d2 = (px - x) ** 2 + (py - y) ** 2; if (d2 < 0.5) { exact = v; break; } const w = 1 / d2 ** (pw / 2); num += w * v; den += w; }
      let v = exact ?? num / den;
      if (tex > 0) v += (fbm(x * 0.09 + seed, y * 0.09) - 0.5) * (hi - lo) * 0.55 * tex;
      const c = rampColor(stops, (v - lo) / (hi - lo || 1));
      const i = (y * gw + x) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2];
      img.data[i + 3] = x / gw <= sweep ? 255 : 0;
    }
    g.putImageData(img, 0, 0);
    ctx.save(); ctx.globalAlpha *= tm.alpha * k * clamp(+s.opacity || 0.8, 0, 1);
    if (clipPolys?.length) { ctx.beginPath(); pathPolys(ctx, clipPolys, o.proj); ctx.clip('evenodd'); }
    if (s.blend === 'multiply') ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(C, 0, 0, gw, gh, fr.x, fr.y, gw * G * unit, gh * G * unit);
    ctx.restore();
    return;
  }
  // moving wind arrows
  if (s.arrows === false) return;
  const t = o.time || 0, dir = ((+s.arrowDir || 0) - 90) * Math.PI / 180;
  const dx = Math.cos(dir), dy = Math.sin(dir);
  const N = Math.round(90 * (+s.arrowDensity || 1));
  const len = 34 * unit, col = s.arrowColor || '#b6ff3a';
  ctx.save(); ctx.globalAlpha *= tm.alpha * k;
  if (clipPolys?.length) { ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); ctx.clip(); }
  else { ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); ctx.clip(); }
  for (let i = 0; i < N; i++) {
    const r1 = noise2(i, 1.7), r2 = noise2(i, 9.1), sp = 0.6 + noise2(i, 4.4) * 0.8;
    const travel = ((t * 0.12 * (+s.speed || 1) * sp + r1) % 1);
    const span = fr.w + fr.h;
    let x = fr.x + r2 * fr.w + dx * travel * span * 0.35, y = fr.y + noise2(i, 3.3) * fr.h + dy * travel * span * 0.35;
    x = fr.x + ((((x - fr.x) % fr.w) + fr.w) % fr.w); y = fr.y + ((((y - fr.y) % fr.h) + fr.h) % fr.h);
    const a = Math.sin(travel * Math.PI);
    const g = ctx.createLinearGradient(x - dx * len, y - dy * len, x, y);
    g.addColorStop(0, hexA(col, 0)); g.addColorStop(1, hexA(col, 0.9 * a));
    ctx.strokeStyle = g; ctx.lineWidth = 2.2 * unit; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - dx * len, y - dy * len); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = hexA(col, 0.9 * a);
    ctx.beginPath(); ctx.moveTo(x + dx * 5 * unit, y + dy * 5 * unit); ctx.lineTo(x - dx * 3 * unit - dy * 4 * unit, y - dy * 3 * unit + dx * 4 * unit); ctx.lineTo(x - dx * 3 * unit + dy * 4 * unit, y - dy * 3 * unit - dx * 4 * unit); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// ================================================================= city forecast cards
function drawCards(ctx, L, tm, o) {
  const s = L.style, unit = o.unit * (+s.size || 1);
  const list = rows(s.list).map(([name, c, lo, hi, ic]) => ({ name, ll: parseLL(c), lo: lo ?? '', hi: hi ?? '', ic: (ic || 'sunny').toLowerCase() })).filter((x) => x.ll);
  const u = prog(L, tm), n = list.length, t = o.time || 0;
  ctx.save(); ctx.globalAlpha *= tm.alpha;
  list.forEach((p, i) => {
    let k = 1;
    if (!tm.edit && L.anim === 'pop') k = easeOut(clamp(u * (n + 2) - i, 0, 1));
    else if (!tm.edit && L.anim === 'fade') k = u;
    if (k <= 0) return;
    const q = o.proj(p.ll);
    ctx.save(); ctx.globalAlpha *= clamp(k * 1.5, 0, 1);
    ctx.translate(q[0], q[1]); ctx.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k);
    if (s.look === 'compact') {
      drawWxIcon(ctx, p.ic, -18 * unit, 0, 30 * unit, t);
      ctx.fillStyle = 'rgba(20,24,32,0.85)'; ctx.fillRect(-2 * unit, -18 * unit, 86 * unit, 15 * unit);
      ctx.fillStyle = '#fff'; ctx.font = `700 ${9 * unit}px ${UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(p.name.toUpperCase(), 3 * unit, -10.5 * unit);
      ctx.font = `800 ${16 * unit}px ${UI}`; ctx.fillText(`${p.hi || p.lo}°C`, 4 * unit, 8 * unit);
    } else {
      const w1 = 30 * unit, w2 = 38 * unit, w3 = 40 * unit, h = 30 * unit, x0 = -(w1 + w2 + w3) / 2, y0 = -h / 2;
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8 * unit; ctx.shadowOffsetY = 2 * unit;
      ctx.fillStyle = '#111'; ctx.fillRect(x0, y0, w1, h);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = s.hiColor || '#c8102e'; ctx.beginPath(); ctx.moveTo(x0 + w1, y0); ctx.lineTo(x0 + w1 + w2 + 8 * unit, y0); ctx.lineTo(x0 + w1 + w2, y0 + h); ctx.lineTo(x0 + w1, y0 + h); ctx.closePath(); ctx.fill();
      const g = ctx.createLinearGradient(0, y0 - 12 * unit, 0, y0 + h); g.addColorStop(0, shade(s.iconBg || '#2f7de1', 0.35)); g.addColorStop(1, s.iconBg || '#2f7de1');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0 + w1 + w2 + 8 * unit, y0 - 12 * unit); ctx.lineTo(x0 + w1 + w2 + w3, y0 - 12 * unit); ctx.lineTo(x0 + w1 + w2 + w3, y0 + h); ctx.lineTo(x0 + w1 + w2, y0 + h); ctx.closePath(); ctx.fill();
      // name tab
      ctx.font = `800 ${10 * unit}px ${BOLD}`;
      const nw = Math.max(ctx.measureText(p.name.toUpperCase()).width + 14 * unit, w1 + w2);
      ctx.fillStyle = '#fff'; ctx.fillRect(x0 + 4 * unit, y0 - 14 * unit, nw, 14 * unit);
      ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.name.toUpperCase(), x0 + 4 * unit + nw / 2, y0 - 6.5 * unit);
      ctx.font = `800 ${17 * unit}px ${BOLD}`; ctx.fillStyle = '#fff';
      ctx.fillText(p.lo, x0 + w1 / 2, y0 + h / 2 + 1 * unit); ctx.fillText(p.hi, x0 + w1 + w2 / 2, y0 + h / 2 + 1 * unit);
      drawWxIcon(ctx, p.ic, x0 + w1 + w2 + w3 / 2 + 3 * unit, y0 + h / 2 - 4 * unit, 30 * unit, t);
    }
    ctx.restore();
  });
  ctx.restore();
}

// ================================================================= TV pressure disc
function drawSystem(ctx, L, tm, o) {
  const s = L.style, unit = o.unit;
  if (L.geom?.type !== 'Point') return;
  const [x, y] = o.proj(L.geom.coordinates);
  const hi = s.type !== 'L';
  const col = s.color || (hi ? '#7cc6f6' : '#ef4b3c');
  const u = prog(L, tm);
  const k = tm.edit || L.anim !== 'pop' ? 1 : easeOut(u) * (1 + 0.15 * Math.sin(Math.min(1, u) * Math.PI));
  const R = 70 * unit * (+s.size || 1) * k;
  if (R < 1) return;
  const rot = L.anim === 'none' ? 0 : (o.time || 0) * 1.1 * (+s.speed || 1) * (hi ? 1 : -1);
  ctx.save(); ctx.globalAlpha *= tm.alpha;
  ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 10 * unit;
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
  ctx.shadowColor = 'transparent';
  // ring band with two arrows
  ctx.translate(x, y); ctx.rotate(rot);
  const r1 = R * 0.62, r2 = R * 0.78;
  const light = shade(col, 0.45), dark = shade(col, -0.25);
  for (let j = 0; j < 2; j++) {
    const a0 = j * Math.PI + 0.25, a1 = a0 + Math.PI - 0.7;
    ctx.fillStyle = j ? dark : light;
    ctx.beginPath(); ctx.arc(0, 0, r2, a0, a1); ctx.arc(0, 0, r1, a1, a0, true); ctx.closePath(); ctx.fill();
    const am = (r1 + r2) / 2, ah = (r2 - r1);
    const tipA = a1 + 0.32 * (hi ? 1 : 1);
    ctx.beginPath(); ctx.moveTo(Math.cos(a1) * (am - ah * 0.95), Math.sin(a1) * (am - ah * 0.95)); ctx.lineTo(Math.cos(tipA) * am, Math.sin(tipA) * am); ctx.lineTo(Math.cos(a1) * (am + ah * 0.95), Math.sin(a1) * (am + ah * 0.95)); ctx.closePath(); ctx.fill();
  }
  ctx.rotate(-rot);
  ctx.fillStyle = '#fff'; ctx.font = `800 ${R * 0.62}px ${BOLD}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(hi ? 'H' : 'L', 0, R * 0.04);
  ctx.restore();
}

export function drawTvWeather(ctx, L, tm, o, phase) {
  H.setMap(o.map);
  switch (L.kind) {
    case 'wxbar': if (phase === 'captions') drawBar(ctx, L, tm, o); break;
    case 'wxvalues': if (phase === 'above') drawValues(ctx, L, tm, o); break;
    case 'wxheat': drawHeat(ctx, L, tm, o, phase); break;
    case 'wxcards': if (phase === 'above') drawCards(ctx, L, tm, o); break;
    case 'wxsystem': if (phase === 'above') drawSystem(ctx, L, tm, o); break;
    default: break;
  }
}
