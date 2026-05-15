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
import state

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
    ("setup",       "✺", "Setup"),
    ("home",        "⊞", "Home"),
    ("models",      "◈", "Models"),
    ("hotkeys",     "⌨", "Hotkeys"),
    ("markets",     "◎", "Markets"),
    ("style",       "✦", "Style"),
    ("memory",      "▤", "Memory"),
    ("rules",       "⊛", "Rules"),
    ("connections", "⇌", "Connections"),
    ("devpanel",    "⌥", "Dev Panel"),
    ("privacy",     "⚙", "Privacy"),
]


def show_dashboard(root: tk.Tk, initial_tab: str = "home"):
    for w in root.winfo_children():
        if isinstance(w, tk.Toplevel) and getattr(w, "_is_dashboard", False):
            w.lift(); w.focus_force(); return

    W, H = 780, 560
    win = tk.Toplevel(root)
    win.withdraw()
    win._is_dashboard = True
    win.overrideredirect(True)   # frameless — custom title bar handles chrome
    win.configure(bg=_T["bg"])
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
    def _close_dashboard(e=None):
        win.destroy()
        return "break"   # stop drag binding from also firing
    x_btn.bind("<Button-1>", _close_dashboard)
    x_btn.bind("<Enter>", lambda e: x_btn.configure(fg=_T["fg"]))
    x_btn.bind("<Leave>", lambda e: x_btn.configure(fg=_T["muted"]))

    # ── Drag-to-move (title bar acts as drag handle) ──────────────────────────
    _drag = {"x": 0, "y": 0}
    def _drag_start(e): _drag["x"] = e.x_root - win.winfo_x(); _drag["y"] = e.y_root - win.winfo_y()
    def _drag_move(e):  win.geometry(f"+{e.x_root - _drag['x']}+{e.y_root - _drag['y']}")
    for _w in (title_bar, title_lbl):
        _w.bind("<Button-1>",   _drag_start)
        _w.bind("<B1-Motion>",  _drag_move)

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
    # ═══════════════════════════════════════════════════════════════════════════
    # SETUP  (welcome + model download)
    # ═══════════════════════════════════════════════════════════════════════════
    setup = make_frame("setup")

    # ── Canvas illustration: animated neural network ──────────────────────────
    _canvas_w, _canvas_h = 460, 130
    canvas = tk.Canvas(setup, bg=_T["bg"], width=_canvas_w, height=_canvas_h,
                       highlightthickness=0)
    canvas.pack(pady=(28, 0))

    # Node positions (x, y) — 3 layers: 3 input, 5 hidden, 3 output
    _NX = {
        "i1": (60, 25),  "i2": (60, 65),  "i3": (60, 105),
        "h1": (170, 13), "h2": (170, 40), "h3": (170, 65), "h4": (170, 90), "h5": (170, 117),
        "o1": (280, 35), "o2": (280, 65), "o3": (280, 95),
    }
    _EDGES = [
        ("i1","h1"),("i1","h2"),("i1","h3"),
        ("i2","h2"),("i2","h3"),("i2","h4"),
        ("i3","h3"),("i3","h4"),("i3","h5"),
        ("h1","o1"),("h2","o1"),("h2","o2"),
        ("h3","o1"),("h3","o2"),("h3","o3"),
        ("h4","o2"),("h4","o3"),("h5","o3"),
    ]
    for a, b in _EDGES:
        x1, y1 = _NX[a]; x2, y2 = _NX[b]
        canvas.create_line(x1, y1, x2, y2, fill="#2A2620", width=1)

    _node_ovals = {}
    for name, (x, y) in _NX.items():
        r = 7
        canvas.create_oval(x-r-3, y-r-3, x+r+3, y+r+3, fill="#1E1A15", outline="")
        oval = canvas.create_oval(x-r, y-r, x+r, y+r, fill="#2A2620", outline="#38332A", width=1)
        _node_ovals[name] = oval

    # Dot in the centre representing the model
    canvas.create_oval(358, 48, 390, 80, fill="#2A2620", outline="#38332A", width=1)
    canvas.create_oval(363, 53, 385, 75, fill="#DA7756", outline="")
    canvas.create_text(374, 100, text="AI Cursor", fill=_T["muted"],
                       font=("Segoe UI", 8), anchor="center")

    _anim_seq  = ["i1","i2","i3","h1","h2","h3","h4","h5","o1","o2","o3"]
    _anim_idx  = [0]

    def _animate_nodes():
        if not canvas.winfo_exists():
            return
        prev = _anim_seq[(_anim_idx[0] - 1) % len(_anim_seq)]
        curr = _anim_seq[_anim_idx[0] % len(_anim_seq)]
        canvas.itemconfig(_node_ovals[prev], fill="#2A2620", outline="#38332A")
        canvas.itemconfig(_node_ovals[curr], fill="#DA7756", outline="#DA7756")
        _anim_idx[0] += 1
        canvas.after(220, _animate_nodes)

    canvas.after(400, _animate_nodes)

    # ── Welcome text ──────────────────────────────────────────────────────────
    tk.Label(setup, text="Welcome to AI Cursor",
             bg=_T["bg"], fg=_T["fg"],
             font=("Segoe UI", 17, "bold")).pack(pady=(18, 4))
    tk.Label(setup, text="Your local AI is getting ready.",
             bg=_T["bg"], fg=_T["dim"],
             font=("Segoe UI", 11)).pack()
    tk.Label(setup, text="One-time download · stays on your machine · works offline · resumes if interrupted",
             bg=_T["bg"], fg=_T["muted"],
             font=("Segoe UI", 9)).pack(pady=(4, 0))

    tk.Frame(setup, bg=_T["border"], height=1).pack(fill="x", padx=32, pady=16)

    # ── Model size picker (shown before download starts) ──────────────────────
    from models import get_by_id as _get_model
    _MODEL_OPTS = [
        ("qwen2.5:14b", "Aura 14B  —  Best quality",  "~9 GB  ·  deeper reasoning"),
        ("qwen2.5:7b",  "Aura 7B  —  Faster download", "~4.7 GB  ·  half the wait"),
        ("qwen2.5:3b",  "Aura 3B  —  Lightweight",    "~2 GB  ·  low RAM machines"),
    ]
    _chosen_model = [state.model_dl_status.get("_chosen") or "qwen2.5:14b"]

    picker_frame = tk.Frame(setup, bg=_T["bg"], padx=32)
    picker_frame.pack(fill="x", pady=(0, 10))
    tk.Label(picker_frame, text="CHOOSE MODEL", bg=_T["bg"], fg=_T["muted"],
             font=("Segoe UI", 7, "bold")).pack(anchor="w", pady=(0, 6))

    _picker_btns = {}
    btn_row = tk.Frame(picker_frame, bg=_T["bg"])
    btn_row.pack(anchor="w")

    def _select_model(key):
        _chosen_model[0] = key
        for k, b in _picker_btns.items():
            active = (k == key)
            b.configure(bg=_T["accent"] if active else _T["panel2"],
                        fg="#1A1611" if active else _T["dim"])

    for model_key, label, desc in _MODEL_OPTS:
        col = tk.Frame(btn_row, bg=_T["bg"])
        col.pack(side="left", padx=(0, 8))
        active = (model_key == _chosen_model[0])
        b = tk.Label(col, text=label,
                     bg=_T["accent"] if active else _T["panel2"],
                     fg="#1A1611" if active else _T["dim"],
                     font=("Segoe UI", 9, "bold"), padx=14, pady=7, cursor="hand2")
        b.pack()
        tk.Label(col, text=desc, bg=_T["bg"], fg=_T["muted"],
                 font=("Segoe UI", 8)).pack(pady=(3, 0))
        b.bind("<Button-1>", lambda e, k=model_key: _select_model(k))
        _picker_btns[model_key] = b

    tk.Frame(setup, bg=_T["border"], height=1).pack(fill="x", padx=32, pady=(6, 16))

    # ── Models section ────────────────────────────────────────────────────────
    from config import OLLAMA_VISION

    _models_info = [
        (state.model_dl_status.get("qwen2.5:14b", {}),   "qwen2.5:14b",  "~9 GB  ·  reasoning & coding"),
        (state.model_dl_status.get("qwen2.5:7b",  {}),   "qwen2.5:7b",   "~4.7 GB  ·  faster option"),
        (state.model_dl_status.get("llava-phi3",  {}),   "llava-phi3",   "~1.7 GB  ·  vision"),
    ]

    models_outer = tk.Frame(setup, bg=_T["bg"], padx=32)
    models_outer.pack(fill="x")

    # Header label
    models_hdr = tk.Frame(models_outer, bg=_T["bg"])
    models_hdr.pack(fill="x", pady=(0, 6))
    tk.Label(models_hdr, text="MODELS", bg=_T["bg"], fg=_T["muted"],
             font=("Segoe UI", 7, "bold")).pack(side="left")
    _chevron_lbl = tk.Label(models_hdr, text="▾", bg=_T["bg"], fg=_T["muted"],
                            font=("Segoe UI", 9), cursor="hand2")
    _chevron_lbl.pack(side="right")

    # Expandable detail panel
    _detail_frame = tk.Frame(models_outer, bg=_T["panel"], padx=16, pady=12)
    _detail_open  = [False]

    def _build_detail():
        for child in _detail_frame.winfo_children():
            child.destroy()
        for s, mname, desc in _models_info:
            row = tk.Frame(_detail_frame, bg=_T["panel"])
            row.pack(fill="x", pady=(0, 10))
            name_row = tk.Frame(row, bg=_T["panel"])
            name_row.pack(fill="x")
            tk.Label(name_row, text=mname, bg=_T["panel"], fg=_T["fg"],
                     font=("Segoe UI", 9, "bold")).pack(side="left")
            tk.Label(name_row, text=desc, bg=_T["panel"], fg=_T["muted"],
                     font=("Segoe UI", 8)).pack(side="left", padx=(8, 0))
            status = s.get("text", "Waiting…")
            done   = s.get("done", False)
            error  = s.get("error", False)
            status_fg = _T["accent"] if done else (_T["danger"] if error else _T["dim"])
            tk.Label(name_row, text=status, bg=_T["panel"], fg=status_fg,
                     font=("Segoe UI", 8)).pack(side="right")
            # Progress bar
            pct = s.get("pct", 0) if not done else 100
            bar_track = tk.Frame(row, bg=_T["panel2"], height=4)
            bar_track.pack(fill="x", pady=(4, 0))
            bar_track.pack_propagate(False)
            if pct > 0:
                tk.Frame(bar_track, bg=_T["accent"] if not error else _T["danger"],
                         height=4).place(x=0, y=0, relwidth=min(1.0, pct / 100), relheight=1)

    def _toggle_models():
        if _detail_open[0]:
            _detail_frame.pack_forget()
            _chevron_lbl.configure(text="▾")
        else:
            _build_detail()
            _detail_frame.pack(fill="x", pady=(0, 8))
            _chevron_lbl.configure(text="▴")
        _detail_open[0] = not _detail_open[0]

    # Hover to expand
    _hover_job = [None]
    def _hover_enter(e):
        if not _detail_open[0]:
            _hover_job[0] = models_hdr.after(150, lambda: _toggle_models() if not _detail_open[0] else None)
    def _hover_leave(e):
        if _hover_job[0]:
            try: models_hdr.after_cancel(_hover_job[0])
            except Exception: pass

    for _w in (models_hdr, _chevron_lbl):
        _w.bind("<Button-1>", lambda e: _toggle_models())
        _w.bind("<Enter>",    _hover_enter)
        _w.bind("<Leave>",    _hover_leave)

    # ── Status summary row (always visible) ───────────────────────────────────
    _summary_var = tk.StringVar(value="Downloading model…")
    _summary_lbl = tk.Label(models_outer, textvariable=_summary_var,
                            bg=_T["bg"], fg=_T["dim"], font=("Segoe UI", 9))
    _summary_lbl.pack(anchor="w", pady=(4, 0))

    # ── "Get Started" button (hidden until model is ready) ────────────────────
    _started_btn = tk.Label(setup, text="Get Started  →",
                            bg=_T["accent"], fg="#1A1611",
                            font=("Segoe UI", 11, "bold"),
                            padx=28, pady=11, cursor="hand2")
    _started_btn.pack_forget()   # shown when download completes

    def _go_home(e=None):
        state.is_first_run = False
        switch("home")
    _started_btn.bind("<Button-1>", _go_home)

    # ── Poll download progress every 500ms ───────────────────────────────────
    _dl_started = [False]

    def _poll_setup():
        if not win.winfo_exists():
            return

        # Start download on first poll — dashboard is visible by now
        if not _dl_started[0] and state.is_first_run:
            _dl_started[0] = True
            chosen = _chosen_model[0]
            from config import OLLAMA_VISION, NVIDIA_API_KEY
            from ai import download_model_bg, get_vision_api
            # Hide picker now that download is starting
            picker_frame.pack_forget()
            threading.Thread(target=download_model_bg, args=(chosen,), daemon=True).start()
            if not get_vision_api() and not NVIDIA_API_KEY:
                threading.Thread(target=download_model_bg, args=(OLLAMA_VISION,), daemon=True).start()

        chosen = _chosen_model[0]
        main_s = state.model_dl_status.get(chosen, {})
        done  = main_s.get("done", False)
        error = main_s.get("error", False)
        text  = main_s.get("text", "Downloading…")

        def _fmt_eta(secs: int) -> str:
            if secs <= 0: return ""
            if secs < 60: return f"~{secs}s"
            m = secs // 60
            return f"~{m}m" if m < 60 else f"~{m//60}h {m%60}m"

        if done:
            _summary_var.set("Model ready — press Alt+A to start")
            _summary_lbl.configure(fg=_T["accent"])
            if not _started_btn.winfo_ismapped():
                _started_btn.pack(pady=(20, 0))
        elif error:
            _summary_var.set(f"Download failed: {text}")
            _summary_lbl.configure(fg=_T["danger"])
        else:
            pct   = main_s.get("pct", 0)
            mb    = main_s.get("mb", 0)
            tot   = main_s.get("tot", 0)
            spd   = main_s.get("speed_mbs", 0)
            eta   = main_s.get("eta_secs", 0)
            if tot > 0:
                parts = [f"{pct}%  ·  {mb} MB / {tot} MB"]
                if spd > 0:   parts.append(f"{spd} MB/s")
                if eta > 0:   parts.append(_fmt_eta(eta))
                _summary_var.set("  ·  ".join(parts))
            else:
                _summary_var.set(text or "Starting download…")
            _summary_lbl.configure(fg=_T["dim"])

        # Refresh detail if open
        if _detail_open[0]:
            _build_detail()

        win.after(500, _poll_setup)

    win.after(500, _poll_setup)

    # ── Show expanded by default on first open ────────────────────────────────
    _toggle_models()

    # ═══════════════════════════════════════════════════════════════════════════
    # HOME
    # ═══════════════════════════════════════════════════════════════════════════
    home = make_frame("home")
    h_outer, h_inner = scrollable(home)
    h_outer.pack(fill="both", expand=True)

    # ── Update banner (shown if a newer release is available) ───────────────────
    def _show_update_banner(info: dict):
        banner = tk.Frame(h_inner, bg="#1E1A15", padx=14, pady=10)
        banner.pack(fill="x", pady=(0, 8))
        tk.Frame(banner, bg=_T["accent"], width=2).pack(side="left", fill="y", padx=(0, 10))
        tk.Label(banner, text=f"Update available: v{info['version']}",
                 bg="#1E1A15", fg=_T["fg"],
                 font=("Segoe UI", 9, "bold")).pack(side="left")
        _prog_lbl = tk.Label(banner, text="", bg="#1E1A15", fg=_T["muted"],
                             font=("Segoe UI", 8))
        _prog_lbl.pack(side="left", padx=(8, 0))
        _dl_btn = tk.Label(banner, text="Download & Install",
                           bg=_T["accent"], fg="#1A1611",
                           font=("Segoe UI", 8, "bold"),
                           padx=10, pady=4, cursor="hand2")
        _dl_btn.pack(side="right")

        def _start_dl(e):
            from updater import download_and_apply, apply_update
            _dl_btn.configure(text="Downloading…", bg=_T["panel2"], cursor="", fg=_T["dim"])
            _dl_btn.unbind("<Button-1>")

            def _prog(pct):
                win.after(0, lambda: _prog_lbl.configure(text=f"{pct}%"))

            def _done(path):
                def _apply():
                    _prog_lbl.configure(text="")
                    _dl_btn.configure(text="Restarting…", fg=_T["dim"])
                    win.after(1200, lambda: apply_update(path, root))
                win.after(0, _apply)

            def _err(msg):
                win.after(0, lambda: _dl_btn.configure(
                    text="Failed — retry", bg=_T["danger"], fg="#fff", cursor="hand2"))
                win.after(0, lambda: _dl_btn.bind("<Button-1>", _start_dl))

            download_and_apply(info["url"], info["version"], _prog, _done, _err)

        _dl_btn.bind("<Button-1>", _start_dl)

    def _check_update_bg():
        from updater import check_for_update
        info = check_for_update()
        if info and win.winfo_exists():
            win.after(0, lambda: _show_update_banner(info))

    threading.Thread(target=_check_update_bg, daemon=True).start()

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

    _status_poll_id = [None]

    def _fetch_status(reschedule: bool = True):
        from ai import get_ollama_api, get_vision_api, start_bundled_ollama
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

            if reschedule and win.winfo_exists():
                _status_poll_id[0] = win.after(5000, lambda: threading.Thread(
                    target=_fetch_status, daemon=True).start())

        win.after(0, _apply)

    def _restart_ollama():
        local_val.configure(text="Starting…", fg=_T["muted"])
        local_dot.configure(fg=_T["muted"])
        def _do():
            from ai import start_bundled_ollama
            start_bundled_ollama()
            threading.Thread(target=_fetch_status, kwargs={"reschedule": False}, daemon=True).start()
        threading.Thread(target=_do, daemon=True).start()

    restart_row = tk.Frame(h_inner, bg=_T["bg"])
    restart_row.pack(fill="x", padx=16, pady=(0, 8))
    tk.Button(
        restart_row, text="↺  Restart Ollama", bg=_T["panel2"], fg=_T["dim"],
        relief="flat", bd=0, padx=12, pady=5,
        font=("Segoe UI", 8), cursor="hand2",
        command=_restart_ollama,
    ).pack(side="left")
    tk.Button(
        restart_row, text="⟳  Refresh status", bg=_T["panel2"], fg=_T["dim"],
        relief="flat", bd=0, padx=12, pady=5,
        font=("Segoe UI", 8), cursor="hand2",
        command=lambda: threading.Thread(
            target=_fetch_status, kwargs={"reschedule": False}, daemon=True).start(),
    ).pack(side="left", padx=(8, 0))

    def _on_close():
        if _status_poll_id[0]:
            win.after_cancel(_status_poll_id[0])
        win.destroy()
    win.protocol("WM_DELETE_WINDOW", _on_close)
    x_btn.bind("<Button-1>", lambda e: _on_close())

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
    # MODELS
    # ═══════════════════════════════════════════════════════════════════════════
    mdl_tab = make_frame("models")
    md_outer, md_inner = scrollable(mdl_tab)
    md_outer.pack(fill="both", expand=True)

    def _refresh_models():
        for w in md_inner.winfo_children():
            w.destroy()

        from models import MODELS, CATEGORY_LABELS, BADGE_COLORS, stars
        from storage import load_active_model, save_active_model
        from ai import download_model_bg, delete_model, is_model_pulled
        from providers.registry import set_active_ollama_model

        active_model = load_active_model()

        # Fast check: only in-memory state — no HTTP calls on the main thread.
        # Background thread (below) queries Ollama and refreshes the tab.
        def _is_downloaded(mid: str) -> bool:
            return bool(state.model_dl_status.get(mid, {}).get("done"))

        # Group by category
        from models import get_by_category
        for cat in ["main", "vision", "embed"]:
            cat_models = get_by_category(cat)
            if not cat_models:
                continue
            section(md_inner, CATEGORY_LABELS[cat])

            for m in cat_models:
                mid        = m["id"]
                downloaded = _is_downloaded(mid)
                is_active  = (mid == active_model)
                dl_status  = state.model_dl_status.get(mid, {})
                downloading = bool(dl_status) and not dl_status.get("done") and not dl_status.get("error")

                c = card(md_inner, pady=10)

                # ── Top row: name + badge + active pill ───────────────────────
                top = tk.Frame(c, bg=_T["panel"])
                top.pack(fill="x")

                name_lbl = tk.Label(top, text=m["name"],
                                    bg=_T["panel"], fg=_T["fg"],
                                    font=("Segoe UI", 10, "bold"))
                name_lbl.pack(side="left")

                if m["badge"]:
                    badge_col = BADGE_COLORS.get(m["badge_col"], _T["panel2"])
                    tk.Label(top, text=m["badge"],
                             bg=badge_col, fg="#fff",
                             font=("Segoe UI", 7, "bold"),
                             padx=5, pady=1).pack(side="left", padx=(6, 0))

                if is_active:
                    tk.Label(top, text="● Active",
                             bg=_T["panel"], fg=_T["accent"],
                             font=("Segoe UI", 8, "bold")).pack(side="right")

                # ── Tagline ───────────────────────────────────────────────────
                tk.Label(c, text=m["tagline"],
                         bg=_T["panel"], fg=_T["dim"],
                         font=("Segoe UI", 9), anchor="w").pack(anchor="w", pady=(2, 0))

                # ── Specs row ─────────────────────────────────────────────────
                specs = (f"{m['size_gb']} GB  ·  {m['ram_gb']} GB RAM  ·  "
                         f"{m['speed']}  ·  {stars(m['stars'])}")
                tk.Label(c, text=specs,
                         bg=_T["panel"], fg=_T["muted"],
                         font=("Segoe UI", 8)).pack(anchor="w", pady=(2, 0))

                # ── Best for ──────────────────────────────────────────────────
                tk.Label(c, text=f"Best for: {m['best_for']}",
                         bg=_T["panel"], fg=_T["muted"],
                         font=("Segoe UI", 8), anchor="w",
                         wraplength=460, justify="left").pack(anchor="w", pady=(2, 6))

                # ── Progress bar (if downloading) ─────────────────────────────
                if downloading:
                    pct = dl_status.get("pct", 0)
                    bar_track = tk.Frame(c, bg=_T["panel2"], height=3)
                    bar_track.pack(fill="x", pady=(0, 4))
                    bar_track.pack_propagate(False)
                    if pct > 0:
                        tk.Frame(bar_track, bg=_T["accent"], height=3).place(
                            x=0, y=0, relwidth=min(1.0, pct / 100), relheight=1)
                    spd = dl_status.get("speed_mbs", 0)
                    eta = dl_status.get("eta_secs", 0)
                    txt = dl_status.get("text", "Downloading…")
                    if spd > 0:
                        mins = eta // 60
                        secs = eta % 60
                        eta_str = f"{mins}m {secs}s" if mins else f"{secs}s"
                        txt = f"{pct}%  ·  {spd} MB/s  ·  ~{eta_str} left"
                    tk.Label(c, text=txt,
                             bg=_T["panel"], fg=_T["dim"],
                             font=("Segoe UI", 8)).pack(anchor="w")

                # ── Action buttons ────────────────────────────────────────────
                if cat == "main":   # only main models can be set active
                    btn_row = tk.Frame(c, bg=_T["panel"])
                    btn_row.pack(anchor="e", pady=(4, 0))

                    if not downloaded and not downloading:
                        def _dl(m_id=mid):
                            import threading as _thr
                            _thr.Thread(target=download_model_bg, args=(m_id,),
                                        daemon=True).start()
                            win.after(600, _refresh_models)
                        dl_btn = tk.Label(btn_row, text="Download",
                                          bg=_T["accent"], fg="#1A1611",
                                          font=("Segoe UI", 8, "bold"),
                                          padx=10, pady=4, cursor="hand2")
                        dl_btn.pack(side="left", padx=(0, 6))
                        dl_btn.bind("<Button-1>", lambda e, f=_dl: f())

                    elif downloaded and not is_active:
                        def _activate(m_id=mid):
                            set_active_ollama_model(m_id)
                            _refresh_models()
                        act_btn = tk.Label(btn_row, text="Set Active",
                                           bg=_T["panel2"], fg=_T["accent"],
                                           font=("Segoe UI", 8, "bold"),
                                           padx=10, pady=4, cursor="hand2")
                        act_btn.pack(side="left", padx=(0, 6))
                        act_btn.bind("<Button-1>", lambda e, f=_activate: f())

                        def _del(m_id=mid):
                            import threading as _thr
                            _thr.Thread(target=lambda: (delete_model(m_id),
                                                         win.after(0, _refresh_models)),
                                        daemon=True).start()
                        del_btn = tk.Label(btn_row, text="Delete",
                                           bg=_T["panel2"], fg=_T["danger"],
                                           font=("Segoe UI", 8),
                                           padx=8, pady=4, cursor="hand2")
                        del_btn.pack(side="left")
                        del_btn.bind("<Button-1>", lambda e, f=_del: f())

                    elif downloading:
                        tk.Label(btn_row, text="Downloading…",
                                 bg=_T["panel"], fg=_T["dim"],
                                 font=("Segoe UI", 8)).pack(side="left")

                elif cat in ("vision", "embed"):
                    btn_row = tk.Frame(c, bg=_T["panel"])
                    btn_row.pack(anchor="e", pady=(4, 0))
                    if not downloaded and not downloading:
                        def _dl_other(m_id=mid):
                            import threading as _thr
                            _thr.Thread(target=download_model_bg, args=(m_id,),
                                        daemon=True).start()
                            win.after(600, _refresh_models)
                        dl_btn = tk.Label(btn_row, text="Download",
                                          bg=_T["accent"], fg="#1A1611",
                                          font=("Segoe UI", 8, "bold"),
                                          padx=10, pady=4, cursor="hand2")
                        dl_btn.pack(side="left")
                        dl_btn.bind("<Button-1>", lambda e, f=_dl_other: f())
                    elif downloaded:
                        def _del_other(m_id=mid):
                            import threading as _thr
                            _thr.Thread(target=lambda: (delete_model(m_id),
                                                         win.after(0, _refresh_models)),
                                        daemon=True).start()
                        del_btn = tk.Label(btn_row, text="Delete",
                                           bg=_T["panel2"], fg=_T["danger"],
                                           font=("Segoe UI", 8),
                                           padx=8, pady=4, cursor="hand2")
                        del_btn.pack(side="left")
                        del_btn.bind("<Button-1>", lambda e, f=_del_other: f())
                    elif downloading:
                        tk.Label(btn_row, text="Downloading…",
                                 bg=_T["panel"], fg=_T["dim"],
                                 font=("Segoe UI", 8)).pack(side="left")

        # Auto-refresh while any model is actively downloading
        if any(s and not s.get("done") and not s.get("error")
               for s in state.model_dl_status.values()):
            win.after(1000, _refresh_models)

        # Background Ollama check — discovers models installed in previous sessions.
        # Parallel checks (one thread per unknown model) with short timeout.
        # Guards against the dashboard being closed before the thread finishes.
        def _bg_ollama_check():
            import http.client as _hc
            import json as _json
            from concurrent.futures import ThreadPoolExecutor, as_completed
            from config import OLLAMA_PORT
            from models import MODELS as _ALL_MODELS

            unknown = [m["id"] for m in _ALL_MODELS
                       if not state.model_dl_status.get(m["id"], {}).get("done")]
            if not unknown:
                return

            changed = False

            def _check_one(mid: str) -> tuple[str, bool]:
                for port in [OLLAMA_PORT, 11434]:
                    try:
                        body = _json.dumps({"name": mid}).encode()
                        conn = _hc.HTTPConnection("localhost", port, timeout=3)
                        conn.request("POST", "/api/show", body=body,
                                     headers={"Content-Type": "application/json"})
                        resp = conn.getresponse()
                        conn.close()
                        if resp.status == 200:
                            return mid, True
                    except Exception:
                        pass
                return mid, False

            with ThreadPoolExecutor(max_workers=6) as pool:
                futures = {pool.submit(_check_one, mid): mid for mid in unknown}
                for f in as_completed(futures, timeout=8):
                    try:
                        mid, found = f.result()
                        if found:
                            state.model_dl_status[mid] = {
                                "done": True, "pct": 100, "text": "Ready ✓"}
                            changed = True
                    except Exception:
                        pass

            if changed:
                try:
                    if win.winfo_exists():
                        win.after(0, _refresh_models)
                except Exception:
                    pass

        threading.Thread(target=_bg_ollama_check, daemon=True).start()

    _refresh_models()

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
    # DEV PANEL
    # ═══════════════════════════════════════════════════════════════════════════
    dev_tab = make_frame("devpanel")
    dv_outer, dv_inner = scrollable(dev_tab)
    dv_outer.pack(fill="both", expand=True)

    def _refresh_dev():
        for w in dv_inner.winfo_children():
            w.destroy()
        try:
            import rag_log
            events = rag_log.recent(20)
        except Exception:
            events = []

        section(dv_inner, "RAG Activity Log")

        # Clear button
        def _clear_log():
            try:
                import rag_log; rag_log.clear()
            except Exception:
                pass
            _refresh_dev()

        ctrl = tk.Frame(dv_inner, bg=_T["bg"])
        ctrl.pack(fill="x", padx=16, pady=(0, 8))
        tk.Label(ctrl, text=f"{len(events)} event(s) recorded this session",
                 bg=_T["bg"], fg=_T["muted"], font=("Segoe UI", 8)).pack(side="left")
        clr = tk.Label(ctrl, text="Clear", bg=_T["panel2"], fg=_T["muted"],
                       font=("Segoe UI", 8), padx=8, pady=3, cursor="hand2")
        clr.pack(side="right")
        clr.bind("<Button-1>", lambda e: _clear_log())

        if not events:
            tk.Label(dv_inner, text="No retrieval events yet. Run an action to see activity.",
                     bg=_T["bg"], fg=_T["muted"],
                     font=("Segoe UI", 9), padx=20).pack(anchor="w", pady=8)
        else:
            for ev in events:
                c = card(dv_inner, pady=8)
                # Header row: status dot + context + action + age
                top = tk.Frame(c, bg=_T["panel"])
                top.pack(fill="x")
                dot_col = (_T["muted"] if ev.skipped
                           else _T["accent"] if ev.docs_kept > 0
                           else _T["danger"])
                tk.Label(top, text="●", bg=_T["panel"], fg=dot_col,
                         font=("Segoe UI", 8)).pack(side="left", padx=(0, 6))
                tk.Label(top, text=f"{ev.context_type} / {ev.action}",
                         bg=_T["panel"], fg=_T["fg"],
                         font=("Segoe UI", 9, "bold")).pack(side="left")
                tk.Label(top, text=ev.age_str, bg=_T["panel"], fg=_T["muted"],
                         font=("Segoe UI", 8)).pack(side="right")
                # Detail row
                if ev.skipped:
                    detail = f"Skipped: {ev.skip_reason}"
                elif ev.cache_hit:
                    detail = f"Cache hit — {ev.docs_kept} docs ({ev.entity})"
                else:
                    detail = (f"Entity: {ev.entity}  |  "
                              f"{ev.docs_fetched} fetched → {ev.docs_kept} kept  |  "
                              f"{ev.latency_ms}ms")
                tk.Label(c, text=detail, bg=_T["panel"], fg=_T["dim"],
                         font=("Segoe UI", 8), anchor="w").pack(anchor="w", pady=(2, 0))
                # Queries (collapsed)
                if not ev.skipped and ev.queries:
                    q_txt = " · ".join(ev.queries[:3])
                    tk.Label(c, text=q_txt[:90], bg=_T["panel"], fg=_T["muted"],
                             font=("Segoe UI", 7), anchor="w").pack(anchor="w")

        # Cache stats
        section(dv_inner, "Session Cache")
        try:
            from retrieval_engine import _cache
            n_cached = len(_cache)
        except Exception:
            n_cached = 0
        c = card(dv_inner, pady=10)
        tk.Label(c, text=f"{n_cached} query result(s) cached this session",
                 bg=_T["panel"], fg=_T["dim"],
                 font=("Segoe UI", 9)).pack(side="left", fill="x", expand=True)
        def _clear_cache():
            try:
                from retrieval_engine import clear_cache; clear_cache()
            except Exception:
                pass
            _refresh_dev()
        clr2 = tk.Label(c, text="Flush", bg=_T["panel2"], fg=_T["muted"],
                        font=("Segoe UI", 8), padx=8, pady=3, cursor="hand2")
        clr2.pack(side="right")
        clr2.bind("<Button-1>", lambda e: _clear_cache())

    _refresh_dev()

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

    section(p_inner, "Web Retrieval")

    from storage import load_rag_enabled, save_rag_enabled, load_rag_opt_out, save_rag_opt_out
    from rag_config import STRATEGIES

    # Master toggle
    rag_card = card(p_inner, pady=12)
    card_row(rag_card, "Allow web retrieval",
             "When enabled, AI Cursor searches the web to enrich certain responses")
    toggle_widget(rag_card, load_rag_enabled,
                  lambda: save_rag_enabled(True),
                  lambda: save_rag_enabled(False))

    # Per-context opt-outs (most common contexts)
    opt_card = card(p_inner, pady=10)
    tk.Label(opt_card, text="Disable retrieval per context",
             bg=_T["panel"], fg=_T["dim"],
             font=("Segoe UI", 9, "bold")).pack(anchor="w")
    tk.Label(opt_card, text="Toggle OFF to skip web search for that context type",
             bg=_T["panel"], fg=_T["muted"],
             font=("Segoe UI", 8)).pack(anchor="w", pady=(0, 8))

    _opt_out = load_rag_opt_out()
    for ctx_key in ["trading", "sales", "ecommerce", "developer",
                    "research", "real_estate", "customer_support", "generic"]:
        meta = STRATEGIES.get(ctx_key)
        if not meta:
            continue
        row = tk.Frame(opt_card, bg=_T["panel"])
        row.pack(fill="x", pady=2)
        tk.Label(row, text=ctx_key.replace("_", " ").title(),
                 bg=_T["panel"], fg=_T["fg"],
                 font=("Segoe UI", 9), width=22, anchor="w").pack(side="left")

        def _make_toggle(k):
            def _load():  return k not in load_rag_opt_out()
            def _on():
                s = load_rag_opt_out(); s.discard(k); save_rag_opt_out(s)
            def _off():
                s = load_rag_opt_out(); s.add(k);     save_rag_opt_out(s)
            toggle_widget(row, _load, _on, _off)
        _make_toggle(ctx_key)

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

    # ═══════════════════════════════════════════════════════════════════════════
    # CONNECTIONS
    # ═══════════════════════════════════════════════════════════════════════════
    conn_tab = make_frame("connections")
    co_outer, co_inner = scrollable(conn_tab)
    co_outer.pack(fill="both", expand=True)

    def _refresh_conn():
        for w in co_inner.winfo_children():
            w.destroy()
        from connections import load_connections, PROVIDER_TYPES
        conns     = load_connections()
        ai_conns  = [c for c in conns if c.is_ai_provider()]
        ret_conns = [c for c in conns if c.is_retrieval_provider()]

        def _conn_row(parent, conn):
            c = card(parent, pady=10)
            dot = tk.Label(c, text="●", bg=_T["panel"], fg=_T["muted"],
                           font=("Segoe UI", 9))
            dot.pack(side="left", padx=(0, 10))
            left = tk.Frame(c, bg=_T["panel"])
            left.pack(side="left", fill="x", expand=True)
            tk.Label(left, text=conn.name, bg=_T["panel"], fg=_T["fg"],
                     font=("Segoe UI", 9, "bold"), anchor="w").pack(anchor="w")
            tk.Label(left, text=PROVIDER_TYPES.get(conn.type, {}).get("label", conn.type),
                     bg=_T["panel"], fg=_T["muted"],
                     font=("Segoe UI", 8), anchor="w").pack(anchor="w")

            def _test(dot=dot, conn=conn):
                dot.configure(fg=_T["muted"])
                def _chk():
                    try:
                        from connections import (instantiate_ai_provider,
                                                  instantiate_retrieval_provider)
                        from keychain import load as kc_load
                        creds = kc_load(conn.credential_ref)
                        p = (instantiate_ai_provider(conn, creds)
                             if conn.is_ai_provider()
                             else instantiate_retrieval_provider(conn, creds))
                        ok = bool(p and p.is_available())
                    except Exception:
                        ok = False
                    try:
                        dot.after(0, lambda: dot.configure(
                            fg=_T["accent"] if ok else _T["danger"]))
                    except Exception:
                        pass
                import threading as _thr
                _thr.Thread(target=_chk, daemon=True).start()

            def _delete(conn=conn):
                from connections import delete_connection
                from keychain import delete as kc_del
                delete_connection(conn.id)
                if conn.credential_ref:
                    kc_del(conn.credential_ref)
                _refresh_conn()

            for (txt, col, fn) in [
                ("Test",   _T["dim"],    _test),
                ("Edit",   _T["dim"],    lambda c=conn: _open_conn_form(kind=None, conn=c)),
                ("Delete", _T["danger"], _delete),
            ]:
                btn = tk.Label(c, text=txt, bg=_T["panel2"], fg=col,
                               font=("Segoe UI", 8), padx=8, pady=3, cursor="hand2")
                btn.pack(side="right", padx=(4, 0))
                btn.bind("<Button-1>", lambda e, f=fn: f())

        section(co_inner, "AI Providers")
        if not ai_conns:
            tk.Label(co_inner, text="No AI providers configured.",
                     bg=_T["bg"], fg=_T["muted"],
                     font=("Segoe UI", 9)).pack(anchor="w", padx=20, pady=(0, 6))
        for c in ai_conns:
            _conn_row(co_inner, c)
        add_ai = tk.Label(co_inner, text="+ Add AI Provider",
                          bg=_T["panel2"], fg=_T["accent"],
                          font=("Segoe UI", 9), padx=12, pady=5, cursor="hand2")
        add_ai.pack(anchor="e", padx=16, pady=(4, 12))
        add_ai.bind("<Button-1>", lambda e: _open_conn_form(kind="ai"))

        section(co_inner, "Retrieval Providers")
        if not ret_conns:
            tk.Label(co_inner, text="No retrieval providers configured.",
                     bg=_T["bg"], fg=_T["muted"],
                     font=("Segoe UI", 9)).pack(anchor="w", padx=20, pady=(0, 6))
        for c in ret_conns:
            _conn_row(co_inner, c)
        add_ret = tk.Label(co_inner, text="+ Add Retrieval Provider",
                           bg=_T["panel2"], fg=_T["accent"],
                           font=("Segoe UI", 9), padx=12, pady=5, cursor="hand2")
        add_ret.pack(anchor="e", padx=16, pady=(4, 12))
        add_ret.bind("<Button-1>", lambda e: _open_conn_form(kind="retrieval"))

    def _open_conn_form(kind=None, conn=None):
        """Open the add/edit connection popup."""
        import uuid
        from connections import (PROVIDER_TYPES, ConnectionConfig,
                                  upsert_connection, instantiate_ai_provider,
                                  instantiate_retrieval_provider)
        from keychain import store as kc_store, load as kc_load

        popup = tk.Toplevel(win)
        popup.overrideredirect(True)
        popup.attributes("-topmost", True)
        popup.configure(bg=_T["bg"])
        popup.grab_set()

        is_edit = conn is not None
        title   = ("Edit Connection" if is_edit
                   else ("Add AI Provider" if kind == "ai" else "Add Retrieval Provider"))

        # Determine available types for this form
        if kind == "ai" or (is_edit and conn.is_ai_provider()):
            avail_types = [(k, v["label"]) for k, v in PROVIDER_TYPES.items()
                           if v["kind"] == "ai"]
        else:
            avail_types = [(k, v["label"]) for k, v in PROVIDER_TYPES.items()
                           if v["kind"] == "retrieval"]

        # ── Popup layout ──────────────────────────────────────────────────────
        outer = tk.Frame(popup, bg=_T["bg"], padx=20, pady=16)
        outer.pack()

        # Header
        hdr = tk.Frame(outer, bg=_T["bg"])
        hdr.pack(fill="x")
        tk.Label(hdr, text=title, bg=_T["bg"], fg=_T["fg"],
                 font=("Segoe UI", 11, "bold")).pack(side="left")
        tk.Label(hdr, text="✕", bg=_T["bg"], fg=_T["muted"],
                 font=("Segoe UI", 11), cursor="hand2").pack(side="right")\
          .bind("<Button-1>", lambda e: popup.destroy())
        tk.Frame(outer, bg=_T["border"], height=1).pack(fill="x", pady=(10, 12))

        # Name field
        tk.Label(outer, text="Name", bg=_T["bg"], fg=_T["dim"],
                 font=("Segoe UI", 9)).pack(anchor="w")
        name_var = tk.StringVar(value=conn.name if is_edit else "")
        tk.Entry(outer, textvariable=name_var, bg=_T["panel2"], fg=_T["fg"],
                 insertbackground=_T["fg"], relief="flat",
                 font=("Segoe UI", 9), width=36).pack(fill="x", pady=(2, 10))

        # Type selector (disabled on edit)
        tk.Label(outer, text="Provider Type", bg=_T["bg"], fg=_T["dim"],
                 font=("Segoe UI", 9)).pack(anchor="w")
        type_var = tk.StringVar(value=conn.type if is_edit else avail_types[0][0])
        import tkinter.ttk as ttk_
        type_combo = ttk_.Combobox(
            outer, textvariable=type_var,
            values=[t[0] for t in avail_types],
            state="readonly" if not is_edit else "disabled",
            font=("Segoe UI", 9), width=34,
        )
        type_combo.pack(fill="x", pady=(2, 10))

        # Dynamic fields area
        fields_frame = tk.Frame(outer, bg=_T["bg"])
        fields_frame.pack(fill="x")
        cred_frame   = tk.Frame(outer, bg=_T["bg"])
        cred_frame.pack(fill="x")

        field_vars: dict[str, tk.StringVar] = {}
        cred_vars:  dict[str, tk.StringVar] = {}

        def _build_fields(selected_type: str):
            for w in fields_frame.winfo_children(): w.destroy()
            for w in cred_frame.winfo_children():   w.destroy()
            field_vars.clear()
            cred_vars.clear()

            meta      = PROVIDER_TYPES.get(selected_type, {})
            existing_settings = conn.settings if is_edit else {}
            existing_creds    = kc_load(conn.credential_ref) if is_edit and conn.credential_ref else {}

            # Settings fields
            for f in meta.get("fields", []):
                tk.Label(fields_frame, text=f["label"], bg=_T["bg"], fg=_T["dim"],
                         font=("Segoe UI", 9)).pack(anchor="w")
                var = tk.StringVar(value=existing_settings.get(f["key"],
                                                                f.get("default", "")))
                tk.Entry(fields_frame, textvariable=var, bg=_T["panel2"], fg=_T["fg"],
                         insertbackground=_T["fg"], relief="flat",
                         font=("Segoe UI", 9), width=36).pack(fill="x", pady=(2, 8))
                field_vars[f["key"]] = var

            # Credential fields (masked)
            if meta.get("credential_fields"):
                tk.Frame(cred_frame, bg=_T["border"], height=1).pack(fill="x", pady=6)
                tk.Label(cred_frame, text="Credentials (stored in OS keychain)",
                         bg=_T["bg"], fg=_T["muted"],
                         font=("Segoe UI", 8, "italic")).pack(anchor="w", pady=(0, 6))
            for f in meta.get("credential_fields", []):
                tk.Label(cred_frame, text=f["label"], bg=_T["bg"], fg=_T["dim"],
                         font=("Segoe UI", 9)).pack(anchor="w")
                placeholder = "••••••••" if (is_edit and existing_creds.get(f["key"])) else ""
                var = tk.StringVar(value=placeholder)
                e   = tk.Entry(cred_frame, textvariable=var, bg=_T["panel2"], fg=_T["fg"],
                               insertbackground=_T["fg"], relief="flat",
                               font=("Segoe UI", 9), width=36, show="•")
                e.pack(fill="x", pady=(2, 8))
                # Clear placeholder on first keystroke so user can type freely
                def _clear_ph(event, var=var):
                    if var.get() == "••••••••":
                        var.set("")
                e.bind("<Key>", _clear_ph)
                cred_vars[f["key"]] = var

        _build_fields(type_var.get())
        type_var.trace_add("write", lambda *_: _build_fields(type_var.get()))

        # Status label
        status_lbl = tk.Label(outer, text="", bg=_T["bg"], fg=_T["muted"],
                              font=("Segoe UI", 8))
        status_lbl.pack(anchor="w", pady=(6, 0))

        # Footer buttons
        tk.Frame(outer, bg=_T["border"], height=1).pack(fill="x", pady=(10, 8))
        foot = tk.Frame(outer, bg=_T["bg"])
        foot.pack(fill="x")

        def _save():
            name = name_var.get().strip()
            if not name:
                status_lbl.configure(text="Name is required.", fg=_T["danger"])
                return

            selected = type_var.get()
            settings = {k: v.get().strip() for k, v in field_vars.items()}
            creds    = {k: v.get() for k, v in cred_vars.items()
                        if v.get() and v.get() != "••••••••"}

            conn_id = conn.id if is_edit else str(uuid.uuid4())[:8]
            ref     = f"conn-{conn_id}"

            cfg = ConnectionConfig(
                id             = conn_id,
                name           = name,
                type           = selected,
                settings       = settings,
                credential_ref = ref,
            )
            errors = cfg.validate()
            if errors:
                status_lbl.configure(text=errors[0], fg=_T["danger"])
                return

            if creds:
                kc_store(ref, creds)
            upsert_connection(cfg)
            popup.destroy()
            _refresh_conn()

        cancel_btn = tk.Label(foot, text="Cancel", bg=_T["panel2"], fg=_T["dim"],
                              font=("Segoe UI", 9), padx=14, pady=5, cursor="hand2")
        cancel_btn.pack(side="left")
        cancel_btn.bind("<Button-1>", lambda e: popup.destroy())

        save_btn = tk.Label(foot, text="Save", bg=_T["accent"], fg="#1A1611",
                            font=("Segoe UI", 9, "bold"), padx=16, pady=5, cursor="hand2")
        save_btn.pack(side="right")
        save_btn.bind("<Button-1>", lambda e: _save())

        popup.update_idletasks()
        pw, ph = popup.winfo_reqwidth(), popup.winfo_reqheight()
        wx, wy = win.winfo_x(), win.winfo_y()
        ww, wh = win.winfo_width(), win.winfo_height()
        popup.geometry(f"+{wx + (ww - pw)//2}+{wy + (wh - ph)//2}")

    _refresh_conn()

    # ── Show ──────────────────────────────────────────────────────────────────
    switch(initial_tab if initial_tab in _frames else "home")
    win.deiconify()
    win.focus_force()
