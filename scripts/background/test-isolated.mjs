import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { setTimeout } from "node:timers/promises";

const exec = promisify(execFile);
const name = `zilobase-background-test-${randomUUID()}`;
let created = false;
try {
  await exec("docker", [
    "run",
    "--pull=never",
    "--rm",
    "--name",
    name,
    "--tmpfs",
    "/var/lib/postgresql/data",
    "-e",
    "POSTGRES_PASSWORD=background-test-only",
    "-e",
    "POSTGRES_DB=zilobase_background_verify",
    "-p",
    "127.0.0.1::5432",
    "-d",
    "postgres:17.10-alpine",
  ]);
  created = true;
  for (let attempt = 0; ; attempt++) {
    try {
      await exec("docker", ["exec", name, "pg_isready", "-U", "postgres"]);
      break;
    } catch (error) {
      if (attempt >= 100) throw error;
      await setTimeout(200);
    }
  }
  const { stdout } = await exec("docker", ["port", name, "5432/tcp"]);
  const endpoint = stdout.trim();
  if (!/^127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error("Unexpected fixture binding");
  await new Promise((resolve, reject) => {
    const child = spawn(
      "npm",
      [
        "exec",
        "--workspace",
        "@zilobase/server",
        "--",
        "tsx",
        "src/scripts/verify-background-dispatch.ts",
      ],
      {
        cwd: new URL("../../", import.meta.url),
        stdio: "inherit",
        timeout: 120_000,
        env: {
          ...process.env,
          ZILOBASE_BACKGROUND_VERIFY_URL: `postgres://postgres:background-test-only@${endpoint}/zilobase_background_verify`,
        },
      },
    );
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Dispatch verification exited ${code}`)),
    );
  });
} finally {
  if (created) await exec("docker", ["stop", "--time", "1", name]);
}
