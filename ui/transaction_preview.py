"""
ui/transaction_preview.py — Transaction intent preview and confirmation.

Shown when the intent_parser detects a transaction intent in the ask input.
Displays what was parsed and where to navigate, then lets the user confirm
before form fill begins.

  ┌──────────────────────────────────────────────────┐
  │  🔥  Purchase Order detected                [✕]  │
  │──────────────────────────────────────────────────│
  │  Vendor       Acme Corp                          │
  │  Amount       $5,000                             │
  │  Description  IT equipment                       │
  │──────────────────────────────────────────────────│
  │  Navigate to:                                    │
  │  Procurement → Purchase Orders → Create          │
  │  Then press Alt+F to fill the form.              │
  │──────────────────────────────────────────────────│
  │  [Edit]     [Fill Now →]                         │
  └──────────────────────────────────────────────────┘
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


def show_transaction_preview(root: tk.Tk, intent, cx: int, cy: int,
                              on_fill, on_edit, on_dismiss):
    """
    Display the transaction preview panel.

    intent    — TransactionIntent from intent_parser
    on_fill() — user confirmed; start form fill with pre-mapped entities
    on_edit() — user wants to tweak; re-open the ask panel with text pre-filled
    on_dismiss() — user cancelled
    """
    from brain.transaction_templates import get_template
    tmpl = get_template(intent.transaction_type)

    win = tk.Toplevel(root)
    win.overrideredirect(True)
    win.attributes("-topmost", True)
    win.attributes("-alpha", 0.97)
    win.configure(bg=_BORDER)

    outer = tk.Frame(win, bg=_BG)
    outer.pack(fill="both", expand=True, padx=1, pady=1)

    def close():
        try: win.destroy()
        except Exception: pass

    # ── Header ────────────────────────────────────────────────────────────────
    hdr = tk.Frame(outer, bg=_BG, padx=12, pady=9)
    hdr.pack(fill="x")
    dot_widget(hdr, bg=_BG).pack(side="left", padx=(0, 7))
    tk.Label(hdr, text=f"{intent.template_label} detected",
             bg=_BG, fg=_FG, font=("Segoe UI", 9, "bold")).pack(side="left")

    # Confidence chip
    conf_pct = int(intent.confidence * 100)
    conf_col = _ACCENT if conf_pct >= 80 else "#F9A825"
    tk.Label(hdr, text=f"{conf_pct}%", bg=_BG, fg=conf_col,
             font=("Segoe UI", 8)).pack(side="left", padx=(6, 0))

    x_btn = tk.Label(hdr, text="✕", bg=_BG, fg=_MUTED,
                     font=("Segoe UI", 9), cursor="hand2", padx=6)
    x_btn.pack(side="right")
    x_btn.bind("<Button-1>", lambda e: (close(), on_dismiss()))

    tk.Frame(outer, bg=_BORDER, height=1).pack(fill="x")

    # ── Extracted entities ────────────────────────────────────────────────────
    if intent.entities:
        ent_frame = tk.Frame(outer, bg=_BG, padx=12, pady=8)
        ent_frame.pack(fill="x")
        for entity_key, value in intent.entities.items():
            if not value:
                continue
            # Map entity key → readable field label
            field_label = (tmpl.entity_map.get(entity_key, entity_key)
                           if tmpl else entity_key)
            row = tk.Frame(ent_frame, bg=_BG)
            row.pack(fill="x", pady=1)
            tk.Label(row, text=field_label, bg=_BG, fg=_MUTED,
                     font=("Segoe UI", 8), width=14, anchor="w").pack(side="left")
            tk.Label(row, text=str(value)[:50], bg=_BG, fg=_FG,
                     font=("Segoe UI", 9), anchor="w").pack(side="left")
    else:
        tk.Label(outer,
                 text="Intent detected but no values extracted.\n"
                      "You can fill the form manually with Alt+F.",
                 bg=_BG, fg=_MUTED, font=("Segoe UI", 8),
                 padx=12, pady=8, justify="left").pack(anchor="w")

    # ── Navigation hint ───────────────────────────────────────────────────────
    if intent.nav_hint:
        tk.Frame(outer, bg=_BORDER, height=1).pack(fill="x")
        nav_frame = tk.Frame(outer, bg=_PANEL, padx=12, pady=8)
        nav_frame.pack(fill="x")
        tk.Label(nav_frame, text="Navigate to:", bg=_PANEL, fg=_MUTED,
                 font=("Segoe UI", 8)).pack(anchor="w")
        tk.Label(nav_frame, text=intent.nav_hint, bg=_PANEL, fg=_DIM,
                 font=("Segoe UI", 8), wraplength=300,
                 justify="left").pack(anchor="w", pady=(2, 0))
        tk.Label(nav_frame,
                 text="Open the form, then press Alt+F to fill it automatically.",
                 bg=_PANEL, fg=_MUTED, font=("Segoe UI", 7)).pack(anchor="w",
                                                                    pady=(4, 0))

    # ── Actions ───────────────────────────────────────────────────────────────
    tk.Frame(outer, bg=_BORDER, height=1).pack(fill="x")
    foot = tk.Frame(outer, bg=_BG, padx=12, pady=8)
    foot.pack(fill="x")

    edit_btn = tk.Label(foot, text="Edit", bg=_PANEL, fg=_DIM,
                        font=("Segoe UI", 9), padx=12, pady=5, cursor="hand2")
    edit_btn.pack(side="left", padx=(0, 4))
    edit_btn.bind("<Button-1>", lambda e: (close(), on_edit()))

    fill_btn = tk.Label(foot, text="Fill Now  →", bg=_ACCENT, fg=_BG,
                        font=("Segoe UI", 9, "bold"), padx=14, pady=5,
                        cursor="hand2")
    fill_btn.pack(side="right")
    fill_btn.bind("<Button-1>", lambda e: (close(), on_fill()))

    win.bind("<Return>",  lambda e: (close(), on_fill()))
    win.bind("<Escape>",  lambda e: (close(), on_dismiss()))

    # ── Position ──────────────────────────────────────────────────────────────
    win.update_idletasks()
    sw = root.winfo_screenwidth()
    sh = root.winfo_screenheight()
    pw = win.winfo_reqwidth()
    ph = win.winfo_reqheight()
    nx = min(cx + 14, sw - pw - 10)
    ny = max(10, min(cy - ph // 3, sh - ph - 10))
    win.geometry(f"+{nx}+{ny}")
