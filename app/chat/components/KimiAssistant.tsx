"use client";
// KimiAssistant — floating Kimi K2 UI assistant.
// Context-aware: knows the canvas state, app features, and current activity.
// Guides users intuitively through workflows and answers app questions.

import React, { useState, useEffect, useRef, useCallback } from "react";

interface CanvasContext {
  nodeCount:      number;
  runningAgents:  number;
  nodeTypes:      string[];
  selectedKind?:  string;
  totalCost:      number;
  puterSignedIn:  boolean;
}

interface Msg { role: "user" | "assistant"; text: string; loading?: boolean; }

const APP_KNOWLEDGE = `
Pushpa is an AI financial advisor. Users ask about assets (crypto, stocks, products) and get buy/sell/hold recommendations with node-based analysis.

NODE TYPES:
- 📊 Analysis  — AI analysis node that fetches market data and generates recommendations
- 💬 Chat      — conversational node powered by Kimi K2 for financial Q&A
- 🤖 Agent     — autonomous AI agent that researches markets, news, and trends
- 🎨 View      — sandboxed iframe showing financial dashboards and charts

HOW TO START:
- Press ⌘K (or Ctrl+K) to open the command bar — type any financial question
- Examples: "Should I buy Bitcoin at $45,000?" or "Analyze AAPL stock"
- Kimi K2 analyses the asset and deploys research + analysis nodes
- Each node provides different insights (price data, news, technical analysis)
- Click + drag nodes to arrange them; Scroll/pinch to zoom

KEY SHORTCUTS:
- ⌘K — Command bar (ask any financial question)
- 1–9 — Focus nth agent/chat card
- ⌘D — Duplicate selected node
- ? — Keyboard shortcut help
- Space+drag — Pan canvas
- Backspace — Delete selected node

BUY/SELL/HOLD ANALYSIS:
- Real-time crypto prices via CoinGecko (FREE, no API key needed)
- Stock data via Yahoo Finance
- News sentiment analysis via Jina Read
- Confidence scores and risk assessment
- Entry/exit price suggestions

COMMON WORKFLOWS:
- "Should I buy Bitcoin?" → Analysis node + News research + Recommendation
- "Analyze AAPL" → Stock data + Market sentiment + Technical analysis
- "Research AI news" → 2 nodes: Search(Claude) + Synthesis(Kimi)
- "Write a blog post" → 1 Kimi node (pure writing, no tools needed)
- "Compare laptop prices" → 2 nodes: Browse(Claude) + Compare(Kimi)

CREDITS:
- Action credits pay for Claude tool use and web browsing
- Kimi K2 chat and analysis use zero credits (free via Puter.js)
- Trial: $0.99 for 100 credits · Starter: $15 for 500 · Pro: $45 for 2,000
`.trim();

function buildSystemPrompt(ctx: CanvasContext): string {
  const ctxStr = ctx.nodeCount === 0
    ? "The canvas is empty. No nodes have been created yet."
    : `Canvas has ${ctx.nodeCount} node(s): ${ctx.nodeTypes.join(", ")}. ${ctx.runningAgents > 0 ? `${ctx.runningAgents} agent(s) currently running.` : "No agents running."} ${ctx.totalCost > 0 ? `Session cost so far: $${ctx.totalCost.toFixed(4)}.` : ""} Kimi connected: ${ctx.puterSignedIn}.`;

  return `You are the BuyDecision AI UI assistant powered by Kimi K2. Your job is to help users use this app intuitively.

APP KNOWLEDGE:
${APP_KNOWLEDGE}

CURRENT CANVAS STATE:
${ctxStr}

PERSONALITY:
- Be concise and helpful (2-4 sentences max unless a detailed walkthrough is needed)
- Be proactive: if the canvas is empty, suggest starting points
- If an agent is running, comment on what's happening and what comes next
- Guide users step by step through complex workflows when asked
- Always suggest the keyboard shortcut if there's one for what they want to do
- You communicate for a user who wants things done fast — no fluff`;
}

async function kimiAssistantReply(
  systemPrompt: string,
  history: Msg[],
  userText: string,
  onChunk: (chunk: string) => void,
): Promise<void> {
  // Try Puter.js Kimi first (free)
  try {
    const puter = (window as any).puter;
    if (puter?.ai) {
      const msgs = [
        { role: "system",    content: systemPrompt },
        ...history.slice(-8).map(m => ({ role: m.role, content: m.text })),
        { role: "user",      content: userText },
      ];
      const models = ["kimi-k2", "moonshot/kimi-k2", "kimi-k2.5"];
      for (const model of models) {
        try {
          const stream = await puter.ai.chat(msgs, { model, stream: true });
          for await (const chunk of stream) {
            const text = chunk?.text ?? chunk?.message?.content ?? "";
            if (text) onChunk(text);
          }
          return;
        } catch { /* try next model */ }
      }
    }
  } catch { /* fall through */ }

  // Server fallback via /api/ws (Claude)
  const res = await fetch(`/api/ws?message=${encodeURIComponent(
    `[SYSTEM]\n${systemPrompt}\n\n[USER]\n${userText}`
  )}`);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const ev = JSON.parse(line.slice(6));
        if (ev.type === "token" && ev.token) onChunk(ev.token);
      } catch { /* skip */ }
    }
  }
}

interface Props {
  canvasContext: CanvasContext;
}

