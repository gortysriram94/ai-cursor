// lib/tool-call.ts
// In-memory store for pending tool calls waiting for client execution.
// Lives here (not in the route) so Next.js type-checker doesn't treat
// these as route handlers. Only HTTP verbs are valid route exports.

const pendingToolCalls = new Map<string, { toolName: string; toolInput: any; requestId: string; createdAt: number }>();

export function addToolCall(nodeId: string, toolName: string, toolInput: any, requestId: string) {
  pendingToolCalls.set(nodeId, { toolName, toolInput, requestId, createdAt: Date.now() });
  setTimeout(() => {
    if (pendingToolCalls.get(nodeId)?.requestId === requestId) {
      pendingToolCalls.delete(nodeId);
    }
  }, 300000);
}

export function getToolCall(nodeId: string): { toolName: string; toolInput: any; requestId: string } | null {
  const call = pendingToolCalls.get(nodeId);
  if (!call) return null;
  if (Date.now() - call.createdAt > 60000) {
    pendingToolCalls.delete(nodeId);
    return null;
  }
  return { toolName: call.toolName, toolInput: call.toolInput, requestId: call.requestId };
}

export function clearToolCall(nodeId: string, requestId: string) {
  const call = pendingToolCalls.get(nodeId);
  if (call?.requestId === requestId) {
    pendingToolCalls.delete(nodeId);
  }
}