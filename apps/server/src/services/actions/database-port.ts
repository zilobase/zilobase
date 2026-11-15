import {
  databaseCommandBuilders as build,
  type DatabaseActionOps,
  type DatabaseBootstrapResponse,
  type DatabaseCommandAck,
  type DatabaseCommandRequest,
  invertConfigurationChanges,
} from "@zilobase/features/runtime";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../infrastructure/database";
import { databaseRow, page, pagePropertyValue } from "../../infrastructure/database/schema";
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
  kind: "database" | "page";
  commandType: string;
  databaseId: string | null;
  pageId?: string | null;
  dataSourceId: string | null;
  ack: DatabaseCommandAck;
  /** A command that reverses this change, when it needs no pre-image. */
  inverse: CommandInput | { op: string; input: Record<string, unknown> } | null;
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
  /** Operation positions shared by every port of one call, keying its receipts. */
  sequence?: ActionSequence;
};

export type ActionSequence = { next(): number };
export const actionSequence = (): ActionSequence => {
  let index = 0;
  return { next: () => index++ };
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
      return null;
  }
}

type Patch = {
  configuration?: Parameters<typeof invertConfigurationChanges>[1];
  [field: string]: unknown;
};

/**
 * Inverses of updates, from the state before the command ran: configuration
 * changes are inverted against the previous configuration and plain fields get
 * their previous values. Row value changes and moves have no pre-image yet.
 */
function preImageInverse(input: CommandInput, cache: DatabasePortCache): CommandInput | null {
  const command = input.command as {
    type: string;
    patch?: Patch;
    viewId?: string;
    propertyId?: string;
  };
  const patch = command.patch;
  if (!patch) return null;
  const restore = (previous: Record<string, unknown>, config: unknown) => {
    const inverse: Patch = {};
    for (const [field, value] of Object.entries(patch))
      if (field === "configuration")
        inverse.configuration = invertConfigurationChanges(config, value as never);
      else if (previous[field] !== undefined) inverse[field] = previous[field];
    return inverse;
  };
  const bootstrap = cache.bootstrap;
  switch (command.type) {
    case "view.update": {
      const view = bootstrap?.views.find(({ id }) => id === command.viewId);
      if (!view) return null;
      const config = cache.viewConfigs.get(view.id) ?? view.config;
      return {
        ...input,
        command: { ...command, patch: restore(view as never, config) } as never,
      };
    }
    case "property.update": {
      const column = bootstrap?.properties.find(({ id }) => id === command.propertyId);
      if (!column) return null;
      const { property } = column as unknown as { property: Record<string, unknown> };
      return {
        ...input,
        command: {
          ...command,
          patch: restore(
            { ...property, ...(column as unknown as Record<string, unknown>) },
            property.config,
          ),
        } as never,
      };
    }
    case "dataSource.update": {
      const source = bootstrap?.dataSources.find(({ id }) => id === input.dataSourceId);
      if (!source) return null;
      return {
        ...input,
        command: { ...command, patch: restore(source as never, source.config) } as never,
      };
    }
    default:
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
  const sequence = options.sequence ?? actionSequence();

  const host = (dataSourceId: string, explicit?: string) => {
    if (explicit) return { dataSourceId, hostDatabaseId: explicit };
    const source = cache.bootstrap?.dataSources.find(({ id }) => id === dataSourceId);
    if (source) return { dataSourceId, hostDatabaseId: cache.bootstrap!.database.id };
    throw new Error("Database source is not loaded for this action; provide its host explicitly");
  };
  const properties = () => cache.bootstrap?.properties ?? [];

  async function command(input: CommandInput, commandId?: string) {
    const key = {
      invocationId: options.invocationId,
      callId: options.callId,
      opIndex: sequence.next(),
    };
    const stored = await receipts.get(key);
    if (stored?.status === "completed") return stored.result as DatabaseCommandAck;
    const request = (stored?.request as DatabaseCommandRequest | undefined) ?? {
      command: input.command,
      commandId:
        commandId ??
        (await deterministicActionId(options.invocationId, options.callId, String(key.opIndex))),
      protocolVersion: 2 as const,
    };
    if (!stored) await receipts.savePending(key, { kind: "database", request });
    const before = preImageInverse(input, cache) ?? (await rowPreImage(input));
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
      databaseId:
        request.command.type === "database.create"
          ? ((ack.result as { database?: { id: string } } | null)?.database?.id ?? null)
          : input.databaseId,
      dataSourceId: input.dataSourceId ?? null,
      ack,
      inverse: inverseOf(input, ack) ?? before,
    });
    return ack;
  }
  const run = async <T>(input: CommandInput, commandId?: string) =>
    (await command(input, commandId)).result as T;
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
    // A reserved database ID is the database.create command ID, as in the client.
    createDatabase: ({ databaseId, ...input }) => run(build.buildDatabaseCreate(input), databaseId),
    setDatabaseFavorite: (input) => run(build.buildDatabaseFavorite(input)),
    restoreDatabase: (input) => run(build.buildDatabaseState(input.databaseId, "database.restore")),
    deleteDatabase: (input) => run(build.buildDatabaseState(input.databaseId, "database.archive")),
  } as DatabaseActionOps;
}

