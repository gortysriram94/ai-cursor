// lib/pricing.ts
// Credit-based pricing system with 3x markup (67% profit margin)

// ============================================
// COST CALCULATION
// ============================================

export const COST_STRUCTURE = {
  // Claude Vision API costs (actual)
  VISION_INPUT_COST_PER_1M: 3.00,      // $3 per 1M input tokens
  VISION_OUTPUT_COST_PER_1M: 15.00,    // $15 per 1M output tokens
  
  // Average tokens per Vision call
  AVG_INPUT_TOKENS: 2200,              // Screenshot + prompt
  AVG_OUTPUT_TOKENS: 100,              // JSON response
  
  // Calculated cost per Vision call
  get COST_PER_VISION_CALL() {
    const inputCost = (this.AVG_INPUT_TOKENS / 1_000_000) * this.VISION_INPUT_COST_PER_1M;
    const outputCost = (this.AVG_OUTPUT_TOKENS / 1_000_000) * this.VISION_OUTPUT_COST_PER_1M;
    return inputCost + outputCost; // ~$0.0081
  },
  
  // Average Vision calls per task
  AVG_VISION_CALLS_PER_TASK: 20,
  
  // Total cost per task
  get ACTUAL_COST_PER_TASK() {
    return this.COST_PER_VISION_CALL * this.AVG_VISION_CALLS_PER_TASK; // ~$0.162
  }
};

// ============================================
// MARKUP & PROFIT (3x = 67% profit margin)
// ============================================

export const MARKUP_MULTIPLIER = 3; // 3x markup = 67% profit

export const CREDITS_PER_TASK = 49; // $0.49 per task (3x of $0.162)

export const PROFIT_MARGIN = ((MARKUP_MULTIPLIER - 1) / MARKUP_MULTIPLIER) * 100; // 67%

// ============================================
// CREDIT TIERS
// ============================================

export const CREDIT_TIERS = {
  TRIAL: {
    id: 'trial',
    name: 'Trial',
    price: 0.99,
    credits: 99,
    tasks: 2, // User gets 2 tasks
    description: 'Try it out - First 2 tasks',
    isLossLeader: true,
    features: [
      '2 automation tasks',
      'Full AI Vision access',
      'Works on any website',
      'No commitment'
    ]
  },
  
  STARTER: {
    id: 'starter',
    name: 'Starter',
    price: 19,
    credits: 2000,
    tasks: 40, // ~40 tasks
    description: 'Perfect for individuals',
    pricePerTask: 0.475,
    profit: 12.60, // 67% of $19
    mostPopular: false,
    features: [
      '~40 automation tasks',
      'Works on any website',
      'Real-time AI Vision',
      'Email support',
      'Credits never expire'
    ]
  },
  
  PRO: {
    id: 'pro',
    name: 'Pro',
    price: 49,
    credits: 5500,
    tasks: 112, // ~112 tasks
    description: 'For power users',
    pricePerTask: 0.438,
    discount: 12, // 12% bulk discount
    profit: 32.67, // 67% of $49
    mostPopular: true,
    badge: 'Most Popular',
    features: [
      '~112 automation tasks',
      '12% bulk discount',
      'Priority support',
      'Advanced error recovery',
      'Cost analytics',
      'Credits never expire'
    ]
  },
  
  BUSINESS: {
    id: 'business',
    name: 'Business',
    price: 99,
    credits: 12000,
    tasks: 244, // ~244 tasks
    description: 'For teams',
    pricePerTask: 0.406,
    discount: 17, // 17% bulk discount
    profit: 66.33, // 67% of $99
    mostPopular: false,
    features: [
      '~244 automation tasks',
      '17% bulk discount',
      'Team collaboration',
      'Priority support',
      'API access',
      'Credits never expire'
    ]
  },
  
  ENTERPRISE: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 199,
    credits: 25000,
    tasks: 510, // ~510 tasks
    description: 'Maximum value',
    pricePerTask: 0.390,
    discount: 20, // 20% bulk discount
    profit: 133.33, // 67% of $199
    mostPopular: false,
    badge: 'Best Value',
    features: [
      '~510 automation tasks',
      '20% bulk discount',
      'Dedicated support',
      'Custom integrations',
      'SLA guarantee',
      'Volume discounts',
      'Credits never expire'
    ]
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert credits to tasks
 */
export function creditsToTasks(credits: number): number {
  return Math.floor(credits / CREDITS_PER_TASK);
}

/**
 * Convert tasks to credits needed
 */
export function tasksToCredits(tasks: number): number {
  return tasks * CREDITS_PER_TASK;
}

/**
 * Get cost for a specific task type
 */
export function getTaskCost(taskType?: string): number {
  // All tasks cost the same (Vision-based)
  return CREDITS_PER_TASK;
}

/**
 * Calculate actual cost for given Vision calls
 */
export function calculateActualCost(visionCalls: number): number {
  return visionCalls * COST_STRUCTURE.COST_PER_VISION_CALL;
}

/**
 * Calculate profit from a task
 */
export function calculateTaskProfit(actualCost: number): number {
  const userPaid = CREDITS_PER_TASK / 100; // Convert credits to dollars
  return userPaid - actualCost;
}

/**
 * Get tier by ID
 */
export function getTier(tierId: string) {
  return Object.values(CREDIT_TIERS).find(tier => tier.id === tierId);
}

/**
 * Check if user has enough credits
 */
export function hasEnoughCredits(userCredits: number, tasksNeeded: number = 1): boolean {
  return userCredits >= tasksToCredits(tasksNeeded);
}

/**
 * Format credits for display
 */
export function formatCredits(credits: number): string {
  return `${credits.toLocaleString()} credits`;
}

/**
 * Format price for display
 */
export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

/**
 * Get tier recommendation based on usage
 */
export function recommendTier(estimatedTasksPerMonth: number) {
  if (estimatedTasksPerMonth <= 40) return CREDIT_TIERS.STARTER;
  if (estimatedTasksPerMonth <= 112) return CREDIT_TIERS.PRO;
  if (estimatedTasksPerMonth <= 244) return CREDIT_TIERS.BUSINESS;
  return CREDIT_TIERS.ENTERPRISE;
}

/**
 * Calculate effective price per task for a tier
 */
export function getEffectivePricePerTask(tier: typeof CREDIT_TIERS[keyof typeof CREDIT_TIERS]): number {
  return tier.price / tier.tasks;
}

/**
 * Get all tiers as array
 */
export function getAllTiers() {
  return Object.values(CREDIT_TIERS).filter(t => t.id !== 'trial');
}

/**
 * Get cost summary for task approval
 */
export function getTaskCostSummary() {
  return {
    credits: CREDITS_PER_TASK,
    dollars: CREDITS_PER_TASK / 100,
    estimatedCost: COST_STRUCTURE.ACTUAL_COST_PER_TASK,
    estimatedProfit: (CREDITS_PER_TASK / 100) - COST_STRUCTURE.ACTUAL_COST_PER_TASK,
    profitMargin: PROFIT_MARGIN,
    display: {
      credits: `${CREDITS_PER_TASK} credits`,
      price: formatPrice(CREDITS_PER_TASK / 100)
    }
  };
}
