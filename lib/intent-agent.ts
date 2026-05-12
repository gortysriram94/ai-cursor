// lib/intent-agent.ts
// ─────────────────────────────────────────────────────────────────────────────
// SINGLE authority for intent classification.
//
// All routing decisions — page.tsx, WorkflowEngine, GoalPanel — consume
// IntentObject from here and NOWHERE ELSE.
//
// Replaces the three independent classification systems that previously existed:
//   • detectIntent (canvas routing logic)
//   • WORKFLOW_KEYWORDS / HAS_SITE (canvas keyword matching)
//   • normalizeTask (server-side task normalizer)
//
// Those systems still exist as implementation details but are called only here.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeTask, type NormalizedTask, type TaskIntent } from "./task-normalizer";

// ── Domain taxonomy ───────────────────────────────────────────────────────────
// Extends the raw TaskIntent with a higher-level semantic domain.
// Used by WorkflowEngine to select the right tool + adapter chain.

export type IntentDomain =
  | "search"       // generic web query
  | "shopping"     // product / price comparison
  | "navigate"     // direct URL visit
  | "task"         // open-ended agent task
  | "job_search"   // job discovery + application
  | "email"        // inbox management
  | "research"     // competitive / pricing / information research
  | "content"      // writing, posting, scheduling
  | "finance"      // payments, expenses, reports
  | "travel"       // flights, hotels, itineraries
  | "calendar"     // scheduling, meetings
  | "dev";         // code, repos, CI/CD

// ── Canonical intent object ───────────────────────────────────────────────────
// Extends NormalizedTask so existing callers reading .intent / .url / .query
// continue to work without changes — they get the richer object for free.

export interface IntentObject extends NormalizedTask {
  /** High-level semantic domain derived from full natural-language analysis. */
  domain:   IntentDomain;
  /** Unique trace ID — propagated through Manifest → step events → synthesis. */
  traceId:  string;
  /** Original raw text before any normalisation. */
  original: string;
}

// ── Domain detection rules ────────────────────────────────────────────────────
// Ordered by specificity — first match wins.

const DOMAIN_RULES: Array<{ domain: IntentDomain; re: RegExp }> = [
  { domain: "job_search", re: /\b(job|apply|application|resume|cv|linkedin jobs|hiring|career|interview|recruiter|glassdoor|indeed|lever|workday)\b/i },
  { domain: "email",      re: /\b(email|inbox|gmail|outlook|message|send mail|reply|draft|unsubscribe|mail)\b/i },
  { domain: "finance",    re: /\b(stripe|invoice|payment|expense|budget|quickbooks|bank transfer|ledger|revenue|mrr|arr)\b/i },
  { domain: "travel",     re: /\b(flight|hotel|airbnb|booking|expedia|kayak|itinerary|trip|vacation)\b/i },
  { domain: "calendar",   re: /\b(meeting|calendar|schedule|event|appointment|invite|zoom|google meet)\b/i },
  { domain: "dev",        re: /\b(code|repo|github|gitlab|pull request|pr|deploy|ci|cd|build|test|bug|issue|commit)\b/i },
  { domain: "content",    re: /\b(post|publish|tweet|thread|instagram|tiktok|content|article|blog|caption|write)\b/i },
  { domain: "research",   re: /\b(research|compare|review|pricing|price|competitors|analysis|summarize|summarise|analyze|top \d+|best \d+|list (the )?(top|best)|what are the (top|best)|in stock|back in stock|available)\b/i },
  { domain: "shopping",   re: /\b(buy|purchase|order|checkout|cart|product|deal|discount|amazon|ebay|walmart)\b/i },
];

function _inferDomain(raw: string, baseIntent: TaskIntent): IntentDomain {
  for (const rule of DOMAIN_RULES) {
    if (rule.re.test(raw)) return rule.domain;
  }
  // Fall back to base intent
  if (baseIntent === "shopping") return "shopping";
  if (baseIntent === "search")   return "search";
  if (baseIntent === "navigate") return "navigate";
  return "task";
}

function _traceId(): string {
  return `int_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Classify raw user text into a canonical IntentObject.
 * This is the ONE place in the system where intent is determined.
 *
 * Usage:
 *   import { classifyIntent } from "@/lib/intent-agent";
 *   const intent = classifyIntent(userText);
 *   // intent.domain, intent.query, intent.url, intent.strategy, intent.traceId
 */
export function classifyIntent(raw: string): IntentObject {
  const norm   = normalizeTask(raw);
  const domain = _inferDomain(raw, norm.intent);
  return {
    ...norm,          // intent, query, url, destination, strategy, postAction
    domain,
    traceId:  _traceId(),
    original: raw,
  };
}
