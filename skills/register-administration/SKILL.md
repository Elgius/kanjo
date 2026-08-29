---
name: register-administration
description: Inspect Kanjo register configuration, archive state, shop or restaurant purpose, open-shift state, usage dependencies, and lifecycle constraints.
---

# Register Administration

Use `register_administration_list` to explain register configuration or whether lifecycle changes are operationally possible. Zod schemas are authoritative.

| Field | Required | Contract |
|---|---:|---|
| `status` | no | `ALL`, `ACTIVE`, or `ARCHIVED`; default `ALL`. |

Request:

```json
{"status":"ARCHIVED"}
```

Representative response:

```json
{"ok":true,"data":{"registers":[{"id":"...","code":"REG-001","name":"Main","purpose":"SHOP","active":false,"hasOpenShift":false,"usageCount":12,"canChangePurpose":false,"canDelete":false,"_count":{"shifts":5,"products":7}}]},"meta":{"generatedAt":"2026-08-24T08:00:00.000Z","timeZone":"Indian/Maldives","registerScope":"ALL"}}
```

`_count` is dependency evidence. `canChangePurpose` and `canDelete` describe operational feasibility, not the caller's mutation permission. `hasOpenShift` is relevant to archive workflows. An empty list is a valid filter result; unsupported status values return `INVALID_INPUT`.

This domain is read-only. Never rename, create, archive, restore, delete, or change register purpose. Do not claim a lifecycle change is safe unless the returned evidence supports it, and never call hidden mutation functions.
