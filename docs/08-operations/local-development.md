# Running the platform locally

**Written:** 2026-09-03
**Related:** `../02-design/architecture.md`, `../../CLAUDE.md`

Everything below runs against a local Postgres in Docker. The deployed database is decision D-1 and is still open, so there is no staging or production procedure yet.

## Prerequisites

- Node 22 or newer (24 is what this was built on — the API relies on Node's built-in TypeScript stripping, so there is no build step for it)
- pnpm 11 (`npm i -g pnpm`; `corepack enable` needs an admin shell on Windows)
- Docker, for Postgres and object storage

## First run

```bash
pnpm install
```

```bash
cp .env.example .env
```

Then put a real value in `SESSION_SECRET` — the API refuses to boot without one, deliberately:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Start the database and object storage, apply migrations, load demo data:

```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed
```

`pnpm db:up` brings up Postgres, MinIO and a one-shot container that creates the
photo bucket. MinIO's console is at http://localhost:9101 (`dtbi_local_dev` /
`dtbi_local_dev_secret`) if you want to see the objects.

Storage must be running **before** you seed: the seed writes real placeholder
images, and without a bucket it warns and leaves photo rows with nothing behind
them, which show up as broken thumbnails.

Run web and api together:

```bash
pnpm dev
```

- web — http://localhost:3000
- api — http://localhost:4000

Sign in as a seeded seller: `seed.ploy@example.invalid` / `seed-password-not-a-secret`. That password is in the repository on purpose and protects nothing; the seed script refuses to run against `NODE_ENV=production` without an explicit override.

## Tests

Integration tests use their own database so that a test run never writes event rows into the database used for demos.

```bash
pnpm test:db:setup
```

```bash
cp .env.test.example .env.test
```

Fill in `SESSION_SECRET` there too, apply the migrations to it, then run everything:

```bash
DATABASE_URL="postgresql://dtbi:dtbi_local_dev@localhost:5433/dtbimarket_test?schema=public" pnpm exec prisma migrate deploy
```

```bash
pnpm test
```

`pnpm lint` and `pnpm typecheck` cover the rest of the definition of done.

## Things that will trip you up

**The event table cannot be cleaned up.** It is append-only, enforced by a database trigger, so `DELETE FROM event` fails. To start over use `pnpm db:reset`, which drops and recreates the schema. `pnpm db:seed` refuses to run twice for the same reason — it cannot undo the previous run.

**Prisma asks before destroying data.** `prisma migrate reset` will not proceed without explicit confirmation. That is correct; do not script around it.

**Seed rows carry `is_seed = true`, and so do actions taken on them.** Signing in as a seeded seller and changing a price writes a seeded event. That is deliberate: demo activity must never appear in an analysis query or in a real seller's numbers (REQ-D3).

**Thai text and the Windows console.** `curl` on Windows mangles Thai in a command-line argument before it is sent, and `psql` in a cp1252 console prints `?` for characters that are stored correctly. Neither is an application bug. Check with `octet_length()` in SQL, or use a client that sends UTF-8, before concluding anything is wrong.

**Photo URLs expire.** With no public CDN configured, `urlFor` presigns URLs for
one hour. A page left open longer shows broken images until it refetches. That
is the safe default for a private bucket; production sets
`STORAGE_PUBLIC_BASE_URL` instead.

**Uploads are validated by their bytes, not their name or declared type.** A
file called `photo.png` that is not a PNG is refused with 415. That is REQ-N27
working, not a bug.

**Regenerate the Prisma client after changing the schema:**

```bash
pnpm db:generate
```

## What is not here yet

- **Deployment.** PB-04, blocked on D-1 — which now also carries the storage provider (ADR-0004).
- **Buyer side.** Catalogue, storefront, cart and orders are M2.
- **Dashboard metrics and the advisor.** M3. The overview page shows only counts it can derive honestly and says so on screen, rather than inventing numbers the shared metric layer will later own.
