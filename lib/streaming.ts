// lib/streaming.ts
// Streaming response handler for Claude and GPT-4o via user's own API key.
// The API call happens in the browser using their key — never routed through
// TokenLift servers. Cost comes directly from their API account.

export interface StreamCallbacks {
  onToken:    (token: string) => void;
  onCost:     (inputTokens: number, outputTokens: number) => void;
  onComplete: (fullText: string) => void;
  onError:    (error: string) => void;
}

// ── Cost rates per 1K tokens ──────────────────────────────────────────────────

export const MODEL_RATES: Record<string, { input: number; output: number; label: string }> = {
  "claude-sonnet-4-6": { input: 0.003,   output: 0.015,  label: "Claude Sonnet 4"  },
  "claude-haiku-4-5-20251001":{ input: 0.0008,  output: 0.004,  label: "Claude Haiku 4.5" },
  "gpt-4o":                   { input: 0.005,   output: 0.015,  label: "GPT-4o"           },
  "gpt-4o-mini":              { input: 0.00015, output: 0.0006, label: "GPT-4o mini"      },
};

export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const rates = MODEL_RATES[modelId] ?? { input: 0.003, output: 0.015 };
  return (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output;
}

// ── Claude streaming ──────────────────────────────────────────────────────────

export async function streamClaude(
  apiKey:    string,
  modelId:   string,
  prompt:    string,
  data:      string,
  callbacks: StreamCallbacks
): Promise<void> {
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model:      modelId,
        max_tokens: 2000,
        stream:     true,
        messages:   [{ role: "user", content: prompt + "\n\n" + data }],
      }),
    });
  } catch (err) {
    callbacks.onError(`Network error: ${String(err)}`);
    return;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    callbacks.onError(`Claude API error ${response.status}: ${text}`);
    return;
  }

  if (!response.body) {
    callbacks.onError("Claude API returned an empty response body");
    return;
  }

  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText     = "";
  let inputTokens  = 0;
  let outputTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

      for (const line of lines) {
        const raw = line.slice(6);
        if (raw === "[DONE]") continue;

        try {
          const event = JSON.parse(raw);

          if (event.type === "content_block_delta") {
            const token = event.delta?.text ?? "";
            if (token) {
              fullText += token;
              callbacks.onToken(token);
            }
          }

          if (event.type === "message_start") {
            inputTokens = event.message?.usage?.input_tokens ?? 0;
          }

          if (event.type === "message_delta") {
            outputTokens = event.usage?.output_tokens ?? outputTokens;
          }

          callbacks.onCost(inputTokens, outputTokens);
        } catch {
          // Partial JSON — skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  callbacks.onComplete(fullText);
}

// ── OpenAI / GPT-4o streaming ─────────────────────────────────────────────────

export async function streamOpenAI(
  apiKey:    string,
  modelId:   string,
  prompt:    string,
  data:      string,
  callbacks: StreamCallbacks
): Promise<void> {
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model:          modelId,
        max_tokens:     4096,
        stream:         true,
        stream_options: { include_usage: true },
        messages:       [{ role: "user", content: prompt + "\n\n" + data }],
      }),
    });
  } catch (err) {
    callbacks.onError(`Network error: ${String(err)}`);
    return;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    callbacks.onError(`OpenAI API error ${response.status}: ${text}`);
    return;
  }

  if (!response.body) {
    callbacks.onError("OpenAI API returned an empty response body");
    return;
  }

  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText     = "";
  let inputTokens  = 0;
  let outputTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

      for (const line of lines) {
        const raw = line.slice(6);
        if (raw === "[DONE]") continue;

        try {
          const event  = JSON.parse(raw);
          const token  = event.choices?.[0]?.delta?.content ?? "";
          if (token) {
            fullText += token;
            callbacks.onToken(token);
          }
          if (event.usage) {
            inputTokens  = event.usage.prompt_tokens     ?? inputTokens;
            outputTokens = event.usage.completion_tokens ?? outputTokens;
            callbacks.onCost(inputTokens, outputTokens);
          }
        } catch {
          // Partial JSON — skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  callbacks.onComplete(fullText);
}

// ── Unified stream dispatcher ─────────────────────────────────────────────────

export async function streamAnalysis(
  provider:  "anthropic" | "openai",
  apiKey:    string,
  modelId:   string,
  prompt:    string,
  data:      string,
  callbacks: StreamCallbacks
): Promise<void> {
  if (provider === "anthropic") {
    return streamClaude(apiKey, modelId, prompt, data, callbacks);
  }
  return streamOpenAI(apiKey, modelId, prompt, data, callbacks);
}

// ── Spec-compatible alias ─────────────────────────────────────────────────────

export const streamGPT4 = streamOpenAI;

// ── Spec-compatible MODEL_RATES with short keys ───────────────────────────────
// The full-ID keys above are used internally.
// These short keys match the spec signature for calculateCost.

export const MODEL_RATES_SHORT = {
  "claude-sonnet-4": { input: 0.003,   output: 0.015  },
  "gpt-4o":          { input: 0.005,   output: 0.015  },
  "gpt-4o-mini":     { input: 0.00015, output: 0.0006 },
} as const;
