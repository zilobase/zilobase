import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { Loader2Icon, PlusIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer"
import { Input } from "@/components/ui/input"

import { getApiErrorMessage } from "@/lib/api"
import { WorkspacePageIcon } from "@/lib/workspace-icon"
import { useNotelabFeatures } from "@notelab/features"
import {
  readParentItemId,
  useCreateWorkspace,
  useUpdateWorkspace,
  useWorkspaces,
  workspaceQueryKey,
  type NotelabAiMode,
  type Workspace,
} from "@notelab/features/workspaces"

const modeConfig: Record<
  NotelabAiMode,
  {
    buttonLabel: string
    createItemLabel: string
    newPageTitle: string
  }
> = {
  instruction: {
    buttonLabel: "Create instruction",
    createItemLabel: "Create instruction",
    newPageTitle: "My agent instruction",
  },
  skill: {
    buttonLabel: "Create skill",
    createItemLabel: "Create skill",
    newPageTitle: "My agent skill",
  },
}

type LinkablePageOption = {
  label: string
  path: string
  searchText: string
  value: string
  workspace: Workspace
}

function buildWorkspacePath(
  workspacesById: Map<string, Workspace>,
  workspaceId: string,
) {
  const parts: string[] = []
  const visited = new Set<string>()
  let current = workspacesById.get(workspaceId)

  while (current) {
    if (visited.has(current.id)) {
      break
    }

    visited.add(current.id)
    parts.unshift(current.name.trim() || "Untitled")

    const parentItemId = readParentItemId(current.metadata)

    if (!parentItemId) {
      break
    }

    current = workspacesById.get(parentItemId)
  }

  return parts.join(" / ")
}

function buildLinkablePageOptions(
  workspaces: Workspace[],
  excludedWorkspaceIds: Set<string>,
) {
  const workspacesById = new Map(workspaces.map((workspace) => [workspace.id, workspace]))

  return workspaces
    .filter((workspace) => !excludedWorkspaceIds.has(workspace.id))
    .map<LinkablePageOption>((workspace) => {
      const label = workspace.name.trim() || "Untitled"
      const path = buildWorkspacePath(workspacesById, workspace.id)

      return {
        label,
        path,
        searchText: `${label} ${path}`.trim(),
        value: workspace.id,
        workspace,
      }
    })
}

export function NotelabAiCreateMenu({
  existingWorkspaceIds,
  mode,
  organizationId,
}: {
  existingWorkspaceIds: string[]
  mode: NotelabAiMode
  organizationId: string | null
}) {
  const navigate = useNavigate()
  const { apiFetch, queryClient } = useNotelabFeatures()
  const createWorkspace = useCreateWorkspace()
  const updateWorkspace = useUpdateWorkspace()
  const { data: workspaces = [], isLoading: isLoadingWorkspaces } =
    useWorkspaces(organizationId)
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const config = modeConfig[mode]
  const excludedIds = React.useMemo(
    () => new Set(existingWorkspaceIds),
    [existingWorkspaceIds],
  )
  const pageOptions = React.useMemo(
    () => buildLinkablePageOptions(workspaces, excludedIds),
    [excludedIds, workspaces],
  )
  const normalizedQuery = query.trim().toLowerCase()
  const filteredPageOptions = React.useMemo(() => {
    if (!normalizedQuery) {
      return []
    }

    return pageOptions.filter((option) =>
      option.searchText.toLowerCase().includes(normalizedQuery),
    )
  }, [normalizedQuery, pageOptions])
  const isBusy = createWorkspace.isPending || updateWorkspace.isPending

  React.useEffect(() => {
    if (!open) {
      setQuery("")
    }
  }, [open])

  const closeMenu = () => {
    setOpen(false)
  }

  const openWorkspace = (workspaceId: string) => {
    closeMenu()
    void navigate({
      params: { workspaceId },
      to: "/workspace/$workspaceId",
    })
  }

  const resolveWorkspaceMetadata = async (workspaceId: string) => {
    const cached = queryClient.getQueryData<Workspace | null>(
      workspaceQueryKey(workspaceId),
    )

    if (cached?.metadata) {
      return cached.metadata
    }

    const result = await apiFetch<{ workspace: Workspace }>(
      `/workspaces/${workspaceId}`,
      { method: "GET" },
    )

    return result.workspace.metadata ?? {}
  }

  const assignExistingPage = async (workspaceId: string) => {
    if (!organizationId || isBusy) {
      return
    }

    try {
      const metadata = await resolveWorkspaceMetadata(workspaceId)

      await updateWorkspace.mutateAsync({
        id: workspaceId,
        metadata: {
          ...metadata,
          notelabai: mode,
        },
      })

      toast.success(`Added as ${mode}.`)
      openWorkspace(workspaceId)
    } catch (error) {
      toast.error(getApiErrorMessage(error))
    }
  }

  const createNewPage = async () => {
    if (!organizationId || isBusy) {
      return
    }

    try {
      const workspace = await createWorkspace.mutateAsync({
        metadata: { notelabai: mode },
        name: config.newPageTitle,
        organizationId,
      })

      toast.success(`Created ${mode}.`)
      openWorkspace(workspace.id)
    } catch (error) {
      toast.error(getApiErrorMessage(error))
    }
  }

  return (
    <DropDrawer onOpenChange={setOpen} open={open}>
      <DropDrawerTrigger asChild>
        <Button disabled={!organizationId || isBusy} size="sm" type="button">
          {isBusy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          {config.buttonLabel}
        </Button>
      </DropDrawerTrigger>
      <DropDrawerContent
        align="end"
        className="w-80 overflow-hidden p-0"
      >
        <div className="flex flex-col">
          <div className="shrink-0 border-b bg-popover pt-3">
            <div className="flex items-center gap-1.5 px-3 pb-2.5">
              <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
              <Input
                aria-label="Search pages"
                autoFocus
                className="h-auto rounded-none border-0 bg-transparent px-0 py-0 text-sm font-medium shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search pages..."
                value={query}
              />
            </div>
          </div>

          <div className="h-56 overflow-y-auto overscroll-contain">
            {isLoadingWorkspaces ? (
              <DropDrawerItem disabled>Loading pages...</DropDrawerItem>
            ) : !normalizedQuery ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Type to search pages
              </div>
            ) : filteredPageOptions.length === 0 ? (
              <DropDrawerItem disabled>No pages found.</DropDrawerItem>
            ) : (
              filteredPageOptions.map((pageOption) => (
                <DropDrawerItem
                  key={pageOption.value}
                  onSelect={(event) => {
                    event.preventDefault()
                    void assignExistingPage(pageOption.value)
                  }}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      <WorkspacePageIcon workspace={pageOption.workspace} />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate">{pageOption.label}</div>
                      {pageOption.path !== pageOption.label ? (
                        <div className="truncate text-xs text-muted-foreground">
                          {pageOption.path}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </DropDrawerItem>
              ))
            )}
          </div>

          <div className="shrink-0 border-t bg-popover pb-3">
            <div className="px-3 pt-2.5">
              <DropDrawerItem
                onSelect={(event) => {
                  event.preventDefault()
                  void createNewPage()
                }}
              >
                <PlusIcon />
                <span>{config.createItemLabel}</span>
              </DropDrawerItem>
            </div>
          </div>
        </div>
      </DropDrawerContent>
    </DropDrawer>
  )
}