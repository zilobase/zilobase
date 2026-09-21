export type RuntimeKind = "node" | "worker";
export type RuntimeEnv = Record<string, unknown>;
export type Unsubscribe = () => void | Promise<void>;

export type BackgroundLane = "ai" | "automation" | "fast" | "mail";

export type BackgroundTask = {
  availableAt: string;
  cellId: string;
  kind: string;
  resourceId: string;
  traceparent?: string;
  tracestate?: string;
  version: number;
};

export type BackgroundResult =
  | { outcome: "completed" }
  | { availableAt: string; outcome: "retry" }
  | { errorCode?: string; outcome: "terminal" };

export type RoomMessage = string | ArrayBuffer | Uint8Array;

export type RoomClose = {
  code: number;
  reason: string;
  wasClean: boolean;
};

export type RoomPeer<Attachment = unknown> = {
  readonly id: string;
  readonly request: Request;
  getAttachment(): Attachment | null;
  setAttachment(value: Attachment): void;
};

export interface RoomHost<Attachment = unknown> {
  onMessage(handler: (peer: RoomPeer<Attachment>, message: RoomMessage) => void | Promise<void>): Unsubscribe;
  onClose(handler: (peer: RoomPeer<Attachment>, event: RoomClose) => void | Promise<void>): Unsubscribe;
  onError(handler: (peer: RoomPeer<Attachment>, error: unknown) => void | Promise<void>): Unsubscribe;
  peers(): readonly RoomPeer<Attachment>[];
  send(peer: RoomPeer<Attachment>, payload: RoomMessage): void;
  broadcast(payload: RoomMessage, options?: { except?: RoomPeer<Attachment> }): void;
  close(peer: RoomPeer<Attachment>, code: number, reason: string): void;
}

export interface RoomState {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T>(options?: { prefix?: string }): Promise<Map<string, T>>;
  getAlarm(): Promise<number | null>;
  setAlarm(timestamp: number | null): Promise<void>;
}

export interface FanoutBus {
  publish(channel: string, payload: unknown): Promise<void>;
  subscribe(channel: string, handler: (payload: unknown) => void | Promise<void>): Promise<Unsubscribe>;
}

export interface Scheduler {
  after(milliseconds: number, operation: () => void | Promise<void>): Unsubscribe;
  setAlarm(timestamp: number | null): Promise<void>;
  waitUntil(promise: Promise<unknown>): void;
}

export interface Jobs {
  dispatch(tasks: readonly BackgroundTask[]): Promise<void>;
  drain(lane: BackgroundLane): Promise<void>;
}

export interface DbScope<Database = unknown> {
  run<T>(env: RuntimeEnv, operation: (database: Database) => T | Promise<T>): Promise<T>;
  runIndependent<T>(env: RuntimeEnv, operation: (database: Database) => T | Promise<T>): Promise<T>;
}

export type StoredObjectMetadata = {
  byteSize?: number;
  contentType?: string;
  etag?: string;
  uploadedAt?: Date;
};

export type ImageStorageMode = "binding" | "s3";

export interface ImageStorage {
  readonly mode: ImageStorageMode;
  checkReady(): Promise<void>;
  putObject(options: {
    body: ReadableStream | ArrayBuffer | Blob;
    contentType: string;
    objectKey: string;
  }): Promise<StoredObjectMetadata>;
  get(objectKey: string): Promise<(StoredObjectMetadata & { body: ReadableStream }) | null>;
  head(objectKey: string): Promise<StoredObjectMetadata | null>;
  delete(objectKey: string): Promise<void>;
  createUploadUrl(options: {
    byteSize: number;
    contentType: string;
    expiresInSeconds: number;
    objectKey: string;
  }): Promise<{
    expiresAt: string;
    headers: Record<string, string>;
    method: "PUT";
    storageMode: ImageStorageMode;
    url: string;
  }>;
  createReadUrl(options: {
    expiresInSeconds: number;
    filename?: string;
    objectKey: string;
  }): Promise<string>;
}

export type OutboundEmailMessage = {
  from: string;
  html: string;
  subject: string;
  text: string;
  to: string;
};

export interface Mailer {
  send(message: OutboundEmailMessage): Promise<void>;
}

export type OutboundRequest = {
  body: string | null;
  headers: Record<string, string>;
  method: string;
  pinnedAddress?: string;
  signal?: AbortSignal;
  timeoutMs: number;
  url: string;
};

export interface OutboundFetch {
  fetchWebhook(request: OutboundRequest & { body: string; pinnedAddress: string }): Promise<Response>;
  fetchMcp(request: OutboundRequest): Promise<Response>;
}

export type RealtimeEndpoint =
  | "calendar"
  | "collaboration"
  | "database"
  | "mail"
  | "meeting-audio"
  | "meeting-collaboration"
  | "navigation";

