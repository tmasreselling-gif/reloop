/* RELOOP – Verkaufsassistent, Einstellungen */
'use strict';

const itemOptions = (filter = (i) => i.status !== 'Verkauft') => S.items.filter(filter).map((i) => [i.id, `${displayTitle(i)} · ${RL.n0(i.listPrice) > 0 ? eur(i.listPrice) : 'ohne Preis'}`]);

/* ================= Verkaufsassistent ================= */
VIEW_RENDER.assistent = () => {
  const t = S.assistTab;
  const tabs = [['nachrichten', 'Nachrichten'], ['verhandlung', 'Preisverhandlung'], ['favoriten', 'Favoriten'], ['automatik', 'Preisplan & Relisting']];
  return pageHead('Verkaufsassistent', 'Antworten, Gegenangebote, Favoriten-Nachrichten und Preisplanung. Nichts wird automatisch an Plattformen gesendet – du prüfst, kopierst und gibst frei.') + `
  <div class="note info small" style="margin-bottom:14px"><b>Plattform-Anbindung:</b> Vinted und Kleinanzeigen bieten keine offizielle Schnittstelle für Nachrichten, Favoriten oder Relisting. RELOOP bereitet deshalb alles vor; das Senden bzw. Einstellen erledigst du in der jeweiligen App. Es werden keine Sicherheitsmechanismen umgangen.</div>
  <div class="tabs-inline">${tabs.map(([k, l]) => `<button class="${k === t ? 'on' : ''}" data-act="assist-tab" data-v="${k}">${l}</button>`).join('')}</div>
  <div>${ASSIST[t]()}</div>`;
};
ACT['assist-tab'] = (el) => { S.assistTab = el.dataset.v; render(); };
AFTER.assistent = () => { if (ASSIST_AFTER[S.assistTab]) ASSIST_AFTER[S.assistTab](); };
const ASSIST = {}, ASSIST_AFTER = {};
const AS = S.as = { msg: '', itemId: '', reply: '', negoItem: '', favItem: '', favPct: 10 };

ASSIST.nachrichten = () => `<div class="grid g2">
  <div class="card"><h2>Käufernachricht</h2><p class="sub">Füge die Nachricht aus Vinted/Kleinanzeigen/eBay ein. Enthält sie ein Preisangebot, wird das Gegenangebot automatisch mit deinem Mindestpreis berechnet.</p>
    <label class="f"><span>Artikel</span>${sel('i', [['', '– ohne Artikel –'], ...itemOptions(() => true)], AS.itemId, 'id="as-item"')}</label>
    <label class="f" style="margin-top:10px"><span>Nachricht</span><textarea class="in" id="as-msg" rows="6" placeholder="z. B. Hi, würdest du 15 € nehmen?">${esc(AS.msg)}</textarea></label>
    <div id="as-nego" style="margin-top:10px"></div>
    <button class="btn primary" style="margin-top:12px" data-act="as-reply" ${aiAvailable() ? '' : 'disabled'}>${icon('sparkle')}Antwort vorschlagen</button>
  </div>
  <div class="card"><h2>Antwortvorschlag</h2><p class="sub">Stil: ${esc(S.settings.writingStyle)} · änderbar in den Einstellungen. Prüfe den Text, bevor du ihn sendest.</p>
    <textarea class="in" id="as-reply" rows="9" placeholder="Hier erscheint der Vorschlag…">${esc(AS.reply)}</textarea>
    <div class="row" style="margin-top:10px"><button class="btn" data-act="copy-el" data-el="as-reply">${icon('copy')}Kopieren</button></div>
    <h3 style="margin:18px 0 8px">⚡ Schnellantworten <span class="muted small">(Klick = kopieren · bearbeitbar in den Einstellungen)</span></h3>
    <div class="stack" style="gap:6px">${(S.settings.quickReplies || []).filter(Boolean).map((q, i) => `<button class="proposal" style="cursor:pointer;text-align:left;width:100%" data-act="qr-copy" data-i="${i}"><span class="small">${esc(q)}</span>${icon('copy')}</button>`).join('') || '<p class="small muted">Keine Schnellantworten.</p>'}</div>
  </div></div>`;
ACT['qr-copy'] = (el) => { const q = (S.settings.quickReplies || []).filter(Boolean)[+el.dataset.i]; if (q) copyText(q, 'Schnellantwort'); };
function detectOffer(text) {
  const m = String(text).match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|eur|euro)|(?:€)\s*(\d{1,4}(?:[.,]\d{1,2})?)|(?:biete|nehmen|für|fuer|zahle|angebot)\D{0,12}(\d{1,4}(?:[.,]\d{1,2})?)/i);
  if (!m) return null; const v = RL.num(m[1] || m[2] || m[3]); return v > 0 ? v : null;
}
function asNegoPreview() {
  const box = $('#as-nego'); if (!box) return null;
  AS.msg = $('#as-msg').value; AS.itemId = $('#as-item').value;
  const it = itemById(AS.itemId); const offer = detectOffer(AS.msg);
  if (!it || !offer || !(RL.n0(it.listPrice) > 0)) { box.innerHTML = offer && !it ? `<div class="note small">Preisangebot erkannt: ${eur(offer)} – wähle den Artikel, um ein Gegenangebot zu berechnen.</div>` : ''; return null; }
  const r = RL.counterOffer({ listPrice: it.listPrice, minPrice: it.minPrice, offer });
  box.innerHTML = `<div class="note ${r.decision === 'annehmen' ? 'info' : ''} small"><b>Gebot erkannt: ${eur(offer)} → ${r.decision === 'annehmen' ? 'Annehmen' : 'Gegenangebot ' + eur(r.counter)}</b><div>${esc(r.reason)}</div></div>`;
  return { ...r, offer };
}
ASSIST_AFTER.nachrichten = () => { ['as-msg', 'as-item'].forEach((id) => $('#' + id).addEventListener('input', asNegoPreview)); asNegoPreview(); };
ACT['as-reply'] = async (el) => {
  const nego = asNegoPreview(); const msg = $('#as-msg').value.trim();
  if (!msg) { toast('Bitte zuerst die Käufernachricht einfügen.', 'bad'); return; }
  const it = itemById($('#as-item').value);
  const ta = $('#as-reply'); el.disabled = true; ta.value = 'Wird formuliert…';
  try {
    const r = await S.sample(AI.replyPrompt({ message: msg, it, s: S.settings, nego }), { modelTier: 'quick', cache: false, onText: ({ text }) => { ta.value = text; } });
    AS.reply = ta.value = r.text.trim();
  } catch (e) { ta.value = e.text || ''; if (e.code !== 'cancelled') toast(aiErr(e), 'bad'); }
  finally { el.disabled = false; }
};

