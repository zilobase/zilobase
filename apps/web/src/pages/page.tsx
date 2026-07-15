import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowRight, Maximize2 } from "lucide-react";

import { AppLayout } from "@/components/app-layout";
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
  resolvePageFullWidth,
  type PageMetadata,
} from "@notelab/features/pages";
import {
  useUpdatePage,
  useRestorePage,
  useCreatePage,
  useEmbedPageItem,
  useRemovePageEmbed,
  usePage,
  usePageAccessLevel,
  usePageDatabaseIds,
  useResolvedPageLayout,
} from "@notelab/features/pages";
import { EmbeddedPageDialog } from "@/components/embedded-page-dialog";
import { useOpenEmbeddedPage } from "@/hooks/use-open-embedded-page";
import { useSession } from "@notelab/features/auth";
import { useUserSettings } from "@notelab/features/user-settings";
import { usePageEditorRegistry } from "@/contexts/page-editor-registry";
import { createPageEditorHandle } from "@/hooks/use-page-edit-applier";
import { Editor, type PageEditPreviewControls } from "@/packages/editor";
import type {
  OpenPageOptions,
  PageLayoutPanelMode,
} from "@/packages/editor/types";
import { usePageCollaboration } from "@/packages/editor/use-page-collaboration";
import { createPageCommentController } from "@/comments/yjs-comments";
import { usePageCommentsRegistry } from "@/contexts/page-comments-registry";

type PageEditorPaneProps = {
  className?: string;
  databaseId?: string | null;
  enableComments?: boolean;
  layoutPanelMode?: PageLayoutPanelMode;
  onOpenPage: (pageId: string, options?: OpenPageOptions) => void;
  readOnly?: boolean;
  pageId: string;
};

export default function Page() {
  const { data: session } = useSession();

  if (!session?.user) {
    return <PublicPage />;
  }

  return (
    <AppLayout>
      <AuthenticatedPage />
    </AppLayout>
  );
}

function AuthenticatedPage() {
  const { pageId } = useParams({ from: "/p/$pageId" });
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
          <PageEditorPane key={pageId} onOpenPage={openPage} pageId={pageId} />
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
  className,
  databaseId,
  enableComments = true,
  layoutPanelMode = "auto",
  onOpenPage,
  readOnly = false,
  pageId,
}: PageEditorPaneProps) {
  const { data: page, isLoading } = usePage(pageId);
  const { data: session } = useSession();
  const { data: accessLevel } = usePageAccessLevel(pageId, {
    refetchOnMount: false,
  });
  const { data: pageDatabaseIds = [] } = usePageDatabaseIds(pageId, {
    refetchOnMount: false,
  });
  const effectiveDatabaseId = databaseId ?? pageDatabaseIds[0] ?? null;
  const { data: userSettings } = useUserSettings();
  const { data: resolvedLayout } = useResolvedPageLayout({
    pageId,
    databaseId: effectiveDatabaseId,
  });
  const appliedLayout =
    resolvedLayout && Object.keys(resolvedLayout.sources).length > 0
      ? resolvedLayout.config
      : undefined;
  const createPage = useCreatePage();
  const embedPageItem = useEmbedPageItem();
  const removePageEmbed = useRemovePageEmbed();
  const updatePage = useUpdatePage();
  const restorePage = useRestorePage();
  const contentSaveTimeoutRef = useRef<number | null>(null);
  const lastSavedContentRef = useRef<string | null>(null);
  const lastPageBlockIdsRef = useRef<Set<string>>(new Set());
  const pendingContentRef = useRef<unknown>(null);
  const editorContentRef = useRef<(() => unknown) | null>(null);
  const editorInstanceRef = useRef<import("@tiptap/core").Editor | null>(null);
  const pageEditPreviewRef = useRef<PageEditPreviewControls | null>(null);
  const { registerEditor, unregisterEditor } = usePageEditorRegistry();
  const commentsRegistry = usePageCommentsRegistry();
  const [name, setName] = useState("");
  const [cover, setCover] = useState("");
  const [emoji, setEmoji] = useState("");
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

  useEffect(() => {
    if (!page) {
      return;
    }

    setName(page.name);
    setCover(pageCover);
    setEmoji(pageEmoji);
  }, [page, page?.name, page?.updatedAt, pageCover, pageEmoji]);

  useEffect(() => {
    return flushContentSaveTimeout;
  }, [flushContentSaveTimeout, pageId]);

  const pageEditable =
    !readOnly &&
    !page?.deletedAt &&
    (accessLevel === "edit" || accessLevel === "full");
  const collaboration = usePageCollaboration({
    enabled: Boolean(
      pageEditable ||
        (enableComments && session?.user && page && !page.deletedAt),
    ),
    pageId,
    user: session?.user,
  });
  const commentController = useMemo(() => {
    if (!enableComments || !collaboration.provider || !session?.user) {
      return null;
    }

    return createPageCommentController({
      canEdit: pageEditable,
      canModerate: accessLevel === "full",
      document: collaboration.provider.document,
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
    !pageEditable || Boolean(collaboration.provider && !collaboration.error);

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

  useEffect(() => {
    if (
      readOnly ||
      !page ||
      page.deletedAt ||
      (accessLevel !== "edit" && accessLevel !== "full") ||
      name.trim() === page.name
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      updatePage.mutate({ id: page.id, name: name.trim() });
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [accessLevel, name, readOnly, updatePage, page]);

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

      if (collaboration.provider) {
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
      collaboration.provider,
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

  if (isLoading) {
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
    <section className={cn(className, "animate-in fade-in-0 duration-300")}>
      {page.deletedAt ? (
        <TrashedItemBanner
          itemLabel="page"
          onRestore={restoreTrashedPage}
          restoring={restorePage.isPending}
          showRestore={!readOnly}
        />
      ) : null}
      <Editor
        key={`${page.id}:${collaboration.provider ? "live" : "preview"}`}
        collaboration={
          collaboration.provider && collaboration.user
            ? {
                provider: collaboration.provider,
                status: collaboration.status,
                user: collaboration.user,
                users: collaboration.users,
              }
            : undefined
        }
        commentController={commentController ?? undefined}
        content={page.content ?? ""}
        cover={cover}
        databaseId={effectiveDatabaseId}
        editorContentRef={editorContentRef}
        editable={pageEditable && liveEditingReady}
        enableComments={enableComments}
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
        fullWidth={fullWidth}
        layoutConfig={appliedLayout}
        layoutPanelMode={layoutPanelMode}
        onContentChange={updateContent}
        onCoverChange={updateCover}
        onCreatePage={createNestedPage}
        onEmbedPage={embedLinkedPage}
        onEmojiChange={updateEmoji}
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
