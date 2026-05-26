import { Link, Outlet, useLocation } from "@tanstack/react-router"

import { AppSidebar } from "@/components/app-sidebar"
import { NavActions } from "@/components/nav-actions"
import { SettingsSidebar } from "@/components/settings-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  getWorkspaceEmoji,
  type Workspace,
} from "@/features/workspaces/queries"
import { useWorkspace, useWorkspaces } from "@/features/workspaces/hooks"

export function AppLayout() {
  const location = useLocation()
  const isSettingsPage = location.pathname.startsWith("/settings")

  return (
    <SidebarProvider>
      {isSettingsPage ? <SettingsSidebar /> : <AppSidebar />}
      <SidebarInset className="h-svh overflow-hidden">
        <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background">
          <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
            <SidebarTrigger />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <AppBreadcrumbs pathname={location.pathname} />
          </div>
          {!isSettingsPage && (
            <div className="ml-auto px-3">
              <NavActions />
            </div>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function WorkspaceBreadcrumb({ workspaceId }: { workspaceId: string }) {
  const { data: workspace } = useWorkspace(workspaceId)
  const { data: workspaces = [] } = useWorkspaces(workspace?.organizationId)
  const breadcrumbs = workspace
    ? buildWorkspaceBreadcrumbs(workspace, workspaces)
    : []

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden sm:inline-flex">
          <BreadcrumbLink asChild>
            <Link to="/dashboard">Dashboard</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden sm:inline-flex" />
        {breadcrumbs.length > 0 ? (
          breadcrumbs.map((item, index) => {
            const isCurrent = index === breadcrumbs.length - 1
            const label = getWorkspaceBreadcrumbLabel(item)

            return (
              <BreadcrumbFragment
                isCurrent={isCurrent}
                item={item}
                key={item.id}
                label={label}
              />
            )
          })
        ) : (
          <BreadcrumbItem>
            <BreadcrumbPage className="line-clamp-1">Workspace</BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function BreadcrumbFragment({
  isCurrent,
  item,
  label,
}: {
  isCurrent: boolean
  item: Workspace
  label: string
}) {
  return (
    <>
      <BreadcrumbItem className="min-w-0">
        {isCurrent ? (
          <BreadcrumbPage className="line-clamp-1">{label}</BreadcrumbPage>
        ) : (
          <BreadcrumbLink asChild className="line-clamp-1 max-w-32 sm:max-w-48">
            <Link to="/workspace/$workspaceId" params={{ workspaceId: item.id }}>
              {label}
            </Link>
          </BreadcrumbLink>
        )}
      </BreadcrumbItem>
      {!isCurrent ? <BreadcrumbSeparator /> : null}
    </>
  )
}

function buildWorkspaceBreadcrumbs(
  workspace: Workspace,
  workspaces: Workspace[],
) {
  const workspacesById = new Map(
    [...workspaces, workspace].map((item) => [item.id, item]),
  )
  const breadcrumbs: Workspace[] = []
  const visited = new Set<string>()
  let current: Workspace | undefined = workspace

  while (current && !visited.has(current.id)) {
    breadcrumbs.unshift(current)
    visited.add(current.id)

    const parentWorkspaceId: string | null | undefined =
      current.metadata?.parentWorkspaceId

    current = parentWorkspaceId ? workspacesById.get(parentWorkspaceId) : undefined
  }

  return breadcrumbs
}

function getWorkspaceBreadcrumbLabel(workspace: Workspace) {
  const label = workspace.name.trim() || "Untitled"
  const emoji = getWorkspaceEmoji(workspace)

  return emoji ? `${emoji} ${label}` : label
}

function AppBreadcrumbs({ pathname }: { pathname: string }) {
  const workspaceId = getWorkspaceId(pathname)

  if (workspaceId) {
    return <WorkspaceBreadcrumb workspaceId={workspaceId} />
  }

  if (pathname.startsWith("/settings")) {
    const settingsPageTitle = getSettingsPageTitle(pathname)

    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden sm:inline-flex">
            <BreadcrumbLink asChild>
              <Link to="/settings">Settings</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {settingsPageTitle && (
            <>
              <BreadcrumbSeparator className="hidden sm:inline-flex" />
              <BreadcrumbItem>
                <BreadcrumbPage className="line-clamp-1">
                  {settingsPageTitle}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
    )
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbPage className="line-clamp-1">Dashboard</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function getWorkspaceId(pathname: string) {
  const match = pathname.match(/^\/workspace\/([^/]+)/)

  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function getSettingsPageTitle(pathname: string) {
  const pathParts = pathname.split("/").filter(Boolean)
  const page = pathParts[1]

  if (!page) {
    return null
  }

  const titles: Record<string, string> = {
    organization: "Organization",
    profile: "Profile",
    team: "Team",
  }

  return titles[page] ?? null
}
