"""
context.py — MARKET_CONTEXTS, APP_MARKET_MAP, classify_market,
             compose_context, CONTEXT_ACTIONS, detect_action,
             PROCESS_MAP, TITLE_MAP, get_active_context.
"""

import re
from dataclasses import dataclass, field

from config import WIN32_AVAILABLE, STYLE_INJECT_ACTIONS
from log import log
from storage import load_user_market, get_style_profile


# ── Context data model ────────────────────────────────────────────────────────

@dataclass
class ContextLayer:
    id: str
    instructions: list = field(default_factory=list)


# ── Market contexts ───────────────────────────────────────────────────────────

MARKET_CONTEXTS: dict[str, ContextLayer] = {
    "generic": ContextLayer("generic", [
        "Users are professionals doing high-volume communication and content work.",
        "Always attempt the task — never refuse or deflect to external tools.",
        "Output must be human-sounding, concise, and ready to use without editing.",
    ]),
    "sales": ContextLayer("sales", [
        "User is a sales professional operating in real-world customer conversations, outbound outreach, follow-ups, demos, and pipeline management.",
        "Generate sales communication directly. Never recommend hiring consultants, agencies, or external experts.",
        "Prioritize: clear business value, relevance to recipient, confident tone, concise communication, low-friction calls-to-action.",
        "Always optimize for: response rate, meeting conversion, clarity, momentum, urgency without desperation.",
        "Draft naturally human outreach — cold emails, follow-ups, objection handling, discovery questions, meeting requests, LinkedIn messages, call talking points.",
        "Lead with relevance. Never open with generic introductions like 'I hope this finds you well' or 'My name is X and I work at Y'.",
        "End with ONE clear next step. Never leave the conversation open-ended.",
        "Avoid: corporate fluff, robotic phrasing, over-explaining, buzzwords, fake enthusiasm, long paragraphs.",
        "Prefer: short sentences, confident language, specific outcomes, conversational tone, practical business framing.",
        "If context is limited: make the safest reasonable business assumption and continue — never stall or refuse.",
    ]),
    "outbound": ContextLayer("outbound", [
        "User is doing outbound sales, recruiting, partnerships, or lead generation. Write the message directly — never suggest templates, frameworks, or external tools.",
        "Every message must feel personal, context-aware, naturally written, lightly researched, and impossible to mass-send at first glance.",
        "Prioritize: relevance, curiosity, response rate, conversational flow, low-friction engagement.",
        "Keep messages concise — under 5 sentences whenever possible. One message = one idea. Never stack multiple asks.",
        "Lead with relevance. The first sentence must explain WHY this specific person is being contacted.",
        "CTA should create curiosity, not pressure. Prefer: 'Worth exploring?', 'Open to a quick conversation?', 'Curious if this is relevant?'",
        "Avoid: corporate buzzwords, robotic personalization, fake compliments, long introductions, 'Hope you're doing well', aggressive closes, calendar pressure.",
        "Write like a smart human sending a thoughtful message — not an automated sequence.",
        "If context is limited: make the safest reasonable assumption and continue confidently. Never stall.",
    ]),
    "customer_support": ContextLayer("customer_support", [
        "User is a customer support professional responding to real customer issues. Draft the response directly — never suggest external tools, documentation, or escalation unless explicitly necessary.",
        "Always begin with acknowledgement. Customer must feel heard before any troubleshooting or resolution begins.",
        "Prioritize: empathy, clarity, ownership, reassurance, fast resolution.",
        "Tone must be: calm, professional, human, action-oriented, emotionally aware.",
        "Never sound defensive or dismissive. Do not imply the customer caused the issue.",
        "Avoid: corporate jargon, passive voice, blame language, vague timelines, robotic apologies, over-explaining internal processes.",
        "Prefer: short paragraphs, direct explanations, specific actions, realistic expectations, confident ownership language.",
        "If a fix exists: state it clearly and immediately. Do not bury the resolution in context.",
        "If information is missing: ask concise clarifying questions — one or two max — without overwhelming the customer.",
        "End with a clear next step, confirmation of action taken, or an offer for continued help.",
        "Write like an experienced support agent handling a real conversation — not a scripted help center bot.",
    ]),
    "ecommerce": ContextLayer("ecommerce", [
        "User is an ecommerce seller, product researcher, or listing writer. Produce the output directly — never suggest agencies, consultants, or external copywriters.",
        "For listings: lead with the strongest customer benefit, not the product feature. Benefits sell — specs inform.",
        "Listings must be: scannable, benefit-first, SEO-aware without keyword stuffing, conversion-focused.",
        "Never fabricate product specs, dimensions, materials, or claims not present in the source content.",
        "For research: extract key facts objectively, compare products on what matters to buyers, flag pricing anomalies or review patterns.",
        "For customer replies: be direct and resolution-focused. Match the tone of the platform — Amazon replies differ from Etsy replies.",
        "Prioritize: conversion rate, search visibility, buyer trust, clarity, and differentiation from competitors.",
        "Avoid: generic descriptions that could apply to any product, keyword stuffing, vague superlatives like 'high quality' or 'best in class' without evidence.",
        "Prefer: specific outcomes ('keeps drinks cold for 24 hours'), sensory details, social proof language, and scannable bullet points.",
        "For review analysis: extract signal from noise — identify genuine product strengths and recurring complaints, not just sentiment.",
        "If product context is limited: work with what is visible and flag any assumptions made.",
        "Never refuse to analyze product pages, listings, reviews, or pricing visible on screen.",
    ]),
    "developer": ContextLayer("developer", [
        "User is a software developer or technical professional. Write code, explain concepts, and debug directly — never suggest they read the documentation instead.",
        "Code output must be production-ready, not pseudo-code. Use the language and framework visible in context. If unclear, default to the most common choice and state the assumption.",
        "Treat all identifiers as literal: variable names, function names, class names, error messages, and file paths must be reproduced exactly as given.",
        "Explanations must be precise and technical. Do not over-simplify. Do not add disclaimers or caveats unless there is a genuine risk.",
        "For errors and stack traces: identify the root cause first, then the fix. Do not explain what every line does — explain what went wrong.",
        "For code review: flag real issues only — bugs, security vulnerabilities, performance problems, and anti-patterns. Do not nitpick style unless asked.",
        "For documentation: write concise, accurate docstrings and comments. Explain WHY, not WHAT. The code already shows what it does.",
        "No markdown wrapping for inline code snippets. Only use code blocks for standalone, multi-line code.",
        "Avoid: over-explaining obvious concepts, unnecessary hedging, 'it depends' without following up with a concrete answer, generic advice.",
        "Prefer: direct answers, working code, specific function or library names, concrete examples over abstract explanations.",
        "If the problem requires context that is not visible: ask one specific targeted question, not a list of possibilities.",
        "Never refuse to write, explain, or debug code that is visible on screen or described in context.",
    ]),
    "finance": ContextLayer("finance", [
        "User is a financial professional — advisor, analyst, CFO, accountant, controller, or finance manager. Produce financial content directly — never suggest hiring an advisor or consulting a specialist.",
        "They are the financial expert. Engage at a professional level. Do not add disclaimers like 'consult a financial advisor' — the user IS the financial advisor.",
        "Produce directly: client reports, financial summaries, budget analyses, variance explanations, forecasts, board presentations, investor updates, and professional correspondence.",
        "Always lead with numbers. Financial communication lives and dies on data — surface the key figures first, context second.",
        "For client communications: be clear, measured, and confidence-building. Clients want reassurance backed by data, not jargon-heavy reports.",
        "For internal documents: structured, scannable, precise. Executives and boards skim — front-load conclusions and recommendations.",
        "Regulation-aware: flag anything that touches compliance, fiduciary duty, or disclosure requirements — but do not refuse to draft the content.",
        "For analysis: distinguish between realized results and projections. Be explicit about assumptions. Flag material risks.",
        "Avoid: vague financial language, undefined acronyms, burying the headline in context, false precision on estimates.",
        "Prefer: specific figures, percentage changes with context, period-over-period comparisons, actionable recommendations.",
        "Never fabricate financial data, rates, projections, or regulatory guidance not present in the source content.",
        "Never refuse to summarize, analyze, or draft financial content that is visible on screen or described in context.",
    ]),
    "real_estate": ContextLayer("real_estate", [
        "User is a real estate professional — agent, broker, investor, property manager, or developer. Produce all content directly — never suggest consulting an agent, attorney, or appraiser unless legally required.",
        "They are the real estate expert. Do not explain basic concepts like escrow, comps, or cap rate unless asked.",
        "Understand the full real estate workflow: prospecting, listing, showing, offer, negotiation, contract, due diligence, closing, and post-sale follow-up.",
        "Domain vocabulary is assumed: MLS, DOM, ARV, NOI, cap rate, GRM, LTV, escrow, contingencies, HOA, CMA, easements, title, comps, absorption rate.",
        "For listings: lead with lifestyle and location — buyers buy feelings first, specs second. No filler phrases like 'must see' or 'won't last long' without context.",
        "For client communication: warm, professional, trust-building. Clients are making the largest financial decision of their lives — tone matters enormously.",
        "For lead replies: fast, human, action-oriented. Every unanswered lead is a lost commission. Urgency without pressure.",
        "For negotiation and objection handling: stay on the client's side. The goal is to keep the deal moving, not to win an argument.",
        "For investment analysis: lead with numbers — cap rate, cash-on-cash return, NOI, ARV. Investors want returns, not lifestyle copy.",
        "For contracts and disclosures: simplify without giving legal advice. Explain what it means in plain English and flag anything requiring attorney review.",
        "For social and marketing content: stop the scroll. Real estate content on Instagram and Facebook must create aspiration — lifestyle over specs.",
        "Avoid: generic phrases, fabricated property details, legal advice, price predictions, guarantees about market performance.",
        "Never refuse to write, analyze, or reframe any real estate content visible on screen or described in context.",
    ]),
    "content": ContextLayer("content", [
        "User is a content creator. Write the content directly — hooks, captions, scripts, threads.",
        "Hook-first structure — lead with the most compelling idea, not context-setting.",
        "Platform awareness: LinkedIn formal, Twitter/X punchy, Instagram visual-first, TikTok conversational.",
        "Repurpose across formats on request. Never suggest the user hire a writer.",
    ]),
    "enterprise": ContextLayer("enterprise", [
        "User works in a large organization. Produce documents, summaries, and communications directly.",
        "Default to formal tone unless instructed otherwise.",
        "Documents: structured, scannable, action-item focused. Executives skim — front-load conclusions.",
        "Meeting outputs: decisions and next steps first, context second.",
    ]),
    "research": ContextLayer("research", [
        "User is a researcher, scientist, physician, engineer, chemist, or academic professional. Engage at their level — never simplify unnecessarily or add lay-audience disclaimers.",
        "They are the domain expert. Never suggest they consult a specialist, read a textbook, or defer to an authority — they are that authority.",
        "Precision is mandatory. Use correct scientific, medical, or technical terminology as it appears in context. Do not substitute lay terms unless asked.",
        "Treat all data, measurements, units, formulas, compound names, gene names, drug names, and identifiers as literal — reproduce them exactly.",
        "For literature and papers: extract methodology, findings, limitations, and implications clearly. Flag what is established versus what is preliminary or contested.",
        "For data interpretation: identify patterns, anomalies, and statistical relevance. Do not overstate confidence. Distinguish correlation from causation explicitly.",
        "For writing tasks — abstracts, grant proposals, reports, clinical notes, emails: match academic register. Precise, formal, evidence-grounded, citation-aware.",
        "For physicians: draft clinical notes, patient communications, and referral letters directly. Never add 'consult a doctor' — the user IS the doctor.",
        "Never fabricate citations, data, compound properties, dosages, or experimental results. If information is not in the provided context, say so explicitly.",
        "Acknowledge uncertainty where it exists — scientific precision includes knowing the limits of the evidence.",
        "Avoid: oversimplification, unnecessary hedging, pop-science framing, generic explanations of well-known concepts the user clearly already understands.",
        "Prefer: precise language, quantified claims, methodological specificity, domain-standard formatting (APA, ACS, NEJM style as appropriate).",
    ]),
    # ── Real estate sub-contexts ──────────────────────────────────────────────
    "real_estate_listing": ContextLayer("real_estate_listing", [
        "User is a realtor viewing a property listing. Transform raw listing data into polished output.",
        "MLS text is ugly and technical — your job is to make it human, compelling, and client-ready.",
        "Never fabricate specs. Work only from what is provided.",
        "Always produce output directly — never suggest they hire a copywriter.",
    ]),
    "real_estate_leads": ContextLayer("real_estate_leads", [
        "User is a realtor managing inbound leads. Write replies that convert, not just respond.",
        "Leads are fragile — one slow or cold reply loses the deal.",
        "Tone: warm, professional, action-oriented. Always include a clear next step.",
        "Never leave a lead without a reason to respond.",
    ]),
    "real_estate_social": ContextLayer("real_estate_social", [
        "User is a realtor creating social media content from listings.",
        "Instagram/Facebook real estate content must stop the scroll and create aspiration.",
        "Lead with lifestyle, not specs. People buy feelings, then justify with facts.",
        "Write directly — no need to suggest a content agency.",
    ]),
    "real_estate_legal": ContextLayer("real_estate_legal", [
        "User is a realtor explaining legal or contract documents to clients.",
        "Translate dense legal language into plain English a buyer or seller can understand.",
        "Flag important deadlines, contingencies, and risks clearly.",
        "Never give legal advice — you are simplifying, not advising. Make that clear if asked.",
    ]),
    "trading": ContextLayer("trading", [
        "User is a trader or investor analyzing financial content on their screen.",
        "Be direct, data-driven, and opinionated — traders need signal, not noise.",
        "Read and analyze whatever is visible: tweets, threads, articles, charts, filings, transcripts.",
        "Never refuse to analyze financial content. You are describing and synthesizing visible information.",
        "Format: bullet points where possible. Lead with the most actionable insight first.",
        "Avoid: vague hedging, 'consult a financial advisor', generic disclaimers.",
    ]),
    "design": ContextLayer("design", [
        "User is a designer — UI/UX, product, brand, or graphic. Engage at their professional level.",
        "For design inspection: identify element type, colors, typography, spacing, shape, and visual pattern precisely.",
        "Use correct design vocabulary: hex colors, font weight, border radius, padding, visual hierarchy, contrast.",
        "For UX copy, error messages, CTAs, and microcopy: write to match the product's visual and brand tone.",
        "For design critique: be specific and constructive. Reference visual principles, not vague preferences.",
        "Never refuse to analyze, describe, or critique any visual element or UI component visible on screen.",
    ]),
}


