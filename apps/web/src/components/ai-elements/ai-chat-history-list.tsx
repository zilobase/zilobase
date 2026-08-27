"use client";

import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { SidebarNavItemAction } from "@/components/sidebar-nav-item-action";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAiChatThreadActions } from "@/hooks/use-ai-chat-thread-actions";
import type { AiChatThread } from "@zilobase/features/ai-chat";
import {
  ArchiveIcon,
  MoreHorizontalIcon,
  PinIcon,
  PinOffIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";

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
    const label = thread.pinned ? "Pinned" : getDateLabel(thread.lastActivityAt);
    const prevLabel =
      index > 0
        ? threads[index - 1].pinned
          ? "Pinned"
          : getDateLabel(threads[index - 1].lastActivityAt)
        : null;

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
  onSetPinned,
}: {
  thread: AiChatThread;
  onArchive: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onSetPinned: (threadId: string, pinned: boolean) => void;
}) {
  return (
    <DropDrawer>
      <DropDrawerTrigger asChild>
        <SidebarNavItemAction
          aria-label={`More actions for ${thread.title}`}
          onClick={(event) => event.stopPropagation()}
          type="button"
          variant="menu"
        >
          <MoreHorizontalIcon className="size-4" />
        </SidebarNavItemAction>
      </DropDrawerTrigger>
      <DropDrawerContent align="end" className="w-52 rounded-lg" side="bottom">
        <DropDrawerItem
          onSelect={() => {
            void onSetPinned(thread.id, !thread.pinned);
          }}
        >
          {thread.pinned ? (
            <PinOffIcon className="text-muted-foreground" />
          ) : (
            <PinIcon className="text-muted-foreground" />
          )}
          <span>{thread.pinned ? "Unpin conversation" : "Pin conversation"}</span>
        </DropDrawerItem>
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
  onSelectThread: (threadId: string | null) => void;
}) {
  const [search, setSearch] = useState("");
  const {
    threads,
    threadsQuery,
    handleArchiveThread,
    handleDeleteThread,
    handleSetPinned,
  } = useAiChatThreadActions({
    activeThreadId,
    onSelectThread,
    search,
  });
  const groupedThreads = useMemo(() => groupThreadsByDate(threads), [threads]);

  return (
    <div
      className={cn("min-h-0 flex-1 overflow-y-auto px-2 py-1 text-xs", className)}
      data-ai-history-scroll-shell
    >
      <div className="sticky top-0 z-10 bg-sidebar px-1 pb-2 pt-1">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search chat history"
            className="h-8 pl-8 text-xs"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search chats"
            type="search"
            value={search}
          />
        </div>
      </div>
      {threadsQuery.isLoading ? (
        <p className="px-2 py-3 text-muted-foreground">Loading chats...</p>
      ) : threads.length === 0 ? (
        <p className="px-2 py-3 text-muted-foreground">
          {search.trim()
            ? "No chats match your search."
            : "Start a new chat to ask about your page."}
        </p>
      ) : (
        <SidebarMenu>
          {groupedThreads.map(({ thread, label, showLabel }) => {
            const isActive = thread.id === activeThreadId;

            return (
              <Fragment key={thread.id}>
                {showLabel ? (
                  <li className="flex h-8 shrink-0 items-center px-2 text-muted-foreground">
                    {label}
                  </li>
                ) : null}
                <SidebarMenuItem>
                  <div className="group/nav-row relative">
                    <SidebarMenuButton
                      className="data-[active=false]:text-muted-foreground"
                      isActive={isActive}
                      onClick={() => onSelectThread(thread.id)}
                      title={`${thread.title} · ${formatRelativeTime(thread.lastActivityAt)}`}
                      type="button"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {thread.title}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] opacity-60 transition-opacity group-focus-within/nav-row:opacity-0 group-hover/nav-row:opacity-0">
                        {formatRelativeTime(thread.lastActivityAt)}
                      </span>
                    </SidebarMenuButton>
                    <AiChatThreadMoreMenu
                      onArchive={handleArchiveThread}
                      onDelete={handleDeleteThread}
                      onSetPinned={handleSetPinned}
                      thread={thread}
                    />
                  </div>
                </SidebarMenuItem>
              </Fragment>
            );
          })}
        </SidebarMenu>
      )}
    </div>
  );
}
