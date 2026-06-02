import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  ChevronsUpDownIcon,
  Globe2Icon,
  LinkIcon,
  LockIcon,
  MoreHorizontalIcon,
  Share2Icon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useSession } from "@/features/auth/hooks"
import {
  useCreateWorkspace,
  useDeleteWorkspaceAccess,
  useSetWorkspaceFavorite,
  useSetWorkspacePublished,
  useUpdateWorkspace,
  useUpsertWorkspaceAccess,
  useWorkspace,
  useWorkspaceAccess,
  useWorkspaceAccessLevel,
  useWorkspaceAccessTargets,
  useWorkspaces,
} from "@/features/workspaces/hooks"
import {
  useDatabase,
  useSetDatabaseFavorite,
} from "@/features/databases/hooks"
import {
  useUpdateUserSettings,
  useUserSettings,
} from "@/features/user-settings/hooks"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  resolveWorkspaceFullWidth,
  usesUserFullWidthPreference,
  type AccessLevel,
  type AccessTargetType,
  type WorkspaceAccessRule,
  type WorkspaceMetadata,
} from "@/features/workspaces/queries"

const moreActions = [
  "Customize Page",
  "Copy Link",
  "Duplicate",
  "Move to Trash",
  "Version History",
]

const accessLabels: Record<AccessLevel, string> = {
  edit: "Edit access",
  full: "Full access",
  view: "View access",
}

type ShareTargetValue = `${AccessTargetType}:${string}`

