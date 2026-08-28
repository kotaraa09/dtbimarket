---
name: variant-copy
description: Write Thai recommendation variants for an experiment that differ only in framing and are matched on every other dimension. Use whenever the user asks to write, rewrite, translate, or review recommendation text, advisor messages, variant copy, or notification wording for sellers.
---

# Variant copy

The experiment measures the effect of framing. So framing must be the only thing that differs.

If one variant is more polite than another, the experiment is measuring politeness. Nothing in the results will show this. The numbers come out clean, readable, and about the wrong thing — and it is not recoverable after the fact.

## Match on everything except framing

**Politeness register.** Pick one and hold it across every variant. Do not use ครับ/ค่ะ in one and drop it in another. Do not mix formal and casual address.

**Length.** Keep all variants within roughly ±20% of each other in characters. A noticeably longer variant is also a more effortful variant, and effort is a second difference.

**Specificity.** If one names a number, all name a number. A variant with "3 photos" and another with "more photos" differ in concreteness as well as framing.

**Dialect and code-switching.** Standard Thai throughout, unless dialect is itself the variable. English loanwords the sellers already use are fine, but used identically in each variant.

**Punctuation and emoji.** Same in all, or absent from all.

**The ask.** Every variant requests the same action. If one asks for photos and another asks for a better description, they are different recommendations, not variants.

## The framings

Common ones for this project. Each supplies the same fact and differs in what it does with it.

- **Instruction** — states the action. *เพิ่มรูปสินค้าอีก 3 รูป*
- **Peer comparison** — supplies a reference point. *ร้านในหมวดเดียวกันมีรูปเฉลี่ย 4 รูปต่อสินค้า ร้านคุณมี 1 รูป*
- **Explanation** — supplies a reason. *สินค้าที่มีรูป 3 รูปขึ้นไป มีคนคลิกมากกว่า 2 เท่า ร้านคุณมี 1 รูป*
- **Question** — invites the seller to judge. *ลูกค้าเห็นสินค้าคุณจากมุมเดียว เพียงพอต่อการตัดสินใจไหม*

Every number used must come from `metric_snapshot`. If the comparison figure was not computed and stored, the comparison framing cannot be used for that recommendation.

## Check before finishing

Read the variants side by side and answer each:

- Same politeness level throughout?
- Lengths within ±20%?
- Same numbers, or no numbers, in all?
- Same action requested?
- Is every difference between them a difference of framing, and nothing else?

If any answer is no, revise rather than explaining the difference away.

## Report back

Present the variants in a table with a character count for each, then state in one sentence what differs between them. If that sentence names more than framing, the set is not ready.
