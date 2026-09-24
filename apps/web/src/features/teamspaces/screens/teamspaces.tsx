import { getTeamspaceManagementPermissions } from "../model/teamspace-settings";
import { useTeamspaceDirectory } from "../commands/use-teamspace-directory";
import { CreateTeamspaceDialog } from "../components/create-teamspace-dialog";
import { ManageTeamspaceDialog } from "../components/manage-teamspace-dialog";

import { Layers3Icon, MoreHorizontalIcon, PlusIcon } from "@/shared/components/icons";

import { toast } from "sonner";

import { SettingsHeader } from "@/features/settings";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";

import { Input } from "@/shared/ui/input";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Separator } from "@/shared/ui/separator";
import { Spinner } from "@/shared/ui/spinner";

import { getApiErrorMessage } from "@/platform/network/api";
import { PageIconDisplay } from "@/features/pages/index";

import { type Teamspace, type TeamspaceAccessMode } from "@zilobase/features/teamspaces";

export default function TeamspacesSettingsPage() {
  const directory = useTeamspaceDirectory();
  const {
    workspaceId,
    teamspaces,
    archivedTeamspaces,
    settings,
    isPending,
    updateSettings,
    lifecycle,
    createOpen,
    setCreateOpen,
    selected,
    selectedTab,
    selectedIds,
    query,
    setQuery,
    accessFilter,
    setAccessFilter,
    membershipFilter,
    setMembershipFilter,
    filteredTeamspaces,
    closeManageDialog,
    archiveSelected,
  } = directory;

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
              <p className="text-sm text-content-secondary">
                Choose who can create teamspaces in this workspace.
              </p>
            </div>
            <Select
              disabled={!settings?.canManage || updateSettings.isPending}
              onValueChange={(value) => {
                if (!workspaceId) return;
                updateSettings.mutate(
                  {
                    creationPolicy: value as "workspace_owners" | "workspace_members",
                    workspaceId,
                  },
                  {
                    onError: (error) => toast.error(getApiErrorMessage(error)),
                    onSuccess: () => toast.success("Teamspace policy updated."),
                  },
                );
              }}
              value={settings?.creationPolicy ?? "workspace_members"}
            >
              <SelectTrigger aria-label="Who can create teamspaces" className="w-52">
                <SelectValue />
              </SelectTrigger>
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
              <p className="text-sm text-content-secondary">
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
            <Select
              onValueChange={(value) => setAccessFilter(value as "all" | TeamspaceAccessMode)}
              value={accessFilter}
            >
              <SelectTrigger aria-label="Filter by access" className="sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All access</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value) => setMembershipFilter(value as typeof membershipFilter)}
              value={membershipFilter}
            >
              <SelectTrigger aria-label="Filter by membership" className="sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All membership</SelectItem>
                <SelectItem value="joined">Joined</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                {settings?.canManage ? <SelectItem value="ownerless">Ownerless</SelectItem> : null}
              </SelectContent>
            </Select>
            {settings?.canManage && selectedIds.size > 0 ? (
              <Button
                disabled={lifecycle.isPending}
                onClick={archiveSelected}
                variant="destructive"
              >
                Archive selected ({selectedIds.size})
              </Button>
            ) : null}
          </div>
          {isPending ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : teamspaces.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-content-secondary">
              No teamspaces yet. Create one for a team or project.
            </div>
          ) : filteredTeamspaces.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-content-secondary">
              No teamspaces match these filters.
            </div>
          ) : (
            <div className="divide-y rounded-lg border">
              {filteredTeamspaces.map((teamspace) => (
                <TeamspaceDirectoryRow
                  key={teamspace.id}
                  teamspace={teamspace}
                  directory={directory}
                />
              ))}
            </div>
          )}
        </section>
        {settings?.canManage && archivedTeamspaces.length > 0 ? (
          <>
            <Separator />
            <section className="grid gap-3">
              <div>
                <h3 className="font-heading text-base font-medium">Archived</h3>
                <p className="text-sm text-content-secondary">Restore a teamspace and its pages.</p>
              </div>
              <div className="divide-y rounded-lg border">
                {archivedTeamspaces.map((teamspace) => (
                  <div className="flex items-center gap-3 p-4" key={teamspace.id}>
                    <span className="min-w-0 flex-1 truncate font-medium">{teamspace.name}</span>
                    <Button
                      disabled={lifecycle.isPending}
                      onClick={() =>
                        lifecycle.mutate(
                          {
                            action: "restore",
                            teamspaceId: teamspace.id,
                            workspaceId: workspaceId!,
                          },
                          {
                            onError: (error) => toast.error(getApiErrorMessage(error)),
                          },
                        )
                      }
                      size="sm"
                      variant="outline"
                    >
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
      <CreateTeamspaceDialog
        onOpenChange={setCreateOpen}
        open={createOpen}
        workspaceId={workspaceId}
      />
      <ManageTeamspaceDialog
        canInvite={Boolean(
          selected?.currentUserRole === "owner" ||
          (selected?.currentUserRole === "member" &&
            selected.invitePolicy === "owners_and_members"),
        )}
        canManage={Boolean(settings?.canManage || selected?.currentUserRole === "owner")}
        initialTab={selectedTab}
        key={selected ? `${selected.id}:${selectedTab}` : "closed"}
        onOpenChange={(open) => !open && closeManageDialog()}
        teamspace={selected}
        workspaceId={workspaceId}
      />
    </main>
  );
}

function TeamspaceDirectoryRow({
  teamspace,
  directory,
}: {
  teamspace: Teamspace;
  directory: ReturnType<typeof useTeamspaceDirectory>;
}) {
  const { settings, selectedIds, setSelectedIds } = directory;
  return (
    <div className="flex flex-wrap items-center gap-3 p-4" key={teamspace.id}>
      {settings?.canManage && !teamspace.isDefault ? (
        <Checkbox
          aria-label={`Select ${teamspace.name}`}
          checked={selectedIds.has(teamspace.id)}
          onCheckedChange={(checked) =>
            setSelectedIds((current) => {
              const next = new Set(current);
              if (checked) next.add(teamspace.id);
              else next.delete(teamspace.id);
              return next;
            })
          }
        />
      ) : null}
      <div className="flex size-9 items-center justify-center rounded-md bg-surface-muted">
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
        <p className="truncate text-sm text-content-secondary">
          {teamspace.memberCount ?? 0} members
          {teamspace.description ? ` · ${teamspace.description}` : ""}
        </p>
      </div>
      <TeamspaceMembershipActions teamspace={teamspace} directory={directory} />
      <TeamspaceManagementActions teamspace={teamspace} directory={directory} />
    </div>
  );
}

function TeamspaceMembershipActions({
  teamspace,
  directory,
}: {
  teamspace: Teamspace;
  directory: ReturnType<typeof useTeamspaceDirectory>;
}) {
  const { membership, workspaceId } = directory;
  return (
    <>
      {teamspace.currentUserRole ? (
        !teamspace.isDefault ? (
          <Button
            disabled={membership.isPending}
            onClick={() =>
              workspaceId &&
              membership.mutate(
                { action: "leave", teamspaceId: teamspace.id, workspaceId },
                { onError: (error) => toast.error(getApiErrorMessage(error)) },
              )
            }
            size="sm"
            variant="ghost"
          >
            Leave
          </Button>
        ) : null
      ) : teamspace.accessMode === "open" ? (
        <Button
          disabled={membership.isPending}
          onClick={() =>
            workspaceId &&
            membership.mutate(
              { action: "join", teamspaceId: teamspace.id, workspaceId },
              { onError: (error) => toast.error(getApiErrorMessage(error)) },
            )
          }
          size="sm"
          variant="outline"
        >
          Join
        </Button>
      ) : null}
    </>
  );
}

function TeamspaceManagementActions({
  teamspace,
  directory,
}: {
  teamspace: Teamspace;
  directory: ReturnType<typeof useTeamspaceDirectory>;
}) {
  const { settings, workspaceId, setSelectedTab, setSelected, defaults, lifecycle } = directory;
  const { canManage, canSetDefault, canRecoverOwner } = getTeamspaceManagementPermissions(
    teamspace,
    Boolean(settings?.canManage),
  );
  return (
    <>
      {canManage ? (
        <Button
          aria-label={`Manage ${teamspace.name}`}
          onClick={() => {
            setSelectedTab("general");
            setSelected(teamspace);
          }}
          size="icon-sm"
          variant="ghost"
        >
          <MoreHorizontalIcon />
        </Button>
      ) : null}
      {canSetDefault ? (
        <Button
          disabled={defaults.isPending}
          onClick={() =>
            defaults.mutate(
              {
                defaultTeamspaceIds: [teamspace.id],
                workspaceId: workspaceId!,
              },
              {
                onError: (error) => toast.error(getApiErrorMessage(error)),
                onSuccess: () => toast.success("Default teamspace updated."),
              },
            )
          }
          size="sm"
          variant="ghost"
        >
          Make default
        </Button>
      ) : null}
      {canRecoverOwner ? (
        <Button
          disabled={lifecycle.isPending}
          onClick={() =>
            lifecycle.mutate(
              {
                action: "recover-owner",
                teamspaceId: teamspace.id,
                workspaceId: workspaceId!,
              },
              {
                onError: (error) => toast.error(getApiErrorMessage(error)),
                onSuccess: () => toast.success("Teamspace ownership recovered."),
              },
            )
          }
          size="sm"
          variant="outline"
        >
          Recover owner
        </Button>
      ) : null}
    </>
  );
}
