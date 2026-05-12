// lib/page-probe.js — page state detection + smart element targeting
//
// Three public functions:
//   assessPage()        — what state is the page in? (ready/loading/captcha/login/error/blocked)
//   findInput(hints)    — find the best text input to type into, with confidence score
//   findClickable(hints)— find the best clickable element, with confidence score
//
// Executor calls these before every interaction so it knows:
//   WHEN to interact  (page must be "ready")
//   WHEN NOT to       (captcha, login wall, error, disabled)
//   WHERE to          (highest-confidence element)
//   WHERE NOT to      (wrong element type, off-screen, disabled)

"use strict";

const cdpClient = require("./cdp-client");
const log       = require("./logger");

// ── Shadow DOM helper injected into every evaluation ─────────────────────────
const SHADOW_FN = `
function shadowQuery(root, sel) {
  var el = root.querySelector(sel);
  if (el) return el;
  var nodes = root.querySelectorAll("*");
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].shadowRoot) {
      var hit = shadowQuery(nodes[i].shadowRoot, sel);
      if (hit) return hit;
    }
  }
  return null;
}
function visibleCoords(el) {
  if (!el) return null;
  var r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  if (r.bottom < 0 || r.top > window.innerHeight * 1.5) return null;
  var style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return null;
  if (el.disabled || el.getAttribute("aria-disabled") === "true") return null;
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
           w: Math.round(r.width), h: Math.round(r.height) };
}
`;

async function evalJS(expr) {
  const client = cdpClient.getClient();
  if (!client) return null;
  try {
    const { result, exceptionDetails } = await client.Runtime.evaluate({
      expression:    `(function(){ ${SHADOW_FN} ${expr} })()`,
      returnByValue: true,
      awaitPromise:  false,
    });
    if (exceptionDetails) return null;
    return result?.value ?? null;
  } catch {
    return null;
  }
}

// ── Page state assessment ─────────────────────────────────────────────────────
//
// Returns:
//   { state, ready, url, title, interactive, reason }
//
// state values:
//   "loading"  — page not done yet, wait more
//   "captcha"  — human verification required, cannot automate
//   "login"    — login wall, need credentials
//   "error"    — 404 / 5xx / "page not found"
//   "blocked"  — rate-limited or access denied
//   "ready"    — page is interactive and usable

async function assessPage() {
  const result = await evalJS(`(function(){
    var ready      = document.readyState === "complete";
    var url        = location.href;
    var title      = (document.title || "").slice(0, 120);
    var bodyText   = ((document.body && document.body.innerText) || "").slice(0, 3000).toLowerCase();

    // Count visible interactive elements
    var interactive = 0;
    var els = document.querySelectorAll('input,button,a[href],[role="button"],[role="link"],select,textarea');
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.top >= 0 && r.top < window.innerHeight) interactive++;
    }

    // Detect loading indicators
    var spinnerSel = [
      '[class*="loading"]','[class*="spinner"]','[class*="skeleton"]',
      '[aria-busy="true"]','[data-loading]',
      'ytd-ghost-feed-option-renderer','yt-page-navigation-progress',
      '.loading-spinner','.progress-bar:not([value="100"])'
    ].join(",");
    var hasSpinner = false;
    try { hasSpinner = !!document.querySelector(spinnerSel); } catch(_){}

    // State signals
    var isCaptcha = /captcha|i.m not a robot|verify you.re human|recaptcha|hcaptcha/i.test(bodyText) ||
      !!document.querySelector('iframe[src*="recaptcha"],iframe[src*="captcha"],#captcha,.g-recaptcha');

    var isBlocked = /access denied|rate limit|too many requests|403 forbidden|you.ve been blocked/i.test(bodyText + title);

    var isError = /404|page not found|not found|does not exist|this page is (gone|unavailable)|no longer available/i.test(bodyText + title) &&
      interactive < 3;

    var isLogin = (
      !!document.querySelector('input[type="password"]') ||
      /sign in to|log in to|please sign in|please log in/i.test(title + bodyText)
    ) && interactive < 6;

    var isLoading = !ready || (interactive < 2 && !isError && !isCaptcha && !isBlocked);

    var state = isCaptcha ? "captcha"
      : isBlocked ? "blocked"
      : isError   ? "error"
      : isLogin   ? "login"
      : isLoading || hasSpinner ? "loading"
      : "ready";

    return { state, ready, url, title, interactive, hasSpinner,
             reason: state === "loading" ? ("readyState=" + document.readyState + " interactive=" + interactive + (hasSpinner ? " spinner" : "")) : state };
  })()`);

  return result ?? { state: "unknown", ready: false, interactive: 0, reason: "eval failed" };
}

