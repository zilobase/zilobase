import { useState } from "react";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "@/app/shell/sidebar/components/app-sidebar";
import { useAppSidebar } from "@/app/shell/sidebar/hooks/sidebar-controller";
import { AppSearchProvider } from "@/app/shell/search/components/app-search";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { defaultUserSettings, normalizeSidebarConfig } from "@zilobase/features/user-settings";
import type { ApiFetcher, ZilobaseAuthClient } from "@zilobase/features";

const sectionMenus = new URLSearchParams(window.location.search).has("sectionMenus");
const section = (kind: string) => ({
  id: kind,
  kind,
  limit: kind === "recents" ? 5 : 10,
  sort: "alphabetical",
});
let settings = {
  ...defaultUserSettings,
  sidebarConfig: normalizeSidebarConfig({
    version: 3,
    defaultLayout: {
      tabs: [
        {
          id: "home",
          name: "Home",
          icon: "home",
          shortcuts: [{ id: "create", target: { type: "action", action: "createPage" } }],
          sections: [
            ...(sectionMenus ? [section("recents")] : []),
            section("favorites"),
            section("private"),
            section("meetings"),
            ...(sectionMenus ? [section("shared"), section("teamspaces")] : []),
          ],
        },
        {
          id: "work",
          name: "Work",
          icon: "briefcase",
          shortcuts: [],
          sections: [section("recents")],
        },
      ],
      taskDatabaseIds: [],
    },
    workspaceLayouts: {},
  }),
};
if (sectionMenus) {
  const saved = sessionStorage.getItem("sidebar-menu-settings");
  if (saved) settings = { ...settings, ...JSON.parse(saved) };
}
const page = (id: string, name: string) => ({
  id,
  name,
  workspaceId: "workspace",
  type: "pageblock",
  url: "#",
  content: null,
  hasContent: false,
  metadata: {},
  isShared: false,
  isFavorite: id === "parent",
  lastVisitedAt: "2026-10-15T01:00:00Z",
  createdAt: "2026-10-15T00:00:00Z",
  updatedAt: "2026-10-15T00:00:00Z",
  deletedAt: null,
});
const pages = [page("parent", "Parent page"), page("child", "Child page")];
if (sectionMenus) {
  pages.push(
    ...Array.from({ length: 12 }, (_, index) => ({
      ...page(`extra-${index}`, `Extra ${index}`),
      isFavorite: true,
    })),
  );
  pages.push({ ...page("shared", "Shared page"), isShared: true });
}
const requests: string[] = [];
const saves: unknown[] = [];
export const sidebarFixtureApi: ApiFetcher = async <T,>(
  path: string,
  options?: RequestInit,
): Promise<T> => {
  requests.push(`${options?.method ?? "GET"} ${path}`);
  if (path === "/user-settings") {
    if (options?.method === "PATCH") {
      const patch = JSON.parse(String(options.body));
      saves.push(patch);
      settings = { ...settings, ...patch };
      if (sectionMenus) sessionStorage.setItem("sidebar-menu-settings", JSON.stringify(patch));
    }
    return { settings } as T;
  }
  if (path.startsWith("/pages?") && options?.method !== "POST")
    return {
      pages,
      databases: [
        {
          id: "database",
          name: "Database",
          workspaceId: "workspace",
          pageId: null,
          config: {},
          metadataState: { version: 1, primarySource: { id: "source", version: 1 } },
          dataSources: [
            {
              id: "source",
              workspaceId: "workspace",
              parentDatabaseId: "database",
              name: "Database",
              config: {},
              configVersion: 1,
              version: 1,
              position: 0,
              linkedAt: null,
              createdAt: "2026-10-15T00:00:00Z",
              updatedAt: "2026-10-15T00:00:00Z",
            },
          ],
          views: [
            { id: "default", name: "Default", type: "table", position: 0 },
            { id: "second", name: "Second view", type: "board", position: 1 },
          ].map((view) => ({
            ...view,
            databaseId: "database",
            dataSourceId: "source",
            config: {},
            createdAt: "2026-10-15T00:00:00Z",
            updatedAt: "2026-10-15T00:00:00Z",
          })),
          createdAt: "2026-10-15T00:00:00Z",
          updatedAt: "2026-10-15T00:00:00Z",
        },
      ],
      placements: [
        {
          id: "child-placement",
          workspaceId: "workspace",
          itemKind: "page",
          itemId: "child",
          parentKind: "page",
          parentId: "parent",
          placementKind: "primary",
          position: 0,
        },
      ],
    } as T;
  if (path === "/pages" && options?.method === "POST") {
    const created = page(`created-${pages.length}`, "Created page");
    pages.push(created);
    return { page: created } as T;
  }
  if (path.includes("teamspace-settings")) return { canManage: true } as T;
  if (path.includes("teamspaces")) return { teamspaces: [] } as T;
  if (path.includes("notifications")) return { notifications: [], unreadCount: 0 } as T;
  if (path.startsWith("/meetings?"))
    return {
      meetings: [
        {
          id: "meeting",
          title: "Weekly meeting",
          pageId: "parent",
          workspaceId: "workspace",
          updatedAt: "2026-10-15T00:00:00Z",
        },
      ],
    } as T;
  if (path.includes("integration") || path.includes("calendar"))
    return { providerConfigured: false } as T;
  if (path.startsWith("/pages/"))
    return { page: pages.find((item) => item.id === path.split("/")[2]), accessLevel: "full" } as T;
  return {} as T;
};
export const sidebarFixtureAuth = {
  getSession: async () => ({
    user: { id: "user" },
    session: { activeWorkspaceId: "workspace" },
    workspacePinned: true,
  }),
  listWorkspaces: async () => [
    { id: "workspace", name: "Sidebar workspace", slug: "sidebar-workspace" },
  ],
} as unknown as ZilobaseAuthClient;

function SidebarContentFixture() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sidebar = useAppSidebar({ onOpenSettings: () => setSettingsOpen(true), settingsOpen });
  const location = useRouterState({ select: (state) => state.location });
  Object.assign(window, { appSidebarFixture: { requests, saves, path: location.href } });
  return (
    <>
      <AppSidebar {...sidebar} />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-3">
          <SidebarTrigger />
          <span>Sidebar fixture</span>
        </header>
        <div className="p-4">
          <label>
            Editor
            <input aria-label="Editor" />
          </label>
          <p data-fixture-path>{location.href}</p>
          <Outlet />
          {settingsOpen ? <p>Settings opened</p> : null}
        </div>
      </SidebarInset>
    </>
  );
}
export function ApplicationSidebarFixture() {
  return (
    <AppSearchProvider>
      <SidebarProvider className="h-svh overflow-hidden">
        <SidebarContentFixture />
      </SidebarProvider>
    </AppSearchProvider>
  );
}
