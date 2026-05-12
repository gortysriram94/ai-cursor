// lib/healer.js — L92: self-healing failure pattern detection
// Tracks consecutive failures per step signature and suggests recovery patches.
// Plugged into task-runner: after a step fails, getSuggestedFix() returns a
// modified step to retry — or null if no fix is available.

"use strict";

const log = require("./logger");

const THRESHOLD = 2;  // suggest fix after this many consecutive failures

const _failures = new Map();  // sig → consecutive failure count

function recordFailure(step, errorMsg) {
  const sig = _sig(step);
  const n   = (_failures.get(sig) ?? 0) + 1;
  _failures.set(sig, n);
  log.debug(`Healer: "${sig}" failure #${n} — "${errorMsg}"`);
  return n;
}

function recordSuccess(step) {
  // Reset counter on success so transient failures don't accumulate
  _failures.delete(_sig(step));
}

function reset() {
  _failures.clear();
}

// Returns a patched step to retry, or null if no fix is known.
// Caller must check fix._healedWait and pause 1.5s before executing.
function getSuggestedFix(step, errorMsg) {
  const count = _failures.get(_sig(step)) ?? 0;
  if (count < THRESHOLD) return null;

  const err = (errorMsg ?? "").toLowerCase();

  // CSS selector not resolving → fall back to text-based click
  if (step.type === "browser_click" && step.selector && !step.text) {
    log.info(`Healer: click "${step.selector}" failing — switching to text/aria fallback`);
    return { ...step, selector: null, text: step.ariaLabel ?? step.selector };
  }

  // Type target not found → wait then retry (field may still be loading)
  if (step.type === "browser_type" && (err.includes("not found") || err.includes("timeout"))) {
    log.info(`Healer: type target missing — injecting 1.5s wait before retry`);
    return { _healedWait: true, ...step };
  }

  // Navigate timeout → retry same URL (network hiccup)
  if (step.type === "browser_navigate" && err.includes("timeout")) {
    log.info(`Healer: navigate timeout — retrying same URL`);
    return { ...step };
  }

  return null;
}

function _sig(step) {
  const target = step.selector ?? step.text ?? step.url ?? step.placeholder ?? step.ariaLabel ?? "";
  return `${step.type}:${target}`;
}

module.exports = { recordFailure, recordSuccess, reset, getSuggestedFix };
