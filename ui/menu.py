"""
ui/menu.py — Alt+A panel.

Horizontal layout: journal column (left) + conversation column (right).

  ┌──────────────────────────────────────────────────────────────────┐
  │ 🔥  VS Code · code_snippet                                  [✕] │
  ├────────────────────────┬─────────────────────────────────────────┤
  │  14:22 · Gmail    ●    │  You: what do you see?                  │
  │  Email from John       │  App: VS Code · Python · process_queue │
  │                        │                                         │
  │  14:31 · VS Code  ▶    │  You: summarise                        │
  │  Editing               │  process_queue iterates…  [↵ Insert]   │
  │  process_queue()       │                                         │
  │                        │  ─────────────────────────────          │
  │  ↓ live                │  ask me anything…               [↑]    │
  └────────────────────────┴─────────────────────────────────────────┘

Keyboard: Enter = send/insert · Tab = retry · Esc = close
"""

import os
import time
import threading
import tkinter as tk
import tkinter.ttk as ttk

import state
from context import CONTEXT_ACTIONS
from storage import get_pref
from log import log
from ui.icons import PAW_COLOR, dot_widget
from brain.context_bundle import ContextBundle


# ── Theme ──────────────────────────────────────────────────────────────────────

_T = {
    "bg":             "#1A1611",
    "bg_raised":      "#211E18",
    "bg_input":       "#16130F",
    "journal_bg":     "#161310",
    "border":         "#38332A",
    "border_focus":   PAW_COLOR,
    "fg":             "#F0EAE0",
    "fg_dim":         "#C8BEB0",
    "fg_muted":       "#5A504A",
    "fg_ghost":       "#3A3028",
    "accent":         PAW_COLOR,
    "pill":           "#2A2620",
    "pill_fg":        "#C8BEB0",
    "pill_active":    PAW_COLOR,
    "pill_active_fg": "#1A1611",
    "user_bubble":    "#211E18",
    "ai_bubble":      "#1A1611",
}

_ASK_PH       = "ask me anything…"
_CONV_MAX     = 10     # max conversation turns kept in state
_JOURNAL_W    = 200    # journal column width px
_CONV_W       = 420    # conversation column width px

_TEXT_EXTS = {
    ".txt", ".md", ".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".css",
    ".json", ".yaml", ".yml", ".csv", ".xml", ".sql", ".sh", ".bat",
}
_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}

# ── Observe-intent detection ──────────────────────────────────────────────────

_OBSERVE_PHRASES = (
    "what do you see", "what can you see", "what are you seeing",
    "what do you observe", "what are you observing",
    "what's on screen", "what is on screen",
    "what's visible", "what is visible", "describe what you see",
    "what's open", "what am i looking at",
)

_HISTORY_PHRASES = (
    "what did you do", "what have you done", "what did i do",
    "what was last", "show history", "what happened",
    "recent activity", "what actions", "show journal",
)

_SCHEDULE_PHRASES = (
    "what's scheduled", "what is scheduled", "upcoming tasks",
    "what's next", "any reminders", "scheduled tasks",
)


def _read_attached_file(path: str) -> tuple[str, str, bool]:
    ext  = os.path.splitext(path)[1].lower()
    name = os.path.basename(path)
    if ext in _IMAGE_EXTS:
        return "", name, True
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read(50_000), name, False
    except Exception:
        return "", name, False


# ── Detecting animation ────────────────────────────────────────────────────────

def show_detecting(root: tk.Tk, cx: int, cy: int, callback):
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
    win.geometry(f"+{min(cx+12, sw-w-10)}+{max(10, min(cy-h//2, sh-h-10))}")
    win.after(180, lambda: (win.destroy(), callback()))


# ── Main panel ─────────────────────────────────────────────────────────────────

