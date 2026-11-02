import { isPlanRejection, runPlan } from "../../actions/plan";
import type { ClientOperationContext } from "../../shared/operation-context";
import type { DatabaseBootstrapResponse, DatabaseViewEntity } from "../core/entities";
import {
  planAddDataSourceView,
  planDeleteView,
  planDuplicateView,
  planLinkDataSourceView,
  planReplaceViewSource,
  planSaveViewIcon,
  planUnlinkDataSource,
  type DatabaseSetupSelection,
  type DatabaseSourceOps,
  type DatabaseSourcePlan,
  type DatabaseSourceState,
  type DatabaseSourceViewSelection,
} from "../planners/sources";
import type { DatabaseViewType } from "../planners/views";
import { setupDatabaseSource } from "./source-workflows";
type SourceOperations = typeof import("../mutations/data-sources-operations");
type ViewOperations = typeof import("../mutations/views-operations");
type PropertyOperations = typeof import("../mutations/properties-operations");
type Callback<T extends (...args: never[]) => unknown> = (input: Parameters<T>[1]) => ReturnType<T>;

/** Binds data source and view-tab planners to the client's mutation callbacks. */
export function createDatabaseSourceCommands({
  context,
  pending = {},
  databaseId,
  editable,
  bootstrap,
  resolvedActiveViewId,
  activeViewTabId,
  viewTabs,
  updateDatabaseView,
  addDatabaseView,
  linkDatabaseDataSource,
  replaceDatabaseViewDataSource,
  unlinkDatabaseDataSource,
  deleteDatabaseView,
  onViewSelected,
  notify,
  createSampleRowContent,
}: {
  context: ClientOperationContext;
  pending?: Partial<
    Record<
      | "updateDatabase"
      | "applyDataSourceTemplate"
      | "createDataSource"
      | "updateDatabaseView"
      | "addDatabaseView"
      | "linkDatabaseDataSource"
      | "replaceDatabaseViewDataSource"
      | "unlinkDatabaseDataSource"
      | "deleteDatabaseView",
      boolean
    >
  >;
  databaseId: string | null | undefined;
  editable: boolean;
  bootstrap: DatabaseBootstrapResponse | undefined;
  resolvedActiveViewId: string | null;
  activeViewTabId: string | null;
  viewTabs: { id: string }[];
  updateDatabase: Callback<SourceOperations["updateDataSource"]>;
  applyDataSourceTemplate: Callback<PropertyOperations["applyDatabaseTemplate"]>;
  createDataSource: Callback<SourceOperations["createDatabaseDataSource"]>;
  updateDatabaseView: Callback<ViewOperations["updateDatabaseView"]>;
  addDatabaseView: Callback<ViewOperations["addDatabaseView"]>;
  linkDatabaseDataSource: Callback<SourceOperations["linkDatabaseDataSource"]>;
  replaceDatabaseViewDataSource: Callback<SourceOperations["replaceDatabaseViewDataSource"]>;
  unlinkDatabaseDataSource: Callback<SourceOperations["unlinkDatabaseDataSource"]>;
  deleteDatabaseView: Callback<ViewOperations["deleteDatabaseView"]>;
  onViewSelected: (id: string | null) => void;
  notify: { success: (message: string) => void; error: (message: string) => void };
  createSampleRowContent: (markdown: string) => unknown;
}) {
  const state: DatabaseSourceState = {
    databaseId,
    editable,
    bootstrap,
    activeViewId: resolvedActiveViewId,
  };
  const ops = {
    addDatabaseView,
    deleteDatabaseView,
    linkDatabaseDataSource,
    replaceDatabaseViewDataSource,
    unlinkDatabaseDataSource,
    updateDatabaseView,
  } as Partial<DatabaseSourceOps> as DatabaseSourceOps;
  const run = (outcome: DatabaseSourcePlan, sequential = false) => {
    if (isPlanRejection(outcome)) {
      if (outcome.message) notify.error(outcome.message);
      return null;
    }
    return runPlan(outcome, ops, {
      sequential,
      onSelect: (view) => onViewSelected((view as DatabaseViewEntity).id),
    });
  };
  /** Runs a plan to completion and reports the first failure like the previous workflows. */
  const attempt = async (
    outcome: DatabaseSourcePlan,
    fallbackMessage: string,
    onCompleted: (last: unknown) => void,
  ) => {
    const result = await run(outcome, true);
    if (!result) return;
    if (result.status === "completed") return onCompleted(result.last);
    notify.error(result.error instanceof Error ? result.error.message : fallbackMessage);
  };

  const linkDataSourceView = (selection: DatabaseSourceViewSelection) => {
    if (pending.linkDatabaseDataSource) return;
    void run(planLinkDataSourceView(state, selection))?.then((result) => {
      if (result.status !== "completed") return;
      const { view } = result.last as { view: DatabaseViewEntity };
      onViewSelected(view.id);
      notify.success("Data source linked.");
    });
  };

  const unlinkDataSource = async (dataSourceId: string) => {
    if (pending.unlinkDatabaseDataSource || pending.deleteDatabaseView) return;
    const outcome = planUnlinkDataSource(state, dataSourceId);
    await attempt(outcome, "Could not remove the linked data source.", () => {
      onViewSelected(("fallbackViewId" in outcome ? outcome.fallbackViewId : null) ?? null);
      notify.success("Linked data source removed.");
    });
  };

  const replaceActiveViewSource = async (selection: DatabaseSourceViewSelection) => {
    if (pending.replaceDatabaseViewDataSource) return;
    const outcome = planReplaceViewSource(state, selection.dataSourceId);
    if (isPlanRejection(outcome)) return;
    const result = await runPlan(outcome, ops, { sequential: true });
    if (result.error !== undefined) throw result.error;
    onViewSelected(resolvedActiveViewId);
    notify.success("View source replaced.");
  };

  const addDataSourceView = async (
    dataSourceId: string,
    type: DatabaseViewType,
    viewName: string,
    mode: "add" | "replace" = "add",
  ) => {
    if (pending.linkDatabaseDataSource || pending.replaceDatabaseViewDataSource) return;
    await attempt(
      planAddDataSourceView(state, { dataSourceId, type, viewName, mode }),
      "Could not add the view.",
      (last) => {
        if (mode === "replace") return notify.success("View source replaced.");
        onViewSelected((last as { view: DatabaseViewEntity }).view.id);
        notify.success(`${viewName} view added.`);
      },
    );
  };

  const handleDataSourceSetupSelection = async (selection: DatabaseSetupSelection) => {
    if (!editable || !databaseId || pending.createDataSource || pending.updateDatabase) {
      return;
    }

    try {
      const created = await setupDatabaseSource(context, {
        databaseId,
        selection,
        createSampleRowContent,
      });
      onViewSelected(created.view.id);
      notify.success("Data source added.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not add the data source.");
    }
  };

  const saveDatabaseViewIcon: (view: { id: string }, nextIcon: string) => void = (
    view,
    nextIcon,
  ) => {
    void run(planSaveViewIcon(state, view.id, nextIcon));
  };

  const duplicateDatabaseView = (view: { id: string }) => {
    if (pending.addDatabaseView || pending.updateDatabase) return;
    void run(planDuplicateView(state, view.id));
  };

  const deleteDatabaseViewByTab = (view: { id: string }) => {
    if (!databaseId || pending.deleteDatabaseView) return;
    const nextActiveViewId =
      activeViewTabId === view.id
        ? (viewTabs.find((viewTab) => viewTab.id !== view.id)?.id ?? null)
        : activeViewTabId;
    void run(planDeleteView({ ...state, viewCount: viewTabs.length }, view.id))?.then((result) => {
      if (result.status === "completed") onViewSelected(nextActiveViewId);
    });
  };

  return {
    linkDataSourceView,
    unlinkDataSource,
    replaceActiveViewSource,
    addDataSourceView,
    handleDataSourceSetupSelection,
    saveDatabaseViewIcon,
    duplicateDatabaseView,
    deleteDatabaseViewByTab,
  };
}
