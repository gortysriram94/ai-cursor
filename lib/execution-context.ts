// lib/execution-context.ts
// Lightweight execution context registry — survives Next.js hot-reloads via globalThis.
//
// PURPOSE
//   Answers: "given a taskId, what is the current execution state?"
//   This is NOT a store. Authoritative state still lives in events (SSE / WS / tool-result).
//   The context is a lookup index that makes state queryable without re-playing events.
//
// CONTEXT PROPAGATION MAP
//   POST /api/workflow  → create context (manifest_ready)
//   WorkflowEngine emit → update step / totalSteps / authState
//   runBrowser navigate → update currentUrl
//   handleAuth          → update authState: required → complete
//   workflow_complete   → delete context
//   workflow_failed     → delete context
//   GET  /api/context   → query by taskId or nodeId (debugging / health)
//
// OWNERSHIP RULES
//   taskId    : owned by WorkflowEngine (= manifest.id, created in plan())
//   nodeId    : owned by canvas (= agent node ID, from POST /api/workflow body)
//   agentId   : owned by Electron (= agent.agentId from agent-store)
//   currentUrl: owned by Electron (updated after every navigation)
//   authState : owned by auth bridge (handleAuth in workflow route)
//   step      : owned by WorkflowEngine event stream (increments on step_start)

export interface ExecutionContext {
  nodeId:     string;   // canvas agent node that receives SSE workflow events
  taskId:     string;   // manifest.id — unique per workflow run
  agentId:    string;   // Electron agent driving the browser
  currentUrl: string;   // last URL confirmed by Electron after navigation
  authState:  "none" | "required" | "complete";
  step:       number;   // 0-indexed — which step is currently executing
  totalSteps: number;
  startedAt:  number;
  updatedAt:  number;
}

const g = globalThis as typeof globalThis & {
  __executionContexts?: Map<string, ExecutionContext>;
};
if (!g.__executionContexts) g.__executionContexts = new Map();

export const executionContexts: Map<string, ExecutionContext> = g.__executionContexts;

const TTL_MS = 30 * 60 * 1_000; // 30 min

export function createContext(ctx: Omit<ExecutionContext, "startedAt" | "updatedAt">): ExecutionContext {
  const now = Date.now();
  const full: ExecutionContext = { ...ctx, startedAt: now, updatedAt: now };
  executionContexts.set(ctx.taskId, full);
  return full;
}

export function getContext(taskId: string): ExecutionContext | undefined {
  return executionContexts.get(taskId);
}

export function updateContext(taskId: string, patch: Partial<ExecutionContext>): ExecutionContext | null {
  const ctx = executionContexts.get(taskId);
  if (!ctx) return null;
  const updated: ExecutionContext = { ...ctx, ...patch, updatedAt: Date.now() };
  executionContexts.set(taskId, updated);
  return updated;
}

export function deleteContext(taskId: string): void {
  executionContexts.delete(taskId);
}

// Reverse-lookup: find context by canvas nodeId (one execution per node at a time)
export function getContextByNodeId(nodeId: string): ExecutionContext | undefined {
  for (const ctx of executionContexts.values()) {
    if (ctx.nodeId === nodeId) return ctx;
  }
}

// Remove contexts that haven't been touched in TTL_MS — called lazily on create
export function pruneStale(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, ctx] of executionContexts.entries()) {
    if (ctx.updatedAt < cutoff) executionContexts.delete(id);
  }
}
