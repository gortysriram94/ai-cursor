"""
plat/executor.py — General-purpose action execution with safety guards.

Provides all execution primitives for the EXECUTE stage of the pipeline:

  RateLimiter      — prevents action flooding (max 10 actions / 60s)
  FocusGuard       — verifies target window still has focus before acting
  ActionVerifier   — post-action state check (did it actually work?)
  Rollback         — Ctrl+Z undo + clipboard restore
  verified_insert  — full pipeline: rate-check → focus-check → paste → verify
  click_at         — general click with focus guard
  send_keyboard    — general keyboard shortcut
"""

import time
import threading
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

from log import log


# ── Result type ───────────────────────────────────────────────────────────────

@dataclass
class ActionResult:
    success:  bool
    method:   str         # "clipboard" | "uia" | "keyboard" | "click"
    verified: bool = False
    error:    Optional[str] = None
    rollback_available: bool = False


# ── Rate limiter ──────────────────────────────────────────────────────────────

class RateLimiter:
    """
    Sliding-window rate limiter.
    Default: max 10 actions per 60 seconds.
    Shared module-level instance used by all execute calls.
    """

    def __init__(self, max_actions: int = 10, window_s: float = 60.0):
        self._max      = max_actions
        self._window   = window_s
        self._ts: deque = deque()
        self._lock     = threading.Lock()

    def is_allowed(self) -> bool:
        now = time.monotonic()
        with self._lock:
            self._purge(now)
            return len(self._ts) < self._max

    def record(self) -> None:
        with self._lock:
            self._ts.append(time.monotonic())

    def _purge(self, now: float) -> None:
        while self._ts and now - self._ts[0] > self._window:
            self._ts.popleft()

    @property
    def remaining(self) -> int:
        now = time.monotonic()
        with self._lock:
            self._purge(now)
            return max(0, self._max - len(self._ts))


# Module-level shared limiter — applies across all action types
_rate_limiter = RateLimiter(max_actions=10, window_s=60.0)


def get_rate_limiter() -> RateLimiter:
    return _rate_limiter


# ── Focus guard ───────────────────────────────────────────────────────────────

def check_focus(target_hwnd) -> bool:
    """
    Returns True if `target_hwnd` is still the foreground window.
    Always returns True on non-Windows or when hwnd is None.
    """
    if not target_hwnd:
        return True
    try:
        from config import WIN32_AVAILABLE
        if WIN32_AVAILABLE:
            import win32gui
            return win32gui.GetForegroundWindow() == target_hwnd
    except Exception:
        pass
    return True


def restore_focus(target_hwnd) -> bool:
    """Bring `target_hwnd` back to the foreground. Returns True on success."""
    if not target_hwnd:
        return False
    try:
        from config import WIN32_AVAILABLE
        if WIN32_AVAILABLE:
            import win32gui
            win32gui.SetForegroundWindow(target_hwnd)
            time.sleep(0.1)
            return True
    except Exception:
        pass
    return False


# ── Action verifier ───────────────────────────────────────────────────────────

def verify_focus_maintained(target_hwnd, wait_s: float = 0.25) -> bool:
    """
    Wait `wait_s` seconds then check focus is still on target.
    Used post-action to confirm the paste landed in the right window.
    """
    time.sleep(wait_s)
    return check_focus(target_hwnd)


# ── Rollback ──────────────────────────────────────────────────────────────────

def rollback_text_insert(target_hwnd=None) -> bool:
    """
    Undo the last text insertion via Ctrl+Z.
    Re-focuses the target window first if provided.
    """
    try:
        import pyautogui
        if target_hwnd:
            restore_focus(target_hwnd)
            time.sleep(0.1)
        pyautogui.hotkey("ctrl", "z")
        log("[EXECUTOR] rollback: Ctrl+Z sent")
        return True
    except Exception as e:
        log(f"[EXECUTOR] rollback failed: {e}")
        return False


# ── General keyboard ──────────────────────────────────────────────────────────

def send_keyboard(*keys: str, target_hwnd=None) -> ActionResult:
    """
    Send a keyboard shortcut. Optionally re-focuses target_hwnd first.
    Example: send_keyboard("ctrl", "c")  /  send_keyboard("enter")
    """
    if not _rate_limiter.is_allowed():
        log(f"[EXECUTOR] rate limit — {_rate_limiter.remaining} actions remaining")
        return ActionResult(success=False, method="keyboard",
                            error="rate_limit_exceeded")

    try:
        import pyautogui
        if target_hwnd and not check_focus(target_hwnd):
            restore_focus(target_hwnd)
        pyautogui.hotkey(*keys)
        _rate_limiter.record()
        return ActionResult(success=True, method="keyboard")
    except Exception as e:
        log(f"[EXECUTOR] send_keyboard failed: {e}")
        return ActionResult(success=False, method="keyboard", error=str(e))


