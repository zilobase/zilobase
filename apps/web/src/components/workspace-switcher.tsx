"use client"

import * as React from "react"
import { isTauri } from "@tauri-apps/api/core"

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
import { useSession } from "@zilobase/features/auth"
import {
  useCreateWorkspace,
  useWorkspaces,
  useSetActiveWorkspace,
} from "@zilobase/features/workspaces"
import { getApiErrorMessage } from "@/lib/api"
import { DesktopConnectServerDialog } from "@/components/desktop-connect-server-dialog"
import {
  getSelectedDesktopServer,
  listDesktopServerProfiles,
  updateDesktopServerProfileSnapshot,
  type DesktopServerProfile,
} from "@/lib/desktop-server"
import { executeDesktopServerSwitch } from "@/lib/desktop-server-switch"
import { useAppStore } from "@/stores/app-store"
import {
  Building2Icon,
  CheckIcon,
  ChevronDownIcon,
  PlusIcon,
  ServerIcon,
  Settings2Icon,
} from "@/components/icons"

export function WorkspaceSwitcher({
  onOpenSettings,
  settingsOpen = false,
}: {
  onOpenSettings?: () => void
  settingsOpen?: boolean
}) {
  const { data: sessionData } = useSession()
  const isWorkspacePinned = sessionData?.workspacePinned !== false
  const isDesktop = isTauri()

  if (isWorkspacePinned && !isDesktop) {
    return (
      <SingleWorkspaceLabel
        onOpenSettings={onOpenSettings}
        sessionData={sessionData}
        settingsOpen={settingsOpen}
      />
    )
  }

  return (
    <MultiWorkspaceSwitcher
      onOpenSettings={onOpenSettings}
      sessionData={sessionData}
      settingsOpen={settingsOpen}
    />
  )
}

function SingleWorkspaceLabel({
  onOpenSettings,
  sessionData,
  settingsOpen,
}: {
  onOpenSettings?: () => void
  sessionData: ReturnType<typeof useSession>["data"]
  settingsOpen: boolean
}) {
  const { data: rawWorkspaces = [], isError, isLoading } = useWorkspaces()
  const workspaces = rawWorkspaces.filter(Boolean)
  const storedActiveWorkspaceId = useAppStore((state) => state.activeWorkspaceId)
  const activeWorkspaceId =
    sessionData?.session?.activeWorkspaceId ?? storedActiveWorkspaceId
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    workspaces[0]

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropDrawer>
          <DropDrawerTrigger asChild>
            <SidebarMenuButton
              className="h-8 w-full max-w-full px-1.5"
              disabled={isLoading}
            >
              <div className="flex aspect-square size-5 items-center justify-center rounded-md bg-primary text-primary-foreground">
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
            align="start"
            className="w-64 rounded-lg"
            side="bottom"
            sideOffset={4}
          >
            <WorkspaceSettingsItem
              onOpenSettings={onOpenSettings}
              settingsOpen={settingsOpen}
            />
          </DropDrawerContent>
        </DropDrawer>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function MultiWorkspaceSwitcher({
  onOpenSettings,
  sessionData,
  settingsOpen,
}: {
  onOpenSettings?: () => void
  sessionData: ReturnType<typeof useSession>["data"]
  settingsOpen: boolean
}) {
  const navigate = useNavigate()
  const isDesktop = isTauri()
  const isWorkspacePinned = sessionData?.workspacePinned !== false
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false)
  const [isConnectDialogOpen, setIsConnectDialogOpen] = React.useState(false)
  const [profiles, setProfiles] = React.useState<DesktopServerProfile[]>([])
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
  const currentServer = getSelectedDesktopServer()
  const otherProfiles = profiles.filter((profile) => !profile.active)
  const showServerCaption = isDesktop && profiles.length > 1

  React.useEffect(() => {
    if (
      storedActiveWorkspaceId &&
      workspaces.length > 0 &&
      !workspaces.some((workspace) => workspace.id === storedActiveWorkspaceId)
    ) {
      useAppStore.getState().setActiveWorkspaceId(null)
    }
  }, [workspaces, storedActiveWorkspaceId])

  React.useEffect(() => {
    if (!isDesktop) return
    let disposed = false
    void listDesktopServerProfiles()
      .then((result) => {
        if (!disposed) setProfiles(result.profiles)
      })
      .catch(() => {
        if (!disposed) setProfiles([])
      })
    return () => {
      disposed = true
    }
  }, [isDesktop])

  React.useEffect(() => {
    if (!isDesktop || isError || isLoading) return
    const handle = window.setTimeout(() => {
      void updateDesktopServerProfileSnapshot({
        lastActiveWorkspaceId: activeWorkspace?.id ?? null,
        lastPath: `${window.location.pathname}${window.location.search}`,
        workspaces: workspaces.map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
        })),
      }).catch(() => undefined)
    }, 400)
    return () => window.clearTimeout(handle)
  }, [activeWorkspace?.id, isDesktop, isError, isLoading, workspaces])

  async function handleCreateWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const form = event.currentTarget
    const formData = new FormData(form)
    const workspaceName = String(formData.get("workspaceName") ?? "").trim()

    try {
      await createWorkspace.mutateAsync(workspaceName)
      form.reset()
      setIsCreateDialogOpen(false)
      void navigate({ to: "/recents" })
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
                className="h-8 w-full max-w-full px-1.5 py-0"
                disabled={isLoading}
              >
                <div className="flex aspect-square size-5 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  {activeWorkspace ? (
                    <span className="text-[10px] font-semibold">
                      {getWorkspaceInitials(activeWorkspace.name)}
                    </span>
                  ) : (
                    <Building2Icon className="size-3.5" />
                  )}
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {readTriggerLabel({
                      activeWorkspaceName: activeWorkspace?.name,
                      isError,
                      isLoading,
                    })}
                  </span>
                  {showServerCaption ? (
                    <span className="block truncate text-[11px] font-normal text-muted-foreground">
                      {serverSectionLabel(currentServer?.displayName, currentServer?.apiOrigin)}
                    </span>
                  ) : null}
                </span>
                <ChevronDownIcon className="opacity-50" />
              </SidebarMenuButton>
            </DropDrawerTrigger>
            <DropDrawerContent
              className={isDesktop ? "w-80 rounded-lg" : "w-64 rounded-lg"}
              align="start"
              side="bottom"
              sideOffset={4}
            >
              {isDesktop ? (
                <DropDrawerLabel className="text-xs text-muted-foreground">
                  {serverSectionLabel(currentServer?.displayName, currentServer?.apiOrigin)}
                </DropDrawerLabel>
              ) : (
                <DropDrawerLabel className="text-xs text-muted-foreground">
                  Workspaces
                </DropDrawerLabel>
              )}
              {workspaces.map((workspace, index) => (
                <DropDrawerItem
                  key={workspace.id}
                  onClick={() => {
                    void navigate({ to: "/recents" })
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
                  <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                  {workspace.id === activeWorkspace?.id ? (
                    <CheckIcon className="size-4 opacity-70" />
                  ) : (
                    <DropDrawerShortcut>⌘{index + 1}</DropDrawerShortcut>
                  )}
                </DropDrawerItem>
              ))}
              {isWorkspacePinned ? null : (
                <>
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
                </>
              )}
              {isDesktop
                ? otherProfiles.map((profile) => (
                    <OtherServerSection
                      key={`${profile.server.instanceId}:${profile.server.apiOrigin}`}
                      onSwitch={(workspaceId) => {
                        void executeDesktopServerSwitch({
                          hasCredentials: profile.hasCredentials,
                          path: profile.hasCredentials
                            ? (profile.lastPath ?? "/recents")
                            : "/login",
                          server: profile.server,
                          workspaceId,
                        })
                      }}
                      profile={profile}
                    />
                  ))
                : null}
              {isDesktop ? (
                <>
                  <DropDrawerSeparator />
                  <DropDrawerItem
                    className="gap-2 p-2"
                    onSelect={() => setIsConnectDialogOpen(true)}
                  >
                    <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                      <ServerIcon className="size-4" />
                    </div>
                    <div className="font-medium text-muted-foreground">
                      Connect another server
                    </div>
                  </DropDrawerItem>
                </>
              ) : null}
              <DropDrawerSeparator />
              <WorkspaceSettingsItem
                onOpenSettings={onOpenSettings}
                settingsOpen={settingsOpen}
              />
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
      {isDesktop ? (
        <DesktopConnectServerDialog
          onOpenChange={setIsConnectDialogOpen}
          open={isConnectDialogOpen}
        />
      ) : null}
    </>
  )
}

