// Rotating globe: realistic Earth (NASA Blue Marble by day, city lights at night, moving clouds, atmosphere, sun
// flare, stars), day-only, black & white, flat cartoon, and drawn looks (glowing hologram, sci-fi HUD, neon,
// transparent glass, wireframe, gold dots, blueprint). Places with labels, great-circle arcs, an orbit ring, your
// own CSV / GeoJSON data (points as ripples, glows, spikes or dots; lines; areas) and a tour that turns the globe,
// then flies and zooms to every place one by one. WebGL + 2D into the overlay (works over the map or a video).
import { placeAt, CUSTOM_POS } from './place.js';
import { H } from './cartofx.js';
import { isLand } from './holo.js';

const { clamp, easeOut, ease, UI, hexA, rng, prog, parseLL, track } = H;
const D2R = Math.PI / 180;
const SHADER_LOOKS = { real: 0, night: 1, day: 2, bw: 3, flat: 4 };

export const GL_KINDS = { globe3d: { name: 'Rotating globe', icon: '🌍', geom: null, desc: 'A turning Earth — realistic, night lights, clouds, hologram, HUD, transparent glass, wireframe… — with places, arcs, your CSV / GeoJSON data and a tour that zooms to each place' } };
export const GL_ANIMS = { globe3d: { spin: 'Keeps turning', tour: 'Turns, then zooms to each place one by one', flyto: 'Turns to the first place, then slowly', zoomin: 'Comes in from far away, then turns', none: 'Still' } };
export const GL_DEFAULTS = {
  globe3d: { anim: 'spin', duration: 6, hold: 0, style: {
    look: 'real', size: 1, position: 'center', lon: 40, lat: 18, speed: 8, opacity: 1, detail: 'normal',
    space: true, stars: true, sun: true, sunPower: 1, sunAngle: 210, night: true, nightPower: 1, clouds: true, cloudAmount: 0.5, cloudSpeed: 1,
    atmosphere: true, atmoPower: 1, atmoColor: '#4d8dff',
    places: '', arcs: '', hub: false, arcColor: '#ffa53c', labelColor: '#19c3c9', orbit: false, timer: false, title: '',
    tourSpin: 3, tourMove: 2.6, tourStay: 2.2, tourZoom: 3,
    data: '', dataStyle: 'ripple', dataColor: '#ff4d4d', dataSize: 1, dataLabels: false, dataValue: true,
  } },
};
const isShader = (L) => (L.style.look || 'real') in SHADER_LOOKS;
export const GL_FORMS = {
  globe3d: [
    ['style.look', 'Look', 'select', {
      real: 'Realistic Earth (day, night lights, clouds)', day: 'Day only (no night side)', night: 'Night — city lights', bw: 'Black & white Earth', flat: 'Flat cartoon colours',
      glass: 'Transparent glass globe', wire: 'Wireframe (transparent)', holo: 'Glowing hologram dots', hud: 'Sci-fi HUD (red / teal grid)', neon: 'Neon land on dark', gold: 'Gold dots', blueprint: 'Blueprint',
    }],
    ['style.size', 'Size', 'range', [0.2, 3, 0.02]], ['style.position', 'Position', 'select', { center: 'Centre', left: 'Left', right: 'Right', 'bottom-right': 'Rising from the bottom right', ...CUSTOM_POS }],
    ['style.opacity', 'Globe opacity (lower = see-through)', 'range', [0.1, 1, 0.02]],
    ['style.lon', 'Facing longitude', 'range', [-180, 180, 1]], ['style.lat', 'Facing latitude', 'range', [-70, 70, 1]], ['style.speed', 'Turning speed (°/s, negative = other way)', 'range', [-40, 40, 0.5]],
    ['style.sunPower', 'Sun intensity', 'range', [0, 3, 0.05], isShader], ['style.sunAngle', 'Sun direction (°)', 'range', [0, 359, 1], isShader], ['style.sun', 'Sun flare', 'switch', null, isShader],
    ['style.night', 'Night side with city lights', 'switch', null, (L) => L.style.look === 'real' || !L.style.look], ['style.nightPower', 'City lights intensity', 'range', [0, 3, 0.05], (L) => ['real', 'night'].includes(L.style.look || 'real')],
    ['style.clouds', 'Clouds', 'switch', null, isShader], ['style.cloudAmount', 'Cloud cover', 'range', [0, 1, 0.02], (L) => isShader(L) && L.style.clouds !== false], ['style.cloudSpeed', 'Cloud drift', 'range', [0, 4, 0.05], (L) => isShader(L) && L.style.clouds !== false],
    ['style.atmosphere', 'Atmosphere glow', 'switch'], ['style.atmoPower', 'Glow strength', 'range', [0, 3, 0.05], (L) => L.style.atmosphere !== false], ['style.atmoColor', 'Glow colour', 'color', null, (L) => L.style.atmosphere !== false],
    ['style.detail', 'Texture detail', 'select', { normal: 'Normal', high: 'High (sharper when zoomed in, loads more)' }, isShader],
    ['style.space', 'Black space behind', 'switch'], ['style.stars', 'Stars', 'switch', null, (L) => L.style.space !== false],
    ['style.places', 'Places — “Name | longitude, latitude” (labels; the tour visits them in order)', 'cities', 'cities'],
    ['style.tourSpin', 'Tour: turn first (s)', 'range', [0, 15, 0.1], (L) => L.anim === 'tour'], ['style.tourMove', 'Tour: travel time (s)', 'range', [0.6, 8, 0.1], (L) => L.anim === 'tour'],
    ['style.tourStay', 'Tour: stay at each place (s)', 'range', [0, 10, 0.1], (L) => L.anim === 'tour'], ['style.tourZoom', 'Tour: zoom in', 'range', [1, 12, 0.1], (L) => L.anim === 'tour'],
    ['style.arcs', 'Arcs — “From name > To name”, one per line (names from the places)', 'textarea'], ['style.hub', 'Arcs from the first place to all others', 'switch'],
    ['style.arcColor', 'Arc colour', 'color'], ['style.labelColor', 'Label colour', 'color'], ['style.orbit', 'Orbit ring', 'switch'],
    ['style.data', 'Your data — CSV (name, lat, lon, value) or GeoJSON (points, lines, areas)', 'datafile'],
    ['style.dataStyle', 'Points look', 'select', { ripple: 'Ripples (pulsing rings)', glow: 'Glowing dots', spike: 'Spikes (height = value)', dot: 'Dots', pin: 'Pins' }, (L) => !!L.style.data],
    ['style.dataColor', 'Data colour', 'color', null, (L) => !!L.style.data], ['style.dataSize', 'Data size', 'range', [0.2, 4, 0.05], (L) => !!L.style.data],
    ['style.dataValue', 'Size points by their value', 'switch', null, (L) => !!L.style.data], ['style.dataLabels', 'Show point names', 'switch', null, (L) => !!L.style.data],
    ['style.timer', 'Countdown in the middle (HUD)', 'switch', null, (L) => L.style.look === 'hud'], ['style.title', 'Title (HUD)', 'text', null, (L) => L.style.look === 'hud'],
  ],
};
export const GL_SET = new Set(Object.keys(GL_KINDS));
export const glPhases = () => ['captions'];

