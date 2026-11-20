// Thematic maps from your data (CSV with coordinates or country names, GeoJSON, TopoJSON, KML, GPX, shapefile):
// choropleth, graduated colours, graduated symbols, proportional symbols, dot density, bivariate, unique values (categories)
// and a heat map — each with classification, colour schemes, labels, an animated reveal and its own legend.
import { placeAt, CUSTOM_POS } from './place.js';
import { H, countriesByName } from './cartofx.js';
import { parseTable, num, guessField, breaksOf, classOf, rampN, rampAt, fmtNum, CLASSIFY, SCHEME_NAMES, QUAL, QUAL_NAMES, BIVAR, BIVAR_NAMES, SAMPLE_NAMES, dataOf } from './geodata.js';

const { clamp, easeOut, UI, hexA, rr, prog, polysOf, linesOf, labelPoint, pathPolys, off, hashStr, rng } = H;

export const TH_TYPES = {
  choropleth: 'Choropleth (areas coloured by value)',
  gradcolor: 'Graduated colours (points, lines or areas)',
  gradsym: 'Graduated symbols (sized by class)',
  propsym: 'Proportional symbols (sized by value)',
  dotdensity: 'Dot density (1 dot = N)',
  bivariate: 'Bivariate (two values, 3 × 3 colours)',
  unique: 'Unique values (categories)',
  heat: 'Heat map (density of points)',
  spike: '3D spike map (value as height)',
  hexbin: 'Hexagon bins (points counted in hexagons)',
  dorling: 'Circle cartogram (Dorling — places as sized circles)',
  isolines: 'Isolines / contours (surface from point values)',
};
export const TH_KINDS = { thematic: { name: 'Thematic map', icon: '🗺', geom: null, desc: 'Choropleth, graduated colours or symbols, proportional symbols, dot density, bivariate, categories, heat map, 3D spikes, hexagon bins, circle cartogram or isolines from your CSV, GeoJSON, KML or shapefile' } };
export const TH_ANIMS = { thematic: { classes: 'Classes appear low → high', grow: 'Grow one by one', sweep: 'Sweep in from the west', fade: 'Fade in', none: 'Shown' } };
export const TH_DEFAULTS = {
  thematic: { anim: 'classes', duration: 2.5, style: {
    type: 'choropleth', data: '', sample: 'world', join: 'auto', joinField: '', field: '', norm: '', normMul: 1, field2: '', catField: '', fields: '',
    method: 'quantile', classes: 5, manual: '', scheme: 'YlOrRd', reverse: false, qual: 'Tableau', bivar: 'pinkblue',
    opacity: 0.85, stroke: '#ffffff', strokeWidth: 0.6, noData: '#9aa0a8',
    symColor: '#e8553b', symShape: 'circle', minSize: 4, maxSize: 34, symStroke: '#ffffff',
    perDot: 0, dotSize: 2, dotColor: '#d7301f', radius: 28, heatScheme: 'Heat',
    labels: 'none', labelField: '', labelSize: 1, labelColor: '#ffffff', decimals: '',
    legend: true, legendTitle: '', legendTheme: 'light', position: 'bottom-left', legendSize: 1,
    spikeHeight: 140, spikeWidth: 8, hexSize: 22, hexAgg: 'count', isoBands: true, isoLines: true, isoLabels: true, isoReach: 150, isoPoints: true, baseMap: true,
  } },
};
const T = (L) => L.style.type || 'choropleth';
const CLS_TYPES = ['choropleth', 'gradcolor', 'gradsym', 'spike', 'dorling', 'isolines'];
const usesClasses = (L) => CLS_TYPES.includes(T(L));
export const TH_FORMS = {
  thematic: [
    ['style.type', 'Map type', 'select', TH_TYPES],
    ['style.data', 'Your data — CSV (with lat / lon or a country name column), GeoJSON, TopoJSON, KML, GPX or a zipped shapefile', 'datafile'],
    ['style.sample', 'When no data is loaded, use sample', 'select', SAMPLE_NAMES, (L) => !String(L.style.data || '').trim()],
    ['style.field', 'Value field', 'field', 'num', (L) => T(L) !== 'unique' && !(T(L) === 'dotdensity' && L.style.fields)],
    ['style.norm', 'Divide by field (e.g. area or population → rate) — optional', 'field', 'num?', (L) => ['choropleth', 'gradcolor', 'bivariate'].includes(T(L))],
    ['style.normMul', 'Then multiply by (e.g. 100 for %, 1000 for per 1000)', 'number', null, (L) => !!L.style.norm],
    ['style.field2', 'Second value field (vertical axis)', 'field', 'num', (L) => T(L) === 'bivariate'],
    ['style.catField', 'Category field', 'field', 'any', (L) => T(L) === 'unique'],
    ['style.fields', 'Several fields, one colour each (comma-separated) — optional', 'fields', 'num', (L) => T(L) === 'dotdensity'],
    ['style.join', 'Rows without shapes', 'select', { auto: 'Join to country shapes by name', none: 'Ignore them' }],
    ['style.joinField', 'Country name field for the join', 'field', 'any?', (L) => L.style.join !== 'none'],
    ['style.method', 'Classification', 'select', CLASSIFY, usesClasses],
    ['style.classes', 'Number of classes', 'range', [2, 9, 1], (L) => usesClasses(L) && L.style.method !== 'manual'],
    ['style.manual', 'Breaks (e.g. 10, 50, 100, 500)', 'text', null, (L) => usesClasses(L) && L.style.method === 'manual'],
    ['style.scheme', 'Colour scheme', 'select', SCHEME_NAMES, (L) => ['choropleth', 'gradcolor', 'spike', 'dorling', 'isolines', 'hexbin'].includes(T(L))],
    ['style.heatScheme', 'Colour scheme', 'select', SCHEME_NAMES, (L) => T(L) === 'heat'],
    ['style.reverse', 'Reverse colours', 'switch', null, (L) => ['choropleth', 'gradcolor', 'spike', 'dorling', 'isolines', 'hexbin'].includes(T(L))],
    ['style.spikeHeight', 'Tallest spike (px)', 'range', [20, 500, 5], (L) => T(L) === 'spike'],
    ['style.spikeWidth', 'Spike width (px)', 'range', [2, 40, 0.5], (L) => T(L) === 'spike'],
    ['style.hexSize', 'Hexagon size (px)', 'range', [6, 120, 1], (L) => T(L) === 'hexbin'],
    ['style.hexAgg', 'Each hexagon shows', 'select', { count: 'How many points', sum: 'Sum of the value field', mean: 'Average of the value field' }, (L) => T(L) === 'hexbin'],
    ['style.isoBands', 'Filled bands between the lines', 'switch', null, (L) => T(L) === 'isolines'],
    ['style.isoLines', 'Contour lines', 'switch', null, (L) => T(L) === 'isolines'],
    ['style.isoLabels', 'Values on the lines', 'switch', null, (L) => T(L) === 'isolines' && L.style.isoLines !== false],
    ['style.isoReach', 'How far from the points to draw (px)', 'range', [40, 800, 10], (L) => T(L) === 'isolines'],
    ['style.isoPoints', 'Show the measuring points', 'switch', null, (L) => T(L) === 'isolines'],
    ['style.qual', 'Colours', 'select', QUAL_NAMES, (L) => T(L) === 'unique' || (T(L) === 'dotdensity' && L.style.fields)],
    ['style.bivar', 'Colours', 'select', BIVAR_NAMES, (L) => T(L) === 'bivariate'],
    ['style.symColor', 'Symbol colour', 'color', null, (L) => ['gradsym', 'propsym'].includes(T(L))],
    ['style.symShape', 'Symbol', 'select', { circle: 'Circle', square: 'Square', triangle: 'Triangle', diamond: 'Diamond' }, (L) => ['gradsym', 'propsym', 'gradcolor'].includes(T(L))],
    ['style.minSize', 'Smallest symbol (px)', 'range', [1, 40, 0.5], (L) => ['gradsym', 'gradcolor'].includes(T(L))],
    ['style.maxSize', 'Biggest symbol (px)', 'range', [4, 120, 1], (L) => ['gradsym', 'propsym', 'dorling'].includes(T(L))],
    ['style.baseMap', 'Faint country shapes underneath', 'switch', null, (L) => ['spike', 'dorling', 'hexbin'].includes(T(L))],
    ['style.perDot', 'One dot = (0 = automatic)', 'number', null, (L) => T(L) === 'dotdensity'],
    ['style.dotSize', 'Dot size', 'range', [0.5, 6, 0.1], (L) => T(L) === 'dotdensity'],
    ['style.dotColor', 'Dot colour', 'color', null, (L) => T(L) === 'dotdensity' && !L.style.fields],
    ['style.radius', 'Heat radius (px)', 'range', [6, 120, 1], (L) => T(L) === 'heat'],
    ['style.opacity', 'Opacity', 'range', [0.1, 1, 0.02]],
    ['style.stroke', 'Outline colour', 'color'], ['style.strokeWidth', 'Outline width', 'range', [0, 4, 0.1]],
    ['style.noData', 'No-data colour', 'color', null, (L) => ['choropleth', 'bivariate'].includes(T(L))],
    ['style.labels', 'Labels', 'select', { none: 'None', name: 'Names', value: 'Values', both: 'Name + value' }],
    ['style.labelField', 'Name field for labels', 'field', 'any?', (L) => /name|both/.test(L.style.labels || '')],
    ['style.decimals', 'Decimals in numbers (empty = automatic)', 'number'],
    ['style.labelSize', 'Label size', 'range', [0.5, 2.5, 0.05], (L) => L.style.labels !== 'none'], ['style.labelColor', 'Label colour', 'color', null, (L) => L.style.labels !== 'none'],
    ['style.legend', 'Legend', 'switch'],
    ['style.legendTitle', 'Legend title (empty = the field name)', 'text', null, (L) => L.style.legend !== false],
    ['style.legendTheme', 'Legend look', 'select', { light: 'White card', dark: 'Dark glass', clear: 'No box (text with shadow)' }, (L) => L.style.legend !== false],
    ['style.position', 'Legend position', 'select', { 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right', 'top-left': 'Top left', 'top-right': 'Top right', ...CUSTOM_POS }, (L) => L.style.legend !== false],
    ['style.legendSize', 'Legend size', 'range', [0.5, 2, 0.05], (L) => L.style.legend !== false],
  ],
};
export const TH_SET = new Set(Object.keys(TH_KINDS));
export const thPhases = () => ['below', 'above', 'captions'];

// ================================================================= data → features
const featCache = new Map();
function prepared(L) {
  const s = L.style, txt = dataOf(s);
  const Tb = parseTable(txt);
  const key = `${txt.length}|${hashStr(txt.slice(0, 4000))}|${hashStr(txt.slice(-2000))}|${s.join}|${s.joinField}`;
  const hit = featCache.get(key);
  if (hit) return hit;
  const feats = [];
  let loading = false;
  const jf = s.joinField || guessField(Tb, 'name');
  for (const r of Tb.rows) {
    let polys = [], lines = [], pts = [];
    const g = r.g;
    const take = (gg) => {
      if (!gg) return;
      if (gg.type === 'GeometryCollection') { gg.geometries.forEach(take); return; }
      polys.push(...polysOf(gg)); lines.push(...linesOf(gg));
      if (gg.type === 'Point') pts.push(gg.coordinates); else if (gg.type === 'MultiPoint') pts.push(...gg.coordinates);
    };
    take(g);
    if (!g && s.join !== 'none' && jf && r.p[jf]) {
      const c = countriesByName(String(r.p[jf]).replace(/[,;]/g, ' '));
      if (c === null) loading = true;
      else if (c[0]) polys = c[0].polys;
    }
    if (!polys.length && !lines.length && !pts.length) continue;
    let c = null;
    if (polys.length) c = labelPoint(polys);
    else if (pts.length) c = pts[0];
    else { const l = lines[0]; c = l[l.length >> 1]; }
    feats.push({ p: r.p, polys, lines, pts, c });
  }
  const out = { T: Tb, feats, loading, nameField: jf };
  if (!loading) { featCache.set(key, out); if (featCache.size > 16) featCache.delete(featCache.keys().next().value); }
  return out;
}
const valOf = (L, f, field) => {
  const s = L.style;
  let v = num(f.p[field]);
  if (s.norm && field === s.field) { const d = num(f.p[s.norm]); v = d ? (v / d) * (+s.normMul || 1) : NaN; }
  return v;
};
/** Everything needed to draw and to build the legend. */
function model(L) {
  const s = L.style, P = prepared(L), type = T(L);
  const field = s.field || guessField(P.T, 'num');
  const M = { P, type, field, vals: P.feats.map((f) => valOf(L, f, field)) };
  const fin = M.vals.filter(isFinite);
  M.min = Math.min(...fin); M.max = Math.max(...fin);
  if (CLS_TYPES.includes(type)) {
    M.br = breaksOf(M.vals, s.method, +s.classes || 5, s.manual);
    M.nc = Math.max(1, M.br.length - 1);
    M.colors = rampN(s.scheme, M.nc, !!s.reverse);
    M.cls = M.vals.map((v) => classOf(v, M.br));
  }
  if (type === 'bivariate') {
    M.field2 = s.field2 || P.T.numeric.filter((f) => f !== field && !/lat|lon/i.test(f))[0] || field;
    M.vals2 = P.feats.map((f) => valOf(L, f, M.field2));
    M.brA = breaksOf(M.vals, 'quantile', 3); M.brB = breaksOf(M.vals2, 'quantile', 3);
    M.colors = BIVAR[s.bivar] || BIVAR.pinkblue;
    M.cls = M.vals.map((v, i) => { const a = classOf(v, M.brA), b = classOf(M.vals2[i], M.brB); return a < 0 || b < 0 ? -1 : b * 3 + a; });
  }
  if (type === 'unique') {
    M.cat = s.catField || guessField(P.T, 'cat') || P.nameField;
    const cnt = new Map();
    for (const f of P.feats) { const k = String(f.p[M.cat] ?? '—'); cnt.set(k, (cnt.get(k) || 0) + 1); }
    const pal = QUAL[s.qual] || QUAL.Tableau;
    M.cats = [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    M.catColor = new Map(M.cats.map((k, i) => [k, i < pal.length ? pal[i] : '#9aa0a8']));
  }
  if (type === 'dotdensity') {
    M.dfields = String(s.fields || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (!M.dfields.length) M.dfields = [field];
    const pal = QUAL[s.qual] || QUAL.Tableau;
    M.dcolors = M.dfields.length > 1 ? M.dfields.map((_, i) => pal[i % pal.length]) : [s.dotColor || '#d7301f'];
    let tot = 0; for (const f of P.feats) for (const df of M.dfields) { const v = num(f.p[df]); if (isFinite(v) && v > 0) tot += v; }
    const auto = (() => { const raw = tot / 2500; if (!(raw > 0)) return 1; const p = 10 ** Math.floor(Math.log10(raw)); const k = raw / p; return (k <= 1 ? 1 : k <= 2 ? 2 : k <= 5 ? 5 : 10) * p; })();
    M.perDot = +s.perDot > 0 ? +s.perDot : auto;
  }
  // order for the "grow" reveal
  const idx = M.vals.map((v, i) => i).sort((a, b) => (isFinite(M.vals[a]) ? M.vals[a] : -Infinity) - (isFinite(M.vals[b]) ? M.vals[b] : -Infinity));
  M.rank = new Array(idx.length); idx.forEach((i, r) => { M.rank[i] = r; });
  return M;
}
const models = new WeakMap();
function modelOf(L) {
  const d = String(L.style.data || '');
  const sig = `${d.length}|${d.slice(0, 120)}|${d.slice(-120)}|${JSON.stringify({ ...L.style, data: 0, position: 0, pos: 0, pos_legend: 0 })}`;
  const m = models.get(L);
  if (m && m.sig === sig && !m.M.P.loading) return m.M;
  const M = model(L);
  models.set(L, { sig, M });
  return M;
}

// ================================================================= animation
function appear(L, M, i, u, f, o) {
  if (u >= 1) return 1;
  const n = Math.max(1, M.vals.length);
  switch (L.anim) {
    case 'classes': {
      const c = M.cls ? M.cls[i] : M.rank[i] / n * 5;
      const nc = M.nc || (M.type === 'bivariate' ? 9 : 5);
      return clamp((u - (Math.max(0, c) / nc) * 0.75) / 0.25, 0, 1);
    }
    case 'grow': return clamp((u - (M.rank[i] / n) * 0.75) / 0.25, 0, 1);
    case 'sweep': { const q = f.c ? o.proj(f.c) : [0, 0]; const fr = o.frame; const xn = fr ? (q[0] - fr.x) / fr.w : 0.5; return clamp((u * 1.35 - xn) / 0.35, 0, 1); }
    case 'fade': return u;
    default: return 1;
  }
}

// ================================================================= drawing
function symbolPath(ctx, shape, x, y, r) {
  ctx.beginPath();
  if (shape === 'square') ctx.rect(x - r * 0.886, y - r * 0.886, r * 1.772, r * 1.772);
  else if (shape === 'triangle') { const h = r * 1.35; ctx.moveTo(x, y - h); ctx.lineTo(x + h * 0.95, y + h * 0.6); ctx.lineTo(x - h * 0.95, y + h * 0.6); ctx.closePath(); }
  else if (shape === 'diamond') { const h = r * 1.25; ctx.moveTo(x, y - h); ctx.lineTo(x + h, y); ctx.lineTo(x, y + h); ctx.lineTo(x - h, y); ctx.closePath(); }
  else ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
}
function fillPolys(ctx, f, proj, color, a, s, unit) {
  ctx.beginPath(); pathPolys(ctx, f.polys, proj);
  ctx.globalAlpha = a * (+s.opacity || 0.85); ctx.fillStyle = color; ctx.fill('evenodd');
  if (+s.strokeWidth > 0) { ctx.globalAlpha = Math.min(1, a * 1.2); ctx.strokeStyle = s.stroke || '#fff'; ctx.lineWidth = +s.strokeWidth * unit; ctx.lineJoin = 'round'; ctx.stroke(); }
}
function strokeLines(ctx, f, proj, color, a, s, unit, w) {
  ctx.globalAlpha = a; ctx.strokeStyle = color; ctx.lineWidth = w * unit; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); for (const l of f.lines) H.pathLine(ctx, l, proj); ctx.stroke();
}
const dotCache = new Map();
function dotsOf(f, count, seedKey) {
  const key = `${seedKey}|${count}`;
  let d = dotCache.get(key);
  if (d) return d;
  d = [];
  const R = rng(hashStr(seedKey));
  if (f.polys.length) {
    const [w, s, e, n] = H.bboxOf(f.polys);
    let tries = 0;
    while (d.length < count && tries < count * 40) { tries++; const ll = [w + R() * (e - w), s + R() * (n - s)]; if (H.inPolys(ll, f.polys)) d.push(ll); }
  } else if (f.pts.length) for (let i = 0; i < count; i++) { const p = f.pts[i % f.pts.length]; d.push([p[0] + (R() - 0.5) * 0.02, p[1] + (R() - 0.5) * 0.02]); }
  dotCache.set(key, d);
  if (dotCache.size > 3000) dotCache.delete(dotCache.keys().next().value);
  return d;
}

export function drawThematic(ctx, L, tm, o, phase) {
  const s = L.style, M = modelOf(L), { proj, unit } = o;
  const u = tm.edit || L.anim === 'none' ? 1 : easeOut(prog(L, tm));
  const type = M.type, feats = M.P.feats;
  if (phase === 'captions') {
    if (s.legend === false || !o.frame) return;
    const shared = (o.scene?.layers || []).some((x) => x.kind === 'maplegend' && !x.hidden && x.style?.auto !== false);
    if (shared) return;
    const spec = legendSpec(L);
    if (!spec) return;
    const lay = measureLegend(ctx, [spec], unit * (+s.legendSize || 1), { theme: s.legendTheme });
    const fr = o.frame, m = 28 * unit, pos = s.position || 'bottom-left';
    const x = /right/.test(pos) ? fr.x + fr.w - m - lay.w : fr.x + m, y = /bottom/.test(pos) ? fr.y + fr.h - m - lay.h : fr.y + m;
    ctx.save(); placeAt(ctx, L, fr, x, y, lay.w, lay.h, { key: 'legend' });
    ctx.globalAlpha *= tm.alpha * clamp(u * 2, 0, 1);
    lay.paint(x, y);
    ctx.restore();
    return;
  }
  ctx.save();
  const base = tm.alpha;
  if (type === 'heat') { if (phase === 'below') drawHeat(ctx, L, M, o, u * base); ctx.restore(); return; }
  const below = phase === 'below';
  const symR = (i) => {
    if (type === 'propsym') { const v = M.vals[i]; const mx = Math.max(Math.abs(M.max), Math.abs(M.min)) || 1; return (+s.maxSize || 34) * Math.sqrt(Math.abs(v) / mx) * unit; }
    if (type === 'gradsym' || (type === 'gradcolor' && M.cls)) { const c = M.cls[i]; const k = M.nc > 1 ? c / (M.nc - 1) : 1; return type === 'gradcolor' ? (+s.minSize || 4) * 1.6 * unit : ((+s.minSize || 4) + k * ((+s.maxSize || 34) - (+s.minSize || 4))) * unit; }
    return 6 * unit;
  };
  const colorOf = (i) => {
    if (type === 'unique') return M.catColor.get(String(feats[i].p[M.cat] ?? '—'));
    if (M.cls) return M.cls[i] < 0 ? s.noData : M.colors[M.cls[i]];
    return s.symColor;
  };
  if (['spike', 'dorling', 'hexbin', 'isolines'].includes(type)) { drawMore(ctx, L, M, o, u, base, phase, colorOf); ctx.restore(); return; }
  if (type === 'dotdensity') {
    if (below) {
      for (const f of feats) if (f.polys.length) { ctx.beginPath(); pathPolys(ctx, f.polys, proj); ctx.globalAlpha = base * 0.9; ctx.strokeStyle = s.stroke || '#fff'; ctx.lineWidth = Math.max(0.4, +s.strokeWidth || 0.6) * unit; ctx.stroke(); }
    } else {
      const r = (+s.dotSize || 1.6) * unit;
      feats.forEach((f, i) => {
        const a = appear(L, M, i, u, f, o) * base; if (a <= 0) return;
        M.dfields.forEach((df, j) => {
          const v = num(f.p[df]); if (!(v > 0)) return;
          const n = Math.min(4000, Math.round(v / M.perDot));
          const pts = dotsOf(f, n, `${i}|${df}|${f.c}`);
          const shown = L.anim === 'grow' || L.anim === 'classes' ? Math.round(pts.length * a) : pts.length;
          ctx.globalAlpha = L.anim === 'grow' || L.anim === 'classes' ? base * (+s.opacity || 0.9) : a * (+s.opacity || 0.9);
          ctx.fillStyle = M.dcolors[j % M.dcolors.length];
          ctx.beginPath();
          for (let k = 0; k < shown; k++) { const q = proj(pts[k]); ctx.moveTo(q[0] + r, q[1]); ctx.arc(q[0], q[1], r, 0, Math.PI * 2); }
          ctx.fill();
        });
      });
      labels(ctx, L, M, o, u, base);
    }
    ctx.restore(); return;
  }
  if (below) {
    feats.forEach((f, i) => {
      if (!f.polys.length) return;
      if (type === 'gradsym' || type === 'propsym') { ctx.beginPath(); pathPolys(ctx, f.polys, proj); ctx.globalAlpha = base * 0.35; ctx.fillStyle = '#c9ccd2'; ctx.fill('evenodd'); if (+s.strokeWidth > 0) { ctx.globalAlpha = base * 0.8; ctx.strokeStyle = s.stroke || '#fff'; ctx.lineWidth = +s.strokeWidth * unit; ctx.stroke(); } return; }
      const a = appear(L, M, i, u, f, o) * base;
      if (L.anim !== 'none' && a < 1 && u < 1) { ctx.beginPath(); pathPolys(ctx, f.polys, proj); ctx.globalAlpha = base * 0.25 * (1 - a); ctx.fillStyle = s.noData || '#9aa0a8'; ctx.fill('evenodd'); }
      if (a > 0) fillPolys(ctx, f, proj, colorOf(i), a, s, unit);
    });
  } else {
    // lines and point symbols
    const order = feats.map((_, i) => i);
    if (type === 'propsym' || type === 'gradsym') order.sort((a, b) => symR(b) - symR(a));
    for (const i of order) {
      const f = feats[i];
      const a = appear(L, M, i, u, f, o) * base;
      if (a <= 0) continue;
      if (f.lines.length && !f.polys.length && !['propsym', 'gradsym'].includes(type)) { const w = M.cls && type === 'gradcolor' ? 1.5 + (M.cls[i] / Math.max(1, M.nc - 1)) * 5 : 3; strokeLines(ctx, f, proj, colorOf(i), a, s, unit, w); continue; }
      const sym = type === 'propsym' || type === 'gradsym' || (!f.polys.length && f.pts.length);
      if (!sym || !f.c) continue;
      if (!isFinite(M.vals[i]) && type !== 'unique') continue;
      const grow = L.anim === 'grow' || L.anim === 'classes' ? easeOut(a) : 1;
      const r = symR(i) * grow;
      const pts = !f.polys.length && f.pts.length > 1 && type !== 'propsym' && type !== 'gradsym' ? f.pts : [f.c];
      for (const p of pts) {
        const q = proj(p);
        if (!isFinite(q[0])) continue;
        symbolPath(ctx, s.symShape, q[0], q[1], r);
        ctx.globalAlpha = a * (+s.opacity || 0.85);
        ctx.fillStyle = type === 'propsym' || type === 'gradsym' ? s.symColor || '#e8553b' : colorOf(i);
        ctx.fill();
        if (+s.strokeWidth > 0) { ctx.globalAlpha = a; ctx.strokeStyle = s.symStroke || s.stroke || '#fff'; ctx.lineWidth = Math.max(0.6, +s.strokeWidth) * unit; ctx.stroke(); }
      }
    }
    labels(ctx, L, M, o, u, base, symR);
  }
  ctx.restore();
}
function labels(ctx, L, M, o, u, base, symR = null) {
  const s = L.style;
  if (!s.labels || s.labels === 'none') return;
  const nf = s.labelField || M.P.nameField;
  const unit = o.unit * (+s.labelSize || 1);
  ctx.font = `700 ${12 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  M.P.feats.forEach((f, i) => {
    const a = appear(L, M, i, u, f, o) * base; if (a <= 0.05 || !f.c) return;
    const q = o.proj(f.c); if (!isFinite(q[0])) return;
    const name = String(f.p[nf] ?? ''), val = M.type === 'unique' ? '' : fmtNum(M.vals[i], s.decimals);
    const lines = s.labels === 'name' ? [name] : s.labels === 'value' ? [val] : [name, val];
    const under = symR && (!f.polys.length || M.type === 'gradsym' || M.type === 'propsym') ? symR(i) + 4 * o.unit : 0;
    lines.filter(Boolean).forEach((t, k, arr) => {
      const y = under ? q[1] + under + 7 * unit + k * 14 * unit : q[1] + (k - (arr.length - 1) / 2) * 14 * unit;
      ctx.globalAlpha = a; ctx.lineWidth = 3 * unit; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.strokeText(t, q[0], y);
      ctx.fillStyle = s.labelColor || '#fff'; ctx.fillText(t, q[0], y);
      if (k === 0 && arr.length > 1) ctx.font = `600 ${11 * unit}px ${UI}`;
    });
    ctx.font = `700 ${12 * unit}px ${UI}`;
  });
}
function drawHeat(ctx, L, M, o, alpha) {
  const s = L.style, fr = o.frame || { x: 0, y: 0, w: ctx.canvas.width, h: ctx.canvas.height };
  const sc = 0.33, W = Math.ceil(fr.w * sc), Hh = Math.ceil(fr.h * sc);
  const [c, g] = off(`heat:${L.id}`, W, Hh);
  const R = (+s.radius || 28) * o.unit * sc;
  const pts = [];
  M.P.feats.forEach((f, i) => { const v = M.vals[i]; const w = s.field && isFinite(v) ? v : 1; (f.pts.length ? f.pts : [f.c]).forEach((p) => p && pts.push([p, w])); });
  const mx = Math.max(...pts.map((p) => p[1]).filter(isFinite), 1e-9);
  for (const [p, w] of pts) {
    const q = o.proj(p); const x = (q[0] - fr.x) * sc, y = (q[1] - fr.y) * sc;
    if (x < -R || y < -R || x > W + R || y > Hh + R) continue;
    const gr = g.createRadialGradient(x, y, 0, x, y, R);
    const k = clamp(w / mx, 0.05, 1) * 0.5;
    gr.addColorStop(0, `rgba(0,0,0,${k})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
  }
  const im = g.getImageData(0, 0, W, Hh), d = im.data;
  let amax = 1; for (let i = 3; i < d.length; i += 4) if (d[i] > amax) amax = d[i];
  const lut = []; for (let i = 0; i < 256; i++) lut.push(rampAt(s.heatScheme || 'Heat', 0.25 + (i / 255) * 0.75));
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]; if (!a) continue;
    const t = Math.min(255, Math.round((a / amax) * 255));
    const col = lut[t];
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = Math.min(255, 40 + t * 0.85);
  }
  g.putImageData(im, 0, 0);
  ctx.globalAlpha = alpha * (+s.opacity || 0.85);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, fr.x, fr.y, fr.w, fr.h);
}