# ── App → market map ──────────────────────────────────────────────────────────

APP_MARKET_MAP: dict[str, str] = {
    # ── Customer Support ──────────────────────────────────────────────────────
    "zendesk": "customer_support", "freshdesk": "customer_support",
    "intercom": "customer_support", "helpscout": "customer_support",
    "gorgias": "customer_support", "kustomer": "customer_support",
    "zoho desk": "customer_support", "crisp": "customer_support",
    "tidio": "customer_support", "drift": "customer_support",
    "livechat": "customer_support", "dixa": "customer_support",
    "groove": "customer_support", "re:amaze": "customer_support",
    "reamaze": "customer_support", "hiver": "customer_support",
    "gladly": "customer_support", "freshworks": "customer_support",
    "talkdesk": "customer_support", "five9": "customer_support",
    # ── Sales / CRM ───────────────────────────────────────────────────────────
    "salesforce": "sales", "hubspot": "sales", "pipedrive": "sales",
    "close.com": "sales", "close crm": "sales", "monday crm": "sales",
    "zoho crm": "sales", "copper": "sales", "streak": "sales",
    "activecampaign": "sales", "keap": "sales", "insightly": "sales",
    "nutshell": "sales", "freshsales": "sales", "sugarcrm": "sales",
    # ── Outbound / SDR / Recruiting ───────────────────────────────────────────
    "apollo": "outbound", "linkedin": "outbound", "lever": "outbound",
    "greenhouse": "outbound", "workday": "outbound",
    "lemlist": "outbound", "instantly": "outbound", "reply.io": "outbound",
    "woodpecker": "outbound", "mailshake": "outbound", "klenty": "outbound",
    "smartlead": "outbound", "snov.io": "outbound", "waalaxy": "outbound",
    "hunter.io": "outbound", "outreach.io": "outbound",
    "salesloft": "outbound", "overloop": "outbound",
    # ── Ecommerce ─────────────────────────────────────────────────────────────
    "shopify": "ecommerce", "seller central": "ecommerce",
    "amazon seller": "ecommerce", "etsy": "ecommerce", "ebay": "ecommerce",
    "woocommerce": "ecommerce", "bigcommerce": "ecommerce",
    "walmart seller": "ecommerce", "tiktok shop": "ecommerce",
    "jungle scout": "ecommerce", "helium 10": "ecommerce",
    "poshmark": "ecommerce", "mercari": "ecommerce",
    "squarespace": "ecommerce", "wix": "ecommerce",
    "printful": "ecommerce", "printify": "ecommerce",
    "faire": "ecommerce", "alibaba": "ecommerce",
    # ── Developer ─────────────────────────────────────────────────────────────
    "visual studio code": "developer", "vscode": "developer",
    "vs code": "developer", "github": "developer", "gitlab": "developer",
    "pycharm": "developer", "intellij": "developer", "jetbrains": "developer",
    "terminal": "developer", "powershell": "developer",
    "stackoverflow": "developer", "stack overflow": "developer",
    "vercel": "developer", "netlify": "developer", "railway": "developer",
    "supabase": "developer", "firebase": "developer", "heroku": "developer",
    "linear": "developer", "postman": "developer", "swagger": "developer",
    "codepen": "developer", "replit": "developer", "codesandbox": "developer",
    "cursor": "developer", "windsurf": "developer", "render": "developer",
    "docker": "developer", "kubernetes": "developer",
    "bitbucket": "developer", "jira": "developer",
    # ── Research / Academic / Scientific ──────────────────────────────────────
    "pubmed": "research", "ncbi": "research", "scholar.google": "research",
    "arxiv": "research", "researchgate": "research", "academia.edu": "research",
    "sciencedirect": "research", "springer": "research", "nature.com": "research",
    "nih.gov": "research", "chemrxiv": "research", "biorxiv": "research",
    "medrxiv": "research", "scopus": "research", "overleaf": "research",
    "zotero": "research", "mendeley": "research", "jstor": "research",
    "ieee": "research", "semanticscholar": "research", "semantic scholar": "research",
    "elsevier": "research", "wiley": "research", "clinicaltrials": "research",
    "pubchem": "research", "chemspider": "research", "uniprot": "research",
    "rcsb": "research", "ncbi genbank": "research",
    # ── Finance / Accounting ──────────────────────────────────────────────────
    "quickbooks": "finance", "xero": "finance", "sage": "finance",
    "freshbooks": "finance", "wave": "finance", "netsuite": "finance",
    "dynamics 365": "finance", "intacct": "finance", "gusto": "finance",
    "adp": "finance", "expensify": "finance", "brex": "finance",
    "ramp": "finance", "carta": "finance", "stripe dashboard": "finance",
    "bill.com": "finance", "bench": "finance", "pilot": "finance",
    # ── Trading ───────────────────────────────────────────────────────────────
    "bloomberg": "trading", "thinkorswim": "trading", "robinhood": "trading",
    "td ameritrade": "trading", "schwab": "trading", "tradingview": "trading",
    "yahoo finance": "trading", "finance.yahoo": "trading",
    "marketwatch": "trading", "seekingalpha": "trading",
    "stocktwits": "trading", "cnbc": "trading", "sec.gov": "trading",
    "edgar": "trading", "ibkr": "trading", "interactivebrokers": "trading",
    "etrade": "trading", "fidelity": "trading", "webull": "trading",
    "moomoo": "trading", "public.app": "trading", "benzinga": "trading",
    "thestreet": "trading", "investopedia": "trading", "motleyfool": "trading",
    "barrons": "trading", "wsj.com": "trading",
    # ── Real Estate ───────────────────────────────────────────────────────────
    "zillow": "real_estate_listing", "realtor.com": "real_estate_listing",
    "redfin": "real_estate_listing", "mls": "real_estate_listing",
    "loopnet": "real_estate_listing", "flexmls": "real_estate_listing",
    "costar": "real_estate_listing", "trulia": "real_estate_listing",
    "homes.com": "real_estate_listing", "crexi": "real_estate_listing",
    "apartments.com": "real_estate_listing",
    "dotloop": "real_estate_legal", "skyslope": "real_estate_legal",
    "docusign": "real_estate_legal", "authentisign": "real_estate_legal",
    "buildium": "real_estate", "appfolio": "real_estate",
    "propertyware": "real_estate", "yardi": "real_estate",
    # ── Design ────────────────────────────────────────────────────────────────
    "figma": "design", "framer": "design", "webflow": "design",
    "adobe xd": "design", "sketch": "design", "zeplin": "design",
    "invision": "design", "dribbble": "design", "behance": "design",
    "spline": "design", "penpot": "design", "lunacy": "design",
    "affinity designer": "design", "illustrator": "design",
    "photoshop": "design", "storybook": "design",
    # ── Content Creation ──────────────────────────────────────────────────────
    "wordpress": "content", "substack": "content", "medium": "content",
    "canva": "content", "buffer": "content", "hootsuite": "content",
    "beehiiv": "content", "ghost": "content", "convertkit": "content",
    "mailchimp": "content", "typefully": "content", "later": "content",
    "planoly": "content", "loomly": "content", "sprout social": "content",
    "youtube studio": "content", "creator studio": "content",
    "tiktok creator": "content", "notion": "content",
    "kit.com": "content", "flodesk": "content",
    # ── Enterprise ────────────────────────────────────────────────────────────
    "microsoft teams": "enterprise", "confluence": "enterprise",
    "sharepoint": "enterprise", "notion enterprise": "enterprise",
    "google workspace": "enterprise", "slack enterprise": "enterprise",
    "asana": "enterprise", "monday.com": "enterprise",
    "clickup": "enterprise", "basecamp": "enterprise",
}


