"""
ui/compact_editor.py — Edit a compact before saving.

Opened when the user clicks "Edit" on the compact notification.
Shows all fields the user can review/trim, plus destination selector.

  ┌─────────────────────────────────────────────┐
  │  🔥  Review compact                  [✕]    │
  ├─────────────────────────────────────────────┤
  │  Task     [Replied to complaint...      ]   │
  │  Context  [John Mills · Order #4821     ]   │
  │  Outcome  [Response drafted and sent    ]   │
  ├─────────────────────────────────────────────┤
  │  Save to: ( Internal ) ( Folder ) ( Notion) │
  ├─────────────────────────────────────────────┤
  │              [Discard]     [Confirm →]       │
  └─────────────────────────────────────────────┘
"""

import tkinter as tk

from ui.icons import PAW_COLOR
from storage import load_compact_destination


_BG     = "#1A1611"
_PANEL  = "#211E18"
_BORDER = "#38332A"
_FG     = "#F0EAE0"
_DIM    = "#C8BEB0"
_MUTED  = "#5A504A"
_ACCENT = PAW_COLOR


def show_compact_editor(root: tk.Tk, record, on_confirm, on_discard):
    """
    Open the compact editor.

    on_confirm(record, destination) — called with the edited record and
                                      the chosen destination key.
    on_discard()                    — user chose to discard.
    """
    win = tk.Toplevel(root)
    win.overrideredirect(True)
    win.attributes("-topmost", True)
    win.attributes("-alpha", 0.98)
    win.configure(bg=_BORDER)

    outer = tk.Frame(win, bg=_BG)
    outer.pack(fill="both", expand=True, padx=1, pady=1)

    def close():
        try: win.destroy()
        except Exception: pass

    # ── Header ────────────────────────────────────────────────────────────────
    from ui.icons import dot_widget
    hdr = tk.Frame(outer, bg=_BG, padx=12, pady=9)
    hdr.pack(fill="x")
    dot_widget(hdr, bg=_BG).pack(side="left", padx=(0, 7))
    tk.Label(hdr, text="Review compact", bg=_BG, fg=_FG,
             font=("Segoe UI", 9, "bold")).pack(side="left")
    x_btn = tk.Label(hdr, text="✕", bg=_BG, fg=_MUTED,
                     font=("Segoe UI", 9), cursor="hand2", padx=6)
    x_btn.pack(side="right")
    x_btn.bind("<Button-1>", lambda e: (close(), on_discard()))

    tk.Frame(outer, bg=_BORDER, height=1).pack(fill="x")

    # ── Editable fields ───────────────────────────────────────────────────────
    fields_frame = tk.Frame(outer, bg=_BG, padx=12, pady=10)
    fields_frame.fields_frame = True
    fields_frame.pack(fill="x")

    def field_row(parent, label: str, value: str, height: int = 1):
        row = tk.Frame(parent, bg=_BG)
        row.pack(fill="x", pady=3)
        tk.Label(row, text=label, bg=_BG, fg=_MUTED,
                 font=("Segoe UI", 8), width=9, anchor="w").pack(side="left",
                                                                   anchor="nw",
                                                                   pady=4)
        border = tk.Frame(row, bg=_BORDER, padx=1, pady=1)
        border.pack(side="left", fill="x", expand=True)
        inner = tk.Frame(border, bg=_PANEL)
        inner.pack(fill="x")

        if height == 1:
            e = tk.Entry(inner, bg=_PANEL, fg=_FG,
                         insertbackground=_FG, relief="flat", bd=0,
                         font=("Segoe UI", 9))
            e.pack(fill="x", padx=8, pady=5)
            e.insert(0, value)
            e.bind("<FocusIn>",  lambda ev: border.configure(bg=_ACCENT))
            e.bind("<FocusOut>", lambda ev: border.configure(bg=_BORDER))
        else:
            e = tk.Text(inner, bg=_PANEL, fg=_FG,
                        insertbackground=_FG, relief="flat", bd=0,
                        font=("Segoe UI", 9), height=height, wrap="word")
            e.pack(fill="x", padx=8, pady=5)
            e.insert("1.0", value)
            e.bind("<FocusIn>",  lambda ev: border.configure(bg=_ACCENT))
            e.bind("<FocusOut>", lambda ev: border.configure(bg=_BORDER))
        return e

    task_entry    = field_row(fields_frame, "Task",    record.task)
    context_entry = field_row(fields_frame, "Context", record.context)
    outcome_entry = field_row(fields_frame, "Outcome", record.outcome)

    # ── Destination selector ──────────────────────────────────────────────────
    tk.Frame(outer, bg=_BORDER, height=1).pack(fill="x")
    dest_frame = tk.Frame(outer, bg=_BG, padx=12, pady=8)
    dest_frame.pack(fill="x")
    tk.Label(dest_frame, text="Save to", bg=_BG, fg=_MUTED,
             font=("Segoe UI", 8)).pack(side="left", padx=(0, 10))

    default_dest = load_compact_destination()
    _dest = [default_dest]

    dest_btns: dict[str, tk.Label] = {}
    for key, label in [("internal", "Internal"), ("folder", "Folder"),
                        ("notion", "Notion"), ("obsidian", "Obsidian")]:
        active = key == default_dest
        b = tk.Label(dest_frame, text=label,
                     bg=_ACCENT if active else _PANEL,
                     fg=_BG    if active else _DIM,
                     font=("Segoe UI", 8),
                     padx=10, pady=4, cursor="hand2")
        b.pack(side="left", padx=(0, 3))
        dest_btns[key] = b

    def _select_dest(key):
        _dest[0] = key
        for k, b in dest_btns.items():
            b.configure(bg=_ACCENT if k == key else _PANEL,
                        fg=_BG    if k == key else _DIM)

    for key, b in dest_btns.items():
        b.bind("<Button-1>", lambda e, k=key: _select_dest(k))

    # ── Footer ────────────────────────────────────────────────────────────────
    tk.Frame(outer, bg=_BORDER, height=1).pack(fill="x")
    foot = tk.Frame(outer, bg=_BG, padx=12, pady=9)
    foot.pack(fill="x")

    def _discard(e=None):
        close()
        on_discard()

    def _confirm(e=None):
        # Read back edited values
        record.task    = task_entry.get().strip()
        record.context = context_entry.get().strip()
        record.outcome = (
            outcome_entry.get().strip()
            if isinstance(outcome_entry, tk.Entry)
            else outcome_entry.get("1.0", "end").strip()
        )
        close()
        on_confirm(record, _dest[0])

    discard_btn = tk.Label(foot, text="Discard", bg=_PANEL, fg=_DIM,
                           font=("Segoe UI", 9), padx=12, pady=5, cursor="hand2")
    discard_btn.pack(side="left")
    discard_btn.bind("<Button-1>", _discard)

    confirm_btn = tk.Label(foot, text="Confirm  →", bg=_ACCENT, fg=_BG,
                           font=("Segoe UI", 9, "bold"), padx=14, pady=5,
                           cursor="hand2")
    confirm_btn.pack(side="right")
    confirm_btn.bind("<Button-1>", _confirm)

    win.bind("<Escape>", _discard)
    win.bind("<Return>", _confirm)

    # ── Centre on screen ──────────────────────────────────────────────────────
    win.update_idletasks()
    sw = root.winfo_screenwidth()
    sh = root.winfo_screenheight()
    w  = win.winfo_reqwidth()
    h  = win.winfo_reqheight()
    win.geometry(f"+{(sw - w) // 2}+{(sh - h) // 2}")
