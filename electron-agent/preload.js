// preload.js — IPC bridge between main process and renderer
// Exposes ONLY what the renderer needs: status updates.
// Real-world rule: renderer never gets raw automation data.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tlAgent", {
  // Renderer listens for status updates pushed from main process
  onStatus: (fn) => {
    ipcRenderer.on("agent:status", (_event, data) => fn(data));
  },
  // Renderer can request current status on load
  getStatus: () => ipcRenderer.invoke("agent:getStatus"),
});
