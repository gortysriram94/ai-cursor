"use client";

import React, { useState } from "react";

interface Props {
  stats: any;
  onResize: (targetTokens: number) => void;
  resizing: boolean;
}

function Bar({ pct, color = "var(--accent)" }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 6, background: "var(--border)", borderRadius: 3 }}>
      <div style={{ height: 6, width: `${Math.min(100, Math.max(0, pct))}%`, background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="mono" style={{ fontSize: 11, letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 12 }}>
      {label}
    </div>
  );
}

const MODELS = [
  { id: "none",          label: "No limit (show all rows)",  tokens: 0       },
  { id: "gpt-4o",        label: "GPT-4o (128K)",             tokens: 128000  },
  { id: "gpt-4o-mini",   label: "GPT-4o Mini (128K)",        tokens: 128000  },
  { id: "gpt-3-5",       label: "GPT-3.5 Turbo (16K)",       tokens: 16000   },
  { id: "claude-sonnet", label: "Claude Sonnet 4 (200K)",    tokens: 200000  },
  { id: "claude-haiku",  label: "Claude Haiku 4 (200K)",     tokens: 200000  },
  { id: "gemini-pro",    label: "Gemini 1.5 Pro (1M)",       tokens: 1000000 },
  { id: "gemini-flash",  label: "Gemini 1.5 Flash (1M)",     tokens: 1000000 },
  { id: "custom",        label: "Custom limit…",             tokens: -1      },
];

export default function ContextSizer({ stats, onResize, resizing }: Props) {
  const [selectedModel, setSelectedModel] = useState("none");
  const [customTokens, setCustomTokens] = useState("");

  if (!stats) return null;

  const targetTokens = selectedModel === "custom"
    ? parseInt(customTokens) || 0
    : MODELS.find((m) => m.id === selectedModel)?.tokens || 0;

  const utilisation = targetTokens > 0 && stats.contextTokensFit > 0
    ? Math.round((stats.contextTokensFit / targetTokens) * 100)
    : 0;

  const fitsWithoutCrop = targetTokens === 0 || stats.cleanedTokens <= targetTokens;

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    const model = MODELS.find((m) => m.id === modelId);
    const tokens = model?.tokens === -1 ? (parseInt(customTokens) || 0) : (model?.tokens || 0);
    if (modelId !== "custom") onResize(tokens);
  };

  const handleCustomApply = () => {
    onResize(parseInt(customTokens) || 0);
  };

  return (
    <>
      {/* Model selector */}
      <div style={{ background: "var(--panel)", border: "1px solid var(--border)", padding: 20 }}>
        <SectionHeader label="SELECT TARGET MODEL" />
        <select
          value={selectedModel}
          onChange={(e) => handleModelChange(e.target.value)}
          style={{
            width: "100%", background: "var(--panel-2)", border: "1px solid var(--border)",
            color: "var(--text)", padding: "8px 12px", fontSize: 13, fontFamily: "monospace", outline: "none",
          }}
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>

        {selectedModel === "custom" && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input
              type="number"
              value={customTokens}
              onChange={(e) => setCustomTokens(e.target.value)}
              placeholder="e.g. 50000"
              style={{
                flex: 1, background: "var(--panel-2)", border: "1px solid var(--border)",
                color: "var(--text)", padding: "6px 10px", fontSize: 12, fontFamily: "monospace", outline: "none",
              }}
            />
            <button
              onClick={handleCustomApply}
              style={{
                background: "var(--accent)", color: "var(--surface)", border: "none",
                padding: "6px 16px", fontFamily: "monospace", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >
              APPLY
            </button>
          </div>
        )}

        {resizing && (
          <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
            ⟳ Re-processing with new context limit…
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 2, background: "var(--border)" }}>
        {[
          { label: "Target window",  value: targetTokens > 0 ? `${(targetTokens / 1000).toFixed(0)}K tokens` : "No limit", accent: false },
          { label: "Tokens fit",     value: stats.contextTokensFit > 0 ? stats.contextTokensFit.toLocaleString() : stats.cleanedTokens.toLocaleString(), accent: true },
          { label: "Rows dropped",   value: stats.contextRowsDropped > 0 ? stats.contextRowsDropped.toLocaleString() : "0", danger: stats.contextRowsDropped > 0 },
        ].map(({ label, value, accent, danger }: any) => (
          <div key={label} style={{ background: "var(--panel)", border: "1px solid var(--border)", padding: "1rem" }}>
            <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: danger ? "var(--danger)" : accent ? "var(--accent)" : "var(--text)" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Analysis */}
      {targetTokens > 0 ? (
        <>
          <div style={{ background: "var(--panel)", border: "1px solid var(--border)", padding: 24 }}>
            <SectionHeader label="CONTEXT FIT ANALYSIS" />
            {fitsWithoutCrop ? (
              <div style={{ fontSize: 13, color: "var(--success)", marginBottom: 16 }}>
                ✓ Dataset fits within {MODELS.find((m) => m.id === selectedModel)?.label || `${targetTokens.toLocaleString()} tokens`} — no rows dropped.
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>Context utilisation</span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>{utilisation}%</span>
                  </div>
                  <Bar pct={utilisation} />
                </div>
                {[
                  ["Rows before crop", stats.cleanedRowCount.toLocaleString(), "var(--text)"],
                  ["Rows retained",    (stats.cleanedRowCount - stats.contextRowsDropped).toLocaleString(), "var(--accent)"],
                  ["Rows dropped",     stats.contextRowsDropped.toLocaleString(), "var(--danger)"],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                    <span style={{ color: "var(--muted)" }}>{label}</span>
                    <span className="mono" style={{ color }}>{val}</span>
                  </div>
                ))}
              </>
            )}
          </div>

          <div style={{ background: "var(--panel)", border: "1px solid var(--border)", padding: 20 }}>
            <SectionHeader label="HOW ROWS ARE RANKED" />
            {[
              ["var(--accent)", "Each row is scored by unique token ratio (unique words ÷ total words)"],
              ["var(--accent)", "Higher ratio = more information density = kept first"],
              ["var(--accent)", "Rows are packed into the context budget from highest density down"],
              ["var(--accent)", "Original row order is preserved in the output"],
              ["var(--warn)",   "For true semantic ranking, use embeddings — this is a fast heuristic"],
            ].map(([color, text]) => (
              <div key={text} style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 8 }}>
                <span style={{ color, marginRight: 8 }}>→</span>{text}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ background: "var(--panel)", border: "1px solid var(--border)", padding: 32, textAlign: "center" }}>
          <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>SELECT A MODEL ABOVE</div>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            Choose a model to automatically crop your dataset to fit its context window, keeping the most information-dense rows.
          </p>
        </div>
      )}

      {/* Reference table */}
      <div style={{ background: "var(--panel)", border: "1px solid var(--border)", padding: 20 }}>
        <SectionHeader label="CONTEXT WINDOW REFERENCE" />
        {[
          ["GPT-4o / GPT-4o mini", "128K tokens"],
          ["GPT-3.5 Turbo",        "16K tokens"],
          ["Claude Sonnet 4",      "200K tokens"],
          ["Claude Haiku 4",       "200K tokens"],
          ["Gemini 1.5 Pro",       "1M tokens"],
          ["Gemini 1.5 Flash",     "1M tokens"],
        ].map(([model, limit]) => (
          <div key={model} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
            <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{model}</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>{limit}</span>
          </div>
        ))}
      </div>
    </>
  );
}
