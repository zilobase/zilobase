import { useEffect, useMemo, useState } from "react"
import { Layers3Icon, MoreHorizontalIcon, PlusIcon, UsersIcon } from "@/shared/components/icons"
import { useLocation, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { SettingsHeader } from "@/app/shell/settings/settings-header"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Input } from "@/shared/ui/input"
import { IconEmojiPicker } from "@/shared/ui/icon-emoji-picker"
import { Label } from "@/shared/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { Separator } from "@/shared/ui/separator"
import { Spinner } from "@/shared/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs"
import { Textarea } from "@/shared/ui/textarea"
import { Switch } from "@/shared/ui/switch"
import { getApiErrorMessage } from "@/lib/api"
import { PageIconDisplay } from "@/lib/page-icon"
import { filterTeamspaces } from "./teamspace-filters"
import { useActiveWorkspaceId } from "@zilobase/features/workspaces"
import {
  useAddTeamspacePrincipal,
  useAcceptTeamspaceInvite,
  useArchivedTeamspaces,
  useCreateTeamspace,
  useRemoveTeamspacePrincipal,
  useSetTeamspaceMembership,
  useTeamspacePrincipals,
  useTeamspaces,
  useTeamspaceSettings,
  useTeamspaceLifecycle,
  useUpdateTeamspace,
  useUpdateTeamspacePrincipal,
  useUpdateTeamspaceSettings,
  useUpdateTeamspaceDefaults,
  useUpdateTeamspaceInviteLink,
  type Teamspace,
  type TeamspaceAccessMode,
} from "@zilobase/features/teamspaces"
import { useWorkspaceAccessTargets } from "@zilobase/features/workspaces"

type TeamspaceSettingsTab = "general" | "members" | "permissions" | "security"

function isTeamspaceSettingsTab(value: unknown): value is TeamspaceSettingsTab {
  return (
    value === "general" ||
    value === "members" ||
    value === "permissions" ||
    value === "security"
  )
}

