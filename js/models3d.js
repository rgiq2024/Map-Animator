// Real 3D models on the map: built-in vehicles, buildings and structures, realistic NASA models, your own
// GLB/glTF files, train/vehicle collisions and a procedural 3D city — rendered with three.js inside a MapLibre
// custom layer (so they tilt, rotate and export with the map). Lit with a studio environment and soft shadows.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/loaders/GLTFLoader.js';
import { DRACOLoader } from './vendor/three/loaders/DRACOLoader.js';
import { RoomEnvironment } from './vendor/three/environments/RoomEnvironment.js';
import { getMedia } from './store.js';
import { BUILTIN_MODELS } from './modelnames.js';

export { BUILTIN_MODELS };
let draco = null;
function gltfLoader() {
  const l = new GLTFLoader();
  draco ||= new DRACOLoader().setDecoderPath(new URL('./vendor/three/draco/', import.meta.url).href);
  l.setDRACOLoader(draco);
  return l;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const D2R = Math.PI / 180;

// ---------------------------------------------------------------- built-in models (forward = +X, up = +Y)
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, metalness: o.m ?? 0.35, roughness: o.r ?? 0.55, emissive: o.e || 0x000000, emissiveIntensity: o.ei ?? 1, side: THREE.DoubleSide, transparent: !!o.t, opacity: o.t ?? 1 });
function wing(pts, thick, m) {
  const sh = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? sh.lineTo(x, z) : sh.moveTo(x, z)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  g.translate(0, thick / 2, 0);
  return new THREE.Mesh(g, m);
}
function cyl(r1, r2, len, m, seg = 16) {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg);
  g.rotateZ(-Math.PI / 2);
  return new THREE.Mesh(g, m);
}
// facade textures (windows) — day and night variants, cached
const texCache = new Map();
function facadeTex(kind = 'office', night = false) {
  const key = `${kind}|${night}`;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const base = { office: night ? '#1b2330' : '#9fb3c8', glass: night ? '#0e1a2a' : '#5f86ad', concrete: night ? '#2a2a2c' : '#c9c3b8', brick: night ? '#2b1c18' : '#a65f45', house: night ? '#2a2420' : '#e8dfcf' }[kind] || '#9fb3c8';
  g.fillStyle = base; g.fillRect(0, 0, 64, 64);
  const r = Math.random;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const lit = night ? (r() < 0.55 ? `rgba(255,${200 + r() * 40 | 0},${120 + r() * 60 | 0},${0.7 + r() * 0.3})` : 'rgba(20,24,30,1)') : kind === 'glass' ? `rgba(${150 + r() * 40 | 0},${185 + r() * 30 | 0},${215 + r() * 30 | 0},1)` : 'rgba(40,58,78,0.9)';
    g.fillStyle = lit;
    if (kind === 'glass') g.fillRect(x * 16 + 1, y * 16 + 1, 14, 14);
    else g.fillRect(x * 16 + 4, y * 16 + 4, 9, 9);
  }
  if (kind === 'glass') { g.fillStyle = night ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.18)'; for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 1, 64); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
