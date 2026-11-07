// Login gate and user management.
// Local mode: users + salted PBKDF2-SHA256 password hashes in auth/users.json (static file on the site).
// Firebase mode: Firebase Authentication (accounts checked on Google's servers).
// Note: on a static site the local mode keeps casual visitors out; it cannot stop someone who reads the code.
import { AUTH } from './auth-config.js';

const SKEY = 'ma.session';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pbkdf2(password, saltB64, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: iter }, key, 256);
  return b64(bits);
}
async function makeHash(password) {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  const iter = 150000;
  return { salt, iter, hash: await pbkdf2(password, salt, iter) };
}
let usersDoc = null;
async function loadUsers() {
  const r = await fetch(`auth/users.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('The user list (auth/users.json) could not be loaded');
  usersDoc = await r.json();
  usersDoc.users ||= [];
  return usersDoc;
}
const readSession = () => { try { return JSON.parse(localStorage.getItem(SKEY) || sessionStorage.getItem(SKEY) || 'null'); } catch { return null; } };
const writeSession = (s, remember) => { try { (remember ? localStorage : sessionStorage).setItem(SKEY, JSON.stringify(s)); } catch { /* private mode */ } };
const clearSession = () => { try { localStorage.removeItem(SKEY); sessionStorage.removeItem(SKEY); } catch { /* ignore */ } };

// ---------------------------------------------------------------- Firebase
let fb = null;
async function firebase() {
  if (fb) return fb;
  const load = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load Firebase')); document.head.append(s); });
  await load('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  await load('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js');
  window.firebase.initializeApp(AUTH.firebase);
  fb = window.firebase.auth();
  return fb;
}
const fbMode = () => AUTH.mode === 'firebase' && AUTH.firebase;
const allowedEmail = (e) => !AUTH.allowedEmails?.length || AUTH.allowedEmails.map((x) => x.toLowerCase()).includes(String(e).toLowerCase());

// ---------------------------------------------------------------- current user
let current = null;
export const currentUser = () => current;

async function verifyLocal(u, password) {
  const doc = await loadUsers();
  const rec = doc.users.find((x) => x.u.toLowerCase() === String(u).trim().toLowerCase());
  if (!rec) return null;
  const h = await pbkdf2(password, rec.salt, rec.iter || 150000);
  return h === rec.hash ? rec : null;
}
async function restore() {
  if (fbMode()) {
    const auth = await firebase();
    return new Promise((res) => {
      const off = auth.onAuthStateChanged((u) => {
        off();
        if (u && allowedEmail(u.email)) res({ u: u.email, name: u.displayName || u.email, role: (AUTH.adminEmails || []).map((x) => x.toLowerCase()).includes(u.email.toLowerCase()) ? 'admin' : 'user' });
        else res(null);
      });
    });
  }
  const s = readSession();
  if (!s || !s.u || Date.now() > s.exp) { clearSession(); return null; }
  try {
    const doc = await loadUsers();
    const rec = doc.users.find((x) => x.u === s.u);
    // the session stays valid only while the account exists and its password has not changed
    if (!rec || rec.hash.slice(0, 12) !== s.k) { clearSession(); return null; }
    return { u: rec.u, name: rec.name || rec.u, role: rec.role || 'user' };
  } catch { return null; }
}

// ---------------------------------------------------------------- UI
function css() {
  const st = document.createElement('style');
  st.textContent = `
  html.auth-locked body > *:not(#auth-gate):not(script):not(style) { visibility: hidden !important; }
  #auth-gate { position: fixed; inset: 0; z-index: 100000; display: grid; place-items: center; background: radial-gradient(1200px 600px at 70% 10%, rgba(255,107,53,.18), transparent 60%), radial-gradient(900px 500px at 10% 90%, rgba(124,77,255,.18), transparent 60%), #0c0f14; color: #e8ecf2; font-family: Inter, system-ui, sans-serif; }
  #auth-gate form { width: min(380px, 92vw); padding: 30px 28px 24px; border-radius: 18px; background: rgba(22,26,34,.92); border: 1px solid rgba(255,255,255,.08); box-shadow: 0 30px 80px rgba(0,0,0,.5); }
  #auth-gate .lg-logo { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
  #auth-gate .lg-logo img { width: 38px; height: 38px; }
  #auth-gate h1 { font-size: 19px; margin: 0; } #auth-gate h1 small { display: block; font-size: 12px; font-weight: 500; color: #9aa4b2; margin-top: 2px; }
  #auth-gate label { display: block; font-size: 12px; font-weight: 600; color: #aab4c2; margin: 12px 0 5px; }
  #auth-gate input[type=text], #auth-gate input[type=password], #auth-gate input[type=email] { width: 100%; box-sizing: border-box; padding: 11px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.12); background: #0f131a; color: #fff; font: inherit; font-size: 14px; }
  #auth-gate input:focus { outline: 2px solid rgba(255,107,53,.6); border-color: transparent; }
  #auth-gate .lg-row { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; font-size: 12.5px; color: #aab4c2; }
  #auth-gate button { width: 100%; margin-top: 18px; padding: 12px; border: 0; border-radius: 11px; font: inherit; font-weight: 700; font-size: 14.5px; color: #fff; background: linear-gradient(135deg, #ff7a3d, #ff4f6d); cursor: pointer; }
  #auth-gate button:disabled { opacity: .6; cursor: wait; }
  #auth-gate .lg-err { min-height: 18px; margin-top: 10px; font-size: 12.5px; color: #ff6b6b; }
  #auth-gate .lg-foot { margin-top: 14px; font-size: 11.5px; color: #788392; text-align: center; }
  .auth-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ink-2, #aab4c2); }
  .auth-chip b { color: var(--ink, #fff); font-weight: 600; }
  .um-modal { width: min(720px, 96vw); }
  .um-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 8px 0 14px; }
  .um-table th, .um-table td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--line-2, rgba(255,255,255,.08)); }
  .um-table td .btn { margin-right: 4px; }
  .um-add { display: grid; grid-template-columns: 1fr 1fr 110px 1fr auto; gap: 8px; align-items: end; }
  .um-add label { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; color: var(--ink-2, #aab4c2); font-weight: 600; }
  .um-add input, .um-add select { padding: 7px 8px; border-radius: 8px; border: 1px solid var(--line-2, #333); background: var(--panel-2, #111); color: var(--ink, #fff); font: inherit; font-size: 13px; }
  .um-note { font-size: 12px; color: var(--ink-2, #aab4c2); line-height: 1.5; background: rgba(255,170,60,.08); border: 1px solid rgba(255,170,60,.25); padding: 10px 12px; border-radius: 10px; }
  .um-dirty { color: #ffb347; font-weight: 700; }
  @media (max-width: 640px) { .um-add { grid-template-columns: 1fr 1fr; } }`;
  document.head.append(st);
}
function gate() {
  const d = document.createElement('div');
  d.id = 'auth-gate';
  d.innerHTML = `
    <form autocomplete="on">
      <div class="lg-logo"><img src="assets/logo-transparent.svg" alt="" /><h1>GIS One Map Animator<small>Sign in to continue</small></h1></div>
      <label for="lg-user">${fbMode() ? 'E-mail' : 'Username'}</label>
      <input id="lg-user" name="username" type="${fbMode() ? 'email' : 'text'}" autocomplete="username" required autofocus />
      <label for="lg-pass">Password</label>
      <input id="lg-pass" name="password" type="password" autocomplete="current-password" required />
      <div class="lg-row"><label style="display:flex;gap:6px;align-items:center;margin:0;font-weight:500"><input type="checkbox" id="lg-remember" checked /> Keep me signed in</label></div>
      <button type="submit" id="lg-go">Sign in</button>
      <div class="lg-err" id="lg-err"></div>
      <div class="lg-foot">Access is limited to authorised users. Ask your administrator for an account.</div>
    </form>`;
  document.body.prepend(d);
  return d;
}
function unlock(user) {
  current = user;
  document.getElementById('auth-gate')?.remove();
  document.documentElement.classList.remove('auth-locked');
  addHeaderControls();
  window.dispatchEvent(new CustomEvent('auth:ready', { detail: user }));
}
export async function signOut() {
  clearSession();
  if (fbMode()) { try { await (await firebase()).signOut(); } catch { /* ignore */ } }
  location.reload();
}
function addHeaderControls() {
  const make = () => {
    const w = document.createElement('span');
    w.className = 'auth-chip';
    w.innerHTML = `<button class="auth-me" type="button" title="Signed in as ${esc(current.name)}" aria-haspopup="true">👤 <b>${esc(current.name)}</b> ▾</button><span class="auth-menu" role="menu"><span class="auth-who">${esc(current.name)}</span>${current.role === 'admin' ? '<button class="link" data-auth="users" type="button">Users</button>' : ''}<button class="link" data-auth="password" type="button">Password</button><button class="link" data-auth="out" type="button">Sign out</button></span>`;
    return w;
  };
  for (const host of document.querySelectorAll('.site-header nav, .ed-top-right')) if (!host.querySelector('.auth-chip')) host.prepend(make());
}
document.addEventListener('click', (e) => {
  const me = e.target.closest('.auth-me');
  for (const c of document.querySelectorAll('.auth-chip.open')) if (!me || !c.contains(me)) c.classList.remove('open');
  if (me) { me.closest('.auth-chip').classList.toggle('open'); return; }
  const b = e.target.closest('[data-auth]');
  if (!b) return;
  const a = b.dataset.auth;
  if (a === 'out') signOut();
  if (a === 'users') openUsers();
  if (a === 'password') openPassword();
});

// ---------------------------------------------------------------- user management (admin)
function downloadUsers(doc) {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'users.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const NOTE_LOCAL = 'Changes are saved in a new <b>users.json</b> file. Press <b>Download users.json</b>, then replace <code>auth/users.json</code> in the GitHub repository (Upload files → commit). New passwords work for everyone once the site has updated (about a minute).';
async function openUsers() {
  if (fbMode()) {
    alert('Users are managed in the Firebase console: Authentication → Users → Add user. To limit who can sign in, list their e-mails in js/auth-config.js (allowedEmails).');
    return;
  }
  const doc = JSON.parse(JSON.stringify(await loadUsers()));
  let dirty = false;
  const d = document.createElement('dialog');
  d.className = 'modal wide um-modal';
  const render = () => {
    d.innerHTML = `
      <div class="modal-head"><h3>Users ${dirty ? '<span class="um-dirty">· not saved yet</span>' : ''}</h3><button class="icon-x" data-x>✕</button></div>
      <div style="padding:0 22px 6px">
        <table class="um-table"><thead><tr><th>Username</th><th>Name</th><th>Role</th><th></th></tr></thead><tbody>
        ${doc.users.map((u, i) => `<tr><td><b>${esc(u.u)}</b></td><td>${esc(u.name || '')}</td><td>${u.role === 'admin' ? 'Administrator' : 'User'}</td><td style="text-align:right"><button class="btn sm" data-reset="${i}">Reset password</button><button class="btn sm" data-role="${i}">${u.role === 'admin' ? 'Make user' : 'Make admin'}</button><button class="btn sm" data-del="${i}" ${u.u === current.u ? 'disabled title="You cannot remove yourself"' : ''}>Remove</button></td></tr>`).join('')}
        </tbody></table>
        <h4 style="margin:6px 0">Add a user</h4>
        <form class="um-add" id="um-form">
          <label>Username<input name="u" required pattern="[A-Za-z0-9._@-]{3,40}" title="3–40 letters, numbers, . _ @ -" /></label>
          <label>Full name<input name="name" /></label>
          <label>Role<select name="role"><option value="user">User</option><option value="admin">Administrator</option></select></label>
          <label>Password (min. 8)<input name="pw" type="text" minlength="8" required /></label>
          <button class="btn primary sm" type="submit">Add</button>
        </form>
        <p class="um-note" style="margin-top:14px">${NOTE_LOCAL}</p>
      </div>
      <div class="modal-actions"><button class="btn" data-gen>Suggest a strong password</button><button class="btn primary" data-dl ${dirty ? '' : 'disabled'}>Download users.json</button></div>`;
  };
  const strong = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; const r = crypto.getRandomValues(new Uint32Array(14)); return [...r].map((x) => A[x % A.length]).join(''); };
  d.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-x]')) { if (!dirty || confirm('Close without downloading the changes?')) { d.close(); d.remove(); } return; }
    if (t.closest('[data-dl]')) { downloadUsers(doc); dirty = false; render(); return; }
    if (t.closest('[data-gen]')) { const f = d.querySelector('#um-form [name=pw]'); if (f) { f.value = strong(); f.focus(); f.select(); } return; }
    const del = t.closest('[data-del]'); if (del) { const i = +del.dataset.del; if (confirm(`Remove ${doc.users[i].u}?`)) { doc.users.splice(i, 1); dirty = true; render(); } return; }
    const role = t.closest('[data-role]'); if (role) { const u = doc.users[+role.dataset.role]; if (u.u === current.u && u.role === 'admin' && doc.users.filter((x) => x.role === 'admin').length < 2) { alert('Keep at least one administrator.'); return; } u.role = u.role === 'admin' ? 'user' : 'admin'; dirty = true; render(); return; }
    const rs = t.closest('[data-reset]'); if (rs) { const u = doc.users[+rs.dataset.reset]; const pw = prompt(`New password for ${u.u} (min. 8 characters):`, strong()); if (pw && pw.length >= 8) { Object.assign(u, await makeHash(pw)); dirty = true; render(); alert(`New password for ${u.u}:\n\n${pw}\n\nCopy it now — it is only stored as a hash.`); } return; }
  });
  d.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const u = String(f.get('u')).trim();
    if (doc.users.some((x) => x.u.toLowerCase() === u.toLowerCase())) { alert('That username already exists.'); return; }
    const pw = String(f.get('pw'));
    doc.users.push({ u, name: String(f.get('name') || '').trim() || u, role: f.get('role') === 'admin' ? 'admin' : 'user', ...(await makeHash(pw)) });
    dirty = true; render();
    alert(`User ${u} added.\nPassword: ${pw}\n\nCopy it now, then Download users.json and upload it to the repository.`);
  });
  d.addEventListener('cancel', (e) => { if (dirty && !confirm('Close without downloading the changes?')) e.preventDefault(); });
  render();
  document.body.append(d);
  d.showModal();
}
async function openPassword() {
  if (fbMode()) {
    const auth = await firebase();
    try { await auth.sendPasswordResetEmail(auth.currentUser.email); alert('A password-reset e-mail has been sent to you.'); } catch (err) { alert(err.message); }
    return;
  }
  const old = prompt('Current password:');
  if (!old) return;
  if (!(await verifyLocal(current.u, old))) { alert('That is not your current password.'); return; }
  const pw = prompt('New password (min. 8 characters):');
  if (!pw || pw.length < 8) { alert('The new password must have at least 8 characters.'); return; }
  if (pw !== prompt('Type the new password again:')) { alert('The passwords do not match.'); return; }
  const doc = JSON.parse(JSON.stringify(await loadUsers()));
  Object.assign(doc.users.find((x) => x.u === current.u), await makeHash(pw));
  downloadUsers(doc);
  alert('Your new password is in the downloaded users.json. Replace auth/users.json in the GitHub repository with it; until then your old password keeps working.');
}

// ---------------------------------------------------------------- start
async function start() {
  css();
  let user = null, problem = '';
  try { user = await restore(); } catch (e) { problem = fbMode() ? 'Could not reach the sign-in service (Firebase). Check your internet connection and reload.' : e.message || 'Could not check the login'; }
  if (user) { unlock(user); return; }
  const g = gate();
  if (problem) $('#lg-err', g).textContent = problem;
  const form = $('form', g);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#lg-go', g), err = $('#lg-err', g);
    btn.disabled = true; err.textContent = '';
    const name = $('#lg-user', g).value.trim(), pw = $('#lg-pass', g).value, remember = $('#lg-remember', g).checked;
    try {
      if (fbMode()) {
        const auth = await firebase();
        await auth.setPersistence(remember ? window.firebase.auth.Auth.Persistence.LOCAL : window.firebase.auth.Auth.Persistence.SESSION);
        const cred = await auth.signInWithEmailAndPassword(name, pw);
        if (!allowedEmail(cred.user.email)) { await auth.signOut(); throw new Error('This account is not allowed to use the app'); }
        unlock({ u: cred.user.email, name: cred.user.displayName || cred.user.email, role: (AUTH.adminEmails || []).map((x) => x.toLowerCase()).includes(cred.user.email.toLowerCase()) ? 'admin' : 'user' });
        return;
      }
      // slow down guessing a little
      await new Promise((r) => setTimeout(r, 400));
      const rec = await verifyLocal(name, pw);
      if (!rec) throw new Error('Wrong username or password');
      writeSession({ u: rec.u, k: rec.hash.slice(0, 12), exp: Date.now() + (remember ? (AUTH.sessionDays || 14) : 1) * 86400000 }, remember);
      unlock({ u: rec.u, name: rec.name || rec.u, role: rec.role || 'user' });
    } catch (ex) {
      err.textContent = /auth\/(invalid|wrong|user-not-found)/.test(ex.code || '') ? 'Wrong e-mail or password' : ex.message || 'Could not sign in';
      btn.disabled = false;
      $('#lg-pass', g).select();
    }
  });
}
start();
