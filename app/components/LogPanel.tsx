"use client";

// app/components/LogPanel.tsx
// ─────────────────────────────────────────────────────────────────────
// TokenLift LogPanel — "Stream of Consciousness" for the Agent System.
// Shows real-time logs from Commander (BRAIN), Scanner (EYES),
// Slaves (MUSCLE), and WorkflowEngine (SYSTEM).
// Renders HUD_UPDATE data (intent, status badges) when present.
// ─────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { logger, type LogEntry, type LogCategory, CATEGORY_META, type HudUpdate } from "@/lib/logger";

// ── Mini-Map: Visual overlay for SpatialMap ──────────────────────────
interface MiniMapProps {
  visible: boolean;
  spatialMap: any | null;
  highlightedId: string | null;
  onToggle: () => void;
}

function MiniMap({ visible, spatialMap, highlightedId, onToggle }: MiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!visible || !spatialMap || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const { viewport, elements } = spatialMap;
    const scale = 200 / viewport.w;
    const h = viewport.h * scale;

    canvasRef.current.width = 200;
    canvasRef.current.height = h;

    ctx.fillStyle = "#1e1e2e";
    ctx.fillRect(0, 0, 200, h);

    // Draw viewport indicator
    ctx.fillStyle = "rgba(96, 165, 250, 0.2)";
    ctx.fillRect(0, 0, 200, h);

    // Draw elements
    elements.slice(0, 50).forEach((el: any) => {
      const x = el.coords.x * scale;
      const y = el.coords.y * scale;
      const w = Math.max(el.coords.w * scale, 2);
      const ht = Math.max(el.coords.h * scale, 2);

      ctx.fillStyle = el.id === highlightedId ? "#ef4444" : "rgba(255,255,255,0.3)";
      ctx.fillRect(x, y, w, ht);
    });
  }, [visible, spatialMap, highlightedId]);

  return (
    <div className="mb-2">
      <button
        onClick={onToggle}
        className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center gap-1"
      >
        {visible ? "▾ Hide" : "▸ Show"} Mini-Map
      </button>
      {visible && (
        <canvas
          ref={canvasRef}
          className="mt-1 border border-gray-600 rounded"
          style={{ maxWidth: "100%" }}
        />
      )}
    </div>
  );
}

// ── Fine Print Card ──────────────────────────────────────────────────────
function FinePrintCard({ entry }: { entry: LogEntry }) {
  return (
    <div className="my-1 p-2 rounded border border-yellow-600/50 bg-yellow-900/20 text-yellow-200 text-xs">
      <div className="flex items-center gap-1 font-semibold mb-1">
        <span>⚠</span> Agent Note: Found Fine Print
      </div>
      <div className="text-yellow-100">{entry.message.replace("[FINE PRINT] ", "")}</div>
    </div>
  );
}

// ── Ghost Trace Progress Bar ──────────────────────────────────────────────
function GhostTraceBar({ entry }: { entry: LogEntry }) {
  const progress = (entry.metadata?.progress as number) || 0;
  const barLen = 20;
  const filled = Math.round(barLen * progress);
  const bar = "█".repeat(filled) + "░".repeat(barLen - filled);

  return (
    <div className="font-mono text-xs">
      <span className="text-yellow-400">Moving: </span>
      <span className="text-green-400">[{bar}]</span>
      <span className="text-gray-400"> {Math.round(progress * 100)}%</span>
    </div>
  );
}

// ── Single Log Line ─────────────────────────────────────────────────────────
function LogLine({ entry, isHighlighted }: { entry: LogEntry; isHighlighted: boolean }) {
  const meta = CATEGORY_META[entry.category];
  const time = new Date(entry.timestamp);
  const ms = entry.timestamp % 1000;
  const timeStr = `${time.toLocaleTimeString()}.${ms.toString().padStart(3, "0")}`;

  if (entry.isFinePrint) {
    return <FinePrintCard entry={entry} />;
  }

  if (entry.metadata?.type === "ghost_trace") {
    return <GhostTraceBar entry={entry} />;
  }

  // Render HUD_UPDATE data if present
  const hud: HudUpdate | undefined = entry.hudData;
  const intentBadge = hud?.intent ? (
    <span className={`text-[10px] px-1 rounded font-bold ${
      hud.intent === "CLICK" ? "bg-green-900/50 text-green-300" :
      hud.intent === "TYPE" ? "bg-blue-900/50 text-blue-300" :
      hud.intent === "SCROLL" ? "bg-yellow-900/50 text-yellow-300" :
      hud.intent === "SCAN" ? "bg-purple-900/50 text-purple-300" :
      hud.intent === "SECURE_INPUT" ? "bg-red-900/50 text-red-300" :
      "bg-gray-900/50 text-gray-300"
    }`}>
      {hud.intent}
    </span>
  ) : null;

  const statusDot = hud?.status ? (
    <span className={`w-2 h-2 rounded-full shrink-0 ${
      hud.status === "success" ? "bg-green-400" :
      hud.status === "failure" ? "bg-red-400" :
      "bg-yellow-400 animate-pulse"
    }`} title={hud.status} />
  ) : null;

  return (
    <div
      className={`py-1 px-2 rounded text-xs font-mono flex items-start gap-1 ${
        isHighlighted ? "bg-gray-700" : ""
      }`}
      style={{ backgroundColor: isHighlighted ? undefined : meta.bgColor }}
    >
      <span className="text-gray-500 select-none shrink-0" title={timeStr}>
        {timeStr.slice(12)}
      </span>
      <span className="shrink-0" title={entry.category}>
        {meta.icon}
      </span>
      {statusDot}
      <span className="text-gray-400 shrink-0">[{entry.agentName}]</span>
      {intentBadge}
      <span style={{ color: meta.color }} className="break-all">
        {entry.message}
      </span>
    </div>
  );
}

