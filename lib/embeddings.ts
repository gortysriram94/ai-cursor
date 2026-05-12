// lib/embeddings.ts
// Local embedding generation via Transformers.js (Xenova).
// The all-MiniLM-L6-v2 model is ~22MB, downloads once, cached by browser.
// Runs entirely client-side — no API key, no server, no cost.

// Module-level singletons — one embedder instance shared across the app
let embedder: any = null;
let modelLoading = false;
let modelLoadPromise: Promise<void> | null = null;

// ── Load the embedding model ──────────────────────────────────────────────────
// Safe to call multiple times — deduplicates concurrent calls via promise.

export async function loadEmbeddingModel(
  onProgress?: (pct: number) => void
): Promise<void> {
  if (embedder) return;           // already loaded
  if (modelLoadPromise) return modelLoadPromise; // load in progress

  modelLoading = true;

  modelLoadPromise = (async () => {
    const { pipeline, env } = await import("@xenova/transformers");

    // Use browser cache — model downloads once then lives in Cache API
    env.allowLocalModels = false;
    env.useBrowserCache  = true;

    embedder = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
      {
        progress_callback: (progress: any) => {
          if (onProgress && progress.status === "downloading") {
            onProgress(Math.round(progress.progress ?? 0));
          }
        },
      }
    );

    modelLoading = false;
  })();

  return modelLoadPromise;
}

// ── Status checks ─────────────────────────────────────────────────────────────

export function isModelLoaded(): boolean {
  return embedder !== null;
}

export function isModelLoading(): boolean {
  return modelLoading;
}

// ── Embed a single string → 384-dimension float vector ───────────────────────

export async function embedText(text: string): Promise<number[]> {
  if (!embedder) throw new Error("Embedding model not loaded. Call loadEmbeddingModel() first.");

  const output = await embedder(text, {
    pooling:   "mean",
    normalize: true,
  });

  return Array.from(output.data as Float32Array);
}

// ── Embed multiple strings with optional progress callback ───────────────────

export async function embedBatch(
  texts: string[],
  onProgress?: (done: number, total: number) => void
): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i++) {
    embeddings.push(await embedText(texts[i]));
    if (onProgress) onProgress(i + 1, texts.length);
  }

  return embeddings;
}

// ── Cosine similarity between two vectors ─────────────────────────────────────
// Returns a value between -1 and 1. Higher = more similar.
// Normalized vectors (normalize: true above) produce values in [0, 1].

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("Vector length mismatch");

  let dot = 0, normA = 0, normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;

  return dot / denom;
}

// ── Reset the embedder (for testing or forced reload) ─────────────────────────

export function resetEmbedder(): void {
  embedder          = null;
  modelLoading      = false;
  modelLoadPromise  = null;
}
