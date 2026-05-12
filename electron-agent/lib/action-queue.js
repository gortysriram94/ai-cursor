// lib/action-queue.js — L33 + L79–L82: serial CDP action queue + retry + load handling
// CDP is not safe for concurrent commands — serialise all browser actions.
// withRetry handles transient errors: element not yet visible, stale DOM, navigation timing.
//
// L79–L82 additions:
//   MAX_QUEUE_DEPTH: reject new actions if queue is already saturated
//   ACTION_TIMEOUT_MS: each queued action must complete within 60 seconds

"use strict";

const log = require("./logger");

const RETRY_DELAYS     = [300, 700, 1500];
const MAX_QUEUE_DEPTH  = 25;
const ACTION_TIMEOUT_MS = 60_000;

// ── Serial queue ──────────────────────────────────────────────────────────────

let _queue   = [];
let _running = false;

async function _drain() {
  if (_running) return;
  _running = true;
  while (_queue.length > 0) {
    const { fn, resolve, reject } = _queue.shift();
    try   { resolve(await fn()); }
    catch (err) { reject(err); }
  }
  _running = false;
}

function enqueue(fn) {
  if (_queue.length >= MAX_QUEUE_DEPTH) {
    const msg = `Action queue saturated (${_queue.length} pending) — command dropped`;
    log.warn(msg);
    // Record in telemetry if available (lazy require to avoid circular dep)
    try { require("./telemetry").record("queue_rejection"); } catch {}
    return Promise.reject(new Error(msg));
  }

  return new Promise((resolve, reject) => {
    // Wrap fn in hard timeout — prevents a hung CDP call from blocking the queue forever
    const timedFn = () => Promise.race([
      fn(),
      new Promise((_, r) =>
        setTimeout(() => r(new Error(`Action timeout (${ACTION_TIMEOUT_MS / 1000}s)`)), ACTION_TIMEOUT_MS)
      ),
    ]);
    _queue.push({ fn: timedFn, resolve, reject });
    _drain();
  });
}

// ── Retry with backoff ────────────────────────────────────────────────────────

async function withRetry(fn, maxAttempts = 3) {
  let last;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!_isTransient(err.message) || i >= maxAttempts - 1) break;
      const delay = RETRY_DELAYS[i] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1];
      log.debug(`Retry ${i + 1}/${maxAttempts} after "${err.message}" — waiting ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw last;
}

// Errors worth retrying (element may appear shortly or DOM is settling)
function _isTransient(msg) {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return m.includes("not found") || m.includes("not resolved") ||
         m.includes("stale")     || m.includes("detached")    ||
         m.includes("timeout")   || m.includes("not connected");
}

function getQueueDepth() {
  return _queue.length + (_running ? 1 : 0);
}

module.exports = { enqueue, withRetry, getQueueDepth };
