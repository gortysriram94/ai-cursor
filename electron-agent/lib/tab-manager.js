// lib/tab-manager.js — L11: Chrome tab registry
// Tracks open tabs via CDP Target domain events.
// Re-initialises cleanly on CDP reconnect.

const CDP  = require("chrome-remote-interface");
const { CDP_PORT } = require("./config");
const log  = require("./logger");

let _tabs      = new Map();   // targetId → tab info
let _activeId  = null;
let _listeners = {};

function init(client) {
  _tabs.clear();

  // Discover all existing tabs
  CDP.List({ port: CDP_PORT }).then(targets => {
    for (const t of targets) {
      if (t.type === "page") {
        _tabs.set(t.id, t);
        if (!_activeId) _activeId = t.id;
      }
    }
    log.debug(`TabManager: ${_tabs.size} tab(s) found`);
  }).catch(() => {});

  // Watch for new / changed / closed tabs
  client.Target.setDiscoverTargets({ discover: true }).catch(() => {});

  client.Target.targetCreated(({ targetInfo: t }) => {
    if (t.type !== "page") return;
    _tabs.set(t.targetId, t);
    log.debug(`Tab opened: ${t.url}`);
    _emit("tab-created", t);
  });

  client.Target.targetDestroyed(({ targetId }) => {
    _tabs.delete(targetId);
    if (_activeId === targetId) _activeId = [..._tabs.keys()][0] ?? null;
    log.debug(`Tab closed: ${targetId}`);
    _emit("tab-closed", { targetId });
  });

  client.Target.targetInfoChanged(({ targetInfo: t }) => {
    if (t.type !== "page") return;
    _tabs.set(t.targetId, t);
    if (t.attached) _activeId = t.targetId;
    _emit("tab-updated", t);
  });
}

function getTabs() {
  return [..._tabs.values()];
}

function getActiveTab() {
  return _tabs.get(_activeId) ?? ([..._tabs.values()][0] ?? null);
}

function on(event, fn) {
  _listeners[event] = fn;
}

function _emit(event, data) {
  try { _listeners[event]?.(data); } catch {}
}

module.exports = { init, getTabs, getActiveTab, on };
