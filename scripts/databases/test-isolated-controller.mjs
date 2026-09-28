import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { setTimeout } from "node:timers/promises";

const exec = promisify(execFile);
const root = new URL("../../", import.meta.url);
const name = `zilobase-controller-test-${randomUUID()}`;
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
    "POSTGRES_PASSWORD=controller-test-only",
    "-e",
    "POSTGRES_DB=zilobase_controller_verify",
    "-p",
    "127.0.0.1::5432",
    "-d",
    "postgres:17.10-alpine",
  ]);
  created = true;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await exec("docker", [
        "exec",
        name,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "postgres",
        "-d",
        "zilobase_controller_verify",
      ]);
      ready = true;
      break;
    } catch {
      await setTimeout(200);
    }
  }
  if (!ready) throw new Error("Isolated PostgreSQL did not become ready");
  const { stdout } = await exec("docker", ["port", name, "5432/tcp"]);
  const endpoint = stdout.trim();
  if (!/^127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error("Unexpected isolated database binding");
  await new Promise((resolve, reject) => {
    const child = spawn(
      "npm",
      ["run", "test:databases:persistence", "--workspace", "@zilobase/server"],
      {
        cwd: root,
        stdio: "inherit",
        timeout: 120_000,
        env: {
          ...process.env,
          ZILOBASE_CONTROLLER_VERIFY_URL: `postgres://postgres:controller-test-only@${endpoint}/zilobase_controller_verify`,
        },
      },
    );
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Controller persistence verification exited ${code}`)),
    );
  });
} finally {
  if (created) {
    await exec("docker", ["stop", "--time", "1", name]);
    console.info(
      "Removed the isolated test container and its temporary database; development data was untouched.",
    );
  }
}