// ---------------------------------------------------------------- data (CSV / GeoJSON)
const dataCache = new Map();
function parseData(txt) {
  const key = String(txt || '');
  if (dataCache.has(key)) return dataCache.get(key);
  const out = { points: [], lines: [], polys: [] };
  const t = key.trim();
  if (!t) { dataCache.set(key, out); return out; }
  if (t[0] === '{' || t[0] === '[') {
    try {
      const j = JSON.parse(t);
      const feats = j.type === 'FeatureCollection' ? j.features : j.type === 'Feature' ? [j] : Array.isArray(j) ? j : j.type ? [{ type: 'Feature', geometry: j, properties: {} }] : [];
      for (const f of feats) {
        const g = f.geometry || {}, p = f.properties || {};
        const name = p.name || p.NAME || p.title || p.label || p.city || '';
        const value = +(p.value ?? p.mag ?? p.count ?? p.population ?? p.pop_est ?? NaN);
        const add = (type, c) => {
          if (type === 'Point') out.points.push({ ll: c, name, value });
          else if (type === 'MultiPoint') c.forEach((x) => out.points.push({ ll: x, name, value }));
          else if (type === 'LineString') out.lines.push(c);
          else if (type === 'MultiLineString') c.forEach((x) => out.lines.push(x));
          else if (type === 'Polygon') out.polys.push(c);
          else if (type === 'MultiPolygon') c.forEach((x) => out.polys.push(x));
        };
        if (g.type === 'GeometryCollection') (g.geometries || []).forEach((x) => add(x.type, x.coordinates)); else add(g.type, g.coordinates);
      }
    } catch { /* not JSON */ }
  } else {
    const lines = t.split(/\r?\n/).filter((l) => l.trim());
    const split = (l) => { const r = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if ((ch === ',' || ch === ';' || ch === '\t') && !q) { r.push(cur.trim()); cur = ''; } else cur += ch; } r.push(cur.trim()); return r; };
    let head = split(lines[0]).map((h) => h.toLowerCase());
    const hasHead = head.some((h) => /^(lat|latitude|lon|lng|long|longitude|x|y|name)$/.test(h));
    const find = (re) => head.findIndex((h) => re.test(h));
    let iLat = find(/^(lat|latitude|y)$/), iLon = find(/^(lon|lng|long|longitude|x)$/), iName = find(/^(name|title|label|city|place|country)$/), iVal = find(/^(value|mag|magnitude|count|population|pop|amount|size)$/);
    const rows = hasHead ? lines.slice(1) : lines;
    if (!hasHead) { head = []; iName = 0; iLat = 1; iLon = 2; iVal = 3; }
    for (const l of rows) {
      const c = split(l);
      let lat = parseFloat(c[iLat]), lon = parseFloat(c[iLon]);
      if (!hasHead && !isFinite(lat)) { const nums = c.map(parseFloat).filter(isFinite); [lat, lon] = nums; if (Math.abs(lat) > 90) [lat, lon] = [lon, lat]; }
      if (!isFinite(lat) || !isFinite(lon)) continue;
      out.points.push({ ll: [lon, lat], name: iName >= 0 ? c[iName] || '' : '', value: iVal >= 0 ? parseFloat(c[iVal]) : NaN });
    }
  }
  dataCache.set(key, out);
  if (dataCache.size > 20) dataCache.delete(dataCache.keys().next().value);
  return out;
}

// ---------------------------------------------------------------- textures (NASA GIBS, Web Mercator)
const TEX = {
  day: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
  night: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
};
const mosaics = {};
function fallback(kind, S) {
  const n = 512, img = new ImageData(n, n);
  for (let y = 0; y < n; y++) {
    const my = 1 - (2 * (y + 0.5)) / n, lat = (Math.atan(Math.sinh(my * Math.PI)) * 180) / Math.PI;
    for (let x = 0; x < n; x++) {
      const lon = ((x + 0.5) / n) * 360 - 180, land = isLand(lon, lat), i = (y * n + x) * 4;
      let col;
      if (kind === 'land') col = land ? [255, 255, 255] : [0, 0, 0];
      else if (kind === 'night') col = land ? [18, 14, 8] : [0, 0, 0];
      else col = land ? (Math.abs(lat) > 62 ? [225, 230, 236] : Math.abs(lat) < 30 && lon > -20 && lon < 60 ? [178, 152, 104] : [86, 112, 62]) : [14, 42, 92];
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
  }
  const t = document.createElement('canvas'); t.width = n; t.height = n; t.getContext('2d').putImageData(img, 0, 0);
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.drawImage(t, 0, 0, S, S);
  return [c, g];
}
function mosaic(kind, Z = 3) {
  const key = `${kind}${Z}`;
  if (mosaics[key]) return mosaics[key];
  const N = 2 ** Z, S = kind === 'land' ? 1024 : 256 * N;
  const [c, g] = fallback(kind, S);
  const m = { canvas: c, version: 1 };
  mosaics[key] = m;
  if (kind === 'land') return m;
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    const im = new Image(); im.crossOrigin = 'anonymous';
    track(new Promise((res) => {
      im.onload = () => { g.drawImage(im, tx * 256, ty * 256); m.version++; res(); };
      im.onerror = () => res();
      im.src = TEX[kind].replace('{z}', Z).replace('{x}', tx).replace('{y}', ty);
    }));
  }
  return m;
}

