/* RELOOP – Bildstudio (lokale Verarbeitung) */
'use strict';

const ST_DEFAULTS = { bg: '#FFFFFF', shadow: true, aspect: '4:5', padding: 8, frame: 0, zoom: 100, panX: 0, panY: 0, threshold: 0.5, softness: 0.25, tol: 30, auto: false, brightness: 0, contrast: 0, warmth: 0, saturation: 0, smooth: 0, sharpen: 10 };
const BG_SWATCHES = [['transparent', 'Transparent'], ['#FFFFFF', 'Weiß'], ['#F1F1F1', 'Hellgrau'], ['#EEE7DB', 'Creme'], ['#DDE3EA', 'Kühlgrau'], ['studio', 'Studio-Verlauf'], ['#1A1A1A', 'Schwarz']];

function newStudio(ctx) { return { ctx, src: null, srcLabel: '', mask: null, maskMode: 'none', maskVer: 0, adj: null, adjKey: '', out: null, p: { ...ST_DEFAULTS }, busy: '', err: '', t: null, targetId: ctx !== 'free' ? ctx : '' }; }
function studioState(itemId) { const ctx = itemId || 'free'; if (!S.studio || S.studio.ctx !== ctx) S.studio = newStudio(ctx); return S.studio; }

VIEW_RENDER.studio = () => pageHead('Bildstudio', 'Kleidung freistellen, Hintergrund tauschen, Licht und Farben korrigieren – alles läuft lokal in deinem Browser, deine Fotos verlassen dabei nicht das Gerät.') + renderStudio(null);
AFTER.studio = () => afterStudio(null);

function renderStudio(itemId) {
  const st = studioState(itemId);
  const it = itemId ? itemById(itemId) : null;
  let picker;
  if (it) {
    const imgs = it.images || [];
    picker = imgs.length ? `<div class="row" style="gap:8px;margin-bottom:12px">${imgs.map((m, i) => `<button class="link" data-act="st-src" data-i="${i}" title="Dieses Bild bearbeiten" style="outline:${st.srcLabel === m.key ? '2px solid var(--accent)' : 'none'};border-radius:10px"><img class="thumb" src="${esc(m.thumb || imgSrc(m))}" alt=""></button>`).join('')}</div>` : '<div class="note" style="margin-bottom:12px">Dieser Artikel hat noch keine Fotos. Lade sie im Tab „Fotos“ hoch.</div>';
  } else {
    const withImgs = S.items.filter((i) => (i.images || []).length);
    picker = `<div class="row" style="margin-bottom:12px"><button class="btn primary" data-act="st-upload">${icon('upload')}Foto öffnen</button><input type="file" id="st-file" accept="image/*" hidden>
      ${withImgs.length ? `<span class="muted small">oder aus Artikel:</span>${sel('st-item', [['', '– Artikel wählen –'], ...withImgs.map((i) => [i.id, displayTitle(i) + ' · ' + i.sku])], '', 'id="st-item" style="max-width:320px"')}` : ''}</div>
      <div id="st-item-imgs"></div>`;
  }
  return `${picker}<div class="studio">
    <div><div class="canvas-wrap" id="st-wrap"><canvas id="st-canvas" width="10" height="10"></canvas>
      <div class="ov" id="st-ov" style="${st.src && !st.busy ? 'display:none' : ''}">${st.busy ? `<div class="loading-line"><span class="spin"></span>${esc(st.busy)}</div>` : '<div class="muted">Wähle ein Foto, um zu starten.</div>'}</div></div>
      <div class="row between" style="margin-top:10px"><button class="btn sm" id="st-before" ${st.src ? '' : 'disabled'}>Vorher (gedrückt halten)</button><span class="tiny muted mono" id="st-info"></span></div>
      ${st.err ? `<div class="note warn small" style="margin-top:10px">${esc(st.err)}</div>` : ''}
    </div>
    <div class="card ctrl" id="st-ctrl">${studioControlsHTML(st, it)}</div>
  </div>
  <div class="card" style="margin-top:16px"><h3>KI-Fitpics (Kleidung am Model)</h3><p class="small muted" style="margin:0">Nicht in dieser Version enthalten: Echte Fitpics brauchen einen Bildgenerierungs-Dienst mit eigenem API-Schlüssel, und generierte Models können Details wie Logos oder Nähte verfälschen. Das Studio liefert stattdessen saubere, unveränderte Produktfotos.</p></div>`;
}

