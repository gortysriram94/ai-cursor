import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16", // must match checkout route
});

// Stripe session IDs are always "cs_test_..." or "cs_live_..." followed by alphanumerics
const SESSION_ID_RE = /^cs_(test|live)_[a-zA-Z0-9]+$/;

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");

  if (!sessionId || !SESSION_ID_RE.test(sessionId)) {
    return NextResponse.json(
      { verified: false, error: "Invalid session" },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const verified = session.payment_status === "paid";

    if (!verified) {
      return NextResponse.json(
        { verified: false },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        verified: true,
        datasetId:  session.metadata?.datasetId  ?? null,
        tier:       session.metadata?.tier       ?? null,
        exportType: session.metadata?.exportType ?? "csv",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: unknown) {
    console.error("[verify] Stripe error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { verified: false, error: "Verification unavailable. Please try again." },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
