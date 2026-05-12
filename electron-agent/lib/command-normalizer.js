// lib/command-normalizer.js — L46: action schema standardisation
// Converts raw SSE event objects (flat OR payload-nested) into clean, typed command objects.
// Single source of truth for all field names — no more ev.field ?? ev.payload?.field elsewhere.

"use strict";

function normalize(ev) {
  const p    = ev.payload ?? {};
  const base = { type: ev.type, nodeId: ev.nodeId, requestId: ev.requestId };

  switch (ev.type) {

    case "browser_navigate":
      return { ...base, url: ev.url ?? p.url ?? "" };

    case "browser_click":
      return {
        ...base,
        selector:  ev.selector  ?? p.selector  ?? null,
        text:      ev.text      ?? p.text       ?? null,
        ariaLabel: ev.ariaLabel ?? p.ariaLabel  ?? null,
        nearText:  ev.nearText  ?? p.nearText   ?? null,
      };

    case "browser_click_coords":
      return {
        ...base,
        x: Number(ev.x ?? p.x ?? 0),
        y: Number(ev.y ?? p.y ?? 0),
      };

    case "browser_type":
      return {
        ...base,
        selector:    ev.selector    ?? p.selector    ?? null,
        placeholder: ev.placeholder ?? p.placeholder ?? null,
        ariaLabel:   ev.ariaLabel   ?? p.ariaLabel   ?? null,
        labelText:   ev.labelText   ?? p.labelText   ?? null,
        value:       ev.value       ?? p.value        ?? "",
        // Default TRUE — search fields always need Enter; the caller explicitly
        // sets pressEnter:false only for form inputs (name, email, password, etc.)
        pressEnter:  ev.pressEnter  ?? p.pressEnter   ?? true,
        clear:       ev.clear       ?? p.clear         ?? true,
      };

    case "browser_scroll":
      return {
        ...base,
        direction: ev.direction ?? p.direction ?? "down",
        amount:    ev.amount    ?? p.amount    ?? null,
      };

    case "browser_run_task":
      return {
        ...base,
        goal:  ev.goal  ?? p.goal  ?? "",
        steps: ev.steps ?? p.steps ?? [],
      };

    // Content / scan / screenshot — no params beyond base
    case "browser_get_content":
    case "browser_sovereign_scan":
    case "browser_screenshot":
      return base;

    default:
      return { ...base, ...p };
  }
}

module.exports = { normalize };
