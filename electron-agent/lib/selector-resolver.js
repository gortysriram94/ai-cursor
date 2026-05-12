// lib/selector-resolver.js — L26–L32: multi-strategy element resolver
// Tries strategies in priority order, polls until timeout.
// Strategies: CSS selector → aria-label → placeholder → exact text → partial text
// All strategies pierce shadow DOM via recursive shadowQuery helper.
// Stale element detection: coords with zero bounding rect are skipped.

"use strict";

const cdpClient = require("./cdp-client");
const log       = require("./logger");

const POLL_MS = 200;

// Injected into every evaluation — recursive shadow DOM traversal
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
function coordsOf(el) {
  if (!el) return null;
  var r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
`;

async function evalCoords(body) {
  const client = cdpClient.getClient();
  if (!client) return null;
  try {
    const { result } = await client.Runtime.evaluate({
      expression:    `(function(){ ${SHADOW_FN} ${body} })()`,
      returnByValue: true,
      awaitPromise:  false,
    });
    return result?.value ?? null;
  } catch {
    return null;
  }
}

function buildStrategies({ selector, ariaLabel, placeholder, text }) {
  const strats = [];

  if (selector) {
    strats.push({
      name: `css:${selector}`,
      run:  () => evalCoords(`return coordsOf(shadowQuery(document, ${JSON.stringify(selector)}));`),
    });
  }

  if (ariaLabel) {
    // Prefer input/textarea with this aria-label — avoids accidentally matching a search button
    strats.push({
      name: `input-aria:${ariaLabel}`,
      run:  () => evalCoords(`
        var sel = 'input[aria-label*=${JSON.stringify(ariaLabel)}],textarea[aria-label*=${JSON.stringify(ariaLabel)}]';
        return coordsOf(shadowQuery(document, sel));
      `),
    });
    // Fallback: any element with this aria-label
    strats.push({
      name: `aria:${ariaLabel}`,
      run:  () => evalCoords(`return coordsOf(shadowQuery(document, '[aria-label*=${JSON.stringify(ariaLabel)}]'));`),
    });
  }

  // Site-agnostic search-input fallbacks — name="search_query" (YouTube), name="q" (Google),
  // type="search", then any visible text input near the top of the page
  strats.push({
    name: "search-input-fallback",
    run:  () => evalCoords(`
      var el = shadowQuery(document, 'input[name="search_query"]')
            || shadowQuery(document, 'input[name="q"]')
            || shadowQuery(document, 'input[type="search"]')
            || shadowQuery(document, 'input[name*="search"]');
      return coordsOf(el);
    `),
  });

  if (placeholder) {
    strats.push({
      name: `placeholder:${placeholder}`,
      run:  () => evalCoords(`return coordsOf(shadowQuery(document, '[placeholder*=${JSON.stringify(placeholder)}]'));`),
    });
  }

  if (text) {
    const needle = text.toLowerCase();

    // Exact text match — buttons and links first
    strats.push({
      name: `text-exact:${text}`,
      run:  () => evalCoords(`
        var n = ${JSON.stringify(needle)};
        var els = document.querySelectorAll("button,a,[role=button],[role=link],input[type=submit],label,span,div,li");
        for (var i = 0; i < els.length; i++) {
          if ((els[i].innerText||els[i].textContent||"").trim().toLowerCase() === n) {
            var c = coordsOf(els[i]); if (c) return c;
          }
        }
        return null;
      `),
    });

    // Partial text match — broader search
    strats.push({
      name: `text-partial:${text}`,
      run:  () => evalCoords(`
        var n = ${JSON.stringify(needle)};
        var els = document.querySelectorAll("button,a,[role=button],[role=link],input[type=submit]");
        for (var i = 0; i < els.length; i++) {
          var t = (els[i].innerText||els[i].textContent||"").trim().toLowerCase();
          if (t.indexOf(n) !== -1) { var c = coordsOf(els[i]); if (c) return c; }
        }
        return null;
      `),
    });
  }

  return strats;
}

async function resolve(hints, timeoutMs = 8000) {
  const strats = buildStrategies(hints);
  if (strats.length === 0) throw new Error("resolve: no element hints provided");

  const deadline = Date.now() + timeoutMs;
  let poll = 0;

  while (Date.now() < deadline) {
    for (const s of strats) {
      const coords = await s.run();
      if (coords) {
        if (poll > 0) log.debug(`Element resolved via ${s.name} (poll ${poll})`);
        return coords;
      }
    }
    poll++;
    await new Promise(r => setTimeout(r, POLL_MS));
  }

  const label = hints.selector || hints.text || hints.ariaLabel || hints.placeholder || "element";
  throw new Error(`Element not found: "${label}" (tried: ${strats.map(s => s.name).join(", ")})`);
}

module.exports = { resolve };
