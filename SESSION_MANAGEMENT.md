# Session Management

## How It Works

Pushpa uses a **stateless session system** with server-side memory storage for development and easy migration to production databases.

### Components

1. **Session Management** (`/lib/session.ts`)
   - Creates unique user sessions via cookies
   - Tracks credits per user
   - Auto-cleanup of old sessions

2. **Conversation History** (`/lib/conversation-store.ts`)
   - Stores last 20 messages per user
   - Provides context to Claude
   - Auto-cleanup after 24 hours

### User Flow

```
1. User visits site
   ↓
2. Session created (cookie: tl_session)
   ↓
3. Assigned userId + 10 free credits
   ↓
4. All messages stored with userId
   ↓
5. Conversation context persists across page refreshes
```

### Storage

**Development (Current):**
- In-memory Map storage
- Resets on server restart
- Fast, simple

**Production (Recommended):**
```typescript
// Replace Map with Redis/Upstash
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_URL,
  token: process.env.UPSTASH_TOKEN,
});

// Then in session.ts:
export async function getSession() {
  const sessionId = cookies.get("tl_session")?.value;
  const session = await redis.get(`session:${sessionId}`);
  // ...
}
```

### Session Cookie

```
Name: tl_session
Value: 32-char nanoid
Duration: 7 days
HttpOnly: true
Secure: true (production)
SameSite: lax
```

### Conversation Context

- Keeps last **4 messages** (2 exchanges) for Claude context
- Stores up to **20 messages total** (10 exchanges)
- Older messages automatically pruned

### Credits

- New users: **10 free credits**
- Tracked per session
- Deducted on task completion
- Added on Stripe purchase

### API Usage

```typescript
// Get current user session
const session = await getSession();
console.log(session.userId, session.credits);

// Check credits before task
if (session.credits < taskCost) {
  return { error: "Insufficient credits" };
}

// Deduct credits after task
await deductCredits(session.userId, taskCost);

// Add credits after purchase
await addCredits(session.userId, 100);
```

### Migration to Production

**Option 1: Upstash Redis**
```bash
npm install @upstash/redis
```

**Option 2: Vercel KV**
```bash
npm install @vercel/kv
```

**Option 3: PostgreSQL + Drizzle**
```bash
npm install drizzle-orm postgres
```

**Option 4: Supabase**
```bash
npm install @supabase/supabase-js
```

### Clean Up

Old sessions are automatically cleaned:
- Sessions: 7 days inactive
- Conversations: 24 hours inactive
- Runs every hour

### Security

✅ HttpOnly cookies (XSS protection)
✅ Secure in production (HTTPS only)
✅ SameSite=lax (CSRF protection)
✅ No PII stored in cookies
✅ Sessions auto-expire

### Testing

```bash
# Clear your session
# Delete cookie: tl_session in browser DevTools

# Check session
curl -c cookies.txt http://localhost:3000/api/chat

# Use session
curl -b cookies.txt -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'
```

### Edge Runtime Compatibility

Both session.ts and conversation-store.ts work on Edge Runtime:
- Uses Next.js `cookies()` API
- No Node.js dependencies
- Fast, global deployment
