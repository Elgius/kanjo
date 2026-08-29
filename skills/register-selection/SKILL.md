---
name: register-selection
description: Inspect Kanjo's current registers, open shifts, expected cash, sellable items, held orders, restaurant tables, or a specific receipt.
---

# Register Selection

Use the summary to discover a register or assess the fleet. Use the workspace only after resolving a register UUID. Zod schemas are authoritative.

## `register_selection_get_summary`

| Field | Required | Contract |
|---|---:|---|
| `registerId` | no | Register UUID to select; otherwise the service chooses an open or first register. |

Request: `{"registerId":"11111111-1111-4111-8111-111111111111"}`

Response: `{"ok":true,"data":{"registers":[],"selected":null,"selectedShift":null,"recentSales":[],"products":[],"metrics":{"openRegisters":0,"totalRegisters":0,"activeShiftSalesLaari":0,"cashOnHandLaari":0}},"meta":{"generatedAt":"2026-08-24T08:00:00.000Z","timeZone":"Indian/Maldives","registerScope":"ALL"}}`

The result includes register/open-shift summaries, current-shift sales, expected cash, recent completed sales, and sellable items.

## `register_selection_get_workspace`

| Field | Required | Contract |
|---|---:|---|
| `registerId` | yes | Register UUID. |
| `receiptId` | no | Sale UUID for a receipt belonging to that register. |

Request: `{"registerId":"11111111-1111-4111-8111-111111111111","receiptId":"22222222-2222-4222-8222-222222222222"}`

Response: `{"ok":true,"data":{"register":{"id":"...","name":"Main"},"shift":null,"items":[],"lastSale":null,"receipt":null,"restaurantTables":[],"creditCustomers":[],"heldOrders":[]},"meta":{"generatedAt":"2026-08-24T08:00:00.000Z","timeZone":"Indian/Maldives","registerScope":"ALL"}}`

The workspace contains sellable items, the latest sale, optional receipt, held orders, tables, open shift, and credit-customer options. `NOT_FOUND` means the register is unavailable; a missing optional receipt is returned as `receipt: null`.

## Interpretation and boundaries

Money is integer laari, bill and receipt numbers are strings, quantities retain returned precision, and timestamps are ISO strings. Never substitute a similarly named register or invent cash totals. Invalid UUIDs return `INVALID_INPUT`.

This domain is read-only. Do not open or close shifts, hold orders, record sales, amend receipts, or modify tables through hidden functions.
