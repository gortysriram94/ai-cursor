"""
prompts.py — ACTION_PROMPTS, VISION_PROMPTS, INSPECT_PROMPTS,
             CANVAS prompts/types, build_prompt.
"""

import re as _re

from config import TONE_INSTRUCTIONS, SYSTEM_CONTEXT
from context import compose_context
from brain.context_bundle import ContextBundle


# ── Action prompts ────────────────────────────────────────────────────────────

ACTION_PROMPTS = {
    "reply": lambda t: (
        "Write a reply to the following message.\n"
        "Requirements:\n"
        "- Address the key points raised\n"
        "- Sound like a real person wrote it, not a template\n"
        "- Do not start with 'I hope this email finds you well' or similar filler\n"
        "- Return only the reply text\n\n"
        f"Message:\n{t}"
    ),
    "follow_up": lambda t: (
        "Write a follow-up message for the conversation or outreach below.\n"
        "Requirements:\n"
        "- Assume the recipient has not yet responded\n"
        "- Be brief — one short paragraph\n"
        "- Add a clear, low-friction call to action\n"
        "- Do not be pushy or passive-aggressive\n"
        "- Return only the follow-up text\n\n"
        f"Original message or context:\n{t}"
    ),
    "summarize": lambda t: (
        "Summarize the following content.\n"
        "Requirements:\n"
        "- Capture every key point — skip nothing important\n"
        "- Use bullet points if there are 3 or more distinct points\n"
        "- Be scannable — a busy person should grasp it in 10 seconds\n"
        "- Return only the summary\n\n"
        f"Content:\n{t}"
    ),
    "caption": lambda t: (
        "Write a social media caption for the following content.\n"
        "Requirements:\n"
        "- Open with a hook that stops the scroll\n"
        "- Be platform-agnostic (works on LinkedIn, Instagram, X)\n"
        "- Sound human and specific, not generic\n"
        "- Return only the caption text\n\n"
        f"Content:\n{t}"
    ),
    "hashtags": lambda t: (
        "Generate hashtags for the following content.\n"
        "Requirements:\n"
        "- 8 hashtags, mix of popular and niche\n"
        "- Avoid generic hashtags like #life #love #instagood\n"
        "- Make them specific to the topic and audience\n"
        "- Return only the hashtags on a single line, space-separated\n\n"
        f"Content:\n{t}"
    ),
    "comment": lambda t: (
        "Write a comment to leave on the following content.\n"
        "Requirements:\n"
        "- Add genuine value — an insight, question, or relevant take\n"
        "- Do NOT write 'Great post!' or similar empty praise\n"
        "- Sound like a real person in the comments, not a bot\n"
        "- Keep it to 1-3 sentences\n"
        "- Return only the comment\n\n"
        f"Content:\n{t}"
    ),
    "polish": lambda t: (
        "Polish the following copy to be clearer and more compelling.\n"
        "Requirements:\n"
        "- Fix awkward phrasing and weak word choices\n"
        "- Remove filler words and redundancy\n"
        "- Preserve the original meaning and intent exactly\n"
        "- Do not add new information\n"
        "- Return only the improved version\n\n"
        f"Copy:\n{t}"
    ),
    "shorter": lambda t: (
        "Make the following text more concise.\n"
        "Requirements:\n"
        "- Preserve every key idea — do not drop important information\n"
        "- Cut filler, redundancy, and weak transitions\n"
        "- Keep the same voice and intent\n"
        "- Return only the shortened version\n\n"
        f"Text:\n{t}"
    ),
    "options": lambda t: (
        "Write 3 distinct alternative versions of the following text.\n"
        "Requirements:\n"
        "- Each version should take a meaningfully different angle or approach\n"
        "- Number them 1, 2, 3\n"
        "- Each should stand alone and be ready to use\n"
        "- Return only the three versions\n\n"
        f"Original:\n{t}"
    ),
    "explain": lambda t: (
        "Explain the following in plain language.\n"
        "Requirements:\n"
        "- Write as if explaining to a smart non-expert\n"
        "- Avoid jargon; define any technical terms you must use\n"
        "- Use an analogy if it helps clarity\n"
        "- Be concise — explain it, don't pad it\n"
        "- Return only the explanation\n\n"
        f"Content:\n{t}"
    ),
    "improve": lambda t: (
        "Improve the following content.\n"
        "First determine whether it is CODE or PROSE.\n\n"
        "If CODE → return an improved version in the SAME language and framework. "
        "Improve naming, structure, readability, and idiomatic patterns. "
        "Preserve exact logic and behaviour. Return only the improved code — no explanation.\n\n"
        "If PROSE → strengthen the message, improve clarity, flow, and impact. "
        "Return only the improved version — no explanation.\n\n"
        f"Content:\n{t}"
    ),
    "pros_cons": lambda t: (
        "Extract the pros and cons from the following content.\n"
        "Requirements:\n"
        "- Focus on what matters for a real purchase or decision\n"
        "- Be specific — avoid vague points like 'good quality'\n"
        "- Format as:\nPros:\n- ...\n\nCons:\n- ...\n"
        "- Return only the pros and cons list\n\n"
        f"Content:\n{t}"
    ),
    "review": lambda t: (
        "Write a helpful product review based on the following information.\n"
        "Requirements:\n"
        "- Sound like a genuine buyer, not a marketing copy\n"
        "- Mention both strengths and weaknesses if evident\n"
        "- Be specific about what works and what doesn't\n"
        "- Keep it to 3-5 sentences\n"
        "- Return only the review\n\n"
        f"Product info:\n{t}"
    ),
    # ── Real estate actions ───────────────────────────────────────────────────
    "client_summary": lambda t: (
        "Transform this raw MLS or listing text into a polished client-ready summary.\n"
        "Requirements:\n"
        "- Lead with the lifestyle, not the specs\n"
        "- Highlight what makes this property special in plain language\n"
        "- Weave in key facts (beds, baths, sqft, price) naturally — not as a bulleted spec sheet\n"
        "- End with one sentence that creates aspiration or urgency\n"
        "- 3-5 sentences. Sound like a great realtor wrote it, not a database.\n\n"
        f"Listing:\n{t}"
    ),
    "selling_points": lambda t: (
        "Extract the strongest selling points from this listing.\n"
        "Requirements:\n"
        "- 5-7 bullet points, each one specific and compelling\n"
        "- Lead each point with the benefit, not the feature\n"
        "- Skip generic points like 'great location' without evidence\n"
        "- Think: what would make a buyer say 'that's exactly what I want'?\n\n"
        f"Listing:\n{t}"
    ),
    "neighborhood_highlights": lambda t: (
        "Write a neighborhood highlights section based on this listing content.\n"
        "Include what you can infer or what is explicitly mentioned:\n"
        "- Nearby amenities, schools, transport, dining, parks\n"
        "- Character of the area (quiet, vibrant, family-friendly, etc.)\n"
        "- Commute or lifestyle advantages\n"
        "If neighborhood info is limited, focus on what's mentioned and frame it positively.\n\n"
        f"Listing:\n{t}"
    ),
    "investment_potential": lambda t: (
        "Analyze the investment potential of this property based on the listing.\n"
        "Cover:\n"
        "- Rental income potential (if inferable from size/location)\n"
        "- Appreciation indicators (location, development, market signals)\n"
        "- Value-add opportunities (renovation, ADU potential, etc.)\n"
        "- Risk factors an investor should consider\n"
        "Be specific to what's in the listing. Flag assumptions clearly.\n\n"
        f"Listing:\n{t}"
    ),
    "quick_reply_lead": lambda t: (
        "Write a quick, warm reply to this real estate lead.\n"
        "Requirements:\n"
        "- Confirm the property status or address their question directly\n"
        "- Sound like a real person, not an autoresponder\n"
        "- Include one soft next step (schedule a call, showing, or send more info)\n"
        "- 2-3 sentences max\n"
        "- Do NOT start with 'Thank you for reaching out'\n\n"
        f"Lead message:\n{t}"
    ),
    "schedule_showing": lambda t: (
        "Write a reply to this lead that moves toward scheduling a showing.\n"
        "Requirements:\n"
        "- Acknowledge their interest genuinely\n"
        "- Propose 2-3 specific time slots or ask for their availability\n"
        "- Make it easy to say yes — remove friction\n"
        "- Mention anything that makes the showing feel worth their time\n"
        "- 3-4 sentences\n\n"
        f"Lead message:\n{t}"
    ),
    "qualify_buyer": lambda t: (
        "Write a reply that qualifies this buyer while keeping them warm.\n"
        "Gently surface:\n"
        "- Pre-approval status\n"
        "- Timeline to purchase\n"
        "- Must-haves vs nice-to-haves\n"
        "Do it conversationally — not as an interrogation. One question at a time.\n"
        "Keep it warm, professional, and brief.\n\n"
        f"Lead message:\n{t}"
    ),
    "luxury_tone": lambda t: (
        "Rewrite this listing description in a luxury tone.\n"
        "Characteristics of luxury real estate copy:\n"
        "- Elevated vocabulary without being pompous\n"
        "- Sensory details — light, space, materials, views\n"
        "- Understated exclusivity — never oversell\n"
        "- Aspirational but credible\n"
        "- Short sentences. White space. Confidence.\n\n"
        f"Original listing:\n{t}"
    ),
    "family_tone": lambda t: (
        "Rewrite this listing to appeal to families.\n"
        "Emphasize:\n"
        "- Space for kids, safety, yard, storage\n"
        "- School proximity and quality if mentioned\n"
        "- Community feel, neighbors, walkability\n"
        "- Room for growth and lifestyle\n"
        "Warm, practical, and reassuring tone.\n\n"
        f"Original listing:\n{t}"
    ),
    "investment_angle": lambda t: (
        "Rewrite this listing to appeal to real estate investors.\n"
        "Emphasize:\n"
        "- ROI indicators, rental potential, cap rate signals\n"
        "- Value-add opportunities\n"
        "- Market and location fundamentals\n"
        "- Numbers where available\n"
        "Cut lifestyle language. Investors want returns, not feelings.\n\n"
        f"Original listing:\n{t}"
    ),
    "instagram_caption_listing": lambda t: (
        "Write an Instagram caption for this real estate listing.\n"
        "Requirements:\n"
        "- Hook in the first line — stop the scroll\n"
        "- Paint a picture of the lifestyle, not just the specs\n"
        "- Include 1-2 key facts (price, beds, city) naturally\n"
        "- End with a soft CTA (link in bio, DM for details, etc.)\n"
        "- 4-6 lines. No hashtags — write them separately.\n\n"
        f"Listing:\n{t}"
    ),
    "objection_reply": lambda t: (
        "Write a professional response to this client objection.\n"
        "Requirements:\n"
        "- Acknowledge their concern genuinely — don't dismiss it\n"
        "- Provide context or data that reframes the objection\n"
        "- Stay on their side — you're solving their problem, not defending the listing\n"
        "- End with a forward-moving question or next step\n"
        "- 3-4 sentences\n\n"
        f"Client message:\n{t}"
    ),
    "counterpoints": lambda t: (
        "Generate counterpoints to this client objection or concern.\n"
        "Requirements:\n"
        "- 3-4 specific, factual counterpoints\n"
        "- Back each with logic, data, or context (even if inferred)\n"
        "- Not defensive — frame each as information that helps them decide\n"
        "- Order from strongest to weakest\n\n"
        f"Objection:\n{t}"
    ),
    "negotiation_reply": lambda t: (
        "Write a negotiation-friendly reply to this client message.\n"
        "Requirements:\n"
        "- Acknowledge their position without conceding too quickly\n"
        "- Find common ground or reframe the conversation\n"
        "- Keep the deal moving — don't let it stall\n"
        "- Leave room for the next move without closing doors\n"
        "- Professional but warm\n\n"
        f"Message:\n{t}"
    ),
    "compare_listings": lambda t: (
        "Compare the properties described in this content.\n"
        "Format:\n"
        "Property A vs Property B:\n"
        "- Price: ...\n"
        "- Size & Layout: ...\n"
        "- Location & Neighborhood: ...\n"
        "- Condition & Features: ...\n"
        "- Best for: ...\n\n"
        "Verdict: [which is stronger and for whom]\n\n"
        f"Listings:\n{t}"
    ),
    "best_for_families": lambda t: (
        "Evaluate these properties specifically for a family buyer.\n"
        "Score each on:\n"
        "- Space and layout for family living\n"
        "- Safety and neighborhood character\n"
        "- Schools and kid-friendly amenities\n"
        "- Yard, storage, and practical needs\n"
        "Give a clear recommendation with reasoning.\n\n"
        f"Properties:\n{t}"
    ),
    "open_house_followup": lambda t: (
        "Write an open house follow-up message to a prospect.\n"
        "Requirements:\n"
        "- Reference something specific about their visit or the property\n"
        "- Check in on their thoughts without being pushy\n"
        "- Remind them of the best feature that matched their stated needs\n"
        "- Include a clear next step\n"
        "- 3-4 sentences. Warm and personal.\n\n"
        f"Context:\n{t}"
    ),
    "re_engagement": lambda t: (
        "Write a re-engagement message for a lead that has gone quiet.\n"
        "Requirements:\n"
        "- No guilt-tripping or passive aggression\n"
        "- Offer something of value (new listing, market update, price reduction)\n"
        "- Make it easy to re-engage with a single low-friction question\n"
        "- 2-3 sentences\n\n"
        f"Context:\n{t}"
    ),
    "urgency_message": lambda t: (
        "Write a message that creates genuine urgency around this property or situation.\n"
        "Requirements:\n"
        "- Urgency must be real and specific — not manufactured\n"
        "- Use facts: competing offers, price reduction deadline, listing age, market activity\n"
        "- Never use false scarcity or pressure tactics\n"
        "- End with a clear, immediate call to action\n\n"
        f"Context:\n{t}"
    ),
    "explain_contract": lambda t: (
        "Explain this contract or legal document in plain English for a client.\n"
        "Requirements:\n"
        "- Translate every key clause into one plain sentence\n"
        "- Flag anything the client needs to pay special attention to\n"
        "- Use everyday analogies where helpful\n"
        "- Do NOT give legal advice — you are explaining, not advising\n"
        "- End with: 'Review with your attorney before signing.'\n\n"
        f"Contract text:\n{t}"
    ),
    "contract_risks": lambda t: (
        "Identify the key risks and important clauses in this contract.\n"
        "Format:\n"
        "⚠️ Key Risks:\n- [risk and what it means]\n\n"
        "📅 Important Deadlines:\n- [deadline and consequence if missed]\n\n"
        "✅ Buyer Protections:\n- [contingencies or protections in their favor]\n\n"
        "Flag anything unusual or that requires immediate attention.\n\n"
        f"Contract:\n{t}"
    ),
    # ── Trading actions ───────────────────────────────────────────────────────
    "sentiment": lambda t: (
        "Analyze the market sentiment expressed in the following content.\n"
        "Return:\n"
        "- Overall: Bullish / Bearish / Neutral (with conviction level: strong/moderate/mixed)\n"
        "- Key sentiment drivers visible in the text\n"
        "- Any notable fear, hype, or emotional language\n"
        "- One-line summary\n\n"
        f"Content:\n{t}"
    ),
    "bull_bear": lambda t: (
        "Extract the bull and bear arguments from the following content.\n"
        "Format exactly as:\n"
        "🟢 Bull Case:\n- [point]\n- [point]\n\n"
        "🔴 Bear Case:\n- [point]\n- [point]\n\n"
        "Verdict: [one sentence on which side has stronger arguments based on what's written]\n\n"
        f"Content:\n{t}"
    ),
    "trade_thesis": lambda t: (
        "Synthesize a clear trade thesis from the following content.\n"
        "Include:\n"
        "- Setup: what the opportunity is\n"
        "- Catalyst: what drives the move\n"
        "- Risk: what invalidates the thesis\n"
        "- Timeframe: if mentioned or implied\n"
        "Be specific. Use numbers and names from the content.\n\n"
        f"Content:\n{t}"
    ),
    "counterarguments": lambda t: (
        "Identify the strongest counterarguments to the view expressed in this content.\n"
        "Requirements:\n"
        "- Steel-man the opposite position — make it as strong as possible\n"
        "- Focus on what the author is NOT considering\n"
        "- 3-5 bullet points\n"
        "- Be specific to this content, not generic risk warnings\n\n"
        f"Content:\n{t}"
    ),
    "hype_score": lambda t: (
        "Assess the hype level of this content on a scale of 1-10.\n"
        "Return:\n"
        "- Hype Score: X/10\n"
        "- Signal vs Noise: what is actual information vs emotional amplification\n"
        "- Red flags: any pump language, unrealistic claims, missing context\n"
        "- What to take seriously from this\n\n"
        f"Content:\n{t}"
    ),
    "simplify_thread": lambda t: (
        "Compress this thread or discussion into the essential information.\n"
        "Requirements:\n"
        "- What is the core claim or idea?\n"
        "- What evidence or data supports it?\n"
        "- What is the actionable takeaway?\n"
        "- Strip out noise, repeated points, and emotional filler\n"
        "- Return as 3-5 tight bullet points\n\n"
        f"Thread:\n{t}"
    ),
    "key_catalysts": lambda t: (
        "Identify the key catalysts mentioned or implied in this content.\n"
        "For each catalyst:\n"
        "- What it is\n"
        "- When it is expected (if mentioned)\n"
        "- Potential market impact (bullish/bearish/mixed)\n"
        "Order by significance. Be specific.\n\n"
        f"Content:\n{t}"
    ),
    "market_impact": lambda t: (
        "Analyze the potential market impact of what is described in this content.\n"
        "Return:\n"
        "- Immediate reaction: what markets/sectors/stocks are affected\n"
        "- Direction: bullish or bearish pressure and why\n"
        "- Who wins, who loses\n"
        "- Key risk to this assessment\n"
        "Be specific. Use names and tickers mentioned.\n\n"
        f"Content:\n{t}"
    ),
    "key_takeaways": lambda t: (
        "Extract the key takeaways from this financial content.\n"
        "Requirements:\n"
        "- What are the 3-5 most important points?\n"
        "- What does this change or confirm?\n"
        "- What should a trader or investor do with this information?\n"
        "- Skip anything obvious or already known\n\n"
        f"Content:\n{t}"
    ),
    "trade_risks": lambda t: (
        "Identify the key risks in this trade or investment idea.\n"
        "For each risk:\n"
        "- What it is\n"
        "- How likely / how severe\n"
        "- What would trigger it\n"
        "Order by severity. Include risks the author may have overlooked.\n\n"
        f"Content:\n{t}"
    ),
    "actionable_points": lambda t: (
        "Extract only the actionable points from this content.\n"
        "Filter out: opinions, background, repetition, noise.\n"
        "Keep only: specific data points, named stocks/sectors, entry/exit levels, dates, events.\n"
        "Format as tight bullet points. If nothing is truly actionable, say so.\n\n"
        f"Content:\n{t}"
    ),
    "important_changes": lambda t: (
        "Identify the most important changes in this filing or earnings report compared to prior periods.\n"
        "Focus on:\n"
        "- Revenue, margins, guidance changes\n"
        "- Language changes (more cautious? more confident?)\n"
        "- New risks disclosed\n"
        "- Anything management emphasized or de-emphasized\n"
        "Flag anything surprising or that the market may not have priced in.\n\n"
        f"Filing:\n{t}"
    ),
    "guidance_summary": lambda t: (
        "Summarize the forward guidance from this earnings report or filing.\n"
        "Return:\n"
        "- Revenue guidance: range and comparison to consensus if mentioned\n"
        "- EPS / margin guidance\n"
        "- Qualitative guidance: what management said about the outlook\n"
        "- Beat / miss / in-line vs prior guidance\n"
        "- One-line verdict on whether guidance is positive or negative catalyst\n\n"
        f"Content:\n{t}"
    ),
    "market_reaction": lambda t: (
        "Based on this content, predict the likely market reaction.\n"
        "Return:\n"
        "- Initial reaction: up/down/mixed and magnitude estimate\n"
        "- Which stocks or sectors move and in which direction\n"
        "- What the bears will focus on\n"
        "- What the bulls will focus on\n"
        "- Key number or phrase the market will key off\n\n"
        f"Content:\n{t}"
    ),
    "explain_indicator": lambda t: (
        "Explain the technical indicator or chart pattern described or shown.\n"
        "Requirements:\n"
        "- What it is and what it measures\n"
        "- What the current reading means\n"
        "- What traders typically do with this signal\n"
        "- Its limitations — when it fails\n"
        "Plain language. No jargon without explanation.\n\n"
        f"Content:\n{t}"
    ),
    "journal_entry": lambda t: (
        "Convert this trade information into a clean journal entry.\n"
        "Format:\n"
        "Trade: [ticker] [long/short]\n"
        "Entry: [price/level]\n"
        "Thesis: [one sentence why]\n"
        "Invalidation: [what would make this wrong]\n"
        "Notes: [anything else relevant]\n"
        "Extract from whatever context is available. Fill in what you can.\n\n"
        f"Content:\n{t}"
    ),
    "risk_summary": lambda t: (
        "Summarize the risk profile of this position or portfolio based on the content.\n"
        "Return:\n"
        "- Largest risk exposures\n"
        "- Concentration concerns\n"
        "- What a bad scenario looks like\n"
        "- One suggested action to reduce risk\n\n"
        f"Content:\n{t}"
    ),

    # ── ERP: Approval Queue Intelligence ─────────────────────────────────────
    "analyze_queue": lambda t: (
        "You are viewing an ERP approval queue (SAP, Oracle, Workday, Ariba, or similar).\n"
        "Analyze every visible pending approval item and produce a decision brief.\n\n"
        "For each item, identify:\n"
        "- Item description (vendor, document type, amount, requester if visible)\n"
        "- Risk signals: unusual amount, new or unknown vendor, duplicate pattern, "
        "policy exception, missing supporting info\n"
        "- Recommended action: Approve / Hold / Escalate / Reject — with one-line reason\n\n"
        "Format:\n"
        "## Approval Queue Summary\n"
        "Total items: N  |  Recommend approve: N  |  Hold/Review: N  |  Escalate: N\n\n"
        "[Item 1]\n"
        "  Description: ...\n"
        "  Risk signals: ...\n"
        "  Recommendation: Approve / Hold / Escalate / Reject — reason\n\n"
        "## Items Requiring Attention\n"
        "[List only items flagged Hold, Escalate, or Reject with their reasons]\n\n"
        "Return only this structured output. Do not add disclaimers.\n\n"
        f"Queue content:\n{t}"
    ),

    "flag_risks": lambda t: (
        "You are reviewing an ERP approval queue for risk and compliance signals.\n"
        "Scan the content and flag every item that shows one or more of these risk patterns:\n\n"
        "- Amount anomaly: significantly above or below typical range for this type\n"
        "- New or unrecognized vendor: not a known supplier\n"
        "- Duplicate: same vendor + amount appearing more than once\n"
        "- Missing documentation: references to attachments or approvals that are absent\n"
        "- Policy exception: over budget limit, outside approved category, unusual timing\n"
        "- Split transaction: multiple items that appear to circumvent an approval threshold\n\n"
        "Format each flagged item as:\n"
        "⚠️ [Item identifier or description]\n"
        "   Risk: [type of risk]\n"
        "   Detail: [what specifically triggered the flag]\n"
        "   Action: [suggested next step]\n\n"
        "If no items are flagged, say: 'No risk signals detected in the visible queue.'\n"
        "Return only the flagged items.\n\n"
        f"Queue content:\n{t}"
    ),

    "batch_summary": lambda t: (
        "Summarize the approval queue shown for a manager who needs a 60-second briefing.\n"
        "Cover:\n"
        "- Total pending items and total value (if amounts are visible)\n"
        "- Breakdown by category, department, or vendor (whichever is most visible)\n"
        "- Oldest item waiting (if dates are visible)\n"
        "- Top 3 items by value or urgency\n"
        "- One-sentence recommended priority: what to approve first and why\n\n"
        "Be concise. Bullet points. No filler.\n\n"
        f"Queue content:\n{t}"
    ),

    "escalation_list": lambda t: (
        "Review this ERP approval queue and generate an escalation report.\n"
        "Identify items that should be escalated to a senior approver or finance controller.\n\n"
        "Escalation criteria:\n"
        "- Amount exceeds typical approval authority (look for unusually large values)\n"
        "- Item has been pending more than the normal cycle (look for old dates)\n"
        "- Vendor or requester shows anomaly patterns\n"
        "- Item touches sensitive categories: capital expenditure, sole-source, inter-company\n\n"
        "Format:\n"
        "## Escalation Report\n"
        "Items recommended for escalation: N\n\n"
        "[For each item:]\n"
        "- Item: [description]\n"
        "  Escalation reason: [specific reason]\n"
        "  Suggested escalation to: [Finance Controller / CFO / Procurement Manager — based on type]\n\n"
        "Return only this output.\n\n"
        f"Queue content:\n{t}"
    ),

    # ── ERP: Period-End Close Assistant ──────────────────────────────────────
    "close_status": lambda t: (
        "You are assisting with a period-end close (month-end, quarter-end, or year-end).\n"
        "Review the visible content and generate a close status summary.\n\n"
        "Identify and report:\n"
        "- Close activities that appear COMPLETE (entries posted, reconciliations done, etc.)\n"
        "- Activities that appear OPEN or IN PROGRESS\n"
        "- Any BLOCKERS visible (unreconciled items, missing approvals, pending entries)\n"
        "- Estimated risk to on-time close (Low / Medium / High) with one-line reason\n\n"
        "Format:\n"
        "## Close Status\n"
        "✅ Complete: [list]\n"
        "🔄 In Progress: [list]\n"
        "⛔ Blockers: [list]\n"
        "Close risk: Low / Medium / High — [reason]\n\n"
        "Return only this output. Work only from what is visible.\n\n"
        f"Content:\n{t}"
    ),

    "draft_journal": lambda t: (
        "You are a finance professional drafting a journal entry based on the information shown.\n"
        "Extract the relevant amounts, accounts, and descriptions and produce a clean journal entry.\n\n"
        "Format:\n"
        "## Journal Entry\n"
        "Date: [date if visible, otherwise leave blank]\n"
        "Reference: [document number or description if visible]\n\n"
        "| Account | Description | Debit | Credit |\n"
        "|---------|-------------|-------|--------|\n"
        "| [account code/name] | [description] | [amount] | |\n"
        "| [account code/name] | [description] | | [amount] |\n\n"
        "Narration: [one sentence explaining the nature of the entry]\n\n"
        "Rules:\n"
        "- Debits and credits must balance\n"
        "- Use account names or codes visible in the content\n"
        "- If amounts are ambiguous, flag them with [?]\n"
        "- Never fabricate account codes not present in the source\n\n"
        f"Content:\n{t}"
    ),

    "explain_variance": lambda t: (
        "You are a financial analyst explaining a budget or period variance to management.\n"
        "Based on the content shown, write a clear variance explanation.\n\n"
        "Cover:\n"
        "- What the variance is (actual vs budget/prior period, amount, and percentage)\n"
        "- Primary drivers: what caused the variance (spending category, volume, timing, FX, etc.)\n"
        "- Whether it is expected to reverse or persist\n"
        "- Management action (if any) required\n\n"
        "Tone: factual, direct, suitable for a CFO or board pack. No speculation beyond what the data supports.\n"
        "Length: 3-5 sentences or a short bulleted list.\n\n"
        f"Content:\n{t}"
    ),

    "reconcile_check": lambda t: (
        "You are reviewing account reconciliation content at period-end.\n"
        "Identify any reconciling items, open differences, or unmatched entries.\n\n"
        "Return:\n"
        "## Reconciliation Check\n"
        "System balance: [if visible]\n"
        "Statement balance: [if visible]\n"
        "Difference: [calculated if both visible]\n\n"
        "Reconciling items:\n"
        "- [Each item: description, amount, date if visible, age if calculable]\n\n"
        "Items requiring action:\n"
        "- [Flag anything unmatched > 30 days, or amounts that don't tie]\n\n"
        "Conclusion: [Reconciled / Unreconciled — one sentence]\n\n"
        "Work only from what is visible. Flag any missing information with [?].\n\n"
        f"Content:\n{t}"
    ),
}


