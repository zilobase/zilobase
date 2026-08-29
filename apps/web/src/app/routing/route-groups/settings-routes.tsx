import { createRoute, redirect } from "@tanstack/react-router";

import ApiKeysSettingsPage from "@/pages/settings/api-keys";
import PreferencesSettingsPage from "@/pages/settings/preferences";
import ProfileSettingsPage from "@/pages/settings/profile";
import TeamSettingsPage from "@/pages/settings/team";
import TeamspacesSettingsPage from "@/pages/settings/teamspaces";
import WorkspaceSettingsPage from "@/pages/settings/workspace";
import ZilobaseAiSettingsPage from "@/pages/settings/zilobase-ai";
import { EditionRouteHost } from "../edition-route-host";
import { appRoute } from "../route-roots";
import {
  validateTeamSettingsSearch,
  validateTeamspaceSettingsSearch,
} from "../search-validators";

export const settingsRoutes = [
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings",
    beforeLoad: () => {
      throw redirect({ to: "/settings/preferences" });
    },
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/preferences",
    component: PreferencesSettingsPage,
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/profile",
    component: ProfileSettingsPage,
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/workspace",
    component: WorkspaceSettingsPage,
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/api-keys",
    component: ApiKeysSettingsPage,
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/zilobase-ai",
    component: ZilobaseAiSettingsPage,
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/team",
    validateSearch: validateTeamSettingsSearch,
    component: TeamSettingsPage,
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/teamspaces",
    validateSearch: validateTeamspaceSettingsSearch,
    component: TeamspacesSettingsPage,
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/enterprise/$",
    component: EditionRouteHost,
  }),
];
