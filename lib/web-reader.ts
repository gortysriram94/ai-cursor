// lib/web-reader.ts
// Self-hosted web reader + search — replicates what Jina AI does internally.
//
// JINA_READ   — Fetches any URL, scores content blocks by text density,
//               extracts the main body (like Jina's r.jina.ai reader mode).
// JINA_SEARCH — Queries Bing → DuckDuckGo → Yahoo in sequence until one
//               returns results. No API key. No external dependency.
//
// Drop-in replacement: same export names and signatures as the original
// tools.ts JINA functions, so no callers need to change.

// ── SSRF blocklist ────────────────────────────────────────────────────────────
const BLOCKED_V4 = /^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/i;
const BLOCKED_V6 = /^\[?(::1$|::ffff:|fd[0-9a-f]{2,}:|fe80:)/i;

function isSafeUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (!["http:", "https:"].includes(u.protocol)) return false;
    if (BLOCKED_V4.test(u.hostname) || BLOCKED_V6.test(u.hostname)) return false;
    return true;
  } catch { return false; }
}

// ── Cache ─────────────────────────────────────────────────────────────────────
const CACHE     = new Map<string, { text: string; ts: number }>();
const CACHE_TTL = 5 * 60_000;

function fromCache(key: string): string | null {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.text;
  return null;
}
function toCache(key: string, text: string) {
  CACHE.set(key, { text, ts: Date.now() });
  if (CACHE.size > 200) {
    const now = Date.now();
    for (const [k, v] of CACHE) if (now - v.ts > CACHE_TTL) CACHE.delete(k);
  }
}

// ── HTTP fetch ────────────────────────────────────────────────────────────────
// Rotate User-Agents so consecutive requests look like different browsers.
const UAS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
];
const ua = () => UAS[Math.floor(Math.random() * UAS.length)];

async function get(
  url: string,
  extra: Record<string, string> = {},
  retries = 3,
): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":      ua(),
          "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "identity",
          "Cache-Control":   "no-cache",
          "Upgrade-Insecure-Requests": "1",
          ...extra,
        },
        signal:   AbortSignal.timeout(15_000),
        redirect: "follow",
      });
      if (res.ok) return await res.text();
      if (res.status === 429) {
        await delay(2_000 * (i + 1));
        continue;
      }
      return null;
    } catch {
      if (i < retries - 1) await delay(1_000 * (i + 1));
    }
  }
  return null;
}

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────
// ── PART 1: READER (what r.jina.ai does) ─────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//
// Algorithm:
//   1. Strip known noise elements entirely (scripts, styles, nav, ads…)
//   2. Try semantic containers first (article, main, [role=main])
//   3. If none found, score every <div>/<section> by text density
//      (text length ÷ total HTML length — high ratio = real content)
//   4. Pick the winner, convert its HTML to clean plain text
//   5. Detect JSON responses and return them as-is

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g,  "&")
    .replace(/&lt;/g,   "<")
    .replace(/&gt;/g,   ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g,   (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&[a-z]{2,8};/g, " ");
}

function tagsToNewlines(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|section|article|main|li|h[1-6]|tr|td|th|blockquote|pre)[^>]*>/gi, "\n");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function normaliseWS(s: string): string {
  return s
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlToText(html: string): string {
  return normaliseWS(decodeEntities(stripTags(tagsToNewlines(html))));
}

// Remove entire elements that are never part of the main content
const NOISE_TAGS = [
  "script", "style", "head", "nav", "footer", "header",
  "aside", "noscript", "iframe", "form", "button",
];
function removeNoise(html: string): string {
  for (const tag of NOISE_TAGS) {
    html = html.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, "gi"), "");
  }
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

// Class/id keywords that signal main content or boilerplate
const CONTENT_SIGNALS  = /\b(article|post|entry|story|content|body|text|main|blog|prose|markdown)\b/i;
const NOISE_SIGNALS    = /\b(nav|menu|sidebar|footer|header|ad|banner|promo|widget|comment|share|social|related|recommend)\b/i;

// Score a block of HTML: high score = likely main content
function scoreBlock(html: string): number {
  const text = stripTags(html);
  if (text.length < 100) return 0;

  // Text density: ratio of visible text to raw HTML
  const density = text.length / (html.length || 1);

  // Link density penalty: blocks full of links are nav/footers
  const links     = (html.match(/<a[\s\S]*?<\/a>/gi) ?? []).join("");
  const linkText  = stripTags(links).length;
  const linkRatio = linkText / (text.length || 1);

  return density * (1 - linkRatio * 2);
}

