"""
state.py — shared mutable globals that cross module boundaries.
Import and mutate these directly; do NOT reassign the containers themselves.
"""

import subprocess
import threading
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from brain.context_brain import WorkingContext

# ── Hover detection state (legacy — kept for hover highlight) ─────────────────

_hover_state = {
    "text": "",
    "rect": None,
    "type": "unknown",
}
_last_trigger_rect = [None]


# ── Menu state ────────────────────────────────────────────────────────────────

menu_open = False


# ── Brain state ───────────────────────────────────────────────────────────────

# Written by ContextBrain thread, read by main thread and UI.
# Python GIL makes simple assignment/read safe without explicit locking.

working_context: "WorkingContext | None" = None
context_ready:   bool = False

# Set by ContextBrain when a task completes. Consumed (set to None) by main.py
# tick loop once the compact notification is shown.
compact_pending: "CompactRecord | None" = None

# Set True while the form fill controller is open — prevents double-launch
form_fill_active: bool = False

# Set True by platform layer when RegisterHotKey fails (key in use by another process)
hotkey_registration_failed: bool = False

# ── Diagnostics (written by ai.py, read by debug overlay) ────────────────────

last_ai_latency_ms:  int   = 0       # duration of last AI call in ms
last_ai_provider:    str   = "none"  # "NVIDIA" | "Ollama" | "none"
last_ai_fallback:    bool  = False   # True when primary provider failed over
ai_active_count:     int   = 0       # number of in-flight AI streaming calls
last_target_hwnd:    int   = 0       # last hwnd captured at hotkey press
_pre_insert_clipboard: str = ""      # clipboard content saved before insert overwrite


# ── Session stats (written by log.py, read by log.py on exit) ─────────────────

_log_stats = {
    "actions":  0,
    "inserts":  0,
    "errors":   0,
    "provider": "none",
}
_stats_lock = threading.Lock()


def _bump(key: str) -> None:
    """Thread-safe increment for _log_stats counters."""
    with _stats_lock:
        _log_stats[key] += 1


# ── Process log lock ──────────────────────────────────────────────────────────
# Guards append/pop (ai.py background threads) vs clear/iterate (dashboard main thread).
_process_log_lock = threading.Lock()

# ── Proactive cache lock ───────────────────────────────────────────────────────
# Guards the check-evict-reserve sequence in brain/proactive.py.
_proactive_lock = threading.Lock()


# ── Scroll-map / section navigation state ─────────────────────────────────────

page_sections:        list = []   # list[Section] — current page segmentation
current_section_idx:  int  = -1  # index of section currently at top of viewport

# ── AI provider state ─────────────────────────────────────────────────────────

_ollama_proc: subprocess.Popen | None = None

# ── First-run / model download ────────────────────────────────────────────────
# Set True by setup_ollama() when models need downloading on first launch.
is_first_run: bool = False
# Keyed by model name → {pct, mb, tot, text, done, error}
model_dl_status: dict = {}

# ── Model capability ─────────────────────────────────────────────────────────
# Set True by registry when only the bundled 0.5b starter is available.
# Used by ui/result.py to show a progress screen instead of running the model.
only_bundled_model: bool = False

# ── Pending update ────────────────────────────────────────────────────────────
# Set by startup update check so the dashboard banner shows instantly.
pending_update: dict | None = None   # {"version": "x.y.z", "url": "..."}

# ── Process log ───────────────────────────────────────────────────────────────
# Each entry: {id, timestamp, date, action, app, input, output, provider, duration_ms, status}
# status: "running" | "done" | "error"
process_log: list = []

# ── Proactive result cache ────────────────────────────────────────────────────
# Keyed by content hash (md5 of first 400 chars of text).
# Each entry: {action, result, content_type, timestamp, entities}
# Set by proactive generation queue, consumed by menu/result window.
proactive_cache: dict = {}
