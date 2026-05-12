// lib/workflow-engine.ts
// -----------------------------------------------------------------------------
// THE single execution path for all agent tasks.
//
// Commander  (Kimi K2):     Reads structured page sections + goal -> Manifest JSON
// Slave 1    (Muscle):      navigate . click . scroll . wait
// Slave 2    (Analyst):     search . extract . analyze . verify
// Slave 3    (Ghostwriter):  type (ghost keyboard) . pii_collect . payment
//
// Step types:
//   navigate    - Slave 1 opens/changes URL
//   click       - Slave 1 clicks element (ghost cursor)
//   click_coords - Slave 1 clicks at (x,y)
//   scroll      - Slave 1 scrolls page
//   wait        - Slave 1 waits for page state
//   extract     - Slave 2 reads DOM via extension or web-reader fallback
//   search      - Slave 2 runs server-side web search (no browser)
//   analyze     - Slave 2 reasons over extracted content with NVIDIA
//   verify      - Slave 2 checks page state
//   type        - Slave 3 ghost-types into an input
//   pii_collect - Slave 3 pauses -> shows Pop Card -> waits for user to supply PII
//   payment     - Slave 3 pauses -> shows Stripe/Square widget
// -----------------------------------------------------------------------------

import { kimiComplete }         from "./agents/kimi-server";
import { nvidiaComplete }        from "./nvidia";
import { JINA_SEARCH, JINA_READ } from "./web-reader";
import { classifyIntent }        from "./intent-agent";
import { buildIdentity }         from "./agent-identity";
import { verifyStep }            from "./agents/verifier-agent";
import { synthesizeWorkflow }    from "./agents/synthesizer-agent";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type SlaveId = 1 | 2 | 3;

export type StepType =
  | "navigate" | "click" | "click_coords" | "scroll" | "wait"
  | "extract"  | "search" | "analyze" | "verify"
  | "type"     | "pii_collect" | "payment" | "clarify"
  | "search_web" | "open_site" | "extract_pricing" | "summarize_page"
  | "research";

export type StepStatus = "pending" | "active" | "complete" | "failed" | "skipped";

export interface ManifestStep {
  id:          string;
  type:        StepType;
  slave:       SlaveId;
  description: string;
  target?: {
    text?:        string;
    ariaLabel?:   string;
    selector?:    string;
    coordinates?: { x: number; y: number };
  };
  url?:         string;
  value?:       string;
  query?:       string;
  question?:    string;
  direction?:   "down" | "up";
  amount?:      number;
  status:       StepStatus;
  result?:      unknown;
  thought?:     string;
  attempts:     number;
  maxAttempts:  number;
  fields?:      string[];
  pressEnter?:  boolean;
}

export interface PageSections {
  primary:     string;   // main headings, product names, prices, CTAs
  contextual:  string;   // supporting text, specs, feature lists
  finePrint:   string;   // legal, disclaimers, asterisked costs, hidden fees
  interactive: string;   // buttons, links, inputs - the action surface
}

// Manifest = the full workflow plan produced by the Commander
export interface Manifest {
  id:                 string;
  goal:               string;
  pageUrl:            string;
  pageTitle:          string;
  steps:              ManifestStep[];
  createdAt:          number;
  updatedAt:          number;
  status:             "pending" | "running" | "paused" | "complete" | "failed";
  extractedData:      Record<string, unknown>;
  commanderReasoning: string;
}

// Alias kept for backward compat with any code still using WorkflowManifest
export type WorkflowManifest = Manifest;

// Browser action sent from the engine to the route → canvas → extension
export interface BrowserAction {
  type:         StepType;
  slave:        SlaveId;
  target?:      ManifestStep["target"] & { url?: string };
  value?:       string;
  pressEnter?:  boolean;
  fields?:      string[];
  query?:       string;
  question?:    string;
  direction?:   "down" | "up";
  amount?:      number;
  placeholder?: string;
  labelText?:   string;
  nearText?:    string;
}

// Result from the canvas after executing a browser action
export interface BrowserResult {
  ok:    boolean;
  data?: unknown;
  error?: string;
}

// -----------------------------------------------------------------------------
// Spatial Intelligence Constants
// -----------------------------------------------------------------------------
export const SWEEP_INCREMENT = 500;

// -----------------------------------------------------------------------------
// WorkflowEvent types
// -----------------------------------------------------------------------------
export type WorkflowEvent =
  | { type: "commander_reading"; progress: string }
  | { type: "manifest_ready";      manifest: Manifest }
  | { type: "step_start";        stepId: string; slave: SlaveId; description: string }
  | { type: "step_complete";     stepId: string; slave: SlaveId; result: unknown }
  | { type: "step_failed";      stepId: string; slave: SlaveId; error: string; retrying: boolean }
  | { type: "slave_thought";    stepId: string; slave: SlaveId; thought: string }
  | { type: "slave_action";     stepId: string; slave: SlaveId; action: string; target?: string }
  | { type: "slave_visual_lock"; stepId: string; slave: SlaveId; elementId: string; text: string; x: number; y: number }
  | { type: "agent_pii_request"; stepId: string; fields: string[]; description: string }
  | { type: "agent_payment";     stepId: string; amount?: number; currency?: string; description: string }
  | { type: "agent_fine_print";  items: string[] }
  | { type: "clarify_request";   stepId: string; question: string }
  | { type: "shopping_plan";    stores: Array<{ name: string; url: string }>; query: string }
  | { type: "workflow_failed";   error: string }
  | { type: "data_extracted";   fields: Record<string, unknown> };

// ── Content shredder ──────────────────────────────────────────────────────────

const FINE_PRINT_RE = /\bT&C\b|terms and conditions|privacy policy|disclaimer|must be \d+|subject to|additional fee|auto-renew|cancel anytime|\bAPR\b|not (available|valid) in/gi;

function _attr(attrs: string, name: string) { return attrs.match(new RegExp(`${name}="([^"]*)"`, "i"))?.[1]?.trim() ?? ""; }
function _inner(html: string) { return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(); }

