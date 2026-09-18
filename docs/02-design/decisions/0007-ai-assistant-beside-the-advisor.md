# 0007 — The AI assistant sits beside the advisor, not inside it

**Status:** accepted
**Date:** 2026-09-18
**Decided by:** repository owner, in response to the four questions below
**Decides:** where a language model is allowed to run in this repository, and what it is allowed to touch
**Context:** ADR-0002, ADR-0005, `CLAUDE.md` rules 1, 2, 4, 7, 8, 9 and 10, REQ-H2, week-8 coursework (`w8-homework`)

## Context

The week-8 coursework requires a working language-model feature in the student's
own project: a Level 1 button that does one AI task, and a Level 2 agentic flow
that reads several sources, summarises for a person, writes the result back and
logs what it did. It also closes REQ-H2, the external API integration, which the
README has been carrying as the one open rubric item.

**ADR-0002 forbids exactly this in the one place it would most obviously go.**
That decision — accepted, and for reasons that have not weakened — keeps a
language model out of the path that produces advisor copy, because the
experiment manipulates framing and a model that paraphrases per seller turns
framing into framing-plus-length-plus-politeness, invisibly.

So the coursework requirement and the thesis design collide, and `CLAUDE.md` is
explicit about which wins: *"If a product or convenience decision would damage
the research design, the research wins."*

Three further constraints narrowed what was left:

- `Recommendation` **does not exist yet** and its shape is on the
  ask-before-doing list. `schema.prisma` says so in a comment: adding it early
  means guessing.
- `services/advisor/` does not exist either, and the deadline is the same day.
  A second deployed service on a free plan is a way to have nothing live.
- The key is a course-issued OpenRouter key with a fixed allowance, which must
  not reach GitHub and should not be spendable by anyone who opens dev tools.

## Decision

**A language model may run in this repository, in `apps/api`, for features that
are not the advisor and are never delivered as a `Recommendation`.**

Four parts, each answering one of the questions put to the owner:

1. **Placement.** Two seller-facing features, clearly separated from the
   advisor in code, in the database and on screen. Level 1 drafts a product
   description; Level 2 summarises the seller's own catalogue. Neither is
   randomised, neither carries a `variant_id`, neither is scored by the 7-day
   action rate.

2. **Storage.** Two new tables, `ai_summary` and `ai_run_log`. `Recommendation`,
   `Assignment` and `Experiment` are not created, not touched, and not guessed
   at. They arrive with the experiment that needs them, as planned.

3. **Runtime.** The call runs in `apps/api` in TypeScript, using the `fetch`
   already in the platform — no new dependency, no new service, no new language.
   `services/advisor/` remains the home of the metric and template work when it
   is built.

4. **Level 1's task.** Drafting a Thai product description, because it has an
   existing event (`product.description_changed`) that records whether the
   seller kept the draft, and because the seller reviewing and editing text is
   the honest version of "the AI never decides alone".

**The key lives server-side**, in `OPENROUTER_API_KEY`, read once in
`config.ts`, never returned by any endpoint and never sent to the browser.

## Why

**The collision is resolved by separation, not by exception.** ADR-0002's
argument is about the text the experiment manipulates. Nothing in this ADR
produces that text. The advisor still renders templates from
`metric_snapshot`, still re-renders byte-identically from a stored template and
snapshot (REQ-N17), and rule 4 still freezes it while an experiment runs.

**Grounding is kept, mechanically.** Rule 7 is about the advisor, and the same
reasoning applies to any number a seller is shown: a summary of their own shop
quoting a figure the shop does not have is worth less than no summary, because
they cannot tell which sentence was invented. So the Level 2 output is checked
before it is stored — every run of digits in the generated text must already
appear in the snapshot the model was given, or the summary is refused and the
refusal is logged. The snapshot is then rendered next to the summary in the UI,
so the seller checks it rather than trusting it.

**The server-side key is strictly better than what the worksheet asks for.** The
lab keeps the key in a `.gitignore`-protected file that still ships to the
browser, and step A2 has the student press F12 and find their own key as the
lesson. This project already has a server, so the lesson can be applied rather
than only observed: the key never leaves the API process, and a seller with dev
tools open sees a call to `/api/v1/ai/...` and nothing else.

**Optional, not required, at boot.** `SESSION_SECRET` is required because a
process without it signs everybody out at random. This key is not: without it,
two buttons report in Thai that the key is missing and everything else is
unaffected. Refusing to boot would take the platform down to protect a writing
aid — and it would make the deploy order unsurvivable, since the service has to
start before the value can be pasted into the Render dashboard.

**Failures are recorded.** A call that times out, 401s or returns an ungrounded
answer writes an `ai_run_log` row and emits `ai.call_failed`. A feature that
logs only its successes reports a 100% success rate forever.

## Alternatives rejected

**Reopen ADR-0002 and let the model write advisor copy.** The direct route, and
it costs the thesis its internal validity: two sellers in the same arm would get
different sentences and nothing in the results would reveal it. Offered to the
owner and declined.

**Put the feature in the admin area only.** Zero risk to the study — an
administrator is the researcher (ADR-0005), not a subject. Rejected because the
instructor tests the live site from the README, and this would require issuing
them an administrator account, which is a worse thing to do than accept a
manageable exposure risk.

**Create `Recommendation` now and store summaries in it.** Would avoid two
tables. Rejected: the shape would be guessed at under deadline pressure, and a
`Recommendation` row with no experiment, no variant and no action type would
have to be excluded from every analysis query written afterwards — exactly the
kind of exclusion that one query eventually forgets.

**Build `services/advisor/` in Python for this.** Matches the documented stack.
Rejected on the day: a second service, a second deployment and a second cold
start on a free plan, for a feature that is two HTTP calls. When the advisor is
built, it goes there.

## Consequences

**The dashboard will show two kinds of machine-written text.** The AI summary
panel is here now; the advisor's recommendations arrive in PB-24. They are
labelled differently and described differently on screen, and the dashboard copy
says outright that they are not the same thing.

**This must be settled before the first experiment starts.** A seller who can
press a button for AI advice is a seller whose exposure to the advisor is no
longer the only AI they received. Before any experiment enters `running`, one of
two things has to happen, and the experiment document has to say which:

- the feature is disabled for the duration, or
- `ai.summary_generated` and `ai.description_suggested` are entered in the
  analysis plan as a covariate.

The events exist precisely so that the second option is available. Deciding this
later is fine; discovering it later is not.

**`product.description_changed` gained a payload key.** `from_ai` is additive —
rows written before today simply do not carry it, which is what append-only
means in practice. It is the only way to tell "the model wrote something" apart
from "the seller kept what the model wrote", and the second is the one worth
counting.

**`ai_run_log` stores prompt and response text.** It is an operational record,
not a measurement instrument, and it is kept out of `Event` for the same reason
`AdminAuditLog` is (ADR-0005). Prompts are built from store name, category,
product name, price, stock and counts only; `assertNoContactData` refuses the
call if a contact channel, display name or email appears in one, so rule 8 is
enforced rather than promised.

**A cost ceiling now exists in code.** Twelve calls per store per ten minutes,
counted from `ai_run_log`. The allowance is fixed and shared, and a stuck retry
loop is the cheapest way to spend all of it before anyone opens the site.

**REQ-H2 is closed.** OpenRouter is the external API integration. ADR-0002 had
noted that if a language model API was the intended answer to Q-2, that answer
was gone — it is back, in a place that does not cost the study anything.
