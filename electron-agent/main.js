// main.js — Electron main process (L1–L99)
// ALL automation, CDP, and network logic lives here.
// Renderer only shows status. User never sees internal complexity.
// --invisible flag: run as a true background process (no status window).

"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

// ── L66: Single-instance enforcement (before app ready) ───────────────────────
// Prevents two agents running on the same machine, which would corrupt CDP state.
if (!app.requestSingleInstanceLock()) {
  // Another instance is already running — exit immediately
  app.quit();
  process.exit(0);
}

// ── L3: Config (must be first — other modules depend on it) ──────────────────
const config  = require("./lib/config");
config.setUserDataPath(app.getPath("userData"));

// ── L4: Logger ────────────────────────────────────────────────────────────────
const log = require("./lib/logger");
log.init(config.userData("logs"));

// ── Other modules (imported after config+log are ready) ───────────────────────
const chromeLauncher    = require("./lib/chrome-launcher");
const cdpClient         = require("./lib/cdp-client");
const sseClient         = require("./lib/sse-client");
const heartbeat         = require("./lib/heartbeat");
const session           = require("./lib/session");
const tabManager        = require("./lib/tab-manager");
const executor          = require("./lib/executor");
const domExtractor      = require("./lib/dom-extractor");
const commandNormalizer = require("./lib/command-normalizer");
const commandVerifier   = require("./lib/command-verifier");
const taskRunner        = require("./lib/task-runner");
const outcomeStore      = require("./lib/outcome-store");
const loginDetector     = require("./lib/login-detector");
const telemetry         = require("./lib/telemetry");
const chromeCompat      = require("./lib/chrome-compat");
// crash-guard imported last — needs app reference
const crashGuard        = require("./lib/crash-guard");

// ── L86–L99: Autonomous agent system ──────────────────────────────────────────
const stealth          = require("./lib/stealth");
const netFilter        = require("./lib/net-filter");
const agentPool        = require("./lib/agent-pool");
const checkpoint       = require("./lib/checkpoint");
const pageProbe        = require("./lib/page-probe");
const screencastServer = require("./lib/screencast-server");

// --invisible: skip the status window entirely (background daemon mode)
const INVISIBLE = process.argv.includes("--invisible");

// ── L1: Boot ──────────────────────────────────────────────────────────────────
let _win         = null;
let _lastStatus  = { level: "status", msg: "Starting…" };

// In invisible mode we never create a window — app runs as a background process.
function createWindow() {
  if (INVISIBLE) return;
  _win = new BrowserWindow({
    width:           260,
    height:          160,
    resizable:       false,
    frame:           false,          // frameless — minimal footprint
    transparent:     true,
    alwaysOnTop:     false,
    skipTaskbar:     false,
    webPreferences: {
      preload:          path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration:  false,       // renderer has NO Node access
      sandbox:          true,
    },
  });

  _win.loadFile("renderer.html");

  // In dev mode show DevTools for renderer debugging
  if (process.argv.includes("--dev")) {
    _win.webContents.openDevTools({ mode: "detach" });
  }

  _win.on("closed", () => { _win = null; });
}

// ── L2: IPC bridge ────────────────────────────────────────────────────────────
// Main → renderer status push (no-op on IPC send in invisible mode — no window exists)
function sendStatus(level, msg) {
  _lastStatus = { level, msg };
  log.status(msg);
  if (!INVISIBLE) {
    try { _win?.webContents?.send("agent:status", { level, msg }); } catch { /* renderer closed */ }
  }
}

// Renderer requests current status on load
ipcMain.handle("agent:getStatus", () => _lastStatus);

// Wire logger to IPC so log.status() also sends to renderer
log.setIpcSend((channel, data) => {
  try { _win?.webContents?.send(channel, data); } catch { /* ignore */ }
});

// ── L8: Session ───────────────────────────────────────────────────────────────
session.init();
const connectionId = session.getOrCreateConnectionId();
log.info(`Session connectionId: ${connectionId}`);

// ── L69: Telemetry (local stats only — no external call) ─────────────────────
telemetry.init();

// ── L66: Focus existing window if user tries to open a second instance ────────
app.on("second-instance", () => {
  if (_win) {
    if (_win.isMinimized()) _win.restore();
    _win.focus();
  }
});

// ── SSE command handlers — L11–L25 Chrome Control Core ───────────────────────