/** Box with UVs in metres / (floor height) so window textures repeat at real size. */
function boxM(w, h, d, floor = 3.6, bay = 4) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const fw = ax > 0.5 ? d : ay > 0.5 ? w : w;
    const fh = ay > 0.5 ? d : h;
    uv.setXY(i, uv.getX(i) * (fw / (bay * 4)), uv.getY(i) * (fh / (floor * 4)));
  }
  return g;
}
function wheelSet(G, xs, z, r, m, y = r) {
  for (const x of xs) for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 0.5, 16), m);
    w.rotation.x = Math.PI / 2; w.position.set(x, y, s * z); G.add(w);
  }
}
function railCar(G, x0, len, body, stripe, glass, dark, loco) {
  const h = 4.1, w = 3.1;
  const car = new THREE.Mesh(new THREE.BoxGeometry(len, h - 1, w), body); car.position.set(x0 - len / 2, 1.0 + (h - 1) / 2, 0); G.add(car);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, len, 16, 1, false, 0, Math.PI), body); roof.rotation.z = Math.PI / 2; roof.rotation.x = Math.PI / 2; roof.scale.set(1, 1, 0.35); roof.position.set(x0 - len / 2, h, 0); G.add(roof);
  const band = new THREE.Mesh(new THREE.BoxGeometry(len * 0.96, 0.9, w + 0.04), glass); band.position.set(x0 - len / 2, 2.9, 0); G.add(band);
  const st = new THREE.Mesh(new THREE.BoxGeometry(len * 0.98, 0.25, w + 0.05), stripe); st.position.set(x0 - len / 2, 1.9, 0); G.add(st);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 0.7, w * 0.9), dark); skirt.position.set(x0 - len / 2, 0.6, 0); G.add(skirt);
  wheelSet(G, [x0 - len * 0.15, x0 - len * 0.22, x0 - len * 0.78, x0 - len * 0.85], 1.0, 0.45, dark, 0.45);
  if (loco) {
    const nose = new THREE.Mesh(new THREE.SphereGeometry(w / 2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), body);
    nose.rotation.z = -Math.PI / 2; nose.scale.set(1.2, 2.2, 1); nose.position.set(x0, 2.1, 0); G.add(nose);
    const ws = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, w * 0.8), glass); ws.position.set(x0 + 0.9, 3.0, 0); ws.rotation.z = -0.5; G.add(ws);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat(0xfff6c0, { e: 0xfff0a0, ei: 2 })); lamp.position.set(x0 + 2.4, 1.6, 0); G.add(lamp);
  }
}
function buildModel(kind, accent = '#ff3b30') {
  const G = new THREE.Group();
  const grey = mat(0x9aa3ad), dark = mat(0x3c434a), white = mat(0xf2f4f6, { m: 0.2, r: 0.4 }), acc = mat(accent, { m: 0.2 });
  const glass = mat(0x1e5a8a, { m: 0.9, r: 0.1 });
  const add = (o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); G.add(o); return o; };
  if (kind === 'jet') {
    add(cyl(0.5, 0.75, 9, grey), 0, 0, 0);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.5, 16), grey); nose.rotation.z = -Math.PI / 2; add(nose, 5.7, 0, 0);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass), 2.6, 0.45, 0).scale.set(2.2, 1, 1);
    add(wing([[1.5, 0], [-2.5, 5], [-3.6, 5], [-2.6, 0], [-3.6, -5], [-2.5, -5]], 0.18, grey), 0, -0.1, 0);
    add(wing([[-3, 0], [-4.5, 2.3], [-5.1, 2.3], [-4.6, 0], [-5.1, -2.3], [-4.5, -2.3]], 0.12, grey), 0, 0, 0);
    const fin = wing([[-2.6, 0], [-4.2, 2.6], [-4.9, 2.6], [-4.6, 0]], 0.12, dark); fin.rotation.x = -Math.PI / 2; add(fin, 0, 0.3, 0.06);
    add(cyl(0.55, 0.5, 0.6, mat(0x222222)), -4.8, 0, 0);
    add(new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.2, 12), mat(0xffa030, { e: 0xff7a10, ei: 2, t: 0.85 })), -6, 0, 0).rotation.z = Math.PI / 2;
    add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.6), acc), -2.6, 0.05, 4.2);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.6), acc), -2.6, 0.05, -4.2);
  } else if (kind === 'airliner') {
    add(cyl(1.6, 1.6, 30, white, 20), 0, 0, 0);
    add(new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 12), white), 15, 0, 0).scale.set(1.6, 1, 1);
    add(new THREE.Mesh(new THREE.ConeGeometry(1.6, 6, 20), white), -18, 0.4, 0).rotation.z = Math.PI / 2;
    add(wing([[3, 0], [-6, 17], [-9, 17], [-4, 0], [-9, -17], [-6, -17]], 0.4, white), 0, -0.6, 0);
    add(wing([[-15, 0], [-19, 6], [-21, 6], [-19, 0], [-21, -6], [-19, -6]], 0.25, white), 0, 0.8, 0);
    const fin = wing([[-14, 0], [-19, 7], [-21.5, 7], [-20, 0]], 0.25, acc); fin.rotation.x = -Math.PI / 2; add(fin, 0, 1, 0.12);
    for (const s of [-1, 1]) add(cyl(0.9, 0.9, 4, grey), 0, -1.4, s * 6);
    add(new THREE.Mesh(new THREE.BoxGeometry(26, 0.3, 0.1), acc), 0, 0.3, 1.62);
  } else if (kind === 'drone') {
    add(cyl(0.35, 0.3, 8, grey), 0, 0, 0);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 10), grey), 3.6, 0.2, 0).scale.set(1.6, 1, 1);
    add(wing([[0.6, 0], [0.3, 10], [-0.6, 10], [-0.6, 0], [-0.6, -10], [0.3, -10]], 0.12, grey), 0, 0.1, 0);
    const v1 = wing([[-3.2, 0], [-4, 2], [-4.6, 2], [-4.2, 0]], 0.1, grey); v1.rotation.x = -Math.PI / 2 + 0.6; add(v1, 0, 0.1, 0);
    const v2 = wing([[-3.2, 0], [-4, 2], [-4.6, 2], [-4.2, 0]], 0.1, grey); v2.rotation.x = -Math.PI / 2 - 0.6; add(v2, 0, 0.1, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.8, 0.15), dark), -4.2, 0, 0);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), acc), 3.2, -0.4, 0);
  } else if (kind === 'helicopter') {
    add(new THREE.Mesh(new THREE.SphereGeometry(1.4, 20, 14), mat(0x5d6b4f)), 0.5, 0, 0).scale.set(1.8, 1, 1);
    add(cyl(0.35, 0.18, 7, mat(0x5d6b4f)), -4, 0.4, 0);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 10), glass), 2.2, 0.3, 0).scale.set(1.2, 0.9, 1);
    const rotor = add(new THREE.Group(), 0.4, 1.6, 0);
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.05, 0.3), dark); b.position.x = 3.2; const h = new THREE.Group(); h.rotation.y = (i * Math.PI) / 2; h.add(b); rotor.add(h); }
    rotor.userData.spin = 30;
    const tail = add(new THREE.Group(), -7.4, 0.6, 0.3);
    for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 0.05), dark); b.rotation.z = (i * Math.PI) / 2; tail.add(b); }
    tail.userData.spinZ = 40;
    for (const s of [-1, 1]) add(cyl(0.08, 0.08, 3.4, dark), 0.6, -1.4, s * 0.9);
  } else if (kind === 'missile') {
    add(cyl(0.3, 0.3, 6, white), 0, 0, 0);
    add(new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.4, 16), acc), 3.7, 0, 0).rotation.z = -Math.PI / 2;
    for (let i = 0; i < 4; i++) { const f = wing([[-2, 0], [-3, 0.9], [-3.1, 0.9], [-3, 0]], 0.05, dark); f.rotation.x = (i * Math.PI) / 2; add(f); }
    add(new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.4, 12), mat(0xffb040, { e: 0xff8020, ei: 2.5, t: 0.85 })), -4.2, 0, 0).rotation.z = Math.PI / 2;
  } else if (kind === 'rocket') {
    add(cyl(1.2, 1.2, 30, white, 24), 0, 0, 0);
    add(new THREE.Mesh(new THREE.ConeGeometry(1.2, 5, 24), white), 17.5, 0, 0).rotation.z = -Math.PI / 2;
    add(cyl(1.22, 1.22, 2, dark, 24), 6, 0, 0);
    for (let i = 0; i < 4; i++) { const f = wing([[-12, 0], [-15, 2.4], [-15.2, 2.4], [-15, 0]], 0.15, dark); f.rotation.x = (i * Math.PI) / 2; add(f); }
    add(new THREE.Mesh(new THREE.ConeGeometry(1, 7, 16), mat(0xffc040, { e: 0xff9020, ei: 3, t: 0.85 })), -18.5, 0, 0).rotation.z = Math.PI / 2;
  } else if (kind === 'satellite' || kind === 'iss') {
    const gold = mat(0xd4a83a, { m: 0.9, r: 0.3 }), panel = mat(0x1f4e9c, { m: 0.6, r: 0.25 });
    if (kind === 'satellite') {
      add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 2.2), gold));
      for (const s of [-1, 1]) {
        add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.2), grey), 0, 0, s * 1.7);
        add(new THREE.Mesh(new THREE.BoxGeometry(2, 0.06, 5.5), panel), 0, 0, s * 5.1);
      }
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.2, 0.6, 20), white), 0, -1.4, 0).rotation.x = Math.PI;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.8, 12), dark), 1.5, -0.4, 0);
    } else {
      add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 50), grey));
      for (const z of [-21, -14, 14, 21]) for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 3.6), gold), s * 6.2, 0, z);
      add(cyl(2.1, 2.1, 30, white, 20), 0, -1.6, 0);
      add(cyl(2.1, 2.1, 12, white, 20), 0, -1.6, 0).rotation.y = Math.PI / 2;
      for (const z of [-6, 6]) add(new THREE.Mesh(new THREE.BoxGeometry(4, 0.08, 1.5), mat(0xf0f0f0)), 6, -1.6, z);
    }
  } else if (kind === 'warship') {
    const hull = new THREE.Shape();
    [[60, 0], [40, 7], [-55, 7], [-60, 4], [-60, -4], [-55, -7], [40, -7]].forEach(([x, z], i) => (i ? hull.lineTo(x, z) : hull.moveTo(x, z)));
    const hg = new THREE.ExtrudeGeometry(hull, { depth: 6, bevelEnabled: false }); hg.rotateX(Math.PI / 2); hg.translate(0, 3, 0);
    add(new THREE.Mesh(hg, mat(0x6b7780)));
    add(new THREE.Mesh(new THREE.BoxGeometry(30, 7, 9), mat(0x8994a0)), -10, 6, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(12, 6, 7), mat(0x9aa5b0)), -8, 12, 0);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 14, 8), dark), -8, 20, 0);
    add(new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 2, 16), dark), 30, 4, 0);
    add(cyl(0.4, 0.4, 9, dark), 35, 4.5, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 5), acc), -40, 3.1, 0);
  } else if (kind === 'tank') {
    const olive = mat(0x5d6b45, { m: 0.2, r: 0.8 });
    for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(8, 1.3, 1.1), mat(0x2f3527, { r: 0.9 })), 0, 0.65, s * 1.75);
    add(new THREE.Mesh(new THREE.BoxGeometry(7.4, 1.4, 3.2), olive), 0, 1.4, 0);
    add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 1, 18), olive), -0.4, 2.5, 0);
    add(cyl(0.18, 0.18, 6, olive), 3, 2.6, 0);
  } else if (kind === 'train' || kind === 'tram' || kind === 'freight') {
    const body = mat(kind === 'freight' ? 0x6b4a32 : 0xeef1f4, { m: 0.4, r: 0.35 }), stripe = acc, dk = mat(0x23272d, { r: 0.8 });
    const gl2 = mat(0x16324f, { m: 0.9, r: 0.08 });
    const n = kind === 'tram' ? 2 : kind === 'freight' ? 5 : 4, len = kind === 'tram' ? 14 : 22;
    railCar(G, 0, len, kind === 'freight' ? mat(0x30343a) : body, stripe, gl2, dk, true);
    for (let i = 1; i < n; i++) {
      if (kind === 'freight') {
        const x0 = -i * (len + 1);
        const flat = new THREE.Mesh(new THREE.BoxGeometry(len, 0.6, 3), dk); flat.position.set(x0 - len / 2, 1.1, 0); G.add(flat);
        const cont = new THREE.Mesh(boxM(len * 0.92, 2.6, 2.5, 2.6, len / 3), mat([0xc0392b, 0x2471a3, 0xd68910, 0x1e8449][i % 4], { r: 0.6 })); cont.position.set(x0 - len / 2, 2.7, 0); G.add(cont);
        wheelSet(G, [x0 - len * 0.15, x0 - len * 0.85], 1.0, 0.45, dk, 0.45);
      } else railCar(G, -i * (len + 0.8), len, body, stripe, gl2, dk, false);
    }
    if (kind === 'tram') { const p = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.1), dk); p.position.set(-6, 5.2, 0); p.rotation.z = 0.5; G.add(p); }
  } else if (kind === 'car') {
    const paint = mat(accent, { m: 0.6, r: 0.25 });
    const sh = new THREE.Shape();
    [[2.3, 0.35], [2.25, 0.85], [1.0, 1.0], [0.4, 1.45], [-1.0, 1.45], [-1.8, 1.0], [-2.3, 0.95], [-2.3, 0.35]].forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.8, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 3 }); g.translate(0, 0, -0.9);
    add(new THREE.Mesh(g, paint));
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.42, 1.86), glass); add(win, -0.3, 1.18, 0);
    wheelSet(G, [1.4, -1.45], 0.92, 0.36, dark, 0.36);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 1.4), mat(0xfff6d0, { e: 0xfff0b0, ei: 1.5 })), 2.36, 0.7, 0);
  } else if (kind === 'bus') {
    const paint = mat(accent, { m: 0.3, r: 0.4 });
    add(new THREE.Mesh(new THREE.BoxGeometry(12, 2.8, 2.5), paint), 0, 1.9, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.9, 2.54), glass), -0.3, 2.45, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 2.2), glass), 6.02, 2.2, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(12.02, 0.3, 2.52), white), 0, 3.15, 0);
    wheelSet(G, [4, -3.6], 1.15, 0.5, dark, 0.5);
  } else if (kind === 'truck') {
    add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 3, 2.5), mat(accent, { m: 0.4, r: 0.35 })), 6.2, 2.0, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 2.2), glass), 7.52, 2.7, 0);
    add(new THREE.Mesh(boxM(11, 3.2, 2.5, 3.2, 3), mat(0xdfe3e8, { r: 0.6 })), -0.6, 2.4, 0);
    wheelSet(G, [6.4, 1.5, -4, -5.2], 1.2, 0.5, dark, 0.5);
  } else if (kind === 'containership' || kind === 'tanker' || kind === 'boat') {
    const L2 = kind === 'boat' ? 12 : 180, B = kind === 'boat' ? 3.4 : 30, D2 = kind === 'boat' ? 1.6 : 14;
    const hull = new THREE.Shape();
    [[L2 / 2, 0], [L2 / 2 - B * 0.9, B / 2], [-L2 / 2 + 2, B / 2], [-L2 / 2, B / 2 - 2], [-L2 / 2, -B / 2 + 2], [-L2 / 2 + 2, -B / 2], [L2 / 2 - B * 0.9, -B / 2]].forEach(([x, z], i) => (i ? hull.lineTo(x, z) : hull.moveTo(x, z)));
    const hg = new THREE.ExtrudeGeometry(hull, { depth: D2, bevelEnabled: false }); hg.rotateX(Math.PI / 2); hg.translate(0, D2, 0);
    add(new THREE.Mesh(hg, mat(kind === 'boat' ? 0xf4f6f8 : 0x1f3b57, { r: 0.6 })));
    add(new THREE.Mesh(new THREE.BoxGeometry(L2 * 0.98, D2 * 0.25, B * 1.01), mat(kind === 'boat' ? accent : 0xa83232, { r: 0.7 })), -L2 * 0.01, D2 * 0.12, 0);
    if (kind === 'containership') {
      const cols = [0xc0392b, 0x2471a3, 0xd68910, 0x1e8449, 0x7d3c98, 0xe5e7e9, 0x34495e];
      let k = 0;
      for (let x = L2 / 2 - B; x > -L2 / 2 + 34; x -= 13.5) for (let z = -B / 2 + 3; z < B / 2 - 2; z += 2.8) {
        const hgt = 2 + ((k * 7) % 4);
        const c = new THREE.Mesh(boxM(12.5, hgt * 2.6, 2.5, 2.6, 4), mat(cols[(k++) % cols.length], { r: 0.7 }));
        c.position.set(x, D2 + hgt * 1.3, z); G.add(c);
      }
    } else if (kind === 'tanker') {
      add(new THREE.Mesh(new THREE.BoxGeometry(L2 * 0.7, 1, B * 0.9), mat(0x7a2e2e)), 12, D2 + 0.5, 0);
      add(cyl(0.6, 0.6, L2 * 0.68, mat(0xc8a03a, { m: 0.6 })), 12, D2 + 1.5, 0);
    }
    if (kind !== 'boat') {
      add(new THREE.Mesh(boxM(20, 18, B * 0.8, 3, 3), mat(0xf2f2f2, { r: 0.5 })), -L2 / 2 + 16, D2 + 9, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(6, 2, B), white), -L2 / 2 + 16, D2 + 18.5, 0);
      add(cyl(2.2, 2.6, 9, mat(0x222222)).rotateZ(Math.PI / 2), -L2 / 2 + 8, D2 + 14, 0);
    } else {
      add(new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 2.6), glass), 0.5, D2 + 0.6, 0);
    }
  } else if (kind === 'bomber') {
    const sh = new THREE.Shape();
    [[11, 0], [-2, 26], [-5.5, 24], [-3.5, 20], [-7, 16], [-5, 12], [-8.5, 7], [-6, 0], [-8.5, -7], [-5, -12], [-7, -16], [-3.5, -20], [-5.5, -24], [-2, -26]].forEach(([x, z], i) => (i ? sh.lineTo(x, z) : sh.moveTo(x, z)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.8, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.6, bevelSegments: 4 }); g.rotateX(Math.PI / 2); g.translate(0, 0.4, 0);
    const skin = mat(0x3d4249, { m: 0.5, r: 0.5 });
    add(new THREE.Mesh(g, skin));
    add(new THREE.Mesh(new THREE.SphereGeometry(2.2, 20, 12), skin), 3, 0.6, 0).scale.set(3.2, 0.6, 1.3);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass), 6.5, 1.2, 0).scale.set(1.6, 0.5, 1.2);
  } else if (kind === 'cargoplane') {
    const skin = mat(0x8a949c, { m: 0.4, r: 0.45 });
    const prof = [[0, 0.01], [1.6, 0.8], [2.2, 2], [2.3, 6], [2.3, 22], [1.8, 27], [0.8, 30], [0.3, 31]];
    const lg = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 20); lg.rotateZ(-Math.PI / 2); lg.translate(14, 0, 0);
    add(new THREE.Mesh(lg, skin));
    add(wing([[2, 0], [0, 20], [-2.5, 20], [-2.5, 0], [-2.5, -20], [0, -20]], 0.5, skin), 4, 2.1, 0);
    add(wing([[-12, 0], [-14.5, 7], [-16.5, 7], [-16, 0], [-16.5, -7], [-14.5, -7]], 0.3, skin), 0, 3.4, 0);
    const fin = wing([[-11, 0], [-14.5, 8], [-16.5, 8], [-16, 0]], 0.3, skin); fin.rotation.x = -Math.PI / 2; add(fin, 0, 2, 0.15);
    for (const z of [-11, -5.5, 5.5, 11]) {
      add(cyl(0.7, 0.6, 3.5, mat(0x5f676e)), 4.5, 1.7, z);
      const prop = add(new THREE.Group(), 6.4, 1.7, z);
      for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.6, 0.35), dark); b.rotation.x = (i * Math.PI) / 2; prop.add(b); }
      prop.userData.spinX = 40;
    }
  } else if (kind === 'skyscraper' || kind === 'tower' || kind === 'house' || kind === 'lighthouse') {
    if (kind === 'skyscraper') {
      add(new THREE.Mesh(boxM(30, 160, 30), mat(0xffffff, { m: 0.5, r: 0.2 })), 0, 80, 0).material.map = facadeTex('glass');
      add(new THREE.Mesh(boxM(22, 40, 22), mat(0xffffff, { m: 0.5, r: 0.2 })), 0, 180, 0).material.map = facadeTex('glass');
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 30, 8), grey), 0, 215, 0);
    } else if (kind === 'tower') {
      let y = 0;
      for (const [w, h] of [[40, 120], [32, 120], [24, 110], [16, 100], [9, 90]]) { add(new THREE.Mesh(boxM(w, h, w), mat(0xffffff, { m: 0.6, r: 0.2 })), 0, y + h / 2, 0).material.map = facadeTex('glass'); y += h; }
      add(new THREE.Mesh(new THREE.ConeGeometry(3, 180, 12), mat(0xd8dde2, { m: 0.8, r: 0.2 })), 0, y + 90, 0);
    } else if (kind === 'house') {
      add(new THREE.Mesh(boxM(10, 6, 8, 3, 3), mat(0xffffff, { r: 0.8 })), 0, 3, 0).material.map = facadeTex('house');
      const roof = new THREE.Mesh(new THREE.ConeGeometry(7.6, 4, 4), mat(0xa0402a, { r: 0.8 })); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.8); add(roof, 0, 8, 0);
    } else {
      add(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.6, 30, 20), white), 0, 15, 0);
      for (const y of [8, 20]) add(new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.2, 3, 20), acc), 0, y, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 3, 12), mat(0xfff6c0, { e: 0xfff0a0, ei: 2.5, t: 0.9 })), 0, 31.5, 0);
      add(new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.5, 12), mat(0x222222)), 0, 34.2, 0);
    }
  } else if (kind === 'windturbine') {
    add(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, 90, 16), white), 0, 45, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(9, 3.4, 3.4), white), -1, 91, 0);
    const hub = add(new THREE.Group(), 4, 91, 0);
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 50, 2.2), white); b.position.y = 25; const h = new THREE.Group(); h.rotation.x = (i * Math.PI * 2) / 3; h.add(b); hub.add(h); }
    hub.add(new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), white));
    hub.userData.spinX = 1.4;
  } else if (kind === 'oilrig') {
    for (const x of [-15, 15]) for (const z of [-15, 15]) add(cyl(1.5, 1.5, 40, mat(0xd4a017)).rotateZ(Math.PI / 2), x, 20, z);
    add(new THREE.Mesh(new THREE.BoxGeometry(40, 6, 40), mat(0x7b8590)), 0, 43, 0);
    add(new THREE.Mesh(boxM(18, 12, 14, 3, 3), mat(0xf2f2f2)), -8, 52, -8);
    add(new THREE.Mesh(new THREE.CylinderGeometry(1, 3, 40, 4, 1, true), mat(0xc0392b)), 10, 66, 10);
    add(new THREE.Mesh(new THREE.ConeGeometry(1.4, 5, 10), mat(0xffa030, { e: 0xff7a10, ei: 3, t: 0.9 })), 18, 48, -16);
  } else {
    add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), acc));
  }
  return G;
}

