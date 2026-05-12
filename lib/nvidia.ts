// lib/nvidia.ts
// NVIDIA NIM client (OpenAI-compatible) for dracarys-llama-3.1-70b-instruct.
// Single source of truth — replaces all direct Anthropic SDK calls.

const NVIDIA_BASE  = process.env.NVIDIA_BASE_URL  ?? "https://integrate.api.nvidia.com/v1";
const NVIDIA_MODEL = process.env.NVIDIA_MODEL_ID  ?? "abacusai/dracarys-llama-3.1-70b-instruct";

type Msg = { role: string; content: string };

function getKey(): string {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY not configured");
  return key;
}

// Convert Anthropic-style tool schema → OpenAI function tool schema
export function toOpenAITools(anthropicTools: any[]): any[] {
  return anthropicTools.map(t => ({
    type: "function",
    function: {
      name:        t.name,
      description: t.description ?? "",
      parameters:  t.input_schema ?? { type: "object", properties: {} },
    },
  }));
}

// Non-streaming completion
export async function nvidiaComplete(
  system: string,
  messages: Msg[],
  maxTokens = 4096,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${getKey()}`, "Content-Type": "application/json" },
    body:    JSON.stringify({
      model:      NVIDIA_MODEL,
      messages:   [{ role: "system", content: system }, ...messages],
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`NVIDIA NIM ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    text:         data.choices?.[0]?.message?.content ?? "",
    inputTokens:  data.usage?.prompt_tokens           ?? 0,
    outputTokens: data.usage?.completion_tokens       ?? 0,
  };
}

// Streaming generator — yields text chunks
export async function* nvidiaStream(
  system: string,
  messages: Msg[],
  maxTokens = 4096,
): AsyncGenerator<string> {
  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${getKey()}`, "Content-Type": "application/json" },
    body:    JSON.stringify({
      model:      NVIDIA_MODEL,
      messages:   [{ role: "system", content: system }, ...messages],
      max_tokens: maxTokens,
      stream:     true,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`NVIDIA NIM stream ${res.status}: ${err.slice(0, 200)}`);
  }
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") return;
      try {
        const chunk = JSON.parse(raw);
        const text  = chunk.choices?.[0]?.delta?.content ?? "";
        if (text) yield text;
      } catch { /* malformed SSE chunk */ }
    }
  }
}

// Tool-use loop using OpenAI function calling format.
// Accepts Anthropic-style tool schemas (input_schema) and converts internally.
export async function nvidiaWithTools(
  system: string,
  initialMessages: Array<{ role: string; content: string }>,
  anthropicTools: any[],
  opts: {
    maxSteps?:     number;
    maxTokens?:    number;
    onTokens?:     (input: number, output: number) => void;
    onText?:       (text: string) => void;
    onToolCall?:   (name: string, input: Record<string, unknown>, id: string) => void;
    onToolResult?: (id: string, result: string) => void;
    executeTool:   (name: string, input: Record<string, unknown>) => Promise<string>;
    delayMs?:      number;
  },
): Promise<string> {
  const tools    = toOpenAITools(anthropicTools);
  const messages = [...initialMessages] as any[];
  let   finalText = "";

  for (let step = 0; step < (opts.maxSteps ?? 8); step++) {
    const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${getKey()}`, "Content-Type": "application/json" },
      body:    JSON.stringify({
        model:      NVIDIA_MODEL,
        messages:   [{ role: "system", content: system }, ...messages],
        tools,
        max_tokens: opts.maxTokens ?? 4096,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "unknown");
      throw new Error(`NVIDIA NIM tools ${res.status}: ${err.slice(0, 200)}`);
    }

    const data     = await res.json();
    const choice   = data.choices?.[0];
    const msg      = choice?.message;
    const usage    = data.usage ?? {};

    opts.onTokens?.(usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0);

    if (msg?.content) {
      finalText += msg.content;
      opts.onText?.(msg.content);
    }

    const toolCalls: any[] = msg?.tool_calls ?? [];
    // If model returned no tool calls on the first step, treat response as final text.
    // Some models return finish_reason:"stop" even when tools are provided.
    if (!toolCalls.length || choice?.finish_reason === "stop") break;

    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: toolCalls });

    for (const tc of toolCalls) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tc.function?.arguments ?? "{}"); } catch {}

      opts.onToolCall?.(tc.function.name, input, tc.id);
      const result = await opts.executeTool(tc.function.name, input);
      opts.onToolResult?.(tc.id, result);

      messages.push({ role: "tool", tool_call_id: tc.id, content: result });

      if (opts.delayMs) await new Promise(r => setTimeout(r, opts.delayMs));
    }
  }

  return finalText;
}
