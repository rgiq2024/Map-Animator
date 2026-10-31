// Animated people on the map: crowds, protest marches, people walking, gathering or fleeing. Each person is a
// small procedural figure with a walk / run cycle, sized in metres (with an exaggeration factor so they read
// on screen), seen from the side when the map is tilted and from above (heads and shoulders) when it's flat.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const D2R = Math.PI / 180;
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

export const CROWD_BEHAVIOURS = { crowd: 'Crowd (standing, cheering)', walk: 'People walking about', march: 'March along the line (protest)', gather: 'Gathering at the point', flee: 'Running away (panic)' };
export const CROWD_LOOKS = { people: 'Everyday people', protest: 'Protesters (signs and flags)', police: 'Police (helmets)', soldiers: 'Soldiers', medics: 'Medics / rescue', cartoon: 'Cartoon characters', silhouette: 'Silhouettes' };
const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0672f'];
const CLOTHES = ['#d64545', '#3b6fd8', '#f2c200', '#2e9d5b', '#7b4fd8', '#f07f2e', '#222831', '#e8e8e8', '#00a5b8', '#c2185b', '#6d4c41', '#455a64'];
const PANTS = ['#2b3442', '#1f2a44', '#3e3e3e', '#5d4a3a', '#2f4f6f', '#1b1b1b'];
const LOOKS = {
  police: { shirt: ['#16243d'], pants: ['#0f1a2e'], hat: '#0b1220', shield: true },
  soldiers: { shirt: ['#4b5a2a', '#55633a'], pants: ['#3d4a24'], hat: '#3a4520' },
  medics: { shirt: ['#f2f4f6', '#e53935'], pants: ['#2b3442'], cross: true },
  silhouette: { shirt: ['#15181d'], pants: ['#15181d'], skin: ['#15181d'] },
};

const lineOf = (g) => (g?.type === 'LineString' ? g.coordinates : g?.type === 'MultiLineString' ? g.coordinates[0] : null);
function centreOf(g) {
  if (g.type === 'Point') return g.coordinates;
  const pts = g.type === 'Polygon' ? g.coordinates[0] : lineOf(g) || [];
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / Math.max(1, pts.length), y / Math.max(1, pts.length)];
}
function inRing(p, ring) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-12) + xi) ins = !ins;
  }
  return ins;
}

/** People of a layer (cached): { c0, kx, ky, list: [{ x, y (m from c0), ... }], line }. */
const cache = new Map();
function peopleOf(L) {
  const s = L.style;
  const key = JSON.stringify([L.geom, s.count, s.behaviour, s.radius, s.width, s.look, s.seed]);
  const hit = cache.get(L.id);
  if (hit && hit.key === key) return hit.val;
  const g = L.geom;
  const c0 = centreOf(g);
  const kx = 111320 * Math.cos(c0[1] * D2R), ky = 110540;
  const toM = ([lng, lat]) => [(lng - c0[0]) * kx, (lat - c0[1]) * ky];
  const r = rng(hashStr(L.id) + (+s.seed || 0) * 7919);
  const N = clamp(Math.round(+s.count || 120), 1, 800);
  const R = Math.max(5, +s.radius || 40);
  const list = [];
  let line = null;
  const ln = lineOf(g);
  if (ln) {
    const pts = ln.map(toM);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    line = { pts, cum, len: cum.at(-1) || 1 };
  }
  const ring = g.type === 'Polygon' ? g.coordinates[0].map(toM) : null;
  let bbox = null;
  if (ring) { bbox = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, y] of ring) { bbox[0] = Math.min(bbox[0], x); bbox[1] = Math.min(bbox[1], y); bbox[2] = Math.max(bbox[2], x); bbox[3] = Math.max(bbox[3], y); } }
  const randomSpot = () => {
    if (ring) { for (let k = 0; k < 40; k++) { const p = [bbox[0] + r() * (bbox[2] - bbox[0]), bbox[1] + r() * (bbox[3] - bbox[1])]; if (inRing(p, ring)) return p; } return [0, 0]; }
    if (line) { const d = r() * line.len; return [...lineAt(line, d).p]; }
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * R;
    return [Math.cos(a) * rr, Math.sin(a) * rr];
  };
  const look = LOOKS[s.look] || {};
  for (let i = 0; i < N; i++) {
    const base = randomSpot();
    list.push({
      base, a: r() * Math.PI * 2, ph: r() * 10, sp: 0.8 + r() * 0.5, delay: r() * 1.2, lat: (r() - 0.5) * Math.max(2, +s.width || 12), s0: r(),
      hgt: 0.9 + r() * 0.2, skin: (look.skin || SKIN)[Math.floor(r() * (look.skin || SKIN).length)],
      shirt: (look.shirt || CLOTHES)[Math.floor(r() * (look.shirt || CLOTHES).length)], pants: (look.pants || PANTS)[Math.floor(r() * (look.pants || PANTS).length)],
      sign: s.look === 'protest' && r() < 0.32 ? (r() < 0.75 ? 'sign' : 'flag') : '', signCol: ['#ffffff', '#ffe066', '#ff5c5c', '#9be15d'][Math.floor(r() * 4)],
      cheer: r(), pack: Math.sqrt((i + 0.5) / N) * Math.sqrt(N) * 0.75,
    });
  }
  const val = { c0, kx, ky, list, line };
  cache.set(L.id, { key, val });
  return val;
}
function lineAt(line, d) {
  const { pts, cum, len } = line;
  const dd = ((d % len) + len) % len;
  let i = 1;
  while (i < pts.length - 1 && cum[i] < dd) i++;
  const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1, f = (dd - cum[i - 1]) / seg;
  const tx = (b[0] - a[0]) / seg, ty = (b[1] - a[1]) / seg;
  return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], tx, ty };
}

