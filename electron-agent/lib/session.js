// lib/session.js — L8: disk-persisted session
// Survives Electron crashes and restarts.
// Stores connectionId, last tab URL, CDP port, etc.
// Real-world blocker handled: Electron crash mid-task loses state.

const fs   = require("fs");
const path = require("path");
const { userData } = require("./config");
const log  = require("./logger");

let _sessionPath = null;

function init() {
  const dir = userData("session");
  fs.mkdirSync(dir, { recursive: true });
  _sessionPath = path.join(dir, "session.json");
}

function load() {
  try {
    if (!_sessionPath || !fs.existsSync(_sessionPath)) return {};
    return JSON.parse(fs.readFileSync(_sessionPath, "utf8"));
  } catch {
    return {};
  }
}

function save(data) {
  try {
    const current = load();
    const merged  = { ...current, ...data, savedAt: Date.now() };
    fs.writeFileSync(_sessionPath, JSON.stringify(merged, null, 2));
  } catch (e) {
    log.warn("Session save failed:", e.message);
  }
}

function clear() {
  try {
    if (_sessionPath && fs.existsSync(_sessionPath)) {
      fs.unlinkSync(_sessionPath);
    }
  } catch { /* ignore */ }
}

// Generate a stable connectionId that persists across restarts
// so the server can resume the session rather than creating a new one
function getOrCreateConnectionId() {
  const s = load();
  if (s.connectionId) return s.connectionId;
  const id = `electron_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  save({ connectionId: id });
  return id;
}

module.exports = { init, load, save, clear, getOrCreateConnectionId };
