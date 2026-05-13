"""
retrieval/jina.py — Jina AI retrieval provider.

retrieve()  → s.jina.ai search, returns snippets as Documents (fast, <3s)
read()      → r.jina.ai reader, returns full page content (deep tier, ~10-15s/URL)

Works without an API key (rate limited to ~200 req/day).
Set JINA_API_KEY in .env.local for higher rate limits.
"""
import threading
import urllib.parse
import requests

from config import JINA_API_KEY, JINA_SEARCH_URL
from log import log
from .base import Document, RetrievalProvider


def _headers() -> dict:
    """Build request headers. Authorization is optional — Jina works without it."""
    h = {"Accept": "application/json"}
    if JINA_API_KEY:
        h["Authorization"] = f"Bearer {JINA_API_KEY}"
    return h


class JinaProvider(RetrievalProvider):
    name = "Jina"

    def is_available(self) -> bool:
        return True   # keyless access works; key just raises the rate limit

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        context_type: str = "",
    ) -> list[Document]:
        """Search via Jina s.jina.ai and return snippets as Documents."""
        import time as _time
        url = JINA_SEARCH_URL + urllib.parse.quote(query)
        for attempt in range(2):
            try:
                res = requests.get(url, headers=_headers(), timeout=8)
                if res.status_code == 429:
                    if attempt == 0:
                        log("[Jina] rate limited — retrying in 2s")
                        _time.sleep(2)
                        continue
                    log("[Jina] rate limited on retry — skipping")
                    return []
                res.raise_for_status()
                results = res.json().get("data", [])
                docs = []
                for item in results[:top_k]:
                    content = (
                        item.get("description") or
                        item.get("content") or
                        item.get("text") or ""
                    ).strip()
                    if not content:
                        continue
                    docs.append(Document(
                        content = content,
                        source  = item.get("url", ""),
                        title   = item.get("title", ""),
                        score   = item.get("score", 1.0),
                    ))
                log(f"[Jina] search '{query[:50]}' → {len(docs)} results")
                return docs
            except Exception as e:
                log(f"[Jina] search failed: {e}")
                return []
        return []

    def read(self, urls: list[str]) -> list[Document]:
        """Fetch full page content for each URL via Jina r.jina.ai."""
        if not urls:
            return []

        docs: list[Document] = []
        lock = threading.Lock()

        def _fetch(url: str) -> None:
            try:
                res = requests.get(
                    f"https://r.jina.ai/{url}",
                    headers=_headers(),
                    timeout=15,
                )
                res.raise_for_status()
                data    = res.json().get("data", {})
                content = (data.get("content") or data.get("text") or "").strip()
                if content:
                    with lock:
                        docs.append(Document(
                            content = content,
                            source  = url,
                            title   = data.get("title", ""),
                            score   = 1.0,
                        ))
            except Exception as e:
                log(f"[Jina] read failed for {url[:60]}: {e}")

        threads = [threading.Thread(target=_fetch, args=(u,), daemon=True) for u in urls]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=20)

        log(f"[Jina] read {len(docs)}/{len(urls)} URLs successfully")
        return docs
