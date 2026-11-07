/* RELOOP – Google-Sheets-Import: Team-Tabelle (Blätter „[M] Mike“, „[T] Tristan“ …) ins Inventar übernehmen. Nur Lesen. */
'use strict';

const SHEETS = 'Google Sheets';
S.sheet = { state: 'idle', msg: '', timer: null };

function sheetIdFrom(url) {
  const s = String(url || '').trim();
  const m = s.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/) || s.match(/^([A-Za-z0-9_-]{30,})$/);
  return m ? m[1] : '';
}
const SHEET_ERR = {
  server_not_connected: 'Google ist noch nicht verbunden – Einstellungen → Google → „Mit Google verbinden“.',
  needs_reauth: 'Die Google-Anmeldung ist abgelaufen – Einstellungen → Google → „Mit Google verbinden“.',
  no_client_id: 'Google ist noch nicht eingerichtet (Einstellungen → Google).',
  popup_closed: 'Google-Anmeldung abgebrochen.',
  blocked_by_policy: 'Google verweigert den Zugriff – ist die Google Sheets API aktiviert und hast du Zugriff auf die Tabelle?',
  not_in_manifest: 'Der Sheets-Zugriff wurde für diese App nicht erlaubt. Klicke erneut auf „Jetzt importieren“.',
  approval_required: 'Sheets-Zugriff braucht deine Zustimmung – klicke auf „Jetzt importieren“ und erlaube den Zugriff.',
  server_unavailable: 'Google Sheets ist gerade nicht erreichbar. Später erneut versuchen.',
};
const sheetErr = (e) => SHEET_ERR[e && e.code] || ('Import fehlgeschlagen: ' + ((e && (e.message || e.code)) || 'unbekannter Fehler') + (e && e.code === 'tool_error' ? ' – stimmt der Link und hast du Zugriff auf die Tabelle?' : ''));

