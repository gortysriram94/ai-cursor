// lib/cost-updates.ts
// SSE cost tracking for live cost ticker updates.
// Lives here (not in the route) so Next.js type-checker doesn't treat
// these as route handlers. Only HTTP verbs are valid route exports.

export interface CostStream {
  controller: ReadableStreamDefaultController;
  visionCalls: number;
  screenshots: number;
  actualCost: number;
}

export const costStreams = new Map<string, CostStream>();

export function updateTaskCost(taskId: string, update: {
  visionCalls?: number;
  screenshots?: number;
  slaveId?: string;
  slaveName?: string;
}) {
  const stream = costStreams.get(taskId);

  if (!stream) {
    console.warn(`[Cost Tracker] No stream for task ${taskId}`);
    return;
  }

  if (update.visionCalls) {
    stream.visionCalls += update.visionCalls;
  }
  if (update.screenshots) {
    stream.screenshots += update.screenshots;
  }

  const VISION_CALL_COST = 0.002;
  const SCREENSHOT_COST = 0.001;

  stream.actualCost =
    (stream.visionCalls * VISION_CALL_COST) +
    (stream.screenshots * SCREENSHOT_COST);

  const data = JSON.stringify({
    visionCalls: stream.visionCalls,
    screenshots: stream.screenshots,
    actualCost: stream.actualCost,
    estimatedTotal: 0.12,
    slaveId: update.slaveId,
    slaveName: update.slaveName
  });

  try {
    stream.controller.enqueue(`data: ${data}\n\n`);
  } catch (e) {
    console.error('[Cost Tracker] Failed to send update:', e);
    costStreams.delete(taskId);
  }
}

export function completeTaskCost(taskId: string) {
  const stream = costStreams.get(taskId);

  if (!stream) {
    return;
  }

  try {
    stream.controller.enqueue(`event: complete\ndata: ${JSON.stringify({ complete: true })}\n\n`);
    stream.controller.close();
  } catch (e) {
    // Already closed
  } finally {
    costStreams.delete(taskId);
  }
}