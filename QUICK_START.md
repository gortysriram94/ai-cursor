# Quick Start — Deploy Agent System

## Immediate Next Steps

### 1. Add Environment Variables

Create `.env.local` in project root:

```bash
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
```

### 2. Test Locally

```bash
npm install
npm run dev
```

Open http://localhost:3000
- Click "GET STARTED"
- Pick any vertical (e.g., UX Research)
- Upload a CSV
- Go to Step 5 → Type "analyze this data"
- Should see breadcrumb plan appear
- Click "Approve" on first breadcrumb
- Should execute and show cost savings

### 3. Deploy to Production

```bash
vercel --prod
```

Add env vars in Vercel dashboard:
- ANTHROPIC_API_KEY
- STRIPE_SECRET_KEY

### 4. Launch Content for 300k Followers

**Hook:** "I built an AI that saves you $8.95 every time you use it"

**Screen recording script:**
1. Upload trading CSV (100k rows)
2. Show cost banner: "$0.056 vs $9.03 without Pushpa"
3. Agent creates 3 breadcrumbs
4. Approve each one, show live execution
5. Final cost ticker: "Saved $8.98 (99.4%)"
6. CTA: "Try it free → Pushpa.com"

**Post copy:**
```
Most people pay $9 every time they ask Claude to analyze their data.

I built Pushpa to do the same thing for $0.05.

How? Three optimizations:
• Clean data before sending (40% fewer rows)
• Send stats instead of raw data (97% fewer tokens)
• Optimized prompts (30% reduction)

Result: 99% cost savings, shown at every step.

Agent runs in breadcrumbs — you approve each action.
No API key needed. Try it: [link]
```

---

## Files You Built

**Core agent system:**
- `/lib/cost-calculator.ts` — savings math
- `/lib/master-context.ts` — persistent memory
- `/lib/toolchain.ts` — tool executors
- `/app/api/agent/route.ts` — YOUR API key route
- `/app/tool/components/AgentTimeline.tsx` — breadcrumb UI

**Updated:**
- `/app/tool/components/VerticalPage.tsx` — Step 5 now uses agent
- `/app/page.tsx` — clarity redesign on landing

**Documentation:**
- `/AGENT_SYSTEM.md` — full technical docs

---

## Pricing Setup

In your Stripe dashboard, create products:

**Pay-as-you-go:**
- 10 credits: $1
- 100 credits: $5
- 500 credits: $20

**Subscription:**
- Pro: $19/month (unlimited credits)
- Team: $49/month (5 users, unlimited)

In your app, 1 credit = 1 AI message (deducted after execution).

---

## Monitoring

Track these metrics post-launch:

1. **Breadcrumb approval rate** — % of breadcrumbs users approve vs skip
2. **Average cost per session** — should be $0.05-0.10
3. **Credit purchase conversion** — % of users who buy after free trial
4. **Vertical distribution** — which workflows get most traffic

Add to your analytics:
```js
// On breadcrumb approve
analytics.track('Breadcrumb Approved', {
  tool: breadcrumb.tool,
  vertical: verticalId,
  estimatedCost: breadcrumb.estimatedCost
});

// On cost display
analytics.track('Savings Shown', {
  savedAmount: costBreakdown.costSaved,
  savedPercent: costBreakdown.costReductionPct
});
```

---

## Troubleshooting

**"Insufficient credits" error:**
- User needs to buy credits
- Show checkout modal
- Point them to pricing

**Breadcrumb plan fails:**
- Check ANTHROPIC_API_KEY is set
- Check Anthropic account has credits
- Check API route logs in Vercel

**Master context not persisting:**
- localStorage might be disabled
- Check browser console for errors
- Fallback: session continues without memory

**Cost calculation seems wrong:**
- Check `originalRowCount` is passed to `calculateCost()`
- Verify `cleanedRowCount` after deduplication
- Ensure `summarized: true` for accurate comparison

---

## What Users See

**Before (with BYOK):**
1. Connect API key
2. Paste data
3. Get analysis
4. No idea what it cost or what happened

**After (with agent):**
1. Upload data
2. See: "This will cost $0.05 vs $9.03 raw"
3. Agent shows 3 breadcrumbs
4. Approve each step
5. Watch savings accumulate
6. Final: "Saved $8.98 (99.4%)"

The cost comparison is the killer feature. Show it everywhere.

---

## Support

If users ask "why breadcrumbs instead of just running it?":
- "Full control — you approve every step"
- "Transparency — see exactly what the agent does"
- "Trust — no black box AI magic"

If they ask "why not use my own API key?":
- "Simpler — no key management"
- "Cheaper — we optimize tokens for you"
- "Faster — no setup, just upload and go"

---

Ship it. Your 300k followers are waiting.
