import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const coordinator = {
    dispatch: vi.fn(async () => undefined),
    readiness: vi.fn(() => ({ coordinatorReady: true, listenerReady: true })),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
  };
  const databaseClient = {
    client: {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
    },
    db: { kind: "test-db" },
  };
  return {
    appEdition: vi.fn(() => null),
    assertProduction: vi.fn(),
    backgroundSnapshot: vi.fn(async () => ({ healthy: true })),
    collaboration: { destroy: vi.fn(async () => undefined) },
    coordinator,
    createDatabaseClient: vi.fn(() => databaseClient),
    databaseClient,
    databaseRealtime: {
      destroy: vi.fn(async () => undefined),
      publishMutation: vi.fn(async () => undefined),
    },
    mailRealtime: {
      destroy: vi.fn(async () => undefined),
      publishNotification: vi.fn(async () => undefined),
    },
    meetingAudio: { destroy: vi.fn(async () => undefined) },
    migrate: vi.fn(async () => undefined),
    navigationRealtime: {
      destroy: vi.fn(async () => undefined),
      publish: vi.fn(async () => undefined),
    },
    publishBackground: vi.fn(async () => undefined),
    realtimeBus: {
      close: vi.fn(async () => undefined),
      connect: vi.fn(async () => undefined),
      isReady: vi.fn(() => true),
    },
    runWithDbEnv: vi.fn(async (_env: unknown, operation: () => unknown) => operation()),
    setAdapter: vi.fn(),
    setBackgroundProbe: vi.fn(),
    setCollaborationFactory: vi.fn(),
    setRealtimeProbe: vi.fn(),
  };
});

vi.mock("./collaboration-runtime", () => ({
  attachNodeCollaborationRuntime: vi.fn(() => mocks.collaboration),
}));
vi.mock("./database-realtime-runtime", () => ({
  attachNodeDatabaseRealtimeRuntime: vi.fn(() => mocks.databaseRealtime),
}));
vi.mock("./meeting-audio-runtime", () => ({
  attachNodeMeetingAudioRuntime: vi.fn(() => mocks.meetingAudio),
}));
vi.mock("./mail-realtime-runtime", () => ({
  attachNodeMailRealtimeRuntime: vi.fn(() => mocks.mailRealtime),
}));
vi.mock("./navigation-realtime-runtime", () => ({
  attachNodeNavigationRealtimeRuntime: vi.fn(() => mocks.navigationRealtime),
}));
vi.mock("./background-coordinator", () => ({
  createNodeBackgroundCoordinator: vi.fn(() => mocks.coordinator),
  publishNodeBackgroundNotification: mocks.publishBackground,
}));
vi.mock("./pinned-webhook", () => ({ fetchPinnedNodeWebhook: vi.fn() }));
vi.mock("../../features/collaboration/service", () => ({
  setCollaborationExtensionsFactory: mocks.setCollaborationFactory,
}));
vi.mock("../../features/instance/registration", () => ({
  assertSelfHostedProductionConfiguration: mocks.assertProduction,
}));
vi.mock("../../infrastructure/database", () => ({
  createDbClientForUrl: mocks.createDatabaseClient,
  runWithDbEnv: mocks.runWithDbEnv,
}));
vi.mock("../../infrastructure/runtime/runtime-adapter", () => ({
  getDatabaseUrl: vi.fn((env: Record<string, unknown>) => env.DATABASE_URL),
  setRuntimeAdapter: mocks.setAdapter,
}));
vi.mock("../../shared/edition-extension-registry", () => ({
  getAppEditionExtension: mocks.appEdition,
}));
vi.mock("../../infrastructure/node/migrations", () => ({ runMigrationSets: mocks.migrate }));
vi.mock("../../infrastructure/node/realtime-bus", () => ({
  createNodeRealtimeBus: vi.fn(() => mocks.realtimeBus),
}));
vi.mock("../../infrastructure/node/collaboration-redis", () => ({
  createNodeCollaborationExtensions: vi.fn(),
}));
vi.mock("../../infrastructure/realtime/readiness", () => ({
  setRealtimeReadinessProbe: mocks.setRealtimeProbe,
}));
vi.mock("../../infrastructure/background/health", () => ({
  getBackgroundOperationalSnapshot: mocks.backgroundSnapshot,
  setBackgroundReadinessProbe: mocks.setBackgroundProbe,
}));
vi.mock("../../infrastructure/background/telemetry", () => ({
  renderPrometheusBackgroundMetrics: vi.fn(() => "zilobase_background_healthy 1\n"),
}));

