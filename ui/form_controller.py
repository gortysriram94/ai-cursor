"""
ui/form_controller.py — "Review all, then fill + submit" form controller.

Flow:
  start_form_fill()
    └─ [background] scan → AI map → validate
         └─ _open_controller()
              └─ [risk summary if needed]
                   └─ _show_review_panel()   ← user sees & edits ALL fields at once
                        └─ _execute_fill()   → fills fields → auto-submits form
"""

import threading
import tkinter as tk
import tkinter.ttk as ttk

import state
from ui.icons import PAW_COLOR, dot_widget
from log import log


_BG     = "#1A1611"
_PANEL  = "#211E18"
_BORDER = "#38332A"
_FG     = "#F0EAE0"
_DIM    = "#C8BEB0"
_MUTED  = "#5A504A"
_ACCENT = PAW_COLOR

_PII_COLORS = {
    "low":     ("#2A3520", "#8BC34A", "PII"),
    "medium":  ("#332A10", "#F9A825", "⚠ Personal"),
    "high":    ("#3A1A0A", "#FF6B35", "⚠ Sensitive"),
    "blocked": ("#2A0A0A", "#E53935", "🔒 Manual"),
}

_SUBMIT_KEYWORDS = {
    "submit", "sign in", "log in", "login", "sign up", "register",
    "continue", "next", "save", "send", "apply", "ok", "confirm",
    "go", "search", "create", "create account", "update", "add",
    "get started", "join", "enter",
}


def start_form_fill(root: tk.Tk, window_info, cx: int, cy: int):
    if state.form_fill_active:
        return
    state.form_fill_active = True

    toast = _make_toast(root, "Scanning form fields…")

    def _prepare():
        from brain.form_filler import scan_fields, map_fields, validate_fields
        from security import assess_form
        ctx    = state.working_context
        fields = scan_fields(window_info)

        if not fields:
            root.after(0, lambda: (
                toast.destroy(),
                _show_no_fields_toast(root),
                _reset_state(),
            ))
            return

        fields         = map_fields(fields, ctx)
        ai_available   = any(f.suggested_value for f in fields)
        violations     = validate_fields(fields, window_info.app_name)
        viol_by_idx: dict[int, list] = {}
        for v in violations:
            viol_by_idx.setdefault(v.field_index, []).append(v)
        for f in fields:
            f._violations = viol_by_idx.get(f.index, [])

        risk = assess_form(fields)
        root.after(0, lambda: (
            toast.destroy(),
            _open_controller(root, fields, risk, cx, cy,
                             window_info=window_info,
                             ai_available=ai_available),
        ))

    threading.Thread(target=_prepare, daemon=True).start()


def _reset_state():
    state.form_fill_active = False


def _make_toast(root: tk.Tk, msg: str) -> tk.Toplevel:
    t = tk.Toplevel(root)
    t.overrideredirect(True)
    t.attributes("-topmost", True)
    t.attributes("-alpha", 0.90)
    t.configure(bg=_BORDER)
    f = tk.Frame(t, bg=_BG, padx=12, pady=7)
    f.pack(padx=1, pady=1)
    dot_widget(f, bg=_BG).pack(side="left", padx=(0, 7))
    tk.Label(f, text=msg, bg=_BG, fg=_DIM, font=("Segoe UI", 9)).pack(side="left")
    t.update_idletasks()
    sw = root.winfo_screenwidth()
    sh = root.winfo_screenheight()
    w, h = t.winfo_reqwidth(), t.winfo_reqheight()
    t.geometry(f"+{(sw - w) // 2}+{sh - h - 60}")
    return t


def _show_no_fields_toast(root: tk.Tk):
    t = _make_toast(root, "No form fields detected in this window.")
    root.after(2500, lambda: (t.destroy() if t.winfo_exists() else None))


def _open_controller(root: tk.Tk, fields: list, risk, cx: int, cy: int,
                     window_info=None, ai_available: bool = True):
    if risk.overall in ("sensitive", "high-risk"):
        _show_risk_summary(root, fields, risk, cx, cy,
                           window_info=window_info, ai_available=ai_available)
    else:
        _show_review_panel(root, fields, cx, cy,
                           window_info=window_info, ai_available=ai_available)


