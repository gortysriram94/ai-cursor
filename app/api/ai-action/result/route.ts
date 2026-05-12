import { NextRequest, NextResponse } from "next/server";
import { resolveJob } from "@/lib/ai-job-queue";

export async function POST(req: NextRequest) {
  const { id, result } = await req.json() as { id: string; result: string };

  if (!id || !result) {
    return NextResponse.json({ ok: false, error: "Missing id or result" }, { status: 400 });
  }

  const ok = resolveJob(id, result);
  return NextResponse.json({ ok });
}
