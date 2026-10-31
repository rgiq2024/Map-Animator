// Realistic articulated high-speed trains for collision scenes: every car is its own 3D body that follows the
// track (so trains bend through curves), on bogies, with an aerodynamic nose, window rows, doors, roof gear,
// a pantograph and overhead-line masts. After the impact the cars buckle and jack-knife.
// Everything is built in metres in a local frame anchored at the start of the line (X east, Y up, Z south),
// so the whole rig is drawn with one model matrix.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const D2R = Math.PI / 180;

export const LIVERIES = {
  ave: { name: 'White · red stripe', body: 0xf2f4f6, stripe: 0xc8102e, roof: 0x5a7db3, skirt: 0x2b2f35 },
  red: { name: 'Red · white stripe', body: 0xcf1f2b, stripe: 0xf3f3f3, roof: 0x55739c, skirt: 0x2a2d31 },
  silver: { name: 'Silver · blue stripe', body: 0xc9ced4, stripe: 0x0b57b8, roof: 0x48688f, skirt: 0x2a2d31 },
  blue: { name: 'Blue · white stripe', body: 0x1d4f8f, stripe: 0xf4f4f4, roof: 0x3d5c86, skirt: 0x22262b },
  green: { name: 'Green · yellow stripe', body: 0x0d7a4c, stripe: 0xf2c200, roof: 0x4a6d8f, skirt: 0x22262b },
  yellow: { name: 'Yellow · grey stripe', body: 0xf2c200, stripe: 0x3a3f46, roof: 0x5a6f88, skirt: 0x2a2d31 },
  pink: { name: 'Pink · blue stripe', body: 0xe23d8f, stripe: 0x18b5e0, roof: 0x55739c, skirt: 0x2a2d31 },
};
export const LIVERY_NAMES = Object.fromEntries(Object.entries(LIVERIES).map(([k, v]) => [k, v.name]));
export const SCENARIOS = { headon: 'Head-on on the same track', rearend: 'Rear-end (one catches up)', sideswipe: 'Derails into a train on the next track' };

// ---------------------------------------------------------------- geometry helpers
const YB = 0.95; // bottom of the body (top of the bogies)
const HALF = [[0, YB], [1.3, YB], [1.44, 1.15], [1.47, 1.45], [1.47, 2.75], [1.43, 3.25], [1.32, 3.6], [1.1, 3.88], [0.75, 4.02], [0.35, 4.08], [0, 4.1]];
const FULL = [...HALF, ...HALF.slice(1, -1).reverse().map(([z, y]) => [-z, y])];

