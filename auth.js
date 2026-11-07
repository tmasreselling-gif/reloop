/* RELOOP – optionale Anmeldung mit Benutzername & Passwort (App-Sperre für dieses Gerät) */
'use strict';

const authRef = () => S.db.doc(`data/users/${S.uid}/auth`);
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const randB64 = (n) => b64(crypto.getRandomValues(new Uint8Array(n)));
const AUTH_ITER = 210000;

async function pbkdf2(secret, saltB64, iter = AUTH_ITER) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(saltB64), iterations: iter, hash: 'SHA-256' }, key, 256);
  return b64(new Uint8Array(bits));
}
function safeEq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
function newRecoveryCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint8Array(16));
  return [...r].map((x) => abc[x % abc.length]).join('').match(/.{4}/g).join('-');
}
const sessKey = () => 'rl-unlock-' + S.uid;
function markUnlocked() { try { sessionStorage.setItem(sessKey(), S.auth.hash.slice(0, 16)); } catch (e) { /* ohne Sitzungsspeicher: Anmeldung bei jedem Laden */ } }
function isUnlocked() { try { return !!S.auth && sessionStorage.getItem(sessKey()) === S.auth.hash.slice(0, 16); } catch (e) { return false; } }

async function authGate() {
  try { const snap = await authRef().get(); S.auth = snap.exists ? clone(snap.data()) : null; } catch (e) { S.auth = null; }
  if (!S.auth || isUnlocked()) return;
  await new Promise((resolve) => { S.unlockResolve = resolve; showLogin(); });
  S.blocker = null;
}

let failCount = 0, lockedUntil = 0;
function showLogin(msg = '') {
  S.blocker = `<div class="blocker card" style="text-align:left;max-width:420px">
    <div class="row" style="gap:12px;margin-bottom:14px"><svg width="42" height="42" viewBox="0 0 34 34" aria-hidden="true"><defs><linearGradient id="lg-login" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent-2)"/></linearGradient></defs><rect width="34" height="34" rx="10" fill="url(#lg-login)"/><path d="M12 25V9h5.6a5 5 0 0 1 0 10H12" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 19l6 6" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/><path d="M19.2 25.4h4.2v-4.2" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div><h2 style="margin:0">Anmelden</h2><div class="small muted">RELOOP Reselling-Studio</div></div></div>
    <form id="login-form" class="stack">
      <label class="f"><span>Benutzername</span><input class="in" id="lg-user" autocomplete="username" required></label>
      <label class="f"><span>Passwort</span><input class="in" id="lg-pw" type="password" autocomplete="current-password" required></label>
      <div id="lg-msg" class="small" style="color:var(--bad);min-height:18px">${esc(msg)}</div>
      <button class="btn primary lg" type="submit" id="lg-btn">Anmelden</button>
      <button class="btn ghost sm" type="button" id="lg-forgot">Passwort vergessen?</button>
    </form></div>`;
  render();
  const f = $('#login-form');
  setTimeout(() => $('#lg-user') && $('#lg-user').focus(), 30);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const m = $('#lg-msg'), btn = $('#lg-btn');
    if (Date.now() < lockedUntil) { m.textContent = `Zu viele Fehlversuche – bitte ${Math.ceil((lockedUntil - Date.now()) / 1000)} s warten.`; return; }
    btn.disabled = true; m.textContent = '';
    try {
      const user = $('#lg-user').value.trim().toLowerCase();
      const h = await pbkdf2($('#lg-pw').value, S.auth.salt, S.auth.iter || AUTH_ITER);
      if (user === String(S.auth.user).toLowerCase() && safeEq(h, S.auth.hash)) {
        failCount = 0; markUnlocked(); const r = S.unlockResolve; S.unlockResolve = null; S.blocker = null; if (r) r(); else render();
        return;
      }
      failCount++; if (failCount >= 5) { lockedUntil = Date.now() + 30000 * (failCount - 4); }
      m.textContent = 'Benutzername oder Passwort falsch.';
    } catch (err) { m.textContent = 'Anmeldung nicht möglich: ' + (err.message || err); }
    finally { btn.disabled = false; }
  });
  $('#lg-forgot').addEventListener('click', resetWithRecovery);
}

