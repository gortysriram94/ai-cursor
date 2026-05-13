"""
AI Cursor (Pushpa) — Phase 1
────────────────────────────
The brain runs continuously in the background, building context from whatever
the user is doing.  The cursor shows a live status dot.  Alt+A opens a panel
that is already pre-loaded with what the brain knows.

Hotkeys (configurable in settings):
  Alt+A  → open panel
  Alt+H  → history
  Alt+S  → style profile
"""

import atexit
import ctypes
import queue
import sys
import threading

import tkinter as tk
import pyautogui

from config import WIN32_AVAILABLE
from log import log, _start_session, _end_session
import state
from storage import load_hotkeys, parse_hotkey, format_hotkey, load_flame_cursor
from ai import get_ollama_api
from context import get_active_context
from plat import platform as get_platform
from brain.perception import PerceptionThread
from brain.context_brain import ContextBrain
from ui.icons import (
    PAW_COLOR, PAW_COLOR_DARK, PAW_COLOR_SOFT,
    dot_widget, BG, BG2, DIVIDER, FG, FG_DIM, FG_MUT, BTN_ACT,
    set_flame_cursor, restore_default_cursor,
)
from ui.menu import show_menu
from ui.indicator import make_indicator
from ui.history import show_history_window, show_style_window
from hover import _hover_loop, _make_highlight_win


# ── Hotkey IDs ────────────────────────────────────────────────────────────────

_HK_MENU    = 1
_HK_HISTORY = 2
_HK_STYLE   = 3
_HK_FORM    = 4   # Alt+F — trigger form fill on the active window
_HK_MAP     = 5   # Alt+M — toggle scroll minimap
_HK_NEXT    = 6   # Alt+] — next section
_HK_PREV    = 7   # Alt+[ — previous section


# ── Ollama setup ──────────────────────────────────────────────────────────────

def setup_ollama(root: tk.Tk) -> bool:
    from config import OLLAMA_EXE, OLLAMA_MODEL, NVIDIA_API_KEY
    from ai import start_bundled_ollama, stop_bundled_ollama, is_model_pulled, get_vision_api

    log(f"[OLLAMA] exe path: {OLLAMA_EXE}  exists={OLLAMA_EXE.exists()}")
    if not OLLAMA_EXE.exists():
        log("[OLLAMA] Binary not found — skipping local AI")
        return False

    print("[OLLAMA] Starting bundled instance…")
    if not start_bundled_ollama():
        print("[OLLAMA] Failed to start")
        return False

    atexit.register(stop_bundled_ollama)

    if not is_model_pulled():
        state.is_first_run = True
        # Download starts when the dashboard welcome screen opens — not here

    return True


def _show_dashboard(root: tk.Tk):
    from ui.dashboard import show_dashboard
    show_dashboard(root)


def _show_hotkey_error(root: tk.Tk):
    """One-time toast when a hotkey fails to register (another app has it)."""
    from ui.icons import BG, FG, FG_DIM, PAW_COLOR
    win = tk.Toplevel(root)
    win.overrideredirect(True)
    win.attributes("-topmost", True)
    win.attributes("-alpha", 0.95)
    win.configure(bg="#3D1515")
    f = tk.Frame(win, bg="#2A0E0E", padx=14, pady=10)
    f.pack(padx=1, pady=1)
    tk.Label(f, text="⚠  Hotkey conflict",
             bg="#2A0E0E", fg="#F87171",
             font=("Segoe UI", 9, "bold")).pack(anchor="w")
    tk.Label(f, text="One or more hotkeys are already in use\nby another app. Check Settings to reassign.",
             bg="#2A0E0E", fg="#C8BEB0",
             font=("Segoe UI", 8), justify="left").pack(anchor="w", pady=(3, 0))
    win.update_idletasks()
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    w, h   = win.winfo_reqwidth(), win.winfo_reqheight()
    win.geometry(f"+{(sw-w)//2}+{sh-h-60}")
    win.after(5000, win.destroy)


# ── Module-level hotkey restart (callable from dashboard) ────────────────────

def restart_hotkey_listener():
    """Re-register all hotkeys — called after hotkey settings are saved."""
    plat = get_platform()
    for hid in (_HK_MENU, _HK_HISTORY, _HK_STYLE, _HK_FORM, _HK_MAP, _HK_NEXT, _HK_PREV):
        plat.unregister_hotkey(hid)
    _register_hotkeys()


