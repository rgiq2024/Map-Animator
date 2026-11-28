// Shows the current number beside every slider in the app, and lets you click it to type an exact value.
const SKIP = '.tl-zoomer, .vt-row, #tl-ruler, [data-noval]';
const decimals = (r) => { const st = r.getAttribute('step'); if (!st || st === 'any') return 2; const i = st.indexOf('.'); return i < 0 ? 0 : Math.min(3, st.length - i - 1); };
const fmt = (r) => { const v = +r.value; return Number.isFinite(v) ? v.toFixed(decimals(r)) : r.value; };
function attach(r) {
  if (r.__rv || r.closest(SKIP)) return;
  const nx = r.nextElementSibling; if (nx && (nx.tagName === 'OUTPUT' || nx.classList.contains('rv'))) { r.__rv = nx; return; }
  const o = document.createElement('output'); o.className = 'rv'; o.title = 'Click to type a value'; o.textContent = fmt(r);
  r.after(o); r.__rv = o;
  const sync = () => { if (!o.querySelector('input')) o.textContent = fmt(r); };
  r.addEventListener('input', sync); r.addEventListener('change', sync);
  o.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation(); if (o.querySelector('input')) return;
    const n = document.createElement('input'); n.type = 'number'; n.value = fmt(r); n.step = r.step || 'any'; n.min = r.min; n.max = r.max; n.className = 'rv-in';
    o.textContent = ''; o.append(n); n.focus(); n.select();
    let done = false;
    const commit = (ok) => {
      if (done) return; done = true;
      if (ok && n.value !== '' && Number.isFinite(+n.value)) {
        const lo = r.min === '' ? -Infinity : +r.min, hi = r.max === '' ? Infinity : +r.max;
        r.value = String(Math.max(lo, Math.min(hi, +n.value)));
        r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true }));
      }
      o.textContent = fmt(r);
    };
    n.addEventListener('keydown', (k) => { k.stopPropagation(); if (k.key === 'Enter') commit(true); else if (k.key === 'Escape') commit(false); });
    n.addEventListener('blur', () => commit(true));
    n.addEventListener('click', (k) => k.stopPropagation());
  });
}
export function startRangeValues(root = document.body) {
  const scan = (el) => { if (el.matches?.('input[type=range]')) attach(el); el.querySelectorAll?.('input[type=range]').forEach(attach); };
  scan(root);
  new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n); }).observe(root, { childList: true, subtree: true });
  // values set from code (presets, undo, loading a layer) — keep the numbers right
  setInterval(() => { document.querySelectorAll('output.rv').forEach((o) => { const r = o.previousElementSibling; if (r?.type === 'range' && !o.querySelector('input') && document.activeElement !== r) { const t = fmt(r); if (o.textContent !== t) o.textContent = t; } }); }, 500);
}
