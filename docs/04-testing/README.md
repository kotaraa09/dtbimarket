# 04-testing

See `docs/README.md` for what belongs in this folder.

| Path | What it holds |
|---|---|
| `test-specs/` | One spec per journey or critical feature (TS-*): cases, manual scripts, exit criteria, known gaps |

Test specs here concentrate on failures that produce a plausible result rather than an error — re-rolled assignment, an event that never fires, an `action_type` with no matching event type. Those cost a semester and are invisible on screen. Cases that only assert a framework works do not belong here.

Every spec ends with known gaps. A gap that is written down is a decision; a gap that is not is a surprise during analysis.

| Spec | Tests |
|---|---|
| `TS-01-recommendation-to-action.md` | UJ-01 — recommendation delivery, assignment stability, the 7-day action join, PDPA |
