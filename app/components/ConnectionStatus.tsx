"use client";
import { useState, useEffect } from "react";

interface HealthData {
  electronOnline:  boolean;
  extensionOnline: boolean;
}

type DotColor = "green" | "amber" | "red";

function dotColor(h: HealthData): DotColor {
  if (h.electronOnline && h.extensionOnline) return "green";
  if (h.electronOnline || h.extensionOnline) return "amber";
  return "red";
}

function label(h: HealthData): string {
  if (h.electronOnline && h.extensionOnline) return "Electron + Extension connected";
  if (h.electronOnline)  return "Electron connected — Extension offline";
  if (h.extensionOnline) return "Extension connected — Electron offline";
  return "Electron + Extension offline";
}

const DOT_STYLE: Record<DotColor, string> = {
  green: "#4caf7a",
  amber: "#D4924A",
  red:   "#E05C5C",
};

export default function ConnectionStatus() {
  const [health, setHealth] = useState<HealthData>({ electronOnline: false, extensionOnline: false });

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch("/api/agent/health");
        if (res.ok && active) {
          const data = await res.json();
          setHealth({ electronOnline: !!data.electronOnline, extensionOnline: !!data.extensionOnline });
        }
      } catch {}
      if (active) setTimeout(poll, 8_000);
    }
    poll();
    return () => { active = false; };
  }, []);

  const color = dotColor(health);

  return (
    <div
      title={label(health)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        cursor: "default",
      }}
    >
      <span style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: DOT_STYLE[color],
        display: "inline-block",
        boxShadow: color === "green"
          ? `0 0 5px ${DOT_STYLE.green}66`
          : color === "amber"
          ? `0 0 5px ${DOT_STYLE.amber}66`
          : "none",
        transition: "background 0.3s, box-shadow 0.3s",
      }} />
      <span style={{ fontSize: 11, color: "var(--muted)" }}>
        {color === "green" ? "Connected" : color === "amber" ? "Partial" : "Offline"}
      </span>
    </div>
  );
}
