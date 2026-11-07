/* RELOOP – Ausgaben erfassen (Verpackung, Versand, Werbung, Fahrten …) */
'use strict';

S.exp = S.exp || { month: 'alle', cat: 'alle', receipt: null };
const expMonths = () => [...new Set(S.expenses.map((e) => String(e.date || '').slice(0, 7)).filter(Boolean))].sort().reverse();
const monthName = (m) => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }); };
function expFiltered() { return S.expenses.filter((e) => (S.exp.month === 'alle' || String(e.date || '').startsWith(S.exp.month)) && (S.exp.cat === 'alle' || RL.expenseCat(e.category) === S.exp.cat)); }
const sumAmt = (l) => RL.r2(l.reduce((a, e) => a + RL.n0(e.amount), 0));

VIEW_RENDER.ausgaben = () => {
  const now = RL.today(); const m = now.slice(0, 7), y = now.slice(0, 4);
  const thisMonth = S.expenses.filter((e) => String(e.date || '').startsWith(m));
  const thisYear = S.expenses.filter((e) => String(e.date || '').startsWith(y));
  const list = expFiltered();
  const byCat = RL.EXPENSE_CATS.map((c) => ({ c, v: sumAmt(list.filter((e) => RL.expenseCat(e.category) === c)) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const maxCat = Math.max(1, ...byCat.map((x) => x.v));
  return pageHead('Ausgaben', 'Alle Ausgaben inkl. Wareneinkauf. Für den Nettogewinn zählen nur Kosten ohne „Ware“ (Verpackung, Abos, Sonstiges) – der Wareneinkauf steckt schon im Einkaufspreis der Artikel und würde sonst doppelt abgezogen.', `<button class="btn" data-act="exp-csv">${icon('download')}CSV-Export</button>`) + `
  <div class="grid g3">
    ${kpiCard('Diesen Monat', eur(sumAmt(thisMonth)), `${thisMonth.length} Ausgabe${thisMonth.length === 1 ? '' : 'n'}`)}
    ${kpiCard('Dieses Jahr', eur(sumAmt(thisYear)), `${thisYear.length} Ausgabe${thisYear.length === 1 ? '' : 'n'}`)}
    ${kpiCard('Gesamt', eur(sumAmt(S.expenses)))}
  </div>
  ${(() => { const d = RL.expenseDupes(S.expenses); return d.length ? `<div class="card" style="margin-top:16px;border-color:color-mix(in srgb,var(--warn) 40%,var(--line))"><div class="row between"><h2 style="margin:0">⚠ Mögliche doppelte Ausgaben (${d.length})</h2><button class="btn sm primary" data-act="exp-merge-all">Alle zusammenführen</button></div>
    <p class="sub" style="margin:8px 0 10px">Gleicher Betrag – z. B. einmal per Beleg erfasst und einmal aus Google Sheets übernommen. Beim Zusammenführen bleibt der Eintrag mit Beleg, Datum/Person/Rechnungslink aus der Tabelle werden übernommen.</p>
    ${d.map((x, k) => `<div class="proposal" style="flex-wrap:wrap;margin-bottom:8px"><div style="flex:1;min-width:220px"><b>${eur(x.keep.amount)}</b> · ${esc(x.keep.note || x.keep.category)} <span class="muted">(${x.keep.date ? fmtDate(x.keep.date) : 'ohne Datum'}${x.keep.receipt ? ', mit Beleg' : ''})</span><div class="tiny muted">doppelt: ${esc(x.drop.note || x.drop.category)} (${x.drop.date ? fmtDate(x.drop.date) : 'ohne Datum'}${x.drop.sheetKey ? ', aus Tabelle' : ''})</div></div>
      <button class="btn sm primary" data-act="exp-merge" data-k="${k}">Zusammenführen</button><button class="btn sm ghost" data-act="exp-notdup" data-k="${k}">Sind verschiedene</button></div>`).join('')}</div>` : ''; })()}
  <div class="grid g-main" style="margin-top:16px">
    <div class="card" id="ex-card"><h2>Neue Ausgabe</h2>
      <div class="drop" id="ex-drop" data-act="ex-pick-docs" style="padding:18px 14px;margin-bottom:14px">
        <div style="font-size:26px">📄</div><b>PDF-Rechnungen oder Beleg-Fotos hierher ziehen</b>
        <div class="small muted">oder klicken · mehrere auf einmal möglich · Betrag, Datum, Händler & Kategorie werden automatisch ausgelesen</div></div>
      <input type="file" id="ex-docs" accept="application/pdf,.pdf,image/*" multiple hidden>
      <div id="ex-drafts">${draftsHTML()}</div>
      <div class="row" style="justify-content:space-between"><button class="btn sm ghost" data-act="exp-manual">+ Ausgabe ohne Beleg eintragen</button><span class="tiny muted">Wareneinkauf für konkrete Artikel besser beim Artikel bzw. per „EK aufteilen“ eintragen.</span></div>
    </div>
    <div class="card"><h2>Nach Kategorie <span class="muted small">${S.exp.month === 'alle' ? 'gesamt' : esc(monthName(S.exp.month))}</span></h2>
      ${byCat.length ? byCat.map((x) => `<div style="margin:8px 0"><div class="row between small"><span>${esc(x.c)}</span><b>${eur(x.v)}</b></div><div style="height:8px;border-radius:6px;background:var(--line-2);margin-top:4px"><div style="height:100%;width:${Math.round(x.v / maxCat * 100)}%;background:var(--accent);border-radius:6px"></div></div></div>`).join('') : '<p class="small muted">Noch keine Ausgaben.</p>'}
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="row between" style="margin-bottom:10px"><h2 style="margin:0">Alle Ausgaben <span class="muted small">(${list.length} · ${eur(sumAmt(list))})</span></h2>
      <div class="row">${sel('m', [['alle', 'Alle Monate'], ...expMonths().map((x) => [x, monthName(x)])], S.exp.month, 'id="ex-f-month" style="width:auto"')}${sel('c', [['alle', 'Alle Kategorien'], ...RL.EXPENSE_CATS], S.exp.cat, 'id="ex-f-cat" style="width:auto"')}</div></div>
    ${list.length ? `<div class="stack" style="gap:0">${list.map((e) => { const it = e.itemId ? itemById(e.itemId) : null; return `<div class="list-row">
      ${e.receipt ? `<button class="link" data-act="exp-view" data-id="${e.id}" title="Beleg ansehen"><img class="thumb" src="${esc(e.receipt.thumb || imgSrc(e.receipt))}" alt="" style="background:#fff">${e.receipt.kind === 'pdf' ? '<span class="tiny mono" style="position:relative;top:-18px;left:4px;background:var(--ink);color:var(--bg);border-radius:4px;padding:0 3px">PDF</span>' : ''}</button>` : `<div class="thumb ph">${icon('expense')}</div>`}
      <div class="grow"><div class="ellipsis"><b>${esc(e.note || e.category)}</b></div><div class="tiny muted">${e.date ? fmtDate(e.date) : '<span style="color:var(--warn)">ohne Datum</span>'} · <span class="chip" style="height:20px">${esc(RL.expenseCat(e.category))}</span>${e.vendor ? ' · ' + esc(e.vendor) : ''}${e.qty > 1 ? ' · ' + e.qty + ' Stk.' : ''}${e.owner ? ' · 👤 ' + esc(e.owner) : ''}${e.receiptUrl ? ` · <a href="${esc(e.receiptUrl)}" target="_blank" rel="noopener">📎 Rechnung</a>` : ''}${it ? ` · <button class="link tiny" data-act="open-item" data-id="${it.id}">${esc(it.sku)}</button>` : e.itemSku ? ' · ' + esc(e.itemSku) : ''}</div></div>
      <b class="num">${eur(e.amount)}</b>
      <button class="btn sm ghost" data-act="exp-edit" data-id="${e.id}" title="Bearbeiten">✎</button><button class="btn sm ghost" data-act="exp-del" data-id="${e.id}" title="Löschen">${icon('trash')}</button></div>`; }).join('')}</div>` : '<div class="empty"><h3>Keine Ausgaben</h3><p>Trag oben deine erste Ausgabe ein.</p></div>'}
  </div>`;
};
AFTER.ausgaben = () => {
  const card = $('#ex-card'), drop = $('#ex-drop'), docs = $('#ex-docs');
  docs.addEventListener('change', () => { if (docs.files.length) addReceiptDocs([...docs.files]); docs.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => card.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => card.addEventListener(ev, (e) => { if (ev === 'dragleave' && card.contains(e.relatedTarget)) return; e.preventDefault(); drop.classList.remove('over'); }));
  card.addEventListener('drop', (e) => { const f = [...(e.dataTransfer.files || [])]; if (f.length) addReceiptDocs(f); });
  $('#ex-f-month').addEventListener('change', (e) => { S.exp.month = e.target.value; render(); });
  $('#ex-f-cat').addEventListener('change', (e) => { S.exp.cat = e.target.value; render(); });
};
ACT['ex-pick-docs'] = () => $('#ex-docs').click();

/* ---------- Belege per Drag & Drop auslesen ---------- */
S.exp.drafts = S.exp.drafts || [];
let pdfjsP = null;
function pdfjs() {
  if (!pdfjsP) pdfjsP = import(new URL('lib/pdf.min.mjs', location.href).href).then((m) => { m.GlobalWorkerOptions.workerSrc = new URL('lib/pdf.worker.min.mjs', location.href).href; return m; }).catch((e) => { pdfjsP = null; throw e; });
  return pdfjsP;
}
/** PDF lesen: Text der ersten Seiten + Bild der ersten Seite */
async function readPdf(file) {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  let text = '';
  for (let p = 1; p <= Math.min(doc.numPages, 4); p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    text += tc.items.map((i) => i.str + (i.hasEOL ? '\n' : ' ')).join('') + '\n';
  }
  const page = await doc.getPage(1);
  const vp0 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: Math.min(2.5, 1400 / vp0.width) });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return { text: text.replace(/[ \t]+/g, ' ').trim(), canvas: c, pages: doc.numPages };
}
const RECEIPT_PROMPT = (text) => `Lies diesen Beleg (Rechnung, Quittung oder Bestellbestätigung) eines Resellers aus Deutschland aus.
${text ? 'Text des Belegs:\n<<<\n' + text.slice(0, 12000) + '\n>>>\n' : 'Der Beleg ist als Bild beigefügt.\n'}
Gib den zu zahlenden Endbetrag (brutto, inkl. MwSt. und Versand) in EUR an – nicht Zwischensummen oder Steuerbeträge. Datum = Rechnungs-/Kaufdatum.
Kategorie genau eine aus: "Abos" (Abonnements, Software, Mitgliedschaften, z. B. Vinted Pro, Apps), "Ware" (eingekaufte Kleidung/Posten zum Wiederverkauf), "Verpackung" (Kartons, Versandtaschen, Klebeband, Füllmaterial), "Sonstiges" (alles andere, z. B. Versand, Fahrtkosten, Hochschieben). Beschreibung kurz und konkret (z. B. "50 Versandkartons", "Kiloware Posten 10 kg").
Antworte NUR mit JSON: {"isReceipt":true,"vendor":"","date":"YYYY-MM-DD","total":0,"currency":"EUR","category":"","description":"","invoiceNumber":"","confidence":"hoch|mittel|niedrig"}`;

function draftsHTML() {
  const D = S.exp.drafts; if (!D.length) return '';
  const ready = D.filter((d) => d.status === 'ready');
  return `<div class="row between" style="margin-bottom:8px"><h3 style="margin:0">Aus Belegen erkannt (${D.length})</h3>${ready.length > 1 ? `<button class="btn sm primary" data-act="draft-save-all">Alle ${ready.length} speichern</button>` : ''}</div>
  ${D.map((d) => `<div class="note" style="margin-bottom:10px;display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
    ${d.preview ? `<img src="${d.preview}" alt="" style="width:70px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--line);background:#fff">` : `<div class="thumb ph" style="width:70px;height:90px">PDF</div>`}
    <div style="flex:1;min-width:220px">
      <div class="small"><b>${esc(d.name)}</b>${d.vendor ? ` · ${esc(d.vendor)}` : ''}${d.confidence ? ` · <span class="chip ${d.confidence === 'hoch' ? 'ok' : d.confidence === 'mittel' ? 'warn' : 'bad'}" style="height:20px">Sicherheit ${esc(d.confidence)}</span>` : ''}${d.src === 'regex' ? ' <span class="chip warn" style="height:20px">ohne KI gelesen – bitte prüfen</span>' : ''}</div>
      ${d.status === 'reading' ? '<div class="loading-line small" style="margin-top:8px"><span class="spin"></span>Beleg wird ausgelesen…</div>'
      : d.status === 'error' ? `<div class="small" style="color:var(--bad);margin-top:6px">${esc(d.error)}</div><button class="btn sm ghost" data-act="draft-del" data-k="${d.key}">Entfernen</button>`
      : `<div class="fgrid" style="margin-top:8px">
          <label class="f"><span>Betrag (€)</span><input class="in" type="number" step="0.01" min="0" data-draft="${d.key}" data-k="amount" value="${d.amount ?? ''}"></label>
          <label class="f"><span>Datum</span><input class="in" type="date" data-draft="${d.key}" data-k="date" value="${esc(d.date || '')}"></label>
          <label class="f span2"><span>Kategorie</span>${sel('c', RL.EXPENSE_CATS, d.category, `data-draft="${d.key}" data-k="category"`)}</label>
          <label class="f span4"><span>Beschreibung</span><input class="in" data-draft="${d.key}" data-k="note" value="${esc(d.note || '')}"></label></div>
        ${d.dup ? `<div class="small" style="color:var(--warn);margin-top:6px">⚠ Möglicherweise schon erfasst: ${esc(d.dup)}</div>` : ''}
        <div class="row" style="margin-top:8px"><button class="btn sm primary" data-act="draft-save" data-k="${d.key}">${icon('check')}Speichern</button><button class="btn sm ghost" data-act="draft-del" data-k="${d.key}">Verwerfen</button></div>`}
    </div></div>`).join('')}<hr>`;
}
function draftsRefresh() { const b = $('#ex-drafts'); if (b) b.innerHTML = draftsHTML(); }
document.addEventListener('input', (e) => {
  const el = e.target; if (!(el instanceof HTMLElement) || el.dataset.draft === undefined) return;
  const d = S.exp.drafts.find((x) => x.key === el.dataset.draft); if (!d) return;
  d[el.dataset.k] = el.dataset.k === 'amount' ? RL.num(el.value) : el.value;
});
function findDup(d) {
  const e = S.expenses.find((x) => (d.invoiceNumber && x.invoiceNumber && x.invoiceNumber === d.invoiceNumber) || (RL.n0(x.amount) === RL.n0(d.amount) && x.date === d.date && (!d.vendor || !x.vendor || x.vendor === d.vendor)));
  return e ? `${fmtDate(e.date)} · ${e.note || e.category} · ${eur(e.amount)}` : '';
}
async function addReceiptDocs(files) {
  const ok = files.filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name) || /^image\//.test(f.type));
  if (!ok.length) { toast('Bitte PDF-Dateien oder Fotos von Belegen verwenden.', 'bad'); return; }
  const list = ok.slice(0, 10).map((f) => ({ key: uidGen('d'), name: f.name, file: f, status: 'reading', category: 'Sonstiges', date: RL.today() }));
  S.exp.drafts.push(...list); draftsRefresh();
  for (const d of list) { await readReceipt(d); draftsRefresh(); }
}
async function readReceipt(d) {
  try {
    const isPdf = /pdf$/i.test(d.file.type) || /\.pdf$/i.test(d.name);
    let text = '', canvas;
    if (isPdf) { const r = await readPdf(d.file); text = r.text; canvas = r.canvas; }
    else { canvas = IMG.toCanvas(await IMG.loadBitmap(d.file), 1600); }
    d.preview = IMG.thumb(canvas, 600); d.canvas = canvas; d.isPdf = isPdf;
    let res = null;
    if (aiAvailable()) {
      try {
        const opts = { modelTier: 'default', cache: false };
        if (text.length < 40) {
          if (!aiImagesAvailable()) throw new Error('Bild-KI nicht verfügbar');
          opts.images = [await IMG.canvasToBlob(canvas, 'image/jpeg', 0.9)];
        }
        const j = await S.sample.json(RECEIPT_PROMPT(text.length >= 40 ? text : ''), opts);
        if (j && j.isReceipt === false) throw new Error('Kein Beleg erkannt');
        res = { amount: RL.r2(RL.n0(j.total)) || null, date: /^\d{4}-\d{2}-\d{2}$/.test(j.date || '') ? j.date : null, category: RL.expenseCat(j.category), note: String(j.description || '').trim(), vendor: String(j.vendor || '').trim(), invoiceNumber: String(j.invoiceNumber || '').trim(), confidence: j.confidence || '', src: 'ai' };
        if (res.note && res.vendor && !res.note.toLowerCase().includes(res.vendor.toLowerCase())) res.note = `${res.vendor}: ${res.note}`;
        else if (!res.note) res.note = res.vendor;
      } catch (e) { if (e && e.message === 'Kein Beleg erkannt') throw e; console.warn('KI-Auslesen', e); }
    }
    if (!res || !res.amount) {
      const r = RL.parseReceiptText(text);
      res = { ...(res || {}), amount: (res && res.amount) || r.total, date: (res && res.date) || r.date, invoiceNumber: (res && res.invoiceNumber) || r.invoiceNumber, category: (res && res.category) || 'Sonstiges', note: (res && res.note) || d.name.replace(/\.pdf$/i, ''), src: res ? res.src : 'regex' };
      if (!res.amount && !text) throw new Error(isPdf ? 'In diesem PDF wurde kein Text gefunden – bitte Betrag manuell eintragen.' : 'Beleg konnte nicht ausgelesen werden.');
    }
    Object.assign(d, res, { date: res.date || d.date, status: 'ready' });
    d.dup = findDup(d);
  } catch (e) {
    console.error(e);
    d.status = 'error'; d.error = (e && e.message) || 'Beleg konnte nicht gelesen werden.';
  }
}
async function saveDraft(d) {
  if (!(RL.n0(d.amount) > 0)) { toast(`Bitte Betrag für „${d.name}“ eintragen.`, 'bad'); return false; }
  let receipt = null;
  if (d.isPdf) {
    const thumb = d.preview; let aid = null;
    if (S.assets) { try { aid = (await S.assets.upload(d.file, { type: 'application/pdf' })).id; } catch (e) { console.warn('PDF-Upload', e); } }
    receipt = { key: uidGen('m'), kind: 'pdf', name: d.name, aid, thumb, preview: thumb };
    if (aid) S.blobCache.set(receipt.key, d.file);
  } else {
    receipt = await storeImage(await IMG.canvasToBlob(d.canvas, 'image/jpeg', 0.85), d.canvas, 'receipt');
  }
  const data = { amount: RL.r2(RL.n0(d.amount)), date: d.date || RL.today(), category: d.category || 'Sonstiges', note: (d.note || '').trim(), vendor: d.vendor || '', invoiceNumber: d.invoiceNumber || '', itemId: null, itemSku: null, receipt, source: d.isPdf ? 'pdf' : 'foto', createdAt: Date.now() };
  const id = uidGen('x');
  S.expenses.unshift({ id, ...data });
  await expensesCol().doc(id).set(data);
  S.exp.drafts = S.exp.drafts.filter((x) => x !== d);
  return true;
}
ACT['draft-save'] = async (el) => {
  const d = S.exp.drafts.find((x) => x.key === el.dataset.k); if (!d) return;
  el.disabled = true;
  try { if (await saveDraft(d)) { toast(`Ausgabe ${eur(d.amount)} gespeichert`); render(); } else el.disabled = false; }
  catch (e) { toast('Speichern fehlgeschlagen: ' + dbMsg(e), 'bad'); el.disabled = false; }
};
ACT['draft-save-all'] = async (el) => {
  el.disabled = true; let n = 0;
  for (const d of S.exp.drafts.filter((x) => x.status === 'ready').slice()) { try { if (await saveDraft(d)) n++; } catch (e) { toast('Fehler bei ' + d.name + ': ' + dbMsg(e), 'bad'); } }
  toast(`${n} Ausgabe(n) gespeichert`); render();
};
ACT['draft-del'] = (el) => { S.exp.drafts = S.exp.drafts.filter((x) => x.key !== el.dataset.k); draftsRefresh(); };

async function storeReceipt(file) {
  const bmp = await IMG.loadBitmap(file); const c = IMG.toCanvas(bmp, 1600);
  const blob = await IMG.canvasToBlob(c, 'image/jpeg', 0.85);
  return storeImage(blob, c, 'receipt');
}
ACT['exp-manual'] = async () => {
  const r = await modal({ title: 'Ausgabe ohne Beleg', body: `<div class="stack">
    <label class="f"><span>Betrag (€)</span><input class="in" name="amount" type="number" step="0.01" min="0" inputmode="decimal"></label>
    <label class="f"><span>Datum</span><input class="in" name="date" type="date" value="${RL.today()}"></label>
    <label class="f"><span>Kategorie</span>${sel('category', RL.EXPENSE_CATS, S.exp.lastCat || 'Verpackung', 'name="category"')}</label>
    <label class="f"><span>Beschreibung</span><input class="in" name="note" placeholder="z. B. Vinted Pro Abo"></label></div><div class="modal-err small" style="color:var(--bad);margin-top:8px"></div>`,
    actions: [{ label: 'Abbrechen', value: false, kind: 'ghost' }, { label: 'Speichern', value: true, kind: 'primary', validate: (v) => (RL.num(v.amount) > 0 ? '' : 'Bitte einen Betrag eingeben.') }] });
  if (!r || !r.value) return;
  const data = { amount: RL.r2(RL.num(r.vals.amount)), date: r.vals.date || RL.today(), category: r.vals.category, note: r.vals.note.trim(), itemId: null, itemSku: null, createdAt: Date.now() };
  S.exp.lastCat = data.category;
  try { const id = uidGen('x'); S.expenses.unshift({ id, ...data }); await expensesCol().doc(id).set(data); toast(`Ausgabe ${eur(data.amount)} gespeichert`); render(); }
  catch (e) { toast('Speichern fehlgeschlagen: ' + dbMsg(e), 'bad'); }
};
ACT['exp-del'] = async (el) => {
  const e = S.expenses.find((x) => x.id === el.dataset.id); if (!e) return;
  if (!(await confirmDialog('Ausgabe löschen?', `${esc(e.note || e.category)} – ${eur(e.amount)}`, 'Löschen', true))) return;
  try {
    await expensesCol().doc(e.id).delete();
    if (e.receipt && e.receipt.aid && S.assets) { try { await S.assets.delete(e.receipt.aid); } catch (x) { /* */ } }
    S.expenses = S.expenses.filter((x) => x.id !== e.id); toast('Gelöscht'); render();
  } catch (x) { toast('Löschen fehlgeschlagen: ' + dbMsg(x), 'bad'); }
};
ACT['exp-edit'] = async (el) => {
  const e = S.expenses.find((x) => x.id === el.dataset.id); if (!e) return;
  const r = await modal({ title: 'Ausgabe bearbeiten', body: `<div class="stack">
    <label class="f"><span>Betrag (€)</span><input class="in" name="amount" type="number" step="0.01" min="0" value="${esc(e.amount)}"></label>
    <label class="f"><span>Datum</span><input class="in" name="date" type="date" value="${esc(e.date || '')}"></label>
    <label class="f"><span>Kategorie</span>${sel('category', RL.EXPENSE_CATS, RL.expenseCat(e.category), 'name="category"')}</label>
    <label class="f"><span>Beschreibung</span><input class="in" name="note" value="${esc(e.note || '')}"></label></div><div class="modal-err small" style="color:var(--bad);margin-top:8px"></div>`,
    actions: [{ label: 'Abbrechen', value: false, kind: 'ghost' }, { label: 'Speichern', value: true, kind: 'primary', validate: (v) => (RL.num(v.amount) > 0 ? '' : 'Bitte einen gültigen Betrag eingeben.') }] });
  if (!r || !r.value) return;
  const patch = { amount: RL.r2(RL.num(r.vals.amount)), date: r.vals.date || e.date, category: r.vals.category, note: r.vals.note.trim(), updatedAt: Date.now() };
  try { Object.assign(e, patch); await expensesCol().doc(e.id).update(patch); toast('Gespeichert'); render(); } catch (x) { toast('Speichern fehlgeschlagen: ' + dbMsg(x), 'bad'); }
};
ACT['exp-view'] = async (el) => {
  const e = S.expenses.find((x) => x.id === el.dataset.id); if (!e || !e.receipt) return;
  const isPdf = e.receipt.kind === 'pdf';
  const src = isPdf ? (e.receipt.preview || e.receipt.thumb) : imgSrc(e.receipt);
  const r = await modal({ title: isPdf ? 'Beleg (PDF, Seite 1)' : 'Beleg', wide: true, body: `<img src="${esc(src)}" alt="" style="width:100%;border-radius:10px;background:#fff">${isPdf && !e.receipt.aid ? '<p class="small muted">Das Original-PDF konnte nicht gespeichert werden – nur die Vorschau ist vorhanden.</p>' : ''}`, actions: [...(isPdf && !e.receipt.aid ? [] : [{ label: isPdf ? 'PDF herunterladen' : 'Herunterladen', value: 'dl', kind: '' }]), { label: 'Schließen', value: true, kind: 'dark' }] });
  if (r && r.value === 'dl') { try { const b = await getImageBlob(e.receipt); await saveFile(isPdf ? (e.receipt.name || `beleg-${e.date}.pdf`) : `beleg-${e.date}-${RL.r2(e.amount)}.jpg`, b); } catch (x) { toast('Beleg nicht verfügbar', 'bad'); } }
};
ACT['exp-csv'] = async () => {
  const list = expFiltered(); if (!list.length) { toast('Keine Ausgaben zum Exportieren.', 'bad'); return; }
  await saveFile(`reloop-ausgaben-${S.exp.month === 'alle' ? RL.today() : S.exp.month}.csv`, RL.expensesCSV(list));
};

async function mergeExpense(x) {
  const { keep, drop } = x; const patch = {};
  if (drop.sheetKey) { patch.sheetKey = drop.sheetKey; if (drop.date) patch.date = drop.date; }
  for (const k of ['owner', 'qty', 'receiptUrl', 'vendor', 'date']) if (!keep[k] && drop[k]) patch[k] = drop[k];
  if (Object.keys(patch).length) { Object.assign(keep, patch); await expensesCol().doc(keep.id).update(patch); }
  await expensesCol().doc(drop.id).delete();
  S.expenses = S.expenses.filter((e) => e.id !== drop.id);
}
ACT['exp-merge'] = async (el) => { const x = RL.expenseDupes(S.expenses)[+el.dataset.k]; if (!x) return; try { await mergeExpense(x); toast('Zusammengeführt'); render(); } catch (e) { toast('Fehler: ' + dbMsg(e), 'bad'); } };
ACT['exp-merge-all'] = async () => { const d = RL.expenseDupes(S.expenses); let n = 0; for (const x of d) { try { await mergeExpense(x); n++; } catch (e) { console.warn(e); } } toast(`${n} Duplikate zusammengeführt`); render(); };
ACT['exp-notdup'] = async (el) => { const x = RL.expenseDupes(S.expenses)[+el.dataset.k]; if (!x) return; const ig = [...(x.keep.dupIgnore || []), x.drop.id]; x.keep.dupIgnore = ig; await expensesCol().doc(x.keep.id).update({ dupIgnore: ig }); render(); };
