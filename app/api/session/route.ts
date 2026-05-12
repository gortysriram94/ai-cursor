// app/api/session/route.ts
// Returns the current user's identity from the session cookie.
// Credits are NEVER returned from this endpoint — the client must
// fetch them from Stripe via /api/credits?customerId=... (see lib/credits.ts)

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  try {
    const session = await getSession();

    return NextResponse.json({
      userId: session.userId,
    });
  } catch (error) {
    console.error("[session] Failed to get session:", error);
    return NextResponse.json(
      { error: "Failed to load session" },
      { status: 500 }
    );
  }
}