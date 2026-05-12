// lib/progress-tracker.js — L47–L52: dead loop detection + semantic progress
// Mirrors the intelligence checks from BrowserViewNode.aiGo but runs locally
// inside the Electron agent for autonomous task execution.

"use strict";

const log = require("./logger");

const MAX_SIG_HISTORY     = 20;   // rolling window of recent action signatures
const DEAD_LOOP_THRESHOLD = 3;    // same action N times = dead loop
const TEXT_DELTA_MIN      = 150;  // chars changed = real progress

let _sigs      = [];    // recent "type:target" strings
let _prevState = null;  // { url, textLen, buttonCount }

// ── Action signature ──────────────────────────────────────────────────────────
// Encodes what action was taken + what target it touched.
// Two identical sigs = repeating same action with same effect.

function sig(cmd) {
  const target = cmd.selector || cmd.text || cmd.ariaLabel || cmd.url || cmd.direction || "";
  return `${cmd.type}:${target}`.toLowerCase().slice(0, 80);
}

// ── recordAction — call before executing each step ────────────────────────────
// Returns { sig, count, isDeadLoop }

function recordAction(cmd) {
  const s = sig(cmd);
  _sigs.push(s);
  if (_sigs.length > MAX_SIG_HISTORY) _sigs.shift();
  const count = _sigs.filter(x => x === s).length;
  const isDeadLoop = count >= DEAD_LOOP_THRESHOLD;
  if (isDeadLoop) log.warn(`[ProgressTracker] Dead loop on "${s}" (${count}x)`);
  return { sig: s, count, isDeadLoop };
}

// ── assessProgress — call after a step that may change the page ───────────────
// Returns { hasProgress, reason }

function assessProgress(currentState) {
  if (!_prevState) {
    _prevState = currentState;
    return { hasProgress: true, reason: "initial observation" };
  }

  const urlChanged  = currentState.url         !== _prevState.url;
  const textDelta   = Math.abs((currentState.textLen     ?? 0) - (_prevState.textLen     ?? 0));
  const btnDelta    = Math.abs((currentState.buttonCount ?? 0) - (_prevState.buttonCount ?? 0));

  const prev = _prevState;
  _prevState = currentState;

  if (urlChanged)                return { hasProgress: true,  reason: `URL: ${prev.url} → ${currentState.url}` };
  if (textDelta >= TEXT_DELTA_MIN) return { hasProgress: true,  reason: `text Δ${textDelta}` };
  if (btnDelta  > 0)             return { hasProgress: true,  reason: `button Δ${btnDelta}` };

  return { hasProgress: false, reason: "no observable change" };
}

function reset() {
  _sigs      = [];
  _prevState = null;
}

module.exports = { recordAction, assessProgress, reset, sig };
