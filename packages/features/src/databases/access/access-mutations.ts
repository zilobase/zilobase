import { useMutation } from "@tanstack/react-query";
import { useDatabaseController } from "../interactions/react";

type DatabaseAccessInput = {
  accessLevel: "view" | "edit" | "full";
  databaseId: string;
  targetId: string;
  targetType: "public" | "user" | "team" | "agent";
};

export function useUpsertDatabaseAccess() {
  const controller = useDatabaseController();
  return useMutation({
    mutationFn: async ({ databaseId, ...body }: DatabaseAccessInput) =>
      (await controller.execute({ databaseId, command: { type: "access.upsert", ...body } }))
        .result,
  });
}

export function useDeleteDatabaseAccess() {
  const controller = useDatabaseController();
  return useMutation({
    mutationFn: async ({ databaseId, ruleId }: { databaseId: string; ruleId: string }) =>
      (await controller.execute({ databaseId, command: { type: "access.remove", ruleId } })).result,
  });
}

export function useSetDatabasePublished() {
  const controller = useDatabaseController();
  return useMutation({
    mutationFn: async ({ databaseId, isPublished }: { databaseId: string; isPublished: boolean }) =>
      (
        await controller.execute({
          databaseId,
          command: { type: "database.publish", published: isPublished },
        })
      ).result,
  });
}
