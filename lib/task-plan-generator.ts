// lib/task-plan-generator.ts
// @deprecated - imports from lib/deprecated until these are consolidated
import { generateIntelligentPath } from "./deprecated/intelligent-paths";
import { detectTaskType } from "./deprecated/task-handlers";
import { selectModelForStep } from "./model-selector";
import type { TaskPlan, BreadcrumbData, TaskStep } from "@/app/chat/components/TaskApprovalModal";

// Per-1k token rates — exported so the modal can recalculate on edit
export const MODEL_RATES: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6":           { input: 0.015,  output: 0.075  },
  "claude-sonnet-4-6":         { input: 0.003,  output: 0.015  },
  "claude-sonnet-4-5":         { input: 0.003,  output: 0.015  },
  "claude-haiku-4-5-20251001": { input: 0.0008, output: 0.004  },
};

// GPT-4o — the honest baseline ("what you'd pay without TokenLift")
export const GPT4O_RATES = { input: 0.005, output: 0.015 };

/**
 * Estimate typical token usage for a step.
 * Input  = prompt template overhead (~120 tokens) + action text tokens.
 * Output = varies by step type (what the step produces).
 *
 * actionText is included because it's embedded verbatim in the slave prompt —
 * editing a step's action directly changes the input token count.
 */
function estimateStepTokens(
  stepTitle: string,
  modelId: string,
  actionText: string = ""
): { input: number; output: number } {
  const title = stepTitle.toLowerCase();

  // Output tokens scale with what the step produces
  let outputTokens = 600;
  if (title.includes("understand") || title.includes("analyz") || title.includes("review")) outputTokens = 400;
  if (title.includes("write")      || title.includes("draft")  || title.includes("create"))  outputTokens = 800;
  if (title.includes("implement")  || title.includes("code")   || title.includes("build"))   outputTokens = 1000;
  if (title.includes("final")      || title.includes("polish") || title.includes("summary")) outputTokens = 500;
  if (title.includes("validate")   || title.includes("check"))                               outputTokens = 300;

  // Base input: prompt template overhead (differs by model tier due to context size)
  const baseInput = modelId.includes("opus") ? 700 : modelId.includes("haiku") ? 350 : 500;

  // Add tokens from the action text itself (4 chars ≈ 1 token)
  const actionTokens = Math.ceil(actionText.length / 4);

  return { input: baseInput + actionTokens, output: outputTokens };
}

/**
 * Calculate step cost from actual model pricing × estimated tokens.
 * Exported so callers (e.g. the approval modal) can recalculate after an edit.
 */
export function recalculateStepCost(
  stepTitle: string,
  modelId: string,
  actionText: string
): { cost: number; gpt4oCost: number } {
  const rates  = MODEL_RATES[modelId] ?? MODEL_RATES["claude-sonnet-4-6"];
  const tokens = estimateStepTokens(stepTitle, modelId, actionText);
  const cost   = (tokens.input / 1000) * rates.input + (tokens.output / 1000) * rates.output;

  // GPT-4o baseline uses Sonnet-equivalent token counts (no routing advantage)
  const baselineTokens = estimateStepTokens(stepTitle, "claude-sonnet-4-6", actionText);
  const gpt4oCost = (baselineTokens.input / 1000) * GPT4O_RATES.input
                  + (baselineTokens.output / 1000) * GPT4O_RATES.output;

  return { cost, gpt4oCost };
}

/**
 * Extract breadcrumbs from user input
 */
