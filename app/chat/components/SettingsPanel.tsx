"use client";
// SettingsPanel — slide-out drawer with two tabs:
//   API Keys (BYOK): enter/save provider API keys
//   Credits:         buy credit packs, view balance

import React, { useState, useEffect, useCallback } from "react";
import {
  saveKey, getKey, clearKey, persistKey, loadPersistedKeys,
  validateKeyFormat, PROVIDER_META, type Provider,
} from "@/lib/byok";
import { getStoredCustomerId, storeCustomerId } from "@/lib/credits";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Balance { text: number; image: number; video: number; subscription: string; renewsAt: string | null; }

// ─── Credit packs ─────────────────────────────────────────────────────────────
const PACKS = [
  { label: "Starter",      credits: 10,  price: "$3",  desc: "~10 agent tasks",   size: 10  },
  { label: "Professional", credits: 25,  price: "$7",  desc: "~25 agent tasks",   size: 25  },
  { label: "Power",        credits: 100, price: "$25", desc: "~100 agent tasks",  size: 100 },
];

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"extension" | "keys" | "credits">("extension");

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, zIndex: 490,
        background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)",
      }} />
      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 380, zIndex: 500,
        background: "var(--panel)", borderLeft: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        boxShadow: "-8px 0 40px rgba(0,0,0,.4)",
      }}>
        {/* Header */}
        <div style={{
          height: 52, flexShrink: 0, display: "flex", alignItems: "center",
          padding: "0 18px", borderBottom: "1px solid var(--border)",
          gap: 10,
        }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", flex: 1 }}>Settings</span>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--muted)", fontSize: 20, lineHeight: 1, padding: 0,
          }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          {(["extension", "keys", "credits"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, height: 40, border: "none", cursor: "pointer",
              background: "transparent", fontFamily: "inherit",
              fontSize: 12, fontWeight: 600,
              color: tab === t ? "var(--accent)" : "var(--muted)",
              borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "color .15s",
            }}>
              {t === "extension" ? "🧩 Extension" : t === "keys" ? "🔑 API Keys" : "💳 Credits"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {tab === "extension" ? <ExtensionTab /> :
           tab === "keys"      ? <KeysTab />      : <CreditsTab />}
        </div>
      </div>
    </>
  );
}

// ─── Extension tab ────────────────────────────────────────────────────────────
type InstallStep = "idle" | "extracting" | "extracted" | "done";

