import { createRoute } from "@tanstack/react-router";

import { AiPage } from "@/features/ai/pages/index";
import { CanvasPage } from "@/features/canvas/index";
import { RecentsPage } from "@/features/library/index";
import { MailPage } from "@/features/mail/index";
import { TasksPage } from "@/features/tasks/index";
import { isFeatureEnabled } from "@/shared/config/feature-flags";
import { appRoute } from "../route-roots";
import { validateAiSearch, validateLibrarySearch, validateMailSearch } from "../search-validators";

export const appRoutes = [
  createRoute({
    getParentRoute: () => appRoute,
    path: "/ai",
    validateSearch: validateAiSearch,
    component: AiPage,
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/canvas",
    component: CanvasPage,
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/recents",
    validateSearch: validateLibrarySearch,
    component: RecentsPage,
  }),
  ...(isFeatureEnabled("mail")
    ? [createRoute({
        getParentRoute: () => appRoute,
        path: "/mail",
        validateSearch: validateMailSearch,
        component: MailPage,
      })]
    : []),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/tasks",
    component: TasksPage,
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/trash",
    component: () => <RecentsPage mode="trash" />,
  }),
];
