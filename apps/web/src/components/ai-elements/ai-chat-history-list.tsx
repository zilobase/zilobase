"use client";

import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAiChatThreadActions } from "@/hooks/use-ai-chat-thread-actions";
import type { AiChatThread } from "@notelab/features/ai-chat";
import { ArchiveIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react";
import { useMemo } from "react";

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

function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return "Older";
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor(
    (today.getTime() - day.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) {
    return "Today";
  }

  if (diffDays === 1) {
    return "Yesterday";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: day.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function groupThreadsByDate(threads: AiChatThread[]) {
  return threads.map((thread, index) => {
    const label = getDateLabel(thread.lastActivityAt);
    const prevLabel =
      index > 0 ? getDateLabel(threads[index - 1].lastActivityAt) : null;

    return {
      thread,
      label,
      showLabel: label !== prevLabel,
    };
  });
}

function AiChatThreadMoreMenu({
  thread,
  onArchive,
  onDelete,
}: {
  thread: AiChatThread;
  onArchive: (threadId: string) => void;
  onDelete: (threadId: string) => void;
}) {
  return (
    <DropDrawer>
      <DropDrawerTrigger asChild>
        <Button
          aria-label={`More actions for ${thread.title}`}
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          onClick={(event) => event.stopPropagation()}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <MoreHorizontalIcon className="size-4" />
        </Button>
      </DropDrawerTrigger>
      <DropDrawerContent align="end" className="w-52 rounded-lg" side="bottom">
        <DropDrawerItem
          onSelect={() => {
            void onArchive(thread.id);
          }}
        >
          <ArchiveIcon className="text-muted-foreground" />
          <span>Archive conversation</span>
        </DropDrawerItem>
        <DropDrawerSeparator />
        <DropDrawerItem
          onSelect={() => {
            void onDelete(thread.id);
          }}
          variant="destructive"
        >
          <Trash2Icon />
          <span>Delete conversation</span>
        </DropDrawerItem>
      </DropDrawerContent>
    </DropDrawer>
  );
}

export function AiChatHistoryList({
  activeThreadId,
  className,
  onSelectThread,
}: {
  activeThreadId: string | null;
  className?: string;
  onSelectThread: (threadId: string) => void;
}) {
  const {
    threads,
    threadsQuery,
    handleArchiveThread,
    handleDeleteThread,
  } = useAiChatThreadActions({
    activeThreadId,
    onSelectThread,
  });

  const groupedThreads = useMemo(() => groupThreadsByDate(threads), [threads]);

  return (
    <div
      className={cn("min-h-0 flex-1 overflow-y-auto px-3 py-3 text-sm", className)}
      data-ai-history-scroll-shell
    >
      {threadsQuery.isLoading ? (
        <p className="px-1 py-3 text-muted-foreground">Loading chats...</p>
      ) : threads.length === 0 ? (
        <p className="px-1 py-3 text-muted-foreground">
          Start a new chat to ask about your workspace.
        </p>
      ) : (
        <div className="-mx-3">
          <div className="divide-y divide-border">
            {groupedThreads.map(({ thread, label, showLabel }) => {
              const isActive = thread.id === activeThreadId;

              return (
                <div
                  key={thread.id}
                  className={cn(
                    "group px-3 py-3 hover:bg-sidebar hover:text-sidebar-foreground",
                    isActive && "bg-sidebar/70",
                  )}
                >
                  {showLabel ? (
                    <div className="pb-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                      {label}
                    </div>
                  ) : null}
                  <div className="flex items-start gap-2">
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => onSelectThread(thread.id)}
                      type="button"
                    >
                      <span className="block truncate font-medium">
                        {thread.title}
                      </span>
                      <span className="mt-0.5 block text-muted-foreground text-xs">
                        {formatRelativeTime(thread.lastActivityAt)}
                      </span>
                    </button>
                    <AiChatThreadMoreMenu
                      onArchive={handleArchiveThread}
                      onDelete={handleDeleteThread}
                      thread={thread}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}