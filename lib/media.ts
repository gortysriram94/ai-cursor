// lib/media.ts
// All media processing runs client-side in the browser.
// No server uploads. No FFmpeg. Browser-native Canvas API and HTML5 elements only.

// ── EXIF stripping ────────────────────────────────────────────────────────────
// Redraws image through Canvas — strips all EXIF metadata including GPS coords.

export async function stripExif(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }

      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("Conversion failed")),
        file.type,
        0.95
      );
    };

    img.onerror = () => reject(new Error("Image load failed"));
    img.src = url;
  });
}

// ── PNG/JPG → WebP conversion ─────────────────────────────────────────────────

export async function convertToWebP(file: File, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }

      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("WebP conversion failed")),
        "image/webp",
        quality
      );
    };

    img.onerror = () => reject(new Error("Image load failed"));
    img.src = url;
  });
}

// ── Image metadata extraction ─────────────────────────────────────────────────

export async function getImageMetadata(file: File): Promise<{
  filename:  string;
  width:     number;
  height:    number;
  sizeKB:    number;
  format:    string;
  hasExif:   boolean;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        filename: file.name,
        width:    img.naturalWidth,
        height:   img.naturalHeight,
        sizeKB:   Math.round(file.size / 1024),
        format:   file.type.split("/")[1].toUpperCase(),
        hasExif:  file.type === "image/jpeg", // EXIF mainly in JPEG
      });
    };

    img.onerror = () => reject(new Error("Failed to read image"));
    img.src = url;
  });
}

// ── Video metadata extraction ─────────────────────────────────────────────────

export async function getVideoMetadata(file: File): Promise<{
  filename:          string;
  durationSeconds:   number;
  durationFormatted: string;
  width:             number;
  height:            number;
  sizeMB:            number;
  format:            string;
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url   = URL.createObjectURL(file);

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      const duration = Math.round(video.duration);
      const minutes  = Math.floor(duration / 60);
      const seconds  = duration % 60;

      resolve({
        filename:          file.name,
        durationSeconds:   duration,
        durationFormatted: `${minutes}:${seconds.toString().padStart(2, "0")}`,
        width:             video.videoWidth,
        height:            video.videoHeight,
        sizeMB:            Math.round((file.size / (1024 * 1024)) * 10) / 10,
        format:            file.type.split("/")[1].toUpperCase(),
      });
    };

    video.onerror = () => reject(new Error("Failed to read video"));
    video.src = url;
  });
}

// ── SRT parser ────────────────────────────────────────────────────────────────

export function parseSRT(content: string): Array<{
  index: number;
  start: string;
  end:   string;
  text:  string;
}> {
  const blocks = content.trim().split(/\n\n+/);

  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const index = parseInt(lines[0]);
      const times = lines[1]?.split(" --> ") ?? ["", ""];
      const text  = lines.slice(2).join(" ").trim();

      return {
        index,
        start: times[0]?.trim() ?? "",
        end:   times[1]?.trim() ?? "",
        text,
      };
    })
    .filter((b) => b.text && !isNaN(b.index));
}

// ── Transcript cleaner ────────────────────────────────────────────────────────

export function cleanTranscript(
  content: string,
  format: "srt" | "vtt"
): {
  cleanText:             string;
  fullTranscript:        string;
  wordCount:             number;
  durationMinutes:       number;
  duplicateLinesRemoved: number;
} {
  const subtitles = parseSRT(content);

  // Remove duplicate consecutive lines
  const seen = new Set<string>();
  const deduped = subtitles.filter((s) => {
    const normalized = s.text.toLowerCase().trim();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });

  const duplicateLinesRemoved = subtitles.length - deduped.length;
  const cleanText             = deduped.map((s) => s.text).join(" ");
  const fullTranscript        = deduped
    .map((s) => `${s.start} → ${s.end}\n${s.text}`)
    .join("\n\n");

  // Estimate duration from last timestamp
  const lastTime   = subtitles[subtitles.length - 1]?.end ?? "0:00:00";
  const timeParts  = lastTime.split(":").map(Number);
  const totalSeconds =
    timeParts.length === 3
      ? timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2]
      : timeParts[0] * 60 + (timeParts[1] ?? 0);

  return {
    cleanText,
    fullTranscript,
    wordCount:             cleanText.split(/\s+/).filter(Boolean).length,
    durationMinutes:       Math.round(totalSeconds / 60),
    duplicateLinesRemoved,
  };
}

// ── Metadata array → CSV ──────────────────────────────────────────────────────

export function metadataToCSV(
  items: Record<string, string | number | boolean>[]
): string {
  if (items.length === 0) return "";
  const headers = Object.keys(items[0]);
  const rows    = items.map((item) =>
    headers
      .map((h) => {
        const val = String(item[h]);
        return val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
      })
      .join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

// ── Download helper ───────────────────────────────────────────────────────────

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── AI cost estimation ────────────────────────────────────────────────────────

export interface MediaCostEstimate {
  model:         string;
  provider:      string;
  tokensPerUnit: number;
  costPerUnit:   number;
  totalTokens:   number;
  totalCost:     number;
  monthlyVolume: number;
  monthlyCost:   number;
}

export function estimateImageProcessingCost(
  imageCount:    number,
  callsPerMonth: number
): MediaCostEstimate[] {
  const IMAGE_MODELS = [
    { model: "claude-sonnet-4", provider: "Anthropic", tokensPerImage: 1568,  inputPer1k: 0.003     },
    { model: "gpt-4o",          provider: "OpenAI",    tokensPerImage: 1105,  inputPer1k: 0.005     },
    { model: "gemini-1.5-pro",  provider: "Google",    tokensPerImage: 258,   inputPer1k: 0.00125   },
    { model: "gemini-1.5-flash",provider: "Google",    tokensPerImage: 258,   inputPer1k: 0.000075  },
  ];

  return IMAGE_MODELS.map((m) => {
    const totalTokens = imageCount * m.tokensPerImage;
    const costPerRun  = (totalTokens / 1000) * m.inputPer1k;
    const monthlyCost = costPerRun * callsPerMonth;

    return {
      model:         m.model,
      provider:      m.provider,
      tokensPerUnit: m.tokensPerImage,
      costPerUnit:   (m.tokensPerImage / 1000) * m.inputPer1k,
      totalTokens,
      totalCost:     costPerRun,
      monthlyVolume: callsPerMonth,
      monthlyCost,
    };
  });
}

export function estimateVideoProcessingCost(
  totalMinutes:  number,
  callsPerMonth: number
): MediaCostEstimate[] {
  const VIDEO_MODELS = [
    { model: "gemini-1.5-pro",  provider: "Google", tokensPerSecond: 263, inputPer1k: 0.00125  },
    { model: "gemini-1.5-flash",provider: "Google", tokensPerSecond: 263, inputPer1k: 0.000075 },
  ];

  const totalSeconds = totalMinutes * 60;

  return VIDEO_MODELS.map((m) => {
    const totalTokens = totalSeconds * m.tokensPerSecond;
    const costPerRun  = (totalTokens / 1000) * m.inputPer1k;
    const monthlyCost = costPerRun * callsPerMonth;

    return {
      model:         m.model,
      provider:      m.provider,
      tokensPerUnit: m.tokensPerSecond,
      costPerUnit:   (m.tokensPerSecond / 1000) * m.inputPer1k,
      totalTokens,
      totalCost:     costPerRun,
      monthlyVolume: callsPerMonth,
      monthlyCost,
    };
  });
}
