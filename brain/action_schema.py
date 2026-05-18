"""
brain/action_schema.py — Structured action recommendation.

Replaces the bare (action_key, confidence) tuple with a typed object
that carries risk level, priority score, target, and rationale.
Used by the priority queue and safety filter before any auto-run or
proactive generation fires.

Risk levels:
  safe     — read-only output, no side effects (summarize, explain, copy)
  review   — modifies or sends content (reply, improve, polish)
  caution  — high-impact, irreversible (form_fill, submit, delete)
"""

from dataclasses import dataclass, field


@dataclass
class ActionRecommendation:
    action_key:   str         # matches ACTION_PROMPTS / CONTEXT_ACTIONS key
    label:        str         # human-readable display name
    confidence:   float       # detection confidence from detect_action()
    priority:     float       # computed ranking score (0.0 – 1.0)
    risk_level:   str         # "safe" | "review" | "caution"
    target:       str         # "insert" | "copy" | "dispatch"
    context_type: str = ""    # content_type that triggered this
    rationale:    str = ""    # technical metadata (for logging)
    reasoning:    str = ""    # plain-English explanation shown to user
    entities:     list = field(default_factory=list)


@dataclass
class ActionPlan:
    """A sequenced set of steps to work through in order."""
    steps:        list["ActionRecommendation"]
    current_step: int = 0
    status:       str = "active"   # "active" | "completed" | "dismissed"


# ── Risk classification ───────────────────────────────────────────────────────
# "safe"    — output only, no side effects; fine to auto-run
# "review"  — creates or sends content; require high confidence or user approval
# "caution" — irreversible or high-impact; never auto-run

_RISK_MAP: dict[str, str] = {
    # Safe — analytical / read-only output
    "summarize":           "safe",
    "explain":             "safe",
    "explain_contract":    "safe",
    "key_takeaways":       "safe",
    "trade_thesis":        "safe",
    "client_summary":      "safe",
    "pros_cons":           "safe",
    "sentiment":           "safe",
    "bull_bear":           "safe",
    "market_impact":       "safe",
    "key_catalysts":       "safe",
    "trade_risks":         "safe",
    "journal_entry":       "safe",
    "risk_summary":        "safe",
    "inspect":             "safe",
    "caption":             "safe",
    "hashtags":            "safe",
    "comment":             "safe",
    "shorter":             "safe",
    "options":             "safe",
    "review":              "safe",
    "selling_points":      "safe",
    "neighborhood_highlights": "safe",
    "compare_listings":    "safe",
    "analyze_queue":       "safe",
    "batch_summary":       "safe",
    "close_status":        "safe",
    "explain_variance":    "safe",
    "reconcile_check":     "safe",

    # Review — produces content that will be sent/inserted
    "reply":               "review",
    "follow_up":           "review",
    "improve":             "review",
    "polish":              "review",
    "quick_reply_lead":    "review",
    "open_house_followup": "review",
    "re_engagement":       "review",
    "urgency_message":     "review",
    "objection_reply":     "review",
    "schedule_showing":    "review",
    "qualify_buyer":       "review",
    "draft_journal":       "review",
    "canvas":              "review",
    "simplify_thread":     "review",

    # Caution — high-impact or touches real transactions
    "_fill_form":          "caution",
    "form_fill":           "caution",
    "flag_risks":          "caution",
    "escalation_list":     "caution",
    "contract_risks":      "caution",
}

# Default for unknown actions
_DEFAULT_RISK = "review"


def classify_risk(action_key: str) -> str:
    return _RISK_MAP.get(action_key, _DEFAULT_RISK)


# ── Preferred dispatch target per risk level ──────────────────────────────────

_TARGET_MAP: dict[str, str] = {
    "safe":    "copy",     # safe results → copy to clipboard by default
    "review":  "insert",   # review results → insert in place (user chose it)
    "caution": "insert",   # caution results → insert only, never dispatch silently
}


def default_target(risk_level: str) -> str:
    return _TARGET_MAP.get(risk_level, "copy")
