// app/api/workflow/route.ts
// Swarm Workflow Engine — SSE route.
//
// Flow:
//   1. Commander (Kimi) reads stripped page markdown → outputs Manifest JSON
//   2. For each step, emits the appropriate SSE event to the canvas
//   3. Canvas executes via Chrome extension and POSTs result to /api/tool-result
//   4. Server waits via waitForToolResult, then moves to the next step

import { NextRequest }                               from "next/server";
import { WorkflowEngine, type BrowserAction, type BrowserResult } from "@/lib/workflow-engine";
import { waitForToolResult }                          from "@/lib/executor/tool-executor";
import { getAgent }                                   from "@/lib/agent-store";
import { sendToExtensionById }                        from "@/lib/browser-sse";
import {
  createContext, updateContext, deleteContext, pruneStale,
} from "@/lib/execution-context";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  const { task, pageHtml, pageUrl, pageTitle, nodeId } =
    await req.json() as {
      task:        string;
      pageHtml?:   string;
      pageUrl?:    string;
      pageTitle?:  string;
      nodeId:      string;
      resumeId?:   string;
    };

  if (!task || !nodeId) {
    return new Response(JSON.stringify({ error: "task and nodeId required" }), { status: 400 });
  }

  const enc = new TextEncoder();

  pruneStale(); // lazy GC — runs once per workflow start, costs nothing

  const stream = new ReadableStream({
    async start(ctrl) {
      // ── Execution context ─────────────────────────────────────────────────────
      // taskId is assigned when manifest_ready fires (manifest.id from WorkflowEngine).
      // All context mutations happen through this single closure variable.
      let _taskId: string | null = null;
      let _stepIdx = 0;

      const send = (ev: Record<string, unknown>) => {
        try { ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ ...ev, nodeId })}\n\n`)); } catch {}

        // ── Context lifecycle driven by engine events ─────────────────────────
        if (ev.type === "manifest_ready") {
          const manifest = (ev as any).manifest;
          _taskId = manifest.id as string;
          _stepIdx = 0;
          createContext({
            nodeId,
            taskId:     _taskId,
            agentId:    getAgent()?.agentId ?? "",
            currentUrl: pageUrl ?? "",
            authState:  "none",
            step:       0,
            totalSteps: manifest.steps?.length ?? 0,
          });
        } else if (_taskId) {
          if (ev.type === "step_start") {
            updateContext(_taskId, { step: _stepIdx++ });
          } else if (ev.type === "workflow_complete" || ev.type === "workflow_failed") {
            deleteContext(_taskId);
            _taskId = null;
          }
        }
      };

      // Route browser_* commands to the Electron agent when connected.
      // Falls back to canvas send() (Chrome extension path) when agent is absent.
      const sendBrowser = (ev: Record<string, unknown>) => {
        const agent = getAgent();
        if (agent) {
          console.log(`[workflow→agent] ${ev.type} requestId=${ev.requestId} agentId=${agent.agentId}`);
          sendToExtensionById(agent.agentId, { ...ev, nodeId } as any);
        } else {
          send(ev);
        }
      };

      // ── Helper: read the current page (agent or canvas) ──────────────────────
      async function getPageHtml(): Promise<string> {
        const reqId = `page_${Date.now()}`;
        sendBrowser({ type: "browser_get_content", requestId: reqId });
        try {
          const raw = await race(waitForToolResult(nodeId, reqId), 15_000);
          const parsed = JSON.parse(raw);
          return parsed.text ?? raw;
        } catch {
          return pageHtml ?? "";
        }
      }

      // ── Auth bridge: pause workflow → show modal → resume on user choice ────
      // Called when Electron returns { ok: false, authRequired: true } from navigate/type.
      async function handleAuth(
        authResult: { authUrl?: string; provider?: string },
        originalAction: BrowserAction,
      ): Promise<BrowserResult> {
        const authWaitId = `auth_wait_${Date.now()}`;
        if (_taskId) updateContext(_taskId, { authState: "required" });
        send({
          type:     "auth_required",
          provider: authResult.provider ?? "website",
          authUrl:  authResult.authUrl  ?? "",
          authWaitId,
        });

        // Wait for user to pick Continue / Retry / Cancel (5-minute window)
        let resolution: { action: string };
        try {
          const raw = await waitForToolResult(nodeId, authWaitId, 300_000);
          resolution = JSON.parse(raw);
        } catch {
          return { ok: false, error: "Auth timed out — please try again" };
        }

        if (resolution.action === "cancel") {
          if (_taskId) deleteContext(_taskId);
          return { ok: false, error: "Auth cancelled by user" };
        }

        if (resolution.action === "continue") {
          const completionId = `auth_done_${Date.now()}`;
          sendBrowser({ type: "auth_continue", nodeId, completionId });
          try {
            await waitForToolResult(nodeId, completionId, 300_000);
          } catch {
            return { ok: false, error: "Login monitoring timed out" };
          }
        }

        // Auth resolved — mark complete and retry
        if (_taskId) updateContext(_taskId, { authState: "complete" });
        return runBrowser(originalAction);
      }

      // ── Helper: run one browser action and wait for canvas to relay result ───
      async function runBrowser(action: BrowserAction): Promise<BrowserResult> {
        const reqId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

        switch (action.type) {

          case "navigate": {
            const navUrl = action.target?.url;
            const skip = !getAgent() && navUrl && pageUrl &&
              (navUrl === pageUrl || pageUrl.startsWith(navUrl.replace(/\/$/, "")));
            if (skip) return { ok: true };

            sendBrowser({ type: "browser_navigate", requestId: reqId, url: navUrl });
            if (getAgent()) {
              let navResult: Record<string, unknown> = { ok: true };
              try {
                const raw = await race(waitForToolResult(nodeId, reqId), 15_000);
                navResult = JSON.parse(raw);
              } catch { /* navigate timeout non-fatal */ }

              if (navResult.authRequired) return handleAuth(navResult as any, action);
              if (_taskId) updateContext(_taskId, { currentUrl: navUrl ?? "" });
              send({ type: "agent_url_update", url: navUrl });
            } else {
              const pageReadyId = `nav_ready_${Date.now()}`;
              send({ type: "browser_page_ready_subscribe", requestId: pageReadyId });
              try { await race(waitForToolResult(nodeId, pageReadyId), 4_000); } catch { await sleep(1_500); }
            }
            return { ok: true };
          }

          case "click":
            sendBrowser({
              type:      "browser_click",
              requestId: reqId,
              text:      action.target?.text,
              ariaLabel: action.target?.ariaLabel,
              selector:  action.target?.selector,
              nearText:  action.nearText,
              slave:     action.slave,
            });
            return await waitResult(nodeId, reqId, 15_000,
              (id) => sendBrowser({ type: "browser_click", requestId: id,
                text: action.target?.text, ariaLabel: action.target?.ariaLabel,
                selector: action.target?.selector, nearText: action.nearText, slave: action.slave }),
            );

          case "click_coords":
            sendBrowser({
              type:      "browser_click_coords",
              requestId: reqId,
              x:         action.target?.coordinates?.x ?? 0,
              y:         action.target?.coordinates?.y ?? 0,
              slave:     action.slave,
            });
            return await waitResult(nodeId, reqId, 15_000,
              (id) => sendBrowser({ type: "browser_click_coords", requestId: id,
                x: action.target?.coordinates?.x ?? 0, y: action.target?.coordinates?.y ?? 0, slave: action.slave }),
            );

          case "type": {
            const typeVal = action.value ?? "";
            // Point 2: pressEnter is always explicit — true for search/submit
            sendBrowser({
              type:        "browser_type",
              requestId:   reqId,
              ariaLabel:   action.target?.ariaLabel,
              placeholder: action.placeholder,
              labelText:   action.labelText,
              selector:    action.target?.selector,
              value:       typeVal,
              pressEnter:  action.pressEnter ?? true,
              slave:       action.slave,
            });
            const typeResult = await waitResult(nodeId, reqId, 20_000);

            if ((typeResult as any).authRequired) return handleAuth(typeResult as any, action);

            // Point 4: after type+Enter, agent's Chrome has navigated to results page.
            // Re-fetch current URL and sync it to the canvas.
            if (getAgent() && typeResult.ok) {
              await sleep(800);
              const pageReqId = `page_${Date.now()}`;
              sendBrowser({ type: "browser_get_content", requestId: pageReqId });
              try {
                const raw  = await race(waitForToolResult(nodeId, pageReqId), 8_000);
                const page = JSON.parse(raw);
                if (page.url) {
                  if (_taskId) updateContext(_taskId, { currentUrl: page.url });
                  send({ type: "agent_url_update", url: page.url, title: page.title ?? "" });
                }
              } catch { /* non-fatal */ }
            }
            return typeResult;
          }

          case "extract": {
            if (action.fields?.includes("__sovereign_scan__")) {
              sendBrowser({ type: "browser_sovereign_scan", requestId: reqId });
              try {
                const raw  = await race(waitForToolResult(nodeId, reqId), 15_000);
                const scan = JSON.parse(raw);
                return { ok: true, data: { __sovereign_scan__: scan } };
              } catch {
                return { ok: false, error: "Scan timed out or agent not connected" };
              }
            }

            sendBrowser({ type: "browser_get_content", requestId: reqId });
            try {
              const raw  = await race(waitForToolResult(nodeId, reqId), 15_000);
              const page = JSON.parse(raw);
              const data: Record<string, unknown> = {};
              for (const field of (action.fields ?? [])) {
                const f = field.toLowerCase();
                if (f === "title")      data[field] = page.title ?? "";
                else if (f === "url")   data[field] = page.url   ?? "";
                else if (f === "links") data[field] = (page.links ?? []).slice(0, 20);
                else data[field] = extractField(page.text ?? "", field);
              }
              return { ok: true, data };
            } catch {
              return { ok: false, error: "Extract timed out" };
            }
          }

          case "scroll":
            sendBrowser({
              type:      "browser_scroll",
              requestId: reqId,
              direction: action.direction ?? "down",
              slave:     action.slave,
            });
            return await waitResult(nodeId, reqId, 10_000,
              (id) => sendBrowser({ type: "browser_scroll", requestId: id,
                direction: action.direction ?? "down", slave: action.slave }),
            );

          case "wait":
            await sleep(2_000);
            return { ok: true };

          case "verify": {
            sendBrowser({ type: "browser_get_content", requestId: reqId });
            try {
              const raw  = await race(waitForToolResult(nodeId, reqId), 15_000);
              const page = JSON.parse(raw);
              return { ok: true, data: { verified: true, title: page.title, url: page.url } };
            } catch {
              return { ok: false, error: "Verify timed out" };
            }
          }

          default:
            return { ok: true };
        }
      }

      try {
        const engine = new WorkflowEngine((ev) => send(ev as Record<string, unknown>));
        // When agent is connected its Chrome has independent state — don't hint
        // the engine with the canvas page or it skips navigate steps.
        const agentConnected = !!getAgent();
        await engine.plan(task, agentConnected ? "" : (pageHtml ?? ""), agentConnected ? "" : (pageUrl ?? ""), agentConnected ? "" : (pageTitle ?? ""));
        await engine.run(getPageHtml, runBrowser);
      } catch (e: unknown) {
        send({ type: "workflow_failed", error: e instanceof Error ? e.message : "Engine error" });
      } finally {
        ctrl.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

function race<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);
}

async function waitResult(
  nodeId: string,
  reqId:  string,
  ms:     number,
  resend?: (retryId: string) => void,
): Promise<BrowserResult> {
  const parse = (raw: string): BrowserResult => {
    try { return JSON.parse(raw); } catch { return { ok: true, data: raw }; }
  };
  try {
    return parse(await race(waitForToolResult(nodeId, reqId), ms));
  } catch {
    if (!resend) return { ok: false, error: "step timed out" };
    // SSE may have dropped — re-send once with a fresh requestId before giving up
    const retryId = `${reqId}_r`;
    resend(retryId);
    try {
      return parse(await race(waitForToolResult(nodeId, retryId), ms));
    } catch {
      return { ok: false, error: "step timed out after retry" };
    }
  }
}

// Lightweight field extractor — finds salary, title etc. from raw page text
function extractField(text: string, field: string): string {
  const f = field.toLowerCase();
  const lines = text.split("\n");

  if (f.includes("salary") || f.includes("compensation") || f.includes("pay")) {
    const m = text.match(/\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?(?:\s*\/\s*(?:yr|year|hr|hour|mo|month))?/i);
    return m?.[0] ?? "not shown";
  }
  if (f.includes("title") || f.includes("role")) {
    return lines.find(l => l.trim().length > 3 && l.trim().length < 80)?.trim() ?? "";
  }
  if (f.includes("company")) {
    const m = text.match(/(?:at|@|by)\s+([A-Z][A-Za-z0-9\s&.,]+?)(?:\s*[·|–\-,]|\n)/);
    return m?.[1]?.trim() ?? "";
  }
  if (f.includes("location") || f.includes("remote")) {
    const m = text.match(/\b(remote|hybrid|on-site|onsite|[A-Z][a-z]+(?:,\s*[A-Z]{2})?)\b/i);
    return m?.[0] ?? "not shown";
  }
  return "";
}
