import { useEffect, useMemo, useState } from "react"
import { Layers3Icon, MoreHorizontalIcon, PlusIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import { SettingsHeader } from "@/components/settings-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { getApiErrorMessage } from "@/lib/api"
import { useActiveWorkspaceId } from "@zilobase/features/integrations"
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

export default function TeamspacesSettingsPage() {
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
          <div className="flex items-start justify-between gap-4">
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
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
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
          {isPending ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : teamspaces.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No teamspaces yet. Create one for a team or project.
            </div>
          ) : (
            <div className="divide-y rounded-lg border">
              {teamspaces.map((teamspace) => {
                const canManage = settings?.canManage || teamspace.currentUserRole === "owner"
                return (
                  <div className="flex items-center gap-3 p-4" key={teamspace.id}>
                    <div className="flex size-9 items-center justify-center rounded-md bg-muted"><Layers3Icon className="size-4" /></div>
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
                      <Button aria-label={`Manage ${teamspace.name}`} onClick={() => setSelected(teamspace)} size="icon-sm" variant="ghost">
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
      <ManageTeamspaceDialog onOpenChange={(open) => !open && setSelected(null)} teamspace={selected} workspaceId={workspaceId} />
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
          <div className="grid gap-2"><Label>Access</Label><Select onValueChange={(value) => setAccessMode(value as TeamspaceAccessMode)} value={accessMode}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Open — anyone can join</SelectItem><SelectItem value="closed">Closed — members join by invite</SelectItem><SelectItem value="private">Private — visible only to members</SelectItem></SelectContent></Select></div>
        </div>
        <DialogFooter><Button onClick={() => onOpenChange(false)} variant="outline">Cancel</Button><Button disabled={!name.trim() || create.isPending} onClick={submit}>{create.isPending ? <Spinner /> : null}Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ManageTeamspaceDialog({ teamspace, workspaceId, onOpenChange }: {
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

  useEffect(() => {
    setName(teamspace?.name ?? "")
    setDescription(teamspace?.description ?? "")
  }, [teamspace])

  const candidates = useMemo(() => {
    const memberIds = new Set(principals.map((principal) => principal.principalId))
    return (targets?.members ?? []).filter((member) => !memberIds.has(member.id))
  }, [principals, targets])

  if (!teamspace || !workspaceId) return null
  const save = (patch: Parameters<typeof update.mutate>[0]) =>
    update.mutate(patch, {
      onError: (error) => toast.error(getApiErrorMessage(error)),
      onSuccess: () => toast.success("Teamspace updated."),
    })

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>{teamspace.name}</DialogTitle><DialogDescription>Manage details, members, and collaboration defaults.</DialogDescription></DialogHeader>
        <Tabs defaultValue="general">
          <TabsList><TabsTrigger value="general">General</TabsTrigger><TabsTrigger value="members">Members</TabsTrigger><TabsTrigger value="permissions">Permissions</TabsTrigger><TabsTrigger value="security">Security</TabsTrigger></TabsList>
          <TabsContent className="grid gap-4 pt-4" value="general">
            <div className="grid gap-2"><Label htmlFor="manage-teamspace-name">Name</Label><Input id="manage-teamspace-name" onChange={(event) => setName(event.target.value)} value={name} /></div>
            <div className="grid gap-2"><Label htmlFor="manage-teamspace-description">Description</Label><Textarea id="manage-teamspace-description" onChange={(event) => setDescription(event.target.value)} value={description} /></div>
            <div className="grid gap-2"><Label>Access</Label><Select onValueChange={(value) => save({ accessMode: value as TeamspaceAccessMode, teamspaceId: teamspace.id, workspaceId })} value={teamspace.accessMode}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="closed">Closed</SelectItem><SelectItem value="private">Private</SelectItem></SelectContent></Select></div>
            <div className="flex justify-between gap-3">
              <Button disabled={teamspace.isDefault || lifecycle.isPending} onClick={() => lifecycle.mutate({ action: "archive", teamspaceId: teamspace.id, workspaceId }, { onError: (error) => toast.error(getApiErrorMessage(error)), onSuccess: () => onOpenChange(false) })} variant="destructive">Archive</Button>
              <Button disabled={!name.trim() || update.isPending} onClick={() => save({ description: description.trim() || null, name: name.trim(), teamspaceId: teamspace.id, workspaceId })}>Save details</Button>
            </div>
          </TabsContent>
          <TabsContent className="grid gap-4 pt-4" value="members">
            <div className="flex gap-2">
              <Select onValueChange={setCandidateId} value={candidateId}><SelectTrigger className="flex-1"><SelectValue placeholder="Select a workspace member" /></SelectTrigger><SelectContent>{candidates.map((member) => <SelectItem key={member.id} value={member.id}>{member.name} · {member.email}</SelectItem>)}</SelectContent></Select>
              <Button disabled={!candidateId || add.isPending} onClick={() => add.mutate({ role: "member", teamspaceId: teamspace.id, userId: candidateId, workspaceId }, { onError: (error) => toast.error(getApiErrorMessage(error)), onSuccess: () => setCandidateId("") })}><UsersIcon />Add</Button>
            </div>
            <div className="divide-y rounded-md border">{principals.map((principal) => <div className="flex items-center gap-3 p-3" key={principal.id}><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{principal.name || principal.email || principal.principalId}</div><div className="truncate text-xs text-muted-foreground">{principal.email}</div></div><Select onValueChange={(role) => updatePrincipal.mutate({ principalId: principal.id, role: role as "owner" | "member", teamspaceId: teamspace.id, workspaceId }, { onError: (error) => toast.error(getApiErrorMessage(error)) })} value={principal.role}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="member">Member</SelectItem><SelectItem value="owner">Owner</SelectItem></SelectContent></Select><Button aria-label="Remove member" onClick={() => remove.mutate({ principalId: principal.id, teamspaceId: teamspace.id, workspaceId }, { onError: (error) => toast.error(getApiErrorMessage(error)) })} size="sm" variant="ghost">Remove</Button></div>)}</div>
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div><div className="text-sm font-medium">Invite link</div><div className="text-xs text-muted-foreground">Anyone in this workspace with the link can join.</div></div>
              <Button disabled={inviteLink.isPending} onClick={() => inviteLink.mutate({ enabled: !teamspace.inviteLinkEnabled, teamspaceId: teamspace.id, workspaceId }, { onError: (error) => toast.error(getApiErrorMessage(error)), onSuccess: (result) => { if (result.token) { const url = `${window.location.origin}/settings/teamspaces?workspace=${encodeURIComponent(workspaceId)}&invite=${encodeURIComponent(result.token)}`; void navigator.clipboard?.writeText(url); toast.success("Invite link copied.") } else { toast.success("Invite link disabled.") } } })} variant="outline">{teamspace.inviteLinkEnabled ? "Disable" : "Enable and copy"}</Button>
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
  return <div className="flex items-center justify-between gap-4"><Label>{label}</Label><Select onValueChange={(value) => onChange(value as typeof value & ("view" | "comment" | "edit" | "full"))} value={value}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="view">Can view</SelectItem><SelectItem value="comment">Can comment</SelectItem><SelectItem value="edit">Can edit</SelectItem><SelectItem value="full">Full access</SelectItem></SelectContent></Select></div>
}

function PolicySelect({ label, value, onChange }: { label: string; value: "owners" | "owners_and_members"; onChange: (value: "owners" | "owners_and_members") => void }) {
  return <div className="flex items-center justify-between gap-4"><Label>{label}</Label><Select onValueChange={(value) => onChange(value as "owners" | "owners_and_members")} value={value}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="owners">Owners only</SelectItem><SelectItem value="owners_and_members">Owners and members</SelectItem></SelectContent></Select></div>
}

function SecurityToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4"><div><Label>{label}</Label><p className="text-xs text-muted-foreground">This is a ceiling for every page and database in the teamspace.</p></div><Switch checked={checked} onCheckedChange={onChange} /></div>
}
