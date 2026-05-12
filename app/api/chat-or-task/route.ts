// app/api/chat-or-task/route.ts

import { NextRequest, NextResponse } from "next/server";
import { nvidiaComplete } from "@/lib/nvidia";

export const runtime = "edge";

const TASK_KEYWORDS = ["write", "create", "build", "make", "generate", "draft", "analyze", "code"];
const CONV_KEYWORDS = ["hello", "hi", "hey", "thanks", "what can you"];

function quickClassify(msg: string): "task" | "conversation" | "unknown" {
  const lower = msg.toLowerCase();
  if (CONV_KEYWORDS.some(k => lower.startsWith(k))) return "conversation";
  if (TASK_KEYWORDS.some(k => lower.includes(k)))   return "task";
  return "unknown";
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.NVIDIA_API_KEY) {
      return NextResponse.json({ error: "NVIDIA_API_KEY not configured" }, { status: 500 });
    }

    const { message, conversationHistory = [] } = await req.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }

    let type = quickClassify(message);

    if (type === "unknown") {
      const { text } = await nvidiaComplete(
        "Reply only: task or conversation",
        [{ role: "user", content: `"${message}" - task or conversation?` }],
        20,
      );
      type = text.toLowerCase().includes("task") ? "task" : "conversation";
    }

    if (type === "task") {
      const { text: planText } = await nvidiaComplete(
        `Return JSON only:
{"taskName":"Brief title","goal":"One sentence","slaveNodes":[{"id":"slave_1","name":"Step","description":"What"}]}`,
        [{ role: "user", content: message }],
        1024,
      );
      const match = planText.match(/\{[\s\S]*\}/);
      const json  = match ? JSON.parse(match[0]) : {};
      return NextResponse.json({
        type: "task",
        taskName:   json.taskName   || "Task",
        goal:       json.goal       || message,
        slaveNodes: json.slaveNodes || [{ id: "slave_1", name: "Execute", description: message }],
      });
    }

    const { text } = await nvidiaComplete(
      "You are Arya — Pushpa's AI browser agent. Be helpful and concise.",
      [
        ...conversationHistory.slice(-4),
        { role: "user", content: message },
      ],
      2048,
    );
    return NextResponse.json({ type: "conversation", response: text });

  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
