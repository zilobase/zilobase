import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import path from "node:path";
import type { Hono } from "hono";
import type { Ports } from "@zilobase/runtime-ports";

import { attachNodeCollaborationRuntime } from "./collaboration-runtime";
import { attachNodeDatabaseRealtimeRuntime } from "./database-realtime-runtime";
import { attachNodeMeetingAudioRuntime } from "./meeting-audio-runtime";
import { attachNodeCalendarRealtimeRuntime } from "./calendar-realtime-runtime";
import { attachNodeMailRealtimeRuntime } from "./mail-realtime-runtime";
import {
  createDbClientForUrl,
  runWithDbEnv,
  setCollaborationExtensionsFactory as defaultSetCollaborationExtensionsFactory,
  setRealtimeReadinessProbe as defaultSetRealtimeReadinessProbe,
  setBackgroundReadinessProbe as defaultSetBackgroundReadinessProbe,
  getBackgroundOperationalSnapshot,
  renderPrometheusBackgroundMetrics,
  renderPrometheusDatabaseMetrics,
  type ZilobaseEditionExtension,
} from "@zilobase/server/node-adapter-api";
import {
  getDatabaseUrl,
  setRuntimeAdapter,
  setRuntimePorts,
  type ServerRuntimeAdapter,
} from "../capabilities";
import { attachNodeNavigationRealtimeRuntime } from "./navigation-realtime-runtime";
import { isNodeApiPath } from "./api-routing";
import { runMigrationSets, type MigrationSet } from "./migrations";
import { createNodeRealtimeBus, type NodeRealtimeBus } from "./realtime-bus";
import { createNodeCollaborationExtensions } from "./collaboration-redis";
import { fetchPinnedNodeWebhook } from "./pinned-webhook";
import { fetchPinnedNodeMcp } from "./pinned-mcp";
import { createNodeImageStorage } from "./image-storage";
import { createNodeMailer } from "./mailer";
import {
  createNodeBackgroundCoordinator,
  type NodeBackgroundCoordinator,
} from "./background-coordinator";
import { createNodeJobs } from "./jobs";
import { createNodeScheduler } from "./scheduler";
import { createNodeLimits } from "./limits";
import { createNodeTelemetry } from "./telemetry";
import { createNodeFanout } from "./fanout";

export type NodeRuntimeOptions = {
  loadApp: (
    env: Record<string, unknown>,
    ports: Partial<Ports>,
  ) => Promise<Hono<any>>;
  migrationSets: readonly MigrationSet[];
  baseAdapter?: ServerRuntimeAdapter;
  webDistDir?: string;
  hooks?: {
    getEditionExtension?: (app: Hono<any>) => ZilobaseEditionExtension | undefined;
    assertProductionConfig?: (env: Record<string, unknown>) => void;
    createRealtimeBus?: (env: Record<string, unknown>) => NodeRealtimeBus | null;
    createCollaborationExtensions?: typeof createNodeCollaborationExtensions;
    setCollaborationExtensionsFactory?: typeof defaultSetCollaborationExtensionsFactory;
    setRealtimeReadinessProbe?: typeof defaultSetRealtimeReadinessProbe;
    setBackgroundReadinessProbe?: typeof defaultSetBackgroundReadinessProbe;
    fetchPinnedWebhook?: ServerRuntimeAdapter["fetchAutomationWebhook"];
    fetchPinnedMcp?: ServerRuntimeAdapter["fetchMcpRequest"];
    createBackgroundCoordinator?: (env: Record<string, unknown>) => NodeBackgroundCoordinator | null;
  };
};

