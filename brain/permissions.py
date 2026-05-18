"""brain/permissions.py — Per-app action allow/deny lists."""

import json
from pathlib import Path

_DEFAULTS: dict[str, dict] = {
    "Chrome":  {"allow": ["reply", "summarize", "explain"],          "deny": []},
    "Outlook": {"allow": ["reply", "follow_up", "summarize"],        "deny": []},
    "SAP":     {"allow": ["analyze_queue", "batch_summary"],         "deny": ["form_fill"]},
}


def load_permissions(path: Path) -> dict:
    if not path.exists():
        return dict(_DEFAULTS)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return dict(_DEFAULTS)


def save_permissions(perms: dict, path: Path) -> None:
    try:
        path.write_text(json.dumps(perms, indent=2), encoding="utf-8")
    except Exception:
        pass


def is_allowed(app: str, action: str, perms: dict) -> bool:
    """
    Returns True if the action is permitted for this app.

    Resolution:
      1. App-specific deny list   → False
      2. App-specific allow list  → True only if action is listed
      3. No app rule              → True (permissive default)
    """
    app_perms = perms.get(app, {})
    if action in app_perms.get("deny", []):
        return False
    allow = app_perms.get("allow", [])
    if allow:
        return action in allow
    return True