ASSIST.verhandlung = () => {
  const opts = itemOptions((i) => i.status !== 'Verkauft' && RL.n0(i.listPrice) > 0);
  if (!opts.length) return '<div class="card empty"><h3>Keine Artikel mit Preis</h3><p>Lege bei deinen Artikeln einen Angebots- und Mindestpreis fest.</p></div>';
  const id = AS.negoItem || opts[0][0]; const it = itemById(id);
  return `<div class="grid g2"><div class="card"><h2>Gegenangebot berechnen</h2>
    <label class="f"><span>Artikel</span>${sel('i', opts, id, 'id="ng-item"')}</label>
    <div class="fgrid" style="grid-template-columns:1fr 1fr 1fr;margin-top:10px">
      <label class="f"><span>Angebotspreis</span><input class="in" value="${esc(eur(it.listPrice))}" disabled></label>
      <label class="f"><span>Mindestpreis</span><input class="in" type="number" step="0.5" min="0" id="ng-min" value="${esc(numVal(it.minPrice))}" placeholder="nicht gesetzt"></label>
      <label class="f"><span>Gebot (€)</span><input class="in" type="number" step="0.5" min="0" id="ng-offer"></label>
    </div><button class="btn dark" style="margin-top:12px" data-act="ng-calc">Berechnen</button>
    <p class="tiny muted">Der Mindestpreis wird beim Ändern im Artikel gespeichert. Gegenangebote liegen nie darunter.</p></div>
    <div class="card"><h2>Ergebnis</h2><div id="ng-res"><p class="small muted">Gebot eingeben und berechnen.</p></div></div></div>`;
};
ASSIST_AFTER.verhandlung = () => {
  const s = $('#ng-item'); if (!s) return;
  s.addEventListener('change', () => { AS.negoItem = s.value; render(); });
  const min = $('#ng-min'); min.addEventListener('change', () => { const v = RL.num(min.value); patchItem(s.value, { minPrice: Number.isFinite(v) ? v : null }, { immediate: true }); });
  $('#ng-offer').addEventListener('keydown', (e) => { if (e.key === 'Enter') ACT['ng-calc'](); });
};
ACT['ng-calc'] = () => {
  const it = itemById($('#ng-item').value); const offer = RL.num($('#ng-offer').value); const box = $('#ng-res');
  const minV = RL.num($('#ng-min').value); const minPrice = Number.isFinite(minV) ? minV : it.minPrice;
  if (!(offer > 0)) { box.innerHTML = '<div class="note warn small">Bitte ein Gebot eingeben.</div>'; return; }
  const r = RL.counterOffer({ listPrice: it.listPrice, minPrice, offer });
  const ch = it.channel || S.settings.defaultChannel;
  const pr = (p) => RL.calcProfit(S.settings, { price: p, purchase: it.purchasePrice, channel: ch });
  const tpl = r.decision === 'annehmen' ? `Hi! ${eur(offer)} ist okay für mich – ich nehme dein Angebot an. 😊` : `Hi! Danke für dein Angebot. Für ${eur(r.counter)} kann ich ihn dir gerne geben – passt das?`;
  box.innerHTML = `<div class="tier on" style="cursor:default"><div class="t">${r.decision === 'annehmen' ? 'Empfehlung' : 'Gegenangebot'}</div><div class="p">${r.decision === 'annehmen' ? 'Annehmen' : eur(r.counter)}</div><div class="d">${esc(r.reason)}</div></div>
    <div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><tbody>
      <tr><td>Gewinn beim Gebot (${eur(offer)})</td><td class="right num">${eur(pr(offer).profit)}</td></tr>
      ${r.decision !== 'annehmen' ? `<tr><td>Gewinn beim Gegenangebot</td><td class="right num"><b>${eur(pr(r.counter).profit)}</b></td></tr>` : ''}
      <tr><td>Gewinn beim Angebotspreis</td><td class="right num">${eur(pr(it.listPrice).profit)}</td></tr>
      <tr><td>Einkaufspreis</td><td class="right num">${eur(RL.n0(it.purchasePrice))}</td></tr></tbody></table></div>
    <label class="f" style="margin-top:12px"><span>Nachricht</span><textarea class="in" id="ng-text" rows="3">${esc(tpl)}</textarea></label>
    <button class="btn sm" style="margin-top:8px" data-act="copy-el" data-el="ng-text">${icon('copy')}Kopieren</button>`;
};

ASSIST.favoriten = () => {
  const opts = itemOptions((i) => ['Online', 'Reserviert'].includes(i.status) && RL.n0(i.listPrice) > 0);
  if (!opts.length) return '<div class="card empty"><h3>Keine Online-Artikel mit Preis</h3><p>Favoriten-Nachrichten gibt es für Artikel mit Status „Online“.</p></div>';
  const id = AS.favItem || opts[0][0]; const it = itemById(id);
  const price = favPrice(it, AS.favPct);
  return `<div class="grid g2"><div class="card"><h2>Nachricht an Interessenten</h2>
    <p class="sub">Vinted stellt Favoriten-Daten nicht über eine öffentliche Schnittstelle bereit. Wenn dir in der App jemand einen Artikel favorisiert, erstellst du hier die Nachricht mit passendem Rabatt.</p>
    <label class="f"><span>Artikel</span>${sel('i', opts, id, 'id="fv-item"')}</label>
    <div class="sl" style="margin-top:12px"><span>Rabatt</span><input type="range" min="0" max="40" step="5" value="${AS.favPct}" id="fv-pct"><output>${AS.favPct} %</output></div>
    <div class="note small" id="fv-info">Neuer Preis: <b>${eur(price.price)}</b>${price.floored ? ' (auf Mindestpreis begrenzt)' : ''} · Gewinn ${eur(RL.calcProfit(S.settings, { price: price.price, purchase: it.purchasePrice, channel: it.channel }).profit)}</div>
    <div class="row" style="margin-top:12px"><button class="btn" data-act="fv-template">Vorlage</button><button class="btn primary" data-act="fv-ai" ${aiAvailable() ? '' : 'disabled'}>${icon('sparkle')}Mit KI formulieren</button></div></div>
    <div class="card"><h2>Nachricht</h2><textarea class="in" id="fv-text" rows="7" placeholder="Vorlage wählen…"></textarea><button class="btn sm" style="margin-top:10px" data-act="copy-el" data-el="fv-text">${icon('copy')}Kopieren</button>
    <p class="tiny muted">Bitte nur im Rahmen der Plattformregeln und nur an Personen senden, die Interesse gezeigt haben.</p></div></div>`;
};
function favPrice(it, pct) { let p = RL.roundPrice(RL.n0(it.listPrice) * (1 - pct / 100)); const floor = RL.n0(it.minPrice); let floored = false; if (floor > 0 && p < floor) { p = floor; floored = true; } return { price: p, floored }; }
ASSIST_AFTER.favoriten = () => {
  const s = $('#fv-item'); if (!s) return;
  s.addEventListener('change', () => { AS.favItem = s.value; render(); });
  $('#fv-pct').addEventListener('input', (e) => { AS.favPct = +e.target.value; e.target.nextElementSibling.textContent = AS.favPct + ' %'; const it = itemById(s.value); const p = favPrice(it, AS.favPct); $('#fv-info').innerHTML = `Neuer Preis: <b>${eur(p.price)}</b>${p.floored ? ' (auf Mindestpreis begrenzt)' : ''} · Gewinn ${eur(RL.calcProfit(S.settings, { price: p.price, purchase: it.purchasePrice, channel: it.channel }).profit)}`; });
};
ACT['fv-template'] = () => { const it = itemById($('#fv-item').value); const p = favPrice(it, AS.favPct); $('#fv-text').value = `Hi! Ich habe gesehen, dass dir mein${it.productType ? ' ' + it.productType : ' Artikel'}${it.brand ? ' von ' + it.brand : ''} gefällt 😊 ${AS.favPct ? `Ich kann ihn dir für ${eur(p.price)} statt ${eur(it.listPrice)} anbieten.` : ''} Bei Fragen melde dich gerne!${S.settings.signature ? '\n' + S.settings.signature : ''}`.replace(/\s+\n/g, '\n'); };
ACT['fv-ai'] = async (el) => {
  const it = itemById($('#fv-item').value); const p = favPrice(it, AS.favPct); const ta = $('#fv-text');
  el.disabled = true; ta.value = 'Wird formuliert…';
  try { const r = await S.sample(AI.favPrompt({ it, s: S.settings, price: p.price, discountPct: AS.favPct }), { modelTier: 'quick', cache: false, onText: ({ text }) => { ta.value = text; } }); ta.value = r.text.trim(); }
  catch (e) { ta.value = e.text || ''; if (e.code !== 'cancelled') toast(aiErr(e), 'bad'); }
  finally { el.disabled = false; }
};

