"use client";

// VerticalPage.tsx
// A 5-step guided flow used by every vertical (/for/*).
// Steps: Context → Upload → Cleaned → Prompt → AI Insight
// Each step is always visible; completed steps show results inline.
// NO tabs. NO hidden panels. Users see exactly where they are.

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useTheme } from "@/app/components/ThemeProvider";
import { getTier } from "@/lib/csv";
import { storeDataset, clearDataset } from "@/lib/db";
import CheckoutModal from "./CheckoutModal";
import AnalysisDashboard from "./AnalysisDashboard";
import KnowledgeBasePanel from "./KnowledgeBasePanel";
import { getStoredCustomerId, fetchCreditBalance } from "@/lib/credits";
import type { VerticalId } from "@/lib/verticals";
import { extractPDF, pdfResultToCSV } from "./PDFExtractor";

// ── Config passed per vertical ────────────────────────────────────────────────

export interface ContextField {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "select" | "pills";
  options?: string[];
}

export interface VerticalConfig {
  id: VerticalId;
  icon: string;
  title: string;
  tagline: string;           // hero hook
  uploadLabel: string;       // drop zone headline
  uploadSources: string;     // "Maze · UserTesting · Qualtrics · Any CSV"
  contextFields: ContextField[];
  normalizationBadges: string[]; // shown before upload
  buildPrompt: (stats: any, ctx: Record<string, string>) => string;
  maskPII: boolean;
  piiTypes: string[];
  accentColor?: string;      // optional override e.g. "var(--success)" for HR
  disclaimer?: string;       // shown below AI output e.g. trading disclaimer
  confirmGate?: React.ReactNode; // HR privacy gate
}

// ── Step pill ─────────────────────────────────────────────────────────────────

