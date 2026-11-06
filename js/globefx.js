// Rotating globe: a realistic Earth (NASA Blue Marble by day, city lights by night, atmosphere, sun flare and
// stars), a night-lights globe, a glowing hologram globe with arcs, and a sci-fi HUD globe. Places with labels,
// great-circle arcs between them and an orbit ring. Drawn with WebGL into the overlay (works over map or video).
import { placeAt, CUSTOM_POS } from './place.js';
import { H } from './cartofx.js';
import { isLand } from './holo.js';

const { clamp, easeOut, ease, UI, hexA, rng, prog, parseLL, track } = H;
const D2R = Math.PI / 180;

export const GL_KINDS = { globe3d: { name: 'Rotating globe', icon: '🌍', geom: null, desc: 'A turning Earth in space — realistic day / night, city lights, glowing hologram or sci-fi HUD — with places, arcs and labels' } };
export const GL_ANIMS = { globe3d: { spin: 'Keeps turning', flyto: 'Turns to the first place, then slowly', zoomin: 'Comes in from far away, then turns', none: 'Still' } };
export const GL_DEFAULTS = {
  globe3d: { anim: 'spin', duration: 6, hold: 0, style: {
    look: 'real', size: 1, position: 'center', lon: 40, lat: 18, speed: 8, tilt: 0,
    space: true, stars: true, sun: true, atmosphere: true, night: true,
    places: '', arcs: '', hub: false, arcColor: '#ffa53c', labelColor: '#19c3c9', orbit: false, timer: false, title: '',
  } },
};
export const GL_FORMS = {
  globe3d: [
    ['style.look', 'Look', 'select', { real: 'Realistic Earth (day, night lights, atmosphere)', night: 'Night — city lights only', holo: 'Glowing hologram dots + arcs', hud: 'Sci-fi HUD globe (red / teal grid)', neon: 'Neon land on dark' }],
    ['style.size', 'Size', 'range', [0.2, 3, 0.02]], ['style.position', 'Position', 'select', { center: 'Centre', left: 'Left', right: 'Right', 'bottom-right': 'Rising from the bottom right', ...CUSTOM_POS }],
    ['style.lon', 'Facing longitude', 'range', [-180, 180, 1]], ['style.lat', 'Facing latitude', 'range', [-70, 70, 1]], ['style.speed', 'Turning speed (°/s, negative = other way)', 'range', [-40, 40, 0.5]],
    ['style.space', 'Black space behind', 'switch'], ['style.stars', 'Stars', 'switch', null, (L) => L.style.space !== false], ['style.sun', 'Sun flare', 'switch', null, (L) => L.style.look === 'real' || L.style.look === 'night'],
    ['style.atmosphere', 'Atmosphere glow', 'switch'], ['style.night', 'Night side with city lights', 'switch', null, (L) => L.style.look === 'real'],
    ['style.places', 'Places — “Name | longitude, latitude” (labels on the globe)', 'cities', 'cities'],
    ['style.arcs', 'Arcs — “From name > To name”, one per line (names from the places)', 'textarea'], ['style.hub', 'Arcs from the first place to all others', 'switch'],
    ['style.arcColor', 'Arc colour', 'color'], ['style.labelColor', 'Label colour', 'color'], ['style.orbit', 'Orbit ring', 'switch'],
    ['style.timer', 'Countdown in the middle (HUD)', 'switch', null, (L) => L.style.look === 'hud'], ['style.title', 'Title (HUD)', 'text', null, (L) => L.style.look === 'hud'],
  ],
};
export const GL_SET = new Set(Object.keys(GL_KINDS));
export const glPhases = () => ['captions'];

