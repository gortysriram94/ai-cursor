// lib/agent-store.ts — in-memory agent state store
// Single source of truth for the connected Electron agent.
// Written by /api/agent/handshake and /api/agent/heartbeat.
// Read by /api/agent/health and the UI status component.

export interface AgentState {
  agentId:           string;
  sessionId:         string;
  version:           string;
  capabilities:      string[];
  lastHeartbeat:     number;
  connectedAt:       number;
  heartbeatInterval: number;
  activeTab?:        string;
  currentTask?:      string;
}

// Survive Next.js hot reloads in dev mode — module-level vars reset on reload,
// but globalThis persists for the lifetime of the Node.js process.
const g = globalThis as typeof globalThis & { __agentState?: AgentState | null };

export function setAgent(state: AgentState): void {
  g.__agentState = state;
}

export function updateAgent(patch: Partial<AgentState>): void {
  if (g.__agentState) g.__agentState = { ...g.__agentState, ...patch };
}

export function getAgent(): AgentState | null {
  return g.__agentState ?? null;
}

export function clearAgent(): void {
  g.__agentState = null;
}

// Derived status based on heartbeat staleness
export function getAgentStatus(): "connected" | "reconnecting" | "disconnected" {
  const agent = g.__agentState;
  if (!agent) return "disconnected";
  const age = Date.now() - agent.lastHeartbeat;
  if (age < 12_000)  return "connected";
  if (age < 45_000)  return "reconnecting";
  return "disconnected";
}
