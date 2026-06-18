"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useAiChatThreads,
  useCreateAiChatThread,
  useDeleteAiChatThread,
} from "@notelab/features/ai-chat";
import { MessageSquarePlusIcon, Trash2Icon } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

function formatRelativeTime(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return "Just now";
  }

  if (diffMs < hour) {
    return `${Math.floor(diffMs / minute)}m ago`;
  }

  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}h ago`;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function AiChatThreadsPanel({
  activeThreadId,
  className,
  compact = false,
  onSelectThread,
}: {
  activeThreadId: string | null;
  className?: string;
  compact?: boolean;
  onSelectThread: (threadId: string) => void;
}) {
  const threadsQuery = useAiChatThreads();
  const createThread = useCreateAiChatThread();
  const deleteThread = useDeleteAiChatThread();
  const threads = threadsQuery.data?.threads ?? [];

  const handleCreateThread = useCallback(async () => {
    try {
      const response = await createThread.mutateAsync({});
      onSelectThread(response.thread.id);
    } catch (error) {
      toast.error("Failed to create chat", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    }
  }, [createThread, onSelectThread]);

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      try {
        await deleteThread.mutateAsync(threadId);

        if (activeThreadId !== threadId) {
          return;
        }

        const remaining = threads.filter((thread) => thread.id !== threadId);

        if (remaining[0]) {
          onSelectThread(remaining[0].id);
          return;
        }

        const response = await createThread.mutateAsync({});
        onSelectThread(response.thread.id);
      } catch (error) {
        toast.error("Failed to delete chat", {
          description: error instanceof Error ? error.message : "Try again.",
        });
      }
    },
    [activeThreadId, createThread, deleteThread, onSelectThread, threads],
  );

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div
        className={cn(
          "flex items-center gap-2 border-b px-3 py-3",
          compact ? "px-2 py-2" : "px-4",
        )}
      >
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-medium text-sm">Chats</h2>
        </div>
        <Button
          aria-label="New chat"
          disabled={createThread.isPending}
          onClick={() => void handleCreateThread()}
          size={compact ? "icon-sm" : "sm"}
          type="button"
          variant="outline"
        >
          <MessageSquarePlusIcon className="size-4" />
          {compact ? null : <span>New chat</span>}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {threadsQuery.isLoading ? (
          <p className="px-2 py-3 text-muted-foreground text-sm">Loading chats...</p>
        ) : threads.length === 0 ? (
          <p className="px-2 py-3 text-muted-foreground text-sm">
            Start a new chat to ask about your workspace.
          </p>
        ) : (
          <ul className="grid gap-1">
            {threads.map((thread) => {
              const isActive = thread.id === activeThreadId;

              return (
                <li key={thread.id}>
                  <div
                    className={cn(
                      "group flex items-start gap-2 rounded-md border px-3 py-2",
                      isActive
                        ? "border-primary/30 bg-primary/5"
                        : "border-transparent hover:border-border hover:bg-muted/50",
                    )}
                  >
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => onSelectThread(thread.id)}
                      type="button"
                    >
                      <span className="block truncate font-medium text-sm">
                        {thread.title}
                      </span>
                      <span className="mt-0.5 block text-muted-foreground text-xs">
                        {formatRelativeTime(thread.lastActivityAt)}
                      </span>
                    </button>
                    <Button
                      aria-label={`Delete ${thread.title}`}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => void handleDeleteThread(thread.id)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}