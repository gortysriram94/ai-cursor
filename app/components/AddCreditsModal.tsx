"use client";
import { useState, useRef, useEffect } from "react";

// 100 credits per $1.00 (1 credit per cent)
const CREDITS_PER_DOLLAR = 100;

interface Tier {
  label:   string;  // display price
  cents:   number;  // Stripe unit_amount
  credits: number;
  badge?:  string;  // optional callout
}

const TIERS: Tier[] = [
  { label: "$0.99",  cents:  99,   credits:  100                      },
  { label: "$4.99",  cents: 499,   credits:  500,  badge: "Popular"   },
  { label: "$9.99",  cents: 999,   credits: 1_000, badge: "+10% bonus" },
  { label: "$19.99", cents: 1999,  credits: 2_200, badge: "+20% bonus" },
];

interface Props {
  open:    boolean;
  onClose: () => void;
}

export default function AddCreditsModal({ open, onClose }: Props) {
  const [selected,    setSelected]    = useState<number | null>(null); // index into TIERS
  const [customDollars, setCustomDollars] = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setSelected(1); // default: $4.99
      setCustomDollars("");
      setError("");
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  const customCents   = Math.round(parseFloat(customDollars || "0") * 100);
  const customCredits = Math.floor(customCents * CREDITS_PER_DOLLAR / 100);
  const isCustomValid = customCents >= 99 && customCents <= 100_000;

  const activeIsCustom = selected === null;
  const activeCents    = activeIsCustom ? customCents    : TIERS[selected!].cents;
  const activeCredits  = activeIsCustom ? customCredits  : TIERS[selected!].credits;
  const activeLabel    = activeIsCustom ? `$${parseFloat(customDollars || "0").toFixed(2)}` : TIERS[selected!].label;
  const canPay         = activeIsCustom ? isCustomValid : selected !== null;

  const pay = async () => {
    if (!canPay || loading) return;
    setLoading(true);
    setError("");
    try {
      const body = activeIsCustom
        ? {
            customOrder: {
              amountCents: activeCents,
              credits:     activeCredits,
              name:        activeLabel,
            },
          }
        : { packageId: "trial" }; // use trial as placeholder; overridden by customOrder logic

      // Always use customOrder so the price is exact
      const res  = await fetch("/api/paywall", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          customOrder: {
            amountCents: activeCents,
            credits:     activeCredits,
            name:        activeLabel,
          },
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error ?? "Checkout failed");
      }
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        width: "min(96vw, 440px)",
        overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,.5)",
      }}>

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div style={{
          padding: "22px 24px 0",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        }}>
          <div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700, fontSize: 18,
              color: "var(--accent)",
              letterSpacing: "-0.01em",
              marginBottom: 4,
            }}>
              Add Credits
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
              One-time · No subscription · Credits never expire
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--muted)", fontSize: 22, lineHeight: 1, padding: "0 0 0 12px",
          }}>×</button>
        </div>

        {/* ── Price tiers ───────────────────────────────────────────────────── */}
        <div style={{ padding: "20px 24px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {TIERS.map((tier, i) => {
            const active = selected === i && !activeIsCustom;
            return (
              <button
                key={i}
                onClick={() => { setSelected(i); setCustomDollars(""); }}
                style={{
                  position: "relative",
                  padding: "14px 12px",
                  borderRadius: 10,
                  border: `2px solid ${active ? "var(--accent)" : "var(--border)"}`,
                  background: active
                    ? "color-mix(in srgb,var(--accent) 10%,var(--surface))"
                    : "var(--surface)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                {tier.badge && (
                  <span style={{
                    position: "absolute", top: -1, right: 8,
                    background: tier.badge === "Popular" ? "var(--accent)" : "var(--success)",
                    color: "#fff",
                    fontSize: 9, fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: "0 0 6px 6px",
                    letterSpacing: "0.04em",
                  }}>
                    {tier.badge.toUpperCase()}
                  </span>
                )}
                <div style={{
                  fontSize: 22, fontWeight: 900,
                  color: active ? "var(--accent)" : "var(--text)",
                  fontFamily: "'JetBrains Mono', monospace",
                  marginBottom: 4,
                }}>
                  {tier.label}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  {tier.credits.toLocaleString()} credits
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Custom amount ─────────────────────────────────────────────────── */}
        <div style={{ padding: "12px 24px 0" }}>
          <div
            onClick={() => { setSelected(null); setTimeout(() => inputRef.current?.focus(), 40); }}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: `2px solid ${activeIsCustom ? "var(--accent)" : "var(--border)"}`,
              background: activeIsCustom
                ? "color-mix(in srgb,var(--accent) 8%,var(--surface))"
                : "var(--surface)",
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 10,
              transition: "border-color 0.15s",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>Custom $</span>
            <input
              ref={inputRef}
              type="number"
              min="0.99"
              max="1000"
              step="0.01"
              value={customDollars}
              onChange={e => { setCustomDollars(e.target.value); setSelected(null); }}
              onFocus={() => setSelected(null)}
              placeholder="0.00"
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                fontSize: 16, fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--text)",
              }}
            />
            {customDollars && isCustomValid && (
              <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
                = {customCredits.toLocaleString()} cr
              </span>
            )}
          </div>
        </div>

        {/* ── Summary row ───────────────────────────────────────────────────── */}
        <div style={{
          margin: "16px 24px 0",
          padding: "12px 16px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>You get</div>
            <div style={{
              fontSize: 20, fontWeight: 800,
              color: "var(--accent)",
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {canPay ? activeCredits.toLocaleString() : "—"} credits
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Total</div>
            <div style={{
              fontSize: 20, fontWeight: 800,
              color: "var(--text)",
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {canPay ? activeLabel : "—"}
            </div>
          </div>
        </div>

        {/* ── CTA ───────────────────────────────────────────────────────────── */}
        <div style={{ padding: "16px 24px 0" }}>
          {error && (
            <div style={{
              fontSize: 12, color: "var(--danger)",
              background: "color-mix(in srgb,var(--danger) 10%,transparent)",
              border: "1px solid color-mix(in srgb,var(--danger) 30%,transparent)",
              borderRadius: 8, padding: "8px 12px", marginBottom: 10,
            }}>
              {error}
            </div>
          )}
          <button
            onClick={pay}
            disabled={!canPay || loading}
            style={{
              width: "100%",
              padding: "13px 0",
              background: canPay && !loading ? "var(--accent)" : "var(--border)",
              color: canPay && !loading ? "#fff" : "var(--muted)",
              border: "none",
              borderRadius: 10,
              fontSize: 15, fontWeight: 700,
              cursor: canPay && !loading ? "pointer" : "default",
              transition: "background 0.15s",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {loading ? "Redirecting to Stripe…" : canPay ? `Pay ${activeLabel} →` : "Select an amount"}
          </button>
        </div>

        {/* ── Gas price disclaimer ──────────────────────────────────────────── */}
        <div style={{
          padding: "12px 24px 20px",
          fontSize: 10,
          color: "var(--muted)",
          lineHeight: 1.6,
          textAlign: "center",
        }}>
          ⛽ Credit prices fluctuate with AI token demand — like gas prices.
          Locked in at purchase time. Subject to change without notice.
          <br />
          Secured by Stripe · No card data stored by Pushpa
        </div>
      </div>
    </div>
  );
}
