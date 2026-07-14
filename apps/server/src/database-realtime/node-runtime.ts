import type {
  IncomingMessage,
  Server as HttpServer,
} from "node:http";
import type { Duplex } from "node:stream";
import type { Message, Peer } from "crossws";
import crossws from "crossws/adapters/node";

import type { RuntimeEnv } from "../config";
import {
  DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX,
  DATABASE_REALTIME_PROTOCOL,
  verifyDatabaseRealtimeTicket,
  type DatabaseRealtimeTicketClaims,
} from "../database-realtime-ticket";
import type { DatabaseRealtimeMutationEvent } from "../services/database-realtime";

export const NODE_DATABASE_REALTIME_MAX_MESSAGE_BYTES = 16 * 1024;
const DEFAULT_CONNECTION_LIMIT = 60;
const CONNECTION_LIMIT_WINDOW_MS = 60_000;
const MESSAGE_RATE_LIMIT = 30;
const MESSAGE_RATE_WINDOW_MS = 1_000;
const MAX_DATABASE_ID_LENGTH = 128;
const MAX_TICKET_BYTES = 8 * 1024;

type DatabasePresence = {
  columnKey: string;
  rowId: string;
  viewId: string | null;
};

type SocketAttachment = {
  claims: DatabaseRealtimeTicketClaims;
  connectedAt: number;
  databaseId: string;
  presence?: DatabasePresence;
  updatedAt?: number;
};

type DatabaseRoom = {
  latestVersion: number;
  peers: Set<Peer>;
};

type NodeDatabaseRealtimeRuntimeOptions = {
  connectionLimit?: number;
  verifyTicket?: (
    token: string,
    env: RuntimeEnv,
  ) => Promise<DatabaseRealtimeTicketClaims>;
};

