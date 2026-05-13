"""
brain/context_bundle.py — Thin container for brain-context params.

Replaces the recurring 6-parameter group:
  (app_name, context_type, situation, entities, confidence, signals)
that previously spread across show_result_window / call_ai_streaming / build_prompt.
"""

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from brain.signals import ContentSignals
    from brain.context_brain import WorkingContext


@dataclass
class ContextBundle:
    app_name:     str   = ""
    context_type: str   = "generic"
    market:       str   = "generic"
    situation:    str   = ""
    entities:      list  = field(default_factory=list)
    confidence:    float = 0.0
    signals:       "ContentSignals | None" = None
    retrieved_docs: list = field(default_factory=list)   # list[Document] — injected by retrieval_engine

    @classmethod
    def from_working_context(cls, ctx: "WorkingContext") -> "ContextBundle":
        return cls(
            app_name     = ctx.app_name,
            context_type = ctx.context_type,
            market       = ctx.market,
            situation    = ctx.situation,
            entities     = ctx.entities,
            confidence   = ctx.confidence,
            signals      = ctx.signals,
        )

    @classmethod
    def empty(cls) -> "ContextBundle":
        return cls()
