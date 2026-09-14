import {
  databaseCommandRequestSchema,
  dataSourceCommandSchema,
  hostDatabaseCommandSchema,
} from "@zilobase/features/databases/contracts"
import { Hono, type Context } from "hono"

import { pinnedResourceMiddleware } from "../auth/pinned-resource-middleware"
import type { AppBindings } from "../../shared/types"
import { readAuthenticatedJson } from "../../shared/http/auth"
import { getDatabaseRecord, requireDatabaseEditAccess } from "./access/database-access"
import { requireDataSourceEditAccess } from "./access/data-source-access"
import { dispatchDatabaseCommand } from "./commands/dispatcher"
import {
  CommandIdReusedError,
  executeDatabaseCommand,
  RowMoveConflictError,
} from "./commands/framework"

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
  }

  try {
    return c.json(await executeDatabaseCommand({
      actorId: authenticated.user.id,
      request,
      scope: { databaseId, dataSourceId },
    }, { dispatch: dispatchDatabaseCommand }))
  } catch (error) {
    if (error instanceof CommandIdReusedError) {
      return c.json({
        code: error.code,
        commandId: error.commandId,
        error: error.message,
      }, 409)
    }
    if (error instanceof RowMoveConflictError) {
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
