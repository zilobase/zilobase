import { isHostedDemoRuntime } from "@/app/demo/runtime";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ApiError } from "@/platform/network/api";
import { usePageCollaboration } from "@/sections/pages/editor/collaboration/hooks/use-page-collaboration";
import {
  blockCachedPage,
  exportCachedPageState,
  flushCachedPage,
} from "@/sections/pages/editor/collaboration/lib/page-document-cache";
import { setPageConnectionIndicator } from "@/sections/pages/editor/collaboration/lib/page-document-session";
import { usePageCommentsRegistry } from "@/sections/pages/editor/comments/components/comments-context";
import { createPageCommentController } from "@/sections/pages/editor/comments/lib/yjs-comments";
import { Editor } from "@/sections/pages/editor/editor";
import {
  scrollToBlock,
  scrollToMeetingBlock,
} from "@/sections/pages/editor/extensions/meeting/lib/meeting-block-navigation";
import type {
  PageLayoutPanelMode,
  StructuralBlockDeleteRequest,
} from "@/sections/pages/editor/lib/editor-types";
import { changedPageReferences } from "@/sections/pages/editor/operations/lib/changed-page-references";
import { usePageEditorRegistry } from "@/sections/pages/editor/runtime/components/page-editor-registry";
import { createPageEditorHandle } from "@/sections/pages/editor/runtime/lib/page-editor-handle";
import { useSession } from "@zilobase/features/auth/react";
import {
  useDeleteDatabase,
  useRestoreDatabase,
  useUpdateDatabase,
} from "@zilobase/features/databases/react";
import { useDeleteMeeting, useWorkspaceMeetings } from "@zilobase/features/meetings/react";
import {
  getMissingHostedMeetingIds,
  getPageCover,
  getPageEmoji,
  getPageIconPosition,
  getPlacedDatabaseIds,
  insertMeetingBlockInContent,
  isPageLocked,
  resolvePageEditability,
  resolvePageFullWidth,
  type PageIconPosition,
} from "@zilobase/features/pages";
import {
  useCreatePage,
  useEmbedPageItem,
  usePage,
  usePageAccessLevel,
  usePageDatabaseIds,
  usePageNavigation,
  useRemovePageEmbed,
  useResolvedPageLayout,
  useRestorePage,
  useUpdatePage,
} from "@zilobase/features/pages/react";
import { useUserSettings } from "@zilobase/features/user-settings/react";
import { extractDatabaseIds } from "@zilobase/page-context";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { TrashedItemBanner } from "../components/trashed-item-banner";
import type { OpenPageOptions } from "../navigation/hooks/page-navigation";
import { consumePageNavigationStart } from "../navigation/lib/page-navigation-timing";
import { usePageTitleDraft } from "./hooks/use-page-title-draft";
import {
  recoverMissingPlacedDatabaseBlocks,
  recoverPageEditorContent,
} from "./operations/lib/page-content-recovery";

type PageEditorPaneProps = {
  afterMetadata?: ReactNode;
  className?: string;
  databaseId?: string | null;
  enableComments?: boolean;
  focusMeetingId?: string;
  /** A block to reveal, from an AI citation. */
  focusBlockId?: string;
  hideChrome?: boolean;
  hideEditorContent?: boolean;
  layoutPanelMode?: PageLayoutPanelMode;
  onOpenPage: (pageId: string, options?: OpenPageOptions) => void;
  onTitleChange?: (title: string) => void;
  readOnly?: boolean;
  showCollaborationPresence?: boolean;
  showConnectionIndicator?: boolean;
  pageId: string;
};

const EMPTY_DATABASE_IDS: string[] = [];

