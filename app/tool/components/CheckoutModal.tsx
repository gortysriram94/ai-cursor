"use client";

import { useCallback, useMemo } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";

interface Props {
  clientSecret: string;
  onClose: () => void;
}

export default function CheckoutModal({ clientSecret, onClose }: Props) {
  const fetchClientSecret = useCallback(() => Promise.resolve(clientSecret), [clientSecret]);

  // Defer loadStripe until render — avoids the module-level call that throws
  // when NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is undefined (missing .env.local).
  const stripePromise = useMemo(() => {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      console.error(
        "[CheckoutModal] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set.\n" +
        "Add it to .env.local and restart the dev server."
      );
      return null;
    }
    return loadStripe(key);
  }, []);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        width: "100%", maxWidth: 520,
        maxHeight: "90vh",
        overflowY: "auto",
        position: "relative",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", borderBottom: "1px solid var(--border)",
        }}>
          <span className="mono" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.12em" }}>
            SECURE CHECKOUT
          </span>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--muted)", fontSize: 18, lineHeight: 1, padding: "2px 6px",
          }}>
            ✕
          </button>
        </div>

        {/* Stripe Embedded Checkout — or a clear error if key is missing */}
        <div style={{ padding: "20px" }}>
          {stripePromise ? (
            <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          ) : (
            <div style={{ padding: "24px 0", textAlign: "center" }}>
              <div className="mono" style={{ fontSize: 10, color: "var(--danger)", letterSpacing: "0.12em", marginBottom: 10 }}>
                STRIPE KEY MISSING
              </div>
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                Add <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> to your{" "}
                <code>.env.local</code> file and restart the dev server.
              </p>
              <button onClick={onClose} style={{
                marginTop: 16, background: "none",
                border: "1px solid var(--border)", color: "var(--muted)",
                fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                padding: "6px 14px", cursor: "pointer",
              }}>
                CLOSE
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
