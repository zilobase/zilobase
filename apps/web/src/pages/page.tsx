import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Link,
  useParams,
  useRouteContext,
  useSearch,
} from "@tanstack/react-router";
import { ArrowRight, Maximize2 } from "lucide-react";

import { AppLayout } from "@/components/app-layout";
import { FallbackErrorBoundary } from "@/components/fallback-error-boundary";
import { PageWorkspaceGate } from "@/components/page-workspace-gate";
import {
  PageSidePaneLayout,
  PageSidePaneProvider,
  usePageSidePane,
} from "@/contexts/page-side-pane";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TrashedItemBanner } from "@/components/trashed-item-banner";
import { isEmbeddedMobileViewer } from "@/lib/embedded-view";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatPageBreadcrumbLabel } from "@/lib/page-icon";
import {
  getPageCover,
  getPageEmoji,
  getPageIconPosition,
  resolvePageFullWidth,
  type PageIconPosition,
  type PageMetadata,
} from "@zilobase/features/pages";
import { useDeleteDatabase } from "@zilobase/features/databases";
import {
  useDeleteMeeting,
  useWorkspaceMeetings,
} from "@zilobase/features/meetings";
import {
  useUpdatePage,
  useRestorePage,
  useCreatePage,
  useEmbedPageItem,
  useRemovePageEmbed,
  usePage,
  usePageAccessLevel,
  usePageDatabaseIds,
  usePageNavigation,
  useResolvedPageLayout,
} from "@zilobase/features/pages";
import {
  extractDatabaseIds,
  insertDatabaseBlockInContent,
  isEffectivelyEmptyPageContent,
} from "@zilobase/page-context";
import { EmbeddedPageDialog } from "@/components/embedded-page-dialog";
import { useOpenEmbeddedPage } from "@/hooks/use-open-embedded-page";
import { useSession } from "@zilobase/features/auth";
import { useUserSettings } from "@zilobase/features/user-settings";
import { usePageEditorRegistry } from "@/contexts/page-editor-registry";
import { createPageEditorHandle } from "@/hooks/use-page-edit-applier";
import { Editor, type PageEditPreviewControls } from "@/packages/editor";
import type {
  OpenPageOptions,
  PageLayoutPanelMode,
  StructuralBlockDeleteRequest,
} from "@/packages/editor/types";
import { usePageCollaboration } from "@/packages/editor/use-page-collaboration";
import { canEditOnlineDatabase } from "@/packages/editor/database-editability";
import {
  useConnectivity,
  useOfflineManifest,
  useOfflineSessionLocked,
} from "@/providers/offline-provider";
import { createPageCommentController } from "@/comments/yjs-comments";
import { usePageCommentsRegistry } from "@/contexts/page-comments-registry";
import { useTitleDraft } from "@/hooks/use-title-draft";
import { scrollToMeetingBlock } from "@/lib/meeting-navigation";
import {
  getMissingHostedMeetingIds,
  getMissingPlacedDatabaseIds,
  getPlacedDatabaseIds,
  insertMeetingBlockInContent,
} from "./page-hierarchy-blocks";

type PageEditorPaneProps = {
  afterMetadata?: ReactNode;
  className?: string;
  databaseId?: string | null;
  enableComments?: boolean;
  focusMeetingId?: string;
  hideChrome?: boolean;
  hideEditorContent?: boolean;
  layoutPanelMode?: PageLayoutPanelMode;
  onOpenPage: (pageId: string, options?: OpenPageOptions) => void;
  onTitleChange?: (title: string) => void;
  readOnly?: boolean;
  pageId: string;
};

export default function Page() {
  const { pageId } = useParams({ from: "/p/$pageId" });
  const { publishedShare } = useRouteContext({ from: "/p/$pageId" });
  const { data: session } = useSession();

  if (!session?.user || publishedShare === "public") {
    return <PublicPage />;
  }

  return (
    <FallbackErrorBoundary
      fallback={<PublicPage />}
      key={pageId}
      name="page.authenticated"
    >
      <AppLayout>
        <AuthenticatedPage />
      </AppLayout>
    </FallbackErrorBoundary>
  );
}

