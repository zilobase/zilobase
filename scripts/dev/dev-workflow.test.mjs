import { applyPublicDevelopmentOrigin } from "./public-origin.mjs";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { config as loadDotenvx, parse } from "@dotenvx/dotenvx";

import { coreDir, localProfiles } from "./config.mjs";
import {
  developmentDashboardModel,
  renderDevelopmentDashboard,
  startDevelopmentDashboard,
} from "./dashboard.mjs";
import {
  createFromTemplateIfMissing,
  migrateGeneratedNodeEnvironment,
  migrateGeneratedMailEnvironment,
  profileEnvironment,
} from "./env.mjs";
import {
  databaseResetStatements,
  effectiveProfile,
  nodeApiArguments,
  resolveLocalProfileNames,
  resolveStudioServices,
  runtimeEnvironment,
  resetLocal,
  studioBrowserUrl,
  webCacheDirectory,
} from "./local.mjs";
import { assertPortsAvailable, redact, stopChildren } from "./process.mjs";
import {
  DEVELOPMENT_PROVIDER_FILE,
  discoverDevelopmentProviders,
  validateDevelopmentProvider,
} from "./providers.mjs";

test("the Node profile uses stable local ports and identity", () => {
  const node = localProfiles.node;
  const ports = [
    node.appPort,
    node.apiPort,
    node.healthPort,
    node.inspectorPort,
    node.studioPort,
  ];
  assert.equal(new Set(ports).size, ports.length);
  assert.equal(node.appHost, "localhost");
  assert.equal(node.apiHost, "localhost");
  assert.equal(node.database, "zilobase_node");
  assert.equal(node.cellId, "local-node");
});

test("the Node profile disables demo seeding", () => {
  const dependencies = {
    MAILPIT_SMTP_PORT: "11025",
    MINIO_API_PORT: "19100",
    MINIO_ROOT_PASSWORD: "minio-password",
    MINIO_ROOT_USER: "minio-user",
    POSTGRES_HOST_PORT: "15432",
    POSTGRES_PASSWORD: "postgres-password",
    POSTGRES_USER: "postgres-user",
  };

  assert.equal(
    profileEnvironment(localProfiles.node, dependencies).ZILOBASE_DEMO_ENABLED,
    "false",
  );
  assert.equal(
    profileEnvironment(localProfiles.node, dependencies).MEETING_BLOCK_ENABLED,
    "true",
  );
});

test("local Node API watches server, database client, and migration changes", () => {
  const args = nodeApiArguments(localProfiles.node);

  assert.ok(args.some((argument) => argument.endsWith("tsx/dist/cli.mjs")));
  assert.ok(args.includes("watch"));
  assert.ok(args.includes("drizzle/**/*.sql"));
  assert.ok(args.includes("../../packages/features/src/databases/**/*.ts"));
  assert.equal(args.at(-1), "src/entrypoints/serverful.ts");
});

test("development database commands use the journal-aware migration runner", async () => {
  const serverPackage = JSON.parse(
    await readFile(path.join(coreDir, "apps/server/package.json"), "utf8"),
  );

  assert.match(serverPackage.scripts["db:migrate"], /tsx src\/scripts\/migrate\.ts/u);
  assert.doesNotMatch(serverPackage.scripts["db:migrate"], /drizzle-kit migrate/u);
  assert.match(serverPackage.scripts["db:reset"], /npm run db:migrate$/u);
});

test("setup migrates the obsolete generated Node demo default", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "zilobase-node-env-test-"));
  const filename = path.join(directory, "node.env");
  await writeFile(
    filename,
    'ZILOBASE_DEMO_ENABLED="true"\nPRESERVED_VALUE="yes"\n',
    { mode: 0o600 },
  );

  assert.equal(await migrateGeneratedNodeEnvironment(filename), true);
  const migrated = parse(await readFile(filename, "utf8"));
  assert.equal(migrated.ZILOBASE_DEMO_ENABLED, "false");
  assert.equal(migrated.PRESERVED_VALUE, "yes");
  assert.equal((await stat(filename)).mode & 0o777, 0o600);
  assert.equal(await migrateGeneratedNodeEnvironment(filename), false);
});

test("studio inspects the Node development database", () => {
  const services = resolveStudioServices();
  assert.deepEqual(services.map((service) => service.name), ["node"]);
  assert.deepEqual(
    services.map((service) => service.database),
    ["zilobase_node"],
  );
  assert.deepEqual(services.map((service) => service.port), [4983]);
  assert.equal(studioBrowserUrl(4983), "https://local.drizzle.studio");
});

