import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const sql = neon(process.env.DATABASE_URL);
const source = await readFile("drizzle-neon/0000_initial.sql", "utf8");
const statements = source.split(/;\s*(?:\r?\n|$)/).map((value) => value.trim()).filter(Boolean);

for (const statement of statements) await sql.query(statement);

console.log(`Applied ${statements.length} Neon schema statements.`);
