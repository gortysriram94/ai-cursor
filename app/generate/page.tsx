"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { loadPersistedKeys, hasKey, getConnectedProviders, type Provider } from "@/lib/byok";
import ApiKeyPanel from "@/app/tool/components/ApiKeyPanel";
import GenerationPanel from "@/app/tool/components/GenerationPanel";
import { listSavedFiles, getDatasetContent, type SavedFile } from "@/lib/opfs";
import { isOPFSSupported } from "@/lib/opfs";

// ── Fake CleanResult for standalone page ─────────────────────────────────────

function makeStats(rows: number, headers: string[]): {
  cleanedRowCount: number; headers: string[];
  qualityAfter: number; cleanedTokens: number;
} {
  return {
    cleanedRowCount: rows,
    headers,
    qualityAfter: 90,
    cleanedTokens: rows * 50, // rough estimate
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export default function GeneratePage() {
  const [providers, setProviders]     = useState<Provider[]>([]);
  const [genType, setGenType]         = useState<"image" | "video">("image");
  const [insights, setInsights]       = useState("");
  const [vertical, setVertical]       = useState("general");
  const [savedFiles, setSavedFiles]   = useState<SavedFile[]>([]);
  const [loadingKb, setLoadingKb]     = useState(false);
  const [selectedFile, setSelectedFile] = useState<SavedFile | null>(null);
  const [showPanel, setShowPanel]     = useState(false);

  useEffect(() => {
    loadPersistedKeys();
    setProviders(getConnectedProviders());

    if (isOPFSSupported()) {
      listSavedFiles()
        .then(setSavedFiles)
        .catch(() => setSavedFiles([]));
    }
  }, []);

  const handleLoadFromKb = async (file: SavedFile) => {
    setLoadingKb(true);
    setSelectedFile(file);
    setVertical(file.vertical);
    // Use filename as placeholder insight
    setInsights(`Dataset: ${file.fileName}\nRows: ${file.cleanedRows}\nHeaders: ${file.headers.join(", ")}`);
    setLoadingKb(false);
    setShowPanel(true);
  };

  const canGenerate = insights.trim().length > 10;

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface)", color: "var(--text)" }}>

      {/* Nav */}
      <nav style={{
        borderBottom: "1px solid var(--border)", padding: "14px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "var(--surface)", position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span className="mono" style={{ color: "var(--accent)", fontWeight: 600, fontSize: 15 }}>TokenLift</span>
          </Link>
          <span style={{ color: "var(--border)" }}>·</span>
          <span className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em" }}>
            GENERATE
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/tool" className="mono" style={{
            fontSize: 10, color: "var(--muted)", textDecoration: "none",
            border: "1px solid var(--border)", padding: "5px 12px", letterSpacing: "0.08em",
          }}>
            ← TOOL
          </Link>
          <Link href="/kb" className="mono" style={{
            fontSize: 10, color: "var(--muted)", textDecoration: "none",
            border: "1px solid var(--border)", padding: "5px 12px", letterSpacing: "0.08em",
          }}>
            KNOWLEDGE BASE
          </Link>
        </div>
      </nav>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Page header */}
        <div>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em", marginBottom: 6 }}>
            DATA-INFORMED GENERATION
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 300, color: "var(--text)", margin: 0 }}>
            Generate visuals from your data insights
          </h1>
          <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 8, lineHeight: 1.6 }}>
            Paste AI analysis output from the tool, or load from your knowledge base. 
            TokenLift builds the generation prompt from your actual data — not a blank text box.
          </p>
        </div>

        {/* API Keys */}
        <div id="api-keys">
          <ApiKeyPanel onKeysChange={(p) => setProviders(p)} />
        </div>

        {/* Generation type toggle */}
        <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: "14px 16px" }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em", marginBottom: 12 }}>
            GENERATION TYPE
          </div>
          <div style={{ display: "flex", gap: 0, border: "1px solid var(--border)", width: "fit-content" }}>
            {(["image", "video"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setGenType(t)}
                style={{
                  background: genType === t ? "var(--accent)" : "none",
                  color: genType === t ? "var(--surface)" : "var(--muted)",
                  border: "none", padding: "7px 18px",
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 10, letterSpacing: "0.08em",
                  cursor: "pointer", textTransform: "uppercase",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Insights input */}
        <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: "14px 16px" }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em", marginBottom: 12 }}>
            YOUR INSIGHTS
          </div>

          {/* Load from KB */}
          {savedFiles.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", marginBottom: 6 }}>
                LOAD FROM KNOWLEDGE BASE
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {savedFiles.slice(0, 6).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => handleLoadFromKb(f)}
                    disabled={loadingKb}
                    style={{
                      background: selectedFile?.id === f.id ? "var(--accent)" : "none",
                      color: selectedFile?.id === f.id ? "var(--surface)" : "var(--muted)",
                      border: `1px solid ${selectedFile?.id === f.id ? "var(--accent)" : "var(--border)"}`,
                      padding: "4px 10px",
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 9, cursor: "pointer",
                    }}
                  >
                    {f.fileName.length > 24 ? f.fileName.slice(0, 22) + "…" : f.fileName}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", marginBottom: 6 }}>
            PASTE AI ANALYSIS OUTPUT
          </div>
          <textarea
            value={insights}
            onChange={(e) => { setInsights(e.target.value); setShowPanel(false); }}
            placeholder={`Paste your AI analysis here...\n\nFor best results, include FINDING: markers from the structured output format.`}
            rows={8}
            style={{
              width: "100%", background: "var(--panel-2, var(--surface))",
              border: "1px solid var(--border)", color: "var(--text)",
              padding: "10px 12px", fontSize: 13,
              fontFamily: "DM Sans, sans-serif", outline: "none",
              resize: "vertical", boxSizing: "border-box",
              lineHeight: 1.6,
            }}
          />

          {/* Vertical selector */}
          <div style={{ marginTop: 10 }}>
            <div className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", marginBottom: 6 }}>
              DATA TYPE
            </div>
            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              style={{
                background: "var(--panel-2, var(--surface))",
                border: "1px solid var(--border)", color: "var(--text)",
                padding: "6px 10px", fontSize: 12,
                fontFamily: "JetBrains Mono, monospace", outline: "none",
              }}
            >
              {["general", "ux_research", "trader", "aws", "bigquery", "content_creator", "hr_people"].map((v) => (
                <option key={v} value={v}>{v.replace("_", " ")}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowPanel(true)}
            disabled={!canGenerate}
            style={{
              marginTop: 12,
              background: canGenerate ? "var(--accent)" : "var(--border)",
              color: "var(--surface)", border: "none",
              padding: "8px 20px",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              cursor: canGenerate ? "pointer" : "not-allowed",
            }}
          >
            BUILD GENERATION PROMPT →
          </button>
        </div>

        {/* Generation panel */}
        {showPanel && canGenerate && (
          <GenerationPanel
            stats={makeStats(
              selectedFile?.cleanedRows ?? 100,
              selectedFile?.headers ?? ["data"]
            )}
            vertical={vertical}
            insights={insights}
            fileName={selectedFile?.fileName ?? "dataset"}
          />
        )}

        {/* Note */}
        <div style={{ padding: "12px 16px", border: "1px solid var(--border)", display: "flex", gap: 10 }}>
          <span style={{ color: "var(--muted)", fontSize: 12, flexShrink: 0 }}>◈</span>
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
            Generation uses your own API keys. Costs are charged directly to your provider account.
            TokenLift does not mark up generation costs — you pay only what the provider charges.
            Generated outputs download through your browser and are not stored on our servers.
          </p>
        </div>

      </div>
    </div>
  );
}
