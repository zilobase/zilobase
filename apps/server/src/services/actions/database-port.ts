import {
  databaseCommandBuilders as build,
  type DatabaseActionOps,
  type DatabaseBootstrapResponse,
  type DatabaseCommandAck,
  type DatabaseCommandRequest,
} from "@zilobase/features/runtime";
import { executeDatabaseApplicationCommand } from "../databases/commands/operations";
import type { ServerOperationContext } from "../operations/context";
import { deterministicActionId, type ActionReceiptStore } from "./receipts";

type CommandInput = {
  command: DatabaseCommandRequest["command"];
  databaseId: string;
  dataSourceId?: string | null;
};

export type ActionChange = {
  callId: string;
  opIndex: number;
  kind: "database";
  commandType: string;
  databaseId: string | null;
  dataSourceId: string | null;
  ack: DatabaseCommandAck;
  /** A command that reverses this change, when it needs no pre-image. */
  inverse: CommandInput | null;
};

export type DatabasePortCache = {
  bootstrap?: DatabaseBootstrapResponse;
  /** Latest configuration per view, updated as this invocation changes it. */
  viewConfigs: Map<string, unknown>;
};

export type DatabasePortOptions = {
  context: ServerOperationContext;
  invocationId: string;
  callId: string;
  receipts: ActionReceiptStore;
  cache: DatabasePortCache;
  onChange?: (change: ActionChange) => void;
  execute?: typeof executeDatabaseApplicationCommand;
};

function inverseOf(input: CommandInput, ack: DatabaseCommandAck): CommandInput | null {
  const scope = { hostDatabaseId: input.databaseId, dataSourceId: input.dataSourceId ?? "" };
  const result = ack.result as { id?: string; database?: { id: string }; viewId?: string } | null;
  switch (input.command.type) {
    case "database.create":
      return result?.database
        ? build.buildDatabaseState(result.database.id, "database.archive")
        : null;
    case "database.archive":
      return build.buildDatabaseState(input.databaseId, "database.restore");
    case "database.restore":
      return build.buildDatabaseState(input.databaseId, "database.archive");
    case "database.favorite":
      return build.buildDatabaseFavorite({
        databaseId: input.databaseId,
        isFavorite: !input.command.favorite,
      });
    case "property.create":
    case "property.duplicate":
      return result?.id ? build.buildPropertyState(scope, result.id, "property.archive") : null;
    case "property.archive":
      return build.buildPropertyState(scope, input.command.propertyId, "property.restore");
    case "property.restore":
      return build.buildPropertyState(scope, input.command.propertyId, "property.archive");
    case "row.place":
    case "row.duplicate":
      return result?.id ? build.buildRowState(scope, result.id, "row.archive") : null;
    case "row.archive":
      return build.buildRowState(scope, input.command.rowId, "row.restore");
    case "row.restore":
      return build.buildRowState(scope, input.command.rowId, "row.archive");
    case "view.create":
      return result?.id
        ? build.buildViewDelete({ databaseId: input.databaseId, databaseViewId: result.id })
        : null;
    case "template.create":
      return result?.id ? build.buildTemplateState(scope, result.id, "template.archive") : null;
    case "template.archive":
      return build.buildTemplateState(scope, input.command.templateId, "template.restore");
    case "template.restore":
      return build.buildTemplateState(scope, input.command.templateId, "template.archive");
    default:
      // Updates and moves need their pre-image, captured when undo ships.
      return null;
  }
}

/**
 * Implements every database action operation with the shared command
 * builders and runs it through the same application service as the HTTP
 * routes. Command IDs are deterministic per invocation, call and operation.
 */
