import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config as loadDotenvx } from "@dotenvx/dotenvx";

import {
  adapterDir,
  coreDir,
  envDir,
  generatedEnvironmentFiles,
  localProfiles,
  repoEnvironmentFiles,
  apiUrl,
  runtimeUrl,
} from "./config.mjs";

const templates = [
  [path.join(coreDir, ".env.development.example"), repoEnvironmentFiles.node],
  [path.join(adapterDir, ".env.development.example"), repoEnvironmentFiles.worker],
];
let legacyConflictsReported = false;
const optionalCredentialKeys = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "OPENAI_API_KEY",
  "TOOLKIT_API_KEY",
  "SLACK_CLIENT_ID",
  "SLACK_CLIENT_SECRET",
];

export async function ensureDevelopmentEnvironment(options = {}) {
  await mkdir(envDir, { recursive: true });
  for (const [template, destination] of templates) {
    if (await createFromTemplateIfMissing(template, destination)) {
      console.info(`Created ${path.relative(coreDir, destination)} from its template.`);
    }
  }

  const dependencies = await ensureGeneratedFile(
    generatedEnvironmentFiles.dependencies,
    () => ({
      POSTGRES_USER: "zilobase_dev",
      POSTGRES_PASSWORD: secret(32),
      POSTGRES_HOST_PORT: "15432",
      MINIO_ROOT_USER: "zilobase_dev",
      MINIO_ROOT_PASSWORD: secret(32),
      MINIO_API_PORT: "19100",
      MINIO_CONSOLE_PORT: "19101",
      MAILPIT_SMTP_PORT: "11025",
      MAILPIT_UI_PORT: "18025",
    }),
  );

  const nodeEnvironment = await ensureGeneratedFile(
    generatedEnvironmentFiles.node,
    () => profileEnvironment(localProfiles.node, dependencies),
  );
  const workerEnvironment = await ensureGeneratedFile(
    generatedEnvironmentFiles.worker,
    () => profileEnvironment(localProfiles.worker, dependencies),
  );
  await ensureGeneratedFile(generatedEnvironmentFiles.kubernetes, () => ({
    COMMUNITY_BETTER_AUTH_SECRET: secret(48),
    COMMUNITY_BOOTSTRAP_TOKEN: secret(48),
    COMMUNITY_POSTGRES_PASSWORD: secret(32),
    COMMUNITY_MINIO_PASSWORD: secret(32),
  }), { prune: true });
  await removeGeneratedOptionalCredentials();
  await migrateGeneratedPortDefaults();
  if (options.reportLegacy && !legacyConflictsReported) {
    await reportLegacyConflicts("node", nodeEnvironment);
    await reportLegacyConflicts("worker", workerEnvironment);
    legacyConflictsReported = true;
  }
}

export async function createFromTemplateIfMissing(template, destination) {
  if (!(await exists(template)) || (await exists(destination))) return false;
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(template, destination, constants.COPYFILE_EXCL);
  await chmod(destination, 0o600);
  return true;
}

export async function loadProfileEnvironment(name) {
  await ensureDevelopmentEnvironment();
  const target = {};
  const sourceFiles = [repoEnvironmentFiles[name], generatedEnvironmentFiles[name]]
    .filter(Boolean);
  loadDotenvx({
    path: sourceFiles,
    processEnv: target,
    overload: true,
    quiet: true,
    ignore: ["MISSING_ENV_FILE"],
    noOps: true,
  });
  return { ...target, ...process.env };
}

export async function loadGeneratedEnvironment(filename) {
  await ensureDevelopmentEnvironment();
  const target = {};
  loadDotenvx({
    path: filename,
    processEnv: target,
    overload: true,
    quiet: true,
    noOps: true,
  });
  return target;
}

export async function checkEnvironment() {
  await ensureDevelopmentEnvironment();
  const results = [];
  for (const name of ["node", "worker"]) {
    const env = await loadProfileEnvironment(name);
    const required = [
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "CLIENT_URL",
      "COLLABORATION_SECRET",
    ];
    const missing = required.filter((key) => !env[key]?.trim());
    results.push({ name, missing });
  }
  return results;
}

export function environmentFilesForEncryption() {
  return Object.entries(repoEnvironmentFiles).map(([name, filename]) => ({
    name,
    filename,
    plaintext: path.join(envDir, "decrypted", `${name}.env`),
  }));
}

