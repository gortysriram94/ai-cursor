"""
rules.py — Business rule definitions, storage, and validation engine.

Rule types:
  required      — field must not be empty (optionally: only when another
                  field has a specific value)
  format        — field value must match a regex pattern
  cross_field   — value of field A constrains valid values for field B
  threshold     — numeric field must be above/below a limit
  allowed_values— field value must be one of a fixed set

Rules are stored in pushpa_rules.json.
Sources:
  manual    — created explicitly by the user in the dashboard
  inferred  — discovered by rule_learner.py analysing compact history

Severity:
  error   — block form submission; user must override explicitly
  warning — show notice; user can proceed normally
"""

import re
import json
import time
import uuid
from dataclasses import dataclass, field, asdict
from typing import Optional

from config import RULES_FILE
from log import log


# ── Data models ────────────────────────────────────────────────────────────────

@dataclass
class Rule:
    id:              str    = ""
    app:             str    = ""      # "" = applies to all apps
    rule_type:       str    = ""      # required|format|cross_field|threshold|allowed_values
    field_label:     str    = ""      # label of the field this rule checks
    description:     str    = ""      # human-readable summary
    severity:        str    = "warning"  # "error" | "warning"
    source:          str    = "manual"   # "manual" | "inferred"
    confidence:      float  = 1.0
    enabled:         bool   = True
    created_at:      str    = ""

    # Type-specific fields — only relevant for their rule_type
    required_when_field:  str   = ""   # required: only required when this field is set
    required_when_value:  str   = ""   # required: and it equals this value
    format_pattern:       str   = ""   # format: regex
    format_hint:          str   = ""   # format: human description e.g. "9 digits"
    threshold_op:         str   = ""   # threshold: > < >= <= !=
    threshold_value:      float = 0.0  # threshold: the limit
    threshold_currency:   bool  = False
    cross_field_target:   str   = ""   # cross_field: the dependent field label
    cross_field_pattern:  str   = ""   # cross_field: what target must match when this field is set
    allowed_values:       list  = field(default_factory=list)

    def __post_init__(self):
        if not self.id:
            self.id = str(uuid.uuid4())[:8]
        if not self.created_at:
            self.created_at = time.strftime("%Y-%m-%d")

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class RuleViolation:
    rule:        Rule
    field_index: int
    field_label: str
    message:     str
    severity:    str    # "error" | "warning"
    can_override: bool  = True


# ── Storage ────────────────────────────────────────────────────────────────────

def load_rules() -> list[Rule]:
    try:
        if RULES_FILE.exists():
            raw = json.loads(RULES_FILE.read_text(encoding="utf-8"))
            return [Rule(**r) for r in raw]
    except Exception as e:
        log(f"[RULES] load failed: {e}")
    return []


def save_rules(rules: list[Rule]):
    try:
        RULES_FILE.write_text(
            json.dumps([r.to_dict() for r in rules], indent=2),
            encoding="utf-8",
        )
    except Exception as e:
        log(f"[RULES] save failed: {e}")


def add_rule(rule: Rule):
    rules = load_rules()
    # Replace if same id already exists (update)
    rules = [r for r in rules if r.id != rule.id]
    rules.append(rule)
    save_rules(rules)
    log(f"[RULES] saved rule '{rule.description}' ({rule.rule_type}) for '{rule.app or 'all apps'}'")


def delete_rule(rule_id: str):
    rules = [r for r in load_rules() if r.id != rule_id]
    save_rules(rules)


def get_rules_for_app(app_name: str) -> list[Rule]:
    """Return all enabled rules that apply to app_name (or all apps)."""
    return [
        r for r in load_rules()
        if r.enabled and (not r.app or r.app.lower() == app_name.lower())
    ]


# ── Validation engine ──────────────────────────────────────────────────────────

