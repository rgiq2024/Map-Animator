// NASA FIRMS active-fire hotspots (VIIRS 375 m / MODIS 1 km): fetching, parsing and an animated map layer.
//  • With your own free FIRMS MAP_KEY (kept in this browser): the area API for any place, last 1–5 days.
//  • Without a key: hotspots saved by the daily GitHub Action (public 24 h global VIIRS file) travel with each fire story.
// No DOM at module level: fetchFirms / parseFirmsCSV / clusterHotspots also run in the GitHub Action (Node).

const FIRMS = 'https://firms.modaps.eosdis.nasa.gov';
export const FIRMS_SOURCES = { VIIRS_NOAA20_NRT: 'VIIRS NOAA-20 (375 m)', VIIRS_NOAA21_NRT: 'VIIRS NOAA-21 (375 m)', VIIRS_SNPP_NRT: 'VIIRS Suomi NPP (375 m)', MODIS_NRT: 'MODIS Terra / Aqua (1 km)' };
/** public, no key: the last 24 hours, whole world */
export const FIRMS_PUBLIC_24H = `${FIRMS}/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv`;
const KEY_LS = 'ma.firmsKey';
export function firmsKey() { try { return (typeof localStorage !== 'undefined' && localStorage.getItem(KEY_LS)) || ''; } catch { return ''; } }
export function setFirmsKey(k) { try { localStorage.setItem(KEY_LS, String(k || '').trim()); } catch { /* private mode */ } }

const r4 = (v) => Math.round(v * 1e4) / 1e4;
/** CSV text → [{ ll:[lon,lat], t (ms), frp, conf, sat, dn }] — VIIRS and MODIS column names both work. */
export function parseFirmsCSV(txt) {
  const rows = String(txt || '').trim().split(/\r?\n/);
  if (rows.length < 2) return [];
  const head = rows[0].split(',').map((h) => h.trim().toLowerCase());
  const ix = (n) => head.indexOf(n);
  const iLa = ix('latitude'), iLo = ix('longitude'), iD = ix('acq_date'), iT = ix('acq_time'), iF = ix('frp'), iC = ix('confidence'), iS = ix('satellite'), iN = ix('daynight');
  if (iLa < 0 || iLo < 0) throw new Error(/invalid|key/i.test(rows[0]) ? 'FIRMS did not accept the MAP_KEY' : 'Not a FIRMS file');
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const c = rows[i].split(',');
    const lat = +c[iLa], lon = +c[iLo];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const hhmm = String(c[iT] || '0').padStart(4, '0');
    const t = Date.parse(`${c[iD]}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`) || 0;
    out.push({ ll: [r4(lon), r4(lat)], t, frp: +c[iF] || 0, conf: String(c[iC] ?? '').trim(), sat: String(c[iS] ?? '').trim(), dn: String(c[iN] ?? '').trim() });
  }
  return out;
}
/** bbox [w,s,e,n] around a point, radius in km */
export function bboxAround(ll, km = 40) {
  const dLat = km / 111.32, dLon = km / (111.32 * Math.max(0.15, Math.cos((ll[1] * Math.PI) / 180)));
  return [r4(ll[0] - dLon), r4(Math.max(-90, ll[1] - dLat)), r4(ll[0] + dLon), r4(Math.min(90, ll[1] + dLat))];
}
/**
 * Hotspots in an area from the FIRMS area API. { key, bbox:[w,s,e,n], days 1–5, sources:[...], date:'YYYY-MM-DD' (optional) }
 * Returns hotspots sorted by time.
 */
