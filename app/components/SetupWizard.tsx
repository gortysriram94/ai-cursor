"use client";
import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "pushpa_setup_seen";
const BADGE_KEY   = "pushpa_setup_badge";

interface StepState {
  electron:  boolean;
  extension: boolean;
  cookies:   boolean;
  connected: boolean;
}

const DEFAULT_STATE: StepState = { electron: false, extension: false, cookies: false, connected: false };

async function checkHealth(): Promise<{ electronOnline: boolean; extensionOnline: boolean }> {
  try {
    const res = await fetch("/api/agent/health");
    if (res.ok) return await res.json();
  } catch {}
  return { electronOnline: false, extensionOnline: false };
}

// ── Setup step definitions ────────────────────────────────────────────────────
const STEPS = [
  {
    key:       "electron" as const,
    title:     "Install Pushpa Browser",
    icon:      "🖥",
    desc:      "Download and install the Pushpa Electron browser. This is a dedicated Chrome window the agent controls — it never touches your regular browser.",
    action:    "Download Pushpa Browser",
    actionUrl: "/api/electron-download",
    guide: [
      "1. Click the download button above",
      "2. Open the installer when it finishes downloading",
      "3. Follow the installation prompts (macOS: drag to Applications)",
      "4. Launch Pushpa Browser from your Applications / Start Menu",
    ],
  },
  {
    key:       "extension" as const,
    title:     "Install Chrome Extension",
    icon:      "🧩",
    desc:      "The Chrome extension bridges the agent and the web page — it reads the live DOM, relays commands, and handles JavaScript-heavy sites the agent can't access directly.",
    action:    "Download Extension (ZIP)",
    actionUrl: "/api/extension",
    guide: [
      "1. Click the download button and save the ZIP anywhere",
      "2. Unzip the folder",
      "3. Open Chrome and go to chrome://extensions",
      "4. Enable 'Developer mode' (toggle, top right)",
      "5. Click 'Load unpacked' and select the unzipped folder",
      "6. The Pushpa icon will appear in your toolbar",
    ],
  },
  {
    key:       "cookies" as const,
    title:     "Sync Your Cookies",
    icon:      "🍪",
    desc:      "Copy your real Chrome cookies into the agent's browser so it stays logged in to sites you already use — without you re-entering your credentials.",
    action:    "Sync Cookies (inside Pushpa Browser)",
    actionUrl: null,
    guide: [
      "1. Open Pushpa Browser (installed in Step 1)",
      "2. Click the Pushpa icon in the toolbar",
      "3. Click 'Sync Cookies from Chrome'",
      "4. Approve the permission prompt",
      "✓ Your sessions are now copied — no passwords shared",
    ],
  },
  {
    key:       "connected" as const,
    title:     "Test Connection",
    icon:      "🔌",
    desc:      "Verify that the agent, extension, and this app are all talking to each other. The status dot in the top nav should turn green.",
    action:    "Re-check connection",
    actionUrl: null,
    guide: [
      "1. Make sure Pushpa Browser is open and running",
      "2. Make sure the Chrome extension is enabled (Step 2)",
      "3. Click 'Re-check connection' below",
      "4. Watch the dot in the top nav — it should turn green",
    ],
  },
];

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  open:    boolean;
  onClose: () => void;
}

