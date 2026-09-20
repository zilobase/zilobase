import type {
  BackgroundLane,
  BackgroundTask,
  DbScope,
  FanoutBus,
  ImageStorage,
  Meetings,
  Ports,
  RoomHost,
  RoomMessage,
  RoomPeer,
  RoomPorts,
  RoomState,
  RuntimeEnv,
  Scheduler,
  Unsubscribe,
} from "./index";

type Listener<T extends unknown[]> = (...args: T) => void | Promise<void>;

export class FakeRoomState implements RoomState {
  private alarm: number | null = null;
  private readonly values = new Map<string, unknown>();

  async get<T>(key: string) { return this.values.get(key) as T | undefined; }
  async put<T>(key: string, value: T) { this.values.set(key, value); }
  async delete(key: string) { return this.values.delete(key); }
  async list<T>(options: { prefix?: string } = {}) {
    return new Map(
      [...this.values.entries()]
        .filter(([key]) => !options.prefix || key.startsWith(options.prefix))
        .map(([key, value]) => [key, value as T]),
    );
  }
  async getAlarm() { return this.alarm; }
  async setAlarm(timestamp: number | null) { this.alarm = timestamp; }
}

export class FakeRoomHost<Attachment = unknown> implements RoomHost<Attachment> {
  private readonly closeListeners = new Set<Listener<[RoomPeer<Attachment>, { code: number; reason: string; wasClean: boolean }]>>();
  private readonly errorListeners = new Set<Listener<[RoomPeer<Attachment>, unknown]>>();
  private readonly messageListeners = new Set<Listener<[RoomPeer<Attachment>, RoomMessage]>>();
  private readonly roomPeers = new Set<RoomPeer<Attachment>>();
  readonly sent: Array<{ payload: RoomMessage; peerId: string }> = [];
  readonly closed: Array<{ code: number; peerId: string; reason: string }> = [];

  onMessage(handler: Listener<[RoomPeer<Attachment>, RoomMessage]>) { return subscribe(this.messageListeners, handler); }
  onClose(handler: Listener<[RoomPeer<Attachment>, { code: number; reason: string; wasClean: boolean }]>) { return subscribe(this.closeListeners, handler); }
  onError(handler: Listener<[RoomPeer<Attachment>, unknown]>) { return subscribe(this.errorListeners, handler); }
  peers() { return [...this.roomPeers]; }
  send(peer: RoomPeer<Attachment>, payload: RoomMessage) { this.sent.push({ payload, peerId: peer.id }); }
  broadcast(payload: RoomMessage, options: { except?: RoomPeer<Attachment> } = {}) {
    for (const peer of this.roomPeers) if (peer !== options.except) this.send(peer, payload);
  }
  close(peer: RoomPeer<Attachment>, code: number, reason: string) {
    this.closed.push({ code, peerId: peer.id, reason });
    this.roomPeers.delete(peer);
  }
  connect(id: string, request = new Request("http://runtime.test")) {
    let attachment: Attachment | null = null;
    const peer: RoomPeer<Attachment> = {
      id,
      request,
      getAttachment: () => attachment,
      setAttachment: (value) => { attachment = value; },
    };
    this.roomPeers.add(peer);
    return peer;
  }
  async receive(peer: RoomPeer<Attachment>, message: RoomMessage) {
    for (const listener of this.messageListeners) await listener(peer, message);
  }
}

export class FakeFanoutBus implements FanoutBus {
  private readonly handlers = new Map<string, Set<(payload: unknown) => void | Promise<void>>>();
  readonly published: Array<{ channel: string; payload: unknown }> = [];

  async publish(channel: string, payload: unknown) {
    this.published.push({ channel, payload });
    for (const handler of this.handlers.get(channel) ?? []) await handler(payload);
  }
  async subscribe(channel: string, handler: (payload: unknown) => void | Promise<void>) {
    const handlers = this.handlers.get(channel) ?? new Set();
    handlers.add(handler);
    this.handlers.set(channel, handlers);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) this.handlers.delete(channel);
    };
  }
}

