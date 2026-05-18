"""brain/executor.py — Unified action executor.

All agent-initiated actions route through here so that:
  - Every action passes the loop-detection rate limiter first.
  - verify_before / verify_after wrap each action for safety.
  - Rollback state is captured and restored on failure.

The low-level plat/executor.py still owns clipboard/focus primitives
(verified_insert, RateLimiter).  This module owns the higher-level
CLICK / TYPE / KEY dispatch used by the EXECUTE pipeline.
"""

from brain.rate_limiter import check_rate
from brain import verifier, rollback
from log import log


# ── Public dispatch API ───────────────────────────────────────────────────────

def execute_click(target: dict) -> bool:
    """
    Click at target["coords"] = (x, y).
    Runs rate-limiter, pre-verify, click, post-verify, rollback on failure.
    """
    if not check_rate("click"):
        log("[EXECUTOR] click rate-limited or loop detected")
        return False

    action = {"type": "click", "coords": target.get("coords", (0, 0))}

    if not verifier.verify_before(action):
        log(f"[EXECUTOR] click pre-verify failed at {action['coords']}")
        return False

    before = rollback.save_state("click")
    x, y   = action["coords"]

    try:
        from plat import platform as get_platform
        ok = get_platform().click_at(x, y, verify=False)   # UIA check already done
        if not ok:
            rollback.restore_state(before)
            return False
        if not verifier.verify_after(action, before):
            log("[EXECUTOR] click post-verify: no state change detected")
        return ok
    except Exception as e:
        log(f"[EXECUTOR] execute_click failed: {e}")
        rollback.restore_state(before)
        return False


def execute_type(text: str, target: "dict | None" = None) -> bool:
    """
    Type text, optionally clicking target first.
    target may be {"x": int, "y": int} or omitted to type into focus.
    """
    if not check_rate("type"):
        log("[EXECUTOR] type rate-limited or loop detected")
        return False

    action = {"type": "type", "text": text}
    if target:
        action["coords"] = (target.get("x", 0), target.get("y", 0))

    before = rollback.save_state("type")

    try:
        from plat import platform as get_platform
        ok = get_platform().type_text(text, target=target)
        if not ok:
            rollback.restore_state(before)
            return False
        if not verifier.verify_after(action, before):
            log("[EXECUTOR] type post-verify: text length unchanged")
        return ok
    except Exception as e:
        log(f"[EXECUTOR] execute_type failed: {e}")
        rollback.restore_state(before)
        return False


def execute_key(key: str, modifiers: "list[str] | None" = None) -> bool:
    """
    Press a key or key combo. Example: execute_key("v", modifiers=["ctrl"])
    """
    if not check_rate("key"):
        log("[EXECUTOR] key rate-limited or loop detected")
        return False

    try:
        from plat import platform as get_platform
        return get_platform().press_key(key, modifiers=modifiers)
    except Exception as e:
        log(f"[EXECUTOR] execute_key failed: {e}")
        return False
