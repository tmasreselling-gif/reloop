# RELOOP – Reselling-Studio (eigenständige Website)

Läuft komplett im Browser, ohne Claude-Konto und ohne Server:

- **Daten & Fotos** liegen lokal im Browser (IndexedDB) auf dem jeweiligen Gerät.
- **Freistellen** (U²-Net) läuft im Browser.
- **Gmail & Google Sheets** über deinen eigenen Google-Login (optional).
- Keine KI-Funktionen.

## Auf GitHub Pages veröffentlichen

1. Auf github.com ein neues Repository anlegen, z. B. `reloop` (öffentlich – GitHub Pages ist im Gratis-Tarif nur für öffentliche Repos verfügbar).
2. Im Repo **Add file → Upload files** und den *Inhalt* dieses Ordners hineinziehen (inkl. der Ordner `lib`, `models`, `ort`). Commit.
3. **Settings → Pages**: Source „Deploy from a branch“, Branch `main`, Ordner `/ (root)` → Save.
4. Nach 1–2 Minuten ist die Seite unter `https://<dein-name>.github.io/reloop/` erreichbar.

Hinweis: Im Repo liegt nur der Programmcode – deine Artikel, Fotos und Google-Zugänge landen nie auf GitHub.

## Alte Daten aus der Claude-Version übernehmen

1. Alte Version (in claude.ai) öffnen → Einstellungen → Daten & Datenschutz → **Komplett-Backup inkl. Fotos**.
2. Neue Website öffnen → Einstellungen → Daten & Datenschutz → **Backup importieren** → Datei wählen.

## Google (Gmail & Sheets) einrichten

Die Schritt-für-Schritt-Anleitung steht in der App unter **Einstellungen → Google**.
Kurz: Google-Cloud-Projekt anlegen, Gmail API + Sheets API aktivieren, OAuth-Zustimmungsbildschirm (Extern, Testmodus, dich als Testnutzer), OAuth-Client „Webanwendung“ mit `https://<dein-name>.github.io` als JavaScript-Quelle. Client-ID in RELOOP eintragen – oder fest in `config.js`.

## Wichtig

- Die Daten gehören zum Browser + Gerät. Anderer Browser / anderes Handy = leere App → per Backup umziehen.
- Regelmäßig **Komplett-Backup** machen – Browser-Daten löschen entfernt auch RELOOP-Daten.
