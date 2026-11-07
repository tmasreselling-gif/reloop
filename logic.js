/* RELOOP – reine Geschäftslogik (ohne DOM), im Browser als window.RL, in Node via require() testbar. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RL = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STATUSES = ['Auf Lager', 'In Bearbeitung', 'Online', 'Reserviert', 'Verkauft'];
  const CHANNELS = ['Vinted', 'Kleinanzeigen', 'eBay', 'Sonstiges'];
  const CONDITIONS = ['Neu mit Etikett', 'Neu ohne Etikett', 'Sehr gut', 'Gut', 'Zufriedenstellend'];
  const GENDERS = ['Herren', 'Damen', 'Unisex', 'Kinder'];
  const CATEGORIES = ['T-Shirt', 'Hemd', 'Polo', 'Pullover', 'Strickjacke', 'Hoodie', 'Sweatshirt', 'Jacke', 'Mantel', 'Weste',
    'Jeans', 'Hose', 'Shorts', 'Rock', 'Kleid', 'Top', 'Bluse', 'Anzug/Sakko', 'Sportbekleidung', 'Schuhe', 'Sneaker',
    'Tasche', 'Accessoire', 'Sonstiges'];
  const SHIP_STATES = ['offen', 'versendet', 'zugestellt'];
  const EXPENSE_CATS = ['Abos', 'Ware', 'Verpackung', 'Sonstiges'];
  /** ältere Kategorien auf die aktuellen abbilden */
  const expenseCat = (c) => (EXPENSE_CATS.includes(c) ? c : /abo|software/i.test(c || '') ? 'Abos' : /ware|einkauf/i.test(c || '') ? 'Ware' : /verpack/i.test(c || '') ? 'Verpackung' : 'Sonstiges');

  const DEFAULT_SETTINGS = {
    theme: 'auto',
    fees: {
      Vinted: { pct: 0, fix: 0 },
      Kleinanzeigen: { pct: 0, fix: 0 },
      eBay: { pct: 0, fix: 0 },
      Sonstiges: { pct: 0, fix: 0 },
    },
    buyerPaysShipping: true,
    shippingCost: 4.5,
    packagingCost: 0.3,
    targetMargin: 40,
    defaultChannel: 'Vinted',
    writingStyle: 'freundlich',
    styleNotes: '',
    signature: '',
    useEmojis: true,
    vintedHashtags: true,
    vintedCode: 'M-0', vintedAccounts: [],
    stockPrefix: 'M',
    sheetsUrl: 'https://docs.google.com/spreadsheets/d/1vmJzXg-OT9ZUd8BUTz7zcXs2mo-yyKM5r_CQOI95BEk/edit',
    sheetsLast: 0,
    sheetsMsg: '', sheetTabs: {}, defaultOwner: '', sheetWrite: true,
    autoListing: true,
    monthlyGoal: 0,
    quickReplies: ['Hi! Ja, der Artikel ist noch verfügbar 😊', 'Danke für deinen Kauf! Ich verschicke ihn innerhalb von 1–2 Werktagen.', 'Ist verschickt! Die Sendungsverfolgung findest du in der App. Viel Freude damit!', 'Gerne schicke ich dir noch genaue Maße – welche brauchst du?', 'Bündel sind möglich – leg einfach alles in ein Paket, dann mache ich dir ein Angebot.'],
    templates: { Vinted: '', Kleinanzeigen: '', eBay: '' },
    dropPct: 5,
    dropDays: 7,
    relistDays: 30,
  };

  const num = (v) => {
    if (v === null || v === undefined || v === '') return NaN;
    if (typeof v === 'number') return v;
    let t = String(v).replace(/\s/g, '').replace(/€|EUR/gi, '');
    if (/,\d{1,2}$/.test(t) || (t.includes(',') && !t.includes('.'))) t = t.replace(/\./g, '').replace(',', '.'); // 1.821,57 → 1821.57
    else t = t.replace(/,/g, '');
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : NaN;
  };
  const n0 = (v) => { const n = num(v); return Number.isFinite(n) ? n : 0; };
  const r2 = (v) => Math.round(v * 100) / 100;

  function mergeSettings(s) {
    const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    if (!s || typeof s !== 'object') return out;
    for (const k of Object.keys(out)) {
      if (k === 'fees' || k === 'templates') continue;
      if (s[k] !== undefined && s[k] !== null) out[k] = s[k];
    }
    if (s.templates && typeof s.templates === 'object') {
      for (const p of ['Vinted', 'Kleinanzeigen', 'eBay']) if (typeof s.templates[p] === 'string') out.templates[p] = s.templates[p];
    }
    if (s.fees && typeof s.fees === 'object') {
      for (const ch of CHANNELS) {
        if (s.fees[ch]) out.fees[ch] = { pct: n0(s.fees[ch].pct), fix: n0(s.fees[ch].fix) };
      }
    }
    return out;
  }

  /** Plattformgebühr für einen Preis */
  function platformFee(settings, channel, price) {
    const f = (settings.fees && settings.fees[channel]) || { pct: 0, fix: 0 };
    const p = n0(price);
    if (p <= 0) return 0;
    return r2(p * n0(f.pct) / 100 + n0(f.fix));
  }

  /** Kosten, die beim Verkäufer bleiben (Versand, falls Verkäufer trägt, + Verpackung) */
  function sellerShipping(settings) {
    return r2((settings.buyerPaysShipping ? 0 : n0(settings.shippingCost)) + n0(settings.packagingCost));
  }

  /** Erwarteter Gewinn bei Verkaufspreis `price` */
  function calcProfit(settings, { price, purchase = 0, channel = 'Vinted' }) {
    const p = n0(price);
    const fee = platformFee(settings, channel, p);
    const ship = sellerShipping(settings);
    const net = r2(p - fee - ship);
    const profit = r2(net - n0(purchase));
    const margin = p > 0 ? r2(profit / p * 100) : 0;
    return { price: r2(p), fee, ship, net, profit, margin };
  }

  /** Maximaler Einkaufspreis, damit beim Marktpreis die Zielmarge (in % vom Verkaufspreis) erreicht wird */
  function maxBuyPrice(settings, { marketPrice, channel = 'Vinted' }) {
    const p = n0(marketPrice);
    if (p <= 0) return 0;
    const { net } = calcProfit(settings, { price: p, purchase: 0, channel });
    return Math.max(0, r2(net - p * n0(settings.targetMargin) / 100));
  }

  /** Gewinn eines verkauften Artikels */
  function soldProfit(item) {
    if (!item || item.status !== 'Verkauft') return 0;
    return r2(n0(item.salePrice) - n0(item.saleFees) - n0(item.saleShipping) - n0(item.purchasePrice) - n0(item.refund));
  }

  /** Preise sinnvoll runden: < 20 € auf 0,50 €, sonst auf ganze Euro */
  function roundPrice(v) {
    const x = n0(v);
    return x < 20 ? Math.round(x * 2) / 2 : Math.round(x);
  }
  function roundPriceUp(v) {
    const x = n0(v);
    return x < 20 ? Math.ceil(x * 2 - 1e-9) / 2 : Math.ceil(x - 1e-9);
  }

  /**
   * Gegenangebot berechnen. Garantiert: Ergebnis nie unter dem Mindestpreis.
   * Rückgabe: { decision: 'annehmen' | 'gegenangebot' | 'ablehnen', counter, reason }
   */
  function counterOffer({ listPrice, minPrice, offer }) {
    const L = n0(listPrice), F = Math.max(0, n0(minPrice)), O = n0(offer);
    if (!(L > 0)) throw new Error('Angebotspreis fehlt');
    if (!(O > 0)) throw new Error('Gebot fehlt');
    const floor = Math.min(F || 0, L) || 0;
    if (O >= L) return { decision: 'annehmen', counter: r2(O), reason: 'Gebot liegt auf oder über deinem Preis.' };
    if (O >= floor && O >= L * 0.9) {
      return { decision: 'annehmen', counter: r2(O), reason: 'Gebot liegt höchstens 10 % unter deinem Preis und über dem Mindestpreis.' };
    }
    let c = roundPriceUp(O + (L - O) * 0.5);
    if (c < floor) c = roundPriceUp(floor);
    if (c > L) c = L;
    if (c < floor) c = floor; // Absicherung
    const reason = O < floor
      ? 'Gebot liegt unter deinem Mindestpreis – Gegenangebot zwischen Gebot und Preis, mindestens Mindestpreis.'
      : 'Gebot liegt über dem Mindestpreis, aber deutlich unter deinem Preis – Gegenangebot in der Mitte.';
    return { decision: 'gegenangebot', counter: r2(c), reason };
  }

  const DAY = 86400000;
  function parseDate(d) {
    if (!d) return null;
    const t = typeof d === 'number' ? d : Date.parse(String(d).length === 10 ? d + 'T12:00:00' : d);
    return Number.isFinite(t) ? t : null;
  }
  function daysBetween(a, b) {
    const ta = parseDate(a), tb = parseDate(b);
    if (ta === null || tb === null) return null;
    return Math.max(0, Math.round((tb - ta) / DAY));
  }
  function today(now) { const d = now ? new Date(now) : new Date(); return isoDate(d); }
  function isoDate(d) {
    const z = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }

  /** Fällige automatische Preisreduzierungen (nur Vorschläge – Ausführung erst nach Bestätigung) */
  function dueDrops(items, settings, now) {
    const t = today(now);
    const out = [];
    for (const it of items) {
      if (it.status !== 'Online' || !it.autoDrop || !it.autoDrop.enabled) continue;
      const price = n0(it.listPrice);
      if (price <= 0) continue;
      const pct = n0(it.autoDrop.pct) || n0(settings.dropPct) || 5;
      const days = n0(it.autoDrop.days) || n0(settings.dropDays) || 7;
      const floor = Math.max(0, n0(it.minPrice));
      const since = it.lastPriceChange || it.onlineSince || it.createdAt;
      const age = daysBetween(since, t);
      if (age === null || age < days) continue;
      let np = roundPrice(price * (1 - pct / 100));
      if (np < floor) np = floor;
      if (np >= price) continue; // bereits am Mindestpreis
      out.push({ id: it.id, from: price, to: r2(np), floorReached: np <= floor, daysSince: age });
    }
    return out;
  }

  /** Relisting-Kandidaten: lange online, nicht verkauft */
  function relistCandidates(items, settings, now) {
    const t = today(now);
    const lim = n0(settings.relistDays) || 30;
    return items
      .filter((it) => it.status === 'Online')
      .map((it) => ({ it, days: daysBetween(it.onlineSince || it.createdAt, t) }))
      .filter((x) => x.days !== null && x.days >= lim)
      .sort((a, b) => b.days - a.days);
  }

  /** Kennzahlen fürs Dashboard */
  function kpis(items, now) {
    const sold = items.filter((i) => i.status === 'Verkauft');
    const active = items.filter((i) => i.status === 'Online' || i.status === 'Reserviert');
    const stock = items.filter((i) => i.status !== 'Verkauft');
    const revenue = r2(sold.reduce((s, i) => s + n0(i.salePrice), 0));
    const profit = r2(sold.reduce((s, i) => s + soldProfit(i), 0));
    const durations = sold
      .map((i) => daysBetween(i.onlineSince || i.purchaseDate || i.createdAt, i.saleDate))
      .filter((d) => d !== null);
    const avgDays = durations.length ? r2(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
    const stockValue = r2(stock.reduce((s, i) => s + n0(i.purchasePrice), 0));
    const listValue = r2(stock.reduce((s, i) => s + n0(i.listPrice), 0));
    const t = today(now);
    const ages = stock.map((i) => daysBetween(i.purchaseDate || i.createdAt, t)).filter((d) => d !== null);
    const avgStockAge = ages.length ? r2(ages.reduce((a, b) => a + b, 0) / ages.length) : null;
    // Kapitalbindung: Einkaufswert × Liegetage (Euro-Tage) – zeigt, wo Geld lange gebunden ist
    const capitalDays = r2(stock.reduce((s, i) => s + n0(i.purchasePrice) * (daysBetween(i.purchaseDate || i.createdAt, t) || 0), 0));
    const margins = sold.filter((i) => n0(i.salePrice) > 0).map((i) => soldProfit(i) / n0(i.salePrice) * 100);
    const avgMargin = margins.length ? r2(margins.reduce((a, b) => a + b, 0) / margins.length) : null;
    return {
      activeCount: active.length, stockCount: stock.length, soldCount: sold.length,
      revenue, profit, avgSalePrice: sold.length ? r2(revenue / sold.length) : null,
      avgDays, stockValue, listValue, avgStockAge, capitalDays, avgMargin,
    };
  }

  /** Monatsreihe der letzten n Monate (nach Verkaufsdatum) */
  function monthly(items, months = 12, now) {
    const end = now ? new Date(now) : new Date();
    const keys = [];
    for (let k = months - 1; k >= 0; k--) {
      const d = new Date(end.getFullYear(), end.getMonth() - k, 1);
      keys.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }
    const map = Object.fromEntries(keys.map((k) => [k, { revenue: 0, profit: 0, count: 0 }]));
    for (const i of items) {
      if (i.status !== 'Verkauft' || !i.saleDate) continue;
      const k = String(i.saleDate).slice(0, 7);
      if (!map[k]) continue;
      map[k].revenue += n0(i.salePrice); map[k].profit += soldProfit(i); map[k].count += 1;
    }
    return keys.map((k) => ({ month: k, revenue: r2(map[k].revenue), profit: r2(map[k].profit), count: map[k].count }));
  }

  /* ---------- Belege (PDF/Quittung) ohne KI auslesen – Fallback ---------- */
  function parseReceiptText(text) {
    const t = String(text || '').replace(/ /g, ' ');
    const amt = (s) => { const n = num(String(s).replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
    let total = null;
    const KEY = /(gesamtbetrag|rechnungsbetrag|endbetrag|zu zahlen|zahlbetrag|gesamtsumme|summe brutto|brutto|gesamt|summe|total)\b[^\d\n-]{0,30}(-?\d{1,6}(?:\.\d{3})*,\d{2}|\d{1,6}\.\d{2})/gi;
    const hits = [...t.matchAll(KEY)].map((m) => ({ k: m[1].toLowerCase(), v: amt(m[2]) })).filter((h) => h.v !== null && h.v > 0);
    const pref = ['gesamtbetrag', 'rechnungsbetrag', 'endbetrag', 'zu zahlen', 'zahlbetrag', 'gesamtsumme', 'summe brutto', 'brutto', 'gesamt', 'total', 'summe'];
    for (const p of pref) { const h = hits.filter((x) => x.k === p); if (h.length) { total = h[h.length - 1].v; break; } }
    if (total === null) { const all = [...t.matchAll(/(\d{1,6}(?:\.\d{3})*,\d{2})\s*(?:€|EUR)/g)].map((m) => amt(m[1])).filter((x) => x > 0); if (all.length) total = Math.max(...all); }
    let date = null;
    const d = t.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/) || t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (d) {
      if (d[0].includes('-')) date = `${d[1]}-${d[2]}-${d[3]}`;
      else { const y = d[3].length === 2 ? '20' + d[3] : d[3]; date = `${y}-${String(d[2]).padStart(2, '0')}-${String(d[1]).padStart(2, '0')}`; }
    }
    const inv = t.match(/(?:rechnungs?-?(?:nr|nummer)|invoice\s*(?:no|number)|beleg-?nr)\.?:?\s*([A-Z0-9][A-Z0-9\-\/]{3,})/i);
    return { total: total !== null ? r2(total) : null, date, invoiceNumber: inv ? inv[1] : '' };
  }

  /* ---------- Verkaufs-Mails (Gmail-Abgleich) ---------- */
  function htmlToText(s) {
    return String(s || '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|td|li|h\d|table)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&euro;/g, '€').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n))
      .replace(/[ \t ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  }
  const PRICE_RE = /(\d{1,5}(?:[.,]\d{2}))\s*(?:€|EUR)|€\s*(\d{1,5}(?:[.,]\d{2}))/i;
  /**
   * Verkaufs-Mail auswerten (Vinted-Format: "<Käufer> hat gekauft" → Titel → Preis).
   * Rückgabe {platform, title, price, buyer} oder null, wenn keine Verkaufs-Mail erkannt wird.
   */
  function parseSaleMail(rawText, subject = '', from = '') {
    const text = htmlToText(rawText);
    const all = (subject + '\n' + from + '\n' + text);
    const isSale = /(wurde gekauft|hat gekauft|wurde verkauft|hast .* verkauft|ist verkauft|Glückwunsch.*verkauft|sold)/i.test(all);
    if (!isSale) return null;
    const platform = /vinted/i.test(all) ? 'Vinted' : /kleinanzeigen/i.test(all) ? 'Kleinanzeigen' : /ebay/i.test(all) ? 'eBay' : 'Sonstiges';
    // Tabellen-Striche/Zeilenumbrüche entfernen → eine Zeile (funktioniert für Snippet, Klartext und HTML)
    const flat = text.replace(/^(\s*\|)+\s*/gm, '').replace(/(\s*\|)+\s*$/gm, '').replace(/\s+/g, ' ').trim();
    // an welches Vinted-Konto ging die Mail? („Hallo tmas_vintage, …“)
    const acc = flat.match(/\bHallo ([^\s,]{2,40}),/i); const account = acc ? acc[1] : '';
    const m = flat.match(/(?:Hallo [^,]{1,60},\s*)?(\S{1,60})\s+hat gekauft:?\s+(.{2,200}?)\s+(\d{1,5}(?:[.,]\d{2}))\s*(?:€|EUR)/i);
    if (m) {
      const title = m[2].replace(/\s+/g, ' ').trim();
      const bundle = title.match(/^(\d+)\s+Paket\b/i);
      return { platform, title, price: num(m[3].replace('.', ',')), buyer: m[1], needsAi: false, bundle: bundle ? +bundle[1] : 0, account };
    }
    const pm = flat.match(PRICE_RE);
    return { platform, title: '', price: pm ? num((pm[1] || pm[2]).replace('.', ',')) : null, buyer: '', needsAi: true, bundle: 0, account };
  }
  const norm = (s) => String(s || '').toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const STOP = new Set(['grosse', 'gr', 'size', 'und', 'mit', 'the', 'der', 'die', 'das', 'in', 'fur', 'fuer', 'von']);
  const toks = (s) => new Set(norm(s).split(' ').filter((t) => t.length > 1 && !STOP.has(t)));
  /** Ähnlichkeit 0..1 zwischen Mail-Titel und Artikel (Titel, Anzeigentitel, Marke/Typ/Größe) */
  function matchScore(mailTitle, item) {
    const mt = toks(mailTitle); if (!mt.size) return 0;
    if (item.sku && norm(mailTitle).includes(norm(item.sku))) return 1;
    const cands = [item.title, ...Object.values(item.listing || {}).map((l) => l && l.title),
      [item.brand, item.productType || item.category, item.color, item.size].filter(Boolean).join(' ')].filter(Boolean);
    const nt = normTitle(mailTitle);
    if (cands.some((c) => normTitle(c) === nt)) return 1; // exakt gleicher Anzeigentitel
    if (cands.some((c) => titleSim(c, mailTitle) >= 0.9)) return 0.95;
    let best = 0;
    for (const c of cands) {
      const ct = toks(c); if (!ct.size) continue;
      let inter = 0; for (const t of mt) if (ct.has(t)) inter++;
      const score = (inter / mt.size) * 0.6 + (inter / ct.size) * 0.4;
      if (score > best) best = score;
    }
    // Größe muss passen, sonst Abzug
    if (item.size) { const sz = norm(item.size); if (sz && !norm(mailTitle).split(' ').includes(sz)) best *= 0.75; }
    return r2(Math.min(1, best));
  }
  /** Alle bekannten Vinted-Konten (Einstellungen + an Artikeln hinterlegt) */
  function vintedAccounts(items, settings) {
    const set = new Set((settings && settings.vintedAccounts || []).filter(Boolean));
    for (const i of items || []) if (i.account) set.add(i.account);
    return [...set];
  }
  /** Artikel, die für einen Verkauf über dieses Konto infrage kommen (ohne Konto = passt zu jedem) */
  const forAccount = (items, account) => (account ? items.filter((i) => !i.account || i.account === account) : items);
  /** includeSold: auch verkaufte Artikel ohne zugeordnete Mail (z. B. aus der Tabelle importiert) */
  function bestMatches(mailTitle, items, n = 5, includeSold = false) {
    return items.filter((i) => i.status !== 'Verkauft' || (includeSold && !i.mailMid)).map((i) => ({ item: i, score: matchScore(mailTitle, i) }))
      .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, n);
  }

  /* ---------- Vollständigkeit eines Artikels ---------- */
  const NO_MEASURE = /schuh|sneaker|tasche|accessoire/i;
  /** Liefert fehlende Pflichtangaben als [{key, label, tab}] */
  function missingFields(it) {
    const out = [];
    const add = (key, label, tab) => out.push({ key, label, tab });
    if (!(it.images || []).length) add('images', 'Fotos', 'fotos');
    if (!it.brand) add('brand', 'Marke', 'daten');
    if (!it.category) add('category', 'Kategorie', 'daten');
    if (!it.size) add('size', 'Größe', 'daten');
    if (!it.condition) add('condition', 'Zustand', 'daten');
    const m = it.measurements || {};
    if (!NO_MEASURE.test(it.category || '') && !(n0(m.length) > 0 || n0(m.chest) > 0)) add('measurements', 'Maße', 'daten');
    if (it.purchasePrice === null || it.purchasePrice === undefined || it.purchasePrice === '') add('purchasePrice', 'Einkaufspreis', 'daten');
    if (!(n0(it.listPrice) > 0)) add('listPrice', 'Preis', 'preis');
    if (!Object.values(it.listing || {}).some((l) => l && l.description)) add('listing', 'Anzeigentext', 'anzeige');
    return out;
  }
  /** Gesamtpreis eines Postens auf n Artikel verteilen (Cent-genau, Rest auf die ersten) */
  function splitCost(total, n) {
    const cents = Math.round(n0(total) * 100); if (!(n > 0)) return [];
    const base = Math.floor(cents / n), rest = cents - base * n;
    return Array.from({ length: n }, (_, i) => (base + (i < rest ? 1 : 0)) / 100);
  }

  /* ---------- Zeitreihen nach Tag / Woche / Monat ---------- */
  const toDate = (d) => new Date(typeof d === 'number' ? d : String(d).length === 10 ? d + 'T12:00:00' : d);
  function mondayOf(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; }
  function isoWeek(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / DAY + 1) / 7); }
  function bucketKey(date, gran) {
    const d = toDate(date); if (isNaN(d)) return null;
    if (gran === 'day') return isoDate(d);
    if (gran === 'week') return isoDate(mondayOf(d));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function bucketLabel(key, gran) {
    if (gran === 'day') { const [, m, d] = key.split('-'); return `${d}.${m}.`; }
    if (gran === 'week') return 'KW ' + isoWeek(toDate(key));
    const [y, m] = key.split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
  }
  /** Umsatz/Gewinn/Anzahl der letzten n Tage, Wochen oder Monate (nach Verkaufsdatum) */
  /** Betriebskosten: Ausgaben ohne Wareneinkauf – der Wareneinkauf steckt schon im EK der Artikel (sonst doppelt gezählt) */
  function opexAmt(e) { return expenseCat(e && e.category) === 'Ware' ? 0 : n0(e && e.amount); }
  function series(items, gran = 'month', n = 12, now, expenses = []) {
    const end = now ? new Date(now) : new Date();
    const keys = [];
    for (let k = n - 1; k >= 0; k--) {
      let d;
      if (gran === 'day') d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - k);
      else if (gran === 'week') { d = mondayOf(end); d.setDate(d.getDate() - 7 * k); }
      else d = new Date(end.getFullYear(), end.getMonth() - k, 1);
      keys.push(bucketKey(d, gran));
    }
    const map = Object.fromEntries(keys.map((k) => [k, { revenue: 0, profit: 0, count: 0, expenses: 0, opex: 0 }]));
    for (const e of expenses || []) { const k = e.date && bucketKey(e.date, gran); if (k && map[k]) { map[k].expenses += n0(e.amount); map[k].opex += opexAmt(e); } }
    for (const i of items) {
      if (i.status !== 'Verkauft' || !i.saleDate) continue;
      const k = bucketKey(i.saleDate, gran);
      if (!map[k]) continue;
      map[k].revenue += n0(i.salePrice); map[k].profit += soldProfit(i); map[k].count += 1;
    }
    return keys.map((k) => ({ key: k, label: bucketLabel(k, gran), revenue: r2(map[k].revenue), profit: r2(map[k].profit), count: map[k].count, avg: map[k].count ? r2(map[k].revenue / map[k].count) : 0, expenses: r2(map[k].expenses), opex: r2(map[k].opex), net: r2(map[k].profit - map[k].opex) }));
  }
  /* ---------- Feste Zeiträume für die Statistik ---------- */
  const PERIODS = [['d1', '1 Tag'], ['d7', '7 Tage'], ['w1', '1 Woche'], ['m1', '1 Monat'], ['m4', '4 Monate'], ['m6', '6 Monate'], ['y1', '1 Jahr'], ['all', 'Gesamt']];
  /** Zeitraum → {start, end (ISO-Datum), gran, label} */
  function periodRange(key, items = [], expenses = [], now) {
    const t = now ? new Date(now) : new Date();
    const d0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    const iso = isoDate;
    const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const mStart = (back) => new Date(t.getFullYear(), t.getMonth() - back, 1);
    switch (key) {
      case 'd1': return { start: iso(d0), end: iso(d0), gran: 'day', label: 'Heute' };
      case 'd7': return { start: iso(add(d0, -6)), end: iso(d0), gran: 'day', label: 'Letzte 7 Tage' };
      case 'w1': { const m = mondayOf(d0); return { start: iso(m), end: iso(add(m, 6)), gran: 'day', label: 'Diese Woche (KW ' + isoWeek(d0) + ')' }; }
      case 'm1': return { start: iso(mStart(0)), end: iso(new Date(t.getFullYear(), t.getMonth() + 1, 0)), gran: 'day', label: 'Dieser Monat' };
      case 'm4': return { start: iso(mStart(3)), end: iso(d0), gran: 'week', label: 'Letzte 4 Monate' };
      case 'm6': return { start: iso(mStart(5)), end: iso(d0), gran: 'month', label: 'Letzte 6 Monate' };
      case 'y1': return { start: iso(mStart(11)), end: iso(d0), gran: 'month', label: 'Letzte 12 Monate' };
      default: {
        const dates = [...items.map((i) => i.status === 'Verkauft' && i.saleDate), ...items.map((i) => i.purchaseDate), ...expenses.map((e) => e.date)].filter(Boolean).map(String).sort();
        const first = dates[0] ? toDate(dates[0]) : mStart(11);
        const months = (t.getFullYear() - first.getFullYear()) * 12 + t.getMonth() - first.getMonth();
        return { start: iso(new Date(first.getFullYear(), first.getMonth(), 1)), end: iso(d0), gran: months > 60 ? 'month' : months > 2 ? 'month' : 'week', label: 'Gesamt' };
      }
    }
  }
  const inRange = (d, r) => { const s = String(d || '').slice(0, 10); return !!s && s >= r.start && s <= r.end; };
  /** Zeitreihe zwischen zwei Daten in der gewünschten Körnung */
  function seriesRange(items, r, expenses = []) {
    const keys = []; let d = toDate(r.start); const end = toDate(r.end);
    if (r.gran === 'week') d = mondayOf(d);
    if (r.gran === 'month') d = new Date(d.getFullYear(), d.getMonth(), 1);
    let guard = 0;
    while (d <= end && guard++ < 400) {
      keys.push(bucketKey(d, r.gran));
      if (r.gran === 'day') d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      else if (r.gran === 'week') d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
      else d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
    const map = Object.fromEntries(keys.map((k) => [k, { revenue: 0, profit: 0, count: 0, expenses: 0, opex: 0 }]));
    for (const i of items) {
      if (i.status !== 'Verkauft' || !inRange(i.saleDate, r)) continue;
      const k = bucketKey(i.saleDate, r.gran); if (!map[k]) continue;
      map[k].revenue += n0(i.salePrice); map[k].profit += soldProfit(i); map[k].count += 1;
    }
    for (const e of expenses || []) { if (!inRange(e.date, r)) continue; const k = bucketKey(e.date, r.gran); if (map[k]) { map[k].expenses += n0(e.amount); map[k].opex += opexAmt(e); } }
    return keys.map((k) => ({ key: k, label: bucketLabel(k, r.gran), revenue: r2(map[k].revenue), profit: r2(map[k].profit), count: map[k].count, avg: map[k].count ? r2(map[k].revenue / map[k].count) : 0, expenses: r2(map[k].expenses), opex: r2(map[k].opex), net: r2(map[k].profit - map[k].opex) }));
  }
  /** Summen eines Zeitraums */
  function periodSum(items, r, expenses = []) {
    const sold = items.filter((i) => i.status === 'Verkauft' && inRange(i.saleDate, r));
    const revenue = r2(sold.reduce((a, i) => a + n0(i.salePrice), 0));
    const profit = r2(sold.reduce((a, i) => a + soldProfit(i), 0));
    const inR = (expenses || []).filter((e) => inRange(e.date, r));
    const exp = r2(inR.reduce((a, e) => a + n0(e.amount), 0)); const opex = r2(inR.reduce((a, e) => a + opexAmt(e), 0));
    return { revenue, profit, count: sold.length, avg: sold.length ? r2(revenue / sold.length) : 0, expenses: exp, opex, net: r2(profit - opex), margin: revenue > 0 ? r2(profit / revenue * 100) : null };
  }

  /** Summen für heute, diese Woche, diesen Monat */
  function periodTotals(items, now, expenses = []) {
    const out = {};
    for (const g of ['day', 'week', 'month']) out[g] = series(items, g, 1, now, expenses)[0];
    return out;
  }

  /** Gruppierung verkaufter Artikel (z. B. nach Marke oder Kategorie) */
  function groupSold(items, field, top = 8) {
    const g = {};
    for (const i of items) {
      if (i.status !== 'Verkauft') continue;
      const k = (i[field] || '').toString().trim() || 'Unbekannt';
      g[k] = g[k] || { key: k, count: 0, revenue: 0, profit: 0 };
      g[k].count++; g[k].revenue += n0(i.salePrice); g[k].profit += soldProfit(i);
    }
    return Object.values(g).map((x) => ({ ...x, revenue: r2(x.revenue), profit: r2(x.profit) }))
      .sort((a, b) => b.profit - a.profit).slice(0, top);
  }

  /** CSV (Semikolon, deutsches Dezimalkomma, BOM für Excel) */
  const CSV_COLS = [
    ['sku', 'Artikel-ID'], ['title', 'Titel'], ['brand', 'Marke'], ['category', 'Kategorie'], ['size', 'Größe'],
    ['color', 'Farbe'], ['condition', 'Zustand'], ['status', 'Status'], ['purchasePrice', 'Einkaufspreis'],
    ['purchaseDate', 'Einkaufsdatum'], ['listPrice', 'Angebotspreis'], ['minPrice', 'Mindestpreis'],
    ['salePrice', 'Verkaufspreis'], ['saleDate', 'Verkaufsdatum'], ['channel', 'Verkaufskanal'],
    ['saleFees', 'Gebühren'], ['saleShipping', 'Versand/Verpackung'], ['_profit', 'Gewinn'], ['source', 'Bezugsquelle'], ['location', 'Lagerplatz'], ['notes', 'Notizen'],
  ];
  const MONEY = new Set(['purchasePrice', 'listPrice', 'minPrice', 'salePrice', 'saleFees', 'saleShipping', '_profit']);
  function csvCell(v) {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // Formel-Injektion verhindern
    if (/[";\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function expensesCSV(list) {
    const head = ['Datum', 'Betrag', 'Kategorie', 'Beschreibung', 'Artikel-ID'].join(';');
    const rows = list.map((e) => [e.date, n0(e.amount).toFixed(2).replace('.', ','), e.category, e.note, e.itemSku].map(csvCell).join(';'));
    return '\uFEFF' + [head, ...rows].join('\r\n');
  }
  function toCSV(items) {
    const head = CSV_COLS.map((c) => c[1]).join(';');
    const rows = items.map((i) => CSV_COLS.map(([k]) => {
      let v = k === '_profit' ? (i.status === 'Verkauft' ? soldProfit(i) : '') : i[k];
      if (MONEY.has(k) && v !== '' && v !== null && v !== undefined && Number.isFinite(num(v))) v = num(v).toFixed(2).replace('.', ',');
      return csvCell(v);
    }).join(';'));
    return '﻿' + [head, ...rows].join('\r\n');
  }

  /* ---------- Eigene Beschreibungs-Vorlagen mit Platzhaltern ---------- */
  const PLACEHOLDERS = [
    ['titel', 'Titel'], ['marke', 'Marke'], ['typ', 'Produkttyp'], ['kategorie', 'Kategorie'], ['zielgruppe', 'Herren/Damen …'],
    ['groesse', 'Größe'], ['farbe', 'Farbe'], ['material', 'Material'], ['schnitt', 'Schnitt'], ['muster', 'Muster'], ['zustand', 'Zustand'],
    ['masse', 'alle Maße (je Zeile)'], ['laenge', 'Länge'], ['brustweite', 'Brustweite'], ['schulter', 'Schulter'],
    ['details', 'Merkmale (je Zeile)'], ['maengel', 'Mängel (je Zeile)'],
    ['preis', 'Preis'], ['sku', 'Artikel-ID'], ['lager', 'Lagernummer'], ['code', 'Code unter Versand (Lagernummer)'], ['hashtags', '#Hashtags'], ['signatur', 'Fester Text'],
  ];
  const DEFAULT_TEMPLATES = {
    Vinted: '👕 GRÖSSE – {groesse}\n\n📐 MASSE\n{masse}\n\n✨ DETAILS\n- Marke: {marke}\n- Farbe: {farbe}\n- Material: {material}\n- Zustand: {zustand}\n{details}\n\n🔎 HINWEISE\n{maengel}\n\n🚚 VERSAND:\nSchneller Versand möglich\nBei Fragen einfach melden 👍\n{code}\n\n{hashtags}',
    Kleinanzeigen: 'Verkaufe {marke} {typ} in Größe {groesse}.\n\n• Farbe: {farbe}\n• Material: {material}\n• Zustand: {zustand}\n{details}\n\nMaße (flach gemessen):\n{masse}\n\nHinweise:\n{maengel}\n\nVersand oder Abholung möglich.\nPrivatverkauf, daher keine Garantie, Gewährleistung oder Rücknahme.',
    eBay: '{marke} {typ} – Größe {groesse}\n\nArtikeldetails:\n- Marke: {marke}\n- Farbe: {farbe}\n- Material: {material}\n- Schnitt: {schnitt}\n- Zustand: {zustand}\n{details}\n\nMaße (flach gemessen):\n{masse}\n\nZustandshinweise:\n{maengel}\n\nVersand innerhalb Deutschlands.\nPrivatverkauf, daher keine Garantie, Gewährleistung oder Rücknahme.',
  };
  function templateVals(item, settings, platform, tags) {
    const m = item.measurements || {};
    const approx = (item.aiFields || []).includes('measurements') && /geschätzt/.test(item.measurementsSource || '');
    const cm = (v) => (n0(v) > 0 ? `${approx ? 'ca. ' : ''}${String(v).replace('.', ',')} cm` : '');
    const mlist = [['Länge', m.length], ['Brustweite (flach)', m.chest], ['Schulterbreite', m.shoulder]]
      .filter(([, v]) => n0(v) > 0).map(([k, v]) => `${k}: ${cm(v)}`);
    const bullet = platform === 'Kleinanzeigen' ? '• ' : '- ';
    const lines = (a) => (Array.isArray(a) ? a : []).filter(Boolean).map((x) => bullet + x).join('\n');
    const typ = item.productType || item.category || '';
    return {
      titel: item.title || [item.brand, typ, item.color, item.size ? 'Größe ' + item.size : ''].filter(Boolean).join(' '),
      marke: item.brand || '', typ, kategorie: item.category || '', zielgruppe: item.gender || '', groesse: item.size || '',
      farbe: item.color || '', material: item.material || '', schnitt: item.fit || '', muster: item.pattern || '', zustand: item.condition || '',
      masse: mlist.join('\n'), laenge: cm(m.length), brustweite: cm(m.chest), schulter: cm(m.shoulder),
      details: lines(item.features), maengel: lines(item.defects), preis: n0(item.listPrice) > 0 ? fmtEUR(item.listPrice) : '',
      sku: item.sku || '', code: platform === 'Vinted' ? itemCode(item, settings) : '', lager: item.stockNo || '',
      hashtags: platform === 'Vinted' && settings.vintedHashtags !== false ? toHashtags(tags).join(' ') : '', signatur: settings.signature || '',
    };
  }
  /** Maße-Block in einer bestehenden Beschreibung einfügen bzw. aktualisieren (Länge, Brustweite, Schulter) */
  function injectMeasurements(desc, item, platform, settings) {
    const vals = templateVals(item, settings, platform, []);
    const bullet = platform === 'Kleinanzeigen' ? '• ' : platform === 'eBay' ? '- ' : '';
    const ml = vals.masse ? vals.masse.split('\n').map((x) => bullet + x) : [];
    const isM = (l) => /^\s*[-•*]?\s*(länge|brustweite|schulterbreite|schulter)\b[^:\n]{0,20}:\s*(ca\.\s*)?\d/i.test(l);
    const isH = (l) => /^\W*(MASSE|MAẞE|Maße)\b/i.test(l.trim());
    let lines = String(desc || '').replace(/\r/g, '').split('\n');
    const firstIdx = lines.findIndex(isM);
    lines = lines.filter((l) => !isM(l));
    let hi = lines.findIndex(isH);
    if (!ml.length) {
      if (hi >= 0 && (hi + 1 >= lines.length || !lines[hi + 1].trim())) lines.splice(hi, 1);
    } else if (hi >= 0) {
      lines.splice(hi + 1, 0, ...ml);
    } else if (firstIdx >= 0) {
      lines.splice(firstIdx, 0, ...ml);
    } else {
      const head = platform === 'Vinted' ? `${settings.useEmojis !== false ? '📐 ' : ''}MASSE` : 'Maße (flach gemessen):';
      let at = lines.findIndex((l) => /DETAILS|Artikeldetails/i.test(l));
      if (at < 0) { at = lines.findIndex((l, i) => i > 0 && !l.trim()); at = at < 0 ? lines.length : at + 1; }
      lines.splice(at, 0, head, ...ml, '');
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  /** Vorlage füllen: Platzhalter ersetzen; Zeilen, deren Platzhalter alle leer sind, entfallen; leere Abschnitte werden entfernt */
  function fillTemplate(tpl, vals) {
    const out = [];
    const blocks = String(tpl || '').replace(/\r/g, '').split(/\n{2,}/);
    for (const block of blocks) {
      const kept = [];
      let hadPh = false, filledPh = false, staticOnly = true;
      for (const line of block.split('\n')) {
        const phs = [...line.matchAll(/\{(\w+)\}/g)].map((x) => x[1].toLowerCase()).filter((k) => k in vals);
        if (!phs.length) { kept.push({ line, ph: false }); continue; }
        staticOnly = false; hadPh = true;
        if (phs.every((k) => !String(vals[k]).trim())) continue;
        filledPh = true;
        kept.push({ line: line.replace(/\{(\w+)\}/g, (all, k) => (k.toLowerCase() in vals ? vals[k.toLowerCase()] : all)).replace(/[ \t]+$/g, ''), ph: true });
      }
      // Abschnitt nur aus Überschrift ohne gefüllte Platzhalter → weglassen
      if (hadPh && !filledPh && kept.length <= 1) continue;
      const text = kept.map((k) => k.line).join('\n').trim();
      if (text || staticOnly) out.push(text);
    }
    return out.filter((x) => x !== '').join('\n\n').trim();
  }

  /** Lokale Anzeigenvorlage ohne KI – nutzt nur vorhandene Daten */
  function templateListing(item, platform, settings) {
    const custom = settings.templates && String(settings.templates[platform] || '').trim();
    if (custom) {
      const base = templateListing(item, platform, { ...settings, templates: {}, signature: '' });
      const vals = templateVals(item, settings, platform, base.tags);
      let description = fillTemplate(custom, vals);
      if (settings.signature && !/\{signatur\}/i.test(custom)) description += '\n\n' + settings.signature;
      description = spaceAfterCondition(description);
      if (platform === 'Vinted') description = finalizeVinted(description, base.tags, settings, itemCode(item, settings));
      return { ...base, description };
    }
    const e = settings.useEmojis !== false && platform === 'Vinted';
    const parts = (a) => a.filter((x) => x && String(x).trim()).join(' ');
    const typ = item.productType || item.category || 'Artikel';
    const m = item.measurements || {};
    const approx = (item.aiFields || []).includes('measurements') && /geschätzt/.test(item.measurementsSource || '');
    const meas = [
      ['Länge', m.length], ['Brustweite (flach)', m.chest], ['Schulterbreite', m.shoulder],
    ].filter(([, v]) => n0(v) > 0).map(([k, v]) => `${k}: ${approx ? 'ca. ' : ''}${String(v).replace('.', ',')} cm`);
    let title;
    if (platform === 'eBay') {
      title = parts([item.brand, item.gender, typ, item.fit, item.color, item.material, item.size ? 'Gr. ' + item.size : '', item.condition]);
      if (title.length > 80) title = title.slice(0, 80).replace(/\s+\S*$/, '');
    } else {
      title = parts([item.brand, typ, item.color, item.size ? 'Größe ' + item.size : '']);
    }
    const details = [
      item.brand && `Marke: ${item.brand}`, item.color && `Farbe: ${item.color}`, item.material && `Material: ${item.material}`,
      item.fit && `Schnitt: ${item.fit}`, item.gender && `Für: ${item.gender}`, item.condition && `Zustand: ${item.condition}`,
      ...(Array.isArray(item.features) ? item.features : []),
    ].filter(Boolean);
    const defects = (Array.isArray(item.defects) ? item.defects : []).filter(Boolean);
    const L = [];
    if (platform === 'Vinted') {
      L.push(`${e ? '👕 ' : ''}GRÖSSE – ${item.size || 'siehe Fotos'}`, '');
      if (meas.length) L.push(`${e ? '📐 ' : ''}MASSE`, ...meas, '');
      L.push(`${e ? '✨ ' : ''}DETAILS`, ...details.map((d) => '- ' + d), '');
      if (defects.length) L.push(`${e ? '🔎 ' : ''}HINWEISE`, ...defects.map((d) => '- ' + d), '');
      L.push(`${e ? '🚚 ' : ''}VERSAND:`, 'Schneller Versand möglich', `Bei Fragen einfach melden${e ? ' 👍' : ''}`);
    } else if (platform === 'Kleinanzeigen') {
      L.push(`Verkaufe ${item.brand ? item.brand + ' ' : ''}${typ}${item.size ? ' in Größe ' + item.size : ''}.`, '');
      if (details.length) L.push(...details.map((d) => '• ' + d), '');
      if (meas.length) L.push('Maße (flach gemessen):', ...meas.map((x) => '• ' + x), '');
      if (defects.length) L.push('Hinweise:', ...defects.map((d) => '• ' + d), '');
      L.push('Versand oder Abholung möglich.', 'Privatverkauf, daher keine Garantie, Gewährleistung oder Rücknahme.');
    } else {
      L.push(`${item.brand ? item.brand + ' ' : ''}${typ}${item.size ? ' – Größe ' + item.size : ''}`, '');
      L.push('Artikeldetails:', ...details.map((d) => '- ' + d), '');
      if (meas.length) L.push('Maße (flach gemessen):', ...meas.map((x) => '- ' + x), '');
      if (defects.length) L.push('Zustandshinweise:', ...defects.map((d) => '- ' + d), '');
      L.push('Versand innerhalb Deutschlands.', 'Privatverkauf, daher keine Garantie, Gewährleistung oder Rücknahme.');
    }
    if (settings.signature) L.push('', settings.signature);
    const tags = [item.brand, typ, item.color, item.size && 'Größe ' + item.size, item.material, item.gender, item.category]
      .filter(Boolean).map((t) => String(t).toLowerCase());
    const uniq = [...new Set(tags)];
    let description = spaceAfterCondition(L.join('\n').trim());
    if (platform === 'Vinted') description = finalizeVinted(description, uniq, settings, itemCode(item, settings));
    return { title: title.trim(), description, tags: uniq, category: item.category || '' };
  }

  /** Nach der Zustands-Zeile immer eine Leerzeile, bevor weitere Infos folgen */
  function spaceAfterCondition(desc) {
    const lines = String(desc || '').replace(/\r/g, '').split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      out.push(lines[i]);
      if (/zustand/i.test(lines[i]) && i + 1 < lines.length && lines[i + 1].trim() !== '') out.push('');
    }
    return out.join('\n');
  }

  /** Suchbegriffe in Hashtags umwandeln (#poloralphlauren) */
  function toHashtags(tags) {
    const out = [];
    for (const t of tags || []) {
      const h = String(t).toLowerCase().replace(/^#/, '').replace(/ß/g, 'ss').replace(/[^\p{L}\p{N}]+/gu, '');
      if (h && h.length > 1 && !/^(gr(ö|oe|o)s{1,2}e|größe|gr\d|\d)/.test(h) && !out.includes(h)) out.push(h);
    }
    return out.slice(0, 15).map((h) => '#' + h);
  }

  /**
   * Vinted-Beschreibung vervollständigen: Code (z. B. „M-0“) direkt unter den Versand-Abschnitt,
   * passende Hashtags ans Ende. Idempotent – mehrfaches Anwenden ändert nichts.
   */
  function finalizeVinted(desc, tags, settings, codeOverride) {
    let lines = spaceAfterCondition(desc).split('\n');
    // vorhandene reine Hashtag-Zeilen entfernen (werden neu erzeugt)
    lines = lines.filter((l) => !/^\s*(#[^\s#]+\s*)+$/.test(l));
    const code = String(codeOverride || settings.vintedCode || '').trim();
    // veraltete Codes (fester Code bzw. andere Lagernummer) entfernen
    const pre = String(settings.stockPrefix || '').trim();
    const stale = (l) => { const t = l.trim(); return t !== code && (t === String(settings.vintedCode || '').trim() || (pre && new RegExp('^' + pre.replace(/[^\w]/g, '\\$&') + '-\\d+$').test(t))); };
    lines = lines.filter((l) => !(l.trim() && stale(l)));
    if (code && !lines.some((l) => l.trim() === code)) {
      const vi = lines.findIndex((l) => /^[^\p{L}]*versand\b/iu.test(l));
      if (vi >= 0) {
        let end = vi + 1;
        while (end < lines.length && lines[end].trim() !== '') end++;
        lines.splice(end, 0, code);
      } else {
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
        lines.push('', code);
      }
    }
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (settings.vintedHashtags !== false) {
      const hs = toHashtags(tags);
      if (hs.length) lines.push('', hs.join(' '));
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /** Code unter dem Versand-Abschnitt: echte Lagernummer (z. B. M-063), sonst fester Code */
  function itemCode(item, settings) {
    return String((item && item.stockNo) || settings.vintedCode || '').trim();
  }
  /** Nächste freie Lagernummer für ein Präfix, z. B. M-001 … M-062 → M-063 */
  function nextStockNo(items, prefix) {
    const p = String(prefix || '').trim(); if (!p) return '';
    const re = new RegExp('^' + p.replace(/[^\w]/g, '\\$&') + '-(\\d+)$', 'i');
    let max = 0;
    for (const i of items || []) { const m = String(i.stockNo || '').trim().match(re); if (m) max = Math.max(max, +m[1]); }
    return `${p}-${String(max + 1).padStart(3, '0')}`;
  }
  /** Größe aus einem Artikelnamen lesen („Größe L“, „Gr. XL“, „| M |“, „… Schwarz M“) */
  function sizeFromTitle(t) {
    const s = String(t || '');
    let m = s.match(/\b(?:Größe|Groesse|Gr)\.?\s*:?\s*(\d?X{0,3}[SL]|M|XS|\d{2,3}(?:\/\d{2})?|W\d{2}(?:\/?L\d{2})?)\b/i);
    if (m) return m[1].toUpperCase();
    m = s.match(/(?:^|[\s|(])(XXS|XS|S|M|L|XL|XXL|XXXL|[2-5]XL)(?=$|[\s|)])/);
    return m ? m[1] : '';
  }
  const SHEET_STATUS = { online: 'Online', verkauft: 'Verkauft', abgeschlossen: 'Verkauft', 'in bearbeitung': 'In Bearbeitung', reserviert: 'Reserviert', 'auf lager': 'Auf Lager', lager: 'Auf Lager' };
  /**
   * Ein Personen-Blatt der Team-Tabelle lesen (Kopfzeile „Status | Artikel Name | Lagernummer | EK … | Rückerstattung | VK … | Transaktions-ID | … | Mängel | Geschlecht“).
   * Spalten werden über die Kopfzeile erkannt, nicht über feste Positionen.
   */
  function parseSheetRows(values, sheetTitle) {
    const rows = Array.isArray(values) ? values : [];
    const hi = rows.findIndex((r) => r && /^status$/i.test(String(r[0] || '').trim()) && r.some((c) => /artikel/i.test(String(c || ''))));
    if (hi < 0) return [];
    const head = rows[hi].map((c) => String(c || '').toLowerCase());
    const col = (re) => head.findIndex((h) => re.test(h));
    const C = { status: 0, title: col(/artikel/), stock: col(/lager/), ek: col(/^ek|einkauf/), refund: col(/rückerst|rueckerst/), vk: col(/^vk|verkauf/), tx: col(/transak/), defects: col(/mängel|maengel/), gender: col(/geschlecht/) };
    const ownerM = String(sheetTitle || '').match(/^\s*\[([^\]]+)\]\s*(.*)$/);
    const owner = ownerM ? (ownerM[2] || ownerM[1]).trim() : String(sheetTitle || '').trim();
    const get = (r, k) => (C[k] >= 0 ? String(r[C[k]] ?? '').trim() : '');
    const out = [];
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i] || []; const title = get(r, 'title');
      if (!title) continue;
      const rawStatus = get(r, 'status');
      out.push({
        row: i + 1, owner, sheet: sheetTitle, title, stockNo: get(r, 'stock'), rawStatus,
        status: num(get(r, 'vk')) > 0 ? 'Verkauft' : SHEET_STATUS[rawStatus.toLowerCase()] || 'Auf Lager',
        completed: /abgeschlossen/i.test(rawStatus),
        ek: num(get(r, 'ek')), refund: num(get(r, 'refund')), vk: num(get(r, 'vk')),
        txId: /^\d{6,}$/.test(get(r, 'tx')) ? get(r, 'tx') : '', txNote: /^\d{6,}$/.test(get(r, 'tx')) ? '' : get(r, 'tx'),
        defects: get(r, 'defects'), gender: get(r, 'gender'),
      });
    }
    return out;
  }
  /** Kopfzeile eines Personen-Blatts finden → Zeilenindex + Spaltenpositionen */
  function sheetColumns(values) {
    const rows = Array.isArray(values) ? values : [];
    const hi = rows.findIndex((r) => r && /^status$/i.test(String(r[0] || '').trim()) && r.some((c) => /artikel/i.test(String(c || ''))));
    if (hi < 0) return null;
    const head = rows[hi].map((c) => String(c || '').toLowerCase());
    const col = (re) => head.findIndex((h) => re.test(h));
    return { hi, C: { status: 0, title: col(/artikel/), stock: col(/lager/), ek: col(/^ek|einkauf/), refund: col(/rückerst|rueckerst/), vk: col(/^vk|verkauf/), tx: col(/transak/), defects: col(/mängel|maengel/), gender: col(/geschlecht/) } };
  }
  /** Zeilenindex (0-basiert) eines Artikels im Blatt: Lagernummer, sonst Name; −1 = nicht gefunden */
  function sheetFindRow(values, item) {
    const cols = sheetColumns(values); if (!cols) return -1;
    const { hi, C } = cols;
    const cell = (r, k) => (C[k] >= 0 ? String((values[r] || [])[C[k]] ?? '').trim() : '');
    let r = -1;
    if (item.stockNo) r = values.findIndex((x, i) => i > hi && cell(i, 'stock').toUpperCase() === String(item.stockNo).toUpperCase());
    if (r < 0 && item.title) r = values.findIndex((x, i) => i > hi && cell(i, 'title').toLowerCase() === String(item.title).trim().toLowerCase());
    return r;
  }
  /** Zeile leeren (beim Umziehen in das Blatt einer anderen Person); Formelspalten bleiben unberührt */
  function sheetRowClear(values, item) {
    const cols = sheetColumns(values); const r = sheetFindRow(values, item); if (!cols || r < 0) return null;
    const idx = Object.values(cols.C).filter((x) => x >= 0); const maxC = Math.max(...idx);
    const out = new Array(maxC + 1).fill(null); for (const c of idx) out[c] = '';
    return { row: r + 1, range: `A${r + 1}:${colLetter(maxC)}${r + 1}`, values: [out] };
  }
  const colLetter = (i) => { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  /** Status in der Schreibweise der Tabelle („Abgeschlossen“ bleibt erhalten) */
  function sheetStatusOf(item, current) {
    if (item.status === 'Verkauft') return /abgeschlossen/i.test(current || '') || item.shipStatus === 'zugestellt' ? 'Abgeschlossen' : 'Verkauft';
    return item.status || '';
  }
  /**
   * Zeile für einen Artikel finden (Lagernummer, sonst Name) oder die erste freie Zeile nehmen und
   * die zu schreibenden Zellen bestimmen. Leere RELOOP-Werte überschreiben nie etwas in der Tabelle.
   * Rückgabe: { row (1-basiert), isNew, range, values:[[…]] } oder null, wenn nichts zu tun ist.
   */
  function sheetRowWrite(values, item) {
    const cols = sheetColumns(values); if (!cols) return null;
    const { hi, C } = cols; const rows = values;
    const cell = (r, k) => (C[k] >= 0 ? String((rows[r] || [])[C[k]] ?? '').trim() : '');
    let r = sheetFindRow(values, item);
    const isNew = r < 0;
    if (isNew) { r = rows.findIndex((x, i) => i > hi && !cell(i, 'title') && !cell(i, 'status') && !cell(i, 'stock')); if (r < 0) r = Math.max(rows.length, hi + 1); }
    const money = (v) => (Number.isFinite(num(v)) && num(v) > 0 ? r2(num(v)) : null);
    const want = {
      status: sheetStatusOf(item, cell(r, 'status')), title: item.title || '', stock: item.stockNo || '',
      ek: money(item.purchasePrice), refund: money(item.refund), vk: item.status === 'Verkauft' ? money(item.salePrice) : null,
      tx: item.txId || '', defects: (item.defects || []).join(', '), gender: item.gender || '',
    };
    const maxC = Math.max(...Object.values(C).filter((x) => x >= 0));
    const out = new Array(maxC + 1).fill(null); let changed = false;
    for (const [k, v] of Object.entries(want)) {
      if (C[k] < 0 || v === null || v === '') continue;
      const cur = cell(r, k);
      const same = typeof v === 'number' ? Number.isFinite(num(cur)) && r2(num(cur)) === v : cur === v;
      if (!same) { out[C[k]] = v; changed = true; }
    }
    if (!changed) return null;
    return { row: r + 1, isNew, range: `A${r + 1}:${colLetter(maxC)}${r + 1}`, values: [out] };
  }

  /** Eindeutiger Schlüssel einer Tabellenzeile (Lagernummer, sonst Blatt + Name) */
  function sheetKey(row) { return row.stockNo ? 'no:' + row.stockNo.toUpperCase() : 'row:' + row.sheet + ':' + row.title.toLowerCase(); }
  /** Felder, die aus der Tabelle übernommen werden */
  function sheetFields(row) {
    const sold = row.status === 'Verkauft';
    const noDef = /^(keine?( mängel)?|sauber|-|–)$/i.test(row.defects);
    const genderMap = { herren: 'Herren', damen: 'Damen', unisex: 'Unisex', kinder: 'Kinder' };
    const f = {
      status: row.status, stockNo: row.stockNo || '', owner: row.owner, sheetKey: sheetKey(row),
      purchasePrice: Number.isFinite(row.ek) ? row.ek : null,
      refund: Number.isFinite(row.refund) && row.refund > 0 ? row.refund : null,
      salePrice: sold && Number.isFinite(row.vk) ? row.vk : null,
      txId: row.txId || '',
    };
    if (sold) f.shipStatus = row.completed ? 'zugestellt' : 'offen';
    return { f, init: { title: row.title, size: sizeFromTitle(row.title), gender: genderMap[row.gender.toLowerCase()] || row.gender || '', defects: row.defects && !noDef ? [row.defects] : [] } };
  }

  /**
   * Abgleich Tabelle ↔ RELOOP. Die Tabelle ist maßgeblich: je Zeile Status, VK, EK und Rückerstattung;
   * verkaufte RELOOP-Artikel ohne Tabellenzeile zählen nicht. Liefert Abweichungen samt Korrektur.
   */
  function sheetReconcile(rows, items) {
    const money = (v) => (Number.isFinite(v) && v > 0 ? r2(v) : null);
    const byKey = new Map(), byStock = new Map();
    for (const it of items) {
      if (it.sheetKey && !byKey.has(it.sheetKey)) byKey.set(it.sheetKey, it);
      if (it.stockNo) { const k = String(it.stockNo).toUpperCase(); if (!byStock.has(k)) byStock.set(k, []); byStock.get(k).push(it); }
    }
    const used = new Set(); const issues = [];
    const sheet = { revenue: 0, purchase: 0, refund: 0, sold: 0, soldProfit: 0, rows: rows.length };
    for (const row of rows) {
      const sold = row.status === 'Verkauft';
      const vk = money(row.vk), ek = money(row.ek), refund = money(row.refund);
      sheet.revenue += vk || 0; sheet.purchase += ek || 0; sheet.refund += refund || 0; if (sold) { sheet.sold++; sheet.soldProfit += (vk || 0) - (ek || 0) - (refund || 0); }
      let it = byKey.get(sheetKey(row));
      if (it && used.has(it.id)) it = null;
      if (!it && row.stockNo) it = (byStock.get(row.stockNo.toUpperCase()) || []).find((x) => !used.has(x.id) && (!x.sheetKey || x.sheetKey === sheetKey(row)));
      if (!it) { issues.push({ type: 'missing', row, label: row.title, msg: `fehlt in RELOOP (${row.sheet}, Zeile ${row.row})` }); continue; }
      used.add(it.id);
      const patch = {}; const changes = [];
      const set = (k, to, label, from) => { patch[k] = to; if (label) changes.push({ label, from, to }); };
      const appSold = it.status === 'Verkauft';
      if (sold !== appSold) {
        set('status', sold ? 'Verkauft' : row.status, 'Status', it.status);
        if (!sold) Object.assign(patch, { salePrice: null, saleDate: null, saleFees: null, saleShipping: null, shipStatus: null, saleDateSource: null });
        else if (!it.shipStatus) patch.shipStatus = row.completed ? 'zugestellt' : 'offen';
      }
      if (sold && r2(n0(it.salePrice)) !== r2(vk || 0)) set('salePrice', vk, 'Verkaufspreis', it.salePrice);
      if (r2(n0(it.purchasePrice)) !== r2(ek || 0)) set('purchasePrice', ek, 'Einkaufspreis', it.purchasePrice);
      if (r2(n0(it.refund)) !== r2(refund || 0)) set('refund', refund, 'Rückerstattung', it.refund);
      if (sold && (n0(it.saleFees) || n0(it.saleShipping))) { patch.saleFees = 0; patch.saleShipping = 0; changes.push({ label: 'Gebühren/Versand', from: r2(n0(it.saleFees) + n0(it.saleShipping)), to: 0 }); }
      if (!it.sheetKey) patch.sheetKey = sheetKey(row);
      if (changes.length) issues.push({ type: 'diff', itemId: it.id, row, label: row.title, changes, patch, before: soldProfit(it), after: soldProfit({ ...it, ...patch }) });
    }
    for (const it of items) {
      if (used.has(it.id) || it.status !== 'Verkauft') continue;
      const fromMail = !it.sheetKey && !(it.images || []).length && /aus gmail/i.test(it.notes || '');
      issues.push({ type: 'extra', itemId: it.id, label: it.title || it.sku, del: fromMail, before: soldProfit(it), after: 0,
        msg: fromMail ? 'aus Gmail angelegt, steht nicht in der Tabelle' : 'als verkauft markiert, steht aber nicht (verkauft) in der Tabelle' });
    }
    for (const k of ['revenue', 'purchase', 'refund', 'soldProfit']) sheet[k] = r2(sheet[k]);
    sheet.profit = r2(sheet.revenue - sheet.purchase - sheet.refund);
    const soldItems = items.filter((i) => i.status === 'Verkauft');
    const app = { profit: r2(soldItems.reduce((a, i) => a + soldProfit(i), 0)), revenue: r2(soldItems.reduce((a, i) => a + n0(i.salePrice), 0)), sold: soldItems.length,
      unsoldPurchase: r2(items.filter((i) => i.status !== 'Verkauft').reduce((a, i) => a + n0(i.purchasePrice), 0)) };
    app.purchase = r2(items.reduce((a, i) => a + n0(i.purchasePrice), 0)); app.refund = r2(items.reduce((a, i) => a + n0(i.refund), 0));
    app.balance = r2(app.profit - items.filter((i) => i.status !== 'Verkauft').reduce((a, i) => a + n0(i.purchasePrice) + n0(i.refund), 0));
    const delta = r2(issues.reduce((a, x) => a + (x.type === 'missing' ? 0 : n0(x.after) - n0(x.before)), 0));
    return { issues, sheet, app, delta };
  }

  /* ---- Verkaufsdaten aus Vinted-Mails (gekauft / Versandschein / abgeschlossen) ---- */
  function normTitle(t) {
    return String(t || '').toLowerCase().replace(/gr(ö|oe)(ß|ss)e\.?|\bgr\./g, ' ').replace(/[|„“"'()\[\],.:;!?–—-]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function titleSim(a, b) {
    const A = new Set(normTitle(a).split(' ').filter(Boolean)), B = new Set(normTitle(b).split(' ').filter(Boolean));
    if (!A.size || !B.size) return 0;
    let n = 0; for (const x of A) if (B.has(x)) n++;
    return n / Math.max(A.size, B.size);
  }
  /** Eine Vinted-Mail (Betreff + Snippet/Text + Datum) in ein Ereignis übersetzen */
  /** Paketverkauf: Artikeltitel aus Folge-Mails desselben Käufers ("Bestellstatus von …", "Versandschein für …") */
  function bundleHints(buyer, msgs) {
    const b = String(buyer || '').toLowerCase(); if (!b) return [];
    const out = [];
    for (const m of msgs || []) {
      const subject = String(m.subject || ''); const text = htmlToText(m.snippet || m.text || '').toLowerCase();
      if (!text.includes(b)) continue;
      const x = subject.match(/^Bestellstatus von (.+)$/i) || subject.match(/^Versandschein für (.+?)\.\s*Letzter Tag/i);
      if (x && !/^\d+\s+Paket\b/i.test(x[1].trim())) { const t = x[1].trim(); if (!out.includes(t)) out.push(t); }
    }
    return out;
  }
  /** Paketpreis auf die Artikel aufteilen – anteilig nach Angebotspreis, sonst gleichmäßig; Summe bleibt exakt */
  function splitBundlePrice(total, items) {
    const T = Math.round(n0(total) * 100); const n = items.length; if (!n) return [];
    const w = items.map((i) => n0(i && i.listPrice)); const sw = w.reduce((a, b) => a + b, 0);
    const parts = items.map((_, k) => Math.floor(T * (sw > 0 && w.every((x) => x > 0) ? w[k] / sw : 1 / n)));
    let rest = T - parts.reduce((a, b) => a + b, 0); for (let k = 0; rest > 0; k = (k + 1) % n, rest--) parts[k]++;
    return parts.map((c) => c / 100);
  }
  function parseVintedEvent(m) {
    const subject = String(m.subject || ''); const text = htmlToText(m.snippet || m.text || '').replace(/\s+/g, ' ');
    const date = m.date ? isoDate(new Date(m.date)) : null;
    let x;
    if ((x = subject.match(/^Versandschein für (.+?)\.\s*Letzter Tag/i))) return { kind: 'label', title: x[1].trim(), date, mid: m.id };
    if (/Transaktion wurde abgeschlossen/i.test(subject) || /Dein Verkauf von/i.test(text)) {
      const t = text.match(/Dein Verkauf von (.+?) wurde erfolgreich abgeschlossen/i);
      const tx = text.match(/Transaktions-ID:\s*#?(\d{6,})/i);
      const d = text.match(/Datum:\s*(\d{2})\.(\d{2})\.(\d{4})/);
      return t || tx ? { kind: 'done', title: t ? t[1].trim() : '', txId: tx ? tx[1] : '', date: d ? `${d[3]}-${d[2]}-${d[1]}` : date, mid: m.id } : null;
    }
    const sale = parseSaleMail(m.snippet || m.text || '', subject, m.sender || '');
    if (sale && sale.title) return { kind: 'buy', title: sale.title, price: sale.price, buyer: sale.buyer, date, mid: m.id };
    return null;
  }
  /**
   * Verkaufsdatum für verkaufte Artikel ohne Datum finden.
   * Reihenfolge: „gekauft“-Mail (gleicher Titel, passender Preis) → Versandschein → Abschluss-Mail (Transaktions-ID oder Titel).
   */
  function matchSaleDates(items, events) {
    const used = new Set(); const out = [];
    const ev = (events || []).filter(Boolean).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const done = ev.filter((e) => e.kind === 'done'), early = ev.filter((e) => e.kind === 'buy' || e.kind === 'label');
    const todo = (items || []).filter((i) => i.status === 'Verkauft' && !i.saleDate && (i.title || '').trim());
    for (const it of todo) {
      const title = it.title;
      let fin = it.txId ? done.find((e) => e.txId === String(it.txId)) : null;
      if (!fin) fin = done.find((e) => !used.has(e.mid) && e.title && (normTitle(e.title) === normTitle(title) || titleSim(e.title, title) >= 0.85));
      const same = (e) => !used.has(e.mid) && (normTitle(e.title) === normTitle(title) || (fin && fin.title && normTitle(e.title) === normTitle(fin.title)) || titleSim(e.title, title) >= 0.85);
      let cands = early.filter(same);
      if (fin && fin.date) cands = cands.filter((e) => !e.date || e.date <= fin.date);
      const price = n0(it.salePrice);
      const buys = cands.filter((e) => e.kind === 'buy');
      const pick = (fin ? [...buys].reverse() : buys).find((e) => !price || !n0(e.price) || Math.abs(n0(e.price) - price) < 0.01)
        || (fin ? [...cands].reverse() : cands).find((e) => e.kind === 'label');
      if (pick) {
        used.add(pick.mid);
        const label = early.find((e) => e.kind === 'label' && !used.has(e.mid) && normTitle(e.title) === normTitle(pick.title) && e.date >= pick.date);
        if (label && pick.kind === 'buy') used.add(label.mid);
        if (fin) used.add(fin.mid);
        out.push({ id: it.id, saleDate: pick.date, source: pick.kind === 'buy' ? 'gekauft' : 'versandschein', price: pick.kind === 'buy' && n0(pick.price) > 0 ? pick.price : null });
      } else if (fin && fin.date) {
        used.add(fin.mid);
        out.push({ id: it.id, saleDate: fin.date, source: 'abgeschlossen', price: null });
      }
    }
    return out;
  }

  /** Ausgaben-Blätter der Team-Tabelle lesen („Ausgaben Kleidung“: Artikel | Kaufdatum | Wer | Kaufart | Preis | Stk. …; „Ausgaben“: Artikel | Kaufdatum | Grund | Preis | Rechnung) */
  function parseExpenseSheet(values, sheetTitle, owners) {
    const rows = Array.isArray(values) ? values : [];
    const hi = rows.findIndex((r) => r && /^artikel$/i.test(String(r[0] || '').trim()) && r.some((c) => /preis/i.test(String(c || ''))));
    if (hi < 0) return [];
    const head = rows[hi].map((c) => String(c || '').toLowerCase().trim());
    const col = (re) => head.findIndex((h) => re.test(h));
    const C = { name: 0, date: col(/datum/), who: col(/^wer/), kind: col(/kaufart|art$/), reason: col(/grund/), price: head.findIndex((h) => /^preis$/.test(h)) >= 0 ? head.findIndex((h) => /^preis$/.test(h)) : col(/preis/), qty: col(/stk/), link: col(/rechnung|beleg/) };
    const clothing = /kleid|ware/i.test(sheetTitle);
    const get = (r, k) => (C[k] >= 0 ? String(r[C[k]] ?? '').trim() : '');
    const out = [];
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i] || []; const name = get(r, 'name'); const amount = num(get(r, 'price'));
      if (!name || !(amount > 0)) continue;
      const d = get(r, 'date').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      const date = d ? `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}` : '';
      const reason = get(r, 'reason');
      const category = clothing ? 'Ware' : /verpack|karton|versand|lizenz/i.test(reason + ' ' + name) ? 'Verpackung' : /bank|konto|abo|gebühr|software|mitglied/i.test(reason + ' ' + name) ? 'Abos' : /ware|kleid|einkauf/i.test(reason) ? 'Ware' : 'Sonstiges';
      const who = get(r, 'who'); const link = get(r, 'link');
      out.push({
        sheetKey: `exp:${sheetTitle}:${normTitle(name)}:${date}`, row: i + 1, sheet: sheetTitle,
        amount: r2(amount), date, category, note: name.replace(/^\W+\s*/u, '').trim() || name,
        vendor: get(r, 'kind') || reason, qty: num(get(r, 'qty')) > 0 ? num(get(r, 'qty')) : null,
        owner: (owners && owners[who.toUpperCase()]) || who, receiptUrl: /^https?:\/\//.test(link) ? link : '',
        receiptNote: link && !/^https?:\/\//.test(link) ? link : '',
      });
    }
    return out;
  }

  /** Gleiche Ausgabe doppelt? Gleicher Betrag und (Datum ≤ 7 Tage auseinander oder Betrag ≥ 50 €, z. B. Beleg-Foto mit falschem Datum) */
  function sameExpense(a, b) {
    if (!a || !b || a === b || Math.abs(n0(a.amount) - n0(b.amount)) >= 0.01) return false;
    if (a.sheetKey && b.sheetKey) return false; // zwei Tabellenzeilen = zwei echte Käufe
    if (n0(a.amount) >= 50) return true;
    if (!a.date || !b.date) return false;
    return Math.abs(Date.parse(a.date) - Date.parse(b.date)) <= 7 * 864e5;
  }
  /** Mögliche Duplikate: [{ keep, drop }] – behalten wird der Eintrag mit Beleg */
  function expenseDupes(list) {
    const out = []; const used = new Set();
    const L = (list || []).filter(Boolean);
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j];
      if (used.has(a.id) || used.has(b.id) || !sameExpense(a, b)) continue;
      if ((a.dupIgnore || []).includes(b.id) || (b.dupIgnore || []).includes(a.id)) continue;
      const keepA = a.receipt && !b.receipt ? true : b.receipt && !a.receipt ? false : !!a.sheetKey || !b.sheetKey;
      out.push(keepA ? { keep: a, drop: b } : { keep: b, drop: a }); used.add(a.id); used.add(b.id);
    }
    return out;
  }

  function newSku(now) {
    const d = now ? new Date(now) : new Date();
    const z = (n) => String(n).padStart(2, '0');
    const rnd = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `RL-${String(d.getFullYear()).slice(2)}${z(d.getMonth() + 1)}${z(d.getDate())}-${rnd}`;
  }

  function fmtEUR(v) {
    const n = num(v);
    if (!Number.isFinite(n)) return '–';
    return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  }

  return {
    STATUSES, CHANNELS, CONDITIONS, GENDERS, CATEGORIES, SHIP_STATES, EXPENSE_CATS, expenseCat, DEFAULT_SETTINGS,
    num, n0, r2, mergeSettings, platformFee, sellerShipping, calcProfit, maxBuyPrice, soldProfit,
    roundPrice, roundPriceUp, counterOffer, daysBetween, today, isoDate, dueDrops, relistCandidates,
    kpis, PERIODS, periodRange, seriesRange, periodSum, inRange, expensesCSV, parseReceiptText, htmlToText, parseSaleMail, matchScore, bestMatches, missingFields, splitCost, monthly, series, periodTotals, groupSold, toCSV, templateListing, injectMeasurements, spaceAfterCondition, templateVals, fillTemplate, PLACEHOLDERS, DEFAULT_TEMPLATES, toHashtags, finalizeVinted, newSku, fmtEUR, itemCode, nextStockNo, sizeFromTitle, parseSheetRows, sheetKey, sheetFields, sheetReconcile, sheetColumns, sheetRowWrite, sheetStatusOf, sheetFindRow, sheetRowClear, vintedAccounts, forAccount, normTitle, titleSim, parseVintedEvent, matchSaleDates, bundleHints, splitBundlePrice, parseExpenseSheet, opexAmt, sameExpense, expenseDupes,
  };
});
