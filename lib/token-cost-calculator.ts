// lib/token-cost-calculator.ts
// Single source of truth for LLM token pricing.
// All cost calculations — single agent or swarm — must go through here.

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number;
}

const RATES: Record<string, { input: number; output: number; cacheRead?: number }> = {
  "claude-opus-4-6":                   { input: 0.015,  output: 0.075,  cacheRead: 0.30 },
  "claude-sonnet-4-6":                 { input: 0.003,  output: 0.015,  cacheRead: 0.30 },
  "claude-sonnet-4-5":                 { input: 0.003,  output: 0.015,  cacheRead: 0.30 },
  "claude-sonnet-4-20250514":          { input: 0.003,  output: 0.015,  cacheRead: 0.30 },
  "claude-haiku-4-5-20251001":         { input: 0.0008, output: 0.004, cacheRead: 0.03 },
  "claude-3-5-sonnet-20240620":        { input: 0.003,  output: 0.015,  cacheRead: 0.30 },
  "claude-3-5-haiku-20241022":         { input: 0.00025, output: 0.00125, cacheRead: 0.03 },
  "dracarys-llama-3.1-70b-instruct":   { input: 0.0005, output: 0.0005, cacheRead: 0 },
};

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

const DEFAULT_RATE = RATES[DEFAULT_MODEL]!;

export function calculateCost(model: string, usage: TokenUsage): number {
  const r = RATES[model] ?? DEFAULT_RATE;
  const inputCost  = (usage.input       / 1e6) * r.input;
  const outputCost = (usage.output       / 1e6) * r.output;
  const cacheCost  = ((usage.cacheRead ?? 0) / 1e6) * (r.cacheRead ?? 0);
  return inputCost + outputCost + cacheCost;
}

export function getRate(model: string): { input: number; output: number; cacheRead?: number } {
  return RATES[model] ?? DEFAULT_RATE;
}

export function getAvailableModels(): string[] {
  return Object.keys(RATES);
}