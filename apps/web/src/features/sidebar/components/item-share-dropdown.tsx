import {
  useItemSharing,
  type ItemSharingState,
  type ShareTargetValue,
} from "../commands/use-item-sharing";
import * as React from "react";

import {
  ChevronsUpDownIcon,
  BotIcon,
  Globe2Icon,
  LinkIcon,
  LockIcon,
  MailPlusIcon,
  Share2Icon,
  Trash2Icon,
} from "@/shared/components/icons";

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

import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

import { Switch } from "@/shared/ui/switch";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/app-tabs";
import { type AccessLevel, type PageAccessRule } from "@zilobase/features/pages";

const accessLabels: Record<AccessLevel, string> = {
  comment: "Comment access",
  edit: "Edit access",
  full: "Full access",
  view: "View access",
};

export function ItemShareDropdown({
  databaseId,
  pageId,
}: {
  databaseId?: string | null;
  pageId?: string | null;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          className="h-7 gap-2 data-[state=open]:bg-action-neutral-hover"
          size="sm"
          variant="outline"
        >
          <LockIcon />
          Share
        </Button>
      </PopoverTrigger>
      {open ? <ItemShareDropdownContent databaseId={databaseId} pageId={pageId} /> : null}
    </Popover>
  );
}

function ItemShareDropdownContent({
  databaseId,
  pageId,
}: {
  databaseId?: string | null;
  pageId?: string | null;
}) {
  const sharing = useItemSharing({ databaseId, pageId });
  const { isDatabase } = sharing;
  return (
    <PopoverContent
      align="end"
      className="w-[min(36rem,calc(100vw-2rem))] p-4"
      onOpenAutoFocus={(event) => event.preventDefault()}
    >
      <div className="mb-4 grid gap-1.5">
        <div className="font-semibold leading-none tracking-tight">
          Share {isDatabase ? "database" : "page"}
        </div>
        <div className="text-sm text-content-secondary">
          Access applies to this {isDatabase ? "database" : "page and nested pages"}.
        </div>
      </div>

      <Tabs defaultValue="share">
        <TabsList>
          <TabsTrigger value="share">Share</TabsTrigger>
          <TabsTrigger value="publish">Publishing</TabsTrigger>
        </TabsList>

        <ItemSharingTab sharing={sharing} />

        <ItemPublishingTab sharing={sharing} />
      </Tabs>
    </PopoverContent>
  );
}

