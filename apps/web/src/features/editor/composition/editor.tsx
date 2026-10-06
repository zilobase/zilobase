import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { EditorContent } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { SelectionAiDiffDock } from "../selection/selection-ai-diff-dock";
import { MobileActionBar } from "../toolbar/mobile-action-bar";
import { PageMetadata, type PageMetadataHandle } from "@/features/databases";
import { PageLayoutModuleCanvas } from "../layout/page-layout-module-canvas";
import { PageLayoutTabs } from "../layout/page-layout-tabs";
import { starterContent } from "../core/constants";
import { getFullDocumentPreviewRange, parseMarkdownContent } from "../commands/editor-ai-utils";
import { EditorChrome } from "./editor-chrome";
import { setSelectionAiPreviewMeta } from "../extensions/selection-ai-preview";
import type {
  EditorProps,
  PasteChoiceState,
  SelectionAiDiffPreview,
  PageEditPreviewControls,
  PageEditPreviewRequest,
} from "../core/types";
import { useEditorDatabaseActions } from "../commands/use-editor-database-actions";
import { useEditorMeetingActions } from "../commands/use-editor-meeting-actions";
import { resolveBlockDragTargetFromPoint } from "../drag-drop/block-drag-geometry";
import { useEditorWorkspace } from "../runtime/page-editor-registry";
import { createPositionAnchor } from "../operations/position-anchor";
import { useEditorExtensions } from "./use-editor-extensions";
import { useEditorInstance } from "../runtime/use-editor-instance";
import { useEditorMenuEffects } from "../runtime/use-editor-menu-effects";
import { useEditorRuntime } from "../runtime/use-editor-runtime";
import { useMobileNodeActions } from "../commands/use-mobile-node-actions";
import { DatabaseView } from "@/features/databases";
import {
  canMoveDatabaseBlockToPage,
  dropCrossEditorBlock,
  getBlockDragDatabaseId,
} from "../drag-drop/block-drag";
import { cn } from "@/shared/lib/utils";
import { toast } from "sonner";
import {
  DatabaseBlockDropDialog,
  type PendingDatabaseBlockDrop,
} from "./database-block-drop-dialog";
import { hasPendingCollaborationChanges } from "../collaboration/collaboration-readiness";

