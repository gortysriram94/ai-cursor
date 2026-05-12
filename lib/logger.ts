// lib/logger.ts
// ─────────────────────────────────────────────────────────────────────
// Pushpa Logger Service — "Stream of Consciousness" for the Agent System
// Implements HUD_UPDATE event bus between WorkflowEngine and Chrome Extension.
// Uses a simple EventEmitter pattern (no external deps).
// ─────────────────────────────────────────────────────────────────────

export type HudAgent = "Brain" | "Muscle" | "System" | "Eyes";
export type HudIntent = "SCROLL" | "CLICK" | "TYPE" | "SCAN" | "SECURE_INPUT";
export type HudStatus = "pending" | "success" | "failure";

// Core HUD_UPDATE event schema for Agent Node ↔ Browser Node bridge
export interface HudUpdate {
  agent:       HudAgent;
  message:     string;
  intent:      HudIntent;
  targetCoords?: { x: number; y: number; normalized: boolean };
  fields?:      string[];   // For Pop Card requests (SECURE_INPUT)
  status:       HudStatus;
  timestamp:    number;
}

// Legacy LogCategory (kept for backward compatibility with LogPanel)
export type LogCategory = "BRAIN" | "EYES" | "MUSCLE" | "SYSTEM";

export interface LogEntry {
  id:        string;
  timestamp:  number;   // Date.now() with ms precision
  category:   LogCategory;
  agentName:  string;   // e.g., "Kimi 2.6", "Sovereign Scanner", "Slave 1", "WorkflowEngine"
  message:    string;
  metadata?:  Record<string, unknown>;   // e.g., { x: 450, y: 200, confidence: 0.98 }
  isFinePrint?: boolean;

  // New HUD_UPDATE fields (populated when this entry represents a HUD event)
  hudData?:   HudUpdate;
}

type LogListener = (entry: LogEntry) => void;
type HudListener = (update: HudUpdate) => void;

// ── LoggerService ────────────────────────────────────────────────────────
class LoggerService {
  private logListeners = new Set<LogListener>();
  private hudListeners = new Set<HudListener>();
  private logs: LogEntry[] = [];
  private maxLogs = 500;
  private recentCoords: Array<{ x: number; y: number; ts: number }> = [];

  // Subscribe to LogEntry events (for LogPanel)
  subscribe(listener: LogListener): () => void {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  // Subscribe to HUD_UPDATE events (for Chrome Extension overlay)
  subscribeHud(listener: HudListener): () => void {
    this.hudListeners.add(listener);
    return () => this.hudListeners.delete(listener);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
    this.recentCoords = [];
    this.emit({ id: "", timestamp: 0, category: "SYSTEM", agentName: "Logger", message: "Logs cleared" });
  }

  private emit(entry: LogEntry): void {
    if (entry.id) this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();
    this.logListeners.forEach(l => l(entry));
  }

  private emitHud(update: HudUpdate): void {
    this.hudListeners.forEach(l => l(update));
    // Store high-frequency coordinate data for auto-compaction
    if (update.targetCoords) {
      this.recentCoords.push({ x: update.targetCoords.x, y: update.targetCoords.y, ts: update.timestamp });
      // Keep last 100 coordinates
      if (this.recentCoords.length > 100) this.recentCoords.shift();
    }
  }

  // Auto-Compaction: Clear high-frequency coordinate data after step success
  compactAfterSuccess(): void {
    // Retain only summary: keep last 10 coords for reference
    if (this.recentCoords.length > 10) {
      this.recentCoords = this.recentCoords.slice(-10);
    }
    // Trim logs to essential summary (keep first 5 and last 20)
    if (this.logs.length > 50) {
      const summary = [...this.logs.slice(0, 5), ...this.logs.slice(-20)];
      this.logs = summary;
    }
  }

  // ── Category-specific loggers ──────────────────────────────────────────

  brain(agentName: string, message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      category: "BRAIN",
      agentName,
      message,
      metadata,
    };
    this.emit(entry);
    // Emit HUD_UPDATE for Brain (SCAN intent)
    if (metadata?.intent) {
      this.emitHud({
        agent: "Brain",
        message,
        intent: metadata.intent as HudIntent,
        targetCoords: metadata.targetCoords as HudUpdate['targetCoords'],
        fields: metadata.fields as string[],
        status: (metadata.status as HudStatus) || "pending",
        timestamp: Date.now(),
      });
    }
  }

