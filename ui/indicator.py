"""
ui/indicator.py — Context status indicator near the cursor.

A tiny always-on-top window that follows the cursor and shows:
  ·  (pulsing)  — brain is building context
  ●  (solid)    — context is ready, Alt+A will open a pre-loaded panel
  (empty)       — app just started, no context yet

The window background is transparent so only the dot character is visible.
It is fully click-through: the transparent background passes all mouse
events to whatever is underneath.
"""

import tkinter as tk
import state

# Pixel offset from the cursor tip so the dot doesn't cover the click target
_OFF_X = 14
_OFF_Y = 12

# Transparent background colour — must be unique (not used anywhere else)
_TRANSP = "#000004"

_PULSE = ["·", " ·", "  ·", " ·"]   # four-frame pulse animation


def make_indicator(root: tk.Tk) -> tk.Toplevel:
    """
    Create the indicator window and start its update loop.
    Returns the Toplevel so main.py can keep a reference.
    """
    win = tk.Toplevel(root)
    win.overrideredirect(True)
    win.attributes("-topmost", True)
    win.attributes("-transparentcolor", _TRANSP)
    win.configure(bg=_TRANSP)
    win.geometry("28x16+0+0")

    lbl = tk.Label(
        win, text="", bg=_TRANSP,
        font=("Segoe UI", 7, "bold"),
        padx=0, pady=0, bd=0,
    )
    lbl.pack()

    _s = {"frame": 0}

    def _tick():
        try:
            from plat import platform as get_platform
            x, y = get_platform().get_cursor_position()
            win.geometry(f"+{x + _OFF_X}+{y + _OFF_Y}")

            if state.context_ready:
                lbl.configure(text="●", fg="#DA7756")   # accent — ready
            elif state.working_context is not None:
                # Brain is building — pulse
                _s["frame"] = (_s["frame"] + 1) % len(_PULSE)
                lbl.configure(text=_PULSE[_s["frame"]], fg="#6A5A50")
            else:
                lbl.configure(text="")

        except Exception:
            pass

        root.after(220, _tick)

    root.after(220, _tick)
    return win
