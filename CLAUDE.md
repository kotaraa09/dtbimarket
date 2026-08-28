# CLAUDE.md

Read this before doing anything in this repository.

## What this project is

A shared e-commerce platform for student-run micro-businesses at Mae Fah Luang University, plus an AI advisor module that turns the platform's own data into recommendations for those sellers.

It serves three purposes at once. **When they conflict, this is the priority order:**

1. **Research.** This is a master's thesis. The finding is: *how the framing of an AI recommendation affects whether a micro-entrepreneur acts on it*, measured by the 7-day action rate.
2. **Coursework.** Must demonstrate authentication, CRUD, cloud deployment, a dashboard, and an external API integration.
3. **Product.** Real sellers, real buyers, real money.

If a product or convenience decision would damage the research design, **the research wins.** Stop and say so rather than working around it.

## The single most important thing

**Measurement infrastructure is not a later phase. It ships with the first feature.**

If a seller or buyer can do something, an event row must be written when they do it. A feature merged without its events is a feature that produced no data, and data that was not captured cannot be recovered later. The study window is locked to the university calendar — there is no second chance to collect a semester.

If you are about to build something that changes what a user sees or does, and you have not written the event for it, you are not done.

---

## Non-negotiable rules

1. **Every user-facing action emits an event.** No exceptions for "small" features.
2. **The event table is append-only.** Never `UPDATE`, never `DELETE`, never migrate old rows to a new shape. Add a new event type instead.
3. **Randomisation happens on the server, once, and is persisted.** Never randomise in the browser. Never re-roll on re-render, re-login, or page refresh. Assignment is written to the database at first exposure and read from there afterwards.
4. **Never change assignment logic, variant text, or the advisor prompt while an experiment is running.** If it must change, the experiment ends and a new one starts with a new ID. Record both in `docs/03-research/experiments/`.
5. **An experiment is designed in writing before it is coded.** File in `docs/03-research/experiments/` first — hypothesis, variants, unit of randomisation, primary metric, stopping rule. Code second.
6. **Never fabricate data.** Seed and demo rows must carry `is_seed = true` and must be excluded from every analysis query. If a number is needed and does not exist, say it does not exist.
7. **The advisor may only state facts it can point to.** Every recommendation stores the metric snapshot it was generated from. If the advisor cannot ground a claim in a row of data, it does not make the claim. This grounding *is* the product — an advisor that guesses is worth nothing over a general chatbot.
8. **PDPA.** Sellers and buyers are real people in Thailand. Never put names, phone numbers, addresses, or email into event payloads or logs. Reference by ID.
9. **No secrets in the repository.** Not in code, not in docs, not in seed files, not in test fixtures.
10. **Do not add a dependency to solve a problem the standard library or an existing dependency already solves.** This is a solo project with a thesis deadline; every dependency is future maintenance.

---

## Stack

- **Web:** Next.js (App Router), TypeScript
- **API:** Express, TypeScript
- **Database:** PostgreSQL via Prisma
- **Advisor + analysis:** Python
- **Deployment:** cloud (required by coursework)

Do not introduce a second language, ORM, or framework without an ADR in `docs/02-design/decisions/`.

---

## Repository layout

```
CLAUDE.md              this file
AGENTS.md              pointer to this file
.claude/skills/        project procedures — see .claude/skills/README.md
apps/
  web/                 Next.js — storefronts, buyer browsing, seller dashboard
  api/                 Express — REST API, auth, event ingestion, assignment
packages/
  db/                  Prisma schema, migrations, seed
  shared/              types shared between web and api
services/
  advisor/             Python — recommendation generation, grounded in metrics
analysis/              Python — thesis statistics, notebooks, exports
docs/
  00-archived/         superseded documents; never delete, move here
  01-requirements/     what we are building and why; course requirement mapping
  02-design/           architecture, data model, API contracts, UI flows
    decisions/         ADRs — one file per irreversible choice
  03-research/         the thesis lives here
    hypotheses.md      what we predict and why
    analysis-plan.md   how each metric is computed, written BEFORE data exists
    experiments/       one file per experiment, written before coding
    findings/          results, including negative ones
  04-testing/          test strategy, manual test scripts, known gaps
  05-retrospectives/   what went wrong and what changed as a result
  06-log/              dated working log; short entries, append-only
  07-delivery/         thesis chapters, slides, demo scripts, submissions
  08-operations/       runbooks, deployment, incidents, seller onboarding
```

