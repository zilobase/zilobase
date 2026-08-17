export {
  createDatabaseRealtimeTicket,
  DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX,
  DATABASE_REALTIME_PROTOCOL,
  verifyDatabaseRealtimeTicket,
  type DatabaseRealtimeTicketClaims,
} from "./database-realtime-ticket";
export type { DatabaseRealtimeMutationEvent } from "./services/database-delta";
export type {
  MeetingLifecycleAction,
} from "./features/meetings/meeting-types";
export type { MeetingStatus };
export {
  createMeetingAudioTicket,
  MEETING_AUDIO_AUTH_PROTOCOL_PREFIX,
  MEETING_AUDIO_PROTOCOL,
  verifyMeetingAudioTicket,
  type MeetingAudioTicketClaims,
} from "./features/meetings/meeting-audio-ticket";

export type MeetingRealtimeEvent =
  | { type: "meeting.ready"; meetingId: string; sessionId: string }
  | { type: "recording.state"; meetingId: string; status: MeetingStatus; recorderId: string | null }
  | { type: "transcript.delta"; itemId: string; text: string }
  | { type: "transcript.segment"; segment: MeetingTranscriptRealtimeSegment }
  | { type: "transcript.replaced"; revision: number }
  | { type: "meeting.updated"; meetingId: string }
  | { type: "presence.update"; users: MeetingPresenceUser[] }
  | { type: "warning"; code: string; message: string }
  | { type: "error"; code: string; message: string };

export type MeetingRealtimeClientMessage =
  | { type: "realtime.ping" }
  | { type: "presence.update"; activeTab: "summary" | "notes" | "transcript" }
  | { type: "recorder.heartbeat"; leaseId: string }
  | { type: "auth.refresh"; token: string };

export type MeetingTranscriptRealtimeSegment = {
  endMs: number;
  id: string;
  revision: number;
  sequence: number;
  speaker: string | null;
  startMs: number;
  text: string;
};

export type MeetingPresenceUser = {
  activeTab: "summary" | "notes" | "transcript";
  id: string;
  name: string;
};
import type { MeetingStatus } from "./features/meetings/meeting-types";
