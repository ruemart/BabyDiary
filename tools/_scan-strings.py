#!/usr/bin/env python3
"""Listet sichtbare Texte einer .vue-Datei auf. Nur beim i18n-Umbau benutzt."""
import re
import sys
from pathlib import Path

SKIP_ATTR = {"class", "type", "viewBox", "d", "stroke", "fill", "ref", "key", "name"}
CODEISH = re.compile(r"^[\w.\-/@#{}$\[\]()*%:;,+ ]*$")


def is_text(value: str) -> bool:
    if len(value.strip()) < 2:
        return False
    if not re.search(r"[A-Za-zÄÖÜäöüß]{3}", value):
        return False
    if value.strip().startswith(("http", "/", "#", "--")):
        return False
    # Bezeichner und Pfade aussortieren, echte Sätze behalten.
    return bool(re.search(r"[A-ZÄÖÜ][a-zäöüß]|[a-zäöüß]{2,}\s", value)) or " " in value.strip()


for path in map(Path, sys.argv[1:]):
    src = path.read_text(encoding="utf-8")
    # Der Stilteil enthält nie Text für Menschen.
    src = re.sub(r"<style[\s\S]*?</style>", "", src)
    # Kommentare ebenfalls raus.
    src = re.sub(r"/\*[\s\S]*?\*/", "", src)
    src = re.sub(r"<!--[\s\S]*?-->", "", src)
    src = re.sub(r"^\s*//.*$", "", src, flags=re.M)

    print(f"\n########## {path} ##########")
    seen = set()
    for n, line in enumerate(src.split("\n"), 1):
        hits = []
        # Zeichenketten im Skript
        for m in re.finditer(r'"([^"\\]{2,})"|\'([^\'\\]{2,})\'', line):
            v = m.group(1) or m.group(2)
            if is_text(v) and not line.lstrip().startswith("import"):
                hits.append(v)
        # Textknoten in der Vorlage
        for m in re.finditer(r">([^<>{}]{2,})<", line):
            v = m.group(1)
            if is_text(v):
                hits.append(v.strip())
        # Freistehender Text (mehrzeilige Absätze)
        stripped = line.strip()
        if stripped and not re.search(r"[<>{}=]", stripped) and is_text(stripped):
            hits.append(stripped)
        for h in hits:
            if h not in seen:
                seen.add(h)
                print(f"{n:>4}: {h}")