function extractMainContent(rawHtml: string): string {
  const clean = removeNoise(rawHtml);

  // 1. Try semantic containers
  const semanticPatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]+role=["']main["'][^>]*>([\s\S]*?)<\/div>/i,
  ];
  for (const re of semanticPatterns) {
    const m = clean.match(re);
    if (m && stripTags(m[1]).length > 300) return htmlToText(m[1]);
  }

  // 2. Try class/id hints for content containers
  const hintRe = /<(?:div|section|article)[^>]+(?:id|class)="([^"]*)"[^>]*>([\s\S]*?)<\/(?:div|section|article)>/gi;
  let best = ""; let bestScore = 0;
  let m: RegExpExecArray | null;
  while ((m = hintRe.exec(clean)) !== null) {
    const attr   = m[1];
    const block  = m[2];
    if (NOISE_SIGNALS.test(attr)) continue;
    const bonus  = CONTENT_SIGNALS.test(attr) ? 1.5 : 1;
    const score  = scoreBlock(block) * bonus;
    if (score > bestScore && stripTags(block).length > 200) {
      bestScore = score; best = block;
    }
  }
  if (best) return htmlToText(best);

  // 3. Fallback: strip everything and return
  return htmlToText(clean);
}

// Expiry patterns — same as original tools.ts
const EXPIRY_PATTERNS: RegExp[] = [
  /this (job|position|role|listing|opening|requisition) is no longer available/i,
  /this (job|position|role|listing) has been (filled|closed|removed|taken down)/i,
  /no longer accepting applications/i,
  /application(s)? (is |are )?closed/i,
  /position (has been )?filled/i,
  /(job|listing|posting|requisition).*(has )?expired/i,
  /job (not found|does not exist|unavailable)/i,
  /page not found/i,
  /error 404/i,
  /410 gone/i,
];
const EXPIRY_FLAG = "[⚠ LINK_EXPIRED — this URL is dead or the job is closed. Do NOT include it in your response. Find a different URL instead.]\n\n";

// ─────────────────────────────────────────────────────────────────────────────
// ── PART 2: SEARCH (what s.jina.ai does) ─────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//
// Try three engines in order. Return the first that yields ≥ 3 results.
// Each engine has its own HTML parser since their markup differs.

interface Result { title: string; url: string; snippet: string }

function fmt(results: Result[]): string {
  return results
    .map(r => `Title: ${r.title}\nURL: ${r.url}${r.snippet ? `\nSnippet: ${r.snippet}` : ""}`)
    .join("\n\n---\n\n")
    .slice(0, 5000);
}

