import { createAiRuntimeFixture } from "./ai-runtime-fixture";
import { AskAiWorkspace } from "@/sections/ai/workspace/components/ask-ai-workspace";
import { PageDatabaseSearchPopover } from "@/components/navigation/components/page-database-search-popover";
import { AppSidebar } from "@/app/shell/sidebar/components/app-sidebar";
import { useAppSidebar } from "@/app/shell/sidebar/hooks/sidebar-controller";
import { AppSearchProvider } from "@/app/shell/search/components/app-search";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import {
  sharingTarget,
  sharingLevel,
  sharingAuth,
  sharingResponse,
  sharingWrites,
} from "./sharing-api-fixture";
import { MeetingView } from "@/sections/pages/editor/extensions/meeting/components/meeting-view";
import type { MeetingCapturePhase } from "@/platform/meetings/capture-types";
import { installMeetingCaptureRuntime } from "@/platform/meetings/capture-runtime";
import { SharePopover } from "@/components/sharing/components/share-popover";
import { SettingsDialog } from "@/sections/settings/shell/components/settings-dialog";
import { ChatSidebarPanel } from "@/sections/ai/workspace/components/chat-sidebar";
import {
  GuestPageTitle,
  GuestPageActions,
  PublicPageBreadcrumb,
  PublicLoginButton,
} from "@/sections/pages/header/components/public-page-header";
import "@/styles/global.css";
import "@/styles/app.css";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useLocation,
} from "@tanstack/react-router";
import {
  ZilobaseFeaturesProvider,
  type ApiFetcher,
  type ZilobaseAuthClient,
} from "@zilobase/features";
import { defaultUserSettings } from "@zilobase/features/user-settings";
import { PageLayout } from "@/sections/pages/layout/components/page-layout";
import {
  PageSidePaneContext,
  usePageSidePaneState,
} from "@/sections/pages/presentation/components/page-presentation";
import {
  PageSidePaneLayout,
  PageSidePaneShell,
} from "@/sections/pages/presentation/components/page-side-pane";
import { PageDialog } from "@/sections/pages/presentation/components/page-dialog";
import { useOpenEmbeddedPage } from "@/sections/pages/navigation/hooks/page-navigation";
import {
  PageEditorRegistryProvider,
  usePageEditorRegistry,
} from "@/sections/pages/editor/runtime/components/page-editor-registry";
import {
  PageCommentsRegistryProvider,
  PageEditorCommentsProvider,
  usePageCommentsRegistry,
  usePageEditorComments,
} from "@/sections/pages/editor/comments/components/comments-context";

import { Editor } from "@/sections/pages/editor/editor";
import type { Editor as TiptapEditor } from "@tiptap/core";
import {
  createCommentDocument,
  createPageCommentController,
} from "@/sections/pages/editor/comments/lib/yjs-comments";
import { Toaster } from "sonner";
import { PageDesignEditorProvider } from "@/sections/pages/design/components/page-design-editor";
import { Sidebar, SidebarProvider, useOptionalSidebar } from "@/components/ui/sidebar";
import { ShortcutProvider } from "@/app/shortcuts/shortcut-provider";

const meetingFixture = new URLSearchParams(window.location.search).get("workspace") === "meeting";
const fixtureCaptureStatus = (phase: MeetingCapturePhase) => ({
  checkpointPath: null,
  elapsedMs: 0,
  error: null,
  meetingId: "fixture",
  phase,
  sampleRate: 48000,
});
if (meetingFixture)
  installMeetingCaptureRuntime({
    observe: (_id, observer) => {
      observer.setDevices([]);
      return () => {};
    },
    prepare: async () => {},
    cancelPreparation: async () => {},
    start: async () => fixtureCaptureStatus("recording"),
    pause: async () => fixtureCaptureStatus("paused"),
    resume: async () => fixtureCaptureStatus("recording"),
    stop: async () => fixtureCaptureStatus("stopped"),
    refreshTransport: async () => {},
    deleteLocalFile: async () => {},
    openLocalFile: async () => {},
  });
const fixtureAudience = new URLSearchParams(window.location.search).get("audience");
const databaseCreationFixture =
  new URLSearchParams(window.location.search).get("workspace") === "database-creation";
