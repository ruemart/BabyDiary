#!/usr/bin/env python3
"""Erzeugt die Symbole der App aus einer einzigen Zeichnung.

Die Dateien waren im Manifest und in der index.html eingetragen, existierten aber nie —
nginx lieferte für jede von ihnen die index.html aus, mit Status 200. Auf dem
Startbildschirm blieb damit ein Platzhalter, und die Benachrichtigungen hatten kein Bild.

Erzeugt statt eines Fotos eine Fläschchen-Silhouette: Bei 48 px auf einem
Startbildschirm zählt allein der Umriss. Farben und Rundung stammen aus dem
Erscheinungsbild der App (Honig auf Creme).

    python3 tools/build-icons.py

Legt die Dateien in web/public/ ab. Von dort übernimmt Vite sie unverändert.
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "web" / "public"

HONEY = (232, 163, 61, 255)  # --bm-feed, zugleich theme_color
CREAM = (247, 244, 238, 255)  # background_color
INK = (42, 32, 40, 255)

# Auf 1024 gezeichnet und heruntergerechnet: Das glättet die Kanten besser als jede
# Zeichnung direkt in Zielgröße.
BASE = 1024


def bottle(draw: ImageDraw.ImageDraw, size: int, colour: tuple[int, int, int, int]) -> None:
    """Ein Fläschchen, mittig, an `size` als Kantenlänge des Bildfelds ausgerichtet."""
    cx = size / 2
    unit = size / 100

    def box(x0: float, y0: float, x1: float, y1: float, r: float) -> None:
        draw.rounded_rectangle(
            [cx + x0 * unit, y0 * unit, cx + x1 * unit, y1 * unit],
            radius=r * unit,
            fill=colour,
        )

    box(-8, 12, 8, 20, 3)  # Sauger
    box(-13, 22, 13, 32, 4)  # Ring
    box(-17, 34, 17, 86, 9)  # Körper

    # Füllstriche: machen aus einem beliebigen Behälter erkennbar ein Fläschchen.
    for y in (52, 62, 72):
        draw.rounded_rectangle(
            [cx + 5 * unit, y * unit, cx + 12 * unit, (y + 2.2) * unit],
            radius=1.1 * unit,
            fill=CREAM if colour == INK else INK,
        )


def rounded_tile(size: int, radius_ratio: float, bg: tuple[int, int, int, int]) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=bg
    )
    return img


def render(size: int, *, radius_ratio: float, inset: float = 0.0) -> Image.Image:
    """`inset` schrumpft die Zeichnung — für das maskierbare Symbol nötig."""
    tile = rounded_tile(BASE, radius_ratio, HONEY)

    glyph = Image.new("RGBA", (BASE, BASE), (0, 0, 0, 0))
    bottle(ImageDraw.Draw(glyph), BASE, INK)
    if inset:
        inner = int(BASE * (1 - inset))
        glyph = glyph.resize((inner, inner), Image.LANCZOS)
        offset = (BASE - inner) // 2
        shifted = Image.new("RGBA", (BASE, BASE), (0, 0, 0, 0))
        shifted.paste(glyph, (offset, offset), glyph)
        glyph = shifted

    tile.alpha_composite(glyph)
    return tile.resize((size, size), Image.LANCZOS)


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#e8a33d"/>
  <g fill="#2a2028">
    <rect x="42" y="12" width="16" height="8" rx="3"/>
    <rect x="37" y="22" width="26" height="10" rx="4"/>
    <rect x="33" y="34" width="34" height="52" rx="9"/>
  </g>
  <g fill="#f7f4ee">
    <rect x="55" y="52" width="7" height="2.2" rx="1.1"/>
    <rect x="55" y="62" width="7" height="2.2" rx="1.1"/>
    <rect x="55" y="72" width="7" height="2.2" rx="1.1"/>
  </g>
</svg>
"""

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)

    # iOS schneidet die Ecken selbst zu und mag keine Transparenz — deshalb voll gefüllt.
    render(180, radius_ratio=0.0).save(OUT / "apple-touch-icon.png")
    render(192, radius_ratio=0.18).save(OUT / "icon-192.png")
    render(512, radius_ratio=0.18).save(OUT / "icon-512.png")
    # Maskierbar: Android beschneidet frei, sicher ist nur der mittlere Kreis (80 %).
    render(512, radius_ratio=0.0, inset=0.22).save(OUT / "icon-maskable-512.png")
    (OUT / "favicon.svg").write_text(SVG, encoding="utf-8")

    for f in sorted(OUT.iterdir()):
        print(f"  {f.name:26} {f.stat().st_size:>7} Byte")
