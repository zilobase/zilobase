import { useEffect, useMemo, useState } from "react"
import {
  mailDatabaseSyncStatusQueryOptions,
  mailSystemPropertyCatalog,
  type MailCustomPropertyType,
  type MailDatabaseFieldMapping,
  type MailPersistedView,
  type MailPropertyDefinition,
} from "@zilobase/features/mail"
import { useAddDatabaseProperty, useCreateDatabase, useCreateDatabaseDataSource, useDatabase } from "@zilobase/features/databases"
import { usePageNavigation } from "@zilobase/features/pages"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"

import { getApiErrorMessage } from "@/features/desktop/network/api"
import { apiFetch } from "@/features/desktop/network/api"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
import { Input } from "@/shared/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"

type SourceProperty = { id: string; label: string; type: string }

export function MailDatabaseSyncPanel({ config, onChange, properties, saving, viewId, viewName, workspaceId }: {
  config: MailPersistedView["config"]
  onChange: (config: MailPersistedView["config"]) => Promise<void>
  properties: MailPropertyDefinition[]
  saving: boolean
  viewId: string
  viewName: string
  workspaceId: string
}) {
  const configKey = JSON.stringify(config.databaseSync)
  const [draft, setDraft] = useState(config.databaseSync)
  useEffect(() => setDraft(config.databaseSync), [configKey])
  const navigation = usePageNavigation(workspaceId)
  const selectedDatabase = useDatabase(draft.destinationDatabaseId, {
    dataSourceId: draft.destinationDataSourceId ?? undefined,
    schemaOnly: true,
  })
  const createDatabase = useCreateDatabase()
  const createDataSource = useCreateDatabaseDataSource()
  const addProperty = useAddDatabaseProperty()
  const syncStatus = useQuery(mailDatabaseSyncStatusQueryOptions(apiFetch, {
    enabled: config.databaseSync.enabled,
    viewId,
    workspaceId,
  }))
  const sources = useMemo<SourceProperty[]>(() => [
    ...mailSystemPropertyCatalog.map((property) => ({ id: property.id, label: property.label, type: property.type })),
    ...properties.map((property) => ({ id: property.id, label: property.name, type: property.type })),
  ], [properties])
  const selectedSource = selectedDatabase.data?.activeDataSource
  const destinationProperties = selectedDatabase.data?.properties ?? []
  const working = saving || createDatabase.isPending || createDataSource.isPending || addProperty.isPending
  const hasRequiredTitle = draft.mappings.some((mapping) => mapping.sourcePropertyId === "subject" && mapping.destinationPropertyId === "title")
  const complete = Boolean(draft.destinationDatabaseId && draft.destinationDataSourceId && hasRequiredTitle && draft.mappings.every((mapping) => mapping.sourcePropertyId && mapping.destinationPropertyId))

  const selectDatabase = (databaseId: string) => {
    const database = navigation.data?.databases.find((item) => item.id === databaseId)
    const dataSourceId = database?.views[0]?.dataSourceId ?? null
    setDraft((current) => ({
      ...current,
      destinationDataSourceId: dataSourceId,
      destinationDatabaseId: databaseId,
      mappings: requiredTitleMapping(current.mappings),
      workspaceId,
    }))
  }
  const save = async () => {
    if (draft.enabled && !config.databaseSync.enabled && !window.confirm("Mail data synced to this database will be visible to everyone who can access the destination database. Enable new-only sync?")) return
    try {
      await onChange({ ...config, databaseSync: { ...draft, activatedAt: draft.enabled ? config.databaseSync.activatedAt : null, workspaceId } })
      toast.success(draft.enabled ? "Database sync enabled for new matching mail" : "Database sync configuration saved")
    } catch (error) {
      toast.error(getApiErrorMessage(error))
    }
  }
  const createDestination = async () => {
    try {
      const payload = await createDatabase.mutateAsync({ name: `${viewName} mail`, standalone: true, workspaceId })
      setDraft((current) => ({
        ...current,
        destinationDataSourceId: payload.activeDataSource?.id ?? null,
        destinationDatabaseId: payload.database.id,
        mappings: requiredTitleMapping(current.mappings),
        workspaceId,
      }))
    } catch (error) { toast.error(getApiErrorMessage(error)) }
  }
  const createDestinationDataSource = async () => {
    if (!draft.destinationDatabaseId) return
    try {
      const existingIds = new Set(selectedDatabase.data?.dataSources.map((source) => source.id) ?? [])
      const payload = await createDataSource.mutateAsync({ databaseId: draft.destinationDatabaseId, name: `${viewName} mail` })
      const created = payload.dataSources.find((source) => !existingIds.has(source.id))
      setDraft((current) => ({ ...current, destinationDataSourceId: created?.id ?? current.destinationDataSourceId, mappings: requiredTitleMapping(current.mappings) }))
    } catch (error) { toast.error(getApiErrorMessage(error)) }
  }
  const createMappedProperty = async (mapping: MailDatabaseFieldMapping) => {
    const source = sources.find((item) => item.id === mapping.sourcePropertyId)
    if (!selectedSource || !source) return
    try {
      await addProperty.mutateAsync({ databaseId: selectedSource.id, name: source.label, type: destinationType(source.type) })
      await selectedDatabase.refetch()
      toast.success(`Created ${source.label}`)
    } catch (error) { toast.error(getApiErrorMessage(error)) }
  }

  return (
    <div className="w-80 space-y-3 p-2">
      <div>
        <div className="text-xs font-medium text-content-secondary">Destination workspace</div>
        <Input aria-label="Destination workspace" className="mt-1" disabled value="Current workspace" />
        <p className="mt-1 text-xs text-content-secondary">Mail never syncs across workspace boundaries.</p>
      </div>
      <div>
        <div className="flex items-center justify-between"><label className="text-xs font-medium text-content-secondary" htmlFor="mail-sync-database">Database</label><Button disabled={working || config.databaseSync.enabled} onClick={() => void createDestination()} size="sm" type="button" variant="ghost">Create new</Button></div>
        <Select disabled={working || config.databaseSync.enabled} onValueChange={selectDatabase} value={draft.destinationDatabaseId ?? "none"}>
          <SelectTrigger id="mail-sync-database" className="w-full"><SelectValue placeholder="Select a database" /></SelectTrigger>
          <SelectContent><SelectItem value="none" disabled>Select a database</SelectItem>{(navigation.data?.databases ?? []).map((database) => <SelectItem key={database.id} value={database.id}>{database.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {draft.destinationDatabaseId ? (
        <div>
          <div className="flex items-center justify-between"><label className="text-xs font-medium text-content-secondary" htmlFor="mail-sync-source">Data source</label><Button disabled={working || config.databaseSync.enabled} onClick={() => void createDestinationDataSource()} size="sm" type="button" variant="ghost">Create source</Button></div>
          <Select disabled={working || config.databaseSync.enabled || selectedDatabase.isLoading} onValueChange={(destinationDataSourceId) => setDraft((current) => ({ ...current, destinationDataSourceId, mappings: requiredTitleMapping(current.mappings) }))} value={draft.destinationDataSourceId ?? "none"}>
            <SelectTrigger id="mail-sync-source" className="w-full"><SelectValue placeholder="Select a data source" /></SelectTrigger>
            <SelectContent><SelectItem value="none" disabled>Select a data source</SelectItem>{(selectedDatabase.data?.dataSources ?? []).map((source) => <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="space-y-2 border-t border-stroke-default pt-3">
        <div className="text-xs font-medium text-content-secondary">Explicit field mappings</div>
        {draft.mappings.map((mapping, index) => (
          <MappingRow
            destinationProperties={destinationProperties}
            key={`${mapping.sourcePropertyId}:${index}`}
            mapping={mapping}
            onChange={(next) => setDraft((current) => ({ ...current, mappings: current.mappings.map((item, itemIndex) => itemIndex === index ? next : item) }))}
            onCreate={() => void createMappedProperty(mapping)}
            onRemove={mapping.sourcePropertyId === "subject" ? undefined : () => setDraft((current) => ({ ...current, mappings: current.mappings.filter((_, itemIndex) => itemIndex !== index) }))}
            sources={sources}
            working={working}
          />
        ))}
        <Button disabled={working || draft.mappings.length >= Math.min(50, sources.length)} onClick={() => setDraft((current) => ({ ...current, mappings: [...current.mappings, nextMapping(current.mappings, sources, destinationProperties)] }))} size="sm" type="button" variant="outline">Add mapping</Button>
        <p className="text-xs text-content-secondary">Subject → Title is required. Destination properties are created only when you explicitly choose Create property.</p>
      </div>
      <label className="flex items-start gap-2 rounded-md border border-stroke-default bg-surface-secondary p-2 text-sm">
        <Checkbox checked={draft.enabled} disabled={working || !complete} onCheckedChange={(checked) => setDraft((current) => ({ ...current, enabled: checked === true }))} />
        <span><span className="block font-medium text-content-primary">Sync new matching mail</span><span className="block text-xs text-content-secondary">Enabling records the cutoff now. Existing mail is never backfilled, and disabling never removes database rows.</span></span>
      </label>
      {syncStatus.data ? <p className="text-xs text-content-secondary">{syncStatus.data.synced} synced · {syncStatus.data.pending} pending{syncStatus.data.paused ? ` · ${syncStatus.data.paused} paused: ${syncStatus.data.lastError ?? "destination unavailable"}` : ""}</p> : null}
      <Button className="w-full" disabled={working || (draft.enabled && !complete)} onClick={() => void save()} type="button">{working ? "Saving…" : "Save database sync"}</Button>
    </div>
  )
}

function MappingRow({ destinationProperties, mapping, onChange, onCreate, onRemove, sources, working }: {
  destinationProperties: NonNullable<ReturnType<typeof useDatabase>["data"]>["properties"]
  mapping: MailDatabaseFieldMapping
  onChange: (mapping: MailDatabaseFieldMapping) => void
  onCreate: () => void
  onRemove?: () => void
  sources: SourceProperty[]
  working: boolean
}) {
  const source = sources.find((item) => item.id === mapping.sourcePropertyId)
  const compatible = destinationProperties.filter((property) => source && mappingCompatible(source.type, property.property.type))
  const required = mapping.sourcePropertyId === "subject"
  return <div className="rounded-md border border-stroke-default p-2">
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
      <Select disabled={working || required} onValueChange={(sourcePropertyId) => onChange({ ...mapping, destinationPropertyId: "", sourcePropertyId })} value={mapping.sourcePropertyId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{sources.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select>
      <span className="text-content-secondary">→</span>
      <Select disabled={working || required} onValueChange={(destinationPropertyId) => onChange({ ...mapping, destinationPropertyId })} value={mapping.destinationPropertyId || "none"}><SelectTrigger><SelectValue placeholder="Property" /></SelectTrigger><SelectContent>{required ? <SelectItem value="title">Title</SelectItem> : <SelectItem disabled value="none">Choose property</SelectItem>}{compatible.map((property) => <SelectItem key={property.property.id} value={property.property.id}>{property.property.name}</SelectItem>)}</SelectContent></Select>
    </div>
    {!required ? <div className="mt-1 flex justify-end gap-1"><Button disabled={working || !source} onClick={onCreate} size="sm" type="button" variant="ghost">Create property</Button><Button disabled={working} onClick={onRemove} size="sm" type="button" variant="ghost">Remove</Button></div> : null}
  </div>
}

function requiredTitleMapping(mappings: MailDatabaseFieldMapping[]) {
  return [{ sourcePropertyId: "subject", destinationPropertyId: "title" }, ...mappings.filter((mapping) => mapping.sourcePropertyId !== "subject" && mapping.destinationPropertyId !== "title")]
}

function nextMapping(existing: MailDatabaseFieldMapping[], sources: SourceProperty[], destinations: NonNullable<ReturnType<typeof useDatabase>["data"]>["properties"]): MailDatabaseFieldMapping {
  const source = sources.find((item) => item.id !== "subject" && !existing.some((mapping) => mapping.sourcePropertyId === item.id))
  const destination = source ? destinations.find((property) => !existing.some((mapping) => mapping.destinationPropertyId === property.property.id) && mappingCompatible(source.type, property.property.type)) : null
  return { destinationPropertyId: destination?.property.id ?? "", sourcePropertyId: source?.id ?? "" }
}

function mappingCompatible(sourceType: string, destinationPropertyType: string) {
  if (sourceType === "address") return destinationPropertyType === "text" || destinationPropertyType === "email"
  if (sourceType === "boolean") return destinationPropertyType === "checkbox"
  if (sourceType === "mailbox" || sourceType === "select") return ["text", "select", "multi_select", "status"].includes(destinationPropertyType)
  return sourceType === destinationPropertyType
}

function destinationType(sourceType: string): MailCustomPropertyType | "email" {
  if (sourceType === "address") return "email"
  if (sourceType === "boolean") return "checkbox"
  if (sourceType === "mailbox") return "select"
  return sourceType as MailCustomPropertyType
}
