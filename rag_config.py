"""
rag_config.py — RAG strategy definitions for all screen contexts.

Pure data — no I/O, no network calls. Imported by the retrieval engine (Phase 3).

Covers Phase 2 items:
  5.  Action gate — which actions trigger retrieval vs. skip it
  6.  Query planner spec — Layer 1 (action-driven) + Layer 2 (context-driven)
  7.  Entity extraction hints per context
  8.  Freshness windows per context
  9.  Speed tiers per context
  10. Privacy patterns — suppress retrieval when these appear on screen
  11. Relevance gate — minimum overlap score to keep a retrieved document
  12. ContextStrategy dataclass — schema for all per-context config
  13-25. Per-context strategies for all 17 contexts + generic fallback
"""

from dataclasses import dataclass, field


# ── Item 5: Action gate ───────────────────────────────────────────────────────
#
# RETRIEVE_ACTIONS: AI call benefits from external context (analysis, explanation,
#   structured output). Retrieval runs before the prompt is built.
#
# SKIP_ACTIONS: Compose/transform actions — they work on what's already on screen.
#   Adding external data adds latency with no quality gain.
#
# MAYBE_ACTIONS: Run retrieval only if entity confidence >= 0.7 AND context is
#   not generic. Used for mid-tier actions where benefit is situational.

RETRIEVE_ACTIONS: set[str] = {
    # Analysis
    "summarize", "explain", "review", "inspect",
    "pros_cons", "bull_bear", "trade_thesis", "counterarguments",
    # Market / finance
    "key_takeaways", "key_catalysts", "market_impact", "actionable_points",
    "trade_risks", "risk_summary", "guidance_summary", "market_reaction",
    "explain_indicator", "important_changes",
    # Real estate
    "selling_points", "neighborhood_highlights", "investment_potential",
    "client_summary", "compare_listings", "best_for_families",
    "explain_contract", "contract_risks",
    # General
    "simplify_thread", "counterpoints",
}

SKIP_ACTIONS: set[str] = {
    # Compose / transform — work on screen content only
    "reply", "follow_up", "polish", "shorter", "improve", "custom",
    "comment", "caption", "hashtags", "sentiment", "hype_score",
    "quick_reply_lead", "urgency_message", "re_engagement",
    "open_house_followup", "objection_reply", "negotiation_reply",
    "schedule_showing", "qualify_buyer", "journal_entry",
    "luxury_tone", "family_tone", "investment_angle",
    "instagram_caption_listing",
}

MAYBE_ACTIONS: set[str] = {
    "options", "inspect",
}


# ── Item 8: Freshness windows (seconds) ───────────────────────────────────────
# How old retrieved data can be before it's considered stale.
# The retrieval cache (Phase 3) uses this to decide whether to re-fetch.

FRESHNESS_SECS: dict[str, int] = {
    "trading":             86_400,      # 1 day   — markets move fast
    "trading_social":      86_400,
    "trading_charts":      86_400,
    "trading_news":        43_200,      # 12 h    — news freshness is critical
    "trading_research":    604_800,     # 1 week
    "content":             604_800,     # 1 week  — trends shift weekly
    "outbound":          1_209_600,     # 2 weeks — prospect signals
    "sales":             1_209_600,
    "customer_support":  2_592_000,     # 30 days — product docs
    "real_estate":       7_776_000,     # 90 days — comps, market data
    "real_estate_listing":7_776_000,
    "real_estate_leads": 2_592_000,     # 30 days — lead signals move faster
    "real_estate_social":  604_800,
    "real_estate_legal": 7_776_000,
    "finance":           7_776_000,     # 90 days — earnings, benchmarks
    "ecommerce":        15_552_000,     # 6 months — product reviews
    "shopping":         15_552_000,
    "enterprise":        7_776_000,     # 90 days — regulatory / governance
    "developer":        63_072_000,     # 2 years — docs are stable
    "design":           63_072_000,     # 2 years
    "research":        157_680_000,     # 5 years  — academic literature
    "generic":           2_592_000,     # 30 days  — conservative default
}

