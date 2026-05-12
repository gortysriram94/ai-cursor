// app/api/paywall/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { PACKAGES, type PackageId } from "@/lib/credits";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });
const BASE   = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

// Credits granted per cent paid — 1 credit per cent ($1 = 100 credits)
const CREDITS_PER_CENT = 1;

export async function POST(req: NextRequest) {
  let body: {
    packageId?:   string;
    task?:        string;
    customOrder?: { amountCents: number; credits: number; name: string };
  } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const q = body.task ? encodeURIComponent(body.task.slice(0, 500)) : "";

  // ── Custom order (ad-hoc amount) ─────────────────────────────────────────────
  if (body.customOrder) {
    const { amountCents, credits, name } = body.customOrder;
    if (!amountCents || amountCents < 99 || amountCents > 100_000) {
      return NextResponse.json({ error: "Invalid custom amount" }, { status: 400 });
    }
    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_creation: "always",
        line_items: [{
          quantity: 1,
          price_data: {
            currency:    "usd",
            unit_amount: amountCents,
            product_data: {
              name:        `Pushpa Credits — ${name}`,
              description: `${credits} action credits · Credits never expire.`,
            },
          },
        }],
        metadata: {
          packageId:      "custom",
          packageCredits: String(credits),
          packageTier:    "custom",
          task:           (body.task ?? "").slice(0, 200),
        },
        success_url: `${BASE}/api/paywall/success?session_id={CHECKOUT_SESSION_ID}${q ? `&q=${q}` : ""}`,
        cancel_url:  `${BASE}/?cancelled=true`,
      });
      return NextResponse.json({ url: session.url });
    } catch (err) {
      console.error("[paywall/custom]", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "Checkout unavailable." }, { status: 500 });
    }
  }

  // ── Named package ─────────────────────────────────────────────────────────────
  const packageId = (body.packageId ?? "trial") as PackageId;
  const pkg       = PACKAGES[packageId];
  if (!pkg) return NextResponse.json({ error: "Invalid package" }, { status: 400 });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_creation: "always",
      line_items: [{
        quantity: 1,
        price_data: {
          currency:    "usd",
          unit_amount: pkg.price,
          product_data: {
            name:        `Pushpa ${pkg.name}`,
            description: `${pkg.credits} action credits · ${pkg.desc} · Credits never expire.`,
          },
        },
      }],
      metadata: {
        packageId:      packageId,
        packageCredits: String(pkg.credits),
        packageTier:    pkg.tier,
        task:           (body.task ?? "").slice(0, 200),
      },
      success_url: `${BASE}/api/paywall/success?session_id={CHECKOUT_SESSION_ID}${q ? `&q=${q}` : ""}`,
      cancel_url:  `${BASE}/?cancelled=true`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[paywall]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Checkout unavailable." }, { status: 500 });
  }
}

