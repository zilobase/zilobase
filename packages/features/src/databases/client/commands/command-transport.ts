import type { ApiFetcher } from "../../../shared/api-fetcher"
import { databaseCommandAckSchema } from  "../../core/entities"
import type { DatabaseClientCommand } from "../db-client"

/** The server may have committed even when the acknowledgement was lost. */
export class DatabaseCommandUnconfirmedError extends Error {
  constructor(cause: unknown) {
    super("Could not confirm the save. Reload to check before repeating the edit.", { cause })
    this.name = "DatabaseCommandUnconfirmedError"
  }
}

export async function sendDatabaseCommand(
  apiFetch: ApiFetcher,
  input: DatabaseClientCommand,
  commandId: string,
) {
  const endpoint = `/databases/${encodeURIComponent(input.databaseId)}` +
    (input.dataSourceId
      ? `/data-sources/${encodeURIComponent(input.dataSourceId)}/commands`
      : "/commands")
  // Serialize once: receipt replay requires the identical command ID and body.
  const body = JSON.stringify({ command: input.command, commandId, protocolVersion: 2 })
  for (let attempt = 0; ; attempt += 1) {
    let response: unknown
    try {
      response = await apiFetch(endpoint, { body, method: "POST" })
    } catch (error) {
      if (!isUnconfirmed(error)) throw error
      if (attempt === 0 && (typeof navigator === "undefined" || navigator.onLine !== false)) continue
      throw new DatabaseCommandUnconfirmedError(error)
    }
    try {
      const acknowledgement = databaseCommandAckSchema.parse(response)
      if (acknowledgement.commandId !== commandId ||
          acknowledgement.event.commandId !== commandId) {
        throw new Error("Database command acknowledgement ID does not match")
      }
      if (acknowledgement.event.databaseId !== input.databaseId ||
          (input.dataSourceId && acknowledgement.event.dataSourceId !== input.dataSourceId)) {
        throw new Error("Database command acknowledgement scope does not match")
      }
      return acknowledgement
    } catch (error) {
      throw new DatabaseCommandUnconfirmedError(error)
    }
  }
}

function isUnconfirmed(error: unknown) {
  if (error instanceof TypeError) return true
  if (!error || typeof error !== "object") return false
  const status = "status" in error ? error.status : undefined
  return status === 408 || (typeof status === "number" && status >= 500)
}
