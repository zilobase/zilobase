"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
  DropDrawerShortcut,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useNavigate } from "@tanstack/react-router"
import { useSession } from "@notelab/features/auth"
import {
  useCreateWorkspace,
  useWorkspaces,
  useSetActiveWorkspace,
} from "@notelab/features/workspaces"
import { getApiErrorMessage } from "@/lib/api"
import { useAppStore } from "@/stores/app-store"
import { Building2Icon, ChevronDownIcon, PlusIcon } from "lucide-react"

export function WorkspaceSwitcher() {
  const navigate = useNavigate()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false)
  const { data: sessionData } = useSession()
  const { data: rawWorkspaces = [], isError, isLoading } = useWorkspaces()
  const workspaces = rawWorkspaces.filter(Boolean)
  const createWorkspace = useCreateWorkspace()
  const setActiveWorkspace = useSetActiveWorkspace()
  const storedActiveWorkspaceId = useAppStore((state) => state.activeWorkspaceId)

  const activeWorkspaceId =
    sessionData?.session?.activeWorkspaceId ?? storedActiveWorkspaceId
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    workspaces[0]

  React.useEffect(() => {
    if (
      storedActiveWorkspaceId &&
      workspaces.length > 0 &&
      !workspaces.some((workspace) => workspace.id === storedActiveWorkspaceId)
    ) {
      useAppStore.getState().setActiveWorkspaceId(null)
    }
  }, [workspaces, storedActiveWorkspaceId])

  async function handleCreateWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const form = event.currentTarget
    const formData = new FormData(form)
    const workspaceName = String(formData.get("workspaceName") ?? "").trim()

    try {
      await createWorkspace.mutateAsync(workspaceName)
      form.reset()
      setIsCreateDialogOpen(false)
      void navigate({ to: "/dashboard" })
    } catch {
      // React Query owns the visible error state.
    }
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropDrawer>
            <DropDrawerTrigger asChild>
              <SidebarMenuButton
                className="w-fit max-w-full px-1.5"
                disabled={isLoading}
              >
                <div className="flex aspect-square size-5 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  {activeWorkspace ? (
                    <span className="text-[10px] font-semibold">
                      {getWorkspaceInitials(activeWorkspace.name)}
                    </span>
                  ) : (
                    <Building2Icon className="size-3.5" />
                  )}
                </div>
                <span className="truncate font-medium">
                  {readTriggerLabel({
                    activeWorkspaceName: activeWorkspace?.name,
                    isError,
                    isLoading,
                  })}
                </span>
                <ChevronDownIcon className="opacity-50" />
              </SidebarMenuButton>
            </DropDrawerTrigger>
            <DropDrawerContent
              className="w-64 rounded-lg"
              align="start"
              side="bottom"
              sideOffset={4}
            >
              <DropDrawerLabel className="text-xs text-muted-foreground">
                Workspaces
              </DropDrawerLabel>
              {workspaces.map((workspace, index) => (
                <DropDrawerItem
                  key={workspace.id}
                  onClick={() => {
                    void navigate({ to: "/dashboard" })
                    setActiveWorkspace.mutate(workspace.id)
                  }}
                  disabled={
                    workspace.id === activeWorkspace?.id ||
                    setActiveWorkspace.isPending
                  }
                  className="gap-2 p-2"
                >
                  <div className="flex size-6 items-center justify-center rounded-xs border">
                    <span className="text-xs font-medium">
                      {getWorkspaceInitials(workspace.name)}
                    </span>
                  </div>
                  <span className="truncate">{workspace.name}</span>
                  <DropDrawerShortcut>⌘{index + 1}</DropDrawerShortcut>
                </DropDrawerItem>
              ))}
              <DropDrawerSeparator />
              <DropDrawerItem
                className="gap-2 p-2"
                onSelect={() => setIsCreateDialogOpen(true)}
              >
                <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                  <PlusIcon className="size-4" />
                </div>
                <div className="font-medium text-muted-foreground">
                  Add workspace
                </div>
              </DropDrawerItem>
            </DropDrawerContent>
          </DropDrawer>
        </SidebarMenuItem>
      </SidebarMenu>
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open)
          createWorkspace.reset()
        }}
      >
        <DialogContent>
          <form onSubmit={handleCreateWorkspace}>
            <DialogHeader>
              <DialogTitle>Add workspace</DialogTitle>
              <DialogDescription className="sr-only">
                Create a new workspace and switch to it.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="new-workspace-name">
                  Workspace name
                </FieldLabel>
                <Input
                  id="new-workspace-name"
                  name="workspaceName"
                  placeholder="Acme Inc."
                  autoComplete="workspace"
                  disabled={createWorkspace.isPending}
                  required
                />
              </Field>
              {createWorkspace.isError && (
                <FieldError>
                  {getApiErrorMessage(createWorkspace.error)}
                </FieldError>
              )}
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={createWorkspace.isPending}
                onClick={() => setIsCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createWorkspace.isPending}>
                {createWorkspace.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function readTriggerLabel({
  activeWorkspaceName,
  isError,
  isLoading,
}: {
  activeWorkspaceName?: string
  isError: boolean
  isLoading: boolean
}) {
  if (isLoading) {
    return "Loading..."
  }

  if (isError) {
    return "Unable to load"
  }

  return activeWorkspaceName ?? "No workspaces"
}

function getWorkspaceInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()

  return initials || "N"
}
