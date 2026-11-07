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
};
export const TH_KINDS = { thematic: { name: 'Thematic map', icon: '🗺', geom: null, desc: 'Choropleth, graduated colours or symbols, proportional symbols, dot density, bivariate, categories or heat map from your CSV, GeoJSON, KML or shapefile' } };
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
  } },
};
const T = (L) => L.style.type || 'choropleth';
const usesClasses = (L) => ['choropleth', 'gradcolor', 'gradsym'].includes(T(L));
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
    ['style.scheme', 'Colour scheme', 'select', SCHEME_NAMES, (L) => ['choropleth', 'gradcolor'].includes(T(L))],
    ['style.heatScheme', 'Colour scheme', 'select', SCHEME_NAMES, (L) => T(L) === 'heat'],
    ['style.reverse', 'Reverse colours', 'switch', null, (L) => ['choropleth', 'gradcolor'].includes(T(L))],
    ['style.qual', 'Colours', 'select', QUAL_NAMES, (L) => T(L) === 'unique' || (T(L) === 'dotdensity' && L.style.fields)],
    ['style.bivar', 'Colours', 'select', BIVAR_NAMES, (L) => T(L) === 'bivariate'],
    ['style.symColor', 'Symbol colour', 'color', null, (L) => ['gradsym', 'propsym'].includes(T(L))],
    ['style.symShape', 'Symbol', 'select', { circle: 'Circle', square: 'Square', triangle: 'Triangle', diamond: 'Diamond' }, (L) => ['gradsym', 'propsym', 'gradcolor'].includes(T(L))],
    ['style.minSize', 'Smallest symbol (px)', 'range', [1, 40, 0.5], (L) => ['gradsym', 'gradcolor'].includes(T(L))],
    ['style.maxSize', 'Biggest symbol (px)', 'range', [4, 120, 1], (L) => ['gradsym', 'propsym'].includes(T(L))],
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
  if (['choropleth', 'gradcolor', 'gradsym'].includes(type)) {
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
  ctx.beginPath(); for (const l of f.lines) l.forEach((ll, k) => { const q = proj(ll); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke();
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
