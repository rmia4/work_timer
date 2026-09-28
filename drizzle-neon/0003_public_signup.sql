ALTER TABLE "users" ADD COLUMN "access_code_lookup" text;
CREATE UNIQUE INDEX "users_access_code_lookup_unique" ON "users" USING btree ("access_code_lookup");
CREATE TABLE "signup_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"registered_at" bigint NOT NULL
);
