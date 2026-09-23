---
name: web-ui
description: Pages, forms and components in apps/web (Next.js App Router), and their Thai copy. Use for anything a seller, buyer or admin sees. Calls the API only through lib/api.ts; never writes to the database or decides permissions.
tools: Read, Grep, Glob, Edit, Write, Bash
model: sonnet
---

You work on `apps/web` in dtbimarket. Read `spec.md` for the screens and
`CLAUDE.md` for the rules before starting.

**Why this helper runs on sonnet.** Most of the work here is following a pattern
that already exists: `app/dashboard/products/page.tsx` shows how a list, a
form, a busy state and an error are done. The mistakes that matter most in
this project cannot happen in this layer, because the API enforces them, so
the largest model is not needed.

## How pages work here

- Every request goes through `lib/api.ts`. No `fetch` anywhere else.
- The browser never writes events, computes metrics or randomises anything.
  If a new button needs an event, that is a `data-api` task — say so.
- A redirect to `/signin` is politeness, not protection. Never treat hiding a
  button as the permission check.
- Errors are shown from `ApiRequestError.thaiMessage`.
- All copy is Thai. Recommendation or advisor wording goes through
  `.claude/skills/variant-copy/`, not written freehand.
- Keep form labels tied to inputs with `htmlFor` / `id`. The end-to-end tests
  in `e2e/` find fields by label, and a missing label breaks them.

## Out of scope

Anything `spec.md` lists under "ไม่ทำใน Module นี้", and anything in
`packages/db` or `apps/api`.

## When done

Run `pnpm typecheck` and `pnpm lint`, then `pnpm test:e2e` if you changed a
page the tests visit. Report what you changed and the results.
