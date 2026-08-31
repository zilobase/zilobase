import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import path from "node:path";
import type { Hono } from "hono";

import { attachNodeCollaborationRuntime } from "./collaboration-runtime";
import { setCollaborationExtensionsFactory } from "../../features/collaboration/service";
import { attachNodeDatabaseRealtimeRuntime } from "./database-realtime-runtime";
import { attachNodeMeetingAudioRuntime } from "./meeting-audio-runtime";
import { attachNodeMailRealtimeRuntime } from "./mail-realtime-runtime";
import { createDbClientForUrl, runWithDbEnv } from "../../infrastructure/database";
import { assertSelfHostedProductionConfiguration } from "../../features/instance/registration";
import {
  getDatabaseUrl,
  setRuntimeAdapter,
  type ServerRuntimeAdapter,
} from "../../infrastructure/runtime/runtime-adapter";
import { drainDatabaseRealtimeOutbox } from "../../features/databases/realtime/outbox";
import { expireTemporaryMemberships } from "../../features/memberships";
import type { AppBindings } from "../../shared/types";
import { getAppEditionExtension } from "../../shared/edition-extension-registry";
import { isNodeApiPath } from "../../infrastructure/node/api-routing";
import { runMigrationSets, type MigrationSet } from "../../infrastructure/node/migrations";
import { createNodeRealtimeBus } from "../../infrastructure/node/realtime-bus";
import { createNodeCollaborationExtensions } from "../../infrastructure/node/collaboration-redis";
import { setRealtimeReadinessProbe } from "../../infrastructure/realtime/readiness";
import { cleanupExpiredAiAgentData } from "../../features/ai/actions/agent-operations";
import { AI_JOB_HANDLERS } from "../../features/ai/jobs/ai-job-handlers";
import { runAiJobBatch } from "../../features/ai/jobs/ai-jobs";
import { renewGmailWatches } from "../../features/mail/gmail-watch";

export type NodeRuntimeOptions = {
  app: Hono<AppBindings>;
  migrationSets: readonly MigrationSet[];
  runtimeAdapter: ServerRuntimeAdapter;
  webDistDir: string;
};

export function createNodeRuntime({
  app,
  migrationSets,
  runtimeAdapter,
  webDistDir,
}: NodeRuntimeOptions) {
  const env = process.env as Record<string, unknown>;
  const port = readPort(process.env.PORT) ?? 3000;
  const hostname = process.env.HOST ?? "0.0.0.0";
  const server = createServer(async (incoming, outgoing) => {
    try {
      const request = toRequest(incoming, port);
      const url = new URL(request.url);
      const response = isNodeApiPath(url.pathname)
        ? await app.fetch(request, env)
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
  const editionExtension = getAppEditionExtension(app);
  const realtimeBus = createNodeRealtimeBus(env);
  setCollaborationExtensionsFactory(createNodeCollaborationExtensions);
  setRealtimeReadinessProbe(() => realtimeBus?.isReady() ?? true);
  const collaboration = attachNodeCollaborationRuntime(server, env, {
    editionExtension,
    passthroughPaths: ["/database-collaboration", "/mail-realtime", "/meeting-audio"],
    realtimeBus,
  });
  const databaseRealtime = attachNodeDatabaseRealtimeRuntime(server, env, { realtimeBus });
  const meetingAudio = attachNodeMeetingAudioRuntime(server, env);
  const mailRealtime = attachNodeMailRealtimeRuntime(server, env, { realtimeBus });
  const effectiveRuntimeAdapter: ServerRuntimeAdapter = {
    ...runtimeAdapter,
    publishDatabaseMutation: ({ event }) =>
      databaseRealtime.publishMutation(event),
    publishMailNotification: ({ event }) => mailRealtime.publishNotification(event),
  };
  let stopMaintenanceDrainer: (() => void) | null = null;
  let stopAiJobWorker: (() => void) | null = null;

  setRuntimeAdapter(effectiveRuntimeAdapter);
  assertSelfHostedProductionConfiguration(env);

  return {
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
      await realtimeBus?.connect();
      if (!stopMaintenanceDrainer) {
        stopMaintenanceDrainer = startMaintenanceDrainer(env);
      }
      if (!stopAiJobWorker) {
        stopAiJobWorker = startAiJobWorker(env);
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
      stopMaintenanceDrainer?.();
      stopMaintenanceDrainer = null;
      stopAiJobWorker?.();
      stopAiJobWorker = null;
      await databaseRealtime.destroy();
      await meetingAudio.destroy();
      await mailRealtime.destroy();
      await collaboration.destroy();
      await realtimeBus?.close();
      setRealtimeReadinessProbe(null);
      await new Promise<void>((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }

        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function startAiJobWorker(env: Record<string, unknown>) {
  const workerId = `node:${process.pid}:${crypto.randomUUID()}`;
  let running = false;
  const drain = async () => {
    if (running) return;
    running = true;
    try {
      await runWithDbEnv(env, () => runAiJobBatch({
        env,
        handlers: AI_JOB_HANDLERS,
        limit: 5,
        workerId,
      }));
    } catch (error) {
      console.error(JSON.stringify({
        event: "ai_job_worker_failed",
        message: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      running = false;
    }
  };
  const startupTimer = setTimeout(() => void drain(), 0);
  const interval = setInterval(() => void drain(), 1_000);
  startupTimer.unref();
  interval.unref();
  return () => {
    clearTimeout(startupTimer);
    clearInterval(interval);
  };
}

function startMaintenanceDrainer(
  env: Record<string, unknown>,
) {
  let draining = false;

  const drain = async () => {
    if (draining) return;
    draining = true;

    try {
      await runWithDbEnv(env, () =>
        Promise.all([
          cleanupExpiredAiAgentData(env).catch((error) => {
            console.error(
              JSON.stringify({
                code: "ai_agent_cleanup_failed",
                event: "background_maintenance_task_failed",
                message: error instanceof Error ? error.message : String(error),
              }),
            );
          }),
          drainDatabaseRealtimeOutbox(env, { limit: 250 }),
          expireTemporaryMemberships(),
          renewGmailWatches(env),
        ]),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          event: "background_maintenance_failed",
        }),
      );
    } finally {
      draining = false;
    }
  };

  const startupTimer = setTimeout(() => void drain(), 0);
  const interval = setInterval(() => void drain(), 5 * 60 * 1000);
  startupTimer.unref();
  interval.unref();

  return () => {
    clearTimeout(startupTimer);
    clearInterval(interval);
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
