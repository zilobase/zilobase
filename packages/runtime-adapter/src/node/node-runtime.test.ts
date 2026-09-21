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
  const realtimeBus = {
    close: vi.fn(async () => undefined),
    connect: vi.fn(async () => undefined),
    isReady: vi.fn(() => true),
  };
  return {
    appEdition: vi.fn(() => null),
    assertProduction: vi.fn(),
    backgroundSnapshot: vi.fn(async () => ({ healthy: true })),
    calendarRealtime: {
      destroy: vi.fn(async () => undefined),
      publishNotification: vi.fn(async () => undefined),
    },
    collaboration: {
      appendPageComment: vi.fn(async () => ({ messageId: "message", threadId: "thread" })),
      destroy: vi.fn(async () => undefined),
      replacePageContent: vi.fn(async () => undefined),
    },
    coordinator,
    createDatabaseClient: vi.fn(() => databaseClient),
    createRealtimeBus: vi.fn(() => realtimeBus),
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
    realtimeBus,
    runWithDbEnv: vi.fn(async (_env: unknown, operation: () => unknown) => operation()),
    setPorts: vi.fn(),
    setBackgroundProbe: vi.fn(),
    setCollaborationFactory: vi.fn(),
    setRealtimeProbe: vi.fn(),
  };
});

