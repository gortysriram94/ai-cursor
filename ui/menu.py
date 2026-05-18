"""
ui/menu.py — Alt+A panel.

Opens with pre-built context from the brain.
No action grid, no tone selector, no annotation tools.

Layout:
  ┌──────────────────────────────────────────┐
  │  🔥  Chrome · email              [✕]     │  context chip + close
  │  Reading complaint from John Mills       │  situation (1 line, dim)
  ├──────────────────────────────────────────┤
  │  ask me anything…                     ↑  │  main input
  ├──────────────────────────────────────────┤
  │  Reply   Summarize   Shorter             │  top-3 quick suggestions
  └──────────────────────────────────────────┘
"""

import os
import time
import threading
import tkinter as tk
import tkinter.filedialog as _filedialog

import state
from config import TONES
from context import CONTEXT_ACTIONS, compose_context
from storage import get_pref
from log import log
from ui.icons import PAW_COLOR, dot_widget, create_paw_photo
from brain.context_bundle import ContextBundle


# ── Theme ──────────────────────────────────────────────────────────────────────

_T = {
    "bg":           "#1A1611",
    "bg_raised":    "#211E18",
    "bg_input":     "#16130F",
    "border":       "#38332A",
    "border_focus": PAW_COLOR,
    "fg":           "#F0EAE0",
    "fg_dim":       "#C8BEB0",
    "fg_muted":     "#5A504A",
    "fg_ghost":     "#3A3028",
    "accent":       PAW_COLOR,
    "pill":         "#2A2620",
    "pill_fg":      "#C8BEB0",
    "pill_active":  PAW_COLOR,
    "pill_active_fg": "#1A1611",
}

_ASK_PH = "ask me anything…"

_TEXT_EXTS = {
    ".txt", ".md", ".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".css",
    ".json", ".yaml", ".yml", ".csv", ".xml", ".sql", ".sh", ".bat",
    ".java", ".cs", ".cpp", ".c", ".h", ".go", ".rs", ".rb", ".php",
}
_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}


