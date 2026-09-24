import { useTeamspaceManagement } from "../commands/use-teamspace-management";

import { Layers3Icon, UsersIcon } from "@/shared/components/icons";

import { toast } from "sonner";

import { Button } from "@/shared/ui/button";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { IconEmojiPicker } from "@/shared/ui/icon-emoji-picker";
import { Label } from "@/shared/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/app-tabs";
import { Textarea } from "@/shared/ui/textarea";
import { Switch } from "@/shared/ui/switch";
import { getApiErrorMessage } from "@/platform/network/api";
import { PageIconDisplay } from "@/features/pages/index";

import { type Teamspace, type TeamspaceAccessMode } from "@zilobase/features/teamspaces";

import { type TeamspaceSettingsTab } from "../model/teamspace-settings";
export function ManageTeamspaceDialog({
  canInvite,
  canManage,
  initialTab,
  teamspace,
  workspaceId,
  onOpenChange,
}: {
  canInvite: boolean;
  canManage: boolean;
  initialTab: TeamspaceSettingsTab;
  teamspace: Teamspace | null;
  workspaceId: string | null | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const state = useTeamspaceManagement({ teamspace, workspaceId });
  const { save } = state;
  if (!teamspace || !workspaceId) return null;

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{teamspace.name}</DialogTitle>
          <DialogDescription>
            Manage details, members, and collaboration defaults.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={initialTab}>
          <TabsList overflow="scroll" width="full">
            <TabsTrigger disabled={!canManage} value="general">
              General
            </TabsTrigger>
            <TabsTrigger disabled={!canInvite && !canManage} value="members">
              Members
            </TabsTrigger>
            <TabsTrigger disabled={!canManage} value="permissions">
              Permissions
            </TabsTrigger>
            <TabsTrigger disabled={!canManage} value="security">
              Security
            </TabsTrigger>
          </TabsList>
          <TeamspaceGeneralSettings
            teamspace={teamspace}
            workspaceId={workspaceId}
            canInvite={canInvite}
            canManage={canManage}
            onOpenChange={onOpenChange}
            state={state}
          />
          <TeamspaceMemberSettings
            teamspace={teamspace}
            workspaceId={workspaceId}
            canInvite={canInvite}
            canManage={canManage}
            onOpenChange={onOpenChange}
            state={state}
          />
          <TabsContent className="grid gap-4 pt-4" value="permissions">
            <PermissionSelect
              label="Default member page access"
              onChange={(memberAccessLevel) =>
                save({
                  memberAccessLevel,
                  teamspaceId: teamspace.id,
                  workspaceId,
                })
              }
              value={teamspace.memberAccessLevel}
            />
            <PolicySelect
              label="Who can invite members"
              onChange={(invitePolicy) =>
                save({ invitePolicy, teamspaceId: teamspace.id, workspaceId })
              }
              value={teamspace.invitePolicy}
            />
            <PolicySelect
              label="Who can edit the sidebar"
              onChange={(sidebarEditPolicy) =>
                save({
                  sidebarEditPolicy,
                  teamspaceId: teamspace.id,
                  workspaceId,
                })
              }
              value={teamspace.sidebarEditPolicy}
            />
          </TabsContent>
          <TabsContent className="grid gap-4 pt-4" value="security">
            <SecurityToggle
              checked={teamspace.guestsEnabled}
              label="Allow guests"
              onChange={(guestsEnabled) =>
                save({ guestsEnabled, teamspaceId: teamspace.id, workspaceId })
              }
            />
            <SecurityToggle
              checked={teamspace.publicSharingEnabled}
              label="Allow public sharing"
              onChange={(publicSharingEnabled) =>
                save({
                  publicSharingEnabled,
                  teamspaceId: teamspace.id,
                  workspaceId,
                })
              }
            />
            <SecurityToggle
              checked={teamspace.exportEnabled}
              label="Allow export"
              onChange={(exportEnabled) =>
                save({ exportEnabled, teamspaceId: teamspace.id, workspaceId })
              }
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function PermissionSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: "view" | "comment" | "edit" | "full";
  onChange: (value: "view" | "comment" | "edit" | "full") => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label>{label}</Label>
      <Select
        onValueChange={(value) =>
          onChange(value as typeof value & ("view" | "comment" | "edit" | "full"))
        }
        value={value}
      >
        <SelectTrigger aria-label={label} className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="view">Can view</SelectItem>
          <SelectItem value="comment">Can comment</SelectItem>
          <SelectItem value="edit">Can edit</SelectItem>
          <SelectItem value="full">Full access</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function PolicySelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: "owners" | "owners_and_members";
  onChange: (value: "owners" | "owners_and_members") => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label>{label}</Label>
      <Select
        onValueChange={(value) => onChange(value as "owners" | "owners_and_members")}
        value={value}
      >
        <SelectTrigger aria-label={label} className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="owners">Owners only</SelectItem>
          <SelectItem value="owners_and_members">Owners and members</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function SecurityToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label>{label}</Label>
        <p className="text-xs text-content-secondary">
          This is a ceiling for every page and database in the teamspace.
        </p>
      </div>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function TeamspaceGeneralSettings({ teamspace, workspaceId, onOpenChange, state }: SettingsProps) {
  const {
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
    updatePending,
  } = state;
  return (
    <TabsContent className="grid gap-4 pt-4" value="general">
      <div className="grid gap-2">
        <Label>Icon</Label>
        <div className="flex items-center gap-2">
          <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
            <PopoverTrigger asChild>
              <Button className="justify-start" type="button" variant="outline">
                {icon ? <PageIconDisplay size="sm" value={icon} /> : <Layers3Icon />}
                <span>{icon ? "Change icon" : "Add icon"}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <IconEmojiPicker onEmojiSelect={selectIcon} onIconSelect={selectIcon} />
            </PopoverContent>
          </Popover>
          {icon ? (
            <Button onClick={clearIcon} type="button" variant="ghost">
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="manage-teamspace-name">Name</Label>
        <Input
          id="manage-teamspace-name"
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="manage-teamspace-description">Description</Label>
        <Textarea
          id="manage-teamspace-description"
          onChange={(event) => setDescription(event.target.value)}
          value={description}
        />
      </div>
      <div className="grid gap-2">
        <Label>Access</Label>
        <Select
          onValueChange={(value) =>
            save({
              accessMode: value as TeamspaceAccessMode,
              teamspaceId: teamspace.id,
              workspaceId,
            })
          }
          value={teamspace.accessMode}
        >
          <SelectTrigger aria-label="Teamspace access">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="private">Private</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-between gap-3">
        <Button
          disabled={teamspace.isDefault || lifecycle.isPending}
          onClick={() =>
            lifecycle.mutate(
              { action: "archive", teamspaceId: teamspace.id, workspaceId },
              {
                onError: (error) => toast.error(getApiErrorMessage(error)),
                onSuccess: () => onOpenChange(false),
              },
            )
          }
          variant="destructive"
        >
          Archive
        </Button>
        <Button
          disabled={!name.trim() || updatePending}
          onClick={() =>
            save({
              description: description.trim() || null,
              name: name.trim(),
              teamspaceId: teamspace.id,
              workspaceId,
            })
          }
        >
          Save details
        </Button>
      </div>
    </TabsContent>
  );
}

function TeamspaceMemberSettings({ teamspace, canInvite, canManage, state }: SettingsProps) {
  const {
    candidateId,
    setCandidateId,
    candidates,
    principals,
    addCandidate,
    addPending,
    changePrincipal,
    removePrincipal,
    toggleInviteLink,
    inviteLinkPending,
  } = state;
  return (
    <TabsContent className="grid gap-4 pt-4" value="members">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select disabled={!canInvite} onValueChange={setCandidateId} value={candidateId}>
          <SelectTrigger aria-label="Workspace member or sharing group" className="flex-1">
            <SelectValue placeholder="Select a workspace member or group" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((candidate) => (
              <SelectItem
                key={`${candidate.type}:${candidate.id}`}
                value={`${candidate.type}:${candidate.id}`}
              >
                {candidate.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button disabled={!canInvite || !candidateId || addPending} onClick={addCandidate}>
          <UsersIcon />
          Add
        </Button>
      </div>
      <div className="divide-y rounded-md border">
        {principals.map((principal) => (
          <div className="flex flex-wrap items-center gap-3 p-3" key={principal.id}>
            <div className="min-w-48 flex-1">
              <div className="truncate text-sm font-medium">
                {principal.name || principal.email || principal.principalId}
              </div>
              <div className="truncate text-xs text-content-secondary">
                {principal.principalType === "team" ? "Sharing group" : principal.email}
              </div>
            </div>
            <Select
              disabled={!canManage}
              onValueChange={(accessLevelOverride) =>
                changePrincipal({
                  accessLevelOverride:
                    accessLevelOverride === "default"
                      ? null
                      : (accessLevelOverride as "view" | "comment" | "edit" | "full"),
                  principalId: principal.id,
                  role: principal.role,
                })
              }
              value={principal.accessLevelOverride ?? "default"}
            >
              <SelectTrigger
                aria-label={`Content access for ${principal.name || principal.principalId}`}
                className="w-28"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="view">View</SelectItem>
                <SelectItem value="comment">Comment</SelectItem>
                <SelectItem value="edit">Edit</SelectItem>
                <SelectItem value="full">Full</SelectItem>
              </SelectContent>
            </Select>
            <Select
              disabled={!canManage}
              onValueChange={(role) =>
                changePrincipal({
                  principalId: principal.id,
                  role: role as "owner" | "member",
                })
              }
              value={principal.role}
            >
              <SelectTrigger
                aria-label={`Teamspace role for ${principal.name || principal.principalId}`}
                className="w-28"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
              </SelectContent>
            </Select>
            <Button
              aria-label={`Remove ${principal.name || "member or group"}`}
              disabled={!canManage}
              onClick={() => removePrincipal(principal.id)}
              size="sm"
              variant="ghost"
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4 rounded-md border p-3">
        <div>
          <div className="text-sm font-medium">Invite link</div>
          <div className="text-xs text-content-secondary">
            Anyone in this workspace with the link can join.
          </div>
        </div>
        <Button
          disabled={!canManage || inviteLinkPending}
          onClick={toggleInviteLink}
          variant="outline"
        >
          {teamspace.inviteLinkEnabled ? "Disable" : "Enable and copy"}
        </Button>
      </div>
    </TabsContent>
  );
}

type SettingsProps = {
  teamspace: Teamspace;
  workspaceId: string;
  canInvite: boolean;
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
  state: ReturnType<typeof useTeamspaceManagement>;
};