ASSIST.automatik = () => {
  const drops = RL.dueDrops(S.items, S.settings);
  const relist = RL.relistCandidates(S.items, S.settings);
  const planned = S.items.filter((i) => i.status === 'Online' && i.autoDrop && i.autoDrop.enabled);
  const online = S.items.filter((i) => i.status === 'Online' && !(i.autoDrop && i.autoDrop.enabled) && RL.n0(i.listPrice) > 0);
  return `<div class="grid g2">
  <div class="card"><h2>Fällige Preissenkungen <span class="muted small">(${drops.length})</span></h2>
    <p class="sub">Berechnet aus deinen Regeln – nie unter dem Mindestpreis. Nach der Freigabe wird der Preis in RELOOP geändert; auf der Plattform passt du ihn selbst an.</p>
    ${drops.length ? `${drops.map((d) => { const it = itemById(d.id); return `<label class="list-row" style="cursor:pointer"><input type="checkbox" class="drop-chk" value="${d.id}" checked style="accent-color:var(--accent)">${thumbHTML(it)}<div class="grow"><div class="ellipsis"><b>${esc(displayTitle(it))}</b></div><div class="tiny muted">${d.daysSince} Tage seit letzter Änderung${d.floorReached ? ' · Mindestpreis erreicht' : ''}</div></div><div class="right num"><s class="muted small">${eur(d.from)}</s><br><b>${eur(d.to)}</b></div></label>`; }).join('')}
      <button class="btn primary" style="margin-top:12px" data-act="apply-drops">${icon('check')}Ausgewählte freigeben</button>` : '<p class="small muted">Aktuell nichts fällig.</p>'}
    <hr><h3>Geplant <span class="muted small">(${planned.length})</span></h3>
    ${planned.length ? planned.map((i) => { const days = RL.n0(i.autoDrop.days) || S.settings.dropDays; const since = i.lastPriceChange || i.onlineSince; const next = since ? RL.isoDate(new Date(Date.parse(since + 'T12:00:00') + days * 86400000)) : null; return `<div class="list-row"><div class="grow small ellipsis">${esc(displayTitle(i))}</div><span class="tiny muted">−${RL.n0(i.autoDrop.pct) || S.settings.dropPct} % alle ${days} T. · nächste ${next ? fmtDate(next) : '–'} · min. ${RL.n0(i.minPrice) > 0 ? eur(i.minPrice) : '–'}</span><button class="btn sm ghost" data-act="ad-toggle" data-id="${i.id}" data-v="0">Aus</button></div>`; }).join('') : '<p class="small muted">Keine Regeln aktiv.</p>'}
    ${online.length ? `<hr><h3>Online ohne Preisregel</h3>${online.slice(0, 10).map((i) => `<div class="list-row"><div class="grow small ellipsis">${esc(displayTitle(i))}</div><span class="tiny muted">${eur(i.listPrice)} · min. ${RL.n0(i.minPrice) > 0 ? eur(i.minPrice) : '<span style="color:var(--warn)">nicht gesetzt</span>'}</span><button class="btn sm" data-act="ad-toggle" data-id="${i.id}" data-v="1">−${S.settings.dropPct} % / ${S.settings.dropDays} T.</button></div>`).join('')}` : ''}
  </div>
  <div class="card"><h2>Relisting-Empfehlungen <span class="muted small">(${relist.length})</span></h2>
    <p class="sub">Artikel, die länger als ${S.settings.relistDays} Tage online sind (änderbar in den Einstellungen). Neu eingestellte Anzeigen erscheinen wieder weiter oben.</p>
    ${relist.length ? relist.map(({ it, days }) => `<div class="list-row">${thumbHTML(it)}<div class="grow"><button class="link ellipsis" data-act="open-item" data-id="${it.id}" data-tab="anzeige">${esc(displayTitle(it))}</button><div class="tiny muted">${days} Tage online${it.relistCount ? ` · ${it.relistCount}× neu eingestellt` : ''}</div></div><button class="btn sm" data-act="relist" data-id="${it.id}">Neu eingestellt</button></div>`).join('') : '<p class="small muted">Keine Artikel über der Grenze.</p>'}
    <div class="note small" style="margin-top:12px"><b>Manueller Ablauf (ohne Schnittstelle):</b><ol style="margin:6px 0 0;padding-left:18px"><li>Im Artikel „Anzeige“ öffnen und Text kopieren, Bilder herunterladen.</li><li>Neue Anzeige auf der Plattform erstellen.</li><li>Erst danach die alte Anzeige löschen.</li><li>Hier „Neu eingestellt“ klicken – der Online-Zeitraum startet neu.</li></ol></div>
  </div></div>`;
};
ACT['apply-drops'] = async () => {
  const ids = $$('.drop-chk').filter((c) => c.checked).map((c) => c.value);
  const drops = RL.dueDrops(S.items, S.settings).filter((d) => ids.includes(d.id));
  if (!drops.length) { toast('Nichts ausgewählt.', 'bad'); return; }
  if (!(await confirmDialog('Preissenkungen freigeben?', drops.map((d) => `${esc(displayTitle(itemById(d.id)))}: ${eur(d.from)} → <b>${eur(d.to)}</b>`).join('<br>') + '<br><br>Denke daran, die Preise auch auf der Plattform zu ändern.', 'Freigeben'))) return;
  for (const d of drops) {
    const it = itemById(d.id); const floor = RL.n0(it.minPrice);
    const to = Math.max(d.to, floor); // doppelte Absicherung
    await patchItem(d.id, { listPrice: to, lastPriceChange: RL.today(), priceHistory: [...(it.priceHistory || []).slice(-30), { d: RL.today(), p: to }] }, { immediate: true });
  }
  toast(`${drops.length} Preis(e) aktualisiert`); render();
};
ACT['ad-toggle'] = async (el) => {
  const it = itemById(el.dataset.id); const on = el.dataset.v === '1';
  if (on && !(RL.n0(it.minPrice) > 0)) {
    const sug = RL.roundPriceUp(Math.max(RL.n0(it.listPrice) * 0.7, RL.n0(it.purchasePrice) + RL.sellerShipping(S.settings) + 1));
    const r = await modal({ title: 'Mindestpreis festlegen', body: `<p class="muted small">Für automatische Preissenkungen brauchst du einen Mindestpreis.</p><label class="f"><span>Mindestpreis (€)</span><input class="in" name="min" type="number" step="0.5" min="0.5" value="${sug}"></label><div class="modal-err small" style="color:var(--bad)"></div>`, actions: [{ label: 'Abbrechen', value: false, kind: 'ghost' }, { label: 'Aktivieren', value: true, kind: 'primary', validate: (v) => (RL.num(v.min) > 0 ? '' : 'Bitte einen gültigen Preis eingeben.') }] });
    if (!r || !r.value) return;
    await patchItem(it.id, { minPrice: RL.num(r.vals.min) }, { immediate: true });
  }
  await patchItem(it.id, { autoDrop: { enabled: on, pct: (it.autoDrop && it.autoDrop.pct) || S.settings.dropPct, days: (it.autoDrop && it.autoDrop.days) || S.settings.dropDays }, ...(on && !it.lastPriceChange ? { lastPriceChange: it.onlineSince || RL.today() } : {}) }, { immediate: true });
  render();
};
ACT.relist = async (el) => {
  const it = itemById(el.dataset.id);
  if (!(await confirmDialog('Als neu eingestellt markieren?', 'Bestätige nur, wenn du die Anzeige auf der Plattform tatsächlich neu erstellt hast.', 'Bestätigen'))) return;
  await patchItem(it.id, { onlineSince: RL.today(), relistCount: (it.relistCount || 0) + 1, lastPriceChange: RL.today() }, { immediate: true });
  toast('Relisting vermerkt'); render();
};