function ExtensionTab() {
  const [step,       setStep]       = useState<InstallStep>("idle");
  const [folderName, setFolderName] = useState("");
  const [error,      setError]      = useState("");
  const [copied,     setCopied]     = useState(false);

  const hasFSA = typeof window !== "undefined" && "showDirectoryPicker" in window;

  const installExtension = async () => {
    setStep("extracting"); setError("");
    try {
      // 1. Fetch the zip from our API
      const res = await fetch("/api/extension");
      if (!res.ok) throw new Error("Server error packaging extension");
      const blob = await res.blob();

      // 2. Load zip client-side
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(blob);

      // 3. Let user pick (or create) a destination folder — one click
      const dirHandle = await (window as any).showDirectoryPicker({
        suggestedName: "tokenlift-extension",
        mode:          "readwrite",
        startIn:       "downloads",
      });
      setFolderName(dirHandle.name);

      // 4. Extract every file into that folder (handle subdirectories)
      await Promise.all(
        Object.entries(zip.files).map(async ([filename, file]) => {
          if ((file as any).dir) return;
          const parts = filename.split("/");
          let handle: any = dirHandle;
          for (let i = 0; i < parts.length - 1; i++) {
            handle = await handle.getDirectoryHandle(parts[i], { create: true });
          }
          const fh  = await handle.getFileHandle(parts[parts.length - 1], { create: true });
          const buf = await (file as any).async("arraybuffer");
          const wr  = await fh.createWritable();
          await wr.write(buf);
          await wr.close();
        }),
      );

      setStep("extracted");
    } catch (e: any) {
      if (e?.name === "AbortError") {
        setStep("idle"); // user cancelled folder picker — no error
      } else {
        setError(e?.message ?? String(e));
        setStep("idle");
      }
    }
  };

  // Fallback: plain zip download for browsers without File System Access API
  const downloadZip = async () => {
    setStep("extracting");
    try {
      const res  = await fetch("/api/extension");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement("a"), { href: url, download: "tokenlift-extension.zip" });
      a.click();
      URL.revokeObjectURL(url);
      setStep("extracted");
      setFolderName("tokenlift-extension (unzip first)");
    } catch (e: any) {
      setError(e?.message ?? String(e)); setStep("idle");
    }
  };

  const copyExtUrl = () => {
    navigator.clipboard.writeText("chrome://extensions").catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ padding: "20px 18px" }}>

      {/* What you unlock */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        {([
          ["Without", "#ef4444", ["Iframe proxy", "CORS blocked", "No cookies", "Sites block agent"]],
          ["With extension", "#22c55e", ["Real Chrome tab", "Cookie sessions", "LinkedIn & Gmail", "MetaMask & Web3"]],
        ] as const).map(([label, color, items]) => (
          <div key={label} style={{ background: "var(--surface)", borderRadius: 10, padding: "12px 14px", border: `1px solid ${color}30` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 8, letterSpacing: ".05em" }}>{label.toUpperCase()}</div>
            {items.map(item => (
              <div key={item} style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, display: "flex", gap: 6, alignItems: "flex-start" }}>
                <span style={{ color, flexShrink: 0 }}>{label === "Without" ? "✗" : "✓"}</span>{item}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ── STEP 1 ─────────────────────────────────────────────────────────── */}
      <div style={{
        padding: "18px", borderRadius: 12, marginBottom: 12,
        background: step === "idle" || step === "extracting"
          ? "color-mix(in srgb,var(--accent) 6%,var(--surface))"
          : "color-mix(in srgb,#22c55e 6%,var(--surface))",
        border: `2px solid ${step === "idle" || step === "extracting" ? "var(--accent)" : "#22c55e"}40`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{
            width: 24, height: 24, borderRadius: "50%", fontSize: 12, fontWeight: 800,
            background: step === "extracted" || step === "done" ? "#22c55e" : "var(--accent)",
            color: "white", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            {step === "extracted" || step === "done" ? "✓" : "1"}
          </div>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            {step === "extracting" ? "Extracting extension…" :
             step === "extracted"  ? `Extracted to "${folderName}"` :
             "Extract extension to a folder"}
          </span>
        </div>

        {step === "idle" && (
          <button
            onClick={hasFSA ? installExtension : downloadZip}
            style={{
              width: "100%", padding: "13px 0", borderRadius: 10, border: "none",
              background: "var(--accent)", color: "white", cursor: "pointer",
              fontSize: 14, fontWeight: 800,
            }}>
            {hasFSA ? "⬇ Choose folder & extract automatically" : "⬇ Download ZIP"}
          </button>
        )}

        {step === "extracting" && (
          <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: "60%", background: "var(--accent)", borderRadius: 2, animation: "tl-pulse 1s ease-in-out infinite" }} />
          </div>
        )}

        {(step === "extracted" || step === "done") && (
          <div style={{ fontSize: 11, color: "#22c55e" }}>
            ✓ All files written to <strong>{folderName}</strong> — keep this folder, you'll need it in the next step.
          </div>
        )}

        {!hasFSA && step === "idle" && (
          <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 8, marginBottom: 0 }}>
            Your browser doesn't support auto-extract — you'll need to unzip manually after downloading.
          </p>
        )}
        {error && <p style={{ fontSize: 11, color: "#ef4444", marginTop: 8, marginBottom: 0 }}>⚠ {error}</p>}
      </div>

      {/* ── STEP 2 ─────────────────────────────────────────────────────────── */}
      <div style={{
        padding: "18px", borderRadius: 12, marginBottom: 12,
        opacity: step === "extracted" || step === "done" ? 1 : 0.4,
        background: step === "done" ? "color-mix(in srgb,#22c55e 6%,var(--surface))" : "var(--surface)",
        border: `2px solid ${step === "done" ? "#22c55e40" : "var(--border)"}`,
        transition: "opacity .3s",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{
            width: 24, height: 24, borderRadius: "50%", fontSize: 12, fontWeight: 800,
            background: step === "done" ? "#22c55e" : "var(--panel)",
            border: "1px solid var(--border)",
            color: step === "done" ? "white" : "var(--text)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            {step === "done" ? "✓" : "2"}
          </div>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Open Chrome Extensions & load the folder</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Copy chrome://extensions */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              fontFamily: "monospace", fontSize: 12, padding: "6px 12px",
              background: "var(--panel)", borderRadius: 6, border: "1px solid var(--border)",
              flex: 1, color: "var(--accent)",
            }}>chrome://extensions</div>
            <button onClick={copyExtUrl} style={{
              background: copied ? "#22c55e" : "var(--accent)", color: "white", border: "none",
              borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 11, fontWeight: 700,
              whiteSpace: "nowrap", flexShrink: 0, transition: "background .2s",
            }}>
              {copied ? "✓ Copied" : "Copy & open"}
            </button>
          </div>

          {/* Steps 2b and 2c */}
          {[
            { icon: "🔧", text: 'Turn on "Developer mode" — toggle in the top-right corner' },
            { icon: "📂", text: `Click "Load unpacked" → select the "${folderName || "tokenlift-extension"}" folder` },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12, color: "var(--text)" }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{s.icon}</span>
              <span style={{ lineHeight: 1.5 }}>{s.text}</span>
            </div>
          ))}

          <button
            onClick={() => setStep("done")}
            disabled={step !== "extracted"}
            style={{
              padding: "10px 0", borderRadius: 8, border: "none",
              background: step === "extracted" ? "#22c55e" : "var(--border)",
              color: "white", cursor: step === "extracted" ? "pointer" : "default",
              fontSize: 13, fontWeight: 700, marginTop: 4,
            }}>
            ✓ Done — extension installed
          </button>
        </div>
      </div>

      {/* Success */}
      {step === "done" && (
        <div style={{
          padding: "16px 18px", borderRadius: 12,
          background: "color-mix(in srgb,#22c55e 8%,var(--surface))",
          border: "1px solid #22c55e40", fontSize: 12, lineHeight: 1.65,
          animation: "tl-fadein .4s ease both",
        }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>🎉</div>
          <strong>Full browser automation unlocked.</strong><br />
          <span style={{ color: "var(--muted)" }}>
            The 🧩 icon is now in your Chrome toolbar. Agents can access your real sessions,
            cookies, LinkedIn, Gmail, and MetaMask.
          </span>
        </div>
      )}
    </div>
  );
}

// ─── API Keys tab ─────────────────────────────────────────────────────────────
function KeysTab() {
  const [vals, setVals] = useState<Record<Provider, string>>({
    anthropic: "", openai: "", fal: "", luma: "",
  });
  const [saved, setSaved] = useState<Record<Provider, boolean>>({
    anthropic: false, openai: false, fal: false, luma: false,
  });

  useEffect(() => {
    loadPersistedKeys();
    const providers: Provider[] = ["anthropic", "openai", "fal", "luma"];
    const current: Record<Provider, string> = {} as any;
    providers.forEach(p => { current[p] = getKey(p) ?? ""; });
    setVals(current);
  }, []);

  const save = (provider: Provider) => {
    const key = vals[provider].trim();
    if (!key) { clearKey(provider); return; }
    if (!validateKeyFormat(provider, key)) { alert(`Invalid ${PROVIDER_META[provider].label} key format.`); return; }
    saveKey(provider, key);
    persistKey(provider, key);
    setSaved(prev => ({ ...prev, [provider]: true }));
    setTimeout(() => setSaved(prev => ({ ...prev, [provider]: false })), 2000);
  };

  const remove = (provider: Provider) => {
    clearKey(provider);
    setVals(prev => ({ ...prev, [provider]: "" }));
  };

  return (
    <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6,
        background: "color-mix(in srgb,var(--accent) 6%,transparent)",
        border: "1px solid color-mix(in srgb,var(--accent) 20%,transparent)",
        borderRadius: 8, padding: "8px 12px" }}>
        Keys are stored in your browser only — never sent to TokenLift servers.
        Providing your own key bypasses credit usage entirely.
      </div>

      {(Object.keys(PROVIDER_META) as Provider[]).map(provider => {
        const meta = PROVIDER_META[provider];
        const hasKey = !!getKey(provider);
        return (
          <div key={provider} style={{
            border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden",
          }}>
            <div style={{
              padding: "10px 14px", display: "flex", alignItems: "center", gap: 10,
              background: hasKey ? "color-mix(in srgb,#22c55e 6%,transparent)" : "var(--surface)",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
                  {meta.label}
                  {hasKey && <span style={{ fontSize: 10, color: "#22c55e", background: "rgba(34,197,94,.12)", padding: "1px 6px", borderRadius: 4 }}>● connected</span>}
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                  Unlocks: {meta.unlocks.join(", ")}
                </div>
              </div>
              <a href={meta.docsUrl} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 10, color: "var(--accent)", textDecoration: "none" }}>Get key ↗</a>
            </div>
            <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", display: "flex", gap: 6 }}>
              <input
                type="password"
                value={vals[provider]}
                onChange={e => setVals(prev => ({ ...prev, [provider]: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") save(provider); }}
                placeholder={meta.keyHint}
                style={{
                  flex: 1, border: "1px solid var(--border)", borderRadius: 7,
                  padding: "6px 10px", background: "var(--surface)",
                  color: "var(--text)", fontSize: 11, outline: "none", fontFamily: "monospace",
                }}
              />
              <button onClick={() => save(provider)} style={{
                background: saved[provider] ? "#22c55e" : "var(--accent)", color: "white",
                border: "none", borderRadius: 7, padding: "6px 12px",
                cursor: "pointer", fontSize: 11, fontWeight: 600, transition: "background .2s",
              }}>{saved[provider] ? "✓" : "Save"}</button>
              {hasKey && (
                <button onClick={() => remove(provider)} style={{
                  background: "var(--surface)", color: "var(--muted)",
                  border: "1px solid var(--border)", borderRadius: 7, padding: "6px 10px",
                  cursor: "pointer", fontSize: 11,
                }}>Remove</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Credits tab ──────────────────────────────────────────────────────────────
function CreditsTab() {
  const [balance, setBalance]     = useState<Balance | null>(null);
  const [loading, setLoading]     = useState(false);
  const [buying, setBuying]       = useState<number | null>(null);
  const [email, setEmail]         = useState("");
  const [emailStep, setEmailStep] = useState(!getStoredCustomerId());
  const [error, setError]         = useState("");

  const customerId = getStoredCustomerId();

  const fetchBalance = useCallback(async (cid: string) => {
    try {
      const res = await fetch(`/api/credits/balance?customerId=${cid}`);
      if (res.ok) setBalance(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (customerId) fetchBalance(customerId);
  }, [customerId, fetchBalance]);

  const createCustomer = async () => {
    if (!email.includes("@")) { setError("Enter a valid email address."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/credits/create-customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await res.json();
      if (!res.ok || !d.customerId) throw new Error(d.error ?? "Failed");
      storeCustomerId(d.customerId);
      setEmailStep(false);
      fetchBalance(d.customerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error creating account");
    } finally { setLoading(false); }
  };

  const buyPack = async (size: number) => {
    const cid = getStoredCustomerId();
    if (!cid) return;
    setBuying(size); setError("");
    try {
      const res = await fetch("/api/credits/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creditType: "text", packSize: size, customerId: cid }),
      });
      const d = await res.json();
      if (!res.ok || !d.clientSecret) throw new Error(d.error ?? "Checkout failed");
      // Redirect to Stripe hosted checkout
      window.location.href = `https://checkout.stripe.com/c/pay/${d.clientSecret}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Purchase failed");
    } finally { setBuying(null); }
  };

  if (emailStep) {
    return (
      <div style={{ padding: "24px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Create your account</div>
        <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
          Enter your email to track credits across sessions. No password needed.
        </div>
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") createCustomer(); }}
          placeholder="you@example.com"
          style={{
            border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px",
            background: "var(--surface)", color: "var(--text)", fontSize: 13,
            outline: "none", fontFamily: "inherit",
          }}
        />
        {error && <div style={{ fontSize: 11, color: "#ef4444" }}>{error}</div>}
        <button onClick={createCustomer} disabled={loading} style={{
          background: "var(--accent)", color: "white", border: "none",
          borderRadius: 8, padding: "10px", cursor: loading ? "default" : "pointer",
          fontSize: 13, fontWeight: 700, opacity: loading ? .6 : 1,
        }}>{loading ? "Creating…" : "Continue"}</button>
        <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "center" }}>
          Already have an account? Your credits are tied to your email address.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Balance */}
      <div style={{
        borderRadius: 10, padding: "14px 16px",
        background: "color-mix(in srgb,var(--accent) 8%,transparent)",
        border: "1px solid color-mix(in srgb,var(--accent) 20%,transparent)",
      }}>
        <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>
          Current balance
        </div>
        {balance ? (
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: "var(--accent)", fontFamily: "monospace" }}>
              {balance.text}
            </span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>agent credits</span>
            {balance.subscription !== "free" && (
              <span style={{ marginLeft: "auto", fontSize: 10, padding: "2px 8px", borderRadius: 5,
                background: "var(--accent)", color: "white", fontWeight: 700 }}>
                {balance.subscription.toUpperCase()}
              </span>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Loading…</div>
        )}
        <button onClick={() => customerId && fetchBalance(customerId)}
          style={{ marginTop: 8, fontSize: 10, color: "var(--muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          ↻ Refresh
        </button>
      </div>

      {/* Packs */}
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>
        Buy credits
      </div>
      {PACKS.map(pack => (
        <div key={pack.size} style={{
          border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{pack.label}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
              {pack.credits} credits · {pack.desc}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{pack.price}</div>
            <button onClick={() => buyPack(pack.size)} disabled={buying === pack.size}
              style={{
                marginTop: 6, background: "var(--accent)", color: "white", border: "none",
                borderRadius: 7, padding: "6px 14px", cursor: buying === pack.size ? "default" : "pointer",
                fontSize: 11, fontWeight: 700, opacity: buying === pack.size ? .6 : 1,
              }}>
              {buying === pack.size ? "…" : "Buy"}
            </button>
          </div>
        </div>
      ))}

      {error && <div style={{ fontSize: 11, color: "#ef4444", textAlign: "center" }}>{error}</div>}

      <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "center", lineHeight: 1.6 }}>
        Payments powered by Stripe. Credits never expire.
        <br />Using your own API key? Credits are not consumed.
      </div>
    </div>
  );
}
