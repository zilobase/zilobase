import { resolvePageEditability } from "./page-editability";
import {
  recoverMissingPlacedDatabaseBlocks,
  recoverPageEditorContent,
} from "./page-content-recovery";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Skeleton } from "@/shared/ui/skeleton";
import { Button } from "@/shared/ui/button";
import { TrashedItemBanner } from "../components/trashed-item-banner";
import { cn } from "@/shared/lib/utils";
import { toast } from "sonner";
import {
  getPageCover,
  getPageEmoji,
  getPageIconPosition,
  isPageLocked,
  resolvePageFullWidth,
  type PageIconPosition,
} from "@zilobase/features/pages";
import { useDeleteDatabase, useRestoreDatabase } from "@zilobase/features/databases/react";
import { useDeleteMeeting, useWorkspaceMeetings } from "@zilobase/features/meetings/react";
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
} from "@zilobase/features/pages/react";
import { extractDatabaseIds } from "@zilobase/page-context";
import { useSession } from "@zilobase/features/auth/react";
import { useUserSettings } from "@zilobase/features/user-settings/react";
import { usePageEditorRegistry } from "@/features/editor/runtime/page-editor-registry";
import { createPageEditorHandle } from "@/features/editor/runtime/page-editor-handle";
import { Editor, type PageEditPreviewControls } from "@/features/editor";
import type {
  PageLayoutPanelMode,
  StructuralBlockDeleteRequest,
} from "@/features/editor/core/types";
import type { OpenPageOptions } from "../navigation/open-page-options";
import { usePageCollaboration } from "@/features/editor/collaboration/use-page-collaboration";
import { setPageConnectionIndicator } from "@/features/editor/collaboration/page-connection-indicator";
import {
  blockCachedPage,
  exportCachedPageState,
  rememberPageDetail,
} from "@/features/editor/collaboration/page-document-cache";
import { ApiError } from "@/platform/network/api";
import { isHostedDemoRuntime } from "@/features/demo";
import { canEditOnlineDatabase } from "@/features/editor/database-editability";
import { createPageCommentController } from "@/features/comments/index";
import { usePageCommentsRegistry } from "@/features/comments/index";
import { useTitleDraft } from "../hooks/use-title-draft";
import { scrollToMeetingBlock } from "@/features/meetings/index";
import { consumePageNavigationStart } from "../navigation/page-navigation-timing";
import {
  getMissingHostedMeetingIds,
  getPlacedDatabaseIds,
  insertMeetingBlockInContent,
} from "../navigation/page-hierarchy-blocks";

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
  showCollaborationPresence?: boolean;
  showConnectionIndicator?: boolean;
  reviewDiff?: { beforeMarkdown: string; afterMarkdown: string } | null;
  pageId: string;
};

