// lib/dom-extractor.js — L19–L22 + L34–L38: DOM content extractor
// Returns structured page data matching the schema used by the web app AI:
//   { title, url, text, links, buttons, inputs }               ← extractContent()
//   { ...above, clickables, forms, headings }                  ← extractPageMap()
//
// L34–L38: Shadow DOM traversal via getAllElements() + getFullText().
// This makes extraction work on sites using web components:
//   LinkedIn, Workday, Google, Salesforce, ServiceNow, etc.

"use strict";

const cdpClient = require("./cdp-client");
const log       = require("./logger");

// ── Shared utilities injected into both scripts ───────────────────────────────
const SHARED_FNS = `
function getText(el) { return (el.innerText || el.textContent || "").trim().replace(/\\s+/g, " "); }
function visible(el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }

// Shadow-DOM-aware querySelectorAll — recurses into shadow roots
function getAllElements(root, sel) {
  var found = Array.from(root.querySelectorAll(sel));
  var all   = root.querySelectorAll("*");
  for (var i = 0; i < all.length; i++) {
    if (all[i].shadowRoot) {
      found = found.concat(getAllElements(all[i].shadowRoot, sel));
    }
  }
  return found;
}

// Shadow-DOM-aware text extraction
function getFullText(root, depth) {
  depth = depth || 0;
  if (depth > 6) return "";
  var parts   = [];
  var walker  = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    var t = walker.currentNode.textContent.trim();
    if (t) parts.push(t);
  }
  var all = root.querySelectorAll("*");
  for (var i = 0; i < all.length; i++) {
    if (all[i].shadowRoot) parts.push(getFullText(all[i].shadowRoot, depth + 1));
  }
  return parts.join(" ");
}

function getSelector(el) {
  if (el.id) { try { return "#" + CSS.escape(el.id); } catch(e) { return '[id="' + el.id + '"]'; } }
  var dt = el.getAttribute("data-testid");
  if (dt) return '[data-testid="' + dt + '"]';
  if (el.name) return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
  var parts = [], cur = el;
  while (cur && cur !== document.body && parts.length < 4) {
    var tag  = cur.tagName.toLowerCase();
    var sibs = cur.parentElement
      ? Array.from(cur.parentElement.children).filter(function(c){ return c.tagName === cur.tagName; })
      : [];
    if (sibs.length > 1) tag += ":nth-of-type(" + (sibs.indexOf(cur) + 1) + ")";
    parts.unshift(tag);
    cur = cur.parentElement;
  }
  return parts.join(" > ");
}
`;

// ── extractContent ────────────────────────────────────────────────────────────

const CONTENT_SCRIPT = `(function(){
${SHARED_FNS}

var links = getAllElements(document, "a[href]")
  .map(function(a){ return { text: getText(a).slice(0,80), href: a.href }; })
  .filter(function(l){ return l.text && l.href && l.href.indexOf("javascript:") !== 0; })
  .slice(0,30);

var buttons = getAllElements(document, "button,[role=button],input[type=submit],input[type=button]")
  .filter(visible)
  .map(function(el){ return { text: getText(el).slice(0,80), selector: getSelector(el) }; })
  .filter(function(b){ return !!b.text; })
  .slice(0,20);

var inputs = getAllElements(document, "input:not([type=hidden]),textarea,select")
  .filter(visible)
  .map(function(el){ return {
    type:        el.type || el.tagName.toLowerCase(),
    name:        el.name || el.id || "",
    placeholder: el.placeholder || el.getAttribute("aria-label") || "",
    value:       el.type === "password" ? "" : (el.value || ""),
    selector:    getSelector(el),
  }; })
  .slice(0,15);

return {
  title:   document.title,
  url:     location.href,
  text:    getFullText(document.body).replace(/\\s+/g, " ").slice(0,4000),
  links:   links,
  buttons: buttons,
  inputs:  inputs,
};
})()`;

// ── extractPageMap ────────────────────────────────────────────────────────────

const PAGE_MAP_SCRIPT = `(function(){
${SHARED_FNS}

var clickables = getAllElements(document,
  "a,button,[role=button],[role=link],[role=menuitem],[role=tab],[role=option],input[type=submit],input[type=button]"
).filter(visible)
 .map(function(el){ return {
    tag:      el.tagName.toLowerCase(),
    text:     getText(el).slice(0,100),
    href:     el.href || null,
    selector: getSelector(el),
  }; })
 .filter(function(c){ return c.text || c.href; })
 .slice(0,60);

var forms = getAllElements(document, "form")
  .map(function(form){ return {
    id:     form.id || "",
    action: form.action || "",
    inputs: getAllElements(form, "input,textarea,select")
      .filter(function(el){ return el.type !== "hidden" && visible(el); })
      .map(function(el){ return {
        type:        el.type || el.tagName.toLowerCase(),
        name:        el.name || el.id || "",
        placeholder: el.placeholder || el.getAttribute("aria-label") || "",
        selector:    getSelector(el),
      }; })
      .slice(0,10),
  }; })
  .filter(function(f){ return f.inputs.length > 0; })
  .slice(0,5);

var headings = getAllElements(document, "h1,h2,h3")
  .map(getText).filter(Boolean).slice(0,10);

var links = getAllElements(document, "a[href]")
  .map(function(a){ return { text: getText(a).slice(0,80), href: a.href }; })
  .filter(function(l){ return l.text && l.href && l.href.indexOf("javascript:") !== 0; })
  .slice(0,30);

var inputs = getAllElements(document, "input:not([type=hidden]),textarea,select")
  .filter(visible)
  .map(function(el){ return {
    type:        el.type || el.tagName.toLowerCase(),
    name:        el.name || el.id || "",
    placeholder: el.placeholder || el.getAttribute("aria-label") || "",
    selector:    getSelector(el),
  }; })
  .slice(0,15);

return {
  title:      document.title,
  url:        location.href,
  text:       getFullText(document.body).replace(/\\s+/g, " ").slice(0,3000),
  headings:   headings,
  links:      links,
  buttons:    clickables.filter(function(c){ return c.tag === "button" || !c.href; }),
  inputs:     inputs,
  clickables: clickables,
  forms:      forms,
};
})()`;

// ── Internal runner ───────────────────────────────────────────────────────────

async function runScript(script) {
  const client = cdpClient.getClient();
  if (!client) throw new Error("CDP not connected");
  const { result, exceptionDetails } = await client.Runtime.evaluate({
    expression:    script,
    returnByValue: true,
    awaitPromise:  false,
  });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description || exceptionDetails.text || "DOM extraction failed");
  }
  return result?.value ?? {};
}

async function extractContent() {
  log.debug("DOM extractContent");
  return runScript(CONTENT_SCRIPT);
}

async function extractPageMap() {
  log.debug("DOM extractPageMap");
  return runScript(PAGE_MAP_SCRIPT);
}

module.exports = { extractContent, extractPageMap };
