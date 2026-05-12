"""
ui/scroll_map.py — VS Code-style scroll minimap overlay.

A narrow floating rail on the right screen edge:

  ┌──┐
  │▓▓│  heading
  │░░│  message_user
  │▓▓│  message_ai        ← viewport marker
  │▓▓│  message_ai
  │░░│  code
  │▓▓│  message_ai ★ current
  └──┘

Click a bar → scroll the target window to that section.
Keyboard: ↑/↓ arrow = prev/next section, Esc = close.

Toggled from main.py via show_scroll_map() / close_scroll_map().
Polls state.page_sections + state.current_section_idx every 400 ms.
"""

import tkinter as tk
import tkinter.ttk as ttk
from typing import Optional

import state
from ui.icons import PAW_COLOR

# ── Color palette ─────────────────────────────────────────────────────────────
_COLORS = {
    "bg":       "#13110E",
    "border":   "#38332A",
    "heading":  PAW_COLOR,
    "user":     "#4E8CB8",
    "ai":       "#5A9A6A",
    "code":     "#7A6EC0",
    "list":     "#888070",
    "generic":  "#3A3530",
    "viewport": "#FFFFFF22",    # translucent white box
    "current":  "#FFFFFF",
}

_MAP_W  = 44    # minimap width px
_BAR_W  = 28    # coloured bar width px
_MIN_H  = 4     # minimum bar height px
_MAX_MAP_H = 480


# ── Public API ────────────────────────────────────────────────────────────────

_instance: Optional["ScrollMap"] = None


def show_scroll_map(root: tk.Tk):
    global _instance
    if _instance and _instance.alive():
        return
    _instance = ScrollMap(root)


def close_scroll_map():
    global _instance
    if _instance:
        _instance.close()
        _instance = None


def toggle_scroll_map(root: tk.Tk):
    global _instance
    if _instance and _instance.alive():
        close_scroll_map()
    else:
        show_scroll_map(root)


def is_open() -> bool:
    return bool(_instance and _instance.alive())


# ── Internal section navigation ───────────────────────────────────────────────

def navigate_sections(direction: int):
    """
    direction: +1 = next section, -1 = previous section.
    Scrolls the target window and updates state.current_section_idx.
    """
    sections = getattr(state, "page_sections", [])
    if not sections:
        return
    idx = getattr(state, "current_section_idx", -1)
    new_idx = max(0, min(len(sections) - 1, idx + direction))
    if new_idx == idx:
        return
    state.current_section_idx = new_idx
    _scroll_to_section_idx(new_idx, sections)


# ── ScrollMap class ───────────────────────────────────────────────────────────

