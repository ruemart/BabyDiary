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
