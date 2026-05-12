"use client";

import { useState } from "react";
import {
  saveCleanedDataset,
  type SavedFile,
} from "@/lib/opfs";
import {
  loadEmbeddingModel,
  isModelLoaded,
  isModelLoading,
} from "@/lib/embeddings";
import { indexDataset } from "@/lib/knowledge-base";

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  fileId: string;
  fileName: string;
  vertical: string;
  stats: {
    headers: string[];
    previewRows: string[][];
    cleanedData: string;
    originalRowCount: number;
    cleanedRowCount: number;
    cleanedTokens: number;
  };
  onSaved?: () => void;
}

// ── Status type ──────────────────────────────────────────────────────────────

type Status =
  | "idle"
  | "model_loading"
  | "saving"
  | "indexing"
  | "done"
  | "done_no_index"
  | "error";

// ─────────────────────────────────────────────────────────────────────────────

export default function KnowledgeBasePanel({
  fileId,
  fileName,
  vertical,
  stats,
  onSaved,
}: Props) {
  const [modelLoaded, setModelLoaded] = useState(isModelLoaded());
  const [modelPct, setModelPct]       = useState(0);
  const [status, setStatus]           = useState<Status>("idle");
  const [embedProgress, setEmbedProgress] = useState({ done: 0, total: 0 });
  const [error, setError]             = useState<string | null>(null);
  const [dismissed, setDismissed]     = useState(false);

  if (dismissed) return null;

  // ── Enable model ────────────────────────────────────────────────────────────

  const handleEnableModel = async () => {
    if (isModelLoading()) return;
    setStatus("model_loading");
    setModelPct(0);
    try {
      await loadEmbeddingModel((pct) => setModelPct(pct));
      setModelLoaded(true);
      setStatus("idle");
    } catch {
      setStatus("error");
      setError("Model download failed. Check your connection and try again.");
    }
  };

  // ── Save without indexing ───────────────────────────────────────────────────

  const handleSaveOnly = async () => {
    setStatus("saving");
    setError(null);
    try {
      const metadata: SavedFile = {
        id:            fileId,
        fileName,
        savedAt:       Date.now(),
        originalRows:  stats.originalRowCount,
        cleanedRows:   stats.cleanedRowCount,
        tokenCount:    stats.cleanedTokens,
        vertical,
        headers:       stats.headers,
        sizeBytes:     new Blob([stats.cleanedData]).size,
        hasEmbeddings: false,
      };
      await saveCleanedDataset(fileId, stats.cleanedData, metadata);
      setStatus("done_no_index");
      onSaved?.();
    } catch (e) {
      setStatus("error");
      setError("Save failed. Your browser may not support OPFS or storage may be full.");
    }
  };

  // ── Save and index ──────────────────────────────────────────────────────────

  const handleSaveAndIndex = async () => {
    setStatus("saving");
    setError(null);
    try {
      // 1. Save CSV + metadata
      const metadata: SavedFile = {
        id:            fileId,
        fileName,
        savedAt:       Date.now(),
        originalRows:  stats.originalRowCount,
        cleanedRows:   stats.cleanedRowCount,
        tokenCount:    stats.cleanedTokens,
        vertical,
        headers:       stats.headers,
        sizeBytes:     new Blob([stats.cleanedData]).size,
        hasEmbeddings: false, // will be set true by indexDataset
      };
      await saveCleanedDataset(fileId, stats.cleanedData, metadata);

      // 2. Generate embeddings + save vectors
      setStatus("indexing");
      setEmbedProgress({ done: 0, total: stats.cleanedRowCount });

      await indexDataset(
        fileId,
        fileName,
        stats.headers,
        stats.previewRows, // use previewRows — full rows from worker payload
        (done, total) => setEmbedProgress({ done, total })
      );

      setStatus("done");
      onSaved?.();
    } catch (e) {
      setStatus("error");
      setError(
        String(e).includes("Model not loaded")
          ? "Embedding model not loaded. Enable semantic search first."
          : "Save failed. Your browser may not support OPFS or storage may be full."
      );
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{
      border: "1px solid var(--border)",
      background: "var(--panel)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px",
        borderBottom: status !== "done" && status !== "done_no_index" ? "1px solid var(--border)" : "none",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em" }}>
          ◈ SAVE TO KNOWLEDGE BASE
        </span>
        {status === "idle" || status === "model_loading" ? (
          <button
            onClick={() => setDismissed(true)}
            style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 13, cursor: "pointer", padding: "0 4px" }}
          >
            ✕
          </button>
        ) : null}
      </div>

      {/* ── DONE states ──────────────────────────────────────────────────── */}
      {status === "done" && (
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "var(--success)", fontSize: 16 }}>✓</span>
          <div>
            <div style={{ fontSize: 13, color: "var(--text)" }}>Added to knowledge base</div>
            <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
              {stats.cleanedRowCount.toLocaleString()} rows indexed · searchable at{" "}
              <a href="/kb" style={{ color: "var(--accent)", textDecoration: "none" }}>/kb</a>
            </div>
          </div>
        </div>
      )}

      {status === "done_no_index" && (
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "var(--success)", fontSize: 16 }}>✓</span>
          <div>
            <div style={{ fontSize: 13, color: "var(--text)" }}>Saved to your computer</div>
            <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
              Not indexed — semantic search unavailable for this file ·{" "}
              <a href="/kb" style={{ color: "var(--accent)", textDecoration: "none" }}>view at /kb</a>
            </div>
          </div>
        </div>
      )}

      {/* ── ERROR ────────────────────────────────────────────────────────── */}
      {status === "error" && (
        <div style={{ padding: "14px 16px" }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--danger)", marginBottom: 6 }}>ERROR</div>
          <div style={{ fontSize: 13, color: "var(--text-dim)" }}>{error}</div>
          <button
            onClick={() => { setStatus("idle"); setError(null); }}
            style={{
              marginTop: 10, background: "none",
              border: "1px solid var(--border)", color: "var(--muted)",
              fontFamily: "JetBrains Mono, monospace", fontSize: 10,
              padding: "5px 12px", cursor: "pointer", letterSpacing: "0.06em",
            }}
          >
            TRY AGAIN
          </button>
        </div>
      )}

      {/* ── MODEL LOADING ─────────────────────────────────────────────────── */}
      {status === "model_loading" && (
        <div style={{ padding: "16px" }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginBottom: 10 }}>
            DOWNLOADING MODEL… {modelPct}%
          </div>
          <div style={{ height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
            <div style={{
              height: 3, background: "var(--accent)", borderRadius: 2,
              width: `${modelPct}%`, transition: "width 0.3s",
            }} />
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            22MB · downloads once · cached in your browser forever
          </div>
        </div>
      )}

      {/* ── SAVING ────────────────────────────────────────────────────────── */}
      {status === "saving" && (
        <div style={{ padding: "14px 16px" }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em" }}>
            SAVING TO YOUR COMPUTER…
          </div>
        </div>
      )}

      {/* ── INDEXING ──────────────────────────────────────────────────────── */}
      {status === "indexing" && (
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
            Generating embeddings…{" "}
            <span className="mono" style={{ color: "var(--text)" }}>
              {embedProgress.done.toLocaleString()} / {embedProgress.total.toLocaleString()} rows
            </span>
          </div>
          <div style={{ height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: 3, background: "var(--accent)", borderRadius: 2,
              width: embedProgress.total > 0
                ? `${Math.round((embedProgress.done / embedProgress.total) * 100)}%`
                : "0%",
              transition: "width 0.3s",
            }} />
          </div>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
            Saving to your computer…
          </div>
        </div>
      )}

      {/* ── IDLE — model NOT loaded ───────────────────────────────────────── */}
      {status === "idle" && !modelLoaded && (
        <div style={{ padding: "16px" }}>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6 }}>
            Enable semantic search?
          </p>
          <ul style={{ margin: "0 0 16px", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {[
              "Download 22MB AI model once",
              "Cached on your computer forever",
              "No internet needed after download",
            ].map((line) => (
              <li key={line} style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                {line}
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={handleEnableModel}
              style={{
                background: "var(--accent)", color: "var(--surface)",
                border: "none", padding: "8px 18px",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10, fontWeight: 700,
                letterSpacing: "0.08em", cursor: "pointer",
              }}
            >
              ENABLE SEMANTIC SEARCH
            </button>
            <button
              onClick={handleSaveOnly}
              style={{
                background: "none", color: "var(--muted)",
                border: "1px solid var(--border)", padding: "8px 14px",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10, letterSpacing: "0.06em", cursor: "pointer",
              }}
            >
              SAVE WITHOUT INDEXING
            </button>
          </div>
        </div>
      )}

      {/* ── IDLE — model loaded ───────────────────────────────────────────── */}
      {status === "idle" && modelLoaded && (
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>
            Save{" "}
            <span className="mono" style={{ color: "var(--text)", fontSize: 11 }}>{fileName}</span>{" "}
            to your local knowledge base for semantic search across all your files.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={handleSaveAndIndex}
              style={{
                background: "var(--accent)", color: "var(--surface)",
                border: "none", padding: "8px 18px",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10, fontWeight: 700,
                letterSpacing: "0.08em", cursor: "pointer",
              }}
            >
              SAVE AND INDEX →
            </button>
            <button
              onClick={handleSaveOnly}
              style={{
                background: "none", color: "var(--muted)",
                border: "1px solid var(--border)", padding: "8px 14px",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10, letterSpacing: "0.06em", cursor: "pointer",
              }}
            >
              SAVE WITHOUT INDEXING
            </button>
            <button
              onClick={() => setDismissed(true)}
              style={{
                background: "none", color: "var(--muted)",
                border: "none", padding: "8px 10px",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10, cursor: "pointer",
              }}
            >
              DON&apos;T SAVE
            </button>
          </div>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
            Stored on your computer only · never uploaded · searchable at{" "}
            <a href="/kb" style={{ color: "var(--accent)", textDecoration: "none" }}>/kb</a>
          </div>
        </div>
      )}
    </div>
  );
}
