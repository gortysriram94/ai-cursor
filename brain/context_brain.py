"""
brain/context_brain.py — Always-running context building loop.

Consumes Observations from the PerceptionThread.
Maintains a WorkingContext that evolves continuously — never static.

Two-stage pipeline per observation:
  1. Instant classification (rule-based, no LLM) — updates state immediately
  2. LLM enrichment (local Ollama)       — refines situation + entities

Task completion detection:
  When the app changes or context shifts significantly, the brain checks
  whether the previous context represents a completed task worth compacting.
  If so, it puts a CompactRecord on state.compact_pending for the UI to pick up.
"""

import hashlib
import time
import queue
import threading
from dataclasses import dataclass, field
from copy import deepcopy

from log import log
import state
from context import classify_market, MARKET_CONTEXTS, _detect_context_type
from brain.signals import extract_signals, ContentSignals
from brain.sections import detect_sections, find_current_section


# ── Working context ────────────────────────────────────────────────────────────

@dataclass
class WorkingContext:
    app_name:     str   = ""
    window_title: str   = ""
    market:       str   = "generic"   # vertical for system prompt (sales, finance, …)
    context_type: str   = "generic"   # UI context for action buttons (email, chat, social, …)
    situation:    str   = ""
    entities:     list  = field(default_factory=list)
    summary:      str   = ""
    confidence:   float = 0.0
    raw_text:     str   = ""
    signals:      "ContentSignals | None" = None   # fast deterministic signals
    sections:     list  = field(default_factory=list)   # list[Section] from brain.sections
    ready:        bool  = False
    last_updated: float = 0.0


# ── Brain ──────────────────────────────────────────────────────────────────────

