"use client";

import { useState, useEffect, useRef } from "react";

// ── Data ─────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: "⌨",
    title: "Alt+A anywhere",
    body: "Works in Gmail, Notion, Slack, Chrome, VS Code — any window. No copy-paste, no tab switching.",
  },
  {
    icon: "◎",
    title: "Context-aware by market",
    body: "Detects your vertical automatically — sales, support, dev, real estate, trading — and adjusts prompts accordingly.",
  },
  {
    icon: "⊞",
    title: "Form fill + auto-submit",
    body: "Scans any form, pre-fills every field with AI suggestions you can edit, then submits in one click.",
  },
  {
    icon: "▤",
    title: "Scroll minimap",
    body: "VS Code-style section rail on any page. See the structure, click to jump. Alt+[ / Alt+] to navigate.",
  },
  {
    icon: "✦",
    title: "Learns your style",
    body: "Every Insert teaches the AI your voice. After a few uses it writes like you, not like a template.",
  },
  {
    icon: "⚙",
    title: "Local + cloud AI",
    body: "Runs on your machine with Ollama. Upgrade to NVIDIA cloud for faster responses. No data leaves by default.",
  },
];

const MARKETS = [
  { label: "Sales",       desc: "Replies, follow-ups, objection handling" },
  { label: "Support",     desc: "Empathetic responses, escalation summaries" },
  { label: "Developer",   desc: "Code review, explain, document" },
  { label: "Real Estate", desc: "Listings, client summaries, lead replies" },
  { label: "Finance",     desc: "Variance analysis, client reports" },
  { label: "Trading",     desc: "Sentiment, thesis, market impact" },
  { label: "Research",    desc: "Paper summaries, methodology review" },
  { label: "Content",     desc: "Captions, threads, repurpose" },
];

const STEPS = [
  { n: "01", title: "Press Alt+A on any text", body: "Select text or just focus any input. AI Cursor reads the context instantly." },
  { n: "02", title: "Pick an action or ask", body: "Reply, summarize, improve, explain — or type anything you want." },
  { n: "03", title: "Insert, copy, or submit", body: "Result goes directly back into the app you're working in." },
];

const DEMO_ACTIONS = [
  {
    key: "Reply",
    icon: "💬",
    input: "Hey, are you available for a call this week to discuss the proposal?",
    output: "Absolutely — I have Thursday afternoon and Friday morning open. What works better for you?",
  },
  {
    key: "Summarize",
    icon: "📝",
    input: "Long email thread about Q3 pipeline review, quota attainment, and forecast adjustments…",
    output: "Q3 pipeline is 23% below target. Team agreed to focus on 8 deals in final stage. Forecast revised to $1.4M.",
  },
  {
    key: "Improve",
    icon: "✨",
    input: "Following up to check if you had a chance to look at the document I sent.",
    output: "Just circling back on the document — happy to walk you through the key points if that would help.",
  },
];


// ── Typing animation ──────────────────────────────────────────────────────────

