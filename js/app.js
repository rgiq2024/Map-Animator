// Router between the home page (#/) and the editor (#/p/<project id>).
import { createEditor, toast } from './editor.js';
import { createHome } from './home.js';
import { getProject } from './store.js';

const $ = (s) => document.querySelector(s);
let pendingOpts = {};

const editor = createEditor();
const home = createHome({
  open(id, opts = {}) {
    pendingOpts = opts;
    location.hash = `#/p/${id}`;
  },
});

async function route() {
  const m = location.hash.match(/^#\/p\/([\w-]+)/);
  if (m) {
    const p = await getProject(m[1]);
    if (!p) { toast('That project is not in this browser'); location.hash = '#/'; return; }
    home.hide();
    $('#editor').hidden = false;
    document.title = `${p.name} — Map Animator`;
    const opts = pendingOpts;
    pendingOpts = {};
    await editor.open(p, opts);
  } else {
    if (!$('#editor').hidden) editor.close();
    $('#editor').hidden = true;
    home.show();
  }
}
window.addEventListener('hashchange', route);
route();

// Generic modal open/close
document.addEventListener('click', (e) => {
  const opener = e.target.closest('[data-modal]');
  if (opener) document.getElementById(opener.dataset.modal)?.showModal();
  if (e.target.closest('[data-close]')) e.target.closest('dialog')?.close();
  if (e.target.tagName === 'DIALOG' && e.target.id !== 'render-modal') e.target.close();
});

window.mapAnimator = { editor };
