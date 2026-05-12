"""
crash.py — Crash recovery layer.

Installs:
  sys.excepthook        — catches unhandled exceptions on main thread
  threading.excepthook  — catches unhandled exceptions on any daemon thread

On any unhandled exception:
  1. Log the full traceback
  2. Restore the system cursor (was custom flame cursor)
  3. Unregister all hotkeys
  4. Restore the clipboard to what it was before the last insert
  5. Destroy all open Toplevel overlay windows
  6. Re-raise (or exit cleanly) so the process terminates

Call install_crash_handlers(root) once from main() after tk.Tk() is created.
"""

import sys
import threading
import traceback


def install_crash_handlers(root, platform_instance=None):
    """
    Install global exception hooks and atexit cleanup.

    root              — the hidden tk.Tk() root window
    platform_instance — the PlatformBase singleton (for hotkey cleanup)
    """
    from log import log

    def _cleanup(exc_info=None):
        """Best-effort cleanup: cursor, hotkeys, clipboard, windows."""
        # 1. Restore cursor (suppresses the flame cursor on crash)
        try:
            from ui.icons import restore_default_cursor
            restore_default_cursor()
        except Exception:
            pass

        # 2. Unregister hotkeys
        try:
            if platform_instance and hasattr(platform_instance, "stop"):
                platform_instance.stop()
        except Exception:
            pass

        # 3. Restore pre-insert clipboard if we crashed during an insert
        try:
            import state
            if state._pre_insert_clipboard:
                import pyperclip
                pyperclip.copy(state._pre_insert_clipboard)
                state._pre_insert_clipboard = ""
        except Exception:
            pass

        # 4. Destroy all overlay Toplevels
        try:
            if root and root.winfo_exists():
                for w in root.winfo_children():
                    try:
                        if hasattr(w, "destroy"):
                            w.destroy()
                    except Exception:
                        pass
        except Exception:
            pass

        # 5. Log
        if exc_info:
            tb = "".join(traceback.format_exception(*exc_info))
            log(f"[CRASH] Unhandled exception:\n{tb}")

    def main_thread_hook(exc_type, exc_value, exc_tb):
        _cleanup((exc_type, exc_value, exc_tb))
        # Don't swallow — let Python print the traceback normally too
        sys.__excepthook__(exc_type, exc_value, exc_tb)

    def thread_hook(args):
        _cleanup((args.exc_type, args.exc_value, args.exc_traceback))

    sys.excepthook = main_thread_hook
    threading.excepthook = thread_hook

    # atexit: cleanup even on clean exit (ensures hotkeys/cursor always restored)
    import atexit
    atexit.register(lambda: _cleanup(None))

    log("[CRASH] recovery handlers installed")
