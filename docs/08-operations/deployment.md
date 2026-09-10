# Deployment runbook

**Status:** first pass, 2026-09-10
**Decides nothing** — the provider choice is ADR-0006, which is `proposed` and not yet accepted. This document is how to carry it out, not the argument for it.

Two Vercel projects from one repository, plus Neon for PostgreSQL and Cloudflare R2 for photos. The API is a second project rather than a second origin: the web app proxies `/api/v1/*` to it, so the browser only ever talks to one hostname and the session cookie stays first-party (REQ-N24, ADR-0003).

Order matters. **Deploy the API first** — the web project needs its URL.

---

## 1. API project

| Setting | Value |
|---|---|
| Root Directory | `apps/api` |
| Framework Preset | Other |
| Build Command | from `apps/api/vercel.json` — leave the dashboard field empty |
| Node version | 22.x or later |

`vercel.json` sets the build command to `cd ../.. && pnpm db:generate`. This is not optional: the Prisma client is generated code and `.gitignore` excludes it, so without this step the function is deployed against a client that does not exist.

`api/index.ts` re-exports the Express app from `src/server.ts`, which only calls `listen()` when it is the process entry point. The same file therefore serves a container locally and a function here.

### Environment variables

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon **pooled** string, with `&pgbouncer=true` |
| `DIRECT_URL` | Neon **direct** string (no `-pooler` in the host) |
| `SESSION_SECRET` | a fresh 32-byte hex string — see below |
| `WEB_ORIGIN` | the web project's URL, once it exists |
| `STORAGE_DRIVER` | `s3` |
| `STORAGE_BUCKET` | `dtbimarket-photos` |
| `STORAGE_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `STORAGE_REGION` | `auto` |
| `STORAGE_ACCESS_KEY_ID` | from the R2 API token |
| `STORAGE_SECRET_ACCESS_KEY` | from the R2 API token |
| `STORAGE_FORCE_PATH_STYLE` | `false` for R2, `true` for Supabase or MinIO |

Generate a session secret that is **not** the local one:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`NODE_ENV` is set to `production` by the platform. That is what makes `config.ts` refuse to boot on a non-`s3` storage driver, which is the intended behaviour (ADR-0004) — a non-durable driver loses every product photo on deploy, and photo count is the metric the first recommendation is built on.

`DIRECT_URL` is required by the schema even though the running API never uses it. Migrations do.

---

## 2. Web project

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

1. `GET /api/v1/health` on the **web** origin, not the API origin. That exercises the rewrite, which is the part that can silently break.
2. Sign in as a seeded seller and confirm the session survives one navigation — that is the cookie being first-party.
3. Load a product page and confirm the photo renders rather than showing a broken thumbnail. A broken image means the bucket credentials or `STORAGE_FORCE_PATH_STYLE` are wrong, not the database.

---

## Known risks

**The API build is the uncertain part.** `apps/api` runs TypeScript with no build step and depends on two native modules — `@node-rs/argon2` and the Prisma query engine. `binaryTargets` in `schema.prisma` covers the Linux engines; the rest is unproven until it is tried. ADR-0006 names **Render** as the fallback, and the Debian engine target is already listed so switching does not need another schema change.

**Neon's free compute scales to zero after five minutes idle.** The first request after a quiet period will miss REQ-N28's 400 ms p95. Accepted for now; ADR-0006 Stage 2 is where it is fixed, before the study window opens.

**Backups.** Neon's free plan holds a six-hour restore window, which is not REQ-N35's daily backup. Until Stage 2 this is covered by a scheduled `pg_dump` to the bucket, and REQ-N35's restore rehearsal is a gate on opening the study window — not a task for after the first incident.
