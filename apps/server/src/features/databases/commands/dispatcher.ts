import type { DatabaseCommandDispatcher } from "./framework"
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error"
import { dispatchRowOrCellCommand } from "./row-handlers"
import { dispatchStructuralCommand } from "./structural-handlers"

/** Commands are registered here as their domain operations migrate in passes 10 and 11. */
export const dispatchDatabaseCommand = (async (context, command) => {
  const rowResult = context.dataSourceId
    ? await dispatchRowOrCellCommand(context, command as never)
    : null
  if (rowResult) return rowResult
  const structuralResult = await dispatchStructuralCommand(context, command as never)
  if (structuralResult) return structuralResult
  throw new ServiceMutationError("Database command has not been migrated", 501)
}) as DatabaseCommandDispatcher