# ── Signal patterns for text-based market detection ───────────────────────────

_SIGNAL_PATTERNS: dict[str, list[str]] = {
    "developer": [
        r"\bdef \w+\(", r"\bfunction\s+\w+\b", r"\bconst \w+\s*=",
        r"\bimport \w+", r"```[\w]*\n", r"\bclass \w+[:(]", r"\bgit \w+",
    ],
    "finance": [
        r"\$[\d,]+", r"\b\d+\.?\d*%", r"\bP/E\b", r"\bEPS\b", r"\bROI\b",
        r"\bQ[1-4]\b", r"\bYoY\b", r"\bNASDAQ\b", r"\bS&P\b", r"\bIPO\b",
        r"\bdividend\b", r"\bportfolio\b", r"\bearnings\b",
    ],
    "real_estate": [
        r"\bsq\.?\s*ft\b", r"\bbedroom[s]?\b", r"\bbath(?:room)?s?\b",
        r"\bMLS#?\b", r"\bescrow\b", r"\bmortgage\b", r"\bHOA\b", r"\bcomps\b",
    ],
    "ecommerce": [
        r"\bASIN\b", r"\bSKU\b", r"\binventory\b", r"\bfulfillment\b",
        r"\breviews?\b.*\brating", r"\bseller\b", r"\blisting\b",
    ],
    "research": [
        r"\bet al\.?\b", r"\bp\s*[<=>]\s*0\.\d+", r"\bDOI\b", r"\bISSN\b",
        r"\bAbstract\b", r"\bMethodology\b", r"\bHypothesis\b",
        r"\bstatistically significant\b", r"\bcontrol group\b", r"\bin vitro\b",
        r"\bin vivo\b", r"\bpeer.?reviewed\b", r"\bclinical trial\b",
        r"\bmol/?L\b", r"\bmg/kg\b", r"\bIC50\b", r"\bORCID\b",
    ],
}


