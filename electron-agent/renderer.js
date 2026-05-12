"use strict";

const el = document.getElementById("status");
const levelClass = { error: "error", status: "ok" };

window.tlAgent.onStatus(({ level, msg }) => {
  el.textContent = msg;
  el.className   = "status " + (levelClass[level] ?? "");
});

window.tlAgent.getStatus().then(s => {
  if (s) { el.textContent = s.msg; el.className = "status " + (levelClass[s.level] ?? ""); }
});
