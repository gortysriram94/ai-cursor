// lib/model-selector.ts

/**
 * Available models with their characteristics.
 *
 * Correct API model strings as of 2026:
 *   dracarys-llama-3.1-70b-instruct  (Dracarys Llama 3.1 70B)
 *
 * Claude models (deprecated):
 *   claude-opus-4-6               (latest Opus)
 *   claude-sonnet-4-6             (latest Sonnet — alias, resolves to versioned ID)
 *   claude-haiku-4-5-20251001     (latest Haiku — requires full versioned ID)
 */
export const MODEL_SPECS = {
  // Dracarys Llama 3.1 70B — current default
  "dracarys-llama-3.1-70b-instruct": {
    name: "Dracarys Llama 3.1 70B",
    tier: "dracarys",
    costPer1kInput: 0.0005,
    costPer1kOutput: 0.0005,
    contextWindow: 131072,
    strengths: ["general tasks", "coding", "analysis", "web browsing", "balanced performance"],
    speed: "fast",
  },

  // Opus — most capable
  "claude-opus-4-6": {
    name: "Claude Opus 4.6",
    tier: "opus",
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
    contextWindow: 200000,
    strengths: ["complex reasoning", "creative writing", "deep analysis", "multi-step tasks"],
    speed: "slow",
  },

  // Sonnet — balanced
  "claude-sonnet-4-6": {
    name: "Claude Sonnet 4.6",
    tier: "sonnet",
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    contextWindow: 200000,
    strengths: ["general tasks", "coding", "analysis", "balanced performance"],
    speed: "fast",
  },
  "claude-sonnet-4-5": {
    name: "Claude Sonnet 4.5",
    tier: "sonnet",
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    contextWindow: 200000,
    strengths: ["general tasks", "coding", "data analysis"],
    speed: "fast",
  },

  // Haiku — fastest/cheapest (full versioned ID required by the API)
  "claude-haiku-4-5-20251001": {
    name: "Claude Haiku 4.5",
    tier: "haiku",
    costPer1kInput: 0.0008,
    costPer1kOutput: 0.004,
    contextWindow: 200000,
    strengths: ["simple tasks", "formatting", "extraction", "speed-critical"],
    speed: "fastest",
  },
} as const;

export type ModelId = keyof typeof MODEL_SPECS;

/**
 * Task complexity levels
 */
type TaskComplexity = "simple" | "moderate" | "complex" | "creative";

/**
 * Map task types to complexity and requirements
 */
const TASK_PROFILES = {
  // Simple tasks - Use Haiku
  draft_emails: {
    complexity: "simple" as TaskComplexity,
    preferredTier: "haiku",
    reasoning: "Email drafting is formulaic and fast",
  },
  
  // Moderate tasks - Use Sonnet
  analyze_data: {
    complexity: "moderate" as TaskComplexity,
    preferredTier: "sonnet",
    reasoning: "Data analysis needs balance of speed and capability",
  },
  generate_code: {
    complexity: "moderate" as TaskComplexity,
    preferredTier: "sonnet",
    reasoning: "Code generation benefits from Sonnet's coding skills",
  },
  debug_code: {
    complexity: "moderate" as TaskComplexity,
    preferredTier: "sonnet",
    reasoning: "Debugging needs strong reasoning but not creative",
  },
  create_reports: {
    complexity: "moderate" as TaskComplexity,
    preferredTier: "sonnet",
    reasoning: "Reports need structure and clarity",
  },
  optimize_workflows: {
    complexity: "moderate" as TaskComplexity,
    preferredTier: "sonnet",
    reasoning: "Workflow optimization needs systematic thinking",
  },
  audit_costs: {
    complexity: "moderate" as TaskComplexity,
    preferredTier: "sonnet",
    reasoning: "Cost auditing is analytical but straightforward",
  },
  
  // Complex tasks - Use Opus
  write_content: {
    complexity: "creative" as TaskComplexity,
    preferredTier: "opus",
    reasoning: "Creative writing benefits from Opus quality",
  },
  build_apps: {
    complexity: "complex" as TaskComplexity,
    preferredTier: "opus",
    reasoning: "Full app building requires deep reasoning",
  },
  research_topics: {
    complexity: "complex" as TaskComplexity,
    preferredTier: "opus",
    reasoning: "Research needs comprehensive analysis",
  },
  plan_strategies: {
    complexity: "complex" as TaskComplexity,
    preferredTier: "opus",
    reasoning: "Strategic planning requires deep thinking",
  },
  design_systems: {
    complexity: "complex" as TaskComplexity,
    preferredTier: "opus",
    reasoning: "System design needs architectural reasoning",
  },
};

/**
 * Select optimal model based on task type and user preferences
 */