/** Where a person is (metres from c0) and how they move, at time t (s). */
function stateOf(P, i, beh, t, s, data) {
  const R = Math.max(5, +s.radius || 40);
  const v = (+s.speed || 1) * P.sp;
  switch (beh) {
    case 'march': {
      if (!data.line) break;
      const q = lineAt(data.line, P.s0 * data.line.len * 0.6 + 1.3 * v * t);
      return { x: q.p[0] - q.ty * P.lat, y: q.p[1] + q.tx * P.lat, dx: q.tx, dy: q.ty, move: 1.3 * v, run: false };
    }
    case 'walk': {
      const span = data.line ? data.line.len : R * 2;
      const dirx = Math.cos(P.a), diry = Math.sin(P.a);
      const d = 1.25 * v * t + P.ph * 7, tri = Math.abs(((d % (2 * span)) + 2 * span) % (2 * span) - span) - span / 2;
      const back = Math.floor(((d % (2 * span)) + 2 * span) % (2 * span) / span) % 2 ? -1 : 1;
      return { x: P.base[0] + dirx * tri * 0.5, y: P.base[1] + diry * tri * 0.5, dx: dirx * back, dy: diry * back, move: 1.25 * v, run: false };
    }
    case 'gather': {
      const r0 = Math.hypot(P.base[0], P.base[1]) + R * 0.6, ang = Math.atan2(P.base[1], P.base[0]);
      const rr = Math.max(P.pack, r0 - 1.4 * v * Math.max(0, t - P.delay));
      const moving = rr > P.pack + 0.01;
      return { x: Math.cos(ang) * rr, y: Math.sin(ang) * rr, dx: -Math.cos(ang), dy: -Math.sin(ang), move: moving ? 1.4 * v : 0, run: false };
    }
    case 'flee': {
      const ang = Math.atan2(P.base[1], P.base[0]) + (P.ph % 1 - 0.5) * 0.3;
      const r0 = Math.hypot(P.base[0], P.base[1]) * 0.6;
      const rr = r0 + 4.6 * v * Math.max(0, t - P.delay * 0.5);
      return { x: Math.cos(ang) * rr, y: Math.sin(ang) * rr, dx: Math.cos(ang), dy: Math.sin(ang), move: t > P.delay * 0.5 ? 4.6 * v : 0, run: true };
    }
    default: break;
  }
  // crowd: stand, shuffle a little, turn, cheer
  const w = 0.6;
  return { x: P.base[0] + Math.sin(t * 0.35 + P.ph) * w, y: P.base[1] + Math.cos(t * 0.27 + P.ph * 1.3) * w, dx: Math.cos(P.a), dy: Math.sin(P.a), move: 0, run: false, cheer: true };
}