/* ================= KI-Shop-Assistent ================= */
VIEW_RENDER.chat = () => {
  const C = S.chat;
  const sugg = ['Welche Artikel verkaufen sich schlecht?', 'Welche Produkte sollte ich günstiger anbieten?', 'Wie viel Gewinn habe ich diesen Monat erzielt?', 'Welche Artikel sollte ich neu einstellen?', 'Erstelle mir fünf neue Produktbeschreibungen.'];
  return pageHead('KI-Shop-Assistent', 'Frag nach deinen echten Inventar- und Verkaufsdaten. Vorgeschlagene Änderungen werden erst nach deiner Bestätigung übernommen.', C.turns.length ? '<button class="btn sm" data-act="chat-clear">Neuer Chat</button>' : '') + `
  ${!aiAvailable() ? '<div class="note warn">Die KI ist in dieser Ansicht nicht verfügbar.</div>' : ''}
  <div class="grid g-main">
    <div class="card chat"><div class="chat-log" id="chat-log">${chatLogHTML()}</div>
      ${!C.turns.length ? `<div class="suggest" style="margin-bottom:10px">${sugg.map((s) => `<button data-act="chat-suggest">${esc(s)}</button>`).join('')}</div>` : ''}
      <div class="chat-in"><textarea class="in" id="chat-in" placeholder="Frag etwas zu deinem Shop…" ${aiAvailable() ? '' : 'disabled'}></textarea>
        ${C.busy ? '<button class="btn" data-act="chat-stop">Stopp</button>' : `<button class="btn primary" data-act="chat-send" ${aiAvailable() ? '' : 'disabled'}>Senden</button>`}</div></div>
    <div class="card"><h2>Vorgeschlagene Änderungen</h2><div id="proposals">${proposalsHTML()}</div>
      <p class="tiny muted" style="margin-top:12px">Der Assistent sieht deine Artikel und Kennzahlen aus der Datenbank, aber keine Plattform-Daten. Preisvorschläge unter dem Mindestpreis werden abgelehnt.</p></div>
  </div>`;
};
function chatLogHTML() {
  const C = S.chat;
  if (!C.turns.length) return '<div class="empty" style="padding:30px 10px"><h3>Was möchtest du wissen?</h3><p>Ich analysiere dein Inventar und deine Verkäufe.</p></div>';
  return C.turns.map((t) => `<div class="msg ${t.role === 'user' ? 'u' : 'a'}">${esc(t.content)}</div>`).join('') + (C.busy && C.streaming === undefined ? '<div class="msg a"><span class="loading-line"><span class="spin"></span>Denke nach…</span></div>' : '');
}
function proposalsHTML() {
  const P = S.chat.proposals.filter((p) => p.state === 'offen');
  if (!P.length) return '<p class="small muted">Keine offenen Vorschläge.</p>';
  return P.map((p) => { const it = itemById(p.id); return `<div class="proposal" style="margin-bottom:8px"><div class="small"><b>${esc(it ? displayTitle(it) : p.id)}</b><br>${p.type === 'price' ? `Preis ${eur(p.from)} → <b>${eur(p.to)}</b>` : `Status ${esc(p.from)} → <b>${esc(p.to)}</b>`}${p.reason ? `<div class="tiny muted">${esc(p.reason)}</div>` : ''}</div><div class="row" style="flex-wrap:nowrap"><button class="btn sm primary" data-act="prop-ok" data-pid="${p.pid}">Übernehmen</button><button class="btn sm ghost" data-act="prop-no" data-pid="${p.pid}">${icon('x')}</button></div></div>`; }).join('');
}
function chatData() {
  const t = RL.today();
  const rows = S.items.slice(0, 250).map((i) => ({
    id: i.id, sku: i.sku, titel: displayTitle(i), marke: i.brand || undefined, kat: i.category || undefined, groesse: i.size || undefined, zustand: i.condition || undefined, status: i.status,
    ek: RL.n0(i.purchasePrice) || undefined, preis: RL.n0(i.listPrice) || undefined, min: RL.n0(i.minPrice) || undefined,
    vk: i.status === 'Verkauft' ? RL.n0(i.salePrice) : undefined, vkDatum: i.saleDate || undefined, gewinn: i.status === 'Verkauft' ? RL.soldProfit(i) : undefined,
    onlineTage: i.status === 'Online' || i.status === 'Reserviert' ? RL.daysBetween(i.onlineSince || i.createdAt, t) : undefined,
    lagerTage: i.status !== 'Verkauft' ? RL.daysBetween(i.purchaseDate || i.createdAt, t) : undefined, kanal: i.channel || undefined,
  }));
  return { kpis: { ...RL.kpis(S.items), monat: RL.monthly(S.items, 3), ausgaben_gesamt: RL.r2(S.expenses.reduce((a, e) => a + RL.n0(e.amount), 0)), ausgaben_letzte_3_monate: RL.series(S.items, 'month', 3, undefined, S.expenses).map((x) => ({ monat: x.key, ausgaben: x.expenses, netto: x.net })) }, items: rows, truncated: S.items.length > 250 };
}
const chatTools = () => [
  { name: 'propose_price_change', description: 'Schlägt eine Preisänderung für einen Artikel vor. Wird NICHT ausgeführt, sondern dem Nutzer zur Bestätigung angezeigt. Gibt eine Bestätigung oder einen Fehler zurück (z. B. unter Mindestpreis).', inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Artikel-id aus den Daten' }, newPrice: { type: 'number', description: 'Neuer Angebotspreis in EUR' }, reason: { type: 'string' } }, required: ['id', 'newPrice'] },
    execute: (inp) => { const it = itemById(String(inp.id)); if (!it) throw new Error('Unbekannte Artikel-id'); if (it.status === 'Verkauft') throw new Error('Artikel ist bereits verkauft'); const np = RL.r2(RL.num(inp.newPrice)); if (!(np > 0)) throw new Error('Ungültiger Preis'); if (RL.n0(it.minPrice) > 0 && np < RL.n0(it.minPrice)) throw new Error(`Abgelehnt: unter dem Mindestpreis von ${it.minPrice} €`); S.chat.proposals.push({ pid: uidGen('p'), type: 'price', id: it.id, from: it.listPrice, to: np, reason: String(inp.reason || ''), state: 'offen' }); const b = $('#proposals'); if (b) b.innerHTML = proposalsHTML(); return 'Vorschlag angelegt – wartet auf Bestätigung durch den Nutzer.'; } },
  { name: 'propose_status_change', description: 'Schlägt eine Statusänderung vor (Auf Lager, In Bearbeitung, Online, Reserviert). Wird erst nach Bestätigung durch den Nutzer ausgeführt. Verkäufe können so nicht erfasst werden.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string', enum: ['Auf Lager', 'In Bearbeitung', 'Online', 'Reserviert'] }, reason: { type: 'string' } }, required: ['id', 'status'] },
    execute: (inp) => { const it = itemById(String(inp.id)); if (!it) throw new Error('Unbekannte Artikel-id'); const st = String(inp.status); if (!['Auf Lager', 'In Bearbeitung', 'Online', 'Reserviert'].includes(st)) throw new Error('Ungültiger Status'); if (it.status === 'Verkauft') throw new Error('Verkaufte Artikel nicht änderbar'); S.chat.proposals.push({ pid: uidGen('p'), type: 'status', id: it.id, from: it.status, to: st, reason: String(inp.reason || ''), state: 'offen' }); const b = $('#proposals'); if (b) b.innerHTML = proposalsHTML(); return 'Vorschlag angelegt – wartet auf Bestätigung.'; } },
];
async function chatSend(text) {
  const C = S.chat; if (C.busy || !text.trim() || !aiAvailable()) return;
  C.turns.push({ role: 'user', content: text.trim() });
  C.busy = true; C.streaming = undefined; C.ctl = new AbortController();
  render();
  const rules = AI.chatRules(chatData(), S.settings);
  const history = C.turns.slice(-12);
  const input = [{ role: 'user', content: rules }, { role: 'assistant', content: 'Verstanden. Ich nutze nur diese Daten und schlage Änderungen nur über die Werkzeuge vor.' }, ...history];
  let bubble = null;
  const opts = { signal: C.ctl.signal, onText: ({ text: t }) => { C.streaming = t; if (!bubble) { const log = $('#chat-log'); if (!log) return; const pend = log.querySelector('.msg.a:last-child .loading-line'); if (pend) pend.parentElement.remove(); bubble = document.createElement('div'); bubble.className = 'msg a'; log.appendChild(bubble); } bubble.textContent = t; const log = $('#chat-log'); if (log) log.scrollTop = log.scrollHeight; } };
  if (aiToolsAvailable()) opts.tools = chatTools(); else opts.cache = false;
  try {
    const r = await S.sample(input, opts);
    C.turns.push({ role: 'assistant', content: r.text.trim() + (r.truncated ? '\n\n[gekürzt]' : '') });
  } catch (e) {
    if (e.text) C.turns.push({ role: 'assistant', content: e.text + '\n\n[unterbrochen]' });
    if (e.code !== 'cancelled') toast(aiErr(e), 'bad');
    else if (!e.text) C.turns.pop();
  } finally { C.busy = false; C.streaming = undefined; if (S.view === 'chat') render(); }
}
AFTER.chat = () => {
  const log = $('#chat-log'); if (log) log.scrollTop = log.scrollHeight;
  const inp = $('#chat-in'); if (inp) { inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ACT['chat-send'](); } }); if (!S.chat.busy) inp.focus(); }
};
ACT['chat-send'] = () => { const inp = $('#chat-in'); const t = inp.value; inp.value = ''; chatSend(t); };
ACT['chat-suggest'] = (el) => chatSend(el.textContent);
ACT['chat-stop'] = () => { if (S.chat.ctl) S.chat.ctl.abort(); };
ACT['chat-clear'] = () => { S.chat.turns = []; render(); };
ACT['prop-no'] = (el) => { const p = S.chat.proposals.find((x) => x.pid === el.dataset.pid); if (p) p.state = 'verworfen'; $('#proposals').innerHTML = proposalsHTML(); };
ACT['prop-ok'] = async (el) => {
  const p = S.chat.proposals.find((x) => x.pid === el.dataset.pid); if (!p) return;
  const it = itemById(p.id); if (!it) { p.state = 'verworfen'; $('#proposals').innerHTML = proposalsHTML(); return; }
  if (p.type === 'price') {
    if (RL.n0(it.minPrice) > 0 && p.to < RL.n0(it.minPrice)) { toast('Unter Mindestpreis – nicht übernommen.', 'bad'); return; }
    await patchItem(it.id, { listPrice: p.to, ...(it.status === 'Online' ? { lastPriceChange: RL.today(), priceHistory: [...(it.priceHistory || []).slice(-30), { d: RL.today(), p: p.to }] } : {}) }, { immediate: true });
  } else {
    await patchItem(it.id, { status: p.to, ...(p.to === 'Online' && !it.onlineSince ? { onlineSince: RL.today() } : {}) }, { immediate: true });
  }
  p.state = 'übernommen'; toast('Änderung übernommen'); $('#proposals').innerHTML = proposalsHTML();
};

