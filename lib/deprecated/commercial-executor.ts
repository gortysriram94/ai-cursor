// lib/commercial-executor.ts
// Commercial-grade task execution system

interface ExecutionConfig {
  maxRetries: number;
  retryDelay: number;
  timeout: number;
  enableCaching: boolean;
  enableLogging: boolean;
}

interface ExecutionMetrics {
  startTime: number;
  endTime?: number;
  totalTokens: number;
  totalCost: number;
  nodesExecuted: number;
  nodesFailed: number;
  retries: number;
}

interface SlaveNode {
  id: string;
  name: string;
  description: string;
  prompt: string;
  model?: string;        // which Claude model to use — defaults to Sonnet if absent
  isFinalStep?: boolean; // final steps get full 4096 token budget; intermediates are capped
  status: "pending" | "active" | "complete" | "failed" | "retrying";
  input?: any;
  output?: any;
  cost?: number;
  tokens?: { input: number; output: number };
  error?: string;
  retryCount: number;
  startTime?: number;
  endTime?: number;
}

interface MasterNode {
  id: string;
  userId: string;
  taskType: string;
  taskName: string;
  goal: string;
  context: string;
  slaveNodes: SlaveNode[];
  status: "pending" | "planning" | "executing" | "complete" | "failed" | "cancelled";
  metrics: ExecutionMetrics;
  config: ExecutionConfig;
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_CONFIG: ExecutionConfig = {
  maxRetries: 3,
  retryDelay: 2000,
  timeout: 60000,
  enableCaching: true,
  enableLogging: true,
};

/**
 * Commercial-grade executor with retries, error handling, and monitoring
 */
export class CommercialExecutor {
  private config: ExecutionConfig;
  private abortController: AbortController;
  private cache: Map<string, any> = new Map();

  constructor(config: Partial<ExecutionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.abortController = new AbortController();
  }

  /**
   * Execute master node with full commercial features
   */
  async execute(
    master: MasterNode,
    apiKey: string,
    onProgress?: (update: Partial<MasterNode>) => void
  ): Promise<MasterNode> {
    master.status = "executing";
    master.metrics.startTime = Date.now();
    master.updatedAt = Date.now();

    try {
      // Execute each slave node sequentially
      for (let i = 0; i < master.slaveNodes.length; i++) {
        if (this.abortController.signal.aborted) {
          master.status = "cancelled";
          break;
        }

        const node = master.slaveNodes[i];
        
        // Update node status
        node.status = "active";
        node.startTime = Date.now();
        onProgress?.(master);

        // Execute with retries
        const result = await this.executeNodeWithRetry(node, apiKey);
        master.slaveNodes[i] = result;

        // Update metrics
        master.metrics.totalTokens += (result.tokens?.input || 0) + (result.tokens?.output || 0);
        master.metrics.totalCost += result.cost || 0;
        
        if (result.status === "complete") {
          master.metrics.nodesExecuted++;
        } else if (result.status === "failed") {
          master.metrics.nodesFailed++;
          
          // Stop on critical failure
          if (this.isCriticalNode(node)) {
            master.status = "failed";
            break;
          }
        }

        // Notify progress
        onProgress?.(master);

        // Activate next node
        if (i < master.slaveNodes.length - 1) {
          master.slaveNodes[i + 1].status = "pending";
        }
      }

      // Set final status
      if (master.status !== "cancelled" && master.status !== "failed") {
        master.status = "complete";
      }

    } catch (error: any) {
      master.status = "failed";
      this.log("error", `Master execution failed: ${error.message}`, master);
    }

    master.metrics.endTime = Date.now();
    master.updatedAt = Date.now();

    // Save to database
    await this.saveMasterNode(master);

    return master;
  }

  /**
   * Execute single node with retry logic
   */
  private async executeNodeWithRetry(
    node: SlaveNode,
    apiKey: string
  ): Promise<SlaveNode> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          node.status = "retrying";
          node.retryCount = attempt;
          await this.delay(this.config.retryDelay * attempt);
        }

        // Check cache
        const cacheKey = this.getCacheKey(node);
        if (this.config.enableCaching && this.cache.has(cacheKey)) {
          const cached = this.cache.get(cacheKey);
          return { ...node, ...cached, status: "complete" };
        }

        // Execute node
        const result = await this.executeNode(node, apiKey);

        // Cache successful result
        if (this.config.enableCaching && result.status === "complete") {
          this.cache.set(cacheKey, {
            output: result.output,
            cost: result.cost,
            tokens: result.tokens,
          });
        }

