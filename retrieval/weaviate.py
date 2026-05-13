"""
retrieval/weaviate.py — Weaviate vector store retrieval provider.

Requires: pip install weaviate-client
Embedding: nomic-embed-text via Ollama (retrieval/embeddings.py)
"""
from log import log
from .base import Document, RetrievalProvider
from .embeddings import embed

_WEAVIATE = False
try:
    import weaviate
    _WEAVIATE = True
except ImportError:
    pass


class WeaviateProvider(RetrievalProvider):
    name = "Weaviate"

    def __init__(
        self,
        url:        str,
        class_name: str,
        api_key:    str = "",
        name:       str = "Weaviate",
    ):
        self.url        = url
        self.class_name = class_name
        self.api_key    = api_key
        self.name       = name
        self._client    = None

    def _get_client(self):
        if self._client is not None:
            return self._client
        try:
            import weaviate
            auth = weaviate.auth.AuthApiKey(self.api_key) if self.api_key else None
            self._client = weaviate.Client(url=self.url, auth_client_secret=auth)
            return self._client
        except Exception as e:
            log(f"[Weaviate] client init failed: {e}")
            return None

    def is_available(self) -> bool:
        return _WEAVIATE and bool(self.url) and bool(self.class_name)

    def retrieve(self, query: str, top_k: int = 5, context_type: str = "") -> list[Document]:
        if not self.is_available():
            return []
        vec    = embed(query)
        client = self._get_client()
        if not client:
            return []
        try:
            near_vec = {"vector": vec} if vec else None
            builder  = (
                client.query
                .get(self.class_name, ["content", "title", "source", "url"])
                .with_limit(top_k)
            )
            if near_vec:
                builder = builder.with_near_vector(near_vec)
            else:
                builder = builder.with_bm25(query=query, properties=["content"])

            result = builder.with_additional(["distance"]).do()
            raw    = result.get("data", {}).get("Get", {}).get(self.class_name, [])
            docs   = []
            for item in raw:
                content = item.get("content") or item.get("text") or ""
                if not content:
                    continue
                dist  = item.get("_additional", {}).get("distance", 1.0)
                docs.append(Document(
                    content = content,
                    source  = item.get("source") or item.get("url", ""),
                    title   = item.get("title", ""),
                    score   = max(0.0, 1.0 - float(dist)),
                ))
            log(f"[Weaviate] '{query[:50]}' → {len(docs)} results")
            return docs
        except Exception as e:
            log(f"[Weaviate] query failed: {e}")
            return []
