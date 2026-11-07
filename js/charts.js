// Data graphs for map videos: bar, line, combo, pie / donut, histogram, box plot, scatter plot, scatter-plot matrix,
// data clock, calendar heat chart, matrix heat chart, QQ plot and elevation profile — all from a CSV / GeoJSON table,
// drawn on a card you can drag anywhere, and animated (bars grow, lines draw, slices sweep, cells fill in).
import { placeAt, CUSTOM_POS } from './place.js';
import { H } from './cartofx.js';
import { parseTable, num, guessField, rampAt, fmtNum, QUAL, QUAL_NAMES, SCHEME_NAMES, SAMPLE_NAMES, dataOf } from './geodata.js';

const { clamp, easeOut, UI, hexA, rr, prog } = H;

export const CH_TYPES = {
  bar: 'Bar chart', line: 'Line chart', combo: 'Combo chart (bars + line)', pie: 'Pie / donut chart', histogram: 'Histogram', box: 'Box plot',
  scatter: 'Scatter plot', splom: 'Scatter plot matrix', clock: 'Data clock', calendar: 'Calendar heat chart', matrix: 'Matrix heat chart', qq: 'QQ plot', profile: 'Profile graph (elevation)',
};
export const CH_KINDS = { gchart: { name: 'Graph', icon: '📈', geom: null, desc: 'Bar, line, combo, pie, histogram, box plot, scatter, scatter matrix, data clock, calendar heat, matrix heat, QQ plot or profile graph from your data' } };
export const CH_ANIMS = { gchart: { grow: 'Grows / draws in', fade: 'Fade in', none: 'Shown' } };
export const CH_DEFAULTS = {
  gchart: { anim: 'grow', duration: 2, style: {
    type: 'bar', data: '', sample: 'world', x: '', y: '', y2: '', cat: '', size: '', agg: 'sum', sort: 'desc', top: 12, bins: 12,
    horizontal: false, stacked: false, donut: true, values: true, trend: true, smooth: false, area: false, markers: true, normal: true,
    xPart: 'value', yPart: 'value', rings: 'weekday', wedges: 'hour', scheme: 'YlOrRd', source: 'data', ref: 'route',
    title: '', subtitle: '', xlabel: '', ylabel: '', theme: 'light', palette: 'Tableau', color: '#4e79a7', color2: '#e15759',
    width: 560, height: 340, size: 1, position: 'bottom-right', decimals: '', font: 1,
  } },
};
const TY = (L) => L.style.type || 'bar';
const is = (...t) => (L) => t.includes(TY(L));
const PARTS = { value: 'As it is', hour: 'Hour of day', weekday: 'Day of week', month: 'Month', year: 'Year', date: 'Date (day)' };
export const CH_FORMS = {
  gchart: [
    ['style.type', 'Graph', 'select', CH_TYPES],
    ['style.data', 'Your data — CSV, GeoJSON, KML or shapefile (the attribute table is used)', 'datafile', null, (L) => !(TY(L) === 'profile' && L.style.source === 'line')],
    ['style.sample', 'When no data is loaded, use sample', 'select', SAMPLE_NAMES, (L) => !String(L.style.data || '').trim() && !(TY(L) === 'profile' && L.style.source === 'line')],
    ['style.source', 'Profile from', 'select', { data: 'Data (distance, elevation)', line: 'A line on the map (real elevation)' }, is('profile')],
    ['style.ref', 'Line', 'layerref', 'line', (L) => TY(L) === 'profile' && L.style.source === 'line'],
    ['style.x', 'Categories / X field', 'field', 'any?', is('bar', 'line', 'combo', 'pie', 'scatter', 'matrix', 'box')],
    ['style.x', 'Date / time field', 'field', 'any?', is('clock', 'calendar')],
    ['style.x', 'Distance field', 'field', 'num?', (L) => TY(L) === 'profile' && L.style.source !== 'line'],
    ['style.xPart', 'Use the X field as', 'select', PARTS, is('bar', 'line', 'combo', 'matrix')],
    ['style.y', 'Value field(s) — several, comma-separated, make several series', 'fields', 'num', is('bar', 'line', 'splom', 'box')],
    ['style.y', 'Value field (empty = count rows)', 'field', 'num?', is('combo', 'pie', 'clock', 'calendar', 'matrix')],
    ['style.y', 'Field', 'field', 'num', is('histogram', 'qq')],
    ['style.y', 'Y field', 'field', 'num', is('scatter')],
    ['style.y', 'Elevation field', 'field', 'num?', (L) => TY(L) === 'profile' && L.style.source !== 'line'],
    ['style.y2', 'Line field (right axis)', 'field', 'num?', is('combo')],
    ['style.cat', 'Rows field', 'field', 'any?', is('matrix')],
    ['style.yPart', 'Use the rows field as', 'select', PARTS, is('matrix')],
    ['style.cat', 'Colour by category (optional)', 'field', 'any?', is('scatter', 'splom')],
    ['style.size', 'Size by (optional)', 'field', 'num?', is('scatter')],
    ['style.agg', 'Combine rows with the same category', 'select', { sum: 'Sum', mean: 'Average', count: 'Count', max: 'Maximum', min: 'Minimum', none: 'Keep every row' }, is('bar', 'line', 'combo', 'pie', 'clock', 'calendar', 'matrix')],
    ['style.sort', 'Order', 'select', { none: 'As in the data', desc: 'Largest first', asc: 'Smallest first', label: 'A → Z' }, is('bar', 'pie', 'combo')],
    ['style.top', 'Show at most', 'range', [3, 40, 1], is('bar', 'pie', 'combo')],
    ['style.rings', 'Rings', 'select', { weekday: 'Days of the week', month: 'Months' }, is('clock')],
    ['style.wedges', 'Wedges', 'select', { hour: 'Hours of the day', month: 'Months', day: 'Days of the month' }, is('clock')],
    ['style.bins', 'Bins', 'range', [4, 40, 1], is('histogram')],
    ['style.horizontal', 'Horizontal bars', 'switch', null, is('bar')],
    ['style.stacked', 'Stack the series', 'switch', null, (L) => TY(L) === 'bar' && String(L.style.y || '').includes(',')],
    ['style.donut', 'Donut (hole in the middle)', 'switch', null, is('pie')],
    ['style.area', 'Fill under the line', 'switch', null, is('line', 'profile')],
    ['style.smooth', 'Smooth curve', 'switch', null, is('line', 'profile')],
    ['style.markers', 'Dots on the line', 'switch', null, is('line', 'combo')],
    ['style.trend', 'Trend line + R²', 'switch', null, is('scatter')],
    ['style.normal', 'Normal curve', 'switch', null, is('histogram')],
    ['style.values', 'Show values', 'switch', null, is('bar', 'pie', 'combo', 'matrix')],
    ['style.title', 'Title', 'text'], ['style.subtitle', 'Subtitle / source', 'text'],
    ['style.xlabel', 'X axis title', 'text', null, is('bar', 'line', 'combo', 'histogram', 'scatter', 'qq', 'profile', 'box')],
    ['style.ylabel', 'Y axis title', 'text', null, is('bar', 'line', 'combo', 'histogram', 'scatter', 'qq', 'profile', 'box')],
    ['style.theme', 'Look', 'select', { light: 'White card', dark: 'Dark glass', clear: 'No card (white text)' }],
    ['style.palette', 'Series colours', 'select', QUAL_NAMES, is('bar', 'line', 'pie', 'scatter', 'splom', 'box')],
    ['style.color', 'Main colour', 'color', null, is('combo', 'histogram', 'qq', 'profile')], ['style.color2', 'Second colour', 'color', null, is('combo', 'histogram', 'qq', 'profile')],
    ['style.scheme', 'Colour scheme', 'select', SCHEME_NAMES, is('clock', 'calendar', 'matrix')],
    ['style.decimals', 'Decimals (empty = automatic)', 'number'],
    ['style.width', 'Width', 'range', [240, 1400, 10]], ['style.height', 'Height', 'range', [160, 900, 10]], ['style.font', 'Text size', 'range', [0.6, 2, 0.05]],
    ['style.position', 'Position', 'select', { 'bottom-right': 'Bottom right', 'bottom-left': 'Bottom left', 'top-right': 'Top right', 'top-left': 'Top left', center: 'Centre', ...CUSTOM_POS }],
  ],
};
export const CH_SET = new Set(Object.keys(CH_KINDS));
export const chPhases = () => ['captions'];

