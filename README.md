# BabyMonitor

Eine private Web-App, um die ersten Jahre festzuhalten: Flasche, Windeln, Schlaf und
Wachstum eintragen, und auf einem Zeitstrahl sehen, was als nächstes ansteht —
Entwicklungssprünge, U-Untersuchungen, Impftermine. Dazu ein Foto pro Lebenswoche,
das den Zeitstrahl zum Album macht.

Gebaut für zwei Eltern, zwei Handys und den Bedienmoment, der wirklich zählt: **drei
Uhr nachts, ein Arm frei.** Daraus folgt fast alles andere.

---

## Was die App kann

| | |
|---|---|
| **Heute** | Wie lange die letzte Flasche her ist, groß und lesbar. Ein Tap für die Flasche (Menge auf den Median der letzten sieben Mahlzeiten vorbelegt), ein Tap für die Windel, ein Tap für den Schlaf. Jede Aktion mit Rückgängig-Möglichkeit. |
| **Wochenband** | Waagrechter Zeitstrahl über 80 Lebenswochen, beim Öffnen auf die aktuelle Woche gescrollt. Die Wochenfotos sitzen auf der Achse. Dazu Sprung-Bänder, U-Termine, Impfungen und eine „Demnächst“-Liste. |
| **Kurven** | Trinkmenge pro Tag mit gleitendem Wochenmittel, Mahlzeiten-Rhythmus über Tageszeit, Windel-Raster nach Stunde, Wachstum gegen die WHO-Perzentile. |
| **Verlauf** | Alles nach Tagen gruppiert, mit Tagessumme. Nachtragen für jede Eintragsart mit frei wählbarem Zeitpunkt. |
| **Einstellungen** | Kind-Stammdaten, Darstellung, Zeitraffer-Export der Wochenfotos als MP4. |

**Offline benutzbar.** Jede Eingabe geht zuerst in die lokale Datenbank des Geräts und
erscheint sofort. Der Abgleich läuft im Hintergrund. Ein Neustart des Pi, ein Funkloch
im Kinderzimmer oder ein hängender Tunnel halten die Eingabe nie auf.

**Nachts warm und gedämpft.** Zwischen 20 und 7 Uhr schaltet die App selbstständig auf
ein bernsteinfarbenes, kontrastreduziertes Erscheinungsbild. Das ist keine Spielerei:
blaues Licht zu dieser Uhrzeit macht das Wiedereinschlafen messbar schwerer. In den
Einstellungen fest auf hell oder dunkel stellbar.

---

## Technik

