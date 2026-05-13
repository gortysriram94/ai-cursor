"""
retrieval/registry.py — manages the ordered list of active retrieval providers.

Default: Jina (web search).
Enterprise providers (Pinecone, Weaviate, Qdrant, etc.) are inserted at position 0
via add_provider(), so they take priority over generic web search.
"""
import threading
from log import log
from .base import Document, RetrievalProvider


_providers: list[RetrievalProvider] = []
_lock = threading.Lock()


def _build_defaults() -> None:
    from .jina import JinaProvider
    _providers.append(JinaProvider())


def get_providers() -> list[RetrievalProvider]:
    if not _providers:
        _build_defaults()
    return _providers


def add_provider(provider: RetrievalProvider, position: int = 0) -> None:
    """Insert a provider at the given position (0 = highest priority)."""
    get_providers()
    _providers.insert(position, provider)


def remove_provider(name: str) -> None:
    """Remove all providers with the given name."""
    get_providers()
    _providers[:] = [p for p in _providers if p.name != name]


def retrieve(
    query: str,
    top_k: int = 5,
    context_type: str = "",
) -> list[Document]:
    """
    Query all available providers that support the given context.
    Results are ordered: enterprise providers first (position 0), then Jina.
    Stops after the first provider returns results — use retrieve_all() to merge.
    Returns [] if no provider is available or all fail.
    """
    for p in get_providers():
        if not p.supports_context_type(context_type):
            continue
        if not p.is_available():
            continue
        docs = p.retrieve(query, top_k=top_k, context_type=context_type)
        if docs:
            log(f"[Retrieval] {p.name} returned {len(docs)} docs for '{query[:50]}'")
            return docs
    log(f"[Retrieval] No provider returned results for '{query[:50]}'")
    return []


def retrieve_all(
    query: str,
    top_k_per_provider: int = 3,
    context_type: str = "",
) -> list[Document]:
    """
    Query ALL available providers in parallel and merge results.
    Useful when you want both enterprise vector DB results and web search.
    Deduplicates by source URL.
    """
    candidates = [
        p for p in get_providers()
        if p.supports_context_type(context_type) and p.is_available()
    ]
    if not candidates:
        return []

    all_docs: list[Document] = []
    seen_sources: set[str]   = set()
    lock = threading.Lock()

    def _fetch(provider: RetrievalProvider) -> None:
        docs = provider.retrieve(query, top_k=top_k_per_provider, context_type=context_type)
        with lock:
            for doc in docs:
                if doc.source not in seen_sources:
                    seen_sources.add(doc.source)
                    all_docs.append(doc)

    threads = [threading.Thread(target=_fetch, args=(p,), daemon=True) for p in candidates]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    all_docs.sort(key=lambda d: d.score, reverse=True)
    log(f"[Retrieval] retrieve_all: {len(all_docs)} unique docs from {len(candidates)} providers")
    return all_docs


def read_urls(urls: list[str]) -> list[Document]:
    """Full page read via the first provider that supports read()."""
    for p in get_providers():
        if p.is_available():
            docs = p.read(urls)
            if docs:
                return docs
    return []
