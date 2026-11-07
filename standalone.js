/* RELOOP – eigenständige Version: Google-Einstellungen, Backup-Import, Hinweise */
'use strict';

/* ================= Google-Verbindung ================= */
function googleCardHTML() {
  const G = window.GoogleBridge; const cid = G.clientId(); const on = G.connected();
  const until = on ? new Date(G.expiresAt()).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
  return `<p class="sub">Für den Gmail-Abgleich (Verkaufs-Mails) und die Team-Tabelle in Google Sheets meldest du dich direkt bei Google an. Der Zugang gilt nur in diesem Browser; nach ca. 1 Stunde fragt Google beim nächsten Klick kurz neu nach.</p>
    <label class="f"><span>Google-OAuth-Client-ID</span><input class="in mono" id="g-client" value="${esc(cid)}" placeholder="123456789-abc….apps.googleusercontent.com" autocomplete="off" spellcheck="false"></label>
    <div class="row" style="margin-top:10px">
      <button class="btn" data-act="g-save-client">Client-ID speichern</button>
      ${on ? `<span class="chip ok">Verbunden bis ${esc(until)}</span><button class="btn ghost" data-act="g-disconnect">Trennen</button>`
    : `<button class="btn primary" data-act="g-connect" ${cid ? '' : 'disabled'}>Mit Google verbinden</button>${G.everConnected() ? '<span class="chip warn">Anmeldung abgelaufen</span>' : ''}`}
    </div>
    <details style="margin-top:14px"><summary class="small"><b>Einmalige Einrichtung (ca. 10 Minuten)</b></summary>
      <ol class="small" style="margin:10px 0 0;padding-left:18px;line-height:1.6">
        <li>Öffne <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">console.cloud.google.com</a> und lege ein Projekt an (z. B. „RELOOP“).</li>
        <li>Unter <i>APIs &amp; Dienste → Bibliothek</i> die <b>Gmail API</b> und die <b>Google Sheets API</b> aktivieren.</li>
        <li>Unter <i>Google Auth Platform → Branding</i> (bzw. „OAuth-Zustimmungsbildschirm“) App-Name und deine E-Mail eintragen, Nutzertyp <b>Extern</b>.</li>
        <li>Unter <i>Zielgruppe</i> dich (und dein Team) als <b>Testnutzer</b> hinzufügen. Die App bleibt im Testmodus – eine Google-Prüfung ist dann nicht nötig.</li>
        <li>Unter <i>Clients → Client erstellen</i>: Typ <b>Webanwendung</b>, bei „Autorisierte JavaScript-Quellen“ <code>${esc(location.origin)}</code> eintragen.</li>
        <li>Die angezeigte <b>Client-ID</b> oben einfügen, speichern und „Mit Google verbinden“ klicken. Beim ersten Mal warnt Google „App nicht überprüft“ → <i>Erweitert → Weiter zu RELOOP</i>.</li>
      </ol>
    </details>`;
}
ACT['g-save-client'] = () => {
  const v = ($('#g-client').value || '').trim();
  if (v && !/\.apps\.googleusercontent\.com$/.test(v)) { toast('Das sieht nicht nach einer Google-Client-ID aus (endet auf .apps.googleusercontent.com).', 'bad'); return; }
  GoogleBridge.setClientId(v); toast(v ? 'Client-ID gespeichert' : 'Client-ID entfernt'); render();
};
ACT['g-connect'] = async () => {
  try {
    await GoogleBridge.connect(); toast('Mit Google verbunden');
    if (typeof mailCheck === 'function' && S.mail && S.mail.loaded) setTimeout(() => mailCheck({ silent: true }), 300);
    if (typeof sheetImport === 'function' && S.settings.sheetsUrl) setTimeout(() => sheetImport({ silent: true }), 600);
  }
  catch (e) { if (e && e.code !== 'popup_closed') toast((e && e.message) || 'Google-Anmeldung fehlgeschlagen', 'bad'); }
  render();
};
ACT['g-disconnect'] = () => { GoogleBridge.disconnect(); toast('Google getrennt'); render(); };
window.addEventListener('rl-google', () => { if (S.view === 'einstellungen' || S.view === 'verkaeufe') queueRender(); });

/** kleiner Hinweis mit Anmeldeknopf, wenn Gmail/Sheets wegen fehlender Anmeldung scheitern */
function googleHint() {
  const G = window.GoogleBridge;
  if (!G || G.connected()) return '';
  if (!G.clientId()) return `<div class="note small" style="margin-top:8px">Google ist noch nicht eingerichtet. <button class="link" data-act="g-open-settings">Einstellungen → Google öffnen</button></div>`;
  return `<div class="note small" style="margin-top:8px">${G.everConnected() ? 'Die Google-Anmeldung ist abgelaufen.' : 'Noch nicht mit Google verbunden.'} <button class="btn sm primary" data-act="g-connect">Mit Google verbinden</button></div>`;
}
ACT['g-open-settings'] = () => { S.setOpen = 'google'; go('einstellungen'); };

