// lib/cdp-client.js — L5 (part 2): CDP connection manager
// Wraps chrome-remote-interface with auto-reconnect.
// Real-world blockers handled:
//   - Chrome not yet ready: retry loop
//   - Tab reloads breaking debugger: re-attach on tab navigation
//   - CDP WebSocket disconnect: exponential backoff reconnect

const CDP  = require("chrome-remote-interface");
const { CDP_PORT } = require("./config");
const log  = require("./logger");

let _client         = null;   // active CDP client
let _tabId          = null;   // currently controlled tab
let _tabId_override = null;   // one-shot: force next connect() to use this tab ID
let _reconnect      = null;   // reconnect timeout handle
let _onReady        = null;   // callback when CDP is ready

const RETRY_DELAYS = [500, 1000, 2000, 4000, 8000];

async function connect(retryIndex = 0) {
  try {
    log.info(`CDP connect attempt ${retryIndex + 1} on port ${CDP_PORT}`);

    // Get list of targets (tabs) from Chrome
    let targets = await CDP.List({ port: CDP_PORT });

    const isNavigable = (t) =>
      t.type === "page" &&
      !t.url.startsWith("devtools://") &&
      !t.url.startsWith("chrome://") &&
      !t.url.startsWith("chrome-extension://");

    let page;

    // 0. One-shot override: caller explicitly requested a specific tab (open/switch command).
    if (_tabId_override) {
      page = targets.find(t => t.id === _tabId_override);
      if (page) log.info(`CDP switching to requested tab: ${page.url} (${page.id})`);
      _tabId_override = null; // consume the override
    }

    // 1. On reconnect: reattach to the exact tab we were controlling.
    //    Cross-origin navigations (about:blank → google.com) swap the renderer
    //    process, briefly dropping the CDP WebSocket. The tab ID stays stable.
    if (!page && _tabId) {
      page = targets.find(t => t.id === _tabId && isNavigable(t));
      if (page) log.info(`CDP reconnecting to previous tab: ${page.url} (${page.id})`);
    }

    // 2. Prefer a tab that is already navigating to a real URL (mid-navigation).
    if (!page) {
      page = targets.find(t => isNavigable(t) && t.url !== "about:blank" && t.url !== "");
    }

    // 3. Fall back to any navigable tab (including about:blank).
    if (!page) page = targets.find(isNavigable);

    // 4. Nothing at all — open a fresh tab.
    if (!page) {
      log.info("No navigable tab found — opening blank tab");
      await CDP.New({ port: CDP_PORT });
      await new Promise(r => setTimeout(r, 500));
      targets = await CDP.List({ port: CDP_PORT });
      page    = targets.find(isNavigable) ?? targets.find(t => t.type === "page");
    }

    if (!page) {
      throw new Error("No Chrome tab found");
    }

    console.log(`[CDP] connecting to: ${page.url} (${page.id})`);
    _client = await CDP({ target: page.id, port: CDP_PORT });
    _tabId  = page.id;

    // Enable the domains we use (Input has no enable — it's always available)
    await Promise.all([
      _client.Page.enable(),
      _client.DOM.enable(),
      _client.Runtime.enable(),
      _client.Network.enable(),
    ]);

    // Full page reload: reset debugger context — must re-enable domains
    _client.Page.loadEventFired(() => {
      log.debug("Page loaded — re-enabling CDP domains");
      Promise.all([
        _client.DOM.enable(),
        _client.Runtime.enable(),
      ]).catch(() => {});
    });

    // SPA navigation (Next.js / React Router pushState): loadEventFired doesn't fire,
    // but Runtime context is preserved. Log for debug; no domain re-enable needed.
    _client.Page.frameNavigated(({ frame }) => {
      if (frame.parentId) return; // skip iframes
      log.debug(`Frame navigated: ${frame.url}`);
    });

    _client.on("disconnect", () => {
      log.warn("CDP disconnected — scheduling reconnect");
      _client = null;
      scheduleReconnect();
    });

    log.info(`CDP connected to tab: ${page.title || page.url}`);
    log.status("Browser connected");
    _onReady?.(_client);
    return _client;

  } catch (err) {
    log.warn(`CDP connect failed: ${err.message}`);
    console.error(`[CDP] attempt ${retryIndex + 1} failed: ${err.message}`);
    const delay = RETRY_DELAYS[Math.min(retryIndex, RETRY_DELAYS.length - 1)];
    log.info(`Retrying CDP in ${delay}ms…`);
    await new Promise(r => setTimeout(r, delay));
    return connect(retryIndex + 1);
  }
}

function scheduleReconnect() {
  clearTimeout(_reconnect);
  _reconnect = setTimeout(() => connect(0), 1_000);
}

function getClient() {
  return _client;
}

function onReady(fn) {
  _onReady = fn;
  if (_client) fn(_client); // already connected
}

async function disconnect() {
  clearTimeout(_reconnect);
  try { await _client?.close(); } catch { /* ignore */ }
  _client = null;
}

// Allow external callers to override which tab the next connect() targets.
function setTabOverride(tabId) { _tabId_override = tabId; }

// Open a fresh Chrome tab and return its target info.
async function openTab(url) {
  await CDP.New({ port: CDP_PORT });
  await new Promise(r => setTimeout(r, 300));
  const targets = await CDP.List({ port: CDP_PORT });
  const isNavigable = (t) =>
    t.type === "page" &&
    !t.url.startsWith("devtools://") &&
    !t.url.startsWith("chrome-extension://");
  // The newest tab is last in the list
  const page = [...targets].reverse().find(isNavigable);
  return page ?? null;
}

// Close a Chrome tab by its target ID.
async function closeTab(tabId) {
  try {
    await CDP.Close({ id: tabId, port: CDP_PORT });
    return true;
  } catch (err) {
    log.warn(`closeTab failed for ${tabId}: ${err.message}`);
    return false;
  }
}

module.exports = { connect, disconnect, getClient, onReady, setTabOverride, openTab, closeTab };
