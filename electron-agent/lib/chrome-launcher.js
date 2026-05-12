// lib/chrome-launcher.js — L5: cross-platform Chrome launcher
// Finds Chrome on the current OS and launches it with CDP port open.
// Real-world blocker handled: Chrome already running with same profile.

const { spawn, execSync } = require("child_process");
const fs   = require("fs");
const path = require("path");
const { CHROME_PATHS, CDP_PORT, userData } = require("./config");
const log = require("./logger");

let _chromeProcess = null;

function findChrome() {
  const candidates = CHROME_PATHS[process.platform] ?? [];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch { /* skip */ }
  }
  // Last resort: try PATH
  try {
    const found = execSync("which google-chrome || which chromium 2>/dev/null")
      .toString().trim().split("\n")[0];
    if (found) return found;
  } catch { /* not on PATH */ }
  return null;
}

function launch(profileDir) {
  return new Promise((resolve, reject) => {
    const chromePath = findChrome();
    if (!chromePath) {
      return reject(new Error(
        "Chrome not found. Please install Google Chrome."
      ));
    }

    // Use a dedicated profile so we don't stomp the user's normal Chrome.
    // This profile persists across sessions — cookies, logins, etc. are kept.
    const profile = profileDir ?? userData("chrome-profile");
    fs.mkdirSync(profile, { recursive: true });

    const args = [
      `--remote-debugging-port=${CDP_PORT}`,
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--disable-session-crashed-bubble",
      "--disable-infobars",
      "--start-maximized",
    ];

    log.info(`Launching Chrome: ${chromePath}`);
    log.status("Starting browser…");

    _chromeProcess = spawn(chromePath, args, {
      detached: false,
      stdio:    "ignore",
    });

    _chromeProcess.on("error", err => {
      log.error("Chrome spawn error:", err.message);
      reject(err);
    });

    _chromeProcess.on("exit", (code, signal) => {
      log.warn(`Chrome exited code=${code} signal=${signal}`);
      _chromeProcess = null;
    });

    // Give Chrome time to open the CDP port (Windows can be slow)
    setTimeout(() => resolve(_chromeProcess), 3_000);
  });
}

function kill() {
  if (_chromeProcess) {
    try { _chromeProcess.kill(); } catch { /* already gone */ }
    _chromeProcess = null;
  }
}

function isRunning() {
  return _chromeProcess !== null && !_chromeProcess.killed;
}

module.exports = { launch, kill, isRunning, findChrome };
