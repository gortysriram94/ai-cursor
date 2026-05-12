"""
ui/compact_notify.py — "Ready to compact" notification.

A small floating card that appears near the cursor when the brain
detects a completed task.  Non-intrusive — auto-dismisses after 9s.

  ┌──────────────────────────────────────────┐
  │  🔥  Ready to compact                    │
  │  Replied to complaint — Zendesk          │
  │  [Save]   [Edit]   [Dismiss]             │
  └──────────────────────────────────────────┘

- Save    → routes compact to default destination immediately
- Edit    → opens compact_editor for review before saving
- Dismiss → discards this compact
"""

import tkinter as tk
from ui.icons import PAW_COLOR, dot_widget


_BG     = "#1A1611"
_PANEL  = "#211E18"
_BORDER = "#38332A"
_FG     = "#F0EAE0"
_DIM    = "#C8BEB0"
_MUTED  = "#5A504A"
_ACCENT = PAW_COLOR


def show_compact_notify(root: tk.Tk, record, cx: int, cy: int,
                        on_save, on_edit, on_dismiss):
    """
    Display the compact notification near (cx, cy).

    Callbacks:
      on_save()       — user chose to save with default destination
      on_edit()       — user wants to review before saving
      on_dismiss()    — user discarded this compact
    """
    win = tk.Toplevel(root)
    win.overrideredirect(True)
    win.attributes("-topmost", True)
    win.attributes("-alpha", 0.97)
    win.configure(bg=_BORDER)

    outer = tk.Frame(win, bg=_BG)
    outer.pack(fill="both", expand=True, padx=1, pady=1)

    # ── Header ────────────────────────────────────────────────────────────────
    hdr = tk.Frame(outer, bg=_BG, padx=12, pady=8)
    hdr.pack(fill="x")

    dot_widget(hdr, bg=_BG).pack(side="left", padx=(0, 7))
    tk.Label(hdr, text="Ready to compact", bg=_BG, fg=_FG,
             font=("Segoe UI", 9, "bold")).pack(side="left")

    # ── Task description ──────────────────────────────────────────────────────
    task_text = record.task or "Task completed"
    app_text  = record.app or ""
    desc = f"{task_text[:60]}{'…' if len(task_text) > 60 else ''}"
    if app_text:
        desc += f"  ·  {app_text}"

    tk.Label(outer, text=desc, bg=_BG, fg=_DIM,
             font=("Segoe UI", 8), anchor="w", padx=12,
             wraplength=280).pack(fill="x", pady=(0, 6))

    # ── Divider ───────────────────────────────────────────────────────────────
    tk.Frame(outer, bg=_BORDER, height=1).pack(fill="x")

    # ── Action buttons ────────────────────────────────────────────────────────
    btn_row = tk.Frame(outer, bg=_BG, padx=10, pady=8)
    btn_row.pack(fill="x")

    def _close():
        try: win.destroy()
        except Exception: pass

    def _save(e=None):
        _close()
        on_save()

    def _edit(e=None):
        _close()
        on_edit()

    def _dismiss(e=None):
        _close()
        on_dismiss()

    for text, cmd, primary in [
        ("Save",    _save,    True),
        ("Edit",    _edit,    False),
        ("Dismiss", _dismiss, False),
    ]:
        bg = _ACCENT if primary else _PANEL
        fg = _BG     if primary else _DIM
        b = tk.Label(btn_row, text=text, bg=bg, fg=fg,
                     font=("Segoe UI", 8, "bold" if primary else "normal"),
                     padx=12, pady=5, cursor="hand2")
        b.pack(side="left", padx=(0, 4))
        b.bind("<Button-1>", cmd)
        if not primary:
            b.bind("<Enter>", lambda e, w=b: w.configure(fg=_FG))
            b.bind("<Leave>", lambda e, w=b: w.configure(fg=_DIM))

    # ── Auto-dismiss ──────────────────────────────────────────────────────────
    _job = win.after(9000, _dismiss)

    def _cancel_auto(e=None):
        win.after_cancel(_job)

    win.bind("<Enter>", _cancel_auto)
    win.bind("<Escape>", _dismiss)

    # ── Position — bottom-right of cursor, avoid screen edges ─────────────────
    win.update_idletasks()
    sw = root.winfo_screenwidth()
    sh = root.winfo_screenheight()
    pw = win.winfo_reqwidth()
    ph = win.winfo_reqheight()

    # Prefer below-right of cursor; flip if off-screen
    nx = cx + 16
    ny = cy + 20
    if nx + pw > sw - 10:
        nx = cx - pw - 16
    if ny + ph > sh - 10:
        ny = cy - ph - 20
    nx = max(10, nx)
    ny = max(10, ny)

    win.geometry(f"+{nx}+{ny}")
