import type { ReactNode } from "react"
import { Link, useLocation } from "@tanstack/react-router"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { ChevronRightIcon, PlusIcon, MoreHorizontalIcon } from "lucide-react"

export function NavWorkspaces({
  onCreateWorkspace,
  workspaces,
}: {
  onCreateWorkspace: () => void
  workspaces: {
    id: string
    name: string
    emoji: ReactNode
    pages: {
      name: string
      emoji: ReactNode
    }[]
  }[]
}) {
  const location = useLocation()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
      <SidebarGroupAction
        aria-label="Create workspace"
        title="Create workspace"
        onClick={onCreateWorkspace}
      >
        <PlusIcon />
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu>
          {workspaces.map((workspace) => (
            <Collapsible key={workspace.id}>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === `/workspace/${workspace.id}`}
                >
                  <Link
                    to="/workspace/$workspaceId"
                    params={{ workspaceId: workspace.id }}
                  >
                    <span>{workspace.emoji}</span>
                    <span>{workspace.name}</span>
                  </Link>
                </SidebarMenuButton>
                <CollapsibleTrigger asChild>
                  <SidebarMenuAction
                    className="left-2 bg-sidebar-accent text-sidebar-accent-foreground data-[state=open]:rotate-90"
                    showOnHover
                  >
                    <ChevronRightIcon
                    />
                  </SidebarMenuAction>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {workspace.pages.map((page) => (
                      <SidebarMenuSubItem key={page.name}>
                        <SidebarMenuSubButton asChild>
                          <a href="#">
                            <span>{page.emoji}</span>
                            <span>{page.name}</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          ))}
          <SidebarMenuItem>
            <SidebarMenuButton className="text-sidebar-foreground/70">
              <MoreHorizontalIcon
              />
              <span>More</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
