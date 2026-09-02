import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from "../../shared/context"
import type {
  DatabaseAutomationCatalog,
  DatabaseAutomationDetail,
  DatabaseAutomationRun,
  DatabaseAutomationSummary,
} from "./contracts"

export const databaseAutomationKeys = {
  all: ["database-automations"] as const,
  catalog: (databaseId: string, dataSourceId: string) =>
    [...databaseAutomationKeys.all, "catalog", databaseId, dataSourceId] as const,
  capability: (workspaceId: string) =>
    [...databaseAutomationKeys.all, "capability", workspaceId] as const,
  detail: (databaseId: string, automationId: string) =>
    [...databaseAutomationKeys.all, "detail", databaseId, automationId] as const,
  list: (databaseId: string, dataSourceId: string) =>
    [...databaseAutomationKeys.all, "list", databaseId, dataSourceId] as const,
  runs: (databaseId: string, automationId: string) =>
    [...databaseAutomationKeys.detail(databaseId, automationId), "runs"] as const,
  run: (databaseId: string, automationId: string, runId: string) =>
    [...databaseAutomationKeys.runs(databaseId, automationId), runId] as const,
}

const encoded = (value: string) => encodeURIComponent(value)

export const databaseAutomationCapabilityQueryOptions = (
  apiFetch: ApiFetcher,
  databaseId: string | null | undefined,
  workspaceId: string | null | undefined,
) => queryOptions({
  enabled: Boolean(databaseId && workspaceId),
  queryFn: () => apiFetch<{ enabled: boolean }>(
    `/databases/${encoded(databaseId!)}/automation-capability?workspaceId=${encoded(workspaceId!)}`,
  ),
  queryKey: databaseAutomationKeys.capability(workspaceId ?? "missing"),
  staleTime: 60_000,
})

export const databaseAutomationListQueryOptions = (
  apiFetch: ApiFetcher,
  databaseId: string,
  dataSourceId: string,
) => queryOptions({
  queryFn: () => apiFetch<{ automations: DatabaseAutomationSummary[] }>(
    `/databases/${encoded(databaseId)}/automations?dataSourceId=${encoded(dataSourceId)}`,
  ),
  queryKey: databaseAutomationKeys.list(databaseId, dataSourceId),
})

export const databaseAutomationCatalogQueryOptions = (
  apiFetch: ApiFetcher,
  databaseId: string,
  dataSourceId: string,
) => queryOptions({
  queryFn: () => apiFetch<DatabaseAutomationCatalog>(
    `/databases/${encoded(databaseId)}/automation-catalog?dataSourceId=${encoded(dataSourceId)}`,
  ),
  queryKey: databaseAutomationKeys.catalog(databaseId, dataSourceId),
  staleTime: 30_000,
})

export const databaseAutomationDetailQueryOptions = (
  apiFetch: ApiFetcher,
  databaseId: string,
  automationId: string,
) => queryOptions({
  enabled: Boolean(databaseId && automationId),
  queryFn: () => apiFetch<DatabaseAutomationDetail>(
    `/databases/${encoded(databaseId)}/automations/${encoded(automationId)}`,
  ),
  queryKey: databaseAutomationKeys.detail(databaseId, automationId),
})

export const databaseAutomationRunsQueryOptions = (
  apiFetch: ApiFetcher,
  databaseId: string,
  automationId: string,
) => queryOptions({
  enabled: Boolean(databaseId && automationId),
  queryFn: () => apiFetch<{ runs: DatabaseAutomationRun[] }>(
    `/databases/${encoded(databaseId)}/automations/${encoded(automationId)}/runs`,
  ),
  queryKey: databaseAutomationKeys.runs(databaseId, automationId),
})

export const databaseAutomationRunQueryOptions = (
  apiFetch: ApiFetcher,
  databaseId: string,
  automationId: string,
  runId: string,
) => queryOptions({
  enabled: Boolean(databaseId && automationId && runId),
  queryFn: () => apiFetch<DatabaseAutomationRun>(
    `/databases/${encoded(databaseId)}/automations/${encoded(automationId)}/runs/${encoded(runId)}`,
  ),
  queryKey: databaseAutomationKeys.run(databaseId, automationId, runId),
})