export function shredToSections(html: string): PageSections {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "").replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "").replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  const interactive: string[] = [];
  s = s.replace(/<button([^>]*)>([\s\S]*?)<\/button>/gi, (_, a, b) => {
    const t = _inner(b); const ar = _attr(a, "aria-label"); const l = t || ar;
    if (l) interactive.push(`[BTN "${l}"${ar && ar !== t ? ` aria="${ar}"` : ""}]`);
    return "";
  }).replace(/<(?:div|span|a)([^>]*)\brole="button"([^>]*)>([\s\S]*?)<\/(?:div|span|a)>/gi, (_, p, q, b) => {
    const t = _inner(b); const ar = _attr(p+q, "aria-label");
    if (t || ar) interactive.push(`[BTN "${t || ar}" role="button"]`);
    return "";
  }).replace(/<a([^>]*)>([\s\S]*?)<\/a>/gi, (_, a, b) => {
    const t = _inner(b); const h = _attr(a, "href"); const ar = _attr(a, "aria-label");
    if (t || ar) interactive.push(`[LINK "${t||ar}"${h && !h.startsWith("javascript") ? ` href="${h}"` : ""}]`);
    return "";
  }).replace(/<input([^>]*)>/gi, (_, a) => {
    const t = _attr(a, "type") || "text";
    if (["hidden","submit","button","image"].includes(t)) return "";
    const parts = [`type="${t}"`];
    const ar = _attr(a, "aria-label"); const ph = _attr(a, "placeholder"); const nm = _attr(a, "name");
    if (ar) parts.push(`aria="${ar}"`); if (ph) parts.push(`placeholder="${ph}"`); if (nm) parts.push(`name="${nm}"`);
    interactive.push(`[INPUT ${parts.join(" ")}]`);
    return "";
  }).replace(/<textarea([^>]*)>[\s\S]*?<\/textarea>/gi, (_, a) => {
    const ar = _attr(a, "aria-label"); const ph = _attr(a, "placeholder");
    interactive.push(`[INPUT type="textarea"${ar ? ` aria="${ar}"` : ""}${ph ? ` placeholder="${ph}"` : ""}]`);
    return "";
  });

  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n").replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n")
       .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n").replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "• $1\n")
       .replace(/<\/?(p|div|section|article|main)[^>]*>/gi, "\n").replace(/<[^>]+>/g, "")
       .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&nbsp;/g," ")
       .replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim();

  const lines = s.split("\n"); const primary: string[] = []; const contextual: string[] = []; const fp: string[] = [];
  for (const l of lines) {
    if (!l.trim()) continue;
    if (FINE_PRINT_RE.test(l)) { fp.push(l); continue; }
    if (l.length < 100) primary.push(l); else contextual.push(l);
  }
  return { primary: primary.join("\n").slice(0,2000), contextual: contextual.join("\n").slice(0,3000),
           finePrint: fp.join("\n").slice(0,1000), interactive: interactive.join("\n").slice(0,2000) };
}

export function shredToMarkdown(html: string): string {
  const s = shredToSections(html);
  return [s.primary && `## Primary\n${s.primary}`, s.interactive && `## Interactive\n${s.interactive}`,
          s.contextual && `## Content\n${s.contextual}`, s.finePrint && `## Fine Print\n${s.finePrint}`]
    .filter(Boolean).join("\n\n");
}

// ── Shopping store catalog ────────────────────────────────────────────────────
// Returns the most relevant stores for a product query, categorised by type.
function getShoppingStores(query: string): Array<{ name: string; key: string; url: string; aria: string }> {
  const q = query.toLowerCase();
  const isShoes    = /\b(shoe|sneaker|boot|jordan|yeezy|air\s*force|trainer|cleat|adidas|reebok|puma|converse|vans|new\s*balance|footwear)\b/.test(q);
  const isTech     = /\b(laptop|macbook|iphone|android|phone|tablet|ipad|airpod|headphone|speaker|monitor|tv|console|ps5|xbox|gpu|cpu|keyboard|mouse|camera)\b/.test(q);
  const isClothing = /\b(shirt|dress|jacket|pants|hoodie|sweater|coat|jeans|outfit|clothing|apparel|fashion)\b/.test(q);

  if (isShoes) return [
    { name: "Nike",        key: "nike",       url: "https://www.nike.com",       aria: "Search" },
    { name: "Adidas",      key: "adidas",     url: "https://www.adidas.com",     aria: "Search" },
    { name: "Foot Locker", key: "footlocker", url: "https://www.footlocker.com", aria: "Search" },
    { name: "StockX",      key: "stockx",     url: "https://stockx.com",        aria: "Search" },
    { name: "Amazon",      key: "amazon",     url: "https://www.amazon.com",     aria: "Search Amazon" },
  ];
  if (isTech) return [
    { name: "Amazon",   key: "amazon",  url: "https://www.amazon.com",       aria: "Search Amazon" },
    { name: "Best Buy", key: "bestbuy", url: "https://www.bestbuy.com",      aria: "Search" },
    { name: "Newegg",   key: "newegg",  url: "https://www.newegg.com",      aria: "Search" },
    { name: "B&H",      key: "bhphoto", url: "https://www.bhphotovideo.com", aria: "Search" },
    { name: "Walmart",  key: "walmart", url: "https://www.walmart.com",     aria: "Search" },
  ];
  if (isClothing) return [
    { name: "ASOS",      key: "asos",      url: "https://www.asos.com",      aria: "Search" },
    { name: "Nordstrom", key: "nordstrom", url: "https://www.nordstrom.com", aria: "Search" },
    { name: "H&M",       key: "hm",        url: "https://www2.hm.com",      aria: "Search" },
    { name: "Zara",      key: "zara",      url: "https://www.zara.com",     aria: "Search" },
    { name: "Amazon",    key: "amazon",    url: "https://www.amazon.com",   aria: "Search Amazon" },
  ];
  return [
    { name: "Amazon",  key: "amazon",  url: "https://www.amazon.com",  aria: "Search Amazon" },
    { name: "Walmart", key: "walmart", url: "https://www.walmart.com", aria: "Search" },
    { name: "Target",  key: "target",  url: "https://www.target.com",  aria: "Search" },
    { name: "eBay",    key: "ebay",    url: "https://www.ebay.com",    aria: "Search" },
    { name: "Google",  key: "google",  url: "https://www.google.com",  aria: "Search" },
  ];
}

// ── Semantic action helpers ───────────────────────────────────────────────────

interface SearchResult  { title: string; url: string; snippet?: string; }
interface PricingTier   { name: string; price: string; period: string; }

// Parse JINA_SEARCH formatted output back into structured objects.
// JINA format: "Title: …\nURL: …\nSnippet: …\n\n---\n\n"
function _parseJinaResults(text: string): SearchResult[] {
  return text.split(/\n\n---\n\n/)
    .map(block => {
      const title   = block.match(/^Title:\s*(.+)/m)?.[1]?.trim()   ?? "";
      const url     = block.match(/^URL:\s*(https?:\/\/\S+)/m)?.[1]?.trim() ?? "";
      const snippet = block.match(/^Snippet:\s*(.+)/m)?.[1]?.trim() ?? "";
      return { title, url, snippet };
    })
    .filter(r => r.url.startsWith("http"))
    .slice(0, 10);
}

