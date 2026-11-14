export {
  getCollaborationWebSocketUrl,
  getDatabaseRealtimeWebSocketUrl,
  getDatabaseUrl,
  getMeetingAudioWebSocketUrl,
  getMeetingCollaborationWebSocketUrl,
  runWithRuntimePorts,
  type MeetingRecorderRuntimeInput,
  type MeetingRecorderRuntimeState,
  type OutboundEmailMessage,
} from "@zilobase/runtime-adapter/capabilities";
export type { MeetingTranscriptYjsSegment } from "@zilobase/runtime-adapter/capabilities";
export { createApp } from "../app";
export { runBackgroundDelivery } from "../app/background/delivery";
export {
  BACKGROUND_MAINTENANCE_TASKS,
  ensureBackgroundMaintenanceTasks,
  runDueBackgroundMaintenance,
} from "../app/background/maintenance";
export { processBackgroundTask } from "../app/background/processor";
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
  type BackgroundTaskV2,
} from "../infrastructure/background/contracts";
export { getBackgroundOperationalSnapshot } from "../infrastructure/background/health";
export {
  createBackgroundDeliveryStore,
  publishBackgroundDispatches,
} from "../infrastructure/background/publication";
export { BACKGROUND_LANE_POLICY } from "../infrastructure/background/task-v2";
export {
  createAuthTransactionDatabase,
  createDbClient,
  getCurrentExtensionTransactionDatabase,
  runWithDbClient,
  runWithDbEnv,
} from "../infrastructure/database";
export type { Database, DatabaseClient } from "../infrastructure/database";
export { editionPersistencePort } from "../infrastructure/database/edition-persistence";
export {
  DATABASE_UNAVAILABLE_CODE,
  DATABASE_UNAVAILABLE_MESSAGE,
  getDatabaseErrorCode,
  isDatabaseUnavailableError,
} from "../infrastructure/database/errors";
export {
  createImageStorage,
  resolveImageStorageMode,
  type ImageStorage,
  type ImageStorageMode,
  type ImageUploadTarget,
  type PutObjectOptions,
  type StoredImageMetadata,
} from "../infrastructure/storage/image-storage";
export { getMembership, getWorkspaceMemberships } from "../services/access/principal-access";
export { createAuth } from "../services/auth/auth";
export {
  COLLABORATION_WEBSOCKET_PROTOCOL,
  SESSION_AUTH_WEBSOCKET_PROTOCOL_PREFIX,
  getAuthHeaders,
  readWebSocketSessionToken,
} from "../services/auth/sessions/headers";
export { processDatabaseAutomationRun } from "../services/automations/execution/run-engine";
export {
  cleanupDatabaseAutomationHistory,
  getDatabaseAutomationOperationalSnapshot,
} from "../services/automations/history/history-maintenance";
export {
  getDatabaseAutomationEventCaptureMetrics,
  promoteClosedDatabaseAutomationEventWindows,
} from "../services/automations/triggers/event-capture";
export { processDatabaseAutomationEventWindow } from "../services/automations/triggers/event-evaluator";
export { scanDueDatabaseAutomationSchedules } from "../services/automations/triggers/scheduler";
export {
  encodePageContentAsYjs,
  materializePageContentFromYjs,
} from "../services/collaboration/documents/document-codec";
export {
  documentNameForMeeting,
  documentNameForPage,
  meetingIdFromDocumentName,
  pageIdFromDocumentName,
} from "../services/collaboration/documents/documents";
export {
  appendMeetingTranscript,
  appendMeetingTranscriptInHocuspocus,
  appendMeetingTranscriptToDocument,
  appendPageCommentInHocuspocus,
  editPageContentInHocuspocus,
  readPageContentInHocuspocus,
  replaceMeetingSummary,
  replaceMeetingSummaryInHocuspocus,
  replacePageContent,
  replacePageContentInHocuspocus,
} from "../services/collaboration/mutations/document-mutations";
export {
  getOrCreateCollaborationDocumentState,
  getOrCreateMeetingCollaborationDocumentState,
  type CollaborationDocumentPersistence,
} from "../services/collaboration/persistence/document-persistence";
export {
  createCollaborationHocuspocus,
  type CollaborationContext,
} from "../services/collaboration/runtime/hocuspocus";
export {
  createCollaborationTicket,
  verifyCollaborationTicket,
  type CollaborationTicketClaims,
  type MeetingCollaborationTicketClaims,
  type PageCollaborationTicketClaims,
} from "../services/collaboration/tickets/ticket-security";
export { type DatabaseMutationEventV2 } from "../services/databases/realtime/outbox";
export {
  DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX,
  DATABASE_REALTIME_PROTOCOL,
  createDatabaseRealtimeTicket,
  verifyDatabaseRealtimeTicket,
  type DatabaseRealtimeTicketClaims,
} from "../services/databases/realtime/tickets";
export {
  DESKTOP_PROTOCOL_VERSION,
  type DesktopServer,
  type ZilobaseDiscoveryDocument,
} from "../services/instance/contracts";
export { isDesktopVersionCompatible } from "../services/instance/discovery/desktop-version";
export { getZilobaseDiscoveryDocument } from "../services/instance/discovery/discovery";
export {
  MEETING_AUDIO_AUTH_PROTOCOL_PREFIX,
  MEETING_AUDIO_PROTOCOL,
  MEETING_AUDIO_SOURCES,
  createMeetingAudioTicket,
  meetingAudioSourceFromCode,
  verifyMeetingAudioTicket,
  type MeetingAudioTicketClaims,
} from "../services/meetings/audio/meeting-audio-ticket";
export {
  MEETING_RECORDER_LEASE_HEARTBEAT_MS,
  heartbeatMeetingRecorder,
  validateMeetingRecorderLease,
} from "../services/meetings/lifecycle/recorder-session";
export {
  MEETING_TRANSCRIPTION_FATAL_CLOSE_CODE,
  MeetingRealtimeTranscriber,
  MeetingRealtimeTranscriptionError,
  createMeetingRealtimeTranscriptSink,
  getMeetingOpenAiSafetyIdentifier,
  getMeetingRealtimeTranscriptionConfig,
  getMeetingRealtimeTranscriptionUrl,
  getMeetingTranscriptionFailureCloseCode,
  trimAcceptedMeetingAudio,
  type MeetingRealtimeTranscriberCallbacks,
  type RealtimeTranscriptionSocket,
  type RealtimeTranscriptionTurn,
} from "../services/meetings/transcription/meeting-realtime-transcription";
export {
  appendMeetingTranscriptSegment,
  persistMeetingTranscriptSession,
  type MeetingTranscriptSessionSegment,
} from "../services/meetings/transcription/transcript-persistence";
export {
  MembershipService,
  type GrantMembershipInput,
  type GrantMembershipResult,
} from "../services/memberships/membership-grants";
export { expireTemporaryMemberships } from "../services/memberships/temporary-membership";
export {
  TransactionalAdmissionError,
  admitTransactionalMembership,
  findActiveMembershipForAdmission,
  listWorkspaceReadinessMembers,
  lockWorkspaceAdmission,
  revokeWorkspaceSessions,
  type ReadinessMember,
  type TransactionalAdmissionCode,
  type TransactionalAdmissionResult,
} from "../services/memberships/transactional-admission";
export {
  findTeamspaceIntegrityIssues,
  inspectTeamspaceIntegrity,
  type TeamspaceIntegrityIssue,
  type TeamspaceIntegritySnapshot,
} from "../services/teamspaces/integrity";
export {
  TeamspaceService,
  ensureDefaultTeamspaceMembership,
  removeUserTeamspacePrincipals,
  type EnsureDefaultTeamspaceMembershipInput,
  type EnsureDefaultTeamspaceMembershipResult,
} from "../services/teamspaces/teamspace-membership";
export {
  getCanonicalApiOrigin,
  getCanonicalHttpOrigin,
  getCanonicalWebOrigin,
  isAllowedClientOrigin,
  isLocalDevelopmentHost,
  isLoopbackHost,
  type RuntimeEnv,
} from "../shared/config/config";
export {
  type EditionDatabase,
  type EditionInstance,
  type EditionMembership,
  type EditionPersistencePort,
} from "../shared/contracts/edition";
export type {
  EditionExtensionOptions,
  MembershipGrantInput,
  MembershipGrantSource,
  SecurityEvent,
  ZilobaseEditionExtension,
} from "../shared/contracts/edition";
export type { AppErrorReport, AppErrorReporter } from "../shared/contracts/error-reporting";
export type { AppBindings } from "../shared/contracts/http";

export {
  getCalendarRealtimeWebSocketUrl,
  publishCalendarNotification,
  type CalendarNotificationEvent,
} from "@zilobase/runtime-adapter/capabilities";

export { drainCalendarOutbox } from "../services/calendar/realtime/outbox";
export { maintainCalendarWatches } from "../services/calendar/realtime/watches";

export {
  deliverBackgroundTask,
  reconcileBackgroundFailures,
  recordBackgroundExhaustion,
} from "../app/background/runtime-delivery";
