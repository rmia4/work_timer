import { sql } from "drizzle-orm";
import { bigint, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

const epoch = (name: string) => bigint(name, { mode: "number" });

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email"),
    displayName: text("display_name").notNull().default(""),
    role: text("role").notNull().default("user"),
    status: text("status").notNull().default("active"),
    created: epoch("created").notNull(),
    updated: epoch("updated").notNull(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    owner: text("owner")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    title: text("title").notNull(),
    note: text("note").notNull().default(""),
    result: text("result").notNull().default(""),
    target: epoch("target").notNull().default(0),
    elapsed: epoch("elapsed").notNull().default(0),
    started: epoch("started"),
    startedAt: epoch("started_at"),
    endedAt: epoch("ended_at"),
    status: text("status").notNull().default("done"),
    version: integer("version").notNull().default(0),
    created: epoch("created").notNull(),
  },
  (table) => [
    index("tasks_owner_day").on(table.owner, table.day),
    uniqueIndex("tasks_one_active")
      .on(table.owner)
      .where(sql`${table.status} <> 'done'`),
  ],
);

export const codeSessions = pgTable(
  "code_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    owner: text("owner")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: epoch("expires").notNull(),
  },
  (table) => [index("code_sessions_expiry").on(table.expires)],
);

export const codeLimits = pgTable("code_limits", {
  id: text("id").primaryKey(),
  window: epoch("window").notNull(),
  attempts: integer("attempts").notNull(),
});

export const memos = pgTable(
  "memos",
  {
    id: text("id").primaryKey(),
    owner: text("owner")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    position: epoch("position").notNull(),
    version: integer("version").notNull().default(0),
    created: epoch("created").notNull(),
    updated: epoch("updated").notNull(),
  },
  (table) => [index("memos_owner_position").on(table.owner, table.position)],
);

export const dailyMemos = pgTable(
  "daily_memos",
  {
    id: text("id").primaryKey(),
    owner: text("owner")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    position: epoch("position").notNull(),
    version: integer("version").notNull().default(0),
    created: epoch("created").notNull(),
    updated: epoch("updated").notNull(),
  },
  (table) => [
    index("daily_memos_owner_day_position").on(table.owner, table.day, table.position),
  ],
);
