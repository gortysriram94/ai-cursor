"""brain/rollback.py — State save/restore for undo."""

from log import log


def save_state(action_type: str) -> dict:
    """
    Snapshot current state before executing an action.
    Returns a dict that can be passed to restore_state() if the action fails.
    """
    snap: dict = {"type": action_type}
    if action_type in ("click", "type", "insert"):
        try:
            import pyperclip
            snap["clipboard"] = pyperclip.paste() or ""
        except Exception:
            snap["clipboard"] = ""
        try:
            from plat import platform as get_platform
            plat   = get_platform()
            window = plat.get_active_window()
            snap["text"] = plat.get_window_text(window) if window else ""
        except Exception:
            snap["text"] = ""
    return snap


def restore_state(snap: dict) -> bool:
    """
    Attempt to restore state after a failed action.
    Clipboard is restored directly. Text is not rewritten (would require Ctrl+Z),
    but the previous state length is logged so the user knows what to undo.
    Returns True if any restoration was attempted.
    """
    restored = False
    if snap.get("clipboard"):
        try:
            import pyperclip
            pyperclip.copy(snap["clipboard"])
            restored = True
        except Exception:
            pass
    if snap.get("text"):
        log(f"[ROLLBACK] Pre-action state was {len(snap['text'])} chars — "
            "press Ctrl+Z to undo if needed")
        restored = True
    return restored