/* ================= Backup-Import (aus der Claude-Version) ================= */
ACT['import-backup'] = () => {
  let inp = $('#import-file');
  if (!inp) { inp = document.createElement('input'); inp.type = 'file'; inp.id = 'import-file'; inp.accept = '.json,application/json'; inp.style.display = 'none'; document.body.appendChild(inp); inp.addEventListener('change', () => { const f = inp.files[0]; inp.value = ''; if (f) importBackup(f); }); }
  inp.click();
};
const b64ToBlob = (b64, type) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: type || 'application/octet-stream' }); };
async function importBackup(file) {
  setProgress('Backup wird gelesen…');
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { setProgress(''); toast('Die Datei ist kein gültiges RELOOP-Backup (JSON).', 'bad'); return; }
  setProgress('');
  if (!data || data.app !== 'RELOOP') { toast('Das ist kein RELOOP-Backup.', 'bad'); return; }
  const full = data.kind === 'full-backup';
  const items = full ? data.items || [] : (data.items || []).map(({ id, ...d }) => ({ id, data: d }));
  const expenses = full ? data.expenses || [] : (data.expenses || []).map(({ id, ...d }) => ({ id, data: d }));
  const nBlobs = full ? Object.keys(data.blobs || {}).length : 0;
  const ok = await confirmDialog('Backup importieren?',
    `${items.length} Artikel, ${expenses.length} Ausgaben${full ? `, ${nBlobs} Fotos/Belege` : ''} werden übernommen. Artikel mit gleicher ID werden überschrieben, andere bleiben erhalten.${full ? '' : '<br><br><b>Achtung:</b> Das ist ein einfacher Export ohne Fotos. Für Fotos in der alten Version „Komplett-Backup inkl. Fotos“ verwenden.'}`, 'Importieren');
  if (!ok) return;
  const L = window.RLLocal; const base = `data/users/${S.uid}/profile`;
  try {
    let n = 0;
    if (full) for (const [aid, b] of Object.entries(data.blobs || {})) {
      if (++n % 10 === 1) setProgress(`Fotos/Belege ${n} von ${nBlobs}…`);
      try { await L.assets.put(aid, b64ToBlob(b.b64, b.type)); } catch (e) { console.warn('Foto', aid, e); if (e && e.code === 'quota_exceeded') throw e; }
    }
    if (full && data.profile) await L.write(base, data.profile);
    else if (data.settings) await L.write(base, { ...((await profileRef().get()).data() || {}), settings: data.settings, updatedAt: Date.now() });
    n = 0;
    for (const it of items) {
      if (++n % 25 === 1) setProgress(`Artikel ${n} von ${items.length}…`);
      const d = clone(it.data);
      if (!full) d.images = (d.images || []).filter((m) => m && (m.data || m.thumb)); // ohne Fotodaten nicht übernehmbar
      await L.write(`${base}/items/${it.id}`, d);
    }
    for (const e of expenses) { const d = clone(e.data); if (!full && d.receipt && !d.receipt.thumb) d.receipt = null; await L.write(`${base}/expenses/${e.id}`, d); }
    if (full && data.meta && data.meta.mailsync) await L.write(`${base}/meta/mailsync`, data.meta.mailsync);
    if (full && data.auth && !S.auth) await L.write(`data/users/${S.uid}/auth`, data.auth);
    setProgress('');
    toast(`Import fertig: ${items.length} Artikel, ${expenses.length} Ausgaben${full ? `, ${nBlobs} Dateien` : ''}`);
    setTimeout(() => location.reload(), 1200);
  } catch (e) {
    setProgress(''); console.error(e);
    toast('Import abgebrochen: ' + (e.code === 'quota_exceeded' ? 'Browser-Speicher voll.' : (e.message || dbMsg(e))), 'bad');
  }
}

/* ================= Speicher-Info ================= */
async function storageInfoHTML() {
  try {
    const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
    const pers = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
    const mb = (b) => (b / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 0 });
    return `${est ? `Belegt: ${mb(est.usage || 0)} MB von ca. ${mb(est.quota || 0)} MB. ` : ''}${pers ? 'Speicher ist als dauerhaft markiert.' : 'Der Browser darf den Speicher bei Platzmangel leeren – mache regelmäßig ein Komplett-Backup.'}`;
  } catch (e) { return ''; }
}
AFTER.einstellungen = ((prev) => () => { if (prev) prev(); const el = $('#storage-info'); if (el) storageInfoHTML().then((h) => { el.textContent = h; }); })(AFTER.einstellungen);
