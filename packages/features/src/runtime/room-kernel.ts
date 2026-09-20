import type {
  RoomController,
  RoomInvocation,
  RoomMessage,
  RoomPeer,
  RoomPorts,
  Unsubscribe,
} from "@zilobase/runtime-ports";

export type RoomControllerHandlers<Attachment = unknown> = {
  alarm?: () => void | Promise<void>;
  close?: () => void | Promise<void>;
  error?: (peer: RoomPeer<Attachment>, error: unknown) => void | Promise<void>;
  invoke?: (invocation: RoomInvocation) => unknown | Promise<unknown>;
  message: (
    peer: RoomPeer<Attachment>,
    message: RoomMessage,
  ) => void | Promise<void>;
  peerClose?: (peer: RoomPeer<Attachment>) => void | Promise<void>;
  start?: () => void | Promise<void>;
};

export function createRoomController<Attachment = unknown>(
  roomId: string,
  ports: RoomPorts<Attachment>,
  handlers: RoomControllerHandlers<Attachment>,
): RoomController {
  let started = false;
  let closed = false;
  const unsubscribe: Unsubscribe[] = [];

  const report = (phase: string, error: unknown) =>
    ports.telemetry.error(error, { phase, room_id: roomId });

  return {
    async start() {
      if (started) return;
      if (closed) throw new Error("Room controller is closed");
      started = true;
      unsubscribe.push(
        ports.host.onMessage(async (peer, message) => {
          try {
            await handlers.message(peer, message);
          } catch (error) {
            await report("message", error);
          }
        }),
        ports.host.onClose(async (peer) => {
          try {
            await handlers.peerClose?.(peer);
          } catch (error) {
            await report("peer_close", error);
          }
        }),
        ports.host.onError(async (peer, error) => {
          await handlers.error?.(peer, error);
          await report("socket", error);
        }),
      );
      await handlers.start?.();
    },
    async alarm() {
      try {
        await handlers.alarm?.();
      } catch (error) {
        await report("alarm", error);
      }
    },
    invoke(invocation) {
      if (!handlers.invoke) throw new Error(`Room ${roomId} does not support invocation ${invocation.type}`);
      return handlers.invoke(invocation);
    },
    async close() {
      if (closed) return;
      closed = true;
      for (const stop of unsubscribe.splice(0).reverse()) await stop();
      await handlers.close?.();
    },
  };
}