/** Loft a profile [z, y] through stations { x, w, h, dy } (w scales z, h scales height above YB). */
function loft(profile, stations, closed, out = 0) {
  const n = profile.length;
  const pos = [];
  for (const st of stations) {
    for (const [z, y] of profile) {
      const zz = z * st.w * (1 + out), yy = YB + st.dy + (y - YB) * st.h * (1 + out * 0.6);
      pos.push(st.x, yy, zz);
    }
  }
  const idx = [];
  const segs = closed ? n : n - 1;
  for (let s = 0; s < stations.length - 1; s++) {
    for (let j = 0; j < segs; j++) {
      const a = s * n + j, b = s * n + ((j + 1) % n), c = (s + 1) * n + j, d = (s + 1) * n + ((j + 1) % n);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function capAt(x, st, flip) {
  const sh = new THREE.Shape(FULL.map(([z, y]) => new THREE.Vector2(z * st.w, YB + st.dy + (y - YB) * st.h)));
  const g = new THREE.ShapeGeometry(sh);
  g.rotateY(flip ? -Math.PI / 2 : Math.PI / 2);
  g.translate(x, 0, 0);
  return g;
}

const matCache = new Map();
function mats(liv) {
  const key = JSON.stringify(liv);
  if (matCache.has(key)) return matCache.get(key);
  const M = {
    body: new THREE.MeshStandardMaterial({ color: liv.body, metalness: 0.35, roughness: 0.3, side: THREE.DoubleSide }),
    stripe: new THREE.MeshStandardMaterial({ color: liv.stripe, metalness: 0.3, roughness: 0.35, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0d141c, metalness: 0.9, roughness: 0.06, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 }),
    skirt: new THREE.MeshStandardMaterial({ color: liv.skirt, metalness: 0.5, roughness: 0.6 }),
    bogie: new THREE.MeshStandardMaterial({ color: 0x1f2226, metalness: 0.6, roughness: 0.5 }),
    wheel: new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.9, roughness: 0.3 }),
    roof: new THREE.MeshStandardMaterial({ color: liv.roof, metalness: 0.6, roughness: 0.25 }),
    gear: new THREE.MeshStandardMaterial({ color: 0xb9bec5, metalness: 0.5, roughness: 0.45 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff8d8, emissive: 0xfff2b0, emissiveIntensity: 2.5 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.9 }),
  };
  matCache.set(key, M);
  return M;
}
/** Side texture: window row and doors on a transparent strip (y 1.1 … 3.1 m). */
const winCache = new Map();
function windowsTex(len, head, bodyHex) {
  const key = `${len}|${head}|${bodyHex}`;
  if (winCache.has(key)) return winCache.get(key);
  const PX = 48, W = Math.round(len * PX), H = 2 * PX;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const yOf = (y) => (3.1 - y) * PX;
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
  // doors (one near each end on passenger cars)
  const doorsAt = head ? [len * 0.12] : [1.6, len - 2.7];
  const dark = ((bodyHex >> 16) & 255) + ((bodyHex >> 8) & 255) + (bodyHex & 255) < 300;
  for (const dx of doorsAt) {
    g.strokeStyle = dark ? 'rgba(0,0,0,0.45)' : 'rgba(40,45,52,0.55)'; g.lineWidth = 2;
    rr(dx * PX, yOf(3.0), 1.1 * PX, (3.0 - 1.15) * PX, 6); g.stroke();
    g.fillStyle = '#121a24'; rr((dx + 0.25) * PX, yOf(2.85), 0.6 * PX, 0.75 * PX, 5); g.fill();
  }
  // windows
  const x0 = head ? len * 0.2 : 3.2, x1 = head ? len * 0.62 : len - 3.4;
  const pitch = 1.85, ww = 1.32;
  for (let x = x0; x + ww <= x1; x += pitch) {
    g.fillStyle = '#121a24'; rr(x * PX, yOf(2.86), ww * PX, 0.7 * PX, 7); g.fill();
    g.fillStyle = 'rgba(160,190,220,0.18)'; rr((x + 0.08) * PX, yOf(2.82), ww * 0.45 * PX, 0.22 * PX, 4); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  winCache.set(key, t);
  return t;
}

/** One car, centred on X (−L/2 … L/2), nose (if any) towards +X. */
function buildCar(liv, kind, L = 25) {
  const M = mats(liv);
  const G = new THREE.Group();
  const head = kind === 'head';
  const Ln = head ? 10.5 : 0;
  const xa = -L / 2, xb = L / 2 - Ln;
  // body
  const bodySt = [{ x: xa, w: 1, h: 1, dy: 0 }, { x: xb, w: 1, h: 1, dy: 0 }];
  const parts = [loft(FULL, bodySt, true)];
  parts.push(capAt(xa, bodySt[0], true));
  if (!head) parts.push(capAt(xb, bodySt[1], false));
  // nose
  const noseSt = [];
  if (head) {
    const N = 18;
    for (let k = 0; k <= N; k++) {
      const u = k / N;
      noseSt.push({ x: xb + u * Ln, w: 1 - 0.58 * u ** 2.1, h: 1 - 0.7 * u ** 1.45, dy: 0.32 * u ** 3 });
    }
    parts.push(loft(FULL, noseSt, true));
    // rounded tip
    const last = noseSt.at(-1);
    const tip = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI);
    tip.scale(0.55, (4.1 - YB) * last.h * 0.5, 1.47 * last.w);
    tip.translate(last.x, YB + last.dy + (4.1 - YB) * last.h * 0.5, 0);
    parts.push(tip);
  }
  for (const g of parts) G.add(new THREE.Mesh(g, M.body));
  // stripe on both sides, following the nose
  const allSt = head ? [...bodySt.slice(0, 1), ...noseSt] : bodySt;
  for (const side of [1, -1]) {
    const prof = [[1.47 * side, 1.52], [1.47 * side, 1.78]];
    G.add(new THREE.Mesh(loft(prof, allSt, false, 0.006), M.stripe));
  }
  // windscreen on the nose
  if (head) {
    const top = FULL.filter(([, y]) => y >= 3.2);
    const ws = noseSt.filter((_, k) => k >= 3 && k <= 10);
    G.add(new THREE.Mesh(loft(top, ws, false, 0.008), M.glass));
    for (const s of [1, -1]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.34), M.lamp);
      lamp.position.set(xb + Ln * 0.86, YB + 0.62, s * 0.62); lamp.rotation.y = -s * 0.5; G.add(lamp);
    }
  }
  // window strips (texture with transparent background)
  const bodyLen = xb - xa;
  const tex = windowsTex(Math.round(bodyLen), head, liv.body);
  for (const s of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(bodyLen, 2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.05, metalness: 0.3, roughness: 0.2, polygonOffset: true, polygonOffsetFactor: -2 }));
    p.position.set((xa + xb) / 2, 2.1, s * 1.482);
    if (s < 0) p.rotation.y = Math.PI;
    G.add(p);
  }
  // under-floor skirt, bogies and wheels
  const sk = new THREE.Mesh(new THREE.BoxGeometry(L - 8, 0.42, 2.7), M.skirt); sk.position.set(0, YB - 0.2, 0); G.add(sk);
  for (const bx of [xa + 3.1, (head ? xb + Ln * 0.25 : xb - 3.1)]) {
    const fr = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.42, 2.2), M.bogie); fr.position.set(bx, 0.62, 0); G.add(fr);
    for (const ax of [-1.25, 1.25]) for (const z of [-0.74, 0.74]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.16, 18), M.wheel);
      w.rotation.x = Math.PI / 2; w.position.set(bx + ax, 0.46, z); G.add(w);
    }
  }
  // roof gear: blue panels and AC housing
  for (const rx of [-L * 0.22, L * 0.12]) {
    if (head && rx > xb - 2) continue;
    const pn = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.1, 1.3), M.roof); pn.position.set(rx, 4.12, 0); G.add(pn);
  }
  const ac = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.32, 1.5), M.gear); ac.position.set(head ? xa + 4 : 0, 4.2, 0); G.add(ac);
  // gangway bellows at the rear
  const gw = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.8, 2.5), M.rubber); gw.position.set(xa - 0.4, YB + 1.55, 0); G.add(gw);
  // pantograph
  if (head) {
    const px = xa + 8;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 1.2), M.gear); base.position.set(px, 4.2, 0); G.add(base);
    const arm = (x0, y0, x1, y1) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 6), M.bogie);
      c.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); c.rotation.z = Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2; G.add(c);
    };
    arm(px - 0.6, 4.3, px + 0.9, 5.2); arm(px + 0.9, 5.2, px - 0.1, 6.0);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 1.9), M.bogie); bar.position.set(px - 0.1, 6.02, 0); G.add(bar);
  }
  G.userData.len = L;
  return G;
}