// Wrap an action so any error is caught and reported back to the web app.
// Also: verifies command signature (L66–L68) and records telemetry (L69–L72).
function makeHandler(label, fn) {
  return async (ev) => {
    // L66: reject commands that fail HMAC verification (pass-through if no secret set)
    if (!commandVerifier.verify(ev)) {
      log.warn(`[SECURITY] Dropped ${ev.type} — invalid signature`);
      if (ev.requestId) {
        await sseClient.postResult(ev.nodeId, ev.requestId, { ok: false, error: "invalid signature" });
      }
      return;
    }

    log.info(`[CMD] ${label}`);
    sendStatus("status", label);
    try {
      const result = await fn(ev);
      telemetry.record("action");
      if (ev.requestId) await sseClient.postResult(ev.nodeId, ev.requestId, result ?? { ok: true });
    } catch (err) {
      log.error(`[CMD] ${label} failed:`, err.message);
      telemetry.record("error");
      if (ev.requestId) await sseClient.postResult(ev.nodeId, ev.requestId, { ok: false, error: err.message });
    } finally {
      sendStatus("status", "Running");
    }
  };
}

function registerSseHandlers() {
  sseClient.on("connected", async (ev) => {
    log.info("Pushpa confirmed connection:", ev.payload?.connectionId);
    // L66–L68: server may provide a per-session signing secret
    if (ev.payload?.signingSecret) {
      commandVerifier.setSecret(ev.payload.signingSecret);
    }
    sendStatus("status", "Connected");
    session.save({ lastConnectedAt: Date.now() });
  });

  sseClient.on("ping", async () => {
    log.debug("SSE ping received");
  });

  // All browser_* handlers normalise their payload first, then execute.
  // commandNormalizer is the single source of truth for field names.

  sseClient.on("browser_navigate", makeHandler("Navigating…", async (ev) => {
    const cmd = commandNormalizer.normalize(ev);
    if (!cmd.url) throw new Error("browser_navigate: url required");
    return executor.navigate(cmd.url);
  }));

  sseClient.on("browser_click", makeHandler("Clicking…", async (ev) => {
    const cmd = commandNormalizer.normalize(ev);
    return executor.click({ selector: cmd.selector, ariaLabel: cmd.ariaLabel, text: cmd.text });
  }));

  sseClient.on("browser_click_coords", makeHandler("Clicking…", async (ev) => {
    const cmd = commandNormalizer.normalize(ev);
    return executor.clickCoords(cmd.x, cmd.y);
  }));

  sseClient.on("browser_type", makeHandler("Typing…", async (ev) => {
    const cmd = commandNormalizer.normalize(ev);
    return executor.type(cmd);
  }));

  sseClient.on("browser_scroll", makeHandler("Scrolling…", async (ev) => {
    const cmd = commandNormalizer.normalize(ev);
    return executor.scroll(cmd.direction, cmd.amount);
  }));

  sseClient.on("browser_get_content", makeHandler("Reading page…", async () => {
    return domExtractor.extractContent();
  }));

  sseClient.on("browser_sovereign_scan", makeHandler("Scanning page…", async () => {
    return domExtractor.extractPageMap();
  }));

  sseClient.on("browser_screenshot", makeHandler("Screenshot…", async () => {
    return executor.screenshot();
  }));

  // ── L53–L65: Multi-step task — web app sends a plan, agent executes it ──────
  // Payload: { goal: string, steps: [{type, ...params}], taskId?: string }
  // Result:  { ok, results: [{step, ok, data, error}] }
  sseClient.on("browser_run_task", makeHandler("Running task…", async (ev) => {
    const cmd = commandNormalizer.normalize(ev);
    return taskRunner.run(cmd, (statusMsg) => sendStatus("status", statusMsg));
  }));

  // ── Cookie injection — sync user's real Chrome cookies into agent's Chrome ──
  // Triggered by the canvas before a workflow runs so the user stays logged in.
  sseClient.on("browser_inject_cookies", makeHandler("Syncing cookies…", async (ev) => {
    const cookies = ev.payload?.cookies ?? ev.cookies ?? [];
    const client  = cdpClient.getClient();
    if (!client) return { ok: false, error: "CDP not connected" };

    let injected = 0;
    for (const c of cookies) {
      try {
        await client.Network.setCookie({
          name:     c.name,
          value:    c.value,
          domain:   c.domain,
          path:     c.path     || "/",
          secure:   c.secure   || false,
          httpOnly: c.httpOnly || false,
          sameSite: c.sameSite || "Lax",
          ...(c.expirationDate ? { expires: c.expirationDate } : {}),
        });
        injected++;
      } catch { /* skip malformed cookies */ }
    }
    log.info(`Cookies injected: ${injected}/${cookies.length}`);
    return { ok: true, injected, total: cookies.length };
  }));

  // ── L95: Agent pool status — web app queries available agent slots ─────────
  sseClient.on("agent_pool_status", makeHandler("Pool status…", async () => {
    return { ok: true, ...agentPool.getStatus() };
  }));

  // ── L89: Pending checkpoints — web app queries for incomplete tasks ────────
  sseClient.on("checkpoint_list", makeHandler("Checkpoints…", async () => {
    const pending = checkpoint.listPending();
    return { ok: true, pending };
  }));

  // ── Memory: outcome history + learned patterns ───────────────────────────────
  sseClient.on("memory_query", makeHandler("Memory query…", async (ev) => {
    const domain   = ev.domain   ?? null;
    const recent   = ev.recent   ?? 20;
    const patterns = outcomeStore.getPatterns(domain);
    const history  = outcomeStore.loadRecent(recent, domain);
    return { ok: true, patterns, history };
  }));

  // ── Tab + window control — driven from the Pushpa website ───────────────────

  // Open a new Chrome tab then navigate to the given URL.
  sseClient.on("browser_open_tab", makeHandler("Opening tab…", async (ev) => {
    const url = ev.url || ev.payload?.url || "about:blank";
    const page = await cdpClient.openTab();
    if (page) {
      cdpClient.setTabOverride(page.id);
      await cdpClient.connect();
      if (url !== "about:blank") await executor.navigate(url);
    }
    return { ok: !!page, tabId: page?.id };
  }));

  // Close a specific tab by targetId.
  sseClient.on("browser_close_tab", makeHandler("Closing tab…", async (ev) => {
    const tabId = ev.tabId || ev.payload?.tabId;
    if (!tabId) return { ok: false, error: "tabId required" };
    const ok = await cdpClient.closeTab(tabId);
    return { ok };
  }));

  // Switch the active CDP session to a different open tab.
  sseClient.on("browser_switch_tab", makeHandler("Switching tab…", async (ev) => {
    const tabId = ev.tabId || ev.payload?.tabId;
    if (!tabId) return { ok: false, error: "tabId required" };
    cdpClient.setTabOverride(tabId);
    await cdpClient.connect();
    return { ok: true };
  }));

  // Show and focus the Electron status window.
  sseClient.on("browser_window_show", makeHandler("Showing window…", async () => {
    if (!INVISIBLE && _win) {
      try { _win.show(); _win.focus(); } catch { /* ignore */ }
    }
    return { ok: true };
  }));

  // Hide (minimize) the Electron status window without quitting.
  sseClient.on("browser_window_hide", makeHandler("Hiding window…", async () => {
    if (_win) {
      try { _win.minimize(); } catch { /* ignore */ }
    }
    return { ok: true };
  }));

  // ── L99: Auth bridge — monitors login completion after user is prompted ──────
  // Sent by workflow when user clicks "Continue Login" on the canvas.
  // Focuses the Electron window, polls until login is done, then signals completion.
  // NOTE: no requestId is sent with this command — workflow waits on completionId only.
  sseClient.on("auth_continue", async (ev) => {
    const authNodeId   = ev.nodeId;
    const completionId = ev.completionId;
    if (!authNodeId || !completionId) {
      log.warn("[auth] auth_continue missing nodeId/completionId");
      return;
    }

    log.info(`[auth] Monitoring login for node=${authNodeId} completion=${completionId}`);
    sendStatus("status", "Waiting for login…");

    // Bring Electron window to front so user can see the Chrome login form
    if (!INVISIBLE && _win) {
      try { _win.show(); _win.focus(); } catch { /* ignore */ }
    }

    // Poll page state every 2 s until user leaves the login page (or 5-min timeout)
    const deadline = Date.now() + 300_000;
    let authComplete = false;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2_000));
      const info = await pageProbe.assessPage().catch(() => null);
      if (!info) continue;
      if (info.state !== "login" && info.state !== "loading") {
        authComplete = true;
        log.info(`[auth] Login completed — state=${info.state} url=${info.url}`);
        break;
      }
    }

    sendStatus("status", "Running");
    await sseClient.postResult(
      authNodeId, completionId,
      authComplete ? { ok: true } : { ok: false, error: "Auth monitoring timed out" }
    );
  });
}

