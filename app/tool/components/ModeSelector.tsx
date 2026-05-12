"use client";

import { VERTICALS, VerticalId } from "@/lib/verticals";

interface Props {
  selected: VerticalId;
  userInputs: Record<string, string>;
  onChange: (id: VerticalId) => void;
  onInputChange: (key: string, value: string) => void;
}

// Per-vertical input field definitions
// Matches the spec exactly — specific fields per vertical
const VERTICAL_INPUTS: Record<VerticalId, Array<{
  key: string;
  label: string;
  placeholder: string;
  type?: "text" | "select";
  options?: string[];
  note?: string;
}>> = {
  general: [
    {
      key: "task",
      label: "What do you want AI to do with this data?",
      type: "select",
      placeholder: "Select a task",
      options: [
        "Find patterns / themes",
        "Summarize findings",
        "Identify problems",
        "Generate recommendations",
        "Compare segments",
        "Other — I'll describe in my prompt",
      ],
    },
  ],
  ux_research: [
    { key: "product",     label: "Product / feature tested",  placeholder: "e.g. mobile checkout flow" },
    { key: "question",    label: "Primary research question",  placeholder: "e.g. Why do users abandon at payment?" },
    { key: "participant", label: "Participant type",           placeholder: "e.g. existing customers, ages 25–45" },
  ],
  trader: [
    { key: "dateRange",  label: "Date range",   placeholder: "e.g. Jan 2025 – Dec 2025" },
    { key: "assetClass", label: "Asset class",  placeholder: "e.g. US equities, crypto, options" },
  ],
  aws: [
    { key: "period",      label: "Billing period", placeholder: "e.g. March 2026" },
    { key: "accountType", label: "Account type",   placeholder: "e.g. Production, Staging, All accounts" },
  ],
  bigquery: [
    { key: "period",  label: "Billing period", placeholder: "e.g. Last 30 days" },
    { key: "project", label: "GCP project",    placeholder: "e.g. my-project-id" },
  ],
  content_creator: [
    { key: "platform",  label: "Platform",    placeholder: "e.g. YouTube, TikTok, Instagram" },
    { key: "dateRange", label: "Date range",  placeholder: "e.g. Jan–Dec 2025" },
  ],
  hr_people: [
    { key: "focus", label: "Analysis focus", placeholder: "e.g. attrition risk, engagement, performance" },
    {
      key: "_reminder",
      label: "Anonymization reminder",
      type: "select",
      placeholder: "",
      options: ["PII masking is ON — names and emails will be redacted", "I will enable PII masking before uploading"],
      note: "Enable PII masking in the options panel before uploading HR data to protect employee privacy.",
    },
  ],
};

export default function ModeSelector({ selected, userInputs, onChange, onInputChange }: Props) {
  const fields = VERTICAL_INPUTS[selected] || [];

  return (
    <div style={{ marginBottom: 24 }}>
      {/* ── Vertical grid ─────────────────────────────────────────────────── */}
      <div className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12 }}>
        What kind of data is this?
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 2, background: "var(--border)", marginBottom: fields.length > 0 ? 20 : 0 }}>
        {Object.values(VERTICALS).map((v) => {
          const isSelected = selected === v.id;
          return (
            <button
              key={v.id}
              onClick={() => onChange(v.id as VerticalId)}
              style={{
                background: isSelected
                  ? "color-mix(in srgb, var(--accent) 10%, var(--panel))"
                  : "var(--panel)",
                border: "none",
                borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
                padding: "12px 14px",
                textAlign: "left",
                cursor: "pointer",
                transition: "background 0.15s, border-color 0.15s",
                display: "flex",
                flexDirection: "column",
                gap: 5,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize: 15,
                  color: isSelected ? "var(--accent)" : "var(--muted)",
                  transition: "color 0.15s",
                }}>
                  {v.icon}
                </span>
                <span className="mono" style={{
                  fontSize: 10,
                  fontWeight: isSelected ? 600 : 400,
                  color: isSelected ? "var(--accent)" : "var(--text)",
                  letterSpacing: "0.06em",
                  transition: "color 0.15s",
                }}>
                  {v.label.toUpperCase()}
                </span>
              </div>
              <span style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}>
                {v.description}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Per-vertical input fields ──────────────────────────────────────── */}
      {fields.length > 0 && (
        <div style={{ border: "1px solid var(--border)", background: "var(--panel)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {VERTICALS[selected]?.icon} Tell us about your {VERTICALS[selected]?.label.toLowerCase()} data
          </div>

          {fields.map((field) => {
            // Skip internal reminder fields from key output
            const isReadonly = field.key.startsWith("_");

            return (
              <div key={field.key}>
                <label className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>
                  {field.label}
                </label>

                {field.type === "select" ? (
                  <select
                    value={userInputs[field.key] || ""}
                    onChange={(e) => !isReadonly && onInputChange(field.key, e.target.value)}
                    disabled={isReadonly}
                    style={{
                      width: "100%",
                      background: "var(--panel-2, var(--panel))",
                      border: "1px solid var(--border)",
                      color: userInputs[field.key] ? "var(--text)" : "var(--muted)",
                      padding: "8px 10px",
                      fontSize: 13,
                      fontFamily: "DM Sans, sans-serif",
                      outline: "none",
                      cursor: isReadonly ? "default" : "pointer",
                    }}
                  >
                    <option value="" disabled>{field.placeholder || "Select…"}</option>
                    {(field.options || []).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={userInputs[field.key] || ""}
                    onChange={(e) => onInputChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    style={{
                      width: "100%",
                      background: "var(--panel-2, var(--panel))",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                      padding: "8px 10px",
                      fontSize: 13,
                      fontFamily: "DM Sans, sans-serif",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                )}

                {/* Note (e.g. anonymization reminder for HR) */}
                {field.note && (
                  <div className="mono" style={{ fontSize: 10, color: "var(--warn)", marginTop: 5, lineHeight: 1.5 }}>
                    ⚠ {field.note}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
