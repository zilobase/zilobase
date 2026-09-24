import { useMemberInvitation } from "../commands/use-member-invitation";

import { MailPlusIcon, SendIcon } from "@/shared/components/icons";

import { Button } from "@/shared/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/shared/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

import { Spinner } from "@/shared/ui/spinner";

import type { WorkspaceInvitation } from "@zilobase/features/workspaces";

import {
  getMaximumTemporaryExpiration,
  getMinimumTemporaryExpiration,
} from "../model/member-access";

import { formatDate } from "../model/member-presentation";
import { RoleBadge } from "./member-role-badge";
import { RowsSkeleton } from "./member-list-skeleton";

export function InviteMemberSection({ workspaceId }: { workspaceId: string | null | undefined }) {
  const {
    email,
    emailError,
    role,
    accessExpiresAt,
    setAccessExpiresAt,
    canSubmit,
    invite,
    changeRole,
    changeEmail,
    disabled,
    pending,
  } = useMemberInvitation(workspaceId);
  return (
    <section className="grid gap-3">
      <div className="space-y-1">
        <h3 className="font-heading text-base leading-snug font-medium">Invite member</h3>
        <p className="text-sm text-content-secondary">
          Invite a permanent teammate or grant time-limited workspace access.
        </p>
      </div>
      <form className="grid gap-4" onSubmit={invite}>
        <FieldGroup>
          <Field data-invalid={Boolean(emailError)}>
            <FieldLabel htmlFor="team-invite-email">Email</FieldLabel>
            <Input
              autoComplete="email"
              disabled={disabled}
              id="team-invite-email"
              onChange={(event) => changeEmail(event.target.value)}
              placeholder="teammate@example.com"
              type="email"
              value={email}
            />
            <FieldError>{emailError}</FieldError>
          </Field>

          <Field>
            <FieldLabel>Role</FieldLabel>
            <Select disabled={disabled} onValueChange={changeRole} value={role}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="temporary">Temporary</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>
              Temporary members have normal member access until their deadline.
            </FieldDescription>
          </Field>

          {role === "temporary" ? (
            <Field>
              <FieldLabel htmlFor="team-invite-expiration">Access expiration</FieldLabel>
              <Input
                disabled={disabled}
                id="team-invite-expiration"
                max={getMaximumTemporaryExpiration()}
                min={getMinimumTemporaryExpiration()}
                onChange={(event) => setAccessExpiresAt(event.target.value)}
                required
                type="datetime-local"
                value={accessExpiresAt}
              />
              <FieldDescription>
                Required for temporary members and limited to one year.
              </FieldDescription>
            </Field>
          ) : null}
        </FieldGroup>

        <Button className="w-fit" disabled={!canSubmit || pending} type="submit">
          {pending ? <Spinner /> : <SendIcon />}
          Send invite
        </Button>
      </form>
    </section>
  );
}

export function InvitationList({
  invitations,
  isLoading,
}: {
  invitations: WorkspaceInvitation[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return <RowsSkeleton />;
  }

  if (invitations.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MailPlusIcon />
          </EmptyMedia>
          <EmptyTitle>No pending invitations</EmptyTitle>
          <EmptyDescription>New invitations appear here until they are accepted.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ItemGroup className="gap-2">
      {invitations.map((invitation) => (
        <InvitationRow invitation={invitation} key={invitation.id} />
      ))}
    </ItemGroup>
  );
}

function InvitationRow({ invitation }: { invitation: WorkspaceInvitation }) {
  return (
    <Item className="min-h-12" variant="outline">
      <ItemMedia className="size-8 rounded-lg bg-surface-muted text-content-secondary">
        <MailPlusIcon className="size-4" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="truncate">{invitation.email}</ItemTitle>
        <ItemDescription className="truncate">
          Expires {formatDate(invitation.expiresAt)}
          {invitation.membershipExpiresAt
            ? ` · Access ends ${formatDate(invitation.membershipExpiresAt)}`
            : ""}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <RoleBadge role={invitation.role} />
      </ItemActions>
    </Item>
  );
}
