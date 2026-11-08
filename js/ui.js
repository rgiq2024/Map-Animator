// Modern editor UX: themes, searchable / collapsible layer catalogue, popular shortcuts, quick-add palette ("/"),
// a hideable side panel and folding sections in the layer settings.
import { LAYER_KINDS } from './layers.js';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
// extra words people search for
const KEYWORDS = {
  servicearea: 'isochrone service area drive time walk time reach catchment network analysis buffer accessibility',
  odflow: 'origin destination od matrix flows migration trade network analysis spider',
  netroute: 'route directions navigation a to b car bicycle cycle walk train plane flight travel time compare network analysis',
  geofence: 'geofence alert zone breach tracking gps fleet vehicle enter exit network analysis',
  collision: 'crash accident train', city3d: 'buildings skyline urban', wxfield: 'weather temperature rain wind',
  cyclone: 'hurricane typhoon storm', wayback: 'esri historical imagery', livesat: 'goes meteosat himawari realtime',
  boundary: 'country region outline polygon admin', strike: 'explosion bomb blast', trajectory: 'missile drone ballistic',
  title: 'text intro cinematic', news: 'tv breaking logo', hud: 'overlay drone camera', chart: 'graph infographic data',
};
const norm = (t) => String(t || '').toLowerCase().replace(/&amp;/g, '&');
function btnText(b) {
  const sec = b.closest('.add-sec')?.querySelector('.sec-t')?.textContent || '';
  const d = b.dataset;
  return norm(`${b.textContent} ${d.add || ''} ${d.look || ''} ${d.type || ''} ${d.variant || ''} ${d.field || ''} ${KEYWORDS[d.add] || ''} ${sec}`);
}