# ── Vision prompts ────────────────────────────────────────────────────────────

VISION_PROMPTS = {
    "pros_cons": (
        "Read the product page on screen. Extract the key Pros and Cons a buyer needs to know.\n"
        "Use the product description, reviews, ratings, and specs shown.\n"
        "Be specific — avoid vague points like 'good quality'.\n"
        "Format as:\nPros:\n- ...\n\nCons:\n- ...\n"
        "Return only the pros and cons list."
    ),
    "summarize": (
        "Summarize the main content on this screen.\n"
        "Capture every key point in 2-4 sentences. Be scannable.\n"
        "Return only the summary."
    ),
    "comment": (
        "Write a comment to leave on the content shown on screen.\n"
        "Add genuine value — an insight, question, or relevant take.\n"
        "Do NOT write 'Great post!' or empty praise. Sound like a real person.\n"
        "Keep it 1-3 sentences. Return only the comment."
    ),
    "caption": (
        "Write a social media caption for the content on screen.\n"
        "Open with a hook. Be specific and human, not generic.\n"
        "Return only the caption."
    ),
    "review": (
        "Write a genuine product review based on what is shown on screen.\n"
        "Sound like a real buyer. Mention strengths and weaknesses if evident.\n"
        "3-5 sentences. Return only the review."
    ),
    "explain": (
        "Explain what is on this screen in plain language.\n"
        "Write for a smart non-expert. No jargon. Be concise.\n"
        "Return only the explanation."
    ),
    "shorter": (
        "Rewrite the main text on screen in a more concise form.\n"
        "Preserve all key information. Cut filler and redundancy.\n"
        "Return only the shortened version."
    ),
    "polish": (
        "Rewrite the main copy on screen to be clearer and more compelling.\n"
        "Fix weak phrasing. Keep the original meaning.\n"
        "Return only the improved version."
    ),
    "reply": (
        f"{SYSTEM_CONTEXT}\n\n"
        "Write a reply to the message or content visible on this screen.\n"
        "Address the key points. Sound human, not like a template.\n"
        "Return only the reply."
    ),
    "follow_up": (
        f"{SYSTEM_CONTEXT}\n\n"
        "Write a brief follow-up message based on the content visible on this screen.\n"
        "Assume no response yet. One short paragraph. Clear call to action.\n"
        "Return only the follow-up."
    ),
    "improve": (
        "Read the EXACT code or text visible on this screen — do not invent or substitute content.\n"
        "Improve what you actually see:\n"
        "For code: return an improved version in the same language and framework. "
        "Better naming, structure, readability, idiomatic patterns. Preserve exact logic.\n"
        "For text: strengthen clarity, flow, and impact.\n"
        "Return only the improved version — no explanation, no preamble, no markdown wrapper."
    ),
    "options": (
        "Look at the text or code on this screen. Write 3 distinct alternative versions.\n"
        "Each version should take a meaningfully different approach.\n"
        "Number them 1, 2, 3. Each must stand alone and be ready to use.\n"
        "Return only the three versions."
    ),
    "hashtags": (
        "Generate hashtags for the content shown on this screen.\n"
        "8 hashtags, mix of popular and niche. Specific to the topic and audience.\n"
        "Return only the hashtags on a single line, space-separated."
    ),
    "key_takeaways": (
        "Extract the 3-5 most important takeaways from what is shown on this screen.\n"
        "Skip anything obvious. Focus on what actually matters.\n"
        "Return as tight bullet points."
    ),
    "sentiment": (
        "Analyze the sentiment of the content shown on this screen.\n"
        "Return: Overall (Bullish/Bearish/Neutral), key drivers, and a one-line summary.\n"
        "Be specific to what is shown."
    ),
}


