// lib/agents/tools.ts
// Shared tool implementations used across all agents.

import type { AgentContext, SendFn } from "./types";
import { nvidiaWithTools } from "../nvidia";
import { JINA_SEARCH, JINA_READ } from "../web-reader";
import { buildIdentity } from "../agent-identity";
export { JINA_SEARCH, JINA_READ };

export const sleep  = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
export const jitter = (base: number, spread: number) => base + Math.random() * spread;

// Parallel URL fetching — concurrencyLimit simultaneous reads, small pause between batches.
// Each resolved URL emits a progress callback so the UI can update in real-time.
export async function batchJinaRead(
  urls: string[],
  concurrencyLimit = 4,
  onProgress?: (url: string, valid: boolean, idx: number) => void,
): Promise<Array<{ url: string; content: string; valid: boolean }>> {
  const results: Array<{ url: string; content: string; valid: boolean }> = [];
  for (let i = 0; i < urls.length; i += concurrencyLimit) {
    const chunk = urls.slice(i, i + concurrencyLimit);
    const fetched = await Promise.all(
      chunk.map(async (url, j) => {
        const content = await JINA_READ(url);
        const valid = !content.startsWith("[⚠ LINK_EXPIRED");
        onProgress?.(url, valid, i + j);
        return { url, content, valid };
      }),
    );
    results.push(...fetched);
    if (i + concurrencyLimit < urls.length) await sleep(400); // light pause between batches
  }
  return results;
}

const PRICING: Record<string, { input: number; output: number; cache_read: number }> = {
  "claude-3-5-sonnet-20240620": { input: 3.00, output: 15.00, cache_read: 0.30 },
  "claude-3-5-haiku-20241022": { input: 0.25, output:  1.25, cache_read: 0.03 },
  "dracarys-llama-3.1-70b-instruct": { input: 0.50, output: 0.50, cache_read: 0 },
};
export function calcCost(model: string, u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number }): number {
  const p = PRICING[model] ?? PRICING["dracarys-llama-3.1-70b-instruct"];
  return (u.input_tokens / 1e6) * p.input
       + (u.output_tokens / 1e6) * p.output
       + ((u.cache_read_input_tokens ?? 0) / 1e6) * p.cache_read;
}

// Anti-refusal prefix injected into every agent system prompt.
// Prevents Claude from outputting explanations about what it "can't" do.
export const AGENT_PREFIX = `You are a fully automated web research and action agent operating at human pace.
RULES — follow unconditionally:
1. ALWAYS use your tools. Never output prose explaining limitations.
2. NEVER refuse a task. Make reasonable assumptions and continue.
3. If a site requires login or returns a blocking page, immediately try an alternative source — do NOT retry the same URL.
4. Prefer sites with public job boards: greenhouse.io, lever.co, ashbyhq.com, workatastartup.com, jobs.ashbyhq.com — these do NOT require login.
5. Avoid: LinkedIn (login wall), Glassdoor (login wall), Indeed (blocks scrapers). Use them only to find company names, then go direct to the company's ATS.
6. Output ONLY tool calls + minimal status text. No markdown essays.
7. Do not repeat the same search query or URL. Each tool call must make progress.
8. Your job is to DO, not to explain why you can't.
9. LINK VALIDATION (critical): If a fetched page begins with "[⚠ LINK_EXPIRED", that URL is dead or the job is closed. NEVER include it in your response — open a different URL instead and find a valid replacement.
10. For job listings: only include a URL in your final answer if the page content clearly shows an active job description with an "Apply" button or open application form. If the page says the position is filled, closed, or unavailable — discard it and find another.
11. GEOLOCATION: If the task starts with "[User location: ...]", use that location in ALL search queries that benefit from it (restaurants, shops, services, events, weather, jobs). Append the city/state to search terms automatically.

`;

// ── Kimi prompt optimizer — generates a sharper system prompt for Claude ──────
// Kimi thinks about HOW Claude should approach the task; Claude then executes.
// Falls back silently to the original prompt if Kimi is unavailable.
export async function kimiOptimizePrompt(
  agentType: string,
  task:      string,
  basePrompt: string,
): Promise<string> {
  try {
    const { kimiComplete } = await import("./kimi-server");
    const { text } = await kimiComplete(
      `You are a prompt engineer. Given an agent type and task, return an improved system prompt for a Claude AI agent that will execute the task using tools. Keep it under 300 words. Return ONLY the improved system prompt — no explanation, no labels.`,
      [{
        role: "user",
        content: `Agent type: ${agentType}\nTask: ${task}\n\nOriginal prompt:\n${basePrompt.slice(0, 800)}\n\nWrite a sharper, more specific system prompt for Claude to follow.`,
      }],
      512,
    );
    return text.trim() || basePrompt;
  } catch {
    return basePrompt; // silent fallback — Claude still runs with original prompt
  }
}

// Run a Dracarys call with tools, streaming events via send()
export async function runClaudeWithTools(
  system: string,
  messages: Array<{ role: string; content: string }>,
  tools: any[],
  ctx: AgentContext,
  send: SendFn,
  executeTool: (name: string, input: Record<string, unknown>, send: SendFn, ctx: AgentContext) => Promise<string>,
  maxSteps = 8,
): Promise<string> {
  const READONLY_TOOLS = new Set(["identify_elements", "evaluate_results", "web_search"]);
  const recentCalls: string[] = [];

  return nvidiaWithTools(
    buildIdentity() + "\n\n" + AGENT_PREFIX + system,
    messages,
    tools,
    {
      maxSteps,
      onTokens: (input, output) => {
        send({
          type: "agent_tokens", nodeId: ctx.nodeId,
          input_tokens: input, output_tokens: output, cache_read_tokens: 0,
          cost_usd: calcCost("dracarys-llama-3.1-70b-instruct", { input_tokens: input, output_tokens: output }),
        });
      },
      onText: (text) => send({ type: "agent_text", nodeId: ctx.nodeId, text }),
      onToolCall: (name, input, id) => {
        if (!READONLY_TOOLS.has(name)) {
          const sig = `${name}:${JSON.stringify(input).slice(0, 120)}`;
          recentCalls.push(sig);
          if (recentCalls.length > 5) recentCalls.shift();
        }
        send({ type: "agent_tool_call", nodeId: ctx.nodeId, tool: name, toolCallId: id, input });
      },
      onToolResult: (id, result) =>
        send({ type: "agent_tool_result", nodeId: ctx.nodeId, toolCallId: id, result: result.slice(0, 400) }),
      executeTool: async (name, input) => {
        if (!READONLY_TOOLS.has(name)) {
          const sig = `${name}:${JSON.stringify(input).slice(0, 120)}`;
          const repeats = recentCalls.filter(s => s === sig).length;
          if (repeats >= 3) {
            return `[loop_detected] "${name}" repeated ${repeats} times with identical input. Try a different approach.`;
          }
        }
        return executeTool(name, input, send, ctx);
      },
      delayMs: Math.round(jitter(800, 1400)),
    },
  );
}