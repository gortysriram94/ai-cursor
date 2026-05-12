"""
brain/rule_learner.py — Infer business rules from compact history.

Runs in a background thread after each compact is saved.
Scans pattern in previous compacts to discover:

  format rules    — "GL Code" always matches ^\\d{4}$
  required rules  — "Project Code" is always filled when "Cost Centre" is set
  allowed values  — "Department" is always one of: Finance, HR, Marketing...
  threshold rules — "Approval Amount" is always < 50000 per transaction

Only writes rules with confidence >= MIN_CONFIDENCE.
Never overwrites manual rules.
"""

import re
from collections import Counter, defaultdict
from typing import Optional

from log import log

MIN_CONFIDENCE    = 0.75   # minimum pattern frequency to infer a rule
MIN_OBSERVATIONS  = 4      # minimum data points before inferring anything


def learn_from_compacts(app_name: str = "") -> int:
    """
    Scan compact history and write any newly inferred rules.
    Returns the count of new rules written.
    """
    from memory import load_compacts
    from rules import load_rules, add_rule, Rule

    compacts = load_compacts()
    if app_name:
        compacts = [c for c in compacts if c.get("app", "") == app_name]

    if len(compacts) < MIN_OBSERVATIONS:
        return 0

    existing_rules = load_rules()
    existing_inferred = {
        (r.app, r.rule_type, r.field_label): r
        for r in existing_rules if r.source == "inferred"
    }

    # Collect field value observations across all compacts
    # compact.context is a string like "GL 6200 · Cost Centre 4100 · Project OM-42"
    # We use entity lists more than raw context text
    field_obs: dict[str, list[str]] = defaultdict(list)
    for c in compacts:
        for entity in c.get("entities", []):
            # Entities are stored as "Label: value" or plain values
            if ":" in entity:
                label, _, val = entity.partition(":")
                field_obs[label.strip()].append(val.strip())

    new_rules = 0

    for field_label, values in field_obs.items():
        if len(values) < MIN_OBSERVATIONS:
            continue

        key_prefix = (app_name, "format", field_label)

        # ── Format inference ─────────────────────────────────────────────────
        pattern = _infer_format(values)
        if pattern and key_prefix not in existing_inferred:
            r = Rule(
                app         = app_name,
                rule_type   = "format",
                field_label = field_label,
                description = f"{field_label} must match the observed format",
                severity    = "warning",
                source      = "inferred",
                confidence  = pattern[1],
                format_pattern = pattern[0],
                format_hint    = pattern[2],
            )
            add_rule(r)
            new_rules += 1
            log(f"[RULES] inferred format rule for '{field_label}': {pattern[0]}")

        # ── Allowed values inference ─────────────────────────────────────────
        allowed = _infer_allowed_values(values)
        key_av  = (app_name, "allowed_values", field_label)
        if allowed and key_av not in existing_inferred:
            r = Rule(
                app            = app_name,
                rule_type      = "allowed_values",
                field_label    = field_label,
                description    = f"{field_label} must be one of the known values",
                severity       = "warning",
                source         = "inferred",
                confidence     = allowed[1],
                allowed_values = allowed[0],
            )
            add_rule(r)
            new_rules += 1
            log(f"[RULES] inferred allowed-values rule for '{field_label}':"
                f" {allowed[0][:4]}")

    if new_rules:
        log(f"[RULES] inferred {new_rules} rule(s) from compact history"
            f"{' for ' + app_name if app_name else ''}")

    return new_rules


# ── Pattern detection helpers ──────────────────────────────────────────────────

def _infer_format(values: list[str]) -> Optional[tuple[str, float, str]]:
    """
    Returns (regex_pattern, confidence, hint) or None.
    Tries common ERP field patterns first, then derives a general one.
    """
    clean = [v.strip() for v in values if v.strip()]
    if len(clean) < MIN_OBSERVATIONS:
        return None

    # Common known patterns (most specific first)
    known = [
        (r"^\d{4}$",           "4-digit code"),
        (r"^\d{5}$",           "5-digit code"),
        (r"^\d{6}$",           "6-digit code"),
        (r"^[A-Z]{2,4}-\d+$",  "prefix-number code e.g. OM-42"),
        (r"^[A-Z]{2}\d{4,6}$", "2-letter + digits"),
        (r"^\d{1,3}(,\d{3})*(\.\d{2})?$", "number/currency"),
        (r"^\d{4}-\d{2}-\d{2}$", "date YYYY-MM-DD"),
        (r"^\d{2}/\d{2}/\d{4}$", "date MM/DD/YYYY"),
    ]

    for pattern, hint in known:
        matched = sum(1 for v in clean if re.fullmatch(pattern, v))
        conf    = matched / len(clean)
        if conf >= MIN_CONFIDENCE:
            return pattern, conf, hint

    # General: check if all values share a common prefix structure
    if all(re.fullmatch(r"[A-Z0-9\-]+", v) for v in clean):
        lengths = Counter(len(v) for v in clean)
        most_common_len, freq = lengths.most_common(1)[0]
        if freq / len(clean) >= MIN_CONFIDENCE:
            pat  = f"^.{{{most_common_len}}}$"
            return pat, freq / len(clean), f"{most_common_len} characters"

    return None


def _infer_allowed_values(values: list[str]) -> Optional[tuple[list[str], float]]:
    """
    If a small closed set accounts for >= MIN_CONFIDENCE of observations,
    return (allowed_list, confidence).
    Only fires when the cardinality is low (≤ 10 distinct values).
    """
    clean = [v.strip() for v in values if v.strip()]
    if len(clean) < MIN_OBSERVATIONS:
        return None

    counter = Counter(v.lower() for v in clean)
    # Too many distinct values — not a closed set
    if len(counter) > 10:
        return None

    # Coverage: what fraction of observations are covered by the top values
    top_values = [v for v, _ in counter.most_common()]
    coverage   = sum(counter[v] for v in top_values) / len(clean)

    if coverage >= MIN_CONFIDENCE:
        # Return original-case versions
        seen: dict[str, str] = {}
        for v in clean:
            seen.setdefault(v.lower(), v)
        return [seen[k] for k in top_values], coverage

    return None
