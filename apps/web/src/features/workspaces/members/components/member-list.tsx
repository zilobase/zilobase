import { useMemberAccess } from "../commands/use-member-access";

import { CalendarClockIcon, Trash2Icon, UsersIcon } from "@/shared/components/icons";

import { Button } from "@/shared/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/ui/empty";

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

import type { WorkspaceMember, WorkspaceRole } from "@zilobase/features/workspaces";

import {
  getMaximumTemporaryExpiration,
  getMinimumTemporaryExpiration,
} from "../model/member-access";

import { getInitials, formatDate } from "../model/member-presentation";
import { RoleBadge } from "./member-role-badge";
import { RowsSkeleton } from "./member-list-skeleton";

export function MemberList({
  actorRole,
  canManage,
  currentUserId,
  isLoading,
  members,
  workspaceId,
}: {
  actorRole: WorkspaceRole | null;
  canManage: boolean;
  currentUserId: string | null;
  isLoading: boolean;
  members: WorkspaceMember[];
  workspaceId: string | null | undefined;
}) {
  if (isLoading) {
    return <RowsSkeleton />;
  }

  if (members.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>No members yet</EmptyTitle>
          <EmptyDescription>Invited teammates appear here after they join.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ItemGroup className="gap-2">
      {members.map((member) => (
        <MemberRow
          actorRole={actorRole}
          canManage={canManage}
          currentUserId={currentUserId}
          key={member.memberId}
          member={member}
          workspaceId={workspaceId}
        />
      ))}
    </ItemGroup>
  );
}

function MemberRow({
  actorRole,
  canManage,
  currentUserId,
  member,
  workspaceId,
}: {
  actorRole: WorkspaceRole | null;
  canManage: boolean;
  currentUserId: string | null;
  member: WorkspaceMember;
  workspaceId: string | null | undefined;
}) {
  const controls = useMemberAccess({
    actorRole,
    canManage,
    member,
    workspaceId,
  });
  const { editing, actorCanEdit, setEditing } = controls;
  return (
    <Item className="min-h-12" variant="outline">
      <ItemMedia className="size-8 rounded-lg bg-surface-muted text-xs font-medium uppercase">
        {getInitials(member.name || member.email)}
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="truncate">{member.name || member.email}</ItemTitle>
        <ItemDescription className="truncate">
          {member.email}
          {member.accessExpiresAt ? ` · Expires ${formatDate(member.accessExpiresAt)}` : ""}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {editing && actorCanEdit ? (
          <MemberAccessEditor
            actorRole={actorRole}
            currentUserId={currentUserId}
            member={member}
            controls={controls}
          />
        ) : (
          <div className="flex items-center gap-2">
            <RoleBadge role={member.role} />
            {actorCanEdit ? (
              <Button onClick={() => setEditing(true)} size="sm" type="button" variant="ghost">
                Manage
              </Button>
            ) : null}
          </div>
        )}
      </ItemActions>
    </Item>
  );
}

function MemberAccessEditor({
  actorRole,
  currentUserId,
  member,
  controls,
}: {
  actorRole: WorkspaceRole | null;
  currentUserId: string | null;
  member: WorkspaceMember;
  controls: ReturnType<typeof useMemberAccess>;
}) {
  const {
    setEditing,
    draftRole,
    draftExpiration,
    setDraftExpiration,
    changeRole,
    save,
    remove,
    updatePending,
    removePending,
  } = controls;
  return (
    <div className="flex max-w-sm flex-wrap items-center justify-end gap-2">
      <Select disabled={updatePending} onValueChange={changeRole} value={draftRole}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {actorRole === "owner" ? <SelectItem value="owner">Owner</SelectItem> : null}
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="member">Member</SelectItem>
          <SelectItem value="temporary">Temporary</SelectItem>
        </SelectContent>
      </Select>
      {draftRole === "temporary" ? (
        <Input
          aria-label="Temporary access expiration"
          className="w-52"
          max={getMaximumTemporaryExpiration()}
          min={getMinimumTemporaryExpiration()}
          onChange={(event) => setDraftExpiration(event.target.value)}
          type="datetime-local"
          value={draftExpiration}
        />
      ) : null}
      <Button
        disabled={updatePending || (draftRole === "temporary" && !draftExpiration)}
        onClick={save}
        size="sm"
        type="button"
      >
        {updatePending ? <Spinner /> : <CalendarClockIcon />}
        Save
      </Button>
      <Button
        disabled={updatePending}
        onClick={() => setEditing(false)}
        size="sm"
        type="button"
        variant="ghost"
      >
        Cancel
      </Button>
      {member.id !== currentUserId ? (
        <Button
          aria-label={`Remove ${member.name || member.email}`}
          disabled={removePending}
          onClick={remove}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2Icon />
        </Button>
      ) : null}
    </div>
  );
}
