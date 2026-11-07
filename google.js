/* RELOOP – eigene Google-Anbindung (Gmail lesen, Google Sheets lesen/schreiben).
   Anmeldung über Google Identity Services im Browser; das Zugriffs-Token bleibt nur in diesem Browser.
   Bildet die bisherigen Connector-Aufrufe nach: callTool('Gmail' | 'Google Sheets', tool, args) → { structuredContent }. */
(function () {
  'use strict';
  const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/spreadsheets'];
  const LS_TOKEN = 'rl-gtoken', LS_CLIENT = 'rl-gclient', LS_EVER = 'rl-gever';
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* */ } },
  };
  let tok = null;
  try { tok = JSON.parse(ls.get(LS_TOKEN) || 'null'); } catch (e) { tok = null; }

  const clientId = () => (ls.get(LS_CLIENT) || (window.RELOOP_CONFIG && window.RELOOP_CONFIG.googleClientId) || '').trim();
  const connected = () => !!(tok && tok.access_token && Date.now() < tok.exp - 60000);
  const everConnected = () => ls.get(LS_EVER) === '1';
  const hasScope = (s) => !!(tok && String(tok.scope || '').split(' ').includes(s));

  /* ---- Google-Skript laden ---- */
  let gisP = null;
  function loadGIS() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (!gisP) gisP = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => res(); s.onerror = () => { gisP = null; rej(new Error('Google-Anmeldung konnte nicht geladen werden (Werbeblocker?).')); };
      document.head.appendChild(s);
    });
    return gisP;
  }
  if (clientId()) loadGIS().catch(() => { /* später erneut */ });

  /* ---- Anmelden ---- */
  let pendingAuth = null;
  async function connect({ prompt } = {}) {
    const cid = clientId();
    if (!cid) throw { code: 'no_client_id', message: 'Es ist noch keine Google-Client-ID eingetragen (Einstellungen → Google).' };
    await loadGIS();
    if (pendingAuth) return pendingAuth;
    pendingAuth = new Promise((res, rej) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: cid,
        scope: SCOPES.join(' '),
        include_granted_scopes: true,
        callback: (r) => {
          if (r && r.access_token) {
            tok = { access_token: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000, scope: r.scope || '' };
            ls.set(LS_TOKEN, JSON.stringify(tok)); ls.set(LS_EVER, '1');
            res(tok); changedState();
          } else rej({ code: 'auth_failed', message: (r && (r.error_description || r.error)) || 'Google-Anmeldung fehlgeschlagen.' });
        },
        error_callback: (e) => rej({ code: e && e.type === 'popup_closed' ? 'popup_closed' : 'auth_failed', message: e && e.type === 'popup_failed_to_open' ? 'Das Google-Fenster wurde blockiert – Pop-ups für diese Seite erlauben.' : 'Google-Anmeldung abgebrochen.' }),
      });
      client.requestAccessToken({ prompt: prompt !== undefined ? prompt : (everConnected() ? '' : 'consent') });
    }).finally(() => { pendingAuth = null; });
    return pendingAuth;
  }
  function disconnect() {
    const t = tok && tok.access_token;
    tok = null; ls.set(LS_TOKEN, null); ls.set(LS_EVER, null);
    try { if (t && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(t, () => {}); } catch (e) { /* */ }
    changedState();
  }
  function changedState() { try { if (typeof updateStatusLine === 'function') updateStatusLine(); window.dispatchEvent(new Event('rl-google')); } catch (e) { /* */ } }

  async function ensureToken() {
    if (connected()) return tok.access_token;
    // Nur bei Klick (Nutzeraktion) darf ein Anmeldefenster aufgehen – sonst blockiert der Browser es.
    const active = navigator.userActivation ? navigator.userActivation.isActive : false;
    if (clientId() && active) { await connect(); return tok.access_token; }
    throw { code: everConnected() ? 'needs_reauth' : 'server_not_connected' };
  }

  /* ---- REST ---- */
  async function api(url, opts = {}, retry = true) {
    const t = await ensureToken();
    const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + t, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } });
    if (r.status === 401) { tok = null; ls.set(LS_TOKEN, null); changedState(); if (retry && navigator.userActivation && navigator.userActivation.isActive) return api(url, opts, false); throw { code: 'needs_reauth' }; }
    if (r.status === 429) throw { code: 'server_unavailable', message: 'Google: zu viele Anfragen – kurz warten.' };
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (j.error && j.error.message) || ('HTTP ' + r.status);
      if (r.status === 403 && /scope|insufficient/i.test(msg)) throw { code: 'needs_reauth', message: msg };
      if (r.status === 404) throw { code: 'tool_error', message: 'Nicht gefunden: ' + msg };
      throw { code: r.status === 403 ? 'blocked_by_policy' : 'tool_error', message: msg };
    }
    return j;
  }
  async function pool(list, n, fn) {
    const out = new Array(list.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); } }));
    return out;
  }

  /* ---- Gmail ---- */
  const GM = 'https://gmail.googleapis.com/gmail/v1/users/me/';
  const b64url = (s) => { const b = atob(String(s || '').replace(/-/g, '+').replace(/_/g, '/')); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new TextDecoder('utf-8').decode(u); };
  const hdr = (m, name) => { const h = ((m.payload && m.payload.headers) || []).find((x) => x.name.toLowerCase() === name.toLowerCase()); return h ? h.value : ''; };
  function bodyText(part) {
    let plain = '', html = '';
    (function walk(p) {
      if (!p) return;
      if (p.mimeType === 'text/plain' && p.body && p.body.data && !plain) plain = b64url(p.body.data);
      else if (p.mimeType === 'text/html' && p.body && p.body.data && !html) html = b64url(p.body.data);
      (p.parts || []).forEach(walk);
    })(part);
    if (plain) return plain;
    if (html && window.RL && RL.htmlToText) return RL.htmlToText(html);
    return html;
  }
  function msgOut(m, withBody) {
    const o = { id: m.id, threadId: m.threadId, snippet: m.snippet || '', subject: hdr(m, 'Subject'), sender: hdr(m, 'From'), date: hdr(m, 'Date'), internalDate: m.internalDate, labelIds: m.labelIds || [] };
    if (withBody) o.plaintextBody = bodyText(m.payload);
    return o;
  }
  const META = 'format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date';
  async function getThread(id, format) {
    const full = format === 'PLAIN_TEXT' || format === 'FULL_CONTENT';
    const t = await api(`${GM}threads/${encodeURIComponent(id)}?${full ? 'format=full' : META}`);
    const messages = (t.messages || []).map((m) => msgOut(m, full));
    return { id: t.id, messages, messageCount: messages.length };
  }
  const GMAIL = {
    async search_threads(a) {
      const q = new URLSearchParams({ q: a.query || '', maxResults: String(Math.min(100, a.pageSize || 25)) });
      if (a.pageToken) q.set('pageToken', a.pageToken);
      const r = await api(`${GM}threads?${q}`);
      const threads = await pool(r.threads || [], 8, (t) => getThread(t.id, 'MINIMAL').catch(() => ({ id: t.id, messages: [], messageCount: 0 })));
      return { threads, nextPageToken: r.nextPageToken || '' };
    },
    get_thread: (a) => getThread(a.threadId, a.messageFormat),
    async get_message(a) {
      const full = a.messageFormat === 'PLAIN_TEXT' || a.messageFormat === 'FULL_CONTENT';
      const m = await api(`${GM}messages/${encodeURIComponent(a.messageId)}?${full ? 'format=full' : META}`);
      return msgOut(m, full);
    },
  };

  /* ---- Google Sheets ---- */
  const SH = 'https://sheets.googleapis.com/v4/spreadsheets/';
  const SHEETS = {
    get_spreadsheet: (a) => api(`${SH}${encodeURIComponent(a.spreadsheetId)}?fields=${encodeURIComponent((a.fields && a.fields.length ? a.fields : ['properties.title', 'sheets.properties.title']).join(','))}`),
    get_values: (a) => api(`${SH}${encodeURIComponent(a.spreadsheetId)}/values/${encodeURIComponent(a.range)}`),
    update_values: (a) => api(`${SH}${encodeURIComponent(a.spreadsheetId)}/values/${encodeURIComponent(a.range)}?valueInputOption=${a.valueInputOption || 'USER_ENTERED'}`, {
      method: 'PUT', body: JSON.stringify({ range: a.range, majorDimension: 'ROWS', values: a.values }),
    }),
  };

  const SERVERS = { Gmail: GMAIL, 'Google Sheets': SHEETS };
  async function callTool(server, tool, args = {}) {
    const s = SERVERS[server]; const fn = s && s[tool];
    if (!fn) throw { code: 'tool_error', message: `${server}/${tool} wird nicht unterstützt.` };
    if (!clientId()) throw { code: 'no_client_id' };
    return { structuredContent: await fn(args) };
  }

  window.GoogleBridge = {
    callTool, connect, disconnect, connected, everConnected, hasScope, loadGIS,
    clientId, setClientId(v) { ls.set(LS_CLIENT, String(v || '').trim() || null); if (clientId()) loadGIS().catch(() => {}); changedState(); },
    expiresAt: () => (tok ? tok.exp : 0),
  };
})();