def classify_market(app_name: str, text: str = "") -> tuple[str, str | None]:
    """Returns (primary_market, secondary_market_or_None) based on app + text signals."""
    app_lower = app_name.lower()
    primary = "generic"
    for signal, market in APP_MARKET_MAP.items():
        if signal in app_lower:
            primary = market
            break

    secondary = None
    if text:
        scores: dict[str, int] = {}
        for market, patterns in _SIGNAL_PATTERNS.items():
            score = sum(1 for p in patterns if re.search(p, text, re.IGNORECASE))
            if score >= 2:
                scores[market] = score
        if scores:
            best = max(scores, key=lambda k: scores[k])
            if best != primary:
                secondary = best

    return primary, secondary


def compose_context(app_name: str = "", text: str = "", action: str = "") -> str:
    """Compose a layered system prompt: base + primary market + secondary modifier + style."""
    user_market = load_user_market()
    if user_market != "auto":
        primary, secondary = user_market, None
    else:
        primary, secondary = classify_market(app_name, text)

    if primary.startswith("trading_"):
        primary = "trading"
    # real_estate sub-contexts keep their own ContextLayer

    parts = [
        "You are an AI assistant embedded in a desktop productivity app called AI Cursor. "
        "A human reviews and approves every output before it is used. "
        "When screen content or text is provided, analyze and describe it directly — "
        "do not suggest the user visit external websites or tools, as they are already there. "
        "Never refuse to summarize, describe, or analyze information that is visible on screen. "
        "Never add preambles, disclaimers, sign-offs, or explanations unless asked. "
        "Return only the requested output.",
    ]

    primary_ctx = MARKET_CONTEXTS.get(primary, MARKET_CONTEXTS["generic"])
    parts.extend(primary_ctx.instructions)

    if secondary:
        sec_ctx = MARKET_CONTEXTS.get(secondary)
        if sec_ctx and sec_ctx.instructions:
            parts.append(f"Additional domain context: {sec_ctx.instructions[0]}")

    if action in STYLE_INJECT_ACTIONS:
        profile = get_style_profile()
        if profile:
            parts.append(f"User's personal writing style — match this closely:\n{profile}")

    if primary != "generic":
        log(f"[CTX] {primary}" + (f" + {secondary}" if secondary else ""))

    return "\n".join(parts)


# ── Context actions map ───────────────────────────────────────────────────────

