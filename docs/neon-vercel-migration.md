# Neon and Vercel migration

## Prepared files

- `.env.example`: server-only environment variable names.
- `db/schema.neon.ts`: PostgreSQL representation of the current D1 schema.
- `drizzle-neon/0000_initial.sql`: initial Neon schema. It is for a new, empty Neon branch.
- `drizzle.neon.config.ts`: Drizzle configuration that reads only `DATABASE_URL`.
- `neon.ts`: Neon configuration entry point.

## Required before running the migration

1. Rotate the exposed Neon database password and obtain new URLs.
2. Store the direct URL as `DATABASE_URL` and the pooler URL as `DATABASE_URL_POOLED` in local environment variables. Do not commit either value.
3. Replace the Cloudflare D1 runtime adapter and API queries with a PostgreSQL adapter.
4. Export the D1 tables, import them into Neon, and verify row counts.
5. Set `DATABASE_URL_POOLED`, `ACCESS_CODE_HASH`, and `APP_ORIGIN` in Vercel.
6. Move the app build from the Cloudflare/Vinext runtime to the Vercel Node runtime, then connect Vercel to GitHub `main`.

## Safety

Do not apply `drizzle-neon/0000_initial.sql` to a database containing existing Work Timer tables. It creates the full schema for a fresh Neon database.
