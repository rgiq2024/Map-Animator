// Projects are kept in this browser (IndexedDB), with an in-memory fallback.
import { newScene, legId } from './scene.js';

const DB = 'map-animator';
const STORE = 'projects';
let dbp = null;
const mem = new Map();

function db() {
  if (!dbp) {
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB, 2);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
          if (!d.objectStoreNames.contains('media')) d.createObjectStore('media');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  return dbp;
}
async function tx(mode, fn, store = STORE) {
  const d = await db();
  if (!d) return fn(null);
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r?.result ?? r);
    t.onerror = () => reject(t.error);
  });
}

export async function listProjects() {
  const d = await db();
  if (!d) return [...mem.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  const all = await tx('readonly', (s) => s.getAll());
  return (all || []).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function getProject(id) {
  const d = await db();
  if (!d) return mem.get(id) || null;
  return (await tx('readonly', (s) => s.get(id))) || null;
}
export async function saveProject(p) {
  p.updatedAt = Date.now();
  const copy = JSON.parse(JSON.stringify(p));
  const d = await db();
  if (!d) { mem.set(p.id, copy); return; }
  await tx('readwrite', (s) => s.put(copy));
}
export async function deleteProject(id) {
  const d = await db();
  if (!d) { mem.delete(id); return; }
  await tx('readwrite', (s) => s.delete(id));
}

export const newId = () => `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function newProject(name) {
  return {
    format: 'map-animator', version: 2,
    id: newId(),
    name: name || 'Untitled trip',
    aspect: '16:9', resolution: 1080, fps: 30, join: 'cut', audio: [],
    scenes: [newScene('Scene 1')],
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

/** Validate/normalise a project loaded from a file. */
export function normalizeProject(p) {
  if (!p || !Array.isArray(p.scenes)) throw new Error('This is not a GIS One Map Animator project file');
  const base = newProject(p.name);
  const out = { ...base, ...p, id: newId() };
  out.scenes = p.scenes.map((sc, i) => {
    const d = newScene(sc.name || `Scene ${i + 1}`);
    return {
      ...d, ...sc,
      look: { ...d.look, ...(sc.look || {}) },
      camera: { ...d.camera, ...(sc.camera || {}) },
      legs: (sc.legs && sc.legs.length ? sc.legs : d.legs).map((l) => ({ id: l.id || legId(), mode: 'line', points: [], ...l })),
      signs: sc.signs || [],
    };
  });
  return out;
}

/** The demo trip shown on the home page and used by "Try it in the editor". */
export function demoProject() {
  const p = newProject('Gulf road trip');
  const sc = p.scenes[0];
  sc.name = 'Drive & fly';
  sc.legs = [
    { id: legId(), mode: 'car', points: [
      { lng: 55.2708, lat: 25.2048 }, { lng: 55.03, lat: 24.98 }, { lng: 54.62, lat: 24.6 }, { lng: 54.3773, lat: 24.4539, pause: 1 },
    ] },
    { id: legId(), mode: 'plane', points: [{ lng: 54.3773, lat: 24.4539 }, { lng: 58.4059, lat: 23.588 }] },
    { id: legId(), mode: 'car', points: [{ lng: 58.4059, lat: 23.588 }, { lng: 58.1, lat: 23.3 }, { lng: 57.5301, lat: 22.9333 }] },
  ];
  sc.signs = [
    { id: 's1', type: 'pill', text: 'Dubai', lng: 55.2708, lat: 25.2048, appear: 'auto' },
    { id: 's2', type: 'board', text: 'Abu Dhabi', lng: 54.3773, lat: 24.4539, appear: 'auto' },
    { id: 's3', type: 'callout', text: 'Muscat', detail: 'Day 3', lng: 58.4059, lat: 23.588, appear: 'auto' },
    { id: 's4', type: 'summit', text: 'Nizwa', detail: 'Fort & souq', lng: 57.5301, lat: 22.9333, appear: 'auto' },
  ];
  sc.lineSeconds = 7;
  sc.camera.mode = 'fixed';
  return p;
}

// ---- media (audio blobs) ----
const memMedia = new Map();
export async function putMedia(id, blob) {
  const d = await db();
  if (!d) { memMedia.set(id, blob); return; }
  await tx('readwrite', (s) => s.put(blob, id), 'media');
}
export async function getMedia(id) {
  const d = await db();
  if (!d) return memMedia.get(id) || null;
  return (await tx('readonly', (s) => s.get(id), 'media')) || null;
}
export async function deleteMedia(id) {
  const d = await db();
  if (!d) { memMedia.delete(id); return; }
  await tx('readwrite', (s) => s.delete(id), 'media');
}
const blobToDataURL = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
/** Project file contents including embedded audio. */
export async function projectFileJSON(p) {
  const media = {};
  const ids = new Set((p.audio || []).map((t) => t.id));
  for (const m of p.models || []) ids.add(m.id);
  for (const sc of p.scenes || []) if (sc.transitionMedia) ids.add(sc.transitionMedia);
  for (const sc of p.scenes || []) for (const L of sc.layers || []) {
    if ((L.kind === 'videofx' || L.kind === 'video') && L.style?.media) ids.add(L.style.media);
    if ((L.kind === 'image' || L.kind === 'compare') && L.style) { if (L.style.media) ids.add(L.style.media); if (L.style.media2) ids.add(L.style.media2); }
    if (L.kind === 'timeseries') for (const f of L.style?.frames || []) if (f.media) ids.add(f.media);
    if (L.kind === 'model3d' && String(L.style?.source || '').startsWith('media:')) ids.add(L.style.source.slice(6));
  }
  for (const id of ids) {
    const b = await getMedia(id);
    if (b) media[id] = await blobToDataURL(b);
  }
  return JSON.stringify({ ...p, format: 'map-animator', version: 3, media });
}
/** Store media embedded in a project file; returns the project without it. */
export async function importProjectMedia(p) {
  const media = p.media || {};
  for (const [id, url] of Object.entries(media)) {
    try { await putMedia(id, await (await fetch(url)).blob()); } catch { /* skip broken media */ }
  }
  delete p.media;
  return p;
}
