import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import type {
  NavItemKind,
} from "./item-relationships";
import {
  pageQueryKey,
  getPageFromDetail,
  pagesQueryKey,
} from "./queries";
import type { Page } from "./contracts";

export function useMovePageToTeamspace() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: (input: {
      pageId: string;
      teamspaceId: string | null;
      workspaceId: string;
    }) =>
      apiFetch<{ movedPageIds: string[]; teamspaceId: string | null }>(
        `/pages/${encodeURIComponent(input.pageId)}/move-teamspace`,
        {
          body: JSON.stringify({ teamspaceId: input.teamspaceId }),
          method: "POST",
        },
      ),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: pagesQueryKey(input.workspaceId),
      });
    },
  });
}

export function useConvertPageToTeamspace() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: {
      accessMode?: "open" | "closed" | "private";
      name?: string;
      pageId: string;
      workspaceId: string;
    }) =>
      apiFetch<{ teamspace: { id: string; name: string } }>(
        `/pages/${encodeURIComponent(input.pageId)}/convert-to-teamspace`,
        {
          body: JSON.stringify({ accessMode: input.accessMode, name: input.name }),
          method: "POST",
        },
      ),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey: pagesQueryKey(input.workspaceId) });
      await queryClient.invalidateQueries({
        queryKey: ["workspace", input.workspaceId, "teamspaces"],
      });
    },
  });
}

type EmbedPageItemInput = {
  hostPageId: string;
  itemId: string;
  kind: NavItemKind;
};

export function useEmbedPageItem() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({ hostPageId, itemId, kind }: EmbedPageItemInput) =>
      apiFetch<{ action: string; host: Page }>(
        `/pages/${hostPageId}/embed-item`,
        {
          method: "POST",
          body: JSON.stringify({ itemId, kind }),
        },
      ),
    onSuccess: (result) => {
      // The embed is saved. Refresh navigation without delaying editor updates.
      void queryClient.invalidateQueries({
        queryKey: pagesQueryKey(result.host.workspaceId),
      }).catch(() => {
        // A failed refresh must not turn a committed embed into a failed mutation.
      });
    },
  });
}

export function useRemovePageEmbed() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({ hostPageId, itemId, kind }: EmbedPageItemInput) =>
      apiFetch<{ action: string }>(`/pages/${hostPageId}/embed-item`, {
        method: "DELETE",
        body: JSON.stringify({ itemId, kind }),
      }),
    onSuccess: async (_result, variables) => {
      const host = getPageFromDetail(
        queryClient.getQueryData(pageQueryKey(variables.hostPageId)),
      );

      if (host) {
        await queryClient.invalidateQueries({
          queryKey: pagesQueryKey(host.workspaceId),
        });
      }
    },
  });
}