export async function fetchFirms({ key = firmsKey(), bbox, days = 2, sources = ['VIIRS_NOAA20_NRT', 'VIIRS_SNPP_NRT'], date = '' } = {}) {
  if (!key) throw new Error('Add your free NASA FIRMS MAP_KEY first');
  if (!bbox) throw new Error('No area');
  const d = Math.max(1, Math.min(5, Math.round(days)));
  const all = [];
  let lastErr = null;
  for (const src of sources) {
    const url = `${FIRMS}/api/area/csv/${encodeURIComponent(key)}/${src}/${bbox.join(',')}/${d}${date ? `/${date}` : ''}`;
    try {
      const r = await fetch(url);
      const txt = await r.text();
      if (!r.ok) throw new Error(`FIRMS ${r.status}`);
      all.push(...parseFirmsCSV(txt));
    } catch (e) { lastErr = e; }
  }
  if (!all.length && lastErr) throw lastErr;
  // the satellites overlap: drop near-duplicates (same ~100 m cell, same pass hour)
  const seen = new Set();
  return all.sort((a, b) => a.t - b.t).filter((h) => { const k = `${Math.round(h.ll[0] * 1000)}:${Math.round(h.ll[1] * 1000)}:${Math.round(h.t / 3600e3)}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
/** compact form for saving in a layer / the daily feed: [lon, lat, minutes since epoch, frp] */
export const packHotspots = (list, max = 2500) => {
  const L = list.length > max ? list.slice().sort((a, b) => b.frp - a.frp).slice(0, max).sort((a, b) => a.t - b.t) : list;
  return L.map((h) => [h.ll[0], h.ll[1], Math.round(h.t / 60000), Math.round(h.frp * 10) / 10]);
};
export const unpackHotspots = (arr) => (arr || []).map((a) => ({ ll: [a[0], a[1]], t: a[2] * 60000, frp: a[3] || 0 }));
/** numbers for the facts card */
export function hotspotStats(list) {
  if (!list?.length) return null;
  let frp = 0, max = 0, w = 180, s = 90, e = -180, n = -90, t0 = Infinity, t1 = 0;
  for (const h of list) { frp += h.frp; max = Math.max(max, h.frp); w = Math.min(w, h.ll[0]); e = Math.max(e, h.ll[0]); s = Math.min(s, h.ll[1]); n = Math.max(n, h.ll[1]); t0 = Math.min(t0, h.t); t1 = Math.max(t1, h.t); }
  const kmX = (e - w) * 111.32 * Math.cos((((s + n) / 2) * Math.PI) / 180), kmY = (n - s) * 111.32;
  // strongest-fire point (FRP-weighted centre)
  let cx = 0, cy = 0;
  for (const h of list) { const k = h.frp || 0.1; cx += h.ll[0] * k; cy += h.ll[1] * k; }
  const tot = list.reduce((a, h) => a + (h.frp || 0.1), 0);
  return { count: list.length, frp: Math.round(frp), maxFrp: Math.round(max), bbox: [w, s, e, n], spanKm: Math.max(1, Math.round(Math.max(kmX, kmY))), t0, t1, centre: [r4(cx / tot), r4(cy / tot)] };
}
/**
 * Groups world hotspots into fire clusters (0.25° cells joined with their neighbours). Returns the biggest first:
 * [{ ll, count, frp, hotspots }]
 */
export function clusterHotspots(list, { cell = 0.25, minCount = 25 } = {}) {
  const grid = new Map();
  const key = (x, y) => `${x}:${y}`;
  for (const h of list) {
    const gx = Math.floor(h.ll[0] / cell), gy = Math.floor(h.ll[1] / cell);
    const k = key(gx, gy);
    if (!grid.has(k)) grid.set(k, { gx, gy, pts: [] });
    grid.get(k).pts.push(h);
  }
  const done = new Set(), out = [];
  for (const [k, c] of grid) {
    if (done.has(k)) continue;
    const stack = [c], pts = [];
    done.add(k);
    while (stack.length) {
      const g = stack.pop();
      pts.push(...g.pts);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const nk = key(g.gx + dx, g.gy + dy);
        if (!done.has(nk) && grid.has(nk)) { done.add(nk); stack.push(grid.get(nk)); }
      }
    }
    if (pts.length < minCount) continue;
    const st = hotspotStats(pts);
    out.push({ ll: st.centre, count: st.count, frp: st.frp, stats: st, hotspots: pts });
  }
  return out.sort((a, b) => b.frp - a.frp || b.count - a.count);
}

// ================================================================= the map layer
export const FIRMS_KINDS = { firms: { name: 'Fire hotspots (NASA FIRMS)', icon: '🔥', geom: null, desc: 'Active-fire detections from NASA FIRMS satellites appearing in time order, coloured by fire power, with a legend' } };
export const FIRMS_ANIMS = { firms: { timeline: 'Appear in time order', fade: 'Fade in', none: 'All shown' } };
export const FIRMS_DEFAULTS = { firms: { anim: 'timeline', duration: 6, style: { source: 'saved', points: [], center: '', km: 40, days: 2, size: 1, glow: true, legend: true, legendTitle: 'Active fire detections', position: 'bottom-left', credit: 'NASA FIRMS' } } };
export const FIRMS_FORMS = {
  firms: [
    ['style._firms', 'Hotspots', 'firms'],
    ['style.size', 'Dot size', 'range', [0.4, 3, 0.1]],
    ['style.glow', 'Heat glow', 'switch'],
    ['style.legend', 'Legend', 'switch'],
    ['style.legendTitle', 'Legend title', 'text', null, (L) => L.style.legend !== false],
  ],
};
export const FIRMS_SET = new Set(Object.keys(FIRMS_KINDS));
export const firmsPhases = () => ['above', 'captions'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (t) => 1 - (1 - t) ** 3;
/** FRP (MW) → colour: yellow (weak) → orange → deep red (intense) */
const frpColor = (f) => {
  const k = clamp(Math.log10(Math.max(1, f)) / 2.3, 0, 1);
  const c = k < 0.5 ? [255, 235 - 95 * k * 2, 80 - 60 * k * 2] : [255 - 35 * (k - 0.5) * 2, 140 - 110 * (k - 0.5) * 2, 20];
  return c.map(Math.round);
};
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const cacheLive = new Map();
function liveList(L, track) {
  const s = L.style;
  const ll = parseLatLon(s.center);
  if (!ll) return [];
  const k = `${ll.join(',')}|${s.km}|${s.days}`;
  if (!cacheLive.has(k)) {
    const v = { list: [] };
    cacheLive.set(k, v);
    const p = fetchFirms({ bbox: bboxAround(ll, +s.km || 40), days: +s.days || 2 }).then((l) => { v.list = l; }).catch((e) => { v.error = e.message; });
    track?.(p);
  }
  return cacheLive.get(k).list;
}
/** "lat, lon" → [lon, lat] */
export function parseLatLon(t) { const m = String(t || '').match(/(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)/); if (!m) return null; const a = +m[1], b = +m[2]; return Math.abs(a) <= 90 ? [b, a] : [a, b]; }
const listCache = new WeakMap();
export function hotspotsOf(L, track) {
  if (L.style.source === 'live') return liveList(L, track);
  const arr = L.style.points || [];
  let c = listCache.get(arr);
  if (!c) { c = unpackHotspots(arr).sort((a, b) => a.t - b.t); listCache.set(arr, c); }
  return c;
}
const fmt = (t) => { const d = new Date(t); return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`; };

export function drawFirms(ctx, L, tm, o, phase, { placeAt, track } = {}) {
  const s = L.style, unit = o.unit;
  const list = hotspotsOf(L, track);
  if (!list.length) return;
  const t0 = list[0].t, t1 = list.at(-1).t || t0 + 1;
  const u = tm.edit || L.anim === 'none' ? 1 : clamp(tm.tau / Math.max(0.1, +L.duration || 1), 0, 1);
  const now = L.anim === 'timeline' ? t0 + (t1 - t0) * easeOut(u) : Infinity;
  const fadeA = L.anim === 'fade' ? easeOut(u) : 1;
  if (phase === 'above') {
    const R = 2.6 * unit * (+s.size || 1);
    const pts = [];
    for (const h of list) {
      if (h.t > now + 1) break;
      const q = o.proj(h.ll);
      if (!q || !Number.isFinite(q[0])) continue;
      const age = now === Infinity ? 1 : clamp((now - h.t) / Math.max(1, (t1 - t0) * 0.12), 0, 1);
      pts.push([q[0], q[1], frpColor(h.frp), age, h.frp]);
    }
    ctx.save(); ctx.globalAlpha *= tm.alpha * fadeA;
    if (s.glow !== false) {
      ctx.globalCompositeOperation = 'lighter';
      for (const [x, y, c, , f] of pts) {
        const r = R * (3.2 + Math.min(4, Math.log10(Math.max(1, f)) * 1.6));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(c, 0.32)); g.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    for (const [x, y, c, age] of pts) {
      const pop = easeOut(age);
      if (age < 1) { ctx.strokeStyle = rgba(c, 0.8 * (1 - age)); ctx.lineWidth = 1.2 * unit; ctx.beginPath(); ctx.arc(x, y, R * (1.5 + 3 * age), 0, 7); ctx.stroke(); }
      ctx.fillStyle = rgba(c, 0.95); ctx.beginPath(); ctx.arc(x, y, R * (0.55 + 0.45 * pop), 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(40,0,0,0.55)'; ctx.lineWidth = 0.6 * unit; ctx.stroke();
    }
    ctx.restore();
  } else if (phase === 'captions' && o.frame && s.legend !== false) {
    const fr = o.frame;
    const shown = now === Infinity ? list.length : list.findIndex((h) => h.t > now + 1);
    const n = shown < 0 ? list.length : shown;
    const W = 250 * unit, Hh = 92 * unit;
    const pos = s.position || 'bottom-left';
    let x = fr.x + 24 * unit, y = fr.y + fr.h - Hh - 24 * unit;
    if (/right/.test(pos)) x = fr.x + fr.w - W - 24 * unit;
    if (/top/.test(pos)) y = fr.y + 24 * unit;
    if (pos === 'custom' && s.pos) { x = fr.x + fr.w * (+s.pos.x || 0); y = fr.y + fr.h * (+s.pos.y || 0); }
    ctx.save();
    placeAt?.(ctx, L, fr, x, y, W, Hh, { key: 'legend' });
    ctx.globalAlpha *= tm.alpha * fadeA;
    ctx.fillStyle = 'rgba(8,12,20,0.82)'; ctx.strokeStyle = 'rgba(255,140,40,0.7)'; ctx.lineWidth = 1 * unit;
    ctx.beginPath(); ctx.rect(x, y, W, Hh); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff8a2a'; ctx.fillRect(x, y, 3 * unit, Hh);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = '#ffb067'; ctx.font = `700 ${10 * unit}px Inter, system-ui, sans-serif`;
    ctx.fillText(String(s.legendTitle || 'Active fire detections').toUpperCase(), x + 14 * unit, y + 20 * unit);
    ctx.fillStyle = '#ffffff'; ctx.font = `800 ${24 * unit}px Rajdhani, Inter, sans-serif`;
    ctx.fillText(n.toLocaleString('en-US'), x + 14 * unit, y + 46 * unit);
    const nw = ctx.measureText(n.toLocaleString('en-US')).width;
    ctx.font = `500 ${11 * unit}px Inter, system-ui, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('hotspots', x + 20 * unit + nw, y + 46 * unit);
    // colour ramp
    const gx = x + 14 * unit, gy = y + 56 * unit, gw = W - 28 * unit;
    const g = ctx.createLinearGradient(gx, 0, gx + gw, 0);
    [1, 5, 20, 60, 200].forEach((f, i) => g.addColorStop(i / 4, rgba(frpColor(f), 1)));
    ctx.fillStyle = g; ctx.fillRect(gx, gy, gw, 5 * unit);
    ctx.font = `500 ${8.5 * unit}px Inter, system-ui, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('weak', gx, gy + 15 * unit); ctx.textAlign = 'right'; ctx.fillText('intense (fire power)', gx + gw, gy + 15 * unit);
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(`${fmt(t0)} → ${fmt(Math.min(now, t1))} · ${s.credit || 'NASA FIRMS'}`, gx, y + Hh - 7 * unit);
    ctx.restore();
  }
}

/** Every active fire in the world for the last 24 h: the area API with a key, else NASA's public 24 h VIIRS file. */
export async function fetchFirmsWorld({ key = firmsKey(), source = 'VIIRS_NOAA20_NRT' } = {}) {
  const url = key ? `${FIRMS}/api/area/csv/${encodeURIComponent(key)}/${source}/world/1` : FIRMS_PUBLIC_24H;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`FIRMS ${r.status}`);
  return parseFirmsCSV(await r.text());
}
/** hotspots inside a bbox */
export const hotspotsIn = (list, b) => list.filter((h) => h.ll[0] >= b[0] && h.ll[0] <= b[2] && h.ll[1] >= b[1] && h.ll[1] <= b[3]);
