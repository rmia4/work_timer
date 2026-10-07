ALTER TABLE "users" ADD COLUMN "username" text;
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree ("username");
ALTER TABLE "users" RENAME COLUMN "access_code_hash" TO "password_hash";
DROP INDEX "users_access_code_lookup_unique";
ALTER TABLE "users" DROP COLUMN "access_code_lookup";