function studioControlsHTML(st, it) {
  const p = st.p; const on = (c) => (c ? 'on' : '');
  const slider = (k, l, min, max, step = 1) => `<div class="sl"><span>${l}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${p[k]}" data-st="${k}"><output id="o-${k}">${p[k]}</output></div>`;
  const dis = st.src ? '' : 'disabled';
  const targets = S.items.filter((i) => i.status !== 'Verkauft');
  return `<h4>1 · Freistellen</h4>
    <div class="seg" style="width:100%"><button class="${on(st.maskMode === 'none')}" data-act="st-mask" data-m="none" ${dis}>Aus</button><button class="${on(st.maskMode === 'ai')}" data-act="st-mask" data-m="ai" ${dis}>KI (lokal)</button><button class="${on(st.maskMode === 'flood')}" data-act="st-mask" data-m="flood" ${dis} title="Für einfarbigen Hintergrund">Einfarbig</button></div>
    <p class="tiny muted" style="margin:6px 0 0">${st.maskMode === 'ai' ? 'Segmentierungsmodell U²-Net läuft direkt im Browser.' : st.maskMode === 'flood' ? 'Für Fotos vor glatter, einfarbiger Wand oder Laken.' : 'KI-Freistellung lädt beim ersten Mal ca. 17 MB.'}</p>
    ${st.maskMode === 'flood' ? slider('tol', 'Toleranz', 5, 90) : ''}
    ${st.mask ? slider('threshold', 'Kante', 0.1, 0.9, 0.05) + slider('softness', 'Weichheit', 0.05, 0.6, 0.05) : ''}
    <h4>2 · Hintergrund, Format & Zuschnitt</h4>
    <div class="swatches">${BG_SWATCHES.map(([v, l]) => `<button class="sw ${p.bg === v ? 'on' : ''}" title="${l}" data-act="st-bg" data-v="${v}" style="background:${v === 'transparent' ? 'repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/10px 10px' : v === 'studio' ? 'radial-gradient(#fff,#ddd)' : v}"></button>`).join('')}
      <input type="color" class="sw" value="${/^#/.test(p.bg) ? p.bg : '#ffffff'}" data-st="bgc" title="Eigene Farbe" style="padding:0"></div>
    ${!st.mask ? '<p class="tiny muted" style="margin:6px 0 0">Ohne Freistellen füllt die Hintergrundfarbe den Rand; der Schatten wirkt erst nach dem Freistellen.</p>' : ''}
    <label class="check" style="margin-top:10px"><input type="checkbox" data-st="shadow" ${p.shadow ? 'checked' : ''}> Weicher Schatten</label>
    <div class="seg" style="margin-top:10px">${[['orig', 'Original'], ['1:1', '1:1'], ['4:5', '4:5'], ['3:4', '3:4']].map(([v, l]) => `<button class="${on(p.aspect === v)}" data-act="st-aspect" data-v="${v}">${l}</button>`).join('')}</div>
    ${st.mask ? slider('padding', 'Rand %', 0, 30) : slider('frame', 'Rand %', 0, 30)}
    ${slider('zoom', 'Zoom %', 100, 300, 5)}${slider('panX', 'Position ↔', -100, 100)}${slider('panY', 'Position ↕', -100, 100)}
    <p class="tiny muted" style="margin:4px 0 0">Zuschneiden: Zoom vergrößert den Ausschnitt, die Position verschiebt ihn. Du kannst den Ausschnitt auch direkt im Bild mit der Maus/dem Finger verschieben und mit dem Mausrad zoomen.</p>
    <button class="btn sm ghost" data-act="st-crop-reset" ${dis} style="margin-top:6px">Zuschnitt zurücksetzen</button>
    <h4>3 · Optimieren</h4>
    <label class="check"><input type="checkbox" data-st="auto" ${p.auto ? 'checked' : ''}> Auto-Belichtung</label>
    ${slider('brightness', 'Helligkeit', -50, 50)}${slider('contrast', 'Kontrast', -40, 40)}${slider('warmth', 'Wärme', -30, 30)}${slider('saturation', 'Sättigung', -50, 50)}
    ${slider('smooth', 'Glätten', 0, 100)}${slider('sharpen', 'Schärfe', 0, 100)}
    <p class="tiny muted" style="margin:4px 0 0">„Glätten“ mildert feine Knitter und Rauschen, ohne Logos, Nähte oder Muster zu verändern.</p>
    <button class="btn sm ghost" data-act="st-reset" ${dis} style="margin-top:6px">Regler zurücksetzen</button>
    <h4>4 · Exportieren</h4>
    <div class="stack">
      <button class="btn" data-act="st-download" ${dis}>${icon('download')}Herunterladen (${p.bg === 'transparent' ? 'PNG' : 'JPG'})</button>
      ${st.ctx === 'free' ? `<label class="f"><span>Speichern in Artikel</span>${sel('st-target', [['', '– Artikel wählen –'], ...targets.map((i) => [i.id, displayTitle(i) + ' · ' + i.sku])], st.targetId, 'id="st-target"')}</label>` : ''}
      <button class="btn primary" data-act="st-save" ${dis}>${icon('check')}Zum Artikel hinzufügen</button>
    </div>`;
}
function refreshStudioControls() { const st = S.studio; const box = $('#st-ctrl'); if (box && st) box.innerHTML = studioControlsHTML(st, st.ctx !== 'free' ? itemById(st.ctx) : null); }
function setStudioOverlay() {
  const st = S.studio; const ov = $('#st-ov'); if (!ov) return;
  if (st.busy) { ov.style.display = ''; ov.innerHTML = `<div class="loading-line"><span class="spin"></span>${esc(st.busy)}</div>`; }
  else if (!st.src) { ov.style.display = ''; ov.innerHTML = '<div class="muted">Wähle ein Foto, um zu starten.</div>'; }
  else ov.style.display = 'none';
  const b = $('#st-before'); if (b) b.disabled = !st.src;
}

