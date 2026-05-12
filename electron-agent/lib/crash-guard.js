// lib/crash-guard.js — L9: crash detection + auto-restart
// Catches unhandled exceptions and rejections in main process.
// Writes crash report to disk. Electron app.relaunch() after fatal errors.
// Real-world blocker handled: memory leak / CDP overload crashes main process.

const { app } = require("electron");
const fs  = require("fs");
const { userData } = require("./config");
const log = require("./logger");

let _crashDir = null;

function init() {
  _crashDir = userData("crashes");
  try { fs.mkdirSync(_crashDir, { recursive: true }); } catch { /* ignore */ }

  process.on("uncaughtException", (err) => {
    writeCrashReport("uncaughtException", err);
    log.error("CRASH uncaughtException:", err.message);
    // Give logger 200ms to flush then relaunch
    setTimeout(() => {
      try { app.relaunch(); } catch { /* ignore */ }
      app.exit(1);
    }, 200);
  });

  process.on("unhandledRejection", (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    log.warn("unhandledRejection (non-fatal):", msg);
    // unhandledRejection is usually non-fatal — log but don't restart
  });

  log.info("Crash guard active");
}

function writeCrashReport(type, err) {
  if (!_crashDir) return;
  try {
    const report = {
      type,
      message:   err?.message ?? String(err),
      stack:     err?.stack   ?? "",
      ts:        new Date().toISOString(),
      platform:  process.platform,
      version:   process.versions.electron,
    };
    const fname = `crash_${Date.now()}.json`;
    fs.writeFileSync(
      require("path").join(_crashDir, fname),
      JSON.stringify(report, null, 2)
    );
  } catch { /* if we can't write crash report, nothing we can do */ }
}

module.exports = { init };
