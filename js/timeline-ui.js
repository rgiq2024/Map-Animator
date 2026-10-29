// Premiere-style timeline: zoom, scroll, drag/resize items, trim in/out, razor split, markers, snapping,
// keyframes and transport shortcuts. The editor passes in an `api` object with access to its state.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const fmtShort = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function createTimeline(api) {
  const scroll = $('#tl-scroll');
  const inner = $('#tl-tracks');
  let zoom = 1;
  let snapOn = true;
  let razor = false;
  let ranging = false;
  let range = null; // { a, b } in scene time
  const state = { loop: false, rate: 1 };

  const total = () => api.model().total;
  const W = () => inner.getBoundingClientRect().width || 1;
  const pct = (t) => `${(t / total()) * 100}%`;
  const timeAt = (clientX) => clamp(((clientX - inner.getBoundingClientRect().left) / W()) * total(), 0, total());

  function layout() {
    inner.style.width = `${Math.max(100, zoom * 100)}%`;
    $('#tl-zoom').value = zoom;
  }

  // ------------------------------------------------------------ render
  function render() {
    if (!api.model()) return;
    const m = api.model();
    const sc = api.scene();
    const T = m.total;
    // ruler with adaptive tick spacing
    const pxPerSec = W() / T;
    const step = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => s * pxPerSec >= 46) || 60;
    let ruler = '';
    for (let s = 0; s <= T + 1e-6; s += step) ruler += `<span style="left:${pct(s)}">${step < 1 ? s.toFixed(step < 0.5 ? 2 : 1) : Math.round(s)}s</span>`;
    ruler += (sc.markers || []).map((t, i) => `<i class="mk" data-i="${i}" style="left:${pct(t)}" title="Marker at ${t.toFixed(2)} s · drag to move · double-click to remove"></i>`).join('');
    $('#tl-ruler').innerHTML = ruler;

    // camera
    const cam = sc.camera;
    const camLabel = { fixed: ['Fixed view', 'The view in the frame'], startEnd: ['Start to end', 'Glides between two views'], follow: ['Follow the line', 'Stays with the arrow'], keyframes: ['Keyframes', `${(cam.keys || []).length} keyframe${(cam.keys || []).length === 1 ? '' : 's'}`], orbit: ['Orbit', `${cam.orbitSpeed || 12}°/s`], globe: ['Rotate globe', 'The Earth turns under the route'] }[cam.mode] || ['Camera', ''];
    const a = m.drawStart, b = Math.max(m.drawEnd, a + 0.05);
    const ca = cam.mode === 'keyframes' || cam.mode === 'orbit' ? m.intro : a;
    const cb = cam.mode === 'keyframes' || cam.mode === 'orbit' ? m.mainEnd : b;
    let camHtml = `<div class="bar" style="left:${pct(ca)};width:${pct(Math.max(0.05, cb - ca))}"><span>${camLabel[0]}</span><span>${camLabel[1]}</span></div>`;
    if (m.intro > 0) camHtml += `<div class="bar io" style="left:0;width:${pct(m.intro)}"><span>Zoom in</span></div>`;
    if (m.outro > 0) camHtml += `<div class="bar io" style="left:${pct(m.mainEnd)};width:${pct(m.outro)}"><span>Zoom out</span></div>`;
    if (cam.mode === 'keyframes') camHtml += (cam.keys || []).map((k, i) => `<i class="kf ${api.selKey?.() === i ? 'sel' : ''}" data-i="${i}" style="left:${pct(k.t)}" title="Keyframe ${i + 1} · ${k.t.toFixed(2)} s · drag to move"></i>`).join('');
    $('#tl-cam').innerHTML = camHtml;

    // line
    const pauses = m.runs.filter((r) => r.pauseAfter > 0 && r !== m.runs.at(-1)).map((r) => `<div class="pause" style="left:${pct(r.end)};width:${pct(r.pauseAfter)}"></div>`).join('');
    $('#tl-line').innerHTML = m.drawable.length
      ? `<div class="bar lineb" style="left:${pct(a)};width:${pct(b - a)}"><i class="h l" title="Drag to change when the line starts"></i><span>Line draws · ${(b - a).toFixed(1)} s</span><i class="h r" title="Drag to change how long the line takes"></i></div>${pauses}`
      : '';

    // layers, one lane each (max 6 lanes)
    const ls = (sc.layers || []).filter((L) => !L.hidden);
    const lanes = Math.max(1, Math.min(6, ls.length));
    const row = $('#tl-layers');
    row.style.height = `${lanes * 11 + 4}px`;
    $('#tl-lab-layers').style.height = `${lanes * 11 + 4}px`;
    row.innerHTML = ls.map((L, i) => {
      const d = Math.max(0.05, +L.duration || 0.05);
      const tail = L.hold > 0 ? L.hold : Math.max(0, T - L.start - d);
      return `<div class="lb ${L.id === api.selLayer() ? 'sel' : ''}" data-id="${L.id}" title="${esc(L.name)} · ${(+L.start).toFixed(2)} s" style="top:${2 + (i % lanes) * 11}px;left:${pct(L.start)};width:${pct(d)};--tail:${((tail / d) * 100).toFixed(1)}%"><i class="h r"></i></div>`;
    }).join('');

    // signs
    $('#tl-signs').innerHTML = m.signTimes.map((t, i) => `<div class="sig" data-i="${i}" style="left:${pct(t)}" title="${esc(sc.signs[i]?.text || '')} · drag to set when it appears">${i + 1}</div>`).join('');

    // audio (project time → this scene's time)
    const off = api.sceneOffset();
    $('#tl-audio').innerHTML = (api.project().audio || []).map((tr) => {
      const s0 = tr.start - off + m.trimIn;
      const len = Math.max(0.1, (tr.duration || 0) - (+tr.trimStart || 0));
      const s1 = s0 + len;
      if (s1 < 0 || s0 > T) return '';
      return `<div class="ab ${tr.kind}" data-id="${tr.id}" style="left:${pct(Math.max(0, s0))};width:${pct(Math.min(T, s1) - Math.max(0, s0))}" title="${esc(tr.name)} · drag to move"><span>${tr.kind === 'voice' ? '🎙' : '♪'} ${esc(tr.name)}</span></div>`;
    }).join('') + (api.project().sfx || []).map((c, i) => {
      const st = api.sceneTimeOf ? api.sceneTimeOf(c.t) : c.t - off + m.trimIn;
      if (st == null || st < 0 || st > T) return '';
      return `<i class="sfxm" data-i="${i}" style="left:${pct(st)}" title="${esc(api.soundName?.(c.type) || c.type)} · drag to move · double-click to remove"></i>`;
    }).join('');

    // trim shades & handles
    $('#tl-trim').innerHTML = `<div class="shade" style="left:0;width:${pct(m.trimIn)}"></div><div class="shade" style="left:${pct(m.trimOut)};width:${pct(T - m.trimOut)}"></div>
      <i class="trim-h in" style="left:${pct(m.trimIn)}" title="In point (I) · drag to trim the start"></i><i class="trim-h out" style="left:${pct(m.trimOut)}" title="Out point (O) · drag to trim the end"></i>`
      + (m.cuts || []).map((c, i) => `<div class="cut" data-i="${i}" style="left:${pct(c.a)};width:${pct(c.b - c.a)}" title="Deleted section ${c.a.toFixed(2)}–${c.b.toFixed(2)} s · the video skips it"><span>✂ ${(c.b - c.a).toFixed(1)} s</span><b data-restore="${i}" title="Restore this section">↺</b></div>`).join('')
      + (m.holds || []).map((h) => `<div class="frz" data-at="${h.at}" style="left:${pct(h.at)}" title="Freeze ${h.dur.toFixed(1)} s · click for +1 s, double-click to remove"><span>❄ ${h.dur.toFixed(1)} s</span></div>`).join('')
      + (range ? `<div class="rsel" style="left:${pct(range.a)};width:${pct(range.b - range.a)}"><span>${(range.b - range.a).toFixed(2)} s selected</span></div>` : '');
    $('#tl-delsec').disabled = !(range && range.b - range.a > 0.02);
    $('#tl-range').classList.toggle('active', ranging);
    inner.classList.toggle('ranging', ranging);
    playhead();
    $('#tl-razor').classList.toggle('active', razor);
    $('#tl-snap').classList.toggle('active', snapOn);
    $('#tl-loop').classList.toggle('active', state.loop);
    inner.classList.toggle('razor', razor);
  }

  function playhead() {
    if (!api.model()) return;
    const m = api.model();
    const t = api.getTime();
    $('#tl-head').style.left = pct(t);
    $('#tl-time').innerHTML = `${fmt(t)} <small>/ ${fmtShort(m.duration)}${m.trimIn > 0 || m.trimOut < m.total ? ' trimmed' : ''}</small>`;
    if (api.isPlaying() && zoom > 1) {
      const x = (t / m.total) * W();
      if (x < scroll.scrollLeft || x > scroll.scrollLeft + scroll.clientWidth - 30) scroll.scrollLeft = x - scroll.clientWidth * 0.2;
    }
  }

  // ------------------------------------------------------------ snapping
  function snapPoints(excl) {
    const m = api.model(), sc = api.scene();
    const pts = [0, m.total, api.getTime(), m.drawStart, m.drawEnd, m.trimIn, m.trimOut, m.intro, m.mainEnd, ...(sc.markers || [])];
    (sc.layers || []).forEach((L) => { if (L.id !== excl) pts.push(L.start, L.start + (+L.duration || 0)); });
    m.signTimes.forEach((t, i) => { if (`s${i}` !== excl) pts.push(t); });
    (sc.camera.keys || []).forEach((k, i) => { if (`k${i}` !== excl) pts.push(k.t); });
    return pts;
  }
  function snap(t, excl) {
    if (!snapOn) return t;
    const tol = (8 / W()) * total();
    let best = t, bd = tol;
    for (const p of snapPoints(excl)) { const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  // ------------------------------------------------------------ dragging
  inner.addEventListener('pointerdown', (e) => {
    if (api.busy()) return;
    if (e.button !== 0) return;
    const m = api.model(), sc = api.scene();
    const t0 = timeAt(e.clientX);
    if (razor && !e.target.closest('.trim-h')) { api.splitAt(snap(t0)); razor = false; render(); return; }
    const restore = e.target.closest('[data-restore]');
    if (restore) { removeCut(m.cuts[+restore.dataset.restore]); return; }
    const frz = e.target.closest('.frz');
    if (frz) {
      const at = +frz.dataset.at;
      const ed = sc.edits ||= { cuts: [], holds: [] };
      const h = (ed.holds ||= []).find((x) => Math.abs(x.at - at) < 1e-3);
      if (e.detail === 2) { api.pushUndo(); ed.holds = ed.holds.filter((x) => x !== h); api.commit(); }
      else api.seek(at);
      return;
    }
    if (ranging || e.shiftKey) {
      // drag out a section
      inner.setPointerCapture(e.pointerId);
      const a0 = snap(t0, 'range');
      range = { a: a0, b: a0 };
      const move = (ev) => { const t = snap(timeAt(ev.clientX), 'range'); range = { a: Math.min(a0, t), b: Math.max(a0, t) }; render(); };
      const up = () => { inner.removeEventListener('pointermove', move); inner.removeEventListener('pointerup', up); if (range.b - range.a < 0.02) range = null; render(); };
      inner.addEventListener('pointermove', move);
      inner.addEventListener('pointerup', up);
      render();
      return;
    }
    if (range) { range = null; }
    let drag = null;
    const tgt = e.target;
    const sfxm = tgt.closest('.sfxm');
    if (sfxm) {
      const c = api.project().sfx[+sfxm.dataset.i];
      if (e.detail === 2) { api.pushUndo(); api.project().sfx.splice(+sfxm.dataset.i, 1); api.commit(); api.sfxChanged?.(); return; }
      const p0 = c.t;
      inner.setPointerCapture(e.pointerId);
      const x0 = e.clientX; let mv = false;
      const move = (ev) => { if (!mv) { api.pushUndo(); mv = true; } c.t = Math.max(0, +(p0 + ((ev.clientX - x0) / W()) * total()).toFixed(2)); render(); };
      const up = () => { inner.removeEventListener('pointermove', move); inner.removeEventListener('pointerup', up); if (mv) { api.commit(); api.sfxChanged?.(); } };
      inner.addEventListener('pointermove', move); inner.addEventListener('pointerup', up);
      return;
    }
    const lb = tgt.closest('.lb'), sig = tgt.closest('.sig'), kf = tgt.closest('.kf'), mk = tgt.closest('.mk'), ab = tgt.closest('.ab'), lineb = tgt.closest('.lineb'), trimH = tgt.closest('.trim-h');
    if (trimH) {
      const which = trimH.classList.contains('in') ? 'in' : 'out';
      drag = { apply: (t) => { if (which === 'in') sc.trimIn = clamp(t, 0, m.trimOut - 0.2); else sc.trimOut = t >= m.total - 0.02 ? null : clamp(t, m.trimIn + 0.2, m.total); }, excl: 'trim' };
    } else if (mk) {
      const i = +mk.dataset.i;
      if (e.detail === 2) { api.pushUndo(); sc.markers.splice(i, 1); api.commit(); return; }
      api.seek(sc.markers[i]);
      drag = { apply: (t) => { sc.markers[i] = t; }, excl: 'mk' };
    } else if (kf) {
      const i = +kf.dataset.i;
      api.selectKey?.(i);
      drag = { apply: (t) => { sc.camera.keys[i].t = Math.max(0, t); }, excl: `k${i}`, after: () => sc.camera.keys.sort((x, y) => x.t - y.t) };
    } else if (lb) {
      const L = (sc.layers || []).find((x) => x.id === lb.dataset.id);
      api.selectLayer(L.id, true);
      const s0 = L.start, d0 = +L.duration || 0.05;
      if (tgt.closest('.h')) drag = { apply: (t) => { L.duration = Math.max(0.05, snap(t, L.id) - L.start); }, raw: true, excl: L.id, cursor: 'ew-resize' };
      else drag = { apply: (t, dt) => { L.start = Math.max(0, snap(s0 + dt, L.id)); const end = snap(L.start + d0, L.id); if (Math.abs(end - (L.start + d0)) > 1e-6) L.start = Math.max(0, end - d0); }, raw: true, excl: L.id, cursor: 'grabbing' };
    } else if (sig) {
      const i = +sig.dataset.i;
      const sg = sc.signs[i];
      const s0 = m.signTimes[i];
      drag = { apply: (t, dt) => { sg.appear = 'time'; sg.at = Math.max(0, snap(s0 + dt, `s${i}`)); }, raw: true, excl: `s${i}` };
    } else if (ab) {
      const tr = (api.project().audio || []).find((x) => x.id === ab.dataset.id);
      const s0 = tr.start;
      drag = { apply: (t, dt) => { tr.start = Math.max(0, s0 + dt); }, raw: true, project: true };
    } else if (lineb && tgt.closest('.h.r')) {
      const lineDur = m.drawEnd - m.drawStart;
      const pauses = m.runs.reduce((s, r, i) => s + (i < m.runs.length - 1 ? r.pauseAfter : 0), 0);
      const ls0 = +sc.lineSeconds || 5;
      drag = { apply: (t) => { const nd = Math.max(0.5, snap(t, 'line') - m.drawStart); sc.lineSeconds = Math.max(0.5, +((ls0 * (nd - pauses)) / Math.max(0.1, lineDur - pauses)).toFixed(2)); }, raw: true, cursor: 'ew-resize' };
    } else if (lineb) {
      const ss0 = +sc.stillStart || 0;
      drag = { apply: (t, dt) => { const ns = snap(m.drawStart + dt, 'line') - m.intro; sc.stillStart = Math.max(0, +ns.toFixed(2)); }, raw: true, cursor: 'grabbing', init: ss0 };
    }
    inner.setPointerCapture(e.pointerId);
    let moved = false;
    if (!drag) {
      // scrub
      const seek = (ev) => api.seek(snap(timeAt(ev.clientX), 'head'));
      seek(e);
      const move = (ev) => seek(ev);
      const up = () => { inner.removeEventListener('pointermove', move); inner.removeEventListener('pointerup', up); };
      inner.addEventListener('pointermove', move);
      inner.addEventListener('pointerup', up);
      return;
    }
    const x0 = e.clientX;
    if (drag.cursor) document.body.style.cursor = drag.cursor;
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - x0) < 3) return;
      if (!moved) { api.pushUndo(); moved = true; }
      const t = timeAt(ev.clientX);
      const dt = ((ev.clientX - x0) / W()) * total();
      drag.apply(drag.raw ? t : snap(t, drag.excl), dt);
      api.commit({ light: true });
    };
    const up = () => {
      inner.removeEventListener('pointermove', move);
      inner.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      if (moved) { drag.after?.(); api.commit(); }
    };
    inner.addEventListener('pointermove', move);
    inner.addEventListener('pointerup', up);
  });

  // ------------------------------------------------------------ toolbar
  const setZoom = (z, anchorT) => {
    const t = anchorT ?? api.getTime();
    const before = (t / total()) * W() - scroll.scrollLeft;
    zoom = clamp(z, 1, 40);
    layout();
    render();
    scroll.scrollLeft = (t / total()) * W() - before;
  };
  $('#tl-zoom').addEventListener('input', (e) => setZoom(+e.target.value));
  $('#tl-zoom-in').onclick = () => setZoom(zoom * 1.5);
  $('#tl-zoom-out').onclick = () => setZoom(zoom / 1.5);
  scroll.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey || e.altKey)) return;
    e.preventDefault();
    setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), timeAt(e.clientX));
  }, { passive: false });
  $('#tl-snap').onclick = () => { snapOn = !snapOn; render(); };
  $('#tl-razor').onclick = () => { razor = !razor; render(); };
  $('#tl-split').onclick = () => api.splitAt(api.getTime());
  $('#tl-range').onclick = () => { ranging = !ranging; if (!ranging) range = null; render(); };
  $('#tl-delsec').onclick = () => deleteSection();
  $('#tl-freeze').onclick = () => freeze();
  $('#tl-extend').onclick = () => extend();
  $('#tl-clear-edits').onclick = () => { const sc = api.scene(); if (!sc.edits?.cuts?.length && !sc.edits?.holds?.length) return; api.pushUndo(); sc.edits = { cuts: [], holds: [] }; range = null; api.commit(); };
  /** Delete the selected section: playback and the video jump over it. */
  function deleteSection() {
    if (!range || range.b - range.a < 0.02) return;
    const sc = api.scene(), m = api.model();
    const a = clamp(range.a, m.trimIn, m.trimOut), b = clamp(range.b, m.trimIn, m.trimOut);
    if (b - a < 0.02) return;
    const kept = m.duration - (b - a);
    if (kept < 0.2) { api.toast?.('That would delete the whole scene'); return; }
    api.pushUndo();
    const ed = sc.edits ||= { cuts: [], holds: [] };
    (ed.cuts ||= []).push({ a: +a.toFixed(3), b: +b.toFixed(3) });
    ed.holds = (ed.holds || []).filter((h) => h.at < a || h.at > b);
    range = null; ranging = false;
    api.commit();
    api.seek(Math.min(b, m.trimOut));
  }
  function removeCut(c) {
    if (!c) return;
    const sc = api.scene();
    api.pushUndo();
    sc.edits.cuts = (sc.edits.cuts || []).filter((x) => x.b <= c.a + 1e-6 || x.a >= c.b - 1e-6);
    api.commit();
  }
  /** Hold the picture at the playhead (adds 1 s each time). */
  function freeze(sec = 1) {
    const sc = api.scene(), m = api.model();
    const t = clamp(api.getTime(), m.trimIn, m.trimOut);
    if ((m.cuts || []).some((c) => t > c.a && t < c.b)) { api.toast?.('Move the playhead out of the deleted section'); return; }
    api.pushUndo();
    const ed = sc.edits ||= { cuts: [], holds: [] };
    const h = (ed.holds ||= []).find((x) => Math.abs(x.at - t) < 0.05);
    if (h) h.dur = +(h.dur + sec).toFixed(2); else ed.holds.push({ at: +t.toFixed(3), dur: sec });
    api.commit();
  }
  /** Longer scene: add time at the end (keeps the last picture). */
  function extend(sec = 1) {
    const sc = api.scene();
    api.pushUndo();
    sc.stillEnd = +((+sc.stillEnd || 0) + sec).toFixed(2);
    if (sc.trimOut != null) sc.trimOut = null;
    api.commit();
  }
  $('#tl-marker').onclick = () => toggleMarker();
  $('#tl-in').onclick = () => setIn();
  $('#tl-out').onclick = () => setOut();
  $('#tl-clear-trim').onclick = () => { api.pushUndo(); const sc = api.scene(); sc.trimIn = 0; sc.trimOut = null; api.commit(); };
  $('#tl-loop').onclick = () => { state.loop = !state.loop; render(); };
  $('#tl-rate').addEventListener('change', (e) => { state.rate = +e.target.value; api.rateChanged?.(); });
  $('#tl-start').onclick = () => api.seek(api.model().trimIn);
  $('#tl-end').onclick = () => api.seek(api.model().trimOut);
  $('#tl-prev').onclick = () => step(-1);
  $('#tl-next').onclick = () => step(1);

  function step(frames) { api.seek(clamp(api.getTime() + frames / api.fps(), 0, total())); }
  function toggleMarker() {
    api.pushUndo();
    const sc = api.scene();
    const t = +api.getTime().toFixed(3);
    sc.markers ||= [];
    const i = sc.markers.findIndex((x) => Math.abs(x - t) < 0.05);
    if (i >= 0) sc.markers.splice(i, 1); else sc.markers.push(t);
    sc.markers.sort((a, b) => a - b);
    api.commit();
  }
  function setIn() { api.pushUndo(); const sc = api.scene(), m = api.model(); sc.trimIn = clamp(api.getTime(), 0, m.trimOut - 0.2); api.commit(); }
  function setOut() { api.pushUndo(); const sc = api.scene(), m = api.model(); const t = api.getTime(); sc.trimOut = t >= m.total - 0.02 ? null : clamp(t, m.trimIn + 0.2, m.total); api.commit(); }
  function jumpMarker(dir) {
    const ms = [...(api.scene().markers || []), api.model().trimIn, api.model().trimOut].sort((a, b) => a - b);
    const t = api.getTime();
    const n = dir > 0 ? ms.find((x) => x > t + 1e-3) : [...ms].reverse().find((x) => x < t - 1e-3);
    if (n != null) api.seek(n);
  }

  /** Premiere-like keyboard shortcuts. Returns true when handled. */
  function handleKey(e) {
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'k') { api.splitAt(api.getTime()); return true; }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (k === 'ArrowLeft') { step(e.shiftKey ? -api.fps() : -1); return true; }
    if (k === 'ArrowRight') { step(e.shiftKey ? api.fps() : 1); return true; }
    if (k === 'Home') { api.seek(api.model().trimIn); return true; }
    if (k === 'End') { api.seek(api.model().trimOut); return true; }
    if (k === 'ArrowUp') { jumpMarker(-1); return true; }
    if (k === 'ArrowDown') { jumpMarker(1); return true; }
    const l = k.toLowerCase();
    if (l === 'i') { setIn(); return true; }
    if (l === 'o') { setOut(); return true; }
    if (l === 'm') { toggleMarker(); return true; }
    if (l === 'c') { razor = !razor; render(); return true; }
    if (l === 'v') { razor = false; render(); return true; }
    if (l === 'k') { api.pause(); return true; }
    if (l === 'l') { api.play(); return true; }
    if (l === 'j') { step(-api.fps()); return true; }
    if (l === 's') { snapOn = !snapOn; render(); return true; }
    if (l === 'r') { ranging = !ranging; if (!ranging) range = null; render(); return true; }
    if (l === 'f') { freeze(); return true; }
    if (l === 'e') { extend(); return true; }
    if ((k === 'Delete' || k === 'Backspace') && range) { deleteSection(); return true; }
    if (k === 'Escape' && (range || ranging)) { range = null; ranging = false; render(); return true; }
    if (k === '=' || k === '+') { setZoom(zoom * 1.5); return true; }
    if (k === '-' || k === '_') { setZoom(zoom / 1.5); return true; }
    if (k === '\\') { setZoom(1); return true; }
    return false;
  }

  new ResizeObserver(() => render()).observe(scroll);
  layout();
  return { render, playhead, handleKey, state };
}
