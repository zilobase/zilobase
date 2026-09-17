import type { ApiFetcher } from "../../shared/api-fetcher";
import {
  databaseCommandAckSchema,
  type DatabaseCommand,
  type DatabaseCommandAck,
} from "../core/entities";
import {
  beginPending,
  endPending,
  targetsForCommand,
  type DatabaseCommandTarget,
} from "./pending";

export class DatabaseCommandUnconfirmedError extends Error {
  constructor(cause: unknown) {
    super(
      "Could not confirm the save. Reload to check before repeating the edit.",
      { cause },
    );
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
  constructor(
    message = "You are offline. Reconnect and try your edit again.",
  ) {
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
  pendingTarget?: DatabaseCommandTarget;
};

export async function executeDatabaseCommand(
  apiFetch: ApiFetcher,
  input: DatabaseCommandInput,
  opts?: ExecuteDatabaseCommandOptions,
): Promise<DatabaseCommandAck> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new OfflineError();
  }

  const commandId = crypto.randomUUID();
  const endpoint = `/databases/${encodeURIComponent(input.databaseId)}` +
    (input.dataSourceId
      ? `/data-sources/${encodeURIComponent(input.dataSourceId)}/commands`
      : "/commands");
  // Serialize ONCE — receipt replay requires identical ID + body
  const body = JSON.stringify({
    command: input.command,
    commandId,
    protocolVersion: 2,
  });

  const targets = opts?.pendingTarget
    ? [opts.pendingTarget]
    : targetsForCommand(input);
  beginPending(targets);
  for (let attempt = 0;; attempt += 1) {
    let raw: unknown;
    try {
      raw = await apiFetch(endpoint, { body, method: "POST" });
    } catch (error) {
      if (!isRetryable(error)) {
        endPending(targets, toError(error));
        throw error;
      }
      if (
        attempt === 0 &&
        (typeof navigator === "undefined" || navigator.onLine !== false)
      ) {
        continue; // retry once with same body
      }
      const unconfirmed = new DatabaseCommandUnconfirmedError(error);
      endPending(targets, unconfirmed);
      throw unconfirmed;
    }
    try {
      const ack = databaseCommandAckSchema.parse(raw);
      if (
        ack.commandId !== commandId || ack.event.commandId !== commandId
      ) {
        throw new Error("ack id mismatch");
      }
      if (ack.event.databaseId !== input.databaseId) {
        throw new Error("ack scope mismatch");
      }
      if (
        input.dataSourceId &&
        ack.event.dataSourceId !== input.dataSourceId
      ) {
        throw new Error("ack scope mismatch");
      }
      endPending(targets, null);
      return ack;
    } catch (error) {
      const unconfirmed = error instanceof DatabaseCommandUnconfirmedError
        ? error
        : new DatabaseCommandUnconfirmedError(error);
      endPending(targets, unconfirmed);
      throw unconfirmed;
    }
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof TypeError) return true; // network down
  const status = (error as { status?: unknown })?.status;
  return status === 408 || (typeof status === "number" && status >= 500);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