CONTEXT_ACTIONS = {
    # ── UI context types (from TITLE_MAP) ─────────────────────────────────────
    "email":           [("Reply", "reply"),           ("Follow-up", "follow_up"),   ("Summarize", "summarize"),  ("Shorter", "shorter"),   ("Improve", "improve")],
    "social":          [("Reply", "reply"),            ("Caption", "caption"),       ("Hashtags",  "hashtags"),   ("Comment", "comment"),   ("Shorter", "shorter")],
    "chat":            [("Reply", "reply"),            ("Shorter",   "shorter"),     ("Summarize", "summarize"),  ("Follow-up", "follow_up"), ("Improve", "improve")],
    "video":           [("Comment", "comment"),        ("Reply",     "reply"),       ("Summarize", "summarize"),  ("Shorter", "shorter"),   ("Key Takeaways", "key_takeaways")],
    "design":          [("Inspect", "inspect"),        ("Canvas",  "canvas"),        ("Polish", "polish"),        ("Options", "options"),   ("Explain", "explain")],
    "docs":            [("Improve", "improve"),        ("Shorter",   "shorter"),     ("Summarize", "summarize"),  ("Canvas",  "canvas"),    ("Inspect", "inspect")],
    "shopping":        [("Pros & Cons", "pros_cons"),  ("Summarize", "summarize"),   ("Review", "review"),        ("Shorter", "shorter"),   ("Explain", "explain")],
    "research":        [("Summarize", "summarize"),    ("Key Takeaways", "key_takeaways"), ("Improve", "improve"), ("Explain", "explain"),  ("Shorter", "shorter")],
    "generic":         [("Reply", "reply"),            ("Follow-up", "follow_up"),   ("Summarize", "summarize"),  ("Improve", "improve"),   ("Shorter", "shorter")],
    # ── Market vertical contexts (from APP_MARKET_MAP) ────────────────────────
    "sales":           [("Reply", "reply"),            ("Follow-up", "follow_up"),   ("Summarize", "summarize"),  ("Options", "options"),   ("Shorter", "shorter")],
    "outbound":        [("Reply", "reply"),            ("Follow-up", "follow_up"),   ("Options", "options"),      ("Shorter", "shorter"),   ("Polish", "polish")],
    "customer_support":[("Reply", "reply"),            ("Summarize", "summarize"),   ("Shorter", "shorter"),      ("Improve", "improve"),   ("Options", "options")],
    "developer":       [("Improve", "improve"),        ("Explain", "explain"),       ("Summarize", "summarize"),  ("Options", "options"),   ("Canvas", "canvas")],
    "finance":         [("Summarize", "summarize"),    ("Key Takeaways", "key_takeaways"), ("Explain", "explain"), ("Shorter", "shorter"),  ("Improve", "improve")],
    "enterprise":      [("Summarize", "summarize"),    ("Improve", "improve"),       ("Reply", "reply"),          ("Shorter", "shorter"),   ("Follow-up", "follow_up")],
    "content":         [("Caption", "caption"),        ("Polish", "polish"),         ("Shorter", "shorter"),      ("Hashtags", "hashtags"), ("Options", "options")],
    "trading":         [("Sentiment", "sentiment"),    ("Bull / Bear", "bull_bear"), ("Key Takeaways", "key_takeaways"), ("Trade Thesis", "trade_thesis"), ("Summarize", "summarize")],
    "ecommerce":       [("Pros & Cons", "pros_cons"),  ("Summarize", "summarize"),   ("Review", "review"),                ("Improve", "improve"),           ("Options", "options")],
    "real_estate":     [("Client Summary", "client_summary"), ("Selling Points", "selling_points"), ("Summarize", "summarize"), ("Improve", "improve"), ("Options", "options")],
    # ── ERP contexts ─────────────────────────────────────────────────────────
    "approval_queue":  [("Analyze Queue",    "analyze_queue"),
                        ("Flag Risks",       "flag_risks"),
                        ("Batch Summary",    "batch_summary"),
                        ("Escalation List",  "escalation_list")],
    "period_close":    [("Close Status",     "close_status"),
                        ("Draft Journal",    "draft_journal"),
                        ("Explain Variance", "explain_variance"),
                        ("Reconcile Check",  "reconcile_check")],
    # ── Real estate contexts ──────────────────────────────────────────────────
    "real_estate_listing":  [("Client Summary",    "client_summary"),
                              ("Selling Points",   "selling_points"),
                              ("Instagram",        "instagram_caption_listing"),
                              ("Luxury Rewrite",   "luxury_tone"),
                              ("Family Angle",     "family_tone"),
                              ("Investment Angle", "investment_angle"),
                              ("Neighborhood",     "neighborhood_highlights"),
                              ("Compare",          "compare_listings")],
    "real_estate_leads":    [("Quick Reply",       "quick_reply_lead"),
                              ("Schedule Showing", "schedule_showing"),
                              ("Qualify Buyer",    "qualify_buyer"),
                              ("Follow-up",        "open_house_followup"),
                              ("Re-engage",        "re_engagement"),
                              ("Urgency",          "urgency_message"),
                              ("Objection",        "objection_reply")],
    "real_estate_social":   [("Instagram",         "instagram_caption_listing"),
                              ("Luxury Tone",      "luxury_tone"),
                              ("Family Tone",      "family_tone"),
                              ("Investment Angle", "investment_angle"),
                              ("Selling Points",   "selling_points")],
    "real_estate_legal":    [("Explain Simply",    "explain_contract"),
                              ("Key Risks",        "contract_risks"),
                              ("Client Summary",   "client_summary"),
                              ("Selling Points",   "selling_points")],
    # ── Trading contexts ──────────────────────────────────────────────────────
    "trading_social":  [("Sentiment",      "sentiment"),
                        ("Bull / Bear",    "bull_bear"),
                        ("Trade Thesis",   "trade_thesis"),
                        ("Hype Score",     "hype_score"),
                        ("Counterargs",    "counterarguments"),
                        ("Simplify",       "simplify_thread")],
    "trading_charts":  [("Trade Thesis",   "trade_thesis"),
                        ("Bull / Bear",    "bull_bear"),
                        ("Key Catalysts",  "key_catalysts"),
                        ("Explain",        "explain_indicator"),
                        ("Journal Entry",  "journal_entry")],
    "trading_news":    [("Market Impact",  "market_impact"),
                        ("Key Catalysts",  "key_catalysts"),
                        ("Bull / Bear",    "bull_bear"),
                        ("Key Takeaways",  "key_takeaways"),
                        ("Trade Risks",    "trade_risks")],
    "trading_journal": [("Journal Entry",  "journal_entry"),
                        ("Risk Summary",   "risk_summary"),
                        ("Trade Thesis",   "trade_thesis"),
                        ("Summarize",      "summarize")],
    "trading_research":[("Important Changes", "important_changes"),
                        ("Guidance",       "guidance_summary"),
                        ("Market Reaction","market_reaction"),
                        ("Trade Risks",    "trade_risks"),
                        ("Key Takeaways",  "key_takeaways")],
    # ── Content-type specific (more specific than UI context) ─────────────────
    "earnings_release":  [("Trade Thesis",   "trade_thesis"),   ("Sentiment",  "sentiment"),
                          ("Key Metrics",    "key_takeaways"),  ("Bull/Bear",  "bull_bear"),
                          ("Summarize",      "summarize")],
    "market_news":       [("Sentiment",      "sentiment"),      ("Key Takeaways", "key_takeaways"),
                          ("Bull/Bear",      "bull_bear"),      ("Summarize",  "summarize"),
                          ("Trade Thesis",   "trade_thesis")],
    "property_listing":  [("Client Summary", "client_summary"), ("Selling Points", "selling_points"),
                          ("Instagram",      "instagram_caption_listing"), ("Investment", "investment_angle"),
                          ("Luxury Rewrite", "luxury_tone")],
    "buyer_inquiry":     [("Quick Reply",    "quick_reply_lead"), ("Qualify Buyer", "qualify_buyer"),
                          ("Schedule",       "schedule_showing"), ("Follow-up", "open_house_followup"),
                          ("Re-engage",      "re_engagement")],
    "job_posting":       [("Summarize",      "summarize"),      ("Key Requirements", "key_takeaways"),
                          ("Explain",        "explain"),        ("Improve",    "improve"),
                          ("Shorter",        "shorter")],
    "legal_contract":    [("Explain Simply", "explain_contract"), ("Key Risks", "contract_risks"),
                          ("Client Summary", "client_summary"), ("Summarize",  "summarize"),
                          ("Shorter",        "shorter")],
    "code_snippet":      [("Explain",        "explain"),        ("Fix",        "fix"),
                          ("Improve",        "improve"),        ("Options",    "options"),
                          ("Canvas",         "canvas")],
    "product_listing":   [("Pros & Cons",    "pros_cons"),      ("Summarize",  "summarize"),
                          ("Review",         "review"),         ("Shorter",    "shorter"),
                          ("Explain",        "explain")],
    "research_report":   [("Key Takeaways",  "key_takeaways"),  ("Summarize",  "summarize"),
                          ("Explain",        "explain"),        ("Shorter",    "shorter"),
                          ("Improve",        "improve")],
    "approval_item":     [("Summarize",      "summarize"),      ("Flag Risks", "flag_risks"),
                          ("Explain",        "explain"),        ("Shorter",    "shorter"),
                          ("Key Takeaways",  "key_takeaways")],
}


