# Test Scenario — Pure Agent Mode

## What Changed

**The entire app is now just an agent chat interface.**

- No vertical selection
- No step-by-step workflow
- No manual file upload UI
- Just type your intent → agent handles everything

---

## Test Flow

### 1. Start the app
```bash
npm run dev
```
Go to http://localhost:3000

### 2. Click "GET STARTED"
Should redirect to `/agent`

You'll see:
```
┌─ Pushpa ────────────────────────────────────┐
│                                                 │
│  What are you trying to do?                    │
│                                                 │
│  Type anything — analyze data, audit costs,    │
│  find patterns. The agent handles everything.  │
│                                                 │
│  [                                         ]    │
│  [Send]                                         │
└─────────────────────────────────────────────────┘
```

### 3. Type your intent
```
analyze my trading data for Q4 risk patterns
```

Click **Send**

### 4. Agent creates breadcrumb plan

Should see 4 breadcrumbs:

```
┌─ Breadcrumb 1 of 4 ─────────────────────────┐
│ #1  Upload trading data CSV      Waiting    │
│                                              │
│ Tool: upload_file                            │
│ Free (browser-side)                          │
│                                              │
│ Need user's trading data to analyze Q4 risk  │
│ patterns                                     │
│                                              │
│ [✓ Approve] [✗ Skip]                        │
└──────────────────────────────────────────────┘

┌─ Breadcrumb 2 of 4 ─────────────────────────┐
│ #2  Clean uploaded data          Waiting    │
│ ...                                          │
└──────────────────────────────────────────────┘

┌─ Breadcrumb 3 of 4 ─────────────────────────┐
│ #3  Search web for Q4 market data            │
│ ...                                          │
└──────────────────────────────────────────────┘

┌─ Breadcrumb 4 of 4 ─────────────────────────┐
│ #4  Generate risk analysis                   │
│ ...                                          │
└──────────────────────────────────────────────┘
```

### 5. Approve breadcrumb 1 (upload file)

Click **✓ Approve** on "Upload trading data CSV"

**File picker should open automatically**

Select the trades.csv file (create same test file from previous scenario)

After upload:
```
┌─ Breadcrumb 1 of 4 — COMPLETE ──────────────┐
│ #1  Upload trading data CSV      Complete    │
│                                              │
│ File uploaded: trades.csv (1.2KB)            │
│                                              │
│ Cost: $0.00 | Tokens: 0                     │
└──────────────────────────────────────────────┘
```

### 6. Approve remaining breadcrumbs

Click through:
- Breadcrumb 2 → Cleans data
- Breadcrumb 3 → Searches web
- Breadcrumb 4 → Generates analysis

Final result: complete Q4 risk analysis

---

## Key Difference From Before

**Before (vertical-based):**
```
1. Pick vertical (Traders)
2. Fill context form
3. Upload file manually
4. Review cleaned data
5. Review prompt
6. Agent analyzes
```

**Now (pure agent):**
```
1. Type: "analyze my trading data"
2. Agent: "I need your file" (as breadcrumb)
3. User clicks approve → file picker opens
4. User uploads → agent cleans automatically
5. Agent continues with analysis
```

---

## Expected Behavior

✅ **Landing page** → Clean agent interface  
✅ **User types intent** → Agent creates plan  
✅ **First breadcrumb** → "Upload file"  
✅ **User approves** → File picker opens  
✅ **File uploads** → Auto-marked complete  
✅ **Agent continues** → Remaining breadcrumbs execute  

---

## What to Test

### Scenario A: Trading analysis (with file)
```
Input: "analyze my Q4 trades for risk"
Expected: upload → clean → search → analyze
```

### Scenario B: General question (no file needed)
```
Input: "what's the Sharpe ratio formula"
Expected: web_search → generate_analysis (no upload)
```

### Scenario C: AWS cost audit
```
Input: "audit my AWS costs"
Expected: upload → clean → generate_analysis
```

### Scenario D: Code generation (no file)
```
Input: "write Python code to calculate moving average"
Expected: write_code (no upload)
```

---

## Troubleshooting

**File picker doesn't open:**
- Check browser console for errors
- Verify fileInputRef is defined
- Check approveCrumb function triggers .click()

**Agent doesn't request file upload:**
- Check agent API prompt includes upload_file tool
- Verify user's intent mentions "data" or "file"
- Agent should infer need for data

**Breadcrumbs don't appear:**
- Check ANTHROPIC_API_KEY is set
- Check /api/agent route is working
- Check browser network tab for errors

---

## Launch Content

**Hook:** "I rebuilt my app so you just type what you want — no forms, no steps, the AI does everything"

**Demo video script:**
1. Show landing page (just the question)
2. Type: "analyze my trading data for Q4 risk"
3. Agent creates 4 breadcrumbs
4. Click approve on "upload file" → picker opens
5. Upload → auto-cleans → continues
6. Final analysis appears
7. Show cost: "$0.05 vs $9.03 saved"

**Post copy:**
```
Most AI tools make you:
- Pick a workflow
- Fill out forms
- Upload files manually
- Configure settings

I rebuilt mine so you just type what you want.

"Analyze my trading data for Q4 risk"

The agent:
- Asks for your file (as a breadcrumb)
- Cleans it automatically
- Searches for context
- Generates the analysis

You just approve each step.

$0.05 instead of $9.03.

Try it: [link]
```

---

Built: Pure agent mode, no verticals, prompt-first architecture