_DEFAULT_FRESHNESS = FRESHNESS_SECS["generic"]


def freshness_for(context_type: str) -> int:
    return FRESHNESS_SECS.get(context_type, _DEFAULT_FRESHNESS)


# ── Item 9: Speed tiers ───────────────────────────────────────────────────────
# Controls how long the retrieval engine waits before giving up and proceeding
# with whatever it has (or nothing).
#
#   fast     — 2s budget, top_k=3  — used when the user is mid-task
#   standard — 5s budget, top_k=5  — most contexts
#   deep     — 15s budget, top_k=7 — research / legal / complex analysis

SPEED_TIER_TIMEOUTS: dict[str, int] = {
    "fast":     2,
    "standard": 5,
    "deep":     15,
}

SPEED_TIER_TOP_K: dict[str, int] = {
    "fast":     3,
    "standard": 5,
    "deep":     7,
}

CONTEXT_SPEED_TIER: dict[str, str] = {
    "trading":            "fast",
    "trading_social":     "fast",
    "trading_charts":     "fast",
    "trading_news":       "fast",
    "trading_research":   "standard",
    "customer_support":   "fast",
    "sales":              "standard",
    "outbound":           "standard",
    "ecommerce":          "standard",
    "shopping":           "standard",
    "developer":          "standard",
    "finance":            "standard",
    "content":            "standard",
    "enterprise":         "standard",
    "real_estate":        "standard",
    "real_estate_listing":"standard",
    "real_estate_leads":  "standard",
    "real_estate_social": "standard",
    "real_estate_legal":  "deep",
    "design":             "standard",
    "research":           "deep",
    "generic":            "standard",
}

_DEFAULT_SPEED_TIER = "standard"


def speed_tier_for(context_type: str) -> str:
    return CONTEXT_SPEED_TIER.get(context_type, _DEFAULT_SPEED_TIER)


# ── Item 10: Privacy check patterns ─────────────────────────────────────────
# If any of these patterns match the screen content or extracted entities,
# retrieval is suppressed entirely — nothing leaves the machine.
# Patterns are case-insensitive regex.

PRIVACY_PATTERNS: list[str] = [
    # Credentials
    r"password",
    r"api[_\s-]?key",
    r"secret[_\s-]?key",
    r"access[_\s-]?token",
    r"bearer\s+[a-z0-9\-._~+/]+=*",
    r"private[_\s-]?key",
    r"client[_\s-]?secret",
    r"-----begin\s+(rsa|ec|private)",     # PEM keys
    # PII
    r"\b\d{3}-\d{2}-\d{4}\b",            # SSN
    r"\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}\b",  # credit card
    r"\b(dob|date\s+of\s+birth)\b",
    r"\bpassport\s+number\b",
    # HIPAA
    r"\bpatient\s+(id|name|record)\b",
    r"\bmedical\s+record\b",
    r"\bdiagnosis\b",
    r"\bprescription\b",
    r"\bphi\b",                            # protected health information
    # Confidentiality markers
    r"\bconfidential\b",
    r"\binternal\s+only\b",
    r"\bnot\s+for\s+distribution\b",
    r"\bunder\s+nda\b",
    r"\bproprietary\b",
    r"\btrade\s+secret\b",
]


# ── Item 11: Relevance gate ───────────────────────────────────────────────────
# A retrieved document is kept only if it clears this gate.
# Scoring: fraction of query keywords that appear in document content.
# Anything below RELEVANCE_MIN_SCORE is discarded before injection.

RELEVANCE_MIN_SCORE:   float = 0.25    # 25% keyword overlap minimum
RELEVANCE_MIN_CHARS:   int   = 80      # discard documents shorter than this
RELEVANCE_MAX_TOKENS:  int   = 600     # truncate documents longer than this (per doc)