def validate_fields(fields: list, app_name: str) -> list[RuleViolation]:
    """
    Check a list of FormFields against stored rules for the given app.
    Returns a list of violations (empty = all good).
    """
    rules     = get_rules_for_app(app_name)
    if not rules:
        return []

    # Build label → field lookup for cross-field checks
    by_label  = {(f.label or "").lower(): f for f in fields}
    violations: list[RuleViolation] = []

    for field_obj in fields:
        label     = (field_obj.label or field_obj.placeholder or "").strip()
        label_low = label.lower()
        value     = (field_obj.suggested_value or "").strip()

        for rule in rules:
            if rule.field_label.lower() != label_low:
                continue

            v = _check_rule(rule, field_obj, value, by_label, fields)
            if v:
                violations.append(v)

    return violations


def _check_rule(rule: Rule, field_obj, value: str,
                by_label: dict, all_fields: list) -> Optional[RuleViolation]:
    """Apply one rule to one field. Returns a RuleViolation or None."""

    label = field_obj.label or field_obj.placeholder or f"Field {field_obj.index+1}"

    if rule.rule_type == "required":
        # Only fires when a condition field has a specific value (or always)
        if rule.required_when_field:
            dep = by_label.get(rule.required_when_field.lower())
            dep_val = (dep.suggested_value or dep.current_value or "").strip() if dep else ""
            if rule.required_when_value and dep_val.lower() != rule.required_when_value.lower():
                return None   # condition not met — rule doesn't apply
        if not value:
            return RuleViolation(
                rule=rule, field_index=field_obj.index,
                field_label=label,
                message=rule.description or f"{label} is required.",
                severity=rule.severity,
            )

    elif rule.rule_type == "format":
        if value and not re.fullmatch(rule.format_pattern, value):
            hint = f" ({rule.format_hint})" if rule.format_hint else ""
            return RuleViolation(
                rule=rule, field_index=field_obj.index,
                field_label=label,
                message=f"{label}: invalid format{hint}. Got: {value[:30]}",
                severity=rule.severity,
            )

    elif rule.rule_type == "threshold":
        if value:
            try:
                num = float(re.sub(r"[,$€£]", "", value))
                op  = rule.threshold_op
                lim = rule.threshold_value
                violated = (
                    (op == ">"  and not num > lim) or
                    (op == "<"  and not num < lim) or
                    (op == ">=" and not num >= lim) or
                    (op == "<=" and not num <= lim) or
                    (op == "!=" and not num != lim)
                )
                if violated:
                    prefix = "$" if rule.threshold_currency else ""
                    return RuleViolation(
                        rule=rule, field_index=field_obj.index,
                        field_label=label,
                        message=rule.description or
                                f"{label} must be {op} {prefix}{lim:,.0f}.",
                        severity=rule.severity,
                    )
            except ValueError:
                pass   # non-numeric value — skip threshold check

    elif rule.rule_type == "allowed_values":
        if value and rule.allowed_values:
            allowed_low = [v.lower() for v in rule.allowed_values]
            if value.lower() not in allowed_low:
                opts = ", ".join(rule.allowed_values[:6])
                return RuleViolation(
                    rule=rule, field_index=field_obj.index,
                    field_label=label,
                    message=f"{label}: '{value}' is not a valid value. Options: {opts}",
                    severity=rule.severity,
                )

    elif rule.rule_type == "cross_field":
        # When this field is filled, a dependent field must match a pattern
        if value and rule.cross_field_target and rule.cross_field_pattern:
            target = by_label.get(rule.cross_field_target.lower())
            if target:
                target_val = (target.suggested_value or target.current_value or "").strip()
                if target_val and not re.search(rule.cross_field_pattern,
                                                target_val, re.IGNORECASE):
                    return RuleViolation(
                        rule=rule, field_index=field_obj.index,
                        field_label=label,
                        message=rule.description or
                                f"When {label} is set, {rule.cross_field_target} "
                                f"must match the expected pattern.",
                        severity=rule.severity,
                    )

    return None