// ---------------------------------------------------------------- loading user models
const gltfCache = new Map();
async function loadUserModel(mediaId) {
  if (!gltfCache.has(mediaId)) {
    gltfCache.set(mediaId, (async () => {
      const blob = await getMedia(mediaId);
      if (!blob) throw new Error('Model file missing');
      const buf = await blob.arrayBuffer();
      return await new Promise((res, rej) => gltfLoader().parse(buf, '', res, rej));
    })());
  }
  return gltfCache.get(mediaId);
}
/** Check that a file is a usable GLB/glTF; returns its info. */
export async function inspectModelFile(file) {
  const buf = await file.arrayBuffer();
  const gltf = await new Promise((res, rej) => gltfLoader().parse(buf, '', res, (e) => rej(new Error('Not a valid GLB/glTF model (embedded textures only)'))));
  return { animations: gltf.animations.length };
}

// ---------------------------------------------------------------- realistic models (NASA 3D Resources)
const REAL = {
  nasa_globalhawk: { url: '../assets/models/globalhawk.glb' },
  nasa_goes: { url: '../assets/models/goes.glb' },
  nasa_landsat: { url: '../assets/models/landsat8.glb' },
  nasa_terra: { url: '../assets/models/terra.glb' },
  nasa_hubble: { url: '../assets/models/hubble.glb' },
  nasa_iss: { url: '../assets/models/iss.glb' },
  nasa_shuttle: { url: '../assets/models/shuttle.glb' },
};
const realCache = new Map();
function loadReal(kind) {
  if (!realCache.has(kind)) {
    realCache.set(kind, new Promise((res, rej) => gltfLoader().load(new URL(REAL[kind].url, import.meta.url).href, res, undefined, rej)));
    realCache.get(kind).catch(() => realCache.delete(kind));
  }
  return realCache.get(kind);
}
/** Turn a loaded model so its longest horizontal side points forward (+X) and it sits upright. */
function normaliseOrientation(obj, fix = {}) {
  const box = new THREE.Box3().setFromObject(obj);
  const sz = box.getSize(new THREE.Vector3());
  const wrap = new THREE.Group();
  wrap.add(obj);
  if (fix.yaw) wrap.rotation.y = fix.yaw * D2R;
  else if (sz.z > sz.x * 1.15) wrap.rotation.y = Math.PI / 2;
  const g = new THREE.Group(); g.add(wrap);
  return g;
}

