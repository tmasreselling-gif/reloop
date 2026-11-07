/* RELOOP – Gmail-Abgleich: Verkaufs-Mails (z. B. „Dein Artikel wurde gekauft!“) automatisch ins Inventar übernehmen */
'use strict';

const GMAIL = 'Gmail';
const MAIL_BASE = '(from:vinted OR from:ebay OR from:kleinanzeigen) (subject:gekauft OR subject:verkauft)';
S.mail = { state: 'idle', msg: '', pending: [], processed: [], auto: true, enabled: false, since: null, lastCheck: null, loaded: false, timer: null };
const mailRef = () => profileRef().collection('meta').doc('mailsync');

async function mailLoad() {
  try {
    const snap = await mailRef().get();
    if (snap.exists) { const d = clone(snap.data()); /* DB-Daten sind schreibgeschützt → kopieren */ Object.assign(S.mail, { backfillAt: d.backfillAt || 0, pending: d.pending || [], processed: d.processed || [], auto: d.auto !== false, enabled: !!d.enabled, since: d.since || null, lastCheck: d.lastCheck || null, saleKeys: d.saleKeys || [] }); }
  } catch (e) { /* noch nichts gespeichert */ }
  S.mail.loaded = true;
  setTimeout(() => mailRematch(), 1500);
  // läuft immer automatisch: ohne Startzeitpunkt nur neue Verkäufe ab jetzt
  if (!S.mail.since) S.mail.since = Date.now() - 5 * 60 * 1000;
  setTimeout(() => mailCheck({ silent: true }), 2500); mailSchedule();
}
function mailSchedule() {
  clearInterval(S.mail.timer);
  S.mail.timer = setInterval(() => { if (document.visibilityState === 'visible') mailCheck({ silent: true }); }, 10 * 60 * 1000);
}
let mailSaveChain = Promise.resolve();
function mailSave() {
  const M = S.mail;
  const data = { pending: M.pending.slice(0, 300), processed: M.processed.slice(-1500), auto: M.auto, enabled: M.enabled, since: M.since, lastCheck: M.lastCheck, backfillAt: M.backfillAt || 0, saleKeys: (M.saleKeys || []).slice(-300) };
  mailSaveChain = mailSaveChain.then(() => mailRef().set(data)).catch((e) => console.warn('Mail-Status nicht gespeichert', e));
  return mailSaveChain;
}

