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

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          <Section title="What TokenLift Is">
            <p>TokenLift is a data processing tool provided by Techtonix Media Inc. It is not a source of financial, legal, or medical advice.</p>
          </Section>
          <Section title="Your Responsibilities">
            <p>You must own the rights to any data you upload for processing.</p>
            <p>You must comply with the terms of service of any API provider you connect via BYOK features.</p>
            <p>Do not upload Protected Health Information (PHI) or any data covered under HIPAA.</p>
            <p>Do not upload data you do not have the legal right to process.</p>
          </Section>
          <Section title="Payments">
            <p>One-time exports are non-refundable once the download has succeeded.</p>
            <p>Subscriptions may be cancelled at any time. No partial month refunds are issued.</p>
            <p>Credit packs: unused credits are refundable within 7 days of purchase.</p>
          </Section>
          <Section title="AI Output Disclaimer">
            <p>AI-generated outputs depend on many factors beyond data quality. TokenLift cannot guarantee the accuracy of any AI output. Always verify AI-generated insights independently before making decisions.</p>
          </Section>
          <Section title="Financial Disclaimer">
            <p>Nothing on TokenLift constitutes financial advice, investment recommendations, or trading signals. Analysis of historical trading data does not predict future results. Consult a licensed financial advisor before making investment decisions.</p>
          </Section>
          <Section title="Intellectual Property">
            <p>Outputs generated using your API keys belong to you. TokenLift claims no ownership over your uploaded data or generated outputs.</p>
          </Section>
          <Section title="Limitation of Liability">
            <p>TokenLift is provided as-is without warranties of any kind. We are not liable for decisions made based on AI outputs, data processing results, or any use of this service.</p>
          </Section>
        </div>
      </div>
    </div>
  );
}