// ── Bing ──────────────────────────────────────────────────────────────────────
// Results are in <li class="b_algo"> blocks.
// Titles are in <h2><a href="DIRECT_URL">…</a></h2>.
// Snippets are in <div class="b_caption"><p>…</p></div>.
async function searchBing(query: string): Promise<Result[]> {
  const html = await get(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=10&setlang=en-US&cc=US&mkt=en-US`,
    { Referer: "https://www.bing.com/", "Accept-Language": "en-US,en;q=0.9" },
  );
  if (!html) return [];

  const results: Result[] = [];
  const blockRe = /<li[^>]+class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
  let block: RegExpExecArray | null;

  while ((block = blockRe.exec(html)) !== null && results.length < 10) {
    const content = block[1];

    // Direct URL from the title <a href="...">
    const urlMatch = content.match(/<h2[^>]*>[\s\S]*?<a[^>]+href="(https?:\/\/[^"]+)"/);
    if (!urlMatch) continue;

    const titleMatch   = content.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    const snippetMatch = content.match(/<div[^>]*class="[^"]*b_caption[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/);

    results.push({
      url:     urlMatch[1],
      title:   titleMatch   ? htmlToText(titleMatch[1]).slice(0, 120)   : urlMatch[1],
      snippet: snippetMatch ? htmlToText(snippetMatch[1]).slice(0, 300) : "",
    });
  }
  return results;
}

// ── DuckDuckGo ────────────────────────────────────────────────────────────────
// Results are in <div class="result …"> blocks.
// URLs are encoded in href as: uddg=ENCODED_URL inside redirect links.
async function searchDDG(query: string): Promise<Result[]> {
  const html = await get(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`,
    { Referer: "https://duckduckgo.com/", "Accept-Language": "en-US,en;q=0.9" },
  );
  if (!html) return [];

  const results: Result[] = [];
  const blockRe = /<div[^>]+class="[^"]*\bresult\b[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]+class="[^"]*\bresult\b|<\/body|$)/g;
  let block: RegExpExecArray | null;

  while ((block = blockRe.exec(html)) !== null && results.length < 10) {
    const content = block[1];
    const uddgMatch = content.match(/uddg=([^&"]+)/);
    if (!uddgMatch) continue;

    let url: string;
    try { url = decodeURIComponent(uddgMatch[1]); } catch { continue; }
    if (!url.startsWith("http")) continue;

    const titleMatch   = content.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    const snippetMatch = content.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/)
                      ?? content.match(/<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/);

    results.push({
      url,
      title:   titleMatch   ? htmlToText(titleMatch[1]).slice(0, 120)   : url,
      snippet: snippetMatch ? htmlToText(snippetMatch[1]).slice(0, 300) : "",
    });
  }
  return results;
}

// ── Yahoo ─────────────────────────────────────────────────────────────────────
// Results are in <div class="algo"> blocks.
// Title links have class "ac-algo" and direct URLs in href.
async function searchYahoo(query: string): Promise<Result[]> {
  const html = await get(
    `https://search.yahoo.com/search?p=${encodeURIComponent(query)}&n=10&vl=lang_en&vm=p`,
    { Referer: "https://search.yahoo.com/", "Accept-Language": "en-US,en;q=0.9" },
  );
  if (!html) return [];

  const results: Result[] = [];
  const blockRe = /<div[^>]+class="[^"]*\balgo\b[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]+class="[^"]*\balgo\b|<\/div>\s*<\/div>|$)/g;
  let block: RegExpExecArray | null;

  while ((block = blockRe.exec(html)) !== null && results.length < 10) {
    const content = block[1];
    const linkMatch = content.match(/<a[^>]+href="(https?:\/\/(?!r\.search\.yahoo)[^"]+)"/);
    if (!linkMatch) continue;

    const titleMatch   = content.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    const snippetMatch = content.match(/<p[^>]*class="[^"]*lh-[^"]*"[^>]*>([\s\S]*?)<\/p>/)
                      ?? content.match(/<div[^>]*class="[^"]*compText[^"]*"[^>]*>([\s\S]*?)<\/div>/);

    results.push({
      url:     linkMatch[1],
      title:   titleMatch   ? htmlToText(titleMatch[1]).slice(0, 120)   : linkMatch[1],
      snippet: snippetMatch ? htmlToText(snippetMatch[1]).slice(0, 300) : "",
    });
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Public exports ────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// Strip natural-language instruction words from a search query.
// "Find all remote React jobs posted in the last 7 days and list the top 10"
// → "remote React jobs last 7 days"
function sanitizeQuery(raw: string): string {
  return raw
    // Remove leading action verbs
    .replace(/^(find|search for|look up|get|show me|list|give me|fetch|check|tell me about|research|what are|what is|where can i|how to|identify)\s+/i, "")
    // Remove trailing instructions
    .replace(/\s+(and\s+)?(list|show|give me|display|return|output|find|tell me|summarize|summarise)\s+(the\s+)?(top\s+\d+|all|them|results?|it|them).*$/i, "")
    // Remove "posted in the last X days/weeks"
    .replace(/\s+posted\s+in\s+the\s+last\s+\d+\s+(day|week|hour|month)s?/i, " last $3s")
    // Remove ordinal/ranking instructions
    .replace(/\s+and\s+(rank|sort|order|list)\s+(by|them|the)\s+\w+/i, "")
    .replace(/\btop\s+\d+\b/i, "")
    // Collapse whitespace
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const JINA_SEARCH = async (query: string): Promise<string> => {
  const cleaned  = sanitizeQuery(query);
  const cacheKey = `search:${cleaned}`;
  const cached   = fromCache(cacheKey);
  if (cached) return cached;

  // Try engines in order — return the first that gives real results
  for (const engine of [searchBing, searchDDG, searchYahoo]) {
    try {
      const results = await engine(cleaned);
      if (results.length >= 2) {
        const text = fmt(results);
        toCache(cacheKey, text);
        return text;
      }
    } catch { /* try next engine */ }
  }

  const fallback = `No results found for: ${cleaned}`;
  toCache(cacheKey, fallback);
  return fallback;
};

export const JINA_READ = async (url: string, bypassCache = false): Promise<string> => {
  if (!isSafeUrl(url)) return `Error: URL not allowed — ${url}`;

  if (!bypassCache) {
    const cached = fromCache(url);
    if (cached) return cached;
  }

  // HEAD check — skip full fetch if definitively gone
  try {
    const head = await fetch(url, {
      method:  "HEAD",
      headers: { "User-Agent": ua() },
      signal:  AbortSignal.timeout(5_000),
    });
    if (head.status === 404 || head.status === 410) {
      const dead = `${EXPIRY_FLAG}HTTP ${head.status}: ${url} is no longer accessible.`;
      toCache(url, dead);
      return dead;
    }
  } catch { /* network error ≠ dead */ }

  const raw = await get(url);
  if (!raw) return `Read failed: could not fetch ${url}`;

  // JSON response — return as-is (useful for API endpoints)
  const trimmed = raw.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      const text   = JSON.stringify(parsed, null, 2).slice(0, 6000);
      toCache(url, text);
      return text;
    } catch { /* not valid JSON — fall through to HTML extraction */ }
  }

  // HTML response — extract main content
  let text = extractMainContent(raw).slice(0, 6000);

  // If direct fetch returned almost nothing (JS-rendered SPA like Greenhouse/Lever),
  // try Google's cached version which often has the rendered text.
  if (text.length < 300) {
    const googleCache = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}&hl=en`;
    const cached = await get(googleCache, { Referer: "https://www.google.com/" });
    if (cached) {
      const cachedText = extractMainContent(cached).slice(0, 6000);
      if (cachedText.length > text.length) text = cachedText;
    }
  }

  const final = EXPIRY_PATTERNS.some(p => p.test(text)) ? EXPIRY_FLAG + text : text;

  toCache(url, final);
  return final;
};
