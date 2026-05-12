// app/api/goal-decompose/route.ts
// Kimi K2 decomposes a user goal into ordered, executable milestones.
// Each milestone has a short label (for UI) and a task string (for WorkflowEngine).

import { NextRequest, NextResponse } from "next/server";
import { kimiComplete } from "@/lib/agents/kimi-server";

export const runtime = "nodejs";

const SYSTEM = `You are a goal decomposition specialist for an AI browser agent called Arya.

Given a user's high-level goal, success criteria, and optional constraints, produce a JSON array of ordered milestones.

RULES:
1. Each milestone must be a SINGLE, atomic browser task that one WorkflowEngine run can complete.
2. The "task" string is sent directly to the agent — write it as a precise, action-oriented command.
3. The "label" is a short summary for the UI (max 8 words).
4. Order milestones so each one's output feeds into the next.
5. Aim for 3–8 milestones. Never more than 10.
6. Do NOT include meta-steps like "review results" or "check progress" — only browser actions.
7. Where possible, make milestones independently runnable so the user can pause between them.

Return ONLY valid JSON — no prose, no markdown fences:
[{"label":"Short label","task":"Full task instruction sent to agent"},...]`;

export async function POST(req: NextRequest) {
  const { objective, successCriteria, constraints } = await req.json()
    .catch(() => ({})) as Record<string, string>;

  if (!objective?.trim()) {
    return NextResponse.json({ error: "objective is required" }, { status: 400 });
  }

  const userMsg = [
    `GOAL: ${objective}`,
    successCriteria ? `SUCCESS CRITERIA: ${successCriteria}` : "",
    constraints     ? `CONSTRAINTS: ${constraints}`           : "",
  ].filter(Boolean).join("\n");

  try {
    const { text } = await kimiComplete(SYSTEM, [{ role: "user", content: userMsg }], 1024);

    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("No JSON array in response");

    const milestones = JSON.parse(match[0]) as Array<{ label: string; task: string }>;

    // Validate shape
    if (!Array.isArray(milestones) || milestones.length === 0) {
      throw new Error("Empty or invalid milestone array");
    }

    const cleaned = milestones
      .filter(m => m.label && m.task)
      .slice(0, 10)
      .map(m => ({ label: String(m.label).slice(0, 80), task: String(m.task).slice(0, 400) }));

    return NextResponse.json({ milestones: cleaned });
  } catch (err) {
    console.error("[goal-decompose]", err);
    // Fallback: single milestone wrapping the whole objective
    return NextResponse.json({
      milestones: [{ label: objective.slice(0, 60), task: objective }],
    });
  }
}
