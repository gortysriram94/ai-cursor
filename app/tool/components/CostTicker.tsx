"use client";

import { calculateCost, MODEL_RATES } from "@/lib/streaming";

interface Props {
  modelId:        string;
  modelLabel:     string;
  inputTokens:    number;
  outputTokens:   number;
  originalTokens: number;
  cleanedTokens:  number;
  isLive?:        boolean;
}

export default function CostTicker({
  modelId,
  modelLabel,
  inputTokens,
  outputTokens,
  originalTokens,
  cleanedTokens,
  isLive = false,
}: Props) {
  const inputCost  = calculateCost(modelId, inputTokens,    0);
  const outputCost = calculateCost(modelId, 0,              outputTokens);
  const totalCost  = inputCost + outputCost;

  // What it would have cost without TokenLift cleaning
  // Estimate output as 30% of input for the unclean version
  const wouldHaveCost = calculateCost(
    modelId,
    originalTokens,
    Math.round(originalTokens * 0.3)
  );
  const savings    = Math.max(0, wouldHaveCost - totalCost);
  const savingsPct = wouldHaveCost > 0
    ? Math.max(0, Math.round((savings / wouldHaveCost) * 100))
    : 0;

  const fmt = (n: number) =>
    n < 0.001 ? `$${n.toFixed(5)}` : `$${n.toFixed(4)}`;

  const cursor = isLive
    ? <span style={{ color: "var(--accent)", marginLeft: 2, fontSize: 10 }}>▋</span>
    : null;

  return (
    <div style={{
      border: "1px solid var(--border)",
      background: "var(--panel)",
      padding: "14px 16px",
      fontFamily: "JetBrains Mono, monospace",
      display: "flex",
      flexDirection: "column",
      gap: 0,
    }}>
      {/* Header */}
      <div style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em", marginBottom: 12 }}>
        SESSION COST
      </div>

      {/* Model */}
      <Row label="Model" value={modelLabel} />

      <Divider />

      {/* Tokens */}
      <Row label="Input tokens"  value={inputTokens.toLocaleString()} />
      <Row label="Output tokens" value={<>{outputTokens.toLocaleString()}{cursor}</>} />

      <Divider />

      {/* Costs */}
      <Row label="Input cost"  value={fmt(inputCost)} />
      <Row label="Output cost" value={<>{fmt(outputCost)}{cursor}</>} />
      <Row
        label="Total"
        value={<>{fmt(totalCost)}{cursor}</>}
        accent
      />

      {/* Savings section — only shown when there's something to save */}
      {originalTokens > 0 && originalTokens > cleanedTokens && (
        <>
          <Divider />
          <Row label="Without TokenLift" value={fmt(wouldHaveCost)} muted />
          <Row label="You saved"         value={fmt(savings)}       good  />
          <Row label="Savings %"         value={`${savingsPct}%`}   good  />
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Row({
  label, value, accent = false, muted = false, good = false,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
  muted?: boolean;
  good?: boolean;
}) {
  const color = accent
    ? "var(--accent)"
    : good
    ? "var(--success)"
    : muted
    ? "var(--muted)"
    : "var(--text-dim)";

  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: 8,
      padding: "2px 0",
    }}>
      <span style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ fontSize: 11, color, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function Divider() {
  return (
    <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />
  );
}
