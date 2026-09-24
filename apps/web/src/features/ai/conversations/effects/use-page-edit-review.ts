import { useCallback, useMemo, useState } from "react";
import type { UIMessage } from "ai";
import type { useAgentConversation } from "@zilobase/ai-conversation-adapter";
import {
  buildPageEditSnapshotMap,
  isPageEditBaselineCurrent,
  isPageEditReviewAvailable,
  type PageEditSnapshotPart,
} from "@zilobase/features/ai-chat";
import { prosemirrorToMarkdown } from "@zilobase/page-context";
import { toast } from "sonner";
import { usePageEditorRegistry } from "@/features/editor/runtime/page-editor-registry";
import { usePageEditApplier } from "./use-page-edit-applier";
import { updatePageEditSnapshotStatus } from "./use-page-edit-auto-apply";

export function usePageEditReview({
  messages,
  setMessages,
}: {
  messages: UIMessage[];
  setMessages: ReturnType<typeof useAgentConversation>["setMessages"];
}) {
  const { getEditorHandle } = usePageEditorRegistry();
  const { commitPageEdit, undoPageEdit } = usePageEditApplier();
  const [visibleDiffToolCallId, setVisibleDiffToolCallId] = useState<string | null>(null);

  const snapshotByToolCallId = useMemo(() => buildPageEditSnapshotMap(messages), [messages]);

  const getPageEditBaselineCurrent = useCallback(
    (snapshot: PageEditSnapshotPart) => {
      const handle = getEditorHandle(snapshot.pageId);
      const currentContentJson = handle?.getContentJson() ?? null;

      return isPageEditBaselineCurrent(snapshot.beforeContentJson, currentContentJson, {
        baselineMarkdown: snapshot.beforeMarkdown,
        currentMarkdown: currentContentJson ? prosemirrorToMarkdown(currentContentJson) : undefined,
      });
    },
    [getEditorHandle],
  );

  const getPageEditReviewAvailable = useCallback(
    (snapshot: PageEditSnapshotPart) => {
      const handle = getEditorHandle(snapshot.pageId);
      const currentContentJson = handle?.getContentJson() ?? null;

      return isPageEditReviewAvailable(
        snapshot,
        currentContentJson,
        currentContentJson ? prosemirrorToMarkdown(currentContentJson) : undefined,
      );
    },
    [getEditorHandle],
  );

  const handleDiscardPageEdit = useCallback(
    (toolCallId: string) => {
      const snapshot = snapshotByToolCallId.get(toolCallId);

      if (!snapshot || snapshot.status !== "preview") {
        return;
      }

      getEditorHandle(snapshot.pageId)?.clearEditDiffPreview({
        silent: true,
      });

      if (visibleDiffToolCallId === toolCallId) {
        setVisibleDiffToolCallId(null);
      }

      setMessages((currentMessages) =>
        updatePageEditSnapshotStatus(currentMessages, toolCallId, "declined"),
      );
    },
    [getEditorHandle, setMessages, snapshotByToolCallId, visibleDiffToolCallId],
  );

  const handleApplyPageEdit = useCallback(
    async (toolCallId: string) => {
      const snapshot = snapshotByToolCallId.get(toolCallId);

      if (!snapshot || (snapshot.status !== "preview" && snapshot.status !== "undone")) {
        return;
      }

      if (!getPageEditReviewAvailable(snapshot)) {
        toast.error("This update is no longer available", {
          description: "The page has changed since this suggestion was created.",
        });
        return;
      }

      const result = commitPageEdit({
        afterMarkdown: snapshot.afterMarkdown,
        pageId: snapshot.pageId,
      });

      if (!result.success) {
        toast.error("Apply failed", {
          description: result.errorMessage,
        });
        return;
      }

      getEditorHandle(snapshot.pageId)?.clearEditDiffPreview({
        silent: true,
      });

      if (visibleDiffToolCallId === toolCallId) {
        setVisibleDiffToolCallId(null);
      }

      const afterContentJson = getEditorHandle(snapshot.pageId)?.getContentJson() ?? null;

      setMessages((currentMessages) =>
        updatePageEditSnapshotStatus(currentMessages, toolCallId, "applied", {
          afterContentJson,
        }),
      );
    },
    [
      commitPageEdit,
      getEditorHandle,
      getPageEditReviewAvailable,
      setMessages,
      snapshotByToolCallId,
      visibleDiffToolCallId,
    ],
  );

  const handleTogglePageEditChanges = useCallback(
    (toolCallId: string) => {
      const snapshot = snapshotByToolCallId.get(toolCallId);

      if (!snapshot?.afterMarkdown) {
        return;
      }

      const handle = getEditorHandle(snapshot.pageId);

      if (!handle) {
        toast.error("Open the page in the editor to review this change.");
        return;
      }

      if (!getPageEditReviewAvailable(snapshot)) {
        toast.error("This update is no longer available", {
          description: "The page has changed since this suggestion was created.",
        });
        return;
      }

      if (
        visibleDiffToolCallId === toolCallId ||
        (handle.isEditDiffPreviewActive() && handle.getActiveEditDiffToolCallId() === toolCallId)
      ) {
        handle.clearEditDiffPreview({ silent: true });
        setVisibleDiffToolCallId(null);
        return;
      }

      handle.clearEditDiffPreview({ silent: true });
      const shown = handle.showEditDiffPreview({
        afterMarkdown: snapshot.afterMarkdown,
        beforeMarkdown: snapshot.beforeMarkdown,
        toolCallId,
        useBeforeBaseline: snapshot.status === "applied",
      });

      if (!shown) {
        toast.error("Could not show changes in the editor.");
        return;
      }

      setVisibleDiffToolCallId(toolCallId);
      document
        .querySelector("[data-editor-surface]")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [getEditorHandle, getPageEditReviewAvailable, snapshotByToolCallId, visibleDiffToolCallId],
  );

  const handleUndoPageEdit = useCallback(
    async (toolCallId: string) => {
      const snapshot = snapshotByToolCallId.get(toolCallId);

      if (!snapshot || snapshot.status !== "applied") {
        return;
      }

      const result = await undoPageEdit({
        beforeContentJson: snapshot.beforeContentJson,
        pageId: snapshot.pageId,
      });

      if (!result.success) {
        toast.error("Undo failed", {
          description: result.errorMessage,
        });
        return;
      }

      getEditorHandle(snapshot.pageId)?.clearEditDiffPreview({
        silent: true,
      });

      if (visibleDiffToolCallId === toolCallId) {
        setVisibleDiffToolCallId(null);
      }

      setMessages((currentMessages) =>
        updatePageEditSnapshotStatus(currentMessages, toolCallId, "undone"),
      );
    },
    [getEditorHandle, setMessages, snapshotByToolCallId, undoPageEdit, visibleDiffToolCallId],
  );

  const resetPageEditReview = useCallback(() => setVisibleDiffToolCallId(null), []);
  return {
    snapshotByToolCallId,
    visibleDiffToolCallId,
    resetPageEditReview,
    getPageEditBaselineCurrent,
    getPageEditReviewAvailable,
    handleDiscardPageEdit,
    handleApplyPageEdit,
    handleTogglePageEditChanges,
    handleUndoPageEdit,
  };
}
