#!/usr/bin/env python3
"""Generates the app icons from a single drawing.

The files were listed in the manifest and in index.html but never existed — nginx served
index.html for each of them with status 200, so the home screen kept a placeholder and
notifications had no image.

Draws a bottle silhouette rather than a picture: at 48 px on a home screen only the
outline counts. Colours and corner radius come from the app's own look (honey on cream).

    python3 tools/build-icons.py

Writes the files into web/public/. Vite copies them from there unchanged.
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "web" / "public"

HONEY = (232, 163, 61, 255)  # --bm-feed, also the theme_color
CREAM = (247, 244, 238, 255)  # background_color
INK = (42, 32, 40, 255)

# Drawn at 1024 and scaled down: that smooths the edges better than drawing directly
# at the target size.
BASE = 1024


def bottle(draw: ImageDraw.ImageDraw, size: int, colour: tuple[int, int, int, int]) -> None:
    """A bottle, centred, sized against `size` as the edge length of the canvas."""
    cx = size / 2
    unit = size / 100

    def box(x0: float, y0: float, x1: float, y1: float, r: float) -> None:
        draw.rounded_rectangle(
            [cx + x0 * unit, y0 * unit, cx + x1 * unit, y1 * unit],
            radius=r * unit,
            fill=colour,
        )

    box(-8, 12, 8, 20, 3)  # teat
    box(-13, 22, 13, 32, 4)  # collar
    box(-17, 34, 17, 86, 9)  # body

    # Graduation marks: they turn a generic container into a recognisable baby bottle.
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
    """`inset` shrinks the drawing — needed for the maskable icon."""
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

    # iOS rounds the corners itself and dislikes transparency — hence fully filled.
    render(180, radius_ratio=0.0).save(OUT / "apple-touch-icon.png")
    render(192, radius_ratio=0.18).save(OUT / "icon-192.png")
    render(512, radius_ratio=0.18).save(OUT / "icon-512.png")
    # Maskable: Android crops freely, only the central circle (80 %) is safe.
    render(512, radius_ratio=0.0, inset=0.22).save(OUT / "icon-maskable-512.png")
    (OUT / "favicon.svg").write_text(SVG, encoding="utf-8")

    for f in sorted(OUT.iterdir()):
        print(f"  {f.name:26} {f.stat().st_size:>7} bytes")