// ---- light / dark theme (also used on the home page)
export function initTheme() {
  const apply = (t) => {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('ma.theme', t); } catch { /* ignore */ }
  };
  $$('.theme-toggle').forEach((b) => b.addEventListener('click', () => apply(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light')));
}
initTheme();

/** Turn the flat layer settings into folding sections (keeps what you opened or closed). */
const secOpen = new Map();
export function sectionizeEditor(box, kind) {
  const kids = [...box.children];
  if (!kids.length || box.querySelector('.le-sec')) return;
  const head = kids.shift();
  let foot = null;
  if (kids.length && kids[kids.length - 1].querySelector?.('[data-act="del"]')) { foot = kids.pop(); foot.classList.add('le-foot'); }
  const secs = [];
  const mk = (title, key) => {
    const d = document.createElement('details');
    d.className = 'le-sec';
    d.dataset.k = key;
    const remembered = secOpen.get(key);
    d.open = remembered ?? (key !== 'timing' || !['servicearea', 'odflow', 'netroute', 'geofence'].includes(kind));
    d.innerHTML = `<summary>${title}</summary><div class="le-body"></div>`;
    d.addEventListener('toggle', () => secOpen.set(key, d.open));
    secs.push(d);
    return d.querySelector('.le-body');
  };
  let body = mk('Timing &amp; animation', 'timing');
  for (const el of kids) {
    if (el.tagName === 'H5') { const t = el.textContent.trim(); body = mk(el.innerHTML, t.toLowerCase()); continue; }
    body.appendChild(el);
  }
  const ana = secs.find((d) => d.dataset.k === 'analysis');
  if (ana) { secs.splice(secs.indexOf(ana), 1); secs.unshift(ana); ana.open = secOpen.get('analysis') ?? true; }
  box.replaceChildren(head, ...secs.filter((d) => d.querySelector('.le-body').childNodes.length), ...(foot ? [foot] : []));
}

export function initModernUI({ goLayers } = {}) {
  const side = $('.step-page[data-page="layers"]');
  if (!side) return;
  // ---- side panel can be hidden for a bigger map
  const main = $('.ed-main');
  try { if (localStorage.getItem('ma.side') === 'hidden') main?.classList.add('side-hidden'); } catch { /* ignore */ }
  $('#side-toggle')?.addEventListener('click', () => {
    main.classList.toggle('side-hidden');
    try { localStorage.setItem('ma.side', main.classList.contains('side-hidden') ? 'hidden' : 'shown'); } catch { /* ignore */ }
  });
  $$('#stepper [data-step]').forEach((b) => b.addEventListener('click', () => main?.classList.remove('side-hidden')));
  // ---- popular shortcuts
  $('#popular')?.addEventListener('click', (e) => { const b = e.target.closest('[data-proxy]'); if (b) $(b.dataset.proxy)?.click(); });
  // ---- descriptions on hover
  $$('.add-grid button[data-add]', side).forEach((b) => { const d = LAYER_KINDS[b.dataset.add]?.desc; if (d && !b.title) b.title = d; });
  // ---- collapsible categories (remember which are open)
  const openState = store.get('ma.addOpen', null);
  $$('.add-sec', side).forEach((d) => {
    if (openState && d.dataset.sec in openState) d.open = !!openState[d.dataset.sec];
    d.addEventListener('toggle', () => {
      if (side.classList.contains('searching')) return;
      const st = store.get('ma.addOpen', {}) || {};
      st[d.dataset.sec] = d.open;
      store.set('ma.addOpen', st);
    });
  });
  // ---- library: a category list that opens one category at a time (search still looks everywhere)
  initLibrary(side);
  // ---- search
  const q = $('#add-search');
  const opened = new Map();
  q?.addEventListener('input', () => {
    const words = norm(q.value).trim().split(/\s+/).filter(Boolean);
    const searching = words.length > 0;
    if (searching && !side.classList.contains('searching')) $$('.add-sec', side).forEach((d) => opened.set(d, d.open));
    side.classList.toggle('searching', searching);
    let any = 0;
    $$('.add-sec', side).forEach((d) => {
      let n = 0;
      $$('.add-grid button', d).forEach((b) => {
        const ok = !searching || (!b.dataset.proxy && words.every((w) => btnText(b).includes(w)));
        b.classList.toggle('hide', !ok);
        if (ok) n++;
      });
      d.classList.toggle('hide', searching && !n);
      if (searching) d.open = n > 0;
      else if (opened.has(d)) d.open = opened.get(d);
      any += n;
    });
    if (!searching) opened.clear();
    $('#add-empty').hidden = !searching || any > 0;
  });
  q?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const b = $$('.add-sec:not(.hide) .add-grid button:not(.hide)', side)[0]; if (b) { b.click(); q.value = ''; q.dispatchEvent(new Event('input')); } }
    if (e.key === 'Escape') { q.value = ''; q.dispatchEvent(new Event('input')); q.blur(); }
  });

  // ---- command palette
  const pal = document.createElement('div');
  pal.className = 'palette';
  pal.hidden = true;
  pal.innerHTML = `<div class="pal-box" role="dialog" aria-label="Quick add">
      <div class="pal-in"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" placeholder="Add a layer or jump to a step…" autocomplete="off" /><kbd>Esc</kbd></div>
      <ul class="pal-list"></ul>
      <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> add</span><span><kbd>/</kbd> open anywhere</span></div>
    </div>`;
  document.body.appendChild(pal);
  const pin = $('input', pal), list = $('.pal-list', pal);
  let items = [], sel = 0;
  const STEPS = [['route', 'Route', '1'], ['layers', 'Layers', '2'], ['look', 'Look', '3'], ['signs', 'Signs', '4'], ['camera', 'Camera', '5'], ['export', 'Preview & export', '6']];
  function collect() {
    const out = [];
    for (const b of $$('.add-grid button', side)) {
      if (b.dataset.proxy) continue;
      const sec = b.closest('.add-sec')?.querySelector('.sec-t')?.textContent || '';
      const icon = b.querySelector('i')?.textContent || '•';
      const label = [...b.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      out.push({ icon, label, group: sec, hay: btnText(b), run: () => { goLayers?.(); b.click(); } });
    }
    for (const [k, n, i] of STEPS) out.push({ icon: i, label: `Go to ${n}`, group: 'Steps', hay: norm(`go step ${n} ${k}`), run: () => $(`#stepper [data-step="${k}"]`)?.click(), step: true });
    out.push({ icon: '✨', label: 'Auto video — build a video from a sentence', group: 'Project', hay: 'auto video automatic generate story sentence ai build create', run: () => document.querySelector('[data-autovideo]')?.click() });
    out.push({ icon: '⤓', label: 'Save the project file', group: 'Project', hay: 'save download project file', run: () => $('#save-file')?.click() });
    return out;
  }
  function render() {
    const words = norm(pin.value).trim().split(/\s+/).filter(Boolean);
    const all = collect();
    items = words.length ? all.filter((it) => words.every((w) => it.hay.includes(w))) : all.filter((it) => /network|draw|3d/i.test(it.group) || it.step).slice(0, 40);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    let last = '';
    list.innerHTML = items.length ? items.slice(0, 60).map((it, i) => {
      const head = it.group !== last ? `<li class="pal-g">${it.group}</li>` : '';
      last = it.group;
      return `${head}<li class="pal-i${i === sel ? ' sel' : ''}" data-i="${i}"><span class="pi">${it.icon}</span><span>${it.label}</span></li>`;
    }).join('') : '<li class="pal-none">No matches</li>';
    list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  }
  const open = () => { pal.hidden = false; pin.value = ''; sel = 0; render(); requestAnimationFrame(() => pin.focus()); };
  const close = () => { pal.hidden = true; };
  const run = (i) => { const it = items[i]; close(); it?.run(); };
  pin.addEventListener('input', () => { sel = 0; render(); });
  pin.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  list.addEventListener('mousemove', (e) => { const li = e.target.closest('.pal-i'); if (li && +li.dataset.i !== sel) { sel = +li.dataset.i; $$('.pal-i', list).forEach((x) => x.classList.toggle('sel', +x.dataset.i === sel)); } });
  list.addEventListener('click', (e) => { const li = e.target.closest('.pal-i'); if (li) run(+li.dataset.i); });
  pal.addEventListener('mousedown', (e) => { if (e.target === pal) close(); });
  document.addEventListener('keydown', (e) => {
    if ($('#editor')?.hidden) return;
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName) && !['range', 'checkbox'].includes(document.activeElement.type);
    const combo = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p';
    if ((e.key === '/' && !typing) || combo) { e.preventDefault(); e.stopPropagation(); if (pal.hidden) open(); else close(); }
  }, true);
  $('.lp-search kbd')?.addEventListener('click', open);
  window.mapAnimatorPalette = { open, close };
}


