"""
capture.py — screenshot capture and dominant color extraction.
"""

import io
import base64

from PIL import ImageGrab, Image

from config import WIN32_AVAILABLE
from log import log


def capture_screenshot_b64(hwnd=None, crop=None) -> str:
    """Return a base64-encoded JPEG of the screen (or a crop/window region)."""
    try:
        if crop:
            l, t, r, b = crop
            img = ImageGrab.grab(bbox=(l, t, r, b))
        elif WIN32_AVAILABLE:
            import win32gui
            target = hwnd or win32gui.GetForegroundWindow()
            rect   = win32gui.GetWindowRect(target)
            img    = ImageGrab.grab(bbox=rect)
        else:
            img = ImageGrab.grab()

        max_w = 1280
        if img.width > max_w:
            ratio = max_w / img.width
            img   = img.resize((max_w, int(img.height * ratio)))

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        b64 = base64.b64encode(buf.getvalue()).decode()
        log(f"[SCREENSHOT] {img.width}x{img.height} — {len(b64)//1024}KB")
        return b64
    except Exception as e:
        log(f"[SCREENSHOT ERROR] {e}")
        return ""


def extract_dominant_colors(crop_b64: str, n: int = 5) -> list:
    """Sample pixels from a b64 image and return top-N distinct hex colors."""
    try:
        from collections import Counter
        img_data = base64.b64decode(crop_b64)
        img = Image.open(io.BytesIO(img_data)).convert("RGB")
        img = img.resize((60, 60), Image.LANCZOS)
        pixels = list(img.getdata())

        def quantize(r, g, b, step=24):
            return (r // step * step, g // step * step, b // step * step)

        counts = Counter(quantize(*p) for p in pixels)
        results = []
        for (r, g, b), _ in counts.most_common(n * 4):
            if r > 235 and g > 235 and b > 235:
                continue
            if r < 18 and g < 18 and b < 18:
                continue
            results.append(f"#{r:02x}{g:02x}{b:02x}")
            if len(results) >= n:
                break
        return results
    except Exception as e:
        log(f"[COLORS] Extraction failed: {e}")
        return []
