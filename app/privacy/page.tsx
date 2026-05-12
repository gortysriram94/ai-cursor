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

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          <Section title="What We Collect">
            <p>Payment information — processed by Stripe on our behalf. We never see or store your card details.</p>
            <p>Credit balance — stored in Stripe as payment metadata only, not in any database we control.</p>
            <p>Account email — only if you create an account, used for login only.</p>
            <p>Standard server logs via Vercel — request timestamps and IP addresses only. No file contents are logged.</p>
          </Section>
          <Section title="What We Do Not Collect">
            <p>Files you upload for processing.</p>
            <p>Generated images or videos.</p>
            <p>API keys you connect for BYOK features.</p>
            <p>Any personal data contained within your datasets.</p>
          </Section>
          <Section title="How Your Data Is Processed">
            <p>All file processing runs in a Web Worker inside your browser. Files never leave your computer for BYOK operations.</p>
            <p>Credit-based operations pass data through our servers in transit only — like data through a pipe, not stored.</p>
            <p>Generated outputs are delivered to your browser and saved to your local storage only. Nothing is retained on our servers.</p>
          </Section>
          <Section title="Third Parties">
            <p><strong>Stripe</strong> — handles all payment processing. Subject to Stripe&apos;s privacy policy.</p>
            <p><strong>Vercel</strong> — hosts our application and maintains standard server logs.</p>
            <p><strong>AI providers</strong> (OpenAI, Anthropic, etc.) — receive your data only when you initiate a generation request using BYOK. Subject to each provider&apos;s privacy policy.</p>
          </Section>
          <Section title="Contact">
            <p>For privacy-related questions contact us at:</p>
            <p style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--accent)" }}>privacy@tokenlift.app</p>
          </Section>
        </div>
      </div>
    </div>
  );
}
