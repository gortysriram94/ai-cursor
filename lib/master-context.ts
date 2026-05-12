// lib/master-context.ts
// Master node — persistent memory across breadcrumbs

import type { VerticalId } from "./verticals";

export interface MasterContext {
  sessionId: string;
  verticalId: VerticalId;
  createdAt: number;
  updatedAt: number;
  primaryGoal: string;
  dataSchema: {
    fileName: string;
    rowCount: number;
    columns: string[];
  } | null;
  completedActions: {
    id: string;
    action: string;
    tool: string;
    result: string;
    timestamp: number;
  }[];
  currentFocus: string;
  lastUserMessage: string;
}

const STORAGE_KEY_PREFIX = "tl_master_";

export function createMasterContext(
  sessionId: string,
  verticalId: VerticalId,
  primaryGoal: string
): MasterContext {
  return {
    sessionId,
    verticalId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    primaryGoal,
    dataSchema: null,
    completedActions: [],
    currentFocus: primaryGoal,
    lastUserMessage: primaryGoal,
  };
}

export function updateMasterContext(
  master: MasterContext,
  update: {
    action?: string;
    tool?: string;
    result?: string;
    dataSchema?: MasterContext["dataSchema"];
    currentFocus?: string;
    lastUserMessage?: string;
  }
): MasterContext {
  const updated = { ...master, updatedAt: Date.now() };

  if (update.action && update.tool && update.result) {
    updated.completedActions = [
      ...master.completedActions,
      {
        id: `action_${Date.now()}`,
        action: update.action,
        tool: update.tool,
        result: update.result.slice(0, 200),
        timestamp: Date.now(),
      },
    ];

    if (updated.completedActions.length > 10) {
      updated.completedActions = updated.completedActions.slice(-10);
    }
  }

  if (update.dataSchema) updated.dataSchema = update.dataSchema;
  if (update.currentFocus) updated.currentFocus = update.currentFocus;
  if (update.lastUserMessage) updated.lastUserMessage = update.lastUserMessage;

  return updated;
}

export function masterContextToPrompt(master: MasterContext): string {
  const parts: string[] = [];

  parts.push(`[SESSION CONTEXT]`);
  parts.push(`Goal: ${master.primaryGoal}`);
  parts.push(`Current focus: ${master.currentFocus}`);
  parts.push(``);

  if (master.dataSchema) {
    parts.push(`[DATA]`);
    parts.push(`File: ${master.dataSchema.fileName} (${master.dataSchema.rowCount} rows)`);
    parts.push(`Columns: ${master.dataSchema.columns.join(", ")}`);
    parts.push(``);
  }

  if (master.completedActions.length > 0) {
    parts.push(`[COMPLETED ACTIONS]`);
    master.completedActions.forEach((a) => {
      parts.push(`✓ ${a.action} → ${a.result}`);
    });
    parts.push(``);
  }

  parts.push(`[LAST USER MESSAGE]`);
  parts.push(master.lastUserMessage);

  return parts.join("\n");
}

export function saveMasterContext(master: MasterContext): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}${master.sessionId}`;
    localStorage.setItem(key, JSON.stringify(master));
  } catch (err) {
    console.error("Failed to save master context:", err);
  }
}

export function loadMasterContext(sessionId: string): MasterContext | null {
  try {
    const key = `${STORAGE_KEY_PREFIX}${sessionId}`;
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch (err) {
    console.error("Failed to load master context:", err);
    return null;
  }
}