async function sheetImport({ silent = false } = {}) {
  const T = S.sheet;
  if (T.state === 'running') return;
  const id = sheetIdFrom(S.settings.sheetsUrl);
  if (!id) { if (!silent) toast('Bitte zuerst den Link zur Google-Tabelle eintragen.', 'bad'); return; }
  const mcp = await claude.use('mcp').catch(() => null);
  if (!mcp) { T.state = 'error'; T.msg = 'Google Sheets ist nicht verfügbar.'; sheetRefresh(); return; }
  T.state = 'running'; T.msg = 'Lese Tabelle…'; sheetRefresh();
  let created = 0, updated = 0, total = 0;
  try {
    const { titles, person, rows } = await sheetReadRows(mcp, id);
    total = rows.length;
    // Ausgaben-Blätter („Ausgaben“, „Ausgaben Kleidung“)
    const owners = {}; for (const t of person) { const m = t.match(/^\s*\[([^\]]+)\]\s*(.*)$/); if (m) owners[m[1].trim().toUpperCase()] = (m[2] || m[1]).trim(); }
    // Person → Blatt merken (für das Zurückschreiben)
    const tabs = {}; for (const t of person) { const m = t.match(/^\s*\[([^\]]+)\]\s*(.*)$/); if (m) tabs[(m[2] || m[1]).trim()] = t; }
    if (JSON.stringify(tabs) !== JSON.stringify(S.settings.sheetTabs || {})) saveSettings({ sheetTabs: tabs });
    if (!S.settings.defaultOwner) { // Standard-Person = Blatt mit dem eigenen Lagernummer-Kürzel (z. B. „M“ → Mike)
      const own = Object.entries(tabs).find(([, t]) => new RegExp('^\\s*\\[' + String(S.settings.stockPrefix || '').replace(/[^A-Za-z0-9]/g, '') + '\\]', 'i').test(t));
      if (own) saveSettings({ defaultOwner: own[0] });
    }
    const expRows = [];
    for (const t of titles.filter((x) => /ausgabe/i.test(x) && !person.includes(x))) {
      T.msg = `Lese Blatt „${t}“…`; sheetRefresh();
      const v = mailPayload(await mcp.callTool(SHEETS, 'get_values', { spreadsheetId: id, range: `'${t.replace(/'/g, "''")}'!A1:L2000` }, { cache: false }));
      expRows.push(...RL.parseExpenseSheet(v.values || findArr(v, 'values') || [], t, owners));
    }
    if (!total && !expRows.length) throw new Error('Keine Artikelzeilen gefunden (Kopfzeile „Status | Artikel Name | …“ fehlt?)');
    const byKey = new Map(S.items.filter((i) => i.sheetKey).map((i) => [i.sheetKey, i]));
    const byStock = new Map(S.items.filter((i) => i.stockNo).map((i) => [String(i.stockNo).toUpperCase(), i]));
    const conflicts = [];
    for (const [k, row] of rows.entries()) {
      if (k % 15 === 0) { T.msg = `Übernehme Zeile ${k + 1} von ${rows.length}…`; sheetRefresh(); }
      const { f, init } = RL.sheetFields(row);
      let ex = byKey.get(f.sheetKey);
      if (!ex && row.stockNo) {
        const cand = byStock.get(row.stockNo.toUpperCase());
        // gleiche Lagernummer: nur verknüpfen, wenn es offensichtlich derselbe Artikel ist – sonst bekommt der RELOOP-Artikel eine neue Nummer
        if (cand && !cand.sheetKey) { if (RL.matchScore(row.title, cand) >= 0.5 || (cand.title || '').toLowerCase() === row.title.toLowerCase()) ex = cand; else conflicts.push(cand.id); }
      }
      if (ex) {
        const patch = {};
        const wasSold = ex.status === 'Verkauft';
        if (f.status !== ex.status && !(wasSold && f.status !== 'Verkauft')) { // Verkauf in RELOOP nie zurücksetzen
          patch.status = f.status;
          if (f.status === 'Verkauft') { if (!ex.saleDate) patch.saleDate = RL.today(); if (!ex.shipStatus) patch.shipStatus = f.shipStatus; }
        } else if (wasSold && f.shipStatus === 'zugestellt' && ex.shipStatus !== 'zugestellt') patch.shipStatus = 'zugestellt';
        for (const key of ['purchasePrice', 'refund', 'salePrice', 'txId', 'owner']) if (f[key] !== null && f[key] !== '' && f[key] !== undefined && f[key] !== ex[key]) patch[key] = f[key];
        if (!ex.sheetKey) patch.sheetKey = f.sheetKey;
        if (!ex.stockNo && f.stockNo) patch.stockNo = f.stockNo;
        if (Object.keys(patch).length) { await patchItem(ex.id, patch, { immediate: true, noSheet: true }); updated++; }
        continue;
      }
      const sold = f.status === 'Verkauft';
      await createItem({
        ...init, ...f, source: 'Google Sheets', purchaseDate: null, channel: 'Vinted',
        saleDate: null, saleFees: sold ? 0 : null, saleShipping: sold ? 0 : null,
        notes: `Aus Google Sheets (${row.sheet}, Zeile ${row.row})${row.txNote ? ' · ' + row.txNote : ''}`,
      });
      byKey.set(f.sheetKey, { sheetKey: f.sheetKey }); created++;
    }
    let expNew = 0, expUpd = 0;
    for (const e of expRows) {
      const { sheetKey, row, sheet, ...data } = e;
      const ex = S.expenses.find((x) => x.sheetKey === sheetKey)
        || S.expenses.find((x) => !x.sheetKey && RL.sameExpense(x, { ...data, sheetKey }));
      if (ex) {
        const patch = {};
        for (const k of ['amount', 'date', 'qty', 'owner', 'receiptUrl']) if (data[k] !== '' && data[k] !== null && data[k] !== undefined && data[k] !== ex[k]) patch[k] = data[k];
        if (!ex.vendor && data.vendor) patch.vendor = data.vendor;
        if (!ex.sheetKey) patch.sheetKey = sheetKey;
        if (Object.keys(patch).length) { Object.assign(ex, patch); await expensesCol().doc(ex.id).update(patch); expUpd++; }
        continue;
      }
      const doc = { ...data, sheetKey, note: data.note + (data.receiptNote ? ` (${data.receiptNote})` : ''), itemId: null, itemSku: null, source: 'sheets', createdAt: Date.now() };
      delete doc.receiptNote;
      const xid = uidGen('x'); S.expenses.unshift({ id: xid, ...doc }); await expensesCol().doc(xid).set(doc); expNew++;
    }
    for (const cid of conflicts) { // doppelte Lagernummer → nächste freie Nummer vergeben
      const it = itemById(cid); if (!it || it.sheetKey) continue;
      await patchItem(cid, { stockNo: RL.nextStockNo(S.items, S.settings.stockPrefix) }, { immediate: true, noSheet: true });
    }
    T.state = 'idle';
    T.msg = `${total} Artikelzeilen · ${created} neu angelegt · ${updated} aktualisiert${expRows.length ? ` · Ausgaben: ${expNew} neu, ${expUpd} aktualisiert` : ''}.`;
    saveSettings({ sheetsLast: Date.now(), sheetsMsg: T.msg });
    if (!silent || created || updated || expNew) toast(`Google Sheets: ${created} Artikel neu, ${updated} aktualisiert${expNew ? `, ${expNew} Ausgaben neu` : ''}`);
    if (created || updated) setTimeout(() => mailRematch(), 300);
    if (undated().length && (created || updated || !S.mail.backfillAt)) setTimeout(() => backfillSaleDates({ silent: true }), 1500);
  } catch (e) {
    console.warn('Sheets', e);
    T.state = 'error'; T.msg = sheetErr(e);
    if (!silent) toast(T.msg, 'bad');
  }
  sheetRefresh(); buildNav();
}
/** Personen-Blätter („[M] Mike“ …) lesen → Artikelzeilen */
async function sheetReadRows(mcp, id) {
  const T = S.sheet;
  const meta = mailPayload(await mcp.callTool(SHEETS, 'get_spreadsheet', { spreadsheetId: id, fields: ['properties.title', 'sheets.properties.title'] }, { cache: false }));
  const titles = (findArr(meta, 'sheets') || []).map((x) => x && x.properties && x.properties.title).filter(Boolean);
  const person = titles.filter((t) => /^\s*\[[^\]]+\]/.test(t));
  const rows = [];
  for (const t of person.length ? person : titles) {
    T.msg = `Lese Blatt „${t}“…`; sheetRefresh();
    const v = mailPayload(await mcp.callTool(SHEETS, 'get_values', { spreadsheetId: id, range: `'${t.replace(/'/g, "''")}'!A1:L2000` }, { cache: false }));
    rows.push(...RL.parseSheetRows(v.values || findArr(v, 'values') || [], t));
  }
  return { titles, person, rows };
}

