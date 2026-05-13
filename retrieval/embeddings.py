"""
retrieval/embeddings.py — shared embedding utility for vector DB providers.

Embeds text via Ollama's nomic-embed-text model (pulled separately).
Returns None if Ollama is unavailable or the model isn't pulled.

Usage:
    from retrieval.embeddings import embed
    vec = embed("AAPL earnings beat expectations")
"""
import requests
from log import log

_MODEL = "nomic-embed-text"


def embed(text: str, max_chars: int = 500) -> list[float] | None:
    """
    Embed text using Ollama. Returns a float list or None on failure.
    Truncates input to max_chars to keep latency low.
    """
    from config import OLLAMA_PORT
    text = text[:max_chars].strip()
    if not text:
        return None
    for port in [11434, OLLAMA_PORT]:
        try:
            res = requests.post(
                f"http://localhost:{port}/api/embeddings",
                json={"model": _MODEL, "prompt": text},
                timeout=10,
            )
            if res.status_code == 200:
                vec = res.json().get("embedding")
                if vec:
                    return vec
        except Exception:
            continue
    log(f"[EMBED] nomic-embed-text unavailable — run: ollama pull {_MODEL}")
    return None


def embed_or_skip(text: str) -> list[float] | None:
    """Alias with a clear name: returns None (skip this doc) if embedding fails."""
    return embed(text)
