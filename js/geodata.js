// Data for cartography: reads CSV / TSV, GeoJSON, TopoJSON, KML / KMZ, GPX and Esri shapefiles (.zip or .shp + .dbf + .prj),
// re-projects common projected shapefiles (UTM / Transverse Mercator, Lambert Conformal Conic, Web Mercator) to WGS 84,
// and gives the thematic maps and charts one table: { fields, numeric, rows: [{ p: props, g: geometry | null }] }.
// Also: classification (equal interval, quantile, natural breaks, standard deviation, manual) and colour schemes.
import { readLayerFile, unzipEntries } from './importers.js';

// ================================================================= table parsing
const cache = new Map();
const NUMRE = /^\s*[-+]?[$€£]?\s*[-+]?(\d{1,3}(,\d{3})+|\d*)(\.\d+)?\s*%?\s*$/;
/** Number from a cell ("1,234", "45%", "$12.5" → number), NaN when it is not a number. */
export function num(v) {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  const s = String(v).trim();
  if (!s || !NUMRE.test(s) || !/\d/.test(s)) return NaN;
  return parseFloat(s.replace(/[,$€£%\s]/g, ''));
}
function splitCSV(text) {
  const first = text.slice(0, 2000).split(/\r?\n/)[0] || '';
  const cnt = (c) => first.split(c).length - 1;
  const d = cnt('\t') > cnt(',') && cnt('\t') >= cnt(';') ? '\t' : cnt(';') > cnt(',') ? ';' : ',';
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === d) { row.push(cur.trim()); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur.trim()); cur = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}
const LATRE = /^(lat|latitude|y|lat_dd|latitude_dd|ycoord|y_coord|point_y)$/i;
const LONRE = /^(lon|lng|long|longitude|x|lon_dd|longitude_dd|xcoord|x_coord|point_x)$/i;
function wktPoint(s) { const m = /POINT\s*Z?\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)/i.exec(String(s || '')); return m ? [+m[1], +m[2]] : null; }

/** Parses data text (CSV or GeoJSON) into a table. Cached. */
export function parseTable(txt) {
  const key = String(txt || '');
  if (cache.has(key)) return cache.get(key);
  const out = { fields: [], numeric: [], rows: [], geo: { point: 0, line: 0, poly: 0 }, bbox: null };
  const t = key.trim();
  if (t) {
    if (t[0] === '{' || t[0] === '[') {
      try {
        let j = JSON.parse(t);
        if (j.type === 'Topology') j = topoToGeoJSON(j);
        const feats = j.type === 'FeatureCollection' ? j.features : j.type === 'Feature' ? [j] : Array.isArray(j) ? j : j.type ? [{ type: 'Feature', properties: {}, geometry: j }] : [];
        const fset = new Set();
        for (const f of feats) {
          if (!f) continue;
          const isRow = !f.type && !f.geometry && typeof f === 'object';
          const p = isRow ? { ...f } : { ...(f.properties || {}) };
          if (!isRow && f.id != null && p.id == null) p.id = f.id;
          let g = isRow ? null : f.geometry || null;
          if (isRow) { const la = Object.keys(p).find((k) => LATRE.test(k)), lo = Object.keys(p).find((k) => LONRE.test(k)); if (la && lo && isFinite(num(p[la])) && isFinite(num(p[lo]))) g = { type: 'Point', coordinates: [num(p[lo]), num(p[la])] }; }
          Object.keys(p).forEach((k) => fset.add(k));
          out.rows.push({ p, g });
        }
        out.fields = [...fset];
      } catch { /* not JSON */ }
    } else {
      const rows = splitCSV(t);
      if (rows.length) {
        let head = rows[0];
        const headLike = head.some((h) => isNaN(num(h)) && h !== '');
        if (!headLike) head = head.map((_, i) => `field${i + 1}`);
        head = head.map((h, i) => h || `field${i + 1}`);
        const body = headLike ? rows.slice(1) : rows;
        const iLat = head.findIndex((h) => LATRE.test(h)), iLon = head.findIndex((h) => LONRE.test(h));
        const iWkt = head.findIndex((h) => /^(wkt|geometry|geom|the_geom)$/i.test(h));
        for (const r of body) {
          const p = {};
          head.forEach((h, i) => { p[h] = r[i] ?? ''; });
          let g = null;
          if (iLat >= 0 && iLon >= 0) { const la = num(r[iLat]), lo = num(r[iLon]); if (isFinite(la) && isFinite(lo) && Math.abs(la) <= 90) g = { type: 'Point', coordinates: [lo, la] }; }
          else if (iWkt >= 0) { const c = wktPoint(r[iWkt]); if (c) g = { type: 'Point', coordinates: c }; }
          out.rows.push({ p, g });
        }
        out.fields = head;
      }
    }
    // numeric fields: most non-empty values are numbers
    for (const f of out.fields) {
      let n = 0, k = 0;
      for (const r of out.rows) { const v = r.p[f]; if (v === '' || v == null) continue; k++; if (isFinite(num(v))) n++; if (k > 400) break; }
      if (k && n / k > 0.8) out.numeric.push(f);
    }
    let w = 180, s = 90, e = -180, nn = -90, any = false;
    const visit = (c) => { if (typeof c[0] === 'number') { if (!isFinite(c[0]) || !isFinite(c[1])) return; any = true; w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); nn = Math.max(nn, c[1]); } else c.forEach(visit); };
    for (const r of out.rows) {
      const g = r.g; if (!g) continue;
      const ty = g.type || '';
      if (/Point/.test(ty)) out.geo.point++; else if (/Line/.test(ty)) out.geo.line++; else if (/Polygon/.test(ty)) out.geo.poly++;
      if (g.coordinates) visit(g.coordinates);
      else if (g.geometries) g.geometries.forEach((x) => x.coordinates && visit(x.coordinates));
    }
    if (any) out.bbox = [w, s, e, nn];
  }
  cache.set(key, out);
  if (cache.size > 24) cache.delete(cache.keys().next().value);
  return out;
}
/** Field names of the data (numeric only when asked). */
export function dataFields(txt, numericOnly = false) { const T = parseTable(txt); return numericOnly ? T.numeric : T.fields; }
/** Guess a good field: name-like, or the first numeric field. */
export function guessField(T, kind) {
  if (kind === 'name') return T.fields.find((f) => /^(name|country|admin|sovereignt|name_en|city|region|state|county|district|province|label|title|place)$/i.test(f)) || T.fields.find((f) => !T.numeric.includes(f)) || T.fields[0] || '';
  if (kind === 'date') return T.fields.find((f) => /date|time|day|when|timestamp/i.test(f)) || '';
  if (kind === 'cat') return T.fields.find((f) => !T.numeric.includes(f) && !/^(name|lat|lon|lng|latitude|longitude|wkt|geometry|date|time|datetime)$/i.test(f)) || '';
  return T.numeric.find((f) => !LATRE.test(f) && !LONRE.test(f) && !/^(id|fid|objectid|gid|ogc_fid|year)$/i.test(f)) || T.numeric[0] || '';
}