/* ---- Gewinn-Abgleich: Tabelle ist maßgeblich ---- */
async function sheetReconcileRun() {
  const T = S.sheet; if (T.state === 'running') return;
  const id = sheetIdFrom(S.settings.sheetsUrl); if (!id) { toast('Bitte zuerst den Link zur Google-Tabelle eintragen.', 'bad'); return; }
  const mcp = await claude.use('mcp').catch(() => null); if (!mcp) { toast('Google Sheets ist nicht verfügbar.', 'bad'); return; }
  T.state = 'running'; T.msg = 'Lese Tabelle für den Abgleich…'; sheetRefresh();
  try {
    const { rows } = await sheetReadRows(mcp, id);
    T.rec = RL.sheetReconcile(rows, S.items); T.rec.at = Date.now();
    T.state = 'idle'; T.msg = T.rec.issues.length ? `${T.rec.issues.length} Abweichung(en) zur Tabelle gefunden.` : 'RELOOP stimmt mit der Tabelle überein.';
  } catch (e) { console.warn('Abgleich', e); T.state = 'error'; T.msg = sheetErr(e); }
  sheetRefresh();
}
const recEur = (v) => (v === null || v === undefined || v === '' ? '–' : eur(v));
function sheetRecHTML() {
  const R = S.sheet.rec; if (!R) return '';
  const extra = R.issues.filter((x) => x.type === 'extra'), diff = R.issues.filter((x) => x.type === 'diff'), miss = R.issues.filter((x) => x.type === 'missing');
  const li = (x) => `<div class="list-row" style="align-items:flex-start"><div class="grow small"><b>${esc((x.itemId && itemById(x.itemId) && displayTitle(itemById(x.itemId))) || x.label || '–')}</b>${x.row ? ` <span class="tiny muted">${esc(x.row.stockNo || '')} · ${esc(x.row.owner)}</span>` : ''}
      <div class="tiny muted">${x.type === 'diff' ? x.changes.map((c) => `${esc(c.label)}: ${typeof c.from === 'number' || c.from === null || c.from === undefined ? recEur(c.from) : esc(c.from)} → ${typeof c.to === 'number' || c.to === null ? recEur(c.to) : esc(c.to)}`).join(' · ') : esc(x.msg || '')}</div></div>
      ${x.type !== 'missing' ? `<span class="tiny" style="white-space:nowrap;color:${x.after - x.before < 0 ? 'var(--bad)' : 'var(--ok)'}">${x.after - x.before > 0 ? '+' : ''}${eur(RL.n0(x.after) - RL.n0(x.before))}</span>` : ''}</div>`;
  const group = (title, list, hint) => list.length ? `<h4 style="margin:14px 0 4px">${title} (${list.length})</h4>${hint ? `<p class="tiny muted" style="margin:0 0 4px">${hint}</p>` : ''}<div class="rec-list">${list.map(li).join('')}</div>` : '';
  return `<div class="card" style="margin-top:12px;padding:14px">
    <div class="row between"><h3 style="margin:0">Gewinn-Abgleich mit der Tabelle</h3><span class="tiny muted">${new Date(R.at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
    <div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th></th><th class="right">Tabelle</th><th class="right">RELOOP</th></tr></thead><tbody>
      <tr><td>Umsatz (VK)</td><td class="num right">${eur(R.sheet.revenue)}</td><td class="num right">${eur(R.app.revenue)}</td></tr>
      <tr><td>Einkauf (EK aller Artikel)</td><td class="num right">${eur(R.sheet.purchase)}</td><td class="num right">${eur(R.app.purchase)}</td></tr>
      <tr><td>Rückerstattungen</td><td class="num right">${eur(R.sheet.refund)}</td><td class="num right">${eur(R.app.refund)}</td></tr>
      <tr><td><b>Gewinn (Umsatz − Einkauf − Rückerst.)</b></td><td class="num right"><b>${eur(R.sheet.profit)}</b></td><td class="num right"><b>${eur(R.app.balance)}</b></td></tr>
      <tr><td class="muted">nur verkaufte Artikel (wie „Gewinn“ in der Übersicht)</td><td class="num right muted">${eur(R.sheet.soldProfit)}</td><td class="num right muted">${eur(R.app.profit)}</td></tr>
    </tbody></table></div>
    <p class="tiny muted" style="margin:8px 0 0">Wichtig: Die Tabelle zieht den Einkauf <b>aller</b> Artikel ab – auch der noch nicht verkauften (in RELOOP gerade ${eur(R.app.unsoldPurchase)}). Der „Gewinn“ in der RELOOP-Übersicht zählt nur verkaufte Artikel und ist deshalb höher.</p>
    ${R.issues.length ? `<div class="note warn small" style="margin-top:10px">Nach dem Angleichen ändert sich der Gewinn in RELOOP um <b>${R.delta > 0 ? '+' : ''}${eur(R.delta)}</b>.</div>
      ${group('Verkauft in RELOOP, aber nicht in der Tabelle', extra, 'Aus Gmail angelegte Artikel werden gelöscht, alle anderen bekommen den Verkauf zurückgesetzt.')}
      ${group('Abweichende Werte', diff, 'RELOOP übernimmt Status, Verkaufspreis, Einkaufspreis und Rückerstattung aus der Tabelle; Gebühren/Versand werden wie in der Tabelle auf 0 gesetzt.')}
      ${group('Fehlt in RELOOP', miss, 'Wird beim Angleichen aus der Tabelle angelegt.')}
      <div class="row" style="margin-top:12px;gap:8px"><button class="btn primary" data-act="sheet-rec-apply">Alles an die Tabelle angleichen</button><button class="btn ghost" data-act="sheet-rec-close">Schließen</button></div>`
    : `<div class="note ok small" style="margin-top:10px">Alle Artikel stimmen mit der Tabelle überein.</div><div style="margin-top:8px"><button class="btn ghost sm" data-act="sheet-rec-close">Schließen</button></div>`}
  </div>`;
}
async function sheetRecApply() {
  const R = S.sheet.rec; if (!R || !R.issues.length) return;
  const dels = R.issues.filter((x) => x.type === 'extra' && x.del).length;
  if (!(await confirmDialog('An die Tabelle angleichen?', `${R.issues.length} Änderung(en)${dels ? `, davon ${dels} aus Gmail angelegte Artikel löschen` : ''}. Vorher wird eine Sicherung der betroffenen Artikel gespeichert.`, 'Angleichen'))) return;
  const T = S.sheet; T.state = 'running'; T.msg = 'Gleiche an…'; sheetRefresh();
  try {
    const touched = R.issues.filter((x) => x.itemId).map((x) => clone(itemById(x.itemId))).filter(Boolean);
    await profileRef().collection('meta').doc('sheetrec-backup').set({ at: Date.now(), items: touched });
    let n = 0;
    for (const x of R.issues) {
      if (++n % 10 === 0) { T.msg = `Gleiche an… ${n}/${R.issues.length}`; sheetRefresh(); }
      if (x.type === 'diff') await patchItem(x.itemId, x.patch, { immediate: true, noSheet: true });
      else if (x.type === 'extra') {
        if (x.del) await deleteItems([x.itemId]);
        else await patchItem(x.itemId, { status: 'Online', salePrice: null, saleDate: null, saleFees: null, saleShipping: null, shipStatus: null, saleDateSource: null }, { immediate: true, noSheet: true });
      }
    }
    T.state = 'idle'; T.rec = null;
    toast('RELOOP an die Tabelle angeglichen');
    if (R.issues.some((x) => x.type === 'missing')) await sheetImport({ silent: true });
    await sheetReconcileRun();
  } catch (e) { console.warn(e); T.state = 'error'; T.msg = 'Angleichen fehlgeschlagen: ' + (e.message || dbMsg(e)); sheetRefresh(); }
  render();
}
ACT['sheet-rec'] = () => sheetReconcileRun();
ACT['sheet-rec-apply'] = () => sheetRecApply();
ACT['sheet-rec-close'] = () => { S.sheet.rec = null; sheetRefresh(); };

