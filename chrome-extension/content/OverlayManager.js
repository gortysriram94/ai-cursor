// chrome-extension/content/OverlayManager.js
// ─────────────────────────────────────────────────────────────────────
// Live HUD Overlay for Pushpa Browser Node.
// Injected by content-script.js into every frame.
//
// Features:
//   1. Red Crosshair at targetCoords (Muscle lock)
//   2. Bézier trail on SVG layer (ghost cursor moves)
//   3. Highlight "Fine Print" / "CTA Buttons" with color-coded borders
//   4. Adaptive Viewport: uses normalized percentages (0.0-1.0)
// ─────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  const OVERLAY_ID = '__tl_overlay__';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ── State ────────────────────────────────────────────────────────────
  let overlayRoot = null;
  let svgLayer = null;
  let crosshair = null;
  let trailGroup = null;
  let trailPoints = [];      // Recent Bézier trail points
  const MAX_TRAIL = 30;

  // ── Normalized Viewport Helpers ───────────────────────────────────
  function toNormalized(x, y) {
    return { nx: x / window.innerWidth, ny: y / window.innerHeight };
  }
  function fromNormalized(nx, ny) {
    return { x: nx * window.innerWidth, y: ny * window.innerHeight };
  }
  function isInSafeZone(nx, ny) {
    // Safe Zone: 25% - 75% of viewport
    return nx >= 0.25 && nx <= 0.75 && ny >= 0.25 && ny <= 0.75;
  }

  // ── Ensure Overlay Root ─────────────────────────────────────────────
  function ensureOverlay() {
    if (overlayRoot && document.body.contains(overlayRoot)) return overlayRoot;
    overlayRoot = document.createElement('div');
    overlayRoot.id = OVERLAY_ID;
    overlayRoot.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646;overflow:hidden;';
    document.body.appendChild(overlayRoot);

    // SVG layer for Bézier trail
    svgLayer = document.createElementNS(SVG_NS, 'svg');
    svgLayer.setAttribute('width', '100%');
    svgLayer.setAttribute('height', '100%');
    svgLayer.style.cssText = 'position:absolute;inset:0;';
    overlayRoot.appendChild(svgLayer);

    trailGroup = document.createElementNS(SVG_NS, 'g');
    svgLayer.appendChild(trailGroup);

    return overlayRoot;
  }

  // ── Red Crosshair ───────────────────────────────────────────────────
  function showCrosshair(nx, ny) {
    const root = ensureOverlay();
    if (crosshair) crosshair.remove();

    const coords = fromNormalized(nx, ny);
    const x = coords.x;
    const y = coords.y;

    crosshair = document.createElement('div');
    crosshair.style.cssText = `
      position:absolute;
      left:${x - 12}px; top:${y - 12}px;
      width:24px; height:24px;
      pointer-events:none;
      animation:tlPulse 0.8s ease-out infinite;
    `;

    // Horizontal line
    const hLine = document.createElement('div');
    hLine.style.cssText = 'position:absolute;left:-4px;top:11px;width:28px;height:2px;background:#ef4444;box-shadow:0 0 6px #ef4444;';
    crosshair.appendChild(hLine);

    // Vertical line
    const vLine = document.createElement('div');
    vLine.style.cssText = 'position:absolute;left:11px;top:-4px;width:2px;height:28px;background:#ef4444;box-shadow:0 0 6px #ef4444;';
    crosshair.appendChild(vLine);

    root.appendChild(crosshair);
  }

  function hideCrosshair() {
    if (crosshair) { crosshair.remove(); crosshair = null; }
  }

  // ── Bézier Trail ────────────────────────────────────────────────────
  function addTrailPoint(nx, ny) {
    const coords = fromNormalized(nx, ny);
    trailPoints.push({ x: coords.x, y: coords.y, ts: Date.now() });
    if (trailPoints.length > MAX_TRAIL) trailPoints.shift();

    renderTrail();
  }

  function renderTrail() {
    if (!trailGroup) return;
    trailGroup.innerHTML = '';

    if (trailPoints.length < 2) return;

    // Draw faint trail line
    let pathD = `M ${trailPoints[0].x} ${trailPoints[0].y}`;
    for (let i = 1; i < trailPoints.length; i++) {
      pathD += ` L ${trailPoints[i].x} ${trailPoints[i].y}`;
    }

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('stroke', 'rgba(251, 191, 36, 0.4)');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    trailGroup.appendChild(path);

    // Draw dots at each point
    trailPoints.forEach((p, i) => {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', p.x.toString());
      circle.setAttribute('cy', p.y.toString());
      circle.setAttribute('r', (i === trailPoints.length - 1 ? '4' : '2'));
      circle.setAttribute('fill', `rgba(251, 191, 36, ${0.3 + (i / trailPoints.length) * 0.5})`);
      trailGroup.appendChild(circle);
    });

    // Auto-remove after 1.5s
    setTimeout(() => {
      trailPoints = trailPoints.filter(p => Date.now() - p.ts < 1500);
      renderTrail();
    }, 1500);
  }

  // ── Highlight Page Elements ──────────────────────────────────────────
  // CTA Buttons: Green border
  // Fine Print: Orange border
  const HIGHLIGHT_STYLE = {
    cta:    '2px solid #22c55e; box-shadow: 0 0 8px rgba(34,197,94,0.5); border-radius:4px;',
    fine:   '2px solid #f97316; box-shadow: 0 0 8px rgba(249,115,22,0.5); border-radius:4px;',
  };

  function highlightElements(type: 'cta' | 'fine') {
    // Remove old highlights
    document.querySelectorAll('[data-tl-highlight]').forEach(el => {
      (el as HTMLElement).style.cssText = (el as HTMLElement).dataset.tlOrigStyle || '';
      delete (el as HTMLElement).dataset.tlHighlight;
      delete (el as HTMLElement).dataset.tlOrigStyle;
    });

    if (type === 'cta') {
      // Highlight CTA buttons (sign-up, get started, etc.)
      const CTA_RE = /sign.?up|get.?started|create.?account|join|register|try.?free/i;
      document.querySelectorAll('a[href],button,input[type="submit"]').forEach(el => {
        const text = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase();
        if (CTA_RE.test(text)) {
          const htmlEl = el as HTMLElement;
          htmlEl.dataset.tlOrigStyle = htmlEl.style.cssText;
          htmlEl.dataset.tlHighlight = 'cta';
          htmlEl.style.cssText = (htmlEl.dataset.tlOrigStyle || '') + HIGHLIGHT_STYLE.cta;
        }
      });
    } else if (type === 'fine') {
      // Highlight fine print elements
      const FINE_RE = /terms|conditions|privacy|disclaimer|cancel|auto.?renew|apr|fee/i;
      document.querySelectorAll('small,footer,[class*="fine"],[class*="legal"]').forEach(el => {
        const text = (el.textContent || '').toLowerCase();
        if (FINE_RE.test(text)) {
          const htmlEl = el as HTMLElement;
          htmlEl.dataset.tlOrigStyle = htmlEl.style.cssText;
          htmlEl.dataset.tlHighlight = 'fine';
          htmlEl.style.cssText = (htmlEl.dataset.tlOrigStyle || '') + HIGHLIGHT_STYLE.fine;
        }
      });
    }
  }

  function clearAllHighlights() {
    document.querySelectorAll('[data-tl-highlight]').forEach(el => {
      (el as HTMLElement).style.cssText = (el as HTMLElement).dataset.tlOrigStyle || '';
      delete (el as HTMLElement).dataset.tlHighlight;
      delete (el as HTMLElement).dataset.tlOrigStyle;
    });
  }

  // ── Listen for HUD_UPDATE events from parent (Agent Node) ──
  window.addEventListener('message', (e) => {
    if (!e.data || e.data.bridge !== 'TL_EXT') return;
    const { type, data } = e.data;

    if (type === 'HUD_UPDATE') {
      const hud = data as any;

      // Show/hide crosshair based on intent + targetCoords
      if (hud.intent === 'CLICK' && hud.targetCoords) {
        const coords = hud.targetCoords.normalized
          ? hud.targetCoords
          : { nx: hud.targetCoords.x / window.innerWidth, ny: hud.targetCoords.y / window.innerHeight };
        showCrosshair(coords.nx, coords.ny);

        // Auto-center if outside Safe Zone
        if (!isInSafeZone(coords.nx, coords.ny) && hud.status === 'pending') {
          // Request scroll-to-center via postMessage
          window.parent.postMessage({
            bridge: 'TL_EXT',
            type: 'REQUEST_SCROLL_TO_CENTER',
            targetCoords: { nx: coords.nx, ny: coords.ny },
          }, '*');
        }
      } else {
        hideCrosshair();
      }

      // Bézier trail for ghost cursor moves
      if (hud.intent === 'CLICK' && hud.targetCoords && hud.status === 'pending') {
        const coords = hud.targetCoords.normalized
          ? hud.targetCoords
          : { nx: hud.targetCoords.x / window.innerWidth, ny: hud.targetCoords.y / window.innerHeight };
        addTrailPoint(coords.nx, coords.ny);
      }

      // Highlight CTA buttons during SCAN phase
      if (hud.intent === 'SCAN') {
        highlightElements('cta');
      } else {
        // Keep CTA highlights if status is pending
        if (hud.status !== 'pending') {
          clearAllHighlights();
        }
      }

      // Highlight fine print when detected
      if (hud.message && hud.message.includes('Fine Print')) {
        highlightElements('fine');
      }
    }

    if (type === 'CLEAR_OVERLAY') {
      hideCrosshair();
      clearAllHighlights();
      trailPoints = [];
      if (trailGroup) trailGroup.innerHTML = '';
    }
  });

  // ── Inject Styles ────────────────────────────────────────────────────
  (function injectStyles() {
    if (document.getElementById('__tl_overlay_styles__')) return;
    const s = document.createElement('style');
    s.id = '__tl_overlay_styles__';
    s.textContent = `
      @keyframes tlPulse {
        0% { transform: scale(0.7); opacity: 1; }
        50% { transform: scale(1.2); opacity: 0.8; }
        100% { transform: scale(0.7); opacity: 1; }
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  })();

  console.log('[Pushpa] OverlayManager ready');
})();
