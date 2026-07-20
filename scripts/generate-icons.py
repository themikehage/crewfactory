"""Generate CrewFactory brand icons (favicon, PWA icons)."""
from PIL import Image, ImageDraw, ImageFont
import os

SIZES = {
    "favicon.png": 32,
    "icon-192.png": 192,
    "icon-512.png": 512,
}

BG_COLOR = (17, 17, 17)        # #111111
INNER_BG_COLOR = (10, 10, 10)  # #0a0a0a
ACCENT_COLOR = (74, 222, 128)  # #4ade80 (green-400)
TEXT_COLOR = (74, 222, 128)

PUBLIC_DIRS = [
    "apps/client/public",
    "apps/server/public",
]


def draw_icon(size: int) -> Image.Image:
    """Draw the new CrewFactory icon with a green 'C' and border."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Outer rounded rectangle (radius 20% of size)
    r_outer = int(size * 0.20)
    draw.rounded_rectangle(
        [0, 0, size, size],
        radius=r_outer,
        fill=BG_COLOR,
    )

    # Inner rounded rectangle (padding 12% of size, radius 14% of size)
    pad = int(size * 0.12)
    r_inner = int(size * 0.14)
    # Border width is 2% of size, at least 1px
    border_width = max(1, int(size * 0.02))

    draw.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=r_inner,
        fill=INNER_BG_COLOR,
        outline=ACCENT_COLOR,
        width=border_width,
    )

    # Load bold font
    font_size = int(size * 0.52)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", font_size)
    except (IOError, OSError):
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", font_size)
        except (IOError, OSError):
            font = ImageFont.load_default()

    # Draw "C" text (centered)
    text = "C"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]

    x = (size - tw) / 2
    # Adjust vertical alignment to match the visual offset in SVG
    y = (size - th) / 2 - int(size * 0.08)

    draw.text((x, y), text, font=font, fill=TEXT_COLOR)

    return img


def main():
    for dir_path in PUBLIC_DIRS:
        os.makedirs(dir_path, exist_ok=True)

    for filename, size in SIZES.items():
        img = draw_icon(size)
        for dir_path in PUBLIC_DIRS:
            out = os.path.join(dir_path, filename)
            img.save(out, "PNG")
            print(f"  [OK] {out} ({size}x{size})")


if __name__ == "__main__":
    main()
