import { sharedClient } from "../data/client";
import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import { setPageDetailCache } from "../shared/item-action-cache";
import { updatePageContexts, type PageDetailReference } from "./cache";
import type { Page } from "./contracts";

type SetPageFavoriteInput = {
  isFavorite: boolean;
  pageId: string;
};

type RecordItemVisitInput = {
  itemId: string;
  itemKind: "agent" | "database" | "page";
  workspaceId: string;
};

export function useSetPageFavorite() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: async ({ isFavorite, pageId }: SetPageFavoriteInput) => {
      const cache = sharedClient(queryClient);
      const detail = queryClient.getQueryData<PageDetailReference>(["page", pageId]);
      const owner = detail
        ? cache.get(detail.page.cacheId)
        : cache
            .all()
            .find(
              (entity) =>
                entity.session.scope.viewer.kind === "account" &&
                entity.pages.collection.base.has(pageId),
            );
      const read = await cache.captureRead(owner?.session.id);
      const send = async () => {
        const result = await apiFetch<{ page: Page }>(`/pages/${pageId}/favorite`, {
          method: isFavorite ? "PUT" : "DELETE",
        });
        setPageDetailCache(queryClient, result.page, read);
        updatePageContexts(queryClient, pageId, { isFavorite: result.page.isFavorite }, read);
        return result.page;
      };
      return owner?.navigation.pagePreferences.get(pageId)
        ? owner.session.commands.run(
            owner.navigation.pagePreferences,
            pageId,
            (draft) => {
              draft.isFavorite = isFavorite;
            },
            send,
          )
        : send();
    },
  });
}

export function useRecordItemVisit() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async (input: RecordItemVisitInput) => {
      const read = await sharedClient(queryClient).captureRead();
      const result = await apiFetch<{
        itemId: string;
        itemKind: RecordItemVisitInput["itemKind"];
        lastVisitedAt: string;
      }>("/pages/item-visits", { method: "POST", body: JSON.stringify(input) });
      if (!sharedClient(queryClient).isCurrent(read)) throw new Error("Expired visit confirmation");
      const variables = input;
      if (result.itemKind === "agent") {
        return queryClient.invalidateQueries({
          queryKey: ["workspaces", variables.workspaceId, "ai-agent-profiles"],
        });
      }
      if (result.itemKind === "page")
        updatePageContexts(
          queryClient,
          result.itemId,
          { lastVisitedAt: result.lastVisitedAt },
          read,
        );
      else
        for (const owner of sharedClient(queryClient).all()) {
          if (
            owner.session.scope.viewer.kind !== "account" ||
            owner.session.scope.workspaceId !== variables.workspaceId ||
            !owner.databases.hosts.collection.base.has(result.itemId)
          )
            continue;
          owner.session.ingest([
            owner.navigation.databaseContexts.stage([
              {
                id: result.itemId,
                readSequence: read.sequence,
                context: { lastVisitedAt: result.lastVisitedAt },
              },
            ]),
          ]);
        }
      return result;
    },
  });
}