async function resetWithRecovery() {
  const r = await modal({ title: 'Passwort zurücksetzen', body: `<p class="muted small">Gib den Wiederherstellungscode ein, den du beim Einrichten erhalten hast, und wähle ein neues Passwort.</p>
    <div class="stack"><label class="f"><span>Wiederherstellungscode</span><input class="in mono" name="code" placeholder="XXXX-XXXX-XXXX-XXXX"></label>
    <label class="f"><span>Neues Passwort (min. 8 Zeichen)</span><input class="in" name="pw" type="password" autocomplete="new-password"></label>
    <label class="f"><span>Neues Passwort wiederholen</span><input class="in" name="pw2" type="password" autocomplete="new-password"></label></div><div class="modal-err small" style="color:var(--bad);margin-top:8px"></div>`,
    actions: [{ label: 'Abbrechen', value: false, kind: 'ghost' }, { label: 'Zurücksetzen', value: true, kind: 'primary', validate: (v) => (v.pw.length < 8 ? 'Passwort zu kurz.' : v.pw !== v.pw2 ? 'Passwörter stimmen nicht überein.' : '') }] });
  if (!r || !r.value) return;
  const code = r.vals.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').match(/.{1,4}/g)?.join('-') || '';
  const h = await pbkdf2(code, S.auth.rsalt, S.auth.iter || AUTH_ITER);
  if (!safeEq(h, S.auth.rhash)) { showLogin('Wiederherstellungscode ist falsch.'); return; }
  await saveAuth(S.auth.user, r.vals.pw, false);
  toast('Passwort geändert – du bist angemeldet.');
  const res = S.unlockResolve; S.unlockResolve = null; S.blocker = null; if (res) res(); else render();
}

/** Anmeldung speichern; bei newRecovery wird ein neuer Wiederherstellungscode erzeugt und zurückgegeben */
async function saveAuth(user, pw, newRecovery = true) {
  const salt = randB64(16);
  const hash = await pbkdf2(pw, salt);
  const data = { user: user.trim(), salt, hash, iter: AUTH_ITER, updatedAt: Date.now(), rsalt: S.auth && !newRecovery ? S.auth.rsalt : null, rhash: S.auth && !newRecovery ? S.auth.rhash : null };
  let code = null;
  if (newRecovery || !data.rhash) { code = newRecoveryCode(); data.rsalt = randB64(16); data.rhash = await pbkdf2(code, data.rsalt); }
  await authRef().set(data);
  S.auth = data; markUnlocked();
  return code;
}
async function showRecoveryCode(code) {
  await modal({ title: 'Wiederherstellungscode – jetzt notieren!', body: `<p class="muted small">Mit diesem Code kannst du dein Passwort zurücksetzen, falls du es vergisst. Er wird nur dieses eine Mal angezeigt.</p>
    <div class="note mono" style="font-size:20px;text-align:center;letter-spacing:.06em" id="rc-code">${esc(code)}</div>
    <button class="btn sm" style="margin-top:10px" id="rc-copy">${icon('copy')}Kopieren</button>`, actions: [{ label: 'Ich habe ihn notiert', value: true, kind: 'primary' }],
  onOpen: (root) => { $('#rc-copy', root).addEventListener('click', () => copyText(code, 'Code')); } });
}