// ── L99: Handshake ────────────────────────────────────────────────────────────
// POST /api/agent/handshake — called on boot and on session expiry.
// Returns sessionId that heartbeat uses to identify this session to the server.

async function _handshake(agentId) {
  const url = `${config.getResolvedUrl()}/api/agent/handshake`;
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      agentId,
      version:      "1.0.0",
      capabilities: ["cdp", "automation", "screenshot"],
    }),
  });
  if (!res.ok) throw new Error(`Handshake failed: HTTP ${res.status}`);
  const data = await res.json();
  log.info(`Handshake OK — sessionId: ${data.sessionId}`);
  return data;
}

async function _doHandshake(agentId) {
  try {
    const result = await _handshake(agentId);
    heartbeat.updateSession(result.sessionId);
    session.save({ sessionId: result.sessionId });
    return result.sessionId;
  } catch (err) {
    log.warn("Handshake failed (non-fatal):", err.message);
    return null;
  }
}

// ── Boot sequence ─────────────────────────────────────────────────────────────
app.on("ready", async () => {
  // L9: Crash guard (needs app to be ready)
  crashGuard.init();

  // L1: Create status window
  createWindow();
  sendStatus("status", "Starting…");

  try {
    // L5: Launch Chrome
    sendStatus("status", "Starting browser…");
    await chromeLauncher.launch();

    // L5: Connect CDP
    // All per-session setup runs in onReady — fires on initial connect AND every reconnect.
    cdpClient.onReady(async (client) => {
      tabManager.init(client);

      // ── Tab authority: Electron is the ONLY source of truth for tabs ─────────
      // Forward every tab lifecycle event to the canvas via the screencast WS.
      // Next.js projects this state; it never invents or mutates tabs locally.
      tabManager.on("tab-created", (tab) => {
        screencastServer.emitEvent({
          type: "tab-created",
          tabId: tab.targetId, url: tab.url ?? "", title: tab.title ?? "",
        });
      });
      tabManager.on("tab-closed", ({ targetId }) => {
        screencastServer.emitEvent({ type: "tab-closed", tabId: targetId });
      });
      tabManager.on("tab-updated", (tab) => {
        screencastServer.emitEvent({
          type: "tab-updated",
          tabId: tab.targetId, url: tab.url ?? "", title: tab.title ?? "",
          status: tab.attached ? "complete" : "loading",
        });
      });

      await chromeCompat.check(client);
      await stealth.apply(client);          // L88: patch webdriver flags before any page loads
      await netFilter.apply(client);        // L94: block analytics domains (opt-in via env var)
      screencastServer.onCdpReady();        // restart screencast if canvas is watching
    });
    sendStatus("status", "Connecting to browser…");
    await cdpClient.connect();

    // L6 / L99: Auto-discover server → handshake → SSE
    sendStatus("status", "Finding Pushpa server…");
    await config.resolveServer(log);

    sendStatus("status", "Handshaking…");
    const sessionId = await _doHandshake(connectionId);

    sseClient.setConnectionId(connectionId);
    registerSseHandlers();
    sendStatus("status", "Connecting to Pushpa…");
    sseClient.connect();

    // L95: Register primary agent slot in pool
    agentPool.registerPrimary(9333);

    // L7: Start heartbeat (passes sessionId for /api/agent/heartbeat auth)
    heartbeat.start(connectionId, cdpClient, sessionId);

    // Re-handshake if heartbeat reports session expired
    heartbeat.on("rehandshake", () => _doHandshake(connectionId));

    // Start the real-time browser mirror WebSocket server
    screencastServer.start();

    sendStatus("status", "Running");
    log.info("Pushpa Agent fully started");

    // Non-blocking: detect logged-in services from Chrome cookies and publish
    // to /api/agent/context so the web app can show personalised suggestions.
    loginDetector.detectAndPost(cdpClient.getClient()).catch(() => {});

  } catch (err) {
    log.error("Boot failed:", err.message);
    sendStatus("error", err.message.slice(0, 60));
  }
});

// ── Shutdown ──────────────────────────────────────────────────────────────────
app.on("before-quit", () => {
  heartbeat.stop();
  sseClient.stop();
  screencastServer.stop();
  cdpClient.disconnect();
  chromeLauncher.kill();
  telemetry.stop();
  log.info("Agent shut down cleanly");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (!INVISIBLE && !_win) createWindow();
});
