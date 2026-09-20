import type {
  RoomClose,
  RoomHost,
  RoomMessage,
  RoomPeer,
  Unsubscribe,
} from "@zilobase/runtime-ports";

type NodeSocket = {
  close(code?: number, reason?: string): void;
  send(payload: string | ArrayBuffer | Uint8Array): void;
};

export type NodeRoomPeer<Attachment = unknown> = RoomPeer<Attachment> & {
  readonly socket: NodeSocket;
};

export type NodeRoomHost<Attachment = unknown> = RoomHost<Attachment> & {
  connect(id: string, request: Request, socket: NodeSocket): NodeRoomPeer<Attachment>;
  disconnect(peer: NodeRoomPeer<Attachment>, event: RoomClose): Promise<void>;
  receive(peer: NodeRoomPeer<Attachment>, message: RoomMessage): Promise<void>;
  socketError(peer: NodeRoomPeer<Attachment>, error: unknown): Promise<void>;
};

export function createNodeRoomHost<Attachment = unknown>(): NodeRoomHost<Attachment> {
  const peers = new Set<NodeRoomPeer<Attachment>>();
  const messageHandlers = new Set<(peer: RoomPeer<Attachment>, message: RoomMessage) => void | Promise<void>>();
  const closeHandlers = new Set<(peer: RoomPeer<Attachment>, event: RoomClose) => void | Promise<void>>();
  const errorHandlers = new Set<(peer: RoomPeer<Attachment>, error: unknown) => void | Promise<void>>();
  const subscribe = <T>(set: Set<T>, handler: T): Unsubscribe => {
    set.add(handler);
    return () => { set.delete(handler); };
  };
  return {
    connect(id, request, socket) {
      let attachment: Attachment | null = null;
      const peer: NodeRoomPeer<Attachment> = {
        id,
        request,
        socket,
        getAttachment: () => attachment,
        setAttachment: (value) => { attachment = value; },
      };
      peers.add(peer);
      return peer;
    },
    async disconnect(peer, event) {
      peers.delete(peer);
      await Promise.all([...closeHandlers].map((handler) => handler(peer, event)));
    },
    async receive(peer, message) {
      await Promise.all([...messageHandlers].map((handler) => handler(peer, message)));
    },
    async socketError(peer, error) {
      await Promise.all([...errorHandlers].map((handler) => handler(peer, error)));
    },
    onMessage: (handler) => subscribe(messageHandlers, handler),
    onClose: (handler) => subscribe(closeHandlers, handler),
    onError: (handler) => subscribe(errorHandlers, handler),
    peers: () => [...peers],
    send: (peer, payload) => (peer as NodeRoomPeer<Attachment>).socket.send(payload),
    broadcast(payload, options) {
      for (const peer of peers) if (peer !== options?.except) peer.socket.send(payload);
    },
    close: (peer, code, reason) => (peer as NodeRoomPeer<Attachment>).socket.close(code, reason),
  };
}
