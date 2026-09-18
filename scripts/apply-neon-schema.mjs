import { readFile, readdir } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const sql = neon(process.env.DATABASE_URL);
await sql.query(`CREATE TABLE IF NOT EXISTS "_work_timer_migrations" (
  "name" text PRIMARY KEY NOT NULL,
  "applied_at" bigint NOT NULL
)`);

const appliedRows = await sql`SELECT name FROM _work_timer_migrations`;
const applied = new Set(appliedRows.map((row) => row.name));
const files = (await readdir("drizzle-neon"))
  .filter((name) => /^\d+.*\.sql$/.test(name))
  .sort();

if (!applied.has("0000_initial.sql")) {
  const [baseline] = await sql`SELECT to_regclass('public.users') IS NOT NULL AS exists`;
  if (baseline.exists) {
    await sql`INSERT INTO _work_timer_migrations (name, applied_at) VALUES ('0000_initial.sql', ${Date.now()})`;
    applied.add("0000_initial.sql");
  }
}

let appliedCount = 0;
for (const file of files) {
  if (applied.has(file)) continue;
  const source = await readFile(`drizzle-neon/${file}`, "utf8");
  const statements = source.split(/;\s*(?:\r?\n|$)/).map((value) => value.trim()).filter(Boolean);
  for (const statement of statements) await sql.query(statement);
  await sql`INSERT INTO _work_timer_migrations (name, applied_at) VALUES (${file}, ${Date.now()})`;
  appliedCount += 1;
}

console.log(`Applied ${appliedCount} Neon migrations.`);
