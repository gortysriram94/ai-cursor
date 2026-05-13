"""
retrieval/chroma.py — local ChromaDB vector store provider (items 32-33).

Requires: pip install chromadb
Embedding: nomic-embed-text via Ollama (pulled on first use)

If chromadb is not installed this module loads without error — ChromaProvider
simply reports is_available() = False and retrieve() returns [].
"""
import json
import time

from log import log
from .base import Document, RetrievalProvider

_CHROMA_AVAILABLE = False
try:
    import chromadb          # noqa: F401
    _CHROMA_AVAILABLE = True
except ImportError:
    pass

# Embedding model pulled via Ollama. Must be available before ChromaProvider
# will embed queries. Pull with: ollama pull nomic-embed-text
_EMBED_MODEL = "nomic-embed-text"
_COLLECTION  = "aicursor_cache"


class ChromaProvider(RetrievalProvider):
    """
    Local semantic cache — stores previously retrieved documents as embeddings
    so the same entity+context combination doesn't re-fetch from the web.

    Also serves as the local vector store for enterprise RAG setups where the
    user wants to index their own documents.
    """
    name = "ChromaDB"

    def __init__(self, persist_dir: str = ""):
        self._persist_dir = persist_dir
        self._client      = None
        self._collection  = None

    def _init(self) -> bool:
        if self._collection is not None:
            return True
        if not _CHROMA_AVAILABLE:
            return False
        try:
            import chromadb
            from config import APP_DIR
            path = self._persist_dir or str(APP_DIR / "vectordb")
            self._client = chromadb.PersistentClient(path=path)
            self._collection = self._client.get_or_create_collection(
                name=_COLLECTION,
                metadata={"hnsw:space": "cosine"},
            )
            return True
        except Exception as e:
            log(f"[ChromaDB] init failed: {e}")
            return False

    def is_available(self) -> bool:
        if not _CHROMA_AVAILABLE:
            return False
        return self._init()

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        context_type: str = "",
    ) -> list[Document]:
        if not self._init():
            return []
        embedding = _embed(query)
        if not embedding:
            return []
        try:
            results = self._collection.query(
                query_embeddings=[embedding],
                n_results=min(top_k, self._collection.count()),
                where={"context_type": context_type} if context_type else None,
            )
            docs = []
            for i, doc_id in enumerate(results["ids"][0]):
                meta    = results["metadatas"][0][i]
                content = results["documents"][0][i]
                dist    = results["distances"][0][i] if results.get("distances") else 0.0
                docs.append(Document(
                    content    = content,
                    source     = meta.get("source", doc_id),
                    title      = meta.get("title", ""),
                    score      = max(0.0, 1.0 - dist),   # cosine dist → similarity
                    fetched_at = float(meta.get("fetched_at", time.time())),
                ))
            return docs
        except Exception as e:
            log(f"[ChromaDB] retrieve failed: {e}")
            return []

    def upsert(self, documents: list[Document]) -> None:
        """Store documents as embeddings for future semantic lookup."""
        if not self._init() or not documents:
            return
        ids, texts, metas, embeddings = [], [], [], []
        for doc in documents:
            emb = _embed(doc.content[:500])
            if not emb:
                continue
            doc_id = f"{hash(doc.source)}_{int(doc.fetched_at)}"
            ids.append(doc_id)
            texts.append(doc.content[:2000])
            metas.append({
                "source":     doc.source,
                "title":      doc.title,
                "fetched_at": str(doc.fetched_at),
            })
            embeddings.append(emb)
        if ids:
            try:
                self._collection.upsert(
                    ids=ids, documents=texts,
                    metadatas=metas, embeddings=embeddings,
                )
                log(f"[ChromaDB] upserted {len(ids)} documents")
            except Exception as e:
                log(f"[ChromaDB] upsert failed: {e}")


def _embed(text: str) -> list[float] | None:
    from .embeddings import embed
    return embed(text)
