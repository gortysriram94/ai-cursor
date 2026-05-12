"use client";

import { useState, useEffect } from "react";
import {
  saveKey, getKey, hasKey, clearKey,
  persistKey, loadPersistedKeys,
  validateKeyFormat, getConnectedProviders,
  PROVIDER_META, type Provider,
} from "@/lib/byok";

interface Props {
  onKeysChange?: (providers: Provider[]) => void;
}

export default function ApiKeyPanel({ onKeysChange }: Props) {
  const [open, setOpen]           = useState(false);
  const [inputs, setInputs]       = useState<Record<Provider, string>>({
    anthropic: "", openai: "", fal: "", luma: "",
  });
  const [persists, setPersists]   = useState<Record<Provider, boolean>>({
    anthropic: false, openai: false, fal: false, luma: false,
  });
  const [connected, setConnected] = useState<Provider[]>([]);
  const [errors, setErrors]       = useState<Record<string, string>>({});
  const [saved, setSaved]         = useState<Record<Provider, boolean>>({
    anthropic: false, openai: false, fal: false, luma: false,
  });

  const providers = Object.keys(PROVIDER_META) as Provider[];

  useEffect(() => {
    loadPersistedKeys();
    const c = getConnectedProviders();
    setConnected(c);
    onKeysChange?.(c);
    // Mask connected keys
    const masked: Record<Provider, string> = { anthropic: "", openai: "", fal: "", luma: "" };
    c.forEach((p) => { masked[p] = "••••••••••••••••"; });
    setInputs(masked);
  }, []);

  const handleConnect = (provider: Provider) => {
    const raw = inputs[provider].trim();
    if (!raw || raw.startsWith("•")) return;

    if (!validateKeyFormat(provider, raw)) {
      setErrors((e) => ({ ...e, [provider]: `Key should start with "${PROVIDER_META[provider].keyPrefix}"` }));
      return;
    }

    setErrors((e) => ({ ...e, [provider]: "" }));
    saveKey(provider, raw);
    if (persists[provider]) persistKey(provider, raw);

    // Mask the input
    setInputs((i) => ({ ...i, [provider]: "••••••••••••••••" }));
    setSaved((s) => ({ ...s, [provider]: true }));
    setTimeout(() => setSaved((s) => ({ ...s, [provider]: false })), 2000);

    const c = getConnectedProviders();
    setConnected(c);
    onKeysChange?.(c);
  };

  const handleDisconnect = (provider: Provider) => {
    clearKey(provider);
    setInputs((i) => ({ ...i, [provider]: "" }));
    const c = getConnectedProviders();
    setConnected(c);
    onKeysChange?.(c);
  };

  const isConnected = (p: Provider) => connected.includes(p);

  return (
    <div style={{ border: "1px solid var(--border)", background: "var(--panel)", overflow: "hidden" }}>
      {/* Header toggle */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", background: "none", border: "none",
          padding: "12px 16px", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em" }}>
            CONNECT YOUR AI MODELS
          </span>
          {connected.length > 0 && (
            <span className="mono" style={{
              fontSize: 9, padding: "2px 8px",
              background: "color-mix(in srgb, var(--success) 15%, transparent)",
              border: "1px solid var(--success)", color: "var(--success)",
            }}>
              {connected.length} CONNECTED
            </span>
          )}
        </div>
        <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          {/* Security note */}
          <div style={{
            padding: "10px 16px", borderBottom: "1px solid var(--border)",
            display: "flex", gap: 8, alignItems: "flex-start",
            background: "color-mix(in srgb, var(--success) 5%, transparent)",
          }}>
            <span style={{ color: "var(--success)", fontSize: 12, flexShrink: 0 }}>◉</span>
            <span className="mono" style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.6 }}>
              Keys stored in your browser only · Never sent to TokenLift servers ·
              Cleared when you close this tab (unless you choose to remember)
            </span>
          </div>

          {/* Provider rows */}
          {providers.map((provider) => {
            const meta      = PROVIDER_META[provider];
            const connected = isConnected(provider);
            const err       = errors[provider];
            const isSaved   = saved[provider];

            return (
              <div key={provider} style={{
                padding: "14px 16px",
                borderBottom: "1px solid var(--border)",
              }}>
                {/* Provider header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="mono" style={{ fontSize: 11, color: connected ? "var(--text)" : "var(--text-dim)" }}>
                        {meta.label}
                      </span>
                      {connected && (
                        <span className="mono" style={{ fontSize: 9, color: "var(--success)", padding: "1px 6px", border: "1px solid var(--success)" }}>
                          ✓ CONNECTED
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                      {meta.unlocks.map((u) => (
                        <span key={u} className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>
                          {connected ? "✓" : "○"} {u}
                        </span>
                      ))}
                    </div>
                  </div>

                  {connected && (
                    <button
                      onClick={() => handleDisconnect(provider)}
                      style={{
                        background: "none", border: "1px solid var(--border)",
                        color: "var(--muted)", padding: "3px 10px",
                        fontFamily: "JetBrains Mono, monospace", fontSize: 9,
                        letterSpacing: "0.06em", cursor: "pointer",
                      }}
                    >
                      DISCONNECT
                    </button>
                  )}
                </div>

                {/* Key input */}
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="password"
                    value={inputs[provider]}
                    onChange={(e) => {
                      setInputs((i) => ({ ...i, [provider]: e.target.value }));
                      setErrors((er) => ({ ...er, [provider]: "" }));
                    }}
                    placeholder={meta.keyHint}
                    style={{
                      flex: 1, background: "var(--panel-2, var(--surface))",
                      border: `1px solid ${err ? "var(--danger)" : "var(--border)"}`,
                      color: "var(--text)", padding: "7px 10px",
                      fontSize: 12, fontFamily: "JetBrains Mono, monospace",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={() => handleConnect(provider)}
                    style={{
                      background: isSaved ? "var(--success)" : "var(--accent)",
                      color: "var(--surface)", border: "none",
                      padding: "7px 14px", flexShrink: 0,
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 9, fontWeight: 700,
                      letterSpacing: "0.06em", cursor: "pointer",
                      transition: "background 0.2s",
                    }}
                  >
                    {isSaved ? "SAVED ✓" : connected ? "UPDATE" : "CONNECT"}
                  </button>
                </div>

                {err && (
                  <div className="mono" style={{ fontSize: 10, color: "var(--danger)", marginTop: 5 }}>
                    {err}
                  </div>
                )}

                {/* Persist toggle */}
                <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={persists[provider]}
                    onChange={(e) => setPersists((p) => ({ ...p, [provider]: e.target.checked }))}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                    Remember this key in my browser
                  </span>
                  <a
                    href={meta.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ marginLeft: "auto", fontSize: 10, color: "var(--accent)", fontFamily: "monospace" }}
                  >
                    Get key →
                  </a>
                </label>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
