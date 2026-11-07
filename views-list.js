/* RELOOP – Inventar, Verkäufe, Statistiken, Preisermittlung */
'use strict';

/* ================= Inventar ================= */
const SORTS = [['updatedAt', 'Zuletzt geändert'], ['createdAt', 'Erstellt'], ['purchaseDate', 'Einkaufsdatum'], ['listPrice', 'Angebotspreis'], ['purchasePrice', 'Einkaufspreis'], ['salePrice', 'Verkaufspreis'], ['profit', 'Gewinn'], ['brand', 'Marke'], ['title', 'Titel']];
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', 'XXXL', '4XL', '5XL'];
const sizeKey = (i) => String(i.size || '').trim().toUpperCase() || '–';
function invSizes() {
  const all = [...new Set(S.items.map(sizeKey))];
  const rank = (x) => { const k = SIZE_ORDER.indexOf(x); if (k >= 0) return [0, k]; const n = parseFloat(x); return Number.isFinite(n) ? [1, n] : x === '–' ? [3, 0] : [2, 0]; };
  return all.sort((a, b) => { const A = rank(a), B = rank(b); return A[0] - B[0] || A[1] - B[1] || a.localeCompare(b, 'de'); });
}
function invFiltered() {
  const q = S.inv.q.trim().toLowerCase();
  let list = S.items.filter((i) => (S.inv.status === 'alle' || i.status === S.inv.status || (S.inv.status === 'unvollständig' && i.status !== 'Verkauft' && RL.missingFields(i).length)) && (S.inv.cat === 'alle' || i.category === S.inv.cat) && (S.inv.owner === 'alle' || (i.owner || '') === S.inv.owner) && (!S.inv.size || S.inv.size === 'alle' || sizeKey(i) === S.inv.size) && (!S.inv.account || S.inv.account === 'alle' || (i.account || '') === S.inv.account));
  if (q) list = list.filter((i) => [displayTitle(i), i.sku, i.stockNo, i.owner, i.txId, i.brand, i.category, i.size, i.color, i.notes, i.productType, i.location, i.source].join(' ').toLowerCase().includes(q));
  const k = S.inv.sort, d = S.inv.dir === 'asc' ? 1 : -1;
  const val = (i) => k === 'profit' ? (i.status === 'Verkauft' ? RL.soldProfit(i) : -Infinity) : k === 'title' ? displayTitle(i).toLowerCase() : ['listPrice', 'purchasePrice', 'salePrice'].includes(k) ? RL.n0(i[k]) : (i[k] ?? '');
  return list.slice().sort((a, b) => { const x = val(a), y = val(b); return x < y ? -d : x > y ? d : 0; });
}
VIEW_RENDER.inventar = () => {
  const counts = Object.fromEntries(RL.STATUSES.map((s) => [s, S.items.filter((i) => i.status === s).length]));
  const cats = [...new Set(S.items.map((i) => i.category).filter(Boolean))].sort();
  const owners = [...new Set(S.items.map((i) => i.owner).filter(Boolean))].sort();
  return pageHead('Inventar', `${S.items.length} Artikel · Suche, filtere und bearbeite deinen Bestand.`, `<button class="btn" data-act="csv-export">${icon('download')}CSV-Export</button><button class="btn primary" data-nav="neu">${icon('new')}Neuer Artikel</button>`) + `
  <div class="card" style="padding:14px;margin-bottom:12px">
    <div class="row">
      <input class="in" id="inv-q" data-inv="q" placeholder="Suchen: Titel, Marke, Artikel-ID, Größe…" value="${esc(S.inv.q)}" style="flex:1;min-width:220px">
      ${sel('cat', [['alle', 'Alle Kategorien'], ...cats], S.inv.cat, 'data-inv="cat" id="inv-cat" style="width:auto"')}
      ${owners.length ? sel('owner', [['alle', 'Alle Personen'], ...owners], S.inv.owner, 'data-inv="owner" id="inv-owner" style="width:auto"') : ''}
      ${(() => { const accs = RL.vintedAccounts(S.items, S.settings); return accs.length > 1 ? sel('account', [['alle', 'Alle Konten'], ...accs.map((a) => [a, a]), ['', 'ohne Konto']], S.inv.account || 'alle', 'data-inv="account" id="inv-account" style="width:auto"') : ''; })()}
      ${sel('size', [['alle', 'Alle Größen'], ...invSizes().map((x) => [x, x === '–' ? 'ohne Größe' : 'Größe ' + x])], S.inv.size || 'alle', 'data-inv="size" id="inv-size" style="width:auto"')}
      ${sel('sort', SORTS, S.inv.sort, 'data-inv="sort" id="inv-sort" style="width:auto"')}
      <button class="btn sm" data-act="inv-dir" title="Reihenfolge umkehren" style="height:38px">${S.inv.dir === 'asc' ? '↑ aufsteigend' : '↓ absteigend'}</button>
    </div>
    <div class="seg" style="margin-top:10px">${[['alle', `Alle ${S.items.length}`], ...RL.STATUSES.map((s) => [s, `${s} ${counts[s]}`]), ['unvollständig', `⚠ Unvollständig ${S.items.filter((i) => i.status !== 'Verkauft' && RL.missingFields(i).length).length}`]].map(([v, l]) => `<button class="${S.inv.status === v ? 'on' : ''}" data-act="inv-status" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>
  </div>
  <div id="inv-bulk"></div>
  <div id="inv-table"></div>`;
};
AFTER.inventar = () => renderInvTable();
function renderInvTable() {
  const list = invFiltered();
  const ids = new Set(list.map((i) => i.id));
  for (const id of [...S.sel]) if (!ids.has(id)) S.sel.delete(id);
  const allSel = list.length && list.every((i) => S.sel.has(i.id));
  const bulk = $('#inv-bulk');
  bulk.innerHTML = S.sel.size ? `<div class="note row between" style="margin-bottom:12px"><b>${S.sel.size} ausgewählt</b><div class="row">
      ${sel('bulk', [['', 'Status setzen…'], ...RL.STATUSES.filter((s) => s !== 'Verkauft')], '', 'id="bulk-status" style="width:auto;height:30px"')}
      <button class="btn sm" data-act="bulk-status">Anwenden</button><button class="btn sm" data-act="csv-export" data-sel="1">${icon('download')}CSV</button>
      <button class="btn sm" data-act="bulk-cost">€ EK aufteilen</button>
      <button class="btn sm danger" data-act="bulk-delete">${icon('trash')}Löschen</button><button class="btn sm ghost" data-act="bulk-clear">Auswahl aufheben</button></div></div>` : '';
  if (!list.length) { $('#inv-table').innerHTML = `<div class="card empty"><h3>${S.items.length ? 'Keine Treffer' : 'Noch keine Artikel'}</h3><p>${S.items.length ? 'Passe Suche oder Filter an.' : 'Erstelle deinen ersten Artikel mit Fotos.'}</p>${S.items.length ? '<button class="btn" data-act="inv-reset">Filter zurücksetzen</button>' : ''}</div>`; return; }
  const sumEK = list.reduce((s, i) => s + RL.n0(i.purchasePrice), 0), sumLP = list.filter((i) => i.status !== 'Verkauft').reduce((s, i) => s + RL.n0(i.listPrice), 0), sumP = list.reduce((s, i) => s + RL.soldProfit(i), 0);
  const cards = `<div class="inv-cards">${list.map((i) => { const pr = i.status === 'Verkauft' ? RL.soldProfit(i) : null; return `<div class="inv-card ${S.sel.has(i.id) ? 'sel' : ''}" data-act="open-item" data-id="${i.id}">
      ${thumbHTML(i)}<div style="flex:1;min-width:0"><div class="ellipsis" style="font-weight:600">${esc(displayTitle(i))}</div>
      <div class="tiny muted mono ellipsis">${skuLabel(i)}${i.location ? ' · 📦 ' + esc(i.location) : ''}${i.status !== 'Verkauft' && RL.missingFields(i).length ? ` · <span style="color:var(--warn)">⚠ ${RL.missingFields(i).length} fehlt</span>` : ''}</div>
      <div class="row" style="gap:6px;margin-top:4px">${statusChip(i.status)}<span class="small num">${i.status === 'Verkauft' ? eur(i.salePrice) : RL.n0(i.listPrice) > 0 ? eur(i.listPrice) : '–'}</span>${pr !== null ? `<span class="small num" style="color:${pr < 0 ? 'var(--bad)' : 'var(--ok)'}">+${eur(pr)}</span>` : ''}</div></div>
      <input type="checkbox" data-act="sel-one" data-id="${i.id}" ${S.sel.has(i.id) ? 'checked' : ''} aria-label="Auswählen"></div>`; }).join('')}</div>`;
  $('#inv-table').innerHTML = cards + `<div class="tbl-wrap inv-table-desk"><table class="tbl"><thead><tr>
    <th style="width:36px"><input type="checkbox" data-act="sel-all" ${allSel ? 'checked' : ''} aria-label="Alle auswählen"></th><th></th><th>Artikel</th><th class="hide-m">Marke</th><th class="hide-m">Kategorie</th><th class="th-filter">Größe ${sel('size', [['alle', 'alle'], ...invSizes().map((x) => [x, x === '–' ? 'ohne' : x])], S.inv.size || 'alle', 'data-inv="size" id="inv-size-h" aria-label="Nach Größe filtern"')}</th>
    <th class="th-filter">Status ${sel('status', [['alle', 'alle'], ...RL.STATUSES.map((x) => [x, x]), ['unvollständig', '⚠ unvollständig']], S.inv.status, 'data-inv="status" id="inv-status-h" aria-label="Nach Status filtern"')}</th>
    <th class="right">EK</th><th class="right">Preis</th><th class="right hide-m">VK</th><th class="right">Gewinn</th><th class="hide-m">Kanal</th><th class="hide-m">Datum</th></tr></thead><tbody>
    ${list.map((i) => { const pr = i.status === 'Verkauft' ? RL.soldProfit(i) : null; return `<tr class="${S.sel.has(i.id) ? 'sel' : ''}">
      <td><input type="checkbox" data-act="sel-one" data-id="${i.id}" ${S.sel.has(i.id) ? 'checked' : ''}></td>
      <td>${thumbHTML(i)}</td>
      <td style="max-width:280px"><button class="link ellipsis" style="max-width:100%" data-act="open-item" data-id="${i.id}">${esc(displayTitle(i))}</button><div class="tiny muted mono">${skuLabel(i)}${i.location ? ' · 📦 ' + esc(i.location) : ''}${i.status !== 'Verkauft' && RL.missingFields(i).length ? ` · <span style="color:var(--warn)" title="Fehlt: ${esc(RL.missingFields(i).map((m) => m.label).join(', '))}">⚠ ${RL.missingFields(i).length} fehlt</span>` : ''}</div></td>
      <td class="hide-m">${esc(i.brand || '–')}</td><td class="hide-m">${esc(i.category || '–')}</td><td>${esc(i.size || '–')}</td><td>${statusChip(i.status)}</td>
      <td class="right num">${RL.n0(i.purchasePrice) > 0 ? eur(i.purchasePrice) : '–'}</td><td class="right num">${RL.n0(i.listPrice) > 0 ? eur(i.listPrice) : '–'}</td>
      <td class="right num hide-m">${i.status === 'Verkauft' ? eur(i.salePrice) : '–'}</td><td class="right num" style="color:${pr === null ? '' : pr < 0 ? 'var(--bad)' : 'var(--ok)'}">${pr === null ? '–' : eur(pr)}</td>
      <td class="hide-m">${esc(i.channel || '–')}</td><td class="hide-m tiny">${i.status === 'Verkauft' ? fmtDate(i.saleDate) : fmtDate(i.purchaseDate || i.createdAt)}</td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="row small muted" style="margin-top:10px;gap:18px"><span>${list.length} Artikel</span><span>Einkaufswert ${eur(sumEK)}</span><span>Angebotswert (unverkauft) ${eur(sumLP)}</span><span>Gewinn (verkauft) ${eur(sumP)}</span></div>`;
}
ON_INPUT.inv = (el) => { const k = el.dataset.inv; S.inv[k] = el.value; if (k === 'q') renderInvTable(); else render(); };
ACT['inv-reset'] = () => { Object.assign(S.inv, { q: '', status: 'alle', cat: 'alle', owner: 'alle', size: 'alle', account: 'alle' }); render(); };
ACT['inv-status'] = (el) => { S.inv.status = el.dataset.v; render(); };
ACT['inv-dir'] = () => { S.inv.dir = S.inv.dir === 'asc' ? 'desc' : 'asc'; render(); };
ACT['sel-one'] = (el) => { if (el.checked) S.sel.add(el.dataset.id); else S.sel.delete(el.dataset.id); renderInvTable(); };
ACT['sel-all'] = (el) => { const list = invFiltered(); if (el.checked) list.forEach((i) => S.sel.add(i.id)); else S.sel.clear(); renderInvTable(); };
ACT['bulk-clear'] = () => { S.sel.clear(); renderInvTable(); };
ACT['bulk-status'] = async () => {
  const v = $('#bulk-status').value; if (!v) { toast('Bitte einen Status wählen.', 'bad'); return; }
  const ids = [...S.sel].filter((id) => itemById(id) && itemById(id).status !== 'Verkauft');
  const skipped = S.sel.size - ids.length;
  if (!(await confirmDialog('Status ändern?', `${ids.length} Artikel auf „${esc(v)}“ setzen.${skipped ? ` ${skipped} verkaufte Artikel werden übersprungen.` : ''}`, 'Ändern'))) return;
  for (const id of ids) { const it = itemById(id); const patch = { status: v }; if (v === 'Online' && !it.onlineSince) { patch.onlineSince = RL.today(); patch.lastPriceChange = RL.today(); } await patchItem(id, patch, { immediate: true }); }
  S.sel.clear(); toast(`${ids.length} Artikel aktualisiert`); render();
};
ACT['bulk-cost'] = async () => {
  const ids = [...S.sel]; const n = ids.length;
  const r = await modal({ title: `Einkauf auf ${n} Artikel aufteilen`, body: `<p class="muted small">Z. B. ein Kilo-Posten oder Flohmarkt-Bündel: Gesamtpreis eingeben, RELOOP verteilt ihn gleichmäßig auf die ${n} ausgewählten Artikel.</p>
    <div class="stack"><label class="f"><span>Gesamtpreis (€)</span><input class="in" name="total" type="number" step="0.01" min="0"></label>
    <label class="f"><span>Einkaufsdatum</span><input class="in" name="date" type="date" value="${RL.today()}"></label>
    <label class="f"><span>Bezugsquelle (optional)</span><input class="in" name="source" list="dl-src-bulk" placeholder="z. B. Kiloware"><datalist id="dl-src-bulk">${SOURCE_DEFAULTS.map((v) => `<option value="${esc(v)}">`).join('')}</datalist></label></div>
    <div class="modal-err small" style="color:var(--bad);margin-top:8px"></div>`,
    actions: [{ label: 'Abbrechen', value: false, kind: 'ghost' }, { label: 'Aufteilen', value: true, kind: 'primary', validate: (v) => (RL.num(v.total) >= 0 && v.total !== '' ? '' : 'Bitte einen Gesamtpreis eingeben.') }] });
  if (!r || !r.value) return;
  const parts = RL.splitCost(r.vals.total, n);
  for (const [k, id] of ids.entries()) { const patch = { purchasePrice: parts[k], purchaseDate: r.vals.date || RL.today() }; if (r.vals.source.trim()) patch.source = r.vals.source.trim(); await patchItem(id, patch, { immediate: true }); }
  toast(`${eur(RL.num(r.vals.total))} auf ${n} Artikel verteilt (je ca. ${eur(parts[0])})`); render();
};
ACT['bulk-delete'] = async () => {
  const n = S.sel.size;
  if (!(await confirmDialog(`${n} Artikel löschen?`, 'Die Artikel und ihre Bilder werden endgültig gelöscht.', 'Endgültig löschen', true))) return;
  try { await deleteItems([...S.sel]); toast(`${n} Artikel gelöscht`); } catch (e) { toast('Löschen fehlgeschlagen: ' + dbMsg(e), 'bad'); }
  S.sel.clear(); render();
};
ACT['csv-export'] = async (el) => {
  const list = el.dataset.sel ? invFiltered().filter((i) => S.sel.has(i.id)) : (S.view === 'inventar' ? invFiltered() : S.items);
  if (!list.length) { toast('Keine Artikel zum Exportieren.', 'bad'); return; }
  await saveFile(`reloop-inventar-${RL.today()}.csv`, RL.toCSV(list));
};

/* ================= Verkäufe ================= */
VIEW_RENDER.verkaeufe = () => {
  const sold = S.items.filter((i) => i.status === 'Verkauft').sort((a, b) => String(b.saleDate || '').localeCompare(String(a.saleDate || '')));
  const k = RL.kpis(S.items);
  const open = sold.filter((i) => i.shipStatus === 'offen');
  const reserved = S.items.filter((i) => i.status === 'Reserviert');
  const month = RL.today().slice(0, 7);
  const thisMonth = sold.filter((i) => String(i.saleDate || '').startsWith(month));
  return pageHead('Verkäufe', 'Bestellungen, Versandstatus, Erlöse und Margen.', `<button class="btn primary" data-act="record-sale">${icon('check')}Verkauf erfassen</button>`) + `
  <div id="mail-card">${mailCardHTML()}</div>
  <div class="grid g4">
    ${kpiCard('Verkauft gesamt', fmtNum(k.soldCount), `${thisMonth.length} diesen Monat`)}
    ${kpiCard('Erlöse', eur(k.revenue), `${eur(thisMonth.reduce((s, i) => s + RL.n0(i.salePrice), 0))} diesen Monat`)}
    ${kpiCard('Gewinn', eur(k.profit), `${eur(thisMonth.reduce((s, i) => s + RL.soldProfit(i), 0))} diesen Monat`, 'accent')}
    ${kpiCard('Ø Marge', k.avgMargin !== null ? fmtNum(k.avgMargin, 0) + ' %' : '–', 'Gewinn / Verkaufspreis')}
  </div>
  ${(() => { const accs = RL.vintedAccounts(S.items, S.settings); if (accs.length < 2) return ''; const row = (a, l) => { const s = sold.filter((i) => (i.account || '') === a); return `<div class="list-row"><div class="grow"><b>${esc(l)}</b></div><span class="small muted">${s.length} Verkäufe</span><span class="small num" style="min-width:90px;text-align:right">${eur(s.reduce((x, i) => x + RL.n0(i.salePrice), 0))}</span><span class="small num" style="min-width:90px;text-align:right;color:var(--ok)">${eur(s.reduce((x, i) => x + RL.soldProfit(i), 0))}</span></div>`; };
    return `<div class="card" style="margin-top:16px"><h2>Nach Vinted-Konto</h2>${accs.map((a) => row(a, a)).join('')}${sold.some((i) => !i.account) ? row('', 'ohne Konto (z. B. aus der Tabelle)') : ''}</div>`; })()}
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h2>Zu versenden <span class="muted small">(${open.length})</span></h2>${open.length ? open.map((i) => `<div class="list-row">${thumbHTML(i)}<div class="grow"><button class="link ellipsis" data-act="open-item" data-id="${i.id}" data-tab="verkauf">${esc(displayTitle(i))}</button><div class="tiny muted">${esc(i.channel || '')} · ${fmtDate(i.saleDate)}${i.location ? ` · <b>📦 ${esc(i.location)}</b>` : ''}</div></div><button class="btn sm" data-act="ship" data-id="${i.id}" data-v="versendet">Versendet</button></div>`).join('') : '<p class="small muted">Nichts offen.</p>'}</div>
    <div class="card"><h2>Reserviert <span class="muted small">(${reserved.length})</span></h2>${reserved.length ? reserved.map((i) => `<div class="list-row">${thumbHTML(i)}<div class="grow"><button class="link ellipsis" data-act="open-item" data-id="${i.id}" data-tab="verkauf">${esc(displayTitle(i))}</button><div class="tiny muted">${eur(i.listPrice)}</div></div><button class="btn sm" data-act="open-item" data-id="${i.id}" data-tab="verkauf">Verkauf erfassen</button></div>`).join('') : '<p class="small muted">Keine Reservierungen.</p>'}</div>
  </div>
  <div class="card" style="margin-top:16px;padding:0;overflow:hidden">
    ${sold.length ? `<div class="tbl-wrap" style="border:0;border-radius:0"><table class="tbl"><thead><tr><th></th><th>Artikel</th><th>Datum</th><th>Kanal</th><th class="right">VK</th><th class="right hide-m">Gebühren</th><th class="right hide-m">Versand</th><th class="right hide-m">EK</th><th class="right">Gewinn</th><th class="right hide-m">Marge</th><th>Versand</th></tr></thead><tbody>
    ${sold.map((i) => { const p = RL.soldProfit(i); return `<tr><td>${thumbHTML(i)}</td><td><button class="link ellipsis" style="max-width:240px" data-act="open-item" data-id="${i.id}" data-tab="verkauf">${esc(displayTitle(i))}</button><div class="tiny muted mono">${skuLabel(i)}</div></td><td class="tiny">${fmtDate(i.saleDate)}</td><td>${esc(i.channel || '–')}</td>
      <td class="right num">${eur(i.salePrice)}</td><td class="right num hide-m">${eur(RL.n0(i.saleFees))}</td><td class="right num hide-m">${eur(RL.n0(i.saleShipping))}</td><td class="right num hide-m">${eur(RL.n0(i.purchasePrice))}</td>
      <td class="right num" style="color:${p < 0 ? 'var(--bad)' : 'var(--ok)'}"><b>${eur(p)}</b></td><td class="right num hide-m">${RL.n0(i.salePrice) > 0 ? fmtNum(p / i.salePrice * 100, 0) + ' %' : '–'}</td>
      <td>${sel('ship', RL.SHIP_STATES, i.shipStatus || 'offen', `data-ship="${i.id}" style="width:auto;height:30px;font-size:13px"`)}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty"><h3>Noch keine Verkäufe</h3><p>Markiere Artikel im Tab „Verkauf“ als verkauft.</p></div>'}
  </div>`;
};
ACT.ship = async (el) => { await patchItem(el.dataset.id, { shipStatus: el.dataset.v }, { immediate: true }); render(); };
ON_INPUT.ship = (el) => { patchItem(el.dataset.ship, { shipStatus: el.value }, { immediate: true }).then(() => buildNav()); };
ACT['record-sale'] = async () => {
  const open = S.items.filter((i) => i.status !== 'Verkauft');
  if (!open.length) { toast('Keine unverkauften Artikel vorhanden.', 'bad'); return; }
  const r = await modal({ title: 'Verkauf erfassen', body: `<label class="f"><span>Welcher Artikel wurde verkauft?</span>${sel('id', open.map((i) => [i.id, `${displayTitle(i)} · ${i.sku}${RL.n0(i.listPrice) > 0 ? ' · ' + eur(i.listPrice) : ''}`]), open[0].id, 'name="id"')}</label>`, actions: [{ label: 'Abbrechen', value: false, kind: 'ghost' }, { label: 'Weiter', value: true, kind: 'primary' }] });
  if (r && r.value) { S.itemTab = 'verkauf'; go('artikel', r.vals.id); }
};

/* ================= Statistiken ================= */
S.statsPeriod = S.statsPeriod || 'm1';
const PER_LABEL = { day: 'pro Tag', week: 'pro Woche', month: 'pro Monat' };
VIEW_RENDER.statistik = () => {
  const k = RL.kpis(S.items);
  const r = RL.periodRange(S.statsPeriod, S.items, S.expenses);
  const sum = RL.periodSum(S.items, r, S.expenses);
  const per = PER_LABEL[r.gran];
  return pageHead('Statistiken', `${esc(r.label)} · ${fmtDate(r.start)} – ${fmtDate(r.end)}`,
    `<div class="seg">${RL.PERIODS.map(([key, l]) => `<button class="${S.statsPeriod === key ? 'on' : ''}" data-act="stats-period" data-v="${key}">${l}</button>`).join('')}</div>`) + `
  <div class="grid g4">
    ${kpiCard('Umsatz', eur(sum.revenue), `${sum.count} Verkäuf${sum.count === 1 ? '' : 'e'}${sum.count ? ' · Ø ' + eur(sum.avg) : ''}`)}
    ${kpiCard('Gewinn', eur(sum.profit), sum.margin !== null ? `Marge ${fmtNum(sum.margin, 0)} %` : '–')}
    ${kpiCard('Ausgaben', eur(sum.expenses), 'im Zeitraum')}
    ${kpiCard('Nettogewinn', eur(sum.net), 'Gewinn − Kosten ohne Ware', 'accent')}
  </div>
  <div class="grid g4" style="margin-top:16px">
    ${kpiCard('Lagerwert (EK)', eur(k.stockValue), `${k.stockCount} unverkaufte Artikel`)}
    ${kpiCard('Angebotswert', eur(k.listValue), 'Summe der Angebotspreise')}
    ${kpiCard('Kapitalbindung', k.avgStockAge !== null ? fmtNum(k.avgStockAge, 0) + ' Tage' : '–', `Ø Lagerdauer · ${fmtNum(k.capitalDays, 0)} €·Tage gebunden`)}
    ${kpiCard('Ø Marge gesamt', k.avgMargin !== null ? fmtNum(k.avgMargin, 0) + ' %' : '–', `${k.soldCount} Verkäufe insgesamt`)}
  </div>
  ${!sum.count && !sum.expenses ? `<div class="note" style="margin-top:16px">Im Zeitraum „${esc(r.label)}“ gibt es noch keine Verkäufe oder Ausgaben.</div>` : ''}
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h2>Umsatz ${per}</h2><div class="chart-box"><canvas id="ch-month"></canvas></div></div>
    <div class="card"><h2>Gewinn ${per}</h2><div class="chart-box"><canvas id="ch-profit"></canvas></div></div>
    <div class="card"><h2>Verkaufte Artikel ${per}</h2><div class="chart-box"><canvas id="ch-count"></canvas></div></div>
    <div class="card"><h2>Ø Verkaufspreis ${per}</h2><div class="chart-box"><canvas id="ch-avg"></canvas></div></div>
    <div class="card"><h2>Ausgaben ${per}</h2><div class="chart-box"><canvas id="ch-exp"></canvas></div></div>
    <div class="card"><h2>Nettogewinn ${per} <span class="muted small">Gewinn − Kosten ohne Ware</span></h2><div class="chart-box"><canvas id="ch-net"></canvas></div></div>
    <div class="card"><h2>Beste Marken <span class="muted small">im Zeitraum</span></h2><div class="chart-box"><canvas id="ch-brands"></canvas></div></div>
    <div class="card"><h2>Beste Bezugsquellen <span class="muted small">im Zeitraum</span></h2><div class="chart-box"><canvas id="ch-src"></canvas></div></div>
    <div class="card"><h2>Erfolgreichste Kategorien <span class="muted small">im Zeitraum</span></h2><div class="chart-box"><canvas id="ch-cats"></canvas></div></div>
  </div>
  <div class="card" style="margin-top:16px"><h2>Kapitalbindung – am längsten im Bestand</h2>${stockAgeList()}</div>`;
};
function stockAgeList() {
  const t = RL.today();
  const rows = S.items.filter((i) => i.status !== 'Verkauft').map((i) => ({ i, d: RL.daysBetween(i.purchaseDate || i.createdAt, t) || 0 })).sort((a, b) => b.d * RL.n0(b.i.purchasePrice) - a.d * RL.n0(a.i.purchasePrice) || b.d - a.d).slice(0, 8);
  if (!rows.length) return '<p class="small muted">Kein Bestand.</p>';
  return rows.map(({ i, d }) => `<div class="list-row">${thumbHTML(i)}<div class="grow"><button class="link ellipsis" data-act="open-item" data-id="${i.id}">${esc(displayTitle(i))}</button><div class="tiny muted">${statusChip(i.status)} seit ${d} Tagen im Bestand</div></div><div class="right small">EK ${eur(RL.n0(i.purchasePrice))}<div class="tiny muted">${fmtNum(d * RL.n0(i.purchasePrice), 0)} €·Tage</div></div></div>`).join('');
}
AFTER.statistik = () => {
  const r = RL.periodRange(S.statsPeriod, S.items, S.expenses);
  const m = RL.seriesRange(S.items, r, S.expenses);
  const soldIn = S.items.filter((i) => i.status !== 'Verkauft' || RL.inRange(i.saleDate, r));
  const c = chartColors();
  for (const [id, metric] of [['ch-month', 'revenue'], ['ch-profit', 'profit'], ['ch-count', 'count'], ['ch-exp', 'expenses'], ['ch-net', 'net']]) { const el = document.getElementById(id); if (el) S.charts.push(metricChart(el, m, metric)); }
  const avgEl = document.getElementById('ch-avg');
  if (avgEl) S.charts.push(metricChart(avgEl, m, 'avg'));
  const hbar = (id, g) => mkChart(id, { type: 'bar', data: { labels: g.map((x) => x.key), datasets: [{ label: 'Gewinn', data: g.map((x) => x.profit), backgroundColor: c.c1, borderRadius: 6 }, { label: 'Umsatz', data: g.map((x) => x.revenue), backgroundColor: c.c2 + '55', borderRadius: 6 }] }, options: { ...baseOpts({ money: true }), indexAxis: 'y', plugins: { ...baseOpts({ money: true }).plugins, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${eur(ctx.parsed.x)} (${g[ctx.dataIndex].count} Verkäufe)` } } }, scales: { x: { grid: { color: c.grid }, ticks: { color: c.muted, callback: (v) => eur(v) } }, y: { grid: { display: false }, ticks: { color: c.ink } } } } });
  hbar('ch-brands', RL.groupSold(soldIn, 'brand'));
  hbar('ch-cats', RL.groupSold(soldIn, 'category'));
  hbar('ch-src', RL.groupSold(soldIn, 'source'));
};
ACT['stats-period'] = (el) => { S.statsPeriod = el.dataset.v; render(); };

/* ---- Charts ---- */
const CHART_FONT = "Geist, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
function chartColors() { const cs = getComputedStyle(document.documentElement); const g = (v) => cs.getPropertyValue(v).trim(); return { c1: g('--chart-1'), c2: g('--chart-2'), c3: g('--chart-3'), grid: g('--chart-grid'), muted: g('--muted'), ink: g('--ink') }; }
const monthLabel = (m) => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1, 1).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }); };
function baseOpts({ legend = true, money = true } = {}) {
  const c = chartColors();
  return {
    responsive: true, maintainAspectRatio: false, animation: { duration: 500 }, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: legend, labels: { color: c.ink, usePointStyle: true, boxWidth: 8, font: { family: CHART_FONT } } }, tooltip: { callbacks: money ? { label: (ctx) => `${ctx.dataset.label}: ${eur(ctx.parsed.y)}` } : {} } },
    scales: { x: { grid: { display: false }, ticks: { color: c.muted, font: { family: CHART_FONT } } }, y: { beginAtZero: true, grid: { color: c.grid }, ticks: { color: c.muted, precision: 0, callback: money ? (v) => eur(v) : undefined, font: { family: CHART_FONT } } } },
  };
}
function mkChart(id, cfg) { const el = document.getElementById(id); if (!el || !window.Chart) return; S.charts.push(new Chart(el, cfg)); }
function drawSeriesChart(id, m) {
  const c = chartColors();
  mkChart(id, { type: 'bar', data: { labels: m.map((x) => x.label), datasets: [
    { type: 'bar', label: 'Umsatz', data: m.map((x) => x.revenue), backgroundColor: c.c2 + 'CC', borderRadius: 6, order: 2 },
    { type: 'line', label: 'Gewinn', data: m.map((x) => x.profit), borderColor: c.c1, backgroundColor: c.c1, tension: 0.35, pointRadius: 3, borderWidth: 2.5, order: 1 },
  ] }, options: baseOpts() });
}
function drawMonthlyChart(id, months) {
  const m = RL.monthly(S.items, months); const c = chartColors();
  mkChart(id, { type: 'bar', data: { labels: m.map((x) => monthLabel(x.month)), datasets: [
    { type: 'bar', label: 'Umsatz', data: m.map((x) => x.revenue), backgroundColor: c.c2 + 'CC', borderRadius: 6, order: 2 },
    { type: 'line', label: 'Gewinn', data: m.map((x) => x.profit), borderColor: c.c1, backgroundColor: c.c1, tension: 0.35, pointRadius: 3, borderWidth: 2.5, order: 1 },
  ] }, options: baseOpts() });
}

/* ================= Preisermittlung ================= */
VIEW_RENDER.preise = () => {
  const items = S.items.filter((i) => i.status !== 'Verkauft');
  const q = S.quickPrice || { brand: '', type: '', category: '', condition: 'Sehr gut', size: '', notes: '' };
  const calc = S.quickCalc || { price: '', purchase: '', channel: S.settings.defaultChannel };
  return pageHead('Gewinnrechner', 'Berechne den Gewinn nach Gebühren und Versand – und den maximalen Einkaufspreis für deine Zielmarge.') + `
  <div class="grid ${aiAvailable() ? 'g2' : ''}" style="${aiAvailable() ? '' : 'max-width:760px'}">
    ${aiAvailable() ? `    <div class="card"><h2>Schnell-Schätzung</h2><p class="sub">Für Artikel, die du (noch) nicht im Inventar hast – z. B. direkt im Second-Hand-Laden.</p>
      <div class="fgrid" style="grid-template-columns:1fr 1fr">
        <label class="f"><span>Marke</span><input class="in" id="qp-brand" value="${esc(q.brand)}" placeholder="z. B. Carhartt"></label>
        <label class="f"><span>Produkttyp</span><input class="in" id="qp-type" value="${esc(q.type)}" placeholder="z. B. Detroit Jacket"></label>
        <label class="f"><span>Kategorie</span>${sel('c', [['', '– wählen –'], ...RL.CATEGORIES], q.category, 'id="qp-cat"')}</label>
        <label class="f"><span>Zustand</span>${sel('z', RL.CONDITIONS, q.condition, 'id="qp-cond"')}</label>
        <label class="f"><span>Größe</span><input class="in" id="qp-size" value="${esc(q.size)}"></label>
        <label class="f"><span>Details</span><input class="in" id="qp-notes" value="${esc(q.notes)}" placeholder="z. B. Vintage, 90er"></label>
      </div>
      <button class="btn primary" style="margin-top:12px" data-act="qp-run" ${aiAvailable() ? '' : 'disabled'}>${icon('sparkle')}Preis schätzen</button>
      ${!aiAvailable() ? '<p class="small muted">KI nicht verfügbar.</p>' : ''}
      <div id="qp-res" style="margin-top:14px">${S.quickPriceRes ? quickPriceResHTML(S.quickPriceRes) : ''}</div>
    </div>
` : ''}
    <div class="stack">
      <div class="card"><h2>Gewinnrechner</h2>
        <div class="fgrid" style="grid-template-columns:1fr 1fr 1fr">
          <label class="f"><span>Verkaufspreis (€)</span><input class="in" type="number" step="0.5" min="0" id="cc-price" data-calc="1" value="${esc(calc.price)}"></label>
          <label class="f"><span>Einkaufspreis (€)</span><input class="in" type="number" step="0.5" min="0" id="cc-purchase" data-calc="1" value="${esc(calc.purchase)}"></label>
          <label class="f"><span>Kanal</span>${sel('ch', RL.CHANNELS, calc.channel, 'id="cc-channel" data-calc="1"')}</label>
        </div><div id="cc-res" style="margin-top:12px"></div></div>
      <div class="card"><h2>Artikel aus dem Inventar</h2>${items.length ? items.slice(0, 8).map((i) => `<div class="list-row">${thumbHTML(i)}<div class="grow"><button class="link ellipsis" data-act="open-item" data-id="${i.id}" data-tab="preis">${esc(displayTitle(i))}</button><div class="tiny muted">${i.pricing ? `Schätzung ${eur(i.pricing.market.price)}` : 'noch nicht geschätzt'}</div></div><div class="right small">${RL.n0(i.listPrice) > 0 ? eur(i.listPrice) : '–'}</div><button class="btn sm" data-act="open-item" data-id="${i.id}" data-tab="preis">Preis</button></div>`).join('') : '<p class="small muted">Noch keine Artikel.</p>'}</div>
    </div>
  </div>`;
};
AFTER.preise = () => { updateQuickCalc(); };
ON_INPUT.calc = () => { S.quickCalc = { price: $('#cc-price').value, purchase: $('#cc-purchase').value, channel: $('#cc-channel').value }; updateQuickCalc(); };
function updateQuickCalc() {
  const box = $('#cc-res'); if (!box) return;
  const price = RL.n0($('#cc-price').value), purchase = RL.n0($('#cc-purchase').value), ch = $('#cc-channel').value;
  if (!(price > 0)) { box.innerHTML = '<p class="small muted">Verkaufspreis eingeben.</p>'; return; }
  const c = RL.calcProfit(S.settings, { price, purchase, channel: ch });
  box.innerHTML = `<div class="tbl-wrap"><table class="tbl"><tbody>
    <tr><td>Verkaufspreis</td><td class="right num">${eur(c.price)}</td></tr><tr><td>Plattformgebühr (${esc(ch)})</td><td class="right num">− ${eur(c.fee)}</td></tr>
    <tr><td>Versand & Verpackung (Verkäufer)</td><td class="right num">− ${eur(c.ship)}</td></tr><tr><td>Einkaufspreis</td><td class="right num">− ${eur(purchase)}</td></tr>
    <tr><td><b>Gewinn</b></td><td class="right num"><b style="color:${c.profit < 0 ? 'var(--bad)' : 'var(--ok)'}">${eur(c.profit)}</b> · ${fmtNum(c.margin, 0)} %</td></tr>
    <tr><td>Max. Einkaufspreis für ${S.settings.targetMargin} % Marge</td><td class="right num">${eur(RL.maxBuyPrice(S.settings, { marketPrice: price, channel: ch }))}</td></tr></tbody></table></div>
    <p class="tiny muted" style="margin:6px 0 0">Gebühren & Versand aus den Einstellungen.</p>`;
}
function quickPriceResHTML(r) {
  const tier = (k, l) => `<div class="tier" data-act="qp-use" data-p="${r[k].price}"><div class="t">${l}</div><div class="p">${eur(r[k].price)}</div><div class="d">${esc(r[k].days || '')}</div></div>`;
  return `<div class="row between" style="margin-bottom:10px"><span class="chip warn">Schätzung · keine Live-Marktdaten · Konfidenz ${esc(r.confidence)}</span></div>
    <div class="tiers">${tier('quick', 'Schnell')}${tier('market', 'Markt')}${tier('high', 'Hoch')}</div>
    <p class="small muted">${esc(r.rationale)}</p>
    <div class="note small">Max. Einkaufspreis bei ${S.settings.targetMargin} % Zielmarge (Marktpreis, ${esc(S.settings.defaultChannel)}): <b>${eur(RL.maxBuyPrice(S.settings, { marketPrice: r.market.price, channel: S.settings.defaultChannel }))}</b></div>
    <p class="tiny muted">Klicke eine Stufe an, um sie in den Gewinnrechner zu übernehmen.</p>`;
}
ACT['qp-run'] = async (el) => {
  const q = { brand: $('#qp-brand').value.trim(), type: $('#qp-type').value.trim(), category: $('#qp-cat').value, condition: $('#qp-cond').value, size: $('#qp-size').value.trim(), notes: $('#qp-notes').value.trim() };
  S.quickPrice = q;
  if (!q.brand && !q.type && !q.category) { toast('Bitte mindestens Marke, Produkttyp oder Kategorie angeben.', 'bad'); return; }
  el.disabled = true; $('#qp-res').innerHTML = '<div class="loading-line"><span class="spin"></span>Preis wird geschätzt…</div>';
  try {
    S.quickPriceRes = await estimatePrice({ brand: q.brand, productType: q.type, category: q.category, condition: q.condition, size: q.size, features: q.notes ? [q.notes] : [] });
    $('#qp-res').innerHTML = quickPriceResHTML(S.quickPriceRes);
  } catch (e) { $('#qp-res').innerHTML = `<div class="note bad small">${esc(aiErr(e))}</div>`; }
  finally { el.disabled = false; }
};
ACT['qp-use'] = (el) => { $('#cc-price').value = el.dataset.p; ON_INPUT.calc(); };