# ── Risk summary (unchanged, now routes to review panel) ─────────────────────

def _show_risk_summary(root: tk.Tk, fields: list, risk, cx: int, cy: int,
                       window_info=None, ai_available: bool = True):
    win = tk.Toplevel(root)
    win.overrideredirect(True)
    win.attributes("-topmost", True)
    win.attributes("-alpha", 0.97)
    win.configure(bg=_BORDER)

    outer = tk.Frame(win, bg=_BG)
    outer.pack(fill="both", expand=True, padx=1, pady=1)

    hdr = tk.Frame(outer, bg=_BG, padx=12, pady=9)
    hdr.pack(fill="x")
    dot_widget(hdr, bg=_BG).pack(side="left", padx=(0, 7))
    tk.Label(hdr, text="Security Notice", bg=_BG, fg=_FG,
             font=("Segoe UI", 9, "bold")).pack(side="left")

    tk.Frame(outer, bg=_BORDER, height=1).pack(fill="x")

    banner_bg = "#3A1A0A" if risk.overall == "high-risk" else "#332A10"
    banner_fg = "#FF6B35" if risk.overall == "high-risk" else "#F9A825"
    banner = tk.Frame(outer, bg=banner_bg, padx=12, pady=10)
    banner.pack(fill="x")
    tk.Label(banner, text=risk.summary, bg=banner_bg, fg=banner_fg,
             font=("Segoe UI", 9), wraplength=300, justify="left").pack(anchor="w")

    body = tk.Frame(outer, bg=_BG, padx=12, pady=8)
    body.pack(fill="x")
    pii_fields = [f for f in fields if getattr(f, "pii_level", "none") != "none"]
    if pii_fields:
        tk.Label(body, text="Sensitive fields:", bg=_BG, fg=_DIM,
                 font=("Segoe UI", 8)).pack(anchor="w", pady=(0, 4))
        for f in pii_fields[:6]:
            colors = _PII_COLORS.get(f.pii_level, _PII_COLORS["low"])
            row = tk.Frame(body, bg=_BG)
            row.pack(fill="x", pady=1)
            tk.Label(row, text=colors[2], bg=colors[0], fg=colors[1],
                     font=("Segoe UI", 7), padx=6, pady=2).pack(side="left", padx=(0, 6))
            lbl = f.label or f.placeholder or f"Field {f.index+1}"
            tk.Label(row, text=lbl, bg=_BG, fg=_DIM,
                     font=("Segoe UI", 9)).pack(side="left")

    tk.Frame(outer, bg=_BORDER, height=1).pack(fill="x")
    foot = tk.Frame(outer, bg=_BG, padx=12, pady=8)
    foot.pack(fill="x")

    def _proceed():
        win.destroy()
        _show_review_panel(root, fields, cx, cy,
                           window_info=window_info, ai_available=ai_available)

    def _cancel():
        win.destroy()
        _reset_state()

    tk.Label(foot, text="Cancel", bg=_PANEL, fg=_DIM,
             font=("Segoe UI", 9), padx=12, pady=5,
             cursor="hand2").pack(side="left")
    foot.winfo_children()[-1].bind("<Button-1>", lambda e: _cancel())

    proceed_btn = tk.Label(foot, text="Review Fields →", bg=_ACCENT, fg=_BG,
                           font=("Segoe UI", 9, "bold"), padx=14, pady=5,
                           cursor="hand2")
    proceed_btn.pack(side="right")
    proceed_btn.bind("<Button-1>", lambda e: _proceed())

    win.bind("<Escape>", lambda e: _cancel())
    win.bind("<Return>", lambda e: _proceed())
    _position(win, root, cx, cy)


# ── Review panel — all fields at once ────────────────────────────────────────

