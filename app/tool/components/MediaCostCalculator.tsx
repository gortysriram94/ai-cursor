"use client";

import { useState } from "react";
import {
  estimateImageProcessingCost,
  estimateVideoProcessingCost,
  type MediaCostEstimate,
} from "@/lib/media";

type Tab = "images" | "video";

function fmt(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.001) return `$${n.toFixed(6)}`;
  if (n < 0.01)  return `$${n.toFixed(5)}`;
  if (n < 1)     return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function CostTable({ estimates, cheapestIdx }: {
  estimates: MediaCostEstimate[];
  cheapestIdx: number;
}) {
  return (
    <div style={{ border: "1px solid var(--border)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 100px 100px 110px",
        gap: 0, borderBottom: "1px solid var(--border)",
        background: "var(--panel-2, var(--surface))",
        padding: "8px 14px",
      }}>
        {["Model", "Tokens/unit", "Cost/unit", "Monthly"].map((h) => (
          <span key={h} className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em" }}>
            {h}
          </span>
        ))}
      </div>

      {estimates.map((e, i) => {
        const isCheapest = i === cheapestIdx;
        return (
          <div
            key={e.model}
            style={{
              display: "grid", gridTemplateColumns: "1fr 100px 100px 110px",
              gap: 0, padding: "10px 14px",
              borderBottom: i < estimates.length - 1 ? "1px solid var(--border)" : "none",
              background: isCheapest
                ? "color-mix(in srgb, var(--success) 6%, transparent)"
                : "transparent",
            }}
          >
            <div>
              <div className="mono" style={{ fontSize: 11, color: isCheapest ? "var(--success)" : "var(--text)" }}>
                {e.model}
                {isCheapest && (
                  <span style={{ marginLeft: 6, fontSize: 9, color: "var(--success)" }}>← cheapest</span>
                )}
              </div>
              <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{e.provider}</div>
            </div>
            <span className="mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
              {e.tokensPerUnit.toLocaleString()}
            </span>
            <span className="mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
              {fmt(e.costPerUnit)}
            </span>
            <span className="mono" style={{ fontSize: 11, color: isCheapest ? "var(--success)" : "var(--text-dim)" }}>
              {fmt(e.monthlyCost)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function MediaCostCalculator() {
  const [tab, setTab]               = useState<Tab>("images");
  const [imageCount, setImageCount] = useState(500);
  const [callsPerMonth, setCallsPerMonth] = useState(100);
  const [videoMins, setVideoMins]   = useState(60);
  const [videoRuns, setVideoRuns]   = useState(50);
  const [imageEst, setImageEst]     = useState<MediaCostEstimate[] | null>(null);
  const [videoEst, setVideoEst]     = useState<MediaCostEstimate[] | null>(null);

  const handleCalculate = () => {
    if (tab === "images") {
      setImageEst(estimateImageProcessingCost(imageCount, callsPerMonth));
    } else {
      setVideoEst(estimateVideoProcessingCost(videoMins, videoRuns));
    }
  };

  const cheapestImageIdx = imageEst
    ? imageEst.reduce((minI, e, i, arr) => e.monthlyCost < arr[minI].monthlyCost ? i : minI, 0)
    : 0;
  const cheapestVideoIdx = videoEst
    ? videoEst.reduce((minI, e, i, arr) => e.monthlyCost < arr[minI].monthlyCost ? i : minI, 0)
    : 0;

  const savingsVsGPT4o = imageEst
    ? imageEst.find((e) => e.model === "gpt-4o")?.monthlyCost ?? 0
    : 0;
  const cheapestImageCost = imageEst?.[cheapestImageIdx]?.monthlyCost ?? 0;
  const imageSavings = savingsVsGPT4o - cheapestImageCost;

  return (
    <div style={{ border: "1px solid var(--border)", background: "var(--panel)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <span className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em" }}>
          MEDIA AI COST CALCULATOR
        </span>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
        {(["images", "video"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? "var(--panel-2, var(--surface))" : "none",
              borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
              border: "none", padding: "10px 20px",
              fontFamily: "JetBrains Mono, monospace", fontSize: 10,
              color: tab === t ? "var(--accent)" : "var(--muted)",
              letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ padding: "16px" }}>
        {tab === "images" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", display: "block", marginBottom: 5 }}>
                  NUMBER OF IMAGES
                </label>
                <input
                  type="number" min={1} value={imageCount}
                  onChange={(e) => setImageCount(parseInt(e.target.value) || 0)}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", display: "block", marginBottom: 5 }}>
                  RUNS PER MONTH
                </label>
                <input
                  type="number" min={1} value={callsPerMonth}
                  onChange={(e) => setCallsPerMonth(parseInt(e.target.value) || 0)}
                  style={inputStyle}
                />
              </div>
            </div>
            <button onClick={handleCalculate} style={calcBtnStyle}>CALCULATE →</button>

            {imageEst && (
              <>
                <CostTable estimates={imageEst} cheapestIdx={cheapestImageIdx} />
                <div style={{ padding: "10px 14px", border: "1px solid var(--success)", background: "color-mix(in srgb, var(--success) 6%, transparent)" }}>
                  <div className="mono" style={{ fontSize: 10, color: "var(--success)", letterSpacing: "0.08em", marginBottom: 4 }}>
                    RECOMMENDATION
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
                    <strong style={{ color: "var(--text)" }}>Gemini 1.5 Flash</strong> for batch image processing.
                    {imageSavings > 0.01 && (
                      <> Saves <strong style={{ color: "var(--success)" }}>{fmt(imageSavings)}/month</strong> vs GPT-4o.</>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "video" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", display: "block", marginBottom: 5 }}>
                  TOTAL VIDEO MINUTES
                </label>
                <input
                  type="number" min={1} value={videoMins}
                  onChange={(e) => setVideoMins(parseInt(e.target.value) || 0)}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", display: "block", marginBottom: 5 }}>
                  PROCESSING RUNS/MONTH
                </label>
                <input
                  type="number" min={1} value={videoRuns}
                  onChange={(e) => setVideoRuns(parseInt(e.target.value) || 0)}
                  style={inputStyle}
                />
              </div>
            </div>
            <button onClick={handleCalculate} style={calcBtnStyle}>CALCULATE →</button>

            {videoEst && (
              <>
                <CostTable estimates={videoEst} cheapestIdx={cheapestVideoIdx} />

                {/* Frame sampling tip — always shown */}
                <div style={{ padding: "10px 14px", border: "1px solid var(--warn)", background: "color-mix(in srgb, var(--warn) 6%, transparent)" }}>
                  <div className="mono" style={{ fontSize: 10, color: "var(--warn)", letterSpacing: "0.08em", marginBottom: 4 }}>
                    TIP: FRAME SAMPLING
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
                    Sample <strong style={{ color: "var(--text)" }}>1 frame per 30 seconds</strong> instead of full video.
                    Reduces cost by <strong style={{ color: "var(--success)" }}>97%</strong> with minimal quality loss for most use cases.
                    {videoEst[cheapestVideoIdx] && (
                      <> Estimated frame-sampled cost:{" "}
                        <strong style={{ color: "var(--success)" }}>
                          {fmt(videoEst[cheapestVideoIdx].monthlyCost * 0.03)}/month
                        </strong>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", background: "var(--panel-2, var(--surface))",
  border: "1px solid var(--border)", color: "var(--text)",
  padding: "7px 10px", fontSize: 13,
  fontFamily: "DM Sans, sans-serif", outline: "none",
  boxSizing: "border-box",
};

const calcBtnStyle: React.CSSProperties = {
  background: "var(--accent)", color: "var(--surface)",
  border: "none", padding: "8px 18px", alignSelf: "flex-start",
  fontFamily: "JetBrains Mono, monospace",
  fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer",
};