// ── Input targeting ───────────────────────────────────────────────────────────
//
// Tries strategies in confidence order. Returns:
//   { x, y, w, h, confidence, strategy, tag }
//
// Throws if no element found above MIN_CONFIDENCE within timeoutMs.

const MIN_CONFIDENCE = 0.35;

function inputStrategies(hints) {
  const { selector, ariaLabel, placeholder, text } = hints;
  const strats = [];

  if (selector) {
    strats.push({ name: `css:${selector}`, confidence: 0.95,
      q: `return visibleCoords(shadowQuery(document, ${JSON.stringify(selector)}));` });
  }

  // name="search_query" is YouTube's actual input name — extremely reliable
  strats.push({ name: "name:search_query", confidence: 0.95,
    q: `return visibleCoords(shadowQuery(document, 'input[name="search_query"]'));` });

  // Standard search input names / types
  strats.push({ name: "name:q/search", confidence: 0.88,
    q: `return visibleCoords(
          shadowQuery(document, 'input[name="q"]') ||
          shadowQuery(document, 'input[type="search"]') ||
          shadowQuery(document, 'input[name*="search"]') ||
          shadowQuery(document, 'input[name="field-keywords"]'));` });

  if (ariaLabel) {
    strats.push({ name: `input-aria-exact:${ariaLabel}`, confidence: 0.90,
      q: `return visibleCoords(
            shadowQuery(document, 'input[aria-label=${JSON.stringify(ariaLabel)}]') ||
            shadowQuery(document, 'textarea[aria-label=${JSON.stringify(ariaLabel)}]'));` });

    strats.push({ name: `input-aria-partial:${ariaLabel}`, confidence: 0.75,
      q: `return visibleCoords(
            shadowQuery(document, 'input[aria-label*=${JSON.stringify(ariaLabel)}]') ||
            shadowQuery(document, 'textarea[aria-label*=${JSON.stringify(ariaLabel)}]'));` });
  }

  if (placeholder) {
    strats.push({ name: `placeholder:${placeholder}`, confidence: 0.80,
      q: `return visibleCoords(
            shadowQuery(document, 'input[placeholder*=${JSON.stringify(placeholder)}]') ||
            shadowQuery(document, 'textarea[placeholder*=${JSON.stringify(placeholder)}]'));` });
  }

  // Generic: first visible text input in the viewport — lowest confidence
  strats.push({ name: "any-visible-input", confidence: 0.35,
    q: `var inputs = document.querySelectorAll(
          'input[type="text"],input[type="search"],input:not([type]),textarea');
        for (var i = 0; i < inputs.length; i++) {
          var c = visibleCoords(inputs[i]);
          if (c && c.w > 40) return c;
        }
        return null;` });

  return strats;
}

async function findInput(hints, timeoutMs = 8_000) {
  const strats   = inputStrategies(hints);
  const deadline = Date.now() + timeoutMs;
  let   best     = null;
  let   polls    = 0;

  while (Date.now() < deadline) {
    for (const s of strats) {
      const coords = await evalJS(s.q);
      if (coords?.x && coords?.y) {
        const candidate = { ...coords, confidence: s.confidence, strategy: s.name };
        if (!best || s.confidence > best.confidence) best = candidate;
        if (s.confidence >= 0.88) {
          log.info(`[probe] input found: ${s.name} conf=${s.confidence} (${coords.x},${coords.y})`);
          return best;
        }
      }
    }

    if (best && best.confidence >= MIN_CONFIDENCE) {
      log.info(`[probe] input found (poll ${polls}): ${best.strategy} conf=${best.confidence}`);
      return best;
    }

    polls++;
    await new Promise(r => setTimeout(r, 300));
  }

  const label = hints.selector || hints.ariaLabel || hints.placeholder || "input";
  throw new Error(`[probe] input not found: "${label}" after ${polls} polls`);
}

