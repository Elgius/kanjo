# Audit-driven POS safeguards

## Behavior

- Customer, menu, shift, sale, held-order, credit-issue, cancellation and print requests use form submission locks. The covered database mutations persist retry results atomically with business changes. Keys are scoped to the authenticated actor and operation; a key cannot be reused with different transaction details.
- Customer creation matches normalized names, email addresses and phone numbers. A separate-person override requires a reason. Limits of MVR 10,000 or more require explicit review and a reason; existing limits are not silently changed.
- Site administrators can review and merge customer accounts. Credit bills move to the survivor, the source is archived, and audit metadata records the moved bill IDs and original account IDs. The survivor's limit is retained, and insufficient limits or stale account previews block merging.
- Closing a shift lists all held bills and links to resume/settle them. Cancellation requires a reason and stores the items and amount in the same transaction as cancellation.
- Cash closing starts with a blank physical count. The comparison appears after submission. Confirmation recalculates the expected cash and rejects stale reviews. Expected cash, counted cash, variance, and explanation are retained. `CASH_VARIANCE_THRESHOLD_LAARI` defaults to 500 (MVR 5); differences above it require an explanation.
- Unpaid, receipt and history printing show request count, reprints and the latest request time. Reprints require a reason. Browser printing is recorded as REQUESTED, never as confirmed paper output. Historical audit events are backfilled as requests by the migration.

## Database rollout

Migrations: `20260911200000_audit_safeguards` and `20260911210000_credit_reversal_settlement`.

Sales regression testing also exposed two existing credit-refund constraint conflicts. Refund and amendment stock movements now use the settled sale as their source, and reversed credit retains its original settlement history.

Applied and browser-tested on the isolated `codex-settings-overhaul` branch (`br-quiet-hat-azurcght`), used by `.env.local` and localhost:3000. Production has not been migrated by this task. Apply the migration before deploying code to another environment, generate Prisma, and restart the app to load the new client. Keep mutation retry records while clients may still retry requests; deleting them removes replay protection.

## Validation

Unit tests: `tests/unit/safeguards.test.ts`.
Database tests: `tests/integration/safeguards.integration.test.ts` (requires `RUN_DB_TESTS=1` and an isolated `TEST_NEON_DB`). Covers simultaneous sale retries, single stock deduction, changed-payload rejection, rollback, print reason enforcement, print replay, and preserving credit history during merges.

Browser checks use synthetic records on the isolated branch. No production sales, customers, cash balances, or menu items are changed.

Verified on localhost:3000: duplicate-customer and high-credit warnings; customer creation submission lock; merge preview and preserved outstanding credit; held-bill cancellation with mandatory reason; blank cash count, variance review and required explanation; shift reopening; unpaid print preview and persisted reprint history; cash checkout and paid receipt reprint guard; menu creation submission lock and successful save. The synthetic menu item was archived after testing. Paper output was not performed.

Isolated PR checks: 78 unit tests, 4 safeguard integration tests, and 5 sales integration tests passed; ESLint, TypeScript, and `git diff --check` passed. The sales suite emits a Prisma/pg concurrent-query deprecation warning, but all assertions pass.
