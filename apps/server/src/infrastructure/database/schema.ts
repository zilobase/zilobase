// Stable schema aggregate for Drizzle, feature persistence and external adapters.
export {
  account,
  apikey,
  desktopAuthorizationCode,
  jwks,
  rateLimit,
  session,
  user,
  verification,
} from "./schema/authentication";
export {
  automationSecret,
  databaseAutomation,
  databaseAutomationDelivery,
  databaseAutomationDependency,
  databaseAutomationEventWindow,
  databaseAutomationRevision,
  databaseAutomationRun,
  databaseAutomationStepRun,
} from "./schema/automations";
export { backgroundDispatch, backgroundMaintenanceTask } from "./schema/background";
export {
  calendarAccount,
  calendarBinding,
  calendarEventRecord,
  calendarMutationReceipt,
  calendarNotificationOutbox,
  calendarOauthAttempt,
  calendarPreference,
  calendarProviderCalendar,
  calendarRangeSnapshot,
  calendarWatchChannel,
} from "./schema/calendar";
export {
  dataSource,
  database,
  databaseAccess,
  databaseActorState,
  databaseCommandReceipt,
  databaseDataSource,
  databaseMutationEvent,
  databaseProperty,
  databaseRealtimeOutbox,
  databaseRow,
  databaseView,
} from "./schema/databases";
export { imageAsset } from "./schema/images";
export { instanceSettings } from "./schema/instance";
export {
  meeting,
  meetingCollaborationDocument,
  meetingConsentEvent,
  meetingTranscriptSegment,
} from "./schema/meetings";
export { favorite, itemVisit, navigationRealtimeOutbox } from "./schema/navigation";
export { inProductNotification, inProductNotificationOutbox } from "./schema/notifications";
export {
  oauthAccessToken,
  oauthClient,
  oauthClientAssertion,
  oauthClientResource,
  oauthConsent,
  oauthRefreshToken,
  oauthResource,
} from "./schema/oauth";
export { pageProperty, pagePropertyValue } from "./schema/page-properties";
export {
  page,
  pageAccess,
  pageCollaborationDocument,
  pageGuestInvitation,
  pageGuestRequest,
  pageLayout,
} from "./schema/pages";
export { pageItemPlacement } from "./schema/placements";
export {
  searchChunk,
  searchDocument,
  searchEmbeddingProfile,
  workspaceSearchSettings,
  pageSearchIndex,
  searchInvalidation,
  searchQueryEmbeddingCache,
  searchEmbeddingUsageBucket,
} from "./schema/search";
export { slackConnection, slackOauthAttempt } from "./schema/slack-connections";
export { pageSettings } from "./schema/user-settings";
export {
  invitation,
  member,
  team,
  teamMember,
  teamspace,
  teamspacePrincipal,
  workspace,
  workspaceGuest,
} from "./schema/workspaces";
export { askAiThread, askAiTurn } from "./schema/ai";

export { askAiRun, askAiRunEvent, askAiRunInput } from "./schema/ai";
export { workspaceActionChange, workspaceActionReceipt } from "./schema/actions";
