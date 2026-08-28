# decisions

See `docs/README.md` for what belongs in this folder.

One file per irreversible technical choice: `NNNN-short-title.md`, with context, the decision, the alternatives that were rejected and why, and the consequences accepted. Reversible preferences do not belong here — an ADR for something that can be changed on a quiet afternoon is noise that hides the ones that matter.

An ADR is written when the choice is made, not afterwards. The value is in the rejected alternatives, and those are forgotten within a week.

| ADR | Decision |
|---|---|
| `0001-append-only-event-store.md` | The event table is append-only, and events are written inside the transaction of the action they describe |

## Waiting to be written

These are named in `architecture.md` and block work that is already in the backlog. None may be decided without the owner — they are all on the ask-before-doing list in `CLAUDE.md`.

| # | Decision | Blocks |
|---|---|---|
| D-1 | Hosting and managed database provider | PB-04 |
| D-2 | Session cookie versus token authentication | PB-06 |
| D-3 | Object storage for product photos, and whether it also answers Q-2 | PB-10, PB-27 |
| D-4 | Advisor copy from deterministic templates or from a language model — this one has research consequences | PB-24, EXP-001 |
