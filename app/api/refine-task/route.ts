// app/api/refine-task/route.ts
// Cleans up a raw user task string once before it enters the workflow engine.
// Fixes typos, expands abbreviations, makes intent unambiguous.
// Returns the original task unchanged if Kimi is unavailable or the call fails.

import { NextRequest, NextResponse } from "next/server";
import { kimiComplete } from "@/lib/agents/kimi-server";

export const runtime = "nodejs";

const SYSTEM = `You are a task refiner for a browser automation agent.
The user has typed a task. Rewrite it as one clear, unambiguous instruction.
Rules:
- Fix typos and spelling errors
- Expand abbreviations ("yt" → "YouTube", "amzn" → "Amazon")
- Make the intent explicit (site, action, target)
- Keep all user-specified details (prices, names, brands, sites)
- Do NOT add steps or change what was asked
- Return ONLY the rewritten task — no explanation, no quotes`;

export async function POST(req: NextRequest) {
  let task: string;
  try {
    ({ task } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!task?.trim()) return NextResponse.json({ refined: task });

  // Skip trivial inputs (single word or very short — nothing to clean)
  if (task.trim().split(/\s+/).length < 3) {
    return NextResponse.json({ refined: task });
  }

  try {
    const { text } = await kimiComplete(SYSTEM, [{ role: "user", content: task }], 256);
    const refined = text.trim().replace(/^["']|["']$/g, ""); // strip surrounding quotes if any
    return NextResponse.json({ refined: refined || task });
  } catch {
    // Non-fatal — return original on any failure
    return NextResponse.json({ refined: task });
  }
}
