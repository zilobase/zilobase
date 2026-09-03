import { config as loadEnv } from "@dotenvx/dotenvx";
import { defineConfig } from "drizzle-kit";

loadEnv({
  path: process.env.ZILOBASE_ENV_FILE ?? "../../.env.development",
  quiet: true,
  ignore: ["MISSING_ENV_FILE"],
  noOps: true,
});

export default defineConfig({
  schema: "./src/infrastructure/database/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/zilobase",
  },
});
