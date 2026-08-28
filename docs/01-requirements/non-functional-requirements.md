# Non-functional requirements

**Status:** first pass, 2026-08-28
**Extends:** the summary table in `requirements.md`, which keeps IDs REQ-N1 to REQ-N5 and points here
**Verified by:** `docs/04-testing/test-specs/`, plus the checks named in each row below

A non-functional requirement that cannot be checked is a wish. Every entry here states a target that can be measured and how it is measured, or admits that it is verified by review rather than by test.

Targets are calibrated to what this project actually is: a few dozen sellers, a few hundred buyers, one semester, one developer. A 99.99% availability target would be a copied number, not a commitment.

## Priority

**P1** — the study or the coursework fails without it.
**P2** — the platform is materially worse without it.
**P3** — wanted, dropped first if time runs out.

---

## Research integrity

| ID | Requirement | Target | Verified by | Pri |
|---|---|---|---|---|
| REQ-N1 | Assignment logic, variant text and advisor generation stay frozen for the whole study window | Zero changes to the frozen paths between the start and stop dates; deploys touching them are blocked | Git tag at freeze, diff at stop, `PB-29`; template checksum check at start-up (TS-01-14) | P1 |
| REQ-N17 | Every delivered recommendation is reconstructable after the fact | Re-rendering a stored template with its stored snapshot reproduces the text the seller saw, byte for byte | Property test over delivered rows | P1 |
| REQ-N18 | The analysis is reproducible from one command over exported data | `uv run python analysis/export.py` then the analysis script yields identical numbers on two machines | Run on a second machine before the results are written up | P1 |
| REQ-N19 | Seed and demo rows never enter any analysis or seller-facing number | Zero `is_seed = true` rows in any exported dataset | TS-01-11, plus a metric-layer test per query | P1 |

REQ-N1 is the one most likely to be broken by good intentions. A "small copy fix" to a running variant ends the experiment; `CLAUDE.md` rule 4 says so, and the cost of obeying it is one paragraph in the log, while the cost of breaking it is the semester.

## Privacy and PDPA

| ID | Requirement | Target | Verified by | Pri |
|---|---|---|---|---|
| REQ-N2 | People are referenced by ID; no names, phone numbers, addresses or email in events or logs | Zero occurrences across all events and log lines produced by the MS-01 run | TS-01-16, payload key allowlist in the emitter | P1 |
| REQ-N20 | Data minimisation — the platform stores only fields a feature actually uses | No field exists without a named consumer; reviewed when each model is added | Schema review at each migration | P1 |
| REQ-N21 | A seller or buyer can ask what personal data is held about them and have it corrected or their account deleted | Response within 30 days; deletion removes personal fields while leaving telemetry, which references IDs only | Runbook in `docs/08-operations/`, written before the first real seller onboards | P1 |
| REQ-N22 | Personal data is not sent to any third party for the study | Zero exports containing personal fields; analysis exports carry IDs and metrics only | Export schema test | P1 |

REQ-N21 has a design consequence worth stating: because events carry no personal data, deleting a person's account does not require deleting their events — which is what makes the append-only rule and PDPA compatible rather than contradictory.

## Security

| ID | Requirement | Target | Verified by | Pri |
|---|---|---|---|---|
| REQ-N3 | No secrets in the repository — code, docs, seeds or fixtures | Zero findings | Secret scan in CI; review at each commit | P1 |
| REQ-N23 | Passwords are hashed with a memory-hard algorithm | Argon2id, per-user salt; plaintext never logged or stored | Unit test on the auth module | P1 |
| REQ-N24 | All traffic is HTTPS; session cookies are httpOnly, Secure, SameSite=Lax | No cookie set without those flags; HTTP redirects to HTTPS | Manual check on staging and production | P1 |
| REQ-N25 | Store-owned data is reachable only by its owner | Every seller-scoped route refuses another store's resources | TS-01-15, one middleware rather than per-route checks | P1 |
| REQ-N26 | Auth endpoints are rate limited | 10 requests per minute per IP; write endpoints 60 per minute per session | Integration test | P2 |
| REQ-N27 | Uploads are constrained by type and size | Images only, 5 MB per file, content-type verified server-side rather than trusted from the client | Integration test | P2 |

## Performance

| ID | Requirement | Target | Verified by | Pri |
|---|---|---|---|---|
| REQ-N28 | Dashboard responds quickly enough to be read between classes | `GET /dashboard/metrics` p95 under 400 ms at expected load | Timing log on staging with seeded data | P2 |
| REQ-N29 | The dashboard is usable on a mid-range phone over mobile data | Interactive within 3 s on a throttled 4G profile | Manual check during MS-01, on a real phone | P2 |
| REQ-N30 | Recommendation generation never blocks the dashboard | Advisor budget 800 ms; on timeout the page renders without a card and writes nothing | Integration test with a stalled advisor | P1 |
| REQ-N31 | Catalogue browsing stays responsive as listings grow | p95 under 600 ms at 50 stores and 1,000 products | Seeded load check before the study window | P3 |