# ── Inspect prompts ───────────────────────────────────────────────────────────

INSPECT_PROMPTS = {
    "dev": (
        "You are a design inspector producing developer-ready specs for a UI element.\n"
        "Be precise and technical. Format your response with these labeled sections:\n\n"
        "Element type: [button / card / input / nav / badge / modal / icon / etc.]\n"
        "Typography: [serif/sans-serif, weight 100-900, approximate size, letter-spacing]\n"
        "Shape: [border-radius: sharp/4px/8px/12px/pill, shadow, border]\n"
        "State: [default / hover / active / disabled / loading]\n\n"
        "CSS:\n"
        "  background: [hex or gradient];\n"
        "  color: [hex];\n"
        "  border-radius: [value];\n"
        "  padding: [top right bottom left];\n"
        "  font-size: [value];\n"
        "  font-weight: [value];\n"
        "  border: [value or none];\n"
        "  box-shadow: [value or none];\n\n"
        "Tailwind: [space-separated utility classes that approximate this style]\n\n"
        "Flutter/Dart:\n"
        "  [Widget name and key properties as Dart code snippet]\n\n"
        "SwiftUI:\n"
        "  [SwiftUI modifier chain]\n\n"
        "Android/XML:\n"
        "  [key style attributes]\n\n"
        "Notes: [anything a developer should know about recreating this]\n"
        "Be specific. Estimate values where exact values are not visible."
    ),
    "design": (
        "You are a design inspector producing Figma/Sketch/Adobe XD recreation specs.\n"
        "Format your response with these labeled sections:\n\n"
        "Element type: [button / card / input / nav / badge / modal / icon / etc.]\n"
        "Typography: [font style, weight, approximate size, line height, letter spacing]\n"
        "Colors: [list each color with hex value and its role: background / text / border / accent]\n"
        "Shape: [border-radius, shadows with values, border stroke]\n"
        "Layout: [padding, inner spacing, alignment, auto-layout direction if applicable]\n"
        "Design pattern: [flat / material / neumorphic / glassmorphism / outlined / filled]\n"
        "State: [default / hover / active / disabled]\n\n"
        "Figma recreation:\n"
        "  1. [Frame or component setup]\n"
        "  2. [Fill / background]\n"
        "  3. [Text layer properties]\n"
        "  4. [Effects: shadows, blur]\n"
        "  5. [Auto layout settings if applicable]\n\n"
        "Design tokens: [suggest variable names: --color-primary, --radius-button, etc.]\n"
        "Notes: [accessibility contrast, design system category, any notable decisions]"
    ),
    "art": (
        "You are a visual analyst providing design and artistic breakdown of this element or asset.\n"
        "Format your response with these labeled sections:\n\n"
        "Element type: [button / illustration / 3D render / icon / photo / animation frame / etc.]\n\n"
        "Color palette: [list every distinct color with hex value]\n"
        "Color mood: [warm / cool / neutral / vibrant / muted / monochromatic / complementary / triadic / analogous]\n"
        "Dominant tone: [describe the overall visual temperature and mood]\n\n"
        "Artistic style: [flat / material / neumorphic / glassmorphism / illustrated / cel-shaded / "
        "isometric / photorealistic / pixel art / hand-drawn / collage / minimalist]\n"
        "Visual weight: [light and airy / balanced / heavy and dense]\n\n"
        "Lighting: [none / ambient / soft diffused / directional (describe direction) / dramatic / backlit]\n"
        "Shadow: [none / subtle / grounded / floating / cast shadow]\n"
        "Materials: [matte / glossy / metallic / translucent / textured / painted / fabric / glass / plastic]\n\n"
        "Composition: [rule of thirds / centered / asymmetric / radial / grid-based]\n"
        "Depth: [flat / shallow / layered / deep perspective]\n\n"
        "For animation/motion:\n"
        "  Feel: [snappy / smooth / bouncy / elastic / linear / ease-in-out / spring]\n"
        "  Suggested easing: [ease / ease-in / ease-out / spring / linear / cubic-bezier]\n"
        "  Natural motion: [describe how this element would animate naturally]\n\n"
        "Style references: [what design movement, era, or artistic style does this resemble]\n"
        "Notes: [anything useful for recreating or being inspired by this]"
    ),
}

