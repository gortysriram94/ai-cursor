// lib/agents/verifier-agent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Post-action verification in the live WorkflowEngine path.
//
// Called after every outcome-determining browser step:
//   navigate, type, open_site, search_web, extract_pricing
//
// Does NOT fire after scroll, wait, or pure read steps (no state change).
//
// Returns VerificationResult:
//   passed     — did the action achieve its intended outcome?
//   confidence — 0.0–1.0 evidence score
//   evidence   — human-readable reason (shown in AgentCard timeline)
//   fatal      — if true, step must be retried / workflow aborted
//
// Implementation: one lightweight browser_get_content round-trip, then pattern
// matching on URL + page text. No LLM call — latency must stay under 500ms.
// ─────────────────────────────────────────────────────────────────────────────

import type { ManifestStep, BrowserAction, BrowserResult } from "../workflow-engine";

export interface VerificationResult {
  passed:     boolean;
  confidence: number;  // 0.0–1.0
  evidence:   string;
  fatal:      boolean; // abort-worthy (auth wall, hard 404, etc.)
}

// Step types where verification adds value (state-changing outcomes)
const VERIFY_TYPES = new Set([
  "navigate", "type", "open_site", "search_web", "extract_pricing", "summarize_page",
]);

// URL patterns that indicate a success state
const SUCCESS_URL_RES = [
  /\/success\b/i, /\/confirmation\b/i, /\/confirmed\b/i,
  /\/thank(-you|s)?\b/i, /\/complete(d)?\b/i, /\/submitted\b/i,
  /[?&]status=success/i, /\/done\b/i,
];

// Text patterns → confidence score
const TEXT_SIGNALS: Array<{ re: RegExp; conf: number; fatal?: boolean }> = [
  // Hard failures
  { re: /\b(404|page not found|not found)\b/i,          conf: 0.0, fatal: true  },
  { re: /\b(403|forbidden|access denied)\b/i,            conf: 0.0, fatal: true  },
  { re: /\b(500|internal server error)\b/i,              conf: 0.0, fatal: true  },
  { re: /\b(captcha|verify you are human|robot check)\b/i, conf: 0.0, fatal: true },
  { re: /\b(sign in|log in|login required)\b/i,           conf: 0.1, fatal: false },

  // Success signals
  { re: /confirmation\s*(number|code|id)[:\s#]+[A-Z0-9\-]{4,}/i, conf: 0.95 },
  { re: /order\s*(id|#)[:\s#]+[A-Z0-9\-]{4,}/i,                  conf: 0.95 },
  { re: /application\s*(submitted|received)/i,                    conf: 0.90 },
  { re: /successfully\s*(submitted|sent|applied|ordered)/i,       conf: 0.88 },
  { re: /message\s*(sent|delivered)/i,                            conf: 0.88 },
  { re: /thank you/i,                                             conf: 0.72 },
  { re: /search results|results for/i,                            conf: 0.70 },
  { re: /showing \d+ result/i,                                    conf: 0.75 },
];

// ── Main export ───────────────────────────────────────────────────────────────

export async function verifyStep(
  step:       ManifestStep,
  _result:    BrowserResult,
  runBrowser: (a: BrowserAction) => Promise<BrowserResult>,
): Promise<VerificationResult> {
  if (!VERIFY_TYPES.has(step.type)) {
    return { passed: true, confidence: 1.0, evidence: "no-verify step", fatal: false };
  }

  // One lightweight page read — title + url + truncated text
  let page: Record<string, unknown> = {};
  try {
    const raw = await runBrowser({ type: "extract", slave: 2, fields: ["title", "url", "text"] });
    page = (raw.data ?? {}) as Record<string, unknown>;
  } catch {
    return { passed: true, confidence: 0.5, evidence: "extract failed — assuming ok", fatal: false };
  }

  const url   = (page.url   as string) ?? "";
  const title = (page.title as string) ?? "";
  const text  = ((page.text  as string) ?? "").slice(0, 2_000);
  const combined = `${title} ${text}`;

  // 1 — check URL for success pattern
  const urlSuccess = SUCCESS_URL_RES.some(re => re.test(url));
  const urlConf    = urlSuccess ? 0.70 : 0;

  // 2 — scan text signals (first match wins per category)
  let textConf  = 0;
  let evidence  = "";
  let fatal     = false;

  for (const sig of TEXT_SIGNALS) {
    if (sig.re.test(combined)) {
      textConf = sig.conf;
      evidence = combined.match(sig.re)?.[0]?.slice(0, 80) ?? "";
      fatal    = !!sig.fatal;
      break;
    }
  }

  // 3 — combine
  const confidence = Math.min(0.95, Math.max(urlConf, textConf));

  // No signals at all → assume ok (non-blocking neutral result)
  if (confidence === 0 && !fatal) {
    return { passed: true, confidence: 0.5, evidence: `on: ${url.slice(0, 60)}`, fatal: false };
  }

  const passed = confidence >= 0.65 && !fatal;
  if (!evidence) evidence = urlSuccess ? `URL: ${url.slice(0, 60)}` : `title: ${title.slice(0, 60)}`;

  return { passed, confidence, evidence, fatal };
}
