import { useContext, useEffect, useRef, type ReactNode } from "react";
import { CheckIcon, XIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  PageCommentsViewContext,
  usePageCommentController,
  usePageCommentsSnapshot,
} from "./comments-context";
import {
  CommentAvatar,
  formatCommentTime,
  getCommentAuthorName,
  PageCommentThread,
} from "./page-comments";

export function EditorCommentContent({
  children,
  pageId,
  disabled = false,
}: {
  children: ReactNode;
  pageId?: string | null;
  disabled?: boolean;
}) {
  const view = useContext(PageCommentsViewContext);
  const open = Boolean(!disabled && pageId && view?.pageId === pageId && view.open);
  if (disabled) return children;
  return (
    <div className="editor-comments-content">
      <div className="editor-comments-body" data-comments-open={open}>
        <div className="editor-comments-document">{children}</div>
        {open && pageId && view ? (
          <aside className="editor-comments-window" aria-label="Page comments">
            <FloatingComments key={pageId} pageId={pageId} onClose={view.onClose} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export function FloatingComments({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const controller = usePageCommentController(pageId);
  const snapshot = usePageCommentsSnapshot(pageId);
  const listRef = useRef<HTMLDivElement>(null);
  const threads = snapshot.threads.filter((thread) => !thread.resolvedAt);
  const hasPageThread = threads.some((thread) => thread.kind === "page");

  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[data-active="true"]');
    if (!list || !active) return;
    // Scroll only the card, leaving the document at its comment anchor.
    const top = active.getBoundingClientRect().top - list.getBoundingClientRect().top;
    if (top < 0 || top + active.offsetHeight > list.clientHeight) list.scrollTop += top;
  }, [snapshot.activeThreadId]);

  const notifyResolved = (threadId: string) => {
    toast.success("Comment resolved", {
      action: { label: "Undo", onClick: () => controller?.unresolveThread(threadId) },
    });
  };
  const resolve = (threadId: string) => {
    if (!controller) return;
    try {
      controller.resolveThread(threadId);
      notifyResolved(threadId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not resolve comment");
    }
  };

  return (
    <section
      className="floating-comments"
      aria-label="Comments"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="flex shrink-0 items-center gap-2 py-3 pr-4 pl-5">
        <h2 className="text-sm font-medium">Comments</h2>
        <span className="text-xs tabular-nums text-content-secondary">{threads.length}</span>
        <Button
          className="ml-auto"
          aria-label="Close comments"
          onClick={onClose}
          size="icon-sm"
          variant="ghost"
        >
          <XIcon />
        </Button>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-2 pb-2" ref={listRef}>
        <ul aria-label="Open comments" className="space-y-1">
          {threads.map((thread) => {
            const first = thread.comments[0];
            if (!first) return null;
            const active = snapshot.activeThreadId === thread.id;
            const replies = thread.comments.length - 1;
            const author = getCommentAuthorName(first.author);
            return (
              <li
                key={thread.id}
                data-comment-thread={thread.id}
                data-active={active}
                className={cn(
                  "rounded-lg p-3",
                  active
                    ? "bg-action-neutral-hover hover:bg-action-neutral-pressed"
                    : "hover:bg-action-neutral-hover",
                )}
              >
                <div className="flex items-start gap-2">
                  {!active ? <CommentAvatar author={first.author} small /> : null}
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-current={active || undefined}
                    aria-expanded={active}
                    onClick={() =>
                      controller?.activateThread(active ? null : thread.id, { openSidebar: false })
                    }
                  >
                    <span className={active ? "sr-only" : "flex items-baseline gap-2"}>
                      <span className="truncate text-[13px] font-medium">{author}</span>
                      <span className="shrink-0 text-[11px] text-content-secondary">
                        {formatCommentTime(first.createdAt)}
                      </span>
                    </span>
                    {thread.quote ? (
                      <span className="mt-1 block line-clamp-2 text-xs text-content-secondary">
                        “{thread.quote}”
                      </span>
                    ) : (
                      <span className="block text-xs text-content-secondary">Page comment</span>
                    )}
                    {!thread.anchorAttached && thread.kind !== "page" ? (
                      <span className="block text-xs text-content-secondary">
                        Original text removed
                      </span>
                    ) : null}
                    {!active ? (
                      <span className="mt-1 block line-clamp-2 whitespace-pre-wrap break-words text-sm">
                        {first.body}
                      </span>
                    ) : null}
                    {!active && replies > 0 ? (
                      <span className="mt-1 block text-xs text-content-secondary">
                        {replies} {replies === 1 ? "reply" : "replies"}
                      </span>
                    ) : null}
                  </button>
                  {controller?.canEdit ? (
                    <Button
                      aria-label={`Resolve comment from ${author}`}
                      disabled={!controller.canWrite}
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => resolve(thread.id)}
                    >
                      <CheckIcon />
                    </Button>
                  ) : null}
                </div>
                {active ? (
                  <div className="mt-3">
                    <PageCommentThread
                      compact
                      collapseLongThreads
                      pageId={pageId}
                      threadId={thread.id}
                      onThreadResolved={() => notifyResolved(thread.id)}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {threads.length === 0 ? (
          <p className="px-3 py-4 text-sm text-content-secondary">
            No open comments. Select text or use a block’s comment button to start a conversation.
          </p>
        ) : null}
        {controller?.canEdit && !hasPageThread ? (
          <div
            className={cn("p-3", threads.length > 0 && "mt-1 border-t border-stroke-default pt-4")}
          >
            <PageCommentThread compact pageId={pageId} placeholder="Add a page comment..." />
          </div>
        ) : null}
      </div>
    </section>
  );
}