_INSPECT_MODE_MAP = {
    "developer": "dev",
    "docs":      "dev",
    "design":    "design",
}


def get_inspect_prompt(context: str) -> tuple[str, str]:
    """Returns (prompt_text, mode_name) for the given context."""
    mode = _INSPECT_MODE_MAP.get(context, "art")
    return INSPECT_PROMPTS[mode], mode


# ── Canvas prompts ────────────────────────────────────────────────────────────

_CANVAS_GROUPS: dict[str, list] = {
    "Web": [
        ("HTML/CSS",    "html",     ".html"),
        ("Tailwind",    "tailwind", ".html"),
        ("React",       "react",    ".jsx"),
        ("Vue",         "vue",      ".vue"),
        ("SVG",         "svg",      ".svg"),
    ],
    "Code": [
        ("Python",      "python",   ".py"),
        ("JavaScript",  "js",       ".js"),
        ("TypeScript",  "ts",       ".ts"),
        ("Java",        "java",     ".java"),
    ],
    "Data": [
        ("JSON",        "json",     ".json"),
        ("CSV",         "csv",      ".csv"),
        ("YAML",        "yaml",     ".yaml"),
        ("Parquet",     "parquet",  ".py"),
    ],
    "3D / Visual": [
        ("Three.js",    "threejs",  ".html"),
        ("GLTF/JSON",   "gltf",     ".gltf"),
        ("OBJ",         "obj",      ".obj"),
        ("FBX Script",  "fbx",      ".py"),
    ],
}

