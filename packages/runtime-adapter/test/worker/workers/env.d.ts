import type { CalendarNotificationRoom } from "../../../src/worker/features/calendar-realtime/calendar-notification-room";
import type { DatabaseCollaborationRoom } from "../../../src/worker/features/database-realtime/database-collaboration-room";
import type { MailNotificationRoom } from "../../../src/worker/features/mail-realtime/mail-notification-room";
import type { NavigationNotificationRoom } from "../../../src/worker/features/navigation-realtime/navigation-notification-room";
import type { MeetingCollaborationRoom } from "../../../src/worker/features/collaboration/meeting-collaboration-room";
import type { PageCollaborationRoom } from "../../../src/worker/features/collaboration/page-collaboration-room";

declare module "cloudflare:test" {
  interface ProvidedEnv {
    DATABASE_COLLABORATION: DurableObjectNamespace<DatabaseCollaborationRoom>;
    CALENDAR_NOTIFICATION_ROOM: DurableObjectNamespace<CalendarNotificationRoom>;
    MAIL_NOTIFICATION_ROOM: DurableObjectNamespace<MailNotificationRoom>;
    NAVIGATION_NOTIFICATION_ROOM: DurableObjectNamespace<NavigationNotificationRoom>;
    MEETING_COLLABORATION: DurableObjectNamespace<MeetingCollaborationRoom>;
    PAGE_COLLABORATION: DurableObjectNamespace<PageCollaborationRoom>;
  }
}
