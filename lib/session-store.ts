// lib/session-store.ts
// Persists agent/chat sessions to IndexedDB via idb-keyval.
// Canvas positions are handled separately by the vault (localStorage).
// Only agent + chat nodes are persisted here — browser nodes are ephemeral.

import { get, set, del, keys } from "idb-keyval";

const PREFIX = "tl_session:";

export interface PersistedSession {
  id:              string;
  kind:            "agent" | "chat";
  title:           string;
  x: number; y: number; w: number; h: number;
  collapsed?:      boolean;
  // chat
  msgs?:           Array<{ id: string; role: "user"|"assistant"; content: string; loading: boolean; tokens?: number }>;
  // agent
  agentTask?:      string;
  agentStatus?:    string;
  agentSteps?:     number;
  toolCalls?:      Array<{ id: string; tool: string; input: Record<string,string>; result?: string; status: string }>;
  quests?:         Array<{ id: string; label: string; agent: string; status: string }>;
  inputTokens?:    number;
  outputTokens?:   number;
  cacheReadTokens?: number;
  costUsd?:        number;
  savedAt:         number;
}

export async function saveSession(s: PersistedSession): Promise<void> {
  await set(PREFIX + s.id, { ...s, savedAt: Date.now() });
}

export async function loadAllSessions(): Promise<PersistedSession[]> {
  try {
    const all = await keys();
    const sessionKeys = all.filter(k => String(k).startsWith(PREFIX));
    const sessions = await Promise.all(sessionKeys.map(k => get<PersistedSession>(k)));
    return (sessions.filter(Boolean) as PersistedSession[])
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch { return []; }
}

export async function deleteSession(id: string): Promise<void> {
  await del(PREFIX + id);
}

export async function clearAllSessions(): Promise<void> {
  const all = await keys();
  await Promise.all(
    all.filter(k => String(k).startsWith(PREFIX)).map(k => del(k))
  );
}