# Stop-words excluded from keyword overlap calculation
RELEVANCE_STOP_WORDS: frozenset[str] = frozenset({
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "up", "is", "are", "was", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "can", "this", "that",
    "these", "those", "it", "its", "their", "they", "them", "what", "which",
    "who", "how", "when", "where", "why",
})


# ── Item 12: ContextStrategy dataclass ───────────────────────────────────────

@dataclass
class ContextStrategy:
    context_type: str

    # ── Entity extraction ────────────────────────────────────────────────────
    primary_entity_type: str        # "ticker" | "company" | "product" | "address" |
                                    # "topic" | "library" | "regulation" | "person"
    entity_hint: str                # plain-English hint for brain extraction

    # ── Query generation ─────────────────────────────────────────────────────
    # Layer 2: always-on context queries built from extracted entities.
    # Use {entity} as placeholder; query planner substitutes real values.
    layer2_templates: list[str]

    # Layer 1: action-specific additional queries.
    # Keys are action names; values are extra query templates for that action.
    # The query planner merges these with layer2_templates and deduplicates.
    layer1_action_map: dict[str, list[str]] = field(default_factory=dict)

    # ── Retrieval config ─────────────────────────────────────────────────────
    freshness_secs:    int   = field(default=0)    # 0 = use FRESHNESS_SECS lookup
    speed_tier:        str   = "standard"
    top_k:             int   = 5

    # ── Quality filters ──────────────────────────────────────────────────────
    source_hints:             list[str] = field(default_factory=list)
    min_entity_confidence:    float     = 0.5      # don't retrieve below this confidence


# ── Items 13–25: Per-context strategies ──────────────────────────────────────

