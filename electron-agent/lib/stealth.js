// lib/stealth.js — L88: anti-detection hardening
// Patches navigator.webdriver, plugins, languages, and CDP debug globals
// so automation-detection scripts used by enterprise portals don't flag the session.
// Called once after every CDP connect (cdpClient.onReady in main.js).

"use strict";

const log = require("./logger");

// Injected before every new page document — removes the WebDriver fingerprint.
const STEALTH_SCRIPT = `
(function () {
  // Remove the main automation flag
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });

  // Restore plausible plugin count (0 plugins = headless flag for some detectors)
  if (navigator.plugins.length === 0) {
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  }

  // Restore language list to a natural single-locale value
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

  // Remove Chrome DevTools Protocol debug globals injected by some versions of Chromium
  const cdpKeys = Object.keys(window).filter(k => k.startsWith('cdc_') || k.startsWith('_cdc'));
  cdpKeys.forEach(k => { try { delete window[k]; } catch {} });
})();
`;

async function apply(client) {
  try {
    // Run the stealth script before any page JS executes
    await client.Page.addScriptToEvaluateOnNewDocument({ source: STEALTH_SCRIPT });

    // Best-effort: suppress the "Chrome is being controlled by automated software" infobar.
    // Emulation.setAutomationOverride exists only in some Chrome builds — ignore failures.
    await client.Emulation.setAutomationOverride({ enabled: false }).catch(() => {});

    log.info("Stealth: anti-detection patches applied");
  } catch (err) {
    log.warn("Stealth: setup failed (non-fatal):", err.message);
  }
}

module.exports = { apply };
