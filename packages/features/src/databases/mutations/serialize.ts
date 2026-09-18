import type { QueryClient } from "@tanstack/react-query";

import type { ApiFetcher } from "../../shared/api-fetcher";
import type { DatabaseCommandAck } from "../core/entities";
import { executeDatabaseCommand } from "./execute";
import { invalidateDatabaseQueries } from "./invalidate";

const tails = new Map<string, Promise<void>>();

export function runSerialized<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  let releaseTail: () => void = () => undefined;
  const tail = new Promise<void>((resolve) => {
    releaseTail = resolve;
  });
  tails.set(key, tail);
  const next = prev.catch(() => undefined).then(fn);
  next.catch(() => undefined).finally(() => {
    if (tails.get(key) === tail) tails.delete(key);
    releaseTail();
  });
  return next;
}

export function dropSerializedQueue(key: string): void {
  tails.delete(key);
}

export const cellSerializationKey = (
  dataSourceId: string,
  rowId: string,
  propertyId: string,
) => `cell:${dataSourceId}:${rowId}:${propertyId}`;

export const orderingSerializationKey = (dataSourceId: string) =>
  `ordering:${dataSourceId}`;

export const viewSerializationKey = (hostDatabaseId: string) =>
  `view:${hostDatabaseId}`;

export const structuralSerializationKey = (dataSourceId: string) =>
  `structural:${dataSourceId}`;

export type SaveCellValueInput = {
  apiFetch: ApiFetcher;
  dataSourceId: string;
  hostDatabaseId: string;
  propertyId: string;
  queryClient: QueryClient;
  rowId: string;
  sessionId: string;
  value: unknown;
};

type QueuedCell = {
  input: SaveCellValueInput;
  reject: (error: unknown) => void;
  resolve: (ack: DatabaseCommandAck) => void;
};

const cellFlights = new Map<string, Promise<DatabaseCommandAck>>();
const cellQueued = new Map<string, QueuedCell>();

async function runCellCommand(
  input: SaveCellValueInput,
): Promise<DatabaseCommandAck> {
  const ack = await executeDatabaseCommand(
    input.apiFetch,
    {
      command: {
        propertyId: input.propertyId,
        rowId: input.rowId,
        type: "cell.set",
        value: input.value,
      },
      databaseId: input.hostDatabaseId,
      dataSourceId: input.dataSourceId,
    },
    {
      pendingTarget: {
        dataSourceId: input.dataSourceId,
        hostDatabaseId: input.hostDatabaseId,
        propertyId: input.propertyId,
        rowId: input.rowId,
      },
    },
  );
  invalidateDatabaseQueries(
    input.queryClient,
    input.sessionId,
    input.hostDatabaseId,
  );
  return ack;
}

async function runQueuedCell(key: string): Promise<void> {
  const queued = cellQueued.get(key);
  if (!queued) {
    cellFlights.delete(key);
    return;
  }
  cellQueued.delete(key);
  try {
    const ack = await runCellCommand(queued.input);
    if (cellQueued.has(key)) {
      const flight = Promise.resolve(ack);
      cellFlights.set(key, flight);
      void flight.then(() => runQueuedCell(key), () => runQueuedCell(key));
    } else {
      cellFlights.delete(key);
    }
    queued.resolve(ack);
  } catch (error) {
    if (cellQueued.has(key)) {
      const failed: Promise<DatabaseCommandAck> = Promise.reject(error);
      failed.catch(() => undefined);
      cellFlights.set(key, failed);
      void failed.catch(() => undefined).then(
        () => runQueuedCell(key),
        () => runQueuedCell(key),
      );
    } else {
      cellFlights.delete(key);
    }
    queued.reject(error);
  }
}

/**
 * Coalesced cell save: max 1 in flight + 1 queued latest per
 * (source, row, prop). Different cells run in parallel.
 * Bulk edit / drag-fill call this in a loop (still per-cell keys).
 */
export function saveCellValue(
  input: SaveCellValueInput,
): Promise<DatabaseCommandAck> {
  const key = cellSerializationKey(
    input.dataSourceId,
    input.rowId,
    input.propertyId,
  );
  const flight = cellFlights.get(key);
  if (flight) {
    const existing = cellQueued.get(key);
    if (existing) {
      existing.input = input;
      return new Promise<DatabaseCommandAck>((resolve, reject) => {
        const previousResolve = existing.resolve;
        const previousReject = existing.reject;
        // Chain waiters: all queued callers resolve with the same latest ack.
        existing.resolve = (ack) => {
          previousResolve(ack);
          resolve(ack);
        };
        existing.reject = (error) => {
          previousReject(error);
          reject(error);
        };
      });
    }
    let resolveQueued!: (ack: DatabaseCommandAck) => void;
    let rejectQueued!: (error: unknown) => void;
    const queuedPromise = new Promise<DatabaseCommandAck>((resolve, reject) => {
      resolveQueued = resolve;
      rejectQueued = reject;
    });
    cellQueued.set(key, { input, reject: rejectQueued, resolve: resolveQueued });
    void flight.then(
      () => runQueuedCell(key),
      () => runQueuedCell(key),
    );
    return queuedPromise;
  }
  const promise = runCellCommand(input);
  cellFlights.set(key, promise);
  void promise.then(
    () => {
      if (!cellQueued.has(key)) cellFlights.delete(key);
    },
    () => {
      if (!cellQueued.has(key)) cellFlights.delete(key);
    },
  );
  return promise;
}

/** Test-only: reset serialization state. */
export function clearSerializationStateForTests(): void {
  tails.clear();
  cellFlights.clear();
  cellQueued.clear();
}
