import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

type Row = Record<string, unknown>;
type Statement = NeonQueryFunction<false, false>;

const numericColumns = new Set([
  "attempts", "count", "created", "elapsed", "ended_at", "expires", "position", "registered_at", "running",
  "started", "started_at", "target", "total", "updated", "version", "window",
]);

function connectionString() {
  const url = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL || process.env.CONNECTION_STRING;
  if (!url) throw new Error("Set DATABASE_URL_POOLED, DATABASE_URL, or CONNECTION_STRING");
  return url;
}

function postgresSql(text: string) {
  let index = 0;
  return text
    .replace(/\?/g, () => `$${++index}`)
    .replace(/MAX\(0,\s*\$(\d+)-started\)/g, "GREATEST(0, $$$1-started)");
}

function normalize(row: Row): Row {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      numericColumns.has(key) && typeof value === "string" && /^-?\d+$/.test(value)
        ? Number(value)
        : value,
    ]),
  );
}

class PreparedStatement {
  constructor(
    private readonly sql: Statement,
    private readonly text: string,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new PreparedStatement(this.sql, this.text, values);
  }

  toQuery() {
    return this.sql.query(postgresSql(this.text), this.values);
  }

  private async query(text = this.text) {
    const rows = await this.sql.query(postgresSql(text), this.values);
    return (rows as unknown as Row[]).map((row) => normalize(row));
  }

  async all<T extends Row = Row>() {
    return { results: (await this.query()) as T[] };
  }

  async first<T extends Row = Row>() {
    return ((await this.query())[0] ?? null) as T | null;
  }

  async run() {
    const modifies = /^\s*(UPDATE|DELETE)\b/i.test(this.text);
    const rows = await this.query(
      modifies && !/\bRETURNING\b/i.test(this.text)
        ? `${this.text} RETURNING 1 AS _changed`
        : this.text,
    );
    return { meta: { changes: modifies ? rows.length : 1 } };
  }
}

export function database() {
  const sql = neon(connectionString());
  return {
    prepare: (text: string) => new PreparedStatement(sql, text),
    batch: async (statements: PreparedStatement[]) => {
      await sql.transaction(statements.map((statement) => statement.toQuery()));
    },
  };
}
