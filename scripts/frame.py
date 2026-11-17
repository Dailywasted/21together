"""Wrap a raw 393x760 @3x phone screenshot in an iPhone-style frame (status bar, Dynamic Island, bezel).
Usage: python scripts/frame.py <in.png> <out.png> [out_width=600]
Screenshots come from scripts/readme-shots.mjs. Needs Pillow.
"""
import sys
from PIL import Image, ImageDraw, ImageFont

S = 3  # device pixel ratio
SCREEN_W, SCREEN_H = 393 * S, 852 * S
STATUS_H, HOME_H = 54 * S, 38 * S
RADIUS = 55 * S
BEZEL, RIM = 14 * S, 2 * S


def font(size):
    for name in ("seguisb.ttf", "SF-Pro-Text-Semibold.otf", "DejaVuSans-Bold.ttf", "Arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def main(src, dst, out_w=600):
    shot = Image.open(src).convert("RGB")
    shot = shot.resize((SCREEN_W, round(shot.height * SCREEN_W / shot.width)), Image.LANCZOS)
    page_h = min(shot.height, SCREEN_H - STATUS_H - HOME_H)

    # Screen: status bar + page + home-indicator area. The bars stretch the page's own edge rows so the background flows.
    screen = Image.new("RGB", (SCREEN_W, SCREEN_H))
    screen.paste(shot.crop((0, 0, SCREEN_W, 1)).resize((SCREEN_W, STATUS_H)), (0, 0))
    screen.paste(shot.crop((0, 0, SCREEN_W, page_h)), (0, STATUS_H))
    screen.paste(shot.crop((0, page_h - 1, SCREEN_W, page_h)).resize((SCREEN_W, SCREEN_H - STATUS_H - page_h)), (0, STATUS_H + page_h))
    d = ImageDraw.Draw(screen)
    white = (255, 255, 255)
    # Time
    d.text((50 * S, 30 * S), "9:41", font=font(17 * S), fill=white, anchor="mm")
    # Dynamic Island
    iw, ih, iy = 125 * S, 37 * S, 11 * S
    d.rounded_rectangle(((SCREEN_W - iw) // 2, iy, (SCREEN_W + iw) // 2, iy + ih), radius=ih // 2, fill=(0, 0, 0))
    # Signal bars
    x0, base = 300 * S, 36 * S
    for i, h in enumerate((4, 6, 8.5, 11)):
        x = x0 + i * 5 * S
        d.rounded_rectangle((x, base - h * S, x + 3 * S, base), radius=S, fill=white)
    # Wi-Fi (three arcs)
    cx, cy = 333 * S, 37 * S
    for r in (10, 6.5):
        d.arc((cx - r * S, cy - r * S, cx + r * S, cy + r * S), 225, 315, fill=white, width=round(2.2 * S))
    d.pieslice((cx - 2.5 * S, cy - 2.5 * S, cx + 2.5 * S, cy + 2.5 * S), 225, 315, fill=white)
    # Battery
    bx, by = 349 * S, 25 * S
    d.rounded_rectangle((bx, by, bx + 25 * S, by + 12 * S), radius=4 * S, outline=(160, 160, 160), width=S)
    d.rounded_rectangle((bx + 2 * S, by + 2 * S, bx + 23 * S, by + 10 * S), radius=2 * S, fill=white)
    d.rounded_rectangle((bx + 26 * S, by + 4 * S, bx + 27.5 * S, by + 8 * S), radius=S, fill=(160, 160, 160))
    # Home indicator
    hw = 134 * S
    d.rounded_rectangle(((SCREEN_W - hw) // 2, SCREEN_H - 13 * S, (SCREEN_W + hw) // 2, SCREEN_H - 8 * S), radius=3 * S, fill=white)

    # Device: rim, black bezel, rounded screen.
    pad = BEZEL + RIM
    W, H = SCREEN_W + 2 * pad, SCREEN_H + 2 * pad
    device = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dd = ImageDraw.Draw(device)
    dd.rounded_rectangle((0, 0, W - 1, H - 1), radius=RADIUS + pad, fill=(58, 58, 62, 255))
    dd.rounded_rectangle((RIM, RIM, W - 1 - RIM, H - 1 - RIM), radius=RADIUS + BEZEL, fill=(8, 8, 10, 255))
    mask = Image.new("L", (SCREEN_W, SCREEN_H), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, SCREEN_W - 1, SCREEN_H - 1), radius=RADIUS, fill=255)
    device.paste(screen, (pad, pad), mask)

    out_h = round(H * out_w / W)
    device.resize((out_w, out_h), Image.LANCZOS).save(dst, optimize=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 600)