test("local starts only the public Node profile", () => {
  assert.deepEqual(resolveLocalProfileNames(), ["node"]);
});

test("workspace discovery loads ordered opt-in sibling providers", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "zilobase-providers-test-"));
  for (const [directory, id, order] of [["later", "later", 20], ["earlier", "earlier", 10]]) {
    const providerDir = path.join(workspace, directory);
    await mkdir(providerDir);
    await writeFile(path.join(providerDir, DEVELOPMENT_PROVIDER_FILE), JSON.stringify({
      id,
      order,
      readiness: ["http://127.0.0.1:9999/ready"],
      schemaVersion: 1,
      start: ["node", "scripts/start.mjs"],
    }));
  }
  const providers = await discoverDevelopmentProviders(workspace);
  assert.deepEqual(providers.map(({ id }) => id), ["earlier", "later"]);
});

test("workspace providers may expose only loopback readiness URLs", () => {
  assert.throws(() => validateDevelopmentProvider({
    id: "remote",
    readiness: ["https://example.com/ready"],
    schemaVersion: 1,
    start: ["node", "scripts/start.mjs"],
  }, "/tmp/provider"), /loopback readiness URLs/);
});

test("development hub combines public and provider-owned runtime details", async () => {
  const model = developmentDashboardModel({
    credentials: [{ name: "Core", description: "Core setup", fields: [["Token", "<secret>"]] }],
    profiles: { node: localProfiles.node },
    providerModels: [{
      runtimes: [{
        api: "http://localhost:9998",
        app: "http://localhost:9999",
        config: [["Mode", "Optional"]],
        description: "Optional runtime",
        health: "http://127.0.0.1:9998/ready",
        id: "optional",
        name: "Optional",
      }],
      services: [{ name: "Docs", detail: "Local docs", url: "http://localhost:9997" }],
    }],
  });
  assert.deepEqual(model.runtimes.map(({ id }) => id), ["node", "optional"]);
  const page = renderDevelopmentDashboard(model);
  assert.match(page, /Development hub/);
  assert.match(page, /Optional runtime/);
  assert.match(page, /&lt;secret&gt;/);

  const dashboard = await startDevelopmentDashboard({ model, open: false, port: 0 });
  try {
    const response = await fetch(dashboard.url);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Community self-hosted/);
  } finally {
    await dashboard.close();
  }
});

test("development hub refuses non-loopback health probes", async () => {
  await assert.rejects(startDevelopmentDashboard({
    model: {
      credentials: [],
      runtimes: [{ health: "https://example.com/ready" }],
      services: [],
    },
    open: false,
    port: 0,
  }), /loopback HTTP URLs/);
});

test("the web client uses a stable Vite dependency cache", () => {
  const rootDir = path.join(os.tmpdir(), "zilobase-vite-test");
  const nodeCache = webCacheDirectory(localProfiles.node, rootDir);

  assert.equal(nodeCache, path.join(rootDir, "vite", "node"));
});

test("shell profile overrides select validated ports", () => {
  const profile = effectiveProfile("node", {
    PORT: "4010",
    BACKGROUND_HEALTH_PORT: "4012",
    ZILOBASE_NODE_WEB_PORT: "4020",
    ZILOBASE_NODE_INSPECTOR_PORT: "4031",
  });
  assert.deepEqual(
    [
      profile.apiPort,
      profile.healthPort,
      profile.appPort,
      profile.inspectorPort,
    ],
    [4010, 4012, 4020, 4031],
  );
  assert.equal(effectiveProfile("node", { PORT: "invalid" }).apiPort, 3000);
});

test("dotenvx loads a runtime file while invoking environment wins", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "zilobase-env-test-"));
  const filename = path.join(directory, ".env.development");
  await writeFile(filename, "FROM_FILE=yes\nSHARED=file\n", { mode: 0o600 });
  const target = {};
  loadDotenvx({ path: filename, processEnv: target, quiet: true, noOps: true });
  const result = { ...target, ...{ SHARED: "shell" } };
  assert.equal(result.FROM_FILE, "yes");
  assert.equal(result.SHARED, "shell");
});

