// lib/heartbeat.js — L7: heartbeat system
// POSTs a heartbeat to Pushpa every 15s so the server knows this
// Electron agent is alive. Also monitors CDP health.
// Real-world blocker handled: silent disconnects — heartbeat catches them.

const { getResolvedUrl, HEARTBEAT_INTERVAL_MS } = require("./config");
const { EventEmitter } = require("events");
const log = require("./logger");

const _heartbeatEmitter = new EventEmitter();

let _timer     = null;
let _connId    = null;
let _sessionId = null;
let _cdpClient = null; // reference to cdp-client module

function start(connectionId, cdpClientRef, sessionId) {
  _connId    = connectionId;
  _sessionId = sessionId ?? null;
  _cdpClient = cdpClientRef;
  _timer     = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  log.info("Heartbeat started");
}

// Called from main.js after a re-handshake updates the session
function updateSession(sessionId) {
  _sessionId = sessionId;
}

async function beat() {
  // 1. Check CDP health
  const client = _cdpClient?.getClient();
  let cdpOk = false;
  if (client) {
    try {
      await client.Runtime.evaluate({ expression: "1", returnByValue: true });
      cdpOk = true;
    } catch {
      log.warn("Heartbeat: CDP health check failed — triggering reconnect");
      _cdpClient?.scheduleReconnect?.();
    }
  }

  // 2. POST heartbeat to dedicated agent endpoint
  try {
    const res = await fetch(`${getResolvedUrl()}/api/agent/heartbeat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        agentId:   _connId,
        sessionId: _sessionId,
        status:    "alive",
        activeTab: null,  // tab-manager could supply this in future
        currentTask: null,
      }),
    });
    // Server lost our session — emit event so main.js can re-handshake
    if (res.status === 401) {
      log.warn("Heartbeat: session expired — re-handshake required");
      _heartbeatEmitter.emit("rehandshake");
    }
  } catch {
    log.debug("Heartbeat POST failed (server unreachable)");
  }
}

function stop() {
  clearInterval(_timer);
  _timer = null;
}

module.exports = { start, stop, updateSession, on: _heartbeatEmitter.on.bind(_heartbeatEmitter) };