export default function TeamspacesSettingsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const workspaceId = useActiveWorkspaceId()
  const { data: teamspaces = [], isPending } = useTeamspaces(workspaceId)
  const { data: archivedTeamspaces = [] } = useArchivedTeamspaces(workspaceId)
  const { data: settings } = useTeamspaceSettings(workspaceId)
  const updateSettings = useUpdateTeamspaceSettings()
  const membership = useSetTeamspaceMembership()
  const lifecycle = useTeamspaceLifecycle()
  const defaults = useUpdateTeamspaceDefaults()
  const acceptInvite = useAcceptTeamspaceInvite()
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<Teamspace | null>(null)
  const [selectedTab, setSelectedTab] = useState<TeamspaceSettingsTab>("general")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [accessFilter, setAccessFilter] = useState<"all" | TeamspaceAccessMode>("all")
  const [membershipFilter, setMembershipFilter] = useState<"all" | "joined" | "available" | "ownerless">("all")
  const filteredTeamspaces = useMemo(
    () => filterTeamspaces(teamspaces, { accessMode: accessFilter, membership: membershipFilter, query }),
    [accessFilter, membershipFilter, query, teamspaces],
  )
  const routeSearch = location.search as Record<string, unknown>
  const requestedTeamspaceId =
    location.pathname === "/settings/teamspaces" &&
    typeof routeSearch.teamspace === "string"
      ? routeSearch.teamspace
      : null
  const requestedTab = isTeamspaceSettingsTab(routeSearch.tab)
    ? routeSearch.tab
    : "general"

  useEffect(() => {
    if (!requestedTeamspaceId) return
    const requestedTeamspace = teamspaces.find(
      (teamspace) => teamspace.id === requestedTeamspaceId,
    )
    if (!requestedTeamspace) return
    setSelected(requestedTeamspace)
    setSelectedTab(requestedTab)
  }, [requestedTab, requestedTeamspaceId, teamspaces])

  const closeManageDialog = () => {
    setSelected(null)
    if (location.pathname !== "/settings/teamspaces") return
    void navigate({
      replace: true,
      search: (current) => ({
        ...current,
        tab: undefined,
        teamspace: undefined,
      }),
      to: "/settings/teamspaces",
    })
  }

  const archiveSelected = async () => {
    if (!workspaceId || selectedIds.size === 0) return
    try {
      for (const teamspaceId of selectedIds) {
        await lifecycle.mutateAsync({ action: "archive", teamspaceId, workspaceId })
      }
      setSelectedIds(new Set())
      toast.success("Selected teamspaces archived.")
    } catch (error) {
      toast.error(getApiErrorMessage(error))
    }
  }

  useEffect(() => {
    if (!workspaceId || acceptInvite.isPending || acceptInvite.isSuccess) return
    const token = new URLSearchParams(window.location.search).get("invite")
    const inviteWorkspaceId = new URLSearchParams(window.location.search).get("workspace")
    if (!token || inviteWorkspaceId !== workspaceId) return
    acceptInvite.mutate(
      { token, workspaceId },
      {
        onError: (error) => toast.error(getApiErrorMessage(error)),
        onSuccess: () => toast.success("Joined teamspace."),
      },
    )
  }, [acceptInvite, workspaceId])

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        description="Create focused spaces for departments, projects, and shared knowledge."
        title="Teamspaces"
      />
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <section className="grid gap-3">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
            <div className="space-y-1">
              <h3 className="font-heading text-base font-medium">Creation</h3>
              <p className="text-sm text-muted-foreground">
                Choose who can create teamspaces in this workspace.
              </p>
            </div>
            <Select
              disabled={!settings?.canManage || updateSettings.isPending}
              onValueChange={(value) => {
                if (!workspaceId) return
                updateSettings.mutate(
                  {
                    creationPolicy: value as "workspace_owners" | "workspace_members",
                    workspaceId,
                  },
                  {
                    onError: (error) => toast.error(getApiErrorMessage(error)),
                    onSuccess: () => toast.success("Teamspace policy updated."),
                  },
                )
              }}
              value={settings?.creationPolicy ?? "workspace_members"}
            >
              <SelectTrigger aria-label="Who can create teamspaces" className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="workspace_members">All workspace members</SelectItem>
                <SelectItem value="workspace_owners">Workspace owners only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>
        <Separator />
        <section className="grid gap-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-heading text-base font-medium">Teamspaces</h3>
              <p className="text-sm text-muted-foreground">
                Open spaces are discoverable and joinable; closed spaces require an invite.
              </p>
            </div>
            <Button disabled={!workspaceId} onClick={() => setCreateOpen(true)}>
              <PlusIcon /> New teamspace
            </Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label="Search teamspaces"
              className="sm:flex-1"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search teamspaces"
              type="search"
              value={query}
            />
            <Select onValueChange={(value) => setAccessFilter(value as "all" | TeamspaceAccessMode)} value={accessFilter}>
              <SelectTrigger aria-label="Filter by access" className="sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All access</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="closed">Closed</SelectItem><SelectItem value="private">Private</SelectItem></SelectContent>
            </Select>
            <Select onValueChange={(value) => setMembershipFilter(value as typeof membershipFilter)} value={membershipFilter}>
              <SelectTrigger aria-label="Filter by membership" className="sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All membership</SelectItem><SelectItem value="joined">Joined</SelectItem><SelectItem value="available">Available</SelectItem>{settings?.canManage ? <SelectItem value="ownerless">Ownerless</SelectItem> : null}</SelectContent>
            </Select>
            {settings?.canManage && selectedIds.size > 0 ? <Button disabled={lifecycle.isPending} onClick={archiveSelected} variant="destructive">Archive selected ({selectedIds.size})</Button> : null}
          </div>
          {isPending ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : teamspaces.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No teamspaces yet. Create one for a team or project.
            </div>
          ) : filteredTeamspaces.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No teamspaces match these filters.
            </div>
          ) : (
            <div className="divide-y rounded-lg border">
              {filteredTeamspaces.map((teamspace) => {
                const canManage = settings?.canManage || teamspace.currentUserRole === "owner"
                return (
                  <div className="flex flex-wrap items-center gap-3 p-4" key={teamspace.id}>
                    {settings?.canManage && !teamspace.isDefault ? (
                      <Checkbox
                        aria-label={`Select ${teamspace.name}`}
                        checked={selectedIds.has(teamspace.id)}
                        onCheckedChange={(checked) => setSelectedIds((current) => {
                          const next = new Set(current)
                          if (checked) next.add(teamspace.id)
                          else next.delete(teamspace.id)
                          return next
                        })}
                      />
                    ) : null}
                    <div className="flex size-9 items-center justify-center rounded-md bg-muted">
                      {typeof teamspace.icon === "string" && teamspace.icon ? (
                        <PageIconDisplay size="md" value={teamspace.icon} />
                      ) : (
                        <Layers3Icon className="size-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{teamspace.name}</span>
                        {teamspace.isDefault ? <Badge variant="secondary">Default</Badge> : null}
                        <Badge variant="outline">{teamspace.accessMode}</Badge>
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {teamspace.memberCount ?? 0} members{teamspace.description ? ` · ${teamspace.description}` : ""}
                      </p>
                    </div>
                    {teamspace.currentUserRole ? (
                      !teamspace.isDefault ? (
                        <Button
                          disabled={membership.isPending}
                          onClick={() => workspaceId && membership.mutate(
                            { action: "leave", teamspaceId: teamspace.id, workspaceId },
                            { onError: (error) => toast.error(getApiErrorMessage(error)) },
                          )}
                          size="sm"
                          variant="ghost"
                        >Leave</Button>
                      ) : null
                    ) : teamspace.accessMode === "open" ? (
                      <Button
                        disabled={membership.isPending}
                        onClick={() => workspaceId && membership.mutate(
                          { action: "join", teamspaceId: teamspace.id, workspaceId },
                          { onError: (error) => toast.error(getApiErrorMessage(error)) },
                        )}
                        size="sm"
                        variant="outline"
                      >Join</Button>
                    ) : null}
                    {canManage ? (
                      <Button aria-label={`Manage ${teamspace.name}`} onClick={() => { setSelectedTab("general"); setSelected(teamspace) }} size="icon-sm" variant="ghost">
                        <MoreHorizontalIcon />
                      </Button>
                    ) : null}
                    {settings?.canManage && !teamspace.isDefault ? (
                      <Button
                        disabled={defaults.isPending}
                        onClick={() => defaults.mutate(
                          { defaultTeamspaceIds: [teamspace.id], workspaceId: workspaceId! },
                          { onError: (error) => toast.error(getApiErrorMessage(error)), onSuccess: () => toast.success("Default teamspace updated.") },
                        )}
                        size="sm"
                        variant="ghost"
                      >Make default</Button>
                    ) : null}
                    {settings?.canManage && teamspace.ownerIds?.length === 0 ? (
                      <Button disabled={lifecycle.isPending} onClick={() => lifecycle.mutate({ action: "recover-owner", teamspaceId: teamspace.id, workspaceId: workspaceId! }, { onError: (error) => toast.error(getApiErrorMessage(error)), onSuccess: () => toast.success("Teamspace ownership recovered.") })} size="sm" variant="outline">Recover owner</Button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </section>
        {settings?.canManage && archivedTeamspaces.length > 0 ? (
          <>
            <Separator />
            <section className="grid gap-3">
              <div><h3 className="font-heading text-base font-medium">Archived</h3><p className="text-sm text-muted-foreground">Restore a teamspace and its pages.</p></div>
              <div className="divide-y rounded-lg border">
                {archivedTeamspaces.map((teamspace) => (
                  <div className="flex items-center gap-3 p-4" key={teamspace.id}>
                    <span className="min-w-0 flex-1 truncate font-medium">{teamspace.name}</span>
                    <Button disabled={lifecycle.isPending} onClick={() => lifecycle.mutate({ action: "restore", teamspaceId: teamspace.id, workspaceId: workspaceId! }, { onError: (error) => toast.error(getApiErrorMessage(error)) })} size="sm" variant="outline">Restore</Button>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
      <CreateTeamspaceDialog onOpenChange={setCreateOpen} open={createOpen} workspaceId={workspaceId} />
      <ManageTeamspaceDialog
        canInvite={Boolean(
          selected?.currentUserRole === "owner" ||
            (selected?.currentUserRole === "member" &&
              selected.invitePolicy === "owners_and_members"),
        )}
        canManage={Boolean(
          settings?.canManage || selected?.currentUserRole === "owner",
        )}
        initialTab={selectedTab}
        key={selected ? `${selected.id}:${selectedTab}` : "closed"}
        onOpenChange={(open) => !open && closeManageDialog()}
        teamspace={selected}
        workspaceId={workspaceId}
      />
    </main>
  )
}

function CreateTeamspaceDialog({ open, onOpenChange, workspaceId }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string | null | undefined
}) {
  const create = useCreateTeamspace()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [accessMode, setAccessMode] = useState<TeamspaceAccessMode>("closed")

  const submit = () => {
    if (!workspaceId || !name.trim()) return
    create.mutate(
      { accessMode, description: description.trim() || null, name: name.trim(), workspaceId },
      {
        onError: (error) => toast.error(getApiErrorMessage(error)),
        onSuccess: () => {
          toast.success("Teamspace created.")
          setName("")
          setDescription("")
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader><DialogTitle>New teamspace</DialogTitle><DialogDescription>Create a dedicated home for a team or project.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2"><Label htmlFor="teamspace-name">Name</Label><Input id="teamspace-name" maxLength={120} onChange={(event) => setName(event.target.value)} value={name} /></div>
          <div className="grid gap-2"><Label htmlFor="teamspace-description">Description</Label><Textarea id="teamspace-description" onChange={(event) => setDescription(event.target.value)} value={description} /></div>
          <div className="grid gap-2"><Label>Access</Label><Select onValueChange={(value) => setAccessMode(value as TeamspaceAccessMode)} value={accessMode}><SelectTrigger aria-label="Teamspace access"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Open — anyone can join</SelectItem><SelectItem value="closed">Closed — members join by invite</SelectItem><SelectItem value="private">Private — visible only to members</SelectItem></SelectContent></Select></div>
        </div>
        <DialogFooter><Button onClick={() => onOpenChange(false)} variant="outline">Cancel</Button><Button disabled={!name.trim() || create.isPending} onClick={submit}>{create.isPending ? <Spinner /> : null}Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ManageTeamspaceDialog({
  canInvite,
  canManage,
  initialTab,
  teamspace,
  workspaceId,
  onOpenChange,
}: {
  canInvite: boolean
  canManage: boolean
  initialTab: TeamspaceSettingsTab
  teamspace: Teamspace | null
  workspaceId: string | null | undefined
  onOpenChange: (open: boolean) => void
}) {
  const update = useUpdateTeamspace()
  const add = useAddTeamspacePrincipal()
  const updatePrincipal = useUpdateTeamspacePrincipal()
  const remove = useRemoveTeamspacePrincipal()
  const lifecycle = useTeamspaceLifecycle()
  const inviteLink = useUpdateTeamspaceInviteLink()
  const { data: principals = [] } = useTeamspacePrincipals(workspaceId, teamspace?.id)
  const { data: targets } = useWorkspaceAccessTargets(workspaceId)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [candidateId, setCandidateId] = useState("")
  const [icon, setIcon] = useState("")
  const [iconPickerOpen, setIconPickerOpen] = useState(false)

  useEffect(() => {
    setName(teamspace?.name ?? "")
    setDescription(teamspace?.description ?? "")
    setIcon(typeof teamspace?.icon === "string" ? teamspace.icon : "")
  }, [teamspace])

  const candidates = useMemo(() => {
    const memberIds = new Set(principals.map((principal) => principal.principalId))
    return [
      ...(targets?.members ?? []).filter((member) => !memberIds.has(member.id)).map((member) => ({ id: member.id, label: `${member.name} · ${member.email}`, type: "user" as const })),
      ...(targets?.teams ?? []).filter((team) => !memberIds.has(team.id)).map((team) => ({ id: team.id, label: `${team.name} · group`, type: "team" as const })),
    ]
  }, [principals, targets])

  if (!teamspace || !workspaceId) return null
  const save = (patch: Parameters<typeof update.mutate>[0]) =>
    update.mutate(patch, {
      onError: (error) => toast.error(getApiErrorMessage(error)),
      onSuccess: () => toast.success("Teamspace updated."),
    })

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{teamspace.name}</DialogTitle><DialogDescription>Manage details, members, and collaboration defaults.</DialogDescription></DialogHeader>
        <Tabs defaultValue={initialTab}>
          <TabsList className="w-full justify-start overflow-x-auto"><TabsTrigger disabled={!canManage} value="general">General</TabsTrigger><TabsTrigger disabled={!canInvite && !canManage} value="members">Members</TabsTrigger><TabsTrigger disabled={!canManage} value="permissions">Permissions</TabsTrigger><TabsTrigger disabled={!canManage} value="security">Security</TabsTrigger></TabsList>
          <TabsContent className="grid gap-4 pt-4" value="general">
            <div className="grid gap-2">
              <Label>Icon</Label>
              <div className="flex items-center gap-2">
                <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button className="justify-start" type="button" variant="outline">
                      {icon ? (
                        <PageIconDisplay size="sm" value={icon} />
                      ) : (
                        <Layers3Icon />
                      )}
                      <span>{icon ? "Change icon" : "Add icon"}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0">
                    <IconEmojiPicker
                      onEmojiSelect={(nextIcon) => {
                        setIcon(nextIcon)
                        setIconPickerOpen(false)
                        save({
                          icon: nextIcon,
                          teamspaceId: teamspace.id,
                          workspaceId,
                        })
                      }}
                      onIconSelect={(nextIcon) => {
                        setIcon(nextIcon)
                        setIconPickerOpen(false)
                        save({
                          icon: nextIcon,
                          teamspaceId: teamspace.id,
                          workspaceId,
                        })
                      }}
                    />
                  </PopoverContent>
                </Popover>
                {icon ? (
                  <Button
                    onClick={() => {
                      setIcon("")
                      save({
                        icon: null,
                        teamspaceId: teamspace.id,
                        workspaceId,
                      })
                    }}
                    type="button"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="grid gap-2"><Label htmlFor="manage-teamspace-name">Name</Label><Input id="manage-teamspace-name" onChange={(event) => setName(event.target.value)} value={name} /></div>
            <div className="grid gap-2"><Label htmlFor="manage-teamspace-description">Description</Label><Textarea id="manage-teamspace-description" onChange={(event) => setDescription(event.target.value)} value={description} /></div>
            <div className="grid gap-2"><Label>Access</Label><Select onValueChange={(value) => save({ accessMode: value as TeamspaceAccessMode, teamspaceId: teamspace.id, workspaceId })} value={teamspace.accessMode}><SelectTrigger aria-label="Teamspace access"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="closed">Closed</SelectItem><SelectItem value="private">Private</SelectItem></SelectContent></Select></div>
            <div className="flex justify-between gap-3">
              <Button disabled={teamspace.isDefault || lifecycle.isPending} onClick={() => lifecycle.mutate({ action: "archive", teamspaceId: teamspace.id, workspaceId }, { onError: (error) => toast.error(getApiErrorMessage(error)), onSuccess: () => onOpenChange(false) })} variant="destructive">Archive</Button>
              <Button disabled={!name.trim() || update.isPending} onClick={() => save({ description: description.trim() || null, name: name.trim(), teamspaceId: teamspace.id, workspaceId })}>Save details</Button>
            </div>
          </TabsContent>
          <TabsContent className="grid gap-4 pt-4" value="members">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select disabled={!canInvite} onValueChange={setCandidateId} value={candidateId}><SelectTrigger aria-label="Workspace member or sharing group" className="flex-1"><SelectValue placeholder="Select a workspace member or group" /></SelectTrigger><SelectContent>{candidates.map((candidate) => <SelectItem key={`${candidate.type}:${candidate.id}`} value={`${candidate.type}:${candidate.id}`}>{candidate.label}</SelectItem>)}</SelectContent></Select>
              <Button disabled={!canInvite || !candidateId || add.isPending} onClick={() => { const [principalType, principalId] = candidateId.split(":") as ["user" | "team", string]; add.mutate({ principalType, role: "member", teamspaceId: teamspace.id, userId: principalId, workspaceId }, { onError: (error) => toast.error(getApiErrorMessage(error)), onSuccess: () => setCandidateId("") }) }}><UsersIcon />Add</Button>
            </div>
            <div className="divide-y rounded-md border">{principals.map((principal) => <div className="flex flex-wrap items-center gap-3 p-3" key={principal.id}><div className="min-w-48 flex-1"><div className="truncate text-sm font-medium">{principal.name || principal.email || principal.principalId}</div><div className="truncate text-xs text-muted-foreground">{principal.principalType === "team" ? "Sharing group" : principal.email}</div></div><Select disabled={!canManage} onValueChange={(accessLevelOverride) => updatePrincipal.mutate({ accessLevelOverride: accessLevelOverride === "default" ? null : accessLevelOverride as "view" | "comment" | "edit" | "full", principalId: principal.id, role: principal.role, teamspaceId: teamspace.id, workspaceId }, { onError: (error) => toast.error(getApiErrorMessage(error)) })} value={principal.accessLevelOverride ?? "default"}><SelectTrigger aria-label={`Content access for ${principal.name || principal.principalId}`} className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">Default</SelectItem><SelectItem value="view">View</SelectItem><SelectItem value="comment">Comment</SelectItem><SelectItem value="edit">Edit</SelectItem><SelectItem value="full">Full</SelectItem></SelectContent></Select><Select disabled={!canManage} onValueChange={(role) => updatePrincipal.mutate({ principalId: principal.id, role: role as "owner" | "member", teamspaceId: teamspace.id, workspaceId }, { onError: (error) => toast.error(getApiErrorMessage(error)) })} value={principal.role}><SelectTrigger aria-label={`Teamspace role for ${principal.name || principal.principalId}`} className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="member">Member</SelectItem><SelectItem value="owner">Owner</SelectItem></SelectContent></Select><Button aria-label={`Remove ${principal.name || "member or group"}`} disabled={!canManage} onClick={() => remove.mutate({ principalId: principal.id, teamspaceId: teamspace.id, workspaceId }, { onError: (error) => toast.error(getApiErrorMessage(error)) })} size="sm" variant="ghost">Remove</Button></div>)}</div>
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div><div className="text-sm font-medium">Invite link</div><div className="text-xs text-muted-foreground">Anyone in this workspace with the link can join.</div></div>
              <Button disabled={!canManage || inviteLink.isPending} onClick={() => inviteLink.mutate({ enabled: !teamspace.inviteLinkEnabled, teamspaceId: teamspace.id, workspaceId }, { onError: (error) => toast.error(getApiErrorMessage(error)), onSuccess: (result) => { if (result.token) { const url = `${window.location.origin}/settings/teamspaces?workspace=${encodeURIComponent(workspaceId)}&invite=${encodeURIComponent(result.token)}`; void navigator.clipboard?.writeText(url); toast.success("Invite link copied.") } else { toast.success("Invite link disabled.") } } })} variant="outline">{teamspace.inviteLinkEnabled ? "Disable" : "Enable and copy"}</Button>
            </div>
          </TabsContent>
          <TabsContent className="grid gap-4 pt-4" value="permissions">
            <PermissionSelect label="Default member page access" onChange={(memberAccessLevel) => save({ memberAccessLevel, teamspaceId: teamspace.id, workspaceId })} value={teamspace.memberAccessLevel} />
            <PolicySelect label="Who can invite members" onChange={(invitePolicy) => save({ invitePolicy, teamspaceId: teamspace.id, workspaceId })} value={teamspace.invitePolicy} />
            <PolicySelect label="Who can edit the sidebar" onChange={(sidebarEditPolicy) => save({ sidebarEditPolicy, teamspaceId: teamspace.id, workspaceId })} value={teamspace.sidebarEditPolicy} />
          </TabsContent>
          <TabsContent className="grid gap-4 pt-4" value="security">
            <SecurityToggle checked={teamspace.guestsEnabled} label="Allow guests" onChange={(guestsEnabled) => save({ guestsEnabled, teamspaceId: teamspace.id, workspaceId })} />
            <SecurityToggle checked={teamspace.publicSharingEnabled} label="Allow public sharing" onChange={(publicSharingEnabled) => save({ publicSharingEnabled, teamspaceId: teamspace.id, workspaceId })} />
            <SecurityToggle checked={teamspace.exportEnabled} label="Allow export" onChange={(exportEnabled) => save({ exportEnabled, teamspaceId: teamspace.id, workspaceId })} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function PermissionSelect({ label, value, onChange }: { label: string; value: "view" | "comment" | "edit" | "full"; onChange: (value: "view" | "comment" | "edit" | "full") => void }) {
  return <div className="flex items-center justify-between gap-4"><Label>{label}</Label><Select onValueChange={(value) => onChange(value as typeof value & ("view" | "comment" | "edit" | "full"))} value={value}><SelectTrigger aria-label={label} className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="view">Can view</SelectItem><SelectItem value="comment">Can comment</SelectItem><SelectItem value="edit">Can edit</SelectItem><SelectItem value="full">Full access</SelectItem></SelectContent></Select></div>
}

function PolicySelect({ label, value, onChange }: { label: string; value: "owners" | "owners_and_members"; onChange: (value: "owners" | "owners_and_members") => void }) {
  return <div className="flex items-center justify-between gap-4"><Label>{label}</Label><Select onValueChange={(value) => onChange(value as "owners" | "owners_and_members")} value={value}><SelectTrigger aria-label={label} className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="owners">Owners only</SelectItem><SelectItem value="owners_and_members">Owners and members</SelectItem></SelectContent></Select></div>
}

function SecurityToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4"><div><Label>{label}</Label><p className="text-xs text-muted-foreground">This is a ceiling for every page and database in the teamspace.</p></div><Switch aria-label={label} checked={checked} onCheckedChange={onChange} /></div>
}
