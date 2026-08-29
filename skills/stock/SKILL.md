---
name: stock
description: Inspect Kanjo's stock snapshot and movement ledger, or identify low, out-of-stock, expired, and soon-expiring inventory risks.
---

# Stock

Use the snapshot for stock levels or movement evidence. Use risks for an actionable exception list. Zod schemas are authoritative.

## `stock_get_snapshot`

| Field | Required | Contract |
|---|---:|---|
| `registerId` | no | Register UUID. |
| `query` | no | Trimmed search text, at most 100 characters. |
| `movementType` | no | `all`, `INITIAL`, `ADJUSTMENT`, `SALE`, or `REFUND`; default `all`. |

Request: `{"registerId":"11111111-1111-4111-8111-111111111111","movementType":"SALE"}`

Response: `{"ok":true,"data":{"registers":[],"products":[],"movements":[],"batches":[],"movementCount":0,"metrics":{"unitsOnHand":0,"stockValueLaari":0,"lowStock":0,"outOfStock":0}},"meta":{"generatedAt":"2026-08-24T08:00:00.000Z","timeZone":"Indian/Maldives","registerScope":"ALL"}}`

The response includes product/batch balances and up to 100 movements; `movementCount` can exceed the returned list. Negative movement deltas reduce stock.

## `stock_get_risks`

| Field | Required | Contract |
|---|---:|---|
| `registerId` | no | Register UUID. |
| `expiryWindowDays` | no | Integer 1–365; default 30. |

Request: `{"expiryWindowDays":30}`

Response: `{"ok":true,"data":{"asOfDate":"2026-08-24","expiryWindowDays":30,"risks":[{"productId":"...","riskTypes":["LOW_STOCK","EXPIRING_SOON"],"expiredBatches":[],"expiringBatches":[]}],"counts":{"total":1,"lowStock":1,"outOfStock":0,"expired":0,"expiringSoon":1}},"meta":{"generatedAt":"2026-08-24T08:00:00.000Z","timeZone":"Indian/Maldives","registerScope":"ALL"}}`

Risk types are `LOW_STOCK`, `OUT_OF_STOCK`, `EXPIRED`, and `EXPIRING_SOON`; a product can have several. Cite returned batch IDs, expiry dates, and remaining quantities. Empty risks means no classified exception in scope, not proof of future availability.

Money is integer laari and measured quantities retain returned precision. Invalid fields return `INVALID_INPUT`. This domain is read-only: never receive stock, write off stock, assign expiry, fabricate movements, or call hidden mutation functions.