export default function KimiAssistant({ canvasContext }: Props) {
  const [open,    setOpen]    = useState(false);
  const [msgs,    setMsgs]    = useState<Msg[]>([]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [pulse,   setPulse]   = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  // Pulse when agents are running to signal Kimi can help
  useEffect(() => {
    if (canvasContext.runningAgents > 0) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 3000);
      return () => clearTimeout(t);
    }
  }, [canvasContext.runningAgents]);

  // Proactive greeting when canvas becomes empty
  useEffect(() => {
    if (canvasContext.nodeCount === 0 && msgs.length === 0 && !open) {
      // Wait a moment then show the greeting
      const t = setTimeout(() => {
        setMsgs([{
          role: "assistant",
          text: "👋 Hi! I'm Kimi K2 — your BuyDecision AI guide.\n\nPress **⌘K** to start a task, or ask me anything about how to use BuyDecision AI.",
        }]);
      }, 1500);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);

    const userMsg: Msg = { role: "user", text };
    const asstMsg: Msg = { role: "assistant", text: "", loading: true };
    setMsgs(prev => [...prev, userMsg, asstMsg]);

    const systemPrompt = buildSystemPrompt(canvasContext);
    let full = "";

    try {
      await kimiAssistantReply(systemPrompt, msgs, text, chunk => {
        full += chunk;
        setMsgs(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", text: full, loading: true };
          return updated;
        });
      });
    } catch (e) {
      full = `Sorry, I hit an error: ${e instanceof Error ? e.message : String(e)}`;
    }

    setMsgs(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = { role: "assistant", text: full, loading: false };
      return updated;
    });
    setLoading(false);
  }, [input, loading, msgs, canvasContext]);

  const SUGGESTIONS = canvasContext.nodeCount === 0
    ? ["How do I start a task?", "What are agent nodes?", "How does Kimi vs Claude work?"]
    : canvasContext.runningAgents > 0
    ? ["What's the agent doing?", "How do I approve tool calls?", "Can I stop the agent?"]
    : ["How do I add another node?", "What keyboard shortcuts exist?", "How do I export results?"];

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 100); }}
        title="Kimi K2 Assistant"
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 350,
          width: 48, height: 48, borderRadius: "50%",
          background: "linear-gradient(135deg, #22c55e, #16a34a)",
          border: "2px solid rgba(255,255,255,.2)",
          boxShadow: pulse
            ? "0 0 0 8px rgba(34,197,94,.2), 0 8px 32px rgba(0,0,0,.3)"
            : "0 4px 20px rgba(0,0,0,.35)",
          cursor: "pointer", fontSize: 22,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "box-shadow .3s ease",
          animation: pulse ? "tl-pulse-ring 1.5s ease-in-out 2" : "none",
        }}>
        🌙
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 84, right: 24, zIndex: 350,
          width: 360, height: 520,
          background: "var(--panel)", border: "1px solid var(--border)",
          borderRadius: 16, boxShadow: "0 16px 48px rgba(0,0,0,.5)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          animation: "tl-fadein .2s ease both",
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px", display: "flex", alignItems: "center", gap: 10,
            borderBottom: "1px solid var(--border)",
            background: "linear-gradient(135deg, color-mix(in srgb,#22c55e 8%,var(--panel)), var(--panel))",
          }}>
            <span style={{ fontSize: 18 }}>🌙</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Kimi K2 Assistant</div>
              <div style={{ fontSize: 10, color: "#22c55e", fontFamily: "monospace" }}>
                {canvasContext.puterSignedIn ? "● FREE · Puter connected" : "◦ Claude fallback"}
              </div>
            </div>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflow: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {msgs.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", marginTop: 20 }}>
                Ask me anything about BuyDecision AI
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "88%", padding: "8px 12px", borderRadius: 10,
                  fontSize: 12.5, lineHeight: 1.65,
                  background: m.role === "user" ? "var(--accent)" : "var(--surface)",
                  color: m.role === "user" ? "white" : "var(--text)",
                  border: m.role === "assistant" ? "1px solid var(--border)" : "none",
                  whiteSpace: "pre-wrap",
                }}>
                  {/* Simple markdown bold */}
                  {m.text.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
                    part.startsWith("**") && part.endsWith("**")
                      ? <strong key={j} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>
                      : part
                  )}
                  {m.loading && (
                    <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                      background: "var(--accent)", marginLeft: 4, verticalAlign: "middle",
                      animation: "tl-pulse .9s ease-in-out infinite" }} />
                  )}
                </div>
              </div>
            ))}

            {/* Suggestions */}
            {!loading && msgs.length < 3 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 4 }}>
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => { setInput(s); setTimeout(send, 50); }}
                    style={{
                      textAlign: "left", padding: "7px 10px", borderRadius: 8, fontSize: 11,
                      background: "var(--surface)", border: "1px solid var(--border)",
                      color: "var(--text)", cursor: "pointer", transition: "border-color .12s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask Kimi anything…"
              rows={1}
              disabled={loading}
              style={{
                flex: 1, border: "1px solid var(--border)", borderRadius: 8,
                padding: "7px 10px", background: "var(--surface)", color: "var(--text)",
                fontSize: 12, outline: "none", fontFamily: "inherit",
                resize: "none", lineHeight: 1.5, maxHeight: 80, overflowY: "auto",
                fieldSizing: "content" as any,
              }}
            />
            <button onClick={send} disabled={loading || !input.trim()}
              style={{
                background: input.trim() && !loading ? "#22c55e" : "var(--border)",
                color: "white", border: "none", borderRadius: 8, padding: "7px 14px",
                cursor: input.trim() && !loading ? "pointer" : "default",
                fontSize: 12, fontWeight: 700, alignSelf: "flex-end",
                transition: "background .15s",
              }}>↵</button>
          </div>
        </div>
      )}
    </>
  );
}

