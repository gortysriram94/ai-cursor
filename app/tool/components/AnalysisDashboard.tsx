"use client";

import React, { useState, useEffect, useRef } from "react";
import { getKey, saveKey, persistKey, validateKeyFormat, loadPersistedKeys } from "@/lib/byok";
import { streamAnalysis, MODEL_RATES, calculateCost } from "@/lib/streaming";
import type { VerticalId } from "@/lib/verticals";

interface Props {
  prompt: string;
  cleanedData: string;
  stats: {
    cleanedRowCount: number;
    originalRowCount: number;
    headers: string[];
    qualityAfter: number;
    tokenReductionPct?: number;
    cleanedTokens?: number;
  };
  vertical: VerticalId;
  fileName: string;
  disclaimer?: string;
  onComplete?: (text: string) => void;
}

// ── Markdown inline renderer ──────────────────────────────────────────────────

function renderInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text);font-weight:600">$1</strong>')
    .replace(/`(.+?)`/g, '<code style="font-family:monospace;font-size:11px;color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,transparent);padding:1px 5px;border-radius:2px">$1</code>');
}

// ── Section body renderer ─────────────────────────────────────────────────────

function SectionBody({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: 6 }} />;

        if (line.match(/^[-*]\s/)) {
          return (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "2px 0" }}>
              <span style={{ color: "var(--accent)", flexShrink: 0, fontSize: 8, marginTop: 5 }}>◆</span>
              <span style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.65 }}
                dangerouslySetInnerHTML={{ __html: renderInline(line.replace(/^[-*]\s/, "")) }} />
            </div>
          );
        }

        if (line.match(/^\d+\.\s/)) {
          const num = line.match(/^(\d+)\./)?.[1];
          return (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "3px 0" }}>
              <span className="mono" style={{ color: "var(--accent)", flexShrink: 0, fontSize: 10, fontWeight: 700, width: 18, paddingTop: 2 }}>{num}.</span>
              <span style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.65 }}
                dangerouslySetInnerHTML={{ __html: renderInline(line.replace(/^\d+\.\s/, "")) }} />
            </div>
          );
        }

        if (line.match(/^###\s/)) {
          return (
            <div key={i} className="mono" style={{ fontSize: 9, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.12em", marginTop: 12, marginBottom: 4 }}>
              {line.replace(/^#+\s*/, "").toUpperCase()}
            </div>
          );
        }

        return (
          <p key={i} style={{ fontSize: 13, color: "var(--text-dim)", margin: "2px 0", lineHeight: 1.65 }}
            dangerouslySetInnerHTML={{ __html: renderInline(line) }} />
        );
      })}
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ title, body, index }: { title: string; body: string; index: number }) {
  const ICONS = ["◈", "◉", "◎", "▣", "▤", "◐", "▶", "◆"];
  const icon = ICONS[index % ICONS.length];
  return (
    <div style={{ border: "1px solid var(--border)", background: "var(--panel)", overflow: "hidden" }}>
      {title && (
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "var(--panel-2)", display: "flex", alignItems: "center", gap: 8 }}>
          <span className="mono" style={{ fontSize: 9, color: "var(--accent)" }}>{icon}</span>
          <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.1em" }}>
            {title.toUpperCase()}
          </span>
        </div>
      )}
      {body && (
        <div style={{ padding: "14px 16px" }}>
          <SectionBody text={body} />
        </div>
      )}
    </div>
  );
}

// ── Parse completed sections from streamed text ───────────────────────────────

