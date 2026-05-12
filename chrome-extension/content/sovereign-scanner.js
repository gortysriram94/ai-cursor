// chrome-extension/content/sovereign-scanner.js
// ─────────────────────────────────────────────────────────────────────────────
// The Sovereign Scanner — the Agent's Eyes.
//
// Scans the active tab's rendered DOM and returns a compact JSON Map of every
// interactable element including its coordinates, visible text, contextual hint,
// and fine-print classification.
//
// No external APIs. No selectors. Runs entirely in the browser via
// chrome.scripting.executeScript and returns coordinates the Ghost Cursor
// can click directly.
// ─────────────────────────────────────────────────────────────────────────────

(function sovereignScan() {

  // ── Helpers ───────────────────────────────────────────────────────────────

  function getVisibleText(el) {
    var clone = el.cloneNode(true);
    clone.querySelectorAll('script,style,noscript').forEach(function(x){x.remove();});
    return (clone.innerText || clone.textContent || '').replace(/\s+/g,' ').trim().slice(0,120);
  }

  function getNearbyHint(el) {
    // 1. aria-label / title attribute
    var aria = el.getAttribute('aria-label') || el.getAttribute('title') || '';
    if (aria) return aria.slice(0,80);

    // 2. Preceding sibling text (often a label)
    var prev = el.previousElementSibling;
    if (prev) {
      var t = getVisibleText(prev);
      if (t && t.length < 60) return t;
    }

    // 3. Parent label element
    var parent = el.closest('label');
    if (parent) {
      var lt = getVisibleText(parent);
      if (lt && lt !== getVisibleText(el)) return lt.slice(0,60);
    }

    // 4. placeholder for inputs
    if (el.placeholder) return el.placeholder.slice(0,60);

    return '';
  }

  function isVisible(el) {
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    if (r.bottom < 0 || r.top > window.innerHeight * 2) return false; // off-screen but allow below fold
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    return true;
  }

  function centerOf(r) {
    return {
      x: Math.round(r.left + r.width  / 2),
      y: Math.round(r.top  + r.height / 2),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  }

  // ── Fine-print detector ────────────────────────────────────────────────────
  // Classifies an element as fine-print if it is small-font, in a footer/aside,
  // or contains legal/disclaimer language.

  var FINE_PRINT_TAGS = new Set(['small','footer','aside','caption','figcaption']);
  var FINE_PRINT_RE   = /\*|†|‡|terms|conditions|privacy|disclaimer|must be \d+|auto.?renew|cancel|APR|applicable|subject to|hidden fee|not valid/i;

  function isFinePrint(el) {
    var tag = el.tagName.toLowerCase();
    if (FINE_PRINT_TAGS.has(tag)) return true;

    var style = window.getComputedStyle(el);
    var fs    = parseFloat(style.fontSize);
    if (!isNaN(fs) && fs < 13) return true;

    var text = getVisibleText(el);
    if (FINE_PRINT_RE.test(text)) return true;

    // Check ancestors
    var ancestor = el.parentElement;
    for (var i = 0; i < 4 && ancestor; i++, ancestor = ancestor.parentElement) {
      if (FINE_PRINT_TAGS.has(ancestor.tagName.toLowerCase())) return true;
    }
    return false;
  }

  // ── Main scan ─────────────────────────────────────────────────────────────

  var INTERACTIVE_SELECTOR = [
    'a[href]',
    'button',
    'input:not([type=hidden])',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="tab"]',
    '[tabindex="0"]',
    'label[for]',
    'summary',
  ].join(',');

  var elements = [];
  var finePrint = [];
  var seen      = new Set();
  var idCounter = 0;

  // Scan all interactive elements
  document.querySelectorAll(INTERACTIVE_SELECTOR).forEach(function(el) {
    if (!isVisible(el)) return;

    var rect   = el.getBoundingClientRect();
    var coords = centerOf(rect);
    var key    = coords.x + ',' + coords.y;
    if (seen.has(key)) return; // deduplicate overlapping elements
    seen.add(key);

    var text = getVisibleText(el);
    var hint = getNearbyHint(el);
    var tag  = el.tagName.toLowerCase();
    var role = el.getAttribute('role') || tag;

    elements.push({
      id:      'el_' + (++idCounter),
      tag:     tag,
      role:    role,
      text:    text,
      hint:    hint,
      type:    el.type   || '',
      href:    el.href   || '',
      coords:  coords,
      inView:  rect.top >= 0 && rect.bottom <= window.innerHeight,
    });
  });

  // Also scan for SVG icon buttons (no text, but clickable)
  document.querySelectorAll('svg').forEach(function(svg) {
    var parent = svg.closest('button,[role="button"],[tabindex="0"]');
    if (!parent || !isVisible(parent)) return;
    var rect   = parent.getBoundingClientRect();
    var coords = centerOf(rect);
    var key    = coords.x + ',' + coords.y;
    if (seen.has(key)) return;
    seen.add(key);
    elements.push({
      id:     'el_' + (++idCounter),
      tag:    parent.tagName.toLowerCase(),
      role:   'button',
      text:   '[icon]',
      hint:   parent.getAttribute('aria-label') || parent.getAttribute('title') || '',
      type:   '',
      href:   '',
      coords: coords,
      inView: rect.top >= 0 && rect.bottom <= window.innerHeight,
    });
  });

  // Collect fine-print text blocks
  document.querySelectorAll('small,footer,[class*="disclaimer"],[class*="legal"],[class*="fine"]').forEach(function(el) {
    if (!isVisible(el)) return;
    var text = getVisibleText(el);
    if (text && text.length > 10) finePrint.push(text.slice(0, 300));
  });

  // Also catch small-font paragraphs
  document.querySelectorAll('p,span,div').forEach(function(el) {
    if (!isVisible(el)) return;
    if (!isFinePrint(el)) return;
    var text = getVisibleText(el);
    if (text && text.length > 20 && finePrint.indexOf(text) === -1) {
      finePrint.push(text.slice(0, 300));
    }
  });

  // ── Deduplicate and sort elements (in-view first, then by Y position) ─────

  elements = elements
    .filter(function(e) { return e.text || e.hint; }) // drop icon-only with no label
    .sort(function(a, b) {
      if (a.inView !== b.inView) return a.inView ? -1 : 1;
      return a.coords.y - b.coords.y;
    });

  return {
    url:        location.href,
    title:      document.title,
    viewport:   { w: window.innerWidth, h: window.innerHeight },
    scrollY:    window.scrollY,
    elements:   elements,
    finePrint:  [...new Set(finePrint)].slice(0, 10),
    scannedAt:  Date.now(),
  };

})();