// ================================================================= helpers
const THEMES = {
  light: { bg: 'rgba(255,255,255,0.95)', ink: '#1b1f27', sub: '#5a6270', grid: 'rgba(0,0,0,0.08)', axis: 'rgba(0,0,0,0.35)' },
  dark: { bg: 'rgba(14,18,26,0.86)', ink: '#ffffff', sub: '#b9c2cf', grid: 'rgba(255,255,255,0.1)', axis: 'rgba(255,255,255,0.45)' },
  clear: { bg: null, ink: '#ffffff', sub: '#e6ebf2', grid: 'rgba(255,255,255,0.18)', axis: 'rgba(255,255,255,0.6)', halo: true },
};
const fields = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
function niceTicks(lo, hi, n = 5) {
  if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
  if (lo === hi) { hi = lo + (Math.abs(lo) || 1); lo -= Math.abs(lo) * 0.1; }
  const raw = (hi - lo) / n, p = 10 ** Math.floor(Math.log10(raw)), k = raw / p;
  const step = (k < 1.5 ? 1 : k < 3 ? 2 : k < 7 ? 5 : 10) * p;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
  const ticks = []; for (let v = a; v <= b + step * 0.5; v += step) ticks.push(+v.toPrecision(12));
  return { lo: a, hi: b, ticks };
}
const parseDate = (v) => { if (v instanceof Date) return v; const s = String(v ?? '').trim(); if (!s) return null; const t = Date.parse(/^\d{4}-\d{2}-\d{2} \d/.test(s) ? s.replace(' ', 'T') : s); return isFinite(t) ? new Date(t) : null; };
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** key + sort value for a category under a "part" transform */
function partOf(v, part) {
  if (!part || part === 'value') return { k: String(v ?? ''), o: null };
  const d = parseDate(v); if (!d) return { k: String(v ?? ''), o: null };
  if (part === 'hour') return { k: `${String(d.getHours()).padStart(2, '0')}:00`, o: d.getHours() };
  if (part === 'weekday') { const i = (d.getDay() + 6) % 7; return { k: WD[(i + 1) % 7], o: i }; }
  if (part === 'month') return { k: MO[d.getMonth()], o: d.getMonth() };
  if (part === 'year') return { k: String(d.getFullYear()), o: d.getFullYear() };
  return { k: d.toISOString().slice(0, 10), o: +d };
}
function aggregate(rows, xf, yfs, agg, part) {
  const map = new Map();
  rows.forEach((r, i) => {
    const pk = xf ? partOf(r.p[xf], part) : { k: String(i + 1), o: i };
    const key = agg === 'none' ? `${pk.k}\u0000${i}` : pk.k;
    let e = map.get(key);
    if (!e) { e = { k: pk.k, o: pk.o ?? map.size, sums: yfs.map(() => 0), n: yfs.map(() => 0), mx: yfs.map(() => -Infinity), mn: yfs.map(() => Infinity), cnt: 0 }; map.set(key, e); }
    e.cnt++;
    yfs.forEach((f, j) => { const v = num(r.p[f]); if (isFinite(v)) { e.sums[j] += v; e.n[j]++; e.mx[j] = Math.max(e.mx[j], v); e.mn[j] = Math.min(e.mn[j], v); } });
  });
  const out = [...map.values()].map((e) => ({ k: e.k, o: e.o, v: yfs.length ? yfs.map((_, j) => (agg === 'count' ? e.cnt : agg === 'mean' ? (e.n[j] ? e.sums[j] / e.n[j] : NaN) : agg === 'max' ? e.mx[j] : agg === 'min' ? e.mn[j] : e.sums[j])) : [e.cnt] }));
  if (part && part !== 'value') out.sort((a, b) => a.o - b.o);
  return out;
}
const quant = (a, q) => { if (!a.length) return NaN; const p = (a.length - 1) * q, i = Math.floor(p), f = p - i; return a[i] + ((a[i + 1] ?? a[i]) - a[i]) * f; };
function invNorm(p) { // Acklam
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
const rgbS = (c) => `rgb(${c.map(Math.round).join(',')})`;
function ellip(ctx, t, w) { if (ctx.measureText(t).width <= w) return t; let s = t; while (s.length > 1 && ctx.measureText(`${s}…`).width > w) s = s.slice(0, -1); return `${s}…`; }

// ================================================================= main
export function drawChart(ctx, L, tm, o) {
  const s = L.style, fr = o.frame;
  if (!fr) return;
  const unit = o.unit * (+s.size || 1), fu = unit * (+s.font || 1);
  const W = (+s.width || 560) * unit, Hh = (+s.height || 340) * unit, m = 28 * o.unit;
  const pos = s.position || 'bottom-right';
  const x = pos === 'center' ? fr.x + (fr.w - W) / 2 : /left/.test(pos) ? fr.x + m : fr.x + fr.w - m - W;
  const y = pos === 'center' ? fr.y + (fr.h - Hh) / 2 : /top/.test(pos) ? fr.y + m : fr.y + fr.h - m - Hh;
  const raw = tm.edit || L.anim === 'none' ? 1 : prog(L, tm);
  const u = L.anim === 'grow' ? easeOut(raw) : 1;
  const th = THEMES[s.theme] || THEMES.light;
  ctx.save();
  placeAt(ctx, L, fr, x, y, W, Hh);
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' ? easeOut(raw) : clamp(raw * 4, 0, 1));
  if (th.bg) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 18 * unit; ctx.shadowOffsetY = 4 * unit; rr(ctx, x, y, W, Hh, 10 * unit); ctx.fillStyle = th.bg; ctx.fill(); ctx.restore(); }
  if (th.halo) { ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4 * unit; }
  const pad = 16 * unit;
  let top = y + pad;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  if (s.title) { ctx.fillStyle = th.ink; ctx.font = `800 ${17 * fu}px ${UI}`; ctx.fillText(ellip(ctx, s.title, W - pad * 2), x + pad, top); top += 24 * fu; }
  if (s.subtitle) { ctx.fillStyle = th.sub; ctx.font = `500 ${12 * fu}px ${UI}`; ctx.fillText(ellip(ctx, s.subtitle, W - pad * 2), x + pad, top); top += 18 * fu; }
  const box = { x: x + pad, y: top + 4 * unit, w: W - pad * 2, h: y + Hh - pad - top - 4 * unit };
  const C = { ctx, L, s, th, unit, fu, u, box, o };
  try {
    const T = TY(L);
    if (T === 'profile' && s.source === 'line') C.T = null; else C.T = parseTable(dataOf(s));
    const f = { bar: barChart, line: lineChart, combo: comboChart, pie: pieChart, histogram: histogram, box: boxPlot, scatter: scatter, splom: splom, clock: dataClock, calendar: calendarHeat, matrix: matrixHeat, qq: qqPlot, profile: profileGraph }[T];
    if (f) f(C);
  } catch (e) { ctx.fillStyle = th.sub; ctx.font = `500 ${12 * fu}px ${UI}`; ctx.fillText(`Could not draw: ${e.message}`, box.x, box.y); }
  ctx.restore();
}

