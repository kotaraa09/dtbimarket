# dtbimarket

**Live: https://dtbimarket-web.vercel.app**

### Test accounts

Both are sellers. Sign in at [/signin](https://dtbimarket-web.vercel.app/signin).

| Email | Password | Store |
|---|---|---|
| `seed.ploy@example.invalid` | `seed-password-not-a-secret` | ร้านกาแฟพลอย |
| `seed.nut@example.invalid` | `seed-password-not-a-secret` | ร้านของขวัญณัฐ |

> **First load may take up to a minute.** The API is on a free plan that sleeps after 15 minutes without traffic. The homepage is instant; signing in is what waits. It is fast on every request after that.

> These are demonstration accounts holding no real data. Every row they own is flagged `is_seed = true` and is excluded from all analysis.

---

## What this is

A shared e-commerce platform for student-run micro-businesses at Mae Fah Luang University, plus an AI advisor that turns the platform's own data into recommendations for those sellers.

It is a master's thesis first and a product second. The research question is whether AI tools that read a business's own data help its owner improve sales, measured by a 7-day action rate. That priority is why some things here look over-engineered for their size: every user-facing action writes an append-only event row in the same transaction, because a semester of data cannot be collected twice.

The UI is Thai throughout.

## Stack

| | |
|---|---|
| Web | Next.js (App Router), TypeScript — **Vercel** |
| API | Express, TypeScript — **Render** |
| Database | PostgreSQL via Prisma — **Neon** |
| Photos | S3-compatible object storage — **Cloudflare R2** |

The browser only ever talks to the web origin. `/api/v1/*` is proxied to the API from `next.config.ts`, which keeps the session cookie first-party and `SameSite=Lax` — see `docs/02-design/decisions/0003-server-side-session-cookie.md`.

## Running locally

Needs Node 22+, pnpm, and Docker for PostgreSQL and MinIO.

```bash
pnpm install
cp .env.example .env        # then fill in SESSION_SECRET
pnpm db:up                  # PostgreSQL + MinIO
pnpm db:migrate
pnpm db:seed
pnpm dev                    # web on :3000, api on :4000
```

```bash
pnpm test        # 61 API tests, including the append-only triggers
pnpm typecheck
pnpm lint
```

`docs/08-operations/local-development.md` covers the traps that are not bugs.

## Coursework requirements

| Requirement | Status | Where |
|---|---|---|
| Authentication | Done | Email and password, Argon2id, server-side session in an httpOnly cookie |
| CRUD | Done | Seller creates, edits, publishes, unpublishes and deletes products |
| Cloud deployment | Done | The link at the top of this file |
| Dashboard | Done | Seller store metrics — views, orders, product count, photo coverage |
| External API integration | Done | OpenRouter, in the AI assistant below — `docs/02-design/decisions/0007-ai-assistant-beside-the-advisor.md` |

## The AI assistant

Two features, both for the signed-in seller, both reachable from the links at the top of this file.

**Level 1 — draft a product description.** Dashboard → สินค้า → แก้ไข on any product → **ให้ AI ช่วยเขียนคำอธิบาย**. The draft appears labelled as a machine suggestion; nothing is saved until the seller presses save, and they can edit it first or throw it away.

**Level 2 — summarise the shop.** Dashboard → **ให้ AI สรุปร้านของคุณ**. It reads the seller's products, their photos and the event history of the shop, writes a Thai summary and one suggested next step, stores both with the exact figures they came from, and logs the call. It changes nothing in the shop; the seller acts or does not.

Three things are worth pointing at while testing it:

- **The numbers are checked, not trusted.** Every run of digits in the generated summary has to appear in the snapshot the model was given, or the summary is refused and the refusal is logged. The snapshot is printed underneath the text so it can be checked by eye.
- **The key is server-side.** `OPENROUTER_API_KEY` is read by `apps/api` and never reaches the browser — dev tools on the deployed site show a call to `/api/v1/ai/...` and no key. `.env` is gitignored and `.env.example` carries the name with no value.
- **Failures are recorded and do not block anything.** A timeout, a bad key or an ungrounded answer writes a row to `ai_run_log`, emits `ai.call_failed`, and shows a Thai message that says what the seller can still do. Writing the description by hand was always available.

This is **not** the AI advisor the thesis is about. That one produces its copy from deterministic templates and is randomised per seller — `docs/02-design/decisions/0002-templated-advisor-copy.md` explains why a language model is kept out of it, and ADR-0007 explains why this assistant is allowed to exist beside it.

## Documentation

`docs/` holds requirements, design, architecture decision records, testing, operations and a dated working log. `CLAUDE.md` at the root states the rules that govern changes here — the append-only event table and the research-first priority order being the two that matter most.