# ── Settings popup ────────────────────────────────────────────────────────────

def show_settings_window(root: tk.Tk, cx: int, cy: int):
    from config import DEFAULT_HOTKEYS, _VK_MAP
    from storage import save_hotkeys

    hotkeys = load_hotkeys()
    pending = dict(hotkeys)

    win = tk.Toplevel(root)
    win.overrideredirect(True)
    win.attributes("-topmost", True)
    win.attributes("-alpha", 0.97)
    win.configure(bg=BG)

    outer = tk.Frame(win, bg=BG, padx=14, pady=12)
    outer.pack()

    hdr = tk.Frame(outer, bg=BG)
    hdr.pack(fill="x")
    dot_widget(hdr).pack(side="left", padx=(0, 8))
    tk.Label(hdr, text="settings", bg=BG, fg=FG_DIM,
             font=("Segoe UI", 10)).pack(side="left")
    tk.Button(hdr, text="✕", bg=BG, fg=FG_MUT, relief="flat", bd=0,
              padx=6, pady=2, font=("Segoe UI", 9), cursor="hand2",
              command=win.destroy).pack(side="right")

    tk.Frame(outer, bg=DIVIDER, height=1).pack(fill="x", pady=(8, 6))
    tk.Label(outer, text="Hotkeys", bg=BG, fg=FG_DIM,
             font=("Segoe UI", 9, "bold")).pack(anchor="w", pady=(0, 6))

    ACTION_LABELS = {"menu": "Action menu", "history": "History", "style": "My style"}
    btn_refs: dict[str, tk.Button] = {}

    def start_record(action, btn):
        btn.configure(text="Press keys…", fg=PAW_COLOR_SOFT, cursor="watch")
        btn.focus_set()
        held: set = set()

        def on_press(e):
            sym = e.keysym.lower()
            if sym in ("alt_l", "alt_r"):            held.add("alt")
            elif sym in ("control_l", "control_r"):  held.add("ctrl")
            elif sym in ("shift_l", "shift_r"):      held.add("shift")
            elif sym in ("super_l", "super_r"):      held.add("win")
            else:
                if not held or sym not in _VK_MAP:
                    return
                combo = "+".join(sorted(held) + [sym.lower()])
                pending[action] = combo
                from storage import format_hotkey
                btn.configure(text=format_hotkey(combo), fg=FG, cursor="hand2")
                btn.unbind("<KeyPress>")
                btn.unbind("<KeyRelease>")

        def on_release(e):
            sym = e.keysym.lower()
            held.discard({"alt_l":"alt","alt_r":"alt",
                          "control_l":"ctrl","control_r":"ctrl",
                          "shift_l":"shift","shift_r":"shift"}.get(sym, ""))

        btn.bind("<KeyPress>",   on_press)
        btn.bind("<KeyRelease>", on_release)

    from storage import format_hotkey
    for action in ("menu", "history", "style"):
        row = tk.Frame(outer, bg=BG)
        row.pack(fill="x", pady=3)
        tk.Label(row, text=ACTION_LABELS[action], bg=BG, fg=FG_DIM,
                 font=("Segoe UI", 9), width=12, anchor="w").pack(side="left")
        current = format_hotkey(hotkeys.get(action, DEFAULT_HOTKEYS[action]))
        btn = tk.Button(row, text=current, bg=BG2, fg=FG,
                        relief="flat", bd=0, padx=12, pady=4,
                        font=("Segoe UI", 9, "bold"), cursor="hand2")
        btn.configure(command=lambda a=action, b=btn: start_record(a, b))
        btn.pack(side="left")
        btn_refs[action] = btn

    tk.Frame(outer, bg=DIVIDER, height=1).pack(fill="x", pady=(10, 6))
    foot = tk.Frame(outer, bg=BG)
    foot.pack(fill="x")

    tk.Button(foot, text="Reset defaults", bg=BG, fg=FG_MUT,
              relief="flat", bd=0, padx=8, pady=4,
              font=("Segoe UI", 8), cursor="hand2",
              command=lambda: [pending.update(DEFAULT_HOTKEYS)] or
                              [b.configure(text=format_hotkey(DEFAULT_HOTKEYS[a]), fg=FG)
                               for a, b in btn_refs.items()]).pack(side="left")

    def apply_and_close():
        save_hotkeys(pending)
        win.destroy()
        _restart_hotkeys(root)

    tk.Button(foot, text="Save", bg=PAW_COLOR, fg="#fff",
              relief="flat", bd=0, padx=16, pady=4,
              font=("Segoe UI", 9, "bold"), cursor="hand2",
              command=apply_and_close).pack(side="right")

    win.bind("<Escape>", lambda e: win.destroy())
    win.update_idletasks()
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    w, h   = win.winfo_reqwidth(), win.winfo_reqheight()
    win.geometry(f"+{min(cx+12, sw-w-10)}+{max(10, min(cy-h//2, sh-h-10))}")


