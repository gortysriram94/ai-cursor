"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  listSavedFiles,
  deleteDataset,
  getStorageUsage,
  formatBytes,
  clearAllData,
  isOPFSSupported,
  type SavedFile,
} from "@/lib/opfs";
import {
  semanticSearch,
  findNearDuplicates,
  deleteVectors,
} from "@/lib/knowledge-base";
import {
  loadEmbeddingModel,
  isModelLoaded,
} from "@/lib/embeddings";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SearchResult {
  fileId: string;
  fileName: string;
  rowIndex: number;
  text: string;
  similarity: number;
}

interface DuplicateGroup {
  group: number;
  rows: Array<{ rowIndex: number; text: string; similarity: number }>;
}

type View = "files" | "search" | "duplicates";

// ─── Small components ────────────────────────────────────────────────────────

function SimilarityBar({ pct }: { pct: number }) {
  const color = pct >= 0.9 ? "var(--accent)" : pct >= 0.75 ? "var(--warn)" : "var(--info)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
      <div style={{ flex: 1, height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: 3, background: color, borderRadius: 2, width: `${Math.round(pct * 100)}%`, transition: "width 0.3s" }} />
      </div>
      <span className="mono" style={{ fontSize: 10, color, minWidth: 32, textAlign: "right" }}>
        {Math.round(pct * 100)}%
      </span>
    </div>
  );
}

