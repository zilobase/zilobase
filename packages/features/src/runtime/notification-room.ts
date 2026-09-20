import type {
  RoomHost,
  RoomMessage,
  RoomPeer,
  Telemetry,
} from "@zilobase/runtime-ports";
import { createRoomController } from "./room-kernel";

export type ExpiringRoomAttachment<Claims extends { exp: number }> = {
  claims: Claims;
};

export type NotificationRoomConfig<Claims extends { exp: number }, Event> = {
  encode(event: Event): RoomMessage;
  errorReason: string;
  expiredReason: string;
  invalidEventReason?: string;
  matches(claims: Claims, event: Event): boolean;
  ping: string;
  pong: string;
  validate(event: unknown): event is Event;
};

export function createNotificationRoom<Claims extends { exp: number }, Event>(
  roomId: string,
  ports: {
    host: RoomHost<ExpiringRoomAttachment<Claims>>;
    telemetry: Telemetry;
  },
  config: NotificationRoomConfig<Claims, Event>,
) {
  const controller = createRoomController(roomId, ports, {
    message(peer, message) {
      handleMessage(peer, message, ports.host, config);
    },
    error(peer) {
      ports.host.close(peer, 1011, config.errorReason);
    },
  });

  return {
    controller,
    pruneExpired() {
      for (const peer of ports.host.peers()) {
        if (isExpired(peer)) ports.host.close(peer, 1008, config.expiredReason);
      }
    },
    publish(value: unknown) {
      if (!config.validate(value)) {
        throw new Error(config.invalidEventReason ?? `Invalid ${roomId} notification event`);
      }
      const payload = config.encode(value);
      for (const peer of ports.host.peers()) {
        const claims = peer.getAttachment()?.claims;
        if (!claims || claims.exp <= Date.now()) {
          ports.host.close(peer, 1008, config.expiredReason);
        } else if (config.matches(claims, value)) {
          ports.host.send(peer, payload);
        }
      }
    },
  };
}

function handleMessage<Claims extends { exp: number }, Event>(
  peer: RoomPeer<ExpiringRoomAttachment<Claims>>,
  message: RoomMessage,
  host: RoomHost<ExpiringRoomAttachment<Claims>>,
  config: NotificationRoomConfig<Claims, Event>,
) {
  if (typeof message !== "string" || message.length > 4_096) {
    host.close(peer, 1003, "Invalid realtime message");
    return;
  }
  if (isExpired(peer)) {
    host.close(peer, 1008, config.expiredReason);
    return;
  }
  if (message === config.ping) host.send(peer, config.pong);
  else host.close(peer, 1003, "Unsupported realtime message");
}

function isExpired<Claims extends { exp: number }>(
  peer: RoomPeer<ExpiringRoomAttachment<Claims>>,
) {
  return (peer.getAttachment()?.claims.exp ?? 0) <= Date.now();
}