const EMPTY_DATABASE_IDS: string[] = [];

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
  showCollaborationPresence = true,
  showConnectionIndicator = false,
  reviewDiff,
  pageId,
}: PageEditorPaneProps) {
  const demoMode = isHostedDemoRuntime();
  const { data: page, isLoading, error: pageQueryError } = usePage(pageId);
  const { data: session } = useSession();
  const { data: accessLevel } = usePageAccessLevel(pageId, {
    refetchOnMount: false,
  });
  const pageLocked = isPageLocked(page);
  const accessDenied =
    pageQueryError instanceof ApiError &&
    (pageQueryError.status === 403 || pageQueryError.status === 404);
  const { pageEditable: permittedPageEditable, commentsEditable } = resolvePageEditability({
    readOnly,
    locked: pageLocked,
    deletedAt: page?.deletedAt,
    accessLevel,
  });
  const pageEditable = permittedPageEditable && !accessDenied;
  const { data: pageDatabaseIdsData } = usePageDatabaseIds(pageId, {
    refetchOnMount: false,
  });
  const pageDatabaseIds = pageDatabaseIdsData ?? EMPTY_DATABASE_IDS;
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
  const restoreDatabase = useRestoreDatabase();
  const deleteMeeting = useDeleteMeeting();
  const updatePage = useUpdatePage();
  const restorePage = useRestorePage();
  const [demoPersistenceReadyPageId, setDemoPersistenceReadyPageId] = useState<string | null>(
    demoMode ? null : pageId,
  );
  const contentSaveTimeoutRef = useRef<number | null>(null);
  const lastSavedContentRef = useRef<string | null>(null);
  const lastPageBlockIdsRef = useRef<Set<string>>(new Set());
  const pendingPageEmbedRemovalsRef = useRef<Set<string>>(new Set());
  const requestedDatabaseEmbedKeysRef = useRef<Set<string>>(new Set());
  const pendingContentRef = useRef<unknown>(null);
  // Database/meeting creation publishes navigation data before the async editor
  // command inserts its structural node. Keep hierarchy recovery from treating
  // that short-lived state as lost content and replacing the live document.
  const pendingStructuralInsertionsRef = useRef(0);
  const [structuralInsertionRevision, setStructuralInsertionRevision] = useState(0);
  const [editorReadyRevision, setEditorReadyRevision] = useState(0);
  const editorContentRef = useRef<(() => unknown) | null>(null);
  const editorInstanceRef = useRef<import("@tiptap/core").Editor | null>(null);
  const pageEditPreviewRef = useRef<PageEditPreviewControls | null>(null);
  const onlineActionsReadyRef = useRef(demoMode);
  const paneRef = useRef<HTMLElement | null>(null);
  const navigationTimingRef = useRef<{
    pageId: string;
    startedAt: number;
    measured: Set<string>;
  } | null>(null);
  if (!navigationTimingRef.current || navigationTimingRef.current.pageId !== pageId) {
    navigationTimingRef.current = {
      pageId,
      startedAt: consumePageNavigationStart(pageId) ?? performance.now(),
      measured: new Set(),
    };
  }
  const { getEditorHandle, registerEditor, unregisterEditor } = usePageEditorRegistry();

  const handleStructuralInsertionPendingChange = useCallback((pending: boolean) => {
    pendingStructuralInsertionsRef.current = Math.max(
      0,
      pendingStructuralInsertionsRef.current + (pending ? 1 : -1),
    );
    setStructuralInsertionRevision((current) => current + 1);
  }, []);

  const handleEditorReady = useCallback((editor: import("@tiptap/core").Editor | null) => {
    const editorChanged = Boolean(editor && editorInstanceRef.current !== editor);

    editorInstanceRef.current = editor;
    lastSavedContentRef.current = editor ? serializePageContent(editor.getJSON()) : null;
    lastPageBlockIdsRef.current = editor ? extractPageBlockIds(editor.getJSON()) : new Set();

    if (editorChanged) {
      setEditorReadyRevision((current) => current + 1);
    }
  }, []);

  useEffect(() => {
    if (!demoMode) return;
    // TipTap normalizes seeded JSON during mount. Ignore that initialization
    // write so it cannot cancel the page query that is still settling.
    const timer = window.setTimeout(() => setDemoPersistenceReadyPageId(pageId), 1_000);
    return () => window.clearTimeout(timer);
  }, [demoMode, pageId]);

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
      if (!page || !pageEditable || !onlineActionsReadyRef.current) {
        throw new Error("Page is unavailable.");
      }

      if (request.type === "meeting") {
        await deleteMeeting.mutateAsync(request.id);
        return;
      }

      if (getStructuralBlockDeleteAction(request) === "remove-link") {
        const input = {
          hostPageId: page.id,
          itemId: request.id,
          kind: "database" as const,
        };

        await removePageEmbed.mutateAsync(input);
        return {
          redo: async () => {
            await removePageEmbed.mutateAsync(input);
          },
          undo: async () => {
            await embedPageItem.mutateAsync(input);
          },
        };
      }

      await deleteDatabase.mutateAsync(request.id);
      return {
        redo: async () => {
          await deleteDatabase.mutateAsync(request.id);
        },
        undo: async () => {
          await restoreDatabase.mutateAsync(request.id);
        },
      };
    },
    [
      deleteDatabase,
      deleteMeeting,
      embedPageItem,
      getStructuralBlockDeleteAction,
      page,
      pageEditable,
      removePageEmbed,
      restoreDatabase,
    ],
  );
  const commentsRegistry = usePageCommentsRegistry();
  const [cover, setCover] = useState("");
  const [emoji, setEmoji] = useState("");
  const [iconPosition, setIconPosition] = useState<PageIconPosition>("top");
  const fullWidth = resolvePageFullWidth(page, userSettings?.pageFullWidth);
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
  const pageIconPosition = page ? getPageIconPosition(page) : "top";

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

  const collaborationEnabled =
    !demoMode &&
    !accessDenied &&
    Boolean(pageEditable || (enableComments && session?.user && page && !page.deletedAt));
  const collaboration = usePageCollaboration({
    enabled: collaborationEnabled,
    localOnly: demoMode,
    pageId,
    user: session?.user,
  });
  useEffect(() => {
    if (!showConnectionIndicator) return;
    return () => setPageConnectionIndicator(pageId, null);
  }, [pageId, showConnectionIndicator]);
  useEffect(() => {
    if (!showConnectionIndicator) return;
    setPageConnectionIndicator(
      pageId,
      collaborationEnabled && collaboration.online && !collaboration.error
        ? collaboration.synced
          ? "connected"
          : "connecting"
        : null,
    );
  }, [
    collaboration.online,
    collaboration.synced,
    collaboration.error,
    collaborationEnabled,
    pageId,
    showConnectionIndicator,
  ]);
  const onlineActionsReady = demoMode || collaboration.online;
  onlineActionsReadyRef.current = onlineActionsReady;
  const { setTitle: setName, title: name } = useTitleDraft({
    enabled: pageEditable && onlineActionsReady,
    onSave: async (nextName) => {
      if (!page || !onlineActionsReadyRef.current) return;
      await updatePage.mutateAsync({ id: page.id, name: nextName });
      onTitleChange?.(nextName);
    },
    sourceId: page?.id ?? null,
    sourceTitle: page?.name ?? "",
  });
  useEffect(() => {
    if (!pageEditable || !page || !navigation || (!demoMode && !collaboration.synced)) return;
    const content = demoMode ? page.content : editorInstanceRef.current?.getJSON();
    if (!content) return;
    const placedDatabaseIds = new Set(getPlacedDatabaseIds(navigation.placements, page.id));
    for (const databaseId of extractDatabaseIds(content)) {
      const requestKey = `${page.id}:${databaseId}`;
      if (
        placedDatabaseIds.has(databaseId) ||
        requestedDatabaseEmbedKeysRef.current.has(requestKey)
      ) {
        continue;
      }
      requestedDatabaseEmbedKeysRef.current.add(requestKey);
      void embedPageItem
        .mutateAsync({ hostPageId: page.id, itemId: databaseId, kind: "database" })
        .catch(() => requestedDatabaseEmbedKeysRef.current.delete(requestKey));
    }
  }, [
    collaboration.synced,
    demoMode,
    editorReadyRevision,
    embedPageItem,
    navigation,
    page,
    pageEditable,
  ]);
  useEffect(() => {
    if (!collaboration.entry || !page || accessDenied || collaboration.status === "blocked") return;
    void rememberPageDetail(
      collaboration.entry,
      { page, accessLevel, databaseIds: pageDatabaseIds, viewerType: "member" },
      page.workspaceId,
    );
  }, [
    accessDenied,
    accessLevel,
    collaboration.entry,
    collaboration.status,
    collaboration.synced,
    page,
    pageDatabaseIds,
  ]);
  useEffect(() => {
    if (!session?.user || (!accessDenied && collaboration.status !== "blocked")) return;
    void blockCachedPage(session.user.id, pageId);
  }, [accessDenied, collaboration.status, pageId, session?.user]);
  const commentController = useMemo(() => {
    if (!enableComments || !collaboration.document || !session?.user) {
      return null;
    }

    return createPageCommentController({
      canEdit: commentsEditable && collaboration.canEdit,
      canModerate: pageEditable && accessLevel === "full" && collaboration.canEdit,
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
    collaboration.document,
    collaboration.canEdit,
    commentsEditable,
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
  const liveEditingReady = demoMode || !pageEditable || collaboration.canEdit;
  useEffect(() => {
    const timing = navigationTimingRef.current;
    if (!timing || timing.pageId !== pageId) return;
    const milestones = [
      ["visible", Boolean(page && !isLoading)],
      ["editable", Boolean(page && pageEditable && liveEditingReady)],
      ["live", Boolean(page && collaboration.synced)],
    ] as const;
    const pending = milestones.filter(([name, ready]) => ready && !timing.measured.has(name));
    if (!pending.length) return;
    const frame = window.requestAnimationFrame(() => {
      for (const [name] of pending) {
        if (timing.measured.has(name)) continue;
        timing.measured.add(name);
        performance.clearMeasures(`zilobase.page.${name}`);
        performance.measure(`zilobase.page.${name}`, {
          start: timing.startedAt,
          end: performance.now(),
        });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [collaboration.synced, isLoading, liveEditingReady, page, pageEditable, pageId]);

  useEffect(() => {
    if (!focusMeetingId || isLoading) return;

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
  }, [focusMeetingId, isLoading, page?.id]);
  const databaseEditingReady = canEditOnlineDatabase({
    pageEditable: pageEditable && onlineActionsReady,
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
        toast.error(error instanceof Error ? error.message : "Could not restore page.");
      },
    });
  };

  const updateCover = (nextCover: string) => {
    setCover(nextCover);

    if (!page || !pageEditable || !onlineActionsReady) {
      return;
    }

    updatePage.mutate({
      id: page.id,
      metadata: {
        cover: nextCover,
      },
    });
  };

  const updateEmoji = (nextEmoji: string) => {
    const nextIconPosition = nextEmoji ? iconPosition : "top";

    setEmoji(nextEmoji);
    setIconPosition(nextIconPosition);

    if (!page || !pageEditable || !onlineActionsReady) {
      return;
    }

    updatePage.mutate({
      id: page.id,
      metadata: {
        emoji: nextEmoji,
        iconPosition: nextIconPosition,
      },
    });
  };

  const updateIconPosition = (nextPosition: PageIconPosition) => {
    setIconPosition(nextPosition);

    if (!page || !pageEditable || !onlineActionsReady) {
      return;
    }

    updatePage.mutate({
      id: page.id,
      metadata: {
        iconPosition: nextPosition,
      },
    });
  };

  const updateContent = useCallback(
    (content: unknown) => {
      if (!page) {
        return;
      }
      if (!pageEditable || (!demoMode && !collaboration.canEdit)) {
        return;
      }

      const serializedContent = serializePageContent(content);

      if (demoMode && demoPersistenceReadyPageId !== pageId) {
        lastSavedContentRef.current = serializedContent;
        return;
      }

      if (serializedContent && serializedContent === lastSavedContentRef.current) {
        return;
      }

      if (serializedContent) {
        lastSavedContentRef.current = serializedContent;
      }

      const nextPageBlockIds = extractPageBlockIds(content);
      for (const retainedId of nextPageBlockIds) {
        pendingPageEmbedRemovalsRef.current.delete(retainedId);
      }
      const removedPageBlockIds = [...lastPageBlockIdsRef.current].filter(
        (pageId) => !nextPageBlockIds.has(pageId),
      );

      lastPageBlockIdsRef.current = nextPageBlockIds;
      for (const pageId of removedPageBlockIds) {
        if (collaboration.document && !collaboration.synced) {
          pendingPageEmbedRemovalsRef.current.add(pageId);
          continue;
        }
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
      clearContentSaveTimeout,
      collaboration.document,
      collaboration.canEdit,
      collaboration.synced,
      demoPersistenceReadyPageId,
      demoMode,
      pageEditable,
      removePageEmbed,
      updatePage,
      page,
    ],
  );

  useEffect(() => {
    if (!page || !collaboration.synced || pendingPageEmbedRemovalsRef.current.size === 0) return;
    for (const itemId of pendingPageEmbedRemovalsRef.current) {
      if (!lastPageBlockIdsRef.current.has(itemId)) {
        removePageEmbed.mutate({ hostPageId: page.id, itemId, kind: "page" });
      }
    }
    pendingPageEmbedRemovalsRef.current.clear();
  }, [collaboration.synced, page, removePageEmbed]);

  useEffect(() => {
    registerEditor(
      pageId,
      createPageEditorHandle({
        editable: pageEditable && liveEditingReady,
        getEditor: () => editorInstanceRef.current,
        isSynchronized: () =>
          !collaboration.document || (collaboration.synced && collaboration.unsyncedChanges === 0),
        onContentChange: updateContent,
        pageEditPreviewRef,
      }),
    );

    return () => {
      unregisterEditor(pageId);
    };
  }, [
    liveEditingReady,
    collaboration.document,
    collaboration.synced,
    collaboration.unsyncedChanges,
    pageEditable,
    registerEditor,
    unregisterEditor,
    updateContent,
    pageId,
  ]);

  useEffect(() => {
    if (!pageEditable || !page || !navigation || (!demoMode && !collaboration.synced)) {
      return;
    }

    const handle = getEditorHandle(page.id);

    if (!handle?.isEditable()) {
      return;
    }

    recoverMissingPlacedDatabaseBlocks({
      handle,
      localStructuralInsertionPending: pendingStructuralInsertionsRef.current > 0,
      pageId: page.id,
      placements: navigation.placements,
      savedContent: demoMode ? page.content : null,
    });
  }, [
    getEditorHandle,
    editorReadyRevision,
    collaboration.synced,
    demoMode,
    navigation,
    page,
    pageEditable,
    structuralInsertionRevision,
  ]);

  useEffect(() => {
    if (!pageEditable || !page || !meetingsPayload || (!demoMode && !collaboration.synced)) {
      return;
    }

    if (pendingStructuralInsertionsRef.current > 0) {
      return;
    }

    const handle = getEditorHandle(page.id);

    if (!handle?.isEditable()) {
      return;
    }

    const restored = recoverPageEditorContent(handle, demoMode ? page.content : null);
    if (!restored) return;
    const { content } = restored;

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
    editorReadyRevision,
    collaboration.synced,
    demoMode,
    meetingsPayload,
    page,
    pageEditable,
    structuralInsertionRevision,
  ]);

  const embedLinkedPage = useCallback(
    async (pageId: string) => {
      if (!page || !onlineActionsReady) {
        return;
      }

      await embedPageItem.mutateAsync({
        hostPageId: page.id,
        itemId: pageId,
        kind: "page",
      });
    },
    [embedPageItem, onlineActionsReady, page],
  );

  const embedLinkedDatabase = useCallback(
    async (databaseId: string) => {
      if (!page || !onlineActionsReady) {
        return;
      }

      await embedPageItem.mutateAsync({
        hostPageId: page.id,
        itemId: databaseId,
        kind: "database",
      });
    },
    [embedPageItem, onlineActionsReady, page],
  );

  const createNestedPage = useCallback(async () => {
    if (!page || !pageEditable || !onlineActionsReady) {
      throw new Error("Page is required");
    }

    return createPage.mutateAsync({
      content: "",
      emoji: "",
      name: "",
      workspaceId: page.workspaceId,
      parentItemId: page.id,
    });
  }, [createPage, onlineActionsReady, page, pageEditable]);

  if (isLoading) {
    return (
      <section className={cn(className, "animate-in fade-in duration-200")}>
        <PageEditorSkeleton fullWidth={Boolean(userSettings?.pageFullWidth)} />
      </section>
    );
  }

  const recoveryUserId = session?.user?.id;
  if (accessDenied || collaboration.status === "blocked") {
    return (
      <section className={cn(className, "flex flex-col items-center gap-3 px-6 py-16 text-center")}>
        <p className="text-sm text-content-secondary">This page is no longer available.</p>
        {recoveryUserId ? (
          <Button
            variant="outline"
            onClick={() => {
              void exportCachedPageState(recoveryUserId, pageId).then((state) => {
                if (!state) return;
                const blob = new Blob([Uint8Array.from(state)], {
                  type: "application/octet-stream",
                });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `page-${pageId}-recovery.yjs`;
                link.click();
                window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
              });
            }}
          >
            Download local recovery copy
          </Button>
        ) : null}
      </section>
    );
  }

  if (!page) {
    return (
      <section
        className={`${className ?? ""} flex items-center justify-center px-4 text-sm text-content-secondary`}
      >
        Page not found.
      </section>
    );
  }

  return (
    <section
      className={cn(className, "animate-in fade-in-0 duration-300")}
      onDragOverCapture={pageLocked ? (event) => event.preventDefault() : undefined}
      onDropCapture={
        pageLocked
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              toast.error("This page is locked.");
            }
          : undefined
      }
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
      {collaborationEnabled &&
      !collaboration.synced &&
      (!collaboration.online || Boolean(collaboration.error)) ? (
        <p aria-live="polite" className="px-6 py-2 text-xs text-content-secondary">
          {!collaboration.online
            ? "Offline. This cached page is read only."
            : "Collaboration is unavailable. This page is read only until it reconnects."}
        </p>
      ) : null}
      <Editor
        key={page.id}
        afterMetadata={afterMetadata}
        collaboration={
          collaboration.document
            ? {
                document: collaboration.document,
                awareness: collaboration.awareness ?? undefined,
                provider: collaboration.provider ?? undefined,
                status: collaboration.status,
                user: collaboration.user,
                unsyncedChanges: collaboration.unsyncedChanges,
                users: showCollaborationPresence ? collaboration.users : [],
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
        contentEditable={pageEditable && liveEditingReady}
        metadataEditable={pageEditable && onlineActionsReady}
        structuralEditingEnabled={pageEditable && liveEditingReady}
        commentsEditable={commentsEditable && collaboration.canEdit && enableComments}
        databaseEditable={databaseEditingReady}
        enableComments={enableComments}
        hideEditorContent={hideEditorContent}
        getStructuralBlockDeleteAction={getStructuralBlockDeleteAction}
        onEditorReady={handleEditorReady}
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
        onStructuralInsertionPendingChange={handleStructuralInsertionPendingChange}
        onTitleChange={setName}
        workspaceId={page.workspaceId}
        title={name}
        pageEditPreviewRef={pageEditPreviewRef}
        reviewDiff={reviewDiff}
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
          fullWidth ? "" : "mx-auto max-w-[900px]",
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
