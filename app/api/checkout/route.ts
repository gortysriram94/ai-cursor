import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const EXPORT_TYPES = ["csv", "csv_pii", "rag_jsonl", "vector_db", "credit_pack"] as const;

const VALID_TIERS = ["starter", "standard", "pro", "enterprise", "pack5"] as const;

// UUID v4 pattern — datasetId must match this before we touch it
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRICE_IDS: Record<string, Record<string, string>> = {
  credit_pack: {
    pack5: process.env.STRIPE_PRICE_ID_CREDIT_PACK!,
  },
  csv: {
    starter:    process.env.STRIPE_PRICE_ID_STARTER!,
    standard:   process.env.STRIPE_PRICE_ID_STANDARD!,
    pro:        process.env.STRIPE_PRICE_ID_PRO!,
    enterprise: process.env.STRIPE_PRICE_ID_ENTERPRISE!,
  },
  csv_pii: {
    starter:    process.env.STRIPE_PRICE_ID_PII_STARTER!,
    standard:   process.env.STRIPE_PRICE_ID_PII_STANDARD!,
    pro:        process.env.STRIPE_PRICE_ID_PII_PRO!,
    enterprise: process.env.STRIPE_PRICE_ID_PII_ENTERPRISE!,
  },
  rag_jsonl: {
    starter:    process.env.STRIPE_PRICE_ID_RAG_STARTER!,
    standard:   process.env.STRIPE_PRICE_ID_RAG_STANDARD!,
    pro:        process.env.STRIPE_PRICE_ID_RAG_PRO!,
    enterprise: process.env.STRIPE_PRICE_ID_RAG_ENTERPRISE!,
  },
  vector_db: {
    starter:    process.env.STRIPE_PRICE_ID_VECTOR_STARTER!,
    standard:   process.env.STRIPE_PRICE_ID_VECTOR_STANDARD!,
    pro:        process.env.STRIPE_PRICE_ID_VECTOR_PRO!,
    enterprise: process.env.STRIPE_PRICE_ID_VECTOR_ENTERPRISE!,
  },
};

// Simple in-process rate limiter: max 10 checkout sessions per IP per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  if (entry.count >= 10) return true;
  entry.count++;
  return false;
}

// Periodically purge stale entries to prevent memory growth on long-running instances
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap.entries()) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}, 5 * 60_000);

export async function POST(req: NextRequest) {
  // ── Rate limiting ──────────────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { tier?: string; datasetId?: string; exportType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { tier, datasetId, exportType } = body;

  // ── Validate exportType ────────────────────────────────────────────────────
  if (!exportType || !EXPORT_TYPES.includes(exportType as (typeof EXPORT_TYPES)[number])) {
    return NextResponse.json({ error: "Invalid export type" }, { status: 400 });
  }

  // ── Validate tier ─────────────────────────────────────────────────────────
  if (!tier || !VALID_TIERS.includes(tier as (typeof VALID_TIERS)[number])) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  // ── Validate datasetId is a real UUID (prevents URL injection) ─────────────
  if (exportType !== "credit_pack") {
    if (!datasetId || !UUID_RE.test(datasetId)) {
      return NextResponse.json({ error: "Invalid dataset ID" }, { status: 400 });
    }
  }

  // ── Resolve price ──────────────────────────────────────────────────────────
  const priceId = PRICE_IDS[exportType]?.[tier];
  if (!priceId) {
    return NextResponse.json({ error: "Invalid pricing configuration" }, { status: 400 });
  }

  const origin =
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") || "http://localhost:3000";

  // URL-encode each query parameter individually to prevent injection
  const safeDatasetId = datasetId ? encodeURIComponent(datasetId) : "";
  const safeExportType = encodeURIComponent(exportType);

  try {
    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        datasetId: datasetId ?? "",
        tier,
        exportType,
      },
      return_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}&dataset_id=${safeDatasetId}&export_type=${safeExportType}`,
    });

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (err: unknown) {
    // Log full error server-side, return only a generic message to the client
    console.error("[checkout] Stripe error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Checkout unavailable. Please try again." }, { status: 500 });
  }
}
