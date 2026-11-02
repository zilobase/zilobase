import { z } from "zod";
import {
  isPlanRejection,
  rejectPlan,
  type ActionPlan,
  type PlanOutcome,
  type PlanResults,
  type PlanStep,
} from "../../actions/plan";
import type { ReadAction, WriteAction } from "../../actions/types";
import type {
  DatabasePropertyEntity,
  DatabaseRecordEntity,
  DataSourceEntity,
} from "../core/entities";
import type {
  CreateDatabaseInput,
  CreateDatabaseResponse,
  SetDatabaseFavoriteInput,
} from "../mutations/databases-operations";
import type {
  ArchiveDatabaseTemplateInput,
  CreateDatabaseTemplateInput,
  DatabaseStoredTemplate,
  RestoreDatabaseTemplateInput,
  UpdateDatabaseTemplateInput,
} from "../mutations/templates-operations";
import type { DatabaseOps, DatabaseIntentState } from "../planners/state";
import { sourceProperties } from "../planners/state";
import {
  planAddDataSourceView,
  planDeleteView,
  planReplaceViewSource,
  planSetupDataSource,
  planUnlinkDataSource,
  type DatabaseSourceOps,
  type DatabaseSourceState,
} from "../planners/sources";
import {
  planUpdatePropertyConfig,
  planRenameProperty,
  planSaveDatabaseEmoji,
  planSaveDatabaseTitle,
} from "../planners/records";
import {
  createDatabaseFilterId,
  planAddCalendarView,
  planAddChartView,
  planAddFormView,
  planAddGalleryView,
  planAddKanbanView,
  planAddListView,
  planAddTableView,
  planAddTimelineView,
  planRenameView,
  planSaveDatabaseFilters,
  planSaveDatabasePropertyOrder,
  planSaveDatabaseSorts,
  planSetCalendarMode,
  planSetViewDateProperty,
  planSetViewGroupProperty,
  planSetViewType,
  type DatabaseViewType,
} from "../planners/views";
import { getDefaultDatabasePropertyConfig } from "../schema/property-defaults";
import type {
  DatabasePropertyFilterConfig,
  DatabasePropertyFilterOperator,
} from "../schema/filter";
import { getDatabaseSetupTemplate, type DatabaseSetupTemplateId } from "../templates/definitions";
import { databaseTemplateRows } from "../templates/payload";
import { getMergedDatabaseConfig, getMergedPropertyConfig } from "../views/configuration";
import {
  ActionInputError,
  resolveCellValue,
  resolveColumnId,
  resolveProperty,
  resolvePropertyConfig,
} from "./resolve";
import {
  cellValueSchema,
  databaseTargetSchema,
  propertyConfigSchema,
  propertyRefSchema,
  propertyTypeSchema,
  rowInputSchema,
  viewFilterSchema,
  viewSortSchema,
  viewTypeSchema,
} from "./schemas";

/** Every operation a database action may issue; clients and servers implement them. */
export type DatabaseActionOps = DatabaseOps &
  DatabaseSourceOps & {
    createDatabase: (
      input: Omit<CreateDatabaseInput, "onOptimistic">,
    ) => Promise<CreateDatabaseResponse>;
    setDatabaseFavorite: (input: SetDatabaseFavoriteInput) => Promise<unknown>;
    restoreDatabase: (input: { databaseId: string }) => Promise<unknown>;
    archiveRow: (input: {
      databaseId: string;
      hostDatabaseId?: string;
      rowId: string;
    }) => Promise<DatabaseRecordEntity>;
    restoreRow: (input: {
      databaseId: string;
      hostDatabaseId?: string;
      rowId: string;
    }) => Promise<DatabaseRecordEntity>;
    duplicateRow: (input: {
      databaseId: string;
      hostDatabaseId?: string;
      rowId: string;
    }) => Promise<DatabaseRecordEntity>;
    archiveProperty: (input: PropertyTarget) => Promise<DatabasePropertyEntity>;
    restoreProperty: (input: PropertyTarget) => Promise<DatabasePropertyEntity>;
    duplicateProperty: (
      input: PropertyTarget & { includeValues?: boolean },
    ) => Promise<DatabasePropertyEntity>;
    moveProperty: (
      input: PropertyTarget & { afterPropertyId: string | null; beforePropertyId: string | null },
    ) => Promise<DatabasePropertyEntity>;
    moveView: (input: {
      databaseId: string;
      databaseViewId: string;
      afterViewId: string | null;
      beforeViewId: string | null;
    }) => Promise<unknown>;
    deleteDatabase: (input: { databaseId: string }) => Promise<unknown>;
    createTemplate: (input: CreateDatabaseTemplateInput) => Promise<DatabaseStoredTemplate>;
    updateTemplate: (input: UpdateDatabaseTemplateInput) => Promise<DatabaseStoredTemplate>;
    archiveTemplate: (input: ArchiveDatabaseTemplateInput) => Promise<DatabaseStoredTemplate>;
    restoreTemplate: (input: RestoreDatabaseTemplateInput) => Promise<DatabaseStoredTemplate>;
  };
