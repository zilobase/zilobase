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
} from "../features/ai/conversations/chat-service";
export {
  getAiChatThreadForUser,
  loadAiChatThreadMessages,
  maybeAutoTitleAiChatThread,
  syncAiChatThreadMessages,
  touchAiChatThreadActivity,
} from "../features/ai/conversations/chat-persistence";
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
} from "../features/meetings/lifecycle/meeting-service";
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
} from "../features/meetings/transcription/meeting-realtime-transcription";
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
  createAuthTransactionDatabase,
  createDbClient,
  getCurrentExtensionTransactionDatabase,
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
  createDataSourceRealtimeTicket,
  createDatabaseRealtimeTicket,
  DATA_SOURCE_REALTIME_PROTOCOL,
  DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX,
  DATABASE_REALTIME_PROTOCOL,
  verifyDataSourceRealtimeTicket,
  verifyDatabaseRealtimeTicket,
  type DataSourceRealtimeTicketClaims,
  type DatabaseRealtimeTicketClaims,
} from "../shared/security/database-realtime-ticket";
export {
  createMeetingAudioTicket,
  MEETING_AUDIO_AUTH_PROTOCOL_PREFIX,
  MEETING_AUDIO_PROTOCOL,
  verifyMeetingAudioTicket,
  type MeetingAudioTicketClaims,
} from "../features/meetings/audio/meeting-audio-ticket";
export {
  drainDatabaseRealtimeOutbox,
  type DatabaseMutationEventV2,
  type DataSourceMutationEventV3,
} from "../features/databases/realtime/outbox";
export { drainNavigationRealtimeOutbox } from "../features/workspaces/navigation-realtime/outbox";
export { expireTemporaryMemberships } from "../features/memberships";
export { renewGmailWatches } from "../features/mail/sync/gmail-watch";
export { advancePendingMailIndexes } from "../features/mail/query/mail-index";
export { drainMailDatabaseSyncOutbox } from "../features/mail/database-sync/mail-database-sync-worker";
export {
  getDatabaseAutomationEventCaptureMetrics,
  promoteClosedDatabaseAutomationEventWindows,
} from "../features/databases/automations/triggers/event-capture";
export {
  drainDatabaseAutomationEventWindows,
  processDatabaseAutomationEventWindow,
} from "../features/databases/automations/triggers/event-evaluator";
export {
  drainDatabaseAutomationRuns,
  processDatabaseAutomationRun,
} from "../features/databases/automations/execution/run-engine";
export { scanDueDatabaseAutomationSchedules } from "../features/databases/automations/triggers/scheduler";
export {
  cleanupDatabaseAutomationHistory,
  getDatabaseAutomationOperationalSnapshot,
} from "../features/databases/automations/history/history-maintenance";
export { drainInProductNotificationOutbox } from "../features/notifications/outbox";
export {
  MembershipService,
  TransactionalAdmissionError,
  admitTransactionalMembership,
  findActiveMembershipForAdmission,
  listWorkspaceReadinessMembers,
  lockWorkspaceAdmission,
  revokeWorkspaceSessions,
  type GrantMembershipInput,
  type GrantMembershipResult,
  type TransactionalAdmissionCode,
  type TransactionalAdmissionResult,
  type ReadinessMember,
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
  appendPageCommentInHocuspocus,
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

export { isCalendarFeatureEnabled } from "../shared/config/config";
export { getCalendarRealtimeWebSocketUrl, publishCalendarNotification, type CalendarNotificationEvent } from "../infrastructure/runtime/runtime-adapter";
export { advancePendingCalendars } from "../features/calendar/sync/sync";

export { maintainCalendarWatches } from "../features/calendar/realtime/watches";
export { drainCalendarOutbox } from "../features/calendar/realtime/outbox";
