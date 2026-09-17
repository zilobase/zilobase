import type { DatabaseClientCommand } from "./db-client"

type LaneCompletion = {
  error?: unknown
  succeeded: boolean
}

type Lane = {
  tail: Promise<LaneCompletion>
}

export class DatabaseDependentCommandCancelledError extends Error {
  readonly code = "DEPENDENT_COMMAND_CANCELLED" as const

  constructor(
    readonly lane: string,
    readonly cause: unknown,
  ) {
    super("A dependent database ordering command was cancelled")
    this.name = "DatabaseDependentCommandCancelledError"
  }
}

export class DatabaseCommandLanes {
  private readonly lanes = new Map<string, Lane>()

  run<TResult>(
    laneKey: string,
    cancelAfterFailure: boolean,
    operation: () => Promise<TResult>,
  ) {
    const predecessor = this.lanes.get(laneKey)?.tail ?? Promise.resolve({
      succeeded: true,
    })
    const execution = predecessor.then((previous) => {
      if (cancelAfterFailure && !previous.succeeded) {
        throw new DatabaseDependentCommandCancelledError(
          laneKey,
          previous.error,
        )
      }
      return operation()
    })
    const tail = execution.then<LaneCompletion, LaneCompletion>(
      () => ({ succeeded: true }),
      (error) => ({ error, succeeded: false }),
    )
    this.lanes.set(laneKey, { tail })
    void tail.then(() => {
      if (this.lanes.get(laneKey)?.tail === tail) this.lanes.delete(laneKey)
    })
    return execution
  }

  clear() {
    this.lanes.clear()
  }
}

export function databaseCommandLane(input: DatabaseClientCommand) {
  const command = input.command
  if (command.type === "row.move") {
    return {
      cancelAfterFailure: true,
      key: `ordering:${requiredDataSourceId(input)}`,
    }
  }
  if (command.type === "cell.set") {
    return {
      cancelAfterFailure: false,
      key: [
        "cell",
        requiredDataSourceId(input),
        command.rowId,
        command.propertyId,
      ].join(":"),
    }
  }
  if (
    command.type === "database.update" ||
    command.type === "dataSource.create" ||
    command.type === "dataSource.link" ||
    command.type === "dataSource.unlink" ||
    command.type.startsWith("view.")
  ) {
    if (input.dataSourceId) {
      throw new Error(`Command ${command.type} must use the host scope`)
    }
    return {
      cancelAfterFailure: false,
      key: `view:${input.databaseId}`,
    }
  }
  return {
    cancelAfterFailure: false,
    key: `structural:${requiredDataSourceId(input)}`,
  }
}

function requiredDataSourceId(input: DatabaseClientCommand) {
  if (!input.dataSourceId) {
    throw new Error(`Command ${input.command.type} requires a data source`)
  }
  return input.dataSourceId
}
