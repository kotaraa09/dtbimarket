# 0003 — Server-side session in an httpOnly cookie

**Status:** accepted
**Date:** 2026-09-03
**Decides:** D-2, named in `../architecture.md`
**Blocks released:** PB-06, and everything behind it
**Context:** `../architecture.md`, `../api-spec.md`, `../database-schema.md`, `REQ-A1`, `REQ-A3`

## Context

Every seller-facing route in this platform is store-scoped: a request touching store-owned data must resolve to a store owned by the caller (REQ-A3). That resolution starts from "who is calling", so authentication is upstream of the authorisation rule that every product, price and photo endpoint depends on.

The choice was left open in `architecture.md` with a proposal and a rejected alternative, and it blocked PB-06.

One requirement here is not a general web-security preference but specific to this project being research: **a seller who withdraws from the study must be able to be signed out.** Consent can be withdrawn at any time, and "their token expires in two weeks" is not an answer to a person who has asked to stop.

## Decision

**A session is a row in the database. The cookie carries only its ID, signed.**

- `Session` table: `id`, `user_id`, `created_at`, `expires_at`, `revoked_at`, `is_seed`.
- Cookie `dtbi_session`, value `<session_id>.<HMAC-SHA256(session_id, SESSION_SECRET)>`.
- Attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` 14 days, and `Secure` in production. `Secure` is omitted in development only, because it would make the cookie unusable over plain http on localhost.
- Signature verified with `timingSafeEqual` before the ID is used in a query.
- Passwords hashed with **Argon2id** (`memoryCost` 19456 KiB, `timeCost` 2, `parallelism` 1), as `database-schema.md` already specified.
- Revocation sets `revoked_at`; `resolveSession` refuses a revoked or expired row.

Implemented with `node:crypto` and Prisma — no session library. The whole mechanism is an HMAC and a lookup, and CLAUDE.md rule 10 says not to add a dependency for what the standard library already does.

## Alternatives considered

**JWT held in `localStorage`.** Simpler: no session table, no lookup per request, and it scales without shared state. Rejected for two reasons, both already written into `architecture.md`. It is readable by any injected script — `localStorage` has no equivalent of `HttpOnly`. And it cannot be revoked: the token is valid until it expires, so signing out a withdrawing participant is not possible without adding exactly the server-side state the approach was chosen to avoid.

**JWT in an httpOnly cookie.** Fixes the script-access problem but not the revocation one, which is the requirement that actually decided this.

**A session library (`express-session` + a Postgres store).** Well-trodden and would have worked. Rejected under rule 10: it is two dependencies and a store adapter for roughly forty lines of `node:crypto` and one Prisma model, in a solo project where every dependency is future maintenance across a thesis deadline.

**Signing the whole session record into the cookie.** Rejected for the same reason as JWT — a self-contained credential cannot be taken back.

## Consequences

**Accepted cost — a database read per authenticated request.** Every request resolving a session costs one indexed lookup on the primary key, plus the joins for the user and their store. At this scale that is a rounding error, and it is paid in exchange for revocation.

**Accepted cost — sessions are state.** The API is no longer stateless, so horizontal scaling needs shared Postgres rather than nothing. It already needs shared Postgres.

**`SESSION_SECRET` becomes a boot requirement.** The process refuses to start without it. A service that starts without its session secret and generates a new one per restart signs everybody out at random and looks like a bug in the login form.

**Rotating `SESSION_SECRET` signs everyone out.** Every existing signature fails to verify. That is the correct behaviour for a compromised secret and a nuisance otherwise. It must not be rotated casually during the study window: mass sign-out mid-study changes seller behaviour in a way nothing in the data would explain.

**Expired sessions accumulate.** No cleanup job exists yet. The table is small and the readiness of that job is not urgent, but it is real and is noted here rather than discovered.

**Consequence for PDPA.** The session row references the user by ID and holds no personal data. Deleting a person's account cascades their sessions and touches no event row, which is what makes append-only telemetry and the right to erasure compatible (see ADR-0001).