// ================================================================= TopoJSON
export function topoToGeoJSON(topo) {
  const tr = topo.transform;
  const arcs = topo.arcs.map((a) => {
    if (!tr) return a;
    let x = 0, y = 0;
    return a.map(([dx, dy]) => { x += dx; y += dy; return [x * tr.scale[0] + tr.translate[0], y * tr.scale[1] + tr.translate[1]]; });
  });
  const arc = (i) => (i >= 0 ? arcs[i] : arcs[~i].slice().reverse());
  const ring = (ids) => { const o = []; ids.forEach((i, k) => { const a = arc(i); o.push(...(k ? a.slice(1) : a)); }); return o; };
  const pt = (c) => (tr ? [c[0] * tr.scale[0] + tr.translate[0], c[1] * tr.scale[1] + tr.translate[1]] : c);
  const geom = (g) => {
    switch (g.type) {
      case 'Point': return { type: 'Point', coordinates: pt(g.coordinates) };
      case 'MultiPoint': return { type: 'MultiPoint', coordinates: g.coordinates.map(pt) };
      case 'LineString': return { type: 'LineString', coordinates: ring(g.arcs) };
      case 'MultiLineString': return { type: 'MultiLineString', coordinates: g.arcs.map(ring) };
      case 'Polygon': return { type: 'Polygon', coordinates: g.arcs.map(ring) };
      case 'MultiPolygon': return { type: 'MultiPolygon', coordinates: g.arcs.map((p) => p.map(ring)) };
      default: return null;
    }
  };
  const feats = [];
  for (const obj of Object.values(topo.objects || {})) {
    const list = obj.type === 'GeometryCollection' ? obj.geometries : [obj];
    for (const g of list) feats.push({ type: 'Feature', id: g.id, properties: g.properties || {}, geometry: geom(g) });
  }
  return { type: 'FeatureCollection', features: feats };
}

