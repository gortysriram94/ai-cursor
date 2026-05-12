// lib/byok.ts
// API key management — sessionStorage only.
// Keys are NEVER sent to Pushpa servers.
// sessionStorage clears when the tab closes (default).
// Users can opt-in to localStorage persistence.

const KEY_STORAGE = {
  anthropic: "tl_key_anthropic",
  openai:    "tl_key_openai",
  fal:       "tl_key_fal",
  luma:      "tl_key_luma",
} as const;

export type Provider = keyof typeof KEY_STORAGE;

// ── Core session storage ──────────────────────────────────────────────────────

export function saveKey(provider: Provider, key: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY_STORAGE[provider], key);
}

export function getKey(provider: Provider): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(KEY_STORAGE[provider]);
}

export function hasKey(provider: Provider): boolean {
  const key = getKey(provider);
  return key !== null && key.length > 10;
}

export function clearKey(provider: Provider): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEY_STORAGE[provider]);
  // Also clear any persisted version
  localStorage.removeItem(KEY_STORAGE[provider] + "_persist");
}

export function clearAllKeys(): void {
  if (typeof window === "undefined") return;
  Object.values(KEY_STORAGE).forEach((k) => {
    sessionStorage.removeItem(k);
    localStorage.removeItem(k + "_persist");
  });
}

export function getConnectedProviders(): Provider[] {
  if (typeof window === "undefined") return [];
  return (Object.keys(KEY_STORAGE) as Provider[]).filter(hasKey);
}

// ── Optional localStorage persistence ────────────────────────────────────────
// Stores an encrypted-ish obfuscated copy so casual DevTools inspection
// doesn't immediately expose the key. Not true encryption — just base64.
// The real protection is that keys never leave the browser.

export function persistKey(provider: Provider, key: string): void {
  if (typeof window === "undefined") return;
  // Use encodeURIComponent before btoa to safely handle any Unicode characters
  try {
    localStorage.setItem(
      KEY_STORAGE[provider] + "_persist",
      btoa(encodeURIComponent(key))
    );
  } catch {
    // Silent — persistence is best-effort
  }
}

export function loadPersistedKeys(): void {
  if (typeof window === "undefined") return;
  (Object.keys(KEY_STORAGE) as Provider[]).forEach((provider) => {
    const raw = localStorage.getItem(KEY_STORAGE[provider] + "_persist");
    if (raw) {
      try {
        saveKey(provider, decodeURIComponent(atob(raw)));
      } catch {
        // Corrupted — clear it
        localStorage.removeItem(KEY_STORAGE[provider] + "_persist");
      }
    }
  });
}

// ── Provider metadata ─────────────────────────────────────────────────────────

export const PROVIDER_META: Record<Provider, {
  label:       string;
  keyPrefix:   string;
  keyHint:     string;
  unlocks:     string[];
  docsUrl:     string;
}> = {
  anthropic: {
    label:     "Anthropic",
    keyPrefix: "sk-ant-",
    keyHint:   "sk-ant-api03-...",
    unlocks:   ["Text analysis (Claude Sonnet 4)", "AI prompt synthesis"],
    docsUrl:   "https://console.anthropic.com/settings/keys",
  },
  openai: {
    label:     "OpenAI",
    keyPrefix: "sk-",
    keyHint:   "sk-proj-...",
    unlocks:   ["Text analysis (GPT-4o)", "Image generation (DALL-E 3)"],
    docsUrl:   "https://platform.openai.com/api-keys",
  },
  fal: {
    label:     "fal.ai",
    keyPrefix: "fal-",
    keyHint:   "fal-...",
    unlocks:   ["Image generation (FLUX.1 Pro)"],
    docsUrl:   "https://fal.ai/dashboard/keys",
  },
  luma: {
    label:     "Luma AI",
    keyPrefix: "luma-",
    keyHint:   "luma-...",
    unlocks:   ["Video generation (Dream Machine)"],
    docsUrl:   "https://lumalabs.ai/dream-machine/api/keys",
  },
};

// ── Key validation (prefix check only — no API call) ─────────────────────────

export function validateKeyFormat(provider: Provider, key: string): boolean {
  const meta = PROVIDER_META[provider];
  return key.startsWith(meta.keyPrefix) && key.length > 20;
}