class ContextBrain:
    """
    Processes observations and maintains a live WorkingContext.

    The context is never static — each new observation refines the picture.
    Task boundaries trigger compact generation in a background thread so
    the brain loop is never blocked.
    """

    MIN_TEXT_FOR_LLM  = 80    # chars — skip LLM enrichment below this
    # A task must have been active for at least this long before we compact it
    MIN_TASK_DURATION = 30    # seconds

    _ENRICH_CACHE_TTL = 90   # seconds before forcing a re-enrich for the same content

    def __init__(self, obs_queue: queue.Queue):
        self._q               = obs_queue
        self._running         = False
        self._thread: threading.Thread | None = None
        self._ctx             = WorkingContext()
        self._task_start      = time.time()   # when current task began
        self._last_enrich_key = ""            # app|text_hash
        self._last_enrich_ts  = 0.0           # monotonic time of last enrich call

    def start(self):
        self._running = True
        self._thread  = threading.Thread(
            target=self._loop, daemon=True, name="context_brain")
        self._thread.start()
        log("[BRAIN] started")

    def stop(self):
        self._running = False

    # ── Main loop ──────────────────────────────────────────────────────────────

    def _loop(self):
        while self._running:
            try:
                obs = self._q.get(timeout=1.0)
                self._process(obs)
            except queue.Empty:
                continue
            except Exception as e:
                log(f"[BRAIN] error: {e}")

    # ── Process one observation ────────────────────────────────────────────────

    def _process(self, obs):
        # Stage 1 — instant rule-based classification + signal extraction
        # Compute market once here; pass to _is_task_boundary to avoid a duplicate call
        lookup       = f"{obs.app_name} {obs.window_title}"
        market, _    = classify_market(lookup, obs.visible_text[:500])
        context_type = _detect_context_type(obs.app_name, obs.window_title)
        signals      = extract_signals(obs.visible_text)
        sections     = detect_sections(obs.visible_text, obs.app_name, obs.window_title)

        prev_ctx    = deepcopy(self._ctx) if self._ctx.app_name else self._ctx
        is_new_task = self._is_task_boundary(obs, prev_ctx, market)

        self._ctx.app_name     = obs.app_name
        self._ctx.window_title = obs.window_title
        self._ctx.market       = market
        self._ctx.context_type = context_type
        self._ctx.signals      = signals
        self._ctx.sections     = sections
        self._ctx.raw_text     = obs.visible_text
        self._ctx.last_updated = obs.timestamp
        self._ctx.ready        = False

        # Keep global section state in sync so the minimap can read it
        state.page_sections = sections
        cur = find_current_section(sections, obs.visible_text)
        if cur >= 0:
            state.current_section_idx = cur

        # Push basic context immediately — indicator shows "building"
        state.working_context = self._ctx
        state.context_ready   = False

        if is_new_task:
            self._task_start = obs.timestamp
            # Compact the previous task in background — never blocks the loop
            duration = int(obs.timestamp - self._task_start)
            threading.Thread(
                target=self._try_compact,
                args=(prev_ctx, duration),
                daemon=True,
            ).start()

        # Stage 2 — LLM enrichment (with content-hash cache to avoid redundant calls)
        if len(obs.visible_text.strip()) >= self.MIN_TEXT_FOR_LLM:
            # Skip enrichment when content and app haven't meaningfully changed
            # and we already have a confident context that hasn't gone stale.
            _text_hash   = hashlib.md5(obs.visible_text[:400].encode()).hexdigest()[:10]
            _enrich_key  = f"{obs.app_name}|{_text_hash}"
            _now         = time.monotonic()
            _cache_valid = (
                _enrich_key == self._last_enrich_key
                and self._ctx.confidence >= 0.5
                and (_now - self._last_enrich_ts) < self._ENRICH_CACHE_TTL
            )
            if _cache_valid:
                self._ctx.ready   = True
                state.working_context = self._ctx
                state.context_ready   = True
            else:
                self._last_enrich_key = _enrich_key
                self._last_enrich_ts  = _now
                self._enrich(obs, market)
        else:
            self._ctx.situation  = f"Using {obs.app_name}"
            self._ctx.confidence = 0.3
            self._ctx.ready      = True
            state.working_context = self._ctx
            state.context_ready   = True

    # ── Task boundary detection ────────────────────────────────────────────────

    def _is_task_boundary(self, obs, prev: WorkingContext, new_market: str) -> bool:
        """
        Returns True when the user appears to have moved to a new task.
        `new_market` is pre-computed by _process() — no duplicate classify_market call.
        """
        if not prev.app_name:
            return False

        elapsed = time.time() - self._task_start

        if obs.app_name != prev.app_name and elapsed >= self.MIN_TASK_DURATION:
            return True

        if new_market != prev.market and new_market != "generic" and elapsed >= self.MIN_TASK_DURATION:
            return True

        return False

    # ── Compact generation ─────────────────────────────────────────────────────

    def _try_compact(self, prev_ctx: WorkingContext, duration_s: int):
        """
        Generate a CompactRecord for the completed task and place it on
        state.compact_pending.  The UI (main.py tick loop) will pick it up
        and show the notification.
        """
        from brain.compact import generate_compact

        record = generate_compact(prev_ctx, duration_s=duration_s)
        if record:
            state.compact_pending = record
            log(f"[BRAIN] compact ready — {record.task[:60]}")

    # ── LLM enrichment ────────────────────────────────────────────────────────

    def _enrich(self, obs, market: str):
        from ai import call_context_builder

        market_ctx  = MARKET_CONTEXTS.get(market)
        market_hint = market_ctx.instructions[0] if market_ctx else ""

        result = call_context_builder(
            app_name     = obs.app_name,
            window_title = obs.window_title,
            market_hint  = market_hint,
            text         = obs.visible_text[:3000],
            current_ctx  = {
                "situation": self._ctx.situation,
                "entities":  self._ctx.entities,
            },
            signals      = self._ctx.signals,
        )

        if result:
            self._ctx.situation  = result.get("situation", self._ctx.situation)
            self._ctx.entities   = result.get("entities", [])
            self._ctx.summary    = result.get("summary", "")
            self._ctx.confidence = float(result.get("confidence", 0.7))
        else:
            self._ctx.situation  = obs.window_title or f"Using {obs.app_name}"
            self._ctx.confidence = 0.35

        self._ctx.ready       = True
        state.working_context = self._ctx
        state.context_ready   = True
        # Redact PII from log — never log raw emails, phones, card numbers
        from security import redact_for_log
        log(f"[BRAIN] ready ({self._ctx.market}) — "
            f"{redact_for_log(self._ctx.situation[:70])}")