// ---------------------------------------------------------------- procedural city
function buildCity(L) {
  const s = L.style;
  const ring = L.geom.coordinates[0];
  const xs = ring.map((c) => c[0]), ys = ring.map((c) => c[1]);
  const c0 = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const kx = 111320 * Math.cos(c0[1] * D2R), ky = 110540;
  const P = ring.map(([x, y]) => [(x - c0[0]) * kx, -(y - c0[1]) * ky]); // metres, x east, z south
  const inside = (x, z) => { let ins = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; } return ins; };
  let a = (+s.seed || 0) * 7919 + 1;
  const rnd = () => { a = (a * 16807) % 2147483647; return (a - 1) / 2147483646; };
  const minX = Math.min(...P.map((p) => p[0])), maxX = Math.max(...P.map((p) => p[0])), minZ = Math.min(...P.map((p) => p[1])), maxZ = Math.max(...P.map((p) => p[1]));
  const block = Math.max(25, +s.block || 60), street = Math.max(6, block * 0.25);
  const G = new THREE.Group();
  const night = s.look === 'night';
  const mats = ['glass', 'office', 'concrete', 'brick'].map((k) => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: facadeTex(k, night), metalness: k === 'glass' ? 0.6 : 0.1, roughness: k === 'glass' ? 0.2 : 0.8 });
    if (night) { m.emissiveMap = facadeTex(k, true); m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = 0.9; }
    return m;
  });
  const roofM = new THREE.MeshStandardMaterial({ color: night ? 0x1a1d22 : 0x8d9299, roughness: 0.9 });
  const ground = new THREE.MeshStandardMaterial({ color: night ? 0x111316 : 0x55595f, roughness: 1 });
  const minH = +s.minH || 12, maxH = Math.max(minH, +s.maxH || 180);
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, R = Math.hypot(maxX - minX, maxZ - minZ) / 2 || 1;
  let count = 0;
  for (let x = minX + street; x < maxX; x += block) for (let z = minZ + street; z < maxZ; z += block) {
    if (count > 900) break;
    const bx = x + (block - street) / 2, bz = z + (block - street) / 2;
    if (!inside(bx, bz)) continue;
    if (s.groundBlocks !== false) { const pad = new THREE.Mesh(new THREE.BoxGeometry(block - street, 0.4, block - street), ground); pad.position.set(bx, 0.2, bz); G.add(pad); }
    const parts = rnd() < 0.5 ? 1 : 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < parts; k++) {
      const w = (block - street) * (parts === 1 ? 0.75 + rnd() * 0.2 : 0.35 + rnd() * 0.15), d = (block - street) * (parts === 1 ? 0.7 + rnd() * 0.25 : 0.35 + rnd() * 0.15);
      const ox = parts === 1 ? 0 : (k % 2 ? 1 : -1) * (block - street) * 0.22, oz = parts === 1 ? 0 : (k < 2 ? -1 : 1) * (block - street) * 0.22;
      const centre = 1 - Math.min(1, Math.hypot(bx - cx, bz - cz) / R);
      const h = minH + (maxH - minH) * Math.pow(rnd(), 2.2) * (0.35 + 0.65 * centre);
      const mi = h > 90 ? (rnd() < 0.7 ? 0 : 1) : h > 40 ? (rnd() < 0.5 ? 1 : 2) : rnd() < 0.5 ? 2 : 3;
      const b = new THREE.Mesh(boxM(w, h, d), [mats[mi], mats[mi], roofM, roofM, mats[mi], mats[mi]]);
      b.position.set(bx + ox, h / 2, bz + oz);
      b.userData.h = h; b.userData.grow = rnd();
      G.add(b);
      count++;
      if (h > 120 && rnd() < 0.5) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, h * 0.15, 6), roofM); sp.position.set(bx + ox, h + h * 0.075, bz + oz); sp.userData.h = h * 0.15; sp.userData.base = h; sp.userData.grow = b.userData.grow; G.add(sp); }
    }
  }
  return { obj: G, centre: c0 };
}

