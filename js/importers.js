// Route file readers: GPX, KML, KMZ (zipped KML, e.g. Google My Maps / Earth), IGC flight logs and GeoJSON.
// All return { name, tracks: [[[lng,lat],...], ...], waypoints: [{name,lng,lat}] }.

const num = (v) => (v == null ? NaN : +v);
const ok = ([x, y]) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(y) <= 90;

function parseXML(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('The file is not valid XML');
  return doc;
}
const byTag = (el, tag) => [...el.getElementsByTagName(tag)];
const firstText = (el, tag) => el.getElementsByTagName(tag)[0]?.textContent?.trim() || '';

export function parseGPX(text) {
  const doc = parseXML(text);
  const tracks = [];
  for (const seg of byTag(doc, 'trkseg')) {
    const pts = byTag(seg, 'trkpt').map((n) => [num(n.getAttribute('lon')), num(n.getAttribute('lat'))]).filter(ok);
    if (pts.length > 1) tracks.push(pts);
  }
  for (const rte of byTag(doc, 'rte')) {
    const pts = byTag(rte, 'rtept').map((n) => [num(n.getAttribute('lon')), num(n.getAttribute('lat'))]).filter(ok);
    if (pts.length > 1) tracks.push(pts);
  }
  const waypoints = byTag(doc, 'wpt').map((n) => ({ lng: num(n.getAttribute('lon')), lat: num(n.getAttribute('lat')), name: firstText(n, 'name') }))
    .filter((w) => ok([w.lng, w.lat]));
  const meta = doc.getElementsByTagName('metadata')[0];
  const name = (meta && firstText(meta, 'name')) || (doc.getElementsByTagName('trk')[0] && firstText(doc.getElementsByTagName('trk')[0], 'name')) || '';
  return { name, tracks, waypoints };
}

export function parseKML(text) {
  const doc = parseXML(text);
  const tracks = [];
  const waypoints = [];
  const coordsOf = (s) => s.trim().split(/\s+/).map((t) => t.split(',').map(Number)).map(([x, y]) => [x, y]).filter(ok);
  for (const pm of byTag(doc, 'Placemark')) {
    const name = firstText(pm, 'name');
    for (const ls of byTag(pm, 'LineString')) {
      const c = coordsOf(firstText(ls, 'coordinates'));
      if (c.length > 1) tracks.push(c);
    }
    for (const tr of [...byTag(pm, 'gx:Track'), ...byTag(pm, 'Track')]) {
      const c = [...byTag(tr, 'gx:coord'), ...byTag(tr, 'coord')].map((n) => n.textContent.trim().split(/\s+/).map(Number)).map(([x, y]) => [x, y]).filter(ok);
      if (c.length > 1) tracks.push(c);
    }
    const pt = pm.getElementsByTagName('Point')[0];
    if (pt) {
      const c = coordsOf(firstText(pt, 'coordinates'))[0];
      if (c) waypoints.push({ name, lng: c[0], lat: c[1] });
    }
  }
  const name = firstText(doc.getElementsByTagName('Document')[0] || doc, 'name');
  return { name, tracks, waypoints };
}

export function parseIGC(text) {
  const pts = [];
  let name = '';
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('HFPLTPILOT') || line.startsWith('HFGTYGLIDERTYPE')) name ||= line.split(':').slice(1).join(':').trim();
    if (line[0] !== 'B' || line.length < 24) continue;
    const latD = +line.slice(7, 9), latM = +line.slice(9, 14) / 1000, ns = line[14];
    const lngD = +line.slice(15, 18), lngM = +line.slice(18, 23) / 1000, ew = line[23];
    let lat = latD + latM / 60, lng = lngD + lngM / 60;
    if (ns === 'S') lat = -lat;
    if (ew === 'W') lng = -lng;
    if (ok([lng, lat]) && (lat || lng)) pts.push([lng, lat]);
  }
  if (pts.length < 2) throw new Error('No flight track found in the IGC file');
  return { name: name ? `Flight · ${name}` : 'Flight', tracks: [pts], waypoints: [] };
}

export function parseGeoJSON(obj) {
  const tracks = [], waypoints = [];
  const visit = (g, props = {}) => {
    if (!g) return;
    if (g.type === 'FeatureCollection') g.features.forEach((f) => visit(f));
    else if (g.type === 'Feature') visit(g.geometry, g.properties || {});
    else if (g.type === 'GeometryCollection') g.geometries.forEach((x) => visit(x, props));
    else if (g.type === 'LineString') tracks.push(g.coordinates.map(([x, y]) => [x, y]));
    else if (g.type === 'MultiLineString') g.coordinates.forEach((c) => tracks.push(c.map(([x, y]) => [x, y])));
    else if (g.type === 'Point') waypoints.push({ name: props.name || props.title || '', lng: g.coordinates[0], lat: g.coordinates[1] });
  };
  visit(obj);
  return { name: obj.name || '', tracks: tracks.filter((t) => t.length > 1), waypoints };
}

// Minimal ZIP reader (stored + deflate) for KMZ files.
async function unzipFirst(buf, test) {
  const dv = new DataView(buf);
  // find end of central directory
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid KMZ (zip) file');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!test(name)) continue;
    const lNameLen = dv.getUint16(local + 26, true), lExtra = dv.getUint16(local + 28, true);
    const data = new Uint8Array(buf, local + 30 + lNameLen + lExtra, csize);
    if (method === 0) return dec.decode(data);
    if (method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(stream).text();
    }
    throw new Error('Unsupported compression in KMZ file');
  }
  throw new Error('No KML found inside the KMZ file');
}

export async function readRouteFile(file) {
  const name = file.name.toLowerCase();
  let res;
  if (name.endsWith('.kmz')) res = parseKML(await unzipFirst(await file.arrayBuffer(), (n) => n.toLowerCase().endsWith('.kml')));
  else {
    const text = await file.text();
    if (name.endsWith('.igc')) res = parseIGC(text);
    else if (name.endsWith('.kml')) res = parseKML(text);
    else if (name.endsWith('.geojson') || (name.endsWith('.json') && /"type"\s*:\s*"(Feature|LineString|MultiLineString)/.test(text))) res = parseGeoJSON(JSON.parse(text));
    else if (name.endsWith('.gpx') || text.includes('<gpx')) res = parseGPX(text);
    else if (text.includes('<kml')) res = parseKML(text);
    else throw new Error('Unsupported file. Use GPX, KML, KMZ, IGC or GeoJSON.');
  }
  if (!res.tracks.length && res.waypoints.length < 2) throw new Error('No route found in that file');
  res.name ||= file.name.replace(/\.[^.]+$/, '');
  return res;
}
