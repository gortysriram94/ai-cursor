// lib/generation.ts
// Image and video generation via provider APIs.
// All API calls happen in the browser using the user's own key.
// Outputs are fetched as Blobs and downloaded through the browser — 
// never stored on TokenLift servers.

// ── DALL-E 3 image generation ─────────────────────────────────────────────────

export async function generateImageDallE(
  apiKey: string,
  prompt: string,
  size: "1024x1024" | "1792x1024" | "1024x1792" = "1024x1024"
): Promise<{ blob: Blob; cost: number; model: string }> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:           "dall-e-3",
      prompt,
      n:               1,
      size,
      response_format: "url",
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `DALL-E error: ${response.status}`);
  }

  const data     = await response.json();
  const imageUrl = data.data[0].url as string;

  // Fetch image into browser — downloads through this site, not OpenAI's CDN
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) throw new Error("Failed to fetch generated image");
  const blob = await imageResponse.blob();

  const costs: Record<string, number> = {
    "1024x1024": 0.04,
    "1792x1024": 0.08,
    "1024x1792": 0.08,
  };

  return { blob, cost: costs[size] ?? 0.04, model: "DALL-E 3" };
}

// ── FLUX.1 image generation via fal.ai ───────────────────────────────────────

export async function generateImageFlux(
  apiKey: string,
  prompt: string,
  imageSize: "square" | "landscape" | "portrait" = "square"
): Promise<{ blob: Blob; cost: number; model: string }> {
  const sizes = {
    square:    { width: 1024, height: 1024 },
    landscape: { width: 1536, height: 1024 },
    portrait:  { width: 1024, height: 1536 },
  };

  const response = await fetch("https://fal.run/fal-ai/flux/dev", {
    method: "POST",
    headers: {
      Authorization:  `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      ...sizes[imageSize],
      num_images:    1,
      output_format: "png",
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `FLUX error: ${response.status}`);
  }

  const data     = await response.json();
  const imageUrl = data.images[0].url as string;

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) throw new Error("Failed to fetch generated image");
  const blob = await imageResponse.blob();

  return { blob, cost: 0.025, model: "FLUX.1 Dev" };
}

// ── Luma AI video generation ──────────────────────────────────────────────────

export async function generateVideoLuma(
  apiKey: string,
  prompt: string,
  duration: 5 | 10 = 5,
  onPoll?: (attempt: number, maxAttempts: number) => void
): Promise<{ blob: Blob; cost: number; model: string }> {
  // 1. Start generation job
  const startResponse = await fetch(
    "https://api.lumalabs.ai/dream-machine/v1/generations",
    {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        aspect_ratio: "16:9",
        loop: false,
      }),
    }
  );

  if (!startResponse.ok) {
    const err = await startResponse.json().catch(() => ({}));
    throw new Error(err.detail || "Luma generation failed to start");
  }

  const { id } = await startResponse.json();

  // 2. Poll for completion (max 5 minutes / 60 attempts × 5s)
  const MAX_ATTEMPTS = 60;
  let videoUrl: string | null = null;
  let attempts = 0;

  while (!videoUrl && attempts < MAX_ATTEMPTS) {
    await new Promise((r) => setTimeout(r, 5000));
    attempts++;
    onPoll?.(attempts, MAX_ATTEMPTS);

    const statusResponse = await fetch(
      `https://api.lumalabs.ai/dream-machine/v1/generations/${id}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    if (!statusResponse.ok) continue;

    const status = await statusResponse.json();

    if (status.state === "completed") {
      videoUrl = status.assets?.video ?? null;
    } else if (status.state === "failed") {
      throw new Error(status.failure_reason || "Video generation failed");
    }
  }

  if (!videoUrl) throw new Error("Video generation timed out after 5 minutes");

  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) throw new Error("Failed to fetch generated video");
  const blob = await videoResponse.blob();

  return {
    blob,
    cost:  duration * 0.0019 * 30, // approximate per Luma pricing
    model: "Luma Dream Machine",
  };
}

// ── Download output through browser ──────────────────────────────────────────
// Creates a Blob URL, triggers download, then revokes the URL.
// File downloads with TokenLift branding in the filename.

export function downloadOutput(
  blob: Blob,
  fileType: "image" | "video",
  metadata: {
    prompt:      string;
    model:       string;
    vertical:    string;
    sourceFile?: string;
  }
): void {
  const timestamp = Date.now();
  const extension = fileType === "image"
    ? (blob.type.includes("png") ? "png" : "jpg")
    : "mp4";

  const fileName = `tokenlift_${metadata.vertical}_${timestamp}.${extension}`;

  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Revoke after download starts
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Convert Blob to WebP via Canvas ──────────────────────────────────────────
// Used for the "Download WebP" option — converts PNG/JPG to WebP client-side.

export async function convertToWebP(
  blob: Blob,
  quality = 0.92
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (webpBlob) => webpBlob ? resolve(webpBlob) : reject(new Error("WebP conversion failed")),
        "image/webp",
        quality
      );
    };

    img.onerror = () => reject(new Error("Image load failed"));
    img.src = url;
  });
}