REQ-N30 is P1 while the rest are P2, because it is the only one of the four whose failure corrupts data rather than merely annoying someone.

## Availability and durability

| ID | Requirement | Target | Verified by | Pri |
|---|---|---|---|---|
| REQ-N32 | The platform is available during the study window | 99% monthly, measured by an external check every 5 minutes | Uptime monitor, reviewed weekly during the window | P1 |
| REQ-N33 | Planned maintenance happens outside seller hours | No planned downtime 08:00–22:00 Asia/Bangkok; announced a day ahead | Change log in `docs/06-log/` | P2 |
| REQ-N34 | No committed event is lost | Zero loss. Events are written in the same transaction as the action they describe | ADR-0001, TS-01-07 | P1 |
| REQ-N35 | The database is backed up and the backup is known to work | Daily automated backup; **one restore actually performed** into a scratch database before the study window opens | Restore rehearsal recorded in `docs/08-operations/` | P1 |

A backup that has never been restored is a belief, not a backup. REQ-N35 is the rehearsal, and it is scheduled before the window rather than after the first incident.

## Usability and accessibility

| ID | Requirement | Target | Verified by | Pri |
|---|---|---|---|---|
| REQ-N36 | Thai throughout, in one consistent register | No English strings in seller or buyer UI except product names sellers typed themselves | Review before the freeze | P1 |
| REQ-N37 | Usable one-handed on a 360 px phone screen | No horizontal scrolling; primary actions reachable with a thumb; touch targets at least 44 px | MS-01 on a real phone | P1 |
| REQ-N38 | Text is legible and controls are perceivable | Contrast at least WCAG AA for body text; visible keyboard focus; form fields have labels, not only placeholders | Manual audit of the dashboard and product forms | P2 |
| REQ-N39 | Errors say what happened and what to do next | No raw error codes shown to sellers; every error state has Thai copy | Review of each form before the freeze | P2 |

## Maintainability

| ID | Requirement | Target | Verified by | Pri |
|---|---|---|---|---|
| REQ-N4 | A dependency is added only when neither the standard library nor an existing dependency solves the problem | Every new dependency is named in the log entry that adds it, with the reason | Review at each commit | P1 |
| REQ-N40 | Types check, lint passes and tests pass before anything merges | Zero failures on `pnpm typecheck`, `pnpm lint`, `pnpm test` | CI, and the definition of done in `CLAUDE.md` | P1 |
| REQ-N41 | One language per layer; no second ORM or framework without an ADR | Zero undocumented additions | `docs/02-design/decisions/` | P1 |
| REQ-N42 | A migration runs on an empty database | Every migration verified against a clean database, not only the developer's | CI step that migrates from empty | P1 |
| REQ-N43 | Critical paths are covered by tests even when the rest are not | Event emission, assignment stability, the seven-day join and the auth boundary all have tests | TS-01 exit criteria | P1 |

There is no global coverage target. A percentage would be met by testing whatever is easy, and the things that are easy to test here are the things that do not matter.

## Operability

| ID | Requirement | Target | Verified by | Pri |
|---|---|---|---|---|
| REQ-N44 | A failure is noticed without a seller reporting it | Alert on health-check failure and on error rate above 2% for 5 minutes | Monitor configured before onboarding | P2 |
| REQ-N45 | Deployment is one documented command or one pipeline run | No manual steps that exist only in the owner's memory | Runbook in `docs/08-operations/` | P2 |
| REQ-N46 | An incident is recorded, with what changed as a result | One entry per incident | `docs/08-operations/`, `docs/05-retrospectives/` | P2 |
| REQ-N47 | Sellers can be onboarded without the owner writing code | Documented process; a new seller can list a product unaided | `PB-28`, tested with the first real seller | P1 |

## Constraints kept from `requirements.md`

| ID | Requirement | Note |
|---|---|---|
| REQ-N5 | Recommendation generation must work for a store with very little activity | The photo-coverage rule depends only on products and photos, never on traffic. Most stores will be quiet early in the semester |

## Accepted trade-offs

Written down so they are decisions rather than gaps discovered later.

- **No high availability.** Single region, single instance per service. An hour of downtime costs some events and some annoyance; multi-region costs weeks that the thesis needs.
- **No horizontal scaling plan.** The expected population is a few dozen sellers. If that assumption breaks, REQ-N31 reopens and this line is the record that it was a bet.
- **No formal accessibility certification.** WCAG AA is the target for contrast, focus and labels; a full audit is out of scope for a solo project.
- **Modest performance budgets.** 400 ms p95 is generous by commercial standards and appropriate here, where the alternative use of that engineering time is data collection.
- **Availability measured, not guaranteed.** 99% is what an unattended single-instance deployment can plausibly hold, and it is honest to state that rather than a number nobody will check.
