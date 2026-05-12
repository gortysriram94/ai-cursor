// lib/iframe-agent.ts
// Agent that operates on the proxied iframe via postMessage.
// Claude reads the page, decides what to click/type, app sends the command.
// The injected agent script in the proxy executes it on the real DOM.

let _reqId = 0;

// Send a command to the iframe and wait for result
export function iframeCmd(
  iframe: HTMLIFrameElement,
  msg: Record<string, unknown>,
  timeout = 8000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const requestId = `agent_${++_reqId}`;

    const handler = (e: MessageEvent) => {
      if (e.data?.bridge !== "AGENT_RESPONSE") return;
      if (e.data?.requestId !== requestId) return;
      window.removeEventListener("message", handler);
      clearTimeout(timer);
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.result);
    };

    window.addEventListener("message", handler);
    const timer = setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error("iframe timeout"));
    }, timeout);

    iframe.contentWindow?.postMessage({ ...msg, bridge: "AGENT", requestId }, "*");
  });
}

// Read what's on the page right now
export async function readPage(iframe: HTMLIFrameElement) {
  return iframeCmd(iframe, { type: "agent_read" });
}

// Click something — by visible text or CSS selector
export async function clickEl(iframe: HTMLIFrameElement, text?: string, selector?: string) {
  return iframeCmd(iframe, { type: "agent_click", text, selector });
}

// Type into a field — by label, placeholder, or selector
export async function typeInto(iframe: HTMLIFrameElement, text: string, label?: string, selector?: string, clear = true) {
  return iframeCmd(iframe, { type: "agent_type", text, label, selector, clear });
}

// Press a key
export async function pressKey(iframe: HTMLIFrameElement, key: string) {
  return iframeCmd(iframe, { type: "agent_key", key });
}

// Scroll
export async function scroll(iframe: HTMLIFrameElement, deltaY = 600) {
  return iframeCmd(iframe, { type: "agent_scroll", deltaY });
}