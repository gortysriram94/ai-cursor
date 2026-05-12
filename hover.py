"""
hover.py — UIA imports, _uia_element_at, _hover_loop, _make_highlight_win,
           load/save hover prefs.
"""

import time

import pyautogui
import tkinter as tk

from log import log
import state
from storage import load_hover_highlight, save_hover_highlight


# ── UIA setup ─────────────────────────────────────────────────────────────────

try:
    import comtypes
    import comtypes.client
    comtypes.client.GetModule("UIAutomationCore.dll")
    import comtypes.gen.UIAutomationClient as UIA
    _uia = comtypes.client.CreateObject(
        "{ff48dba4-60ef-4201-aa87-54103eef594e}",
        interface=UIA.IUIAutomation,
    )
    UIA_AVAILABLE = True
except Exception:
    UIA_AVAILABLE = False
    _uia         = None
    UIA          = None


# ── UIA control type sets ─────────────────────────────────────────────────────

_UIA_TEXT_TYPES  = {50020, 50021, 50025, 50031}
_UIA_IMAGE_TYPES = {50006}
_UIA_VIDEO_TYPES = {50034}


# ── Element inspection ────────────────────────────────────────────────────────

def _uia_element_at(x: int, y: int) -> dict:
    """Return {text, rect, type} for the UIA element at screen coords."""
    if not UIA_AVAILABLE:
        return {}
    try:
        pt = UIA.tagPOINT(x=x, y=y)
        el = _uia.ElementFromPoint(pt)
        if not el:
            return {}

        rect  = el.CurrentBoundingRectangle
        ctype = el.CurrentControlType
        box   = (rect.left, rect.top, rect.right, rect.bottom)

        if ctype in _UIA_IMAGE_TYPES:
            return {"text": "", "rect": box, "type": "image"}
        if ctype in _UIA_VIDEO_TYPES:
            return {"text": "", "rect": box, "type": "video"}

        text = ""
        try:
            tp = el.GetCurrentPattern(10014)
            if tp:
                text = tp.DocumentRange.GetText(2000)
        except Exception:
            pass
        if not text:
            try:
                text = el.CurrentName or ""
            except Exception:
                pass
        if not text:
            try:
                text = el.CurrentValue or ""
            except Exception:
                pass

        etype = "text" if text.strip() else "other"
        return {"text": text.strip(), "rect": box, "type": etype}
    except Exception:
        return {}


# ── Hover polling loop ────────────────────────────────────────────────────────

def _hover_loop(root: tk.Tk, highlight_win: list):
    """Background thread: poll cursor position, update _hover_state, move highlight."""
    _last_pos = [-1, -1]

    while True:
        time.sleep(0.12)
        try:
            x, y = pyautogui.position()
            if abs(x - _last_pos[0]) < 4 and abs(y - _last_pos[1]) < 4:
                continue
            _last_pos[0], _last_pos[1] = x, y

            info = _uia_element_at(x, y)
            if info:
                state._hover_state.update(info)

                hw = highlight_win[0]
                if hw and info.get("rect"):
                    l, t, r, b = info["rect"]
                    w, h = max(r - l, 1), max(b - t, 1)
                    try:
                        root.after(0, lambda l=l, t=t, w=w, h=h: (
                            highlight_win[0] and
                            highlight_win[0].geometry(f"{w}x{h}+{l}+{t}")
                        ))
                    except Exception:
                        pass
        except Exception:
            pass


# ── Highlight window ──────────────────────────────────────────────────────────

def _make_highlight_win(root: tk.Tk) -> tk.Toplevel:
    """Create a borderless transparent window that draws an orange outline."""
    from ui.icons import PAW_COLOR

    hw = tk.Toplevel(root)
    hw.overrideredirect(True)
    hw.attributes("-topmost",           True)
    hw.attributes("-alpha",             0.35)
    hw.attributes("-transparentcolor",  "#000001")
    hw.configure(bg="#000001")
    hw.geometry("1x1+0+0")

    canvas = tk.Canvas(hw, bg="#000001", highlightthickness=0)
    canvas.pack(fill="both", expand=True)

    def _redraw(event=None):
        canvas.delete("all")
        w, h = hw.winfo_width(), hw.winfo_height()
        canvas.create_rectangle(2, 2, w - 2, h - 2,
                                 outline=PAW_COLOR, width=2, fill="")

    hw.bind("<Configure>", _redraw)
    return hw
