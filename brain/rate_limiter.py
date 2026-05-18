"""brain/rate_limiter.py — Action rate limiting and loop detection."""

import time
from collections import deque

_MAX_ACTIONS_PER_SEC = 5
_MIN_PAUSE_SEC       = 0.2
_LOOP_WINDOW_SEC     = 5
_LOOP_THRESHOLD      = 3   # same action N times in _LOOP_WINDOW_SEC → blocked

_action_log: deque = deque(maxlen=100)


def check_rate(action: str) -> bool:
    """
    Returns True if the action is allowed to proceed, False if rate-limited.

    Enforces two guards:
      1. Minimum pause between any two actions (_MIN_PAUSE_SEC).
      2. Loop detection — same action repeated >= _LOOP_THRESHOLD times
         within _LOOP_WINDOW_SEC is blocked (prevents runaway automation).
    """
    now = time.monotonic()

    # Enforce minimum inter-action pause
    if _action_log:
        elapsed = now - _action_log[-1]["ts"]
        if elapsed < _MIN_PAUSE_SEC:
            time.sleep(_MIN_PAUSE_SEC - elapsed)
            now = time.monotonic()

    # Loop detection — count how many times this exact action fired recently
    recent_same = sum(
        1 for a in _action_log
        if now - a["ts"] < _LOOP_WINDOW_SEC and a["action"] == action
    )
    if recent_same >= _LOOP_THRESHOLD:
        from log import log
        log(f"[RATE-LIMITER] loop detected: '{action}' fired {recent_same}x "
            f"in {_LOOP_WINDOW_SEC}s — blocked")
        return False

    _action_log.append({"action": action, "ts": now})
    return True


def reset():
    """Clear action history. Call between distinct user-initiated sessions."""
    _action_log.clear()
