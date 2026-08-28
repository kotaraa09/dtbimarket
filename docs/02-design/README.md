# 02-design

See `docs/README.md` for what belongs in this folder.

| Path | What it holds |
|---|---|
| `architecture.md` | High-level architecture: components, key flows, deployment, decisions still needed |
| `database-schema.md` | Every table, column and constraint, plus the SQL the primary metric is computed with |
| `api-spec.md` | Every endpoint, and the event each one writes |
| `detailed-design.md` | How the pieces are built: the emitter, assignment, delivery, rendering, failure modes |
| `user-journeys/` | End-to-end flows through the product, one file per journey (UJ-*) |
| `prototypes/` | Clickable screens (PR-*), each with a `.html` file and a `.md` recording what it decided |
| `decisions/` | ADRs — one file per irreversible choice |

Read them in that order the first time. Architecture says where things are allowed to happen, the schema says what is stored, the API spec says what can be asked for, and the detailed design says how. The event column in the API spec is the join between all four and `docs/03-research/`.

A user journey records what the user does, what the system writes, and **which event is emitted at each step**. A journey step that changes something for a user and has no event is a gap in the data, and it is cheaper to find here than during analysis.

Journeys describe flows. They do not restate variant text or hypotheses — those belong in `docs/03-research/`, and a copy here would drift out of step with them.

| Journey | Covers |
|---|---|
| `UJ-01-recommendation-to-action.md` | Seller sees a grounded recommendation and acts on it — the path the thesis measures |

| Prototype | Covers |
|---|---|
| `prototypes/PR-01-wireframe.html` | Wireframe of the same screen — structure only, three frames and nine notes. Exported to `screenshot/` for reports and slides |
| `prototypes/PR-01-seller-dashboard.html` | UJ-01 steps 2–9: dashboard, recommendation card, photo upload, and the events each one writes |

A prototype ships with a `.md` beside it. The HTML shows what it looks like; the markdown records what it decided, what it deliberately leaves out, and what building it exposed. Without the second file, the reasoning is lost the moment the screen is redrawn.
