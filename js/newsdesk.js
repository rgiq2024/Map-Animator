// AI news desk: finds today's disasters and incidents, then builds a whole news video for one of them:
// fly / zoom to the incident → pre and post satellite images → damage & analysis → photos and videos → end card.
// Text can be written by AI (your own Anthropic API key, kept in this browser) or by built-in templates.
import { NEWS_CATS, fetchIncidents, addFireHotspots, rankIncidents } from './newsfeeds.js';
import { parseBrief, resolvePlaces, buildStory, defaultBlocks, mkLayer as L, camKey as K, camView as V, destPoint as dest, pointGeom as pt, circleGeom as circle, REF_W, fmtLatLon } from './autostory.js';
import { newScene, fitCamera } from './scene.js';
import { pcScenes, pcRenders, pcDayTiles } from './pcsat.js';
import { putMedia } from './store.js';
import { applyBriefing, briefFrame, splitBriefing, layoutBoxes, viewIntoWindow, zoomCamera, ZOOM_DEFAULTS } from './briefing.js';
import { fetchFirms, fetchFirmsWorld, hotspotsIn, firmsKey, setFirmsKey, bboxAround, unpackHotspots, packHotspots, hotspotStats } from './firms.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (t) => { const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const ago = (t) => { const h = (Date.now() - t) / 3600e3; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`; };
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// ================================================================= the daily feed (written every 24 h by the GitHub Action)
export async function loadDaily() {
  try {
    const r = await fetch(`news/latest.json?t=${Math.floor(Date.now() / 600e3)}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j.items) ? j : null;
  } catch { return null; }
}

// ================================================================= AI writing (optional)
const AI_KEY = 'ma.ai';
export const aiConfig = () => LS.get(AI_KEY, { key: '', model: 'claude-haiku-5-5' });
export async function aiWrite(inc, extra = '') {
  const cfg = aiConfig();
  if (!cfg.key) throw new Error('Add your Anthropic API key first (AI settings)');
  const data = { category: NEWS_CATS[inc.cat]?.name, headline: inc.title, place: inc.place, country: inc.country, coordinates: inc.ll ? fmtLatLon(inc.ll) : null, date: inc.time ? longDate(inc.time) : null, severity: inc.sevText, facts: inc.facts, source: inc.source, reports: (inc.links || []).slice(0, 8).map((l) => `${l.source}: ${l.title}`), notes: extra || undefined };
  const prompt = `You write the on-screen text for a short map-based news video (about one minute) about this incident. Use ONLY the information below; never invent numbers, casualties or causes. If something is unknown, leave it out.\n\nINCIDENT (JSON):\n${JSON.stringify(data, null, 1)}\n\nReply with JSON only, no prose, with these keys:\n{"headline": "max 60 characters, plain news style", "subtitle": "max 90 characters: where and when", "place": "the town / area name to put on the map", "facts": ["Label | value", "... 3 to 5 short facts from the data"], "analysis": ["2 to 4 short bullet points (max 70 characters each) on what the satellite view and the data show or what to look for"], "narration": "a 70 to 110 word voice-over script, neutral and factual", "endText": "max 40 characters closing line", "youtubeTitle": "max 90 characters", "youtubeDescription": "2-4 sentences plus the sources", "hashtags": ["5 to 8 hashtags"]}`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: cfg.model || 'claude-haiku-5-5', max_tokens: 1400, messages: [{ role: 'user', content: prompt }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `AI request failed (${r.status})`);
  const txt = (j.content || []).map((c) => c.text || '').join('');
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('The AI did not return the text in the expected form — try again');
  return JSON.parse(m[0]);
}

/** Text without AI: built from the data. */
export function templateText(inc) {
  const C = NEWS_CATS[inc.cat] || { name: 'Incident' };
  const place = inc.place || inc.country || '';
  const date = inc.time ? longDate(inc.time) : '';
  let headline = inc.title;
  if (inc.cat === 'earthquake' && inc.mag) headline = `M${inc.mag.toFixed(1)} earthquake strikes ${place.split(',')[0]}`;
  else if (inc.source === 'GDACS' || inc.source === 'NASA EONET') headline = `${C.name} — ${place.split(',')[0] || inc.title}`;
  headline = headline.replace(/\s+/g, ' ').trim();
  if (headline.length > 72) headline = `${headline.slice(0, 70).replace(/\s+\S*$/, '')}…`;
  const facts = Object.entries(inc.facts || {}).filter(([, v]) => v).slice(0, 5).map(([k, v]) => `${k} | ${v}`);
  if (inc.ll) facts.push(`Location | ${fmtLatLon(inc.ll)}`);
  const analysis = {
    earthquake: ['Rings show distance from the epicentre', 'Compare roofs and roads before and after', 'Aftershocks are likely in the coming days'],
    flood: ['Brown water spreads beyond the river banks', 'Compare fields and roads before and after', 'Radar sees floods through cloud'],
    flashflood: ['Fast water followed the valley floor', 'Look for debris and washed-out roads', 'Compare the river channel before and after'],
    wildfire: ['Dark burn scars show the fire’s path', 'Smoke may hide the after image', 'Red dots: active fire detections'],
    deforestation: ['Cleared land shows as bare brown patches', 'Compare forest cover before and after', 'New roads often lead clearing'],
    landslide: ['Look for a fresh brown scar on the slope', 'Debris may block roads and rivers', 'Compare the hillside before and after'],
    volcano: ['Ash and lava flows change the surface', 'Compare the crater area before and after'],
    storm: ['Look for flooding along the coast', 'Damaged roofs show as bright patches'],
    drought: ['Fields and reservoirs turn brown', 'Compare water levels before and after'],
    manmade: ['Compare the site before and after', 'Look for scorch marks or debris'],
    migration: ['The route and crossing point are marked', 'Distances are measured on the map'],
  }[inc.cat] || ['Compare the area before and after'];
  return { headline, subtitle: [place, date].filter(Boolean).join(' · '), place: place.split(',')[0], facts, analysis, narration: '', endText: 'More updates as they come in', youtubeTitle: `${headline} | ${date}`, youtubeDescription: `${headline}. ${[place, date].filter(Boolean).join(', ')}. Sources: ${[inc.source, ...(inc.alsoIn || [])].join(', ')}.`, hashtags: ['#news', `#${C.name.replace(/[^a-z]/gi, '')}`, '#disaster', '#maps', '#satellite'] };
}

// ================================================================= pre / post satellite scenes
async function satPair(ll, when, km, cat, onStatus) {
  const d = Math.max(0.6, km) * 1000;
  const bbox = [dest(ll, 270, d)[0], dest(ll, 180, d)[1], dest(ll, 90, d)[0], dest(ll, 0, d)[1]];
  const t0 = when || Date.now();
  const pick = (list, prefer) => {
    if (!list.length) return null;
    const ok = list.filter((x) => x.cloud == null || x.cloud < 25);
    return prefer === 'newest' ? (ok[0] || list.slice().sort((a, b) => (a.cloud ?? 0) - (b.cloud ?? 0))[0]) : (ok.at(-1) || list.slice().sort((a, b) => (a.cloud ?? 0) - (b.cloud ?? 0))[0]);
  };
  const tryCol = async (col) => {
    onStatus?.(`Searching ${col.startsWith('sentinel-1') ? 'Sentinel-1 radar' : 'Sentinel-2'} scenes…`);
    const before = await pcScenes({ collection: col, bbox, from: iso(t0 - 60 * 86400e3), to: iso(t0 - 86400e3), maxCloud: col.startsWith('sentinel-2') ? 60 : 100 });
    const after = await pcScenes({ collection: col, bbox, from: iso(t0), to: iso(Date.now()), maxCloud: col.startsWith('sentinel-2') ? 70 : 100 });
    return { col, before: pick(before, 'newest'), after: pick(after, 'oldest') };
  };
  let r = await tryCol('sentinel-2-l2a');
  if ((!r.after || !r.before) && (cat === 'flood' || cat === 'flashflood' || cat === 'storm')) { const r1 = await tryCol('sentinel-1-rtc'); if (r1.before && r1.after) r = r1; }
  if (!r.before) return { error: 'No earlier satellite scene found over the place' };
  const looks = await pcRenders(r.col).catch(() => []);
  const want = cat === 'wildfire' ? /short.?wave|swir|false color|burn/i : r.col.startsWith('sentinel-1') ? /vv|false/i : /natural|true/i;
  const look = looks.find((o) => want.test(o.name)) || looks.find((o) => /natural|true/i.test(o.name)) || looks[0];
  if (!look) return { error: 'No imagery looks available' };
  onStatus?.('Preparing the before / after imagery…');
  const frames = [];
  for (const [g, tag] of [[r.before, 'BEFORE'], [r.after, 'AFTER']]) {
    if (!g) continue;
    const t = await pcDayTiles({ collection: r.col, bbox, day: g.day, options: look.options, maxCloud: 100 });
    frames.push({ url: t.url, date: g.day, label: `${tag} · ${g.label}`, minzoom: Math.max(0, look.minZoom || 0), maxzoom: t.maxzoom || 18 });
  }
  return { frames, col: r.col, look: look.name, bbox, missingAfter: !r.after };
}

async function commonsPhotos(ll, n = 3) {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=geosearch&ggscoord=${ll[1]}|${ll[0]}&ggsradius=10000&ggsnamespace=6&ggslimit=20&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=1280`;
  const j = await (await fetch(u)).json();
  const pages = Object.values(j.query?.pages || {}).filter((p) => /image\/(jpeg|png|webp)/.test(p.imageinfo?.[0]?.mime || ''));
  const out = [];
  for (const p of pages.slice(0, n)) {
    const ii = p.imageinfo[0], md = ii.extmetadata || {};
    const strip = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    try {
      const blob = await (await fetch(ii.thumburl || ii.url)).blob();
      const id = `media_${Date.now().toString(36)}c${out.length}`;
      await putMedia(id, blob);
      out.push({ id, title: strip(md.ObjectName?.value || p.title.replace(/^File:|\.\w+$/g, '')).slice(0, 48), credit: `${strip(md.Artist?.value).slice(0, 40) || 'Wikimedia Commons'} · ${strip(md.LicenseShortName?.value) || 'see Commons'}` });
    } catch { /* skip that one */ }
  }
  return out;
}

// ================================================================= building the video
/**
 * text: { headline, subtitle, place, facts[], analysis[], endText }, parts: { fly, sat, analysis, media, end }, media: [{ id, kind: 'image'|'video', name }]
 */
export async function buildNewsStory(inc, text, parts, media = [], opts = {}, onStatus = () => {}) {
  const C = NEWS_CATS[inc.cat] || { name: 'Incident', event: 'place' };
  const plan = parseBrief(inc.ll ? text.headline : `${text.headline}${text.place ? ` in ${text.place}` : ''}`);
  Object.assign(plan, { title: text.headline, subtitle: text.subtitle, date: inc.time ? longDate(inc.time) : '', source: [inc.source, ...(inc.alsoIn || [])].filter((v, i, a) => a.indexOf(v) === i).join(' · '), endText: text.endText || text.headline, event: C.event || 'place', autoTitle: false, autoSub: false });
  if (text.place) plan.place = text.place;
  if (inc.ll) plan.coords = `${inc.ll[1]}, ${inc.ll[0]}`;
  if (inc.country && !plan.context?.length) plan.context = [inc.country];
  const zoneKm = { earthquake: 25, flood: 6, flashflood: 3, wildfire: 5, storm: 40, drought: 20, volcano: 6, landslide: 1.2, deforestation: 4, manmade: 0.8, migration: 10 }[inc.cat] || 3;
  plan.blocks = { ...defaultBlocks(plan), opening: !!parts.fly, explainer: !!parts.fly, event3d: false, spot: !!parts.fly, zone: false, callout: false, compare: false, hud: false, weather: false, lower: true, ticker: [text.subtitle, ...(text.facts || []).map((f) => f.replace(' | ', ': '))].filter(Boolean).join(' | '), end: !!parts.end, music: !!opts.music, musicKind: 'tension', zoneKm };
  onStatus('Finding the place…');
  const geo = await resolvePlaces(plan, onStatus);
  if (!geo.place?.ll) throw new Error('Could not find the place on the map — type the place name in “Place”');
  const focus = geo.place.ll;
  const story = buildStory(plan, geo, { length: opts.length || 60, style: 'news', channel: opts.channel || 'NEWS', aspect: opts.aspect || 16 / 9, baseClose: 'satellite', baseMap: 'relief' });
  const vh = REF_W / (opts.aspect || 16 / 9);
  const endIdx = story.scenes.findIndex((s) => s.name === 'End');
  const insert = [];
  const half = zoneKm * 1000 * 1.25;
  const box = [dest(focus, 270, half)[0], dest(focus, 180, half)[1], dest(focus, 90, half)[0], dest(focus, 0, half)[1]];
  const fit = fitCamera([[box[0], box[1]], [box[2], box[3]]], REF_W, vh, 0.05);
  const zClose = Math.min(16, Math.max(6, fit.zoom));
  const credits = [];
  let sat = null;
  // ---- pre and post satellite images
  if (parts.sat) {
    let res = null;
    try { res = await satPair(focus, inc.time, Math.min(zoneKm * 1.25, 12), inc.cat, onStatus); } catch (e) { res = { error: e.message }; }
    sat = res;
    const sc = newScene('Pre & post satellite');
    Object.assign(sc.look, { theme: 'satellite', placeNames: false, rasterLabels: false, buildings3d: false, terrain: false, globe: false, clouds: false });
    const D = 9;
    const z = Math.max(zClose, res?.frames?.[0]?.minzoom || 0);
    sc.camera.mode = 'keyframes';
    sc.camera.keys = [K(0, V(focus, z - 0.3), 'linear'), K(D, V(focus, z + 0.15), 'linear')];
    sc.stillStart = 0; sc.stillEnd = 0.3;
    sc.layers.push(L('ttitle', null, 0.2, { duration: 1, name: 'Satellite title', style: { look: 'split', kicker: 'Satellite view', text: res?.frames?.length > 1 ? 'Before and after' : 'From space', sub: text.place || '', position: 'custom', pos: { x: 0.22, y: 0.24 }, size: 0.55, color: '#ffffff', accent: '#7fb6ff', font: 'sans' } }));
    if (res?.frames?.length) {
      const per = res.frames.length > 1 ? 3.6 : 7;
      sc.layers.push(L('timeseries', null, 0.4, { duration: +(res.frames.length * per).toFixed(2), name: res.col.startsWith('sentinel-1') ? 'Sentinel-1 radar · before / after' : 'Sentinel-2 · before / after', style: { source: 'pc', pcCol: res.col, pcLook: res.look, pcFrom: res.frames[0].date, pcTo: res.frames.at(-1).date, pcCloud: 100, pcBbox: res.bbox, frames: res.frames, opacity: 1, position: 'custom', pos: { x: 0.74, y: 0.25 }, labelSize: 0.5, bar: true, per, fade: 1, credit: `Microsoft Planetary Computer · contains modified Copernicus Sentinel data ${new Date().getUTCFullYear()}` } }));
      credits.push('Copernicus Sentinel data via Microsoft Planetary Computer');
      if (res.missingAfter) sc.layers.push(L('ttitle', null, 3.5, { duration: 0.6, name: 'No after image yet', style: { look: 'frame', kicker: 'Note', text: 'No clear image after the event yet', sub: 'Sentinel-2 passes every 5 days — rebuild later', position: 'bottom-left', size: 0.45, color: '#ffffff', accent: '#ffd23f', font: 'sans' } }));
    } else sc.layers.push(L('ttitle', null, 0.8, { duration: 0.6, name: 'No imagery note', style: { look: 'frame', kicker: 'Satellite', text: 'No clear satellite scene found yet', sub: res?.error || '', position: 'bottom-left', size: 0.5, color: '#ffffff', accent: '#ffd23f', font: 'sans' } }));
    sc.layers.push(L('point', pt(focus), 1.2, { duration: 0.8, name: 'Incident', style: { marker: 'ring', color: '#ff3b30', size: 1, effect: 'pulse', label: '' } }));
    sc.transition = 'dissolve'; sc.transitionSeconds = 0.8;
    insert.push(sc);
  }
  // ---- damage & analysis
  if (parts.analysis) {
    const sc = newScene('Damage & analysis');
    Object.assign(sc.look, { theme: 'satellite', placeNames: true, rasterLabels: false, buildings3d: false, terrain: false, globe: false, clouds: false });
    const D = 10;
    sc.camera.mode = 'keyframes';
    sc.camera.keys = [K(0, V(focus, zClose - 0.6, -10, 25), 'ease'), K(D, V(focus, zClose - 0.25, 12, 42), 'linear')];
    sc.stillStart = 0; sc.stillEnd = 0.3;
    if (inc.cat === 'earthquake') {
      const m = inc.mag || 6, base = Math.pow(10, 0.43 * m - 1.7);
      const rings = [['Strong shaking', base], ['Moderate shaking', base * 2.6], ['Light shaking', base * 6]].map(([n, r]) => `${n} | ${Math.max(1, Math.round(r))} | km | none`).join('\n');
      sc.layers.push(L('rangerings', pt(focus), 0.6, { duration: 3.5, name: 'Shaking rings (estimate)', style: { rings, color: '#ffffff', labelColor: '#ffffff', iconColor: '#ffffff', dash: true, width: 1.6, base: true, labelSize: 1, angle: 230, spread: 40 } }));
      sc.camera.keys = [K(0, V(focus, Math.max(5, zClose - 2.2)), 'ease'), K(D, V(focus, Math.max(5, zClose - 1.8), 8, 30), 'linear')];
    } else {
      sc.layers.push(L('area', circle(focus, zoneKm * 1000), 0.6, { duration: 2, name: 'Affected area (approximate)', style: { stroke: '#ffffff', fill: inc.cat === 'wildfire' ? '#ff5a1f' : inc.cat === 'deforestation' ? '#c98b2e' : '#2f80ff', fillOpacity: 0.22, dash: 'dashed', width: 2 } }));
    }
    if (inc.track?.length > 1) sc.layers.push(L('line', { type: 'LineString', coordinates: inc.track }, 1, { duration: 3, name: 'Reported positions', style: { color: '#ffd23f', width: 3, dash: 'solid', glow: true } }));
    sc.layers.push(L('tcallout', pt(focus), 1.4, { duration: 1.2, name: 'Incident callout', style: { look: 'glass', tag: C.name, title: text.place || 'Incident site', sub: inc.ll ? fmtLatLon(inc.ll) : text.subtitle, box: '#0d47c9', ink: '#ffffff', accent: '#ffffff', leader: 'straight', end: 'ring', dx: 150, dy: -120, size: 1, font: 'sans', upper: false, shadow: true } }));
    const rows = [...(text.facts || []), ...(text.analysis || []).map((a, i) => `${i ? '' : 'Analysis'} | ${a}`)].slice(0, 6).join('\n');
    sc.layers.push(L('ttitle', null, 2.6, { duration: 1.2, name: 'Facts & analysis', style: { look: 'facts', kicker: 'Damage & analysis', text: text.headline.length > 34 ? C.name : text.headline, body: rows, position: 'custom', pos: { x: 0.2, y: 0.5 }, size: 0.6, color: '#ffffff', accent: '#ffffff', bg: '#0d47c9', font: 'sans' } }));
    sc.transition = 'dissolve'; sc.transitionSeconds = 0.8;
    insert.push(sc);
  }
  // ---- photos and videos (left out when there is nothing to show)
  if (parts.media) {
    const items = [...media];
    if (opts.commons) { onStatus('Looking for photos of the area…'); try { for (const p of await commonsPhotos(focus, Math.max(0, 3 - items.filter((m) => m.kind === 'image').length))) { items.push({ id: p.id, kind: 'image', name: p.title, credit: p.credit }); credits.push(`Photo: ${p.credit} (Wikimedia Commons)`); } } catch { /* none */ } }
    if (items.length) {
      const sc = newScene('Photos & videos');
      Object.assign(sc.look, { theme: 'satellite', placeNames: false, rasterLabels: false, buildings3d: false, terrain: false, globe: false, clouds: false });
      const imgs = items.filter((m) => m.kind === 'image').slice(0, 4), vids = items.filter((m) => m.kind === 'video').slice(0, 2);
      const D = Math.max(7, 3 + imgs.length * 2 + vids.length * 4);
      sc.camera.mode = 'keyframes';
      sc.camera.keys = [K(0, V(focus, zClose - 0.8), 'linear'), K(D, V(focus, zClose - 0.5, 10), 'linear')];
      sc.stillStart = 0; sc.stillEnd = 0.3;
      sc.look.grade = { preset: 'custom', brightness: 0.55, contrast: 1.1, saturation: 0.5, warmth: -0.2, fade: 0 };
      sc.layers.push(L('ttitle', null, 0.2, { duration: 0.9, name: 'Media title', style: { look: 'split', kicker: 'From the ground', text: 'Photos and videos', sub: text.place || '', position: 'custom', pos: { x: 0.22, y: 0.24 }, size: 0.55, color: '#ffffff', accent: '#7fb6ff', font: 'sans' } }));
      sc.layers.push(L('point', pt(focus), 0.4, { duration: 0.8, name: 'Incident', style: { marker: 'ring', color: '#ff3b30', size: 1, effect: 'pulse', label: '' } }));
      const spots = [[-300, -40], [80, -70], [-220, 130], [150, 110]];
      imgs.forEach((m, i) => sc.layers.push(L('photocard', pt(focus), 1 + i * 1.8, { duration: 0.8, name: `Photo ${i + 1}`, style: { title: m.name || `Photo ${i + 1}`, media: m.id, dx: spots[i][0], dy: spots[i][1], width: 260 } })));
      const v0 = 1 + imgs.length * 1.8;
      vids.forEach((m, i) => sc.layers.push(L('video', null, v0 + i * 4, { duration: Math.max(4, D - v0 - i * 4), name: m.name || `Video ${i + 1}`, style: { media: m.id, name: m.name, fit: 'pip', width: 0.4, position: 'custom', pos: { x: i ? 0.27 : 0.73, y: 0.5 }, caption: m.name || '' } })));
      if (vids.length) credits.push('Video: as supplied');
      sc.transition = 'dissolve'; sc.transitionSeconds = 0.8;
      insert.push(sc);
    } else onStatus('No photos or videos found — the photos scene was left out');
  }
  story.scenes.splice(endIdx >= 0 ? endIdx : story.scenes.length, 0, ...insert);
  // sources line on the end card
  const end = story.scenes.find((s) => s.name === 'End');
  if (end) end.layers.push(L('mapcredits', null, 0.5, { duration: 0.6, name: 'Sources', style: { text: [`Sources: ${plan.source}`, ...credits].join(' | '), look: 'plain', position: 'bottom-center', color: '#ffffff', size: 0.85 } }));
  story.name = `${text.headline} — ${plan.date}`;
  if (opts.layout !== 'classic') {
    const fr = sat?.frames || [];
    const spec = (f) => (f ? { url: f.url, date: f.date, minzoom: f.minzoom, maxzoom: f.maxzoom } : null);
    applyBriefing(story, {
      ll: focus, title: text.headline, sub: 'Geospatial analysis', kicker: 'Geospatial intelligence briefing', tag: C.name,
      date: plan.date, place: text.place || geo.place?.name || '', country: geo.country?.name || geo.place?.country || inc.country || '',
      event: C.name, eventKey: inc.cat, assessment: inc.sevText || (text.analysis || [])[0] || '', coords: fmtLatLon(focus),
      sources: [`Sources: ${plan.source}`, ...credits].join(' · '), before: spec(fr.length > 1 ? fr[0] : null), after: spec(fr.length > 1 ? fr.at(-1) : fr[0]),
      thumbZoom: Math.max(fr[0]?.minzoom || 0, Math.min(16, zClose - 0.4)),
      geobrief: opts.layout === 'geobrief', ticker: [text.subtitle, ...(text.analysis || [])].filter(Boolean).join('\n'),
    }, opts.aspect || 16 / 9);
  }
  return story;
}

// ================================================================= disaster brief: Intro → Zoom to location → Pre & post → Photos → Analysis → End
/** Hotspots for a fire story: from your FIRMS key (fresh, last 3 days) or the ones the daily feed brought along. */
async function fireHotspots(inc, ll, onStatus) {
  let list = inc.hotspots ? unpackHotspots(inc.hotspots) : [];
  if (firmsKey()) {
    onStatus('Asking NASA FIRMS for active fires…');
    try { const bb = bboxAround(ll, 40); const l = hotspotsIn(await fetchFirms({ bbox: bb, days: 3 }), bb); if (l.length || !list.length) list = l; } catch (e) { onStatus(`FIRMS: ${e.message}`); }
  }
  return list;
}
const FIRE = (c) => c === 'wildfire';
const FLOOD = (c) => c === 'flood' || c === 'flashflood';
/**
 * A whole GEO·BRIEF news video for one incident, always in this order:
 * Intro · Zoom to location · Pre & post satellite · Photos · Analysis (FIRMS hotspots for fires, flood extent for floods) · End.
 */
export async function buildDisasterBrief(inc, text, media = [], opts = {}, onStatus = () => {}) {
  const C = NEWS_CATS[inc.cat] || { name: 'Incident', event: 'place' };
  const aspect = opts.aspect || 16 / 9;
  const plan = parseBrief(inc.ll ? text.headline : `${text.headline}${text.place ? ` in ${text.place}` : ''}`);
  Object.assign(plan, { title: text.headline, subtitle: text.subtitle, event: C.event || 'place' });
  if (text.place) plan.place = text.place;
  if (inc.ll) plan.coords = `${inc.ll[1]}, ${inc.ll[0]}`;
  if (inc.country && !plan.context?.length) plan.context = [inc.country];
  onStatus('Finding the place…');
  const geo = await resolvePlaces(plan, onStatus);
  if (!geo.place?.ll) throw new Error('Could not find the place on the map — type the place name in “Place”');
  let focus = geo.place.ll;
  const date = inc.time ? longDate(inc.time) : longDate(Date.now());
  const sources = [inc.source, ...(inc.alsoIn || [])].filter((v, i, a) => v && a.indexOf(v) === i);
  const credits = [];
  // ---- fire: NASA FIRMS hotspots
  let hot = [], st = null;
  if (FIRE(inc.cat)) {
    hot = await fireHotspots(inc, focus, onStatus);
    st = hotspotStats(hot);
    if (st) { credits.push('Active fires: NASA FIRMS (VIIRS 375 m)'); if (!inc.ll) focus = st.centre; }
  }
  const zoneKm = FIRE(inc.cat) ? Math.max(3, Math.min(30, st ? st.spanKm * 0.6 : 5)) : { flood: 6, flashflood: 3 }[inc.cat] || 4;
  const half = zoneKm * 1000 * 1.25;
  const vh = REF_W / aspect;
  const fit = fitCamera([[dest(focus, 270, half)[0], dest(focus, 180, half)[1]], [dest(focus, 90, half)[0], dest(focus, 0, half)[1]]], REF_W, vh, 0.05);
  const zClose = Math.min(15, Math.max(6, fit.zoom));
  // ---- satellite before / after
  let sat = null;
  try { sat = await satPair(focus, inc.time, Math.min(zoneKm * 1.25, 12), inc.cat, onStatus); } catch (e) { sat = { error: e.message }; }
  if (sat?.frames?.length) credits.push(sat.col?.startsWith('sentinel-1') ? 'Copernicus Sentinel-1 radar via Microsoft Planetary Computer' : 'Copernicus Sentinel-2 via Microsoft Planetary Computer');
  // ---- photos
  const items = media.filter((m) => m.kind === 'image');
  if (opts.commons !== false && items.length < 4) {
    onStatus('Looking for photos of the area…');
    try { for (const p of await commonsPhotos(focus, 4 - items.length)) { items.push({ id: p.id, kind: 'image', name: p.title, credit: p.credit }); credits.push(`Photo: ${p.credit} (Wikimedia Commons)`); } } catch { /* none */ }
  }
  // ---- text for every frame
  const facts = [...(text.facts || [])];
  if (st) {
    const hrs = Math.max(1, Math.round((st.t1 - st.t0) / 3600e3));
    facts.unshift(`Active fire detections | ${st.count.toLocaleString('en-US')} in ${hrs} h`, `Strongest fire power | ${st.maxFrp} MW`, `Fire area spans | about ${st.spanKm} km`);
  }
  const assessment = st ? `${st.count.toLocaleString('en-US')} active fire detections (NASA FIRMS)` : inc.sevText || (text.analysis || [])[0] || '';
  const fr = sat?.frames || [];
  const spec = (f) => (f ? { url: f.url, date: f.date, minzoom: f.minzoom, maxzoom: f.maxzoom } : null);
  const info = {
    ll: focus, title: text.headline, sub: FIRE(inc.cat) ? 'Wildfire · satellite assessment' : FLOOD(inc.cat) ? 'Flood · satellite assessment' : 'Geospatial analysis',
    kicker: 'Geospatial intelligence briefing', tag: C.name, date, place: text.place || geo.place?.name || '', country: geo.country?.name || geo.place?.country || inc.country || '',
    event: C.name, eventKey: inc.cat, assessment, coords: fmtLatLon(focus), sources: [`Sources: ${sources.join(' · ')}`, ...credits].join(' · '),
    before: spec(fr.length > 1 ? fr[0] : null), after: spec(fr.length > 1 ? fr.at(-1) : fr[0]), thumbZoom: Math.max(fr[0]?.minzoom || 0, Math.min(16, zClose - 0.4)),
    geobrief: true, ticker: [text.subtitle, ...facts.map((f) => f.replace(' | ', ': '))].filter(Boolean).join('\n'), accent: FIRE(inc.cat) ? '#ff8a2a' : '#35c8ff',
  };
  const sat0 = { theme: 'satellite', placeNames: false, rasterLabels: false, buildings3d: false, terrain: false, clouds: false };
  const frameOf = (layout, extra = {}) => splitBriefing(briefFrame(info, layout, extra));
  const boxesOf = (layout) => layoutBoxes(layout, aspect, !!(info.before || info.after), { header: true, ticker: false });
  const inWindow = (sc, layout) => { const b = boxesOf(layout); if (b.win && sc.camera.keys?.length) sc.camera.keys = sc.camera.keys.map((k) => ({ ...k, view: viewIntoWindow(k.view, b.win, aspect) })); };
  const scene = (name, look, keys, stillEnd = 0.4) => { const sc = newScene(name); Object.assign(sc.look, look); sc.camera.mode = 'keyframes'; sc.camera.keys = keys; sc.stillStart = 0; sc.stillEnd = stillEnd; sc.transition = 'scanwipe'; sc.transitionSeconds = 0.9; return sc; };
  const scenes = [];
  // 1 · Intro — title over a slowly turning globe
  {
    const g = [focus[0] - 25, Math.max(-45, Math.min(45, focus[1] * 0.5))];
    const sc = scene('Intro', { ...sat0, globe: true }, [K(0, V(g, 0.9), 'linear'), K(6, V([g[0] + 8, g[1]], 1), 'linear')], 0.2);
    sc.layers = frameOf('intro');
    scenes.push(sc);
  }
  // 2 · Zoom to location — from space down to the place
  {
    const z = { ...ZOOM_DEFAULTS, ll: focus, place: info.place, sec: 8, end: Math.min(15, zClose + 0.6), tilt: FIRE(inc.cat) ? 35 : 25, spin: 0.5 };
    const sc = scene('Zoom to location', { ...sat0, globe: true }, [], 0.5);
    Object.assign(sc.camera, zoomCamera(focus, z.sec, z.end, z));
    sc.briefZoom = z;
    sc.layers = frameOf('zoom');
    sc.layers.push(L('point', pt(focus), z.sec * 0.8, { duration: 0.8, name: 'Incident', style: { marker: 'ring', color: FIRE(inc.cat) ? '#ff6a00' : '#ff3b30', size: 1, effect: 'pulse', label: '' } }));
    scenes.push(sc);
  }
  // 3 · Pre & post satellite
  {
    const D = 9, z = Math.max(zClose, fr[0]?.minzoom || 0);
    const sc = scene('Pre & post satellite', sat0, [K(0, V(focus, z - 0.3), 'linear'), K(D, V(focus, z + 0.15), 'linear')], 0.3);
    inWindow(sc, 'A');
    if (fr.length) {
      const per = fr.length > 1 ? 3.6 : 7;
      const ts = L('timeseries', null, 0.4, { duration: +(fr.length * per).toFixed(2), name: sat.col.startsWith('sentinel-1') ? 'Sentinel-1 radar · before / after' : 'Sentinel-2 · before / after', style: { source: 'pc', pcCol: sat.col, pcLook: sat.look, pcFrom: fr[0].date, pcTo: fr.at(-1).date, pcCloud: 100, pcBbox: sat.bbox, frames: fr, opacity: 1, label: 'none', bar: false, per, fade: 1, credit: '' } });
      ts.underFrame = true;
      sc.layers.push(ts);
    }
    sc.layers.unshift(...frameOf('A', sat?.missingAfter ? { assessment: 'No clear image after the event yet' } : {}));
    if (!fr.length) sc.layers.push(L('ttitle', null, 0.8, { duration: 0.6, name: 'No imagery note', style: { look: 'frame', kicker: 'Satellite', text: 'No clear satellite scene found yet', sub: sat?.error || 'Rebuild in a few days', position: 'bottom-right', size: 0.45, color: '#ffffff', accent: '#ffd23f', font: 'sans' } }));
    scenes.push(sc);
  }
  // 4 · Photos — slideshow with a map inset
  {
    const sc = scene('Photos', sat0, [K(0, V(focus, zClose - 1.5), 'linear'), K(8, V(focus, zClose - 1.2, 8), 'linear')], Math.max(1, items.length * 3 + 1 - 8));
    inWindow(sc, 'photos');
    sc.layers = frameOf('photos', { slides: items.map((m) => ({ media: m.id, caption: m.name || '', credit: m.credit || '' })), slideTitle: FIRE(inc.cat) ? 'From the fire zone' : 'From the ground' });
    sc.layers.push(L('point', pt(focus), 0.4, { duration: 0.8, name: 'Incident', style: { marker: 'ring', color: '#ff3b30', size: 1, effect: 'pulse', label: '' } }));
    scenes.push(sc);
  }
  // 5 · Analysis — dashboard with the map: fire hotspots / flood extent
  {
    const D = 10;
    const zA = FIRE(inc.cat) && st ? Math.max(7, Math.min(zClose, fitCamera([[st.bbox[0], st.bbox[1]], [st.bbox[2], st.bbox[3]]], REF_W, vh, 0.08).zoom)) : zClose - 0.4;
    const sc = scene('Analysis', { ...sat0, placeNames: true }, [K(0, V(focus, zA - 0.5, -8, 20), 'ease'), K(D, V(focus, zA - 0.2, 8, 35), 'linear')], 0.4);
    inWindow(sc, 'B');
    sc.layers = frameOf('B');
    if (hot.length) {
      sc.layers.push(L('firms', null, 0.8, { duration: 6, anim: 'timeline', name: `Fire hotspots · NASA FIRMS (${hot.length})`, style: { source: 'saved', points: packHotspots(hot), center: `${focus[1].toFixed(4)}, ${focus[0].toFixed(4)}`, km: 40, days: 3, size: 1, glow: true, legend: true, legendTitle: 'Active fire detections', position: 'custom', pos: { x: 0.405, y: 0.63 }, credit: 'NASA FIRMS · VIIRS' } }));
    } else {
      sc.layers.push(L('area', circle(focus, zoneKm * 1000), 0.8, { duration: 2, name: FLOOD(inc.cat) ? 'Flooded area (approximate)' : 'Affected area (approximate)', style: { stroke: '#ffffff', fill: FIRE(inc.cat) ? '#ff5a1f' : '#2f80ff', fillOpacity: 0.25, dash: 'dashed', width: 2 } }));
      if (FIRE(inc.cat)) sc.layers.push(L('ttitle', null, 1.2, { duration: 0.6, name: 'Hotspot note', style: { look: 'frame', kicker: 'NASA FIRMS', text: firmsKey() ? 'No active fires detected in the last 3 days' : 'Add a FIRMS MAP_KEY for live hotspots', sub: '', position: 'bottom-left', size: 0.4, color: '#ffffff', accent: '#ff8a2a', font: 'sans' } }));
    }
    if (inc.track?.length > 1) sc.layers.push(L('line', { type: 'LineString', coordinates: inc.track }, 1, { duration: 3, name: 'Reported positions', style: { color: '#ffd23f', width: 3, dash: 'solid', glow: true } }));
    sc.layers.push(L('point', pt(focus), 0.5, { duration: 0.8, name: 'Incident', style: { marker: 'ring', color: '#ffffff', size: 0.9, effect: 'pulse', label: '' } }));
    scenes.push(sc);
  }
  // 6 · End card
  {
    const sc = scene('End', sat0, [K(0, V(focus, zClose - 2), 'linear'), K(5, V(focus, zClose - 1.8, 6), 'linear')], 0.3);
    sc.look.grade = { preset: 'custom', brightness: 0.35, contrast: 1.1, saturation: 0.3, warmth: -0.3, fade: 0 };
    sc.layers = frameOf('end', { title: text.endText || text.headline });
    scenes.push(sc);
  }
  scenes.at(-1).transition = 'none';
  const story = { name: `${text.headline} — ${date}`, scenes, brand: { lower: false } };
  if (opts.music) story.sound = { auto: true, v2: true, music: 'tension' };
  return story;
}

// ================================================================= the dialog
export function openNewsDesk({ onCreate, aspect = 16 / 9, preset = null, auto = null } = {}) {
  document.querySelector('.nd-modal')?.remove();
  const d = document.createElement('dialog');
  d.className = 'modal wide nd-modal';
  const saved = LS.get('ma.newsdesk', { cats: Object.keys(NEWS_CATS), hours: 24 });
  d.innerHTML = `
    <div class="modal-head"><h3>📰 News desk <small class="muted">· AI</small></h3><button class="icon-x" data-close>✕</button></div>
    <div class="nd-body">
      <aside class="nd-left">
        <div class="nd-filters">
          <div class="nd-cats">${Object.entries(NEWS_CATS).map(([k, c]) => `<label class="nd-cat"><input type="checkbox" value="${k}" ${saved.cats.includes(k) ? 'checked' : ''}><span>${c.icon} ${esc(c.name)}</span></label>`).join('')}</div>
          <div class="nd-row"><select id="nd-hours"><option value="24" ${saved.hours === 24 ? 'selected' : ''}>Last 24 hours</option><option value="72" ${saved.hours === 72 ? 'selected' : ''}>Last 3 days</option><option value="168" ${saved.hours === 168 ? 'selected' : ''}>Last 7 days</option></select>
          <button class="btn sm primary" id="nd-search">Search now</button></div>
          <div class="nd-row nd-auto"><button class="btn sm" id="nd-autofire" title="Takes the biggest fire story, adds NASA FIRMS hotspots and builds the whole video">🔥 Auto fire video</button><button class="btn sm" id="nd-autoflood" title="Takes the biggest flood story and builds the whole video">🌊 Auto flood video</button></div>
          <p class="muted small" id="nd-feedinfo"></p>
        </div>
        <div class="nd-list" id="nd-list"><p class="muted nd-empty">Loading today’s feed…</p></div>
      </aside>
      <section class="nd-right" id="nd-right"><div class="nd-placeholder"><b>Pick a story</b><p class="muted">The list shows disasters and incidents from USGS, NASA EONET, GDACS and world news (GDELT), the biggest first. Choose one to build its video:</p><ol class="muted"><li>Intro</li><li>Zoom to location</li><li>Pre and post satellite images (Sentinel)</li><li>Photos</li><li>Analysis — NASA FIRMS fire hotspots for fires, flood extent for floods</li><li>End card</li></ol><p class="muted">Or press <b>🔥 Auto fire video</b> / <b>🌊 Auto flood video</b> to build the biggest story in one go.</p></div></section>
    </div>
    <div class="modal-actions nd-actions"><button class="btn sm" id="nd-ai">AI settings</button><span class="muted small" id="nd-status"></span><button class="btn primary" id="nd-make" disabled>Create the video</button></div>`;
  document.body.append(d);
  const $ = (s) => d.querySelector(s);
  const status = (t) => { $('#nd-status').textContent = t; };
  let items = [], cur = null, text = null, media = [];
  const catsChecked = () => [...d.querySelectorAll('.nd-cat input:checked')].map((i) => i.value);
  function renderList() {
    const want = new Set(catsChecked());
    const list = items.filter((x) => want.has(x.cat));
    $('#nd-list').innerHTML = list.length ? list.slice(0, 80).map((x, i) => `<button class="nd-item ${cur === x ? 'on' : ''}" data-i="${items.indexOf(x)}">
      <span class="nd-ico">${NEWS_CATS[x.cat]?.icon || '•'}</span>
      <span class="nd-txt"><b>${esc(x.title)}</b><small>${esc(NEWS_CATS[x.cat]?.name || '')} · ${esc(x.sevText || '')} · ${x.time ? esc(ago(x.time)) : ''} · ${esc(x.source)}${x.alsoIn ? ` +${x.alsoIn.length}` : ''}${x.ll ? '' : ' · place from the headline'}</small></span>
      ${i === 0 ? '<em class="nd-top">Top</em>' : ''}</button>`).join('') : '<p class="muted nd-empty">Nothing found for these filters — try more categories or a longer time window.</p>';
  }
  const partsHTML = () => {
    const P = LS.get('ma.newsparts', { fly: true, sat: true, analysis: true, media: true, end: true, commons: true, music: false, length: 60 });
    const row = (k, t, s) => `<label class="nd-part"><input type="checkbox" data-p="${k}" ${P[k] ? 'checked' : ''}><span><b>${t}</b><small>${s}</small></span></label>`;
    return `${row('fly', '1 · Fly / zoom to the incident', 'From space down to the place, news map with the spot')}${row('sat', '2 · Pre and post satellite images', 'Real Sentinel-2 scenes before and after the date (radar for floods if cloudy)')}${row('analysis', '3 · Damage &amp; analysis', 'Affected area or shaking rings, callout and a facts card')}${row('media', '4 · Photos and videos', 'Your files below, plus photos of the area from Wikimedia Commons')}${row('end', '5 · End card', 'Closing line and the sources')}
      <div class="nd-row"><label class="nd-mini">Layout <select data-p="layout"><option value="disaster" ${!P.layout || P.layout === 'disaster' ? 'selected' : ''}>Disaster brief — Intro · Zoom to location · Pre &amp; post · Photos · Analysis · End</option><option value="briefing" ${P.layout === 'briefing' ? 'selected' : ''}>Briefing — framed map, globe, before / after panels</option><option value="geobrief" ${P.layout === 'geobrief' ? 'selected' : ''}>GEO·BRIEF — header bar, intro card, breaking ticker</option><option value="classic" ${P.layout === 'classic' ? 'selected' : ''}>Classic — full-screen map, lower third and ticker</option></select></label></div>
      <div class="nd-row"><label class="nd-mini"><input type="checkbox" data-p="commons" ${P.commons ? 'checked' : ''}> Photos of the area from Wikimedia Commons</label><label class="nd-mini"><input type="checkbox" data-p="music" ${P.music ? 'checked' : ''}> Music</label></div>`;
  };
  function renderRight() {
    if (!cur) return;
    const x = cur;
    $('#nd-right').innerHTML = `
      <div class="nd-head"><span class="nd-ico big">${NEWS_CATS[x.cat]?.icon || '•'}</span><div><b>${esc(x.title)}</b><small class="muted">${esc(x.sevText || '')} · ${x.time ? esc(longDate(x.time)) : ''} · ${x.ll ? esc(fmtLatLon(x.ll)) : 'location from the headline'}</small></div></div>
      <div class="nd-links">${(x.links || []).slice(0, 6).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.source)} ↗</a>`).join('')}</div>
      <div class="nd-grid">
        <label class="wide"><span>Headline</span><input data-t="headline" value="${esc(text.headline)}"></label>
        <label class="wide"><span>Subtitle</span><input data-t="subtitle" value="${esc(text.subtitle)}"></label>
        <label><span>Place on the map</span><input data-t="place" value="${esc(text.place)}"></label>
        <label><span>End line</span><input data-t="endText" value="${esc(text.endText)}"></label>
        <label class="wide"><span>Facts — “Label | value”, one per line</span><textarea rows="4" data-t="facts">${esc((text.facts || []).join('\n'))}</textarea></label>
        <label class="wide"><span>Analysis — one point per line</span><textarea rows="3" data-t="analysis">${esc((text.analysis || []).join('\n'))}</textarea></label>
      </div>
      <div class="nd-row"><button class="btn sm" id="nd-write">✨ Write with AI</button><span class="muted small">${aiConfig().key ? 'Uses your Anthropic key' : 'Add an Anthropic API key in AI settings to use this'}</span></div>
      <div class="nd-parts">${partsHTML()}</div>
      <label class="nd-files"><span>Your photos and videos of the incident (optional)</span><input type="file" id="nd-files" multiple accept="image/*,video/*"><small class="muted">${media.length ? `${media.length} file(s) ready` : 'Only use media you have the right to publish'}</small></label>
      ${text.narration || text.youtubeTitle ? `<details class="nd-script" open><summary>Script &amp; post text</summary>${text.narration ? `<p><b>Voice-over</b><br>${esc(text.narration)}</p>` : ''}<p><b>Title</b><br>${esc(text.youtubeTitle || '')}</p><p><b>Description</b><br>${esc(text.youtubeDescription || '')}</p><p>${esc((text.hashtags || []).join(' '))}</p><button class="btn sm" id="nd-copy">Copy</button></details>` : ''}`;
    $('#nd-make').disabled = false;
  }
  function pick(i) {
    cur = items[i]; text = templateText(cur); media = [];
    renderList(); renderRight();
    status(cur.ll ? 'Ready — check the text, then create the video' : 'The place comes from the headline — check “Place on the map”');
  }
  $('#nd-list').addEventListener('click', (e) => { const b = e.target.closest('.nd-item'); if (b) pick(+b.dataset.i); });
  d.querySelector('.nd-cats').addEventListener('change', () => { LS.set('ma.newsdesk', { cats: catsChecked(), hours: +$('#nd-hours').value }); renderList(); });
  $('#nd-hours').addEventListener('change', () => LS.set('ma.newsdesk', { cats: catsChecked(), hours: +$('#nd-hours').value }));
  $('#nd-right').addEventListener('input', (e) => {
    const k = e.target.dataset.t;
    if (k && text) text[k] = k === 'facts' || k === 'analysis' ? e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) : e.target.value;
    const p = e.target.dataset.p;
    if (p) { const P = LS.get('ma.newsparts', {}); P[p] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; LS.set('ma.newsparts', P); }
  });
  $('#nd-right').addEventListener('change', async (e) => {
    if (e.target.id !== 'nd-files') return;
    for (const f of e.target.files || []) {
      const id = `media_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      await putMedia(id, f);
      media.push({ id, kind: f.type.startsWith('video') ? 'video' : 'image', name: f.name.replace(/\.\w+$/, '') });
    }
    renderRight();
  });
  $('#nd-right').addEventListener('click', async (e) => {
    if (e.target.id === 'nd-copy') { const t = [text.youtubeTitle, '', text.youtubeDescription, '', (text.hashtags || []).join(' '), '', text.narration ? `Voice-over: ${text.narration}` : ''].join('\n'); try { await navigator.clipboard.writeText(t); status('Copied'); } catch { status('Could not copy'); } }
    if (e.target.id === 'nd-write') {
      status('Writing with AI…'); e.target.disabled = true;
      try { const t = await aiWrite(cur); text = { ...text, ...t }; renderRight(); status('Written by AI — check every fact against the sources before publishing'); } catch (err) { status(err.message); }
      e.target.disabled = false;
    }
  });
  $('#nd-ai').onclick = () => {
    const cfg = aiConfig();
    const box = document.createElement('div');
    box.className = 'nd-aibox';
    box.innerHTML = `<b>AI &amp; data settings</b><p class="muted small">Optional. Your Anthropic API key is kept only in this browser and sent only to api.anthropic.com when you press “Write with AI”.</p><label><span>API key</span><input type="password" id="nd-key" value="${esc(cfg.key)}" placeholder="sk-ant-…"></label><label><span>Model</span><input id="nd-model" value="${esc(cfg.model)}"></label><label><span>NASA FIRMS MAP_KEY <small class="muted">(free: firms.modaps.eosdis.nasa.gov/api/map_key — live fire hotspots for any place)</small></span><input type="password" id="nd-firms" value="${esc(firmsKey())}" placeholder="32-character key"></label><div class="nd-row"><button class="btn sm primary" id="nd-save">Save</button><button class="btn sm" id="nd-forget">Remove key</button></div>`;
    $('#nd-right').prepend(box);
    box.querySelector('#nd-save').onclick = () => { setFirmsKey(box.querySelector('#nd-firms').value); LS.set(AI_KEY, { key: box.querySelector('#nd-key').value.trim(), model: box.querySelector('#nd-model').value.trim() || 'claude-haiku-5-5' }); box.remove(); status('AI settings saved'); if (cur) renderRight(); };
    box.querySelector('#nd-forget').onclick = () => { LS.set(AI_KEY, { key: '', model: cfg.model }); box.remove(); status('Key removed'); if (cur) renderRight(); };
  };
  async function search() {
    $('#nd-search').disabled = true;
    $('#nd-list').innerHTML = '<p class="muted nd-empty">Searching…</p>';
    try {
      const r = await fetchIncidents({ cats: catsChecked(), hours: +$('#nd-hours').value, onStatus: status });
      if (r.items.length || !items.length) items = r.items;
      const errs = Object.entries(r.errors);
      $('#nd-feedinfo').textContent = `Live search · ${new Date(r.at).toLocaleString()}${errs.length ? ` · not reachable: ${errs.map(([k]) => k).join(', ')}` : ''}`;
      status(`${r.items.length} stories found`);
    } catch (e) { status(e.message || 'Search failed'); }
    renderList();
    $('#nd-search').disabled = false;
  }
  $('#nd-search').onclick = search;
  // ---- one click: the biggest fire / flood story → the whole video
  async function firesFromFirms() {
    if (!firmsKey()) return false;
    status('Asking NASA FIRMS for today’s fires worldwide…');
    try {
      const world = await fetchFirmsWorld();
      const reverse = async (ll) => { const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=8&lat=${ll[1]}&lon=${ll[0]}&accept-language=en`); const a = (r.ok ? await r.json() : null)?.address || {}; await new Promise((res) => setTimeout(res, 1000)); return { place: a.county || a.state_district || a.state || a.city || '', country: a.country || '' }; };
      await addFireHotspots(items, world, { reverse, newStories: 3 });
      items = rankIncidents(items);
      renderList();
      return true;
    } catch (e) { status(`FIRMS: ${e.message}`); return false; }
  }
  async function autoVideo(kind) {
    const cats = kind === 'fire' ? ['wildfire'] : ['flood', 'flashflood'];
    const find = () => items.findIndex((x) => cats.includes(x.cat) && x.ll);
    for (const b of d.querySelectorAll('.nd-auto button')) b.disabled = true;
    try {
      let i = find();
      if (i < 0) {
        status(`No ${kind} story in the list — searching live…`);
        try { const r = await fetchIncidents({ cats, hours: 72, sources: { usgs: false, eonet: true, gdacs: true, gdelt: false }, onStatus: status }); items = rankIncidents([...items, ...r.items]); renderList(); } catch { /* try FIRMS below */ }
        i = find();
      }
      if (kind === 'fire' && i < 0) { await firesFromFirms(); i = find(); }
      if (i < 0) throw new Error(`No ${kind === 'fire' ? 'wildfire' : 'flood'} with a location found right now — try Search now or a longer time window`);
      pick(i);
      if (aiConfig().key) { status('Writing the text with AI…'); try { text = { ...text, ...(await aiWrite(cur)) }; renderRight(); } catch { /* the template text is fine */ } }
      const P = LS.get('ma.newsparts', {});
      const story = await buildDisasterBrief(cur, text, [], { aspect, commons: P.commons !== false, music: !!P.music }, status);
      d.close(); d.remove();
      await onCreate?.(story, { incident: cur, text });
    } catch (e) { status(e.message || 'Could not build the video'); }
    for (const b of d.querySelectorAll('.nd-auto button')) b.disabled = false;
  }
  $('#nd-autofire').onclick = () => autoVideo('fire');
  $('#nd-autoflood').onclick = () => autoVideo('flood');
  $('#nd-make').onclick = async () => {
    if (!cur) return;
    const P = LS.get('ma.newsparts', { fly: true, sat: true, analysis: true, media: true, end: true, commons: true, music: false });
    $('#nd-make').disabled = true;
    try {
      const lay = P.layout || 'disaster';
      const story = lay === 'disaster' ? await buildDisasterBrief(cur, text, media, { aspect, commons: P.commons !== false, music: !!P.music }, status) : await buildNewsStory(cur, text, P, media, { aspect, length: 60, commons: P.commons !== false, music: !!P.music, layout: lay }, status);
      d.close(); d.remove();
      await onCreate?.(story, { incident: cur, text });
    } catch (e) { status(e.message || 'Could not build the video'); $('#nd-make').disabled = false; }
  };
  d.querySelector('[data-close]').onclick = () => { d.close(); d.remove(); };
  d.addEventListener('close', () => d.remove());
  d.showModal();
  // today's feed first (from the daily GitHub Action), live search if there is none
  (async () => {
    const daily = await loadDaily();
    if (daily?.items?.length) {
      items = daily.items;
      $('#nd-feedinfo').textContent = `Daily feed · updated ${new Date(daily.at).toLocaleString()} · press Search now for the latest`;
      renderList();
      if (preset != null) { const i = items.findIndex((x) => x.id === preset); if (i >= 0) pick(i); }
    } else if (!auto) search();
    if (auto) autoVideo(auto);
  })();
}

// ================================================================= "today's story" card on the home page
export async function initDailyCard(el, onBuild) {
  if (!el) return;
  const daily = await loadDaily();
  const top = daily?.items?.[0];
  if (!top) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<span class="nd-ico big">${NEWS_CATS[top.cat]?.icon || '📰'}</span><span class="nd-txt"><small>Today’s top story · ${esc(NEWS_CATS[top.cat]?.name || '')} · ${top.time ? esc(ago(top.time)) : ''}</small><b>${esc(top.title)}</b></span><button class="btn sm primary" type="button">Build today’s video</button>`;
  el.querySelector('button').onclick = () => onBuild(top.id);
}
