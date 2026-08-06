# Milo

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
| **Verlauf** | Ein Tag auf einmal, gewählt über Woche und Wochentag. Die Tagesleiste zeigt Trinkmenge und Windelzahl aller sieben Tage auf einen Blick. Nachtragen für jede Eintragsart mit frei wählbarem Zeitpunkt — auf dem angezeigten Tag vorbelegt. |
| **Was wir kaufen** | Milchnahrung, Windelgröße und Sonstiges — jeweils der aktuelle Stand groß, mit Foto der Verpackung fürs Regal, darunter zugeklappt die Wechsel-Historie mit Zeitraum und Dauer. |
| **Einstellungen** | Kind-Stammdaten, Darstellung, Wetterort, Zeitraffer-Export der Wochenfotos als MP4, Benachrichtigungen. |

**Offline benutzbar.** Jede Eingabe geht zuerst in die lokale Datenbank des Geräts und
erscheint sofort. Der Abgleich läuft im Hintergrund. Ein Neustart des Pi, ein Funkloch
im Kinderzimmer oder ein hängender Tunnel halten die Eingabe nie auf.

**Erinnerung ans Fläschchen.** Auf Wunsch meldet sich das Handy, wenn die nächste
Flasche fällig sein könnte — geschätzt aus dem eigenen Rhythmus des Kindes (Median der
letzten Abstände), nicht aus einer Tabelle. Vorlaufzeit und Ruhezeit hängen am
jeweiligen Gerät: Wer nachts ohnehin wach ist, will die Erinnerung auch nachts; wer
daneben schläft, ganz sicher nicht.

> **Auf iPhone und iPad geht Web Push nur, wenn die App auf dem Home-Bildschirm
> liegt** (ab iOS 16.4) — in Safari selbst nicht. Auf Android funktioniert beides.
> Ohne hinterlegte VAPID-Schlüssel ist der Bereich schlicht ausgeblendet.

**Ein Wechsel ist ein neuer Eintrag, keine Änderung.** Bei Milchnahrung und
Windelgröße entsteht die Historie aus der Kette der Einträge: Jeder Stand gilt, bis der
nächste beginnt. Deshalb sind „Gewechselt" und „Angaben korrigieren" getrennte
Schaltflächen — wer beides vermischt, verliert genau die Information, für die man später
zurückschaut. Wenn etwas nicht bekommt, ist die Frage „was kam wann dazu", und eine
überschriebene Zeile beantwortet sie nie.

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

Drei Container: `milo-api`, `milo-web` (nginx) und `milo-backup`.

### 3. An den bestehenden Cloudflare-Tunnel hängen

**Es wird kein neuer Tunnel gebraucht.** Der laufende `cloudflared-tunnel`-Container
hängt bereits im externen Netz `cloudflare_proxy`, und `milo-web` tut das
ebenfalls — er ist dort über seinen Containernamen erreichbar, genau wie Baserow.

Im Cloudflare-Dashboard unter *Zero Trust → Networks → Tunnels → dein Tunnel →
Public Hostname* eintragen:

| Feld | Wert |
|---|---|
| Subdomain | `baby` |
| Domain | deine Domain |
| Service | `HTTP` → `milo-web:80` |

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

### Warum die Bausteine der App das Ausrollen überleben

Die Ansichten werden bei Bedarf nachgeladen, und ihre Dateinamen tragen einen
Inhalts-Hash. Wurde das Abbild komplett ersetzt, waren die Dateien der alten Fassung im
selben Moment weg — ein Handy, das die App noch offen hatte, verwies auf nicht mehr
vorhandene Dateien, und der Navigationspunkt tat scheinbar **nichts**.

Deshalb liegt `/assets` unter `./data/web-assets` und überdauert den Neubau: Neue
Dateien kommen dazu, alte bleiben (`ASSET_KEEP_DAYS`, Vorgabe 30). Der Notausgang im
Router — hartes Neuladen auf die Zielseite — bleibt als Netz darunter bestehen.

### Sicherungen

Der `backup`-Container legt jede Nacht eine Kopie unter `backups/` an und hält
30 Tage vor. `./install.sh` legt zusätzlich unmittelbar vor dem Ausrollen eine an —
die nächtliche kann genau dann, wenn eine Schema-Änderung kommt, 24 Stunden alt sein.
Jederzeit von Hand geht `./deploy/backup-now.sh`.

`sqlite3 .backup` statt `cp`: Eine laufende Datenbank zu kopieren erzeugt bei aktivem
WAL eine Datei, die beim Wiederherstellen inkonsistent sein kann.

Die Dateien gehören dem Besitzer des Datenordners und haben Rechte `600` — es sind
Gesundheitsdaten eines Kindes und gehen andere Nutzer auf dem Gerät nichts an.

Wiederherstellen — **dieser Weg ist einmal vollständig durchgespielt worden**
(Datenbank gelöscht, aus der Sicherung zurückgeholt, Datensatz war vollständig da):

```bash
docker compose stop api
gunzip -c backups/milo-JJJJMMTT.db.gz > data/milo.db
rm -f data/milo.db-wal data/milo.db-shm
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
Bildschirmfoto-Durchlauf, die Offline-Abgleich-Prüfung, den Symbol-Generator und eine
**WebKit-Prüfung für iPhone-Eigenheiten** — siehe [tools/README.md](tools/README.md).

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
