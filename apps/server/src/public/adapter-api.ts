export { getMembership, getWorkspaceMemberships } from "../features/access";
export { createApp } from "../app";
export type {
  AppErrorReport,
  AppErrorReporter,
  EditionExtensionOptions,
  MembershipGrantInput,
  MembershipGrantSource,
  SecurityEvent,
  ZilobaseEditionExtension,
} from "../shared/types";
export {
  coerceAiChatRequestBody,
  runAiChatTurn,
} from "../features/ai/chat/chat-service";
export {
  getAiChatThreadForUser,
  loadAiChatThreadMessages,
  maybeAutoTitleAiChatThread,
  syncAiChatThreadMessages,
  touchAiChatThreadActivity,
} from "../features/ai/chat/chat-persistence";
export { createAuth } from "../features/auth";
export { AI_JOB_HANDLERS } from "../features/ai/jobs/ai-job-handlers";
export {
  runAiJobBatch,
  runAiJobById,
  type AiJobHandler,
} from "../features/ai/jobs/ai-jobs";
export {
  appendMeetingTranscriptSegment,
  heartbeatMeetingRecorder,
  MEETING_RECORDER_LEASE_HEARTBEAT_MS,
  persistMeetingTranscriptSession,
  validateMeetingRecorderLease,
  type MeetingTranscriptSessionSegment,
} from "../features/meetings/meeting-service";
export {
  createMeetingRealtimeTranscriptSink,
  getMeetingOpenAiSafetyIdentifier,
  getMeetingRealtimeTranscriptionConfig,
  getMeetingRealtimeTranscriptionUrl,
  getMeetingTranscriptionFailureCloseCode,
  MEETING_TRANSCRIPTION_FATAL_CLOSE_CODE,
  MeetingRealtimeTranscriptionError,
  MeetingRealtimeTranscriber,
  trimAcceptedMeetingAudio,
  type MeetingRealtimeTranscriberCallbacks,
  type RealtimeTranscriptionSocket,
  type RealtimeTranscriptionTurn,
} from "../features/meetings/meeting-realtime-transcription";
export {
  COLLABORATION_WEBSOCKET_PROTOCOL,
  getAuthHeaders,
  readWebSocketSessionToken,
  SESSION_AUTH_WEBSOCKET_PROTOCOL_PREFIX,
} from "../shared/security/auth-headers";
export {
  isMailFeatureEnabled,
  getCanonicalApiOrigin,
  getCanonicalHttpOrigin,
  getCanonicalWebOrigin,
  isAllowedClientOrigin,
  isLocalDevelopmentHost,
  isLoopbackHost,
  type RuntimeEnv,
} from "../shared/config/config";
export {
  createDbClient,
  runWithDbClient,
  runWithDbEnv,
} from "../infrastructure/database";
export type { Database, DatabaseClient } from "../infrastructure/database";
export {
  DATABASE_UNAVAILABLE_CODE,
  DATABASE_UNAVAILABLE_MESSAGE,
  getDatabaseErrorCode,
  isDatabaseUnavailableError,
} from "../shared/errors/database-errors";
export {
  DESKTOP_PROTOCOL_VERSION,
  getZilobaseDiscoveryDocument,
  isDesktopVersionCompatible,
  type DesktopServer,
  type ZilobaseDiscoveryDocument,
} from "../features/instance/service";
export {
  createImageStorage,
  createS3ImageStorage,
  resolveImageStorageMode,
  type ImageStorage,
  type ImageStorageMode,
  type ImageUploadTarget,
  type PutObjectOptions,
  type StoredImageMetadata,
} from "../infrastructure/storage/image-storage";
export {
  getCollaborationWebSocketUrl,
  getConfiguredImageStorageMode,
  getDatabaseRealtimeWebSocketUrl,
  getMeetingAudioWebSocketUrl,
  getMeetingCollaborationWebSocketUrl,
  getMailRealtimeWebSocketUrl,
  getDatabaseUrl,
  getRuntimeAdapter,
  runWithRuntimeAdapter,
  setRuntimeAdapter,
  type OutboundEmailMessage,
  type MeetingRecorderRuntimeInput,
  type MeetingRecorderRuntimeState,
  type ServerRuntimeAdapter,
  type MailNotificationEvent,
} from "../infrastructure/runtime/runtime-adapter";
export {
  createDatabaseRealtimeTicket,
  DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX,
  DATABASE_REALTIME_PROTOCOL,
  verifyDatabaseRealtimeTicket,
  type DatabaseRealtimeTicketClaims,
} from "../shared/security/database-realtime-ticket";
export {
  createMeetingAudioTicket,
  MEETING_AUDIO_AUTH_PROTOCOL_PREFIX,
  MEETING_AUDIO_PROTOCOL,
  verifyMeetingAudioTicket,
  type MeetingAudioTicketClaims,
} from "../features/meetings/meeting-audio-ticket";
export {
  drainDatabaseRealtimeOutbox,
  type DatabaseRealtimeMutationEvent,
} from "../features/databases/realtime/outbox";
export { drainNavigationRealtimeOutbox } from "../features/workspaces/navigation-realtime/outbox";
export { expireTemporaryMemberships } from "../features/memberships";
export { renewGmailWatches } from "../features/mail/gmail-watch";
export { advancePendingMailIndexes } from "../features/mail/mail-index";
export { drainMailDatabaseSyncOutbox } from "../features/mail/mail-database-sync-worker";
export {
  getDatabaseAutomationEventCaptureMetrics,
  promoteClosedDatabaseAutomationEventWindows,
} from "../features/databases/automations/event-capture";
export {
  drainDatabaseAutomationEventWindows,
  processDatabaseAutomationEventWindow,
} from "../features/databases/automations/evaluator";
export {
  drainDatabaseAutomationRuns,
  processDatabaseAutomationRun,
} from "../features/databases/automations/run-engine";
export { scanDueDatabaseAutomationSchedules } from "../features/databases/automations/scheduler";
export {
  cleanupDatabaseAutomationHistory,
  getDatabaseAutomationOperationalSnapshot,
} from "../features/databases/automations/operations";
export { drainInProductNotificationOutbox } from "../features/notifications/outbox";
export {
  MembershipService,
  type GrantMembershipInput,
  type GrantMembershipResult,
} from "../features/memberships";
export {
  TeamspaceService,
  ensureDefaultTeamspaceMembership,
  removeUserTeamspacePrincipals,
  type EnsureDefaultTeamspaceMembershipInput,
  type EnsureDefaultTeamspaceMembershipResult,
} from "../features/teamspaces";
export {
  inspectTeamspaceIntegrity,
  findTeamspaceIntegrityIssues,
  type TeamspaceIntegrityIssue,
  type TeamspaceIntegritySnapshot,
} from "../features/teamspaces";
export {
  appendMeetingTranscript,
  appendMeetingTranscriptInHocuspocus,
  appendMeetingTranscriptToDocument,
  createCollaborationHocuspocus,
  createCollaborationTicket,
  documentNameForMeeting,
  documentNameForPage,
  encodePageContentAsYjs,
  getOrCreateCollaborationDocumentState,
  getOrCreateMeetingCollaborationDocumentState,
  meetingIdFromDocumentName,
  materializePageContentFromYjs,
  pageIdFromDocumentName,
  replacePageContent,
  replacePageContentInHocuspocus,
  replaceMeetingSummary,
  replaceMeetingSummaryInHocuspocus,
  verifyCollaborationTicket,
  type CollaborationContext,
  type CollaborationDocumentPersistence,
  type CollaborationTicketClaims,
  type MeetingCollaborationTicketClaims,
  type PageCollaborationTicketClaims,
} from "../features/collaboration/service";
export type { MeetingTranscriptYjsSegment } from "../infrastructure/runtime/runtime-adapter";
export {
  BACKGROUND_TASK_KINDS,
  backgroundTaskLane,
  createBackgroundTask,
  getBackgroundCellId,
  parseBackgroundTask,
  runWithBackgroundTraceContext,
  type BackgroundLane,
  type BackgroundTaskKind,
  type BackgroundTaskResult,
  type BackgroundTaskV1,
} from "../infrastructure/background/contracts";
export { processBackgroundTask } from "../app/background/processor";
export {
  BACKGROUND_MAINTENANCE_TASKS,
  ensureBackgroundMaintenanceTasks,
  runDueBackgroundMaintenance,
} from "../app/background/maintenance";
export { getBackgroundOperationalSnapshot } from "../infrastructure/background/health";
export type { AppBindings } from "../shared/types";