/* ================= Einstellungen ================= */
VIEW_RENDER.einstellungen = () => {
  const s = S.settings;
  const fee = (ch) => `<div class="list-row"><div class="grow"><b>${ch}</b></div><label class="f" style="width:110px"><span>Provision %</span><input class="in" type="number" step="0.1" min="0" max="50" data-s="fees.${ch}.pct" id="s-f-${ch}-p" value="${s.fees[ch].pct}"></label><label class="f" style="width:110px"><span>Fix € / Verkauf</span><input class="in" type="number" step="0.05" min="0" data-s="fees.${ch}.fix" id="s-f-${ch}-f" value="${s.fees[ch].fix}"></label></div>`;
  const tone = { freundlich: 'Freundlich & locker', sachlich: 'Sachlich & professionell', herzlich: 'Herzlich mit Emojis', kurz: 'Kurz & direkt' }[s.writingStyle] || s.writingStyle;
  const tpls = ['Vinted', 'Kleinanzeigen', 'eBay'].filter((p) => s.templates[p]);
  const sections = [
    ...(window.RLX && typeof RLX.settingsSections === 'function' ? RLX.settingsSections() : []),
    { id: 'fees', ic: 'coins', t: 'Plattformgebühren', d: RL.CHANNELS.map((c) => `${c} ${RL.n0(s.fees[c].pct)} %${RL.n0(s.fees[c].fix) ? ' + ' + eur(s.fees[c].fix) : ''}`).join(' · '), body: `<p class="sub">Standard für Privatverkäufer in Deutschland: Vinted, eBay und Kleinanzeigen erheben keine Verkaufsprovision (Stand 2026). Passe die Werte an, wenn du gewerblich verkaufst oder Zusatzoptionen nutzt.</p>${RL.CHANNELS.map(fee).join('')}` },
    { id: 'ship', ic: 'truck', t: 'Versand & Kalkulation', d: `${s.buyerPaysShipping ? 'Käufer zahlt Versand' : 'Versand ' + eur(s.shippingCost)} · Zielmarge ${RL.n0(s.targetMargin)} %${RL.n0(s.monthlyGoal) ? ' · Monatsziel ' + eur(s.monthlyGoal) : ''}`, body: `<label class="check"><input type="checkbox" data-s="buyerPaysShipping" id="s-bps" ${s.buyerPaysShipping ? 'checked' : ''}> Käufer zahlt den Versand (z. B. Vinted-Versandlabel)</label>
      <div class="fgrid" style="grid-template-columns:1fr 1fr;margin-top:12px">
        <label class="f"><span>Versandkosten, wenn du zahlst (€)</span><input class="in" type="number" step="0.1" min="0" data-s="shippingCost" id="s-ship" value="${s.shippingCost}"></label>
        <label class="f"><span>Verpackung pro Verkauf (€)</span><input class="in" type="number" step="0.05" min="0" data-s="packagingCost" id="s-pack" value="${s.packagingCost}"></label>
        <label class="f"><span>🎯 Monatsziel Gewinn (€)</span><input class="in" type="number" step="10" min="0" data-s="monthlyGoal" id="s-goal" value="${RL.n0(s.monthlyGoal) || ''}" placeholder="z. B. 500"></label>
        <label class="f"><span>Zielmarge (%)</span><input class="in" type="number" step="1" min="0" max="90" data-s="targetMargin" id="s-tm" value="${s.targetMargin}"></label>
        <label class="f"><span>Standard-Kanal</span>${sel('ch', RL.CHANNELS, s.defaultChannel, 'data-s="defaultChannel" id="s-dch"')}</label>
      </div>` },
    { id: 'style', ic: 'pen', t: 'Schreibstil', d: `${tone}${s.stockPrefix ? ' · Lagernummer ' + RL.nextStockNo(S.items, s.stockPrefix) + ' als Nächstes' : s.vintedCode ? ' · Code ' + s.vintedCode : ''}${s.vintedHashtags !== false ? ' · #Hashtags' : ''}`, body: `<p class="sub">Für Anzeigen, Antworten und Favoriten-Nachrichten.</p>
      <label class="f"><span>Tonfall</span>${sel('st', [['freundlich', 'Freundlich & locker'], ['sachlich', 'Sachlich & professionell'], ['herzlich', 'Herzlich mit Emojis'], ['kurz', 'Kurz & direkt']], s.writingStyle, 'data-s="writingStyle" id="s-ws"')}</label>
      <label class="f" style="margin-top:10px"><span>Eigene Stilwünsche</span><input class="in" data-s="styleNotes" id="s-sn" value="${esc(s.styleNotes)}" placeholder="z. B. immer „Liebe Grüße“ statt „LG“"></label>
      <label class="f" style="margin-top:10px"><span>Fester Text – steht immer am Ende jeder Beschreibung (optional)</span><textarea class="in" data-s="signature" id="s-sig" rows="3" placeholder="z. B. Tierfreier Nichtraucherhaushalt 🏡&#10;Schau gern in meinen Kleiderschrank 👀">${esc(s.signature)}</textarea></label>
      <label class="f" style="margin-top:10px"><span>⚡ Schnellantworten (eine pro Zeile)</span><textarea class="in" id="s-qr" data-s="quickReplies" data-lines="1" rows="5">${esc((s.quickReplies || []).join('\n'))}</textarea></label>
      <label class="check" style="margin-top:10px"><input type="checkbox" data-s="autoListing" id="s-auto" ${s.autoListing !== false ? 'checked' : ''}> Anzeigentext automatisch erstellen (nach der Analyse und beim Öffnen des Tabs „Anzeige“)</label>
      <label class="check" style="margin-top:10px"><input type="checkbox" data-s="useEmojis" id="s-emo" ${s.useEmojis ? 'checked' : ''}> Emojis in Vinted-Beschreibungen</label>
      <label class="check" style="margin-top:8px"><input type="checkbox" data-s="vintedHashtags" id="s-hash" ${s.vintedHashtags !== false ? 'checked' : ''}> Passende #Hashtags an Vinted-Beschreibungen anhängen</label>
      <div class="fgrid" style="grid-template-columns:1fr 1fr;margin-top:10px">
        <label class="f"><span>Lagernummer-Kürzel (z. B. M für Mike)</span><input class="in" data-s="stockPrefix" id="s-prefix" value="${esc(s.stockPrefix || '')}" placeholder="M"></label>
        <label class="f"><span>Fester Code, falls ein Artikel keine Lagernummer hat</span><input class="in" data-s="vintedCode" id="s-vcode" value="${esc(s.vintedCode || '')}" placeholder="z. B. M-0 – leer = keiner"></label></div>
      <p class="tiny muted" style="margin:6px 0 0">Neue Artikel bekommen fortlaufend die nächste Lagernummer – als Nächstes <b>${esc(RL.nextStockNo(S.items, s.stockPrefix) || '–')}</b>. Sie steht in der Vinted-Beschreibung direkt unter dem Versand.</p>` },
    { id: 'tpl', ic: 'file', t: 'Beschreibungs-Vorlagen', d: tpls.length ? 'Eigene Vorlage: ' + tpls.join(', ') : 'Standardaufbau für alle Plattformen', body: `<div class="seg">${['Vinted', 'Kleinanzeigen', 'eBay'].map((p) => `<button class="${S.tplPlatform === p ? 'on' : ''}" data-act="tpl-platform" data-v="${p}">${p}${s.templates[p] ? ' ✓' : ''}</button>`).join('')}</div>
      <p class="sub" style="margin-top:10px">Lege fest, wie deine ${esc(S.tplPlatform)}-Beschreibung aufgebaut ist. Feste Texte übernimmt RELOOP wörtlich, <b>{Platzhalter}</b> werden mit den Artikeldaten gefüllt. Zeilen, für die keine Daten da sind, fallen automatisch weg. Leer = Standardaufbau.</p>
      <div class="grid g-main" style="gap:14px">
        <div><textarea class="in mono" id="tpl-text" data-s="templates.${S.tplPlatform}" rows="16" style="font-size:13px" placeholder="Noch keine eigene Vorlage – „Standard als Startpunkt“ klicken oder selbst schreiben">${esc(s.templates[S.tplPlatform] || '')}</textarea>
          <div class="row" style="margin-top:8px"><button class="btn sm" data-act="tpl-default">Standard als Startpunkt</button><button class="btn sm ghost" data-act="tpl-clear">Leeren</button><span class="tiny muted">Wird automatisch gespeichert.</span></div></div>
        <div><div class="small muted" style="margin-bottom:6px">Platzhalter einfügen (Klick):</div><div class="suggest">${RL.PLACEHOLDERS.map(([k, l]) => `<button data-act="tpl-insert" data-v="{${k}}" title="${esc(l)}">{${k}}</button>`).join('')}</div>
          <div class="small muted" style="margin:14px 0 6px">Vorschau${S.items.length ? ' mit „' + esc(displayTitle(S.items[0])) + '“' : ' (Beispielartikel)'}:</div><pre class="note" id="tpl-preview" style="white-space:pre-wrap;font:13px/1.45 var(--font);margin:0;max-height:330px;overflow:auto"></pre></div>
      </div>` },
    { id: 'auto', ic: 'clock', t: 'Automatik-Regeln', d: `−${s.dropPct} % alle ${s.dropDays} Tage · Relisting nach ${s.relistDays} Tagen`, body: `<p class="sub">Standardwerte für neue Preisregeln. Alles wird nur vorgeschlagen und erst nach Freigabe übernommen.</p>
      <div class="fgrid" style="grid-template-columns:1fr 1fr 1fr">
        <label class="f"><span>Preissenkung %</span><input class="in" type="number" min="1" max="50" data-s="dropPct" id="s-dp" value="${s.dropPct}"></label>
        <label class="f"><span>alle … Tage</span><input class="in" type="number" min="1" max="90" data-s="dropDays" id="s-dd" value="${s.dropDays}"></label>
        <label class="f"><span>Relisting nach … Tagen</span><input class="in" type="number" min="3" max="365" data-s="relistDays" id="s-rd" value="${s.relistDays}"></label>
      </div>` },
    { id: 'conn', ic: 'link', t: 'Plattform-Anbindungen', d: `Vinted & Kleinanzeigen manuell · Gmail ${window.GoogleBridge && GoogleBridge.connected() ? 'verbunden' : 'nicht verbunden'} · Google Sheets ${S.settings.sheetsUrl ? 'Tabelle eingetragen' : 'nicht eingerichtet'}`, body: `${vintedAccountsHTML()}
      <div class="list-row"><div class="grow"><b>Kleinanzeigen</b><div class="tiny muted">Keine öffentliche API für Privatanzeigen.</div></div><span class="chip">Manuell</span></div>
      <div class="list-row"><div class="grow"><b>eBay</b><div class="tiny muted">Offizielle Sell-API vorhanden (Entwicklerkonto & OAuth) – Anbindung in Planung.</div></div><span class="chip warn">Nicht verbunden</span></div>
      <div class="list-row"><div class="grow"><b>Gmail</b><div class="tiny muted">Verkaufs-Mails werden automatisch als Verkauf eingetragen.</div></div>${S.mail && S.mail.enabled ? '<span class="chip ok">Verbunden</span>' : ''}<button class="btn sm" data-nav="verkaeufe">Gmail-Abgleich öffnen</button></div>
      <div id="sheet-card">${sheetCardHTML()}</div>` },
    { id: 'google', ic: 'link', t: 'Google (Gmail & Sheets)', d: window.GoogleBridge && GoogleBridge.connected() ? 'Verbunden' : (window.GoogleBridge && GoogleBridge.clientId() ? 'Eingerichtet – nicht angemeldet' : 'Nicht eingerichtet'), body: googleCardHTML() + (window.GoogleBridge && GoogleBridge.connected() ? `<div class="row" style="margin-top:12px"><button class="btn sm" data-act="mail-check">Gmail jetzt prüfen</button><button class="btn sm ghost" data-act="mail-since">Ab wann Verkäufe übernehmen…</button></div>` : '') },
    { id: 'auth', ic: 'lock', t: 'Anmeldung', d: S.auth ? 'Aktiv für ' + S.auth.user : 'Aus – optional mit Benutzername & Passwort', body: authCardHTML().replace(/^<div class="card"><h2>Anmeldung<\/h2>/, '').replace(/<\/div>$/, '') },
    { id: 'data', ic: 'database', t: 'Daten & Datenschutz', d: 'Backup, Import, Export als CSV, Daten löschen', body: `<p class="small">Deine Artikel, Fotos und Ausgaben liegen nur hier im Browser auf diesem Gerät (IndexedDB) – nichts davon geht an einen Server. Freistellen & Bildbearbeitung laufen ebenfalls lokal. Andere Geräte oder Browser sehen diese Daten nicht; zum Umziehen nutzt du Backup & Import.</p><p class="tiny muted" id="storage-info"></p>
      <div class="row"><button class="btn" data-act="export-json">${icon('download')}Alle Daten exportieren (JSON)</button><button class="btn" data-act="csv-export">${icon('download')}Inventar als CSV</button></div>
      <div class="row" style="margin-top:8px"><button class="btn" data-act="export-full">${icon('download')}Komplett-Backup inkl. Fotos</button><button class="btn" data-act="import-backup">${icon('upload')}Backup importieren</button></div>
      <hr><button class="btn danger" data-act="wipe">${icon('trash')}Alle Artikel löschen</button>` },
  ];
  return pageHead('Einstellungen', 'Tippe auf einen Bereich, um ihn zu öffnen. Änderungen werden sofort gespeichert.') + `
  <div class="acc">${sections.map((x) => `<section class="acc-item ${S.setOpen === x.id ? 'open' : ''}" data-sec="${x.id}">
    <button class="acc-head" data-act="set-toggle" data-v="${x.id}" aria-expanded="${S.setOpen === x.id}"><span class="acc-ic">${icon(x.ic)}</span><span class="acc-t"><b>${x.t}</b><small>${esc(x.d)}</small></span><span class="acc-chev">${icon('chevron')}</span></button>
    <div class="acc-body"><div class="acc-in">${x.body}</div></div></section>`).join('')}</div>`;
};
/** Vinted-Konten: werden über Gmail zugeordnet („Hallo <Konto>, … hat gekauft“) */
function vintedAccountsHTML() {
  const accs = RL.vintedAccounts(S.items, S.settings);
  const stat = (a) => { const its = S.items.filter((i) => i.account === a); const sold = its.filter((i) => i.status === 'Verkauft'); return `${its.length} Artikel · ${sold.length} Verkäufe · ${eur(sold.reduce((x, i) => x + RL.n0(i.salePrice), 0))}`; };
  return `<div class="list-row" style="flex-wrap:wrap;align-items:flex-start"><div class="grow" style="min-width:240px"><b>Vinted-Konten</b><div class="tiny muted">RELOOP erkennt an jeder Verkaufs-Mail, an welches Konto sie ging („Hallo <i>kontoname</i>, …“), und ordnet den Verkauf nur Artikeln dieses Kontos zu. Mails des zweiten Kontos müssen im verbundenen Gmail-Postfach ankommen – am einfachsten per Weiterleitung. Vinted selbst hat keine offene Schnittstelle, Anzeigen stellst du weiter selbst ein.</div></div><span class="chip">${accs.length} Konto${accs.length === 1 ? '' : 'en'}</span></div>
    ${accs.map((a) => `<div class="list-row"><div class="grow"><b>${esc(a)}</b><div class="tiny muted">${stat(a)}</div></div><button class="btn sm ghost" data-act="acc-del" data-v="${esc(a)}" title="Aus der Liste entfernen (Artikel behalten ihr Konto)">Entfernen</button></div>`).join('')}
    <div class="row" style="margin-top:6px"><input class="in" id="acc-new" placeholder="Vinted-Benutzername, z. B. tmas_vintage" style="flex:1;min-width:200px"><button class="btn sm" data-act="acc-add">Konto hinzufügen</button></div>`;
}
ACT['acc-add'] = () => {
  const v = ($('#acc-new').value || '').trim().replace(/^@/, ''); if (!v) return;
  const list = S.settings.vintedAccounts || []; if (!list.includes(v)) saveSettings({ vintedAccounts: [...list, v] });
  toast(`Vinted-Konto „${v}“ hinzugefügt`); render();
};
ACT['acc-del'] = (el) => { saveSettings({ vintedAccounts: (S.settings.vintedAccounts || []).filter((x) => x !== el.dataset.v) }); render(); };
ACT['set-toggle'] = (el) => {
  const id = el.dataset.v; S.setOpen = S.setOpen === id ? null : id;
  $$('.acc-item').forEach((n) => { const on = n.dataset.sec === S.setOpen; n.classList.toggle('open', on); n.querySelector('.acc-head').setAttribute('aria-expanded', on); });
  if (S.setOpen) { updateTplPreview(); const n = $(`.acc-item[data-sec="${S.setOpen}"]`); setTimeout(() => { const r = n.getBoundingClientRect(); if (r.top < 0 || r.top > innerHeight * 0.6) n.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60); }
};
S.tplPlatform = S.tplPlatform || 'Vinted';
const TPL_SAMPLE = { brand: 'Polo Ralph Lauren', productType: 'Polo Shirt', category: 'Polo', gender: 'Herren', size: 'L', color: 'Schwarz', material: '100 % Baumwolle', fit: 'Custom Slim Fit', condition: 'Sehr gut', features: ['Gesticktes Pony-Logo'], defects: [], measurements: { length: 72, chest: 54 }, sku: 'RL-BEISPIEL', listPrice: 25 };
function updateTplPreview() {
  const box = $('#tpl-preview'); if (!box) return;
  const it = S.items.find((i) => i.brand || i.productType) || TPL_SAMPLE;
  const d = RL.templateListing(it, S.tplPlatform, S.settings).description;
  box.textContent = d;
}
AFTER.einstellungen = () => updateTplPreview();
ACT['tpl-platform'] = (el) => { S.tplPlatform = el.dataset.v; render(); };
ACT['tpl-default'] = async () => { const ta = $('#tpl-text'); if (ta.value.trim() && ta.value !== RL.DEFAULT_TEMPLATES[S.tplPlatform] && !(await confirmDialog('Vorlage ersetzen?', 'Deine aktuelle Vorlage wird durch den Standardaufbau ersetzt.', 'Ersetzen'))) return; ta.value = RL.DEFAULT_TEMPLATES[S.tplPlatform]; ON_INPUT.settings(ta); };
ACT['tpl-clear'] = () => { const ta = $('#tpl-text'); ta.value = ''; ON_INPUT.settings(ta); };
ACT['tpl-insert'] = (el) => {
  const ta = $('#tpl-text'); const v = el.dataset.v;
  const a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? a;
  ta.value = ta.value.slice(0, a) + v + ta.value.slice(b); ta.focus(); ta.setSelectionRange(a + v.length, a + v.length);
  ON_INPUT.settings(ta);
};
ON_INPUT.settings = (el) => {
  const path = el.dataset.s; let v;
  if (el.dataset.lines) { saveSettings({ [path]: el.value.split('\n').map((x) => x.trim()).filter(Boolean) }); return; }
  if (el.type === 'checkbox') v = el.checked; else if (el.type === 'number') { v = RL.num(el.value); if (!Number.isFinite(v)) return; } else v = el.value;
  saveSettings(setPath({}, path, v));
  updateTplPreview();
};
ACT['export-json'] = async () => {
  const data = { app: 'RELOOP', exportedAt: new Date().toISOString(), settings: S.settings, expenses: S.expenses.map((e) => ({ ...e, receipt: e.receipt ? { assetId: e.receipt.aid || null } : null })), items: S.items.map((i) => ({ ...i, images: (i.images || []).map((m) => ({ key: m.key, kind: m.kind, assetId: m.aid || null, w: m.w, h: m.h })) })) };
  await saveFile(`reloop-export-${RL.today()}.json`, JSON.stringify(data, null, 2));
};
/** Komplett-Backup: alle Datenbank-Dokumente + Fotos/PDFs als Base64 – zum Umzug in die eigene PC-App */
const blobToB64 = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
ACT['export-full'] = async (el) => {
  const t0 = el.innerHTML; el.disabled = true; el.textContent = 'Backup wird erstellt…';
  try {
    const raw = async (ref) => { try { const s = await ref.get(); return s.exists ? clone(s.data()) : null; } catch (e) { return null; } };
    const col = async (c, fallback) => { try { return (await c.get()).docs.map((d) => ({ id: d.id, data: clone(d.data()) })); } catch (e) { return fallback.map(({ id, ...data }) => ({ id, data: clone(data) })); } };
    const items = await col(itemsCol(), S.items), expenses = await col(expensesCol(), S.expenses);
    const aids = new Set();
    items.forEach((i) => (i.data.images || []).forEach((m) => m && m.aid && aids.add(m.aid)));
    expenses.forEach((e) => e.data.receipt && e.data.receipt.aid && aids.add(e.data.receipt.aid));
    const blobs = {}; let miss = 0, n = 0;
    for (const aid of aids) {
      el.textContent = `Fotos/Belege ${++n} von ${aids.size}…`;
      try { const r = await fetch('/_blob/' + aid); if (!r.ok) throw new Error(r.status); const b = await r.blob(); blobs[aid] = { type: b.type || 'application/octet-stream', b64: await blobToB64(b) }; } catch (e) { miss++; }
    }
    const data = { app: 'RELOOP', kind: 'full-backup', v: 1, exportedAt: new Date().toISOString(), profile: await raw(profileRef()), items, expenses, meta: { mailsync: await raw(mailRef()) }, auth: await raw(authRef()), blobs };
    if (await saveFile(`reloop-komplett-backup-${RL.today()}.json`, JSON.stringify(data))) toast(`Backup: ${items.length} Artikel, ${expenses.length} Ausgaben, ${Object.keys(blobs).length} Dateien${miss ? ` (${miss} nicht lesbar)` : ''}`);
  } catch (e) { toast('Backup fehlgeschlagen: ' + (e.message || dbMsg(e)), 'bad'); }
  finally { el.disabled = false; el.innerHTML = t0; }
};
ACT.wipe = async () => {
  const r = await modal({ title: 'Alle Artikel löschen?', body: `<p class="muted small">Alle ${S.items.length} Artikel und ihre Bilder werden endgültig gelöscht. Tippe <b>LÖSCHEN</b> zur Bestätigung.</p><input class="in" name="c" autocomplete="off"><div class="modal-err small" style="color:var(--bad);margin-top:6px"></div>`, actions: [{ label: 'Abbrechen', value: false, kind: 'ghost' }, { label: 'Endgültig löschen', value: true, kind: 'danger', validate: (v) => (v.c.trim() === 'LÖSCHEN' ? '' : 'Bitte LÖSCHEN eintippen.') }] });
  if (!r || !r.value) return;
  try { await deleteItems(S.items.map((i) => i.id)); toast('Alle Artikel gelöscht'); } catch (e) { toast('Löschen fehlgeschlagen: ' + dbMsg(e), 'bad'); }
  render();
};