export function PageContent({
  afterMetadata,
  className,
  databaseId,
  enableComments = true,
  focusMeetingId,
  focusBlockId,
  hideChrome = false,
  hideEditorContent = false,
  layoutPanelMode = "auto",
  onOpenPage,
  onTitleChange,
  readOnly = false,
  showCollaborationPresence = true,
  showConnectionIndicator = false,
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
  const updateDatabase = useUpdateDatabase();
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
  const onlineActionsReadyRef = useRef(demoMode);
  const paneId = useId();
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
  const { getEditorHandle, registerEditor } = usePageEditorRegistry();

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
        content:
          typeof pendingContentRef.current === "function"
            ? pendingContentRef.current()
            : pendingContentRef.current,
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
        ? collaboration.status === "connected" && collaboration.synced
          ? "connected"
          : "connecting"
        : null,
    );
  }, [
    collaboration.online,
    collaboration.synced,
    collaboration.status,
    collaboration.error,
    collaborationEnabled,
    pageId,
    showConnectionIndicator,
  ]);
  const onlineActionsReady = demoMode || collaboration.online;
  onlineActionsReadyRef.current = onlineActionsReady;
  const { setTitle: setName, title: name } = usePageTitleDraft({
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
    if (!session?.user || (!accessDenied && collaboration.status !== "blocked")) return;
    void blockCachedPage(session.user.id, pageId);
  }, [accessDenied, collaboration.status, pageId, session?.user]);
  const commentUser = session?.user;
  const commentOptions = useMemo(() => {
    if (!enableComments || !collaboration.document || !commentUser?.id) {
      return null;
    }

    return {
      canEdit: commentsEditable,
      canModerate: pageEditable && accessLevel === "full",
      connectionReady: false,
      document: collaboration.document,
      user: {
        email: commentUser.email ?? null,
        id: commentUser.id,
        image: commentUser.image ?? null,
        name: commentUser.name ?? null,
      },
    };
  }, [
    accessLevel,
    collaboration.document,
    commentsEditable,
    enableComments,
    pageEditable,
    commentUser?.id,
    commentUser?.email,
    commentUser?.image,
    commentUser?.name,
  ]);

  const [commentState, setCommentState] = useState<{
    options: typeof commentOptions;
    controller: ReturnType<typeof createPageCommentController>;
  } | null>(null);
  const commentController =
    commentState?.options === commentOptions ? (commentState?.controller ?? null) : null;
  useEffect(() => {
    if (!commentOptions) return;
    const controller = createPageCommentController(commentOptions);
    setCommentState({ options: commentOptions, controller });
    const unregister = commentsRegistry.register(pageId, controller);
    return () => {
      unregister();
      controller.destroy();
    };
  }, [commentOptions, commentsRegistry, pageId]);
  useEffect(() => {
    commentController?.setConnectionReady(collaboration.canEdit);
  }, [commentController, collaboration.canEdit]);
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
    if ((!focusMeetingId && !focusBlockId) || isLoading) return;

    const root = paneRef.current;
    if (!root) return;

    const revealMeeting = () =>
      focusMeetingId
        ? scrollToMeetingBlock(root, focusMeetingId)
        : scrollToBlock(root, focusBlockId!);

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
  }, [focusBlockId, focusMeetingId, isLoading, page?.id]);
  const databaseEditingReady = pageEditable && onlineActionsReady;

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
    (content: unknown | (() => unknown), transaction?: import("@tiptap/pm/state").Transaction) => {
      if (!page) {
        return;
      }
      if (!pageEditable || (!demoMode && !collaboration.canEdit)) {
        return;
      }

      if (collaboration.document) {
        if (transaction) {
          const changes = changedPageReferences(transaction);
          for (const itemId of changes.added) {
            lastPageBlockIdsRef.current.add(itemId);
            pendingPageEmbedRemovalsRef.current.delete(itemId);
          }
          for (const itemId of changes.removed) {
            lastPageBlockIdsRef.current.delete(itemId);
            if (!collaboration.synced) pendingPageEmbedRemovalsRef.current.add(itemId);
            else removePageEmbed.mutate({ hostPageId: page.id, itemId, kind: "page" });
          }
          // Typing persists through Yjs; no JSON serialization or HTTP body write.
        }
        return;
      }
      if (demoMode && demoPersistenceReadyPageId !== pageId) return;
      clearContentSaveTimeout();
      const read = typeof content === "function" ? (content as () => unknown) : () => content;
      pendingContentRef.current = read;
      contentSaveTimeoutRef.current = window.setTimeout(() => {
        const nextContent = read();
        const serialized = serializePageContent(nextContent);
        if (serialized && serialized !== lastSavedContentRef.current) {
          lastSavedContentRef.current = serialized;
          updatePage.mutate({ id: page.id, content: nextContent });
        }
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
    return registerEditor(
      pageId,
      createPageEditorHandle({
        editable: pageEditable && liveEditingReady,
        getEditor: () => editorInstanceRef.current,
        getError: () =>
          collaboration.entry?.persistenceError
            ? "storage"
            : collaboration.error
              ? "connection"
              : null,
        isServerConfirmed: () =>
          !collaborationEnabled
            ? Boolean(page && !pageQueryError)
            : Boolean(
                collaboration.entry &&
                collaboration.synced &&
                collaboration.unsyncedChanges === 0 &&
                !collaboration.entry.locallyChanged,
              ),
        flushLocal: async () => {
          if (session?.user) await flushCachedPage(session.user.id, pageId);
        },
        isSynchronized: () =>
          !collaboration.document || (collaboration.synced && collaboration.unsyncedChanges === 0),
        onContentChange: updateContent,
      }),
    );
  }, [
    liveEditingReady,
    collaborationEnabled,
    page,
    pageQueryError,
    session?.user?.id,
    collaboration.document,
    collaboration.error,
    collaboration.entry,
    collaboration.synced,
    collaboration.unsyncedChanges,
    pageEditable,
    registerEditor,
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

  const linkResource = useCallback(
    async (itemId: string, kind: "page" | "database") => {
      if (!page || !pageEditable || !onlineActionsReady)
        throw new Error("Page embedding is unavailable.");
      const input = { hostPageId: page.id, itemId, kind };
      let result = await embedPageItem.mutateAsync(input);
      // An existing relationship belongs to its original creator, not this operation.
      if (!result.placementId) return;
      return {
        undo: async () => {
          if (result.placementId)
            await removePageEmbed.mutateAsync({ ...input, placementId: result.placementId });
        },
        redo: async () => {
          result = await embedPageItem.mutateAsync(input);
        },
      };
    },
    [page, pageEditable, onlineActionsReady, embedPageItem, removePageEmbed],
  );
  const embedLinkedPage = useCallback((id: string) => linkResource(id, "page"), [linkResource]);
  const embedLinkedDatabase = useCallback(
    (id: string) => linkResource(id, "database"),
    [linkResource],
  );

  const moveDatabase = useCallback(
    async (databaseId: string, sourcePageId: string) => {
      if (!page || !pageEditable || !onlineActionsReady)
        throw new Error("Database movement is unavailable.");
      const previous = navigation?.databases.find((item) => item.id === databaseId)?.pageId;
      if (previous !== sourcePageId)
        throw new Error(
          "Only the database's primary block can be moved. Create a linked view instead.",
        );
      await updateDatabase.mutateAsync({ databaseId, pageId: page.id, expectedPageId: previous });
      return {
        undo: async () => {
          await updateDatabase.mutateAsync({
            databaseId,
            pageId: previous,
            expectedPageId: page.id,
          });
        },
        redo: async () => {
          await updateDatabase.mutateAsync({
            databaseId,
            pageId: page.id,
            expectedPageId: previous,
          });
        },
      };
    },
    [page, pageEditable, onlineActionsReady, navigation, updateDatabase],
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
      data-editor-pane-id={paneId}
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
        session={{
          pageId: page.id,
          workspaceId: page.workspaceId,
          content: page.content ?? "",
          databaseId: effectiveDatabaseId,
          databaseIds: pageDatabaseIds,
          collaboration: collaboration.document
            ? {
                document: collaboration.document,
                awareness: collaboration.awareness ?? undefined,
                provider: collaboration.provider ?? undefined,
                status: collaboration.status,
                user: collaboration.user,
                unsyncedChanges: collaboration.unsyncedChanges,
                users: showCollaborationPresence ? collaboration.users : [],
              }
            : undefined,
        }}
        capabilities={{
          content: pageEditable && liveEditingReady,
          metadata: pageEditable && onlineActionsReady,
          structural: pageEditable && liveEditingReady,
          comments: commentsEditable && collaboration.canEdit && enableComments,
          database: databaseEditingReady,
        }}
        presentation={{
          afterMetadata,
          commentController: commentController ?? undefined,
          cover,
          emoji,
          iconPosition,
          fullWidth: hideChrome ? true : fullWidth,
          hideMetadata: hideChrome,
          hideEditorContent,
          enableComments,
          layoutConfig: hideChrome ? undefined : appliedLayout,
          layoutPanelMode,
          title: name,
        }}
        actions={{
          onContentChange: updateContent,
          onCoverChange: updateCover,
          onCreatePage: createNestedPage,
          onMoveDatabase: moveDatabase,
          onEmbedDatabase: embedLinkedDatabase,
          onEmbedPage: embedLinkedPage,
          onEmojiChange: updateEmoji,
          onIconPositionChange: updateIconPosition,
          onDeleteStructuralBlock: deleteStructuralBlock,
          getStructuralBlockDeleteAction,
          onOpenPage,
          onStructuralInsertionPendingChange: handleStructuralInsertionPendingChange,
          onTitleChange: setName,
        }}
        view={{ editorContentRef, onEditorReady: handleEditorReady, paneId }}
      />
    </section>
  );
}

function PageEditorSkeleton({ fullWidth }: { fullWidth: boolean }) {
  return (
    <div
      className="page-editor flex min-h-full w-full flex-col"
      data-page-width={fullWidth ? "full" : "narrow"}
    >
      <div className="page-content-column py-6 md:py-8">
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
