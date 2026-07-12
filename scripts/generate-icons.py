#!/usr/bin/env python3
"""Generate PWA PNG icons from the SVG source using cairosvg or PIL fallback."""

import sys
from pathlib import Path

ICONS_DIR = Path('/home/z/my-project/mobile-shop-erp/apps/web/public/icons')
SOURCE = ICONS_DIR / 'icon-source.svg'

SIZES = [
    ('icon-192.png', 192),
    ('icon-512.png', 512),
    ('icon-maskable-512.png', 512),
    ('shortcut-pos.png', 96),
    ('shortcut-repairs.png', 96),
]

try:
    import cairosvg
except ImportError:
    print('cairosvg not available — using manual PNG generation', file=sys.stderr)
    cairosvg = None


def render_with_cairosvg():
    for filename, size in SIZES:
        output = ICONS_DIR / filename
        cairosvg.svg2png(
            url=str(SOURCE),
            write_to=str(output),
            output_width=size,
            output_height=size,
        )
        print(f'Generated {output.name} ({size}x{size})')


def render_with_pil():
    """Fallback: simple solid-color PNG with phone silhouette."""
    from PIL import Image, ImageDraw

    for filename, size in SIZES:
        img = Image.new('RGBA', (size, size), (15, 23, 42, 255))
        draw = ImageDraw.Draw(img)

        margin = size // 4
        x0, y0 = margin, size // 6
        x1, y1 = size - margin, size - size // 6
        radius = size // 18
        draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, outline=(248, 250, 252, 255), width=max(2, size // 64))

        line_y = y0 + (y1 - y0) // 8
        draw.line([(x0 + 20, line_y), (x1 - 20, line_y)], fill=(248, 250, 252, 255), width=max(1, size // 96))

        cx, cy = size // 2, y1 - (y1 - y0) // 12
        r = max(2, size // 64)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(248, 250, 252, 255))

        img.save(ICONS_DIR / filename, 'PNG')
        print(f'Generated {filename} ({size}x{size})')


if __name__ == '__main__':
    if cairosvg:
        render_with_cairosvg()
    else:
        try:
            render_with_pil()
        except ImportError:
            print('Pillow not available either. Install: pip install cairosvg pillow', file=sys.stderr)
            sys.exit(1)
