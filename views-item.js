/* RELOOP – Übersicht, Artikel erstellen, Artikel-Editor */
'use strict';

const VIEW_RENDER = {};
const AFTER = {};
const ACT = {};
const ON_INPUT = {};

const pageHead = (t, p, right = '') => `<div class="page-head"><div><h1>${t}</h1>${p ? `<p>${p}</p>` : ''}</div><div class="row">${right}</div></div>`;
const kpiCard = (l, v, s = '', cls = '') => `<div class="card kpi ${cls}"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
const sel = (name, opts, val, attrs = '') => `<select class="in" ${attrs}>${opts.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
const numVal = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(RL.num(v)) ? '' : String(v));

/* ================= Übersicht ================= */
VIEW_RENDER.uebersicht = () => {
  const head = pageHead('Übersicht', 'Dein Reselling-Geschäft auf einen Blick.');
  if (!S.items.length) {
    return head + `<div class="card empty"><svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS.studio}</svg>
      <h3>Lade dein erstes Kleidungsstück hoch</h3><p>Fotos rein → Daten & Preis eintragen → Bilder freistellen → Anzeige aus Vorlage kopieren.</p>
      <button class="btn primary lg" data-nav="neu" style="margin-top:10px">${icon('upload')}Fotos hochladen</button></div>
      <div class="grid g3" style="margin-top:16px">
        <div class="card"><h3>1 · Erfassen</h3><p class="muted small" style="margin:0">Mehrere Fotos pro Artikel, Marke, Größe, Zustand und Maße – alles an einem Ort.</p></div>
        <div class="card"><h3>2 · Aufbereiten</h3><p class="muted small" style="margin:0">Freistellen direkt im Browser, Licht & Farben korrigieren, Formate für Vinted, eBay und Kleinanzeigen.</p></div>
        <div class="card"><h3>3 · Verkaufen</h3><p class="muted small" style="margin:0">Texte pro Plattform, Verhandlungs­assistent mit Mindestpreis, Inventar, Gewinne und Statistiken.</p></div>
      </div>`;
  }
  const k = RL.kpis(S.items);
  const drops = RL.dueDrops(S.items, S.settings), relist = RL.relistCandidates(S.items, S.settings);
  const drafts = S.items.filter((i) => i.status === 'In Bearbeitung');
  const ship = S.items.filter((i) => i.status === 'Verkauft' && i.shipStatus === 'offen');
  const reserved = S.items.filter((i) => i.status === 'Reserviert');
  const noPrice = S.items.filter((i) => i.status === 'Online' && !(RL.n0(i.listPrice) > 0));
  const tasks = [
    [drafts.length, 'Artikel in Bearbeitung', 'filter-inv', 'In Bearbeitung'],
    [(S.mail && S.mail.pending.length) || 0, 'Verkaufs-Mails aus Gmail bestätigen', 'goto', 'verkaeufe'],
    [ship.length, 'Verkäufe noch zu versenden', 'goto', 'verkaeufe'],
    [drops.length, 'Preissenkungen fällig (Freigabe nötig)', 'goto-assist', 'automatik'],
    [relist.length, `Artikel länger als ${S.settings.relistDays} Tage online`, 'goto-assist', 'automatik'],
    [reserved.length, 'Reservierte Artikel', 'filter-inv', 'Reserviert'],
    [noPrice.length, 'Online ohne Preis', 'filter-inv', 'Online'],
    [S.items.filter((i) => ['Auf Lager', 'Online', 'Reserviert'].includes(i.status) && RL.missingFields(i).length).length, 'Artikel mit fehlenden Angaben', 'filter-inv', 'unvollständig'],
  ].filter((t) => t[0] > 0);
  const recent = S.items.slice(0, 6);
  return head + `
  <div class="grid g6">
    ${kpiCard('Aktive Artikel', fmtNum(k.activeCount), `${k.stockCount} im Bestand`)}
    ${kpiCard('Verkauft', fmtNum(k.soldCount), 'insgesamt')}
    ${kpiCard('Umsatz', eur(k.revenue))}
    ${kpiCard('Gewinn', eur(k.profit), `${k.avgMargin !== null ? `Ø Marge ${fmtNum(k.avgMargin, 0)} % · ` : ''}netto ${eur(k.profit - S.expenses.reduce((a, e) => a + RL.n0(e.amount), 0))}`, 'accent')}
    ${kpiCard('Ø Verkaufspreis', k.avgSalePrice !== null ? eur(k.avgSalePrice) : '–')}
    ${(() => { const all = S.expenses.reduce((a, e) => a + RL.n0(e.amount), 0); const ware = S.expenses.filter((e) => RL.expenseCat(e.category) === 'Ware').reduce((a, e) => a + RL.n0(e.amount), 0); return kpiCard('Ausgaben insgesamt', eur(all), `Ware ${eur(ware)} · Kosten ${eur(all - ware)}`); })()}
  </div>
  ${goalCard()}
  <div class="grid g-main" style="margin-top:16px">
    <div class="card"><div class="row between"><h2 style="margin:0">Umsatz</h2><div class="row" style="gap:6px">${granSeg('ov-gran')}<button class="btn sm ghost" data-act="chart-big" title="Vergrößern">⤢ Groß</button></div></div>
      <div class="chart-box" style="cursor:zoom-in;margin-top:10px" data-act="chart-big" title="Klicken zum Vergrößern"><canvas id="ch-overview"></canvas></div></div>
    <div class="card"><h2>Offene Aufgaben</h2>
      ${tasks.length ? tasks.map((t) => `<div class="list-row"><span class="chip accent mono">${t[0]}</span><div class="grow small">${esc(t[1])}</div><button class="btn sm" data-act="${t[2]}" data-v="${esc(t[3])}">${icon('arrow')}</button></div>`).join('') : '<p class="muted small">Alles erledigt. 🎉</p>'}
    </div>
  </div>
  <div class="card" style="margin-top:16px"><div class="row between"><h2>Zuletzt bearbeitet</h2><button class="btn sm ghost" data-nav="inventar">Alle anzeigen</button></div>
    ${recent.map((it) => `<div class="list-row">${thumbHTML(it)}<div class="grow"><button class="link ellipsis" data-act="open-item" data-id="${it.id}">${esc(displayTitle(it))}</button><div class="tiny muted mono">${skuLabel(it)}</div></div>${statusChip(it.status)}<div class="num right" style="width:90px">${it.status === 'Verkauft' ? eur(it.salePrice) : (RL.n0(it.listPrice) > 0 ? eur(it.listPrice) : '–')}</div></div>`).join('')}
  </div>`;
};
AFTER.uebersicht = () => { const el = document.getElementById('ch-overview'); if (S.items.length && el) S.charts.push(metricChart(el, RL.series(S.items, S.ovGran, OV_N[S.ovGran], undefined, S.expenses), 'revenue')); };
const OV_N = { day: 30, week: 12, month: 12 };
S.ovGran = S.ovGran || 'month';
function granSeg(act, cur = S.ovGran) { return `<div class="seg">${[['day', 'Tag'], ['week', 'Woche'], ['month', 'Monat']].map(([g, l]) => `<button class="${cur === g ? 'on' : ''}" data-act="${act}" data-v="${g}">${l}</button>`).join('')}</div>`; }
ACT['ov-gran'] = (el) => { S.ovGran = el.dataset.v; render(); };
const METRICS = { revenue: { l: 'Umsatz', money: true, col: 'c1' }, profit: { l: 'Gewinn', money: true, col: 'c3' }, count: { l: 'Verkäufe', money: false, col: 'c2' }, avg: { l: 'Ø Verkaufspreis', money: true, col: 'c2' }, expenses: { l: 'Ausgaben', money: true, col: 'c2' }, net: { l: 'Nettogewinn', money: true, col: 'c3' } };
/** Ein Balkendiagramm für genau eine Kennzahl – Wert erscheint beim Darüberfahren */
function metricChart(canvas, m, metric) {
  const c = chartColors(); const M = METRICS[metric];
  const opts = baseOpts({ legend: false, money: M.money });
  opts.interaction = { mode: 'index', intersect: false };
  opts.plugins.tooltip = { displayColors: false, padding: 12, titleFont: { size: 13 }, bodyFont: { size: 16, weight: '600' },
    callbacks: { label: (ctx) => `${M.l}: ${M.money ? eur(ctx.parsed.y) : ctx.parsed.y + (ctx.parsed.y === 1 ? ' Verkauf' : ' Verkäufe')}` } };
  return new Chart(canvas, { type: 'bar', data: { labels: m.map((x) => x.label), datasets: [{ label: M.l, data: m.map((x) => x[metric]), backgroundColor: c[M.col] + 'D9', hoverBackgroundColor: c.c1, borderRadius: 6 }] }, options: opts });
}
ACT['chart-big'] = async () => {
  let gran = S.ovGran, n = OV_N[gran], metric = 'revenue', chart = null;
  const RANGES = { day: [7, 14, 30, 90], week: [4, 8, 12, 26, 52], month: [3, 6, 12, 24] };
  const UNIT = { day: 'Tage', week: 'Wochen', month: 'Monate' };
  const draw = (root) => {
    const m = RL.series(S.items, gran, n, undefined, S.expenses);
    const sum = m.reduce((a, x) => ({ revenue: a.revenue + x.revenue, profit: a.profit + x.profit, count: a.count + x.count }), { revenue: 0, profit: 0, count: 0 }); sum.avg = sum.count ? RL.r2(sum.revenue / sum.count) : 0; sum.expenses = RL.r2(m.reduce((a, x) => a + x.expenses, 0)); sum.net = RL.r2(sum.profit - sum.expenses);
    $('#big-metric', root).innerHTML = `<div class="seg">${Object.entries(METRICS).map(([k, x]) => `<button class="${k === metric ? 'on' : ''}" data-big-m="${k}">${x.l}</button>`).join('')}</div>`;
    $('#big-ctrl', root).innerHTML = `${granSeg('big-gran', gran)}<div class="seg">${RANGES[gran].map((x) => `<button class="${x === n ? 'on' : ''}" data-big-n="${x}">${x} ${UNIT[gran]}</button>`).join('')}</div>`;
    $('#big-sum', root).innerHTML = `${METRICS[metric].l} im Zeitraum: <b style="font-size:18px">${METRICS[metric].money ? eur(sum[metric]) : sum[metric]}</b>`;
    $('#big-title', root).textContent = METRICS[metric].l;
    if (chart) chart.destroy();
    chart = metricChart($('#big-canvas', root), m, metric);
  };
  await modal({ title: 'Verlauf', xl: true, body: `<div class="row between" style="margin:6px 0 8px"><div id="big-metric"></div><div class="row" id="big-ctrl"></div></div><div class="row between"><h3 id="big-title" style="margin:6px 0"></h3><div class="small muted" id="big-sum"></div></div><div style="position:relative;height:58vh;margin-top:8px"><canvas id="big-canvas"></canvas></div>`,
    actions: [{ label: 'Schließen', value: true, kind: 'dark' }],
    onOpen: (root) => {
      draw(root);
      root.addEventListener('click', (e) => {
        const g = e.target.closest('[data-act="big-gran"]'), b = e.target.closest('[data-big-n]'), mm = e.target.closest('[data-big-m]');
        if (g) { e.stopPropagation(); gran = g.dataset.v; n = OV_N[gran]; draw(root); }
        if (b) { n = +b.dataset.bigN; draw(root); }
        if (mm) { metric = mm.dataset.bigM; draw(root); }
      }, true);
    } });
  if (chart) chart.destroy();
};
ACT['big-gran'] = () => {};

