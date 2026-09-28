import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useZilobaseFeatures } from "../../shared/context";
import type {
  ChangeRowCommand,
  DatabaseRecordEntity,
  DatabaseBootstrapResponse,
} from "../core/entities";
import { projectDatabaseMetadata } from "./metadata";
import { useDatabaseSessionId } from "../queries/session";
import { databaseController } from "./store";
import { projectRecordInteractions, type RecordEffect } from "./model";
import { changeRecordHierarchy } from "./hierarchy";
import type { DatabaseCommandTarget } from "../mutations/pending";

export function useDatabaseEntityCommandState(target: DatabaseCommandTarget) {
  const state = useDatabaseController().commandState;
  return useSyncExternalStore(
    state.subscribe,
    () => state.get(target),
    () => state.get(target),
  );
}

export function useDatabaseController() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();
  return databaseController(queryClient, sessionId, apiFetch);
}

export function useProjectedDatabaseBootstrap(snapshot: DatabaseBootstrapResponse | undefined) {
  const controller = useDatabaseController();
  const intentions = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const key = useRef({});
  useEffect(() => {
    if (snapshot) controller.observeBootstrap(key.current, snapshot);
    else controller.unobserve(key.current);
  }, [controller, snapshot]);
  useEffect(() => {
    const token = key.current;
    return () => controller.unobserve(token);
  }, [controller]);
  return useMemo(
    () => (snapshot ? projectDatabaseMetadata(snapshot, intentions) : undefined),
    [snapshot, intentions],
  );
}

export function useProjectedDatabaseRecords(input: {
  dataSourceId: string | null;
  sourceVersion: number | null;
  records: DatabaseRecordEntity[];
}) {
  const store = useDatabaseController();
  const interactions = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const key = useRef({});
  useEffect(() => {
    if (input.dataSourceId)
      store.observe(key.current, {
        dataSourceId: input.dataSourceId,
        sourceVersion: input.sourceVersion,
      });
  }, [store, input.dataSourceId, input.sourceVersion]);
  useEffect(() => {
    const token = key.current;
    return () => store.unobserve(token);
  }, [store]);
  return useMemo(
    () =>
      input.dataSourceId
        ? projectRecordInteractions(input.records, interactions, {
            dataSourceId: input.dataSourceId,
            sourceVersion: input.sourceVersion,
          })
        : input.records,
    [input.records, input.dataSourceId, input.sourceVersion, interactions],
  );
}

export type ChangeDatabaseRowInput = Omit<ChangeRowCommand, "type"> & {
  databaseId: string;
  dataSourceId: string;
};

export function submitRecordChange(
  store: ReturnType<typeof useDatabaseController>,
  input: ChangeDatabaseRowInput,
) {
  const { databaseId, dataSourceId, ...change } = input;
  if (change.placement)
    change.placement = {
      afterRowId: change.placement.afterRowId,
      beforeRowId: change.placement.beforeRowId,
    };
  if (change.placement) {
    // A second gesture expresses the currently displayed destination, even if
    // the preceding move is subsequently rejected.
    for (const interaction of [...store.getSnapshot()].reverse()) {
      if (interaction.status === "committed") continue;
      for (const effect of interaction.effects) {
        if (effect.dataSourceId !== dataSourceId || effect.rowId !== input.rowId || effect.remove)
          continue;
        if (effect.values)
          change.valuesByPropertyId = { ...effect.values, ...change.valuesByPropertyId };
        if (change.title === undefined && effect.title !== undefined) change.title = effect.title;
      }
    }
  }
  const rows = store.records(dataSourceId);
  const record = rows.find(({ id }) => id === input.rowId);
  const effects: RecordEffect[] = [
    {
      dataSourceId,
      rowId: input.rowId,
      record,
      placement: change.placement,
      title: change.title,
      values: change.valuesByPropertyId,
      ...(input.hierarchy ? { parentRowId: input.hierarchy.parentRowId } : {}),
    },
  ];
  if (input.hierarchy) {
    for (const value of changeRecordHierarchy({
      ...input.hierarchy,
      rowId: input.rowId,
      rows,
      values: rows.flatMap(({ valuesByPropertyId }) => Object.values(valuesByPropertyId)),
    })) {
      effects.push({
        dataSourceId,
        rowId: value.rowId,
        values: { [value.propertyId]: value.value },
      });
    }
  }
  return store.submit(
    { databaseId, dataSourceId, command: { ...change, type: "row.change" } },
    effects,
  );
}

export function useChangeDatabaseRow() {
  const store = useDatabaseController();
  const interactions = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const mutateAsync = (input: ChangeDatabaseRowInput) => {
    try {
      return submitRecordChange(store, input).then((ack) => ack.result as DatabaseRecordEntity);
    } catch (error) {
      return Promise.reject(error);
    }
  };
  return {
    isPending: interactions.length > 0,
    mutateAsync,
    mutate(
      input: ChangeDatabaseRowInput,
      callbacks?: {
        onError?: (error: Error) => void;
        onSuccess?: (record: DatabaseRecordEntity) => void;
      },
    ) {
      void mutateAsync(input).then(callbacks?.onSuccess, (error) =>
        callbacks?.onError?.(error instanceof Error ? error : new Error(String(error))),
      );
    },
  };
}

export function useDatabaseInteractionRecovery() {
  const store = useDatabaseController();
  const interactions = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return {
    retry: () => store.retryUnconfirmed(),
    hasUnconfirmed: interactions.some(({ status }) => status === "unconfirmed"),
  };
}
