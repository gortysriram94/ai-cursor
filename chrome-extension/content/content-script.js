(function () {
  'use strict';

  // ── Frame-buster neutralizer ──────────────────────────────────────────────
  // Runs at document_start in every frame — prevents sites from breaking out
  // of our proxy iframe.
  try { Object.defineProperty(window, 'top',         { get: () => window, configurable: true }); } catch (_) {}
  try { Object.defineProperty(window, 'parent',      { get: () => window, configurable: true }); } catch (_) {}
  try { Object.defineProperty(window, 'frameElement',{ get: () => null,   configurable: true }); } catch (_) {}

  // Expose extension ID so the page can use externally_connectable direct messaging
  // even if the content script bridge is unavailable (e.g. after extension toggle)
  try { window.__tl_ext_id = chrome.runtime.id; } catch (_) {}

  // Everything below only runs in the top frame
  if (window !== window.top) return;
  if (window.__tlBridgeInstalled) return;
  window.__tlBridgeInstalled = true;

  // ── OverlayManager — inlined so it works on ANY site regardless of CSP ───
  // Previously loaded as an external chrome-extension:// script which was
  // blocked by sites with strict Content-Security-Policy headers (Google, etc).
  // Running in the content script's isolated world gives full DOM access
  // without needing web_accessible_resources or script injection.

  const SVG_NS = 'http://www.w3.org/2000/svg';
  let overlayRoot = null;
  let svgLayer = null;
  let crosshair = null;
  let trailGroup = null;
  let trailPoints = [];
  const MAX_TRAIL = 30;

  function ensureOverlay() {
    if (overlayRoot && document.body && document.body.contains(overlayRoot)) return overlayRoot;
    if (!document.body) return null;
    overlayRoot = document.createElement('div');
    overlayRoot.id = '__tl_overlay__';
    overlayRoot.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646;overflow:hidden;';
    document.body.appendChild(overlayRoot);

    svgLayer = document.createElementNS(SVG_NS, 'svg');
    svgLayer.setAttribute('width', '100%');
    svgLayer.setAttribute('height', '100%');
    svgLayer.style.cssText = 'position:absolute;inset:0;';
    overlayRoot.appendChild(svgLayer);

    trailGroup = document.createElementNS(SVG_NS, 'g');
    svgLayer.appendChild(trailGroup);

    // Keyframe styles
    if (!document.getElementById('__tl_overlay_styles__')) {
      const s = document.createElement('style');
      s.id = '__tl_overlay_styles__';
      s.textContent = '@keyframes tlCrosshair{0%{transform:scale(.7);opacity:1}50%{transform:scale(1.2);opacity:.8}100%{transform:scale(.7);opacity:1}}';
      (document.head || document.documentElement).appendChild(s);
    }
    return overlayRoot;
  }

  function showCrosshair(x, y) {
    const root = ensureOverlay();
    if (!root) return;
    if (crosshair) crosshair.remove();
    crosshair = document.createElement('div');
    crosshair.style.cssText = `position:absolute;left:${x-12}px;top:${y-12}px;width:24px;height:24px;pointer-events:none;animation:tlCrosshair .8s ease-out infinite;`;
    const h = document.createElement('div');
    h.style.cssText = 'position:absolute;left:-4px;top:11px;width:28px;height:2px;background:#ef4444;box-shadow:0 0 6px #ef4444;';
    const v = document.createElement('div');
    v.style.cssText = 'position:absolute;left:11px;top:-4px;width:2px;height:28px;background:#ef4444;box-shadow:0 0 6px #ef4444;';
    crosshair.appendChild(h);
    crosshair.appendChild(v);
    root.appendChild(crosshair);
  }

  function hideCrosshair() {
    if (crosshair) { crosshair.remove(); crosshair = null; }
  }

  function addTrailPoint(x, y) {
    trailPoints.push({ x, y, ts: Date.now() });
    if (trailPoints.length > MAX_TRAIL) trailPoints.shift();
    renderTrail();
  }

  function renderTrail() {
    if (!trailGroup || trailPoints.length < 2) return;
    trailGroup.innerHTML = '';
    let d = `M ${trailPoints[0].x} ${trailPoints[0].y}`;
    for (let i = 1; i < trailPoints.length; i++) d += ` L ${trailPoints[i].x} ${trailPoints[i].y}`;
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', 'rgba(251,191,36,.4)');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    trailGroup.appendChild(path);
    trailPoints.forEach((p, i) => {
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
      c.setAttribute('r', i === trailPoints.length - 1 ? '4' : '2');
      c.setAttribute('fill', `rgba(251,191,36,${.3 + (i / trailPoints.length) * .5})`);
      trailGroup.appendChild(c);
    });
    setTimeout(() => {
      trailPoints = trailPoints.filter(p => Date.now() - p.ts < 1500);
      renderTrail();
    }, 1500);
  }

  const CTA_RE = /sign.?up|get.?started|create.?account|join|register|try.?free/i;
  const FINE_RE = /terms|conditions|privacy|disclaimer|cancel|auto.?renew|apr|fee/i;

  function highlightElements(type) {
    document.querySelectorAll('[data-tl-hl]').forEach(el => {
      el.style.cssText = el.dataset.tlOrig || ''; delete el.dataset.tlHl; delete el.dataset.tlOrig;
    });
    const sel  = type === 'cta' ? 'a[href],button,input[type="submit"]' : 'small,footer,[class*="fine"],[class*="legal"]';
    const re   = type === 'cta' ? CTA_RE : FINE_RE;
    const bdr  = type === 'cta' ? '2px solid #22c55e;box-shadow:0 0 8px rgba(34,197,94,.5);border-radius:4px;' : '2px solid #f97316;box-shadow:0 0 8px rgba(249,115,22,.5);border-radius:4px;';
    document.querySelectorAll(sel).forEach(el => {
      if (re.test(el.textContent || el.getAttribute('aria-label') || '')) {
        el.dataset.tlOrig = el.style.cssText; el.dataset.tlHl = type;
        el.style.cssText = (el.dataset.tlOrig || '') + bdr;
      }
    });
  }

  function clearHighlights() {
    document.querySelectorAll('[data-tl-hl]').forEach(el => {
      el.style.cssText = el.dataset.tlOrig || ''; delete el.dataset.tlHl; delete el.dataset.tlOrig;
    });
  }

  // ── TL_EXT_BRIDGE → background service worker ─────────────────────────────
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.bridge !== 'TL_EXT') return;
    const { requestId } = e.data;
    chrome.runtime.sendMessage(e.data, (res) => {
      window.postMessage({
        bridge:   'TL_EXT_RESPONSE',
        requestId,
        response: res,
        error:    chrome.runtime.lastError?.message ?? null,
      }, '*');
    });
  });

  // ── HUD_UPDATE → overlay rendering + direct DOM actions ──────────────────
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg) return;

    if (msg.bridge === 'TL_EXT' && msg.type === 'HUD_UPDATE') {
      const hud = msg.data || {};
      if (hud.intent === 'CLICK' && hud.targetCoords) {
        const x = hud.targetCoords.x ?? (hud.targetCoords.nx * window.innerWidth);
        const y = hud.targetCoords.y ?? (hud.targetCoords.ny * window.innerHeight);
        showCrosshair(x, y);
        if (hud.status === 'pending') addTrailPoint(x, y);
      } else {
        hideCrosshair();
      }
      if (hud.intent === 'SCAN') highlightElements('cta');
      else if (hud.status !== 'pending') clearHighlights();
      if (hud.message && hud.message.includes('Fine Print')) highlightElements('fine');
    }

    if (msg.bridge === 'TL_EXT' && msg.type === 'CLEAR_OVERLAY') {
      hideCrosshair(); clearHighlights();
      trailPoints = []; if (trailGroup) trailGroup.innerHTML = '';
    }

    // Direct DOM actions from agent (fallback path)
    if (msg.bridge === 'TL_EXT' && msg.type === 'HUD_UPDATE' && msg.data?.status === 'pending') {
      const hud = msg.data;
      let result = { ok: true };
      try {
        if (hud.intent === 'CLICK' && hud.targetCoords) {
          const x = hud.targetCoords.x ?? (hud.targetCoords.nx * window.innerWidth);
          const y = hud.targetCoords.y ?? (hud.targetCoords.ny * window.innerHeight);
          const el = document.elementFromPoint(x, y);
          if (el) {
            ['mouseenter','mousedown','mouseup','click'].forEach(t =>
              el.dispatchEvent(new MouseEvent(t, { bubbles: true, clientX: x, clientY: y }))
            );
          } else { result = { ok: false, error: 'No element at coords' }; }
        } else if (hud.intent === 'TYPE' && hud.fields) {
          hud.fields.forEach(field => {
            const el = document.querySelector(`[name="${field}"],[placeholder*="${field}"],[aria-label*="${field}"]`);
            if (el) { el.value = hud.message || ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
          });
        } else if (hud.intent === 'SCROLL' && hud.targetCoords) {
          const y = hud.targetCoords.y ?? (hud.targetCoords.ny * window.innerHeight);
          window.scrollTo({ top: y + window.scrollY - window.innerHeight / 2, behavior: 'smooth' });
        }
      } catch (err) { result = { ok: false, error: err.message }; }

      try {
        window.parent.postMessage({
          bridge: 'TL_EXT', type: 'HUD_STATUS',
          data: { ...hud, status: result.ok ? 'success' : 'failure', error: result.error },
        }, '*');
      } catch (_) {}
    }
  });

  console.log('[Pushpa] Agent bridge ready');
})();
