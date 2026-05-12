// lib/logger.js — L4: file-based logger
// Writes to userData/Pushpa/agent.log so we can diagnose crashes
// without exposing anything in the renderer UI.

const fs   = require("fs");
const path = require("path");

let _logPath = null;
let _stream  = null;
let _ipcSend = null; // set by main.js to forward status to renderer

function init(logDir) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    _logPath = path.join(logDir, "agent.log");
    // Rotate: if log > 5MB, truncate it
    try {
      const stat = fs.statSync(_logPath);
      if (stat.size > 5 * 1024 * 1024) fs.truncateSync(_logPath, 0);
    } catch { /* file doesn't exist yet */ }
    _stream = fs.createWriteStream(_logPath, { flags: "a" });
  } catch (e) {
    console.error("[logger] init failed:", e.message);
  }
}

function setIpcSend(fn) {
  _ipcSend = fn;
}

function write(level, ...args) {
  const ts  = new Date().toISOString();
  const msg = args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ");
  const line = `[${ts}] [${level.toUpperCase()}] ${msg}\n`;

  // Always write to file
  try { _stream?.write(line); } catch { /* stream closed */ }

  // Forward info/error to renderer status bar (never raw logs — just status)
  if (_ipcSend && (level === "status" || level === "error")) {
    try { _ipcSend("agent:status", { level, msg }); } catch { /* ipc closed */ }
  }
}

module.exports = {
  init,
  setIpcSend,
  info:   (...a) => write("info",   ...a),
  warn:   (...a) => write("warn",   ...a),
  error:  (...a) => write("error",  ...a),
  status: (...a) => write("status", ...a), // forwarded to renderer
  debug:  (...a) => { if (process.env.TL_DEBUG) write("debug", ...a); },
};