// ---------------------------------------------------------------- path helpers (lng/lat)
function pathAt(coords, u) {
  if (coords.length < 2) return { ll: coords[0], heading: 0 };
  const seg = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1], [x1, y1] = coords[i];
    const k = Math.cos(((y0 + y1) / 2) * D2R);
    const d = Math.hypot((x1 - x0) * k, y1 - y0);
    seg.push(d); total += d;
  }
  let target = clamp(u, 0, 1) * total, i = 0;
  while (i < seg.length - 1 && target > seg[i]) { target -= seg[i]; i++; }
  const f = seg[i] ? target / seg[i] : 0;
  const [x0, y0] = coords[i], [x1, y1] = coords[i + 1];
  const k = Math.cos(((y0 + y1) / 2) * D2R);
  const heading = (Math.atan2((x1 - x0) * k, y1 - y0) / D2R + 360) % 360;
  return { ll: [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f], heading };
}
function pathMetres(coords) {
  let m = 0;
  for (let i = 1; i < coords.length; i++) { const [x0, y0] = coords[i - 1], [x1, y1] = coords[i]; m += Math.hypot((x1 - x0) * 111320 * Math.cos(((y0 + y1) / 2) * D2R), (y1 - y0) * 110540); }
  return m;
}
const easeIn = (u) => clamp(u, 0, 1) ** 2.2;
const linesOf = (g) => (g?.type === 'LineString' ? g.coordinates : g?.type === 'MultiLineString' ? g.coordinates[0] : null);

