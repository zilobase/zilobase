import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import path from "node:path";
import type { Hono } from "hono";

import { getAppEditionExtension } from "../../app";
import { attachNodeCollaborationRuntime } from "../../collaboration/node-runtime";
import { attachNodeDatabaseRealtimeRuntime } from "../../database-realtime/node-runtime";
import { createDbClientForUrl, runWithDbEnv } from "../../db";
import { assertSelfHostedProductionConfiguration } from "../../features/instance/registration";
import {
  getDatabaseUrl,
  setRuntimeAdapter,
  type ServerRuntimeAdapter,
} from "../../runtime-adapter";
import { drainDatabaseRealtimeOutbox } from "../../services/database-realtime";
import type { AppBindings } from "../../types";
import { isNodeApiPath } from "./api-routing";
import { runMigrationSets, type MigrationSet } from "./migrations";

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
  const collaboration = attachNodeCollaborationRuntime(server, env, {
    editionExtension,
    passthroughPaths: ["/database-collaboration"],
  });
  const databaseRealtime = attachNodeDatabaseRealtimeRuntime(server, env);
  const effectiveRuntimeAdapter: ServerRuntimeAdapter = {
    ...runtimeAdapter,
    publishDatabaseMutation: ({ event }) =>
      databaseRealtime.publishMutation(event),
  };
  let stopOutboxDrainer: (() => void) | null = null;

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
      if (!stopOutboxDrainer) {
        stopOutboxDrainer = startDatabaseRealtimeOutboxDrainer(env);
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
      stopOutboxDrainer?.();
      stopOutboxDrainer = null;
      await databaseRealtime.destroy();
      await collaboration.destroy();
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

function startDatabaseRealtimeOutboxDrainer(
  env: Record<string, unknown>,
) {
  let draining = false;

  const drain = async () => {
    if (draining) return;
    draining = true;

    try {
      await runWithDbEnv(env, () =>
        drainDatabaseRealtimeOutbox(env, { limit: 250 }),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          event: "database_realtime_outbox_drain_failed",
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
