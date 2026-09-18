import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set before running Neon migrations.");
}

export default defineConfig({
  out: "./drizzle-neon",
  schema: "./db/schema.neon.ts",
  dialect: "postgresql",
  dbCredentials: { url: connectionString },
});
