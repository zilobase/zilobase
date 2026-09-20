// Community Cloudflare Worker entry template.
// Copy next to wrangler.template.jsonc, point `main` at this file, and deploy.
// No hosted env vars are required: edition extension, demo guard, and
// telemetry reporters are omitted (community defaults apply).
import { createApp } from "@zilobase/server/adapter-api";
import {
  createWorker,
  createWorkerAdapter,
  ChatAgent,
  PageCollaborationRoom,
  MeetingCollaborationRoom,
  DatabaseCollaborationRoom,
  MailNotificationRoom,
  CalendarNotificationRoom,
  NavigationNotificationRoom,
} from "@zilobase/runtime-adapter/worker";

export {
  ChatAgent,
  PageCollaborationRoom,
  MeetingCollaborationRoom,
  DatabaseCollaborationRoom,
  MailNotificationRoom,
  CalendarNotificationRoom,
  NavigationNotificationRoom,
};

const worker = createWorker({
  adapter: createWorkerAdapter(),
  loadApp: async (_env, ports) => createApp({ ports }),
});

export default {
  fetch: worker.fetch,
};
