// lib/telemetry.js — L69–L72: local stats tracking + periodic stats file
// Records action counts, error rates, queue depth, CDP reconnects.
// Writes a JSON stats snapshot to disk every 5 minutes.
// No external HTTP calls — the crash report and stats file are the telemetry.

"use strict";

const fs   = require("fs");
const path = require("path");
const { userData } = require("./config");
const log  = require("./logger");

const FLUSH_INTERVAL_MS = 5 * 60 * 1000;  // 5 minutes

let _statsDir = null;
let _timer    = null;

const _counts = {
  actionsExecuted: 0,
  errors:          0,
  cdpReconnects:   0,
  tasksRun:        0,
  queueRejections: 0,
  startedAt:       0,
};

function init() {
  _statsDir = userData("telemetry");
  try { fs.mkdirSync(_statsDir, { recursive: true }); } catch {}
  _counts.startedAt = Date.now();
  _timer = setInterval(_flush, FLUSH_INTERVAL_MS);
  log.info("Telemetry active");
}

function record(event) {
  switch (event) {
    case "action":           _counts.actionsExecuted++; break;
    case "error":            _counts.errors++;          break;
    case "cdp_reconnect":    _counts.cdpReconnects++;   break;
    case "task":             _counts.tasksRun++;        break;
    case "queue_rejection":  _counts.queueRejections++; break;
  }
}

function getStats() {
  return {
    ..._counts,
    uptimeMs:  Date.now() - _counts.startedAt,
    platform:  process.platform,
    electron:  process.versions.electron ?? "unknown",
    node:      process.versions.node     ?? "unknown",
  };
}

function _flush() {
  if (!_statsDir) return;
  try {
    const stats = getStats();
    const file  = path.join(_statsDir, "stats.json");
    fs.writeFileSync(file, JSON.stringify(stats, null, 2));
    log.debug(`Telemetry: actions=${stats.actionsExecuted} errors=${stats.errors} uptime=${Math.round(stats.uptimeMs / 60000)}m`);
  } catch { /* non-fatal */ }
}

function stop() {
  clearInterval(_timer);
  _flush(); // final snapshot
}

module.exports = { init, record, getStats, stop };
