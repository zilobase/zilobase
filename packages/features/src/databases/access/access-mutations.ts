import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from  "../../shared/context";
import { databaseAccessQueryKey } from  "../queries/queries";

type DatabaseAccessInput = {
  accessLevel: "view" | "edit" | "full";
  databaseId: string;
  targetId: string;
  targetType: "public" | "user" | "team" | "agent";
};

export function useUpsertDatabaseAccess() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: async ({ databaseId, ...body }: DatabaseAccessInput) =>
      apiFetch(`/databases/${databaseId}/access`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: databaseAccessQueryKey(variables.databaseId),
      });
    },
  });
}

export function useDeleteDatabaseAccess() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: async ({
      databaseId,
      ruleId,
    }: {
      databaseId: string;
      ruleId: string;
    }) =>
      apiFetch(`/databases/${databaseId}/access/${ruleId}`, {
        method: "DELETE",
      }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: databaseAccessQueryKey(variables.databaseId),
      });
    },
  });
}

export function useSetDatabasePublished() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: async ({
      databaseId,
      isPublished,
    }: {
      databaseId: string;
      isPublished: boolean;
    }) =>
      apiFetch(
        `/databases/${databaseId}/access${isPublished ? "" : "/public"}`,
        {
          method: isPublished ? "PUT" : "DELETE",
          ...(isPublished
            ? {
                body: JSON.stringify({
                  accessLevel: "view",
                  targetId: "*",
                  targetType: "public",
                }),
              }
            : {}),
        },
      ),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: databaseAccessQueryKey(variables.databaseId),
      });
    },
  });
}
