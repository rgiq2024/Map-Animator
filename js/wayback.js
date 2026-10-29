// "Satellite through time": Esri World Imagery Wayback releases shown as map layers that cross-fade
// from one date to the next. The year label and progress bar are drawn by geoimage.js (drawSeriesLabel).
import { seriesState } from './geoimage.js';

const CONFIG_URL = 'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json';
let releasesP = null;
/** All Wayback releases, oldest first: [{ num, date: 'YYYY-MM-DD', year, url }]. */
export function waybackReleases() {
  releasesP ||= fetch(CONFIG_URL).then((r) => { if (!r.ok) throw new Error('Wayback list unavailable'); return r.json(); }).then((cfg) => Object.entries(cfg).map(([num, v]) => {
    const date = (String(v.itemTitle || '').match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
    const url = String(v.itemURL || '').replace('{level}', '{z}').replace('{row}', '{y}').replace('{col}', '{x}');
    return { num: +num, date, year: +date.slice(0, 4), url };
  }).filter((r) => r.date && r.url).sort((a, b) => a.date.localeCompare(b.date)));
  releasesP.catch(() => { releasesP = null; });
  return releasesP;
}
/** One release per year (the latest of each year) between from and to. */
export function yearlyReleases(list, from = 0, to = 9999) {
  const by = new Map();
  for (const r of list) if (r.year >= from && r.year <= to) by.set(r.year, r);
  return [...by.values()];
}

export class WaybackLayers {
  constructor(map) { this.map = map; this.ids = []; this.scene = null; this.last = new Map(); }
  attach() { this.ids = []; this.last.clear(); if (this.scene) this.sync(this.scene); }
  clear() {
    const m = this.map;
    for (const { layer, source } of this.ids) {
      try { if (m.getLayer(layer)) m.removeLayer(layer); if (m.getSource(source)) m.removeSource(source); } catch { /* style gone */ }
    }
    this.ids = []; this.last.clear();
  }
  sync(scene) {
    this.scene = scene;
    const m = this.map;
    if (!m.getStyle?.()) return;
    this.clear();
    const layers = (scene?.layers || []).filter((L) => L.kind === 'timeseries' && L.style?.source === 'wayback' && !L.hidden);
    if (!layers.length) return;
    const style = m.getStyle();
    const before = style.layers.find((l) => l.type === 'symbol' || l.id === 'ma-buildings' || l.id.startsWith('ma-flood'))?.id;
    for (const L of layers) {
      (L.style.frames || []).forEach((f, i) => {
        if (!f.url) return;
        const source = `ma-wb-${L.id}-${i}`, layer = `${source}-l`;
        try {
          m.addSource(source, { type: 'raster', tiles: [f.url], tileSize: 256, maxzoom: 19, attribution: 'Esri World Imagery Wayback' });
          m.addLayer({ id: layer, type: 'raster', source, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0, 'raster-fade-duration': 0 } }, before);
          this.ids.push({ layer, source, L, i });
        } catch (e) { console.warn('wayback layer', e); }
      });
    }
  }
  update(scene, t, layerTiming) {
    const m = this.map;
    for (const it of this.ids) {
      const L = (scene.layers || []).find((x) => x.id === it.L.id) || it.L;
      const tm = layerTiming(L, t);
      let w = 0;
      if (tm.visible && !L.hidden) {
        const st = seriesState(L, tm);
        w = (st.list.find((q) => q.i === it.i)?.w || 0) * tm.alpha * (+L.style.opacity || 1);
      }
      const q = Math.round(w * 100) / 100;
      if (this.last.get(it.layer) === q) continue;
      this.last.set(it.layer, q);
      try {
        m.setLayoutProperty(it.layer, 'visibility', q > 0 ? 'visible' : 'none');
        m.setPaintProperty(it.layer, 'raster-opacity', q);
      } catch { /* style changing */ }
    }
  }
}
