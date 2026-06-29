"""Generate CrewFactory brand icons (favicon, PWA icons)."""
from PIL import Image, ImageDraw, ImageFont
import os

SIZES = {
    "favicon.png": 32,
    "icon-192.png": 192,
    "icon-512.png": 512,
}

BG_COLOR = (18, 18, 18)       # #121212
ACCENT_COLOR = (59, 130, 246)  # #3B82F6 (blue-500)
TEXT_COLOR = (255, 255, 255)

PUBLIC_DIRS = [
    "apps/client/public",
    "apps/server/public",
]


def draw_icon(size: int) -> Image.Image:
    """Draw a 'CF' icon with a modern look."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded square background with padding
    pad = int(size * 0.12)
    r = int(size * 0.22)
    draw.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=r,
        fill=BG_COLOR,
    )

    # Try to load a bold font, fall back to default
    font_size = int(size * 0.48)
    try:
        # Windows path for a bold sans
        font = ImageFont.truetype(
            "C:/Windows/Fonts/segoeuib.ttf", font_size
        )
    except (IOError, OSError):
        try:
            font = ImageFont.truetype(
                "C:/Windows/Fonts/arialbd.ttf", font_size
            )
        except (IOError, OSError):
            font = ImageFont.load_default()

    # Draw "CF" text
    text = "CF"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size - tw) / 2
    y = (size - th) / 2 - int(size * 0.02)

    # Draw C in accent, F in white
    draw.text((x, y), text, font=font, fill=TEXT_COLOR)

    # Accent dot/bar
    dot_size = int(size * 0.06)
    dot_x = x + tw + int(size * 0.04)
    dot_y = y + int(size * 0.08)
    draw.ellipse(
        [dot_x, dot_y, dot_x + dot_size, dot_y + dot_size],
        fill=ACCENT_COLOR,
    )

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
