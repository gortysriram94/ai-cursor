"""
tray.py — system tray icon and notifications.

Provides immediate visual feedback that the app is running.
States: loading → downloading → ready

Works on Windows (win32 backend) and macOS (AppKit backend).
Gracefully disabled if pystray is not installed.
"""
import threading
from log import log

_icon = None
_AVAILABLE = False

try:
    import pystray
    from PIL import Image, ImageDraw
    _AVAILABLE = True
except ImportError:
    pass


# ── Icon image builder ────────────────────────────────────────────────────────

def _make_image(state: str, size: int = 64) -> "Image.Image":
    """
    Build the tray icon for the given state.
    Tries to use the app's flame icon; falls back to a clean geometric icon.
    """
    try:
        from ui.icons import _render_flame
        img = _render_flame(size, "#1A1611")
        if state == "loading":
            # Desaturate for "not ready yet" appearance
            r, g, b, a = img.split()
            gray = r.point(lambda x: int(x * 0.35))
            g2   = g.point(lambda x: int(x * 0.35))
            b2   = b.point(lambda x: int(x * 0.35))
            img = Image.merge("RGBA", (gray, g2, b2, a))
        return img
    except Exception:
        return _fallback_image(state, size)


def _fallback_image(state: str, size: int = 64) -> "Image.Image":
    """Simple geometric icon used when flame renderer is unavailable."""
    from PIL import Image, ImageDraw
    colors = {
        "loading":     ("#3A3530", "#5A5550"),
        "downloading": ("#1A1611", "#C86040"),
        "ready":       ("#1A1611", "#DA7756"),
    }
    bg, fg = colors.get(state, colors["ready"])
    img  = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([0, 0, size - 1, size - 1], fill=bg)
    pad = size // 5
    draw.ellipse([pad, pad, size - pad - 1, size - pad - 1], fill=fg)
    if state == "ready":
        # Small highlight dot
        hp = size // 3
        hs = size // 6
        draw.ellipse([hp, hp, hp + hs, hp + hs], fill="#F0A482")
    return img


# ── Public API ────────────────────────────────────────────────────────────────

def start_tray(open_dashboard_fn=None, quit_fn=None) -> None:
    """
    Start the system tray icon. Returns immediately; icon runs in a daemon thread.
    open_dashboard_fn: called (on Tk main thread via root.after) when user clicks icon
    quit_fn: called when user selects Quit from tray menu
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
        name    = "AIcursor",
        icon    = _make_image("loading"),
        title   = "AI Cursor — Starting…",
        menu    = menu,
    )

    def _run():
        try:
            _icon.run()
        except Exception as e:
            log(f"[TRAY] run error: {e}")

    threading.Thread(target=_run, daemon=True, name="tray").start()
    log("[TRAY] system tray icon started")


def set_state(state: str, tooltip: str = "") -> None:
    """
    Update the tray icon appearance.
    state: "loading" | "downloading" | "ready"
    """
    global _icon
    if not _AVAILABLE or _icon is None:
        return
    labels = {
        "loading":     "AI Cursor — Starting…",
        "downloading": "AI Cursor — Downloading model…",
        "ready":       "AI Cursor — Ready  (Alt+A)",
    }
    try:
        _icon.icon  = _make_image(state)
        _icon.title = tooltip or labels.get(state, "AI Cursor")
    except Exception as e:
        log(f"[TRAY] set_state: {e}")


def notify(title: str, message: str) -> None:
    """
    Show a notification balloon from the tray icon.
    On Windows: balloon tooltip from the tray.
    On macOS: Notification Center entry.
    """
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
