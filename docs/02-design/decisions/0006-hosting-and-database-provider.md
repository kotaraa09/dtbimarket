# 0006 — Hosting and managed database provider

**Status:** proposed — **not accepted.** D-1 is on the ask-before-doing list in `CLAUDE.md`; nothing may be provisioned until the owner accepts
**Date:** 2026-09-10
**Decides:** D-1, named in `../architecture.md`, and with it the `STORAGE_*` provider that ADR-0004 deferred
**Blocks released if accepted:** PB-04 (M0 exit condition), PB-10's production path
**Context:** `../architecture.md` (Deployment), REQ-H1, REQ-N24, REQ-N28, REQ-N32, REQ-N34, REQ-N35, REQ-C5, ADR-0001, ADR-0003, ADR-0004

## Context

Two deadlines are being confused with each other, and separating them is most of this decision.

**The coursework deadline needs a URL a grader can open.** The exercise it is modelled on used Firebase Hosting. REQ-H1 asks only that the application is deployed to a cloud environment reachable by real sellers and buyers; the rubric line RS-C says "cloud deployment", not "Firebase".

**The study window needs durability**, and it needs it later. REQ-N32 (99% monthly), REQ-N35 (daily backup and a restore actually performed), REQ-N28 (dashboard p95 under 400 ms) and REQ-N34 (no committed event lost) are P1 — but they bite when the window opens, not when the assignment is submitted. Treating them as one deadline forces a payment decision months early.

Two owner constraints are fixed: **no credit card is available**, and money should not be spent for a single assignment.

What must be hosted: `apps/web` (Next.js, server-rendered), `apps/api` (Express), `services/advisor` (Python, not yet built), managed PostgreSQL, and an S3-compatible bucket. ADR-0004 is binding here — `config.ts` refuses to boot in production on any driver but `s3`, so the storage provider must speak the S3 API.

One fact narrows the field more than it appears to. **REQ-C5: payment is arranged off-platform; the platform records that an order exists and does not move money**, and PB-35 puts in-platform payment out of this cycle. Free tiers that forbid commercial use are therefore a weaker objection than `CLAUDE.md`'s "real money" phrasing suggests — though not a vanished one, see Consequences.

## Decision

**Deploy to Vercel and Neon on their no-card free tiers now, and re-decide the database before the study window opens.** Staged, because the two deadlines are separate.

**Stage 1 — the assignment, zero cost, no card**

- `apps/web` and `apps/api` → **Vercel Hobby.** No card, first-class Next.js, no cold-start penalty on the seller dashboard. The API is served under `/api/**` on the same origin as the web app, which is not cosmetic: a cross-origin split would force `SameSite=None` and break REQ-N24 and ADR-0003.
- PostgreSQL → **Neon free.** 0.5 GB, 100 CU-hours/month, no card, never expires, commercial use permitted.
- Photos → **Cloudflare R2** (10 GB, S3-compatible, zero egress) if it activates without a payment method; **Supabase Storage's S3 endpoint** (1 GB, no card) if it does not. Either way `STORAGE_*` variables only, no code change, exactly as ADR-0004 intended.
- Daily `pg_dump` to the bucket on a schedule. Neon's free plan gives a **6-hour** restore window capped at 1 GB of change history, which is not the daily backup REQ-N35 asks for. The dump closes the gap at zero cost.

**Stage 2 — before the study window opens, and as a condition of opening it**

- Re-decide the database against REQ-N32 and REQ-N35 with real numbers. Two funded routes exist, neither needing a card: **Azure for Students** ($100 credit, 12 months, verified with the `@lamduan.mfu.ac.th` address, renewable while enrolled) funding a PostgreSQL Flexible Server with automated daily backups and a real PITR window; or a paid Neon plan for a 7-day history window.
- Perform the restore rehearsal REQ-N35 requires and record it in `docs/08-operations/`.
- Sizing and monthly cost are **unverified** and must be checked at provisioning. No figure is recorded here, because a number invented in an ADR gets quoted later as though it were measured.

**Firebase is not used.** It was the starting point of the question and it survives none of the constraints — see below.

## Alternatives considered

**Firebase App Hosting.** The honest reading of the assignment, and the only Firebase product that can host a server-rendered Next.js app. **Rejected: it requires the Blaze plan with billing enabled, so a card, even to stay inside the free allowance.** With the assignment satisfied by any gradeable URL, it buys nothing for a constraint it cannot meet.

**Firebase Hosting on the free Spark plan.** Static files only. The dashboard is server-rendered behind a session cookie, so the app would have to become a client-side SPA calling an API on another origin — `SameSite=None`, against REQ-N24, undermining ADR-0003. Rejected on the security requirement, before cost enters it.

**Firestore instead of PostgreSQL.** Rejected, and it is the alternative worth recording most carefully, because it is what the exercise implies and it would have cost the thesis rather than time. The 7-day action rate is a join from `Recommendation` to `Event`; Firestore has no joins. ADR-0001 and REQ-N34 require the event and the action it describes in one transaction. REQ-N18 requires the analysis reproducible by one command over exported data. Per `CLAUDE.md`'s priority order, a hosting convenience that damages the research design loses.

