// lib/executor.js — L12–L18 + L26–L45 + L86: CDP action executor
// Public API: navigate, click, clickCoords, type, scroll, screenshot, pressKey
//
// L26–L45 additions:
//   - All actions serialised through actionQueue (no concurrent CDP)
//   - click/type use selectorResolver (shadow DOM + full fallback chain)
//   - type uses document.activeElement for change event (no selector needed)
//   - navigate verifies URL changed; retries once on timeout
//   - withRetry wraps transient failures (element not yet visible, stale DOM)
//
// L86 additions:
//   - Pushpa_HUMAN_SIM=1: natural Bezier mouse movement before click/type
//   - Jittered typing delay when human-sim is active

"use strict";

const cdpClient        = require("./cdp-client");
const selectorResolver = require("./selector-resolver");
const pageProbe        = require("./page-probe");
const actionQueue      = require("./action-queue");
const humanSim         = require("./human-sim");
const log              = require("./logger");

const HUMAN_SIM = !!process.env.Pushpa_HUMAN_SIM;

const PAGE_LOAD_TIMEOUT_MS = 30_000;

// Returns a human-readable provider name from a login URL.
function _detectProvider(url) {
  if (!url) return "unknown";
  if (/accounts\.google\.com|google\.com\/signin/i.test(url))   return "Google";
  if (/youtube\.com.*(sign|login|auth)/i.test(url))             return "Google";
  if (/facebook\.com.*(login|checkpoint)/i.test(url))           return "Facebook";
  if (/twitter\.com.*(login|i\/flow)|x\.com.*(login|i\/flow)/i.test(url)) return "X (Twitter)";
  if (/linkedin\.com.*(login|uas)/i.test(url))                  return "LinkedIn";
  if (/amazon\.com.*signin/i.test(url))                         return "Amazon";
  if (/apple\.com.*sign.?in/i.test(url))                        return "Apple";
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url.slice(0, 40); }
}

// ── Low-level helpers (no queue — only called from within queued functions) ───

async function evaluate(expr) {
  const client = cdpClient.getClient();
  if (!client) throw new Error("CDP not connected");
  const { result, exceptionDetails } = await client.Runtime.evaluate({
    expression:    expr,
    returnByValue: true,
    awaitPromise:  true,
  });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description || exceptionDetails.text || "JS error");
  }
  return result?.value;
}

function waitForLoad(timeoutMs = PAGE_LOAD_TIMEOUT_MS) {
  const client = cdpClient.getClient();
  if (!client) return Promise.resolve();
  return new Promise(resolve => {
    let done      = false;
    let removeEvt = null;
    const finish  = () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      try { removeEvt?.(); } catch {}
      resolve();
    };
    const t = setTimeout(finish, timeoutMs);
    removeEvt = client.Page.loadEventFired(finish);

    // If CDP reconnects to the same tab mid-navigation the old loadEventFired
    // listener is on a dead socket — fall back to the timeout, which is fine
    // because pageProbe.waitUntilReady will poll until the page is actually ready.
    client.on("disconnect", finish);
  });
}

// ── Raw implementations (called inside queued fns — no re-queuing) ────────────

async function _navigate(url) {
  let client = cdpClient.getClient();
  if (!client) throw new Error("CDP not connected");
  log.info(`Navigate → ${url}`);
  const loadPromise = waitForLoad();
  await client.Page.navigate({ url });
  await loadPromise;

  // Re-acquire the client — a cross-origin navigation swaps Chrome's renderer
  // process, which briefly disconnects CDP and reconnects to the same tab.
  // If we hold the old reference we'll be talking to a dead session.
  client = cdpClient.getClient();
  if (!client) throw new Error("CDP lost connection during navigation");

  // Probe the page until it's truly interactive (throws on captcha/blocked/error)
  const pageInfo = await pageProbe.waitUntilReady(12_000);
  if (pageInfo.authRequired) {
    const provider = _detectProvider(pageInfo.url ?? url);
    log.warn(`[auth] Login wall at ${pageInfo.url} (${provider})`);
    return { ok: false, authRequired: true, authUrl: pageInfo.url ?? url, provider };
  }
  log.info(`Page ready: state=${pageInfo.state} interactive=${pageInfo.interactive}`);
  const finalUrl = await evaluate("location.href").catch(() => url);
  log.info(`Navigated: ${finalUrl}`);
  return { ok: true, url: finalUrl };
}

