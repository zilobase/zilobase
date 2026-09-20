import { DurableObject } from "cloudflare:workers";
import {
  DATABASE_REALTIME_PROTOCOL,
  verifyDatabaseRealtimeTicket,
  type DatabaseRealtimeTicketClaims,
} from "@zilobase/server/realtime-api";
import type { AppBindings } from "@zilobase/server/adapter-api";
import {
  databaseMutationEventV2Schema,
  type DatabaseMutationEventV2,
} from "@zilobase/features/databases";
import {
  consumeDatabaseMessageAllowance,
  isDatabasePresence,
  toDatabaseCollaborator,
  type DatabasePresence,
} from "@zilobase/features/databases/realtime/room-protocol";

import type { WorkerEnvBindings } from "../../bindings";
import {
  readDatabaseRealtimeClaims,
  validateDatabaseRealtimeMessage,
} from "./security";

type DatabaseCollaborationEnv = Cloudflare.Env &
  AppBindings["Bindings"] &
  WorkerEnvBindings;

type SocketAttachment = {
  claims: DatabaseRealtimeTicketClaims;
  connectedAt: number;
  databaseId: string;
  presence?: DatabasePresence;
  updatedAt?: number;
};

const LAST_PUBLISHED_VERSION_KEY = "lastPublishedVersion";
const REALTIME_PING_MESSAGE = JSON.stringify({ type: "realtime.ping" });
const REALTIME_PONG_MESSAGE = JSON.stringify({ type: "realtime.pong" });

export class DatabaseCollaborationRoom extends DurableObject<DatabaseCollaborationEnv> {
  private lastPublishedVersion: number | undefined;
  private readonly messageRates = new WeakMap<
    WebSocket,
    { count: number; startedAt: number }
  >();

