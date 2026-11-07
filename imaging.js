/* RELOOP – lokale Bildverarbeitung (läuft vollständig im Browser, keine Bild-KI-API nötig) */
(function () {
  'use strict';
  const IMG = {};

  IMG.loadBitmap = async function (blob) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (e) { /* Fallback */ }
    }
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
  };

  const dims = (src) => ({ w: src.naturalWidth || src.width, h: src.naturalHeight || src.height });

  IMG.toCanvas = function (src, maxSide) {
    const { w, h } = dims(src);
    const k = maxSide ? Math.min(1, maxSide / Math.max(w, h)) : 1;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c;
  };

  IMG.canvasToBlob = function (canvas, type = 'image/jpeg', q = 0.9) {
    return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Bild konnte nicht erzeugt werden'))), type, q));
  };

  IMG.thumb = function (src, size = 220) {
    const c = IMG.toCanvas(src, size);
    // weißer Untergrund für transparente PNGs
    const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
    const ctx = o.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, o.width, o.height); ctx.drawImage(c, 0, 0);
    return o.toDataURL('image/jpeg', 0.72);
  };

  /* ---------- Freistellen: KI-Segmentierung lokal (U²-Netp, ONNX im Browser) ---------- */
  let ortP = null, sessP = null;
  function loadORT() {
    if (window.ort) return Promise.resolve(window.ort);
    if (!ortP) {
      ortP = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'ort/ort.wasm.min.js';
        s.onload = () => (window.ort ? res(window.ort) : rej(new Error('ONNX-Runtime nicht verfügbar')));
        s.onerror = () => { ortP = null; rej(new Error('ONNX-Runtime konnte nicht geladen werden')); };
        document.head.appendChild(s);
      });
    }
    return ortP;
  }
  async function session() {
    const ort = await loadORT();
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = new URL('ort/', location.href).href;
    if (!sessP) {
      sessP = (async () => {
        const r = await fetch(new URL('models/u2netp.json', location.href).href);
        if (!r.ok) throw new Error('Modell konnte nicht geladen werden (' + r.status + ')');
        const j = await r.json();
        const bin = atob(j.data); const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      })().catch((e) => { sessP = null; throw e; });
    }
    return { ort, sess: await sessP };
  }
  IMG.warmup = () => session().then(() => true);

  /** Maske (Float32, 0..1) in Größe w×h aus einem 320er-Ergebnis hochskalieren */
  function upscaleMask(small, sw, sh, w, h) {
    const c = document.createElement('canvas'); c.width = sw; c.height = sh;
    const ctx = c.getContext('2d');
    const id = ctx.createImageData(sw, sh);
    for (let i = 0; i < sw * sh; i++) { const v = Math.max(0, Math.min(255, Math.round(small[i] * 255))); id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
    ctx.putImageData(id, 0, 0);
    const big = document.createElement('canvas'); big.width = w; big.height = h;
    const bctx = big.getContext('2d', { willReadFrequently: true });
    bctx.imageSmoothingEnabled = true; bctx.imageSmoothingQuality = 'high';
    bctx.drawImage(c, 0, 0, w, h);
    const d = bctx.getImageData(0, 0, w, h).data;
    const out = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = d[i * 4] / 255;
    return out;
  }

  IMG.segmentAI = async function (canvas) {
    const { ort, sess } = await session();
    const S = 320;
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, S, S);
    const d = ctx.getImageData(0, 0, S, S).data;
    let max = 1e-6;
    for (let i = 0; i < S * S; i++) { const a = d[i * 4], b = d[i * 4 + 1], g = d[i * 4 + 2]; if (a > max) max = a; if (b > max) max = b; if (g > max) max = g; }
    const f = new Float32Array(3 * S * S);
    for (let i = 0; i < S * S; i++) {
      f[i] = (d[i * 4] / max - 0.485) / 0.229;
      f[S * S + i] = (d[i * 4 + 1] / max - 0.456) / 0.224;
      f[2 * S * S + i] = (d[i * 4 + 2] / max - 0.406) / 0.225;
    }
    const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', f, [1, 3, S, S]) });
    const pred = out[sess.outputNames[0]].data;
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < pred.length; i++) { if (pred[i] < mn) mn = pred[i]; if (pred[i] > mx) mx = pred[i]; }
    const norm = new Float32Array(S * S);
    const rng = mx - mn || 1;
    for (let i = 0; i < S * S; i++) norm[i] = (pred[i] - mn) / rng;
    return upscaleMask(norm, S, S, canvas.width, canvas.height);
  };

  /* ---------- Freistellen: einfarbiger Hintergrund (Flood-Fill vom Rand) ---------- */
  IMG.segmentFlood = function (canvas, tol = 30) {
    const k = Math.min(1, 640 / Math.max(canvas.width, canvas.height));
    const w = Math.max(1, Math.round(canvas.width * k)), h = Math.max(1, Math.round(canvas.height * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    // Referenzfarbe = Median der Randpixel
    const rs = [], gs = [], bs = [];
    const push = (x, y) => { const i = (y * w + x) * 4; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); };
    for (let x = 0; x < w; x += 2) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y += 2) { push(0, y); push(w - 1, y); }
    const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
    const R = med(rs), G = med(gs), B = med(bs);
    const t2 = tol * tol * 3;
    const isBg = (p) => { const i = p * 4; const dr = d[i] - R, dg = d[i + 1] - G, db = d[i + 2] - B; return dr * dr + dg * dg + db * db <= t2; };
    const bg = new Uint8Array(w * h);
    const q = new Int32Array(w * h); let qh = 0, qt = 0;
    const seed = (p) => { if (!bg[p] && isBg(p)) { bg[p] = 1; q[qt++] = p; } };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (qh < qt) {
      const p = q[qh++]; const x = p % w, y = (p / w) | 0;
      if (x > 0) seed(p - 1); if (x < w - 1) seed(p + 1); if (y > 0) seed(p - w); if (y < h - 1) seed(p + w);
    }
    const small = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) small[i] = bg[i] ? 0 : 1;
    return upscaleMask(small, w, h, canvas.width, canvas.height);
  };

  /** Maske weichzeichnen (Box-Blur, separiert) */
  IMG.featherMask = function (m, w, h, r = 1) {
    if (r <= 0) return m;
    const tmp = new Float32Array(m.length), out = new Float32Array(m.length);
    const n = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      let acc = 0; const row = y * w;
      for (let x = -r; x <= r; x++) acc += m[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = acc / n;
        acc += m[row + Math.min(w - 1, x + r + 1)] - m[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc / n;
        acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  };

  function boxBlurRGB(src, w, h, r) {
    const n = 2 * r + 1;
    const tmp = new Float32Array(w * h * 3), out = new Float32Array(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let x = -r; x <= r; x++) acc += src[((y * w) + Math.min(w - 1, Math.max(0, x))) * 4 + c];
        for (let x = 0; x < w; x++) {
          tmp[(y * w + x) * 3 + c] = acc / n;
          acc += src[(y * w + Math.min(w - 1, x + r + 1)) * 4 + c] - src[(y * w + Math.max(0, x - r)) * 4 + c];
        }
      }
    }
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += tmp[(Math.min(h - 1, Math.max(0, y)) * w + x) * 3 + c];
        for (let y = 0; y < h; y++) {
          out[(y * w + x) * 3 + c] = acc / n;
          acc += tmp[(Math.min(h - 1, y + r + 1) * w + x) * 3 + c] - tmp[(Math.max(0, y - r) * w + x) * 3 + c];
        }
      }
    }
    return out;
  }

  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

  /**
   * Farb-/Tonkorrektur. p: {auto, brightness, contrast, warmth, saturation, smooth, sharpen} (−100..100 bzw. 0..100)
   * mask (optional): Korrektur-Statistik nur auf dem Kleidungsstück.
   */
  IMG.adjust = function (canvas, p, mask) {
    const w = canvas.width, h = canvas.height;
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const ictx = canvas.getContext('2d', { willReadFrequently: true });
    const src = ictx.getImageData(0, 0, w, h);
    const d = src.data;
    const N = w * h;
    // 1) Glätten (kantenerhaltend): nur kleine Unterschiede werden geglättet → feine Knitter/Rauschen werden weicher
    if (p.smooth > 0) {
      const bl = boxBlurRGB(d, w, h, 2);
      const k = p.smooth / 100;
      for (let i = 0; i < N; i++) {
        for (let c = 0; c < 3; c++) {
          const v = d[i * 4 + c], b = bl[i * 3 + c], diff = Math.abs(b - v);
          const wgt = k * Math.exp(-diff / 18);
          d[i * 4 + c] = v + (b - v) * wgt;
        }
      }
    }
    // 2) Auto-Belichtung (Tonwertspreizung auf Basis der Helligkeit, farbneutral)
    let lo = 0, gain = 1;
    if (p.auto) {
      const hist = new Uint32Array(256); let cnt = 0;
      for (let i = 0; i < N; i += 2) {
        if (mask && mask[i] < 0.5) continue;
        const l = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) | 0;
        hist[l]++; cnt++;
      }
      if (cnt > 50) {
        let acc = 0, a = 0, b = 255;
        for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= cnt * 0.005) { a = i; break; } }
        acc = 0;
        for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= cnt * 0.005) { b = i; break; } }
        if (b - a > 20) { lo = Math.min(a, 40); gain = Math.min(1.7, 255 / (Math.max(b, 160) - lo)); }
      }
    }
    const br = 1 + (p.brightness || 0) / 100;
    const ct = 1 + (p.contrast || 0) / 100;
    const wm = (p.warmth || 0) * 0.6;
    const st = 1 + (p.saturation || 0) / 100;
    for (let i = 0; i < N; i++) {
      let r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      if (gain !== 1 || lo) { r = (r - lo) * gain; g = (g - lo) * gain; b = (b - lo) * gain; }
      r *= br; g *= br; b *= br;
      r = (r - 128) * ct + 128; g = (g - 128) * ct + 128; b = (b - 128) * ct + 128;
      r += wm; b -= wm;
      if (st !== 1) { const l = 0.2126 * r + 0.7152 * g + 0.0722 * b; r = l + (r - l) * st; g = l + (g - l) * st; b = l + (b - l) * st; }
      d[i * 4] = clamp(r); d[i * 4 + 1] = clamp(g); d[i * 4 + 2] = clamp(b);
    }
    // 3) Schärfen (Unscharf maskieren)
    if (p.sharpen > 0) {
      const bl = boxBlurRGB(d, w, h, 1);
      const amt = p.sharpen / 100 * 1.4;
      for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) { const v = d[i * 4 + c]; d[i * 4 + c] = clamp(v + (v - bl[i * 3 + c]) * amt); }
    }
    out.getContext('2d').putImageData(src, 0, 0);
    return out;
  };

  /** Maske mit Schwelle/Weichheit in Alpha (0..255) umrechnen */
  function alphaFromMask(m, thr, soft) {
    const a = new Uint8ClampedArray(m.length);
    const lo = thr - soft / 2, rng = Math.max(0.02, soft);
    for (let i = 0; i < m.length; i++) a[i] = Math.max(0, Math.min(1, (m[i] - lo) / rng)) * 255;
    return a;
  }

  const ASPECTS = { '1:1': 1, '4:5': 0.8, '3:4': 0.75, '16:9': 16 / 9 };

  /**
   * Endbild zusammensetzen.
   * p: {bg: 'transparent'|'#hex'|'studio', shadow, aspect: 'orig'|'1:1'|'4:5'|'3:4', padding (0..30 %), threshold, softness}
   */
  IMG.compose = function (adj, mask, p) {
    const w = adj.width, h = adj.height;
    let cut = adj, bx = 0, by = 0, bw = w, bh = h;
    if (mask) {
      cut = document.createElement('canvas'); cut.width = w; cut.height = h;
      const cctx = cut.getContext('2d');
      const id = adj.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
      const al = alphaFromMask(mask, p.threshold ?? 0.5, p.softness ?? 0.2);
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x; id.data[i * 4 + 3] = al[i];
        if (al[i] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      cctx.putImageData(id, 0, 0);
      if (x1 >= x0 && y1 >= y0) { bx = x0; by = y0; bw = x1 - x0 + 1; bh = y1 - y0 + 1; }
    }
    // Zuschnitt: Zoom (100–300 %) + Position (−100…100) innerhalb des Motivs bzw. Bildes
    const z = Math.max(1, (+p.zoom || 100) / 100);
    const place = (lo, len, win, pan) => lo + (len - win) / 2 + Math.max(-1, Math.min(1, (+pan || 0) / 100)) * (len - win) / 2;
    let W, H, dx, dy, dw, dh, sx, sy, sw, sh, rangeX, rangeY;
    if (mask) {
      sw = bw / z; sh = bh / z; sx = place(bx, bw, sw, p.panX); sy = place(by, bh, sh, p.panY);
      rangeX = bw - sw; rangeY = bh - sh;
      const ar = p.aspect === 'orig' ? (sw / sh) : ASPECTS[p.aspect] || 1;
      const pad = (p.padding ?? 8) / 100;
      const needW = sw * (1 + 2 * pad), needH = sh * (1 + 2 * pad);
      if (needW / needH > ar) { W = needW; H = needW / ar; } else { H = needH; W = needH * ar; }
      const k = Math.min(1.5, 1600 / Math.max(W, H));
      W = Math.round(W * k); H = Math.round(H * k);
      dw = sw * k; dh = sh * k; dx = (W - dw) / 2; dy = (H - dh) / 2;
    } else {
      // ohne Freistellung: größtmöglicher Ausschnitt im Format, dann Zoom/Position, optional Rand
      const ar = p.aspect === 'orig' ? (w / h) : ASPECTS[p.aspect] || 1;
      let cw, ch; if (w / h > ar) { ch = h; cw = h * ar; } else { cw = w; ch = w / ar; }
      sw = cw / z; sh = ch / z; sx = place(0, w, sw, p.panX); sy = place(0, h, sh, p.panY);
      rangeX = w - sw; rangeY = h - sh;
      const pad = Math.max(0, (+p.frame || 0) / 100);
      const k = Math.min(1, 1600 / (Math.max(sw, sh) * (1 + 2 * pad)));
      dw = Math.round(sw * k); dh = Math.round(sh * k);
      W = Math.round(dw * (1 + 2 * pad)); H = Math.round(dh * (1 + 2 * pad)); dx = (W - dw) / 2; dy = (H - dh) / 2;
    }
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (p.bg === 'studio') {
      const g = ctx.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.1, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#E4E2DE');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else if (p.bg && p.bg !== 'transparent') {
      ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
    }
    if (mask && p.shadow) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = Math.max(8, W * 0.035); ctx.shadowOffsetY = Math.max(4, H * 0.012);
      ctx.drawImage(cut, sx, sy, sw, sh, dx, dy, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(cut, sx, sy, sw, sh, dx, dy, dw, dh);
    }
    out._crop = { rangeX, rangeY, perPx: sw / dw }; // für Ziehen mit der Maus
    return out;
  };

  window.IMG = IMG;
})();
