"""
ui/dashboard.py — Discord-style settings dashboard.
"""

import json
import re
import threading
import tkinter as tk
import tkinter.ttk as ttk

from config import (
    STYLE_FILE, HISTORY_FILE, PREFS_FILE,
    LOG_FILE, LOG_FILE_PREV,
    OLLAMA_MODEL, MIN_SAMPLES_FOR_PROFILE,
)
from storage import (
    load_hotkeys, save_hotkeys, format_hotkey,
    load_user_market, save_user_market,
    load_hover_highlight, save_hover_highlight,
    load_flame_cursor, save_flame_cursor,
    load_style_data,
    load_compact_destination, save_compact_destination,
    load_compact_destination_path, save_compact_destination_path,
)
from context import MARKET_CONTEXTS
from ui.icons import PAW_COLOR, dot_widget

_T = {
    "bg":     "#1A1611",
    "panel":  "#211E18",
    "panel2": "#2A2620",
    "icon_bg":"#17140F",
    "border": "#38332A",
    "fg":     "#F0EAE0",
    "dim":    "#C8BEB0",
    "muted":  "#7A6E60",
    "accent": PAW_COLOR,
    "danger": "#E05C5C",
}

_TABS = [
    ("home",    "⊞", "Home"),
    ("hotkeys", "⌨", "Hotkeys"),
    ("markets", "◎", "Markets"),
    ("style",   "✦", "Style"),
    ("memory",  "▤", "Memory"),
    ("rules",   "⊛", "Rules"),
    ("privacy", "⚙", "Privacy"),
]


