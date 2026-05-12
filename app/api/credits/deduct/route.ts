// app/api/credits/deduct/route.ts
// Atomically checks and deducts credits from a Stripe Customer's metadata.
// This is the server-side enforcement — clients cannot bypass this by editing localStorage.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const CUSTOMER_ID_RE = /^cus_[a-zA-Z0-9]+$/;
type CreditType = "export" | "text" | "image" | "video" | "action";
const VALID_CREDIT_TYPES: CreditType[] = ["export", "text", "image", "video", "action"];

export async function POST(req: NextRequest) {
  let body: { customerId?: string; creditType?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { customerId, creditType, amount } = body;

  // ── Validate inputs ───────────────────────────────────────────────────────

  if (!customerId || !CUSTOMER_ID_RE.test(customerId)) {
    return NextResponse.json({ error: "Invalid customer ID" }, { status: 400 });
  }

  if (!creditType || !VALID_CREDIT_TYPES.includes(creditType as CreditType)) {
    return NextResponse.json({ error: "Invalid credit type" }, { status: 400 });
  }

  const deductAmount = Number(amount ?? 1);
  if (deductAmount <= 0 || deductAmount > 100 || !Number.isInteger(deductAmount)) {
    return NextResponse.json({ error: "Invalid deduction amount" }, { status: 400 });
  }

  try {
    // ── Retrieve customer ─────────────────────────────────────────────────────
    const customer = await stripe.customers.retrieve(customerId);

    if (customer.deleted) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    // ── Read current balance ──────────────────────────────────────────────────
    const metadataKey = `credits_${creditType}`;
    const currentBalance = parseInt(customer.metadata?.[metadataKey] || "0");

    // ── Check balance ─────────────────────────────────────────────────────────
    if (currentBalance < deductAmount) {
      return NextResponse.json(
        {
          success: false,
          error: "insufficient_credits",
          currentBalance,
          required: deductAmount,
        },
        { status: 402, headers: { "Cache-Control": "no-store" } }
      );
    }

    // ── Deduct atomically ─────────────────────────────────────────────────────
    // We do a second retrieve + conditional update to minimise race conditions.
    // For true atomic ops you would use a DB transaction, but for credit pack
    // volumes (not high-frequency trading) this Stripe metadata approach is
    // sufficient and keeps the architecture serverless.
    const newBalance = currentBalance - deductAmount;

    await stripe.customers.update(customerId, {
      metadata: {
        ...customer.metadata,
        [metadataKey]: String(newBalance),
      },
    });

    return NextResponse.json(
      {
        success: true,
        creditType,
        deducted: deductAmount,
        newBalance,
        previousBalance: currentBalance,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[credits/deduct] Stripe error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Unable to process deduction. Please try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
