import {
  ApplicationSidebarFixture,
  sidebarFixtureApi,
  sidebarFixtureAuth,
} from "./app-sidebar.fixture";
import { ShortcutProvider } from "@/app/shortcuts/shortcut-provider";
import { CalendarSettings } from "@/sections/calendar/preferences/components/calendar-settings";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { validateCalendarSearch } from "@/app/routing/search-validators";
import { useCalendarChatVisibility } from "@/app/shell/panels/components/tool-panels";
import { useState } from "react";
import { PageEditorRegistryProvider } from "@/sections/pages/editor/runtime/components/page-editor-registry";
import RecentsScreen from "@/sections/library/recents-screen";
import { PageSidePaneProvider } from "@/sections/pages/presentation/components/page-presentation";
import { RightSidebars, RightSidebarMobilePanels } from "@/app/shell/panels/components/tool-panels";
import { ResizablePanelGroup, ResizablePanel } from "@/components/ui/resizable";
import { PageHeader } from "@/sections/pages/header/components/page-header";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  CalendarWorkspaceProvider,
  CalendarDockMount,
  useCalendarWorkspace,
} from "@/sections/calendar/workspace/components/calendar-workspace";
import { webClientLifecycle } from "@/platform/network/connectivity";
import { webClientCacheStorage } from "@/platform/storage/client-cache-storage";
import { ZilobaseFeaturesProvider, type ZilobaseAuthClient } from "@zilobase/features";
import { apiFetch } from "@/platform/network/api";
import { CalendarAccountsSidebar } from "@/sections/calendar/connections/components/calendar-accounts-sidebar";
import { RemovedCalendars } from "@/sections/calendar/preferences/components/removed-calendars";
import { useCalendarPreferences } from "@/sections/calendar/preferences/hooks/use-calendar-preferences";
import { SidebarProvider } from "@/components/ui/sidebar";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
  createMemoryHistory,
  useNavigate,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { CalendarSchedule } from "@/sections/calendar/views/components/calendar-schedule";
