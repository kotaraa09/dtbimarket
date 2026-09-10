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
pnpm test        # 45 API tests, including the append-only triggers
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
| External API integration | **Open** | REQ-H2, question Q-2 in `docs/01-requirements/requirements.md` |

The last row is genuinely open rather than merely undocumented. The R2 integration is a candidate, but `docs/02-design/decisions/0004-s3-compatible-object-storage.md` deliberately declines to claim it satisfies REQ-H2, so the decision is still to be made.

## Documentation

`docs/` holds requirements, design, architecture decision records, testing, operations and a dated working log. `CLAUDE.md` at the root states the rules that govern changes here — the append-only event table and the research-first priority order being the two that matter most.
