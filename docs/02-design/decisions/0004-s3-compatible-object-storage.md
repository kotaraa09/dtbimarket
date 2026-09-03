# 0004 — S3-compatible object storage for product photos

**Status:** accepted
**Date:** 2026-09-03
**Decides:** D-3, named in `../architecture.md`
**Blocks released:** PB-10 (FEAT-B4, REQ-B3)
**Does NOT decide:** Q-2 — see below
**Context:** `../architecture.md`, `../database-schema.md`, `../api-spec.md`, `../detailed-design.md`, REQ-B3, REQ-N27, ADR-0001

## Context

Product photos are not an ordinary feature. `product.photo_added` is the event that detects action on the first planned recommendation, which makes photo upload the point where the thesis's primary metric is actually generated. PB-10 was the last thing standing between the platform and a complete M1.

`architecture.md` already ruled out the obvious shortcut: **the file system of the API container is not durable.** Writing photos to local disk means every deploy silently deletes the sellers' photos — and, because photo count is what the first recommendation is about, that would destroy the primary metric rather than merely inconveniencing people.

The remaining question was which storage, and it was entangled with a decision that is still open: D-1, the hosting and database provider. Some hosts bundle storage, so choosing a bucket vendor first would either constrain D-1 or be thrown away.

## Decision

**Photos go to an S3-compatible bucket, reached through one adapter, with the provider left as configuration.**

- One interface — `put`, `remove`, `urlFor` — in `apps/api/src/modules/photos/storage.ts`.
- Driver `s3` speaks the S3 API via `@aws-sdk/client-s3`. **This is the driver used in development**, against MinIO in `docker-compose.yml`, and in deployment, against a managed bucket. Same code path, different configuration, so what ships is what was exercised.
- Driver `memory` exists only so the test suite does not need a running bucket. `config.ts` **refuses to boot** when `NODE_ENV=production` and the driver is not `s3`.
- The concrete provider is chosen at PB-04, alongside D-1, and is a set of `STORAGE_*` environment variables. No code changes.

**Rows store keys, never URLs** — `stores/<storeId>/products/<productId>/<uuid>.<ext>`. This was already the rule in `database-schema.md`; the adapter is what makes it cheap to honour. `urlFor` builds a URL at read time: a public prefix when a CDN fronts the bucket, otherwise a presigned URL valid for an hour.

**Ordering, per ADR-0001 and architecture.md flow 2:** validate, then store the file, then `INSERT ProductPhoto` and `INSERT Event` in one transaction.

**Uploads are validated by their bytes** (REQ-N27). Multipart is parsed with `Response.formData()`, which is Node's own implementation — no `multer`, no `busboy` (REQ-N4). The declared `Content-Type` of a part is written by the client and is ignored entirely; the format is decided from the magic bytes, and only JPEG, PNG and WebP are accepted. Size is capped at 5 MB against bytes actually received, not against `Content-Length`.

## Alternatives considered

**Local disk on the API container.** Rejected before it was proposed, by `architecture.md`. Every deploy would delete the sellers' photos and the primary metric with them.

**Committing to one provider now (R2, Supabase, B2).** All three are S3-compatible and any of them would work. Rejected as premature: D-1 is still open, some hosts bundle storage, and the adapter makes the choice reversible for the cost of a few environment variables. The risk this defers is small and named — see Consequences.

**Storing photos as bytes in Postgres.** Removes a service entirely and makes upload transactional, which would eliminate the orphaned-object problem below. Rejected: it puts binary blobs in the same database the study depends on, inflating backup and restore times for REQ-N35, and Postgres is a poor CDN.

**Hand-rolled SigV4 with `node:crypto`.** Would have satisfied REQ-N4 most strictly, and was considered seriously for that reason. Rejected: request signing is security-sensitive, a subtly wrong signature fails in ways that are slow to diagnose, and this is a poor place for a solo project to save a dependency.

**Presigned upload direct from the browser.** Standard, and it keeps large bodies out of the API. Rejected for this project: it moves the upload off the path where the event is written, so the API would learn a photo exists only if the browser told it. `product.photo_added` is the primary metric and must not depend on a client callback — the same reason `recommendation.viewed` is only ever a secondary metric.

## Consequences

**Accepted cost — orphaned objects.** The file is written before the transaction, so a transaction that then rolls back leaves an unreferenced object in the bucket. This is ADR-0001's trade restated: an orphaned file is a cleanup job, a missing event is a permanently wrong number. No cleanup job exists yet; it is not urgent and is recorded here rather than discovered later.

**Accepted cost — deletion is not transactional either.** The object is removed *after* the database commits, so a failed delete leaves an orphan. Deleting it first would risk destroying a file for a transaction that then rolls back, leaving a row pointing at nothing — a broken image is worse than an invisible orphan.

**Presigned URLs expire.** With no public CDN prefix configured, photo URLs are valid for one hour. A page left open longer will show broken images until it refetches. Setting `STORAGE_PUBLIC_BASE_URL` removes this and is the expected production shape.

**The seed now writes real objects.** Once photos became real, seeded `ProductPhoto` rows pointing at nothing rendered as broken thumbnails in exactly the demos and screenshots the seed exists to make safe. The seed generates solid-colour PNGs with `node:zlib` and uploads them. It warns and continues if storage is unreachable rather than failing.

**A second place reads the storage configuration.** `packages/db/prisma/seed-photos.ts` constructs its own S3 client, because `packages/db` must not import from `apps/api` — the arrow pointing the other way is what makes the API the choke point where events are guaranteed. This is the same shape as the seed's second event writer, noted in ADR-0001's log entry, and belongs to the same open question about where shared infrastructure should live.

**The S3 path is not covered by automated tests.** Tests run against the `memory` driver so the suite needs no bucket. The S3 driver is exercised manually against MinIO. Recorded as a known gap in `docs/04-testing/README.md`.

## What this does not decide

**Q-2 is still open.** Object storage was the leading candidate to satisfy REQ-H2, the coursework external-API requirement, and this ADR deliberately does **not** claim it. The owner has chosen to keep Q-2 open and pick an external API separately, so `FEAT-H2` and `PB-27` remain blocked exactly as they were. Nothing in this document should be read as closing them.

**D-1 is still open.** The provider is configuration and is chosen at PB-04.
