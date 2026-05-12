// lib/agent-pool.js — L95: multi-agent coordination registry
// Tracks all active CDP agent slots and their busy state.
// The primary agent (port 9222) is always registered on boot.
// Additional slots can be registered if future multi-Chrome support is added.
//
// This module is a lightweight registry — it does not spawn Chrome processes.
// Spawning additional instances is handled by chrome-launcher in coordination
// with the web app orchestrator via the agent_pool_status SSE command.

"use strict";

const log = require("./logger");

const MAX_AGENTS = 4;

// Map<port, { port, busy, taskCount, registeredAt }>
const _agents = new Map();

function registerPrimary(port) {
  _agents.set(port, { port, busy: false, taskCount: 0, registeredAt: Date.now() });
  log.info(`AgentPool: primary slot registered (port ${port})`);
}

// Register an additional agent slot (called when a new Chrome instance starts)
function register(port) {
  if (_agents.size >= MAX_AGENTS) {
    log.warn(`AgentPool: max agents (${MAX_AGENTS}) reached — cannot register port ${port}`);
    return false;
  }
  _agents.set(port, { port, busy: false, taskCount: 0, registeredAt: Date.now() });
  log.info(`AgentPool: slot registered (port ${port}), pool size: ${_agents.size}`);
  return true;
}

function unregister(port) {
  _agents.delete(port);
  log.info(`AgentPool: slot removed (port ${port}), pool size: ${_agents.size}`);
}

// Mark a slot as busy (task started) or free (task completed)
function setBusy(port, busy) {
  const a = _agents.get(port);
  if (!a) return;
  a.busy = busy;
  if (!busy) a.taskCount++;
}

// Returns the first free slot's port, or null if all are busy
function getFreePort() {
  for (const [port, agent] of _agents) {
    if (!agent.busy) return port;
  }
  return null;
}

function size()      { return _agents.size; }
function canExpand() { return _agents.size < MAX_AGENTS; }

// Full status snapshot for the agent_pool_status SSE response
function getStatus() {
  return {
    size:      _agents.size,
    maxAgents: MAX_AGENTS,
    canExpand: canExpand(),
    agents:    Array.from(_agents.values()).map(a => ({
      port:         a.port,
      busy:         a.busy,
      taskCount:    a.taskCount,
      uptimeSec:    Math.round((Date.now() - a.registeredAt) / 1000),
    })),
  };
}

module.exports = { registerPrimary, register, unregister, setBusy, getFreePort, size, canExpand, getStatus };
