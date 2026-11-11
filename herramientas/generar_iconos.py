"""Genera los íconos PNG de la app (192, 512 y maskable) en la carpeta icons/."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(exist_ok=True)
TOP, BOTTOM = (13, 148, 136), (6, 78, 59)  # teal -> verde oscuro


def gradient(size):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        c = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
        for x in range(size):
            px[x, y] = c
    return img


def font(px):
    for f in ("C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"):
        try:
            return ImageFont.truetype(f, px)
        except OSError:
            pass
    return ImageFont.load_default()


def make(size, maskable=False):
    s = size * 4  # supersampling
    img = gradient(s).convert("RGBA")
    d = ImageDraw.Draw(img)
    scale = 0.62 if maskable else 0.78
    r = s * scale / 2
    cx = cy = s / 2
    # moneda
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 255, 255, 235))
    d.ellipse((cx - r * 0.84, cy - r * 0.84, cx + r * 0.84, cy + r * 0.84), outline=(13, 148, 136, 255), width=max(2, int(s * 0.012)))
    f = font(int(r * 1.25))
    d.text((cx, cy + r * 0.02), "$", font=f, fill=(6, 95, 70, 255), anchor="mm")
    img = img.resize((size, size), Image.LANCZOS)
    if not maskable:
        mask = Image.new("L", (size * 4, size * 4), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=int(size * 4 * 0.22), fill=255)
        img.putalpha(mask.resize((size, size), Image.LANCZOS))
    return img


make(192).save(OUT / "icon-192.png")
make(512).save(OUT / "icon-512.png")
make(512, maskable=True).save(OUT / "icon-maskable-512.png")
make(180, maskable=True).convert("RGB").save(OUT / "apple-touch-icon.png")
print("ok", sorted(p.name for p in OUT.iterdir()))