// ================================================================= layer library
const LIB_GROUPS = [
  ['Start here', ['draw-or-place', 'typography', 'story-and-text', 'shapes']],
  ['Maps & data', ['cartography', 'carto', 'network-analysis', 'smart-maps', 'weather', 'globes', 'transit']],
  ['Imagery & 3D', ['imagery', '3d-models-and-city', 'digital-twin', 'holo', 'nature']],
  ['Motion graphics', ['titles-and-tv-news', 'effects-and-video', 'cinematic-hud-pack', 'showcase-elements', 'infographics-and-hud']],
  ['Specialist', ['people-and-crowds', 'hazard-zones', 'space-and-defence', 'military-and-intel-hud']],
];
// simple line icons (24 × 24, stroke)
const LIB_ICONS = {
  'draw-or-place': '<path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/><path d="M14 6l3 3"/>',
  typography: '<path d="M4 18L9 6l5 12"/><path d="M6 14h6"/><path d="M15 18c0-2 1-3 3-3s3 1 3 3v-1c0 2-1 2-3 2"/>',
  'story-and-text': '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  shapes: '<rect x="3" y="12" width="8" height="8" rx="1"/><circle cx="17" cy="7" r="4"/><path d="M14 20l3-6 3 6z"/>',
  cartography: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  carto: '<circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11z"/>',
  'network-analysis': '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6h10M6 8l5 8M18 8l-5 8"/>',
  'smart-maps': '<path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2 8 12.7 4 8.8 9.5 8z"/>',
  weather: '<path d="M7 18a4 4 0 010-8 5 5 0 019.6-1.5A3.5 3.5 0 1117 18z"/>',
  globes: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  transit: '<rect x="5" y="3" width="14" height="13" rx="3"/><path d="M5 10h14M8 20l2-4M16 20l-2-4"/><circle cx="9" cy="13" r=".5"/><circle cx="15" cy="13" r=".5"/>',
  imagery: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 8"/>',
  '3d-models-and-city': '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  'digital-twin': '<rect x="3" y="10" width="6" height="11"/><rect x="10" y="4" width="5" height="17"/><rect x="16" y="13" width="5" height="8"/>',
  holo: '<path d="M12 3v18M5 7l7-4 7 4M5 7v10l7 4 7-4V7"/><path d="M5 12l7 4 7-4" opacity=".6"/>',
  nature: '<path d="M12 21v-6"/><path d="M12 15c-5 0-7-4-7-8 4 0 7 2 7 6 0-4 3-6 7-6 0 4-2 8-7 8z"/>',
  'titles-and-tv-news': '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M7 9h7M7 12h4"/>',
  'effects-and-video': '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  'cinematic-hud-pack': '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><circle cx="12" cy="12" r="3"/>',
  'showcase-elements': '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
  'infographics-and-hud': '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  'people-and-crowds': '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 3-6 6-6s6 2 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14c3 0 5 2 5 5"/>',
  'hazard-zones': '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  'space-and-defence': '<path d="M5 19l4-4M14 4c4 0 6 2 6 6l-7 7-6-6z"/><circle cx="14.5" cy="9.5" r="1.5"/>',
  'military-and-intel-hud': '<circle cx="12" cy="12" r="8"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
};
const LIB_BLURB = {
  'draw-or-place': 'Boundaries, areas, lines, points, freehand', typography: 'Callouts, titles, text, scan windows', 'story-and-text': 'Text cards, photo stacks, match cuts',
  shapes: 'Arrows, frames, shapes', cartography: 'Thematic maps, graphs, map layout', carto: 'Spotlights, insets, documentary map styles', 'network-analysis': 'Routes, drive-time areas, flows',
  weather: 'TV weather graphics, radar, satellite', globes: 'Spinning globes, tours, arcs', transit: 'Metro, rail and bus lines', imagery: 'Satellite & historical imagery',
  'titles-and-tv-news': 'Film titles, lower thirds, tickers', 'effects-and-video': 'Video, film effects, transitions',
};
const svgIcon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LIB_ICONS[k] || '<circle cx="12" cy="12" r="8"/>'}</svg>`;
const RECENT_KEY = 'ma.addRecent';

function initLibrary(side) {
  const secs = $$('.add-sec', side);
  if (!secs.length || side.querySelector('.alib-home')) return;
  side.classList.add('lib-mode');
  const byKey = new Map(secs.map((d) => [d.dataset.sec, d]));
  const titleOf = (d) => d.querySelector('.sec-t')?.textContent || d.dataset.sec;
  const countOf = (d) => $$('.add-grid button', d).length;
  // header inside each category (back + title)
  for (const d of secs) {
    d.open = true;
    const head = document.createElement('div');
    head.className = 'alib-head';
    head.innerHTML = `<button type="button" class="alib-back" aria-label="All categories"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button><span class="alib-ico">${svgIcon(d.dataset.sec)}</span><b>${titleOf(d)}</b><em>${countOf(d)}</em>`;
    d.querySelector('summary').after(head);
    head.querySelector('.alib-back').addEventListener('click', () => show(null));
    d.querySelector('summary').addEventListener('click', (e) => e.preventDefault());
  }
  // home: grouped category list
  const home = document.createElement('div');
  home.className = 'alib-home';
  const grouped = new Set();
  let html = '<div class="alib-recent" hidden><div class="alib-glabel">Recently added</div><div class="alib-chips"></div></div>';
  for (const [g, keys] of LIB_GROUPS) {
    const ds = keys.map((k) => byKey.get(k)).filter(Boolean);
    if (!ds.length) continue;
    ds.forEach((d) => grouped.add(d));
    html += `<div class="alib-glabel">${g}</div><div class="alib-list">${ds.map(row).join('')}</div>`;
  }
  const rest = secs.filter((d) => !grouped.has(d));
  if (rest.length) html += `<div class="alib-glabel">More</div><div class="alib-list">${rest.map(row).join('')}</div>`;
  home.innerHTML = html;
  function row(d) {
    const k = d.dataset.sec;
    return `<button type="button" class="alib-row" data-sec="${k}"><span class="alib-ico">${svgIcon(k)}</span><span class="alib-txt"><b>${titleOf(d)}</b>${LIB_BLURB[k] ? `<small>${LIB_BLURB[k]}</small>` : ''}</span><em>${countOf(d)}</em><svg class="alib-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg></button>`;
  }
  secs[0].before(home);
  home.addEventListener('click', (e) => {
    const r = e.target.closest('.alib-row');
    if (r) { show(r.dataset.sec); return; }
    const c = e.target.closest('[data-recent]');
    if (c) { const [k, i] = c.dataset.recent.split(':'); const b = $$('.add-grid button', byKey.get(k))[+i]; b?.click(); }
  });
  const pop = $('#popular');
  function show(key) {
    secs.forEach((d) => d.classList.toggle('cur', d.dataset.sec === key));
    side.classList.toggle('alib-in', !!key);
    home.hidden = !!key;
    if (pop) pop.hidden = !!key;
    store.set('ma.addCat', key || '');
    side.scrollTop = 0;
    if (!key) renderRecent();
  }
  // recently added
  function renderRecent() {
    const rec = store.get(RECENT_KEY, []) || [];
    const box = home.querySelector('.alib-recent');
    const chips = rec.map((r) => { const b = $$('.add-grid button', byKey.get(r.k) || document.createElement('div'))[r.i]; if (!b) return ''; const label = [...b.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim(); return `<button type="button" data-recent="${r.k}:${r.i}" title="${label.replace(/"/g, '&quot;')}">${label}</button>`; }).filter(Boolean);
    box.hidden = !chips.length;
    box.querySelector('.alib-chips').innerHTML = chips.join('');
  }
  side.addEventListener('click', (e) => {
    const b = e.target.closest('.add-grid button');
    if (!b || b.dataset.proxy) return;
    const d = b.closest('.add-sec'); if (!d) return;
    const i = $$('.add-grid button', d).indexOf(b);
    const rec = (store.get(RECENT_KEY, []) || []).filter((r) => !(r.k === d.dataset.sec && r.i === i));
    rec.unshift({ k: d.dataset.sec, i });
    store.set(RECENT_KEY, rec.slice(0, 6));
  }, true);
  const last = store.get('ma.addCat', '');
  show(last && byKey.has(last) ? last : null);
  renderRecent();
}
