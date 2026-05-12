import { NextResponse } from "next/server";
import { getAgent, getAgentStatus } from "@/lib/agent-store";
import { extensionSessions } from "@/lib/browser-sse";

export async function GET() {
  const agent  = getAgent();
  const status = getAgentStatus();

  return NextResponse.json({
    ok:               true,
    status,
    electronOnline:   !!agent,
    extensionOnline:  extensionSessions.size > 0,
    agent: agent ? {
      agentId:       agent.agentId,
      sessionId:     agent.sessionId,
      version:       agent.version,
      status,
      lastHeartbeat: agent.lastHeartbeat,
      connectedAt:   agent.connectedAt,
      activeTab:     agent.activeTab   ?? null,
      currentTask:   agent.currentTask ?? null,
    } : null,
  });
}
