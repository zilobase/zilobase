import { ShortcutProvider } from "@/shared/shortcuts";
import { CalendarSettings } from "@/features/calendar/preferences/calendar-settings";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/dialog";
import { validateCalendarSearch } from "@/app/routing/search-validators";
import { useCalendarChatVisibility } from "@/app/shell/side-panel/use-calendar-chat-visibility";
import { useState } from "react";
import { RightSidebars, RightSidebarMobilePanels } from "@/app/shell/side-panel/right-sidebars";
import { ResizablePanelGroup, ResizablePanel } from "@/shared/ui/resizable";
import { PagePaneHeader } from "@/features/pages/pane/page-pane-header";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { Button } from "@/shared/ui/button";
import { CalendarWorkspaceProvider, CalendarDockMount, useCalendarWorkspace } from "@/features/calendar/workspace/calendar-workspace";
import { CalendarToolbar } from "@/features/calendar/workspace/calendar-toolbar";
import { ZilobaseFeaturesProvider, type ZilobaseAuthClient } from "@zilobase/features";
import { apiFetch } from "@/platform/network/api";
import { CalendarAccountsSidebar } from "@/features/calendar/connections/calendar-accounts-sidebar";
import { RemovedCalendars } from "@/features/calendar/preferences/removed-calendars";
import { useCalendarPreferences } from "@/features/calendar/preferences/use-calendar-preferences";
import { SidebarProvider } from "@/shared/ui/sidebar";
import { createRoot } from "react-dom/client";
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet, createMemoryHistory } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CalendarSchedule } from "@/features/calendar/views/calendar-schedule";
import { defaultCalendarPreferences } from "@zilobase/features/calendar";
import "@/shared/styles/global.css";
import "@/app/styles.css";
const preferences = defaultCalendarPreferences("Asia/Kolkata");
const connections = [{ workspaceId: "workspace", bindingId: "binding", accountId: "account", email: "calendar@example.test", status: "connected" as const, pushAvailable: false }];
function FixtureSchedule(props: Parameters<typeof CalendarSchedule>[0]) {
  const workspace = useCalendarWorkspace(), isMobile = useIsMobile();
  const [chatOpen, setChat] = useCalendarChatVisibility();
  const settingsPreferences = useCalendarPreferences("workspace");
  const [settings, setSettings] = useState(false);
  const [floating, setFloating] = useState(false);
  const chatPanel = <div aria-label="AI fixture" className="p-3"><h2>Ask AI</h2><Button onClick={() => setChat(false)}>Close AI</Button><Button onClick={() => setFloating(value => !value)}>Toggle floating AI</Button></div>;
  const panels = { calendarOpen: workspace.panelOpen, calendarPanel: <CalendarDockMount />, chatOpen: chatOpen && (isMobile || !floating), chatPanel, discussionsEnabled: false, discussionsOpen: false, isMobile };
  return <div className="flex min-w-0 flex-1 flex-col">
    <ResizablePanelGroup orientation="horizontal"><ResizablePanel id="fixture-main" minSize="25%"><div className="flex h-full min-h-0 flex-col">
      <PagePaneHeader pathname="/calendar" showBreadcrumb={false} leadingControl={<span>Calendar</span>} actions={<CalendarToolbar onPreferences={data => settingsPreferences.save.mutateAsync(data)} preferences={props.preferences} onSettings={() => setSettings(true)} />} />
      <CalendarSchedule {...props} />
    </div></ResizablePanel><RightSidebars {...panels} navigationSidebarOpen={false} /></ResizablePanelGroup>
    <Dialog open={settings} onOpenChange={setSettings}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogTitle>Calendar settings</DialogTitle><CalendarSettings value={settingsPreferences.query.data ?? props.preferences} pending={settingsPreferences.pending} onSave={data => settingsPreferences.save.mutate(data, { onSuccess: () => setSettings(false) })} /></DialogContent></Dialog>
    <RightSidebarMobilePanels {...panels} />
    {chatOpen && floating && !isMobile && <aside aria-label="Floating AI" className="fixed right-0 top-12 z-50 bg-surface-canvas">{chatPanel}</aside>}
    <Button className="fixed bottom-1 left-1 z-50" onClick={() => { setChat(true); }}>Open AI</Button>
  </div>;
}
const root = createRootRoute({ component: () => <main style={{ height: "100vh" }} className="flex bg-surface-canvas text-content-primary"><Outlet /></main> });
const app = createRoute({ getParentRoute: () => root, id: "app", component: Outlet });
function SidebarFixture() {
  const current = useCalendarPreferences("workspace");
  return <SidebarProvider><aside className="w-64 shrink-0 overflow-y-auto bg-surface-sidebar"><CalendarAccountsSidebar workspaceId="workspace" /><RemovedCalendars workspaceId="workspace" /></aside>{current.query.data && <FixtureSchedule connections={connections} userId="user" preferences={current.query.data} />}</SidebarProvider>;
}
const calendar = createRoute({ getParentRoute: () => app, path: "/calendar", validateSearch: validateCalendarSearch, component: () => new URLSearchParams(window.location.search).has("sidebar") ? <SidebarFixture /> : <FixtureSchedule connections={connections} userId="user" preferences={preferences} /> });
const history = createMemoryHistory({ initialEntries: [sessionStorage.getItem("calendar-fixture-route") ?? "/calendar?date=2026-09-09&view=week"] });
history.subscribe(({ location }) => sessionStorage.setItem("calendar-fixture-route", location.href));
const router = createRouter({ routeTree: root.addChildren([app.addChildren([calendar])]), history });
const queryClient = new QueryClient();
const auth = { getSession: async () => ({ user: { id: "user" } }) } as ZilobaseAuthClient;
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={queryClient}><ZilobaseFeaturesProvider value={{ queryClient, auth, apiFetch }}><ShortcutProvider><CalendarWorkspaceProvider><RouterProvider router={router} /></CalendarWorkspaceProvider></ShortcutProvider></ZilobaseFeaturesProvider></QueryClientProvider>);
Object.assign(window, { calendarFixture: { search: () => router.state.location.search, select: (event: string) => router.navigate({ to: "/calendar", search: { date: "2026-09-09", view: "week", binding: "binding", calendar: "primary", event } }), navigate: (view: string, date = "2026-09-09") => router.navigate({ to: "/calendar", search: { view, date } }) } });