async function _clickCoords(x, y) {
  const client = cdpClient.getClient();
  if (!client) throw new Error("CDP not connected");
  const base = { x, y, button: "left", clickCount: 1, modifiers: 0 };
  await client.Input.dispatchMouseEvent({ ...base, type: "mousePressed" });
  await new Promise(r => setTimeout(r, 40));
  await client.Input.dispatchMouseEvent({ ...base, type: "mouseReleased" });
  return { ok: true };
}

async function _click(hints) {
  const client = cdpClient.getClient();
  if (!client) throw new Error("CDP not connected");
  // Probe: find the best clickable with confidence — avoids clicking wrong elements
  const probe = await pageProbe.findClickable(hints);
  log.info(`Click → ${probe.strategy} conf=${probe.confidence} (${probe.x},${probe.y})`);
  if (HUMAN_SIM) await humanSim.naturalClick(client, probe.x, probe.y);
  return _clickCoords(probe.x, probe.y);
}

async function _type({ selector, placeholder, ariaLabel, labelText, value, pressEnter, clear = true }) {
  const client = cdpClient.getClient();
  if (!client) throw new Error("CDP not connected");

  // Never type on blank pages
  const currentUrl = await evaluate("location.href").catch(() => "");
  if (!currentUrl || currentUrl === "about:blank" || currentUrl === "about:newtab") {
    throw new Error(`Cannot type: browser is on "${currentUrl || "blank"}" — navigate first`);
  }

  // Probe: wait for page to be ready, then find the best input with confidence scoring
  const readyInfo = await pageProbe.waitUntilReady(6_000);
  if (readyInfo.authRequired) {
    const provider = _detectProvider(readyInfo.url ?? currentUrl);
    log.warn(`[auth] Login wall during type at ${readyInfo.url} (${provider})`);
    return { ok: false, authRequired: true, authUrl: readyInfo.url ?? currentUrl, provider };
  }
  const probe = await pageProbe.findInput({ selector, ariaLabel, placeholder, text: labelText });
  log.info(`Type "${value}" → ${probe.strategy} conf=${probe.confidence} (${probe.x},${probe.y})`);

  const coords = probe;
  if (HUMAN_SIM) await humanSim.naturalClick(client, coords.x, coords.y);
  await _clickCoords(coords.x, coords.y);
  await new Promise(r => setTimeout(r, HUMAN_SIM ? humanSim.jitter(80) : 80));

  if (clear) {
    await client.Input.dispatchKeyEvent({ type: "keyDown", key: "a", code: "KeyA", modifiers: 2 });
    await client.Input.dispatchKeyEvent({ type: "keyUp",   key: "a", code: "KeyA", modifiers: 2 });
    await new Promise(r => setTimeout(r, 30));
  }

  // insertText fires proper synthetic input events — works with React/Vue/Angular
  await client.Input.insertText({ text: String(value) });

  // Fire change on whatever element is now active (reliable — we just focused it)
  await evaluate(
    "document.activeElement && document.activeElement.dispatchEvent(new Event('change', { bubbles: true }))"
  ).catch(() => {});

  if (pressEnter) {
    // ── Step 1: Re-focus the input ────────────────────────────────────────────
    // React/Vue may re-render after insertText+change, blurring the input.
    // Clicking the same coordinates re-focuses without clearing the typed text.
    await _clickCoords(coords.x, coords.y);
    await new Promise(r => setTimeout(r, 80));

    // ── Step 2: Dispatch Enter with all three required event types ────────────
    // keyDown alone is insufficient on many React sites that listen to keypress.
    // CDP "char" type fires the keypress-equivalent event with the char value \r.
    log.info(`[type] Pressing Enter (pressEnter=true) on "${value}"`);
    await client.Input.dispatchKeyEvent({
      type: "keyDown", key: "Enter", code: "Enter",
      windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers: 0,
    });
    await client.Input.dispatchKeyEvent({
      type: "char", key: "\r", code: "Enter",
      windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers: 0,
      text: "\r", unmodifiedText: "\r",
    });
    await client.Input.dispatchKeyEvent({
      type: "keyUp", key: "Enter", code: "Enter",
      windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers: 0,
    });

    // ── Step 3: Wait for the results page to load ─────────────────────────────
    // waitForLoad resolves on Page.loadEventFired OR on CDP disconnect (which
    // happens during cross-origin navigation). Both mean navigation started.
    log.info("[type] Waiting for page navigation after Enter…");
    await waitForLoad(10_000).catch(() => {
      log.warn("[type] waitForLoad timed out — page may use AJAX search");
    });

    // ── Step 4: Verify navigation happened ────────────────────────────────────
    const urlAfter = await evaluate("location.href").catch(() => null);
    log.info(`[type] URL after Enter: ${urlAfter ?? "unknown"} (was: ${currentUrl})`);

    if (urlAfter !== null && urlAfter === currentUrl) {
      // URL unchanged — either AJAX search or Enter truly failed.
      // Try clicking the site's search submit button as a final fallback.
      log.warn("[type] URL unchanged after Enter — trying submit button fallback");
      const submitCoords = await evaluate(`(function() {
        var sels = [
          '.nav-search-submit',           /* Amazon */
          'button[type="submit"]',
          'input[type="submit"]',
          '[data-testid*="search"] button',
          'form button:not([type="reset"])',
          '[aria-label="Search"][role="button"]',
          '[value="Search"]',
          'button.search-button',
          '.search-submit',
          '[class*="SearchButton"]',
          '[class*="search-btn"]',
        ];
        for (var i = 0; i < sels.length; i++) {
          var el = document.querySelector(sels[i]);
          if (!el) continue;
          var r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && r.top >= 0 && r.top < window.innerHeight) {
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
          }
        }
        return null;
      })()`).catch(() => null);

      if (submitCoords?.x && submitCoords?.y) {
        log.info(`[type] Submit button fallback at (${submitCoords.x}, ${submitCoords.y})`);
        await _clickCoords(submitCoords.x, submitCoords.y);
        await waitForLoad(8_000).catch(() => {});
        const urlFinal = await evaluate("location.href").catch(() => null);
        log.info(`[type] URL after submit click: ${urlFinal ?? "unknown"}`);
      } else {
        log.warn("[type] No submit button found — search may be AJAX-based");
      }
    } else {
      log.info("[type] Navigation confirmed ✓");
    }
  }

  return { ok: true };
}