function StepPill({ n, label, done, active }: { n: number; label: string; done: boolean; active: boolean }) {
  const color = done ? "var(--success)" : active ? "var(--accent)" : "var(--border)";
  const textColor = done ? "var(--success)" : active ? "var(--accent)" : "var(--muted)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: done || active ? 1 : 0.45 }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", border: `1.5px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span className="mono" style={{ fontSize: 10, color, fontWeight: 700 }}>{done ? "✓" : n}</span>
      </div>
      <span className="mono" style={{ fontSize: 10, color: textColor, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

function StepConnector({ done }: { done: boolean }) {
  return <div style={{ flex: 1, height: 1, background: done ? "var(--success)" : "var(--border)", opacity: done ? 0.6 : 0.3, transition: "background 0.3s" }} />;
}

// ── Section header ────────────────────────────────────────────────────────────

function Section({ n, label, done, active, children }: { n: number; label: string; done: boolean; active: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          border: `1.5px solid ${done ? "var(--success)" : active ? "var(--accent)" : "var(--border)"}`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          background: done ? "color-mix(in srgb, var(--success) 10%, transparent)" : active ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent",
          transition: "all 0.3s",
        }}>
          <span className="mono" style={{ fontSize: 11, color: done ? "var(--success)" : active ? "var(--accent)" : "var(--muted)", fontWeight: 700 }}>{done ? "✓" : n}</span>
        </div>
        <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: done ? "var(--success)" : active ? "var(--accent)" : "var(--muted)", letterSpacing: "0.1em" }}>{label.toUpperCase()}</span>
        {done && <div style={{ flex: 1, height: 1, background: "var(--success)", opacity: 0.3 }} />}
      </div>
      <div style={{ marginLeft: 38 }}>{children}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VerticalPage({ config }: { config: VerticalConfig }) {
  const { theme, toggle } = useTheme();

  // Step state
  const [step, setStep]     = useState(1); // 1=context, 2=upload, 3=clean, 4=prompt, 5=ai
  const [confirmed, setConfirmed] = useState(!config.confirmGate);

  // Context fields
  const [ctx, setCtx]       = useState<Record<string, string>>({});

  // File / processing
  const [stats, setStats]   = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [progressStep, setProgressStep] = useState("");

  // PDF state
  const [pdfExtracting, setPdfExtracting]       = useState(false);
  const [pdfNeedsPassword, setPdfNeedsPassword] = useState(false);
  const [pdfPassword, setPdfPassword]           = useState("");
  const [pdfPasswordError, setPdfPasswordError] = useState(false);
  const [pendingPDFFile, setPendingPDFFile]     = useState<File|null>(null);
  const [pdfWasOCR, setPdfWasOCR]               = useState(false);

  // Prompt
  const [copied, setCopied] = useState(false);

  // AI
  const [aiInsights, setAiInsights] = useState("");
  const [kbFileId, setKbFileId] = useState("");

  // Checkout
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [credits, setCredits] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const tier = fileSize > 0 ? getTier(fileSize) : null;

  useEffect(() => {
    const cid = getStoredCustomerId();
    if (cid) fetchCreditBalance(cid).then((b: any) => setCredits(b.export ?? 0)).catch(() => {});
  }, []);

  // ── Worker ──────────────────────────────────────────────────────────────────

  const runWorker = (rawData: string, name: string) => {
    setLoading(true); setProgressPct(0); setStats(null);
    const worker = new Worker("/worker.js");
    worker.postMessage({
      action: "START_CLEAN", rawData, fileName: name,
      options: {
        maskPII: config.maskPII, piiTypes: config.piiTypes,
        targetTokens: 0, promptTemplateTokens: 0, callsPerMonth: 1000,
        ragChunkSize: 3, ragOverlap: 0, ragTokenBudget: 512, ragChunkMode: "rows",
        detectedEncoding: "UTF-8", verticalId: config.id,
      },
    });
    worker.onmessage = (m) => {
      if (m.data.action === "PROGRESS") {
        setProgressStep(m.data.step);
        setProgressPct(m.data.pct);
      }
      if (m.data.action === "DONE") {
        setStats(m.data.payload);
        setKbFileId(crypto.randomUUID());
        setStep(3);
        setLoading(false);
        worker.terminate();
      }
    };
    worker.onerror = () => { setLoading(false); worker.terminate(); };
  };

  const processFile = async (file: File) => {
    setFileName(file.name);
    setFileSize(file.size);
    setStats(null);

    // PDF: extract text client-side, convert to CSV rows, then clean
    if (file.name.toLowerCase().endsWith(".pdf")) {
      setPendingPDFFile(file);
      await runPDFExtraction(file, "");
      return;
    }

    // All other formats
    const r = new FileReader();
    r.onload = (e) => runWorker(new TextDecoder().decode(e.target?.result as ArrayBuffer), file.name);
    r.readAsArrayBuffer(file);
  };

  // ── PDF extraction ──────────────────────────────────────────────────────────

  const runPDFExtraction = async (file: File, password: string) => {
    setPdfExtracting(true);
    setPdfNeedsPassword(false);
    setPdfPasswordError(false);
    setPdfWasOCR(false);
    setProgressStep("Loading PDF…");
    setProgressPct(5);
    try {
      const result = await extractPDF(file, password, (p) => {
        setProgressStep(p.message);
        setProgressPct(p.pct);
      });
      setPdfWasOCR(result.wasOCR);
      const csv = pdfResultToCSV(result);
      setPdfExtracting(false);
      setPendingPDFFile(null);
      setPdfPassword("");
      setProgressStep("Cleaning extracted content…");
      runWorker(csv, file.name.replace(/\.pdf$/i, ".csv"));
    } catch (err: any) {
      setPdfExtracting(false);
      setProgressStep("");
      setProgressPct(0);
      if (err?.message === "PDF_PASSWORD_REQUIRED") {
        setPdfNeedsPassword(true);
      } else if (err?.message === "PDF_PASSWORD_INCORRECT") {
        setPdfNeedsPassword(true);
        setPdfPasswordError(true);
      } else {
        console.error("PDF extraction failed:", err);
      }
    }
  };

  // ── Export ──────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    if (!stats || !tier) return;
    setCheckoutLoading(true);
    const id = crypto.randomUUID();
    try {
      await storeDataset(id, stats.cleanedData);
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tier.tier, datasetId: id, exportType: config.maskPII ? "csv_pii" : "csv" }),
      });
      const data = await res.json();
      if (data.clientSecret) setCheckoutSecret(data.clientSecret);
      else await clearDataset(id);
    } catch { await clearDataset(id).catch(() => {}); }
    finally { setCheckoutLoading(false); }
  };

  // ── Prompt ──────────────────────────────────────────────────────────────────

  const aiPrompt = stats ? config.buildPrompt(stats, ctx) : "";
  const copyPrompt = () => {
    navigator.clipboard.writeText(aiPrompt + "\n\n" + (stats?.cleanedData || ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const allCtxFilled = config.contextFields.length === 0 || config.contextFields.some(f => ctx[f.key]?.trim());

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface)", color: "var(--text)" }}>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav style={{
        borderBottom: "1px solid var(--border)", padding: "12px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "var(--surface)", position: "sticky", top: 0, zIndex: 40,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/" className="mono" style={{ color: "var(--accent)", fontWeight: 700, textDecoration: "none", fontSize: 15 }}>
            TokenLift
          </Link>
          <span style={{ color: "var(--border)" }}>·</span>
          <span className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.14em" }}>
            {config.icon} {config.title.toUpperCase()}
          </span>
          {fileName && (
            <><span style={{ color: "var(--border)" }}>·</span>
            <span className="mono" style={{ fontSize: 10, color: "var(--muted)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</span></>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {credits > 0 && (
            <span className="mono" style={{ fontSize: 10, padding: "3px 10px", background: "color-mix(in srgb, var(--accent) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)", color: "var(--accent)" }}>
              🪙 {credits}
            </span>
          )}
          <Link href="/" className="mono" style={{ fontSize: 9, color: "var(--muted)", textDecoration: "none", border: "1px solid var(--border)", padding: "4px 10px", letterSpacing: "0.1em" }}>
            ← HOME
          </Link>
          <button onClick={toggle} style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", padding: "4px 8px", cursor: "pointer", fontSize: 12 }}>
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </nav>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      <div style={{ borderBottom: "1px solid var(--border)", padding: "14px 28px", background: "var(--panel)", display: "flex", alignItems: "center", gap: 10, overflowX: "auto" }}>
        <StepPill n={1} label="Context"  done={step > 1} active={step === 1} />
        <StepConnector done={step > 1} />
        <StepPill n={2} label="Upload"   done={step > 2} active={step === 2} />
        <StepConnector done={step > 2} />
        <StepPill n={3} label="Clean"    done={step > 3} active={step === 3} />
        <StepConnector done={step > 3} />
        <StepPill n={4} label="Prompt"   done={step > 4} active={step === 4} />
        <StepConnector done={step > 4} />
        <StepPill n={5} label="Analysis" done={step > 5} active={step === 5} />
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "36px 24px", display: "flex", flexDirection: "column", gap: 32 }}>

        {/* ── Hero (only before upload) ────────────────────────────────── */}
        {step <= 2 && !loading && (
          <div>
            <div className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.16em", marginBottom: 10 }}>
              {config.icon} {config.title.toUpperCase()}
            </div>
            <h1 style={{ fontSize: "clamp(24px, 4.5vw, 44px)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.05, color: "var(--text)", margin: "0 0 10px" }}>
              {config.tagline}
            </h1>
          </div>
        )}

        {/* ── Privacy confirmation gate (HR) ───────────────────────────── */}
        {!confirmed && config.confirmGate && (
          <div>
            {config.confirmGate}
            <button
              onClick={() => setConfirmed(true)}
              style={{ marginTop: 16, background: "var(--accent)", color: "var(--surface)", border: "none", padding: "10px 22px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >
              I UNDERSTAND — PROCEED
            </button>
          </div>
        )}

        {confirmed && (
          <>
            {/* ── STEP 1: Context ─────────────────────────────────────── */}
            <Section n={1} label="Set your context" done={step > 1} active={step === 1}>
              {config.contextFields.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>No context needed — drop your file to start.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {config.contextFields.map(field => (
                      <div key={field.key}>
                        <label className="mono" style={{ fontSize: 10, color: "var(--muted)", display: "block", marginBottom: 5, letterSpacing: "0.08em" }}>
                          {field.label.toUpperCase()}
                        </label>
                        {field.type === "pills" ? (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {field.options?.map(opt => (
                              <button key={opt} onClick={() => setCtx(c => ({ ...c, [field.key]: opt }))}
                                style={{
                                  background: ctx[field.key] === opt ? "var(--accent)" : "none",
                                  color: ctx[field.key] === opt ? "var(--surface)" : "var(--muted)",
                                  border: `1px solid ${ctx[field.key] === opt ? "var(--accent)" : "var(--border)"}`,
                                  padding: "5px 12px", fontFamily: "JetBrains Mono, monospace",
                                  fontSize: 10, cursor: "pointer", transition: "all 0.12s",
                                }}
                              >{opt}</button>
                            ))}
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={ctx[field.key] || ""}
                            onChange={e => setCtx(c => ({ ...c, [field.key]: e.target.value }))}
                            placeholder={field.placeholder}
                            style={{ width: "100%", background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)", padding: "8px 10px", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  {step === 1 && (
                    <button onClick={() => setStep(2)}
                      style={{ alignSelf: "flex-start", background: "var(--accent)", color: "var(--surface)", border: "none", padding: "9px 20px", fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                      CONTINUE →
                    </button>
                  )}
                </div>
              )}
            </Section>

            {/* ── STEP 2: Upload ───────────────────────────────────────── */}
            {(step >= 2 || config.contextFields.length === 0) && (
              <Section n={2} label="Upload your data" done={step > 2} active={step === 2 || loading}>
                {stats ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ color: "var(--success)", fontSize: 16 }}>✓</span>
                    <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>{fileName}</span>
                    {pdfWasOCR && (
                      <span className="mono" style={{ fontSize: 9, color: "var(--info)", border: "1px solid var(--info)", padding: "2px 8px", letterSpacing: "0.1em" }}>
                        OCR USED
                      </span>
                    )}
                    <button onClick={() => { setStats(null); setStep(2); setFileName(""); setFileSize(0); setAiInsights(""); setPdfWasOCR(false); setPdfNeedsPassword(false); }}
                      style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", fontFamily: "JetBrains Mono, monospace", fontSize: 9, padding: "3px 10px", cursor: "pointer" }}>
                      CHANGE FILE
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* Normalization preview */}
                    {config.normalizationBadges.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                        <span className="mono" style={{ fontSize: 10, color: "var(--muted)", width: "100%", marginBottom: 2 }}>WILL AUTOMATICALLY NORMALIZE:</span>
                        {config.normalizationBadges.map(b => (
                          <span key={b} className="mono" style={{ fontSize: 10, color: "var(--text-dim)", border: "1px solid var(--border)", padding: "3px 10px" }}>✓ {b}</span>
                        ))}
                      </div>
                    )}

                    {/* PDF password gate */}
                    {pdfNeedsPassword && pendingPDFFile && (
                      <div style={{ border: `1px solid ${pdfPasswordError ? "var(--danger)" : "var(--warn)"}`, background: "var(--panel)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                        <div className="mono" style={{ fontSize: 10, color: pdfPasswordError ? "var(--danger)" : "var(--warn)", letterSpacing: "0.1em" }}>
                          {pdfPasswordError ? "✗ INCORRECT PASSWORD" : "🔒 PDF IS PASSWORD-PROTECTED"}
                        </div>
                        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
                          {pdfPasswordError ? "That password didn't work. Try again." : "Enter the PDF password to unlock it."}
                        </p>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            type="password"
                            value={pdfPassword}
                            onChange={e => setPdfPassword(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && pendingPDFFile && runPDFExtraction(pendingPDFFile, pdfPassword)}
                            placeholder="PDF password"
                            autoFocus
                            style={{ flex: 1, background: "var(--panel-2)", border: `1px solid ${pdfPasswordError ? "var(--danger)" : "var(--border)"}`, color: "var(--text)", padding: "8px 10px", fontSize: 13, outline: "none" }}
                          />
                          <button
                            onClick={() => pendingPDFFile && runPDFExtraction(pendingPDFFile, pdfPassword)}
                            disabled={!pdfPassword}
                            style={{ background: "var(--accent)", color: "var(--surface)", border: "none", padding: "8px 16px", fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                          >
                            UNLOCK →
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Drop zone */}
                    <div
                      onDragOver={e => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) processFile(f); }}
                      onClick={() => !loading && inputRef.current?.click()}
                      style={{
                        border: `1px solid ${dragging ? "var(--accent)" : "var(--border)"}`,
                        background: dragging ? "color-mix(in srgb, var(--accent) 4%, var(--panel))" : "var(--panel)",
                        padding: "36px 24px", textAlign: "center",
                        cursor: loading ? "default" : "pointer", transition: "border-color 0.15s",
                      }}
                    >
                      <input ref={inputRef} type="file" accept=".csv,.tsv,.json,.jsonl,.pdf" onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} style={{ display: "none" }} />
                      <div style={{ width: 40, height: 40, margin: "0 auto 14px", border: `1px solid ${loading ? "var(--accent)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", color: loading ? "var(--accent)" : "var(--muted)", fontSize: 18 }}>
                        {loading ? "⟳" : "↑"}
                      </div>
                      <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: loading ? "var(--accent)" : "var(--text)", marginBottom: 6 }}>
                        {pdfExtracting ? progressStep : loading ? (progressStep || "Processing…") : config.uploadLabel}
                      </div>
                      <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 12px" }}>
                        {loading ? `${pdfExtracting ? "Extracting PDF…" : progressPct + "% complete"}` : config.uploadSources}
                      </p>
                      {loading && (
                        <div style={{ height: 2, background: "var(--border)", maxWidth: 300, margin: "0 auto" }}>
                          <div style={{ height: 2, background: "var(--accent)", width: `${progressPct}%`, transition: "width 0.4s" }} />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Section>
            )}

            {/* ── STEP 3: Cleaned results ──────────────────────────────── */}
            {stats && (
              <Section n={3} label="Data cleaned" done={step > 3} active={step === 3}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Stats row */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 2, background: "var(--border)" }}>
                    {[
                      { label: stats.piiTotalMasked > 0 ? "PII masked" : "Rows cleaned", value: stats.piiTotalMasked > 0 ? stats.piiTotalMasked?.toLocaleString() : stats.cleanedRowCount?.toLocaleString(), color: "var(--success)" },
                      { label: "Duplicates out", value: stats.duplicatesRemoved?.toLocaleString(), color: "var(--success)" },
                      { label: "Token reduction", value: `-${stats.tokenReductionPct}%`, color: "var(--success)" },
                      { label: "Quality score", value: `${stats.qualityAfter}/100`, color: "var(--accent)" },
                    ].map(s => (
                      <div key={s.label} style={{ background: "var(--panel)", padding: "14px 16px" }}>
                        <div className="mono" style={{ fontSize: 20, fontWeight: 800, color: s.color, marginBottom: 3 }}>{s.value}</div>
                        <div className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.08em" }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Normalization log */}
                  {stats.normalizationLog?.length > 0 && (
                    <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: "12px 16px" }}>
                      <div className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.1em", marginBottom: 8 }}>NORMALIZATIONS APPLIED ({stats.normalizationLog.length})</div>
                      {stats.normalizationLog.map((e: string, i: number) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                          <span className="mono" style={{ fontSize: 10, color: "var(--border)" }}>└──</span>
                          <span className="mono" style={{ fontSize: 10, color: "var(--text-dim)" }}>{e}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Data preview */}
                  <div style={{ border: "1px solid var(--border)", background: "var(--panel)", overflow: "hidden" }}>
                    <div style={{ padding: "9px 14px", borderBottom: "1px solid var(--border)" }}>
                      <span className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em" }}>DATA PREVIEW — {stats.headers?.length} COLUMNS · {stats.cleanedRowCount?.toLocaleString()} ROWS</span>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                        <thead><tr>{stats.headers?.slice(0, 7).map((h: string) => <th key={h} style={{ padding: "7px 14px", borderBottom: "1px solid var(--border)", textAlign: "left", background: "var(--panel-2)", color: "var(--accent)", fontFamily: "monospace", fontSize: 10, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                        <tbody>{stats.previewRows?.slice(0, 5).map((row: string[], i: number) => (
                          <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                            {row.slice(0, 7).map((c, j) => (
                              <td key={j} style={{ padding: "6px 14px", color: c === "[MASKED]" ? "var(--muted)" : "var(--text-dim)", fontFamily: "monospace", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: c === "[MASKED]" ? "italic" : "normal" }}>{c}</td>
                            ))}
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>

                  {/* Export + continue */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button onClick={handleExport} disabled={checkoutLoading}
                      style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--muted)", padding: "7px 16px", fontFamily: "JetBrains Mono, monospace", fontSize: 10, cursor: "pointer" }}>
                      {checkoutLoading ? "…" : `EXPORT CSV ${tier ? `— ${tier.price}` : ""}`}
                    </button>
                    <button onClick={() => setStep(4)}
                      style={{ background: "var(--accent)", color: "var(--surface)", border: "none", padding: "9px 20px", fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                      BUILD AI PROMPT →
                    </button>
                  </div>
                </div>
              </Section>
            )}

            {/* ── STEP 4: AI Prompt ────────────────────────────────────── */}
            {stats && step >= 4 && (
              <Section n={4} label="Your AI prompt" done={step > 4} active={step === 4}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
                    This prompt is built from your actual data — not a generic template. Copy it into Claude or ChatGPT. Your cleaned dataset is included automatically when you click copy.
                  </p>

                  <div style={{ border: "1px solid var(--border)", background: "var(--panel)", overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.1em" }}>GENERATED PROMPT · ~{Math.round(aiPrompt.length / 4).toLocaleString()} TOKENS</span>
                      <button onClick={copyPrompt}
                        style={{ background: copied ? "var(--success)" : "var(--accent)", color: "var(--surface)", border: "none", padding: "5px 14px", fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 700, cursor: "pointer", transition: "background 0.2s" }}>
                        {copied ? "COPIED ✓" : "COPY PROMPT + DATA"}
                      </button>
                    </div>
                    <pre style={{ margin: 0, padding: "14px 16px", fontSize: 11, color: "var(--text-dim)", fontFamily: "monospace", lineHeight: 1.8, whiteSpace: "pre-wrap", maxHeight: 260, overflowY: "auto" }}>
                      {aiPrompt}
                    </pre>
                    {config.disclaimer && (
                      <div style={{ padding: "8px 14px", borderTop: "1px solid var(--border)", background: "color-mix(in srgb, var(--warn) 5%, transparent)" }}>
                        <span className="mono" style={{ fontSize: 10, color: "var(--warn)" }}>⚠ {config.disclaimer}</span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setStep(5)}
                      style={{ background: "var(--accent)", color: "var(--surface)", border: "none", padding: "9px 20px", fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                      ANALYZE →
                    </button>
                    <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>or copy the prompt above to use manually</span>
                  </div>
                </div>
              </Section>
            )}

            {/* ── STEP 5: Analysis Dashboard ───────────────────────────── */}
            {stats && step >= 5 && (
              <Section n={5} label="Analysis" done={false} active={true}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <AnalysisDashboard
                    prompt={aiPrompt}
                    cleanedData={stats.cleanedData ?? ""}
                    stats={{
                      cleanedRowCount:  stats.cleanedRowCount,
                      originalRowCount: stats.originalRowCount,
                      headers:          stats.headers,
                      qualityAfter:     stats.qualityAfter,
                      tokenReductionPct: stats.tokenReductionPct,
                      cleanedTokens:    stats.cleanedTokens,
                    }}
                    vertical={config.id}
                    fileName={fileName}
                    disclaimer={config.disclaimer}
                    onComplete={(text) => setAiInsights(text)}
                  />

                  {kbFileId && (
                    <KnowledgeBasePanel
                      fileId={kbFileId}
                      fileName={fileName}
                      vertical={config.id}
                      stats={{
                        headers:          stats.headers,
                        previewRows:      stats.previewRows,
                        cleanedData:      stats.cleanedData,
                        originalRowCount: stats.originalRowCount,
                        cleanedRowCount:  stats.cleanedRowCount,
                        cleanedTokens:    stats.cleanedTokens,
                      }}
                    />
                  )}
                </div>
              </Section>
            )}
          </>
        )}
      </div>

      {checkoutSecret && <CheckoutModal clientSecret={checkoutSecret} onClose={() => setCheckoutSecret(null)} />}
    </div>
  );
}