vi.mock("./features/collaboration/collaboration-runtime", () => ({
  attachNodeCollaborationRuntime: vi.fn(() => mocks.collaboration),
}));
vi.mock("./features/database-realtime/database-realtime-runtime", () => ({
  attachNodeDatabaseRealtimeRuntime: vi.fn(() => mocks.databaseRealtime),
}));
vi.mock("./features/meeting-audio/meeting-audio-runtime", () => ({
  attachNodeMeetingAudioRuntime: vi.fn(() => mocks.meetingAudio),
}));
vi.mock("./features/calendar-realtime/calendar-realtime-runtime", () => ({
  attachNodeCalendarRealtimeRuntime: vi.fn(() => mocks.calendarRealtime),
}));
vi.mock("./features/mail-realtime/mail-realtime-runtime", () => ({
  attachNodeMailRealtimeRuntime: vi.fn(() => mocks.mailRealtime),
}));
vi.mock("./features/navigation-realtime/navigation-realtime-runtime", () => ({
  attachNodeNavigationRealtimeRuntime: vi.fn(() => mocks.navigationRealtime),
}));
vi.mock("./background-coordinator", () => ({
  createNodeBackgroundCoordinator: vi.fn(() => mocks.coordinator),
  publishNodeBackgroundNotification: mocks.publishBackground,
}));
vi.mock("./pinned-webhook", () => ({ fetchPinnedNodeWebhook: vi.fn() }));
vi.mock("@zilobase/server/node-adapter-api", () => ({
  assertSelfHostedProductionConfiguration: mocks.assertProduction,
  createDbClientForUrl: mocks.createDatabaseClient,
  getAppEditionExtension: mocks.appEdition,
  getBackgroundOperationalSnapshot: mocks.backgroundSnapshot,
  renderPrometheusBackgroundMetrics: vi.fn(() => "zilobase_background_healthy 1\n"),
  renderPrometheusDatabaseMetrics: vi.fn(() => ""),
  runWithDbEnv: mocks.runWithDbEnv,
  setBackgroundReadinessProbe: mocks.setBackgroundProbe,
  setCollaborationExtensionsFactory: mocks.setCollaborationFactory,
  setRealtimeReadinessProbe: mocks.setRealtimeProbe,
}));
vi.mock("../capabilities", () => ({
  getDatabaseUrl: vi.fn((env: Record<string, unknown>) => env.DATABASE_URL),
  setRuntimePorts: mocks.setPorts,
}));
vi.mock("./migrations", () => ({ runMigrationSets: mocks.migrate }));
vi.mock("./realtime-bus", () => ({
  createNodeRealtimeBus: vi.fn(() => mocks.createRealtimeBus()),
}));
vi.mock("./features/collaboration/collaboration-redis", () => ({
  createNodeCollaborationExtensions: vi.fn(),
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
  mocks.createRealtimeBus.mockReturnValue(mocks.realtimeBus);
  mocks.realtimeBus.isReady.mockReturnValue(true);
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
    process.env.PORT = String(await freePort());
    process.env.HOST = "127.0.0.1";
    const runtime = createNodeRuntime({
      loadApp: async () => app as never,
      migrationSets: [],
      webDistDir,
      hooks: {
        assertProductionConfig: mocks.assertProduction,
        getEditionExtension: mocks.appEdition as never,
      },
    });
    await runtime.start();
    const port = Number(process.env.PORT);

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
  it("migrates, starts the API listener, and delegates runtime port operations", async () => {
    const webDistDir = await makeWebDist();
    const port = await freePort();
    process.env.PORT = String(port);
    process.env.HOST = "127.0.0.1";
    process.env.DATABASE_URL = "postgresql://example.test/zilobase";
    const runtime = createNodeRuntime({
      loadApp: async () => ({ fetch: vi.fn(async () => new Response("api")) }) as never,
      migrationSets: [{ id: "test", migrationsFolder: "/migrations", journalTable: "journal" }],
      webDistDir,
      hooks: {
        assertProductionConfig: mocks.assertProduction,
        getEditionExtension: mocks.appEdition as never,
      },
    });

    await runtime.migrate();
    expect(mocks.databaseClient.client.connect).toHaveBeenCalledOnce();
    expect(mocks.migrate).toHaveBeenCalledWith(mocks.databaseClient.db, runtime.migrationSets);
    expect(mocks.databaseClient.client.end).toHaveBeenCalledOnce();

    await runtime.start();
    const ports = mocks.setPorts.mock.calls.at(-1)?.[0];
    await ports.fanout.publish("db:database", { id: "db" });
    await ports.fanout.publish("mail:user", { id: "mail" });
    await ports.fanout.publish("navigation:workspace", { id: "nav" });
    await ports.jobs.dispatch([]);
    expect(mocks.databaseRealtime.publishMutation).toHaveBeenCalled();
    expect(mocks.mailRealtime.publishNotification).toHaveBeenCalled();
    expect(mocks.navigationRealtime.publish).toHaveBeenCalled();
    expect(mocks.publishBackground).toHaveBeenCalled();

    expect(await (await fetch(`http://127.0.0.1:${port}/api/test`)).text()).toBe("api");
    expect(mocks.realtimeBus.connect).toHaveBeenCalledOnce();
    await runtime.close();
  });

  it("rejects migration without a database URL and always closes a connected client", async () => {
    const runtime = createNodeRuntime({
      loadApp: async () => ({ fetch: vi.fn() }) as never,
      migrationSets: [],
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

  it("runs the background coordinator and internal health server", async () => {
    process.env.ZILOBASE_PROCESS_ROLE = "worker";
    process.env.BACKGROUND_HEALTH_PORT = String(await freePort());
    const runtime = createNodeRuntime({
      loadApp: async () => ({ fetch: vi.fn() }) as never,
      migrationSets: [],
      webDistDir: await makeWebDist(),
      hooks: {
        assertProductionConfig: mocks.assertProduction,
        getEditionExtension: mocks.appEdition as never,
      },
    });
    await runtime.start();
    expect(runtime.server.listening).toBe(false);
    expect(mocks.coordinator.start).toHaveBeenCalledOnce();
    expect(mocks.realtimeBus.connect).toHaveBeenCalledOnce();
    await mocks.setPorts.mock.calls.at(-1)?.[0].jobs.dispatch([{
      availableAt: new Date().toISOString(),
      cellId: "default",
      kind: "ai.job",
      resourceId: "job",
      version: 1,
    }]);
    expect(mocks.coordinator.dispatch).toHaveBeenCalledOnce();

    const origin = `http://127.0.0.1:${process.env.BACKGROUND_HEALTH_PORT}`;
    expect(await (await fetch(`${origin}/metrics`)).text()).toBe("zilobase_background_healthy 1\n");
    expect((await fetch(`${origin}/missing`)).status).toBe(404);
    expect((await fetch(`${origin}/health`)).status).toBe(200);
    mocks.coordinator.readiness.mockReturnValue({ coordinatorReady: true, listenerReady: false });
    expect((await fetch(`${origin}/ready`)).status).toBe(503);
    mocks.coordinator.readiness.mockReturnValue({ coordinatorReady: true, listenerReady: true });
    mocks.realtimeBus.isReady.mockReturnValue(false);
    expect((await fetch(`${origin}/ready`)).status).toBe(503);
    mocks.backgroundSnapshot.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await fetch(`${origin}/ready`)).status).toBe(503);

    await runtime.close();
    expect(mocks.coordinator.stop).toHaveBeenCalledOnce();
  });

  it("validates process roles", async () => {
    process.env.ZILOBASE_PROCESS_ROLE = "invalid";
    expect(() => createNodeRuntime({
      loadApp: async () => ({ fetch: vi.fn() }) as never,
      migrationSets: [],
      webDistDir: "/tmp/not-used",
    })).toThrow("ZILOBASE_PROCESS_ROLE must be all, api, or worker");
  });

  it("allows one all-in-one process without Redis", async () => {
    process.env.ZILOBASE_PROCESS_ROLE = "all";
    process.env.PORT = String(await freePort());
    process.env.BACKGROUND_HEALTH_PORT = String(await freePort());
    process.env.HOST = "127.0.0.1";
    mocks.createRealtimeBus.mockReturnValueOnce(null as never);
    const runtime = createNodeRuntime({
      loadApp: async () => ({ fetch: vi.fn(async () => new Response("api")) }) as never,
      migrationSets: [],
      webDistDir: await makeWebDist(),
    });

    await runtime.start();
    expect(runtime.server.listening).toBe(true);
    expect(mocks.realtimeBus.connect).not.toHaveBeenCalled();
    await runtime.close();
  });

  it.each(["api", "worker"] as const)(
    "requires Redis for the split %s role",
    async (processRole) => {
      process.env.ZILOBASE_PROCESS_ROLE = processRole;
      mocks.createRealtimeBus.mockReturnValueOnce(null as never);
      const webDistDir = await makeWebDist();

      expect(() => createNodeRuntime({
        loadApp: async () => ({ fetch: vi.fn() }) as never,
        migrationSets: [],
        webDistDir,
      })).toThrow(
        "REALTIME_REDIS_URL is required when ZILOBASE_PROCESS_ROLE is api or worker",
      );
    },
  );
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
