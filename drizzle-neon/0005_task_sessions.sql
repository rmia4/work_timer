CREATE TABLE "task_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "task_id" text NOT NULL REFERENCES "tasks"("id") ON DELETE cascade,
  "owner" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "start_at" bigint NOT NULL,
  "end_at" bigint
);
CREATE INDEX "task_sessions_task" ON "task_sessions" USING btree ("task_id");
