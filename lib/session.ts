// lib/session.ts
// Simple session management for stateless environment

import { cookies } from "next/headers";
import { nanoid } from "nanoid";

export interface UserSession {
  userId: string;
  credits: number;
  createdAt: number;
  lastActive: number;
}

// ⚠️  WARNING: This in-memory store is for development only.
// In serverless/Edge environments (Vercel, etc.) each function invocation may
// receive a fresh module instance, silently resetting all sessions and credits.
// Replace with Redis (e.g. Upstash) or a database before deploying to production.
const sessions = new Map<string, UserSession>();

/**
 * Get or create user session
 */
export async function getSession(): Promise<UserSession> {
  const cookieStore = await cookies();
  let sessionId = cookieStore.get("tl_session")?.value;

  // Create new session if doesn't exist
  if (!sessionId) {
    sessionId = nanoid(32);
    const session: UserSession = {
      userId: sessionId,
      credits: 0,  // New users start with 0 — must pay $0.99 to get 20 credits
      createdAt: Date.now(),
      lastActive: Date.now(),
    };
    sessions.set(sessionId, session);
    
    // Set cookie (7 days)
    cookieStore.set("tl_session", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    
    return session;
  }

  // Get existing session
  let session = sessions.get(sessionId);
  
  if (!session) {
    // Session not found — create new identity with 0 credits.
  // Credits are managed via Stripe metadata; session only tracks identity.
  session = {
    userId: sessionId,
    credits: 0,
    createdAt: Date.now(),
    lastActive: Date.now(),
  };
    sessions.set(sessionId, session);
  } else {
    // Update last active
    session.lastActive = Date.now();
    sessions.set(sessionId, session);
  }

  return session;
}

/**
 * Update session credits
 */
export async function updateCredits(userId: string, credits: number): Promise<void> {
  const session = sessions.get(userId);
  if (session) {
    session.credits = credits;
    sessions.set(userId, session);
  }
}

/**
 * Deduct credits from session
 */
export async function deductCredits(userId: string, amount: number): Promise<boolean> {
  const session = sessions.get(userId);
  if (!session || session.credits < amount) {
    return false;
  }
  
  session.credits -= amount;
  sessions.set(userId, session);
  return true;
}

/**
 * Add credits to session (after purchase)
 */
export async function addCredits(userId: string, amount: number): Promise<void> {
  const session = sessions.get(userId);
  if (session) {
    session.credits += amount;
    sessions.set(userId, session);
  }
}

/**
 * Clean up old sessions (run periodically)
 */
export function cleanupSessions() {
  const now = Date.now();
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActive > maxAge) {
      sessions.delete(id);
    }
  }
}

// ⚠️  Do NOT call setInterval here. In serverless environments the process is
// killed between requests, so intervals never fire and accumulate on warm starts.
// Instead, call cleanupSessions() from a Vercel Cron Job or scheduled task:
//   https://vercel.com/docs/cron-jobs
// Example cron route: GET /api/cron/cleanup → calls cleanupSessions()