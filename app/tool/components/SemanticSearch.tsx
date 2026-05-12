"use client";

import { useState, useRef, useEffect } from "react";
import { semanticSearch } from "@/lib/knowledge-base";
import { isModelLoaded, loadEmbeddingModel } from "@/lib/embeddings";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchResult {
  fileId: string;
  fileName: string;
  rowIndex: number;
  text: string;
  similarity: number;
}

interface Props {
  // If provided, "this file only" scope is available
  currentFileId?: string;
  currentFileName?: string;
  // Whether the current file has been indexed
  currentFileIndexed?: boolean;
  // compact = tool page inline; full = kb page standalone
  variant?: "compact" | "full";
}

// ── Similarity bar ─────────────────────────────────────────────────────────────

function SimilarityBar({ pct, animated }: { pct: number; animated: boolean }) {
  const [width, setWidth] = useState(0);
  const BLOCKS = 20;
  const filled = Math.round(pct * BLOCKS);
  const color  = pct >= 0.9 ? "var(--accent)" : pct >= 0.75 ? "var(--warn)" : "var(--info)";

  useEffect(() => {
    if (!animated) { setWidth(pct); return; }
    // Stagger the fill animation
    const t = setTimeout(() => setWidth(pct), 60);
    return () => clearTimeout(t);
  }, [pct, animated]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {/* Percentage */}
      <span className="mono" style={{
        fontSize: 13, fontWeight: 600,
        color, minWidth: 36, textAlign: "right",
      }}>
        {Math.round(pct * 100)}%
      </span>

      {/* Block bar */}
      <div className="mono" style={{ fontSize: 11, color, letterSpacing: 1, lineHeight: 1 }}>
        {Array.from({ length: BLOCKS }, (_, i) => (
          <span
            key={i}
            style={{
              opacity: i < Math.round(width * BLOCKS) ? 1 : 0.2,
              transition: `opacity ${0.1 + i * 0.02}s ease`,
              color: i < filled ? color : "var(--border)",
            }}
          >
            █
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SemanticSearch({
  currentFileId,
  currentFileName,
  currentFileIndexed = false,
  variant = "full",
}: Props) {
  const [query, setQuery]               = useState("");
  const [scope, setScope]               = useState<"all" | "this">(
    currentFileId && currentFileIndexed ? "this" : "all"
  );
  const [results, setResults]           = useState<SearchResult[]>([]);
  const [searching, setSearching]       = useState(false);
  const [searched, setSearched]         = useState(false);
  const [modelReady, setModelReady]     = useState(isModelLoaded());
  const [modelLoading, setModelLoading] = useState(false);
  const [modelPct, setModelPct]         = useState(0);
  const [animated, setAnimated]         = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Load model ──────────────────────────────────────────────────────────────

  const handleLoadModel = async () => {
    setModelLoading(true);
    try {
      await loadEmbeddingModel((pct) => setModelPct(pct));
      setModelReady(true);
    } catch {
      // silent — user can retry
    } finally {
      setModelLoading(false);
    }
  };

  // ── Search ──────────────────────────────────────────────────────────────────

  const handleSearch = async () => {
    if (!query.trim() || !modelReady || searching) return;
    setSearching(true);
    setSearched(false);
    setResults([]);
    setAnimated(false);

    try {
      const fileIds = scope === "this" && currentFileId ? [currentFileId] : undefined;
      const hits    = await semanticSearch(query.trim(), fileIds, 15, 0.5);
      setResults(hits);
      // Trigger bar animations after results land
      setTimeout(() => setAnimated(true), 50);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  // ── Group results by file for cross-file attribution ──────────────────────

  const byFile = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.fileId]) acc[r.fileId] = [];
    acc[r.fileId].push(r);
    return acc;
  }, {});

  const isCompact = variant === "compact";

  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── Model not ready ──────────────────────────────────────────────── */}
      {!modelReady && (
        <div style={{
          border: "1px solid var(--border)", background: "var(--panel)",
          padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em" }}>
            SEMANTIC SEARCH
          </div>
          {modelLoading ? (
            <>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                Downloading all-MiniLM-L6-v2… {modelPct}%
              </div>
              <div style={{ height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: 3, background: "var(--accent)", borderRadius: 2,
                  width: `${modelPct}%`, transition: "width 0.3s",
                }} />
              </div>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6 }}>
                Semantic search requires a 22MB AI model — cached once in your browser.
              </p>
              <button
                onClick={handleLoadModel}
                style={{
                  background: "var(--accent)", color: "var(--surface)",
                  border: "none", padding: "7px 16px", alignSelf: "flex-start",
                  fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                  fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer",
                }}
              >
                ENABLE SEMANTIC SEARCH →
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Search input ─────────────────────────────────────────────────── */}
      {modelReady && (
        <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {!isCompact && (
            <div className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em" }}>
              SEMANTIC SEARCH
            </div>
          )}

          {/* Scope toggle */}
          {currentFileId && currentFileIndexed && (
            <div style={{ display: "flex", gap: 0, border: "1px solid var(--border)", alignSelf: "flex-start" }}>
              {(["this", "all"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  style={{
                    background: scope === s ? "var(--accent)" : "none",
                    color: scope === s ? "var(--surface)" : "var(--muted)",
                    border: "none", padding: "5px 14px",
                    fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                    letterSpacing: "0.06em", cursor: "pointer",
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  {s === "this"
                    ? `THIS FILE`
                    : "ALL FILES"}
                </button>
              ))}
            </div>
          )}

          {/* Input + button */}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                scope === "this"
                  ? `Search ${currentFileName || "this file"}…`
                  : "Search across all your files… e.g. navigation problems"
              }
              style={{
                flex: 1,
                background: "var(--panel-2, var(--surface))",
                border: "1px solid var(--border)",
                color: "var(--text)", padding: "8px 12px",
                fontSize: 13, fontFamily: "DM Sans, sans-serif",
                outline: "none",
              }}
            />
            <button
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              style={{
                background: searching ? "var(--border)" : "var(--accent)",
                color: "var(--surface)", border: "none",
                padding: "8px 16px", flexShrink: 0,
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10, fontWeight: 700,
                letterSpacing: "0.08em",
                cursor: searching ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {searching ? "…" : "SEARCH →"}
            </button>
          </div>

          {/* Privacy note */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ color: "var(--success)", fontSize: 11, flexShrink: 0, marginTop: 1 }}>◉</span>
            <span className="mono" style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.6 }}>
              Search powered by all-MiniLM-L6-v2 · Running locally on your computer · No data sent anywhere
            </span>
          </div>
        </div>
      )}

      {/* ── Results ──────────────────────────────────────────────────────── */}
      {searched && (
        <>
          {/* Result count header */}
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em" }}>
            {results.length === 0
              ? "NO RESULTS — try a different query or lower the threshold"
              : `${results.length} RESULT${results.length !== 1 ? "S" : ""} ACROSS ${Object.keys(byFile).length} FILE${Object.keys(byFile).length !== 1 ? "S" : ""}`}
          </div>

          {/* Empty state */}
          {results.length === 0 && (
            <div style={{ padding: "24px 16px", border: "1px solid var(--border)", background: "var(--panel)", textAlign: "center" }}>
              <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
                No results above 50% similarity. Try rephrasing your query with different keywords.
              </p>
            </div>
          )}

          {/* Results grouped by file */}
          {Object.entries(byFile).map(([fileId, fileResults]) => (
            <div key={fileId} style={{ border: "1px solid var(--border)", background: "var(--panel)", overflow: "hidden" }}>

              {/* File header */}
              <div style={{
                padding: "8px 14px",
                borderBottom: "1px solid var(--border)",
                background: "var(--panel-2, var(--panel))",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ color: "var(--accent)", fontSize: 11 }}>◈</span>
                <span className="mono" style={{ fontSize: 11, color: "var(--text)", flex: 1 }}>
                  {fileResults[0].fileName}
                </span>
                <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                  {fileResults.length} match{fileResults.length !== 1 ? "es" : ""}
                </span>
              </div>

              {/* Individual rows */}
              {fileResults.map((r, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "12px 14px",
                    borderBottom: idx < fileResults.length - 1 ? "1px solid var(--border)" : "none",
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: "8px 16px",
                    alignItems: "start",
                  }}
                >
                  {/* Left: similarity bar */}
                  <div style={{ paddingTop: 2 }}>
                    <SimilarityBar pct={r.similarity} animated={animated} />
                    {/* Cross-file attribution */}
                    <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 5, paddingLeft: 44 }}>
                      {r.fileName} · row {r.rowIndex + 1}
                    </div>
                  </div>

                  {/* Right: text preview */}
                  <p style={{
                    margin: 0, fontSize: 12,
                    color: "var(--text-dim)", lineHeight: 1.7,
                    // Clamp to 3 lines
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>
                    {r.text}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
