// lib/checkpoint.js — L89: task checkpointing and crash-resume
// Saves task progress to disk after each completed step.
// If the agent crashes mid-task, the web app can resume by passing
// the same taskId in the next browser_run_task command.
//
// Checkpoint format: { taskId, goal, steps, completedCount, results, savedAt }

"use strict";

const fs   = require("fs");
const path = require("path");
const { userData } = require("./config");
const log  = require("./logger");

function _dir() {
  const d = userData("checkpoints");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function _file(taskId) {
  // Sanitise taskId to safe filename characters
  const safe = String(taskId).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  return path.join(_dir(), `${safe}.json`);
}

// Persist task progress — called after every completed step.
function save(taskId, state) {
  try {
    fs.writeFileSync(_file(taskId), JSON.stringify({ ...state, taskId, savedAt: Date.now() }));
  } catch (err) {
    log.warn(`Checkpoint: save failed for "${taskId}":`, err.message);
  }
}

// Load a checkpoint — returns null if not found, expired (>24h), or corrupt.
function load(taskId) {
  try {
    const raw  = fs.readFileSync(_file(taskId), "utf8");
    const data = JSON.parse(raw);
    const age  = Date.now() - (data.savedAt ?? 0);
    if (age > 24 * 60 * 60 * 1000) {
      log.debug(`Checkpoint: "${taskId}" expired (${Math.round(age / 3600000)}h old) — ignoring`);
      _tryDelete(_file(taskId));
      return null;
    }
    log.info(`Checkpoint: resuming "${taskId}" at step ${data.completedCount}`);
    return data;
  } catch {
    return null;
  }
}

// Remove checkpoint after task completes successfully.
function clear(taskId) {
  _tryDelete(_file(taskId));
}

// List all pending checkpoints (for diagnostics / startup scan).
function listPending() {
  try {
    const dir = _dir();
    return fs.readdirSync(dir)
      .filter(f => f.endsWith(".json"))
      .map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function _tryDelete(filepath) {
  try { fs.unlinkSync(filepath); } catch {}
}

module.exports = { save, load, clear, listPending };
