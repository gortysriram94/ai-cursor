// app/api/credits/create-customer/route.ts
// Creates a Stripe Customer record for a new user (email-only, no auth required).
// The customer ID is stored client-side in localStorage — it's the lightweight user identity.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: { email?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const { email } = body;
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  try {
    // Check if a customer with this email already exists
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data.length > 0) {
      const customer = existing.data[0];
      return NextResponse.json({
        customerId: customer.id,
        existing: true,
        credits: {
          text:  parseInt(customer.metadata?.credits_text  ?? "0"),
          image: parseInt(customer.metadata?.credits_image ?? "0"),
          video: parseInt(customer.metadata?.credits_video ?? "0"),
        },
      });
    }

    // Create new customer with starter credits
    const customer = await stripe.customers.create({
      email,
      metadata: {
        credits_text:  "5",   // free starter credits
        credits_image: "0",
        credits_video: "0",
        created_via:   "canvas_onboarding",
      },
    });

    return NextResponse.json({
      customerId: customer.id,
      existing: false,
      credits: { text: 5, image: 0, video: 0 },
    });
  } catch (err) {
    console.error("[create-customer]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }
}
