"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type Status = "connected" | "reconnecting" | "disconnected";

const CONFIG: Record<Status, { color: string; label: string }> = {
  connected:     { color: "#22c55e", label: "Agent connected"     },
  reconnecting:  { color: "#f59e0b", label: "Agent reconnecting…" },
  disconnected:  { color: "#6b7280", label: "Agent disconnected"  },
};

// Pages where the agent status widget should NOT appear
const HIDDEN_ON = new Set(["/", "/pricing", "/privacy", "/terms", "/disclaimer", "/refund"]);

export default function AgentStatus() {
  const pathname = usePathname();
  const [status, setStatus] = useState<Status>("disconnected");

  useEffect(() => {
    // Skip polling on pages where the widget is hidden
    if (HIDDEN_ON.has(pathname)) return;

    const check = () => {
      fetch("/api/agent/health")
        .then(r => r.ok ? r.json() : null)
        .then(d => setStatus((d?.status as Status) ?? "disconnected"))
        .catch(() => setStatus("disconnected"));
    };

    check();
    const t = setInterval(check, 5_000);
    return () => clearInterval(t);
  }, [pathname]);

  // Don't render on marketing / legal pages
  if (HIDDEN_ON.has(pathname)) return null;

  const { color, label } = CONFIG[status];

  return (
    <div
      title={label}
      style={{
        position:     "fixed",
        bottom:       14,
        right:        14,
        display:      "flex",
        alignItems:   "center",
        gap:          6,
        padding:      "4px 10px",
        borderRadius: 20,
        background:   "rgba(0,0,0,0.45)",
        backdropFilter: "blur(8px)",
        fontSize:     11,
        color:        "#ccc",
        zIndex:       9999,
        userSelect:   "none",
        pointerEvents: "none",
      }}
    >
      <span style={{
        width:        7,
        height:       7,
        borderRadius: "50%",
        background:   color,
        flexShrink:   0,
        boxShadow:    status === "connected" ? `0 0 6px ${color}` : "none",
      }} />
      {label}
    </div>
  );
}
