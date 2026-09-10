# Handling a PDPA request from a seller or buyer

**Written:** 2026-09-10
**Satisfies:** REQ-N21 — "A seller or buyer can ask what personal data is held about them and have it corrected or their account deleted. Response within 30 days."
**Related:** `../02-design/decisions/0005-operator-audit-log.md`, `../02-design/decisions/0001-append-only-event-store.md`

REQ-N21 says this runbook must exist **before the first real seller onboards**. These are real students in Thailand, and thirty days is a legal obligation rather than a service target.

## Before you start

You need an administrator account. There is exactly one way to get one:

```bash
pnpm admin:create you@example.com
```

The public registration form cannot create an administrator, deliberately — it accepts `seller` and `buyer` only, because any role a public endpoint accepts is a role a stranger can grant themselves.

**Everything you do in the admin area is recorded, including what you look at.** Opening a person's detail page writes an entry naming the fields it revealed. That is not a reason to avoid the area; it is what makes it safe to have one.

## 1. Verify who is asking

Do this before opening anything. The admin area will happily show you a person's email address to whoever is signed in as an administrator, so identity checking happens outside the system, not inside it.

Confirm the request comes from the account holder — reply to the address on the account and get a response, or check in person. **Do not act on a request that arrived from a different address**, and do not read the record "just to check" before you have; that read is logged and is itself a disclosure.

## 2. Find the account

`/admin` lists users by ID, role, status and signup date. It shows **no names and no email addresses**, so finding an account is not itself a disclosure. Filter by role or status to narrow it.

If you only have an email address and cannot match it to an ID, ask the person for something else that identifies them, or query the database directly and record why in `docs/06-log/`.

## 3. Answer a "what do you hold about me?" request

Open the person's detail page at `/admin/users/<id>`. It shows everything personal the platform holds:

| Field | Where it lives |
|---|---|
| Email address | `user.email` |
| Display name | `user.display_name` |
| Store name, URL, contact channel | `store.*` |
| Products, prices, photos | `product`, `product_photo` |
| Order history | `order`, `order_item` |

Tell them **also** what is held that is *not* personal data: their activity is recorded as events referencing them by ID only — no name, no email, no phone number, no address (REQ-N2). This matters for the next section.

Opening that page wrote an `admin.user_viewed` entry recording which fields were disclosed. That is your evidence of when and what you answered.

## 4. Answer a correction request

A seller can correct their own name, store details and contact channel themselves from the dashboard. Point them there first — it is faster for them and leaves you out of their personal data.

There is no admin endpoint for editing someone's details on their behalf, on purpose. If a correction genuinely cannot be self-served, make the change directly in the database and record what you changed and why in `docs/06-log/`.

## 5. Answer an erasure request

Use **ลบข้อมูลส่วนบุคคลถาวร** on the detail page, or `POST /api/v1/admin/users/<id>/anonymise` with `{"confirm": "anonymise"}`.

It is irreversible and it does the following in one transaction:

- `email` becomes `anonymised-<id>@invalid`
- `display_name` becomes `ผู้ใช้ที่ถูกลบข้อมูล`
- `password_hash` is replaced with a hash of random bytes, so the account cannot be signed into
- the store's `contact_channel` is cleared and the store is **paused** — a storefront whose owner can no longer sign in must not keep taking orders
- every live session is revoked
- an `admin.user_anonymised` entry is written, naming the fields cleared

**It does not delete their events, and it does not need to.** Events reference people by ID and contain no personal data, which is precisely what makes append-only telemetry and the right to erasure compatible rather than contradictory (REQ-N2, ADR-0001). Do not attempt to delete event rows to satisfy an erasure request — the database refuses, and the request does not require it.

### Two things to check by hand

1. **The store name.** It is free text and often contains a person's name ("ร้านกาแฟพลอย"). Anonymisation does not touch it, because renaming a business is not always what the person wants. Ask them, and edit it directly if they want it gone.
2. **Product names and descriptions.** Same reasoning. Usually impersonal, occasionally not.

Record both decisions in `docs/06-log/`.

## 6. Suspending rather than erasing

Not every request is an erasure. If someone wants to stop using the platform but keep their data, **ระงับบัญชี** blocks sign-in and revokes their live sessions immediately, and is reversible with **คืนสถานะบัญชี**.

Suspension takes effect at once — it does not wait for their cookie to expire.

## 7. Close the loop

Reply within thirty days. Note the date, the request, and what you did in `docs/06-log/`, referencing the audit entry.

If you are asked to prove what happened, `/admin/audit` shows the trail. Neither you nor any other administrator can edit or delete it: the database refuses `UPDATE` and `DELETE` on that table whoever is connected.

## What is not covered yet

- **No self-service export.** A person asking for their data gets a written answer from you, not a download. Acceptable at this scale; revisit if request volume makes it not.
- **No retention policy** on the audit log itself. It holds IDs and counts only.
- **Withdrawal from the study** is a separate matter from a PDPA request. A seller who withdraws should be signed out — which suspension does — but the research consequences belong with the experiment documentation in `docs/03-research/`.
