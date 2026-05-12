// chrome-extension/background/service-worker.js
// Pushpa Agent — Commercial Grade v2.0
//
// • CDP (chrome.debugger) for real mouse/keyboard events — bypasses all bot detection
// • Shadow-aware DOM scanner — finds elements inside Web Components
// • Session persistence via chrome.storage.session — survives service worker restarts
// • Keep-alive via chrome.alarms — prevents Chrome killing the worker mid-task
// • Auto session recovery — reattaches to open tabs after worker restart
// -----------------------------------------------------------------------------

const sessions = new Map(); // sessionId → SessionInfo (in-memory, backed by storage)
const attachedTabs = new Set(); // tabIds with debugger already attached
let lastSenderTabId = null;

// ── Session persistence ────────────────────────────────────────────────────────
// chrome.storage.session persists for the browser session (cleared on browser restart)
// but survives service worker restarts within the same session.

async function saveSessionsToStorage() {
  try {
    const data = {};
    for (const [sid, session] of sessions.entries()) {
      data[sid] = {
        activeTabId: session.activeTabId,
        windowId:    session.windowId,
        tabs: Object.fromEntries(
          [...session.tabs.entries()].map(([tid, t]) => [String(tid), t])
        ),
      };
    }
    await chrome.storage.session.set({ tl_sessions: data });
  } catch (_) { /* storage unavailable */ }
}

async function loadSessionsFromStorage() {
  try {
    const stored = await chrome.storage.session.get('tl_sessions');
    if (!stored.tl_sessions) return;
    for (const [sid, data] of Object.entries(stored.tl_sessions)) {
      const session = getOrCreateSession(sid);
      session.activeTabId = data.activeTabId;
      session.windowId    = data.windowId;
      for (const [tidStr, tabInfo] of Object.entries(data.tabs || {})) {
        session.tabs.set(parseInt(tidStr), tabInfo);
      }
    }
    console.log(`[Pushpa] Restored ${sessions.size} session(s) from storage`);
  } catch (_) { /* storage unavailable */ }
}

// ── Keep-alive: prevent service worker from being killed mid-task ─────────────
// Chrome kills idle MV3 service workers after ~30s. We use a 25s alarm to
// wake it up periodically when a session is active.

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'tl_keepalive') {
    if (sessions.size > 0) {
      chrome.alarms.create('tl_keepalive', { delayInMinutes: 25 / 60 });
    }
  }
});

function startKeepAlive() {
  chrome.alarms.create('tl_keepalive', { delayInMinutes: 25 / 60 });
}
function stopKeepAlive() {
  chrome.alarms.clear('tl_keepalive');
}

// Auto-restore sessions when service worker wakes up
loadSessionsFromStorage();

const SessionInfo = {
  windowId: null,
  tabs: new Map(), // tabId → TabInfo
  activeTabId: null,
};

const TabInfo = {
  tabId: 0,
  url: '',
  title: '',
  status: 'loading',
  isDone: false,
  lastActive: Date.now(),
  createdAt: Date.now(),
};

// ── Debugger helpers (Real clicks/typing) ──────────────────────────
async function debuggerAttach(tabId) {
  if (attachedTabs.has(tabId)) return true;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attachedTabs.add(tabId);
    console.log(`[Pushpa] Debugger attached to tab ${tabId}`);
    return true;
  } catch (e) {
    if (e.message?.includes('already')) { attachedTabs.add(tabId); return true; }
    console.warn(`[Pushpa] Debugger attach failed (tab ${tabId}):`, e.message);
    return false;
  }
}

async function debuggerDetach(tabId) {
  try {
    await chrome.debugger.detach({ tabId });
    console.log(`[Pushpa] Debugger detached from tab ${tabId}`);
  } catch (_) { /* ignore */ }
}

