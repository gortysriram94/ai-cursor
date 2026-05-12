// lib/task-runner.js — BrowserAgent batch executor (RESERVED — Phase 2)
//
// ⚠️  STATUS: NOT IN ACTIVE EXECUTION PATH
//
// The live workflow path is:
//   Next.js WorkflowEngine → individual browser_* SSE commands → executor.js
//
// This module is NOT called from the web app in the current architecture.
// The browser_run_task SSE handler in main.js is registered but never triggered
// by the server — it exists for the Phase 2 BrowserAgent batch execution mode.
//
// DO NOT add orchestration logic here.
// DO NOT call this from WorkflowEngine.
// When Phase 2 BrowserAgent is built, this becomes its internal executor.
//
// Capabilities retained for Phase 2:
//   - Serial step execution with result accumulation + dead-loop detection
//   - Self-healing via healer.js (retry with fallback strategy)
//   - Crash-resume via checkpoint.js
//   - Semantic success verification via result-verifier.js
//   - Outcome persistence via outcome-store.js

"use strict";

const executor        = require("./executor");
const domExtractor    = require("./dom-extractor");
const progressTracker = require("./progress-tracker");
const checkpoint      = require("./checkpoint");
const healer          = require("./healer");
const resultVerifier  = require("./result-verifier");
const outcomeStore    = require("./outcome-store");
const log             = require("./logger");

const MAX_STEPS = 50;

// Steps that change page state and warrant a progress check
const PROGRESS_STEPS = new Set([
  "browser_navigate", "browser_click", "browser_click_coords",
  "browser_type", "browser_scroll",
]);

// ── Public: run a task ────────────────────────────────────────────────────────

async function run(task, onStatus) {
  const { goal = "", steps = [], taskId = null } = task;
  let _verifiedEvidence = "";
  let _verifiedId       = null;
  let _verifiedConf     = 0;

  // ── L89: Checkpoint resume ─────────────────────────────────────────────────
  const ckpt      = taskId ? checkpoint.load(taskId) : null;
  const startStep = ckpt?.completedCount ?? 0;
  const results   = [...(ckpt?.results ?? [])];

  if (ckpt) {
    log.info(`TaskRunner: resuming "${taskId}" at step ${startStep + 1}/${steps.length}`);
  } else {
    log.info(`TaskRunner: "${goal || "(no goal)"}" — ${steps.length} step(s)`);
  }

  // ── L92: Reset healer + progress state for this run ───────────────────────
  healer.reset();
  progressTracker.reset();

  // Observation-only: no steps → return current page map for the web app to plan next actions
  if (steps.length === 0) {
    log.info("TaskRunner: no steps — returning page map");
    try {
      const page = await domExtractor.extractPageMap();
      return { ok: true, data: page, results: [] };
    } catch (err) {
      return { ok: false, error: err.message, results: [] };
    }
  }

  for (let i = startStep; i < Math.min(steps.length, MAX_STEPS); i++) {
    const step = steps[i];
    const label = `${step.type}${step.url ? " " + step.url : step.text ? " \"" + step.text + "\"" : ""}`;
    log.info(`TaskRunner step ${i + 1}/${steps.length}: ${label}`);
    onStatus?.(`Step ${i + 1}: ${_friendlyLabel(step)}`);

    // Dead loop check BEFORE executing
    const loop = progressTracker.recordAction(step);
    if (loop.isDeadLoop) {
      const msg = `Dead loop: "${loop.sig}" repeated ${loop.count}× — stopping task`;
      log.warn(`TaskRunner: ${msg}`);
      results.push({ step: step.type, ok: false, error: "dead loop detected" });
      return { ok: false, error: msg, results };
    }

    // Execute the step
    let result;
    try {
      result = await _executeStep(step);
    } catch (err) {
      log.error(`TaskRunner step error [${step.type}]:`, err.message);
      result = { ok: false, error: err.message };
    }

    // ── L92: Self-healing — retry with a suggested fix on failure ─────────
    if (!result.ok) {
      healer.recordFailure(step, result.error ?? "");
      const fix = healer.getSuggestedFix(step, result.error ?? "");
      if (fix) {
        if (fix._healedWait) await new Promise(r => setTimeout(r, 1500));
        try {
          result = await _executeStep(fix);
          if (result.ok) healer.recordSuccess(step);
        } catch (retryErr) {
          result = { ok: false, error: retryErr.message };
          healer.recordFailure(step, retryErr.message);
        }
      }
    } else {
      healer.recordSuccess(step);
    }

    results.push({ step: step.type, ok: result.ok, error: result.error, data: result.data });

    if (!result.ok) {
      log.warn(`TaskRunner: step failed — ${result.error}`);
      if (step.required) {
        if (taskId) checkpoint.save(taskId, { goal, steps, completedCount: i, results });
        outcomeStore.record({ taskId, goal, steps: i + 1, outcome: "failure", evidence: result.error });
        return { ok: false, error: result.error, results };
      }
      // Non-required failure: continue to next step
    }

    // ── L89: Checkpoint after each completed step ─────────────────────────
    if (taskId) {
      checkpoint.save(taskId, { goal, steps, completedCount: i + 1, results });
    }

    // Semantic progress check + outcome verification after state-changing steps
    if (PROGRESS_STEPS.has(step.type)) {
      try {
        const page = await domExtractor.extractContent();

        progressTracker.assessProgress({
          url:         page.url,
          textLen:     (page.text ?? "").length,
          buttonCount: (page.buttons ?? []).length,
        });

        // Semantic success verification — did the action achieve its goal?
        const vr = await resultVerifier.check(goal, step.type, page);
        if (vr.verified) {
          results[results.length - 1].verified  = true;
          results[results.length - 1].evidence  = vr.evidence;
          results[results.length - 1].confidence = vr.confidence;
          if (vr.id) results[results.length - 1].confirmationId = vr.id;

          // Track best verification signal for final outcome record
          if (vr.confidence > _verifiedConf) {
            _verifiedConf     = vr.confidence;
            _verifiedEvidence = vr.evidence;
            _verifiedId       = vr.id;
          }

          // High-confidence verification → task is provably done, exit early
          if (vr.confidence >= 0.85 && i >= steps.length - 3) {
            log.info(`TaskRunner: high-conf verification at step ${i + 1} — completing early`);
            if (taskId) checkpoint.clear(taskId);
            outcomeStore.record({
              taskId, goal, steps: i + 1, outcome: "success",
              evidence: _verifiedEvidence, id: _verifiedId,
            });
            return { ok: true, results, verified: true, evidence: _verifiedEvidence, confirmationId: _verifiedId };
          }
        }
      } catch { /* progress/verify is non-fatal */ }
    }
  }

  // ── L89: Clear checkpoint on successful completion ─────────────────────
  if (taskId) checkpoint.clear(taskId);

  const finalOutcome = _verifiedConf >= 0.65 ? "success" : "partial";
  outcomeStore.record({
    taskId, goal, steps: steps.length, outcome: finalOutcome,
    evidence: _verifiedEvidence, id: _verifiedId,
  });

  return {
    ok:             true,
    results,
    verified:       _verifiedConf >= 0.65,
    evidence:       _verifiedEvidence,
    confirmationId: _verifiedId,
  };
}