# ── Hotkey re-registration ─────────────────────────────────────────────────────

def _restart_hotkeys(root: tk.Tk = None):
    """Re-register all hotkeys after settings change. Delegates to the
    module-level restart_hotkey_listener() so both code paths stay in sync."""
    restart_hotkey_listener()


def _register_hotkeys():
    plat    = get_platform()
    hotkeys = load_hotkeys()
    id_map  = {
        "menu":    _HK_MENU,
        "history": _HK_HISTORY,
        "style":   _HK_STYLE,
        "form":    _HK_FORM,
    }
    for action, hid in id_map.items():
        combo = hotkeys.get(action, "")
        mods, vk = parse_hotkey(combo)
        if vk:
            ok = plat.register_hotkey(hid, mods, vk)
            if ok:
                log(f"[HOTKEY] {combo} → {action}")

    # Fixed navigation hotkeys (not user-configurable)
    from config import _VK_MAP, _MOD_BITS
    _alt = _MOD_BITS["alt"]
    for hid, key in [(_HK_MAP, "m"), (_HK_NEXT, "]"), (_HK_PREV, "[")]:
        vk = _VK_MAP.get(key) or ord(key.upper())
        plat.register_hotkey(hid, _alt, vk)


# ── Main ──────────────────────────────────────────────────────────────────────

def _set_dpi_awareness():
    """
    Tell Windows this process is Per-Monitor DPI aware before any window is
    created. Without this, Windows virtualises coordinates and Tkinter windows
    appear at the wrong position on scaled (125 %, 150 %, 200 %) displays.

    Must be called before any HWND is created — i.e. before tk.Tk().
    """
    if sys.platform != "win32":
        return
    try:
        # Windows 8.1+: per-monitor DPI aware (best)
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            # Windows Vista+: system DPI aware (fallback)
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


def _get_monitor_rect(cx: int, cy: int) -> tuple[int, int, int, int]:
    """
    Return (left, top, right, bottom) of the monitor that contains (cx, cy).
    Falls back to primary monitor if Win32 is unavailable.
    Multi-monitor: cursor on monitor 2 has cx > primary_width, which breaks
    positioning calculations that assume sw = primary monitor width.
    """
    if sys.platform == "win32":
        try:
            MONITOR_DEFAULTTONEAREST = 2
            hmon = ctypes.windll.user32.MonitorFromPoint(
                ctypes.wintypes.POINT(cx, cy), MONITOR_DEFAULTTONEAREST
            )
            # MONITORINFO layout: cbSize(4) rcMonitor(16) rcWork(16) dwFlags(4)
            # Cast as int32[]: [0]=cbSize [1]=left [2]=top [3]=right [4]=bottom
            MONITORINFO = ctypes.c_ubyte * 40
            mi = MONITORINFO()
            ctypes.cast(mi, ctypes.POINTER(ctypes.c_uint32))[0] = 40  # cbSize
            if ctypes.windll.user32.GetMonitorInfoW(hmon, ctypes.byref(mi)):
                vals = ctypes.cast(mi, ctypes.POINTER(ctypes.c_int32))
                return (int(vals[1]), int(vals[2]), int(vals[3]), int(vals[4]))
        except Exception:
            pass
    # Fallback: use pyautogui primary screen size
    sw, sh = pyautogui.size()
    return (0, 0, sw, sh)