export function attachNodeDatabaseRealtimeRuntime(
  server: HttpServer,
  env: RuntimeEnv,
  options: NodeDatabaseRealtimeRuntimeOptions = {},
) {
  const attachments = new WeakMap<Peer, SocketAttachment>();
  const messageRates = new WeakMap<
    Peer,
    { count: number; startedAt: number }
  >();
  const rooms = new Map<string, DatabaseRoom>();
  const connectionLimiter = createConnectionLimiter(
    options.connectionLimit ?? DEFAULT_CONNECTION_LIMIT,
  );
  const verifyTicket = options.verifyTicket ?? verifyDatabaseRealtimeTicket;

  const websocket = crossws({
    idleTimeout: 30,
    serverOptions: {
      maxPayload: NODE_DATABASE_REALTIME_MAX_MESSAGE_BYTES,
    },
    hooks: {
      async upgrade(request) {
        const databaseId = new URL(request.url).searchParams.get("database");

        if (!databaseId || databaseId.length > MAX_DATABASE_ID_LENGTH) {
          throw new Response("Invalid database", { status: 400 });
        }

        const authentication = readAuthenticationProtocol(request.headers);

        if (!authentication) {
          throw new Response("Missing database realtime ticket", {
            status: 401,
          });
        }

        try {
          const claims = await verifyTicket(authentication.token, env);

          if (claims.databaseId !== databaseId) {
            throw new Error("Database realtime ticket scope does not match");
          }

          const clientAddress = getClientAddress(request);

          if (!connectionLimiter.allow(`ip:${clientAddress}`)) {
            throw new Response("Too Many Requests", {
              headers: { "Retry-After": "60" },
              status: 429,
            });
          }

          if (!connectionLimiter.allow(`user:${claims.user.id}:${databaseId}`)) {
            throw new Response("Too Many Requests", {
              headers: { "Retry-After": "60" },
              status: 429,
            });
          }

          return {
            context: { databaseRealtime: { claims, databaseId } },
            protocol: DATABASE_REALTIME_PROTOCOL,
          };
        } catch (error) {
          if (error instanceof Response) throw error;

          console.warn(JSON.stringify({
            databaseId,
            error: error instanceof Error ? error.message : String(error),
            event: "database_realtime_upgrade_authentication_failed",
          }));
          throw new Response("Invalid database realtime ticket", {
            status: 401,
          });
        }
      },
      open(peer) {
        const context = readUpgradeContext(peer);

        if (!context) {
          peer.close(1011, "Missing database realtime session");
          return;
        }

        const attachment: SocketAttachment = {
          claims: context.claims,
          connectedAt: Date.now(),
          databaseId: context.databaseId,
        };
        attachments.set(peer, attachment);

        const room = getOrCreateRoom(rooms, context.databaseId);
        pruneExpiredPeers(room, attachments);
        room.latestVersion = Math.max(
          room.latestVersion,
          context.claims.version ?? 0,
        );
        room.peers.add(peer);
        peer.send(JSON.stringify({
          databaseId: context.databaseId,
          peers: readPeers(room, peer, attachments),
          protocolVersion: 1,
          sessionId: context.claims.sessionId,
          type: "realtime.ready",
          version: room.latestVersion,
        }));
      },
      async message(peer, rawMessage) {
        const validation = validateDatabaseRealtimeMessage(rawMessage);

        if (!validation.ok) {
          peer.close(validation.code, validation.reason);
          return;
        }

        const attachment = attachments.get(peer);

        if (!attachment) {
          peer.close(1011, "Missing database realtime session");
          return;
        }

        if (!consumeMessageAllowance(peer, messageRates)) {
          clearPresence(peer, attachment, rooms, attachments);
          peer.close(1008, "Database realtime message rate exceeded");
          return;
        }

        const message = validation.message;

        if (message.type === "auth.refresh") {
          await refreshAuthentication(
            peer,
            attachment,
            message,
            env,
            verifyTicket,
          );
          return;
        }

        if (attachment.claims.exp <= Date.now()) {
          clearPresence(peer, attachment, rooms, attachments);
          peer.close(1008, "Database realtime authentication expired");
          return;
        }

        if (message.type === "presence.update") {
          updatePresence(peer, attachment, message, rooms, attachments);
          return;
        }

        peer.close(1003, "Unsupported database realtime message");
      },
      close(peer) {
        removePeer(peer, rooms, attachments);
      },
      error(peer, error) {
        console.error(JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          event: "database_realtime_websocket_error",
        }));
        removePeer(peer, rooms, attachments);
        peer.close(1011, "Database realtime WebSocket error");
      },
    },
  });

  const upgradeListener = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => {
    const url = new URL(request.url ?? "/", "http://notelab.local");

    if (url.pathname !== "/database-collaboration") return;

    void websocket.handleUpgrade(request, socket, head).catch((error) => {
      console.error("Database realtime WebSocket upgrade failed", error);
      rejectUpgrade(socket, 500, "Internal Server Error");
    });
  };

  server.on("upgrade", upgradeListener);

  return {
    async destroy() {
      server.off("upgrade", upgradeListener);
      await websocket.close(1001, "Server shutting down");
    },
    async publishMutation(event: DatabaseRealtimeMutationEvent) {
      validateMutationEvent(event);

      const room = getOrCreateRoom(rooms, event.databaseId);

      if (event.version <= room.latestVersion) return;

      room.latestVersion = event.version;
      pruneExpiredPeers(room, attachments);
      broadcast(room, event, attachments);
    },
  };
}

