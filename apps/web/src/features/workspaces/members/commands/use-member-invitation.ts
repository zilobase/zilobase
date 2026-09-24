import * as React from "react";

import { toast } from "sonner";

import { useInviteWorkspaceMember } from "@zilobase/features/workspaces/react";
import type { InvitableWorkspaceRole } from "@zilobase/features/workspaces";
import { isValidInvitationEmail } from "../model/member-access";

import { getRoleAccessExpiration, getRoleDraftExpiration } from "../model/member-access";
export function useMemberInvitation(workspaceId: string | null | undefined) {
  const inviteMember = useInviteWorkspaceMember();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<InvitableWorkspaceRole>("member");
  const [accessExpiresAt, setAccessExpiresAt] = React.useState("");
  const [emailError, setEmailError] = React.useState("");
  const trimmedEmail = email.trim();
  const canSubmit = Boolean(
    workspaceId && trimmedEmail && (role !== "temporary" || accessExpiresAt),
  );

  const invite = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!workspaceId) {
      toast.error("Select an workspace before inviting a teammate.");
      return;
    }

    if (!isValidInvitationEmail(trimmedEmail)) {
      setEmailError("Enter a valid email address.");
      return;
    }

    setEmailError("");
    inviteMember.mutate(
      {
        accessExpiresAt: getRoleAccessExpiration(role, accessExpiresAt),
        email: trimmedEmail,
        workspaceId,
        role,
      },
      {
        onSuccess: () => {
          setEmail("");
          setRole("member");
          setAccessExpiresAt("");
          toast.success("Invitation sent.");
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Could not send invitation.");
        },
      },
    );
  };

  const changeRole = (value: string) => {
    const role = value as InvitableWorkspaceRole;
    setRole(role);
    setAccessExpiresAt((current) => getRoleDraftExpiration(role, current));
  };
  const changeEmail = (value: string) => {
    setEmail(value);
    if (emailError) setEmailError("");
  };

  return {
    email,
    emailError,
    role,
    accessExpiresAt,
    setAccessExpiresAt,
    canSubmit,
    invite,
    changeRole,
    changeEmail,
    disabled: !workspaceId || inviteMember.isPending,
    pending: inviteMember.isPending,
  };
}
