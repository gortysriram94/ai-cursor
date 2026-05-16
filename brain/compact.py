"""
brain/compact.py — CompactRecord definition and LLM-based compact generation.

A compact is a structured summary of a completed task — what the user
was doing, what the outcome was, and who/what was involved.
It is generated the moment the brain detects a task boundary.
"""

import time
from dataclasses import dataclass, field, asdict


# ── Data model ─────────────────────────────────────────────────────────────────

@dataclass
class CompactRecord:
    id:         str   = ""          # unique — timestamp-based
    task:       str   = ""          # "Replied to customer complaint"
    app:        str   = ""          # "Zendesk"
    market:     str   = "generic"   # market context
    content_type: str = ""          # specific content type (earnings_release, property_listing, …)
    context:    str   = ""          # "John Mills · Order #4821 · 3 days overdue"
    outcome:    str   = ""          # "Response drafted and sent"
    entities:   list  = field(default_factory=list)
    duration_s: int   = 0           # approximate seconds spent
    timestamp:  float = field(default_factory=time.time)
    ts_display: str   = ""          # "May 11  14:32"
    destination: str  = "internal"  # "internal" | "folder" | "notion" | "obsidian"
    saved:      bool  = False

    def __post_init__(self):
        if not self.id:
            self.id = f"compact_{int(self.timestamp * 1000)}"
        if not self.ts_display:
            self.ts_display = time.strftime("%b %d  %H:%M",
                                            time.localtime(self.timestamp))

    def to_dict(self) -> dict:
        return asdict(self)

    def to_markdown(self) -> str:
        lines = [
            f"# {self.task}",
            f"**App**: {self.app}",
            f"**Date**: {self.ts_display}",
        ]
        if self.context:
            lines.append(f"**Context**: {self.context}")
        if self.outcome:
            lines.append(f"**Outcome**: {self.outcome}")
        if self.entities:
            lines.append(f"**Entities**: {', '.join(self.entities)}")
        return "\n".join(lines)


# ── LLM compact generation ────────────────────────────────────────────────────

def generate_compact(prev_ctx, duration_s: int = 0) -> "CompactRecord | None":
    """
    Given a WorkingContext that just ended, ask the local LLM to generate
    a structured compact record.  Returns None if the context wasn't
    meaningful enough to compact.
    """
    if not prev_ctx or not prev_ctx.situation:
        return None

    # Skip trivial contexts — app switching, idle browsing
    if prev_ctx.confidence < 0.4:
        return None
    if _is_trivial(prev_ctx.situation):
        return None

    result = _call_compact_llm(prev_ctx)
    if not result:
        # Fallback: build from what the brain already knows
        result = {
            "task":    prev_ctx.situation,
            "context": ", ".join(prev_ctx.entities[:4]) if prev_ctx.entities else "",
            "outcome": "",
        }

    record = CompactRecord(
        task         = result.get("task", prev_ctx.situation)[:120],
        app          = prev_ctx.app_name,
        market       = prev_ctx.market,
        content_type = getattr(prev_ctx, "content_type", ""),
        context      = result.get("context", "")[:200],
        outcome      = result.get("outcome", "")[:120],
        entities     = _safe_entities(prev_ctx.entities),
        duration_s   = duration_s,
    )
    # Trigger rule learning in background — non-blocking
    import threading as _t
    _t.Thread(
        target=_run_rule_learning,
        args=(prev_ctx.app_name,),
        daemon=True,
    ).start()
    return record


def _run_rule_learning(app_name: str):
    """Background post-compact hook: scan history for learnable patterns."""
    try:
        from brain.rule_learner import learn_from_compacts
        learn_from_compacts(app_name)
    except Exception as e:
        log(f"[COMPACT] rule learning error: {e}")


def _safe_entities(entities: list) -> list:
    """Strip raw PII values from entities before storing in a compact."""
    from security import sanitise_compact_entities
    return sanitise_compact_entities(entities[:6])


def _call_compact_llm(ctx) -> "dict | None":
    """Fast local LLM call to produce a compact summary."""
    import re, json, requests
    from config import OLLAMA_CONTEXT_MODEL, OLLAMA_PORT

    text_snippet = (ctx.raw_text or "")[:1500]
    prompt = (
        f"App: {ctx.app_name}\n"
        f"What the user was doing: {ctx.situation}\n"
        f"Key entities: {', '.join(ctx.entities[:5]) if ctx.entities else 'none'}\n"
        f"Screen content snippet:\n{text_snippet}\n\n"
        "The user just finished this task. Summarise it.\n"
        "Return ONLY valid JSON — no markdown:\n"
        '{"task":"short verb phrase describing completed task",'
        '"context":"key entities/details in one line",'
        '"outcome":"what was accomplished, if clear"}'
    )

    for port in [11434, OLLAMA_PORT]:
        try:
            res = requests.post(
                f"http://localhost:{port}/api/generate",
                json={
                    "model":   OLLAMA_CONTEXT_MODEL,
                    "prompt":  prompt,
                    "stream":  False,
                    "options": {"temperature": 0.1, "num_predict": 150},
                },
                timeout=6,
            )
            if res.status_code == 200:
                raw = res.json().get("response", "").strip()
                m = re.search(r'\{.*\}', raw, re.DOTALL)
                if m:
                    return json.loads(m.group())
        except Exception:
            pass
    return None


def _is_trivial(situation: str) -> bool:
    """Return True for situations not worth compacting."""
    low = situation.lower()
    trivial = [
        "using ", "browsing", "opened ", "switched to",
        "idle", "desktop", "explorer",
    ]
    return any(low.startswith(t) for t in trivial)
