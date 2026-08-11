This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Copy the environment template and provide the Neon connection string and Better Auth settings:

```bash
cp .env.example .env
openssl rand -base64 32
```

Set the generated value as `BETTER_AUTH_SECRET`, then install dependencies, apply the database migrations, and start the development server:

```bash
bun install
bun run db:migrate
bun run db:seed
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The Better Auth handler is mounted at `/api/auth/*`. Unauthenticated workspace routes redirect to `/login`, which signs users in with email and password.

Useful database commands:

```bash
bun run db:generate
bun run db:migrate
bun run db:studio
```

## POS modules

The authenticated workspace is backed by Neon and includes:

- Inventory catalogue creation, search/filtering, stock metrics, and audited stock adjustments.
- Register-scoped stock counts and a filterable movement ledger for goods and portioned consumables.
- Registers with open/close shift controls and cash reconciliation.
- Transactional sale recording that creates receipt lines and inventory movements while preventing negative stock.
- An overview computed from live sales, product categories, and open register shifts.
- Site-admin-managed username accounts, configurable roles, and server-enforced page permissions.
- Append-only audit events with structured filters, indexed search, and cursor pagination.

Money is stored as integer laari (`1 MVR = 100 laari`) to keep calculations exact.

The POS DDL is kept in the [`migration`](migration) directory and mirrored in Prisma's migration history. Apply pending migrations with:

```bash
bunx prisma migrate deploy
```

Load the idempotent stock fixtures (three registers, goods, consumables, and movement history) with:

```bash
bun run db:seed
```

## Accounts and access

Public registration is disabled. After the authorization migration is deployed, the oldest existing account becomes the initial site administrator and every existing account receives the `Full Access` role. Site administrators create additional username/password accounts and roles from `/settings`.

New accounts sign in with their username. Existing accounts can continue signing in with their email address. Audit records are retained in the live database; no automatic purge or archive process is included yet.

Test schema migrations and database integration tests against an isolated Neon branch by setting `TEST_NEON_DB` before running `bun run test:integration`. The suite refuses to run against `NEON_DB` directly.

## Tests

Run the pure unit suite without a database:

```bash
bun run test:unit
```

For the integration suite, `TEST_NEON_DB` must point to an isolated Neon branch. The suite creates uniquely named records, verifies atomic sales and rollback behavior, and removes its records afterward:

```bash
bun run test:integration
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
