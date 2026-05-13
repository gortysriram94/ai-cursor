"""
storage.py — history, prefs, style memory, hotkey config (load/save functions).
"""

import json
import time
import threading

from config import (
    HISTORY_FILE, PREFS_FILE, STYLE_FILE, HOTKEYS_FILE,
    DEFAULT_HOTKEYS, _MOD_BITS, _VK_MAP,
    MAX_HISTORY, MAX_STYLE_SAMPLES, MIN_SAMPLES_FOR_PROFILE,
)
from log import log


# ── History ───────────────────────────────────────────────────────────────────

def load_history() -> list:
    try:
        if HISTORY_FILE.exists():
            return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return []


def save_history(app_name: str, action: str, result: str, tone: str):
    try:
        history = load_history()
        history.insert(0, {
            "ts":     time.strftime("%b %d  %H:%M"),
            "app":    app_name or "Unknown",
            "action": action,
            "result": result,
            "tone":   tone,
        })
        HISTORY_FILE.write_text(
            json.dumps(history[:MAX_HISTORY], indent=2), encoding="utf-8"
        )
    except Exception as e:
        log(f"[HISTORY] Save failed: {e}")


# ── Style memory ──────────────────────────────────────────────────────────────

def load_style_data() -> dict:
    try:
        if STYLE_FILE.exists():
            return json.loads(STYLE_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {"samples": [], "profile": "", "sample_count": 0}


def get_style_profile() -> str:
    return load_style_data().get("profile", "")


def save_style_sample(text: str, context: str):
    """Called on every Insert — builds up style memory silently."""
    if len(text.strip()) < 30:
        return
    try:
        data = load_style_data()
        data["samples"].insert(0, {
            "text":    text.strip()[:600],
            "context": context,
            "ts":      time.strftime("%Y-%m-%d %H:%M"),
        })
        data["samples"]      = data["samples"][:MAX_STYLE_SAMPLES]
        data["sample_count"] = len(data["samples"])
        STYLE_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
        log(f"[STYLE] Sample saved ({data['sample_count']} total)")

        count = data["sample_count"]
        if count >= MIN_SAMPLES_FOR_PROFILE and (
            count % 5 == 0 or not data.get("profile")
        ):
            threading.Thread(target=_synthesize_style_profile, daemon=True).start()
    except Exception as e:
        log(f"[STYLE] Save failed: {e}")


def _synthesize_style_profile():
    """AI call to distil writing samples into a reusable style description."""
    # Import here to avoid circular dependency (ai imports storage)
    from ai import _call_ai_simple

    data    = load_style_data()
    samples = data.get("samples", [])[:10]
    if len(samples) < MIN_SAMPLES_FOR_PROFILE:
        return

    excerpts = "\n\n---\n\n".join(s["text"] for s in samples)
    prompt = (
        "Analyse these writing samples — they are all written by the same person.\n"
        "Describe their writing style in 5-7 specific, actionable bullet points.\n"
        "Cover: sentence length, vocabulary level, formality, how they open messages, "
        "how they close, any recurring phrases or patterns, punctuation habits.\n"
        "Be specific — e.g. 'Uses short sentences under 15 words' not 'writes concisely'.\n\n"
        f"Samples:\n\n{excerpts}\n\n"
        "Return only the numbered bullet list. No preamble."
    )
    try:
        result = _call_ai_simple(prompt, max_tokens=400, timeout=30)
        if result:
            data["profile"]              = result
            data["profile_generated_at"] = time.strftime("%Y-%m-%d")
            STYLE_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
            log(f"[STYLE] Profile synthesised from {len(samples)} samples")
    except Exception as e:
        log(f"[STYLE] Synthesis failed: {e}")


# ── Preferences (per-app tone memory) ────────────────────────────────────────

def load_prefs() -> dict:
    try:
        if PREFS_FILE.exists():
            return json.loads(PREFS_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def save_pref(app_name: str, key: str, value: str):
    if not app_name:
        return
    try:
        prefs = load_prefs()
        prefs.setdefault(app_name, {})[key] = value
        PREFS_FILE.write_text(json.dumps(prefs, indent=2), encoding="utf-8")
    except Exception as e:
        log(f"[PREFS] Save failed: {e}")


def get_pref(app_name: str, key: str, default: str = "") -> str:
    try:
        return load_prefs().get(app_name, {}).get(key, default)
    except Exception:
        return default


# ── Market preference ─────────────────────────────────────────────────────────

def load_user_market() -> str:
    try:
        prefs = json.loads(PREFS_FILE.read_text(encoding="utf-8")) if PREFS_FILE.exists() else {}
        return prefs.get("market", "auto")
    except Exception:
        return "auto"


def save_user_market(market: str):
    try:
        prefs = json.loads(PREFS_FILE.read_text(encoding="utf-8")) if PREFS_FILE.exists() else {}
        prefs["market"] = market
        PREFS_FILE.write_text(json.dumps(prefs, indent=2), encoding="utf-8")
    except Exception:
        pass


# ── Hover highlight preference ────────────────────────────────────────────────

def load_hover_highlight() -> bool:
    try:
        prefs = json.loads(PREFS_FILE.read_text(encoding="utf-8")) if PREFS_FILE.exists() else {}
        return bool(prefs.get("hover_highlight", False))
    except Exception:
        return False


def save_hover_highlight(enabled: bool):
    try:
        prefs = json.loads(PREFS_FILE.read_text(encoding="utf-8")) if PREFS_FILE.exists() else {}
        prefs["hover_highlight"] = enabled
        PREFS_FILE.write_text(json.dumps(prefs, indent=2), encoding="utf-8")
    except Exception:
        pass


# ── Flame cursor preference ───────────────────────────────────────────────────

def load_flame_cursor() -> bool:
    try:
        prefs = json.loads(PREFS_FILE.read_text(encoding="utf-8")) if PREFS_FILE.exists() else {}
        return bool(prefs.get("flame_cursor", True))  # on by default
    except Exception:
        return True


def save_flame_cursor(enabled: bool):
    try:
        prefs = json.loads(PREFS_FILE.read_text(encoding="utf-8")) if PREFS_FILE.exists() else {}
        prefs["flame_cursor"] = enabled
        PREFS_FILE.write_text(json.dumps(prefs, indent=2), encoding="utf-8")
    except Exception:
        pass


# ── Compact destination preferences ──────────────────────────────────────────

def load_compact_destination() -> str:
    """Returns the default compact destination key: 'internal' | 'folder' | 'notion' | 'obsidian'."""
    try:
        prefs = json.loads(PREFS_FILE.read_text(encoding="utf-8")) if PREFS_FILE.exists() else {}
        return prefs.get("compact_destination", "internal")
    except Exception:
        return "internal"


def save_compact_destination(dest: str):
    try:
        prefs = json.loads(PREFS_FILE.read_text(encoding="utf-8")) if PREFS_FILE.exists() else {}
        prefs["compact_destination"] = dest
        PREFS_FILE.write_text(json.dumps(prefs, indent=2), encoding="utf-8")
    except Exception as e:
        log(f"[PREFS] compact_destination save failed: {e}")


def load_compact_destination_path() -> str:
    """Returns the folder/vault/notion config string for the current destination."""
    try:
        prefs = json.loads(PREFS_FILE.read_text(encoding="utf-8")) if PREFS_FILE.exists() else {}
        return prefs.get("compact_destination_path", "")
    except Exception:
        return ""


def save_compact_destination_path(path: str):
    try:
        prefs = json.loads(PREFS_FILE.read_text(encoding="utf-8")) if PREFS_FILE.exists() else {}
        prefs["compact_destination_path"] = path
        PREFS_FILE.write_text(json.dumps(prefs, indent=2), encoding="utf-8")
    except Exception as e:
        log(f"[PREFS] compact_destination_path save failed: {e}")


# ── RAG opt-out ──────────────────────────────────────────────────────────────

def load_rag_opt_out() -> set:
    """Return set of context_type strings that have web retrieval disabled."""
    try:
        prefs = json.loads(PREFS_FILE.read_text(encoding="utf-8")) if PREFS_FILE.exists() else {}
        return set(prefs.get("rag_opt_out", []))
    except Exception:
        return set()


def save_rag_opt_out(opt_out: set) -> None:
    try:
        prefs = json.loads(PREFS_FILE.read_text(encoding="utf-8")) if PREFS_FILE.exists() else {}
        prefs["rag_opt_out"] = sorted(opt_out)
        PREFS_FILE.write_text(json.dumps(prefs, indent=2), encoding="utf-8")
    except Exception as e:
        log(f"[PREFS] rag opt-out save failed: {e}")


def load_rag_enabled() -> bool:
    """Master switch — False disables all web retrieval."""
    try:
        prefs = json.loads(PREFS_FILE.read_text(encoding="utf-8")) if PREFS_FILE.exists() else {}
        return bool(prefs.get("rag_enabled", True))
    except Exception:
        return True


def save_rag_enabled(enabled: bool) -> None:
    try:
        prefs = json.loads(PREFS_FILE.read_text(encoding="utf-8")) if PREFS_FILE.exists() else {}
        prefs["rag_enabled"] = enabled
        PREFS_FILE.write_text(json.dumps(prefs, indent=2), encoding="utf-8")
    except Exception as e:
        log(f"[PREFS] rag_enabled save failed: {e}")


# ── Hotkeys ───────────────────────────────────────────────────────────────────

def load_hotkeys() -> dict:
    try:
        if HOTKEYS_FILE.exists():
            saved = json.loads(HOTKEYS_FILE.read_text(encoding="utf-8"))
            return {**DEFAULT_HOTKEYS, **saved}
    except Exception:
        pass
    return dict(DEFAULT_HOTKEYS)


def save_hotkeys(hotkeys: dict):
    try:
        HOTKEYS_FILE.write_text(json.dumps(hotkeys, indent=2), encoding="utf-8")
    except Exception as e:
        log(f"[HOTKEYS] Save failed: {e}")


def parse_hotkey(s: str) -> tuple[int, int]:
    """'ctrl+shift+a' → (mod_flags | MOD_NOREPEAT, vk_code). (0,0) on failure."""
    MOD_NOREPEAT = 0x4000
    parts = [p.strip().lower() for p in s.split("+")]
    mods, key = 0, None
    for p in parts:
        if p in _MOD_BITS:
            mods |= _MOD_BITS[p]
        elif p in _VK_MAP:
            key = _VK_MAP[p]
    return (mods | MOD_NOREPEAT, key) if key else (0, 0)


def format_hotkey(s: str) -> str:
    """'ctrl+shift+a' → 'Ctrl+Shift+A'"""
    if not s:
        return "—"
    return "+".join(p.capitalize() for p in s.split("+"))