// ================================================================= shapefile (.shp + .dbf + .prj)
function readDBF(buf, cpg) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = dv.getUint32(4, true), hlen = dv.getUint16(8, true), rlen = dv.getUint16(10, true);
  const fields = [];
  for (let p = 32; p < hlen - 1 && buf[p] !== 0x0d; p += 32) {
    let name = ''; for (let i = 0; i < 11 && buf[p + i]; i++) name += String.fromCharCode(buf[p + i]);
    fields.push({ name, type: String.fromCharCode(buf[p + 11]), len: buf[p + 16] });
  }
  let dec;
  const enc = /1252|latin|8859/i.test(cpg || '') ? 'windows-1252' : 'utf-8';
  try { dec = new TextDecoder(enc, { fatal: enc === 'utf-8' }); dec.decode(buf.subarray(hlen, Math.min(buf.length, hlen + rlen * 50))); } catch { dec = new TextDecoder('windows-1252'); }
  const rows = [];
  for (let r = 0; r < n; r++) {
    const base = hlen + r * rlen;
    if (base + rlen > buf.length) break;
    const o = {};
    let q = base + 1;
    for (const f of fields) {
      const raw = dec.decode(buf.subarray(q, q + f.len)).trim();
      q += f.len;
      if (f.type === 'N' || f.type === 'F') o[f.name] = raw === '' || /^\*+$/.test(raw) ? null : +raw;
      else if (f.type === 'L') o[f.name] = /^[YyTt]/.test(raw);
      else if (f.type === 'D' && /^\d{8}$/.test(raw)) o[f.name] = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      else o[f.name] = raw;
    }
    rows.push(o);
  }
  return rows;
}
const ringArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2; }; // > 0 = clockwise
function inRing(x, y, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) c = !c; } return c; }
function readSHP(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getInt32(0, false) !== 9994) throw new Error('That is not a valid .shp file');
  const geoms = [];
  let p = 100;
  while (p + 8 <= buf.byteLength) {
    const len = dv.getInt32(p + 4, false) * 2;
    const c = p + 8;
    p = c + len;
    if (len < 4 || p > buf.byteLength) { geoms.push(null); continue; }
    const type = dv.getInt32(c, true);
    const T = type % 10;
    if (type === 0) { geoms.push(null); continue; }
    if (T === 1) { geoms.push({ type: 'Point', coordinates: [dv.getFloat64(c + 4, true), dv.getFloat64(c + 12, true)] }); continue; }
    if (T === 8) {
      const np = dv.getInt32(c + 36, true), pts = [];
      for (let i = 0; i < np; i++) pts.push([dv.getFloat64(c + 40 + i * 16, true), dv.getFloat64(c + 48 + i * 16, true)]);
      geoms.push({ type: 'MultiPoint', coordinates: pts }); continue;
    }
    if (T === 3 || T === 5) {
      const nparts = dv.getInt32(c + 36, true), np = dv.getInt32(c + 40, true);
      const parts = []; for (let i = 0; i < nparts; i++) parts.push(dv.getInt32(c + 44 + i * 4, true));
      const p0 = c + 44 + nparts * 4;
      const rings = parts.map((s, i) => { const e = i + 1 < nparts ? parts[i + 1] : np; const r = []; for (let k = s; k < e; k++) r.push([dv.getFloat64(p0 + k * 16, true), dv.getFloat64(p0 + k * 16 + 8, true)]); return r; });
      if (T === 3) { geoms.push(rings.length === 1 ? { type: 'LineString', coordinates: rings[0] } : { type: 'MultiLineString', coordinates: rings }); continue; }
      const polys = [], holes = [];
      for (const r of rings) { if (r.length < 4) continue; (ringArea(r) >= 0 ? polys.push([r]) : holes.push(r)); }
      if (!polys.length) holes.forEach((h) => polys.push([h.slice().reverse()]));
      else for (const h of holes) { const host = polys.find((pp) => inRing(h[0][0], h[0][1], pp[0])) || polys[polys.length - 1]; host.push(h); }
      geoms.push(polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys }); continue;
    }
    geoms.push(null);
  }
  return geoms;
}

