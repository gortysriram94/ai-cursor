"use client";

import { useState, useEffect } from "react";
import { downloadOutput, convertToWebP } from "@/lib/generation";

interface Props {
  blob:         Blob;
  type:         "image" | "video";
  cost:         number;
  model:        string;
  prompt:       string;
  vertical:     string;
  onRegenerate: () => void;
}

export default function GenerationOutput({
  blob, type, cost, model, prompt, vertical, onRegenerate,
}: Props) {
  const [objectUrl, setObjectUrl]   = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(blob);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  const handleDownload = (ext: "png" | "jpg" | "webp" | "mp4") => {
    if (ext === "webp" && type === "image") {
      setConverting(true);
      convertToWebP(blob)
        .then((webpBlob) => {
          downloadOutput(webpBlob, "image", { prompt, model, vertical });
        })
        .catch(() => {})
        .finally(() => setConverting(false));
      return;
    }
    downloadOutput(blob, type, { prompt, model, vertical });
  };

  if (!objectUrl) return null;

  return (
    <div style={{ border: "1px solid var(--border)", background: "var(--panel)", overflow: "hidden" }}>

      {/* Header */}
      <div style={{
        padding: "10px 16px", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em" }}>
          {type === "image" ? "GENERATED IMAGE" : "GENERATED VIDEO"}
        </span>
        <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
          {model} via TokenLift · ${cost.toFixed(3)} from your account
        </span>
      </div>

      {/* ── Image output ──────────────────────────────────────────────────── */}
      {type === "image" && (
        <>
          <div style={{ padding: "16px", background: "var(--panel-2, var(--surface))" }}>
            <img
              src={objectUrl}
              alt="Generated visualization"
              style={{
                width: "100%", maxHeight: 480,
                objectFit: "contain", display: "block",
              }}
            />
          </div>

          {/* Image actions */}
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => handleDownload("png")}
              style={btnStyle("accent")}
            >
              DOWNLOAD PNG
            </button>
            <button
              onClick={() => handleDownload("webp")}
              disabled={converting}
              style={btnStyle("muted")}
            >
              {converting ? "CONVERTING…" : "DOWNLOAD WEBP"}
            </button>
            <button onClick={onRegenerate} style={btnStyle("muted")}>
              REGENERATE
            </button>
            <button
              onClick={() => {
                // Cycle style — parent handles this via onRegenerate
                onRegenerate();
              }}
              style={btnStyle("muted")}
            >
              TRY DIFFERENT STYLE
            </button>
          </div>
        </>
      )}

      {/* ── Video output ──────────────────────────────────────────────────── */}
      {type === "video" && (
        <>
          <div style={{ padding: "16px", background: "#000" }}>
            <video
              src={objectUrl}
              controls
              autoPlay
              loop
              style={{ width: "100%", maxHeight: 480, display: "block" }}
            />
          </div>

          {/* Video actions */}
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => handleDownload("mp4")}
              style={btnStyle("accent")}
            >
              DOWNLOAD MP4
            </button>
            <button onClick={onRegenerate} style={btnStyle("muted")}>
              REGENERATE
            </button>
          </div>
        </>
      )}

      {/* Prompt expandable */}
      <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)" }}>
        <button
          onClick={() => setShowPrompt((p) => !p)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <span className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.08em" }}>
            {showPrompt ? "▲ HIDE PROMPT" : "▼ SHOW PROMPT USED"}
          </span>
        </button>
        {showPrompt && (
          <div style={{
            marginTop: 8, padding: "10px 12px",
            background: "var(--panel-2, var(--surface))",
            border: "1px solid var(--border)",
            fontSize: 11, color: "var(--text-dim)",
            fontFamily: "JetBrains Mono, monospace",
            lineHeight: 1.6,
          }}>
            {prompt}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Style helper ──────────────────────────────────────────────────────────────

function btnStyle(variant: "accent" | "muted"): React.CSSProperties {
  return {
    background: variant === "accent" ? "var(--accent)" : "none",
    color: variant === "accent" ? "var(--surface)" : "var(--muted)",
    border: variant === "accent" ? "none" : "1px solid var(--border)",
    padding: "7px 14px",
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 10, fontWeight: variant === "accent" ? 700 : 400,
    letterSpacing: "0.06em", cursor: "pointer",
  };
}
