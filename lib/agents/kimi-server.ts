// lib/agents/kimi-server.ts
// Server-side Kimi K2 + Dracarys Llama caller.
//
// Priority order:
//   1. Moonshot AI API  — if MOONSHOT_API_KEY is set (OpenAI-compatible)
//   2. NVIDIA NIM       — for dracarys-llama-3.1-70b-instruct (OpenAI-compatible)
//   3. Anthropic Claude — only if explicitly configured (legacy)

// Moonshot model IDs in preference order
const MOONSHOT_MODELS = ["moonshot-v1-128k", "moonshot-v1-32k", "moonshot-v1-8k"];
const MOONSHOT_BASE    = "https://api.moonshot.cn/v1";

// NVIDIA NIM endpoint (OpenAI-compatible)
const NVIDIA_BASE  = process.env.NVIDIA_BASE_URL  ?? "https://integrate.api.nvidia.com/v1";
const NVIDIA_MODEL = process.env.NVIDIA_MODEL_ID ?? "abacusai/dracarys-llama-3.1-70b-instruct";

type Msg = { role: string; content: string };

interface KimiResponse { text: string; inputTokens: number; outputTokens: number; }

// ── Non-streaming ──────────────────────────────────────────────────────────────
export async function kimiComplete(
  systemPrompt: string,
  messages:     Msg[],
  maxTokens   = 4096,
): Promise<KimiResponse> {
  // DEBUG: Check what keys are available
  console.log("[KimiServer] NVIDIA_API_KEY length:", process.env.NVIDIA_API_KEY?.length ?? 0);
  console.log("[KimiServer] MOONSHOT_API_KEY length:", process.env.MOONSHOT_API_KEY?.length ?? 0);
  console.log("[KimiServer] ANTHROPIC_API_KEY length:", process.env.ANTHROPIC_API_KEY?.length ?? 0);

  const moonKey = process.env.MOONSHOT_API_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY;

  // 1. Try Moonshot first
  if (moonKey) {
    const allMsgs = [
      { role: "system",  content: systemPrompt },
      ...messages,
    ];
    let lastErr: unknown;
    for (const model of MOONSHOT_MODELS) {
      try {
        console.log(`[KimiServer] Trying Moonshot model: ${model}`);
        const res = await fetch(`${MOONSHOT_BASE}/chat/completions`, {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${moonKey}` },
          body:    JSON.stringify({ model, messages: allMsgs, max_tokens: maxTokens }),
          signal:  AbortSignal.timeout(30_000),
        });
        if (!res.ok) { lastErr = new Error(`Moonshot ${res.status}`); continue; }
        const data = await res.json();
        const text  = data.choices?.[0]?.message?.content ?? "";
        const usage = data.usage ?? {};
        return { text, inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0 };
      } catch (e) { lastErr = e; }
    }
    console.warn("[KimiServer] Moonshot failed, trying NVIDIA NIM:", lastErr);
  }

  // 2. Try NVIDIA NIM for Dracarys (OpenAI-compatible)
  if (nvidiaKey) {
    try {
      console.log(`[KimiServer] Using NVIDIA NIM model: ${NVIDIA_MODEL}`);
      const allMsgs = [
        { role: "system", content: systemPrompt },
        ...messages,
      ];
      const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${nvidiaKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: NVIDIA_MODEL,
          messages: allMsgs,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "unknown error");
        throw new Error(`NVIDIA NIM ${res.status}: ${errText.slice(0, 200)}`);
      }
      const data = await res.json();
      const text  = data.choices?.[0]?.message?.content ?? "";
      const usage = data.usage ?? {};
      return { text, inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0 };
    } catch (e) {
      console.error("[KimiServer] NVIDIA NIM failed:", e);
    }
  }

  // 3. Legacy Anthropic Claude fallback (if configured)
  const anthKey = process.env.ANTHROPIC_API_KEY;
  if (anthKey) {
    try {
      console.log("[KimiServer] Falling back to Anthropic Claude Haiku");
      const { Anthropic } = await import("@anthropic-ai/sdk");
      const ai = new Anthropic({ apiKey: anthKey });
      const toAnthropic = (msgs: Msg[]) => msgs
        .filter(m => m.role === "user" || m.role === "assistant")
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
      
      const res = await ai.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        system: [{ type: "text", text: systemPrompt }] as any,
        messages: toAnthropic(messages),
      });
      const u = res.usage as any;
      return {
        text: res.content[0].type === "text" ? res.content[0].text : "",
        inputTokens: u.input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
      };
    } catch (e) {
      console.error("[KimiServer] Anthropic fallback failed:", e);
    }
  }

  throw new Error("No AI provider available. Set MOONSHOT_API_KEY, NVIDIA_API_KEY, or ANTHROPIC_API_KEY");
}

// ── Streaming (yields text chunks) ────────────────────────────────────────────
export async function* kimiStream(
  systemPrompt: string,
  messages:     Msg[],
  maxTokens   = 4096,
): AsyncGenerator<string> {
  const moonKey = process.env.MOONSHOT_API_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY;

  // 1. Try Moonshot streaming
  if (moonKey) {
    const allMsgs = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];
    let lastErr: unknown;
    for (const model of MOONSHOT_MODELS) {
      try {
        console.log(`[KimiServer] Trying Moonshot stream: ${model}`);
        const res = await fetch(`${MOONSHOT_BASE}/chat/completions`, {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${moonKey}` },
          body:    JSON.stringify({ model, messages: allMsgs, max_tokens: maxTokens, stream: true }),
          signal:  AbortSignal.timeout(60_000),
        });
        if (!res.ok) { lastErr = new Error(`Moonshot ${res.status}`); continue; }
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
            } catch { /* skip malformed chunk */ }
          }
        }
        return;
      } catch (e) { lastErr = e; }
    }
    console.warn("[KimiServer] Moonshot stream failed, trying NVIDIA NIM:", lastErr);
  }

  // 2. Try NVIDIA NIM streaming (OpenAI-compatible SSE)
  if (nvidiaKey) {
    try {
      console.log(`[KimiServer] Using NVIDIA NIM stream: ${NVIDIA_MODEL}`);
      const allMsgs = [
        { role: "system", content: systemPrompt },
        ...messages,
      ];
      const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${nvidiaKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: NVIDIA_MODEL,
          messages: allMsgs,
          max_tokens: maxTokens,
          stream: true,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "unknown error");
        throw new Error(`NVIDIA NIM ${res.status}: ${errText.slice(0, 200)}`);
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
          } catch { /* skip malformed chunk */ }
        }
      }
      return;
    } catch (e) {
      console.error("[KimiServer] NVIDIA NIM stream failed:", e);
    }
  }

  throw new Error("No streaming AI provider available. Set MOONSHOT_API_KEY or NVIDIA_API_KEY");
}

// ── Cost estimate ──────────────────────────────────────────────────────────────
export function kimiCost(inputTokens: number, outputTokens: number): number {
  // Rough estimates — adjust based on actual NVIDIA billing
  return (inputTokens / 1_000) * 0.0005 + (outputTokens / 1_000) * 0.0005;
}