// ---------------------------------------------------------------- projections (from the .prj WKT)
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
function prjInverse(wkt) {
  if (!wkt || !/PROJCS|PROJCRS/i.test(wkt)) return null;
  const par = (name, d = 0) => { const m = new RegExp(`PARAMETER\\[\\s*"${name}"\\s*,\\s*(-?[\\d.eE+-]+)`, 'i').exec(wkt); return m ? +m[1] : d; };
  const proj = (/PROJECTION\[\s*"([^"]+)"/i.exec(wkt) || [])[1] || '';
  const sph = /SPHEROID\[\s*"[^"]*"\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(wkt);
  const a = sph ? +sph[1] : 6378137, rf = sph ? +sph[2] : 298.257223563;
  const f = rf ? 1 / rf : 0, e2 = f * (2 - f), e = Math.sqrt(e2);
  const um = [...wkt.matchAll(/UNIT\[\s*"([^"]*)"\s*,\s*([\d.eE+-]+)/gi)].at(-1);
  const uf = um && !/degree/i.test(um[1]) ? +um[2] : 1;
  const FE = par('false_easting') * uf, FN = par('false_northing') * uf;
  const lon0 = par('central_meridian', par('longitude_of_center', par('longitude_of_origin'))) * D2R;
  const lat0 = par('latitude_of_origin', par('latitude_of_center')) * D2R;
  const k0 = par('scale_factor', 1);
  if (/mercator_auxiliary|pseudo|popular_visual/i.test(proj) || (/^mercator/i.test(proj) && /auxiliary|WGS_1984_Web|3857/i.test(wkt))) {
    const R = a;
    return (x, y) => [((x * uf - FE) / R) * R2D + lon0 * R2D, (2 * Math.atan(Math.exp((y * uf - FN) / R)) - Math.PI / 2) * R2D];
  }
  if (/transverse_mercator|gauss/i.test(proj)) {
    const ep2 = e2 / (1 - e2), e4 = e2 * e2, e6 = e4 * e2;
    const M = (ph) => a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * ph - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * ph) + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * ph) - (35 * e6 / 3072) * Math.sin(6 * ph));
    const M0 = M(lat0), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    return (x, y) => {
      x = x * uf - FE; y = y * uf - FN;
      const Mv = M0 + y / k0, mu = Mv / (a * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));
      const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
      const s = Math.sin(p1), c = Math.cos(p1), tn = Math.tan(p1);
      const C1 = ep2 * c * c, T1 = tn * tn, N1 = a / Math.sqrt(1 - e2 * s * s), R1 = (a * (1 - e2)) / (1 - e2 * s * s) ** 1.5, D = x / (N1 * k0);
      const lat = p1 - ((N1 * tn) / R1) * (D * D / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
      const lon = lon0 + (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) / c;
      return [lon * R2D, lat * R2D];
    };
  }
  if (/lambert_conformal_conic/i.test(proj)) {
    const sp1 = par('standard_parallel_1', lat0 * R2D) * D2R, sp2 = par('standard_parallel_2', sp1 * R2D) * D2R;
    const m = (ph) => Math.cos(ph) / Math.sqrt(1 - e2 * Math.sin(ph) ** 2);
    const t = (ph) => Math.tan(Math.PI / 4 - ph / 2) / ((1 - e * Math.sin(ph)) / (1 + e * Math.sin(ph))) ** (e / 2);
    const n = Math.abs(sp1 - sp2) < 1e-10 ? Math.sin(sp1) : (Math.log(m(sp1)) - Math.log(m(sp2))) / (Math.log(t(sp1)) - Math.log(t(sp2)));
    const F = (m(sp1) / (n * t(sp1) ** n)) * k0, rho0 = a * F * t(lat0) ** n;
    return (x, y) => {
      x = x * uf - FE; y = rho0 - (y * uf - FN);
      const sg = Math.sign(n), rho = sg * Math.hypot(x, y), th = Math.atan2(sg * x, sg * y);
      const tt = (rho / (a * F)) ** (1 / n);
      let ph = Math.PI / 2 - 2 * Math.atan(tt);
      for (let i = 0; i < 8; i++) ph = Math.PI / 2 - 2 * Math.atan(tt * ((1 - e * Math.sin(ph)) / (1 + e * Math.sin(ph))) ** (e / 2));
      return [(th / n + lon0) * R2D, ph * R2D];
    };
  }
  throw new Error(`This shapefile uses the "${proj.replace(/_/g, ' ')}" projection. Please re-project it to WGS 84 (EPSG:4326) and load it again.`);
}
function mapCoords(g, fn) {
  const m = (c) => (typeof c[0] === 'number' ? fn(c) : c.map(m));
  return g ? { ...g, coordinates: m(g.coordinates) } : g;
}
// Douglas–Peucker to keep very big files light
function dp(pts, tol) {
  if (pts.length < 5) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-18;
    for (let i = a + 1; i < b; i++) { const [px, py] = pts[i]; const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)); const d = (px - ax - u * dx) ** 2 + (py - ay - u * dy) ** 2; if (d > md) { md = d; mi = i; } }
    if (mi > 0 && md > tol * tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function lighten(gj) {
  let n = 0;
  const cnt = (c) => { if (typeof c[0] === 'number') n++; else c.forEach(cnt); };
  for (const f of gj.features) if (f.geometry?.coordinates) cnt(f.geometry.coordinates);
  const tol = n > 400000 ? 0.004 : n > 150000 ? 0.0015 : n > 60000 ? 0.0005 : 0;
  const r6 = (c) => [Math.round(c[0] * 1e6) / 1e6, Math.round(c[1] * 1e6) / 1e6];
  const walk = (c, depth) => (typeof c[0][0] === 'number' ? (tol && c.length > 8 ? dp(c, tol) : c).map(r6) : c.map((x) => walk(x, depth + 1)));
  for (const f of gj.features) {
    const g = f.geometry; if (!g?.coordinates) continue;
    if (g.type === 'Point') g.coordinates = r6(g.coordinates);
    else if (g.type === 'MultiPoint') g.coordinates = g.coordinates.map(r6);
    else g.coordinates = walk(g.coordinates, 0);
  }
  return { gj, n, simplified: !!tol };
}
function shapefileToGeoJSON(shp, dbf, prj, cpg) {
  const geoms = readSHP(shp);
  const rows = dbf ? readDBF(dbf, cpg) : [];
  let inv = prj ? prjInverse(prj) : null;
  if (!inv && !prj) {
    const g = geoms.find(Boolean); const c = g && (g.type === 'Point' ? g.coordinates : JSON.stringify(g.coordinates).match(/-?[\d.]+,-?[\d.]+/)?.[0].split(',').map(Number));
    if (c && (Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90)) {
      if (Math.abs(c[0]) <= 20037509 && Math.abs(c[1]) <= 20037509) inv = prjInverse('PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]]],PROJECTION["Mercator_Auxiliary_Sphere"],UNIT["Meter",1.0]]');
      else throw new Error('The shapefile has projected coordinates but no .prj file — add the .prj file (or re-project it to WGS 84)');
    }
  }
  const feats = geoms.map((g, i) => ({ type: 'Feature', properties: rows[i] || {}, geometry: inv && g ? mapCoords(g, (c) => inv(c[0], c[1])) : g }));
  return { type: 'FeatureCollection', features: feats };
}

/** Reads one or more chosen files (CSV, GeoJSON, TopoJSON, KML/KMZ, GPX, zipped or loose shapefile) into data text. */
export async function readDataFiles(files) {
  files = [...files];
  const ext = (f) => (f.name.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
  const by = (e) => files.find((f) => ext(f) === e);
  const label = files.map((f) => f.name).join(' + ');
  let gj = null, text = null;
  const fromShp = async (shp, dbf, prj, cpg) => shapefileToGeoJSON(shp, dbf, prj, cpg);
  if (by('shp')) {
    gj = await fromShp(new Uint8Array(await by('shp').arrayBuffer()), by('dbf') ? new Uint8Array(await by('dbf').arrayBuffer()) : null, by('prj') ? await by('prj').text() : null, by('cpg') ? await by('cpg').text() : null);
  } else if (by('zip')) {
    const ent = await unzipEntries(await by('zip').arrayBuffer());
    const names = [...ent.keys()].filter((n) => !/__MACOSX|\/\._/.test(n));
    const shpN = names.find((n) => /\.shp$/i.test(n));
    if (shpN) {
      const base = shpN.slice(0, -4);
      const get = (e) => ent.get(names.find((n) => n.toLowerCase() === `${base}.${e}`.toLowerCase()) || '');
      const dec = new TextDecoder();
      gj = await fromShp(ent.get(shpN), get('dbf') || null, get('prj') ? dec.decode(get('prj')) : null, get('cpg') ? dec.decode(get('cpg')) : null);
    } else {
      const inner = names.find((n) => /\.(geojson|json|csv|tsv|kml|gpx)$/i.test(n));
      if (!inner) throw new Error('No shapefile, GeoJSON, KML or CSV found inside the zip');
      const blob = new File([ent.get(inner)], inner.split('/').pop());
      return readDataFiles([blob]);
    }
  } else {
    const f = files[0];
    if (!f) throw new Error('No file chosen');
    const e = ext(f);
    if (['kml', 'kmz', 'gpx'].includes(e)) gj = await readLayerFile(f);
    else {
      const t = await f.text();
      const s = t.trim();
      if (s[0] === '{' || s[0] === '[') {
        const j = JSON.parse(s);
        gj = j.type === 'Topology' ? topoToGeoJSON(j) : j;
        if (Array.isArray(gj)) return { text: s, name: label, note: '' };
      } else if (/<kml/i.test(s.slice(0, 500))) gj = await readLayerFile(f);
      else text = t;
    }
  }
  if (text != null) return { text, name: label, note: '' };
  if (gj && gj.type !== 'FeatureCollection') gj = gj.type === 'Feature' ? { type: 'FeatureCollection', features: [gj] } : { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: gj }] };
  const { n, simplified } = lighten(gj);
  return { text: JSON.stringify(gj), name: label, note: `${gj.features.length} features${simplified ? ` · simplified (${Math.round(n / 1000)}k points)` : ''}` };
}