export class FakeScheduler implements Scheduler {
  readonly alarms: Array<number | null> = [];
  readonly deferred: Promise<unknown>[] = [];
  after(_milliseconds: number, operation: () => void | Promise<void>): Unsubscribe {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void operation(); });
    return () => { cancelled = true; };
  }
  async setAlarm(timestamp: number | null) { this.alarms.push(timestamp); }
  waitUntil(promise: Promise<unknown>) { this.deferred.push(promise); }
}

export function createFakePorts<Database = unknown>(options: {
  database?: Database;
  env?: RuntimeEnv;
} = {}): Ports<Database> & RoomPorts<unknown, Database> & {
  dispatched: BackgroundTask[];
  drained: BackgroundLane[];
  fanout: FakeFanoutBus;
  host: FakeRoomHost;
  scheduler: FakeScheduler;
  state: FakeRoomState;
} {
  const env = options.env ?? {};
  const database = options.database as Database;
  const dispatched: BackgroundTask[] = [];
  const drained: BackgroundLane[] = [];
  const fanout = new FakeFanoutBus();
  const host = new FakeRoomHost();
  const state = new FakeRoomState();
  const scheduler = new FakeScheduler();
  const db: DbScope<Database> = {
    run: async (_env, operation) => operation(database),
    runIndependent: async (_env, operation) => operation(database),
  };
  const unavailable = (name: string) => async () => { throw new Error(`Fake ${name} is not configured`); };
  const blobs = {
    mode: "binding",
    checkReady: async () => undefined,
    putObject: unavailable("blobs.putObject"),
    get: unavailable("blobs.get"),
    head: unavailable("blobs.head"),
    delete: unavailable("blobs.delete"),
    createUploadUrl: unavailable("blobs.createUploadUrl"),
    createReadUrl: unavailable("blobs.createReadUrl"),
  } as ImageStorage;
  const meetings = {
    claim: unavailable("meetings.claim"),
    transition: unavailable("meetings.transition"),
    release: unavailable("meetings.release"),
    get: async () => null,
    applyTranscript: unavailable("meetings.applyTranscript"),
    applySummary: unavailable("meetings.applySummary"),
  } as Meetings;

  return {
    blobs,
    context: { run: async (_scope, operation) => operation() },
    db,
    dispatched,
    drained,
    env: {
      get: (key) => typeof env[key] === "string" ? env[key] as string : undefined,
      require(key) {
        const value = this.get(key);
        if (!value) throw new Error(`${key} is required`);
        return value;
      },
    },
    fanout,
    http: {
      serve: async () => undefined,
      fetch: async (api, request, runtimeEnv, execution) => api.fetch(request, runtimeEnv, execution),
      close: async () => undefined,
    },
    host,
    jobs: {
      dispatch: async (tasks) => { dispatched.push(...tasks); },
      drain: async (lane) => { drained.push(lane); },
    },
    lifecycle: { migrate: async () => undefined, start: async () => undefined, close: async () => undefined },
    limits: { consume: async () => true },
    mailer: { send: async () => undefined },
    meetings,
    outbound: {
      fetchWebhook: unavailable("outbound.fetchWebhook"),
      fetchMcp: unavailable("outbound.fetchMcp"),
    },
    scheduler,
    state,
    telemetry: {
      error: () => undefined,
      event: () => undefined,
      metrics: () => "",
      health: async () => ({ healthy: true }),
    },
    urls: {
      getCollabUrl(endpoint, request) {
        const url = new URL(request.url);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        url.pathname = `/${endpoint}`;
        url.search = "";
        url.hash = "";
        return url.toString();
      },
    },
  };
}

function subscribe<T extends unknown[]>(listeners: Set<Listener<T>>, handler: Listener<T>): Unsubscribe {
  listeners.add(handler);
  return () => { listeners.delete(handler); };
}
