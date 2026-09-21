import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import type { Peer } from "crossws";
import crossws from "crossws/adapters/node";
import {
  createNotificationRoom,
  type ExpiringRoomAttachment,
  type NotificationRoomConfig,
} from "@zilobase/features/runtime/notification-room";
import { createNodeRoomHost, type NodeRoomHost, type NodeRoomPeer } from "./room-host";
import { createNodeTelemetry } from "./telemetry";
import type { NodeRealtimeBus, RealtimeSubscription } from "./realtime-bus";

type NotificationRuntimeOptions<Claims extends { exp: number }, Event> = {
  authenticate(request: Request): Promise<Claims>;
  channel(roomId: string): string;
  config: NotificationRoomConfig<Claims, Event>;
  enabled?: () => boolean;
  eventRoomId(event: Event): string;
  isRemoteEvent(value: unknown, roomId: string): value is Event;
  onClose?: (claims: Claims, outcome: "closed" | "error") => void | Promise<void>;
  onOpen?: (claims: Claims) => void | Promise<void>;
  path: string;
  protocol: string;
  ready(claims: Claims): string;
  roomId(claims: Claims): string;
};

type Room<Claims extends { exp: number }, Event> = {
  host: NodeRoomHost<ExpiringRoomAttachment<Claims>>;
  notification: ReturnType<typeof createNotificationRoom<Claims, Event>>;
  unsubscribe?: RealtimeSubscription;
};

export function attachNodeNotificationRuntime<Claims extends { exp: number }, Event>(
  server: HttpServer,
  bus: NodeRealtimeBus | null,
  options: NotificationRuntimeOptions<Claims, Event>,
) {
  const rooms = new Map<string, Room<Claims, Event>>();
  const peers = new WeakMap<Peer, NodeRoomPeer<ExpiringRoomAttachment<Claims>>>();
  const websocket = crossws({
    idleTimeout: 45,
    serverOptions: { maxPayload: 4 * 1024 },
    hooks: {
      async upgrade(request) {
        const claims = await options.authenticate(request);
        return { context: { notificationClaims: claims }, protocol: options.protocol };
      },
      async open(peer) {
        const claims = peer.context.notificationClaims as Claims | undefined;
        if (!claims) return peer.close(1008, "Invalid realtime session");
        const roomId = options.roomId(claims);
        let room = rooms.get(roomId);
        if (!room) {
          const host = createNodeRoomHost<ExpiringRoomAttachment<Claims>>();
          const notification = createNotificationRoom(roomId, {
            host,
            telemetry: createNodeTelemetry(),
          }, options.config);
          await notification.controller.start();
          room = { host, notification };
          rooms.set(roomId, room);
          if (bus) {
            room.unsubscribe = await bus.subscribe(options.channel(roomId), (payload) => {
              if (options.isRemoteEvent(payload, roomId)) notification.publish(payload);
            });
          }
        }
        const runtimePeer = room.host.connect(peer.id, peer.request as Request, peer as never);
        runtimePeer.setAttachment({ claims });
        peers.set(peer, runtimePeer);
        await options.onOpen?.(claims);
        room.host.send(runtimePeer, options.ready(claims));
      },
      async message(peer, message) {
        const runtimePeer = peers.get(peer);
        if (!runtimePeer) return;
        const room = roomForPeer(runtimePeer, rooms, options);
        if (room) await room.host.receive(runtimePeer, message.rawData as string | ArrayBuffer);
      },
      async close(peer, event) {
        await removePeer(peer, event.code ?? 1000, event.reason ?? "", true, "closed");
      },
      async error(peer, error) {
        const runtimePeer = peers.get(peer);
        if (runtimePeer) {
          await roomForPeer(runtimePeer, rooms, options)?.host.socketError(runtimePeer, error);
        }
        await removePeer(peer, 1011, options.config.errorReason, false, "error");
      },
    },
  });

  const removePeer = async (
    peer: Peer,
    code: number,
    reason: string,
    wasClean: boolean,
    outcome: "closed" | "error",
  ) => {
    const runtimePeer = peers.get(peer);
    if (!runtimePeer) return;
    peers.delete(peer);
    const claims = runtimePeer.getAttachment()?.claims;
    const roomId = claims ? options.roomId(claims) : null;
    const room = roomId ? rooms.get(roomId) : null;
    await room?.host.disconnect(runtimePeer, { code, reason, wasClean });
    if (claims) await options.onClose?.(claims, outcome);
    if (room && room.host.peers().length === 0) {
      await room.unsubscribe?.();
      await room.notification.controller.close();
      rooms.delete(roomId!);
    }
  };

  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? "/", "http://zilobase.local");
    if (url.pathname !== options.path) return;
    if (options.enabled && !options.enabled()) return rejectUpgrade(socket, "404 Not Found");
    void websocket.handleUpgrade(request, socket, head).catch(() => rejectUpgrade(socket));
  };
  server.on("upgrade", upgrade);

  return {
    async destroy() {
      server.off("upgrade", upgrade);
      await Promise.allSettled([...rooms.values()].map(async (room) => {
        await room.unsubscribe?.();
        await room.notification.controller.close();
      }));
      await websocket.close(1001, "Server shutting down");
    },
    async publish(event: Event) {
      const roomId = options.eventRoomId(event);
      rooms.get(roomId)?.notification.publish(event);
      await bus?.publish(options.channel(roomId), event);
    },
  };
}

function roomForPeer<Claims extends { exp: number }, Event>(
  peer: NodeRoomPeer<ExpiringRoomAttachment<Claims>>,
  rooms: Map<string, Room<Claims, Event>>,
  options: NotificationRuntimeOptions<Claims, Event>,
) {
  const claims = peer.getAttachment()?.claims;
  return claims ? rooms.get(options.roomId(claims)) : undefined;
}

function rejectUpgrade(socket: Duplex, status = "401 Unauthorized") {
  if (!socket.destroyed) socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}