function TypeWriter({ text, speed = 18 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("");
  const idx = useRef(0);
  useEffect(() => {
    idx.current = 0;
    setDisplayed("");
    const iv = setInterval(() => {
      if (idx.current < text.length) {
        setDisplayed(text.slice(0, idx.current + 1));
        idx.current++;
      } else {
        clearInterval(iv);
      }
    }, speed);
    return () => clearInterval(iv);
  }, [text, speed]);
  return <>{displayed}<span className="animate-pulse">▌</span></>;
}

// ── Live demo ─────────────────────────────────────────────────────────────────

function OverlayDemo() {
  const [active, setActive]   = useState(0);
  const [phase, setPhase]     = useState<"idle" | "typing" | "done">("idle");
  const [visible, setVisible] = useState(true);
  const [flash, setFlash]     = useState(false);
  const nextIdx = useRef(0);
  const action  = DEMO_ACTIONS[active];

  // Auto-advance typing → done
  useEffect(() => {
    if (phase !== "typing") return;
    const t = setTimeout(() => setPhase("done"), action.output.length * 16 + 200);
    return () => clearTimeout(t);
  }, [phase, action.output.length]);

  // Alt+A / Option+A keyboard handler.
  // Uses only functional state setters and refs — no stale closures.
  // Mounted once (empty dep array); all state reads go through refs.
  const phaseRef   = useRef(phase);
  const visibleRef = useRef(visible);
  useEffect(() => { phaseRef.current   = phase;   }, [phase]);
  useEffect(() => { visibleRef.current = visible; }, [visible]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Alt+A on Windows, Option+A on macOS (event.code is layout-independent)
      if (!e.altKey || e.code !== "KeyA") return;
      e.preventDefault();

      if (phaseRef.current === "typing") return; // don't interrupt

      const idx = nextIdx.current % DEMO_ACTIONS.length;
      nextIdx.current++;

      setFlash(true);
      setVisible(true);
      setActive(idx);
      setPhase("typing");
      setTimeout(() => setFlash(false), 500);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // empty — uses refs for current state, no stale closures

  return (
    <div className="relative mx-auto w-full max-w-[420px] select-none">
      {/* ambient glow */}
      <div className="pointer-events-none absolute -inset-8 rounded-3xl bg-[radial-gradient(ellipse_at_center,rgba(218,119,86,0.12),transparent_70%)]" />

      {/* hint badge — shown when panel is dismissed */}
      {!visible && (
        <div
          className="mx-auto w-fit rounded-full border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-xs text-[var(--text-dim)] cursor-pointer hover:border-[var(--accent)] transition-colors"
          onClick={() => { const idx = nextIdx.current % DEMO_ACTIONS.length; nextIdx.current++; setVisible(true); setActive(idx); setPhase("typing"); }}
        >
          Press{" "}
          <kbd className="font-mono">Alt+A</kbd>
          {" "}to reopen ↑
        </div>
      )}

      {/* panel */}
      <div
        className={`transition-all duration-150 ${
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none h-0 overflow-hidden"
        }`}
      >
        <div className={`relative rounded-2xl border bg-[#0d0b09] shadow-[0_32px_80px_rgba(0,0,0,0.8)] transition-all duration-100 ${
          flash ? "border-[var(--accent)] shadow-[0_0_24px_rgba(218,119,86,0.25)]" : "border-white/[0.08]"
        }`}>

          {/* title bar */}
          <div className="flex items-center gap-2 border-b border-white/[0.05] px-4 py-3">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
            </span>
            <span className="text-xs text-[#555] font-mono">AI Cursor</span>
            <span className="ml-auto flex items-center gap-2">
              {flash && <span className="text-[10px] text-[var(--accent)] animate-pulse">Alt+A</span>}
              {/* dismiss button */}
              <button
                onClick={() => { setVisible(false); setPhase("idle"); }}
                className="text-[#333] hover:text-[#888] transition-colors text-[11px] px-1"
              >
                ✕
              </button>
            </span>
          </div>

          <div className="p-4 space-y-3">
            {/* input preview */}
            <div className="rounded-lg bg-[#151210] border border-white/[0.04] px-3 py-2.5">
              <p className="text-[11px] text-[#444] mb-1.5 font-mono">context</p>
              <p className="text-sm text-[#888] leading-relaxed line-clamp-2">{action.input}</p>
            </div>

            {/* action pills */}
            <div className="flex gap-1.5">
              {DEMO_ACTIONS.map((a, i) => (
                <button
                  key={a.key}
                  onClick={() => { if (phaseRef.current !== "typing") { setActive(i); setPhase("typing"); } }}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all duration-150 ${
                    active === i && phase !== "idle"
                      ? "bg-[var(--accent)] text-white shadow-lg"
                      : "bg-[#1a1714] text-[#555] hover:bg-[#221e1a] hover:text-[#999]"
                  }`}
                >
                  {a.icon} {a.key}
                </button>
              ))}
            </div>

            {/* result */}
            <div className={`rounded-lg border bg-[#111009] transition-all duration-200 ${
              phase === "idle" ? "border-transparent opacity-0 h-0 overflow-hidden py-0" : "border-white/[0.05] opacity-100 px-3 py-3"
            }`}>
              {phase === "typing" && (
                <p className="text-sm leading-relaxed text-[#c8c8c8]">
                  <TypeWriter text={action.output} />
                </p>
              )}
              {phase === "done" && (
                <>
                  <p className="text-sm leading-relaxed text-[#c8c8c8]">{action.output}</p>
                  <div className="mt-2.5 flex gap-1.5">
                    {["Copy", "Insert ↵", "Edit"].map(label => (
                      <button key={label} className="rounded px-2 py-1 text-[11px] text-[#444] hover:text-[#888] hover:bg-white/[0.03] transition-colors">
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-5 text-center text-xs text-[var(--muted)]">
        Try pressing{" "}
        <kbd className="rounded border border-[var(--border)] bg-[var(--panel)] px-1.5 py-0.5 font-mono text-[10px]">Alt+A</kbd>
        {" "}right now ·{" "}
        <kbd className="rounded border border-[var(--border)] bg-[var(--panel)] px-1.5 py-0.5 font-mono text-[10px]">Option+A</kbd>
        {" "}on Mac
      </p>
    </div>
  );
}

// ── Download button ───────────────────────────────────────────────────────────

const DL_ICON = (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

function PlatformBtn({
  label, icon, href, size = "lg", className = ""
}: {
  label: string;
  icon: React.ReactNode;
  href: string;
  size?: "lg" | "sm";
  className?: string;
}) {
  const [dl, setDl] = useState(false);
  const base = size === "lg"
    ? "rounded-xl px-7 py-3.5 text-sm font-semibold"
    : "rounded-lg px-4 py-2.5 text-sm font-medium";

  function handleClick() {
    setDl(true);
    // Reset after 6 s — enough time for the browser download dialog to appear
    setTimeout(() => setDl(false), 6000);
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      className={`${base} inline-flex items-center gap-2 bg-[var(--accent)] text-white shadow-lg hover:bg-[var(--accent-dim)] active:scale-95 transition-all ${className}`}
    >
      {dl ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white shrink-0" />
          Downloading…
        </>
      ) : (
        <>
          {icon}
          {DL_ICON}
          {label}
        </>
      )}
    </a>
  );
}

// Windows logo (simple SVG)
const WIN_ICON = <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>;

// Apple logo (simple SVG)
const MAC_ICON = <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>;

function DownloadBtn({ size = "lg", className = "" }: { size?: "lg" | "sm"; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <PlatformBtn label="Windows" icon={WIN_ICON} href="/api/download?platform=windows" size={size} />
      <PlatformBtn label="macOS"   icon={MAC_ICON} href="/api/download?platform=macos"   size={size} />
    </div>
  );
}

// ── Pending download toast ────────────────────────────────────────────────────

function PendingToast() {
  const [show, setShow] = useState(false);
  const [os, setOs]     = useState("");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("download_pending");
    if (!p) return;
    setOs(p === "macos" ? "macOS" : "Windows");
    setShow(true);
    // Clean the URL without reloading
    window.history.replaceState({}, "", window.location.pathname + "#download");
    const t = setTimeout(() => setShow(false), 6000);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-5 py-3.5 shadow-xl">
      <span className="h-2 w-2 rounded-full bg-[var(--warn)] animate-pulse shrink-0" />
      <p className="text-sm text-[var(--text-dim)]">
        <span className="font-semibold text-[var(--text)]">{os} build</span>
        {" "}is being packaged — check back soon.
      </p>
      <button onClick={() => setShow(false)} className="ml-2 text-[var(--muted)] hover:text-[var(--text)] transition-colors text-xs">✕</button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[var(--surface)] text-[var(--text)] overflow-x-hidden">
      <PendingToast />

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-40" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
            </span>
            <span className="font-semibold tracking-tight">AI Cursor</span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
              v0.1 · Windows &amp; macOS
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a href="#features" className="hidden text-sm text-[var(--text-dim)] hover:text-[var(--text)] transition-colors md:block">
              Features
            </a>
            <a href="#download" className="hidden text-sm text-[var(--text-dim)] hover:text-[var(--text)] transition-colors md:block">
              Download
            </a>
            <DownloadBtn size="sm" />
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* background grid */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] bg-[size:48px_48px] opacity-30" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--surface)]" />

        <div className="relative mx-auto max-w-6xl px-6 pt-28 pb-24 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-4 py-1.5 text-xs text-[var(--text-dim)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)] animate-pulse" />
            Windows 10 / 11 &amp; macOS 13+
          </div>

          <h1 className="mx-auto max-w-4xl text-5xl font-semibold leading-[1.1] tracking-tight md:text-7xl">
            Your AI layer.{" "}
            <br className="hidden md:block" />
            <span className="text-[var(--accent)]">Every app.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg text-[var(--text-dim)] leading-relaxed">
            Press{" "}
            <kbd className="rounded border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 font-mono text-sm">Alt+A</kbd>
            {" "}anywhere on your desktop. Reply, fill forms, navigate pages, and write faster — without leaving the app you're in.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <DownloadBtn size="lg" />
            <a
              href="#demo"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-7 py-3.5 text-sm font-medium text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--muted)] transition-colors"
            >
              See it live
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </a>
          </div>

          <p className="mt-3 text-xs text-[var(--muted)]">
            Free · No account needed · Windows &amp; macOS
          </p>
        </div>
      </section>

      {/* ── Live demo ───────────────────────────────────────────────────────── */}
      <section id="demo" className="mx-auto max-w-6xl px-6 pb-28">
        <OverlayDemo />
      </section>

      {/* ── Problem / Fix ───────────────────────────────────────────────────── */}
      <section className="border-y border-[var(--border)] bg-[var(--panel)]">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)] mb-5">The old way</p>
          <p className="text-xl text-[var(--text-dim)] leading-relaxed mb-12">
            Open ChatGPT tab. Paste your email. Wait. Copy the reply. Switch back. Paste. Every. Single. Time.
          </p>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)] mb-5">The AI Cursor way</p>
          <p className="text-2xl font-medium leading-relaxed">
            Highlight.{" "}
            <kbd className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-0.5 font-mono text-lg">Alt+A</kbd>
            .{" "}
            Click.{" "}
            <span className="text-[var(--accent)]">Done in 4 seconds.</span>
          </p>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-28">
        <p className="mb-4 text-center text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
          Everything included
        </p>
        <h2 className="mb-16 text-center text-3xl font-semibold tracking-tight md:text-4xl">
          Not just AI chat.<br />
          <span className="text-[var(--text-dim)]">A complete desktop intelligence layer.</span>
        </h2>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon, title, body }) => (
            <div
              key={title}
              className="group rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-7 hover:border-[var(--muted)] transition-colors"
            >
              <span className="text-2xl">{icon}</span>
              <h3 className="mt-3 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-[var(--text-dim)] leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────────── */}
      <section className="border-y border-[var(--border)] bg-[var(--panel)]">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <p className="mb-16 text-center text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
            How it works
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {STEPS.map(({ n, title, body }) => (
              <div key={n} className="relative">
                <div className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel-2)]">
                  <span className="font-mono text-xs text-[var(--muted)]">{n}</span>
                </div>
                {n !== "03" && (
                  <div className="absolute top-4 left-8 hidden h-px w-[calc(100%-2rem)] border-t border-dashed border-[var(--border)] md:block" />
                )}
                <h3 className="text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-[var(--text-dim)] leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Market contexts ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <p className="mb-4 text-center text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
          Built for your work
        </p>
        <h2 className="mb-12 text-center text-3xl font-semibold tracking-tight">
          Context-aware across{" "}
          <span className="text-[var(--accent)]">every vertical</span>
        </h2>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {MARKETS.map(({ label, desc }) => (
            <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-5 py-4">
              <p className="text-sm font-semibold">{label}</p>
              <p className="mt-1 text-xs text-[var(--muted)] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Privacy ──────────────────────────────────────────────────────────── */}
      <section className="border-y border-[var(--border)] bg-[var(--panel)]">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-12 md:grid-cols-2 items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)] mb-4">Privacy first</p>
              <h2 className="text-3xl font-semibold tracking-tight mb-4">
                Your data stays<br />
                <span className="text-[var(--accent)]">on your machine.</span>
              </h2>
              <p className="text-[var(--text-dim)] leading-relaxed">
                AI Cursor runs entirely locally. Style profiles, history, and preferences live in a folder on your PC.
                No analytics, no tracking, no cloud sync — unless you choose to add NVIDIA cloud for faster responses.
              </p>
            </div>
            <div className="grid gap-3">
              {[
                ["⊞", "Local model", "Runs Ollama locally — your text never leaves your machine"],
                ["◎", "No account", "Download and run. No sign-up, no email, no tracking"],
                ["✦", "Your files", "All data is plain JSON files you can inspect or delete anytime"],
              ].map(([icon, title, body]) => (
                <div key={title} className="flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
                  <span className="text-xl mt-0.5">{icon}</span>
                  <div>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="text-xs text-[var(--text-dim)] leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Download CTA ────────────────────────────────────────────────────── */}
      <section id="download" className="mx-auto max-w-6xl px-6 py-32 text-center">
        <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">
          Ready in 60 seconds.
        </h2>
        <p className="mt-4 text-lg text-[var(--text-dim)]">
          Download, run the installer, press Alt+A.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4">
          <DownloadBtn size="lg" className="shadow-[0_0_40px_rgba(218,119,86,0.2)]" />
          <p className="text-sm text-[var(--muted)]">
            Windows 10 / 11 &amp; macOS 13+ · x64 / Apple Silicon · ~45 MB · No Python required
          </p>
        </div>

        {/* install steps */}
        <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6 text-left">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)] mb-5">Installation</p>
          {[
            "Windows: run AIcursor-windows-setup.exe and click through the wizard. Mac: open the .dmg and drag AI Cursor to Applications.",
            "AI Cursor launches automatically and sits in your system tray — no window, no fuss.",
            "Press Alt+A anywhere (Option+A on Mac) on any text to start.",
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3 mb-4 last:mb-0">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--panel-2)] font-mono text-[10px] text-[var(--muted)] mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-[var(--text-dim)]">{step}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
              <span className="text-sm font-semibold">AI Cursor</span>
              <span className="text-xs text-[var(--muted)]">v0.1.0</span>
            </div>
            <div className="flex gap-6 text-xs text-[var(--muted)]">
              <a href="/privacy" className="hover:text-[var(--text-dim)] transition-colors">Privacy</a>
              <a href="/terms" className="hover:text-[var(--text-dim)] transition-colors">Terms</a>
            </div>
            <p className="text-xs text-[var(--muted)]">© 2025 AI Cursor</p>
          </div>
        </div>
      </footer>

    </main>
  );
}
