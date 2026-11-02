import { rejectPlan, type PlanOutcome, type PlanStep } from "../../actions/plan";
import type { DatabaseBootstrapResponse, DatabaseViewEntity } from "../core/entities";
import { diffConfiguration } from "../interactions/configuration";
import type {
  CreateDatabaseDataSourceInput,
  CreateDatabaseDataSourceResult,
  LinkDatabaseDataSourceInput,
  LinkDatabaseDataSourceResult,
  ReplaceDatabaseViewDataSourceInput,
  ReplaceDatabaseViewDataSourceResult,
  UnlinkDatabaseDataSourceInput,
  UnlinkDatabaseDataSourceResult,
} from "../mutations/data-sources-operations";
import type {
  ApplyDatabaseTemplateInput,
  ApplyDatabaseTemplateResult,
} from "../mutations/properties-operations";
import type {
  AddDatabaseViewInput,
  AddDatabaseViewResult,
  DeleteDatabaseViewInput,
  DeleteDatabaseViewResult,
  UpdateDatabaseViewInput,
  UpdateDatabaseViewResult,
} from "../mutations/views-operations";
import { getDatabaseSetupTemplate, type DatabaseSetupTemplateId } from "../templates/definitions";
import { databaseCsvPayload, databaseTemplateRows } from "../templates/payload";
import { getMergedDatabaseConfig } from "../views/configuration";

/** Host-level source and view-tab operations, named like the UI's mutation callbacks. */
export type DatabaseSourceOps = {
  addDatabaseView: (input: AddDatabaseViewInput) => Promise<AddDatabaseViewResult>;
  applyDataSourceTemplate: (
    input: ApplyDatabaseTemplateInput,
  ) => Promise<ApplyDatabaseTemplateResult>;
  createDataSource: (
    input: CreateDatabaseDataSourceInput,
  ) => Promise<CreateDatabaseDataSourceResult>;
  deleteDatabaseView: (input: DeleteDatabaseViewInput) => Promise<DeleteDatabaseViewResult>;
  linkDatabaseDataSource: (
    input: LinkDatabaseDataSourceInput,
  ) => Promise<LinkDatabaseDataSourceResult>;
  replaceDatabaseViewDataSource: (
    input: ReplaceDatabaseViewDataSourceInput,
  ) => Promise<ReplaceDatabaseViewDataSourceResult>;
  unlinkDatabaseDataSource: (
    input: UnlinkDatabaseDataSourceInput,
  ) => Promise<UnlinkDatabaseDataSourceResult>;
  updateDatabaseView: (input: UpdateDatabaseViewInput) => Promise<UpdateDatabaseViewResult>;
};
export type DatabaseSourcePlan = PlanOutcome<DatabaseSourceOps>;
type SourceStep = PlanStep<DatabaseSourceOps>;

export type DatabaseSourceViewSelection = {
  dataSourceId: string;
  dataSourceName: string;
  parentDatabaseId: string;
  viewConfig?: unknown;
  viewIcon?: string;
  viewId: string;
  viewName: string;
  viewType: string;
};
export type DatabaseSetupSelection = {
  csvImport?: { headers: string[]; name: string; rows: string[][] };
  databaseName?: string;
  sourceView?: DatabaseSourceViewSelection;
  templateId?: DatabaseSetupTemplateId | null;
};

export type DatabaseSourceState = {
  /** Host database whose sources and views are managed. */
  databaseId: string | null | undefined;
  editable: boolean;
  bootstrap: DatabaseBootstrapResponse | undefined;
  activeViewId: string | null;
};

/**
 * Creates (or links) a source, then applies its template or CSV rows. The
 * `source` step result is the created source and its first view.
 */
export function planSetupDataSource(
  databaseId: string,
  selection: DatabaseSetupSelection,
  createSampleRowContent: (markdown: string) => unknown,
): DatabaseSourcePlan {
  if (selection.sourceView) {
    const view = selection.sourceView;
    return {
      steps: [
        {
          id: "source",
          op: "linkDatabaseDataSource",
          input: () => ({
            databaseId,
            config: view.viewConfig,
            dataSourceId: view.dataSourceId,
            name: view.viewName,
            type: view.viewType,
          }),
        },
      ],
    };
  }
  const template = selection.templateId ? getDatabaseSetupTemplate(selection.templateId) : null;
  const name =
    selection.databaseName || selection.csvImport?.name || template?.name || "New data source";
  const created = (done: Parameters<SourceStep["input"]>[0]) =>
    done.get<CreateDatabaseDataSourceResult>("source").dataSource;
  const steps: SourceStep[] = [
    { id: "source", op: "createDataSource", input: () => ({ databaseId, name }) },
  ];
  if (selection.csvImport) {
    const csv = selection.csvImport;
    steps.push({
      op: "applyDataSourceTemplate",
      input: (done) => ({
        config: getMergedDatabaseConfig(created(done).config, { setupDismissed: true }),
        databaseId: created(done).id,
        hostDatabaseId: databaseId,
        name,
        ...databaseCsvPayload(csv),
      }),
    });
  } else if (template) {
    steps.push({
      op: "applyDataSourceTemplate",
      input: (done) => ({
        config: getMergedDatabaseConfig(created(done).config, {
          emoji: template.emoji,
          setupDismissed: true,
        }),
        databaseId: created(done).id,
        hostDatabaseId: databaseId,
        name,
        properties: template.properties,
        rows: databaseTemplateRows(
          template,
          new Map(
            template.properties.map((property) => [property.name.toLowerCase(), property.type]),
          ),
          createSampleRowContent,
          (emoji) => ({ emoji }),
        ),
      }),
    });
  }
  return { steps };
}