export function selectOptimalModel(
  taskType: string,
  options: {
    preferSpeed?: boolean;
    preferQuality?: boolean;
    preferCost?: boolean;
    maxCostPer1k?: number;
  } = {}
): ModelId {
  const profile = TASK_PROFILES[taskType as keyof typeof TASK_PROFILES];
  
  if (!profile) {
    // Default to dracarys for unknown tasks
    return "dracarys-llama-3.1-70b-instruct";
  }

  // User explicitly prefers speed
  if (options.preferSpeed) {
    return "dracarys-llama-3.1-70b-instruct";
  }

  // User explicitly prefers quality
  if (options.preferQuality) {
    return "dracarys-llama-3.1-70b-instruct"; // Most capable available
  }

  // User explicitly prefers cost
  if (options.preferCost) {
    return "claude-haiku-4-5-20251001";
  }

  // Cost constraint provided
  if (options.maxCostPer1k) {
    const affordableModels = Object.entries(MODEL_SPECS)
      .filter(([_, model]) => model.costPer1kOutput <= options.maxCostPer1k!)
      .sort((a, b) => b[1].costPer1kOutput - a[1].costPer1kOutput); // Highest cost within budget
    
    if (affordableModels.length > 0) {
      return affordableModels[0][0] as ModelId;
    }
  }

  // Use task profile to select model
    // Use task profile to select model
switch (profile.preferredTier) {
      case "haiku":
      case "sonnet":
      case "opus":
        return "dracarys-llama-3.1-70b-instruct";
      default:
        return "dracarys-llama-3.1-70b-instruct";
    }
  }

/**
 * Select model for each slave node based on its specific task
 */
export function selectModelForStep(
  stepTitle: string,
  stepDescription: string
): ModelId {
  const combined = `${stepTitle} ${stepDescription}`.toLowerCase();

  // ── Haiku: any step that gathers, retrieves, structures, or checks ──────────
  // These steps process information but don't need deep reasoning.
  // Haiku is 73% cheaper than Sonnet and ~76% cheaper than GPT-4o.
  if (
    // Data handling
    combined.includes("extract")      ||
    combined.includes("format")       ||
    combined.includes("parse")        ||
    combined.includes("clean")        ||
    combined.includes("validate")     ||
    combined.includes("load")         ||
    combined.includes("understand")   ||
    combined.includes("profile")      ||
    combined.includes("inventory")    ||
    combined.includes("gather")       ||
    combined.includes("collect")      ||
    combined.includes("categoris")    ||
    combined.includes("categori")     ||
    // Search & retrieval
    combined.includes("search")       ||
    combined.includes("retrieve")     ||
    combined.includes("look up")      ||
    combined.includes("find")         ||
    combined.includes("fetch")        ||
    combined.includes("scan")         ||
    // Verification & checking
    combined.includes("check")        ||
    combined.includes("verify")       ||
    combined.includes("review")       ||
    combined.includes("audit")        ||
    combined.includes("inspect")      ||
    combined.includes("reproduce")    ||
    combined.includes("trace")        ||
    // Preparation steps
    combined.includes("prepar")       ||
    combined.includes("set up")       ||
    combined.includes("map ")         ||
    combined.includes("list ")        ||
    combined.includes("identif")      ||
    combined.includes("benchmark")    ||
    combined.includes("compare")      ||
    combined.includes("rank")         ||
    combined.includes("sort")         ||
    combined.includes("filter")
  ) {
    return "claude-haiku-4-5-20251001";
  }

  // ── Sonnet: coding, implementation, analysis, structured writing ────────────
  if (
    combined.includes("code")         ||
    combined.includes("implement")    ||
    combined.includes("function")     ||
    combined.includes("api")          ||
    combined.includes("debug")        ||
    combined.includes("fix")          ||
    combined.includes("analyz")       ||
    combined.includes("analyse")      ||
    combined.includes("assess")       ||
    combined.includes("evaluat")      ||
    combined.includes("calculat")     ||
    combined.includes("estimat")      ||
    combined.includes("design")       ||
    combined.includes("architect")    ||
    combined.includes("draft")        ||
    combined.includes("write")        ||
    combined.includes("create")       ||
    combined.includes("generate")     ||
    combined.includes("build")        ||
    combined.includes("develop")      ||
    combined.includes("optimiz")      ||
    combined.includes("optimi")
  ) {
    return "claude-sonnet-4-6";
  }

  // ── Sonnet default ───────────────────────────────────────────────────────────
  // Opus is intentionally excluded — it costs more than GPT-4o and erases savings.
  // If a step genuinely needs Opus quality, the user can override via step editing.
  return "claude-sonnet-4-6";
}

/**
 * Calculate estimated cost for a task with dynamic model selection
 */
export function calculateTaskCost(
  taskType: string,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
  modelOverride?: ModelId
): {
  model: ModelId;
  modelName: string;
  inputCost: number;
  outputCost: number;
  totalCost: number;
} {
  const model = modelOverride || selectOptimalModel(taskType);
  const modelInfo = MODEL_SPECS[model];

  const inputCost = (estimatedInputTokens / 1000) * modelInfo.costPer1kInput;
  const outputCost = (estimatedOutputTokens / 1000) * modelInfo.costPer1kOutput;
  const totalCost = inputCost + outputCost;

  return {
    model,
    modelName: modelInfo.name,
    inputCost,
    outputCost,
    totalCost,
  };
}

/**
 * Get model recommendation with reasoning
 */
export function explainModelChoice(taskType: string): {
  model: ModelId;
  modelName: string;
  tier: string;
  reasoning: string;
} {
  const model = selectOptimalModel(taskType);
  const modelInfo = MODEL_SPECS[model];
  const profile = TASK_PROFILES[taskType as keyof typeof TASK_PROFILES];

  return {
    model,
    modelName: modelInfo.name,
    tier: modelInfo.tier,
    reasoning: profile?.reasoning || "Balanced choice for general tasks",
  };
}