// ================================================================= classification
export const CLASSIFY = { quantile: 'Quantile (same number in each class)', equal: 'Equal interval', jenks: 'Natural breaks (Jenks)', stddev: 'Standard deviation', pretty: 'Rounded (pretty) breaks', manual: 'Manual breaks' };
function jenks(data, k) {
  const n = data.length;
  const lower = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(0));
  const vari = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(Infinity));
  for (let i = 1; i <= k; i++) { lower[1][i] = 1; vari[1][i] = 0; }
  for (let l = 2; l <= n; l++) {
    let s1 = 0, s2 = 0, w = 0, v = 0;
    for (let m = 1; m <= l; m++) {
      const i3 = l - m + 1, val = data[i3 - 1];
      s2 += val * val; s1 += val; w++;
      v = s2 - (s1 * s1) / w;
      const i4 = i3 - 1;
      if (i4) for (let j = 2; j <= k; j++) if (vari[l][j] >= v + vari[i4][j - 1]) { lower[l][j] = i3; vari[l][j] = v + vari[i4][j - 1]; }
    }
    lower[l][1] = 1; vari[l][1] = v;
  }
  const br = new Array(k + 1); br[k] = data[n - 1]; br[0] = data[0];
  let c = n;
  for (let j = k; j >= 2; j--) { const id = lower[c][j] - 2; br[j - 1] = data[Math.max(0, id)]; c = lower[c][j] - 1; }
  return br;
}
const niceNum = (v) => { if (!v) return 0; const p = 10 ** Math.floor(Math.log10(Math.abs(v))); const f = Math.abs(v) / p; return Math.sign(v) * (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; };
/** Class breaks [min, b1, …, max] (n classes). */
export function breaksOf(values, method = 'quantile', n = 5, manual = '') {
  const v = values.filter(isFinite).sort((a, b) => a - b);
  if (!v.length) return [0, 1];
  const lo = v[0], hi = v[v.length - 1];
  n = Math.max(1, Math.min(12, Math.round(n) || 5));
  if (lo === hi) return [lo, hi];
  let br;
  if (method === 'manual') {
    const m = String(manual || '').split(/[\s,;]+/).map(Number).filter(isFinite).sort((a, b) => a - b).filter((x) => x > lo && x < hi);
    br = [lo, ...m, hi];
  } else if (method === 'equal') br = Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
  else if (method === 'jenks') {
    let d = v;
    if (v.length > 900) { d = []; for (let i = 0; i < 900; i++) d.push(v[Math.floor((i / 899) * (v.length - 1))]); }
    br = jenks(d, Math.min(n, d.length)); br[0] = lo; br[br.length - 1] = hi;
  } else if (method === 'stddev') {
    const mean = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length) || 1;
    br = [lo];
    const half = Math.floor((n - 1) / 2);
    for (let k = -half; k <= n - 2 - half; k++) { const b = mean + (k + (n % 2 ? 0.5 : 0)) * sd; if (b > lo && b < hi) br.push(b); }
    br.push(hi);
  } else if (method === 'pretty') {
    const step = niceNum((hi - lo) / n);
    br = [lo];
    for (let b = Math.ceil(lo / step) * step; b < hi; b += step) if (b > lo) br.push(b);
    br.push(hi);
  } else br = Array.from({ length: n + 1 }, (_, i) => v[Math.min(v.length - 1, Math.round((i / n) * (v.length - 1)))]);
  return br.filter((b, i) => i === 0 || b > br[i - 1] || i === br.length - 1 && b >= br[i - 1]).filter((b, i, a) => i === 0 || b !== a[i - 1]);
}
/** Class index of a value (0 … breaks.length − 2). */
export function classOf(v, br) {
  if (!isFinite(v)) return -1;
  for (let i = 1; i < br.length - 1; i++) if (v < br[i]) return i - 1;
  return Math.max(0, br.length - 2);
}

