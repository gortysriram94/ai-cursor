// app/api/create-checkout/route.ts
// Stripe checkout for 99¢/100 credits

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStoredCustomerId, storeCustomerId } from "@/lib/credits";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const PRICE_ID = process.env.STRIPE_PRICE_ID!;
const CREDITS_PER_PURCHASE = 100;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    let customerId = body.customerId || getStoredCustomerId();

    // Create Stripe customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { source: "buydecision-ai" },
      });
      customerId = customer.id;
      storeCustomerId(customerId);
    }

    // Import package info
    const { PACKAGES } = await import("@/lib/credits");
    const trialPackage = PACKAGES.trial;

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "BuyDecision AI - 100 Credits",
              description: "100 AI analyses (2 credits each)",
            },
            unit_amount: trialPackage.price, // 99¢
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
      metadata: {
        credits: trialPackage.credits.toString(),
        package: "trial",
      },
    });

    return NextResponse.json({ sessionId: session.id, sessionUrl: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

