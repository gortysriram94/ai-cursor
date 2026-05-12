"use client";
// lib/puter-ai.ts
// Browser-side wrapper for Puter.js → Kimi K2.6 (free, unlimited).
// Puter.js is injected as a CDN script in layout.tsx.
// NEVER import this in server components or API routes.

declare global {
  interface Window {
    puter?: {
      ai: {
        chat(
          prompt: string | Array<{ role: string; content: string }>,
          options?: { model?: string; stream?: boolean; max_tokens?: number },
        ): Promise<any>;
      };
      auth: {
        isSignedIn(): Promise<boolean>;
        getUser(): Promise<{ username: string; uuid: string } | null>;
        signIn(): Promise<{ username: string; uuid: string } | null>;
      };
    };
  }
}

// Model IDs Puter exposes for Kimi — tried in order until one works.
export const KIMI_MODELS = ["kimi-k2", "moonshot/kimi-k2", "kimi-k2.5"];
export const KIMI_LABEL  = "Kimi K2";

export function isPuterLoaded(): boolean {
  return typeof window !== "undefined" && typeof window.puter !== "undefined";
}

export async function isPuterSignedIn(): Promise<boolean> {
  if (!isPuterLoaded()) return false;
  try { return await window.puter!.auth.isSignedIn(); }
  catch { return false; }
}

export async function getPuterUser(): Promise<string | null> {
  if (!isPuterLoaded()) return null;
  try {
    const u = await window.puter!.auth.getUser();
    return u?.username ?? null;
  } catch { return null; }
}

export async function puterSignIn(): Promise<string | null> {
  if (!isPuterLoaded()) return null;
  try {
    const u = await window.puter!.auth.signIn();
    return u?.username ?? null;
  } catch { return null; }
}

export interface KimiChunk { text: string; done?: boolean; model?: string; }

// Streaming chat through Puter → Kimi K2.6.
// Tries each KIMI_MODELS entry in order; throws if all fail.
export async function* kimiStream(
  messages: Array<{ role: string; content: string }>,
): AsyncGenerator<KimiChunk> {
  if (!isPuterLoaded()) throw new Error("Puter.js not loaded");

  let lastErr: unknown;
  for (const model of KIMI_MODELS) {
    try {
      const stream = await window.puter!.ai.chat(messages, { model, stream: true });
      for await (const chunk of stream) {
        const text =
          chunk?.text ??
          chunk?.message?.content ??
          chunk?.choices?.[0]?.delta?.content ??
          "";
        if (text) yield { text, model };
      }
      yield { text: "", done: true, model };
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("All Kimi models failed");
}

// One-shot (non-streaming) Kimi call — for triage, classification, short tasks.
export async function kimiChat(
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  if (!isPuterLoaded()) throw new Error("Puter.js not loaded");

  let lastErr: unknown;
  for (const model of KIMI_MODELS) {
    try {
      const res = await window.puter!.ai.chat(messages, { model });
      return (
        res?.message?.content ??
        res?.choices?.[0]?.message?.content ??
        res?.text ??
        ""
      );
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("All Kimi models failed");
}
