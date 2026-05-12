// lib/command-verifier.js — L66–L68: SSE command signature verification
// Optional HMAC-SHA256 signing for commands sent from the Pushpa server.
// Provides replay-attack protection via timestamp window check.
//
// Protocol (when enabled):
//   Server adds _sig and _ts fields to each SSE command.
//   _ts  = Unix ms timestamp of command creation
//   _sig = HMAC-SHA256(secret, "<_ts>:<type>:<nodeId>:<requestId>")
//
// Backward compatible: if no secret is set OR command has no _sig field,
// verification is skipped and the command is allowed through.

"use strict";

const crypto = require("crypto");
const log    = require("./logger");

let _secret = null;

const REPLAY_WINDOW_MS = 30_000; // reject commands older than 30 seconds

function setSecret(secret) {
  _secret = secret ? Buffer.from(secret, "utf8") : null;
  if (_secret) log.info("Command signing enabled");
}

function verify(ev) {
  // No secret configured → open mode (backward compatible with unsigned commands)
  if (!_secret) return true;

  // Command has no signature → pass through (allows old web app versions to still work)
  if (!ev._sig || !ev._ts) return true;

  const ts = Number(ev._ts);
  if (!Number.isFinite(ts)) {
    log.warn(`[Verifier] Rejected ${ev.type}: invalid timestamp`);
    return false;
  }

  // Replay-attack guard
  if (Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
    log.warn(`[Verifier] Rejected ${ev.type}: timestamp too old (${Math.round((Date.now() - ts) / 1000)}s)`);
    return false;
  }

  const msg = `${ts}:${ev.type}:${ev.nodeId ?? ""}:${ev.requestId ?? ""}`;
  const expected = crypto.createHmac("sha256", _secret).update(msg).digest("hex");

  try {
    const valid = crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(String(ev._sig), "hex")
    );
    if (!valid) log.warn(`[Verifier] Rejected ${ev.type}: signature mismatch`);
    return valid;
  } catch {
    log.warn(`[Verifier] Rejected ${ev.type}: signature comparison failed`);
    return false;
  }
}

module.exports = { setSecret, verify };