STRATEGIES: dict[str, ContextStrategy] = {

    # ── Trading ───────────────────────────────────────────────────────────────
    "trading": ContextStrategy(
        context_type       = "trading",
        primary_entity_type= "ticker",
        entity_hint        = "stock tickers (e.g. AAPL, TSLA), company names, index names",
        layer2_templates   = [
            "{entity} stock news today",
            "{entity} analyst price target",
            "{entity} earnings report",
        ],
        layer1_action_map  = {
            "trade_thesis":     ["{entity} bull case thesis", "{entity} technical setup"],
            "bull_bear":        ["{entity} bear case risks", "{entity} analyst ratings"],
            "key_catalysts":    ["{entity} upcoming catalysts", "{entity} earnings calendar"],
            "market_impact":    ["{entity} sector impact", "{entity} macro exposure"],
            "trade_risks":      ["{entity} downside risks", "{entity} short interest"],
            "key_takeaways":    ["{entity} recent developments"],
            "explain_indicator":["how to read {entity}", "{entity} indicator explained"],
        },
        speed_tier         = "fast",
        top_k              = 3,
        source_hints       = ["financial news", "SEC filings", "earnings call transcripts",
                               "analyst reports"],
        min_entity_confidence = 0.6,
    ),

    "trading_news": ContextStrategy(
        context_type       = "trading_news",
        primary_entity_type= "ticker",
        entity_hint        = "tickers, companies, or macro themes in headlines",
        layer2_templates   = [
            "{entity} breaking news",
            "{entity} market reaction",
        ],
        layer1_action_map  = {
            "market_reaction":  ["{entity} price movement today", "{entity} catalyst"],
            "key_takeaways":    ["{entity} news summary"],
        },
        speed_tier         = "fast",
        top_k              = 3,
        source_hints       = ["financial news", "wire services"],
    ),

    "trading_charts": ContextStrategy(
        context_type       = "trading_charts",
        primary_entity_type= "ticker",
        entity_hint        = "ticker symbol visible on chart",
        layer2_templates   = [
            "{entity} technical analysis",
            "{entity} support resistance levels",
        ],
        layer1_action_map  = {
            "explain_indicator": ["{entity} chart pattern explained"],
            "trade_thesis":      ["{entity} chart setup today"],
        },
        speed_tier         = "fast",
        top_k              = 3,
        source_hints       = ["technical analysis", "financial news"],
    ),

    "trading_social": ContextStrategy(
        context_type       = "trading_social",
        primary_entity_type= "ticker",
        entity_hint        = "tickers and companies mentioned in social posts",
        layer2_templates   = [
            "{entity} social sentiment",
            "{entity} retail investor discussion",
        ],
        speed_tier         = "fast",
        top_k              = 3,
        source_hints       = ["financial news", "social sentiment"],
    ),

    "trading_research": ContextStrategy(
        context_type       = "trading_research",
        primary_entity_type= "company",
        entity_hint        = "company name or sector being researched",
        layer2_templates   = [
            "{entity} research report",
            "{entity} competitive landscape",
            "{entity} industry analysis",
        ],
        layer1_action_map  = {
            "summarize":   ["{entity} investment thesis"],
            "pros_cons":   ["{entity} strengths weaknesses"],
        },
        speed_tier         = "standard",
        top_k              = 5,
        source_hints       = ["analyst reports", "financial research", "SEC filings"],
    ),

    # ── Sales ─────────────────────────────────────────────────────────────────
    "sales": ContextStrategy(
        context_type       = "sales",
        primary_entity_type= "company",
        entity_hint        = "prospect company name, contact name, deal name",
        layer2_templates   = [
            "{entity} company news",
            "{entity} recent funding or acquisition",
            "{entity} tech stack",
        ],
        layer1_action_map  = {
            "reply":       ["{entity} pain points", "{entity} industry challenges"],
            "follow_up":   ["{entity} recent announcement"],
            "summarize":   ["{entity} company overview", "{entity} competitors"],
        },
        speed_tier         = "standard",
        top_k              = 5,
        source_hints       = ["company news", "Crunchbase", "LinkedIn signals",
                               "job postings as intent signals"],
        min_entity_confidence = 0.55,
    ),

    # ── Outbound ──────────────────────────────────────────────────────────────
    "outbound": ContextStrategy(
        context_type       = "outbound",
        primary_entity_type= "company",
        entity_hint        = "prospect company or person being messaged",
        layer2_templates   = [
            "{entity} company news last 2 weeks",
            "{entity} leadership changes",
            "{entity} job postings",
        ],
        layer1_action_map  = {
            "reply":    ["{entity} recent activity", "{entity} product launches"],
            "options":  ["{entity} pain points in {context_detail}"],
        },
        speed_tier         = "standard",
        top_k              = 4,
        source_hints       = ["company news", "job boards", "LinkedIn", "press releases"],
    ),

    # ── Customer support ──────────────────────────────────────────────────────
    "customer_support": ContextStrategy(
        context_type       = "customer_support",
        primary_entity_type= "product",
        entity_hint        = "product name and the specific issue or error described",
        layer2_templates   = [
            "{entity} known issues",
            "{entity} support documentation",
            "{entity} community forum solution",
        ],
        layer1_action_map  = {
            "reply":    ["{entity} troubleshooting guide", "{entity} FAQ"],
            "explain":  ["{entity} how it works", "{entity} documentation"],
            "options":  ["{entity} alternative solutions"],
        },
        speed_tier         = "fast",
        top_k              = 3,
        source_hints       = ["official docs", "community forums", "support tickets",
                               "GitHub issues"],
    ),

    # ── Ecommerce ─────────────────────────────────────────────────────────────
    "ecommerce": ContextStrategy(
        context_type       = "ecommerce",
        primary_entity_type= "product",
        entity_hint        = "product name, brand, and category",
        layer2_templates   = [
            "{entity} customer reviews",
            "{entity} vs alternatives",
            "{entity} common complaints",
        ],
        layer1_action_map  = {
            "pros_cons":   ["{entity} pros cons", "{entity} review summary"],
            "summarize":   ["{entity} best features", "{entity} buyer feedback"],
            "compare_listings": ["{entity} comparison", "{entity} price comparison"],
        },
        speed_tier         = "standard",
        top_k              = 5,
        source_hints       = ["product reviews", "comparison sites", "Reddit discussions"],
    ),

    "shopping": ContextStrategy(
        context_type       = "shopping",
        primary_entity_type= "product",
        entity_hint        = "product name and category visible on shopping page",
        layer2_templates   = [
            "{entity} reviews",
            "{entity} better alternatives",
            "{entity} price history",
        ],
        speed_tier         = "standard",
        top_k              = 4,
        source_hints       = ["review sites", "shopping comparison"],
    ),

    # ── Developer ─────────────────────────────────────────────────────────────
    "developer": ContextStrategy(
        context_type       = "developer",
        primary_entity_type= "library",
        entity_hint        = "library/framework name, API name, error message, or language",
        layer2_templates   = [
            "{entity} official documentation",
            "{entity} usage examples",
            "{entity} best practices",
        ],
        layer1_action_map  = {
            "explain":   ["{entity} explained", "how does {entity} work"],
            "review":    ["{entity} code review checklist", "{entity} anti-patterns"],
            "summarize": ["{entity} overview", "{entity} changelog"],
            "options":   ["{entity} alternatives", "{entity} vs alternatives"],
            "inspect":   ["{entity} known vulnerabilities", "{entity} CVE"],
        },
        speed_tier         = "standard",
        top_k              = 5,
        source_hints       = ["official docs", "GitHub", "Stack Overflow",
                               "package registries", "MDN", "RFC"],
    ),

    # ── Finance ───────────────────────────────────────────────────────────────
    "finance": ContextStrategy(
        context_type       = "finance",
        primary_entity_type= "company",
        entity_hint        = "company name, financial metric, or industry sector",
        layer2_templates   = [
            "{entity} financial results",
            "{entity} industry benchmarks",
            "{entity} peer comparison",
        ],
        layer1_action_map  = {
            "summarize":        ["{entity} earnings summary", "{entity} financial highlights"],
            "pros_cons":        ["{entity} investment thesis pros cons"],
            "key_takeaways":    ["{entity} key financial metrics"],
            "risk_summary":     ["{entity} financial risks", "{entity} debt situation"],
            "guidance_summary": ["{entity} forward guidance", "{entity} management outlook"],
            "important_changes":["what changed for {entity} this quarter"],
        },
        speed_tier         = "standard",
        top_k              = 5,
        source_hints       = ["earnings reports", "SEC filings", "industry reports",
                               "analyst notes"],
    ),

    # ── Real estate ───────────────────────────────────────────────────────────
    "real_estate": ContextStrategy(
        context_type       = "real_estate",
        primary_entity_type= "address",
        entity_hint        = "property address, neighborhood, city, or zip code",
        layer2_templates   = [
            "{entity} comparable sales",
            "{entity} real estate market trends",
            "{entity} neighborhood overview",
        ],
        layer1_action_map  = {
            "selling_points":        ["{entity} desirable features", "{entity} buyer appeal"],
            "neighborhood_highlights":["{entity} walkability", "{entity} schools rating",
                                       "{entity} amenities nearby"],
            "investment_potential":  ["{entity} rental yield", "{entity} appreciation trend",
                                      "{entity} cap rate"],
            "client_summary":        ["{entity} market report"],
            "compare_listings":      ["{entity} vs nearby listings"],
        },
        speed_tier         = "standard",
        top_k              = 5,
        source_hints       = ["MLS data", "Zillow/Redfin", "market reports",
                               "school ratings", "walk score"],
    ),

    "real_estate_listing": ContextStrategy(
        context_type       = "real_estate_listing",
        primary_entity_type= "address",
        entity_hint        = "listing address, property type, price",
        layer2_templates   = [
            "{entity} comparable sales",
            "{entity} days on market trends",
        ],
        layer1_action_map  = {
            "selling_points":    ["{entity} buyer appeal", "{entity} market positioning"],
            "compare_listings":  ["{entity} nearby active listings"],
            "best_for_families": ["{entity} schools", "{entity} family amenities"],
        },
        speed_tier         = "standard",
        top_k              = 5,
        source_hints       = ["MLS", "Zillow", "Redfin", "realtor.com"],
    ),

    "real_estate_leads": ContextStrategy(
        context_type       = "real_estate_leads",
        primary_entity_type= "person",
        entity_hint        = "lead name, location they are interested in, budget signals",
        layer2_templates   = [
            "{entity} neighborhood listings",
            "{entity} area market update",
        ],
        speed_tier         = "standard",
        top_k              = 4,
        source_hints       = ["MLS", "market reports"],
    ),

    "real_estate_social": ContextStrategy(
        context_type       = "real_estate_social",
        primary_entity_type= "topic",
        entity_hint        = "real estate market topic, neighborhood, or trend being posted about",
        layer2_templates   = [
            "{entity} real estate trends",
            "{entity} housing market news",
        ],
        speed_tier         = "standard",
        top_k              = 3,
        source_hints       = ["market reports", "local news"],
    ),

    "real_estate_legal": ContextStrategy(
        context_type       = "real_estate_legal",
        primary_entity_type= "topic",
        entity_hint        = "contract clause name, legal term, or disclosure type",
        layer2_templates   = [
            "{entity} real estate contract explanation",
            "{entity} legal definition",
            "{entity} disclosure requirements",
        ],
        layer1_action_map  = {
            "explain_contract": ["{entity} meaning in real estate contract",
                                  "{entity} buyer seller implications"],
            "contract_risks":   ["{entity} common risks", "{entity} red flags in contract"],
        },
        speed_tier         = "deep",
        top_k              = 5,
        source_hints       = ["real estate law", "NAR guidelines", "state disclosure laws"],
    ),

    # ── Research ──────────────────────────────────────────────────────────────
    "research": ContextStrategy(
        context_type       = "research",
        primary_entity_type= "topic",
        entity_hint        = "research topic, study name, methodology, or academic term",
        layer2_templates   = [
            "{entity} academic research",
            "{entity} systematic review",
            "{entity} recent studies",
        ],
        layer1_action_map  = {
            "summarize":        ["{entity} research summary", "{entity} key findings"],
            "explain":          ["{entity} explained", "{entity} simple explanation"],
            "pros_cons":        ["{entity} evidence for against"],
            "key_takeaways":    ["{entity} research conclusions"],
            "counterarguments": ["{entity} conflicting studies", "{entity} criticism"],
        },
        speed_tier         = "deep",
        top_k              = 7,
        source_hints       = ["PubMed", "arXiv", "Google Scholar", "citation databases",
                               "peer-reviewed journals"],
    ),

    # ── Content ───────────────────────────────────────────────────────────────
    "content": ContextStrategy(
        context_type       = "content",
        primary_entity_type= "topic",
        entity_hint        = "content topic, trend, platform name (e.g. LinkedIn, Twitter)",
        layer2_templates   = [
            "{entity} trending content",
            "{entity} viral posts examples",
            "{entity} engagement benchmarks",
        ],
        layer1_action_map  = {
            "summarize":   ["{entity} content performance", "{entity} what's working now"],
            "options":     ["{entity} content angle ideas", "{entity} hook examples"],
        },
        speed_tier         = "standard",
        top_k              = 4,
        source_hints       = ["social media", "content analytics", "trending topics"],
    ),

    # ── Enterprise ────────────────────────────────────────────────────────────
    "enterprise": ContextStrategy(
        context_type       = "enterprise",
        primary_entity_type= "regulation",
        entity_hint        = "regulation name, process name, compliance standard, org name",
        layer2_templates   = [
            "{entity} compliance requirements",
            "{entity} best practices",
            "{entity} regulatory update",
        ],
        layer1_action_map  = {
            "summarize":        ["{entity} overview", "{entity} key requirements"],
            "explain":          ["{entity} what it means", "{entity} how to comply"],
            "risk_summary":     ["{entity} risks of non-compliance"],
            "key_takeaways":    ["{entity} latest changes"],
            "important_changes":["recent {entity} regulatory changes"],
        },
        speed_tier         = "standard",
        top_k              = 5,
        source_hints       = ["regulatory bodies", "compliance guides", "industry reports",
                               "governance frameworks"],
    ),

    # ── Design ────────────────────────────────────────────────────────────────
    "design": ContextStrategy(
        context_type       = "design",
        primary_entity_type= "topic",
        entity_hint        = "UI component name, design pattern, color system, or tool name",
        layer2_templates   = [
            "{entity} design patterns",
            "{entity} accessibility guidelines",
            "{entity} examples",
        ],
        layer1_action_map  = {
            "explain":   ["{entity} design principles", "when to use {entity}"],
            "review":    ["{entity} best practices", "{entity} common mistakes"],
            "options":   ["{entity} variations", "alternatives to {entity}"],
        },
        speed_tier         = "standard",
        top_k              = 5,
        source_hints       = ["design systems", "Material Design", "HIG", "WCAG",
                               "Figma community", "CSS documentation"],
    ),

    # ── Generic fallback ──────────────────────────────────────────────────────
    "generic": ContextStrategy(
        context_type       = "generic",
        primary_entity_type= "topic",
        entity_hint        = "main subject, person, place, or concept on screen",
        layer2_templates   = [
            "{entity}",
            "{entity} overview",
        ],
        speed_tier         = "standard",
        top_k              = 3,
        source_hints       = ["general web"],
        min_entity_confidence = 0.65,   # higher bar for generic — avoid noise
    ),
}


