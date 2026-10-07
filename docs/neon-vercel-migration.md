# Neon and Vercel migration

## Prepared files

- `.env.example`: server-only environment variable names.
- `db/schema.neon.ts`: PostgreSQL schema with a `users` ownership root.
- `drizzle-neon/0000_initial.sql`: initial Neon schema. It is for a new, empty Neon branch.
- `scripts/apply-neon-schema.mjs`: applies the initial schema using `DATABASE_URL`.
- `scripts/import-d1-export.mjs`: imports a JSON export grouped by table name.
- `drizzle.neon.config.ts`: Drizzle configuration that reads only `DATABASE_URL`.

## Required before running the migration

1. Rotate the exposed Neon database password and obtain new URLs.
2. Store the direct URL as `DATABASE_URL` and the pooler URL as `DATABASE_URL_POOLED` in local environment variables. Do not commit either value.
3. Apply the empty Neon schema with `pnpm db:neon:apply`.
4. Export D1 as JSON with `tasks`, `memos`, and `daily_memos` arrays, then import it with `pnpm db:neon:import -- path/to/d1-export.json`.
5. Set `users.username` and store the existing PBKDF2 password hash in `users.password_hash`, then set `DATABASE_URL_POOLED` and `APP_ORIGIN` in Vercel.
6. Connect Vercel to GitHub `main`.

## Safety

Do not apply `drizzle-neon/0000_initial.sql` to a database containing existing Work Timer tables. It creates the full schema for a fresh Neon database.

The importer assigns the single existing D1 owner to the seeded `personal-workspace` user. It stops if the export contains more than one owner. Old sessions and rate-limit counters are not migrated.