export function createNodeRuntime(options: NodeRuntimeOptions) {
  const { migrationSets, baseAdapter = {}, webDistDir = "", hooks = {} } = options;
  const env = process.env as Record<string, unknown>;
  const processRole = readProcessRole(process.env.ZILOBASE_PROCESS_ROLE);
  const port = readPort(process.env.PORT) ?? 3000;
  const hostname = process.env.HOST ?? "0.0.0.0";
  const setCollaborationExtensionsFactory = hooks.setCollaborationExtensionsFactory ?? defaultSetCollaborationExtensionsFactory;
  const setRealtimeReadinessProbe = hooks.setRealtimeReadinessProbe ?? defaultSetRealtimeReadinessProbe;
  const setBackgroundReadinessProbe = hooks.setBackgroundReadinessProbe ?? defaultSetBackgroundReadinessProbe;
  const createRealtimeBus = hooks.createRealtimeBus ?? createNodeRealtimeBus;
  const createCollaborationExtensions = hooks.createCollaborationExtensions ?? createNodeCollaborationExtensions;
  const fetchPinnedWebhook = hooks.fetchPinnedWebhook ?? fetchPinnedNodeWebhook;
  const fetchPinnedMcp = hooks.fetchPinnedMcp ?? fetchPinnedNodeMcp;
  const createBackgroundCoordinator = hooks.createBackgroundCoordinator
    ?? ((hookEnv) => processRole === "api" ? null : createNodeBackgroundCoordinator(hookEnv));
  let backgroundCoordinatorRef: NodeBackgroundCoordinator | null = null;
  const ports: Partial<Ports> = {
    jobs: createNodeJobs(env, () => backgroundCoordinatorRef),
    scheduler: createNodeScheduler(),
  };
  setRuntimePorts(ports);
  let appPromise: Promise<Hono<any>> | null = null;
  const loadApp = (): Promise<Hono<any>> => (appPromise ??= options.loadApp(env, ports));
  const server = createServer(async (incoming, outgoing) => {
    try {
      const request = toRequest(incoming, port);
      const url = new URL(request.url);
      const response = isNodeApiPath(url.pathname)
        ? await (await loadApp()).fetch(request, env)
        : await serveWebAsset(request, webDistDir);

      outgoing.statusCode = response.status;
      response.headers.forEach((value, key) => {
        outgoing.setHeader(key, value);
      });

      if (!response.body) {
        outgoing.end();
        return;
      }

      Readable.fromWeb(response.body as never).pipe(outgoing);
    } catch (error) {
      console.error("Unhandled server error", error);

      if (!outgoing.headersSent) {
        outgoing.statusCode = 500;
        outgoing.setHeader("content-type", "application/json");
      }

      outgoing.end(JSON.stringify({ error: "Internal server error" }));
    }
  });
  const realtimeBus = createRealtimeBus(env);
  const limits = createNodeLimits(realtimeBus);
  assertNodeRealtimeTopology(processRole, realtimeBus);
  ports.limits = limits;
  ports.telemetry = createNodeTelemetry({
    metrics: () => renderPrometheusBackgroundMetrics() + renderPrometheusDatabaseMetrics(),
    health: () => runWithDbEnv(env, () => getBackgroundOperationalSnapshot(env)),
  });

  type StartedRuntime = {
    collaboration: ReturnType<typeof attachNodeCollaborationRuntime>;
    databaseRealtime: ReturnType<typeof attachNodeDatabaseRealtimeRuntime>;
    meetingAudio: ReturnType<typeof attachNodeMeetingAudioRuntime>;
    calendarRealtime: ReturnType<typeof attachNodeCalendarRealtimeRuntime>;
    mailRealtime: ReturnType<typeof attachNodeMailRealtimeRuntime>;
    navigationRealtime: ReturnType<typeof attachNodeNavigationRealtimeRuntime>;
    backgroundCoordinator: NodeBackgroundCoordinator | null;
    backgroundAdminServer: ReturnType<typeof createBackgroundAdminServer> | null;
  };
  let started: StartedRuntime | null = null;
  ports.fanout = createNodeFanout(realtimeBus, async (channel, payload) => {
    const state = await ensureStarted();
    const separator = channel.indexOf(":");
    const kind = channel.slice(0, separator);
    if (kind === "db") return state.databaseRealtime.publishMutation(payload as never);
    if (kind === "calendar") return state.calendarRealtime.publishNotification(payload as never);
    if (kind === "mail") return state.mailRealtime.publishNotification(payload as never);
    if (kind === "navigation") return state.navigationRealtime.publish(payload as never);
    throw new Error(`Unsupported fanout channel: ${channel}`);
  });

  async function ensureStarted(): Promise<StartedRuntime> {
    if (started) return started;
    const app = await loadApp();
    const editionExtension = hooks.getEditionExtension?.(app);
    setCollaborationExtensionsFactory(createCollaborationExtensions);
    setRealtimeReadinessProbe(() => realtimeBus?.isReady() ?? true);
    const collaboration = attachNodeCollaborationRuntime(server, env, {
      editionExtension,
      passthroughPaths: ["/database-collaboration", "/mail-realtime", "/calendar-realtime", "/meeting-audio", "/navigation-realtime"],
      realtimeBus,
      limits,
    });
    const databaseRealtime = attachNodeDatabaseRealtimeRuntime(server, env, { limits, realtimeBus });
    const meetingAudio = attachNodeMeetingAudioRuntime(server, env);
    const calendarRealtime = attachNodeCalendarRealtimeRuntime(server, env, { realtimeBus });
    const mailRealtime = attachNodeMailRealtimeRuntime(server, env, { realtimeBus });
    const navigationRealtime = attachNodeNavigationRealtimeRuntime(server, env, { realtimeBus });
    const backgroundCoordinator = createBackgroundCoordinator(env);
    backgroundCoordinatorRef = backgroundCoordinator;
    const effectiveRuntimeAdapter: ServerRuntimeAdapter = {
      ...baseAdapter,
      createImageStorage: baseAdapter.createImageStorage ?? createNodeImageStorage,
      getImageStorageMode: baseAdapter.getImageStorageMode ?? (() => "s3"),
      sendEmail: baseAdapter.sendEmail ?? (({ env: mailEnv, message }) =>
        createNodeMailer(mailEnv).send(message)),
      fetchAutomationWebhook: baseAdapter.fetchAutomationWebhook ?? fetchPinnedWebhook,
      fetchMcpRequest: baseAdapter.fetchMcpRequest ?? fetchPinnedMcp,
      publishCalendarNotification: ({ event }) => calendarRealtime.publishNotification(event),
      publishMailNotification: ({ event }) => mailRealtime.publishNotification(event),
      publishNavigationInvalidation: ({ event }) => navigationRealtime.publish(event),
    };
    const backgroundAdminServer = backgroundCoordinator
      ? createBackgroundAdminServer(
          env,
          backgroundCoordinator,
          () => realtimeBus?.isReady() ?? true,
        )
      : null;

    setRuntimeAdapter(effectiveRuntimeAdapter);
    setBackgroundReadinessProbe(() => backgroundCoordinator?.readiness() ?? {
      coordinatorReady: null,
      listenerReady: null,
    });
    hooks.assertProductionConfig?.(env);

    started = {
      backgroundAdminServer,
      backgroundCoordinator,
      calendarRealtime,
      collaboration,
      databaseRealtime,
      mailRealtime,
      meetingAudio,
      navigationRealtime,
    };
    return started;
  }

  const runtime = {
    server,
    migrationSets,
    async migrate() {
      const databaseUrl = getDatabaseUrl(env);

      if (!databaseUrl) {
        throw new Error("DATABASE_URL is required");
      }

      const databaseClient = createDbClientForUrl(databaseUrl);
      await databaseClient.client.connect();

      try {
        await runMigrationSets(databaseClient.db, migrationSets);
      } finally {
        await databaseClient.client.end();
      }
    },
    async start() {
      const state = await ensureStarted();
      await realtimeBus?.connect();
      await state.backgroundCoordinator?.start();
      await state.backgroundAdminServer?.start();
      if (processRole === "worker") {
        console.log("Zilobase background worker started");
        return;
      }
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, hostname, () => {
          server.off("error", reject);
          console.log(
            `Zilobase server listening on http://${hostname}:${port}`,
          );
          console.log(`Serving Zilobase web assets from ${webDistDir}`);
          resolve();
        });
      });
    },
    async close() {
      await started?.backgroundCoordinator?.stop();
      await started?.backgroundAdminServer?.stop();
      await started?.databaseRealtime.destroy();
      await started?.meetingAudio.destroy();
      await started?.calendarRealtime.destroy();
      await started?.mailRealtime.destroy();
      await started?.navigationRealtime.destroy();
      await started?.collaboration.destroy();
      await realtimeBus?.close();
      setRealtimeReadinessProbe(null);
      setBackgroundReadinessProbe(null);
      started = null;
      backgroundCoordinatorRef = null;
      await new Promise<void>((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }

        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
  ports.lifecycle = runtime;
  return runtime;
}

type ProcessRole = "all" | "api" | "worker";

function readProcessRole(value: string | undefined): ProcessRole {
  if (!value || value === "all") return "all";
  if (value === "api" || value === "worker") return value;
  throw new Error("ZILOBASE_PROCESS_ROLE must be all, api, or worker");
}

function assertNodeRealtimeTopology(
  processRole: ProcessRole,
  realtimeBus: NodeRealtimeBus | null,
) {
  if (processRole !== "all" && !realtimeBus) {
    throw new Error(
      "REALTIME_REDIS_URL is required when ZILOBASE_PROCESS_ROLE is api or worker",
    );
  }
}

function createBackgroundAdminServer(
  env: Record<string, unknown>,
  coordinator: ReturnType<typeof createNodeBackgroundCoordinator>,
  isRealtimeReady: () => boolean,
) {
  const port = readPort(process.env.BACKGROUND_HEALTH_PORT) ?? 3001;
  const admin = createServer(async (request, response) => {
    if (request.url === "/metrics") {
      response.statusCode = 200;
      response.setHeader("content-type", "text/plain; version=0.0.4");
      response.end(
        renderPrometheusBackgroundMetrics() + renderPrometheusDatabaseMetrics(),
      );
      return;
    }
    if (request.url !== "/health" && request.url !== "/ready") {
      response.statusCode = 404;
      response.end("Not Found");
      return;
    }
    try {
      const snapshot = await runWithDbEnv(env, () => getBackgroundOperationalSnapshot(env));
      const ready = coordinator.readiness();
      response.statusCode = request.url === "/ready" &&
          (!snapshot.healthy || !ready.listenerReady || !isRealtimeReady())
        ? 503
        : 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(snapshot));
    } catch {
      response.statusCode = 503;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ healthy: false }));
    }
  });
  return {
    start: () => new Promise<void>((resolve, reject) => {
      admin.once("error", reject);
      admin.listen(port, "127.0.0.1", () => {
        admin.off("error", reject);
        console.log(`Zilobase background health listening on http://127.0.0.1:${port}`);
        resolve();
      });
    }),
    stop: () => new Promise<void>((resolve, reject) => {
      if (!admin.listening) return resolve();
      admin.close((error) => error ? reject(error) : resolve());
    }),
  };
}

