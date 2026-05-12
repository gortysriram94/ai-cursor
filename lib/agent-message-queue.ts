// lib/agent-message-queue.ts
// Per-node message injection queue for live agent conversation.
// Users send messages while an agent is running; the agent reads
// and incorporates them between tool calls for real-time steering.

const queues = new Map<string, string[]>();

export function pushAgentMessage(nodeId: string, message: string) {
  const q = queues.get(nodeId) ?? [];
  q.push(message);
  queues.set(nodeId, q);
}

export function drainAgentMessages(nodeId: string): string[] {
  const msgs = queues.get(nodeId) ?? [];
  queues.delete(nodeId);
  return msgs;
}
