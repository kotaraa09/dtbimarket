# AGENTS.md

All agent instructions for this repository live in [CLAUDE.md](./CLAUDE.md). Read that file first.

Summary of the rules most often broken:

1. Every user-facing action emits an event. A feature without its event is not done.
2. The event table is append-only. Never update, never delete.
3. Randomisation is server-side, persisted once, never re-rolled.
4. Experiments are designed in writing before they are coded.
5. Never fabricate data. Seed rows carry `is_seed = true`.
6. The advisor may only state facts it can point to in a stored metric snapshot.