// ── Main LogPanel ──────────────────────────────────────────────────────────
interface LogPanelProps {
  open:     boolean;
  left:     number;
  onClose:  () => void;
  floating?: boolean;
}

export default function LogPanel({ open, left, onClose, floating = false }: LogPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [spatialMap, setSpatialMap] = useState<any | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to logger
  useEffect(() => {
    const unsub = logger.subscribe((entry) => {
      setLogs((prev) => {
        const next = [...prev, entry];
        return next.length > 500 ? next.slice(-500) : next;
      });

      if (entry.metadata?.type === "spatial_map" && entry.metadata.map) {
        setSpatialMap(entry.metadata.map);
      }
        if (entry.metadata?.elementId) {
          setHighlightedId(entry.metadata.elementId as string | null);
        }
    });
    return unsub;
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(atBottom);
  }, []);

  const clearLogs = useCallback(() => {
    logger.clearLogs();
    setLogs([]);
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach((l) => (counts[l.category] = (counts[l.category] || 0) + 1));
    return counts;
  }, [logs]);

  if (!open) return null;

  const containerStyle: React.CSSProperties = floating
    ? {
        position: "fixed", bottom: 60, right: 16,
        width: 400, height: 420,
        zIndex: 55,
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,.45)",
      }
    : {
        position: "absolute", bottom: 0, left, right: 0,
        height: "172px", zIndex: 40,
      };

  return (
    <div
      className="flex flex-col bg-gray-900 border border-gray-700 overflow-hidden"
      style={{ ...containerStyle, borderRadius: floating ? 12 : undefined }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <span>▤</span>
          <span className="font-semibold">Terminal</span>
          <span className="text-gray-500 text-xs">({logs.length} entries)</span>
        </div>
        <div className="flex items-center gap-2">
          {Object.entries(categoryCounts).map(([cat, count]) => (
            <span key={cat} className="text-xs" style={{ color: CATEGORY_META[cat as LogCategory].color }}>
              {CATEGORY_META[cat as LogCategory].icon} {count}
            </span>
          ))}
          <button
            onClick={clearLogs}
            className="text-xs px-2 py-1 rounded bg-red-900/30 hover:bg-red-800/50 text-red-300"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="text-xs px-1 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Mini-Map Toggle */}
      <div className="px-3 py-1 bg-gray-800/50 border-b border-gray-700">
        <MiniMap
          visible={showMiniMap}
          spatialMap={spatialMap}
          highlightedId={highlightedId}
          onToggle={() => setShowMiniMap(!showMiniMap)}
        />
      </div>

      {/* Log Entries */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-1 py-1 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent"
        style={{ maxHeight: "400px" }}
      >
        {logs.length === 0 && (
          <div className="text-gray-500 text-xs text-center py-8">
            Waiting for agent activity...
          </div>
        )}
        {logs.map((entry) => (
          <LogLine
            key={entry.id}
            entry={entry}
            isHighlighted={entry.metadata?.elementId === highlightedId}
          />
        ))}
      </div>

      {/* Footer: Auto-scroll indicator */}
      <div className="px-3 py-1 bg-gray-800/50 border-t border-gray-700 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {autoScroll ? "↕ Auto-scroll ON" : "↕ Auto-scroll OFF (scroll up to audit)"}
        </span>
        <span className="text-xs text-gray-600" suppressHydrationWarning>
          {typeof window !== "undefined" ? new Date().toLocaleTimeString() : ""}
        </span>
      </div>
    </div>
  );
}
