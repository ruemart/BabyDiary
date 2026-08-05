# Entwicklungswerkzeuge

Nicht Teil der App — beides läuft nur gegen einen lokalen Entwicklungsserver.

## `seed-dev-data.mjs`

Sät 30 Tage realistische Daten (Mahlzeiten, Windeln, Schlaf, Wiegungen).

```bash
node tools/seed-dev-data.mjs
```

Ohne echte Daten lassen sich die Auswertungen nicht beurteilen: Ein einzelner
Datenpunkt zeigt weder, ob die Achsen stimmen, noch ob das Rhythmus-Diagramm das
nächtliche Band tatsächlich sichtbar macht. Der Zufallsgenerator ist deterministisch,
zwei Läufe erzeugen dieselben Daten.

Setzt voraus, dass die App bereits eingerichtet ist (ein Kind existiert).

## `screenshots.mjs`

Fährt die App in beiden Darstellungen ab und legt Bildschirmfotos ab.

```bash
node tools/screenshots.mjs /pfad/zum/ausgabeordner
```

Meldet am Ende alle Konsolenfehler — nützlicher Nebeneffekt beim Prüfen von Umbauten.

## `verify-offline-sync.mjs`

Prüft den wichtigsten Weg der App gegen den fertigen Docker-Stapel: offline eintragen,
zweites Gerät anmelden, Abgleich, Löschung propagieren.

```bash
INVITE=$(grep '^HOUSEHOLD_SECRET=' .env | cut -d= -f2) \
BASE=http://127.0.0.1:8090 \
node tools/verify-offline-sync.mjs
```

Läuft bewusst gegen den Docker-Stapel und nicht gegen den Entwicklungsserver — nur so
werden nginx, der Service Worker und der echte API-Container mitgeprüft.

## `build-who-tables.py`

Wandelt die WHO-Wachstumstabellen (xlsx) in kompaktes JSON um. Nur nötig, wenn die WHO
neue Tabellen veröffentlicht.

```bash
# Vier Dateien von who.int herunterladen (URLs im Skriptkopf), dann:
python3 tools/build-who-tables.py <ordner-mit-xlsx> web/src/data/who
```

## `build-icons.py`

Erzeugt die Symbole der App nach `web/public/`.

```bash
python3 tools/build-icons.py
```

Die Dateien standen von Anfang an im Manifest und in der `index.html`, existierten aber
nie — nginx lieferte für jede von ihnen die `index.html` aus, mit Status 200, sodass
nichts danach aussah. Auf dem Startbildschirm blieb ein Platzhalter, und die
Benachrichtigungen hatten kein Bild.

Gezeichnet wird auf 1024 px und heruntergerechnet; das glättet die Kanten besser als
eine Zeichnung direkt in Zielgröße. Das maskierbare Symbol hält den sicheren Bereich
ein: Android beschneidet frei, verlässlich sichtbar ist nur der mittlere Kreis.