**Changes from a generic docs structure, and why:**

- `03-research/` is new and is the most important folder in the repository. Without it, research decisions get made inside pull requests and are lost by the time the thesis is written.
- `decisions/` sits under design so that "why did we do it this way" survives past the moment.
- `08-operations/` includes seller onboarding, because onboarding real sellers is an operational process, not a feature.

---

## Core data model

Do not invent an alternative shape for these. Extend them if needed and record it in an ADR.

**Commerce**
- `Store` — one per student business
- `Product` — belongs to a store
- `Order`, `OrderItem`

**Telemetry (append-only)**
- `Event` — `id`, `type`, `actor_type` (seller / buyer / system), `actor_id`, `store_id`, `entity_type`, `entity_id`, `payload` (JSON, no personal data), `occurred_at`

**Research**
- `Experiment` — `id`, `name`, `status` (draft / running / stopped), `unit` (recommendation / session / store), `started_at`, `stopped_at`
- `Variant` — belongs to an experiment
- `Assignment` — `experiment_id`, `variant_id`, `unit_type`, `unit_id`, `assigned_at`. Unique on (`experiment_id`, `unit_type`, `unit_id`).
- `Recommendation` — `id`, `store_id`, `action_type`, `variant_id`, `metric_snapshot` (JSON — the exact numbers it was generated from), `delivered_at`, `dismissed_at`

The 7-day action rate is computed by joining `Recommendation` to `Event`: did an event matching `action_type` occur for that `store_id` within seven days of `delivered_at`. **`action_type` must map to a real event type.** If you add a recommendation type, you add the event that detects it in the same change.

---

## Commands

```bash
pnpm install
pnpm dev              # web + api
pnpm db:migrate       # prisma migrate dev
pnpm db:seed          # seed data, all rows is_seed = true
pnpm test
pnpm lint
pnpm typecheck
```

Python:
```bash
uv sync
uv run pytest
uv run python analysis/export.py
```

If a command here does not exist yet, create it rather than inventing a different one.

---

## Definition of done

A change is not done until all of these are true:

- [ ] Events are emitted for every new user-facing action
- [ ] Types check, lint passes, tests pass
- [ ] If it touches the schema, a migration exists and runs on a clean database
- [ ] If it touches an experiment, `docs/03-research/experiments/` is updated
- [ ] If it makes an irreversible technical choice, an ADR exists
- [ ] No personal data in logs or event payloads
- [ ] A one-line entry added to `docs/06-log/`

---

## Ask before doing

Stop and ask. Do not decide these alone:

- Changing the `Event`, `Assignment`, or `Recommendation` schema
- Anything that would delete or rewrite historical rows
- Starting, stopping, or modifying a running experiment
- Changing the advisor's prompt or generation logic
- Adding a dependency, service, or language
- Anything touching real seller or buyer money
- Anything that would need a real seller to be contacted

---

## Skills

Procedures live in `.claude/skills/`. Rules live here. Before building a feature, adding an event, changing the schema, adding advisor advice, or starting an experiment, check whether a skill covers it — see `.claude/skills/README.md`.

## Working style

- **Small changes.** One concern per commit. This is a solo project with a hard deadline; large changes that break are expensive.
- **Write the doc first for anything with a research consequence.** Write the code first for anything without one.
- **Prefer boring.** The novel part of this project is the study, not the stack.
- **If a requirement is ambiguous, ask.** Do not pick an interpretation and build on it silently — a wrong assumption discovered in month four is a lost semester.
- **Say when something is a bad idea.** Including when it came from the repository owner.
