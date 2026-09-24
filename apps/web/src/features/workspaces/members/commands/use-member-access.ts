import * as React from "react";

import { toast } from "sonner";

import {
  useRemoveWorkspaceMember,
  useUpdateWorkspaceMember,
} from "@zilobase/features/workspaces/react";
import type { WorkspaceMember, WorkspaceRole } from "@zilobase/features/workspaces";
import { isoToLocalDateTime, normalizeWorkspaceRole } from "../model/member-access";

import {
  canEditWorkspaceMember,
  getRoleAccessExpiration,
  getRoleDraftExpiration,
} from "../model/member-access";
export function useMemberAccess({
  actorRole,
  canManage,
  member,
  workspaceId,
}: {
  actorRole: WorkspaceRole | null;
  canManage: boolean;
  member: WorkspaceMember;
  workspaceId: string | null | undefined;
}) {
  const updateMember = useUpdateWorkspaceMember();
  const removeMember = useRemoveWorkspaceMember();
  const memberRole = normalizeWorkspaceRole(member.role) ?? "member";
  const [editing, setEditing] = React.useState(false);
  const [draftRole, setDraftRole] = React.useState<WorkspaceRole>(memberRole);
  const [draftExpiration, setDraftExpiration] = React.useState(
    member.accessExpiresAt ? isoToLocalDateTime(member.accessExpiresAt) : "",
  );
  const actorCanEdit = canEditWorkspaceMember({
    canManage,
    workspaceId,
    memberRole,
    actorRole,
  });

  React.useEffect(() => {
    setDraftRole(memberRole);
    setDraftExpiration(member.accessExpiresAt ? isoToLocalDateTime(member.accessExpiresAt) : "");
  }, [member.accessExpiresAt, memberRole]);

  const save = () => {
    if (!workspaceId) return;

    updateMember.mutate(
      {
        accessExpiresAt: getRoleAccessExpiration(draftRole, draftExpiration),
        memberId: member.memberId,
        role: draftRole,
        workspaceId,
      },
      {
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Could not update member."),
        onSuccess: () => {
          setEditing(false);
          toast.success("Member access updated.");
        },
      },
    );
  };

  const remove = () => {
    if (
      !workspaceId ||
      !window.confirm(`Remove ${member.name || member.email} from this workspace?`)
    ) {
      return;
    }

    removeMember.mutate(
      { memberId: member.memberId, workspaceId },
      {
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Could not remove member."),
        onSuccess: () => toast.success("Member removed."),
      },
    );
  };

  const changeRole = (value: string) => {
    const role = value as WorkspaceRole;
    setDraftRole(role);
    setDraftExpiration((current) => getRoleDraftExpiration(role, current));
  };

  return {
    actorCanEdit,
    editing,
    setEditing,
    draftRole,
    draftExpiration,
    setDraftExpiration,
    changeRole,
    save,
    remove,
    updatePending: updateMember.isPending,
    removePending: removeMember.isPending,
  };
}
