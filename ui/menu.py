"""
ui/menu.py — Alt+A panel.

Pipeline: Observe → Recommend → Approve → Execute
Optimised for keyboard-first, zero-friction execution.

States:
  result  — pre-generated recommendation shown inline  (Enter=insert, Tab=retry)
  input   — ask anything + context-aware pills          (Enter=submit)
  loading — spinner while AI generates
  stream  — tokens arriving live, transitions to result on done
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
    ext  = os.path.splitext(path)[1].lower()
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
    Alt+A panel — observe → recommend → approve → execute.
    Keyboard-first: Enter=insert, Tab=retry, Esc=close.
    """
    state.menu_open = True

    ctx      = state.working_context
    bundle   = ContextBundle.from_working_context(ctx) if ctx else ContextBundle.empty()
    raw_text = ctx.raw_text if ctx else ""

    if ctx:
        app_name = ctx.app_name or app_name
        context  = ctx.market   or context

    context_type = bundle.context_type
    entities     = bundle.entities
    signals      = bundle.signals

    # ── Proactive cache lookup ────────────────────────────────────────────────
    import hashlib as _hl
    _raw_hash         = _hl.md5(raw_text[:400].encode()).hexdigest()[:12] if raw_text else ""
    _pcache           = state.proactive_cache.get(_raw_hash, {}) if _raw_hash else {}
    _cached_result    = _pcache.get("result",    "") if _pcache.get("status") == "ready" else ""
    _cached_action    = _pcache.get("action",    "") if _pcache.get("status") == "ready" else ""
    _cached_reasoning = _pcache.get("reasoning", "") if _pcache.get("status") == "ready" else ""

    # ── Window ────────────────────────────────────────────────────────────────
    _catcher = tk.Toplevel(root)
    _catcher.overrideredirect(True)
    _catcher.attributes("-topmost", True)
    _catcher.attributes("-alpha", 0.01)
    _catcher.geometry(f"{root.winfo_screenwidth()}x{root.winfo_screenheight()}+0+0")

    win = tk.Toplevel(root)
    win._is_menu = True
    win.overrideredirect(True)
    win.attributes("-topmost", True)
    win.attributes("-alpha", 0.97)
    win.configure(bg=_T["border"])
    win.lift(_catcher)

    outer = tk.Frame(win, bg=_T["bg"])
    outer.pack(fill="both", expand=True, padx=1, pady=1)

    _closing = [False]

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

    # ── Header ────────────────────────────────────────────────────────────────
    hdr = tk.Frame(outer, bg=_T["bg"], padx=12, pady=9)
    hdr.pack(fill="x")

    dot_widget(hdr, bg=_T["bg"]).pack(side="left", padx=(0, 7))
    if app_name:
        tk.Label(hdr, text=app_name, bg=_T["bg"], fg=_T["fg"],
                 font=("Segoe UI", 9, "bold")).pack(side="left")

    x_btn = tk.Label(hdr, text="✕", bg=_T["bg"], fg=_T["fg_muted"],
                     font=("Segoe UI", 9), cursor="hand2", padx=4)
    x_btn.pack(side="right")
    x_btn.bind("<Button-1>", lambda e: close())
    x_btn.bind("<Enter>",    lambda e: x_btn.configure(fg=_T["fg"]))
    x_btn.bind("<Leave>",    lambda e: x_btn.configure(fg=_T["fg_muted"]))

    def _open_settings(e=None):
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

    # ── Drag ──────────────────────────────────────────────────────────────────
    _drag = {"x": 0, "y": 0}

    def _drag_start(e):
        _drag["x"] = e.x_root - win.winfo_x()
        _drag["y"] = e.y_root - win.winfo_y()

    def _drag_move(e):
        win.geometry(f"+{e.x_root - _drag['x']}+{e.y_root - _drag['y']}")

    hdr.bind("<Button-1>",  _drag_start)
    hdr.bind("<B1-Motion>", _drag_move)
    x_btn.bind("<B1-Motion>",    lambda e: "break")
    gear_btn.bind("<B1-Motion>", lambda e: "break")

    tk.Frame(outer, bg=_T["border"], height=1).pack(fill="x")

    # ── Content frame (rebuilt on each state transition) ──────────────────────
    content = tk.Frame(outer, bg=_T["bg"])
    content.pack(fill="both", expand=True)

    # ── Reposition ────────────────────────────────────────────────────────────
    def _reposition():
        try:
            win.update_idletasks()
            from main import _get_monitor_rect
            ml, mt, mr, mb = _get_monitor_rect(cx, cy)
            pw = win.winfo_reqwidth()
            ph = win.winfo_reqheight()
            nx = cx + 14 if cx + 14 + pw <= mr - 10 else cx - pw - 14
            nx = max(ml + 4, nx)
            ny = max(mt + 10, min(cy - ph // 3, mb - ph - 10))
            win.geometry(f"+{nx}+{ny}")
        except Exception:
            pass

    def _clear():
        for w in content.winfo_children():
            try: w.destroy()
            except Exception: pass

    # ── STATE: result ─────────────────────────────────────────────────────────

    def _show_result(result: str, action: str, reasoning: str = ""):
        _clear()

        body = tk.Frame(content, bg=_T["bg"], padx=14, pady=12)
        body.pack(fill="both", expand=True)

        # Action + reasoning line
        if action:
            lbl_row = tk.Frame(body, bg=_T["bg"])
            lbl_row.pack(fill="x", pady=(0, 6))
            tk.Label(lbl_row,
                     text=action.replace("_", " ").title(),
                     bg=_T["bg"], fg=_T["fg"],
                     font=("Segoe UI", 9, "bold"),
                     anchor="w").pack(side="left")
            if reasoning:
                tk.Label(lbl_row,
                         text=f"  ·  {reasoning[:60]}",
                         bg=_T["bg"], fg=_T["fg_muted"],
                         font=("Segoe UI", 8, "italic"),
                         anchor="w").pack(side="left")

        # Result text widget
        n_lines = min(10, max(3, result.count("\n") + 2))
        txt = tk.Text(body,
                      bg=_T["bg_raised"], fg=_T["fg_dim"],
                      font=("Segoe UI", 9),
                      wrap="word", relief="flat", bd=0,
                      state="normal", cursor="arrow",
                      height=n_lines, width=38,
                      padx=10, pady=8)
        txt.insert("1.0", result)
        txt.configure(state="disabled")
        txt.pack(fill="x", pady=(0, 10))
        txt.bind("<MouseWheel>",
                 lambda e: txt.yview_scroll(int(-1*(e.delta/120)), "units"))

        # Footer
        tk.Frame(content, bg=_T["border"], height=1).pack(fill="x")
        foot = tk.Frame(content, bg=_T["bg"], padx=14, pady=10)
        foot.pack(fill="x")

        insert_btn = tk.Label(foot, text="↵  Insert",
                              bg=_T["accent"], fg="#1A1611",
                              font=("Segoe UI", 8, "bold"),
                              padx=14, pady=6, cursor="hand2")
        insert_btn.pack(side="left")

        retry_btn = tk.Label(foot, text="↻  Retry",
                             bg=_T["bg_raised"], fg=_T["fg_dim"],
                             font=("Segoe UI", 8),
                             padx=10, pady=6, cursor="hand2")
        retry_btn.pack(side="left", padx=(6, 0))

        tk.Label(foot, text="↵ insert  ·  tab retry  ·  esc close",
                 bg=_T["bg"], fg=_T["fg_muted"],
                 font=("Segoe UI", 7)).pack(side="right")

        def _do_insert(e=None):
            from plat.executor import verified_insert
            from brain import rollback as _rb
            _before = _rb.save_state("insert")
            try:
                res = verified_insert(result, target_hwnd=target_hwnd)
            except Exception as _e:
                _rb.restore_state(_before)
                return
            if not res.success:
                _rb.restore_state(_before)
                return
            try:
                from storage import append_audit_entry, record_action_used
                from brain.action_schema import classify_risk
                append_audit_entry({
                    "app":            app_name or "",
                    "action":         action,
                    "risk_level":     classify_risk(action),
                    "approval":       "user_approved",
                    "result_preview": result[:120].replace("\n", " "),
                })
                record_action_used(context_type or "generic", action)
            except Exception:
                pass
            close()

        def _do_retry(e=None):
            if _raw_hash and _raw_hash in state.proactive_cache:
                del state.proactive_cache[_raw_hash]
            _show_input()
            win.after(0, _reposition)

        insert_btn.bind("<Button-1>", _do_insert)
        retry_btn.bind( "<Button-1>", _do_retry)
        insert_btn.bind("<Enter>", lambda e: insert_btn.configure(bg=_T["pill_active"]))
        insert_btn.bind("<Leave>", lambda e: insert_btn.configure(bg=_T["accent"]))
        retry_btn.bind( "<Enter>", lambda e: retry_btn.configure(bg=_T["pill"],     fg=_T["fg"]))
        retry_btn.bind( "<Leave>", lambda e: retry_btn.configure(bg=_T["bg_raised"], fg=_T["fg_dim"]))

        win.bind("<Return>", _do_insert)
        win.bind("<Tab>",    lambda e: (_do_retry(), "break"))

        win.after(0, _reposition)
        insert_btn.focus_set()

    # ── STATE: loading ────────────────────────────────────────────────────────

    def _show_loading(label: str = "thinking…"):
        _clear()
        f = tk.Frame(content, bg=_T["bg"], padx=14, pady=20)
        f.pack(fill="x")
        dot_widget(f, bg=_T["bg"]).pack(side="left", padx=(0, 10))
        tk.Label(f, text=label, bg=_T["bg"], fg=_T["fg_muted"],
                 font=("Segoe UI", 9, "italic")).pack(side="left")
        win.after(0, _reposition)

    # ── STATE: streaming ──────────────────────────────────────────────────────

    def _show_streaming(action: str):
        _clear()
        body = tk.Frame(content, bg=_T["bg"], padx=14, pady=12)
        body.pack(fill="both", expand=True)

        if action:
            tk.Label(body,
                     text=action.replace("_", " ").title(),
                     bg=_T["bg"], fg=_T["fg"],
                     font=("Segoe UI", 9, "bold"),
                     anchor="w").pack(anchor="w", pady=(0, 6))

        txt = tk.Text(body,
                      bg=_T["bg_raised"], fg=_T["fg_dim"],
                      font=("Segoe UI", 9),
                      wrap="word", relief="flat", bd=0,
                      state="normal", cursor="arrow",
                      height=6, width=38,
                      padx=10, pady=8)
        txt.pack(fill="x")
        txt.bind("<MouseWheel>",
                 lambda e: txt.yview_scroll(int(-1*(e.delta/120)), "units"))

        _buf = [""]

        def _on_token(tok):
            def _upd():
                _buf[0] += tok
                txt.configure(state="normal")
                txt.insert("end", tok)
                txt.configure(state="disabled")
                txt.see("end")
            win.after(0, _upd)

        def _on_done():
            win.after(0, lambda: _show_result(_buf[0], action))

        def _on_error():
            win.after(0, _show_input)

        win.after(0, _reposition)
        return _on_token, _on_done, _on_error

    # ── STATE: input ──────────────────────────────────────────────────────────

    def _show_input():
        _clear()

        inp_wrap   = tk.Frame(content, bg=_T["bg"], padx=10, pady=10)
        inp_wrap.pack(fill="x")
        inp_border = tk.Frame(inp_wrap, bg=_T["border"], padx=1, pady=1)
        inp_border.pack(fill="x")
        inp_inner  = tk.Frame(inp_border, bg=_T["bg_input"], padx=10, pady=8)
        inp_inner.pack(fill="x")

        entry = tk.Entry(inp_inner,
                         bg=_T["bg_input"], fg=_T["fg_ghost"],
                         insertbackground=_T["fg"],
                         relief="flat", bd=0,
                         font=("Segoe UI", 10))
        entry.pack(side="left", fill="x", expand=True)
        entry.insert(0, _ASK_PH)

        submit_lbl = tk.Label(inp_inner, text="↑",
                              bg=PAW_COLOR, fg="#1A1611",
                              font=("Segoe UI", 9, "bold"),
                              padx=6, pady=2, cursor="hand2")
        submit_lbl.pack(side="right", padx=(6, 0))

        def _focus_in(e):
            inp_border.configure(bg=_T["border_focus"])
            if entry.get() == _ASK_PH:
                entry.delete(0, "end")
                entry.configure(fg=_T["fg"])

        def _focus_out(e):
            inp_border.configure(bg=_T["border"])
            if not entry.get().strip():
                entry.delete(0, "end")
                entry.insert(0, _ASK_PH)
                entry.configure(fg=_T["fg_ghost"])

        entry.bind("<FocusIn>",  _focus_in)
        entry.bind("<FocusOut>", _focus_out)

        def _submit(e=None):
            q = entry.get().strip()
            if not q or q == _ASK_PH:
                return
            _run_query(q)

        submit_lbl.bind("<Button-1>", _submit)
        entry.bind("<Return>", _submit)

        # Context-aware suggestion pills
        _raw_actions = CONTEXT_ACTIONS.get(context_type,
                       CONTEXT_ACTIONS.get(context, CONTEXT_ACTIONS["generic"]))
        try:
            from storage import load_action_rankings
            _ranks = load_action_rankings().get(context_type, {})
            if _ranks:
                _raw_actions = sorted(_raw_actions, key=lambda la: -_ranks.get(la[1], 0))
        except Exception:
            pass
        sugg = [(lbl, k) for lbl, k in _raw_actions if k != "annotate"][:3]

        if sugg:
            tk.Frame(content, bg=_T["border"], height=1).pack(fill="x")
            pill_row = tk.Frame(content, bg=_T["bg"], padx=10, pady=8)
            pill_row.pack(fill="x")
            for lbl, k in sugg:
                p = tk.Label(pill_row, text=lbl,
                             bg=_T["pill"], fg=_T["pill_fg"],
                             font=("Segoe UI", 8),
                             padx=10, pady=4, cursor="hand2")
                p.pack(side="left", padx=(0, 4))
                p.bind("<Enter>",    lambda e, w=p: w.configure(bg=_T["pill_active"], fg=_T["pill_active_fg"]))
                p.bind("<Leave>",    lambda e, w=p: w.configure(bg=_T["pill"],        fg=_T["pill_fg"]))
                p.bind("<Button-1>", lambda e, ak=k: _run_action(ak))

        win.bind("<Return>", lambda e: None)
        win.bind("<Tab>",    lambda e: None)

        win.after(50, entry.focus_set)
        win.after(0, _reposition)

    # ── Query runner ──────────────────────────────────────────────────────────

    def _run_query(q: str):
        _show_loading("thinking…")
        full_text = (ctx.raw_text[:2000] if ctx and ctx.raw_text else "")

        def _start():
            from ai import call_ai_streaming
            try:
                on_tok, on_done, on_err = _show_streaming("custom")
                call_ai_streaming(
                    full_text, "custom", "direct",
                    on_tok, on_done, on_err,
                    custom_instruction=q,
                    bundle=bundle,
                )
            except Exception as e:
                log(f"[MENU] query failed: {e}")
                win.after(0, _show_input)

        threading.Thread(target=_start, daemon=True).start()

    def _run_action(action_key: str):
        if action_key == "_fill_form":
            import pyautogui as _pg
            mx, my = _pg.position()
            close()
            try:
                from plat import platform as _gp
                window = _gp().get_active_window()
                if window:
                    from ui.form_controller import start_form_fill
                    start_form_fill(root, window, mx, my)
            except Exception:
                pass
            return

        # Use cached result if available for this action
        if _cached_action == action_key and _cached_result:
            _show_result(_cached_result, action_key, _cached_reasoning)
            return

        _show_loading(f"{action_key.replace('_', ' ')}…")
        full_text = (ctx.raw_text[:2000] if ctx and ctx.raw_text else "")

        def _start():
            from ai import call_ai_streaming
            try:
                on_tok, on_done, on_err = _show_streaming(action_key)
                call_ai_streaming(
                    full_text, action_key, "direct",
                    on_tok, on_done, on_err,
                    bundle=bundle,
                )
            except Exception as e:
                log(f"[MENU] action failed: {e}")
                win.after(0, _show_input)

        threading.Thread(target=_start, daemon=True).start()

    # ── Initial render ────────────────────────────────────────────────────────

    if _cached_result:
        _show_result(_cached_result, _cached_action, _cached_reasoning)
    else:
        _show_input()

    win.bind("<Escape>", lambda e: close())
    outer.bind("<Button-1>",  _drag_start)
    outer.bind("<B1-Motion>", _drag_move)

    _reposition()