function toRequest(incoming: IncomingMessage, port: number) {
  const host = incoming.headers.host ?? `localhost:${port}`;
  const forwardedProtocol = incoming.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProtocol)
    ? forwardedProtocol[0]
    : forwardedProtocol ?? "http";
  const url = new URL(incoming.url ?? "/", `${protocol}://${host}`);
  const headers = new Headers();

  for (const [key, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  return new Request(url, {
    body: hasRequestBody(incoming.method)
      ? (Readable.toWeb(incoming) as never)
      : undefined,
    duplex: "half",
    headers,
    method: incoming.method,
  } as RequestInit & { duplex: "half" });
}

function hasRequestBody(method: string | undefined) {
  return method !== "GET" && method !== "HEAD";
}

function readPort(value: string | undefined) {
  if (!value) return null;
  const numberValue = Number(value);
  return Number.isSafeInteger(numberValue) && numberValue > 0
    ? numberValue
    : null;
}

async function serveWebAsset(request: Request, webDistDir: string) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const pathname = decodeURIComponent(url.pathname);
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = getSafeWebFilePath(requestedPath, webDistDir);
  const response = filePath ? await tryServeFile(filePath, request, webDistDir) : null;

  if (response) return response;

  if (isSpaNavigationRequest(request, pathname)) {
    return (
      (await tryServeFile(
        path.join(webDistDir, "index.html"),
        request,
        webDistDir,
      )) ?? new Response("Zilobase web build was not found", { status: 500 })
    );
  }

  return new Response("Not Found", { status: 404 });
}

