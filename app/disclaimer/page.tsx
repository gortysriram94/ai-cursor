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

export default function DisclaimerPage() {
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
          Disclaimer
        </h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          <Section title="AI Output Accuracy">
            <p>AI-generated outputs may contain errors, omissions, or inaccuracies. Always verify findings independently before making decisions based on AI-generated content.</p>
          </Section>
          <Section title="Financial Disclaimer">
            <p>TokenLift does not provide financial advice, investment recommendations, or trading signals. Analysis of historical trading data does not predict future performance. Past patterns do not guarantee future results. Consult a licensed financial advisor before making any investment decisions.</p>
          </Section>
          <Section title="Health & Medical">
            <p>TokenLift is not a medical tool. Do not upload patient data, medical records, or any Protected Health Information. We are not HIPAA compliant and make no claims of HIPAA compliance.</p>
          </Section>
          <Section title="Legal">
            <p>Nothing on TokenLift constitutes legal advice. Consult a qualified attorney for guidance on legal matters.</p>
          </Section>
          <Section title="Generation Quality">
            <p>Image and video generation quality depends entirely on third-party model providers (OpenAI, Stability AI, Luma AI, etc.). TokenLift does not control or guarantee the quality, accuracy, or appropriateness of generated content.</p>
          </Section>
        </div>
      </div>
    </div>
  );
}
