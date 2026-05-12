"use client";

import { useState, useRef } from "react";
import {
  stripExif, convertToWebP, getImageMetadata,
  cleanTranscript, metadataToCSV, downloadBlob,
} from "@/lib/media";

type ProcessMode = "strip_exif" | "to_webp" | "both";

interface ImageResult {
  name:       string;
  originalKB: number;
  processedKB: number;
  savedKB:    number;
  blob:       Blob;
  ext:        string;
}

interface TranscriptResult {
  cleanText:             string;
  fullTranscript:        string;
  wordCount:             number;
  durationMinutes:       number;
  duplicateLinesRemoved: number;
  fileName:              string;
}

export default function MediaProcessor() {
  const [mode, setMode]                   = useState<ProcessMode>("both");
  const [imageResults, setImageResults]   = useState<ImageResult[]>([]);
  const [processingImages, setProcessingImages] = useState(false);
  const [transcriptResult, setTranscriptResult] = useState<TranscriptResult | null>(null);
  const [processingTranscript, setProcessingTranscript] = useState(false);
  const imgInputRef   = useRef<HTMLInputElement>(null);
  const srtInputRef   = useRef<HTMLInputElement>(null);

  // ── Image processing ────────────────────────────────────────────────────────

  const handleImages = async (files: FileList) => {
    setProcessingImages(true);
    setImageResults([]);
    const results: ImageResult[] = [];

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const originalKB = Math.round(file.size / 1024);
        let blob: Blob;
        let ext: string;

        if (mode === "strip_exif") {
          blob = await stripExif(file);
          ext  = file.type.split("/")[1] ?? "jpg";
        } else if (mode === "to_webp") {
          blob = await convertToWebP(file);
          ext  = "webp";
        } else {
          // both: strip EXIF then convert to WebP
          const stripped = await stripExif(file);
          const strippedFile = new File([stripped], file.name, { type: file.type });
          blob = await convertToWebP(strippedFile);
          ext  = "webp";
        }

        const processedKB = Math.round(blob.size / 1024);
        results.push({
          name:        file.name,
          originalKB,
          processedKB,
          savedKB:     Math.max(0, originalKB - processedKB),
          blob,
          ext,
        });
      } catch {
        // Skip failed files silently
      }
    }

    setImageResults(results);
    setProcessingImages(false);
  };

  const handleDownloadAll = async () => {
    if (imageResults.length === 1) {
      const r = imageResults[0];
      downloadBlob(r.blob, `tokenlift_${r.name.replace(/\.[^.]+$/, "")}.${r.ext}`);
      return;
    }

    // Multiple files: use JSZip if available, else download one by one
    try {
      const JSZip = (await import("jszip")).default;
      const zip   = new JSZip();
      imageResults.forEach((r) => {
        zip.file(`tokenlift_${r.name.replace(/\.[^.]+$/, "")}.${r.ext}`, r.blob);
      });
      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, `tokenlift_images_${Date.now()}.zip`);
    } catch {
      imageResults.forEach((r) => {
        downloadBlob(r.blob, `tokenlift_${r.name.replace(/\.[^.]+$/, "")}.${r.ext}`);
      });
    }
  };

  // ── Transcript processing ────────────────────────────────────────────────────

  const handleTranscript = async (file: File) => {
    setProcessingTranscript(true);
    setTranscriptResult(null);
    try {
      const text   = await file.text();
      const format = file.name.toLowerCase().endsWith(".vtt") ? "vtt" : "srt";
      const result = cleanTranscript(text, format);
      setTranscriptResult({ ...result, fileName: file.name });
    } catch {
      // Silent fail
    } finally {
      setProcessingTranscript(false);
    }
  };

  const handleDownloadTranscript = (type: "txt" | "csv") => {
    if (!transcriptResult) return;
    if (type === "txt") {
      const blob = new Blob([transcriptResult.fullTranscript], { type: "text/plain" });
      downloadBlob(blob, `tokenlift_transcript_${Date.now()}.txt`);
    } else {
      const rows = transcriptResult.cleanText.split(". ").map((sentence, i) => ({
        index:    i + 1,
        sentence: sentence.trim(),
      }));
      const csv  = metadataToCSV(rows);
      const blob = new Blob([csv], { type: "text/csv" });
      downloadBlob(blob, `tokenlift_transcript_${Date.now()}.csv`);
    }
  };

  const totalSaved = imageResults.reduce((s, r) => s + r.savedKB, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── IMAGE TOOLS ─────────────────────────────────────────────────── */}
      <div style={{ border: "1px solid var(--border)", background: "var(--panel)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <span className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em" }}>
            IMAGE TOOLS
          </span>
        </div>

        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Mode selector */}
          <div>
            <div className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", marginBottom: 6 }}>OPERATION</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {([
                { v: "strip_exif", label: "Strip EXIF" },
                { v: "to_webp",   label: "Convert to WebP" },
                { v: "both",      label: "Both (EXIF + WebP)" },
              ] as { v: ProcessMode; label: string }[]).map(({ v, label }) => (
                <button
                  key={v}
                  onClick={() => setMode(v)}
                  style={{
                    background: mode === v ? "var(--accent)" : "none",
                    color: mode === v ? "var(--surface)" : "var(--muted)",
                    border: `1px solid ${mode === v ? "var(--accent)" : "var(--border)"}`,
                    padding: "5px 12px", fontFamily: "JetBrains Mono, monospace",
                    fontSize: 10, cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Drop zone */}
          <div
            onClick={() => imgInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) handleImages(e.dataTransfer.files); }}
            style={{
              border: "1px dashed var(--border)", padding: "24px",
              textAlign: "center", cursor: "pointer",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
              {processingImages ? "PROCESSING…" : "DROP IMAGES HERE or click to browse"}
            </div>
            <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>
              JPG · PNG · WebP · GIF · Multiple files supported
            </div>
          </div>
          <input
            ref={imgInputRef} type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple style={{ display: "none" }}
            onChange={(e) => e.target.files?.length && handleImages(e.target.files)}
          />

          {/* Results */}
          {imageResults.length > 0 && (
            <>
              <div style={{ border: "1px solid var(--border)", overflow: "hidden" }}>
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 80px 80px 80px",
                  padding: "7px 14px", borderBottom: "1px solid var(--border)",
                  background: "var(--panel-2, var(--surface))",
                }}>
                  {["File", "Before", "After", "Saved"].map((h) => (
                    <span key={h} className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em" }}>{h}</span>
                  ))}
                </div>
                {imageResults.map((r, i) => (
                  <div key={i} style={{
                    display: "grid", gridTemplateColumns: "1fr 80px 80px 80px",
                    padding: "8px 14px",
                    borderBottom: i < imageResults.length - 1 ? "1px solid var(--border)" : "none",
                  }}>
                    <span className="mono" style={{ fontSize: 10, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.name}
                    </span>
                    <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{r.originalKB} KB</span>
                    <span className="mono" style={{ fontSize: 10, color: "var(--text)" }}>{r.processedKB} KB</span>
                    <span className="mono" style={{ fontSize: 10, color: "var(--success)" }}>
                      {r.savedKB > 0 ? `-${r.savedKB} KB` : "—"}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <span className="mono" style={{ fontSize: 10, color: "var(--success)" }}>
                  Total saved: {totalSaved} KB across {imageResults.length} file{imageResults.length !== 1 ? "s" : ""}
                </span>
                <button onClick={handleDownloadAll} style={dlBtnStyle}>
                  {imageResults.length === 1 ? "DOWNLOAD" : "DOWNLOAD ZIP →"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── TRANSCRIPT CLEANER ────────────────────────────────────────────── */}
      <div style={{ border: "1px solid var(--border)", background: "var(--panel)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <span className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em" }}>
            TRANSCRIPT CLEANER
          </span>
        </div>

        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            onClick={() => srtInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) handleTranscript(file);
            }}
            style={{
              border: "1px dashed var(--border)", padding: "20px",
              textAlign: "center", cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
              {processingTranscript ? "PROCESSING…" : "DROP SRT or VTT FILE HERE"}
            </div>
            <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>
              YouTube auto-captions, podcast transcripts, subtitle files
            </div>
          </div>
          <input
            ref={srtInputRef} type="file"
            accept=".srt,.vtt,text/plain"
            style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleTranscript(f); }}
          />

          {transcriptResult && (
            <>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8,
              }}>
                {[
                  { label: "Words",           value: transcriptResult.wordCount.toLocaleString() },
                  { label: "Duration",        value: `${transcriptResult.durationMinutes} min` },
                  { label: "Dupes removed",   value: String(transcriptResult.duplicateLinesRemoved) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ border: "1px solid var(--border)", padding: "10px 12px" }}>
                    <div className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", marginBottom: 3 }}>{label}</div>
                    <div className="mono" style={{ fontSize: 14, color: "var(--accent)" }}>{value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => handleDownloadTranscript("txt")} style={dlBtnStyle}>
                  DOWNLOAD .TXT
                </button>
                <button
                  onClick={() => handleDownloadTranscript("csv")}
                  style={{ ...dlBtnStyle, background: "none", border: "1px solid var(--border)", color: "var(--muted)" }}
                >
                  DOWNLOAD CSV
                </button>
              </div>

              <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                Clean transcript ready for AI analysis — paste into Claude or ChatGPT for summaries, chapter markers, or topic extraction.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const dlBtnStyle: React.CSSProperties = {
  background: "var(--accent)", color: "var(--surface)",
  border: "none", padding: "7px 16px",
  fontFamily: "JetBrains Mono, monospace",
  fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", cursor: "pointer",
};
