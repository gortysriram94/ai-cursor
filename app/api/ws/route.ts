export const runtime = "nodejs";
import { NextRequest } from "next/server";
import { nvidiaStream } from "@/lib/nvidia";

export async function GET(req: NextRequest) {
  const enc     = new TextEncoder();
  const message = req.nextUrl.searchParams.get("message") ?? "";
  const nodeId  = req.nextUrl.searchParams.get("nodeId")  ?? "";

  const body = new ReadableStream({
    async start(ctrl) {
      const send = (d: object) => {
        try { ctrl.enqueue(enc.encode(`data: ${JSON.stringify(d)}\n\n`)); } catch {}
      };
      try {
        send({ type: "start", nodeId });
        let inputTokens = 0; let outputTokens = 0;
        for await (const token of nvidiaStream(
          "You are a helpful AI assistant. Be concise and accurate.",
          [{ role: "user", content: message }],
          2048,
        )) {
          send({ type: "token", nodeId, token });
          outputTokens += Math.ceil(token.length / 4);
        }
        inputTokens = Math.ceil(message.length / 4);
        send({ type: "done", nodeId, inputTokens, outputTokens });
      } catch (e: unknown) {
        send({ type: "error", nodeId, error: e instanceof Error ? e.message : "Error" });
      } finally {
        ctrl.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}