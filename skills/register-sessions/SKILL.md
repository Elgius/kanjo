---
name: register-sessions
description: Review Kanjo register shift history, cash reconciliation, payment totals, refunds, session transactions, bills, and revisions.
---

# Register Sessions

Discover register IDs first, page through its shifts second, then request detail only for the relevant session. Zod schemas are authoritative.

## `register_sessions_list_registers`

Send `{}`. It returns active registers, their latest session, and `openSessions`, `totalSessions`, and register counts.

Response: `{"ok":true,"data":{"registers":[],"metrics":{"registers":0,"openSessions":0,"totalSessions":0}},"meta":{"generatedAt":"2026-08-24T08:00:00.000Z","timeZone":"Indian/Maldives","registerScope":"ALL"}}`

## `register_sessions_list`

| Field | Required | Contract |
|---|---:|---|
| `registerId` | yes | Register UUID. |
| `page` | no | Integer 1–10,000; default 1. |
| `pageSize` | no | Integer 1–50; default 25. |

Request: `{"registerId":"11111111-1111-4111-8111-111111111111","page":1,"pageSize":25}`

Response: `{"ok":true,"data":{"register":{"id":"...","name":"Main"},"sessions":[],"page":1,"pageSize":25,"totalSessions":0,"pageCount":1},"meta":{"generatedAt":"2026-08-24T08:00:00.000Z","timeZone":"Indian/Maldives","registerScope":"ALL"}}`

Each session includes opening/closing cash, actors, completed and cash sales totals, transaction count, and refund count. Follow `pageCount` when older shifts matter.

## `register_sessions_get_detail`

| Field | Required | Contract |
|---|---:|---|
| `registerId` | yes | Register UUID. |
| `sessionId` | yes | Session UUID belonging to that register. |

Request: `{"registerId":"11111111-1111-4111-8111-111111111111","sessionId":"22222222-2222-4222-8222-222222222222"}`

Response: `{"ok":true,"data":{"id":"...","status":"CLOSED","expectedCashLaari":10000,"varianceLaari":0,"transactions":[]},"meta":{"generatedAt":"2026-08-24T08:00:00.000Z","timeZone":"Indian/Maldives","registerScope":"ALL"}}`

Detail includes cash reconciliation, sales, canonical bills, revisions, stock-backed quantities, and actors. `varianceLaari` is closing cash minus expected cash; null means no closed reconciliation. Do not count refunds as completed revenue.

Invalid IDs or oversized pages return `INVALID_INPUT`; missing register/session pairs return `NOT_FOUND`; empty session pages are valid. This domain is read-only. Never close shifts, change cash, amend/reverse bills, or mutate stock.