function AuthenticatedPage() {
  const { pageId } = useParams({ from: "/p/$pageId" });
  const { meeting: focusMeetingId } = useSearch({ from: "/p/$pageId" });
  const { data: page } = usePage(pageId, { refetchOnMount: false });
  const {
    renderedSidePanePageId,
    sidePaneAnimatedOpen,
    sidePaneContentReady,
    sidePaneDatabaseId,
  } = usePageSidePane();
  const { openPage } = useOpenEmbeddedPage({
    contextPageId: pageId,
    page,
  });

  return (
    <PageSidePaneLayout
      main={
        <PageWorkspaceGate pageId={pageId}>
          <PageEditorPane
            focusMeetingId={focusMeetingId}
            key={pageId}
            onOpenPage={openPage}
            pageId={pageId}
          />
        </PageWorkspaceGate>
      }
      sidePane={
        sidePaneContentReady && renderedSidePanePageId ? (
          <PageWorkspaceGate pageId={renderedSidePanePageId}>
            <PageEditorPane
              databaseId={sidePaneDatabaseId}
              enableComments={false}
              layoutPanelMode="overlay"
              key={renderedSidePanePageId}
              onOpenPage={openPage}
              pageId={renderedSidePanePageId}
            />
          </PageWorkspaceGate>
        ) : null
      }
      sidePaneOpen={sidePaneAnimatedOpen}
      sidePaneVisible={renderedSidePanePageId !== null}
    />
  );
}

function PublicPage() {
  const { pageId } = useParams({ from: "/p/$pageId" });

  return (
    <PageSidePaneProvider resetKey={pageId}>
      <PublicPageContent pageId={pageId} />
    </PageSidePaneProvider>
  );
}

function PublicPageContent({ pageId }: { pageId: string }) {
  const { data: page } = usePage(pageId, { refetchOnMount: false });
  const {
    closeSidePane,
    renderedSidePanePageId,
    sidePaneAnimatedOpen,
    sidePaneContentReady,
    sidePaneDatabaseId,
  } = usePageSidePane();
  const { openPage } = useOpenEmbeddedPage({
    contextPageId: pageId,
    page,
  });

  return (
    <>
      <PageSidePaneLayout
        className="bg-background"
        standalone
        viewportHeightClass="h-svh"
        main={
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <PublicPaneTopbar pageId={pageId} />
            <PageEditorPane
              className="min-h-0 min-w-0 flex-1 overflow-y-auto"
              key={pageId}
              onOpenPage={openPage}
              readOnly
              pageId={pageId}
            />
          </div>
        }
        sidePane={
          renderedSidePanePageId ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    aria-label="Close side pane"
                    onClick={closeSidePane}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowRight />
                  </Button>
                  <Button
                    aria-label="Open as main page"
                    asChild
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Link
                      params={{ pageId: renderedSidePanePageId }}
                      to="/p/$pageId"
                    >
                      <Maximize2 />
                    </Link>
                  </Button>
                </div>
                <PublicPageBreadcrumb pageId={renderedSidePanePageId} />
              </div>
              {sidePaneContentReady ? (
                <PageEditorPane
                  className="min-h-0 flex-1"
                  databaseId={sidePaneDatabaseId}
                  enableComments={false}
                  key={renderedSidePanePageId}
                  onOpenPage={openPage}
                  readOnly
                  pageId={renderedSidePanePageId}
                />
              ) : null}
            </div>
          ) : null
        }
        sidePaneOpen={sidePaneAnimatedOpen}
        sidePaneVisible={renderedSidePanePageId !== null}
      />
      <EmbeddedPageDialog onOpenPage={openPage} />
    </>
  );
}

export function PublicPaneTopbar({ pageId }: { pageId: string | null }) {
  if (isEmbeddedMobileViewer()) {
    return null;
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
      <PublicPageBreadcrumb pageId={pageId} />
      <PublicLoginButton />
    </header>
  );
}

export function PublicPageBreadcrumb({ pageId }: { pageId: string | null }) {
  if (!pageId) {
    return null;
  }

  return (
    <nav className="min-w-0 flex-1 text-sm" aria-label="Breadcrumb">
      <ol className="flex min-w-0 items-center gap-1 text-muted-foreground">
        <PublicPageBreadcrumbAncestors pageId={pageId} />
      </ol>
    </nav>
  );
}

