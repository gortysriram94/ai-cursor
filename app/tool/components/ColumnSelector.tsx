"use client";

import { useState } from "react";

interface Props {
  headers: string[];
  onConfirm: (selected: string[], renames: Record<string, string>) => void;
  onSkip: () => void;
}

export default function ColumnSelector({ headers, onConfirm, onSkip }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(headers));
  const [renames, setRenames] = useState<Record<string, string>>({});

  const toggle = (h: string) => {
    const next = new Set(selected);
    next.has(h) ? next.delete(h) : next.add(h);
    setSelected(next);
  };

  const handleConfirm = () => {
    onConfirm([...selected], renames);
  };

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--border)", padding: 24, marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div className="mono" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.12em", marginBottom: 2 }}>
            COLUMN SELECTOR
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {selected.size} of {headers.length} columns selected
          </div>
        </div>
        <button onClick={onSkip}
          style={{ background: "none", border: "none", color: "var(--muted)", fontFamily: "monospace", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
          skip →
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
        {headers.map(h => (
          <div key={h} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => toggle(h)}
              style={{
                width: 18, height: 18, flexShrink: 0, border: `1px solid ${selected.has(h) ? "var(--accent)" : "var(--border)"}`,
                background: selected.has(h) ? "var(--accent)" : "transparent",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {selected.has(h) && <span style={{ color: "var(--surface)", fontSize: 10, fontWeight: 700 }}>✓</span>}
            </button>
            <span className="mono" style={{ fontSize: 12, color: selected.has(h) ? "var(--text)" : "var(--muted)", width: 160, flexShrink: 0 }}>
              {h}
            </span>
            {selected.has(h) && (
              <input
                value={renames[h] ?? ""}
                onChange={e => setRenames(r => ({ ...r, [h]: e.target.value }))}
                placeholder={`rename "${h}"…`}
                style={{
                  background: "var(--panel-2, var(--surface))", border: "1px solid var(--border)",
                  color: "var(--text)", padding: "3px 8px", fontSize: 11, fontFamily: "monospace",
                  outline: "none", flex: 1,
                }}
              />
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => setSelected(new Set(headers))}
          style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", fontFamily: "monospace", fontSize: 11, padding: "6px 12px", cursor: "pointer" }}>
          select all
        </button>
        <button
          onClick={() => setSelected(new Set())}
          style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", fontFamily: "monospace", fontSize: 11, padding: "6px 12px", cursor: "pointer" }}>
          clear all
        </button>
        <button
          onClick={handleConfirm}
          disabled={selected.size === 0}
          style={{
            marginLeft: "auto", background: "var(--accent)", color: "var(--surface)", border: "none",
            fontFamily: "monospace", fontSize: 12, fontWeight: 700, padding: "8px 20px",
            cursor: selected.size === 0 ? "not-allowed" : "pointer", opacity: selected.size === 0 ? 0.5 : 1,
            letterSpacing: "0.05em",
          }}>
          PROCESS {selected.size} COLUMNS →
        </button>
      </div>
    </div>
  );
}
