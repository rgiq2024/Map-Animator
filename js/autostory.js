// Auto video: type a short suggestion ("Train collision at Urda on the Madrid–Seville line, 28 October 2026,
// Toledo, Castilla-La Mancha") and get a finished multi-scene project: an opening title, a news-explainer map
// with the route and places, the event itself in 3D (train collision, flood, cyclone, fire, blast, route…)
// and an end card. Everything is built from the app's own layers, so every part stays editable.
import { geocode, searchBoundaries } from './services.js';
import { sampleData } from './smartmap.js';
import { newScene, fitCamera } from './scene.js';
import { newLayer } from './layers.js';
import { presetGrade } from './effects.js';
import { haversine, greatCircle, curvedLine } from './geo.js';
import { routeVia } from './network.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const D2R = Math.PI / 180;
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- coordinates
/** "39.4126, -3.7139", "39.4126 N 3.7139 W", "39°24'45\"N 3°42'50\"W" → [lng, lat] (or null). */
export function parseLatLon(q) {
  const t = String(q || '').trim();
  if (!t) return null;
  const dms = /(-?\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*['′]\s*)?(?:(\d+(?:\.\d+)?)\s*["″]\s*)?([NSEW])?/gi;
  const parts = [...t.matchAll(dms)];
  if (parts.length === 2) {
    const v = parts.map((m) => { let d = +m[1] + (+m[2] || 0) / 60 + (+m[3] || 0) / 3600; if (/[SW]/i.test(m[4] || '')) d = -d; return { d, h: (m[4] || '').toUpperCase() }; });
    let [a, b] = v;
    if (a.h === 'E' || a.h === 'W') [a, b] = [b, a];
    return Math.abs(a.d) <= 90 && Math.abs(b.d) <= 180 ? [b.d, a.d] : null;
  }
  const m = t.match(/(-?\d{1,3}(?:\.\d+)?)\s*([NS])?\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*([EW])?/i);
  if (!m) return null;
  let lat = +m[1], lng = +m[3];
  if (/S/i.test(m[2] || '')) lat = -lat;
  if (/W/i.test(m[4] || '')) lng = -lng;
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) [lat, lng] = [lng, lat];
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lng, lat] : null;
}
const COORD_IN_TEXT = /(-?\d{1,2}\.\d{2,})\s*°?\s*([NS])?\s*[,;\s]\s*(-?\d{1,3}\.\d{2,})\s*°?\s*([EW])?|(\d{1,2})\s*°\s*\d{1,2}\s*['′]\s*(?:\d+(?:\.\d+)?\s*["″])?\s*[NS]\s*,?\s*\d{1,3}\s*°\s*\d{1,2}\s*['′]\s*(?:\d+(?:\.\d+)?\s*["″])?\s*[EW]/i;
export const fmtLatLon = ([lng, lat]) => `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`;

// ---------------------------------------------------------------- understanding the text
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MON_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const monthIdx = (m) => MONTHS.findIndex((x) => x.startsWith(m.toLowerCase().slice(0, 3)));
export const EVENTS = {
  traincrash: 'Train collision',
  carcrash: 'Road crash',
  shipcrash: 'Ship collision',
  planecrash: 'Plane crash',
  flood: 'Flood',
  cyclone: 'Cyclone / storm',
  quake: 'Earthquake',
  fire: 'Fire / wildfire',
  strike: 'Explosion / strike',
  siteselection: 'Site selection (where to open a store)',
  journey: 'Journey from A to B',
  servicearea: 'Reach from a place (drive / walk time)',
  place: 'Spotlight on a place',
};
const MODES = { car: 'Car', bike: 'Bicycle', foot: 'Walking', train: 'Train', plane: 'Plane' };
function detectEvent(t) {
  const x = t.toLowerCase();
  if (/(train|rail|tren|metro|tram)[^.]*?(collision|collid|crash|derail|accident|hit)|(collision|crash|derail)[^.]*?(train|rail|line)/.test(x)) return 'traincrash';
  if (/(plane|aircraft|airliner|flight|jet)[^.]*?(crash|down)/.test(x)) return 'planecrash';
  if (/(ship|vessel|ferry|boat|tanker)[^.]*?(collision|collid|crash|sink|sank|aground)/.test(x)) return 'shipcrash';
  if (/(car|road|traffic|bus|truck|lorry|highway|motorway)[^.]*?(crash|accident|collision|pile-?up)/.test(x)) return 'carcrash';
  if (/site selection|(best|new|open|ideal)\s+(a\s+)?(store|shop|branch|outlet|restaurant|location|site)|where to (open|build|put)/.test(x)) return 'siteselection';
  if (/flood|inundat/.test(x)) return 'flood';
  if (/cyclone|hurricane|typhoon|storm|tropical depression/.test(x)) return 'cyclone';
  if (/earthquake|quake|seismic|tremor/.test(x)) return 'quake';
  if (/wildfire|fire|blaze|burn/.test(x)) return 'fire';
  if (/explosion|blast|strike|attack|missile|bomb/.test(x)) return 'strike';
  if (/(drive|walk|walking|cycle|cycling|bike)[- ]?time|isochrone|within \d+ ?min|service area|reach/.test(x)) return 'servicearea';
  if (/\bfrom\b.+\bto\b|road ?trip|journey|travel|route|flight from/.test(x)) return 'journey';
  return 'place';
}
function detectMode(t) {
  const x = t.toLowerCase();
  if (/\b(plane|fly|flight|air)\b/.test(x)) return 'plane';
  if (/\b(train|rail)\b/.test(x)) return 'train';
  if (/\b(bike|bicycle|cycle|cycling)\b/.test(x)) return 'bike';
  if (/\b(walk|walking|foot|hike)\b/.test(x)) return 'foot';
  return 'car';
}
const STOP = new Set(['on', 'the', 'line', 'route', 'railway', 'in', 'at', 'near', 'by', 'and', 'with', 'from', 'to', 'of', 'a', 'an', 'high-speed', 'during', 'after', 'before', ...MONTHS]);
function cleanPlace(p) {
  const words = String(p || '').trim().split(/\s+/);
  const out = [];
  for (const w of words) {
    const lw = w.toLowerCase().replace(/[.,;:]$/, '');
    if (out.length && (STOP.has(lw) || /^\d/.test(lw))) break;
    if (!out.length && STOP.has(lw)) continue;
    out.push(w.replace(/[.,;:]$/, ''));
  }
  return out.join(' ').trim();
}
export function parseBrief(raw) {
  const text = String(raw || '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  const plan = { raw: text, coords: '', title: '', subtitle: '', date: '', place: '', context: [], from: '', to: '', event: '', mode: '', scenario: 'headon', source: '', endText: '' };
  // explicit "key: value" parts (one per line or separated by ;)
  const KEYS = { coords: 'coords', coordinates: 'coords', latlon: 'coords', latlng: 'coords', gps: 'coords', title: 'title', headline: 'title', subtitle: 'subtitle', sub: 'subtitle', date: 'date', place: 'place', location: 'place', at: 'place', region: 'context', context: 'context', from: 'from', to: 'to', event: 'event', type: 'event', mode: 'mode', by: 'mode', source: 'source', credit: 'source', end: 'endText' };
  let rest = text;
  for (const part of String(raw || '').split(/\n|;/)) {
    const m = part.match(/^\s*([a-z]+)\s*:\s*(.+)$/i);
    if (m && KEYS[m[1].toLowerCase()]) {
      const k = KEYS[m[1].toLowerCase()];
      plan[k] = k === 'context' ? m[2].split(',').map((s) => s.trim()).filter(Boolean) : m[2].trim();
      rest = rest.replace(part.replace(/\s+/g, ' ').trim(), ' ');
    }
  }
  // exact coordinates written in the sentence
  if (!plan.coords) { const cm = rest.match(COORD_IN_TEXT); if (cm && parseLatLon(cm[0])) { plan.coords = cm[0].trim(); rest = rest.replace(cm[0], ' ').replace(/\b(?:at|near)\s*(?=[,.;]|$)/i, ''); } }
  // inline "Source: …" / "Credit: …"
  const sm = rest.match(/\b(?:source|credit|credits)\s*:\s*(.+?)\s*$/i);
  if (sm) { plan.source ||= sm[1].replace(/[.]$/, ''); rest = rest.slice(0, sm.index).replace(/[\s.,;]+$/, ''); }
  // date
  if (!plan.date) {
    let m = rest.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON_RE}\\.?,?\\s+(\\d{4})\\b`, 'i'));
    if (m) plan.date = `${+m[1]} ${MONTHS[monthIdx(m[2])]} ${m[3]}`;
    else if ((m = rest.match(new RegExp(`\\b${MON_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'i')))) plan.date = `${+m[2]} ${MONTHS[monthIdx(m[1])]} ${m[3]}`;
    else if ((m = rest.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) plan.date = `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
    else if ((m = rest.match(new RegExp(`\\b${MON_RE}\\s+(\\d{4})\\b`, 'i')))) plan.date = `${MONTHS[monthIdx(m[1])]} ${m[2]}`;
    if (plan.date) plan.date = plan.date.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }
  plan.event = EVENTS[plan.event] ? plan.event : detectEvent(rest);
  if (plan.event === 'traincrash') plan.scenario = /derail|next track|adjacent|parallel/i.test(rest) ? 'sideswipe' : /rear|behind|catch/i.test(rest) ? 'rearend' : 'headon';
  plan.mode = MODES[plan.mode] ? plan.mode : detectMode(rest);
  // route endpoints
  if (!plan.from || !plan.to) {
    let m = rest.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?=\s+(?:by|on|via|in|at|during|line|route)\b|[,.;]|$)/i);
    if (!m) m = rest.match(/\b([A-Z][\p{L}'.]+(?:\s[A-Z][\p{L}'.]+)?)\s*-\s*([A-Z][\p{L}'.]+(?:\s[A-Z][\p{L}'.]+)?)\s+(?:high-speed\s+)?(?:line|route|railway|rail line|highway|motorway|road|corridor|flight)\b/u);
    if (!m) m = rest.match(/\bbetween\s+(.+?)\s+and\s+(.+?)(?=[,.;]|\s+(?:on|in|at|during)\b|$)/i);
    if (m) { plan.from ||= cleanPlace(m[1]); plan.to ||= cleanPlace(m[2]); }
  }
  // the main place
  if (!plan.place) {
    const re = /\b(?:at|near|in|off|outside|over|hits?)\s+([A-Z][\p{L}'.-]+(?:\s+(?:de|del|la|el|al|da|do|di|[A-Z][\p{L}'.-]+))*)/gu;
    let m;
    while ((m = re.exec(rest))) {
      const p = cleanPlace(m[1]);
      if (p && p !== plan.from && p !== plan.to && !MONTHS.includes(p.toLowerCase())) { plan.place = p; break; }
    }
    if (!plan.place && plan.event === 'servicearea') { const fm = rest.match(/\bfrom\s+(.+?)(?=[,.;]|$)/i); if (fm) plan.place = cleanPlace(fm[1]); }
    if (!plan.place && plan.event === 'journey') plan.place = plan.to;
    if (!plan.place && !plan.coords) { const caps = rest.match(/\b[A-Z][\p{L}'.-]{2,}(?:\s[A-Z][\p{L}'.-]{2,})*/gu) || []; plan.place = caps.find((c) => !MONTHS.includes(c.toLowerCase()) && !/^(Train|Flood|Cyclone|Storm|Fire|Road|The|A)$/.test(c)) || ''; }
  }
  // trailing ", Region, Country" parts become the location lines
  if (!plan.context.length) {
    const segs = rest.split(',').map((x) => x.trim()).filter(Boolean);
    plan.context = segs.slice(1).map((x) => x.replace(/[.]$/, '')).filter((x) => /^[\p{Lu}]/u.test(x) && !/\d{4}/.test(x) && x.split(' ').length <= 4 && x !== plan.place);
  }
  deriveTitles(plan);
  return plan;
}

/** Title and subtitle from the plan (kept if the user typed their own). */
function deriveTitles(plan) {
  const where = plan.place || plan.to || plan.context?.[0] || '';
  const storm = plan.raw.match(/\b(Cyclone|Hurricane|Typhoon|Storm)\s+([A-Z][\p{L}-]+)/u);
  if (!plan.title || plan.autoTitle) {
    plan.title = plan.event === 'cyclone' && storm ? `${storm[1]} ${storm[2]}` : plan.event === 'journey' && plan.from && plan.to ? `${plan.from} → ${plan.to}` : where || 'Breaking';
    plan.autoTitle = true;
  }
  if (!plan.subtitle || plan.autoSub) {
    const line = plan.from && plan.to ? `${plan.from}–${plan.to}` : '';
    plan.subtitle = {
      traincrash: line ? `The collision on the ${line} line` : `Train collision near ${where}`,
      carcrash: `Road crash near ${where}`, shipcrash: `Ship collision off ${where}`, planecrash: `Plane crash near ${where}`,
      flood: `Flooding in ${where}`, cyclone: `The storm reaches ${where}`, quake: `Earthquake near ${where}`, fire: `Fire near ${where}`, strike: `Blast in ${where}`,
      journey: plan.from && plan.to ? `From ${plan.from} to ${plan.to} by ${MODES[plan.mode].toLowerCase()}` : `A journey to ${where}`,
      servicearea: `How far can you get from ${where}?`, place: where, siteselection: `Where to open the next store in ${where}`,
    }[plan.event] || where;
    plan.autoSub = true;
  }
}

// ---------------------------------------------------------------- finding the places
async function find(q, hint) {
  if (!q) return null;
  const tries = [hint ? `${q}, ${hint}` : null, q].filter(Boolean);
  for (const t of tries) {
    try {
      const r = (await geocode(t))[0];
      if (r) return { name: r.name, ll: [r.lng, r.lat], bbox: r.bbox, country: r.detail.split(',').at(-1).trim(), detail: r.detail };
    } catch { /* try next */ }
  }
  return null;
}
/** Resolve the places in a plan. Returns { place, from, to, country, route } (missing ones are null). */
export async function resolvePlaces(plan, progress = () => {}) {
  const g = { place: null, from: null, to: null, country: null, route: null };
  progress('Finding the start and end…');
  if (plan.from) g.from = await find(plan.from);
  if (plan.to) g.to = await find(plan.to, g.from?.country);
  progress('Finding the place…');
  const hint = plan.context?.length ? plan.context.join(', ') : g.from?.country || g.to?.country || '';
  const exact = parseLatLon(plan.coords);
  if (exact) {
    g.place = { name: plan.place || 'Incident site', ll: exact, country: '', detail: `Exact location ${fmtLatLon(exact)}`, exact: true };
    progress('Looking up the exact location…');
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${exact[1]}&lon=${exact[0]}`, { headers: { 'Accept-Language': navigator.language || 'en' } });
      const j = r.ok ? await r.json() : null;
      if (j?.address) { g.place.country = j.address.country || ''; if (!plan.place) { plan.place = j.address.village || j.address.town || j.address.city || j.address.county || j.name || ''; g.place.name = plan.place || g.place.name; deriveTitles(plan); } }
    } catch { /* fine without it */ }
  } else if (plan.place) g.place = await find(plan.place, hint);
  const country = g.place?.country || g.from?.country || g.to?.country;
  if (plan.event === 'siteselection' && plan.place) {
    progress('Finding the region outline…');
    try {
      const b = (await searchBoundaries(plan.place))[0];
      if (b) {
        const polys = b.geometry.type === 'Polygon' ? [b.geometry.coordinates] : b.geometry.coordinates;
        let ring = polys.reduce((m, p) => (p[0].length > m.length ? p[0] : m), []);
        const step = Math.max(1, Math.ceil(ring.length / 400));
        ring = ring.filter((_, i) => i % step === 0);
        ring.push(ring[0]);
        g.region = ring.map(([x, y]) => [r6(x), r6(y)]);
      }
    } catch { /* fall back below */ }
    if (!g.region && g.place) {
      const bb = g.place.bbox || [[g.place.ll[0] - 1.5, g.place.ll[1] - 1.2], [g.place.ll[0] + 1.5, g.place.ll[1] + 1.2]];
      g.region = [[bb[0][0], bb[0][1]], [bb[1][0], bb[0][1]], [bb[1][0], bb[1][1]], [bb[0][0], bb[1][1]], [bb[0][0], bb[0][1]]];
    }
  }
  if (country) { progress('Finding the country…'); const c = await find(country); if (c) g.country = { ...c, name: country }; }
  if (g.from && g.to && plan.event !== 'servicearea') {
    progress('Tracing the route…');
    const via = g.place && plan.event !== 'journey' ? [g.from.ll, g.place.ll, g.to.ll] : [g.from.ll, g.to.ll];
    const prof = plan.event === 'journey' ? (plan.mode === 'bike' || plan.mode === 'foot' ? plan.mode : 'car') : 'car';
    if (plan.event === 'journey' && plan.mode === 'plane') g.route = { coords: greatCircle(g.from.ll, g.to.ll, 96), est: true };
    else {
      try { g.route = await routeVia(prof, via); } catch {
        const c = [];
        for (let i = 1; i < via.length; i++) c.push(...curvedLine(via[i - 1], via[i], 0.06, 40).slice(i > 1 ? 1 : 0));
        g.route = { coords: c, est: true };
      }
    }
  }
  return g;
}

