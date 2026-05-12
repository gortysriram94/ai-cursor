// app/api/credits/balance/route.ts
// Returns current credit balances and subscription info from Stripe Customer metadata.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });
const CUSTOMER_ID_RE = /^cus_[a-zA-Z0-9]+$/;

function getTierFromPriceId(priceId: string | undefined): string {
  if (!priceId) return "free";
  const map: Record<string, string> = {
    [process.env.STRIPE_PRICE_SUBSCRIPTION_PRO    ?? "___"]: "pro",
    [process.env.STRIPE_PRICE_SUBSCRIPTION_STUDIO ?? "___"]: "studio",
    [process.env.STRIPE_PRICE_SUBSCRIPTION_TEAM   ?? "___"]: "team",
  };
  return map[priceId] ?? "free";
}

export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get("customerId");

  if (!customerId || !CUSTOMER_ID_RE.test(customerId)) {
    return NextResponse.json({ error: "Invalid customer ID" }, { status: 400 });
  }

  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ["subscriptions"],
    });

    if (customer.deleted) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const meta = customer.metadata ?? {};
    const subs = (customer as any).subscriptions?.data ?? [];
    const activeSub = subs.find((s: any) =>
      ["active", "trialing"].includes(s.status)
    );

    const subscription = activeSub
      ? getTierFromPriceId(activeSub.items.data[0]?.price?.id)
      : "free";

    const renewsAt = activeSub
      ? new Date(activeSub.current_period_end * 1000).toISOString().split("T")[0]
      : null;

    return NextResponse.json(
      {
        text:         parseInt(meta.credits_text  ?? "0"),
        image:        parseInt(meta.credits_image ?? "0"),
        video:        parseInt(meta.credits_video ?? "0"),
        subscription,
        renewsAt,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[credits/balance]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Failed to fetch balance" },
      { status: 500 }
    );
  }
}
