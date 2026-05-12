// lib/sse-client.js — L6: SSE client connecting to Pushpa
// Uses the same /api/browser SSE channel the Chrome extension uses.
// Main process (Node.js) — no CORS restrictions.
// Real-world blockers handled:
//   - Network drops: exponential backoff reconnect
//   - Server cold starts: retry with longer delays
//   - Session resume: same connectionId after reconnect

const EventSource = require("eventsource");
const { getResolvedUrl, WS_RECONNECT_BASE_MS, WS_RECONNECT_MAX_MS } = require("./config");
const log = require("./logger");

let _es          = null;
let _connId      = null;
let _handlers    = {};    // type → handler function
let _reconnDelay = WS_RECONNECT_BASE_MS;
let _reconnTimer = null;
let _stopped     = false;

function setConnectionId(id) {
  _connId = id;
}

function on(type, fn) {
  _handlers[type] = fn;
}

function connect() {
  if (_stopped) return;
  if (!_connId) {
    log.error("SSE: connectionId not set before connect()");
    return;
  }

  const url = `${getResolvedUrl()}/api/browser?connectionId=${encodeURIComponent(_connId)}`;
  log.info(`SSE connecting: ${url}`);
  log.status("Connecting to Pushpa…");

  // EventSource automatically sets Accept: text/event-stream
  // Running in main process — no CORS issue
  _es = new EventSource(url, {
    headers: {
      "x-agent-type":    "electron",
      "x-agent-version": "1.0.0",
    },
    rejectUnauthorized: process.env.NODE_ENV !== "development",
  });

  _es.onopen = () => {
    log.info("SSE connected");
    log.status("Connected");
    _reconnDelay = WS_RECONNECT_BASE_MS; // reset backoff on success
  };

  _es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const handler = _handlers[data.type];
      if (handler) {
        handler(data).catch(err => {
          log.error(`Handler error [${data.type}]:`, err.message);
        });
      } else {
        log.debug("Unhandled SSE type:", data.type);
      }
    } catch (e) {
      log.warn("SSE parse error:", e.message);
    }
  };

  _es.onerror = (err) => {
    log.warn("SSE error — will reconnect");
    _es.close();
    _es = null;
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (_stopped) return;
  clearTimeout(_reconnTimer);
  log.info(`SSE reconnect in ${_reconnDelay}ms`);
  _reconnTimer = setTimeout(() => {
    connect();
    _reconnDelay = Math.min(_reconnDelay * 2, WS_RECONNECT_MAX_MS);
  }, _reconnDelay);
}

async function postResult(nodeId, requestId, result) {
  const url = `${getResolvedUrl()}/api/tool-result`;
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ nodeId, requestId, result: JSON.stringify(result) }),
    });
    if (!res.ok) log.warn(`tool-result POST failed: ${res.status}`);
  } catch (e) {
    log.error("tool-result POST error:", e.message);
  }
}

function stop() {
  _stopped = true;
  clearTimeout(_reconnTimer);
  try { _es?.close(); } catch { /* ignore */ }
  _es = null;
}

module.exports = { connect, on, stop, postResult, setConnectionId };
