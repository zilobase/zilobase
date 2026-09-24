import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { loadProfileEnvironment } from "../dev/env.mjs";

const env = await loadProfileEnvironment("node");
const source = new URL(env.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(source.hostname))
  throw new Error("Mail integration tests require a local PostgreSQL server.");
const databaseName = `zilobase_mail_test_${randomUUID().replaceAll("-", "")}`;
const adminUrl = new URL(source);
adminUrl.pathname = "/postgres";
const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();
let pool;
try {
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  source.pathname = `/${databaseName}`;
  pool = new Pool({ connectionString: source.toString() });
  await migrate(drizzle(pool), { migrationsFolder: "apps/server/drizzle" });
  await pool.end();
  pool = null;
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      "npm",
      [
        "test",
        "--workspace",
        "@zilobase/server",
        "--",
        "src/features/mail/mail.integration.test.ts",
      ],
      {
        env: { ...process.env, MAIL_TEST_DATABASE_URL: source.toString() },
        stdio: "inherit",
      },
    );
    child.on("error", reject);
    child.on("exit", resolve);
  });
  process.exitCode = exitCode ?? 1;
} finally {
  if (pool) await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
}
