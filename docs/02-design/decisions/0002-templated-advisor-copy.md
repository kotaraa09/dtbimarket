# 0002 — Advisor copy comes from deterministic templates, not a language model

**Status:** accepted
**Date:** 2026-08-28
**Decided by:** repository owner
**Context:** D-4 in `../architecture.md`, `CLAUDE.md` rules 4 and 7, `../../03-research/hypotheses.md`

## Context

The advisor has to turn a store's metrics into a sentence a seller reads. Two ways to produce that sentence were open: fill a fixed template from `metric_snapshot`, or ask a language model to write it from the same numbers.

The experiment measures whether **framing** changes the 7-day action rate. Everything except framing has to be held constant between arms, and — less obviously — constant between two sellers inside the same arm.

## Decision

**Templates.** One template per variant, placeholders filled from the frozen `metric_snapshot`, rendered server-side. No language model in the generation path.

A language model is not banned from the project forever. It is out of the path that produces text a seller sees while an experiment is running. Revisiting it means a new experiment with a new ID, per `CLAUDE.md` rule 4.

## Why

**Internal validity.** If a model paraphrases per seller, two sellers in arm B receive different sentences — different length, different politeness, different concreteness. The manipulated variable stops being framing alone, and nothing in the results reveals it. The numbers come out clean and mean something other than what the thesis claims.

**Grounding is checkable.** With templates, the grounding guard is mechanical: every placeholder must exist in the snapshot or delivery fails. With a model, grounding becomes a review of generated text that nobody can perform exhaustively for every delivery, and rule 7 turns into a hope.

**Reproducibility.** Any delivered recommendation can be re-rendered from its stored template and snapshot and must match byte for byte — REQ-N17. A model with a temperature above zero cannot offer that, and a model at temperature zero still changes output when the provider updates it, which is a silent mid-study change of the kind rule 4 exists to prevent.

**Cost, latency and dependency.** No API key to hold, no per-delivery cost, no external service inside the 800 ms budget on the dashboard path, one less dependency for a solo project to maintain (REQ-N4).

## Alternatives rejected

**Model generates, human reviews before delivery.** Removes the automation that makes the advisor a product rather than the owner typing advice. Also does not scale to a semester of deliveries.

**Model generates, cached per store.** Still varies text between sellers in the same arm — exactly the confound above, with a cache in front of it.

**Model at temperature zero, prompt frozen.** Closest to acceptable, and still rejected: the provider can change the model under a fixed prompt, and the study would have no way to detect that the text shifted mid-window.

## Consequences

**The variant template is now the artefact under experimental control.** It is stored in `Variant.template`, recorded verbatim in the experiment document, and checked at start-up against `Variant.template_checksum`. Text that drifts from what was pre-registered stops delivery rather than silently running a different experiment (TS-01-14).

**"The advisor prompt" in `CLAUDE.md` rule 4 now means the templates plus the trigger rules.** The rule is unchanged in force — none of it may be edited while an experiment runs. The wording in `CLAUDE.md` could be updated to match, which is the owner's call.

**The external API for the coursework is not the advisor.** If a language model API was the intended answer to Q-2, that answer is gone and Q-2 needs a different one — image hosting for product photos is the strongest remaining candidate, since D-3 requires object storage anyway.

**Advice is less fluent than a model would write.** Accepted. A short Thai sentence with the seller's own numbers in it was never going to lose to a paragraph, and the argument for this product is grounding, not prose.

**Variant copy work is now purely editorial.** `PB-23` is writing Thai sentences with the `variant-copy` skill, matched on length, register and politeness, differing only in framing. That is the whole implementation of the manipulation.