/**
 * The inverse of a row change, read before it runs: the previous title and
 * values, the row's former neighbours for a move, and its former parent.
 */
async function rowPreImage(input: CommandInput): Promise<CommandInput | null> {
  const command = input.command as {
    type: string;
    rowId?: string;
    title?: string;
    valuesByPropertyId?: Record<string, unknown>;
    placement?: unknown;
    hierarchy?: unknown;
  };
  if (command.type !== "row.change" || !command.rowId) return null;
  const [row] = await db
    .select({
      pageId: databaseRow.pageId,
      title: page.name,
      dataSourceId: databaseRow.dataSourceId,
      parentRowId: databaseRow.parentRowId,
    })
    .from(databaseRow)
    .innerJoin(page, eq(page.id, databaseRow.pageId))
    .where(eq(databaseRow.id, command.rowId))
    .limit(1);
  if (!row) return null;
  const propertyIds = Object.keys(command.valuesByPropertyId ?? {});
  const previous = propertyIds.length
    ? await db
        .select({ propertyId: pagePropertyValue.propertyId, value: pagePropertyValue.value })
        .from(pagePropertyValue)
        .where(
          and(
            eq(pagePropertyValue.pageId, row.pageId),
            inArray(pagePropertyValue.propertyId, propertyIds),
          ),
        )
    : [];
  const values = new Map(previous.map(({ propertyId, value }) => [propertyId, value]));
  let placement: { afterRowId: string | null; beforeRowId: string | null } | undefined;
  if (command.placement) {
    const order = await db
      .select({ id: databaseRow.id })
      .from(databaseRow)
      .where(and(eq(databaseRow.dataSourceId, row.dataSourceId), isNull(databaseRow.deletedAt)))
      .orderBy(asc(databaseRow.orderKey), asc(databaseRow.id));
    const index = order.findIndex(({ id }) => id === command.rowId);
    placement = {
      afterRowId: order[index - 1]?.id ?? null,
      beforeRowId: order[index + 1]?.id ?? null,
    };
  }
  return {
    ...input,
    command: {
      type: "row.change",
      rowId: command.rowId,
      ...(command.title !== undefined ? { title: row.title } : {}),
      ...(placement ? { placement } : {}),
      ...(command.hierarchy
        ? { hierarchy: { ...(command.hierarchy as object), parentRowId: row.parentRowId } }
        : {}),
      ...(propertyIds.length
        ? {
            valuesByPropertyId: Object.fromEntries(
              propertyIds.map((id) => [id, values.get(id) ?? null]),
            ),
          }
        : {}),
    } as never,
  };
}