// ---------------------------------------------------------------- the rig (both trains + masts)
function localFrame(coords) {
  const [lng0, lat0] = coords[0];
  const kx = 111320 * Math.cos(lat0 * D2R), ky = 110540;
  const pts = coords.map(([x, y]) => [(x - lng0) * kx, -(y - lat0) * ky]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { anchor: [lng0, lat0], pts, cum, S: cum.at(-1) || 1 };
}
/** Point and unit tangent at distance m along the local path (extends straight past the ends). */
function at(P, m) {
  const { pts, cum, S } = P;
  if (pts.length < 2) return { x: 0, z: 0, tx: 1, tz: 0 };
  let i = 1;
  if (m <= 0) i = 1; else if (m >= S) i = pts.length - 1; else while (i < pts.length - 1 && cum[i] < m) i++;
  const a = pts[i - 1], b = pts[i];
  const seg = cum[i] - cum[i - 1] || 1;
  const tx = (b[0] - a[0]) / seg, tz = (b[1] - a[1]) / seg;
  const d = m - cum[i - 1];
  return { x: a[0] + tx * d, z: a[1] + tz * d, tx, tz };
}
function shadowPlane(tex, L) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.05, 4.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.85 }));
  m.rotation.x = -Math.PI / 2;
  const g = new THREE.Group(); g.add(m);
  return g;
}

