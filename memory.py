"""
memory.py — Compact record storage and destination routing.

Destinations:
  internal  → pushpa_memory.json (default, always works)
  folder    → user-chosen directory, one .md file per compact
  notion    → Notion API page append (requires API key + page ID)
  obsidian  → Obsidian vault folder, one .md file per compact
"""

import json
import time
from pathlib import Path
from typing import Optional

from config import APP_DIR
from log import log
from brain.compact import CompactRecord

MEMORY_FILE = APP_DIR / "pushpa_memory.json"
MAX_MEMORY  = 200   # keep last N compacts in internal store


# ── Internal store ────────────────────────────────────────────────────────────

def load_compacts() -> list[dict]:
    try:
        if MEMORY_FILE.exists():
            return json.loads(MEMORY_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return []


def save_compact_internal(record: CompactRecord) -> bool:
    try:
        compacts = load_compacts()
        compacts.insert(0, record.to_dict())
        MEMORY_FILE.write_text(
            json.dumps(compacts[:MAX_MEMORY], indent=2), encoding="utf-8"
        )
        return True
    except Exception as e:
        log(f"[MEMORY] Internal save failed: {e}")
        return False


# ── Destination routing ───────────────────────────────────────────────────────

def route_compact(record: CompactRecord, destination: str,
                  destination_path: str = "") -> bool:
    """
    Save a compact to the specified destination.
    Always also saves to internal store as a backup.
    Returns True on success.
    """
    # Always persist internally
    save_compact_internal(record)

    if destination == "internal":
        record.saved = True
        return True

    if destination == "folder":
        return _save_to_folder(record, destination_path)

    if destination == "obsidian":
        return _save_to_obsidian(record, destination_path)

    if destination == "notion":
        return _save_to_notion(record, destination_path)

    return True


# ── Folder / Obsidian (both write markdown files) ─────────────────────────────

def _save_to_folder(record: CompactRecord, folder_path: str) -> bool:
    if not folder_path:
        log("[MEMORY] folder destination set but no path configured")
        return False
    try:
        folder = Path(folder_path)
        folder.mkdir(parents=True, exist_ok=True)
        fname = _safe_filename(record)
        (folder / fname).write_text(record.to_markdown(), encoding="utf-8")
        log(f"[MEMORY] Saved to folder: {fname}")
        return True
    except Exception as e:
        log(f"[MEMORY] Folder save failed: {e}")
        return False


def _save_to_obsidian(record: CompactRecord, vault_path: str) -> bool:
    if not vault_path:
        log("[MEMORY] Obsidian destination set but no vault path configured")
        return False
    # Obsidian vault is just a folder — same as folder save
    return _save_to_folder(record, vault_path)


def _safe_filename(record: CompactRecord) -> str:
    date   = time.strftime("%Y-%m-%d", time.localtime(record.timestamp))
    task   = record.task[:40].replace("/", "-").replace("\\", "-")
    # Remove characters not valid in filenames
    for ch in ':*?"<>|':
        task = task.replace(ch, "")
    return f"{date} {task}.md"


# ── Notion ────────────────────────────────────────────────────────────────────

def _save_to_notion(record: CompactRecord, config_json: str) -> bool:
    """
    Append a compact as a new block to a Notion page.
    config_json: '{"api_key": "...", "page_id": "..."}'
    """
    try:
        cfg = json.loads(config_json) if config_json else {}
        api_key = cfg.get("api_key", "")
        page_id = cfg.get("page_id", "")
        if not api_key or not page_id:
            log("[MEMORY] Notion: missing api_key or page_id")
            return False

        import requests
        headers = {
            "Authorization":  f"Bearer {api_key}",
            "Content-Type":   "application/json",
            "Notion-Version": "2022-06-28",
        }
        payload = {
            "children": [
                {
                    "object": "block",
                    "type":   "heading_3",
                    "heading_3": {
                        "rich_text": [{"type": "text",
                                       "text": {"content": record.task}}]
                    },
                },
                {
                    "object": "block",
                    "type":   "paragraph",
                    "paragraph": {
                        "rich_text": [{"type": "text", "text": {
                            "content": (
                                f"App: {record.app}  ·  {record.ts_display}\n"
                                f"{record.context}\n{record.outcome}"
                            ).strip()
                        }}]
                    },
                },
                {"object": "block", "type": "divider", "divider": {}},
            ]
        }
        res = requests.patch(
            f"https://api.notion.com/v1/blocks/{page_id}/children",
            headers=headers, json=payload, timeout=10,
        )
        if res.status_code in (200, 201):
            log(f"[MEMORY] Saved to Notion page {page_id}")
            return True
        log(f"[MEMORY] Notion error {res.status_code}: {res.text[:200]}")
        return False
    except Exception as e:
        log(f"[MEMORY] Notion save failed: {e}")
        return False


# ── Context feed-back (brain reads recent compacts for continuity) ─────────────

def get_recent_compacts(app_name: str = "", limit: int = 5) -> list[dict]:
    """
    Return recent compacts, optionally filtered by app.
    Used by the brain to inform new context builds.
    """
    compacts = load_compacts()
    if app_name:
        compacts = [c for c in compacts
                    if c.get("app", "").lower() == app_name.lower()]
    return compacts[:limit]


def get_relevant_compacts(
    content_type: str = "",
    market: str = "",
    entities: list | None = None,
    limit: int = 5,
    max_age_days: int = 30,
) -> list[dict]:
    """
    Return compacts weighted by recency + content_type match + entity overlap.
    Decays confidence on older compacts. More relevant than flat get_recent_compacts().
    """
    import time as _t
    import math

    all_compacts = load_compacts()
    now = _t.time()
    cutoff = now - (max_age_days * 86400)
    entity_set = {str(e).lower() for e in (entities or [])}

    scored: list[tuple[float, dict]] = []
    for c in all_compacts:
        ts = c.get("timestamp", 0)
        if ts < cutoff:
            continue

        score = 0.0

        # Recency — exponential decay, half-life = 7 days
        age_days = (now - ts) / 86400
        score += math.exp(-age_days / 7)

        # Content type match
        if content_type and c.get("content_type", "") == content_type:
            score += 0.8
        elif market and c.get("market", "") == market:
            score += 0.4

        # Entity overlap
        c_entities = {str(e).lower() for e in c.get("entities", [])}
        overlap = len(entity_set & c_entities)
        score += overlap * 0.3

        scored.append((score, c))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in scored[:limit]]
