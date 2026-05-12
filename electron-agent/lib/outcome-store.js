// lib/outcome-store.js — persistent task outcome memory
// Records every task result to disk so the planner can learn across runs.
//
// record(entry)             — persist one outcome
// loadRecent(n, domain)     — last N outcomes (newest first), optionally filtered
// getPatterns(domain)       — success rate + avg steps per domain
//
// Storage: userData("memory/outcomes.json")
// Rolling window: 500 entries max — oldest pruned automatically.

"use strict";

const fs   = require("fs");
const path = require("path");
const { userData } = require("./config");
const log  = require("./logger");

const MAX_OUTCOMES = 500;

// ── Domain detection from goal text ──────────────────────────────────────────

const DOMAIN_RULES = [
  { domain: "job_search",  re: /\b(job|apply|application|resume|cv|interview|hire|career|linkedin jobs)\b/i },
  { domain: "email",       re: /\b(email|message|inbox|send|reply|draft|mail|compose)\b/i },
  { domain: "shopping",    re: /\b(buy|order|purchase|checkout|cart|product|shop|price)\b/i },
  { domain: "travel",      re: /\b(flight|hotel|travel|book|itinerary|trip|airbnb|expedia)\b/i },
  { domain: "content",     re: /\b(post|publish|tweet|content|article|blog|social|instagram|tiktok)\b/i },
  { domain: "finance",     re: /\b(finance|transfer|payment|invoice|bank|budget|expense|transaction)\b/i },
  { domain: "calendar",    re: /\b(meeting|calendar|schedule|event|appointment|invite)\b/i },
  { domain: "sales",       re: /\b(lead|prospect|crm|outreach|sales|pipeline|hubspot)\b/i },
  { domain: "legal",       re: /\b(contract|legal|clause|agreement|document|nda|term)\b/i },
  { domain: "form",        re: /\b(form|fill|register|signup|enroll|application form)\b/i },
  { domain: "dev",         re: /\b(code|repo|git|deploy|build|test|pr|pull request|bug)\b/i },
];

function detectDomain(goal) {
  const g = (goal ?? "").toLowerCase();
  for (const r of DOMAIN_RULES) {
    if (r.re.test(g)) return r.domain;
  }
  return "general";
}

// ── Internal file helpers ─────────────────────────────────────────────────────

function _file() {
  const d = userData("memory");
  fs.mkdirSync(d, { recursive: true });
  return path.join(d, "outcomes.json");
}

function _load() {
  try {
    const raw = fs.readFileSync(_file(), "utf8");
    return JSON.parse(raw);
  } catch {
    return { outcomes: [], patterns: {} };
  }
}

function _save(store) {
  try {
    fs.writeFileSync(_file(), JSON.stringify(store, null, 2));
  } catch (err) {
    log.warn(`[OutcomeStore] save failed: ${err.message}`);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Record a completed task outcome.
 * @param {object} entry
 * @param {string} [entry.taskId]
 * @param {string} [entry.goal]
 * @param {string} [entry.domain]   — auto-detected from goal if omitted
 * @param {number} [entry.steps]
 * @param {"success"|"failure"|"partial"} entry.outcome
 * @param {string} [entry.evidence] — verification evidence string
 * @param {string} [entry.id]       — confirmation ID extracted by verifier
 */
function record({ taskId, goal, domain, steps, outcome, evidence, id } = {}) {
  const store = _load();

  const resolvedDomain = domain ?? detectDomain(goal);

  const entry = {
    taskId:   taskId   ?? null,
    goal:     (goal    ?? "").slice(0, 200),
    domain:   resolvedDomain,
    steps:    Number(steps) || 0,
    outcome,
    evidence: (evidence ?? "").slice(0, 200),
    id:       id       ?? null,
    ts:       Date.now(),
  };

  store.outcomes.push(entry);
  if (store.outcomes.length > MAX_OUTCOMES) {
    store.outcomes = store.outcomes.slice(-MAX_OUTCOMES);
  }

  // Update per-domain pattern stats
  const p = store.patterns[resolvedDomain] ?? { attempts: 0, successes: 0, avgSteps: 0 };
  p.attempts++;
  if (outcome === "success") p.successes++;
  p.avgSteps = Math.round(
    (p.avgSteps * (p.attempts - 1) + (Number(steps) || 0)) / p.attempts
  );
  store.patterns[resolvedDomain] = p;

  _save(store);
  log.info(`[OutcomeStore] ${outcome} | domain=${resolvedDomain} steps=${steps} id=${id ?? "–"}`);
  return entry;
}

/**
 * Load N most recent outcomes, newest first.
 * @param {number} [n=20]
 * @param {string} [domain] — optional filter
 */
function loadRecent(n = 20, domain = null) {
  const { outcomes } = _load();
  const filtered = domain ? outcomes.filter(o => o.domain === domain) : outcomes;
  return filtered.slice(-n).reverse();
}

/**
 * Return learned pattern stats for one domain (or all domains if omitted).
 * Each entry: { attempts, successes, avgSteps, successRate }
 */
function getPatterns(domain = null) {
  const { patterns } = _load();
  const enrich = p => ({ ...p, successRate: p.attempts > 0 ? p.successes / p.attempts : 0 });
  if (domain) {
    const p = patterns[domain];
    return p ? enrich(p) : null;
  }
  return Object.fromEntries(Object.entries(patterns).map(([k, v]) => [k, enrich(v)]));
}

module.exports = { record, loadRecent, getPatterns, detectDomain };