/** Build the rig for a collision layer. Returns { obj, anchor, update(tm, L) }. */
export function buildTrainRig(L, shadowTex) {
  const s = L.style || {};
  const coords = L.geom.type === 'LineString' ? L.geom.coordinates : L.geom.coordinates[0];
  const P = localFrame(coords);
  const root = new THREE.Group();
  const n = clamp(Math.round(+s.cars || 6), 2, 12);
  const CL = 25, GAP = 0.9, pitch = CL + GAP;
  const k = Math.max(0.5, +s.size || 1); // exaggeration
  const mkTrain = (livKey, color) => {
    const liv = { ...(LIVERIES[livKey] || LIVERIES.ave) };
    if (livKey === 'custom' && color) liv.body = new THREE.Color(color).getHex();
    const cars = [];
    for (let i = 0; i < n; i++) {
      const kind = i === 0 || i === n - 1 ? 'head' : 'mid';
      const car = buildCar(liv, kind, CL);
      if (i === n - 1) car.rotation.y = Math.PI; // tail car faces backwards
      const holder = new THREE.Group(); holder.rotation.order = 'YZX';
      holder.add(car); holder.scale.setScalar(k);
      const sh = shadowPlane(shadowTex, CL * k);
      root.add(holder, sh);
      cars.push({ holder, sh });
    }
    return cars;
  };
  const A = mkTrain(s.liveryA || 'ave', s.colorA);
  const B = mkTrain(s.liveryB || 'red', s.colorB);
  const scen = s.scenario || 'headon';
  const spacing = 4.7;
  const laneA = scen === 'sideswipe' ? spacing / 2 : 0, laneB = scen === 'sideswipe' ? -spacing / 2 : 0;
  // overhead line masts and wires
  if (s.poles !== false) {
    const mastM = new THREE.MeshStandardMaterial({ color: 0xa4aab0, metalness: 0.6, roughness: 0.45 });
    const wireM = new THREE.LineBasicMaterial({ color: 0x2a2d31 });
    const tracks = s.doubleTrack === false ? [laneA] : scen === 'sideswipe' ? [laneA, laneB] : [0, -spacing];
    const side = Math.max(...tracks) + 3.6;
    const far = Math.min(...tracks) - 1.2;
    const step = 60;
    const wires = tracks.map(() => []);
    for (let m = 0; m <= P.S + 0.1; m += step) {
      const p = at(P, m), nx = p.tz, nz = -p.tx;
      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.32, 8.2, 0.32), mastM);
      mast.position.set(p.x + nx * side, 4.1, p.z + nz * side); root.add(mast);
      const armLen = side - far;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, armLen), mastM);
      arm.position.set(p.x + nx * (side + far) / 2, 7.2, p.z + nz * (side + far) / 2);
      arm.rotation.y = Math.atan2(nx, nz);
      root.add(arm);
      tracks.forEach((off, i) => wires[i].push(new THREE.Vector3(p.x + nx * off, 6.3, p.z + nz * off)));
    }
    for (const w of wires) if (w.length > 1) root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(w), wireM));
  }

  const trainLen = n * pitch * k;
  function place(cars, nose, dir, lane, crash) {
    // joints: 0 = nose, i = coupling behind car i-1
    const J = [];
    for (let i = 0; i <= n; i++) {
      const comp = crash.comp ? Math.min(i, 4) * crash.comp : 0;
      const sAlong = nose - dir * (i * pitch * k - comp);
      const zig = i === 0 ? crash.noseLat || 0 : (crash.amp || 0) * (i % 2 ? 1 : -1) * crash.sign * (i <= 3 ? i / 3 : Math.max(0.15, 1 - (i - 3) * 0.28));
      const lat = lane + zig + (crash.slide?.(i) || 0);
      const p = at(P, sAlong);
      const nx = p.tz, nz = -p.tx; // left normal
      J.push({ x: p.x + nx * lat, z: p.z + nz * lat, y: i === 0 ? crash.lift || 0 : i === 1 ? (crash.lift || 0) * 0.25 : 0 });
    }
    for (let i = 0; i < n; i++) {
      const F = J[i], Bk = J[i + 1];
      const cx = (F.x + Bk.x) / 2, cz = (F.z + Bk.z) / 2;
      const dx = F.x - Bk.x, dz = F.z - Bk.z;
      const yaw = Math.atan2(-dz, dx);
      const pitchA = Math.atan2(F.y - Bk.y, Math.hypot(dx, dz) || 1);
      const roll = (crash.roll || 0) * crash.sign * (i % 2 ? 1 : -1) * (i <= 2 ? 1 : Math.max(0.2, 1 - (i - 2) * 0.3)) * (i === 0 ? 0.4 : 1);
      const c = cars[i];
      c.holder.position.set(cx, (F.y + Bk.y) / 2, cz);
      c.holder.rotation.set(roll * D2R, yaw, pitchA);
      c.sh.position.set(cx, 0.04, cz);
      c.sh.rotation.set(0, yaw, 0);
    }
  }

  function update(tm, Lnow) {
    const st = Lnow.style || s;
    const D = Math.max(0.1, +Lnow.duration || 5);
    const p = tm.edit ? 0.82 : clamp(tm.tau / D, 0, 1);
    const tau = tm.edit ? -1 : tm.tau - D;
    const kk = tau < 0 ? 0 : easeOut(tau / 1.5);
    const sv = clamp(+st.severity || 1, 0, 2.5);
    const meet = clamp(+st.meetAt || 0.5, 0.05, 0.95) * P.S;
    const appr = Math.max(50, +st.approach || 450);
    const none = { sign: 1 };
    if (scen === 'rearend') {
      const hA = meet - appr * (1 - p) + 2.2 * sv * kk;
      const hB = meet + trainLen - 0.12 * appr * (1 - p) + 3 * sv * kk;
      place(A, hA, 1, laneA, kk ? { sign: 1, amp: 2.8 * sv * kk, comp: 1.5 * sv * kk, roll: 22 * sv * kk, lift: 2.6 * sv * kk, noseLat: 0.9 * sv * kk } : none);
      place(B, hB, 1, laneB, kk ? { sign: -1, amp: 2.2 * sv * kk, comp: 0.8 * sv * kk, roll: 16 * sv * kk } : none);
    } else if (scen === 'sideswipe') {
      // B derails towards A's track just before they meet, its nose strikes A's second car
      const der = clamp((p - 0.78) / 0.22, 0, 1);
      const hA = meet + pitch * k * 1.3 - appr * (1 - p);
      const hB = meet + appr * (1 - p) - 1.5 * sv * kk;
      const slideB = (i) => (i === 0 ? 1 : i === 1 ? 0.55 : i === 2 ? 0.2 : 0) * (spacing * 0.75 * ease3(der) + 1.2 * sv * kk);
      const slideA = (i) => (i >= 1 && i <= 3 ? (i === 2 ? 1 : 0.6) * 1.6 * sv * kk : 0);
      place(A, hA, 1, laneA, { sign: 1, amp: 1.8 * sv * kk, comp: 0.9 * sv * kk, roll: 20 * sv * kk, slide: slideA });
      place(B, hB, -1, laneB, { sign: -1, amp: 2.6 * sv * kk, comp: 1.6 * sv * kk, roll: 26 * sv * kk, slide: slideB, noseLat: 0 });
    } else {
      const hA = meet - appr * (1 - p) + 4.5 * sv * kk;
      const hB = meet + appr * (1 - p) + 1.5 * sv * kk;
      place(A, hA, 1, laneA, kk ? { sign: 1, amp: 3.2 * sv * kk, comp: 1.7 * sv * kk, roll: 24 * sv * kk, lift: 2.8 * sv * kk, noseLat: 1.4 * sv * kk } : none);
      place(B, hB, -1, laneB, kk ? { sign: -1, amp: 2.8 * sv * kk, comp: 1.8 * sv * kk, roll: 22 * sv * kk, noseLat: -1.6 * sv * kk } : none);
    }
  }
  const ease3 = (u) => u * u * (3 - 2 * u);
  return { obj: root, anchor: P.anchor, update, local: P };
}