type PropertyTarget = { databaseId: string; databasePropertyId: string };
type Step = PlanStep<DatabaseActionOps>;
type Plan = PlanOutcome<DatabaseActionOps>;

/** Database state loaded for the acting principal, built with the UI's view model. */
export type DatabaseActionState = DatabaseIntentState & { workspaceId: string };

const target = databaseTargetSchema;
const view = databaseTargetSchema.extend({ viewId: z.string().trim().min(1).max(128) });
const needsDatabase =
  (records = false) =>
  (input: { databaseId: string; dataSourceId?: string; viewId?: string }) => ({
    database: { ...input, records },
  });

function guard(state: DatabaseActionState): Plan | null {
  if (!state.dataSourceId) return rejectPlan("no_data_source", "The database has no data source.");
  if (!state.editable) return rejectPlan("not_editable", "You cannot edit this database.");
  return null;
}

function withResolution(build: () => Plan): Plan {
  try {
    return build();
  } catch (error) {
    if (error instanceof ActionInputError) return rejectPlan("invalid_input", error.message);
    throw error;
  }
}

/** Chains independent plans; any rejection rejects the whole action. */
function chain(...plans: Plan[]): Plan {
  const steps: Step[] = [];
  let select: string | undefined;
  for (const plan of plans) {
    if (isPlanRejection(plan)) {
      if (plan.rejected === "unchanged") continue;
      return plan;
    }
    steps.push(...plan.steps);
    select ??= plan.select;
  }
  return steps.length
    ? { steps, ...(select ? { select } : {}) }
    : rejectPlan("unchanged", "Nothing to change.");
}

function sourceState(state: DatabaseActionState): DatabaseSourceState {
  return {
    databaseId: state.hostDatabaseId ?? state.viewData?.bootstrap.database.id,
    editable: state.editable,
    bootstrap: state.viewData?.bootstrap,
    activeViewId: state.activeView?.id ?? null,
  };
}

/** Source planners use a subset of the database action operations. */
function asActionPlan(plan: PlanOutcome<DatabaseSourceOps>): Plan {
  return plan as unknown as Plan;
}

const hostInput = z.object({ databaseId: z.string().trim().min(1).max(128) });

function hostPlan(op: "restoreDatabase" | "deleteDatabase") {
  return (state: DatabaseActionState): Plan =>
    guard(state) ?? {
      steps: [{ op, input: () => ({ databaseId: state.hostDatabaseId ?? state.dataSourceId! }) }],
    };
}

function propertyPlan(op: "restoreProperty" | "duplicateProperty") {
  return (state: DatabaseActionState, input: { property: string }): Plan =>
    guard(state) ??
    withResolution(() => ({
      steps: [
        {
          op,
          input: () => ({
            databaseId: state.dataSourceId!,
            databasePropertyId: resolveProperty(state.properties, input.property).id,
          }),
        },
      ],
    }));
}

const templateTarget = target.extend({ templateId: z.string().trim().min(1).max(128) });
function templateScope(state: DatabaseActionState) {
  return {
    databaseId: state.dataSourceId!,
    ...(state.hostDatabaseId ? { hostDatabaseId: state.hostDatabaseId } : {}),
  };
}

/** Places an item before or after a sibling, given IDs in their current order. */
function neighbors(ids: string[], id: string, position: number) {
  const remaining = ids.filter((candidate) => candidate !== id);
  const index = Math.max(0, Math.min(position, remaining.length));
  return { after: remaining[index - 1] ?? null, before: remaining[index] ?? null };
}

// Reads

