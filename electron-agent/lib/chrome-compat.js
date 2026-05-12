// lib/chrome-compat.js — L73–L78: Chrome version detection + feature flags
// Called once after CDP connects. Warns if Chrome is too old.
// Exposes hasFeature() so other modules can branch on capabilities.
//
// Minimum supported Chrome: 90 (April 2021).
// Input.insertText:   Chrome ≥ 73
// Target domain:      Chrome ≥ 72
// Page.frameNavigated: Chrome ≥ 72
// CSS.escape in page:  Chrome ≥ 46 (always safe)

"use strict";

const log = require("./logger");

const MIN_MAJOR = 90;

let _version  = null;  // "Chrome/120.0.6099.130"
let _major    = 0;
let _features = {};

async function check(client) {
  try {
    const info = await client.Browser.getVersion();
    _version = info.product ?? "";  // e.g. "Chrome/120.0.6099.130"
    const m  = _version.match(/(\d+)\./);
    _major   = m ? parseInt(m[1], 10) : 0;

    _features = {
      insertText:     _major >= 73,   // Input.insertText (reliable React typing)
      targetDomain:   _major >= 72,   // Target.setDiscoverTargets
      frameNavigated: _major >= 72,   // Page.frameNavigated
      supported:      _major >= MIN_MAJOR,
    };

    const status = _features.supported ? "OK" : `BELOW MINIMUM (${MIN_MAJOR})`;
    log.info(`Chrome ${_major} [${_version}] — ${status}`);

    if (!_features.supported) {
      log.warn(`Chrome ${_major} is below minimum (${MIN_MAJOR}). Upgrade Chrome for full functionality.`);
    }
    if (!_features.insertText) {
      log.warn(`Chrome ${_major} does not support Input.insertText — typing into React fields may fail.`);
    }

    return _features;
  } catch (err) {
    log.warn("Chrome version check failed:", err.message);
    // Optimistically assume all features present so we don't block execution
    _features = { insertText: true, targetDomain: true, frameNavigated: true, supported: true };
    return _features;
  }
}

function getVersion() { return _version; }
function getMajor()   { return _major; }

// Returns true if feature is present, or true if unknown (fail-open)
function hasFeature(name) {
  return Object.prototype.hasOwnProperty.call(_features, name) ? _features[name] : true;
}

module.exports = { check, getVersion, getMajor, hasFeature };
