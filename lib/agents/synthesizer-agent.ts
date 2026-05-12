// lib/agents/synthesizer-agent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Final synthesis step before workflow_complete reaches the UI.
//
// Merges all evidence collected during the workflow into a structured answer:
//   answer      — direct response to the user's goal
//   keyPoints   — bullet evidence
//   sources     — URLs referenced
//   confidence  — aggregate evidence quality (0.0–1.0)
//
// Raw extractedData NEVER reaches the UI directly — it passes through here.
// ─────────────────────────────────────────────────────────────────────────────

import { kimiComplete } from "./kimi-server";

export interface SynthesisResult {
  answer:     string;
  keyPoints:  string[];
  sources:    string[];
  confidence: number;
  raw:        Record<string, unknown>; // original extractedData still available
}

const SYNTH_SYSTEM = `You are a research synthesizer. Given a user goal and evidence collected by an AI agent, produce a concise, factual answer.

Return ONLY valid JSON:
{
  "answer": "direct 1-3 sentence answer to the goal",
  "keyPoints": ["finding 1", "finding 2", "finding 3"],
  "confidence": 0.0-1.0
}

Rules:
- answer must directly address the goal — not describe what the agent did
- keyPoints must be specific findings, not process steps
- confidence reflects evidence quality: 0.9=verified, 0.7=likely, 0.5=partial, 0.3=weak
- if evidence is empty or irrelevant, say so in the answer
- NEVER hallucinate data not present in the evidence`;

export async function synthesizeWorkflow(
  goal:          string,
  extractedData: Record<string, unknown>,
  completedSteps: number,
): Promise<SynthesisResult> {
  // Extract sources from any search results or page URLs captured
  const sources = _extractSources(extractedData);

  // Confidence floor from step completion ratio (more steps = more evidence)
  const baseConf = Math.min(0.9, 0.3 + completedSteps * 0.12);

  // If nothing was extracted, return minimal synthesis without LLM call
  const hasEvidence = Object.keys(extractedData).length > 0;
  if (!hasEvidence) {
    return {
      answer:     "Task completed — no structured data was extracted.",
      keyPoints:  [],
      sources,
      confidence: Math.min(baseConf, 0.5),
      raw:        extractedData,
    };
  }

  // Prepare evidence summary for Kimi (capped to avoid token waste)
  const evidenceSummary = _buildEvidenceSummary(extractedData);

  try {
    const { text } = await kimiComplete(
      SYNTH_SYSTEM,
      [{ role: "user", content: `Goal: ${goal}\n\nEvidence:\n${evidenceSummary}` }],
      600,
    );

    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON");

    const parsed = JSON.parse(m[0]) as {
      answer?: string; keyPoints?: string[]; confidence?: number;
    };

    return {
      answer:     parsed.answer     ?? "Task completed.",
      keyPoints:  parsed.keyPoints  ?? [],
      sources,
      confidence: parsed.confidence ?? baseConf,
      raw:        extractedData,
    };
  } catch {
    // Fallback: surface the most useful extracted field directly
    const fallbackAnswer = _fallbackAnswer(goal, extractedData);
    return {
      answer:     fallbackAnswer,
      keyPoints:  [],
      sources,
      confidence: baseConf * 0.6,
      raw:        extractedData,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _extractSources(data: Record<string, unknown>): string[] {
  const urls = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string" && v.startsWith("http")) urls.add(v.slice(0, 200));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v as object).forEach(walk);
  };
  walk(data);
  return [...urls].slice(0, 10);
}

function _buildEvidenceSummary(data: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, val] of Object.entries(data)) {
    const serialized = typeof val === "string"
      ? val.slice(0, 300)
      : JSON.stringify(val).slice(0, 300);
    lines.push(`[${key}] ${serialized}`);
    if (lines.join("\n").length > 2_000) break;
  }
  return lines.join("\n");
}

function _fallbackAnswer(goal: string, data: Record<string, unknown>): string {
  // Surface page summary if available
  const summary = (data.page_summary as any)?.summary;
  if (summary) return summary;
  // Surface search results count
  const results = (data.search_results as any)?.results;
  if (Array.isArray(results)) return `Found ${results.length} results for: ${goal}`;
  // Surface pricing
  const pricing = (data.pricing as any)?.tiers;
  if (Array.isArray(pricing) && pricing.length > 0) {
    return `Pricing: ${pricing.map((t: any) => `${t.name} ${t.price}/${t.period}`).join(", ")}`;
  }
  return `Task completed: ${goal}`;
}