const databaseViewsFixture =
  new URLSearchParams(window.location.search).get("workspace") === "database-views";
const databaseCreations: Array<{ commandId: string; command: { name: string; pageId: string } }> =
  [];
let rejectDatabaseCreation: (error: Error) => void;
const databaseCreationDelivery = databaseCreationFixture
  ? new Promise<never>((_resolve, reject) => {
      rejectDatabaseCreation = reject;
    })
  : null;
let settings = { ...defaultUserSettings };
const requests: string[] = [];
const writes: unknown[] = [];
const mounts: Record<string, number> = {};
const records = ["main", "child", "other"].map((id) => ({
  id,
  name: id,
  workspaceId: "workspace",
  type: "pageblock",
  url: "#",
  content: null,
  hasContent: false,
  metadata: {},
  isShared: false,
  isFavorite: false,
  deletedAt: null,
  createdAt: "2026-10-15T00:00:00Z",
  updatedAt: "2026-10-15T00:00:00Z",
}));
const aiFixture =
  new URLSearchParams(window.location.search).get("workspace") === "ai"
    ? createAiRuntimeFixture(records)
    : null;
const apiFetch: ApiFetcher = async <T,>(path: string, options?: RequestInit) => {
  requests.push(path);
  if (databaseCreationFixture && path === "/databases/commands") {
    databaseCreations.push(JSON.parse(String(options?.body)));
    return (await databaseCreationDelivery) as T;
  }
  if (aiFixture) {
    const response = await aiFixture.api(path, options);
    if (response !== undefined) return response as T;
  }
  if (meetingFixture && path === "/meetings/fixture")
    return {
      meeting: {
        id: "fixture",
        pageId: "main",
        notesPageId: "main",
        workspaceId: "workspace",
        title: "Meeting",
        status: "idle",
        language: "en",
        instructionsPreset: "auto",
        consentMessage: "Everyone must be notified.",
        autoPlayConsent: false,
        archiveLocalAudio: false,
        summaryGeneratedAt: null,
        summarySourceSegmentCount: 0,
      },
    } as T;
  const sharedResponse = sharingResponse(path, options);
  if (sharedResponse !== undefined) return sharedResponse as T;
  if (path === "/user-settings") {
    if (options?.method === "PATCH") {
      const patch = JSON.parse(String(options.body));
      writes.push(patch);
      settings = { ...settings, ...patch };
    }
    return { settings } as T;
  }
  if (path.includes("/bootstrap"))
    return {
      viewerType: "public",
      database: {
        id: "database",
        workspaceId: "workspace",
        pageId: null,
        name: "Rows",
        accessLevel: databaseViewsFixture ? "full" : sharingTarget ? sharingLevel : "view",
        config: {},
        createdAt: records[0].createdAt,
        updatedAt: records[0].updatedAt,
        deletedAt: null,
        version: 1,
      },
      dataSources: [
        {
          id: "source",
          workspaceId: "workspace",
          parentDatabaseId: "database",
          name: "Rows",
          config: {},
          configVersion: 1,
          version: 1,
          position: 0,
          linkedAt: null,
          createdAt: records[0].createdAt,
          updatedAt: records[0].updatedAt,
        },
      ],
      properties: databaseViewsFixture
        ? [
            {
              id: "date-column",
              dataSourceId: "source",
              propertyId: "date",
              position: 0,
              visible: true,
              width: null,
              createdAt: records[0].createdAt,
              updatedAt: records[0].updatedAt,
              property: {
                id: "date",
                workspaceId: "workspace",
                name: "Date",
                type: "date",
                config: {},
                createdAt: records[0].createdAt,
                updatedAt: records[0].updatedAt,
              },
            },
          ]
        : [],
      views: [
        {
          id: "view",
          databaseId: "database",
          dataSourceId: "source",
          name: "Rows",
          type: "table",
          position: 0,
          config: {},
          createdAt: records[0].createdAt,
          updatedAt: records[0].updatedAt,
        },
        ...(databaseViewsFixture
          ? [
              {
                id: "timeline-view",
                databaseId: "database",
                dataSourceId: "source",
                name: "Timeline",
                type: "timeline",
                position: 1,
                config: { datePropertyId: "date" },
                createdAt: records[0].createdAt,
                updatedAt: records[0].updatedAt,
              },
            ]
          : []),
      ],
    } as T;
  if (path.includes("/records?"))
    return {
      queryHash: new URL(path, location.origin).searchParams.get("expectedQueryHash"),
      databaseVersion: 1,
      dataSourceVersion: 1,
      hasMore: false,
      offset: 0,
      snapshot: "fixture",
      totalCount: 2,
      records: records.slice(1).map((page, index) => ({
        id: `row-${page.id}`,
        pageId: page.id,
        dataSourceId: "source",
        orderKey: String(index),
        parentRowId: null,
        valuesByPropertyId: {},
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
        page: {
          id: page.id,
          name: page.name,
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
          deletedAt: null,
          hasContent: false,
          metadata: {},
        },
      })),
    } as T;
  if (path.startsWith("/pages?")) return { pages: records, databases: [], placements: [] } as T;
  if (path.startsWith("/teamspaces")) return { teamspaces: [] } as T;
  if (path.startsWith("/pages/"))
    return {
      page: records.find((item) => item.id === path.split("/")[2]),
      accessLevel: sharingTarget ? sharingLevel : "view",
      databaseIds: [],
    } as T;
  return {} as T;
};
const auth = {
  ...(aiFixture
    ? aiFixture.auth
    : sharingTarget
      ? sharingAuth
      : {
          getSession: async () => ({
            user: new URLSearchParams(window.location.search).has("inline-comments")
              ? { id: "commenter", name: "Maya Chen", email: "maya@example.test", image: null }
              : null,
            session: null,
          }),
          listWorkspaces: async () => [],
        }),
} as unknown as ZilobaseAuthClient;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Body({ id }: { id: string }) {
  const [draft, setDraft] = useState("");
  const instance = useRef(Math.random());
  const bodyState = new URLSearchParams(window.location.search).get("body");
  useEffect(() => {
    mounts[id] = (mounts[id] ?? 0) + 1;
  }, [id]);
  if (databaseCreationFixture || databaseViewsFixture)
    return (
      <Editor
        session={{
          kind: "local",
          documentId: id,
          workspaceId: "workspace",
          pageId: id,
          content: databaseViewsFixture
            ? '<p>Before database</p><div data-type="databaseBlock" data-database-id="database"></div><p>After database</p>'
            : "<p></p>",
        }}
        capabilities={{ comments: false }}
        presentation={{ hideMetadata: true, enableComments: false }}
        view={{ viewId: id }}
      />
    );
  if (new URLSearchParams(window.location.search).has("comments")) return <CommentsBody id={id} />;
  if (bodyState === "loading") return <p>Loading page...</p>;
  if (bodyState === "error") return <p role="alert">Page unavailable.</p>;
  return (
    <div className="p-6" data-editor-instance={instance.current}>
      <label>
        Draft {id}
        <input
          aria-label={`Draft ${id}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <div style={{ height: 1100 }}>Page content {id}</div>
    </div>
  );
}

const commentControllers = new Map<string, ReturnType<typeof createPageCommentController>>();
const commentEditors = new Map<string, TiptapEditor>();
Object.assign(window, { commentControllers, commentEditors });
function CommentsBody({ id }: { id: string }) {
  const inlineComments = new URLSearchParams(window.location.search).has("inline-comments");
  const registry = usePageCommentsRegistry();
  const { requestEditorComments } = usePageEditorComments();
  const controller = useMemo(
    () =>
      createPageCommentController({
        document: createCommentDocument(),
        canEdit: true,
        canModerate: true,
        user: { id: "commenter", name: "Maya Chen", email: "maya@example.test", image: null },
      }),
    [id],
  );
  useEffect(() => {
    commentControllers.set(id, controller);
    const unregister = registry.register(id, controller);
    return () => {
      unregister();
      controller.destroy();
      commentControllers.delete(id);
      commentEditors.delete(id);
    };
  }, [id, controller, registry]);
  const onEditorReady = useCallback(
    (editor: TiptapEditor | null) => {
      if (!editor) return;
      commentEditors.set(id, editor);
      controller.setEditor(editor);
      if (controller.getSnapshot().threads.length === 0) {
        const thread = inlineComments
          ? controller.createPageThread("Can we make this clearer before launch?")
          : controller.createBlockThread("Can we make this clearer before launch?", {
              from: 1,
              to: 21,
            });
        if (thread) controller.reply(thread, "I will update the draft today.");
        controller.activateThread(null, { openSidebar: false });
      }
    },
    [id, controller, inlineComments],
  );
  return (
    <div>
      <button className="m-4" onClick={() => requestEditorComments(id)}>
        Show comments
      </button>
      <Editor
        session={{
          kind: "local",
          documentId: id,
          pageId: id,
          content:
            "<p>Shared drafts let two agents write one customer reply together.</p><h2>Goals</h2><p>Keep the document readable while discussing changes with the team.</p>" +
            "<p>Review the rollout plan and confirm the launch checklist.</p>".repeat(18),
        }}
        capabilities={{ comments: true }}
        presentation={{
          hideMetadata:
            !inlineComments && !new URLSearchParams(window.location.search).has("cover"),
          enableComments: inlineComments,
          title: "Shared drafts",
          fullWidth: !new URLSearchParams(window.location.search).has("narrow"),
          cover:
            "data:image/svg+xml," +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="280"><rect width="1400" height="280" fill="#dbeafe"/><circle cx="1050" cy="100" r="250" fill="#bfdbfe"/></svg>',
            ),
          commentController: controller,
        }}
        view={{ viewId: id, onEditorReady }}
      />
    </div>
  );
}

function Content({ id }: { id: string }) {
  const state = usePageSidePaneState(id);
  const location = useLocation();
  const audience = fixtureAudience;
  useEffect(() => {
    Object.assign(window, { pageLayoutCommands: state });
  }, [state]);
  if (meetingFixture) {
    const fullPage = new URLSearchParams(window.location.search).has("full");
    const editable = !new URLSearchParams(window.location.search).has("readonly");
    const view = (
      <MeetingView
        meetingId="fixture"
        editable={editable}
        fullPage={fullPage}
        embeddedPage={{ id: "child", name: "Related page", emoji: null }}
      />
    );
    return (
      <PageSidePaneContext.Provider value={state}>
        {fullPage ? (
          <div className="p-4">{view}</div>
        ) : (
          <div className="tiptap-editor" style={{ padding: 16 }}>
            <div className="node-meetingBlock">
              <div data-node-view-wrapper>{view}</div>
            </div>
          </div>
        )}
      </PageSidePaneContext.Provider>
    );
  }
  if (sharingTarget)
    return (
      <div className="p-8">
        <SharePopover
          databaseId={sharingTarget === "database" ? "database" : undefined}
          pageId={sharingTarget === "page" ? "main" : undefined}
        />
      </div>
    );
  if (new URLSearchParams(window.location.search).get("workspace") === "settings")
    return <SettingsFixture />;
  return (
    <PageSidePaneContext.Provider value={state}>
      <div className="flex min-w-0 w-full flex-col">
        <Commands id={id} />
        <div data-fixture-path>{location.href}</div>
        <div
          style={{ height: new URLSearchParams(window.location.search).has("cover") ? 740 : 500 }}
          className="flex min-h-0 flex-col"
        >
          <PageSidePaneShell
            open={state.sidePaneAnimatedOpen}
            visible={Boolean(state.renderedSidePanePageId)}
            body={
              <PageSidePaneLayout
                mainOwnsLayout
                main={
                  <PageLayout
                    pageId={id}
                    placement="main"
                    header={
                      audience === "public"
                        ? {
                            leadingControl: <PublicPageBreadcrumb pageId={id} />,
                            actions: <PublicLoginButton />,
                            showBreadcrumb: false,
                          }
                        : audience === "guest"
                          ? {
                              leadingControl: <GuestPageTitle pageId={id} />,
                              actions: <GuestPageActions />,
                              showBreadcrumb: false,
                            }
                          : undefined
                    }
                  >
                    <Body id={id} />
                  </PageLayout>
                }
                sidePane={
                  state.sidePaneContentReady && state.renderedSidePanePageId ? (
                    <PageLayout
                      pageId={state.renderedSidePanePageId}
                      placement="pane"
                      header={audience ? { leadingControl: null, showActions: false } : undefined}
                      rowNavigationDatabaseId={state.sidePaneDatabaseId}
                      onClose={state.closeSidePane}
                      onOpenFullPage={state.openSidePaneAsFullPage}
                    >
                      <Body id={state.renderedSidePanePageId} />
                    </PageLayout>
                  ) : null
                }
                sidePaneOpen={state.sidePaneAnimatedOpen}
                sidePaneVisible={Boolean(state.renderedSidePanePageId)}
              />
            }
          />
        </div>
        <PageDialog contextPageId={id} readOnly />
      </div>
    </PageSidePaneContext.Provider>
  );
}

function Commands({ id }: { id: string }) {
  const sidebar = useOptionalSidebar();
  useEffect(() => {
    Object.assign(window, { pageLayoutSidebar: sidebar });
  }, [sidebar]);
  const { openPage } = useOpenEmbeddedPage({ contextPageId: id, page: null });
  // Commands intentionally exercise both the preference policy and direct callers.
  const state = useContextState();
  useEffect(() => {
    Object.assign(window, { pageLayoutOpen: openPage });
  }, [openPage]);
  return (
    <div className="flex flex-wrap gap-2 p-2">
      <button onClick={() => openPage("child")}>Open child</button>
      <button onClick={() => openPage(id)}>Open current</button>
      <button onClick={() => state.openSidePane("child")}>Direct pane</button>
      <button onClick={() => state.openSidePane("child", { databaseId: "database" })}>
        Open row
      </button>
      <button onClick={() => state.openEmbeddedPageDialog("child")}>Direct dialog</button>
      <button
        onClick={() => {
          settings = { ...settings, embeddedItemsOpenAs: "dialog" };
          queryClient.setQueryData(["user-settings"], settings);
        }}
      >
        Prefer dialog
      </button>
    </div>
  );
}
import { usePageSidePane as useContextState } from "@/sections/pages/presentation/components/page-presentation";
function FixtureSidebar({ children }: { children: ReactNode }) {
  if (fixtureAudience) return children;
  return (
    <SidebarProvider>
      {new URLSearchParams(window.location.search).has("navigation") ? (
        <>
          <Sidebar>Navigation fixture</Sidebar>
          <SidebarInset className="min-w-0">{children}</SidebarInset>
        </>
      ) : (
        children
      )}
    </SidebarProvider>
  );
}

function SettingsFixture() {
  const [section, setSection] = useState("security");
  const [open, setOpen] = useState(true);
  return (
    <>
      <SettingsDialog
        activeSection={section}
        onOpenChange={setOpen}
        onSectionChange={setSection}
        open={open}
      />
      {!open ? <button onClick={() => setOpen(true)}>Reopen settings</button> : null}
    </>
  );
}

function AiPresentationFixture() {
  const [mode, setMode] = useState<"sidebar" | "floating">("sidebar");
  const [open, setOpen] = useState(true);
  const [full, setFull] = useState(false);
  const state = usePageSidePaneState("main");
  const registry = usePageEditorRegistry();
  useEffect(
    () =>
      registry.registerEditor("main", {
        getContentJson: () => ({
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: aiFixture!.controls.localText }] },
            { type: "databaseBlock", attrs: { databaseId: "database" } },
          ],
        }),
        isEditable: () => true,
        isSynchronized: () => false,
        setContentJson: () => false,
      }),
    [registry],
  );
  return (
    <PageSidePaneContext.Provider value={state}>
      <div className="flex w-full min-w-0 flex-col">
        <button onClick={() => setFull(!full)}>Toggle full page</button>
        <button
          onClick={async () => {
            aiFixture!.controls.workspaceId =
              aiFixture!.controls.workspaceId === "workspace" ? "other" : "workspace";
            queryClient.setQueryData(["session"], await aiFixture!.auth.getSession());
          }}
        >
          Switch workspace
        </button>
        <div data-citation-destination>{state.sidePanePageId ?? state.dialogPageId}</div>
        <div style={{ height: 680, maxWidth: full ? 1100 : 500 }}>
          {open && full ? (
            <AskAiWorkspace pageId="main" />
          ) : open ? (
            <ChatSidebarPanel
              pageId="main"
              onClose={() => setOpen(false)}
              onPresentationModeChange={setMode}
              presentationMode={mode}
            />
          ) : (
            <button onClick={() => setOpen(true)}>Reopen chat</button>
          )}
        </div>
      </div>
    </PageSidePaneContext.Provider>
  );
}

function SearchPickerFixture() {
  const [selected, setSelected] = useState("");
  const type = new URLSearchParams(window.location.search).get("picker");
  return (
    <div className="flex flex-col items-start gap-4 p-8">
      <PageDatabaseSearchPopover
        workspaceId="workspace"
        types={type === "page" || type === "database" ? [type] : undefined}
        onSelect={(item) => setSelected(`${item.type}:${item.title}`)}
      >
        <button>Choose context</button>
      </PageDatabaseSearchPopover>
      <output aria-label="Selected context">{selected}</output>
    </div>
  );
}

function AiApplicationFixture() {
  const sidebar = useAppSidebar({});
  const state = usePageSidePaneState("main");
  return (
    <PageSidePaneContext.Provider value={state}>
      <AppSidebar {...sidebar} />
      <SidebarInset className="h-svh min-w-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger />
          <span>Ask AI</span>
        </header>
        <div className="min-h-0 flex-1">
          <AskAiWorkspace pageId="main" />
        </div>
      </SidebarInset>
    </PageSidePaneContext.Provider>
  );
}

const root = createRootRoute({
  component: () =>
    aiFixture ? (
      new URLSearchParams(window.location.search).has("picker") ? (
        <SearchPickerFixture />
      ) : new URLSearchParams(window.location.search).has("appSidebar") ? (
        <AppSearchProvider>
          <AiApplicationFixture />
        </AppSearchProvider>
      ) : (
        <AiPresentationFixture />
      )
    ) : (
      <Outlet />
    ),
});
const routes = ["main", "child", "other"].map((id) =>
  createRoute({
    getParentRoute: () => root,
    path: `/p/${id}`,
    component: () => <Content id={id} />,
  }),
);
routes.push(
  createRoute({
    getParentRoute: () => root,
    path: "/d/database",
    component: () => <main data-fixture-database-main>Database route</main>,
  }),
);
routes.push(createRoute({ getParentRoute: () => root, path: "/ai", component: () => null }));
const initial =
  new URLSearchParams(window.location.search).get("target") ??
  (new URLSearchParams(window.location.search).has("appSidebar") ? "/ai" : "/p/main");
const history = createMemoryHistory({ initialEntries: [initial] });
const router = createRouter({ routeTree: root.addChildren(routes), history });
Object.assign(window, {
  pageLayoutFixture: {
    databaseCreations,
    rejectDatabaseCreation: () =>
      rejectDatabaseCreation(Object.assign(new Error("Database creation denied"), { status: 403 })),
    ai: aiFixture?.controls,
    mounts,
    requests,
    writes,
    sharingWrites,
    router,
    queryClient,
    settings: () => settings,
  },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ZilobaseFeaturesProvider
      value={{
        deployment: "page-layout-test",
        queryClient,
        apiFetch,
        auth,
        streamFetch: aiFixture?.streamFetch,
      }}
    >
      <ShortcutProvider>
        <PageEditorRegistryProvider>
          <PageCommentsRegistryProvider>
            <PageEditorCommentsProvider>
              <PageDesignEditorProvider>
                <Toaster />
                <FixtureSidebar>
                  <RouterProvider router={router} />
                </FixtureSidebar>
              </PageDesignEditorProvider>
            </PageEditorCommentsProvider>
          </PageCommentsRegistryProvider>
        </PageEditorRegistryProvider>
      </ShortcutProvider>
    </ZilobaseFeaturesProvider>
  </QueryClientProvider>,
);