function goalCard() {
  const goal = RL.n0(S.settings.monthlyGoal);
  const pt = RL.periodTotals(S.items, undefined, S.expenses).month;
  if (!(goal > 0)) return `<div class="note small" style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;gap:10px"><span>🎯 Setz dir ein Monatsziel für deinen Gewinn – dann siehst du hier deinen Fortschritt.</span><button class="btn sm" data-act="set-goal">Ziel festlegen</button></div>`;
  const pct = Math.min(100, Math.round(pt.profit / goal * 100));
  const now = new Date(); const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
  const rest = Math.max(0, goal - pt.profit);
  const avgP = RL.kpis(S.items).soldCount ? RL.kpis(S.items).profit / RL.kpis(S.items).soldCount : 0;
  return `<div class="card" style="margin-top:16px"><div class="row between"><h3 style="margin:0">🎯 Monatsziel: ${eur(goal)} Gewinn</h3><button class="btn sm ghost" data-act="set-goal">Ändern</button></div>
    <div style="height:12px;border-radius:8px;background:var(--line-2);margin:12px 0 8px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${pct >= 100 ? 'var(--ok)' : 'var(--accent)'};border-radius:8px;transition:width .6s"></div></div>
    <div class="row between small"><span><b>${eur(pt.profit)}</b> erreicht (${pct} %)</span><span class="muted">${pct >= 100 ? 'Ziel erreicht! 🎉' : `noch ${eur(rest)} in ${daysLeft} Tagen${avgP > 0 ? ` · ca. ${Math.ceil(rest / avgP)} Verkäufe` : ''}`}</span></div></div>`;
}
ACT['set-goal'] = async () => {
  const r = await modal({ title: 'Monatsziel festlegen', body: `<label class="f"><span>Gewinnziel pro Monat (€) – 0 zum Ausblenden</span><input class="in" name="g" type="number" min="0" step="10" value="${RL.n0(S.settings.monthlyGoal) || ''}"></label>`, actions: [{ label: 'Abbrechen', value: false, kind: 'ghost' }, { label: 'Speichern', value: true, kind: 'primary' }] });
  if (r && r.value) { saveSettings({ monthlyGoal: Math.max(0, RL.n0(r.vals.g)) }); render(); }
};
ACT['filter-inv'] = (el) => { S.inv.status = el.dataset.v; go('inventar'); };
ACT.goto = (el) => go(el.dataset.v);
ACT['goto-assist'] = (el) => { S.assistTab = el.dataset.v; go('assistent'); };
ACT['open-item'] = (el) => { const it = itemById(el.dataset.id); S.itemTab = el.dataset.tab || (it && it.status !== 'In Bearbeitung' ? 'uebersicht' : 'fotos'); go('artikel', el.dataset.id); };

/* ================= Artikel erstellen ================= */
VIEW_RENDER.neu = () => {
  const drafts = S.items.filter((i) => i.status === 'In Bearbeitung').slice(0, 5);
  return pageHead('Artikel erstellen', 'Lade Fotos eines Kleidungsstücks hoch – danach trägst du die Daten ein, legst den Preis fest und bekommst fertige Anzeigentexte aus deiner Vorlage.') + `
  ${S.readOnly ? '<div class="note warn" style="margin-bottom:12px">Du hast nur Leserechte für diese App.</div>' : ''}
  <div class="drop" id="new-drop" data-act="pick-new">
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS.upload}</svg>
    <h3>Fotos hierher ziehen oder klicken</h3>
    <p class="muted" style="margin:0">Bis zu 12 Fotos · JPG, PNG, WebP · Tipp: Front, Rückseite, Etikett (Marke/Größe/Material), Details & Mängel</p>
  </div>
  <input type="file" id="new-files" accept="image/*" multiple hidden><input type="file" id="new-cam" accept="image/*" capture="environment" hidden>
  <button class="btn primary lg show-m" style="width:100%;margin-top:10px" data-act="pick-cam">${icon('camera')}Foto aufnehmen</button>
  <div class="row" style="margin-top:12px;justify-content:space-between">
    <span class="small muted">Fotos hochladen, Daten im Artikel eintragen.</span>
    <button class="btn ghost" data-act="new-manual">Ohne Fotos manuell anlegen</button>
  </div>
  <div class="card" style="margin-top:16px" id="batch-card">${batchHTML()}</div>
  <div class="steps" style="margin-top:22px;opacity:.8">${['Fotos', 'Daten', 'Preis', 'Bildstudio', 'Anzeige', 'Verkauf'].map((s, i) => `<button tabindex="-1"><i>${i + 1}</i>${s}</button>`).join('')}</div>
  ${drafts.length ? `<div class="card"><h2>Weiterarbeiten</h2>${drafts.map((it) => `<div class="list-row">${thumbHTML(it)}<div class="grow"><button class="link" data-act="open-item" data-id="${it.id}">${esc(displayTitle(it))}</button><div class="tiny muted">zuletzt ${fmtDate(it.updatedAt)}</div></div><button class="btn sm" data-act="open-item" data-id="${it.id}">Öffnen</button></div>`).join('')}</div>` : ''}`;
};
AFTER.neu = () => {
  const drop = $('#new-drop'), inp = $('#new-files');
  inp.addEventListener('change', () => { if (inp.files.length) startNewItem([...inp.files]); });
  const cam = $('#new-cam'); cam.addEventListener('change', () => { if (cam.files.length) startNewItem([...cam.files]); });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { const f = [...(e.dataTransfer.files || [])]; if (f.length) startNewItem(f); });
  bindBatch();
};
ACT['pick-new'] = () => $('#new-files').click();
ACT['pick-cam'] = () => $('#new-cam').click();
ACT['open-menu'] = () => openSide();
ACT['pick-item-cam'] = () => $('#item-cam').click();
ACT['new-manual'] = async () => { try { const id = await createItem(); S.itemTab = 'daten'; go('artikel', id); } catch (e) { toast('Artikel konnte nicht angelegt werden: ' + dbMsg(e), 'bad'); } };

