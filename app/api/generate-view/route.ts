// app/api/generate-view/route.ts
// Streams a self-contained HTML/JS/CSS artifact for the canvas ViewCard.

import { NextRequest } from "next/server";
import { nvidiaStream } from "@/lib/nvidia";

export const runtime = "nodejs";

const SYSTEM = `You are an expert frontend developer. Generate a single, complete, self-contained HTML file.

RULES:
- Output ONLY raw HTML — no markdown, no code fences, no explanation
- Start with <!DOCTYPE html> and end with </html>
- Use CDN imports for all libraries (no local files)
- Dark theme by default: background #0f0f0f, text #f0f0f0, accents in blue/purple
- Fully interactive and functional — make it feel real
- Include realistic sample data, not placeholders like "Lorem ipsum"
- Responsive — works at any container width (use %, vw, flexbox/grid)
- Beautiful — polished UI, smooth animations, attention to detail

AVAILABLE CDN LIBRARIES (use these, don't make up URLs):
- Chart.js:  https://cdn.jsdelivr.net/npm/chart.js@4
- D3.js:     https://d3js.org/d3.v7.min.js
- Alpine.js: https://unpkg.com/alpinejs@3/dist/cdn.min.js
- Marked:    https://cdn.jsdelivr.net/npm/marked/marked.min.js

OUTPUT FORMAT: Raw HTML only. First character must be < and last must be >.`;

export async function POST(req: NextRequest) {
  const { description, context, data } = await req.json() as {
    description: string;
    context?: string;
    data?: unknown;
  };

  const userContent = [
    context     ? `Page context:\n${context.slice(0, 2000)}\n\n` : "",
    data        ? `Data to use:\n${JSON.stringify(data).slice(0, 2000)}\n\n` : "",
    `Build: ${description}`,
  ].join("");

  const enc = new TextEncoder();
  const readable = new ReadableStream({
    async start(ctrl) {
      const send = (obj: object) => {
        try { ctrl.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {}
      };
      let html = "";
      try {
        for await (const token of nvidiaStream(SYSTEM, [{ role: "user", content: userContent }], 8192)) {
          html += token;
          send({ token });
        }
        const clean = html.replace(/^```html\s*/i, "").replace(/\s*```\s*$/, "").trim();
        const inputTokens  = Math.ceil(userContent.length / 4);
        const outputTokens = Math.ceil(html.length / 4);
        const cost_usd = (inputTokens / 1e6) * 0.50 + (outputTokens / 1e6) * 0.50;
        send({ done: true, html: clean, cost_usd });
      } catch (e) {
        send({ error: e instanceof Error ? e.message : "Generation failed" });
      } finally {
        ctrl.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