// ---------------------------------------------------------------- axes
function frameXY(C, { ylo, yhi, xlabels, xnum, ylab, xlab, right }) {
  const { ctx, th, fu, box } = C;
  const yt = niceTicks(ylo, yhi, Math.max(3, Math.round(box.h / (46 * fu))));
  ctx.font = `500 ${11 * fu}px ${UI}`;
  const lw = Math.max(...yt.ticks.map((t) => ctx.measureText(fmtNum(t, C.s.decimals)).width)) + 8 * fu + (ylab ? 16 * fu : 0);
  const rw = right ? right.w : 0;
  const P = { x: box.x + lw, y: box.y + 6 * fu, w: box.w - lw - rw, h: box.h - 6 * fu - (xlab ? 34 : 20) * fu };
  if (xlabels && xlabels.some((t) => String(t).length > 4) && xlabels.length * 60 * fu > P.w) P.h -= 22 * fu;
  const sy = (v) => P.y + P.h - ((v - yt.lo) / (yt.hi - yt.lo || 1)) * P.h;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const t of yt.ticks) {
    const yy = sy(t);
    ctx.strokeStyle = th.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(P.x, yy); ctx.lineTo(P.x + P.w, yy); ctx.stroke();
    ctx.fillStyle = th.sub; ctx.fillText(fmtNum(t, C.s.decimals), P.x - 6 * fu, yy);
  }
  ctx.strokeStyle = th.axis; ctx.beginPath(); ctx.moveTo(P.x, P.y + P.h); ctx.lineTo(P.x + P.w, P.y + P.h); ctx.stroke();
  if (ylab) { ctx.save(); ctx.translate(box.x + 6 * fu, P.y + P.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillStyle = th.sub; ctx.font = `600 ${11 * fu}px ${UI}`; ctx.fillText(ylab, 0, 0); ctx.restore(); }
  if (xlab) { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = th.sub; ctx.font = `600 ${11 * fu}px ${UI}`; ctx.fillText(xlab, P.x + P.w / 2, box.y + box.h); }
  let sx = null;
  if (xnum) {
    const xt = niceTicks(xnum[0], xnum[1], Math.max(3, Math.round(P.w / (80 * fu))));
    sx = (v) => P.x + ((v - xt.lo) / (xt.hi - xt.lo || 1)) * P.w;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = `500 ${11 * fu}px ${UI}`;
    for (const t of xt.ticks) { const xx = sx(t); ctx.strokeStyle = th.grid; ctx.beginPath(); ctx.moveTo(xx, P.y); ctx.lineTo(xx, P.y + P.h); ctx.stroke(); ctx.fillStyle = th.sub; ctx.fillText(fmtNum(t, C.s.decimals), xx, P.y + P.h + 5 * fu); }
  }
  return { P, sy, sx, yt };
}
function xCatLabels(C, P, labels, centerOf) {
  const { ctx, th, fu } = C;
  const n = labels.length, bw = P.w / Math.max(1, n);
  ctx.font = `500 ${11 * fu}px ${UI}`; ctx.fillStyle = th.sub;
  const maxW = Math.max(...labels.map((t) => ctx.measureText(String(t)).width));
  const rot = maxW > bw - 4 * fu;
  const step = rot ? Math.max(1, Math.ceil((14 * fu) / bw)) : 1;
  labels.forEach((t, i) => {
    if (i % step) return;
    const cx = centerOf(i);
    if (rot) { ctx.save(); ctx.translate(cx, P.y + P.h + 5 * fu); ctx.rotate(-0.6); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(ellip(ctx, String(t), 90 * fu), 0, 0); ctx.restore(); }
    else { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(t), cx, P.y + P.h + 5 * fu); }
  });
}
function seriesLegend(C, names, colors, shape = 'fill') {
  if (names.length < 2) return;
  const { ctx, th, fu, box } = C;
  ctx.font = `600 ${11 * fu}px ${UI}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  box.y += 16 * fu; box.h -= 16 * fu;
  let xx = box.x + box.w;
  for (let i = names.length - 1; i >= 0; i--) {
    const t = names[i].replace(/_/g, ' '), w = ctx.measureText(t).width + 18 * fu;
    xx -= w;
    ctx.fillStyle = colors[i % colors.length];
    if (shape === 'line') ctx.fillRect(xx, box.y - 9 * fu, 11 * fu, 3 * fu); else ctx.fillRect(xx, box.y - 13 * fu, 10 * fu, 10 * fu);
    ctx.fillStyle = th.sub; ctx.fillText(t, xx + 14 * fu, box.y - 8 * fu);
    xx -= 6 * fu;
  }
}
function orderTop(data, s, j = 0) {
  let d = data.slice();
  if (s.sort === 'desc') d.sort((a, b) => (b.v[j] || 0) - (a.v[j] || 0));
  else if (s.sort === 'asc') d.sort((a, b) => (a.v[j] || 0) - (b.v[j] || 0));
  else if (s.sort === 'label') d.sort((a, b) => String(a.k).localeCompare(String(b.k), undefined, { numeric: true }));
  return d.slice(0, Math.max(1, +s.top || 12));
}

// ---------------------------------------------------------------- bar
function barChart(C) {
  const { ctx, s, T, u, fu } = C;
  const xf = s.x || guessField(T, 'name'), ys = fields(s.y).length ? fields(s.y) : [guessField(T, 'num')];
  const data = orderTop(aggregate(T.rows, xf, ys, s.agg, s.xPart), s);
  const pal = QUAL[s.palette] || QUAL.Tableau, colors = ys.length > 1 ? pal : [s.color && s.palette === 'Tableau' ? s.color : pal[0]];
  const stack = s.stacked && ys.length > 1;
  const tot = data.map((d) => (stack ? d.v.reduce((a, b) => a + Math.max(0, b || 0), 0) : Math.max(...d.v.map((v) => v || 0))));
  const lo = Math.min(0, ...data.flatMap((d) => d.v.map((v) => v || 0))), hi = Math.max(...tot, 0);
  seriesLegend(C, ys, colors);
  if (s.horizontal) {
    const { box, th } = C;
    ctx.font = `500 ${11 * fu}px ${UI}`;
    const lw = Math.min(box.w * 0.35, Math.max(...data.map((d) => ctx.measureText(String(d.k)).width)) + 10 * fu);
    const P = { x: box.x + lw, y: box.y + 4 * fu, w: box.w - lw - 46 * fu, h: box.h - 26 * fu };
    const xt = niceTicks(lo, hi, 4), sx = (v) => P.x + ((v - xt.lo) / (xt.hi - xt.lo || 1)) * P.w;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const t of xt.ticks) { const xx = sx(t); ctx.strokeStyle = th.grid; ctx.beginPath(); ctx.moveTo(xx, P.y); ctx.lineTo(xx, P.y + P.h); ctx.stroke(); ctx.fillStyle = th.sub; ctx.fillText(fmtNum(t, s.decimals), xx, P.y + P.h + 5 * fu); }
    const bh = P.h / data.length;
    data.forEach((d, i) => {
      const k = clamp((u - (i / data.length) * 0.4) / 0.6, 0, 1);
      const yy = P.y + i * bh;
      ctx.fillStyle = th.sub; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.font = `500 ${11 * fu}px ${UI}`; ctx.fillText(ellip(ctx, String(d.k), lw - 10 * fu), P.x - 6 * fu, yy + bh / 2);
      let acc = 0;
      d.v.forEach((v, j) => {
        v = (v || 0) * k;
        const gh = stack ? bh * 0.7 : (bh * 0.72) / ys.length, gy = stack ? yy + bh * 0.15 : yy + bh * 0.14 + j * gh;
        const x0 = sx(stack ? acc : 0), x1 = sx((stack ? acc : 0) + v);
        ctx.fillStyle = colors[j % colors.length]; rr(ctx, Math.min(x0, x1), gy, Math.abs(x1 - x0), gh - 1, 2 * fu); ctx.fill();
        if (stack) acc += v;
      });
      if (s.values !== false && k > 0.6) { ctx.fillStyle = C.th.ink; ctx.textAlign = 'left'; ctx.font = `600 ${10.5 * fu}px ${UI}`; ctx.fillText(fmtNum(tot[i] * k, s.decimals), sx(stack ? tot[i] * k : Math.max(...d.v.map((v) => v || 0)) * k) + 4 * fu, yy + bh / 2); }
    });
    return;
  }
  const { P, sy } = frameXY(C, { ylo: lo, yhi: hi * 1.08, xlabels: data.map((d) => d.k), ylab: s.ylabel, xlab: s.xlabel });
  const bw = P.w / data.length;
  data.forEach((d, i) => {
    const k = clamp((u - (i / data.length) * 0.4) / 0.6, 0, 1);
    let acc = 0;
    d.v.forEach((v, j) => {
      v = (v || 0) * k;
      const gw = stack ? bw * 0.68 : (bw * 0.72) / ys.length, gx = stack ? P.x + i * bw + bw * 0.16 : P.x + i * bw + bw * 0.14 + j * gw;
      const y0 = sy(stack ? acc : 0), y1 = sy((stack ? acc : 0) + v);
      ctx.fillStyle = colors[j % colors.length]; rr(ctx, gx, Math.min(y0, y1), gw - 1, Math.abs(y1 - y0), [2 * fu, 2 * fu, 0, 0]); ctx.fill();
      if (stack) acc += v;
    });
    if (s.values !== false && k > 0.6 && bw > 22 * fu) { ctx.fillStyle = C.th.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.font = `600 ${10.5 * fu}px ${UI}`; ctx.fillText(fmtNum(tot[i] * k, s.decimals), P.x + i * bw + bw / 2, sy(tot[i] * k) - 3 * fu); }
  });
  xCatLabels(C, P, data.map((d) => d.k), (i) => P.x + i * bw + bw / 2);
}

// ---------------------------------------------------------------- line
function curve(ctx, pts, smooth) {
  pts.forEach((p, i) => {
    if (!i) { ctx.moveTo(p[0], p[1]); return; }
    if (!smooth) { ctx.lineTo(p[0], p[1]); return; }
    const a = pts[i - 1], mx = (a[0] + p[0]) / 2;
    ctx.bezierCurveTo(mx, a[1], mx, p[1], p[0], p[1]);
  });
}
function lineChart(C) {
  const { ctx, s, T, u, fu, th } = C;
  const xf = s.x || guessField(T, 'date') || guessField(T, 'name'), ys = fields(s.y).length ? fields(s.y) : [guessField(T, 'num')];
  const xIsNum = T.numeric.includes(xf) && (!s.xPart || s.xPart === 'value');
  const xIsDate = !xIsNum && (!s.xPart || s.xPart === 'value') && T.rows.slice(0, 20).every((r) => parseDate(r.p[xf]) && /\d{4}|\d+[/-]\d+/.test(String(r.p[xf])));
  let data = aggregate(T.rows, xf, ys, s.agg, xIsDate && s.agg !== 'none' ? 'date' : s.xPart);
  if (xIsNum) data.sort((a, b) => num(a.k) - num(b.k));
  const pal = QUAL[s.palette] || QUAL.Tableau;
  const all = data.flatMap((d) => d.v).filter(isFinite);
  const lo = Math.min(...all), hi = Math.max(...all);
  seriesLegend(C, ys, pal, 'line');
  const { P, sy, sx } = frameXY(C, { ylo: lo >= 0 && lo < hi * 0.4 ? 0 : lo, yhi: hi, xnum: xIsNum ? [num(data[0]?.k), num(data.at(-1)?.k)] : null, xlabels: xIsNum ? null : data.map((d) => d.k), ylab: s.ylabel, xlab: s.xlabel });
  const X = (i) => (xIsNum ? sx(num(data[i].k)) : P.x + (data.length > 1 ? (i / (data.length - 1)) * P.w : P.w / 2));
  if (!xIsNum) xCatLabels(C, P, data.map((d) => d.k), X);
  ctx.save(); ctx.beginPath(); ctx.rect(P.x - 6 * fu, P.y - 10 * fu, (P.w + 12 * fu) * u, P.h + 20 * fu); ctx.clip();
  ys.forEach((_, j) => {
    const pts = data.map((d, i) => [X(i), sy(d.v[j])]).filter((p) => isFinite(p[1]));
    if (!pts.length) return;
    const col = ys.length > 1 ? pal[j % pal.length] : s.palette === 'Tableau' ? s.color || pal[0] : pal[0];
    if (s.area) { ctx.beginPath(); curve(ctx, pts, s.smooth); ctx.lineTo(pts.at(-1)[0], P.y + P.h); ctx.lineTo(pts[0][0], P.y + P.h); ctx.closePath(); const g = ctx.createLinearGradient(0, P.y, 0, P.y + P.h); g.addColorStop(0, hexA(col.startsWith('#') ? col : '#4e79a7', 0.45)); g.addColorStop(1, hexA(col.startsWith('#') ? col : '#4e79a7', 0.02)); ctx.fillStyle = g; ctx.fill(); }
    ctx.beginPath(); curve(ctx, pts, s.smooth); ctx.strokeStyle = col; ctx.lineWidth = 2.6 * fu; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
    if (s.markers !== false && pts.length < 60) for (const p of pts) { ctx.beginPath(); ctx.arc(p[0], p[1], 3.2 * fu, 0, Math.PI * 2); ctx.fillStyle = th.bg ? (C.s.theme === 'dark' ? '#0e121a' : '#fff') : col; ctx.fill(); ctx.lineWidth = 1.8 * fu; ctx.stroke(); }
  });
  ctx.restore();
}

// ---------------------------------------------------------------- combo
function comboChart(C) {
  const { ctx, s, T, u, fu, th } = C;
  const xf = s.x || guessField(T, 'name');
  const yb = fields(s.y)[0] || guessField(T, 'num');
  const yl = s.y2 || T.numeric.filter((f) => f !== yb && !/lat|lon|^id$/i.test(f))[0] || yb;
  const data = orderTop(aggregate(T.rows, xf, [yb, yl], s.agg, s.xPart), s);
  const hiL = Math.max(...data.map((d) => d.v[1]).filter(isFinite)), loL = Math.min(0, ...data.map((d) => d.v[1]).filter(isFinite));
  const rt = niceTicks(loL, hiL, 4);
  ctx.font = `500 ${11 * fu}px ${UI}`;
  const rw = Math.max(...rt.ticks.map((t) => ctx.measureText(fmtNum(t, s.decimals)).width)) + 10 * fu;
  seriesLegend(C, [yb, yl], [s.color || '#4e79a7', s.color2 || '#e15759']);
  ctx.font = `500 ${11 * fu}px ${UI}`;
  const { P, sy } = frameXY(C, { ylo: Math.min(0, ...data.map((d) => d.v[0] || 0)), yhi: Math.max(...data.map((d) => d.v[0] || 0)) * 1.08, xlabels: data.map((d) => d.k), ylab: s.ylabel, xlab: s.xlabel, right: { w: rw } });
  const sy2 = (v) => P.y + P.h - ((v - rt.lo) / (rt.hi - rt.lo || 1)) * P.h;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = s.color2 || '#e15759';
  for (const t of rt.ticks) ctx.fillText(fmtNum(t, s.decimals), P.x + P.w + 6 * fu, sy2(t));
  const bw = P.w / data.length;
  data.forEach((d, i) => {
    const k = clamp((u - (i / data.length) * 0.4) / 0.6, 0, 1);
    const v = (d.v[0] || 0) * k;
    ctx.fillStyle = s.color || '#4e79a7'; rr(ctx, P.x + i * bw + bw * 0.18, Math.min(sy(0), sy(v)), bw * 0.64, Math.abs(sy(v) - sy(0)), [2 * fu, 2 * fu, 0, 0]); ctx.fill();
  });
  xCatLabels(C, P, data.map((d) => d.k), (i) => P.x + i * bw + bw / 2);
  const pts = data.map((d, i) => [P.x + i * bw + bw / 2, sy2(d.v[1])]).filter((p) => isFinite(p[1]));
  ctx.save(); ctx.beginPath(); ctx.rect(P.x, P.y - 10 * fu, P.w * u, P.h + 20 * fu); ctx.clip();
  ctx.beginPath(); curve(ctx, pts, false); ctx.strokeStyle = s.color2 || '#e15759'; ctx.lineWidth = 2.6 * fu; ctx.stroke();
  if (s.markers !== false) for (const p of pts) { ctx.beginPath(); ctx.arc(p[0], p[1], 3.5 * fu, 0, Math.PI * 2); ctx.fillStyle = s.color2 || '#e15759'; ctx.fill(); }
  ctx.restore();
  void th;
}

// ---------------------------------------------------------------- pie
function pieChart(C) {
  const { ctx, s, T, u, fu, th, box } = C;
  const xf = s.x || guessField(T, 'cat') || guessField(T, 'name'), yf = fields(s.y)[0] || '';
  let data = aggregate(T.rows, xf, yf ? [yf] : [], yf ? s.agg : 'count', s.xPart).filter((d) => d.v[0] > 0);
  data = orderTop(data, { ...s, sort: s.sort === 'none' ? 'none' : s.sort || 'desc' });
  const all = aggregate(T.rows, xf, yf ? [yf] : [], yf ? s.agg : 'count', s.xPart).filter((d) => d.v[0] > 0);
  const totAll = all.reduce((a, d) => a + d.v[0], 0), shown = data.reduce((a, d) => a + d.v[0], 0);
  if (totAll - shown > totAll * 0.001) data.push({ k: 'Other', v: [totAll - shown] });
  const pal = QUAL[s.palette] || QUAL.Tableau;
  const R = Math.min(box.h / 2 - 4 * fu, box.w * 0.27), cx = box.x + R + 6 * fu, cy = box.y + box.h / 2;
  let a0 = -Math.PI / 2;
  const total = totAll || 1;
  data.forEach((d, i) => {
    const a1 = a0 + (d.v[0] / total) * Math.PI * 2 * u;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath();
    ctx.fillStyle = d.k === 'Other' ? '#b8bdc6' : pal[i % pal.length]; ctx.fill();
    ctx.strokeStyle = th.bg ? (s.theme === 'dark' ? '#121722' : '#fff') : 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5 * fu; ctx.stroke();
    const pct = d.v[0] / total;
    if (s.values !== false && pct > 0.04 && u > 0.9) {
      const am = (a0 + a1) / 2, rr2 = s.donut !== false ? R * 0.78 : R * 0.64;
      ctx.fillStyle = '#fff'; ctx.font = `700 ${11 * fu}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(pct * 100)}%`, cx + Math.cos(am) * rr2, cy + Math.sin(am) * rr2);
    }
    a0 = a1;
  });
  if (s.donut !== false) {
    ctx.save(); ctx.globalCompositeOperation = th.bg ? 'source-over' : 'destination-out';
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.56, 0, Math.PI * 2); ctx.fillStyle = th.bg ? (s.theme === 'dark' ? '#121722' : '#ffffff') : '#000'; ctx.fill(); ctx.restore();
    ctx.fillStyle = th.ink; ctx.font = `800 ${18 * fu}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(fmtNum(totAll * u, s.decimals), cx, cy - 6 * fu);
    ctx.fillStyle = th.sub; ctx.font = `500 ${10.5 * fu}px ${UI}`; ctx.fillText(ellip(ctx, (yf || 'count').replace(/_/g, ' '), R), cx, cy + 12 * fu);
  }
  // legend
  const lx = cx + R + 22 * fu, rowH = Math.min(22 * fu, box.h / Math.max(1, data.length));
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  data.forEach((d, i) => {
    const yy = box.y + box.h / 2 + (i - (data.length - 1) / 2) * rowH;
    ctx.fillStyle = d.k === 'Other' ? '#b8bdc6' : pal[i % pal.length]; rr(ctx, lx, yy - 5 * fu, 10 * fu, 10 * fu, 2 * fu); ctx.fill();
    ctx.fillStyle = th.ink; ctx.font = `600 ${11 * fu}px ${UI}`;
    const t = ellip(ctx, String(d.k), box.x + box.w - lx - 70 * fu);
    ctx.fillText(t, lx + 16 * fu, yy);
    ctx.fillStyle = th.sub; ctx.textAlign = 'right'; ctx.font = `500 ${11 * fu}px ${UI}`; ctx.fillText(fmtNum(d.v[0], s.decimals), box.x + box.w, yy); ctx.textAlign = 'left';
  });
}