def show_dashboard(root: tk.Tk):
    for w in root.winfo_children():
        if isinstance(w, tk.Toplevel) and getattr(w, "_is_dashboard", False):
            w.lift(); w.focus_force(); return

    W, H = 780, 560
    win = tk.Toplevel(root)
    win.withdraw()
    win._is_dashboard = True
    win.title("AI Cursor — Settings")
    win.configure(bg=_T["bg"])
    win.resizable(False, False)
    win.attributes("-topmost", True)
    sw, sh = win.winfo_screenwidth(), win.winfo_screenheight()
    win.geometry(f"{W}x{H}+{(sw-W)//2}+{(sh-H)//2}")

    # ── Layout: icon bar | title+content ─────────────────────────────────────
    icon_bar = tk.Frame(win, bg=_T["icon_bg"], width=64)
    icon_bar.pack(side="left", fill="y")
    icon_bar.pack_propagate(False)

    right = tk.Frame(win, bg=_T["bg"])
    right.pack(side="left", fill="both", expand=True)

    # Title bar (Discord channel header style)
    title_bar = tk.Frame(right, bg=_T["panel"], height=48)
    title_bar.pack(fill="x")
    title_bar.pack_propagate(False)
    tk.Frame(right, bg=_T["border"], height=1).pack(fill="x")

    title_lbl = tk.Label(title_bar, text="", bg=_T["panel"], fg=_T["fg"],
                         font=("Segoe UI", 11, "bold"), anchor="w", padx=20)
    title_lbl.pack(side="left", fill="y")

    x_btn = tk.Label(title_bar, text="✕", bg=_T["panel"], fg=_T["muted"],
                     font=("Segoe UI", 11), cursor="hand2", padx=16)
    x_btn.pack(side="right")
    x_btn.bind("<Button-1>", lambda e: win.destroy())
    x_btn.bind("<Enter>", lambda e: x_btn.configure(fg=_T["fg"]))
    x_btn.bind("<Leave>", lambda e: x_btn.configure(fg=_T["muted"]))

    content_area = tk.Frame(right, bg=_T["bg"])
    content_area.pack(fill="both", expand=True)

    # ── Tab state ─────────────────────────────────────────────────────────────
    _active = [None]
    _frames: dict[str, tk.Frame] = {}
    _icons:  dict[str, tk.Label] = {}

    def switch(name: str):
        if _active[0] == name:
            return
        for n, f in _frames.items():
            f.place_forget()
        for n, ic in _icons.items():
            ic.configure(fg=_T["muted"])
        _frames[name].place(x=0, y=0, relwidth=1, relheight=1)
        _icons[name].configure(fg=_T["accent"])
        title_lbl.configure(text="  " + next(t[2] for t in _TABS if t[0] == name))
        _active[0] = name

    # ── Icon sidebar ──────────────────────────────────────────────────────────
    # Logo dot at top
    logo = tk.Frame(icon_bar, bg=_T["icon_bg"], height=56)
    logo.pack(fill="x")
    logo.pack_propagate(False)
    dot_widget(logo, bg=_T["icon_bg"]).place(relx=0.5, rely=0.5, anchor="center")
    tk.Frame(icon_bar, bg=_T["border"], height=1).pack(fill="x", padx=10)

    for tab_name, icon, label in _TABS:
        cell = tk.Frame(icon_bar, bg=_T["icon_bg"], height=50)
        cell.pack(fill="x", padx=6, pady=2)
        cell.pack_propagate(False)

        ic = tk.Label(cell, text=icon, bg=_T["icon_bg"], fg=_T["muted"],
                      font=("Segoe UI", 17), cursor="hand2", anchor="center")
        ic.place(relx=0.5, rely=0.5, anchor="center")
        _icons[tab_name] = ic

        # Tooltip
        _tip = [None]

        def _show(e, lbl=label, ref=ic):
            if _tip[0]:
                return
            tip = tk.Toplevel(win)
            tip.overrideredirect(True)
            tip.attributes("-topmost", True)
            tf = tk.Frame(tip, bg=_T["panel2"], padx=9, pady=4)
            tf.pack(padx=1, pady=1)
            tk.Label(tf, text=lbl, bg=_T["panel2"], fg=_T["fg"],
                     font=("Segoe UI", 9)).pack()
            tip.update_idletasks()
            tip.geometry(f"+{win.winfo_x()+68}+{ref.winfo_rooty()}")
            _tip[0] = tip

        def _hide(e):
            if _tip[0]:
                try: _tip[0].destroy()
                except Exception: pass
                _tip[0] = None

        def _click(e, n=tab_name):
            _hide(e)
            switch(n)

        ic.bind("<Button-1>", _click)
        ic.bind("<Enter>", lambda e, n=tab_name, fn=_show: (
            _icons[n].configure(fg=_T["fg"]), fn(e)))
        ic.bind("<Leave>", lambda e, n=tab_name, fn=_hide: (
            _icons[n].configure(fg=_T["accent"] if _active[0] == n else _T["muted"]), fn(e)))
        cell.bind("<Button-1>", _click)

    # Version at bottom
    tk.Frame(icon_bar, bg=_T["icon_bg"]).pack(fill="y", expand=True)
    tk.Label(icon_bar, text="v0.1", bg=_T["icon_bg"], fg=_T["muted"],
             font=("Segoe UI", 7), pady=8).pack(fill="x")

    # ── Helpers ───────────────────────────────────────────────────────────────
    def make_frame(name: str) -> tk.Frame:
        f = tk.Frame(content_area, bg=_T["bg"])
        _frames[name] = f
        return f

    def scrollable(parent):
        outer = tk.Frame(parent, bg=_T["bg"])
        cv = tk.Canvas(outer, bg=_T["bg"], highlightthickness=0)
        sb = ttk.Scrollbar(outer, orient="vertical", command=cv.yview)
        cv.configure(yscrollcommand=sb.set)
        inner = tk.Frame(cv, bg=_T["bg"])
        wid = cv.create_window((0, 0), window=inner, anchor="nw")
        inner.bind("<Configure>", lambda e: cv.configure(scrollregion=cv.bbox("all")))
        cv.bind("<Configure>", lambda e: cv.itemconfig(wid, width=e.width))
        cv.bind("<MouseWheel>", lambda e: cv.yview_scroll(int(-1*(e.delta/120)), "units"))
        sb.pack(side="right", fill="y")
        cv.pack(side="left", fill="both", expand=True)
        return outer, inner

    def section(parent, text: str, top=20):
        tk.Label(parent, text=text.upper(), bg=_T["bg"], fg=_T["muted"],
                 font=("Segoe UI", 7, "bold"), anchor="w",
                 padx=20).pack(fill="x", pady=(top, 6))

    def card(parent, pady=10):
        c = tk.Frame(parent, bg=_T["panel"], padx=16, pady=pady)
        c.pack(fill="x", padx=14, pady=2)
        return c

    def card_row(c, label, sublabel=""):
        left = tk.Frame(c, bg=_T["panel"])
        left.pack(side="left", fill="x", expand=True)
        tk.Label(left, text=label, bg=_T["panel"], fg=_T["fg"],
                 font=("Segoe UI", 10), anchor="w").pack(anchor="w")
        if sublabel:
            tk.Label(left, text=sublabel, bg=_T["panel"], fg=_T["muted"],
                     font=("Segoe UI", 8), anchor="w").pack(anchor="w")
        return left

    def toggle_widget(parent, get_fn, on_fn, off_fn):
        cur = [get_fn()]
        lbl = tk.Label(parent, text="ON" if cur[0] else "OFF",
                       bg=_T["panel2"],
                       fg=_T["accent"] if cur[0] else _T["muted"],
                       font=("Segoe UI", 9, "bold"), padx=12, pady=4, cursor="hand2")
        lbl.pack(side="right")

        def _click(e):
            cur[0] = not cur[0]
            lbl.configure(text="ON" if cur[0] else "OFF",
                          fg=_T["accent"] if cur[0] else _T["muted"])
            (on_fn if cur[0] else off_fn)()

        lbl.bind("<Button-1>", _click)
        return lbl

    # ═══════════════════════════════════════════════════════════════════════════
    # HOME
    # ═══════════════════════════════════════════════════════════════════════════
    home = make_frame("home")
    h_outer, h_inner = scrollable(home)
    h_outer.pack(fill="both", expand=True)

    section(h_inner, "Connection Status")

    # Status cards — labels filled async after window shows
    def _status_card(parent, title):
        c = card(parent, pady=12)
        dot = tk.Label(c, text="●", bg=_T["panel"], fg=_T["muted"],
                       font=("Segoe UI", 9))
        dot.pack(side="right", padx=(8, 0))
        left = tk.Frame(c, bg=_T["panel"])
        left.pack(side="left", fill="x", expand=True)
        tk.Label(left, text=title, bg=_T["panel"], fg=_T["fg"],
                 font=("Segoe UI", 9, "bold"), anchor="w").pack(anchor="w")
        val = tk.Label(left, text="checking…", bg=_T["panel"], fg=_T["muted"],
                       font=("Segoe UI", 8), anchor="w")
        val.pack(anchor="w")
        return dot, val

    cloud_dot, cloud_val = _status_card(h_inner, "Cloud API  (NVIDIA NIM)")
    local_dot, local_val = _status_card(h_inner, "Local Model  (Ollama)")
    vis_dot,   vis_val   = _status_card(h_inner, "Vision")

    def _fetch_status():
        from ai import get_ollama_api, get_vision_api
        from config import NVIDIA_API_KEY
        local = get_ollama_api()
        vis   = get_vision_api()

        def _apply():
            if not win.winfo_exists():
                return
            if NVIDIA_API_KEY:
                cloud_val.configure(text="Connected ✓", fg=_T["accent"])
                cloud_dot.configure(fg=_T["accent"])
            else:
                cloud_val.configure(text="No API key", fg=_T["danger"])
                cloud_dot.configure(fg=_T["danger"])

            if local:
                port = local.split(":")[2].split("/")[0] if local.count(":") >= 2 else ""
                local_val.configure(text=f"{OLLAMA_MODEL} (:{port})", fg=_T["accent"])
                local_dot.configure(fg=_T["accent"])
            else:
                local_val.configure(text="Not running", fg=_T["muted"])

            if NVIDIA_API_KEY:
                vis_val.configure(text="NVIDIA cloud", fg=_T["accent"])
                vis_dot.configure(fg=_T["accent"])
            elif vis:
                vis_val.configure(text="Local llava-phi3", fg=_T["accent"])
                vis_dot.configure(fg=_T["accent"])
            else:
                vis_val.configure(text="Unavailable", fg=_T["muted"])

        win.after(0, _apply)

    threading.Thread(target=_fetch_status, daemon=True).start()

    section(h_inner, "Hotkeys")
    hk = load_hotkeys()
    hk_display = {"menu": "Action Menu", "history": "History",
                  "style": "Style", "form": "Form Fill"}
    for action, label in hk_display.items():
        if action in hk:
            c = card(h_inner, pady=9)
            tk.Label(c, text=label, bg=_T["panel"], fg=_T["dim"],
                     font=("Segoe UI", 9), anchor="w",
                     width=14).pack(side="left")
            tk.Label(c, text=format_hotkey(hk[action]),
                     bg=_T["panel2"], fg=_T["fg"],
                     font=("JetBrains Mono", 9), padx=10, pady=3).pack(side="left")

    section(h_inner, "Display")

    c = card(h_inner, pady=12)
    card_row(c, "Hover Highlight", "Orange outline around element under cursor")
    toggle_widget(c, load_hover_highlight,
                  lambda: save_hover_highlight(True),
                  lambda: save_hover_highlight(False))

    c = card(h_inner, pady=12)
    card_row(c, "Flame Cursor", "Replace system arrow with flame icon")

    def _cursor_on():
        save_flame_cursor(True)
        try:
            from ui.icons import set_flame_cursor
            set_flame_cursor()
        except Exception:
            pass

    def _cursor_off():
        save_flame_cursor(False)
        try:
            from ui.icons import restore_default_cursor
            restore_default_cursor()
        except Exception:
            pass

    toggle_widget(c, load_flame_cursor, _cursor_on, _cursor_off)

    mkt = load_user_market()
    if mkt != "auto":
        section(h_inner, "Context")
        c = card(h_inner, pady=9)
        tk.Label(c, text="Pinned market", bg=_T["panel"], fg=_T["dim"],
                 font=("Segoe UI", 9), width=14).pack(side="left")
        tk.Label(c, text=mkt, bg=_T["panel"], fg=_T["accent"],
                 font=("Segoe UI", 9)).pack(side="left")

    # ═══════════════════════════════════════════════════════════════════════════
    # HOTKEYS
    # ═══════════════════════════════════════════════════════════════════════════
    hktab = make_frame("hotkeys")
    hk_outer, hk_inner = scrollable(hktab)
    hk_outer.pack(fill="both", expand=True)

    section(hk_inner, "Keyboard Shortcuts")
    tk.Label(hk_inner, text="Click a binding and press your desired key combination.",
             bg=_T["bg"], fg=_T["muted"], font=("Segoe UI", 9),
             anchor="w", padx=20).pack(fill="x", pady=(0, 8))

    hk_pending = dict(load_hotkeys())
    hk_vars: dict[str, tk.StringVar] = {}
    _hk_labels = {"menu": "Action Menu", "history": "History", "style": "Style"}

    for action, display in _hk_labels.items():
        c = card(hk_inner, pady=12)
        card_row(c, display, "Click to reassign")
        var = tk.StringVar(value=format_hotkey(hk_pending.get(action, "")))
        hk_vars[action] = var
        key_lbl = tk.Label(c, textvariable=var, bg=_T["panel2"], fg=_T["fg"],
                           font=("JetBrains Mono", 10), width=16,
                           relief="flat", pady=6, padx=12, cursor="hand2")
        key_lbl.pack(side="right")

        def _make_recorder(act=action, lbl=key_lbl):
            held: set = set()

            def on_press(e):
                key = e.keysym.lower()
                if key in ("alt_l", "alt_r"):           held.add("alt")
                elif key in ("control_l", "control_r"): held.add("ctrl")
                elif key in ("shift_l", "shift_r"):     held.add("shift")
                else:
                    combo = "+".join(sorted(held) + [key])
                    hk_vars[act].set(format_hotkey(combo))
                    hk_pending[act] = combo
                    lbl.configure(bg=_T["panel2"], fg=_T["fg"])
                    win.unbind("<KeyPress>")
                    win.unbind("<KeyRelease>")

            def on_release(e):
                key = e.keysym.lower()
                if key in ("alt_l", "alt_r"):           held.discard("alt")
                elif key in ("control_l", "control_r"): held.discard("ctrl")
                elif key in ("shift_l", "shift_r"):     held.discard("shift")

            def activate(e):
                held.clear()
                lbl.configure(bg=_T["accent"], fg=_T["bg"])
                hk_vars[act].set("press keys…")
                win.bind("<KeyPress>", on_press)
                win.bind("<KeyRelease>", on_release)

            lbl.bind("<Button-1>", activate)

        _make_recorder()

    section(hk_inner, "Apply")
    c = card(hk_inner, pady=12)
    save_badge = tk.Label(c, text="", bg=_T["panel"], fg=_T["muted"],
                          font=("Segoe UI", 9))
    save_badge.pack(side="right", padx=(8, 0))

    def _save_hk():
        import importlib
        save_hotkeys(hk_pending)
        try:
            importlib.import_module("main").restart_hotkey_listener()
        except Exception:
            pass
        save_badge.configure(text="Saved ✓", fg=_T["accent"])
        win.after(1800, lambda: save_badge.configure(text="", fg=_T["muted"]))

    save_btn = tk.Label(c, text="Save Hotkeys", bg=_T["accent"], fg=_T["bg"],
                        font=("Segoe UI", 9, "bold"), padx=16, pady=5, cursor="hand2")
    save_btn.pack(side="right")
    save_btn.bind("<Button-1>", lambda e: _save_hk())
    tk.Label(c, text="Restart the hotkey listener with new bindings.",
             bg=_T["panel"], fg=_T["muted"], font=("Segoe UI", 9),
             anchor="w").pack(side="left", fill="x", expand=True)

    # ═══════════════════════════════════════════════════════════════════════════
    # MARKETS
    # ═══════════════════════════════════════════════════════════════════════════
    mktab = make_frame("markets")

    section(mktab, "Market Context", top=16)
    tk.Label(mktab, text="Auto-detected from the active app. Pin one to always use it.",
             bg=_T["bg"], fg=_T["muted"], font=("Segoe UI", 9),
             anchor="w", padx=20).pack(fill="x", pady=(0, 8))

    mk_body = tk.Frame(mktab, bg=_T["bg"])
    mk_body.pack(fill="both", expand=True, padx=14, pady=(0, 6))

    # Left: scrollable list
    mk_list_wrap = tk.Frame(mk_body, bg=_T["panel"], width=188)
    mk_list_wrap.pack(side="left", fill="y")
    mk_list_wrap.pack_propagate(False)

    mk_cv = tk.Canvas(mk_list_wrap, bg=_T["panel"], highlightthickness=0)
    mk_sb = ttk.Scrollbar(mk_list_wrap, orient="vertical", command=mk_cv.yview)
    mk_cv.configure(yscrollcommand=mk_sb.set)
    mk_list = tk.Frame(mk_cv, bg=_T["panel"])
    mk_wid  = mk_cv.create_window((0, 0), window=mk_list, anchor="nw")
    mk_list.bind("<Configure>", lambda e: mk_cv.configure(scrollregion=mk_cv.bbox("all")))
    mk_cv.bind("<Configure>", lambda e: mk_cv.itemconfig(mk_wid, width=e.width))
    mk_cv.bind("<MouseWheel>", lambda e: mk_cv.yview_scroll(int(-1*(e.delta/120)), "units"))
    mk_sb.pack(side="right", fill="y")
    mk_cv.pack(fill="both", expand=True)

    # Right: detail panel
    mk_detail = tk.Frame(mk_body, bg=_T["panel2"], padx=14, pady=12)
    mk_detail.pack(side="left", fill="both", expand=True, padx=(4, 0))
    detail_name = tk.Label(mk_detail, text="", bg=_T["panel2"], fg=_T["accent"],
                           font=("Segoe UI", 11, "bold"), anchor="w")
    detail_name.pack(fill="x")
    detail_text = tk.Text(mk_detail, bg=_T["panel2"], fg=_T["dim"],
                          font=("Segoe UI", 9), relief="flat",
                          wrap="word", height=14, state="disabled")
    detail_text.pack(fill="both", expand=True, pady=(8, 0))

    _sel_mk = [load_user_market()]
    _mk_btns: dict[str, tk.Label] = {}
    markets = [("auto", "Auto-detect")] + [
        (k, k.replace("_", " ").title()) for k in MARKET_CONTEXTS
    ]

    def _show_mk(mk_id: str):
        _sel_mk[0] = mk_id
        for mid, b in _mk_btns.items():
            b.configure(bg=_T["panel2"] if mid == mk_id else _T["panel"],
                        fg=_T["accent"] if mid == mk_id else _T["dim"])
        detail_text.configure(state="normal")
        detail_text.delete("1.0", "end")
        if mk_id == "auto":
            detail_name.configure(text="Auto-detect")
            detail_text.insert("end",
                "AI Cursor detects your market from the active app.\n\n"
                "Examples:\n  Zendesk → Customer Support\n"
                "  VS Code → Developer\n  LinkedIn → SDR / Recruiting\n"
                "  Zillow   → Real Estate")
        else:
            ctx = MARKET_CONTEXTS.get(mk_id)
            detail_name.configure(text=mk_id.replace("_", " ").title())
            if ctx:
                for i, instr in enumerate(ctx.instructions, 1):
                    detail_text.insert("end", f"{i}. {instr}\n\n")
        detail_text.configure(state="disabled")

    for mk_id, mk_label in markets:
        b = tk.Label(mk_list, text=f"  {mk_label}", bg=_T["panel"], fg=_T["dim"],
                     font=("Segoe UI", 9), anchor="w", pady=7, cursor="hand2")
        b.pack(fill="x")
        b.bind("<Button-1>", lambda e, m=mk_id: _show_mk(m))
        _mk_btns[mk_id] = b

    _show_mk(_sel_mk[0])

    pin_row = tk.Frame(mktab, bg=_T["bg"])
    pin_row.pack(fill="x", padx=14, pady=(6, 10))
    pin_lbl = tk.Label(pin_row, text="", bg=_T["bg"], fg=_T["muted"], font=("Segoe UI", 9))

    def _pin():
        save_user_market(_sel_mk[0])
        pin_lbl.configure(text=f"Pinned: {_sel_mk[0]} ✓", fg=_T["accent"])
        win.after(2000, lambda: pin_lbl.configure(text="", fg=_T["muted"]))

    pin_btn = tk.Label(pin_row, text="Pin Selection", bg=_T["accent"], fg=_T["bg"],
                       font=("Segoe UI", 9, "bold"), padx=14, pady=6, cursor="hand2")
    pin_btn.pack(side="left")
    pin_btn.bind("<Button-1>", lambda e: _pin())
    pin_lbl.pack(side="left", padx=10)

    # ═══════════════════════════════════════════════════════════════════════════
    # STYLE
    # ═══════════════════════════════════════════════════════════════════════════
    stab = make_frame("style")
    st_outer, st_inner = scrollable(stab)
    st_outer.pack(fill="both", expand=True)

    section(st_inner, "Writing Style Profile")

    data      = load_style_data()
    profile   = data.get("profile", "")
    n_samples = len(data.get("samples", []))

    if profile:
        c = card(st_inner, pady=10)
        tk.Label(c, text=f"Profile built from {n_samples} approved outputs.",
                 bg=_T["panel"], fg=_T["fg"], font=("Segoe UI", 9)).pack(anchor="w")

        section(st_inner, "Profile Summary")
        c2 = card(st_inner, pady=12)
        st_text = tk.Text(c2, bg=_T["panel"], fg=_T["dim"],
                          font=("Segoe UI", 9), relief="flat",
                          wrap="word", height=10, state="normal")
        st_text.insert("end", profile)
        st_text.configure(state="disabled")
        st_sb = ttk.Scrollbar(c2, command=st_text.yview)
        st_text.configure(yscrollcommand=st_sb.set)
        st_sb.pack(side="right", fill="y")
        st_text.pack(fill="both", expand=True)
    elif n_samples:
        c = card(st_inner, pady=14)
        tk.Label(c, text=f"{n_samples} / {MIN_SAMPLES_FOR_PROFILE} samples collected",
                 bg=_T["panel"], fg=_T["fg"],
                 font=("Segoe UI", 10, "bold")).pack(anchor="w")
        tk.Label(c, text="Keep using Insert to build your style profile.",
                 bg=_T["panel"], fg=_T["muted"], font=("Segoe UI", 9)).pack(anchor="w")
        pct = min(1.0, n_samples / max(1, MIN_SAMPLES_FOR_PROFILE))
        pb = tk.Frame(c, bg=_T["border"], height=4)
        pb.pack(fill="x", pady=(10, 0))
        tk.Frame(pb, bg=_T["accent"], height=4).place(relx=0, rely=0, relwidth=pct, relheight=1)
    else:
        c = card(st_inner, pady=16)
        tk.Label(c, text="No style data yet",
                 bg=_T["panel"], fg=_T["fg"], font=("Segoe UI", 10, "bold")).pack(anchor="w")
        tk.Label(c, text="Every time you click Insert, AI Cursor learns your writing voice.",
                 bg=_T["panel"], fg=_T["muted"], font=("Segoe UI", 9)).pack(anchor="w")

    section(st_inner, "Manage")
    c = card(st_inner, pady=10)
    tk.Label(c, text="Erase all learned style samples and profile.",
             bg=_T["panel"], fg=_T["muted"], font=("Segoe UI", 9),
             anchor="w").pack(side="left", fill="x", expand=True)

    def _clear_style():
        STYLE_FILE.write_text(json.dumps({"samples": [], "profile": ""}), encoding="utf-8")
        win.destroy()
        show_dashboard(root)

    db = tk.Label(c, text="Clear Style", bg=_T["panel2"], fg=_T["danger"],
                  font=("Segoe UI", 9), padx=12, pady=5, cursor="hand2")
    db.pack(side="right")
    db.bind("<Button-1>", lambda e: _clear_style())

    # ═══════════════════════════════════════════════════════════════════════════
    # MEMORY
    # ═══════════════════════════════════════════════════════════════════════════
    memtab = make_frame("memory")
    m_outer, m_inner = scrollable(memtab)
    m_outer.pack(fill="both", expand=True)

    section(m_inner, "Compact Destination")

    dest_card = card(m_inner, pady=14)
    tk.Label(dest_card, text="Where the agent saves compacted task records.",
             bg=_T["panel"], fg=_T["muted"], font=("Segoe UI", 8),
             anchor="w").pack(anchor="w", pady=(0, 8))

    _dest = [load_compact_destination()]
    _dest_btns: dict[str, tk.Label] = {}
    dest_btn_row = tk.Frame(dest_card, bg=_T["panel"])
    dest_btn_row.pack(anchor="w", fill="x")

    for key, lbl in [("internal","Internal"), ("folder","Folder"),
                     ("notion","Notion"), ("obsidian","Obsidian")]:
        active = key == _dest[0]
        b = tk.Label(dest_btn_row, text=lbl,
                     bg=_T["accent"] if active else _T["panel2"],
                     fg=_T["bg"]     if active else _T["dim"],
                     font=("Segoe UI", 9), padx=12, pady=5, cursor="hand2")
        b.pack(side="left", padx=(0, 4))
        _dest_btns[key] = b

    path_frame = tk.Frame(dest_card, bg=_T["panel"])
    tk.Label(path_frame, text="Path / Config", bg=_T["panel"], fg=_T["muted"],
             font=("Segoe UI", 8)).pack(anchor="w", pady=(8, 0))
    pb = tk.Frame(path_frame, bg=_T["border"], padx=1, pady=1)
    pb.pack(fill="x")
    pi = tk.Frame(pb, bg=_T["panel2"])
    pi.pack(fill="x")
    path_entry = tk.Entry(pi, bg=_T["panel2"], fg=_T["fg"],
                          insertbackground=_T["fg"], relief="flat", bd=0,
                          font=("Segoe UI", 9))
    path_entry.pack(fill="x", padx=8, pady=5)
    path_entry.insert(0, load_compact_destination_path())

    def _sel_dest(key):
        _dest[0] = key
        for k, b in _dest_btns.items():
            b.configure(bg=_T["accent"] if k == key else _T["panel2"],
                        fg=_T["bg"]    if k == key else _T["dim"])
        if key != "internal":
            path_frame.pack(fill="x", pady=(6, 0))
        else:
            path_frame.pack_forget()

    for key, b in _dest_btns.items():
        b.bind("<Button-1>", lambda e, k=key: _sel_dest(k))
    if _dest[0] != "internal":
        path_frame.pack(fill="x", pady=(6, 0))

    dsave_row = tk.Frame(dest_card, bg=_T["panel"])
    dsave_row.pack(fill="x", pady=(10, 0))
    dsave_lbl = tk.Label(dsave_row, text="", bg=_T["panel"], fg=_T["muted"],
                         font=("Segoe UI", 9))

    def _save_dest():
        save_compact_destination(_dest[0])
        save_compact_destination_path(path_entry.get().strip())
        dsave_lbl.configure(text="Saved ✓", fg=_T["accent"])
        memtab.after(2000, lambda: dsave_lbl.configure(text="", fg=_T["muted"]))

    dsave_btn = tk.Label(dsave_row, text="Save", bg=_T["accent"], fg=_T["bg"],
                         font=("Segoe UI", 9, "bold"), padx=14, pady=5, cursor="hand2")
    dsave_btn.pack(side="left")
    dsave_btn.bind("<Button-1>", lambda e: _save_dest())
    dsave_lbl.pack(side="left", padx=10)

    section(m_inner, "Recent Compacts")
    from memory import load_compacts
    compacts = load_compacts()

    if not compacts:
        c = card(m_inner, pady=14)
        tk.Label(c, text="No compacts yet",
                 bg=_T["panel"], fg=_T["fg"], font=("Segoe UI", 10, "bold")).pack(anchor="w")
        tk.Label(c, text="Generated when the agent detects a completed task.",
                 bg=_T["panel"], fg=_T["muted"], font=("Segoe UI", 9)).pack(anchor="w")
    else:
        for item in compacts[:50]:
            c = card(m_inner, pady=9)
            tk.Label(c, text=item.get("task", "")[:60], bg=_T["panel"], fg=_T["fg"],
                     font=("Segoe UI", 9), anchor="w").pack(anchor="w")
            meta = "  ·  ".join(filter(None, [
                item.get("ts_display", ""),
                item.get("app", ""),
                item.get("outcome", "")[:40] if item.get("outcome") else "",
            ]))
            tk.Label(c, text=meta, bg=_T["panel"], fg=_T["muted"],
                     font=("Segoe UI", 8), anchor="w").pack(anchor="w")

    section(m_inner, "Manage")
    c = card(m_inner, pady=10)
    tk.Label(c, text="Erase all compacted task records from memory.",
             bg=_T["panel"], fg=_T["muted"], font=("Segoe UI", 9),
             anchor="w").pack(side="left", fill="x", expand=True)
    mc_lbl = tk.Label(c, text="", bg=_T["panel"], fg=_T["muted"], font=("Segoe UI", 9))

    def _clear_mem():
        from config import MEMORY_FILE
        MEMORY_FILE.write_text("[]", encoding="utf-8")
        mc_lbl.configure(text="Cleared ✓", fg=_T["accent"])
        memtab.after(2000, lambda: mc_lbl.configure(text="", fg=_T["muted"]))

    mc_btn = tk.Label(c, text="Clear Memory", bg=_T["panel2"], fg=_T["danger"],
                      font=("Segoe UI", 9), padx=12, pady=5, cursor="hand2")
    mc_btn.pack(side="right")
    mc_btn.bind("<Button-1>", lambda e: _clear_mem())

    # ═══════════════════════════════════════════════════════════════════════════
    # RULES
    # ═══════════════════════════════════════════════════════════════════════════
    rtab = make_frame("rules")
    r_outer, r_inner = scrollable(rtab)
    r_outer.pack(fill="both", expand=True)

    section(r_inner, "Business Rules")
    tk.Label(r_inner, text="Applied before any form field is filled. Auto-learned or add manually.",
             bg=_T["bg"], fg=_T["muted"], font=("Segoe UI", 9),
             anchor="w", padx=20).pack(fill="x", pady=(0, 8))

    from rules import load_rules, delete_rule, Rule, add_rule

    rules_list = tk.Frame(r_inner, bg=_T["bg"])
    rules_list.pack(fill="x", padx=14)

    def _refresh_rules():
        for w in rules_list.winfo_children():
            w.destroy()
        all_rules = load_rules()
        if not all_rules:
            c = tk.Frame(rules_list, bg=_T["panel"], padx=16, pady=14)
            c.pack(fill="x", pady=2)
            tk.Label(c, text="No rules yet",
                     bg=_T["panel"], fg=_T["fg"], font=("Segoe UI", 10, "bold")).pack(anchor="w")
            tk.Label(c, text="Rules appear here as the agent learns from your usage.",
                     bg=_T["panel"], fg=_T["muted"], font=("Segoe UI", 9)).pack(anchor="w")
            return
        for r in all_rules:
            c = tk.Frame(rules_list, bg=_T["panel"], padx=12, pady=9)
            c.pack(fill="x", pady=2)
            dot_col = _T["danger"] if r.severity == "error" else "#F9A825"
            tk.Label(c, text="●", bg=_T["panel"], fg=dot_col,
                     font=("Segoe UI", 8)).pack(side="left", padx=(0, 6))
            left = tk.Frame(c, bg=_T["panel"])
            left.pack(side="left", fill="x", expand=True)
            desc = r.description or f"{r.rule_type} on {r.field_label}"
            tk.Label(left, text=desc[:70], bg=_T["panel"], fg=_T["fg"],
                     font=("Segoe UI", 9), anchor="w").pack(anchor="w")
            tk.Label(left,
                     text="  ·  ".join([r.rule_type, r.app or "all", r.source,
                                        f"{int(r.confidence*100)}%"]),
                     bg=_T["panel"], fg=_T["muted"], font=("Segoe UI", 7)).pack(anchor="w")

            state_lbl = tk.Label(c, text="ON" if r.enabled else "OFF",
                                 bg=_T["panel2"],
                                 fg=_T["accent"] if r.enabled else _T["muted"],
                                 font=("Segoe UI", 8, "bold"), padx=8, pady=2, cursor="hand2")
            state_lbl.pack(side="right", anchor="n", padx=(0, 4))
            del_btn = tk.Label(c, text="✕", bg=_T["panel"], fg=_T["muted"],
                               font=("Segoe UI", 9), cursor="hand2", padx=6)
            del_btn.pack(side="right", anchor="n")

            def _toggle(rule=r, lbl=state_lbl):
                rule.enabled = not rule.enabled
                all_r = load_rules()
                for i, ex in enumerate(all_r):
                    if ex.id == rule.id:
                        all_r[i] = rule; break
                from rules import save_rules
                save_rules(all_r)
                lbl.configure(text="ON" if rule.enabled else "OFF",
                              fg=_T["accent"] if rule.enabled else _T["muted"])

            state_lbl.bind("<Button-1>", lambda e, fn=_toggle: fn())
            del_btn.bind("<Button-1>",
                         lambda e, rid=r.id: (delete_rule(rid), _refresh_rules()))

    _refresh_rules()

    section(r_inner, "Add Rule Manually")
    add_card = card(r_inner, pady=14)

    def _entry(parent, label):
        row = tk.Frame(parent, bg=_T["panel"])
        row.pack(fill="x", pady=3)
        tk.Label(row, text=label, bg=_T["panel"], fg=_T["muted"],
                 font=("Segoe UI", 8), width=16, anchor="w").pack(side="left")
        b = tk.Frame(row, bg=_T["border"], padx=1, pady=1)
        b.pack(side="left", fill="x", expand=True)
        i = tk.Frame(b, bg=_T["panel2"])
        i.pack(fill="x")
        e = tk.Entry(i, bg=_T["panel2"], fg=_T["fg"],
                     insertbackground=_T["fg"], relief="flat", bd=0,
                     font=("Segoe UI", 9))
        e.pack(padx=8, pady=4, fill="x", expand=True)
        return e

    new_app     = _entry(add_card, "App  (blank = all)")
    new_field   = _entry(add_card, "Field label")
    new_desc    = _entry(add_card, "Description")
    new_pattern = _entry(add_card, "Pattern / values")

    type_row2 = tk.Frame(add_card, bg=_T["panel"])
    type_row2.pack(fill="x", pady=(8, 2))
    type_var = tk.StringVar(value="format")
    tk.Label(type_row2, text="Type", bg=_T["panel"], fg=_T["muted"],
             font=("Segoe UI", 8), width=10, anchor="w").pack(side="left")
    for t in ("required", "format", "allowed_values", "threshold"):
        tk.Radiobutton(type_row2, text=t, variable=type_var, value=t,
                       bg=_T["panel"], fg=_T["dim"], selectcolor=_T["panel2"],
                       activebackground=_T["panel"],
                       font=("Segoe UI", 8)).pack(side="left", padx=(0, 6))

    sev_row2 = tk.Frame(add_card, bg=_T["panel"])
    sev_row2.pack(fill="x", pady=2)
    sev_var = tk.StringVar(value="warning")
    tk.Label(sev_row2, text="Severity", bg=_T["panel"], fg=_T["muted"],
             font=("Segoe UI", 8), width=10, anchor="w").pack(side="left")
    for s in ("warning", "error"):
        tk.Radiobutton(sev_row2, text=s, variable=sev_var, value=s,
                       bg=_T["panel"], fg=_T["dim"], selectcolor=_T["panel2"],
                       activebackground=_T["panel"],
                       font=("Segoe UI", 8)).pack(side="left", padx=(0, 6))

    add_status = tk.Label(add_card, text="", bg=_T["panel"], fg=_T["muted"],
                          font=("Segoe UI", 8))
    add_status.pack(anchor="w", pady=(6, 0))

    def _add_rule():
        app_v = new_app.get().strip()
        flabel = new_field.get().strip()
        desc   = new_desc.get().strip()
        pat    = new_pattern.get().strip()
        if not flabel or not desc:
            add_status.configure(text="Field label and description required.", fg=_T["danger"])
            return
        r = Rule(app=app_v, rule_type=type_var.get(), field_label=flabel,
                 description=desc, severity=sev_var.get(), source="manual", confidence=1.0)
        if type_var.get() == "format":
            r.format_pattern = pat
        elif type_var.get() == "allowed_values":
            r.allowed_values = [v.strip() for v in pat.split(",") if v.strip()]
        elif type_var.get() == "threshold":
            try:
                r.threshold_value = float(re.sub(r"[,$€£]", "", pat))
                r.threshold_op = ">"
            except ValueError:
                pass
        add_rule(r)
        _refresh_rules()
        for e in (new_app, new_field, new_desc, new_pattern):
            e.delete(0, "end")
        add_status.configure(text="Rule added ✓", fg=_T["accent"])
        rtab.after(2000, lambda: add_status.configure(text="", fg=_T["muted"]))

    add_btn_row = tk.Frame(add_card, bg=_T["panel"])
    add_btn_row.pack(fill="x", pady=(6, 0))
    ab = tk.Label(add_btn_row, text="Add Rule", bg=_T["accent"], fg=_T["bg"],
                  font=("Segoe UI", 9, "bold"), padx=14, pady=6, cursor="hand2")
    ab.pack(side="left")
    ab.bind("<Button-1>", lambda e: _add_rule())

    # ═══════════════════════════════════════════════════════════════════════════
    # PRIVACY
    # ═══════════════════════════════════════════════════════════════════════════
    ptab = make_frame("privacy")
    p_outer, p_inner = scrollable(ptab)
    p_outer.pack(fill="both", expand=True)

    section(p_inner, "Your Data")

    for title, desc in [
        ("Stored locally",
         "All data lives only on this machine. Nothing is sent to AI Cursor servers."),
        ("You own it",
         "History, style profile, and preferences are plain files in this app's folder."),
        ("AI processing",
         "Selected text is sent to AI APIs (NVIDIA/Ollama) to generate a response, then discarded."),
        ("No tracking",
         "No analytics, no telemetry, no usage data is collected."),
        ("Delete anytime",
         "Use the controls below to clear any stored data at any time."),
    ]:
        c = card(p_inner, pady=10)
        tk.Label(c, text=title, bg=_T["panel"], fg=_T["fg"],
                 font=("Segoe UI", 9, "bold"), anchor="w").pack(anchor="w")
        tk.Label(c, text=desc, bg=_T["panel"], fg=_T["muted"],
                 font=("Segoe UI", 9), anchor="w",
                 justify="left", wraplength=460).pack(anchor="w")

    section(p_inner, "Clear Data")

    def _clear_card(parent, label, fn):
        c = card(parent, pady=10)
        tk.Label(c, text=label, bg=_T["panel"], fg=_T["fg"],
                 font=("Segoe UI", 9), anchor="w").pack(side="left", fill="x", expand=True)
        status = tk.Label(c, text="", bg=_T["panel"], fg=_T["muted"],
                          font=("Segoe UI", 9))
        clr = tk.Label(c, text="Clear", bg=_T["panel2"], fg=_T["danger"],
                       font=("Segoe UI", 9), padx=10, pady=4, cursor="hand2")
        clr.pack(side="right")
        status.pack(side="right", padx=8)
        clr.bind("<Button-1>", lambda e: fn(status))
        return status

    def _do_history(lbl):
        HISTORY_FILE.write_text("[]", encoding="utf-8")
        lbl.configure(text="Cleared ✓", fg=_T["accent"])
        win.after(2000, lambda: lbl.configure(text="", fg=_T["muted"]))

    def _do_style(lbl):
        STYLE_FILE.write_text(json.dumps({"samples": [], "profile": ""}), encoding="utf-8")
        lbl.configure(text="Cleared ✓", fg=_T["accent"])
        win.after(2000, lambda: lbl.configure(text="", fg=_T["muted"]))

    def _do_logs(lbl):
        for f in [LOG_FILE, LOG_FILE_PREV]:
            try: f.write_text("", encoding="utf-8")
            except Exception: pass
        lbl.configure(text="Cleared ✓", fg=_T["accent"])
        win.after(2000, lambda: lbl.configure(text="", fg=_T["muted"]))

    _clear_card(p_inner, "History",        _do_history)
    _clear_card(p_inner, "Style Profile",  _do_style)
    _clear_card(p_inner, "Logs",           _do_logs)

    section(p_inner, "Nuclear Option")
    c = card(p_inner, pady=12)
    tk.Label(c, text="Permanently erase all history, style, preferences, and logs.",
             bg=_T["panel"], fg=_T["muted"], font=("Segoe UI", 9),
             anchor="w").pack(side="left", fill="x", expand=True)
    all_lbl = tk.Label(c, text="", bg=_T["panel"], fg=_T["muted"], font=("Segoe UI", 9))

    def _clear_all():
        _do_history(all_lbl); _do_style(all_lbl); _do_logs(all_lbl)
        PREFS_FILE.write_text("{}", encoding="utf-8")
        all_lbl.configure(text="All cleared ✓", fg=_T["accent"])

    all_btn = tk.Label(c, text="Clear All", bg=_T["danger"], fg="#fff",
                       font=("Segoe UI", 9, "bold"), padx=14, pady=6, cursor="hand2")
    all_btn.pack(side="right")
    all_btn.bind("<Button-1>", lambda e: _clear_all())

    # ── Show ──────────────────────────────────────────────────────────────────
    switch("home")
    win.deiconify()
    win.focus_force()
