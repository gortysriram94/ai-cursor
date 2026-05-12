// lib/result-verifier.js — semantic success verification
// Runs after every state-changing action and determines whether the action
// achieved its *intended goal*, not just whether it executed without error.
//
// check(goal, stepType, pageSnapshot) → { verified, confidence, evidence, id }
//
// Three signal sources, combined:
//   URL patterns  — /confirmation, /success, /thank-you, etc.     (conf 0.70)
//   Text patterns — "application ID: ABC123", "order confirmed"   (conf 0.65–0.95)
//   DOM signals   — [class*="success"], [role="status"] text       (conf 0.50)
//
// verified = true when combined confidence >= 0.65

"use strict";

const log = require("./logger");

const VERIFY_STEPS = new Set([
  "browser_type", "browser_click", "browser_navigate", "browser_click_coords",
]);

// URL path/query patterns strongly suggesting a post-action success state
const SUCCESS_URL_RES = [
  /\/success\b/i,         /\/confirmation\b/i,     /\/confirmed\b/i,
  /\/thank(-you|s)?\b/i, /\/complete(d)?\b/i,      /\/submitted\b/i,
  /\/order-placed/i,      /\/application-sent/i,    /\/application-complete/i,
  /[?&]status=success/i,  /[?&]status=complete/i,   /\/done\b/i,
];

// Text patterns — ordered by confidence descending
// `extract` = capture group index to pull out a confirmation ID
const TEXT_PATTERNS = [
  { re: /application\s*(id|#|number|reference)[:\s#]+([A-Z0-9\-]{4,})/i,  conf: 0.95, extract: 2 },
  { re: /order\s*(id|#|number|reference)[:\s#]+([A-Z0-9\-]{4,})/i,        conf: 0.95, extract: 2 },
  { re: /booking\s*(id|#|number|reference)[:\s#]+([A-Z0-9\-]{4,})/i,      conf: 0.95, extract: 2 },
  { re: /ticket\s*(id|#|number)[:\s#]+([A-Z0-9\-]{4,})/i,                 conf: 0.95, extract: 2 },
  { re: /confirmation\s*(number|code|id)[:\s#]+([A-Z0-9\-]{4,})/i,        conf: 0.95, extract: 2 },
  { re: /reference\s*(number|code)[:\s#]+([A-Z0-9\-]{4,})/i,              conf: 0.90, extract: 2 },

  { re: /your application (has been|was) (submitted|received|sent)/i,      conf: 0.90 },
  { re: /application (submitted|complete|received)/i,                      conf: 0.88 },
  { re: /successfully (submitted|applied|sent|booked|ordered)/i,           conf: 0.88 },
  { re: /message\s*(sent|delivered)/i,                                     conf: 0.88 },
  { re: /email\s*(sent|delivered)/i,                                       conf: 0.88 },
  { re: /payment\s*(successful|confirmed|processed)/i,                     conf: 0.90 },
  { re: /order\s*(placed|confirmed|received)/i,                            conf: 0.90 },
  { re: /booking\s*(confirmed|complete)/i,                                 conf: 0.90 },
  { re: /registration\s*(complete|successful)/i,                           conf: 0.85 },

  { re: /\bthank you\b.{0,60}(applying|submitting|order|booking)/i,        conf: 0.80 },
  { re: /\bthank you\b.{0,60}(your|application|message|form)/i,            conf: 0.75 },
  { re: /form (submitted|received|sent)/i,                                  conf: 0.75 },
  { re: /we('ve| have) received your/i,                                     conf: 0.75 },
  { re: /you('re| are) (registered|signed up|enrolled)/i,                  conf: 0.75 },
  { re: /\bsuccessfully\b/i,                                               conf: 0.65 },
];

// Injected JS: scan DOM for visible success-state elements
const DOM_SIGNAL_SCRIPT = `(function(){
  var sels = [
    '[class*="success"]','[class*="confirm"]','[class*="complete"]',
    '[class*="submitted"]','[class*="thank"]','[class*="approved"]',
    '[data-status="success"]','[data-status="complete"]',
    '[role="status"]','[role="alert"]',
  ];
  var found = [];
  for (var i = 0; i < sels.length && found.length < 3; i++) {
    var els = document.querySelectorAll(sels[i]);
    for (var j = 0; j < els.length; j++) {
      var t = (els[j].innerText || els[j].textContent || "").trim().slice(0,120);
      if (t) { found.push(t); break; }
    }
  }
  return found.join(" | ");
})()`;

async function check(goal, stepType, pageSnapshot) {
  if (!VERIFY_STEPS.has(stepType)) {
    return { verified: false, confidence: 0, evidence: "", id: null };
  }

  const url  = pageSnapshot?.url  ?? "";
  const text = pageSnapshot?.text ?? "";

  // 1 — URL signal
  const urlMatch = SUCCESS_URL_RES.find(re => re.test(url));
  const urlConf  = urlMatch ? 0.70 : 0;

  // 2 — Text signal
  let textConf    = 0;
  let textEvidence = "";
  let extractedId  = null;

  for (const p of TEXT_PATTERNS) {
    const m = text.match(p.re);
    if (m && p.conf > textConf) {
      textConf = p.conf;
      if (p.extract && m[p.extract]) {
        extractedId  = m[p.extract];
        textEvidence = `${m[0].trim()} [ID: ${extractedId}]`;
      } else {
        textEvidence = m[0].trim().slice(0, 100);
      }
    }
  }

  // 3 — DOM signal (only when text/URL checks are inconclusive)
  let domConf    = 0;
  let domEvidence = "";
  if (textConf < 0.70 && !urlMatch) {
    try {
      const cdpClient = require("./cdp-client");
      const client = cdpClient.getClient();
      if (client) {
        const { result } = await client.Runtime.evaluate({
          expression:    DOM_SIGNAL_SCRIPT,
          returnByValue: true,
          awaitPromise:  false,
        });
        const domText = result?.value ?? "";
        if (domText) { domConf = 0.50; domEvidence = domText; }
      }
    } catch { /* DOM probe is best-effort */ }
  }

  const confidence = Math.min(0.95, Math.max(urlConf, textConf, domConf));
  const verified   = confidence >= 0.65;
  const evidence   = textEvidence || domEvidence || (urlMatch ? `URL: ${url}` : "");

  if (verified) {
    log.info(
      `[Verifier] ✓ ${stepType} verified conf=${confidence.toFixed(2)} — "${evidence.slice(0, 80)}"`
    );
  }

  return { verified, confidence, evidence, id: extractedId };
}

module.exports = { check };