function extractBreadcrumbs(userInput: string, taskType: string): BreadcrumbData {
  const input = userInput.toLowerCase();

  let context = "General task";
  if (input.includes("saas") || input.includes("startup")) context = "SaaS/Startup";
  if (input.includes("enterprise") || input.includes("company")) context = "Enterprise";
  if (input.includes("personal") || input.includes("my")) context = "Personal";
  if (input.includes("team") || input.includes("our")) context = "Team/Collaborative";

  let currentState = "Starting point";
  if (input.match(/\$\d+k?\s*mrr/i)) {
    const match = input.match(/\$(\d+)k?\s*mrr/i);
    currentState = `$${match?.[1]}k MRR`;
  } else if (input.includes("data") || input.includes("csv") || input.includes("file")) {
    currentState = "Raw data available";
  } else if (input.includes("code") || input.includes("bug") || input.includes("error")) {
    currentState = "Code needs fixing";
  } else if (input.includes("need") || input.includes("want")) {
    currentState = "Requirement identified";
  }

  let goalState = "Complete task";
  if (input.includes("analyze") || input.includes("analysis")) goalState = "Analysis complete";
  if (input.includes("write") || input.includes("create") || input.includes("generate")) goalState = "Content created";
  if (input.includes("fix") || input.includes("debug") || input.includes("solve")) goalState = "Issue resolved";
  if (input.includes("build") || input.includes("develop")) goalState = "Solution built";
  if (input.includes("optimize") || input.includes("improve")) goalState = "Optimized";

  const constraints: string[] = [];
  if (input.includes("fast") || input.includes("quick") || input.includes("urgent")) constraints.push("Time-sensitive");
  if (input.includes("cheap") || input.includes("budget") || input.includes("cost")) constraints.push("Cost-conscious");
  if (input.includes("accurate") || input.includes("precise") || input.includes("correct")) constraints.push("High accuracy required");
  if (input.includes("simple") || input.includes("easy")) constraints.push("Simplicity preferred");
  if (constraints.length === 0) constraints.push("Standard quality");

  return { context, currentState, goalState, constraints };
}

/**
 * Generate full task plan with approval data
 */
export function generateTaskPlan(userInput: string): TaskPlan | null {
  const taskType = detectTaskType(userInput);
  if (!taskType) return null;

  const path        = generateIntelligentPath(taskType, userInput);
  const breadcrumbs = extractBreadcrumbs(userInput, taskType);

  const steps: TaskStep[] = path.steps.map((step: any, index: number) => {
    const isFirstOrLast = index === 0 || index === path.steps.length - 1;
    const modelId       = selectModelForStep(step.title, step.description);
    const action        = step.action || step.aiAssistance || "Execute step";
    const { cost }      = recalculateStepCost(step.title, modelId, action);

    return {
      id:           `step_${Date.now()}_${index}`,
      number:       index + 1,
      title:        step.title,
      description:  step.description,
      action,
      cost,
      duration:     index === 0 ? "~30s" : index === path.steps.length - 1 ? "~20s" : "~45s",
      required:     isFirstOrLast,
      userDecision: "approve" as const,
      model:        modelId,
    };
  });

  const totalCost = steps.reduce((sum, s) => sum + s.cost, 0);

  // Baseline: GPT-4o cost per step (no model routing, honest comparison)
  const traditionalCost = steps.reduce((sum, s) => {
    const { gpt4oCost } = recalculateStepCost(s.title, s.model ?? "claude-sonnet-4-6", s.action);
    return sum + gpt4oCost;
  }, 0);

  // Savings can be negative if Opus steps dominate (Opus > GPT-4o).
  // Clamp to zero — we don't show negative savings.
  const savings        = Math.max(0, traditionalCost - totalCost);
  const savingsPercent = traditionalCost > 0
    ? Math.round((savings / traditionalCost) * 100)
    : 0;

  const totalMinutes    = steps.length * 0.75;
  const estimatedDuration = totalMinutes < 1
    ? "< 1 minute"
    : totalMinutes < 5
    ? `~${Math.ceil(totalMinutes)} minutes`
    : `~${Math.ceil(totalMinutes / 5) * 5} minutes`;

  return {
    taskType,
    taskName: path.detectedIntent || "Task",
    breadcrumbs,
    steps,
    totalCost,
    estimatedDuration,
    traditionalCost,
    savings,
    savingsPercent,
  };
}