// ── Clickable element targeting ───────────────────────────────────────────────
//
// Same pattern as findInput but for buttons / links / role=button.

function clickStrategies(hints) {
  const { selector, ariaLabel, text } = hints;
  const strats = [];

  if (selector) {
    strats.push({ name: `css:${selector}`, confidence: 0.95,
      q: `return visibleCoords(shadowQuery(document, ${JSON.stringify(selector)}));` });
  }

  if (ariaLabel) {
    strats.push({ name: `aria-exact:${ariaLabel}`, confidence: 0.90,
      q: `return visibleCoords(
            shadowQuery(document, '[aria-label=${JSON.stringify(ariaLabel)}]'));` });

    strats.push({ name: `aria-partial:${ariaLabel}`, confidence: 0.72,
      q: `return visibleCoords(
            shadowQuery(document, '[aria-label*=${JSON.stringify(ariaLabel)}]'));` });
  }

  if (text) {
    const needle = text.toLowerCase();
    strats.push({ name: `text-exact:${text}`, confidence: 0.85,
      q: `var n = ${JSON.stringify(needle)};
          var cands = document.querySelectorAll('a,button,[role="button"],[role="link"],input[type="submit"]');
          for (var i = 0; i < cands.length; i++) {
            var t = (cands[i].innerText || cands[i].textContent || cands[i].value || "").trim().toLowerCase();
            if (t === n) { var c = visibleCoords(cands[i]); if (c) return c; }
          }
          return null;` });

    strats.push({ name: `text-partial:${text}`, confidence: 0.65,
      q: `var n = ${JSON.stringify(needle)};
          var cands = document.querySelectorAll('a,button,[role="button"],[role="link"]');
          for (var i = 0; i < cands.length; i++) {
            var t = (cands[i].innerText || cands[i].textContent || "").trim().toLowerCase();
            if (t.indexOf(n) !== -1) { var c = visibleCoords(cands[i]); if (c) return c; }
          }
          return null;` });
  }

  return strats;
}

async function findClickable(hints, timeoutMs = 8_000) {
  const strats   = clickStrategies(hints);
  if (strats.length === 0) throw new Error("[probe] findClickable: no hints provided");

  const deadline = Date.now() + timeoutMs;
  let   best     = null;
  let   polls    = 0;

  while (Date.now() < deadline) {
    for (const s of strats) {
      const coords = await evalJS(s.q);
      if (coords?.x && coords?.y) {
        const candidate = { ...coords, confidence: s.confidence, strategy: s.name };
        if (!best || s.confidence > best.confidence) best = candidate;
        if (s.confidence >= 0.88) {
          log.info(`[probe] clickable found: ${s.name} conf=${s.confidence}`);
          return best;
        }
      }
    }

    if (best && best.confidence >= MIN_CONFIDENCE) {
      log.info(`[probe] clickable found (poll ${polls}): ${best.strategy} conf=${best.confidence}`);
      return best;
    }

    polls++;
    await new Promise(r => setTimeout(r, 300));
  }

  const label = hints.selector || hints.ariaLabel || hints.text || "element";
  throw new Error(`[probe] clickable not found: "${label}" after ${polls} polls`);
}

// ── Page readiness wait ───────────────────────────────────────────────────────
//
// Polls assessPage() until state === "ready", or throws on terminal states
// (captcha / blocked / error).

async function waitUntilReady(timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const info = await assessPage();
    log.debug(`[probe] page state: ${info.state} (${info.reason})`);

    if (info.state === "ready")   return info;
    if (info.state === "captcha") throw new Error("[probe] CAPTCHA detected — cannot automate");
    if (info.state === "blocked") throw new Error("[probe] Access blocked / rate-limited");
    if (info.state === "error")   throw new Error(`[probe] Page error: "${info.title}"`);
    // Login wall — return to caller with authRequired flag instead of throwing.
    // Caller decides whether to propagate the error or trigger auth flow.
    if (info.state === "login")   return { ...info, authRequired: true };

    // "loading" — keep waiting
    await new Promise(r => setTimeout(r, 400));
  }

  // Timed out waiting for ready — get final state and warn
  const final = await assessPage();
  log.warn(`[probe] waitUntilReady timed out — state=${final.state}, proceeding`);
  return final;
}

module.exports = { assessPage, findInput, findClickable, waitUntilReady };
