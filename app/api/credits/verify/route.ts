// app/api/credits/verify/route.ts
// Verify Stripe payment and add credits

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { storeCustomerId } from "@/lib/credits";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
    }

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return NextResponse.json({ error: "Payment not completed" }, { status: 402 });
    }

    // Store customer ID
    if (session.customer) {
      storeCustomerId(session.customer as string);
    }

    // Return credits from metadata
    const credits = parseInt(session.metadata?.credits || "100");

    return NextResponse.json({
      success: true,
      credits,
      customerId: session.customer,
    });
  } catch (error) {
    console.error("Verify payment error:", error);
    return NextResponse.json(
      { error: "Failed to verify payment" },
      { status: 500 }
    );
  }
}
