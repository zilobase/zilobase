import { getNavigationItemPath } from "../model/database-view-navigation";
import type { DatabaseAccessRule } from "@zilobase/features/databases/contracts";
import * as React from "react";

import { toast } from "sonner";

import { useSession } from "@zilobase/features/auth/react";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import { useAiAgentProfiles } from "@zilobase/features/ai-chat/react";
import {
  useDeletePageAccess,
  useSetPagePublished,
  useUpsertPageAccess,
  usePage,
  usePageAccess,
  usePageAccessLevel,
  usePageAccessTargets,
  usePagePersonAccessTargets,
  usePageGuestInvitations,
  usePageGuestRequests,
  useInvitePageGuest,
  useCancelPageGuestInvitation,
  useRevokePageGuest,
} from "@zilobase/features/pages/react";
import { useWorkspaceGuestPolicy } from "@zilobase/features/workspaces/react";
import { useDatabaseMetadata } from "@/features/databases/access/use-database-metadata"
import {
  useDatabaseAccess,
  useDeleteDatabaseAccess,
  useSetDatabasePublished,
  useUpsertDatabaseAccess,
} from "@zilobase/features/databases/react";

import {
  type AccessLevel,
  type AccessTargetType,
  type PageAccessRule,
} from "@zilobase/features/pages";
export type ShareTargetValue = `${AccessTargetType}:${string}`;
export function useItemSharing({
  databaseId,
  pageId,
}: {
  databaseId?: string | null;
  pageId?: string | null;
}) {
  const workspaceId = useActiveWorkspaceId();
  const { data: session } = useSession();
  const { data: page } = usePage(pageId);
  const { data: accessLevel } = usePageAccessLevel(pageId);
  const { data: accessPayload } = usePageAccess(pageId);
  const { data: databasePayload } = useDatabaseMetadata(databaseId);
  const { data: databaseAccessPayload } = useDatabaseAccess(databaseId);
  const { data: targets } = usePageAccessTargets(workspaceId);
  const { data: customAgents = [] } = useAiAgentProfiles();
  const guestPageId = getGuestPageId(databaseId, pageId);
  const isWorkspaceMember = isSharingWorkspaceMember(targets, session);
  const { data: personTargets } = usePagePersonAccessTargets(pageId, {
    enabled: Boolean(guestPageId),
  });
  const { data: guestInvitations } = usePageGuestInvitations(
    databaseId ? null : pageId,
  );
  const { data: guestRequests } = usePageGuestRequests(
    databaseId ? null : pageId,
  );
  const { data: guestPolicy } = useWorkspaceGuestPolicy(workspaceId, {
    enabled: Boolean(guestPageId && isWorkspaceMember),
  });
  const upsertAccess = useUpsertPageAccess();
  const upsertDatabaseAccess = useUpsertDatabaseAccess();
  const deleteAccess = useDeletePageAccess();
  const deleteDatabaseAccess = useDeleteDatabaseAccess();
  const setPublished = useSetPagePublished();
  const setDatabasePublished = useSetDatabasePublished();
  const inviteGuest = useInvitePageGuest();
  const cancelGuestInvitation = useCancelPageGuestInvitation();
  const revokeGuest = useRevokePageGuest();
  const [targetValue, setTargetValue] = React.useState<ShareTargetValue | "">(
    "",
  );
  const [targetPickerOpen, setTargetPickerOpen] = React.useState(false);
  const [nextAccessLevel, setNextAccessLevel] =
    React.useState<AccessLevel>("view");
  const [guestEmail, setGuestEmail] = React.useState("");
  const [guestAccessLevel, setGuestAccessLevel] =
    React.useState<AccessLevel>("view");
  const isDatabase = Boolean(databaseId);
  const effectiveAccessLevel = getSharingAccessLevel(
    isDatabase,
    databasePayload,
    accessLevel,
  );
  const canManage = effectiveAccessLevel === "full";

  const shareableMembers = React.useMemo(
    () =>
      (targets?.members ?? []).filter(
        (member) => member.id !== session?.user?.id,
      ),
    [session?.user?.id, targets?.members],
  );
  const targetByKey = React.useMemo(() => {
    return new Map<string, { label: string; detail?: string }>([
      ...(targets?.members ?? []).map(
        (member): [string, { label: string; detail: string }] => [
          `user:${member.id}`,
          {
            detail: member.email,
            label: member.name || member.email,
          },
        ],
      ),
      ...(personTargets?.guests ?? []).map(
        (guest): [string, { label: string; detail: string }] => [
          `user:${guest.id}`,
          {
            detail: `${guest.email} · Guest`,
            label: guest.name || guest.email,
          },
        ],
      ),
      ...customAgents.map(
        (agent): [string, { label: string; detail: string }] => [
          `agent:${agent.id}`,
          {
            detail: "Custom Agent",
            label: agent.name || "Untitled agent",
          },
        ],
      ),
    ]);
  }, [customAgents, personTargets?.guests, targets?.members]);
  const guestUserIds = React.useMemo(
    () => new Set((personTargets?.guests ?? []).map((guest) => guest.id)),
    [personTargets?.guests],
  );
  const rules = getSharingRules(
    isDatabase,
    databaseAccessPayload,
    accessPayload,
  );
  const isPublished = rules.some(
    (rule) => rule.targetType === "public" && rule.targetId === "*",
  );
  const sharingRules = rules.filter((rule) => rule.targetType !== "public");
  const pendingGuestInvitations = getPendingItems(guestInvitations);
  const pendingGuestRequests = getPendingItems(guestRequests);
  const guestActionLabel = getGuestActionLabel(guestPolicy);

  const { selectedTarget, selectedTargetIsAgent, shareDisabled } =
    getSharingSelection(
      targetValue,
      targetByKey,
      canManage,
      upsertAccess.isPending,
      upsertDatabaseAccess.isPending,
    );
  const publicUrl = getSharingLink(databaseId, pageId);

  const shareItem = () => {
    if (!targetValue || (!page && !databaseId)) {
      return;
    }

    const [targetType, targetId] = targetValue.split(":") as [
      AccessTargetType,
      string,
    ];

    const options = {
      onSuccess: () => {
        setTargetValue("");
        toast.success(`${isDatabase ? "Database" : "Page"} access updated.`);
      },
      onError: (error: Error) => {
        toast.error(error.message || "Could not share.");
      },
    };

    if (isDatabase) {
      upsertDatabaseAccess.mutate(
        {
          accessLevel: nextAccessLevel === "comment" ? "view" : nextAccessLevel,
          targetId,
          targetType,
          databaseId: databaseId as string,
        },
        options,
      );
      return;
    }

    upsertAccess.mutate(
      {
        accessLevel: nextAccessLevel,
        targetId,
        targetType,
        pageId: page?.id as string,
      },
      options,
    );
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(publicUrl || window.location.href);
    toast.success("Page link copied.");
  };

  const invitePageGuest = () => {
    const email = guestEmail.trim().toLowerCase();

    if (
      !pageId ||
      !email ||
      !canManage ||
      !isWorkspaceMember ||
      inviteGuest.isPending
    )
      return;
    inviteGuest.mutate(
      { accessLevel: guestAccessLevel, email, pageId },
      {
        onError: (error) =>
          toast.error(
            error instanceof Error ? error.message : "Could not invite guest.",
          ),
        onSuccess: (result) => {
          setGuestEmail("");
          toast.success(
            result.request
              ? "Guest invitation sent for owner approval."
              : "Page guest invitation sent.",
          );
        },
      },
    );
  };

  const togglePublished = (checked: boolean) => {
    const publishingPending = isDatabase
      ? setDatabasePublished.isPending
      : setPublished.isPending;
    if ((!page && !databaseId) || !canManage || publishingPending) {
      return;
    }

    const options = {
      onSuccess: () => {
        toast.success(checked ? "Page published." : "Page unpublished.");
      },
      onError: (error: Error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not update publishing.",
        );
      },
    };

    if (isDatabase) {
      setDatabasePublished.mutate(
        { isPublished: checked, databaseId: databaseId as string },
        options,
      );
      return;
    }

    setPublished.mutate(
      { isPublished: checked, pageId: page?.id as string },
      options,
    );
  };

  const deleteRule = (rule: Pick<PageAccessRule, "id" | "targetId">) =>
    isDatabase
      ? deleteDatabaseAccess.mutate(
          { ruleId: rule.id, databaseId: databaseId as string },
          {
            onError: (error) => {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Could not remove access.",
              );
            },
          },
        )
      : guestUserIds.has(rule.targetId)
        ? revokeGuest.mutate(
            {
              pageId: pageId as string,
              userId: rule.targetId,
            },
            {
              onError: (error) => {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not remove guest access.",
                );
              },
            },
          )
        : deleteAccess.mutate(
            { ruleId: rule.id, pageId: pageId as string },
            {
              onError: (error) => {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not remove access.",
                );
              },
            },
          );

  const cancelInvitation = (invitationId: string) =>
    cancelGuestInvitation.mutate(
      { invitationId: invitationId, pageId: pageId as string },
      {
        onError: (error) =>
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not cancel invitation.",
          ),
      },
    );

  return {
    shareDisabled,
    canManage,
    cancelGuestInvitation,
    cancelInvitation,
    copyLink,
    customAgents,
    deleteRule,
    effectiveAccessLevel,
    guestAccessLevel,
    guestActionLabel,
    guestEmail,
    inviteGuest,
    invitePageGuest,
    isDatabase,
    isPublished,
    isWorkspaceMember,
    nextAccessLevel,
    pendingGuestInvitations,
    pendingGuestRequests,
    publicUrl,
    selectedTarget,
    selectedTargetIsAgent,
    session,
    setDatabasePublished,
    setGuestAccessLevel,
    setGuestEmail,
    setNextAccessLevel,
    setPublished,
    setTargetPickerOpen,
    setTargetValue,
    shareItem,
    shareableMembers,
    sharingRules,
    targetByKey,
    targetPickerOpen,
    targetValue,
    togglePublished,
  };
}
export type ItemSharingState = ReturnType<typeof useItemSharing>;

