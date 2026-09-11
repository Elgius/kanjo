# Settings and account register access

Roles define capabilities and a job preset (`workspace`). The preset is editable metadata for settings, not a login redirect policy. Register assignments live on each user through `User.registerScopeMode` and `UserRegisterAccess`.

- Selected scope with no grants has no register access.
- All scope includes future registers.
- Site administrators still bypass capabilities and register scope.
- Global capabilities (including customer profiles and AI COO) are not constrained by register assignments.
- Changing an account’s role preserves its register assignments unless the same form explicitly edits them.
- Register creation requires all-register scope for non-admin accounts. Settings reject incompatible account assignments and role changes.
- Assigned archived registers are retained. They become available when restored; new archived assignments are rejected.

## Migration and rollout

`20260911180000_user_register_assignments` copies every user’s existing role scope and selected-register grants without changing capabilities. Legacy role scope fields remain for auditing and rollback analysis, but are no longer used by authorization or edited in settings.

Apply this migration before serving the new application code, then regenerate Prisma Client and restart the server. Hot reload can retain the old Prisma singleton and report `Unknown field registerScopeMode` even after generation.

For local development, Next.js and Prisma CLI both respect `.env.local` ahead of `.env`. Explicitly supplied environment variables take precedence. Verify the target branch before migrations; use a direct database connection for migration commands.

```sh
bunx prisma migrate deploy
bunx prisma generate
bun run dev
```

The overhaul was validated on an isolated Neon branch. Apply the migration and regenerate Prisma Client before serving this application version in each deployment environment.

## Scope

Settings and authorization enforce per-account register assignments. The cashier flow and login redirect policy are described in [Cashier routing](live-register.md). Session and bill-history permissions still cover other cashiers’ activity at the assigned registers; the cashier page itself limits receipt queries to its current shift. Paid-bill corrections and reversals remain site-administrator operations.

## Verification

Run `bun test tests/unit` and `bunx tsc --noEmit`. Integration tests require `RUN_DB_TESTS=1` and an isolated `TEST_NEON_DB` distinct from the normal `NEON_DB`:

```sh
RUN_DB_TESTS=1 bun test tests/integration/account-access.integration.test.ts tests/integration/capability-scope.integration.test.ts
```

The migration was checked for scope differences, missing grants, and extra grants against the original role-based assignments; all counts were zero.