function stSetP(k, v) {
  const st = S.studio; st.p[k] = v;
  const r = $(`#st-ctrl input[data-st="${k}"]`); if (r) r.value = v;
  const o = $('#o-' + k); if (o) o.textContent = v;
}
ACT['st-crop-reset'] = () => { ['zoom', 'panX', 'panY'].forEach((k) => stSetP(k, ST_DEFAULTS[k])); stSetP(S.studio.mask ? 'padding' : 'frame', S.studio.mask ? ST_DEFAULTS.padding : 0); stSchedule(); };
/** Ausschnitt im Bild verschieben (Ziehen) und zoomen (Mausrad / zwei Finger) */
function bindStudioCrop(st) {
  const cv = $('#st-canvas'); if (!cv) return;
  cv.style.touchAction = 'none'; cv.style.cursor = 'grab';
  let drag = null;
  cv.addEventListener('pointerdown', (e) => { if (!st.out) return; drag = { x: e.clientX, y: e.clientY, px: +st.p.panX || 0, py: +st.p.panY || 0 }; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; });
  cv.addEventListener('pointermove', (e) => {
    if (!drag || !st.out || !st.out._crop) return;
    const c = st.out._crop; const scale = (st.out.width / cv.getBoundingClientRect().width) * c.perPx; // Bildschirm-px → Quell-px
    const mv = (d, range, start) => range > 1 ? Math.max(-100, Math.min(100, Math.round(start - (d * scale) / (range / 2) * 100))) : start;
    stSetP('panX', mv(e.clientX - drag.x, c.rangeX, drag.px)); stSetP('panY', mv(e.clientY - drag.y, c.rangeY, drag.py)); stSchedule();
  });
  const end = () => { drag = null; cv.style.cursor = 'grab'; };
  ['pointerup', 'pointercancel'].forEach((ev) => cv.addEventListener(ev, end));
  cv.addEventListener('wheel', (e) => {
    if (!st.out) return; e.preventDefault();
    stSetP('zoom', Math.max(100, Math.min(300, Math.round(((+st.p.zoom || 100) - e.deltaY * 0.2) / 5) * 5))); stSchedule();
  }, { passive: false });
}