/** Which 3D objects a scene needs: { id, L, role, source, color }. */
function jobsOf(scene) {
  const out = [];
  for (const L of scene.layers || []) {
    if (L.hidden || !L.geom) continue;
    const s = L.style || {};
    if (L.kind === 'model3d') out.push({ id: L.id, L, role: 'model', source: s.source, color: s.color });
    else if (L.kind === 'collision' && linesOf(L.geom)) {
      out.push({ id: `${L.id}#a`, L, role: 'colA', source: s.modelA || 'builtin:train', color: s.colorA || '#d71920' });
      out.push({ id: `${L.id}#b`, L, role: 'colB', source: s.modelB || 'builtin:train', color: s.colorB || '#2471a3' });
    } else if ((L.kind === 'bombing' || L.kind === 'trajectory' || L.kind === 'vehicle') && s.model3d && linesOf(L.geom)) out.push({ id: `${L.id}#v`, L, role: L.kind, source: s.model3d, color: s.color });
    else if (L.kind === 'city3d' && L.geom.type === 'Polygon') out.push({ id: `${L.id}#city`, L, role: 'city', source: 'city', color: '' });
  }
  return out;
}
function shadowTex() {
  if (texCache.has('shadow')) return texCache.get('shadow');
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  texCache.set('shadow', t);
  return t;
}

