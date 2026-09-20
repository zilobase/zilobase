import {
  type DatabaseMutationEventV2,
  type BackgroundTaskV1,
  documentNameForPage,
  type ImageStorage,
  type ImageUploadTarget,
  isMailFeatureEnabled,
  isCalendarFeatureEnabled,
  type CalendarNotificationEvent,
  type MeetingTranscriptYjsSegment,
  type MeetingRecorderRuntimeState,
  type MailNotificationEvent,
  type OutboundEmailMessage,
  type PutObjectOptions,
  type ServerRuntimeAdapter,
  type StoredImageMetadata,
} from "@zilobase/server/adapter-api";
import type { NavigationRealtimeInvalidateEvent } from "@zilobase/server/realtime-api";
export type WorkerHyperdriveBinding = { connectionString: string };

type CloudflareR2Object = {
  body: ReadableStream;
  etag: string;
  httpMetadata?: { contentType?: string };
  size: number;
  uploaded: Date;
};

type CloudflareR2Bucket = {
  delete(objectKey: string): Promise<void>;
  get(objectKey: string): Promise<CloudflareR2Object | null>;
  head(objectKey: string): Promise<Omit<CloudflareR2Object, "body"> | null>;
  put(
    objectKey: string,
    body: ReadableStream | ArrayBuffer | Blob,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<Omit<CloudflareR2Object, "body">>;
};

export type WorkerEnvBindings = Record<string, unknown> & {
  COLLABORATION_RATE_LIMITER?: {
    limit(input: { key: string }): Promise<{ success: boolean }>;
  };
  BACKGROUND_FAST?: BackgroundQueue;
  AI_JOBS?: BackgroundQueue;
  AUTOMATION_RUNS?: BackgroundQueue;
  MAIL_JOBS?: BackgroundQueue;
  EMAIL?: CloudflareBindings["EMAIL"];
  ZILOBASE_DEV_EMAIL_SINK_URL?: string;
  HYPERDRIVE?: WorkerHyperdriveBinding;
  IMAGE_BUCKET?: CloudflareR2Bucket;
  IMAGE_STORAGE_MODE?: "s3" | "binding";
  PAGE_COLLABORATION?: {
    getByName(name: string): {
      fetch(request: Request): Promise<Response>;
      replacePageContent(
        content: unknown,
        pageId: string,
        userId: string,
      ): Promise<void>;
    };
  };
  MEETING_COLLABORATION?: {
    getByName(name: string): {
      appendMeetingTranscript(
        draftItemId: string | undefined,
        meetingId: string,
        segment: MeetingTranscriptYjsSegment,
        userId: string,
      ): Promise<void>;
      fetch(request: Request): Promise<Response>;
      claimRecorder(input: {
        meetingId: string;
        recorderImage?: string | null;
        recorderName?: string;
        userId: string;
        workspaceId: string;
      }): Promise<MeetingRecorderRuntimeState>;
      getRecorderState(): Promise<MeetingRecorderRuntimeState | null>;
      releaseRecorder(input: {
        leaseId: string;
        meetingId: string;
        userId: string;
      }): Promise<void>;
      transitionRecorder(input: {
        action: "pause" | "resume" | "start" | "stop";
        durationMs?: number;
        leaseId: string;
        meetingId: string;
        userId: string;
      }): Promise<MeetingRecorderRuntimeState>;
      replaceMeetingSummary(
        content: unknown,
        meetingId: string,
        userId: string,
      ): Promise<void>;
    };
  };
  DATABASE_COLLABORATION?: {
    getByName(name: string): {
      publishMutation(
        event: DatabaseMutationEventV2,
      ): Promise<void>;
    };
  };
  CALENDAR_NOTIFICATION_ROOM?: { getByName(name: string): { fetch(request: Request): Promise<Response>; publishNotification(event: CalendarNotificationEvent): Promise<void> } };
  MAIL_NOTIFICATION_ROOM?: {
    getByName(name: string): {
      fetch(request: Request): Promise<Response>;
      publishNotification(event: MailNotificationEvent): Promise<void>;
    };
  };
  NAVIGATION_NOTIFICATION_ROOM?: {
    getByName(name: string): {
      fetch(request: Request): Promise<Response>;
      publishInvalidation(event: NavigationRealtimeInvalidateEvent): Promise<void>;
    };
  };
};

export type WorkerAdapterOptions = {
  publishDatabaseMutations?: boolean;
  /** Pass `false` for hosted compositions. Defaults to self-hosted (absent). */
  selfHosted?: boolean;
};

type BackgroundQueue = {
  send(message: BackgroundTaskV1, options?: { delaySeconds?: number }): Promise<void>;
};

export function createWorkerAdapter(
  options: WorkerAdapterOptions = {},
): ServerRuntimeAdapter {
  return {
    async fetchAutomationWebhook(input) {
      return fetch(input.url, {
        body: input.body,
        headers: input.headers,
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(input.timeoutMs),
        ...({ cf: { resolveOverride: input.pinnedAddress } } as Record<string, unknown>),
      });
    },
    async fetchMcpRequest(input) {
      const timeout = AbortSignal.timeout(input.timeoutMs);
      const signal = input.signal
        ? AbortSignal.any([input.signal, timeout])
        : timeout;
      return fetch(input.url, {
        body: input.body,
        headers: input.headers,
        method: input.method,
        redirect: "manual",
        signal,
      });
    },
    async claimMeetingRecorderSession({ env, ...input }) {
      return meetingRoom(env, input.meetingId).claimRecorder(input);
    },
    async applyMeetingTranscriptUpdate({
      draftItemId,
      env,
      meetingId,
      segment,
      userId,
    }) {
      const namespace = (env as WorkerEnvBindings).MEETING_COLLABORATION;
      if (!namespace) throw new Error("MEETING_COLLABORATION binding is required");
      await namespace
        .getByName(`meeting:${meetingId}`)
        .appendMeetingTranscript(draftItemId, meetingId, segment, userId);
    },
    async applyMeetingSummaryUpdate({ content, env, meetingId, userId }) {
      const namespace = (env as WorkerEnvBindings).MEETING_COLLABORATION;
      if (!namespace) throw new Error("MEETING_COLLABORATION binding is required");
      await namespace
        .getByName(`meeting:${meetingId}`)
        .replaceMeetingSummary(content, meetingId, userId);
    },
    getMeetingAudioWebSocketUrl(request) {
      const url = new URL(request.url);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.pathname = "/meeting-audio";
      url.search = "";
      return url.toString();
    },
    getCalendarRealtimeWebSocketUrl(request) { const url = new URL(request.url); url.protocol = url.protocol === "https:" ? "wss:" : "ws:"; url.pathname = "/calendar-realtime"; url.search = ""; url.hash = ""; return url.toString() },
    getMailRealtimeWebSocketUrl(request) {
      const url = new URL(request.url);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.pathname = "/mail-realtime";
      url.search = "";
      return url.toString();
    },
    getNavigationRealtimeWebSocketUrl(request) {
      const url = new URL(request.url);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.pathname = "/navigation-realtime";
      url.search = "";
      return url.toString();
    },
    async getMeetingRecorderSession({ env, meetingId }) {
      return meetingRoom(env, meetingId).getRecorderState();
    },
    async releaseMeetingRecorderSession({ env, leaseId, meetingId, userId }) {
      if (!leaseId) throw new Error("Recorder lease is required");
      await meetingRoom(env, meetingId).releaseRecorder({
        leaseId,
        meetingId,
        userId,
      });
    },
    async transitionMeetingRecorderSession({
      action,
      durationMs,
      env,
      leaseId,
      meetingId,
      userId,
    }) {
      if (!leaseId) throw new Error("Recorder lease is required");
      return meetingRoom(env, meetingId).transitionRecorder({
        action,
        durationMs,
        leaseId,
        meetingId,
        userId,
      });
    },
    async sendEmail({ env, message }) {
      const bindings = env as WorkerEnvBindings;
      const developmentSinkUrl = bindings.ZILOBASE_DEV_EMAIL_SINK_URL?.trim();

      if (developmentSinkUrl) {
        await sendDevelopmentEmail(developmentSinkUrl, message);
        return;
      }

      const binding = bindings.EMAIL;

      if (!binding) {
        throw new Error("EMAIL binding is required");
      }

      await binding.send({
        ...message,
        from: parseEmailAddress(message.from),
      });
    },
    ...(options.publishDatabaseMutations
      ? {
          async publishDatabaseMutation({ env, event }) {
            const namespace = (env as WorkerEnvBindings)
              .DATABASE_COLLABORATION;

            if (!namespace) {
              throw new Error("DATABASE_COLLABORATION binding is required");
            }

            await namespace.getByName(event.databaseId).publishMutation(event);
          },
        } satisfies Pick<ServerRuntimeAdapter, "publishDatabaseMutation">
      : {}),
    async publishCalendarNotification({ env, event }) {
      if (!isCalendarFeatureEnabled(env, event.workspaceId)) return;
      const namespace = (env as WorkerEnvBindings).CALENDAR_NOTIFICATION_ROOM;
      if (!namespace) throw new Error("CALENDAR_NOTIFICATION_ROOM binding is required");
      await namespace.getByName(event.bindingId).publishNotification(event);
    },
    async publishMailNotification({ env, event }) {
      if (!isMailFeatureEnabled(env)) return;
      const namespace = (env as WorkerEnvBindings).MAIL_NOTIFICATION_ROOM;
      if (!namespace) throw new Error("MAIL_NOTIFICATION_ROOM binding is required");
      await namespace.getByName(event.userId).publishNotification(event);
    },
    async publishNavigationInvalidation({ env, event }) {
      const namespace = (env as WorkerEnvBindings).NAVIGATION_NOTIFICATION_ROOM;
      if (!namespace) {
        throw new Error("NAVIGATION_NOTIFICATION_ROOM binding is required");
      }
      await namespace.getByName(event.workspaceId).publishInvalidation(event);
    },
    async applyPageContentUpdate({ content, env, pageId, userId }) {
      const namespace = (env as WorkerEnvBindings).PAGE_COLLABORATION;
      if (!namespace) {
        throw new Error("PAGE_COLLABORATION binding is required");
      }

      await namespace
        .getByName(documentNameForPage(pageId))
        .replacePageContent(content, pageId, userId);
    },
    createImageStorage(env) {
      const cloudflareEnv = env as WorkerEnvBindings;
      if (cloudflareEnv.IMAGE_STORAGE_MODE === "s3") return null;
      if (!cloudflareEnv.IMAGE_BUCKET) {
        if (cloudflareEnv.IMAGE_STORAGE_MODE === "binding") {
          throw new Error(
            "IMAGE_BUCKET binding is required when IMAGE_STORAGE_MODE=binding",
          );
        }
        return null;
      }
      return new R2BindingImageStorage(cloudflareEnv.IMAGE_BUCKET);
    },
    getDatabaseUrl(env) {
      return (env as WorkerEnvBindings).HYPERDRIVE?.connectionString;
    },
    getImageStorageMode(env) {
      const cloudflareEnv = env as WorkerEnvBindings;
      return (
        cloudflareEnv.IMAGE_STORAGE_MODE ??
        (cloudflareEnv.IMAGE_BUCKET ? "binding" : null)
      );
    },
    ...(options.selfHosted === false ? { selfHosted: false as const } : {}),
  };
}

function meetingRoom(env: Parameters<NonNullable<ServerRuntimeAdapter["getDatabaseUrl"]>>[0], meetingId: string) {
  const namespace = (env as WorkerEnvBindings).MEETING_COLLABORATION;
  if (!namespace) throw new Error("MEETING_COLLABORATION binding is required");
  return namespace.getByName(`meeting:${meetingId}`);
}

function parseEmailAddress(value: OutboundEmailMessage["from"]): EmailAddress {
  const trimmed = value.trim();
  const displayAddress = /^(.*?)\s*<([^<>]+)>$/.exec(trimmed);

  return displayAddress
    ? { email: displayAddress[2].trim(), name: displayAddress[1].trim() }
    : { email: trimmed, name: "" };
}

async function sendDevelopmentEmail(
  sinkUrl: string,
  message: OutboundEmailMessage,
) {
  const url = new URL(sinkUrl);
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

  if (url.protocol !== "http:" || !loopbackHosts.has(url.hostname)) {
    throw new Error("Development email sink must use loopback HTTP");
  }

  const response = await fetch(url, {
    body: JSON.stringify({
      From: toMailpitAddress(message.from),
      HTML: message.html,
      Subject: message.subject,
      Tags: ["Cloudflare"],
      Text: message.text,
      To: [toMailpitAddress(message.to)],
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Development email sink rejected message (${response.status})`);
  }
}

function toMailpitAddress(value: string) {
  const address = parseEmailAddress(value);
  return {
    Email: address.email,
    ...(address.name ? { Name: address.name } : {}),
  };
}

class R2BindingImageStorage implements ImageStorage {
  readonly mode = "binding" as const;

  constructor(private readonly bucket: CloudflareR2Bucket) {}

  async checkReady() {
    await this.bucket.head("__zilobase_readiness__");
  }

  async createUploadUrl(
    _options: Parameters<ImageStorage["createUploadUrl"]>[0],
  ): Promise<ImageUploadTarget> {
    throw new Error("Presigned upload URLs are only supported in s3 mode");
  }

  async createReadUrl(
    _options: Parameters<ImageStorage["createReadUrl"]>[0],
  ): Promise<string> {
    throw new Error("Presigned read URLs are only supported in s3 mode");
  }

  async delete(objectKey: string) {
    await this.bucket.delete(objectKey);
  }

  async get(objectKey: string) {
    const object = await this.bucket.get(objectKey);
    return object
      ? {
          body: object.body,
          byteSize: object.size,
          contentType: object.httpMetadata?.contentType,
          etag: object.etag,
          uploadedAt: object.uploaded,
        }
      : null;
  }

  async head(objectKey: string) {
    const object = await this.bucket.head(objectKey);
    return object ? toR2Metadata(object) : null;
  }

  async putObject(options: PutObjectOptions) {
    const object = await this.bucket.put(options.objectKey, options.body, {
      httpMetadata: { contentType: options.contentType },
    });
    return toR2Metadata(object);
  }
}

function toR2Metadata(
  object: Omit<CloudflareR2Object, "body">,
): StoredImageMetadata {
  return {
    byteSize: object.size,
    contentType: object.httpMetadata?.contentType,
    etag: object.etag,
    uploadedAt: object.uploaded,
  };
}

// Deprecated aliases kept for one release; new code uses the `Worker*` names.
export const createCloudflareAdapter = createWorkerAdapter;
export type CloudflareAdapterEnv = WorkerEnvBindings;
export type CloudflareAdapterOptions = WorkerAdapterOptions;
export type CloudflareHyperdriveBinding = WorkerHyperdriveBinding;