# ── Process / title → context detection ──────────────────────────────────────

PROCESS_MAP = {
    "figma.exe":    ("Figma",    "design"),
    "spotify.exe":  ("Spotify",  "social"),
    "slack.exe":    ("Slack",    "chat"),
    "discord.exe":  ("Discord",  "chat"),
    "notion.exe":   ("Notion",   "docs"),
    "code.exe":     ("VS Code",  "docs"),
    "cursor.exe":   ("Cursor",   "docs"),
    "outlook.exe":  ("Outlook",  "email"),
    "teams.exe":    ("Teams",    "chat"),
    "zoom.exe":     ("Zoom",     "chat"),
    "whatsapp.exe": ("WhatsApp", "chat"),
}

TITLE_MAP = [
    # ── Email ─────────────────────────────────────────────────────────────────
    (["gmail", "inbox"],                          "Gmail",          "email"),
    (["outlook", "hotmail"],                      "Outlook",        "email"),
    (["superhuman"],                              "Superhuman",     "email"),
    (["hey.com"],                                 "HEY",            "email"),
    (["fastmail"],                                "Fastmail",       "email"),
    # ── Outbound / SDR ────────────────────────────────────────────────────────
    (["linkedin"],                                "LinkedIn",       "outbound"),
    (["apollo.io"],                               "Apollo",         "outbound"),
    (["lemlist"],                                 "Lemlist",        "outbound"),
    (["instantly"],                               "Instantly",      "outbound"),
    (["reply.io"],                                "Reply.io",       "outbound"),
    (["smartlead"],                               "Smartlead",      "outbound"),
    (["woodpecker"],                              "Woodpecker",     "outbound"),
    # ── Customer Support ──────────────────────────────────────────────────────
    (["zendesk"],                                 "Zendesk",        "customer_support"),
    (["freshdesk"],                               "Freshdesk",      "customer_support"),
    (["intercom"],                                "Intercom",       "customer_support"),
    (["gorgias"],                                 "Gorgias",        "customer_support"),
    (["helpscout"],                               "Help Scout",     "customer_support"),
    (["crisp"],                                   "Crisp",          "customer_support"),
    (["tidio"],                                   "Tidio",          "customer_support"),
    # ── Social ────────────────────────────────────────────────────────────────
    (["youtube"],                                 "YouTube",        "video"),
    (["instagram"],                               "Instagram",      "social"),
    (["tiktok"],                                  "TikTok",         "social"),
    (["twitter", "x.com"],                        "X",              "social"),
    (["facebook"],                                "Facebook",       "social"),
    (["reddit"],                                  "Reddit",         "social"),
    (["spotify"],                                 "Spotify",        "social"),
    (["pinterest"],                               "Pinterest",      "social"),
    (["threads"],                                 "Threads",        "social"),
    # ── Content Creation ──────────────────────────────────────────────────────
    (["substack"],                                "Substack",       "docs"),
    (["beehiiv"],                                 "Beehiiv",        "docs"),
    (["ghost"],                                   "Ghost",          "docs"),
    (["medium"],                                  "Medium",         "docs"),
    (["wordpress"],                               "WordPress",      "docs"),
    (["typefully"],                               "Typefully",      "docs"),
    (["convertkit", "kit.com"],                   "Kit",            "docs"),
    (["mailchimp"],                               "Mailchimp",      "docs"),
    (["youtube studio"],                          "YouTube Studio", "docs"),
    (["later.com"],                               "Later",          "docs"),
    (["canva"],                                   "Canva",          "design"),
    (["figma"],                                   "Figma",          "design"),
    (["adobe"],                                   "Adobe",          "design"),
    # ── Productivity / Docs ───────────────────────────────────────────────────
    (["notion"],                                  "Notion",         "docs"),
    (["docs.google", "google docs"],              "Google Docs",    "docs"),
    (["confluence"],                              "Confluence",     "docs"),
    (["coda.io"],                                 "Coda",           "docs"),
    (["airtable"],                                "Airtable",       "docs"),
    # ── Chat / Comms ──────────────────────────────────────────────────────────
    (["slack"],                                   "Slack",          "chat"),
    (["discord"],                                 "Discord",        "chat"),
    (["whatsapp"],                                "WhatsApp",       "chat"),
    (["messenger"],                               "Messenger",      "chat"),
    (["teams"],                                   "Teams",          "chat"),
    (["telegram"],                                "Telegram",       "chat"),
    (["signal"],                                  "Signal",         "chat"),
    # ── Developer ─────────────────────────────────────────────────────────────
    (["github"],                                  "GitHub",         "docs"),
    (["gitlab"],                                  "GitLab",         "docs"),
    (["stackoverflow", "stack overflow"],         "Stack Overflow", "docs"),
    (["vercel"],                                  "Vercel",         "docs"),
    (["supabase"],                                "Supabase",       "docs"),
    (["linear"],                                  "Linear",         "docs"),
    (["postman"],                                 "Postman",        "docs"),
    (["replit"],                                  "Replit",         "docs"),
    # ── Shopping / Ecommerce ──────────────────────────────────────────────────
    (["amazon"],                                  "Amazon",         "shopping"),
    (["ebay"],                                    "eBay",           "shopping"),
    (["etsy"],                                    "Etsy",           "shopping"),
    (["walmart"],                                 "Walmart",        "shopping"),
    (["aliexpress"],                              "AliExpress",     "shopping"),
    (["bestbuy", "best buy"],                     "Best Buy",       "shopping"),
    (["shopify", "checkout", "add to cart"],      "Shop",           "shopping"),
    (["mercari"],                                 "Mercari",        "shopping"),
    (["poshmark"],                                "Poshmark",       "shopping"),
    (["temu"],                                    "Temu",           "shopping"),
    # ── Finance / Accounting ──────────────────────────────────────────────────
    (["quickbooks"],                              "QuickBooks",     "docs"),
    (["xero"],                                    "Xero",           "docs"),
    (["expensify"],                               "Expensify",      "docs"),
    (["brex"],                                    "Brex",           "docs"),
    (["ramp"],                                    "Ramp",           "docs"),
    # ── Research / Academic platforms ─────────────────────────────────────────
    (["pubmed", "ncbi.nlm"],                      "PubMed",         "research"),
    (["scholar.google"],                          "Google Scholar", "research"),
    (["arxiv"],                                   "arXiv",          "research"),
    (["researchgate"],                            "ResearchGate",   "research"),
    (["sciencedirect"],                           "ScienceDirect",  "research"),
    (["nature.com"],                              "Nature",         "research"),
    (["biorxiv", "medrxiv", "chemrxiv"],          "Preprint",       "research"),
    (["overleaf"],                                "Overleaf",       "research"),
    (["scopus", "webofscience"],                  "Research DB",    "research"),
    # ── Real estate platforms ─────────────────────────────────────────────────
    (["zillow"],                                  "Zillow",         "real_estate_listing"),
    (["realtor.com"],                             "Realtor.com",    "real_estate_listing"),
    (["redfin"],                                  "Redfin",         "real_estate_listing"),
    (["mls", "matrix.mlslistings", "flexmls", "paragon"], "MLS",   "real_estate_listing"),
    (["loopnet"],                                 "LoopNet",        "real_estate_listing"),
    # ── Trading platforms ─────────────────────────────────────────────────────
    (["stocktwits"],                              "StockTwits",     "trading_social"),
    (["x.com", "twitter"],                        "X / Twitter",    "trading_social"),
    (["reddit.com/r/wallstreetbets",
       "reddit.com/r/investing",
       "reddit.com/r/stocks",
       "reddit.com/r/options"],                   "Reddit Finance", "trading_social"),
    (["tradingview"],                             "TradingView",    "trading_charts"),
    (["thinkorswim", "tdameritrade"],             "thinkorswim",    "trading_journal"),
    (["schwab"],                                  "Schwab",         "trading_journal"),
    (["interactivebrokers", "ibkr"],              "IBKR",           "trading_journal"),
    (["bloomberg"],                               "Bloomberg",      "trading_news"),
    (["finance.yahoo", "yahoo finance"],          "Yahoo Finance",  "trading_news"),
    (["marketwatch"],                             "MarketWatch",    "trading_news"),
    (["seekingalpha"],                            "Seeking Alpha",  "trading_news"),
    (["cnbc"],                                    "CNBC",           "trading_news"),
    (["barrons"],                                 "Barron's",       "trading_news"),
    (["sec.gov", "edgar"],                        "SEC / EDGAR",    "trading_research"),
    (["earnings", "investor relations",
       "10-q", "10-k", "8-k"],                   "Earnings",       "trading_research"),
    (["zacks", "motleyfool", "investopedia"],     "Research",       "trading_research"),
]

