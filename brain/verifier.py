"""brain/verifier.py — Pre/post action verification."""

import sys
import ctypes.wintypes

from log import log


def verify_before(action: dict) -> bool:
    """
    Check that the target element exists, is enabled, and is on-screen.
    Returns True when verification passes or is unavailable.
    """
    if "coords" not in action:
        return True
    if sys.platform != "win32":
        return True
    try:
        from plat.windows import _uia, _UIA
        if not _UIA or not _uia:
            return True
        x, y = action["coords"]
        pt  = ctypes.wintypes.POINT(x, y)
        el  = _uia.ElementFromPoint(pt)
        if not el:
            return False
        return bool(el.CurrentIsEnabled) and not bool(el.CurrentIsOffscreen)
    except Exception:
        return True


def verify_after(action: dict, before_state: dict) -> bool:
    """
    Check that the action produced the expected change in window state.
    Returns True when verification passes or is unavailable.
    """
    try:
        from plat import platform as get_platform
        plat   = get_platform()
        window = plat.get_active_window()
        if not window:
            return True
        new_text = plat.get_window_text(window)
        action_type = action.get("type", "")
        if action_type == "click":
            changed = new_text != before_state.get("text", "")
            if not changed:
                log("[VERIFIER] click: window text unchanged after action")
            return changed
        if action_type == "type":
            grew = len(new_text) > len(before_state.get("text", ""))
            if not grew:
                log("[VERIFIER] type: text length did not increase")
            return grew
        return True
    except Exception:
        return True


def capture_state() -> dict:
    """Snapshot current window text for use as before_state in verify_after."""
    try:
        from plat import platform as get_platform
        plat   = get_platform()
        window = plat.get_active_window()
        return {"text": plat.get_window_text(window) if window else ""}
    except Exception:
        return {"text": ""}
