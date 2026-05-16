"""
brain/intent_parser.py — Detect transaction intent in free-text input.

Two-stage detection:
  1. Fast keyword match — if any template keyword appears, candidate found
  2. LLM extraction     — parse structured entities from the text

Returns a TransactionIntent or None (plain question → no intent).
"""

import json
import re
from dataclasses import dataclass, field
from typing import Optional

from log import log


@dataclass
class TransactionIntent:
    transaction_type: str          # matches a key in TEMPLATES
    template_label:   str          # human label e.g. "Purchase Order"
    entities:         dict         # {"vendor": "Acme Corp", "amount": "5000", ...}
    nav_hint:         str          # navigation path for the current app
    confidence:       float        # 0-1
    raw_text:         str          # the original input


def parse_intent(text: str, app_name: str = "") -> Optional[TransactionIntent]:
    """
    Analyse text for a transaction intent.
    Returns TransactionIntent or None if the text is just a question/command.
    """
    if not text or len(text.strip()) < 5:
        return None

    # Stage 1 — keyword scan (fast, no LLM)
    candidate = _keyword_match(text)
    if not candidate:
        return None

    # Stage 2 — LLM entity extraction
    from brain.transaction_templates import get_template
    tmpl = get_template(candidate)
    if not tmpl:
        return None

    entities = _extract_entities(text, tmpl)
    # Determine navigation hint for current app
    nav = tmpl.nav_hints.get(app_name, "")
    if not nav and tmpl.nav_hints:
        # Fallback: first known nav hint
        nav = next(iter(tmpl.nav_hints.values()))

    conf = _confidence(text, tmpl, entities)

    log(f"[INTENT] detected '{candidate}' (conf={conf:.2f}) in: {text[:60]}")

    return TransactionIntent(
        transaction_type = candidate,
        template_label   = tmpl.label,
        entities         = entities,
        nav_hint         = nav,
        confidence       = conf,
        raw_text         = text,
    )


# ── Stage 1 — keyword match ────────────────────────────────────────────────────

def _keyword_match(text: str) -> Optional[str]:
    """Return the best-matching transaction_type key, or None."""
    from brain.transaction_templates import all_keywords
    text_low = text.lower()
    best_type  = None
    best_len   = 0
    for kw, ttype in all_keywords():
        if kw in text_low and len(kw) > best_len:
            best_type = ttype
            best_len  = len(kw)
    return best_type


# ── Stage 2 — LLM entity extraction ───────────────────────────────────────────

def _extract_entities(text: str, tmpl) -> dict:
    """Call local LLM to extract structured entities from the natural language input."""
    import http.client as _hc
    from config import OLLAMA_CONTEXT_MODEL, OLLAMA_PORT

    entity_keys = list(tmpl.entity_map.keys())
    key_list    = "\n".join(f'  "{k}": ""' for k in entity_keys)

    prompt = (
        f"Extract entities from this natural language transaction request.\n"
        f"Transaction type: {tmpl.label}\n"
        f"Input: \"{text}\"\n\n"
        f"Return ONLY valid JSON with these keys (empty string if not found):\n"
        f"{{\n{key_list}\n}}\n\n"
        "Rules:\n"
        "- amounts: digits only, no currency symbols\n"
        "- dates: use today's date context if relative ('tomorrow', 'next Tuesday')\n"
        "- If a value is clearly not present, use empty string\n"
    )

    body = json.dumps({
        "model":   OLLAMA_CONTEXT_MODEL,
        "prompt":  prompt,
        "stream":  False,
        "options": {"temperature": 0.05, "num_predict": 300},
    }).encode("utf-8")

    for port in [OLLAMA_PORT, 11434]:
        try:
            conn = _hc.HTTPConnection("localhost", port, timeout=8)
            conn.request("POST", "/api/generate", body=body,
                         headers={"Content-Type": "application/json"})
            resp = conn.getresponse()
            if resp.status == 200:
                raw = json.loads(resp.read()).get("response", "").strip()
                conn.close()
                m = re.search(r'\{.*\}', raw, re.DOTALL)
                if m:
                    parsed = json.loads(m.group())
                    return {k: v for k, v in parsed.items() if v}
            conn.close()
        except Exception as e:
            log(f"[INTENT] LLM extract port {port}: {e}")

    # Fallback: simple regex extraction for common patterns
    return _regex_extract(text, tmpl)


def _regex_extract(text: str, tmpl) -> dict:
    """Cheap regex fallback when LLM is unavailable."""
    entities: dict[str, str] = {}

    # Amount — e.g. $5,000 or 5000 or £3.2k
    m = re.search(r'[$€£]?\s*([\d,]+(?:\.\d{2})?)\s*[kK]?\b', text)
    if m:
        raw_amt = m.group(1).replace(",", "")
        if "k" in m.group(0).lower():
            raw_amt = str(int(float(raw_amt) * 1000))
        entities["amount"] = raw_amt

    # Company names — capitalised words after "to", "from", "vendor", "for"
    m = re.search(
        r'(?:to|from|vendor|supplier|client|customer)\s+([A-Z][A-Za-z0-9\s&.]{1,30})',
        text)
    if m:
        entities["vendor"] = m.group(1).strip()
        entities["customer"] = m.group(1).strip()

    # Hours — "6 hours", "8h", "half day"
    m = re.search(r'(\d+(?:\.\d+)?)\s*(?:hour|hr|h)\b', text, re.IGNORECASE)
    if m:
        entities["hours"] = m.group(1)

    # Project — words after "on", "for project"
    m = re.search(r'(?:on|for project|project)\s+([A-Za-z0-9\-]+)', text,
                  re.IGNORECASE)
    if m:
        entities["project"] = m.group(1).strip()

    return entities


# ── Confidence scoring ─────────────────────────────────────────────────────────

def _confidence(text: str, tmpl, entities: dict) -> float:
    """
    Heuristic confidence: more extracted entities = higher confidence.
    Minimum 0.5 when a keyword matched; max 0.95.
    """
    if not entities:
        return 0.50
    filled = sum(1 for v in entities.values() if v)
    ratio  = filled / max(len(tmpl.entity_map), 1)
    return min(0.95, 0.50 + ratio * 0.45)
