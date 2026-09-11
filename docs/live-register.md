# Cashier routing

`/live_register` is the authenticated cashier register selector. `/live_register/[registerId]` opens the selected register.

A register-only account is a non-site-admin account with `REGISTERS_VIEW` whose effective capabilities all belong to the Registers page. Role names, job presets and the number of assigned registers do not decide the landing page. A Cashier preset that also grants Overview or Customers access remains a broader workspace account.

`proxy.ts` reads the signed-in session and current account permissions, then redirects register-only accounts from login, the dashboard and the old register selector. Existing `/registers/[registerId]` links preserve the selected ID and query parameters. Other permitted register tools retain their routes and server-side guards. Authentication APIs, public payment pages and assets are excluded. Server actions independently check permissions and shift ownership.

The shared authorization loader reads `User.registerScopeMode` and `User.registerAccess` (`user_register_access`), together with the current role capabilities. Legacy role register scope is not used. The selector filters active `cash_registers`; shift data comes from `register_shifts`, sales from `sales`, held bills from `register_orders`, and catalog/pricing from the existing register-specific queries. No sample registers, menu items or locally simulated transactions remain.

An account with SELECTED scope and no assignments sees an empty state. A direct request to an unassigned register returns not found. Another user's active shift shows an in-use state unless the account has `SHIFT_OVERRIDE`. Opening and closing shifts, checkout and held bills reuse the existing transactional actions. Proxy stamps the originating UI on forwarded requests so action redirects remain in the cashier workspace. That header controls navigation only, never authorization.

Cashier receipt queries are limited to the selected register's current shift. The cashier page does not fetch credit-customer options or offer account-management controls. The usual register workspace remains available to broader roles.

Verification: `bun test tests/unit/landing.test.ts`; with an isolated `TEST_NEON_DB`, `RUN_DB_TESTS=1 bun test tests/integration/live-register.integration.test.ts`. Integration fixtures verify real sign-in/session authorization, proxy redirects, user assignments overriding legacy role scope, current-shift receipt filtering and permission changes with an existing session cookie. Never point the test database at production.