# ── Item 6: Query planner spec ────────────────────────────────────────────────
# The query planner takes (entities, context_type, action) and returns a
# deduplicated list of search queries to run.
#
# Algorithm (implemented in Phase 3 retrieval_engine.py):
#   1. Look up strategy = STRATEGIES.get(context_type, STRATEGIES["generic"])
#   2. Layer 2: for each entity, expand strategy.layer2_templates → query list L2
#   3. Layer 1: if action in strategy.layer1_action_map, expand those templates → L1
#   4. Merge: L1 + L2, deduplicate by normalised string
#   5. Trim to strategy.top_k queries (Layer 1 queries take priority)
#   6. If entities empty or confidence < strategy.min_entity_confidence: return []
#
# Template variables:
#   {entity}         — primary extracted entity value
#   {context_detail} — optional secondary detail (e.g. industry, sub-topic)
#   {action}         — action name (rarely needed but available)

QUERY_PLANNER_MAX_QUERIES = 6   # hard cap across both layers


# ── Item 7: Entity extraction hints (summary view) ───────────────────────────
# These are the entity_hint strings from each strategy, collected for quick
# lookup by the brain's entity extractor (Phase 3).

ENTITY_HINTS: dict[str, str] = {
    k: v.entity_hint for k, v in STRATEGIES.items()
}


# ── Lookup helpers ────────────────────────────────────────────────────────────

def get_strategy(context_type: str) -> ContextStrategy:
    """Return strategy for a context, falling back to generic."""
    return STRATEGIES.get(context_type, STRATEGIES["generic"])


def should_retrieve(action: str, context_type: str, entity_confidence: float = 1.0) -> bool:
    """
    True if retrieval should run for this action + context combination.
    Respects the action gate and entity confidence threshold.
    """
    if action in SKIP_ACTIONS:
        return False
    if action in RETRIEVE_ACTIONS:
        strategy = get_strategy(context_type)
        return entity_confidence >= strategy.min_entity_confidence
    if action in MAYBE_ACTIONS:
        if context_type == "generic":
            return False
        strategy = get_strategy(context_type)
        return entity_confidence >= 0.7
    return False
