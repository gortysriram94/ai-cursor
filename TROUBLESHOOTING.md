# Troubleshooting 500 Errors

## Common Causes

### 1. Missing ANTHROPIC_API_KEY

**Symptom:** `POST /api/agent 500`

**Check your terminal/console for:**
```
❌ ANTHROPIC_API_KEY is not set in environment variables
```

**Fix:**
```bash
# Create .env.local in project root
echo "ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE" > .env.local

# Restart dev server
npm run dev
```

---

### 2. Invalid API Key

**Symptom:** Error after 3-4 seconds with Anthropic error

**Console shows:**
```
Anthropic API status: 401
Anthropic API message: Invalid API key
```

**Fix:**
1. Go to https://console.anthropic.com/settings/keys
2. Create new key
3. Copy the FULL key (starts with `sk-ant-api03-`)
4. Update `.env.local`
5. Restart server

---

### 3. API Key Not Loading

**Symptom:** Key is in `.env.local` but still getting errors

**Check:**
```bash
# Print env vars (won't show value if set correctly)
echo $ANTHROPIC_API_KEY

# Or in Node.js console
node -e "console.log(process.env.ANTHROPIC_API_KEY)"
```

**Fix:**
1. Make sure file is named `.env.local` (not `.env`)
2. Restart dev server completely
3. Check for typos in variable name
4. No quotes around the key value

---

### 4. Rate Limiting

**Symptom:** Works sometimes, fails others

**Console shows:**
```
Anthropic API status: 429
Too many requests
```

**Fix:**
- Wait 60 seconds
- Reduce request frequency
- Check Anthropic dashboard for rate limits

---

## Debug Steps

### Step 1: Check if key is loaded

Add this to `/app/api/agent/route.ts` temporarily:

```typescript
export async function POST(req: NextRequest) {
  console.log("🔑 API Key exists:", !!process.env.ANTHROPIC_API_KEY);
  console.log("🔑 API Key length:", process.env.ANTHROPIC_API_KEY?.length);
  // ... rest of code
}
```

You should see:
```
🔑 API Key exists: true
🔑 API Key length: 108
```

If `false` or `undefined` → key not loaded

---

### Step 2: Test API key directly

Create `test-api.js`:

```javascript
require('dotenv').config({ path: '.env.local' });
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function test() {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Hello' }],
    });
    console.log('✅ API key works!');
    console.log('Response:', response.content[0].text);
  } catch (err) {
    console.error('❌ API error:', err.message);
    console.error('Status:', err.status);
  }
}

test();
```

Run:
```bash
npm install dotenv
node test-api.js
```

---

### Step 3: Check browser console

Open browser DevTools → Console tab

Look for errors like:
```
POST http://localhost:3000/api/agent 500
{error: "ANTHROPIC_API_KEY is not configured"}
```

---

### Step 4: Check server logs

In your terminal where `npm run dev` is running:

Look for:
```
❌ Agent API error: [error details]
Error details: {...}
```

This will show the ACTUAL error from Anthropic

---

## Quick Checklist

- [ ] `.env.local` exists in project root
- [ ] File contains `ANTHROPIC_API_KEY=sk-ant-api03-...`
- [ ] Key is valid (test at console.anthropic.com)
- [ ] Dev server restarted after adding key
- [ ] No spaces or quotes around key value
- [ ] Using correct model: `claude-sonnet-4-20250514`

---

## Still Not Working?

**Check the server terminal for error messages:**

The new error logging will show:
1. Whether API key exists
2. Full error details
3. Anthropic API status code
4. Error message from Anthropic

**Then:**
1. Copy the error message
2. Check if it's a key issue (401)
3. Check if it's rate limiting (429)
4. Check if it's model availability (400)

---

## Example Working .env.local

```bash
# This should work
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# (Your Stripe keys if you have them)
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

**Total file size:** ~150 bytes minimum for just the Anthropic key

---

## Common Mistakes

❌ **Wrong file name:** `.env` instead of `.env.local`  
❌ **Quotes around key:** `ANTHROPIC_API_KEY="sk-ant-api03-..."` (remove quotes)  
❌ **Spaces:** `ANTHROPIC_API_KEY = sk-ant-api03-...` (no spaces)  
❌ **Old key:** Deleted from Anthropic console  
❌ **Wrong variable name:** `ANTHROPIC_KEY` instead of `ANTHROPIC_API_KEY`

✅ **Correct:**
```bash
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxx
```
