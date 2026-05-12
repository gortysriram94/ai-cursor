// lib/extension-bridge.ts
// Races both connection paths simultaneously — first to respond wins.
// No sequential fallback that can double the timeout.

const TIMEOUT_MS = 20_000;

export async function extSend(msg: Record<string, unknown>): Promise<any> {
  if (typeof window === "undefined") throw new Error("no_window");

  const requestId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const cr = (window as any).chrome?.runtime;
  const extId = (window as any).__tl_ext_id as string | undefined;

  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => { if (!done) { done = true; fn(); } };

    const timer = setTimeout(() =>
      finish(() => reject(new Error("Extension not responding — make sure it's installed and enabled."))),
      TIMEOUT_MS
    );

    // Path A: externally_connectable — direct to service worker, no content script needed
    if (extId && cr?.sendMessage) {
      try {
        cr.sendMessage(extId, msg, (res: any) => {
          if (cr.lastError) return; // let Path B win if available
          finish(() => { clearTimeout(timer); resolve(res); });
        });
      } catch (_) { /* Path B will handle it */ }
    }

    // Path B: content script bridge — postMessage → content script → runtime.sendMessage
    const handler = (e: MessageEvent) => {
      if (e.data?.bridge !== "TL_EXT_RESPONSE" || e.data?.requestId !== requestId) return;
      window.removeEventListener("message", handler);
      finish(() => {
        clearTimeout(timer);
        if (e.data.error) reject(new Error(e.data.error));
        else resolve(e.data.response);
      });
    };
    window.addEventListener("message", handler);
    window.postMessage({ ...msg, bridge: "TL_EXT", requestId }, "*");
  });
}

export async function extAvailable(): Promise<boolean> {
  try { const r = await extSend({ type: "get_status" }); return r?.ok === true; }
  catch { return false; }
}

export function storeExtId(_id: string) {}
