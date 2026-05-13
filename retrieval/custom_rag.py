"""
retrieval/custom_rag.py — generic REST RAG API retrieval provider.

Calls any HTTP endpoint that accepts a query and returns a list of results.
Field names for the request and response are configurable to match
whatever schema the enterprise RAG API uses.
"""
import requests
from log import log
from .base import Document, RetrievalProvider


class CustomRAGProvider(RetrievalProvider):
    name = "CustomRAG"

    def __init__(
        self,
        url:            str,
        auth_header:    str  = "Authorization",
        auth_value:     str  = "",
        query_field:    str  = "query",
        results_field:  str  = "results",
        content_field:  str  = "content",
        source_field:   str  = "source",
        name:           str  = "CustomRAG",
    ):
        self.url           = url
        self.auth_header   = auth_header
        self.auth_value    = auth_value
        self.query_field   = query_field
        self.results_field = results_field
        self.content_field = content_field
        self.source_field  = source_field
        self.name          = name

    def is_available(self) -> bool:
        return bool(self.url)

    def retrieve(self, query: str, top_k: int = 5, context_type: str = "") -> list[Document]:
        if not self.url:
            return []
        headers = {"Content-Type": "application/json"}
        if self.auth_value:
            headers[self.auth_header] = self.auth_value

        body = {self.query_field: query, "top_k": top_k}

        try:
            res = requests.post(self.url, headers=headers, json=body, timeout=10)
            res.raise_for_status()
            data    = res.json()
            results = data if isinstance(data, list) else data.get(self.results_field, [])
            docs    = []
            for item in results[:top_k]:
                if isinstance(item, str):
                    content = item
                    source  = ""
                elif isinstance(item, dict):
                    content = item.get(self.content_field) or item.get("text") or ""
                    source  = item.get(self.source_field)  or item.get("url", "")
                else:
                    continue
                if content:
                    docs.append(Document(
                        content = content,
                        source  = source,
                        title   = item.get("title", "") if isinstance(item, dict) else "",
                        score   = float(item.get("score", 1.0)) if isinstance(item, dict) else 1.0,
                    ))
            log(f"[CustomRAG] '{query[:50]}' → {len(docs)} results")
            return docs
        except Exception as e:
            log(f"[CustomRAG] query failed: {e}")
            return []