export const databaseReadActions = [
  {
    kind: "read",
    name: "databases.describe",
    group: "databases.read",
    title: "Describe database",
    description:
      "Inspect a database: data sources, properties (IDs, types, options, formulas), views and their filters, sorts and grouping. Call before editing.",
    input: databaseTargetSchema,
    effect: "read",
    scopes: ["databases.read"],
    milestone: "A",
  },
  {
    kind: "read",
    name: "databases.query_records",
    group: "databases.read",
    title: "Query records",
    description:
      "Read records from a data source with optional filters and sorts. Returns row IDs, page IDs, titles and values. Paginate with the returned cursor.",
    input: z.unknown(),
    effect: "read",
    scopes: ["databases.read"],
    milestone: "A",
  },
  {
    kind: "read",
    name: "databases.aggregate_records",
    group: "databases.read",
    title: "Aggregate records",
    description: "Count, sum, average, min or max a property across matching records.",
    input: z.unknown(),
    effect: "read",
    scopes: ["databases.read"],
    milestone: "A",
  },
] as const satisfies readonly ReadAction[];

// Database and schema

const createDatabaseInput = z
  .object({
    name: z.string().trim().min(1).max(200),
    parentPageId: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .optional()
      .describe("Page that will contain the database; omit for a full-page database."),
    teamspaceId: z.string().trim().min(1).max(128).optional(),
    emoji: z.string().max(16).optional(),
    template: z
      .enum([
        "tasks-tracker",
        "projects",
        "document-hub",
        "content-calendar",
        "meeting-notes",
        "crm",
      ])
      .optional()
      .describe("Start from a built-in template instead of custom properties."),
    properties: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(100),
            type: propertyTypeSchema,
            config: propertyConfigSchema.optional(),
          })
          .strict(),
      )
      .max(50)
      .optional(),
    rows: z.array(rowInputSchema).max(100).optional(),
  })
  .strict();
type CreateDatabaseActionInput = z.infer<typeof createDatabaseInput>;

function planCreateDatabase(
  state: { workspaceId: string; createSampleRowContent?: (markdown: string) => unknown },
  input: CreateDatabaseActionInput,
): Plan {
  return withResolution(() => {
    const template = input.template
      ? getDatabaseSetupTemplate(input.template as DatabaseSetupTemplateId)
      : null;
    const custom = input.properties ?? [];
    const synthetic = custom.map(
      (property, index) =>
        ({
          id: `new-${index}`,
          dataSourceId: "new",
          position: index,
          property: {
            id: `new-${index}`,
            name: property.name,
            type: property.type,
            config:
              resolvePropertyConfig([], property.config) ??
              getDefaultDatabasePropertyConfig(property.type) ??
              {},
          },
        }) as unknown as DatabasePropertyEntity,
    );
    const rows = (input.rows ?? []).map((row) => ({
      title: row.title ?? "",
      values: Object.entries(row.values ?? {}).map(([reference, value]) => {
        const property = resolveProperty(synthetic, reference);
        return { propertyName: property.property.name, value: resolveCellValue(property, value) };
      }),
    }));
    const created = (done: PlanResults) => done.get<CreateDatabaseResponse>("database");
    const source = (done: PlanResults) => {
      const active = created(done).activeDataSource;
      if (!active) throw new Error("The created database has no data source");
      return active as DataSourceEntity;
    };
    const steps: Step[] = [
      {
        id: "database",
        op: "createDatabase",
        input: () => ({
          workspaceId: state.workspaceId,
          name: input.name,
          ...(input.parentPageId ? { pageId: input.parentPageId } : {}),
          standalone: !input.parentPageId,
          ...(input.teamspaceId ? { teamspaceId: input.teamspaceId } : {}),
        }),
      },
    ];
    if (template)
      steps.push({
        op: "applyDataSourceTemplate",
        input: (done) => ({
          config: getMergedDatabaseConfig(source(done).config, {
            emoji: input.emoji ?? template.emoji,
            setupDismissed: true,
          }),
          databaseId: source(done).id,
          hostDatabaseId: created(done).database.id,
          name: input.name,
          properties: template.properties,
          rows: databaseTemplateRows(
            template,
            new Map(
              template.properties.map((property) => [property.name.toLowerCase(), property.type]),
            ),
            state.createSampleRowContent ?? (() => null),
            (emoji) => ({ emoji }),
          ),
        }),
      });
    else
      steps.push({
        op: "applyDataSourceTemplate",
        input: (done) => ({
          config: getMergedDatabaseConfig(source(done).config, {
            ...(input.emoji ? { emoji: input.emoji } : {}),
            setupDismissed: true,
          }),
          databaseId: source(done).id,
          hostDatabaseId: created(done).database.id,
          name: input.name,
          properties: synthetic.map((property) => ({
            name: property.property.name,
            type: property.property.type,
            config: property.property.config,
          })),
          rows,
        }),
      });
    return { steps };
  });
}

const addPropertyInput = target.extend({
  name: z.string().trim().min(1).max(100),
  type: propertyTypeSchema,
  config: propertyConfigSchema.optional(),
  position: z.number().int().min(0).optional(),
});

