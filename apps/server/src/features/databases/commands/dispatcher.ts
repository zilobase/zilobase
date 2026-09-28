import type { DatabaseCommandDispatcher } from "./framework";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { dispatchRecordCommand } from "./records";
import { dispatchStructuralCommand } from "./structural/dispatch";
import { dispatchLifecycleCommand } from "./lifecycle";
import { clearViewSort } from "./structural/views";

/** The sole host/source command dispatch boundary. */
export const dispatchDatabaseCommand = (async (context, command) => {
  const lifecycle = await dispatchLifecycleCommand(context, command);
  if (lifecycle) return lifecycle;
  const rowResult = context.dataSourceId
    ? await dispatchRecordCommand(context, command as never)
    : null;
  if (rowResult) {
    if (
      (command.type === "row.change" || command.type === "row.place") &&
      command.clearSortViewId
    ) {
      const viewMutation = await clearViewSort(context, command.clearSortViewId);
      const hostMutation = rowResult.mutations.find(
        ({ databaseId }) => databaseId === context.databaseId,
      );
      if (!hostMutation) throw new Error("Row command did not produce its host event");
      hostMutation.areas = [...new Set([...hostMutation.areas, ...viewMutation.areas])];
      hostMutation.changes = { ...hostMutation.changes, ...viewMutation.changes };
    }
    return rowResult;
  }
  const structuralResult = await dispatchStructuralCommand(context, command as never);
  if (structuralResult) return structuralResult;
  throw new ServiceMutationError("Unsupported database command", 501);
}) as DatabaseCommandDispatcher;
