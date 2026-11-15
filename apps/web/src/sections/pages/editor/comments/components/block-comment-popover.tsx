import type { Editor as TiptapEditor } from "@tiptap/react";
import { ChevronsLeftIcon, MessageSquareIcon, MessageSquarePlusIcon } from "@/components/icons";

import type { PageCommentController } from "@/sections/pages/editor/comments/lib/yjs-comments";
import {
  usePageEditorComments,
  usePageCommentsSnapshot,
} from "@/sections/pages/editor/comments/components/comments-context";
import { PageCommentThread } from "@/sections/pages/editor/comments/components/page-comments";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

import { getCommentIdsInRange } from "../lib/comment-selection";

import type { DragHandleTarget } from "../../toolbar/lib/toolbar";

function getBlockCommentRange(target: DragHandleTarget) {
  if (target.node.isLeaf || target.node.isAtom) return null;

  const from = target.pos + 1;
  const to = target.pos + target.node.nodeSize - 1;
  return target.node.textContent.trim() && to > from ? { from, to } : null;
}

export function BlockCommentPopover({
  commentController,
  editor,
  onOpenChange,
  open,
  pageId,
  target,
}: {
  commentController: PageCommentController;
  editor: TiptapEditor;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pageId: string;
  target: DragHandleTarget;
}) {
  const editorComments = usePageEditorComments();
  const snapshot = usePageCommentsSnapshot(pageId);
  const range = getBlockCommentRange(target);
  const threadIds = range
    ? new Set(getCommentIdsInRange(editor, range.from, range.to))
    : new Set<string>();
  const blockThreads = snapshot.threads.filter(
    (thread) => thread.kind === "block" && threadIds.has(thread.id),
  );
  const openThreads = blockThreads.filter((thread) => !thread.resolvedAt);
  const activeThread = openThreads[0] ?? null;
  const commentCount = openThreads.reduce((count, thread) => count + thread.comments.length, 0);

  if (!range) return null;

  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={commentCount ? `Open ${commentCount} block comments` : "Add block comment"}
          className="block-comment-button"
          size="icon-sm"
          title={commentCount ? "Open block comments" : "Add block comment"}
          type="button"
          variant="ghost"
        >
          {commentCount ? <MessageSquareIcon /> : <MessageSquarePlusIcon />}
          {commentCount ? <span className="block-comment-count">{commentCount}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-96 max-w-[calc(100vw-2rem)] p-3"
        side="left"
        sideOffset={8}
      >
        <PopoverHeader className="flex-row items-start justify-between gap-2">
          <div className="min-w-0">
            <PopoverTitle>Comment</PopoverTitle>
            <p className="line-clamp-2 text-xs text-content-secondary">
              {target.node.textContent.trim()}
            </p>
          </div>
          <Button
            aria-label="Open in comments"
            className="shrink-0 text-content-secondary"
            onClick={() => {
              if (activeThread) {
                commentController.activateThread(activeThread.id, {
                  openSidebar: false,
                });
              }
              onOpenChange(false);
              editorComments.requestEditorComments(pageId);
            }}
            size="icon-sm"
            title="Open in comments"
            type="button"
            variant="ghost"
          >
            <ChevronsLeftIcon />
          </Button>
        </PopoverHeader>
        {activeThread ? (
          <PageCommentThread pageId={pageId} threadId={activeThread.id} />
        ) : (
          <PageCommentThread
            onCreateThread={(body) => commentController.createBlockThread(body, range)}
            pageId={pageId}
            placeholder="Add a comment..."
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