function getSafeWebFilePath(pathname: string, webDistDir: string) {
  const normalized = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const relativePath = normalized.replace(/^[/\\]+/, "");
  const filePath = path.join(webDistDir, relativePath);
  const relativeToDist = path.relative(webDistDir, filePath);
  return relativeToDist.startsWith("..") || path.isAbsolute(relativeToDist)
    ? null
    : filePath;
}

async function tryServeFile(
  filePath: string,
  request: Request,
  webDistDir: string,
) {
  const metadata = await stat(filePath).catch(() => null);
  if (!metadata?.isFile()) return null;

  const headers = new Headers({
    "cache-control": isImmutableAsset(filePath, webDistDir)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
    "content-length": String(metadata.size),
    "content-type": getContentType(filePath),
  });

  return new Response(
    request.method === "HEAD"
      ? null
      : (Readable.toWeb(createReadStream(filePath)) as never),
    { headers },
  );
}

function isSpaNavigationRequest(request: Request, pathname: string) {
  return (
    !path.basename(pathname).includes(".") &&
    Boolean(request.headers.get("accept")?.includes("text/html"))
  );
}

function isImmutableAsset(filePath: string, webDistDir: string) {
  return path.relative(webDistDir, filePath).startsWith(`assets${path.sep}`);
}

function getContentType(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}
