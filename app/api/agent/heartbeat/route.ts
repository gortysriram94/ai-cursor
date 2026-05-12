import { NextRequest, NextResponse } from "next/server";
import { getAgent, updateAgent } from "@/lib/agent-store";

export async function POST(req: NextRequest) {
  let body: { agentId?: string; sessionId?: string; status?: string; activeTab?: string; currentTask?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { agentId, sessionId, activeTab, currentTask } = body;

  const agent = getAgent();

  // Unknown session → tell agent to re-handshake
  if (!agent || agent.sessionId !== sessionId || agent.agentId !== agentId) {
    return NextResponse.json({ ok: false, rehandshake: true }, { status: 401 });
  }

  updateAgent({
    lastHeartbeat: Date.now(),
    activeTab:     activeTab   ?? agent.activeTab,
    currentTask:   currentTask ?? agent.currentTask,
  });

  return NextResponse.json({ ok: true });
}
