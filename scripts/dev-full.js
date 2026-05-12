#!/usr/bin/env node
// scripts/dev-full.js
// Starts Next.js and the Electron agent together.
// Waits for Next.js to be ready before launching the agent.
// No concurrently dependency needed — pure Node.js child_process.

"use strict";

const { spawn } = require("child_process");
const http      = require("http");

const HEALTH_URL      = "http://localhost:3000/api/agent/health";
const POLL_INTERVAL   = 1500;
const MAX_WAIT_MS     = 60_000;

// ── Start Next.js ─────────────────────────────────────────────────────────────
console.log("\x1b[36m[web]  \x1b[0m starting Next.js…");
const web = spawn("npx", ["next", "dev"], {
  stdio: "inherit",
  shell: true,
});

web.on("exit", (code) => {
  console.log(`\x1b[36m[web]  \x1b[0m exited (${code})`);
  agent?.kill();
  process.exit(code ?? 0);
});

// ── Poll until Next.js health endpoint responds ────────────────────────────────
let agent = null;
let waited = 0;

function poll() {
  if (waited >= MAX_WAIT_MS) {
    console.error("\x1b[31m[agent]\x1b[0m Next.js did not start in time — giving up");
    web.kill();
    process.exit(1);
  }

  http.get(HEALTH_URL, (res) => {
    if (res.statusCode === 200) {
      startAgent();
    } else {
      res.resume();
      waited += POLL_INTERVAL;
      setTimeout(poll, POLL_INTERVAL);
    }
  }).on("error", () => {
    waited += POLL_INTERVAL;
    setTimeout(poll, POLL_INTERVAL);
  });
}

setTimeout(poll, 2000);  // give Next.js a 2s head start before first poll

// ── Start Electron agent ──────────────────────────────────────────────────────
function startAgent() {
  console.log("\x1b[33m[agent]\x1b[0m Next.js ready — starting Electron agent…");
  agent = spawn("npm", ["run", "dev"], {
    cwd:   require("path").join(__dirname, "..", "electron-agent"),
    stdio: "inherit",
    shell: true,
  });

  agent.on("exit", (code) => {
    console.log(`\x1b[33m[agent]\x1b[0m exited (${code})`);
  });
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on("SIGINT",  () => { web.kill(); agent?.kill(); process.exit(0); });
process.on("SIGTERM", () => { web.kill(); agent?.kill(); process.exit(0); });
