"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { PACKAGES, storeCustomerId, type PackageId } from "@/lib/credits";

interface Props {
  task?:   string;
  onClose: () => void;
}

const PACKAGE_ORDER: PackageId[] = ["trial", "starter", "pro", "elite"];

export default function PaywallModal({ task, onClose }: Props) {
  const [loading, setLoading] = useState<PackageId | null>(null);
  const [error,   setError]   = useState("");
  const [selected, setSelected] = useState<PackageId>("trial");

  const pay = async (packageId: PackageId) => {
    setLoading(packageId);
    setError("");
    try {
      const res  = await fetch("/api/paywall", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ packageId, task }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error ?? "Checkout failed");
      }
    } catch (e: any) {
      setError(e.message);
      setLoading(null);
    }
  };

  const pkg = PACKAGES[selected];

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:2000,
      background:"rgba(0,0,0,0.88)", backdropFilter:"blur(10px)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:20,
    }}>
      <div style={{
        background:"var(--panel)", border:"1px solid var(--border)",
        borderRadius:18, width:520, maxWidth:"100%",
        boxShadow:"0 40px 100px rgba(0,0,0,0.7)", overflow:"hidden",
      }}>
        {/* Header */}
        <div style={{ padding:"24px 24px 0", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:"var(--accent)", letterSpacing:".08em", marginBottom:6 }}>
              TOKENLIFT · CREDIT PACKAGES
            </div>
            <h2 style={{ fontSize:22, fontWeight:800, margin:0 }}>Choose your action credits</h2>
            <p style={{ fontSize:13, color:"var(--muted)", marginTop:4, marginBottom:0 }}>
              One-time purchase. Credits never expire. No subscription.
            </p>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:22, lineHeight:1, padding:0, marginLeft:16 }}>×</button>
        </div>

        <div style={{ padding:"20px 24px 24px" }}>
          {/* Package selector */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:20 }}>
            {PACKAGE_ORDER.map(id => {
              const p = PACKAGES[id];
              const isSelected = selected === id;
              return (
                <button key={id} onClick={() => setSelected(id)}
                  style={{
                    padding:"10px 6px", borderRadius:10, cursor:"pointer",
                    border:`2px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                    background: isSelected ? "color-mix(in srgb,var(--accent) 10%,var(--surface))" : "var(--surface)",
                    display:"flex", flexDirection:"column", alignItems:"center", gap:2, transition:"all .15s",
                  }}>
                  <span style={{ fontSize:10, fontWeight:700, color: isSelected ? "var(--accent)" : "var(--muted)", letterSpacing:".06em" }}>
                    {p.name.split(" ")[0].toUpperCase()}
                  </span>
                  <span style={{ fontSize:16, fontWeight:900, color: isSelected ? "var(--accent)" : "var(--text)" }}>
                    ${(p.price / 100).toFixed(p.price % 100 === 0 ? 0 : 2)}
                  </span>
                  <span style={{ fontSize:9, color:"var(--muted)" }}>{p.credits} cr</span>
                </button>
              );
            })}
          </div>

          {/* Selected package detail */}
          <div style={{
            background:"var(--surface)", border:`1px solid var(--border)`,
            borderRadius:12, padding:"18px 20px", marginBottom:20,
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:800 }}>TokenLift {pkg.name}</div>
                <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>{pkg.desc}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:28, fontWeight:900, color:"var(--accent)" }}>
                  ${(pkg.price / 100).toFixed(pkg.price % 100 === 0 ? 0 : 2)}
                </div>
                <div style={{ fontSize:11, color:"var(--muted)" }}>one-time</div>
              </div>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {[
                [`${pkg.credits} action credits`, "Each credit = one agent web operation"],
                ["Credits never expire",           "Use them at your own pace"],
                ...(selected === "trial"   ? [["1 active node", "Standard relay speed"]] : []),
                ...(selected === "starter" ? [["1 active node", "Standard relay speed"], ["Basic execution logs", ""]] : []),
                ...(selected === "pro"     ? [["3 parallel nodes", "Turbo relay · 60fps"], ["Advanced agent logs", ""]] : []),
                ...(selected === "elite"   ? [["10 parallel nodes", "Instant relay · Ultra-low latency"], ["Full session replays", ""]] : []),
              ].map(([feat, detail], i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:10, fontSize:13 }}>
                  <span style={{ color:"#22c55e", flexShrink:0 }}>✓</span>
                  <span style={{ color:"var(--text)", fontWeight:600 }}>{feat}</span>
                  {detail && <span style={{ color:"var(--muted)", fontSize:11 }}>· {detail}</span>}
                </div>
              ))}
            </div>
          </div>

          {task && (
            <div style={{ padding:"9px 14px", background:"color-mix(in srgb,var(--accent) 8%,transparent)", border:"1px solid var(--accent)", borderRadius:8, marginBottom:16, fontSize:12, color:"var(--text)" }}>
              <strong>Your task:</strong> {task}
            </div>
          )}

          {error && (
            <div style={{ fontSize:12, color:"#ef4444", marginBottom:12 }}>⚠ {error}</div>
          )}

          <button
            onClick={() => pay(selected)}
            disabled={loading !== null}
            style={{
              width:"100%", padding:14, borderRadius:10, fontSize:15, fontWeight:800,
              background: loading ? "var(--border)" : "var(--accent)",
              color:"white", border:"none", cursor: loading ? "default" : "pointer",
              transition:"background .15s",
            }}>
            {loading
              ? "Redirecting to Stripe…"
              : `Pay $${(pkg.price / 100).toFixed(pkg.price % 100 === 0 ? 0 : 2)} · Get ${pkg.credits} Credits →`
            }
          </button>

          <p style={{ fontSize:11, color:"var(--muted)", textAlign:"center", marginTop:10, marginBottom:0 }}>
            🔒 Secured by Stripe · Instant access after payment · No subscription ever
          </p>
        </div>
      </div>
    </div>
  );
}

// ── PurchaseRestorer ──────────────────────────────────────────────────────────
// Drop this once anywhere in the app (e.g. layout.tsx or page.tsx).
// Reads ?paid=true&customerId=cus_xxx from the URL after a Stripe redirect
// and persists the customer ID to localStorage so all future visits
// can restore the credit balance from Stripe.
export function PurchaseRestorer() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const paid       = searchParams.get("paid");
    const customerId = searchParams.get("customerId");

    if (paid === "true" && customerId) {
      storeCustomerId(customerId);
      // Clean the URL without reloading
      const clean = new URL(window.location.href);
      clean.searchParams.delete("paid");
      clean.searchParams.delete("customerId");
      clean.searchParams.delete("credits");
      clean.searchParams.delete("package");
      window.history.replaceState({}, "", clean.toString());
    }
  }, [searchParams]);

  return null;
}
