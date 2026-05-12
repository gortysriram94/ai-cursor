// app/api/webhooks/stripe/route.ts
// Stripe webhook handler - adds credits after successful payment

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { storeCustomerId } from "@/lib/credits";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  try {
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Store customer ID
        if (session.customer) {
          storeCustomerId(session.customer as string);
        }

        // Add credits via Stripe metadata
        const credits = parseInt(session.metadata?.credits || "100");
        const customerId = session.customer as string;

        // Update customer metadata with new credit balance
        await stripe.customers.update(customerId, {
          metadata: {
            action_credits: credits.toString(),
            last_purchase: new Date().toISOString(),
          },
        });

        console.log(`Payment successful: ${credits} credits added to ${customerId}`);
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`Payment succeeded: ${paymentIntent.id}`);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

