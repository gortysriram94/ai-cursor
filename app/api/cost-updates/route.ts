// app/api/cost-updates/route.ts
// Server-Sent Events endpoint for real-time cost tracking

import { NextRequest } from 'next/server';
import { costStreams } from '@/lib/costs';

export async function GET(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get('taskId');

  if (!taskId) {
    return new Response('Missing taskId', { status: 400 });
  }

  const stream = new ReadableStream({
    start(controller) {
      costStreams.set(taskId, {
        controller,
        visionCalls: 0,
        screenshots: 0,
        actualCost: 0
      });

      const data = JSON.stringify({
        visionCalls: 0,
        screenshots: 0,
        actualCost: 0,
        estimatedTotal: 0.12
      });

      controller.enqueue(`data: ${data}\n\n`);

      const keepAlive = setInterval(() => {
        controller.enqueue(': keepalive\n\n');
      }, 30000);

      req.signal.addEventListener('abort', () => {
        clearInterval(keepAlive);
        costStreams.delete(taskId);
        try { controller.close(); } catch { /* already closed */ }
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}