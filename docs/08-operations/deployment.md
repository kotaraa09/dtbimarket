# Deployment runbook

**Status:** first pass, 2026-09-10
**Decides nothing** — the provider choice is ADR-0006, which is `proposed` and not yet accepted. This document is how to carry it out, not the argument for it.

The web app on Vercel, the API on Render, plus Neon for PostgreSQL and Cloudflare R2 for photos. The API is a separate service rather than a separate origin: the web app proxies `/api/v1/*` to it, so the browser only ever talks to one hostname and the session cookie stays first-party (REQ-N24, ADR-0003).

Order matters. **Deploy the API first** — the web project needs its URL.

---

## 1. API service — Render

**Not Vercel.** ADR-0006 chose Vercel for both apps and named Render as the fallback. The fallback was taken: Vercel's builder compiled `api/index.ts`, left its `../src/server.ts` import unresolved and never shipped `src/`, because this API is written to run as raw TypeScript through Node's native type stripping and imports every module by its `.ts` extension. Render runs the process the way a laptop does, so there is nothing to work around.

`render.yaml` at the repository root is a Blueprint and carries every setting below. Create the service with **New → Blueprint** and point it at this repository rather than filling in a form.

| Setting | Value | Why |
|---|---|---|
| Runtime | Node | |
| Region | Singapore | Neon is in `ap-southeast-1`. An API in Oregon puts the Pacific between every query and its database, which REQ-N28's 400 ms budget cannot absorb |
| Build | `corepack enable && pnpm install --frozen-lockfile && pnpm db:generate` | The Prisma client is generated code that `.gitignore` excludes |
| Start | `node apps/api/src/server.ts` | No compile step; `server.ts` calls `listen()` when it is the entry point |
| Health check | `/health` | |
| `NODE_VERSION` | `24` | Node 23.6+ strips types without a flag. Below that the start command fails on the first type annotation |

### Environment variables

Everything not secret is already in `render.yaml`. Render prompts for the rest, because they are declared `sync: false` and are therefore never committed (REQ-N3, `CLAUDE.md` rule 9):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon **pooled** string, with `&pgbouncer=true` |
| `DIRECT_URL` | Neon **direct** string (no `-pooler` in the host) |
| `SESSION_SECRET` | a fresh 32-byte hex string, not the local one |
| `WEB_ORIGIN` | the Vercel web deployment's URL |
| `STORAGE_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `STORAGE_ACCESS_KEY_ID` | from the R2 API token |
| `STORAGE_SECRET_ACCESS_KEY` | from the R2 API token |

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`NODE_ENV=production` is set in the blueprint. That is what makes `config.ts` refuse to boot on a non-`s3` storage driver, which is intended (ADR-0004): a non-durable driver loses every product photo on deploy, and photo count is the metric the first recommendation is built on.

`DIRECT_URL` is required by the schema even though the running API never uses it. Migrations do.

### The free tier sleeps

A free Render service stops after 15 minutes without traffic, and the next request waits roughly 50 seconds while it starts. The Vercel-hosted homepage stays instant; anything behind sign-in does not. A scheduled ping every 10 minutes avoids it. This is a demo-quality workaround, not a fix — ADR-0006 Stage 2 is where availability is addressed properly, before the study window opens.

---

## 2. Web project — Vercel

| Setting | Value |
|---|---|
| Root Directory | `apps/web` |
| Framework Preset | Next.js |
| Build / Install | defaults |

### Environment variables

| Variable | Value | Why |
|---|---|---|
| `API_ORIGIN` | the API project's URL | Target of the `/api/v1/*` rewrite in `next.config.ts` |
| `NEXT_PUBLIC_API_URL` | **empty string** | Makes `lib/api.ts` build relative URLs |

`NEXT_PUBLIC_API_URL` must be present and empty, not absent. `lib/api.ts` uses `??`, which falls back only on `null` or `undefined` — an empty string is kept, and that is what produces same-origin requests. Leaving it unset sends the browser to `http://localhost:4000`.

After the web project has a URL, set `WEB_ORIGIN` on the **API** project to match and redeploy it.

---

## 3. Migrations against a deployed database

Never edit `.env` to point at production. Use a separate file — every `.env.*` variant is gitignored (REQ-N3, `CLAUDE.md` rule 9):

```
DTBI_ENV_FILE=.env.neon pnpm db:deploy
```

`prisma.config.ts` reads `DTBI_ENV_FILE` and falls back to `.env`, so local development is unaffected.

**Seeding and any Prisma interactive transaction must use the direct connection.** Neon's pooler is PgBouncer in transaction mode; an interactive transaction opened through it fails with `Transaction not found`. Keep a second file whose `DATABASE_URL` is the direct string for those operations.

---

## 4. Verifying a deploy

1. `GET /health` on the Render service directly — that proves the process starts. Then `GET /api/v1/stores` on the **web** origin, which exercises the rewrite, the part that can silently break.
2. Sign in as a seeded seller and confirm the session survives one navigation — that is the cookie being first-party.
3. Load a product page and confirm the photo renders rather than showing a broken thumbnail. A broken image means the bucket credentials or `STORAGE_FORCE_PATH_STYLE` are wrong, not the database.

---

## Known risks

**The API sleeps on the free plan.** Fifteen minutes without traffic stops the service and the next request waits roughly 50 seconds. This is the largest gap between what is deployed now and REQ-N32, and it is why ADR-0006 Stage 2 is a precondition of opening the study window rather than an improvement to make later.

**Native modules are the thing to watch on any host change.** `apps/api` runs TypeScript with no build step and depends on `@node-rs/argon2` and the Prisma query engine. `binaryTargets` in `schema.prisma` lists both `rhel-openssl-3.0.x` and `debian-openssl-3.0.x`, so the engine is covered either way — but a future move to a different platform should verify sign-in works, not just that the process starts. Argon2 is only exercised on a real password hash.

**Neon's free compute scales to zero after five minutes idle.** The first request after a quiet period will miss REQ-N28's 400 ms p95. Accepted for now; ADR-0006 Stage 2 is where it is fixed, before the study window opens.

**Backups.** Neon's free plan holds a six-hour restore window, which is not REQ-N35's daily backup. Until Stage 2 this is covered by a scheduled `pg_dump` to the bucket, and REQ-N35's restore rehearsal is a gate on opening the study window — not a task for after the first incident.
