import { NextResponse } from "next/server";
import { dequeueJob } from "@/lib/ai-job-queue";

export async function GET() {
  const job = dequeueJob();
  return NextResponse.json({ job: job ?? null });
}
