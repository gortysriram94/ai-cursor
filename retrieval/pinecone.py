"""
retrieval/pinecone.py — Pinecone vector store retrieval provider.

Requires: pip install pinecone-client
Embedding: nomic-embed-text via Ollama (retrieval/embeddings.py)

If pinecone is not installed, PineconeProvider loads but is_available() = False.
"""
from log import log
from .base import Document, RetrievalProvider
from .embeddings import embed

_PINECONE = False
try:
    from pinecone import Pinecone   # pinecone-client >= 3.x
    _PINECONE = True
except ImportError:
    try:
        import pinecone             # pinecone-client < 3.x
        _PINECONE = True
    except ImportError:
        pass


class PineconeProvider(RetrievalProvider):
    name = "Pinecone"

    def __init__(
        self,
        api_key:    str,
        index_name: str,
        namespace:  str = "",
        name:       str = "Pinecone",
    ):
        self.api_key    = api_key
        self.index_name = index_name
        self.namespace  = namespace
        self.name       = name
        self._index     = None

    def _get_index(self):
        if self._index is not None:
            return self._index
        try:
            from pinecone import Pinecone
            pc          = Pinecone(api_key=self.api_key)
            self._index = pc.Index(self.index_name)
            return self._index
        except Exception as e:
            log(f"[Pinecone] index init failed: {e}")
            return None

    def is_available(self) -> bool:
        return _PINECONE and bool(self.api_key) and bool(self.index_name)

    def retrieve(self, query: str, top_k: int = 5, context_type: str = "") -> list[Document]:
        if not self.is_available():
            return []
        vec = embed(query)
        if not vec:
            return []
        index = self._get_index()
        if not index:
            return []
        try:
            kwargs = {"vector": vec, "top_k": top_k, "include_metadata": True}
            if self.namespace:
                kwargs["namespace"] = self.namespace
            resp = index.query(**kwargs)
            docs = []
            for match in resp.get("matches", []):
                meta    = match.get("metadata", {})
                content = meta.get("content") or meta.get("text") or ""
                if not content:
                    continue
                docs.append(Document(
                    content = content,
                    source  = meta.get("source") or meta.get("url") or match["id"],
                    title   = meta.get("title", ""),
                    score   = float(match.get("score", 0.0)),
                ))
            log(f"[Pinecone] '{query[:50]}' → {len(docs)} results")
            return docs
        except Exception as e:
            log(f"[Pinecone] query failed: {e}")
            return []
