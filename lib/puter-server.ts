// lib/puter-server.ts
// Calls Puter's REST API directly from the server — no browser needed.
// Token is extracted once from the browser (via AiJobWorker) and persisted.

import { readFileSync } from "fs";
import { join } from "path";

const PUTER_API  = "https://api.puter.com/drivers/call";
const TOKEN_FILE = join(process.cwd(), ".puter-token");
const MODELS     = ["kimi-k2", "moonshot/kimi-k2", "kimi-k2.5"];

function getToken(): string {
  // 1. Already in memory
  if (process.env.PUTER_AUTH_TOKEN) return process.env.PUTER_AUTH_TOKEN;

  // 2. Saved to file from a previous browser session
  try {
    const token = readFileSync(TOKEN_FILE, "utf8").trim();
    if (token) {
      process.env.PUTER_AUTH_TOKEN = token; // cache for this process
      return token;
    }
  } catch { /* not saved yet */ }

  throw new Error("Puter auth token not registered. Open the app in a browser first.");
}

export async function puterServerChat(
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const token = getToken();

  let lastErr: unknown;

  for (const model of MODELS) {
    try {
      const res = await fetch(PUTER_API, {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          interface: "puter-chat-completion",
          test_mode: false,
          driver:    "openai",
          method:    "complete",
          args:      { messages, model },
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Puter API ${res.status}: ${err}`);
      }

      const data = await res.json();
      const text =
        data?.result?.message?.content          ??
        data?.result?.choices?.[0]?.message?.content ??
        data?.message?.content                  ??
        data?.choices?.[0]?.message?.content    ??
        "";

      if (text) return text;
      throw new Error("Empty response from Puter");
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr ?? new Error("All Puter models failed");
}

export function isPuterTokenRegistered(): boolean {
  if (process.env.PUTER_AUTH_TOKEN) return true;
  try {
    const token = readFileSync(TOKEN_FILE, "utf8").trim();
    return !!token;
  } catch {
    return false;
  }
}
