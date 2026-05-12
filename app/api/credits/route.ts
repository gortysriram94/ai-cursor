// app/api/credits/route.ts
// GET  — fetch current credit balance for a customer
// POST — add credits after a successful Stripe payment

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

// Stripe customer IDs are always "cus_" followed by alphanumerics
const CUSTOMER_ID_RE = /^cus_[a-zA-Z0-9]+$/;

// Stripe session IDs are always "cs_test_..." or "cs_live_..."
const SESSION_ID_RE = /^cs_(test|live)_[a-zA-Z0-9]+$/;

type CreditType = "export" | "text" | "image" | "video" | "action";
const VALID_CREDIT_TYPES: CreditType[] = ["export", "text", "image", "video", "action"];

function getBalance(metadata: Stripe.Metadata): Record<string, number> {
  return {
    export: parseInt(metadata.credits_export || "0"),
    text:   parseInt(metadata.credits_text   || "0"),
    image:  parseInt(metadata.credits_image  || "0"),
    video:  parseInt(metadata.credits_video  || "0"),
    action: parseInt(metadata.credits_action || "0"),
    // expose tier and purchase history for the client
  };
}

function getPurchases(metadata: Stripe.Metadata) {
  try { return JSON.parse(metadata.purchases || "[]"); } catch { return []; }
}

function getTier(metadata: Stripe.Metadata): string {
  return metadata.tier || "none";
}

// ── GET /api/credits?customerId=cus_xxx ───────────────────────────────────────
// Returns the current credit balance for a customer.

export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get("customerId");

  if (!customerId || !CUSTOMER_ID_RE.test(customerId)) {
    return NextResponse.json(
      { error: "Invalid customer ID" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const customer = await stripe.customers.retrieve(customerId);

    if (customer.deleted) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const meta     = customer.metadata || {};
    const balance  = getBalance(meta);
    const tier     = getTier(meta);
    const purchases = getPurchases(meta);

    return NextResponse.json({ ...balance, tier, purchases }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[credits GET] Stripe error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Unable to fetch balance. Please try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

// ── POST /api/credits ─────────────────────────────────────────────────────────
// Called after a successful Stripe checkout to add credits to a customer.
// Body: { sessionId, creditType, amount, email? }

export async function POST(req: NextRequest) {
  let body: { sessionId?: string; creditType?: string; amount?: number; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { sessionId, creditType, amount, email } = body;

  // Validate sessionId
  if (!sessionId || !SESSION_ID_RE.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  // Validate creditType
  if (!creditType || !VALID_CREDIT_TYPES.includes(creditType as CreditType)) {
    return NextResponse.json({ error: "Invalid credit type" }, { status: 400 });
  }

  // Validate amount
  const creditAmount = Number(amount);
  if (!creditAmount || creditAmount <= 0 || creditAmount > 10000 || !Number.isInteger(creditAmount)) {
    return NextResponse.json({ error: "Invalid credit amount" }, { status: 400 });
  }

  try {
    // 1. Verify the Stripe session is actually paid
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return NextResponse.json(
        { error: "Payment not confirmed" },
        { status: 402, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 2. Retrieve or create a Stripe Customer
    let customerId = session.customer as string | null;

    if (!customerId) {
      // No customer attached to session — create one using email
      const customerEmail = email || session.customer_details?.email;
      if (!customerEmail) {
        return NextResponse.json(
          { error: "Customer email required" },
          { status: 400 }
        );
      }

      // Check if customer already exists for this email
      const existing = await stripe.customers.list({ email: customerEmail, limit: 1 });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
      } else {
        const newCustomer = await stripe.customers.create({ email: customerEmail });
        customerId = newCustomer.id;
      }
    }

    // 3. Retrieve current customer metadata
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const currentBalance = getBalance(customer.metadata || {});
    const metadataKey = `credits_${creditType}` as keyof Stripe.Metadata;
    const newAmount = currentBalance[creditType] + creditAmount;

    // 4. Update metadata with new balance
    await stripe.customers.update(customerId, {
      metadata: {
        ...customer.metadata,
        [metadataKey]: String(newAmount),
      },
    });

    return NextResponse.json(
      {
        customerId,
        creditType,
        added: creditAmount,
        newBalance: newAmount,
        allBalances: { ...currentBalance, [creditType]: newAmount },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[credits POST] Stripe error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Unable to add credits. Please try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