// ================================================================= colour schemes
export const SCHEMES = {
  // sequential (ColorBrewer)
  YlOrRd: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026'],
  Blues: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],
  Greens: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#006d2c', '#00441b'],
  Reds: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#a50f15', '#67000d'],
  Oranges: ['#fff5eb', '#fee6ce', '#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#a63603', '#7f2704'],
  Purples: ['#fcfbfd', '#efedf5', '#dadaeb', '#bcbddc', '#9e9ac8', '#807dba', '#6a51a3', '#54278f', '#3f007d'],
  YlGnBu: ['#ffffd9', '#edf8b1', '#c7e9b4', '#7fcdbb', '#41b6c4', '#1d91c0', '#225ea8', '#253494', '#081d58'],
  OrRd: ['#fff7ec', '#fee8c8', '#fdd49e', '#fdbb84', '#fc8d59', '#ef6548', '#d7301f', '#b30000', '#7f0000'],
  PuBuGn: ['#fff7fb', '#ece2f0', '#d0d1e6', '#a6bddb', '#67a9cf', '#3690c0', '#02818a', '#016c59', '#014636'],
  Greys: ['#ffffff', '#f0f0f0', '#d9d9d9', '#bdbdbd', '#969696', '#737373', '#525252', '#252525', '#000000'],
  Viridis: ['#440154', '#472d7b', '#3b528b', '#2c728e', '#21918c', '#28ae80', '#5ec962', '#addc30', '#fde725'],
  Magma: ['#000004', '#1c1044', '#4f127b', '#812581', '#b5367a', '#e55964', '#fb8761', '#fec287', '#fcfdbf'],
  Heat: ['#000000', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf', '#ffffff'],
  // diverging
  RdBu: ['#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac'],
  RdYlGn: ['#d73027', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850'],
  Spectral: ['#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#e6f598', '#abdda4', '#66c2a5', '#3288bd'],
  BrBG: ['#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#f5f5f5', '#c7eae5', '#80cdc1', '#35978f', '#01665e'],
  PiYG: ['#c51b7d', '#de77ae', '#f1b6da', '#fde0ef', '#f7f7f7', '#e6f5d0', '#b8e186', '#7fbc41', '#4d9221'],
};
export const QUAL = {
  Tableau: ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'],
  Set1: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf', '#999999'],
  Set2: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'],
  Paired: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928'],
  Pastel: ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6', '#ffffcc', '#e5d8bd', '#fddaec', '#f2f2f2'],
  Bold: ['#7f3c8d', '#11a579', '#3969ac', '#f2b701', '#e73f74', '#80ba5a', '#e68310', '#008695', '#cf1c90', '#f97b72'],
};
export const SCHEME_NAMES = {
  YlOrRd: 'Yellow → red', Blues: 'Blues', Greens: 'Greens', Reds: 'Reds', Oranges: 'Oranges', Purples: 'Purples', YlGnBu: 'Yellow → green → blue', OrRd: 'Orange → red', PuBuGn: 'Purple → blue → green', Greys: 'Greys', Viridis: 'Viridis', Magma: 'Magma', Heat: 'Heat (black → white)',
  RdBu: 'Diverging red ↔ blue', RdYlGn: 'Diverging red ↔ green', Spectral: 'Spectral', BrBG: 'Diverging brown ↔ teal', PiYG: 'Diverging pink ↔ green',
};
export const QUAL_NAMES = { Tableau: 'Tableau 10', Set1: 'Bright (Set 1)', Set2: 'Soft (Set 2)', Paired: 'Paired', Pastel: 'Pastel', Bold: 'Bold' };
export const BIVAR = {
  pinkblue: ['#e8e8e8', '#ace4e4', '#5ac8c8', '#dfb0d6', '#a5add3', '#5698b9', '#be64ac', '#8c62aa', '#3b4994'],
  tealred: ['#e8e8e8', '#e4acac', '#c85a5a', '#b0d5df', '#ad9ea5', '#985356', '#64acbe', '#627f8c', '#574249'],
  purplegold: ['#e8e8e8', '#e4d9ac', '#c8b35a', '#cbb8d7', '#c8ada0', '#af8e53', '#9972af', '#976b82', '#804d36'],
  greenblue: ['#e8e8e8', '#b5c0da', '#6c83b5', '#b8d6be', '#90b2b3', '#567994', '#73ae80', '#5a9178', '#2a5a5b'],
};
export const BIVAR_NAMES = { pinkblue: 'Pink ↔ blue (Stevens)', tealred: 'Teal ↔ red', purplegold: 'Purple ↔ gold', greenblue: 'Green ↔ blue' };
const hex2 = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/** n colours sampled along a scheme. */
export function rampN(name, n, reverse = false) {
  const st = SCHEMES[name] || SCHEMES.YlOrRd;
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.7 : (0.08 + (0.92 * i) / (n - 1)) * (st.length - 1);
    const a = Math.floor(Math.min(st.length - 2, k)), f = k - a, A = hex2(st[a]), B = hex2(st[a + 1]);
    out.push(`rgb(${Math.round(A[0] + (B[0] - A[0]) * f)},${Math.round(A[1] + (B[1] - A[1]) * f)},${Math.round(A[2] + (B[2] - A[2]) * f)})`);
  }
  return reverse ? out.reverse() : out;
}
/** Colour at 0…1 along a scheme, as [r,g,b]. */
export function rampAt(name, k) {
  const st = SCHEMES[name] || SCHEMES.YlOrRd;
  k = Math.max(0, Math.min(1, k)) * (st.length - 1);
  const a = Math.floor(Math.min(st.length - 2, k)), f = k - a, A = hex2(st[a]), B = hex2(st[a + 1]);
  return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f];
}
/** Short number: 1234567 → 1.23M. */
export function fmtNum(v, dec = null) {
  if (!isFinite(v)) return '–';
  const a = Math.abs(v);
  if (dec != null && dec !== '' && dec >= 0) return (+v).toLocaleString('en-US', { maximumFractionDigits: +dec, minimumFractionDigits: +dec });
  if (a >= 1e9) return `${+(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${+(v / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${+(v / 1e3).toFixed(1)}k`;
  if (a >= 100) return Math.round(v).toLocaleString('en-US');
  if (a >= 1) return `${+v.toFixed(1)}`;
  return `${+v.toPrecision(2)}`;
}

