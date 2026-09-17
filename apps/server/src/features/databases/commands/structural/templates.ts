import { eq, sql } from "drizzle-orm"
import type { DataSourceCommand } from "@zilobase/features/databases/contracts"

import { dataSource } from "../../../../infrastructure/database/schema"
import { ServiceMutationError } from "../../../../shared/errors/service-mutation-error"
import type { DatabaseCommandContext } from "../framework"
import { getDataSourceEntity } from "../metadata-entities"
import { sourceMutations, sourceRecord } from "../source-command-state"

type StoredTemplate = {
  archivedAt: string | null
  id: string
  name: string
  template: unknown
}

function templatesFromConfig(config: unknown): StoredTemplate[] {
  if (!config || typeof config !== "object" || Array.isArray(config)) return []
  const templates = (config as { templates?: unknown }).templates
  if (!Array.isArray(templates)) return []
  return templates.filter((item): item is StoredTemplate =>
    Boolean(item && typeof item === "object" && typeof (item as StoredTemplate).id === "string")
  )
}

export async function templateWrite(
  context: DatabaseCommandContext,
  command: Extract<DataSourceCommand, { type: "template.create" | "template.update" | "template.archive" | "template.restore" }>,
) {
  const source = await sourceRecord(context)
  const config = source.config && typeof source.config === "object" && !Array.isArray(source.config)
    ? { ...source.config as Record<string, unknown> }
    : {}
  const templates = templatesFromConfig(config)
  let result: StoredTemplate
  if (command.type === "template.create") {
    result = { archivedAt: null, id: crypto.randomUUID(), name: command.name, template: command.template }
    templates.push(result)
  } else {
    const index = templates.findIndex(({ id }) => id === command.templateId)
    if (index < 0) throw new ServiceMutationError("Template not found", 404)
    const current = templates[index]!
    if (command.type === "template.update") {
      const template = current.template && typeof current.template === "object" && !Array.isArray(current.template) && command.patch && typeof command.patch === "object" && !Array.isArray(command.patch)
        ? { ...current.template as Record<string, unknown>, ...command.patch as Record<string, unknown> }
        : command.patch
      result = { ...current, template }
    } else {
      result = { ...current, archivedAt: command.type === "template.archive" ? new Date().toISOString() : null }
    }
    templates[index] = result
  }
  await context.transaction.update(dataSource).set({
    config: { ...config, templates },
    configVersion: sql`${dataSource.configVersion} + 1`,
    updatedAt: new Date(),
  }).where(eq(dataSource.id, source.id))
  return {
    mutations: await sourceMutations(context, ["dataSources"], async (databaseId) => ({
      dataSources: [await getDataSourceEntity(context, databaseId, source.id)],
    })),
    result,
  }
}