/** One train moving along a line (for "3D train on a track"). */
export function buildMovingTrain(L, shadowTex) {
  const s = L.style || {};
  const P = localFrame(L.geom.coordinates);
  const root = new THREE.Group();
  const n = clamp(Math.round(+s.cars || 6), 2, 12);
  const CL = 25, pitch = CL + 0.9, k = Math.max(0.5, +s.size || 1);
  const liv = { ...(LIVERIES[s.livery] || LIVERIES.ave) };
  const cars = [];
  for (let i = 0; i < n; i++) {
    const car = buildCar(liv, i === 0 || i === n - 1 ? 'head' : 'mid', CL);
    if (i === n - 1) car.rotation.y = Math.PI;
    const h = new THREE.Group(); h.add(car); h.scale.setScalar(k);
    const sh = shadowPlane(shadowTex, CL * k);
    root.add(h, sh);
    cars.push({ h, sh });
  }
  function update(tm, Lnow) {
    const D = Math.max(0.1, +Lnow.duration || 6);
    const u = tm.edit ? 0.5 : clamp(tm.tau / D, 0, 1);
    const len = n * pitch * k;
    const nose = len + u * Math.max(0, P.S - len);
    for (let i = 0; i < n; i++) {
      const f = at(P, nose - i * pitch * k), b = at(P, nose - (i + 1) * pitch * k + 0.9 * k);
      const cx = (f.x + b.x) / 2, cz = (f.z + b.z) / 2, yaw = Math.atan2(-(f.z - b.z), f.x - b.x);
      cars[i].h.position.set(cx, 0, cz); cars[i].h.rotation.set(0, yaw, 0);
      cars[i].sh.position.set(cx, 0.04, cz); cars[i].sh.rotation.set(0, yaw, 0);
    }
  }
  return { obj: root, anchor: P.anchor, update, local: P };
}
