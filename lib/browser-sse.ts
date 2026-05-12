// lib/browser-sse.ts
// SSE helpers for extension communication.
// Lives here (not in the route) so Next.js type-checker doesn't treat
// these as route handlers. Only HTTP verbs are valid route exports.

export interface ExtensionSession {
  connectionId: string;
  extensionVersion: string;
  userAgent: string;
  connectedAt: number;
  lastHeartbeat: number;
  currentMaster?: string;
  currentSlave?: string;
}

export interface WebSocketMessage {
  type: string;
  payload: any;
  slaveId?: string;
  masterId?: string;
  timestamp: number;
}

const g = globalThis as typeof globalThis & {
  __extensionSessions?: Map<string, ExtensionSession>;
  __sseControllers?:    Map<string, ReadableStreamDefaultController>;
};
if (!g.__extensionSessions) g.__extensionSessions = new Map();
if (!g.__sseControllers)    g.__sseControllers    = new Map();

export const extensionSessions: Map<string, ExtensionSession>                    = g.__extensionSessions;
export const sseControllers:    Map<string, ReadableStreamDefaultController>     = g.__sseControllers;

export function sendToExtensionById(connectionId: string, message: Partial<WebSocketMessage>) {
  const controller = sseControllers.get(connectionId);
  if (!controller) {
    console.warn(`[Browser SSE] No SSE channel for: ${connectionId}`);
    return;
  }
  const encoder = new TextEncoder();
  try {
    controller.enqueue(
      encoder.encode(`data: ${JSON.stringify({ ...message, timestamp: Date.now() })}\n\n`)
    );
  } catch (err) {
    console.warn(`[Browser SSE] Failed to send to ${connectionId}:`, err);
  }
}

export function broadcastToExtensions(message: Partial<WebSocketMessage>) {
  sseControllers.forEach((_, connectionId) => sendToExtensionById(connectionId, message));
}

export function getActiveExtensions(): ExtensionSession[] {
  return Array.from(extensionSessions.values());
}

export async function executeBrowserAction(
  connectionId: string,
  action: any,
  slaveId: string,
  masterId: string
): Promise<void> {
  if (!sseControllers.has(connectionId)) {
    throw new Error(`Extension not connected: ${connectionId}`);
  }
  sendToExtensionById(connectionId, {
    type: 'execute_action',
    payload: { ...action, slaveId, masterId },
  });
}