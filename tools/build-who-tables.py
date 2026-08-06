#!/usr/bin/env python3
"""
Converts the WHO growth tables (xlsx) into compact JSON for the frontend.

The original files hold one row per day of life from 0 to 1856 with the
LMS parameters and the standard deviations derived from them. We keep only
L, M and S — every percentile can be computed exactly from those, whereas carrying all
the precomputed columns would quadruple the file for no gain.

Thinned to weekly anchor points over the first two years: between two adjacent days M
changes by fractions of a gram, and the client
interpolates linearly. That reduces the file from ~1900 to ~105 rows per table.

Aufruf:
    python3 tools/build-who-tables.py <ordner-mit-xlsx> web/src/data/who
"""
import json
import re
import sys
import zipfile
from pathlib import Path

MAX_DAYS = 730  # two years; after that the app's timeline ends
STEP_DAYS = 7


def read_sheet(path: Path) -> list[list[str]]:
    """A minimal xlsx reader — enough for these flat tables without formulas."""
    with zipfile.ZipFile(path) as z:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            raw = z.read("xl/sharedStrings.xml").decode("utf-8")
            shared = [
                re.sub(r"<[^>]+>", "", m)
                for m in re.findall(r"<si>(.*?)</si>", raw, re.S)
            ]
        sheet = z.read("xl/worksheets/sheet1.xml").decode("utf-8")

    rows: list[list[str]] = []
    for row_xml in re.findall(r"<row[^>]*>(.*?)</row>", sheet, re.S):
        cells: list[str] = []
        # Match attributes and content separately: an optional t="s" in the middle of a
        # greedy attribute pattern would never be recognised, and the header row would stay
        # as an unresolved string index.
        for attrs, body in re.findall(r"<c\b([^>]*)>(.*?)</c>", row_xml, re.S):
            value_match = re.search(r"<v>(.*?)</v>", body, re.S)
            if not value_match:
                cells.append("")
                continue
            value = value_match.group(1)
            is_shared = re.search(r'\bt="s"', attrs) is not None
            cells.append(shared[int(value)] if is_shared and shared else value)
        if cells:
            rows.append(cells)
    return rows


def extract_lms(path: Path) -> list[list[float]]:
    rows = read_sheet(path)

    header_index = next(
        (i for i, r in enumerate(rows) if any(c.strip().upper() == "L" for c in r)),
        None,
    )
    if header_index is None:
        raise SystemExit(f"{path.name}: keine Kopfzeile mit Spalte 'L' gefunden")

    header = [c.strip().lower() for c in rows[header_index]]
    day_col = next(i for i, c in enumerate(header) if c in ("day", "age"))
    l_col = header.index("l")
    m_col = header.index("m")
    s_col = header.index("s")

    out: list[list[float]] = []
    for row in rows[header_index + 1 :]:
        if max(day_col, l_col, m_col, s_col) >= len(row):
            continue
        try:
            day = int(float(row[day_col]))
            l, m, s = float(row[l_col]), float(row[m_col]), float(row[s_col])
        except ValueError:
            continue
        if day > MAX_DAYS:
            break
        # Always include the first and last day, weekly in between.
        if day % STEP_DAYS == 0 or day == 0:
            out.append([day, round(l, 4), round(m, 4), round(s, 5)])
    return out


def main() -> None:
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    dst.mkdir(parents=True, exist_ok=True)

    files = {
        "weight-girls": "wfa-girls.xlsx",
        "weight-boys": "wfa-boys.xlsx",
        "length-girls": "lhfa-girls.xlsx",
        "length-boys": "lhfa-boys.xlsx",
    }

    for name, filename in files.items():
        table = extract_lms(src / filename)
        target = dst / f"{name}.json"
        target.write_text(json.dumps(table, separators=(",", ":")), encoding="utf-8")
        print(f"{name}: {len(table)} anchor points, {target.stat().st_size} bytes")


if __name__ == "__main__":
    main()
