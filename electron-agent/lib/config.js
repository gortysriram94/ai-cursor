// lib/config.js — L3: config + OS-aware paths
// All paths resolved through Electron's app.getPath("userData") so they
// work correctly on Windows, macOS, and Linux without hardcoding.

const path = require("path");

// Resolved at runtime via app.getPath — placeholder until app is ready
let _userData = null;

function setUserDataPath(p) {
  _userData = p;
}

function userData(...segments) {
  if (!_userData) throw new Error("userData path not set — call setUserDataPath first");
  return path.join(_userData, "Pushpa", ...segments);
}

// Chrome executable paths per OS
const CHROME_PATHS = {
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
  ],
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium",
  ],
};

const CDP_PORT         = 9333;  // dedicated port — avoids colliding with user's own Chrome on 9222
const SCREENCAST_PORT  = 9334;  // WebSocket server for real-time browser mirror + input relay
const WS_RECONNECT_BASE_MS  = 1_000;
const WS_RECONNECT_MAX_MS   = 30_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

// ── Server auto-discovery ─────────────────────────────────────────────────────
// Priority: explicit env var → localhost (dev) → production
// Whichever candidate responds to /api/health first wins.
// Result is cached for the lifetime of the process.

const DISCOVERY_CANDIDATES = [
  process.env.Pushpa_URL,          // 1. explicit override (dev/debug)
  "http://localhost:3000",             // 2. local Next.js dev server
  "https://app.Pushpa.io",          // 3. production
].filter(Boolean);

let _resolvedUrl = null;

const RESOLVE_MAX_ATTEMPTS = 8;
const RESOLVE_RETRY_MS     = 3_000;

async function resolveServer(log) {
  if (_resolvedUrl) return _resolvedUrl;

  for (let attempt = 1; attempt <= RESOLVE_MAX_ATTEMPTS; attempt++) {
    for (const candidate of DISCOVERY_CANDIDATES) {
      try {
        const res = await fetch(`${candidate}/api/agent/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          _resolvedUrl = candidate;
          if (log) log.info(`Server resolved: ${candidate}`);
          return candidate;
        }
      } catch {
        if (log) log.debug(`Server probe failed: ${candidate}`);
      }
    }

    if (attempt < RESOLVE_MAX_ATTEMPTS) {
      if (log) log.info(`Server not found — retry ${attempt}/${RESOLVE_MAX_ATTEMPTS} in ${RESOLVE_RETRY_MS / 1000}s`);
      await new Promise(r => setTimeout(r, RESOLVE_RETRY_MS));
    }
  }

  throw new Error(
    "No Pushpa server found after all retries. Start the web app (npm run dev) or check your network."
  );
}

// Synchronous read after resolveServer() has been called.
// Used by sse-client and heartbeat which need the URL without re-awaiting.
function getResolvedUrl() {
  return _resolvedUrl ?? "https://app.Pushpa.io";
}

module.exports = {
  setUserDataPath,
  userData,
  CHROME_PATHS,
  CDP_PORT,
  SCREENCAST_PORT,
  WS_RECONNECT_BASE_MS,
  WS_RECONNECT_MAX_MS,
  HEARTBEAT_INTERVAL_MS,
  resolveServer,
  getResolvedUrl,
};
