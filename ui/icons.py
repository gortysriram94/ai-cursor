"""
ui/icons.py — flame icon (SVG-rendered via PIL), color constants, dot_widget helper.
"""

import re
import tkinter as tk
from PIL import Image, ImageDraw, ImageTk


# ── Color palette ─────────────────────────────────────────────────────────────

PAW_COLOR      = "#DA7756"   # accent
PAW_COLOR_DARK = "#C05E3E"   # accent-dim
PAW_COLOR_SOFT = "#F0A482"   # accent-soft

BG      = "#0f0f0f"
BG2     = "#1a1a1a"
DIVIDER = "#1e1e1e"
FG      = "#e0e0e0"
FG_DIM  = "#555555"
FG_MUT  = "#333333"
BTN_ACT = "#c05e3e"


# ── SVG flame paths (viewBox 0 0 24 24) ──────────────────────────────────────
# Source: Lucide flame icon, two-path structure

_SVG_OUTER = (
    "M12 21C17.0495 21 20 18.0956 20 13.125"
    "C20 8.15444 12 3 12 3"
    "C12 3 4 8.15444 4 13.125"
    "C4 18.0956 6.95054 21 12 21Z"
)
_SVG_INNER = (
    "M8 18C8 20.4148 9.79086 21 12 21"
    "C15.7587 21 17 18.5 14.5 13.5"
    "C11 18 10.5 11 11 9"
    "C9.5 12 8 14.8177 8 18Z"
)

_CMD = frozenset("MmCcZzLlHhVvSsQqTtAa")
_photo_cache: dict = {}


# ── Path math ─────────────────────────────────────────────────────────────────

def _cbez(x0, y0, x1, y1, x2, y2, x3, y3, n: int = 32):
    """Sample a cubic bezier curve into n points."""
    pts = []
    for k in range(1, n + 1):
        t = k / n
        u = 1.0 - t
        pts.append((
            u**3*x0 + 3*u**2*t*x1 + 3*u*t**2*x2 + t**3*x3,
            u**3*y0 + 3*u**2*t*y1 + 3*u*t**2*y2 + t**3*y3,
        ))
    return pts


def _path_pts(d: str) -> list[tuple[float, float]]:
    """Convert an SVG path d-string (M and C commands only) to a point list."""
    toks = re.findall(
        r"[MmCcZzLlHhVvSsQqTtAa]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?",
        d,
    )
    pts: list[tuple[float, float]] = []
    cx = cy = sx = sy = 0.0
    i = 0

    while i < len(toks):
        cmd = toks[i]
        i += 1

        if cmd == "M":
            cx, cy = float(toks[i]), float(toks[i + 1])
            i += 2
            sx, sy = cx, cy
            pts.append((cx, cy))

        elif cmd == "C":
            while i + 5 < len(toks) and toks[i] not in _CMD:
                x1c, y1c = float(toks[i]),     float(toks[i + 1])
                x2c, y2c = float(toks[i + 2]), float(toks[i + 3])
                ex,  ey  = float(toks[i + 4]), float(toks[i + 5])
                pts.extend(_cbez(cx, cy, x1c, y1c, x2c, y2c, ex, ey))
                cx, cy = ex, ey
                i += 6

        elif cmd in ("Z", "z"):
            pts.append((sx, sy))

    return pts


# ── Flame renderer ────────────────────────────────────────────────────────────

