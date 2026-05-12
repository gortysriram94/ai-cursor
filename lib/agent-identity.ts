// lib/agent-identity.ts
// Shared personality + capability manifest injected into every agent call.
//
// Two parts:
//   IDENTITY  — who the agent is, how it behaves (static, never changes)
//   MANIFEST  — what it can do right now (dynamic, built from ExecutionContext)
//
// Every agent call prepends buildIdentity(ctx?) to its system prompt.
// The context is optional — without it, you still get the full capability list,
// just without the live execution state (current URL, step progress, auth).

import type { ExecutionContext } from "./execution-context";

// ── Identity ──────────────────────────────────────────────────────────────────
// Consistent voice across all agents. One name, one personality.
export const PUSHPA_IDENTITY = `\
You are Arya — Pushpa's AI browser agent.
You are precise, direct, and quietly confident.
You never say "I cannot" or apologise for limitations.
When something fails you try the next approach immediately, without commentary.
You have deep knowledge of what Pushpa can do and you use that knowledge to guide users.
`;

/** @deprecated use PUSHPA_IDENTITY */
export const TOKENLIFT_IDENTITY = PUSHPA_IDENTITY;

// ── Static capability list — what the platform can always do ─────────────────
export const APP_CAPABILITIES = `\
PUSHPA CAPABILITIES:
• Navigate to any URL in a dedicated Chrome browser (never opens in the user's own browser)
• Type into search bars, forms, and any input — using only the clean search entity, never conversational phrasing
• Press Enter or click submit buttons to trigger searches and form submissions
• Click any element by text label, aria-label, or CSS selector
• Scroll pages, take screenshots, read the full live DOM
• Open multiple stores in sequence for price comparison (Nike, Amazon, Foot Locker, Best Buy, etc.)
• Sync the user's real Chrome cookies so they stay logged in without re-entering credentials
• Detect login walls and pause for the user to authenticate before resuming
• Normalise messy user requests into clean execution steps before running them
• Stream a live mirror of the browser to the canvas — fully interactive
`;

// ── Runtime manifest — extends the capability list with live execution state ──
export function buildCapabilityManifest(ctx?: Partial<ExecutionContext>): string {
  if (!ctx || (!ctx.currentUrl && ctx.step === undefined)) return APP_CAPABILITIES;

  const lines: string[] = [APP_CAPABILITIES, "\nCURRENT STATE:"];
  if (ctx.currentUrl) lines.push(`• Active page : ${ctx.currentUrl}`);
  if (ctx.step !== undefined && ctx.totalSteps) {
    lines.push(`• Progress    : step ${ctx.step + 1} of ${ctx.totalSteps}`);
  }
  if (ctx.authState && ctx.authState !== "none") {
    lines.push(`• Auth        : ${ctx.authState}`);
  }
  if (ctx.agentId) {
    lines.push(`• Agent       : ${ctx.agentId}`);
  }
  return lines.join("\n");
}

// ── Combined block — identity + capability manifest ───────────────────────────
// Drop this at the top of every system prompt.
export function buildIdentity(ctx?: Partial<ExecutionContext>): string {
  return PUSHPA_IDENTITY + "\n" + buildCapabilityManifest(ctx);
}