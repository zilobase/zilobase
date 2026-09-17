import {
  databaseCommandRequestSchema,
  dataSourceCommandSchema,
  hostDatabaseCommandSchema,
} from "@zilobase/features/databases/contracts"
import { Hono, type Context } from "hono"

import { pinnedResourceMiddleware } from  "../../auth/pinned-resource-middleware"
import type { AppBindings } from   "../../../shared/types"
import { readAuthenticatedJson } from   "../../../shared/http/auth"
import { getDatabaseRecord, requireDatabaseEditAccess } from  "../access/database-access"
import { requireDataSourceAccess, requireDataSourceEditAccess } from  "../access/data-source-access"
import { dispatchDatabaseCommand } from  "../commands/dispatcher"
import {
  CommandIdReusedError,
  executeDatabaseCommand,
  RowMoveConflictError,
} from  "../commands/framework"
import {
  recordDatabaseCounter,
  recordDatabaseHistogram,
} from   "../observability"

export const databaseCommandRoutes = new Hono<AppBindings>()
const databaseWorkspace = pinnedResourceMiddleware(getDatabaseRecord)

async function commandResponse(
  c: Context<AppBindings>,
  dataSourceId: string | null,
) {
  const authenticated = await readAuthenticatedJson(c)
  if (!authenticated.ok) return authenticated.response

  const request = databaseCommandRequestSchema.parse(authenticated.body)
  if (dataSourceId) dataSourceCommandSchema.parse(request.command)
  else hostDatabaseCommandSchema.parse(request.command)

  const databaseId = c.req.param("id")
  if (!databaseId) return c.json({ error: "Database ID is required" }, 400)
  await requireDatabaseEditAccess(databaseId, authenticated.user.id)
  if (dataSourceId) {
    await requireDataSourceEditAccess(dataSourceId, authenticated.user.id)
  } else if (
    request.command.type === "dataSource.link" ||
    request.command.type === "view.setDataSource"
  ) {
    await requireDataSourceAccess(
      request.command.dataSourceId,
      authenticated.user.id,
      "view",
    )
  }

  const startedAt = performance.now()
  const metricAttributes = {
    operation: request.command.type,
    scope: dataSourceId ? "source" as const : "host" as const,
  }
  try {
    const acknowledgement = await executeDatabaseCommand({
      actorId: authenticated.user.id,
      env: c.env,
      request,
      scope: { databaseId, dataSourceId },
    }, { dispatch: dispatchDatabaseCommand })
    recordDatabaseHistogram(
      "acknowledgement_latency_ms",
      performance.now() - startedAt,
      { ...metricAttributes, outcome: "success" },
    )
    return c.json(acknowledgement)
  } catch (error) {
    recordDatabaseHistogram(
      "acknowledgement_latency_ms",
      performance.now() - startedAt,
      { ...metricAttributes, outcome: "failure" },
    )
    if (error instanceof CommandIdReusedError) {
      return c.json({
        code: error.code,
        commandId: error.commandId,
        error: error.message,
      }, 409)
    }
    if (error instanceof RowMoveConflictError) {
      recordDatabaseCounter("ordering_conflict", {
        ...metricAttributes,
        outcome: "failure",
      })
      return c.json({
        code: error.code,
        error: error.message,
        rowId: error.rowId,
      }, 409)
    }
    throw error
  }
}

databaseCommandRoutes.post("/:id/commands", databaseWorkspace, (c) =>
  commandResponse(c, null)
)

databaseCommandRoutes.post(
  "/:id/data-sources/:dataSourceId/commands",
  databaseWorkspace,
  (c) => {
    const dataSourceId = c.req.param("dataSourceId")
    return dataSourceId
      ? commandResponse(c, dataSourceId)
      : c.json({ error: "Data source ID is required" }, 400)
  },
)
