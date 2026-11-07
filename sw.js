/* RELOOP – Service Worker: liefert gespeicherte Fotos/Belege aus dem Browser-Speicher unter _blob/<id> aus. */
'use strict';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('reloop', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'path' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function getBlob(id) {
  const db = await openDB();
  try {
    return await new Promise((res, rej) => {
      const q = db.transaction('blobs', 'readonly').objectStore('blobs').get(id);
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
  } finally { db.close(); }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  const i = url.pathname.indexOf('/_blob/');
  if (i < 0) return;
  const id = decodeURIComponent(url.pathname.slice(i + 7));
  e.respondWith(getBlob(id).then((b) => (b
    ? new Response(b, { headers: { 'Content-Type': b.type || 'application/octet-stream', 'Cache-Control': 'private, max-age=31536000, immutable' } })
    : new Response('nicht gefunden', { status: 404 }))).catch(() => new Response('Fehler', { status: 500 })));
});