function figure(ctx, x, y, h, P, st, t, s, facing) {
  const look = LOOKS[s.look] || {};
  const cartoon = s.look === 'cartoon';
  const run = st.run;
  const stepRate = st.move > 0 ? (st.move / (run ? 1.6 : 0.75)) * Math.PI : 0;
  const ph = t * stepRate + P.ph;
  const swing = st.move > 0 ? Math.sin(ph) * (run ? 0.8 : 0.45) : 0;
  const bob = st.move > 0 ? Math.abs(Math.sin(ph)) * h * (run ? 0.05 : 0.025) : 0;
  const lean = run ? 0.22 * facing : 0;
  const headR = h * (cartoon ? 0.15 : 0.085);
  const hipY = y - h * 0.47 - bob, shY = y - h * (cartoon ? 0.72 : 0.8) - bob;
  const lw = Math.max(1, h * 0.085);
  ctx.save();
  ctx.translate(x, y); ctx.rotate(lean * 0.6); ctx.translate(-x, -y);
  ctx.lineCap = 'round';
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x + h * 0.06, y, h * 0.16, h * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  // legs
  ctx.strokeStyle = P.pants; ctx.lineWidth = lw * 1.1;
  for (const sg of [1, -1]) {
    const a = swing * sg;
    const kx = x + Math.sin(a) * h * 0.22, ky = hipY + Math.cos(a) * h * 0.22;
    const fx = kx + Math.sin(a * (run ? 0.4 : 0.8) - (run && sg * Math.sin(ph) < 0 ? 0.9 * facing : 0)) * h * 0.24, fy = Math.min(y, ky + h * 0.24);
    ctx.beginPath(); ctx.moveTo(x, hipY); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
  }
  // torso
  ctx.strokeStyle = P.shirt; ctx.lineWidth = lw * 2.4;
  ctx.beginPath(); ctx.moveTo(x, hipY - lw * 0.5); ctx.lineTo(x, shY + lw); ctx.stroke();
  if (look.cross) { ctx.fillStyle = '#e53935'; ctx.fillRect(x - lw * 0.5, (hipY + shY) / 2 - lw * 1.2, lw, lw * 2.4); ctx.fillRect(x - lw * 1.2, (hipY + shY) / 2 - lw * 0.5, lw * 2.4, lw); }
  // arms
  ctx.strokeStyle = P.shirt; ctx.lineWidth = lw * 0.9;
  const cheerUp = st.cheer && s.look !== 'police' && (Math.sin(t * 2.2 + P.cheer * 12) > 0.55 || (P.sign && s.look === 'protest'));
  for (const sg of [1, -1]) {
    let ex, ey;
    if (P.sign && sg === 1) { ex = x + facing * h * 0.08; ey = shY - h * 0.22; }
    else if (cheerUp && sg === -1) { ex = x - facing * h * 0.12; ey = shY - h * 0.24 - Math.sin(t * 8 + P.ph) * h * 0.03; }
    else { const a = -swing * sg * (run ? 1.2 : 1); ex = x + Math.sin(a) * h * 0.3; ey = shY + Math.cos(a) * h * 0.3 * (run ? 0.75 : 1); }
    ctx.beginPath(); ctx.moveTo(x, shY + lw * 0.5); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = P.skin; ctx.beginPath(); ctx.arc(ex, ey, lw * 0.45, 0, Math.PI * 2); ctx.fill();
  }
  // shield
  if (look.shield) { ctx.fillStyle = 'rgba(180,200,220,0.55)'; ctx.strokeStyle = '#0b1220'; ctx.lineWidth = lw * 0.4; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x + facing * h * 0.06 - h * 0.11, shY - h * 0.02, h * 0.22, h * 0.42, h * 0.03) : ctx.rect(x + facing * h * 0.06 - h * 0.11, shY - h * 0.02, h * 0.22, h * 0.42); ctx.fill(); ctx.stroke(); }
  // head
  const hy = shY - headR * 1.15;
  ctx.fillStyle = P.skin; ctx.beginPath(); ctx.arc(x, hy, headR, 0, Math.PI * 2); ctx.fill();
  if (look.hat) { ctx.fillStyle = look.hat; ctx.beginPath(); ctx.arc(x, hy - headR * 0.1, headR * 1.08, Math.PI, 0); ctx.fill(); }
  else if (s.look !== 'silhouette') { ctx.fillStyle = 'rgba(40,25,15,0.85)'; ctx.beginPath(); ctx.arc(x - facing * headR * 0.15, hy - headR * 0.2, headR * 0.95, Math.PI * 1.05, Math.PI * 1.95); ctx.fill(); }
  if (cartoon) { ctx.fillStyle = '#111'; for (const e of [-0.35, 0.35]) { ctx.beginPath(); ctx.arc(x + facing * headR * 0.25 + e * headR * 0.6, hy - headR * 0.05, headR * 0.12, 0, Math.PI * 2); ctx.fill(); } ctx.strokeStyle = '#111'; ctx.lineWidth = headR * 0.1; ctx.beginPath(); ctx.arc(x + facing * headR * 0.25, hy + headR * 0.25, headR * 0.3, 0.2, Math.PI - 0.2); ctx.stroke(); }
  // sign or flag on a stick
  if (P.sign) {
    const sx = x + facing * h * 0.08, top = shY - h * 0.55;
    ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = lw * 0.5; ctx.beginPath(); ctx.moveTo(sx, shY - h * 0.15); ctx.lineTo(sx, top); ctx.stroke();
    if (P.sign === 'sign') {
      const w = h * 0.42, hh = h * 0.26;
      ctx.fillStyle = P.signCol; ctx.fillRect(sx - w / 2, top - hh, w, hh);
      ctx.fillStyle = '#c62828'; ctx.fillRect(sx - w * 0.38, top - hh * 0.72, w * 0.76, hh * 0.14); ctx.fillStyle = '#222'; ctx.fillRect(sx - w * 0.38, top - hh * 0.42, w * 0.6, hh * 0.12);
    } else {
      const w = h * 0.4, hh = h * 0.24, wave = Math.sin(t * 6 + P.ph) * hh * 0.15;
      ctx.fillStyle = s.flagColor || '#e53935';
      ctx.beginPath(); ctx.moveTo(sx, top); ctx.quadraticCurveTo(sx + facing * w * 0.5, top - wave, sx + facing * w, top + wave * 0.5); ctx.lineTo(sx + facing * w, top + hh + wave * 0.5); ctx.quadraticCurveTo(sx + facing * w * 0.5, top + hh - wave, sx, top + hh); ctx.fill();
    }
  }
  ctx.restore();
}

