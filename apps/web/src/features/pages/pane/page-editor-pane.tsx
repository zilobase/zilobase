import { resolvePageEditability } from "./page-editability";
import {
  recoverMissingPlacedDatabaseBlocks,
  recoverPageEditorContent,
} from "./page-content-recovery";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Skeleton } from "@/shared/ui/skeleton";
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
  type PageMetadata,
} from "@zilobase/features/pages";
import {
  useDeleteDatabase,
  useRestoreDatabase,
} from "@zilobase/features/databases/react";
import {
  useDeleteMeeting,
  useWorkspaceMeetings,
} from "@zilobase/features/meetings/react";
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
import {
  Editor,
  type PageEditPreviewControls,
} from "@/features/editor";
import type {
  PageLayoutPanelMode,
  StructuralBlockDeleteRequest,
} from "@/features/editor/core/types";
import type { OpenPageOptions } from "../navigation/open-page-options";
import { usePageCollaboration } from "@/features/editor/collaboration/use-page-collaboration";
import { isPageCollaborationReady } from "@/features/editor/collaboration/collaboration-readiness";
import { isHostedDemoRuntime } from "@/features/demo";
import { canEditOnlineDatabase } from "@/features/editor/database-editability";
import {
  useConnectivity,
  useOfflineManifest,
  useOfflineSessionLocked,
} from "@/features/offline/index";
import { createPageCommentController } from "@/features/comments/index";
import { usePageCommentsRegistry } from "@/features/comments/index";
import { useTitleDraft } from "../hooks/use-title-draft";
import { scrollToMeetingBlock } from "@/features/meetings/index";
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
  reviewDiff?: { beforeMarkdown: string; afterMarkdown: string } | null;
  pageId: string;
};

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
  reviewDiff,
  pageId,
}: PageEditorPaneProps) {
  const demoMode = isHostedDemoRuntime();
  const connectivity = useConnectivity();
  const offlineSessionLocked = useOfflineSessionLocked();
  const offlineManifest = useOfflineManifest();
  const { data: page, isLoading } = usePage(pageId);
  const { data: session } = useSession();
  const { data: accessLevel } = usePageAccessLevel(pageId, {
    refetchOnMount: false,
  });
  const pageLocked = isPageLocked(page);
  const { pageEditable, commentsEditable } = resolvePageEditability({
    readOnly, locked: pageLocked, deletedAt: page?.deletedAt, accessLevel,
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
  const restoreDatabase = useRestoreDatabase();
  const deleteMeeting = useDeleteMeeting();
  const updatePage = useUpdatePage();
  const restorePage = useRestorePage();
  const [demoPersistenceReadyPageId, setDemoPersistenceReadyPageId] = useState<
    string | null
  >(demoMode ? null : pageId);
  const contentSaveTimeoutRef = useRef<number | null>(null);
  const lastSavedContentRef = useRef<string | null>(null);
  const lastPageBlockIdsRef = useRef<Set<string>>(new Set());
  const requestedDatabaseEmbedKeysRef = useRef<Set<string>>(new Set());
  const pendingContentRef = useRef<unknown>(null);
  // Database/meeting creation publishes navigation data before the async editor
  // command inserts its structural node. Keep hierarchy recovery from treating
  // that short-lived state as lost content and replacing the live document.
  const pendingStructuralInsertionsRef = useRef(0);
  const [structuralInsertionRevision, setStructuralInsertionRevision] =
    useState(0);
  const editorContentRef = useRef<(() => unknown) | null>(null);
  const editorInstanceRef = useRef<import("@tiptap/core").Editor | null>(null);
  const pageEditPreviewRef = useRef<PageEditPreviewControls | null>(null);
  const paneRef = useRef<HTMLElement | null>(null);
  const { getEditorHandle, registerEditor, unregisterEditor } =
    usePageEditorRegistry();

  const handleStructuralInsertionPendingChange = useCallback(
    (pending: boolean) => {
      pendingStructuralInsertionsRef.current = Math.max(
        0,
        pendingStructuralInsertionsRef.current + (pending ? 1 : -1),
      );
      setStructuralInsertionRevision((current) => current + 1);
    },
    [],
  );

  useEffect(() => {
    if (!demoMode) return;
    // TipTap normalizes seeded JSON during mount. Ignore that initialization
    // write so it cannot cancel the page query that is still settling.
    const timer = window.setTimeout(
      () => setDemoPersistenceReadyPageId(pageId),
      1_000,
    );
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
      if (!page || !pageEditable) {
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
  const [iconPosition, setIconPosition] =
    useState<PageIconPosition>("top");
  const fullWidth = resolvePageFullWidth(page, userSettings?.pageFullWidth);
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

  const collaborationEnabled =
    !demoMode &&
    Boolean(
      pageEditable ||
        (enableComments && session?.user && page && !page.deletedAt),
    );
  const collaboration = usePageCollaboration({
    enabled: collaborationEnabled,
    localOnly: demoMode,
    pageId,
    user: session?.user,
    workspaceId: page?.workspaceId,
  });
  const commentController = useMemo(() => {
    if (!enableComments || !collaboration.provider || !collaboration.document || !session?.user) {
      return null;
    }

    return createPageCommentController({
      canEdit: commentsEditable,
      canModerate: pageEditable && accessLevel === "full",
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
  const liveEditingReady =
    demoMode || !pageEditable || isPageCollaborationReady(collaboration);
  const waitingForCollaboration =
    !demoMode &&
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

    if (!page || !pageEditable) {
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
    const nextIconPosition = nextEmoji ? iconPosition : "top";

    setEmoji(nextEmoji);
    setIconPosition(nextIconPosition);

    if (!page || !pageEditable) {
      return;
    }

    updatePage.mutate({
      id: page.id,
      metadata: {
        ...((page.metadata ?? {}) as PageMetadata),
        emoji: nextEmoji,
        iconPosition: nextIconPosition,
      },
    });
  };

  const updateIconPosition = (nextPosition: PageIconPosition) => {
    setIconPosition(nextPosition);

    if (!page || !pageEditable) {
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
      if (!pageEditable) {
        return;
      }

      const serializedContent = serializePageContent(content);

      if (
        demoMode &&
        demoPersistenceReadyPageId !== pageId
      ) {
        lastSavedContentRef.current = serializedContent;
        return;
      }

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
      clearContentSaveTimeout,
      collaboration.document,
      demoPersistenceReadyPageId,
      demoMode,
      pageEditable,
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
        isSynchronized: () =>
          !collaboration.document ||
          (collaboration.synced && collaboration.unsyncedChanges === 0),
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
    if (!pageEditable || !page || !navigation) {
      return;
    }

    const handle = getEditorHandle(page.id);

    if (!handle?.isEditable()) {
      return;
    }

    recoverMissingPlacedDatabaseBlocks({
      handle,
      localStructuralInsertionPending:
        pendingStructuralInsertionsRef.current > 0,
      pageId: page.id,
      placements: navigation.placements,
      savedContent: page.content,
    });
  }, [
    getEditorHandle,
    liveEditingReady,
    navigation,
    page,
    pageEditable,
    structuralInsertionRevision,
  ]);

  useEffect(() => {
    if (!pageEditable || !page || !meetingsPayload) {
      return;
    }

    if (pendingStructuralInsertionsRef.current > 0) {
      return;
    }

    const handle = getEditorHandle(page.id);

    if (!handle?.isEditable()) {
      return;
    }

    const restored = recoverPageEditorContent(handle, page.content);
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
    liveEditingReady,
    meetingsPayload,
    page,
    pageEditable,
    structuralInsertionRevision,
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
    if (!page || !pageEditable) {
      throw new Error("Page is required");
    }

    return createPage.mutateAsync({
      content: "",
      emoji: "",
      name: "",
      workspaceId: page.workspaceId,
      parentItemId: page.id,
    });
  }, [createPage, page, pageEditable]);

  if (isLoading || waitingForCollaboration) {
    if (
      !waitingForCollaboration &&
      (connectivity === "offline" || connectivity === "service-unavailable") &&
      !offlineManifest.items.some(
        (item) => item.kind === "page" && item.id === pageId,
      )
    ) {
      return (
        <section className={`${className ?? ""} flex items-center justify-center px-4 text-sm text-content-secondary`}>
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
      onDropCapture={pageLocked
        ? (event) => {
            event.preventDefault();
            event.stopPropagation();
            toast.error("This page is locked.");
          }
        : undefined}
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
        contentEditable={pageEditable && liveEditingReady && !offlineSessionLocked}
        metadataEditable={pageEditable && liveEditingReady && !offlineEditing}
        structuralEditingEnabled={pageEditable && liveEditingReady && !offlineEditing}
        commentsEditable={pageEditable && liveEditingReady && !offlineEditing && enableComments}
        databaseEditable={databaseEditingReady && liveEditingReady}
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
        onStructuralInsertionPendingChange={
          handleStructuralInsertionPendingChange
        }
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
