export * from "./adapter-api";
export {
  assertMigrationSets,
  createNodeRuntime,
  runMigrationSets,
  type MigrationSet,
  type NodeRuntimeOptions,
} from "@zilobase/runtime-adapter/node";

// Node-seam values consumed by `@zilobase/runtime-adapter/node`.
// The adapter package imports these (and only these) server surfaces;
// deep relative imports from the adapter package are banned by
// `community-boundary` tests.
export {
  getDefaultCollaborationHocuspocus,
  setCollaborationExtensionsFactory,
} from "../features/collaboration/service";
export { assertSelfHostedProductionConfiguration } from "../features/instance/registration";
export { getAppEditionExtension } from "../shared/edition-extension-registry";
export { renderPrometheusBackgroundMetrics } from "../infrastructure/background/telemetry";
export { renderPrometheusDatabaseMetrics } from "../features/databases/observability";
export { boundedErrorCode } from "../infrastructure/background/dispatch";
export { drainAgentRuns } from "../features/ai/execution/agent-run-service";
export {
  db,
  createDbClientForUrl,
} from "../infrastructure/database";
export {
  aiJob,
  aiAgentRun,
  databaseAutomationEventWindow,
  databaseAutomationRun,
  databaseRealtimeOutbox,
  inProductNotificationOutbox,
  mailDatabaseSyncOutbox,
  navigationRealtimeOutbox,
} from "../infrastructure/database/schema";
export { recordMailMetric } from "../features/mail/mail-metrics";
export { isBlockedAddress } from "../features/automations/actions/webhook-egress";
export {
  CALENDAR_REALTIME_AUTH_PROTOCOL_PREFIX,
  CALENDAR_REALTIME_PROTOCOL,
  createCalendarRealtimeTicket,
  verifyCalendarRealtimeTicket,
  type CalendarRealtimeTicketClaims,
} from "../features/calendar/realtime/calendar-realtime-ticket";
export {
  MAIL_REALTIME_AUTH_PROTOCOL_PREFIX,
  MAIL_REALTIME_PROTOCOL,
  createMailRealtimeTicket,
  verifyMailRealtimeTicket,
  type MailRealtimeTicketClaims,
} from "../features/mail/realtime/mail-realtime-ticket";
export {
  NAVIGATION_REALTIME_AUTH_PROTOCOL_PREFIX,
  NAVIGATION_REALTIME_PROTOCOL,
  createNavigationRealtimeTicket,
  verifyNavigationRealtimeTicket,
  type NavigationRealtimeTicketClaims,
} from "../shared/security/navigation-realtime-ticket";
export {
  MEETING_AUDIO_SOURCES,
  meetingAudioSourceFromCode,
  type MeetingAudioSource,
} from "../features/meetings/audio/meeting-audio-ticket";
export { transitionMeeting } from "../features/meetings/lifecycle/meeting-service";
export { getStringEnv } from "../shared/config/config";

// Zilobase wiring owned by the server package: the core migration set points
// at `apps/server/drizzle`, so it lives here (not in the adapter package).
// The adapter consumes it through `NodeRuntimeOptions.migrationSets`.
import { fileURLToPath } from "node:url";
import type { MigrationSet } from "@zilobase/runtime-adapter/node";

export const CORE_MIGRATION_SET: MigrationSet = {
  id: "core",
  journalTable: "__zilobase_core_migrations",
  migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
};
