#!/usr/bin/env node

import { CookieJar, createApiClient } from "./api-conformance.mjs";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const projectName =
  process.env.ZILOBASE_SELFHOST_PROJECT_NAME ||
  `zilobase-selfhost-test-${process.pid}-${Date.now()}`;
const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "zilobase-selfhost-"));
const envFile = path.resolve(
  process.env.ZILOBASE_SELFHOST_ENV_FILE || path.join(tempDirectory, "selfhost.env"),
);
const diagnosticsDirectory = process.env.ZILOBASE_SELFHOST_DIAGNOSTICS_DIR
  ? path.resolve(process.env.ZILOBASE_SELFHOST_DIAGNOSTICS_DIR)
  : null;
const noBuild = process.argv.includes("--no-build");
let bootstrapToken = "";
const password = `Test-${secret(18)}`;
const ownerEmail = `owner-${Date.now()}@zilobase.local`;
const inviteEmail = `invite-${Date.now()}@zilobase.local`;
const httpPort = Number(process.env.ZILOBASE_DEV_HTTP_PORT || (await getFreePort()));
const minioPort = Number(process.env.MINIO_DEV_API_PORT || (await getFreePort()));
const mailpitPort = Number(process.env.MAILPIT_DEV_UI_PORT || (await getFreePort()));
const serverOrigin = `http://127.0.0.1:${httpPort}`;
const mailpitOrigin = `http://127.0.0.1:${mailpitPort}`;
const api = createApiClient({ internalOrigin: serverOrigin });
let resetCompleted = false;

