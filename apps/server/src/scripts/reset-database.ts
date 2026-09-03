import { config as loadEnv } from "@dotenvx/dotenvx";
import { Pool } from "pg";

loadEnv({
  path: process.env.ZILOBASE_ENV_FILE ?? "../../.env.development",
  quiet: true,
  ignore: ["MISSING_ENV_FILE"],
  noOps: true,
});

const connectionString = getRequiredEnv("DATABASE_URL");

const pool = new Pool({ connectionString });

try {
  await pool.query("drop schema if exists public cascade");
  await pool.query("drop schema if exists drizzle cascade");
  await pool.query("create schema public");
  await pool.query("grant all on schema public to public");
  // Alternate runtimes may connect as zilobase_runtime; DROP SCHEMA drops table grants.
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zilobase_runtime') THEN
        GRANT ALL ON SCHEMA public TO zilobase_runtime;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
          GRANT ALL ON TABLES TO zilobase_runtime;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
          GRANT ALL ON SEQUENCES TO zilobase_runtime;
      END IF;
    END $$;
  `);
  console.info("Database schema reset.");
} finally {
  await pool.end();
}

function getRequiredEnv(key: string) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}