/* ---- Einstellungen ---- */
function authCardHTML() {
  if (!S.auth) return `<div class="card"><h2>Anmeldung</h2><p class="sub">Schütze RELOOP zusätzlich mit Benutzername und Passwort – z. B. wenn mehrere Personen denselben Rechner nutzen.</p>
    <div class="stack"><label class="f"><span>Benutzername</span><input class="in" id="au-user" autocomplete="username"></label>
    <label class="f"><span>Passwort (min. 8 Zeichen)</span><input class="in" id="au-pw" type="password" autocomplete="new-password"></label>
    <label class="f"><span>Passwort wiederholen</span><input class="in" id="au-pw2" type="password" autocomplete="new-password"></label>
    <div id="au-msg" class="small" style="color:var(--bad)"></div>
    <button class="btn primary" data-act="auth-create">Anmeldung aktivieren</button></div></div>`;
  return `<div class="card"><h2>Anmeldung</h2><p class="small">Aktiv für Benutzer <b>${esc(S.auth.user)}</b>. Beim Öffnen von RELOOP wird nach Benutzername und Passwort gefragt (pro Browser-Sitzung einmal).</p>
    <div class="row"><button class="btn" data-act="auth-logout">Abmelden</button><button class="btn" data-act="auth-change">Passwort ändern</button><button class="btn" data-act="auth-recovery">Neuer Wiederherstellungscode</button><button class="btn danger" data-act="auth-remove">Anmeldung entfernen</button></div></div>`;
}
ACT['auth-create'] = async (el) => {
  const user = $('#au-user').value.trim(), pw = $('#au-pw').value, pw2 = $('#au-pw2').value, m = $('#au-msg');
  if (user.length < 3) { m.textContent = 'Benutzername: mindestens 3 Zeichen.'; return; }
  if (pw.length < 8) { m.textContent = 'Passwort: mindestens 8 Zeichen.'; return; }
  if (pw !== pw2) { m.textContent = 'Passwörter stimmen nicht überein.'; return; }
  el.disabled = true;
  try { const code = await saveAuth(user, pw, true); await showRecoveryCode(code); toast('Anmeldung aktiviert'); render(); }
  catch (e) { m.textContent = 'Speichern fehlgeschlagen: ' + dbMsg(e); el.disabled = false; }
};
async function askPassword(title, extra = '') {
  const r = await modal({ title, body: `<label class="f"><span>Aktuelles Passwort</span><input class="in" name="cur" type="password" autocomplete="current-password"></label>${extra}<div class="modal-err small" style="color:var(--bad);margin-top:8px"></div>`,
    actions: [{ label: 'Abbrechen', value: false, kind: 'ghost' }, { label: 'Weiter', value: true, kind: 'primary' }] });
  if (!r || !r.value) return null;
  const h = await pbkdf2(r.vals.cur, S.auth.salt, S.auth.iter || AUTH_ITER);
  if (!safeEq(h, S.auth.hash)) { toast('Passwort falsch.', 'bad'); return null; }
  return r.vals;
}
ACT['auth-logout'] = () => { try { sessionStorage.removeItem(sessKey()); } catch (e) { /* */ } location.hash = 'uebersicht'; location.reload(); };
ACT['auth-change'] = async () => {
  const v = await askPassword('Passwort ändern', `<label class="f" style="margin-top:10px"><span>Neues Passwort (min. 8 Zeichen)</span><input class="in" name="pw" type="password" autocomplete="new-password"></label><label class="f" style="margin-top:10px"><span>Neues Passwort wiederholen</span><input class="in" name="pw2" type="password" autocomplete="new-password"></label>`);
  if (!v) return;
  if (v.pw.length < 8 || v.pw !== v.pw2) { toast('Neues Passwort zu kurz oder nicht identisch.', 'bad'); return; }
  await saveAuth(S.auth.user, v.pw, false); toast('Passwort geändert');
};
ACT['auth-recovery'] = async () => { const v = await askPassword('Neuen Wiederherstellungscode erzeugen'); if (!v) return; const code = await saveAuth(S.auth.user, v.cur, true); await showRecoveryCode(code); };
ACT['auth-remove'] = async () => {
  const v = await askPassword('Anmeldung entfernen'); if (!v) return;
  await authRef().delete(); S.auth = null; try { sessionStorage.removeItem(sessKey()); } catch (e) { /* */ }
  toast('Anmeldung entfernt'); render();
};