/* ---- Antwort-Helfer (Gmail-Connector: threads[].messages[] mit id, snippet, subject, sender, date) ---- */
function mailPayload(res) {
  let p = res && (res.payload ?? res.structuredContent ?? res.content);
  if (Array.isArray(p) && p.length && p[0] && typeof p[0].text === 'string') { try { p = JSON.parse(p.map((c) => c.text || '').join('')); } catch (e) { /* bleibt */ } }
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { /* bleibt */ } }
  return p || {};
}
function findArr(o, key, d = 0) {
  if (!o || typeof o !== 'object' || d > 5) return null;
  if (Array.isArray(o[key])) return o[key];
  for (const v of Object.values(o)) { const r = findArr(v, key, d + 1); if (r) return r; }
  return null;
}
function mailTime(m) {
  if (m.internalDate && /^\d{12,}$/.test(String(m.internalDate))) return +m.internalDate;
  const t = Date.parse(m.date || ''); return isNaN(t) ? Date.now() : t;
}
const dayStr = (ts) => { const d = new Date(ts); return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`; };

const MAIL_ERR = {
  server_not_connected: 'Gmail ist noch nicht verbunden – klicke auf „Mit Google verbinden“.',
  needs_reauth: 'Die Google-Anmeldung ist abgelaufen – klicke auf „Mit Google verbinden“.',
  no_client_id: 'Google ist noch nicht eingerichtet (Einstellungen → Google).',
  popup_closed: 'Google-Anmeldung abgebrochen.',
  not_in_manifest: 'Der Gmail-Zugriff wurde für diese App nicht erlaubt. Klicke erneut auf „Jetzt prüfen“, um gefragt zu werden.',
  approval_required: 'Gmail-Zugriff braucht deine Zustimmung – klicke auf „Jetzt prüfen“ und erlaube den Zugriff.',
  blocked_by_policy: 'Google verweigert den Zugriff – ist die Gmail API im Google-Cloud-Projekt aktiviert und bist du als Testnutzer eingetragen?',
  server_unavailable: 'Gmail ist gerade nicht erreichbar. Später erneut versuchen.',
};
const mailErr = (e) => MAIL_ERR[e && e.code] || ('Gmail-Abfrage fehlgeschlagen: ' + ((e && (e.message || e.code)) || 'unbekannter Fehler'));

/** Beim ersten Abgleich fragen, ab wann Verkaufs-Mails übernommen werden sollen */
async function mailAskSince() {
  const r = await modal({
    title: 'Ab wann sollen Verkäufe übernommen werden?',
    body: `<p class="muted small" style="margin:0 0 12px">Ältere Verkäufe hast du evtl. schon eingetragen. Wähle, ab wann RELOOP Verkaufs-Mails aus Gmail berücksichtigen soll. Nichts wird ohne Zuordnung doppelt angelegt – unklare Fälle landen zum Bestätigen in der Liste.</p>
      <select class="in" name="since"><option value="0">Nur neue Verkäufe ab jetzt</option><option value="7">Letzte 7 Tage</option><option value="30">Letzte 30 Tage</option><option value="90">Letzte 90 Tage</option></select>`,
    actions: [{ label: 'Abbrechen', value: false, kind: 'ghost' }, { label: 'Abgleich starten', value: true, kind: 'primary' }],
  });
  if (!r || !r.value) return false;
  const days = +r.vals.since || 0;
  S.mail.since = days ? new Date(new Date().setHours(0, 0, 0, 0) - (days - 1) * 864e5).getTime() : Date.now() - 5 * 60 * 1000;
  return true;
}

/** Alle Nachrichten zu einer Suche einsammeln (Suche liefert max. 5 je Unterhaltung → bei mehr den ganzen Thread laden) */
async function mailCollect(mcp, query, maxPages = 6, onPage) {
  const threads = []; let token = '';
  for (let page = 0; page < maxPages; page++) {
    const args = { query, pageSize: 50, view: 'THREAD_VIEW_MINIMAL' }; if (token) args.pageToken = token;
    const p = mailPayload(await mcp.callTool(GMAIL, 'search_threads', args, { cache: false }));
    threads.push(...(findArr(p, 'threads') || []));
    if (onPage) onPage(threads.length);
    token = p.nextPageToken || ''; if (!token) break;
  }
  const msgs = [];
  for (const t of threads) {
    let list = Array.isArray(t.messages) ? t.messages : [];
    if (t.id && ((t.messageCount || 0) > list.length || list.length >= 5)) {
      try { list = findArr(mailPayload(await mcp.callTool(GMAIL, 'get_thread', { threadId: t.id, messageFormat: 'MINIMAL' }, { cache: false })), 'messages') || list; } catch (e) { if (!(e && e.code === 'tool_error')) throw e; }
    }
    for (const m of list) if (m && m.id) msgs.push({ ...m, threadId: t.id, ts: mailTime(m) });
  }
  return msgs;
}

/* ---- Verkaufsdaten für importierte Altverkäufe aus Vinted-Mails nachtragen ---- */
const undated = () => S.items.filter((i) => i.status === 'Verkauft' && !i.saleDate);
async function backfillSaleDates({ silent = false } = {}) {
  const M = S.mail;
  if (M.state === 'running' || !undated().length) return;
  const mcp = await claude.use('mcp').catch(() => null);
  if (!mcp) { if (!silent) toast('Gmail ist in dieser Ansicht nicht verfügbar.', 'bad'); return; }
  M.state = 'running'; M.msg = 'Suche Verkaufsdaten in Vinted-Mails…'; mailRefresh();
  try {
    const since = 'after:2025/01/01';
    const qs = [`from:vinted subject:gekauft ${since}`, `from:vinted subject:Versandschein ${since}`, `from:vinted subject:"Transaktion wurde abgeschlossen" ${since}`];
    const msgs = [];
    for (const [k, q] of qs.entries()) msgs.push(...await mailCollect(mcp, q, 15, (n) => { M.msg = `Lese Vinted-Mails (${k + 1}/3, ${n} Unterhaltungen)…`; mailRefresh(); }));
    const seen = new Set(); const events = [];
    for (const m of msgs) { if (seen.has(m.id)) continue; seen.add(m.id); const e = RL.parseVintedEvent(m); if (e) events.push(e); }
    const before = undated().length;
    const res = RL.matchSaleDates(S.items, events);
    for (const [k, r] of res.entries()) {
      if (k % 10 === 0) { M.msg = `Trage Verkaufsdaten ein (${k + 1}/${res.length})…`; mailRefresh(); }
      const it = itemById(r.id); if (!it) continue;
      await patchItem(r.id, { saleDate: r.saleDate, saleDateSource: r.source, ...(r.price && !RL.n0(it.salePrice) ? { salePrice: r.price } : {}) }, { immediate: true });
    }
    M.state = 'idle';
    const left = before - res.length;
    M.msg = `Verkaufsdaten nachgetragen: ${res.length} von ${before} Verkäufen${left ? ` · ${left} ohne passende Mail (Datum bei Bedarf im Artikel unter „Verkauf“ eintragen)` : ''}.`;
    M.backfillAt = Date.now(); await mailSave();
    toast(`${res.length} Verkaufsdaten aus Gmail nachgetragen`);
  } catch (e) {
    console.warn('Backfill', e); M.state = 'error'; M.msg = mailErr(e); if (!silent) toast(M.msg, 'bad');
  }
  mailRefresh(); if (S.view === 'uebersicht' || S.view === 'statistik' || S.view === 'verkaeufe') render();
}
ACT['mail-backfill'] = () => backfillSaleDates({ silent: false });

/** Offene Vorschläge neu zuordnen (z. B. nachdem Artikel aus der Tabelle dazugekommen sind) */
async function mailRematch() {
  const M = S.mail; if (!M.pending.length || !S.items.length) return;
  let linked = 0, changed = false;
  for (const p of M.pending.slice()) {
    if (p.bundle || p.picked) continue; // Paket oder von Hand gewählt → nicht überschreiben
    const m = RL.bestMatches(p.title, RL.forAccount(S.items, p.account), 2, true); const best = m[0], second = m[1];
    if (best && best.score >= 0.95 && (best.item.status === 'Verkauft' || M.auto) && (!second || second.score < best.score || second.item.status === 'Verkauft')) {
      try { await applyMailSale({ ...p, itemId: best.item.id }); M.pending.splice(M.pending.indexOf(p), 1); linked++; continue; } catch (e) { console.warn(e); }
    }
    if (best && (best.item.id !== p.itemId || best.score !== p.score) && (!p.itemId || best.score > (p.score || 0))) { p.itemId = best.item.id; p.score = best.score; changed = true; }
  }
  if (linked || changed) { await mailSave(); mailRefresh(); buildNav(); }
  if (linked) toast(`${linked} Gmail-Verkäufe automatisch dem passenden Artikel zugeordnet`);
  bundleLookup();
}
/** Paketverkäufe: enthaltene Artikel über Folge-Mails des Käufers finden („Bestellstatus von …“, „Versandschein für …“) */
async function bundleLookup() {
  const list = S.mail.pending.filter((p) => p.bundle && p.buyer && !p.hintsAt);
  if (!list.length) return;
  const mcp = await claude.use('mcp').catch(() => null); if (!mcp) return;
  let changed = false;
  for (const p of list) {
    try {
      const msgs = await mailCollect(mcp, `from:vinted "${p.buyer}"`, 1);
      const titles = RL.bundleHints(p.buyer, msgs);
      const ids = (p.itemIds || []).filter(Boolean);
      for (const t of titles) {
        const ms = RL.bestMatches(t, S.items.filter((i) => !ids.includes(i.id) && !(i.status === 'Verkauft' && i.mailMid)), 5, true);
        const m = ms.filter((x) => x.score === (ms[0] && ms[0].score)).sort((x, y) => (x.item.status === 'Verkauft') - (y.item.status === 'Verkauft'))[0];
        if (m && m.score >= 0.75) ids.push(m.item.id);
      }
      p.hints = titles; p.itemIds = ids.slice(0, Math.max(p.bundle, ids.length)); p.itemId = ids[0] || ''; p.hintsAt = Date.now(); changed = true;
    } catch (e) { console.warn('Paket-Suche', e); if (e && (e.code === 'needs_reauth' || e.code === 'server_not_connected')) break; }
  }
  if (changed) { await mailSave(); mailRefresh(); }
}
/** Paketverkauf auf mehrere Artikel eintragen: Preis anteilig, Versand nur einmal */
async function applyBundleSale(p, ids) {
  const items = ids.map(itemById).filter(Boolean);
  const prices = RL.splitBundlePrice(p.price, items);
  for (const [k, it] of items.entries()) await applyMailSale({ ...p, itemId: it.id, price: prices[k], noShip: k > 0, bundleOf: p.mid });
}

async function mailCheck({ silent = false } = {}) {
  const M = S.mail;
  if (M.state === 'running') return;
  if (!M.since) { if (silent) return; if (!(await mailAskSince())) return; }
  const mcp = await claude.use('mcp').catch(() => null);
  if (!mcp) { M.state = 'error'; M.msg = 'Gmail-Anbindung ist nicht verfügbar.'; mailRefresh(); return; }
  M.state = 'running'; M.msg = 'Suche nach Verkaufs-Mails…'; mailRefresh();
  let added = 0, autoSold = 0, seen = 0, linked = 0;
  try {
    // Suche ab dem gewählten Zeitpunkt (bzw. 2 Tage vor dem letzten Abgleich)
    const from = Math.max(M.since, (M.lastCheck || 0) - 2 * 864e5);
    const query = `${MAIL_BASE} after:${dayStr(from)}`;
    const msgs = await mailCollect(mcp, query, 6);
    M.enabled = true;
    const textCache = {};
    const done = new Set(M.processed);
    const fresh = msgs.filter((m) => !done.has(m.id) && m.ts >= M.since).sort((a, b) => a.ts - b.ts);
    const uniq = []; const ids = new Set(); for (const m of fresh) if (!ids.has(m.id)) { ids.add(m.id); uniq.push(m); }
    for (const [k, m] of uniq.entries()) {
      if (k % 10 === 0) { M.msg = `Werte Mail ${k + 1} von ${uniq.length} aus…`; mailRefresh(); }
      const subject = m.subject || ''; const from = m.sender || m.from || '';
      let sale = RL.parseSaleMail(m.snippet || '', subject, from);
      if (sale && (sale.needsAi || !sale.title) && m.threadId) { // Snippet reicht nicht → Volltext
        try {
          if (!textCache[m.threadId]) textCache[m.threadId] = findArr(mailPayload(await mcp.callTool(GMAIL, 'get_thread', { threadId: m.threadId, messageFormat: 'PLAIN_TEXT' }, { cache: false })), 'messages') || [];
          const full = textCache[m.threadId].find((x) => x.id === m.id);
          if (full) sale = RL.parseSaleMail(full.plaintextBody || full.snippet || '', subject, from) || sale;
        } catch (e) { if (!(e && e.code === 'tool_error')) throw e; }
      }
      if (sale && sale.needsAi && aiAvailable()) {
        try {
          const j = await S.sample.json(`Ist das eine Benachrichtigung über einen Verkauf eines Artikels (Vinted, eBay, Kleinanzeigen)? Extrahiere Artikeltitel und Verkaufspreis.\nBetreff: ${subject}\nText:\n${RL.htmlToText(m.snippet || '').slice(0, 3000)}\nAntworte NUR mit JSON: {"isSale":true,"platform":"Vinted|eBay|Kleinanzeigen|Sonstiges","title":"","price":0}`, { modelTier: 'quick' });
          if (j && j.isSale && j.title) sale = { platform: j.platform || sale.platform, title: String(j.title), price: RL.num(j.price), buyer: '', needsAi: false, bundle: 0 };
        } catch (e) { /* bleibt unvollständig */ }
      }
      M.processed.push(m.id); seen++;
      if (!sale || !sale.title) continue;
      const date = RL.isoDate(new Date(m.ts));
      // Vinted schickt „gekauft“ manchmal doppelt (gleicher Käufer, Artikel, Preis) → nur einmal zählen
      const saleKey = [sale.buyer, RL.normTitle(sale.title), RL.n0(sale.price)].join('|');
      M.saleKeys = (M.saleKeys || []).filter((x) => m.ts - x.ts < 3 * 864e5 && x.ts <= m.ts + 864e5);
      if (sale.buyer && M.saleKeys.some((x) => x.k === saleKey)) continue;
      M.saleKeys.push({ k: saleKey, ts: m.ts });
      // schon von Hand eingetragen? (verkaufter Artikel mit gleichem Titel, Verkaufsdatum ±3 Tage)
      const near = (i) => i.saleDate && Math.abs(Date.parse(i.saleDate) - Date.parse(date)) <= 3 * 864e5;
      if (S.items.some((i) => i.status === 'Verkauft' && i.mailMid !== m.id && near(i) && RL.matchScore(sale.title, i) >= 0.8)) continue;
      if (S.items.some((i) => i.mailMid === m.id)) continue;
      if (sale.account) noteAccount(sale.account);
      const matches = sale.bundle ? [] : RL.bestMatches(sale.title, RL.forAccount(S.items, sale.account), 5, true);
      const best = matches[0]; const second = matches[1];
      // exakt gleicher Titel bei bereits verkauftem Artikel (z. B. aus der Tabelle) → nur verknüpfen
      if (best && best.score >= 0.95 && (best.item.status === 'Verkauft' || M.auto) && (!second || second.score < best.score || second.item.status === 'Verkauft')) { await applyMailSale({ ...sale, date, mid: m.id, itemId: best.item.id }); linked++; continue; }
      // nur ähnlicher Name → nie automatisch verkaufen (falscher Artikel = falscher Umsatz), sondern zum Prüfen vorlegen
      M.pending.unshift({ mid: m.id, account: sale.account || '', title: sale.title, price: sale.price, platform: sale.platform, buyer: sale.buyer || '', bundle: sale.bundle || 0, date, itemId: best ? best.item.id : '', score: best ? best.score : 0 });
      added++;
    }
    M.lastCheck = Date.now(); M.state = 'idle';
    M.msg = autoSold || added || linked ? `${autoSold ? autoSold + ' Verkauf/Verkäufe automatisch eingetragen. ' : ''}${linked ? linked + ' mit bereits verkauften Artikeln verknüpft. ' : ''}${added ? added + ' zum Prüfen.' : ''}` : (seen ? 'Keine neuen Verkäufe.' : 'Keine neuen Verkaufs-Mails.');
    await mailSave();
    if (!silent || autoSold || added) toast(autoSold || added ? `Gmail: ${autoSold ? autoSold + ' Verkauf(e) eingetragen' : ''}${autoSold && added ? ', ' : ''}${added ? added + ' zum Prüfen' : ''}` : 'Gmail: keine neuen Verkäufe');
    if (!M.timer) mailSchedule();
    if (added) bundleLookup();
  } catch (e) {
    console.warn('Gmail', e);
    M.state = 'error'; M.msg = mailErr(e);
    if (!silent) toast(M.msg, 'bad');
  }
  mailRefresh(); buildNav();
}

const saleFields = (s, ch, price) => ({
  status: 'Verkauft', salePrice: price, saleDate: s.date || RL.today(), channel: ch,
  shipStatus: Date.now() - Date.parse(s.date || RL.today()) > 5 * 864e5 ? 'versendet' : 'offen',
  saleFees: RL.platformFee(S.settings, ch, price), saleShipping: s.noShip ? 0 : RL.sellerShipping(S.settings), soldVia: 'gmail', mailMid: s.mid || null,
  ...(s.bundleOf ? { bundleOf: s.bundleOf } : {}),
  ...(s.account ? { account: s.account } : {}),
});
/** neues Vinted-Konto aus einer Mail merken (Einstellungen → Vinted-Konten) */
function noteAccount(name) {
  const list = S.settings.vintedAccounts || [];
  if (name && !list.includes(name)) saveSettings({ vintedAccounts: [...list, name] });
}
async function applyMailSale(s) {
  const it = itemById(s.itemId); if (!it) throw new Error('Artikel nicht gefunden');
  if (it.status === 'Verkauft') { // schon verkauft (z. B. aus der Tabelle) → nur Mail verknüpfen und fehlende Daten ergänzen
    const patch = { mailMid: s.mid || it.mailMid || null };
    if (!it.saleDate && s.date) { patch.saleDate = s.date; patch.saleDateSource = 'gekauft'; }
    if (s.account && !it.account) patch.account = s.account;
    // Preis aus der Mail nur, wenn der Artikel nicht aus der Tabelle kommt (dort ist der VK maßgeblich)
    if (!it.sheetKey && !RL.n0(it.salePrice) && RL.n0(s.price) > 0) patch.salePrice = RL.n0(s.price);
    await patchItem(it.id, patch, { immediate: true }); return;
  }
  const ch = RL.CHANNELS.includes(s.platform) ? s.platform : (it.channel || 'Vinted');
  const price = RL.n0(s.price) > 0 ? RL.n0(s.price) : RL.n0(it.listPrice);
  await patchItem(it.id, { ...saleFields(s, ch, price), onlineSince: it.onlineSince || it.purchaseDate || RL.today() }, { immediate: true });
}
/** Verkauf ohne passenden Artikel: als verkauften Artikel neu anlegen */
async function createFromMail(p) {
  const parts = String(p.title).split('|').map((x) => x.trim()).filter(Boolean);
  let size = '', color = ''; const rest = [];
  for (const x of parts.slice(1)) { const g = x.match(/^Gr(?:ö|oe)(?:ß|ss)e\s+(.+)$/i); if (g) size = g[1]; else if (!color) color = x; else rest.push(x); }
  const ch = RL.CHANNELS.includes(p.platform) ? p.platform : 'Vinted';
  const price = RL.n0(p.price);
  const title = p.bundle ? `Paket (${p.bundle} Artikel)` : [parts[0], ...rest].join(' · ');
  return createItem({
    title, size, color, stockNo: '', purchaseDate: p.date, onlineSince: p.date, listPrice: price || null,
    notes: `Aus Gmail importiert${p.buyer ? ' · Käufer ' + p.buyer : ''}${p.bundle ? ' · Paketverkauf – Einkaufspreise der enthaltenen Artikel ggf. ergänzen' : ''}`,
    ...saleFields(p, ch, price),
  });
}

/* ---- UI-Karte (in „Verkäufe“) ---- */
function mailCardHTML() {
  const M = S.mail;
  // schon bei einem anderen Vorschlag gewählte Artikel nicht nochmal anbieten
  const taken = new Set(M.pending.flatMap((x) => x.bundle ? (x.itemIds || []) : [x.itemId]).filter(Boolean));
  const opts = (p, sel = p.itemId) => {
    const cand = RL.forAccount(S.items, p.account).filter((i) => (i.status !== 'Verkauft' || !i.mailMid || i.id === sel) && (i.id === sel || !taken.has(i.id))).map((i) => ({ i, sc: RL.matchScore(p.title, i) })).sort((a, b) => b.sc - a.sc || displayTitle(a.i).localeCompare(displayTitle(b.i)));
    const label = (x) => `${esc(displayTitle(x.i))} · ${esc(x.i.stockNo || x.i.sku)}`;
    return `<option value="">– Artikel wählen –</option>` + cand.map((x) => `<option value="${x.i.id}" ${x.i.id === sel ? 'selected' : ''}>${label(x)}</option>`).join('');
  };
  const noMatch = M.pending.filter((p) => !p.itemId && !p.bundle).length;
  const selStyle = 'width:auto;max-width:280px;height:34px';
  const bundleSel = (p, k) => {
    const n = Math.max(p.bundle, (p.itemIds || []).length, p.slots || 0);
    return `<div style="display:flex;flex-direction:column;gap:6px;flex-basis:100%;margin-top:4px">
      <div class="tiny muted">Welche Artikel waren im Paket? ${p.hints && p.hints.length ? `Aus Folge-Mails erkannt: ${p.hints.map(esc).join(', ')}` : p.hintsAt ? 'In den Folge-Mails stand kein Artikelname – bitte auswählen.' : ''}</div>
      ${Array.from({ length: n }, (_, j) => `<div class="row" style="gap:6px"><span class="tiny muted" style="width:62px">Artikel ${j + 1}</span><select class="in" style="width:min(100%,460px);height:34px" id="mail-sel-${k}-${j}" data-mailsel data-k="${k}" data-j="${j}">${opts(p, (p.itemIds || [])[j] || '')}</select></div>`).join('')}
      <div><button class="btn sm ghost" data-act="mail-add-slot" data-k="${k}">+ weiterer Artikel</button></div></div>`;
  };
  // Abgleich läuft automatisch – die Karte erscheint nur, wenn etwas zu bestätigen ist oder Gmail einen Fehler meldet
  const G = window.GoogleBridge; const needLogin = !!(G && G.clientId() && !G.connected());
  const err = M.state === 'error' && (M.enabled || (G && G.clientId())) && !needLogin;
  if (!M.pending.length && !err && !needLogin) return '';
  return `<div class="card" style="margin-bottom:16px"><h2 style="margin:0">📧 Gmail-Verkäufe</h2>
    ${needLogin ? googleHint() : ''}
    ${err ? `<div class="note warn small" style="margin-top:10px">${esc(M.msg)}</div>` : ''}
    ${M.pending.length ? `<div class="row between" style="margin:12px 0 8px;flex-wrap:wrap;gap:8px"><h3 style="margin:0">Zu bestätigen (${M.pending.length})</h3><div class="row" style="gap:6px">${noMatch ? `<button class="btn sm" data-act="mail-create-all">Alle ohne Treffer neu anlegen (${noMatch})</button>` : ''}<button class="btn sm ghost" data-act="mail-skip-all">Alle ignorieren</button></div></div>
      ${M.pending.map((p, k) => `<div class="proposal" style="flex-wrap:wrap;margin-bottom:8px"><div style="flex:1;min-width:220px"><b>${p.bundle ? `Paketverkauf (${p.bundle} Artikel)` : esc(p.title)}</b><div class="tiny muted">${esc(p.platform)}${p.account && RL.vintedAccounts(S.items, S.settings).length > 1 ? ' · Konto ' + esc(p.account) : ''} · ${fmtDate(p.date)}${p.buyer ? ' · Käufer ' + esc(p.buyer) : ''} · ${p.price ? eur(p.price) : 'Preis unbekannt'}${p.bundle ? ` · ${(p.itemIds || []).filter(Boolean).length} von ${p.bundle} Artikeln gewählt` : p.itemId ? '' : ' · kein passender Artikel im Inventar'}</div></div>
      ${p.bundle ? '' : `<select class="in" style="${selStyle}" id="mail-sel-${k}" data-mailsel data-k="${k}">${opts(p)}</select>`}
      <button class="btn sm primary" data-act="mail-apply" data-k="${k}">Als verkauft</button><button class="btn sm" data-act="mail-create" data-k="${k}">Neu anlegen</button><button class="btn sm ghost" data-act="mail-skip" data-k="${k}">Ignorieren</button>${p.bundle ? bundleSel(p, k) : ''}</div>`).join('')}` : ''}</div>`;
}
function mailRefresh() { const c = $('#mail-card'); if (c) c.innerHTML = mailCardHTML(); }
ACT['mail-check'] = () => mailCheck({ silent: false });
ACT['mail-since'] = async () => { if (await mailAskSince()) { S.mail.lastCheck = null; await mailSave(); mailCheck({ silent: false }); } };
ACT['mail-apply'] = async (el) => {
  const k = +el.dataset.k; const p = S.mail.pending[k]; if (!p) return;
  if (p.bundle) {
    const ids = [...new Set($$(`[id^="mail-sel-${k}-"]`).map((s) => s.value).filter(Boolean))];
    if (!ids.length) { toast('Bitte die Artikel aus dem Paket wählen – oder „Neu anlegen“.', 'bad'); return; }
    if (ids.length < p.bundle && !(await confirmDialog('Paket unvollständig', `Das Paket enthält ${p.bundle} Artikel, gewählt sind ${ids.length}. Trotzdem so eintragen? Der Paketpreis (${eur(p.price)}) wird auf die gewählten Artikel aufgeteilt.`, 'Eintragen'))) return;
    try { await applyBundleSale(p, ids); S.mail.pending.splice(S.mail.pending.indexOf(p), 1); await mailSave(); toast(`Paketverkauf auf ${ids.length} Artikel eingetragen`); render(); }
    catch (e) { toast('Eintragen fehlgeschlagen: ' + (e.message || dbMsg(e)), 'bad'); }
    return;
  }
  const id = $('#mail-sel-' + k).value;
  if (!id) { toast('Bitte den passenden Artikel wählen – oder „Neu anlegen“.', 'bad'); return; }
  try { await applyMailSale({ ...p, itemId: id }); S.mail.pending.splice(k, 1); await mailSave(); toast('Verkauf eingetragen'); render(); }
  catch (e) { toast('Eintragen fehlgeschlagen: ' + (e.message || dbMsg(e)), 'bad'); }
};
/** Auswahl sofort merken → in allen anderen Listen ausblenden */
function mailSelChange(el) {
  const p = S.mail.pending[+el.dataset.k]; if (!p) return;
  p.picked = true;
  if (el.dataset.j !== undefined) {
    const ids = $$(`[id^="mail-sel-${el.dataset.k}-"]`).map((s) => s.value);
    p.itemIds = ids; p.slots = Math.max(p.slots || 0, ids.length); p.itemId = ids.find(Boolean) || '';
  } else { p.itemId = el.value; p.score = el.value ? RL.matchScore(p.title, itemById(el.value) || {}) : 0; }
  mailSave(); mailRefresh();
}
ACT['mail-add-slot'] = (el) => {
  const k = +el.dataset.k; const p = S.mail.pending[k]; if (!p) return;
  p.itemIds = $$(`[id^="mail-sel-${k}-"]`).map((s) => s.value); p.slots = p.itemIds.length + 1; mailRefresh();
};
ACT['mail-create'] = async (el) => {
  const k = +el.dataset.k; const p = S.mail.pending[k]; if (!p) return;
  try { await createFromMail(p); S.mail.pending.splice(k, 1); await mailSave(); toast('Als verkaufter Artikel angelegt'); render(); }
  catch (e) { toast('Anlegen fehlgeschlagen: ' + (e.message || dbMsg(e)), 'bad'); }
};
ACT['mail-create-all'] = async () => {
  const list = S.mail.pending.filter((p) => !p.itemId && !p.bundle);
  if (!(await confirmDialog('Neu anlegen', `${list.length} Verkäufe ohne passenden Artikel als verkaufte Artikel anlegen? Einkaufspreise kannst du danach ergänzen.`, 'Anlegen'))) return;
  let n = 0;
  for (const p of list) { try { await createFromMail(p); S.mail.pending.splice(S.mail.pending.indexOf(p), 1); n++; } catch (e) { console.warn(e); } }
  await mailSave(); toast(`${n} Verkäufe angelegt`); render();
};
ACT['mail-skip'] = async (el) => { S.mail.pending.splice(+el.dataset.k, 1); await mailSave(); mailRefresh(); buildNav(); };
ACT['mail-skip-all'] = async () => { if (!(await confirmDialog('Alle ignorieren', `${S.mail.pending.length} Vorschläge verwerfen?`, 'Ignorieren'))) return; S.mail.pending = []; await mailSave(); mailRefresh(); buildNav(); };
