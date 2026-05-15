"""
tray.py — system tray icon and notifications.

Uses the same flame icon as the mouse cursor.
Icons are pre-rendered on the main thread at startup to avoid
cross-thread PIL/tkinter issues.

States: loading (grey flame) → downloading (dimmed flame) → ready (full flame)
"""
import threading
from log import log

_icon       = None
_AVAILABLE  = False
_img_cache: dict = {}   # state -> PIL Image, pre-rendered on main thread

try:
    import pystray
    from PIL import Image, ImageDraw
    _AVAILABLE = True
except ImportError:
    pass


# ── Icon rendering ────────────────────────────────────────────────────────────

def _render(state: str, size: int = 64) -> "Image.Image":
    """
    Render the tray icon for the given state.
    Uses the same flame SVG as the mouse cursor via ui/icons._render_flame().
    Must be called on the main thread (or after pre-render).
    """
    # Return cached image if available
    key = f"{state}:{size}"
    if key in _img_cache:
        return _img_cache[key]

    try:
        from ui.icons import _render_flame
        base = _render_flame(size, "#1A1611").convert("RGB")

        if state == "loading":
            # Grey/desaturated — app is still starting
            from PIL import ImageEnhance
            img = ImageEnhance.Color(base).enhance(0)       # remove colour
            img = ImageEnhance.Brightness(img).enhance(0.45)
        elif state == "downloading":
            # Slightly dimmed — model is downloading
            from PIL import ImageEnhance
            img = ImageEnhance.Brightness(base).enhance(0.75)
        else:
            # Full-brightness flame — ready
            img = base

        # pystray needs RGBA on some platforms
        img = img.convert("RGBA")
        _img_cache[key] = img
        return img

    except Exception as e:
        log(f"[TRAY] flame render failed ({state}): {e} — using fallback")
        img = _fallback(state, size)
        _img_cache[key] = img
        return img


def _fallback(state: str, size: int = 64) -> "Image.Image":
    """Simple colored circle used when flame renderer is unavailable."""
    colors = {
        "loading":     ("#2A2520", "#4A4540"),
        "downloading": ("#1A1611", "#C86040"),
        "ready":       ("#1A1611", "#DA7756"),
    }
    bg, fg = colors.get(state, colors["ready"])
    img  = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([0, 0, size - 1, size - 1], fill=bg)
    pad = size // 5
    draw.ellipse([pad, pad, size - pad - 1, size - pad - 1], fill=fg)
    return img


def preload_icons(size: int = 64) -> None:
    """
    Pre-render all icon states on the main thread.
    Call this once after Tkinter root is created, before start_tray().
    """
    if not _AVAILABLE:
        return
    for state in ("loading", "downloading", "ready"):
        _render(state, size)
    log("[TRAY] icons pre-rendered")


# ── Public API ────────────────────────────────────────────────────────────────

def start_tray(open_dashboard_fn=None, quit_fn=None) -> None:
    """
    Start the system tray icon. Returns immediately — icon runs in a daemon thread.
    Call preload_icons() on the main thread before calling this.
    """
    global _icon
    if not _AVAILABLE:
        log("[TRAY] pystray not available — tray disabled")
        return

    def _on_open(icon, item):
        if open_dashboard_fn:
            try:
                open_dashboard_fn()
            except Exception as e:
                log(f"[TRAY] open: {e}")

    def _on_quit(icon, item):
        icon.stop()
        if quit_fn:
            try:
                quit_fn()
            except Exception as e:
                log(f"[TRAY] quit: {e}")

    menu = pystray.Menu(
        pystray.MenuItem("Open Dashboard", _on_open, default=True),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quit AI Cursor", _on_quit),
    )

    _icon = pystray.Icon(
        name  = "AIcursor",
        icon  = _render("loading"),
        title = "AI Cursor — Starting…",
        menu  = menu,
    )

    def _run():
        try:
            _icon.run()
        except Exception as e:
            log(f"[TRAY] run error: {e}")

    threading.Thread(target=_run, daemon=True, name="tray").start()
    log("[TRAY] system tray icon started")


def set_state(state: str, tooltip: str = "") -> None:
    """Update tray icon. state: 'loading' | 'downloading' | 'ready'"""
    global _icon
    if not _AVAILABLE or _icon is None:
        return
    labels = {
        "loading":     "AI Cursor — Starting…",
        "downloading": "AI Cursor — Downloading model…",
        "ready":       "AI Cursor — Ready  (Alt+A)",
    }
    try:
        _icon.icon  = _render(state)
        _icon.title = tooltip or labels.get(state, "AI Cursor")
    except Exception as e:
        log(f"[TRAY] set_state: {e}")


def notify(title: str, message: str) -> None:
    """Show a notification balloon / system notification."""
    global _icon
    if not _AVAILABLE or _icon is None:
        return
    try:
        _icon.notify(message, title)
    except Exception as e:
        log(f"[TRAY] notify: {e}")


def stop() -> None:
    """Remove the tray icon cleanly on app exit."""
    global _icon
    if _icon is not None:
        try:
            _icon.stop()
        except Exception:
            pass
        _icon = None