// Parse Google/Bing/etc. result links — strip navigation UI, keep real results
function _parseSearchResults(
  links: { text: string; href: string }[],
  _text: string,
  _query: string,
): SearchResult[] {
  return links
    .filter(l => {
      if (!l.href || !l.text || l.text.length < 5) return false;
      if (/^javascript:|^#/.test(l.href)) return false;
      // Strip Google chrome links but keep actual results
      if (/google\.com\/(search|maps|images|shopping|news|videos|finance|books|flights|intl|preferences|accounts|support|webhp|url|\?)/
          .test(l.href)) return false;
      return true;
    })
    .map(l => ({ title: l.text.slice(0, 120), url: l.href }))
    .slice(0, 10);
}

// Extract price/plan tiers from free-form page text
function _parsePricing(text: string): PricingTier[] {
  const tiers: PricingTier[] = [];
  if (/\bfree\s*(plan|tier|forever|always)?\b/i.test(text)) {
    tiers.push({ name: "Free", price: "$0", period: "month" });
  }
  const re = /(?:([\w\s]{2,20})\s+(?:plan|tier)\s+)?(\$|£|€)(\d+(?:[.,]\d+)?)\s*(?:\/|per\s*)?(month|mo|year|yr|annual|week|day)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && tiers.length < 6) {
    const period = (m[4] ?? "month").toLowerCase();
    tiers.push({
      name:   m[1]?.trim() || `${m[2]}${m[3]}`,
      price:  `${m[2]}${m[3].replace(",", ".")}`,
      period: /^yr|ann/.test(period) ? "year" : /^wk/.test(period) ? "week" : /^day/.test(period) ? "day" : "month",
    });
  }
  // Deduplicate by price+period
  return tiers.filter((t, i, a) => a.findIndex(x => x.price === t.price && x.period === t.period) === i);
}

// ── Commander prompt ──────────────────────────────────────────────────────────

const COMMANDER_SYSTEM = `You are the Commander — a precision browser automation orchestrator.
You receive a user goal and the current page broken into sections. Produce a Manifest JSON.

CRITICAL — CAMPAIGN CONTEXT TAGS:
If the input contains [GOAL], [SUCCESS CRITERIA], [CONSTRAINTS], [PREVIOUS RESULTS], or [CURRENT TASK] tags:
- The text after [CURRENT TASK] is the ONLY thing to execute.
- All other tags are background context for your reasoning — use them to make smart decisions.
- NEVER put tag text ([GOAL]..., [CONSTRAINTS]..., etc.) into any "value", "query", or "url" field.
- The "value" in a type step must be clean search keywords ONLY — no brackets, no tags, no sentences.

WORKERS: Slave 1 (navigate/click/scroll) · Slave 2 (extract/search/analyze) · Slave 3 (type/pii_collect)

SEMANTIC ACTIONS — USE THESE INSTEAD OF RAW navigate+type WHENEVER POSSIBLE:
  research        — BEST for research tasks. Searches Bing/DDG/Yahoo, reads each result page, synthesizes findings.
                    Returns {sources:[{title,url,snippet}], synthesis, sourceCount}.
                    USE THIS for: "research X", "compare X vs Y", "find top 10 X", "summarise pricing of X", "what are the best X".
                    USE THIS for: stock/availability checks ("is X in stock", "back in stock", "available at") — set query to include site names.
                    NEVER use search_web + extract for research — use research directly. Params: query (required), maxPages (optional, default 5).
  search_web      — Quick search returning a list of links. Use only when you need URLs to visit next, not for research.
                    Params: query (required), url (optional engine, default google).
  open_site       — Navigate to a specific URL, verify it loaded. Params: url (required).
  extract_pricing — Extract pricing tiers from current page or a given URL. Params: url (optional).
  summarize_page  — Summarize a specific page. Returns {summary,keyPoints,wordCount}. Params: url (optional).

MANIFEST FORMAT — return ONLY valid JSON:
{"steps":[{"id":"s1","type":"research|search_web|open_site|extract_pricing|summarize_page|navigate|click|click_coords|scroll|extract|search|analyze|type|pii_collect|clarify|wait","slave":2,"description":"one sentence","target":{"text":"exact label","ariaLabel":"aria value","selector":"[attr] only"},"url":"https://...","value":"text to type","pressEnter":true,"fields":["f1"],"query":"search query","question":"clarification or analysis question","direction":"down","maxAttempts":2,"maxPages":5}],"reasoning":"one sentence"}

═══ STEP 0 — DESTINATION STRATEGY (resolve this BEFORE generating any steps) ═══

Classify the goal into one of four types:

A. PRICE / DEAL / SHOPPING ("best deal", "cheapest", "compare prices", "buy X"):
   → NEVER default to Amazon alone.
   → Use Google or Google Shopping to surface multiple retailers and real prices.
   → Multi-retailer plans (Amazon + brand site + others) are valid for advanced tasks.

B. BRAND-INTENT ("nike official shoes", "apple macbook pro", "samsung official"):
   → Navigate directly to the brand's official site first.

C. GENERIC RESEARCH / INFO ("what is X", "latest Y news", "how to Z"):
   → Use Google.

D. AMBIGUOUS — no site specified AND multiple valid destinations exist:
   → Return ONE clarify step before any navigation:
     {"type":"clarify","slave":2,"id":"s1","description":"Ask user where to search",
      "question":"Where should I search? (e.g. Google Shopping, Amazon, brand site)"}
   → Do NOT guess. Do NOT default to any single retailer.

═══ EXECUTION RULES ═══
0. SEMANTIC ACTION PRIORITY:
   research → use for ANY task asking to "research", "compare", "find top N", "summarise pricing/features" — ONE step replaces the entire search+read+extract chain.
   open_site → use instead of bare navigate when visiting a specific page.
   search_web → use only when you need a list of URLs for subsequent steps.
   extract_pricing / summarize_page → use on a specific known URL, not after a search.
   Slave assignment: research→slave:2, search_web→slave:2, open_site→slave:1, extract_pricing→slave:2, summarize_page→slave:2.
1. Explicit URL in goal → first step MUST use open_site for that URL. NEVER search instead.
2. SEARCHING = type step (slave 3) only. NEVER use a click step to "search".
3. Site search ariaLabels: Google="Search", YouTube="Search", Amazon="Search Amazon", Twitter="Search query", LinkedIn="Search".
4. For ANY search: {"type":"type","slave":3,"target":{"ariaLabel":"<site label>"},"value":"<keywords only>","pressEnter":true}
5. pii_collect for name/email/phone — do NOT use type for PII.
6. 2-4 steps max. If already on the target URL, skip the navigate step.
7. pressEnter:true for search/submit. pressEnter:false for form fields (username/password/email).
8. QUERY EXTRACTION — CRITICAL: Both "value" AND "query" fields must be ONLY the search keywords. Strip all instruction words.
   "search for lofi beats and play the first one"                        → value/query: "lofi beats"
   "find nike shoes under $100 on Amazon"                                → value/query: "nike shoes under $100"
   "find all remote React jobs posted in the last 7 days list the top 10"→ query: "remote React jobs last 7 days"
   "research top 10 AI coding assistants and summarise their pricing"    → query: "AI coding assistants pricing comparison"
   "check if PS5 Pro is back in stock at major US retailers"             → query: "PS5 Pro in stock bestbuy amazon walmart target"
   NEVER include: find, list, show, give me, check if, research, all, top 10, and summarise, posted in the last
9. Post-search action → add a separate click step AFTER the type step.
   First result: {"type":"click","slave":1,"target":{"selector":"a#video-title"}}
   Most liked:   {"type":"click","slave":1,"target":{"text":"","ariaLabel":"video"}}
10. NEVER default to Amazon for shopping queries. NEVER skip destination reasoning.`;


// ── Spatial map types & functions ─────────────────────────────────────────────

