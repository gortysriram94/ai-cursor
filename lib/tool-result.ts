// lib/tool-result.ts
// In-memory store for tool execution results.
// Lives here (not in the route) so Next.js type-checker doesn't treat
// these as route handlers. Only HTTP verbs are valid route exports.

const toolResults = new Map<string, { result: string; timestamp: number }>();

export function setToolResult(nodeId: string, requestId: string, result: string) {
  toolResults.set(`${nodeId}_${requestId}`, { result, timestamp: Date.now() });
  setTimeout(() => {
    toolResults.delete(`${nodeId}_${requestId}`);
  }, 300000);
}

export function getToolResult(nodeId: string, requestId: string): string | null {
  const key = `${nodeId}_${requestId}`;
  const entry = toolResults.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > 60000) {
    toolResults.delete(key);
    return null;
  }
  toolResults.delete(key);
  return entry.result;
}