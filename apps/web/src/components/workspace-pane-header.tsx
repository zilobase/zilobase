import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"

import { NavActions } from "@/components/nav-actions"
import { Button } from "@/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { useActiveOrganizationId } from "@notelab/features/integrations"
import { useDatabase } from "@notelab/features/databases"
import {
  getWorkspaceEmoji,
  readParentItemId,
  useWorkspaces,
  type Workspace,
} from "@notelab/features/workspaces"

export function WorkspacePaneHeader({
  bordered = true,
  className,
  leadingControl,
  onClose,
  pathname,
  showActions = true,
}: {
  bordered?: boolean
  className?: string
  leadingControl?: ReactNode | null
  onClose?: () => void
  pathname: string
  showActions?: boolean
}) {
  const workspaceId = getWorkspaceId(pathname)
  const databaseId = getDatabaseId(pathname)
  const closeControl =
    onClose ? (
      <Button
        aria-label="Close"
        onClick={onClose}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ArrowRight />
      </Button>
    ) : (
      leadingControl
    )

  return (
    <header
      className={`flex h-12 shrink-0 items-center gap-2 ${bordered ? "border-b" : ""} ${className ?? ""}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
        {closeControl ? (
          <>
            {closeControl}
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
          </>
        ) : null}
        <AppBreadcrumbs pathname={pathname} />
      </div>
      {showActions ? (
        <div className="ml-auto px-3">
          <NavActions
            databaseId={databaseId}
            pathname={pathname}
            workspaceId={workspaceId}
          />
        </div>
      ) : null}
    </header>
  )
}

export function AppBreadcrumbs({ pathname }: { pathname: string }) {
  const workspaceId = getWorkspaceId(pathname)
  const databaseId = getDatabaseId(pathname)

  if (workspaceId) {
    return <WorkspaceBreadcrumb workspaceId={workspaceId} />
  }

  if (databaseId) {
    return <DatabaseBreadcrumb databaseId={databaseId} />
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
          {settingsPageTitle ? (
            <>
              <BreadcrumbSeparator className="hidden sm:inline-flex" />
              <BreadcrumbItem>
                <BreadcrumbPage className="line-clamp-1">
                  {settingsPageTitle}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : null}
        </BreadcrumbList>
      </Breadcrumb>
    )
  }

  if (pathname === "/canvas") {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage className="line-clamp-1">Canvas</BreadcrumbPage>
          </BreadcrumbItem>
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

function WorkspaceBreadcrumb({ workspaceId }: { workspaceId: string }) {
  const organizationId = useActiveOrganizationId()
  const { data: workspaces = [] } = useWorkspaces(organizationId)
  const workspace = workspaces.find((item) => item.id === workspaceId)
  const breadcrumbs = workspace
    ? buildWorkspaceBreadcrumbs(workspace, workspaces)
    : []

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
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
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="block max-w-64 truncate sm:max-w-80 md:max-w-96 lg:max-w-[42rem]">
              Workspace
            </BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function DatabaseBreadcrumb({ databaseId }: { databaseId: string }) {
  const organizationId = useActiveOrganizationId()
  const { data: payload } = useDatabase(databaseId)
  const databasePageId = payload?.database.pageId
  const { data: workspaces = [] } = useWorkspaces(organizationId)
  const workspace = databasePageId
    ? workspaces.find((item) => item.id === databasePageId)
    : undefined
  const breadcrumbs = workspace
    ? buildWorkspaceBreadcrumbs(workspace, workspaces)
    : []

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem className="hidden sm:inline-flex">
          <BreadcrumbLink asChild>
            <Link to="/dashboard">Dashboard</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden sm:inline-flex" />
        {breadcrumbs.map((item) => (
          <BreadcrumbFragment
            isCurrent={false}
            item={item}
            key={item.id}
            label={getWorkspaceBreadcrumbLabel(item)}
          />
        ))}
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="block max-w-64 truncate sm:max-w-80 md:max-w-96 lg:max-w-[42rem]">
            {payload?.database.name.trim() || "Database"}
          </BreadcrumbPage>
        </BreadcrumbItem>
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
          <BreadcrumbPage className="block max-w-64 truncate sm:max-w-80 md:max-w-96 lg:max-w-[42rem]">
            {label}
          </BreadcrumbPage>
        ) : (
          <BreadcrumbLink asChild className="block max-w-32 truncate sm:max-w-48">
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

    const parentItemId = readParentItemId(current.metadata)

    current = parentItemId ? workspacesById.get(parentItemId) : undefined
  }

  return breadcrumbs
}

function getWorkspaceBreadcrumbLabel(workspace: Workspace) {
  const label = workspace.name.trim() || "Untitled"
  const emoji = getWorkspaceEmoji(workspace)

  return emoji ? `${emoji} ${label}` : label
}

function getSettingsPageTitle(pathname: string) {
  const pathParts = pathname.split("/").filter(Boolean)
  const page = pathParts[1]

  if (!page) {
    return null
  }

  const titles: Record<string, string> = {
    integrations: "Integrations",
    "notelab-ai": "Notelab AI",
    organization: "Organization",
    profile: "Profile",
    team: "Team",
  }

  return titles[page] ?? null
}

export function getWorkspaceId(pathname: string) {
  const match = pathname.match(/^\/workspace\/([^/]+)/)

  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export function getDatabaseId(pathname: string) {
  const match = pathname.match(/^\/database\/([^/]+)/)

  return match?.[1] ? decodeURIComponent(match[1]) : null
}