  eyes(agentName: string, message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      category: "EYES",
      agentName,
      message,
      metadata,
    };
    this.emit(entry);
    // Emit HUD_UPDATE for Eyes (SCAN intent)
    if (metadata?.intent) {
      this.emitHud({
        agent: "Eyes",
        message,
        intent: metadata.intent as HudIntent,
        targetCoords: metadata.targetCoords as HudUpdate['targetCoords'],
        fields: metadata.fields as string[],
        status: (metadata.status as HudStatus) || "pending",
        timestamp: Date.now(),
      });
    }
  }

  muscle(agentName: string, message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      category: "MUSCLE",
      agentName,
      message,
      metadata,
    };
    this.emit(entry);
    // Emit HUD_UPDATE for Muscle (CLICK, TYPE, SCROLL intents)
    if (metadata?.intent) {
      this.emitHud({
        agent: "Muscle",
        message,
        intent: metadata.intent as HudIntent,
        targetCoords: metadata.targetCoords as HudUpdate['targetCoords'],
        fields: metadata.fields as string[],
        status: (metadata.status as HudStatus) || "pending",
        timestamp: Date.now(),
      });
    }
  }

  system(agentName: string, message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      category: "SYSTEM",
      agentName,
      message,
      metadata,
    };
    this.emit(entry);
    // Emit HUD_UPDATE for System
    if (metadata?.intent) {
      this.emitHud({
        agent: "System",
        message,
        intent: metadata.intent as HudIntent,
        targetCoords: metadata.targetCoords as HudUpdate['targetCoords'],
        fields: metadata.fields as string[],
        status: (metadata.status as HudStatus) || "pending",
        timestamp: Date.now(),
      });
    }
  }

  finePrint(agentName: string, message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      category: "EYES",
      agentName,
      message: `[FINE PRINT] ${message}`,
      metadata,
      isFinePrint: true,
    };
    this.emit(entry);
  }

  // Ghost Path Trace — progress bar for cursor movement
  ghostTrace(agentName: string, from: { x: number; y: number }, to: { x: number; y: number }, progress: number): void {
    const barLen = 10;
    const filled = Math.round(barLen * progress);
    const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      category: "MUSCLE",
      agentName,
      message: `Moving: [${bar}] ${Math.round(progress * 100)}%  (${from.x},${from.y}) → (${to.x},${to.y})`,
      metadata: { from, to, progress, type: "ghost_trace" },
    };
    this.emit(entry);
    // Emit HUD_UPDATE for ghost trace
    this.emitHud({
      agent: "Muscle",
      message: `Moving: ${Math.round(progress * 100)}%`,
      intent: "CLICK", // Moving toward a click target
      targetCoords: { x: to.x, y: to.y, normalized: false },
      status: progress >= 1 ? "success" : "pending",
      timestamp: Date.now(),
    });
  }

  // Generic HUD_UPDATE emitter
  hudUpdate(agent: HudAgent, message: string, intent: HudIntent, targetCoords?: { x: number; y: number; normalized: boolean }, fields?: string[], status: HudStatus = "pending"): void {
    this.emitHud({ agent, message, intent, targetCoords, fields, status, timestamp: Date.now() });
    // Auto-compact after success
    if (status === "success") {
      this.compactAfterSuccess();
    }
  }
}

// ── Singleton instance ────────────────────────────────────────────────────────
export const logger = new LoggerService();

// ── Category metadata for UI rendering ──────────────────────────────────────
export const CATEGORY_META: Record<LogCategory, { icon: string; color: string; bgColor: string }> = {
  BRAIN:   { icon: "🧠", color: "#a78bfa", bgColor: "rgba(167, 139, 250, 0.1)" },   // Purple
  EYES:    { icon: "👁️", color: "#60a5fa", bgColor: "rgba(96, 165, 250, 0.1)" },    // Blue
  MUSCLE:  { icon: "💪", color: "#fbbf24", bgColor: "rgba(251, 191, 36, 0.1)" },   // Yellow
  SYSTEM:  { icon: "⚙️", color: "#34d399", bgColor: "rgba(52, 211, 153, 0.1)" },   // Green
};
