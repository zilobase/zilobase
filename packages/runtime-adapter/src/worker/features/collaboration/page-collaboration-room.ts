import { DurableObject } from "cloudflare:workers";
import {
  IncomingMessage,
  MessageType,
  OutgoingMessage,
  type Extension,
} from "@hocuspocus/server";
import {
  createCollaborationHocuspocus,
  pageIdFromDocumentName,
  replacePageContentInHocuspocus,
  appendPageCommentInHocuspocus,
  type AppBindings,
  type CollaborationContext,
  type CollaborationDocumentPersistence,
} from "@zilobase/server/adapter-api";
import type { WorkerEnvBindings } from "../../bindings";
import {
  selectCollaborationWebSocketProtocol,
  validateCollaborationMessage,
  validateCollaborationUpgradeRequest,
} from "./security";

export type PageCollaborationEnv = Cloudflare.Env &
  AppBindings["Bindings"] &
  WorkerEnvBindings;

type HibernationContext = CollaborationContext & {
  hibernationConnectionId?: string;
};

type SocketAttachment = {
  authMessage?: ArrayBuffer;
  awarenessMessage?: ArrayBuffer;
  connectedAt: number;
  connectionId: string;
  documentName: string;
  messageAddress?: string;
  requestUrl: string;
  tokenExpiresAt?: number;
  tokenRefreshRequestedAt?: number;
};

type LiveConnection = {
  client: ReturnType<
    ReturnType<typeof createCollaborationHocuspocus>["handleConnection"]
  >;
  ready: Promise<void>;
};

type PendingConnection = {
  armTimeout(): void;
  reject(reason: unknown): void;
  resolve(): void;
};

type PendingMessage = {
  promise: Promise<void>;
  resolve(): void;
};

const AUTH_MESSAGE_TYPE_TOKEN = 0;
const AUTH_TIMEOUT_MS = 15_000;
const UNAUTHENTICATED_TIMEOUT_MS = 60_000;
const TOKEN_REFRESH_LEAD_MS = 60_000;
const TOKEN_REFRESH_GRACE_MS = 30_000;

export class PageCollaborationRoom extends DurableObject<PageCollaborationEnv> {
  protected readonly hocuspocus;
  private readonly connections = new Map<WebSocket, LiveConnection>();
  private readonly pendingConnections = new Map<string, PendingConnection>();
  private readonly pendingMessages = new Map<string, PendingMessage[]>();
  private awarenessRestored = false;

  constructor(
    ctx: DurableObjectState,
    env: PageCollaborationEnv,
    persistence?: CollaborationDocumentPersistence,
  ) {
    super(ctx, env);
    this.hocuspocus = createCollaborationHocuspocus(env, persistence);
    this.hocuspocus.configuration.extensions.push({
      connected: async ({ context }) => {
        const connectionId = (context as HibernationContext)
          .hibernationConnectionId;

        if (connectionId) {
          this.pendingConnections.get(connectionId)?.resolve();
        }
      },
      afterHandleMessage: async ({ context }) => {
        const connectionId = (context as HibernationContext)
          .hibernationConnectionId;
        const pending = connectionId
          ? this.pendingMessages.get(connectionId)?.shift()
          : undefined;

        pending?.resolve();
        if (connectionId && this.pendingMessages.get(connectionId)?.length === 0) {
          this.pendingMessages.delete(connectionId);
        }
      },
    } satisfies Extension<CollaborationContext>);
  }

  protected parseDocumentId(documentName: string) {
    return pageIdFromDocumentName(documentName);
  }