- **Frontend** — Vue 3 + TypeScript + Vite, Komponenten aus [sit-onyx](https://onyx.schwarz),
  auf Token-Ebene warm umgestimmt. PWA mit Service Worker, IndexedDB (Dexie) als
  lokaler Speicher.
- **Backend** — Node 24 + Fastify. Kein Build-Schritt: Node strippt die Typen beim
  Laden, im Container läuft derselbe Quelltext wie lokal.
- **Datenbank** — SQLite (WAL). Eine Datei, Sicherung per `sqlite3 .backup`.
- **Gemeinsam** — `shared/` hält das Zod-Schema, das Client und Server benutzen, sowie
  die Zeitlogik.

### Warum eine Tabelle für alle Eintragsarten

`entries` hält Flasche, Windel, Schlaf, Wachstum, Meilenstein, Notiz und Foto,
unterschieden über `type`. Der Grund ist der Abgleich: ein Endpoint, ein Cursor. Eine
neue Eintragsart ist später eine reine Frontend-Änderung.

Zwei Details, die leicht übersehen werden:

- **Löschen heißt markieren.** Ohne Soft-Delete erfährt das zweite Handy nie von einer
  Löschung und schiebt den Eintrag beim nächsten Abgleich wieder hoch.
- **Der Cursor ist eine Sequenz, kein Zeitstempel.** Zwei Schreibvorgänge in derselben
  Millisekunde würden bei einem Zeitstempel-Cursor einen Eintrag verschlucken.

### Zeitzonen

Alles wird als UTC gespeichert und in `Europe/Berlin` dargestellt. Jede Tagesgrenze und
jede Uhrzeit läuft über `shared/src/time.ts` mit fester Zone — **nie** über
`getTime() / 86400000`. Am 25.10. hat der Tag 25 Stunden; wer in Epoch-Millisekunden
rechnet, verschiebt genau die Nachtmahlzeiten, deren Verlauf hier interessiert.

---

## Auf dem Raspberry Pi in Betrieb nehmen

### 1. Geheimnisse anlegen

```bash
cp .env.example .env
sed -i "s|^HOUSEHOLD_SECRET=.*|HOUSEHOLD_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^COOKIE_SECRET=.*|COOKIE_SECRET=$(openssl rand -hex 32)|" .env
```

### 2. Starten

```bash
docker compose up -d --build
curl http://127.0.0.1:8090/api/health   # -> {"ok":true,...}
```

Drei Container: `babymonitor-api`, `babymonitor-web` (nginx) und `babymonitor-backup`.

### 3. An den bestehenden Cloudflare-Tunnel hängen

**Es wird kein neuer Tunnel gebraucht.** Der laufende `cloudflared-tunnel`-Container
hängt bereits im externen Netz `cloudflare_proxy`, und `babymonitor-web` tut das
ebenfalls — er ist dort über seinen Containernamen erreichbar, genau wie Baserow.

Im Cloudflare-Dashboard unter *Zero Trust → Networks → Tunnels → dein Tunnel →
Public Hostname* eintragen:

| Feld | Wert |
|---|---|
| Subdomain | `baby` |
| Domain | deine Domain |
| Service | `HTTP` → `babymonitor-web:80` |

### 4. Die Handys anmelden

Einmal pro Gerät diesen Link öffnen:

```
https://baby.<deine-domain>/start?t=<HOUSEHOLD_SECRET>
```

Namen wählen (Mama/Papa), fertig. Das Cookie hält ein Jahr — danach kommt nie wieder
ein Anmeldebildschirm, auch nicht offline. Anschließend über das Browsermenü **zum
Startbildschirm hinzufügen**; erst dann läuft die App im Vollbild und startet schnell
genug für den nächtlichen Gebrauch.

> Wer den Link hat, kommt hinein. Für eine Familien-App auf einer Adresse, die
> niemand kennt, ist das der bewusste Tausch gegen null Anmelde-Reibung. Wer mehr
> will, kann Cloudflare Access davorschalten.

### Sicherungen

Der `backup`-Container legt jede Nacht eine Kopie unter `backups/` an und hält
30 Tage vor. `sqlite3 .backup` statt `cp`: Eine laufende Datenbank zu kopieren erzeugt
bei aktivem WAL eine Datei, die beim Wiederherstellen inkonsistent sein kann.

Die Dateien gehören dem Besitzer des Datenordners und haben Rechte `600` — es sind
Gesundheitsdaten eines Kindes und gehen andere Nutzer auf dem Gerät nichts an.

Wiederherstellen — **dieser Weg ist einmal vollständig durchgespielt worden**
(Datenbank gelöscht, aus der Sicherung zurückgeholt, Datensatz war vollständig da):

```bash
docker compose stop api
gunzip -c backups/babymonitor-JJJJMMTT.db.gz > data/babymonitor.db
rm -f data/babymonitor.db-wal data/babymonitor.db-shm
docker compose start api
```

Die Fotos liegen unter `data/media/` und gehören in eine eigene Sicherung — die sind
in der Datenbank absichtlich nicht enthalten, damit sie klein bleibt.

---

## Entwicklung

```bash
npm install

# Backend (Port 3010)
cd api && HOUSEHOLD_SECRET=... COOKIE_SECRET=... COOKIE_SECURE=false \
  node --experimental-strip-types --watch src/server.ts

# Frontend (Port 5173, /api wird auf 3010 weitergereicht)
npm run dev --workspace=web
```

```bash
npm test                    # alle Testreihen
npm run build --workspace=web
```

`tools/` enthält einen Generator für realistische Testdaten, einen
Bildschirmfoto-Durchlauf und die Offline-Abgleich-Prüfung — siehe
[tools/README.md](tools/README.md).

---

## Datenherkunft

- **Entwicklungssprünge** — Sprungwochen nach dem Modell „Oje, ich wachse!“, gezählt ab
  dem **errechneten Geburtstermin**. Die Wochenzahlen sind Fakten und frei verwendbar;
  die Beschreibungen in `web/src/data/leaps.ts` sind eigene Formulierungen. Das Modell
  ist unter Eltern verbreitet, wissenschaftlich aber umstritten — die App sagt das dazu.
- **U-Untersuchungen** — G-BA Kinder-Richtlinie / Kinderuntersuchungsheft.
- **Impfungen** — [STIKO-Impfkalender 2026](https://www.rki.de/DE/Themen/Infektionskrankheiten/Impfen/Staendige-Impfkommission/Empfehlungen-der-STIKO/Empfehlungen/Impfkalender.html),
  Epid. Bull. 4/2026. **Wird jährlich neu herausgegeben** — beim Aktualisieren die
  Tabelle erneut aus dem Original übertragen, nicht aus dem Gedächtnis pflegen.
- **Wachstumskurven** — [WHO Child Growth Standards](https://www.who.int/tools/child-growth-standards/standards),
  LMS-Parameter aus den „expanded tables“, umgewandelt mit `tools/build-who-tables.py`.

Alles davon ersetzt keine ärztliche Beratung, und die App sagt das auch dort, wo es
angezeigt wird.
