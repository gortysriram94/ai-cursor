// lib/canvas-agent.ts
// Agent that interacts with whatever is rendered in the BrowserViewNode iframe.
// Claude guides the logic. The app sends postMessage to the iframe to execute.
// No re-reading. Claude knows the content from the initial Jina read.

export interface CanvasState {
  browserUrls:    string[];
  browserActions: Array<{ label: string; url: string; description: string; meta?: string }>;
  messages:       Array<{ role: string; content: string }>;
  pageText:       string;
  task:           string;
}

export interface AgentStep {
  type:      "click" | "type" | "key" | "scroll" | "navigate" | "open_new" | "message" | "done" | "wait";
  text?:     string;   // visible text to click, or text to type
  selector?: string;   // CSS selector fallback
  key?:      string;   // Enter, Tab, Escape etc
  url?:      string;   // for navigate / open_new
  reason:    string;
}

export interface AgentCallbacks {
  navigate:     (url: string) => void;
  openNew:      (url: string) => void;
  sendMessage:  (msg: string) => void;
  updateStatus: (msg: string) => void;
  getIframe:    () => HTMLIFrameElement | null;
}

// Send a postMessage command to the iframe and wait for the response
function iframeCmd(
  iframe: HTMLIFrameElement,
  msg: Record<string, unknown>,
  timeout = 6000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const requestId = `a${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

    const handler = (e: MessageEvent) => {
      if (e.data?.bridge !== "AGENT_RESPONSE" || e.data?.requestId !== requestId) return;
      window.removeEventListener("message", handler);
      clearTimeout(timer);
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.result);
    };

    window.addEventListener("message", handler);
    const timer = setTimeout(() => {
      window.removeEventListener("message", handler);
      // Don't reject — iframe might be blocked. Just resolve empty.
      resolve({ error: "timeout" });
    }, timeout);

    try {
      iframe.contentWindow?.postMessage(
        { ...msg, bridge: "AGENT", requestId },
        "*"
      );
    } catch {
      clearTimeout(timer);
      window.removeEventListener("message", handler);
      resolve({ error: "cross-origin" });
    }
  });
}

// Ask Claude what to do next — it already knows the page content
async function getNextStep(
  task: string,
  knownContent: string,
  history: string[],
): Promise<AgentStep> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `You are controlling a browser. You already know the page content.

TASK: "${task}"

WHAT YOU KNOW ABOUT THE PAGE:
${knownContent.slice(0, 3000)}

STEPS TAKEN SO FAR: ${history.join(" → ") || "none"}

What is the single best next action to take on this page? Reply ONLY with JSON:
{
  "type": "click" | "type" | "key" | "scroll" | "navigate" | "open_new" | "message" | "done" | "wait",
  "text": "exact visible text of button/link to click, OR text to type into field",
  "selector": "#optional-css-selector",
  "key": "Enter|Tab|Escape|ArrowDown",
  "url": "https://... only for navigate or open_new",
  "reason": "one sentence"
}

Rules:
- click: use the exact visible button or link text from the page
- type: the text to enter into the currently relevant input field
- key: press a key after typing (Enter to submit)
- scroll: scroll down to see more
- navigate: go to a different URL in the same node
- open_new: open a URL in a second browser node
- message: send a status update to the user (use text field)
- done: task complete or needs user action (login, captcha, 2FA)
- wait: page is still loading`,
      conversationHistory: [],
    }),
  });

  const data = await res.json();
  try {
    return JSON.parse((data.response as string).replace(/```json|```/g, "").trim());
  } catch {
    return { type: "wait", reason: "Could not parse agent decision" };
  }
}

export async function runAgent(
  task:         string,
  knownContent: string,
  callbacks:    AgentCallbacks,
  maxSteps = 10,
): Promise<void> {
  const history: string[] = [];

  for (let step = 0; step < maxSteps; step++) {
    callbacks.updateStatus(`Step ${step + 1} — thinking…`);

    const action = await getNextStep(task, knownContent, history);
    const label  = `${action.type}${action.text ? `("${action.text}")` : action.url ? `(${action.url})` : ""}`;
    history.push(label);

    callbacks.updateStatus(`${label} — ${action.reason}`);

    const iframe = callbacks.getIframe();

    switch (action.type) {

      case "click":
        if (iframe) {
          const res = await iframeCmd(iframe, {
            type: "agent_click",
            text: action.text,
            selector: action.selector,
          });
          if (res?.error) {
            callbacks.sendMessage(`⚠️ Could not click "${action.text}" — ${res.error}`);
          }
          await sleep(1500); // wait for page reaction
        }
        break;

      case "type":
        if (iframe && action.text) {
          await iframeCmd(iframe, {
            type: "agent_type",
            text: action.text,
            selector: action.selector,
            clear: true,
          });
          await sleep(400);
        }
        break;

      case "key":
        if (iframe && action.key) {
          await iframeCmd(iframe, { type: "agent_key", key: action.key });
          await sleep(1000);
        }
        break;

      case "scroll":
        if (iframe) {
          await iframeCmd(iframe, { type: "agent_scroll", deltaY: 600 });
          await sleep(400);
        }
        break;

      case "navigate":
        if (action.url) {
          callbacks.navigate(action.url);
          await sleep(2500);
        }
        break;

      case "open_new":
        if (action.url) callbacks.openNew(action.url);
        await sleep(500);
        break;

      case "message":
        callbacks.sendMessage(action.text ?? action.reason);
        break;

      case "done":
        callbacks.updateStatus(`✅ ${action.reason}`);
        callbacks.sendMessage(`✅ Done: ${action.reason}`);
        return;

      case "wait":
        callbacks.updateStatus(`⏸ ${action.reason}`);
        callbacks.sendMessage(`⏸ Paused: ${action.reason}`);
        return;
    }
  }

  callbacks.sendMessage("Agent paused after max steps. Say **continue** to keep going.");
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));