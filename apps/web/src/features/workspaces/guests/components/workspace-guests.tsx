import { Link } from "@tanstack/react-router";
import { Trash2Icon, UsersIcon } from "@/shared/components/icons";

import { toast } from "sonner";

import { Button } from "@/shared/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/ui/empty";
import { Field, FieldLabel } from "@/shared/ui/field";

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/shared/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

import {
  usePromoteWorkspaceGuest,
  useReviewWorkspaceGuestRequest,
  useRevokeWorkspaceGuest,
  useUpdateWorkspaceGuestPolicy,
} from "@zilobase/features/workspaces/react";
import type {
  GuestInviteMode,
  WorkspaceGuest,
  WorkspaceGuestRequest,
} from "@zilobase/features/workspaces";

import { getInitials } from "../../members/model/member-presentation";

import { RowsSkeleton } from "../../members/components/member-list-skeleton";

export function GuestList({
  canPromote,
  guests,
  isLoading,
  workspaceId,
}: {
  canPromote: boolean;
  guests: WorkspaceGuest[];
  isLoading: boolean;
  workspaceId: string | null | undefined;
}) {
  const revokeGuest = useRevokeWorkspaceGuest();
  const promoteGuest = usePromoteWorkspaceGuest();

  if (isLoading) return <RowsSkeleton />;

  if (guests.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>No page guests</EmptyTitle>
          <EmptyDescription>Invite an external person from a page’s Share menu.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ItemGroup className="gap-2">
      {guests.map((guest) => (
        <Item key={guest.userId} variant="outline">
          <ItemMedia className="size-8 rounded-lg bg-surface-muted text-xs font-medium uppercase">
            {getInitials(guest.name || guest.email)}
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle className="truncate">{guest.name || guest.email}</ItemTitle>
            <ItemDescription className="flex flex-wrap gap-x-2 gap-y-1">
              <span>{guest.email}</span>
              {guest.pages.map((page) => (
                <Link
                  className="hover:underline"
                  key={page.id}
                  params={{ pageId: page.id }}
                  to="/p/$pageId"
                >
                  {page.name || "Untitled"} · {page.accessLevel}
                </Link>
              ))}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            {canPromote ? (
              <Button
                disabled={!workspaceId || promoteGuest.isPending}
                onClick={() => {
                  if (!workspaceId) return;
                  promoteGuest.mutate(
                    { userId: guest.userId, workspaceId },
                    {
                      onError: (error) =>
                        toast.error(
                          error instanceof Error ? error.message : "Could not convert guest.",
                        ),
                      onSuccess: () => toast.success("Guest converted to member."),
                    },
                  );
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Convert to member
              </Button>
            ) : null}
            <Button
              aria-label={`Remove guest ${guest.name || guest.email}`}
              disabled={!workspaceId || revokeGuest.isPending}
              onClick={() => {
                if (
                  !workspaceId ||
                  !window.confirm(`Remove ${guest.name || guest.email} from every shared page?`)
                ) {
                  return;
                }
                revokeGuest.mutate(
                  { userId: guest.userId, workspaceId },
                  {
                    onError: (error) =>
                      toast.error(
                        error instanceof Error ? error.message : "Could not remove guest.",
                      ),
                    onSuccess: () => toast.success("Guest access removed."),
                  },
                );
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Trash2Icon />
              Remove
            </Button>
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}

export function GuestPolicySection({
  isLoadingRequests,
  policy,
  requests,
  workspaceId,
}: {
  isLoadingRequests: boolean;
  policy: GuestInviteMode;
  requests: WorkspaceGuestRequest[];
  workspaceId: string | null | undefined;
}) {
  const updatePolicy = useUpdateWorkspaceGuestPolicy();
  const reviewRequest = useReviewWorkspaceGuestRequest();

  return (
    <section className="grid gap-4">
      <div className="space-y-1">
        <h3 className="font-heading text-base leading-snug font-medium">Guest invitations</h3>
        <p className="text-sm text-content-secondary">
          Choose whether members can invite page guests directly or need owner approval.
        </p>
      </div>
      <Field>
        <FieldLabel>Invitation policy</FieldLabel>
        <Select
          disabled={!workspaceId || updatePolicy.isPending}
          onValueChange={(mode) => {
            if (!workspaceId) return;
            updatePolicy.mutate(
              { mode: mode as GuestInviteMode, workspaceId },
              {
                onError: (error) =>
                  toast.error(
                    error instanceof Error ? error.message : "Could not update guest policy.",
                  ),
                onSuccess: () => toast.success("Guest policy updated."),
              },
            );
          }}
          value={policy}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="direct">Members can invite directly</SelectItem>
            <SelectItem value="request">Require owner approval</SelectItem>
            <SelectItem value="owners_only">Owners only</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="grid gap-2">
        <div className="text-sm font-medium">Pending approval requests</div>
        {isLoadingRequests ? (
          <RowsSkeleton />
        ) : requests.length === 0 ? (
          <p className="text-sm text-content-secondary">No pending requests.</p>
        ) : (
          <ItemGroup className="gap-2">
            {requests.map((request) => (
              <Item key={request.id} variant="outline">
                <ItemContent>
                  <ItemTitle>{request.email}</ItemTitle>
                  <ItemDescription>
                    {request.requesterName || request.requesterEmail} requested{" "}
                    {request.accessLevel} access to {request.pageName || "Untitled"}.
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    disabled={reviewRequest.isPending || !workspaceId}
                    onClick={() =>
                      workspaceId &&
                      reviewRequest.mutate(
                        {
                          action: "reject",
                          requestId: request.id,
                          workspaceId,
                        },
                        {
                          onError: (error) =>
                            toast.error(
                              error instanceof Error ? error.message : "Could not reject request.",
                            ),
                          onSuccess: () => toast.success("Guest request rejected."),
                        },
                      )
                    }
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Reject
                  </Button>
                  <Button
                    disabled={reviewRequest.isPending || !workspaceId}
                    onClick={() =>
                      workspaceId &&
                      reviewRequest.mutate(
                        {
                          action: "approve",
                          requestId: request.id,
                          workspaceId,
                        },
                        {
                          onError: (error) =>
                            toast.error(
                              error instanceof Error ? error.message : "Could not approve request.",
                            ),
                          onSuccess: () => toast.success("Guest invitation approved and sent."),
                        },
                      )
                    }
                    size="sm"
                    type="button"
                  >
                    Approve
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </div>
    </section>
  );
}
