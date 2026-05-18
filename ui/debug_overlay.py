"""
ui/debug_overlay.py — Internal runtime diagnostics overlay.

Enable via .env.local:
    PUSHPA_DEBUG_OVERLAY=1

Shows live:
    active_window  context_type  market  confidence
    signals        latency       provider
    clipboard      hwnd          AI state

Updated every 500 ms from state module — zero impact on prod builds.
"""

import time
import tkinter as tk

import state
from log import log


_OVERLAY_BG    = "#0D0D0F"
_OVERLAY_FG    = "#9EFFC8"   # green — readable at small size
_OVERLAY_DIM   = "#5A6A5A"
_OVERLAY_WARN  = "#FFB347"
_OVERLAY_ERR   = "#FF6B6B"
_OVERLAY_FONT  = ("Cascadia Code", 8) if True else ("Courier New", 8)
_UPDATE_MS     = 500


def _clip_preview() -> str:
    """Return first 32 chars of clipboard, safe."""
    try:
        import pyperclip
        text = pyperclip.paste() or ""
        text = text.replace("\n", "↵").replace("\r", "")
        return text[:32] + ("…" if len(text) > 32 else "")
    except Exception:
        return "—"


def _fmt_signals(signals) -> str:
    if signals is None:
        return "—"
    parts = []
    if signals.has_email_headers:  parts.append("email")
    if signals.has_quoted_thread:  parts.append("thread")
    if signals.has_code:           parts.append("code")
    if signals.has_urls:           parts.append("urls")
    if signals.has_attachment_ref: parts.append("attach")
    parts.append(f"w:{signals.word_count}")
    return " ".join(parts) or "none"


def _conf_color(conf: float) -> str:
    if conf >= 0.7: return _OVERLAY_FG
    if conf >= 0.4: return _OVERLAY_WARN
    return _OVERLAY_ERR