def _read_attached_file(path: str) -> tuple[str, str, bool]:
    """
    Returns (content_text, display_name, is_image).
    content_text is empty for images (they go through vision pipeline).
    """
    ext = os.path.splitext(path)[1].lower()
    name = os.path.basename(path)

    if ext in _IMAGE_EXTS:
        return "", name, True

    if ext == ".pdf":
        try:
            import pdfplumber
            with pdfplumber.open(path) as pdf:
                text = "\n".join(p.extract_text() or "" for p in pdf.pages[:20])
            return text.strip(), name, False
        except ImportError:
            pass
        try:
            import PyPDF2
            with open(path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                text = "\n".join(
                    (reader.pages[i].extract_text() or "")
                    for i in range(min(20, len(reader.pages)))
                )
            return text.strip(), name, False
        except Exception:
            return "", name, False

    if ext in _TEXT_EXTS or ext == "":
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                return f.read(50_000), name, False
        except Exception:
            return "", name, False

    # Unknown extension — try as text anyway
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read(50_000), name, False
    except Exception:
        return "", name, False


# ── Detecting animation ────────────────────────────────────────────────────────

def show_detecting(root: tk.Tk, cx: int, cy: int, callback):
    """Brief 'detecting…' flash before the panel opens."""
    win = tk.Toplevel(root)
    win.overrideredirect(True)
    win.attributes("-topmost", True)
    win.attributes("-alpha", 0.95)
    win.configure(bg=_T["border"])

    f = tk.Frame(win, bg=_T["bg"], padx=12, pady=8)
    f.pack(padx=1, pady=1)
    dot_widget(f, bg=_T["bg"]).pack(side="left", padx=(0, 8))
    tk.Label(f, text="detecting…", bg=_T["bg"], fg=_T["fg_dim"],
             font=("Segoe UI", 9)).pack(side="left")

    win.update_idletasks()
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    w, h   = win.winfo_reqwidth(), win.winfo_reqheight()
    win.geometry(f"+{min(cx + 12, sw - w - 10)}+{max(10, min(cy - h//2, sh - h - 10))}")
    win.after(180, lambda: (win.destroy(), callback()))


# ── Main panel ─────────────────────────────────────────────────────────────────

def show_menu(root: tk.Tk, cx: int, cy: int,
              app_name: str = "",
              context:  str = "generic",
              target_hwnd=None,
              on_settings=None,
              on_close=None):
    """
    Open the Alt+A panel.
    Context is pre-built by the brain — no capture happens here.
    """
    state.menu_open = True

    ctx      = state.working_context
    bundle   = ContextBundle.from_working_context(ctx) if ctx else ContextBundle.empty()
    raw_text = ctx.raw_text if ctx else ""

    # Override app_name / context from brain if available
    if ctx:
        app_name = ctx.app_name or app_name
        context  = ctx.market   or context

    # Unpack bundle into locals — used throughout show_menu
    context_type = bundle.context_type
    situation    = bundle.situation
    entities     = bundle.entities
    confidence   = bundle.confidence
    signals      = bundle.signals

    saved_tone = get_pref(app_name, "tone", "professional") if app_name else "professional"

    # ── Click-outside catcher — transparent full-screen window behind panel ────
    # Catches any click outside the panel and closes it.
    _catcher = tk.Toplevel(root)
    _catcher.overrideredirect(True)
    _catcher.attributes("-topmost", True)
    _catcher.attributes("-alpha", 0.01)
    _sw = root.winfo_screenwidth()
    _sh = root.winfo_screenheight()
    _catcher.geometry(f"{_sw}x{_sh}+0+0")

    # ── Window ────────────────────────────────────────────────────────────────
    win = tk.Toplevel(root)
    win._is_menu = True          # marker so the safety check can identify this window
    win.overrideredirect(True)
    win.attributes("-topmost", True)
    win.attributes("-alpha", 0.97)
    win.configure(bg=_T["border"])
    win.lift(_catcher)           # panel sits above the catcher

    outer = tk.Frame(win, bg=_T["bg"])
    outer.pack(fill="both", expand=True, padx=1, pady=1)

    _closing = [False]   # guard against double-close race condition

    def close():
        if _closing[0]:
            return
        _closing[0] = True
        state.menu_open = False
        try: _catcher.destroy()
        except Exception: pass
        try: win.destroy()
        except Exception: pass
        if on_close:
            try: on_close()
            except Exception: pass

    _catcher.bind("<Button-1>", lambda e: close())
    _catcher.bind("<Button-3>", lambda e: close())

    # Kept as no-ops so existing call sites don't break
    def _cancel_autoclose(e=None):
        pass

    # ── Header row ────────────────────────────────────────────────────────────
    hdr = tk.Frame(outer, bg=_T["bg"], padx=12, pady=9)
    hdr.pack(fill="x")

    # Flame dot
    dot_widget(hdr, bg=_T["bg"]).pack(side="left", padx=(0, 7))

    # App chip only — no market chip, no noise
    if app_name:
        tk.Label(hdr, text=app_name, bg=_T["bg"], fg=_T["fg"],
                 font=("Segoe UI", 9, "bold")).pack(side="left")

    # Close button (right-most)
    x_btn = tk.Label(hdr, text="✕", bg=_T["bg"], fg=_T["fg_muted"],
                     font=("Segoe UI", 9), cursor="hand2", padx=4)
    x_btn.pack(side="right")
    x_btn.bind("<Button-1>", lambda e: close())
    x_btn.bind("<Enter>",    lambda e: x_btn.configure(fg=_T["fg"]))
    x_btn.bind("<Leave>",    lambda e: x_btn.configure(fg=_T["fg_muted"]))

    # Settings button (⚙) — opens the dashboard
    def _open_settings(e=None):
        _cancel_autoclose()
        if on_settings:
            on_settings()
        else:
            try:
                from ui.dashboard import show_dashboard
                show_dashboard(root)
            except Exception:
                pass

    gear_btn = tk.Label(hdr, text="⚙", bg=_T["bg"], fg=_T["fg_muted"],
                        font=("Segoe UI", 10), cursor="hand2", padx=4)
    gear_btn.pack(side="right")
    gear_btn.bind("<Button-1>", _open_settings)
    gear_btn.bind("<Enter>",    lambda e: gear_btn.configure(fg=_T["fg"]))
    gear_btn.bind("<Leave>",    lambda e: gear_btn.configure(fg=_T["fg_muted"]))

    # ── Drag to move ──────────────────────────────────────────────────────────
    _drag = {"x": 0, "y": 0}

    def _drag_start(e):
        _drag["x"] = e.x_root - win.winfo_x()
        _drag["y"] = e.y_root - win.winfo_y()
        _cancel_autoclose()

    def _drag_move(e):
        win.geometry(f"+{e.x_root - _drag['x']}+{e.y_root - _drag['y']}")

    hdr.bind("<Button-1>",  _drag_start)
    hdr.bind("<B1-Motion>", _drag_move)
    # Prevent drag propagating from the clickable buttons to the header
    x_btn.bind("<B1-Motion>",    lambda e: "break")
    gear_btn.bind("<B1-Motion>", lambda e: "break")

    # ── Posture / cache state (calculated before any UI) ─────────────────────
    import hashlib as _hl
    _raw_hash         = _hl.md5(raw_text[:400].encode()).hexdigest()[:12] if raw_text else ""
    _pcache           = state.proactive_cache.get(_raw_hash, {}) if _raw_hash else {}
    _cached_action    = _pcache.get("action",    "") if _pcache.get("status") == "ready" else ""
    _cached_result    = _pcache.get("result",    "") if _pcache.get("status") == "ready" else ""
    _cached_reasoning = _pcache.get("reasoning", "") if _pcache.get("status") == "ready" else ""
    _ctype_conf       = getattr(ctx, "content_type_conf", 0.0) if ctx else 0.0
    _retry_count      = _pcache.get("retry_count", 0)

    _raw_actions = CONTEXT_ACTIONS.get(context_type,
                   CONTEXT_ACTIONS.get(context, CONTEXT_ACTIONS["generic"]))
    try:
        from storage import load_action_rankings
        _rankings = load_action_rankings().get(context_type, {})
        if _rankings:
            _raw_actions = sorted(_raw_actions, key=lambda la: -_rankings.get(la[1], 0))
    except Exception:
        pass
    suggestions    = [(lbl, k) for lbl, k in _raw_actions if k != "annotate"][:3]
    suggestions.append(("Fill Form", "_fill_form"))
    _suggested_key = suggestions[0][1] if suggestions and _ctype_conf >= 0.75 else ""

    if _cached_action:                                        _posture = "cached"
    elif _suggested_key and _suggested_key != "_fill_form":  _posture = "suggested"
    elif confidence >= 0.4:                                   _posture = "normal"
    else:                                                     _posture = "open"

    # ── Recommendation header (when proactive cache has a result) ─────────────
    if _cached_action:
        _action_labels = {
            "reply":     "Draft reply?",
            "summarize": "Summarize this?",
            "follow_up": "Send follow-up?",
            "explain":   "Explain this?",
            "improve":   "Improve this?",
        }
        _rec_question = _action_labels.get(
            _cached_action, f"Do {_cached_action.replace('_', ' ')}?")
        q_frame = tk.Frame(outer, bg=_T["bg"], padx=12, pady=8)
        q_frame.pack(fill="x")
        tk.Label(q_frame, text=_rec_question, bg=_T["bg"], fg=_T["fg"],
                 font=("Segoe UI", 9, "bold"), anchor="w").pack(anchor="w")

    # ── Shared attachment state ────────────────────────────────────────────────
    _attachment = {"text": "", "name": "", "is_image": False, "path": ""}
    _entry_ref = [None]  # holds reference to ask_entry for focus management

    # ── Shared helpers (defined before inner render functions) ─────────────────

    def _apply_attachment(base_text: str) -> tuple[str, str]:
        if not _attachment["name"]:
            return base_text, ""
        if _attachment["is_image"]:
            try:
                import base64 as _b64
                with open(_attachment["path"], "rb") as _f:
                    return base_text, _b64.b64encode(_f.read()).decode()
            except Exception:
                return base_text, ""
        if _attachment["text"]:
            block = (f"[Attached file: {_attachment['name']}]\n"
                     f"{_attachment['text'][:6000]}\n"
                     f"[End of attached file]\n\n")
            return block + base_text, ""
        return base_text, ""

    def _run_custom(instruction: str):
        if not instruction or instruction == _ASK_PH:
            return
        try:
            from brain.intent_parser import parse_intent
            intent = parse_intent(instruction, app_name)
        except Exception:
            intent = None

        if intent and intent.confidence >= 0.55:
            mx2, my2 = win.winfo_x(), win.winfo_y()
            close()
            import pyautogui as _pg
            cx2, cy2 = _pg.position()

            def _on_fill():
                from plat import platform as get_platform
                window = get_platform().get_active_window()
                if not window:
                    return
                import threading as _th
                def _fill_bg():
                    from brain.form_filler import (scan_fields, map_from_entities,
                                                    validate_fields)
                    from security import assess_form
                    from brain.transaction_templates import get_template
                    from ui.form_controller import (_open_controller, _reset_state,
                                                     _make_toast, _show_no_fields_toast)
                    import state as _s
                    if _s.form_fill_active:
                        return
                    _s.form_fill_active = True
                    toast = _make_toast(root, "Scanning form fields…")
                    fields = scan_fields(window)
                    if not fields:
                        root.after(0, lambda: (toast.destroy(),
                                               _show_no_fields_toast(root),
                                               _reset_state()))
                        return
                    tmpl = get_template(intent.transaction_type)
                    emap = tmpl.entity_map if tmpl else {}
                    map_from_entities(fields, intent.entities, emap)
                    violations = validate_fields(fields, window.app_name)
                    for f in fields:
                        f._violations = [v for v in violations
                                         if v.field_index == f.index]
                    risk = assess_form(fields)
                    root.after(0, lambda: (toast.destroy(),
                                           _open_controller(root, fields, risk, cx2, cy2)))
                _th.Thread(target=_fill_bg, daemon=True).start()

            def _on_edit():
                show_menu(root, cx2, cy2, app_name=app_name,
                          context=context, target_hwnd=target_hwnd)

            from ui.transaction_preview import show_transaction_preview
            show_transaction_preview(root, intent, cx2, cy2,
                                     _on_fill, _on_edit, lambda: None)
            return

        from ui.result import show_result_window
        mx, my = win.winfo_x(), win.winfo_y()
        close()
        time.sleep(0.04)
        full_text = (ctx.raw_text[:2000] if ctx and ctx.raw_text else "")
        full_text, att_screenshot = _apply_attachment(full_text)
        show_result_window(root, full_text, "custom", saved_tone, mx, my,
                           custom_instruction=instruction, target_hwnd=target_hwnd,
                           bundle=bundle, screenshot=att_screenshot)

    def _run_action(action_key: str):
        if action_key == "_fill_form":
            import pyautogui as _pg
            mx, my = _pg.position()
            close()
            window = None
            try:
                from plat import platform as get_platform
                window = get_platform().get_active_window()
            except Exception:
                pass
            if window:
                from ui.form_controller import start_form_fill
                start_form_fill(root, window, mx, my)
            return

        from ui.result import show_result_window
        import hashlib as _hl2
        import state as _state
        mx, my = win.winfo_x(), win.winfo_y()
        close()
        time.sleep(0.04)
        full_text = (ctx.raw_text[:2000] if ctx and ctx.raw_text else "")
        full_text, att_screenshot = _apply_attachment(full_text)
        proactive_result = ""
        if ctx and ctx.raw_text:
            _h    = _hl2.md5(ctx.raw_text[:400].encode()).hexdigest()[:12]
            _ent  = _state.proactive_cache.get(_h)
            if (_ent and _ent.get("status") == "ready"
                    and _ent.get("action") == action_key and _ent.get("result")):
                proactive_result = _ent["result"]
                log(f"[MENU] proactive cache hit for '{action_key}'")
        show_result_window(root, full_text, action_key, saved_tone, mx, my,
                           target_hwnd=target_hwnd, bundle=bundle,
                           screenshot=att_screenshot, proactive_result=proactive_result)

    # ── _build_input_row — reusable input field ───────────────────────────────
    def _build_input_row(container):
        input_wrap   = tk.Frame(container, bg=_T["bg"], padx=10, pady=10)
        input_wrap.pack(fill="x")
        input_border = tk.Frame(input_wrap, bg=_T["border"], padx=1, pady=1)
        input_border.pack(fill="x")
        input_inner  = tk.Frame(input_border, bg=_T["bg_input"], padx=10, pady=8)
        input_inner.pack(fill="x")

        ask_entry = tk.Entry(input_inner, bg=_T["bg_input"], fg=_T["fg_ghost"],
                             insertbackground=_T["fg"], relief="flat", bd=0,
                             font=("Segoe UI", 10))
        ask_entry.pack(side="left", fill="x", expand=True)
        ask_entry.insert(0, _ASK_PH)

        attach_lbl = tk.Label(input_inner, text="📎",
                              bg=_T["bg_input"], fg=_T["fg_muted"],
                              font=("Segoe UI", 10), cursor="hand2", padx=4)
        attach_lbl.pack(side="right", padx=(4, 0))

        submit_lbl = tk.Label(input_inner, text="↑",
                              bg=PAW_COLOR, fg="#1A1611",
                              font=("Segoe UI", 9, "bold"), padx=6, pady=2, cursor="hand2")
        submit_lbl.pack(side="right", padx=(6, 0))

        attach_row = tk.Frame(input_wrap, bg=_T["bg"])
        _chip_lbl  = [None]

        def _show_attach_chip(name: str):
            attach_row.pack(fill="x", pady=(0, 2))
            if _chip_lbl[0]:
                _chip_lbl[0].destroy()
            chip_wrap = tk.Frame(attach_row, bg=_T["bg_raised"], padx=6, pady=3)
            chip_wrap.pack(side="left")
            tk.Label(chip_wrap, text=f"📄 {name}", bg=_T["bg_raised"], fg=_T["fg_dim"],
                     font=("Segoe UI", 8)).pack(side="left")
            rm = tk.Label(chip_wrap, text=" ×", bg=_T["bg_raised"], fg=_T["fg_muted"],
                          font=("Segoe UI", 8), cursor="hand2")
            rm.pack(side="left")
            rm.bind("<Button-1>", lambda e: _clear_attachment())
            _chip_lbl[0] = chip_wrap
            win.update_idletasks()
            _reposition()

        def _clear_attachment():
            _attachment.update({"text": "", "name": "", "is_image": False, "path": ""})
            attach_row.pack_forget()
            attach_lbl.configure(fg=_T["fg_muted"])

        def _open_file_dialog(e=None):
            filetypes = [
                ("All supported",
                 "*.txt *.md *.pdf *.py *.js *.ts *.jsx *.tsx *.html *.css *.json "
                 "*.yaml *.yml *.csv *.xml *.sql *.java *.cs *.go *.rs *.rb *.php "
                 "*.png *.jpg *.jpeg *.gif *.webp"),
                ("Text files",  "*.txt *.md *.py *.js *.ts *.json *.yaml *.csv"),
                ("PDF",         "*.pdf"),
                ("Images",      "*.png *.jpg *.jpeg *.gif *.webp"),
                ("All files",   "*.*"),
            ]
            path = _filedialog.askopenfilename(title="Attach file as context",
                                               filetypes=filetypes)
            if not path:
                return
            import os as _os
            name = _os.path.basename(path)
            _attachment.update({"text": "", "name": name, "is_image": False, "path": path})
            attach_lbl.configure(fg=PAW_COLOR)
            _show_attach_chip(name)
            ask_entry.focus_set()
            threading.Thread(target=lambda: _attachment.update(
                zip(("text", "is_image"),
                    _read_attached_file(path)[::2])),
                daemon=True).start()

        attach_lbl.bind("<Button-1>", _open_file_dialog)
        attach_lbl.bind("<Enter>",    lambda e: attach_lbl.configure(fg=_T["fg"]))
        attach_lbl.bind("<Leave>",    lambda e: attach_lbl.configure(
            fg=PAW_COLOR if _attachment["name"] else _T["fg_muted"]))

        def _focus_in(e):
            input_border.configure(bg=_T["border_focus"])
            if ask_entry.get() == _ASK_PH:
                ask_entry.delete(0, "end")
                ask_entry.configure(fg=_T["fg"])

        def _focus_out(e):
            input_border.configure(bg=_T["border"])
            if not ask_entry.get().strip():
                ask_entry.delete(0, "end")
                ask_entry.insert(0, _ASK_PH)
                ask_entry.configure(fg=_T["fg_ghost"])

        ask_entry.bind("<FocusIn>",  _focus_in)
        ask_entry.bind("<FocusOut>", _focus_out)

        def _submit(e=None):
            q = ask_entry.get().strip()
            if not q or q == _ASK_PH:
                return
            _run_custom(q)

        submit_lbl.bind("<Button-1>", _submit)
        ask_entry.bind("<Return>",    _submit)
        _entry_ref[0] = ask_entry
        return ask_entry

    # ── _show_recommendation_card ─────────────────────────────────────────────
    def _show_recommendation_card():
        tk.Frame(outer, bg=_T["border"], height=1).pack(fill="x")
        _card = tk.Frame(outer, bg=_T["bg"], padx=12, pady=10)
        _card.pack(fill="x")

        result_text = _cached_result[:400] + ("…" if len(_cached_result) > 400 else "")
        tk.Label(_card, text=result_text,
                 bg=_T["bg_raised"], fg=_T["fg_dim"],
                 font=("Segoe UI", 9),
                 anchor="nw", justify="left",
                 wraplength=300, padx=8, pady=6).pack(fill="x", pady=(0, 8))

        btn_row = tk.Frame(_card, bg=_T["bg"])
        btn_row.pack(fill="x")

        def _use_it(e=None):
            from plat.executor import verified_insert
            verified_insert(_cached_result, target_hwnd=target_hwnd)
            close()

        def _try_again(e=None):
            if _raw_hash:
                _pc = state.proactive_cache.get(_raw_hash, {})
                _pc["retry_count"] = _pc.get("retry_count", 0) + 1
                state.proactive_cache[_raw_hash] = _pc
                from brain.proactive import _regenerate_action
                threading.Thread(
                    target=_regenerate_action,
                    args=(_raw_hash, raw_text, app_name, context_type,
                          signals, list(entities), _cached_action),
                    daemon=True,
                ).start()
            close()
            win.after(100, lambda: show_menu(root, cx, cy, app_name=app_name,
                                             context=context, target_hwnd=target_hwnd,
                                             on_settings=on_settings, on_close=on_close))

        use_btn = tk.Label(btn_row, text="Use it",
                           bg=_T["accent"], fg=_T["pill_active_fg"],
                           font=("Segoe UI", 8, "bold"), padx=12, pady=5, cursor="hand2")
        use_btn.pack(side="left", padx=(0, 6))
        use_btn.bind("<Button-1>", _use_it)

        retry_btn = tk.Label(btn_row, text="Try again",
                             bg=_T["bg_raised"], fg=_T["fg_dim"],
                             font=("Segoe UI", 8), padx=10, pady=5, cursor="hand2")
        retry_btn.pack(side="left")
        retry_btn.bind("<Button-1>", _try_again)

        dismiss = tk.Label(outer, text="Dismiss",
                           bg=_T["bg"], fg=_T["fg_muted"],
                           font=("Segoe UI", 8), padx=8, pady=6, cursor="hand2")
        dismiss.pack(pady=(4, 8))
        dismiss.bind("<Button-1>", lambda e: close())

        # After 2+ retries, also show the input field
        if _retry_count >= 2:
            tk.Frame(outer, bg=_T["border"], height=1).pack(fill="x", padx=12)
            tk.Label(outer, text="or type your own",
                     bg=_T["bg"], fg=_T["fg_muted"],
                     font=("Segoe UI", 7)).pack(anchor="w", padx=14, pady=(6, 2))
            _build_input_row(outer)

    # ── _show_input_mode ──────────────────────────────────────────────────────
    def _show_input_mode():
        tk.Frame(outer, bg=_T["border"], height=1).pack(fill="x")
        _build_input_row(outer)
        win.after(80, lambda: _entry_ref[0].focus_set() if _entry_ref[0] else None)

        # Chain UI takes priority over plan + pills
        _chain_now = state.active_chain
        _have_chain = (
            _chain_now
            and _chain_now.status == "active"
            and _chain_now.current < len(_chain_now.steps)
            and _chain_now.steps[_chain_now.current].output
        )
        if _have_chain:
            c_step  = _chain_now.steps[_chain_now.current]
            c_total = len(_chain_now.steps)
            c_idx   = _chain_now.current
            ch_frame = tk.Frame(outer, bg=_T["bg"], padx=12, pady=8)
            ch_frame.pack(fill="x")
            ch_hdr = tk.Frame(ch_frame, bg=_T["bg"])
            ch_hdr.pack(fill="x", pady=(0, 4))
            tk.Label(ch_hdr, text=f"Approval Chain  {c_idx + 1}/{c_total}",
                     bg=_T["bg"], fg=_T["fg_muted"], font=("Segoe UI", 7)).pack(side="left")
            tk.Label(ch_hdr, text=f"  —  {c_step.label}",
                     bg=_T["bg"], fg=_T["fg"], font=("Segoe UI", 8, "bold")).pack(side="left")
            tk.Label(ch_frame,
                     text=c_step.output[:180] + ("…" if len(c_step.output) > 180 else ""),
                     bg=_T["bg_raised"], fg=_T["fg_dim"], font=("Segoe UI", 8),
                     anchor="nw", justify="left", wraplength=300,
                     padx=8, pady=6).pack(fill="x", pady=(0, 6))
            ch_btns = tk.Frame(ch_frame, bg=_T["bg"])
            ch_btns.pack(fill="x")
            def _chain_approve(e=None):
                _chain_now.approve_current()
                if _chain_now.status == "complete":
                    state.active_chain = None
                close()
            def _chain_skip(e=None):
                _chain_now.skip_current()
                if _chain_now.status == "complete":
                    state.active_chain = None
                close()
            def _chain_cancel(e=None):
                _chain_now.cancel(); state.active_chain = None; close()
            for txt, fn, bg, fg in [
                ("Approve", _chain_approve, _T["accent"],    _T["pill_active_fg"]),
                ("Skip",    _chain_skip,    _T["bg_raised"], _T["fg_dim"]),
            ]:
                b = tk.Label(ch_btns, text=txt, bg=bg, fg=fg,
                             font=("Segoe UI", 8, "bold" if txt == "Approve" else "normal"),
                             padx=10, pady=4, cursor="hand2")
                b.pack(side="left", padx=(0, 4))
                b.bind("<Button-1>", fn)
            cc = tk.Label(ch_btns, text="Cancel chain", bg=_T["bg"], fg=_T["fg_muted"],
                          font=("Segoe UI", 8), padx=6, pady=4, cursor="hand2")
            cc.pack(side="right")
            cc.bind("<Button-1>", _chain_cancel)
            return

        # Plan step UI
        _active_plan   = state.active_plan
        _plan_step_key = f"{_raw_hash}:plan:{_active_plan.current_step}" if (
            _active_plan and _raw_hash) else ""
        _plan_cache    = state.proactive_cache.get(_plan_step_key, {}) if _plan_step_key else {}
        _have_plan     = (
            _active_plan
            and _active_plan.status == "active"
            and _active_plan.current_step < len(_active_plan.steps)
        )
        if _have_plan:
            step_idx    = _active_plan.current_step
            total_steps = len(_active_plan.steps)
            step        = _active_plan.steps[step_idx]
            step_status = _plan_cache.get("status", "")
            step_result = _plan_cache.get("result", "") if step_status == "ready" else ""
            plan_frame = tk.Frame(outer, bg=_T["bg"], padx=12, pady=8)
            plan_frame.pack(fill="x")
            step_hdr = tk.Frame(plan_frame, bg=_T["bg"])
            step_hdr.pack(fill="x", pady=(0, 4))
            tk.Label(step_hdr, text=f"Step {step_idx + 1} of {total_steps}",
                     bg=_T["bg"], fg=_T["fg_muted"], font=("Segoe UI", 7)).pack(side="left")
            tk.Label(step_hdr, text=f"  —  {step.label}",
                     bg=_T["bg"], fg=_T["fg"], font=("Segoe UI", 8, "bold")).pack(side="left")
            _ptxt = (step_result[:200] + ("…" if len(step_result) > 200 else "")
                     ) if step_result else "Generating…"
            result_var = tk.StringVar(value=_ptxt)
            tk.Label(plan_frame, textvariable=result_var, bg=_T["bg_raised"], fg=_T["fg_dim"],
                     font=("Segoe UI", 8), anchor="nw", justify="left",
                     wraplength=300, padx=8, pady=6).pack(fill="x", pady=(0, 6))
            def _poll_plan():
                ent = state.proactive_cache.get(_plan_step_key, {})
                if ent.get("status") == "ready" and ent.get("result"):
                    try: result_var.set(ent["result"][:200] + ("…" if len(ent["result"]) > 200 else ""))
                    except Exception: pass
                    return
                if ent.get("status") == "error":
                    try: result_var.set("Generation failed — click Try again")
                    except Exception: pass
                    return
                try: win.after(1000, _poll_plan)
                except Exception: pass
            if step_status != "ready":
                win.after(1000, _poll_plan)
            p_btns = tk.Frame(plan_frame, bg=_T["bg"])
            p_btns.pack(fill="x")
            def _plan_use(e=None):
                ent = state.proactive_cache.get(_plan_step_key, {})
                txt = ent.get("result", "")
                if not txt: return
                from plat.executor import verified_insert
                verified_insert(txt, target_hwnd=target_hwnd)
                _active_plan.current_step += 1
                if _active_plan.current_step >= total_steps:
                    _active_plan.status = "completed"; state.active_plan = None; close(); return
                nxt_idx = _active_plan.current_step
                nxt_key = f"{_raw_hash}:plan:{nxt_idx}"
                if nxt_key not in state.proactive_cache and _raw_hash:
                    from brain.proactive import _generate_plan_step
                    threading.Thread(target=_generate_plan_step,
                                     args=(_raw_hash, _active_plan, nxt_idx,
                                           raw_text, app_name, context_type,
                                           signals, list(entities)),
                                     daemon=True).start()
                close()
                win.after(60, lambda: show_menu(root, cx, cy, app_name=app_name,
                                                context=context, target_hwnd=target_hwnd,
                                                on_settings=on_settings, on_close=on_close))
            def _plan_retry(e=None):
                if _plan_step_key in state.proactive_cache:
                    del state.proactive_cache[_plan_step_key]
                if _raw_hash:
                    from brain.proactive import _generate_plan_step
                    threading.Thread(target=_generate_plan_step,
                                     args=(_raw_hash, _active_plan, step_idx,
                                           raw_text, app_name, context_type,
                                           signals, list(entities)),
                                     daemon=True).start()
                result_var.set("Regenerating…"); win.after(1000, _poll_plan)
            def _plan_dismiss(e=None):
                state.active_plan = None; close()
            use_b = tk.Label(p_btns, text="Use it", bg=_T["accent"],
                             fg=_T["pill_active_fg"], font=("Segoe UI", 8, "bold"),
                             padx=10, pady=4, cursor="hand2")
            use_b.pack(side="left", padx=(0, 4)); use_b.bind("<Button-1>", _plan_use)
            ret_b = tk.Label(p_btns, text="Try again", bg=_T["bg_raised"],
                             fg=_T["fg_dim"], font=("Segoe UI", 8), padx=8, pady=4, cursor="hand2")
            ret_b.pack(side="left", padx=(0, 4)); ret_b.bind("<Button-1>", _plan_retry)
            dis_b = tk.Label(p_btns, text="Dismiss", bg=_T["bg"], fg=_T["fg_muted"],
                             font=("Segoe UI", 8), padx=6, pady=4, cursor="hand2")
            dis_b.pack(side="right"); dis_b.bind("<Button-1>", _plan_dismiss)
            return

        # Plain suggestion pills
        pill_row = tk.Frame(outer, bg=_T["bg"], padx=10, pady=8)
        pill_row.pack(fill="x")
        for lbl, action_key in suggestions:
            p_bg  = _T["pill"]
            p_fg  = _T["pill_fg"]
            p = tk.Label(pill_row, text=lbl, bg=p_bg, fg=p_fg,
                         font=("Segoe UI", 8), padx=10, pady=4, cursor="hand2")
            p.pack(side="left", padx=(0, 4))
            p.bind("<Enter>",    lambda e, w=p: w.configure(bg=_T["pill_active"], fg=_T["pill_active_fg"]))
            p.bind("<Leave>",    lambda e, w=p, ob=p_bg, of=p_fg: w.configure(bg=ob, fg=of))
            p.bind("<Button-1>", lambda e, k=action_key: _run_action(k))

    # ── Render: recommendation card OR input mode ─────────────────────────────
    if _cached_action and _pcache.get("status") == "ready" and _cached_result:
        _show_recommendation_card()
    else:
        _show_input_mode()

    win.bind("<Escape>", lambda e: close())

    # Extend drag to the full outer frame (not just the header)
    # Sub-widgets with their own handlers (buttons, entry) naturally block propagation
    outer.bind("<Button-1>",  _drag_start)
    outer.bind("<B1-Motion>", _drag_move)

    # ── Position — multi-monitor aware ───────────────────────────────────────
    def _reposition():
        try:
            win.update_idletasks()
            from main import _get_monitor_rect
            ml, mt, mr, mb = _get_monitor_rect(cx, cy)
            pw = win.winfo_reqwidth()
            ph = win.winfo_reqheight()
            # Place right of cursor; flip left if it would go off the right edge
            nx = cx + 14 if cx + 14 + pw <= mr - 10 else cx - pw - 14
            # Clamp vertically within this monitor
            nx = max(ml + 4, nx)
            ny = max(mt + 10, min(cy - ph // 3, mb - ph - 10))
            win.geometry(f"+{nx}+{ny}")
        except Exception:
            pass

    _reposition()

    # Auto-focus ask entry for low-confidence "open" posture
    if _posture == "open":
        win.after(80, lambda: _entry_ref.focus_set() if _entry_ref else None)
