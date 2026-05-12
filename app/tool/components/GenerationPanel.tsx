"use client";

import { useState } from "react";
import { hasKey } from "@/lib/byok";
import { buildImagePrompt, buildVideoPrompt, estimateGenerationCost, type CleanResult } from "@/lib/prompt-builder";
import GenerationOutput from "./GenerationOutput";

interface Props {
  stats:      CleanResult;
  vertical:   string;
  insights:   string; // AI analysis output from StreamingOutput
  fileName:   string;
}

type GenType = "image" | "video";

const IMAGE_STYLES  = ["Infographic", "UI Mockup", "Chart", "Thumbnail"];
const IMAGE_FORMATS = ["Square", "Landscape", "Portrait"];
const VIDEO_STYLES  = ["Motion graphic", "Data visualization", "Explainer"];
const VIDEO_DURATIONS: (5 | 10)[] = [5, 10];

// ── Provider availability ─────────────────────────────────────────────────────

function getImageProvider(): "dalle" | "flux" | null {
  if (hasKey("openai")) return "dalle";
  if (hasKey("fal"))    return "flux";
  return null;
}

function getVideoProvider(): "luma" | null {
  return hasKey("luma") ? "luma" : null;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function GenerationPanel({ stats, vertical, insights, fileName }: Props) {
  const [genType, setGenType]         = useState<GenType>("image");
  const [imageStyle, setImageStyle]   = useState("Infographic");
  const [imageFormat, setImageFormat] = useState("Square");
  const [videoStyle, setVideoStyle]   = useState("Motion graphic");
  const [videoDuration, setVideoDuration] = useState<5 | 10>(5);
  const [brandColors, setBrandColors] = useState("");
  const [showPrompt, setShowPrompt]   = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [result, setResult]           = useState<{ blob: Blob; cost: number; model: string; type: GenType; prompt: string } | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [pollStatus, setPollStatus]   = useState<string | null>(null);

  const imgProvider = getImageProvider();
  const vidProvider = getVideoProvider();

  const sizeMap: Record<string, "1024x1024" | "1792x1024" | "1024x1792"> = {
    Square:    "1024x1024",
    Landscape: "1792x1024",
    Portrait:  "1024x1792",
  };

  const fluxSizeMap: Record<string, "square" | "landscape" | "portrait"> = {
    Square:    "square",
    Landscape: "landscape",
    Portrait:  "portrait",
  };

  // ── Build prompt ────────────────────────────────────────────────────────────

  const currentPrompt = genType === "image"
    ? buildImagePrompt(stats, vertical, insights, {
        style:       imageStyle.toLowerCase(),
        format:      imageFormat,
        brandColors: brandColors || undefined,
      })
    : buildVideoPrompt(stats, vertical, insights, {
        style:       videoStyle.toLowerCase(),
        duration:    videoDuration,
        brandColors: brandColors || undefined,
      }).visualPrompt;

  const costEst = genType === "image"
    ? estimateGenerationCost("image", imgProvider || "dalle", { size: sizeMap[imageFormat] })
    : estimateGenerationCost("video", "luma", { duration: videoDuration });

  // ── Generate ────────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setResult(null);
    setPollStatus(null);

    try {
      const { getKey } = await import("@/lib/byok");

      if (genType === "image") {
        if (!imgProvider) throw new Error("No image generation API key connected");
        const { generateImageDallE, generateImageFlux } = await import("@/lib/generation");

        let res: { blob: Blob; cost: number; model: string };
        if (imgProvider === "dalle") {
          res = await generateImageDallE(getKey("openai")!, currentPrompt, sizeMap[imageFormat]);
        } else {
          res = await generateImageFlux(getKey("fal")!, currentPrompt, fluxSizeMap[imageFormat]);
        }
        setResult({ ...res, type: "image", prompt: currentPrompt });

      } else {
        if (!vidProvider) throw new Error("No Luma AI key connected");
        const { generateVideoLuma } = await import("@/lib/generation");
        const res = await generateVideoLuma(
          getKey("luma")!,
          currentPrompt,
          videoDuration,
          (attempt, max) => setPollStatus(`Rendering… ${attempt * 5}s elapsed (${Math.round((attempt / max) * 100)}%)`)
        );
        setResult({ ...res, type: "video", prompt: currentPrompt });
      }
    } catch (e) {
      setError(String(e).replace("Error: ", ""));
    } finally {
      setGenerating(false);
      setPollStatus(null);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ border: "1px solid var(--border)", background: "var(--panel)", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <span className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em" }}>
            GENERATE VISUAL FROM INSIGHTS
          </span>
        </div>

        <div style={{ padding: "16px" }}>

          {/* Type toggle */}
          <div style={{ display: "flex", gap: 0, border: "1px solid var(--border)", alignSelf: "flex-start", width: "fit-content", marginBottom: 16 }}>
            {(["image", "video"] as GenType[]).map((t) => (
              <button
                key={t}
                onClick={() => setGenType(t)}
                style={{
                  background: genType === t ? "var(--accent)" : "none",
                  color: genType === t ? "var(--surface)" : "var(--muted)",
                  border: "none", padding: "6px 16px",
                  fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                  letterSpacing: "0.08em", cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* ── IMAGE options ─────────────────────────────────────────────── */}
          {genType === "image" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Provider badge */}
              {imgProvider ? (
                <div className="mono" style={{ fontSize: 10, color: "var(--success)" }}>
                  ✓ Using: {imgProvider === "dalle" ? "DALL-E 3 (OpenAI)" : "FLUX.1 Dev (fal.ai)"}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--muted)" }}>
                  Connect an OpenAI or fal.ai key to generate images.
                  <a href="#api-keys" className="mono" style={{ color: "var(--accent)", marginLeft: 8, fontSize: 10 }}>
                    CONNECT KEY →
                  </a>
                </div>
              )}

              {imgProvider && (
                <>
                  {/* Style */}
                  <div>
                    <div className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", marginBottom: 6 }}>STYLE</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {IMAGE_STYLES.map((s) => (
                        <button key={s} onClick={() => setImageStyle(s)}
                          style={{
                            background: imageStyle === s ? "var(--accent)" : "none",
                            color: imageStyle === s ? "var(--surface)" : "var(--muted)",
                            border: `1px solid ${imageStyle === s ? "var(--accent)" : "var(--border)"}`,
                            padding: "4px 12px", fontFamily: "JetBrains Mono, monospace",
                            fontSize: 10, cursor: "pointer",
                          }}
                        >{s}</button>
                      ))}
                    </div>
                  </div>

                  {/* Format */}
                  <div>
                    <div className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", marginBottom: 6 }}>FORMAT</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {IMAGE_FORMATS.map((f) => (
                        <button key={f} onClick={() => setImageFormat(f)}
                          style={{
                            background: imageFormat === f ? "var(--accent)" : "none",
                            color: imageFormat === f ? "var(--surface)" : "var(--muted)",
                            border: `1px solid ${imageFormat === f ? "var(--accent)" : "var(--border)"}`,
                            padding: "4px 12px", fontFamily: "JetBrains Mono, monospace",
                            fontSize: 10, cursor: "pointer",
                          }}
                        >{f}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── VIDEO options ─────────────────────────────────────────────── */}
          {genType === "video" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {vidProvider ? (
                <div className="mono" style={{ fontSize: 10, color: "var(--success)" }}>
                  ✓ Using: Luma Dream Machine
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--muted)" }}>
                  Connect a Luma AI key to generate videos.
                  <a href="#api-keys" className="mono" style={{ color: "var(--accent)", marginLeft: 8, fontSize: 10 }}>
                    CONNECT KEY →
                  </a>
                </div>
              )}

              {vidProvider && (
                <>
                  {/* Style */}
                  <div>
                    <div className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", marginBottom: 6 }}>STYLE</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {VIDEO_STYLES.map((s) => (
                        <button key={s} onClick={() => setVideoStyle(s)}
                          style={{
                            background: videoStyle === s ? "var(--accent)" : "none",
                            color: videoStyle === s ? "var(--surface)" : "var(--muted)",
                            border: `1px solid ${videoStyle === s ? "var(--accent)" : "var(--border)"}`,
                            padding: "4px 12px", fontFamily: "JetBrains Mono, monospace",
                            fontSize: 10, cursor: "pointer",
                          }}
                        >{s}</button>
                      ))}
                    </div>
                  </div>

                  {/* Duration */}
                  <div>
                    <div className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", marginBottom: 6 }}>DURATION</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {VIDEO_DURATIONS.map((d) => (
                        <button key={d} onClick={() => setVideoDuration(d)}
                          style={{
                            background: videoDuration === d ? "var(--accent)" : "none",
                            color: videoDuration === d ? "var(--surface)" : "var(--muted)",
                            border: `1px solid ${videoDuration === d ? "var(--accent)" : "var(--border)"}`,
                            padding: "4px 12px", fontFamily: "JetBrains Mono, monospace",
                            fontSize: 10, cursor: "pointer",
                          }}
                        >{d}s</button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Brand colors (shared) */}
          {((genType === "image" && imgProvider) || (genType === "video" && vidProvider)) && (
            <div style={{ marginTop: 14 }}>
              <div className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", marginBottom: 6 }}>
                BRAND COLORS (optional)
              </div>
              <input
                type="text"
                value={brandColors}
                onChange={(e) => setBrandColors(e.target.value)}
                placeholder="e.g. #DA7756 orange, #1A1611 dark"
                style={{
                  width: "100%", background: "var(--panel-2, var(--surface))",
                  border: "1px solid var(--border)", color: "var(--text)",
                  padding: "7px 10px", fontSize: 12,
                  fontFamily: "DM Sans, sans-serif", outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}

          {/* Prompt preview */}
          {((genType === "image" && imgProvider) || (genType === "video" && vidProvider)) && (
            <div style={{ marginTop: 14 }}>
              <button
                onClick={() => setShowPrompt((p) => !p)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <span className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.08em" }}>
                  {showPrompt ? "▲ HIDE PROMPT" : "▼ PREVIEW GENERATED PROMPT"}
                </span>
              </button>
              {showPrompt && (
                <div style={{
                  marginTop: 8, padding: "10px 12px",
                  background: "var(--panel-2, var(--surface))",
                  border: "1px solid var(--border)",
                  fontSize: 11, color: "var(--text-dim)",
                  fontFamily: "JetBrains Mono, monospace",
                  lineHeight: 1.6,
                }}>
                  {currentPrompt}
                </div>
              )}
            </div>
          )}

          {/* Cost estimate + Generate button */}
          {((genType === "image" && imgProvider) || (genType === "video" && vidProvider)) && (
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{
                  background: generating ? "var(--border)" : "var(--accent)",
                  color: "var(--surface)", border: "none",
                  padding: "9px 20px",
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                  cursor: generating ? "not-allowed" : "pointer",
                }}
              >
                {generating
                  ? genType === "video" ? "RENDERING…" : "GENERATING…"
                  : `GENERATE ${genType.toUpperCase()} →`}
              </button>
              <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                {costEst.estimate} {costEst.detail}
              </span>
            </div>
          )}

          {/* Poll status for video */}
          {pollStatus && (
            <div className="mono" style={{ marginTop: 8, fontSize: 10, color: "var(--muted)" }}>
              {pollStatus}
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ marginTop: 12, padding: "10px 12px", border: "1px solid var(--danger)", fontSize: 12, color: "var(--danger)" }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Output */}
      {result && (
        <GenerationOutput
          blob={result.blob}
          type={result.type}
          cost={result.cost}
          model={result.model}
          prompt={result.prompt}
          vertical={vertical}
          onRegenerate={handleGenerate}
        />
      )}
    </div>
  );
}