function getGuestPageId(
  databaseId: string | null | undefined,
  pageId: string | null | undefined,
) {
  return databaseId ? null : pageId;
}
function isSharingWorkspaceMember(
  targets: { members: { id: string }[] } | undefined,
  session: { user?: { id: string } | null } | null | undefined,
) {
  return Boolean(
    targets?.members.some((member) => member.id === session?.user?.id),
  );
}
function getSharingAccessLevel(
  isDatabase: boolean,
  database:
    | { database: { accessLevel?: AccessLevel | null } }
    | null
    | undefined,
  pageLevel: AccessLevel | null | undefined,
) {
  return isDatabase ? database?.database.accessLevel : pageLevel;
}
function getSharingRules(
  isDatabase: boolean,
  database: { access: DatabaseAccessRule[] } | undefined,
  page: { access: PageAccessRule[] } | undefined,
) {
  return isDatabase ? (database?.access ?? []) : (page?.access ?? []);
}
function getPendingItems<T extends { status: string }>(items: T[] | undefined) {
  return (items ?? []).filter((item) => item.status === "pending");
}
function getGuestActionLabel(
  policy: { mode: string; canApprove: boolean } | null | undefined,
) {
  return policy?.mode === "request" && !policy.canApprove
    ? "Request"
    : "Invite";
}
function getSharingSelection(
  targetValue: string,
  targets: Map<string, { label: string; detail?: string }>,
  canManage: boolean,
  pagePending: boolean,
  databasePending: boolean,
) {
  return {
    selectedTarget: targetValue ? targets.get(targetValue) : null,
    selectedTargetIsAgent: targetValue.startsWith("agent:"),
    shareDisabled: !canManage || !targetValue || pagePending || databasePending,
  };
}
function getSharingLink(
  databaseId: string | null | undefined,
  pageId: string | null | undefined,
) {
  return typeof window === "undefined"
    ? ""
    : window.location.origin + getNavigationItemPath({ databaseId, pageId });
}
