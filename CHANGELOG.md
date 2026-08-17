# Changelog

All notable changes to Kanjo are documented in this file.

## [Unreleased] - 2026-08-17

### Added

#### Register navigation and session history

- Converted Registers in the application sidebar into an expandable file tree.
- Added Register selection, Sessions, and Edit destinations beneath Registers.
- Added a register sessions overview covering active and completed shifts.
- Added per-register session history with shift ownership, cash balances, sales totals, and transaction counts.
- Added session detail pages that expose the transactions and bills recorded during a selected shift.
- Added responsive loading states for the new register session routes.

#### Register administration

- Added a dedicated register management screen for all active and archived registers.
- Added register renaming while preserving the generated register code used by historical records.
- Added Shop and Restaurant type editing for registers that have not acquired operational data.
- Added register archiving and restoration.
- Prevented archiving while a register has an open shift.
- Added permanent deletion for completely unused registers with exact-name confirmation.
- Prevented deletion when a register has shifts, inventory, menus, tables, stock movements, batches, or customer-credit history.
- Added audit events for successful and failed register updates and deletions.

#### Restaurant tables and service

- Added a Restaurant action to open restaurant-specific management from an eligible register shift.
- Added restaurant table creation, editing, activation, and archiving with configurable seat counts.
- Added a mobile-friendly table overview showing capacity, occupancy, and the value of each open table bill.
- Added restaurant table assignment when physically holding a restaurant bill.
- Enforced one open held bill per table at the database and application layers.
- Released table occupancy when a held bill is completed or cancelled.
- Prevented shift closure while physical held bills still exist.

#### Physical bill holds

- Reworked Hold into a choice between Physical and Customer credit.
- Added horizontally scrollable bill tabs above the register workspace for physical holds.
- Added a New bill tab so cashiers can switch between a paused customer and a new transaction.
- Restored held items, notes, payment method, and restaurant table selection when a tab is resumed.
- Kept physical holds inventory-neutral until the resumed bill is finally charged.
- Added cancellation for held bills without creating a sale or stock movement.

#### Customers and credit accounts

- Added Customers to the main navigation and permission model.
- Added customer creation with name, email, phone number, address, nationality, and credit limit.
- Added searchable customer account listings with credit-limit, outstanding-balance, and available-credit summaries.
- Added explicit View and Edit actions on each customer row.
- Added customer account editing with direct links that open the populated edit form.
- Added customer detail pages with contact information, account metrics, outstanding bills, and paid bill history.
- Added full-settlement payment collection using Cash, Card, or Mobile pay.
- Added responsive loading states for customer routes.

#### Customer-credit accounting

- Added atomic customer-credit issuance from an open register shift.
- Added server-side credit-limit checks immediately before a bill is issued.
- Blocked new credit holds when the new bill would exceed the customer credit limit.
- Deducted inventory immediately when a customer-credit bill is issued.
- Deferred Sale and Bill creation until the customer balance is settled.
- Recorded settlement against the currently open shift of the bill's original register.
- Prevented settlement when the original register does not have an open shift.
- Prevented inventory from being deducted a second time during settlement.
- Allowed a physical held bill to be converted into customer credit atomically.
- Added customer-credit inventory movement links and success/failure audit events.

#### Restaurant menu categories

- Replaced free-text restaurant menu categories with a dropdown backed by Inventory product categories.
- Added server-side validation that rejects categories not configured in Inventory.
- Propagated Inventory category renames to products and restaurant menu items.
- Prevented category deletion while products or menu items still use it.
- Identified legacy menu categories in edit forms and required selection of a configured replacement.

#### Standalone restaurant ingredients

- Added a per-recipe-ingredient checkbox for selling that ingredient as a standalone menu item.
- Reused the Inventory product name, category, SKU, and selling price for standalone items.
- Calculated standalone availability from dated usable restaurant stock and the configured serving size.
- Supported standalone ingredients in direct sales, physical holds, and customer-credit bills.
- Deducted exactly one configured serving per standalone quantity sold.
- Added visual standalone labels to restaurant recipe summaries.

### Changed

- Centralized restaurant sale preparation so normal sales and customer-credit issuance share item resolution, recipe expansion, stock requirements, and deductions.
- Extended physical held-order serialization to support both recipe menu items and standalone ingredient products.
- Updated register refresh behavior to invalidate customer, restaurant, inventory, stock, bill-history, session, sidebar, and overview data affected by each workflow.
- Updated editable permission definitions to include Customers while preserving view-only access behavior.
- Updated responsive layouts for register hold controls, restaurant tables, customer accounts, and register management.

### Database

- Added restaurant table storage, table-to-held-order assignment, seat validation, and a partial unique index for table occupancy.
- Added customer accounts and customer-credit bills with issued/settled shift attribution, payment linkage, status constraints, and supporting indexes.
- Added customer-credit references to inventory movements.
- Added Customers permission entries based on existing Registers permission levels.
- Added the standalone flag to restaurant menu ingredient records.
- Added matching deployment SQL files under both Prisma migrations and the repository migration mirror.

### Safety and business rules

- Credit-limit enforcement, inventory deduction, credit-bill creation, held-bill conversion, and audit logging execute in a serializable transaction.
- Credit settlement, Sale and Bill creation, account-state transition, and audit logging execute in a serializable transaction.
- Register type changes are blocked after operational data exists.
- Register deletion preserves all historical and operational records by permitting deletion only for unused registers.
- Closed shifts remain immutable; later customer-credit payments require a new open shift on the original register.

### Validation and testing

- Added validation for customer details, credit limits, credit settlement payment methods, restaurant tables, register editing, controlled menu categories, and standalone recipe ingredients.
- Added integration coverage for restaurant table occupancy and release.
- Added integration coverage for immediate customer-credit stock deduction, credit-limit blocking, later settlement, and prevention of duplicate stock movement.
- Added integration coverage for selling a checked restaurant ingredient independently using its configured serving size.
- Updated permission and form-validation unit coverage.
- Verified Prisma formatting, client generation, and schema validation.
- Verified ESLint, TypeScript, unit tests, integration-suite loading, staged diff integrity, and the production Next.js build.

### Deployment notes

- Apply migrations `20260817120000_restaurant_tables`, `20260817130000_customers_credit`, `20260817131000_customers_permissions`, and `20260817132000_standalone_menu_ingredients` before deploying the application code.
- Database-backed integration tests require a dedicated `TEST_NEON_DB`; production database fallback remains intentionally disabled.