_CANVAS_BROWSER_NATIVE = {"html", "tailwind", "react", "vue", "svg", "threejs"}

_CANVAS_FW_NOTES: dict[str, str] = {
    "html":     "Use pure HTML with embedded CSS only — no external frameworks.",
    "tailwind": "Use Tailwind CSS via CDN: <script src='https://cdn.tailwindcss.com'></script>. No other dependencies.",
    "react":    (
        "Use React 18 via CDN — include these scripts:\n"
        "<script src='https://unpkg.com/react@18/umd/react.development.js'></script>\n"
        "<script src='https://unpkg.com/react-dom@18/umd/react-dom.development.js'></script>\n"
        "<script src='https://unpkg.com/@babel/standalone/babel.min.js'></script>\n"
        "Write JSX inside <script type='text/babel'>. Use ReactDOM.createRoot."
    ),
    "vue":      "Use Vue 3 via CDN: <script src='https://unpkg.com/vue@3/dist/vue.global.js'></script>. Write components inline.",
    "svg":      "Return ONLY the SVG element starting with <svg ...>. Use a viewBox. May include CSS animations via <style> or <animate>.",
    "python":   "Write clean Python 3.10+. Include all imports. Use type hints. Add comments only where non-obvious.",
    "js":       "Write modern ES2022+ JavaScript. Use const/let, arrow functions, async/await. No TypeScript syntax.",
    "ts":       "Write TypeScript with proper interfaces and types. Target ES2022. Include all imports.",
    "java":     "Write Java 17+. Include package declaration, all imports, and the full class.",
    "json":     "Return ONLY valid JSON. No comments, no code fences, no explanation. Use 2-space indentation.",
    "csv":      "Return ONLY raw CSV. First row = column headers. Comma delimiter. Quote values that contain commas or newlines.",
    "yaml":     "Return ONLY valid YAML. 2-space indentation. No trailing spaces. No code fences.",
    "parquet":  "Return Python code using pandas that creates a realistic DataFrame matching the request, then saves it as a .parquet file using df.to_parquet('output.parquet').",
    "threejs":  (
        "Create a complete self-contained HTML file using Three.js:\n"
        "<script src='https://unpkg.com/three@0.160.0/build/three.min.js'></script>\n"
        "Include an animated 3D scene with proper lighting, camera, and OrbitControls if useful."
    ),
    "gltf":     "Return ONLY valid GLTF 2.0 JSON. Include asset, scene, nodes, meshes, materials, and accessors sections. Encode geometry as base64 buffers.",
    "obj":      "Return ONLY valid OBJ file content — vertex (v), texture coord (vt), normal (vn), and face (f) lines. Include an mtllib reference if materials are needed.",
    "fbx":      "Return a Python script using Blender's bpy module that creates the described 3D object/scene and exports it using bpy.ops.export_scene.fbx(filepath='output.fbx'). Include all bpy imports.",
}