export interface UrlResolver {
  getCollabUrl(endpoint: RealtimeEndpoint, request: Request): string;
}

export type FetchApplication = {
  fetch(request: Request, env: RuntimeEnv, execution?: unknown): Response | Promise<Response>;
};

export interface HttpHost {
  serve(api: FetchApplication, webDist?: string): Promise<void>;
  fetch(api: FetchApplication, request: Request, env: RuntimeEnv, execution?: unknown): Promise<Response>;
  close(): Promise<void>;
}

export type RequestScope<Database = unknown> = {
  database: Database;
  env: RuntimeEnv;
  execution?: unknown;
};

export interface RequestContext<Database = unknown> {
  run<T>(scope: RequestScope<Database>, operation: () => T | Promise<T>): Promise<T>;
}

export interface Limits {
  consume(key: string, limit: number, windowMs: number): Promise<boolean>;
}

export type MeetingRecorderState = {
  durationMs: number;
  expiresAt: number;
  leaseId: string;
  recorderId: string;
  recorderImage: string | null;
  recorderName: string;
  startedAt: number;
  status: "claimed" | "finishing" | "paused" | "recording";
};

export type MeetingRecorderInput = {
  leaseId?: string;
  meetingId: string;
  userId: string;
};

export interface Meetings {
  claim(input: MeetingRecorderInput & {
    recorderImage?: string | null;
    recorderName?: string;
    workspaceId: string;
  }): Promise<MeetingRecorderState>;
  transition(input: MeetingRecorderInput & {
    action: "pause" | "resume" | "start" | "stop";
    durationMs?: number;
  }): Promise<MeetingRecorderState>;
  release(input: MeetingRecorderInput): Promise<void>;
  get(meetingId: string): Promise<MeetingRecorderState | null>;
  applyTranscript(input: {
    draftItemId?: string;
    meetingId: string;
    segment: { id: string; source: "microphone" | "system"; startMs: number; text: string };
    userId: string;
  }): Promise<void>;
  applySummary(input: { content: unknown; meetingId: string; userId: string }): Promise<void>;
}

export interface Documents {
  appendPageComment(input: {
    author: { email: string | null; id: string; image: string | null; name: string | null };
    body: string;
    pageId: string;
  }): Promise<{ messageId: string; threadId: string }>;
}

export type TelemetryProperties = Record<string, boolean | number | string | null | undefined>;

export interface Telemetry {
  error(error: unknown, properties?: TelemetryProperties): void | Promise<void>;
  event(name: string, properties?: TelemetryProperties): void | Promise<void>;
  metrics(): Promise<string> | string;
  health(): Promise<Record<string, unknown>>;
}

export interface Lifecycle {
  migrate(): Promise<void>;
  start(): Promise<void>;
  close(): Promise<void>;
}

export interface Env {
  get(key: string): string | undefined;
  require(key: string): string;
}

export type Ports<Database = unknown> = {
  blobs: ImageStorage;
  context: RequestContext<Database>;
  db: DbScope<Database>;
  documents: Documents;
  env: Env;
  fanout: FanoutBus;
  http: HttpHost;
  jobs: Jobs;
  lifecycle: Lifecycle;
  limits: Limits;
  mailer: Mailer;
  meetings: Meetings;
  outbound: OutboundFetch;
  scheduler: Scheduler;
  telemetry: Telemetry;
  urls: UrlResolver;
};

export type RoomPorts<Attachment = unknown, Database = unknown> = Pick<
  Ports<Database>,
  "db" | "env" | "fanout" | "limits" | "meetings" | "scheduler" | "telemetry"
> & {
  host: RoomHost<Attachment>;
  state: RoomState;
};

export type AppPolicy = {
  compression: boolean;
  registration: "bootstrap" | "managed";
  webhookHttpDomains: ReadonlySet<string>;
  workspaceSelection: "pinned" | "switchable";
};

export type RoomInvocation = {
  payload: unknown;
  type: string;
};

export interface RoomController {
  alarm(): void | Promise<void>;
  invoke(invocation: RoomInvocation): unknown | Promise<unknown>;
  start(): void | Promise<void>;
  close(): void | Promise<void>;
}

export type RoomControllerFactory = (
  roomId: string,
  ports: RoomPorts,
) => RoomController;

export type RuntimeRoomKind =
  | "calendar"
  | "chat-agent"
  | "database"
  | "mail"
  | "meeting"
  | "meeting-audio"
  | "navigation"
  | "page";

export type RuntimeApplication = {
  createHttpApp(env: RuntimeEnv, ports: Ports): Promise<FetchApplication>;
  maintenance(env: RuntimeEnv, ports: Ports): Promise<void>;
  processTask(input: {
    env: RuntimeEnv;
    ports: Ports;
    task: BackgroundTask;
    workerId: string;
  }): Promise<BackgroundResult>;
  rooms: Record<RuntimeRoomKind, RoomControllerFactory>;
};