/* ---- Stapel-Erfassung: viele Fotos → mehrere Artikel ---- */
S.batch = S.batch || { files: [], urls: [], starts: new Set([0]), per: 3, running: false, log: [], done: [] };
function batchGroups() { const B = S.batch; const g = []; B.files.forEach((f, i) => { if (i === 0 || B.starts.has(i)) g.push([]); g[g.length - 1].push(i); }); return g; }
function batchHTML() {
  const B = S.batch;
  if (B.running || B.done.length) return `<h2>Stapel-Erfassung</h2><div class="stack small">${B.log.map((l) => `<div>${l}</div>`).join('')}</div>
    ${B.running ? '<div class="loading-line" style="margin-top:10px"><span class="spin"></span>Läuft – du kannst die Seite offen lassen und zuschauen.</div>' : `<div class="row" style="margin-top:12px">${B.done.map((id) => { const it = itemById(id); return it ? `<button class="btn sm" data-act="open-item" data-id="${id}" data-tab="daten">${esc(displayTitle(it))}</button>` : ''; }).join('')}</div><button class="btn ghost sm" style="margin-top:10px" data-act="batch-reset">Neuen Stapel beginnen</button>`}`;
  if (!B.files.length) return `<div class="row between"><div><h2 style="margin:0">Stapel-Erfassung</h2><p class="sub" style="margin:6px 0 0">Viele Artikel auf einmal: alle Fotos auswählen, in Artikel aufteilen – RELOOP legt sie an und analysiert sie nacheinander.</p></div>
    <button class="btn dark" data-act="batch-pick">${icon('upload')}Fotos für mehrere Artikel</button></div><input type="file" id="batch-files" accept="image/*" multiple hidden>`;
  const groups = batchGroups();
  return `<div class="row between"><h2 style="margin:0">Stapel-Erfassung · ${B.files.length} Fotos → <span style="color:var(--accent)">${groups.length} Artikel</span></h2>
      <div class="row"><span class="small muted">Fotos pro Artikel:</span><div class="seg">${[1, 2, 3, 4, 5].map((n) => `<button class="${B.per === n ? 'on' : ''}" data-act="batch-per" data-v="${n}">${n}</button>`).join('')}</div></div></div>
    <p class="sub" style="margin:8px 0 12px">Tippe auf ein Foto, um dort einen neuen Artikel beginnen zu lassen (oder die Trennung aufzuheben). Reihenfolge = Auswahlreihenfolge.</p>
    <div class="gallery" style="grid-template-columns:repeat(auto-fill,minmax(92px,1fr))">${B.urls.map((u, i) => { const gi = groups.findIndex((g) => g.includes(i)); return `<button class="g" data-act="batch-toggle" data-i="${i}" style="padding:0;cursor:pointer;outline:${i === 0 || B.starts.has(i) ? '3px solid var(--accent)' : 'none'};outline-offset:-3px"><img src="${u}" alt=""><span class="tag chip ${gi % 2 ? 'info' : 'accent'}">A${gi + 1}</span></button>`; }).join('')}</div>
    <div class="row" style="margin-top:14px"><button class="btn primary" data-act="batch-run">${icon('sparkle')}${groups.length} Artikel anlegen${aiImagesAvailable() ? ' & analysieren' : ''}</button><button class="btn ghost" data-act="batch-reset">Verwerfen</button></div>`;
}
function batchRender() { const c = $('#batch-card'); if (c) { c.innerHTML = batchHTML(); bindBatch(); } }
function bindBatch() { const f = $('#batch-files'); if (f) f.addEventListener('change', () => { if (!f.files.length) return; const B = S.batch; B.files = [...f.files].filter((x) => /^image\//.test(x.type) || /\.(jpe?g|png|webp|heic)$/i.test(x.name)); B.urls.forEach((u) => URL.revokeObjectURL(u)); B.urls = B.files.map((x) => URL.createObjectURL(x)); batchAutoGroup(); batchRender(); }); }
function batchAutoGroup() { const B = S.batch; B.starts = new Set(); for (let i = 0; i < B.files.length; i += B.per) B.starts.add(i); }
ACT['batch-pick'] = () => $('#batch-files').click();
ACT['batch-per'] = (el) => { S.batch.per = +el.dataset.v; batchAutoGroup(); batchRender(); };
ACT['batch-toggle'] = (el) => { const i = +el.dataset.i; if (i === 0) return; const st = S.batch.starts; if (st.has(i)) st.delete(i); else st.add(i); batchRender(); };
ACT['batch-reset'] = () => { const B = S.batch; B.urls.forEach((u) => URL.revokeObjectURL(u)); S.batch = { files: [], urls: [], starts: new Set([0]), per: B.per, running: false, log: [], done: [] }; batchRender(); };
ACT['batch-run'] = async () => {
  const B = S.batch; if (B.running) return;
  const groups = batchGroups(); B.running = true; B.log = []; B.done = [];
  const log = (t) => { B.log.push(t); batchRender(); };
  try {
    for (const [gi, g] of groups.entries()) {
      log(`Artikel ${gi + 1}/${groups.length}: Fotos werden gespeichert…`);
      const id = await createItem();
      await addImagesToItem(id, g.map((i) => B.files[i]));
      B.done.push(id);
    }
    if (aiImagesAvailable()) {
      for (const [gi, id] of B.done.entries()) {
        log(`Artikel ${gi + 1}/${B.done.length}: KI-Analyse…`);
        await runAnalysis(id, '');
        if (S.settings.autoListing !== false) { const p = ['Vinted', 'Kleinanzeigen', 'eBay'].includes(S.settings.defaultChannel) ? S.settings.defaultChannel : 'Vinted'; autoTried.add(id + p); genListing(id, p, { ask: false, quiet: true }); }
      }
    }
    log(`✓ Fertig: ${B.done.length} Artikel angelegt${aiImagesAvailable() ? ' und analysiert' : ''}. Prüfe die Daten in den einzelnen Artikeln.`);
  } catch (e) { log('⚠ Abgebrochen: ' + (e.message || dbMsg(e))); }
  finally { B.running = false; batchRender(); buildNav(); }
};

async function startNewItem(files) {
  let id;
  try { id = await createItem(); } catch (e) { toast('Artikel konnte nicht angelegt werden: ' + dbMsg(e), 'bad'); return; }
  S.itemTab = 'fotos';
  go('artikel', id);
  const n = await addImagesToItem(id, files);
  if (S.view === 'artikel' && S.param === id) { S.itemTab = 'daten'; render(); }
  if (n && aiImagesAvailable()) {
    await runAnalysis(id, '');
    if (S.settings.autoListing !== false) {
      const p = ['Vinted', 'Kleinanzeigen', 'eBay'].includes(S.settings.defaultChannel) ? S.settings.defaultChannel : 'Vinted';
      autoTried.add(id + p);
      genListing(id, p, { ask: false, quiet: true });
    }
  }
}

/* ================= Artikel-Editor ================= */
const ITEM_TABS = [['uebersicht', 'Übersicht'], ['fotos', 'Fotos'], ['daten', 'Daten'], ['preis', 'Preis'], ['bilder', 'Bildstudio'], ['anzeige', 'Anzeige'], ['verkauf', 'Verkauf']];
const TAB_RENDER = {};

function tabDone(it, t) {
  return {
    fotos: (it.images || []).length > 0, daten: !!(it.brand || it.category || it.productType), preis: RL.n0(it.listPrice) > 0,
    bilder: (it.images || []).some((i) => i.kind === 'studio'), anzeige: Object.values(it.listing || {}).some((l) => l && l.title), verkauf: it.status === 'Verkauft',
  }[t];
}
const SOURCE_DEFAULTS = ['Flohmarkt', 'Kiloware', 'Second-Hand-Laden', 'Sozialkaufhaus', 'Vinted', 'Kleinanzeigen', 'eBay', 'Eigener Kleiderschrank', 'Geschenkt'];
/** Eingabevorschläge aus bereits erfassten Artikeln */
function datalistsHTML() {
  const keys = ['brand', 'productType', 'size', 'color', 'material', 'fit', 'pattern', 'labelText', 'location', 'source'];
  return keys.map((k) => {
    const cnt = new Map();
    for (const i of S.items) { const v = String(i[k] || '').trim(); if (v) cnt.set(v, (cnt.get(v) || 0) + 1); }
    if (k === 'source') SOURCE_DEFAULTS.forEach((v) => { if (!cnt.has(v)) cnt.set(v, 0); });
    const vals = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([v]) => v);
    return `<datalist id="dl-${k}">${vals.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;
  }).join('');
}
function completenessHTML(it) {
  if (it.status === 'Verkauft') return '';
  const miss = RL.missingFields(it);
  if (!miss.length) return '<span class="chip ok">✓ Vollständig</span>';
  return `<span class="chip warn" title="Fehlende Angaben">Fehlt: ${miss.map((m) => `<button class="link" style="font:inherit;color:inherit;text-decoration:underline" data-act="next-tab" data-tab="${m.tab}">${esc(m.label)}</button>`).join(', ')}</span>`;
}

VIEW_RENDER.artikel = () => {
  const it = itemById(S.param);
  if (!it) return `<div class="card empty"><h3>Artikel nicht gefunden</h3><p>Vielleicht wurde er gelöscht.</p><button class="btn" data-nav="inventar">Zum Inventar</button></div>`;
  const tab = S.itemTab;
  return `
  <div class="row" style="margin-bottom:14px"><button class="btn sm ghost" data-nav="inventar">${icon('back')}Inventar</button><span class="tiny muted" id="save-state-2"></span></div>
  <div class="page-head item-head" style="align-items:center">
    <div class="row" style="gap:14px;flex-wrap:nowrap;min-width:0">${thumbHTML(it, 'thumb')}<div style="min-width:0"><h1 id="item-title" class="ellipsis" style="font-size:clamp(20px,5vw,26px)">${esc(displayTitle(it))}</h1><div class="tiny muted mono" style="margin-top:4px">${skuLabel(it)} · erstellt ${fmtDate(it.createdAt)}</div><div id="item-complete" style="margin-top:6px">${completenessHTML(it)}</div></div></div>
    <div class="row"><label class="f" style="min-width:170px"><span>Status</span>${sel('status', RL.STATUSES, it.status, 'data-f="status" id="f-status"')}</label>
      <button class="btn sm" data-act="dup-item" data-id="${it.id}" style="align-self:flex-end;height:38px" title="Kopie ohne Fotos anlegen, z. B. für gleiche Ware in anderer Größe">Duplizieren</button>
      <button class="btn danger sm" data-act="delete-item" data-id="${it.id}" style="align-self:flex-end;height:38px">${icon('trash')}Löschen</button></div>
  </div>
  <div class="steps">${ITEM_TABS.map(([k, l], i) => `<button data-act="item-tab" data-tab="${k}" class="${k === tab ? 'on' : ''} ${tabDone(it, k) && k !== tab ? 'done' : ''}"><i>${k === 'uebersicht' ? '★' : tabDone(it, k) && k !== tab ? '✓' : i}</i>${l}</button>`).join('')}</div>
  <div id="progress" class="loading-line" style="display:none;margin-bottom:12px"></div>
  <div id="tab-body">${(TAB_RENDER[tab] || TAB_RENDER.fotos)(it)}</div>${datalistsHTML()}`;
};
AFTER.artikel = () => { const it = itemById(S.param); if (it && TAB_AFTER[S.itemTab]) TAB_AFTER[S.itemTab](it); if (it) setTimeout(() => autoMeasure(it.id), 300); };
const TAB_AFTER = {};

function refreshItemHeader() {
  if (S.view !== 'artikel') return;
  const it = itemById(S.param); if (!it) return;
  const t = $('#item-title'); if (t) t.textContent = displayTitle(it);
  const c = $('#item-complete'); if (c) c.innerHTML = completenessHTML(it);
  const st = $('#f-status'); if (st && document.activeElement !== st) st.value = it.status;
}

ACT['item-tab'] = (el) => { flushAll(); S.itemTab = el.dataset.tab; render(); };
ACT['next-tab'] = (el) => { S.itemTab = el.dataset.tab; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
ACT['dup-item'] = async (el) => {
  const it = itemById(el.dataset.id); if (!it) return;
  const keep = ['title', 'brand', 'productType', 'category', 'gender', 'size', 'color', 'colors', 'material', 'fit', 'pattern', 'condition', 'features', 'defects', 'labelText', 'measurements', 'measurementsSource', 'purchasePrice', 'purchaseDate', 'listPrice', 'minPrice', 'channel', 'listing', 'pricing', 'autoDrop', 'location', 'notes'];
  const data = {}; for (const k of keep) if (it[k] !== undefined) data[k] = clone(it[k]);
  try { const id = await createItem({ ...data, status: 'In Bearbeitung' }); S.itemTab = 'fotos'; go('artikel', id); toast('Kopie angelegt – füge die Fotos hinzu und passe Größe/Zustand an.'); }
  catch (e) { toast('Duplizieren fehlgeschlagen: ' + dbMsg(e), 'bad'); }
};
ACT['delete-item'] = async (el) => {
  const it = itemById(el.dataset.id);
  if (!it || !(await confirmDialog('Artikel löschen?', `„${esc(displayTitle(it))}“ und seine Bilder werden endgültig gelöscht.`, 'Löschen', true))) return;
  try { await deleteItems([it.id]); toast('Artikel gelöscht'); go('inventar'); } catch (e) { toast('Löschen fehlgeschlagen: ' + dbMsg(e), 'bad'); }
};
const nextBtn = (tab, label) => `<div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn dark" data-act="next-tab" data-tab="${tab}">${label}${icon('arrow')}</button></div>`;

/* ---- Tab: Übersicht (Schnellzugriff für fertige Artikel) ---- */
const SELL_URLS = { Vinted: 'https://www.vinted.de/items/new', Kleinanzeigen: 'https://www.kleinanzeigen.de/p-anzeige-aufgeben.html', eBay: 'https://www.ebay.de/sl/sell' };
TAB_RENDER.uebersicht = (it) => {
  const p = S.listingPlatform; const L = (it.listing && it.listing[p]) || {};
  const imgs = it.images || []; const busy = S.busy['ls-' + it.id];
  const ch = it.channel || S.settings.defaultChannel;
  const prof = RL.n0(it.listPrice) > 0 ? RL.calcProfit(S.settings, { price: it.listPrice, purchase: it.purchasePrice, channel: ch }) : null;
  const facts = [['📦 Lagerplatz', it.location], ['Marke', it.brand], ['Typ', it.productType || it.category], ['Größe', it.size], ['Farbe', it.color], ['Zustand', it.condition],
    ['Maße', [it.measurements && RL.n0(it.measurements.length) > 0 && 'L ' + it.measurements.length, it.measurements && RL.n0(it.measurements.chest) > 0 && 'B ' + it.measurements.chest].filter(Boolean).join(' · ') + (it.measurements && (RL.n0(it.measurements.length) || RL.n0(it.measurements.chest)) ? ' cm' : '')]].filter(([, v]) => v);
  return `<div class="grid g-main">
  <div class="stack">
    <div class="card"><div class="row between" style="margin-bottom:12px"><h2 style="margin:0">Status</h2><span class="small muted">${it.onlineSince && it.status === 'Online' ? 'online seit ' + fmtDate(it.onlineSince) : ''}</span></div>
      <div class="seg" style="width:100%">${['Auf Lager', 'Online', 'Reserviert', 'Verkauft'].map((s) => `<button class="${it.status === s ? 'on' : ''}" data-act="quick-status" data-v="${s}" style="flex:1">${s}</button>`).join('')}</div>
      <div class="row" style="margin-top:14px;gap:18px">
        <div><div class="tiny muted">Preis</div><b style="font-size:20px">${RL.n0(it.listPrice) > 0 ? eur(it.listPrice) : '–'}</b></div>
        <div><div class="tiny muted">Mindestpreis</div><b>${RL.n0(it.minPrice) > 0 ? eur(it.minPrice) : '–'}</b></div>
        <div><div class="tiny muted">EK</div><b>${RL.n0(it.purchasePrice) > 0 ? eur(it.purchasePrice) : '–'}</b></div>
        ${prof ? `<div><div class="tiny muted">Gewinn</div><b style="color:${prof.profit < 0 ? 'var(--bad)' : 'var(--ok)'}">${eur(prof.profit)}</b></div>` : ''}
        <button class="btn sm ghost" data-act="next-tab" data-tab="preis" style="margin-left:auto">Preis ändern</button>
      </div></div>
    <div class="card"><div class="row between" style="margin-bottom:12px"><h2 style="margin:0">Hochladen</h2><div class="seg">${['Vinted', 'Kleinanzeigen', 'eBay'].map((x) => `<button class="${x === p ? 'on' : ''}" data-act="set-platform" data-p="${x}">${x}</button>`).join('')}</div></div>
      ${busy ? '<div class="loading-line"><span class="spin"></span>Anzeigentext wird automatisch erstellt…</div>' : L.description ? `<div class="note" style="white-space:pre-wrap;max-height:260px;overflow:auto;font-size:13.5px"><b>${esc(L.title)}</b>\n\n${esc(L.description)}</div>` : '<div class="note small">Noch kein Text für ' + esc(p) + '.</div>'}
      <div class="stack" style="margin-top:12px">
        <div class="row"><span class="chip mono">1</span><button class="btn dark" data-act="copy-l" data-k="all" ${L.description ? '' : 'disabled'}>${icon('copy')}Titel + Beschreibung kopieren</button><button class="btn sm" data-act="copy-l" data-k="title" ${L.title ? '' : 'disabled'}>Nur Titel</button></div>
        <div class="row"><span class="chip mono">2</span><button class="btn" data-act="dl-all-imgs" ${imgs.length ? '' : 'disabled'}>${icon('download')}${imgs.length} Bilder herunterladen</button></div>
        <div class="row"><span class="chip mono">3</span><a class="btn" href="${SELL_URLS[p]}" target="_blank" rel="noopener">${esc(p)} öffnen ↗</a><span class="tiny muted">einfügen & Bilder hochladen</span></div>
        <div class="row"><span class="chip mono">4</span><button class="btn primary" data-act="mark-online" ${it.status === 'Online' && it.channel === p ? 'disabled' : ''}>${icon('check')}${it.status === 'Online' && it.channel === p ? 'Ist auf ' + esc(p) + ' online' : 'Als online auf ' + esc(p) + ' markieren'}</button></div>
      </div>
      <p class="tiny muted" style="margin:10px 0 0">${esc(PLATFORM_NOTE[p])}</p></div>
  </div>
  <div class="stack">
    <div class="card" style="padding:12px">${imgs.length ? `<img src="${esc(imgSrc(imgs[0]))}" alt="" style="width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:10px;background:var(--line-2)">
      <div class="row" style="gap:6px;margin-top:8px">${imgs.slice(1, 7).map((m) => `<img class="thumb" src="${esc(m.thumb || imgSrc(m))}" alt="">`).join('')}</div>` : '<div class="empty small">Keine Fotos</div>'}</div>
    <div class="card"><h3>Daten</h3>${facts.map(([k, v]) => `<div class="row between small" style="padding:4px 0;border-bottom:1px solid var(--line-2)"><span class="muted">${k}</span><span>${esc(v)}</span></div>`).join('') || '<p class="small muted">Keine Daten</p>'}
      <div class="row" style="margin-top:12px"><button class="btn sm" data-act="next-tab" data-tab="daten">Daten bearbeiten</button><button class="btn sm" data-act="next-tab" data-tab="anzeige">Text bearbeiten</button><button class="btn sm" data-act="next-tab" data-tab="bilder">Bilder</button></div></div>
  </div></div>`;
};
TAB_AFTER.uebersicht = (it) => TAB_AFTER.anzeige(it);
ACT['quick-status'] = (el) => {
  const it = itemById(S.param); const v = el.dataset.v; if (!it || it.status === v) return;
  if (v === 'Verkauft') { S.itemTab = 'verkauf'; render(); return; }
  if (v === 'Online') { S.listingPlatform = ['Vinted', 'Kleinanzeigen', 'eBay'].includes(it.channel) ? it.channel : S.listingPlatform; }
  onStatusChange(it, v).then(() => toast('Status: ' + v));
};

/* ---- Tab: Fotos ---- */
TAB_RENDER.fotos = (it) => {
  const imgs = it.images || [];
  return `<div class="card"><div class="row between" style="margin-bottom:12px"><h2 style="margin:0">Fotos <span class="muted small">(${imgs.length}/12)</span></h2><span class="small muted">Reihenfolge: Bild ziehen (am Handy kurz gedrückt halten) · das erste Bild ist das Titelbild.</span></div>
  <div class="gallery" id="item-gallery">
    ${imgs.map((m, i) => `<div class="g" data-gi="${i}"><img src="${esc(imgSrc(m))}" alt="" loading="lazy" draggable="false"><span class="gnum">${i + 1}</span>
      <span class="tag chip ${m.kind === 'studio' ? 'accent' : ''}">${i === 0 ? 'Titelbild' : m.kind === 'studio' ? 'Studio' : 'Original'}</span>
      <div class="acts">${i ? `<button class="icon-btn" title="Nach vorne" data-act="img-move" data-i="${i}" data-d="-1">‹</button>` : ''}${i < imgs.length - 1 ? `<button class="icon-btn" title="Nach hinten" data-act="img-move" data-i="${i}" data-d="1">›</button>` : ''}${i ? `<button class="icon-btn" title="Als Titelbild" data-act="img-main" data-i="${i}">${icon('star')}</button>` : ''}<button class="icon-btn" title="Herunterladen" data-act="img-dl" data-i="${i}">${icon('download')}</button><button class="icon-btn" title="Löschen" data-act="img-del" data-i="${i}">${icon('trash')}</button></div></div>`).join('')}
    ${imgs.length < 12 ? `<div class="g drop" data-act="pick-item-files" id="item-drop" style="padding:10px;display:grid;place-items:center;border-style:dashed"><div><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round">${ICONS.new}</svg><div class="small" style="margin-top:4px">Fotos hinzufügen</div></div></div>` : ''}
  </div><input type="file" id="item-files" accept="image/*" multiple hidden><input type="file" id="item-cam" accept="image/*" capture="environment" hidden>
  ${imgs.length < 12 ? `<button class="btn show-m" style="width:100%;margin-top:12px" data-act="pick-item-cam">${icon('camera')}Weiteres Foto aufnehmen</button>` : ''}
  <p class="small muted" style="margin:14px 0 0">Tipp: Etikett mit Marke, Größe und Material gut lesbar fotografieren. <b>Für exakte Maße</b>: Teil glatt flach hinlegen, ein Maßband quer von Achsel zu Achsel und eins vom Kragen bis zum Saum anlegen und von oben fotografieren – so kannst du die Werte später genau ablesen.</p></div>
  ${nextBtn('daten', 'Weiter zu Daten')}`;
};
TAB_AFTER.fotos = (it) => {
  bindGallerySort(it.id);
  const inp = $('#item-files'), drop = $('#item-drop');
  if (inp) inp.addEventListener('change', async () => { if (inp.files.length) { await addImagesToItem(it.id, [...inp.files]); render(); } });
  const cam = $('#item-cam'); if (cam) cam.addEventListener('change', async () => { if (cam.files.length) { await addImagesToItem(it.id, [...cam.files]); render(); } });
  if (drop) {
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', async (e) => { const f = [...(e.dataTransfer.files || [])]; if (f.length) { await addImagesToItem(it.id, f); render(); } });
  }
};
ACT['pick-item-files'] = () => $('#item-files').click();
async function saveImageOrder(id, order) {
  const it = itemById(id); if (!it) return;
  const imgs = order.map((i) => it.images[i]).filter(Boolean);
  if (imgs.length !== it.images.length || order.every((v, k) => v === k)) { render(); return; }
  await patchItem(id, { images: imgs }, { immediate: true }); render();
}
ACT['img-move'] = (el) => {
  const it = itemById(S.param); const i = +el.dataset.i, j = i + +el.dataset.d; if (!it || j < 0 || j >= it.images.length) return;
  const order = it.images.map((_, k) => k); [order[i], order[j]] = [order[j], order[i]]; saveImageOrder(it.id, order);
};
/** Fotos per Ziehen sortieren (Maus sofort, Touch nach kurzem Halten) */
function bindGallerySort(id) {
  const g = $('#item-gallery'); if (!g) return;
  let d = null;
  const start = () => { d.on = true; d.el.classList.add('dragging'); g.classList.add('sorting'); if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) { /* */ } };
  g.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.g[data-gi]'); if (!el || e.target.closest('button') || e.button > 0) return;
    d = { el, x: e.clientX, y: e.clientY, on: false, touch: e.pointerType !== 'mouse', id: e.pointerId };
    if (d.touch) d.timer = setTimeout(() => { if (d) start(); }, 260);
  });
  g.addEventListener('pointermove', (e) => {
    if (!d) return;
    const dist = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (!d.on) { if (d.touch) { if (dist > 8) { clearTimeout(d.timer); d = null; } return; } if (dist < 5) return; start(); }
    e.preventDefault();
    const over = document.elementFromPoint(e.clientX, e.clientY); const t = over && over.closest('.g[data-gi]');
    if (!t || t === d.el || t.parentNode !== g) return;
    const tiles = [...g.querySelectorAll('.g[data-gi]')];
    g.insertBefore(d.el, tiles.indexOf(t) > tiles.indexOf(d.el) ? t.nextSibling : t);
  });
  g.addEventListener('touchmove', (e) => { if (d && d.on) e.preventDefault(); }, { passive: false });
  const end = () => {
    if (!d) return; clearTimeout(d.timer);
    const was = d.on; d.el.classList.remove('dragging'); g.classList.remove('sorting'); d = null;
    if (!was) return;
    g.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
    saveImageOrder(id, [...g.querySelectorAll('.g[data-gi]')].map((x) => +x.dataset.gi));
  };
  g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
  g.addEventListener('contextmenu', (e) => { if (d) e.preventDefault(); });
}
ACT['img-main'] = async (el) => { const it = itemById(S.param); const imgs = it.images.slice(); const [m] = imgs.splice(+el.dataset.i, 1); imgs.unshift(m); await patchItem(it.id, { images: imgs }, { immediate: true }); render(); };
ACT['img-del'] = async (el) => {
  const it = itemById(S.param); const i = +el.dataset.i; const m = it.images[i];
  if (!(await confirmDialog('Bild löschen?', 'Das Bild wird endgültig entfernt.', 'Löschen', true))) return;
  const imgs = it.images.slice(); imgs.splice(i, 1);
  await patchItem(it.id, { images: imgs }, { immediate: true });
  if (m.aid && S.assets) { try { await S.assets.delete(m.aid); } catch (e) { /* bereits entfernt */ } }
  render();
};
ACT['img-dl'] = async (el) => {
  const it = itemById(S.param); const m = it.images[+el.dataset.i];
  try { const b = await getImageBlob(m); const ext = /png/.test(b.type) ? 'png' : 'jpg'; await saveFile(`${it.sku}-${+el.dataset.i + 1}.${ext}`, b); } catch (e) { toast('Bild nicht verfügbar: ' + e.message, 'bad'); }
};

/* ---- Tab: Daten & KI-Analyse ---- */
const FIELD_LABELS = { brand: 'Marke', productType: 'Produkttyp', category: 'Kategorie', gender: 'Zielgruppe', size: 'Größe', color: 'Farbe', material: 'Material', fit: 'Schnitt', pattern: 'Muster', condition: 'Zustand', labelText: 'Etikett-Text', features: 'Merkmale', defects: 'Gebrauchsspuren' };
const CONF_KEY = { brand: 'brand', category: 'category', size: 'size', color: 'color', material: 'material' };

function fieldHTML(it, key, opts = {}) {
  const ai = (it.aiFields || []).includes(key);
  const conf = ai && it.analysis && CONF_KEY[key] !== undefined ? it.analysis.confidence[CONF_KEY[key]] : null;
  const label = `<span>${esc(opts.label || FIELD_LABELS[key] || key)}${ai ? ` <span class="ai-badge" title="Von der KI erkannt – bitte prüfen">KI${conf !== null && conf !== undefined ? ' ' + Math.round(conf * 100) + '%' : ''}</span>` : ''}${opts.hint ? ` <span class="tiny">${opts.hint}</span>` : ''}</span>`;
  const cls = `in ${ai ? 'ai' : ''}`;
  let input;
  if (opts.options) input = sel(key, [['', '– wählen –'], ...opts.options], it[key], `class="${cls}" data-f="${key}" id="f-${key}"`).replace('<select class="in"', '<select');
  else if (opts.lines) input = `<textarea class="${cls}" data-f="${key}" data-type="lines" id="f-${key}" rows="3" placeholder="${esc(opts.ph || 'eine Angabe pro Zeile')}">${esc((it[key] || []).join('\n'))}</textarea>`;
  else input = `<input class="${cls}" data-f="${key}" id="f-${key}" list="dl-${key}" autocomplete="off" value="${esc(it[key] ?? '')}" placeholder="${esc(opts.ph || '')}">`;
  return `<label class="f ${opts.span || ''}">${label}${input}</label>`;
}

TAB_RENDER.daten = (it) => {
  const busy = S.busy['an-' + it.id];
  const a = it.analysis;
  const imgCount = (it.images || []).filter((i) => i.kind !== 'studio').length;
  const m = it.measurements || {};
  const mAi = (it.aiFields || []).includes('measurements');
  const mIn = (k, l) => `<label class="f"><span>${l}</span><input class="in ${mAi && RL.n0(m[k]) > 0 ? 'ai' : ''}" type="number" step="0.5" min="0" data-f="measurements.${k}" data-type="num" id="f-m-${k}" value="${esc(numVal(m[k]))}" placeholder="cm"></label>`;
  const analysisCard = !aiImagesAvailable() && !a && !busy ? '' : `<div class="card"><h2>KI-Produktanalyse</h2>
    ${busy ? `<div class="loading-line" style="margin:6px 0 12px"><span class="spin"></span>${esc(busy.msg || 'KI analysiert die Fotos…')}</div><button class="btn sm" data-act="stop-busy" data-k="an-${it.id}">Abbrechen</button>`
    : !aiImagesAvailable() ? ''
    : !imgCount ? '<div class="note">Lade zuerst Fotos hoch, damit die KI den Artikel erkennen kann.</div>'
    : `<p class="sub" style="margin:-4px 0 10px">${imgCount} Foto(s) · Von dir geänderte Felder werden nicht überschrieben.</p>
       <label class="f"><span>Hinweise für die KI (optional)</span><input class="in" id="an-hints" placeholder="z. B. Herren, Etikett ist ausgewaschen"></label>
       <button class="btn primary" style="margin-top:10px;width:100%" data-act="run-analysis">${icon('sparkle')}${a ? 'Erneut analysieren' : 'KI-Analyse starten'}</button>`}
    ${a ? `<hr><p style="margin:0 0 10px">${esc(a.summary || '')}</p>
      <div class="row" style="gap:6px;margin-bottom:12px">${Object.entries(a.confidence).map(([k, v]) => `<span class="chip ${v >= 0.75 ? 'ok' : v >= 0.45 ? 'warn' : 'bad'}">${esc(FIELD_LABELS[k] || k)} ${Math.round(v * 100)}%</span>`).join('')}</div>
      <div class="tiny muted" style="margin-top:10px">Analysiert am ${fmtDate(a.at)} · Größe: ${esc(a.sizeSource || '–')} · Material: ${esc(a.materialSource || '–')} · Marke: ${esc(a.brandEvidence || '–')}</div>` : ''}
  </div>`;
  return `<div class="grid g-main">
    <div class="card"><div class="row between"><h2>Produktdaten</h2><span class="tiny muted">Änderungen werden automatisch gespeichert</span></div>
      <div class="fgrid">
        <label class="f span4"><span>Interner Titel <span class="tiny">(optional – sonst aus Marke/Typ/Größe)</span></span><input class="in" data-f="title" id="f-title" value="${esc(it.title || '')}" placeholder="${esc(displayTitle({ ...it, title: '' }))}"></label>
        ${fieldHTML(it, 'brand', { ph: 'z. B. Polo Ralph Lauren' })}${fieldHTML(it, 'productType', { ph: 'z. B. Polo Shirt' })}
        ${fieldHTML(it, 'category', { options: RL.CATEGORIES })}${fieldHTML(it, 'gender', { options: RL.GENDERS })}
        ${fieldHTML(it, 'size', { ph: 'z. B. L, 32/32, 42' })}${fieldHTML(it, 'color', { ph: 'z. B. Schwarz' })}
        ${fieldHTML(it, 'material', { ph: 'z. B. 100 % Baumwolle' })}${fieldHTML(it, 'fit', { ph: 'z. B. Slim Fit' })}
        ${fieldHTML(it, 'pattern', { ph: 'z. B. unifarben' })}${fieldHTML(it, 'condition', { options: RL.CONDITIONS })}
        ${fieldHTML(it, 'features', { lines: true, span: 'span2', ph: 'z. B. Logo-Stickerei auf der Brust' })}${fieldHTML(it, 'defects', { lines: true, span: 'span2', label: 'Gebrauchsspuren / Mängel', ph: 'z. B. leichtes Pilling am Bund' })}
        ${fieldHTML(it, 'labelText', { span: 'span4', label: 'Etikett-Informationen' })}
      </div>
      <div class="row between" style="margin:18px 0 8px"><h3 style="margin:0">Maße <span class="muted small">(flach gemessen, in cm)</span> ${(it.aiFields || []).includes('measurements') ? `<span class="ai-badge" title="Von der KI ermittelt">KI · ${esc(it.measurementsSource || '')}</span>` : ''}</h3>
        ${S.busy['ms-' + it.id] ? '<span class="loading-line small"><span class="spin"></span>Maße werden ermittelt…</span>' : `<button class="btn sm" data-act="run-measure" ${aiImagesAvailable() && imgCount ? '' : 'disabled'}>${icon('sparkle')}Neu ermitteln</button>`}</div>
      ${(it.aiFields || []).includes('measurements') && /geschätzt/.test(it.measurementsSource || '') ? '<div class="note warn small" style="margin-bottom:10px">Diese Maße sind aus der Größe <b>geschätzt</b> und erscheinen in der Anzeige mit „ca.“. Für exakte Werte: Kleidungsstück flach hinlegen und mit Maßband im Bild fotografieren – dann liest die KI die Werte ab. Sobald du einen Wert änderst, gilt er als geprüft.</div>' : ''}
      <div class="fgrid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${mIn('length', 'Länge')}${mIn('chest', 'Brustweite')}${mIn('shoulder', 'Schulter')}</div>
      <h3 style="margin:18px 0 8px">Einkauf & Notizen</h3>
      <div class="fgrid">
        <label class="f"><span>Einkaufspreis (€)</span><input class="in" type="number" step="0.01" min="0" data-f="purchasePrice" data-type="num" id="f-purchasePrice" value="${esc(numVal(it.purchasePrice))}"></label>
        <label class="f"><span>Einkaufsdatum</span><input class="in" type="date" data-f="purchaseDate" id="f-purchaseDate" value="${esc(it.purchaseDate || '')}"></label>
        ${Object.keys(S.settings.sheetTabs || {}).length ? `<label class="f"><span>👤 Person (Tabelle)</span>${sel('owner', [['', '– keine –'], ...Object.keys(S.settings.sheetTabs).map((o) => [o, o])], it.owner || '', 'data-f="owner" id="f-owner"')}</label>` : ''}
        <label class="f"><span>📦 Lagerplatz</span><input class="in" data-f="location" id="f-location" list="dl-location" autocomplete="off" value="${esc(it.location || '')}" placeholder="z. B. Box 3, Regal A"></label>
        <label class="f"><span>Notizen</span><input class="in" data-f="notes" id="f-notes" value="${esc(it.notes || '')}"></label>
      </div>
    </div>
    <div class="stack">${analysisCard}</div>
  </div>${nextBtn('preis', 'Weiter zum Preis')}`;
};

ACT['run-analysis'] = () => { const h = $('#an-hints'); runAnalysis(S.param, h ? h.value.trim() : ''); };
ACT['stop-busy'] = (el) => { const b = S.busy[el.dataset.k]; if (b && b.ctl) b.ctl.abort(); };

async function runAnalysis(id, hints) {
  const it = itemById(id); if (!it) return;
  if (!aiImagesAvailable()) { toast(AI_ERR.images_unavailable, 'bad'); return; }
  const key = 'an-' + id;
  if (S.busy[key]) return;
  const max = Math.max(1, Math.min(6, (S.sampleLimits.images && S.sampleLimits.images.maxCount) || 4));
  const imgs = (it.images || []).filter((i) => i.kind !== 'studio').slice(0, max);
  if (!imgs.length) { toast('Keine Fotos vorhanden.', 'bad'); return; }
  const ctl = new AbortController();
  S.busy[key] = { ctl, msg: `KI analysiert ${imgs.length} Foto(s)… (beim ersten Mal fragt Claude nach Zustimmung)` };
  rerenderIf(id, 'daten');
  try {
    const blobs = [];
    for (const m of imgs) blobs.push(await getImageBlob(m));
    const j = await S.sample.json(AI.analysisPrompt(hints, blobs.length), { images: blobs, signal: ctl.signal, modelTier: 'default', cache: false });
    const a = AI.normalizeAnalysis(j);
    const cur = itemById(id); if (!cur) return;
    const aiPrev = new Set(cur.aiFields || []);
    const patch = { analysis: { ...a, at: Date.now() } };
    const aiNow = new Set([...aiPrev]);
    for (const k of ['brand', 'productType', 'category', 'gender', 'size', 'color', 'material', 'fit', 'pattern', 'condition', 'labelText', 'features', 'defects']) {
      const v = a[k];
      const empty = Array.isArray(v) ? !v.length : !v;
      if (empty) continue;
      const curEmpty = Array.isArray(cur[k]) ? !cur[k].length : !cur[k];
      if (curEmpty || aiPrev.has(k)) { patch[k] = v; aiNow.add(k); }
    }
    patch.aiFields = [...aiNow];
    await patchItem(id, patch, { immediate: true });
    toast('Analyse abgeschlossen – Maße werden ermittelt…');
    await measureItem(id, { auto: true, imgsBlobs: blobs });
  } catch (e) {
    if (e && e.code !== 'cancelled') toast('Analyse fehlgeschlagen: ' + aiErr(e), 'bad');
  } finally {
    delete S.busy[key];
    rerenderIf(id, 'daten');
  }
}
async function measureItem(id, { auto = false, imgsBlobs = null } = {}) {
  const it = itemById(id); if (!it || !aiImagesAvailable()) return;
  const key = 'ms-' + id; if (S.busy[key]) return;
  const hasManual = Object.values(it.measurements || {}).some((x) => RL.n0(x) > 0) && !(it.aiFields || []).includes('measurements');
  if (hasManual) { if (auto) return; if (!(await confirmDialog('Maße überschreiben?', 'Es sind bereits Maße eingetragen. Sollen sie durch die KI-Werte ersetzt werden?', 'Ersetzen'))) return; }
  const max = Math.max(1, Math.min(6, (S.sampleLimits.images && S.sampleLimits.images.maxCount) || 4));
  const ctl = new AbortController(); S.busy[key] = { ctl }; rerenderIf(id, 'daten');
  try {
    let blobs = imgsBlobs;
    if (!blobs) { blobs = []; for (const m of (it.images || []).filter((i) => i.kind !== 'studio').slice(0, max)) blobs.push(await getImageBlob(m)); }
    // „complex“: sorgfältigstes Modell für das Ablesen von Maßbändern
    const j = await S.sample.json(AI.measurePrompt(itemById(id), blobs.length), { images: blobs, signal: ctl.signal, modelTier: 'complex', cache: false });
    const r = AI.normMeas(j);
    const mk = measureKeyOf(itemById(id));
    if (!Object.values(r.values).some((x) => x > 0)) { await patchItem(id, { measureKey: mk, measureNote: r.note || 'Keine Maße ermittelbar – bitte Größe angeben oder mit Maßband fotografieren.' }, { immediate: true }); if (!auto) toast('Keine Maße ermittelbar – trage die Größe ein oder fotografiere mit Maßband.', 'bad'); return; }
    const vals = { length: r.values.length || null, chest: r.values.chest || null, shoulder: r.values.shoulder || null };
    const ai = new Set(itemById(id).aiFields || []); ai.add('measurements');
    await patchItem(id, { measureKey: mk, measurements: vals, measurementsSource: r.source, measureNote: [r.confidence && 'Sicherheit: ' + r.confidence, r.note].filter(Boolean).join(' · '), aiFields: [...ai] }, { immediate: true });
    await syncListingMeasures(id);
toast(r.source === 'Maßband im Foto' ? 'Maße vom Maßband abgelesen – bitte kurz prüfen.' : 'Maße aus der Größe geschätzt – für exakte Werte mit Maßband fotografieren.');
  } catch (e) { if (e && e.code !== 'cancelled') toast('Maße konnten nicht ermittelt werden: ' + aiErr(e), 'bad'); }
  finally { delete S.busy[key]; rerenderIf(id, 'daten'); }
}
ACT['run-measure'] = () => measureItem(S.param);
/** Fotos + Größe, aus denen die Maße stammen – ändert sich etwas, wird neu ermittelt */
const measureKeyOf = (it) => (it.images || []).filter((m) => m.kind !== 'studio').slice(0, 6).map((m) => m.aid || m.key || '').join(',') + '|' + (it.size || '');
const measureTried = {};
/** Maße automatisch ermitteln – ohne Knopf: neue Fotos, geänderte Größe oder noch keine Maße */
function autoMeasure(id) {
  const it = itemById(id); if (!it || S.readOnly || !aiImagesAvailable()) return;
  if (S.busy['ms-' + id] || S.busy['an-' + id]) return; // Analyse ermittelt die Maße am Ende selbst
  if (!(it.images || []).some((m) => m.kind !== 'studio')) return;
  const manual = Object.values(it.measurements || {}).some((x) => RL.n0(x) > 0) && !(it.aiFields || []).includes('measurements');
  if (manual) return; // selbst eingetragene Maße nie überschreiben
  const key = measureKeyOf(it);
  if (it.measureKey === key || measureTried[id] === key) return;
  measureTried[id] = key;
  measureItem(id, { auto: true });
}
let measSyncT, sizeMeasT;
/** Maße in vorhandene Anzeigentexte übernehmen (alle Plattformen) */
async function syncListingMeasures(id) {
  const it = itemById(id); if (!it || !it.listing) return;
  const patch = {};
  for (const [p, L] of Object.entries(it.listing)) {
    if (!L || !L.description) continue;
    const nd = RL.injectMeasurements(L.description, it, p, S.settings);
    if (nd !== L.description) patch[p] = { description: nd };
  }
  if (!Object.keys(patch).length) return;
  await patchItem(id, { listing: patch }, { immediate: true });
  const ta = $('#lst-desc'); if (ta && S.param === id && patch[S.listingPlatform] && document.activeElement !== ta) ta.value = patch[S.listingPlatform].description;
}
function rerenderIf(id, tab) { if (S.view === 'artikel' && S.param === id && (!tab || S.itemTab === tab)) render(); }

/* ---- Feldänderungen (Artikel) ---- */
function setPath(obj, path, val) { const ks = path.split('.'); const root = {}; let o = root; ks.forEach((k, i) => { if (i === ks.length - 1) o[k] = val; else { o[k] = {}; o = o[k]; } }); return deepMerge(obj, root); }
function readField(el) {
  const t = el.dataset.type;
  if (el.type === 'checkbox') return el.checked;
  if (t === 'num') { const n = RL.num(el.value); return Number.isFinite(n) ? n : null; }
  if (t === 'lines') return el.value.split('\n').map((s) => s.trim()).filter(Boolean);
  return el.value;
}
function onItemField(el, ev) {
  const it = itemById(S.param); if (!it) return;
  const path = el.dataset.f;
  if (path === 'status') { if (ev.type === 'change') onStatusChange(it, el.value); return; }
  if (path === 'owner') { // Person wechseln → passende Lagernummer (nur solange der Artikel noch nicht in der Tabelle steht)
    if (ev.type !== 'change') return;
    if (it.sheetKey && it.owner && el.value && el.value !== it.owner) { // steht schon in der Tabelle → umziehen
      confirmDialog('In anderes Blatt verschieben?', `„${displayTitle(it)}“ steht im Blatt von ${it.owner} (${it.stockNo || 'ohne Lagernummer'}). RELOOP leert dort die Zeile (Formeln bleiben) und trägt den Artikel bei ${el.value} mit neuer Lagernummer ein.`, 'Verschieben').then(async (ok) => {
        if (!ok) { el.value = it.owner; return; }
        try { const no = await sheetMoveItem(it, el.value); toast(`Zu ${el.value} verschoben – neue Lagernummer ${no}`); } catch (e) { toast('Verschieben fehlgeschlagen: ' + (e.message || sheetErr(e)), 'bad'); }
        render();
      });
      return;
    }
    const patch = { owner: el.value };
    if (!it.sheetKey && el.value) patch.stockNo = RL.nextStockNo(S.items.filter((x) => x.id !== it.id), ownerPrefix(el.value));
    patchItem(it.id, patch, { immediate: true }).then(() => render()); return;
  }
  const val = readField(el);
  if (ev.type === 'change') {
    // Preisverlauf nur beim Verlassen des Feldes protokollieren
    if (path === 'listPrice' && it.status === 'Online' && RL.n0(val) > 0) {
      const hist = (it.priceHistory || []).slice(-30);
      if (!hist.length || hist[hist.length - 1].p !== val) patchItem(it.id, { priceHistory: [...hist, { d: RL.today(), p: val }], lastPriceChange: RL.today() });
    }
    return;
  }
  const patch = setPath({}, path, val);
  const top = path.split('.')[0];
  if ((it.aiFields || []).includes(top)) { patch.aiFields = it.aiFields.filter((k) => k !== top); el.classList.remove('ai'); const b = el.closest('label') && el.closest('label').querySelector('.ai-badge'); if (b) b.remove(); }
  patchItem(it.id, patch);
  if (path === 'size') { clearTimeout(sizeMeasT); sizeMeasT = setTimeout(() => autoMeasure(it.id), 1500); }
  if (path.startsWith('measurements.')) { clearTimeout(measSyncT); measSyncT = setTimeout(() => syncListingMeasures(it.id), 900); }
  refreshItemHeader();
  if (S.itemTab === 'preis') updatePriceCalc();
  if (S.itemTab === 'verkauf') updateSaleCalc();
}
async function onStatusChange(it, val) {
  const patch = { status: val };
  if (val === 'Online' && !it.onlineSince) { patch.onlineSince = RL.today(); patch.lastPriceChange = RL.today(); if (RL.n0(it.listPrice) > 0) patch.priceHistory = [...(it.priceHistory || []), { d: RL.today(), p: it.listPrice }]; }
  if (val === 'Verkauft' && it.status !== 'Verkauft') { $('#f-status').value = it.status; S.itemTab = 'verkauf'; render(); toast('Erfasse jetzt Verkaufspreis und -datum.'); return; }
  if (val !== 'Verkauft' && it.status === 'Verkauft') { if (!(await confirmDialog('Verkauf zurücksetzen?', 'Verkaufspreis, -datum und Gewinn dieses Artikels werden entfernt.', 'Zurücksetzen', true))) { $('#f-status').value = it.status; return; } Object.assign(patch, { salePrice: null, saleDate: null, saleFees: null, saleShipping: null, shipStatus: null }); }
  await patchItem(it.id, patch, { immediate: true });
  render();
}

/* ---- Tab: Preis ---- */
TAB_RENDER.preis = (it) => {
  const busy = S.busy['pr-' + it.id];
  const pr = it.pricing;
  const ch = it.channel || S.settings.defaultChannel;
  const purchase = RL.n0(it.purchasePrice);
  const row = (label, p) => { const c = RL.calcProfit(S.settings, { price: p, purchase, channel: ch }); return `<tr><td>${label}</td><td class="num right">${eur(c.price)}</td><td class="num right">${eur(c.fee)}</td><td class="num right">${eur(c.ship)}</td><td class="num right"><b>${eur(c.profit)}</b></td><td class="num right">${fmtNum(c.margin, 0)} %</td></tr>`; };
  const tiers = pr ? [['quick', 'Schnell verkaufen'], ['market', 'Realistischer Marktpreis'], ['high', 'Hoch angesetzt']] : [];
  const suggestMin = pr ? Math.max(RL.roundPriceUp(pr.quick.price * 0.9), RL.roundPriceUp(purchase + RL.sellerShipping(S.settings) + 1)) : null;
  return `<div class="grid g-main">
  <div class="card"><div class="row between"><h2 style="margin:0">Preisempfehlung</h2>${pr ? `<span class="chip warn" title="Keine Live-Marktdaten verfügbar">Schätzung · Konfidenz ${esc(pr.confidence)}</span>` : ''}</div>
    <p class="sub ai-only" style="margin:8px 0 14px">Die KI schätzt auf Basis von Marke, Kategorie, Zustand, Saison und allgemeinem Marktwissen. Es werden keine Plattformen ausgelesen – prüfe vergleichbare Angebote selbst.</p>
    ${busy ? `<div class="loading-line"><span class="spin"></span>Preis wird geschätzt…</div>` : `<button class="btn ${pr ? '' : 'primary'}" data-act="run-price" ${aiAvailable() ? '' : 'disabled'}>${icon('sparkle')}${pr ? 'Neu schätzen' : 'KI-Preisschätzung starten'}</button>${aiAvailable() ? '' : '<span class="small muted">Preise unten festlegen.</span>'}`}
    ${pr ? `<div class="tiers" style="margin-top:16px">${tiers.map(([k, l]) => `<div class="tier ${RL.n0(it.listPrice) === pr[k].price ? 'on' : ''}" data-act="set-list-price" data-p="${pr[k].price}"><div class="t">${l}</div><div class="p">${eur(pr[k].price)}</div><div class="d">${esc(pr[k].days || '')}</div></div>`).join('')}</div>
      <p class="tiny muted" style="margin:8px 0 0">Klicke auf eine Stufe, um sie als Angebotspreis zu übernehmen.</p>
      <div class="row small" style="margin-top:14px;gap:6px;flex-wrap:wrap"><span class="chip">Nachfrage: ${esc(pr.demand)}</span>${pr.season && pr.season.length <= 40 ? `<span class="chip">${esc(pr.season)}</span>` : ''}</div>
      ${pr.factors.length || (pr.season && pr.season.length > 40) ? `<ul class="factors">${[...(pr.season && pr.season.length > 40 ? [pr.season] : []), ...pr.factors].map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      ${pr.rationale ? `<p class="small muted" style="margin:10px 0 0">${esc(pr.rationale)}</p>` : ''}
      <div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>Stufe (${esc(ch)})</th><th class="right">Preis</th><th class="right">Gebühren</th><th class="right">Versand/Verp.</th><th class="right">Gewinn</th><th class="right">Marge</th></tr></thead><tbody>
        ${row('Schnell', pr.quick.price)}${row('Markt', pr.market.price)}${row('Hoch', pr.high.price)}</tbody></table></div>
      <div class="note" style="margin-top:12px">Empfohlener <b>maximaler Einkaufspreis</b> für ${S.settings.targetMargin} % Zielmarge beim Marktpreis: <b>${eur(RL.maxBuyPrice(S.settings, { marketPrice: pr.market.price, channel: ch }))}</b></div>` : ''}
  </div>
  <div class="card"><h2>Preise festlegen</h2>
    <div class="fgrid" style="grid-template-columns:1fr 1fr;align-items:end">
      <label class="f"><span>Verkaufskanal</span>${sel('channel', RL.CHANNELS, ch, 'data-f="channel" id="f-channel"')}</label>
      ${(() => { const accs = RL.vintedAccounts(S.items, S.settings); return accs.length ? `<label class="f" style="grid-column:1/-1"><span>Vinted-Konto</span>${sel('account', [['', '– kein bestimmtes –'], ...accs.map((a) => [a, a])], it.account || '', 'data-f="account" id="f-account"')}</label>` : ''; })()}
      <label class="f"><span>Einkaufspreis (€)</span><input class="in" type="number" step="0.01" min="0" data-f="purchasePrice" data-type="num" id="f-pp2" value="${esc(numVal(it.purchasePrice))}"></label>
      <label class="f"><span>Angebotspreis (€)</span><input class="in" type="number" step="0.5" min="0" data-f="listPrice" data-type="num" id="f-listPrice" value="${esc(numVal(it.listPrice))}"></label>
      <label class="f"><span>Mindestpreis (€)</span><input class="in" type="number" step="0.5" min="0" data-f="minPrice" data-type="num" id="f-minPrice" value="${esc(numVal(it.minPrice))}"></label>
      <p class="tiny muted" style="grid-column:1/-1;margin:-4px 0 0">Der Mindestpreis wird bei Preisverhandlungen nie unterschritten.</p>
    </div>
    ${suggestMin && !RL.n0(it.minPrice) ? `<div class="row small" style="margin-top:8px"><span class="muted">Vorschlag Mindestpreis: ${eur(suggestMin)}</span><button class="btn sm" data-act="set-min" data-p="${suggestMin}">Übernehmen</button></div>` : ''}
    <div id="price-calc" style="margin-top:14px"></div>
  </div></div>${nextBtn('bilder', 'Weiter zum Bildstudio')}`;
};
TAB_AFTER.preis = () => updatePriceCalc();
function updatePriceCalc() {
  const box = $('#price-calc'); const it = itemById(S.param); if (!box || !it) return;
  const ch = it.channel || S.settings.defaultChannel; const purchase = RL.n0(it.purchasePrice);
  const line = (l, p) => {
    if (!(RL.n0(p) > 0)) return ''; const c = RL.calcProfit(S.settings, { price: p, purchase, channel: ch });
    return `<div class="list-row" style="align-items:center"><div class="grow"><div class="tiny muted">${l}</div><div style="font-weight:600;font-size:15px">${eur(c.price)}</div><div class="tiny muted" style="margin-top:2px">Gebühren ${eur(c.fee)} · Versand ${eur(c.ship)} · EK ${eur(purchase)}</div></div>
      <div class="right"><div class="tiny muted">Gewinn</div><div style="font-weight:700;font-size:16px;color:${c.profit < 0 ? 'var(--bad)' : 'var(--ok)'}">${eur(c.profit)}</div><div class="tiny muted">${fmtNum(c.margin, 0)} % Marge</div></div></div>`;
  };
  const warn = RL.n0(it.minPrice) > 0 && RL.n0(it.listPrice) > 0 && RL.n0(it.minPrice) > RL.n0(it.listPrice) ? '<div class="note bad small">Der Mindestpreis liegt über dem Angebotspreis.</div>' : '';
  box.innerHTML = (line('Beim Angebotspreis', it.listPrice) + line('Beim Mindestpreis', it.minPrice)) || '<p class="small muted">Lege einen Angebotspreis fest, um Gewinn und Marge zu sehen.</p>';
  box.innerHTML += warn;
}
ACT['set-list-price'] = async (el) => { const it = itemById(S.param); const p = +el.dataset.p; const patch = { listPrice: p }; if (it.status === 'Online') { patch.priceHistory = [...(it.priceHistory || []), { d: RL.today(), p }]; patch.lastPriceChange = RL.today(); } await patchItem(it.id, patch, { immediate: true }); render(); };
ACT['set-min'] = async (el) => { await patchItem(S.param, { minPrice: +el.dataset.p }, { immediate: true }); render(); };
ACT['run-price'] = () => runPrice(S.param);

async function estimatePrice(facts, signal) {
  const month = new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const j = await S.sample.json(AI.pricePrompt(facts, month), { signal, modelTier: 'default' });
  return AI.normalizePrice(j);
}
async function runPrice(id) {
  const it = itemById(id); if (!it || !aiAvailable()) return;
  const key = 'pr-' + id; if (S.busy[key]) return;
  if (!it.brand && !it.productType && !it.category) { toast('Bitte zuerst Marke oder Produkttyp angeben (Tab „Daten“).', 'bad'); return; }
  const ctl = new AbortController(); S.busy[key] = { ctl }; rerenderIf(id, 'preis');
  try {
    const pr = await estimatePrice(it, ctl.signal);
    const patch = { pricing: { ...pr, at: Date.now(), estimate: true } };
    if (!(RL.n0(it.listPrice) > 0)) patch.listPrice = pr.market.price;
    await patchItem(id, patch, { immediate: true });
  } catch (e) { if (e && e.code !== 'cancelled') toast('Preisschätzung fehlgeschlagen: ' + aiErr(e), 'bad'); }
  finally { delete S.busy[key]; rerenderIf(id, 'preis'); }
}

/* ---- Tab: Bildstudio (im Artikel) ---- */
TAB_RENDER.bilder = (it) => renderStudio(it.id) + nextBtn('anzeige', 'Weiter zur Anzeige');
TAB_AFTER.bilder = (it) => afterStudio(it.id);

/* ---- Tab: Anzeige ---- */
const PLATFORM_NOTE = {
  Vinted: 'Vinted bietet keine öffentliche Schnittstelle zum automatischen Einstellen. Kopiere Titel, Beschreibung und lade die Bilder in der Vinted-App hoch.',
  Kleinanzeigen: 'Kleinanzeigen bietet keine öffentliche Schnittstelle für Privatanzeigen. Texte kopieren und manuell einstellen.',
  eBay: 'eBay hat eine offizielle Sell-API (Entwicklerkonto + OAuth nötig). In dieser Version noch nicht angebunden – Texte kopieren und manuell einstellen.',
};
TAB_RENDER.anzeige = (it) => {
  const p = S.listingPlatform;
  const L = (it.listing && it.listing[p]) || {};
  const busy = S.busy['ls-' + it.id];
  const maxT = p === 'eBay' ? 80 : p === 'Kleinanzeigen' ? 65 : 60;
  const imgs = it.images || [];
  return `<div class="row between" style="margin-bottom:14px"><div class="seg">${['Vinted', 'Kleinanzeigen', 'eBay'].map((x) => `<button class="${x === p ? 'on' : ''}" data-act="set-platform" data-p="${x}">${x}${it.listing && it.listing[x] && it.listing[x].title ? ' ✓' : ''}</button>`).join('')}</div>
    <div class="row">${busy ? `<span class="loading-line"><span class="spin"></span>${busy.p && busy.p !== p ? esc(busy.p) + '-' : ''}Text wird automatisch geschrieben…</span><button class="btn sm" data-act="stop-busy" data-k="ls-${it.id}">Stopp</button>` : `<button class="btn" data-act="gen-template">Vorlage ohne KI</button><button class="btn primary" data-act="gen-listing" ${aiAvailable() ? '' : 'disabled'}>${icon('sparkle')}Mit KI schreiben</button>`}</div></div>
  <div class="grid g-main">
    <div class="card">
      <div class="copybox"><label class="f"><span>Titel</span><input class="in" id="lst-title" data-l="title" value="${esc(L.title || '')}" placeholder="Titel – „Mit KI schreiben“ oder „Vorlage“ klicken"></label><span class="cnt" id="cnt-title" style="top:0">${(L.title || '').length}/${maxT}</span></div>
      <label class="f" style="margin-top:12px"><span>Beschreibung</span><textarea class="in" id="lst-desc" data-l="description" style="min-height:300px;font-size:14px">${esc(L.description || '')}</textarea></label>
      <label class="f" style="margin-top:12px"><span>Suchbegriffe (durch Komma getrennt)${p === 'Vinted' ? ' – werden als #Hashtags angehängt' : ''}</span><input class="in" id="lst-tags" data-l="tags" value="${esc((L.tags || []).join(', '))}"></label>
      ${L.category ? `<p class="small muted" style="margin:8px 0 0">Kategorie-Vorschlag: ${esc(L.category)}</p>` : ''}
      <div class="row" style="margin-top:14px">
        <button class="btn sm" data-act="copy-l" data-k="title">${icon('copy')}Titel</button><button class="btn sm" data-act="copy-l" data-k="description">${icon('copy')}Beschreibung</button>
        <button class="btn sm" data-act="copy-l" data-k="tags">${icon('copy')}Suchbegriffe</button><button class="btn sm dark" data-act="copy-l" data-k="all">${icon('copy')}Alles kopieren</button>
      </div>
      ${L.source ? `<p class="tiny muted" style="margin:10px 0 0">Erstellt ${L.source === 'ai' ? 'mit KI' : 'aus Vorlage'} am ${fmtDate(L.at)} – Text frei bearbeitbar.</p>` : ''}
    </div>
    <div class="stack">
      <div class="card"><h3>Bilder für die Anzeige</h3>
        ${imgs.length ? `<div class="gallery" style="grid-template-columns:repeat(3,1fr)">${imgs.map((m, i) => `<div class="g"><img src="${esc(m.thumb || imgSrc(m))}" alt=""><div class="acts" style="opacity:1"><button class="icon-btn" data-act="img-dl" data-i="${i}" title="Herunterladen">${icon('download')}</button></div></div>`).join('')}</div>
        <button class="btn sm" style="margin-top:10px;width:100%" data-act="dl-all-imgs">${icon('download')}Alle nacheinander herunterladen</button>` : '<p class="small muted">Noch keine Bilder.</p>'}
      </div>
      <div class="card"><h3>Veröffentlichen</h3><div class="note small">${esc(PLATFORM_NOTE[p])}</div>
        <div class="stack" style="margin-top:12px">
          <button class="btn primary" data-act="mark-online">${icon('check')}Ist auf ${esc(p)} online</button>
          <button class="btn" data-act="mark-stock">Im Inventar speichern (Auf Lager)</button>
        </div></div>
    </div>
  </div>${nextBtn('verkauf', 'Weiter zu Verkauf & Verhandlung')}`;
};
ACT['set-platform'] = (el) => { S.listingPlatform = el.dataset.p; render(); };
ON_INPUT.listing = (el) => {
  const it = itemById(S.param); const p = S.listingPlatform; const k = el.dataset.l;
  const v = k === 'tags' ? el.value.split(',').map((s) => s.trim()).filter(Boolean) : el.value;
  const patch = { [k]: v };
  if (k === 'tags' && p === 'Vinted') {
    // Hashtags in der Beschreibung live aktualisieren
    const ta = $('#lst-desc'); if (ta) { ta.value = RL.finalizeVinted(ta.value, v, S.settings, RL.itemCode(it, S.settings)); patch.description = ta.value; }
  }
  patchItem(it.id, { listing: { [p]: patch } });
  if (k === 'title') { const c = $('#cnt-title'); const maxT = p === 'eBay' ? 80 : p === 'Kleinanzeigen' ? 65 : 60; if (c) { c.textContent = `${el.value.length}/${maxT}`; c.style.color = el.value.length > maxT ? 'var(--bad)' : ''; } }
};
async function setListing(id, p, data, source) {
  await patchItem(id, { listing: { [p]: { ...data, source, at: Date.now() } } }, { immediate: true });
}
ACT['gen-template'] = async () => {
  const it = itemById(S.param); const p = S.listingPlatform; const cur = it.listing && it.listing[p];
  if (cur && cur.description && !(await confirmDialog('Text ersetzen?', 'Der vorhandene Text wird durch die Vorlage ersetzt.', 'Ersetzen'))) return;
  await setListing(it.id, p, RL.templateListing(it, p, S.settings), 'template'); render();
};
async function genListing(id, p, { ask = true, quiet = false } = {}) {
  const it = itemById(id); if (!it) return; const key = 'ls-' + id;
  if (S.busy[key]) return;
  const cur = it.listing && it.listing[p];
  if (ask && cur && cur.description && !(await confirmDialog('Text neu schreiben?', 'Der vorhandene Text wird ersetzt.', 'Neu schreiben'))) return;
  if (!it.brand && !it.productType && !it.category) { if (!quiet) toast('Bitte zuerst Produktdaten erfassen.', 'bad'); return; }
  if (!aiAvailable()) { await setListing(id, p, RL.templateListing(it, p, S.settings), 'template'); rerenderIf(id, 'anzeige'); return; }
  const ctl = new AbortController(); S.busy[key] = { ctl, p }; rerenderIf(id, 'anzeige');
  try {
    const j = await S.sample.json(AI.listingPrompt(it, p, S.settings, RL.n0(it.listPrice) > 0 ? it.listPrice : null), { signal: ctl.signal, modelTier: 'default', cache: false });
    const L = AI.normalizeListing(j, p, S.settings, RL.itemCode(it, S.settings));
    L.description = RL.injectMeasurements(L.description, itemById(id), p, S.settings);
    await setListing(id, p, L, 'ai');
    if (!quiet) toast('Anzeige erstellt – bitte gegenlesen.');
  } catch (e) {
    if (e && e.code !== 'cancelled') {
      // Fallback: eigene Vorlage ohne KI, damit das Feld trotzdem gefüllt ist
      const c2 = itemById(id) && itemById(id).listing && itemById(id).listing[p];
      if (!(c2 && c2.description)) await setListing(id, p, RL.templateListing(itemById(id), p, S.settings), 'template');
      toast('KI-Text nicht möglich (' + aiErr(e) + ') – Vorlage eingesetzt.', 'bad');
    }
  } finally { delete S.busy[key]; rerenderIf(id, 'anzeige'); }
}
ACT['gen-listing'] = () => genListing(S.param, S.listingPlatform);
const autoTried = new Set();
TAB_AFTER.anzeige = (it) => {
  const p = S.listingPlatform; const L = it.listing && it.listing[p];
  if (S.settings.autoListing === false || (L && L.description) || S.busy['ls-' + it.id] || autoTried.has(it.id + p)) return;
  if (!it.brand && !it.productType && !it.category) return;
  autoTried.add(it.id + p);
  genListing(it.id, p, { ask: false, quiet: true });
};
ACT['copy-l'] = (el) => {
  const it = itemById(S.param); const L = (it.listing && it.listing[S.listingPlatform]) || {};
  const k = el.dataset.k;
  const vinted = S.listingPlatform === 'Vinted';
  const tags = vinted ? RL.toHashtags(L.tags).join(' ') : (L.tags || []).join(', ');
  const t = k === 'all' ? (vinted ? [L.title, '', L.description] : [L.title, '', L.description, tags ? '\nSuchbegriffe: ' + tags : '']).join('\n').trim() : k === 'tags' ? tags : L[k];
  if (!t) { toast('Noch kein Text vorhanden.', 'bad'); return; }
  copyText(t, { title: 'Titel', description: 'Beschreibung', tags: 'Suchbegriffe', all: 'Anzeige' }[k]);
};
ACT['dl-all-imgs'] = async () => {
  const it = itemById(S.param);
  for (const [i, m] of (it.images || []).entries()) {
    try { const b = await getImageBlob(m); const ok = await saveFile(`${it.sku}-${i + 1}.${/png/.test(b.type) ? 'png' : 'jpg'}`, b); if (!ok) break; } catch (e) { toast('Bild ' + (i + 1) + ' nicht verfügbar', 'bad'); }
  }
};
ACT['mark-online'] = async () => {
  const it = itemById(S.param);
  if (!(RL.n0(it.listPrice) > 0)) { toast('Bitte zuerst einen Angebotspreis festlegen (Tab „Preis“).', 'bad'); S.itemTab = 'preis'; render(); return; }
  const patch = { status: 'Online', channel: S.listingPlatform };
  if (!it.onlineSince || it.status !== 'Online') { patch.onlineSince = RL.today(); patch.lastPriceChange = RL.today(); patch.priceHistory = [...(it.priceHistory || []), { d: RL.today(), p: it.listPrice }]; }
  await patchItem(it.id, patch, { immediate: true }); toast('Als online markiert.'); render();
};
ACT['mark-stock'] = async () => { await patchItem(S.param, { status: 'Auf Lager' }, { immediate: true }); toast('Im Inventar gespeichert.'); go('inventar'); };

/* ---- Tab: Verkauf & Verhandlung ---- */
TAB_RENDER.verkauf = (it) => {
  const ch = it.channel || S.settings.defaultChannel;
  const sold = it.status === 'Verkauft';
  const sp = sold ? it.salePrice : it.listPrice;
  const nego = !sold ? `<div class="card"><h2>Preisverhandlung</h2><p class="sub">Gegenangebote werden aus Angebots- und Mindestpreis berechnet – nie unter ${RL.n0(it.minPrice) > 0 ? eur(it.minPrice) : 'deinem Mindestpreis'}.</p>
    ${!(RL.n0(it.listPrice) > 0) ? '<div class="note warn small">Lege zuerst einen Angebotspreis fest.</div>' : `
    <div class="row"><label class="f" style="flex:1"><span>Gebot des Käufers (€)</span><input class="in" type="number" step="0.5" min="0" id="nego-offer"></label><button class="btn dark" style="align-self:flex-end" data-act="calc-nego">Berechnen</button></div>
    <div id="nego-res" style="margin-top:12px"></div>`}</div>` : '';
  const saleForm = `<div class="card"><h2>${sold ? 'Verkauf' : 'Verkauf erfassen'}</h2>
    <div class="fgrid" style="grid-template-columns:1fr 1fr">
      <label class="f"><span>Verkaufspreis (€)</span><input class="in" type="number" step="0.01" min="0" id="s-price" ${sold ? 'data-f="salePrice" data-type="num"' : ''} value="${esc(numVal(sp))}"></label>
      <label class="f"><span>Verkaufsdatum</span><input class="in" type="date" id="s-date" ${sold ? 'data-f="saleDate"' : ''} value="${esc(sold ? it.saleDate || '' : RL.today())}"></label>
      <label class="f"><span>Kanal</span>${sel('ch', RL.CHANNELS, ch, `id="s-ch" ${sold ? 'data-f="channel"' : ''}`)}</label>
      <label class="f"><span>Versandstatus</span>${sel('ship', RL.SHIP_STATES, sold ? it.shipStatus || 'offen' : 'offen', `id="s-ship" ${sold ? 'data-f="shipStatus"' : ''}`)}</label>
      <label class="f"><span>Gebühren (€)</span><input class="in" type="number" step="0.01" min="0" id="s-fees" ${sold ? 'data-f="saleFees" data-type="num"' : ''} value="${esc(numVal(sold ? it.saleFees : RL.platformFee(S.settings, ch, sp)))}"></label>
      <label class="f"><span>Versand/Verpackung (€) <span class="tiny">Verkäufer</span></span><input class="in" type="number" step="0.01" min="0" id="s-ship-cost" ${sold ? 'data-f="saleShipping" data-type="num"' : ''} value="${esc(numVal(sold ? it.saleShipping : RL.sellerShipping(S.settings)))}"></label>
      <label class="f"><span>Einkaufspreis (€)</span><input class="in" type="number" step="0.01" min="0" id="s-pp" data-f="purchasePrice" data-type="num" value="${esc(numVal(it.purchasePrice))}"></label>
    </div>
    <div id="sale-calc" style="margin-top:12px"></div>
    <div class="row" style="margin-top:12px">${sold ? `<button class="btn danger" data-act="undo-sale">Verkauf rückgängig</button>` : `<button class="btn primary" data-act="mark-sold">${icon('check')}Als verkauft markieren</button>${it.status !== 'Reserviert' ? '<button class="btn" data-act="mark-reserved">Reservieren</button>' : ''}`}</div>
  </div>`;
  return `<div class="grid ${sold ? '' : 'g2'}">${nego}${saleForm}</div>`;
};
TAB_AFTER.verkauf = () => {
  updateSaleCalc();
  ['s-price', 's-ch', 's-fees', 's-ship-cost'].forEach((id) => { const el = $('#' + id); if (el) el.addEventListener('input', () => { if (id !== 's-fees' && !el.dataset.f && (id === 's-price' || id === 's-ch')) { const f = $('#s-fees'); if (f && !f.dataset.touched) f.value = RL.platformFee(S.settings, $('#s-ch').value, RL.n0($('#s-price').value)); } if (id === 's-fees') el.dataset.touched = '1'; updateSaleCalc(); }); });
  const o = $('#nego-offer'); if (o) o.addEventListener('keydown', (e) => { if (e.key === 'Enter') ACT['calc-nego'](); });
};
function updateSaleCalc() {
  const box = $('#sale-calc'); if (!box) return;
  const it = itemById(S.param);
  const price = RL.n0($('#s-price').value), fees = RL.n0($('#s-fees').value), ship = RL.n0($('#s-ship-cost').value), pp = RL.n0(it.purchasePrice);
  const profit = RL.r2(price - fees - ship - pp);
  const days = it.status === 'Verkauft' ? RL.daysBetween(it.onlineSince || it.purchaseDate || it.createdAt, it.saleDate) : null;
  box.innerHTML = `<div class="note"><div class="row between"><span>Gewinn</span><b style="font-size:20px;color:${profit < 0 ? 'var(--bad)' : 'var(--ok)'}">${eur(profit)}</b></div>
    <div class="tiny muted">${eur(price)} − Gebühren ${eur(fees)} − Versand ${eur(ship)} − EK ${eur(pp)} · Marge ${price > 0 ? fmtNum(profit / price * 100, 0) : 0} %${days !== null ? ` · verkauft nach ${days} Tagen` : ''}</div></div>`;
}
ACT['calc-nego'] = () => {
  const it = itemById(S.param); const box = $('#nego-res'); const offer = RL.num($('#nego-offer').value);
  if (!(offer > 0)) { box.innerHTML = '<div class="note warn small">Bitte ein Gebot eingeben.</div>'; return; }
  const r = RL.counterOffer({ listPrice: it.listPrice, minPrice: it.minPrice, offer });
  const ch = it.channel || S.settings.defaultChannel;
  const pAt = (p) => RL.calcProfit(S.settings, { price: p, purchase: it.purchasePrice, channel: ch });
  const tpl = r.decision === 'annehmen' ? `Hi! ${eur(offer)} passt für mich – ich nehme dein Angebot gerne an. 😊` : `Hi! Danke für dein Angebot. ${eur(offer)} ist mir leider zu wenig – für ${eur(r.counter)} gebe ich den Artikel gerne ab. Passt das für dich?`;
  S.lastNego = { ...r, offer };
  box.innerHTML = `<div class="note ${r.decision === 'annehmen' ? 'info' : ''}"><b>${r.decision === 'annehmen' ? 'Annehmen empfohlen' : 'Gegenangebot: ' + eur(r.counter)}</b><div class="small" style="margin-top:4px">${esc(r.reason)}</div>
    <div class="tiny muted" style="margin-top:6px">Gewinn beim Gebot: ${eur(pAt(offer).profit)} · ${r.decision === 'annehmen' ? '' : `beim Gegenangebot: ${eur(pAt(r.counter).profit)} · `}Angebotspreis ${eur(it.listPrice)} · Mindestpreis ${RL.n0(it.minPrice) > 0 ? eur(it.minPrice) : 'nicht gesetzt'}</div></div>
    <label class="f" style="margin-top:10px"><span>Antwortvorschlag</span><textarea class="in" id="nego-text" rows="3">${esc(tpl)}</textarea></label>
    <div class="row" style="margin-top:8px"><button class="btn sm" data-act="copy-el" data-el="nego-text">${icon('copy')}Kopieren</button><button class="btn sm" data-act="nego-ai" ${aiAvailable() ? '' : 'disabled'}>${icon('sparkle')}Mit KI formulieren</button></div>`;
};
ACT['copy-el'] = (el) => { const t = $('#' + el.dataset.el); if (t) copyText(t.value || t.textContent); };
ACT['nego-ai'] = async (el) => {
  const it = itemById(S.param); const r = S.lastNego; if (!r) return;
  el.disabled = true; const ta = $('#nego-text'); const old = ta.value; ta.value = 'Wird formuliert…';
  try {
    const res = await S.sample(AI.replyPrompt({ message: `Ich biete ${r.offer} € für den Artikel.`, it, s: S.settings, nego: r }), { modelTier: 'quick', cache: false, onText: ({ text }) => { ta.value = text; } });
    ta.value = res.text.trim();
  } catch (e) { ta.value = e.text || old; if (e.code !== 'cancelled') toast(aiErr(e), 'bad'); }
  finally { el.disabled = false; }
};
ACT['mark-sold'] = async () => {
  const it = itemById(S.param);
  const price = RL.num($('#s-price').value);
  if (!(price > 0)) { toast('Bitte einen Verkaufspreis eingeben.', 'bad'); return; }
  const patch = { status: 'Verkauft', salePrice: price, saleDate: $('#s-date').value || RL.today(), channel: $('#s-ch').value, shipStatus: $('#s-ship').value, saleFees: RL.n0($('#s-fees').value), saleShipping: RL.n0($('#s-ship-cost').value) };
  if (!it.onlineSince) patch.onlineSince = it.purchaseDate || RL.today();
  await patchItem(it.id, patch, { immediate: true });
  toast(`Verkauft! Gewinn: ${eur(RL.soldProfit({ ...it, ...patch }))}`);
  render();
};
ACT['mark-reserved'] = async () => { await patchItem(S.param, { status: 'Reserviert' }, { immediate: true }); toast('Als reserviert markiert.'); render(); };
ACT['undo-sale'] = async () => {
  if (!(await confirmDialog('Verkauf rückgängig machen?', 'Der Artikel wird wieder auf „Online“ gesetzt; Verkaufsdaten werden entfernt.', 'Rückgängig', true))) return;
  await patchItem(S.param, { status: 'Online', salePrice: null, saleDate: null, saleFees: null, saleShipping: null, shipStatus: null }, { immediate: true }); render();
};
