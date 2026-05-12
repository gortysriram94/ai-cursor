// lib/store.ts
// ─────────────────────────────────────────────────────────────────────────────
// Universal browser-side store.
// ALL user data lives here — zero server storage, zero cookies, zero auth.
// Uses IndexedDB via idb-keyval for structured data.
// Uses OPFS (Origin Private File System) for large file blobs.
// ─────────────────────────────────────────────────────────────────────────────

import { get, set, del, keys, createStore } from "idb-keyval";

// ── Typed stores (separate IndexedDB object stores) ──────────────────────────

const workflowStore   = createStore("tl-workflows",   "workflows");
const sessionStore    = createStore("tl-sessions",    "sessions");
const settingsStore   = createStore("tl-settings",    "settings");
const fileStore       = createStore("tl-files",       "files");
const chatStore       = createStore("tl-chat",        "messages");
const marketStore     = createStore("tl-market",      "cache");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkflowInstance {
  id:          string;         // uuid
  templateId:  string;         // e.g. "web_development"
  title:       string;         // user-editable title
  createdAt:   number;
  updatedAt:   number;
  currentStep: number;
  steps:       WorkflowStep[];
  metadata:    Record<string, unknown>;
}

export interface WorkflowStep {
  id:           string;
  title:        string;
  description:  string;
  status:       "pending" | "active" | "complete" | "skipped";
  userInput:    string;         // what the user typed / selected to send forward
  agentOutput:  string;         // full agent response
  suggestedContext: string;     // agent-highlighted text to forward
  selectedContext:  string;     // what user actually chose to forward
  attachments:  StepAttachment[];
  completedAt?: number;
}

export interface StepAttachment {
  id:       string;
  type:     "file" | "url" | "code" | "image" | "market_data";
  name:     string;
  content:  string;   // for text; for blobs use fileStore
  mimeType?: string;
  size?:    number;
}

export interface AgentMessage {
  id:         string;
  workflowId: string;
  stepId:     string;
  role:       "user" | "assistant" | "tool";
  content:    string;
  toolName?:  string;
  toolInput?: unknown;
  toolOutput?: unknown;
  timestamp:  number;
  tokens?:    number;
}

export interface UserSettings {
  theme:           "dark" | "light";
  tokenBalance:    number;       // decremented client-side, validated server-side
  totalTokensUsed: number;
  apiKeysMedia:    { openai?: string; fal?: string; luma?: string };  // only media keys stored
  preferredModel:  string;
  lastWorkflowId?: string;
}

// ── Workflow CRUD ─────────────────────────────────────────────────────────────

export async function saveWorkflow(wf: WorkflowInstance): Promise<void> {
  wf.updatedAt = Date.now();
  await set(wf.id, wf, workflowStore);
}

export async function getWorkflow(id: string): Promise<WorkflowInstance | undefined> {
  return get<WorkflowInstance>(id, workflowStore);
}

export async function listWorkflows(): Promise<WorkflowInstance[]> {
  const ks = await keys(workflowStore);
  const all = await Promise.all(ks.map((k) => get<WorkflowInstance>(k as string, workflowStore)));
  return (all.filter(Boolean) as WorkflowInstance[]).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteWorkflow(id: string): Promise<void> {
  await del(id, workflowStore);
}

// ── Step helpers ──────────────────────────────────────────────────────────────

export async function updateStep(
  workflowId: string,
  stepId: string,
  patch: Partial<WorkflowStep>
): Promise<WorkflowInstance | null> {
  const wf = await getWorkflow(workflowId);
  if (!wf) return null;
  wf.steps = wf.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s));
  wf.updatedAt = Date.now();
  await saveWorkflow(wf);
  return wf;
}

// ── Chat messages ─────────────────────────────────────────────────────────────

export async function appendMessage(msg: AgentMessage): Promise<void> {
  await set(msg.id, msg, chatStore);
}

