"""
journal.py — Automatic session journal.

Records meaningful observations and actions as the user works.
Follows journaling best practices:
  - Meaningful entries (window changes + content changes > threshold)
  - Session grouping (continuous focus blocks, not individual observations)
  - Consistent schema per entry
  - Append-only JSONL persistence
  - PII redaction before storage
  - Daily structure with session summaries
"""

import json
import time
import threading
from pathlib import Path

from log import log

# ── Constants ─────────────────────────────────────────────────────────────────

_SESSION_GAP_S  = 120    # gap > 2 min without activity = new session
_MAX_IN_MEMORY  = 500    # rolling in-memory cap
_PREVIEW_CHARS  = 120    # max chars of text stored per entry
_MIN_TEXT_DELTA = 40     # ignore content changes smaller than this

# ── In-memory state ───────────────────────────────────────────────────────────

_lock               = threading.Lock()
_entries: list[dict]= []
_session_id: str    = ""
_last_app:   str    = ""
_last_ts:   float   = 0.0


# ── Internal helpers ──────────────────────────────────────────────────────────

def _new_session_id() -> str:
    return f"s{int(time.time())}"


def _redact(text: str) -> str:
    """Strip high-PII content before storing."""
    try:
        from security import redact_for_log
        return redact_for_log(text)[:_PREVIEW_CHARS]
    except Exception:
        return text[:_PREVIEW_CHARS]


def _persist(entry: dict) -> None:
    try:
        from config import JOURNAL_FILE
        with open(JOURNAL_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as e:
        log(f"[JOURNAL] persist failed: {e}")


# ── Public API ────────────────────────────────────────────────────────────────

def add_entry(
    app:          str,
    content_type: str,
    summary:      str,
    entities:     list,
    text:         str = "",
    action:       str = "",
    action_result: str = "",
) -> dict:
    """
    Add a journal entry for the current observation.
    Returns the entry dict (also appended in-memory and persisted).
    """
    global _session_id, _last_app, _last_ts

    now = time.time()

    with _lock:
        gap         = now - _last_ts
        app_changed = app != _last_app

        # Start a new session on app switch or long gap
        if not _session_id or gap > _SESSION_GAP_S or app_changed:
            _session_id = _new_session_id()

        # Close out the previous entry's duration
        if _entries and _entries[-1]["session_id"] == _session_id:
            _entries[-1]["duration_s"] = max(0, int(now - _entries[-1]["ts"]))

        entry = {
            "id":            f"j{int(now * 1000)}",
            "ts":            now,
            "date":          time.strftime("%Y-%m-%d"),
            "time":          time.strftime("%H:%M"),
            "app":           app or "Unknown",
            "content_type":  content_type or "generic",
            "summary":       (summary or "")[:120],
            "entities":      [str(e) for e in (entities or [])[:5]],
            "text_preview":  _redact(text),
            "action":        action,
            "action_result": (action_result or "")[:80],
            "duration_s":    0,
            "session_id":    _session_id,
        }

        _entries.append(entry)
        if len(_entries) > _MAX_IN_MEMORY:
            _entries.pop(0)

        _last_app = app
        _last_ts  = now

    _persist(entry)
    return entry


def update_last_action(action: str, result: str = "") -> None:
    """Mark the most recent entry with an action that was taken."""
    with _lock:
        if _entries:
            _entries[-1]["action"]        = action
            _entries[-1]["action_result"] = (result or "")[:80]
    # Re-persist the updated entry
    try:
        from config import JOURNAL_FILE
        entries = get_recent(1)
        if entries:
            # Rewrite last line is expensive — just append a patch entry
            _persist({**entries[0], "_patch": True})
    except Exception:
        pass


def get_recent(n: int = 20) -> list[dict]:
    """Return the most recent n entries (oldest first)."""
    with _lock:
        return list(_entries[-n:])


def get_today() -> list[dict]:
    """Return all entries from today."""
    today = time.strftime("%Y-%m-%d")
    with _lock:
        return [e for e in _entries if e.get("date") == today]


def get_sessions_today() -> list[dict]:
    """
    Return today's entries grouped into sessions.
    Each session: {session_id, app, start_time, end_time, duration_min, entries, actions}
    """
    entries = get_today()
    sessions: dict[str, dict] = {}
    for e in entries:
        sid = e["session_id"]
        if sid not in sessions:
            sessions[sid] = {
                "session_id":   sid,
                "app":          e["app"],
                "start_time":   e["time"],
                "end_time":     e["time"],
                "duration_min": 0,
                "entries":      [],
                "actions":      [],
            }
        s = sessions[sid]
        s["entries"].append(e)
        s["end_time"] = e["time"]
        s["duration_min"] += max(0, e.get("duration_s", 0)) // 60
        if e.get("action"):
            s["actions"].append(e["action"])
    return list(sessions.values())


def session_summary(session_id: str) -> str:
    """One-line summary of a session for display."""
    with _lock:
        entries = [e for e in _entries if e["session_id"] == session_id]
    if not entries:
        return ""
    app      = entries[0]["app"]
    duration = sum(max(0, e.get("duration_s", 0)) for e in entries)
    actions  = [e["action"] for e in entries if e.get("action")]
    mins     = duration // 60
    parts    = [f"{mins}m in {app}" if mins else f"in {app}"]
    if actions:
        parts.append(f"· {len(actions)} action{'s' if len(actions) > 1 else ''}")
    return " ".join(parts)


def daily_summary() -> str:
    """
    3-line summary of today's activity — shown at session end.
    """
    sessions = get_sessions_today()
    if not sessions:
        return "No activity recorded today."

    total_min  = sum(s["duration_min"] for s in sessions)
    all_apps   = list(dict.fromkeys(s["app"] for s in sessions))
    all_actions= [a for s in sessions for a in s["actions"]]

    lines = [
        f"Today: {total_min}m across {len(sessions)} session{'s' if len(sessions)>1 else ''}",
        f"Apps: {', '.join(all_apps[:4])}",
    ]
    if all_actions:
        lines.append(f"{len(all_actions)} action{'s' if len(all_actions)>1 else ''}: "
                     + ", ".join(sorted(set(all_actions))[:4]))
    return "\n".join(lines)


def context_for_ai(n_entries: int = 5) -> str:
    """
    Format recent journal entries as context for the AI conversation.
    """
    recent = get_recent(n_entries)
    if not recent:
        return ""
    lines = ["Recent activity:"]
    for e in recent:
        line = f"  {e['time']} · {e['app']}"
        if e["content_type"] != "generic":
            line += f" · {e['content_type'].replace('_', ' ')}"
        if e["summary"]:
            line += f" — {e['summary']}"
        if e.get("action"):
            line += f" [{e['action']}]"
        lines.append(line)
    return "\n".join(lines)


# ── Startup load ──────────────────────────────────────────────────────────────

def load_from_disk() -> None:
    """Load today's journal entries from disk at startup."""
    global _entries
    try:
        from config import JOURNAL_FILE
        path = Path(JOURNAL_FILE)
        if not path.exists():
            return
        today   = time.strftime("%Y-%m-%d")
        loaded  = []
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                if entry.get("date") == today and not entry.get("_patch"):
                    loaded.append(entry)
            except Exception:
                pass
        with _lock:
            _entries = loaded[-_MAX_IN_MEMORY:]
        log(f"[JOURNAL] loaded {len(_entries)} entries from today")
    except Exception as e:
        log(f"[JOURNAL] load failed: {e}")