export function NavActions({
  databaseId,
  workspaceId,
}: {
  databaseId?: string | null
  workspaceId?: string | null
}) {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = React.useState(false)
  const { data: databasePayload } = useDatabase(databaseId)
  const actionWorkspaceId = workspaceId ?? databasePayload?.database.pageId
  const { data: workspace } = useWorkspace(actionWorkspaceId)
  const { data: workspaces = [] } = useWorkspaces(workspace?.organizationId)
  const createWorkspace = useCreateWorkspace()
  const updateWorkspace = useUpdateWorkspace()
  const setFavorite = useSetWorkspaceFavorite()
  const setDatabaseFavorite = useSetDatabaseFavorite()
  const { data: userSettings } = useUserSettings()
  const updateUserSettings = useUpdateUserSettings()
  const isMobile = useIsMobile()
  const listWorkspace = workspaces.find((item) => item.id === actionWorkspaceId)
  const isDatabasePage = Boolean(databaseId)
  const workspaceMetadata = (workspace?.metadata ?? {}) as WorkspaceMetadata
  const usesUserPreference = usesUserFullWidthPreference(workspaceMetadata)
  const effectiveFullWidth = resolveWorkspaceFullWidth(
    workspace,
    userSettings?.workspaceFullWidth,
  )
  const fullWidthUpdatePending =
    updateUserSettings.isPending || updateWorkspace.isPending
  const isFavorite = isDatabasePage
    ? Boolean(databasePayload?.database.isFavorite)
    : Boolean(workspace?.isFavorite ?? listWorkspace?.isFavorite)
  const toggleFavorite = () => {
    if (databaseId) {
      if (setDatabaseFavorite.isPending) {
        return
      }

      setDatabaseFavorite.mutate(
        { databaseId, isFavorite: !isFavorite },
        {
          onError: (error) => {
            toast.error(
              error instanceof Error
                ? error.message
                : "Could not update favorite.",
            )
          },
        },
      )
      return
    }

    if (!workspaceId || setFavorite.isPending) {
      return
    }

    setFavorite.mutate(
      { isFavorite: !isFavorite, workspaceId },
      {
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not update favorite.",
          )
        },
      },
    )
  }
  const copyLink = async () => {
    if (!workspaceId && !databaseId) {
      return
    }

    await navigator.clipboard.writeText(
      databaseId
        ? `${window.location.origin}/database/${databaseId}`
        : `${window.location.origin}/workspace/${workspaceId}`,
    )
    setIsOpen(false)
    toast.success(`${databaseId ? "Database" : "Workspace"} link copied.`)
  }
  const duplicateWorkspace = async () => {
    if (!workspace || createWorkspace.isPending) {
      return
    }

    const metadata = (workspace.metadata ?? {}) as WorkspaceMetadata
    try {
      const duplicate = await createWorkspace.mutateAsync({
        content: cloneWorkspaceContent(workspace.content ?? null),
        emoji: metadata.emoji ?? undefined,
        metadata,
        name: getDuplicateWorkspaceName(workspace.name),
        organizationId: workspace.organizationId,
        parentWorkspaceId: metadata.parentWorkspaceId ?? undefined,
      })

      setIsOpen(false)
      toast.success("Workspace duplicated.")
      await navigate({
        to: "/workspace/$workspaceId",
        params: { workspaceId: duplicate.id },
      })
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not duplicate workspace.",
      )
    }
  }
  const runMoreAction = (label: string) => {
    if (label === "Copy Link") {
      void copyLink()
      return
    }

    if (label === "Duplicate") {
      void duplicateWorkspace()
      return
    }
  }
  const toggleWorkspaceFullWidth = () => {
    if (isDatabasePage || fullWidthUpdatePending) {
      return
    }

    if (!usesUserPreference) {
      if (!workspace) {
        return
      }

      updateWorkspace.mutate(
        {
          id: workspace.id,
          metadata: {
            ...workspaceMetadata,
            fullWidth: !Boolean(workspaceMetadata.fullWidth),
            useUserFullWidthPreference: false,
          },
        },
        {
          onError: (error) => {
            toast.error(
              error instanceof Error
                ? error.message
                : "Could not update workspace full width.",
            )
          },
        },
      )
      return
    }

    updateUserSettings.mutate(
      { workspaceFullWidth: !userSettings?.workspaceFullWidth },
      {
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not update full width setting.",
          )
        },
      },
    )
  }
  const toggleUseUserFullWidthPreference = () => {
    if (isDatabasePage || !workspace || fullWidthUpdatePending) {
      return
    }

    const nextUsesUserPreference = !usesUserPreference

    updateWorkspace.mutate(
      {
        id: workspace.id,
        metadata: {
          ...workspaceMetadata,
          useUserFullWidthPreference: nextUsesUserPreference,
        },
      },
      {
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not update workspace full width preference.",
          )
        },
      },
    )
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="hidden font-medium text-muted-foreground md:inline-block">
        Edited recently
      </div>
      {actionWorkspaceId ? (
        <WorkspaceShareDialog workspaceId={actionWorkspaceId} />
      ) : null}
      <Button
        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        className={cn("h-7 w-7", isFavorite && "text-yellow-500")}
        disabled={
          databaseId
            ? !databasePayload || setDatabaseFavorite.isPending
            : !workspaceId || setFavorite.isPending
        }
        onClick={toggleFavorite}
        size="icon"
        title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        type="button"
        variant="ghost"
      >
        <StarIcon className={isFavorite ? "fill-current" : undefined} />
      </Button>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 data-[state=open]:bg-accent"
          >
            <MoreHorizontalIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-56 overflow-hidden rounded-lg p-0"
          align="end"
        >
          <Sidebar collapsible="none" className="bg-transparent">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent className="gap-0">
                  <SidebarMenu>
                    {!isDatabasePage && !isMobile ? (
                      <>
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            aria-pressed={effectiveFullWidth}
                            disabled={!workspace || fullWidthUpdatePending}
                            onClick={toggleWorkspaceFullWidth}
                            type="button"
                          >
                            <span>Full Width</span>
                            <Switch
                              checked={effectiveFullWidth}
                              className="ml-auto pointer-events-none"
                              size="sm"
                              tabIndex={-1}
                            />
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            aria-pressed={usesUserPreference}
                            disabled={!workspace || fullWidthUpdatePending}
                            onClick={toggleUseUserFullWidthPreference}
                            type="button"
                          >
                            <span>Use my preferences</span>
                            <Switch
                              checked={usesUserPreference}
                              className="ml-auto pointer-events-none"
                              size="sm"
                              tabIndex={-1}
                            />
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </>
                    ) : null}
                    {moreActions.map((label) => (
                      <SidebarMenuItem key={label}>
                        <SidebarMenuButton
                          disabled={
                            (label === "Copy Link" &&
                              !workspaceId &&
                              !databaseId) ||
                            (label === "Duplicate" &&
                              (isDatabasePage ||
                                !workspace ||
                                createWorkspace.isPending))
                          }
                          onClick={() => runMoreAction(label)}
                          type="button"
                        >
                          <span>{label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function getDuplicateWorkspaceName(name: string) {
  const trimmedName = name.trim() || "Untitled"

  return `${trimmedName} copy`
}

function cloneWorkspaceContent(content: unknown) {
  if (typeof structuredClone === "function") {
    return structuredClone(content)
  }

  return JSON.parse(JSON.stringify(content)) as unknown
}

function WorkspaceShareDialog({ workspaceId }: { workspaceId: string }) {
  const { data: session } = useSession()
  const { data: workspace } = useWorkspace(workspaceId)
  const { data: accessLevel } = useWorkspaceAccessLevel(workspaceId)
  const { data: accessPayload } = useWorkspaceAccess(workspaceId)
  const { data: targets } = useWorkspaceAccessTargets(workspace?.organizationId)
  const upsertAccess = useUpsertWorkspaceAccess()
  const deleteAccess = useDeleteWorkspaceAccess()
  const setPublished = useSetWorkspacePublished()
  const [targetValue, setTargetValue] = React.useState<ShareTargetValue | "">("")
  const [targetPickerOpen, setTargetPickerOpen] = React.useState(false)
  const [nextAccessLevel, setNextAccessLevel] =
    React.useState<AccessLevel>("view")
  const canManage = accessLevel === "full"
  const shareableMembers = React.useMemo(
    () =>
      (targets?.members ?? []).filter(
        (member) => member.id !== session?.user?.id,
      ),
    [session?.user?.id, targets?.members],
  )
  const targetByKey = React.useMemo(() => {
    const map = new Map<string, { label: string; detail?: string }>()

    for (const member of targets?.members ?? []) {
      map.set(`user:${member.id}`, {
        detail: member.email,
        label: member.name || member.email,
      })
    }

    return map
  }, [targets?.members])
  const rules = accessPayload?.access ?? []
  const isPublished = rules.some(
    (rule) => rule.targetType === "public" && rule.targetId === "*",
  )
  const sharingRules = rules.filter((rule) => rule.targetType !== "public")
  const selectedTarget = targetValue ? targetByKey.get(targetValue) : null
  const publicUrl =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/workspace/${workspaceId}`

  const shareWorkspace = () => {
    if (!targetValue || !workspace) {
      return
    }

    const [targetType, targetId] = targetValue.split(":") as [
      AccessTargetType,
      string,
    ]

    upsertAccess.mutate(
      {
        accessLevel: nextAccessLevel,
        targetId,
        targetType,
        workspaceId: workspace.id,
      },
      {
        onSuccess: () => {
          setTargetValue("")
          toast.success("Workspace access updated.")
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Could not share.")
        },
      },
    )
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(publicUrl || window.location.href)
    toast.success("Workspace link copied.")
  }

  const togglePublished = (checked: boolean) => {
    if (!workspace || !canManage || setPublished.isPending) {
      return
    }

    setPublished.mutate(
      { isPublished: checked, workspaceId: workspace.id },
      {
        onSuccess: () => {
          toast.success(
            checked ? "Workspace published." : "Workspace unpublished.",
          )
        },
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not update publishing.",
          )
        },
      },
    )
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="h-8 gap-2" size="sm" variant="outline">
          <LockIcon />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Share workspace</DialogTitle>
          <DialogDescription>
            Access applies to this workspace and nested workspaces.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="share">
          <TabsList className="w-full">
            <TabsTrigger value="share">Share</TabsTrigger>
            <TabsTrigger value="publish">Publishing</TabsTrigger>
          </TabsList>

          <TabsContent className="grid gap-4 pt-2" value="share">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Popover
                open={targetPickerOpen}
                onOpenChange={setTargetPickerOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    className="min-w-0 flex-1 justify-between"
                    disabled={!canManage}
                    role="combobox"
                    type="button"
                    variant="outline"
                  >
                    <span className="min-w-0 truncate text-left">
                      {selectedTarget?.detail ?? "Search members"}
                    </span>
                    <ChevronsUpDownIcon className="opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(28rem,calc(100vw-3rem))] p-0">
                  <Command>
                    <CommandInput placeholder="Search by name or email..." />
                    <CommandList>
                      <CommandEmpty>No members found.</CommandEmpty>
                      <CommandGroup>
                        {shareableMembers.map((member) => {
                          const value: ShareTargetValue = `user:${member.id}`
                          const label = member.name || member.email

                          return (
                            <CommandItem
                              data-checked={targetValue === value}
                              key={member.id}
                              onSelect={() => {
                                setTargetValue(value)
                                setTargetPickerOpen(false)
                              }}
                              value={`${member.email} ${member.name}`}
                            >
                              <div className="min-w-0">
                                <div className="truncate font-medium">{label}</div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {member.email}
                                </div>
                              </div>
                            </CommandItem>
                          )
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Select
                disabled={!canManage}
                onValueChange={(value) =>
                  setNextAccessLevel(value as AccessLevel)
                }
                value={nextAccessLevel}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">View</SelectItem>
                  <SelectItem value="edit">Edit</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                </SelectContent>
              </Select>
              <Button
                disabled={!canManage || !targetValue || upsertAccess.isPending}
                onClick={shareWorkspace}
                type="button"
              >
                <Share2Icon />
                Share
              </Button>
            </div>

            <div className="grid gap-2">
              <AccessRow
                detail={session?.user?.email}
                label={session?.user?.name || "You"}
                level={accessLevel ?? "view"}
                suffix="You"
              />
              {sharingRules.map((rule) => (
                <RuleRow
                  canManage={canManage}
                  deleteRule={() =>
                    deleteAccess.mutate(
                      { ruleId: rule.id, workspaceId },
                      {
                        onError: (error) => {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Could not remove access.",
                          )
                        },
                      },
                    )
                  }
                  key={rule.id}
                  rule={rule}
                  target={targetByKey.get(`${rule.targetType}:${rule.targetId}`)}
                />
              ))}
            </div>

            {!canManage ? (
              <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                You need full access to manage sharing for this workspace.
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Input readOnly value={publicUrl} />
              <Button onClick={copyLink} type="button" variant="outline">
                <LinkIcon />
                Copy link
              </Button>
            </div>
          </TabsContent>

          <TabsContent className="grid gap-4 pt-2" value="publish">
            <div className="flex items-start gap-3 rounded-md border px-3 py-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                <Globe2Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">Publish to web</div>
                <div className="text-xs text-muted-foreground">
                  Anyone with the link can view this workspace and nested
                  workspaces. Published pages are read-only.
                </div>
              </div>
              <Switch
                checked={isPublished}
                disabled={!canManage || setPublished.isPending}
                onCheckedChange={togglePublished}
              />
            </div>

            {!canManage ? (
              <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                You need full access to manage publishing for this workspace.
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Input readOnly value={publicUrl} />
              <Button
                disabled={!isPublished}
                onClick={copyLink}
                type="button"
                variant="outline"
              >
                <LinkIcon />
                Copy link
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function RuleRow({
  canManage,
  deleteRule,
  rule,
  target,
}: {
  canManage: boolean
  deleteRule: () => void
  rule: WorkspaceAccessRule
  target?: { detail?: string; label: string }
}) {
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {target?.label ?? "Unknown target"}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {target?.detail ?? rule.targetType}
        </div>
      </div>
      <span className="text-xs text-muted-foreground">
        {accessLabels[rule.accessLevel]}
      </span>
      {canManage ? (
        <Button
          aria-label="Remove access"
          onClick={deleteRule}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2Icon />
        </Button>
      ) : null}
    </div>
  )
}

function AccessRow({
  detail,
  label,
  level,
  suffix,
}: {
  detail?: string
  label: string
  level: AccessLevel
  suffix?: string
}) {
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {label} {suffix ? <span className="text-muted-foreground">({suffix})</span> : null}
        </div>
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </div>
      <span className="text-xs text-muted-foreground">
        {accessLabels[level]}
      </span>
    </div>
  )
}