function afterStudio(itemId) {
  const st = studioState(itemId);
  bindStudioCrop(st);
  const before = $('#st-before');
  if (before) {
    const show = () => { if (st.src) stDraw(st.src); };
    const hide = () => { if (st.out) stDraw(st.out); };
    before.addEventListener('pointerdown', show); ['pointerup', 'pointerleave', 'pointercancel'].forEach((e) => before.addEventListener(e, hide));
  }
  const f = $('#st-file');
  if (f) f.addEventListener('change', async () => { if (f.files[0]) { await stLoadBlob(f.files[0], 'upload-' + Date.now()); } });
  const pickItem = $('#st-item');
  if (pickItem) pickItem.addEventListener('change', () => {
    const it = itemById(pickItem.value); const box = $('#st-item-imgs');
    if (!it) { box.innerHTML = ''; return; }
    st.targetId = it.id;
    box.innerHTML = `<div class="row" style="gap:8px;margin-bottom:12px">${(it.images || []).map((m, i) => `<button class="link" data-act="st-src-free" data-id="${it.id}" data-i="${i}" style="border-radius:10px"><img class="thumb" src="${esc(m.thumb || imgSrc(m))}" alt=""></button>`).join('')}</div>`;
    refreshStudioControls();
  });
  const wrap = $('#st-wrap');
  if (wrap && !itemId) {
    wrap.addEventListener('dragover', (e) => e.preventDefault());
    wrap.addEventListener('drop', (e) => { e.preventDefault(); const file = e.dataTransfer.files && e.dataTransfer.files[0]; if (file) stLoadBlob(file, 'upload-' + Date.now()); });
  }
  if (st.out) { stDraw(st.out); }
  else if (st.src) stSchedule();
  else if (itemId) { const it = itemById(itemId); const m = it && (it.images || []).find((x) => x.kind !== 'studio') || (it && (it.images || [])[0]); if (m) stLoadImage(m); }
}

async function stLoadImage(m) {
  try { const b = await getImageBlob(m); await stLoadBlob(b, m.key); }
  catch (e) { const st = S.studio; st.err = 'Bild konnte nicht geladen werden: ' + e.message; render(); }
}
async function stLoadBlob(blob, label) {
  const st = S.studio;
  st.busy = 'Bild wird geladen…'; st.err = ''; setStudioOverlay();
  try {
    const bmp = await IMG.loadBitmap(blob);
    st.src = IMG.toCanvas(bmp, 1600); st.srcLabel = label;
    st.mask = null; st.maskMode = 'none'; st.maskVer++; st.adjKey = ''; st.out = null;
  } catch (e) { st.err = 'Format nicht unterstützt. Bitte JPG, PNG oder WebP verwenden.'; }
  st.busy = '';
  if (S.view === 'artikel') { const box = $('#tab-body'); if (box) { render(); return; } }
  setStudioOverlay(); refreshStudioControls(); stSchedule();
}
function stSchedule() { const st = S.studio; clearTimeout(st.t); st.t = setTimeout(stProcess, 50); }
function stProcess() {
  const st = S.studio; if (!st || !st.src) return;
  const p = st.p;
  const ap = { auto: p.auto, brightness: +p.brightness, contrast: +p.contrast, warmth: +p.warmth, saturation: +p.saturation, smooth: +p.smooth, sharpen: +p.sharpen };
  const key = JSON.stringify(ap) + '|' + st.maskVer;
  try {
    if (key !== st.adjKey) { st.adj = IMG.adjust(st.src, ap, st.mask); st.adjKey = key; }
    st.out = IMG.compose(st.adj, st.mask, { ...p, threshold: +p.threshold, softness: +p.softness, padding: +p.padding });
    stDraw(st.out);
  } catch (e) { console.error(e); st.err = 'Bildverarbeitung fehlgeschlagen: ' + e.message; }
}
function stDraw(c) {
  const cv = $('#st-canvas'); if (!cv) return;
  cv.width = c.width; cv.height = c.height;
  cv.getContext('2d').drawImage(c, 0, 0);
  const info = $('#st-info'); if (info) info.textContent = `${c.width} × ${c.height} px`;
}