function sheetAutoStart() {
  if (!sheetIdFrom(S.settings.sheetsUrl)) return;
  setTimeout(() => sheetImport({ silent: true }), 4000);
  clearInterval(S.sheet.timer);
  S.sheet.timer = setInterval(() => { if (document.visibilityState === 'visible') sheetImport({ silent: true }); }, 15 * 60 * 1000);
}

function sheetCardHTML() {
  const T = S.sheet; const s = S.settings;
  const msg = T.state === 'running' ? `<span class="loading-line small"><span class="spin"></span>${esc(T.msg)}</span>`
    : T.msg ? `<div class="note ${T.state === 'error' ? 'warn' : ''} small">${esc(T.msg)}</div>`
    : s.sheetsLast ? `<p class="tiny muted" style="margin:0">Zuletzt importiert ${new Date(s.sheetsLast).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}${s.sheetsMsg ? ' · ' + esc(s.sheetsMsg) : ''}</p>` : '';
  return `<div class="list-row" style="flex-wrap:wrap;align-items:flex-start"><div class="grow" style="min-width:240px"><b>Google Sheets</b><div class="tiny muted">Übernimmt eure Team-Tabelle ins Inventar (alle Personen-Blätter wie „[M] Mike“): Status, Name, Lagernummer, EK, VK, Rückerstattung, Transaktions-ID, Mängel, Geschlecht. Import beim Öffnen und alle 15 Minuten; Änderungen in RELOOP werden – wenn unten eingeschaltet – direkt ins Blatt der Person zurückgeschrieben (nie in Formelspalten, nie löschen).</div></div>${s.sheetsUrl ? '<span class="chip ok">Verbunden</span>' : ''}</div>
    <div class="row" style="margin-top:4px"><input class="in" style="flex:1;min-width:220px" data-s="sheetsUrl" id="s-sheets" value="${esc(s.sheetsUrl || '')}" placeholder="Link zur Google-Tabelle (https://docs.google.com/spreadsheets/d/…)">${T.state === 'running' ? '' : `<button class="btn primary" data-act="sheet-import">Jetzt importieren</button><button class="btn" data-act="sheet-rec">Gewinn abgleichen</button>`}</div>
    <div class="row" style="margin-top:10px;gap:14px;flex-wrap:wrap;align-items:flex-end">
      <label class="check" style="flex:1;min-width:240px"><input type="checkbox" data-s="sheetWrite" id="s-sheet-write" ${s.sheetWrite !== false ? 'checked' : ''}> Änderungen in die Tabelle schreiben – neue Artikel als Zeile im Blatt der Person, Statuswechsel (z. B. „Verkauft“ aus Gmail), Name, EK, VK</label>
      ${Object.keys(s.sheetTabs || {}).length ? `<label class="f" style="width:200px"><span>Person für neue Artikel</span>${sel('defaultOwner', [['', '– keine –'], ...Object.keys(s.sheetTabs).map((o) => [o, o])], s.defaultOwner || '', 'data-s="defaultOwner" id="s-default-owner"')}</label>` : ''}
    </div>
    <div style="margin-top:8px" id="sheet-msg">${msg}</div>${s.sheetsUrl ? googleHint() : ''}${sheetRecHTML()}`;
}
function sheetRefresh() { const c = $('#sheet-card'); if (c) c.innerHTML = sheetCardHTML(); }
ACT['sheet-import'] = () => sheetImport({ silent: false });
