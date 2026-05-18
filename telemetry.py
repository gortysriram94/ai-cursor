"""
telemetry.py — Crash reporting (Sentry) + usage analytics (PostHog).

Both are opt-in, off by default.
Enable: Settings → Setup → "Help improve AI Cursor" toggle.

Sentry:  captures exceptions from critical code paths + uncaught crashes.
PostHog: anonymous usage events — no PII, no text content, no keystrokes.
"""

import sys
import threading
from log import log


# ── Anonymous ID ──────────────────────────────────────────────────────────────

def _get_anon_id() -> str:
    """Stable random ID for this install. Never contains PII."""
    try:
        from config import PREFS_FILE
        import json, uuid
        data = {}
        if PREFS_FILE.exists():
            data = json.loads(PREFS_FILE.read_text(encoding="utf-8"))
        if not data.get("anon_id"):
            data["anon_id"] = str(uuid.uuid4())
            PREFS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return data["anon_id"]
    except Exception:
        return "unknown"


# ── Opt-in preference ─────────────────────────────────────────────────────────

def is_telemetry_enabled() -> bool:
    try:
        from config import PREFS_FILE
        import json
        if PREFS_FILE.exists():
            return json.loads(
                PREFS_FILE.read_text(encoding="utf-8")
            ).get("telemetry_enabled", False)
    except Exception:
        pass
    return False


def set_telemetry_enabled(enabled: bool) -> None:
    try:
        from config import PREFS_FILE
        import json
        data = {}
        if PREFS_FILE.exists():
            data = json.loads(PREFS_FILE.read_text(encoding="utf-8"))
        data["telemetry_enabled"] = enabled
        PREFS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
        if enabled:
            init_sentry()
        log(f"[TELEMETRY] {'enabled' if enabled else 'disabled'}")
    except Exception as e:
        log(f"[TELEMETRY] save preference failed: {e}")


# ── Sentry ────────────────────────────────────────────────────────────────────

_sentry_ready = False


def init_sentry() -> None:
    global _sentry_ready
    if _sentry_ready or not is_telemetry_enabled():
        return
    try:
        from config import SENTRY_DSN
        if not SENTRY_DSN:
            return
        import sentry_sdk
        from _version import APP_VERSION
        sentry_sdk.init(
            dsn=SENTRY_DSN,
            release=APP_VERSION,
            traces_sample_rate=0.0,   # errors only — no performance tracing
            send_default_pii=False,
        )
        _sentry_ready = True
        log("[TELEMETRY] Sentry initialized")
    except Exception as e:
        log(f"[TELEMETRY] Sentry init failed: {e}")


def capture_exception(e: Exception, context: str = "") -> None:
    """Report a handled exception. Silent no-op if telemetry is off."""
    if not is_telemetry_enabled() or not _sentry_ready:
        return
    try:
        import sentry_sdk
        with sentry_sdk.push_scope() as scope:
            if context:
                scope.set_tag("context", context)
            sentry_sdk.capture_exception(e)
    except Exception:
        pass


# ── PostHog ───────────────────────────────────────────────────────────────────

_ph_client = None
_ph_lock   = threading.Lock()


def _get_posthog():
    global _ph_client
    if not is_telemetry_enabled():
        return None
    if _ph_client is not None:
        return _ph_client
    with _ph_lock:
        if _ph_client is not None:
            return _ph_client
        try:
            from config import POSTHOG_KEY
            if not POSTHOG_KEY:
                return None
            from posthog import Posthog
            _ph_client = Posthog(
                project_api_key=POSTHOG_KEY,
                host="https://us.i.posthog.com",
                disable_geoip=True,
            )
        except Exception as e:
            log(f"[TELEMETRY] PostHog init failed: {e}")
    return _ph_client


def track(event: str, properties: dict | None = None) -> None:
    """Fire an analytics event. Non-blocking. No-op if telemetry is off."""
    def _send():
        try:
            ph = _get_posthog()
            if ph is None:
                return
            ph.capture(_get_anon_id(), event, properties or {})
        except Exception:
            pass
    threading.Thread(target=_send, daemon=True, name="ph-track").start()


# ── Funnel events ─────────────────────────────────────────────────────────────

def track_first_alt_a() -> None:
    """Fire exactly once — tracks activation (install ≠ usage)."""
    try:
        from config import PREFS_FILE
        import json
        data = {}
        if PREFS_FILE.exists():
            data = json.loads(PREFS_FILE.read_text(encoding="utf-8"))
        if data.get("_tracked_first_alt_a"):
            return
        data["_tracked_first_alt_a"] = True
        PREFS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
        track("first_alt_a")
    except Exception:
        pass


def track_second_use() -> None:
    """Fire once on the second calendar day of use — tracks day-1 retention."""
    try:
        from config import PREFS_FILE
        import json, time
        data = {}
        if PREFS_FILE.exists():
            data = json.loads(PREFS_FILE.read_text(encoding="utf-8"))
        if data.get("_tracked_second_use"):
            return
        today = time.strftime("%Y-%m-%d")
        first_day = data.get("_first_use_day")
        if not first_day:
            data["_first_use_day"] = today
            PREFS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
            return
        if today != first_day:
            data["_tracked_second_use"] = True
            PREFS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
            track("second_use")
    except Exception:
        pass
