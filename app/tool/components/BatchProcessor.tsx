"use client";

import { useState } from "react";
import JSZip from "jszip";
import { getTier } from "@/lib/csv";
import { storeDataset, clearDataset } from "@/lib/db";
import CheckoutModal from "./CheckoutModal";

interface FileResult {
  name: string;
  status: "pending" | "processing" | "done" | "error";
  cleanedData?: string;
  tokenReductionPct?: number;
  cleanedRowCount?: number;
}

interface Props {
  onExit: () => void;
}

export default function BatchProcessor({ onExit }: Props) {
  const [files, setFiles] = useState<FileResult[]>([]);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const allDone = files.length > 0 && files.every(f => f.status === "done" || f.status === "error");

  const processFiles = (incoming: File[]) => {
    const initial: FileResult[] = incoming.map(f => ({ name: f.name, status: "pending" }));
    setFiles(initial);

    incoming.forEach((file, idx) => {
      setFiles(prev => prev.map((f, i) => i === idx ? { ...f, status: "processing" } : f));
      const reader = new FileReader();
      reader.onload = (ev) => {
        const rawData = ev.target?.result as string;
        const worker = new Worker("/worker.js");
        worker.postMessage({
          action: "START_CLEAN", rawData, fileName: file.name,
          options: { maskPII: false, piiTypes: [], targetTokens: 0, promptTemplateTokens: 0, callsPerMonth: 1000 },
        });
        worker.onmessage = (m) => {
          if (m.data.action === "DONE") {
            const p = m.data.payload;
            setFiles(prev => prev.map((f, i) => i === idx ? {
              ...f, status: "done",
              cleanedData: p.cleanedData,
              tokenReductionPct: p.tokenReductionPct,
              cleanedRowCount: p.cleanedRowCount,
            } : f));
          }
          worker.terminate();
        };
        worker.onerror = () => {
          setFiles(prev => prev.map((f, i) => i === idx ? { ...f, status: "error" } : f));
          worker.terminate();
        };
      };
      reader.readAsText(file);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter(f =>
      /\.(csv|tsv|json|jsonl|xml)$/i.test(f.name)
    );
    if (dropped.length) processFiles(dropped);
  };

  const handleDownloadZip = async () => {
    const done = files.filter(f => f.status === "done" && f.cleanedData);
    if (!done.length) return;

    const totalSize = done.reduce((acc, f) => acc + (f.cleanedData?.length || 0), 0);
    const tier = getTier(totalSize);
    if (!tier) return;

    setCheckoutLoading(true);

    // Build ZIP in browser
    const zip = new JSZip();
    done.forEach((f, i) => zip.file(`tokenlift_cleaned_${i + 1}.csv`, f.cleanedData!));
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const zipText = await zipBlob.text();

    const id = crypto.randomUUID();
    try {
      await storeDataset(id, zipText);
      setBatchId(id);

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tier.tier, datasetId: id, exportType: "csv" }),
      });
      const data = await res.json();

      if (data.clientSecret) {
        setCheckoutSecret(data.clientSecret);
        setCheckoutLoading(false);
        return;
      }

      // No client secret returned — clean up and reset
      await clearDataset(id).catch(() => {});
      setBatchId(null);
      setCheckoutLoading(false);
    } catch {
      if (id) await clearDataset(id).catch(() => {});
      setBatchId(null);
      setCheckoutLoading(false);
    }
  };

  const totalReduction = files.filter(f => f.status === "done").reduce((a, f) => a + (f.tokenReductionPct || 0), 0);
  const avgReduction = files.filter(f => f.status === "done").length
    ? Math.round(totalReduction / files.filter(f => f.status === "done").length)
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.12em" }}>
          BATCH MODE — {files.length} FILE{files.length !== 1 ? "S" : ""}
        </div>
        <button onClick={onExit}
          style={{ background: "none", border: "none", color: "var(--muted)", fontFamily: "monospace", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
          ← single file mode
        </button>
      </div>

      {files.length === 0 ? (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          style={{ border: "2px dashed var(--border)", padding: "48px 24px", textAlign: "center", cursor: "default" }}
        >
          <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>DROP MULTIPLE FILES HERE</div>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>CSV · TSV · JSON · JSONL · XML · All processed in parallel</p>
          <input type="file" multiple accept=".csv,.tsv,.json,.jsonl,.xml"
            onChange={e => { const f = Array.from(e.target.files || []); if (f.length) processFiles(f); }}
            style={{ display: "none" }} id="batch-input" />
          <label htmlFor="batch-input" className="mono"
            style={{ display: "inline-block", marginTop: 16, border: "1px solid var(--border)", padding: "8px 20px", fontSize: 11, color: "var(--muted)", cursor: "pointer" }}>
            or browse files
          </label>
        </div>
      ) : (
        <>
          <div style={{ background: "var(--panel)", border: "1px solid var(--border)", overflow: "hidden" }}>
            {files.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: f.status === "done" ? "var(--success, #4caf50)" : f.status === "error" ? "var(--danger)" : f.status === "processing" ? "var(--accent)" : "var(--border)" }} />
                <span className="mono" style={{ fontSize: 12, color: "var(--text)", flex: 1 }}>{f.name}</span>
                {f.status === "done" && (
                  <>
                    <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{f.cleanedRowCount?.toLocaleString()} rows</span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>-{f.tokenReductionPct}% tokens</span>
                  </>
                )}
                {f.status === "processing" && <span className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>processing…</span>}
                {f.status === "error" && <span className="mono" style={{ fontSize: 11, color: "var(--danger)" }}>error</span>}
              </div>
            ))}
          </div>

          {allDone && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, background: "var(--border)" }}>
                <div style={{ background: "var(--panel)", padding: 16 }}>
                  <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>Files processed</div>
                  <div className="mono" style={{ fontSize: 20, fontWeight: 600, color: "var(--accent)" }}>{files.filter(f => f.status === "done").length}</div>
                </div>
                <div style={{ background: "var(--panel)", padding: 16 }}>
                  <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>Avg token reduction</div>
                  <div className="mono" style={{ fontSize: 20, fontWeight: 600, color: "var(--accent)" }}>-{avgReduction}%</div>
                </div>
              </div>
              <button onClick={handleDownloadZip} disabled={checkoutLoading}
                style={{ background: "var(--accent)", color: "var(--surface)", border: "none", padding: "16px 24px", fontFamily: "monospace", fontSize: 13, fontWeight: 700, cursor: checkoutLoading ? "not-allowed" : "pointer", opacity: checkoutLoading ? 0.5 : 1, letterSpacing: "0.05em" }}>
                {checkoutLoading ? "REDIRECTING TO CHECKOUT…" : `EXPORT ALL AS ZIP (${files.filter(f => f.status === "done").length} files)`}
              </button>
            </>
          )}
        </>
      )}
      {checkoutSecret && (
        <CheckoutModal
          clientSecret={checkoutSecret}
          onClose={() => {
            setCheckoutSecret(null);
            if (batchId) clearDataset(batchId).catch(() => {});
            setBatchId(null);
          }}
        />
      )}
    </div>
  );
}