function PublicPageBreadcrumbAncestors({ pageId }: { pageId: string }) {
  const { data: page } = usePage(pageId);
  const parentItemId = page?.parentPageId ?? null;

  return (
    <>
      {parentItemId ? (
        <>
          <PublicPageBreadcrumbAncestors pageId={parentItemId} />
          <li className="shrink-0">/</li>
        </>
      ) : null}
      <li className="min-w-0">
        <Link
          className="block max-w-48 truncate text-foreground hover:underline sm:max-w-72"
          params={{ pageId }}
          to="/p/$pageId"
        >
          {page ? getPageBreadcrumbLabel(page) : "Page"}
        </Link>
      </li>
    </>
  );
}

function PublicLoginButton() {
  return (
    <Button asChild size="sm" variant="outline">
      <Link to="/login">Login</Link>
    </Button>
  );
}

function getPageBreadcrumbLabel(
  page: NonNullable<ReturnType<typeof usePage>["data"]>,
) {
  return formatPageBreadcrumbLabel(page);
}

export function PageEditorPane({
  afterMetadata,
  className,
  databaseId,
  enableComments = true,
  focusMeetingId,
  hideChrome = false,
  hideEditorContent = false,
  layoutPanelMode = "auto",
  onOpenPage,
  onTitleChange,
  readOnly = false,
  pageId,
}: PageEditorPaneProps) {
  const connectivity = useConnectivity();
  const offlineSessionLocked = useOfflineSessionLocked();
  const offlineManifest = useOfflineManifest();
  const { data: page, isLoading } = usePage(pageId);
  const { data: session } = useSession();
  const { data: accessLevel } = usePageAccessLevel(pageId, {
    refetchOnMount: false,
  });
  const { data: pageDatabaseIds = [] } = usePageDatabaseIds(pageId, {
    refetchOnMount: false,
  });
  const { data: navigation } = usePageNavigation(page?.workspaceId);
  const { data: meetingsPayload } = useWorkspaceMeetings(page?.workspaceId);
  const effectiveDatabaseId = databaseId ?? pageDatabaseIds[0] ?? null;
  const { data: userSettings } = useUserSettings();
  const { data: resolvedLayout } = useResolvedPageLayout({
    pageId,
    databaseId: effectiveDatabaseId,
  });
  const appliedLayout =
    resolvedLayout?.sources &&
    typeof resolvedLayout.sources === "object" &&
    Object.keys(resolvedLayout.sources).length > 0
      ? resolvedLayout.config
      : undefined;
  const createPage = useCreatePage();
  const embedPageItem = useEmbedPageItem();
  const removePageEmbed = useRemovePageEmbed();
  const deleteDatabase = useDeleteDatabase();
  const deleteMeeting = useDeleteMeeting();
  const updatePage = useUpdatePage();
  const restorePage = useRestorePage();
  const contentSaveTimeoutRef = useRef<number | null>(null);
  const lastSavedContentRef = useRef<string | null>(null);
  const lastPageBlockIdsRef = useRef<Set<string>>(new Set());
  const requestedDatabaseEmbedKeysRef = useRef<Set<string>>(new Set());
  const pendingContentRef = useRef<unknown>(null);
  const editorContentRef = useRef<(() => unknown) | null>(null);
  const editorInstanceRef = useRef<import("@tiptap/core").Editor | null>(null);
  const pageEditPreviewRef = useRef<PageEditPreviewControls | null>(null);
  const paneRef = useRef<HTMLElement | null>(null);
  const { getEditorHandle, registerEditor, unregisterEditor } =
    usePageEditorRegistry();

  const getStructuralBlockDeleteAction = useCallback(
    (request: StructuralBlockDeleteRequest) => {
      if (request.type !== "database") {
        return "move-to-trash" as const;
      }

      const placement = navigation?.placements.find(
        (candidate) =>
          candidate.parentKind === "page" &&
          candidate.parentId === page?.id &&
          candidate.itemKind === "database" &&
          candidate.itemId === request.id,
      );

      return placement?.placementKind === "linked"
        ? ("remove-link" as const)
        : ("move-to-trash" as const);
    },
    [navigation, page?.id],
  );

  const deleteStructuralBlock = useCallback(
    async (request: StructuralBlockDeleteRequest) => {
      if (!page) {
        throw new Error("Page is unavailable.");
      }

      if (request.type === "meeting") {
        await deleteMeeting.mutateAsync(request.id);
        return;
      }

      if (getStructuralBlockDeleteAction(request) === "remove-link") {
        await removePageEmbed.mutateAsync({
          hostPageId: page.id,
          itemId: request.id,
          kind: "database",
        });
        return;
      }

      await deleteDatabase.mutateAsync(request.id);
    },
    [
      deleteDatabase,
      deleteMeeting,
      getStructuralBlockDeleteAction,
      page,
      removePageEmbed,
    ],
  );
  const commentsRegistry = usePageCommentsRegistry();
  const [cover, setCover] = useState("");
  const [emoji, setEmoji] = useState("");
  const [iconPosition, setIconPosition] =
    useState<PageIconPosition>("inline");
  const fullWidth = resolvePageFullWidth(page, userSettings?.pageFullWidth);
  const pageEditable =
    !readOnly &&
    !page?.deletedAt &&
    (accessLevel === "edit" || accessLevel === "full");
  const { setTitle: setName, title: name } = useTitleDraft({
    enabled: pageEditable,
    onSave: async (nextName) => {
      if (!page) return;
      await updatePage.mutateAsync({ id: page.id, name: nextName });
      onTitleChange?.(nextName);
    },
    sourceId: page?.id ?? null,
    sourceTitle: page?.name ?? "",
  });

  const flushContentSaveTimeout = useCallback(() => {
    if (contentSaveTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(contentSaveTimeoutRef.current);
    contentSaveTimeoutRef.current = null;

    if (page && pendingContentRef.current !== null) {
      updatePage.mutate({
        id: page.id,
        content: pendingContentRef.current,
      });
      pendingContentRef.current = null;
    }
  }, [updatePage, page]);

  const clearContentSaveTimeout = useCallback(() => {
    if (contentSaveTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(contentSaveTimeoutRef.current);
    contentSaveTimeoutRef.current = null;
    pendingContentRef.current = null;
  }, []);

  const pageCover = page ? (getPageCover(page) ?? "") : "";
  const pageEmoji = page ? (getPageEmoji(page) ?? "") : "";
  const pageIconPosition = page ? getPageIconPosition(page) : "inline";

  useEffect(() => {
    if (!page) {
      return;
    }

    setCover(pageCover);
    setEmoji(pageEmoji);
    setIconPosition(pageIconPosition);
  }, [page?.id, pageCover, pageEmoji, pageIconPosition]);

  useEffect(() => {
    return flushContentSaveTimeout;
  }, [flushContentSaveTimeout, pageId]);

  useEffect(() => {
    if (!pageEditable || !page || !navigation) {
      return;
    }

    const placedDatabaseIds = new Set(
      getPlacedDatabaseIds(navigation.placements, page.id),
    );

    for (const databaseId of extractDatabaseIds(page.content)) {
      const requestKey = `${page.id}:${databaseId}`;

      if (
        placedDatabaseIds.has(databaseId) ||
        requestedDatabaseEmbedKeysRef.current.has(requestKey)
      ) {
        continue;
      }

      requestedDatabaseEmbedKeysRef.current.add(requestKey);
      void embedPageItem
        .mutateAsync({
          hostPageId: page.id,
          itemId: databaseId,
          kind: "database",
        })
        .catch(() => {
          requestedDatabaseEmbedKeysRef.current.delete(requestKey);
        });
    }
  }, [embedPageItem, navigation, page, pageEditable]);

  const collaborationEnabled = Boolean(
    pageEditable ||
      (enableComments && session?.user && page && !page.deletedAt),
  );
  const collaboration = usePageCollaboration({
    enabled: collaborationEnabled,
    pageId,
    user: session?.user,
    workspaceId: page?.workspaceId,
  });
  const commentController = useMemo(() => {
    if (!enableComments || !collaboration.provider || !collaboration.document || !session?.user) {
      return null;
    }

    return createPageCommentController({
      canEdit: pageEditable,
      canModerate: accessLevel === "full",
      document: collaboration.document,
      user: {
        email: session.user.email ?? null,
        id: session.user.id,
        image: session.user.image ?? null,
        name: session.user.name ?? null,
      },
    });
  }, [
    accessLevel,
    collaboration.provider,
    collaboration.document,
    enableComments,
    pageEditable,
    session?.user,
  ]);

  useEffect(() => {
    if (!commentController) return;
    const unregister = commentsRegistry.register(pageId, commentController);
    return () => {
      unregister();
      commentController.destroy();
    };
  }, [commentController, commentsRegistry, pageId]);
  const liveEditingReady =
    !pageEditable || Boolean(collaboration.document && !collaboration.error);
  const waitingForCollaboration =
    collaborationEnabled &&
    !collaboration.error &&
    connectivity === "online" &&
    !collaboration.downloaded &&
    (!collaboration.document || !collaboration.provider);

  useEffect(() => {
    if (!focusMeetingId || isLoading || waitingForCollaboration) return;

    const root = paneRef.current;
    if (!root) return;

    const revealMeeting = () => scrollToMeetingBlock(root, focusMeetingId);

    if (revealMeeting()) return;

    const observer = new MutationObserver(() => {
      if (revealMeeting()) observer.disconnect();
    });
    observer.observe(root, { childList: true, subtree: true });
    const timeout = window.setTimeout(() => observer.disconnect(), 5_000);

    return () => {
      window.clearTimeout(timeout);
      observer.disconnect();
    };
  }, [focusMeetingId, isLoading, page?.id, waitingForCollaboration]);
  const offlineEditing =
    collaboration.downloaded &&
    (connectivity !== "online" || collaboration.status === "blocked");
  const databaseEditingReady = canEditOnlineDatabase({
    connectivity,
    offlineSessionLocked,
    pageEditable,
  });

  const restoreTrashedPage = () => {
    if (!page || restorePage.isPending) {
      return;
    }

    restorePage.mutate(page.id, {
      onSuccess: () => {
        toast.success("Page restored.");
      },
      onError: (error) => {
        toast.error(
          error instanceof Error ? error.message : "Could not restore page.",
        );
      },
    });
  };

  const updateCover = (nextCover: string) => {
    setCover(nextCover);

    if (
      readOnly ||
      !page ||
      page.deletedAt ||
      (accessLevel !== "edit" && accessLevel !== "full")
    ) {
      return;
    }

    updatePage.mutate({
      id: page.id,
      metadata: {
        ...((page.metadata ?? {}) as PageMetadata),
        cover: nextCover,
      },
    });
  };

  const updateEmoji = (nextEmoji: string) => {
    setEmoji(nextEmoji);

    if (
      readOnly ||
      !page ||
      page.deletedAt ||
      (accessLevel !== "edit" && accessLevel !== "full")
    ) {
      return;
    }

    updatePage.mutate({
      id: page.id,
      metadata: {
        ...((page.metadata ?? {}) as PageMetadata),
        emoji: nextEmoji,
      },
    });
  };

  const updateIconPosition = (nextPosition: PageIconPosition) => {
    setIconPosition(nextPosition);

    if (
      readOnly ||
      !page ||
      page.deletedAt ||
      (accessLevel !== "edit" && accessLevel !== "full")
    ) {
      return;
    }

    updatePage.mutate({
      id: page.id,
      metadata: {
        ...((page.metadata ?? {}) as PageMetadata),
        iconPosition: nextPosition,
      },
    });
  };

  const updateContent = useCallback(
    (content: unknown) => {
      if (!page) {
        return;
      }
      if (
        readOnly ||
        page.deletedAt ||
        (accessLevel !== "edit" && accessLevel !== "full")
      ) {
        return;
      }

      const serializedContent = serializePageContent(content);

      if (
        serializedContent &&
        serializedContent === lastSavedContentRef.current
      ) {
        return;
      }

      if (serializedContent) {
        lastSavedContentRef.current = serializedContent;
      }

      const nextPageBlockIds = extractPageBlockIds(content);
      const removedPageBlockIds = [...lastPageBlockIdsRef.current].filter(
        (pageId) => !nextPageBlockIds.has(pageId),
      );

      lastPageBlockIdsRef.current = nextPageBlockIds;
      for (const pageId of removedPageBlockIds) {
        removePageEmbed.mutate({
          hostPageId: page.id,
          itemId: pageId,
          kind: "page",
        });
      }

      if (collaboration.document) {
        return;
      }

      clearContentSaveTimeout();
      pendingContentRef.current = content;

      contentSaveTimeoutRef.current = window.setTimeout(() => {
        updatePage.mutate({ id: page.id, content });
        contentSaveTimeoutRef.current = null;
        pendingContentRef.current = null;
      }, 800);
    },
    [
      accessLevel,
      clearContentSaveTimeout,
      collaboration.document,
      readOnly,
      removePageEmbed,
      updatePage,
      page,
    ],
  );

  useEffect(() => {
    registerEditor(
      pageId,
      createPageEditorHandle({
        editable: pageEditable && liveEditingReady,
        getEditor: () => editorInstanceRef.current,
        onContentChange: updateContent,
        pageEditPreviewRef,
      }),
    );

    return () => {
      unregisterEditor(pageId);
    };
  }, [
    liveEditingReady,
    pageEditable,
    registerEditor,
    unregisterEditor,
    updateContent,
    pageId,
  ]);

  useEffect(() => {
    if (!pageEditable || !page || !navigation) {
      return;
    }

    const handle = getEditorHandle(page.id);

    if (!handle?.isEditable()) {
      return;
    }

    let content = handle.getContentJson();

    if (
      isEffectivelyEmptyPageContent(content) &&
      !isEffectivelyEmptyPageContent(page.content)
    ) {
      if (!handle.setContentJson(page.content)) {
        return;
      }

      content = handle.getContentJson() ?? page.content;
    }

    const missingDatabaseIds = getMissingPlacedDatabaseIds(
      content,
      navigation.placements,
      page.id,
    );

    if (missingDatabaseIds.length === 0) {
      return;
    }

    let nextContent = content;

    for (const databaseId of missingDatabaseIds) {
      const inserted = insertDatabaseBlockInContent(nextContent, { databaseId });
      nextContent = inserted.content;
    }

    handle.setContentJson(nextContent);
  }, [getEditorHandle, liveEditingReady, navigation, page, pageEditable]);

  useEffect(() => {
    if (!pageEditable || !page || !meetingsPayload) {
      return;
    }

    const handle = getEditorHandle(page.id);

    if (!handle?.isEditable()) {
      return;
    }

    let content = handle.getContentJson();

    if (
      isEffectivelyEmptyPageContent(content) &&
      !isEffectivelyEmptyPageContent(page.content)
    ) {
      if (!handle.setContentJson(page.content)) {
        return;
      }

      content = handle.getContentJson() ?? page.content;
    }

    const missingMeetingIds = getMissingHostedMeetingIds(
      content,
      meetingsPayload.meetings,
      page.id,
    );

    if (missingMeetingIds.length === 0) {
      return;
    }

    let nextContent = content;

    for (const meetingId of missingMeetingIds) {
      nextContent = insertMeetingBlockInContent(nextContent, meetingId).content;
    }

    handle.setContentJson(nextContent);
  }, [
    getEditorHandle,
    liveEditingReady,
    meetingsPayload,
    page,
    pageEditable,
  ]);

  const embedLinkedPage = useCallback(
    async (pageId: string) => {
      if (!page) {
        return;
      }

      await embedPageItem.mutateAsync({
        hostPageId: page.id,
        itemId: pageId,
        kind: "page",
      });
    },
    [embedPageItem, page],
  );

  const embedLinkedDatabase = useCallback(
    async (databaseId: string) => {
      if (!page) {
        return;
      }

      await embedPageItem.mutateAsync({
        hostPageId: page.id,
        itemId: databaseId,
        kind: "database",
      });
    },
    [embedPageItem, page],
  );

  const createNestedPage = useCallback(async () => {
    if (
      readOnly ||
      !page ||
      page.deletedAt ||
      (accessLevel !== "edit" && accessLevel !== "full")
    ) {
      throw new Error("Page is required");
    }

    return createPage.mutateAsync({
      content: "",
      emoji: "",
      name: "",
      workspaceId: page.workspaceId,
      parentItemId: page.id,
    });
  }, [accessLevel, createPage, readOnly, page]);

  if (isLoading || waitingForCollaboration) {
    if (
      !waitingForCollaboration &&
      (connectivity === "offline" || connectivity === "service-unavailable") &&
      !offlineManifest.items.some(
        (item) => item.kind === "page" && item.id === pageId,
      )
    ) {
      return (
        <section className={`${className ?? ""} flex items-center justify-center px-4 text-sm text-muted-foreground`}>
          Not available offline.
        </section>
      );
    }
    return (
      <section className={cn(className, "animate-in fade-in duration-200")}>
        <PageEditorSkeleton fullWidth={Boolean(userSettings?.pageFullWidth)} />
      </section>
    );
  }

  if (!page) {
    return (
      <section
        className={`${className ?? ""} flex items-center justify-center px-4 text-sm text-muted-foreground`}
      >
        Page not found.
      </section>
    );
  }

  return (
    <section
      className={cn(className, "animate-in fade-in-0 duration-300")}
      ref={paneRef}
    >
      {page.deletedAt ? (
        <TrashedItemBanner
          itemLabel="page"
          onRestore={restoreTrashedPage}
          restoring={restorePage.isPending}
          showRestore={!readOnly}
        />
      ) : null}
      <Editor
        key={page.id}
        afterMetadata={afterMetadata}
        collaboration={
          collaboration.document
            ? {
                document: collaboration.document,
                provider: collaboration.provider ?? undefined,
                status: collaboration.status,
                user: collaboration.user,
                unsyncedChanges: collaboration.unsyncedChanges,
                users: collaboration.users,
              }
            : undefined
        }
        commentController={commentController ?? undefined}
        content={page.content ?? ""}
        cover={cover}
        databaseId={effectiveDatabaseId}
        databaseIds={pageDatabaseIds}
        editorContentRef={editorContentRef}
        editable={pageEditable && liveEditingReady}
        contentEditable={pageEditable && liveEditingReady && !offlineSessionLocked}
        metadataEditable={pageEditable && liveEditingReady && !offlineEditing}
        structuralEditingEnabled={pageEditable && liveEditingReady && !offlineEditing}
        commentsEditable={pageEditable && liveEditingReady && !offlineEditing && enableComments}
        databaseEditable={databaseEditingReady}
        enableComments={enableComments && !offlineEditing}
        hideEditorContent={hideEditorContent}
        getStructuralBlockDeleteAction={getStructuralBlockDeleteAction}
        onEditorReady={(editor) => {
          editorInstanceRef.current = editor;
          lastSavedContentRef.current = editor
            ? serializePageContent(editor.getJSON())
            : null;
          lastPageBlockIdsRef.current = editor
            ? extractPageBlockIds(editor.getJSON())
            : new Set();
        }}
        emoji={emoji}
        iconPosition={iconPosition}
        fullWidth={hideChrome ? true : fullWidth}
        hideMetadata={hideChrome}
        layoutConfig={hideChrome ? undefined : appliedLayout}
        layoutPanelMode={layoutPanelMode}
        onContentChange={updateContent}
        onCoverChange={updateCover}
        onCreatePage={createNestedPage}
        onEmbedDatabase={embedLinkedDatabase}
        onEmbedPage={embedLinkedPage}
        onEmojiChange={updateEmoji}
        onIconPositionChange={updateIconPosition}
        onDeleteStructuralBlock={deleteStructuralBlock}
        onOpenPage={onOpenPage}
        onTitleChange={setName}
        workspaceId={page.workspaceId}
        title={name}
        pageEditPreviewRef={pageEditPreviewRef}
        pageId={page.id}
      />
    </section>
  );
}

function PageEditorSkeleton({ fullWidth }: { fullWidth: boolean }) {
  return (
    <div className="flex min-h-full w-full flex-col">
      <div
        className={cn(
          "w-full px-5 py-6 sm:px-8 md:px-20 md:py-8 lg:px-24",
          fullWidth ? "" : "mx-auto max-w-5xl",
        )}
      >
        <div className="space-y-8">
          <div className="space-y-5">
            <Skeleton className="size-12 rounded-xl" />
            <div className="space-y-3">
              <Skeleton className="h-10 w-2/3 max-w-md" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <div className="space-y-3 pt-2">
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    </div>
  );
}

function serializePageContent(content: unknown) {
  try {
    return JSON.stringify(content);
  } catch {
    return null;
  }
}

function extractPageBlockIds(content: unknown) {
  const pageIds = new Set<string>();
  collectPageBlockIds(content, pageIds);
  return pageIds;
}

function collectPageBlockIds(value: unknown, pageIds: Set<string>) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPageBlockIds(item, pageIds);
    }
    return;
  }

  const record = value as {
    attrs?: { pageId?: unknown };
    content?: unknown;
    type?: unknown;
  };

  if (
    record.type === "pageBlock" &&
    typeof record.attrs?.pageId === "string" &&
    record.attrs.pageId.length > 0
  ) {
    pageIds.add(record.attrs.pageId);
  }

  collectPageBlockIds(record.content, pageIds);
}
