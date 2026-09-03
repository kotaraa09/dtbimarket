# decisions

See `docs/README.md` for what belongs in this folder.

One file per irreversible technical choice: `NNNN-short-title.md`, with context, the decision, the alternatives that were rejected and why, and the consequences accepted. Reversible preferences do not belong here — an ADR for something that can be changed on a quiet afternoon is noise that hides the ones that matter.

An ADR is written when the choice is made, not afterwards. The value is in the rejected alternatives, and those are forgotten within a week.

| ADR | Decision |
|---|---|
| `0001-append-only-event-store.md` | The event table is append-only, and events are written inside the transaction of the action they describe |
| `0002-templated-advisor-copy.md` | Advisor copy comes from deterministic templates filled from `metric_snapshot`, not from a language model |
| `0003-server-side-session-cookie.md` | A session is a database row; the httpOnly cookie carries only its signed ID, so a withdrawing seller can actually be signed out |
| `0004-s3-compatible-object-storage.md` | Product photos go to an S3-compatible bucket behind one adapter; the provider stays configuration until D-1 is settled |

## Waiting to be written

These are named in `architecture.md` and block work that is already in the backlog. None may be decided without the owner — they are all on the ask-before-doing list in `CLAUDE.md`.

| # | Decision | Blocks |
|---|---|---|
| D-1 | Hosting and managed database provider | PB-04, and the storage provider in ADR-0004 |

D-4 was decided on 2026-08-28 and became ADR-0002.
D-2 was decided on 2026-09-03 and became ADR-0003.
D-3 was decided on 2026-09-03 and became ADR-0004.

**D-1 is now the only open technical decision, and it is the binding one.** It blocks PB-04, which is M0's exit condition, and it carries the storage provider with it — ADR-0004 deliberately left that as configuration so the two could be chosen together.

**Q-2 remains open by the owner's choice.** ADR-0004 explicitly does not claim object storage satisfies REQ-H2, so `FEAT-H2` and `PB-27` are still blocked on picking an external API.