function profileEnvironment(profile, dependencies) {
  const apiOrigin = apiUrl(profile);
  const clientOrigin = runtimeUrl(profile);
  const databaseUrl =
    `postgresql://${dependencies.POSTGRES_USER}:${dependencies.POSTGRES_PASSWORD}` +
    `@127.0.0.1:${dependencies.POSTGRES_HOST_PORT}/${profile.database}`;
  const common = {
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: secret(48),
    ZILOBASE_BOOTSTRAP_TOKEN: secret(48),
    COLLABORATION_SECRET: secret(48),
    BETTER_AUTH_URL: apiOrigin,
    CLIENT_URL: clientOrigin,
    ZILOBASE_CELL_ID: profile.cellId,
    ZILOBASE_DEMO_ENABLED: "true",
    DATABASE_AUTOMATIONS_ENABLED: "true",
    DATABASE_AUTOMATIONS_EXECUTION_DISABLED: "false",
    AUTOMATION_WEBHOOKS_ENABLED: "false",
    AUTOMATION_SLACK_ENABLED: "false",
    MAIL_ENABLED: "false",
    EMAIL_FROM: "Zilobase <hello@zilobase.local>",
    AI_DEV_TOOLS_ENABLED: "true",
    AI_AGENT_DAILY_USAGE_LIMITS_ENABLED: "false",
    ZILOBASE_OPERATIONS_TOKEN: secret(32),
    AI_PROVIDER_CREDENTIAL_ENCRYPTION_KEY: encryptionKey(),
    AUTOMATION_SECRET_ENCRYPTION_KEY: encryptionKey(),
  };

  if (profile.name === "worker") {
    return {
      ...common,
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: databaseUrl,
      ZILOBASE_ADAPTER_PORT: String(profile.apiPort),
      ZILOBASE_BACKGROUND_PORT: String(profile.backgroundPort),
      ZILOBASE_INSPECTOR_PORT: String(profile.inspectorPort),
      ZILOBASE_BACKGROUND_INSPECTOR_PORT: String(profile.backgroundInspectorPort),
    };
  }

  return {
    ...common,
    HOST: "0.0.0.0",
    PORT: String(profile.apiPort),
    BACKGROUND_HEALTH_PORT: "3001",
    IMAGE_STORAGE_MODE: "s3",
    S3_ENDPOINT: `http://127.0.0.1:${dependencies.MINIO_API_PORT}`,
    S3_PUBLIC_ENDPOINT: `http://127.0.0.1:${dependencies.MINIO_API_PORT}`,
    S3_BUCKET_NAME: profile.bucket,
    S3_ACCESS_KEY_ID: dependencies.MINIO_ROOT_USER,
    S3_SECRET_ACCESS_KEY: dependencies.MINIO_ROOT_PASSWORD,
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: dependencies.MAILPIT_SMTP_PORT,
    SMTP_SECURE: "false",
    SMTP_USER: "",
    SMTP_PASSWORD: "",
  };
}

async function ensureGeneratedFile(filename, values, options = {}) {
  const resolved = values();
  if (await exists(filename)) {
    const current = await readSimpleEnv(filename);
    const missing = Object.fromEntries(
      Object.entries(resolved).filter(([key]) => current[key] === undefined),
    );
    const next = options.prune
      ? Object.fromEntries(Object.keys(resolved).map((key) => [key, current[key] ?? resolved[key]]))
      : { ...current, ...missing };
    if (Object.keys(missing).length || Object.keys(next).length !== Object.keys(current).length) {
      await writeFile(filename, serializeEnv(next), { mode: 0o600 });
    }
    return next;
  }
  await writeFile(filename, serializeEnv(resolved), { flag: "wx", mode: 0o600 });
  console.info(`Generated private local state in ${path.relative(coreDir, filename)}.`);
  return resolved;
}

async function migrateGeneratedPortDefaults() {
  const replacements = new Map([
    ["54320", "15432"],
    ["9100", "19100"],
    ["9101", "19101"],
    ["8025", "18025"],
    ["1025", "11025"],
  ]);
  for (const filename of [
    generatedEnvironmentFiles.dependencies,
    generatedEnvironmentFiles.node,
    generatedEnvironmentFiles.worker,
  ]) {
    if (!(await exists(filename))) continue;
    const values = await readSimpleEnv(filename);
    let changed = false;
    if (
      filename === generatedEnvironmentFiles.dependencies &&
      !values.MAILPIT_SMTP_PORT
    ) {
      values.MAILPIT_SMTP_PORT = "11025";
      changed = true;
    }
    for (const [key, value] of Object.entries(values)) {
      let next = value;
      if (replacements.has(value)) next = replacements.get(value);
      if (key.endsWith("URL") || key.includes("CONNECTION_STRING") || key.endsWith("ENDPOINT")) {
        for (const [before, after] of replacements) {
          next = next.replaceAll(`:${before}`, `:${after}`);
        }
      }
      if (next !== value) {
        values[key] = next;
        changed = true;
      }
    }
    if (changed) await writeFile(filename, serializeEnv(values), { mode: 0o600 });
  }
}

async function removeGeneratedOptionalCredentials() {
  for (const filename of [generatedEnvironmentFiles.node, generatedEnvironmentFiles.worker]) {
    if (!(await exists(filename))) continue;
    const values = await readSimpleEnv(filename);
    let changed = false;
    for (const key of optionalCredentialKeys) {
      if (key in values) {
        delete values[key];
        changed = true;
      }
    }
    if (changed) await writeFile(filename, serializeEnv(values), { mode: 0o600 });
  }
}

async function reportLegacyConflicts(name, generated) {
  const filename = repoEnvironmentFiles[name];
  if (!(await exists(filename))) return;
  const legacy = await readSimpleEnv(filename);
  const conflicts = Object.keys(generated)
    .filter((key) => !optionalCredentialKeys.includes(key))
    .filter((key) => legacy[key] !== undefined && legacy[key] !== generated[key])
    .sort();
  if (conflicts.length) {
    console.warn(
      `Legacy ${path.relative(coreDir, filename)} values are ignored by the unified ` +
      `${name} profile: ${conflicts.join(", ")}. Shell overrides still win.`,
    );
  }
}

function serializeEnv(values) {
  return `${Object.entries(values)
    .map(([key, value]) => `${key}=${quoteEnv(String(value))}`)
    .join("\n")}\n`;
}

function quoteEnv(value) {
  return `"${value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n")}"`;
}

async function readSimpleEnv(filename) {
  const target = {};
  loadDotenvx({ path: filename, processEnv: target, quiet: true, noOps: true });
  return target;
}

function secret(bytes) {
  return randomBytes(bytes).toString("base64url");
}

function encryptionKey() {
  return randomBytes(32).toString("base64");
}

async function exists(filename) {
  try {
    await access(filename, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
