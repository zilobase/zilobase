import {
  type AccessLevel,
  type AccessTargetType,
  type PageAccessRule,
} from "@zilobase/features/pages";
import { useItemSharingController } from "@zilobase/features/pages/react";
import { getNavigationItemPath } from "@/app/routing/route-identifiers";
import * as React from "react";
import { toast } from "sonner";

export type ShareTargetValue = `${AccessTargetType}:${string}`;
export function useSharing({
  databaseId,
  pageId,
}: {
  databaseId?: string | null;
  pageId?: string | null;
}) {
  const sharing = useItemSharingController({ databaseId, pageId });
  const {
    session,
    isDatabase,
    effectiveAccessLevel,
    canManage,
    isWorkspaceMember,
    shareableMembers,
    targetByKey,
    isPublished,
    sharingRules,
    pendingGuestInvitations,
    pendingGuestRequests,
    guestActionLabel,
    upsertAccess,
    upsertDatabaseAccess,
    setPublished,
    setDatabasePublished,
    inviteGuest,
    cancelGuestInvitation,
  } = sharing;
  const [targetValue, setTargetValue] = React.useState<ShareTargetValue | "">("");
  const [targetPickerOpen, setTargetPickerOpen] = React.useState(false);
  const [nextAccessLevel, setNextAccessLevel] = React.useState<AccessLevel>("view");
  const [guestEmail, setGuestEmail] = React.useState("");
  const [guestAccessLevel, setGuestAccessLevel] = React.useState<AccessLevel>("view");
  const { selectedTarget, shareDisabled } = getSharingSelection(
    targetValue,
    targetByKey,
    canManage,
    upsertAccess.isPending,
    upsertDatabaseAccess.isPending,
  );
  const publicUrl = getSharingLink(databaseId, pageId);

  const shareItem = () =>
    sharing.shareItem(targetValue, nextAccessLevel, {
      onSuccess: () => {
        setTargetValue("");
        toast.success(`${isDatabase ? "Database" : "Page"} access updated.`);
      },
      onError: (error) => toast.error(error.message || "Could not share."),
    });

  const copyLink = async () => {
    await navigator.clipboard.writeText(publicUrl || window.location.href);
    toast.success("Page link copied.");
  };

  const invitePageGuest = () =>
    sharing.invitePageGuest(guestEmail, guestAccessLevel, {
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Could not invite guest."),
      onSuccess: (result) => {
        setGuestEmail("");
        toast.success(
          result.request
            ? "Guest invitation sent for owner approval."
            : "Page guest invitation sent.",
        );
      },
    });
  const togglePublished = (checked: boolean) =>
    sharing.togglePublished(checked, {
      onSuccess: () => toast.success(checked ? "Page published." : "Page unpublished."),
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Could not update publishing."),
    });
  const deleteRule = (rule: Pick<PageAccessRule, "id" | "targetId">) =>
    sharing.deleteRule(
      rule,
      (error) => toast.error(error instanceof Error ? error.message : "Could not remove access."),
      (error) =>
        toast.error(error instanceof Error ? error.message : "Could not remove guest access."),
    );
  const cancelInvitation = (invitationId: string) =>
    sharing.cancelInvitation(invitationId, {
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Could not cancel invitation."),
    });

  return {
    shareDisabled,
    canManage,
    cancelGuestInvitation,
    cancelInvitation,
    copyLink,
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
export type SharingState = ReturnType<typeof useSharing>;

function getSharingSelection(
  targetValue: string,
  targets: Map<string, { label: string; detail?: string }>,
  canManage: boolean,
  pagePending: boolean,
  databasePending: boolean,
) {
  return {
    selectedTarget: targetValue ? targets.get(targetValue) : null,
    shareDisabled: !canManage || !targetValue || pagePending || databasePending,
  };
}
function getSharingLink(databaseId: string | null | undefined, pageId: string | null | undefined) {
  return typeof window === "undefined"
    ? ""
    : window.location.origin + getNavigationItemPath({ databaseId, pageId });
}
