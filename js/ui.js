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
        const ok = !searching || words.every((w) => btnText(b).includes(w));
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
