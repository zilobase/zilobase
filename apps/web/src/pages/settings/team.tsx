import * as React from "react"
import { MailPlusIcon, SendIcon, UsersIcon } from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { SettingsHeader } from "@/components/settings-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { useSession } from "@zilobase/features/auth"
import {
  useInviteWorkspaceMember,
  useWorkspaceAccessTargets,
  useWorkspaceInvitations,
} from "@zilobase/features/workspaces"
import type {
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRole,
} from "@zilobase/features/workspaces"
import { apiFetch } from "@/lib/api"
import { useAppStore } from "@/stores/app-store"

type RegistrationMode = "invite-only" | "open"

type InstanceSettingsResponse = {
  settings: {
    bootstrapCompleted: boolean
    displayName: string
    instanceId: string
    pinnedWorkspaceId: string | null
    registrationMode: RegistrationMode
  }
}

export default function TeamSettingsPage() {
  const activeWorkspaceId = useActiveWorkspaceId()
  const { data: sessionData } = useSession()
  const { data: accessTargets, isLoading: isLoadingAccessTargets } =
    useWorkspaceAccessTargets(activeWorkspaceId)
  const { data: invitations, isLoading: isLoadingInvitations } =
    useWorkspaceInvitations(activeWorkspaceId)
  const isInstanceOwner = Boolean(
    sessionData?.workspacePinned &&
      accessTargets?.members.some(
        (member) =>
          member.id === sessionData.user?.id && member.role === "owner",
      ),
  )

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        title="Team"
        description="Invite collaborators and manage team access."
      />

      <div className="mx-auto grid w-full max-w-3xl gap-6">
        {isInstanceOwner ? (
          <>
            <RegistrationSettingsSection />
            <Separator />
          </>
        ) : null}

        <InviteMemberSection workspaceId={activeWorkspaceId} />

        <Separator />

        <section className="grid gap-3">
          <div className="space-y-1">
            <h3 className="font-heading text-base leading-snug font-medium">
              Members
            </h3>
            <p className="text-sm text-muted-foreground">
              People with access to this workspace.
            </p>
          </div>
          <MemberList
            isLoading={isLoadingAccessTargets}
            members={accessTargets?.members ?? []}
          />
        </section>

        <Separator />

        <section className="grid gap-3">
          <div className="space-y-1">
            <h3 className="font-heading text-base leading-snug font-medium">
              Pending invitations
            </h3>
            <p className="text-sm text-muted-foreground">
              Invitations waiting to be accepted.
            </p>
          </div>
          <InvitationList
            invitations={(invitations ?? []).filter(
              (invitation) => invitation.status === "pending",
            )}
            isLoading={isLoadingInvitations}
          />
        </section>
      </div>
    </main>
  )
}

function RegistrationSettingsSection() {
  const queryClient = useQueryClient()
  const settingsQuery = useQuery({
    queryKey: ["instance", "settings"],
    queryFn: () => apiFetch<InstanceSettingsResponse>("/api/instance/settings"),
  })
  const updateSettings = useMutation({
    mutationFn: (registrationMode: RegistrationMode) =>
      apiFetch<InstanceSettingsResponse>("/api/instance/settings", {
        body: JSON.stringify({ registrationMode }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(["instance", "settings"], response)
      toast.success("Registration settings updated.")
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update registration settings.",
      )
    },
  })

  return (
    <section className="grid gap-3">
      <div className="space-y-1">
        <h3 className="font-heading text-base leading-snug font-medium">
          Server registration
        </h3>
        <p className="text-sm text-muted-foreground">
          Choose who can create an account on this self-hosted server.
        </p>
      </div>
      <Field>
        <FieldLabel>Registration mode</FieldLabel>
        <Select
          disabled={settingsQuery.isLoading || updateSettings.isPending}
          onValueChange={(value) =>
            updateSettings.mutate(value as RegistrationMode)
          }
          value={settingsQuery.data?.settings.registrationMode ?? ""}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Loading registration mode..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="invite-only">Invite only</SelectItem>
            <SelectItem value="open">Open registration</SelectItem>
          </SelectContent>
        </Select>
        <FieldDescription>
          Invite only requires a pending invitation. Open registration adds
          every verified account to this workspace as a member.
        </FieldDescription>
        {settingsQuery.isError ? (
          <FieldError>
            {settingsQuery.error instanceof Error
              ? settingsQuery.error.message
              : "Could not load registration settings."}
          </FieldError>
        ) : null}
      </Field>
    </section>
  )
}

function InviteMemberSection({
  workspaceId,
}: {
  workspaceId: string | null | undefined
}) {
  const inviteMember = useInviteWorkspaceMember()
  const [email, setEmail] = React.useState("")
  const [role, setRole] = React.useState<WorkspaceRole>("member")
  const [emailError, setEmailError] = React.useState("")
  const trimmedEmail = email.trim()
  const canSubmit = Boolean(workspaceId && trimmedEmail)

  const invite = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!workspaceId) {
      toast.error("Select an workspace before inviting a teammate.")
      return
    }

    if (!isValidEmail(trimmedEmail)) {
      setEmailError("Enter a valid email address.")
      return
    }

    setEmailError("")
    inviteMember.mutate(
      {
        email: trimmedEmail,
        workspaceId,
        role,
      },
      {
        onSuccess: () => {
          setEmail("")
          setRole("member")
          toast.success("Invitation sent.")
        },
        onError: (error) => {
          toast.error(
            error instanceof Error ? error.message : "Could not send invitation.",
          )
        },
      },
    )
  }

  return (
    <section className="grid gap-3">
      <div className="space-y-1">
        <h3 className="font-heading text-base leading-snug font-medium">
          Invite member
        </h3>
        <p className="text-sm text-muted-foreground">
          Send an invitation with admin or member access.
        </p>
      </div>
      <form className="grid gap-4" onSubmit={invite}>
        <FieldGroup>
          <Field data-invalid={Boolean(emailError)}>
            <FieldLabel htmlFor="team-invite-email">Email</FieldLabel>
            <Input
              autoComplete="email"
              disabled={!workspaceId || inviteMember.isPending}
              id="team-invite-email"
              onChange={(event) => {
                setEmail(event.target.value)
                if (emailError) {
                  setEmailError("")
                }
              }}
              placeholder="teammate@example.com"
              type="email"
              value={email}
            />
            <FieldError>{emailError}</FieldError>
          </Field>

          <Field>
            <FieldLabel>Role</FieldLabel>
            <Select
              disabled={!workspaceId || inviteMember.isPending}
              onValueChange={(value) => setRole(value as WorkspaceRole)}
              value={role}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>
              Admins can manage workspace settings and invitations.
            </FieldDescription>
          </Field>
        </FieldGroup>

        <Button
          className="w-fit"
          disabled={!canSubmit || inviteMember.isPending}
          type="submit"
        >
          {inviteMember.isPending ? <Spinner /> : <SendIcon />}
          Send invite
        </Button>
      </form>
    </section>
  )
}

