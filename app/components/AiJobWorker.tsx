"use client";

import { useEffect } from "react";
import { isPuterLoaded, kimiChat } from "@/lib/puter-ai";

const PROMPTS: Record<string, (t: string) => string> = {
  reply:     (t) => `Write a short, professional reply to this message. Sound human, not robotic. Return only the reply.\n\n${t}`,
  follow_up: (t) => `Write a concise follow-up message. Keep it brief and action-oriented. Return only the follow-up.\n\n${t}`,
  summarize: (t) => `Summarize the key points in 2–3 sentences. Return only the summary.\n\n${t}`,
};

// ── Extract Puter auth token from browser and register it server-side ─────────
async function registerPuterToken() {
  const puter = (window as any).puter;
  if (!puter) return;

  let token: string | null = null;

  // Method 1 — direct property on window.puter
  token = puter.authToken ?? puter.auth_token ?? puter.token ?? null;

  // Method 2 — nested env object
  if (!token && puter.env) {
    token = puter.env.authToken ?? puter.env.auth_token ?? null;
  }

  // Method 3 — scan localStorage for any puter auth key
  if (!token) {
    for (const key of Object.keys(localStorage)) {
      if (key.toLowerCase().includes("puter")) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          token = parsed.token ?? parsed.auth_token ?? parsed.authToken ?? null;
          if (typeof parsed === "string") token = parsed;
        } catch {
          token = raw;
        }
        if (token) break;
      }
    }
  }

  if (!token) return;

  await fetch("/api/puter-token", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ token }),
  }).catch(() => {});
}

// ── Browser relay worker (fallback when server token not yet registered) ──────
export default function AiJobWorker() {
  useEffect(() => {
    let active = true;

    // Register token as soon as Puter loads
    const tokenInterval = setInterval(async () => {
      if (isPuterLoaded()) {
        clearInterval(tokenInterval);
        await registerPuterToken();
      }
    }, 500);

    // Keep polling for jobs (fallback path while token propagates)
    async function poll() {
      while (active) {
        try {
          if (isPuterLoaded()) {
            const res       = await fetch("/api/ai-action/poll");
            const { job }   = await res.json();

            if (job) {
              const promptFn = PROMPTS[job.action];
              if (promptFn) {
                const result = await kimiChat([{ role: "user", content: promptFn(job.text) }]);
                await fetch("/api/ai-action/result", {
                  method:  "POST",
                  headers: { "Content-Type": "application/json" },
                  body:    JSON.stringify({ id: job.id, result }),
                });
              }
            }
          }
        } catch { /* keep going */ }

        await new Promise(r => setTimeout(r, 500));
      }
    }

    poll();
    return () => {
      active = false;
      clearInterval(tokenInterval);
    };
  }, []);

  return null;
}
