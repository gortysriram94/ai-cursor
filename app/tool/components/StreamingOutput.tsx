"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { getKey, hasKey, getConnectedProviders, type Provider } from "@/lib/byok";
import { streamAnalysis, MODEL_RATES, calculateCost } from "@/lib/streaming";
import { VERTICALS, type VerticalId } from "@/lib/verticals";
import CostTicker from "./CostTicker";
import PipelineViz, { type PipelineStage } from "./PipelineViz";

// ── Section card type ─────────────────────────────────────────────────────────
interface SectionCard {
  title:   string;
  content: string;
  locked:  boolean;
}

// ── Chat message type ─────────────────────────────────────────────────────────
interface ChatMessage {
  role:    "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

// ── Model options ─────────────────────────────────────────────────────────────
const MODEL_OPTIONS: {
  id: string; provider: "anthropic" | "openai";
  label: string; providerKey: Provider; recommended?: boolean;
}[] = [
  { id: "claude-3-5-sonnet-20241022", provider: "anthropic", label: "Claude Sonnet 3.5",  providerKey: "anthropic", recommended: true },
  { id: "claude-3-5-haiku-20241022",  provider: "anthropic", label: "Claude Haiku 3.5", providerKey: "anthropic" },
  { id: "gpt-4o",                     provider: "openai",    label: "GPT-4o",           providerKey: "openai"    },
  { id: "gpt-4o-mini",                provider: "openai",    label: "GPT-4o mini",      providerKey: "openai"    },
];

// ── Suggestion chips per vertical ─────────────────────────────────────────────
const SUGGESTIONS: Record<string, string[]> = {
  ux_research:     ["Which finding needs urgent action?", "Summarise for stakeholders", "What patterns repeat most?", "Draft a research brief"],
  trader:          ["What's the biggest risk exposure?", "Summarise for a morning standup", "Which signals are most reliable?", "Suggest a hedge strategy"],
  hr_people:       ["Which attrition signals are strongest?", "Draft an action plan", "What does leadership need to know?", "Compare to industry benchmarks"],
  content_creator: ["Which topics have the most traction?", "Suggest a content calendar", "What's underperforming?", "Draft a pitch from these insights"],
  aws:             ["What's costing the most?", "Where can I cut spend?", "Summarise for engineering lead", "Draft a cost optimisation plan"],
  bigquery:        ["Which queries are the slowest?", "Suggest optimisation steps", "What's driving cost?", "Draft a performance report"],
  general:         ["What's the single most important finding?", "Summarise in 3 bullet points", "What should I investigate next?", "What data is missing?"],
};

function getSuggestions(verticalId: string): string[] {
  return SUGGESTIONS[verticalId] ?? SUGGESTIONS.general;
}

// Rest of the component code...
// (I'll save the complete file)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function StreamingOutput(_props: any) { return null; }
