// app/api/tool-result/route.ts
// Client POSTs tool execution results here
import { NextRequest, NextResponse } from "next/server";
import { resolveToolResult } from "@/lib/executor/tool-executor";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nodeId, requestId, result } = body;

    if (!nodeId || !requestId) {
      return NextResponse.json({ error: "Missing nodeId or requestId" }, { status: 400 });
    }

    resolveToolResult(nodeId, requestId, result || "");
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}