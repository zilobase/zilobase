import type { DatabaseMutationEventV2 } from "@zilobase/features/databases/contracts";
import type { NavigationRealtimeInvalidateEvent } from "@zilobase/features/pages/navigation-realtime";
import type {
  MeetingAudioSource,
  MeetingLifecycleAction,
  MeetingStatus,
} from "../../shared/contracts/meetings";

import type { RuntimeEnv } from "../../shared/config/config";
import type { ImageStorage } from "../storage/image-storage";
import type { BackgroundTaskV1 } from "../background/contracts";

export type OutboundEmailMessage = {
  from: string;
  html: string;
  subject: string;
  text: string;
  to: string;
};

export type ServerRuntimeAdapter = {
  fetchMcpRequest?(input: {
    body: string | null;
    headers: Record<string, string>;
    method: string;
    signal?: AbortSignal;
    timeoutMs: number;
    url: string;
  }): Promise<Response>;
  fetchAutomationWebhook?(input: {
    body: string;
    headers: Record<string, string>;
    pinnedAddress: string;
    timeoutMs: number;
    url: string;
  }): Promise<Response>;
  publishInProductNotification?(input: {
    env: RuntimeEnv;
    notificationId: string;
    userId: string;
    workspaceId: string;
  }): Promise<void>;
  dispatchBackgroundTasks?(input: {
    env: RuntimeEnv;
    tasks: BackgroundTaskV1[];
  }): Promise<void>;
  scanAiFile?(input: {
    bytes: Uint8Array;
    contentType: string;
    filename: string;
    workspaceId: string;
  }): Promise<{ clean: boolean; scanner: string }>;
  applyPageContentUpdate?(input: {
    content: unknown;
    env: RuntimeEnv;
    pageId: string;
    userId: string;
  }): Promise<void>;
  applyPageCommentUpdate?(input: {
    author: { email: string | null; id: string; image: string | null; name: string | null };
    body: string;
    env: RuntimeEnv;
    pageId: string;
  }): Promise<{ messageId: string; threadId: string }>;
  applyMeetingSummaryUpdate?(input: {
    content: unknown;
    env: RuntimeEnv;
    meetingId: string;
    userId: string;
  }): Promise<void>;
  applyMeetingTranscriptUpdate?(input: {
    draftItemId?: string;
    env: RuntimeEnv;
    meetingId: string;
    segment: MeetingTranscriptYjsSegment;
    userId: string;
  }): Promise<void>;
  claimMeetingRecorderSession?(input: MeetingRecorderRuntimeInput & {
    recorderImage?: string | null;
    recorderName?: string;
    workspaceId: string;
  }): Promise<MeetingRecorderRuntimeState>;
  createImageStorage?(env: RuntimeEnv): ImageStorage | null;
  getCollaborationWebSocketUrl?(request: Request, env: RuntimeEnv): string;
  getDatabaseRealtimeWebSocketUrl?(
    request: Request,
    env: RuntimeEnv,
  ): string;
  getMeetingCollaborationWebSocketUrl?(
    request: Request,
    env: RuntimeEnv,
  ): string;
  getMeetingAudioWebSocketUrl?(request: Request, env: RuntimeEnv): string;
  getCalendarRealtimeWebSocketUrl?(request: Request, env: RuntimeEnv): string;
  publishCalendarNotification?(input: { env: RuntimeEnv; event: CalendarNotificationEvent }): Promise<void>;
  getMailRealtimeWebSocketUrl?(request: Request, env: RuntimeEnv): string;
  getNavigationRealtimeWebSocketUrl?(request: Request, env: RuntimeEnv): string;
  getMeetingRecorderSession?(input: {
    env: RuntimeEnv;
    meetingId: string;
  }): Promise<MeetingRecorderRuntimeState | null>;
  getDatabaseUrl?(env: RuntimeEnv): string | null | undefined;
  getImageStorageMode?(env: RuntimeEnv): "s3" | "binding" | null | undefined;
  publishDatabaseMutation?(input: {
    env: RuntimeEnv;
    event: DatabaseMutationEventV2;
  }): Promise<void>;
  publishMailNotification?(input: {
    env: RuntimeEnv;
    event: MailNotificationEvent;
  }): Promise<void>;
  publishNavigationInvalidation?(input: {
    env: RuntimeEnv;
    event: NavigationRealtimeInvalidateEvent;
  }): Promise<void>;
  releaseMeetingRecorderSession?(
    input: MeetingRecorderRuntimeInput,
  ): Promise<void>;
  sendEmail?(input: {
    env: RuntimeEnv;
    message: OutboundEmailMessage;
  }): Promise<void>;
  transitionMeetingRecorderSession?(input: MeetingRecorderRuntimeInput & {
    action: Extract<
      MeetingLifecycleAction,
      "pause" | "resume" | "start" | "stop"
    >;
    durationMs?: number;
  }): Promise<MeetingRecorderRuntimeState>;
  selfHosted?: false;
};

export type MailNotificationEvent = {
  bindingId: string;
  connectionId: string;
  revision: number;
  userId: string;
  workspaceId: string;
};

export type MeetingRecorderRuntimeInput = {
  env: RuntimeEnv;
  leaseId?: string;
  meetingId: string;
  userId: string;
};

export type MeetingRecorderRuntimeState = {
  durationMs: number;
  expiresAt: number;
  leaseId: string;
  recorderId: string;
  recorderImage: string | null;
  recorderName: string;
  startedAt: number;
  status: Extract<MeetingStatus, "paused" | "recording"> | "claimed" | "finishing";
};

export type MeetingTranscriptYjsSegment = {
  id: string;
  source: MeetingAudioSource;
  startMs: number;
  text: string;
};


export type CalendarNotificationEvent = { bindingId: string; accountId: string; userId: string; workspaceId: string; calendarId: string; revision: number; generation: number };