ACT['st-src'] = (el) => { const it = itemById(S.param); const m = it.images[+el.dataset.i]; if (m) stLoadImage(m); };
ACT['st-src-free'] = (el) => { const it = itemById(el.dataset.id); const m = it && it.images[+el.dataset.i]; if (m) { S.studio.targetId = it.id; stLoadImage(m); } };
ACT['st-upload'] = () => $('#st-file').click();
ACT['st-mask'] = async (el) => {
  const st = S.studio; const mode = el.dataset.m; if (!st.src || st.busy) return;
  st.err = '';
  if (mode === 'none') { st.mask = null; st.maskMode = 'none'; }
  else if (mode === 'flood') {
    st.mask = IMG.featherMask(IMG.segmentFlood(st.src, +st.p.tol), st.src.width, st.src.height, 1); st.maskMode = 'flood';
  } else {
    st.busy = 'KI-Freistellung läuft lokal… (erstes Mal: Modell wird geladen)'; setStudioOverlay();
    try {
      const t0 = performance.now();
      const m = await IMG.segmentAI(st.src);
      st.mask = IMG.featherMask(m, st.src.width, st.src.height, 1); st.maskMode = 'ai';
      console.info('Segmentierung', Math.round(performance.now() - t0), 'ms');
    } catch (e) {
      console.error(e);
      st.err = 'Die KI-Freistellung konnte in diesem Browser nicht gestartet werden (' + (e && e.message ? e.message : e) + '). Nutze „Einfarbiger Hintergrund“.';
      st.mask = null; st.maskMode = 'none';
    }
    st.busy = '';
  }
  st.maskVer++;
  if (st.err && S.view === 'artikel') { render(); return; }
  if (st.err) { render(); return; }
  setStudioOverlay(); refreshStudioControls(); stSchedule();
};
ACT['st-bg'] = (el) => { S.studio.p.bg = el.dataset.v; refreshStudioControls(); stSchedule(); };
ACT['st-aspect'] = (el) => { S.studio.p.aspect = el.dataset.v; refreshStudioControls(); stSchedule(); };
ACT['st-reset'] = () => { const st = S.studio; const keep = { bg: st.p.bg, aspect: st.p.aspect, shadow: st.p.shadow, padding: st.p.padding, tol: st.p.tol, threshold: st.p.threshold, softness: st.p.softness }; st.p = { ...ST_DEFAULTS, ...keep }; refreshStudioControls(); stSchedule(); };
let floodT;
ON_INPUT.studio = (el) => {
  const st = S.studio; if (!st) return; const k = el.dataset.st;
  if (k === 'bgc') { st.p.bg = el.value; $$('.sw[data-act="st-bg"]').forEach((b) => b.classList.remove('on')); stSchedule(); return; }
  if (el.type === 'checkbox') st.p[k] = el.checked;
  else st.p[k] = parseFloat(el.value);
  const o = $('#o-' + k); if (o) o.textContent = el.value;
  if (k === 'tol' && st.maskMode === 'flood') {
    clearTimeout(floodT);
    floodT = setTimeout(() => { st.mask = IMG.featherMask(IMG.segmentFlood(st.src, +st.p.tol), st.src.width, st.src.height, 1); st.maskVer++; stSchedule(); }, 120);
    return;
  }
  stSchedule();
};
async function stOutputBlob() {
  const st = S.studio; if (!st.out) stProcess();
  const png = st.p.bg === 'transparent';
  return { blob: await IMG.canvasToBlob(st.out, png ? 'image/png' : 'image/jpeg', 0.92), ext: png ? 'png' : 'jpg' };
}
ACT['st-download'] = async () => {
  const st = S.studio; if (!st.src) return;
  const { blob, ext } = await stOutputBlob();
  const it = itemById(st.ctx !== 'free' ? st.ctx : st.targetId);
  await saveFile(`${it ? it.sku : 'reloop'}-studio-${Date.now().toString(36)}.${ext}`, blob);
};
ACT['st-save'] = async (el) => {
  const st = S.studio; if (!st.src) return;
  const tSel = $('#st-target'); if (tSel) st.targetId = tSel.value;
  const id = st.ctx !== 'free' ? st.ctx : st.targetId;
  const it = itemById(id);
  if (!it) { toast('Bitte zuerst einen Artikel wählen.', 'bad'); return; }
  if ((it.images || []).length >= 12) { toast('Der Artikel hat bereits 12 Bilder. Lösche zuerst eins.', 'bad'); return; }
  el.disabled = true;
  try {
    const { blob } = await stOutputBlob();
    const img = await storeImage(blob, st.out, 'studio');
    const cur = itemById(id);
    await patchItem(id, { images: [...(cur.images || []), img] }, { immediate: true });
    toast('Bild zum Artikel hinzugefügt.');
    if (S.view === 'artikel') render();
  } catch (e) { toast('Speichern fehlgeschlagen: ' + (e.message || e.code), 'bad'); }
  finally { el.disabled = false; }
};
