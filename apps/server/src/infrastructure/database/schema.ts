// Stable schema aggregate for Drizzle, feature persistence and external adapters.
export {
  user,
  session,
  desktopAuthorizationCode,
  account,
  verification,
  apikey,
  rateLimit,
  jwks,
} from "./schema/authentication";
export {
  oauthClient,
  oauthResource,
  oauthClientResource,
  oauthRefreshToken,
  oauthAccessToken,
  oauthConsent,
  oauthClientAssertion,
} from "./schema/oauth";
export {
  workspace,
  member,
  invitation,
  team,
  teamMember,
  teamspace,
  teamspacePrincipal,
  workspaceGuest,
} from "./schema/workspaces";
export {
  pageSettings,
} from "./schema/user-settings";
export {
  instanceSettings,
} from "./schema/instance";
export {
  gmailAccount,
  gmailOauthAttempt,
  gmailSendOperation,
  gmailWorkspaceConnection,
} from "./schema/mail-connections";
export {
  mailView,
  mailProperty,
  mailThreadPropertyValue,
  mailReminder,
} from "./schema/mail-organization";
export {
  mailDatabaseSyncRecord,
  mailDatabaseSyncOutbox,
  mailIndexState,
  mailThreadIndex,
} from "./schema/mail-sync";
export {
  slackOauthAttempt,
  slackConnection,
} from "./schema/slack-connections";
export {
  page,
  pageLayout,
  pageCollaborationDocument,
  pageAccess,
  pageGuestInvitation,
  pageGuestRequest,
} from "./schema/pages";
export {
  meeting,
  meetingCollaborationDocument,
  meetingTranscriptSegment,
  meetingConsentEvent,
} from "./schema/meetings";
export {
  pageProperty,
  pagePropertyValue,
} from "./schema/page-properties";
export {
  database,
  dataSource,
  databaseDataSource,
  databaseCommandReceipt,
  databaseMutationEvent,
  databaseRealtimeOutbox,
  databaseAccess,
  databaseProperty,
  databaseView,
  databaseRow,
} from "./schema/databases";
export {
  databaseAutomation,
  databaseAutomationRevision,
  databaseAutomationDependency,
  databaseAutomationEventWindow,
  databaseAutomationRun,
  databaseAutomationStepRun,
  databaseAutomationDelivery,
  automationSecret,
} from "./schema/automations";
export {
  inProductNotification,
  inProductNotificationOutbox,
} from "./schema/notifications";
export {
  pageItemPlacement,
} from "./schema/placements";
export {
  favorite,
  itemVisit,
  navigationRealtimeOutbox,
} from "./schema/navigation";
export {
  imageAsset,
} from "./schema/images";
export {
  aiAgentProfile,
  aiAgentRevision,
  aiAgentConversation,
  aiAgentConversationMessage,
  aiAgentTrigger,
  aiAgentRun,
  aiAgentRunEvent,
  aiAgentEventReceipt,
  aiAgentProfileAccess,
} from "./schema/ai-agents";
export {
  aiWorkspaceMcpPolicy,
  aiMcpApprovedServer,
  aiMcpConnection,
  aiMcpCredential,
  aiMcpOauthAttempt,
  aiMcpClientRegistration,
  aiMcpToolSnapshot,
  aiMcpActivity,
} from "./schema/ai-mcp";
export {
  aiChatThread,
  aiChatMessage,
  aiChatThreadSummary,
  aiAgentUserPreference,
  aiChatFeedback,
} from "./schema/ai-conversations";
export {
  aiAgentTurn,
  aiAgentToolExecution,
  aiAgentActionReceipt,
  aiAgentPendingAction,
} from "./schema/ai-execution";
export {
  aiMcpDataset,
  aiMcpDatasetChunk,
  aiMcpMaterialization,
  aiMcpMaterializationReservation,
  aiChatUpload,
  aiChatArtifact,
} from "./schema/ai-files";
export {
  workspaceAiProviderConfig,
  aiSettings,
  aiSettingsDraft,
  aiSettingsVersion,
} from "./schema/ai-settings";
export {
  searchDocument,
  searchChunk,
} from "./schema/search";
export {
  aiJob,
  backgroundMaintenanceTask,
} from "./schema/background";
export { calendarAccount, calendarBinding, calendarOauthAttempt, calendarProviderCalendar, calendarEventRecord, calendarRangeSnapshot, calendarWatchChannel, calendarMutationReceipt, calendarNotificationOutbox, calendarPreference } from "./schema/calendar";
