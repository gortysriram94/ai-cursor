// lib/conversation-store.ts
// Store conversation history per user session

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface Conversation {
  userId: string;
  messages: Message[];
  lastUpdated: number;
}

// In-memory conversation store
// In production: use Redis, Upstash, Vercel KV, or similar
const conversations = new Map<string, Conversation>();

/**
 * Get conversation history for user
 */
export function getConversation(userId: string): Message[] {
  const conv = conversations.get(userId);
  return conv ? conv.messages : [];
}

/**
 * Add message to conversation
 */
export function addMessage(
  userId: string,
  role: "user" | "assistant",
  content: string
): void {
  const conv = conversations.get(userId) || {
    userId,
    messages: [],
    lastUpdated: Date.now(),
  };

  conv.messages.push({
    role,
    content,
    timestamp: Date.now(),
  });

  // Keep only last 20 messages (10 exchanges)
  if (conv.messages.length > 20) {
    conv.messages = conv.messages.slice(-20);
  }

  conv.lastUpdated = Date.now();
  conversations.set(userId, conv);
}

/**
 * Get recent context (last N messages)
 */
export function getRecentContext(userId: string, count: number = 4): Message[] {
  const messages = getConversation(userId);
  return messages.slice(-count);
}

/**
 * Clear conversation history
 */
export function clearConversation(userId: string): void {
  conversations.delete(userId);
}

/**
 * Clean up old conversations
 */
export function cleanupConversations(): void {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  for (const [userId, conv] of conversations.entries()) {
    if (now - conv.lastUpdated > maxAge) {
      conversations.delete(userId);
    }
  }
}

// Clean up every hour
if (typeof window === "undefined") {
  setInterval(cleanupConversations, 60 * 60 * 1000);
}