// ---------------------------------------------------------------- histogram
function histogram(C) {
  const { ctx, s, T, u, fu } = C;
  const f = fields(s.y)[0] || guessField(T, 'num');
  const v = T.rows.map((r) => num(r.p[f])).filter(isFinite).sort((a, b) => a - b);
  if (!v.length) throw new Error(`no numbers in “${f}”`);
  const nb = clamp(+s.bins || 12, 2, 60), lo = v[0], hi = v.at(-1), w = (hi - lo) / nb || 1;
  const bins = new Array(nb).fill(0); for (const x of v) bins[Math.min(nb - 1, Math.floor((x - lo) / w))]++;
  const { P, sy, sx } = frameXY(C, { ylo: 0, yhi: Math.max(...bins) * 1.1, xnum: [lo, hi], ylab: s.ylabel || 'Count', xlab: s.xlabel || f.replace(/_/g, ' ') });
  bins.forEach((b, i) => {
    const k = clamp((u - (i / nb) * 0.4) / 0.6, 0, 1);
    const x0 = sx(lo + i * w), x1 = sx(lo + (i + 1) * w);
    ctx.fillStyle = s.color || '#4e79a7'; ctx.fillRect(x0 + 0.5, sy(b * k), x1 - x0 - 1, sy(0) - sy(b * k));
  });
  const mean = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  if (s.normal !== false && sd > 0 && u > 0.5) {
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) { const x = lo + ((hi - lo) * i) / 80; const y = (v.length * w) / (sd * Math.sqrt(2 * Math.PI)) * Math.exp(-((x - mean) ** 2) / (2 * sd * sd)); i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y)); }
    ctx.strokeStyle = s.color2 || '#e15759'; ctx.lineWidth = 2.2 * fu; ctx.globalAlpha *= clamp((u - 0.5) * 2, 0, 1); ctx.stroke();
  }
  const xm = sx(mean);
  ctx.setLineDash([4 * fu, 3 * fu]); ctx.strokeStyle = C.th.ink; ctx.lineWidth = 1.2 * fu; ctx.beginPath(); ctx.moveTo(xm, P.y); ctx.lineTo(xm, P.y + P.h); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = C.th.ink; ctx.font = `600 ${10.5 * fu}px ${UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(`mean ${fmtNum(mean, s.decimals)} · sd ${fmtNum(sd, s.decimals)} · n ${v.length}`, xm + 4 * fu, P.y);
}

// ---------------------------------------------------------------- box plot
function boxPlot(C) {
  const { ctx, s, T, u, fu, th } = C;
  const ys = fields(s.y).length ? fields(s.y) : [guessField(T, 'num')];
  let groups;
  if (s.x && ys.length === 1) {
    const m = new Map();
    for (const r of T.rows) { const k = partOf(r.p[s.x], s.xPart).k; const v = num(r.p[ys[0]]); if (!isFinite(v)) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(v); }
    groups = [...m.entries()].slice(0, 16).map(([k, a]) => ({ k, a }));
  } else groups = ys.map((f) => ({ k: f.replace(/_/g, ' '), a: T.rows.map((r) => num(r.p[f])).filter(isFinite) }));
  groups.forEach((g) => g.a.sort((a, b) => a - b));
  const all = groups.flatMap((g) => g.a);
  const { P, sy } = frameXY(C, { ylo: Math.min(...all), yhi: Math.max(...all), xlabels: groups.map((g) => g.k), ylab: s.ylabel || (ys.length === 1 ? ys[0].replace(/_/g, ' ') : ''), xlab: s.xlabel });
  const bw = P.w / groups.length, pal = QUAL[s.palette] || QUAL.Tableau;
  groups.forEach((g, i) => {
    if (!g.a.length) return;
    const q1 = quant(g.a, 0.25), q2 = quant(g.a, 0.5), q3 = quant(g.a, 0.75), iqr = q3 - q1;
    const wl = g.a.find((v) => v >= q1 - 1.5 * iqr), wh = [...g.a].reverse().find((v) => v <= q3 + 1.5 * iqr);
    const k = clamp((u - (i / groups.length) * 0.4) / 0.6, 0, 1);
    const cx = P.x + i * bw + bw / 2, hw = Math.min(bw * 0.3, 40 * fu);
    const mid = sy(q2), sc = (yy) => mid + (yy - mid) * k;
    const col = pal[i % pal.length];
    ctx.strokeStyle = th.ink; ctx.lineWidth = 1.3 * fu;
    ctx.beginPath(); ctx.moveTo(cx, sc(sy(wh))); ctx.lineTo(cx, sc(sy(q3))); ctx.moveTo(cx, sc(sy(q1))); ctx.lineTo(cx, sc(sy(wl))); ctx.moveTo(cx - hw * 0.5, sc(sy(wh))); ctx.lineTo(cx + hw * 0.5, sc(sy(wh))); ctx.moveTo(cx - hw * 0.5, sc(sy(wl))); ctx.lineTo(cx + hw * 0.5, sc(sy(wl))); ctx.stroke();
    ctx.fillStyle = hexA(col, 0.75); ctx.fillRect(cx - hw, sc(sy(q3)), hw * 2, sc(sy(q1)) - sc(sy(q3))); ctx.strokeRect(cx - hw, sc(sy(q3)), hw * 2, sc(sy(q1)) - sc(sy(q3)));
    ctx.lineWidth = 2.4 * fu; ctx.beginPath(); ctx.moveTo(cx - hw, mid); ctx.lineTo(cx + hw, mid); ctx.stroke();
    if (k > 0.9) {
      const mean = g.a.reduce((a, b) => a + b, 0) / g.a.length;
      ctx.lineWidth = 1.5 * fu; const my = sy(mean); ctx.beginPath(); ctx.moveTo(cx - 4 * fu, my - 4 * fu); ctx.lineTo(cx + 4 * fu, my + 4 * fu); ctx.moveTo(cx + 4 * fu, my - 4 * fu); ctx.lineTo(cx - 4 * fu, my + 4 * fu); ctx.stroke();
      ctx.fillStyle = th.ink; for (const v of g.a) if (v < wl || v > wh) { ctx.beginPath(); ctx.arc(cx, sy(v), 2.6 * fu, 0, Math.PI * 2); ctx.fill(); }
    }
  });
  xCatLabels(C, P, groups.map((g) => g.k), (i) => P.x + i * bw + bw / 2);
}

// ---------------------------------------------------------------- scatter
function scatter(C) {
  const { ctx, s, T, u, fu, th } = C;
  const nums = T.numeric.filter((f) => !/^(lat|lon|lng|latitude|longitude|id)$/i.test(f));
  const xf = s.x && T.numeric.includes(s.x) ? s.x : nums[0], yf = fields(s.y)[0] && fields(s.y)[0] !== xf ? fields(s.y)[0] : nums.find((f) => f !== xf) || nums[0];
  const pts = T.rows.map((r) => ({ x: num(r.p[xf]), y: num(r.p[yf]), s: s.size ? num(r.p[s.size]) : 1, c: s.cat ? String(r.p[s.cat] ?? '') : '' })).filter((p) => isFinite(p.x) && isFinite(p.y));
  const xs = pts.map((p) => p.x), ysv = pts.map((p) => p.y);
  const pal0 = QUAL[s.palette] || QUAL.Tableau, cats0 = [...new Set(pts.map((p) => p.c))];
  if (s.cat) seriesLegend(C, cats0.slice(0, 6), pal0);
  const { P, sy, sx } = frameXY(C, { ylo: Math.min(...ysv), yhi: Math.max(...ysv), xnum: [Math.min(...xs), Math.max(...xs)], ylab: s.ylabel || yf.replace(/_/g, ' '), xlab: s.xlabel || xf.replace(/_/g, ' ') });
  const pal = QUAL[s.palette] || QUAL.Tableau, cats = [...new Set(pts.map((p) => p.c))];
  const smax = Math.max(...pts.map((p) => p.s).filter(isFinite), 1e-9);
  pts.forEach((p, i) => {
    const k = clamp((u - (i / pts.length) * 0.6) / 0.4, 0, 1); if (k <= 0) return;
    const r = (s.size ? 3 + 14 * Math.sqrt(Math.max(0, p.s) / smax) : 4.2) * fu * easeOut(k);
    ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), r, 0, Math.PI * 2);
    const col = s.cat ? pal[cats.indexOf(p.c) % pal.length] : s.palette === 'Tableau' ? s.color || pal[0] : pal[0];
    ctx.fillStyle = hexA(col.startsWith('#') ? col : '#4e79a7', 0.72); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1 * fu; ctx.stroke();
  });
  if (s.trend !== false && pts.length > 2 && u > 0.6) {
    ctx.save(); ctx.beginPath(); ctx.rect(P.x, P.y, P.w, P.h); ctx.clip();
    const n = pts.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ysv.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0; for (const p of pts) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; }
    const b = sxy / (sxx || 1), a = my - b * mx, r2 = sxx && syy ? (sxy * sxy) / (sxx * syy) : 0;
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    ctx.globalAlpha *= clamp((u - 0.6) / 0.4, 0, 1);
    ctx.strokeStyle = th.ink; ctx.lineWidth = 1.6 * fu; ctx.setLineDash([6 * fu, 4 * fu]);
    ctx.beginPath(); ctx.moveTo(sx(x0), sy(a + b * x0)); ctx.lineTo(sx(x1), sy(a + b * x1)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = th.ink; ctx.font = `600 ${11 * fu}px ${UI}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(`R² = ${r2.toFixed(2)}`, P.x + P.w - 4 * fu, P.y + 2 * fu);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- scatter-plot matrix