export interface ScannedElement {
  id: string; kind: "button"|"input"|"link"|"text"; tag: string;
  text: string; hint: string; inputType: string; href: string;
  coords: { x: number; y: number; w: number; h: number };
  inView: boolean; isFinePrint: boolean;
}
export interface TextBlock { id: string; kind: "text"; text: string; coords: { x:number; y:number; w:number; h:number }; fontSize: number; isFinePrint: boolean; }
export interface ScanResult { url: string; title: string; viewport: { w:number; h:number }; scrollY: number; elements: ScannedElement[]; textBlocks?: TextBlock[]; finePrint: string[]; scannedAt: number; }

const GATEWAY_RE = /sign.?up|get.?started|create.?account|join|register|start.?free|try.?free|begin|continue|next step/i;

function scanToMarkdown(scan: ScanResult): string {
  return scan.elements.slice(0, 60).map(el => {
    const label = el.text || el.hint || `[${el.tag}]`;
    const hint  = el.hint && el.hint !== label ? ` (${el.hint})` : "";
    return `${el.id} ${el.inView ? "✓" : "↓"} [${el.kind}] "${label}"${hint} @(${el.coords.x},${el.coords.y})`;
  }).join("\n");
}

export interface VisualHint { hint: string; text?: string; ariaLabel?: string; nearText?: string; }

export async function getCommanderVisualHint(description: string, sections: PageSections): Promise<VisualHint> {
  if (!sections.interactive || sections.interactive.length < 20) return { hint: "No interactive elements" };
  try {
    const { text } = await kimiComplete(
      `You are a precise element locator. A click failed. Look at the buttons/links listed and identify the correct one.\nReply ONLY with JSON: {"hint":"where it is","text":"EXACT label from list","ariaLabel":"or empty","nearText":"nearby text"}`,
      [{ role: "user", content: `STEP: ${description}\n\nBUTTONS AND LINKS:\n${sections.interactive}\n\nPAGE:\n${sections.primary.slice(0,600)}` }],
      300,
    );
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { hint: "No JSON" };
    const p = JSON.parse(m[0]) as VisualHint;
    if (/^(primary|interactive|contextual|content|fine.?print)$/i.test((p.nearText ?? "").trim())) p.nearText = undefined;
    return p;
  } catch { return { hint: "unavailable" }; }
}

export async function handleNavigation(goal: string, scan: ScanResult, emit: (ev: WorkflowEvent) => void, stepId: string):
    Promise<{ coords: { x: number; y: number } | null; elementId: string | null; text: string; scrollProbe: boolean }> {
  const visible = scan.elements.filter(e => e.inView && e.kind === "button" && GATEWAY_RE.test(e.text + " " + e.hint));
  const below   = scan.elements.filter(e => !e.inView);
  const SYSTEM  = `You are a precision targeting system. Spatial map: id [kind] "text" (hint) @(cx,cy) ✓=inView ↓=below\n\nReply EXACTLY one of:\nEXECUTE: CLICK(el_ID)\nEXECUTE: FOCUS(el_ID)\nSCROLL_PROBE: reason`;
  const note = visible.length > 0 ? `\nGATEWAY VISIBLE: ${visible.map(e=>`${e.id} "${e.text}"`).join(", ")}` : below.length > 0 ? `\nNO GATEWAY IN VIEW — ${below.length} elements below fold` : "";
  try {
    const { text } = await kimiComplete(SYSTEM, [{ role: "user", content: `GOAL: ${goal}\nPAGE: ${scan.title} (${scan.url})${note}\n\nMAP:\n${scanToMarkdown(scan)}` }], 128);
    const clean = text.trim();
    if (/^SCROLL_PROBE/i.test(clean)) {
      emit({ type: "slave_thought", stepId, slave: 1, thought: `Scroll probe: ${clean.replace(/^SCROLL_PROBE:\s*/i,"").slice(0,80)}` });
      return { coords: null, elementId: null, text: "", scrollProbe: true };
    }
    const m = clean.match(/EXECUTE:\s*(?:CLICK|FOCUS)\(([^\)]+)\)/i);
    if (!m) return { coords: null, elementId: null, text: "", scrollProbe: false };
    const el = scan.elements.find(e => e.id === m[1].trim());
    if (!el) return { coords: null, elementId: null, text: "", scrollProbe: false };
    emit({ type: "slave_visual_lock", stepId, slave: 1, elementId: el.id, text: el.text || el.hint, x: el.coords.x, y: el.coords.y } as any);
    return { coords: { x: el.coords.x, y: el.coords.y }, elementId: el.id, text: el.text || el.hint, scrollProbe: false };
  } catch { return { coords: null, elementId: null, text: "", scrollProbe: false }; }
}

// -----------------------------------------------------------------------------
// WorkflowEngine class
// -----------------------------------------------------------------------------
export class WorkflowEngine {
  private manifest:  Manifest | null = null;
  private aborted = false;
  private emit: (ev: WorkflowEvent) => void;

  constructor(onEvent: (ev: WorkflowEvent) => void) {
    this.emit = onEvent;
  }

