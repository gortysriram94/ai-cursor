// lib/credits.ts
// Credit balance is stored server-side in Stripe Customer metadata.
// The client holds a customerId (from Stripe) in localStorage — NOT the balance.
// Balance is always fetched from the server to prevent client-side manipulation.

export type CreditType = "text" | "image" | "video" | "export" | "action";

export interface CreditBalance {
  export: number;
  text:   number;
  image:  number;
  video:  number;
  action: number; // agent action credits — the main currency for TokenLift canvas
}

// ── Package catalogue ─────────────────────────────────────────────────────────
export const PACKAGES = {
  trial:   { id: "trial",   name: "Test Node",        price: 99,    credits: 100,  tier: "trial",   desc: "24-hour sandbox access" },
  starter: { id: "starter", name: "Starter",          price: 1500,  credits: 500,  tier: "starter", desc: "1 active node · Standard relay" },
  pro:     { id: "pro",     name: "Pro (High-Torque)", price: 4500,  credits: 2000, tier: "pro",     desc: "3 parallel nodes · Turbo relay" },
  elite:   { id: "elite",   name: "Elite (Swarm Master)", price: 12000, credits: 6000, tier: "elite", desc: "10 parallel nodes · Instant relay" },
} as const;

export type PackageId = keyof typeof PACKAGES;

// Tier ordering — used to determine if an upgrade happened
export const TIER_ORDER: Record<string, number> = { trial: 0, starter: 1, pro: 2, elite: 3 };

export interface Purchase {
  package:   PackageId;
  credits:   number;
  amountUsd: number; // cents
  date:      string; // ISO
  sessionId: string; // Stripe cs_...
}

const CUSTOMER_KEY = "tl_stripe_customer_id";

// ── Customer ID (safe to store locally — it's not a secret) ──────────────────

export function getStoredCustomerId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CUSTOMER_KEY);
}

export function storeCustomerId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CUSTOMER_KEY, id);
}

// ── Fetch live balance from server (reads Stripe Customer metadata) ───────────

export async function fetchCreditBalance(customerId: string): Promise<CreditBalance> {
  const res = await fetch(`/api/credits?customerId=${encodeURIComponent(customerId)}`, {
    headers: { "Cache-Control": "no-store" },
  });
  if (!res.ok) throw new Error("Failed to fetch credit balance");
  return res.json();
}

// ── Fetch action-credit balance only (agent canvas currency) ─────────────────

export async function fetchActionCredits(customerId: string): Promise<number> {
  try {
    const bal = await fetchCreditBalance(customerId);
    return bal.action ?? 0;
  } catch { return 0; }
}

// ── Deduct credits server-side (atomic check + deduct) ───────────────────────

export async function deductCredit(
  customerId: string,
  creditType: CreditType,
  amount = 1
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const res = await fetch("/api/credits/deduct", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId, creditType, amount }),
  });
  return res.json();
}
