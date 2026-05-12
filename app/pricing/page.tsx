// app/pricing/page.tsx
// BuyDecision AI - Pricing Page (99¢/100 credits)

"use client";

import { useState } from "react";
import Link from "next/link";
import { loadStripe } from "@stripe/stripe-js";
import { getStoredCustomerId } from "@/lib/credits";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export default function PricingPage() {
  const [loading, setLoading] = useState(false);

  const handlePurchase = async () => {
    setLoading(true);
    try {
      const customerId = getStoredCustomerId();

      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });

      const { sessionUrl } = await res.json();

      // Redirect to Stripe Checkout
      if (sessionUrl) {
        window.location.href = sessionUrl;
      } else {
        throw new Error("No session URL returned");
      }
    } catch (error) {
      console.error("Purchase error:", error);
      alert("Purchase failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface)", color: "var(--text)", padding: "40px 24px" }}>
      {/* Navigation */}
      <nav style={{ maxWidth: 900, margin: "0 auto 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/" style={{ fontWeight: 700, color: "var(--accent)", textDecoration: "none", fontSize: 15 }}>
          BuyDecision AI
        </Link>
        <Link href="/" style={{ fontSize: 12, color: "var(--muted)", textDecoration: "none" }}>
          ← Back to App
        </Link>
      </nav>

      {/* Header */}
      <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center", marginBottom: 60 }}>
        <h1 style={{ fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 800, marginBottom: 16, letterSpacing: "-0.02em" }}>
          Simple, Transparent Pricing
        </h1>
        <p style={{ fontSize: 16, color: "var(--muted)", maxWidth: 500, margin: "0 auto" }}>
          Pay only for what you use. No subscriptions, no hidden fees.
        </p>
      </div>

      {/* Pricing Card */}
      <div style={{ maxWidth: 420, margin: "0 auto", border: "2px solid var(--accent)", borderRadius: 12, padding: 40, background: "var(--panel)", position: "relative" }}>
        <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "var(--accent)", color: "var(--surface)", padding: "4px 16px", borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em" }}>
          MOST POPULAR
        </div>

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, fontWeight: 800, color: "var(--accent)", marginBottom: 8 }}>
            $0.99
          </div>
          <div style={{ fontSize: 14, color: "var(--muted)" }}>
            One-time purchase
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 24, marginBottom: 32 }}>
          {[
            "100 AI analyzes",
            "2 credits per analysis",
            "Crypto, stocks, products",
            "Real-time market data",
            "Buy/Sell/Hold recommendations",
            "Risk assessment",
          ].map((feature, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 14 }}>
              <span style={{ color: "var(--success)", fontSize: 16 }}>✓</span>
              <span style={{ color: "var(--text)" }}>{feature}</span>
            </div>
          ))}
        </div>

        <button
          onClick={handlePurchase}
          disabled={loading}
          style={{
            width: "100%",
            padding: "14px 24px",
            background: loading ? "var(--border)" : "var(--accent)",
            color: "var(--surface)",
            border: "none",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 700,
            cursor: loading ? "wait" : "pointer",
            transition: "opacity 0.2s",
          }}
        >
          {loading ? "Processing..." : "Buy Now — $0.99"}
        </button>

        <p style={{ textAlign: "center", fontSize: 11, color: "var(--muted)", marginTop: 16, lineHeight: 1.6 }}>
          Secure payment via Stripe.
          <br />
          Credits never expire.
        </p>
      </div>

      {/* FAQ */}
      <div style={{ maxWidth: 700, margin: "60px auto 0" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, textAlign: "center" }}>
          Frequently Asked Questions
        </h2>
        {[
          { q: "What do I get for $0.99?", a: "You get 100 credits. Each analysis (crypto, stock, or product) costs 2 credits. That's 50 complete analyses for less than a dollar." },
          { q: "How accurate is the AI analysis?", a: "Our AI uses real-time market data from CoinGecko, Yahoo Finance, and recent news. However, this is educational analysis only — not financial advice. Always consult a qualified financial advisor." },
          { q: "Do credits expire?", a: "No, your credits never expire. Use them whenever you want." },
          { q: "Can I get a refund?", a: "Yes, we offer refunds within 7 days if you're not satisfied. Contact support for assistance." },
        ].map((faq, i) => (
          <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "16px 20px", marginBottom: 12, background: "var(--panel)" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{faq.q}</div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>{faq.a}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer style={{ maxWidth: 900, margin: "60px auto 0", borderTop: "1px solid var(--border)", paddingTop: 24, textAlign: "center", fontSize: 11, color: "var(--muted)" }}>
        <p>
          <Link href="/terms" style={{ color: "var(--muted)", marginRight: 16 }}>Terms</Link>
          <Link href="/privacy" style={{ color: "var(--muted)", marginRight: 16 }}>Privacy</Link>
          <Link href="/refund" style={{ color: "var(--muted)" }}>Refund Policy</Link>
        </p>
        <p style={{ marginTop: 12 }}>
          BuyDecision AI — Financial analysis powered by AI.
          <br />
          Not financial advice. Consult a qualified advisor.
        </p>
      </footer>
    </div>
  );
}
