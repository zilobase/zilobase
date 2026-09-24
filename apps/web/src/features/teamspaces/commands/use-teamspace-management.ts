import { useEffect, useMemo, useState } from "react";

import { toast } from "sonner";

import { getApiErrorMessage } from "@/platform/network/api";

import { type Teamspace } from "@zilobase/features/teamspaces";
import {
  useAddTeamspacePrincipal,
  useRemoveTeamspacePrincipal,
  useTeamspacePrincipals,
  useTeamspaceLifecycle,
  useUpdateTeamspace,
  useUpdateTeamspacePrincipal,
  useUpdateTeamspaceInviteLink,
} from "@zilobase/features/teamspaces/react";
import { useWorkspaceAccessTargets } from "@zilobase/features/workspaces/react";

export function useTeamspaceManagement({
  teamspace,
  workspaceId,
}: {
  teamspace: Teamspace | null;
  workspaceId: string | null | undefined;
}) {
  const update = useUpdateTeamspace();
  const add = useAddTeamspacePrincipal();
  const updatePrincipal = useUpdateTeamspacePrincipal();
  const remove = useRemoveTeamspacePrincipal();
  const lifecycle = useTeamspaceLifecycle();
  const inviteLink = useUpdateTeamspaceInviteLink();
  const { data: principals = [] } = useTeamspacePrincipals(workspaceId, teamspace?.id);
  const { data: targets } = useWorkspaceAccessTargets(workspaceId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [icon, setIcon] = useState("");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  useEffect(() => {
    setName(teamspace?.name ?? "");
    setDescription(teamspace?.description ?? "");
    setIcon(typeof teamspace?.icon === "string" ? teamspace.icon : "");
  }, [teamspace]);

  const candidates = useMemo(() => {
    const memberIds = new Set(principals.map((principal) => principal.principalId));
    return [
      ...(targets?.members ?? [])
        .filter((member) => !memberIds.has(member.id))
        .map((member) => ({
          id: member.id,
          label: `${member.name} · ${member.email}`,
          type: "user" as const,
        })),
      ...(targets?.teams ?? [])
        .filter((team) => !memberIds.has(team.id))
        .map((team) => ({
          id: team.id,
          label: `${team.name} · group`,
          type: "team" as const,
        })),
    ];
  }, [principals, targets]);

  const save = (patch: Parameters<typeof update.mutate>[0]) =>
    update.mutate(patch, {
      onError: (error) => toast.error(getApiErrorMessage(error)),
      onSuccess: () => toast.success("Teamspace updated."),
    });

  const selectIcon = (nextIcon: string) => {
    if (!teamspace || !workspaceId) return;
    setIcon(nextIcon);
    setIconPickerOpen(false);
    save({ icon: nextIcon, teamspaceId: teamspace.id, workspaceId });
  };
  const clearIcon = () => {
    if (!teamspace || !workspaceId) return;
    setIcon("");
    save({ icon: null, teamspaceId: teamspace.id, workspaceId });
  };
  const addCandidate = () => {
    if (!teamspace || !workspaceId) return;
    const [principalType, principalId] = candidateId.split(":") as ["user" | "team", string];
    add.mutate(
      {
        principalType,
        role: "member",
        teamspaceId: teamspace.id,
        userId: principalId,
        workspaceId,
      },
      {
        onError: (error) => toast.error(getApiErrorMessage(error)),
        onSuccess: () => setCandidateId(""),
      },
    );
  };
  const changePrincipal = (
    patch: Omit<Parameters<typeof updatePrincipal.mutate>[0], "teamspaceId" | "workspaceId">,
  ) => {
    if (!teamspace || !workspaceId) return;
    updatePrincipal.mutate(
      { ...patch, teamspaceId: teamspace.id, workspaceId },
      { onError: (error) => toast.error(getApiErrorMessage(error)) },
    );
  };
  const removePrincipal = (principalId: string) => {
    if (!teamspace || !workspaceId) return;
    remove.mutate(
      { principalId, teamspaceId: teamspace.id, workspaceId },
      { onError: (error) => toast.error(getApiErrorMessage(error)) },
    );
  };
  const toggleInviteLink = () => {
    if (!teamspace || !workspaceId) return;
    inviteLink.mutate(
      {
        enabled: !teamspace.inviteLinkEnabled,
        teamspaceId: teamspace.id,
        workspaceId,
      },
      {
        onError: (error) => toast.error(getApiErrorMessage(error)),
        onSuccess: (result) => {
          if (result.token) {
            const url = `${window.location.origin}/settings/teamspaces?workspace=${encodeURIComponent(workspaceId)}&invite=${encodeURIComponent(result.token)}`;
            void navigator.clipboard?.writeText(url);
            toast.success("Invite link copied.");
          } else {
            toast.success("Invite link disabled.");
          }
        },
      },
    );
  };
  return {
    name,
    setName,
    description,
    setDescription,
    icon,
    iconPickerOpen,
    setIconPickerOpen,
    selectIcon,
    clearIcon,
    save,
    lifecycle,
    updatePending: update.isPending,
    candidateId,
    setCandidateId,
    candidates,
    principals,
    addCandidate,
    addPending: add.isPending,
    changePrincipal,
    removePrincipal,
    toggleInviteLink,
    inviteLinkPending: inviteLink.isPending,
  };
}
