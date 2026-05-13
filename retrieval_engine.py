"""
retrieval_engine.py — orchestrates the full RAG retrieval pipeline.

Entry point: retrieve_for_action(text, action, bundle, status_cb)

Pipeline:
  1. Master switch  — rag_enabled pref + action gate
  2. Opt-out check  — per-context opt-out pref
  3. Privacy check  — sensitive pattern scan
  4. Cache check    — session cache keyed by (context, entity, action)
  5. Entity pick    — select best entity from bundle
  6. Query build    — Layer 1 + Layer 2 templates merged
  7. Fetch          — parallel queries with speed-tier timeout
  8. Paywall filter — drop documents behind login walls
  9. Relevance gate — keyword overlap threshold
  10. Dedup + rank  — sort by score, cap at top_k
  11. Cache store   — save for this session
  12. Log event     — record in rag_log ring buffer
"""
import re
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from log import log
from rag_config import (
    should_retrieve, get_strategy,
    QUERY_PLANNER_MAX_QUERIES,
    SPEED_TIER_TIMEOUTS,
    RELEVANCE_MIN_SCORE, RELEVANCE_MIN_CHARS, RELEVANCE_MAX_TOKENS,
    RELEVANCE_STOP_WORDS,
)
from privacy_check import is_safe_to_retrieve, sensitive_patterns_found
from retrieval.base import Document


# ── Session cache ─────────────────────────────────────────────────────────────
# Keyed by "{context_type}:{entity}:{action}" → (docs, timestamp)
_cache: dict[str, tuple[list[Document], float]] = {}


def _cache_key(entity: str, context_type: str, action: str) -> str:
    return f"{context_type}:{entity.lower()}:{action}"


def _cache_get(key: str, freshness_secs: int) -> list[Document] | None:
    if key not in _cache:
        return None
    docs, ts = _cache[key]
    if time.time() - ts > freshness_secs:
        del _cache[key]
        return None
    return list(docs)


def _cache_set(key: str, docs: list[Document]) -> None:
    _cache[key] = (list(docs), time.time())


def clear_cache() -> None:
    _cache.clear()


# ── Paywall patterns ──────────────────────────────────────────────────────────
_PAYWALL_PHRASES = [
    "subscribe to read", "subscription required", "members only",
    "login to continue", "sign in to read", "premium content",
    "create an account to", "this content is for subscribers",
    "paywall", "register to access",
]


def _is_paywalled(content: str) -> bool:
    """True if content looks like a paywall block (short + paywall language)."""
    if len(content) > 500:
        return False    # Long content is probably real even with a subscription footer
    lower = content.lower()
    return any(p in lower for p in _PAYWALL_PHRASES)


# ── Public entry point ────────────────────────────────────────────────────────

def retrieve_for_action(
    text: str,
    action: str,
    bundle,
    status_cb=None,
) -> list[Document]:
    """
    Run the full RAG pipeline for one user action.
    Returns a (possibly empty) list of relevant Documents.
    Never raises — returns [] on any failure.
    """
    t0 = time.monotonic()
    try:
        result, event = _retrieve(text, action, bundle, status_cb, t0)
        import rag_log
        rag_log.record(event)
        return result
    except Exception as e:
        log(f"[RAG] unexpected error: {e}")
        return []


# ── Pipeline ──────────────────────────────────────────────────────────────────