export function createDatabaseActionPort(options: DatabasePortOptions): DatabaseActionOps {
  const { cache, receipts } = options;
  const execute = options.execute ?? executeDatabaseApplicationCommand;
  let opIndex = 0;

  const host = (dataSourceId: string, explicit?: string) => {
    if (explicit) return { dataSourceId, hostDatabaseId: explicit };
    const source = cache.bootstrap?.dataSources.find(({ id }) => id === dataSourceId);
    if (source) return { dataSourceId, hostDatabaseId: cache.bootstrap!.database.id };
    throw new Error("Database source is not loaded for this action; provide its host explicitly");
  };
  const properties = () => cache.bootstrap?.properties ?? [];

  async function command(input: CommandInput) {
    const key = { invocationId: options.invocationId, callId: options.callId, opIndex: opIndex++ };
    const stored = await receipts.get(key);
    if (stored?.status === "completed") return stored.result as DatabaseCommandAck;
    const request = (stored?.request as DatabaseCommandRequest | undefined) ?? {
      command: input.command,
      commandId: await deterministicActionId(
        options.invocationId,
        options.callId,
        String(key.opIndex),
      ),
      protocolVersion: 2 as const,
    };
    if (!stored) await receipts.savePending(key, { kind: "database", request });
    const ack = await execute(
      options.context,
      request.command.type === "database.create"
        ? { request }
        : { databaseId: input.databaseId, dataSourceId: input.dataSourceId ?? null, request },
    );
    await receipts.complete(key, ack);
    options.onChange?.({
      callId: options.callId,
      opIndex: key.opIndex,
      kind: "database",
      commandType: request.command.type,
      databaseId: request.command.type === "database.create" ? null : input.databaseId,
      dataSourceId: input.dataSourceId ?? null,
      ack,
      inverse: inverseOf(input, ack),
    });
    return ack;
  }
  const run = async <T>(input: CommandInput) => (await command(input)).result as T;
  const rememberView = <T extends { id?: string; config?: unknown }>(view: T) => {
    if (view?.id) cache.viewConfigs.set(view.id, view.config);
    return view;
  };

  return {
    // Records and properties (data source scope)
    addProperty: ({ onOptimistic: _, databaseId, ...input }) =>
      run(build.buildPropertyCreate(host(databaseId), properties(), input)),
    updateProperty: ({ databaseId, ...input }) =>
      run(build.buildPropertyUpdate(host(databaseId), input)),
    archiveProperty: (input) =>
      run(
        build.buildPropertyState(
          host(input.databaseId),
          input.databasePropertyId,
          "property.archive",
        ),
      ),
    restoreProperty: (input) =>
      run(
        build.buildPropertyState(
          host(input.databaseId),
          input.databasePropertyId,
          "property.restore",
        ),
      ),
    duplicateProperty: (input) => run(build.buildPropertyDuplicate(host(input.databaseId), input)),
    moveProperty: (input) => run(build.buildPropertyMove(host(input.databaseId), input)),
    updateDatabase: ({ databaseId, ...patch }) =>
      run(build.buildDataSourceUpdate(host(databaseId), patch)),
    addRow: (input) =>
      run(
        build.buildRowPlace(host(input.databaseId, input.hostDatabaseId), [], {
          ...input,
          ...(input.sourceRowId && input.sourceDataSourceId
            ? {
                source: {
                  databaseId: host(input.sourceDataSourceId, input.sourceHostDatabaseId)
                    .hostDatabaseId,
                  dataSourceId: input.sourceDataSourceId,
                  propertyMode: input.sourcePropertyMode ?? "match",
                  rowId: input.sourceRowId,
                },
              }
            : {}),
        }).input,
      ),
    changeRow: ({ databaseId, dataSourceId, ...change }) =>
      run(build.buildRowChange({ hostDatabaseId: databaseId, dataSourceId }, change)),
    updateValue: (input) =>
      run(
        build.buildRowChange(host(input.databaseId, input.hostDatabaseId), {
          rowId: input.rowId,
          valuesByPropertyId: { [input.propertyId]: input.value },
        }),
      ),
    archiveRow: (input) =>
      run(
        build.buildRowState(
          host(input.databaseId, input.hostDatabaseId),
          input.rowId,
          "row.archive",
        ),
      ),
    restoreRow: (input) =>
      run(
        build.buildRowState(
          host(input.databaseId, input.hostDatabaseId),
          input.rowId,
          "row.restore",
        ),
      ),
    duplicateRow: (input) =>
      run(build.buildRowDuplicate(host(input.databaseId, input.hostDatabaseId), input)),
    applyDataSourceTemplate: ({ databaseId, hostDatabaseId, ...input }) =>
      run(build.buildTemplateApply(host(databaseId, hostDatabaseId), input)),
    createTemplate: (input) =>
      run(build.buildTemplateCreate(host(input.databaseId, input.hostDatabaseId), input)),
    updateTemplate: (input) =>
      run(build.buildTemplateUpdate(host(input.databaseId, input.hostDatabaseId), input)),
    archiveTemplate: (input) =>
      run(
        build.buildTemplateState(
          host(input.databaseId, input.hostDatabaseId),
          input.templateId,
          "template.archive",
        ),
      ),
    restoreTemplate: (input) =>
      run(
        build.buildTemplateState(
          host(input.databaseId, input.hostDatabaseId),
          input.templateId,
          "template.restore",
        ),
      ),

    // Views, sources and lifecycle (host scope)
    addDatabaseView: async ({ onOptimistic: _, ...input }) =>
      rememberView(await run(build.buildViewCreate(input))),
    updateDatabaseView: async (input) => rememberView(await run(build.buildViewUpdate(input))),
    deleteDatabaseView: (input) => run(build.buildViewDelete(input)),
    moveView: (input) => run(build.buildViewMove(input)),
    createDataSource: (input) => run(build.buildDataSourceCreate(input)),
    linkDatabaseDataSource: (input) => run(build.buildDataSourceLink(input)),
    unlinkDatabaseDataSource: (input) => run(build.buildDataSourceUnlink(input)),
    replaceDatabaseViewDataSource: (input) => run(build.buildViewSetDataSource(input)),
    createDatabase: (input) => run(build.buildDatabaseCreate(input)),
    setDatabaseFavorite: (input) => run(build.buildDatabaseFavorite(input)),
    restoreDatabase: (input) => run(build.buildDatabaseState(input.databaseId, "database.restore")),
    deleteDatabase: (input) => run(build.buildDatabaseState(input.databaseId, "database.archive")),
  } as DatabaseActionOps;
}