def show_menu(root: tk.Tk, cx: int, cy: int,
              app_name: str = "",
              context:  str = "generic",
              target_hwnd=None,
              on_settings=None,
              on_close=None):

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

    # ── Proactive cache ───────────────────────────────────────────────────────
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
    hdr = tk.Frame(outer, bg=_T["bg"], padx=12, pady=8)
    hdr.pack(fill="x")

    dot_widget(hdr, bg=_T["bg"]).pack(side="left", padx=(0, 7))
    if app_name:
        tk.Label(hdr, text=app_name, bg=_T["bg"], fg=_T["fg"],
                 font=("Segoe UI", 9, "bold")).pack(side="left")
    ct = context_type.replace("_", " ") if context_type and context_type != "generic" else ""
    if ct:
        tk.Label(hdr, text=f" · {ct}", bg=_T["bg"], fg=_T["fg_muted"],
                 font=("Segoe UI", 8)).pack(side="left")

    x_btn = tk.Label(hdr, text="✕", bg=_T["bg"], fg=_T["fg_muted"],
                     font=("Segoe UI", 9), cursor="hand2", padx=4)
    x_btn.pack(side="right")
    x_btn.bind("<Button-1>", lambda e: close())
    x_btn.bind("<Enter>",    lambda e: x_btn.configure(fg=_T["fg"]))
    x_btn.bind("<Leave>",    lambda e: x_btn.configure(fg=_T["fg_muted"]))

    def _open_settings(e=None):
        # Close panel first so the catcher doesn't intercept dashboard clicks.
        # Use root.after (not win.after) — win is destroyed by close().
        fn = on_settings or (lambda: (
            __import__("ui.dashboard", fromlist=["show_dashboard"])
            .show_dashboard(root)
        ))
        close()
        try:
            root.after(80, fn)
        except Exception:
            try: fn()
            except Exception: pass

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
        win.geometry(f"+{e.x_root-_drag['x']}+{e.y_root-_drag['y']}")

    hdr.bind("<Button-1>",   _drag_start)
    hdr.bind("<B1-Motion>",  _drag_move)
    x_btn.bind("<B1-Motion>",    lambda e: "break")
    gear_btn.bind("<B1-Motion>", lambda e: "break")

    tk.Frame(outer, bg=_T["border"], height=1).pack(fill="x")

    # ── Body: two-column horizontal layout ────────────────────────────────────
    body = tk.Frame(outer, bg=_T["bg"])
    body.pack(fill="both", expand=True)

    # ── LEFT: Journal column ──────────────────────────────────────────────────
    j_col = tk.Frame(body, bg=_T["journal_bg"], width=_JOURNAL_W)
    j_col.pack(side="left", fill="y")
    j_col.pack_propagate(False)

    tk.Frame(body, bg=_T["border"], width=1).pack(side="left", fill="y")

    # Journal header
    j_hdr = tk.Frame(j_col, bg=_T["journal_bg"], padx=10, pady=6)
    j_hdr.pack(fill="x")
    tk.Label(j_hdr, text="JOURNAL", bg=_T["journal_bg"], fg=_T["fg_muted"],
             font=("Segoe UI", 7, "bold")).pack(side="left")

    # Journal scroll area
    j_canvas = tk.Canvas(j_col, bg=_T["journal_bg"], highlightthickness=0,
                         width=_JOURNAL_W)
    j_sb = ttk.Scrollbar(j_col, orient="vertical", command=j_canvas.yview)
    j_canvas.configure(yscrollcommand=j_sb.set)
    j_frame = tk.Frame(j_canvas, bg=_T["journal_bg"])
    j_wid   = j_canvas.create_window((0, 0), window=j_frame, anchor="nw")

    j_frame.bind("<Configure>",
                 lambda e: j_canvas.configure(scrollregion=j_canvas.bbox("all")))
    j_canvas.bind("<Configure>",
                  lambda e: j_canvas.itemconfig(j_wid, width=e.width))
    j_canvas.bind("<MouseWheel>",
                  lambda e: j_canvas.yview_scroll(int(-1*(e.delta/120)), "units"))

    j_sb.pack(side="right", fill="y")
    j_canvas.pack(side="left", fill="both", expand=True)

    def _build_journal():
        for w in j_frame.winfo_children():
            try: w.destroy()
            except Exception: pass

        try:
            from journal import get_today
            entries = get_today()
        except Exception:
            entries = []

        if not entries:
            tk.Label(j_frame, text="No entries yet",
                     bg=_T["journal_bg"], fg=_T["fg_muted"],
                     font=("Segoe UI", 7, "italic"),
                     wraplength=_JOURNAL_W-20,
                     padx=10, pady=8).pack(anchor="w")
            return

        last_session = ""
        for e in entries:
            sid = e.get("session_id", "")
            if sid != last_session:
                last_session = sid
                tk.Frame(j_frame, bg=_T["border"], height=1).pack(fill="x",
                          padx=8, pady=(6, 2))

            row = tk.Frame(j_frame, bg=_T["journal_bg"], padx=10, pady=3)
            row.pack(fill="x")

            # Time + indicator
            t_row = tk.Frame(row, bg=_T["journal_bg"])
            t_row.pack(fill="x")
            tk.Label(t_row, text=e.get("time", ""),
                     bg=_T["journal_bg"], fg=_T["fg_muted"],
                     font=("Segoe UI", 7)).pack(side="left")

            indicator = "▶" if e.get("action") else "●"
            ind_color  = _T["accent"] if e.get("action") else _T["fg_muted"]
            tk.Label(t_row, text=indicator,
                     bg=_T["journal_bg"], fg=ind_color,
                     font=("Segoe UI", 7)).pack(side="right")

            # App
            tk.Label(row, text=e.get("app", ""),
                     bg=_T["journal_bg"], fg=_T["fg_dim"],
                     font=("Segoe UI", 8, "bold"),
                     anchor="w").pack(anchor="w")

            # Summary
            summary = e.get("summary", "")
            if summary:
                tk.Label(row, text=summary[:40] + ("…" if len(summary) > 40 else ""),
                         bg=_T["journal_bg"], fg=_T["fg_muted"],
                         font=("Segoe UI", 7),
                         anchor="w", wraplength=_JOURNAL_W-24,
                         justify="left").pack(anchor="w")

            # Action taken
            if e.get("action"):
                tk.Label(row,
                         text=f"↳ {e['action'].replace('_', ' ')}",
                         bg=_T["journal_bg"], fg=_T["accent"],
                         font=("Segoe UI", 7)).pack(anchor="w")

        # "↓ live" jump button
        tk.Frame(j_frame, bg=_T["border"], height=1).pack(fill="x", padx=8, pady=(6,2))
        live_btn = tk.Label(j_frame, text="↓ live",
                            bg=_T["journal_bg"], fg=_T["accent"],
                            font=("Segoe UI", 7, "bold"),
                            cursor="hand2", padx=10, pady=4)
        live_btn.pack(anchor="w")
        live_btn.bind("<Button-1>",
                      lambda e: j_canvas.yview_moveto(1.0))

        # Auto-scroll to bottom (latest entry)
        j_canvas.after(50, lambda: j_canvas.yview_moveto(1.0))

    _build_journal()

    # Poll journal every 5s to auto-update while panel is open
    def _poll_journal():
        try:
            if not _closing[0] and win.winfo_exists():
                _build_journal()
                win.after(5000, _poll_journal)
        except Exception:
            pass

    win.after(5000, _poll_journal)

    # ── RIGHT: Conversation column ────────────────────────────────────────────
    c_col = tk.Frame(body, bg=_T["bg"], width=_CONV_W)
    c_col.pack(side="left", fill="both", expand=True)

    # Conversation scroll area
    conv_outer  = tk.Frame(c_col, bg=_T["bg"])
    conv_outer.pack(fill="both", expand=True)

    conv_canvas = tk.Canvas(conv_outer, bg=_T["bg"], highlightthickness=0)
    conv_sb     = ttk.Scrollbar(conv_outer, orient="vertical",
                                command=conv_canvas.yview)
    conv_canvas.configure(yscrollcommand=conv_sb.set)
    conv_frame  = tk.Frame(conv_canvas, bg=_T["bg"])
    conv_wid    = conv_canvas.create_window((0, 0), window=conv_frame, anchor="nw")

    conv_frame.bind("<Configure>",
                    lambda e: conv_canvas.configure(
                        scrollregion=conv_canvas.bbox("all")))
    conv_canvas.bind("<Configure>",
                     lambda e: conv_canvas.itemconfig(conv_wid, width=e.width))
    conv_canvas.bind("<MouseWheel>",
                     lambda e: conv_canvas.yview_scroll(
                         int(-1*(e.delta/120)), "units"))

    conv_sb.pack(side="right", fill="y")
    conv_canvas.pack(side="left", fill="both", expand=True)

    def _scroll_conv_bottom():
        try:
            conv_canvas.update_idletasks()
            conv_canvas.yview_moveto(1.0)
        except Exception:
            pass

    # Render existing conversation history
    def _render_history():
        for h in state.conversation_history[-_CONV_MAX:]:
            _add_bubble(h["role"], h["content"], h.get("action", ""))

    # ── Bubble renderer ───────────────────────────────────────────────────────

    _last_insert_result = [None]

    def _add_bubble(role: str, content: str, action: str = ""):
        is_user = role == "user"
        bubble_bg = _T["user_bubble"] if is_user else _T["ai_bubble"]
        align     = "e" if is_user else "w"

        row = tk.Frame(conv_frame, bg=_T["bg"], padx=10, pady=3)
        row.pack(fill="x")

        prefix = "You" if is_user else "App"
        tk.Label(row, text=prefix,
                 bg=_T["bg"], fg=_T["accent"] if is_user else _T["fg_muted"],
                 font=("Segoe UI", 7, "bold"), anchor=align).pack(fill="x")

        txt = tk.Text(row,
                      bg=bubble_bg, fg=_T["fg_dim"] if not is_user else _T["fg"],
                      font=("Segoe UI", 9),
                      wrap="word", relief="flat", bd=0,
                      state="normal", cursor="arrow",
                      height=1, width=42,
                      padx=8, pady=5)
        txt.insert("1.0", content)
        txt.configure(state="disabled")
        # Auto-height
        lines = content.count("\n") + max(1, len(content) // 42) + 1
        txt.configure(height=min(10, lines))
        txt.pack(fill="x")
        txt.bind("<MouseWheel>",
                 lambda e: conv_canvas.yview_scroll(int(-1*(e.delta/120)), "units"))

        # Insert button for AI result bubbles
        if not is_user and content and len(content) > 10:
            btn_row = tk.Frame(row, bg=_T["bg"])
            btn_row.pack(anchor="w", pady=(2, 0))
            ins_btn = tk.Label(btn_row, text="↵ Insert",
                               bg=_T["accent"], fg="#1A1611",
                               font=("Segoe UI", 7, "bold"),
                               padx=8, pady=3, cursor="hand2")
            ins_btn.pack(side="left")
            ins_btn.bind("<Button-1>",
                         lambda e, c=content: _do_insert(c))
            ins_btn.bind("<Enter>",
                         lambda e, b=ins_btn: b.configure(bg=_T["pill_active"]))
            ins_btn.bind("<Leave>",
                         lambda e, b=ins_btn: b.configure(bg=_T["accent"]))

            if action:
                tk.Label(btn_row,
                         text=f"  {action.replace('_', ' ')}",
                         bg=_T["bg"], fg=_T["fg_muted"],
                         font=("Segoe UI", 7, "italic")).pack(side="left")

        win.after(50, _scroll_conv_bottom)
        return txt

    # Streaming text widget (updated live, replaced by bubble on done)
    _stream_txt = [None]

    def _start_stream_bubble(action: str = ""):
        row = tk.Frame(conv_frame, bg=_T["bg"], padx=10, pady=3)
        row.pack(fill="x")
        tk.Label(row, text="App",
                 bg=_T["bg"], fg=_T["fg_muted"],
                 font=("Segoe UI", 7, "bold"), anchor="w").pack(fill="x")
        txt = tk.Text(row,
                      bg=_T["ai_bubble"], fg=_T["fg_dim"],
                      font=("Segoe UI", 9),
                      wrap="word", relief="flat", bd=0,
                      state="normal", cursor="arrow",
                      height=1, width=42,
                      padx=8, pady=5)
        txt.pack(fill="x")
        txt.bind("<MouseWheel>",
                 lambda e: conv_canvas.yview_scroll(int(-1*(e.delta/120)), "units"))
        _stream_txt[0] = txt
        return txt

    def _finish_stream_bubble(full_text: str, action: str = ""):
        _stream_txt[0] = None
        # Remove the streaming widget and re-render as a proper bubble
        try:
            # Find and destroy the last row (the stream row)
            children = conv_frame.winfo_children()
            if children:
                children[-1].destroy()
        except Exception:
            pass
        _add_bubble("assistant", full_text, action)
        _save_conv("assistant", full_text, action)

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

    # ── Conversation history persistence ──────────────────────────────────────
    def _save_conv(role: str, content: str, action: str = ""):
        state.conversation_history.append({
            "role":    role,
            "content": content,
            "action":  action,
            "ts":      time.time(),
        })
        # Keep last N turns
        if len(state.conversation_history) > _CONV_MAX * 2:
            state.conversation_history[:] = state.conversation_history[-_CONV_MAX * 2:]

    # ── Insert action ─────────────────────────────────────────────────────────
    def _do_insert(content: str):
        from plat.executor import verified_insert
        from brain import rollback as _rb
        _before = _rb.save_state("insert")
        try:
            res = verified_insert(content, target_hwnd=target_hwnd)
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
                "action":         "insert",
                "risk_level":     "safe",
                "approval":       "user_approved",
                "result_preview": content[:120].replace("\n", " "),
            })
            record_action_used(context_type or "generic", "insert")
        except Exception:
            pass
        # Show inline confirmation, don't close
        conf = tk.Label(conv_frame, text="✓ Inserted",
                        bg=_T["bg"], fg=_T["accent"],
                        font=("Segoe UI", 8, "italic"), padx=10, pady=2)
        conf.pack(anchor="w")
        win.after(2000, lambda: (conf.destroy() if conf.winfo_exists() else None))
        _scroll_conv_bottom()

    # ── Observe shortcut ──────────────────────────────────────────────────────
    def _build_observe_reply() -> str:
        if not ctx:
            return "Nothing captured yet — waiting for a window to focus."
        parts = []
        if app_name:
            parts.append(f"App: {app_name}")
        ct_label = (bundle.context_type or "").replace("_", " ")
        if ct_label and ct_label != "generic":
            parts.append(f"Content: {ct_label}")
        if bundle.situation:
            parts.append(f"Situation: {bundle.situation}")
        if bundle.entities:
            parts.append(f"Entities: {', '.join(str(e) for e in bundle.entities[:5])}")
        if ctx.raw_text:
            preview = ctx.raw_text[:200].replace("\n", " ").strip()
            parts.append(f"Visible: {preview}{'…' if len(ctx.raw_text) > 200 else ''}")
        return "\n".join(parts) if parts else "Window detected but no text extracted."

    def _build_history_reply() -> str:
        try:
            from journal import get_today
            entries = get_today()[-8:]
        except Exception:
            entries = []
        if not entries:
            return "No activity recorded in this session yet."
        lines = []
        for e in entries:
            line = f"{e['time']} · {e['app']}"
            if e.get("summary"):
                line += f" — {e['summary'][:50]}"
            if e.get("action"):
                line += f" [{e['action']}]"
            lines.append(line)
        return "\n".join(lines)

    def _build_schedule_reply() -> str:
        try:
            from storage import load_scheduled_tasks
            tasks = [t for t in load_scheduled_tasks() if t.get("enabled")]
        except Exception:
            tasks = []
        if not tasks:
            return "No scheduled tasks enabled."
        lines = [f"{t.get('time', '?')} · {t.get('label', t.get('id', '?'))}"
                 for t in tasks]
        return "\n".join(lines)

    # ── Query dispatcher ──────────────────────────────────────────────────────
    def _dispatch(q: str):
        q_low = q.lower().strip()

        # 1. Observe shortcut
        if any(q_low.startswith(p) or p in q_low for p in _OBSERVE_PHRASES):
            reply = _build_observe_reply()
            _add_bubble("assistant", reply, "observe")
            _save_conv("assistant", reply, "observe")
            return

        # 2. History shortcut
        if any(p in q_low for p in _HISTORY_PHRASES):
            reply = _build_history_reply()
            _add_bubble("assistant", reply, "history")
            _save_conv("assistant", reply, "history")
            return

        # 3. Schedule shortcut
        if any(p in q_low for p in _SCHEDULE_PHRASES):
            reply = _build_schedule_reply()
            _add_bubble("assistant", reply, "schedule")
            _save_conv("assistant", reply, "schedule")
            return

        # 4. Cached proactive result
        if _cached_result and (not q_low or q_low in (
                _cached_action, _cached_action.replace("_", " "))):
            _add_bubble("assistant", _cached_result, _cached_action)
            _save_conv("assistant", _cached_result, _cached_action)
            return

        # 5. AI query — stream into conversation
        _stream_with_context(q)

    def _stream_with_context(q: str):
        txt = _start_stream_bubble("custom")
        _buf = [""]

        def _on_token(tok):
            def _upd():
                _buf[0] += tok
                txt.configure(state="normal")
                txt.insert("end", tok)
                # Auto-grow height
                lines = _buf[0].count("\n") + max(1, len(_buf[0]) // 42) + 1
                txt.configure(height=min(10, lines), state="disabled")
                _scroll_conv_bottom()
            win.after(0, _upd)

        def _on_done():
            win.after(0, lambda: _finish_stream_bubble(_buf[0], "custom"))

        def _on_error():
            win.after(0, lambda: _add_bubble(
                "assistant", "Sorry — couldn't reach the AI.", "error"))

        full_text = (ctx.raw_text[:2000] if ctx and ctx.raw_text else "")

        # Build conversation context for AI
        try:
            from journal import context_for_ai
            j_ctx = context_for_ai(5)
        except Exception:
            j_ctx = ""

        recent_conv = state.conversation_history[-6:]
        conv_ctx = "\n".join(
            f"{'User' if h['role']=='user' else 'Assistant'}: {h['content'][:200]}"
            for h in recent_conv
        )

        system_extra = ""
        if j_ctx:
            system_extra += f"\n\n{j_ctx}"
        if conv_ctx:
            system_extra += f"\n\nRecent conversation:\n{conv_ctx}"

        def _start():
            from ai import call_ai_streaming
            try:
                call_ai_streaming(
                    full_text, "custom", "direct",
                    _on_token, _on_done, _on_error,
                    custom_instruction=q + system_extra,
                    bundle=bundle,
                )
            except Exception as e:
                log(f"[MENU] stream failed: {e}")
                win.after(0, _on_error)

        threading.Thread(target=_start, daemon=True).start()

    # ── Action runner (pill clicks) ────────────────────────────────────────────
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

        if _cached_action == action_key and _cached_result:
            _add_bubble("assistant", _cached_result, action_key)
            _save_conv("assistant", _cached_result, action_key)
            return

        txt = _start_stream_bubble(action_key)
        _buf = [""]

        def _on_token(tok):
            def _upd():
                _buf[0] += tok
                txt.configure(state="normal")
                txt.insert("end", tok)
                lines = _buf[0].count("\n") + max(1, len(_buf[0]) // 42) + 1
                txt.configure(height=min(10, lines), state="disabled")
                _scroll_conv_bottom()
            win.after(0, _upd)

        def _on_done():
            win.after(0, lambda: _finish_stream_bubble(_buf[0], action_key))

        def _on_error():
            win.after(0, lambda: _add_bubble(
                "assistant", "AI unavailable.", "error"))

        full_text = (ctx.raw_text[:2000] if ctx and ctx.raw_text else "")

        def _start():
            from ai import call_ai_streaming
            try:
                call_ai_streaming(full_text, action_key, "direct",
                                  _on_token, _on_done, _on_error, bundle=bundle)
            except Exception as e:
                log(f"[MENU] action failed: {e}")
                win.after(0, _on_error)

        threading.Thread(target=_start, daemon=True).start()

    # ── Input row ─────────────────────────────────────────────────────────────
    tk.Frame(c_col, bg=_T["border"], height=1).pack(fill="x")
    inp_wrap   = tk.Frame(c_col, bg=_T["bg"], padx=8, pady=8)
    inp_wrap.pack(fill="x")
    inp_border = tk.Frame(inp_wrap, bg=_T["border"], padx=1, pady=1)
    inp_border.pack(fill="x")
    inp_inner  = tk.Frame(inp_border, bg=_T["bg_input"], padx=10, pady=7)
    inp_inner.pack(fill="x")

    entry = tk.Entry(inp_inner,
                     bg=_T["bg_input"], fg=_T["fg_ghost"],
                     insertbackground=_T["fg"],
                     relief="flat", bd=0,
                     font=("Segoe UI", 10))
    entry.pack(side="left", fill="x", expand=True)
    entry.insert(0, _ASK_PH)

    send_btn = tk.Label(inp_inner, text="↑",
                        bg=PAW_COLOR, fg="#1A1611",
                        font=("Segoe UI", 9, "bold"),
                        padx=6, pady=2, cursor="hand2")
    send_btn.pack(side="right", padx=(6, 0))

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
        entry.delete(0, "end")
        entry.insert(0, _ASK_PH)
        entry.configure(fg=_T["fg_ghost"])
        inp_border.configure(bg=_T["border"])
        _add_bubble("user", q)
        _save_conv("user", q)
        _dispatch(q)

    send_btn.bind("<Button-1>", _submit)
    entry.bind("<Return>", _submit)

    # ── Suggestion pills ──────────────────────────────────────────────────────
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
        pill_row = tk.Frame(c_col, bg=_T["bg"], padx=8, pady=(0, 6))
        pill_row.pack(fill="x")
        for lbl, k in sugg:
            p = tk.Label(pill_row, text=lbl,
                         bg=_T["pill"], fg=_T["pill_fg"],
                         font=("Segoe UI", 8), padx=8, pady=3, cursor="hand2")
            p.pack(side="left", padx=(0, 4))
            p.bind("<Enter>",    lambda e, w=p: w.configure(bg=_T["pill_active"], fg=_T["pill_active_fg"]))
            p.bind("<Leave>",    lambda e, w=p: w.configure(bg=_T["pill"],        fg=_T["pill_fg"]))
            p.bind("<Button-1>", lambda e, ak=k: _run_action(ak))

    # If a cached recommendation exists, show it immediately as a bubble
    if _cached_result:
        _add_bubble("assistant", _cached_result, _cached_action)

    # Render conversation history
    _render_history()

    win.bind("<Escape>", lambda e: close())
    hdr.bind("<Button-1>",  _drag_start)
    hdr.bind("<B1-Motion>", _drag_move)

    # Set a fixed height for the panel
    win.after(0, _reposition)
    win.after(80, entry.focus_set)