function RuleRow({
  canManage,
  deleteRule,
  rule,
  target,
}: {
  canManage: boolean;
  deleteRule: () => void;
  rule: Pick<PageAccessRule, "accessLevel" | "targetId" | "targetType">;
  target?: { detail?: string; label: string };
}) {
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{target?.label ?? "Unknown target"}</div>
        <div className="truncate text-xs text-content-secondary">
          {target?.detail ?? rule.targetType}
        </div>
      </div>
      <span className="text-xs text-content-secondary">{accessLabels[rule.accessLevel]}</span>
      {canManage ? (
        <Button
          aria-label="Remove access"
          onClick={deleteRule}
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

function AccessRow({
  detail,
  label,
  level,
  suffix,
}: {
  detail?: string;
  label: string;
  level: AccessLevel;
  suffix?: string;
}) {
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {label} {suffix ? <span className="text-content-secondary">({suffix})</span> : null}
        </div>
        <div className="truncate text-xs text-content-secondary">{detail}</div>
      </div>
      <span className="text-xs text-content-secondary">{accessLabels[level]}</span>
    </div>
  );
}

function ItemPublishingTab({ sharing }: { sharing: ItemSharingState }) {
  const {
    canManage,
    copyLink,
    isDatabase,
    isPublished,
    publicUrl,
    setDatabasePublished,
    setPublished,
    togglePublished,
  } = sharing;
  return (
    <TabsContent className="grid gap-4 pt-2" value="publish">
      <div className="flex items-start gap-3 rounded-md border px-3 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-muted">
          <Globe2Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Publish to web</div>
          <div className="text-xs text-content-secondary">
            Anyone with the link can view this {isDatabase ? "database" : "page and nested pages"}.
            Published content is read-only.
          </div>
        </div>
        <Switch
          checked={isPublished}
          disabled={!canManage || setPublished.isPending || setDatabasePublished.isPending}
          onCheckedChange={togglePublished}
        />
      </div>

      {!canManage ? (
        <div className="rounded-md bg-surface-muted px-3 py-2 text-xs text-content-secondary">
          You need full access to manage publishing for this {isDatabase ? "database" : "page"}.
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Input readOnly value={publicUrl} />
        <Button disabled={!isPublished} onClick={copyLink} type="button" variant="outline">
          <LinkIcon />
          Copy link
        </Button>
      </div>
    </TabsContent>
  );
}

function ItemAccessRules({
  state,
}: {
  state: Pick<
    ItemSharingState,
    "canManage" | "deleteRule" | "effectiveAccessLevel" | "session" | "sharingRules" | "targetByKey"
  >;
}) {
  const { canManage, deleteRule, effectiveAccessLevel, session, sharingRules, targetByKey } = state;
  return (
    <>
      <div className="grid gap-2">
        <AccessRow
          detail={session?.user?.email}
          label={session?.user?.name || "You"}
          level={effectiveAccessLevel ?? "view"}
          suffix="You"
        />
        {sharingRules.map((rule) => (
          <RuleRow
            canManage={canManage}
            deleteRule={() => deleteRule(rule)}
            key={rule.id}
            rule={rule}
            target={targetByKey.get(`${rule.targetType}:${rule.targetId}`)}
          />
        ))}
      </div>
    </>
  );
}

function ItemGuestInvitations({
  state,
}: {
  state: Pick<
    ItemSharingState,
    | "canManage"
    | "cancelGuestInvitation"
    | "cancelInvitation"
    | "guestAccessLevel"
    | "guestActionLabel"
    | "guestEmail"
    | "inviteGuest"
    | "invitePageGuest"
    | "isDatabase"
    | "isWorkspaceMember"
    | "pendingGuestInvitations"
    | "pendingGuestRequests"
    | "setGuestAccessLevel"
    | "setGuestEmail"
  >;
}) {
  const {
    canManage,
    cancelGuestInvitation,
    cancelInvitation,
    guestAccessLevel,
    guestActionLabel,
    guestEmail,
    inviteGuest,
    invitePageGuest,
    isDatabase,
    isWorkspaceMember,
    pendingGuestInvitations,
    pendingGuestRequests,
    setGuestAccessLevel,
    setGuestEmail,
  } = state;
  return (
    <>
      {!isDatabase && canManage && isWorkspaceMember ? (
        <div className="grid gap-2 rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">Invite a page guest</div>
            <div className="text-xs text-content-secondary">
              Guests can access this page and its nested pages, but not the workspace.
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label="Guest email"
              className="min-w-0 flex-1"
              onChange={(event) => setGuestEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  invitePageGuest();
                }
              }}
              placeholder="guest@example.com"
              type="email"
              value={guestEmail}
            />
            <Select
              onValueChange={(value) => setGuestAccessLevel(value as AccessLevel)}
              value={guestAccessLevel}
            >
              <SelectTrigger className="sm:w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">View</SelectItem>
                <SelectItem value="comment">Comment</SelectItem>
                <SelectItem value="edit">Edit</SelectItem>
                <SelectItem value="full">Full</SelectItem>
              </SelectContent>
            </Select>
            <Button
              disabled={!guestEmail.trim() || inviteGuest.isPending}
              onClick={invitePageGuest}
              type="button"
            >
              <MailPlusIcon />
              {guestActionLabel}
            </Button>
          </div>
          {pendingGuestInvitations.length > 0 ? (
            <div className="grid gap-1 border-t pt-2">
              <div className="text-xs font-medium text-content-secondary">
                Pending guest invitations
              </div>
              {pendingGuestInvitations.map((invitation) => (
                <div className="flex items-center gap-2 text-sm" key={invitation.id}>
                  <span className="min-w-0 flex-1 truncate">{invitation.email}</span>
                  <span className="text-xs text-content-secondary">{invitation.accessLevel}</span>
                  <Button
                    aria-label={`Cancel invitation for ${invitation.email}`}
                    disabled={cancelGuestInvitation.isPending}
                    onClick={() => cancelInvitation(invitation.id)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
          {pendingGuestRequests.length > 0 ? (
            <div className="grid gap-1 border-t pt-2">
              <div className="text-xs font-medium text-content-secondary">
                Pending owner approval
              </div>
              {pendingGuestRequests.map((request) => (
                <div className="flex items-center gap-2 text-sm" key={request.id}>
                  <span className="min-w-0 flex-1 truncate">{request.email}</span>
                  <span className="text-xs text-content-secondary">{request.accessLevel}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function ItemSharingTargets({
  state,
}: {
  state: Pick<
    ItemSharingState,
    | "canManage"
    | "customAgents"
    | "isDatabase"
    | "nextAccessLevel"
    | "selectedTarget"
    | "selectedTargetIsAgent"
    | "setNextAccessLevel"
    | "setTargetPickerOpen"
    | "setTargetValue"
    | "shareItem"
    | "shareableMembers"
    | "targetPickerOpen"
    | "targetValue"
    | "shareDisabled"
  >;
}) {
  const {
    canManage,
    customAgents,
    isDatabase,
    nextAccessLevel,
    selectedTarget,
    selectedTargetIsAgent,
    setNextAccessLevel,
    setTargetPickerOpen,
    setTargetValue,
    shareItem,
    shareableMembers,
    targetPickerOpen,
    targetValue,
    shareDisabled,
  } = state;
  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Popover open={targetPickerOpen} onOpenChange={setTargetPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              className="min-w-0 flex-1 justify-between"
              disabled={!canManage}
              role="combobox"
              type="button"
              variant="outline"
            >
              <span className="min-w-0 truncate text-left">
                {selectedTarget?.detail ?? "Search members"}
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
                <CommandEmpty>No members or agents found.</CommandEmpty>
                <CommandGroup>
                  {shareableMembers.map((member) => {
                    const value: ShareTargetValue = `user:${member.id}`;
                    const label = member.name || member.email;

                    return (
                      <CommandItem
                        data-checked={targetValue === value}
                        key={member.id}
                        onSelect={() => {
                          setTargetValue(value);
                          setTargetPickerOpen(false);
                        }}
                        value={`${member.email} ${member.name}`}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">{label}</div>
                          <div className="truncate text-xs text-content-secondary">
                            {member.email}
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                {customAgents.length > 0 ? (
                  <CommandGroup heading="Custom Agents">
                    {customAgents.map((agent) => {
                      const value: ShareTargetValue = `agent:${agent.id}`;
                      return (
                        <CommandItem
                          data-checked={targetValue === value}
                          key={agent.id}
                          onSelect={() => {
                            setTargetValue(value);
                            if (nextAccessLevel === "full") setNextAccessLevel("edit");
                            setTargetPickerOpen(false);
                          }}
                          value={`${agent.name} custom agent`}
                        >
                          <BotIcon />
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {agent.name || "Untitled agent"}
                            </div>
                            <div className="truncate text-xs text-content-secondary">
                              Independent agent principal
                            </div>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ) : null}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Select
          disabled={!canManage}
          onValueChange={(value) => setNextAccessLevel(value as AccessLevel)}
          value={nextAccessLevel}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="view">View</SelectItem>
            {!isDatabase ? <SelectItem value="comment">Comment</SelectItem> : null}
            <SelectItem value="edit">Edit</SelectItem>
            {!selectedTargetIsAgent ? <SelectItem value="full">Full</SelectItem> : null}
          </SelectContent>
        </Select>
        <Button disabled={shareDisabled} onClick={shareItem} type="button">
          <Share2Icon />
          Share
        </Button>
      </div>

      {selectedTargetIsAgent ? (
        <div className="rounded-md bg-feedback-warning-background px-3 py-2 text-xs text-feedback-warning-text">
          Agent access is independent from human access. People who can use this agent may receive
          information from this resource even when they cannot open it directly.
        </div>
      ) : null}
    </>
  );
}

function ItemSharingTab({ sharing }: { sharing: ItemSharingState }) {
  const { canManage, copyLink, isDatabase, publicUrl } = sharing;
  return (
    <TabsContent className="grid gap-4 pt-2" value="share">
      <ItemSharingTargets state={sharing} />

      <ItemGuestInvitations state={sharing} />

      <ItemAccessRules state={sharing} />

      {!canManage ? (
        <div className="rounded-md bg-surface-muted px-3 py-2 text-xs text-content-secondary">
          You need full access to manage sharing for this {isDatabase ? "database" : "page"}.
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Input readOnly value={publicUrl} />
        <Button onClick={copyLink} type="button" variant="outline">
          <LinkIcon />
          Copy link
        </Button>
      </div>
    </TabsContent>
  );
}
