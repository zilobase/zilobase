import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { FileTextIcon, Loader2Icon, PlusIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item"
import { getApiErrorMessage } from "@/lib/api"
import { useNotelabFeatures } from "@notelab/features"
import {
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
  icon: React.ReactNode
  label: string
  path: string
  searchText: string
  value: string
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

    const parentWorkspaceId = current.metadata?.parentWorkspaceId

    if (!parentWorkspaceId) {
      break
    }

    current = workspacesById.get(parentWorkspaceId)
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
      const emoji = workspace.metadata?.emoji

      return {
        icon: emoji ? (
          <span className="flex size-4 items-center justify-center text-base leading-none">
            {emoji}
          </span>
        ) : (
          <FileTextIcon className="size-4 text-muted-foreground" />
        ),
        label,
        path,
        searchText: `${label} ${path}`.trim(),
        value: workspace.id,
      }
    })
}

export function NotelabAiCreateMenu({
  existingWorkspaceIds,
  mode,
  organizationId,
  trigger,
}: {
  existingWorkspaceIds: string[]
  mode: NotelabAiMode
  organizationId: string | null
  trigger: "header" | "list"
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
        {trigger === "header" ? (
          <Button disabled={!organizationId || isBusy} size="sm" type="button">
            {isBusy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            {config.buttonLabel}
          </Button>
        ) : (
          <Item
            asChild
            className="cursor-pointer border-dashed hover:bg-muted/50"
            variant="outline"
          >
            <button disabled={!organizationId || isBusy} type="button">
              <ItemMedia className="size-10 rounded-lg border border-dashed bg-background">
                {isBusy ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <PlusIcon className="size-4" />
                )}
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{config.buttonLabel}</ItemTitle>
              </ItemContent>
            </button>
          </Item>
        )}
      </DropDrawerTrigger>
      <DropDrawerContent
        align={trigger === "header" ? "end" : "start"}
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
                    {pageOption.icon}
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