  // ── Phase 1: Kimi reads the page and produces a step-by-step Manifest ──────────
  async plan(goal: string, pageHtml: string, pageUrl: string, pageTitle: string): Promise<Manifest> {
    this.emit({ type: "commander_reading", progress: "Analysing page…" });

    // ── Goal-context extraction ───────────────────────────────────────────────
    // GoalPanel enriches tasks with [GOAL], [CONSTRAINTS], [CURRENT TASK] tags.
    // Split them so the Commander only executes [CURRENT TASK] and uses the rest
    // as background — never as the search query typed into a browser field.
    const CURRENT_TASK_RE = /\[CURRENT TASK\]\s*([\s\S]+)$/;
    const ctMatch = goal.match(CURRENT_TASK_RE);
    const currentTask = ctMatch ? ctMatch[1].trim() : goal;
    const goalContext = ctMatch
      ? goal.slice(0, goal.indexOf("[CURRENT TASK]")).trim()
      : "";

    // ── Intent classification (single authority) ──────────────────────────────
    // classifyIntent wraps normalizeTask and adds domain + traceId.
    const intent = classifyIntent(currentTask);
    const norm   = intent; // alias — downstream code reads .intent/.query/.strategy etc.

    const sections = shredToSections(pageHtml || "<html></html>");

    // Commander receives the clean entity, not the raw conversational sentence
    const executionGoal = (norm.intent === "search" || norm.intent === "shopping")
      ? norm.query
      : currentTask;

    const userContent = [
      `Goal: ${executionGoal}`,
      // Provide goal campaign context as background — Commander uses it for
      // constraint checking and strategy, but must NEVER type it into a field.
      goalContext ? `\nCampaign context (background only — do NOT search for this):\n${goalContext}` : "",
      norm.destination ? `Target site: ${norm.destination}` : "",
      norm.strategy    ? `Strategy: ${norm.strategy}`       : "",
      pageUrl   ? `URL: ${pageUrl}`     : "",
      pageTitle ? `Title: ${pageTitle}` : "",
      sections.primary     ? `\n## Primary\n${sections.primary}`         : "",
      sections.interactive ? `\n## Interactive\n${sections.interactive}` : "",
      sections.finePrint   ? `\n## Fine Print\n${sections.finePrint}`    : "",
    ].filter(Boolean).join("\n");

    let steps: ManifestStep[] = [];
    let reasoning = "";

    const parseSteps = (text: string): ManifestStep[] => {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return [];
      const parsed = JSON.parse(m[0]);
      reasoning = parsed.reasoning ?? "";
      const raw: ManifestStep[] = ((parsed.steps ?? []) as any[]).map((s: any, i: number): ManifestStep => ({
        id:          s.id          ?? `s${i + 1}`,
        type:        s.type        ?? "click",
        slave:       ([1, 2, 3].includes(s.slave) ? s.slave : 1) as SlaveId,
        description: s.description ?? `Step ${i + 1}`,
        target:      s.target,
        url:         s.url,
        value:       (s.type === "type" && s.value) ? (classifyIntent(s.value).query || s.value) : s.value,
        query:       s.query,
        fields:      s.fields,
        question:    s.question,
        direction:   s.direction ?? "down",
        status:      "pending",
        attempts:    0,
        maxAttempts: s.maxAttempts ?? 3,
        pressEnter:  s.pressEnter ?? (s.type === "type" ? true : undefined),
      }));

      // ── Enforce semantic actions regardless of what the LLM output ────────────
      // Convert any navigate→type(pressEnter) pair into a single search_web step.
      // This ensures Enter reliability even when Kimi ignores the prompt.
      return _collapseSearchPairs(raw);
    };

    // Collapse navigate + type(pressEnter) → search_web
    function _collapseSearchPairs(steps: ManifestStep[]): ManifestStep[] {
      const out: ManifestStep[] = [];
      let i = 0;
      while (i < steps.length) {
        const cur  = steps[i];
        const next = steps[i + 1];
        const isNavTypeSearch =
          cur.type  === "navigate" &&
          next?.type === "type" &&
          next.pressEnter !== false &&
          cur.url;
        if (isNavTypeSearch) {
          out.push({
            ...next,
            id:          cur.id,
            type:        "search_web" as StepType,
            slave:       2 as SlaveId,
            description: `Search "${next.value ?? next.query}" on ${cur.url}`,
            query:       next.value ?? next.query ?? "",
            url:         cur.url,
            value:       undefined,
            target:      undefined,
            pressEnter:  undefined,
          });
          i += 2; // consumed both steps
        } else {
          out.push(cur);
          i++;
        }
      }
      return out;
    }

    const goalLower = currentTask.toLowerCase();

    // ── Research / job-search shortcut — bypass Commander entirely ────────────────
    // These domains are deterministic: one `research` step, no Kimi planning needed.
    // Commander is unreliable for these — it keeps generating search+extract chains
    // that produce no results instead of using the research semantic action.
    const RESEARCH_DOMAINS = new Set(["research", "job_search"]);
    if (RESEARCH_DOMAINS.has(intent.domain) && norm.intent === "task") {
      const resQuery = norm.query || currentTask;
      steps = [{
        id: "s1", type: "research" as StepType, slave: 2 as SlaveId,
        description: `Research: ${resQuery}`,
        query: resQuery,
        status: "pending", attempts: 0, maxAttempts: 2,
      }];
      reasoning = `research("${resQuery}")`;
    }

    // ── Shopping mode — multi-store tour via search_web semantic action ─────────
    // Previously: generated raw navigate+type steps (bypassed semantic layer).
    // Now: each store becomes ONE search_web step — Enter reliability included.
    if (norm.intent === "shopping" && norm.strategy === "comparison") {
      const stores = getShoppingStores(norm.query);
      this.emit({ type: "shopping_plan",
        stores: stores.map(s => ({ name: s.name, url: s.url })),
        query: norm.query,
      });
      stores.forEach((store, i) => {
        steps.push({
          id: `s${i + 1}`, type: "search_web" as StepType, slave: 2 as SlaveId,
          description: `Search "${norm.query}" on ${store.name}`,
          query: norm.query,
          url: store.url,
          status: "pending", attempts: 0, maxAttempts: 2,
        });
      });
      reasoning = `Shopping tour via search_web: ${stores.map(s => s.name).join(", ")} — "${norm.query}"`;
    }

    // ── Single-site search — search_web semantic action ───────────────────────
    // Previously: generated raw navigate+type steps.
    // Now: ONE search_web step (navigate + type + Enter + verify internalized).
    if (steps.length === 0 && (norm.intent === "search" || (norm.intent === "shopping" && norm.strategy === "single"))) {
      const KNOWN_SITES: { key: string; url: string; topResultSel?: string }[] = [
        { key: "youtube",  url: "https://www.youtube.com",  topResultSel: "a#video-title" },
        { key: "amazon",   url: "https://www.amazon.com",   topResultSel: "a.s-underline-link-text" },
        { key: "google",   url: "https://www.google.com",   topResultSel: "h3" },
        { key: "linkedin", url: "https://www.linkedin.com", topResultSel: ".entity-result__title-text a" },
        { key: "twitter",  url: "https://twitter.com" },
        { key: "x.com",    url: "https://x.com" },
        { key: "reddit",   url: "https://www.reddit.com" },
        { key: "ebay",     url: "https://www.ebay.com" },
        { key: "walmart",  url: "https://www.walmart.com" },
      ];
      const GOOGLE = { key: "google", url: "https://www.google.com", topResultSel: "h3" };
      const site = KNOWN_SITES.find(s =>
        (norm.destination && s.key === norm.destination) ||
        goalLower.includes(s.key) || pageUrl.includes(s.key)
      ) ?? GOOGLE;

      const searchStep: ManifestStep = {
        id: "s1", type: "search_web" as StepType, slave: 2 as SlaveId,
        description: `Search "${norm.query}" on ${site.key}`,
        query: norm.query, url: site.url,
        status: "pending", attempts: 0, maxAttempts: 3,
      };
      const clickStep: ManifestStep | null = norm.postAction && site.topResultSel ? {
        id: "s2", type: "click" as StepType, slave: 1 as SlaveId,
        description: "Click top search result",
        target: { selector: site.topResultSel },
        status: "pending", attempts: 0, maxAttempts: 3,
      } : null;

      steps = clickStep ? [searchStep, clickStep] : [searchStep];
      reasoning = `search_web on ${site.key}: "${norm.query}"${clickStep ? " → click top result" : ""}`;
    }

    // Try Commander for non-search tasks (or if search shortcut produced no steps)
    for (let attempt = 0; attempt < 2 && steps.length === 0; attempt++) {
      try {
        const { text } = await kimiComplete(buildIdentity() + "\n\n" + COMMANDER_SYSTEM, [{ role: "user", content: userContent }], 2048);
        steps = parseSteps(text);
      } catch { /* retry */ }
    }

    // Fallback — single search_web step (no raw navigate+type)
    if (steps.length === 0) {
      if (norm.intent !== "task" || norm.query !== currentTask) {
        reasoning = "Smart fallback: search_web";
        steps = [{
          id: "s1", type: "search_web" as StepType, slave: 2 as SlaveId,
          description: `Search "${norm.query}"`,
          query: norm.query, url: "https://www.google.com",
          status: "pending", attempts: 0, maxAttempts: 3,
        }];
      } else {
        reasoning = "Fallback: extract page";
        steps = [{ id: "s1", type: "extract" as StepType, slave: 2 as SlaveId, description: "Read page",
          fields: ["title", "url"], status: "pending", attempts: 0, maxAttempts: 2 }];
      }
    }

    this.manifest = {
      id: `wf_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      goal, pageUrl, pageTitle, steps,
      createdAt: Date.now(), updatedAt: Date.now(),
      status: "pending", extractedData: {}, commanderReasoning: reasoning,
    };

    this.emit({ type: "manifest_ready", manifest: this.manifest } as any);
    return this.manifest;
  }

  // ── Phase 2: Execute one step via its assigned Slave ─────────────────────────
  async executeStep(step: ManifestStep, runBrowser: (a: BrowserAction) => Promise<BrowserResult>): Promise<boolean> {
    if (this.aborted) return false;

    step.status    = "active";
    step.attempts += 1;
    this.emit({ type: "step_start", stepId: step.id, slave: step.slave, description: step.description });

    // Server-side steps (no browser round-trip)
    if (step.type === "search") {
      const result = await JINA_SEARCH(step.query ?? step.description);
      step.status = "complete"; step.result = result;
      Object.assign(this.manifest!.extractedData, { search_results: result });
      this.emit({ type: "data_extracted", fields: { search_results: result } });
      this.emit({ type: "step_complete", stepId: step.id, slave: step.slave, result });
      return true;
    }

    if (step.type === "analyze") {
      const { text } = await nvidiaComplete(
        "Answer the question based on provided content. Be concise.",
        [{ role: "user", content: `${step.question ?? step.description}\n\nContext: (available in extracted data)` }],
        512,
      );
      step.status = "complete"; step.result = text;
      this.emit({ type: "step_complete", stepId: step.id, slave: step.slave, result: text });
      return true;
    }

    if (step.type === "pii_collect") {
      this.emit({ type: "agent_pii_request", stepId: step.id, fields: step.fields ?? [], description: step.description });
      step.status = "complete";
      this.emit({ type: "step_complete", stepId: step.id, slave: step.slave, result: "PII collected" });
      return true;
    }

    if (step.type === "payment") {
      this.emit({ type: "agent_payment", stepId: step.id, description: step.description });
      step.status = "complete";
      this.emit({ type: "step_complete", stepId: step.id, slave: step.slave, result: "Payment handled" });
      return true;
    }

    if (step.type === "clarify") {
      this.emit({ type: "clarify_request", stepId: step.id, question: step.question ?? step.description });
      step.status = "complete";
      this.emit({ type: "step_complete", stepId: step.id, slave: step.slave, result: "Clarification requested" });
      return true;
    }

    // ── Semantic actions ──────────────────────────────────────────────────────
    // Each one composes multiple runBrowser() calls, verifies success, retries.

    if (step.type === "search_web") {
      const query  = step.query ?? step.value ?? step.description;
      const engine = step.url   ?? "https://www.google.com";

      this.emit({ type: "slave_action", stepId: step.id, slave: step.slave,
        action: "search_web", target: query });

      // Primary: JINA server-side search (Bing → DDG → Yahoo cascade).
      // Faster, no bot detection, returns snippets, and works without a running browser.
      // Only falls back to browser CDP for site-specific searches (Amazon, YouTube, etc.)
      // where JINA would miss dynamic content or require on-site filtering.
      const isGenericSearch = /google\.com|duckduckgo|bing\.com/.test(engine) || engine === "https://www.google.com";
      if (isGenericSearch) {
        try {
          const jinaRaw = await JINA_SEARCH(query);
          if (jinaRaw && !jinaRaw.startsWith("No results")) {
            const results = _parseJinaResults(jinaRaw);
            if (results.length >= 2) {
              const data = { query, engine: "jina", results, resultCount: results.length };
              step.status = "complete"; step.result = data;
              Object.assign(this.manifest!.extractedData, { search_results: data });
              this.emit({ type: "data_extracted", fields: { search_results: data } });
              this.emit({ type: "step_complete", stepId: step.id, slave: step.slave, result: data });
              return true;
            }
          }
        } catch { /* fall through to browser CDP */ }
      }

      // Fallback: browser CDP (site-specific or JINA failed)
      const ariaLabel = engine.includes("amazon") ? "Search Amazon" :
                        engine.includes("youtube") ? "Search" : "Search";

      const navR = await runBrowser({ type: "navigate", slave: 1, target: { url: engine } });
      if (!navR.ok) {
        step.status = step.attempts < step.maxAttempts ? "pending" : "failed";
        this.emit({ type: "step_failed", stepId: step.id, slave: step.slave,
          error: navR.error ?? "Navigate failed", retrying: step.status === "pending" });
        return false;
      }

      await runBrowser({ type: "type", slave: 3,
        target: { ariaLabel }, value: query, pressEnter: true });

      await new Promise(r => setTimeout(r, 1_200));
      let extractR = await runBrowser({ type: "extract", slave: 2, fields: ["title", "url", "text", "links"] });
      let page = (extractR.data ?? {}) as Record<string, unknown>;

      if (!Array.isArray(page.links) || (page.links as unknown[]).length < 3) {
        await new Promise(r => setTimeout(r, 2_000));
        extractR = await runBrowser({ type: "extract", slave: 2, fields: ["title", "url", "text", "links"] });
        page = (extractR.data ?? {}) as Record<string, unknown>;
      }

      const results = _parseSearchResults(
        (page.links as { text: string; href: string }[]) ?? [],
        (page.text  as string) ?? "",
        query,
      );

      const data = { query, engine: (page.url as string) ?? engine, results, resultCount: results.length };
      step.status = "complete"; step.result = data;
      Object.assign(this.manifest!.extractedData, { search_results: data });
      this.emit({ type: "data_extracted", fields: { search_results: data } });
      this.emit({ type: "step_complete", stepId: step.id, slave: step.slave, result: data });
      return true;
    }

    if (step.type === "open_site") {
      const url = step.url ?? (step.target as any)?.url ?? "";
      if (!url) {
        step.status = "failed";
        this.emit({ type: "step_failed", stepId: step.id, slave: step.slave,
          error: "open_site requires a url", retrying: false });
        return false;
      }
      this.emit({ type: "slave_action", stepId: step.id, slave: step.slave,
        action: "open_site", target: url });

      const navR = await runBrowser({ type: "navigate", slave: 1, target: { url } });
      if (!navR.ok) {
        step.status = step.attempts < step.maxAttempts ? "pending" : "failed";
        this.emit({ type: "step_failed", stepId: step.id, slave: step.slave,
          error: navR.error ?? "Navigate failed", retrying: step.status === "pending" });
        return false;
      }

      // Verify page isn't an error screen
      const verR = await runBrowser({ type: "extract", slave: 2, fields: ["title", "url"] });
      const vp   = (verR.data ?? {}) as Record<string, unknown>;
      const isErr = /\b(404|403|500|not found|forbidden|blocked|unavailable)\b/i.test(
        (vp.title as string) ?? "");

      if (isErr) {
        step.status = step.attempts < step.maxAttempts ? "pending" : "failed";
        this.emit({ type: "step_failed", stepId: step.id, slave: step.slave,
          error: `Page error: ${vp.title}`, retrying: step.status === "pending" });
        return false;
      }

      const data = { url: (vp.url as string) ?? url, title: (vp.title as string) ?? "", status: "ready" };
      step.status = "complete"; step.result = data;
      Object.assign(this.manifest!.extractedData, { current_page: data });
      this.emit({ type: "step_complete", stepId: step.id, slave: step.slave, result: data });
      return true;
    }

    if (step.type === "extract_pricing") {
      if (step.url) {
        const navR = await runBrowser({ type: "navigate", slave: 1, target: { url: step.url } });
        if (!navR.ok) {
          step.status = step.attempts < step.maxAttempts ? "pending" : "failed";
          this.emit({ type: "step_failed", stepId: step.id, slave: step.slave,
            error: navR.error ?? "Navigate failed", retrying: step.status === "pending" });
          return false;
        }
      }
      this.emit({ type: "slave_action", stepId: step.id, slave: step.slave,
        action: "extract_pricing", target: step.url ?? "current page" });

      const extR = await runBrowser({ type: "extract", slave: 2, fields: ["title", "url", "text"] });
      const page = (extR.data ?? {}) as Record<string, unknown>;
      const tiers = _parsePricing((page.text as string) ?? "");

      const data = {
        url:   (page.url   as string) ?? step.url ?? "",
        title: (page.title as string) ?? "",
        tiers,
        raw:   ((page.text as string) ?? "").slice(0, 2_000),
      };
      step.status = "complete"; step.result = data;
      Object.assign(this.manifest!.extractedData, { pricing: data });
      this.emit({ type: "data_extracted", fields: { pricing: data } });
      this.emit({ type: "step_complete", stepId: step.id, slave: step.slave, result: data });
      return true;
    }

    if (step.type === "summarize_page") {
      if (step.url) {
        const navR = await runBrowser({ type: "navigate", slave: 1, target: { url: step.url } });
        if (!navR.ok) {
          step.status = step.attempts < step.maxAttempts ? "pending" : "failed";
          this.emit({ type: "step_failed", stepId: step.id, slave: step.slave,
            error: navR.error ?? "Navigate failed", retrying: step.status === "pending" });
          return false;
        }
      }
      this.emit({ type: "slave_action", stepId: step.id, slave: step.slave,
        action: "summarize_page", target: step.url ?? "current page" });

      const extR  = await runBrowser({ type: "extract", slave: 2, fields: ["title", "url", "text"] });
      const page  = (extR.data ?? {}) as Record<string, unknown>;
      const text  = (page.text as string) ?? "";
      const wc    = text.split(/\s+/).filter(Boolean).length;

      let summary   = "";
      let keyPoints: string[] = [];

      if (text.length > 200) {
        try {
          const { text: kimi } = await kimiComplete(
            `Summarize the page. Return ONLY JSON: {"summary":"2-3 sentence summary","keyPoints":["point 1","point 2","point 3"]}`,
            [{ role: "user", content: `Title: ${page.title}\nURL: ${page.url}\n\n${text.slice(0, 3_000)}` }],
            512,
          );
          const m = kimi.match(/\{[\s\S]*\}/);
          if (m) { const p = JSON.parse(m[0]); summary = p.summary ?? ""; keyPoints = p.keyPoints ?? []; }
        } catch {
          summary = text.split(/[.!?]+/).filter(Boolean).slice(0, 3).join(". ").trim();
        }
      } else {
        summary = text.slice(0, 500);
      }

      const data = {
        url:       (page.url   as string) ?? step.url ?? "",
        title:     (page.title as string) ?? "",
        summary, keyPoints, wordCount: wc,
      };
      step.status = "complete"; step.result = data;
      Object.assign(this.manifest!.extractedData, { page_summary: data });
      this.emit({ type: "data_extracted", fields: { page_summary: data } });
      this.emit({ type: "step_complete", stepId: step.id, slave: step.slave, result: data });
      return true;
    }

    if (step.type === "research") {
      // Deep research loop:
      //   1. JINA_SEARCH → structured list of {title, url, snippet}
      //   2. JINA_READ each URL (top N) → full page content
      //   3. Kimi synthesizes all sources into findings
      //
      // This is the correct agent for "research X and summarise pricing/features"
      // because it actually reads the source pages, not just the SERP.
      const query    = step.query ?? step.value ?? step.description;
      const maxPages = (step as any).maxPages ?? 5;

      this.emit({ type: "slave_action", stepId: step.id, slave: step.slave,
        action: "research", target: query });

      // 1 — Get candidate URLs via JINA search
      let candidates: SearchResult[] = [];
      try {
        const raw = await JINA_SEARCH(query);
        candidates = _parseJinaResults(raw);
      } catch { /* proceed with empty list */ }

      if (candidates.length === 0) {
        step.status = step.attempts < step.maxAttempts ? "pending" : "failed";
        this.emit({ type: "step_failed", stepId: step.id, slave: step.slave,
          error: "No search results returned", retrying: step.status === "pending" });
        return false;
      }

      // 2 — Read each source page (parallel, capped at maxPages)
      this.emit({ type: "slave_thought", stepId: step.id, slave: step.slave,
        thought: `Reading ${Math.min(candidates.length, maxPages)} sources…` });

      const sources: Array<{ title: string; url: string; snippet: string; content: string }> = [];
      // Bypass cache for stock/availability queries — data must be live
      const isLiveQuery = /\b(in stock|back in stock|available|restock|availability)\b/i.test(query);

      await Promise.all(
        candidates.slice(0, maxPages).map(async (c) => {
          try {
            const content = await JINA_READ(c.url, isLiveQuery);
            sources.push({ title: c.title, url: c.url, snippet: c.snippet ?? "", content: content.slice(0, 3_000) });
          } catch { /* skip unreachable URLs */ }
        })
      );

      if (sources.length === 0) {
        // All reads failed — return the snippets at least
        sources.push(...candidates.slice(0, maxPages).map(c => ({
          title: c.title, url: c.url, snippet: c.snippet ?? "", content: c.snippet ?? "",
        })));
      }

      // 3 — Kimi synthesizes findings across all sources
      const sourceDocs = sources
        .map(s => `### ${s.title}\nURL: ${s.url}\n\n${s.content || s.snippet}`)
        .join("\n\n---\n\n")
        .slice(0, 8_000);

      let synthesis = "";
      try {
        const { text: kimi } = await kimiComplete(
          `You are a research analyst. Answer the research question using ONLY the provided sources. Be specific: include names, prices, features, and URLs. Format as clear bullet points.`,
          [{ role: "user", content: `Research question: ${query}\n\nSources:\n${sourceDocs}` }],
          1_500,
        );
        synthesis = kimi;
      } catch {
        synthesis = sources.map(s => `• ${s.title}: ${s.snippet}`).join("\n");
      }

      const resData = {
        query,
        sources: sources.map(s => ({ title: s.title, url: s.url, snippet: s.snippet })),
        synthesis,
        sourceCount: sources.length,
      };
      step.status = "complete"; step.result = resData;
      Object.assign(this.manifest!.extractedData, { research: resData });
      this.emit({ type: "data_extracted", fields: { research: resData } });
      this.emit({ type: "step_complete", stepId: step.id, slave: step.slave, result: resData });
      return true;
    }

    // Browser steps — for Slave 1 clicks: run sovereign scan first, Kimi picks target
    const action: BrowserAction = {
      type: step.type, slave: step.slave,
      target: { ...step.target, url: step.url },
      value: step.value,
      pressEnter: step.pressEnter ?? (step.type === "type" ? true : false),
      fields: step.fields, query: step.query, direction: step.direction,
    };

    let result: BrowserResult = { ok: false, error: "not started" };

    if (step.slave === 1 && (step.type === "click" || step.type === "click_coords")) {
      // Sovereign scan → Kimi picks EXECUTE:CLICK(el_id) → ghost cursor
      try {
        // Retry scan up to 3x if 0 elements — page JS may not have rendered yet
        let scanResult = await runBrowser({ type: "extract", slave: 2, fields: ["__sovereign_scan__"] });
        let scan = (scanResult.data as any)?.__sovereign_scan__;
        for (let retries = 0; retries < 3 && scan && (scan.elements?.length ?? 0) === 0; retries++) {
          this.emit({ type: "slave_thought", stepId: step.id, slave: 1, thought: `Page not ready (0 elements) — waiting 2s…` });
          await new Promise(r => setTimeout(r, 2000));
          scanResult = await runBrowser({ type: "extract", slave: 2, fields: ["__sovereign_scan__"] });
          scan = (scanResult.data as any)?.__sovereign_scan__;
        }

        if (scan && (scan.elements?.length ?? 0) > 0) {
          if (scan.finePrint?.length) this.emit({ type: "agent_fine_print", items: scan.finePrint });
          const MAX_PROBES = 5; let probes = 0; let scanData = scan;
          while (probes <= MAX_PROBES) {
            const nav = await handleNavigation(step.description, scanData, this.emit, step.id);
            if (nav.coords) {
              result = await runBrowser({ type: "click_coords", slave: 1, target: { coordinates: nav.coords } });
              break;
            }
            if (nav.scrollProbe && probes < MAX_PROBES) {
              probes++;
              await runBrowser({ type: "scroll", slave: 1, direction: "down" });
              await new Promise(r => setTimeout(r, 800));
              const r2 = await runBrowser({ type: "extract", slave: 2, fields: ["__sovereign_scan__"] });
              const s2 = (r2.data as any)?.__sovereign_scan__;
              if (s2) scanData = s2; else break;
              continue;
            }
            result = await runBrowser(action); break;
          }
        } else {
          // Scan empty or failed — fall back to text/ariaLabel click
          const fallbackAction = {
            ...action,
            target: {
              text:      step.target?.text     || undefined,
              ariaLabel: step.target?.ariaLabel || undefined,
              selector:  step.target?.selector  || undefined,
            },
          };
          if (fallbackAction.target.text || fallbackAction.target.ariaLabel || fallbackAction.target.selector) {
            result = await runBrowser(fallbackAction);
          } else {
            result = { ok: false, error: "Scan returned 0 elements and no fallback target specified" };
          }
        }
      } catch { result = await runBrowser(action); }
    } else {
      this.emit({ type: "slave_action", stepId: step.id, slave: step.slave, action: step.type,
        target: step.target?.text ?? step.target?.ariaLabel ?? step.target?.selector ?? step.url ?? step.description });
      try { result = await runBrowser(action); }
      catch (e: unknown) { result = { ok: false, error: e instanceof Error ? e.message : "Unknown" }; }
    }

    if (result.ok) {
      // ── VerifierAgent: confirm the action actually achieved its intended outcome
      const vr = await verifyStep(step, result, runBrowser);
      if (vr.fatal) {
        // Hard failure (auth wall, 404, CAPTCHA) — abort this step
        step.status = step.attempts < step.maxAttempts ? "pending" : "failed";
        this.emit({ type: "step_failed", stepId: step.id, slave: step.slave,
          error: `Verification: ${vr.evidence}`, retrying: step.status === "pending" });
        return false;
      }

      step.status = "complete"; step.result = result.data;
      if (step.slave === 2 && result.data && typeof result.data === "object") {
        Object.assign(this.manifest!.extractedData, result.data as Record<string, unknown>);
        this.emit({ type: "data_extracted", fields: result.data as Record<string, unknown> });
      }
      this.emit({ type: "step_complete", stepId: step.id, slave: step.slave,
        result: step.result, verified: vr.passed, confidence: vr.confidence, evidence: vr.evidence } as any);
    } else {
      step.status = step.attempts < step.maxAttempts ? "pending" : "failed";
      this.emit({ type: "step_failed", stepId: step.id, slave: step.slave,
        error: result.error ?? "Failed", retrying: step.status === "pending" });
    }

    return result.ok;
  }

