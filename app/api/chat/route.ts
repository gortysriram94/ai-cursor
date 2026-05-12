// app/api/chat/route.ts
// Simple conversational API with session management

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { addMessage, getRecentContext } from "@/lib/conversation-store";
import { nvidiaComplete } from "@/lib/nvidia";

// NOTE: Do NOT set runtime = "edge" — cookies() from next/headers requires Node.js runtime

const SYSTEM = `You are Arya — Pushpa's AI browser agent, acting as a conversational assistant.

Be helpful, conversational, and natural. You can:
- Search the web for current information
- Analyze data (ask user to upload if they mention it)
- Write content (blogs, code, emails, anything)
- Answer questions and have casual conversations

Be concise but thorough.`;

export async function POST(req: NextRequest) {
  try {
    if (!process.env.NVIDIA_API_KEY) {
      return NextResponse.json(
        { error: "NVIDIA_API_KEY not configured. Add it to .env.local" },
        { status: 500 }
      );
    }

    const session = await getSession();
    const userId  = session.userId;
    const body    = await req.json();

    let userMessage: string;
    if (body.message) {
      userMessage = body.message;
    } else if (Array.isArray(body.messages) && body.messages.length > 0) {
      userMessage = body.messages[body.messages.length - 1]?.content ?? "";
    } else {
      return NextResponse.json(
        { error: "Provide 'message' or 'messages'" },
        { status: 400 }
      );
    }

    if (!userMessage.trim()) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }

    const recentContext = getRecentContext(userId, 4);
    const messages = [
      ...recentContext,
      { role: "user" as const, content: userMessage },
    ];

    const { text: responseText } = await nvidiaComplete(SYSTEM, messages, 4096);

    addMessage(userId, "user",      userMessage);
    addMessage(userId, "assistant", responseText);

    return NextResponse.json({ response: responseText });
  } catch (err) {
    console.error("❌ Chat API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
