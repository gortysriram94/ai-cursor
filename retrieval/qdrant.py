"""
retrieval/qdrant.py — Qdrant vector store retrieval provider.

Requires: pip install qdrant-client
Embedding: nomic-embed-text via Ollama (retrieval/embeddings.py)
"""
from log import log
from .base import Document, RetrievalProvider
from .embeddings import embed

_QDRANT = False
try:
    from qdrant_client import QdrantClient
    _QDRANT = True
except ImportError:
    pass


class QdrantProvider(RetrievalProvider):
    name = "Qdrant"

    def __init__(
        self,
        url:             str,
        collection_name: str,
        api_key:         str = "",
        name:            str = "Qdrant",
    ):
        self.url             = url
        self.collection_name = collection_name
        self.api_key         = api_key
        self.name            = name
        self._client         = None

    def _get_client(self):
        if self._client is not None:
            return self._client
        try:
            from qdrant_client import QdrantClient
            self._client = QdrantClient(url=self.url, api_key=self.api_key or None)
            return self._client
        except Exception as e:
            log(f"[Qdrant] client init failed: {e}")
            return None

    def is_available(self) -> bool:
        return _QDRANT and bool(self.url) and bool(self.collection_name)

    def retrieve(self, query: str, top_k: int = 5, context_type: str = "") -> list[Document]:
        if not self.is_available():
            return []
        vec    = embed(query)
        client = self._get_client()
        if not client or not vec:
            return []
        try:
            from qdrant_client.models import ScoredPoint
            results = client.search(
                collection_name = self.collection_name,
                query_vector    = vec,
                limit           = top_k,
                with_payload    = True,
            )
            docs = []
            for hit in results:
                payload = hit.payload or {}
                content = payload.get("content") or payload.get("text") or ""
                if not content:
                    continue
                docs.append(Document(
                    content = content,
                    source  = payload.get("source") or payload.get("url", ""),
                    title   = payload.get("title", ""),
                    score   = float(hit.score),
                ))
            log(f"[Qdrant] '{query[:50]}' → {len(docs)} results")
            return docs
        except Exception as e:
            log(f"[Qdrant] query failed: {e}")
            return []