function planAddPropertyAction(
  state: DatabaseActionState,
  input: z.infer<typeof addPropertyInput>,
): Plan {
  return (
    guard(state) ??
    withResolution(() => {
      const custom = resolvePropertyConfig(sourceProperties(state), input.config);
      return {
        steps: [
          {
            id: "property",
            op: "addProperty",
            input: () => ({
              config: getMergedPropertyConfig(
                getDefaultDatabasePropertyConfig(input.type),
                custom ?? {},
              ),
              databaseId: state.dataSourceId!,
              name: input.name,
              position: input.position,
              type: input.type,
            }),
          },
        ],
      };
    })
  );
}

const updatePropertyInput = target.extend({
  property: propertyRefSchema,
  name: z.string().trim().min(1).max(100).optional(),
  config: propertyConfigSchema.optional(),
});

function planUpdatePropertyAction(
  state: DatabaseActionState,
  input: z.infer<typeof updatePropertyInput>,
): Plan {
  return (
    guard(state) ??
    withResolution(() => {
      const properties = sourceProperties(state);
      const property = resolveProperty(properties, input.property);
      return chain(
        input.name && input.name !== property.property.name
          ? planRenameProperty(state, property.id, input.name)
          : rejectPlan("unchanged"),
        input.config
          ? planUpdatePropertyConfig(
              state,
              property.id,
              resolvePropertyConfig(properties, input.config, property.property.config),
            )
          : rejectPlan("unchanged"),
      );
    })
  );
}

const updateDatabaseInput = target.extend({
  name: z.string().trim().min(1).max(200).optional(),
  emoji: z.string().max(16).optional(),
});

// Views

const viewCreators: Record<
  DatabaseViewType,
  (state: DatabaseIntentState) => PlanOutcome<DatabaseOps>
> = {
  table: planAddTableView,
  kanban: planAddKanbanView,
  timeline: planAddTimelineView,
  calendar: planAddCalendarView,
  chart: planAddChartView,
  gallery: planAddGalleryView,
  list: planAddListView,
  form: (state) => planAddFormView(state, []),
};

const addViewInput = target.extend({
  type: viewTypeSchema,
  name: z.string().trim().min(1).max(100).optional(),
});

function planAddViewAction(state: DatabaseActionState, input: z.infer<typeof addViewInput>): Plan {
  const blocked = guard(state);
  if (blocked) return blocked;
  const plan = viewCreators[input.type](state);
  if (isPlanRejection(plan) || !input.name) return plan;
  return {
    ...plan,
    steps: plan.steps.map((step) =>
      step.id === "view" && step.op === "addDatabaseView"
        ? { ...step, input: (done: PlanResults) => ({ ...step.input(done), name: input.name! }) }
        : step,
    ),
  } as ActionPlan<DatabaseActionOps>;
}

const configureViewInput = view.extend({
  name: z.string().trim().min(1).max(100).optional(),
  layout: viewTypeSchema
    .optional()
    .describe("Change the view type; missing grouping or date properties are created."),
  groupBy: propertyRefSchema
    .nullable()
    .optional()
    .describe("Group (board columns) by this property; null removes grouping."),
  dateProperty: propertyRefSchema
    .optional()
    .describe("Date property for timeline and calendar views."),
  calendarMode: z.enum(["month", "week", "day", "agenda"]).optional(),
  filters: z
    .array(viewFilterSchema)
    .max(20)
    .optional()
    .describe("Replaces the view's filters; [] clears them."),
  sorts: z
    .array(viewSortSchema)
    .max(10)
    .optional()
    .describe("Replaces the view's sorts; [] clears them."),
  propertyOrder: z.array(propertyRefSchema).max(200).optional(),
});

