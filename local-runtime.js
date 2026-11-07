/* RELOOP – lokale Laufzeit: ersetzt das Claude-Konto.
   Datenbank + Fotos liegen in IndexedDB im Browser, Fotos werden über den Service Worker (sw.js) unter _blob/<id> ausgeliefert.
   Stellt window.claude.use('db' | 'user' | 'assets' | 'downloads' | 'mcp') bereit, damit der restliche App-Code unverändert bleibt. */
(function () {
  'use strict';
  const DB_NAME = 'reloop', DB_VER = 1, UID = 'local';

  /* ---------- IndexedDB ---------- */
  function upgrade(db) {
    if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'path' });
    if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
  }
  let dbP = null;
  function openDB() {
    if (!dbP) dbP = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => upgrade(r.result);
      r.onsuccess = () => { const db = r.result; db.onversionchange = () => db.close(); res(db); };
      r.onerror = () => rej(r.error || new Error('Browser-Speicher nicht verfügbar'));
      r.onblocked = () => rej(new Error('Browser-Speicher blockiert – andere RELOOP-Tabs schließen.'));
    });
    return dbP;
  }
  async function tx(store, mode, fn) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode); const s = t.objectStore(store); let out;
      Promise.resolve(fn(s)).then((v) => { out = v; });
      t.oncomplete = () => res(out);
      t.onerror = () => rej(mapErr(t.error));
      t.onabort = () => rej(mapErr(t.error));
    });
  }
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  function mapErr(e) {
    if (e && e.name === 'QuotaExceededError') return { code: 'quota_exceeded', message: 'Browser-Speicher voll.' };
    return e || new Error('Speicherfehler');
  }
  const clone = (o) => (o === undefined ? undefined : (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o))));
  function deepMerge(t, p) {
    for (const [k, v] of Object.entries(p || {})) {
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Blob) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) deepMerge(t[k], v);
      else t[k] = clone(v);
    }
    return t;
  }

  /* ---------- Dokumente: Spiegel im Speicher + IndexedDB ---------- */
  const cache = new Map(); // path → data
  let loaded = null;
  function loadAll() {
    if (!loaded) loaded = tx('docs', 'readonly', (s) => req(s.getAll())).then((rows) => { for (const r of rows) cache.set(r.path, r.data); });
    return loaded;
  }
  const parentOf = (p) => p.slice(0, p.lastIndexOf('/'));
  const docListeners = new Map(), colListeners = new Map();
  let bc = null; try { bc = new BroadcastChannel('reloop-db'); } catch (e) { /* alter Browser */ }
  const dirty = new Set(); let notifyT = null;
  function changed(path, fromOtherTab = false) {
    dirty.add(path);
    if (!fromOtherTab && bc) { try { bc.postMessage({ path }); } catch (e) { /* */ } }
    clearTimeout(notifyT); notifyT = setTimeout(flushNotify, 15);
  }
  function flushNotify() {
    const paths = [...dirty]; dirty.clear();
    const cols = new Set(paths.map(parentOf));
    for (const p of paths) for (const l of docListeners.get(p) || []) l();
    for (const c of cols) for (const l of colListeners.get(c) || []) l();
  }
  if (bc) bc.onmessage = async (ev) => {
    const path = ev.data && ev.data.path; if (!path) return;
    try { const r = await tx('docs', 'readonly', (s) => req(s.get(path))); if (r) cache.set(path, r.data); else cache.delete(path); changed(path, true); } catch (e) { /* */ }
  };
  const meta = { fromCache: false, hasPendingWrites: false };
  const docSnap = (path) => { const d = cache.get(path); return { id: path.split('/').pop(), ref: new DocRef(path), exists: d !== undefined, data: () => clone(d), metadata: meta }; };
  function colSnap(path) {
    const pre = path + '/'; const docs = [];
    for (const [p] of cache) if (p.startsWith(pre) && !p.slice(pre.length).includes('/')) docs.push(docSnap(p));
    return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f), metadata: meta };
  }
  async function write(path, data) {
    await loadAll();
    if (data === undefined) { await tx('docs', 'readwrite', (s) => req(s.delete(path))); cache.delete(path); }
    else { await tx('docs', 'readwrite', (s) => req(s.put({ path, data }))); cache.set(path, data); }
    changed(path);
  }
  function listen(map, key, fire, cb, err) {
    let on = true; const l = () => { if (on) { try { cb(fire()); } catch (e) { console.error(e); } } };
    if (!map.has(key)) map.set(key, new Set()); map.get(key).add(l);
    loadAll().then(l, (e) => { if (err) err(e); });
    return () => { on = false; map.get(key).delete(l); };
  }
  function DocRef(path) { this.path = path; this.id = path.split('/').pop(); }
  DocRef.prototype.collection = function (n) { return new ColRef(this.path + '/' + n); };
  DocRef.prototype.get = async function () { await loadAll(); return docSnap(this.path); };
  DocRef.prototype.set = async function (data, opts) {
    await loadAll();
    const next = opts && opts.merge ? deepMerge(clone(cache.get(this.path)) || {}, data) : clone(data);
    await write(this.path, next);
  };
  DocRef.prototype.update = async function (patch) {
    await loadAll();
    const cur = cache.get(this.path);
    if (cur === undefined) throw { code: 'not_found', message: 'Eintrag nicht gefunden.' };
    await write(this.path, deepMerge(clone(cur), patch));
  };
  DocRef.prototype.delete = async function () { await write(this.path, undefined); };
  DocRef.prototype.onSnapshot = function (cb, err) { const p = this.path; return listen(docListeners, p, () => docSnap(p), cb, err); };
  function ColRef(path) { this.path = path; this.id = path.split('/').pop(); }
  const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  ColRef.prototype.doc = function (id) { return new DocRef(this.path + '/' + (id || genId())); };
  ColRef.prototype.add = async function (data) { const r = this.doc(); await r.set(data); return r; };
  ColRef.prototype.get = async function () { await loadAll(); return colSnap(this.path); };
  ColRef.prototype.onSnapshot = function (cb, err) { const p = this.path; return listen(colListeners, p, () => colSnap(p), cb, err); };

  const db = { doc: (p) => new DocRef(p), collection: (p) => new ColRef(p) };

  /* ---------- Fotos & Dateien ---------- */
  const assets = {
    async upload(blob, opts = {}) {
      const id = 'a' + genId();
      const b = opts.type && blob.type !== opts.type ? new Blob([blob], { type: opts.type }) : blob;
      await tx('blobs', 'readwrite', (s) => req(s.put(b, id)));
      return { id };
    },
    async get(id) { const b = await tx('blobs', 'readonly', (s) => req(s.get(id))); if (!b) throw new Error('Datei nicht gefunden'); return b; },
    async put(id, blob) { await tx('blobs', 'readwrite', (s) => req(s.put(blob, id))); },
    async delete(id) { await tx('blobs', 'readwrite', (s) => req(s.delete(id))); },
  };

  /* ---------- Downloads ---------- */
  const downloads = {
    async save({ filename, data }) {
      let blob = data;
      if (!(data instanceof Blob)) {
        const type = /\.json$/i.test(filename) ? 'application/json' : /\.csv$/i.test(filename) ? 'text/csv' : 'text/plain';
        blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data)], { type: type + ';charset=utf-8' });
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename || 'download'; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    },
  };

  const user = { id: async () => UID, can: async () => true };

  /* ---------- Service Worker für _blob/<id> ---------- */
  window.__swReady = false;
  async function startSW() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return false;
    try {
      await navigator.serviceWorker.register('sw.js');
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((res) => { navigator.serviceWorker.addEventListener('controllerchange', res, { once: true }); setTimeout(res, 3000); });
      }
      return !!navigator.serviceWorker.controller;
    } catch (e) { console.warn('Service Worker nicht verfügbar', e); return false; }
  }

  /* ---------- Speicher dauerhaft machen (Browser löscht sonst evtl. bei Platzmangel) ---------- */
  async function persist() { try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* */ } return false; }

  const ready = (async () => {
    const [sw] = await Promise.all([startSW(), loadAll().catch((e) => { console.error(e); })]);
    window.__swReady = sw;
    persist();
  })();

  window.RLLocal = { db, assets, downloads, user, ready, openDB, cache, loadAll, write, persist };
  window.claude = {
    local: true,
    async use(name) {
      await ready;
      if (name === 'db') return db;
      if (name === 'user') return user;
      if (name === 'assets') return assets;
      if (name === 'downloads') return downloads;
      if (name === 'mcp') { if (window.GoogleBridge) return window.GoogleBridge; throw { code: 'unavailable' }; }
      throw { code: 'unavailable', message: name + ' ist in der eigenständigen Version nicht verfügbar.' };
    },
  };
})();