export async function getMessages(workflowId: string, stepId: string): Promise<AgentMessage[]> {
  const ks = await keys(chatStore);
  const all = await Promise.all(ks.map((k) => get<AgentMessage>(k as string, chatStore)));
  return (all.filter(Boolean) as AgentMessage[])
    .filter((m) => m.workflowId === workflowId && m.stepId === stepId)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export async function clearMessages(workflowId: string, stepId: string): Promise<void> {
  const ks = await keys(chatStore);
  const all = await Promise.all(ks.map((k) => get<AgentMessage>(k as string, chatStore)));
  const toDelete = (all.filter(Boolean) as AgentMessage[])
    .filter((m) => m.workflowId === workflowId && m.stepId === stepId);
  await Promise.all(toDelete.map((m) => del(m.id, chatStore)));
}

// ── Settings ──────────────────────────────────────────────────────────────────

const SETTINGS_KEY = "user_settings";

const DEFAULT_SETTINGS: UserSettings = {
  theme:           "dark",
  tokenBalance:    0,
  totalTokensUsed: 0,
  apiKeysMedia:    {},
   preferredModel:  "dracarys-llama-3.1-70b-instruct",
};

export async function getSettings(): Promise<UserSettings> {
  const stored = await get<UserSettings>(SETTINGS_KEY, settingsStore);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  const current = await getSettings();
  const updated = { ...current, ...patch };
  await set(SETTINGS_KEY, updated, settingsStore);
  return updated;
}

// ── Media API keys (stored separately, only user-provided keys for media) ─────

export async function saveMediaKey(provider: "openai" | "fal" | "luma", key: string): Promise<void> {
  const s = await getSettings();
  await saveSettings({ apiKeysMedia: { ...s.apiKeysMedia, [provider]: key } });
}

export async function getMediaKey(provider: "openai" | "fal" | "luma"): Promise<string | null> {
  const s = await getSettings();
  return s.apiKeysMedia[provider] ?? null;
}

// ── Market data cache ─────────────────────────────────────────────────────────

export async function cacheMarketData(key: string, data: unknown, ttlMs = 60_000): Promise<void> {
  await set(key, { data, expiresAt: Date.now() + ttlMs }, marketStore);
}

export async function getCachedMarketData<T>(key: string): Promise<T | null> {
  const entry = await get<{ data: T; expiresAt: number }>(key, marketStore);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.data;
}

// ── File store (for imported files) ──────────────────────────────────────────

export interface StoredFile {
  id:        string;
  name:      string;
  mimeType:  string;
  size:      number;
  content:   string;   // base64 for binary, utf-8 for text
  savedAt:   number;
}

export async function saveFile(file: StoredFile): Promise<void> {
  await set(file.id, file, fileStore);
}

export async function getFile(id: string): Promise<StoredFile | undefined> {
  return get<StoredFile>(id, fileStore);
}

export async function listFiles(): Promise<StoredFile[]> {
  const ks = await keys(fileStore);
  const all = await Promise.all(ks.map((k) => get<StoredFile>(k as string, fileStore)));
  return (all.filter(Boolean) as StoredFile[]).sort((a, b) => b.savedAt - a.savedAt);
}

export async function deleteFile(id: string): Promise<void> {
  await del(id, fileStore);
}

// ── Storage stats ─────────────────────────────────────────────────────────────

export async function getStorageStats(): Promise<{ used: number; quota: number; pct: number }> {
  try {
    const est = await navigator.storage.estimate();
    const used  = est.usage  ?? 0;
    const quota = est.quota  ?? 1;
    return { used, quota, pct: Math.round((used / quota) * 100) };
  } catch {
    return { used: 0, quota: 0, pct: 0 };
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// ── ID generator ──────────────────────────────────────────────────────────────

export function generateId(prefix = ""): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts   = Date.now().toString(36);
  return `${prefix}${ts}${rand}`;
}
