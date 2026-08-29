---
name: settings
description: Inspect Kanjo team accounts, roles and capability grants, or search the global audit trail without accessing credentials or sessions.
---

# Settings

Use account and role tools for access-configuration questions; use audit search for recorded operational evidence. Zod schemas are authoritative.

## `settings_list_accounts`

Send strict `{}`.

Response: `{"ok":true,"data":{"accounts":[{"id":"...","name":"Elgius","email":"...","username":"elgius","isSiteAdmin":true,"createdAt":"2026-08-24T08:00:00.000Z","roleId":"...","role":{"name":"Full Access"}}]},"meta":{"generatedAt":"2026-08-24T08:00:00.000Z","timeZone":"Indian/Maldives","registerScope":"ALL"}}`

It returns account identity, role, site-admin status, and creation time; it never returns credential or session relations.

## `settings_list_roles`

Send strict `{}`.

Response: `{"ok":true,"data":{"roles":[{"id":"...","name":"Full Access","description":"...","registerScopeMode":"ALL","capabilities":[],"registerAccess":[],"_count":{"users":1}}]},"meta":{"generatedAt":"2026-08-24T08:00:00.000Z","timeZone":"Indian/Maldives","registerScope":"ALL"}}`

Use capability grants, register access, scope mode, and assigned-user count to describe access. Do not equate a role name with permissions; inspect the returned grants.

## `settings_search_audit_log`

| Field | Required | Contract |
|---|---:|---|
| `from`, `to` | no | `YYYY-MM-DD` in Maldives time. |
| `actor` | no | Actor UUID. |
| `outcome` | no | `SUCCESS`, `FAILURE`, or `DENIED`. |
| `event`, `targetType` | no | At most 100 characters. |
| `area` | no | `AI_COO`, `OVERVIEW`, `REGISTERS`, `INVENTORY`, `STOCK`, `REPORTING`, `BILL_HISTORY`, `CUSTOMERS`, `SETTINGS`, or `AUDIT_LOG`. |
| `query` | no | Search text, at most 100 characters. |
| `after`, `before` | no | Opaque cursor, at most 500 characters; use only one direction at a time. |

Request: `{"outcome":"DENIED","area":"REGISTERS","query":"shift"}`

Response: `{"ok":true,"data":{"rows":[],"previousCursor":null,"nextCursor":null},"meta":{"generatedAt":"2026-08-24T08:00:00.000Z","timeZone":"Indian/Maldives","registerScope":"ALL"}}`

Rows contain event metadata, actor/target information, and IP where recorded; each page is at most 50. Keep filters unchanged when continuing. Empty rows are valid. Treat audit metadata and IPs as sensitive evidence, and do not infer guilt or causation from denial/failure alone.

Empty account, role, or audit lists are valid. Extra fields, malformed dates/UUIDs, conflicting cursor directions, and oversized text return `INVALID_INPUT`; these list/search tools do not return `NOT_FOUND` for an empty result.

This domain is read-only. Never expose password hashes, tokens, cookies, authorization headers, credentials, or sessions; never create accounts, reset passwords, assign roles, alter administrators, or call hidden mutation functions.