def _canvas_text_prompt(fmt: str, user_text: str,
                         current_code: str = "", iteration: str = "") -> str:
    note    = _CANVAS_FW_NOTES.get(fmt, "")
    is_web  = fmt in _CANVAS_BROWSER_NATIVE and fmt != "svg"
    is_svg  = fmt == "svg"

    if iteration and current_code:
        return (
            f"Edit the following code based on the instruction.\n\n"
            f"Current code:\n```\n{current_code[:8000]}\n```\n\n"
            f"Instruction: {iteration}\n\n"
            f"Framework/format note: {note}\n\n"
            f"Return ONLY the complete updated output. No explanation."
        )
    if is_web:
        return (
            f"You are an expert frontend developer. Build the following as a complete, "
            f"self-contained HTML file.\n\n"
            f"{note}\n\n"
            f"Requirements:\n"
            f"- All CSS and JS embedded in one file\n"
            f"- Modern, clean, professional design with CSS custom properties\n"
            f"- Smooth transitions and hover states\n"
            f"- Return ONLY the complete HTML starting with <!DOCTYPE html>\n\n"
            f"Build: {user_text}"
        )
    if is_svg:
        return (
            f"You are an expert SVG illustrator. Create an SVG image as described.\n\n"
            f"{note}\n\n"
            f"Describe: {user_text}\n\n"
            f"Return ONLY the SVG element, nothing else."
        )
    if fmt in ("python", "js", "ts", "java", "parquet", "fbx"):
        return (
            f"You are an expert programmer. Complete the following task.\n\n"
            f"{note}\n\n"
            f"Task: {user_text}\n\n"
            f"Return ONLY the code. No explanation, no markdown fences."
        )
    if fmt in ("json", "csv", "yaml"):
        return (
            f"Generate the data described below.\n\n"
            f"{note}\n\n"
            f"Request: {user_text}\n\n"
            f"Return ONLY the raw data. No explanation, no markdown fences."
        )
    if fmt in ("gltf", "obj"):
        return (
            f"You are a 3D graphics expert. Generate the described 3D asset.\n\n"
            f"{note}\n\n"
            f"Create: {user_text}\n\n"
            f"Return ONLY the file content."
        )
    return f"Build: {user_text}\n\n{note}\n\nReturn ONLY the output."


