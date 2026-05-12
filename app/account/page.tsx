"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { getStoredCustomerId, storeCustomerId } from "@/lib/credits";
import { getConnectedProviders } from "@/lib/byok";
import { listSavedFiles, getStorageUsage, formatBytes, isOPFSSupported } from "@/lib/opfs";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AccountData {
  email:        string | null;
  subscription: string;
  renewsAt:     string | null;
  credits: { text: number; image: number; video: number };
}

const TIER_LABELS: Record<string, { label: string; color: string; price: string }> = {
  free:   { label: "Free",   color: "var(--muted)",   price: "$0/mo"  },
  pro:    { label: "Pro",    color: "var(--accent)",  price: "$19/mo" },
  studio: { label: "Studio", color: "var(--info)",    price: "$39/mo" },
  team:   { label: "Team",   color: "var(--success)", price: "$79/mo" },
};

const CREDIT_PACKS: Record<"text"|"image"|"video", { size: number; price: string }[]> = {
  text:  [{ size: 10, price: "$9" }, { size: 25, price: "$19" }, { size: 100, price: "$69" }],
  image: [{ size: 50, price: "$6" }, { size: 150, price: "$15" }, { size: 500, price: "$40" }],
  video: [{ size: 20, price: "$4" }, { size: 60, price: "$10" }, { size: 200, price: "$29" }],
};

