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

    def close():
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

    # App chip
    if app_name:
        tk.Label(hdr, text=app_name, bg=_T["bg"], fg=_T["fg"],
                 font=("Segoe UI", 9, "bold")).pack(side="left")

    # Market chip (dim, small)
    if context and context != "generic":
        market_label = context.replace("_", " ").replace("real estate ", "").replace("trading ", "").title()
        chip = tk.Frame(hdr, bg=_T["bg_raised"], padx=5, pady=1)
        chip.pack(side="left", padx=(6, 0))
        tk.Label(chip, text=market_label, bg=_T["bg_raised"], fg=_T["fg_muted"],
                 font=("Segoe UI", 7)).pack()

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

    # ── Situation line ────────────────────────────────────────────────────────
    if situation:
        sit_frame = tk.Frame(outer, bg=_T["bg"], padx=12, pady=0)
        sit_frame.pack(fill="x")
        tk.Label(
            sit_frame,
            text=situation[:90] + ("…" if len(situation) > 90 else ""),
            bg=_T["bg"], fg=_T["fg_muted"],
            font=("Segoe UI", 8),
            anchor="w", justify="left",
            wraplength=320,
        ).pack(anchor="w", pady=(0, 6))

    # ── Divider ───────────────────────────────────────────────────────────────
    tk.Frame(outer, bg=_T["border"], height=1).pack(fill="x")

    # ── Ask input ─────────────────────────────────────────────────────────────
    input_wrap   = tk.Frame(outer, bg=_T["bg"], padx=10, pady=10)
    input_wrap.pack(fill="x")
    input_border = tk.Frame(input_wrap, bg=_T["border"], padx=1, pady=1)
    input_border.pack(fill="x")
    input_inner  = tk.Frame(input_border, bg=_T["bg_input"], padx=10, pady=8)
    input_inner.pack(fill="x")

    ask_entry = tk.Entry(
        input_inner,
        bg=_T["bg_input"], fg=_T["fg_ghost"],
        insertbackground=_T["fg"],
        relief="flat", bd=0,
        font=("Segoe UI", 10),
    )
    ask_entry.pack(side="left", fill="x", expand=True)
    ask_entry.insert(0, _ASK_PH)

    # 📎 attach button
    _attachment = {"text": "", "name": "", "is_image": False, "path": ""}

    attach_lbl = tk.Label(input_inner, text="📎",
                          bg=_T["bg_input"], fg=_T["fg_muted"],
                          font=("Segoe UI", 10), cursor="hand2", padx=4)
    attach_lbl.pack(side="right", padx=(4, 0))

    # ↑ submit icon
    submit_lbl = tk.Label(input_inner, text="↑",
                          bg=PAW_COLOR, fg="#1A1611",
                          font=("Segoe UI", 9, "bold"),
                          padx=6, pady=2, cursor="hand2")
    submit_lbl.pack(side="right", padx=(6, 0))

    # Attachment chip row (hidden until a file is attached)
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
        remove_lbl = tk.Label(chip_wrap, text=" ×", bg=_T["bg_raised"], fg=_T["fg_muted"],
                               font=("Segoe UI", 8), cursor="hand2")
        remove_lbl.pack(side="left")
        remove_lbl.bind("<Button-1>", lambda e: _clear_attachment())
        _chip_lbl[0] = chip_wrap
        win.update_idletasks()
        # Reposition in case height changed
        _reposition()

    def _clear_attachment():
        _attachment.update({"text": "", "name": "", "is_image": False, "path": ""})
        attach_row.pack_forget()
        attach_lbl.configure(fg=_T["fg_muted"])

    def _open_file_dialog(e=None):
        _cancel_autoclose()
        filetypes = [
            ("All supported",
             "*.txt *.md *.pdf *.py *.js *.ts *.jsx *.tsx *.html *.css *.json "
             "*.yaml *.yml *.csv *.xml *.sql *.java *.cs *.go *.rs *.rb *.php "
             "*.png *.jpg *.jpeg *.gif *.webp"),
            ("Text files",   "*.txt *.md *.py *.js *.ts *.json *.yaml *.csv"),
            ("PDF",          "*.pdf"),
            ("Images",       "*.png *.jpg *.jpeg *.gif *.webp"),
            ("All files",    "*.*"),
        ]
        path = _filedialog.askopenfilename(
            title="Attach file as context",
            filetypes=filetypes,
        )
        if not path:
            return
        # Show chip immediately with loading state, read file in background
        # (PDF reads can take seconds — must not block the UI thread)
        import os as _os
        name = _os.path.basename(path)
        _attachment.update({"text": "", "name": name, "is_image": False, "path": path})
        attach_lbl.configure(fg=PAW_COLOR)
        _show_attach_chip(name)
        ask_entry.focus_set()

        def _read_bg():
            content, _, is_image = _read_attached_file(path)
            _attachment.update({"text": content, "is_image": is_image})

        threading.Thread(target=_read_bg, daemon=True).start()

    attach_lbl.bind("<Button-1>", _open_file_dialog)
    attach_lbl.bind("<Enter>",    lambda e: attach_lbl.configure(fg=_T["fg"]))
    attach_lbl.bind("<Leave>",    lambda e: attach_lbl.configure(
        fg=PAW_COLOR if _attachment["name"] else _T["fg_muted"]))

    def _focus_in(e):
        _cancel_autoclose()
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

    # ── Quick action suggestions ──────────────────────────────────────────────
    # Use context_type (email/chat/social/docs/…) for action button labels,
    # NOT market (sales/finance/…) which is for system-prompt vertical selection.
    actions = CONTEXT_ACTIONS.get(context_type,
              CONTEXT_ACTIONS.get(context,
              CONTEXT_ACTIONS["generic"]))
    # Show top 3, skip "annotate" (removed feature)
    suggestions = [(label, key) for label, key in actions
                   if key != "annotate"][:3]
    # Always offer Fill Form as the last suggestion
    suggestions.append(("Fill Form", "_fill_form"))

    if suggestions:
        tk.Frame(outer, bg=_T["border"], height=1).pack(fill="x")
        pill_row = tk.Frame(outer, bg=_T["bg"], padx=10, pady=8)
        pill_row.pack(fill="x")

        for label, action_key in suggestions:
            p = tk.Label(
                pill_row, text=label,
                bg=_T["pill"], fg=_T["pill_fg"],
                font=("Segoe UI", 8),
                padx=10, pady=4,
                cursor="hand2",
            )
            p.pack(side="left", padx=(0, 4))
            p.bind("<Enter>",
                   lambda e, w=p: w.configure(bg=_T["pill_active"],
                                               fg=_T["pill_active_fg"]))
            p.bind("<Leave>",
                   lambda e, w=p: w.configure(bg=_T["pill"],
                                               fg=_T["pill_fg"]))
            p.bind("<Button-1>",
                   lambda e, k=action_key: _run_action(k))

    # ── Submit logic ──────────────────────────────────────────────────────────

    def _apply_attachment(base_text: str) -> tuple[str, str]:
        """Returns (text_with_file_prepended, screenshot_b64). Reads from _attachment."""
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

    def _submit(e=None):
        q = ask_entry.get().strip()
        if not q or q == _ASK_PH:
            return
        _run_custom(q)

    def _run_custom(instruction: str):
        if not instruction or instruction == _ASK_PH:
            return

        # ── Transaction intent detection ──────────────────────────────────────
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
                                           _open_controller(root, fields, risk,
                                                            cx2, cy2)))
                _th.Thread(target=_fill_bg, daemon=True).start()

            def _on_edit():
                show_menu(root, cx2, cy2, app_name=app_name,
                          context=context, target_hwnd=target_hwnd)

            from ui.transaction_preview import show_transaction_preview
            show_transaction_preview(root, intent, cx2, cy2,
                                     _on_fill, _on_edit, lambda: None)
            return

        # ── Normal AI query ───────────────────────────────────────────────────
        from ui.result import show_result_window
        mx, my = win.winfo_x(), win.winfo_y()
        close()
        time.sleep(0.04)
        full_text = (ctx.raw_text[:2000] if ctx and ctx.raw_text else "")
        full_text, att_screenshot = _apply_attachment(full_text)
        show_result_window(
            root, full_text, "custom", saved_tone,
            mx, my,
            custom_instruction=instruction,
            target_hwnd=target_hwnd,
            bundle=bundle,
            screenshot=att_screenshot,
        )

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
        mx, my = win.winfo_x(), win.winfo_y()
        close()
        time.sleep(0.04)
        full_text = (ctx.raw_text[:2000] if ctx and ctx.raw_text else "")
        full_text, att_screenshot = _apply_attachment(full_text)
        show_result_window(
            root, full_text, action_key, saved_tone,
            mx, my,
            target_hwnd=target_hwnd,
            bundle=bundle,
            screenshot=att_screenshot,
        )

    submit_lbl.bind("<Button-1>", _submit)
    ask_entry.bind("<Return>",    _submit)

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
    ask_entry.focus_set()
