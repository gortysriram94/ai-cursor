"""
rag_log.py — in-memory ring buffer of RAG retrieval events.

Written by retrieval_engine.py after every pipeline run.
Read by the Dev Panel tab in the dashboard to show activity.
"""
import time
from dataclasses import dataclass, field
from collections import deque

MAX_EVENTS = 50


@dataclass
class RagEvent:
    timestamp:    float
    context_type: str
    entity:       str
    action:       str
    queries:      list[str]
    docs_fetched: int        # raw results before relevance gate
    docs_kept:    int        # after relevance gate
    latency_ms:   int
    cache_hit:    bool
    skipped:      bool       # True when gate/privacy/opt-out blocked retrieval
    skip_reason:  str        # "action_gate" | "privacy" | "opt_out" | "no_entity" | ""
    docs:         list = field(default_factory=list)   # list[Document] — injected docs

    @property
    def age_str(self) -> str:
        secs = int(time.time() - self.timestamp)
        if secs < 60:
            return f"{secs}s ago"
        if secs < 3600:
            return f"{secs // 60}m ago"
        return f"{secs // 3600}h ago"


_events: deque[RagEvent] = deque(maxlen=MAX_EVENTS)


def record(event: RagEvent) -> None:
    _events.appendleft(event)


def recent(n: int = MAX_EVENTS) -> list[RagEvent]:
    return list(_events)[:n]


def clear() -> None:
    _events.clear()