// ─────────────────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const [customerId, setCustomerId]   = useState<string | null>(null);
  const [account, setAccount]         = useState<AccountData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [email, setEmail]             = useState("");
  const [sendingLink, setSendingLink] = useState(false);
  const [linkSent, setLinkSent]       = useState(false);

  // KB state
  const [kbFiles, setKbFiles]         = useState(0);
  const [kbSize, setKbSize]           = useState(0);

  // Checkout state
  const [buyingCredits, setBuyingCredits] = useState<string | null>(null);
  const [subscribing, setSubscribing]     = useState<string | null>(null);

  const connectedKeys = getConnectedProviders();

  useEffect(() => {
    const id = getStoredCustomerId();
    setCustomerId(id);
    if (id) loadAccount(id);
    else setLoading(false);

    if (isOPFSSupported()) {
      Promise.all([listSavedFiles(), getStorageUsage()])
        .then(([files, usage]) => { setKbFiles(files.length); setKbSize(usage.used); })
        .catch(() => {});
    }
  }, []);

  const loadAccount = async (id: string) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/auth?customerId=${id}`);
      const data = await res.json();
      if (data.authenticated) {
        setAccount({
          email:        data.email,
          subscription: data.subscription,
          renewsAt:     data.renewsAt,
          credits:      data.credits,
        });
      } else {
        setCustomerId(null);
      }
    } catch {
      setCustomerId(null);
    } finally {
      setLoading(false);
    }
  };

  // ── Magic link ───────────────────────────────────────────────────────────────

  const handleMagicLink = async () => {
    if (!email.trim()) return;
    setSendingLink(true);
    try {
      const res  = await fetch("/api/auth", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.customerId) {
        storeCustomerId(data.customerId);
        setCustomerId(data.customerId);
      }
      setLinkSent(true);
      if (data.url) window.open(data.url, "_blank");
    } catch {
      // Silent — show sent state anyway
      setLinkSent(true);
    } finally {
      setSendingLink(false);
    }
  };

  // ── Buy credits ──────────────────────────────────────────────────────────────

  // Checkout modal state for embedded Stripe checkout
  const [checkoutSecret, setCheckoutSecret] = React.useState<string | null>(null);

  const handleBuyCredits = async (
    creditType: "text" | "image" | "video",
    packSize: number
  ) => {
    if (!customerId) return;
    setBuyingCredits(`${creditType}_${packSize}`);
    try {
      const res  = await fetch("/api/credits/purchase", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ creditType, packSize, customerId }),
      });
      const data = await res.json();
      // API returns clientSecret for embedded checkout
      if (data.clientSecret) {
        setCheckoutSecret(data.clientSecret);
      } else if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // silent
    } finally {
      setBuyingCredits(null);
    }
  };

  // ── Subscribe ────────────────────────────────────────────────────────────────

  const handleSubscribe = async (tier: string) => {
    if (!customerId) return;
    setSubscribing(tier);
    try {
      const res  = await fetch("/api/subscriptions", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ tier, customerId }),
      });
      const data = await res.json();
      // API returns clientSecret for embedded checkout
      if (data.clientSecret) {
        setCheckoutSecret(data.clientSecret);
      } else if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // silent
    } finally {
      setSubscribing(null);
    }
  };

  // ── Manage via Stripe Portal ──────────────────────────────────────────────────

  const handleManageSubscription = async () => {
    if (!customerId) return;
    const res  = await fetch(`/api/subscriptions?customerId=${customerId}`);
    const data = await res.json();
    if (data.url) window.open(data.url, "_blank");
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface)", color: "var(--text)" }}>

      {/* Nav */}
      <nav style={{ borderBottom: "1px solid var(--border)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface)", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span className="mono" style={{ color: "var(--accent)", fontWeight: 600, fontSize: 15 }}>TokenLift</span>
          </Link>
          <span style={{ color: "var(--border)" }}>·</span>
          <span className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em" }}>ACCOUNT</span>
        </div>
        <Link href="/tool" className="mono" style={{ fontSize: 10, color: "var(--muted)", textDecoration: "none", border: "1px solid var(--border)", padding: "5px 12px", letterSpacing: "0.08em" }}>
          ← OPEN TOOL
        </Link>
      </nav>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Not signed in ──────────────────────────────────────────────── */}
        {!customerId && !loading && (
          <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: "24px" }}>
            <div className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em", marginBottom: 16 }}>
              SIGN IN
            </div>
            <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16, lineHeight: 1.6 }}>
              Enter your email to receive a sign-in link. No password needed.
            </p>
            {!linkSent ? (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleMagicLink()}
                  placeholder="you@example.com"
                  style={{
                    flex: 1, background: "var(--panel-2, var(--surface))",
                    border: "1px solid var(--border)", color: "var(--text)",
                    padding: "8px 12px", fontSize: 13,
                    fontFamily: "DM Sans, sans-serif", outline: "none",
                  }}
                />
                <button
                  onClick={handleMagicLink}
                  disabled={sendingLink || !email.trim()}
                  style={{
                    background: "var(--accent)", color: "var(--surface)",
                    border: "none", padding: "8px 18px",
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                    cursor: "pointer",
                  }}
                >
                  {sendingLink ? "SENDING…" : "SEND LINK →"}
                </button>
              </div>
            ) : (
              <div style={{ padding: "12px 16px", border: "1px solid var(--success)", fontSize: 13, color: "var(--success)" }}>
                ✓ Portal link opened in new tab. Sign in there to access your account.
              </div>
            )}
          </div>
        )}

        {loading && (
          <div style={{ padding: "32px", textAlign: "center" }}>
            <span className="mono" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.1em" }}>LOADING…</span>
          </div>
        )}

        {/* ── Signed in ──────────────────────────────────────────────────── */}
        {account && (
          <>
            {/* Profile + subscription */}
            <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: "20px" }}>
              <div className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em", marginBottom: 14 }}>
                ACCOUNT
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, color: "var(--text)", marginBottom: 4 }}>{account.email ?? "—"}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="mono" style={{
                      fontSize: 10, padding: "2px 8px",
                      border: `1px solid ${TIER_LABELS[account.subscription]?.color ?? "var(--border)"}`,
                      color: TIER_LABELS[account.subscription]?.color ?? "var(--muted)",
                    }}>
                      {TIER_LABELS[account.subscription]?.label ?? account.subscription} PLAN
                    </span>
                    {account.renewsAt && (
                      <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                        Renews {account.renewsAt}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleManageSubscription}
                    style={{
                      background: "none", border: "1px solid var(--border)",
                      color: "var(--muted)", padding: "6px 14px",
                      fontFamily: "JetBrains Mono, monospace", fontSize: 9,
                      letterSpacing: "0.06em", cursor: "pointer",
                    }}
                  >
                    MANAGE PAYMENT →
                  </button>
                </div>
              </div>
            </div>

            {/* Upgrade tiers (if not on team) */}
            {account.subscription !== "team" && (
              <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: "20px" }}>
                <div className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em", marginBottom: 14 }}>
                  UPGRADE PLAN
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                  {(["pro", "studio", "team"] as const)
                    .filter((t) => t !== account.subscription)
                    .map((tier) => {
                      const meta = TIER_LABELS[tier];
                      return (
                        <div key={tier} style={{ border: "1px solid var(--border)", padding: "14px" }}>
                          <div className="mono" style={{ fontSize: 10, color: meta.color, letterSpacing: "0.08em", marginBottom: 4 }}>
                            {meta.label}
                          </div>
                          <div className="mono" style={{ fontSize: 13, color: "var(--text)", marginBottom: 10 }}>
                            {meta.price}
                          </div>
                          <button
                            onClick={() => handleSubscribe(tier)}
                            disabled={subscribing === tier}
                            style={{
                              background: meta.color, color: "var(--surface)",
                              border: "none", padding: "6px 12px", width: "100%",
                              fontFamily: "JetBrains Mono, monospace",
                              fontSize: 9, fontWeight: 700, cursor: "pointer",
                            }}
                          >
                            {subscribing === tier ? "…" : "UPGRADE →"}
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Credits */}
            <div id="credits" style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: "20px" }}>
              <div className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em", marginBottom: 14 }}>
                CREDIT BALANCE
              </div>
              {(["text", "image", "video"] as const).map((type) => {
                const remaining = account.credits[type];
                const packs     = CREDIT_PACKS[type];
                return (
                  <div key={type} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span className="mono" style={{ fontSize: 11, color: "var(--text)", textTransform: "capitalize" }}>
                        {type} credits
                      </span>
                      <span className="mono" style={{ fontSize: 11, color: remaining > 0 ? "var(--success)" : "var(--danger)" }}>
                        {remaining} remaining
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {packs.map(({ size, price }) => (
                        <button
                          key={size}
                          onClick={() => handleBuyCredits(type, size)}
                          disabled={buyingCredits === `${type}_${size}`}
                          style={{
                            background: "none", border: "1px solid var(--border)",
                            color: "var(--muted)", padding: "4px 12px",
                            fontFamily: "JetBrains Mono, monospace", fontSize: 9,
                            letterSpacing: "0.06em", cursor: "pointer",
                          }}
                        >
                          {buyingCredits === `${type}_${size}` ? "…" : `+${size} — ${price}`}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Connected API keys */}
            <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: "20px" }}>
              <div className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em", marginBottom: 14 }}>
                CONNECTED API KEYS
              </div>
              {connectedKeys.length > 0 ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {connectedKeys.map((p) => (
                    <span key={p} className="mono" style={{
                      fontSize: 10, padding: "3px 10px",
                      border: "1px solid var(--success)", color: "var(--success)",
                    }}>
                      ✓ {p}
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
                  No API keys connected. Add them in the{" "}
                  <Link href="/tool" style={{ color: "var(--accent)" }}>tool</Link>.
                </p>
              )}
              <p className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 10 }}>
                Keys are stored in your browser only — never sent to TokenLift servers.
              </p>
            </div>

            {/* Knowledge base */}
            <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: "20px" }}>
              <div className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em", marginBottom: 14 }}>
                KNOWLEDGE BASE
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 4 }}>
                    {kbFiles} file{kbFiles !== 1 ? "s" : ""} stored locally
                  </div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                    {formatBytes(kbSize)} on your computer
                  </div>
                </div>
                <Link href="/kb" style={{
                  border: "1px solid var(--border)", color: "var(--muted)",
                  padding: "6px 14px", fontFamily: "JetBrains Mono, monospace",
                  fontSize: 9, letterSpacing: "0.06em", textDecoration: "none",
                }}>
                  MANAGE FILES →
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
