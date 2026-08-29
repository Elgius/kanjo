---
name: overview
description: Use Kanjo's read-only operating overview when the user asks for today's brief, sales pulse, order performance, refunds, product mix, or register performance.
---

# Overview

Use this domain for a current, all-register operating brief. The TypeScript Zod schemas are the authoritative contract.

## Tool

### `overview_get_operating_brief`

| Request field | Required | Contract |
|---|---:|---|
| none | — | Send a strict empty object `{}`. |

Request:

```json
{}
```

Representative response:

```json
{"ok":true,"data":{"metrics":{"netSalesLaari":47500,"previousSalesLaari":130500,"orders":9,"previousOrders":40,"averageOrderLaari":5278,"refunds":0,"refundsLaari":0},"hourly":[],"topProducts":[],"categoryMix":[],"registerPulse":[]},"meta":{"generatedAt":"2026-08-24T08:00:00.000Z","timeZone":"Indian/Maldives","registerScope":"ALL"}}
```

`metrics` contains today's sales, orders, average order, refunds, and prior-day comparisons. `hourly` compares today with the same weekday last week. `topProducts`, `categoryMix`, and `registerPulse` explain the sales mix and active-register performance.

## Interpretation and boundaries

Money fields ending in `Laari` are integer laari (`100 laari = 1 MVR`). Hourly chart values are already MVR and must not be added to laari fields without conversion. Empty arrays mean no qualifying activity. Never invent comparisons or missing transactions.

An invalid non-empty request returns `INVALID_INPUT`. Authentication failures return `UNAUTHENTICATED` or `AI_COO_FORBIDDEN`; internal failures are sanitized as `INTERNAL_ERROR`. This domain is read-only: never call or suggest hidden mutation functions, and preserve returned totals and timestamps exactly.