// ---------------------------------------------------------------- building the scenes
const REF_W = 1000;
const V = (ll, zoom, bearing = 0, pitch = 0) => ({ center: [r6(ll[0]), r6(ll[1])], zoomRef: +zoom.toFixed(3), bearing: +(((bearing % 360) + 540) % 360 - 180).toFixed(1), pitch: +clamp(pitch, 0, 70).toFixed(1) });
const K = (t, view, ease = 'ease') => ({ t: +t.toFixed(2), view, ease });
function bboxOf(pts) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of pts) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [[w, s], [e, n]];
}
function bearingTo(a, b) {
  const y = Math.sin((b[0] - a[0]) * D2R) * Math.cos(b[1] * D2R);
  const x = Math.cos(a[1] * D2R) * Math.sin(b[1] * D2R) - Math.sin(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.cos((b[0] - a[0]) * D2R);
  return (Math.atan2(y, x) / D2R + 360) % 360;
}
function dest([lng, lat], brg, d) {
  const R = 6371008.8;
  const φ1 = lat * D2R, λ1 = lng * D2R, θ = brg * D2R, δ = d / R;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [r6(λ2 / D2R), r6(φ2 / D2R)];
}
/** Direction of the route where it passes the place (for laying the crash track along the real line). */
function localBearing(route, ll, fallback) {
  const c = route?.coords;
  if (!c || c.length < 2) return fallback;
  let best = 0, bd = Infinity;
  for (let i = 0; i < c.length; i++) { const d = haversine(c[i], ll); if (d < bd) { bd = d; best = i; } }
  const a = c[Math.max(0, best - 3)], b = c[Math.min(c.length - 1, best + 3)];
  return bd < 30000 ? bearingTo(a, b) : fallback;
}
function darkLook(sc) {
  Object.assign(sc.look, { theme: 'relief', placeNames: false, rasterLabels: false, buildings3d: false, terrain: false, globe: false, clouds: false });
  sc.look.grade = { ...presetGrade('night'), preset: 'custom', brightness: 0.5, contrast: 1.25, saturation: 0.35, warmth: -0.55, fade: 0 };
}
function L(kind, geom, start, extra = {}) {
  const l = newLayer(kind, geom, { start });
  const { style, ...rest } = extra;
  Object.assign(l, rest);
  if (style) Object.assign(l.style, style);
  return l;
}
const pt = (ll) => ({ type: 'Point', coordinates: [r6(ll[0]), r6(ll[1])] });
const circle = (c, m, n = 48) => { const r = Array.from({ length: n }, (_, i) => dest(c, (i / n) * 360, m * (1 + 0.12 * Math.sin(i * 1.7)))); r.push(r[0]); return { type: 'Polygon', coordinates: [r] }; };

/**
 * Build the scenes. opts: { length: seconds target (30 / 60 / 120), aspect: width / height, style: 'news' | 'documentary' }.
 * Returns { name, scenes }.
 */
function buildSiteStory(plan, g, opts) {
  const k = clamp((+opts.length || 45) / 30, 0.7, 4);
  const vh = REF_W / (opts.aspect || 16 / 9);
  const ring = g.region;
  if (!ring) throw new Error('No region outline found — check the place name');
  const data = sampleData(ring, 180, 7);
  const sorted = [...data].sort((a, b) => b[2] - a[2]);
  const sites = [];
  const b0 = bboxOf(ring);
  const minGap = Math.max(b0[1][0] - b0[0][0], b0[1][1] - b0[0][1]) * 0.025;
  for (const d of sorted) { if (sites.length >= 40) break; if (sites.every((o) => Math.hypot(o[0] - d[0], o[1] - d[1]) > minGap)) sites.push(d); }
  const best = sites[0];
  const fit = fitCamera(b0, REF_W, vh, 0.06);
  const zR = clamp(fit.zoom, 3, 11);
  const regionGeom = { type: 'Polygon', coordinates: [ring] };
  const span = Math.max(b0[1][0] - b0[0][0], b0[1][1] - b0[0][1]);
  const reachKm = Math.max(1.5, span * 111 * 0.035);
  const sm = (start, dur, style, anim, name) => L('smartmap', JSON.parse(JSON.stringify(regionGeom)), start, { duration: dur, anim, name, style: { data: style.data || data, dataName: 'sample data — load your own in the layer settings', ...style } });
  const legend = (start, items, hold) => L('legend', null, start, { hold, style: { items } });
  const scenes = [];
  // 1. the region: population, income, potential stores
  {
    const D = 12.5 * k;
    const sc = newScene('Region');
    Object.assign(sc.look, { theme: 'nightroads', placeNames: false, rasterLabels: false, buildings3d: false, terrain: false, globe: false, clouds: false });
    sc.camera.mode = 'keyframes'; sc.camera.tilt = 48;
    sc.camera.keys = [K(0, V(fit.center, zR - 0.25, -10, 48), 'linear'), K(D, V(fit.center, zR + 0.15, 4, 50), 'linear')];
    sc.stillStart = 0; sc.stillEnd = 0.3;
    sc.camera.lens = { ...sc.camera.lens, vignette: 0.45 };
    sc.layers.push(L('boundary', JSON.parse(JSON.stringify(regionGeom)), 0.3, { duration: 1.8, name: plan.place || 'Region', style: { stroke: '#ffb547', width: 1.6, fill: '#ffb547', fillOpacity: 0.04, glow: true, maskOutside: 0.35 } }));
    const t1 = 1.4 * k, t2 = 4.6 * k, t3 = 8 * k;
    sc.layers.push(sm(t1, 2.6, { mode: 'cells', ramp: 'blue', opacity: 0.8, cellKm: Math.max(1, span * 111 * 0.025), spreadKm: Math.max(4, span * 111 * 0.06) }, 'wipe', 'Population'));
    sc.layers.push(sm(t2, 2, { mode: 'glow', ramp: 'orange', opacity: 0.9, spreadKm: Math.max(3, span * 111 * 0.03), size: 1 }, 'fade', 'Income'));
    sc.layers.push(sm(t3, 2.5, { mode: 'rings', ramp: 'white', data: sites }, 'pop', 'Potential stores'));
    sc.layers.push(legend(0, `Population | #4f8cff | ${t1.toFixed(1)}\nIncome | #ff8a3d | ${t2.toFixed(1)}\nPotential stores | #ffffff | ${t3.toFixed(1)}`, 0));
    sc.transition = 'blur'; sc.transitionSeconds = 0.9;
    scenes.push(sc);
  }
  // 2. drive times and projected revenue around the best cluster
  {
    const D = 10 * k;
    const sc = newScene('Drive times');
    Object.assign(sc.look, { theme: 'nightroads', placeNames: false, rasterLabels: false, buildings3d: false, terrain: false });
    const near = sites.filter((d) => Math.hypot(d[0] - best[0], d[1] - best[1]) < span * 0.18);
    const c = [near.reduce((a, d) => a + d[0], 0) / near.length, near.reduce((a, d) => a + d[1], 0) / near.length];
    sc.camera.mode = 'keyframes'; sc.camera.tilt = 50;
    sc.camera.keys = [K(0, V(c, zR + 1.4, 4, 50), 'linear'), K(D, V(c, zR + 2.1, 12, 52), 'linear')];
    sc.camera.lens = { ...sc.camera.lens, vignette: 0.45, dof: true, blur: 5, focus: 0.55, band: 0.45 };
    sc.stillStart = 0; sc.stillEnd = 0.3;
    sc.layers.push(sm(0, 0.5, { mode: 'rings', ramp: 'white', data: sites }, 'none', 'Potential stores'));
    sc.layers.push(sm(0.9 * k, 3, { mode: 'reach', ramp: 'green', opacity: 0.85, reachKm, data: sites }, 'grow', 'Drive times'));
    sc.layers.push(sm(4.8 * k, 2.6, { mode: 'halo', ramp: 'yellow', opacity: 0.95, reachKm, size: 1, data: sites }, 'grow', 'Projected revenue'));
    sc.layers.push(legend(0, `Potential stores | #ffffff | 0\nDrive times | #43b062 | ${(0.9 * k).toFixed(1)}\nProjected revenue | #eef27a | ${(4.8 * k).toFixed(1)}`, 0));
    sc.transition = 'blur'; sc.transitionSeconds = 0.9;
    scenes.push(sc);
  }
  // 3. the selected store, close up with the info card
  {
    const D = 8 * k;
    const sc = newScene('Selected store');
    Object.assign(sc.look, { theme: 'nightroads', placeNames: false, rasterLabels: false, buildings3d: false, terrain: false });
    sc.camera.mode = 'keyframes'; sc.camera.tilt = 58;
    sc.camera.keys = [K(0, V(best, 12.6, 14, 56), 'linear'), K(D, V(best, 13.1, 22, 58), 'linear')];
    sc.camera.lens = { ...sc.camera.lens, vignette: 0.5, dof: true, blur: 6, focus: 0.55, band: 0.4 };
    sc.stillStart = 0; sc.stillEnd = 0.4;
    sc.layers.push(L('infocard', pt(best), 0.9, { duration: 2.6, style: { title: 'New store location', line1: plan.place ? `${plan.place} · best site` : 'Best site', line2: fmtLatLon(best), badge: 'NOW OPEN' } }));
    sc.layers.push(legend(0, 'Selected store | #ffffff | 0.4', 0));
    scenes.push(sc);
  }
  return { name: plan.title || `Site selection · ${plan.place}`, scenes };
}

export function buildStory(plan, g, opts = {}) {
  if (plan.event === 'siteselection') return buildSiteStory(plan, g, opts);
  const k = clamp((+opts.length || 45) / 45, 0.6, 3);
  const vh = REF_W / (opts.aspect || 16 / 9);
  const focus = g.place?.ll || g.to?.ll || g.from?.ll;
  if (!focus) throw new Error('No place could be found — check the place names');
  const PLACE = (plan.place || g.place?.name || plan.title || '').toUpperCase();
  const country = g.country?.name || g.place?.country || '';
  const scenes = [];
  const news = opts.style !== 'documentary';
  // ---- 1. opening: from space down to the country
  {
    const D = 6 * k;
    const sc = newScene('Opening');
    Object.assign(sc.look, { theme: 'satellite', placeNames: false, rasterLabels: false, globe: true, atmosphere: true, clouds: true, cloudMode: 'zoom', cloudAmount: 0.7 });
    sc.camera.mode = 'keyframes';
    const cz = g.country?.bbox ? fitCamera(g.country.bbox, REF_W, vh, 0.08).zoom : 4.6;
    sc.camera.keys = [K(0, V([focus[0] + 26, clamp(focus[1] * 0.5, -40, 45)], 0.6), 'ease'), K(D, V(g.country?.ll || focus, clamp(cz, 3, 6.5)), 'linear')];
    sc.stillStart = 0; sc.stillEnd = 0.2;
    sc.layers.push(L('title', null, 0.8, { duration: 2.2, hold: Math.max(1, D - 3.8), style: { look: 'cinematic', text: plan.title.toUpperCase(), sub: [plan.date, plan.subtitle].filter(Boolean).join(' · ').toUpperCase(), font: 'Archivo', dim: 0.3, accent: '#e53935' } }));
    if (news) sc.layers.push(L('news', null, 0.3, { duration: 0.8, style: { look: 'bug', channel: opts.channel || 'NEWS', live: true } }));
    sc.transition = 'dissolve'; sc.transitionSeconds = 0.8;
    scenes.push(sc);
  }
  // ---- 2. explainer map: side panel, route, places
  {
    const D = 9 * k;
    const sc = newScene('Map');
    darkLook(sc);
    const pts = [focus, g.from?.ll, g.to?.ll, ...(g.route?.coords || [])].filter(Boolean);
    const b = bboxOf(pts);
    const span = Math.max(haversine(b[0], b[1]), 20000);
    const pad = span < 30000 ? [[b[0][0] - 0.25, b[0][1] - 0.18], [b[1][0] + 0.25, b[1][1] + 0.18]] : b;
    // the panel covers the left 30 %: fit into the right part and shift the centre left
    const fitV = fitCamera(pad, REF_W * 0.62, vh, 0.1);
    const z = clamp(fitV.zoom, 3, 12);
    const shiftDeg = (REF_W * 0.17) / (512 * 2 ** z) * 360;
    const c = [fitV.center[0] - shiftDeg, fitV.center[1]];
    sc.camera.mode = 'keyframes';
    sc.camera.keys = [K(0, V(c, z - 0.35), 'linear'), K(D, V(c, z - 0.05), 'linear')];
    sc.stillStart = 0; sc.stillEnd = 0.3;
    sc.layers.push(L('title', null, 0.2, { duration: 1.2, hold: 0, style: { look: 'explainer', text: plan.title, sub: plan.subtitle, date: plan.date, lines: (plan.context?.length ? plan.context : [country]).filter(Boolean).join('\n'), font: 'Inter', color: '#ffffff', accent: '#e53935', bg: '#0a0f15', side: 'left' } }));
    if (country && g.country?.ll) sc.layers.push(L('label', pt(g.country.ll), 0.6, { duration: 1.2, style: { text: country.toUpperCase(), size: 22, color: '#c3ced4', halo: '#0a0f15', weight: 500, upper: true } }));
    let t = 1.2;
    if (g.route?.coords?.length > 1) {
      sc.layers.push(L('line', { type: 'LineString', coordinates: g.route.coords.map(([x, y]) => [r6(x), r6(y)]) }, 1.3, { duration: 3 * Math.min(k, 1.4), name: plan.from && plan.to ? `${plan.from} – ${plan.to}` : 'Route', style: { color: '#e53935', width: 4.5, dash: 'solid', arrow: false, glow: true } }));
      for (const [p, nm, at] of [[g.from, plan.from, 1.1], [g.to, plan.to, 1.3 + 3 * Math.min(k, 1.4)]]) if (p) sc.layers.push(L('point', pt(p.ll), at, { duration: 0.6, name: nm, style: { marker: 'ring', color: '#ffffff', size: 0.75, effect: 'none', label: String(nm).toUpperCase(), font: 'Inter' } }));
      t = 1.3 + 3 * Math.min(k, 1.4) + 0.3;
    }
    if (g.place) sc.layers.push(L('point', pt(g.place.ll), t, { duration: 0.8, name: PLACE, style: { marker: 'ring', color: '#e53935', size: 1, effect: 'pulse', label: plan.event === 'journey' ? PLACE : `${PLACE}${/crash|flood|fire|quake|strike/.test(plan.event) ? ' AREA' : ''}`, font: 'Inter' } }));
    if (plan.event === 'journey' && g.from && g.to) {
      const on = { car: plan.mode === 'car', bike: plan.mode === 'bike', foot: plan.mode === 'foot', train: plan.mode === 'train', plane: plan.mode === 'plane' };
      sc.layers = sc.layers.filter((x) => x.kind !== 'line');
      sc.layers.push(L('netroute', { type: 'LineString', coordinates: [g.from.ll, g.to.ll] }, 1.3, { duration: Math.max(4, D - 3), anim: 'together', style: { ...on, fromName: plan.from, toName: plan.to, title: plan.subtitle, position: 'bottom-right' } }));
    }
    sc.transition = 'dissolve'; sc.transitionSeconds = 0.8;
    scenes.push(sc);
  }
  // ---- 3. the event itself, close up
  if (plan.event !== 'journey') {
    const D = 13 * k;
    const sc = newScene('Event');
    Object.assign(sc.look, { theme: 'satellite', placeNames: false, rasterLabels: false, buildings3d: plan.event !== 'traincrash', terrain: false, globe: false, clouds: false });
    sc.camera.mode = 'keyframes';
    sc.stillStart = 0; sc.stillEnd = 0.3;
    const lb = localBearing(g.route, focus, g.from && g.to ? bearingTo(g.from.ll, g.to.ll) : 60);
    const camB = (lb + 62) % 360;
    let zEnd = 15.5, tilt = 55;
    const arrive = Math.min(D * 0.38, 5);
    if (plan.event === 'traincrash' || plan.event === 'carcrash' || plan.event === 'shipcrash') {
      const half = plan.event === 'traincrash' ? 900 : 500;
      const a = dest(focus, lb + 180, half), b = dest(focus, lb, half);
      const geom = { type: 'LineString', coordinates: [a, focus.map(r6), b] };
      const crashAt = Math.max(arrive + 3.5, D * 0.6);
      const runDur = 6;
      const col = L('collision', geom, Math.max(0.3, crashAt - runDur), { duration: runDur, name: EVENTS[plan.event] });
      if (plan.event === 'traincrash') Object.assign(col.style, { scenario: plan.scenario, liveryA: 'ave', liveryB: 'red', cars: 6, approach: plan.scenario === 'rearend' ? 500 : 420 });
      if (plan.event === 'carcrash') Object.assign(col.style, { modelA: 'builtin:car', modelB: 'builtin:truck', sizeMode: 'real', size: 1, approach: 200, impact: 'fire', blast: 0.6 });
      if (plan.event === 'shipcrash') Object.assign(col.style, { modelA: 'builtin:containership', modelB: 'builtin:tanker', sizeMode: 'real', size: 1, impact: 'fire' });
      sc.layers.push(col);
      zEnd = plan.event === 'traincrash' ? 17.9 : plan.event === 'carcrash' ? 18.6 : 15.2; tilt = 62;
      if (plan.event === 'traincrash') {
        // trees along the near side of the line
        const near = (camB + 180) % 360;
        const side = (((near - lb) % 360) + 360) % 360 < 180 ? lb + 90 : lb - 90;
        const p1 = dest(dest(focus, lb + 180, 420), side, 45), p2 = dest(dest(focus, lb, 420), side, 45);
        const p3 = dest(p2, side, 170), p4 = dest(p1, side, 170);
        sc.layers.push(L('trees', { type: 'Polygon', coordinates: [[p1, p2, p3, p4, p1]] }, 0.2, { anim: 'none', duration: 0.5, style: { type: 'mixed', density: 22, height: 11, exaggerate: 1.4 } }));
      }
    } else if (plan.event === 'flood') {
      sc.layers.push(L('flood', circle(focus, 1400), 1.5, { anim: 'spread', duration: Math.max(4, D * 0.5) })); zEnd = 13.6; tilt = 45;
    } else if (plan.event === 'cyclone') {
      const start = dest(focus, 120, 900000), mid = dest(focus, 120, 420000), end = dest(focus, 300, 200000);
      sc.layers.push(L('cyclone', { type: 'LineString', coordinates: [start, mid, focus.map(r6), end] }, 0.8, { duration: Math.max(6, D * 0.8), style: { name: plan.title, cats: 'TS, 1, 3, 4, 2', forecast: true } }));
      zEnd = 4.6; tilt = 20;
    } else if (plan.event === 'quake') {
      sc.layers.push(L('point', pt(focus), 1.2, { duration: 1, style: { marker: 'emoji', emoji: '🌐', effect: 'ripple', size: 1.8, color: '#ff3b30', label: 'EPICENTRE' } }));
      sc.layers.push(L('target', pt(focus), 2, { duration: 1.5 })); zEnd = 11.5; tilt = 35;
    } else if (plan.event === 'fire') {
      sc.layers.push(L('point', pt(focus), 1.2, { duration: 1, style: { marker: 'emoji', emoji: '🔥', effect: 'flicker', size: 2, color: '#ff6a00', label: '' } }));
      sc.layers.push(L('effect', null, 1.2, { duration: 2, hold: D, style: { look: 'fog' } })); zEnd = 15.2;
    } else if (plan.event === 'strike' || plan.event === 'planecrash') {
      if (plan.event === 'planecrash') sc.layers.push(L('model3d', { type: 'LineString', coordinates: [dest(focus, lb + 180, 2500), focus.map(r6)] }, Math.max(0.5, arrive), { duration: 3, style: { source: 'builtin:airliner', motion: 'move', sizeMode: 'real', size: 1, altitude: 0 } }));
      sc.layers.push(L('strike', pt(focus), Math.max(1.5, arrive + (plan.event === 'planecrash' ? 3 : 1)), { duration: 4, style: { size: 1.4 } })); zEnd = 16.2;
    } else if (plan.event === 'servicearea') {
      sc.layers.push(L('servicearea', pt(focus), 1.2, { duration: 4, style: { mode: plan.mode === 'plane' || plan.mode === 'train' ? 'car' : plan.mode, name: plan.place } })); zEnd = 11.2; tilt = 0;
    } else {
      sc.layers.push(L('point', pt(focus), 1.5, { duration: 0.8, style: { marker: 'pin', color: '#e53935', size: 1.3, effect: 'pulse', label: plan.place } }));
      sc.layers.push(L('target', pt(focus), 2.2, { duration: 1.5 }));
    }
    sc.camera.keys = [K(0, V(focus, Math.min(zEnd - 3.5, 13), lb, 0), 'ease'), K(arrive, V(focus, zEnd, camB, tilt), 'linear'), K(D, V(focus, zEnd + 0.3, camB + 28, tilt), 'linear')];
    sc.camera.tilt = tilt;
    const headAt = Math.min(D * 0.45, arrive + 1);
    sc.layers.push(L('title', null, 0.6, { duration: 2, hold: news ? Math.max(0.8, headAt - 2.8) : Math.max(2, D - 4), style: { look: 'location', text: `${PLACE}${country ? `, ${country.toUpperCase()}` : ''}`, sub: [plan.date ? plan.date.toUpperCase() : '', g.place?.exact ? fmtLatLon(focus) : ''].filter(Boolean).join(' · '), font: '' } }));
    if (news) {
      sc.layers.push(L('news', null, headAt, { duration: 1, hold: Math.max(3, D * 0.45), style: { look: 'headline', text: plan.subtitle, sub: [plan.place, ...(plan.context || [])].filter(Boolean).join(' · '), showClock: false } }));
      sc.layers.push(L('news', null, 0.2, { duration: 0.8, style: { look: 'bug', channel: opts.channel || 'NEWS', live: true } }));
    }
    sc.transition = 'dissolve'; sc.transitionSeconds = 0.8;
    scenes.push(sc);
  }
  // ---- 4. end card
  {
    const D = 4.5 * Math.min(k, 1.6);
    const sc = newScene('End');
    darkLook(sc);
    const last = scenes[1].camera.keys.at(-1).view;
    sc.camera.mode = 'keyframes';
    sc.camera.keys = [K(0, { ...last }, 'linear'), K(D, { ...last, zoomRef: last.zoomRef + 0.2 }, 'linear')];
    sc.stillStart = 0; sc.stillEnd = 0.2;
    sc.layers.push(L('title', null, 0.3, { duration: 2.2, hold: Math.max(1, D - 2.5), style: { look: 'ending', text: plan.endText || plan.title.toUpperCase(), sub: plan.source ? `Source: ${plan.source}` : plan.date || '', font: 'Archivo', dim: 0.45 } }));
    scenes.push(sc);
  }
  return { name: plan.title, scenes };
}

// ---------------------------------------------------------------- the dialog
const EXAMPLES = [
  'Train collision at Urda on the Madrid–Seville line, 28 October 2026, Toledo, Castilla-La Mancha',
  'Best location for a new store in Texas',
  'Road trip from Dubai to Muscat by car',
  'Flood in Valencia, 29 October 2024',
  'Cyclone Mocha hits Sittwe, Myanmar, 14 May 2023',
  'Drive time from Rashid Hospital, Dubai',
  'Flight from London to New York',
];
export function openAutoVideo({ onCreate, aspect = 16 / 9 } = {}) {
  document.querySelector('.av-modal')?.remove();
  const d = document.createElement('dialog');
  d.className = 'modal wide av-modal';
  d.innerHTML = `
    <div class="modal-head"><h3>✨ Auto video</h3><button class="icon-x" data-close>✕</button></div>
    <div class="av-body">
      <p class="muted">Describe the video in a sentence. Name the places, the date and what happened — the app finds the places, then builds the scenes: an opening, a news-style map, the event in 3D and an end card. Everything stays editable.</p>
      <textarea id="av-text" rows="3" placeholder="e.g. Train collision at Urda on the Madrid–Seville line, 28 October 2026, Toledo, Castilla-La Mancha"></textarea>
      <div class="av-ex">${EXAMPLES.map((e) => `<button type="button" class="chip" data-ex="${esc(e)}">${esc(e.length > 46 ? `${e.slice(0, 44)}…` : e)}</button>`).join('')}</div>
      <div class="av-opts">
        <label>Length <select id="av-len"><option value="30">About 30 s</option><option value="45" selected>About 45 s</option><option value="60">About 1 min</option><option value="120">About 2 min</option><option value="300">About 5 min</option></select></label>
        <label>Style <select id="av-style"><option value="news">TV news</option><option value="documentary">Documentary (no news graphics)</option></select></label>
        <label>Channel name <input id="av-channel" type="text" value="NEWS" maxlength="16" /></label>
      </div>
      <div class="av-plan" id="av-plan" hidden></div>
    </div>
    <div class="modal-actions av-actions"><span class="muted small" id="av-status"></span><button class="btn" id="av-check">Find the places</button><button class="btn primary" id="av-make" disabled>✨ Create the video</button></div>`;
  document.body.append(d);
  const $ = (s) => d.querySelector(s);
  let plan = null, geo = null;
  const status = (t) => { $('#av-status').textContent = t; };
  const field = (id, label, v, wide) => `<label class="${wide ? 'wide' : ''}"><span>${label}</span><input data-f="${id}" type="text" value="${esc(v)}" /></label>`;
  const ok = (p) => (p ? `<i class="av-ok" title="${esc(p.detail || '')}">✓ found</i>` : '<i class="av-no">not found</i>');
  function renderPlan() {
    const el = $('#av-plan');
    el.hidden = false;
    el.innerHTML = `
      <div class="av-grid">
        ${field('title', 'Title', plan.title)}${field('date', 'Date', plan.date)}
        ${field('subtitle', 'Subtitle', plan.subtitle, true)}
        <label><span>What happens</span><select data-f="event">${Object.entries(EVENTS).map(([k, v]) => `<option value="${k}" ${k === plan.event ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label ${plan.event === 'traincrash' ? '' : 'hidden'}><span>Crash type</span><select data-f="scenario"><option value="headon" ${plan.scenario === 'headon' ? 'selected' : ''}>Head-on, same track</option><option value="sideswipe" ${plan.scenario === 'sideswipe' ? 'selected' : ''}>Derails into the next track</option><option value="rearend" ${plan.scenario === 'rearend' ? 'selected' : ''}>Rear-end</option></select></label>
        <label ${plan.event === 'journey' || plan.event === 'servicearea' ? '' : 'hidden'}><span>Travel by</span><select data-f="mode">${Object.entries(MODES).map(([k, v]) => `<option value="${k}" ${k === plan.mode ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label><span>Place ${geo && !geo.place?.exact ? ok(geo.place) : ''}</span><input data-f="place" type="text" value="${esc(plan.place)}" /></label>
        <label class="wide"><span>Exact location — latitude, longitude ${plan.coords ? (parseLatLon(plan.coords) ? '<i class="av-ok">✓ used for the event</i>' : '<i class="av-no">not understood</i>') : '<i class="muted">(optional — e.g. 39.4126, -3.7139 or 39°24′45″N 3°42′50″W)</i>'}</span><input data-f="coords" type="text" value="${esc(plan.coords)}" placeholder="Leave empty to use the place name" /></label>
        <label><span>Region / country lines</span><input data-f="context" type="text" value="${esc((plan.context || []).join(', '))}" /></label>
        <label><span>Route from ${geo && plan.from ? ok(geo.from) : ''}</span><input data-f="from" type="text" value="${esc(plan.from)}" placeholder="optional" /></label>
        <label><span>Route to ${geo && plan.to ? ok(geo.to) : ''}</span><input data-f="to" type="text" value="${esc(plan.to)}" placeholder="optional" /></label>
        ${field('source', 'Source / credit (end card)', plan.source, true)}
      </div>
      <ol class="av-scenes">
        <li><b>Opening</b> — from space down to ${esc(geo?.country?.name || 'the country')}, with the title.</li>
        <li><b>Map</b> — news-explainer panel, ${plan.from && plan.to ? `the ${esc(plan.from)}–${esc(plan.to)} route, ` : ''}the place marked.</li>
        ${plan.event === 'journey' ? '' : `<li><b>${esc(EVENTS[plan.event])}</b> — close up at ${esc(plan.place || 'the place')} in 3D.</li>`}
        <li><b>End card</b>${plan.source ? ` with “Source: ${esc(plan.source)}”` : ''}.</li>
      </ol>`;
  }
  const readFields = () => {
    d.querySelectorAll('[data-f]').forEach((el) => { const k = el.dataset.f; plan[k] = k === 'context' ? el.value.split(',').map((s) => s.trim()).filter(Boolean) : el.value.trim(); });
  };
  async function check() {
    const text = $('#av-text').value.trim();
    if (!text) { status('Type a sentence first'); return; }
    if (plan && $('#av-plan').hidden === false) readFields(); else plan = parseBrief(text);
    $('#av-make').disabled = true; $('#av-check').disabled = true;
    renderPlan();
    try {
      geo = await resolvePlaces(plan, status);
      const found = geo.place || geo.from || geo.to;
      status(found ? 'Ready — check the details, then create the video' : 'No places found — fix the names and press “Find the places” again');
      $('#av-make').disabled = !found;
    } catch (e) { status(e.message || 'Could not search for places'); }
    $('#av-check').disabled = false;
    renderPlan();
  }
  $('#av-text').addEventListener('input', () => { plan = null; geo = null; $('#av-plan').hidden = true; $('#av-make').disabled = true; status(''); });
  $('#av-text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); check(); } });
  d.querySelector('.av-ex').addEventListener('click', (e) => { const b = e.target.closest('[data-ex]'); if (b) { $('#av-text').value = b.dataset.ex; $('#av-text').dispatchEvent(new Event('input')); check(); } });
  $('#av-plan').addEventListener('change', (e) => {
    if (!plan) return;
    const k = e.target.dataset.f;
    readFields();
    if (k === 'title') plan.autoTitle = false;
    if (k === 'subtitle') plan.autoSub = false;
    if (k === 'event') renderPlan();
    if (k === 'coords') renderPlan();
    if (['place', 'from', 'to', 'context', 'coords'].includes(k)) { $('#av-make').disabled = true; status('Places changed — press “Find the places”'); }
  });
  $('#av-check').onclick = check;
  $('#av-make').onclick = async () => {
    readFields();
    try {
      const story = buildStory(plan, geo, { length: +$('#av-len').value, style: $('#av-style').value, channel: $('#av-channel').value.trim() || 'NEWS', aspect });
      d.close(); d.remove();
      await onCreate?.(story, plan);
    } catch (e) { status(e.message || 'Could not build the video'); }
  };
  d.querySelector('[data-close]').onclick = () => { d.close(); d.remove(); };
  d.addEventListener('close', () => d.remove());
  d.showModal();
  setTimeout(() => $('#av-text').focus(), 30);
}
