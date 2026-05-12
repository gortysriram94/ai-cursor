import { NextRequest, NextResponse } from "next/server";
import { puterServerChat, isPuterTokenRegistered } from "@/lib/puter-server";

type Action = "reply" | "follow_up" | "summarize";
const VALID: Action[] = ["reply", "follow_up", "summarize"];

const PROMPTS: Record<Action, (t: string) => string> = {
  reply:     (t) => `Write a short, professional reply to this message. Sound human, not robotic. Return only the reply.\n\n${t}`,
  follow_up: (t) => `Write a concise follow-up. Keep it brief and action-oriented. Return only the follow-up.\n\n${t}`,
  summarize: (t) => `Summarize the key points in 2–3 sentences. Return only the summary.\n\n${t}`,
};

// Fast 8B model — responds in 2-5s vs 30s+ for the 70B
const FAST_MODEL   = "meta/llama-3.1-8b-instruct";
const NVIDIA_BASE  = process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";

async function callNvidia(prompt: string): Promise<string> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY not set");

  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model:      FAST_MODEL,
      messages:   [{ role: "user", content: prompt }],
      max_tokens: 512,
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`NVIDIA ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export async function POST(req: NextRequest) {
  try {
    const { text, action } = await req.json() as { text: string; action: Action };

    if (!text?.trim()) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }
    if (!VALID.includes(action)) {
      return NextResponse.json({ error: "Invalid action. Use: reply, follow_up, summarize" }, { status: 400 });
    }

    const prompt = PROMPTS[action](text.slice(0, 5000));

    // Path 1 — Puter server token (free, browser not needed)
    if (isPuterTokenRegistered()) {
      try {
        const result = await puterServerChat([{ role: "user", content: prompt }]);
        console.log("[ai-action] puter ✓");
        return NextResponse.json({ result });
      } catch (e) {
        console.warn("[ai-action] puter failed, falling back to NVIDIA:", e);
      }
    }

    // Path 2 — NVIDIA fast model (8B, 2-5s response)
    const result = await callNvidia(prompt);
    console.log("[ai-action] nvidia ✓");
    return NextResponse.json({ result });

  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
}