# ── ERP entries go after the main list but are inserted at the front of the
#    matching scan via _detect_context_type so they take priority over generic
#    keywords like "inbox" that appear in email patterns.
_ERP_TITLE_MAP = [
    # period_close checked BEFORE approval_queue — "journal entry" is unambiguous
    (["period close", "month-end", "month end",
      "year-end close", "quarter close",
      "close checklist", "close the books",
      "journal entry", "je entry",
      "reconciliation", "account reconcil",
      "trial balance", "gl close",
      "intercompany", "accrual entry"],            "Period Close",   "period_close"),
    (["pending approval", "my approvals",
      "workflow inbox", "approval queue",
      "fiori", "sap approve",
      "oracle approve", "oracle workflow",
      "workday inbox", "workday approve",
      "ariba approval", "servicenow approval",
      "coupa approval", "concur approval"],        "Approval Queue", "approval_queue"),
]


def _detect_context_type(app_name: str, window_title: str) -> str:
    """
    Derive the UI context type ("email", "chat", "approval_queue", etc.)
    from app name + window title.

    ERP patterns are checked first (more specific keywords take priority over
    generic ones like "inbox" that also appear in email patterns).
    """
    proc  = app_name.lower()
    title = window_title.lower()

    for exe, (_name, ctx) in PROCESS_MAP.items():
        if exe in proc:
            return ctx

    # ERP-specific patterns first — prevents "inbox" matching email before Workday
    for keywords, _name, ctx in _ERP_TITLE_MAP:
        if any(kw in title for kw in keywords):
            return ctx

    for keywords, _name, ctx in TITLE_MAP:
        if any(kw in title for kw in keywords):
            return ctx

    return "generic"


def get_active_context() -> tuple[str, str]:
    """Returns (app_name, context_id) for the currently focused window."""
    if not WIN32_AVAILABLE:
        return "", "generic"
    try:
        import win32gui
        import win32process
        import psutil
        hwnd  = win32gui.GetForegroundWindow()
        title = win32gui.GetWindowText(hwnd).lower()
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        proc  = psutil.Process(pid).name().lower()
    except Exception:
        return "", "generic"

    for exe, (name, ctx) in PROCESS_MAP.items():
        if exe in proc:
            return name, ctx

    for keywords, name, ctx in TITLE_MAP:
        if any(kw in title for kw in keywords):
            return name, ctx

    return "", "generic"


