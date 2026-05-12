# Pushpa v3 — by Techtonix Media

> "Finally. AI that understands your data."

A data preprocessing and AI optimization platform built with Next.js 14.
All processing runs client-side. No backend storage. No user data on servers.

---

## Phases Completed

- ✅ Phase 1 — Compliance fixes (legal pages, FTC-compliant copy)
- ✅ Phase 2 — Architecture fixes (server-side credits, batch ZIP, RAG overlap)
- ✅ Phase 3 — Vertical mode selector (7 verticals, normalizers, prompt templates)
- ✅ Phase 4 — Local knowledge base (OPFS + Transformers.js embeddings + vectra)
- ✅ Phase 5 — BYOK streaming AI (Claude + GPT-4o, pipeline viz, cost ticker)
- ✅ Phase 6 — Image/video generation (DALL-E 3, FLUX.1, Luma AI)
- ✅ Phase 7 — Credits and subscriptions (Stripe, magic link auth, account page)
- ✅ Phase 8 — Media processing (EXIF strip, WebP convert, transcript cleaner)

---

## Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + CSS variables (light/dark mode)
- **Payments**: Stripe (embedded checkout, subscriptions, credit packs)
- **Storage**: IndexedDB (idb-keyval) + OPFS (local knowledge base)
- **AI embeddings**: Transformers.js (Xenova/all-MiniLM-L6-v2, runs locally)
- **Processing**: Web Workers (public/worker.js, unified, no ES modules)
- **Generation**: DALL-E 3, FLUX.1 (fal.ai), Luma AI Dream Machine

---

## Architecture

```
No backend storage    — files never leave the browser
No user accounts DB   — Stripe Customer ID is identity
No server AI calls    — BYOK (user's own API keys)
No generation costs   — users pay their own providers
OPFS                  — persistent local knowledge base
Stripe metadata       — credit ledger (atomic, server-enforced)
```

---

## Pages

| Route | Description |
|---|---|
| `/` | Landing page with particle field |
| `/tool` | Main data cleaning tool |
| `/kb` | Local knowledge base management |
| `/generate` | Standalone image/video generation |
| `/media` | Media processing (EXIF, WebP, transcripts) |
| `/account` | Account dashboard (credits, subscription) |
| `/privacy` | Privacy Policy |
| `/terms` | Terms of Service |
| `/refund` | Refund Policy |
| `/disclaimer` | Disclaimer |

---

## Setup

```bash
npm install
cp .env.example .env.local
# Fill in your Stripe keys and price IDs
npm run dev
```

## Environment Variables

See `.env.example` for all 30 required variables:
- Stripe secret + publishable keys
- 16 export/add-on price IDs
- 3 subscription price IDs (Pro/Studio/Team)
- 9 credit pack price IDs (text/image/video)
- Stripe webhook secret
- App base URL

---

## Compliance

- No HIPAA/GDPR compliance claims
- Financial disclaimer on all trading features
- No fake testimonials or user counts
- AI accuracy disclaimer on all AI outputs
- Privacy Policy, Terms, Refund Policy, Disclaimer all present

---

© 2026 Techtonix Media Inc.