import { createNodeRuntime } from "./node-runtime";

const originalEnvironment = { ...process.env };
const temporaryDirectories: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...originalEnvironment };
  process.env.ZILOBASE_PROCESS_ROLE = "api";
  delete process.env.PORT;
  delete process.env.BACKGROUND_HEALTH_PORT;
  mocks.coordinator.readiness.mockReturnValue({ coordinatorReady: true, listenerReady: true });
  mocks.backgroundSnapshot.mockResolvedValue({ healthy: true });
});

afterEach(async () => {
  process.env = { ...originalEnvironment };
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe("Node runtime HTTP transport", () => {
  it("serves API responses, request bodies, static assets, SPA fallbacks, and errors", async () => {
    const webDistDir = await makeWebDist();
    const seen: Request[] = [];
    const app = {
      fetch: vi.fn(async (request: Request) => {
        seen.push(request);
        if (new URL(request.url).pathname === "/api/error") throw new Error("boom");
        if (new URL(request.url).pathname === "/api/empty") return new Response(null, { status: 204 });
        return Response.json({ body: await request.text(), url: request.url }, {
          headers: { "x-runtime-test": "yes" },
        });
      }),
    };
    const runtime = createNodeRuntime({
      app: app as never,
      migrationSets: [],
      runtimeAdapter: {} as never,
      webDistDir,
    });
    const port = await listen(runtime.server);

    const api = await fetch(`http://127.0.0.1:${port}/api/echo`, {
      body: "payload",
      headers: { "x-forwarded-proto": "https", "x-test": "forwarded" },
      method: "POST",
    });
    expect(api.status).toBe(200);
    expect(api.headers.get("x-runtime-test")).toBe("yes");
    expect(await api.json()).toMatchObject({ body: "payload" });
    expect(seen[0]?.url).toBe(`https://127.0.0.1:${port}/api/echo`);
    expect(seen[0]?.headers.get("x-test")).toBe("forwarded");

    expect((await fetch(`http://127.0.0.1:${port}/api/empty`)).status).toBe(204);
    const failed = await fetch(`http://127.0.0.1:${port}/api/error`);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "Internal server error" });

    const index = await fetch(`http://127.0.0.1:${port}/`);
    expect(await index.text()).toBe("<main>index</main>");
    expect(index.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(index.headers.get("cache-control")).toBe("no-cache");

    const asset = await fetch(`http://127.0.0.1:${port}/assets/app.js`);
    expect(await asset.text()).toBe("console.log('asset')");
    expect(asset.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(asset.headers.get("cache-control")).toContain("immutable");

    const head = await fetch(`http://127.0.0.1:${port}/data.json`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await head.text()).toBe("");

    const navigation = await fetch(`http://127.0.0.1:${port}/client/page`, {
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    expect(navigation.status).toBe(200);
    expect(await navigation.text()).toBe("<main>index</main>");
    expect((await fetch(`http://127.0.0.1:${port}/missing.css`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${port}/client`, { method: "POST" })).status).toBe(405);
    expect((await fetch(`http://127.0.0.1:${port}/%E0%A4%A`)).status).toBe(500);

    await runtime.close();
    expect(mocks.collaboration.destroy).toHaveBeenCalledOnce();
    expect(mocks.databaseRealtime.destroy).toHaveBeenCalledOnce();
    expect(mocks.realtimeBus.close).toHaveBeenCalledOnce();
    expect(mocks.setRealtimeProbe).toHaveBeenLastCalledWith(null);
    expect(mocks.setBackgroundProbe).toHaveBeenLastCalledWith(null);
  });
});

describe("Node runtime lifecycle", () => {
  it("migrates, starts the API listener, and delegates runtime adapter operations", async () => {
    const webDistDir = await makeWebDist();
    const port = await freePort();
    process.env.PORT = String(port);
    process.env.HOST = "127.0.0.1";
    process.env.DATABASE_URL = "postgresql://example.test/zilobase";
    const fallbackWebhook = vi.fn();
    const runtime = createNodeRuntime({
      app: { fetch: vi.fn(async () => new Response("api")) } as never,
      migrationSets: [{ id: "test", migrationsFolder: "/migrations", journalTable: "journal" }],
      runtimeAdapter: { fetchAutomationWebhook: fallbackWebhook } as never,
      webDistDir,
    });

    await runtime.migrate();
    expect(mocks.databaseClient.client.connect).toHaveBeenCalledOnce();
    expect(mocks.migrate).toHaveBeenCalledWith(mocks.databaseClient.db, runtime.migrationSets);
    expect(mocks.databaseClient.client.end).toHaveBeenCalledOnce();

    const adapter = mocks.setAdapter.mock.calls.at(-1)?.[0];
    expect(adapter.fetchAutomationWebhook).toBe(fallbackWebhook);
    await adapter.publishDatabaseMutation({ event: { id: "db" } });
    await adapter.publishMailNotification({ event: { id: "mail" } });
    await adapter.publishNavigationInvalidation({ event: { id: "nav" } });
    await adapter.dispatchBackgroundTasks({ env: {}, tasks: [] });
    expect(mocks.databaseRealtime.publishMutation).toHaveBeenCalled();
    expect(mocks.mailRealtime.publishNotification).toHaveBeenCalled();
    expect(mocks.navigationRealtime.publish).toHaveBeenCalled();
    expect(mocks.publishBackground).toHaveBeenCalled();

    await runtime.start();
    expect(await (await fetch(`http://127.0.0.1:${port}/api/test`)).text()).toBe("api");
    expect(mocks.realtimeBus.connect).toHaveBeenCalledOnce();
    await runtime.close();
  });

  it("rejects migration without a database URL and always closes a connected client", async () => {
    const runtime = createNodeRuntime({
      app: { fetch: vi.fn() } as never,
      migrationSets: [],
      runtimeAdapter: {} as never,
      webDistDir: await makeWebDist(),
    });
    delete process.env.DATABASE_URL;
    await expect(runtime.migrate()).rejects.toThrow("DATABASE_URL is required");

    process.env.DATABASE_URL = "postgresql://example.test/zilobase";
    mocks.migrate.mockRejectedValueOnce(new Error("migration failed"));
    await expect(runtime.migrate()).rejects.toThrow("migration failed");
    expect(mocks.databaseClient.client.end).toHaveBeenCalledOnce();
    await runtime.close();
  });

  it("runs the worker-only coordinator and private health server", async () => {
    process.env.ZILOBASE_PROCESS_ROLE = "worker";
    process.env.BACKGROUND_HEALTH_PORT = String(await freePort());
    const runtime = createNodeRuntime({
      app: { fetch: vi.fn() } as never,
      migrationSets: [],
      runtimeAdapter: {} as never,
      webDistDir: await makeWebDist(),
    });
    const adapter = mocks.setAdapter.mock.calls.at(-1)?.[0];
    await runtime.start();
    expect(runtime.server.listening).toBe(false);
    expect(mocks.coordinator.start).toHaveBeenCalledOnce();
    await adapter.dispatchBackgroundTasks({ env: {}, tasks: [{ availableAt: new Date().toISOString(), kind: "ai.run" }] });
    expect(mocks.coordinator.dispatch).toHaveBeenCalledOnce();

    const origin = `http://127.0.0.1:${process.env.BACKGROUND_HEALTH_PORT}`;
    expect(await (await fetch(`${origin}/metrics`)).text()).toBe("zilobase_background_healthy 1\n");
    expect((await fetch(`${origin}/missing`)).status).toBe(404);
    expect((await fetch(`${origin}/health`)).status).toBe(200);
    mocks.coordinator.readiness.mockReturnValue({ coordinatorReady: true, listenerReady: false });
    expect((await fetch(`${origin}/ready`)).status).toBe(503);
    mocks.backgroundSnapshot.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await fetch(`${origin}/ready`)).status).toBe(503);

    await runtime.close();
    expect(mocks.coordinator.stop).toHaveBeenCalledOnce();
  });

  it("validates process roles", async () => {
    process.env.ZILOBASE_PROCESS_ROLE = "invalid";
    expect(() => createNodeRuntime({
      app: { fetch: vi.fn() } as never,
      migrationSets: [],
      runtimeAdapter: {} as never,
      webDistDir: "/tmp/not-used",
    })).toThrow("ZILOBASE_PROCESS_ROLE must be all, api, or worker");
  });
});

async function makeWebDist() {
  const directory = await mkdtemp(path.join(tmpdir(), "zilobase-node-runtime-"));
  temporaryDirectories.push(directory);
  await mkdir(path.join(directory, "assets"));
  await writeFile(path.join(directory, "index.html"), "<main>index</main>");
  await writeFile(path.join(directory, "assets", "app.js"), "console.log('asset')");
  await writeFile(path.join(directory, "data.json"), "{\"ok\":true}");
  return directory;
}

async function listen(server: ReturnType<typeof import("node:http").createServer>) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  return address.port;
}

async function freePort() {
  const server = createNetServer();
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Expected a TCP address"));
      resolve(address.port);
    });
  });
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}
