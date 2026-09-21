import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import {
  pageQueryKey,
  pageAccessQueryKey,
  pagePersonAccessTargetsQueryKey,
  pageGuestInvitationQueryKey,
  pageGuestInvitationsQueryKey,
  pageGuestRequestsQueryKey,
} from "./queries";
import type { AccessLevel } from "./contracts";

export function useInvitePageGuest() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: (input: {
      accessLevel: AccessLevel;
      email: string;
      pageId: string;
    }) =>
      apiFetch<{ invitation?: unknown; request?: unknown }>(
        `/pages/${encodeURIComponent(input.pageId)}/guest-invitations`,
        {
          body: JSON.stringify({
            accessLevel: input.accessLevel,
            email: input.email,
          }),
          method: "POST",
        },
      ),
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: pageGuestInvitationsQueryKey(input.pageId),
        }),
        queryClient.invalidateQueries({
          queryKey: pageGuestRequestsQueryKey(input.pageId),
        }),
      ]);
    },
  });
}

export function useCancelPageGuestInvitation() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: (input: { invitationId: string; pageId: string }) =>
      apiFetch<{ invitation: unknown }>(
        `/pages/${encodeURIComponent(input.pageId)}/guest-invitations/${encodeURIComponent(input.invitationId)}`,
        { method: "DELETE" },
      ),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: pageGuestInvitationsQueryKey(input.pageId),
      });
    },
  });
}

export function useAcceptPageGuestInvitation() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: (invitationId: string) =>
      apiFetch<{ pageId: string }>(
        `/page-guest-invitations/${encodeURIComponent(invitationId)}/accept`,
        { method: "POST" },
      ),
    onSuccess: async (result, invitationId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pageQueryKey(result.pageId) }),
        queryClient.invalidateQueries({
          queryKey: pageGuestInvitationQueryKey(invitationId),
        }),
      ]);
    },
  });
}

export function useRevokePageGuest() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: (input: { pageId: string; userId: string }) =>
      apiFetch<{ access: unknown }>(
        `/pages/${encodeURIComponent(input.pageId)}/guests/${encodeURIComponent(input.userId)}`,
        { method: "DELETE" },
      ),
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pageAccessQueryKey(input.pageId) }),
        queryClient.invalidateQueries({
          queryKey: pagePersonAccessTargetsQueryKey(input.pageId),
        }),
        queryClient.invalidateQueries({ queryKey: pageQueryKey(input.pageId) }),
      ]);
    },
  });
}
