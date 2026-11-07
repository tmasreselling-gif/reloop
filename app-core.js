/* RELOOP – Kern: Zustand, Datenbank, Hilfsfunktionen, Router */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (v) => RL.fmtEUR(v);
const fmtDate = (d) => { if (!d) return '–'; const t = typeof d === 'number' ? new Date(d) : new Date(String(d).length === 10 ? d + 'T12:00:00' : d); return isNaN(t) ? '–' : t.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }); };
const fmtNum = (v, dig = 0) => (Number.isFinite(v) ? v.toLocaleString('de-DE', { maximumFractionDigits: dig, minimumFractionDigits: dig }) : '–');
const uidGen = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ICONS = {
  overview: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  new: '<path d="M12 5v14M5 12h14"/>',
  studio: '<path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="4"/>',
  pricing: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  inventory: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  sales: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
  stats: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  assist: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  chat: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  expense: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="4"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  coins: '<circle cx="9" cy="9" r="6"/><path d="M15.5 9.5a6 6 0 1 1-6 6"/><path d="M9 6.5v5M7 9h4"/>',
  truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24">${ICONS[n] || ''}</svg>`;

/* ---------------- Zustand ---------------- */
const S = {
  db: null, user: null, sample: null, sampleLimits: null, assets: null, downloads: null, uid: null,
  items: [], expenses: [], itemsLoaded: false, settings: RL.mergeSettings({}), profileLoaded: false, profileExists: false,
  view: 'uebersicht', param: null, itemTab: 'fotos',
  inv: { q: '', status: 'alle', cat: 'alle', owner: 'alle', size: 'alle', account: 'alle', sort: 'updatedAt', dir: 'desc' }, sel: new Set(),
  busy: {}, blobCache: new Map(), charts: [], chat: { turns: [], proposals: [], ctl: null, busy: false },
  assistTab: 'nachrichten', statsRange: 12, listingPlatform: 'Vinted', loadTimer: null, dbError: null,
  autoAnalyze: null, studio: null, readOnly: false,
};
window.S = S; // für Debugging

const VIEWS = [
  { id: 'uebersicht', label: 'Übersicht', icon: 'overview' },
  { id: 'neu', label: 'Artikel erstellen', icon: 'new' },
  { id: 'inventar', label: 'Inventar', icon: 'inventory' },
  { id: 'verkaeufe', label: 'Verkäufe', icon: 'sales' },
  { id: 'ausgaben', label: 'Ausgaben', icon: 'expense' },
  { id: 'statistik', label: 'Statistiken', icon: 'stats' },
  { sep: 'Assistenten' },
  { id: 'assistent', label: 'Verkaufsassistent', icon: 'assist' },
  { id: 'preise', label: 'Gewinnrechner', icon: 'pricing' },
  { id: 'studio', label: 'Bildstudio', icon: 'studio' },
  { sep: '' },
  { id: 'einstellungen', label: 'Einstellungen', icon: 'settings' },
];

/* ---------------- UI-Helfer ---------------- */
function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, kind === 'bad' ? 6000 : 2600);
}

