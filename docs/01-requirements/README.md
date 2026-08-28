# 01-requirements

See `docs/README.md` for what belongs in this folder.

| File | What it holds |
|---|---|
| `requirements.md` | Actors, functional requirements (REQ-*), constraints, open questions |
| `non-functional-requirements.md` | The full non-functional set with measurable targets and how each is verified — continues the REQ-N series |
| `product-backlog.md` | Ordered delivery plan (PB-*), milestones, what is deliberately out of scope |
| `feature-list.md` | Every user-facing capability (FEAT-*), its events, and its trace to REQ and PB |

Read them in that order. The chain is `REQ → PB → FEAT → event`, and a break anywhere in it is either scope creep or an unmet requirement.

Open questions live at the bottom of `requirements.md` as Q-*. They are answered by the owner and supervisor, not guessed at in code.
