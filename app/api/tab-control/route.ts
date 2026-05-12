// app/api/tab-control/route.ts
// Pushes tab and window control commands to the connected Electron agent.
// These map 1-to-1 to the SSE handlers registered in electron-agent/main.js.

import { NextRequest, NextResponse } from "next/server";
import { getAgent }            from "@/lib/agent-store";
import { sendToExtensionById } from "@/lib/browser-sse";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set([
  "browser_navigate",
  "browser_open_tab",
  "browser_close_tab",
  "browser_switch_tab",
  "browser_window_show",
  "browser_window_hide",
]);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const type = body.type as string | undefined;

  if (!type || !ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: "Invalid command type" }, { status: 400 });
  }

  const agent = getAgent();
  if (!agent) {
    return NextResponse.json({ error: "Electron agent not connected" }, { status: 503 });
  }

  // Attach a nodeId so the result can be routed back if the caller waits for one.
  // For fire-and-forget tab/window commands, nodeId is not strictly needed.
  const nodeId    = (body.nodeId as string) ?? "tab_ctrl";
  const requestId = (body.requestId as string) ?? `tc_${Date.now()}`;

  sendToExtensionById(agent.agentId, {
    type,
    nodeId,
    requestId,
    // Forward any extra fields (url, tabId) the caller passed
    ...Object.fromEntries(
      Object.entries(body).filter(([k]) => !["type","nodeId","requestId"].includes(k))
    ),
  } as any);

  return NextResponse.json({ ok: true, requestId });
}