// ================================================================= spike map · hexagon bins · circle cartogram · isolines
const hexState = new Map();
/** '#rrggbb' or 'rgb(r,g,b)' → [r, g, b] */
const rgbOf = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; } const r = String(c).match(/[\d.]+/g); return r && r.length >= 3 ? r.slice(0, 3).map(Number) : [200, 200, 200]; };
const rgba = (c, a) => { const [r, g, b] = rgbOf(c); return `rgba(${r},${g},${b},${a})`; };
const projKey = (o) => { const a = o.proj([0, 0]), b = o.proj([10, 10]); return `${a[0].toFixed(1)},${a[1].toFixed(1)},${b[0].toFixed(1)},${b[1].toFixed(1)}`; };
function faintBase(ctx, L, M, o, base) {
  const s = L.style, { proj, unit } = o;
  for (const f of M.P.feats) if (f.polys.length) { ctx.beginPath(); pathPolys(ctx, f.polys, proj); ctx.globalAlpha = base * 0.28; ctx.fillStyle = '#c9ccd2'; ctx.fill('evenodd'); ctx.globalAlpha = base * 0.5; ctx.strokeStyle = s.stroke || '#fff'; ctx.lineWidth = Math.max(0.3, +s.strokeWidth || 0.6) * 0.7 * unit; ctx.stroke(); }
}
function drawMore(ctx, L, M, o, u, base, phase, colorOf) {
  const s = L.style, type = M.type, feats = M.P.feats, { proj, unit } = o, below = phase === 'below';
  if (phase === 'captions') return;
  if (below && s.baseMap !== false && type !== 'isolines') faintBase(ctx, L, M, o, base);
  if (type === 'spike' && !below) {
    const mx = Math.max(Math.abs(M.max), Math.abs(M.min)) || 1, Hm = (+s.spikeHeight || 140) * unit, w = (+s.spikeWidth || 8) * unit;
    const items = [];
    feats.forEach((f, i) => { const v = M.vals[i]; if (!isFinite(v) || !f.c) return; const q = proj(f.c); if (!isFinite(q[0])) return; items.push({ i, q, h: Hm * Math.abs(v) / mx }); });
    items.sort((a, b) => a.q[1] - b.q[1]);
    for (const it of items) {
      const a = appear(L, M, it.i, u, feats[it.i], o) * base; if (a <= 0) continue;
      const h = it.h * (L.anim === 'none' ? 1 : easeOut(Math.min(1, a * 1.2))), [x, y] = it.q, col = colorOf(it.i);
      const g = ctx.createLinearGradient(x, y, x, y - h); g.addColorStop(0, rgba(col, 0.95)); g.addColorStop(1, rgba(col, 0.4));
      ctx.globalAlpha = a * (+s.opacity || 0.9);
      ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x, y - h); ctx.lineTo(x + w / 2, y); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
      if (+s.strokeWidth > 0) { ctx.strokeStyle = rgba(col, 1); ctx.lineWidth = Math.max(0.5, +s.strokeWidth) * 0.8 * unit; ctx.stroke(); }
      ctx.globalAlpha = a * 0.5; ctx.beginPath(); ctx.ellipse(x, y, w * 0.7, w * 0.22, 0, 0, Math.PI * 2); ctx.fillStyle = '#000'; ctx.fill();
    }
    spikeLabels(ctx, L, M, o, u, base, items);
  }
  if (type === 'dorling' && !below) {
    const mx = Math.max(Math.abs(M.max), Math.abs(M.min)) || 1, Rm = (+s.maxSize || 34) * unit * 1.25;
    const key = `${projKey(o)}|${Rm.toFixed(1)}|${M.vals.length}|${M.field}`;
    let lay = M._dorling?.key === key ? M._dorling.lay : null;
    if (!lay) {
      lay = []; feats.forEach((f, i) => { const v = M.vals[i]; if (!isFinite(v) || !f.c) return; const q = proj(f.c); if (!isFinite(q[0])) return; lay.push({ i, x: q[0], y: q[1], x0: q[0], y0: q[1], r: Math.max(1.5 * unit, Rm * Math.sqrt(Math.abs(v) / mx)) }); });
      const pad = 1.2 * unit;
      for (let it = 0; it < 90; it++) {
        for (let a = 0; a < lay.length; a++) for (let b = a + 1; b < lay.length; b++) {
          const A = lay[a], B = lay[b], dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 0.01, need = A.r + B.r + pad;
          if (d < need) { const m = (need - d) / d * 0.5, wa = B.r / (A.r + B.r), wb = A.r / (A.r + B.r); A.x -= dx * m * wa; A.y -= dy * m * wa; B.x += dx * m * wb; B.y += dy * m * wb; }
        }
        for (const c of lay) { c.x += (c.x0 - c.x) * 0.04; c.y += (c.y0 - c.y) * 0.04; }
      }
      M._dorling = { key, lay };
    }
    const order = lay.slice().sort((a, b) => b.r - a.r);
    const nf = s.labelField || M.P.nameField;
    for (const c of order) {
      const f = feats[c.i], a = appear(L, M, c.i, u, f, o) * base; if (a <= 0) continue;
      const k = L.anim === 'none' ? 1 : easeOut(Math.min(1, a * 1.2)), r = c.r * k;
      ctx.globalAlpha = a * (+s.opacity || 0.9); ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fillStyle = colorOf(c.i); ctx.fill();
      if (+s.strokeWidth > 0) { ctx.globalAlpha = a; ctx.strokeStyle = s.stroke || '#fff'; ctx.lineWidth = Math.max(0.5, +s.strokeWidth) * unit; ctx.stroke(); }
      if (s.labels && s.labels !== 'none' && r > 11 * unit) {
        const name = String(f.p[nf] ?? ''), val = fmtNum(M.vals[c.i], s.decimals);
        const txt = s.labels === 'value' ? [val] : s.labels === 'name' ? [name] : [name, val];
        const fs = clamp(r * 0.36, 7 * unit, 16 * unit) * (+s.labelSize || 1);
        ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = s.labelColor || '#fff';
        txt.forEach((t, j) => { ctx.font = `${j ? 500 : 700} ${fs * (j ? 0.85 : 1)}px ${UI}`; let tt = t; while (tt.length > 3 && ctx.measureText(tt).width > r * 1.8) tt = tt.slice(0, -2); if (tt !== t) tt = tt.replace(/.$/, '…'); ctx.fillText(tt, c.x, c.y + (j - (txt.length - 1) / 2) * fs * 1.05); });
      }
    }
  }
  if (type === 'hexbin' && below) {
    const R = (+s.hexSize || 22) * unit, hw = Math.sqrt(3) * R, bins = new Map();
    feats.forEach((f, i) => {
      const v = M.vals[i];
      for (const p of (f.pts.length ? f.pts : f.c ? [f.c] : [])) {
        const q = proj(p); if (!isFinite(q[0])) continue;
        // pixel → axial (pointy-top), then round
        const qx = (Math.sqrt(3) / 3 * q[0] - q[1] / 3) / R, ry = (2 / 3 * q[1]) / R;
        let cx = qx, cz = ry, cy = -cx - cz; let rx = Math.round(cx), rz = Math.round(cz), ryy = Math.round(cy);
        const dx = Math.abs(rx - cx), dz = Math.abs(rz - cz), dy = Math.abs(ryy - cy);
        if (dx > dy && dx > dz) rx = -ryy - rz; else if (dy <= dz) rz = -rx - ryy;
        const k = `${rx},${rz}`; let b = bins.get(k); if (!b) { b = { rx, rz, n: 0, sum: 0, first: i }; bins.set(k, b); }
        b.n++; if (isFinite(v)) b.sum += v;
      }
    });
    const arr = [...bins.values()].map((b) => ({ ...b, v: s.hexAgg === 'sum' ? b.sum : s.hexAgg === 'mean' ? b.sum / b.n : b.n }));
    const vs = arr.map((b) => b.v).filter(isFinite), mn = Math.min(...vs), mx = Math.max(...vs);
    hexState.set(L.id, { min: isFinite(mn) ? mn : 0, max: isFinite(mx) ? mx : 1 });
    arr.sort((a, b) => a.v - b.v);
    arr.forEach((b, j) => {
      const t = mx > mn ? (b.v - mn) / (mx - mn) : 1;
      const a = (L.anim === 'grow' || L.anim === 'classes' ? clamp((u - (j / Math.max(1, arr.length)) * 0.7) / 0.3, 0, 1) : L.anim === 'none' ? 1 : u) * base; if (a <= 0) return;
      const x = R * Math.sqrt(3) * (b.rx + b.rz / 2), y = R * 1.5 * b.rz, rr0 = R * 0.94 * (L.anim === 'none' ? 1 : easeOut(a));
      ctx.beginPath(); for (let k = 0; k < 6; k++) { const an = Math.PI / 180 * (60 * k - 30); const px = x + rr0 * Math.cos(an), py = y + rr0 * Math.sin(an); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath();
      const c = rampAt(s.scheme || 'YlOrRd', 0.15 + 0.85 * (s.reverse ? 1 - t : t));
      ctx.globalAlpha = a * (+s.opacity || 0.85); ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.fill();
      if (+s.strokeWidth > 0) { ctx.globalAlpha = a * 0.7; ctx.strokeStyle = s.stroke || '#fff'; ctx.lineWidth = +s.strokeWidth * unit; ctx.stroke(); }
      if (s.labels && s.labels !== 'none' && R > 14 * unit) { ctx.globalAlpha = a; ctx.font = `700 ${R * 0.5 * (+s.labelSize || 1)}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = t > 0.55 ? '#fff' : '#1b1f27'; ctx.fillText(fmtNum(b.v, s.decimals), x, y); }
      void hw;
    });
  }
  if (type === 'isolines' && below) drawIsolines(ctx, L, M, o, u, base);
}
function spikeLabels(ctx, L, M, o, u, base, items) {
  const s = L.style; if (!s.labels || s.labels === 'none') return;
  const nf = s.labelField || M.P.nameField, unit = o.unit * (+s.labelSize || 1);
  const top = items.slice().sort((a, b) => b.h - a.h).slice(0, 12);
  for (const it of top) {
    const f = M.P.feats[it.i], a = appear(L, M, it.i, u, f, o) * base; if (a < 0.3) continue;
    const name = String(f.p[nf] ?? ''), val = fmtNum(M.vals[it.i], s.decimals);
    const t = s.labels === 'name' ? name : s.labels === 'value' ? val : `${name} ${val}`;
    ctx.globalAlpha = a; ctx.font = `700 ${11 * unit}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3 * unit; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.strokeText(t, it.q[0], it.q[1] - it.h - 4 * unit); ctx.fillStyle = s.labelColor || '#fff'; ctx.fillText(t, it.q[0], it.q[1] - it.h - 4 * unit);
  }
}
function drawIsolines(ctx, L, M, o, u, base) {
  const s = L.style, fr = o.frame; if (!fr) return;
  const unit = o.unit, cell = Math.max(4, Math.round(9 * unit));
  const pts = [];
  M.P.feats.forEach((f, i) => { const v = M.vals[i]; if (!isFinite(v)) return; for (const p of (f.pts.length ? f.pts : f.c ? [f.c] : [])) { const q = o.proj(p); if (isFinite(q[0])) pts.push([q[0], q[1], v]); } });
  if (pts.length < 3) return;
  const nx = Math.ceil(fr.w / cell) + 1, ny = Math.ceil(fr.h / cell) + 1, reach = (+s.isoReach || 150) * unit;
  const key = `${projKey(o)}|${nx}x${ny}|${reach}|${pts.length}|${M.field}`;
  let G = M._iso?.key === key ? M._iso.G : null;
  if (!G) {
    G = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = fr.x + i * cell, y = fr.y + j * cell; let num0 = 0, den = 0, near = Infinity, exact = NaN;
      for (const p of pts) { const d2 = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d2 < 1) { exact = p[2]; break; } const w = 1 / (d2 * d2 ** 0.25); num0 += w * p[2]; den += w; if (d2 < near) near = d2; }
      G[j * nx + i] = isFinite(exact) ? exact : Math.sqrt(near) > reach ? NaN : num0 / den;
    }
    M._iso = { key, G };
  }
  const br = M.br, nc = M.nc, a = (L.anim === 'none' ? 1 : u) * base;
  const clsOf = (v) => classOf(v, br);
  // filled bands (cell by cell, smoothed by drawing a small image scaled up)
  if (s.isoBands !== false) {
    const [c, g] = off(`iso:${L.id}`, nx, ny), im = g.createImageData(nx, ny), d = im.data;
    const cols = M.colors.map(rgbOf);
    for (let k = 0; k < G.length; k++) { const v = G[k]; if (!isFinite(v)) continue; const ci = clsOf(v); if (ci < 0) continue; const col = cols[Math.min(ci, cols.length - 1)]; d[k * 4] = col[0]; d[k * 4 + 1] = col[1]; d[k * 4 + 2] = col[2]; d[k * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
    ctx.save(); ctx.globalAlpha = a * (+s.opacity || 0.85) * 0.85; ctx.imageSmoothingEnabled = true; ctx.filter = `blur(${Math.round(cell * 0.45)}px)`;
    ctx.drawImage(c, 0, 0, nx, ny, fr.x - cell / 2, fr.y - cell / 2, nx * cell, ny * cell); ctx.restore();
  }
  // contour lines (marching squares) at each class break
  if (s.isoLines !== false) {
    const lv = br.slice(1, -1);
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = s.stroke || '#fff'; ctx.lineWidth = Math.max(0.6, +s.strokeWidth || 0.6) * 1.4 * unit; ctx.lineJoin = 'round';
    const labelsAt = [];
    for (const L0 of lv) {
      ctx.beginPath(); const segs = [];
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const v0 = G[j * nx + i], v1 = G[j * nx + i + 1], v2 = G[(j + 1) * nx + i + 1], v3 = G[(j + 1) * nx + i];
        if (!isFinite(v0) || !isFinite(v1) || !isFinite(v2) || !isFinite(v3)) continue;
        const x = fr.x + i * cell, y = fr.y + j * cell, e = [];
        const cut = (va, vb, xa, ya, xb, yb) => { if ((va < L0) !== (vb < L0)) { const t = (L0 - va) / (vb - va); e.push([xa + (xb - xa) * t, ya + (yb - ya) * t]); } };
        cut(v0, v1, x, y, x + cell, y); cut(v1, v2, x + cell, y, x + cell, y + cell); cut(v3, v2, x, y + cell, x + cell, y + cell); cut(v0, v3, x, y, x, y + cell);
        for (let k = 0; k + 1 < e.length; k += 2) { ctx.moveTo(e[k][0], e[k][1]); ctx.lineTo(e[k + 1][0], e[k + 1][1]); segs.push(e[k]); }
      }
      ctx.stroke();
      if (s.isoLabels !== false && segs.length > 6) {
        let placed = 0;
        for (let k = Math.floor(segs.length / 3); k < segs.length && placed < 2; k += Math.max(1, Math.floor(segs.length / 2.5))) {
          const p = segs[k]; if (labelsAt.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 120 * unit)) continue;
          labelsAt.push(p); placed++;
          const t = fmtNum(L0, s.decimals); ctx.font = `700 ${10.5 * unit * (+s.labelSize || 1)}px ${UI}`; const w = ctx.measureText(t).width + 8 * unit;
          ctx.fillStyle = 'rgba(14,18,26,0.85)'; rr(ctx, p[0] - w / 2, p[1] - 8 * unit, w, 16 * unit, 8 * unit); ctx.fill();
          ctx.fillStyle = s.labelColor || '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, p[0], p[1] + 0.5 * unit);
        }
      }
    }
    ctx.restore();
  }
  if (s.isoPoints !== false) {
    ctx.save(); ctx.globalAlpha = a;
    for (const p of pts) { ctx.beginPath(); ctx.arc(p[0], p[1], 2.4 * unit, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 1 * unit; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke(); }
    if (s.labels && s.labels !== 'none') {
      const nf = s.labelField || M.P.nameField; ctx.font = `600 ${10 * unit * (+s.labelSize || 1)}px ${UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      M.P.feats.forEach((f, i) => { const v = M.vals[i]; if (!isFinite(v) || !f.c) return; const q = o.proj(f.c); const t = s.labels === 'value' ? fmtNum(v, s.decimals) : s.labels === 'name' ? String(f.p[nf] ?? '') : `${f.p[nf] ?? ''} ${fmtNum(v, s.decimals)}`; ctx.lineWidth = 3 * unit; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(t, q[0] + 5 * unit, q[1]); ctx.fillStyle = '#fff'; ctx.fillText(t, q[0] + 5 * unit, q[1]); });
    }
    ctx.restore();
  }
}

// ================================================================= legend (shared with the map-layout legend)
/** What a thematic layer shows in a legend. */
export function legendSpec(L) {
  if (!TH_SET.has(L.kind)) return null;
  const s = L.style, M = modelOf(L);
  const d = s.decimals;
  const title = s.legendTitle || (M.type === 'unique' ? M.cat : M.type === 'bivariate' ? `${M.field} × ${M.field2}` : M.type === 'dotdensity' && M.dfields.length > 1 ? 'Dot density' : M.field + (s.norm ? ` per ${s.normMul && +s.normMul !== 1 ? s.normMul + ' ' : ''}${s.norm}` : ''));
  const sp = { title: String(title || '').replace(/_/g, ' '), rows: [] };
  if (M.type === 'choropleth' || M.type === 'gradcolor') {
    const sw = M.P.feats.some((f) => f.polys.length) ? 'fill' : M.P.feats.some((f) => f.lines.length) && !M.P.feats.some((f) => f.pts.length) ? 'line' : 'circle';
    for (let i = 0; i < M.nc; i++) sp.rows.push({ sw, color: M.colors[i], text: `${fmtNum(M.br[i], d)} – ${fmtNum(M.br[i + 1], d)}` });
    if (M.type === 'choropleth' && M.vals.some((v) => !isFinite(v))) sp.rows.push({ sw: 'fill', color: s.noData, text: 'No data' });
  } else if (M.type === 'gradsym') {
    for (let i = 0; i < M.nc; i++) { const k = M.nc > 1 ? i / (M.nc - 1) : 1; sp.rows.push({ sw: 'sym', shape: s.symShape, r: (+s.minSize || 4) + k * ((+s.maxSize || 34) - (+s.minSize || 4)), color: s.symColor, text: `${fmtNum(M.br[i], d)} – ${fmtNum(M.br[i + 1], d)}` }); }
  } else if (M.type === 'propsym') {
    const mx = Math.max(Math.abs(M.max), Math.abs(M.min)) || 1;
    const nice = (v) => { const p = 10 ** Math.floor(Math.log10(v)); const k = v / p; return (k >= 5 ? 5 : k >= 2 ? 2 : 1) * p; };
    const vals = [nice(mx), nice(mx / 4), nice(mx / 16)].filter((v, i, a) => v > 0 && a.indexOf(v) === i);
    sp.nested = { color: s.symColor, shape: s.symShape, items: vals.map((v) => ({ r: (+s.maxSize || 34) * Math.sqrt(v / mx), text: fmtNum(v, d) })) };
  } else if (M.type === 'dotdensity') {
    M.dfields.forEach((f, i) => sp.rows.push({ sw: 'dot', color: M.dcolors[i % M.dcolors.length], text: M.dfields.length > 1 ? f.replace(/_/g, ' ') : `1 dot = ${fmtNum(M.perDot)}` }));
    if (M.dfields.length > 1) sp.rows.push({ sw: 'none', text: `1 dot = ${fmtNum(M.perDot)}` });
  } else if (M.type === 'unique') {
    M.cats.slice(0, 10).forEach((k) => sp.rows.push({ sw: M.P.feats.some((f) => f.polys.length) ? 'fill' : 'circle', color: M.catColor.get(k), text: k }));
    if (M.cats.length > 10) sp.rows.push({ sw: 'fill', color: '#9aa0a8', text: `Other (${M.cats.length - 10})` });
  } else if (M.type === 'bivariate') {
    sp.bivar = { colors: M.colors, a: M.field.replace(/_/g, ' '), b: M.field2.replace(/_/g, ' ') };
  } else if (M.type === 'heat') {
    sp.grad = { scheme: s.heatScheme || 'Heat', lo: 'Low', hi: 'High' };
  } else if (M.type === 'spike' || M.type === 'dorling' || M.type === 'isolines') {
    for (let i = 0; i < M.nc; i++) sp.rows.push({ sw: M.type === 'dorling' ? 'circle' : 'fill', color: M.colors[i], text: `${fmtNum(M.br[i], d)} – ${fmtNum(M.br[i + 1], d)}` });
  } else if (M.type === 'hexbin') {
    const hx = hexState.get(L.id);
    sp.grad = { scheme: s.scheme || 'YlOrRd', lo: hx ? fmtNum(hx.min, d) : 'Few', hi: hx ? fmtNum(hx.max, d) : 'Many', reverse: !!s.reverse };
    if (s.legendTitle === '' || !s.legendTitle) sp.title = s.hexAgg === 'sum' ? `Sum of ${M.field}`.replace(/_/g, ' ') : s.hexAgg === 'mean' ? `Average ${M.field}`.replace(/_/g, ' ') : 'Points per hexagon';
  }
  return sp;
}
const THEMES = {
  light: { bg: 'rgba(255,255,255,0.94)', ink: '#1b1f27', sub: '#4a5260', line: 'rgba(0,0,0,0.12)', shadow: true },
  dark: { bg: 'rgba(14,18,26,0.82)', ink: '#ffffff', sub: '#c5ccd8', line: 'rgba(255,255,255,0.14)', shadow: true },
  clear: { bg: null, ink: '#ffffff', sub: '#e8ecf2', line: 'rgba(255,255,255,0.3)', shadow: false, halo: true },
};
/**
 * Lays out legend sections. specs: [{ title, rows:[{sw, color, text, r, shape}], nested, bivar, grad }].
 * opts: { theme, heading, cols }. Returns { w, h, paint(x, y) }.
 */
export function measureLegend(ctx, specs, unit, opts = {}) {
  const th = THEMES[opts.theme] || THEMES.light;
  const pad = 14 * unit, gap = 12 * unit, fs = 12.5 * unit, rowH = 21 * unit, sw = 22 * unit;
  const parts = [];
  ctx.save();
  const tw = (t, f) => { ctx.font = f; return ctx.measureText(t).width; };
  let W = 0, Hh = 0;
  if (opts.heading) { const w = tw(opts.heading, `800 ${16 * unit}px ${UI}`); parts.push({ type: 'heading', h: 26 * unit }); W = Math.max(W, w); Hh += 26 * unit; }
  for (const sp of specs) {
    if (sp.title) { const w = tw(sp.title, `700 ${13.5 * unit}px ${UI}`); W = Math.max(W, w); parts.push({ type: 'title', text: sp.title, h: 22 * unit }); Hh += 22 * unit; }
    for (const r of sp.rows || []) {
      const big = r.sw === 'sym' ? Math.max(rowH, (r.r * 2 + 6) * unit) : rowH;
      const w = (r.sw === 'none' ? 0 : (r.sw === 'sym' ? Math.max(sw, (r.r * 2 + 4) * unit) : sw) + 10 * unit) + tw(r.text, `500 ${fs}px ${UI}`);
      W = Math.max(W, w); parts.push({ type: 'row', r, h: big, swW: r.sw === 'sym' ? Math.max(sw, (r.r * 2 + 4) * unit) : sw }); Hh += big;
    }
    if (sp.nested) {
      const R = Math.max(...sp.nested.items.map((x) => x.r)) * unit;
      const w = R * 2 + 16 * unit + Math.max(...sp.nested.items.map((x) => tw(x.text, `500 ${fs}px ${UI}`)));
      W = Math.max(W, w); parts.push({ type: 'nested', n: sp.nested, h: R * 2 + 10 * unit, R }); Hh += R * 2 + 10 * unit;
    }
    if (sp.bivar) { const g = 3 * 22 * unit; W = Math.max(W, g + 70 * unit); parts.push({ type: 'bivar', b: sp.bivar, h: g + 46 * unit, g }); Hh += g + 46 * unit; }
    if (sp.grad) { W = Math.max(W, 160 * unit); parts.push({ type: 'grad', g: sp.grad, h: 34 * unit }); Hh += 34 * unit; }
    Hh += gap;
  }
  for (const it of opts.extra || []) { const w = sw + 10 * unit + tw(it.text, `500 ${fs}px ${UI}`); W = Math.max(W, w); parts.push({ type: 'row', r: it, h: rowH, swW: sw }); Hh += rowH; }
  ctx.restore();
  Hh = Hh - (specs.length && !(opts.extra || []).length ? gap : 0) + pad * 2; W += pad * 2;
  return {
    w: W, h: Hh,
    paint(x, y) {
      ctx.save();
      if (th.bg) { if (th.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 14 * unit; ctx.shadowOffsetY = 3 * unit; } rr(ctx, x, y, W, Hh, 8 * unit); ctx.fillStyle = th.bg; ctx.fill(); ctx.shadowColor = 'transparent'; }
      if (th.halo) { ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 4 * unit; }
      let cy = y + pad;
      const cx = x + pad;
      for (const p of parts) {
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        if (p.type === 'heading') { ctx.fillStyle = th.ink; ctx.font = `800 ${16 * unit}px ${UI}`; ctx.fillText(opts.heading, cx, cy + p.h * 0.42); }
        else if (p.type === 'title') { ctx.fillStyle = th.ink; ctx.font = `700 ${13.5 * unit}px ${UI}`; ctx.fillText(p.text, cx, cy + p.h * 0.45); }
        else if (p.type === 'row') {
          const r = p.r, my = cy + p.h / 2;
          if (r.sw !== 'none') swatch(ctx, r, cx, my, p.swW, unit, th);
          ctx.fillStyle = th.sub; ctx.font = `500 ${fs}px ${UI}`; ctx.fillText(r.text, cx + (r.sw === 'none' ? 0 : p.swW + 10 * unit), my);
        } else if (p.type === 'nested') {
          const bx = cx + p.R, by = cy + p.h - 5 * unit;
          for (const it of p.n.items) {
            const r = it.r * unit;
            symbolPath(ctx, p.n.shape === 'square' ? 'circle' : p.n.shape, bx, by - r, r);
            ctx.fillStyle = hexA(p.n.color || '#e8553b', 0.25); ctx.fill(); ctx.strokeStyle = th.ink; ctx.lineWidth = 1 * unit; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(bx, by - r * 2); ctx.lineTo(bx + p.R + 8 * unit, by - r * 2); ctx.setLineDash([2 * unit, 2 * unit]); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = th.sub; ctx.font = `500 ${fs}px ${UI}`; ctx.fillText(it.text, bx + p.R + 12 * unit, by - r * 2);
          }
        } else if (p.type === 'bivar') {
          const c = 22 * unit, gx = cx + 22 * unit, gy = cy + 6 * unit;
          for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) { ctx.fillStyle = p.b.colors[b * 3 + a]; ctx.fillRect(gx + a * c, gy + (2 - b) * c, c - 1, c - 1); }
          ctx.strokeStyle = th.ink; ctx.fillStyle = th.ink; ctx.lineWidth = 1.4 * unit;
          const arrow = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); const an = Math.atan2(y2 - y1, x2 - x1); ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 6 * unit * Math.cos(an - 0.5), y2 - 6 * unit * Math.sin(an - 0.5)); ctx.lineTo(x2 - 6 * unit * Math.cos(an + 0.5), y2 - 6 * unit * Math.sin(an + 0.5)); ctx.fill(); };
          arrow(gx, gy + 3 * c + 6 * unit, gx + 3 * c + 6 * unit, gy + 3 * c + 6 * unit);
          arrow(gx - 6 * unit, gy + 3 * c, gx - 6 * unit, gy - 6 * unit);
          ctx.font = `600 ${11 * unit}px ${UI}`; ctx.fillStyle = th.sub; ctx.textAlign = 'left';
          ctx.fillText(`${p.b.a} →`, gx, gy + 3 * c + 20 * unit);
          ctx.save(); ctx.translate(gx - 14 * unit, gy + 3 * c); ctx.rotate(-Math.PI / 2); ctx.fillText(`${p.b.b} →`, 0, 0); ctx.restore();
        } else if (p.type === 'grad') {
          const gw = W - pad * 2, gr = ctx.createLinearGradient(cx, 0, cx + gw, 0);
          for (let i = 0; i <= 10; i++) { const c = rampAt(p.g.scheme, 0.15 + (i / 10) * 0.85); gr.addColorStop(i / 10, `rgb(${c.map(Math.round).join(',')})`); }
          ctx.fillStyle = gr; ctx.fillRect(cx, cy + 4 * unit, gw, 12 * unit);
          ctx.fillStyle = th.sub; ctx.font = `500 ${11 * unit}px ${UI}`; ctx.fillText(p.g.lo, cx, cy + 26 * unit); ctx.textAlign = 'right'; ctx.fillText(p.g.hi, cx + gw, cy + 26 * unit);
        }
        cy += p.h;
        if (p.type !== 'heading' && p.type !== 'title' && p.type !== 'row') cy += 0;
      }
      ctx.restore();
    },
  };
}
function swatch(ctx, r, cx, my, w, unit, th) {
  const c = r.color || '#888';
  if (r.sw === 'fill') { ctx.fillStyle = c; ctx.fillRect(cx, my - 7 * unit, w, 14 * unit); ctx.strokeStyle = th.line; ctx.lineWidth = 1; ctx.strokeRect(cx, my - 7 * unit, w, 14 * unit); }
  else if (r.sw === 'line') { ctx.strokeStyle = c; ctx.lineWidth = (r.width || 3.5) * unit; ctx.lineCap = 'round'; if (r.dash) ctx.setLineDash([6 * unit, 4 * unit]); ctx.beginPath(); ctx.moveTo(cx + 2 * unit, my); ctx.lineTo(cx + w - 2 * unit, my); ctx.stroke(); ctx.setLineDash([]); }
  else if (r.sw === 'circle' || r.sw === 'point') { ctx.beginPath(); ctx.arc(cx + w / 2, my, 6 * unit, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = th.line; ctx.lineWidth = 1; ctx.stroke(); }
  else if (r.sw === 'dot') { ctx.beginPath(); ctx.arc(cx + w / 2, my, 3 * unit, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); }
  else if (r.sw === 'sym') { symbolPath(ctx, r.shape, cx + w / 2, my, r.r * unit); ctx.fillStyle = hexA(c, 0.85); ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke(); }
}
/** Data extent of a thematic / chart layer (for zooming to it). */
export function thematicBounds(L) {
  const P = prepared(L);
  let w = 180, s = 90, e = -180, n = -90, any = false;
  for (const f of P.feats) {
    const add = ([x, y]) => { if (!isFinite(x) || !isFinite(y)) return; any = true; w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); };
    f.polys.forEach((p) => p[0].forEach(add)); f.lines.forEach((l) => l.forEach(add)); f.pts.forEach(add);
  }
  return { loading: P.loading, bbox: any ? [w, s, e, n] : null };
}