// ---------------------------------------------------------------- the custom layer
export class ModelLayer {
  constructor(map) {
    this.map = map;
    this.id = 'ma-models';
    this.type = 'custom';
    this.renderingMode = '3d';
    this.items = new Map(); // job id → { key, root, yaw, obj, mixer, clips, radius, shadow, city }
    this.state = [];
    this.cssUnit = 1;
    this.renderer = null;
  }
  onAdd(map, gl) {
    this.camera = new THREE.Camera();
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    try {
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      this.renderer.resetState();
    } catch (e) { console.warn('environment', e); }
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    sun.position.set(0.4, 1, 0.25);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbfd4ff, 0.6);
    fill.position.set(-0.5, 0.4, -0.6);
    this.scene.add(fill);
    this.items.forEach((it) => { if (!it.root.parent) this.scene.add(it.root); });
  }
  attach() {
    try { if (this.map.getStyle() && !this.map.getLayer(this.id)) this.map.addLayer(this); } catch { /* style not ready */ }
    this.tracksKey = null;
    if (this.lastScene) this.syncTracks(this.lastScene);
  }
  /** Railway tracks under collisions and 3D trains, drawn by the map itself (so the 3D models sit on top). */
  syncTracks(scene) {
    const m = this.map;
    const feats = [];
    for (const L of scene.layers || []) {
      if (L.hidden || !L.geom) continue;
      const s = L.style || {};
      const rail = (L.kind === 'collision' && s.track !== false && /train|tram|freight/.test(`${s.modelA}${s.modelB}`)) || (L.kind === 'model3d' && L.geom.type === 'LineString' && /train|tram|freight/.test(String(s.source)) && s.track !== false);
      const road = (L.kind === 'collision' && s.track !== false && !rail && /car|truck|bus/.test(`${s.modelA}${s.modelB}`)) || (L.kind === 'model3d' && L.geom.type === 'LineString' && /car|truck|bus/.test(String(s.source)) && s.track !== false);
      if (rail || road) feats.push({ type: 'Feature', properties: { kind: rail ? 'rail' : 'road' }, geometry: L.geom });
    }
    const key = JSON.stringify(feats);
    if (key === this.tracksKey) return;
    this.tracksKey = key;
    try {
      if (!m.getStyle()) return;
      const data = { type: 'FeatureCollection', features: feats };
      if (m.getSource('ma-tracks')) { m.getSource('ma-tracks').setData(data); return; }
      if (!feats.length) return;
      m.addSource('ma-tracks', { type: 'geojson', data });
      const W = (k) => ['interpolate', ['exponential', 2], ['zoom'], 8, 0.6 * k, 22, 1600 * k];
      const before = m.getLayer(this.id) ? this.id : undefined;
      m.addLayer({ id: 'ma-track-bed', type: 'line', source: 'ma-tracks', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['match', ['get', 'kind'], 'rail', '#7d756b', '#2f3237'], 'line-width': W(1) } }, before);
      m.addLayer({ id: 'ma-track-ties', type: 'line', source: 'ma-tracks', filter: ['==', ['get', 'kind'], 'rail'], paint: { 'line-color': '#4e3b2a', 'line-width': W(0.75), 'line-dasharray': [0.25, 0.3] } }, before);
      m.addLayer({ id: 'ma-track-mark', type: 'line', source: 'ma-tracks', paint: { 'line-color': ['match', ['get', 'kind'], 'rail', '#dfe3e8', '#ffd23f'], 'line-width': W(0.08), 'line-dasharray': ['literal', [1, 0]] } }, before);
    } catch (e) { console.warn('tracks', e); }
  }
  /** Load / refresh the 3D objects a scene needs. */
  async sync(scene) {
    this.lastScene = scene;
    this.syncTracks(scene);
    const jobs = jobsOf(scene);
    this.jobs = jobs;
    const ids = new Set(jobs.map((j) => j.id));
    for (const [id, it] of this.items) if (!ids.has(id)) { it.root.removeFromParent(); this.items.delete(id); }
    for (const job of jobs) {
      const s = job.L.style;
      const key = job.role === 'city' ? JSON.stringify([job.L.geom, s.block, s.minH, s.maxH, s.look, s.seed, s.groundBlocks]) : `${job.source}|${job.color}`;
      const it0 = this.items.get(job.id);
      if (it0 && it0.key === key) continue;
      if (it0) { it0.root.removeFromParent(); this.items.delete(job.id); }
      let obj, mixer = null, clips = [], city = null;
      try {
        const src = String(job.source || 'builtin:jet');
        if (job.role === 'city') { city = buildCity(job.L); obj = city.obj; }
        else if (src.startsWith('media:')) {
          const gltf = await loadUserModel(src.slice(6));
          obj = gltf.scene.clone(true);
          clips = gltf.animations || [];
          if (clips.length) mixer = new THREE.AnimationMixer(obj);
        } else {
          const k = src.replace('builtin:', '');
          if (REAL[k]) { const gltf = await loadReal(k); obj = normaliseOrientation(gltf.scene.clone(true), REAL[k].fix); }
          else obj = buildModel(k, job.color);
        }
      } catch (e) { console.warn('model load failed', e); continue; }
      const holder = new THREE.Group();
      const yaw = new THREE.Group();
      let radius = 1;
      if (!city) {
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        obj.position.sub(new THREE.Vector3(center.x, box.min.y, center.z)); // sit on its base, centred
        const inner = new THREE.Group(); inner.add(obj); obj = inner;
        // long, thin things (trains, ships) get a bit more screen size than their length alone would give
        const mx = Math.max(size.x, size.z), mean = Math.sqrt(Math.max(1e-6, size.x * size.z));
        radius = Math.max(Math.sqrt(mx * mean), size.y * 0.6) / 2 || 1;
        const sh = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 1.25 || 1, size.z * 1.4 || 1), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, toneMapped: false }));
        sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02 * radius; sh.renderOrder = -1;
        yaw.add(sh);
        holder.userData.shadow = sh;
      }
      yaw.add(obj);
      holder.add(yaw);
      holder.visible = false;
      this.items.set(job.id, { key, root: holder, yaw, obj, mixer, clips, radius, city, shadow: holder.userData.shadow, job });
    }
    this.scene && this.items.forEach((it) => { if (!it.root.parent) this.scene.add(it.root); });
    this.map.triggerRepaint();
  }
  clear() { for (const it of this.items.values()) it.root.removeFromParent(); this.items.clear(); this.state = []; }
  get count() { return this.items.size; }

  /** Where every object is at scene time t (null = editing). */
  update(scene, t, layerTiming) {
    this.state = [];
    const byId = new Map((scene.layers || []).map((L) => [L.id, L]));
    for (const it of this.items.values()) {
      const L = byId.get(it.job.L.id) || it.job.L;
      if (L.hidden || !L.geom) continue;
      const tm = layerTiming(L, t);
      if (!tm.visible) continue;
      const s = L.style;
      const D = Math.max(0.1, +L.duration || 1);
      const tt = tm.edit ? 0 : tm.tau;
      let ll, heading = 0, altitude = 0, pitch = 0, roll = 0, scale = +s.size || 1, alpha = tm.alpha, real = s.sizeMode === 'real';
      const role = it.job.role;
      if (role === 'model') {
        heading = +s.heading || 0;
        const u = tm.edit ? 0.5 : ease(tm.tau / D);
        if (L.geom.type === 'LineString') {
          const p = pathAt(L.geom.coordinates, s.motion === 'none' ? 0 : u);
          ll = p.ll;
          if (s.followPath !== false) heading += p.heading;
        } else ll = L.geom.coordinates;
        if (s.motion === 'spin') heading += tt * (+s.spinSpeed || 30);
        altitude = +s.altitude || 0;
        if (s.motion === 'float') altitude += Math.sin(tt * 2) * (+s.size || 1) * 4;
        pitch = +s.pitch || 0; roll = +s.roll || 0;
        const pop = tm.edit ? 1 : Math.min(1, tm.tau / 0.4);
        if (L.anim === 'pop') scale *= 0.2 + 0.8 * pop;
      } else if (role === 'colA' || role === 'colB') {
        const cs = linesOf(L.geom);
        const meet = clamp(+s.meetAt || 0.5, 0.05, 0.95);
        const p = tm.edit ? 0.7 : clamp(tm.tau / D, 0, 1);
        const after = tm.edit ? 0 : Math.max(0, tm.tau - D);
        const slide = Math.min(1, after / 0.8);
        const A = role === 'colA';
        const gap = 0.012 * (1 - p * 0.95);
        const u = A ? meet * p - gap - (A ? 0 : 0) + slide * 0.006 : 1 - (1 - meet) * p + gap - slide * 0.006;
        const q = pathAt(cs, u);
        ll = q.ll;
        heading = q.heading + (A ? 0 : 180) + (A ? 1 : -1) * 14 * ease(slide);
        roll = (A ? 1 : -1) * 24 * ease(slide);
        pitch = (A ? 6 : -4) * ease(slide);
        real = s.sizeMode === 'real';
      } else if (role === 'bombing') {
        const cs = linesOf(L.geom);
        const u = tm.edit ? 0.7 : tm.tau / D;
        const q = pathAt(cs, clamp(u, 0, 1));
        ll = q.ll; heading = q.heading;
        if (u > 1) { const ext = pathAt(cs, 1); const k = (u - 1) * pathMetres(cs); const h = ext.heading * D2R; ll = [ext.ll[0] + (Math.sin(h) * k) / (111320 * Math.cos(ext.ll[1] * D2R)), ext.ll[1] + (Math.cos(h) * k) / 110540]; alpha *= Math.max(0, 1 - (u - 1) * 4); }
        altitude = +s.alt3d || 40; roll = Math.sin(tt * 1.3) * 4;
        if (u > 1.25) continue;
      } else if (role === 'trajectory') {
        const cs = linesOf(L.geom);
        const veh = s.vehicle || 'missile';
        const ballistic = veh === 'missile' || veh === 'rocket';
        const u0 = tm.edit ? 0.55 : clamp(tm.tau / D, 0, 1);
        const u = ballistic ? (0.35 * u0 + 0.65 * easeIn(u0)) : veh === 'drone' || veh === 'quad' ? u0 : ease(u0);
        const q = pathAt(cs, u);
        ll = q.ll; heading = q.heading;
        const lenM = pathMetres(cs);
        const H = (+s.arc || 0) * lenM * (veh === 'rocket' ? 0.55 : 0.35) * (ballistic ? 1 : 0.15);
        altitude = Math.sin(Math.PI * u) * H * (s.sizeMode === 'real' ? 1 : 1 / Math.max(1, lenM / 1200));
        pitch = Math.cos(Math.PI * u) * (ballistic ? 35 : 6);
        if (!tm.edit && tm.tau > D) continue;
        real = s.sizeMode === 'real';
        if (!real) altitude = Math.sin(Math.PI * u) * 60 * (+s.arc || 0.5) * 2;
      } else if (role === 'vehicle') {
        const cs = linesOf(L.geom);
        const u = tm.edit ? 0.5 : ease(tm.tau / D);
        const q = pathAt(cs, u);
        ll = q.ll; heading = q.heading;
        const air = ['jet', 'airliner', 'drone', 'quad', 'helicopter', 'missile', 'rocket', 'satellite', 'iss'].includes(s.sprite);
        altitude = air ? 30 : 0;
      } else if (role === 'city') {
        ll = it.city.centre;
        real = true; scale = 1; heading = 90;
        const grow = L.anim === 'grow' && !tm.edit;
        for (const b of it.obj.children) {
          if (!b.userData.h) continue;
          let k = 1;
          if (grow) k = clamp((tm.tau - b.userData.grow * D * 0.6) / (D * 0.4), 0, 1);
          k = Math.max(0.001, ease(k));
          b.scale.y = k;
          b.position.y = (b.userData.base || 0) * k + (b.userData.h * k) / 2;
          b.visible = k > 0.002;
        }
      }
      this.state.push({ it, L, ll, heading, altitude, pitch, roll, scale, alpha, tau: tt, real });
    }
    this.map.triggerRepaint();
  }
  setUnit(cssUnit) { this.cssUnit = cssUnit; }

  render(gl, args) {
    if (!this.renderer || !this.state.length) return;
    const tr = this.map.transform;
    const zoom = this.map.getZoom();
    for (const it of this.items.values()) it.root.visible = false;
    for (const st of this.state) {
      const { it, ll, L } = st;
      const s = L.style;
      if (!ll) continue;
      const mpp = (40075016.686 * Math.cos(ll[1] * D2R)) / (512 * 2 ** zoom);
      const px = 70 * this.cssUnit * st.scale;
      const scale = st.real ? st.scale : (px * mpp) / (2 * it.radius);
      const altM = st.real ? st.altitude : st.altitude * mpp * this.cssUnit;
      const modelMatrix = tr.getMatrixForModel(ll, altM);
      const M = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix).multiply(new THREE.Matrix4().fromArray(modelMatrix));
      it.root.visible = true;
      it.root.scale.setScalar(scale);
      it.yaw.rotation.set(0, (90 - st.heading) * D2R + (+s.yawOffset || 0) * D2R, 0);
      it.obj.rotation.set(st.roll * D2R, 0, st.pitch * D2R);
      if (it.shadow) {
        it.shadow.visible = s.shadow !== false;
        it.shadow.position.y = -altM / scale + 0.02 * it.radius;
        it.shadow.material.opacity = clamp(1 - altM / (it.radius * scale * 30), 0.25, 1) * st.alpha;
      }
      if (it.mixer && s.playAnim !== false) {
        it.mixer.stopAllAction();
        it.clips.forEach((c) => { const a = it.mixer.clipAction(c); a.play(); });
        it.mixer.setTime(st.tau % Math.max(0.01, it.clips[0].duration));
      }
      it.obj.traverse((o) => {
        if (o.userData.spin) o.rotation.y = st.tau * o.userData.spin;
        if (o.userData.spinZ) o.rotation.z = st.tau * o.userData.spinZ;
        if (o.userData.spinX) o.rotation.x = st.tau * o.userData.spinX;
        if (o.material && !Array.isArray(o.material) && st.alpha < 1 && o !== it.shadow) { o.material.transparent = true; o.material.opacity = st.alpha; }
      });
      this.camera.projectionMatrix = M;
      this.renderer.resetState();
      for (const other of this.items.values()) other.root.visible = other === it;
      this.renderer.render(this.scene, this.camera);
    }
    this.renderer.resetState();
  }
}

/** Screen size (CSS px) of a model layer, for the on-map resize handle. */
export const modelScreenSize = (L, cssUnit) => 70 * cssUnit * (+L.style.size || 1);
