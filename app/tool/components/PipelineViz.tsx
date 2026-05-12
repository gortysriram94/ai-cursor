"use client";

import { useEffect, useState } from "react";

export type PipelineStage =
  | "idle"
  | "uploading"
  | "cleaning"
  | "optimizing"
  | "analyzing"
  | "streaming"
  | "complete";

interface NodeStats {
  rows?:  string;
  tokens?: string;
  model?:  string;
  size?:   string;
}

interface Props {
  stage:          PipelineStage;
  fileStats?:     NodeStats;
  cleanStats?:    NodeStats;
  optimizeStats?: NodeStats;
  modelStats?:    NodeStats;
  insightStats?:  NodeStats;
}

interface NodeDef {
  id:    string;
  label: string;
  icon:  string;
  // Stage at which this node becomes active
  activateAt:  PipelineStage[];
  // Stage at which this node is considered done
  completeAt:  PipelineStage[];
  stats?:      NodeStats;
}

const STAGE_ORDER: PipelineStage[] = [
  "idle", "uploading", "cleaning", "optimizing",
  "analyzing", "streaming", "complete",
];

function stageIndex(s: PipelineStage) { return STAGE_ORDER.indexOf(s); }

export default function PipelineViz({
  stage,
  fileStats,
  cleanStats,
  optimizeStats,
  modelStats,
  insightStats,
}: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (stage === "idle" || stage === "complete") return;
    const t = setInterval(() => setTick((n) => (n + 1) % 3), 500);
    return () => clearInterval(t);
  }, [stage]);

  const dots = ["·", "··", "···"][tick];
  const si   = stageIndex(stage);

  const nodes: NodeDef[] = [
    {
      id: "file",     label: "YOUR FILE",   icon: "◈",
      activateAt: ["uploading"],
      completeAt: ["cleaning", "optimizing", "analyzing", "streaming", "complete"],
      stats: fileStats,
    },
    {
      id: "clean",    label: "CLEAN",       icon: "◉",
      activateAt: ["cleaning"],
      completeAt: ["optimizing", "analyzing", "streaming", "complete"],
      stats: cleanStats,
    },
    {
      id: "optimize", label: "OPTIMIZE",    icon: "◎",
      activateAt: ["optimizing"],
      completeAt: ["analyzing", "streaming", "complete"],
      stats: optimizeStats,
    },
    {
      id: "model",    label: "YOUR MODEL",  icon: "▣",
      activateAt: ["analyzing", "streaming"],
      completeAt: ["complete"],
      stats: modelStats,
    },
    {
      id: "insights", label: "INSIGHTS",    icon: "▶",
      activateAt: ["streaming"],
      completeAt: ["complete"],
      stats: insightStats,
    },
  ];

  const nodeStatus = (node: NodeDef): "waiting" | "active" | "complete" => {
    if (node.completeAt.some((s) => stageIndex(stage) >= stageIndex(s))) return "complete";
    if (node.activateAt.includes(stage)) return "active";
    return "waiting";
  };

  // Connector is "flowing" when the downstream node is active
  const connectorStatus = (i: number): "waiting" | "flowing" | "solid" => {
    const next = nodes[i + 1];
    if (!next) return "waiting";
    const ns = nodeStatus(next);
    if (ns === "complete") return "solid";
    if (ns === "active")   return "flowing";
    return "waiting";
  };

  return (
    <div style={{
      border: "1px solid var(--border)", background: "var(--panel)",
      padding: "16px 20px", overflowX: "auto",
    }}>
      <div className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em", marginBottom: 16 }}>
        YOUR AI PIPELINE
      </div>

      {/* ── Node row ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", minWidth: 560 }}>
        {nodes.map((node, i) => {
          const status = nodeStatus(node);
          const color  = status === "complete"
            ? "var(--success)"
            : status === "active"
            ? "var(--accent)"
            : "var(--border)";
          const textColor = status === "waiting" ? "var(--muted)" : color;
          const cSt = connectorStatus(i);

          return (
            <div key={node.id} style={{ display: "flex", alignItems: "flex-start", flex: i < nodes.length - 1 ? 1 : 0 }}>

              {/* Node column */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 72 }}>

                {/* Circle */}
                <div style={{
                  width: 40, height: 40, borderRadius: "50%",
                  border: `2px solid ${color}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: status === "complete"
                    ? "color-mix(in srgb, var(--success) 12%, transparent)"
                    : status === "active"
                    ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                    : "transparent",
                  transition: "border-color 0.4s, background 0.4s",
                  boxShadow: status === "active"
                    ? "0 0 14px color-mix(in srgb, var(--accent) 35%, transparent)"
                    : "none",
                }}>
                  <span style={{ color, fontSize: 15, transition: "color 0.4s" }}>
                    {status === "complete" ? "✓" : node.icon}
                  </span>
                </div>

                {/* Label */}
                <span className="mono" style={{
                  fontSize: 9, color: textColor,
                  letterSpacing: "0.07em", textAlign: "center",
                  lineHeight: 1.3, transition: "color 0.4s",
                }}>
                  {node.label}
                  {status === "active" && (
                    <span style={{ color: "var(--accent)" }}>{dots}</span>
                  )}
                </span>

                {/* Stats below */}
                {node.stats && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, marginTop: 2 }}>
                    {node.stats.rows && (
                      <span className="mono" style={{ fontSize: 9, color: status === "waiting" ? "var(--border)" : "var(--muted)", textAlign: "center" }}>
                        {node.stats.rows}
                      </span>
                    )}
                    {node.stats.size && (
                      <span className="mono" style={{ fontSize: 9, color: status === "waiting" ? "var(--border)" : "var(--muted)", textAlign: "center" }}>
                        {node.stats.size}
                      </span>
                    )}
                    {node.stats.tokens && (
                      <span className="mono" style={{ fontSize: 9, color: status === "waiting" ? "var(--border)" : "var(--muted)", textAlign: "center" }}>
                        {node.stats.tokens}
                      </span>
                    )}
                    {node.stats.model && (
                      <span className="mono" style={{ fontSize: 9, color: status === "waiting" ? "var(--border)" : "var(--accent)", textAlign: "center" }}>
                        {node.stats.model}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Connector */}
              {i < nodes.length - 1 && (
                <div style={{
                  flex: 1, display: "flex", alignItems: "center",
                  paddingTop: 19, // center with circle
                }}>
                  <div style={{ flex: 1, height: 2, position: "relative", overflow: "hidden" }}>
                    {/* Base line — dashed when waiting, solid otherwise */}
                    <div style={{
                      position: "absolute", inset: 0,
                      background: cSt === "waiting"
                        ? "transparent"
                        : cSt === "solid"
                        ? "var(--success)"
                        : "var(--accent)",
                      border: cSt === "waiting"
                        ? "none"
                        : "none",
                      // Dashed via repeating-linear-gradient
                      backgroundImage: cSt === "waiting"
                        ? "repeating-linear-gradient(90deg, var(--border) 0, var(--border) 6px, transparent 6px, transparent 12px)"
                        : "none",
                      transition: "background 0.4s",
                    }} />

                    {/* Animated flowing dot when active */}
                    {cSt === "flowing" && (
                      <div style={{
                        position: "absolute", top: 0, bottom: 0, width: 16,
                        background: "linear-gradient(90deg, transparent, var(--accent), transparent)",
                        animation: "pipeflow 1s linear infinite",
                      }} />
                    )}
                  </div>

                  <span className="mono" style={{ fontSize: 10, color: cSt === "waiting" ? "var(--border)" : "var(--accent)", padding: "0 3px" }}>
                    →
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pipeflow {
          from { left: -16px; }
          to   { left: 100%;  }
        }
      `}</style>
    </div>
  );
}