def _canvas_vision_prompt(fmt: str) -> str:
    note   = _CANVAS_FW_NOTES.get(fmt, "")
    is_web = fmt in _CANVAS_BROWSER_NATIVE and fmt != "svg"
    if is_web:
        return (
            f"You are an expert frontend developer. Recreate what you see in this screenshot "
            f"as a complete, self-contained HTML file.\n\n"
            f"{note}\n\n"
            f"- Match colors, typography, spacing, and layout as closely as possible\n"
            f"- Add hover states and smooth transitions\n"
            f"- All CSS and JS embedded in one file\n"
            f"- Return ONLY the complete HTML starting with <!DOCTYPE html>"
        )
    if fmt == "svg":
        return (
            f"You are an expert SVG illustrator. Recreate or represent what you see as SVG.\n\n"
            f"{note}\n\nReturn ONLY the SVG element."
        )
    if fmt in ("python", "js", "ts", "java"):
        return (
            f"Analyze this screenshot and generate {fmt} code that implements "
            f"or processes what is shown.\n\n{note}\n\nReturn ONLY the code."
        )
    if fmt in ("json", "csv", "yaml"):
        return (
            f"Analyze this screenshot and generate structured {fmt.upper()} data representing "
            f"what is shown.\n\n{note}\n\nReturn ONLY the raw data."
        )
    return (
        f"Analyze this screenshot and generate the corresponding output.\n\n"
        f"{note}\n\nReturn ONLY the output content."
    )


# ── Universal reply / follow-up prompts ──────────────────────────────────────
#
# These prompts are self-sufficient. They instruct the LLM to identify sender,
# recipient, and context directly from the visible text — no regex pre-extraction,
# no app-specific assumptions. Works across Gmail, Outlook, Zendesk, Salesforce,
# Slack, LinkedIn, Discord, and any other surface without modification.

# Tone instructions keyed by context_type
_REPLY_TONE: dict[str, str] = {
    "email":            "Professional email tone. No filler openers like 'Hope this finds you well'. No sign-off unless natural.",
    "chat":             "Conversational and concise. Match the register of the original. 1-3 sentences.",
    "social":           "Genuine and human. Add real value — an insight, question, or relevant take. No empty praise.",
    "outbound":         "Personal and brief. Reference something specific. One clear next step. 2-4 sentences max.",
    "sales":            "Confident and specific. One concrete next step. Mirror their formality.",
    "customer_support": "Empathetic and action-oriented. Begin with acknowledgement. State the resolution clearly.",
    "enterprise":       "Professional and direct. Structured if the original is structured.",
    "developer":        "Technical and precise. Match the format of the original (e.g. code review, PR comment, issue).",
    "research":         "Precise and evidence-grounded. Academic register if appropriate.",
    "finance":          "Clear, measured, data-first. Professional.",
    "real_estate":      "Warm, professional, action-oriented. One clear next step.",
    "ecommerce":        "Direct and helpful. Resolution-focused.",
    "content":          "Match platform voice. Engaging and specific.",
}

