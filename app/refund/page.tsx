import Link from "next/link";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--accent)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 16 }}>
      {title}
    </div>
    <div style={{ color: "var(--text-dim)", fontSize: 15, lineHeight: 1.8, display: "flex", flexDirection: "column", gap: 8 }}>
      {children}
    </div>
  </div>
);

export default function RefundPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--surface)", color: "var(--text)", fontFamily: "DM Sans, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
        <Link href="/" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--accent)", textDecoration: "none", letterSpacing: "0.1em", display: "inline-block", marginBottom: 48 }}>
          ← BACK TO HOME
        </Link>
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--muted)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12 }}>
          Last updated: April 2026
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 300, color: "var(--text)", marginBottom: 48, borderBottom: "1px solid var(--border)", paddingBottom: 24 }}>
          Refund Policy
        </h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          <Section title="One-Time File Exports">
            <p>A refund is available within 24 hours if your download failed or the exported file was corrupted.</p>
            <p>No refund is issued once a download has completed successfully.</p>
          </Section>
          <Section title="Subscriptions">
            <p>You may cancel your subscription at any time from your account page.</p>
            <p>No partial month refunds are issued. Access continues until the end of the current billing period.</p>
          </Section>
          <Section title="Credit Packs">
            <p>Unused credits are refundable within 7 days of purchase.</p>
            <p>Credits that have been used for generation are non-refundable once the output has been delivered.</p>
          </Section>
          <Section title="How to Request a Refund">
            <p>Email us at <span style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--accent)" }}>refunds@tokenlift.app</span></p>
            <p>Include your Stripe receipt number in your message.</p>
            <p>We respond within 2 business days.</p>
          </Section>
        </div>
      </div>
    </div>
  );
}
