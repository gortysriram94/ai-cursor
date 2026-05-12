// lib/net-filter.js — L94: optional network request blocking
// Blocks analytics and tracking domains to reduce page load noise.
// Opt-in: only active when Pushpa_BLOCK_RESOURCES=1 env var is set.
// Called once after every CDP connect (cdpClient.onReady in main.js).

"use strict";

const log = require("./logger");

// Well-known analytics / tracking / ad domains to block
const BLOCKED_DOMAINS = [
  "google-analytics.com",
  "googletagmanager.com",
  "doubleclick.net",
  "facebook.net",
  "connect.facebook.net",
  "hotjar.com",
  "segment.com",
  "mixpanel.com",
  "amplitude.com",
  "fullstory.com",
  "heap.io",
];

let _active = false;

async function apply(client) {
  if (!process.env.Pushpa_BLOCK_RESOURCES) return;

  try {
    await client.Network.enable();
    await client.Network.setBlockedURLs({
      urls: BLOCKED_DOMAINS.flatMap(d => [`*://${d}/*`, `*://*.${d}/*`]),
    });
    _active = true;
    log.info(`NetFilter: blocking ${BLOCKED_DOMAINS.length} analytics domains`);
  } catch (err) {
    log.warn("NetFilter: setup failed (non-fatal):", err.message);
  }
}

function isActive() { return _active; }

module.exports = { apply, isActive };
