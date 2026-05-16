"""
brain/proactive.py — Proactive background generation.

Called by context_brain and hover when high-confidence content is detected.
Stores result in state.proactive_cache keyed by MD5 hash of first 400 chars.

Cache entry schema:
  {action, result, content_type, timestamp, entities, rule_violations, status}
  status: "generating" | "ready" | "error"
"""

import hashlib
import threading
import time

from log import log
import state

CONF_THRESHOLD = 0.75
CACHE_TTL      = 300   # seconds — skip regeneration of successful results
ERROR_RETRY    = 60    # seconds — retry failed generations after this window
CACHE_MAX_SIZE = 200   # evict oldest entries beyond this count
MAX_TEXT       = 3000  # chars fed to LLM


def maybe_generate(
    text: str,
    app_name: str,
    content_type: str,
    ctype_conf: float,
    signals=None,
    entities: list | None = None,
) -> None:
    """Trigger proactive generation if conditions are met. Non-blocking."""
    if ctype_conf < CONF_THRESHOLD or content_type == "generic":
        return
    if state.only_bundled_model:
        return
    if len(text.strip()) < 80:
        return

    content_hash = hashlib.md5(text[:400].encode()).hexdigest()[:12]

    # Lock covers check + eviction + reservation atomically so no two threads
    # can both pass the TTL check and spawn duplicate _generate threads.
    with state._proactive_lock:
        cached = state.proactive_cache.get(content_hash)
        if cached:
            status = cached.get("status", "")
            age    = time.time() - cached.get("timestamp", 0)
            if status == "generating":
                return
            if status == "ready" and age < CACHE_TTL:
                return
            if status == "error" and age < ERROR_RETRY:
                return

        # Evict oldest entries if cache is too large
        if len(state.proactive_cache) >= CACHE_MAX_SIZE:
            oldest = sorted(state.proactive_cache.items(),
                            key=lambda kv: kv[1].get("timestamp", 0))
            for k, _ in oldest[:50]:
                del state.proactive_cache[k]

        # Reserve slot — within the lock so no second thread slips through
        state.proactive_cache[content_hash] = {
            "action":          "",
            "result":          "",
            "content_type":    content_type,
            "timestamp":       time.time(),
            "entities":        list(entities or []),
            "rule_violations": [],
            "status":          "generating",
        }

    threading.Thread(
        target=_generate,
        args=(content_hash, text, app_name, content_type, signals, list(entities or [])),
        daemon=True,
        name=f"proactive-{content_hash[:6]}",
    ).start()


def _generate(
    content_hash: str,
    text: str,
    app_name: str,
    content_type: str,
    signals,
    entities: list,
) -> None:
    try:
        from context import detect_action
        from prompts import build_prompt
        from brain.context_bundle import ContextBundle
        from providers.registry import complete_with_fallback

        action, _ = detect_action(text, content_type=content_type, signals=signals)

        jina_ctx  = _fetch_jina_context(content_type, entities)
        full_text = text[:MAX_TEXT]
        if jina_ctx:
            full_text = jina_ctx + "\n\n---\n\n" + full_text

        bundle = ContextBundle(
            app_name     = app_name,
            content_type = content_type,
            context_type = content_type,
            entities     = entities,
        )
        prompt   = build_prompt(full_text, action, tone="direct", bundle=bundle)
        messages = [{"role": "user", "content": prompt}]
        result   = complete_with_fallback(messages, max_tokens=600, timeout=45)

        rule_violations = []
        if content_type in ("form", "legal_contract"):
            rule_violations = _speculate_rules(app_name, text)

        if content_hash in state.proactive_cache:
            state.proactive_cache[content_hash].update({
                "action":          action,
                "result":          result,
                "entities":        entities,
                "rule_violations": rule_violations,
                "status":          "ready" if result else "error",
            })
            log(f"[PROACTIVE] '{action}' ready for {content_type} ({len(result)} chars)")

    except Exception as e:
        log(f"[PROACTIVE] generation failed: {e}")
        if content_hash in state.proactive_cache:
            state.proactive_cache[content_hash]["status"] = "error"


# ── Jina context fetch ────────────────────────────────────────────────────────

_JINA_TYPES = {
    "earnings_release", "property_listing", "job_posting",
    "product_listing", "research_report", "news_article",
}

_JINA_QUERY_TEMPLATES = {
    "earnings_release": "{entity} earnings results revenue profit",
    "property_listing": "{entity} property market value comparable sales",
    "job_posting":      "{entity} company culture salary range reviews",
    "product_listing":  "{entity} reviews price comparison specifications",
    "research_report":  "{entity} latest research findings analysis",
    "news_article":     "{entity} latest news background context",
}


def _fetch_jina_context(content_type: str, entities: list) -> str:
    if content_type not in _JINA_TYPES or not entities:
        return ""
    try:
        from retrieval.jina import JinaProvider
        entity   = str(entities[0]).strip()
        template = _JINA_QUERY_TEMPLATES.get(content_type, "{entity}")
        query    = template.replace("{entity}", entity)
        docs     = JinaProvider().retrieve(query, top_k=3, context_type=content_type)
        if not docs:
            return ""
        parts = [f"[{doc.title or doc.source}]\n{doc.content[:400]}" for doc in docs]
        return "Live context:\n" + "\n\n".join(parts)
    except Exception as e:
        log(f"[PROACTIVE] Jina fetch failed: {e}")
        return ""


# ── Speculative rule check ────────────────────────────────────────────────────

def _speculate_rules(app_name: str, text: str) -> list[dict]:
    """Scan visible text for field labels and cross-reference with stored rules."""
    try:
        import re
        from rules import get_rules_for_app
        rules = get_rules_for_app(app_name)
        if not rules:
            return []

        visible_labels: set[str] = set()
        for line in text.splitlines():
            line = line.strip()
            if line.endswith(":"):
                visible_labels.add(line[:-1].strip().lower())
            m = re.match(r"^([\w\s]{2,30})\s*[:=]\s*(.*)$", line)
            if m:
                visible_labels.add(m.group(1).strip().lower())

        return [
            {"field": r.field_label, "rule": r.description, "severity": r.severity}
            for r in rules
            if r.field_label.lower() in visible_labels
        ]
    except Exception as e:
        log(f"[PROACTIVE] rule speculation failed: {e}")
        return []
