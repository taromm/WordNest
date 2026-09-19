#!/usr/bin/env python3
"""Generate a honey-cream app icon. Not a character mascot."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "build" / "icon.png"
SIZE = 1024


def main() -> None:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse((90, 120, 934, 980), fill=(90, 55, 25, 55))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(32)))

    draw = ImageDraw.Draw(img)
    cream = (255, 246, 223, 255)
    honey = (232, 184, 109, 255)
    brown = (107, 68, 35, 255)

    draw.rounded_rectangle((72, 72, 952, 952), radius=280, fill=cream)
    draw.rounded_rectangle((72, 72, 952, 952), radius=280, outline=honey, width=18)
    draw.ellipse((230, 170, 790, 430), fill=(255, 233, 184, 255))
    draw.rounded_rectangle((390, 760, 634, 860), radius=60, fill=honey)

    font = ImageFont.truetype("/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc", 460, index=0)
    text = "词"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (SIZE - tw) / 2 - bbox[0]
    ty = 250 + (430 - th) / 2 - bbox[1]
    draw.text((tx, ty), text, font=font, fill=brown)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