// ---------------------------------------------------------------- WebGL sphere renderer
let GL = null;
function glInit() {
  if (GL) return GL;
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const gl = c.getContext('webgl', { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true });
  if (!gl) { GL = { fail: true }; return GL; }
  const vs = 'attribute vec2 p; varying vec2 uv; void main(){ uv=p; gl_Position=vec4(p,0.,1.); }';
  const fs = `precision highp float;
varying vec2 uv; uniform sampler2D day, night, land;
uniform float lon0, lat0, look, nightOn, nightPow, sunPow, cloudAmt, cloudT, atmPow, opac;
uniform vec3 sunDir, atmCol;
const float PI=3.14159265;
float h3(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float n3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float v=0., a=0.5; for(int i=0;i<5;i++){ v+=a*n3(p); p*=2.07; a*=0.5; } return v; }
void main(){
  float r2=dot(uv,uv); if(r2>1.0){ gl_FragColor=vec4(0.); return; }
  vec3 n=vec3(uv.x, uv.y, sqrt(1.0-r2));
  float sl=n.y*cos(lat0)+n.z*sin(lat0);
  float lat=asin(clamp(sl,-1.,1.));
  float lon=lon0+atan(n.x, n.z*cos(lat0)-n.y*sin(lat0));
  float u=fract(lon/(2.0*PI)+0.5);
  float la=clamp(lat,-1.4835,1.4835);
  float v=0.5-log(tan(PI/4.0+la/2.0))/(2.0*PI);
  vec3 d=texture2D(day, vec2(u,v)).rgb, nl=texture2D(night, vec2(u,v)).rgb;
  float ld=texture2D(land, vec2(u,v)).r;
  float diff=dot(n,normalize(sunDir));
  float lit=smoothstep(-0.15,0.35,diff);
  // clouds live on the globe (world coordinates) and drift east
  vec3 wp=vec3(cos(lat)*cos(lon+cloudT), sin(lat), cos(lat)*sin(lon+cloudT));
  float cl=smoothstep(0.62-cloudAmt*0.42, 0.95-cloudAmt*0.3, fbm(wp*3.2+vec3(0.,0.,cloudT*0.15)));
  cl*=smoothstep(1.0,0.3,abs(sin(lat))*0.6+0.3)*step(0.001,cloudAmt);
  vec3 col;
  if(look<0.5){ // realistic
    col=d*(0.10+1.05*lit*sunPow);
    if(nightOn>0.5) col+=pow(nl,vec3(1.4))*vec3(1.25,0.95,0.55)*1.6*nightPow*(1.0-lit)*(1.0-cl*0.8);
  } else if(look<1.5){ // night lights
    col=d*vec3(0.05,0.09,0.18)*1.4+pow(nl,vec3(1.3))*vec3(1.3,0.95,0.5)*1.8*nightPow;
    col+=vec3(0.15,0.35,0.9)*lit*0.25*sunPow;
  } else if(look<2.5){ // day only
    col=d*(0.55+0.65*lit*sunPow);
  } else if(look<3.5){ // black & white
    float g=dot(d,vec3(0.3,0.59,0.11)); col=vec3(g)*(0.35+0.85*lit*sunPow);
  } else { // flat cartoon
    col=mix(vec3(0.16,0.45,0.82), vec3(0.42,0.74,0.38), step(0.5,ld)); col*=0.6+0.5*lit*sunPow;
  }
  vec3 cc=vec3(1.0)*(0.25+0.9*lit*sunPow);
  if(look>0.5 && look<1.5) cc=vec3(0.12,0.16,0.25)*(0.4+lit);
  col=mix(col, cc, cl*0.9);
  float rim=pow(1.0-n.z,2.5);
  col=mix(col, atmCol*(0.4+lit), clamp(rim*0.55*atmPow,0.,1.));
  float edge=smoothstep(1.0,0.985,sqrt(r2));
  float a=edge*opac;
  gl_FragColor=vec4(col*a, a);
}`;
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(pr)); GL = { fail: true }; return GL; }
  gl.useProgram(pr);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
  const T = { day: tex(0), night: tex(1), land: tex(2) };
  gl.uniform1i(gl.getUniformLocation(pr, 'day'), 0); gl.uniform1i(gl.getUniformLocation(pr, 'night'), 1); gl.uniform1i(gl.getUniformLocation(pr, 'land'), 2);
  const U = {};
  for (const n of ['lon0', 'lat0', 'look', 'nightOn', 'nightPow', 'sunPow', 'cloudAmt', 'cloudT', 'atmPow', 'opac', 'sunDir', 'atmCol']) U[n] = gl.getUniformLocation(pr, n);
  GL = { c, gl, T, U, ver: {} };
  return GL;
}
const rgb = (hex) => { const n = parseInt(String(hex || '#4d8dff').replace('#', '').slice(0, 6), 16) || 0; return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
function renderSphere(size, o) {
  const G = glInit();
  if (G.fail) return null;
  const { gl } = G;
  const px = clamp(Math.round(size), 64, 2048);
  if (G.c.width !== px) { G.c.width = px; G.c.height = px; }
  gl.viewport(0, 0, px, px);
  const Z = o.detail === 'high' ? 4 : 3;
  for (const [k, unit, z] of [['day', 0, Z], ['night', 1, Z], ['land', 2, 3]]) {
    const m = mosaic(k, z), vk = `${k}${z}`;
    if (G.ver[unit] !== `${vk}:${m.version}`) {
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, G.T[k]);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, m.canvas); G.ver[unit] = `${vk}:${m.version}`; } catch { /* tainted: keep the previous texture */ }
    }
  }
  const a = (o.sunAngle ?? 210) * D2R;
  const U = G.U;
  gl.uniform1f(U.lon0, o.lon0); gl.uniform1f(U.lat0, o.lat0); gl.uniform1f(U.look, o.look);
  gl.uniform1f(U.nightOn, o.nightOn ? 1 : 0); gl.uniform1f(U.nightPow, o.nightPow); gl.uniform1f(U.sunPow, o.sunPow);
  gl.uniform1f(U.cloudAmt, o.clouds ? o.cloudAmt : 0); gl.uniform1f(U.cloudT, o.cloudT); gl.uniform1f(U.atmPow, o.atm ? o.atmPow : 0); gl.uniform1f(U.opac, o.opacity);
  gl.uniform3f(U.sunDir, Math.cos(a) * 0.82, -Math.sin(a) * 0.5 + 0.1, 0.55);
  gl.uniform3fv(U.atmCol, rgb(o.atmCol));
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return G.c;
}

