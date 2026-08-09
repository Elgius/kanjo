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
- Registers with open/close shift controls and cash reconciliation.
- Transactional sale recording that creates receipt lines and inventory movements while preventing negative stock.
- An overview computed from live sales, product categories, and open register shifts.

Money is stored as integer laari (`1 MVR = 100 laari`) to keep calculations exact.

The POS DDL is kept in [`migration/001_pos_modules.sql`](migration/001_pos_modules.sql) and mirrored in Prisma's migration history. Apply pending migrations with:

```bash
bunx prisma migrate deploy
```

## Tests

Run the pure unit suite without a database:

```bash
bun run test:unit
```

For the integration suite, set `TEST_NEON_DB` to an isolated Neon branch when possible. The suite creates uniquely named records, verifies atomic sales and rollback behavior, and removes its records afterward:

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