// ── Map a normalised command to an executor/extractor call ────────────────────

async function _executeStep(step) {
  switch (step.type) {
    case "browser_navigate":
      return executor.navigate(step.url);

    case "browser_click":
      return executor.click({
        selector:  step.selector,
        text:      step.text,
        ariaLabel: step.ariaLabel,
      });

    case "browser_click_coords":
      return executor.clickCoords(step.x, step.y);

    case "browser_type":
      return executor.type({
        selector:    step.selector,
        placeholder: step.placeholder,
        ariaLabel:   step.ariaLabel,
        labelText:   step.labelText,
        value:       step.value ?? "",
        pressEnter:  step.pressEnter ?? true,
        clear:       step.clear ?? true,
      });

    case "browser_scroll":
      return executor.scroll(step.direction ?? "down", step.amount);

    case "browser_get_content":
      return domExtractor.extractContent();

    case "browser_sovereign_scan":
      return domExtractor.extractPageMap();

    case "browser_screenshot":
      return executor.screenshot();

    case "browser_wait": {
      const ms = Math.min((Number(step.seconds) || 2) * 1000, 10_000);
      await new Promise(r => setTimeout(r, ms));
      return { ok: true };
    }

    default:
      return { ok: false, error: `Unknown step type: ${step.type}` };
  }
}

// ── Human-readable status label ───────────────────────────────────────────────

function _friendlyLabel(step) {
  switch (step.type) {
    case "browser_navigate":        return `Navigating to ${step.url}`;
    case "browser_click":           return `Clicking "${step.text || step.selector || step.ariaLabel}"`;
    case "browser_click_coords":    return `Clicking (${step.x}, ${step.y})`;
    case "browser_type":            return `Typing into ${step.selector || step.placeholder || step.ariaLabel}`;
    case "browser_scroll":          return `Scrolling ${step.direction}`;
    case "browser_get_content":     return "Reading page";
    case "browser_sovereign_scan":  return "Scanning page";
    case "browser_screenshot":      return "Screenshot";
    case "browser_wait":            return `Waiting ${step.seconds}s`;
    default:                        return step.type;
  }
}

module.exports = { run };
