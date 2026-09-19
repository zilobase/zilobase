// Deprecated: canonical implementation now lives in `@zilobase/runtime-adapter`.
// Kept for one release for compatibility; new code should import from
// `@zilobase/runtime-adapter` (or `/contracts`, `/resolve`) directly.
export * from "@zilobase/runtime-adapter/capabilities";
export * from "@zilobase/runtime-adapter/context";
export type {
  OutboundEmailMessage,
  ServerRuntimeAdapter,
  MailNotificationEvent,
  CalendarNotificationEvent,
  MeetingRecorderRuntimeInput,
  MeetingRecorderRuntimeState,
  MeetingTranscriptYjsSegment,
} from "@zilobase/runtime-adapter/contracts";