function MemberList({
  isLoading,
  members,
}: {
  isLoading: boolean
  members: WorkspaceMember[]
}) {
  if (isLoading) {
    return <RowsSkeleton />
  }

  if (members.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>No members yet</EmptyTitle>
          <EmptyDescription>
            Invited teammates appear here after they join.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ItemGroup className="gap-2">
      {members.map((member) => (
        <MemberRow key={member.memberId} member={member} />
      ))}
    </ItemGroup>
  )
}

function InvitationList({
  invitations,
  isLoading,
}: {
  invitations: WorkspaceInvitation[]
  isLoading: boolean
}) {
  if (isLoading) {
    return <RowsSkeleton />
  }

  if (invitations.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MailPlusIcon />
          </EmptyMedia>
          <EmptyTitle>No pending invitations</EmptyTitle>
          <EmptyDescription>
            New invitations appear here until they are accepted.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ItemGroup className="gap-2">
      {invitations.map((invitation) => (
        <InvitationRow invitation={invitation} key={invitation.id} />
      ))}
    </ItemGroup>
  )
}

function MemberRow({ member }: { member: WorkspaceMember }) {
  return (
    <Item className="min-h-12" variant="outline">
      <ItemMedia className="size-8 rounded-lg bg-muted text-xs font-medium uppercase">
        {getInitials(member.name || member.email)}
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="truncate">{member.name || member.email}</ItemTitle>
        <ItemDescription className="truncate">{member.email}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <RoleBadge role={member.role} />
      </ItemActions>
    </Item>
  )
}

function InvitationRow({
  invitation,
}: {
  invitation: WorkspaceInvitation
}) {
  return (
    <Item className="min-h-12" variant="outline">
      <ItemMedia className="size-8 rounded-lg bg-muted text-muted-foreground">
        <MailPlusIcon className="size-4" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="truncate">{invitation.email}</ItemTitle>
        <ItemDescription className="truncate">
          Expires {formatDate(invitation.expiresAt)}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <RoleBadge role={invitation.role} />
      </ItemActions>
    </Item>
  )
}

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant={role === "admin" || role === "owner" ? "default" : "outline"}>
      {capitalize(role)}
    </Badge>
  )
}

function RowsSkeleton() {
  return (
    <ItemGroup className="gap-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <Item className="min-h-12" key={index} variant="outline">
          <ItemMedia>
            <Skeleton className="size-8 rounded-lg" />
          </ItemMedia>
          <ItemContent>
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-52 max-w-full" />
          </ItemContent>
          <ItemActions>
            <Skeleton className="h-5 w-16 rounded-4xl" />
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  )
}

function useActiveWorkspaceId() {
  const { data: sessionData } = useSession()
  const storedActiveWorkspaceId = useAppStore(
    (state) => state.activeWorkspaceId,
  )

  return sessionData?.session?.activeWorkspaceId ?? storedActiveWorkspaceId
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/)
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")

  return initials || "?"
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "soon"
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}
