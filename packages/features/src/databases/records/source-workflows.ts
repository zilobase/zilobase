import { isPlanRejection, runPlan } from "../../actions/plan";
import {
  captureClientOperation,
  ExpiredClientOperationError,
  type ClientOperationContext,
} from "../../shared/operation-context";
import {
  createDatabaseDataSource,
  linkDatabaseDataSource,
  replaceDatabaseViewDataSource,
} from "../mutations/data-sources-operations";
import { applyDatabaseTemplate } from "../mutations/properties-operations";
import {
  planSetupDataSource,
  type DatabaseSetupSelection,
  type DatabaseSourceOps,
} from "../planners/sources";

export type DatabaseSourceSetupInput = {
  databaseId: string;
  selection: DatabaseSetupSelection;
  createSampleRowContent: (markdown: string) => unknown;
};
export type DatabaseSourceSetupResult = Awaited<ReturnType<typeof createDatabaseDataSource>>;
export class DatabaseSourceSetupError extends Error {
  constructor(
    cause: unknown,
    readonly created: DatabaseSourceSetupResult,
  ) {
    super(cause instanceof Error ? cause.message : "Could not finish setting up the data source.", {
      cause,
    });
    this.name = "DatabaseSourceSetupError";
  }
}

/** Each step is independently committed. Preserve the created source on later failure. */
export async function setupDatabaseSource(
  context: ClientOperationContext,
  input: DatabaseSourceSetupInput,
): Promise<DatabaseSourceSetupResult> {
  const scope = captureClientOperation(context);
  const plan = planSetupDataSource(input.databaseId, input.selection, input.createSampleRowContent);
  if (isPlanRejection(plan)) throw new Error(plan.message ?? plan.rejected);
  const ops: Pick<
    DatabaseSourceOps,
    "applyDataSourceTemplate" | "createDataSource" | "linkDatabaseDataSource"
  > = {
    createDataSource: (value) => createDatabaseDataSource(context, value),
    applyDataSourceTemplate: (value) => applyDatabaseTemplate(context, value),
    linkDatabaseDataSource: (value) => linkDatabaseDataSource(context, value),
  };
  // The setup plan only uses these operations.
  const run = await runPlan(plan, ops as DatabaseSourceOps, {
    sequential: true,
    isCurrent: scope.isCurrent,
  });
  const created = run.results.has("source")
    ? run.results.get<DatabaseSourceSetupResult>("source")
    : undefined;
  if (run.status === "completed") return created!;
  if (!created) throw run.error ?? new ExpiredClientOperationError();
  throw new DatabaseSourceSetupError(run.error ?? new ExpiredClientOperationError(), created);
}

export async function replaceDatabaseSource(
  context: ClientOperationContext,
  input: { databaseId: string; databaseViewId: string; dataSourceId: string },
) {
  return replaceDatabaseViewDataSource(context, input);
}
