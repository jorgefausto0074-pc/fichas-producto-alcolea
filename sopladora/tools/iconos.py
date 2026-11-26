#!/usr/bin/env python3
"""Iconos de la Calculadora Sopladora. Azul marino, naranja y hielo. Sin verde."""
from pathlib import Path
from PIL import Image, ImageDraw

NAVY = (7, 26, 64, 255)
ORANGE = (255, 102, 51, 255)
ICE = (177, 220, 237, 255)
WHITE = (255, 255, 255, 255)

ROOT = Path(__file__).resolve().parents[1]
ANDROID = ROOT / "android" / "app" / "src" / "main" / "res"


def botella(draw, cx, top, w, h, ancho_trazo):
    cuerpo = [cx - w / 2, top + h * 0.22, cx + w / 2, top + h]
    draw.rounded_rectangle(cuerpo, radius=w * 0.42, fill=ICE)
    cuello = [cx - w * 0.22, top + h * 0.08, cx + w * 0.22, top + h * 0.28]
    draw.rounded_rectangle(cuello, radius=w * 0.12, fill=ICE)
    tapa = [cx - w * 0.28, top, cx + w * 0.28, top + h * 0.12]
    draw.rounded_rectangle(tapa, radius=w * 0.08, fill=ORANGE)
    y1 = top + h * 0.48
    y2 = top + h * 0.66
    draw.rectangle([cx - w / 2, y1, cx + w / 2, y2], fill=ORANGE)
    for y in (top + h * 0.40, top + h * 0.74):
        draw.line([(cx - w * 0.42, y), (cx + w * 0.42, y)], fill=WHITE, width=max(2, int(ancho_trazo)))


def lienzo(size, margen, fondo):
    im = Image.new("RGBA", (size, size), fondo)
    d = ImageDraw.Draw(im)
    alto = size - 2 * margen
    botella(d, size / 2, margen, alto * 0.46, alto, max(2, size // 48))
    return im


def guardar(im, ruta):
    ruta.parent.mkdir(parents=True, exist_ok=True)
    im.save(ruta, "PNG")


def main():
    iconos = ROOT / "icons"
    guardar(lienzo(32, 2, NAVY), iconos / "favicon-32.png")
    guardar(lienzo(180, 16, NAVY), iconos / "apple-touch-icon.png")
    guardar(lienzo(192, 18, NAVY), iconos / "icon-192.png")
    guardar(lienzo(512, 48, NAVY), iconos / "icon-512.png")
    guardar(lienzo(512, 78, NAVY), iconos / "icon-maskable-512.png")
    guardar(lienzo(256, 28, (0, 0, 0, 0)), ANDROID / "drawable" / "splash_mark.png")
    for carpeta, px in (("mipmap-mdpi", 48), ("mipmap-hdpi", 72), ("mipmap-xhdpi", 96), ("mipmap-xxhdpi", 144), ("mipmap-xxxhdpi", 192)):
        base = ANDROID / carpeta
        guardar(lienzo(px, max(2, px // 10), NAVY), base / "ic_launcher.png")
        guardar(lienzo(px, max(2, px // 10), NAVY), base / "ic_launcher_round.png")
        fg = lienzo(px, max(4, px // 8), (0, 0, 0, 0))
        guardar(fg, base / "ic_launcher_foreground.png")
    print("iconos escritos")


if __name__ == "__main__":
    main()
