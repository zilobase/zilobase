import type { DatabaseCommandDispatcher } from "./framework";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { dispatchRecordCommand } from "./records";
import { dispatchStructuralCommand } from "./structural/dispatch";
import { dispatchLifecycleCommand } from "./lifecycle";

/** The sole host/source command dispatch boundary. */
export const dispatchDatabaseCommand = (async (context, command) => {
  const lifecycle = await dispatchLifecycleCommand(context, command);
  if (lifecycle) return lifecycle;
  const rowResult = context.dataSourceId
    ? await dispatchRecordCommand(context, command as never)
    : null;
  if (rowResult) return rowResult;
  const structuralResult = await dispatchStructuralCommand(context, command as never);
  if (structuralResult) return structuralResult;
  throw new ServiceMutationError("Unsupported database command", 501);
}) as DatabaseCommandDispatcher;
