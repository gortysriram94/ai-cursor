// app/success/page.tsx
// Success page after Stripe checkout

"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
// Credits are added server-side via Stripe webhook

function SuccessContent() {
  const searchParams = useSearchParams();
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (!sessionId) return;

    // Verify payment and update credits
    fetch(`/api/credits/verify?session_id=${sessionId}`)
      .then(res => res.json())
      .then(data => {
        if (data.credits) {
          setCredits(data.credits);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [searchParams]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface)", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 24 }}>🎉</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>
          Payment Successful!
        </h1>
        <p style={{ fontSize: 16, color: "var(--muted)", marginBottom: 32, lineHeight: 1.6 }}>
          {loading
            ? "Verifying your payment..."
            : `You've received ${credits || 100} credits. Start analyzing now!`
          }
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            padding: "12px 32px",
            background: "var(--accent)",
            color: "var(--surface)",
            textDecoration: "none",
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          Start Analyzing →
        </Link>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>Loading...</div>}>
      <SuccessContent />
    </Suspense>
  );
}