async function debuggerClick(tabId, x, y) {
  try {
    // Ensure debugger is attached
    await debuggerAttach(tabId);
    // Send Input.DispatchMouseEvent (Chrome DevTools Protocol)
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x, y,
      button: 'left',
      clickCount: 1,
    });
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x, y,
      button: 'left',
      clickCount: 1,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function debuggerType(tabId, text) {
  try {
    await debuggerAttach(tabId);
    // Type each character with a small delay (human-like)
    for (const ch of text) {
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        text: ch,
      });
      await new Promise(r => setTimeout(r, 30 + Math.random() * 50));
    }
    // Press Enter at the end
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function debuggerScroll(tabId, deltaY) {
  try {
    await debuggerAttach(tabId);
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 100, // arbitrary point
      y: 100,
      deltaX: 0,
      deltaY: deltaY,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Shadow-Aware Scanner ──────────────────────────────────────────
function buildShadowAwareScanner() {
  return function scanDOM() {
    const elements = [];
    const textBlocks = [];
    const finePrint = [];
    const seen = new Set();
    let idCounter = 0;

    // Helper: recursively scan through ShadowRoots
    function scanNode(node, depth = 0) {
      if (depth > 10) return; // prevent infinite recursion

      // Skip script/style
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'noscript') return;

        const rect = node.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        if (rect.bottom < 0 || rect.top > window.innerHeight * 2) return; // off-screen

        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) <= 0) return;

        // Check for ShadowRoot
        if (node.shadowRoot) {
          scanNode(node.shadowRoot, depth + 1);
        }

        // Interactive elements
        const isInteractive = [
          'a', 'button', 'input', 'select', 'textarea', 'details', 'summary'
        ].includes(tag) ||
          node.getAttribute('role') ||
          node.getAttribute('tabindex') === '0' ||
          node.onclick !== null;

        if (isInteractive) {
          const id = `el_${++idCounter}`;
          const text = (node.innerText || node.value || node.getAttribute('aria-label') || '').trim().slice(0, 120);
          const hint = node.getAttribute('aria-label') || node.getAttribute('title') || '';
          const isInView = rect.top >= 0 && rect.bottom <= window.innerHeight;

          elements.push({
            id, tag, role: node.getAttribute('role') || tag,
            text, hint, inputType: node.type || '', href: node.href || '',
            coords: { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2),
                       w: Math.round(rect.width), h: Math.round(rect.height) },
            inView: isInView,
            isFinePrint: false,
          });
        }

        // Text blocks (for fine print scanning)
        if (tag === 'p' || tag === 'span' || tag === 'div' || tag === 'section') {
          const text = (node.innerText || '').trim();
          if (text.length > 20) {
            const isFP = /terms|conditions|privacy|disclaimer|cancel|auto.?renew|fee|APR/i.test(text);
            if (isFP) finePrint.push(text.slice(0, 300));
          }
        }
      }

      // Recurse into child nodes
      if (node.children) {
        for (const child of node.children) {
          scanNode(child, depth);
        }
      }

      // Also scan ShadowRoot if present
      if (node.shadowRoot) {
        scanNode(node.shadowRoot, depth + 1);
      }
    }

    // Start from document.body (or document.documentElement)
    scanNode(document.body || document.documentElement);

    return {
      url: location.href,
      title: document.title,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      scrollY: window.scrollY,
      elements: elements.slice(0, 80),
      textBlocks: textBlocks,
      finePrint: [...new Set(finePrint)].slice(0, 10),
      scannedAt: Date.now(),
    };
  };
}

// ── Session helpers ────────────────────────────────────────────────
function getOrCreateSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { ...SessionInfo, tabs: new Map() });
  }
  return sessions.get(sessionId);
}

function getActiveTabId(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  return session.activeTabId || [...session.tabs.keys()][0] || null;
}

// Session recovery — the service worker can be killed and restarted by Chrome
// at any time. When it restarts, the sessions Map is empty but the real Chrome
// tab is still open. This finds the most recently active non-extension tab
// and re-registers it under the sessionId so operations don't fail.
async function recoverSession(sessionId) {
  if (getActiveTabId(sessionId)) return getActiveTabId(sessionId);
  try {
    const tabs = await chrome.tabs.query({ active: true });
    const tab  = tabs.find(t => t.url && !t.url.startsWith('chrome') && !t.url.startsWith('chrome-extension'));
    if (!tab?.id) return null;
    const session = getOrCreateSession(sessionId);
    session.tabs.set(tab.id, { tabId: tab.id, url: tab.url || '', title: tab.title || '',
      status: 'complete', isDone: false, lastActive: Date.now(), createdAt: Date.now() });
    session.activeTabId = tab.id;
    console.log(`[Pushpa] Session recovered — reattached tab ${tab.id} (${tab.url})`);
    return tab.id;
  } catch { return null; }
}

// ── Message handlers ──────────────────────────────────────────────────
chrome.runtime.onMessageExternal.addListener((msg, sender, respond) => {
  handleMessage(msg, respond, sender);
  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (sender?.tab?.id) lastSenderTabId = sender.tab.id;
  handleMessage(msg, respond, sender);
  return true;
});

