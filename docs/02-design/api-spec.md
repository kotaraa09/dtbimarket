# API specification

**Status:** draft
**Written:** 2026-08-28
**Service:** `apps/api` — Express, TypeScript
**Related:** `architecture.md`, `database-schema.md`, `detailed-design.md`

Every endpoint below names the event it writes. An endpoint that changes something a user can see and has an empty event column is either an oversight or a decision, and the decision has to be written in the column, not assumed.

## Conventions

**Base path** `/api/v1`. The version is in the path so that a breaking change during the study window is possible without breaking a seller's open tab — though during the freeze there should be no breaking changes at all.

**Auth** httpOnly session cookie, `Secure`, `SameSite=Lax` (D-2, pending ADR). Endpoints are marked `public`, `seller`, `buyer` or `admin`. Anything marked `seller` also resolves the caller's store and refuses if the target resource belongs to another one.

**Content type** `application/json`, except photo upload which is `multipart/form-data`.

**Time** All timestamps are ISO-8601 with an offset, generated server-side. Clients never send timestamps that get stored — a client clock is not evidence of when something happened.

**Money** Integers in satang, in a field suffixed `_satang`. The UI formats; the API does not.

**Pagination** Cursor-based: `?limit=20&cursor=<id>`, response carries `next_cursor` or `null`. Offset pagination duplicates and skips rows while the catalogue is being edited underneath it.

**Errors** One shape, always:

```json
{ "error": { "code": "product_not_found", "message": "ไม่พบสินค้านี้", "details": {} } }
```

| Status | When |
|---|---|
| 400 | Malformed request |
| 401 | Not signed in |
| 403 | Signed in, but the resource belongs to someone else |
| 404 | Does not exist, or exists and is not visible to this caller |
| 409 | Conflict — duplicate slug, order already accepted |
| 422 | Validation failed; `details` names the fields |
| 429 | Rate limited |
| 500 | Server fault; the response never contains a stack trace |

`message` is Thai and safe to display. `code` is stable, English, and what the client branches on.

**Validation** at the boundary, before any business logic, with the schema declared next to the route.

**Rate limits** Auth endpoints 10 requests per minute per IP. Write endpoints 60 per minute per session. Read endpoints 300 per minute per session.

---

## Authentication

| Method | Path | Auth | Purpose | Event |
|---|---|---|---|---|
| POST | `/auth/register` | public | Create an account | `seller.registered` or `buyer.registered` |
| POST | `/auth/login` | public | Start a session | `seller.signed_in` or `buyer.signed_in` |
| POST | `/auth/logout` | any | End the session | — |
| GET | `/auth/me` | any | Current user and store | — |

```http
POST /api/v1/auth/register
{ "email": "…", "password": "…", "display_name": "…", "role": "seller" }

201 { "user": { "id": "usr_…", "role": "seller", "display_name": "…" } }
422 { "error": { "code": "validation_failed", "details": { "password": "สั้นเกินไป" } } }
```

The response never contains the password hash, and no log line during registration contains the email address.

## Store

| Method | Path | Auth | Purpose | Event |
|---|---|---|---|---|
| POST | `/stores` | seller | Create the seller's one store | `store.created` |
| GET | `/stores/:slug` | public | Storefront | `storefront.viewed` |
| PATCH | `/stores/:id` | seller | Edit profile | `store.profile_updated` |

409 `store_already_exists` if the seller already has one — the database enforces it with a unique constraint on `owner_id`, and the API translates the violation rather than checking first and racing.

## Products

| Method | Path | Auth | Purpose | Event |
|---|---|---|---|---|
| GET | `/stores/:slug/products` | public | Published products of one store | — |
| GET | `/products/:id` | public | Product detail | `product.viewed` |
| POST | `/products` | seller | Create | `product.created` |
| PATCH | `/products/:id` | seller | Edit name or description | `product.description_changed` |
| PATCH | `/products/:id/price` | seller | Change price | `product.price_changed` |
| PATCH | `/products/:id/stock` | seller | Change stock | `product.stock_changed` |
| POST | `/products/:id/publish` | seller | Publish | `product.published` |
| POST | `/products/:id/unpublish` | seller | Unpublish | `product.unpublished` |
| DELETE | `/products/:id` | seller | Delete | `product.deleted` |
| POST | `/products/:id/photos` | seller | Upload one photo | `product.photo_added` |
| DELETE | `/products/:id/photos/:photoId` | seller | Remove a photo | `product.photo_removed` |

Price and stock have their own endpoints rather than being fields on a general `PATCH`. This is not REST purity — it is the only way to emit `product.price_changed` and `product.stock_changed` as separate countable events. A single `PATCH /products/:id` that accepted every field would collapse them into `product.updated`, which the study cannot separate again.

```http
POST /api/v1/products/:id/photos      (multipart: file)

201 { "photo": { "id": "pht_…", "url": "https://…", "position": 2 },
      "product": { "id": "prd_…", "photo_count": 2 } }
413 { "error": { "code": "file_too_large" } }
415 { "error": { "code": "unsupported_media_type" } }
```

`photo_count` comes back because the dashboard tile and the recommendation both depend on it, and a client that has to re-fetch to learn it will sometimes not bother.

**This is the endpoint the primary metric depends on.** The event is written in the same transaction as the row, after the file is stored. A failed upload writes nothing (TS-01-07).

## Catalogue