export function drawPeople(ctx, L, tm, o) {
  const { proj, unit } = o;
  const s = L.style;
  if (!L.geom) return;
  const data = peopleOf(L);
  const t = tm.edit ? 1.5 : tm.tau;
  const beh = s.behaviour || 'crowd';
  // metres → pixels around the layer
  const a = proj(data.c0), b = proj([data.c0[0] + 0.0005, data.c0[1]]);
  const pxPerM = Math.hypot(b[0] - a[0], b[1] - a[1]) / (data.kx * 0.0005);
  const hM = 1.75 * (+s.size || 1) * (+s.exaggerate || 3);
  const top = (o.pitch ?? 0) < 18 && s.view !== 'side';
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const items = [];
  const appear = L.anim === 'appear' && !tm.edit ? clamp(tm.tau / Math.max(0.2, +L.duration || 1), 0, 1) : 1;
  data.list.forEach((P, i) => {
    if (appear < 1 && P.s0 > appear) return;
    const st = stateOf(P, i, beh, t, s, data);
    const ll = [data.c0[0] + st.x / data.kx, data.c0[1] + st.y / data.ky];
    const q = proj(ll);
    if (q[0] < -60 || q[1] < -60 || q[0] > W + 60 || q[1] > H + 120) return;
    const q2 = proj([ll[0] + 0.0003, ll[1]]);
    const local = Math.hypot(q2[0] - q[0], q2[1] - q[1]) / (data.kx * 0.0003);
    const persp = pxPerM > 0 ? clamp(local / pxPerM, 0.25, 4) : 1;
    let h = Math.min(hM * pxPerM * persp * P.hgt, 220 * unit);
    if (h < 4 * unit) h = 4 * unit;
    // facing: screen direction of travel
    const q3 = proj([ll[0] + st.dx * 0.00002, ll[1] + st.dy * 0.00002]);
    const facing = q3[0] >= q[0] ? 1 : -1;
    items.push([q, h, P, st, facing, q3]);
  });
  items.sort((x, y) => x[0][1] - y[0][1]);
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  for (const [q, h, P, st, facing, q3] of items) {
    if (top) {
      const ang = Math.atan2(q3[1] - q[1], q3[0] - q[0]);
      const r = h * 0.13;
      ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(ang);
      ctx.fillStyle = P.shirt; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.75, r * 1.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = (LOOKS[s.look] || {}).hat || '#3a2a1e'; ctx.beginPath(); ctx.arc(r * 0.15, 0, r * 0.62, 0, Math.PI * 2); ctx.fill();
      if (P.sign) { ctx.fillStyle = P.signCol; ctx.fillRect(r * 0.6, -r * 1.4, r * 0.5, r * 2.8); }
      ctx.restore();
    } else figure(ctx, q[0], q[1], h, P, st, t, s, facing);
  }
  ctx.restore();
}
