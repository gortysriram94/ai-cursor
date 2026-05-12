// app/api/credits/purchase/route.ts
// Creates a Stripe Checkout session for buying a credit pack.
// Credits are added to customer metadata after successful payment via webhook.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

type CreditType = "text" | "image" | "video";
type PackSize   = number;

// Price ID map — matches .env.example
const CREDIT_PACK_PRICES: Record<CreditType, Record<number, string>> = {
  text: {
    10:  process.env.STRIPE_PRICE_CREDITS_TEXT_10  ?? "",
    25:  process.env.STRIPE_PRICE_CREDITS_TEXT_25  ?? "",
    100: process.env.STRIPE_PRICE_CREDITS_TEXT_100 ?? "",
  },
  image: {
    50:  process.env.STRIPE_PRICE_CREDITS_IMAGE_50  ?? "",
    150: process.env.STRIPE_PRICE_CREDITS_IMAGE_150 ?? "",
    500: process.env.STRIPE_PRICE_CREDITS_IMAGE_500 ?? "",
  },
  video: {
    20:  process.env.STRIPE_PRICE_CREDITS_VIDEO_20  ?? "",
    60:  process.env.STRIPE_PRICE_CREDITS_VIDEO_60  ?? "",
    200: process.env.STRIPE_PRICE_CREDITS_VIDEO_200 ?? "",
  },
};

const VALID_CREDIT_TYPES: CreditType[] = ["text", "image", "video"];
const CUSTOMER_ID_RE = /^cus_[a-zA-Z0-9]+$/;

export async function POST(req: NextRequest) {
  let body: { creditType?: string; packSize?: number; customerId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { creditType, packSize, customerId } = body;

  if (!creditType || !VALID_CREDIT_TYPES.includes(creditType as CreditType)) {
    return NextResponse.json({ error: "Invalid credit type" }, { status: 400 });
  }
  if (!packSize || typeof packSize !== "number") {
    return NextResponse.json({ error: "Invalid pack size" }, { status: 400 });
  }
  if (!customerId || !CUSTOMER_ID_RE.test(customerId)) {
    return NextResponse.json({ error: "Invalid customer ID" }, { status: 400 });
  }

  const priceId = CREDIT_PACK_PRICES[creditType as CreditType]?.[packSize];
  if (!priceId) {
    return NextResponse.json({ error: "Invalid credit pack" }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      customer:   customerId,
      mode:       "payment",
      ui_mode:    "embedded",
      line_items: [{ price: priceId, quantity: 1 }],
      return_url: `${BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}&export_type=credit_${creditType}_${packSize}`,
      metadata: {
        creditType,
        packSize:  String(packSize),
        customerId,
      },
    });

    return NextResponse.json({
      clientSecret: session.client_secret,
      sessionId:    session.id,
    });
  } catch (err) {
    console.error("[credits/purchase]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