  // ── Phase 3: Run all steps, emit workflow_complete when done ─────────────────
  async run(
    _getPageHtml: () => Promise<string>,
    runBrowser:   (a: BrowserAction) => Promise<BrowserResult>,
  ): Promise<Manifest> {
    if (!this.manifest) throw new Error("Call plan() first");
    this.manifest.status = "running";

    for (const step of this.manifest.steps) {
      if (this.aborted) break;
      if (step.status === "complete" || step.status === "skipped") continue;

      // Retry loop — executeStep sets status back to "pending" if attempts remain
      let ok = false;
      while (!this.aborted) {
        ok = await this.executeStep(step, runBrowser);
        if ((step as ManifestStep).status !== "pending") break;
        await new Promise<void>(r => setTimeout(r, 1500));
      }

      if (!ok && step.status === "failed") {
        if (step.type === "navigate") {
          this.manifest.status = "failed";
          this.emit({ type: "workflow_failed", error: `Navigation failed: ${step.description}` });
          return this.manifest;
        }
        step.status = "skipped";
      }
    }

    this.manifest.status = "complete";
    this.manifest.updatedAt = Date.now();

    // ── SynthesizerAgent: merge evidence → structured answer before UI delivery
    const completedCount = this.manifest.steps.filter(s => s.status === "complete").length;
    const synthesis = await synthesizeWorkflow(
      this.manifest.goal,
      this.manifest.extractedData,
      completedCount,
    ).catch(() => ({
      answer: "Task completed.", keyPoints: [], sources: [], confidence: 0.5,
      raw: this.manifest!.extractedData,
    }));

    this.emit({ type: "workflow_complete", manifest: this.manifest,
      data: this.manifest.extractedData, synthesis } as any);
    return this.manifest;
  }

  abort() {
    this.aborted = true;
    if (this.manifest) this.manifest.status = "paused";
  }
}