def _render_flame(size: int, bg: str) -> Image.Image:
    """Render the flame at size×size pixels onto a solid bg colour."""
    AA = 4              # supersampling factor
    W  = size * AA
    sc = W / 24.0       # scale: SVG viewBox (24×24) → W×W

    bg_rgb = (int(bg[1:3], 16), int(bg[3:5], 16), int(bg[5:7], 16))
    img    = Image.new("RGB", (W, W), bg_rgb)
    draw   = ImageDraw.Draw(img)

    def _sc(pts):
        return [(x * sc, y * sc) for x, y in pts]

    outer = _sc(_path_pts(_SVG_OUTER))
    inner = _sc(_path_pts(_SVG_INNER))

    # Base flame body — deep orange
    if outer:
        draw.polygon(outer, fill="#E8531A")

    # Mid glow layer — use a slightly inset version of outer to fake a gradient
    # (shift every point 8% inward toward the centroid)
    if outer:
        cx_o = sum(p[0] for p in outer) / len(outer)
        cy_o = sum(p[1] for p in outer) / len(outer)
        mid  = [(p[0] * 0.72 + cx_o * 0.28,
                 p[1] * 0.72 + cy_o * 0.28) for p in outer]
        draw.polygon(mid, fill="#FF7C2A")

    # Core highlight — bright yellow inner path
    if inner:
        draw.polygon(inner, fill="#FFD23F")

    # Tip highlight — tiny bright spot at the top of the inner flame
    if inner:
        tip_y = min(p[1] for p in inner)
        tip_x = sum(p[0] for p in inner if abs(p[1] - tip_y) < W * 0.05) / max(
            1, sum(1 for p in inner if abs(p[1] - tip_y) < W * 0.05)
        )
        r = W * 0.07
        draw.ellipse([tip_x - r, tip_y - r * 0.5,
                      tip_x + r, tip_y + r * 1.5], fill="#FFFAAA")

    # Dark outline for crisp edge at larger sizes
    stroke_w = max(1, AA // 2)
    if outer:
        draw.line(outer + [outer[0]], fill="#5C1500", width=stroke_w)

    return img.resize((size, size), Image.LANCZOS)


# ── Public API ────────────────────────────────────────────────────────────────

def create_paw_photo(size: int, color: str, bg: str) -> ImageTk.PhotoImage:
    """Return the flame icon as a Tkinter PhotoImage composited onto bg.
    `color` is accepted for API compatibility but the flame uses its own colours."""
    key = (size, bg)
    if key not in _photo_cache:
        _photo_cache[key] = ImageTk.PhotoImage(_render_flame(size, bg))
    return _photo_cache[key]


def dot_widget(parent: tk.Widget, bg: str = None) -> tk.Label:
    """Small flame icon label for use in window headers."""
    bg    = bg or BG
    photo = create_paw_photo(16, PAW_COLOR, bg)
    lbl   = tk.Label(parent, image=photo, bg=bg, bd=0, padx=0, pady=0)
    lbl.image = photo
    return lbl


# ── System cursor ─────────────────────────────────────────────────────────────

import io as _io
import os as _os
import struct as _struct
import tempfile as _tempfile
import atexit as _atexit
import ctypes as _ctypes

_cursor_active: list[bool] = [False]


def _render_flame_alpha(size: int) -> Image:
    """Render the flame on a transparent (RGBA) background for cursor use."""
    AA = 4
    W  = size * AA
    sc = W / 24.0

    img  = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    def _sc(pts):
        return [(x * sc, y * sc) for x, y in pts]

    outer = _sc(_path_pts(_SVG_OUTER))
    inner = _sc(_path_pts(_SVG_INNER))

    if outer:
        draw.polygon(outer, fill=(232, 83, 26, 255))
        cx_o = sum(p[0] for p in outer) / len(outer)
        cy_o = sum(p[1] for p in outer) / len(outer)
        mid  = [(p[0]*0.72 + cx_o*0.28, p[1]*0.72 + cy_o*0.28) for p in outer]
        draw.polygon(mid, fill=(255, 124, 42, 255))
    if inner:
        draw.polygon(inner, fill=(255, 210, 63, 255))
        tip_y   = min(p[1] for p in inner)
        tip_pts = [p for p in inner if abs(p[1] - tip_y) < W * 0.05]
        if tip_pts:
            tip_x = sum(p[0] for p in tip_pts) / len(tip_pts)
            r = W * 0.07
            draw.ellipse([tip_x - r, tip_y - r*0.5,
                          tip_x + r, tip_y + r*1.5], fill=(255, 250, 170, 255))
    if outer:
        draw.line(outer + [outer[0]], fill=(92, 21, 0, 255),
                  width=max(1, AA // 2))

    return img.resize((size, size), Image.LANCZOS)


def _build_cur_bytes(size: int) -> bytes:
    """Render the flame and return a valid Windows .cur file as bytes."""
    buf = _io.BytesIO()
    _render_flame_alpha(size).save(buf, format="ICO", sizes=[(size, size)])
    data = bytearray(buf.getvalue())

    # ICONDIR.idType: 1 (icon) → 2 (cursor)
    _struct.pack_into("<H", data, 2, 2)
    # ICONDIRENTRY hotspot (offset 10/12): flame tip ≈ centre-X, 1/8 from top
    _struct.pack_into("<H", data, 10, size // 2)
    _struct.pack_into("<H", data, 12, max(1, size // 8))
    return bytes(data)


def set_flame_cursor() -> bool:
    """Set the Windows default arrow cursor to the flame icon.
    Returns True on success. No-op on non-Windows."""
    import sys
    if sys.platform != "win32":
        return False
    try:
        SM_CXCURSOR = 13
        size    = max(32, _ctypes.windll.user32.GetSystemMetrics(SM_CXCURSOR))
        cur     = _build_cur_bytes(size)
        tf      = _tempfile.NamedTemporaryFile(suffix=".cur", delete=False)
        tf.write(cur)
        tf.close()
        hcursor = _ctypes.windll.user32.LoadCursorFromFileW(tf.name)
        try:
            _os.unlink(tf.name)
        except Exception:
            pass
        if hcursor:
            _ctypes.windll.user32.SetSystemCursor(hcursor, 32512)  # OCR_NORMAL
            _cursor_active[0] = True
            return True
    except Exception as e:
        from log import log
        log(f"[CURSOR] set_flame_cursor: {e}")
    return False


def restore_default_cursor():
    """Restore all system cursors to their OS defaults. No-op on non-Windows."""
    import sys
    if sys.platform != "win32":
        return
    try:
        _ctypes.windll.user32.SystemParametersInfoW(0x0057, 0, None, 0)
        _cursor_active[0] = False
    except Exception as e:
        from log import log
        log(f"[CURSOR] restore_default_cursor: {e}")


def is_flame_cursor_active() -> bool:
    return _cursor_active[0]


_atexit.register(restore_default_cursor)  # always clean up on exit