function modal({ title, body = '', actions = [{ label: 'OK', value: true, kind: 'primary' }], wide = false, xl = false, onOpen }) {
  return new Promise((resolve) => {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-bg" data-modal-bg><div class="modal" role="dialog" aria-modal="true" style="${xl ? 'width:min(1180px,100%)' : wide ? 'width:min(760px,100%)' : ''}">
      <h2>${esc(title)}</h2><div class="modal-body">${body}</div>
      <div class="acts">${actions.map((a, i) => `<button class="btn ${a.kind || ''}" data-mi="${i}">${esc(a.label)}</button>`).join('')}</div></div></div>`;
    const close = (v) => { const vals = {}; $$('[name]', root).forEach((el) => { vals[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); root.innerHTML = ''; document.removeEventListener('keydown', onKey); resolve(v === null ? null : { value: v, vals }); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    root.querySelector('[data-modal-bg]').addEventListener('click', (e) => { if (e.target.dataset.modalBg !== undefined) close(null); });
    $$('[data-mi]', root).forEach((b) => b.addEventListener('click', () => {
      const a = actions[+b.dataset.mi];
      if (a.validate) { const vals = {}; $$('[name]', root).forEach((el) => { vals[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); const err = a.validate(vals); if (err) { const n = $('.modal-err', root); if (n) n.textContent = err; return; } }
      close(a.value);
    }));
    const first = $('input,select,textarea', root); if (first) setTimeout(() => first.focus(), 30);
    if (onOpen) onOpen(root);
  });
}
async function confirmDialog(title, text, ok = 'Bestätigen', danger = false) {
  const r = await modal({ title, body: `<p class="muted" style="margin:0">${text}</p>`, actions: [{ label: 'Abbrechen', value: false, kind: 'ghost' }, { label: ok, value: true, kind: danger ? 'danger' : 'primary' }] });
  return !!(r && r.value);
}

async function copyText(t, what = 'Text') {
  try { await navigator.clipboard.writeText(t); toast(`${what} kopiert`); }
  catch (e) {
    await modal({ title: 'Bitte manuell kopieren', body: `<p class="muted small">Die Zwischenablage ist hier gesperrt. Text ist markiert – mit Strg+C / ⌘+C kopieren.</p><textarea class="in" style="min-height:220px" id="copy-fallback">${esc(t)}</textarea>`, actions: [{ label: 'Fertig', value: true, kind: 'primary' }], onOpen: (r) => { const ta = $('#copy-fallback', r); ta.focus(); ta.select(); } });
  }
}

async function saveFile(filename, data) {
  if (!S.downloads) { toast('Downloads sind in diesem Browser nicht verfügbar.', 'bad'); return false; }
  try { await S.downloads.save({ filename, data }); toast('Download gestartet'); return true; }
  catch (e) { if (e && e.code === 'declined') return false; toast('Download fehlgeschlagen: ' + (e && (e.message || e.code)), 'bad'); return false; }
}

const AI_ERR = {
  not_granted: 'Du hast der KI-Nutzung für diese App nicht zugestimmt. Lade die Seite neu, um erneut gefragt zu werden.',
  sampling_disabled: 'Die KI ist für dein Konto nicht verfügbar.',
  rate_limited: 'Zu viele Anfragen oder Nutzungslimit erreicht – bitte kurz warten und erneut versuchen.',
  session_expired: 'Sitzung abgelaufen – bitte neu anmelden.',
  image_rejected: 'Ein Bild wurde abgelehnt (Format oder Größe). Bitte ein anderes Foto verwenden.',
  images_unavailable: 'Bildanalyse ist in dieser Ansicht nicht verfügbar.',
  refused: 'Die KI hat diese Anfrage abgelehnt. Formuliere sie anders.',
  invalid_json: 'Die KI-Antwort war unvollständig. Bitte erneut versuchen.',
  empty_completion: 'Die KI hat keine Antwort geliefert. Bitte erneut versuchen.',
  prompt_too_large: 'Zu viele Daten für eine Anfrage – bitte weniger auswählen.',
  upstream_error: 'Verbindungsproblem zur KI. Bitte erneut versuchen.',
};
const aiErr = (e) => (e && AI_ERR[e.code]) || (e && e.message) || 'Unbekannter Fehler bei der KI-Anfrage.';
const aiAvailable = () => !!S.sample;
const aiImagesAvailable = () => !!(S.sample && S.sampleLimits && S.sampleLimits.images);
const aiToolsAvailable = () => !!(S.sample && S.sampleLimits && S.sampleLimits.tools);

/* ---------------- Theme ---------------- */
function applyTheme(t) {
  t = t || S.settings.theme || 'auto';
  try { localStorage.setItem('rl-theme', t); } catch (e) { /* egal */ }
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $$('#theme-switch button').forEach((b) => b.classList.toggle('on', b.dataset.themeSet === t));
  if (S.charts.length) setTimeout(() => render(), 0);
}

/* ---------------- Datenbank ---------------- */
const profileRef = () => S.db.doc(`data/users/${S.uid}/profile`);
const itemsCol = () => profileRef().collection('items');
const itemById = (id) => S.items.find((i) => i.id === id);
const expensesCol = () => profileRef().collection('expenses');
const pending = new Map();

function deepMerge(t, p) {
  for (const [k, v] of Object.entries(p)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) deepMerge(t[k], v);
    else t[k] = Array.isArray(v) ? v.slice() : (v && typeof v === 'object' ? clone(v) : v);
  }
  return t;
}

function dbMsg(e) {
  const c = e && e.code;
  if (c === 'quota_exceeded') return 'Speicherlimit erreicht – lösche alte Artikel oder Bilder.';
  if (c === 'invalid_argument') return S.readOnly ? 'Keine Schreibrechte.' : 'Ungültige Daten (evtl. zu groß).';
  if (c === 'resource_exhausted') return 'Zu viele Anfragen – kurz warten.';
  return (e && (e.message || c)) || 'Unbekannter Fehler';
}

function patchItem(id, patch, { immediate = false, noSheet = false } = {}) {
  const it = itemById(id);
  if (it) { deepMerge(it, patch); it.updatedAt = Date.now(); }
  if (!noSheet && typeof sheetMarkDirty === 'function') sheetMarkDirty(id, patch); // Änderung → Google-Tabelle
  let p = pending.get(id);
  if (!p) { p = { patch: {}, timer: null, chain: Promise.resolve(), waiters: [] }; pending.set(id, p); }
  deepMerge(p.patch, patch);
  p.patch.updatedAt = Date.now();
  clearTimeout(p.timer);
  return new Promise((res) => { p.waiters.push(res); p.timer = setTimeout(() => flushItem(id), immediate ? 0 : 450); });
}
function flushItem(id) {
  const p = pending.get(id);
  if (!p || !Object.keys(p.patch).length) return Promise.resolve();
  const patch = p.patch; p.patch = {};
  const waiters = p.waiters; p.waiters = [];
  const size = JSON.stringify(itemById(id) || {}).length;
  p.chain = p.chain.then(async () => {
    if (size > 250000) throw { code: 'invalid_argument', message: 'Artikel zu groß (zu viele eingebettete Bilder).' };
    await itemsCol().doc(id).update(patch);
  }).then(() => { waiters.forEach((w) => w(true)); setSaved(true); }).catch((e) => { console.error(e); toast('Speichern fehlgeschlagen: ' + dbMsg(e), 'bad'); waiters.forEach((w) => w(false)); });
  return p.chain;
}
async function flushAll() { await Promise.all([...pending.keys()].map(flushItem)); }
window.addEventListener('pagehide', () => { flushAll(); });

let savedTimer;
function setSaved() { const el = $('#save-state'); if (!el) return; el.textContent = 'Gespeichert ✓'; clearTimeout(savedTimer); savedTimer = setTimeout(() => { if (el) el.textContent = ''; }, 1800); }

async function createItem(data = {}) {
  const id = uidGen('i');
  const now = Date.now();
  const doc = {
    sku: RL.newSku(), status: 'In Bearbeitung', title: '', brand: '', productType: '', category: '', gender: '', size: '', color: '',
    material: '', fit: '', pattern: '', condition: '', features: [], defects: [], labelText: '', measurements: {}, images: [],
    purchasePrice: null, purchaseDate: RL.today(), listPrice: null, minPrice: null, channel: S.settings.defaultChannel,
    salePrice: null, saleDate: null, saleFees: null, saleShipping: null, shipStatus: null, notes: '', listing: {},
    aiFields: [], autoDrop: { enabled: false, pct: S.settings.dropPct, days: S.settings.dropDays }, priceHistory: [],
    owner: S.settings.defaultOwner || '', createdAt: now, updatedAt: now, ...data,
  };
  if (doc.stockNo === undefined) doc.stockNo = RL.nextStockNo(S.items, doc.owner && typeof ownerPrefix === 'function' ? ownerPrefix(doc.owner) : S.settings.stockPrefix);
  S.items.unshift({ id, ...clone(doc) });
  await itemsCol().doc(id).set(doc);
  if (doc.owner && !doc.sheetKey && typeof sheetMarkDirty === 'function') setTimeout(() => sheetMarkDirty(id), 500); // neuer Artikel → Zeile im Blatt der Person
  return id;
}

async function deleteItems(ids) {
  for (const id of ids) {
    const it = itemById(id);
    if (S.assets && it) for (const img of it.images || []) if (img.aid) { try { await S.assets.delete(img.aid); } catch (e) { /* Asset evtl. schon weg */ } }
    pending.delete(id);
    await itemsCol().doc(id).delete();
    S.items = S.items.filter((x) => x.id !== id);
    S.sel.delete(id);
  }
}

let settingsTimer, settingsChain = Promise.resolve(), settingsUnsaved = 0;
function saveSettings(patch) {
  S.settings = RL.mergeSettings(deepMerge(clone(S.settings), patch));
  settingsUnsaved++; // bis zum Speichern: ältere Datenbank-Stände überschreiben die Änderung nicht
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    const data = { settings: clone(S.settings), updatedAt: Date.now() }; const n = settingsUnsaved;
    settingsChain = settingsChain.then(() => profileRef().set(data)).then(() => { setSaved(); if (settingsUnsaved === n) settingsUnsaved = 0; }).catch((e) => toast('Einstellungen nicht gespeichert: ' + dbMsg(e), 'bad'));
  }, 400);
}

/* ---------------- Bilder speichern ---------------- */
function dataURLtoBlob(u) {
  const [h, b] = u.split(','); const mime = (h.match(/:(.*?);/) || [])[1] || 'image/jpeg';
  const bin = atob(b); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
const imgSrc = (img) => (img.aid ? (window.__swReady ? '_blob/' + encodeURIComponent(img.aid) : img.preview || img.thumb || '') : img.data || img.thumb || '');
async function getImageBlob(img) {
  if (S.blobCache.has(img.key)) return S.blobCache.get(img.key);
  let blob;
  if (img.aid) blob = await S.assets.get(img.aid);
  else blob = dataURLtoBlob(img.data || img.thumb);
  S.blobCache.set(img.key, blob);
  return blob;
}
async function storeImage(blob, canvas, kind = 'original') {
  const key = uidGen('m');
  const thumb = IMG.thumb(canvas, 240);
  const base = { key, kind, w: canvas.width, h: canvas.height, thumb, at: Date.now() };
  if (S.assets) {
    try {
      const r = await S.assets.upload(blob, { type: blob.type || 'image/jpeg' });
      S.blobCache.set(key, blob);
      return { ...base, aid: r.id };
    } catch (e) {
      if (e && e.code === 'quota_or_state') toast('Bildspeicher voll – Bild wird verkleinert im Artikel gespeichert.', 'bad');
      else console.warn('Asset-Upload fehlgeschlagen', e);
    }
  }
  const small = IMG.toCanvas(canvas, 720);
  const data = small.toDataURL('image/jpeg', 0.74);
  S.blobCache.set(key, blob);
  return { ...base, data };
}

async function addImagesToItem(id, files, kind = 'original') {
  const it = itemById(id);
  if (!it) return;
  const list = [];
  const imgs = [...files].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|gif)$/i.test(f.name || ''));
  if (!imgs.length) { toast('Keine Bilddateien erkannt.', 'bad'); return; }
  const max = 12 - (it.images || []).length;
  if (max <= 0) { toast('Maximal 12 Bilder pro Artikel.', 'bad'); return; }
  for (const [n, f] of imgs.slice(0, max).entries()) {
    setProgress(`Bild ${n + 1} von ${Math.min(imgs.length, max)} wird verarbeitet…`);
    try {
      const bmp = await IMG.loadBitmap(f);
      const c = IMG.toCanvas(bmp, 2000);
      const blob = await IMG.canvasToBlob(c, 'image/jpeg', 0.9);
      list.push(await storeImage(blob, c, kind));
    } catch (e) { console.error(e); toast(`„${f.name}“ konnte nicht gelesen werden (Format nicht unterstützt?).`, 'bad'); }
  }
  setProgress('');
  if (list.length) await patchItem(id, { images: [...(itemById(id).images || []), ...list] }, { immediate: true });
  return list.length;
}
function setProgress(t) { const el = $('#progress'); if (el) { el.innerHTML = t ? `<span class="spin"></span>${esc(t)}` : ''; el.style.display = t ? 'flex' : 'none'; } }

/* ---------------- abgeleitete Werte ---------------- */
const displayTitle = (it) => it.title || (it.listing && it.listing.Vinted && it.listing.Vinted.title) || [it.brand, it.productType || it.category, it.size && 'Gr. ' + it.size].filter(Boolean).join(' ') || 'Neuer Artikel';
const skuLabel = (it) => esc(it.stockNo || it.sku || "") + (it.owner ? " · 👤 " + esc(it.owner) : "");
const statusChip = (s) => `<span class="chip ${{ Online: 'ok', Reserviert: 'warn', Verkauft: 'info', 'In Bearbeitung': 'accent' }[s] || ''}">${esc(s || '–')}</span>`;
const mainImg = (it) => (it.images || [])[0];
const thumbHTML = (it, cls = 'thumb') => { const m = mainImg(it); return m ? `<img class="${cls}" src="${esc(m.thumb || imgSrc(m))}" alt="">` : `<div class="${cls} ph">–</div>`; };

/* ---------------- Router & Rendering ---------------- */
function parseHash() {
  const h = (location.hash || '').replace(/^#/, '');
  if (h.startsWith('artikel-')) return { view: 'artikel', param: h.slice(8) };
  const v = VIEWS.find((x) => x.id === h);
  return { view: v ? v.id : 'uebersicht', param: null };
}
function go(view, param) {
  const h = view === 'artikel' ? 'artikel-' + param : view;
  if (location.hash.replace('#', '') === h) { S.view = view; S.param = param; render(); }
  else location.hash = h;
  closeSide();
}
window.addEventListener('hashchange', () => { const r = parseHash(); flushAll(); S.view = r.view; S.param = r.param; if (r.view !== 'artikel') S.itemTab = 'fotos'; render(); window.scrollTo(0, 0); });

function buildNav() {
  const counts = {
    inventar: S.items.filter((i) => i.status === 'In Bearbeitung').length,
    assistent: S.itemsLoaded ? RL.dueDrops(S.items, S.settings).length + RL.relistCandidates(S.items, S.settings).length : 0,
    verkaeufe: S.items.filter((i) => i.status === 'Verkauft' && i.shipStatus === 'offen').length + ((S.mail && S.mail.pending.length) || 0),
  };
  const tb = $('#tabbar');
  if (tb) {
    const on = (id) => (S.view === id || (S.view === 'artikel' && id === 'inventar') ? 'on' : '');
    const t = (id, label, ic, badge) => `<button class="${on(id)}" data-nav="${id}">${icon(ic)}<span>${label}</span>${badge ? `<span class="badge">${badge}</span>` : ''}</button>`;
    tb.innerHTML = S.blocker ? '' : t('uebersicht', 'Übersicht', 'overview') + t('inventar', 'Inventar', 'inventory', counts.inventar)
      + `<button class="plus ${on('neu')}" data-nav="neu" aria-label="Neuer Artikel"><span class="circle">${icon('new')}</span></button>`
      + t('verkaeufe', 'Verkäufe', 'sales', counts.verkaeufe) + t('ausgaben', 'Ausgaben', 'expense') + `<button data-act="open-menu">${icon('menu')}<span>Mehr</span>${counts.assistent ? `<span class="badge">${counts.assistent}</span>` : ''}</button>`;
  }
  $('#nav').innerHTML = VIEWS.map((v) => v.sep !== undefined
    ? (v.sep ? `<div class="nav-label">${esc(v.sep)}</div>` : '<div style="height:8px"></div>')
    : `<button data-nav="${v.id}" class="${(S.view === v.id || (S.view === 'artikel' && v.id === 'inventar')) ? 'on' : ''}">${icon(v.icon)}<span>${esc(v.label)}</span>${counts[v.id] ? `<span class="count">${counts[v.id]}</span>` : ''}</button>`).join('');
}

function destroyCharts() { S.charts.forEach((c) => { try { c.destroy(); } catch (e) { /* */ } }); S.charts = []; }

let renderQueued = false;
function render() {
  renderQueued = false;
  buildNav();
  updateStatusLine();
  const main = $('#main');
  if (S.blocker) { main.innerHTML = S.blocker; $('#nav').innerHTML = ''; return; }
  if (!S.itemsLoaded || !S.profileLoaded) {
    main.innerHTML = `<div class="loading-line" style="margin-top:20vh;justify-content:center"><span class="spin"></span>Daten werden geladen…</div>${S.dbError ? `<div class="note warn" style="max-width:520px;margin:16px auto">${esc(S.dbError)}</div>` : ''}`;
    return;
  }
  // Fokus merken
  const ae = document.activeElement;
  const focusId = ae && ae.id && main.contains(ae) ? ae.id : null;
  const selStart = focusId && 'selectionStart' in ae ? ae.selectionStart : null;
  destroyCharts();
  const fn = VIEW_RENDER[S.view] || VIEW_RENDER.uebersicht;
  main.innerHTML = `<div class="view">${fn()}</div>`;
  if (AFTER[S.view]) AFTER[S.view]();
  if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); try { if (selStart !== null) el.setSelectionRange(selStart, selStart); } catch (e) { /* */ } } }
}
function queueRender() { if (renderQueued) return; renderQueued = true; setTimeout(render, 80); }

function updateStatusLine() {
  const el = $('#status-line'); if (!el) return;
  const parts = [];
  if (!S.db) parts.push('<span class="dot bad"></span>Kein Speicher');
  else parts.push(`<span class="dot ${S.dbError ? 'warn' : 'ok'}"></span>Daten lokal im Browser`);
  if (window.GoogleBridge) parts.push(`<br><span class="dot ${GoogleBridge.connected() ? 'ok' : ''}"></span>Google ${GoogleBridge.connected() ? 'verbunden' : 'nicht verbunden'}`);
  parts.push(`<br><span id="save-state" class="tiny"></span>`);
  el.innerHTML = parts.join('');
}

/* ---------------- Sidebar mobil ---------------- */
function closeSide() { $('#side').classList.remove('open'); const s = $('.scrim'); if (s) s.remove(); }
function openSide() {
  $('#side').classList.add('open');
  if ($('.scrim')) return;
  const s = document.createElement('div'); s.className = 'scrim'; s.addEventListener('click', closeSide); document.body.appendChild(s);
}
$('#menu-btn').addEventListener('click', openSide);
document.addEventListener('click', (e) => {
  const n = e.target.closest('[data-nav]'); if (n) { go(n.dataset.nav); return; }
  const t = e.target.closest('[data-theme-set]'); if (t) { saveSettings({ theme: t.dataset.themeSet }); applyTheme(t.dataset.themeSet); }
});

/* ---------------- Start ---------------- */
async function init() {
  applyTheme();
  buildNav();
  if (!window.claude || typeof window.claude.use !== 'function') {
    S.blocker = blockerHTML('Start fehlgeschlagen', 'Die lokale Laufzeit (local-runtime.js) wurde nicht geladen. Lade die Seite neu.');
    render(); return;
  }
  const use = (n) => window.claude.use(n).catch(() => null);
  const [db, user, sample, assets, downloads] = await Promise.all(['db', 'user', 'sample', 'assets', 'downloads'].map(use));
  Object.assign(S, { db, user, sample, assets, downloads });
  if (sample) { try { S.sampleLimits = await sample.limits(); } catch (e) { S.sampleLimits = null; } }
  if (!db || !user) {
    S.blocker = blockerHTML('Browser-Speicher nicht verfügbar', 'Dein Browser erlaubt keinen lokalen Speicher (IndexedDB) – z. B. im privaten Modus. Öffne RELOOP in einem normalen Fenster.');
    render(); return;
  }
  try { S.uid = await user.id(); } catch (e) { S.uid = null; }
  if (!S.uid) { S.blocker = blockerHTML('Kein Speicher', 'Bitte lade die Seite neu.'); render(); return; }
  try { const cw = await user.can('data.write'); S.readOnly = cw === false; } catch (e) { /* unbekannt */ }

  const r = parseHash(); S.view = r.view; S.param = r.param;
  // Optionale App-Anmeldung (Benutzername + Passwort)
  await authGate();
  render();
  S.loadTimer = setTimeout(() => { if (!S.itemsLoaded || !S.profileLoaded) { S.dbError = 'Die Datenbank antwortet noch nicht. Prüfe deine Verbindung – die Seite lädt automatisch weiter, sobald sie erreichbar ist.'; render(); } }, 10000);
  profileRef().onSnapshot((snap) => {
    S.profileLoaded = true; S.profileExists = snap.exists;
    const d = snap.exists ? clone(snap.data()) : null;
    if (!settingsUnsaved) S.settings = RL.mergeSettings(d && d.settings);
    applyTheme();
    if (!snap.metadata.fromCache) { S.dbError = null; }
    if (S.itemsLoaded) clearTimeout(S.loadTimer);
    if (S.view !== 'einstellungen') queueRender();
  }, (e) => { S.dbError = 'Einstellungen konnten nicht geladen werden: ' + dbMsg(e); S.profileLoaded = true; queueRender(); });
  itemsCol().onSnapshot((snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...clone(d.data()) }));
    for (const [id, p] of pending) { const it = items.find((x) => x.id === id); if (it && Object.keys(p.patch).length) deepMerge(it, p.patch); }
    // lokal erstellte, noch nicht bestätigte Artikel behalten
    for (const it of S.items) if (!items.find((x) => x.id === it.id) && Date.now() - (it.createdAt || 0) < 8000) items.push(it);
    items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    S.items = items;
    const first = !S.itemsLoaded;
    S.itemsLoaded = true;
    if (first && typeof mailLoad === 'function') mailLoad();
    if (first && typeof sheetAutoStart === 'function') sheetAutoStart();
    if (!snap.metadata.fromCache) S.dbError = null;
    if (S.profileLoaded) clearTimeout(S.loadTimer);
    if (first || !['artikel', 'studio', 'chat', 'assistent', 'preise', 'einstellungen'].includes(S.view)) queueRender();
    else { buildNav(); refreshItemHeader(); }
  }, (e) => { S.dbError = 'Artikel konnten nicht geladen werden: ' + dbMsg(e); S.itemsLoaded = true; queueRender(); });
  expensesCol().onSnapshot((snap) => {
    S.expenses = snap.docs.map((d) => ({ id: d.id, ...clone(d.data()) })).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (b.createdAt || 0) - (a.createdAt || 0));
    if (['ausgaben', 'uebersicht', 'statistik'].includes(S.view)) queueRender();
  }, (e) => { console.warn('Ausgaben nicht geladen', e); });
}
function blockerHTML(t, p) {
  return `<div class="blocker card"><svg width="56" height="56" viewBox="0 0 34 34"><rect width="34" height="34" rx="10" fill="var(--ink)"/><path d="M11 21.5c-2.2 0-4-1.8-4-4s1.8-4 4-4c3.6 0 8.4 8 12 8 2.2 0 4-1.8 4-4s-1.8-4-4-4c-1.4 0-2.9 1-4.2 2.4" fill="none" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round"/></svg><h2 style="margin-top:14px">${esc(t)}</h2><p class="muted">${esc(p)}</p></div>`;
}