export function Editor({
  session = {},
  capabilities = {},
  actions = {},
  presentation = {},
  view = {},
}: EditorProps = {}) {
  const {
    collaboration,
    collaborationField,
    content = starterContent,
    databaseId,
    databaseIds = [],
    pageId,
    workspaceId,
  } = session;
  const {
    afterMetadata,
    commentController,
    cover,
    emoji,
    iconPosition,
    fullWidth = true,
    hideEditorContent = false,
    hideMetadata = false,
    layoutConfig,
    layoutPanelMode = "auto",
    layoutPreview = false,
    onLayoutChange,
    title,
    reviewDiff,
    enableComments = true,
  } = presentation;
  const { editorContentRef, editorTabIndex, onEditorReady, pageEditPreviewRef } = view;
  const {
    onContentChange,
    onCoverChange,
    onCreatePage,
    onEmbedDatabase,
    onEmbedPage,
    onEmojiChange,
    onIconPositionChange,
    getStructuralBlockDeleteAction,
    onDeleteStructuralBlock,
    onOpenPage,
    onStructuralInsertionPendingChange,
    onTitleChange,
  } = actions;
  const editable = capabilities.content ?? true;
  const contentEditable = editable;
  const metadataEditable = capabilities.metadata ?? editable;
  const structuralEditingEnabled = capabilities.structural ?? editable;
  const commentsEditable = capabilities.comments ?? (enableComments && editable);
  const databaseEditable = capabilities.database ?? editable;
  const generatedViewId = useId();
  const editorId = view.viewId ?? generatedViewId;
  const workspace = useEditorWorkspace();
  const runtimeStateRef = useRef({ session, capabilities, actions });
  runtimeStateRef.current = { session, capabilities, actions };
  const runtime = useMemo(
    () => ({
      getSession: () => runtimeStateRef.current.session,
      getCapabilities: () => runtimeStateRef.current.capabilities,
      getActions: () => runtimeStateRef.current.actions,
    }),
    [],
  );
  const editorSurfaceRef = useRef<HTMLElement | null>(null);
  const pageMetadataRef = useRef<PageMetadataHandle | null>(null);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [dragHandleMenuOpen, setDragHandleMenuOpen] = useState(false);
  const [blockCommentOpen, setBlockCommentOpen] = useState(false);
  const [pasteChoice, setPasteChoice] = useState<PasteChoiceState | null>(null);
  const [selectionAiPreview, setSelectionAiPreview] = useState<SelectionAiDiffPreview | null>(null);
  const [pendingDatabaseBlockDrop, setPendingDatabaseBlockDrop] =
    useState<PendingDatabaseBlockDrop | null>(null);
  const [activeLayoutTab, setActiveLayoutTab] = useState("content");
  const pendingDatabaseCommitRef = useRef(false);
  const pendingDropRef = useRef(pendingDatabaseBlockDrop);
  pendingDropRef.current = pendingDatabaseBlockDrop;
  useEffect(
    () => () => {
      pendingDropRef.current?.anchor.dispose();
    },
    [],
  );
  const pendingPageEditRef = useRef<PageEditPreviewRequest | null>(null);
  const pageContentLayout = fullWidth
    ? { className: "", mode: "full" as const }
    : { className: "mx-auto max-w-[900px]", mode: "narrow" as const };
  const activeLinkedTab = layoutConfig?.linkedTabs.find((tab) => tab.id === activeLayoutTab);
  const collaborationHasPendingChanges = hasPendingCollaborationChanges(collaboration);

  useEffect(() => {
    if (
      layoutConfig?.structure !== "tabbed" ||
      (activeLayoutTab !== "content" && !activeLinkedTab)
    ) {
      setActiveLayoutTab("content");
    }
  }, [activeLayoutTab, activeLinkedTab, layoutConfig?.structure]);

  useEffect(() => {
    if (!collaborationHasPendingChanges) return;

    const preventUnsyncedReload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", preventUnsyncedReload);
    return () => window.removeEventListener("beforeunload", preventUnsyncedReload);
  }, [collaborationHasPendingChanges]);

  const { databaseEditorRuntime } = useEditorRuntime(databaseEditable);
  const { createEditorDatabase, handleDatabasePageDrop } = useEditorDatabaseActions(
    workspaceId,
    pageId,
  );
  const { createEditorMeeting } = useEditorMeetingActions(workspaceId, pageId);

  const { editorExtensions, editorLifecycleKey, initialContent, tocItems } = useEditorExtensions({
    collaboration,
    collaborationField,
    content,
    createEditorDatabase,
    createEditorMeeting,
    databaseEditorRuntime,
    editable: contentEditable,
    structuralEditingEnabled,
    onCreatePage,
    onEmbedPage,
    onOpenPage,
    onStructuralInsertionPendingChange,
    workspaceId,
    pageId,
  });

  const { blockDropLine, editor, surfaceDragHandlers } = useEditorInstance({
    workspace,
    runtime,
    documentKey: `${session.kind ?? "page"}:${session.documentId ?? pageId ?? editorId}:${collaborationField ?? "default"}:${layoutPreview ? editorId : ""}`,
    databaseEditorRuntime,
    dropPageOnDatabase: handleDatabasePageDrop,
    editable: contentEditable,
    editorContentRef,
    editorSurfaceRef,
    editorExtensions,
    editorId,
    editorLifecycleKey,
    editorTabIndex,
    initialContent,
    onContentChange,
    onCrossEditorDatabaseDrop: ({ payload, pos }) => {
      const sourceDatabaseId = getBlockDragDatabaseId(payload);
      if (!sourceDatabaseId || !workspace.drag.source(payload)) return false;

      setPendingDatabaseBlockDrop({
        canMove:
          Boolean(
            actions.onMoveDatabase &&
            workspace.runtimes.get(workspace.drag.active!.editor)?.getSession().pageId,
          ) && canMoveDatabaseBlockToPage(sourceDatabaseId, databaseId, databaseIds),
        databaseId: sourceDatabaseId,
        payload,
        pos,
        anchor: createPositionAnchor(editor!, pos),
      });
      workspace.drag.transition("awaiting-choice");
      return true;
    },
    onEditorReady,
    onEmbedPage,
    onOpenPage,
    onMoveToTitle: () => pageMetadataRef.current?.focusTitleEnd() ?? false,
    setPasteChoice,
    pageId,
  });

  const completeDatabaseBlockDrop = async (mode: "copy" | "move") => {
    if (!editor || !pendingDatabaseBlockDrop || pendingDatabaseCommitRef.current) return;
    pendingDatabaseCommitRef.current = true;
    workspace.drag.transition("awaiting-resource");
    const releasePending = workspace.beginOperation([
      editor,
      ...(workspace.drag.active ? [workspace.drag.active.editor] : []),
    ]);
    try {
      const pendingDrop = pendingDatabaseBlockDrop;
      if (
        editor.isDestroyed ||
        !editor.isEditable ||
        pendingDrop.anchor.resolve() === null ||
        !workspace.drag.source(pendingDrop.payload)
      )
        return;
      let resource: import("../core/types").EditorResourceReceipt | void = undefined;
      if (mode === "copy") {
        if (!onEmbedDatabase) throw new Error("Database linking is unavailable.");
        resource = await onEmbedDatabase(pendingDrop.databaseId);
      } else {
        const sourcePageId = workspace.runtimes
          .get(workspace.drag.active!.editor)
          ?.getSession().pageId;
        if (!sourcePageId || !actions.onMoveDatabase)
          throw new Error("Database movement is unavailable.");
        resource = await actions.onMoveDatabase(pendingDrop.databaseId, sourcePageId);
      }
      const pos = pendingDrop.anchor.resolve();
      const completed =
        !editor.isDestroyed &&
        pos !== null &&
        dropCrossEditorBlock(editor.view, pendingDrop.payload, pos, mode);
      if (!completed) {
        await resource?.undo();
        toast.error(
          mode === "move"
            ? "Could not move the database."
            : "Could not create the linked database view.",
        );
        return;
      }
      if (resource)
        workspace.history.attachResource(pendingDrop.payload.operationId, resource, (error) =>
          toast.error(error instanceof Error ? error.message : "Could not update database link."),
        );

      setPendingDatabaseBlockDrop(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the database.");
    } finally {
      pendingDatabaseCommitRef.current = false;
      pendingDatabaseBlockDrop.anchor.dispose();
      workspace.drag.reset();
      setPendingDatabaseBlockDrop(null);
      releasePending();
    }
  };

  useEffect(() => {
    commentController?.setEditor(editor ?? null);
    return () => commentController?.setEditor(null);
  }, [commentController, editor]);

  useEditorMenuEffects({
    dragHandleMenuOpen,
    editorSurfaceRef,
    plusMenuOpen,
    setPlusMenuOpen,
  });

  const resolveDragTargetFromPoint = useCallback(
    (clientX: number, clientY: number) =>
      editor && !editor.isDestroyed
        ? resolveBlockDragTargetFromPoint({
            clientX,
            clientY,
            currentTarget: null,
            view: editor.view,
          })
        : null,
    [editor],
  );

  const { mobileNodeTarget, canMoveMobileTarget, moveMobileTarget, handleMobileNodeClick } =
    useMobileNodeActions(editor, resolveDragTargetFromPoint);

  const handleClosePasteChoice = useCallback(() => setPasteChoice(null), []);

  const clearPageEditPreview = useCallback((options?: { silent?: boolean }) => {
    if (!options?.silent && pendingPageEditRef.current) {
      pendingPageEditRef.current.onDeclined?.();
    }

    pendingPageEditRef.current = null;
    setSelectionAiPreview((current) => (current?.source === "page-edit" ? null : current));
  }, []);

  const clearSelectionAiPreview = useCallback(() => {
    if (pendingPageEditRef.current) {
      clearPageEditPreview();
      return;
    }

    setSelectionAiPreview(null);
  }, [clearPageEditPreview]);

  const handleSelectionAiPreviewChange = useCallback((preview: SelectionAiDiffPreview | null) => {
    if (preview && preview.source !== "page-edit") {
      pendingPageEditRef.current = null;
    }

    setSelectionAiPreview(preview);
  }, []);

  const showPageEditPreview = useCallback(
    (request: PageEditPreviewRequest) => {
      if (!editor || editor.isDestroyed || !editable) {
        return false;
      }

      const parsedPreview = parseMarkdownContent(editor, request.afterMarkdown, {
        unwrapPlainFencedBlock: true,
      });

      if (!parsedPreview) {
        return false;
      }

      const range = getFullDocumentPreviewRange(editor);
      pendingPageEditRef.current = request;
      setSelectionAiPreview({
        baselineMarkdown: request.beforeMarkdown,
        from: range.from,
        generatedMarkdown: request.afterMarkdown,
        isStreaming: false,
        source: "page-edit",
        to: range.to,
        toolCallId: request.toolCallId,
        useBeforeBaseline: request.useBeforeBaseline,
      });

      return true;
    },
    [editable, editor],
  );

  const acceptPageEditPreview = useCallback(() => {
    const pendingEdit = pendingPageEditRef.current;

    if (!editor || !pendingEdit || editor.isDestroyed) {
      return false;
    }

    const parsed = parseMarkdownContent(editor, pendingEdit.afterMarkdown, {
      unwrapPlainFencedBlock: true,
    });

    if (!parsed) {
      return false;
    }

    editor.view.dispatch(setSelectionAiPreviewMeta(editor.state.tr, null));
    editor.commands.setContent({
      type: "doc",
      content: parsed.content,
    });
    onContentChange?.(() => editor.getJSON());
    pendingEdit.onAccepted?.();
    pendingPageEditRef.current = null;
    setSelectionAiPreview(null);
    return true;
  }, [editor, onContentChange]);

  useEffect(() => {
    if (!pageEditPreviewRef) {
      return;
    }

    const controls: PageEditPreviewControls = {
      accept: () => acceptPageEditPreview(),
      clear: (options) => clearPageEditPreview(options),
      isActive: () => pendingPageEditRef.current != null,
      show: (request) => showPageEditPreview(request),
      toolCallId: () => pendingPageEditRef.current?.toolCallId ?? null,
    };

    pageEditPreviewRef.current = controls;

    return () => {
      pageEditPreviewRef.current = null;
    };
  }, [acceptPageEditPreview, clearPageEditPreview, showPageEditPreview, pageEditPreviewRef]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return;
    }

    const parsedPreview = selectionAiPreview
      ? parseMarkdownContent(editor, selectionAiPreview.generatedMarkdown, {
          unwrapPlainFencedBlock: true,
        })
      : null;
    const parsedBaseline = selectionAiPreview?.baselineMarkdown
      ? parseMarkdownContent(editor, selectionAiPreview.baselineMarkdown, {
          unwrapPlainFencedBlock: true,
        })
      : null;

    editor.view.dispatch(
      setSelectionAiPreviewMeta(
        editor.state.tr,
        selectionAiPreview
          ? {
              baselineContent: parsedBaseline?.content,
              baselineMarkdown: selectionAiPreview.baselineMarkdown,
              from: selectionAiPreview.from,
              generatedContent: parsedPreview?.content,
              generatedMarkdown: selectionAiPreview.generatedMarkdown,
              isStreaming: selectionAiPreview.isStreaming,
              to: selectionAiPreview.to,
              useBeforeBaseline: selectionAiPreview.useBeforeBaseline,
            }
          : null,
      ),
    );
  }, [editor, selectionAiPreview]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (!reviewDiff) {
      setSelectionAiPreview((current) =>
        current?.toolCallId === "agent-settings-review" ? null : current,
      );
      return;
    }
    const range = getFullDocumentPreviewRange(editor);
    setSelectionAiPreview({
      baselineMarkdown: reviewDiff.beforeMarkdown,
      generatedMarkdown: reviewDiff.afterMarkdown,
      from: range.from,
      to: range.to,
      isStreaming: false,
      source: "page-edit",
      toolCallId: "agent-settings-review",
      useBeforeBaseline: true,
    });
  }, [editor, reviewDiff?.beforeMarkdown, reviewDiff?.afterMarkdown]);

  const acceptSelectionAiPreview = useCallback(() => {
    if (pendingPageEditRef.current) {
      acceptPageEditPreview();
      return;
    }

    if (!editor || !selectionAiPreview || selectionAiPreview.isStreaming) {
      return;
    }

    const parsed = parseMarkdownContent(editor, selectionAiPreview.generatedMarkdown, {
      unwrapPlainFencedBlock: true,
    });

    if (!parsed) {
      clearSelectionAiPreview();
      return;
    }

    editor.view.dispatch(setSelectionAiPreviewMeta(editor.state.tr, null));
    editor
      .chain()
      .focus()
      .replaceBlocksRange(
        { from: selectionAiPreview.from, to: selectionAiPreview.to },
        parsed.content,
      )
      .run();
    clearSelectionAiPreview();
  }, [acceptPageEditPreview, clearSelectionAiPreview, editor, selectionAiPreview]);

  const focusPageBodyFromTitle = useCallback(() => {
    if (!editor || !editable) return;

    const firstNode = editor.state.doc.firstChild;

    if (!firstNode || (firstNode.isTextblock && firstNode.content.size === 0)) {
      editor.chain().focus("start").run();
      return;
    }

    const paragraph = editor.schema.nodes.paragraph?.create();

    if (!paragraph) {
      editor.chain().focus("start").run();
      return;
    }

    const transaction = editor.state.tr.insert(0, paragraph);
    transaction.setSelection(TextSelection.create(transaction.doc, 1));
    editor.view.dispatch(transaction.scrollIntoView());
    editor.view.focus();
  }, [editable, editor]);

  const renderLayoutModule = (module: NonNullable<typeof layoutConfig>["modules"][number]) => {
    if (module.type === "content") {
      return (
        <div
          className={cn(
            "relative min-w-0 max-w-full",
            module.region === "panel" ? "px-4 py-4" : pageContentLayout.className,
            layoutPreview && "h-[32rem] overflow-hidden",
            onLayoutChange &&
              module.region === "main" &&
              "[&_.tiptap-editor]:px-8 [&_.tiptap-editor]:py-5",
          )}
          data-editor-page-content={pageContentLayout.mode}
          data-layout-content-preview={layoutPreview ? "true" : undefined}
          key={module.id}
        >
          <EditorContent editor={editor} />
          {layoutPreview ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-surface-canvas via-effect-backdrop to-transparent"
            />
          ) : null}
        </div>
      );
    }

    if (module.type === "discussions" && layoutConfig?.discussionsVisible === false) {
      return null;
    }

    const layoutSection =
      module.type === "heading"
        ? "heading"
        : module.type === "discussions"
          ? "discussions"
          : "properties";

    return (
      <PageMetadata
        afterHeading={
          module.type === "heading" && afterMetadata ? (
            <div className={cn("pt-4", hideEditorContent && "pb-10")}>{afterMetadata}</div>
          ) : null
        }
        compact={module.region === "panel" || Boolean(onLayoutChange)}
        compactSpacing={onLayoutChange ? "comfortable" : "default"}
        collaborationUsers={module.type === "heading" ? collaboration?.users : undefined}
        contentClassName={module.region === "panel" ? undefined : pageContentLayout.className}
        cover={cover}
        databaseId={databaseId}
        editable={metadataEditable}
        enableComments={enableComments}
        forceDiscussionsExpanded={module.type === "discussions"}
        icon={emoji}
        iconPosition={iconPosition}
        key={module.id}
        layoutConfig={layoutConfig}
        layoutPropertyId={module.type === "property" ? module.propertyId : undefined}
        layoutSection={layoutSection}
        onCoverChange={onCoverChange}
        onIconChange={onEmojiChange}
        onIconPositionChange={onIconPositionChange}
        onOpenPage={onOpenPage}
        onTitleEnter={focusPageBodyFromTitle}
        onTitleChange={onTitleChange}
        workspaceId={workspaceId}
        title={title}
        pageId={pageId}
        ref={module.type === "heading" ? pageMetadataRef : undefined}
      />
    );
  };

  const editorBody = (
    <div
      className={cn(
        "flex w-full flex-col text-content-primary",
        layoutPreview
          ? "h-full min-h-0"
          : hideMetadata
            ? "min-h-[16rem]"
            : "min-h-[calc(100svh-3rem)]",
      )}
    >
      <section
        className={cn("relative min-h-0 flex-1", layoutPreview && "flex flex-col overflow-hidden")}
        data-editor-surface
        data-editor-view-id={editorId}
        data-editor-pane-id={view.paneId ?? editorId}
        ref={editorSurfaceRef}
        onDragEnd={surfaceDragHandlers.onDragEnd}
        onDragLeave={surfaceDragHandlers.onDragLeave}
        onDragOver={surfaceDragHandlers.onDragOver}
        onDragOverCapture={surfaceDragHandlers.onDragOverCapture}
        onDrop={surfaceDragHandlers.onDrop}
        onClickCapture={handleMobileNodeClick}
      >
        <EditorChrome
          blockDropLine={blockDropLine}
          blockCommentOpen={blockCommentOpen}
          commentController={
            commentsEditable && commentController?.canEdit ? commentController : undefined
          }
          createEditorDatabase={createEditorDatabase}
          createEditorMeeting={createEditorMeeting}
          editable={contentEditable && structuralEditingEnabled}
          editor={editor}
          editorId={editorId}
          dragHandleMenuOpen={dragHandleMenuOpen || blockCommentOpen}
          getStructuralBlockDeleteAction={getStructuralBlockDeleteAction}
          onClosePasteChoice={handleClosePasteChoice}
          onDeleteStructuralBlock={onDeleteStructuralBlock}
          onSelectionAiPreviewChange={handleSelectionAiPreviewChange}
          onStructuralInsertionPendingChange={onStructuralInsertionPendingChange}
          pageId={pageId}
          workspaceId={workspaceId}
          pasteChoice={pasteChoice}
          plusMenuOpen={plusMenuOpen}
          setDragHandleMenuOpen={setDragHandleMenuOpen}
          setBlockCommentOpen={setBlockCommentOpen}
          setPlusMenuOpen={setPlusMenuOpen}
          tocItems={layoutPreview ? [] : tocItems}
        />
        {hideMetadata ? (
          <div className="min-w-0" data-editor-page-content={pageContentLayout.mode}>
            <EditorContent editor={editor} />
          </div>
        ) : layoutConfig ? (
          <PageLayoutModuleCanvas
            config={layoutConfig}
            fixedAfterHeading={
              layoutConfig.structure === "tabbed" ? (
                <PageLayoutTabs
                  config={layoutConfig}
                  onChange={onLayoutChange}
                  onValueChange={setActiveLayoutTab}
                  value={activeLayoutTab}
                />
              ) : undefined
            }
            fullWidth={fullWidth}
            pageId={pageId}
            mainContentOverride={
              activeLinkedTab ? (
                <div
                  className={cn(
                    "relative min-w-0 p-5 md:px-12",
                    layoutPreview ? "h-[32rem] overflow-hidden" : "min-h-[calc(100svh-6rem)]",
                  )}
                >
                  <DatabaseView
                    activeViewId={activeLinkedTab.viewId}
                    databaseId={activeLinkedTab.databaseId}
                    editable={databaseEditable}
                    fullPage
                    onOpenPage={onOpenPage}
                    pageId={pageId}
                    showExpandButton={false}
                    workspaceId={workspaceId}
                  />
                  {layoutPreview ? (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-surface-canvas via-effect-backdrop to-transparent"
                    />
                  ) : null}
                </div>
              ) : undefined
            }
            onChange={onLayoutChange}
            panelMode={layoutPanelMode}
            renderModule={renderLayoutModule}
          />
        ) : (
          <>
            <PageMetadata
              afterHeading={
                afterMetadata ? (
                  <div className={cn("pt-4", hideEditorContent && "pb-10")}>{afterMetadata}</div>
                ) : null
              }
              collaborationUsers={collaboration?.users}
              contentClassName={pageContentLayout.className}
              cover={cover}
              databaseId={databaseId}
              editable={metadataEditable}
              enableComments={enableComments}
              icon={emoji}
              iconPosition={iconPosition}
              onCoverChange={onCoverChange}
              onIconChange={onEmojiChange}
              onIconPositionChange={onIconPositionChange}
              onOpenPage={onOpenPage}
              onTitleEnter={focusPageBodyFromTitle}
              onTitleChange={onTitleChange}
              workspaceId={workspaceId}
              title={title}
              pageId={pageId}
              ref={pageMetadataRef}
            />
            <div
              className={pageContentLayout.className}
              data-editor-page-content={pageContentLayout.mode}
            >
              {hideEditorContent ? null : <EditorContent editor={editor} />}
            </div>
          </>
        )}
        {contentEditable && structuralEditingEnabled && mobileNodeTarget ? (
          <MobileActionBar
            canMoveDown={canMoveMobileTarget("down")}
            canMoveUp={canMoveMobileTarget("up")}
            onMoveDown={() => moveMobileTarget("down")}
            onMoveUp={() => moveMobileTarget("up")}
          />
        ) : null}
        {contentEditable && selectionAiPreview && selectionAiPreview.source !== "page-edit" ? (
          <SelectionAiDiffDock
            isStreaming={selectionAiPreview.isStreaming}
            onAccept={acceptSelectionAiPreview}
            onDecline={clearSelectionAiPreview}
          />
        ) : null}
      </section>
    </div>
  );

  return (
    <>
      {editorBody}
      <DatabaseBlockDropDialog
        onClose={() => {
          if (pendingDatabaseCommitRef.current) return;
          pendingDatabaseBlockDrop?.anchor.dispose();
          workspace.drag.reset();
          setPendingDatabaseBlockDrop(null);
        }}
        onCopy={() => void completeDatabaseBlockDrop("copy")}
        onMove={() => void completeDatabaseBlockDrop("move")}
        pending={pendingDatabaseBlockDrop}
      />
    </>
  );
}
