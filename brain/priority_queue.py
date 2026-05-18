"""
brain/priority_queue.py — Multi-factor action priority scorer and auto-run gate.

Priority score (0.0 – 1.0) is computed from four factors:
  confidence  (40%) — how certain content type detection is
  urgency     (30%) — signals indicating time-sensitivity
  frequency   (20%) — how often the user has accepted this action
  risk        (10%) — penalty for high-impact actions

Auto-run gate: returns True only when the action is safe enough and
ranked high enough to fire without showing the menu.
"""

from brain.action_schema import ActionRecommendation, classify_risk, default_target

# Auto-run thresholds per risk level
_AUTORUN_THRESHOLDS: dict[str, float] = {
    "safe":    0.65,   # safe actions auto-run above 65% priority
    "review":  0.88,   # review actions need very high confidence
    "caution": 2.0,    # caution actions never auto-run (threshold unreachable)
}

# Urgency bonuses — content types that are time-sensitive
_URGENCY_MAP: dict[str, float] = {
    "email_thread":      0.35,
    "email_composition": 0.25,
    "legal_contract":    0.20,
    "earnings_release":  0.20,
    "approval_item":     0.30,
    "buyer_inquiry":     0.25,
}

# Risk penalties applied to the priority score
_RISK_PENALTY: dict[str, float] = {
    "safe":    0.00,
    "review":  0.08,
    "caution": 0.25,
}


def score_recommendation(
    action_key:   str,
    confidence:   float,
    content_type: str = "",
    signals=None,
    usage_count:  int = 0,
    app_name:     str = "",
) -> "ActionRecommendation":
    """
    Build a fully scored ActionRecommendation from detection outputs.
    Replaces the bare (action_key, confidence) tuple.
    """
    risk      = classify_risk(action_key)
    label     = action_key.replace("_", " ").title()
    target    = default_target(risk)
    priority  = _compute_priority(confidence, action_key, content_type,
                                   signals, usage_count, risk)
    rationale = _rationale(action_key, confidence, content_type, priority)
    reasoning = _generate_reasoning(action_key, content_type, confidence,
                                    signals, app_name)

    return ActionRecommendation(
        action_key   = action_key,
        label        = label,
        confidence   = round(confidence, 3),
        priority     = round(priority, 3),
        risk_level   = risk,
        target       = target,
        context_type = content_type,
        rationale    = rationale,
        reasoning    = reasoning,
    )


def is_safe_to_autorun(rec: ActionRecommendation) -> bool:
    """
    Returns True when the recommendation can fire without showing the menu.
    Caution-level actions are always blocked.
    Review-level actions require near-certain confidence.
    """
    threshold = _AUTORUN_THRESHOLDS.get(rec.risk_level, 2.0)
    return rec.priority >= threshold


# ── Internal ──────────────────────────────────────────────────────────────────

def _compute_priority(
    confidence:   float,
    action_key:   str,
    content_type: str,
    signals,
    usage_count:  int,
    risk:         str,
) -> float:
    # 40%: detection confidence
    score = confidence * 0.40

    # 30%: urgency from content type
    urgency = _URGENCY_MAP.get(content_type, 0.0)
    if signals:
        # Email with quoted thread = active conversation, more urgent
        if getattr(signals, "has_quoted_thread", False):
            urgency = min(1.0, urgency + 0.15)
    score += urgency * 0.30

    # 20%: user frequency — max bonus at 10+ accepted uses
    freq = min(1.0, usage_count / 10.0)
    score += freq * 0.20

    # 10%: risk penalty
    score -= _RISK_PENALTY.get(risk, 0.0)

    return max(0.0, min(1.0, score))


def _rationale(
    action_key:   str,
    confidence:   float,
    content_type: str,
    priority:     float,
) -> str:
    parts = [f"content_type={content_type}({confidence:.0%})"]
    urgency = _URGENCY_MAP.get(content_type, 0.0)
    if urgency:
        parts.append(f"urgency={urgency:.0%}")
    parts.append(f"priority={priority:.2f}")
    return " ".join(parts)


def _generate_reasoning(
    action_key:   str,
    content_type: str,
    confidence:   float,
    signals,
    app_name:     str = "",
) -> str:
    """Plain-English explanation shown to the user in the panel."""
    _an = app_name or "this app"

    _WHY: dict[tuple, str] = {
        ("reply",            "email_thread"):      f"Active email thread detected in {_an}",
        ("follow_up",        "email_thread"):      f"Conversation needs a follow-up in {_an}",
        ("reply",            "email_composition"): f"Unread message waiting for response in {_an}",
        ("summarize",        "news_article"):      "Long article detected — summary would save time",
        ("summarize",        "research_report"):   "Research report detected — summary would save time",
        ("explain_contract", "legal_contract"):    "Contract terms detected — explanation would help",
        ("trade_thesis",     "earnings_release"):  "Earnings data detected — trade thesis available",
        ("key_catalysts",    "earnings_release"):  "Earnings release detected — key catalysts extracted",
        ("form_fill",        "form"):              f"Form fields detected in {_an}",
        ("analyze_queue",    "approval_item"):     "Approval queue detected — risk analysis ready",
        ("pros_cons",        "product_listing"):   "Product page detected — pros and cons available",
        ("selling_points",   "property_listing"):  "Property listing detected — selling points ready",
        ("quick_reply_lead", "buyer_inquiry"):     f"Buyer inquiry detected in {_an}",
    }

    key = (action_key, content_type)
    if key in _WHY:
        return _WHY[key]

    label = action_key.replace("_", " ")
    ct    = content_type.replace("_", " ")
    return f"{label} based on {ct} content"