function VerticalBadge({ vertical }: { vertical: string }) {
  const ICONS: Record<string, string> = {
    general: "◈", ux_research: "◉", trader: "◎",
    aws: "▣", bigquery: "▤", content_creator: "▶", hr_people: "◐",
  };
  return (
    <span className="mono" style={{
      fontSize: 10, padding: "2px 8px",
      border: "1px solid var(--border)",
      color: "var(--muted)", background: "var(--panel-2)",
      display: "inline-flex", alignItems: "center", gap: 4,
    }}>
      {ICONS[vertical] || "◈"} {vertical.replace("_", " ")}
    </span>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const [supported, setSupported]   = useState<boolean | null>(null);
  const [files, setFiles]           = useState<SavedFile[]>([]);
  const [storage, setStorage]       = useState({ used: 0, available: 0, percentage: 0 });
  const [view, setView]             = useState<View>("files");
  const [loadingFiles, setLoadingFiles] = useState(true);

  // Search state
  const [query, setQuery]           = useState("");
  const [searching, setSearching]   = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchDone, setSearchDone] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelPct, setModelPct]     = useState(0);

  // Duplicates state
  const [dupFileId, setDupFileId]   = useState<string | null>(null);
  const [dupLoading, setDupLoading] = useState(false);
  const [dupGroups, setDupGroups]   = useState<DuplicateGroup[]>([]);

  // Per-file actions
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // ── Load on mount ──────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const [savedFiles, usage] = await Promise.all([
        listSavedFiles(),
        getStorageUsage(),
      ]);
      setFiles(savedFiles);
      setStorage(usage);
    } catch {
      setFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    const ok = isOPFSSupported();
    setSupported(ok);
    if (ok) refresh();
    setModelReady(isModelLoaded());
  }, [refresh]);

  // ── Load embedding model ───────────────────────────────────────────────────

  const handleLoadModel = async () => {
    setModelLoading(true);
    setModelPct(0);
    try {
      await loadEmbeddingModel((pct) => setModelPct(pct));
      setModelReady(true);
    } catch {
      // Model load failed — user can retry
    } finally {
      setModelLoading(false);
    }
  };

  // ── Semantic search ────────────────────────────────────────────────────────

  const handleSearch = async () => {
    if (!query.trim() || !modelReady) return;
    setSearching(true);
    setSearchDone(false);
    setSearchResults([]);
    setView("search");
    try {
      const results = await semanticSearch(query.trim(), undefined, 20, 0.55);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
      setSearchDone(true);
    }
  };

  // ── Near-duplicate detection ───────────────────────────────────────────────

  const handleFindDuplicates = async (fileId: string) => {
    setDupFileId(fileId);
    setDupLoading(true);
    setDupGroups([]);
    setView("duplicates");
    try {
      const groups = await findNearDuplicates(fileId, 0.85);
      setDupGroups(groups);
    } catch {
      setDupGroups([]);
    } finally {
      setDupLoading(false);
    }
  };

  // ── Delete dataset ─────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteDataset(id);
      await deleteVectors(id);
      await refresh();
    } catch {
      // Silent — file may already be gone
    } finally {
      setDeletingId(null);
    }
  };

  // ── Clear all data ─────────────────────────────────────────────────────────

  const handleClearAll = async () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    await clearAllData();
    setFiles([]);
    setStorage({ used: 0, available: 0, percentage: 0 });
    setConfirmClear(false);
  };

  // ── Group search results by file ───────────────────────────────────────────

  const resultsByFile = searchResults.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.fileId]) acc[r.fileId] = [];
    acc[r.fileId].push(r);
    return acc;
  }, {});

  // ── OPFS not supported ─────────────────────────────────────────────────────

  if (supported === false) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <div className="mono" style={{ fontSize: 11, color: "var(--danger)", letterSpacing: "0.12em", marginBottom: 12 }}>
            BROWSER NOT SUPPORTED
          </div>
          <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.7 }}>
            Your browser does not support the Origin Private File System API required for the local knowledge base.
            Please use Chrome, Edge, or Firefox 111+.
          </p>
          <Link href="/tool" className="mono" style={{ display: "inline-block", marginTop: 20, color: "var(--accent)", fontSize: 11 }}>
            ← BACK TO TOOL
          </Link>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface)", color: "var(--text)" }}>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav style={{ borderBottom: "1px solid var(--border)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span className="mono" style={{ color: "var(--accent)", fontWeight: 600, fontSize: 15 }}>TokenLift</span>
          </Link>
          <span style={{ color: "var(--border)" }}>·</span>
          <span className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em" }}>
            LOCAL KNOWLEDGE BASE
          </span>
        </div>
        <Link href="/tool" className="mono" style={{
          fontSize: 10, color: "var(--muted)", textDecoration: "none",
          border: "1px solid var(--border)", padding: "5px 12px",
          letterSpacing: "0.08em",
        }}>
          ← OPEN TOOL
        </Link>
      </nav>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>

        {/* ── Storage bar ───────────────────────────────────────────────── */}
        <div style={{ background: "var(--panel)", border: "1px solid var(--border)", padding: "16px 20px", marginBottom: 24, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em" }}>
                LOCAL STORAGE — YOUR COMPUTER ONLY
              </span>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 3 }}>
                Data stored in your browser&apos;s sandboxed file system. Never uploaded to any server.
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 24 }}>
              <span className="mono" style={{ fontSize: 13, color: "var(--text)" }}>
                {formatBytes(storage.used)}
              </span>
              <span className="mono" style={{ fontSize: 10, color: "var(--muted)", marginLeft: 6 }}>used</span>
            </div>
          </div>
          <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: 4, borderRadius: 2,
              background: storage.percentage > 80 ? "var(--danger)" : storage.percentage > 60 ? "var(--warn)" : "var(--accent)",
              width: `${Math.min(100, storage.percentage)}%`,
              transition: "width 0.4s ease",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
              {files.length} file{files.length !== 1 ? "s" : ""} stored · {formatBytes(storage.available)} available
            </span>
            {files.length > 0 && (
              <button
                onClick={handleClearAll}
                style={{
                  background: "none", border: "none",
                  color: confirmClear ? "var(--danger)" : "var(--muted)",
                  fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                  cursor: "pointer", letterSpacing: "0.08em",
                }}
              >
                {confirmClear ? "CLICK AGAIN TO CONFIRM WIPE ALL" : "CLEAR ALL DATA"}
              </button>
            )}
          </div>
        </div>

        {/* ── Model + search bar ────────────────────────────────────────── */}
        <div style={{ background: "var(--panel)", border: "1px solid var(--border)", padding: "16px 20px", marginBottom: 24 }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em", marginBottom: 12 }}>
            SEMANTIC SEARCH
          </div>

          {!modelReady ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>
                Semantic search requires a 22MB AI model. It downloads once and stays cached in your browser.
              </p>
              {modelLoading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: 3, background: "var(--accent)", borderRadius: 2, width: `${modelPct}%`, transition: "width 0.3s" }} />
                  </div>
                  <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                    Downloading model… {modelPct}%
                  </span>
                </div>
              ) : (
                <button
                  onClick={handleLoadModel}
                  style={{
                    background: "var(--accent)", color: "var(--surface)",
                    border: "none", padding: "8px 18px",
                    fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                    fontWeight: 700, letterSpacing: "0.08em",
                    cursor: "pointer", alignSelf: "flex-start",
                  }}
                >
                  ENABLE SEMANTIC SEARCH →
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search across all your files… e.g. navigation problems, failed task"
                style={{
                  flex: 1, background: "var(--panel-2, var(--panel))",
                  border: "1px solid var(--border)", color: "var(--text)",
                  padding: "9px 14px", fontSize: 13,
                  fontFamily: "DM Sans, sans-serif", outline: "none",
                }}
              />
              <button
                onClick={handleSearch}
                disabled={searching || !query.trim()}
                style={{
                  background: searching ? "var(--border)" : "var(--accent)",
                  color: "var(--surface)", border: "none",
                  padding: "9px 18px", fontFamily: "JetBrains Mono, monospace",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                  cursor: searching ? "not-allowed" : "pointer",
                  flexShrink: 0,
                }}
              >
                {searching ? "SEARCHING…" : "SEARCH →"}
              </button>
              {view === "search" && (
                <button
                  onClick={() => { setView("files"); setSearchDone(false); setSearchResults([]); }}
                  style={{
                    background: "none", border: "1px solid var(--border)",
                    color: "var(--muted)", padding: "9px 14px",
                    fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Search results ────────────────────────────────────────────── */}
        {view === "search" && (
          <div style={{ marginBottom: 24 }}>
            <div className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em", marginBottom: 12 }}>
              {searching
                ? "SEARCHING…"
                : searchDone
                ? `${searchResults.length} RESULT${searchResults.length !== 1 ? "S" : ""} ACROSS ${Object.keys(resultsByFile).length} FILE${Object.keys(resultsByFile).length !== 1 ? "S" : ""}`
                : ""}
            </div>

            {searchDone && searchResults.length === 0 && (
              <div style={{ padding: "32px 24px", textAlign: "center", border: "1px solid var(--border)", background: "var(--panel)" }}>
                <p style={{ color: "var(--muted)", fontSize: 13 }}>
                  No results above the similarity threshold. Try a different query or lower your expectations slightly.
                </p>
              </div>
            )}

            {/* Results grouped by file */}
            {Object.entries(resultsByFile).map(([fileId, results]) => (
              <div key={fileId} style={{ marginBottom: 16, border: "1px solid var(--border)", background: "var(--panel)", overflow: "hidden" }}>
                {/* File header */}
                <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, background: "var(--panel-2, var(--panel))" }}>
                  <span style={{ fontSize: 12, color: "var(--accent)" }}>◈</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--text)", flex: 1 }}>
                    {results[0].fileName}
                  </span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                    {results.length} match{results.length !== 1 ? "es" : ""}
                  </span>
                </div>

                {/* Rows */}
                {results.map((r, idx) => (
                  <div key={idx} style={{
                    padding: "10px 16px",
                    borderBottom: idx < results.length - 1 ? "1px solid var(--border)" : "none",
                    display: "flex", alignItems: "flex-start", gap: 16,
                  }}>
                    <div style={{ flexShrink: 0, paddingTop: 2 }}>
                      <SimilarityBar pct={r.similarity} />
                      <span className="mono" style={{ fontSize: 9, color: "var(--muted)", display: "block", marginTop: 3 }}>
                        row {r.rowIndex + 1}
                      </span>
                    </div>
                    <p style={{
                      margin: 0, fontSize: 12, color: "var(--text-dim)",
                      lineHeight: 1.6, flex: 1,
                      // Truncate long rows
                      display: "-webkit-box", WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical", overflow: "hidden",
                    }}>
                      {r.text}
                    </p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ── Near-duplicate results ────────────────────────────────────── */}
        {view === "duplicates" && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em" }}>
                {dupLoading
                  ? "SCANNING FOR NEAR-DUPLICATES…"
                  : `${dupGroups.length} DUPLICATE GROUP${dupGroups.length !== 1 ? "S" : ""} FOUND`}
              </span>
              <button
                onClick={() => { setView("files"); setDupGroups([]); setDupFileId(null); }}
                style={{ background: "none", border: "none", color: "var(--muted)", fontFamily: "JetBrains Mono, monospace", fontSize: 10, cursor: "pointer" }}
              >
                ← BACK
              </button>
            </div>

            {!dupLoading && dupGroups.length === 0 && (
              <div style={{ padding: "32px 24px", textAlign: "center", border: "1px solid var(--border)", background: "var(--panel)" }}>
                <p style={{ color: "var(--muted)", fontSize: 13 }}>No near-duplicate rows found at 85% similarity threshold.</p>
              </div>
            )}

            {dupGroups.map((g) => (
              <div key={g.group} style={{ marginBottom: 12, border: "1px solid var(--border)", background: "var(--panel)", overflow: "hidden" }}>
                <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", background: "var(--panel-2, var(--panel))" }}>
                  <span className="mono" style={{ fontSize: 10, color: "var(--warn)", letterSpacing: "0.08em" }}>
                    GROUP {g.group + 1} — {g.rows.length} near-identical rows
                  </span>
                </div>
                {g.rows.map((r, idx) => (
                  <div key={idx} style={{
                    padding: "8px 16px",
                    borderBottom: idx < g.rows.length - 1 ? "1px solid var(--border)" : "none",
                    display: "flex", alignItems: "flex-start", gap: 12,
                  }}>
                    <span className="mono" style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0, paddingTop: 2 }}>
                      row {r.rowIndex + 1}
                    </span>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6, flex: 1 }}>
                      {r.text}
                    </p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ── File list ─────────────────────────────────────────────────── */}
        {view === "files" && (
          <>
            <div className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em", marginBottom: 12 }}>
              SAVED DATASETS — {files.length} FILE{files.length !== 1 ? "S" : ""}
            </div>

            {loadingFiles && (
              <div style={{ padding: "32px 24px", textAlign: "center", border: "1px solid var(--border)", background: "var(--panel)" }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.1em" }}>
                  LOADING…
                </span>
              </div>
            )}

            {!loadingFiles && files.length === 0 && (
              <div style={{ padding: "48px 24px", textAlign: "center", border: "1px solid var(--border)", background: "var(--panel)" }}>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.12em", marginBottom: 12 }}>
                  NO FILES SAVED YET
                </div>
                <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20, lineHeight: 1.6 }}>
                  After cleaning a dataset in the tool, save it to your local knowledge base to enable semantic search across all your files.
                </p>
                <Link href="/tool" style={{
                  display: "inline-block",
                  background: "var(--accent)", color: "var(--surface)",
                  padding: "8px 20px", fontFamily: "JetBrains Mono, monospace",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                  textDecoration: "none",
                }}>
                  OPEN TOOL →
                </Link>
              </div>
            )}

            {!loadingFiles && files.map((file) => (
              <div key={file.id} style={{
                border: "1px solid var(--border)", background: "var(--panel)",
                marginBottom: 8, overflow: "hidden",
              }}>
                {/* File header row */}
                <div style={{ padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                  {/* Status dot */}
                  <div
                    title={file.hasEmbeddings ? "Indexed for search" : "Not indexed"}
                    style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginTop: 5,
                      background: file.hasEmbeddings ? "var(--success)" : "var(--border)",
                    }}
                  />

                  {/* File info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <span className="mono" style={{ fontSize: 12, color: "var(--text)", wordBreak: "break-all" }}>
                        {file.fileName}
                      </span>
                      <VerticalBadge vertical={file.vertical} />
                      {file.hasEmbeddings && (
                        <span className="mono" style={{ fontSize: 9, padding: "1px 6px", border: "1px solid var(--success)", color: "var(--success)" }}>
                          INDEXED
                        </span>
                      )}
                    </div>

                    {/* Metadata row */}
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      {[
                        { label: "rows",   value: file.cleanedRows.toLocaleString() },
                        { label: "tokens", value: file.tokenCount.toLocaleString() },
                        { label: "size",   value: formatBytes(file.sizeBytes) },
                        { label: "saved",  value: new Date(file.savedAt).toLocaleDateString() },
                      ].map(({ label, value }) => (
                        <span key={label} className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                          <span style={{ color: "var(--text-dim)" }}>{value}</span> {label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {/* Find duplicates — only if indexed */}
                    {file.hasEmbeddings && (
                      <button
                        onClick={() => handleFindDuplicates(file.id)}
                        style={{
                          background: "none", border: "1px solid var(--border)",
                          color: "var(--muted)", padding: "4px 10px",
                          fontFamily: "JetBrains Mono, monospace", fontSize: 9,
                          letterSpacing: "0.06em", cursor: "pointer",
                        }}
                      >
                        NEAR-DUPS
                      </button>
                    )}

                    {/* Re-analyze in tool */}
                    <Link
                      href="/tool"
                      style={{
                        display: "inline-block",
                        border: "1px solid var(--border)",
                        color: "var(--muted)", padding: "4px 10px",
                        fontFamily: "JetBrains Mono, monospace", fontSize: 9,
                        letterSpacing: "0.06em", textDecoration: "none",
                      }}
                    >
                      RE-ANALYZE
                    </Link>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(file.id)}
                      disabled={deletingId === file.id}
                      style={{
                        background: "none",
                        border: "1px solid var(--border)",
                        color: deletingId === file.id ? "var(--muted)" : "var(--danger)",
                        padding: "4px 10px",
                        fontFamily: "JetBrains Mono, monospace", fontSize: 9,
                        letterSpacing: "0.06em", cursor: "pointer",
                      }}
                    >
                      {deletingId === file.id ? "…" : "DELETE"}
                    </button>
                  </div>
                </div>

                {/* Column headers preview */}
                {file.headers.length > 0 && (
                  <div style={{ padding: "6px 16px 10px 36px", display: "flex", gap: 6, flexWrap: "wrap", borderTop: "1px solid var(--border)" }}>
                    {file.headers.slice(0, 10).map((h) => (
                      <span key={h} className="mono" style={{
                        fontSize: 9, padding: "2px 7px",
                        background: "var(--panel-2, var(--panel))",
                        border: "1px solid var(--border)",
                        color: "var(--accent)",
                      }}>
                        {h}
                      </span>
                    ))}
                    {file.headers.length > 10 && (
                      <span className="mono" style={{ fontSize: 9, color: "var(--muted)", alignSelf: "center" }}>
                        +{file.headers.length - 10} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* ── Note ──────────────────────────────────────────────────────── */}
        <div style={{ marginTop: 32, padding: "12px 16px", border: "1px solid var(--border)", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ color: "var(--muted)", fontSize: 13, flexShrink: 0 }}>◈</span>
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
            All data is stored in your browser&apos;s Origin Private File System — a sandboxed directory accessible only to this site.
            Nothing is uploaded to TokenLift servers. Clearing your browser data or uninstalling the app will remove all stored files.
          </p>
        </div>

      </div>
    </div>
  );
}
