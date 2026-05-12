// lib/screencast-server.js — real-time browser mirror via CDP Page.startScreencast
//
// What it does:
//   1. Opens a WebSocket server on SCREENCAST_PORT (9334)
//   2. When the canvas connects, starts Page.startScreencast on the controlled Chrome tab
//   3. Streams JPEG frames to the canvas at up to 30fps
//   4. Accepts input messages from the canvas (mouse, keyboard, scroll, navigate)
//      and relays them to Chrome via CDP — making the browser node fully interactive
//   5. Restarts automatically when CDP reconnects (cross-origin navigation process swap)

"use strict";

const WebSocket  = require("ws");
const { SCREENCAST_PORT } = require("./config");
const cdpClient  = require("./cdp-client");
const tabManager = require("./tab-manager");
const log        = require("./logger");

// Resolution the browser renders and streams at.
// Override with SCREENCAST_WIDTH / SCREENCAST_HEIGHT env vars, or set "4k".
// deviceScaleFactor=1 keeps CSS px === CDP input px — no coordinate math required.
const RENDER_W = parseInt(process.env.SCREENCAST_WIDTH  || "1920");
const RENDER_H = parseInt(process.env.SCREENCAST_HEIGHT || "1080");

let _wss    = null;
let _client = null; // current connected canvas WebSocket
let _active = false; // screencast currently running

// ── Start WebSocket server ────────────────────────────────────────────────────

function start() {
  if (_wss) return;
  _wss = new WebSocket.Server({ port: SCREENCAST_PORT });
  log.info(`[screencast] Listening on ws://localhost:${SCREENCAST_PORT}`);

  _wss.on("connection", (ws) => {
    // Only one client at a time — close any existing connection
    if (_client && _client.readyState === WebSocket.OPEN) {
      _client.close(1000, "replaced by new connection");
    }
    _client = ws;
    log.info("[screencast] Canvas connected — starting screencast");

    // Push current tab list immediately so canvas hydrates without waiting for events
    const tabs = tabManager.getTabs().map(t => ({
      tabId: t.targetId ?? t.id, url: t.url ?? "", title: t.title ?? "",
    }));
    if (tabs.length > 0) {
      ws.send(JSON.stringify({ type: "tabs-snapshot", tabs }), () => {});
    }

    ws.on("message", (raw) => {
      try { _handleInput(JSON.parse(raw.toString())); } catch { /* ignore malformed */ }
    });

    ws.on("close", () => {
      log.info("[screencast] Canvas disconnected");
      if (_client === ws) _client = null;
      _stopScreencast();
    });

    ws.on("error", () => { /* ignore socket errors — close event fires */ });

    _startScreencast().catch(() => {});
  });

  _wss.on("error", (err) => log.warn(`[screencast] Server error: ${err.message}`));
}

// ── CDP screencast lifecycle ──────────────────────────────────────────────────

async function _startScreencast() {
  const cdp = cdpClient.getClient();
  if (!cdp || _active) return;
  _active = true;

  // Force Chrome to render at RENDER_W × RENDER_H regardless of window size.
  // deviceScaleFactor=1 ensures CSS px === physical px === CDP input px.
  // This is the single source of truth for all coordinate math — no DPR guesswork.
  await cdp.Emulation.setDeviceMetricsOverride({
    width:             RENDER_W,
    height:            RENDER_H,
    deviceScaleFactor: 1,
    mobile:            false,
  }).catch(() => {});

  log.info(`[screencast] Viewport locked to ${RENDER_W}×${RENDER_H} @ 1x DPR`);

  cdp.Page.startScreencast({
    format:        "jpeg",
    quality:       85,
    maxWidth:      RENDER_W,
    maxHeight:     RENDER_H,
    everyNthFrame: 1,
  }).catch(() => { _active = false; });

  cdp.Page.screencastFrame(({ data, metadata, sessionId }) => {
    if (_client?.readyState === WebSocket.OPEN) {
      _client.send(JSON.stringify({
        type:   "frame",
        data:   `data:image/jpeg;base64,${data}`,
        url:    metadata.url ?? "",
        width:  RENDER_W,   // fixed — always matches CDP input coordinate space
        height: RENDER_H,
      }), (err) => { if (err) log.debug("[screencast] send error:", err.message); });
    }
    cdp.Page.screencastFrameAck({ sessionId }).catch(() => {});
  });

  // Forward navigation events so the canvas URL bar stays in sync
  _subscribeNavigation(cdp);

  log.info("[screencast] Screencast started");
}

