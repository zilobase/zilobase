"use client"

import {
  ArchiveIcon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
  MoreHorizontalIcon,
  Trash2Icon,
} from "lucide-react"

import { AppSidebarShell } from "@/components/app-sidebar-shell"
import {
  SIDEBAR_NAV_ROW_INTERACTION_CLASS_NAME,
  SidebarNavItemAction,
} from "@/components/sidebar-nav-item-action"
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { useAiChatThreadActions } from "@/hooks/use-ai-chat-thread-actions"
import { useAiChatThreadState } from "@/hooks/use-ai-chat-thread-state"
import { cn } from "@/lib/utils"
import type { AiChatThread } from "@zilobase/features/ai-chat"

function HistoryThreadMenu({
  thread,
  onArchive,
  onDelete,
}: {
  thread: AiChatThread
  onArchive: (threadId: string) => void
  onDelete: (threadId: string) => void
}) {
  const { isMobile } = useSidebar()

  return (
    <DropDrawer>
      <DropDrawerTrigger asChild>
        <SidebarNavItemAction variant="menu">
          <MoreHorizontalIcon />
          <span className="sr-only">More</span>
        </SidebarNavItemAction>
      </DropDrawerTrigger>
      <DropDrawerContent
        align={isMobile ? "end" : "start"}
        className="w-56 rounded-lg"
        side={isMobile ? "bottom" : "right"}
      >
        <DropDrawerItem
          onSelect={() => {
            void onArchive(thread.id)
          }}
        >
          <ArchiveIcon className="text-muted-foreground" />
          <span>Archive conversation</span>
        </DropDrawerItem>
        <DropDrawerSeparator />
        <DropDrawerItem
          onSelect={() => {
            void onDelete(thread.id)
          }}
          variant="destructive"
        >
          <Trash2Icon />
          <span>Delete conversation</span>
        </DropDrawerItem>
      </DropDrawerContent>
    </DropDrawer>
  )
}

export function HistorySidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { activeThreadId, setActiveThreadId } = useAiChatThreadState()
  const {
    threads,
    threadsQuery,
    handleArchiveThread,
    handleDeleteThread,
    handleStartNewChat,
  } = useAiChatThreadActions({
    activeThreadId,
    onSelectThread: setActiveThreadId,
  })

  return (
    <AppSidebarShell {...props}>
      <SidebarHeader>
        <div className="flex justify-end">
          <SidebarTrigger className="shrink-0" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={handleStartNewChat}
                >
                  <MessageSquarePlusIcon />
                  <span>New chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>History</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {threadsQuery.isLoading ? (
                <SidebarMenuItem>
                  <SidebarMenuButton className="text-muted-foreground">
                    <span>Loading chats...</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : threads.length === 0 ? (
                <SidebarMenuItem>
                  <SidebarMenuButton className="text-muted-foreground">
                    <span>No chats yet</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : (
                threads.map((thread) => (
                  <SidebarMenuItem key={thread.id} className="group/nav-row">
                    <SidebarMenuButton
                      className={cn(
                        "pr-8",
                        SIDEBAR_NAV_ROW_INTERACTION_CLASS_NAME,
                      )}
                      isActive={activeThreadId === thread.id}
                      onClick={() => setActiveThreadId(thread.id)}
                    >
                      <MessageSquareIcon />
                      <span className="truncate">{thread.title}</span>
                    </SidebarMenuButton>
                    <HistoryThreadMenu
                      onArchive={handleArchiveThread}
                      onDelete={handleDeleteThread}
                      thread={thread}
                    />
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </AppSidebarShell>
  )
}