function splom(C) {
  const { ctx, s, T, u, fu, th, box } = C;
  let fs = fields(s.y).filter((f) => T.numeric.includes(f));
  if (fs.length < 2) fs = T.numeric.filter((f) => !/^(lat|lon|lng|latitude|longitude|id)$/i.test(f)).slice(0, 4);
  fs = fs.slice(0, 6);
  const n = fs.length; if (n < 2) throw new Error('needs at least two number fields');
  const pal = QUAL[s.palette] || QUAL.Tableau;
  const cats = s.cat ? [...new Set(T.rows.map((r) => String(r.p[s.cat] ?? '')))] : [''];
  if (s.cat) seriesLegend(C, cats.slice(0, 6), pal);
  const V = fs.map((f) => T.rows.map((r) => num(r.p[f])));
  const rng = V.map((a) => { const f = a.filter(isFinite); return [Math.min(...f), Math.max(...f)]; });
  const side = Math.min(box.w, box.h - 4 * fu), cs = side / n, ox = box.x + (box.w - side) / 2, oy = box.y;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x0 = ox + j * cs, y0 = oy + i * cs, g = 4 * fu;
    ctx.strokeStyle = th.grid; ctx.lineWidth = 1; ctx.strokeRect(x0 + 1, y0 + 1, cs - 2, cs - 2);
    const nx = (v) => x0 + g + ((v - rng[j][0]) / (rng[j][1] - rng[j][0] || 1)) * (cs - 2 * g);
    const ny = (v) => y0 + cs - g - ((v - rng[i][0]) / (rng[i][1] - rng[i][0] || 1)) * (cs - 2 * g);
    if (i === j) {
      const a = V[i].filter(isFinite), nb = 10, w = (rng[i][1] - rng[i][0]) / nb || 1, bins = new Array(nb).fill(0);
      a.forEach((v) => bins[Math.min(nb - 1, Math.floor((v - rng[i][0]) / w))]++);
      const mb = Math.max(...bins, 1);
      bins.forEach((b, k) => { const bh = (b / mb) * (cs - 30 * fu) * u; ctx.fillStyle = hexA(pal[0], 0.55); ctx.fillRect(x0 + g + (k * (cs - 2 * g)) / nb, y0 + cs - g - bh, (cs - 2 * g) / nb - 1, bh); });
      ctx.fillStyle = th.ink; ctx.font = `700 ${Math.min(12, cs / 9) * fu}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(ellip(ctx, fs[i].replace(/_/g, ' '), cs - 8 * fu), x0 + cs / 2, y0 + 5 * fu);
      continue;
    }
    T.rows.forEach((r, k) => {
      const a = V[j][k], b = V[i][k]; if (!isFinite(a) || !isFinite(b)) return;
      if (k / T.rows.length > u) return;
      ctx.fillStyle = hexA(s.cat ? pal[cats.indexOf(String(r.p[s.cat] ?? '')) % pal.length] : pal[0], 0.7);
      ctx.beginPath(); ctx.arc(nx(a), ny(b), Math.max(1.4, cs / 70) * fu, 0, Math.PI * 2); ctx.fill();
    });
  }
}

// ---------------------------------------------------------------- data clock
function dataClock(C) {
  const { ctx, s, T, u, fu, th, box } = C;
  const tf = s.x || guessField(T, 'date'), yf = fields(s.y)[0] || '';
  const RINGS = s.rings === 'month' ? MO : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const WED = s.wedges === 'month' ? 12 : s.wedges === 'day' ? 31 : 24;
  const grid = Array.from({ length: RINGS.length }, () => new Array(WED).fill(0)), cnt = Array.from({ length: RINGS.length }, () => new Array(WED).fill(0));
  for (const r of T.rows) {
    const d = parseDate(r.p[tf]); if (!d) continue;
    const ri = s.rings === 'month' ? d.getMonth() : (d.getDay() + 6) % 7;
    const wi = s.wedges === 'month' ? d.getMonth() : s.wedges === 'day' ? d.getDate() - 1 : d.getHours();
    const v = yf ? num(r.p[yf]) : 1; if (!isFinite(v)) continue;
    grid[ri][wi] += v; cnt[ri][wi]++;
  }
  if (s.agg === 'mean' && yf) grid.forEach((row, i) => row.forEach((v, j) => { grid[i][j] = cnt[i][j] ? v / cnt[i][j] : 0; }));
  if (s.agg === 'count') grid.forEach((row, i) => row.forEach((_, j) => { grid[i][j] = cnt[i][j]; }));
  const mx = Math.max(...grid.flat(), 1e-9);
  const lgW = 26 * fu;
  const R = Math.min(box.h, box.w - lgW * 2) / 2 - 18 * fu, cx = box.x + (box.w - lgW) / 2, cy = box.y + box.h / 2, r0 = R * 0.28;
  const rw = (R - r0) / RINGS.length;
  const sweep = Math.PI * 2 * u;
  for (let i = 0; i < RINGS.length; i++) for (let j = 0; j < WED; j++) {
    const a0 = -Math.PI / 2 + (j / WED) * Math.PI * 2, a1 = a0 + (Math.PI * 2) / WED;
    if (a0 + Math.PI / 2 > sweep) continue;
    const ri = r0 + i * rw;
    ctx.beginPath(); ctx.arc(cx, cy, ri + rw, a0, Math.min(a1, -Math.PI / 2 + sweep)); ctx.arc(cx, cy, ri, Math.min(a1, -Math.PI / 2 + sweep), a0, true); ctx.closePath();
    ctx.fillStyle = grid[i][j] ? rgbS(rampAt(s.scheme || 'YlOrRd', 0.1 + 0.9 * (grid[i][j] / mx))) : (s.theme === 'dark' || s.theme === 'clear' ? 'rgba(255,255,255,0.06)' : '#f1f2f4');
    ctx.fill(); ctx.strokeStyle = th.bg ? (s.theme === 'dark' ? '#121722' : '#fff') : 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.8 * fu; ctx.stroke();
  }
  ctx.fillStyle = th.sub; ctx.font = `600 ${10 * fu}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lab = WED === 24 ? (j) => (j % 3 ? '' : String(j)) : WED === 12 ? (j) => MO[j] : (j) => (j % 5 ? '' : String(j + 1));
  for (let j = 0; j < WED; j++) { const a = -Math.PI / 2 + ((j + 0.5) / WED) * Math.PI * 2; const t = lab(j); if (t) ctx.fillText(t, cx + Math.cos(a) * (R + 10 * fu), cy + Math.sin(a) * (R + 10 * fu)); }
  ctx.font = `600 ${Math.min(10, rw / fu * 0.7) * fu}px ${UI}`; ctx.fillStyle = th.ink;
  RINGS.forEach((t, i) => ctx.fillText(t, cx, cy - (r0 + (i + 0.5) * rw)));
  ctx.fillStyle = th.ink; ctx.font = `800 ${12 * fu}px ${UI}`; ctx.fillText(yf ? yf.replace(/_/g, ' ') : 'count', cx, cy);
  heatKey(C, box.x + box.w - lgW, box.y + 8 * fu, 12 * fu, box.h - 16 * fu, 0, mx);
}
function heatKey(C, x, y, w, h, lo, hi) {
  const { ctx, s, fu, th } = C;
  const g = ctx.createLinearGradient(0, y + h, 0, y);
  for (let i = 0; i <= 10; i++) g.addColorStop(i / 10, rgbS(rampAt(s.scheme || 'YlOrRd', 0.1 + 0.09 * i)));
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = th.sub; ctx.font = `500 ${9.5 * fu}px ${UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.save(); ctx.translate(x + w + 3 * fu, y + h / 2); ctx.rotate(Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText(`${fmtNum(lo)} → ${fmtNum(hi)}`, 0, 0); ctx.restore();
}

// ---------------------------------------------------------------- calendar heat chart
function calendarHeat(C) {
  const { ctx, s, T, u, fu, th, box } = C;
  const tf = s.x || guessField(T, 'date'), yf = fields(s.y)[0] || '';
  const days = new Map();
  for (const r of T.rows) { const d = parseDate(r.p[tf]); if (!d) continue; const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; const v = yf ? num(r.p[yf]) : 1; if (!isFinite(v)) continue; const e = days.get(k) || { s: 0, n: 0 }; e.s += v; e.n++; days.set(k, e); }
  const val = (e) => (!e ? 0 : s.agg === 'mean' && yf ? e.s / e.n : s.agg === 'count' || !yf ? e.n : e.s);
  const years = [...new Set([...days.keys()].map((k) => +k.split('-')[0]))].sort().slice(-3);
  if (!years.length) throw new Error(`no dates in “${tf}”`);
  const mx = Math.max(...[...days.values()].map(val), 1e-9);
  const lw = 44 * fu, rowGap = 22 * fu;
  const cell = Math.min((box.w - lw - 30 * fu) / 53, (box.h - years.length * rowGap) / (years.length * 7));
  let total = 0; years.forEach((yr) => { total += 365; void yr; });
  let idx = 0;
  years.forEach((yr, yi) => {
    const y0 = box.y + yi * (cell * 7 + rowGap) + 14 * fu;
    ctx.save(); ctx.fillStyle = th.ink; ctx.font = `800 ${12 * fu}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.translate(box.x, y0 + cell * 3.5); ctx.rotate(-Math.PI / 2); ctx.fillText(String(yr), 0, 0); ctx.restore();
    ctx.fillStyle = th.sub; ctx.font = `500 ${9 * fu}px ${UI}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    ['Mon', '', 'Wed', '', 'Fri', '', ''].forEach((t, i) => t && ctx.fillText(t, box.x + lw - 4 * fu, y0 + (i + 0.5) * cell));
    const jan1 = new Date(yr, 0, 1), off = (jan1.getDay() + 6) % 7;
    for (let d = new Date(yr, 0, 1); d.getFullYear() === yr; d.setDate(d.getDate() + 1)) {
      const doy = Math.round((d - jan1) / 864e5), wk = Math.floor((doy + off) / 7), wd = (d.getDay() + 6) % 7;
      const x = box.x + lw + wk * cell, y = y0 + wd * cell;
      if (d.getDate() === 1) { ctx.fillStyle = th.sub; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.font = `500 ${9 * fu}px ${UI}`; ctx.fillText(MO[d.getMonth()], x, y0 - 2 * fu); }
      const k = clamp((u * 1.2 - idx / total) * 4, 0, 1); idx++;
      const v = val(days.get(`${yr}-${d.getMonth()}-${d.getDate()}`));
      ctx.globalAlpha = k;
      ctx.fillStyle = v ? rgbS(rampAt(s.scheme || 'YlOrRd', 0.12 + 0.88 * (v / mx))) : (s.theme === 'dark' || s.theme === 'clear' ? 'rgba(255,255,255,0.07)' : '#eceef1');
      rr(ctx, x + 0.6, y + 0.6, cell - 1.2, cell - 1.2, Math.min(2.5 * fu, cell * 0.2)); ctx.fill();
      ctx.globalAlpha = 1;
    }
  });
  heatKey(C, box.x + box.w - 22 * fu, box.y + 14 * fu, 10 * fu, Math.min(box.h - 20 * fu, years.length * cell * 7 + (years.length - 1) * rowGap), 0, mx);
}

// ---------------------------------------------------------------- matrix heat chart
function matrixHeat(C) {
  const { ctx, s, T, u, fu, th, box } = C;
  const xf = s.x || guessField(T, 'cat') || guessField(T, 'name'), yfC = s.cat || guessField(T, 'date') || T.fields.find((f) => f !== xf);
  const vf = fields(s.y)[0] || '';
  const cells = new Map(), xs = new Map(), ys = new Map();
  for (const r of T.rows) {
    const a = partOf(r.p[xf], s.xPart), b = partOf(r.p[yfC], s.yPart === 'value' && yfC === guessField(T, 'date') && !s.cat ? 'weekday' : s.yPart);
    const v = vf ? num(r.p[vf]) : 1; if (!isFinite(v)) continue;
    xs.set(a.k, a.o ?? xs.size); ys.set(b.k, b.o ?? ys.size);
    const k = `${a.k}\u0000${b.k}`; const e = cells.get(k) || { s: 0, n: 0, mx: -Infinity, mn: Infinity }; e.s += v; e.n++; e.mx = Math.max(e.mx, v); e.mn = Math.min(e.mn, v); cells.set(k, e);
  }
  const X = [...xs.entries()].sort((a, b) => a[1] - b[1]).map((e) => e[0]).slice(0, 40), Y = [...ys.entries()].sort((a, b) => a[1] - b[1]).map((e) => e[0]).slice(0, 30);
  const val = (e) => (!e ? NaN : s.agg === 'mean' ? e.s / e.n : s.agg === 'count' || !vf ? e.n : s.agg === 'max' ? e.mx : s.agg === 'min' ? e.mn : e.s);
  const vals = []; for (const x of X) for (const y of Y) { const v = val(cells.get(`${x}\u0000${y}`)); if (isFinite(v)) vals.push(v); }
  const lo = Math.min(...vals), hi = Math.max(...vals);
  ctx.font = `500 ${10.5 * fu}px ${UI}`;
  const lw = Math.min(box.w * 0.3, Math.max(...Y.map((t) => ctx.measureText(t).width)) + 8 * fu);
  const rot = X.some((t) => ctx.measureText(t).width > (box.w - lw - 30 * fu) / X.length - 4 * fu);
  const bh = rot ? 50 * fu : 18 * fu;
  const cw = (box.w - lw - 30 * fu) / X.length, ch = (box.h - bh) / Y.length;
  Y.forEach((yk, i) => {
    ctx.fillStyle = th.sub; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.font = `500 ${10.5 * fu}px ${UI}`; ctx.fillText(ellip(ctx, yk, lw - 6 * fu), box.x + lw - 6 * fu, box.y + i * ch + ch / 2);
    X.forEach((xk, j) => {
      const v = val(cells.get(`${xk}\u0000${yk}`));
      const k = clamp((u * 1.3 - (j + i) / (X.length + Y.length)) * 3, 0, 1);
      ctx.globalAlpha = k;
      ctx.fillStyle = isFinite(v) ? rgbS(rampAt(s.scheme || 'YlOrRd', 0.1 + 0.9 * ((v - lo) / (hi - lo || 1)))) : 'rgba(128,128,128,0.12)';
      ctx.fillRect(box.x + lw + j * cw + 0.5, box.y + i * ch + 0.5, cw - 1, ch - 1);
      if (s.values !== false && isFinite(v) && cw > 26 * fu && ch > 13 * fu) { const t = (v - lo) / (hi - lo || 1); ctx.fillStyle = t > 0.55 ? '#fff' : '#1b1f27'; ctx.textAlign = 'center'; ctx.font = `600 ${Math.min(10.5, ch / fu * 0.5) * fu}px ${UI}`; ctx.fillText(fmtNum(v, s.decimals), box.x + lw + j * cw + cw / 2, box.y + i * ch + ch / 2); }
      ctx.globalAlpha = 1;
    });
  });
  ctx.fillStyle = th.sub; ctx.font = `500 ${10.5 * fu}px ${UI}`;
  X.forEach((xk, j) => {
    const cx = box.x + lw + j * cw + cw / 2, yy = box.y + Y.length * ch + 4 * fu;
    if (rot) { ctx.save(); ctx.translate(cx, yy); ctx.rotate(-0.7); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(ellip(ctx, xk, 60 * fu), 0, 0); ctx.restore(); }
    else { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(xk, cx, yy); }
  });
  heatKey(C, box.x + box.w - 20 * fu, box.y, 10 * fu, Y.length * ch, lo, hi);
}

// ---------------------------------------------------------------- QQ plot
function qqPlot(C) {
  const { ctx, s, T, u, fu, th } = C;
  const f = fields(s.y)[0] || guessField(T, 'num');
  const v = T.rows.map((r) => num(r.p[f])).filter(isFinite).sort((a, b) => a - b);
  const n = v.length; if (n < 3) throw new Error('needs at least 3 numbers');
  const mean = v.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) || 1;
  const z = v.map((_, i) => invNorm((i + 0.5) / n));
  const { P, sy, sx } = frameXY(C, { ylo: v[0], yhi: v[n - 1], xnum: [z[0], z[n - 1]], ylab: s.ylabel || `${f.replace(/_/g, ' ')} (sample)`, xlab: s.xlabel || 'Theoretical quantiles (normal)' });
  ctx.save(); ctx.beginPath(); ctx.rect(P.x, P.y, P.w, P.h); ctx.clip();
  ctx.strokeStyle = s.color2 || '#e15759'; ctx.lineWidth = 2 * fu;
  ctx.beginPath(); ctx.moveTo(sx(z[0]), sy(mean + sd * z[0])); ctx.lineTo(sx(z[0]) + (sx(z[n - 1]) - sx(z[0])) * u, sy(mean + sd * (z[0] + (z[n - 1] - z[0]) * u))); ctx.stroke(); ctx.restore();
  v.forEach((x, i) => { if (i / n > u) return; ctx.beginPath(); ctx.arc(sx(z[i]), sy(x), 3.4 * fu, 0, Math.PI * 2); ctx.fillStyle = hexA(s.color || '#4e79a7', 0.75); ctx.fill(); ctx.strokeStyle = s.color || '#4e79a7'; ctx.lineWidth = 1 * fu; ctx.stroke(); });
  void th;
}

// ---------------------------------------------------------------- profile graph
function profileGraph(C) {
  const { ctx, s, T, u, fu, th, o } = C;
  let d = [], e = [], ready = true;
  if (s.source === 'line') {
    const tgt = H.lineTarget?.(s.ref || 'route', o, null);
    if (!tgt) throw new Error('pick a line (or draw a route) for the profile');
    const pr = H.profileOf(tgt.cs, 160);
    ready = pr.ready; d = pr.d.map((x) => x / 1000); e = pr.e;
  } else {
    const xf = s.x || T.numeric.find((f) => /dist|km|mile|^x$/i.test(f)) || T.numeric[0], yf = fields(s.y)[0] || T.numeric.find((f) => /elev|alt|height|^z$|^y$/i.test(f)) || T.numeric[1];
    const rows = T.rows.map((r) => [num(r.p[xf]), num(r.p[yf])]).filter((p) => isFinite(p[0]) && isFinite(p[1])).sort((a, b) => a[0] - b[0]);
    d = rows.map((r) => r[0]); e = rows.map((r) => r[1]);
  }
  if (!ready) { ctx.fillStyle = th.sub; ctx.font = `500 ${12 * fu}px ${UI}`; ctx.fillText('Loading elevation…', C.box.x, C.box.y + 10 * fu); return; }
  if (d.length < 2) throw new Error('needs distance and elevation values');
  const lo = Math.min(...e), hi = Math.max(...e);
  const { P, sy, sx } = frameXY(C, { ylo: lo - (hi - lo) * 0.08, yhi: hi + (hi - lo) * 0.12, xnum: [d[0], d.at(-1)], ylab: s.ylabel || 'Elevation (m)', xlab: s.xlabel || 'Distance (km)' });
  const pts = d.map((x, i) => [sx(x), sy(e[i])]);
  ctx.save(); ctx.beginPath(); ctx.rect(P.x, P.y - 20 * fu, P.w * u, P.h + 40 * fu); ctx.clip();
  ctx.beginPath(); curve(ctx, pts, s.smooth); ctx.lineTo(pts.at(-1)[0], P.y + P.h); ctx.lineTo(pts[0][0], P.y + P.h); ctx.closePath();
  const g = ctx.createLinearGradient(0, P.y, 0, P.y + P.h); g.addColorStop(0, hexA(s.color || '#4e79a7', 0.6)); g.addColorStop(1, hexA(s.color || '#4e79a7', 0.06));
  if (s.area !== false) { ctx.fillStyle = g; ctx.fill(); }
  ctx.beginPath(); curve(ctx, pts, s.smooth); ctx.strokeStyle = s.color || '#4e79a7'; ctx.lineWidth = 2.4 * fu; ctx.stroke();
  ctx.restore();
  const iMax = e.indexOf(hi), iMin = e.indexOf(lo);
  ctx.font = `700 ${10.5 * fu}px ${UI}`; ctx.textAlign = 'center';
  if (u > 0.95) {
    ctx.fillStyle = s.color2 || '#e15759'; ctx.beginPath(); ctx.arc(pts[iMax][0], pts[iMax][1], 4 * fu, 0, Math.PI * 2); ctx.fill(); ctx.textBaseline = 'bottom'; ctx.fillStyle = th.ink; ctx.fillText(`▲ ${Math.round(hi)} m`, pts[iMax][0], pts[iMax][1] - 6 * fu);
    ctx.fillStyle = s.color2 || '#e15759'; ctx.beginPath(); ctx.arc(pts[iMin][0], pts[iMin][1], 4 * fu, 0, Math.PI * 2); ctx.fill(); ctx.textBaseline = 'top'; ctx.fillStyle = th.ink; ctx.fillText(`▼ ${Math.round(lo)} m`, pts[iMin][0], pts[iMin][1] + 6 * fu);
  } else if (u > 0) {
    const k = Math.min(pts.length - 1, Math.floor(u * (pts.length - 1)));
    ctx.fillStyle = s.color2 || '#e15759'; ctx.beginPath(); ctx.arc(pts[k][0], pts[k][1], 5 * fu, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = th.ink; ctx.textBaseline = 'bottom'; ctx.fillText(`${Math.round(e[k])} m`, pts[k][0], pts[k][1] - 7 * fu);
  }
}