**Render free tier.** No card, which fits. **Its free PostgreSQL expires 30 days after creation** with a 14-day grace period before deletion — disqualifying for a semester-long window where lost events cannot be recovered. Free web services also spin down after inactivity, and a ~50 s cold start fails REQ-N28 and greets a grader with a hung page.

**Supabase as the database.** 500 MB free, no card, a real dedicated Postgres. **Rejected as the primary store: free projects pause after one week without API requests.** Against REQ-N32, and a paused database during a quiet week of the study window loses events outright. Its storage product is still the fallback bucket, where a pause is recoverable and a lost photo is not a lost event.

**Cloudflare Workers and Pages.** Free, no card for Pages, and it permits commercial use — the one free tier with no ambiguity on that point. Rejected for now on `CLAUDE.md`'s "prefer boring": Next.js SSR needs the OpenNext adapter and Prisma needs Hyperdrive or a driver adapter, which is real complexity bought for a risk that has not materialised. **Kept as the named escape hatch** if the Vercel terms question below turns real.

**Azure for Students for everything.** The credit is genuine and needs no card, and it is the right answer for Stage 2's database. Rejected as the whole stack because **Azure Blob Storage does not speak S3**, so photos would break ADR-0004's production driver guard and force that ADR to be reopened — which it deliberately structured itself to avoid. The credit funds the database; the bucket stays S3-compatible elsewhere.

## Consequences

**Accepted: Vercel Hobby's commercial-use restriction is a residual risk, not a resolved one.** REQ-C5 means no money moves through the platform, which is the strongest argument that this is a university research deployment rather than a business. It is not a guarantee — the platform does facilitate trade between real sellers and real buyers. The mitigation is that migration is cheap and pre-named: Cloudflare Pages, or Azure App Service on the student credit. This is recorded so it is not rediscovered as a surprise.

**Accepted: Neon's free compute scales to zero after five minutes idle.** The first dashboard request after a quiet period will miss REQ-N28's 400 ms p95. Tolerable while the target is a grader and seeded staging data; it is one of the two things Stage 2 exists to fix.

**Accepted: REQ-N35 is met by a scheduled `pg_dump`, not by the provider, until Stage 2.** A dump that has never been restored is a belief, not a backup — REQ-N35 says so. The rehearsal is a Stage 2 gate on opening the window, not a task to be done after the first incident.

**Consequence: Stage 2 is a precondition of the study window, and must not be allowed to become optional.** If Stage 1 works well enough, the temptation will be to open the window on it. A free-tier database that pauses, throttles or holds six hours of history is a research risk, not merely an operations one: the window is locked to the university calendar and a lost week cannot be re-collected.

**Consequence: ADR-0004 is honoured without amendment.** The provider arrives as `STORAGE_*` configuration, and the `s3` driver that development exercises against MinIO is the one that ships.

**Consequence: `services/advisor` has no home yet.** It does not exist, so nothing is blocked today. Vercel's Python runtime and the Azure credit are both candidates, and REQ-N30's 800 ms budget is the constraint that will decide it. This ADR does not pretend to have decided it.

---

## Update, 2026-09-10 — the fallback was taken for the API

Stage 1 was carried out and **the API did not build on Vercel.** The specific failure, after two rounds of configuration:

```
Cannot find module '/var/task/apps/api/src/server.ts'
  imported from /var/task/apps/api/api/index.js
```

Vercel's builder compiled the entry point and left its `../src/server.ts` import unresolved, shipping no `src/` at all. This is not a misconfiguration to correct. `apps/api` is written to run as raw TypeScript through Node's native type stripping and imports every module by its `.ts` extension; Vercel's Node builder does not follow those. Forcing `src/` into the bundle would only move the problem one layer down into `@dtbi/db`'s generated client, which imports the same way — and the alternative, emitting JavaScript, is barred by `noEmit` and `allowImportingTsExtensions` and would mean rewriting every import specifier in two packages to satisfy a host.

**The API is therefore on Render**, which runs `node apps/api/src/server.ts` as a long-lived process — the same execution model as a development machine, so there is nothing to work around. `render.yaml` at the repository root is the blueprint. `apps/web` stays on Vercel, and the `/api/v1/*` rewrite in `next.config.ts` is unchanged and verified working: a request to the web origin reached the API service.

Three things this vindicates or costs:

- **The `binaryTargets` decision paid for itself.** `debian-openssl-3.0.x` was listed when the Vercel path still looked likely, precisely so this move would not need a schema change. It did not.
- **`config.ts` now reads `PORT` before `API_PORT`.** Render assigns the port and routes to it; a hard-coded port means the health check never passes.
- **The sleep problem is now the headline risk.** A free Render service stops after fifteen minutes idle and takes roughly 50 seconds to wake. That is a worse availability story than Vercel would have given, and it makes Stage 2 more urgent rather than less.

The status of this ADR is unchanged — still `proposed`, still awaiting the owner. What changed is that the fallback it named is now the main path for one of the two applications, which is worth recording where the original reasoning lives rather than only in the log.
