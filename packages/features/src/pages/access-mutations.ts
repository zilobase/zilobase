import type { QueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import {
  pageQueryKey,
  pageAccessQueryKey,
} from "./queries";
import type { AccessLevel, AccessTargetType } from "./contracts";

type UpsertPageAccessInput = {
  accessLevel: AccessLevel;
  targetId: string;
  targetType: AccessTargetType;
  pageId: string;
};

type SetPagePublishedInput = {
  isPublished: boolean;
  pageId: string;
};

export function useUpsertPageAccess() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      accessLevel,
      targetId,
      targetType,
      pageId,
    }: UpsertPageAccessInput) => {
      const result = await apiFetch<{ access: unknown }>(
        `/pages/${pageId}/access`,
        {
          method: "PUT",
          body: JSON.stringify({ accessLevel, targetId, targetType }),
        },
      );

      return result.access;
    },
    onSuccess: async (_access, variables) => {
      await invalidatePageAccess(queryClient, variables.pageId);
    },
  });
}

export function useDeletePageAccess() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      ruleId,
      pageId,
    }: {
      ruleId: string;
      pageId: string;
    }) =>
      apiFetch<{ access: unknown }>(`/pages/${pageId}/access/${ruleId}`, {
        method: "DELETE",
      }),
    onSuccess: async (_access, variables) => {
      await invalidatePageAccess(queryClient, variables.pageId);
    },
  });
}

export function useSetPagePublished() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({ isPublished, pageId }: SetPagePublishedInput) => {
      if (isPublished) {
        const result = await apiFetch<{ access: unknown }>(
          `/pages/${pageId}/access`,
          {
            method: "PUT",
            body: JSON.stringify({
              accessLevel: "view",
              targetId: "*",
              targetType: "public",
            }),
          },
        );

        return result.access;
      }

      return apiFetch<{ access: unknown }>(`/pages/${pageId}/access/public`, {
        method: "DELETE",
      });
    },
    onSuccess: async (_access, variables) => {
      await invalidatePageAccess(queryClient, variables.pageId);
    },
  });
}

async function invalidatePageAccess(queryClient: QueryClient, pageId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: pageAccessQueryKey(pageId) }),
    queryClient.invalidateQueries({ queryKey: pageQueryKey(pageId) }),
  ]);
}
