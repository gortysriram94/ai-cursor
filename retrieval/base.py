"""
retrieval/base.py — Document dataclass and RetrievalProvider abstract interface.

All retrieval backends implement retrieve() and is_available().
Optional read() provides full page content for deep-tier retrieval.
"""
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class Document:
    content: str               # extracted text (snippet or full page)
    source: str                # URL or provider-specific identifier
    title: str        = ""
    score: float      = 1.0    # relevance score from provider (0–1)
    fetched_at: float = field(default_factory=time.time)

    def is_empty(self) -> bool:
        return not self.content or not self.content.strip()

    def token_estimate(self) -> int:
        """Rough word count ÷ 0.75 — conservative token estimate."""
        return int(len(self.content.split()) / 0.75)


class RetrievalProvider(ABC):
    name: str = "unknown"

    @abstractmethod
    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        context_type: str = "",
    ) -> list[Document]:
        """
        Fast search — returns snippets or summaries.
        Should complete in under 3s.
        Never raises — returns [] on any failure.
        """

    @abstractmethod
    def is_available(self) -> bool:
        """True if this provider is configured and reachable right now."""

    def read(self, urls: list[str]) -> list[Document]:
        """
        Deep read — fetches full page content for the given URLs.
        Slower than retrieve(); intended for deep-tier contexts.
        Returns [] if not supported.
        """
        return []

    def supports_context_type(self, context_type: str) -> bool:
        """
        Return True if this provider is relevant for the given context.
        Default: handle all contexts.
        Override to restrict a provider to specific contexts
        (e.g. a trading-specific vector DB only for 'trading').
        """
        return True

    def upsert(self, documents: list[Document]) -> None:
        """
        Store documents for future retrieval (used by local vector stores).
        No-op on read-only providers.
        """
