import { sharingActionAvailability } from "../model/draft-actions";
import type { useSettingsDraft } from "../use-settings-draft";
import { ChevronsUpDownIcon, Trash2Icon } from "@/shared/components/icons";
import * as React from "react";
import { toast } from "sonner";

import { type AiAgentProfileDetail } from "@zilobase/features/ai-chat";
import { useArchiveAiAgentProfile, useTransferAiAgentProfile } from "@zilobase/features/ai-chat/react";
import { usePageAccessTargets } from "@zilobase/features/pages/react";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/command";
import { Input } from "@/shared/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

export function AgentSharePopover({
  agent,
  draft,
  anchor,
  onClose,
}: {
  agent: AiAgentProfileDetail;
  draft: ReturnType<typeof useSettingsDraft>;
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const effectiveAgent = {
    ...agent,
    access: (draft.state?.definition.grants ?? agent.access).map((grant) => ({
      ...grant,
      id: `${grant.principalType}:${grant.principalId}`,
    })),
  };
  const { actionsDisabled } = sharingActionAvailability(draft);
  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <PopoverAnchor virtualRef={{ current: anchor }} />
      <PopoverContent
        align="end"
        className="w-[min(36rem,calc(100vw-2rem))] p-4"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (anchor.contains(event.target as Node)) event.preventDefault();
        }}
      >
        <div className="mb-4 grid gap-1.5">
          <div className="font-semibold leading-none tracking-tight">
            Share agent
          </div>
          <div className="text-sm text-content-secondary">
            Members can chat with this agent using the agent's own explicitly
            granted access.
          </div>
        </div>
        <AgentShare
          agent={effectiveAgent}
          draft={draft}
          showLifecycle={false}
        />
        {draft.error && (
          <p role="alert" className="mt-3 text-sm text-feedback-danger-text">
            {draft.error}
          </p>
        )}
        {draft.state?.canEdit && (
          <div className="mt-4 flex items-center justify-end gap-2 border-t border-stroke-default pt-3">
            <span className="mr-auto text-xs text-content-secondary">
              {draft.dirty ? "Unsaved agent changes" : "All changes saved"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={actionsDisabled}
              onClick={() => draft.discard.mutate()}
            >
              Discard
            </Button>
            <Button
              size="sm"
              disabled={actionsDisabled}
              onClick={() =>
                draft.publish.mutate(undefined, {
                  onSuccess: (result) => {
                    if (result.runError) toast.error(result.runError);
                    else onClose();
                  },
                })
              }
            >
              Save changes
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function AgentShare({
  agent,
  showLifecycle = true,
  draft,
}: {
  agent: AiAgentProfileDetail;
  draft: ReturnType<typeof useSettingsDraft>;
  showLifecycle?: boolean;
}) {
  const workspaceId = useActiveWorkspaceId();
  const targets = usePageAccessTargets(workspaceId);
  const transferOwnership = useTransferAiAgentProfile(agent.id);
  const archiveAgent = useArchiveAiAgentProfile(agent.id);
  const [principalId, setPrincipalId] = React.useState("");
  const [principalType, setPrincipalType] = React.useState<"user" | "team">(
    "user",
  );
  const [targetPickerOpen, setTargetPickerOpen] = React.useState(false);
  const [role, setRole] = React.useState<"editor" | "user">("user");
  const [newOwnerUserId, setNewOwnerUserId] = React.useState("");
  const { canEdit } = sharingActionAvailability(draft);
  const targetValue = principalId ? `${principalType}:${principalId}` : "";
  const targetByKey = React.useMemo(() => {
    const map = new Map<string, { detail?: string; label: string }>();
    for (const member of targets.data?.members ?? []) {
      map.set(`user:${member.id}`, {
        detail: member.email,
        label: member.name || member.email,
      });
    }
    for (const team of targets.data?.teams ?? []) {
      map.set(`team:${team.id}`, { detail: "Team", label: team.name });
    }
    return map;
  }, [targets.data?.members, targets.data?.teams]);
  const selectedTarget = targetValue ? targetByKey.get(targetValue) : null;

  const save = (grants: AiAgentProfileDetail["access"]) => {
    draft.patch({
      grants: grants.map(({ principalId, principalType, role }) => ({
        principalId,
        principalType,
        role,
      })),
    });
    setPrincipalId("");
  };

  function renderTargetPicker() {
    return (
      <Popover onOpenChange={setTargetPickerOpen} open={targetPickerOpen}>
        <PopoverTrigger asChild>
          <Button
            className="min-w-44 flex-1 justify-between"
            role="combobox"
            type="button"
            variant="outline"
          >
            <span className="min-w-0 truncate text-left">
              {selectedTarget
                ? `${selectedTarget.label}${selectedTarget.detail ? ` · ${selectedTarget.detail}` : ""}`
                : "Search members or teams"}
            </span>
            <ChevronsUpDownIcon className="opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(28rem,calc(100vw-3rem))]"
          padding="none"
          variant="menu"
          viewport="wide"
        >
          <Command variant="menu">
            <CommandInput placeholder="Search by name or email..." />
            <CommandList>
              <CommandEmpty>No members or teams found.</CommandEmpty>
              <CommandGroup heading="Members">
                {(targets.data?.members ?? [])
                  .filter((member) => member.id !== agent.ownerUserId)
                  .map((member) => (
                    <CommandItem
                      key={member.id}
                      onSelect={() => {
                        setPrincipalType("user");
                        setPrincipalId(member.id);
                        setTargetPickerOpen(false);
                      }}
                      value={`${member.name} ${member.email}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {member.name || member.email}
                        </div>
                        <div className="truncate text-xs text-content-secondary">
                          {member.email}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
              </CommandGroup>
              {(targets.data?.teams.length ?? 0) > 0 ? (
                <CommandGroup heading="Teams">
                  {targets.data?.teams.map((team) => (
                    <CommandItem
                      key={team.id}
                      onSelect={() => {
                        setPrincipalType("team");
                        setPrincipalId(team.id);
                        setTargetPickerOpen(false);
                      }}
                      value={`${team.name} team`}
                    >
                      {team.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }

  function renderOwnershipLifecycle() {
    return (
      showLifecycle &&
      agent.role === "owner" && (
        <div className="mt-3 grid gap-2 border-t pt-3">
          <p className="text-sm font-medium">Ownership and lifecycle</p>
          <p className="text-xs text-content-secondary">
            Transferring ownership does not transfer connector credentials. All
            connections will require their authenticators to reconnect.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-48 flex-1"
              onChange={(event) => setNewOwnerUserId(event.target.value)}
              placeholder="New owner user ID"
              value={newOwnerUserId}
            />
            <Button
              disabled={!newOwnerUserId.trim() || transferOwnership.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Transfer this agent and require every connection to reauthenticate?",
                  )
                ) {
                  void transferOwnership
                    .mutateAsync({ newOwnerUserId: newOwnerUserId.trim() })
                    .then(() => toast.success("Agent ownership transferred."))
                    .catch((error) =>
                      showError("Could not transfer ownership", error),
                    );
                }
              }}
              type="button"
              variant="outline"
            >
              Transfer ownership
            </Button>
            <Button
              disabled={archiveAgent.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Archive this agent? Its shared history stays readable, but no new runs or connector calls can start.",
                  )
                ) {
                  void archiveAgent
                    .mutateAsync({})
                    .then(() => toast.success("Agent archived."))
                    .catch((error) =>
                      showError("Could not archive agent", error),
                    );
                }
              }}
              type="button"
              variant="destructive"
            >
              Archive agent
            </Button>
          </div>
        </div>
      )
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-content-secondary">
        Everyone with agent access can see its shared Chat and run summaries.
        Only editors can change configuration; sensitive tool arguments and
        diagnostics remain editor-only.
      </p>
      <div className="rounded-md bg-feedback-warning-background px-3 py-2 text-xs text-feedback-warning-text">
        This agent uses its own resource permissions. People you share it with
        may receive information from granted pages or databases even when they
        cannot open those resources directly.
      </div>
      <div className="flex items-center gap-2 rounded border p-2 text-sm">
        <Badge variant="outline">owner</Badge>
        <span className="min-w-0 truncate">
          {targetByKey.get(`user:${agent.ownerUserId}`)?.label ??
            agent.ownerUserId}
        </span>
        <span className="ml-auto text-content-secondary">Full access</span>
      </div>
      {agent.access.map((grant) => (
        <div
          className="flex items-center gap-2 rounded border p-2 text-sm"
          data-ai-changed={draft?.reviewOpen && draft.state?.review?.fields.includes("grants") && JSON.stringify(draft.state.review.before.grants.find((old) => old.principalId === grant.principalId && old.principalType === grant.principalType)) !== JSON.stringify({ principalType: grant.principalType, principalId: grant.principalId, role: grant.role }) || undefined}
          key={grant.id}
        >
          <Badge variant="outline">{grant.principalType}</Badge>
          <span className="min-w-0 truncate">
            {targetByKey.get(`${grant.principalType}:${grant.principalId}`)
              ?.label ?? grant.principalId}
          </span>
          <span className="ml-auto text-content-secondary">
            {grant.role === "editor" ? "Can edit" : "Can use"}
          </span>
          {canEdit && (
            <Button
              aria-label="Remove access"
              onClick={() =>
                void save(agent.access.filter((item) => item.id !== grant.id))
              }
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2Icon className="size-4" />
            </Button>
          )}
        </div>
      ))}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {renderTargetPicker()}
          <Select
            onValueChange={(value) => setRole(value as "editor" | "user")}
            value={role}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">Can use</SelectItem>
              <SelectItem value="editor">Can edit</SelectItem>
            </SelectContent>
          </Select>
          <Button
            disabled={!principalId.trim() || draft.publish.isPending}
            onClick={() => {
              const grants = agent.access.filter(
                (item) =>
                  !(
                    item.principalId === principalId.trim() &&
                    item.principalType === principalType
                  ),
              );
              void save([
                ...grants,
                {
                  id: crypto.randomUUID(),
                  principalId: principalId.trim(),
                  principalType,
                  role,
                },
              ]);
            }}
            type="button"
          >
            Share
          </Button>
        </div>
      )}
      {renderOwnershipLifecycle()}
    </div>
  );
}

function showError(title: string, error: unknown) {
  toast.error(title, {
    description: error instanceof Error ? error.message : "Try again.",
  });
}
