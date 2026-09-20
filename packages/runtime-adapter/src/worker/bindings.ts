import type {
  BackgroundTaskV1,
  CalendarNotificationEvent,
  DatabaseMutationEventV2,
  MailNotificationEvent,
  MeetingRecorderRuntimeState,
  MeetingTranscriptYjsSegment,
} from "@zilobase/server/adapter-api";
import type { NavigationRealtimeInvalidateEvent } from "@zilobase/server/realtime-api";
import type { WorkerR2Bucket } from "./image-storage";

export type WorkerHyperdriveBinding = { connectionString: string };
export type BackgroundQueue = {
  send(message: BackgroundTaskV1, options?: { delaySeconds?: number }): Promise<void>;
};

export type WorkerEnvBindings = Record<string, unknown> & {
  COLLABORATION_RATE_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
  BACKGROUND_FAST?: BackgroundQueue;
  AI_JOBS?: BackgroundQueue;
  AUTOMATION_RUNS?: BackgroundQueue;
  MAIL_JOBS?: BackgroundQueue;
  EMAIL?: CloudflareBindings["EMAIL"];
  ZILOBASE_DEV_EMAIL_SINK_URL?: string;
  HYPERDRIVE?: WorkerHyperdriveBinding;
  IMAGE_BUCKET?: WorkerR2Bucket;
  IMAGE_STORAGE_MODE?: "s3" | "binding";
  PAGE_COLLABORATION?: {
    getByName(name: string): {
      appendPageComment(input: { author: { email: string | null; id: string; image: string | null; name: string | null }; body: string; pageId: string }): Promise<{ messageId: string; threadId: string }>;
      fetch(request: Request): Promise<Response>;
      replacePageContent(content: unknown, pageId: string, userId: string): Promise<void>;
    };
  };
  MEETING_COLLABORATION?: {
    getByName(name: string): {
      appendMeetingTranscript(draftItemId: string | undefined, meetingId: string, segment: MeetingTranscriptYjsSegment, userId: string): Promise<void>;
      fetch(request: Request): Promise<Response>;
      claimRecorder(input: { meetingId: string; recorderImage?: string | null; recorderName?: string; userId: string; workspaceId: string }): Promise<MeetingRecorderRuntimeState>;
      getRecorderState(): Promise<MeetingRecorderRuntimeState | null>;
      releaseRecorder(input: { leaseId: string; meetingId: string; userId: string }): Promise<void>;
      transitionRecorder(input: { action: "pause" | "resume" | "start" | "stop"; durationMs?: number; leaseId: string; meetingId: string; userId: string }): Promise<MeetingRecorderRuntimeState>;
      replaceMeetingSummary(content: unknown, meetingId: string, userId: string): Promise<void>;
    };
  };
  DATABASE_COLLABORATION?: { getByName(name: string): { publishMutation(event: DatabaseMutationEventV2): Promise<void> } };
  CALENDAR_NOTIFICATION_ROOM?: { getByName(name: string): { fetch(request: Request): Promise<Response>; publishNotification(event: CalendarNotificationEvent): Promise<void> } };
  MAIL_NOTIFICATION_ROOM?: { getByName(name: string): { fetch(request: Request): Promise<Response>; publishNotification(event: MailNotificationEvent): Promise<void> } };
  NAVIGATION_NOTIFICATION_ROOM?: { getByName(name: string): { fetch(request: Request): Promise<Response>; publishInvalidation(event: NavigationRealtimeInvalidateEvent): Promise<void> } };
};
