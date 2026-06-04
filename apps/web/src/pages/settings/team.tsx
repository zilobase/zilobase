import * as React from "react"
import { MailPlusIcon, SendIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import { SettingsHeader } from "@/components/settings-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Spinner } from "@/components/ui/spinner"
import { useSession } from "@/features/auth/hooks"
import {
  useInviteOrganizationMember,
  useOrganizationAccessTargets,
  useOrganizationInvitations,
} from "@/features/organizations/hooks"
import type {
  OrganizationInvitation,
  OrganizationMember,
  OrganizationRole,
} from "@/features/organizations/queries"
import { useAppStore } from "@/stores/app-store"

export default function TeamSettingsPage() {
  const activeOrganizationId = useActiveOrganizationId()
  const { data: accessTargets, isLoading: isLoadingAccessTargets } =
    useOrganizationAccessTargets(activeOrganizationId)
  const { data: invitations, isLoading: isLoadingInvitations } =
    useOrganizationInvitations(activeOrganizationId)

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        title="Team"
        description="Invite collaborators and manage team access."
      />

      <div className="mx-auto grid w-full max-w-4xl gap-4">
        <InviteMemberCard organizationId={activeOrganizationId} />

        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              People with access to this organization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MemberList
              isLoading={isLoadingAccessTargets}
              members={accessTargets?.members ?? []}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
            <CardDescription>
              Invitations waiting to be accepted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InvitationList
              invitations={(invitations ?? []).filter(
                (invitation) => invitation.status === "pending",
              )}
              isLoading={isLoadingInvitations}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function InviteMemberCard({
  organizationId,
}: {
  organizationId: string | null | undefined
}) {
  const inviteMember = useInviteOrganizationMember()
  const [email, setEmail] = React.useState("")
  const [role, setRole] = React.useState<OrganizationRole>("member")
  const [emailError, setEmailError] = React.useState("")
  const trimmedEmail = email.trim()
  const canSubmit = Boolean(organizationId && trimmedEmail)

  const invite = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!organizationId) {
      toast.error("Select an organization before inviting a teammate.")
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
        organizationId,
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
    <Card>
      <CardHeader>
        <CardTitle>Invite member</CardTitle>
        <CardDescription>
          Send an invitation with admin or member access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={invite}>
          <FieldGroup>
            <Field data-invalid={Boolean(emailError)}>
              <FieldLabel htmlFor="team-invite-email">Email</FieldLabel>
              <Input
                autoComplete="email"
                disabled={!organizationId || inviteMember.isPending}
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
                disabled={!organizationId || inviteMember.isPending}
                onValueChange={(value) => setRole(value as OrganizationRole)}
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
                Admins can manage organization settings and invitations.
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
      </CardContent>
    </Card>
  )
}

function MemberList({
  isLoading,
  members,
}: {
  isLoading: boolean
  members: OrganizationMember[]
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
  invitations: OrganizationInvitation[]
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

function MemberRow({ member }: { member: OrganizationMember }) {
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
  invitation: OrganizationInvitation
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

function useActiveOrganizationId() {
  const { data: sessionData } = useSession()
  const storedActiveOrganizationId = useAppStore(
    (state) => state.activeOrganizationId,
  )

  return sessionData?.session?.activeOrganizationId ?? storedActiveOrganizationId
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
