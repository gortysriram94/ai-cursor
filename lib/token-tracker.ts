// lib/token-tracker.ts
// Real-time token counting and cost calculation

interface TokenCount {
  input: number;
  output: number;
  total: number;
}

interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  baselineCost: number;   // GPT-4o equivalent — the real comparison
  savedAmount: number;
  savedPercent: number;
}

// Claude Sonnet 4.6 pricing (per 1k tokens)
const SONNET_PRICING = {
  input: 0.003,   // $3 per million
  output: 0.015,  // $15 per million
};

// GPT-4o pricing — used as the honest "traditional" baseline
// (what most users would pay without Pushpa's model routing)
const GPT4O_PRICING = {
  input: 0.005,   // $5 per million
  output: 0.015,  // $15 per million
};

/**
 * Estimate tokens using the standard 4 chars/token heuristic for English prose.
 * (tiktoken cl100k averages ~4 chars/token; ÷3.5 was over-counting by ~14%)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate cost for a single API call and savings vs GPT-4o baseline
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number
): CostBreakdown {
  const inputCost  = (inputTokens  / 1000) * SONNET_PRICING.input;
  const outputCost = (outputTokens / 1000) * SONNET_PRICING.output;
  const totalCost  = inputCost + outputCost;

  // Baseline: same call on GPT-4o (higher input price, same output price)
  const baselineCost =
    (inputTokens  / 1000) * GPT4O_PRICING.input +
    (outputTokens / 1000) * GPT4O_PRICING.output;

  const savedAmount  = Math.max(0, baselineCost - totalCost);
  const savedPercent = baselineCost > 0
    ? (savedAmount / baselineCost) * 100
    : 0;

  return {
    inputCost,
    outputCost,
    totalCost,
    baselineCost,
    savedAmount,
    savedPercent,
  };
}

/**
 * Calculate cost for a conversation message
 */
export function calculateMessageCost(
  userMessage: string,
  assistantResponse: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): CostBreakdown {
  // System prompt is ~184 tokens (measured from actual prompt in chat/route.ts)
  const systemTokens = 184;

  // Only the last 4 messages are sent (matches getRecentContext in conversation-store)
  const historyTokens = conversationHistory
    .slice(-4)
    .reduce((sum, msg) => sum + estimateTokens(msg.content), 0);

  const inputTokens  = systemTokens + historyTokens + estimateTokens(userMessage);
  const outputTokens = estimateTokens(assistantResponse);

  return calculateCost(inputTokens, outputTokens);
}

/**
 * Format currency — shows millidollars for sub-cent amounts
 */
export function formatCurrency(amount: number): string {
  if (amount < 0.01) {
    return `$${(amount * 1000).toFixed(2)}m`;
  }
  return `$${amount.toFixed(4)}`;
}

/**
 * Format token count
 */
export function formatTokens(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
}
