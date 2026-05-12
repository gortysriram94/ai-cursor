"use client";

import { useState } from "react";
import { VERTICALS, VerticalId } from "@/lib/verticals";

interface Props {
  stats: Record<string, any>;
  verticalId: VerticalId;
  userInputs: Record<string, string>;
}

export default function PromptOutput({ stats, verticalId, userInputs }: Props) {
  const [copied, setCopied] = useState(false);

  const vertical = VERTICALS[verticalId] || VERTICALS.general;
  const prompt    = vertical.promptTemplate(stats, userInputs);
  const charCount = prompt.length;
  const tokenEst  = Math.ceil(charCount / 4);

  const fullText  = prompt + "\n\n---\n\n" + (stats.cleanedData || "");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = fullText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid var(--border)", background: "var(--panel)" }}>

      {/* ── Section label ────────────────────────────────────────────────── */}
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.15em", textTransform: "uppercase" }}>
            Generated AI Prompt — {vertical.icon} {vertical.label}
          </div>

          {/* Character count + token estimate */}
          <div style={{ display: "flex", gap: 16 }}>
            <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
              {charCount.toLocaleString()} chars
            </span>
            <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
              ~{tokenEst.toLocaleString()} tokens (prompt only)
            </span>
          </div>
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          style={{
            background: copied ? "var(--success)" : "var(--accent)",
            color: "var(--surface)",
            border: "none",
            padding: "8px 16px",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            cursor: "pointer",
            transition: "background 0.2s",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          {copied ? "COPIED ✓" : "COPY PROMPT"}
        </button>
      </div>

      {/* ── Prompt preview ────────────────────────────────────────────────── */}
      <pre style={{
        margin: 0,
        padding: "16px 18px",
        fontSize: 12,
        color: "var(--text-dim)",
        fontFamily: "JetBrains Mono, monospace",
        lineHeight: 1.8,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: 300,
        overflowY: "auto",
        background: "transparent",
        borderBottom: "1px solid var(--border)",
      }}>
        {prompt}
      </pre>

      {/* ── Instruction footer ────────────────────────────────────────────── */}
      <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>
          Copy this prompt, then paste it followed by your cleaned data export into{" "}
          <span style={{ color: "var(--text)" }}>Claude</span> or{" "}
          <span style={{ color: "var(--text)" }}>ChatGPT</span>.
        </div>
        <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
          Clicking Copy includes your cleaned dataset automatically — paste once and you're done.
        </div>
      </div>
    </div>
  );
}