function readAuthenticationProtocol(headers: Headers) {
  const protocols = (headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((protocol) => protocol.trim());
  const authentication = protocols.find((protocol) =>
    protocol.startsWith(DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX)
  );
  const token = authentication?.slice(
    DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX.length,
  );

  return protocols.includes(DATABASE_REALTIME_PROTOCOL) &&
      token && token.length <= MAX_TICKET_BYTES
    ? { token }
    : null;
}

function readUpgradeContext(peer: Peer) {
  const value = peer.context.databaseRealtime;

  if (!value || typeof value !== "object") return null;

  const context = value as Record<string, unknown>;

  return typeof context.databaseId === "string" &&
      context.claims && typeof context.claims === "object"
    ? context as {
      claims: DatabaseRealtimeTicketClaims;
      databaseId: string;
    }
    : null;
}

function validateDatabaseRealtimeMessage(rawMessage: Message) {
  if (typeof rawMessage.rawData !== "string") {
    return {
      code: 1003,
      ok: false as const,
      reason: "JSON messages are required",
    };
  }

  const messageBytes = new TextEncoder().encode(rawMessage.rawData).byteLength;

  if (messageBytes > NODE_DATABASE_REALTIME_MAX_MESSAGE_BYTES) {
    return {
      code: 1009,
      ok: false as const,
      reason: "Database realtime message is too large",
    };
  }

  try {
    const value = JSON.parse(rawMessage.rawData) as unknown;

    return value && typeof value === "object"
      ? { message: value as Record<string, unknown>, ok: true as const }
      : {
        code: 1007,
        ok: false as const,
        reason: "Invalid JSON message",
      };
  } catch {
    return {
      code: 1007,
      ok: false as const,
      reason: "Invalid JSON message",
    };
  }
}

async function refreshAuthentication(
  peer: Peer,
  attachment: SocketAttachment,
  message: Record<string, unknown>,
  env: RuntimeEnv,
  verifyTicket: (
    token: string,
    env: RuntimeEnv,
  ) => Promise<DatabaseRealtimeTicketClaims>,
) {
  if (typeof message.token !== "string") {
    peer.close(1008, "Missing database realtime ticket");
    return;
  }

  try {
    const claims = await verifyTicket(message.token, env);

    if (
      claims.databaseId !== attachment.databaseId ||
      claims.sessionId !== attachment.claims.sessionId
    ) {
      throw new Error("Database realtime ticket does not match the session");
    }

    attachment.claims = claims;
  } catch (error) {
    console.warn(JSON.stringify({
      databaseId: attachment.databaseId,
      error: error instanceof Error ? error.message : String(error),
      event: "database_realtime_authentication_failed",
    }));
    peer.close(1008, "Database realtime authentication failed");
  }
}

function updatePresence(
  peer: Peer,
  attachment: SocketAttachment,
  message: Record<string, unknown>,
  rooms: Map<string, DatabaseRoom>,
  attachments: WeakMap<Peer, SocketAttachment>,
) {
  if (!attachment.claims.canEdit) return;

  if (message.presence === null) {
    clearPresence(peer, attachment, rooms, attachments);
    return;
  }

  if (!isPresence(message.presence)) {
    peer.close(1007, "Invalid database presence");
    return;
  }

  attachment.presence = message.presence;
  attachment.updatedAt = Date.now();

  const room = rooms.get(attachment.databaseId);

  if (!room) return;

  broadcast(room, {
    collaborator: toCollaborator(attachment),
    databaseId: attachment.databaseId,
    protocolVersion: 1,
    type: "presence.update",
  }, attachments, peer);
}

function clearPresence(
  peer: Peer,
  attachment: SocketAttachment,
  rooms: Map<string, DatabaseRoom>,
  attachments: WeakMap<Peer, SocketAttachment>,
) {
  if (!attachment.presence) return;

  delete attachment.presence;
  delete attachment.updatedAt;

  const room = rooms.get(attachment.databaseId);

  if (!room) return;

  broadcast(room, {
    databaseId: attachment.databaseId,
    protocolVersion: 1,
    sessionId: attachment.claims.sessionId,
    type: "presence.clear",
  }, attachments, peer);
}

function removePeer(
  peer: Peer,
  rooms: Map<string, DatabaseRoom>,
  attachments: WeakMap<Peer, SocketAttachment>,
) {
  const attachment = attachments.get(peer);

  if (!attachment) return;

  clearPresence(peer, attachment, rooms, attachments);
  rooms.get(attachment.databaseId)?.peers.delete(peer);
  attachments.delete(peer);
}

function readPeers(
  room: DatabaseRoom,
  skip: Peer,
  attachments: WeakMap<Peer, SocketAttachment>,
) {
  const now = Date.now();

  return [...room.peers].flatMap((candidate) => {
    if (candidate === skip) return [];

    const attachment = attachments.get(candidate);

    return attachment && attachment.claims.exp > now && attachment.presence
      ? [toCollaborator(attachment)]
      : [];
  });
}

function broadcast(
  room: DatabaseRoom,
  message: unknown,
  attachments: WeakMap<Peer, SocketAttachment>,
  skip?: Peer,
) {
  const encoded = JSON.stringify(message);
  const now = Date.now();

  for (const peer of room.peers) {
    if (peer === skip) continue;

    const attachment = attachments.get(peer);

    if (attachment && attachment.claims.exp > now) {
      peer.send(encoded);
    }
  }
}

function pruneExpiredPeers(
  room: DatabaseRoom,
  attachments: WeakMap<Peer, SocketAttachment>,
) {
  const now = Date.now();

  for (const peer of room.peers) {
    const attachment = attachments.get(peer);

    if (!attachment) {
      room.peers.delete(peer);
      peer.close(1011, "Missing database realtime session");
    } else if (attachment.claims.exp <= now) {
      if (attachment.presence) {
        delete attachment.presence;
        delete attachment.updatedAt;
        broadcast(room, {
          databaseId: attachment.databaseId,
          protocolVersion: 1,
          sessionId: attachment.claims.sessionId,
          type: "presence.clear",
        }, attachments, peer);
      }
      room.peers.delete(peer);
      attachments.delete(peer);
      peer.close(1008, "Database realtime authentication expired");
    }
  }
}

function consumeMessageAllowance(
  peer: Peer,
  messageRates: WeakMap<Peer, { count: number; startedAt: number }>,
) {
  const now = Date.now();
  const current = messageRates.get(peer);

  if (!current || now - current.startedAt >= MESSAGE_RATE_WINDOW_MS) {
    messageRates.set(peer, { count: 1, startedAt: now });
    return true;
  }

  current.count += 1;
  return current.count <= MESSAGE_RATE_LIMIT;
}

function getOrCreateRoom(
  rooms: Map<string, DatabaseRoom>,
  databaseId: string,
) {
  let room = rooms.get(databaseId);

  if (!room) {
    room = { latestVersion: 0, peers: new Set() };
    rooms.set(databaseId, room);
  }

  return room;
}

function validateMutationEvent(event: DatabaseRealtimeMutationEvent) {
  if (
    event.protocolVersion !== 1 ||
    event.type !== "database.mutation" ||
    typeof event.databaseId !== "string" ||
    typeof event.version !== "number" ||
    event.version < 1
  ) {
    throw new Error("Invalid database mutation event");
  }
}

function isPresence(value: unknown): value is DatabasePresence {
  if (!value || typeof value !== "object") return false;

  const presence = value as Record<string, unknown>;

  return (
    typeof presence.columnKey === "string" &&
    presence.columnKey.length > 0 && presence.columnKey.length <= 128 &&
    typeof presence.rowId === "string" &&
    presence.rowId.length > 0 && presence.rowId.length <= 128 &&
    (presence.viewId === null ||
      (typeof presence.viewId === "string" && presence.viewId.length <= 128))
  );
}

function toCollaborator(attachment: SocketAttachment) {
  if (!attachment.presence) {
    throw new Error("Cannot serialize empty database presence");
  }

  return {
    connectedAt: new Date(attachment.connectedAt).toISOString(),
    presence: attachment.presence,
    sessionId: attachment.claims.sessionId,
    updatedAt: new Date(attachment.updatedAt ?? Date.now()).toISOString(),
    user: attachment.claims.user,
  };
}

function getClientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();

  return forwarded || request.headers.get("x-real-ip") || "local";
}

function rejectUpgrade(
  socket: Duplex,
  status: number,
  statusText: string,
) {
  if (socket.destroyed) return;

  socket.end(
    `HTTP/1.1 ${status} ${statusText}\r\n` +
    "Connection: close\r\nContent-Length: 0\r\n\r\n",
  );
}

function createConnectionLimiter(limit: number) {
  const entries = new Map<string, { count: number; windowStartedAt: number }>();

  return {
    allow(key: string) {
      const now = Date.now();
      const current = entries.get(key);

      if (!current || now - current.windowStartedAt >= CONNECTION_LIMIT_WINDOW_MS) {
        entries.set(key, { count: 1, windowStartedAt: now });
        sweepExpiredEntries(entries, now);
        return true;
      }

      if (current.count >= limit) return false;

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

  for (const [key, entry] of entries) {
    if (now - entry.windowStartedAt >= CONNECTION_LIMIT_WINDOW_MS) {
      entries.delete(key);
    }
  }
}
