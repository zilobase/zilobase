import type {
  RoomClose,
  RoomHost,
  RoomMessage,
  RoomPeer,
  Unsubscribe,
} from "@zilobase/runtime-ports";

type HibernatableSocket = {
  close(code?: number, reason?: string): void;
  deserializeAttachment?(): unknown;
  send(payload: string | ArrayBuffer | Uint8Array): void;
  serializeAttachment?(attachment: unknown): void;
};

type DurableRoomContext = {
  acceptWebSocket(socket: HibernatableSocket): void;
  getWebSockets(): HibernatableSocket[];
};

export type WorkerRoomPeer<Attachment = unknown> = RoomPeer<Attachment> & {
  readonly socket: HibernatableSocket;
};

export type WorkerRoomHost<Attachment = unknown> = RoomHost<Attachment> & {
  accept(id: string, request: Request, socket: HibernatableSocket): WorkerRoomPeer<Attachment>;
  closeEvent(socket: HibernatableSocket, event: RoomClose): Promise<void>;
  errorEvent(socket: HibernatableSocket, error: unknown): Promise<void>;
  messageEvent(socket: HibernatableSocket, message: RoomMessage): Promise<void>;
};

export function createWorkerRoomHost<Attachment = unknown>(
  context: DurableRoomContext,
): WorkerRoomHost<Attachment> {
  const bySocket = new WeakMap<HibernatableSocket, WorkerRoomPeer<Attachment>>();
  const peers = new Set<WorkerRoomPeer<Attachment>>();
  const messageHandlers = new Set<(peer: RoomPeer<Attachment>, message: RoomMessage) => void | Promise<void>>();
  const closeHandlers = new Set<(peer: RoomPeer<Attachment>, event: RoomClose) => void | Promise<void>>();
  const errorHandlers = new Set<(peer: RoomPeer<Attachment>, error: unknown) => void | Promise<void>>();
  const subscribe = <T>(set: Set<T>, handler: T): Unsubscribe => {
    set.add(handler);
    return () => { set.delete(handler); };
  };
  const peerFor = (socket: HibernatableSocket) => {
    const peer = bySocket.get(socket);
    if (!peer) throw new Error("WebSocket was not accepted by this room host");
    return peer;
  };
  const register = (
    id: string,
    request: Request,
    socket: HibernatableSocket,
    accept: boolean,
  ) => {
    let attachment = (socket.deserializeAttachment?.() ?? null) as Attachment | null;
    const peer: WorkerRoomPeer<Attachment> = {
      id,
      request,
      socket,
      getAttachment: () => attachment,
      setAttachment(value) {
        attachment = value;
        socket.serializeAttachment?.(value);
      },
    };
    bySocket.set(socket, peer);
    peers.add(peer);
    if (accept) context.acceptWebSocket(socket);
    return peer;
  };
  context.getWebSockets().forEach((socket, index) => {
    register(`restored-${index}`, new Request("https://room.invalid"), socket, false);
  });
  return {
    accept(id, request, socket) {
      return register(id, request, socket, true);
    },
    async closeEvent(socket, event) {
      const peer = peerFor(socket);
      peers.delete(peer);
      await Promise.all([...closeHandlers].map((handler) => handler(peer, event)));
    },
    async errorEvent(socket, error) {
      const peer = peerFor(socket);
      await Promise.all([...errorHandlers].map((handler) => handler(peer, error)));
    },
    async messageEvent(socket, message) {
      const peer = peerFor(socket);
      await Promise.all([...messageHandlers].map((handler) => handler(peer, message)));
    },
    onMessage: (handler) => subscribe(messageHandlers, handler),
    onClose: (handler) => subscribe(closeHandlers, handler),
    onError: (handler) => subscribe(errorHandlers, handler),
    peers: () => [...peers],
    send: (peer, payload) => (peer as WorkerRoomPeer<Attachment>).socket.send(payload),
    broadcast(payload, options) {
      for (const peer of peers) if (peer !== options?.except) peer.socket.send(payload);
    },
    close: (peer, code, reason) => (peer as WorkerRoomPeer<Attachment>).socket.close(code, reason),
  };
}
