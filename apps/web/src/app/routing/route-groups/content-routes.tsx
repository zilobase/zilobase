import { createRoute } from "@tanstack/react-router";

import DatabasePage from "@/pages/database";
import { MeetingPage } from "@/features/meetings/pages/index";
import { Page } from "@/features/pages/pages/index";
import {
  applyDatabaseShareAccess,
  applyPageShareAccess,
  getFreshSession,
} from "../guards";
import { AppContentPendingPage } from "../pending-pages";
import { rootRoute } from "../route-roots";
import { validateDatabaseSearch, validateMeetingSearch } from "../search-validators";

export const contentRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/p/$pageId",
    validateSearch: validateMeetingSearch,
    beforeLoad: async ({ params }) => ({
      publishedShare: await applyPageShareAccess(params.pageId),
    }),
    component: Page,
    pendingComponent: AppContentPendingPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/m/$meetingId",
    beforeLoad: async () => ({
      authenticatedMeeting: Boolean(
        (await getFreshSession({ optional: true })).user,
      ),
    }),
    component: MeetingPage,
    pendingComponent: AppContentPendingPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/d/$databaseId",
    validateSearch: validateDatabaseSearch,
    beforeLoad: async ({ params }) => ({
      publishedShare: await applyDatabaseShareAccess(params.databaseId),
    }),
    component: DatabasePage,
    pendingComponent: AppContentPendingPage,
  }),
];