function OtherServerSection({
  onSwitch,
  profile,
}: {
  onSwitch: (workspaceId?: string | null) => void
  profile: DesktopServerProfile
}) {
  const label = serverSectionLabel(
    profile.server.displayName,
    profile.server.apiOrigin,
  )
  const workspaces = profile.workspaces
  const signInHint = !profile.hasCredentials

  return (
    <>
      <DropDrawerSeparator />
      <DropDrawerLabel className="text-xs text-muted-foreground">
        {label}
      </DropDrawerLabel>
      {workspaces.length > 0 ? (
        workspaces.map((workspace) => (
          <DropDrawerItem
            key={workspace.id}
            className="gap-2 p-2"
            onClick={() => onSwitch(workspace.id)}
          >
            <div className="flex size-6 items-center justify-center rounded-xs border">
              <span className="text-xs font-medium">
                {getWorkspaceInitials(workspace.name)}
              </span>
            </div>
            <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
            {signInHint ? (
              <span className="text-[11px] text-muted-foreground">Sign in</span>
            ) : null}
          </DropDrawerItem>
        ))
      ) : (
        <DropDrawerItem className="gap-2 p-2" onClick={() => onSwitch(null)}>
          <div className="flex size-6 items-center justify-center rounded-md border bg-background">
            <ServerIcon className="size-4" />
          </div>
          <span className="min-w-0 flex-1 truncate">
            {signInHint ? "Sign in to see workspaces" : profile.server.displayName}
          </span>
        </DropDrawerItem>
      )}
    </>
  )
}

function WorkspaceSettingsItem({
  onOpenSettings,
  settingsOpen,
}: {
  onOpenSettings?: () => void
  settingsOpen: boolean
}) {
  return (
    <DropDrawerItem
      className={settingsOpen ? "bg-accent text-accent-foreground" : undefined}
      onSelect={onOpenSettings}
    >
      <Settings2Icon />
      <span>Settings</span>
    </DropDrawerItem>
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

function serverSectionLabel(displayName?: string, apiOrigin?: string) {
  if (displayName?.trim()) return displayName
  return apiOrigin ?? "Server"
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