// ---------------------------------------------------------------- textures (NASA GIBS, Web Mercator, zoom 3)
const TEX = {
  day: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
  night: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
};
const mosaics = {};
function mosaic(kind) {
  if (mosaics[kind]) return mosaics[kind];
  const Z = 3, N = 2 ** Z, S = 256 * N;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  // a quick land / sea fallback until the tiles arrive (also used offline)
  const img = g.createImageData(S / 4, S / 4);
  for (let y = 0; y < S / 4; y++) {
    const my = 1 - (2 * (y + 0.5)) / (S / 4);
    const lat = (Math.atan(Math.sinh(my * Math.PI)) * 180) / Math.PI;
    for (let x = 0; x < S / 4; x++) {
      const lon = ((x + 0.5) / (S / 4)) * 360 - 180, land = isLand(lon, lat), i = (y * (S / 4) + x) * 4;
      const col = kind === 'night' ? (land ? [18, 14, 8] : [0, 0, 0]) : land ? (Math.abs(lat) > 62 ? [225, 230, 236] : Math.abs(lat) < 30 && lon > -20 && lon < 60 ? [178, 152, 104] : [86, 112, 62]) : [14, 42, 92];
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
  }
  const t = document.createElement('canvas'); t.width = S / 4; t.height = S / 4; t.getContext('2d').putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.drawImage(t, 0, 0, S, S);
  const m = { canvas: c, version: 1, loaded: 0 };
  mosaics[kind] = m;
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    const im = new Image(); im.crossOrigin = 'anonymous';
    track(new Promise((res) => {
      im.onload = () => { g.drawImage(im, tx * 256, ty * 256); m.version++; m.loaded++; res(); };
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
varying vec2 uv; uniform sampler2D day, night; uniform float lon0, lat0, look, nightOn, atm;
const float PI=3.14159265;
void main(){
  float r2=dot(uv,uv); if(r2>1.0){ gl_FragColor=vec4(0.); return; }
  vec3 n=vec3(uv.x, uv.y, sqrt(1.0-r2));
  float lat=asin(clamp(n.y*cos(lat0)+n.z*sin(lat0),-1.,1.));
  float lon=lon0+atan(n.x, n.z*cos(lat0)-n.y*sin(lat0));
  float u=fract(lon/(2.0*PI)+0.5);
  float la=clamp(lat,-1.4835,1.4835);
  float v=0.5-log(tan(PI/4.0+la/2.0))/(2.0*PI);
  vec3 d=texture2D(day, vec2(u,v)).rgb, nl=texture2D(night, vec2(u,v)).rgb;
  vec3 sunDir=normalize(vec3(-0.75,0.35,0.55));
  float diff=dot(n,sunDir);
  float lit=smoothstep(-0.15,0.35,diff);
  vec3 col;
  if(look<0.5){ // realistic
    col=d*(0.12+1.05*lit);
    if(nightOn>0.5) col+=pow(nl,vec3(1.4))*vec3(1.25,0.95,0.55)*1.6*(1.0-lit);
  } else { // night lights
    col=d*vec3(0.05,0.09,0.18)*1.4+pow(nl,vec3(1.3))*vec3(1.3,0.95,0.5)*1.8;
    col+=vec3(0.15,0.35,0.9)*lit*0.25;
  }
  float rim=pow(1.0-n.z,2.5);
  col=mix(col, vec3(0.35,0.65,1.0)*(0.4+lit), rim*0.55*atm);
  float edge=smoothstep(1.0,0.985,sqrt(r2));
  gl_FragColor=vec4(col*edge, edge);
}`;
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { GL = { fail: true }; return GL; }
  gl.useProgram(pr);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
  const tDay = tex(0), tNight = tex(1);
  gl.uniform1i(gl.getUniformLocation(pr, 'day'), 0); gl.uniform1i(gl.getUniformLocation(pr, 'night'), 1);
  const U = (n) => gl.getUniformLocation(pr, n);
  GL = { c, gl, tDay, tNight, U: { lon0: U('lon0'), lat0: U('lat0'), look: U('look'), nightOn: U('nightOn'), atm: U('atm') }, ver: { day: 0, night: 0 } };
  return GL;
}
function renderSphere(size, lon0, lat0, look, nightOn, atm) {
  const G = glInit();
  if (G.fail) return null;
  const { gl } = G;
  const px = clamp(Math.round(size), 64, 2048);
  if (G.c.width !== px) { G.c.width = px; G.c.height = px; }
  gl.viewport(0, 0, px, px);
  // non-power-of-two-safe: the mosaics are 2048² (power of two) so REPEAT works
  for (const [k, unit, t] of [['day', 0, G.tDay], ['night', 1, G.tNight]]) {
    const m = mosaic(k);
    if (G.ver[k] !== m.version) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, m.canvas); G.ver[k] = m.version; } catch { /* tainted: keep fallback */ } }
  }
  gl.uniform1f(G.U.lon0, lon0); gl.uniform1f(G.U.lat0, lat0); gl.uniform1f(G.U.look, look); gl.uniform1f(G.U.nightOn, nightOn ? 1 : 0); gl.uniform1f(G.U.atm, atm ? 1 : 0);
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
function slerp(a, b, f) {
  const toV = ([lo, la]) => [Math.cos(la * D2R) * Math.cos(lo * D2R), Math.cos(la * D2R) * Math.sin(lo * D2R), Math.sin(la * D2R)];
  const A = toV(a), B = toV(b);
  const d = Math.acos(clamp(A[0] * B[0] + A[1] * B[1] + A[2] * B[2], -1, 1));
  if (d < 1e-6) return [a, 0];
  const s1 = Math.sin((1 - f) * d) / Math.sin(d), s2 = Math.sin(f * d) / Math.sin(d);
  const v = [A[0] * s1 + B[0] * s2, A[1] * s1 + B[1] * s2, A[2] * s1 + B[2] * s2];
  return [[Math.atan2(v[1], v[0]) / D2R, Math.asin(clamp(v[2], -1, 1)) / D2R], d];
}

// ---------------------------------------------------------------- draw
export function drawGlobe3d(ctx, L, tm, o, phase) {
  if (phase !== 'captions' || !o.frame) return;
  H.setMap(o.map);
  const s = L.style, fr = o.frame, unit = o.unit, t = o.time || 0;
  const u = prog(L, tm);
  const places = String(s.places || '').split('\n').map((l) => l.split('|').map((v) => v.trim())).filter((r) => r[0]).map(([name, c]) => ({ name, ll: parseLL(c) })).filter((p) => p.ll);
  // orientation
  let lon0 = +s.lon || 0, lat0 = +s.lat || 0;
  const spin = +s.speed || 0, tau = tm.edit ? 0 : tm.tau;
  if (L.anim === 'flyto' && places[0]) {
    const k = ease(clamp(u, 0, 1));
    let tl = places[0].ll[0]; while (tl - lon0 > 180) tl -= 360; while (tl - lon0 < -180) tl += 360;
    lon0 = lon0 + (tl - lon0) * k + Math.max(0, tau - (+L.duration || 6)) * spin * 0.15;
    lat0 = lat0 + (clamp(places[0].ll[1], -60, 60) * 0.8 - lat0) * k;
  } else if (L.anim !== 'none') lon0 += tau * spin;
  // size / position
  let R = Math.min(fr.w, fr.h) * 0.36 * (+s.size || 1);
  if (L.anim === 'zoomin' && !tm.edit) R *= 0.15 + 0.85 * easeOut(clamp(u * 1.2, 0, 1));
  let cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2;
  if (s.position === 'left') cx = fr.x + fr.w * 0.3;
  if (s.position === 'right') cx = fr.x + fr.w * 0.7;
  if (s.position === 'bottom-right') { cx = fr.x + fr.w * 0.72; cy = fr.y + fr.h * 0.95; }
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  // space
  if (s.space !== false) {
    ctx.fillStyle = '#02040a'; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
    if (s.stars !== false) { const r = rng(7); for (let i = 0; i < 420; i++) { const b = r(); ctx.fillStyle = `rgba(255,255,255,${0.15 + b * 0.75 * (0.75 + 0.25 * Math.sin(t * 2 + i))})`; const sz = b > 0.97 ? 1.8 : 1; ctx.fillRect(fr.x + r() * fr.w, fr.y + r() * fr.h, sz * unit * 0.8, sz * unit * 0.8); } }
  }
  const [dx, dy] = placeAt(ctx, L, fr, cx - R, cy - R, R * 2, R * 2);
  void dx; void dy;
  const look = s.look || 'real';
  const P = (lon, lat, lift = 1) => { const p = project(lon, lat, lon0, lat0); return [cx + p[0] * R * lift, cy - p[1] * R * lift, p[2]]; };
  // ---- the sphere
  if (s.atmosphere !== false && look !== 'hud') {
    const g = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.22);
    const ac = look === 'holo' || look === 'neon' ? '#38d9ff' : '#3f8cff';
    g.addColorStop(0, hexA(ac, look === 'night' ? 0.35 : 0.55)); g.addColorStop(1, hexA(ac, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.22, 0, 7); ctx.fill();
  }
  if (look === 'real' || look === 'night') {
    const S = Math.abs(ctx.getTransform().a) || 1;
    const img = renderSphere(R * 2 * S, lon0 * D2R, lat0 * D2R, look === 'real' ? 0 : 1, s.night !== false, s.atmosphere !== false);
    if (img) ctx.drawImage(img, cx - R, cy - R, R * 2, R * 2);
    if (s.sun !== false) {
      const sx = cx - R * 0.86, sy = cy - R * 0.5;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 0.55); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.08, 'rgba(210,230,255,0.9)'); g.addColorStop(0.3, 'rgba(90,150,255,0.25)'); g.addColorStop(1, 'rgba(60,120,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, R * 0.55, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(200,225,255,0.35)'; ctx.lineWidth = 1.2 * unit;
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + 0.2, l = R * (i % 3 ? 0.25 : 0.42); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); ctx.stroke(); }
      ctx.restore();
    }
  } else {
    // dotted globes
    const body = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
    body.addColorStop(0, look === 'hud' ? 'rgba(20,10,14,0.85)' : 'rgba(6,30,48,0.75)'); body.addColorStop(1, look === 'hud' ? 'rgba(5,4,8,0.9)' : 'rgba(2,10,20,0.85)');
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    const pts = landPts(), d = Math.max(1, R / 150) * unit;
    if (look === 'holo' || look === 'neon') ctx.globalCompositeOperation = 'lighter';
    for (const [lo, la] of pts) {
      const p = P(lo, la);
      if (p[2] < -0.05) continue;
      const f = clamp(p[2], 0, 1);
      if (look === 'hud') { const k = (la + 60) / 140; ctx.fillStyle = `rgba(${Math.round(230 - 120 * k)},${Math.round(70 + 120 * k)},${Math.round(80 + 70 * k)},${0.35 + 0.65 * f})`; ctx.fillRect(p[0] - d * 1.1, p[1] - d * 1.1, d * 2.2, d * 2.2); }
      else if (look === 'neon') { ctx.fillStyle = `rgba(${Math.round(90 + 140 * (lo > 0 ? 0.8 : 0.2))},${Math.round(230 - 40 * (lo > 0 ? 1 : 0))},${Math.round(200 - 120 * (lo > 0 ? 1 : 0))},${0.25 + 0.6 * f})`; ctx.fillRect(p[0] - d, p[1] - d, d * 2, d * 2); }
      else { ctx.fillStyle = `rgba(120,225,255,${0.2 + 0.6 * f})`; ctx.fillRect(p[0] - d * 0.8, p[1] - d * 0.8, d * 1.6, d * 1.6); }
    }
    // glowing "cities" on hologram globes
    if (look === 'holo' || look === 'neon') {
      const r = rng(11);
      for (let i = 0; i < 70; i++) {
        const q = pts[Math.floor(r() * pts.length)]; const p = P(q[0], q[1]);
        if (p[2] < 0.05) continue;
        const tw = 0.6 + 0.4 * Math.sin(t * 3 + i);
        const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 7 * unit); g.addColorStop(0, `rgba(255,190,90,${0.9 * tw * p[2]})`); g.addColorStop(1, 'rgba(255,160,60,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], 7 * unit, 0, 7); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
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
    } else {
      ctx.strokeStyle = 'rgba(120,225,255,0.45)'; ctx.lineWidth = 1 * unit; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    }
  }
  // ---- orbit ring
  if (s.orbit) {
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
    const k = tm.edit || L.anim === 'none' ? 1 : clamp((u * 1.5 * (pairs.length + 1) - i) / 1.5, 0, 1);
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
  // ---- places + labels
  places.forEach((p, i) => {
    const q = P(p.ll[0], p.ll[1]);
    if (q[2] < 0.08) return;
    const k = tm.edit || L.anim === 'none' ? 1 : clamp((u * (places.length + 2) - i) / 1.2, 0, 1);
    if (k <= 0) return;
    ctx.save(); ctx.globalAlpha *= k * clamp(q[2] * 3, 0, 1);
    ctx.strokeStyle = '#ffd23c'; ctx.lineWidth = 2 * unit; ctx.beginPath(); ctx.ellipse(q[0], q[1], 9 * unit, 6 * unit, 0, 0, 7); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(q[0], q[1], 2.5 * unit, 0, 7); ctx.fill();
    const lx = q[0] - 60 * unit, ly = q[1] - 40 * unit;
    ctx.strokeStyle = s.labelColor || '#19c3c9'; ctx.lineWidth = 3 * unit; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(lx, ly); ctx.stroke();
    ctx.font = `600 ${14 * unit}px ${UI}`; const tw = ctx.measureText(p.name.toUpperCase()).width + 40 * unit;
    ctx.fillStyle = s.labelColor || '#19c3c9'; ctx.fillRect(lx - tw, ly - 14 * unit, tw, 28 * unit);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.name.toUpperCase(), lx - tw / 2, ly + 1 * unit);
    ctx.restore();
  });
  ctx.restore();
}