def _show_review_panel(root: tk.Tk, fields: list, cx: int, cy: int,
                       window_info=None, ai_available: bool = True):
    """
    Single panel showing every fillable field with its AI suggestion.
    User can edit any value inline, then clicks Fill & Submit.
    """
    win = tk.Toplevel(root)
    win.overrideredirect(True)
    win.attributes("-topmost", True)
    win.attributes("-alpha", 0.97)
    win.configure(bg=_BORDER)

    outer = tk.Frame(win, bg=_BG)
    outer.pack(fill="both", expand=True, padx=1, pady=1)

    # ── Header ────────────────────────────────────────────────────────────────
    hdr = tk.Frame(outer, bg=_BG, padx=12, pady=9)
    hdr.pack(fill="x")
    dot_widget(hdr, bg=_BG).pack(side="left", padx=(0, 7))

    fillable = [f for f in fields if getattr(f, "pii_level", "none") != "blocked"]
    total    = len(fields)
    blocked  = total - len(fillable)

    tk.Label(hdr, text="Fill Form", bg=_BG, fg=_FG,
             font=("Segoe UI", 9, "bold")).pack(side="left")
    tk.Label(hdr, text=f"  {total} field{'s' if total != 1 else ''}",
             bg=_BG, fg=_MUTED, font=("Segoe UI", 8)).pack(side="left")

    def _cancel():
        _reset_state()
        try: win.destroy()
        except Exception: pass

    x_btn = tk.Label(hdr, text="✕", bg=_BG, fg=_MUTED,
                     font=("Segoe UI", 9), cursor="hand2", padx=6)
    x_btn.pack(side="right")
    x_btn.bind("<Button-1>", lambda e: _cancel())

    tk.Frame(outer, bg=_BORDER, height=1).pack(fill="x")

    # ── AI unavailable banner ─────────────────────────────────────────────────
    if not ai_available:
        banner = tk.Frame(outer, bg="#332A10", padx=12, pady=6)
        banner.pack(fill="x")
        tk.Label(banner, text="⚠  AI suggestions unavailable — values from profile",
                 bg="#332A10", fg="#F9A825",
                 font=("Segoe UI", 8)).pack(anchor="w")

    # ── Scrollable field list ─────────────────────────────────────────────────
    scroll_outer = tk.Frame(outer, bg=_BG)
    scroll_outer.pack(fill="both", expand=True)

    canvas = tk.Canvas(scroll_outer, bg=_BG, highlightthickness=0,
                       width=320, height=min(len(fields) * 72 + 10, 380))
    sb = ttk.Scrollbar(scroll_outer, orient="vertical", command=canvas.yview)
    canvas.configure(yscrollcommand=sb.set)
    fields_frame = tk.Frame(canvas, bg=_BG)
    wid = canvas.create_window((0, 0), window=fields_frame, anchor="nw")

    fields_frame.bind("<Configure>",
                      lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
    canvas.bind("<Configure>", lambda e: canvas.itemconfig(wid, width=e.width))
    canvas.bind("<MouseWheel>",
                lambda e: canvas.yview_scroll(int(-1*(e.delta/120)), "units"))

    sb.pack(side="right", fill="y")
    canvas.pack(side="left", fill="both", expand=True)

    # ── Build one row per field ───────────────────────────────────────────────
    entry_vars: dict[int, tk.StringVar] = {}   # field.index → StringVar

    for field in fields:
        pii_level = getattr(field, "pii_level", "none")
        pii_label = getattr(field, "pii_label", "")
        is_blocked = pii_level == "blocked"
        is_high    = pii_level == "high"

        row = tk.Frame(fields_frame, bg=_BG, padx=10, pady=6)
        row.pack(fill="x")

        # Label row
        lbl_row = tk.Frame(row, bg=_BG)
        lbl_row.pack(fill="x")
        display = (field.label or field.placeholder or f"Field {field.index+1}").upper()
        tk.Label(lbl_row, text=display[:32], bg=_BG, fg=_MUTED,
                 font=("Segoe UI", 7, "bold"), anchor="w").pack(side="left")

        if pii_level != "none":
            colors = _PII_COLORS.get(pii_level, _PII_COLORS["low"])
            tk.Label(lbl_row, text=colors[2], bg=colors[0], fg=colors[1],
                     font=("Segoe UI", 7), padx=5, pady=1).pack(side="right")

        # Input row
        entry_border = tk.Frame(row, bg=_BORDER, padx=1, pady=1)
        entry_border.pack(fill="x", pady=(2, 0))
        entry_inner  = tk.Frame(entry_border, bg=_PANEL, padx=8, pady=5)
        entry_inner.pack(fill="x")

        if is_blocked:
            tk.Label(entry_inner, text="Fill manually",
                     bg=_PANEL, fg=_MUTED,
                     font=("Segoe UI", 9, "italic")).pack(anchor="w")
        else:
            prefill   = field.suggested_value or field.current_value or ""
            var       = tk.StringVar(value=prefill)
            entry_vars[field.index] = var

            _revealed = [False]
            show_char = "•" if is_high else ""

            ent = tk.Entry(entry_inner, textvariable=var,
                           bg=_PANEL, fg=_FG,
                           insertbackground=_FG, relief="flat", bd=0,
                           font=("Segoe UI", 10), show=show_char)
            ent.pack(side="left", fill="x", expand=True)

            ent.bind("<FocusIn>",  lambda e, b=entry_border: b.configure(bg=_ACCENT))
            ent.bind("<FocusOut>", lambda e, b=entry_border: b.configure(bg=_BORDER))

            if is_high:
                def _make_reveal(entry=ent, state=_revealed):
                    def _toggle(e=None):
                        state[0] = not state[0]
                        entry.configure(show="" if state[0] else "•")
                        btn.configure(text="Hide" if state[0] else "Reveal")
                    return _toggle

                btn = tk.Label(entry_inner, text="Reveal",
                               bg=_PANEL, fg=_MUTED,
                               font=("Segoe UI", 8), cursor="hand2", padx=6)
                btn.pack(side="right")
                btn.bind("<Button-1>", _make_reveal())

        # Violation indicators
        for v in getattr(field, "_violations", []):
            vbg = "#2A0A0A" if v.severity == "error" else "#332A10"
            vfg = "#E53935" if v.severity == "error" else "#F9A825"
            vf  = tk.Frame(row, bg=vbg, padx=6, pady=3)
            vf.pack(fill="x", pady=(2, 0))
            prefix = "✕ " if v.severity == "error" else "⚠ "
            tk.Label(vf, text=prefix + v.message, bg=vbg, fg=vfg,
                     font=("Segoe UI", 7), anchor="w").pack(anchor="w")

    # Blocked-field note
    if blocked:
        note = tk.Frame(fields_frame, bg=_BG, padx=10, pady=4)
        note.pack(fill="x")
        tk.Label(note, text=f"{blocked} blocked field{'s' if blocked > 1 else ''} must be filled manually.",
                 bg=_BG, fg=_MUTED, font=("Segoe UI", 8)).pack(anchor="w")

    # ── Footer ────────────────────────────────────────────────────────────────
    tk.Frame(outer, bg=_BORDER, height=1).pack(fill="x")
    foot = tk.Frame(outer, bg=_BG, padx=10, pady=8)
    foot.pack(fill="x")

    cancel_btn = tk.Label(foot, text="Cancel",
                          bg=_PANEL, fg=_DIM,
                          font=("Segoe UI", 9), padx=12, pady=5, cursor="hand2")
    cancel_btn.pack(side="left")
    cancel_btn.bind("<Button-1>", lambda e: _cancel())

    status_lbl = tk.Label(foot, text="", bg=_BG, fg=_MUTED,
                          font=("Segoe UI", 8))
    status_lbl.pack(side="left", padx=8)

    fill_btn = tk.Label(foot, text="Fill & Submit →",
                        bg=_ACCENT, fg=_BG,
                        font=("Segoe UI", 9, "bold"), padx=14, pady=5, cursor="hand2")
    fill_btn.pack(side="right")

    def _on_fill(e=None):
        # Commit edited values back onto field objects
        for field in fields:
            if field.index in entry_vars:
                edited = entry_vars[field.index].get().strip()
                if edited:
                    field.suggested_value = edited

        fill_btn.configure(text="Filling…", bg=_MUTED, cursor="arrow")
        fill_btn.unbind("<Button-1>")
        status_lbl.configure(text="applying…", fg=_DIM)
        win.update_idletasks()

        threading.Thread(
            target=_execute_fill,
            args=(root, win, fields, window_info, status_lbl),
            daemon=True,
        ).start()

    fill_btn.bind("<Button-1>", _on_fill)
    win.bind("<Return>", _on_fill)
    win.bind("<Escape>", lambda e: _cancel())

    _position(win, root, cx, cy)

    # Focus the first editable entry if present
    for field in fields:
        if field.index in entry_vars and getattr(field, "pii_level", "none") != "blocked":
            break


# ── Execution: fill all fields then auto-submit ───────────────────────────────

def _execute_fill(root: tk.Tk, win: tk.Toplevel,
                  fields: list, window_info, status_lbl):
    """
    Runs in a background thread.
    1. Fill each non-blocked field with the (possibly edited) suggested value.
    2. Try to auto-submit the form.
    3. Show completion toast.
    """
    from brain.form_filler import fill_field
    from plat import platform as get_platform

    plat   = get_platform()
    filled = 0

    for field in fields:
        pii_level = getattr(field, "pii_level", "none")
        if pii_level == "blocked":
            continue
        value = field.suggested_value or field.current_value
        if not value:
            continue
        try:
            ok = fill_field(field, value)
            if ok:
                field.filled = True
                filled += 1
        except Exception as e:
            log(f"[FORM] fill error field {field.index}: {e}")

    log(f"[FORM] filled {filled} / {len(fields)} fields")

    # ── Auto-submit ───────────────────────────────────────────────────────────
    submitted = False
    if filled > 0 and window_info is not None:
        submitted = _try_submit(plat, window_info)

    def _finish_ui():
        try:
            if win.winfo_exists():
                win.destroy()
        except Exception:
            pass
        _reset_state()
        if submitted:
            t = _make_toast(root, f"✓  {filled} fields filled — form submitted")
        else:
            t = _make_toast(root, f"✓  {filled} fields filled")
        root.after(2500, lambda: (t.destroy() if t.winfo_exists() else None))

    root.after(0, _finish_ui)


def _try_submit(plat, window_info) -> bool:
    """
    Find and click the submit button in the target form.
    Returns True if a submit action was triggered.

    Strategy (in order):
      1. UIA: look for a Button whose name matches submit keywords
      2. Fallback: press Enter via pyautogui on the active field
    """
    import time as _time

    # Give the last field value a moment to commit before searching
    _time.sleep(0.15)

    # ── Strategy 1: UIA button search ────────────────────────────────────────
    try:
        if hasattr(plat, "_uia") and plat._uia and window_info.handle:
            import comtypes.gen.UIAutomationClient as _UIA_MOD
            root_el = plat._uia.ElementFromHandle(window_info.handle)
            condition = plat._uia.CreatePropertyCondition(30003, 50000)  # Button
            buttons = root_el.FindAll(_UIA_MOD.TreeScope_Descendants, condition)
            for i in range(buttons.Length):
                try:
                    btn = buttons.GetElement(i)
                    name = (btn.CurrentName or "").strip().lower()
                    if not name:
                        continue
                    if any(kw in name for kw in _SUBMIT_KEYWORDS):
                        # Prefer exact short matches over partial matches
                        vp = btn.GetCurrentPattern(10000)  # InvokePattern
                        if vp:
                            import comtypes.gen.UIAutomationClient as _UIA2
                            iv = vp.QueryInterface(_UIA2.IUIAutomationInvokePattern)
                            iv.Invoke()
                            log(f"[FORM] auto-submitted via button '{name}'")
                            return True
                except Exception:
                    continue
    except Exception:
        pass

    # ── Strategy 2: press Enter on currently focused element ─────────────────
    try:
        import pyautogui as _pg
        _time.sleep(0.05)
        _pg.press("enter")
        log("[FORM] auto-submitted via Enter key")
        return True
    except Exception:
        pass

    return False


# ── Helpers ───────────────────────────────────────────────────────────────────

def _position(win: tk.Toplevel, root: tk.Tk, cx: int, cy: int):
    win.update_idletasks()
    sw = root.winfo_screenwidth()
    sh = root.winfo_screenheight()
    pw = win.winfo_reqwidth()
    ph = win.winfo_reqheight()
    nx = min(cx + 20, sw - pw - 10)
    ny = min(cy + 20, sh - ph - 10)
    win.geometry(f"+{max(10, nx)}+{max(10, ny)}")
