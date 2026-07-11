import { createServer, type IncomingMessage } from "node:http";
import { config as loadEnv } from "dotenv";
import { Readable } from "node:stream";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { createApp } from "../../app";
import { attachNodeCollaborationRuntime } from "../../collaboration/node-runtime";

loadEnv({
  path: process.env.NOTELAB_ENV_FILE ?? path.resolve("apps/server/.env"),
});

const app = createApp();
const port = readPort(process.env.PORT) ?? 3000;
const hostname = process.env.HOST ?? "0.0.0.0";
const webDistDir =
  process.env.NOTELAB_WEB_DIST_DIR ??
  path.resolve("apps/web/dist");
const apiPathPrefixes = [
  "/api",
  "/agents",
  "/session",
  "/sign-in",
  "/sign-up",
  "/sign-out",
  "/email-otp",
  "/workspace",
  "/workspaces",
  "/search",
  "/pages",
  "/databases",
  "/images",
  "/metadata",
  "/user-settings",
  "/comments",
  "/health",
];

const server = createServer(async (incoming, outgoing) => {
  try {
    const request = toRequest(incoming);
    const url = new URL(request.url);
    const response = isApiPath(url.pathname)
      ? await app.fetch(request, process.env as Record<string, unknown>)
      : await serveWebAsset(request);

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
const collaboration = attachNodeCollaborationRuntime(
  server,
  process.env as Record<string, unknown>,
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await collaboration.destroy();
    server.close(() => process.exit(0));
  });
}

server.listen(port, hostname, () => {
  console.log(`Notelab server listening on http://${hostname}:${port}`);
  console.log(`Serving Notelab web assets from ${webDistDir}`);
});

function toRequest(incoming: IncomingMessage) {
  const host = incoming.headers.host ?? `localhost:${port}`;
  const forwardedProtocol = incoming.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProtocol)
    ? forwardedProtocol[0]
    : forwardedProtocol ?? "http";
  const url = new URL(incoming.url ?? "/", `${protocol}://${host}`);
  const headers = new Headers();

  for (const [key, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }

    if (value !== undefined) {
      headers.set(key, value);
    }
  }

  return new Request(url, {
    body: hasRequestBody(incoming.method)
      ? Readable.toWeb(incoming) as never
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
  if (!value) {
    return null;
  }

  const numberValue = Number(value);

  return Number.isSafeInteger(numberValue) && numberValue > 0
    ? numberValue
    : null;
}

function isApiPath(pathname: string) {
  return apiPathPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

async function serveWebAsset(request: Request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const pathname = decodeURIComponent(url.pathname);
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = getSafeWebFilePath(requestedPath);
  const response = filePath ? await tryServeFile(filePath, request) : null;

  if (response) {
    return response;
  }

  if (isSpaNavigationRequest(request, pathname)) {
    return (
      (await tryServeFile(path.join(webDistDir, "index.html"), request)) ??
      new Response("Notelab web build was not found", { status: 500 })
    );
  }

  return new Response("Not Found", { status: 404 });
}

function getSafeWebFilePath(pathname: string) {
  const normalized = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const relativePath = normalized.replace(/^[/\\]+/, "");
  const filePath = path.join(webDistDir, relativePath);
  const relativeToDist = path.relative(webDistDir, filePath);

  if (relativeToDist.startsWith("..") || path.isAbsolute(relativeToDist)) {
    return null;
  }

  return filePath;
}

async function tryServeFile(filePath: string, request: Request) {
  const metadata = await stat(filePath).catch(() => null);

  if (!metadata?.isFile()) {
    return null;
  }

  const headers = new Headers();
  headers.set("content-type", getContentType(filePath));
  headers.set("content-length", String(metadata.size));

  if (isImmutableAsset(filePath)) {
    headers.set("cache-control", "public, max-age=31536000, immutable");
  } else {
    headers.set("cache-control", "no-cache");
  }

  return new Response(
    request.method === "HEAD"
      ? null
      : Readable.toWeb(createReadStream(filePath)) as never,
    { headers },
  );
}

function isSpaNavigationRequest(request: Request, pathname: string) {
  if (path.basename(pathname).includes(".")) {
    return false;
  }

  return request.headers.get("accept")?.includes("text/html") ?? false;
}

function isImmutableAsset(filePath: string) {
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
