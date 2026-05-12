"""
brain/form_filler.py — Form field scanning and context-to-field mapping.

Three responsibilities:
  1. scan_fields(window)      — use platform layer to enumerate input controls
  2. map_fields(fields, ctx)  — LLM matches field labels to context data
  3. fill_field(field, plat)  — platform layer writes the value into the control

The UI (form_controller.py) owns the navigation; this module owns the data.
"""

import json
import re
from typing import Optional

from plat.base import FormField, WindowInfo
from log import log


# ── Field scanning ─────────────────────────────────────────────────────────────

def scan_fields(window: WindowInfo) -> list[FormField]:
    """
    Enumerate fillable input controls in the given window, then classify
    each field for PII sensitivity.
    """
    from plat import platform as get_platform
    from security import classify_fields
    try:
        fields = get_platform().get_form_fields(window)
        fields = [f for f in fields
                  if f.label or f.placeholder or f.control_type == "checkbox"]
        classify_fields(fields)   # annotates pii_level, pii_label, etc. in-place
        log(f"[FORM] scanned {len(fields)} fields in {window.app_name}")
        return fields
    except NotImplementedError:
        log("[FORM] platform does not support form automation yet")
        return []
    except Exception as e:
        log(f"[FORM] scan_fields error: {e}")
        return []


# ── LLM field mapping ──────────────────────────────────────────────────────────

def map_fields(fields: list[FormField], ctx) -> list[FormField]:
    """
    Ask the local LLM to suggest a value for each field given the
    current working context.  Mutates each field's suggested_value.
    Returns the same list.
    """
    if not fields or not ctx:
        return fields

    # Build a compact representation of what we know
    labels = [f.label or f.placeholder or f"Field {f.index+1}" for f in fields]
    entities_str = ", ".join(ctx.entities[:8]) if ctx.entities else ""
    context_str  = ctx.situation or f"Using {ctx.app_name}"

    result = _call_map_llm(labels, context_str, entities_str, ctx.raw_text)

    if result:
        for field in fields:
            # Never suggest values for blocked fields (passwords, PINs)
            if not field.pii_can_fill:
                field.suggested_value = ""
                continue
            key = field.label or field.placeholder or f"Field {field.index+1}"
            val = result.get(key, result.get(key.lower(), ""))
            field.suggested_value = str(val).strip() if val else ""
    else:
        log("[FORM] LLM mapping failed — fields will have empty suggestions")

    return fields


def _call_map_llm(labels: list[str], situation: str,
                  entities: str, raw_text: str) -> Optional[dict]:
    """Fast local LLM call: given field labels + context, suggest values."""
    import requests
    from config import OLLAMA_CONTEXT_MODEL, OLLAMA_PORT

    labels_str = "\n".join(f"- {l}" for l in labels)
    # Keep raw_text snippet small for speed
    text_hint  = raw_text[:800] if raw_text else ""

    prompt = (
        f"The user is filling a form. Here is what we know about them / their task:\n"
        f"Situation: {situation}\n"
        f"Key entities: {entities}\n"
        f"Screen content hint:\n{text_hint}\n\n"
        f"Form field labels:\n{labels_str}\n\n"
        "For each field, suggest the best value to fill in based on the context.\n"
        "Leave the value empty string if you don't have enough information.\n"
        "Return ONLY valid JSON — no markdown, no explanation:\n"
        "{\n"
        + ",\n".join(f'  "{l}": ""' for l in labels)
        + "\n}"
    )

    for port in [11434, OLLAMA_PORT]:
        try:
            res = requests.post(
                f"http://localhost:{port}/api/generate",
                json={
                    "model":   OLLAMA_CONTEXT_MODEL,
                    "prompt":  prompt,
                    "stream":  False,
                    "options": {"temperature": 0.1, "num_predict": 400},
                },
                timeout=10,
            )
            if res.status_code == 200:
                raw = res.json().get("response", "").strip()
                m = re.search(r'\{.*\}', raw, re.DOTALL)
                if m:
                    return json.loads(m.group())
        except Exception as e:
            log(f"[FORM] LLM map port {port}: {e}")

    return None


# ── Field filling ──────────────────────────────────────────────────────────────

def map_from_entities(fields: list[FormField], entities: dict,
                      entity_map: dict) -> list[FormField]:
    """
    Pre-populate fields from a parsed TransactionIntent's entity dict.
    entity_map: {entity_key → field_label} from the transaction template.
    Mutates suggested_value in-place.  Returns the same list.
    """
    # Invert: field_label_lower → value
    label_to_value: dict[str, str] = {}
    for entity_key, value in entities.items():
        if not value:
            continue
        field_label = entity_map.get(entity_key, "")
        if field_label:
            label_to_value[field_label.lower()] = str(value)

    for f in fields:
        if not f.pii_can_fill:
            continue
        label_low = (f.label or f.placeholder or "").lower()
        if label_low in label_to_value:
            f.suggested_value = label_to_value[label_low]

    return fields


def validate_fields(fields: list[FormField], app_name: str) -> list:
    """
    Check mapped fields against stored business rules.
    Returns a list of RuleViolation objects (empty = no issues).
    """
    from rules import validate_fields as _validate
    violations = _validate(fields, app_name)
    if violations:
        log(f"[FORM] {len(violations)} rule violation(s) detected")
    return violations


def fill_field(field: FormField, value: str) -> bool:
    """
    Write value into the field using the platform layer.
    Refuses to fill blocked (password) fields regardless of caller intent.
    Returns True on success.
    """
    if not field.pii_can_fill:
        log(f"[FORM] BLOCKED fill attempt on '{field.label}' (pii={field.pii_level})")
        return False

    from plat import platform as get_platform
    from security import redact_for_log
    plat = get_platform()
    try:
        plat.focus_field(field)
        ok = plat.set_field_value(field, value)
        if ok:
            field.filled        = True
            field.current_value = value
            # Log label only — never log the actual value for any PII field
            if field.pii_level != "none":
                log(f"[FORM] filled '{field.label}' [{field.pii_level} PII]")
            else:
                log(f"[FORM] filled '{field.label}'")
        return ok
    except Exception as e:
        log(f"[FORM] fill_field '{field.label}': {e}")
        return False
