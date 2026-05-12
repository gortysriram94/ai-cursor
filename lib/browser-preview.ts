// lib/browser-preview.ts
// Helpers for the browser-preview SSE stream.
// Lives outside the route to avoid Next.js type-checker treating
// them as route handlers (only GET/POST/etc. are valid route exports).

const previewStreams = new Map<string, {
  controller: ReadableStreamDefaultController;
  encoder:    TextEncoder;
  lastScreenshot: string | null;
}>();

export function sendScreenshotToPreview(
  taskId: string,
  screenshot: string,
  action?: { type: string; x?: number; y?: number }
) {
  const stream = previewStreams.get(taskId);
  if (!stream) return;

  const payload = JSON.stringify({
    screenshot:  `data:image/png;base64,${screenshot}`,
    action:      action?.type ?? null,
    coordinates: action?.x != null ? { x: action.x, y: action.y } : null,
    timestamp:   Date.now(),
  });

  try {
    stream.controller.enqueue(stream.encoder.encode(`data: ${payload}\n\n`));
    stream.lastScreenshot = screenshot;
  } catch (err) {
    console.error('[BrowserPreview] Failed to send screenshot:', err);
    previewStreams.delete(taskId);
  }
}

export function completePreview(taskId: string) {
  const stream = previewStreams.get(taskId);
  if (!stream) return;
  try {
    stream.controller.enqueue(
      stream.encoder.encode(`event: complete\ndata: ${JSON.stringify({ complete: true })}\n\n`)
    );
    stream.controller.close();
  } catch { /* already closed */ }
  previewStreams.delete(taskId);
}

export { previewStreams };