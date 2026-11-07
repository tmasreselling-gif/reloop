/* RELOOP – Prompts & Validierung der KI-Antworten */
(function () {
  'use strict';
  const RL = window.RL;
  const AI = {};
  const J = (o) => JSON.stringify(o);

  const STYLE = {
    freundlich: 'freundlich, locker und persönlich, duzen',
    sachlich: 'sachlich, knapp und professionell, duzen',
    herzlich: 'sehr herzlich und warm, duzen, mit 1–2 passenden Emojis',
    kurz: 'extrem kurz und direkt, duzen',
  };
  AI.styleText = (s) => (STYLE[s.writingStyle] || STYLE.freundlich) + (s.styleNotes ? `. Zusätzliche Stilwünsche: ${s.styleNotes}` : '');

  /** Nur die für Texte relevanten Felder */
  AI.itemFacts = (it) => {
    const o = {};
    for (const k of ['brand', 'productType', 'category', 'gender', 'size', 'color', 'colors', 'material', 'fit', 'pattern', 'condition', 'features', 'defects', 'labelText'])
      if (it[k] !== undefined && it[k] !== '' && !(Array.isArray(it[k]) && !it[k].length)) o[k] = it[k];
    const m = it.measurements || {};
    const mm = {};
    for (const k of ['length', 'chest', 'shoulder']) if (RL.n0(m[k]) > 0) mm[k + '_cm'] = RL.n0(m[k]);
    if (Object.keys(mm).length) { o.measurements = mm; if ((it.aiFields || []).includes('measurements') && /geschätzt/.test(it.measurementsSource || '')) o.measurements_hinweis = 'nur geschätzt – in Texten mit "ca." angeben'; }
    return o;
  };

  AI.analysisPrompt = (hints, count) => `Du bist Experte für Secondhand-Mode und hilfst einem Reseller in Deutschland. Analysiere die ${count} beigefügten Foto(s) EINES Kleidungsstücks/Artikels.

Regeln:
- Erfinde nichts. Wenn etwas nicht sicher erkennbar ist, gib "" bzw. [] zurück und setze die Konfidenz niedrig.
- Marke nur angeben, wenn Logo, Etikett oder eindeutige Designmerkmale sie zeigen. Größe/Material nur von einem sichtbaren Etikett als "Etikett", sonst "geschätzt" oder "unbekannt".
- Echtheit: Du kannst Echtheit NICHT garantieren. Nenne nur konkrete, auf den Fotos sichtbare Auffälligkeiten (z. B. Logo-Stickerei, Etikett-Druck, Nähte) oder "nicht beurteilbar", wenn die Fotos nicht reichen.
- Gebrauchsspuren (Flecken, Pilling, Löcher, Verfärbung, Ausbleichen) nur nennen, wenn sichtbar.
- Antworte auf Deutsch.
${hints ? `\nHinweise des Nutzers: ${hints}\n` : ''}
Antworte NUR mit einem JSON-Objekt in genau dieser Form:
{"brand":"","brandEvidence":"Logo|Etikett|Designmerkmale|keine","productType":"z. B. Polo Shirt","category":"eine aus ${J(RL.CATEGORIES)}","gender":"eine aus ${J(RL.GENDERS)} oder \\"\\"","size":"","sizeSource":"Etikett|geschätzt|unbekannt","color":"Hauptfarbe","colors":["weitere Farben"],"material":"","materialSource":"Etikett|geschätzt|unbekannt","fit":"Schnitt, z. B. Regular Fit","pattern":"z. B. unifarben, gestreift","features":["auffällige Merkmale, max. 6"],"defects":["sichtbare Gebrauchsspuren"],"condition":"eine aus ${J(RL.CONDITIONS)}","labelText":"lesbarer Etikett-Text oder \\"\\"","authenticity":{"assessment":"keine Auffälligkeiten erkennbar|Auffälligkeiten erkennbar|nicht beurteilbar","signals":["konkrete Beobachtungen"],"note":"kurzer Hinweis"},"confidence":{"brand":0.0,"category":0.0,"size":0.0,"color":0.0,"material":0.0},"missingPhotos":["Fotos, die die Analyse verbessern würden, z. B. Etikett innen"],"summary":"ein Satz"}`;

  const pick = (v, list, fb = '') => {
    if (!v) return fb;
    const s = String(v).trim();
    const hit = list.find((x) => x.toLowerCase() === s.toLowerCase());
    return hit || fb;
  };
  const str = (v) => (typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v).trim());
  const arr = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, 10) : []);
  const conf = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; };

  function normMeas(m) {
    m = m && typeof m === 'object' ? m : {};
    const v = (x) => { const n = RL.num(x); return Number.isFinite(n) && n > 5 && n < 250 ? Math.round(n * 2) / 2 : 0; };
    const g = (...ks) => { for (const k of ks) { const x = v(m[k]); if (x) return x; } return 0; };
    const out = { length: g('length_cm', 'length', 'laenge_cm', 'länge_cm'), chest: g('chest_cm', 'chest', 'brustweite_cm', 'pit_to_pit_cm'), shoulder: g('shoulder_cm', 'shoulder') };
    const src = str(m.source);
    const any = Object.values(out).some((x) => x > 0);
    return { values: out, source: any ? (/maßband|massband|lineal/i.test(src) ? 'Maßband im Foto' : 'aus Größe geschätzt') : 'unbekannt', note: [str(m.readings), str(m.note)].filter(Boolean).join(' · '), confidence: str(m.confidence) };
  }
  AI.normMeas = normMeas;
  AI.normalizeAnalysis = (j) => {
    if (!j || typeof j !== 'object') throw new Error('Leere KI-Antwort');
    const a = j.authenticity || {};
    const c = j.confidence || {};
    const cat = pick(j.category, RL.CATEGORIES, '');
    return {
      brand: str(j.brand), brandEvidence: str(j.brandEvidence), productType: str(j.productType),
      category: cat || (str(j.category) ? 'Sonstiges' : ''), gender: pick(j.gender, RL.GENDERS, ''),
      size: str(j.size), sizeSource: str(j.sizeSource), color: str(j.color), colors: arr(j.colors),
      material: str(j.material), materialSource: str(j.materialSource), fit: str(j.fit), pattern: str(j.pattern),
      features: arr(j.features), defects: arr(j.defects), condition: pick(j.condition, RL.CONDITIONS, ''),
      labelText: str(j.labelText),
      authenticity: {
        assessment: ['keine Auffälligkeiten erkennbar', 'Auffälligkeiten erkennbar', 'nicht beurteilbar'].includes(str(a.assessment)) ? str(a.assessment) : 'nicht beurteilbar',
        signals: arr(a.signals), note: str(a.note),
      },
      confidence: { brand: conf(c.brand), category: conf(c.category), size: conf(c.size), color: conf(c.color), material: conf(c.material) },
      missingPhotos: arr(j.missingPhotos), summary: str(j.summary),
    };
  };

  AI.measurePrompt = (it, count) => `Du misst Kleidung für eine Verkaufsanzeige. Ermittle die Maße (in cm, flach liegend gemessen) des Kleidungsstücks auf den ${count} Foto(s). Genauigkeit ist wichtig – lieber ehrlich "unsicher" als falsch.
Bekannte Daten: ${J({ marke: it.brand, typ: it.productType || it.category, kategorie: it.category, groesse: it.size, zielgruppe: it.gender, schnitt: it.fit })}
Gesucht (nur diese drei):
- length_cm: Gesamtlänge – Oberteile von der höchsten Stelle der Schulter (am Kragen) senkrecht bis zum Saum; Hosen/Röcke: Außenlänge vom Bund bis Saum.
- chest_cm: Brustweite flach – von Achselnaht zu Achselnaht, gerade quer (bei Hosen: 0).
- shoulder_cm: Schulterbreite – von Schulternaht zu Schulternaht (bei Hosen: 0).
Vorgehen:
1. Suche in JEDEM Foto ein Maßband oder Lineal. Wenn vorhanden: lies die Zahlen an Start- und Endpunkt der jeweiligen Strecke ab und rechne die Differenz. Beschreibe deine Ablesung kurz in "readings" (z. B. "Brust: Band von 0 bis 56"). Nur Werte, die tatsächlich am Band ablesbar sind → source "Maßband im Foto". Nicht ablesbare Strecken = 0.
2. Kein Maßband: schätze typische Werte für genau diese Größe, Marke und diesen Schnitt nach üblichen Größentabellen → source "aus Größe geschätzt" (bei bekannter Größe IMMER Werte angeben).
3. Weder Maßband noch Größe: alle 0, source "unbekannt".
Antworte NUR mit JSON: {"length_cm":0,"chest_cm":0,"shoulder_cm":0,"source":"Maßband im Foto|aus Größe geschätzt|unbekannt","readings":"","confidence":"hoch|mittel|niedrig","note":"kurzer Hinweis"}`;

  AI.pricePrompt = (it, monthName) => `Du bist Preis-Experte für Secondhand-Mode in Deutschland (Vinted, Kleinanzeigen, eBay).
Schätze realistische Verkaufspreise in EUR für diesen Artikel:
${J(AI.itemFacts(it))}
Aktueller Monat: ${monthName}. Berücksichtige Marke, Kategorie, Zustand, typische Nachfrage und Saison.
WICHTIG: Du hast KEINEN Zugriff auf Live-Marktdaten oder aktuelle Vergleichsangebote. Gib eine vorsichtige Schätzung auf Basis deines allgemeinen Wissens und kennzeichne die Unsicherheit ehrlich. Wenn Marke oder Zustand unbekannt sind, senke die Konfidenz.

Antworte NUR mit JSON:
{"quick":{"price":0,"days":"z. B. 1–5 Tage"},"market":{"price":0,"days":"z. B. 1–3 Wochen"},"high":{"price":0,"days":"z. B. 3–8 Wochen"},"demand":"niedrig|mittel|hoch","season":"kurzer Saison-Hinweis","factors":["max. 4 preisbestimmende Faktoren"],"rationale":"2–3 Sätze Begründung","confidence":"niedrig|mittel|hoch"}`;

  AI.normalizePrice = (j) => {
    const p = (o) => Math.max(0, RL.r2(RL.n0(o && o.price)));
    const out = {
      quick: { price: p(j.quick), days: str(j.quick && j.quick.days) },
      market: { price: p(j.market), days: str(j.market && j.market.days) },
      high: { price: p(j.high), days: str(j.high && j.high.days) },
      demand: ['niedrig', 'mittel', 'hoch'].includes(str(j.demand)) ? str(j.demand) : 'mittel',
      season: str(j.season), factors: arr(j.factors), rationale: str(j.rationale),
      confidence: ['niedrig', 'mittel', 'hoch'].includes(str(j.confidence)) ? str(j.confidence) : 'niedrig',
    };
    if (!(out.market.price > 0)) throw new Error('Die KI hat keinen gültigen Preis geliefert.');
    // Reihenfolge sicherstellen
    const ps = [out.quick.price || out.market.price * 0.8, out.market.price, out.high.price || out.market.price * 1.25].sort((a, b) => a - b);
    out.quick.price = RL.roundPrice(ps[0]); out.market.price = RL.roundPrice(ps[1]); out.high.price = RL.roundPrice(ps[2]);
    return out;
  };

  const PLATFORM_RULES = {
    Vinted: (s) => `Plattform: Vinted. Titel kurz und suchstark (Marke + Produkttyp + Farbe + Größe, max. 60 Zeichen). Beschreibung in Abschnitten${s.useEmojis !== false ? ' mit Emoji-Überschriften, z. B. "👕 GRÖSSE – L", "📐 MASSE", "✨ DETAILS" (Aufzählung mit "- "), "🚚 VERSAND:"' : ' ohne Emojis, mit Großbuchstaben-Überschriften'}. Versand-Abschnitt: schneller Versand möglich, bei Fragen melden. KEINE Hashtags in die Beschreibung schreiben – die App hängt aus den Suchbegriffen automatisch passende #Hashtags an.`,
    Kleinanzeigen: () => 'Plattform: Kleinanzeigen. Titel prägnant (max. 65 Zeichen). Beschreibung als kurzer Fließtext plus Aufzählung (•). Erwähne "Versand oder Abholung möglich" und am Ende "Privatverkauf, daher keine Garantie, Gewährleistung oder Rücknahme."',
    eBay: () => 'Plattform: eBay. Titel maximal 80 Zeichen, keyword-stark (Marke, Geschlecht, Produkttyp, Schnitt, Farbe, Material, Größe, Zustand). Beschreibung strukturiert mit Abschnitten "Artikeldetails", "Maße", "Zustand", "Versand". Ende: "Privatverkauf, daher keine Garantie, Gewährleistung oder Rücknahme."',
  };

  AI.listingPrompt = (it, platform, s, price) => {
    const tpl = s.templates && String(s.templates[platform] || '').trim();
    const pre = tpl ? RL.templateListing(it, platform, s).description : '';
    const rules = tpl ? `Plattform: ${platform}. Der Nutzer hat eine EIGENE VORLAGE für die Beschreibung festgelegt. Halte dich exakt an ihren Aufbau, ihre Überschriften, Emojis und Reihenfolge und übernimm alle festen Texte WÖRTLICH. Hier ist die bereits mit den Daten gefüllte Vorlage:
<<<
${pre}
>>>
Du darfst nur die Stichpunkte unter Details/Merkmale sprachlich verbessern oder um Fakten aus den Artikeldaten ergänzen. Nichts entfernen, keine neuen Abschnitte, keine Hashtags hinzufügen. Titel: ${platform === 'eBay' ? 'max. 80 Zeichen, keyword-stark' : 'kurz und suchstark (Marke + Typ + Farbe + Größe)'}.` : PLATFORM_RULES[platform](s);
    return `Erstelle eine verkaufsoptimierte Anzeige auf Deutsch für diesen Artikel.
Artikeldaten (einzige Faktenquelle): ${J(AI.itemFacts(it))}
${price ? `Preis: ${price} €\n` : ''}${rules}
Schreibstil: ${AI.styleText(s)}.
Regeln: Verwende NUR die Fakten aus den Artikeldaten. Erfinde keine Maße, Materialien, Neupreise oder Echtheitsgarantien. Nenne vorhandene Mängel ehrlich. Gib Maße nur an, wenn sie in den Daten stehen.${s.signature ? ` Schließe mit: "${s.signature}"` : ''}
Antworte NUR mit JSON: {"title":"","description":"","tags":["8–12 passende Suchbegriffe, kleingeschrieben (Marke, Produkttyp, Stil, Farbe, Zielgruppe – keine Größen)"],"category":"vorgeschlagene Plattform-Kategorie"}`;
  };

  AI.normalizeListing = (j, platform, s, code) => {
    let title = str(j.title);
    if (platform === 'eBay' && title.length > 80) title = title.slice(0, 80).replace(/\s+\S*$/, '');
    const description = str(j.description);
    if (!title || !description) throw new Error('Die KI hat keinen vollständigen Anzeigentext geliefert.');
    const tags = arr(j.tags).map((t) => t.replace(/^#/, '').toLowerCase()).slice(0, 15);
    const d2 = RL.spaceAfterCondition(description);
    return { title, description: platform === 'Vinted' && s ? RL.finalizeVinted(d2, tags, s, code) : d2, tags, category: str(j.category) };
  };

  AI.replyPrompt = ({ message, it, s, nego }) => `Du hilfst einem privaten Verkäufer auf ${it && it.channel ? it.channel : 'Vinted'}, auf eine Käufernachricht zu antworten.
Käufernachricht: """${message}"""
${it ? `Artikel: ${J({ titel: it.title || [it.brand, it.productType].filter(Boolean).join(' '), preis_eur: it.listPrice, ...AI.itemFacts(it) })}` : 'Kein Artikel zugeordnet.'}
${nego ? `Preisverhandlung (bereits berechnet, verbindlich): ${nego.decision === 'annehmen' ? `Das Gebot von ${nego.offer} € kann angenommen werden.` : `Biete ${nego.counter} € als Gegenangebot an.`} Nenne KEINEN anderen Preis und verrate niemals einen Mindestpreis.` : 'Nenne keinen neuen Preis, außer der Käufer fragt danach – dann verweise freundlich auf den Angebotspreis.'}
Schreibstil: ${AI.styleText(s)}.
Regeln: Beantworte nur, was aus den Artikeldaten hervorgeht; wenn eine Info fehlt (z. B. Maße), schreibe, dass du nachmisst/nachsiehst. Keine Echtheitsgarantien. Keine Kontaktdaten oder Zahlung außerhalb der Plattform vorschlagen.
Antworte NUR mit dem fertigen Nachrichtentext (max. 600 Zeichen), ohne Anführungszeichen.${s.signature ? ` Signatur: ${s.signature}` : ''}`;

  AI.favPrompt = ({ it, s, price, discountPct }) => `Schreibe eine kurze, nicht aufdringliche Nachricht auf Deutsch an eine Person, die diesen Artikel favorisiert hat: ${J({ titel: it.title || [it.brand, it.productType].filter(Boolean).join(' '), groesse: it.size, zustand: it.condition })}.
Angebot: ${discountPct ? `${discountPct} % Rabatt, neuer Preis ${price} €` : `Preis ${price} €`}. Kein Druck, keine falschen Knappheits-Behauptungen.
Schreibstil: ${AI.styleText(s)}. Max. 300 Zeichen. Antworte NUR mit dem Nachrichtentext.`;

  AI.chatRules = (data, s) => `Du bist der Shop-Assistent in RELOOP, einer Reselling-App. Du beantwortest Fragen des Shop-Inhabers zu seinem Inventar und seinen Verkäufen auf Deutsch.
Heute ist ${RL.today()}. Beträge in EUR.
Nutze ausschließlich die folgenden echten Daten aus der Datenbank. Wenn etwas nicht in den Daten steht, sag das ehrlich.
Änderungen (Preise, Status) führst du NIE direkt aus: nutze dafür die Werkzeuge propose_price_change bzw. propose_status_change – der Nutzer bestätigt sie danach selbst. Schlage nie einen Preis unter dem Mindestpreis (minPrice) vor.
Antworte kompakt, gern mit kurzen Listen. Wenn du Texte (z. B. Beschreibungen) erstellen sollst, erfinde keine Fakten.
Schreibstil-Einstellung des Nutzers: ${AI.styleText(s)}.

KENNZAHLEN: ${J(data.kpis)}
EINSTELLUNGEN: ${J({ zielmarge_prozent: s.targetMargin, relist_nach_tagen: s.relistDays, preissenkung: `${s.dropPct}% alle ${s.dropDays} Tage` })}
ARTIKEL (${data.items.length}${data.truncated ? ', gekürzt' : ''}; Felder: id, sku, titel, marke, kat, groesse, zustand, status, ek=Einkauf, preis=Angebotspreis, min=Mindestpreis, vk=Verkaufspreis, vkDatum, gewinn, onlineTage, lagerTage, kanal):
${data.items.map((r) => J(r)).join('\n')}`;

  window.AI = AI;
})();