export default function SetupWizard({ open, onClose }: Props) {
  const [step,   setStep]   = useState(0);
  const [states, setStates] = useState<StepState>(DEFAULT_STATE);
  const [checking, setChecking] = useState(false);

  const recheck = useCallback(async () => {
    setChecking(true);
    const h = await checkHealth();
    setStates(s => ({
      ...s,
      electron:  s.electron  || h.electronOnline,
      extension: s.extension || h.extensionOnline,
      connected: h.electronOnline && h.extensionOnline,
    }));
    setChecking(false);
  }, []);

  useEffect(() => {
    if (open) recheck();
  }, [open, recheck]);

  const current = STEPS[step];
  const isDone  = states[current.key as keyof StepState];

  const incompleteBadge = Object.values(states).filter(v => !v).length;

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(4px)",
    }} onClick={e => e.target === e.currentTarget && onClose()}>

      <div style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        width: "min(96vw, 560px)",
        maxHeight: "90vh",
        overflow: "auto",
        padding: "28px 32px",
        position: "relative",
      }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: "var(--text)" }}>
              Set up Pushpa
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
              {4 - incompleteBadge} of 4 steps complete
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--muted)", fontSize: 20, lineHeight: 1, padding: 4,
          }}>×</button>
        </div>

        {/* Step tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
          {STEPS.map((s, i) => (
            <button key={s.key} onClick={() => setStep(i)} style={{
              flex: 1, padding: "6px 0",
              background: i === step ? "var(--accent)" : "var(--panel-2)",
              border: "1px solid " + (states[s.key as keyof StepState] ? "var(--success)" : i === step ? "var(--accent)" : "var(--border)"),
              borderRadius: 6,
              fontSize: 12,
              fontWeight: i === step ? 600 : 400,
              color: i === step ? "#fff" : states[s.key as keyof StepState] ? "var(--success)" : "var(--muted)",
              cursor: "pointer",
              transition: "background 0.15s",
              position: "relative",
            }}>
              {states[s.key as keyof StepState] ? "✓ " : `${i + 1}. `}{s.title.split(" ")[0]}
            </button>
          ))}
        </div>

        {/* Current step */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 28 }}>{current.icon}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>{current.title}</div>
              {isDone && (
                <div style={{ fontSize: 11, color: "var(--success)", marginTop: 2 }}>✓ Complete</div>
              )}
            </div>
          </div>

          <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 20 }}>
            {current.desc}
          </p>

          {/* Action button */}
          {current.actionUrl ? (
            <a
              href={current.actionUrl}
              download
              style={{
                display: "inline-block",
                background: "var(--accent)",
                color: "#fff",
                borderRadius: 8,
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                marginBottom: 20,
              }}
            >
              ↓ {current.action}
            </a>
          ) : current.key === "connected" ? (
            <button
              onClick={recheck}
              disabled={checking}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: 600,
                cursor: checking ? "default" : "pointer",
                marginBottom: 20,
                opacity: checking ? 0.7 : 1,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {checking ? "Checking…" : "↺ Re-check connection"}
            </button>
          ) : (
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20, fontStyle: "italic" }}>
              Complete this step inside Pushpa Browser, then come back here.
            </p>
          )}

          {/* Step guide */}
          <div style={{
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "14px 16px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              How to complete this step
            </div>
            {current.guide.map((line, i) => (
              <div key={i} style={{
                fontSize: 12,
                color: line.startsWith("✓") ? "var(--success)" : "var(--text-dim)",
                marginBottom: 5,
                lineHeight: 1.5,
                fontFamily: line.match(/^\d+\./) ? "'DM Sans', sans-serif" : undefined,
              }}>
                {line}
              </div>
            ))}
          </div>

          {/* Recheck per step */}
          {current.key !== "connected" && (
            <button onClick={recheck} disabled={checking} style={{
              marginTop: 14,
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "5px 12px",
              fontSize: 11,
              color: "var(--muted)",
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {checking ? "Checking…" : "↺ Re-check this step"}
            </button>
          )}
        </div>

        {/* Navigation */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--border)",
        }}>
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            style={{
              background: "none", border: "1px solid var(--border)", borderRadius: 6,
              padding: "6px 16px", fontSize: 13, color: "var(--muted)",
              cursor: step === 0 ? "default" : "pointer",
              opacity: step === 0 ? 0.3 : 1,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            ← Back
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              style={{
                background: "var(--accent)", border: "none", borderRadius: 6,
                padding: "6px 20px", fontSize: 13, fontWeight: 600, color: "#fff",
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Next →
            </button>
          ) : (
            <button
              onClick={onClose}
              style={{
                background: "var(--success)", border: "none", borderRadius: 6,
                padding: "6px 20px", fontSize: 13, fontWeight: 600, color: "#fff",
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Done ✓
            </button>
          )}
        </div>

        {/* Skip */}
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 11, color: "var(--muted)", textDecoration: "underline",
          }}>
            Skip for now — remind me next time
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Setup trigger button (for nav bar) ───────────────────────────────────────
interface TriggerProps {
  onClick: () => void;
}

export function SetupButton({ onClick }: TriggerProps) {
  const [badge, setBadge] = useState(0);

  useEffect(() => {
    async function check() {
      const h = await checkHealth();
      const incomplete = [!h.electronOnline, !h.extensionOnline].filter(Boolean).length;
      setBadge(incomplete > 0 ? incomplete + 2 : 0); // +2 for cookies + connected steps
    }
    check();
  }, []);

  return (
    <button
      onClick={onClick}
      title="Setup guide"
      style={{
        position: "relative",
        background: "none",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "4px 10px",
        fontSize: 12,
        color: badge > 0 ? "var(--accent)" : "var(--muted)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 5,
        fontFamily: "'DM Sans', sans-serif",
        borderColor: badge > 0 ? "var(--accent)" : "var(--border)",
      }}
    >
      Setup
      {badge > 0 && (
        <span style={{
          background: "var(--accent)",
          color: "#fff",
          borderRadius: "50%",
          width: 16,
          height: 16,
          fontSize: 9,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}
