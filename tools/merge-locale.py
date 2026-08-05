#!/usr/bin/env python3
"""Fügt Schlüssel in die Sprachdateien ein, ohne vorhandene zu verlieren.

Nur beim Umbau benutzt: `python3 tools/merge-locale.py < patch.json`

Erwartet ein Objekt der Form {"de": {...}, "en": {...}} mit Punktschlüsseln
("today.title") und schreibt es verschachtelt in web/src/i18n/locales/*.json.
Vorhandene Werte werden überschrieben, alles andere bleibt stehen.
"""

import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent / "web" / "src" / "i18n" / "locales"


def setdeep(tree: dict, dotted: str, value) -> None:
    parts = dotted.split(".")
    for part in parts[:-1]:
        node = tree.setdefault(part, {})
        if not isinstance(node, dict):
            raise SystemExit(f"Schlüssel kollidiert: {dotted}")
        tree = node
    tree[parts[-1]] = value


def sortdeep(tree: dict) -> dict:
    return {
        k: sortdeep(v) if isinstance(v, dict) else v
        for k, v in sorted(tree.items(), key=lambda kv: (isinstance(kv[1], dict), kv[0]))
    }


patch = json.load(sys.stdin)

for lang, entries in patch.items():
    path = BASE / f"{lang}.json"
    tree = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    for dotted, value in entries.items():
        setdeep(tree, dotted, value)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(sortdeep(tree), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"  {lang}.json: {len(entries)} Schlüssel geschrieben")