function _stopScreencast() {
  if (!_active) return;
  _active = false;
  const cdp = cdpClient.getClient();
  cdp?.Page.stopScreencast().catch(() => {});
}

// Called from main.js on every CDP (re)connect — process swaps drop the stream
function onCdpReady() {
  _active = false; // mark stopped (old CDP session is gone)
  if (_client?.readyState === WebSocket.OPEN) {
    _startScreencast().catch(() => {}); // canvas is waiting — restart immediately
  }
}

// ── Input relay: canvas → CDP ─────────────────────────────────────────────────

async function _handleInput(msg) {
  const cdp = cdpClient.getClient();
  if (!cdp) return;
  try {
    switch (msg.type) {
      case "mousemove":
        await cdp.Input.dispatchMouseEvent({ type: "mouseMoved", x: msg.x, y: msg.y, buttons: 0 });
        break;
      case "mousedown":
        await cdp.Input.dispatchMouseEvent({
          type: "mousePressed", x: msg.x, y: msg.y,
          button: msg.button ?? "left", clickCount: 1, buttons: 1,
        });
        break;
      case "mouseup":
        await cdp.Input.dispatchMouseEvent({
          type: "mouseReleased", x: msg.x, y: msg.y,
          button: msg.button ?? "left", clickCount: 1, buttons: 0,
        });
        break;
      case "click":
        await cdp.Input.dispatchMouseEvent({
          type: "mousePressed", x: msg.x, y: msg.y,
          button: "left", clickCount: 1, buttons: 1,
        });
        await new Promise(r => setTimeout(r, 40));
        await cdp.Input.dispatchMouseEvent({
          type: "mouseReleased", x: msg.x, y: msg.y,
          button: "left", clickCount: 1, buttons: 0,
        });
        break;
      case "dblclick":
        for (let n = 1; n <= 2; n++) {
          await cdp.Input.dispatchMouseEvent({ type: "mousePressed", x: msg.x, y: msg.y, button: "left", clickCount: n, buttons: 1 });
          await new Promise(r => setTimeout(r, 30));
          await cdp.Input.dispatchMouseEvent({ type: "mouseReleased", x: msg.x, y: msg.y, button: "left", clickCount: n, buttons: 0 });
        }
        break;
      case "wheel":
        await cdp.Input.dispatchMouseEvent({
          type: "mouseWheel", x: msg.x, y: msg.y,
          deltaX: msg.deltaX ?? 0, deltaY: msg.deltaY ?? 0,
        });
        break;
      case "keydown":
        await cdp.Input.dispatchKeyEvent({
          type: "keyDown",
          key: msg.key, code: msg.code,
          windowsVirtualKeyCode: msg.vk ?? 0,
          modifiers: msg.modifiers ?? 0,
        });
        break;
      case "keyup":
        await cdp.Input.dispatchKeyEvent({
          type: "keyUp",
          key: msg.key, code: msg.code,
          windowsVirtualKeyCode: msg.vk ?? 0,
          modifiers: msg.modifiers ?? 0,
        });
        break;
      case "char":
        // insertText is more reliable than keyDown/keyUp for printable chars
        await cdp.Input.insertText({ text: msg.text });
        break;
      case "navigate":
        await cdp.Page.navigate({ url: msg.url });
        break;
    }
  } catch (err) {
    log.debug(`[screencast] input error (${msg.type}): ${err.message}`);
  }
}

// ── Navigation events ─────────────────────────────────────────────────────────
// Fires after every page load (full navigation + SPA pushState).
// Canvas uses this to update the URL bar without waiting for the next frame.

function _subscribeNavigation(cdp) {
  cdp.Page.loadEventFired(async () => {
    try {
      const { result } = await cdp.Runtime.evaluate({
        expression:    "({ url: location.href, title: document.title })",
        returnByValue: true,
      });
      const { url, title } = result?.value ?? {};
      emitEvent({ type: "navigation", url: url ?? "", title: title ?? "" });
    } catch {}
  });
}

// ── Public: emit an arbitrary event to the connected canvas client ────────────
// Called by main.js tab-manager hooks and any other Electron subsystem.

function emitEvent(msg) {
  if (_client?.readyState === WebSocket.OPEN) {
    _client.send(JSON.stringify(msg), () => {});
  }
}

// ── Shutdown ──────────────────────────────────────────────────────────────────

function stop() {
  _stopScreencast();
  try { _client?.close(); } catch {}
  try { _wss?.close(); }   catch {}
  _wss = null; _client = null;
}

module.exports = { start, stop, onCdpReady, emitEvent };
