import { useMutation } from "@tanstack/react-query"

import { useZilobaseFeatures } from "../../shared/context"
import { useDatabaseSessionId } from "../client/provider"
import { resolveDataSourceCommandScope } from "./scope"
import { executeDatabaseCommand } from "./execute"
import { invalidateDatabaseQueries } from "./invalidate"
import {
  runSerialized,
  structuralSerializationKey,
} from "./serialize"

export type DatabaseStoredTemplate = {
  archivedAt: string | null
  id: string
  name: string
  template: unknown
}

type DatabaseTemplateScope = {
  databaseId: string
  hostDatabaseId?: string
}

export function useCreateDatabaseTemplate() {
  return useDatabaseTemplateMutation((input: DatabaseTemplateScope & {
    name: string
    template: unknown
  }) => ({
    name: input.name,
    template: input.template,
    type: "template.create" as const,
  }))
}

export function useUpdateDatabaseTemplate() {
  return useDatabaseTemplateMutation((input: DatabaseTemplateScope & {
    patch: unknown
    templateId: string
  }) => ({
    patch: input.patch,
    templateId: input.templateId,
    type: "template.update" as const,
  }))
}

export function useArchiveDatabaseTemplate() {
  return useDatabaseTemplateMutation((input: DatabaseTemplateScope & {
    templateId: string
  }) => ({
    templateId: input.templateId,
    type: "template.archive" as const,
  }))
}

export function useRestoreDatabaseTemplate() {
  return useDatabaseTemplateMutation((input: DatabaseTemplateScope & {
    templateId: string
  }) => ({
    templateId: input.templateId,
    type: "template.restore" as const,
  }))
}

function useDatabaseTemplateMutation<
  TInput extends DatabaseTemplateScope,
  TCommand extends
    | { name: string; template: unknown; type: "template.create" }
    | { patch: unknown; templateId: string; type: "template.update" }
    | { templateId: string; type: "template.archive" | "template.restore" },
>(command: (input: TInput) => TCommand) {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  const sessionId = useDatabaseSessionId()

  return useMutation({
    mutationFn: async (input: TInput) => {
      const scope = await resolveDataSourceCommandScope(
        queryClient,
        apiFetch,
        input.databaseId,
        input.hostDatabaseId,
      )
      const ack = await runSerialized(
        structuralSerializationKey(scope.dataSourceId),
        () =>
          executeDatabaseCommand(apiFetch, {
            command: command(input),
            databaseId: scope.hostDatabaseId,
            dataSourceId: scope.dataSourceId,
          }),
      )
      invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId)
      return ack.result as DatabaseStoredTemplate
    },
  })
}
