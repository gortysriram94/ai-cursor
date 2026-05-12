// lib/executor/tool-executor.ts
// ─────────────────────────────────────────────────────────────────────────────
// Suspense bridge: server-side workflow waits here until Electron POSTs back.
//
// CRASH SAFETY (fixes the silent-death bug):
//   If Next.js hot-reloads or restarts while a workflow is mid-step, the
//   Electron agent still completes its CDP action and POSTs to /api/tool-result.
//   Previously resolveToolResult() returned false and the result was lost forever.
//
//   Fix: recoveryBuffer — a 30-second TTL store for results that arrived with
//   no waiting promise. The next waitForToolResult() call checks this first.
//   Handles dev hot-reload (most common case) and brief process restarts.
//
// EVENT CONTRACT:
//   All keys are "${nodeId}_${requestId}" — requestId is generated per-action
//   in workflow/route.ts and must be globally unique within a session.
// ─────────────────────────────────────────────────────────────────────────────

type Resolver = {
  resolve:   (result: string) => void;
  reject:    (err: Error)     => void;
  timestamp: number;
};

// globalThis persists across Next.js hot-reloads within the same OS process.
const g = globalThis as typeof globalThis & {
  __pendingResults?:  Map<string, Resolver>;
  __recoveryBuffer?:  Map<string, { result: string; ts: number }>;
};

if (!g.__pendingResults)  g.__pendingResults  = new Map();
if (!g.__recoveryBuffer)  g.__recoveryBuffer  = new Map();

const pendingResults  = g.__pendingResults;
const recoveryBuffer  = g.__recoveryBuffer;

const TIMEOUT_MS     = 60_000;  // 60 s per action
const RECOVERY_TTL   = 30_000;  // results held 30 s for late waiters

// ── Periodic GC (runs lazily — no setInterval leaks) ─────────────────────────
function _gcOnce() {
  const now = Date.now();
  for (const [k, v] of pendingResults.entries()) {
    if (now - v.timestamp > TIMEOUT_MS + 5_000) pendingResults.delete(k);
  }
  for (const [k, v] of recoveryBuffer.entries()) {
    if (now - v.ts > RECOVERY_TTL) recoveryBuffer.delete(k);
  }
}

// ── Wait for an Electron result ───────────────────────────────────────────────

export function waitForToolResult(
  nodeId:    string,
  requestId: string,
  timeoutMs: number = TIMEOUT_MS,
): Promise<string> {
  const key = `${nodeId}_${requestId}`;

  // ── Check recovery buffer first (server restarted while Electron was working)
  const recovered = recoveryBuffer.get(key);
  if (recovered && Date.now() - recovered.ts < RECOVERY_TTL) {
    recoveryBuffer.delete(key);
    return Promise.resolve(recovered.result);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingResults.delete(key);
      reject(new Error(`waitForToolResult timeout (${timeoutMs}ms) — key: ${key}`));
    }, timeoutMs);

    pendingResults.set(key, {
      resolve: (result) => { clearTimeout(timeout); resolve(result); },
      reject:  (err)    => { clearTimeout(timeout); reject(err); },
      timestamp: Date.now(),
    });

    // Lazy GC — only when map grows (not a hot path)
    if (pendingResults.size % 10 === 0) _gcOnce();
  });
}

// ── Resolve with a result from Electron ──────────────────────────────────────

export function resolveToolResult(
  nodeId:    string,
  requestId: string,
  result:    string,
): boolean {
  const key   = `${nodeId}_${requestId}`;
  const entry = pendingResults.get(key);

  if (entry) {
    entry.resolve(result);
    pendingResults.delete(key);
    return true;
  }

  // No waiting promise — store for 30 s in case the waiter registers late.
  // This is the crash-recovery path: server restarted between send and POST.
  recoveryBuffer.set(key, { result, ts: Date.now() });
  return false;
}

// ── Reject with an error from Electron ───────────────────────────────────────

export function rejectToolResult(
  nodeId:    string,
  requestId: string,
  error:     string,
): boolean {
  const key   = `${nodeId}_${requestId}`;
  const entry = pendingResults.get(key);

  if (entry) {
    entry.reject(new Error(error));
    pendingResults.delete(key);
    return true;
  }
  return false;
}

// ── Diagnostics (health endpoint + logging) ───────────────────────────────────

export function getPendingCount(): number  { return pendingResults.size; }
export function getRecoveredCount(): number { return recoveryBuffer.size; }
