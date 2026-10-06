import { execFile, spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";

const exec = promisify(execFile);
const name = `zilobase-background-test-${randomUUID()}`;
let created = false;
let brokerCreated = false;
const broker = `${name}-queue`;
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
      await sleep(200);
    }
  }
  const { stdout } = await exec("docker", ["port", name, "5432/tcp"]);
  const endpoint = stdout.trim();
  if (!/^127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error("Unexpected fixture binding");
  const reservation = createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const brokerPort = reservation.address().port;
  await new Promise((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  await exec("docker", [
    "run",
    "--pull=never",
    "--rm",
    "--name",
    broker,
    "-p",
    `127.0.0.1:${brokerPort}:6379`,
    "-d",
    "valkey/valkey:8-alpine",
    "valkey-server",
    "--appendonly",
    "yes",
    "--maxmemory-policy",
    "noeviction",
  ]);
  brokerCreated = true;
  for (let attempt = 0; ; attempt++) {
    try {
      await exec("docker", ["exec", broker, "valkey-cli", "ping"]);
      break;
    } catch (error) {
      if (attempt >= 100) throw error;
      await sleep(200);
    }
  }
  const redisPort = await exec("docker", ["port", broker, "6379/tcp"]);
  const redisEndpoint = redisPort.stdout.trim();
  if (!/^127\.0\.0\.1:\d+$/.test(redisEndpoint))
    throw new Error("Unexpected Redis fixture binding");
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
        detached: true,
        env: {
          ...process.env,
          ZILOBASE_BACKGROUND_VERIFY_PROCESSOR_ONLY: process.argv.includes("--processor-only")
            ? "true"
            : "",
          ZILOBASE_BACKGROUND_VERIFY_SQL_ONLY:
            process.argv.includes("--sql-only") || process.argv.includes("--worker-sql-only")
              ? "true"
              : "",
          ZILOBASE_QUEUE_VERIFY_URL: `redis://${redisEndpoint}`,
          ZILOBASE_QUEUE_VERIFY_CONTAINER: broker,
          ZILOBASE_BACKGROUND_VERIFY_URL: `postgres://postgres:background-test-only@${endpoint}/zilobase_background_verify`,
        },
      },
    );
    const watchdog = setTimeout(() => {
      process.kill(-child.pid, "SIGKILL");
    }, 360_000);
    child.once("error", (error) => {
      clearTimeout(watchdog);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(watchdog);
      if (code === 0) resolve();
      else reject(new Error(`Dispatch verification exited ${code}`));
    });
  });
  if (!process.argv.includes("--sql-only")) {
    await new Promise((resolve, reject) => {
      const child = spawn(
        "npm",
        [
          "exec",
          "--workspace",
          "@zilobase/server",
          "--",
          "tsx",
          "src/scripts/verify-worker-queues.ts",
        ],
        {
          cwd: new URL("../../", import.meta.url),
          stdio: "inherit",
          timeout: 90_000,
          env: {
            ...process.env,
            ZILOBASE_BACKGROUND_VERIFY_URL: `postgres://postgres:background-test-only@${endpoint}/zilobase_background_verify`,
          },
        },
      );
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`Worker SQL verification exited ${code}`)),
      );
    });
  }
} finally {
  if (brokerCreated) await exec("docker", ["stop", "--time", "1", broker]);
  if (created) await exec("docker", ["stop", "--time", "1", name]);
}
