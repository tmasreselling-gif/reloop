/* RELOOP – Änderungen in die Team-Tabelle zurückschreiben (Status, Name, Lagernummer, EK, VK …).
   Schreibt nur in das Blatt der Person („[M] Mike“ …), nie in Formelspalten, und nie leere Werte über Tabellendaten. */
'use strict';

const SYNC_KEYS = ['status', 'shipStatus', 'title', 'stockNo', 'purchasePrice', 'refund', 'salePrice', 'txId', 'defects', 'gender', 'owner'];
const sheetDirty = new Set();
let sheetSyncTimer = null, sheetSyncing = false;

/** Blatt einer Person: aus dem letzten Import gemerkt, sonst über den Namen gesucht */
function ownerTab(owner) {
  const tabs = S.settings.sheetTabs || {};
  return owner ? tabs[owner] || null : null;
}
const ownerPrefix = (owner) => { const t = ownerTab(owner); const m = t && t.match(/^\s*\[([^\]]+)\]/); return m ? m[1].trim().toUpperCase() : S.settings.stockPrefix; };
const syncable = (it) => it && it.owner && ownerTab(it.owner) && S.settings.sheetWrite !== false && sheetIdFrom(S.settings.sheetsUrl);

/** von patchItem/createItem aufgerufen: Artikel für die Übertragung vormerken */
function sheetMarkDirty(id, patch) {
  if (patch && !Object.keys(patch).some((k) => SYNC_KEYS.includes(k))) return;
  if (!syncable(itemById(id))) return;
  sheetDirty.add(id);
  clearTimeout(sheetSyncTimer);
  sheetSyncTimer = setTimeout(sheetPush, 2500);
}

/** Artikel in das Blatt einer anderen Person umziehen: alte Zeile leeren, danach neue Zeile anlegen */
async function sheetMoveItem(it, newOwner) {
  const oldTab = ownerTab(it.owner); const id = sheetIdFrom(S.settings.sheetsUrl);
  if (oldTab && id && S.settings.sheetWrite !== false) {
    const mcp = await claude.use('mcp'); const q = `'${oldTab.replace(/'/g, "''")}'`;
    const v = mailPayload(await mcp.callTool(SHEETS, 'get_values', { spreadsheetId: id, range: `${q}!A1:L2000` }, { cache: false }));
    const w = RL.sheetRowClear(v.values || findArr(v, 'values') || [], it);
    if (w) await mcp.callTool(SHEETS, 'update_values', { spreadsheetId: id, range: `${q}!${w.range}`, values: w.values }, { cache: false });
  }
  const stockNo = RL.nextStockNo(S.items.filter((x) => x.id !== it.id), ownerPrefix(newOwner));
  await patchItem(it.id, { owner: newOwner, stockNo, sheetKey: null }, { immediate: true }); // → neue Zeile im neuen Blatt
  return stockNo;
}

async function sheetPush() {
  if (sheetSyncing) { clearTimeout(sheetSyncTimer); sheetSyncTimer = setTimeout(sheetPush, 2000); return; }
  if (!sheetDirty.size) return;
  const mcp = await claude.use('mcp').catch(() => null); if (!mcp) return;
  const id = sheetIdFrom(S.settings.sheetsUrl); if (!id) return;
  sheetSyncing = true;
  const ids = [...sheetDirty]; sheetDirty.clear();
  const cache = {}; let written = 0, failed = 0;
  try {
    for (const iid of ids) {
      const it = itemById(iid); if (!syncable(it)) continue;
      const tab = ownerTab(it.owner); const q = `'${tab.replace(/'/g, "''")}'`;
      try {
        if (!cache[tab]) { const v = mailPayload(await mcp.callTool(SHEETS, 'get_values', { spreadsheetId: id, range: `${q}!A1:L2000` }, { cache: false })); cache[tab] = v.values || findArr(v, 'values') || []; }
        const w = RL.sheetRowWrite(cache[tab], it);
        if (!w) continue;
        await mcp.callTool(SHEETS, 'update_values', { spreadsheetId: id, range: `${q}!${w.range}`, values: w.values }, { cache: false });
        // Zwischenstand merken, damit weitere Artikel im selben Durchlauf nicht dieselbe freie Zeile bekommen
        const row = cache[tab][w.row - 1] = (cache[tab][w.row - 1] || []).slice();
        w.values[0].forEach((v, c) => { if (v !== null) row[c] = String(v); });
        if (w.isNew && !it.sheetKey) await patchItem(it.id, { sheetKey: it.stockNo ? 'no:' + String(it.stockNo).toUpperCase() : `row:${tab}:${String(it.title).toLowerCase()}` }, { immediate: true, noSheet: true });
        written++;
      } catch (e) {
        failed++; sheetDirty.add(iid); console.warn('Tabelle schreiben', e);
        if (e && ['server_not_connected', 'needs_reauth', 'not_in_manifest', 'approval_required'].includes(e.code)) { toast(sheetErr(e), 'bad'); break; }
      }
    }
  } finally { sheetSyncing = false; }
  if (written) { S.sheet.lastWrite = Date.now(); toast(`Google-Tabelle aktualisiert (${written} Artikel)`); sheetRefresh(); }
  if (failed && sheetDirty.size) { clearTimeout(sheetSyncTimer); sheetSyncTimer = setTimeout(sheetPush, 60000); }
}