  constructor(ctx: DurableObjectState, env: DatabaseCollaborationEnv) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(
        REALTIME_PING_MESSAGE,
        REALTIME_PONG_MESSAGE,
      ),
    );
  }

  async fetch(request: Request) {
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    const databaseId = new URL(request.url).searchParams.get("database");

    if (!databaseId || databaseId.length > 128) {
      return new Response("Invalid database", { status: 400 });
    }

    const claims = readDatabaseRealtimeClaims(request.headers);

    if (
      !claims ||
      claims.databaseId !== databaseId ||
      claims.exp <= Date.now()
    ) {
      return new Response("Unauthorized", { status: 401 });
    }

    this.pruneExpiredSockets();

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const attachment = { claims, connectedAt: Date.now(), databaseId };
    writeAttachment(server, attachment);
    this.ctx.acceptWebSocket(server);
    await this.scheduleExpiration();
    server.send(JSON.stringify({
      databaseVersion: Math.max(
        claims.version ?? 0,
        await this.getLastPublishedVersion(),
      ),
      databaseId: claims.databaseId,
      peers: this.readPeers(server, claims.databaseId),
      protocolVersion: 2,
      sessionId: claims.sessionId,
      type: "realtime.ready",
    }));

    return new Response(null, {
      headers: { "Sec-WebSocket-Protocol": DATABASE_REALTIME_PROTOCOL },
      status: 101,
      webSocket: client,
    });
  }

  async publishMutation(event: DatabaseMutationEventV2) {
    if (!isDatabaseMutationEventV2(event)) {
      throw new Error("Invalid database mutation event");
    }

    const lastPublishedVersion = await this.getLastPublishedVersion();

    if (event.version <= lastPublishedVersion) return;

    await this.ctx.storage.put(LAST_PUBLISHED_VERSION_KEY, event.version);
    this.lastPublishedVersion = event.version;
    this.pruneExpiredSockets();
    this.broadcast(event);
  }

  async webSocketMessage(ws: WebSocket, rawMessage: string | ArrayBuffer) {
    const validation = validateDatabaseRealtimeMessage(rawMessage);

    if (!validation.ok) {
      ws.close(validation.code, validation.reason);
      return;
    }

    const attachment = readAttachment(ws);

    if (!attachment) {
      ws.close(1011, "Missing database realtime session");
      return;
    }

    if (!consumeDatabaseMessageAllowance(ws, this.messageRates)) {
      this.clearPresence(ws);
      ws.close(1008, "Database realtime message rate exceeded");
      return;
    }

    const message = validation.message;

    if (message.type === "auth.refresh") {
      await this.refreshAuthentication(ws, attachment, message);
      return;
    }

    if (attachment.claims.exp <= Date.now()) {
      this.clearPresence(ws);
      ws.close(1008, "Database realtime authentication expired");
      return;
    }

    // Cloudflare normally handles this through setWebSocketAutoResponse()
    // without waking the Durable Object. Keep this fallback so a heartbeat
    // never tears down a connection if runtime behavior changes.
    if (message.type === "realtime.ping") return;

    if (message.type === "presence.update") {
      this.updatePresence(ws, attachment, message);
      return;
    }

    ws.close(1003, "Unsupported database realtime message");
  }

  async webSocketClose(ws: WebSocket) {
    this.clearPresence(ws);
    await this.scheduleExpiration();
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      event: "database_realtime_websocket_error",
    }));
    this.clearPresence(ws);
    ws.close(1011, "Database realtime WebSocket error");
    await this.scheduleExpiration();
  }

  async alarm() {
    this.pruneExpiredSockets();
    await this.scheduleExpiration();
  }

  private async refreshAuthentication(
    ws: WebSocket,
    attachment: SocketAttachment,
    message: Record<string, unknown>,
  ) {
    if (typeof message.token !== "string") {
      ws.close(1008, "Missing database realtime ticket");
      return;
    }

    try {
      const claims = await verifyDatabaseRealtimeTicket(message.token, this.env);

      if (
        claims.databaseId !== attachment.databaseId ||
        (attachment.claims &&
          claims.sessionId !== attachment.claims.sessionId)
      ) {
        throw new Error("Database realtime ticket does not match the session");
      }

      attachment.claims = claims;
      writeAttachment(ws, attachment);
      await this.scheduleExpiration();
    } catch (error) {
      console.warn(JSON.stringify({
        databaseId: attachment.databaseId,
        error: error instanceof Error ? error.message : String(error),
        event: "database_realtime_authentication_failed",
      }));
      ws.close(1008, "Database realtime authentication failed");
    }
  }

  private updatePresence(
    ws: WebSocket,
    attachment: SocketAttachment,
    message: Record<string, unknown>,
  ) {
    if (!attachment.claims.canEdit) return;

    if (message.presence === null) {
      this.clearPresence(ws);
      return;
    }

    if (!isDatabasePresence(message.presence)) {
      ws.close(1007, "Invalid database presence");
      return;
    }

    attachment.presence = message.presence;
    attachment.updatedAt = Date.now();
    writeAttachment(ws, attachment);
    this.broadcast({
      collaborator: toDatabaseCollaborator(attachment),
      databaseId: attachment.databaseId,
      protocolVersion: 2,
      type: "presence.update",
    }, ws);
  }

  private clearPresence(ws: WebSocket) {
    const attachment = readAttachment(ws);

    if (!attachment?.presence) return;

    delete attachment.presence;
    delete attachment.updatedAt;
    writeAttachment(ws, attachment);
    this.broadcast({
      databaseId: attachment.databaseId,
      protocolVersion: 2,
      sessionId: attachment.claims.sessionId,
      type: "presence.clear",
    }, ws);
  }

  private readPeers(skip: WebSocket, databaseId: string) {
    return this.ctx.getWebSockets().flatMap((candidate) => {
      if (candidate === skip) return [];
      const attachment = readAttachment(candidate);

      return attachment?.databaseId === databaseId &&
        attachment.claims.exp > Date.now() &&
        attachment.presence
        ? [toDatabaseCollaborator(attachment)]
        : [];
    });
  }

  private broadcast(message: unknown, skip?: WebSocket) {
    const encoded = JSON.stringify(message);

    for (const ws of this.ctx.getWebSockets()) {
      if (ws === skip || ws.readyState !== WebSocket.OPEN) continue;
      const attachment = readAttachment(ws);
      if (attachment && attachment.claims.exp > Date.now()) {
        ws.send(encoded);
      }
    }
  }

  private async getLastPublishedVersion() {
    if (this.lastPublishedVersion === undefined) {
      this.lastPublishedVersion =
        await this.ctx.storage.get<number>(LAST_PUBLISHED_VERSION_KEY) ?? 0;
    }

    return this.lastPublishedVersion;
  }

  private pruneExpiredSockets() {
    const now = Date.now();

    for (const ws of this.ctx.getWebSockets()) {
      const attachment = readAttachment(ws);

      if (!attachment) {
        ws.close(1011, "Missing database realtime session");
      } else if (attachment.claims.exp <= now) {
        this.clearPresence(ws);
        ws.close(1008, "Database realtime authentication expired");
      }
    }
  }

  private async scheduleExpiration() {
    const now = Date.now();
    let nextExpiration: number | null = null;

    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const attachment = readAttachment(ws);
      if (!attachment) continue;

      nextExpiration = nextExpiration === null
        ? attachment.claims.exp
        : Math.min(nextExpiration, attachment.claims.exp);
    }

    if (nextExpiration === null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    await this.ctx.storage.setAlarm(Math.max(now + 1_000, nextExpiration));
  }
}

function isDatabaseMutationEventV2(
  event: unknown,
): event is DatabaseMutationEventV2 {
  return databaseMutationEventV2Schema.safeParse(event).success;
}

function readAttachment(ws: WebSocket): SocketAttachment | null {
  const value = ws.deserializeAttachment();

  return value && typeof value === "object" &&
    typeof value.connectedAt === "number" &&
    typeof value.databaseId === "string" &&
    value.claims && typeof value.claims === "object"
    ? value as SocketAttachment
    : null;
}

function writeAttachment(ws: WebSocket, attachment: SocketAttachment) {
  ws.serializeAttachment(attachment);
}