// ---------------------------------------------------------------- 2D helpers
function project(lon, lat, lon0, lat0) {
  const dl = (lon - lon0) * D2R, p = lat * D2R, p0 = lat0 * D2R;
  return [Math.cos(p) * Math.sin(dl), Math.sin(p) * Math.cos(p0) - Math.cos(p) * Math.sin(p0) * Math.cos(dl), Math.sin(p) * Math.sin(p0) + Math.cos(p) * Math.cos(p0) * Math.cos(dl)];
}
let LANDPTS = null;
function landPts() {
  if (LANDPTS) return LANDPTS;
  LANDPTS = [];
  for (let lat = -80; lat <= 82; lat += 1.6) { const step = 1.6 / Math.max(0.2, Math.cos(lat * D2R)); for (let lon = -180; lon < 180; lon += step) if (isLand(lon, lat)) LANDPTS.push([lon, lat]); }
  return LANDPTS;
}
let COAST = null;
function coastPts() { // land cells with sea next to them — an outline for glass / wireframe globes
  if (COAST) return COAST;
  COAST = [];
  for (let lat = -80; lat <= 82; lat += 1) {
    const step = 1 / Math.max(0.25, Math.cos(lat * D2R));
    for (let lon = -180; lon < 180; lon += step) if (isLand(lon, lat) && (!isLand(lon + step, lat) || !isLand(lon - step, lat) || !isLand(lon, lat + 1) || !isLand(lon, lat - 1))) COAST.push([lon, lat]);
  }
  return COAST;
}
function slerp(a, b, f) {
  const toV = ([lo, la]) => [Math.cos(la * D2R) * Math.cos(lo * D2R), Math.cos(la * D2R) * Math.sin(lo * D2R), Math.sin(la * D2R)];
  const A = toV(a), B = toV(b);
  const d = Math.acos(clamp(A[0] * B[0] + A[1] * B[1] + A[2] * B[2], -1, 1));
  if (d < 1e-6) return [a, 0];
  const s1 = Math.sin((1 - f) * d) / Math.sin(d), s2 = Math.sin(f * d) / Math.sin(d);
  const v = [A[0] * s1 + B[0] * s2, A[1] * s1 + B[1] * s2, A[2] * s1 + B[2] * s2];
  return [[Math.atan2(v[1], v[0]) / D2R, Math.asin(clamp(v[2], -1, 1)) / D2R], d];
}
const wrap = (from, to) => { let x = to; while (x - from > 180) x -= 360; while (x - from < -180) x += 360; return x; };

/** Where the globe faces and how far it is zoomed at time tau, for the tour. */
function tourView(s, places, tau) {
  const spin = +s.speed || 0, T0 = Math.max(0, +s.tourSpin || 0), Tm = Math.max(0.3, +s.tourMove || 2.6), Ts = Math.max(0, isFinite(+s.tourStay) ? +s.tourStay : 2.2), Z = Math.max(1, +s.tourZoom || 3);
  let lon = (+s.lon || 0) + Math.min(tau, T0) * spin, lat = +s.lat || 0, zoom = 1, at = -1;
  if (tau <= T0 || !places.length) return { lon: (+s.lon || 0) + tau * spin, lat, zoom, at };
  let t = tau - T0;
  let prev = { lon, lat, zoom: 1 };
  for (let i = 0; i < places.length; i++) {
    const tgt = { lon: wrap(prev.lon, places[i].ll[0]), lat: clamp(places[i].ll[1], -75, 75), zoom: Z };
    if (t <= Tm) {
      const f = ease(t / Tm);
      const dip = Math.sin(Math.PI * clamp(t / Tm, 0, 1)) * (i ? 0.55 : 0); // zoom out a little between places
      const zz = prev.zoom + (tgt.zoom - prev.zoom) * f;
      return { lon: prev.lon + (tgt.lon - prev.lon) * f, lat: prev.lat + (tgt.lat - prev.lat) * f, zoom: Math.max(1, zz * (1 - dip * (1 - 1 / zz))), at: f > 0.85 ? i : -1 };
    }
    t -= Tm;
    if (t <= Ts || i === places.length - 1) return { lon: tgt.lon + Math.max(0, t - Ts) * spin * 0.05, lat: tgt.lat, zoom: Z, at: i };
    t -= Ts;
    prev = tgt;
  }
  return { lon, lat, zoom, at };
}