/** Applies each requested change with its UI planner; later steps read the latest view config. */
function planConfigureViewAction(
  state: DatabaseActionState,
  input: z.infer<typeof configureViewInput>,
): Plan {
  const blocked = guard(state);
  if (blocked) return blocked;
  if (!state.activeView) return rejectPlan("view_missing", "View not found.");
  return withResolution(() => {
    const properties = sourceProperties(state);
    const pageProperty = (reference: string) => resolveProperty(properties, reference).property.id;
    const filters: DatabasePropertyFilterConfig[] | undefined = input.filters?.map((filter) => ({
      id: createDatabaseFilterId(),
      operator: filter.operator as DatabasePropertyFilterOperator,
      propertyId: resolveColumnId(properties, filter.property),
      values: filter.values,
    }));
    return chain(
      input.layout ? planSetViewType(state, input.layout) : rejectPlan("unchanged"),
      input.groupBy !== undefined
        ? planSetViewGroupProperty(
            state,
            input.groupBy === null ? null : pageProperty(input.groupBy),
          )
        : rejectPlan("unchanged"),
      input.dateProperty
        ? planSetViewDateProperty(state, pageProperty(input.dateProperty))
        : rejectPlan("unchanged"),
      input.calendarMode ? planSetCalendarMode(state, input.calendarMode) : rejectPlan("unchanged"),
      filters ? planSaveDatabaseFilters(state, filters) : rejectPlan("unchanged"),
      input.sorts
        ? planSaveDatabaseSorts(
            state,
            input.sorts.map((sort) => ({
              column: resolveColumnId(properties, sort.property),
              direction: sort.direction,
            })),
          )
        : rejectPlan("unchanged"),
      input.propertyOrder
        ? planSaveDatabasePropertyOrder(
            state,
            input.propertyOrder.map((reference) => resolveColumnId(properties, reference)),
          )
        : rejectPlan("unchanged"),
      input.name ? planRenameView(state, input.name) : rejectPlan("unchanged"),
    );
  });
}

// Rows

const addRowsInput = target.extend({ rows: z.array(rowInputSchema).min(1).max(100) });

function rowValues(
  properties: DatabasePropertyEntity[],
  values: Record<string, z.infer<typeof cellValueSchema>> = {},
) {
  return Object.entries(values).map(([reference, value]) => {
    const property = resolveProperty(properties, reference);
    return { propertyId: property.property.id, value: resolveCellValue(property, value) };
  });
}

function planAddRowsAction(state: DatabaseActionState, input: z.infer<typeof addRowsInput>): Plan {
  return (
    guard(state) ??
    withResolution(() => {
      const properties = sourceProperties(state);
      return {
        steps: input.rows.map((row, index) => {
          const values = rowValues(properties, row.values);
          return {
            id: `row-${index}`,
            op: "addRow",
            input: () => ({
              databaseId: state.dataSourceId!,
              ...(state.hostDatabaseId ? { hostDatabaseId: state.hostDatabaseId } : {}),
              title: row.title ?? "",
              ...(values.length ? { initialValues: values } : {}),
            }),
          } satisfies Step;
        }),
      };
    })
  );
}

const updateRowsInput = target.extend({
  updates: z
    .array(rowInputSchema.extend({ rowId: z.string().trim().min(1).max(128) }))
    .min(1)
    .max(100),
});

function planUpdateRowsAction(
  state: DatabaseActionState,
  input: z.infer<typeof updateRowsInput>,
): Plan {
  return (
    guard(state) ??
    withResolution(() => {
      const properties = sourceProperties(state);
      return {
        steps: input.updates.map((update, index) => {
          const values = rowValues(properties, update.values);
          return {
            id: `row-${index}`,
            op: "changeRow",
            input: () => ({
              databaseId: state.hostDatabaseId ?? state.dataSourceId!,
              dataSourceId: state.dataSourceId!,
              rowId: update.rowId,
              ...(update.title !== undefined ? { title: update.title } : {}),
              ...(values.length
                ? {
                    valuesByPropertyId: Object.fromEntries(
                      values.map((value) => [value.propertyId, value.value]),
                    ),
                  }
                : {}),
            }),
          } satisfies Step;
        }),
      };
    })
  );
}

const rowIdsInput = target.extend({
  rowIds: z.array(z.string().trim().min(1).max(128)).min(1).max(100),
});

function rowStatePlan(op: "archiveRow" | "restoreRow" | "duplicateRow") {
  return (state: DatabaseActionState, input: z.infer<typeof rowIdsInput>): Plan =>
    guard(state) ?? {
      steps: input.rowIds.map((rowId, index): Step => ({
        id: `row-${index}`,
        op,
        input: () => ({
          databaseId: state.dataSourceId!,
          ...(state.hostDatabaseId ? { hostDatabaseId: state.hostDatabaseId } : {}),
          rowId,
        }),
      })),
    };
}

const writeAction = <I>(
  action: Omit<
    WriteAction<I, DatabaseActionState, DatabaseActionOps>,
    "kind" | "scopes" | "needs"
  > &
    Partial<Pick<WriteAction<I, DatabaseActionState, DatabaseActionOps>, "needs">>,
): WriteAction<I, DatabaseActionState, DatabaseActionOps> => ({
  kind: "write",
  scopes: ["databases.write"],
  needs: needsDatabase() as WriteAction<I, DatabaseActionState, DatabaseActionOps>["needs"],
  ...action,
});