  async fetch(request: Request) {
    const startedAt = performance.now();
    const validation = validateCollaborationUpgradeRequest(
      request,
      (documentName) => this.parseDocumentId(documentName),
    );
    if (!validation.ok) return validation.response;
    const { documentName } = validation;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.binaryType = "arraybuffer";
    const attachment: SocketAttachment = {
      connectedAt: Date.now(),
      connectionId: crypto.randomUUID(),
      documentName,
      requestUrl: request.url,
    };

    writeAttachment(server, attachment);
    this.ctx.acceptWebSocket(server);
    this.scheduleMaintenanceInBackground();

    console.info(JSON.stringify({
      event: "collaboration_do_upgrade_accepted",
      handlerMs: Math.round(performance.now() - startedAt),
    }));

    const protocol = selectCollaborationWebSocketProtocol(request.headers);

    return new Response(null, {
      headers: protocol ? { "Sec-WebSocket-Protocol": protocol } : undefined,
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, rawMessage: string | ArrayBuffer) {
    const validation = validateCollaborationMessage(rawMessage);

    if (!validation.ok) {
      console.warn(JSON.stringify({
        event: "collaboration_invalid_websocket_message",
        messageBytes: validation.messageBytes,
        reason: validation.reason,
      }));
      ws.close(validation.code, validation.reason);
      return;
    }

    const message = validation.message;
    const attachment = readAttachment(ws);

    if (!attachment) {
      ws.close(1011, "Missing collaboration session");
      return;
    }

    const metadata = readMessageMetadata(message);
    const hadLiveConnection = this.connections.has(ws);

    if (metadata && metadata.type === MessageType.Auth && metadata.token) {
      attachment.authMessage = copyArrayBuffer(message);
      attachment.messageAddress = metadata.messageAddress;
      attachment.tokenExpiresAt = readTicketExpiration(metadata.token);
      delete attachment.tokenRefreshRequestedAt;
      writeAttachment(ws, attachment);
      await this.scheduleMaintenance();
    } else if (metadata?.type === MessageType.Awareness) {
      attachment.awarenessMessage = copyArrayBuffer(message);
      writeAttachment(ws, attachment);
    }

    if (!attachment.authMessage) {
      this.getOrCreateConnection(ws, attachment).client.handleMessage(message);
      return;
    }

    if (metadata?.type === MessageType.Auth && hadLiveConnection) {
      this.pendingConnections.get(attachment.connectionId)?.armTimeout();
      const connection = this.connections.get(ws);
      if (connection) {
        await this.handleLiveMessage(connection, attachment, message);
      }
    }

    const restoreStartedAt = performance.now();
    await this.restoreConnections(ws);

    if (metadata?.type === MessageType.Auth && !hadLiveConnection) {
      console.info(JSON.stringify({
        connectionId: attachment.connectionId,
        documentName: attachment.documentName,
        event: "collaboration_initial_sync_ready",
        restoreMs: Math.round(performance.now() - restoreStartedAt),
      }));
    }

    if (metadata?.type !== MessageType.Auth) {
      const connection = this.connections.get(ws);
      if (connection) {
        await this.handleLiveMessage(connection, attachment, message);
      }
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ) {
    const attachment = readAttachment(ws);

    const expectedClose = wasClean && (
      code === 1000 || code === 1001 || code === 1005
    );
    if (!expectedClose) {
      console.warn(JSON.stringify({
        code,
        documentName: attachment?.documentName,
        event: "collaboration_websocket_closed",
        reason,
        wasClean,
      }));
    }

    await this.closeConnection(ws, code, reason);
    await this.scheduleMaintenance();
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    const attachment = readAttachment(ws);
    console.error(JSON.stringify({
      documentName: attachment?.documentName,
      error: error instanceof Error ? error.message : String(error),
      event: "collaboration_websocket_error",
    }));
    await this.closeConnection(ws, 1011, "Collaboration WebSocket error");
    ws.close(1011, "Collaboration WebSocket error");
    await this.scheduleMaintenance();
  }

  async alarm() {
    const now = Date.now();

    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (isForeignRoomSocket(ws)) continue;
      const attachment = readAttachment(ws);

      if (!attachment) {
        ws.close(1011, "Missing collaboration session");
        continue;
      }

      if (!attachment.authMessage) {
        if (attachment.connectedAt + UNAUTHENTICATED_TIMEOUT_MS <= now) {
          ws.close(1008, "Collaboration authentication timed out");
        }
        continue;
      }

      if (attachment.tokenRefreshRequestedAt) {
        if (
          attachment.tokenRefreshRequestedAt + TOKEN_REFRESH_GRACE_MS <= now
        ) {
          await this.closeConnection(
            ws,
            1008,
            "Collaboration authentication refresh timed out",
          );
          ws.close(1008, "Collaboration authentication refresh timed out");
        }
        continue;
      }

      if (
        attachment.tokenExpiresAt &&
        attachment.tokenExpiresAt - TOKEN_REFRESH_LEAD_MS <= now &&
        attachment.messageAddress
      ) {
        ws.send(
          new OutgoingMessage(attachment.messageAddress)
            .writeTokenSyncRequest()
            .toUint8Array(),
        );
        attachment.tokenRefreshRequestedAt = now;
        writeAttachment(ws, attachment);
      }
    }

    await this.runAdditionalMaintenance(now);
    await this.scheduleMaintenance();
  }

  async replacePageContent(
    content: unknown,
    pageId: string,
    userId: string,
  ) {
    await this.restoreConnections();
    await replacePageContentInHocuspocus(this.hocuspocus, {
      content,
      pageId,
      userId,
    });
  }

  async appendPageComment(input: Parameters<typeof appendPageCommentInHocuspocus>[1]) {
    await this.restoreConnections();
    return appendPageCommentInHocuspocus(this.hocuspocus, input);
  }

  private createConnection(
    ws: WebSocket,
    attachment: SocketAttachment,
  ): LiveConnection {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let settle: PendingConnection | undefined;
    const ready = new Promise<void>((resolve, reject) => {
      settle = {
        armTimeout: () => {
          if (timeout) return;
          timeout = setTimeout(() => {
            settle?.reject(new Error("Collaboration authentication timed out"));
            ws.close(1008, "Collaboration authentication timed out");
          }, AUTH_TIMEOUT_MS);
        },
        reject: (reason) => {
          if (timeout) clearTimeout(timeout);
          this.pendingConnections.delete(attachment.connectionId);
          reject(reason);
        },
        resolve: () => {
          if (timeout) clearTimeout(timeout);
          this.pendingConnections.delete(attachment.connectionId);
          resolve();
        },
      };
    });
    void ready.catch(() => undefined);

    this.pendingConnections.set(attachment.connectionId, settle!);

    const defaultContext: HibernationContext = {
      exp: 0,
      hibernationConnectionId: attachment.connectionId,
      pageId: attachment.documentName,
      scope: "readonly",
      userId: "",
      workspaceId: "",
    };
    const client = this.hocuspocus.handleConnection(
      ws,
      new Request(attachment.requestUrl),
      defaultContext,
    );

    // Hocuspocus uses a process-style health-check interval. Cloudflare owns
    // WebSocket liveness, and scheduled intervals prevent Durable Objects from
    // hibernating, so the bridge replaces it with the maintenance alarm above.
    clearInterval(client.pingInterval);

    const connection = { client, ready };
    this.connections.set(ws, connection);

    if (attachment.authMessage) {
      settle?.armTimeout();
      client.handleMessage(new Uint8Array(attachment.authMessage));
    }

    return connection;
  }

  private getOrCreateConnection(
    ws: WebSocket,
    attachment: SocketAttachment,
  ) {
    return this.connections.get(ws) ?? this.createConnection(ws, attachment);
  }

  private handleLiveMessage(
    connection: LiveConnection,
    attachment: SocketAttachment,
    message: Uint8Array,
  ) {
    let resolve!: () => void;
    const promise = new Promise<void>((complete) => {
      resolve = complete;
    });
    const pending = { promise, resolve };
    const queue = this.pendingMessages.get(attachment.connectionId) ?? [];
    queue.push(pending);
    this.pendingMessages.set(attachment.connectionId, queue);
    connection.client.handleMessage(message);
    return promise;
  }

  protected async restoreConnections(skipAwarenessFor?: WebSocket) {
    const ready: Promise<void>[] = [];

    for (const ws of this.ctx.getWebSockets()) {
      const attachment = readAttachment(ws);

      if (!attachment?.authMessage) continue;
      ready.push(this.getOrCreateConnection(ws, attachment).ready);
    }

    await Promise.all(ready);

    if (this.awarenessRestored) return;
    this.awarenessRestored = true;

    for (const ws of this.ctx.getWebSockets()) {
      if (ws === skipAwarenessFor) continue;
      const attachment = readAttachment(ws);

      if (attachment?.awarenessMessage) {
        this.connections
          .get(ws)
          ?.client.handleMessage(new Uint8Array(attachment.awarenessMessage));
      }
    }
  }

  private async closeConnection(ws: WebSocket, code: number, reason: string) {
    const attachment = readAttachment(ws);
    const connection = this.connections.get(ws);

    try {
      if (connection) {
        // ClientConnection processes frames asynchronously. A browser reload can
        // deliver the close event while its final Yjs update is still queued, so
        // drain that queue and synchronously run the pending document store before
        // releasing the Hocuspocus connection. Durable Objects may hibernate as
        // soon as this event completes; an in-memory debounce is not a durability
        // boundary.
        const pending = attachment
          ? this.pendingMessages.get(attachment.connectionId) ?? []
          : [];
        await Promise.all(pending.map((message) => message.promise));
        const document = attachment
          ? this.hocuspocus.documents.get(attachment.documentName)
          : undefined;

        if (document) {
          await this.hocuspocus.storeDocumentHooks(document, {
            clientsCount: document.getConnectionsCount(),
            document,
            documentName: document.name,
            instance: this.hocuspocus,
            lastContext: {},
            lastTransactionOrigin: null,
          }, true);
        }
      }
    } finally {
      connection?.client.handleClose({ code, reason });
      this.connections.delete(ws);

      if (attachment) {
        this.pendingMessages.delete(attachment.connectionId);
        this.pendingConnections
          .get(attachment.connectionId)
          ?.reject(new Error(reason || "Collaboration connection closed"));
      }
    }
  }

  protected getAdditionalMaintenanceAt(): number | null {
    return null;
  }

  protected async runAdditionalMaintenance(_now: number) {}

  protected async scheduleMaintenance() {
    const now = Date.now();
    let nextMaintenance = this.getAdditionalMaintenanceAt();

    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const attachment = readAttachment(ws);
      if (!attachment) continue;

      let candidate: number;

      if (!attachment.authMessage) {
        candidate = attachment.connectedAt + UNAUTHENTICATED_TIMEOUT_MS;
      } else if (attachment.tokenRefreshRequestedAt) {
        candidate =
          attachment.tokenRefreshRequestedAt + TOKEN_REFRESH_GRACE_MS;
      } else if (attachment.tokenExpiresAt) {
        candidate = attachment.tokenExpiresAt - TOKEN_REFRESH_LEAD_MS;
      } else {
        continue;
      }
      nextMaintenance = nextMaintenance === null
        ? candidate
        : Math.min(nextMaintenance, candidate);
    }

    if (nextMaintenance === null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    await this.ctx.storage.setAlarm(Math.max(now + 1_000, nextMaintenance));
  }

  protected scheduleMaintenanceInBackground() {
    this.ctx.waitUntil(
      this.scheduleMaintenance().catch((error) => {
        console.error(JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          event: "collaboration_maintenance_schedule_failed",
        }));
      }),
    );
  }
}

