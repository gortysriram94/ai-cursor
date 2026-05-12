// app/api/subscriptions/route.ts
// Create and manage subscription checkout sessions.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

const SUBSCRIPTION_PRICES: Record<string, string> = {
  pro:    process.env.STRIPE_PRICE_SUBSCRIPTION_PRO    ?? "",
  studio: process.env.STRIPE_PRICE_SUBSCRIPTION_STUDIO ?? "",
  team:   process.env.STRIPE_PRICE_SUBSCRIPTION_TEAM   ?? "",
};

const CUSTOMER_ID_RE = /^cus_[a-zA-Z0-9]+$/;

// ── POST /api/subscriptions — create checkout for a subscription tier ─────────

export async function POST(req: NextRequest) {
  let body: { tier?: string; customerId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { tier, customerId } = body;

  if (!tier || !SUBSCRIPTION_PRICES[tier]) {
    return NextResponse.json({ error: "Invalid subscription tier" }, { status: 400 });
  }
  if (!customerId || !CUSTOMER_ID_RE.test(customerId)) {
    return NextResponse.json({ error: "Invalid customer ID" }, { status: 400 });
  }

  const priceId = SUBSCRIPTION_PRICES[tier];
  if (!priceId) {
    return NextResponse.json(
      { error: "Subscription price not configured. Check STRIPE_PRICE_SUBSCRIPTION_* env vars." },
      { status: 500 }
    );
  }

  try {
    const session = await stripe.checkout.sessions.create({
      customer:             customerId,
      mode:                 "subscription",
      ui_mode:              "embedded",
      line_items:           [{ price: priceId, quantity: 1 }],
      return_url:           `${BASE_URL}/account?subscribed=true`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({
      clientSecret: session.client_secret,
      sessionId:    session.id,
    });
  } catch (err) {
    console.error("[subscriptions POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Failed to create subscription checkout" },
      { status: 500 }
    );
  }
}

// ── GET /api/subscriptions — get portal URL for managing subscription ─────────

export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get("customerId");

  if (!customerId || !CUSTOMER_ID_RE.test(customerId)) {
    return NextResponse.json({ error: "Invalid customer ID" }, { status: 400 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: `${BASE_URL}/account`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[subscriptions GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}