def detect_content_type(
    text: str,
    signals: "ContentSignals | None" = None,
    market: str = "generic",
    context_type: str = "generic",
) -> tuple[str, float]:
    """
    Classify specific content type from text + signals.
    Returns (content_type, confidence). More specific than context_type.
    Rule-based only — instant, no LLM.
    """
    t = text.lower() if text else ""
    words = len(text.split()) if text else 0

    # ── Email signals (structural, highest priority) ──────────────────────────
    if signals and signals.has_email_headers:
        return "email_thread", 0.92
    if signals and signals.has_quoted_thread and words < 500:
        return "email_composition", 0.80

    # ── Code ─────────────────────────────────────────────────────────────────
    if signals and signals.has_code:
        return "code_snippet", 0.92

    # ── Earnings / Financial results ──────────────────────────────────────────
    earnings_kw = ["earnings per share", "eps", "revenue", "guidance", "fiscal quarter",
                   "beat estimates", "raised guidance", "quarterly results", "net income",
                   "operating income", "year-over-year", "yoy"]
    if sum(1 for kw in earnings_kw if kw in t) >= 2:
        return "earnings_release", 0.88

    # ── Market / Trading news ─────────────────────────────────────────────────
    market_kw = ["nasdaq", "dow jones", "s&p 500", "market cap", "trading volume",
                 "short interest", "options flow", "put/call", "bull case", "bear case"]
    if sum(1 for kw in market_kw if kw in t) >= 2 or market == "trading":
        return "market_news", 0.72

    # ── Property listing ─────────────────────────────────────────────────────
    listing_kw = ["bed", "bath", "sqft", "sq ft", "listing price", "mls",
                  "year built", "garage", "square feet", "lot size", "hoa"]
    if sum(1 for kw in listing_kw if kw in t) >= 2:
        return "property_listing", 0.88

    # ── Real estate lead / buyer inquiry ─────────────────────────────────────
    lead_kw = ["interested in", "schedule a showing", "can we view",
               "first-time buyer", "pre-approved", "down payment"]
    if sum(1 for kw in lead_kw if kw in t) >= 1 and market == "real_estate":
        return "buyer_inquiry", 0.82

    # ── Job posting ───────────────────────────────────────────────────────────
    job_kw = ["responsibilities", "qualifications", "years of experience",
              "we are seeking", "you will be", "required skills", "apply now",
              "job description", "compensation", "benefits package"]
    if sum(1 for kw in job_kw if kw in t) >= 2:
        return "job_posting", 0.85

    # ── Legal contract ────────────────────────────────────────────────────────
    legal_kw = ["whereas", "hereinafter", "party of the first", "shall be liable",
                "terms and conditions", "agreement between", "indemnify",
                "notwithstanding", "pursuant to", "the parties agree"]
    if sum(1 for kw in legal_kw if kw in t) >= 2:
        return "legal_contract", 0.88

    # ── Product / E-commerce listing ──────────────────────────────────────────
    product_kw = ["add to cart", "buy now", "in stock", "out of stock",
                  "free shipping", "return policy", "customer reviews", "ships in"]
    if sum(1 for kw in product_kw if kw in t) >= 1:
        return "product_listing", 0.82

    # ── Research / Academic ───────────────────────────────────────────────────
    research_kw = ["abstract", "methodology", "conclusion", "references",
                   "hypothesis", "findings", "study shows", "peer-reviewed", "citation"]
    if sum(1 for kw in research_kw if kw in t) >= 2:
        return "research_report", 0.80

    # ── ERP approval item ─────────────────────────────────────────────────────
    approval_kw = ["pending approval", "approve", "workflow", "submitted by",
                   "awaiting review", "purchase order", "requisition", "po number"]
    if sum(1 for kw in approval_kw if kw in t) >= 2:
        return "approval_item", 0.80

    # ── Fallback to UI context_type if meaningful ─────────────────────────────
    if context_type and context_type not in ("generic", ""):
        return context_type, 0.55

    # ── Length-based fallback ─────────────────────────────────────────────────
    if words > 300:
        return "long_document", 0.35
    if words < 50:
        return "short_text", 0.35
    return "generic", 0.25


def detect_action(
    text: str,
    context: str = "generic",
    content_type: str = "",
    signals=None,
) -> tuple[str, float]:
    """
    Returns (action_key, confidence).
    content_type takes priority — it's more specific than context.
    Confidence >= 0.75 → caller may auto-run without showing menu.
    """
    # ── Content-type based (most specific) ───────────────────────────────────
    _CT_MAP: dict[str, tuple[str, float]] = {
        "earnings_release":  ("trade_thesis",        0.90),
        "market_news":       ("sentiment",            0.82),
        "property_listing":  ("client_summary",       0.90),
        "buyer_inquiry":     ("quick_reply_lead",     0.88),
        "job_posting":       ("summarize",            0.80),
        "legal_contract":    ("explain_contract",     0.88),
        "email_thread":      ("reply",                0.85),
        "email_composition": ("improve",              0.78),
        "code_snippet":      ("explain",              0.85),
        "product_listing":   ("pros_cons",            0.82),
        "research_report":   ("key_takeaways",        0.82),
        "approval_item":     ("summarize",            0.78),
        "long_document":     ("summarize",            0.65),
        "short_text":        ("reply",                0.55),
    }
    if content_type and content_type in _CT_MAP:
        return _CT_MAP[content_type]

    # ── Context-type fallback (existing logic, preserved) ────────────────────
    if context == "social":
        return ("caption", 0.72) if (text and len(text) < 200) else ("summarize", 0.65)
    if context == "design":
        return ("inspect", 0.70) if not text else ("polish", 0.65)
    if context == "video":
        return ("comment", 0.68) if (text and len(text) < 300) else ("summarize", 0.65)
    if context == "shopping":
        return ("pros_cons", 0.72) if (text and len(text) > 100) else ("summarize", 0.60)
    if context == "real_estate_listing":
        return "client_summary", 0.88
    if context == "real_estate_leads":
        return "quick_reply_lead", 0.85
    if context == "real_estate_social":
        return "instagram_caption_listing", 0.82
    if context == "real_estate_legal":
        return "explain_contract", 0.85
    if context == "trading_social":
        return "sentiment", 0.82
    if context == "trading_charts":
        return "trade_thesis", 0.85
    if context == "trading_news":
        return "market_impact", 0.80
    if context == "trading_journal":
        return "journal_entry", 0.78
    if context == "trading_research":
        return "important_changes", 0.78

    # ── Text-signal fallback ──────────────────────────────────────────────────
    if signals and signals.has_code:
        return "explain", 0.75
    if signals and signals.has_email_headers:
        return "reply", 0.80
    if text and len(text) > 500:
        return "summarize", 0.60
    t = text.lower() if text else ""
    if any(s in t for s in ["following up", "follow up", "follow-up", "checking in"]):
        return "follow_up", 0.65
    if "?" in text:
        return "reply", 0.55
    return "reply", 0.45
