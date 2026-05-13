"""
privacy_check.py — scans screen content and entities for sensitive patterns.
If any pattern matches, external retrieval is suppressed for that call.
"""
import re

from rag_config import PRIVACY_PATTERNS
from log import log

_compiled: list[re.Pattern] = [
    re.compile(p, re.IGNORECASE | re.DOTALL) for p in PRIVACY_PATTERNS
]


def is_safe_to_retrieve(text: str, entities: list) -> bool:
    """
    True if no sensitive patterns are found in the screen text or extracted entities.
    Fast path: returns False on first match.
    """
    combined = text + " " + " ".join(str(e) for e in entities)
    return not any(pat.search(combined) for pat in _compiled)


def sensitive_patterns_found(text: str, entities: list) -> list[str]:
    """
    Return list of raw pattern strings that matched (for debug logging).
    Only called when is_safe_to_retrieve returns False.
    """
    combined = text + " " + " ".join(str(e) for e in entities)
    return [
        PRIVACY_PATTERNS[i]
        for i, pat in enumerate(_compiled)
        if pat.search(combined)
    ]