// ================================================================= sample data (approximate figures, for trying things out)
export const SAMPLE_WORLD = `country,continent,population_m,gdp_per_capita,life_expectancy,co2_per_capita,urban_pct,internet_pct
United States of America,North America,333,76300,77.5,14.9,83,92
Canada,North America,38.9,55500,81.7,14.3,82,94
Mexico,North America,128,11500,75,3.6,81,76
Brazil,South America,215,8900,75.5,2.2,87,81
Argentina,South America,46,13700,76.1,4.2,92,88
Chile,South America,19.6,15400,79.5,4.4,88,90
Colombia,South America,51.9,6600,77,1.8,82,73
Peru,South America,34,7100,76.7,1.7,79,75
Venezuela,South America,28.3,3800,72.5,3,88,62
United Kingdom,Europe,67,46100,81,4.7,84,97
France,Europe,68,40900,82.3,4.6,81,86
Germany,Europe,83.8,48700,80.7,8,78,92
Spain,Europe,47.6,29700,83.2,4.9,81,94
Italy,Europe,59,34100,83,5.4,72,85
Poland,Europe,37.8,18700,77.5,8.1,60,87
Sweden,Europe,10.5,56400,83,3.6,89,95
Norway,Europe,5.5,106100,83.2,7.4,84,99
Ukraine,Europe,38,4500,71.6,3.8,70,79
Russia,Europe,144,15300,72.8,12.1,75,90
Turkey,Asia,85,10600,76,5.1,77,83
Egypt,Africa,111,4300,70.2,2.3,43,72
Nigeria,Africa,218,2200,53.6,0.6,53,55
Ethiopia,Africa,123,1000,65,0.2,22,19
Kenya,Africa,54,2100,62.7,0.4,29,40
South Africa,Africa,60,6800,62.3,6.7,68,72
Algeria,Africa,45,4300,76.4,3.9,75,71
Morocco,Africa,37.5,3500,74.6,1.8,65,88
Dem. Rep. Congo,Africa,99,650,59.7,0.04,47,23
Tanzania,Africa,65,1200,66.2,0.2,37,32
Angola,Africa,35.6,3000,61.6,0.6,68,39
Sudan,Africa,46.9,1100,65.3,0.5,36,29
Saudi Arabia,Asia,36.4,30400,77.6,18.2,85,99
United Arab Emirates,Asia,9.4,53700,79.2,21.8,87,100
Iran,Asia,88.6,4400,74,7.8,77,79
Iraq,Asia,44.5,6000,71.3,4.1,71,79
Pakistan,Asia,235,1600,66.4,0.9,38,33
India,Asia,1417,2400,67.7,1.9,36,46
Bangladesh,Asia,171,2700,72.4,0.6,40,39
China,Asia,1412,12700,78.2,8.9,64,73
Japan,Asia,125,33800,84.5,8.5,92,83
South Korea,Asia,51.7,32400,83.7,11.6,81,97
Indonesia,Asia,276,4800,67.6,2.6,58,66
Philippines,Asia,116,3500,69.3,1.3,48,73
Vietnam,Asia,98.2,4200,73.6,3.5,39,79
Thailand,Asia,71.7,7100,79.7,3.8,53,88
Malaysia,Asia,33.9,12500,74.9,8.4,78,97
Kazakhstan,Asia,19.6,11500,69.4,11.3,58,91
Afghanistan,Asia,41.1,360,62,0.2,26,18
Australia,Oceania,26,65100,83.3,14.9,86,96
New Zealand,Oceania,5.1,48200,82,6.2,87,95
Papua New Guinea,Oceania,10.1,3100,65.4,0.8,13,32
Mongolia,Asia,3.4,5000,71,11.2,69,84
Libya,Africa,6.8,6700,71.9,8.1,81,46
Mali,Africa,22.6,830,58.9,0.2,45,34
Niger,Africa,26.2,590,61.6,0.1,17,22
Chad,Africa,17.7,720,52.5,0.1,24,12
Madagascar,Africa,29.6,520,64.5,0.1,40,20
Greenland,North America,0.056,54500,71.6,9.6,87,70
Bolivia,South America,12.2,3600,63.6,1.8,71,66
Myanmar,Asia,54,1100,65.7,0.7,32,44`;
export const SAMPLE_CITIES = `name,country,lat,lon,population_m,growth_pct,green_pct
Tokyo,Japan,35.69,139.69,37.2,-0.2,7.5
Delhi,India,28.61,77.21,33.8,2.8,20.2
Shanghai,China,31.23,121.47,29.9,2.6,16.2
Dhaka,Bangladesh,23.81,90.41,23.9,3.3,8.5
São Paulo,Brazil,-23.55,-46.63,22.8,0.8,12.4
Cairo,Egypt,30.04,31.24,22.6,2,3.5
Mexico City,Mexico,19.43,-99.13,22.5,0.6,9.8
Beijing,China,39.9,116.41,21.8,1.1,41.6
Mumbai,India,19.08,72.88,21.7,1.6,10.1
Osaka,Japan,34.69,135.5,19,-0.4,5.2
Karachi,Pakistan,24.86,67.01,17.2,2.4,4
Lagos,Nigeria,6.52,3.38,15.9,3.8,3.2
Istanbul,Turkey,41.01,28.98,15.8,1.4,15
Buenos Aires,Argentina,-34.6,-58.38,15.5,0.7,9.4
Kinshasa,Dem. Rep. Congo,-4.44,15.27,16.3,4.4,6
Manila,Philippines,14.6,120.98,14.7,1.6,5
Moscow,Russia,55.76,37.62,12.6,0.2,46
Paris,France,48.86,2.35,11.2,0.6,21.5
London,United Kingdom,51.51,-0.13,9.6,1.1,33
New York,United States of America,40.71,-74,18.9,0.2,27
Los Angeles,United States of America,34.05,-118.24,12.5,0.1,15
Jakarta,Indonesia,-6.21,106.85,11.2,1,9.9
Dubai,United Arab Emirates,25.2,55.27,3.6,2.1,8.1
Riyadh,Saudi Arabia,24.71,46.68,7.7,2.3,4.6
Nairobi,Kenya,-1.29,36.82,5.3,3.9,8
Johannesburg,South Africa,-26.2,28.05,6.2,2.1,24
Sydney,Australia,-33.87,151.21,5.4,1.5,46
Singapore,Singapore,1.35,103.82,6,0.9,47
Seoul,South Korea,37.57,126.98,10,-0.1,28
Lima,Peru,-12.05,-77.04,11,1.4,3`;
/** Events for time charts (deterministic): datetime, category, value, x, y. */
export const SAMPLE_EVENTS = (() => {
  let a = 1234567; const r = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
  const cats = ['Traffic', 'Fire', 'Medical', 'Theft', 'Noise'];
  const lines = ['datetime,category,value,temperature,humidity,wind'];
  const t0 = Date.UTC(2025, 0, 1);
  for (let i = 0; i < 520; i++) {
    const day = Math.floor(r() * 365), wk = new Date(t0 + day * 864e5).getUTCDay();
    let hr = Math.floor((r() + r() + r()) / 3 * 24); if (wk === 5 || wk === 6) hr = (hr + 3) % 24;
    const d = new Date(t0 + day * 864e5 + hr * 36e5 + Math.floor(r() * 60) * 6e4);
    const season = Math.sin(((day - 80) / 365) * 2 * Math.PI);
    const temp = +(18 + 12 * season + (r() - 0.5) * 8).toFixed(1);
    lines.push(`${d.toISOString().slice(0, 16).replace('T', ' ')},${cats[Math.floor(r() ** 1.4 * cats.length)]},${Math.round(5 + r() * 40 + (hr > 16 ? 15 : 0))},${temp},${Math.round(40 + r() * 45 - season * 10)},${+(2 + r() * 14).toFixed(1)}`);
  }
  return lines.join('\n');
})();
export const SAMPLE_PROFILE = (() => {
  const lines = ['distance_km,elevation_m'];
  for (let i = 0; i <= 120; i++) { const d = i * 0.25; lines.push(`${d.toFixed(2)},${Math.round(420 + 380 * Math.sin(d / 5) + 220 * Math.sin(d / 1.7 + 1) + 90 * Math.sin(d * 1.3) + d * 18)}`); }
  return lines.join('\n');
})();
export const SAMPLES = { world: SAMPLE_WORLD, cities: SAMPLE_CITIES, events: SAMPLE_EVENTS, profile: SAMPLE_PROFILE };
export const SAMPLE_NAMES = { world: 'Countries of the world (approximate figures)', cities: 'Big cities with coordinates', events: 'A year of events with date and time', profile: 'Distance / elevation profile' };
/** The data text of a layer: its own data, or the chosen sample. */
export const dataOf = (s) => (String(s.data || '').trim() ? s.data : SAMPLES[s.sample] || '');
