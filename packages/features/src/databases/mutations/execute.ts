import type { ApiFetcher } from "../../shared/api-fetcher";
import {
  databaseCommandAckSchema,
  type DatabaseCommand,
  type DatabaseCommandAck,
} from "../core/entities";

export class DatabaseCommandUnconfirmedError extends Error {
  constructor(cause: unknown) {
    super("Could not confirm the save. Reload to check before repeating the edit.", { cause });
    this.name = "DatabaseCommandUnconfirmedError";
  }
}

export class DatabaseReconciliationError extends Error {
  constructor(cause?: unknown) {
    super(
      "Your change was saved, but this view could not refresh. Reload to see the saved data.",
      cause === undefined ? undefined : { cause },
    );
    this.name = "DatabaseReconciliationError";
  }
}

export class OfflineError extends Error {
  constructor(message = "You are offline. Reconnect and try your edit again.") {
    super(message);
    this.name = "OfflineError";
  }
}

export type DatabaseCommandInput = {
  command: DatabaseCommand;
  databaseId: string;
  dataSourceId?: string | null;
};

export type ExecuteDatabaseCommandOptions = {
  commandId?: string;
};

export async function executeDatabaseCommand(
  apiFetch: ApiFetcher,
  input: DatabaseCommandInput,
  opts?: ExecuteDatabaseCommandOptions,
): Promise<DatabaseCommandAck> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new OfflineError();
  }

  const commandId = opts?.commandId ?? crypto.randomUUID();
  const endpoint =
    input.command.type === "database.create"
      ? "/databases/commands"
      : `/databases/${encodeURIComponent(input.databaseId)}` +
        (input.dataSourceId
          ? `/data-sources/${encodeURIComponent(input.dataSourceId)}/commands`
          : "/commands");
  // Serialize ONCE — receipt replay requires identical ID + body
  const body = JSON.stringify({
    command: input.command,
    commandId,
    protocolVersion: 2,
  });

  for (let attempt = 0; ; attempt += 1) {
    let raw: unknown;
    try {
      raw = await apiFetch(endpoint, { body, method: "POST" });
    } catch (error) {
      if (!isRetryable(error)) {
        throw error;
      }
      if (attempt === 0 && (typeof navigator === "undefined" || navigator.onLine !== false)) {
        continue; // retry once with same body
      }
      const unconfirmed = new DatabaseCommandUnconfirmedError(error);
      throw unconfirmed;
    }
    try {
      const ack = databaseCommandAckSchema.parse(raw);
      if (ack.commandId !== commandId || (ack.event && ack.event.commandId !== commandId)) {
        throw new Error("ack id mismatch");
      }
      if ((ack.event?.databaseId ?? ack.privateConfirmation?.databaseId) !== input.databaseId) {
        throw new Error("ack scope mismatch");
      }
      if (input.dataSourceId && ack.event?.dataSourceId !== input.dataSourceId) {
        throw new Error("ack scope mismatch");
      }
      if ((input.command.type === "database.favorite") !== (ack.event === null))
        throw new Error("ack visibility mismatch");
      return ack;
    } catch (error) {
      const unconfirmed =
        error instanceof DatabaseCommandUnconfirmedError
          ? error
          : new DatabaseCommandUnconfirmedError(error);
      throw unconfirmed;
    }
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof TypeError) return true; // network down
  const status = (error as { status?: unknown })?.status;
  return status === 408 || (typeof status === "number" && status >= 500);
}