def _retrieve(text, action, bundle, status_cb, t0):
    import rag_log
    from rag_config import freshness_for

    context_type = getattr(bundle, "market", None) or getattr(bundle, "context_type", "generic")
    confidence   = getattr(bundle, "confidence", 0.0)
    entities     = getattr(bundle, "entities", []) or []

    def _skip(reason: str):
        event = rag_log.RagEvent(
            timestamp=time.time(), context_type=context_type, entity="",
            action=action, queries=[], docs_fetched=0, docs_kept=0,
            latency_ms=0, cache_hit=False, skipped=True, skip_reason=reason,
        )
        return [], event

    # 1. Master switch
    try:
        from storage import load_rag_enabled
        if not load_rag_enabled():
            return _skip("master_off")
    except Exception:
        pass

    # 2. Action gate
    if not should_retrieve(action, context_type, confidence):
        return _skip("action_gate")

    # 3. Per-context opt-out
    try:
        from storage import load_rag_opt_out
        if context_type in load_rag_opt_out():
            return _skip("opt_out")
    except Exception:
        pass

    # 4. Privacy check
    if not is_safe_to_retrieve(text, entities):
        matched = sensitive_patterns_found(text, entities)
        log(f"[RAG] privacy block — {len(matched)} pattern(s)")
        return _skip("privacy")

    # 5. Entity pick
    strategy = get_strategy(context_type)
    entity   = _pick_entity(entities, strategy.primary_entity_type)
    if not entity:
        return _skip("no_entity")

    # 6. Query build
    queries = _build_queries(entity, action, strategy)
    if not queries:
        return _skip("no_queries")

    # 7. Cache check
    freshness = freshness_for(context_type)
    ckey      = _cache_key(entity, context_type, action)
    cached    = _cache_get(ckey, freshness)
    if cached is not None:
        log(f"[RAG] cache hit for {ckey!r} ({len(cached)} docs)")
        event = rag_log.RagEvent(
            timestamp=time.time(), context_type=context_type, entity=entity,
            action=action, queries=queries, docs_fetched=len(cached),
            docs_kept=len(cached),
            latency_ms=int((time.monotonic() - t0) * 1000),
            cache_hit=True, skipped=False, skip_reason="", docs=cached,
        )
        return cached, event

    if status_cb:
        try: status_cb("searching sources…")
        except Exception: pass

    # 8. Fetch with timeout
    timeout  = SPEED_TIER_TIMEOUTS.get(strategy.speed_tier, 5)
    raw_docs = _fetch_parallel(queries, strategy.top_k, context_type, timeout)

    # 9. Paywall filter + relevance gate
    keywords = _keywords(entity + " " + " ".join(queries[:2]))
    passed   = [
        doc for doc in raw_docs
        if not _is_paywalled(doc.content)
        and len(doc.content) >= RELEVANCE_MIN_CHARS
        and _overlap(doc.content, keywords) >= RELEVANCE_MIN_SCORE
    ]

    # 10. Dedup + rank
    seen:   set[str]       = set()
    unique: list[Document] = []
    for doc in sorted(passed, key=lambda d: d.score, reverse=True):
        if doc.source not in seen:
            seen.add(doc.source)
            doc.content = doc.content[: RELEVANCE_MAX_TOKENS * 4]
            unique.append(doc)

    result = unique[: strategy.top_k]
    log(f"[RAG] {len(raw_docs)} fetched | {len(passed)} passed gate | "
        f"{len(result)} injected | entity={entity!r}")

    # 11. Cache store
    if result:
        _cache_set(ckey, result)

    if status_cb:
        try:
            n = len(result)
            status_cb(f"found {n} source{'s' if n != 1 else ''}…" if n else "")
        except Exception:
            pass

    # 12. Build log event
    event = rag_log.RagEvent(
        timestamp=time.time(), context_type=context_type, entity=entity,
        action=action, queries=queries, docs_fetched=len(raw_docs),
        docs_kept=len(result),
        latency_ms=int((time.monotonic() - t0) * 1000),
        cache_hit=False, skipped=False, skip_reason="", docs=result,
    )
    return result, event


# ── Query planner ─────────────────────────────────────────────────────────────

def _build_queries(entity: str, action: str, strategy) -> list[str]:
    def _expand(templates):
        return [t.replace("{entity}", entity).strip() for t in templates if t.strip()]

    layer1 = _expand(strategy.layer1_action_map.get(action, []))
    layer2 = _expand(strategy.layer2_templates)

    seen, merged = set(), []
    for q in layer1 + layer2:
        norm = q.lower()
        if norm not in seen:
            seen.add(norm)
            merged.append(q)
    return merged[:QUERY_PLANNER_MAX_QUERIES]


# ── Parallel fetch ────────────────────────────────────────────────────────────

def _fetch_parallel(queries, top_k, context_type, timeout):
    from retrieval.registry import retrieve as _retrieve_one

    all_docs: list[Document] = []
    lock = threading.Lock()

    def _run(q):
        docs = _retrieve_one(q, top_k=top_k, context_type=context_type)
        with lock:
            all_docs.extend(docs)

    with ThreadPoolExecutor(max_workers=min(len(queries), 4)) as pool:
        futures = [pool.submit(_run, q) for q in queries]
        for f in as_completed(futures, timeout=timeout):
            try: f.result()
            except Exception as e: log(f"[RAG] query failed: {e}")

    return all_docs


# ── Entity picker ─────────────────────────────────────────────────────────────

_TICKER_RE  = re.compile(r"^[A-Z]{1,5}$")
_ADDR_WORDS = {"street", "st", "ave", "avenue", "blvd", "rd", "drive", "dr",
               "lane", "ln", "way", "place", "pl", "court", "ct"}


def _pick_entity(entities: list, primary_type: str) -> str:
    if not entities:
        return ""
    str_entities = [str(e).strip() for e in entities if str(e).strip()]
    if not str_entities:
        return ""
    if primary_type == "ticker":
        for e in str_entities:
            if _TICKER_RE.match(e):
                return e
    if primary_type == "address":
        for e in str_entities:
            words = e.lower().split()
            if any(w in _ADDR_WORDS for w in words) or (len(words) >= 3 and words[0].isdigit()):
                return e
    return str_entities[0]


# ── Relevance gate ────────────────────────────────────────────────────────────

def _keywords(text: str) -> frozenset:
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    return frozenset(t for t in tokens if t not in RELEVANCE_STOP_WORDS and len(t) > 2)


def _overlap(content: str, keywords: frozenset) -> float:
    if not keywords:
        return 0.0
    lower   = content.lower()
    matched = sum(1 for kw in keywords if kw in lower)
    return matched / len(keywords)
