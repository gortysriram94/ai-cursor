// app/api/agent/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Lean API — two actions only:
//
//   plan        → Kimi produces breadcrumb steps for tool/AgentTimeline
//   orchestrate → lightweight ask / plan streaming for canvas nodes
//                 (agent mode now goes through /api/workflow)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { kimiComplete, kimiStream, kimiCost } from "@/lib/agents/kimi-server";
import { pushAgentMessage } from "@/lib/agent-message-queue";
import { buildIdentity } from "@/lib/agent-identity";

export const runtime = "nodejs";

// ── Inject user message into a running agent ─────────────────────────────────
export async function GET(req: NextRequest) {
  const nodeId  = req.nextUrl.searchParams.get("nodeId");
  const message = req.nextUrl.searchParams.get("message");
  if (!nodeId || !message) return NextResponse.json({ error: "Missing params" }, { status: 400 });
  pushAgentMessage(nodeId, decodeURIComponent(message));
  return NextResponse.json({ ok: true });
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface PlanRequest {
  action:        "plan";
  userMessage:   string;
  masterContext: string;
  vertical:      string;
  customerId?:   string;
}

interface OrchestrateRequest {
  action:      "orchestrate";
  task:          string;
  nodeId:        string;
  mode?:         "ask" | "plan";
  url?:          string;
  pageText?:     string;
  location?:     string;
  customerId?:   string;
  systemPrompt?: string;
}

type AgentRequest = PlanRequest | OrchestrateRequest;

// ── Entry ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AgentRequest;

    if (body.action === "plan")        return handlePlan(body as PlanRequest);
    if (body.action === "orchestrate") return handleOrchestrate(req, body as OrchestrateRequest);

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// ── PLAN — Kimi breadcrumb generator (tool page only) ─────────────────────────
async function handlePlan(body: PlanRequest): Promise<NextResponse> {
  const { text } = await kimiComplete(
    buildPlannerPrompt(body.vertical),
    [{ role: "user", content: `${body.masterContext}\n\n[USER REQUEST]\n${body.userMessage}` }],
    2048,
  );

  let breadcrumbs: unknown[];
  try {
    const match = text.match(/```json\n([\s\S]+?)\n```/) ?? text.match(/\[[\s\S]+\]/);
    breadcrumbs = JSON.parse(match ? match[1] ?? match[0] : text);
  } catch {
    breadcrumbs = [{
      id: "crumb_1", action: "Generate analysis", tool: "ask_claude",
      reasoning: text.slice(0, 200), estimatedCost: 0.01, params: {},
    }];
  }

  return NextResponse.json({ breadcrumbs });
}

// ── ORCHESTRATE — ask / plan streaming via Kimi ───────────────────────────────
// "agent" mode is no longer handled here — it routes through /api/workflow.
async function handleOrchestrate(_req: NextRequest, body: OrchestrateRequest): Promise<Response> {
  const enc  = new TextEncoder();
  const mode = body.mode ?? "ask";

  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (ev: object) => {
        try { ctrl.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`)); } catch {}
      };

      try {
        const locNote  = body.location ? ` User is in ${body.location}.` : "";
        const context  = body.pageText ? `Context:\n${body.pageText.slice(0, 3000)}\n\n` : "";
        const userMsg  = `${context}${body.task}`;

        const systemPrompt = body.systemPrompt
          ?? (mode === "plan"
            ? buildIdentity() + "\n\nCreate a clear, numbered, step-by-step plan for the user. Use markdown."
            : buildIdentity() + `\n\nAnswer clearly and concisely. Use markdown.${locNote}`);

        send({ type: "agent_start", nodeId: body.nodeId, agent: "kimi", text: `[${mode.toUpperCase()}] ${body.task}` });

        let text = ""; let tokIn = 0, tokOut = 0;
        for await (const chunk of kimiStream(systemPrompt, [{ role: "user", content: userMsg }])) {
          text += chunk;
          send({ type: "agent_text", nodeId: body.nodeId, text: chunk });
        }
        tokIn  = Math.ceil(userMsg.length / 4);
        tokOut = Math.ceil(text.length   / 4);
        const cost = kimiCost(tokIn, tokOut);
        send({ type: "agent_tokens", nodeId: body.nodeId, input_tokens: tokIn, output_tokens: tokOut, cache_read_tokens: 0, cost_usd: cost });
        send({ type: "agent_done",   nodeId: body.nodeId, steps: 1, input_tokens: tokIn, output_tokens: tokOut, cache_read_tokens: 0, cost_usd: cost });

      } catch (e: unknown) {
        send({ type: "agent_error", nodeId: body.nodeId, error: e instanceof Error ? e.message : "Error" });
      } finally {
        ctrl.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ── Planner prompt ────────────────────────────────────────────────────────────
function buildPlannerPrompt(vertical: string): string {
  return `You are an AI agent task planner for the ${vertical} domain.

For CONVERSATIONAL messages → ONE breadcrumb with ask_claude
For TASK-ORIENTED messages → 3-5 atomic breadcrumbs

Respond with JSON array only:
[{ "id": "crumb_1", "action": "...", "tool": "ask_claude|web_search|orchestrate", "reasoning": "...", "estimatedCost": 0.05, "params": {} }]`;
}