# ── General click ─────────────────────────────────────────────────────────────

def click_at(x: int, y: int, target_hwnd=None,
             button: str = "left") -> ActionResult:
    """
    Click screen coordinates with focus guard.
    If target_hwnd is provided, aborts if focus has moved.
    """
    if not _rate_limiter.is_allowed():
        return ActionResult(success=False, method="click",
                            error="rate_limit_exceeded")

    if target_hwnd and not check_focus(target_hwnd):
        log(f"[EXECUTOR] click_at aborted — focus moved from {target_hwnd:#010x}")
        return ActionResult(success=False, method="click",
                            error="focus_moved")
    try:
        import pyautogui
        pyautogui.click(x, y, button=button)
        _rate_limiter.record()
        return ActionResult(success=True, method="click")
    except Exception as e:
        log(f"[EXECUTOR] click_at({x},{y}) failed: {e}")
        return ActionResult(success=False, method="click", error=str(e))


def click_rect(rect: tuple, target_hwnd=None) -> ActionResult:
    """Click the center of a (left, top, right, bottom) rect."""
    left, top, right, bottom = rect
    cx = (left + right) // 2
    cy = (top + bottom) // 2
    return click_at(cx, cy, target_hwnd=target_hwnd)


# ── Verified insert ───────────────────────────────────────────────────────────

def verified_insert(
    text: str,
    target_hwnd=None,
    max_retries: int = 2,
) -> ActionResult:
    """
    Full execution pipeline for text insertion:
      1. Rate limit check
      2. Save clipboard (rollback prep)
      3. Focus guard — abort if window changed
      4. Copy text to clipboard
      5. Re-focus target window
      6. Wait 250ms
      7. Focus guard — abort if window changed again
      8. Paste (Ctrl+V)
      9. Restore original clipboard
      10. Post-action verify: focus still maintained?

    Returns ActionResult with rollback_available=True on success
    (caller can invoke rollback_text_insert() to undo).
    """
    if not _rate_limiter.is_allowed():
        log(f"[EXECUTOR] verified_insert rate-limited")
        return ActionResult(success=False, method="clipboard",
                            error="rate_limit_exceeded")

    import pyautogui

    # ── Step 1: Save clipboard ─────────────────────────────────────────────
    original_clip = ""
    try:
        import pyperclip
        original_clip = pyperclip.paste() or ""
    except Exception:
        pass

    for attempt in range(max_retries + 1):
        try:
            # ── Step 2: Copy to clipboard ──────────────────────────────────
            try:
                import pyperclip
                pyperclip.copy(text)
            except Exception as e:
                return ActionResult(success=False, method="clipboard",
                                    error=f"clipboard copy failed: {e}")

            # ── Step 3: Focus guard — pre-paste ───────────────────────────
            if target_hwnd and not check_focus(target_hwnd):
                restored = restore_focus(target_hwnd)
                if not restored:
                    log("[EXECUTOR] verified_insert: could not restore focus")
                    _restore_clip(original_clip)
                    return ActionResult(success=False, method="clipboard",
                                        error="focus_lost")

            time.sleep(0.25)

            # ── Step 4: Focus guard — post-sleep ──────────────────────────
            if not check_focus(target_hwnd):
                log("[EXECUTOR] verified_insert: focus moved during sleep")
                _restore_clip(original_clip)
                return ActionResult(success=False, method="clipboard",
                                    error="focus_moved_during_sleep")

            # ── Step 5: Paste ──────────────────────────────────────────────
            pyautogui.hotkey("ctrl", "v")
            _rate_limiter.record()

            # ── Step 6: Restore clipboard ──────────────────────────────────
            _restore_clip(original_clip)

            # ── Step 7: Verify ─────────────────────────────────────────────
            verified = verify_focus_maintained(target_hwnd, wait_s=0.1)
            log(f"[EXECUTOR] insert {'verified' if verified else 'unverified'} "
                f"(attempt {attempt + 1})")

            return ActionResult(
                success  = True,
                method   = "clipboard",
                verified = verified,
                rollback_available = True,
            )

        except Exception as e:
            log(f"[EXECUTOR] insert attempt {attempt + 1} failed: {e}")
            if attempt < max_retries:
                time.sleep(0.1 * (attempt + 1))   # brief backoff

    _restore_clip(original_clip)
    return ActionResult(success=False, method="clipboard",
                        error="all retries exhausted")


def _restore_clip(text: str) -> None:
    try:
        import pyperclip
        pyperclip.copy(text)
    except Exception:
        pass