function parseSections(text: string): Array<{ title: string; body: string }> {
  const parts = text.split(/\n(?=##\s)/);
  return parts
    .map(part => {
      const lines = part.split("\n");
      const titleLine = lines[0].trim();
      const isHeader = titleLine.startsWith("##");
      const title = isHeader ? titleLine.replace(/^#+\s*/, "").trim() : "";
      const body = isHeader ? lines.slice(1).join("\n").trim() : part.trim();
      return { title, body };
    })
    .filter(s => s.title || s.body);
}

// ── Models ────────────────────────────────────────────────────────────────────

const MODELS: Record<"anthropic" | "openai", Array<{ id: string; label: string }>> = {
  anthropic: [
    { id: "claude-sonnet-4-6",       label: "Claude Sonnet 4 (recommended)" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fast, cheap)" },
  ],
  openai: [
    { id: "gpt-4o",      label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o mini (fast, cheap)" },
  ],
};

// ── System instruction prepended to every prompt ──────────────────────────────

const FORMAT_INSTRUCTION = `Structure your response as a dashboard report. Use ## for each major section heading (e.g. ## Key Findings, ## Top Patterns, ## Recommendations). Use numbered lists for ranked insights. Use bullet points for supporting evidence. Be specific — include numbers and percentages from the data. Do not write preamble or conclusions outside of sections.\n\n`;

// ── Main component ────────────────────────────────────────────────────────────

export default function AnalysisDashboard({
  prompt, cleanedData, stats, vertical, fileName, disclaimer, onComplete,
}: Props) {
  const [apiKey,    setApiKey]    = useState("");
  const [provider,  setProvider]  = useState<"anthropic" | "openai">("anthropic");
  const [model,     setModel]     = useState("claude-sonnet-4-6");
  const [persist,   setPersist]   = useState(false);
  const [keyError,  setKeyError]  = useState("");

  const [streaming, setStreaming] = useState(false);
  const [done,      setDone]      = useState(false);
  const [error,     setError]     = useState("");
  const [fullText,  setFullText]  = useState("");
  const [inTok,     setInTok]     = useState(0);
  const [outTok,    setOutTok]    = useState(0);

  const abortRef = useRef(false);

  // Load any persisted/session keys on mount
  useEffect(() => {
    loadPersistedKeys();
    const ant = getKey("anthropic");
    const oai = getKey("openai");
    if (ant) { setApiKey(ant); setProvider("anthropic"); setModel("claude-sonnet-4-6"); }
    else if (oai) { setApiKey(oai); setProvider("openai"); setModel("gpt-4o"); }
  }, []);

  const handleProviderChange = (p: "anthropic" | "openai") => {
    setProvider(p);
    setModel(p === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o");
    const stored = getKey(p === "anthropic" ? "anthropic" : "openai");
    setApiKey(stored ?? "");
    setKeyError("");
  };

  const runAnalysis = async () => {
    setKeyError("");
    const key = apiKey.trim();
    if (!key) { setKeyError("Enter your API key to continue"); return; }
    if (!validateKeyFormat(provider, key)) {
      setKeyError(`Invalid ${provider === "anthropic" ? "Anthropic" : "OpenAI"} key format`);
      return;
    }

    saveKey(provider, key);
    if (persist) persistKey(provider, key);

    setStreaming(true);
    setDone(false);
    setFullText("");
    setError("");
    setInTok(0);
    setOutTok(0);
    abortRef.current = false;

    await streamAnalysis(provider, key, model, FORMAT_INSTRUCTION + prompt, cleanedData, {
      onToken:    (t) => { if (!abortRef.current) setFullText(prev => prev + t); },
      onCost:     (i, o) => { setInTok(i); setOutTok(o); },
      onComplete: (text) => { setStreaming(false); setDone(true); onComplete?.(text); },
      onError:    (err)  => { setStreaming(false); setError(err); },
    });
  };

  const reset = () => { setDone(false); setFullText(""); setError(""); setInTok(0); setOutTok(0); };

  const downloadReport = () => {
    const blob = new Blob([fullText], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `analysis_${fileName || "report"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cost     = calculateCost(model, inTok, outTok);
  const sections = parseSections(fullText);

  // While streaming, show sections that are "complete" (followed by another ## header)
  // plus the trailing incomplete section as raw stream.
  const completedSections = done ? sections : sections.slice(0, -1);
  const streamingTail     = !done && sections.length > 0 ? sections[sections.length - 1] : null;
  const rawStream         = !done && !fullText.includes("##") ? fullText : "";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Setup panel (hidden once analysis starts) ─────────────────── */}
      {!streaming && !done && !error && (
        <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: "20px 20px" }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em", marginBottom: 16 }}>
            CONNECT YOUR API KEY
          </div>

          {/* Provider toggle */}
          <div style={{ display: "flex", marginBottom: 14, border: "1px solid var(--border)", width: "fit-content" }}>
            {(["anthropic", "openai"] as const).map(p => (
              <button key={p} onClick={() => handleProviderChange(p)}
                style={{
                  background: provider === p ? "var(--accent)" : "none",
                  color:      provider === p ? "var(--surface)" : "var(--muted)",
                  border:     "none", padding: "6px 18px",
                  fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 700,
                  cursor: "pointer", transition: "all 0.12s",
                }}>
                {p === "anthropic" ? "ANTHROPIC" : "OPENAI"}
              </button>
            ))}
          </div>

          {/* Key input */}
          <div style={{ marginBottom: 12 }}>
            <label className="mono" style={{ fontSize: 9, color: "var(--muted)", display: "block", marginBottom: 5, letterSpacing: "0.08em" }}>
              {provider === "anthropic" ? "ANTHROPIC API KEY" : "OPENAI API KEY"}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setKeyError(""); }}
              onKeyDown={e => e.key === "Enter" && runAnalysis()}
              placeholder={provider === "anthropic" ? "sk-ant-api03-…" : "sk-proj-…"}
              style={{
                width: "100%", background: "var(--panel-2)",
                border: `1px solid ${keyError ? "var(--danger)" : "var(--border)"}`,
                color: "var(--text)", padding: "8px 12px", fontSize: 13,
                outline: "none", boxSizing: "border-box", fontFamily: "monospace",
              }}
            />
            {keyError && (
              <div className="mono" style={{ fontSize: 10, color: "var(--danger)", marginTop: 5 }}>✗ {keyError}</div>
            )}
          </div>

          {/* Model selector */}
          <div style={{ marginBottom: 14 }}>
            <label className="mono" style={{ fontSize: 9, color: "var(--muted)", display: "block", marginBottom: 5, letterSpacing: "0.08em" }}>MODEL</label>
            <select value={model} onChange={e => setModel(e.target.value)}
              style={{
                background: "var(--panel-2)", border: "1px solid var(--border)",
                color: "var(--text)", padding: "7px 10px", fontSize: 12,
                fontFamily: "JetBrains Mono, monospace", outline: "none", width: "100%",
              }}>
              {MODELS[provider].map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>

          {/* Persist toggle */}
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 18 }}>
            <input type="checkbox" checked={persist} onChange={e => setPersist(e.target.checked)}
              style={{ accentColor: "var(--accent)", width: 13, height: 13 }} />
            <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>Remember key in this browser</span>
          </label>

          <button onClick={runAnalysis}
            style={{
              background: "var(--accent)", color: "var(--surface)", border: "none",
              padding: "11px 28px", fontFamily: "JetBrains Mono, monospace",
              fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em",
            }}>
            RUN ANALYSIS →
          </button>

          <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginTop: 10 }}>
            Your key never leaves this browser · costs go directly to your API account
          </div>
        </div>
      )}

      {/* ── Error state ───────────────────────────────────────────────── */}
      {error && (
        <div style={{ border: "1px solid var(--danger)", background: "color-mix(in srgb, var(--danger) 5%, var(--panel))", padding: "16px 18px" }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--danger)", letterSpacing: "0.1em", marginBottom: 6 }}>API ERROR</div>
          <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "monospace", lineHeight: 1.5 }}>{error}</div>
          <button onClick={reset}
            style={{ marginTop: 12, background: "none", border: "1px solid var(--border)", color: "var(--muted)", padding: "5px 14px", fontFamily: "JetBrains Mono, monospace", fontSize: 10, cursor: "pointer" }}>
            TRY AGAIN
          </button>
        </div>
      )}

      {/* ── Status bar ────────────────────────────────────────────────── */}
      {(streaming || done) && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", padding: "10px 14px", border: "1px solid var(--border)", background: "var(--panel)" }}>
          <span className="mono" style={{ fontSize: 10, color: streaming ? "var(--accent)" : "var(--success)", display: "flex", alignItems: "center", gap: 6 }}>
            {streaming && (
              <span style={{ display: "inline-block", animation: "spin 1s linear infinite", fontSize: 12 }}>⟳</span>
            )}
            {streaming ? "ANALYZING DATA…" : "✓ ANALYSIS COMPLETE"}
          </span>

          {inTok > 0 && (
            <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
              {inTok.toLocaleString()} in · {outTok.toLocaleString()} out · ${cost.toFixed(4)}
            </span>
          )}

          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {done && (
              <button onClick={downloadReport}
                style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", padding: "3px 12px", fontFamily: "JetBrains Mono, monospace", fontSize: 9, cursor: "pointer" }}>
                DOWNLOAD
              </button>
            )}
            {done && (
              <button onClick={reset}
                style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", padding: "3px 12px", fontFamily: "JetBrains Mono, monospace", fontSize: 9, cursor: "pointer" }}>
                RE-RUN
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Dashboard: completed sections ─────────────────────────────── */}
      {completedSections.map((s, i) => (
        <SectionCard key={i} index={i} title={s.title} body={s.body} />
      ))}

      {/* ── Live streaming tail (last incomplete section) ─────────────── */}
      {streamingTail && (
        <div style={{ border: "1px solid color-mix(in srgb, var(--accent) 30%, var(--border))", background: "var(--panel)", overflow: "hidden" }}>
          {streamingTail.title && (
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "var(--panel-2)", display: "flex", alignItems: "center", gap: 8 }}>
              <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.1em" }}>
                {streamingTail.title.toUpperCase()}
              </span>
              <span style={{ fontSize: 10, color: "var(--accent)", animation: "pulse 1s ease-in-out infinite" }}>▌</span>
            </div>
          )}
          {streamingTail.body && (
            <div style={{ padding: "14px 16px" }}>
              <SectionBody text={streamingTail.body} />
            </div>
          )}
        </div>
      )}

      {/* ── Raw stream before first ## header ─────────────────────────── */}
      {rawStream && (
        <div style={{ border: "1px solid color-mix(in srgb, var(--accent) 20%, var(--border))", background: "var(--panel)", padding: "14px 16px" }}>
          <p style={{ fontSize: 12, color: "var(--text-dim)", margin: 0, lineHeight: 1.7, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
            {rawStream}<span style={{ animation: "pulse 1s ease-in-out infinite", color: "var(--accent)" }}>▌</span>
          </p>
        </div>
      )}

      {/* ── Disclaimer ────────────────────────────────────────────────── */}
      {done && disclaimer && (
        <div style={{ padding: "10px 14px", border: "1px solid color-mix(in srgb, var(--warn) 30%, var(--border))", background: "color-mix(in srgb, var(--warn) 4%, transparent)" }}>
          <span className="mono" style={{ fontSize: 10, color: "var(--warn)" }}>⚠ {disclaimer}</span>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
