"use client";

let encoder: { encode: (text: string) => Uint32Array } | null = null;
let loading = false;
let loadPromise: Promise<void> | null = null;

export async function loadEncoder(): Promise<void> {
  if (encoder) return;
  if (loadPromise) return loadPromise;

  loading = true;
  loadPromise = (async () => {
    try {
      const { get_encoding } = await import("tiktoken");
      encoder = get_encoding("cl100k_base");
    } catch (e) {
      console.error("tiktoken failed to load:", e);
      encoder = null;
    } finally {
      loading = false;
    }
  })();

  return loadPromise;
}

export function countTokens(text: string): number {
  if (!encoder) {
    // Fallback: rough approximation (1 token ≈ 4 chars)
    return Math.ceil(text.length / 4);
  }
  try {
    return encoder.encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

export function isEncoderReady(): boolean {
  return encoder !== null;
}
