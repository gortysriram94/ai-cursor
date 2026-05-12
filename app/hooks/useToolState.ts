// app/hooks/useToolState.ts
// Shared processing state + handlers extracted from tool/page.tsx.
// Used by /tool (general) and all /for/[vertical] pages.
// Zero UI — pure logic.

"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme } from "@/app/components/ThemeProvider";
import { storeDataset, clearDataset } from "@/lib/db";
import { getTier } from "@/lib/csv";
import { getStoredCustomerId, fetchCreditBalance, deductCredit } from "@/lib/credits";
import { loadPersistedKeys, type Provider } from "@/lib/byok";
import type { VerticalId } from "@/lib/verticals";

export interface CleanStats {
  headers: string[]; previewRows: string[][]; cleanedData: string; inputFormat: string;
  delimiterLabel: string; detectedEncoding: string;
  originalRowCount: number; cleanedRowCount: number;
  duplicatesRemoved: number; emptyRowsRemoved: number; redundantColumnsRemoved: number;
  originalCharCount: number; cleanedCharCount: number;
  originalTokens: number; cleanedTokens: number; tokenReductionPct: number;
  qualityBefore: number; qualityAfter: number;
  piiSuspectColumns: string[]; piiMaskEnabled: boolean;
  piiTotalMasked: number; piiCountByType: Record<string, number>;
  contextTargetTokens: number; contextRowsDropped: number; contextTokensFit: number;
  costAudit: CostAuditRow[]; promptTemplateTokens: number; callsPerMonth: number;
  ragJsonl: string;
  normalizationLog?: string[];
}

export interface CostAuditRow {
  provider: string; model: string; inputPer1k: number;
  costPerCallBefore: string; costPerCallAfter: string;
  monthlyBefore: string; monthlyAfter: string;
  monthlySavings: string; savingsPct: number;
}