def make_debug_overlay(root: tk.Tk) -> None:
    """
    Create a persistent floating debug overlay.
    Call once from main() when PUSHPA_DEBUG_OVERLAY=1.
    The overlay is transparent to mouse events (click-through).
    """
    win = tk.Toplevel(root)
    win.overrideredirect(True)
    win.attributes("-topmost", True)
    win.attributes("-alpha", 0.88)
    win.configure(bg=_OVERLAY_BG)

    # Position: top-right corner
    win.update_idletasks()
    sw = root.winfo_screenwidth()
    win.geometry(f"+{sw - 310}+10")

    # ── Rows ──────────────────────────────────────────────────────────────────
    rows: list[tuple[tk.Label, tk.Label]] = []

    def _row(label: str) -> tuple[tk.Label, tk.Label]:
        f = tk.Frame(win, bg=_OVERLAY_BG)
        f.pack(fill="x", padx=6, pady=1)
        lbl = tk.Label(f, text=label, bg=_OVERLAY_BG, fg=_OVERLAY_DIM,
                       font=_OVERLAY_FONT, width=10, anchor="w")
        lbl.pack(side="left")
        val = tk.Label(f, text="—", bg=_OVERLAY_BG, fg=_OVERLAY_FG,
                       font=_OVERLAY_FONT, anchor="w", wraplength=200)
        val.pack(side="left", fill="x")
        rows.append((lbl, val))
        return lbl, val

    tk.Label(win, text="  ◈ debug", bg=_OVERLAY_BG, fg=_OVERLAY_DIM,
             font=("Segoe UI", 7, "bold")).pack(anchor="w", padx=6, pady=(4, 2))

    _, r_window   = _row("window")
    _, r_ctx      = _row("ctx_type")
    _, r_market   = _row("market")
    _, r_conf     = _row("confidence")
    _, r_signals  = _row("signals")
    _, r_latency  = _row("latency")
    _, r_provider = _row("provider")
    _, r_ai       = _row("ai_state")
    _, r_clip     = _row("clipboard")
    _, r_hwnd     = _row("hwnd")
    _, r_status   = _row("status")

    tk.Frame(win, bg="#1A2A1A", height=1).pack(fill="x", padx=4, pady=2)
    tk.Label(win, text="  ◈ health", bg=_OVERLAY_BG, fg=_OVERLAY_DIM,
             font=("Segoe UI", 7, "bold")).pack(anchor="w", padx=6, pady=(2, 1))

    _, r_obs_rate    = _row("obs/min")
    _, r_brain_rate  = _row("brain rdy")
    _, r_proactive   = _row("proactive")
    _, r_threads     = _row("threads")
    _, r_anomalies   = _row("anomalies")

    tk.Frame(win, bg="#1A2A1A", height=1).pack(fill="x", padx=4, pady=2)
    tk.Label(win, text="  Alt+D to close", bg=_OVERLAY_BG, fg=_OVERLAY_DIM,
             font=("Segoe UI", 6)).pack(anchor="w", padx=6, pady=(0, 4))

    # ── Update loop ───────────────────────────────────────────────────────────
    def update():
        try:
            ctx = state.working_context

            if ctx:
                r_window.configure(text=f"{ctx.app_name or '—'}", fg=_OVERLAY_FG)
                r_ctx.configure(text=ctx.context_type or "generic", fg=_OVERLAY_FG)
                r_market.configure(text=ctx.market or "generic", fg=_OVERLAY_FG)
                conf = ctx.confidence
                r_conf.configure(
                    text=f"{conf:.2f}  {'●' * int(conf * 5)}{'○' * (5 - int(conf * 5))}",
                    fg=_conf_color(conf)
                )
                r_signals.configure(text=_fmt_signals(ctx.signals), fg=_OVERLAY_FG)
            else:
                for lbl in (r_window, r_ctx, r_market, r_conf, r_signals):
                    lbl.configure(text="waiting…", fg=_OVERLAY_DIM)

            # Latency + provider
            latency = getattr(state, "last_ai_latency_ms", None)
            provider = getattr(state, "last_ai_provider", "none")
            fallback = getattr(state, "last_ai_fallback", False)
            if latency is not None:
                lat_color = _OVERLAY_FG if latency < 2000 else (
                    _OVERLAY_WARN if latency < 5000 else _OVERLAY_ERR)
                r_latency.configure(text=f"{latency}ms", fg=lat_color)
            else:
                r_latency.configure(text="—", fg=_OVERLAY_DIM)
            fb_tag = " ↩fallback" if fallback else ""
            r_provider.configure(text=f"{provider}{fb_tag}",
                                  fg=_OVERLAY_WARN if fallback else _OVERLAY_FG)

            # AI state
            active = getattr(state, "ai_active_count", 0)
            r_ai.configure(
                text=f"{'●' * active}{'○' * max(0, 2 - active)} ({active} active)",
                fg=_OVERLAY_ERR if active > 1 else (_OVERLAY_FG if active == 0 else _OVERLAY_WARN)
            )

            # Clipboard
            r_clip.configure(text=_clip_preview(), fg=_OVERLAY_DIM)

            # hwnd
            hwnd = getattr(state, "last_target_hwnd", None)
            r_hwnd.configure(
                text=f"{hwnd:#010x}" if hwnd else "—",
                fg=_OVERLAY_FG if hwnd else _OVERLAY_DIM
            )

            # Status
            menu  = "menu●" if state.menu_open else ""
            form  = " form●" if state.form_fill_active else ""
            ready = " READY" if (ctx and ctx.ready) else " building…"
            r_status.configure(
                text=f"{menu}{form}{ready}",
                fg=_OVERLAY_FG if (ctx and ctx.ready) else _OVERLAY_WARN
            )

            # ── Health metrics (from observability.py) ────────────────────────
            m = state.obs_metrics
            if m:
                obs_r = m.get("obs_rate_1m", 0)
                r_obs_rate.configure(
                    text=f"{obs_r:.1f}/min",
                    fg=_OVERLAY_FG if obs_r > 1 else _OVERLAY_WARN
                )

                br = m.get("brain_ready_rate", 0)
                r_brain_rate.configure(
                    text=f"{br:.0%}",
                    fg=_OVERLAY_FG if br >= 0.7 else (_OVERLAY_WARN if br >= 0.4 else _OVERLAY_ERR)
                )

                gen  = m.get("proactive_gen_1m", 0)
                errs = m.get("proactive_err_1m", 0)
                hits = m.get("proactive_hit_1m", 0)
                r_proactive.configure(
                    text=f"gen:{gen} err:{errs} hit:{hits}",
                    fg=_OVERLAY_ERR if errs > 0 else _OVERLAY_FG
                )

                threads = m.get("threads", {})
                dead    = [n for n, a in threads.items() if not a]
                r_threads.configure(
                    text="all alive" if not dead else f"DEAD: {','.join(dead)}",
                    fg=_OVERLAY_FG if not dead else _OVERLAY_ERR
                )

                anomalies = m.get("anomalies", [])
                r_anomalies.configure(
                    text=anomalies[0] if anomalies else "none",
                    fg=_OVERLAY_ERR if anomalies else _OVERLAY_DIM
                )
            else:
                for r in (r_obs_rate, r_brain_rate, r_proactive, r_threads, r_anomalies):
                    r.configure(text="collecting…", fg=_OVERLAY_DIM)

        except Exception:
            pass

        try:
            win.after(_UPDATE_MS, update)
        except Exception:
            pass

    update()

    # Alt+D closes the overlay
    win.bind("<Alt-d>", lambda e: win.destroy())
    win.bind("<Alt-D>", lambda e: win.destroy())

    log("[DEBUG] diagnostics overlay active")