def main():
    _start_session()
    atexit.register(_end_session)

    # ── Single-instance guard ─────────────────────────────────────────────────
    if sys.platform == "win32":
        _mutex = ctypes.windll.kernel32.CreateMutexW(None, True, "Global\\AICursorSingleInstance")
        if ctypes.windll.kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
            ctypes.windll.user32.MessageBoxW(
                0,
                "AI Cursor is already running.\n\nCheck the system tray.",
                "AI Cursor",
                0x40,  # MB_ICONINFORMATION
            )
            sys.exit(0)

    _set_dpi_awareness()   # must be before tk.Tk()

    # ── Create root FIRST so _pull_with_progress can use Toplevel (not Tk) ───
    _TRANSP = "#000001"
    root = tk.Tk()
    root.overrideredirect(True)
    root.attributes("-transparentcolor", _TRANSP)
    root.configure(bg=_TRANSP)
    root.geometry("1x1+0+0")

    setup_ollama(root)

    # ── Enterprise connections ────────────────────────────────────────────────
    # Load stored credentials from OS keychain and register enterprise AI/RAG
    # providers so they're available before any AI call happens.
    try:
        from keychain import load_all_connection_creds
        from connections import load_into_registries
        load_into_registries(load_all_connection_creds())
    except Exception as _conn_err:
        log(f"[CONNECTIONS] startup load failed: {_conn_err}")

    from config import NVIDIA_API_KEY, OLLAMA_MODEL
    local_api = get_ollama_api()
    print("=" * 40)
    print("  AI Cursor — running")
    print(f"  Cloud: {'NVIDIA NIM ✓' if NVIDIA_API_KEY else '✗ no key'}")
    print(f"  Local: {OLLAMA_MODEL if local_api else 'not running'}")
    print("=" * 40 + "\n")

    root.attributes("-topmost", True)

    # ── Flame cursor ──────────────────────────────────────────────────────────
    if load_flame_cursor():
        set_flame_cursor()
    atexit.register(restore_default_cursor)

    # ── Hover highlight (optional, kept from existing feature) ────────────────
    from storage import load_hover_highlight
    _highlight_win = [None]
    if load_hover_highlight():
        _highlight_win[0] = _make_highlight_win(root)
    threading.Thread(target=_hover_loop, args=(root, _highlight_win),
                     daemon=True).start()

    # ── Perception + brain ────────────────────────────────────────────────────
    obs_queue = queue.Queue(maxsize=20)
    perception = PerceptionThread(obs_queue)
    brain      = ContextBrain(obs_queue)

    perception.start()
    brain.start()

    atexit.register(perception.stop)
    atexit.register(brain.stop)

    # ── Status indicator near cursor ──────────────────────────────────────────
    make_indicator(root)

    # ── Debug overlay (only when PUSHPA_DEBUG_OVERLAY=1) ─────────────────────
    from config import DEBUG_OVERLAY
    if DEBUG_OVERLAY:
        from ui.debug_overlay import make_debug_overlay
        make_debug_overlay(root)

    # ── Hotkeys ───────────────────────────────────────────────────────────────
    _register_hotkeys()
    plat = get_platform()
    if hasattr(plat, "stop"):
        atexit.register(plat.stop)

    # ── Crash recovery ────────────────────────────────────────────────────────
    from crash import install_crash_handlers
    install_crash_handlers(root, platform_instance=plat)

    # ── First-run: open dashboard to welcome/setup screen ────────────────────
    if state.is_first_run:
        from ui.dashboard import show_dashboard
        root.after(800, lambda: show_dashboard(root, initial_tab="setup"))

    # ── Form fill trigger ─────────────────────────────────────────────────────

    def _trigger_form_fill(root: tk.Tk, cx: int, cy: int):
        """Called when Alt+F or 'Fill Form' panel button fires."""
        window = plat.get_active_window()
        if not window:
            return
        from ui.form_controller import start_form_fill
        start_form_fill(root, window, cx, cy)

    # ── Compact notification handler ──────────────────────────────────────────
    _notify_open = [False]   # prevent stacking multiple notifications

    def _show_compact_notify(record):
        from ui.compact_notify import show_compact_notify
        from storage import load_compact_destination, load_compact_destination_path
        from memory import route_compact

        _notify_open[0] = True

        def on_save():
            _notify_open[0] = False
            dest      = load_compact_destination()
            dest_path = load_compact_destination_path()
            record.destination = dest
            route_compact(record, dest, dest_path)
            log(f"[COMPACT] saved to {dest} — {record.task[:50]}")

        def on_edit():
            _notify_open[0] = False
            from ui.compact_editor import show_compact_editor

            def on_confirm(edited_record, destination):
                dest_path = load_compact_destination_path()
                edited_record.destination = destination
                route_compact(edited_record, destination, dest_path)
                log(f"[COMPACT] saved (edited) to {destination} — {edited_record.task[:50]}")

            def on_discard():
                log("[COMPACT] discarded by user")

            show_compact_editor(root, record, on_confirm, on_discard)

        def on_dismiss():
            _notify_open[0] = False
            log("[COMPACT] dismissed")

        cx, cy = pyautogui.position()
        show_compact_notify(root, record, cx, cy, on_save, on_edit, on_dismiss)

    # ── Main tick loop ────────────────────────────────────────────────────────
    import time as _time
    _menu_close_ts = [0.0]   # timestamp when panel last closed — reopen cooldown
    _REOPEN_COOLDOWN = 0.3   # seconds — prevents accidental double-open on key hold

    def tick():
        try:
            hk = plat.poll_hotkey()

            if hk == _HK_MENU:
                log(f"[HOTKEY] Alt+A fired — menu_open={state.menu_open} cooldown_ok={_time.monotonic() - _menu_close_ts[0] >= _REOPEN_COOLDOWN}")

            if hk == _HK_MENU and not state.menu_open and (
                    _time.monotonic() - _menu_close_ts[0] >= _REOPEN_COOLDOWN):
                # Set flag BEFORE show_menu to close the race window where a
                # second hotkey press could slip through before the flag is set
                # inside show_menu (the panel function sets it too, but later).
                state.menu_open = True
                cx, cy = pyautogui.position()
                # Use brain's app_name/context if available, else fallback
                ctx = state.working_context
                app_name, context = ("", "generic")
                if ctx:
                    app_name = ctx.app_name
                    context  = ctx.market
                else:
                    app_name, context = get_active_context()

                # Get window handle via plat abstraction (works on all platforms)
                target_hwnd = None
                try:
                    _win = plat.get_active_window()
                    if _win:
                        target_hwnd = _win.handle
                        state.last_target_hwnd = int(target_hwnd) if target_hwnd else 0
                except Exception:
                    pass

                try:
                    show_menu(
                        root, cx, cy,
                        app_name=app_name,
                        context=context,
                        target_hwnd=target_hwnd,
                        on_settings=lambda: _show_dashboard(root),
                        on_close=lambda: _menu_close_ts.__setitem__(0, _time.monotonic()),
                    )
                except Exception as _menu_err:
                    # If show_menu crashes for any reason, reset the flag so
                    # Alt+A is not permanently blocked.
                    state.menu_open = False
                    log(f"[MENU] show_menu crashed — menu_open reset: {_menu_err}")

            elif hk == _HK_HISTORY:
                cx, cy = pyautogui.position()
                show_history_window(root, cx, cy)

            elif hk == _HK_STYLE:
                cx, cy = pyautogui.position()
                show_style_window(root, cx, cy)

            elif hk == _HK_FORM and not state.form_fill_active:
                cx, cy = pyautogui.position()
                _trigger_form_fill(root, cx, cy)

            elif hk == _HK_MAP:
                from ui.scroll_map import toggle_scroll_map
                toggle_scroll_map(root)

            elif hk == _HK_NEXT:
                from ui.scroll_map import navigate_sections
                navigate_sections(+1)

            elif hk == _HK_PREV:
                from ui.scroll_map import navigate_sections
                navigate_sections(-1)

            # Compact notification — show once, non-blocking
            if state.compact_pending and not _notify_open[0] and not state.menu_open:
                record = state.compact_pending
                state.compact_pending = None
                root.after(0, lambda r=record: _show_compact_notify(r))

            # Safety: reset menu_open if the menu Toplevel is gone, and destroy
            # any orphaned _is_menu windows left by a previous crash.
            menu_alive = [w for w in root.winfo_children()
                          if isinstance(w, tk.Toplevel)
                          and w.winfo_exists()
                          and getattr(w, "_is_menu", False)]
            if state.menu_open and not menu_alive:
                state.menu_open = False
                log("[MENU] safety reset — menu_open cleared (no live _is_menu window)")
            elif not state.menu_open and menu_alive:
                # Orphaned _is_menu window from a previous crash — destroy it
                for _w in menu_alive:
                    try:
                        _w.destroy()
                    except Exception:
                        pass
                log(f"[MENU] destroyed {len(menu_alive)} orphaned _is_menu window(s)")

            # Surface hotkey registration failure once — user needs to know
            if state.hotkey_registration_failed:
                state.hotkey_registration_failed = False
                _show_hotkey_error(root)

        except Exception as e:
            import traceback
            log(f"[TICK] {e}\n{traceback.format_exc()}")

        root.after(16, tick)

    root.after(0, tick)
    root.mainloop()


if __name__ == "__main__":
    main()