test("dotenvx programmatic loading decrypts encrypted runtime files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "zilobase-encrypted-env-test-"));
  const filename = path.join(directory, ".env.development");
  await writeFile(filename, "ENCRYPTED_VALUE=available\n", { mode: 0o600 });
  const dotenvx = path.join(coreDir, "node_modules", ".bin", "dotenvx");
  const encrypted = spawnSync(dotenvx, ["encrypt", "-f", filename], {
    cwd: directory,
    encoding: "utf8",
  });
  assert.equal(encrypted.status, 0, encrypted.stderr);
  const keys = parse(await readFile(path.join(directory, ".env.keys"), "utf8"));
  const target = { ...keys };
  loadDotenvx({ path: filename, processEnv: target, quiet: true, noOps: true });
  assert.equal(target.ENCRYPTED_VALUE, "available");
});

test("setup creates private files once and never overwrites them", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "zilobase-template-test-"));
  const template = path.join(directory, "example");
  const destination = path.join(directory, "nested", ".env.development");
  await writeFile(template, "VALUE=first\n");
  assert.equal(await createFromTemplateIfMissing(template, destination), true);
  assert.equal((await stat(destination)).mode & 0o777, 0o600);
  await writeFile(template, "VALUE=second\n");
  assert.equal(await createFromTemplateIfMissing(template, destination), false);
  assert.equal(await readFile(destination, "utf8"), "VALUE=first\n");
});

test("diagnostics redact credentials and database URLs", () => {
  const output = redact(
    "password=hunter2 token: abc database=postgresql://user:pass@host/db api_key=xyz",
  );
  assert.doesNotMatch(output, /hunter2|abc|user:pass|xyz/);
  assert.match(output, /\[redacted\]/);
});

test("port collision detection rejects wildcard listeners", async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  await assert.rejects(() => assertPortsAvailable([address.port]), /already in use/);
  await new Promise((resolve) => server.close(resolve));
});

test("port collision detection rejects loopback listeners", async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  await assert.rejects(() => assertPortsAvailable([address.port]), /already in use/);
  await new Promise((resolve) => server.close(resolve));
});

test("process cleanup terminates supervised children", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  });
  await stopChildren([child]);
  assert.ok(child.exitCode !== null || child.signalCode !== null);
});

test("reset requires an explicit target confirmation", async () => {
  await assert.rejects(() => resetLocal("node", false), /--yes/);
  await assert.rejects(() => resetLocal("not-a-runtime", true), /target must be/);
});

test("database reset runs drop and create outside a shared transaction", () => {
  assert.deepEqual(databaseResetStatements("zilobase_node"), [
    "DROP DATABASE IF EXISTS zilobase_node WITH (FORCE);",
    "CREATE DATABASE zilobase_node;",
  ]);
  assert.throws(
    () => databaseResetStatements("zilobase_node; DROP DATABASE postgres"),
    /name is invalid/,
  );
});

test("mail flags belong to the operator rather than generated infrastructure", async () => {
  for (const profile of Object.values(localProfiles)) {
    assert.equal(profileEnvironment(profile, {}).MAIL_ENABLED, undefined);
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), "zilobase-mail-env-"));
  const filename = path.join(directory, "node.env");
  await writeFile(filename, 'MAIL_ENABLED="false"\nDATABASE_URL="preserved"\n');
  assert.equal(await migrateGeneratedMailEnvironment(filename), true);
  assert.deepEqual(parse(await readFile(filename, "utf8")), { DATABASE_URL: "preserved" });
  assert.equal(await migrateGeneratedMailEnvironment(filename), false);
});

test("public mail development uses one origin without proxying back into its tunnel", () => {
  for (const profile of Object.values(localProfiles)) {
    const env = applyPublicDevelopmentOrigin({ ZILOBASE_DEV_PUBLIC_ORIGIN: "https://mail-dev.example.com" }, profile);
    assert.equal(env.BETTER_AUTH_URL, env.CLIENT_URL);
    assert.equal(env.VITE_API_URL, env.BETTER_AUTH_URL);
    assert.equal(env.VITE_BACKEND_PROXY_TARGET, `http://${profile.apiHost}:${profile.apiPort}`);
    assert.equal(env.NAVIGATION_REALTIME_WEBSOCKET_URL, "wss://mail-dev.example.com/navigation-realtime");
  }
  assert.throws(() => applyPublicDevelopmentOrigin({ ZILOBASE_DEV_PUBLIC_ORIGIN: "https://example.com/path" }, localProfiles.node), /HTTPS origin/);
});

test("mail readiness uses launcher origins rather than obsolete generated hostnames", () => {
  for (const name of ["node"]) {
    const env = { BETTER_AUTH_URL: "http://obsolete.zilobase.localhost:3000" };
    const profile = effectiveProfile(name, env);
    assert.equal(runtimeEnvironment(profile, env).BETTER_AUTH_URL, `http://${profile.apiHost}:${profile.apiPort}`);
  }
});
