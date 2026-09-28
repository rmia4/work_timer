import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const input = process.argv.slice(2).find((argument) => argument !== "--");
const connectionString = process.env.DATABASE_URL || process.env.DATABASE_URL_POOLED || process.env.CONNECTION_STRING;
if (!connectionString) throw new Error("DATABASE_URL, DATABASE_URL_POOLED, or CONNECTION_STRING is required");
if (!input) throw new Error("Usage: pnpm db:neon:import -- path/to/d1-export.json");

const raw = JSON.parse(await readFile(input, "utf8"));
const data = Array.isArray(raw) ? raw[0]?.results ?? {} : raw;
const sql = neon(connectionString);
const ownerId = "personal-workspace";
const tables = {
  tasks: ["id", "owner", "day", "title", "note", "result", "target", "elapsed", "started", "started_at", "ended_at", "status", "version", "created"],
  memos: ["id", "owner", "title", "body", "collapsed", "position", "version", "created", "updated"],
  daily_memos: ["id", "owner", "day", "title", "body", "position", "version", "created", "updated"],
};

const sourceOwners = new Set(
  Object.keys(tables).flatMap((table) =>
    (Array.isArray(data[table]) ? data[table] : [])
      .map((row) => row.owner)
      .filter((owner) => typeof owner === "string" && owner.length > 0),
  ),
);

if (sourceOwners.size > 1) {
  throw new Error(`Import stopped: ${sourceOwners.size} source owners were found. Provide an explicit user mapping.`);
}

await sql`
  INSERT INTO users (id, display_name, role, status, created, updated)
  VALUES (${ownerId}, '개인 작업공간', 'owner', 'active', 0, 0)
  ON CONFLICT (id) DO NOTHING
`;

for (const [table, allowedColumns] of Object.entries(tables)) {
  const rows = data[table] ?? [];
  if (!Array.isArray(rows) || rows.length === 0) continue;
  const columns = allowedColumns.filter((column) =>
    rows.some((row) => Object.hasOwn(row, column)),
  );
  const values = rows.flatMap((row) =>
    columns.map((column) =>
      column === "owner" ? ownerId : column === "collapsed" ? Boolean(row[column]) : row[column],
    ),
  );
  const tuples = rows.map((_, rowIndex) => {
    const placeholders = columns.map(
      (_, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`,
    );
    return `(${placeholders.join(", ")})`;
  });
  const statement = `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES ${tuples.join(", ")} ON CONFLICT DO NOTHING`;
  await sql.query(statement, values);
  console.log(`Imported ${rows.length} ${table} rows.`);
}

console.log("Authentication sessions and rate-limit counters were intentionally not imported.");