export function planLinkDataSourceView(
  state: DatabaseSourceState,
  selection: DatabaseSourceViewSelection,
): DatabaseSourcePlan {
  if (!state.databaseId) return rejectPlan("no_database");
  const databaseId = state.databaseId;
  return {
    steps: [
      {
        id: "link",
        op: "linkDatabaseDataSource",
        input: () => ({
          databaseId,
          config: selection.viewConfig,
          dataSourceId: selection.dataSourceId,
          name: selection.viewName,
          type: selection.viewType,
        }),
      },
    ],
  };
}

export function planAddDataSourceView(
  state: DatabaseSourceState,
  input: { dataSourceId: string; type: string; viewName: string; mode?: "add" | "replace" },
): DatabaseSourcePlan {
  if (!state.databaseId || !state.editable) return rejectPlan("not_editable");
  const databaseId = state.databaseId;
  if (input.mode === "replace") {
    if (!state.activeViewId) return rejectPlan("no_active_view");
    const databaseViewId = state.activeViewId;
    return {
      steps: [
        {
          id: "replace",
          op: "replaceDatabaseViewDataSource",
          input: () => ({ databaseId, databaseViewId, dataSourceId: input.dataSourceId }),
        },
      ],
    };
  }
  return {
    steps: [
      {
        id: "link",
        op: "linkDatabaseDataSource",
        input: () => ({
          databaseId,
          dataSourceId: input.dataSourceId,
          name: input.viewName,
          type: input.type,
        }),
      },
    ],
  };
}

export function planReplaceViewSource(
  state: DatabaseSourceState,
  dataSourceId: string,
): DatabaseSourcePlan {
  if (!state.databaseId || !state.activeViewId || !state.editable)
    return rejectPlan("not_editable");
  return planAddDataSourceView(state, { dataSourceId, type: "", viewName: "", mode: "replace" });
}

/** Removes a linked (not owned) source together with its views. */
export function planUnlinkDataSource(
  state: DatabaseSourceState,
  dataSourceId: string,
): DatabaseSourcePlan & { fallbackViewId?: string | null } {
  if (!state.databaseId || !state.editable) return rejectPlan("not_editable");
  const databaseId = state.databaseId;
  const source = state.bootstrap?.dataSources.find((candidate) => candidate.id === dataSourceId);
  if (!source || source.parentDatabaseId === databaseId) return rejectPlan("not_linked");
  const views = state.bootstrap?.views ?? [];
  return {
    fallbackViewId: views.find((view) => view.dataSourceId !== dataSourceId)?.id ?? null,
    steps: [
      ...views
        .filter((view) => view.dataSourceId === dataSourceId)
        .map((view): SourceStep => ({
          op: "deleteDatabaseView",
          input: () => ({ databaseId, databaseViewId: view.id }),
        })),
      {
        op: "unlinkDatabaseDataSource",
        input: () => ({ databaseId, dataSourceId }),
      },
    ],
  };
}

function findView(state: DatabaseSourceState, viewId: string): DatabaseViewEntity | undefined {
  return state.bootstrap?.views.find((view) => view.id === viewId);
}

export function planSaveViewIcon(
  state: DatabaseSourceState,
  viewId: string,
  icon: string,
): DatabaseSourcePlan {
  if (!state.editable || !state.databaseId) return rejectPlan("not_editable");
  const databaseId = state.databaseId;
  const view = findView(state, viewId);
  if (!view) return rejectPlan("view_missing");
  return {
    steps: [
      {
        op: "updateDatabaseView",
        input: () => ({
          configuration: diffConfiguration(
            view.config,
            getMergedDatabaseConfig(view.config, { icon }),
          ),
          databaseId,
          databaseViewId: view.id,
        }),
      },
    ],
  };
}

export function planDuplicateView(state: DatabaseSourceState, viewId: string): DatabaseSourcePlan {
  if (!state.databaseId) return rejectPlan("no_database");
  const databaseId = state.databaseId;
  const view = findView(state, viewId);
  if (!view) return rejectPlan("view_missing");
  return {
    select: "view",
    steps: [
      {
        id: "view",
        op: "addDatabaseView",
        input: () => ({
          config: view.config,
          databaseId,
          dataSourceId: view.dataSourceId,
          name: `${view.name} copy`,
          type: view.type,
        }),
        admit: "optimistic",
      },
    ],
  };
}

export function planDeleteView(
  state: DatabaseSourceState & { viewCount: number },
  viewId: string,
): DatabaseSourcePlan {
  if (!state.databaseId) return rejectPlan("no_database");
  if (state.viewCount <= 1)
    return rejectPlan("last_view", "A database must always have at least one view.");
  const databaseId = state.databaseId;
  return {
    steps: [{ op: "deleteDatabaseView", input: () => ({ databaseId, databaseViewId: viewId }) }],
  };
}
