---
name: bill-history
description: Search Kanjo bills and receipts by number, cashier, register, payment, status, or Maldives date and time, including bill revisions.
---

# Bill History

Start with search to obtain totals and the first page. Continue only with its unchanged filters and returned cursor. Zod schemas are authoritative.

## Shared filters

| Field | Required | Contract |
|---|---:|---|
| `query` | no | At most 100 characters. |
| `registerId` | no | Register UUID. |
| `paymentMethod` | no | `CASH`, `CARD`, or `MOBILE`. |
| `status` | no | `UNPAID`, `PAID`, `AMENDED`, `REVERSED`, or `CANCELLED`. |
| `dateFrom`, `dateTo` | no | `YYYY-MM-DD`, interpreted in Maldives time. |
| `timeFrom`, `timeTo` | no | `HH:mm` 24-hour Maldives time. |

## `bill_history_search`

Request: `{"status":"AMENDED","dateFrom":"2026-08-01"}`

Response: `{"ok":true,"data":{"filters":{"status":"AMENDED","dateFrom":"2026-08-01"},"page":{"bills":[],"nextCursor":null},"totalBills":0,"totalLaari":0,"registers":[]},"meta":{"generatedAt":"2026-08-24T08:00:00.000Z","timeZone":"Indian/Maldives","registerScope":"ALL"}}`

It returns matching totals, paid total, register choices, the first 25 serialized bills, revisions, and `nextCursor`.

## `bill_history_continue`

In addition to the same filters, `cursor` is required with ISO `openedAt` and bill UUID `id`. Treat the object as opaque.

Request: `{"cursor":{"openedAt":"2026-08-20T10:00:00.000Z","id":"11111111-1111-4111-8111-111111111111"},"status":"AMENDED","dateFrom":"2026-08-01"}`

Response: `{"ok":true,"data":{"bills":[],"nextCursor":null},"meta":{"generatedAt":"2026-08-24T08:00:00.000Z","timeZone":"Indian/Maldives","registerScope":"ALL"}}`

Continue returns up to 25 more bills without recomputing totals. Null cursor means exhaustion. Bill and receipt numbers are strings, money is integer laari, and revisions are the evidence for amendments or reversals. Invalid filters/cursors return `INVALID_INPUT`; empty matches are valid.

This domain is read-only. Never amend, reverse, cancel, settle, reprint, or call hidden mutation functions. Do not invent bill status or totals.
