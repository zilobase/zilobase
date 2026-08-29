import { createRoute } from "@tanstack/react-router";

import AiPage from "@/pages/ai";
import CanvasPage from "@/pages/canvas";
import RecentsPage from "@/pages/recents";
import TasksPage from "@/pages/tasks";
import { appRoute } from "../route-roots";
import { validateAiSearch, validateLibrarySearch } from "../search-validators";

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
