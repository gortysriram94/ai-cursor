// lib/ai-job-queue.ts
// Uses global state so the queue is shared across all Next.js route handlers.

export interface Job {
  id:     string;
  text:   string;
  action: string;
}

interface PendingJob extends Job {
  resolve: (result: string) => void;
  reject:  (err: Error)     => void;
}

declare global {
  // eslint-disable-next-line no-var
  var __aiQueue:   Job[]                   | undefined;
  var __aiPending: Map<string, PendingJob> | undefined;
}

const queue   = (global.__aiQueue   ??= []);
const pending = (global.__aiPending ??= new Map());

const TIMEOUT_MS = 30_000;

export function enqueueJob(id: string, text: string, action: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const job: PendingJob = { id, text, action, resolve, reject };
    queue.push({ id, text, action });
    pending.set(id, job);

    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        const i = queue.findIndex(j => j.id === id);
        if (i > -1) queue.splice(i, 1);
        reject(new Error("Timeout — browser did not respond in 30s"));
      }
    }, TIMEOUT_MS);
  });
}

export function dequeueJob(): Job | null {
  return queue.shift() ?? null;
}

export function resolveJob(id: string, result: string): boolean {
  const job = pending.get(id);
  if (!job) return false;
  pending.delete(id);
  job.resolve(result);
  return true;
}
