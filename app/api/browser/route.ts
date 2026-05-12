// app/api/browser/route.ts
// Browser extension communication via Server-Sent Events (SSE) + POST
//
// NOTE: Deno.upgradeWebSocket() does NOT work in Next.js (Node.js runtime).
// We use SSE for server→extension pushes and a POST endpoint for extension→server messages.
// For true bidirectional WebSockets, use a dedicated WS server or a service like Pusher/Ably.

import { NextRequest, NextResponse } from 'next/server';
import {
  extensionSessions,
  sseControllers,
  type ExtensionSession,
  type WebSocketMessage,
} from '@/lib/browser-sse';

// ─── GET: SSE channel — extension subscribes to commands from server ───────────
export async function GET(req: NextRequest) {
  const connectionId = req.nextUrl.searchParams.get('connectionId') || generateConnectionId();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      sseControllers.set(connectionId, controller);

      // Register session
      extensionSessions.set(connectionId, {
        connectionId,
        extensionVersion: req.headers.get('x-extension-version') || 'unknown',
        userAgent: req.headers.get('user-agent') || 'unknown',
        connectedAt: Date.now(),
        lastHeartbeat: Date.now(),
      });

      // Send welcome
      const welcome = JSON.stringify({
        type: 'connected',
        payload: { connectionId, serverVersion: '1.0.0', timestamp: Date.now() },
        timestamp: Date.now(),
      });
      controller.enqueue(encoder.encode(`data: ${welcome}\n\n`));

      // Keep-alive ping every 30s
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(ping);
        }
      }, 30000);
    },
    cancel() {
      sseControllers.delete(connectionId);
      extensionSessions.delete(connectionId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ─── POST: extension → server messages ────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const message: WebSocketMessage = await req.json();
    const connectionId = req.nextUrl.searchParams.get('connectionId') || '';

    await handleExtensionMessage(connectionId, message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Browser SSE] POST error:', error);
    return NextResponse.json({ error: 'Invalid message' }, { status: 400 });
  }
}



async function handleExtensionMessage(
  connectionId: string,
  message: WebSocketMessage
) {
  console.log(`[Browser SSE] Received from ${connectionId}:`, message.type);

  switch (message.type) {
    case 'handshake':
      await handleHandshake(connectionId, message.payload);
      break;
    case 'action_result':
      await handleActionResult(connectionId, message);
      break;
    case 'auth_required':
      await handleAuthRequired(connectionId, message);
      break;
    case 'page_data':
      await handlePageData(connectionId, message);
      break;
    case 'tab_ready':
      await handleTabReady(connectionId, message);
      break;
    case 'heartbeat':
      await handleHeartbeat(connectionId);
      break;
    case 'cost_update':
      await handleCostUpdate(connectionId, message);
      break;
    case 'error':
      await handleExtensionError(connectionId, message);
      break;
    default:
      console.warn('[Browser SSE] Unknown message type:', message.type);
      sendToExtension(connectionId, {
        type: 'error',
        payload: { error: 'Unknown message type' },
      });
  }
}

async function handleHandshake(connectionId: string, payload: any) {
  const session = extensionSessions.get(connectionId);
  if (session) {
    session.extensionVersion = payload.extensionVersion || session.extensionVersion;
    session.userAgent = payload.userAgent || session.userAgent;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) console.error('[Browser SSE] ANTHROPIC_API_KEY not set!');

  // NOTE: Sending the API key to the extension is a security risk in production.
  // Consider using short-lived tokens or proxying all API calls server-side instead.
  sendToExtension(connectionId, {
    type: 'handshake_ack',
    payload: {
      sessionId: connectionId,
      serverTime: Date.now(),
      apiKeyPresent: !!apiKey,
    },
  });
}

async function handleActionResult(connectionId: string, message: WebSocketMessage) {
  const { slaveId, payload } = message;
  if (payload.success) {
    console.log(`✅ Slave ${slaveId} completed:`, payload.output);
  } else {
    console.error(`❌ Slave ${slaveId} failed:`, payload.error);
  }
}

async function handleAuthRequired(connectionId: string, message: WebSocketMessage) {
  console.log(`[Browser SSE] Auth required:`, message.payload);
}

async function handlePageData(connectionId: string, message: WebSocketMessage) {
  console.log(`[Browser SSE] Page data:`, message.payload);
}

async function handleTabReady(connectionId: string, message: WebSocketMessage) {
  console.log(`[Browser SSE] Tab ready:`, message.payload?.url);
}

async function handleHeartbeat(connectionId: string) {
  const session = extensionSessions.get(connectionId);
  if (session) session.lastHeartbeat = Date.now();
}

async function handleExtensionError(connectionId: string, message: WebSocketMessage) {
  console.error(`[Browser SSE] Extension error:`, message.payload);
}

async function handleCostUpdate(connectionId: string, message: WebSocketMessage) {
  console.log(`[Browser SSE] Cost update:`, message.payload);
  const taskId = message.masterId || 'default';
  const { updateTaskCost } = await import('@/lib/costs');
  updateTaskCost(taskId, {
    visionCalls: message.payload.visionCalls,
    screenshots: message.payload.screenshots,
    slaveId: message.slaveId,
    slaveName: message.payload.slaveName,
  });
}

// ─── Internal SSE sender (uses shared controller map from lib) ───────────────

function sendToExtension(connectionId: string, message: Partial<WebSocketMessage>) {
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

// Public helpers (sendToExtensionById, broadcastToExtensions, getActiveExtensions,
// executeBrowserAction) live in lib/browser-sse.ts — import from there.

function generateConnectionId(): string {
  return `ext_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}