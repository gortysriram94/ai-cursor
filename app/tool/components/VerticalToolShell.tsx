// app/tool/components/VerticalToolShell.tsx
// Shared shell used by all vertical tool pages.
// Handles upload, processing, results tabs — verticals just pass config.

"use client";

import React from "react";
import Link from "next/link";
import { type VerticalId, VERTICALS } from "@/lib/verticals";
import { type CleanStats } from "@/app/hooks/useToolState";
import ColumnSelector from "./ColumnSelector";
import BatchProcessor from "./BatchProcessor";
import ModeSelector from "./ModeSelector";
import CheckoutModal from "./CheckoutModal";
import PromptOutput from "./PromptOutput";
import KnowledgeBasePanel from "./KnowledgeBasePanel";
import ApiKeyPanel from "./ApiKeyPanel";
import StreamingOutput from "./StreamingOutput";
import GenerationPanel from "./GenerationPanel";
import RagExportButton from "./RagExportButton";
import VectorExportPanel from "./VectorExportPanel";
import ContextSizer from "./contextsizer";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShellProps {
  // Vertical identity
  verticalId: VerticalId;
  // From useToolState
  state: ReturnType<typeof import("@/app/hooks/useToolState").useToolState>;
  // Optional: hide mode selector (when vertical is locked)
  lockVertical?: boolean;
  // Override copy
  pageTitle: string;
  pageHook: string;      // one-line: what this page is for
  uploadHint?: string;   // shown in drop zone
  sampleLabel?: string;  // label on sample button
}

const PII_TYPES = [
  { id: "email",      label: "Emails" },
  { id: "phone",      label: "Phone numbers" },
  { id: "ssn",        label: "SSNs" },
  { id: "creditCard", label: "Credit cards" },
  { id: "ipv4",       label: "IP addresses" },
  { id: "uuid",       label: "UUIDs / IDs" },
  { id: "zipCode",    label: "Zip codes" },
  { id: "dob",        label: "Dates / DOBs" },
];

type TabId = "clean" | "pii" | "context" | "cost" | "vector" | "prompt";

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: "clean",   label: "Clean",      hint: "Dedup · normalize · tokens" },
  { id: "pii",     label: "PII",        hint: "Mask sensitive values" },
  { id: "context", label: "Context",    hint: "Fit into model window" },
  { id: "cost",    label: "Cost",       hint: "Savings across 8 models" },
  { id: "vector",  label: "Vector",     hint: "Pinecone · Weaviate · Qdrant" },
  { id: "prompt",  label: "AI Prompt",  hint: "Paste-ready prompt" },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      style={{ position: "relative", width: 40, height: 22, borderRadius: 11, background: checked ? "var(--accent)" : "var(--border)", border: "none", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}
      role="switch" aria-checked={checked}>
      <span style={{ position: "absolute", top: 3, left: checked ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "white", transition: "left 0.2s", display: "block" }} />
    </button>
  );
}

function Bar({ pct, color = "var(--accent)" }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 6, background: "var(--border)", borderRadius: 3 }}>
      <div style={{ height: 6, width: `${Math.min(100, Math.max(0, pct))}%`, background: color, borderRadius: 3, transition: "width 0.8s ease" }} />
    </div>
  );
}

// ── Main shell ────────────────────────────────────────────────────────────────

