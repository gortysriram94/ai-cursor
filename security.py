"""
security.py — PII detection, field classification, and log redaction.

PII levels (ordered by severity):
  "none"    — no personal information concern
  "low"     — names, generic identifiers — subtle indicator only
  "medium"  — email, phone, address — show notice, allow auto-fill
  "high"    — SSN, credit card, DOB, passport, bank account
              Require explicit user confirmation before filling.
              Mask the suggested value until revealed.
  "blocked" — passwords, PINs, passphrases
              Never auto-fill. Always force manual entry.

Used by:
  - brain/form_filler.py   (skip suggestions for blocked/high fields)
  - ui/form_controller.py  (show appropriate warnings per field)
  - brain/context_brain.py (redact PII from log output)
"""

import re
from dataclasses import dataclass


# ── PII pattern table ─────────────────────────────────────────────────────────
# Each entry: (compiled_regex, level, human_label)
# Matched against field label + placeholder combined, lower-cased.
# First match wins — list is ordered highest → lowest severity.

_RAW_PATTERNS: list[tuple[str, str, str]] = [
    # BLOCKED — never suggest, never auto-fill
    (r"password|passcode|\bpin\b|passphrase|secret.?key|two.?factor|2fa|otp\b",
     "blocked", "Password / PIN"),

    # HIGH — sensitive financial / government ID
    (r"social.?security|ssn\b|national.?id|tax.?id\b|\bein\b|\bitin\b",
     "high", "Government ID"),
    (r"credit.?card|card.?number|card.?no\b|\bccn\b|\bcvv\b|\bcvc\b|card.?expir",
     "high", "Financial — Credit Card"),
    (r"bank.?account|account.?number|routing.?number|\biban\b|\bswift\b|sort.?code",
     "high", "Financial — Bank Account"),
    (r"passport|driver.?licen|driving.?licen|license.?number|dl.?number",
     "high", "Government Document"),
    (r"date.?of.?birth|birth.?date|\bdob\b|birthday",
     "high", "Date of Birth"),
    (r"medical.?record|patient.?id|health.?insurance|insurance.?id|policy.?number",
     "high", "Medical / Insurance"),
    (r"mother.?maiden|security.?question|secret.?answer",
     "high", "Security Challenge"),

    # MEDIUM — contact / location info
    (r"\bemail\b|e-mail|email.?address",
     "medium", "Email Address"),
    (r"phone|mobile|cell\b|telephone|contact.?number|whatsapp",
     "medium", "Phone Number"),
    (r"\baddress\b|street|postal|zip.?code|postcode|\bstate\b|\bcity\b|\bcountry\b",
     "medium", "Physical Address"),
    (r"ip.?address|mac.?address|device.?id",
     "medium", "Device Identifier"),
    (r"salary|income|compensation|wage",
     "medium", "Financial — Income"),

    # LOW — name / demographic
    (r"first.?name|last.?name|full.?name|surname|given.?name|middle.?name",
     "low", "Personal Name"),
    (r"\bgender\b|\bsex\b|ethnicity|\brace\b|nationality|religion",
     "low", "Demographic"),
    (r"\bage\b|year.?of.?birth",
     "low", "Age / Year"),
    (r"username|user.?name|screen.?name|display.?name",
     "low", "Username"),
]

# Compile once at import
_PATTERNS: list[tuple[re.Pattern, str, str]] = [
    (re.compile(raw, re.IGNORECASE), level, label)
    for raw, level, label in _RAW_PATTERNS
]

# Severity order for comparisons
_SEVERITY = {"blocked": 4, "high": 3, "medium": 2, "low": 1, "none": 0}


@dataclass
class PiiInfo:
    level:       str   # "none" | "low" | "medium" | "high" | "blocked"
    label:       str   # human-readable category, e.g. "Credit Card"
    should_mask: bool  # True → hide suggested value until user reveals it
    can_fill:    bool  # False → controller must not fill this field


