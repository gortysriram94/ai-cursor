// app/api/agent/inject-cookies/route.ts
// Receives cookies from the canvas (read from the user's real Chrome via extension)
// and pushes them to the Electron agent via SSE so it can inject them into its
// dedicated Chrome window — letting the user stay logged in without re-authenticating.

import { NextRequest, NextResponse } from "next/server";
import { getAgent }                  from "@/lib/agent-store";
import { sendToExtensionById }       from "@/lib/browser-sse";

export async function POST(req: NextRequest) {
  const agent = getAgent();
  if (!agent) {
    return NextResponse.json({ error: "No agent connected" }, { status: 404 });
  }

  let body: { cookies?: unknown[]; nodeId?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const cookies = body.cookies ?? [];
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return NextResponse.json({ ok: true, injected: 0 });
  }

  // Forward to the agent via its SSE channel
  sendToExtensionById(agent.agentId, {
    type:    "browser_inject_cookies",
    payload: { cookies },
  } as any);

  console.log(`[Agent] Cookie sync: pushing ${cookies.length} cookies to agent ${agent.agentId}`);
  return NextResponse.json({ ok: true, queued: cookies.length });
}
