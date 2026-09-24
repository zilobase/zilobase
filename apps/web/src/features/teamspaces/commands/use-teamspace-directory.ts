import { isTeamspaceSettingsTab, type TeamspaceSettingsTab } from "../model/teamspace-settings";
import { useEffect, useMemo, useState } from "react";

import { useLocation, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { getApiErrorMessage } from "@/platform/network/api";

import { filterTeamspaces } from "../model/teamspace-filters";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import { type Teamspace, type TeamspaceAccessMode } from "@zilobase/features/teamspaces";
import {
  useAcceptTeamspaceInvite,
  useArchivedTeamspaces,
  useSetTeamspaceMembership,
  useTeamspaces,
  useTeamspaceSettings,
  useTeamspaceLifecycle,
  useUpdateTeamspaceSettings,
  useUpdateTeamspaceDefaults,
} from "@zilobase/features/teamspaces/react";

export function useTeamspaceDirectory() {
  const location = useLocation();
  const navigate = useNavigate();
  const workspaceId = useActiveWorkspaceId();
  const { data: teamspaces = [], isPending } = useTeamspaces(workspaceId);
  const { data: archivedTeamspaces = [] } = useArchivedTeamspaces(workspaceId);
  const { data: settings } = useTeamspaceSettings(workspaceId);
  const updateSettings = useUpdateTeamspaceSettings();
  const membership = useSetTeamspaceMembership();
  const lifecycle = useTeamspaceLifecycle();
  const defaults = useUpdateTeamspaceDefaults();
  const acceptInvite = useAcceptTeamspaceInvite();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Teamspace | null>(null);
  const [selectedTab, setSelectedTab] = useState<TeamspaceSettingsTab>("general");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [accessFilter, setAccessFilter] = useState<"all" | TeamspaceAccessMode>("all");
  const [membershipFilter, setMembershipFilter] = useState<
    "all" | "joined" | "available" | "ownerless"
  >("all");
  const filteredTeamspaces = useMemo(
    () =>
      filterTeamspaces(teamspaces, {
        accessMode: accessFilter,
        membership: membershipFilter,
        query,
      }),
    [accessFilter, membershipFilter, query, teamspaces],
  );
  const routeSearch = location.search as Record<string, unknown>;
  const requestedTeamspaceId =
    location.pathname === "/settings/teamspaces" && typeof routeSearch.teamspace === "string"
      ? routeSearch.teamspace
      : null;
  const requestedTab = isTeamspaceSettingsTab(routeSearch.tab) ? routeSearch.tab : "general";

  useEffect(() => {
    if (!requestedTeamspaceId) return;
    const requestedTeamspace = teamspaces.find(
      (teamspace) => teamspace.id === requestedTeamspaceId,
    );
    if (!requestedTeamspace) return;
    setSelected(requestedTeamspace);
    setSelectedTab(requestedTab);
  }, [requestedTab, requestedTeamspaceId, teamspaces]);

  const closeManageDialog = () => {
    setSelected(null);
    if (location.pathname !== "/settings/teamspaces") return;
    void navigate({
      replace: true,
      search: (current) => ({
        ...current,
        tab: undefined,
        teamspace: undefined,
      }),
      to: "/settings/teamspaces",
    });
  };

  const archiveSelected = async () => {
    if (!workspaceId || selectedIds.size === 0) return;
    try {
      for (const teamspaceId of selectedIds) {
        await lifecycle.mutateAsync({
          action: "archive",
          teamspaceId,
          workspaceId,
        });
      }
      setSelectedIds(new Set());
      toast.success("Selected teamspaces archived.");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  useEffect(() => {
    if (!workspaceId || acceptInvite.isPending || acceptInvite.isSuccess) return;
    const token = new URLSearchParams(window.location.search).get("invite");
    const inviteWorkspaceId = new URLSearchParams(window.location.search).get("workspace");
    if (!token || inviteWorkspaceId !== workspaceId) return;
    acceptInvite.mutate(
      { token, workspaceId },
      {
        onError: (error) => toast.error(getApiErrorMessage(error)),
        onSuccess: () => toast.success("Joined teamspace."),
      },
    );
  }, [acceptInvite, workspaceId]);

  return {
    workspaceId,
    teamspaces,
    archivedTeamspaces,
    settings,
    isPending,
    updateSettings,
    membership,
    lifecycle,
    defaults,
    createOpen,
    setCreateOpen,
    selected,
    setSelected,
    selectedTab,
    setSelectedTab,
    selectedIds,
    setSelectedIds,
    query,
    setQuery,
    accessFilter,
    setAccessFilter,
    membershipFilter,
    setMembershipFilter,
    filteredTeamspaces,
    closeManageDialog,
    archiveSelected,
  };
}