| Method | Path | Auth | Purpose | Event |
|---|---|---|---|---|
| GET | `/catalog` | public | Browse across stores | `catalog.viewed` |
| GET | `/catalog?q=&category=` | public | Search and filter | `catalog.searched` |

The `catalog.searched` payload carries `category`, `result_count` and `query_length` — **never the query text**. A search box is where people type things about themselves, and REQ-N2 has no exception for search.

## Orders

| Method | Path | Auth | Purpose | Event |
|---|---|---|---|---|
| POST | `/orders` | buyer | Place an order | `order.placed` |
| GET | `/orders` | buyer | My orders | — |
| GET | `/stores/:id/orders` | seller | Orders for my store | — |
| PATCH | `/orders/:id/status` | seller | Advance the order | `order.status_changed` |
| POST | `/orders/:id/cancel` | buyer or seller | Cancel | `order.cancelled` |

```http
POST /api/v1/orders
{ "store_id": "str_…",
  "items": [ { "product_id": "prd_…", "quantity": 2 } ],
  "idempotency_key": "cli_…" }

201 { "order": { "id": "ord_…", "status": "placed", "total_satang": 12400 } }
409 { "error": { "code": "duplicate_order" } }
422 { "error": { "code": "insufficient_stock", "details": { "prd_…": 1 } } }
```

A cart holding items from two stores becomes two calls and two orders. The idempotency key is the client's, unique per submission attempt, so that a double-tap on a phone with a slow connection does not create two orders — which sellers would have to sort out by hand, with a real buyer.

## Dashboard

| Method | Path | Auth | Purpose | Event |
|---|---|---|---|---|
| GET | `/dashboard/metrics?period=7d` | seller | The seller's own numbers | `dashboard.viewed` |

```json
{ "period_days": 7,
  "store_views": 128, "orders": 6, "revenue_satang": 124000,
  "published_products": 6, "products_under_2_photos": 4,
  "computed_at": "2026-08-28T11:20:00+07:00" }
```

Seed rows are excluded here, not only in analysis (REQ-D3). The same module answers the advisor's internal metrics call, so the card and the dashboard can never disagree.

## Recommendations

| Method | Path | Auth | Purpose | Event |
|---|---|---|---|---|
| GET | `/recommendations/current` | seller | The recommendation to show now, generating and delivering if there is one | `recommendation.delivered` |
| POST | `/recommendations/:id/viewed` | seller | Client signal: it was on screen | `recommendation.viewed` |
| POST | `/recommendations/:id/opened` | seller | Client signal: it was opened | `recommendation.opened` |
| POST | `/recommendations/:id/dismiss` | seller | Dismiss | `recommendation.dismissed` |

```json
{ "recommendation": {
    "id": "rec_…", "action_type": "photo_added",
    "title": "เพิ่มรูปสินค้าที่ยังมีรูปเดียว",
    "body": "สินค้า 4 รายการของคุณมีรูปเดียว เพิ่มอีกอย่างน้อยรายการละ 1 รูป",
    "cta": { "label": "เพิ่มรูปเลย", "product_id": "prd_…" },
    "delivered_at": "2026-08-28T11:20:03+07:00" } }
```

`variant_id` is **not** in the response. The browser has no reason to know which arm it is in, and a variant ID in a payload is a variant ID that ends up in a client-side log, a screenshot, or a seller's question about why their friend's app says something different.

`title` and `body` are rendered server-side from the variant template and the frozen snapshot. The client renders text it was given; it does not assemble sentences from numbers.

**Two of these four events are client-signalled.** `recommendation.viewed` and `recommendation.opened` depend on the browser making a call, which can be blocked, dropped or replayed. They are therefore secondary metrics only. The primary metric joins `recommendation.delivered` — written by the server when it delivers — to `product.photo_added` — written by the server when the photo lands. Neither can be lost by a client.

Dismissal returns 200 and sets `dismissed_at`. It does not delete the recommendation, and the recommendation stays in the denominator of the action rate (TS-01-12).

## Internal

Not routable from the internet. Called by the advisor over the private network with a shared secret in a header.

| Method | Path | Purpose |
|---|---|---|
| GET | `/internal/stores/:id/metrics` | The same metric module the dashboard uses |
| POST | `/internal/advisor/generate` | API → advisor: produce a candidate for this store |

```http
POST /internal/advisor/generate
{ "store_id": "str_…", "metrics": { … }, "as_of": "2026-08-28T11:20:00+07:00" }

200 { "candidate": { "rule": "photo_coverage", "action_type": "photo_added",
                     "metric_snapshot": { … }, "cta_product_id": "prd_…" } }
204   (no candidate — nothing to say about this store right now)
```

Budget: 800 ms. On timeout or any error the API returns no recommendation and writes nothing. A missing card is a product inconvenience; a `Recommendation` row with an incomplete snapshot is permanent bad data.

## Health

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness — process is up |
| GET | `/health/ready` | Readiness — database reachable, migrations applied |

## Endpoints deliberately absent

- **No endpoint updates or deletes an `Event`.** Not for admins, not for the researcher, not for cleanup. The table is append-only (ADR-0001).
- **No endpoint returns another store's metrics or recommendations.** Not even to an admin: comparison figures reach a seller only as an aggregate inside a `metric_snapshot`.
- **No endpoint assigns a variant.** Assignment is a side effect of delivery, computed and persisted server-side, and never exposed as an operation a client can trigger or repeat.
