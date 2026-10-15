CREATE TABLE "oauth_clients" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "redirect_uris" text NOT NULL,
  "refresh_after" bigint,
  "created" bigint NOT NULL
);
CREATE TABLE "oauth_grants" (
  "id" text PRIMARY KEY NOT NULL,
  "owner" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "client_id" text NOT NULL REFERENCES "oauth_clients"("id") ON DELETE cascade,
  "scope" text NOT NULL,
  "created" bigint NOT NULL,
  "last_used" bigint,
  "revoked" bigint
);
CREATE INDEX "oauth_grants_owner" ON "oauth_grants" ("owner");
CREATE TABLE "oauth_codes" (
  "code_hash" text PRIMARY KEY NOT NULL,
  "grant_id" text NOT NULL REFERENCES "oauth_grants"("id") ON DELETE cascade,
  "code_challenge" text NOT NULL,
  "redirect_uri" text NOT NULL,
  "resource" text NOT NULL,
  "expires" bigint NOT NULL
);
CREATE TABLE "oauth_tokens" (
  "token_hash" text PRIMARY KEY NOT NULL,
  "grant_id" text NOT NULL REFERENCES "oauth_grants"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "expires" bigint NOT NULL,
  "used" bigint
);
CREATE INDEX "oauth_tokens_grant" ON "oauth_tokens" ("grant_id");