// ---------------------------------------------------------------- draw
export function drawGlobe3d(ctx, L, tm, o, phase) {
  if (phase !== 'captions' || !o.frame) return;
  H.setMap(o.map);
  const s = L.style, fr = o.frame, unit = o.unit, t = o.time || 0;
  const u = prog(L, tm);
  const tau = tm.edit ? 0 : tm.tau;
  const places = String(s.places || '').split('\n').map((l) => l.split('|').map((v) => v.trim())).filter((r) => r[0]).map(([name, c]) => ({ name, ll: parseLL(c) })).filter((p) => p.ll);
  const data = parseData(s.data);
  const tourStops = places.length ? places : data.points.filter((p) => p.name).slice(0, 15);
  // orientation + zoom
  let lon0 = +s.lon || 0, lat0 = +s.lat || 0, zoom = 1, focus = -1;
  const spin = +s.speed || 0;
  if (L.anim === 'tour' && !tm.edit) { const v = tourView(s, tourStops, tau); lon0 = v.lon; lat0 = v.lat; zoom = v.zoom; focus = v.at; }
  else if (L.anim === 'flyto' && places[0]) {
    const k = ease(clamp(u, 0, 1));
    const tl = wrap(lon0, places[0].ll[0]);
    lon0 = lon0 + (tl - lon0) * k + Math.max(0, tau - (+L.duration || 6)) * spin * 0.15;
    lat0 = lat0 + (clamp(places[0].ll[1], -60, 60) * 0.8 - lat0) * k;
  } else if (L.anim !== 'none') lon0 += tau * spin;
  // size / position
  let R = Math.min(fr.w, fr.h) * 0.36 * (+s.size || 1) * zoom;
  if (L.anim === 'zoomin' && !tm.edit) R *= 0.15 + 0.85 * easeOut(clamp(u * 1.2, 0, 1));
  let cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2;
  if (zoom <= 1.01) {
    if (s.position === 'left') cx = fr.x + fr.w * 0.3;
    if (s.position === 'right') cx = fr.x + fr.w * 0.7;
    if (s.position === 'bottom-right') { cx = fr.x + fr.w * 0.72; cy = fr.y + fr.h * 0.95; }
  }
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  if (s.space !== false) {
    ctx.fillStyle = '#02040a'; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
    if (s.stars !== false) { const r = rng(7); for (let i = 0; i < 420; i++) { const b = r(); ctx.fillStyle = `rgba(255,255,255,${0.15 + b * 0.75 * (0.75 + 0.25 * Math.sin(t * 2 + i))})`; const sz = b > 0.97 ? 1.8 : 1; ctx.fillRect(fr.x + r() * fr.w, fr.y + r() * fr.h, sz * unit * 0.8, sz * unit * 0.8); } }
  }
  ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); ctx.clip();
  placeAt(ctx, L, fr, cx - Math.min(R, fr.w / 2), cy - Math.min(R, fr.h / 2), Math.min(R, fr.w / 2) * 2, Math.min(R, fr.h / 2) * 2);
  const look = s.look || 'real';
  const P = (lon, lat, lift = 1) => { const p = project(lon, lat, lon0, lat0); return [cx + p[0] * R * lift, cy - p[1] * R * lift, p[2]]; };
  const opac = clamp(+s.opacity || 1, 0.05, 1);
  const atmOn = s.atmosphere !== false, atmPow = isFinite(+s.atmoPower) ? +s.atmoPower : 1, atmCol = s.atmoColor || (['holo', 'neon', 'glass', 'wire'].includes(look) ? '#38d9ff' : '#4d8dff');
  if (atmOn && look !== 'hud' && atmPow > 0) {
    const g = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * (1.08 + 0.14 * atmPow));
    g.addColorStop(0, hexA(atmCol, clamp((look === 'night' ? 0.35 : 0.55) * atmPow, 0, 1))); g.addColorStop(1, hexA(atmCol, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * (1.08 + 0.14 * atmPow), 0, 7); ctx.fill();
  }
  if (look in SHADER_LOOKS) {
    const S = Math.abs(ctx.getTransform().a) || 1;
    const img = renderSphere(R * 2 * S, {
      lon0: lon0 * D2R, lat0: lat0 * D2R, look: SHADER_LOOKS[look], nightOn: s.night !== false, nightPow: isFinite(+s.nightPower) ? +s.nightPower : 1,
      sunPow: isFinite(+s.sunPower) ? +s.sunPower : 1, sunAngle: isFinite(+s.sunAngle) ? +s.sunAngle : 210, clouds: s.clouds !== false, cloudAmt: clamp(isFinite(+s.cloudAmount) ? +s.cloudAmount : 0.5, 0, 1),
      cloudT: t * 0.02 * (isFinite(+s.cloudSpeed) ? +s.cloudSpeed : 1), atm: atmOn, atmPow, atmCol, opacity: opac, detail: s.detail,
    });
    if (img) ctx.drawImage(img, cx - R, cy - R, R * 2, R * 2);
    if (s.sun !== false && (+s.sunPower || 1) > 0 && zoom < 1.6) {
      const a = (isFinite(+s.sunAngle) ? +s.sunAngle : 210) * D2R;
      const sx = cx + Math.cos(a) * R * 0.98, sy = cy + Math.sin(a) * R * 0.55;
      const k = clamp(+s.sunPower || 1, 0, 3);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 0.55 * Math.sqrt(k)); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.08, `rgba(210,230,255,${clamp(0.9 * k, 0, 1)})`); g.addColorStop(0.3, `rgba(90,150,255,${0.25 * k})`); g.addColorStop(1, 'rgba(60,120,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, R * 0.55 * Math.sqrt(k), 0, 7); ctx.fill();
      ctx.strokeStyle = `rgba(200,225,255,${clamp(0.35 * k, 0, 0.8)})`; ctx.lineWidth = 1.2 * unit;
      for (let i = 0; i < 12; i++) { const b = (i / 12) * Math.PI * 2 + 0.2, l = R * (i % 3 ? 0.25 : 0.42) * Math.sqrt(k); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(b) * l, sy + Math.sin(b) * l); ctx.stroke(); }
      ctx.restore();
    }
  } else {
    ctx.save(); ctx.globalAlpha *= opac;
    const glassy = look === 'glass' || look === 'wire';
    const body = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
    if (look === 'hud') { body.addColorStop(0, 'rgba(20,10,14,0.85)'); body.addColorStop(1, 'rgba(5,4,8,0.9)'); }
    else if (look === 'blueprint') { body.addColorStop(0, '#1f4f9a'); body.addColorStop(1, '#0d2a5c'); }
    else if (look === 'gold') { body.addColorStop(0, 'rgba(30,22,8,0.9)'); body.addColorStop(1, 'rgba(8,6,2,0.95)'); }
    else if (glassy) { body.addColorStop(0, 'rgba(160,220,255,0.10)'); body.addColorStop(1, 'rgba(60,140,220,0.18)'); }
    else { body.addColorStop(0, 'rgba(6,30,48,0.75)'); body.addColorStop(1, 'rgba(2,10,20,0.85)'); }
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    const d = Math.max(1, R / 150) * unit;
    if (look === 'wire' || look === 'blueprint') {
      // graticule, back side faint
      ctx.lineWidth = 0.8 * unit;
      const line = (pts) => { for (let pass = 0; pass < 2; pass++) { ctx.strokeStyle = look === 'blueprint' ? `rgba(255,255,255,${pass ? 0.55 : 0.12})` : `rgba(120,220,255,${pass ? 0.6 : 0.15})`; ctx.beginPath(); let pen = false; for (const [lo, la] of pts) { const p = P(lo, la); const front = p[2] >= 0; if (front !== !!pass) { pen = false; continue; } pen ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); pen = true; } ctx.stroke(); } };
      for (let la = -75; la <= 75; la += 15) { const pts = []; for (let lo = -180; lo <= 180; lo += 3) pts.push([lo, la]); line(pts); }
      for (let lo = -180; lo < 180; lo += 15) { const pts = []; for (let la = -88; la <= 88; la += 3) pts.push([lo, la]); line(pts); }
    }
    const pts = glassy || look === 'blueprint' ? coastPts() : landPts();
    if (look === 'holo' || look === 'neon' || glassy) ctx.globalCompositeOperation = 'lighter';
    for (const [lo, la] of pts) {
      const p = P(lo, la);
      const f = clamp(p[2], 0, 1);
      if (p[2] < -0.05) {
        if (glassy) { ctx.fillStyle = 'rgba(120,200,255,0.18)'; ctx.fillRect(p[0] - d * 0.6, p[1] - d * 0.6, d * 1.2, d * 1.2); }
        continue;
      }
      if (look === 'hud') { const k = (la + 60) / 140; ctx.fillStyle = `rgba(${Math.round(230 - 120 * k)},${Math.round(70 + 120 * k)},${Math.round(80 + 70 * k)},${0.35 + 0.65 * f})`; ctx.fillRect(p[0] - d * 1.1, p[1] - d * 1.1, d * 2.2, d * 2.2); }
      else if (look === 'neon') { ctx.fillStyle = `rgba(${Math.round(90 + 140 * (lo > 0 ? 0.8 : 0.2))},${Math.round(230 - 40 * (lo > 0 ? 1 : 0))},${Math.round(200 - 120 * (lo > 0 ? 1 : 0))},${0.25 + 0.6 * f})`; ctx.fillRect(p[0] - d, p[1] - d, d * 2, d * 2); }
      else if (look === 'gold') { ctx.fillStyle = `rgba(255,${Math.round(190 + 40 * f)},${Math.round(90 + 60 * f)},${0.3 + 0.7 * f})`; ctx.beginPath(); ctx.arc(p[0], p[1], d * 0.9, 0, 7); ctx.fill(); }
      else if (look === 'blueprint') { ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * f})`; ctx.fillRect(p[0] - d * 0.7, p[1] - d * 0.7, d * 1.4, d * 1.4); }
      else if (glassy) { ctx.fillStyle = `rgba(150,235,255,${0.35 + 0.65 * f})`; ctx.fillRect(p[0] - d * 0.8, p[1] - d * 0.8, d * 1.6, d * 1.6); }
      else { ctx.fillStyle = `rgba(120,225,255,${0.2 + 0.6 * f})`; ctx.fillRect(p[0] - d * 0.8, p[1] - d * 0.8, d * 1.6, d * 1.6); }
    }
    if (look === 'holo' || look === 'neon') {
      const r = rng(11);
      for (let i = 0; i < 70; i++) {
        const q = landPts()[Math.floor(r() * landPts().length)]; const p = P(q[0], q[1]);
        if (p[2] < 0.05) continue;
        const tw = 0.6 + 0.4 * Math.sin(t * 3 + i);
        const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 7 * unit); g.addColorStop(0, `rgba(255,190,90,${0.9 * tw * p[2]})`); g.addColorStop(1, 'rgba(255,160,60,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], 7 * unit, 0, 7); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    if (glassy) { // glass highlight + rim
      const g = ctx.createLinearGradient(cx, cy - R, cx, cy); g.addColorStop(0, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx - R * 0.2, cy - R * 0.55, R * 0.55, R * 0.3, -0.35, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(170,230,255,0.75)'; ctx.lineWidth = 1.4 * unit; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    }
    if (look === 'hud') {
      ctx.strokeStyle = 'rgba(120,200,230,0.75)'; ctx.lineWidth = 1.2 * unit;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, 7); ctx.stroke();
      ctx.lineWidth = 3 * unit; ctx.strokeStyle = 'rgba(80,190,170,0.9)'; ctx.beginPath(); ctx.arc(cx, cy, R * 1.2, -2.2 + t * 0.2, -1.2 + t * 0.2); ctx.stroke();
      ctx.strokeStyle = 'rgba(230,80,80,0.9)'; ctx.beginPath(); ctx.arc(cx, cy, R * 1.2, 1.3 - t * 0.15, 1.8 - t * 0.15); ctx.stroke();
      for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; const r0 = R * 1.26, r1 = R * (i % 6 ? 1.29 : 1.33); ctx.strokeStyle = 'rgba(160,200,220,0.5)'; ctx.lineWidth = 1 * unit; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(200,230,255,0.7)'; ctx.lineWidth = 1 * unit;
      ctx.beginPath(); ctx.moveTo(cx - R * 0.5, cy - R * 0.5); ctx.lineTo(cx - R * 0.15, cy - R * 0.15); ctx.moveTo(cx + R * 0.5, cy - R * 0.5); ctx.lineTo(cx + R * 0.15, cy - R * 0.15); ctx.stroke();
      ctx.strokeRect(cx - R * 0.07, cy - R * 0.32, R * 0.14, R * 0.14);
      if (s.timer !== false) { const sec = Math.max(0, 120 - Math.floor(tau)); ctx.fillStyle = '#fff'; ctx.font = `300 ${R * 0.2}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`, cx, cy + R * 0.05); }
      if (s.title) { ctx.fillStyle = 'rgba(200,230,255,0.85)'; ctx.font = `500 ${R * 0.055}px ${UI}`; ctx.textAlign = 'center'; ctx.fillText(String(s.title).toUpperCase(), cx, cy - R * 1.38); }
    } else if (!glassy) {
      ctx.strokeStyle = look === 'blueprint' ? 'rgba(255,255,255,0.7)' : look === 'gold' ? 'rgba(255,200,110,0.55)' : 'rgba(120,225,255,0.45)'; ctx.lineWidth = 1 * unit; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    }
    ctx.restore();
  }
  // ---- your data: areas, lines, points
  const dc = s.dataColor || '#ff4d4d', ds = +s.dataSize || 1;
  const seeThrough = opac < 0.95 || ['glass', 'wire'].includes(look);
  if (data.polys.length || data.lines.length) {
    ctx.save(); ctx.lineJoin = 'round';
    const limb = (p) => { if (p[2] >= 0) return p; const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [cx + (dx / l) * R, cy + (dy / l) * R, 0]; };
    for (const poly of data.polys) {
      ctx.beginPath();
      for (const ring of poly) { const step = Math.max(1, Math.floor(ring.length / 400)); ring.forEach((ll, i) => { if (i % step && i !== ring.length - 1) return; const p = limb(P(ll[0], ll[1])); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.closePath(); }
      ctx.fillStyle = hexA(dc, 0.35); ctx.fill('evenodd');
    }
    ctx.strokeStyle = dc; ctx.lineWidth = 1.6 * unit * ds;
    const strokeLine = (cs) => { const step = Math.max(1, Math.floor(cs.length / 600)); ctx.beginPath(); let pen = false; cs.forEach((ll, i) => { if (i % step && i !== cs.length - 1) return; const p = P(ll[0], ll[1]); if (p[2] < 0 && !seeThrough) { pen = false; return; } pen ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); pen = true; }); ctx.stroke(); };
    for (const poly of data.polys) for (const ring of poly) strokeLine(ring);
    for (const ln of data.lines) strokeLine(ln);
    ctx.restore();
  }
  if (data.points.length) {
    const vals = data.points.map((p) => p.value).filter(isFinite);
    const vmax = vals.length ? Math.max(...vals.map(Math.abs)) || 1 : 1;
    const n = data.points.length;
    ctx.save();
    data.points.forEach((pt, i) => {
      const p = P(pt.ll[0], pt.ll[1]);
      if (p[2] < (seeThrough ? -1 : 0.02)) return;
      const k = tm.edit || L.anim === 'none' || L.anim === 'tour' ? 1 : clamp(u * 1.6 * (n > 1 ? 1 : 1) - (i / n) * 0.6, 0, 1);
      if (k <= 0) return;
      const vk = s.dataValue !== false && isFinite(pt.value) ? 0.45 + 1.4 * Math.sqrt(Math.abs(pt.value) / vmax) : 1;
      const r = 4 * unit * ds * vk * Math.max(0.6, Math.sqrt(zoom) * 0.8);
      const back = p[2] < 0;
      ctx.globalAlpha = tm.alpha * k * (back ? 0.3 : clamp(0.4 + p[2], 0, 1));
      const st = s.dataStyle || 'ripple';
      if (st === 'spike') {
        const h = 1 + 0.25 * ds * vk * (s.dataValue !== false ? 1 : 0.6);
        const q = P(pt.ll[0], pt.ll[1], h);
        const g = ctx.createLinearGradient(p[0], p[1], q[0], q[1]); g.addColorStop(0, hexA(dc, 0.95)); g.addColorStop(1, hexA(dc, 0.15));
        ctx.strokeStyle = g; ctx.lineWidth = Math.max(1.5, 2.4 * unit * ds); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k); ctx.stroke();
      } else if (st === 'glow') {
        const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 3); g.addColorStop(0, hexA(dc, 0.95)); g.addColorStop(0.3, hexA(dc, 0.5)); g.addColorStop(1, hexA(dc, 0));
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], r * 3 * (0.85 + 0.15 * Math.sin(t * 3 + i)), 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
      } else if (st === 'pin') {
        ctx.fillStyle = dc; ctx.beginPath(); ctx.arc(p[0], p[1] - r * 2.2, r * 1.1, Math.PI * 0.8, Math.PI * 2.2); ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p[0], p[1] - r * 2.2, r * 0.42, 0, 7); ctx.fill();
      } else {
        if (st === 'ripple') {
          const sq = Math.max(0.25, p[2]);
          for (let j = 0; j < 3; j++) {
            const ph = (t * 0.7 + j / 3 + i * 0.137) % 1;
            ctx.strokeStyle = hexA(dc, (1 - ph) * 0.9); ctx.lineWidth = 1.6 * unit;
            ctx.beginPath(); ctx.ellipse(p[0], p[1], r * (1 + ph * 4), r * (1 + ph * 4) * sq, 0, 0, 7); ctx.stroke();
          }
        }
        ctx.fillStyle = dc; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1 * unit; ctx.stroke();
      }
      if (s.dataLabels && pt.name && !back) { ctx.fillStyle = '#fff'; ctx.font = `600 ${11 * unit}px ${UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4 * unit; ctx.fillText(pt.name, p[0] + r + 5 * unit, p[1]); ctx.shadowColor = 'transparent'; }
    });
    ctx.restore();
  }
  // ---- orbit ring
  if (s.orbit && zoom < 1.4) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.35);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.6 * unit;
    ctx.beginPath(); ctx.ellipse(0, 0, R * 1.35, R * 0.32, 0, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha *= 0.35; ctx.beginPath(); ctx.ellipse(0, 0, R * 1.35, R * 0.32, 0, 0, Math.PI); ctx.stroke();
    ctx.restore();
  }
  // ---- arcs
  const byName = new Map(places.map((p) => [p.name.toLowerCase(), p]));
  let pairs = String(s.arcs || '').split('\n').map((l) => l.split(/>|->|→/).map((v) => v.trim().toLowerCase())).filter((r) => r.length === 2 && byName.has(r[0]) && byName.has(r[1])).map(([a, b]) => [byName.get(a), byName.get(b)]);
  if (s.hub && places.length > 1) pairs = pairs.concat(places.slice(1).map((p) => [places[0], p]));
  const ac = s.arcColor || '#ffa53c';
  pairs.forEach(([A, B], i) => {
    const k = tm.edit || L.anim === 'none' || L.anim === 'tour' ? 1 : clamp((u * 1.5 * (pairs.length + 1) - i) / 1.5, 0, 1);
    if (k <= 0) return;
    const [, dist] = slerp(A.ll, B.ll, 0.5);
    const h = 0.06 + 0.22 * (dist / Math.PI);
    const N = 48, pts = [];
    for (let j = 0; j <= N * k; j++) { const f = j / N; const [ll] = slerp(A.ll, B.ll, f); pts.push(P(ll[0], ll[1], 1 + h * Math.sin(Math.PI * f))); }
    ctx.save(); ctx.lineCap = 'round';
    ctx.shadowColor = ac; ctx.shadowBlur = 8 * unit;
    for (let j = 1; j < pts.length; j++) {
      const a = pts[j - 1], b = pts[j];
      const vis = (p) => p[2] > 0 || Math.hypot(p[0] - cx, p[1] - cy) > R;
      if (!vis(a) && !vis(b)) continue;
      ctx.strokeStyle = hexA(ac, 0.9); ctx.lineWidth = 2 * unit;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    const head = pts.at(-1);
    if (head && k < 1) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(head[0], head[1], 3 * unit, 0, 7); ctx.fill(); }
    ctx.restore();
  });
  // ---- places + labels (during a tour: only the place being visited, bigger)
  places.forEach((p, i) => {
    const q = P(p.ll[0], p.ll[1]);
    if (q[2] < 0.08) return;
    let k;
    if (L.anim === 'tour' && !tm.edit) { if (focus !== i) return; k = 1; }
    else k = tm.edit || L.anim === 'none' ? 1 : clamp((u * (places.length + 2) - i) / 1.2, 0, 1);
    if (k <= 0) return;
    const big = L.anim === 'tour' && !tm.edit ? 1.5 : 1;
    ctx.save(); ctx.globalAlpha *= k * clamp(q[2] * 3, 0, 1);
    const pulse = (t * 0.8) % 1;
    ctx.strokeStyle = hexA('#ffd23c', 1 - pulse); ctx.lineWidth = 2 * unit; ctx.beginPath(); ctx.ellipse(q[0], q[1], (9 + pulse * 16) * unit * big, (6 + pulse * 10) * unit * big, 0, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#ffd23c'; ctx.beginPath(); ctx.ellipse(q[0], q[1], 9 * unit * big, 6 * unit * big, 0, 0, 7); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(q[0], q[1], 2.5 * unit * big, 0, 7); ctx.fill();
    const lx = q[0] - 60 * unit * big, ly = q[1] - 40 * unit * big;
    ctx.strokeStyle = s.labelColor || '#19c3c9'; ctx.lineWidth = 3 * unit; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(lx, ly); ctx.stroke();
    ctx.font = `600 ${14 * unit * big}px ${UI}`; const tw = ctx.measureText(p.name.toUpperCase()).width + 40 * unit;
    ctx.fillStyle = s.labelColor || '#19c3c9'; ctx.fillRect(lx - tw, ly - 14 * unit * big, tw, 28 * unit * big);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.name.toUpperCase(), lx - tw / 2, ly + 1 * unit);
    ctx.restore();
  });
  ctx.restore();
}
/** Seconds a tour needs (turn first + travel and stay at every place). */
export function tourLength(L) {
  const s = L.style;
  const places = String(s.places || '').split('\n').filter((l) => parseLL(l.split('|')[1] || ''));
  const n = places.length || Math.min(15, parseData(s.data).points.filter((p) => p.name).length);
  return (+s.tourSpin || 0) + n * ((+s.tourMove || 2.6) + (isFinite(+s.tourStay) ? +s.tourStay : 2.2)) + 1;
}