async function handleMessage(msg, respond, sender) {
  const senderTabId = sender?.tab?.id ?? lastSenderTabId;

  try {
    switch (msg.type) {

      // ── DEBUGGER: Real click at coordinates ──────────────────────
      case 'DEBUGGER_CLICK': {
        const { x, y, tabId: reqTabId } = msg;
        const tabId = reqTabId || senderTabId || getActiveTabId(msg.sessionId);
        if (!tabId) return respond({ ok: false, error: 'No tab' });

        const res = await debuggerClick(tabId, x, y);
        respond(res);
        break;
      }

      // ── DEBUGGER: Real typing into input ──────────────────────
      case 'DEBUGGER_TYPE': {
        const { text, tabId: reqTabId } = msg;
        const tabId = reqTabId || senderTabId || getActiveTabId(msg.sessionId);
        if (!tabId) return respond({ ok: false, error: 'No tab' });

        const res = await debuggerType(tabId, text);
        respond(res);
        break;
      }

      // ── DEBUGGER: Scroll page ──────────────────────────────────
      case 'DEBUGGER_SCROLL': {
        const { deltaY, tabId: reqTabId } = msg;
        const tabId = reqTabId || senderTabId || getActiveTabId(msg.sessionId);
        if (!tabId) return respond({ ok: false, error: 'No tab' });

        const res = await debuggerScroll(tabId, deltaY || 600);
        respond(res);
        break;
      }

      // ── Shadow-Aware Sovereign Scan ────────────────────────
      case 'vb_sovereign_scan': {
        const tabId = msg.tabId || await recoverSession(msg.sessionId);
        if (!tabId) return respond({ ok: false, error: 'No session or tab — reload extension' });

        try {
          const res = await chrome.scripting.executeScript({
            target: { tabId },
            func: buildShadowAwareScanner(),
          });
          respond({ ok: true, scan: res[0]?.result });
        } catch (e) {
          respond({ ok: false, error: e.message });
        }
        break;
      }

      // ── Open/Navigate tab ──────────────────────────────────
      case 'vb_open':
      case 'vb_navigate': {
        const { url, sessionId } = msg;
        const session = getOrCreateSession(sessionId);

        if (session.tabs.size > 0) {
          const activeTabId = getActiveTabId(sessionId);
          if (activeTabId) {
            try {
              await chrome.tabs.update(activeTabId, { url });
              // Respond immediately — don't block on waitForLoad for slow sites
              respond({ ok: true, tabId: activeTabId, url });
              waitForLoad(activeTabId).then(async () => {
                try {
                  const tab = await chrome.tabs.get(activeTabId);
                  session.tabs.set(activeTabId, { ...TabInfo, tabId: tab.id, url: tab.url || url, title: tab.title || '' });
                  await saveSessionsToStorage();
                } catch (_) {}
              });
              break;
            } catch { /* continue to create new tab */ }
          }
        }

        const tab = await chrome.tabs.create({ url, active: true });
        if (!tab?.id) return respond({ ok: false, error: 'No tab created' });

        session.tabs.set(tab.id, { ...TabInfo, tabId: tab.id, url, title: '' });
        session.activeTabId = tab.id;
        session.windowId    = tab.windowId;
        startKeepAlive(); // keep worker alive while tab is active
        await saveSessionsToStorage(); // persist so worker restart doesn't lose it
        // Respond immediately — don't block caller waiting for page load.
        // Heavy sites (Amazon, Google) can take 10-15s; the caller has a 30s timeout
        // but we want to unblock it so it can start reading the page while it loads.
        respond({ ok: true, tabId: tab.id, url });
        // Update session metadata once the page fully loads (background, non-blocking)
        waitForLoad(tab.id).then(async () => {
          try {
            const loaded = await chrome.tabs.get(tab.id);
            session.tabs.set(tab.id, { ...TabInfo, tabId: loaded.id, url: loaded.url || url, title: loaded.title || '' });
            await saveSessionsToStorage();
          } catch (_) { /* tab may have been closed */ }
        });
        break;
      }

      // ── Click by selector/text (fallback) ────────────────────
      case 'vb_click': {
        const { text, selector, ariaLabel, tabId: reqTabId } = msg;
        const tabId = reqTabId || senderTabId || await recoverSession(msg.sessionId);
        if (!tabId) return respond({ ok: false, error: 'No session or tab — reload extension' });

        const res = await chrome.scripting.executeScript({
          target: { tabId },
          func: (text, selector, ariaLabel) => {
            let el = null;
            if (selector) el = document.querySelector(selector);
            if (!el && ariaLabel) el = document.querySelector(`[aria-label="${ariaLabel}"]`);
            if (!el && text) {
              const lower = text.toLowerCase();
              const candidates = document.querySelectorAll('a[href],button,input[type="submit"],input[type="button"],[role="button"]');
              for (const c of candidates) {
                const t = (c.innerText || c.value || c.textContent || '').toLowerCase();
                if (t.includes(lower) || lower.includes(t)) { el = c; break; }
              }
            }
            if (!el) return { ok: false, error: `Not found: ${text || selector || ariaLabel}` };

            // Check if element is visible
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) {
              // Might be inside a closed shadow DOM or overlay — try scrolling to it
              el.scrollIntoView({ behavior: 'instant', block: 'center' });
            }

            el.click();
            return { ok: true, clicked: (el.innerText || el.value || el.tagName || '').trim().slice(0, 60) };
          },
          args: [text ?? null, selector ?? null, ariaLabel ?? null],
        });
        respond(res[0]?.result ?? { ok: false, error: 'Script failed' });
        break;
      }

      // ── Type into input ──────────────────────────────────────────
      // Strategy: find input coordinates → CDP click to focus → CDP type.
      // Pure coordinate-based approach works on ALL sites regardless of
      // shadow DOM, React, Angular, Polymer, or any JS framework.
      case 'vb_type': {
        const { text, selector, ariaLabel, tabId: reqTabId } = msg;
        const tabId = reqTabId || senderTabId || await recoverSession(msg.sessionId);
        if (!tabId) return respond({ ok: false, error: 'No session or tab — reload extension' });

        try {
          await debuggerAttach(tabId);

          // Step 1: find input coordinates via shadow-aware scan (main world)
          let tx = 0, ty = 0;
          try {
            const scanRes = await chrome.scripting.executeScript({
              target: { tabId }, world: 'MAIN',
              func: (aria, sel) => {
                function findCoords(root, aria, sel) {
                  let el = null;
                  if (sel) el = root.querySelector(sel);
                  if (!el && aria) {
                    el = root.querySelector(`input[aria-label*="${aria}"], textarea[aria-label*="${aria}"]`)
                      || root.querySelector(`input[placeholder*="${aria}"], textarea[placeholder*="${aria}"]`)
                      || root.querySelector(`input[name="search_query"], input[name="q"], input[name="field-keywords"]`)
                      || root.querySelector(`input[name*="${aria.toLowerCase()}"]`);
                  }
                  if (!el) el = root.querySelector('input[type="search"], input[name="search_query"], input[name="q"], textarea[name="q"], input[type="text"], textarea');
                  if (el) {
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 && r.top >= 0) return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) };
                  }
                  for (const h of root.querySelectorAll('*')) {
                    if (h.shadowRoot) { const c = findCoords(h.shadowRoot, aria, sel); if (c) return c; }
                  }
                  return null;
                }
                return findCoords(document, aria, sel);
              },
              args: [ariaLabel ?? msg.ariaLabel ?? null, selector ?? null],
            });
            const c = scanRes[0]?.result;
            if (c?.x && c?.y) { tx = c.x; ty = c.y; }
          } catch (_) {}

          // Fallback: click middle of viewport near top (search bars are always in header)
          if (!tx || !ty) {
            const layout = await chrome.debugger.sendCommand({ tabId }, 'Page.getLayoutMetrics');
            tx = Math.round(layout.visualViewport.clientWidth / 2);
            ty = 55;
          }

          // Focus and type in the search bar
          if (tx > 0 && ty > 0) {
            await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: tx, y: ty, button: 'left', clickCount: 1 });
            await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: tx, y: ty, button: 'left', clickCount: 1 });
            await new Promise(r => setTimeout(r, 150));
          }

          for (const ch of (text ?? '')) {
            const vk = ch.toUpperCase().charCodeAt(0);
            await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch, windowsVirtualKeyCode: vk });
            await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'char',    text: ch });
            await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'keyUp',   text: ch, key: ch, windowsVirtualKeyCode: vk });
            await new Promise(r => setTimeout(r, 80));
          }

          await new Promise(r => setTimeout(r, 200));

          // Navigate to search URL — guaranteed to show results
          const tabInfo = await chrome.tabs.get(tabId);
          const host = new URL(tabInfo.url || 'https://google.com').hostname;
          const q = encodeURIComponent(text ?? '');
          const searchUrl = host.includes('youtube') ? `https://www.youtube.com/results?search_query=${q}`
            : host.includes('amazon')   ? `https://www.amazon.com/s?k=${q}`
            : host.includes('google')   ? `https://www.google.com/search?q=${q}`
            : host.includes('linkedin') ? `https://www.linkedin.com/search/results/all/?keywords=${q}`
            : host.includes('twitter') || host.includes('x.com') ? `https://x.com/search?q=${q}`
            : `https://www.google.com/search?q=${q}`;

          await chrome.tabs.update(tabId, { url: searchUrl });
          await waitForLoad(tabId);

          respond({ ok: true, typed: (text ?? '').slice(0, 30) });
        } catch (e) {
          respond({ ok: false, error: `Typing failed: ${e.message}` });
        }
        break;
      }

      // ── Scroll ────────────────────────────────────────────────────
      case 'vb_scroll': {
        const { direction, amount, tabId: reqTabId } = msg;
        const tabId = reqTabId || senderTabId || await recoverSession(msg.sessionId);
        if (!tabId) return respond({ ok: false, error: 'No session or tab — reload extension' });

        const res = await chrome.scripting.executeScript({
          target: { tabId },
          func: (direction, amount) => {
            const delta = direction === 'down' ? (amount || 600) : -(amount || 600);
            window.scrollBy({ top: delta, behavior: 'smooth' });
            return { ok: true, scrolled: delta };
          },
          args: [direction ?? 'down', amount ?? 600],
        });
        respond(res[0]?.result ?? { ok: false, error: 'Script failed' });
        break;
      }

      // ── Click at pixel coordinates (CDP — works on background tabs) ────
      case 'vb_click_coords': {
        const tabId = msg.tabId || await recoverSession(msg.sessionId);
        if (!tabId) return respond({ ok: false, error: 'No session or tab — reload extension' });

        const cx = msg.x ?? 0;
        const cy = msg.y ?? 0;
        const slave = msg.slave ?? 1;

        // Highlight ring at the click point so screenshots show WHERE the agent is clicking
        const SLAVE_COLORS_SW = { 1: '#3b82f6', 2: '#22c55e', 3: '#f59e0b' };
        const color = SLAVE_COLORS_SW[slave] || '#3b82f6';

        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            func: (x, y, c) => {
              // Remove any previous indicator
              document.getElementById('__tl_click__')?.remove();
              document.getElementById('__tl_click_style__')?.remove();

              const style = document.createElement('style');
              style.id = '__tl_click_style__';
              style.textContent = `
                @keyframes __tlPulse { 0%{transform:scale(.5);opacity:1} 100%{transform:scale(3);opacity:0} }
                @keyframes __tlDot   { 0%{opacity:1} 80%{opacity:1} 100%{opacity:0} }
              `;

              const ring = document.createElement('div');
              ring.id = '__tl_click__';
              ring.style.cssText = `
                position:fixed; left:${x-18}px; top:${y-18}px;
                width:36px; height:36px; border-radius:50%;
                border:2px solid ${c}; box-shadow:0 0 12px ${c};
                z-index:2147483647; pointer-events:none;
                animation:__tlPulse .7s ease-out forwards;
              `;

              const dot = document.createElement('div');
              dot.style.cssText = `
                position:fixed; left:${x-5}px; top:${y-5}px;
                width:10px; height:10px; border-radius:50%;
                background:${c}; box-shadow:0 0 8px ${c};
                z-index:2147483647; pointer-events:none;
                animation:__tlDot .7s ease-out forwards;
              `;

              (document.head || document.documentElement).appendChild(style);
              document.body.appendChild(ring);
              document.body.appendChild(dot);
              setTimeout(() => { ring.remove(); dot.remove(); style.remove(); }, 800);
            },
            args: [cx, cy, color],
          });
        } catch (_) { /* highlight is best-effort */ }

        const clicks = msg.clickCount ?? 1;
        await debuggerAttach(tabId);
        for (let i = 0; i < clicks; i++) {
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: clicks });
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: clicks });
          if (clicks > 1) await new Promise(r => setTimeout(r, 50));
        }
        respond({ ok: true });
        break;
      }

      // ── Screenshot via CDP Page.captureScreenshot ──────────────────
      // Works on background tabs — captureVisibleTab only works on focused tabs.
      case 'vb_screenshot': {
        const tabId = msg.tabId || await recoverSession(msg.sessionId);
        if (!tabId) return respond({ ok: false, error: 'No session or tab — reload extension' });

        // Try CDP Page.captureScreenshot first — works on background tabs.
        // Falls back to captureVisibleTab if debugger can't attach (e.g. special pages).
        const tryCapture = async () => {
          await debuggerAttach(tabId);
          const r = await chrome.debugger.sendCommand(
            { tabId }, 'Page.captureScreenshot',
            { format: 'jpeg', quality: msg.quality ?? 75, fromSurface: true }
          );
          return `data:image/jpeg;base64,${r.data}`;
        };

        try {
          const screenshot = await tryCapture();
          respond({ ok: true, screenshot });
        } catch (_) {
          // Retry once after a short pause (debugger may need a moment)
          try {
            await new Promise(r => setTimeout(r, 400));
            const screenshot = await tryCapture();
            respond({ ok: true, screenshot });
          } catch (err) {
            // Final fallback: captureVisibleTab (only works if tab is in front)
            try {
              const tab = await chrome.tabs.get(tabId);
              const dataUrl = await chrome.tabs.captureVisibleTab(
                tab.windowId, { format: 'jpeg', quality: 70 }
              );
              respond({ ok: true, screenshot: dataUrl });
            } catch (e2) {
              respond({ ok: false, error: `Screenshot failed: ${e2.message}` });
            }
          }
        }
        break;
      }

      // ── Get page content ──────────────────────────────────────────
      case 'vb_get_content': {
        const tabId = msg.tabId || await recoverSession(msg.sessionId);
        if (!tabId) return respond({ ok: false, error: 'No session or tab — reload extension' });

        const res = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const clone = document.documentElement.cloneNode(true);
            ['script', 'style', 'noscript', 'svg', 'iframe'].forEach(t =>
              clone.querySelectorAll(t).forEach(el => el.remove())
            );
            return {
              title: document.title,
              url: location.href,
              text: (clone.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 12000),
            };
          },
        });
        respond({ ok: true, content: res[0]?.result });
        break;
      }

      // ── List tabs in session ────────────────────────────────
      case 'vb_list_tabs': {
        const session = sessions.get(msg.sessionId);
        if (!session) return respond({ ok: false, error: 'No session', tabs: [] });

        const tabs = [];
        for (const [tid, info] of session.tabs) {
          try {
            const tab = await chrome.tabs.get(tid);
            tabs.push({
              tabId: tid,
              url: tab.url || info.url,
              title: tab.title || info.title,
              status: tab.status || info.status,
              isDone: info.isDone,
              isActive: tid === session.activeTabId,
              lastActive: info.lastActive,
              createdAt: info.createdAt,
            });
          } catch {
            session.tabs.delete(tid); // Tab was closed
          }
        }
        respond({ ok: true, tabs, activeTabId: session.activeTabId });
        break;
      }

      // ── Close tab/window ────────────────────────────────────
      case 'vb_close':
      case 'vb_close_window': {
        const sessionId = msg.sessionId;
        const session = sessions.get(sessionId);
        if (session) {
          for (const tabId of session.tabs.keys()) {
            await chrome.tabs.remove(tabId).catch(() => {});
          }
          sessions.delete(sessionId);
        }
        respond({ ok: true });
        break;
      }

      // ── User keyboard input from browser node ────────────────────
      case 'vb_key': {
        const tabId = msg.tabId || await recoverSession(msg.sessionId);
        if (!tabId) return respond({ ok: false, error: 'No tab' });
        await debuggerAttach(tabId);
        const mods = msg.modifiers ?? 0;
        if (msg.text && msg.text.length === 1) {
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'keyDown', text: msg.text, key: msg.key, windowsVirtualKeyCode: msg.vk, modifiers: mods });
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'char',    text: msg.text });
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'keyUp',   text: msg.text, key: msg.key, windowsVirtualKeyCode: msg.vk, modifiers: mods });
        } else {
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'keyDown', key: msg.key, code: msg.code, windowsVirtualKeyCode: msg.vk, modifiers: mods, nativeVirtualKeyCode: msg.vk, unmodifiedText: msg.key === 'Return' ? '\r' : '' });
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'keyUp',   key: msg.key, code: msg.code, windowsVirtualKeyCode: msg.vk, modifiers: mods });
        }
        respond({ ok: true });
        break;
      }

      // ── Page map: unified perception layer for LLM ──────────────────────────
      // Returns text + structured UI elements (buttons, inputs) WITH css selectors.
      // The LLM uses this to decide actions without guessing at coordinates.
      case 'vb_get_page_map': {
        const tabId = msg.tabId || await recoverSession(msg.sessionId);
        if (!tabId) return respond({ ok: false, error: 'No session or tab' });

        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              // Minimal unique selector: id > name > nth-child path (max 4 levels)
              function sel(el) {
                if (el.id) return '#' + CSS.escape(el.id);
                if (el.getAttribute('name')) return `[name="${el.getAttribute('name')}"]`;
                const path = [];
                let cur = el;
                for (let i = 0; i < 4 && cur && cur !== document.body; i++) {
                  let seg = cur.tagName.toLowerCase();
                  const parent = cur.parentElement;
                  if (parent) {
                    const siblings = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
                    if (siblings.length > 1) seg += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
                  }
                  path.unshift(seg);
                  cur = cur.parentElement;
                }
                return path.join(' > ');
              }

              // Visible interactive elements only
              function visible(el) {
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) return false;
                if (r.top > window.innerHeight * 2 || r.bottom < 0) return false;
                const s = getComputedStyle(el);
                return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0;
              }

              const buttons = Array.from(document.querySelectorAll(
                'button, a[href], [role="button"], input[type="submit"], input[type="button"]'
              ))
                .filter(visible)
                .slice(0, 40)
                .map(el => ({
                  text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 80),
                  selector: sel(el),
                  href: el.href || null,
                }))
                .filter(b => b.text);

              const inputs = Array.from(document.querySelectorAll(
                'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'
              ))
                .filter(visible)
                .slice(0, 20)
                .map(el => ({
                  type: el.type || el.tagName.toLowerCase(),
                  placeholder: el.placeholder || '',
                  name: el.name || '',
                  id: el.id || '',
                  label: (el.labels?.[0]?.textContent || el.getAttribute('aria-label') || '').trim(),
                  selector: sel(el),
                  value: el.type === 'password' ? '' : (el.value || ''),
                }));

              // Clean page text
              const clone = document.documentElement.cloneNode(true);
              clone.querySelectorAll('script,style,noscript,svg,iframe,nav,footer,header').forEach(n => n.remove());
              const text = (clone.innerText || '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000);

              return {
                url: location.href,
                title: document.title,
                text,
                buttons,
                inputs,
              };
            },
          });

          respond({ ok: true, map: results[0]?.result ?? null });
        } catch (e) {
          respond({ ok: false, error: e.message });
        }
        break;
      }

      // ── Execute a structured action from the LLM ─────────────────────────────
      // Accepts: {action:"click"|"type"|"select", selector, text, value}
      // The LLM never deals with coordinates — only semantic selectors.
      case 'vb_execute_action': {
        const tabId = msg.tabId || await recoverSession(msg.sessionId);
        if (!tabId) return respond({ ok: false, error: 'No session or tab' });

        const { action, selector, text: elText, value } = msg;
        try {
          if (action === 'click') {
            // Try CDP coordinate click for reliability, fall back to DOM click
            const coords = await chrome.scripting.executeScript({
              target: { tabId },
              func: (sel, txt) => {
                let el = sel ? document.querySelector(sel) : null;
                if (!el && txt) {
                  for (const c of document.querySelectorAll('a,button,[role="button"],input[type="submit"]')) {
                    if ((c.innerText || c.value || '').toLowerCase().includes(txt.toLowerCase())) { el = c; break; }
                  }
                }
                if (!el) return null;
                el.scrollIntoView({ block: 'center', behavior: 'instant' });
                const r = el.getBoundingClientRect();
                return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
              },
              args: [selector || null, elText || null],
            });
            const c = coords[0]?.result;
            if (c?.x && c?.y) {
              await debuggerAttach(tabId);
              await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
              await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
              respond({ ok: true, clicked: elText || selector });
            } else {
              respond({ ok: false, error: `Element not found: ${elText || selector}` });
            }
          } else if (action === 'type') {
            // Focus via CDP click then type
            const coords = await chrome.scripting.executeScript({
              target: { tabId },
              func: (sel) => {
                const el = sel ? document.querySelector(sel) : document.querySelector('input:not([type=hidden]),textarea');
                if (!el) return null;
                el.scrollIntoView({ block: 'center', behavior: 'instant' });
                const r = el.getBoundingClientRect();
                return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
              },
              args: [selector || null],
            });
            const c = coords[0]?.result;
            if (c?.x && c?.y) {
              await debuggerAttach(tabId);
              await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
              await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
              await new Promise(r => setTimeout(r, 100));
              for (const ch of String(value ?? '')) {
                const vk = ch.toUpperCase().charCodeAt(0);
                await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch, windowsVirtualKeyCode: vk });
                await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'char', text: ch });
                await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'keyUp', text: ch, key: ch, windowsVirtualKeyCode: vk });
                await new Promise(r => setTimeout(r, 40));
              }
              respond({ ok: true, typed: String(value ?? '').slice(0, 30) });
            } else {
              respond({ ok: false, error: `Input not found: ${selector}` });
            }
          } else {
            respond({ ok: false, error: `Unknown action: ${action}` });
          }
        } catch (e) {
          respond({ ok: false, error: e.message });
        }
        break;
      }

      // ── vb_open_window — alias for vb_navigate (Case B: real tab, no fetch) ──
      case 'vb_open_window': {
        const { url, sessionId } = msg;
        const session = getOrCreateSession(sessionId);

        if (session.tabs.size > 0) {
          const activeTabId = getActiveTabId(sessionId);
          if (activeTabId) {
            try {
              await chrome.tabs.update(activeTabId, { url });
              respond({ ok: true, tabId: activeTabId, url });
              waitForLoad(activeTabId).then(async () => {
                try {
                  const tab = await chrome.tabs.get(activeTabId);
                  session.tabs.set(activeTabId, { ...TabInfo, tabId: tab.id, url: tab.url || url, title: tab.title || '' });
                  await saveSessionsToStorage();
                } catch (_) {}
              });
              break;
            } catch { /* create new tab below */ }
          }
        }

        const newTab = await chrome.tabs.create({ url, active: true });
        if (!newTab?.id) return respond({ ok: false, error: 'No tab created' });
        session.tabs.set(newTab.id, { ...TabInfo, tabId: newTab.id, url, title: '' });
        session.activeTabId = newTab.id;
        session.windowId    = newTab.windowId;
        startKeepAlive();
        await saveSessionsToStorage();
        respond({ ok: true, tabId: newTab.id, url });
        waitForLoad(newTab.id).then(async () => {
          try {
            const loaded = await chrome.tabs.get(newTab.id);
            session.tabs.set(newTab.id, { ...TabInfo, tabId: loaded.id, url: loaded.url || url, title: loaded.title || '' });
            await saveSessionsToStorage();
          } catch (_) {}
        });
        break;
      }

      // ── Get session info (tabs + activeTabId) ────────────────────────────────
      case 'vb_get_session': {
        const session = sessions.get(msg.sessionId);
        if (!session) return respond({ ok: true, tabs: [], activeTabId: null });
        const tabList = [];
        for (const [tid, info] of session.tabs) {
          try {
            const tab = await chrome.tabs.get(tid);
            tabList.push({ ...info, tabId: tid, url: tab.url || info.url, title: tab.title || info.title, status: tab.status || info.status });
          } catch { session.tabs.delete(tid); }
        }
        respond({ ok: true, tabs: tabList, activeTabId: session.activeTabId });
        break;
      }

      // ── Switch active tab within a session ───────────────────────────────────
      case 'vb_switch_tab': {
        const tabId = parseInt(msg.tabId);
        const session = getOrCreateSession(msg.sessionId);
        if (!session.tabs.has(tabId)) return respond({ ok: false, error: 'Tab not in session' });
        session.activeTabId = tabId;
        try {
          await chrome.tabs.update(tabId, { active: true });
          const tab = await chrome.tabs.get(tabId);
          respond({ ok: true, url: tab.url, title: tab.title });
        } catch (e) {
          respond({ ok: false, error: e.message });
        }
        break;
      }

      // ── Open new tab in session ──────────────────────────────────────────────
      case 'vb_open_tab': {
        const { url: tabUrl, sessionId: sid } = msg;
        const tab = await chrome.tabs.create({ url: tabUrl || 'about:blank', active: true });
        if (!tab?.id) return respond({ ok: false, error: 'No tab created' });
        const session = getOrCreateSession(sid);
        session.tabs.set(tab.id, { ...TabInfo, tabId: tab.id, url: tabUrl || '', title: '', createdAt: Date.now(), lastActive: Date.now() });
        session.activeTabId = tab.id;
        startKeepAlive();
        await saveSessionsToStorage();
        respond({ ok: true, tabId: tab.id, url: tabUrl || '' });
        break;
      }

      // ── Close a specific tab in session ─────────────────────────────────────
      case 'vb_close_tab': {
        const tabId = parseInt(msg.tabId);
        try { await chrome.tabs.remove(tabId); } catch (_) {}
        const session = sessions.get(msg.sessionId);
        if (session) {
          session.tabs.delete(tabId);
          if (session.activeTabId === tabId) {
            session.activeTabId = [...session.tabs.keys()][0] || null;
          }
          if (session.tabs.size === 0) { sessions.delete(msg.sessionId); stopKeepAlive(); }
          await saveSessionsToStorage();
        }
        respond({ ok: true });
        break;
      }

      // ── Mark tab as done (bookmark star) ─────────────────────────────────────
      case 'vb_mark_done': {
        const tabId = parseInt(msg.tabId);
        const session = sessions.get(msg.sessionId);
        if (session && session.tabs.has(tabId)) {
          const info = session.tabs.get(tabId);
          session.tabs.set(tabId, { ...info, isDone: msg.done !== false });
          await saveSessionsToStorage();
        }
        respond({ ok: true });
        break;
      }

      // ── Read cookies from the user's real Chrome session ─────────────────────
      // Used to sync the user's Google/YouTube login into the Electron agent's
      // dedicated Chrome window so the user doesn't need to log in twice.
      case 'vb_get_cookies': {
        const domains = Array.isArray(msg.domains) ? msg.domains : [];
        try {
          const queries = domains.length > 0
            ? domains.map(d => chrome.cookies.getAll({ domain: d }))
            : [chrome.cookies.getAll({})];

          const results = await Promise.all(queries);
          const seen = new Set();
          const cookies = [];
          for (const arr of results) {
            for (const c of arr) {
              const key = `${c.domain}|${c.name}`;
              if (!seen.has(key)) {
                seen.add(key);
                cookies.push({
                  name:           c.name,
                  value:          c.value,
                  domain:         c.domain,
                  path:           c.path,
                  secure:         c.secure,
                  httpOnly:       c.httpOnly,
                  sameSite:       c.sameSite,
                  expirationDate: c.expirationDate,
                });
              }
            }
          }
          respond({ ok: true, cookies, count: cookies.length });
        } catch (e) {
          respond({ ok: false, error: e.message });
        }
        break;
      }

      case 'get_status':
        respond({ ok: true, version: '2.0' });
        break;

      default:
        respond({ ok: false, error: `Unknown: ${msg.type}` });
    }
  } catch (e) {
    console.error('[Pushpa]', e);
    respond({ ok: false, error: e.message });
  }
}

// ── Helpers ────────────────────────────────────────────────────────
function waitForLoad(tabId, timeout = 15000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(), timeout);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 500);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ── Handle tab/window removal ──────────────────────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
  for (const [sid, session] of sessions.entries()) {
    if (session.tabs.has(tabId)) {
      session.tabs.delete(tabId);
      if (session.activeTabId === tabId) {
        session.activeTabId = [...session.tabs.keys()][0] || null;
      }
      if (session.tabs.size === 0) {
        sessions.delete(sid);
        stopKeepAlive();
      }
    }
  }
  saveSessionsToStorage(); // keep storage in sync
});

// Update session URL when tab navigates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  for (const [, session] of sessions.entries()) {
    if (session.tabs.has(tabId)) {
      const info = session.tabs.get(tabId);
      session.tabs.set(tabId, { ...info, url: tab.url || info.url, title: tab.title || info.title, status: 'complete' });
      saveSessionsToStorage();
    }
  }
});

console.log('[Pushpa] Commercial agent v2.0 ready');

console.log('[Pushpa] Service Worker ready with chrome.debugger support');