export const databaseWriteActions = [
  {
    kind: "write",
    name: "databases.create",
    group: "databases.schema",
    title: "Create database",
    description:
      "Create a database with properties and rows, or from a template. Add views afterwards with databases.add_view.",
    input: createDatabaseInput,
    effect: "write",
    scopes: ["databases.write"],
    milestone: "A",
    covers: ["database.create", "template.apply"],
    needs: () => ({}),
    plan: (state: unknown, input: CreateDatabaseActionInput) =>
      planCreateDatabase(state as { workspaceId: string }, input),
  } satisfies WriteAction<CreateDatabaseActionInput, unknown, DatabaseActionOps>,
  writeAction({
    name: "databases.update",
    group: "databases.schema",
    title: "Rename database",
    description: "Rename a database or change its emoji.",
    input: updateDatabaseInput,
    effect: "write",
    milestone: "A",
    covers: ["dataSource.update"],
    plan: (state, input) =>
      guard(state) ??
      chain(
        input.name ? planSaveDatabaseTitle(state, input.name) : rejectPlan("unchanged"),
        input.emoji ? planSaveDatabaseEmoji(state, input.emoji) : rejectPlan("unchanged"),
      ),
  }),
  writeAction({
    name: "databases.add_property",
    group: "databases.schema",
    title: "Add property",
    description:
      "Add a property (column). Give select/status options, number formats, formulas, relations or rollups in config.",
    input: addPropertyInput,
    effect: "write",
    milestone: "A",
    covers: ["property.create"],
    plan: planAddPropertyAction,
  }),
  writeAction({
    name: "databases.update_property",
    group: "databases.schema",
    title: "Update property",
    description:
      "Rename a property or change its configuration (options, formats, formula, relation, rollup).",
    input: updatePropertyInput,
    effect: "write",
    milestone: "A",
    covers: ["property.update", "row.change"],
    plan: planUpdatePropertyAction,
  }),
  writeAction({
    name: "databases.add_view",
    group: "databases.views",
    title: "Add view",
    description:
      "Add a table, kanban (board), list, gallery, timeline, calendar, chart or form view. Required group or date properties are created when missing.",
    input: addViewInput,
    effect: "write",
    milestone: "A",
    covers: ["view.create", "property.create"],
    plan: planAddViewAction,
  }),
  writeAction({
    name: "databases.configure_view",
    group: "databases.views",
    title: "Configure view",
    description:
      "Change a view's layout, grouping, date property, filters, sorts, property order or name.",
    input: configureViewInput,
    effect: "write",
    milestone: "A",
    covers: ["view.update", "property.create"],
    needs: (input) => ({ database: { ...input, records: false } }),
    plan: planConfigureViewAction,
  }),
  writeAction({
    name: "databases.add_rows",
    group: "databases.rows",
    title: "Add rows",
    description: "Add up to 100 rows with titles and property values.",
    input: addRowsInput,
    effect: "write",
    milestone: "A",
    covers: ["row.place"],
    plan: planAddRowsAction,
  }),
  writeAction({
    name: "databases.update_rows",
    group: "databases.rows",
    title: "Update rows",
    description:
      "Update titles and property values of up to 100 rows. Find row IDs with databases.query_records first.",
    input: updateRowsInput,
    effect: "write",
    milestone: "A",
    covers: ["row.change"],
    plan: planUpdateRowsAction,
  }),
  writeAction({
    name: "databases.duplicate_rows",
    group: "databases.rows",
    title: "Duplicate rows",
    description: "Duplicate rows, including their page content.",
    input: rowIdsInput,
    effect: "write",
    milestone: "A",
    covers: ["row.duplicate"],
    plan: rowStatePlan("duplicateRow"),
  }),
  writeAction({
    name: "databases.restore_rows",
    group: "databases.rows",
    title: "Restore rows",
    description: "Restore archived rows.",
    input: rowIdsInput,
    effect: "write",
    milestone: "A",
    covers: ["row.restore"],
    plan: rowStatePlan("restoreRow"),
  }),
  writeAction({
    name: "databases.archive_rows",
    group: "databases.rows",
    title: "Archive rows",
    description: "Move rows to trash.",
    input: rowIdsInput,
    effect: "destructive",
    milestone: "D",
    covers: ["row.archive"],
    plan: rowStatePlan("archiveRow"),
  }),
  writeAction({
    name: "databases.delete_property",
    group: "databases.schema",
    title: "Delete property",
    description: "Archive a property and hide its values.",
    input: target.extend({ property: propertyRefSchema }),
    effect: "destructive",
    milestone: "D",
    covers: ["property.archive"],
    plan: (state, input) =>
      guard(state) ??
      withResolution(() => ({
        steps: [
          {
            op: "archiveProperty",
            input: () => ({
              databaseId: state.dataSourceId!,
              databasePropertyId: resolveProperty(sourceProperties(state), input.property).id,
            }),
          },
        ],
      })),
  }),
  writeAction({
    name: "databases.favorite",
    group: "databases.schema",
    title: "Favorite database",
    description: "Add a database to or remove it from your favorites.",
    input: hostInput.extend({ favorite: z.boolean() }),
    effect: "write",
    milestone: "A",
    covers: ["database.favorite"],
    plan: (state, input) =>
      guard(state) ?? {
        steps: [
          {
            op: "setDatabaseFavorite",
            input: () => ({ databaseId: input.databaseId, isFavorite: input.favorite }),
          },
        ],
      },
  }),
  writeAction({
    name: "databases.restore",
    group: "databases.schema",
    title: "Restore database",
    description: "Restore a database from trash.",
    input: hostInput,
    effect: "write",
    milestone: "A",
    covers: ["database.restore"],
    needs: (input) => ({ database: { databaseId: input.databaseId, includeDeleted: true } }),
    plan: hostPlan("restoreDatabase"),
  }),
  writeAction({
    name: "databases.delete",
    group: "databases.schema",
    title: "Delete database",
    description: "Move a database to trash.",
    input: hostInput,
    effect: "destructive",
    milestone: "D",
    covers: ["database.archive"],
    plan: hostPlan("deleteDatabase"),
  }),
  writeAction({
    name: "databases.add_data_source",
    group: "databases.schema",
    title: "Add data source",
    description: "Add another data source to a database, blank or from a template.",
    input: hostInput.extend({
      name: z.string().trim().min(1).max(200).optional(),
      template: createDatabaseInput.shape.template,
    }),
    effect: "write",
    milestone: "A",
    covers: ["dataSource.create", "template.apply"],
    plan: (state, input) =>
      guard(state) ??
      asActionPlan(
        planSetupDataSource(
          state.hostDatabaseId ?? input.databaseId,
          {
            databaseName: input.name,
            templateId: (input.template ?? null) as DatabaseSetupTemplateId | null,
          },
          () => null,
        ),
      ),
  }),
  writeAction({
    name: "databases.link_data_source",
    group: "databases.views",
    title: "Link data source",
    description: "Show another database's data source in this database through a new view.",
    input: hostInput.extend({
      sourceId: z.string().trim().min(1).max(128).describe("Data source to link."),
      type: viewTypeSchema.default("table"),
      name: z.string().trim().min(1).max(100).default("Table"),
    }),
    effect: "write",
    milestone: "A",
    covers: ["dataSource.link"],
    plan: (state, input) =>
      guard(state) ??
      asActionPlan(
        planAddDataSourceView(sourceState(state), {
          dataSourceId: input.sourceId,
          type: input.type,
          viewName: input.name,
        }),
      ),
  }),
  writeAction({
    name: "databases.unlink_data_source",
    group: "databases.views",
    title: "Unlink data source",
    description: "Remove a linked data source and its views from this database.",
    input: hostInput.extend({ sourceId: z.string().trim().min(1).max(128) }),
    effect: "destructive",
    milestone: "D",
    covers: ["dataSource.unlink", "view.delete"],
    plan: (state, input) => asActionPlan(planUnlinkDataSource(sourceState(state), input.sourceId)),
  }),
  writeAction({
    name: "databases.replace_view_source",
    group: "databases.views",
    title: "Replace view source",
    description: "Point an existing view at another data source.",
    input: view.extend({ sourceId: z.string().trim().min(1).max(128) }),
    effect: "destructive",
    milestone: "D",
    covers: ["view.setDataSource"],
    plan: (state, input) => asActionPlan(planReplaceViewSource(sourceState(state), input.sourceId)),
  }),
  writeAction({
    name: "databases.move_view",
    group: "databases.views",
    title: "Move view",
    description: "Reorder a view tab; position 0 is first.",
    input: view.extend({ position: z.number().int().min(0) }),
    effect: "write",
    milestone: "A",
    covers: ["view.move"],
    plan: (state, input) => {
      const blocked = guard(state);
      if (blocked) return blocked;
      const ids = (state.viewData?.bootstrap.views ?? []).map(({ id }) => id);
      const { after, before } = neighbors(ids, input.viewId, input.position);
      return {
        steps: [
          {
            op: "moveView",
            input: () => ({
              databaseId: state.hostDatabaseId ?? input.databaseId,
              databaseViewId: input.viewId,
              afterViewId: after,
              beforeViewId: before,
            }),
          },
        ],
      };
    },
  }),
  writeAction({
    name: "databases.delete_view",
    group: "databases.views",
    title: "Delete view",
    description: "Delete a view; its data source and rows remain.",
    input: view,
    effect: "destructive",
    milestone: "D",
    covers: ["view.delete"],
    plan: (state, input) =>
      asActionPlan(
        planDeleteView(
          { ...sourceState(state), viewCount: state.viewData?.bootstrap.views.length ?? 0 },
          input.viewId,
        ),
      ),
  }),
  writeAction({
    name: "databases.move_property",
    group: "databases.schema",
    title: "Move property",
    description: "Reorder a property in its data source; position 0 is first.",
    input: target.extend({ property: propertyRefSchema, position: z.number().int().min(0) }),
    effect: "write",
    milestone: "A",
    covers: ["property.move"],
    plan: (state, input) =>
      guard(state) ??
      withResolution(() => {
        const properties = [...sourceProperties(state)].sort((a, b) => a.position - b.position);
        const moved = resolveProperty(properties, input.property);
        const { after, before } = neighbors(
          properties.map(({ id }) => id),
          moved.id,
          input.position,
        );
        return {
          steps: [
            {
              op: "moveProperty",
              input: () => ({
                databaseId: state.dataSourceId!,
                databasePropertyId: moved.id,
                afterPropertyId: after,
                beforePropertyId: before,
              }),
            },
          ],
        };
      }),
  }),
  writeAction({
    name: "databases.duplicate_property",
    group: "databases.schema",
    title: "Duplicate property",
    description: "Duplicate a property's configuration.",
    input: target.extend({ property: propertyRefSchema }),
    effect: "write",
    milestone: "A",
    covers: ["property.duplicate"],
    plan: propertyPlan("duplicateProperty"),
  }),
  writeAction({
    name: "databases.restore_property",
    group: "databases.schema",
    title: "Restore property",
    description: "Restore an archived property.",
    input: target.extend({ property: propertyRefSchema }),
    effect: "write",
    milestone: "A",
    covers: ["property.restore"],
    plan: propertyPlan("restoreProperty"),
  }),
  writeAction({
    name: "databases.create_template",
    group: "templates",
    title: "Create row template",
    description: "Save a row template with default values.",
    input: target.extend({
      name: z.string().trim().min(1).max(100),
      template: z.record(z.string(), cellValueSchema),
    }),
    effect: "write",
    milestone: "A",
    covers: ["template.create"],
    plan: (state, input) =>
      guard(state) ?? {
        steps: [
          {
            op: "createTemplate",
            input: () => ({ ...templateScope(state), name: input.name, template: input.template }),
          },
        ],
      },
  }),
  writeAction({
    name: "databases.update_template",
    group: "templates",
    title: "Update row template",
    description: "Change a row template's defaults.",
    input: templateTarget.extend({ patch: z.record(z.string(), cellValueSchema) }),
    effect: "write",
    milestone: "A",
    covers: ["template.update"],
    plan: (state, input) =>
      guard(state) ?? {
        steps: [
          {
            op: "updateTemplate",
            input: () => ({
              ...templateScope(state),
              templateId: input.templateId,
              patch: input.patch,
            }),
          },
        ],
      },
  }),
  writeAction({
    name: "databases.restore_template",
    group: "templates",
    title: "Restore row template",
    description: "Restore an archived row template.",
    input: templateTarget,
    effect: "write",
    milestone: "A",
    covers: ["template.restore"],
    plan: (state, input) =>
      guard(state) ?? {
        steps: [
          {
            op: "restoreTemplate",
            input: () => ({ ...templateScope(state), templateId: input.templateId }),
          },
        ],
      },
  }),
  writeAction({
    name: "databases.archive_template",
    group: "templates",
    title: "Archive row template",
    description: "Archive a row template.",
    input: templateTarget,
    effect: "destructive",
    milestone: "D",
    covers: ["template.archive"],
    plan: (state, input) =>
      guard(state) ?? {
        steps: [
          {
            op: "archiveTemplate",
            input: () => ({ ...templateScope(state), templateId: input.templateId }),
          },
        ],
      },
  }),
] as const;

export const databaseActions = [...databaseReadActions, ...databaseWriteActions];