export default function VerticalToolShell({ verticalId, state, lockVertical = false, pageTitle, pageHook, uploadHint, sampleLabel }: ShellProps) {
  const [activeTab, setActiveTab] = React.useState<TabId>("clean");

  const {
    stats, loading, dragging, setDragging, fileName, fileSize,
    progressStep, progressPct, pendingHeaders, showColumnSelector,
    setShowColumnSelector, customFileName, setCustomFileName,
    batchMode, setBatchMode, resizing, checkoutLoading, checkoutSecret,
    setCheckoutSecret, credits, maskPII, setMaskPII, piiTypes, setPiiTypes,
    targetTokens, setTargetTokens, promptTemplate, setPromptTemplate,
    callsPerMonth, setCallsPerMonth, ragChunkSize, setRagChunkSize,
    ragOverlap, setRagOverlap, ragTokenBudget, setRagTokenBudget,
    ragChunkMode, setRagChunkMode, userInputs, setUserInputs,
    kbFileId, aiInsights, setAiInsights, connectedProviders, setConnectedProviders,
    tier, theme, toggleTheme, inputRef,
    processFile, handleDrop, loadSampleData, handleColumnConfirm,
    handleResize, handleExport, handleCreditExport, reset,
    setVerticalId,
  } = state;

  const vertical = VERTICALS[verticalId];
  const [localVerticalId, setLocalVerticalId] = React.useState(verticalId);

  // Keep parent vertical in sync when user changes it inside the shell
  const handleVerticalChange = (id: VerticalId) => {
    setLocalVerticalId(id);
    setVerticalId(id);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface)", color: "var(--text)" }}>

      {/* Nav */}
      <nav style={{ borderBottom: "1px solid var(--border)", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface)", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/" className="mono" style={{ fontWeight: 700, color: "var(--accent)", textDecoration: "none", fontSize: 15, letterSpacing: "-0.01em" }}>TokenLift</Link>
          <span style={{ color: "var(--border)" }}>·</span>
          <span className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em" }}>{vertical.icon} {pageTitle.toUpperCase()}</span>
          {fileName && (
            <><span style={{ color: "var(--border)" }}>·</span>
            <span className="mono" style={{ fontSize: 10, color: "var(--muted)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</span></>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {credits > 0 && <span className="mono" style={{ fontSize: 10, padding: "3px 10px", background: "color-mix(in srgb, var(--accent) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)", color: "var(--accent)" }}>🪙 {credits}</span>}
          <Link href="/tool" className="mono" style={{ fontSize: 9, color: "var(--muted)", textDecoration: "none", padding: "4px 10px", border: "1px solid var(--border)", letterSpacing: "0.1em" }}>ALL TOOLS</Link>
          <button onClick={toggleTheme} style={{ background: "none", border: "1px solid var(--border)", padding: "4px 8px", cursor: "pointer", fontSize: 13, lineHeight: 1, color: "var(--muted)" }}>{theme === "dark" ? "☀" : "☾"}</button>
        </div>
      </nav>

      {/* Page header — only shown before upload */}
      {!stats && !batchMode && (
        <div style={{ borderBottom: "1px solid var(--border)", background: "var(--panel)", padding: "24px 28px" }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.14em", marginBottom: 8 }}>{vertical.icon} {pageTitle.toUpperCase()}</div>
          <h1 style={{ fontSize: "clamp(20px, 3.5vw, 32px)", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)", margin: 0, lineHeight: 1.1 }}>{pageHook}</h1>
        </div>
      )}

      {/* Results tab bar */}
      {stats && (
        <div className="tl-tab-bar" style={{ borderBottom: "1px solid var(--border)", display: "flex", background: "var(--panel)" }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              background: activeTab === tab.id ? "color-mix(in srgb, var(--accent) 5%, transparent)" : "none",
              border: "none", cursor: "pointer", padding: "11px 16px", flexShrink: 0,
              borderBottom: activeTab === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "color 0.15s",
            }}>
              <div className="mono" style={{ fontSize: 11, fontWeight: activeTab === tab.id ? 700 : 400, color: activeTab === tab.id ? "var(--accent)" : "var(--muted)", letterSpacing: "0.04em" }}>{tab.label}</div>
              <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginTop: 2, opacity: 0.7 }}>{tab.hint}</div>
            </button>
          ))}
          <button onClick={reset} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", padding: "11px 16px", color: "var(--muted)", fontSize: 11 }} title="Upload new file">✕ new file</button>
        </div>
      )}

      <div className="tl-main-pad" style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>

        {/* Column selector overlay */}
        {stats && showColumnSelector && pendingHeaders && (
          <ColumnSelector
            headers={pendingHeaders}
            onConfirm={(selected, renames) => { setShowColumnSelector(false); handleColumnConfirm(selected, renames); }}
            onSkip={() => setShowColumnSelector(false)}
          />
        )}

        {/* Batch mode */}
        {!stats && batchMode && <BatchProcessor onExit={() => setBatchMode(false)} />}

        {/* Pre-upload state */}
        {!stats && !batchMode && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* API key panel */}
            <ApiKeyPanel onKeysChange={(providers) => setConnectedProviders(providers)} />

            {/* Vertical selector — hidden when locked */}
            {!lockVertical && (
              <ModeSelector
                selected={localVerticalId}
                userInputs={userInputs}
                onChange={handleVerticalChange}
                onInputChange={(key, val) => setUserInputs(prev => ({ ...prev, [key]: val }))}
              />
            )}

            {/* Vertical inputs when locked */}
            {lockVertical && (
              <ModeSelector
                selected={verticalId}
                userInputs={userInputs}
                onChange={() => {}} // locked
                onInputChange={(key, val) => setUserInputs(prev => ({ ...prev, [key]: val }))}
              />
            )}

            {/* Large file warning */}
            {fileSize > 50 * 1024 * 1024 && (
              <div style={{ border: "1px solid var(--warn)", background: "color-mix(in srgb, var(--warn) 6%, transparent)", padding: "14px 18px" }}>
                <div className="mono" style={{ fontSize: 10, color: "var(--warn)", letterSpacing: "0.12em", marginBottom: 6 }}>⚠ LARGE FILE ({(fileSize / (1024 * 1024)).toFixed(1)} MB)</div>
                <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>Processing may take 2–5 minutes. Keep this tab open.</p>
              </div>
            )}

            {/* Progress */}
            {loading && (
              <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: "20px 24px" }}>
                <div className="mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.12em", marginBottom: 16 }}>PROCESSING — {progressPct}%</div>
                {[
                  { label: "Parsing file…",        pct: 15 },
                  { label: "Removing duplicates…",  pct: 40 },
                  { label: "Cleaning structure…",   pct: 72 },
                  { label: "Counting tokens…",      pct: 88 },
                  { label: "Building exports…",     pct: 94 },
                ].map((step, idx) => {
                  const isDone = progressPct >= step.pct;
                  const isActive = !isDone && idx === Math.max(0, [15,40,72,88,94].findLastIndex((p) => progressPct >= p - 15));
                  return (
                    <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: isDone ? "var(--success)" : isActive ? "var(--accent)" : "var(--border)", transition: "background 0.3s" }} />
                      <span className="mono" style={{ fontSize: 11, color: isDone ? "var(--success)" : isActive ? "var(--text)" : "var(--muted)" }}>
                        {step.label}{isDone ? " ✓" : isActive ? " …" : ""}
                      </span>
                    </div>
                  );
                })}
                <div style={{ height: 2, background: "var(--border)", marginTop: 12, overflow: "hidden" }}>
                  <div style={{ height: 2, background: "var(--accent)", width: `${progressPct}%`, transition: "width 0.5s ease" }} />
                </div>
              </div>
            )}

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => !loading && inputRef.current?.click()}
              style={{
                border: `1px solid ${dragging ? "var(--accent)" : "var(--border)"}`,
                background: dragging ? "color-mix(in srgb, var(--accent) 4%, var(--panel))" : "var(--panel)",
                padding: "44px 24px 32px", textAlign: "center",
                cursor: loading ? "default" : "pointer",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <input ref={inputRef} type="file" accept=".csv,.tsv,.json,.jsonl,.xml,.parquet" onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} style={{ display: "none" }} />
              <div style={{ width: 44, height: 44, margin: "0 auto 18px", border: `1px solid ${loading ? "var(--accent)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", color: loading ? "var(--accent)" : "var(--muted)", fontSize: 20 }}>
                {loading ? "⟳" : "↑"}
              </div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: loading ? "var(--accent)" : "var(--text)", marginBottom: 8 }}>
                {loading ? (progressStep || "Processing…") : (uploadHint || `Drop your ${vertical.description.toLowerCase()} file here`)}
              </div>
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: loading ? 16 : 20 }}>
                {loading ? `${progressPct}% complete` : "CSV · TSV · JSON · JSONL · XML · Parquet · 100% client-side"}
              </p>
              {loading && (
                <div style={{ maxWidth: 320, margin: "0 auto 16px" }}>
                  <div style={{ height: 2, background: "var(--border)" }}>
                    <div style={{ height: 2, background: "var(--accent)", width: `${progressPct}%`, transition: "width 0.4s ease" }} />
                  </div>
                </div>
              )}
              {!loading && (
                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  <button onClick={(e) => { e.stopPropagation(); loadSampleData(); }}
                    style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", fontFamily: "JetBrains Mono, monospace", fontSize: 10, padding: "6px 14px", cursor: "pointer", letterSpacing: "0.08em" }}>
                    {sampleLabel || "TRY SAMPLE →"}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setBatchMode(true); }}
                    style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", fontFamily: "JetBrains Mono, monospace", fontSize: 10, padding: "6px 14px", cursor: "pointer", letterSpacing: "0.08em" }}>
                    BATCH MODE →
                  </button>
                </div>
              )}
            </div>

            {/* Options grid */}
            <div className="tl-col-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* PII */}
              <div style={{ background: "var(--panel)", border: "1px solid var(--border)", padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.1em" }}>PII MASKING</span>
                  <Toggle checked={maskPII} onChange={setMaskPII} />
                </div>
                <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: maskPII ? 12 : 0, lineHeight: 1.5 }}>Redact sensitive values before export. Runs locally.</p>
                {maskPII && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {PII_TYPES.map(pt => (
                      <label key={pt.id} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
                        <input type="checkbox" checked={piiTypes.includes(pt.id)} onChange={(e) => setPiiTypes(e.target.checked ? [...piiTypes, pt.id] : piiTypes.filter(x => x !== pt.id))} style={{ accentColor: "var(--accent)" }} />
                        <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{pt.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {/* Context */}
              <div style={{ background: "var(--panel)", border: "1px solid var(--border)", padding: 20 }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.1em", display: "block", marginBottom: 14 }}>CONTEXT & COST OPTIONS</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { label: "Context window (tokens)", value: targetTokens, set: setTargetTokens, placeholder: "e.g. 128000" },
                    { label: "Monthly API calls", value: callsPerMonth, set: setCallsPerMonth, placeholder: "1000" },
                  ].map(({ label, value, set, placeholder }) => (
                    <div key={label}>
                      <label className="mono" style={{ fontSize: 10, color: "var(--muted)", display: "block", marginBottom: 4 }}>{label}</label>
                      <input type="number" value={value} onChange={e => set(e.target.value)} placeholder={placeholder}
                        style={{ width: "100%", background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)", padding: "6px 10px", fontSize: 12, fontFamily: "monospace", outline: "none" }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {stats && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* CLEAN tab */}
            {activeTab === "clean" && (
              <>
                {/* Before / after */}
                <div className="tl-col-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, background: "var(--border)" }}>
                  {[
                    { label: "✗ BEFORE", color: "var(--danger)", data: [["Rows", stats.originalRowCount.toLocaleString()], ["Tokens", stats.originalTokens.toLocaleString()], ["Quality", `${stats.qualityBefore}/100`]] },
                    { label: "✓ AFTER",  color: "var(--accent)", data: [["Rows", stats.cleanedRowCount.toLocaleString()], ["Tokens", stats.cleanedTokens.toLocaleString()], ["Quality", `${stats.qualityAfter}/100`]] },
                  ].map(panel => (
                    <div key={panel.label} style={{ padding: "20px 24px", background: "var(--panel)" }}>
                      <div className="mono" style={{ fontSize: 10, letterSpacing: "0.12em", color: panel.color, marginBottom: 14 }}>{panel.label}</div>
                      {panel.data.map(([k, v]) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontSize: 13, color: "var(--muted)" }}>{k}</span>
                          <span className="mono" style={{ color: panel.color, fontWeight: 600 }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                {/* Key stats */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2, background: "var(--border)" }}>
                  {[
                    { label: "Duplicates removed", value: stats.duplicatesRemoved.toLocaleString(), color: "var(--success)" },
                    { label: "Token reduction",     value: `-${stats.tokenReductionPct}%`,          color: "var(--success)" },
                    { label: "Empty rows removed",  value: stats.emptyRowsRemoved.toLocaleString(),  color: "var(--success)" },
                  ].map(s => (
                    <div key={s.label} style={{ background: "var(--panel)", padding: "16px 20px" }}>
                      <div className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em", marginBottom: 6 }}>{s.label}</div>
                      <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Token quality bar */}
                <div style={{ background: "var(--panel)", border: "1px solid var(--border)", padding: "16px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em" }}>TOKEN REDUCTION</span>
                    <span className="mono" style={{ fontSize: 12, color: "var(--accent)" }}>{stats.originalTokens.toLocaleString()} → {stats.cleanedTokens.toLocaleString()}</span>
                  </div>
                  <Bar pct={stats.tokenReductionPct} color="var(--success)" />
                </div>

                {/* Normalization log */}
                {stats.normalizationLog && stats.normalizationLog.length > 0 && (
                  <NormLog entries={stats.normalizationLog} />
                )}

                {/* Preview */}
                <div style={{ border: "1px solid var(--border)", background: "var(--panel)", overflow: "hidden" }}>
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
                    <span className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em" }}>DATA PREVIEW</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                      <thead>
                        <tr>
                          {stats.headers.slice(0, 8).map(h => (
                            <th key={h} style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", textAlign: "left", background: "var(--panel-2)", color: "var(--accent)", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {stats.previewRows.slice(0, 8).map((row, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                            {row.slice(0, 8).map((cell, j) => (
                              <td key={j} style={{ padding: "7px 14px", color: "var(--text-dim)", fontFamily: "JetBrains Mono, monospace", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Export */}
                <div style={{ background: "var(--panel)", border: "1px solid var(--border)", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <input value={customFileName} onChange={e => setCustomFileName(e.target.value)}
                    style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)", padding: "7px 12px", fontSize: 12, fontFamily: "monospace", outline: "none", flex: 1, minWidth: 200 }} />
                  <button onClick={handleExport} disabled={checkoutLoading}
                    style={{ background: "var(--accent)", color: "var(--surface)", border: "none", padding: "9px 20px", fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer" }}>
                    {checkoutLoading ? "LOADING…" : "EXPORT CSV →"}
                  </button>
                  {credits > 0 && (
                    <button onClick={handleCreditExport}
                      style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", padding: "9px 16px", fontFamily: "JetBrains Mono, monospace", fontSize: 10, cursor: "pointer" }}>
                      USE CREDIT ({credits})
                    </button>
                  )}
                  <RagExportButton stats={stats} tier={tier} />
                </div>
              </>
            )}

            {/* PII tab */}
            {activeTab === "pii" && (
              <div style={{ background: "var(--panel)", border: "1px solid var(--border)", padding: 20 }}>
                <div className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em", marginBottom: 16 }}>PII MASKING REPORT</div>
                {stats.piiMaskEnabled ? (
                  <div>
                    <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: "var(--success)", marginBottom: 12 }}>{stats.piiTotalMasked.toLocaleString()} values masked</div>
                    {Object.entries(stats.piiCountByType).filter(([, v]) => v > 0).map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 13, color: "var(--text-dim)" }}>
                        <span>{k}</span><span className="mono" style={{ color: "var(--success)" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: "var(--muted)" }}>PII masking was off during this run. Enable it in the options panel and re-process.</p>
                )}
              </div>
            )}

            {/* Context tab */}
            {activeTab === "context" && <ContextSizer stats={stats as any} onResize={handleResize} resizing={resizing} />}

            {/* Cost tab */}
            {activeTab === "cost" && stats.costAudit && (
              <div style={{ border: "1px solid var(--border)", background: "var(--panel)", overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
                  <span className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.1em" }}>MONTHLY COST SAVINGS — {stats.callsPerMonth.toLocaleString()} CALLS/MONTH</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 60px", borderBottom: "1px solid var(--border)", padding: "8px 16px" }}>
                  {["Model", "Before", "After", "Save/mo", "%"].map(h => <span key={h} className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em" }}>{h}</span>)}
                </div>
                {stats.costAudit.map((row, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 60px", padding: "10px 16px", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                    <div>
                      <div className="mono" style={{ fontSize: 12, color: "var(--text)" }}>{row.model}</div>
                      <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{row.provider}</div>
                    </div>
                    <span className="mono" style={{ fontSize: 12, color: "var(--danger)", opacity: 0.7 }}>${row.monthlyBefore}</span>
                    <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>${row.monthlyAfter}</span>
                    <span className="mono" style={{ fontSize: 12, color: "var(--success)", fontWeight: 600 }}>${row.monthlySavings}</span>
                    <div style={{ height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: 3, background: "var(--success)", width: `${row.savingsPct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Vector tab */}
            {activeTab === "vector" && <VectorExportPanel stats={stats as any} tier={tier} />}

            {/* Prompt tab */}
            {activeTab === "prompt" && (
              <PromptOutput stats={stats as any} verticalId={verticalId} userInputs={userInputs} />
            )}

            {/* AI streaming + generation — below all tabs */}
            {connectedProviders.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <StreamingOutput
                  stats={{ headers: stats.headers, cleanedData: stats.cleanedData, cleanedRowCount: stats.cleanedRowCount, originalRowCount: stats.originalRowCount, originalTokens: stats.originalTokens, cleanedTokens: stats.cleanedTokens, qualityAfter: stats.qualityAfter }}
                  verticalId={verticalId} userInputs={userInputs} fileName={fileName}
                  onInsightsReady={(text: string) => setAiInsights(text)}
                />
              </div>
            )}

            {aiInsights && (
              <GenerationPanel stats={{ cleanedRowCount: stats.cleanedRowCount, headers: stats.headers, qualityAfter: stats.qualityAfter, cleanedTokens: stats.cleanedTokens }} vertical={verticalId} insights={aiInsights} fileName={fileName} />
            )}

            {kbFileId && (
              <KnowledgeBasePanel fileId={kbFileId} fileName={fileName} vertical={verticalId}
                stats={{ headers: stats.headers, previewRows: stats.previewRows, cleanedData: stats.cleanedData, originalRowCount: stats.originalRowCount, cleanedRowCount: stats.cleanedRowCount, cleanedTokens: stats.cleanedTokens }} />
            )}
          </div>
        )}

        {/* Checkout modal */}
        {checkoutSecret && (
          <CheckoutModal clientSecret={checkoutSecret} onClose={() => setCheckoutSecret(null)} />
        )}
      </div>
    </div>
  );
}

// ── Normalization log ──────────────────────────────────────────────────────────

function NormLog({ entries }: { entries: string[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ border: "1px solid var(--border)", background: "var(--panel)", overflow: "hidden" }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: "100%", background: "none", border: "none", padding: "10px 16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.1em" }}>NORMALIZATIONS APPLIED ({entries.length})</span>
        <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "10px 16px", display: "flex", flexDirection: "column", gap: 5 }}>
          {entries.map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 8 }}>
              <span className="mono" style={{ fontSize: 10, color: "var(--border)" }}>└──</span>
              <span className="mono" style={{ fontSize: 10, color: "var(--text-dim)" }}>{e}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
