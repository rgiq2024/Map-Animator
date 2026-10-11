// Real 3D models on the map: built-in low-poly vehicles and your own GLB/glTF files, rendered with
// three.js inside a MapLibre custom layer (so they tilt, rotate and export with the map).
import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/loaders/GLTFLoader.js';
import { getMedia } from './store.js';

export const BUILTIN_MODELS = {
  jet: 'Fighter jet', airliner: 'Airliner', drone: 'Drone (UAV)', helicopter: 'Helicopter', missile: 'Missile',
  rocket: 'Rocket', satellite: 'Satellite', iss: 'Space station', warship: 'Warship', tank: 'Tank',
};
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
      return await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
    })());
  }
  return gltfCache.get(mediaId);
}
/** Check that a file is a usable GLB/glTF; returns its info. */
export async function inspectModelFile(file) {
  const buf = await file.arrayBuffer();
  const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, (e) => rej(new Error('Not a valid GLB/glTF model (embedded textures only)'))));
  return { animations: gltf.animations.length };
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

// ---------------------------------------------------------------- the custom layer
export class ModelLayer {
  constructor(map) {
    this.map = map;
    this.id = 'ma-models';
    this.type = 'custom';
    this.renderingMode = '3d';
    this.items = new Map(); // layer id → { key, root, mixer, radius }
    this.state = [];        // per-frame transforms computed by update()
    this.cssUnit = 1;
    this.renderer = null;
  }
  onAdd(map, gl) {
    this.camera = new THREE.Camera();
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(0.4, 1, 0.25);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbfd4ff, 0.7);
    fill.position.set(-0.5, 0.4, -0.6);
    this.scene.add(fill);
  }
  attach() {
    try { if (this.map.getStyle() && !this.map.getLayer(this.id)) this.map.addLayer(this); } catch { /* style not ready */ }
  }
  /** Load/refresh models for a scene's model layers. */
  async sync(scene) {
    const want = (scene.layers || []).filter((L) => L.kind === 'model3d' && !L.hidden && L.geom);
    const ids = new Set(want.map((L) => L.id));
    for (const [id, it] of this.items) if (!ids.has(id)) { it.root.removeFromParent(); this.items.delete(id); }
    for (const L of want) {
      const key = `${L.style.source}|${L.style.color}`;
      const it = this.items.get(L.id);
      if (it && it.key === key) continue;
      if (it) { it.root.removeFromParent(); this.items.delete(L.id); }
      let obj, mixer = null, clips = [];
      try {
        if (String(L.style.source).startsWith('media:')) {
          const gltf = await loadUserModel(L.style.source.slice(6));
          obj = gltf.scene.clone(true);
          clips = gltf.animations || [];
          if (clips.length) mixer = new THREE.AnimationMixer(obj);
        } else obj = buildModel(String(L.style.source || 'builtin:jet').replace('builtin:', ''), L.style.color);
      } catch (e) { console.warn('model load failed', e); continue; }
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      obj.position.sub(new THREE.Vector3(center.x, box.min.y, center.z)); // sit on its base, centred
      const holder = new THREE.Group();
      const yaw = new THREE.Group();
      yaw.add(obj);
      holder.add(yaw);
      holder.visible = false;
      this.items.set(L.id, { key, root: holder, yaw, obj, mixer, clips, radius: Math.max(size.x, size.z, size.y * 0.6) / 2 || 1 });
    }
    this.scene && this.items.forEach((it) => { if (!it.root.parent) this.scene.add(it.root); });
    this.map.triggerRepaint();
  }
  clear() { for (const it of this.items.values()) it.root.removeFromParent(); this.items.clear(); this.state = []; }
  get count() { return this.items.size; }

  /** Compute where every model is at scene time t (null = editing). */
  update(scene, t, layerTiming) {
    this.state = [];
    for (const L of scene.layers || []) {
      const it = this.items.get(L.id);
      if (!it || L.hidden || !L.geom) continue;
      const tm = layerTiming(L, t);
      if (!tm.visible) continue;
      const s = L.style;
      let ll, heading = +s.heading || 0;
      const u = tm.edit ? 0.5 : ease(tm.tau / Math.max(0.1, L.duration));
      if (L.geom.type === 'LineString') {
        const p = pathAt(L.geom.coordinates, s.motion === 'none' ? 0 : u);
        ll = p.ll;
        if (s.followPath !== false) heading += p.heading;
      } else ll = L.geom.coordinates;
      const tt = tm.edit ? 0 : tm.tau;
      if (s.motion === 'spin') heading += tt * (+s.spinSpeed || 30);
      let altitude = +s.altitude || 0;
      if (s.motion === 'float') altitude += Math.sin(tt * 2) * (+s.size || 1) * 4;
      const pop = tm.edit ? 1 : Math.min(1, tm.tau / 0.4);
      this.state.push({ it, L, ll, heading, altitude, pitch: +s.pitch || 0, roll: +s.roll || 0, scale: (+s.size || 1) * (L.anim === 'pop' ? 0.2 + 0.8 * pop : 1), alpha: tm.alpha, tau: tt });
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
      // size: "screen" keeps a constant size in the video; "real" uses metres
      const mpp = (40075016.686 * Math.cos(ll[1] * D2R)) / (512 * 2 ** zoom);
      const px = 70 * this.cssUnit * st.scale;
      const scale = s.sizeMode === 'real' ? st.scale : (px * mpp) / (2 * it.radius);
      const altM = s.sizeMode === 'real' ? st.altitude : st.altitude * mpp * this.cssUnit;
      const modelMatrix = tr.getMatrixForModel(ll, altM);
      const M = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix).multiply(new THREE.Matrix4().fromArray(modelMatrix));
      it.root.visible = true;
      it.root.scale.setScalar(scale);
      it.yaw.rotation.set(0, (90 - st.heading) * D2R + (+s.yawOffset || 0) * D2R, 0);
      it.obj.rotation.set(st.roll * D2R, it.obj.rotation.y, st.pitch * D2R);
      if (it.mixer && s.playAnim !== false) {
        it.mixer.stopAllAction();
        it.clips.forEach((c) => { const a = it.mixer.clipAction(c); a.play(); });
        it.mixer.setTime(st.tau % Math.max(0.01, it.clips[0].duration));
      }
      it.obj.traverse((o) => {
        if (o.userData.spin) o.rotation.y = st.tau * o.userData.spin;
        if (o.userData.spinZ) o.rotation.z = st.tau * o.userData.spinZ;
        if (o.material && st.alpha < 1) { o.material.transparent = true; o.material.opacity = st.alpha; }
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
