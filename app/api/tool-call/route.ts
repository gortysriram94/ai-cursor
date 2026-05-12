// app/api/tool-call/route.ts
// Client polls this to get pending tool calls for a node
import { NextRequest, NextResponse } from "next/server";
import { getToolCall } from "@/lib/tool-call";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const nodeId = searchParams.get("nodeId");

  if (!nodeId) {
    return NextResponse.json({ error: "Missing nodeId" }, { status: 400 });
  }

  const toolCall = getToolCall(nodeId);
  if (!toolCall) {
    return NextResponse.json({ hasToolCall: false });
  }

  return NextResponse.json({ hasToolCall: true, ...toolCall });
}