_FOLLOWUP_TONE: dict[str, str] = {
    "email":    "Brief — one short paragraph. Low-friction call to action. Not pushy.",
    "outbound": "Short. Offer something new or reference a specific reason to reconnect.",
    "sales":    "Brief. New angle or value add. One clear ask.",
    "chat":     "Casual check-in. 1-2 sentences.",
}


def _build_context_block(
    app_name: str,
    situation: str,
    confidence: float,
    signals,
) -> str:
    """
    Builds the structured SYSTEM block prepended to reply/followup prompts.
    Combines platform name, deterministic signals, and confidence-gated situation.
    """
    lines = []

    if app_name:
        lines.append(f"Platform: {app_name}")

    if signals:
        lines.append(f"Signals: {signals.summary()}")

    # Confidence gates how firmly we assert the brain's situation
    if situation and situation.strip():
        if confidence >= 0.7:
            lines.append(f"Context: {situation.strip()}")
        elif confidence >= 0.4:
            lines.append(f"Context hint (uncertain): {situation.strip()}")
        # below 0.4 — brain hasn't settled, don't assert anything

    return "\n".join(lines) + "\n" if lines else ""


def _universal_reply_prompt(
    text: str,
    context_type: str,
    app_name: str,
    situation: str,
    confidence: float = 0.0,
    signals=None,
) -> str:
    """
    Single reply prompt that works across every app and workflow.
    The LLM identifies sender, recipient, and context from the raw text itself.
    Signals and confidence-gated situation reduce ambiguity without brittle parsing.
    """
    tone         = _REPLY_TONE.get(context_type, "Professional and clear.")
    context_block = _build_context_block(app_name, situation, confidence, signals)

    # Sharpen the sender-identification hint based on signals
    if signals and signals.has_email_headers:
        sender_hint = "The content contains email headers — find the sender in the From: field."
    elif signals and signals.has_quoted_thread:
        sender_hint = "The content is a quoted thread — find who wrote the most recent message."
    else:
        sender_hint = (
            "Find who sent or wrote the original message. Format varies by app: "
            "From: fields in email, usernames in chat, poster names in social/CRM."
        )

    return (
        f"{context_block}"
        "Task: Write a reply to the message in this content.\n\n"
        f"Step 1 — Identify the sender: {sender_hint}\n\n"
        "Step 2 — Write the reply:\n"
        f"- Address the reply TO the identified sender, not to the user themselves\n"
        f"- {tone}\n"
        "- Sound like a real person wrote it\n"
        "- Do not narrate your steps or mention who you identified\n"
        "- Return ONLY the reply text, nothing else\n\n"
        f"Content:\n{text}"
    )


def _universal_followup_prompt(
    text: str,
    context_type: str,
    app_name: str,
    situation: str,
    confidence: float = 0.0,
    signals=None,
) -> str:
    """
    Single follow-up prompt. LLM identifies who to follow up with from the text.
    """
    tone          = _FOLLOWUP_TONE.get(context_type, "Brief, one paragraph, clear call to action. Not pushy.")
    context_block = _build_context_block(app_name, situation, confidence, signals)

    return (
        f"{context_block}"
        "Task: Write a follow-up message based on this content.\n\n"
        "Step 1 — Identify who to follow up with: Find who the user previously "
        "contacted or needs to follow up with (From/sender fields, names, usernames).\n\n"
        "Step 2 — Write the follow-up:\n"
        "- Assume they have not yet responded\n"
        f"- {tone}\n"
        "- Do not be pushy or passive-aggressive\n"
        "- Address it TO the identified person\n"
        "- Return ONLY the follow-up text, nothing else\n\n"
        f"Content:\n{text}"
    )


# ── Prompt builder ────────────────────────────────────────────────────────────

def _build_retrieval_block(docs: list) -> str:
    """
    Format retrieved documents for injection into the prompt.
    Called only when bundle.retrieved_docs is non-empty.
    """
    if not docs:
        return ""
    lines = [
        "---",
        "Retrieved context — use this to inform your response, cite sources where helpful:",
    ]
    for i, doc in enumerate(docs[:5], 1):
        label = doc.title or doc.source or f"Source {i}"
        lines.append(f"\n[{i}] {label}")
        if doc.source and doc.source != label:
            lines.append(f"URL: {doc.source}")
        lines.append(doc.content[:800].strip())
    lines.append("---")
    return "\n".join(lines)


def build_prompt(text: str, action: str, tone: str,
                 custom_instruction: str = "",
                 bundle: "ContextBundle | None" = None) -> str:
    """
    Build the full LLM prompt for a given action.
    All brain-context params (app_name, context_type, situation, etc.)
    are passed as a single ContextBundle instead of individual kwargs.
    If bundle.retrieved_docs is set, retrieved context is injected before the
    action prompt so the model can cite external sources.
    """
    b            = bundle or ContextBundle.empty()
    context_type = b.context_type or "generic"
    tone_instr   = TONE_INSTRUCTIONS[tone]
    system       = compose_context(app_name=b.app_name, text=text, action=action)

    retrieval_block = _build_retrieval_block(getattr(b, "retrieved_docs", []))

    if action == "custom":
        parts = [system, tone_instr]
        ctx_block = _build_context_block(b.app_name, b.situation, b.confidence, b.signals).strip()
        if ctx_block:
            parts.append(ctx_block)
        if retrieval_block:
            parts.append(retrieval_block)
        parts.append(custom_instruction)
        if text:
            parts.append(f"Text:\n{text}")
        return "\n\n".join(parts)

    if action == "reply":
        action_prompt = _universal_reply_prompt(
            text, context_type, b.app_name, b.situation, b.confidence, b.signals)

    elif action == "follow_up":
        action_prompt = _universal_followup_prompt(
            text, context_type, b.app_name, b.situation, b.confidence, b.signals)

    else:
        action_prompt = ACTION_PROMPTS[action](text)

    parts = [system, tone_instr]
    if retrieval_block:
        parts.append(retrieval_block)
    parts.append(action_prompt)
    return "\n\n".join(parts)
