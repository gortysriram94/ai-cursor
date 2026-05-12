// app/api/context/route.ts
// Query active execution contexts — read-only observability endpoint.
// Used by the canvas health check and debugging tools.
// Does NOT mutate context — all mutations happen inside the workflow route.

import { NextRequest, NextResponse }              from "next/server";
import {
  executionContexts, getContext, getContextByNodeId,
} from "@/lib/execution-context";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get("taskId");
  const nodeId = req.nextUrl.searchParams.get("nodeId");

  if (taskId) {
    const ctx = getContext(taskId);
    return NextResponse.json(ctx ?? null, { status: ctx ? 200 : 404 });
  }

  if (nodeId) {
    const ctx = getContextByNodeId(nodeId);
    return NextResponse.json(ctx ?? null, { status: ctx ? 200 : 404 });
  }

  // Return all active contexts (for debugging / admin)
  return NextResponse.json(Array.from(executionContexts.values()));
}
