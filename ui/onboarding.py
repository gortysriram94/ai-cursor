"""
ui/onboarding.py — First-launch welcome screen.

Shows model download progress before the app is usable.
Skip button enables lite mode (bundled 0.5b) with a persistent warning banner.
Handles download failures with a Retry button.
Auto-closes when the first capable model finishes downloading.
"""

import threading
import tkinter as tk

from log import log
import state

BG      = "#1A1611"
PANEL   = "#211E18"
BORDER  = "#38332A"
FG      = "#F0EAE0"
DIM     = "#C8BEB0"
MUTED   = "#7A6E60"
ACCENT  = "#DA7756"
SUCCESS = "#4a8c5c"
DANGER  = "#E05C5C"


def show_onboarding(root: tk.Tk, on_done) -> None:
    """
    Show the first-launch onboarding window.
    Calls on_done(skipped=False) when the first model is ready,
    or on_done(skipped=True) when the user skips to lite mode.
    """
    from models import MODELS

    # First capable (non-bundled) model — smallest downloads first
    queue = sorted(
        [m for m in MODELS if not m.get("bundled") and m.get("category") == "main"],
        key=lambda m: m.get("size_gb", 0),
    )
    target   = queue[0] if queue else None
    target_id   = target["id"]   if target else None
    target_name = target.get("name", target_id) if target else "AI model"

    _finished = [False]

    def _finish(skipped: bool = False):
        if _finished[0]:
            return
        _finished[0] = True
        try:
            win.destroy()
        except Exception:
            pass
        on_done(skipped=skipped)

    # ── Window ─────────────────────────────────────────────────────────────
    win = tk.Toplevel(root)
    win.title("AI Cursor — Welcome")
    win.resizable(False, False)
    win.configure(bg=BG)
    win.attributes("-topmost", True)
    win.protocol("WM_DELETE_WINDOW", lambda: _on_skip())

    outer = tk.Frame(win, bg=BG, padx=44, pady=36)
    outer.pack()

    # Title
    tk.Label(outer, text="✦  AI Cursor",
             bg=BG, fg=ACCENT,
             font=("Segoe UI", 22, "bold")).pack()
    tk.Label(outer, text="Your AI layer for every app",
             bg=BG, fg=DIM,
             font=("Segoe UI", 10)).pack(pady=(4, 24))

    # Progress card
    card = tk.Frame(outer, bg=PANEL, padx=20, pady=16)
    card.pack(fill="x")

    status_lbl = tk.Label(card,
                          text="Downloading your AI engine…",
                          bg=PANEL, fg=FG,
                          font=("Segoe UI", 9, "bold"))
    status_lbl.pack(anchor="w")

    model_lbl = tk.Label(card,
                         text=target_name or "Preparing…",
                         bg=PANEL, fg=MUTED,
                         font=("Segoe UI", 8))
    model_lbl.pack(anchor="w", pady=(2, 8))

    bar_bg   = tk.Frame(card, bg=BORDER, height=6)
    bar_bg.pack(fill="x", pady=(0, 6))
    bar_fill = tk.Frame(bar_bg, bg=ACCENT, height=6)
    bar_fill.place(x=0, y=0, width=0, height=6)

    detail_lbl = tk.Label(card,
                          text="Starting download…",
                          bg=PANEL, fg=MUTED,
                          font=("Segoe UI", 8))
    detail_lbl.pack(anchor="w")

    # Privacy note
    tk.Frame(outer, bg=BORDER, height=1).pack(fill="x", pady=(20, 12))
    tk.Label(outer,
             text="Runs entirely on your computer.\nNo cloud, no API keys, no data leaves your device.",
             bg=BG, fg=MUTED,
             font=("Segoe UI", 8), justify="center").pack()

    # Skip button
    skip_frame = tk.Frame(outer, bg=BG)
    skip_frame.pack(pady=(16, 0))

    skip_lbl = tk.Label(skip_frame,
                        text="Skip — use lite model for now",
                        bg=BG, fg=MUTED,
                        font=("Segoe UI", 8), cursor="hand2")
    skip_lbl.pack()
    skip_lbl.bind("<Enter>", lambda e: skip_lbl.configure(fg=FG))
    skip_lbl.bind("<Leave>", lambda e: skip_lbl.configure(fg=MUTED))

    _retry_shown = [False]

    def _on_skip(e=None):
        _mark_lite_mode()
        log("[ONBOARDING] user skipped — lite mode")
        _finish(skipped=True)

    skip_lbl.bind("<Button-1>", _on_skip)

    # ── Center ─────────────────────────────────────────────────────────────
    win.update_idletasks()
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    w,  h  = win.winfo_reqwidth(),     win.winfo_reqheight()
    win.geometry(f"+{(sw - w) // 2}+{(sh - h) // 2}")

    # ── Poll download status ────────────────────────────────────────────────
    def _poll():
        if _finished[0]:
            return

        if not target_id:
            _finish(skipped=False)
            return

        dl = state.model_dl_status.get(target_id, {})

        if dl.get("done"):
            bar_bg.configure(bg=SUCCESS)
            bar_fill.configure(bg=SUCCESS)
            bar_fill.place(relwidth=1.0, height=6)
            status_lbl.configure(text="Ready!", fg=SUCCESS)
            detail_lbl.configure(text="Press Alt+A anywhere to start.")
            skip_frame.pack_forget()
            win.after(1500, lambda: _finish(skipped=False))
            return

        if dl.get("error"):
            bar_fill.configure(bg=DANGER)
            status_lbl.configure(text="Download failed", fg=DANGER)
            detail_lbl.configure(text=dl.get("text", "Check your internet connection"))
            if not _retry_shown[0]:
                _retry_shown[0] = True
                skip_frame.pack_forget()
                retry_btn = tk.Label(outer,
                                     text="Retry",
                                     bg=ACCENT, fg="#1A1611",
                                     font=("Segoe UI", 9, "bold"),
                                     padx=20, pady=6, cursor="hand2")
                retry_btn.pack(pady=(12, 0))
                skip_lbl2 = tk.Label(outer,
                                     text="Skip — use lite model for now",
                                     bg=BG, fg=MUTED,
                                     font=("Segoe UI", 8), cursor="hand2")
                skip_lbl2.pack(pady=(8, 0))
                skip_lbl2.bind("<Button-1>", _on_skip)
                skip_lbl2.bind("<Enter>", lambda e: skip_lbl2.configure(fg=FG))
                skip_lbl2.bind("<Leave>", lambda e: skip_lbl2.configure(fg=MUTED))

                def _do_retry(e=None):
                    retry_btn.configure(text="Retrying…", bg=PANEL, cursor="")
                    retry_btn.unbind("<Button-1>")
                    bar_fill.configure(bg=ACCENT)
                    bar_bg.configure(bg=BORDER)
                    status_lbl.configure(text="Downloading your AI engine…", fg=FG)
                    detail_lbl.configure(text="Starting download…")
                    _retry_shown[0] = False
                    from ai import download_model_bg
                    threading.Thread(target=download_model_bg,
                                     args=(target_id,), daemon=True).start()
                    win.after(600, _poll)

                retry_btn.bind("<Button-1>", _do_retry)
            return

        # In progress — update bar and labels
        pct = dl.get("pct", 0)
        mb  = dl.get("mb",  0)
        tot = dl.get("tot", 0)
        spd = dl.get("speed_mbs", 0)
        eta = dl.get("eta_secs",  0)

        try:
            bar_width = bar_bg.winfo_width()
            if bar_width > 4 and pct > 0:
                bar_fill.place(x=0, y=0, width=int(bar_width * pct / 100), height=6)
        except Exception:
            pass

        parts = []
        if mb and tot:
            parts.append(f"{mb} MB / {tot} MB")
        if spd:
            parts.append(f"{spd} MB/s")
        if eta > 0:
            parts.append(f"~{eta // 60}m" if eta >= 60 else f"~{eta}s")
        detail_lbl.configure(text="  ·  ".join(parts) if parts else dl.get("text", "Downloading…"))

        pct_str = f"  {pct}%" if pct > 0 else ""
        status_lbl.configure(text=f"Downloading your AI engine…{pct_str}")

        win.after(400, _poll)

    win.after(800, _poll)


# ── Lite mode helpers ─────────────────────────────────────────────────────────

def _mark_lite_mode() -> None:
    try:
        from config import PREFS_FILE
        import json
        data = {}
        if PREFS_FILE.exists():
            data = json.loads(PREFS_FILE.read_text(encoding="utf-8"))
        data["lite_mode_banner"] = True
        PREFS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except Exception:
        pass


def is_lite_mode_banner_active() -> bool:
    try:
        from config import PREFS_FILE
        import json
        if PREFS_FILE.exists():
            return json.loads(
                PREFS_FILE.read_text(encoding="utf-8")
            ).get("lite_mode_banner", False)
    except Exception:
        pass
    return False


def clear_lite_mode_banner() -> None:
    try:
        from config import PREFS_FILE
        import json
        data = {}
        if PREFS_FILE.exists():
            data = json.loads(PREFS_FILE.read_text(encoding="utf-8"))
        data.pop("lite_mode_banner", None)
        PREFS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except Exception:
        pass