export function useToolState(defaultVertical: VerticalId = "general") {
  // Core
  const [stats, setStats]               = useState<CleanStats | null>(null);
  const [loading, setLoading]           = useState(false);
  const [dragging, setDragging]         = useState(false);
  const [fileName, setFileName]         = useState("");
  const [fileSize, setFileSize]         = useState(0);
  const [progressStep, setProgressStep] = useState("");
  const [progressPct, setProgressPct]   = useState(0);
  const [pendingHeaders, setPendingHeaders] = useState<string[] | null>(null);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [customFileName, setCustomFileName] = useState("");
  const [detectedEncoding, setDetectedEncoding] = useState<string | null>(null);
  const [batchMode, setBatchMode]       = useState(false);
  const [resizing, setResizing]         = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutSecret, setCheckoutSecret]   = useState<string | null>(null);
  const [credits, setCredits]           = useState(0);

  // Options
  const [maskPII, setMaskPII]           = useState(defaultVertical === "hr_people"); // HR defaults PII on
  const [piiTypes, setPiiTypes]         = useState<string[]>(["email","phone","ssn","creditCard","ipv4","uuid","zipCode","dob"]);
  const [targetTokens, setTargetTokens] = useState("");
  const [promptTemplate, setPromptTemplate] = useState("");
  const [callsPerMonth, setCallsPerMonth]   = useState("1000");
  const [ragChunkSize, setRagChunkSize]     = useState("3");
  const [ragOverlap, setRagOverlap]         = useState("0");
  const [ragTokenBudget, setRagTokenBudget] = useState("512");
  const [ragChunkMode, setRagChunkMode]     = useState<"rows" | "tokens" | "column">("rows");

  // Vertical
  const [verticalId, setVerticalId]     = useState<VerticalId>(defaultVertical);
  const [userInputs, setUserInputs]     = useState<Record<string, string>>({});
  const [kbFileId, setKbFileId]         = useState("");
  const [aiInsights, setAiInsights]     = useState("");
  const [connectedProviders, setConnectedProviders] = useState<Provider[]>([]);

  const { theme, toggle: toggleTheme }  = useTheme();
  const inputRef    = useRef<HTMLInputElement>(null);
  const lastFileRef = useRef<{ rawData: string; fileName: string; fileBuffer?: ArrayBuffer } | null>(null);

  const tier = fileSize > 0 ? getTier(fileSize) : null;

  useEffect(() => {
    loadPersistedKeys();
    const customerId = getStoredCustomerId();
    if (customerId) {
      fetchCreditBalance(customerId)
        .then(b => setCredits((b as any).export ?? 0))
        .catch(() => {});
    }
  }, []);

  // ── Worker runner ────────────────────────────────────────────────────────────

  const runWorker = (rawData: string, workerFileName: string, fileBuffer?: ArrayBuffer) => {
    lastFileRef.current = { rawData, fileName: workerFileName, fileBuffer };
    setLoading(true);
    setPendingHeaders(null);
    const worker = new Worker("/worker.js");
    const opts = {
      maskPII, piiTypes,
      targetTokens:         parseInt(targetTokens) || 0,
      promptTemplateTokens: Math.ceil((promptTemplate.length || 0) / 4),
      callsPerMonth:        parseInt(callsPerMonth) || 1000,
      ragChunkSize:         parseInt(ragChunkSize) || 3,
      ragOverlap:           parseInt(ragOverlap) || 0,
      ragTokenBudget:       parseInt(ragTokenBudget) || 512,
      ragChunkMode, detectedEncoding: detectedEncoding || "UTF-8",
      verticalId,
    };
    worker.postMessage({ action: "START_CLEAN", rawData, fileName: workerFileName, fileBuffer, options: opts });
    worker.onmessage = (m) => {
      if (m.data.action === "PROGRESS") { setProgressStep(m.data.step); setProgressPct(m.data.pct); }
      if (m.data.action === "DONE") {
        setProgressStep(""); setProgressPct(0);
        setStats(m.data.payload); setKbFileId(crypto.randomUUID());
        setLoading(false); worker.terminate();
      }
    };
    worker.onerror = () => { setLoading(false); worker.terminate(); };
  };

  // ── File handlers ────────────────────────────────────────────────────────────

  const handleColumnConfirm = (selected: string[], renames: Record<string, string>) => {
    const stored = lastFileRef.current;
    if (!stored) return;
    const lines = stored.rawData.split("\n");
    const origHeaders = lines[0].split(",");
    const selectedIdx = origHeaders.map((h, i) => selected.includes(h) ? i : -1).filter(i => i !== -1);
    const newHeaders = selectedIdx.map(i => renames[origHeaders[i]] || origHeaders[i]);
    const filtered = [newHeaders.join(","), ...lines.slice(1).filter(l => l.trim()).map(l => {
      const cells = l.split(",");
      return selectedIdx.map(i => cells[i] ?? "").join(",");
    })].join("\n");
    runWorker(filtered, stored.fileName);
  };

  const processFile = (file: File) => {
    setFileName(file.name); setFileSize(file.size);
    setStats(null); setUserInputs({});
    setCustomFileName(`optimized_${file.name.replace(/\.[^/.]+$/, "")}`);
    const isParquet = file.name.toLowerCase().endsWith(".parquet");
    if (isParquet) {
      const r = new FileReader();
      r.onload = (ev) => runWorker("", file.name, ev.target?.result as ArrayBuffer);
      r.readAsArrayBuffer(file);
    } else {
      const r = new FileReader();
      r.onload = (ev) => {
        const buf = ev.target?.result as ArrayBuffer;
        const bytes = new Uint8Array(buf);
        let encoding = "UTF-8";
        if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) encoding = "UTF-8 (BOM)";
        else if (bytes[0] === 0xFF && bytes[1] === 0xFE) encoding = "UTF-16 LE";
        else if (bytes[0] === 0xFE && bytes[1] === 0xFF) encoding = "UTF-16 BE";
        else { const sample = bytes.slice(0, Math.min(4096, bytes.length)); if (sample.some(b => b >= 0x80 && b <= 0x9F)) encoding = "Windows-1252"; }
        setDetectedEncoding(encoding);
        let decoderLabel = "utf-8";
        if (encoding === "Windows-1252") decoderLabel = "windows-1252";
        else if (encoding === "UTF-16 LE") decoderLabel = "utf-16le";
        else if (encoding === "UTF-16 BE") decoderLabel = "utf-16be";
        const rawData = new TextDecoder(decoderLabel).decode(buf);
        lastFileRef.current = { rawData, fileName: file.name };
        const firstLine = rawData.split("\n")[0] || "";
        const headers = firstLine.split(",").map(h => h.trim().replace(/^"|"$/g, ""));
        if (headers.length > 1) setPendingHeaders(headers);
        runWorker(rawData, file.name);
      };
      r.readAsArrayBuffer(file);
    }
  };

  const loadSampleData = async () => {
    setLoading(true); setStats(null);
    const res = await fetch("/sample.csv");
    const text = await res.text();
    processFile(new File([new Blob([text], { type: "text/csv" })], "sample-ai-reviews.csv", { type: "text/csv" }));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleResize = (tokens: number) => {
    if (!lastFileRef.current) return;
    setResizing(true);
    const { rawData, fileName: fn, fileBuffer } = lastFileRef.current;
    const worker = new Worker("/worker.js");
    const opts = { maskPII, piiTypes, targetTokens: tokens, promptTemplateTokens: Math.ceil((promptTemplate.length || 0) / 4), callsPerMonth: parseInt(callsPerMonth) || 1000 };
    worker.postMessage({ action: "START_CLEAN", rawData, fileName: fn, fileBuffer, options: opts });
    worker.onmessage = (m) => {
      if (m.data.action === "DONE") {
        setStats(m.data.payload);
        setResizing(false);
        worker.terminate();
      }
    };
    worker.onerror = () => { setResizing(false); worker.terminate(); };
  };

  const handleExport = async () => {
    if (!stats || !tier) return;
    setCheckoutLoading(true);
    const id = crypto.randomUUID();
    const exportType = stats.piiMaskEnabled ? "csv_pii" : "csv";
    const safeName = customFileName.trim().replace(/[^a-zA-Z0-9_\-. ]/g, "").trim() || "optimized";
    localStorage.setItem(`tokenlift_fname_${id}`, safeName);
    try {
      await storeDataset(id, stats.cleanedData);
      const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier: tier.tier, datasetId: id, exportType }) });
      const data = await res.json();
      if (data.clientSecret) setCheckoutSecret(data.clientSecret);
      else await clearDataset(id);
    } catch { await clearDataset(id).catch(() => {}); }
    finally { setCheckoutLoading(false); }
  };

  const handleCreditExport = async () => {
    if (!stats) return;
    const customerId = getStoredCustomerId();
    if (!customerId) return;
    const result = await deductCredit(customerId, "export", 1);
    if (!result.success) { if (result.error === "insufficient_credits") alert("No export credits remaining. Please purchase a credit pack."); return; }
    setCredits(result.newBalance);
    const blob = new Blob([stats.cleanedData], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: `${customFileName || "optimized"}.csv` });
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStats(null); setFileName(""); setFileSize(0); setPendingHeaders(null);
    setShowColumnSelector(false); setProgressStep(""); setProgressPct(0); setDetectedEncoding(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return {
    // state
    stats, loading, dragging, setDragging, fileName, fileSize, progressStep, progressPct,
    pendingHeaders, showColumnSelector, setShowColumnSelector, customFileName, setCustomFileName,
    batchMode, setBatchMode, resizing, checkoutLoading, checkoutSecret, setCheckoutSecret, credits,
    maskPII, setMaskPII, piiTypes, setPiiTypes, targetTokens, setTargetTokens,
    promptTemplate, setPromptTemplate, callsPerMonth, setCallsPerMonth,
    ragChunkSize, setRagChunkSize, ragOverlap, setRagOverlap, ragTokenBudget, setRagTokenBudget,
    ragChunkMode, setRagChunkMode,
    verticalId, setVerticalId, userInputs, setUserInputs, kbFileId, aiInsights, setAiInsights,
    connectedProviders, setConnectedProviders,
    theme, toggleTheme, tier, inputRef,
    // handlers
    processFile, handleDrop, loadSampleData, handleColumnConfirm,
    handleResize, handleExport, handleCreditExport, reset,
  };
}