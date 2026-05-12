// app/api/browser-preview/route.ts
// SSE stream for real-time browser screenshots from Chrome extension

import { NextRequest } from 'next/server';
import { previewStreams } from '@/lib/browser-preview';

// ── GET: canvas subscribes to screenshot stream ───────────────────────────────
export async function GET(req: NextRequest) {
  const taskId       = req.nextUrl.searchParams.get('taskId');
  const connectionId = req.nextUrl.searchParams.get('connectionId');
  const key          = taskId ?? connectionId;

  if (!key) return new Response('Missing taskId or connectionId', { status: 400 });

  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    start(controller) {
      previewStreams.set(key, { controller, encoder, lastScreenshot: null });

      // Send connected event
      controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ connected: true, timestamp: Date.now() })}\n\n`
      ));

      // Keep-alive ping every 25s
      const ping = setInterval(() => {
        try { controller.enqueue(encoder.encode(': ping\n\n')); }
        catch { clearInterval(ping); }
      }, 25000);

      req.signal.addEventListener('abort', () => {
        clearInterval(ping);
        previewStreams.delete(key);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ── POST: extension pushes screenshots and action events ──────────────────────
export async function POST(req: NextRequest) {
  try {
    const body         = await req.json();
    const connectionId = req.nextUrl.searchParams.get('connectionId') ?? body.connectionId;
    const taskId       = body.taskId;

    // Try both keys — extension uses connectionId, executor uses taskId
    const key    = taskId ?? connectionId;
    const stream = key ? previewStreams.get(key) : null;

    if (!stream) {
      return new Response(JSON.stringify({ ok: true, subscribers: 0 }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const targets = [stream];

    const payload = JSON.stringify({
      screenshot:  body.screenshot  ? `data:image/png;base64,${body.screenshot}` : null,
      url:         body.url         ?? null,
      action:      body.action      ?? null,
      coordinates: body.coordinates ?? null,
      status:      body.status      ?? 'active',
      timestamp:   Date.now(),
    });

    for (const s of targets) {
      if (body.screenshot) s.lastScreenshot = body.screenshot;
      try {
        s.controller.enqueue(s.encoder.encode(`data: ${payload}\n\n`));
      } catch (err) {
        console.warn('[BrowserPreview] Failed to push to stream:', err);
      }
    }

    return new Response(JSON.stringify({ ok: true, subscribers: targets.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[BrowserPreview] POST error:', err);
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Callers (e.g. execute/route.ts) should import and use
// sendScreenshotToPreview() and completePreview() from '@/lib/browser-preview'