// lib/browser-executor.ts
// Runs Claude in a tool-use loop for browser automation.
// Claude calls browser tools → we relay them to the extension → results feed back.
// The extension runs on the USER'S machine — their cookies, their sessions.
// Server stays stateless: just routes messages.

import { BROWSER_TOOLS, type BrowserToolName } from "../browser-tools";

export interface BrowserStep {
  type:    "navigate" | "read" | "click" | "type" | "key" | "scroll" | "wait" | "done";
  detail:  string;
  result?: string;
}

export interface BrowserTaskResult {
  success:  boolean;
  steps:    BrowserStep[];
  output:   string;       // Final summary for the slave node
  error?:   string;
}

// ── Extension bridge (server-side relay) ──────────────────────────────────────
// The server can't directly call the extension — it lives in the user's browser.
// We use a pending-request pattern: store resolve/reject, client polls and responds.
// For simplicity in this architecture, we pass tool calls back via SSE to the canvas,
// canvas calls extension, result comes back via /api/browser-tool-result.

const pendingToolCalls = new Map<string, {
  resolve: (result: string) => void;
  reject:  (err: Error) => void;
}>();

export function resolveToolCall(callId: string, result: string) {
  pendingToolCalls.get(callId)?.resolve(result);
  pendingToolCalls.delete(callId);
}

// ── Main executor ─────────────────────────────────────────────────────────────

export async function runBrowserTask(
  goal:       string,
  sessionId:  string,
  apiKey:     string,
  onStep:     (step: BrowserStep) => void,
  onToolCall: (callId: string, tool: BrowserToolName, input: any) => void,
): Promise<BrowserTaskResult> {

  const steps: BrowserStep[] = [];
  const messages: any[] = [
    {
      role: "user",
      content: `You are a browser automation agent. Your goal: "${goal}"

Use the browser tools to complete this task step by step.
After each action, use browser_get_content to verify what happened.
When done, explain what you accomplished and any important information found.`,
    },
  ];

  let iterations = 0;
  const MAX_ITERATIONS = 20;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    // Call Claude with browser tools
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "x-api-key":       apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-6",
        max_tokens: 4096,
        tools:      BROWSER_TOOLS,
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message ?? `Claude API error: ${res.status}`);
    }

    const data = await res.json();

    // Add assistant response to message history
    messages.push({ role: "assistant", content: data.content });

    // Check stop reason
    if (data.stop_reason === "end_turn") {
      // Claude is done — extract final text
      const finalText = data.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n");

      steps.push({ type: "done", detail: "Task complete", result: finalText });
      return { success: true, steps, output: finalText };
    }

    if (data.stop_reason !== "tool_use") break;

    // Process tool calls
    const toolResults: any[] = [];

    for (const block of data.content) {
      if (block.type !== "tool_use") continue;

      const toolName  = block.name as BrowserToolName;
      const toolInput = block.input;
      const callId    = block.id;

      // Log step
      const step = toolCallToStep(toolName, toolInput);
      steps.push(step);
      onStep(step);

      // Request the canvas to execute this tool via the extension
      // and wait for the result
      const result = await new Promise<string>((resolve, reject) => {
        pendingToolCalls.set(callId, { resolve, reject });

        // Notify canvas via onToolCall callback
        onToolCall(callId, toolName, toolInput);

        // Timeout after 30s
        setTimeout(() => {
          if (pendingToolCalls.has(callId)) {
            pendingToolCalls.delete(callId);
            reject(new Error(`Tool call timeout: ${toolName}`));
          }
        }, 30000);
      });

      // Update step with result
      step.result = result.slice(0, 500);

      toolResults.push({
        type:        "tool_result",
        tool_use_id: callId,
        content:     result,
      });
    }

    // Feed tool results back to Claude
    if (toolResults.length > 0) {
      messages.push({ role: "user", content: toolResults });
    }
  }

  return {
    success: false,
    steps,
    output:  "Task did not complete within iteration limit.",
    error:   "Max iterations reached",
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toolCallToStep(name: BrowserToolName, input: any): BrowserStep {
  switch (name) {
    case "browser_navigate":
      return { type: "navigate", detail: `Navigate to ${input.url}` };
    case "browser_get_content":
      return { type: "read",     detail: "Reading page content" };
    case "browser_click":
      return { type: "click",    detail: `Click "${input.text ?? input.selector}"` };
    case "browser_type":
      return { type: "type",     detail: `Type into ${input.selector ?? "field"}: "${input.text?.slice(0,30)}…"` };
    case "browser_key":
      return { type: "key",      detail: `Press ${input.key}` };
    case "browser_scroll":
      return { type: "scroll",   detail: `Scroll ${input.direction ?? "down"}` };
    case "browser_wait":
      return { type: "wait",     detail: `Wait ${input.seconds ?? 2}s` };
    default:
      return { type: "done",     detail: name };
  }
}