// app/api/paywall/success/route.ts
// Handles Stripe redirect after payment.
// Awards credits_action, records tier + purchase history in Stripe metadata.
// Redirects to /?paid=true&customerId=cus_xxx so client can persist the ID.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { TIER_ORDER, type Purchase } from "@/lib/credits";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });
const BASE   = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const sessionId = searchParams.get("session_id");
  const q         = searchParams.get("q") ?? "";

  if (!sessionId) return NextResponse.redirect(`${BASE}/?error=missing_session`);

  try {
    const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);

    if (stripeSession.payment_status !== "paid") {
      return NextResponse.redirect(`${BASE}/?error=payment_not_confirmed`);
    }

    const customerId = stripeSession.customer as string | null;
    if (!customerId) return NextResponse.redirect(`${BASE}/?error=no_customer`);

    const meta    = stripeSession.metadata ?? {};
    const credits = parseInt(meta.packageCredits || "0");
    const tier    = meta.packageTier || "trial";
    const pkgId   = meta.packageId   || "trial";

    // Retrieve current customer metadata
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return NextResponse.redirect(`${BASE}/?error=customer_deleted`);

    const existing   = customer.metadata || {};
    const curCredits = parseInt(existing.credits_action || "0");
    const curTier    = existing.tier || "none";

    // Upgrade tier only if the new package is higher
    const newTier = (TIER_ORDER[tier] ?? 0) > (TIER_ORDER[curTier] ?? -1) ? tier : curTier;

    // Append to purchase history (cap at 50 entries)
    let purchases: Purchase[] = [];
    try { purchases = JSON.parse(existing.purchases || "[]"); } catch { /* */ }

    // Idempotency guard — don't re-credit the same Stripe session twice
    if (purchases.some((p: Purchase) => p.sessionId === sessionId)) {
      const dest = new URL(`${BASE}/`);
      dest.searchParams.set("paid",       "true");
      dest.searchParams.set("customerId", customerId);
      dest.searchParams.set("credits",    "0");
      dest.searchParams.set("package",    pkgId);
      if (q) dest.searchParams.set("q", q);
      return NextResponse.redirect(dest.toString());
    }

    const newPurchase: Purchase = {
      package:   pkgId as any,
      credits,
      amountUsd: stripeSession.amount_total ?? 0,
      date:      new Date().toISOString(),
      sessionId,
    };
    purchases = [...purchases, newPurchase].slice(-50);

    // Persist to Stripe customer metadata
    await stripe.customers.update(customerId, {
      metadata: {
        ...existing,
        credits_action: String(curCredits + credits),
        tier:           newTier,
        purchases:      JSON.stringify(purchases),
      },
    });

    // Redirect back to site with customerId so client stores it in localStorage
    const dest = new URL(`${BASE}/`);
    dest.searchParams.set("paid",       "true");
    dest.searchParams.set("customerId", customerId);
    dest.searchParams.set("credits",    String(credits));
    dest.searchParams.set("package",    pkgId);
    if (q) dest.searchParams.set("q", q);

    return NextResponse.redirect(dest.toString());
  } catch (err) {
    console.error("[paywall/success]", err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${BASE}/?error=server_error`);
  }
}
