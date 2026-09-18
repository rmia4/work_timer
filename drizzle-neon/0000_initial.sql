CREATE TABLE "tasks" (
  "id" text PRIMARY KEY NOT NULL,
  "owner" text NOT NULL,
  "day" text NOT NULL,
  "title" text NOT NULL,
  "note" text NOT NULL DEFAULT '',
  "result" text NOT NULL DEFAULT '',
  "target" bigint NOT NULL DEFAULT 0,
  "elapsed" bigint NOT NULL DEFAULT 0,
  "started" bigint,
  "started_at" bigint,
  "ended_at" bigint,
  "status" text NOT NULL DEFAULT 'done',
  "version" integer NOT NULL DEFAULT 0,
  "created" bigint NOT NULL
);
CREATE INDEX "tasks_owner_day" ON "tasks" ("owner", "day");
CREATE UNIQUE INDEX "tasks_one_active" ON "tasks" ("owner") WHERE "status" <> 'done';

CREATE TABLE "code_limits" (
  "id" text PRIMARY KEY NOT NULL,
  "window" bigint NOT NULL,
  "attempts" integer NOT NULL
);
CREATE TABLE "code_sessions" (
  "token_hash" text PRIMARY KEY NOT NULL,
  "owner" text NOT NULL,
  "expires" bigint NOT NULL
);
CREATE INDEX "code_sessions_expiry" ON "code_sessions" ("expires");

CREATE TABLE "memos" (
  "id" text PRIMARY KEY NOT NULL,
  "owner" text NOT NULL,
  "title" text NOT NULL DEFAULT '',
  "body" text NOT NULL DEFAULT '',
  "position" bigint NOT NULL,
  "version" integer NOT NULL DEFAULT 0,
  "created" bigint NOT NULL,
  "updated" bigint NOT NULL
);
CREATE INDEX "memos_owner_position" ON "memos" ("owner", "position");

CREATE TABLE "daily_memos" (
  "id" text PRIMARY KEY NOT NULL,
  "owner" text NOT NULL,
  "day" text NOT NULL,
  "title" text NOT NULL DEFAULT '',
  "body" text NOT NULL DEFAULT '',
  "position" bigint NOT NULL,
  "version" integer NOT NULL DEFAULT 0,
  "created" bigint NOT NULL,
  "updated" bigint NOT NULL
);
CREATE INDEX "daily_memos_owner_day_position" ON "daily_memos" ("owner", "day", "position");
