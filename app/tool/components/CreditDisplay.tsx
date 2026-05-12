"use client";

import { useState, useEffect, useRef } from "react";
import { getStoredCustomerId, fetchCreditBalance, type CreditBalance } from "@/lib/credits";

interface Props {
  // Called before a generation — confirms user wants to spend a credit
  onConfirmSpend?: (type: "text" | "image" | "video", remaining: number) => Promise<boolean>;
}

export default function CreditDisplay({ onConfirmSpend }: Props) {
  const [balance, setBalance]   = useState<CreditBalance | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const customerId = getStoredCustomerId();

  useEffect(() => {
    if (!customerId) return;
    fetchCreditBalance(customerId)
      .then((b) => setBalance(b))
      .catch(() => {});
  }, [customerId]);

  // Close tooltip on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!customerId || !balance) return null;

  const items = [
    { key: "image", label: "img",  count: balance.image, color: "var(--accent)"  },
    { key: "video", label: "vid",  count: balance.video, color: "var(--info)"    },
    { key: "text",  label: "txt",  count: balance.text,  color: "var(--success)" },
  ] as const;

  return (
    <div ref={tooltipRef} style={{ position: "relative" }}>
      {/* Compact display */}
      <button
        onClick={() => setShowTooltip((v) => !v)}
        style={{
          background: "none", border: "1px solid var(--border)",
          padding: "4px 10px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8,
          fontFamily: "JetBrains Mono, monospace",
        }}
      >
        <span style={{ fontSize: 11 }}>🪙</span>
        {items.map(({ key, label, count, color }) => (
          <span key={key} className="mono" style={{ fontSize: 10, color }}>
            {count} {label}
          </span>
        )).reduce((acc, el, i) => i === 0 ? [el] : [...acc,
          <span key={`sep-${i}`} style={{ color: "var(--border)", fontSize: 10 }}>|</span>, el
        ], [] as React.ReactNode[])}
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          background: "var(--panel)", border: "1px solid var(--border)",
          padding: "14px 16px", minWidth: 220, zIndex: 50,
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em", marginBottom: 10 }}>
            CREDIT BALANCE
          </div>

          {items.map(({ key, label, count, color }) => (
            <div key={key} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "4px 0", borderBottom: "1px solid var(--border)",
            }}>
              <span className="mono" style={{ fontSize: 10, color: "var(--muted)", textTransform: "capitalize" }}>
                {key} credits
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="mono" style={{ fontSize: 11, color }}>
                  {count} remaining
                </span>
                <a
                  href="/account#credits"
                  className="mono"
                  style={{ fontSize: 9, color: "var(--accent)", textDecoration: "none" }}
                  onClick={() => setShowTooltip(false)}
                >
                  BUY →
                </a>
              </div>
            </div>
          ))}

          <div style={{ marginTop: 10 }}>
            <span className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>
              Export credits: {balance.export}
            </span>
          </div>

          <a
            href="/account"
            style={{
              display: "block", marginTop: 10,
              background: "var(--accent)", color: "var(--surface)",
              padding: "6px 10px", textAlign: "center",
              fontFamily: "JetBrains Mono, monospace", fontSize: 9,
              fontWeight: 700, letterSpacing: "0.08em", textDecoration: "none",
            }}
            onClick={() => setShowTooltip(false)}
          >
            MANAGE ACCOUNT →
          </a>
        </div>
      )}
    </div>
  );
}
