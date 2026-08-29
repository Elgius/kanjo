---
name: inventory
description: Search Kanjo's product catalogue, pricing, categories, register ownership, batch balances, and low or out-of-stock inventory.
---

# Inventory

Use `inventory_search` for catalogue, pricing, category, batch, and stock-level questions. Zod schemas are authoritative.

| Field | Required | Contract |
|---|---:|---|
| `query` | no | Trimmed text, at most 100 characters. |
| `category` | no | Category name, at most 100 characters. |
| `registerId` | no | Register UUID. |
| `status` | no | `all`, `low`, `out`, or `in`; default `all`. |
| `sort` | no | `recent`, `name`, or `stock`; default `recent`. |
| `page` | no | Integer 1–10,000; 20 results per page. |

Request:

```json
{"status":"low","sort":"stock","page":1}
```

Representative response:

```json
{"ok":true,"data":{"products":[],"registers":[],"categories":[],"page":1,"pageCount":1,"total":0,"metrics":{"inventoryValueLaari":0,"activeSkus":0,"lowStock":0,"outOfStock":0}},"meta":{"generatedAt":"2026-08-24T08:00:00.000Z","timeZone":"Indian/Maldives","registerScope":"ALL"}}
```

Products include register, pricing, stock level, measured on-hand quantity, category, and current positive batches. Batch remaining quantities may be fractional and retain existing three-decimal precision. Money is integer laari (`100 laari = 1 MVR`). Use `pageCount` and `total` before calling a search exhaustive; an empty product list is valid.

Malformed UUIDs, enums, pages, or oversized text return `INVALID_INPUT`. This domain is read-only: never create/edit/archive products or categories, receive stock, write off stock, or change expiry through hidden functions.
