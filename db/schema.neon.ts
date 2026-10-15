import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

const epoch = (name: string) => bigint(name, { mode: "number" });

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email"),
    username: text("username"),
    passwordHash: text("password_hash"),
    displayName: text("display_name").notNull().default(""),
    role: text("role").notNull().default("user"),
    status: text("status").notNull().default("active"),
    layout: text("layout").notNull().default("default"),
    created: epoch("created").notNull(),
    updated: epoch("updated").notNull(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_username_unique").on(table.username),
  ],
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

export const taskSessions = pgTable(
  "task_sessions",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    owner: text("owner")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startAt: epoch("start_at").notNull(),
    endAt: epoch("end_at"),
  },
  (table) => [index("task_sessions_task").on(table.taskId)],
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

export const signupLimits = pgTable("signup_limits", {
  id: text("id").primaryKey(),
  registeredAt: epoch("registered_at").notNull(),
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
    collapsed: boolean("collapsed").notNull().default(false),
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

// MCP 연동용 OAuth 2.1. 토큰과 인가 코드는 SHA-256 해시만 저장한다.
export const oauthClients = pgTable("oauth_clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  redirectUris: text("redirect_uris").notNull(),
  // CIMD 클라이언트의 문서 캐시 만료 시각. DCR 클라이언트는 null.
  refreshAfter: epoch("refresh_after"),
  created: epoch("created").notNull(),
});

export const oauthGrants = pgTable(
  "oauth_grants",
  {
    id: text("id").primaryKey(),
    owner: text("owner")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    created: epoch("created").notNull(),
    lastUsed: epoch("last_used"),
    revoked: epoch("revoked"),
  },
  (table) => [index("oauth_grants_owner").on(table.owner)],
);

export const oauthCodes = pgTable("oauth_codes", {
  codeHash: text("code_hash").primaryKey(),
  grantId: text("grant_id")
    .notNull()
    .references(() => oauthGrants.id, { onDelete: "cascade" }),
  codeChallenge: text("code_challenge").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  resource: text("resource").notNull(),
  expires: epoch("expires").notNull(),
});

export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    grantId: text("grant_id")
      .notNull()
      .references(() => oauthGrants.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    expires: epoch("expires").notNull(),
    used: epoch("used"),
  },
  (table) => [index("oauth_tokens_grant").on(table.grantId)],
);
