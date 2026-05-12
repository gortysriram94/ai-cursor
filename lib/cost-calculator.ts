// lib/cost-calculator.ts
// Comparative cost calculation — shows savings vs raw Claude usage

export interface CostBreakdown {
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  rawInputTokens: number;
  rawTotalCost: number;
  tokensSaved: number;
  tokensReductionPct: number;
  costSaved: number;
  costReductionPct: number;
  optimizations: {
    step: string;
    savedTokens: number;
    savedCost: number;
  }[];
}

const SONNET_INPUT_PRICE = 3 / 1_000_000;
const SONNET_OUTPUT_PRICE = 15 / 1_000_000;

export function calculateCost(params: {
  originalRowCount: number;
  cleanedRowCount: number;
  originalColumns: number;
  cleanedColumns: number;
  summarized: boolean;
  promptOptimized: boolean;
  estimatedOutputTokens?: number;
}): CostBreakdown {
  const {
    originalRowCount,
    cleanedRowCount,
    originalColumns,
    cleanedColumns,
    summarized,
    promptOptimized,
    estimatedOutputTokens = 2000,
  } = params;

  // Raw usage (no optimization)
  const rawInputTokens = originalRowCount * originalColumns * 25 + 500;
  const rawOutputTokens = estimatedOutputTokens;
  const rawTotalCost = rawInputTokens * SONNET_INPUT_PRICE + rawOutputTokens * SONNET_OUTPUT_PRICE;

  // Optimized
  let inputTokens = 0;
  const optimizations: { step: string; savedTokens: number; savedCost: number }[] = [];

  // Deduplication
  const dedupSaved = originalRowCount - cleanedRowCount;
  const dedupTokens = dedupSaved * originalColumns * 25;
  if (dedupSaved > 0) {
    optimizations.push({
      step: "Deduplication",
      savedTokens: dedupTokens,
      savedCost: dedupTokens * SONNET_INPUT_PRICE,
    });
  }

  // Summarization
  if (summarized) {
    const summaryTokens = cleanedColumns * 100 + 350;
    const fullDataTokens = cleanedRowCount * cleanedColumns * 25;
    const summarySaved = fullDataTokens - summaryTokens;
    inputTokens = summaryTokens;
    optimizations.push({
      step: "Summarization",
      savedTokens: summarySaved,
      savedCost: summarySaved * SONNET_INPUT_PRICE,
    });
  } else {
    inputTokens = cleanedRowCount * cleanedColumns * 25;
  }

  // Prompt optimization
  if (promptOptimized) {
    inputTokens += 180;
    optimizations.push({
      step: "Prompt optimization",
      savedTokens: 320,
      savedCost: 320 * SONNET_INPUT_PRICE,
    });
  } else {
    inputTokens += 500;
  }

  const outputTokens = estimatedOutputTokens;
  const totalCost = inputTokens * SONNET_INPUT_PRICE + outputTokens * SONNET_OUTPUT_PRICE;

  const tokensSaved = rawInputTokens - inputTokens;
  const tokensReductionPct = (tokensSaved / rawInputTokens) * 100;
  const costSaved = rawTotalCost - totalCost;
  const costReductionPct = (costSaved / rawTotalCost) * 100;

  return {
    inputTokens,
    outputTokens,
    totalCost,
    rawInputTokens,
    rawTotalCost,
    tokensSaved,
    tokensReductionPct,
    costSaved,
    costReductionPct,
    optimizations,
  };
}

export function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return tokens.toString();
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}
