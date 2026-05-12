// app/api/agent/screenshot/route.ts
// Asks the connected Electron agent to capture a JPEG screenshot via CDP
// and returns it as a base64 data URI. Used by the canvas to mirror the
// Electron browser in the BrowserViewNode screenshot mode.

import { NextRequest, NextResponse } from "next/server";
import { getAgent }              from "@/lib/agent-store";
import { sendToExtensionById }   from "@/lib/browser-sse";
import { waitForToolResult }     from "@/lib/executor/tool-executor";

export const runtime = "nodejs";

function race<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), ms)),
  ]);
}

export async function GET(req: NextRequest) {
  const nodeId = req.nextUrl.searchParams.get("nodeId") ?? "agent_shot";

  const agent = getAgent();
  if (!agent) {
    return NextResponse.json({ ok: false, error: "No agent connected" }, { status: 404 });
  }

  const reqId = `shot_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

  sendToExtensionById(agent.agentId, {
    type:      "browser_screenshot",
    requestId: reqId,
    nodeId,
  } as any);

  try {
    const raw    = await race(waitForToolResult(nodeId, reqId, 8_000), 8_500);
    const result = JSON.parse(raw);
    if (result.ok && result.data) {
      return NextResponse.json({
        ok:         true,
        screenshot: `data:image/jpeg;base64,${result.data}`,
      });
    }
    return NextResponse.json({ ok: false, error: "No data from agent" });
  } catch {
    return NextResponse.json({ ok: false, error: "Screenshot timed out" });
  }
}
