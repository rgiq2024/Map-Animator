// Router between the home page (#/) and the editor (#/p/<project id>).
import { createEditor, toast } from './editor.js';
import { createHome } from './home.js';
import { getProject, newProject, saveProject } from './store.js';
import { openAutoVideo } from './autostory.js';

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
    document.title = `${p.name} — GIS One Map Animator`;
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

// Auto video: build a whole project from one sentence
function autoVideo() {
  openAutoVideo({
    aspect: 16 / 9,
    onCreate: async (story) => {
      const p = newProject(story.name);
      p.scenes = story.scenes;
      await saveProject(p);
      pendingOpts = { step: 'export' };
      location.hash = `#/p/${p.id}`;
      setTimeout(() => toast('Your video is ready — press ▶ to preview, then Render video. Every scene and layer can be edited.', 6000), 1200);
    },
  });
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-autovideo]')) autoVideo(); });

window.mapAnimator = { editor, autoVideo };
