// lib/task-normalizer.ts
// Task Normalization Layer — sits between user language and execution language.
//
// PURPOSE
//   Separate what the user SAID from what should be EXECUTED.
//   User language is conversational. Execution language is concise and domain-specific.
//
//   User:    "find best deals on nike shoes"
//   Query:   "nike shoes"          ← only entity — what gets typed into search
//   Intent:  "shopping"            ← drives strategy selection
//   Strategy:"comparison"          ← visit multiple stores
//
// RULES
//   1. Strip ALL action verbs: find, search, look up, show me, buy, get me...
//   2. Strip ALL qualifiers:   best, cheapest, latest, deals on, prices for...
//   3. Strip site prepositions: "on Amazon", "at Walmart", "from Google"
//   4. Strip post-action tail: "and play the first one", "then click top result"
//   5. Keep: brand names, product names, model numbers, locations, dates
//
// DETERMINISTIC — no LLM, no async. Called before the planner runs.

export type TaskIntent   = "navigate" | "shopping" | "search" | "task";
export type TaskStrategy = "direct"   | "single"   | "comparison";

export interface NormalizedTask {
  raw:          string;         // original user input — never mutated
  intent:       TaskIntent;
  query:        string;         // ONLY the entity — the string typed into a search field
  destination?: string;         // site key if the user named one (youtube, amazon, etc.)
  url?:         string;         // for navigate intent
  strategy:     TaskStrategy;
  postAction?:  "click_first";  // user wants to interact with a result after searching
}

// ── Strip conversational phrasing ─────────────────────────────────────────────

const VERB_PREFIX = /^(?:find\s+(?:me\s+)?|search\s+(?:for\s+)?|look\s+up\s+|show\s+me\s+|get\s+(?:me\s+)?|i\s+(?:want|need)\s+(?:to\s+(?:find|buy|see)\s+)?|can\s+you\s+(?:find\s+)?|please\s+(?:find\s+)?|go\s+(?:and\s+)?(?:find|search\s+for|look\s+up)\s+|open\s+|navigate\s+to\s+)/i;

const QUALIFIER_PREFIX = /^(?:the\s+)?(?:best|cheapest|latest|newest|most\s+popular|top-rated|top\s+rated)\s+(?:deals?\s+(?:on|for)\s+|prices?\s+(?:on|for)\s+|price\s+of\s+)?/i;

const POST_ACTION_TAIL = /\s+(?:and|then|,\s*then)\s+(?:play|click|open|watch|buy|purchase|add\s+to\s+cart|download|install)\b.*/i;

const TRAILING_VERB = /\s+(?:play|click|open|watch)\b.*/i;

const TRAILING_REF = /\s+(?:that|it|one|the\s+one|them|those)\s*$/i;

// Strip site destination from the tail: "on Amazon", "from YouTube", "at Walmart"
const SITE_TAIL = /\s+(?:on|at|from|in|via|using|through)\s+(?:youtube|amazon|google|walmart|target|ebay|linkedin|twitter|x\.com|reddit|instagram|facebook|netflix|spotify|github)\s*$/i;

export function extractEntity(raw: string): string {
  return raw
    .replace(VERB_PREFIX,       "")
    .replace(QUALIFIER_PREFIX,  "")
    .replace(POST_ACTION_TAIL,  "")
    .replace(TRAILING_VERB,     "")
    .replace(SITE_TAIL,         "")
    .replace(TRAILING_REF,      "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Intent classification ─────────────────────────────────────────────────────

const URL_RE    = /^https?:\/\/\S+|^www\.\S+\.\S+/i;
const DIRECT_RE = /\b(?:go\s+to|open|navigate\s+to|visit)\s+(https?:\/\/\S+|\S+\.\S+)/i;

const SITE_MENTION = /\b(?:on|at|from|via|using|through)\s+(youtube|amazon|google|walmart|target|ebay|linkedin|twitter|x\.com|reddit|instagram|spotify|github|netflix)\b/i;

const SITE_KEYS: Record<string, string> = {
  youtube: "youtube", amazon: "amazon", google: "google", walmart: "walmart",
  target: "target", ebay: "ebay", linkedin: "linkedin", twitter: "twitter",
  "x.com": "x.com", reddit: "reddit", instagram: "instagram", spotify: "spotify",
  github: "github",
};

const SHOPPING_PRODUCT = /\b(shoe|sneaker|boot|jordan|yeezy|trainer|adidas|reebok|converse|vans|puma|footwear|laptop|macbook|iphone|android|phone|tablet|ipad|airpod|headphone|speaker|monitor|tv|console|ps5|xbox|camera|shirt|dress|jacket|pants|hoodie|sweater|jeans|clothing|apparel|bag|watch|glasses)\b/i;
const SHOPPING_INTENT  = /\b(buy|shop|purchase|deal|discount|sale|cheapest?|price|order|cart|checkout)\b/i;
const SEARCH_INTENT    = /\b(search|find|look\s*up|show|discover|explore|what\s+is|how\s+to|where\s+is)\b/i;

const POST_ACTION_WANT = /\b(?:play|click|open|watch|buy)\b.{0,50}\b(?:first|top|best)\b/i;

// ── Main normalizer ───────────────────────────────────────────────────────────

export function normalizeTask(raw: string): NormalizedTask {
  const trimmed = raw.trim();
  const lower   = trimmed.toLowerCase();

  // 1. Explicit URL / direct navigation
  const urlMatch = trimmed.match(URL_RE) ?? trimmed.match(DIRECT_RE);
  if (urlMatch) {
    const href = urlMatch[1] ?? urlMatch[0];
    const url  = href.startsWith("http") ? href : `https://${href}`;
    return { raw: trimmed, intent: "navigate", query: trimmed, url, strategy: "direct" };
  }

  // 2. Named destination site
  const siteMatch  = lower.match(SITE_MENTION);
  const destination = siteMatch ? SITE_KEYS[siteMatch[1]] : undefined;

  // 3. Clean entity — always extracted regardless of intent
  const query = extractEntity(trimmed) || trimmed;

  // 4. Post-action (click first result etc.)
  const postAction = POST_ACTION_WANT.test(lower) ? "click_first" as const : undefined;

  // 5. Shopping: product category + no named site → comparison tour
  if (SHOPPING_PRODUCT.test(lower) && !destination) {
    const hasShoppingVerb = SHOPPING_INTENT.test(lower) || SEARCH_INTENT.test(lower);
    if (hasShoppingVerb) {
      return { raw: trimmed, intent: "shopping", query, strategy: "comparison", postAction };
    }
  }

  // 6. Shopping: product + named site → single store
  if (SHOPPING_PRODUCT.test(lower) && SHOPPING_INTENT.test(lower)) {
    return { raw: trimmed, intent: "shopping", query, destination: destination ?? "amazon", strategy: "single", postAction };
  }

  // 7. Explicit search intent or named destination
  if (SEARCH_INTENT.test(lower) || destination) {
    return { raw: trimmed, intent: "search", query, destination, strategy: "single", postAction };
  }

  // 8. Generic task — Commander will plan it; still clean the query
  return { raw: trimmed, intent: "task", query, strategy: "direct" };
}
