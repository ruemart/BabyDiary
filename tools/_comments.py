#!/usr/bin/env python3
"""Kommentare aus dem Quelltext holen und zurückschreiben. Nur für die Umstellung.

  python3 tools/_comments.py extract  > /tmp/comments.json
  python3 tools/_comments.py apply    < /tmp/translated.json

Der Schlüssel ist der exakte Kommentartext. Zurückgeschrieben wird nur, was
buchstabengenau noch so im Quelltext steht — damit kann der Lauf nichts kaputt
machen, was sich zwischenzeitlich geändert hat.
"""
import json
import re
import sys
from pathlib import Path

ROOTS = ["web/src", "api/src", "shared/src"]
SUFFIXES = {".ts", ".vue"}
# Blockkommentar, Zeilenkommentar, HTML-Kommentar in Vorlagen.
PATTERN = re.compile(r"/\*[\s\S]*?\*/|(?:^[ \t]*//[^\n]*\n?)+|<!--[\s\S]*?-->", re.M)
GERMAN = re.compile(
    r"\b(der|die|das|und|nicht|wird|man|sich|eine|einen|ist|für|dass|weil|beim|kein|"
    r"nur|hier|damit|sonst|wenn|dann|noch|schon|werden|haben|mit|von|zum|zur|auf|"
    r"aus|nach|über|unter|ohne|gegen|statt|jede|jeder|jedes|alle|etwas|nichts)\b",
    re.I,
)


def files():
    for root in ROOTS:
        for path in sorted(Path(root).rglob("*")):
            if path.suffix in SUFFIXES and path.is_file():
                yield path


def is_german(text: str) -> bool:
    return len(GERMAN.findall(text)) >= 2


if sys.argv[1:2] == ["extract"]:
    seen: dict[str, list[str]] = {}
    for path in files():
        for match in PATTERN.finditer(path.read_text(encoding="utf-8")):
            text = match.group(0).rstrip("\n")
            if is_german(text):
                seen.setdefault(text, []).append(str(path))
    print(json.dumps([{"files": v, "text": k} for k, v in seen.items()], ensure_ascii=False, indent=1))
    print(f"{len(seen)} Kommentare", file=sys.stderr)

elif sys.argv[1:2] == ["apply"]:
    table = json.load(sys.stdin)
    changed = missing = 0
    for path in files():
        s = original = path.read_text(encoding="utf-8")
        for item in table:
            if item["text"] in s:
                s = s.replace(item["text"], item["en"])
                changed += 1
        if s != original:
            path.write_text(s, encoding="utf-8")
    for item in table:
        if not any(item["text"] in p.read_text(encoding="utf-8") for p in files()):
            continue
        missing += 1
    print(f"{changed} Ersetzungen, {missing} nicht gefunden", file=sys.stderr)

else:
    sys.exit(__doc__)
