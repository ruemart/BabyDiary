#!/usr/bin/env python3
"""Fügt `useI18n` dort ein, wo im Skriptteil `t(` benutzt wird. Nur beim Umbau."""
import re
import sys
from pathlib import Path

IMPORT = 'import { useI18n } from "vue-i18n";'
DECL = "const { t } = useI18n();"


def script_block(text: str) -> tuple[int, int] | None:
    m = re.search(r"<script[^>]*>", text)
    if not m:
        return None
    end = text.index("</script>")
    return m.end(), end


for path in map(Path, sys.argv[1:]):
    s = path.read_text(encoding="utf-8")
    if path.suffix == ".vue":
        span = script_block(s)
        if not span:
            print(f"  {path.name}: kein Skriptteil")
            continue
        start, end = span
        body = s[start:end]
    else:
        start, end, body = 0, len(s), s

    if not re.search(r"(?<![\w.$])t\(", body):
        print(f"  {path.name}: kein t() — übersprungen")
        continue
    if IMPORT in body:
        print(f"  {path.name}: schon vorhanden")
        continue

    lines = body.split("\n")
    last_import = max(
        (i for i, l in enumerate(lines) if l.startswith("import ")), default=None
    )
    if last_import is None:
        print(f"  {path.name}: keine Importe gefunden")
        continue
    lines.insert(last_import + 1, IMPORT)

    if DECL not in body:
        # Die Deklaration muss VOR der ersten Benutzung stehen, aber nach den Importen.
        after = last_import + 2
        while after < len(lines) and (
            lines[after].startswith("import ") or lines[after].strip() == ""
        ):
            after += 1
        lines.insert(after, "\n" + DECL if lines[after].strip() else DECL)

    s = s[:start] + "\n".join(lines) + s[end:]
    path.write_text(s, encoding="utf-8")
    print(f"  {path.name}: useI18n eingefügt")
