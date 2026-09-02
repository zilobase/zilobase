import { useMutation, useQuery } from "@tanstack/react-query"

import { useZilobaseFeatures } from "../../shared/context"
import type {
  CreateDatabaseAutomationRequest,
  DatabaseAutomationDefinition,
  DatabaseAutomationDetail,
  DatabaseAutomationValidationResult,
  UpdateDatabaseAutomationRequest,
} from "./contracts"
import {
  databaseAutomationCapabilityQueryOptions,
  databaseAutomationCatalogQueryOptions,
  databaseAutomationDetailQueryOptions,
  databaseAutomationKeys,
  databaseAutomationListQueryOptions,
  databaseAutomationRunQueryOptions,
  databaseAutomationRunsQueryOptions,
} from "./queries"

const encoded = (value: string) => encodeURIComponent(value)

export function useDatabaseAutomationCapability(
  databaseId: string | null | undefined,
  workspaceId: string | null | undefined,
) {
  const { apiFetch } = useZilobaseFeatures()
  return useQuery(databaseAutomationCapabilityQueryOptions(apiFetch, databaseId, workspaceId))
}

export function useDatabaseAutomations(databaseId: string, dataSourceId: string) {
  const { apiFetch } = useZilobaseFeatures()
  return useQuery(databaseAutomationListQueryOptions(apiFetch, databaseId, dataSourceId))
}

export function useDatabaseAutomationCatalog(databaseId: string, dataSourceId: string) {
  const { apiFetch } = useZilobaseFeatures()
  return useQuery(databaseAutomationCatalogQueryOptions(apiFetch, databaseId, dataSourceId))
}

export function useDatabaseAutomation(databaseId: string, automationId: string) {
  const { apiFetch } = useZilobaseFeatures()
  return useQuery(databaseAutomationDetailQueryOptions(apiFetch, databaseId, automationId))
}

export function useDatabaseAutomationRuns(databaseId: string, automationId: string) {
  const { apiFetch } = useZilobaseFeatures()
  return useQuery(databaseAutomationRunsQueryOptions(apiFetch, databaseId, automationId))
}

export function useDatabaseAutomationRun(databaseId: string, automationId: string, runId: string) {
  const { apiFetch } = useZilobaseFeatures()
  return useQuery(databaseAutomationRunQueryOptions(apiFetch, databaseId, automationId, runId))
}

export function useCreateDatabaseAutomation(databaseId: string, dataSourceId: string) {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  return useMutation({
    mutationFn: (body: Omit<CreateDatabaseAutomationRequest, "dataSourceId" | "idempotencyKey">) => {
      const idempotencyKey = crypto.randomUUID()
      return apiFetch<DatabaseAutomationDetail>(`/databases/${encoded(databaseId)}/automations`, {
        body: JSON.stringify({ ...body, dataSourceId, idempotencyKey }),
        headers: { "Idempotency-Key": idempotencyKey },
        method: "POST",
      })
    },
    onSuccess: (automation) => {
      queryClient.setQueryData(databaseAutomationKeys.detail(databaseId, automation.id), automation)
      void queryClient.invalidateQueries({ queryKey: databaseAutomationKeys.list(databaseId, dataSourceId) })
    },
  })
}

export function useUpdateDatabaseAutomation(databaseId: string, automationId: string) {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  return useMutation({
    mutationFn: ({ body, version }: { body: UpdateDatabaseAutomationRequest; version: number }) =>
      apiFetch<DatabaseAutomationDetail>(
        `/databases/${encoded(databaseId)}/automations/${encoded(automationId)}`,
        { body: JSON.stringify(body), headers: { "If-Match": String(version) }, method: "PATCH" },
      ),
    onSuccess: (automation) => {
      queryClient.setQueryData(databaseAutomationKeys.detail(databaseId, automationId), automation)
      void queryClient.invalidateQueries({ queryKey: databaseAutomationKeys.all })
    },
  })
}

export function useDatabaseAutomationLifecycle(databaseId: string, dataSourceId: string) {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  return useMutation<DatabaseAutomationDetail | { deleted: boolean }, Error, {
    action: "delete" | "duplicate" | "pause" | "resume"
    automationId: string
  }>({
    mutationFn: ({ action, automationId }: {
      action: "delete" | "duplicate" | "pause" | "resume"
      automationId: string
    }) => {
      const path = `/databases/${encoded(databaseId)}/automations/${encoded(automationId)}`
      if (action === "delete") return apiFetch<{ deleted: boolean }>(path, { method: "DELETE" })
      const idempotencyKey = crypto.randomUUID()
      return apiFetch<DatabaseAutomationDetail>(`${path}/${action}`, {
        headers: action === "duplicate" ? { "Idempotency-Key": idempotencyKey } : undefined,
        method: "POST",
      })
    },
    onSettled: () => queryClient.invalidateQueries({
      queryKey: databaseAutomationKeys.list(databaseId, dataSourceId),
    }),
  })
}

export function useValidateDatabaseAutomation(databaseId: string) {
  const { apiFetch } = useZilobaseFeatures()
  return useMutation({
    mutationFn: ({ dataSourceId, definition }: {
      dataSourceId: string
      definition: DatabaseAutomationDefinition
    }) => apiFetch<DatabaseAutomationValidationResult>(`/databases/${encoded(databaseId)}/automations/validate`, {
      body: JSON.stringify({ dataSourceId, definition }),
      method: "POST",
    }),
  })
}
