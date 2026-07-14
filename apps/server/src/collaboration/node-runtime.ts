import type {
  IncomingMessage,
  Server as HttpServer,
} from "node:http";
import type { Duplex } from "node:stream";
import crossws from "crossws/adapters/node";
import type { WebSocketLike } from "@hocuspocus/server";
import { createAuth } from "../auth";
import { createDbClient, runWithDbClient } from "../db";
import { getDefaultCollaborationHocuspocus } from "./service";
import type { RuntimeEnv } from "../config";

export const NODE_COLLABORATION_MAX_PAYLOAD_BYTES = 1024 * 1024;
const DEFAULT_CONNECTION_LIMIT = 60;
const CONNECTION_LIMIT_WINDOW_MS = 60_000;

type NodeCollaborationRuntimeOptions = {
  authenticate?: (request: Request, env: RuntimeEnv) => Promise<string | null>;
  connectionLimit?: number;
  passthroughPaths?: readonly string[];
};

export function attachNodeCollaborationRuntime(
  server: HttpServer,
  env: RuntimeEnv,
  options: NodeCollaborationRuntimeOptions = {},
) {
  const hocuspocus = getDefaultCollaborationHocuspocus(env);
  const connectionLimiter = createConnectionLimiter(
    options.connectionLimit ?? DEFAULT_CONNECTION_LIMIT,
  );
  const websocket = crossws({
    serverOptions: {
      maxPayload: NODE_COLLABORATION_MAX_PAYLOAD_BYTES,
    },
    hooks: {
      open(peer) {
        const connection = hocuspocus.handleConnection(
          peer.websocket as unknown as WebSocketLike,
          peer.request as Request,
        );
        (peer as CollaborationPeer)._notelabCollaboration = connection;
      },
      message(peer, message) {
        (peer as CollaborationPeer)._notelabCollaboration?.handleMessage(
          message.uint8Array(),
        );
      },
      close(peer, event) {
        (peer as CollaborationPeer)._notelabCollaboration?.handleClose({
          code: event.code ?? 1000,
          reason: event.reason ?? "",
        });
      },
      error(peer, error) {
        console.error(`Collaboration WebSocket error for ${peer.id}`, error);
      },
    },
  });

  server.on("upgrade", (request, socket, head) => {
    void handleUpgrade(request, socket, head).catch((error) => {
      console.error("Collaboration WebSocket upgrade failed", error);
      rejectUpgrade(socket, 500, "Internal Server Error");
    });
  });

  async function handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) {
    const url = new URL(request.url ?? "/", "http://notelab.local");

    if (url.pathname !== "/collaboration") {
      if (!options.passthroughPaths?.includes(url.pathname)) {
        socket.destroy();
      }
      return;
    }

    const webRequest = toUpgradeRequest(request);
    const authenticate = options.authenticate ?? authenticateUpgrade;
    const userId = await authenticate(webRequest, env);

    if (!userId) {
      rejectUpgrade(socket, 401, "Unauthorized");
      return;
    }

    if (!connectionLimiter.allow(userId)) {
      rejectUpgrade(socket, 429, "Too Many Requests", {
        "Retry-After": "60",
      });
      return;
    }

    await websocket.handleUpgrade(request, socket, head, webRequest);
  }

  return {
    async destroy() {
      await new Promise<void>((resolve) => {
        hocuspocus.configuration.extensions.push({
          async afterUnloadDocument({ instance }) {
            if (instance.getDocumentsCount() === 0) resolve();
          },
        });

        if (hocuspocus.getDocumentsCount() === 0) resolve();
        hocuspocus.closeConnections();
        hocuspocus.flushPendingStores();
      });
      await hocuspocus.hooks("onDestroy", { instance: hocuspocus });
    },
  };
}

async function authenticateUpgrade(request: Request, env: RuntimeEnv) {
  const headers = getAuthHeaders(request.headers);

  if (!headers.has("cookie")) {
    return null;
  }

  return runWithDbClient(createDbClient(env), async () => {
    const auth = createAuth(env, request);
    const session = await auth.api.getSession({ headers });
    return session?.user?.id ?? null;
  });
}

function getAuthHeaders(headers: Headers) {
  const nextHeaders = new Headers(headers);
  const mobileAuthCookie = nextHeaders.get("x-mobile-auth-cookie")?.trim();

  if (!nextHeaders.has("cookie") && mobileAuthCookie) {
    nextHeaders.set("cookie", mobileAuthCookie);
  }

  return nextHeaders;
}

function toUpgradeRequest(request: IncomingMessage) {
  const forwardedProtocol = request.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProtocol)
    ? forwardedProtocol[0]
    : forwardedProtocol ?? "http";
  const host = request.headers.host ?? "notelab.local";
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, item));
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  return new Request(
    new URL(request.url ?? "/", `${protocol}://${host}`),
    { headers },
  );
}

function rejectUpgrade(
  socket: Duplex,
  status: number,
  statusText: string,
  headers: Record<string, string> = {},
) {
  if (socket.destroyed) return;

  const responseHeaders = Object.entries({
    Connection: "close",
    "Content-Length": "0",
    ...headers,
  })
    .map(([key, value]) => `${key}: ${value}`)
    .join("\r\n");
  socket.end(`HTTP/1.1 ${status} ${statusText}\r\n${responseHeaders}\r\n\r\n`);
}

function createConnectionLimiter(limit: number) {
  const entries = new Map<string, { count: number; windowStartedAt: number }>();

  return {
    allow(userId: string) {
      const now = Date.now();
      const current = entries.get(userId);

      if (!current || now - current.windowStartedAt >= CONNECTION_LIMIT_WINDOW_MS) {
        entries.set(userId, { count: 1, windowStartedAt: now });
        sweepExpiredEntries(entries, now);
        return true;
      }

      if (current.count >= limit) {
        return false;
      }

      current.count += 1;
      return true;
    },
  };
}

function sweepExpiredEntries(
  entries: Map<string, { count: number; windowStartedAt: number }>,
  now: number,
) {
  if (entries.size < 1_000) return;

  for (const [userId, entry] of entries) {
    if (now - entry.windowStartedAt >= CONNECTION_LIMIT_WINDOW_MS) {
      entries.delete(userId);
    }
  }
}

type CollaborationPeer = {
  _notelabCollaboration?: {
    handleClose(event: { code: number; reason: string }): void;
    handleMessage(message: Uint8Array): void;
  };
};
