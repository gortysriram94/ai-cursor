import { decomposeTask, singleNodePlan } from "@/lib/task-decomposer";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // DEBUG: Check env vars at runtime
  console.log("[API/decompose] NVIDIA_API_KEY length:", process.env.NVIDIA_API_KEY?.length ?? 0);
  console.log("[API/decompose] ANTHROPIC_API_KEY length:", process.env.ANTHROPIC_API_KEY?.length ?? 0);
  
  try {
    const { task, location } = await req.json();

    if (!task || typeof task !== "string") {
      return NextResponse.json({ error: "Task is required" }, { status: 400 });
    }

    try {
      const plan = await decomposeTask(task, location);
      return NextResponse.json(plan);
    } catch {
      // Decomposition failed — return a working single-node plan instead of 500
      return NextResponse.json(singleNodePlan(task));
    }
  } catch (error) {
    console.error(`[API/decompose] Error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to decompose task" },
      { status: 500 }
    );
  }
}