def classify_field(field_label: str, control_type: str = "text",
                   placeholder: str = "") -> PiiInfo:
    """
    Classify a form field's PII sensitivity from its label, control type,
    and placeholder text.
    """
    # Password control type is always blocked regardless of label
    if control_type == "password":
        return PiiInfo("blocked", "Password / PIN", True, False)

    search_text = f"{field_label} {placeholder}".lower().strip()

    for pattern, level, human_label in _PATTERNS:
        if pattern.search(search_text):
            return PiiInfo(
                level       = level,
                label       = human_label,
                should_mask = level in ("high", "blocked"),
                can_fill    = level != "blocked",
            )

    return PiiInfo("none", "", False, True)


def classify_fields(fields: list) -> list:
    """
    Annotate a list of FormField objects with their pii_info.
    Mutates each field's pii_level attribute in-place.
    Returns the same list.
    """
    for f in fields:
        info = classify_field(f.label, f.control_type, f.placeholder)
        f.pii_level   = info.level
        f.pii_label   = info.label
        f.pii_mask    = info.should_mask
        f.pii_can_fill = info.can_fill

        # Clear suggested values for fields we must not auto-fill
        if not info.can_fill:
            f.suggested_value = ""
        elif info.level == "high":
            # Keep the suggestion but it will be masked in the UI
            pass

    return fields


# ── Form-level risk summary ───────────────────────────────────────────────────

@dataclass
class FormRisk:
    blocked_count: int
    high_count:    int
    medium_count:  int
    overall:       str   # "safe" | "caution" | "sensitive" | "high-risk"
    summary:       str   # one-line description shown to user


def assess_form(fields: list) -> FormRisk:
    """
    Given a list of classified FormFields, return an overall risk assessment.
    """
    blocked = sum(1 for f in fields if getattr(f, "pii_level", "none") == "blocked")
    high    = sum(1 for f in fields if getattr(f, "pii_level", "none") == "high")
    medium  = sum(1 for f in fields if getattr(f, "pii_level", "none") == "medium")

    if blocked + high >= 3:
        overall = "high-risk"
        summary = (f"This form contains {blocked + high} sensitive fields "
                   f"({blocked} password{'s' if blocked != 1 else ''}, "
                   f"{high} highly sensitive). Review carefully.")
    elif blocked > 0 or high > 0:
        overall = "sensitive"
        parts = []
        if blocked:
            parts.append(f"{blocked} password field{'s' if blocked > 1 else ''}")
        if high:
            parts.append(f"{high} sensitive field{'s' if high > 1 else ''}")
        summary = f"Contains {' and '.join(parts)}. These must be filled manually or confirmed."
    elif medium >= 2:
        overall = "caution"
        summary = f"Contains {medium} personal information fields (email, phone, address)."
    else:
        overall = "safe"
        summary = ""

    return FormRisk(blocked, high, medium, overall, summary)


# ── Log redaction ─────────────────────────────────────────────────────────────

# Patterns for recognising PII values in log strings
_REDACT_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b'),
     "[EMAIL]"),
    (re.compile(r'\b(?:\+?1[\s\-.]?)?\(?[0-9]{3}\)?[\s\-.]?[0-9]{3}[\s\-.]?[0-9]{4}\b'),
     "[PHONE]"),
    (re.compile(r'\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b'),
     "[SSN]"),
    # Compact card numbers (no spaces/dashes)
    (re.compile(r'\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b'),
     "[CARD]"),
    # Spaced/dashed card format: 4111 1111 1111 1111 or 4111-1111-1111-1111
    (re.compile(r'\b\d{4}[\s\-]\d{4}[\s\-]\d{4}[\s\-]\d{4}\b'),
     "[CARD]"),
    (re.compile(r'\b[A-Z]{2}\d{6,9}\b'),
     "[PASSPORT]"),
]


def redact_for_log(text: str) -> str:
    """
    Replace obvious PII values in a string before writing to the log.
    Used by context_brain.py and form_filler.py to avoid logging raw PII.
    """
    for pattern, replacement in _REDACT_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


# ── Compact privacy guard ─────────────────────────────────────────────────────

def sanitise_compact_entities(entities: list[str]) -> list[str]:
    """
    Remove or redact PII values from a compact record's entity list
    before it is saved to memory.
    """
    clean = []
    for e in entities:
        redacted = redact_for_log(e)
        # If the entity was substantially changed, it contained PII — drop it
        if len(redacted) < len(e) * 0.6:
            continue
        clean.append(redacted)
    return clean
