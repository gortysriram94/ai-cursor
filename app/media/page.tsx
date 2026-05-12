"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import {
  getImageMetadata, getVideoMetadata,
  metadataToCSV, downloadBlob,
  estimateImageProcessingCost, estimateVideoProcessingCost,
  type MediaCostEstimate,
} from "@/lib/media";
import MediaProcessor from "@/app/tool/components/MediaProcessor";
import MediaCostCalculator from "@/app/tool/components/MediaCostCalculator";

// ── Video metadata section ─────────────────────────────────────────────────────

function VideoMetadataSection() {
  const [metadata, setMetadata] = useState<Awaited<ReturnType<typeof getVideoMetadata>>[]>([]);
  const [loading, setLoading]   = useState(false);
  const inputRef                = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList) => {
    setLoading(true);
    const results = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("video/")) continue;
      try {
        results.push(await getVideoMetadata(file));
      } catch {}
    }
    setMetadata(results);
    setLoading(false);
  };

  const handleExport = () => {
    const csv  = metadataToCSV(metadata as unknown as Record<string, string | number | boolean>[]);
    const blob = new Blob([csv], { type: "text/csv" });
    downloadBlob(blob, `tokenlift_video_metadata_${Date.now()}.csv`);
  };

  return (
    <div style={{ border: "1px solid var(--border)", background: "var(--panel)", overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <span className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em" }}>
          VIDEO METADATA EXTRACTOR
        </span>
      </div>
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
          style={{
            border: "1px dashed var(--border)", padding: "20px",
            textAlign: "center", cursor: "pointer",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        >
          <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
            {loading ? "READING METADATA…" : "DROP VIDEO FILES HERE"}
          </div>
          <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>
            MP4 · MOV · WebM · MKV · Duration, resolution, size extracted client-side
          </div>
        </div>
        <input
          ref={inputRef} type="file" accept="video/*" multiple
          style={{ display: "none" }}
          onChange={(e) => e.target.files?.length && handleFiles(e.target.files)}
        />

        {metadata.length > 0 && (
          <>
            <div style={{ border: "1px solid var(--border)", overflow: "hidden" }}>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 70px 100px 80px 80px",
                padding: "7px 14px", borderBottom: "1px solid var(--border)",
                background: "var(--panel-2, var(--surface))",
              }}>
                {["File", "Format", "Duration", "Resolution", "Size"].map((h) => (
                  <span key={h} className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em" }}>{h}</span>
                ))}
              </div>
              {metadata.map((m, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "1fr 70px 100px 80px 80px",
                  padding: "9px 14px",
                  borderBottom: i < metadata.length - 1 ? "1px solid var(--border)" : "none",
                }}>
                  <span className="mono" style={{ fontSize: 10, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.filename}
                  </span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{m.format}</span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--text)" }}>{m.durationFormatted}</span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{m.width}×{m.height}</span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{m.sizeMB} MB</span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={handleExport}
                style={{
                  background: "var(--accent)", color: "var(--surface)",
                  border: "none", padding: "7px 16px",
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", cursor: "pointer",
                }}
              >
                EXPORT CSV →
              </button>
              <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                Feed this CSV into TokenLift → clean it → analyze with AI
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function MediaPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--surface)", color: "var(--text)" }}>

      {/* Nav */}
      <nav style={{
        borderBottom: "1px solid var(--border)", padding: "14px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "var(--surface)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span className="mono" style={{ color: "var(--accent)", fontWeight: 600, fontSize: 15 }}>TokenLift</span>
          </Link>
          <span style={{ color: "var(--border)" }}>·</span>
          <span className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em" }}>
            MEDIA TOOLS
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/tool" className="mono" style={{ fontSize: 10, color: "var(--muted)", textDecoration: "none", border: "1px solid var(--border)", padding: "5px 12px", letterSpacing: "0.08em" }}>
            ← TOOL
          </Link>
          <Link href="/generate" className="mono" style={{ fontSize: 10, color: "var(--muted)", textDecoration: "none", border: "1px solid var(--border)", padding: "5px 12px", letterSpacing: "0.08em" }}>
            GENERATE
          </Link>
        </div>
      </nav>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Page header */}
        <div>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em", marginBottom: 6 }}>
            CLIENT-SIDE MEDIA PROCESSING
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 300, color: "var(--text)", margin: 0 }}>
            Media Tools
          </h1>
          <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 8, lineHeight: 1.6 }}>
            Strip EXIF data, convert to WebP, extract metadata, clean transcripts.
            Everything runs in your browser — no files uploaded anywhere.
          </p>
        </div>

        {/* Image tools + transcript cleaner */}
        <MediaProcessor />

        {/* Video metadata */}
        <VideoMetadataSection />

        {/* Media AI cost calculator */}
        <MediaCostCalculator />

        {/* Privacy note */}
        <div style={{ padding: "12px 16px", border: "1px solid var(--border)", display: "flex", gap: 10 }}>
          <span style={{ color: "var(--muted)", fontSize: 12, flexShrink: 0 }}>◉</span>
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
            All processing uses your browser&apos;s Canvas API and HTML5 media elements.
            No files are uploaded. No server processes your images or videos.
            EXIF stripping works by redrawing through Canvas — GPS coordinates, camera models,
            and all metadata are removed from the output.
          </p>
        </div>

      </div>
    </div>
  );
}
