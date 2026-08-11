#!/usr/bin/env python3
"""
Genera los assets de marca a partir del logo fuente.

Entrada:  assets/brand/icon-source.png  (el hexágono naranja con la A)
Salidas:
  src/app/icon.png            512x512  — favicon moderno (Next lo cablea solo)
  src/app/apple-icon.png      180x180  — icono de iOS, sobre blanco
  src/app/favicon.ico         16/32/48 — para browsers que piden /favicon.ico
  src/app/opengraph-image.png 1200x630 — preview al compartir el link
  src/app/twitter-image.png   1200x630 — misma imagen, Twitter la pide aparte

Uso:  python3 scripts/generate-brand-assets.py

Se versiona el script (y no sólo los PNG) para que cambiar el logo sea volver a
correr esto, en vez de reconstruir el banner a mano.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "brand" / "icon-source.png"
APP = ROOT / "src" / "app"

ACCENT = (255, 89, 6)  # #FF5906 — el naranja del sistema (--accent)
INK = (10, 10, 10)  # fondo casi negro, igual que --background en dark
MUTED = (161, 161, 161)
WHITE = (255, 255, 255)


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """San Francisco si está (es lo más cercano a DM Sans), Arial de fallback."""
    sf = Path("/System/Library/Fonts/SFNS.ttf")
    if sf.exists():
        font = ImageFont.truetype(str(sf), size)
        if bold:
            try:
                font.set_variation_by_name("Bold")
            except Exception:
                pass
        return font
    arial = Path(
        "/System/Library/Fonts/Supplemental/"
        + ("Arial Bold.ttf" if bold else "Arial.ttf")
    )
    if arial.exists():
        return ImageFont.truetype(str(arial), size)
    return ImageFont.load_default()


def squared_mark() -> Image.Image:
    """El logo fuente no es cuadrado (181x201): lo centra en un lienzo cuadrado
    transparente para que no se deforme al escalarlo a iconos."""
    src = Image.open(SOURCE).convert("RGBA")
    side = max(src.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(src, ((side - src.width) // 2, (side - src.height) // 2), src)
    return canvas


def write_icons(mark: Image.Image) -> None:
    mark.resize((512, 512), Image.LANCZOS).save(APP / "icon.png")

    # iOS no respeta la transparencia: compone sobre negro y el hexágono naranja
    # perdería contraste con la "A" blanca. Se fija fondo blanco.
    apple = Image.new("RGBA", (180, 180), WHITE)
    inner = mark.resize((150, 150), Image.LANCZOS)
    apple.paste(inner, (15, 15), inner)
    apple.convert("RGB").save(APP / "apple-icon.png")

    mark.resize((64, 64), Image.LANCZOS).save(
        APP / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)]
    )


def radial_glow(size: int, color: tuple[int, int, int], peak: int) -> Image.Image:
    """Resplandor radial suave.

    Se calcula en un lienzo chico (64x64) y se escala con LANCZOS: dibujar
    círculos concéntricos directo al tamaño final deja bandas visibles.
    """
    n = 64
    mask = Image.new("L", (n, n), 0)
    px = mask.load()
    c = (n - 1) / 2
    for y in range(n):
        for x in range(n):
            d = ((x - c) ** 2 + (y - c) ** 2) ** 0.5 / c
            px[x, y] = 0 if d >= 1 else int(peak * (1 - d) ** 2.2)
    mask = mask.resize((size, size), Image.LANCZOS)
    layer = Image.new("RGBA", (size, size), (*color, 0))
    layer.putalpha(mask)
    return layer


def rounded_pill(
    draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font
) -> int:
    """Chip con borde, estilo `rounded-full` del sistema. Devuelve su ancho."""
    pad_x, pad_y = 26, 13
    w = int(draw.textlength(text, font=font))
    h = font.size + pad_y * 2
    box = (xy[0], xy[1], xy[0] + w + pad_x * 2, xy[1] + h)
    # radius explícito = h/2: con `999` PIL redondea de más y el chip se ve oval.
    draw.rounded_rectangle(box, radius=h // 2, outline=(62, 62, 62), width=2)
    draw.text((xy[0] + pad_x, xy[1] + pad_y - 3), text, font=font, fill=MUTED)
    return box[2] - box[0]


def write_og(mark: Image.Image) -> None:
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), INK)
    draw = ImageDraw.Draw(img, "RGBA")

    cx, cy = 258, 300
    glow = radial_glow(760, ACCENT, 58)
    img.paste(glow, (cx - 380, cy - 380), glow)

    m = mark.resize((216, 216), Image.LANCZOS)
    img.paste(m, (cx - 108, cy - 108), m)

    x = 478
    title = load_font(138, bold=True)
    draw.text((x, 168), "API", font=title, fill=WHITE)

    sub = load_font(40, bold=True)
    draw.text((x + 3, 322), "CRM para concesionarios", font=sub, fill=ACCENT)

    body = load_font(29)
    draw.text(
        (x + 3, 378),
        "Leads, pipeline y ventas en un solo lugar",
        font=body,
        fill=MUTED,
    )

    pill = load_font(24)
    px = x + 3
    for label in ("WhatsApp", "Presupuestos", "Reportes"):
        px += rounded_pill(draw, (px, 442), label, pill) + 12

    # Filete inferior de acento: la firma visual del sistema (misma idea que el
    # rail de las cards).
    draw.rectangle((0, H - 10, W, H), fill=ACCENT)

    img.save(APP / "opengraph-image.png")
    img.save(APP / "twitter-image.png")


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Falta el logo fuente en {SOURCE}")
    mark = squared_mark()
    write_icons(mark)
    write_og(mark)
    for name in (
        "icon.png",
        "apple-icon.png",
        "favicon.ico",
        "opengraph-image.png",
        "twitter-image.png",
    ):
        p = APP / name
        print(f"  {name:24} {p.stat().st_size // 1024:>4} KB")


if __name__ == "__main__":
    main()
