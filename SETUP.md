# Quick Setup - Add Your API Key

## Step 1: Get Your Anthropic API Key

1. Go to https://console.anthropic.com/settings/keys
2. Click "Create Key"
3. Copy the key (starts with `sk-ant-api03-...`)

## Step 2: Add Key to Project

**Create `.env.local` file** in the project root:

```bash
# Create the file
touch .env.local
```

**Add your key:**

```bash
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_ACTUAL_KEY_HERE
```

## Step 3: Install & Run

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Step 4: Test It

1. Type a prompt in the hero section
2. Click "START"
3. Agent should create breadcrumbs
4. Approve them and see it work

---

## Without API Key

- ✅ Landing page loads fine
- ✅ Chat page loads
- ❌ Breadcrumb planning fails (500 error)
- ❌ Agent can't respond

---

## For Production (Vercel)

Add environment variable in Vercel dashboard:

1. Go to project → Settings → Environment Variables
2. Add `ANTHROPIC_API_KEY` = `sk-ant-api03-...`
3. Redeploy

---

## Optional: Stripe for Payments

If you want users to buy credits:

```bash
# Add to .env.local
STRIPE_SECRET_KEY=sk_test_YOUR_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY
```

Without Stripe:
- App works fine
- Users can't purchase credits
- Unlimited free usage

---

## Troubleshooting

**"ANTHROPIC_API_KEY is not defined"**
→ Create `.env.local` with your key

**Breadcrumbs never appear**
→ Check API key is correct, restart server

**500 error on planning**
→ API key missing or invalid

---

## Cost Per Request

**Your costs (with optimization):**
- Small query: ~$0.03
- Medium dataset (10k rows): ~$0.03
- Large dataset (100k rows): ~$0.03

**You charge users:**
- $0.10 per message (1 credit)
- Your margin: ~$0.07 (70%)

**Why it's cheap:**
- Browser does the heavy lifting (free)
- Only final optimized context sent to Claude
- Constant cost regardless of data size
