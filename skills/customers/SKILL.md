---
name: customers
description: Review Kanjo customer credit exposure and explicitly requested individual customer profiles or credit-bill histories.
---

# Customers

Use overview for search and aggregate exposure. Use detail only when the user explicitly asks about one identified customer. Zod schemas are authoritative.

## `customers_get_overview`

| Field | Required | Contract |
|---|---:|---|
| `query` | no | Trimmed text, at most 100 characters. |
| `page` | no | Integer 1–10,000; default 1. |
| `pageSize` | no | Integer 1–50; default 25. |

Request: `{"query":"Aishath","page":1,"pageSize":25}`

Response: `{"ok":true,"data":{"customers":[{"id":"...","name":"Aishath","creditLimitLaari":500000,"outstandingLaari":10000,"availableCreditLaari":490000,"atLimit":false,"updatedAt":"2026-08-24T08:00:00.000Z"}],"metrics":{"customers":1,"outstandingLaari":10000,"availableCreditLaari":490000,"atLimit":0},"pagination":{"page":1,"pageSize":25,"matchingCustomers":1,"pageCount":1}},"meta":{"generatedAt":"2026-08-24T08:00:00.000Z","timeZone":"Indian/Maldives","registerScope":"ALL"}}`

Overview intentionally returns no bulk contact, nationality, or address fields. Its metrics remain company-wide even when the list is filtered.

## `customers_get_detail`

| Field | Required | Contract |
|---|---:|---|
| `customerId` | yes | UUID obtained from overview or an explicit record reference. |

Request: `{"customerId":"11111111-1111-4111-8111-111111111111"}`

Response: `{"ok":true,"data":{"id":"...","name":"Aishath","email":"aishath@example.com","phoneNumber":"...","address":"...","nationality":"Maldivian","creditLimitLaari":500000,"outstandingLaari":10000,"availableCreditLaari":490000,"creditBills":[]},"meta":{"generatedAt":"2026-08-24T08:00:00.000Z","timeZone":"Indian/Maldives","registerScope":"ALL"}}`

Treat detail fields as personal data. Never use this tool for bulk harvesting. A missing UUID returns `NOT_FOUND`; never guess an identity. Invalid IDs/pages return `INVALID_INPUT`. Money is integer laari and bill numbers are strings.

This domain is read-only. Do not create or edit customers, change credit limits, issue/settle credit, expose PII beyond the explicit lookup, or call hidden mutation functions.