function readAttachment(ws: WebSocket): SocketAttachment | null {
  const attachment = ws.deserializeAttachment();

  if (
    !attachment ||
    typeof attachment !== "object" ||
    typeof attachment.connectedAt !== "number" ||
    typeof attachment.connectionId !== "string" ||
    typeof attachment.documentName !== "string" ||
    typeof attachment.requestUrl !== "string"
  ) {
    return null;
  }

  return attachment as SocketAttachment;
}

function isForeignRoomSocket(ws: WebSocket) {
  const attachment = ws.deserializeAttachment();
  return Boolean(
    attachment &&
      typeof attachment === "object" &&
      "kind" in attachment &&
      (attachment as { kind?: unknown }).kind !== "collaboration",
  );
}

function writeAttachment(ws: WebSocket, attachment: SocketAttachment) {
  try {
    ws.serializeAttachment(attachment);
  } catch (error) {
    if (!attachment.awarenessMessage) throw error;

    // Attachments are capped at 16 KiB. Authentication is required to restore
    // a connection, while awareness is ephemeral and will be resent by Yjs.
    delete attachment.awarenessMessage;
    ws.serializeAttachment(attachment);
  }
}

function readMessageMetadata(message: Uint8Array) {
  try {
    const incoming = new IncomingMessage(message);
    const messageAddress = incoming.readVarString();
    const type = incoming.readVarUint();

    if (type !== MessageType.Auth) {
      return { messageAddress, type };
    }

    const authType = incoming.readVarUint();
    return {
      messageAddress,
      token: authType === AUTH_MESSAGE_TYPE_TOKEN
        ? incoming.readVarString()
        : undefined,
      type,
    };
  } catch {
    return null;
  }
}

function copyArrayBuffer(message: Uint8Array) {
  return message.slice().buffer;
}

function readTicketExpiration(token: string) {
  const encoded = token.split(".", 1)[0];
  if (!encoded) return undefined;

  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const claims = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp : undefined;
  } catch {
    return undefined;
  }
}