try {
  console.info("Checking that production Compose rejects missing secrets...");
  const missingSecrets = await capture(
    "docker",
    ["compose", "--env-file", "/dev/null", "-f", "docker-compose.yml", "config"],
    { env: scrubSelfhostEnvironment(process.env) },
  );
  assert.notEqual(missingSecrets.code, 0, "production Compose accepted missing secrets");

  console.info("Starting a fresh isolated self-hosted stack...");
  await mkdir(path.dirname(envFile), { recursive: true });
  await selfhost("up", ...(noBuild ? ["--no-build"] : []));
  const generatedEnvironment = parseEnv(await readFile(envFile, "utf8"));
  bootstrapToken = generatedEnvironment.ZILOBASE_BOOTSTRAP_TOKEN;
  assert.ok(bootstrapToken?.length >= 32);
  assert.ok(generatedEnvironment.BETTER_AUTH_SECRET?.length >= 32);
  assert.equal((await stat(envFile)).mode & 0o777, 0o600);

  const ready = await fetch(`${serverOrigin}/ready`);
  assert.equal(ready.status, 200);
  const initialDiscovery = await api.getJson("/.well-known/zilobase");
  assert.equal(initialDiscovery.apiOrigin, serverOrigin);

  const bootstrap = await api.bootstrapInstance({
    bootstrapToken,
    email: ownerEmail,
    name: "Self-host Test Owner",
    password,
    workspaceName: "Self-host Test Workspace",
  });
  assert.equal(bootstrap.data.registrationMode, "invite-only");

  const jar = new CookieJar();
  await api.signIn({ email: ownerEmail, jar, password });

  console.info("Exchanging a browser consent code through PKCE...");
  const desktopSession = await api.createDesktopSession(jar, { checkReplay: true });
  assert.equal(desktopSession.instance_id, initialDiscovery.instanceId);

  console.info("Checking page CRUD and authenticated collaboration WebSockets...");
  const pageId = await api.createPage(jar, {
    name: "Self-host deployment probe",
    workspaceId: bootstrap.data.workspaceId,
  });
  await api.renamePage(jar, pageId, "Self-host deployment probe updated");
  const collaborationTicket = await api.collaborationTicket(jar, pageId);
  await api.openCollaborationSocket({
    accessToken: desktopSession.access_token,
    websocketUrl: collaborationTicket.websocketUrl,
  });

  console.info("Checking Mailpit OTP and invitation delivery...");
  const otpRequest = await api.requestJson("/api/auth/email-otp/send-verification-otp", {
    body: { email: ownerEmail, type: "sign-in" },
    method: "POST",
  });
  assert.equal(otpRequest.response.status, 200);
  const otpMessage = await waitForMessage(ownerEmail);
  assert.match(otpMessage, /\b\d{6}\b/);

  const invitation = await api.requestJson("/api/auth/workspace/invite-member", {
    body: {
      email: inviteEmail,
      role: "member",
      workspaceId: bootstrap.data.workspaceId,
    },
    jar,
    method: "POST",
  });
  assert.equal(invitation.response.status, 200);
  const invitationMessage = await waitForMessage(inviteEmail);
  assert.match(invitationMessage, /accept-invitation/i);

  console.info("Uploading and reading an object-storage profile image...");
  const { imagePath, uploadUrl } = await api.uploadProfileImage(jar, {
    filename: "selfhost-test.png",
  });
  assert.equal(
    new URL(uploadUrl).origin,
    `http://127.0.0.1:${minioPort}`,
    "the upload URL did not point at the bundled object store",
  );
  api.assertProbeImage(await api.readProfileImage({ cookie: jar.header(), imagePath }));

  const uid = await captureCompose([
    "exec",
    "-T",
    "zilobase",
    "node",
    "-e",
    "process.stdout.write(String(process.getuid?.()))",
  ]);
  assert.equal(uid.code, 0);
  assert.notEqual(uid.stdout.trim(), "0", "application container is running as root");

  console.info("Restarting through selfhost:down/up to verify volume persistence...");
  await selfhost("down");
  const databaseVolume = `${projectName}_postgres_data`;
  const preservedVolume = await capture("docker", ["volume", "inspect", databaseVolume]);
  assert.equal(preservedVolume.code, 0, "selfhost:down removed the database volume");
  await selfhost("up", ...(noBuild ? ["--no-build"] : []));

  const discoveryAfterRestart = await api.getJson("/.well-known/zilobase");
  assert.equal(discoveryAfterRestart.instanceId, initialDiscovery.instanceId);
  const restartJar = new CookieJar();
  await api.signIn({ email: ownerEmail, jar: restartJar, password });
  api.assertProbeImage(await api.readProfileImage({ cookie: restartJar.header(), imagePath }));

  const persistedPage = await api.readPage(restartJar.header(), pageId);
  assert.equal(persistedPage.name, "Self-host deployment probe updated");

  console.info("Backing up and restoring Postgres and object storage into clean volumes...");
  const backupDirectory = path.join(tempDirectory, "backup");
  const objectBackupDirectory = path.join(backupDirectory, "objects");
  const databaseBackup = path.join(backupDirectory, "postgres.dump");
  await mkdir(objectBackupDirectory, { recursive: true });
  await captureComposeToFile(
    ["exec", "-T", "postgres", "pg_dump", "-U", "zilobase", "-d", "zilobase", "--format=custom"],
    databaseBackup,
  );
  await mirrorObjectStorage("backup", objectBackupDirectory);

  await selfhost("reset", "--yes");
  await selfhost("up", ...(noBuild ? ["--no-build"] : []));
  await captureCompose(["stop", "zilobase"]);
  const postgresContainer = await captureCompose(["ps", "-q", "postgres"]);
  assert.equal(postgresContainer.code, 0);
  assert.ok(postgresContainer.stdout.trim());
  const copyDump = await capture("docker", [
    "cp",
    databaseBackup,
    `${postgresContainer.stdout.trim()}:/tmp/zilobase-selfhost-restore.dump`,
  ]);
  assert.equal(copyDump.code, 0, copyDump.stderr);
  const restoreDatabase = await captureCompose([
    "exec",
    "-T",
    "postgres",
    "pg_restore",
    "-U",
    "zilobase",
    "-d",
    "zilobase",
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "/tmp/zilobase-selfhost-restore.dump",
  ]);
  assert.equal(restoreDatabase.code, 0, restoreDatabase.stderr);
  await mirrorObjectStorage("restore", objectBackupDirectory);
  const resumed = await captureCompose(["up", "-d", "--no-build", "--wait"]);
  assert.equal(resumed.code, 0, resumed.stderr);

  const restoredDiscovery = await api.getJson("/.well-known/zilobase");
  assert.equal(restoredDiscovery.instanceId, initialDiscovery.instanceId);
  const restoredJar = new CookieJar();
  await api.signIn({ email: ownerEmail, jar: restoredJar, password });
  const restoredPage = await api.readPage(restoredJar.header(), pageId);
  assert.equal(restoredPage.name, "Self-host deployment probe updated");
  api.assertProbeImage(await api.readProfileImage({ cookie: restoredJar.header(), imagePath }));

  console.info("Running the explicitly destructive selfhost:reset path...");
  await selfhost("reset", "--yes");
  resetCompleted = true;
  const removedVolume = await capture("docker", ["volume", "inspect", databaseVolume]);
  assert.notEqual(removedVolume.code, 0, "selfhost:reset preserved the database volume");

  console.info("Self-host integration test passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  const logs = await captureCompose(["logs", "--no-color", "--tail", "200"]);
  if (logs.stdout) console.error(sanitize(logs.stdout));
  if (logs.stderr) console.error(sanitize(logs.stderr));
  if (diagnosticsDirectory) {
    await mkdir(diagnosticsDirectory, { recursive: true });
    const status = await captureCompose(["ps", "--all"]);
    await writeFile(
      path.join(diagnosticsDirectory, "selfhost.log"),
      sanitize(
        [
          `failure: ${error instanceof Error ? error.message : String(error)}`,
          status.stdout,
          status.stderr,
          logs.stdout,
          logs.stderr,
        ].join("\n"),
      ),
      { mode: 0o600 },
    );
  }
  process.exitCode = 1;
} finally {
  if (!resetCompleted) {
    await captureCompose(["down", "--volumes", "--remove-orphans"]);
  }
  await rm(tempDirectory, { force: true, recursive: true });
}

async function selfhost(...args) {
  return run(process.execPath, ["scripts/selfhost/manage.mjs", ...args], {
    env: {
      ...process.env,
      ZILOBASE_SELFHOST_ENV_FILE: envFile,
      ZILOBASE_SELFHOST_PROJECT_NAME: projectName,
      ZILOBASE_DEV_HTTP_PORT: String(httpPort),
      MINIO_DEV_API_PORT: String(minioPort),
      MAILPIT_DEV_UI_PORT: String(mailpitPort),
      ZILOBASE_SELFHOST_IMAGE: process.env.ZILOBASE_SELFHOST_IMAGE || "",
      ZILOBASE_SELFHOST_PULL_POLICY: process.env.ZILOBASE_SELFHOST_PULL_POLICY || "never",
    },
  });
}

function composeArguments(args) {
  return [
    "compose",
    "--project-name",
    projectName,
    "--env-file",
    envFile,
    "-f",
    "docker-compose.yml",
    "-f",
    "docker-compose.dev.yml",
    "--profile",
    "dev",
    ...args,
  ];
}

function captureCompose(args) {
  return capture("docker", composeArguments(args));
}

async function waitForMessage(recipient) {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const response = await fetch(`${mailpitOrigin}/api/v1/messages`);
    if (response.ok) {
      const mailbox = await response.json();
      const messages = Array.isArray(mailbox.messages) ? mailbox.messages : [];
      const match = messages.find((message) =>
        JSON.stringify(message).toLowerCase().includes(recipient.toLowerCase()),
      );
      const id = match?.ID ?? match?.Id ?? match?.id;

      if (id) {
        const detail = await fetch(`${mailpitOrigin}/api/v1/message/${encodeURIComponent(id)}`);
        if (detail.ok) return JSON.stringify(await detail.json());
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Mailpit did not receive the expected message for ${recipient}`);
}

async function mirrorObjectStorage(direction, localDirectory) {
  const image = "rustfs/rc:v0.1.36";
  const backupOwner =
    typeof process.getuid === "function" && typeof process.getgid === "function"
      ? `${process.getuid()}:${process.getgid()}`
      : null;
  const normalizeBackupOwnership = backupOwner ? ' && chown -R "$BACKUP_OWNER" /backup' : "";
  const script =
    direction === "backup"
      ? `rc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && rc mirror --overwrite "local/$MINIO_BUCKET" /backup${normalizeBackupOwnership}`
      : 'rc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && rc mirror --overwrite /backup "local/$MINIO_BUCKET"';
  const result = await capture("docker", [
    "run",
    "--rm",
    // The rc image declares USER rc (uid 100), which cannot write into a backup
    // directory owned by the invoking user, so mirror as root and hand ownership
    // back afterwards.
    "--user",
    "0:0",
    "--network",
    `${projectName}_default`,
    "--env-file",
    envFile,
    ...(backupOwner ? ["--env", `BACKUP_OWNER=${backupOwner}`] : []),
    "--volume",
    `${localDirectory}:/backup${direction === "restore" ? ":ro" : ""}`,
    "--entrypoint",
    "/bin/sh",
    image,
    "-c",
    script,
  ]);
  assert.equal(result.code, 0, result.stderr);
}

function captureComposeToFile(args, filename) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(filename, { mode: 0o600 });
    const child = spawn("docker", composeArguments(args), {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let exitCode = null;
    let outputClosed = false;
    const finish = () => {
      if (exitCode === null || !outputClosed) return;
      if (exitCode === 0) resolve();
      else reject(new Error(`database backup failed: ${stderr}`));
    };
    child.stdout.pipe(output);
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      exitCode = code ?? -1;
      finish();
    });
    output.once("close", () => {
      outputClosed = true;
      finish();
    });
    output.once("error", reject);
  });
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => (error || port === null ? reject(error) : resolve(port)));
    });
  });
}

function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: repositoryRoot,
      stdio: "inherit",
      ...options,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${executable} exited with ${signal || code}`));
    });
  });
}

function capture(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: repositoryRoot,
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stderr, stdout }));
  });
}

function scrubSelfhostEnvironment(environment) {
  const next = { ...environment };
  for (const key of [
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "CLIENT_URL",
    "EMAIL_FROM",
    "MINIO_BUCKET",
    "MINIO_ROOT_PASSWORD",
    "MINIO_ROOT_USER",
    "POSTGRES_DB",
    "POSTGRES_PASSWORD",
    "POSTGRES_USER",
    "S3_PUBLIC_ENDPOINT",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "ZILOBASE_BOOTSTRAP_TOKEN",
    "ZILOBASE_IMAGE",
    "ZILOBASE_SITE_ADDRESS",
    "ZILOBASE_STORAGE_SITE_ADDRESS",
  ])
    delete next[key];
  return next;
}

function parseEnv(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function sanitize(value) {
  const redacted = bootstrapToken ? value.replaceAll(bootstrapToken, "[REDACTED]") : value;

  return redacted
    .replaceAll(password, "[REDACTED]")
    .replace(/([?&](?:X-Amz-[^=]+|x-id)=[^&\s]+)/gi, "[SIGNED_QUERY_REDACTED]");
}

function secret(bytes) {
  return randomBytes(bytes).toString("base64url");
}
