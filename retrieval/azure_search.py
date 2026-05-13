"""
retrieval/azure_search.py — Azure AI Search retrieval provider.

No extra SDK needed — uses the Azure Search REST API directly.
Supports both keyword (BM25) and hybrid search (keyword + vector).
Vector search requires the index to have a vector field and uses
nomic-embed-text for query embedding.
"""
import requests
from log import log
from .base import Document, RetrievalProvider
from .embeddings import embed


class AzureSearchProvider(RetrievalProvider):
    name = "AzureSearch"

    def __init__(
        self,
        endpoint:    str,
        index_name:  str,
        api_key:     str,
        name:        str = "AzureSearch",
        api_version: str = "2024-02-01",
    ):
        self.endpoint    = endpoint.rstrip("/")
        self.index_name  = index_name
        self.api_key     = api_key
        self.name        = name
        self.api_version = api_version

    def is_available(self) -> bool:
        return bool(self.endpoint and self.index_name and self.api_key)

    def retrieve(self, query: str, top_k: int = 5, context_type: str = "") -> list[Document]:
        if not self.is_available():
            return []
        url     = (f"{self.endpoint}/indexes/{self.index_name}"
                   f"/docs/search?api-version={self.api_version}")
        headers = {"Content-Type": "application/json", "api-key": self.api_key}

        body: dict = {"search": query, "top": top_k, "queryType": "simple"}

        # Attempt hybrid search if embedding is available
        vec = embed(query)
        if vec:
            body["vectorQueries"] = [{
                "kind":   "vector",
                "vector": vec,
                "fields": "content_vector",   # standard field name; may vary per index
                "k":      top_k,
            }]
            body["queryType"] = "semantic"

        try:
            res = requests.post(url, headers=headers, json=body, timeout=10)
            res.raise_for_status()
            docs = []
            for item in res.json().get("value", []):
                content = item.get("content") or item.get("chunk") or ""
                if not content:
                    continue
                docs.append(Document(
                    content = content,
                    source  = item.get("url") or item.get("source") or item.get("id", ""),
                    title   = item.get("title", ""),
                    score   = float(item.get("@search.score", 1.0)),
                ))
            log(f"[AzureSearch] '{query[:50]}' → {len(docs)} results")
            return docs
        except Exception as e:
            log(f"[AzureSearch] query failed: {e}")
            return []