import { type CalendarPreferences, defaultCalendarPreferences } from "@zilobase/features/calendar";
import "@/styles/global.css";
import "@/styles/app.css";
const preferences = defaultCalendarPreferences("Asia/Kolkata");
const connections = [
  {
    workspaceId: "workspace",
    bindingId: "binding",
    accountId: "account",
    email: "calendar@example.test",
    status: "connected" as const,
    pushAvailable: false,
  },
];
function FixtureSchedule(props: Parameters<typeof CalendarSchedule>[0]) {
  const navigate = useNavigate();
  const workspace = useCalendarWorkspace(),
    isMobile = useIsMobile();
  const [chatOpen, setChat] = useCalendarChatVisibility();
  Object.assign(window.calendarFixture ?? {}, {
    request: (date: string, view = "week") =>
      workspace.navigateCalendar({ date, view: view as CalendarPreferences["view"] }, () => {
        void navigate({ to: "/calendar", search: { date, view } });
      }),
  });
  const settingsPreferences = useCalendarPreferences("workspace");
  const [settings, setSettings] = useState(false);
  const [floating, setFloating] = useState(false);
  const chatPanel = (
    <div aria-label="AI fixture" className="p-3">
      <h2>Ask AI</h2>
      <Button onClick={() => setChat(false)}>Close AI</Button>
      <Button onClick={() => setFloating((value) => !value)}>Toggle floating AI</Button>
    </div>
  );
  const panels = {
    calendarOpen: workspace.panelOpen,
    calendarPanel: <CalendarDockMount />,
    chatOpen: chatOpen && (isMobile || !floating),
    chatPanel,
    discussionsEnabled: false,
    discussionsOpen: false,
    isMobile,
  };
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel id="fixture-main" minSize="25%">
          <div className="flex h-full min-h-0 flex-col">
            <PageHeader
              pathname="/calendar"
              actions={<></>}
              showBreadcrumb={false}
              leadingControl={<span>Calendar</span>}
            />
            <CalendarSchedule {...props} onSettings={() => setSettings(true)} />
          </div>
        </ResizablePanel>
        <RightSidebars {...panels} navigationSidebarOpen={false} />
      </ResizablePanelGroup>
      <Dialog open={settings} onOpenChange={setSettings}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogTitle>Calendar settings</DialogTitle>
          <CalendarSettings
            value={{ ...preferences, ...(settingsPreferences.query.data ?? props.preferences) }}
            pending={settingsPreferences.pending}
            onSave={(data) =>
              settingsPreferences.save.mutate(data, { onSuccess: () => setSettings(false) })
            }
          />
        </DialogContent>
      </Dialog>
      <RightSidebarMobilePanels {...panels} />
      {chatOpen && floating && !isMobile && (
        <aside aria-label="Floating AI" className="fixed right-0 top-12 z-50 bg-surface-canvas">
          {chatPanel}
        </aside>
      )}
      <Button
        className="fixed bottom-1 left-1 z-50"
        onClick={() => {
          setChat(true);
        }}
      >
        Open AI
      </Button>
    </div>
  );
}
const root = createRootRoute({
  component: () => (
    <main style={{ height: "100vh" }} className="flex bg-surface-canvas text-content-primary">
      <Outlet />
    </main>
  ),
});
const appSidebarMode = new URLSearchParams(window.location.search).has("appSidebar");
const app = createRoute({
  getParentRoute: () => root,
  id: "app",
  component: () => (appSidebarMode ? <ApplicationSidebarFixture /> : <Outlet />),
});
function SidebarFixture() {
  const current = useCalendarPreferences("workspace");
  return (
    <SidebarProvider>
      <aside className="w-64 shrink-0 overflow-y-auto bg-surface-sidebar">
        <CalendarAccountsSidebar workspaceId="workspace" />
        <RemovedCalendars workspaceId="workspace" />
      </aside>
      {current.query.data && (
        <FixtureSchedule
          connections={connections}
          userId="user"
          preferences={{ ...preferences, ...current.query.data }}
        />
      )}
    </SidebarProvider>
  );
}
const calendar = createRoute({
  getParentRoute: () => app,
  path: "/calendar",
  validateSearch: validateCalendarSearch,
  component: () =>
    new URLSearchParams(window.location.search).has("sidebar") ? (
      <SidebarFixture />
    ) : (
      <FixtureSchedule connections={connections} userId="user" preferences={preferences} />
    ),
});
const history = createMemoryHistory({
  initialEntries: [
    appSidebarMode
      ? "/recents"
      : (sessionStorage.getItem("calendar-fixture-route") ?? "/calendar?date=2026-09-09&view=week"),
  ],
});
history.subscribe(({ location }) =>
  sessionStorage.setItem("calendar-fixture-route", location.href),
);
const router = createRouter({
  routeTree: root.addChildren([
    app.addChildren([
      calendar,
      ...["/recents", "/p/$pageId", "/d/$databaseId", "/m/$meetingId", "/ai", "/tasks"].map(
        (path) =>
          createRoute({
            getParentRoute: () => app,
            path,
            component: () =>
              path === "/recents" && new URLSearchParams(window.location.search).has("library") ? (
                <PageEditorRegistryProvider>
                  <PageSidePaneProvider>
                    <RecentsScreen />
                  </PageSidePaneProvider>
                </PageEditorRegistryProvider>
              ) : (
                <p>Fixture content</p>
              ),
          }),
      ),
    ]),
  ]),
  history,
});
const queryClient = new QueryClient();
const auth = {
  getSession: async () => ({ user: { id: "user" }, session: { id: "session" } }),
} as ZilobaseAuthClient;
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ZilobaseFeaturesProvider
      value={{
        deployment: "calendar-test",
        cacheStorage: new URLSearchParams(location.search).has("memory")
          ? undefined
          : webClientCacheStorage,
        lifecycle: webClientLifecycle,
        queryClient,
        auth: appSidebarMode ? sidebarFixtureAuth : auth,
        apiFetch: appSidebarMode ? sidebarFixtureApi : apiFetch,
      }}
    >
      <ShortcutProvider>
        <CalendarWorkspaceProvider>
          <RouterProvider router={router} />
        </CalendarWorkspaceProvider>
      </ShortcutProvider>
    </ZilobaseFeaturesProvider>
  </QueryClientProvider>,
);
Object.assign(window, {
  calendarFixture: {
    offline: () => onlineManager.setOnline(false),
    online: () => onlineManager.setOnline(true),
    search: () => router.state.location.search,
    select: (event: string) =>
      router.navigate({
        to: "/calendar",
        search: {
          date: "2026-09-09",
          view: "week",
          binding: "binding",
          calendar: "primary",
          event,
        },
      }),
    navigate: (view: string, date = "2026-09-09") =>
      router.navigate({ to: "/calendar", search: { view, date } }),
  },
});