        return result;

      } catch (error: any) {
        lastError = error;
        this.log("warn", `Node ${node.name} failed (attempt ${attempt + 1}): ${error.message}`, node);

        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          break;
        }
      }
    }

    // All retries failed
    node.status = "failed";
    node.error = lastError?.message || "Execution failed after retries";
    node.endTime = Date.now();
    return node;
  }

  /**
   * Execute single node (core execution logic)
   */
  private async executeNode(
    node: SlaveNode,
    apiKey: string
  ): Promise<SlaveNode> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      // Use the model assigned to this step by selectModelForStep.
      // Fall back to Sonnet if not set (e.g. legacy callers).
      const model = node.model ?? "claude-sonnet-4-20250514";

      // Intermediate steps only need enough tokens to produce a structured
      // hand-off to the next step — cap at 1200 to reduce cost.
      // Final steps (synthesis, recommendations, reports) get the full budget.
      const maxTokens = node.isFinalStep ? 4096 : 1200;

      // Browser tasks get tool use — others get plain text
      const isBrowserTask = node.prompt?.includes("[BROWSER_TASK]");
      let browserTools = undefined;
      if (isBrowserTask) {
        const { BROWSER_TOOLS } = await import("../browser-tools");
        browserTools = BROWSER_TOOLS;
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          ...(browserTools ? { tools: browserTools } : {}),
          messages: [{ role: "user", content: node.prompt }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json();
      
      node.output = data.content[0].text;
      node.tokens = {
        input: data.usage.input_tokens,
        output: data.usage.output_tokens,
      };
      node.cost = this.calculateCost(node.tokens, model);
      node.status = "complete";
      node.endTime = Date.now();

      return node;

    } catch (error: any) {
      clearTimeout(timeout);
      
      if (error.name === "AbortError") {
        throw new Error("Request timeout");
      }
      
      throw error;
    }
  }

  /**
   * Calculate cost in dollars based on the model actually used
   */
  private calculateCost(tokens: { input: number; output: number }, model: string): number {
    // Per-1k token rates for each model
    const rates: Record<string, { input: number; output: number }> = {
      "claude-opus-4-6":          { input: 0.015,  output: 0.075  },
      "claude-sonnet-4-6":        { input: 0.003,  output: 0.015  },
      "claude-sonnet-4-5":        { input: 0.003,  output: 0.015  },
      "claude-sonnet-4-20250514": { input: 0.003,  output: 0.015  },
      "claude-haiku-4-5-20251001":{ input: 0.0008, output: 0.004  },
    };
    const r = rates[model] ?? rates["claude-sonnet-4-6"];
    return (tokens.input / 1000) * r.input + (tokens.output / 1000) * r.output;
  }

  /**
   * Generate cache key for node
   */
  private getCacheKey(node: SlaveNode): string {
    return `node:${node.name}:${this.hashString(node.prompt)}`;
  }

  /**
   * Simple string hash
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Check if error should not be retried
   */
  private isNonRetryableError(error: any): boolean {
    const nonRetryable = [
      "invalid_api_key",
      "invalid_request_error",
      "permission_denied",
      "insufficient_quota",
    ];
    
    return nonRetryable.some(type => 
      error.message?.toLowerCase().includes(type.replace(/_/g, " "))
    );
  }

  /**
   * Check if node is critical (failure stops execution)
   */
  private isCriticalNode(node: SlaveNode): boolean {
    // First node and data understanding nodes are critical
    return node.name.toLowerCase().includes("understanding") ||
           node.name.toLowerCase().includes("analysis") ||
           node.name.toLowerCase().includes("requirements");
  }

  /**
   * Logging utility
   */
  private log(level: "info" | "warn" | "error", message: string, context?: any) {
    if (!this.config.enableLogging) return;

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      context: context?.id || context?.name,
    };

    console[level](JSON.stringify(logEntry));

    // TODO: Send to monitoring service (Sentry, LogRocket, etc.)
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cancel execution
   */
  cancel() {
    this.abortController.abort();
  }

  /**
   * Save master node to database
   */
  private async saveMasterNode(master: MasterNode): Promise<void> {
    try {
      // TODO: Save to actual database (Supabase, Postgres, etc.)
      // For now, just log
      this.log("info", `Saving master node ${master.id}`, master);

      // Example structure for database save:
      /*
      await db.masterNodes.upsert({
        where: { id: master.id },
        data: {
          userId: master.userId,
          taskType: master.taskType,
          status: master.status,
          metrics: master.metrics,
          slaveNodes: {
            upsert: master.slaveNodes.map(node => ({
              where: { id: node.id },
              data: node
            }))
          },
          updatedAt: new Date()
        }
      });
      */
    } catch (error) {
      this.log("error", `Failed to save master node: ${error instanceof Error ? error.message : String(error)}`, master);
    }
  }

  /**
   * Load master node from database
   */
  static async load(masterId: string): Promise<MasterNode | null> {
    try {
      // TODO: Load from actual database
      // const master = await db.masterNodes.findUnique({ where: { id: masterId } });
      // return master;
      return null;
    } catch (error) {
      console.error("Failed to load master node:", error);
      return null;
    }
  }
}

/**
 * Rate limiter for API calls
 */
export class RateLimitError extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(`Rate limit exceeded. Retry after ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class RateLimiter {
  private requests: number[] = [];
  private limit: number;
  private window: number;

  constructor(limit: number = 50, windowMs: number = 60000) {
    this.limit = limit;
    this.window = windowMs;
  }

  /** Throws RateLimitError if the limit is exceeded (never waits — unsuitable for serverless). */
  checkLimit(): void {
    const now = Date.now();

    // Remove requests outside the rolling window
    this.requests = this.requests.filter(time => now - time < this.window);

    if (this.requests.length >= this.limit) {
      const oldestRequest = this.requests[0];
      const retryAfterMs = this.window - (now - oldestRequest);
      throw new RateLimitError(retryAfterMs > 0 ? retryAfterMs : 1000);
    }

    this.requests.push(now);
  }
}

/**
 * Progress tracker for UI updates
 */
export class ProgressTracker {
  private callbacks: Array<(progress: number) => void> = [];

  onProgress(callback: (progress: number) => void) {
    this.callbacks.push(callback);
  }

  updateProgress(completed: number, total: number) {
    const progress = Math.round((completed / total) * 100);
    this.callbacks.forEach(cb => cb(progress));
  }
}

/**
 * Export types
 */
export type { SlaveNode, MasterNode, ExecutionConfig, ExecutionMetrics };