class ScrollMap:

    def __init__(self, root: tk.Tk):
        self._root   = root
        self._win    = None
        self._canvas = None
        self._bars:  list[tuple] = []   # (y0, y1, section_idx) per drawn bar
        self._vp_box = None             # canvas item for viewport rectangle
        self._after_id = None
        self._build()

    def alive(self) -> bool:
        try:
            return bool(self._win and self._win.winfo_exists())
        except Exception:
            return False

    def close(self):
        if self._after_id:
            try:
                self._root.after_cancel(self._after_id)
            except Exception:
                pass
        try:
            if self._win and self._win.winfo_exists():
                self._win.destroy()
        except Exception:
            pass

    # ── Build ─────────────────────────────────────────────────────────────────

    def _build(self):
        win = tk.Toplevel(self._root)
        win.overrideredirect(True)
        win.attributes("-topmost", True)
        win.attributes("-alpha", 0.88)
        win.configure(bg=_COLORS["bg"])
        win.wm_attributes("-transparentcolor", "")
        self._win = win

        # Position: right screen edge, vertically centred
        sw = win.winfo_screenwidth()
        sh = win.winfo_screenheight()
        map_h = min(_MAX_MAP_H, sh - 100)
        win.geometry(f"{_MAP_W}x{map_h}+{sw - _MAP_W - 4}+{(sh - map_h) // 2}")

        # Header dot
        hdr = tk.Frame(win, bg=_COLORS["bg"], height=22)
        hdr.pack(fill="x")
        hdr.pack_propagate(False)
        from ui.icons import dot_widget
        dot_widget(hdr, bg=_COLORS["bg"]).place(relx=0.5, rely=0.5, anchor="center")

        # Canvas for bars
        self._canvas = tk.Canvas(
            win, bg=_COLORS["bg"], highlightthickness=0,
            width=_MAP_W, height=map_h - 22,
        )
        self._canvas.pack(fill="both", expand=True)
        self._canvas.bind("<Button-1>", self._on_click)
        self._canvas.bind("<MouseWheel>",
                          lambda e: navigate_sections(-1 if e.delta > 0 else 1))

        win.bind("<Up>",   lambda e: navigate_sections(-1))
        win.bind("<Down>", lambda e: navigate_sections(+1))
        win.bind("<Escape>", lambda e: close_scroll_map())

        # Close button
        x_lbl = tk.Label(hdr, text="✕", bg=_COLORS["bg"], fg=_COLORS["generic"],
                         font=("Segoe UI", 7), cursor="hand2")
        x_lbl.place(relx=1.0, rely=0.5, anchor="e", x=-4)
        x_lbl.bind("<Button-1>", lambda e: close_scroll_map())

        self._redraw()

    # ── Redraw ────────────────────────────────────────────────────────────────

    def _redraw(self):
        if not self.alive():
            return

        cv       = self._canvas
        sections = getattr(state, "page_sections", [])
        cur_idx  = getattr(state, "current_section_idx", -1)

        cv.delete("all")
        self._bars = []

        if not sections:
            cv.create_text(
                _MAP_W // 2, _MAX_MAP_H // 2,
                text="·", fill=_COLORS["generic"], font=("Segoe UI", 9),
            )
            self._after_id = self._root.after(400, self._redraw)
            return

        cv_h   = cv.winfo_height() or (_MAX_MAP_H - 22)
        pad    = 4
        total_h = cv_h - pad * 2

        # Compute bar heights proportional to word count (floor at _MIN_H)
        total_words = max(1, sum(s.word_count for s in sections))
        heights = [
            max(_MIN_H, int((s.word_count / total_words) * total_h))
            for s in sections
        ]

        # Scale down if overflow
        raw_total = sum(heights)
        if raw_total > total_h:
            scale = total_h / raw_total
            heights = [max(_MIN_H, int(h * scale)) for h in heights]

        y = pad
        for sec, bar_h in zip(sections, heights):
            color  = _COLORS.get(sec.color_key, _COLORS["generic"])
            is_cur = (sec.index == cur_idx)

            # Bar
            x0 = (_MAP_W - _BAR_W) // 2
            x1 = x0 + _BAR_W
            item = cv.create_rectangle(x0, y, x1, y + bar_h - 1,
                                        fill=color, outline="")
            self._bars.append((y, y + bar_h, sec.index, item))

            # Current section marker
            if is_cur:
                cv.create_text(
                    _MAP_W - 6, y + (bar_h // 2),
                    text="★", fill=_COLORS["current"],
                    font=("Segoe UI", 7), anchor="e",
                )
                # Bright border on bar
                cv.create_rectangle(x0, y, x1, y + bar_h - 1,
                                    fill="", outline=_COLORS["current"], width=1)

            # Section-type icon (1-char)
            icon = _ICON.get(sec.color_key, "")
            if icon and bar_h >= 10:
                cv.create_text(
                    _MAP_W // 2, y + bar_h // 2,
                    text=icon, fill=_darken(color),
                    font=("Segoe UI", 7), anchor="center",
                )

            y += bar_h

        self._after_id = self._root.after(400, self._redraw)

    # ── Click to jump ─────────────────────────────────────────────────────────

    def _on_click(self, event):
        cy = event.y
        for y0, y1, sec_idx, _ in self._bars:
            if y0 <= cy <= y1:
                state.current_section_idx = sec_idx
                _scroll_to_section_idx(sec_idx,
                                        getattr(state, "page_sections", []))
                break


# ── Section scrolling ─────────────────────────────────────────────────────────

def _scroll_to_section_idx(idx: int, sections):
    """Scroll the target window so that section `idx` is at the top of viewport."""
    if not sections or idx < 0 or idx >= len(sections):
        return

    total = len(sections)
    pct   = (idx / max(1, total - 1)) * 100.0   # 0–100

    try:
        from plat import platform as get_platform
        plat = get_platform()
        win  = plat.get_active_window()
        if win:
            _scroll_window_to_pct(plat, win, pct)
    except Exception:
        pass


def _scroll_window_to_pct(plat, window_info, pct: float):
    """
    Attempt to scroll the target window to `pct` percent (0–100).

    Strategy order:
      1. UIA ScrollPattern.SetScrollPercent  (Chrome, Edge, most apps)
      2. pyautogui keyboard simulation        (Home/End/Page keys)
    """
    # Strategy 1 — UIA ScrollPattern
    try:
        if hasattr(plat, "_uia") and plat._uia and window_info.handle:
            import comtypes.gen.UIAutomationClient as _UIA
            root_el = plat._uia.ElementFromHandle(window_info.handle)

            # Find the scrollable container (usually document or web area)
            _walk_scroll(plat._uia, root_el, pct)
            return
    except Exception:
        pass

    # Strategy 2 — keyboard simulation
    try:
        import pyautogui as _pg
        import time as _t
        if pct < 5:
            _pg.hotkey("ctrl", "home")
        elif pct > 95:
            _pg.hotkey("ctrl", "end")
        else:
            # Approximate with page keys
            # First go home, then page-down proportionally
            _pg.hotkey("ctrl", "home")
            _t.sleep(0.05)
            pages = int(pct / 10)
            for _ in range(pages):
                _pg.press("pagedown")
                _t.sleep(0.03)
    except Exception:
        pass


def _walk_scroll(uia, element, pct: float, depth: int = 0):
    """Recurse into UIA tree looking for a ScrollPattern."""
    if depth > 6:
        return False
    try:
        sp = element.GetCurrentPattern(10004)  # UIA_ScrollPatternId
        if sp:
            import comtypes.gen.UIAutomationClient as _UIA
            isp = sp.QueryInterface(_UIA.IUIAutomationScrollPattern)
            can_v = isp.CurrentVerticallyScrollable
            if can_v:
                isp.SetScrollPercent(-1, pct)  # -1 = NoScroll horizontal
                return True
    except Exception:
        pass

    try:
        import comtypes.gen.UIAutomationClient as _UIA
        children = element.FindAll(_UIA.TreeScope_Children,
                                   uia.CreateTrueCondition())
        for i in range(min(children.Length, 12)):
            if _walk_scroll(uia, children.GetElement(i), pct, depth + 1):
                return True
    except Exception:
        pass
    return False


# ── Helpers ───────────────────────────────────────────────────────────────────

_ICON = {
    "heading": "H",
    "user":    "U",
    "ai":      "A",
    "code":    "{}",
    "list":    "≡",
    "generic": "",
}


def _darken(hex_color: str, factor: float = 0.5) -> str:
    """Darken a hex color for icon overlay."""
    try:
        h = hex_color.lstrip("#")
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        r = int(r * factor); g = int(g * factor); b = int(b * factor)
        return f"#{r:02x}{g:02x}{b:02x}"
    except Exception:
        return "#222"
