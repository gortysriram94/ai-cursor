// app/api/auth/route.ts
// Magic link auth via Stripe Customer Portal.
// No passwords. No separate auth system.
// User receives a portal link → clicks it → authenticated via Stripe session.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── POST /api/auth/magic-link ─────────────────────────────────────────────────
// Creates or retrieves Stripe Customer, returns a Customer Portal URL.
// User clicks the link in email → opens portal → customerId stored in browser.

export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { email } = body;
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  try {
    // Find or create customer
    let customerId: string;
    const existing = await stripe.customers.list({ email, limit: 1 });

    if (existing.data.length > 0) {
      customerId = existing.data[0].id;
    } else {
      const customer = await stripe.customers.create({ email });
      customerId = customer.id;
    }

    // Create Customer Portal session (acts as the magic link)
    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: `${BASE_URL}/account`,
    });

    return NextResponse.json({
      url:        session.url,
      customerId, // client stores this in localStorage
    });
  } catch (err) {
    console.error("[auth/magic-link]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}

// ── GET /api/auth/session ─────────────────────────────────────────────────────
// Validates a stored customerId and returns account state.
// Called on page load to hydrate the auth state.

export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get("customerId");

  if (!customerId || !/^cus_[a-zA-Z0-9]+$/.test(customerId)) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ["subscriptions"],
    });

    if (customer.deleted) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    // Read subscription info
    const subs = (customer as any).subscriptions?.data ?? [];
    const activeSub = subs.find((s: any) =>
      ["active", "trialing"].includes(s.status)
    );

    const tier = activeSub
      ? getTierFromPriceId(activeSub.items.data[0]?.price?.id)
      : "free";

    const renewsAt = activeSub
      ? new Date(activeSub.current_period_end * 1000).toISOString().split("T")[0]
      : null;

    // Read credits from metadata
    const meta = customer.metadata ?? {};
    const credits = {
      text:  parseInt(meta.credits_text  ?? "0"),
      image: parseInt(meta.credits_image ?? "0"),
      video: parseInt(meta.credits_video ?? "0"),
    };

    return NextResponse.json(
      {
        authenticated: true,
        customerId,
        email:        customer.email,
        subscription: tier,
        renewsAt,
        credits,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTierFromPriceId(priceId: string | undefined): string {
  if (!priceId) return "free";
  const map: Record<string, string> = {
    [process.env.STRIPE_PRICE_SUBSCRIPTION_PRO    ?? ""]: "pro",
    [process.env.STRIPE_PRICE_SUBSCRIPTION_STUDIO ?? ""]: "studio",
    [process.env.STRIPE_PRICE_SUBSCRIPTION_TEAM   ?? ""]: "team",
  };
  return map[priceId] ?? "free";
}