async function _scroll(direction = "down", amount) {
  const client = cdpClient.getClient();
  if (!client) throw new Error("CDP not connected");
  const px = Number(amount) || 600;
  const dy = direction === "up" ? -px : px;
  log.info(`Scroll ${direction} ${px}px`);
  const vp = await evaluate("({ x: window.innerWidth/2, y: window.innerHeight/2 })").catch(() => null);
  const { x, y } = vp ?? { x: 400, y: 300 };
  await client.Input.dispatchMouseEvent({ type: "mouseWheel", x, y, deltaX: 0, deltaY: dy });
  return { ok: true };
}

async function _screenshot() {
  const client = cdpClient.getClient();
  if (!client) throw new Error("CDP not connected");
  const { data } = await client.Page.captureScreenshot({ format: "jpeg", quality: 70 });
  return { ok: true, data };
}

async function _pressKey(key) {
  const client = cdpClient.getClient();
  if (!client) throw new Error("CDP not connected");
  await client.Input.dispatchKeyEvent({ type: "keyDown", key });
  await client.Input.dispatchKeyEvent({ type: "keyUp",   key });
  return { ok: true };
}

// ── Public API: all actions go through the serial queue + retry ───────────────

const navigate    = (url)    => actionQueue.enqueue(() => actionQueue.withRetry(() => _navigate(url), 2));
const click       = (hints)  => actionQueue.enqueue(() => actionQueue.withRetry(() => _click(hints)));
const clickCoords = (x, y)   => actionQueue.enqueue(() => _clickCoords(x, y));
const type        = (params) => actionQueue.enqueue(() => actionQueue.withRetry(() => _type(params)));
const scroll      = (dir, amt) => actionQueue.enqueue(() => _scroll(dir, amt));
const screenshot  = ()       => actionQueue.enqueue(() => _screenshot());
const pressKey    = (key)    => actionQueue.enqueue(() => _pressKey(key));

module.exports = { navigate, click, clickCoords, type, scroll, screenshot, pressKey, evaluate };
