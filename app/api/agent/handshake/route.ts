import { NextRequest, NextResponse } from "next/server";
import { setAgent } from "@/lib/agent-store";

export async function POST(req: NextRequest) {
  let body: { agentId?: string; version?: string; capabilities?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { agentId, version = "unknown", capabilities = [] } = body;
  if (!agentId) {
    return NextResponse.json({ error: "agentId required" }, { status: 400 });
  }

  const sessionId = `ses_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now       = Date.now();

  setAgent({
    agentId,
    sessionId,
    version,
    capabilities,
    lastHeartbeat:     now,
    connectedAt:       now,
    heartbeatInterval: 5_000,
  });

  console.log(`[Agent] Handshake: ${agentId} v${version} → session ${sessionId}`);

  return NextResponse.json({
    sessionId,
    heartbeatInterval: 5_000,
    assignedRole: "executor",
    features: {
      cdp:       true,
      streaming: true,
    },
  });
}
